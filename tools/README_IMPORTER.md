# Dead Wax Importer

Open `/tools/importer.html` after signing into the app.

Use it to import a cleaned `dead_wax_db.js` into Supabase. It keeps every Shelf ID record and reads metadata from `entries["code:<Shelf ID>"]` first, which matches the current static app rendering logic.

Recommended flow:
1. Open `/tools/importer.html`.
2. Sign in with the same account you use in the app.
3. Select the cleaned `dead_wax_db.js`.
4. Click **Analyze DB**.
5. Confirm the Shelf ID count is 559.
6. Click **Wipe my Supabase records** only if you want a clean import.
7. Click **Import Shelf ID records**.
8. Return to `/index.html`.
