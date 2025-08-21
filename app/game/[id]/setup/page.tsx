import { createServerClientR, isSupabaseConfigured } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import GameSetupContent from "@/components/game-setup-content"

export default async function GameSetup({ params }: { params: { id: string } }) {
  // If Supabase is not configured, show setup message directly
  if (!isSupabaseConfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <h1 className="text-2xl font-bold mb-4 text-gray-900">Connect Supabase to get started</h1>
      </div>
    )
  }

  const supabase = await createServerClientR()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/")
  }

  // Get game data with all related information
  const { data: game } = await supabase
    .from("games")
    .select(`
      *,
      game_players(
        player_id,
        profiles(username, email)
      ),
      card_sets(*),
      maps(*)
    `)
    .eq("id", params.id)
    .single()

  if (!game) {
    redirect("/dashboard")
  }

  return <GameSetupContent game={game} user={user} />
}
