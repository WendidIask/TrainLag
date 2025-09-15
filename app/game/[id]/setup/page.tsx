import { createServerClientReadOnly } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import GameSetupContent from "@/components/game-setup-content";

export default async function GameSetup({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = await params;

    const supabase = await createServerClientReadOnly();
    const { data } = await supabase.auth.getSession();
    const user = data?.session?.user;
    if (!user) redirect("/");

    const { data: game } = await supabase
        .from("games")
        .select(
            `*,
            game_players(
                player_id,
                profiles(username, email)
            ),
            card_sets(*),
            maps(*)`,
        )
        .eq("id", resolvedParams.id)
        .single();

    if (!game) redirect("/dashboard");

    return <GameSetupContent game={game} user={user} />;
}
