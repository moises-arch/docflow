alter table odoo_connections
  add column if not exists reseller_name_default text;

update odoo_connections
set reseller_name_default = coalesce(nullif(trim(reseller_name_default), ''), 'Direct Channel')
where reseller_name_default is null or trim(reseller_name_default) = '';

alter table odoo_connections
  alter column reseller_name_default set default 'Direct Channel',
  alter column reseller_name_default set not null;
