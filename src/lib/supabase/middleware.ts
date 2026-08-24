import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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

  // Authenticated users on login page: redirect to their portal
  if (user && isAuthRoute) {
    const role = user.user_metadata?.role as string | undefined
    const url = request.nextUrl.clone()
    url.pathname = role === 'driver' ? '/driver'
      : role === 'partner' ? '/partner'
      : '/admin'
    return NextResponse.redirect(url)
  }

  // Role-based route protection
  // NOTE: RLS is the real security boundary. This is a UX redirect only.
  if (user) {
    const role = user.user_metadata?.role as string | undefined

    const isDriverRoute = pathname.startsWith('/driver')
    const isPartnerRoute = pathname.startsWith('/partner')
    const isAdminRoute = pathname.startsWith('/admin')

    if (isDriverRoute && role !== 'driver' && role !== 'admin') {
      const url = request.nextUrl.clone()
      url.pathname = role === 'partner' ? '/partner' : '/login'
      return NextResponse.redirect(url)
    }

    if (isPartnerRoute && role !== 'partner' && role !== 'admin') {
      const url = request.nextUrl.clone()
      url.pathname = role === 'driver' ? '/driver' : '/login'
      return NextResponse.redirect(url)
    }

    if (isAdminRoute && role !== 'admin') {
      const url = request.nextUrl.clone()
      url.pathname = role === 'driver' ? '/driver'
        : role === 'partner' ? '/partner'
        : '/login'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
