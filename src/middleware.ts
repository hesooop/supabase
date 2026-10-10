import { createServerClient } from "@supabase/ssr";
import { cookieOptions, serverSupabaseUrl, supabaseAnonKey } from "@/lib/supabase/config";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    serverSupabaseUrl(),
    supabaseAnonKey,
    {
      cookieOptions,
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirects must carry any refreshed auth cookies, otherwise the browser keeps a consumed refresh token.
  const redirectTo = (path: string) => {
    const redirect = NextResponse.redirect(new URL(path, request.url));
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    redirect.headers.set("Cache-Control", "no-store");
    return redirect;
  };

  const isLogin = request.nextUrl.pathname.startsWith("/login");
  if (!user && !isLogin) return redirectTo("/login");
  if (user && isLogin) return redirectTo("/");
  return response;
}

export const config = {
  matcher: ["/((?!supabase/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
