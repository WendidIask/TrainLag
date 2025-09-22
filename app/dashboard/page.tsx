import { createServerClientReadOnly } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import DashboardContent from "@/components/dashboard-content";

export default async function Dashboard() {
    const supabase = await createServerClientReadOnly();
    const { data } = await supabase.auth.getSession();
    const user = data?.session?.user;
    if (!user) redirect("/");

    const { data: games, error: e2 } = await supabase
    .from("games")
    .select(`
        *,
        game_players(player_id),
        profiles!games_creator_id_fkey(username)
    `)
    .eq("game_players.player_id", user.id);

    return <DashboardContent user={user} games={games || []} />;
}
