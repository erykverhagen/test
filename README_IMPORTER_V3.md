# Dead Wax Supabase Importer v3

Strict importer for the public/Supabase version.

Imports only meaningful unique Artist + Album records:
- non-empty Discogs/enriched entries
- meaningful override-only records with Artist + Album
- custom records

Skips archived empty placeholders (`entry.empty === true`).

Also patches the app loader to fetch Supabase rows in 1000-row pages, so totals above 1000 display correctly.

Use importer.html: sign in, choose local dead_wax_db.js, Analyze, Wipe my imported records, Import.
