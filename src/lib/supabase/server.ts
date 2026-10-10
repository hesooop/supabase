import { createServerClient } from "@supabase/ssr";
import { cookieOptions, serverSupabaseUrl, supabaseAnonKey } from "@/lib/supabase/config";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    serverSupabaseUrl(),
    supabaseAnonKey,
    {
      cookieOptions,
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component; middleware refreshes the session.
          }
        },
      },
    },
  );
}
