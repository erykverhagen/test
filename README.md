# Dead Wax Supabase App

Fresh GitHub Pages package for the Supabase-backed Dead Wax app.

## Files

- `index.html` — main app UI, using the static app visual shell.
- `supabase-config.js` — Supabase URL and publishable anon key.
- `dead_wax_supabase_boot.js` — sign-in and Supabase loading layer.
- `dead_wax_supabase_sync.js` — save/delete sync hooks.
- `tools/importer.html` — one-time DB upload/import tool.
- `tools/importer.js` — Shelf ID aware importer.

## First setup

1. Upload all files to the GitHub repository root.
2. Open GitHub Pages.
3. Sign in.
4. Go to **user menu → Import DB**, or open `/tools/importer.html`.
5. Upload the cleaned `dead_wax_db.js`.
6. Analyze, then import.
7. Return to the app.

Do not put `dead_wax_db.js` in the public repo as a runtime file. Upload it through the importer only.
