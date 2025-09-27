import { createServerClientReadOnly } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AuthForm from "@/components/auth-form";

export default async function HomePage() {
    const supabase = await createServerClientReadOnly();
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (user) redirect("/dashboard");

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex p-4">
            <div className="w-full max-w-md m-auto">
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold text-gray-900 mb-2">TrainLag</h1>
                    <p className="text-gray-600">Pray that your bus derails</p>
                </div>
                <AuthForm />
            </div>
        </div>
    );
}
