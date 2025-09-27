import { createServerClientReadOnly } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const supabase = await createServerClientReadOnly();
    
    // Fetch active challenges
    const { data: challenges, error } = await supabase
        .from("battlechallenge")
        .select("*")
        .eq("game_id", id)

    if (error) {
        console.log(error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json(challenges);
}