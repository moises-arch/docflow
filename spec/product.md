# Product

## Purpose

DocFlow eliminates the manual work of turning incoming purchase orders (PDFs, images, emails-with-attachments) into draft Sales Orders in ERP. A customer sends a PO — DocFlow reads it, extracts line items, a human spot-checks, and it lands in ERP as a draft SO. No typing.

## Who it's for

**Primary user: the back-office operator** at a B2B company that:

- Receives 10–500 purchase orders per week.
- Processes them in ERP 19.
- Currently types them by hand, or uses a messy email → spreadsheet → paste flow.

Their workday is: open email → download PDF → read PO → find customer in ERP → find each product → type quantities and prices → save as draft. DocFlow collapses this to: upload PDF → glance at extraction → click approve.

**Secondary user: the tenant admin.** Configures ERP connection, manages team access, monitors credits. Often the operations lead or IT-adjacent owner.

Out of scope as a user in Phase 1: end-customers submitting POs themselves, salespeople, finance/AP.

## Value proposition

- **Time.** A 15-minute manual entry becomes a 30-second review.
- **Accuracy.** AI extracts line items consistently; review step catches the edge cases; nothing slips to "confirmed" without human eyes.
- **Auditability.** Every PO has a trail: original document → AI extraction → human edits → ERP SO.
- **ERP-native.** We push Draft Sales Orders directly; no CSV middleware, no separate inbox.

## Core flow (one sentence each)

1. **Upload** — Operator drops a PDF (or several) into DocFlow.
2. **AI processing** — We OCR, classify pages, extract fields, normalize.
3. **Provider mapping** — DocFlow identifies the provider and applies provider-specific source-field and SKU mappings.
4. **Review** — Operator sees extracted data beside the document, edits what's wrong, approves.
5. **Push to ERP** — Draft Sales Order appears in the tenant's ERP 19 instance.

## Non-goals (Phase 1)

We will **not** build:

- Stripe checkout or billing UI. Credits are tracked; payment is deferred. See [credits.md](./credits.md) and [roadmap.md](./roadmap.md).
- Subdomains, custom branding, white-label.
- Public API, webhooks, Zapier, and full self-serve email ingestion rollout.
- Team management UI beyond owner + member roles.
- Admin dashboard across tenants.
- Supplier-facing portal. DocFlow is for the buyer's back-office.
- ERPs other than ERP. SAP, NetSuite, QuickBooks — not in scope.
- Confirming or invoicing SOs in ERP — we only create **drafts**.
- Automatic learning loops (fine-tuning from corrections). The review signal is captured but not yet fed back.
- Mobile-first UX. Desktop-first; mobile only needs to not break.

## Success criteria (Phase 1)

The engine works when, for our first 3 paying tenants:

1. **≥ 90%** of uploaded POs are extracted well enough that the operator makes **fewer than 3 edits** before approving.
2. **≥ 99%** of approved extractions land as a Draft SO in ERP on the first push attempt.
3. Median time from **upload → ERP draft** is **under 90 seconds** for a typical PO (1–3 relevant pages, <10 line items).
4. Zero cross-tenant data leaks in RLS audits.
5. Operators choose DocFlow over manual entry unprompted after the first week.

The product is **not** done when we ship the UI — it's done when we've earned these numbers on real customer data.

## Guiding design principles

- **Table-first.** POs are rows of line items. The UI should feel like a good ERP, not a consumer app.
- **Compact density.** B2B operators scan lists all day. No giant hero sections, no oversized cards.
- **Review, don't redo.** If the operator ends up retyping more than a few fields, the AI has failed and the extraction needs to improve — not the UI.
- **Fail loudly to the right person.** ERP-push failures go to the admin with a concrete fix path ("product SKU not found — map it here"). Don't silently retry forever.
- **Provider-aware, not provider-dependent.** Provider detection and visual highlights should improve speed, but unknown providers and missing coordinates must still reach Review.

## Out of this file

- How extraction works → [workflows/ai-processing.md](./workflows/ai-processing.md)
- How credits are computed → [credits.md](./credits.md)
- How ERP sync handles errors → [workflows/odoo-sync.md](./workflows/odoo-sync.md)
- What happens after Phase 1 → [roadmap.md](./roadmap.md)

## Dependencies

- Customer has an ERP 19 instance and can provide connection credentials.
- Customer's POs are reasonably structured (tabular line items, legible scans/PDFs). Hand-scrawled faxes are a fallback, not a hero use case.
- Customer's product catalog exists in ERP; mapping gaps are resolved by the admin, not by DocFlow.
