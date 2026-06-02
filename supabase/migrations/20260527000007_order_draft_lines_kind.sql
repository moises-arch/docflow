-- Columna `kind` para diferenciar líneas de producto vs descuentos, freight,
-- surcharges y adjustments. El prompt v6+ del extractor IA emite este campo;
-- antes se descartaba en el backend. Ahora se persiste y odoo-sync lo usa
-- para mandar las líneas a Odoo con el tratamiento correcto (descuento como
-- price_unit negativo, freight como cargo, etc.).

alter table order_draft_lines
  add column kind text not null default 'item'
  check (kind in ('item','discount','freight','surcharge','adjustment'));

create index order_draft_lines_kind_idx
  on order_draft_lines (order_draft_id, kind)
  where kind != 'item';

comment on column order_draft_lines.kind is
  'Tipo de línea: item (producto), discount, freight, surcharge, adjustment. Source: line_items[].k del extractor IA (prompt v6+).';
