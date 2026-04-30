# Dead Wax Supabase Native v1

This is a Supabase-native rebuild. The app no longer uses `dead_wax_db.js`, IndexedDB, `dgMem`, or browser-local record overrides as a runtime source of truth.

## Runtime source of truth

- Records: `public.records`
- Collections: `public.collections` and `public.record_collections`
- Audit: `public.change_log`
- Importer: `/tools/importer.html`, migration only

## What to upload to GitHub

Upload the contents of this ZIP to the repository root.

## First check after upload

1. Open the app.
2. Sign in.
3. Confirm imported records load.
4. Open a record.
5. Click Refresh Discogs.
6. Refresh the browser.
7. The metadata/tracklist should remain because it was written to the Supabase record row.

## Important

This is a clean app rewrite, not a patched static bridge. Some micro-interactions may need visual polish compared with the huge static app, but the data lifecycle is now correct: Supabase first.
