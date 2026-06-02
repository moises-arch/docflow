# Workflow — Email Ingest

## Purpose

Accept purchase orders from a tenant inbox address, extract attachments or HTML bodies, create `documents`, and hand them to the same AI processing pipeline as manual uploads.

## Responsibilities

- Receive inbound email from an email provider webhook.
- Authenticate the webhook and deduplicate by `message_id`.
- Store raw email, HTML body, text body, and attachments.
- Convert supported email parts into `documents`.
- Detect provider from the ingest source, sender, subject, filename, or document content.
- Invoke `ingest` / `ai-process` for each created document.

## Inputs

From the email provider webhook:

- Message ID.
- Recipient address.
- Sender email/name.
- Subject.
- HTML body.
- Text body.
- Attachments.
- Provider authentication metadata such as signature verification result.

Supported content:

- PDF attachments.
- Images: PNG, JPG, TIFF.
- HTML email body when it contains the PO content.
- Future: DOCX/XLSX conversion, if real customers need it.

## Outputs

- One `inbound_emails` row.
- Zero or more `inbound_email_attachments` rows.
- Zero or more `documents` rows with `source_channel = 'email'`.
- AI processing invocation per document.

## Flow

```
Email provider webhook
  │ verify signature
  │ resolve recipient -> email_ingest_sources
  │ upsert inbound_emails by tenant_id + message_id
  │ store raw/html/text in private Storage
  │ store attachments in private Storage
  │ create documents for supported attachments
  │ if no supported attachment but HTML looks like a PO:
  │   render/store HTML as source document
  │ detect provider from source + sender + content
  │ invoke ingest for each document
  ▼
Inbox / Review
```

## Provider detection

Email ingest gets first chance to assign provider:

1. `email_ingest_sources.provider_id` if the address is provider-specific.
2. `providers.email_domains`.
3. Active `provider_detection_rules`.
4. OCR/extraction-time detection if email metadata is inconclusive.

Provider detection remains optional. Unknown provider documents still process and appear for review.

## Deduplication

Primary dedupe key:

- `unique (tenant_id, message_id)` on `inbound_emails`.

Secondary future dedupe:

- Attachment hash per tenant.
- PO number + provider + date.

Duplicate email webhooks must be idempotent: return success without creating duplicate documents.

## Security

- Webhook endpoints must verify provider signatures.
- Do not trust sender email alone for authorization.
- Restrict ingest source addresses per tenant.
- Raw emails may contain PII; store in private Storage and do not log contents.
- `inbound_emails` and `inbound_email_attachments` are read-only to users; writes are service-role-only.

## Review behavior

Email-created documents should look like uploaded documents with extra source context:

- Source: Email.
- Sender.
- Subject.
- Received at.
- Provider, if detected.
- Link to raw email metadata for admins.

## Failure scenarios

| Scenario                  | Handling                                                                        |
| ------------------------- | ------------------------------------------------------------------------------- |
| Unknown recipient         | Reject webhook or store in quarantine, depending on provider requirements.      |
| Duplicate `message_id`    | Return success, no duplicate documents.                                         |
| Unsupported attachment    | Record attachment metadata, mark email `ignored` if nothing processable exists. |
| HTML-only PO              | Store HTML and create a document-like artifact for AI processing.               |
| Webhook signature invalid | Reject and log only metadata.                                                   |
| AI processing fails       | Normal document failure path: `failed_processing`, retry from UI.               |

## Phase boundary

Email ingest was originally deferred in the roadmap. This spec promotes the foundation because it is now clearly part of the desired product shape. The first implementation can be behind an internal flag while upload remains the default.

## Dependencies

- [data.md](../data.md) — email ingest tables and document source columns.
- [workflows/upload.md](./upload.md) — shared document creation rules.
- [workflows/ai-processing.md](./ai-processing.md) — downstream pipeline.
- [workflows/provider-mapping.md](./provider-mapping.md) — provider detection and mapping.
