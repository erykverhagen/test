# Dead Wax Supabase Native Static Parity v2

This package rebuilds the latest static Dead Wax interface on top of Supabase as the single source of truth.

## Deploy
Upload the contents to GitHub Pages. Run `docs/SUPABASE_SCHEMA_NATIVE_V1.sql` once in Supabase if you have not already.

## Runtime
- No `dead_wax_db.js` runtime dependency.
- Records load from Supabase after login.
- Settings and sign out live under the account icon.
- `/tools/importer.html` is migration-only and can be removed from the public repo after import.
