import { createServerClientR } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(req: NextRequest) {
  const res = NextResponse.next()

  const supabase = await createServerClientR()
  const { data: { user } } = await supabase.auth.getUser()

  const isProtectedRoute =
    req.nextUrl.pathname.startsWith('/dashboard') ||
    req.nextUrl.pathname.startsWith('/game') ||
    req.nextUrl.pathname.startsWith('/create-game')

  if (isProtectedRoute && !user) {
    const url = req.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return res
}
