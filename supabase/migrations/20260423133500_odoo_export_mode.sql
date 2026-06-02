alter table odoo_connections
  add column if not exists export_mode text;

update odoo_connections
set export_mode = 'sales_order'
where export_mode is null;

alter table odoo_connections
  alter column export_mode set default 'sales_order',
  alter column export_mode set not null;

alter table odoo_connections
  drop constraint if exists odoo_connections_export_mode_check;

alter table odoo_connections
  add constraint odoo_connections_export_mode_check
  check (export_mode in ('sales_order', 'quotation'));
