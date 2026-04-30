# Dead Wax Supabase Fresh Repo v5

This build retries record-level Supabase persistence.

Fixes included:
- Explicitly saves Discogs refresh/fetch results from the actual `fetchDg` and `forceDiscogs` paths.
- Persists listened/reaction/collection changes from `patchRecordState`.
- Persists edit-form saves from `saveRec`.
- Deletes Supabase rows when records are removed.
- Keeps the importer flow and Shelf ID based import.

Deploy by uploading the contents of this ZIP to the GitHub Pages repo root.
