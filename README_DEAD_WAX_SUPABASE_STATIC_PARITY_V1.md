# Dead Wax Supabase Static Parity v1

This package turns the uploaded static `index.html` into the authenticated Supabase-backed app shell while keeping the static app UI and behavior as the source of truth.

## Files

- `index.html` - full Dead Wax UI, patched for Supabase auth/data loading
- `supabase-config.js` - public Supabase URL + publishable key
- `dead_wax_supabase_boot.js` - sign-in/sign-up and per-user data bootstrapping
- `dead_wax_supabase_sync.js` - writes edits/listens/ratings/grail/deletes back to Supabase

## Important

Do not publish `dead_wax_db.js` in the public repo. This app loads records from Supabase after sign-in.

## Expected Supabase tables

The app expects the tables already created during the previous smoke-test/importer work:

- `records`
- `collections`
- `record_collections`
- `change_log`

RLS must remain enabled so every query is scoped to the signed-in user.

## Current auth

Email/password for now. Google/Apple or magic link can be added later through Supabase Auth without changing the UI architecture.
