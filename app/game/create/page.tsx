import { createServerClientReadOnly } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import CreateGameForm from "@/components/create-game-form";

export default async function CreateGame() {
    const supabase = await createServerClientReadOnly();
    const { data } = await supabase.auth.getUser();
    const { user } = data;
    if (!user) redirect("/");

    return <CreateGameForm user={user} />;
}
