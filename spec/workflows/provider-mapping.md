# Workflow — Provider Mapping

## Purpose

Model each distributor/provider as its own interpretation profile. A provider owns source-field names, field mappings, SKU aliases, and detection rules. The order can still be processed without a provider match; provider detection only improves automation and review speed.

## Responsibilities

- Detect which provider sent or authored a PO.
- Map provider-specific source fields into tenant-configured ERP target fields.
- Resolve provider SKUs to ERP products.
- Keep target fields configurable without hard-coding every ERP field in the app.
- Keep visual evidence optional. Coordinates/highlights help humans review, but business logic uses structured fields and mappings.

## Existing foundation

Already present:

- Tenant-wide `customer_mappings`.
- Tenant-wide `product_mappings`.
- ERP sync state on `order_drafts`.
- Upload and AI processing pipeline.

New work should not delete those immediately. Treat tenant-wide mappings as fallbacks while new provider-specific mappings become the primary path.

## Core concepts

### Provider

Examples: `ABC Supply`, `Distribuidora X`, `Hospital Y`. The provider profile answers:

- How do we recognize this provider?
- What names do they use for fields?
- Which source SKU maps to which ERP product?
- Which fields are required for this provider?

### Source field

A field as seen in the provider's document or email. Examples:

- `Item Code`
- `Customer SKU`
- `Vendor Name`
- `Ship To`
- `PO No.`

Source fields are descriptive and provider-owned. They do not decide ERP behavior by themselves.

### Target field

A tenant-configured field DocFlow must produce for ERP. Examples:

- `sale.order.client_order_ref`
- `sale.order.date_order`
- `sale.order.partner_id`
- `sale.order.line.product_id`
- `sale.order.line.product_uom_qty`

Target fields can be active/inactive and required/optional. Required active target fields must be satisfied before approval/sync.

## Detection order

Provider detection is best-effort and should produce a confidence score:

1. Email ingest source has a fixed provider.
2. Sender email or sender domain matches a provider rule.
3. Subject or attachment filename matches a provider rule.
4. Extracted document fields match provider rules, such as buyer name, tax ID, logo text, address, or known account number.
5. Fuzzy keyword match from OCR text.

If the top match is below the confidence threshold, leave `provider_id = null` and ask the operator to pick a provider in Review.

## Mapping resolution

For each extracted field:

1. If `provider_id` is set, load active `provider_field_mappings`.
2. Map `source_field_key` to `target_field`.
3. Apply deterministic transforms from `provider_field_mappings.transform`.
4. Validate required active `target_fields`.
5. Surface missing required fields in Review.

The AI extraction can suggest source fields, but the final destination schema is controlled by `target_fields`.

## Product resolution

For each line item, use this order:

1. Provider mapping by `source_company_sku` when present. Some POs include both their SKU and our/company SKU; this is the strongest product signal.
2. Provider mapping by `source_sku`.
3. Provider mapping by normalized `source_description`.
4. Tenant-wide `product_mappings` fallback.
5. Direct match against cached `odoo_products.default_code`.
6. Operator chooses from all cached `odoo_products`.

The mapping UI should show all ERP products by default, searchable by name, internal reference/default code, and barcode. Provider aliases are layered on top.

## Review UI requirements

- Provider selector at document level.
- Mapping setup screen per provider.
- Three-column mapping UX:
  - Document preview.
  - Source fields detected from this provider.
  - Target fields configured for ERP.
- Target fields can be added, disabled, ordered, and marked required.
- Source-to-target mapping can be edited per provider.
- Product mappings are provider-scoped but can fall back to global tenant mappings.
- Missing required target fields block approval with a clear fix path.

## Business rules

1. Coordinates and highlights are never required for sync.
2. Provider detection can be corrected by the operator.
3. Correcting a provider can re-run mapping resolution without re-running OCR.
4. Provider-specific product mappings win over global mappings.
5. Target field requirements are tenant-controlled; provider mappings may override requiredness only where explicitly allowed.
6. ERP target fields are validated before creating a Draft SO, not during OCR.

## Deferred work

- Automatic learning from repeated operator corrections.
- Bulk import/export of provider mappings.
- Provider-level pricing/contracts.
- Multi-ERP target fields beyond ERP.

## Dependencies

- [data.md](../data.md) — providers, target fields, provider mappings, ERP product cache.
- [workflows/ai-processing.md](./ai-processing.md) — source field extraction and provider detection.
- [workflows/review.md](./review.md) — human correction.
- [workflows/odoo-sync.md](./odoo-sync.md) — final target-field validation.
