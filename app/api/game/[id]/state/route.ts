import { createServerClientReadOnly } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerClientReadOnly();

    try {
        const { data: gameState, error } = await supabase
        .from("game_state")
        .select("*")
        .eq("game_id", id)
        .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json(gameState);
    } catch (error) {
        console.error("API error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
