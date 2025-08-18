import { createClient, isSupabaseConfigured } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import GamePlayContent from "@/components/game-play-content"

export default async function GamePlay({ params }: { params: { id: string } }) {
  // If Supabase is not configured, show setup message directly
  if (!isSupabaseConfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <h1 className="text-2xl font-bold mb-4 text-gray-900">Connect Supabase to get started</h1>
      </div>
    )
  }

  const supabase = createClient()
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
      maps(*),
      game_state(*)
    `)
    .eq("id", params.id)
    .single()

  if (!game || game.status !== "active") {
    redirect("/dashboard")
  }

  // Check if user is part of this game
  const isPlayerInGame = game.game_players.some((gp: any) => gp.player_id === user.id)
  if (!isPlayerInGame) {
    redirect("/dashboard")
  }

  return <GamePlayContent game={game} user={user} />
}
