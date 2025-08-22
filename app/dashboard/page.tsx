import { createServerClientR } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import DashboardContent from "@/components/dashboard-content"

export default async function Dashboard() {
  const supabase = await createServerClientR()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/")

  // Get user's games from database
  const { data: games } = await supabase.from("games")
    .select(`
      *,
      game_players!inner(player_id),
      profiles!games_creator_id_fkey(username)
    `)
    .or(`creator_id.eq.${user.id}`)
  //Fix by also showing games where the user is a player. Its bugged.
  return <DashboardContent user={user} games={games || []} />
}
