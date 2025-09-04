import { createServerClientReadOnly } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const supabase = await createServerClientReadOnly();
    
    // Clean up expired roadblocks first
    await supabase
        .from("roadblocks")
        .delete()
        .eq("game_id", id)
        .lt("expires_at", new Date().toISOString());
    
    // Fetch active roadblocks
    const { data: roadblocks, error } = await supabase
        .from("roadblocks")
        .select("*")
        .eq("game_id", id)
        .gt("expires_at", new Date().toISOString());
    
    if (error) {
        console.log(error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json(roadblocks);
}