import { createServerClientR } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import CreateGameForm from "@/components/create-game-form"

export default async function CreateGame() {
  const supabase = await createServerClientR()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/")

  return <CreateGameForm user={user} />
}
