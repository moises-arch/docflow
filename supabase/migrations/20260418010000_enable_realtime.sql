-- Enable Realtime on the documents table so the Inbox
-- receives live state updates without a page refresh.
alter publication supabase_realtime add table documents;
