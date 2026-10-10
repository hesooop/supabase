// NEXT_PUBLIC_SUPABASE_URL may be relative (e.g. "/supabase") to route browser traffic through the
// Next.js rewrite proxy; server code then uses SUPABASE_URL to reach Supabase directly.
const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Fixed cookie name so browser and server agree even when they address Supabase via different hosts.
export const cookieOptions = { name: "sb-storage-auth" };

export function serverSupabaseUrl() {
  return process.env.SUPABASE_URL ?? publicUrl;
}

export function browserSupabaseUrl() {
  if (!publicUrl.startsWith("/")) return publicUrl;
  // Client components also render once on the server, where there is no window.
  return typeof window === "undefined" ? serverSupabaseUrl() : `${window.location.origin}${publicUrl}`;
}
