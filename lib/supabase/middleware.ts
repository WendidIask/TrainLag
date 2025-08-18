import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  console.log('🚦 MIDDLEWARE START - Path:', request.nextUrl.pathname)
  console.log('🚦 MIDDLEWARE - URL:', request.url)
  console.log('🚦 MIDDLEWARE - Method:', request.method)
  
  let supabaseResponse = NextResponse.next({
    request,
  })

  console.log('🚦 Creating Supabase client in middleware...')
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          const cookies = request.cookies.getAll()
          console.log('🍪 MIDDLEWARE getAll - Cookie count:', cookies.length)
          console.log('🍪 MIDDLEWARE getAll - Auth cookies:', 
            cookies.filter(c => c.name.includes('supabase')).map(c => `${c.name}=...${c.value.slice(-10)}`))
          return cookies
        },
        setAll(cookiesToSet) {
          console.log('🍪 MIDDLEWARE setAll - Setting', cookiesToSet.length, 'cookies')
          cookiesToSet.forEach(({ name, value }) => {
            console.log('🍪 MIDDLEWARE setAll - Cookie:', name, 'length:', value?.length)
            request.cookies.set(name, value)
          })
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  console.log('🚦 MIDDLEWARE - Getting user...')
  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  console.log('🚦 MIDDLEWARE RESULT:', {
    path: request.nextUrl.pathname,
    user: user?.email || 'NONE',
    userId: user?.id || 'NONE', 
    error: error?.message || 'NONE',
    hasAccessToken: user ? 'YES' : 'NO'
  })

  // Check if this is a protected route
  const isProtectedRoute = request.nextUrl.pathname.startsWith('/dashboard') ||
                          request.nextUrl.pathname.startsWith('/game') ||
                          request.nextUrl.pathname.startsWith('/create-game')

  console.log('🚦 MIDDLEWARE - Is protected route:', isProtectedRoute)

  if (isProtectedRoute && !user) {
    console.log('🔒 MIDDLEWARE - REDIRECTING TO LOGIN (no user on protected route)')
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return NextResponse.redirect(url)
  }

  if (user && request.nextUrl.pathname === '/' && !request.nextUrl.searchParams.has('error')) {
    console.log('✅ MIDDLEWARE - REDIRECTING TO DASHBOARD (authenticated user on auth page)')
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    url.search = ''
    return NextResponse.redirect(url)
  }

  console.log('🚦 MIDDLEWARE - ALLOWING REQUEST TO CONTINUE')
  return supabaseResponse
}