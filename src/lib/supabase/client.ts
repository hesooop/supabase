import { createBrowserClient } from "@supabase/ssr";
import { browserSupabaseUrl, cookieOptions, supabaseAnonKey } from "./config";

export function createClient() {
  return createBrowserClient(browserSupabaseUrl(), supabaseAnonKey, { cookieOptions });
}
