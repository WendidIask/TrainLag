import { createServerClientReadOnly } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import GamePlayContent from "@/components/game-play-content";

export default async function GamePlay({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    const supabase = await createServerClientReadOnly();

    // Get session (cheaper than getUser spam)
    const {
        data: { session },
    } = await supabase.auth.getSession();

    const user = session?.user;
    if (!user) redirect("/");

    // Single query for game data
    const { data: game } = await supabase
        .from("games")
        .select(
            `*, 
            game_players(
                player_id, 
                profiles(username, email)
            ),
            card_sets(*),
            maps(*),
            game_state(*)`
        )
        .eq("id", id)
        .single();

    if (!game || game.status !== "active") redirect("/dashboard");

    const isPlayerInGame = game.game_players.some((gp: any) => gp.player_id === user.id);
    if (!isPlayerInGame) redirect("/dashboard");

    return <GamePlayContent game={game} user={user} />;
}
