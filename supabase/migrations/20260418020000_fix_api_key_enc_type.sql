-- Change api_key_enc from bytea to text.
-- The AES-256-GCM storage format is iv_hex:ciphertext_hex:tag_hex — plain text.
alter table odoo_connections
  alter column api_key_enc type text using encode(api_key_enc, 'escape');
