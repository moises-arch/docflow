-- Rename odoo-specific column names to generic target_* names.
-- This decouples the target_fields table from Odoo as the only integration.
ALTER TABLE target_fields RENAME COLUMN odoo_model TO target_model;
ALTER TABLE target_fields RENAME COLUMN odoo_field TO target_field;
