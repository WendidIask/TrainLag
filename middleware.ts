import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  console.log('📍 ROOT MIDDLEWARE CALLED - Path:', request.nextUrl.pathname)
  console.log('📍 ROOT MIDDLEWARE - Method:', request.method)
  
  const result = await updateSession(request)
  
  console.log('📍 ROOT MIDDLEWARE - updateSession returned:', result?.status || 'unknown')
  
  return result
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}