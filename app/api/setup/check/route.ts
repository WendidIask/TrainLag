import { NextResponse } from "next/server"
import { createServerClientR } from "@/lib/supabase/server"

export async function POST(req: Request) {
  const { username } = await req.json()
  const supabase = await createServerClientR()

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username")
    .or(`email.eq.${username},username.eq.${username}`)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ exists: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    exists: !!data,
    player: data ? { id: data.id, username: data.username } : null,
  })
}
