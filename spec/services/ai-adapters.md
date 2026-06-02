# Service — AI Adapters (Document AI + Gemini)

## Purpose

Two thin, swappable adapters: one for **Google Document AI** (OCR + layout) and one for **Gemini** (structured extraction and page classification). Both live behind internal interfaces so the orchestrator in [workflows/ai-processing.md](../workflows/ai-processing.md) is vendor-agnostic in shape.

Combined in one spec because both are stateless HTTP clients with near-identical operational concerns.

## Responsibilities

- Authenticate with Google / Gemini.
- Translate between our internal shapes and vendor payloads.
- Enforce timeouts, retry transient errors, surface stable error codes.
- Capture per-call cost metadata for observability (tokens, pages).
- Keep prompts version-controlled and testable.

Out of scope here:

- Orchestration (that's `workflows/ai-processing.md`).
- Business rules on relevance (defined in [credits.md](../credits.md) and `workflows/ai-processing.md`, referenced here).
- Persistence of outputs (done by the orchestrator in a single transaction).

## Interfaces

Both adapters expose typed functions. These are the contracts the orchestrator depends on.

### Document AI adapter

```ts
interface DocumentAIAdapter {
  ocr(input: OcrRequest): Promise<OcrResult>;
}

type OcrRequest = {
  tenant_id: string;
  document_id: string;
  run_id: string;
  bytes: Uint8Array; // the PDF/image
  mime_type: string;
};

type OcrResult = {
  page_count: number;
  pages: Array<{
    page_number: number;
    text: string;
    layout: {
      blocks: Array<{ text: string; bbox: [number, number, number, number] }>;
    };
    detected_language?: string;
    confidence: number; // avg page OCR confidence
  }>;
  meta: {
    processor_version: string;
    duration_ms: number;
  };
};
```

### Gemini adapter

```ts
interface GeminiAdapter {
  classifyPages(input: ClassifyRequest): Promise<ClassifyResult>;
  extract(input: ExtractRequest): Promise<ExtractResult>;
}

type ClassifyRequest = {
  tenant_id: string;
  document_id: string;
  run_id: string;
  pages: Array<{ page_number: number; text: string; layout_summary: string }>;
};

type ClassifyResult = {
  pages: Array<{
    page_number: number;
    page_type:
      | "cover"
      | "body"
      | "line_items"
      | "signature"
      | "legal"
      | "blank"
      | "duplicate"
      | "other";
    is_relevant: boolean;
    confidence: number;
  }>;
  meta: { model: string; tokens_in: number; tokens_out: number; duration_ms: number };
};

type ExtractRequest = {
  tenant_id: string;
  document_id: string;
  run_id: string;
  combined_text: string; // text of relevant pages, concatenated in order
  schema_version: number; // currently 1
  locale: "en" | "es"; // for date-format hints
};

type ExtractResult = {
  payload: ExtractedPayload; // conforms to extractions.payload shape
  confidence: number;
  meta: { model: string; tokens_in: number; tokens_out: number; duration_ms: number };
};
```

`ExtractedPayload` matches `normalized` shape in [data.md](../data.md#extractions) (pre-normalization — the orchestrator normalizes dates/numbers).

## Document AI details

### Config

- Google Cloud project + **Processor ID** provisioned per environment.
- Processor type: `OCR_PROCESSOR` (general). `FORM_PARSER_PROCESSOR` considered for the future — gives form-field K/V which could reduce Gemini's job, but adds per-tenant tuning complexity. Phase 1: general OCR only.
- Service account key in Edge Function secret `GCP_DOCAI_KEY_JSON`.

### Call shape

- HTTP POST to `projects/{project}/locations/{region}/processors/{processorId}:process`.
- Sync API (not batch) — batch is for > 15 pages and adds async/callbacks; Phase 1 docs are mostly small enough.
- Fallback to **batch** if input is > 15 pages or sync response 5xxs with `INVALID_ARGUMENT: too large`. Batch uses GCS staging bucket (provisioned per environment).

### Timeouts & retries

- Timeout: 45s per call.
- Retries: 2 with exponential backoff on 5xx, network errors.
- Non-retryable: 4xx (bad request, auth, quota). Surface as stable error codes.

### Error codes

| Code                     | Cause                             |
| ------------------------ | --------------------------------- |
| `docai_auth`             | Service account invalid           |
| `docai_quota`            | Per-project quota exhausted       |
| `docai_too_large`        | Document exceeds processor limits |
| `docai_unsupported_mime` | MIME not supported by processor   |
| `docai_timeout`          | Exceeded our 45s cap              |
| `docai_empty`            | Zero-length text across all pages |
| `docai_unknown`          | 5xx after retries                 |

### Cost

- Document AI charges per page. We log `page_count` per call for cost attribution by tenant.

## Gemini details

### Config

- API key in Edge Function secret `GEMINI_API_KEY`.
- Model: `gemini-2.5-pro` for extraction (highest accuracy); `gemini-2.5-flash` for classification (faster, cheaper, good enough for per-page labeling).
- Both callers use **structured output mode** (response schema) — we never parse free-text.
- Temperature: `0`.

### Classification prompt (versioned)

- Lives in `/prompts/classify.v1.md` in the codebase (not in this spec — but referenced by version).
- Input: JSON array of `{page_number, text, layout_summary}`.
- Output schema: enforced via Gemini structured response, matching `ClassifyResult['pages']`.
- Prompt strategy: few-shot with 3 examples per page type.

### Extraction prompt (versioned)

- Lives in `/prompts/extract.v1.md`.
- Input: concatenated text + locale hint for date ambiguity.
- Output schema: full `ExtractedPayload` shape enforced as structured response.
- Prompt strategy:
  - Explicit schema recitation.
  - Locale note: "Dates ambiguous as DD/MM/YYYY vs MM/DD/YYYY: resolve using locale={en|es}."
  - Instruction to return `null` for missing optional fields rather than hallucinating.
- Repair prompt (for retry on schema violation): prefix the violating output with "This was invalid — return a JSON object that strictly conforms to the schema. Preserve data values."

### Timeouts & retries

- Timeout: 60s per call.
- Retries: 2 on 5xx / `rate_limited` with backoff.
- On schema-validation failure, ONE retry with a repair prompt (counted separately from transient retries).

### Error codes

| Code                  | Cause                                                                       |
| --------------------- | --------------------------------------------------------------------------- |
| `gemini_auth`         | API key invalid                                                             |
| `gemini_quota`        | Rate/quota limit                                                            |
| `gemini_timeout`      | Exceeded our 60s cap                                                        |
| `gemini_invalid_json` | Non-JSON response (should be impossible with structured mode, but defended) |
| `gemini_schema`       | JSON doesn't match schema after one repair retry                            |
| `gemini_truncated`    | Response hit max tokens                                                     |
| `gemini_unknown`      | 5xx after retries                                                           |

### Cost

- Gemini charges per input/output token. We log `tokens_in` and `tokens_out` per call.
- The orchestrator's chunking policy keeps single-call token counts under 150k.

## Prompt versioning

- Prompts are **files**, not strings embedded in code. Path-versioned (`.v1.md`, `.v2.md`).
- When a prompt changes:
  - New file, incremented version.
  - Adapter `meta.prompt_version` recorded in `extractions.model_meta`.
  - Old version kept for 90 days to allow A/B comparison.
- Changing a prompt is a **release event** — we run a backfill eval (golden POs) before promoting.

## Observability

Every call emits a `workflow_events` row (see [architecture.md](../architecture.md#event-shape-internal)):

```jsonc
{
  "stage": "ocr" | "classify" | "extract",
  "outcome": "ok" | "retry" | "fail",
  "duration_ms": 1234,
  "meta": {
    "vendor": "docai" | "gemini",
    "model": "gemini-2.5-pro" | "ocr-v1",
    "tokens_in": 12000,
    "tokens_out": 2000,
    "page_count": 3,
    "prompt_version": "extract.v1"
    // Never: PO text, buyer names, line items
  }
}
```

## Testing strategy

- **Golden documents**: a small corpus (~20 POs) with hand-verified extractions. Adapter-level tests run these through the real APIs nightly and compare output against golden JSON (field-by-field with tolerances for numeric fields).
- **Schema tests**: adapter outputs are zod/ajv-validated against the response schema in unit tests with mocked HTTP.
- **Prompt-change gate**: a PR modifying `/prompts/*.md` must show golden test results and delta analysis before merge.

## Edge cases

- **Mixed-language documents.** Extraction prompt asks for canonical field values; description language is preserved as-is.
- **Very small (1-page) documents.** Classification still runs; overhead is negligible.
- **Handwritten content.** Document AI handles mixed print/handwritten with degraded confidence. If `confidence < 0.5` on all pages, flag with warning in `extractions.model_meta.warnings` — operator is likely to edit more.
- **Documents that look like POs but are quotes or invoices.** The classifier may return `cover`+`body`+`line_items` for any of these; we extract regardless. In Phase 1 we trust the operator to reject if inappropriate.

## Failure scenarios

| Scenario                                             | Handling                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------ |
| Google Cloud outage                                  | Retries exhaust; orchestrator marks doc `failed_processing`. |
| Gemini API degraded                                  | Same.                                                        |
| Prompt deployed that hallucinates consistently       | Nightly eval catches; rollback to prior `.vN.md` file.       |
| Structured output schema changes (vendor-side break) | Adapter test catches; pin minor version in SDK.              |
| Leaked `GCP_DOCAI_KEY_JSON`                          | Rotate key; no data loss (keys are not in DB).               |

## Success criteria

- Adapter-level golden tests pass at ≥ 90% field-accuracy before every deploy.
- Every adapter call emits a `workflow_events` row with stable shape.
- Zero PII (PO contents, buyer names) appears in logs or event metadata.
- Swapping the vendor (e.g. replacing Document AI with an alternative) requires changing only one file.

## Dependencies

- Google Cloud project with Document AI enabled.
- Gemini API key with quota.
- Supabase Edge Function secrets: `GCP_DOCAI_KEY_JSON`, `GEMINI_API_KEY`.
- [workflows/ai-processing.md](../workflows/ai-processing.md) — only caller.
- [data.md](../data.md) — canonical `extractions.payload` shape.
- [credits.md](../credits.md) — relevance definition (these adapters implement it).
