import { createClient, isSupabaseConfigured } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import DashboardContent from "@/components/dashboard-content"

export default async function Dashboard() {
  // If Supabase is not configured, show setup message directly
  if (!isSupabaseConfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <h1 className="text-2xl font-bold mb-4 text-gray-900">Connect Supabase to get started</h1>
      </div>
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // If no user, redirect to login
  if (!user) {
    redirect("/")
  }

  // Get user's games from database
  const { data: games } = await supabase
    .from("games")
    .select(`
      *,
      game_players!inner(player_id),
      profiles!games_creator_id_fkey(username)
    `)
    .or(`creator_id.eq.${user.id},game_players.player_id.eq.${user.id}`)

  return <DashboardContent user={user} games={games || []} />
}
