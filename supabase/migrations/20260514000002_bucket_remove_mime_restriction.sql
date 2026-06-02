-- Eliminar la restricción de MIME types del bucket documents.
-- La app ya filtra por MIME en email-pipeline (getAllowedMimeTypes) y en
-- storeAttachment. Tener un allowlist en el bucket también bloquea los
-- archivos de metadata (raw.json → text/plain, body.html → text/html)
-- que se suben antes de los adjuntos, rompiendo todo el pipeline de email.
-- NULL = acepta cualquier tipo; el control real está en la capa de app.
update storage.buckets
set allowed_mime_types = null
where id = 'documents';
