import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const isAdminRoute = window.location.pathname.startsWith("/admin");

export const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: {
          // Keep the private order desk signed in independently from the
          // customer storefront. A family member can now test an order with a
          // customer account without replacing the administrator's session.
          storageKey: "neerus-kitchen-admin-auth",
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: isAdminRoute,
        },
      })
    : null;

export const storefrontSupabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: {
          // Keep customers signed in on this phone after the first successful
          // verification. Supabase refreshes the session in local storage.
          storageKey: "neerus-kitchen-customer-auth",
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: !isAdminRoute,
        },
      })
    : null;
