import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getAppRole, hasAppRole, homePath } from '@/lib/auth/roles'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Do not run any code between createServerClient and supabase.auth.getUser()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const isAuthRoute = pathname.startsWith('/login')
  const isApiRoute = pathname.startsWith('/api')

  // Unauthenticated users: redirect to login (except for login page itself and api routes)
  if (!user && !isAuthRoute && !isApiRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  const home = user ? homePath(user) : undefined

  // Authenticated users on login or root page: redirect to their portal.
  // Users with no role stay on /login (it signs them out with a message);
  // redirecting them would loop.
  if (user && (isAuthRoute || pathname === '/') && home) {
    const url = request.nextUrl.clone()
    url.pathname = home
    return NextResponse.redirect(url)
  }

  // Role-based route protection. A driver who is also a partner (D6) may use
  // both portals; admins may open any portal.
  // NOTE: RLS is the real security boundary. This is a UX redirect only.
  if (user) {
    const isAdmin = getAppRole(user) === 'admin'
    const allowed =
      pathname.startsWith('/admin') ? isAdmin
      : pathname.startsWith('/driver') ? isAdmin || hasAppRole(user, 'driver')
      : pathname.startsWith('/partner') ? isAdmin || hasAppRole(user, 'partner')
      : true

    if (!allowed) {
      const url = request.nextUrl.clone()
      url.pathname = home ?? '/login'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
