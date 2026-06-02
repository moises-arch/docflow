insert into target_fields (
  tenant_id,
  key,
  label,
  scope,
  odoo_model,
  odoo_field,
  value_type,
  required,
  system,
  sort_order
)
select
  tenants.id,
  'customer_address',
  'Customer Address',
  'partner',
  'res.partner',
  'street',
  'text',
  true,
  true,
  15
from tenants
on conflict (tenant_id, key) do update
set
  label = excluded.label,
  scope = excluded.scope,
  odoo_model = excluded.odoo_model,
  odoo_field = excluded.odoo_field,
  value_type = excluded.value_type,
  required = true,
  active = true,
  system = true,
  sort_order = excluded.sort_order;
