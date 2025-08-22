import { createServerClient as createSupabaseServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const isSupabaseConfigured =
    typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string" &&
    process.env.NEXT_PUBLIC_SUPABASE_URL.length > 0 &&
    typeof process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "string" &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 0;

export async function createClient() {
    const cookieStore = await cookies();
    return createSupabaseServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get: (name: string) => cookieStore.get(name)?.value,
                set: (key: string, value: string, options: any) => {
                    cookieStore.set(key, value, options);
                },
                remove: (key: string) => {
                    cookieStore.delete(key);
                },
            },
        },
    );
}

export async function createClientReadOnly() {
    const cookieStore = await cookies();
    return createSupabaseServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get: (name: string) => cookieStore.get(name)?.value,
            },
        },
    );
}

export const createServerClient = createClient;
export const createServerClientReadOnly = createClientReadOnly;
