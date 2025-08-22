import { createServerClientR } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import AuthForm from "@/components/auth-form"

export default async function HomePage() {
  const supabase = await createServerClientR()
  const { data: { user } } = await supabase.auth.getUser()

  // Only redirect if session is present
  if (user) redirect("/dashboard")

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">TrainLag</h1>
          <p className="text-gray-600">Pray that your bus doesn't derail</p>
        </div>
        <AuthForm />
      </div>
    </div>
  )
}
