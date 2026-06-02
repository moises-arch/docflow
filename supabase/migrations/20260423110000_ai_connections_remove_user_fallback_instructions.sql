alter table ai_connections
  drop column if exists fallback_model,
  drop column if exists instructions;
