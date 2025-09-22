import { createServerClientReadOnly } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const supabase = await createServerClientReadOnly();
    
    // Fetch active curses
    const { data: curses, error } = await supabase
        .from("curses")
        .select("*")
        .eq("game_id", id)
    
    if (error) {
        console.log(error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json(curses);
}