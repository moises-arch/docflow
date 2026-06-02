-- Anthropic is the only supported AI provider going forward.
-- Drop the gemini option from ai_connections and force any pre-existing rows.
update ai_connections set provider = 'anthropic' where provider <> 'anthropic';

alter table ai_connections drop constraint if exists ai_connections_provider_check;

alter table ai_connections
  add constraint ai_connections_provider_check check (provider = 'anthropic');
