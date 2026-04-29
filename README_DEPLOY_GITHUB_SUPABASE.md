# Dead Wax Supabase App v1

This is the first shippable Supabase-backed Dead Wax app package.

## What is safe to publish

You may publish these files in a public GitHub repository because they do **not** contain the private record database:

- `index.html`
- `styles.css`
- `app.js`
- `importer.html`
- `importer.js`
- `supabase-config.js`

The Supabase anon/publishable key in `supabase-config.js` is intended for browser use. The database is protected by Row Level Security.

## What not to publish

Do **not** commit your private `dead_wax_db.js` to the public repo.

Use `importer.html` to import it from your local machine into your signed-in Supabase account.

## Deploy to GitHub Pages

1. Create a public GitHub repo.
2. Upload the files in this ZIP.
3. Go to Settings → Pages.
4. Deploy from the main branch root.
5. Open the Pages URL.
6. Sign in.
7. Use `importer.html` once to import your DB V4.

## Current auth mode

Email + password is enabled for this v1 test build. Google, Apple, or magic-link auth can be added later without changing the database tables.

## Supabase tables expected

- `profiles`
- `records`
- `collections`
- `record_collections`
- `change_log`

