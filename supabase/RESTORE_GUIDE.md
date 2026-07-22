# Portable backup and restore

The admin app creates a versioned JSON migration package from **Settings → Full backup & restore**. Keep this file private because it contains customer contact details, addresses, order history and payment references.

## Restore into a new Supabase account

1. Create a new Supabase project.
2. In **Authentication → Users**, create the intended kitchen administrator using `neofyne@gmail.com` or `krsnasolo@gmail.com`.
3. Download **New-project setup SQL** from the app and run the entire file once in the new project's SQL Editor.
4. In Netlify, replace `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` with the new project's values and redeploy.
5. Sign in at `/admin`, open **Settings → Full backup & restore**, choose the JSON backup, review its counts and restore it.

The restore is transactional: any database error rolls the entire restore back. Orders, order items, menu items, all dated menus, promotions, customer profiles, UPI details and storefront settings are included.

Supabase authentication passwords cannot be exported. Customer identity details are retained safely; when a customer registers in the replacement project with the same email address or phone number, the restored profile and linked order history are claimed automatically.

Menu and order photo bytes are stored in the site's private Netlify Blobs store. The JSON package contains their opaque references, so changing only the Supabase account does not move or remove those files. Moving to another Netlify site requires a separate Blobs asset migration.

## Source files

- `portable_backup_restore.sql` provides the administrator-only export, restore and customer-reconnection functions.
- `../scripts/build-supabase-setup.mjs` generates the complete new-project SQL from every application migration during development and production builds.
- `../scripts/test-portable-backup.sql` is the PostgreSQL smoke test for export, replacement restore and customer reconnection.
