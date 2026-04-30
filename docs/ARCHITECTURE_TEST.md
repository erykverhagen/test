# Native architecture test

This build passes the code-level architecture check:

- No `dead_wax_db.js` script include in `index.html`.
- No IndexedDB record cache.
- No `dgMem` runtime source.
- No browser localStorage record overrides.
- Records are loaded through `SB.from('records')` after login.
- Record edits call `SB.from('records').update(...)`.
- Discogs refresh calls the Discogs API, then writes the result into the same Supabase record row.
- Card flips and details render from the in-memory copy of Supabase rows.

Manual browser test still required because live Supabase credentials/session are only available in your browser.
