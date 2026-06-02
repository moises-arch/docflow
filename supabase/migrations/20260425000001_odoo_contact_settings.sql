alter table odoo_connections
add column if not exists contact_settings jsonb not null default '{
  "customer_match_field": "name",
  "customer_match_scope": "under_reseller",
  "customer_is_company": false,
  "create_if_not_found": true,
  "sync_billing_address": true,
  "sync_shipping_address": true,
  "address_update_strategy": "always",
  "update_contact_info": true
}'::jsonb;
