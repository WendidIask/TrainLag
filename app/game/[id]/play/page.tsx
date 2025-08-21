import { createServerClientR } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import GamePlayContent from "@/components/game-play-content"

export default async function GamePlay({ params }: { params: { id: string } }) {
  const supabase = await createServerClientR()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/")

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

  if (!game || game.status !== "active") redirect("/dashboard")

  // Check if user is part of this game
  const isPlayerInGame = game.game_players.some((gp: any) => gp.player_id === user.id)
  if (!isPlayerInGame) redirect("/dashboard")

  return <GamePlayContent game={game} user={user} />
}
