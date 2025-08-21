import { createBrowserClient } from "@supabase/ssr"

// Create a singleton instance of the Supabase client for Client Components
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)
