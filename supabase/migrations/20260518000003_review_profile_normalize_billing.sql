-- Add option to review profiles: normalize billing address from the Odoo partner
-- linked to the template's provider. When enabled, odoo-sync uses the reseller
-- partner directly as partner_invoice_id (no child billing contact created).
ALTER TABLE review_profiles
  ADD COLUMN normalize_billing_from_odoo_partner boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN review_profiles.normalize_billing_from_odoo_partner IS
  'When true, odoo-sync sets partner_invoice_id = reseller partner (from provider_reseller_mappings) '
  'instead of creating a child invoice address from draft.billing_address.';
