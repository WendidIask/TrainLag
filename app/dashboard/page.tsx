import { createServerClientReadOnly } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import DashboardContent from "@/components/dashboard-content";

export default async function Dashboard() {
    const supabase = await createServerClientReadOnly();
    const { data } = await supabase.auth.getUser();
    const { user } = data;
    if (!user) redirect("/");

    const { data: games } = await supabase
        .from("games")
        .select(
            `*,
            game_players!inner(player_id),
            profiles!games_creator_id_fkey(username)`,
        )
        .or(`creator_id.eq.${user.id}`);
      
    
    
    // Fix by also showing games where the user is a player. Its bugged.
    return <DashboardContent user={user} games={games || []} />;
}
