import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const migrations = [
  "schema.sql",
  "customer_storefront.sql",
  "phone_otp_auth.sql",
  "storefront_hardening.sql",
  "customer_access_approval.sql",
  "instant_customer_access.sql",
  "customer_contact.sql",
  "dish_promotions.sql",
  "dish_categories_and_units.sql",
  "two_state_orders.sql",
  "delivered_photo_guard.sql",
  "admin_action_centre.sql",
  "portable_backup_restore.sql",
];

const sections = await Promise.all(migrations.map(async (name) => {
  const sql = await readFile(join(root, "supabase", name), "utf8");
  return `\n-- ============================================================================\n-- ${name}\n-- ============================================================================\n\n${sql.trim()}\n`;
}));

const header = `-- Neeru's Home Kitchen — complete setup for a NEW Supabase project
-- Generated from the versioned SQL files in this repository.
--
-- 1. Create the new Supabase project.
-- 2. Create the intended administrator in Authentication > Users.
--    Use krsnasolo@gmail.com or neofyne@gmail.com, or update the admin seed
--    statement in customer_storefront.sql before running this file.
-- 3. Open SQL Editor, paste this entire file, and click Run once.
-- 4. Point Netlify's VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to
--    the new project and redeploy.
-- 5. Sign in at /admin and upload the portable JSON backup in Settings.
--
-- Run only on a new/empty project. Existing authentication passwords are not
-- transferable; customers reconnect with the same phone or email after restore.
`;

await mkdir(join(root, "public"), { recursive: true });
await writeFile(join(root, "public", "supabase-new-project-setup.sql"), `${header}${sections.join("")}\n`, "utf8");
