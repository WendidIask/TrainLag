import { createServerClient as createSupabaseServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export const isSupabaseConfigured =
  typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_URL.length > 0 &&
  typeof process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 0

export async function createClient() {
  const cookieStore = await cookies()
  console.log('🏗️ Creating server client')

  return createSupabaseServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, 
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, 
    {
      cookies: {
        getAll() {
          const allCookies = cookieStore.getAll()
          console.log('🍪 Server getAll cookies count:', allCookies.length)
          console.log('🍪 Auth cookies:', allCookies.filter(c => c.name.includes('supabase')).map(c => `${c.name}=...${c.value.slice(-10)}`))
          return allCookies
        },
        setAll(cookiesToSet) {
          console.log('🍪 Server setAll called with:', cookiesToSet.length, 'cookies')
          cookiesToSet.forEach(({ name, value, options }) => {
            console.log('🍪 Setting cookie:', name, 'value length:', value?.length || 0, 'options:', options)
          })
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
            console.log('✅ All cookies set successfully')
          } catch (error) {
            console.error('❌ Cookie setting error:', error)
            // Don't silently ignore - this might be the issue
            throw error
          }
        },
      },
    }
  )
}

export const createServerClient = createClient