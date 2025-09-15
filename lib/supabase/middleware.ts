import { createServerClientReadOnly } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(req: NextRequest) {
    const response = NextResponse.next();

    const supabase = await createServerClientReadOnly();
    const { data } = await supabase.auth.getSession();
    const user = data?.session?.user;

    const pathname = req.nextUrl.pathname.match(/\/(.*)\//);
    const protectedRoutes = new Set(["dashboard", "game", "create-game"]);

    if (pathname && protectedRoutes.has(pathname[1]) && !user) {
        const url = req.nextUrl.clone();
        url.pathname = "/";
        return NextResponse.redirect(url);
    }

    return response;
}
