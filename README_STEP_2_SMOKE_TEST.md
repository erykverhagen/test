# Dead Wax Supabase Smoke Test

This is a small browser-only test for the Supabase setup.

## What it checks

- Email/password sign-up
- Email/password sign-in
- Per-user insert into `records`
- Per-user select from `records`
- Insert/read from `change_log`

## How to use without installing anything

1. Upload these files to a temporary GitHub repo or a temporary folder in your Dead Wax repo:
   - `index.html`
   - `supabase-config.js`
2. Enable GitHub Pages for that folder/repo.
3. Open the deployed page.
4. Create an account.
5. Click **Write test record**.
6. Click **Read my records**.
7. Click **Read change log**.

## Safety note

The Supabase URL and publishable/anon key are safe to be in frontend code. Do not ever add the service_role key, database password, or JWT secret to GitHub.

## After the test

This smoke-test package is temporary. Once confirmed, the real Dead Wax app will be rebuilt to use Supabase instead of `dead_wax_db.js`.
