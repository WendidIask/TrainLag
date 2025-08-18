'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function signIn(prevState: any, formData: FormData) {
  console.log('🔐 signIn action started')
  
  const supabase = await createClient()

  const data = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  }

  console.log('📧 Attempting sign in for:', data.email)

  const { data: authData, error } = await supabase.auth.signInWithPassword(data)

  if (error) {
    console.log('❌ Login error:', error.message)
    return { error: error.message }
  }

  console.log('✅ Login successful!')
  console.log('👤 User:', authData.user?.email)
  console.log('🎫 Session exists:', !!authData.session)

  // Force a session refresh to ensure cookies are set
  await supabase.auth.getSession()
  
  // Wait a tiny bit for cookies to be set
  await new Promise(resolve => setTimeout(resolve, 100))

  console.log('🔄 Revalidating all paths...')
  // Revalidate more aggressively
  revalidatePath('/', 'layout')
  revalidatePath('/dashboard', 'page')
  
  console.log('🚀 Redirecting to dashboard...')
  redirect('/dashboard')
}

export async function signUp(prevState: any, formData: FormData) {
  const supabase = await createClient()

  const data = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  }

  const { error } = await supabase.auth.signUp(data)

  if (error) {
    console.log('❌ Signup error:', error.message)
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
  return { success: 'Account created successfully! You can now sign in.' }
}

export async function signOut() {
  const supabase = await createClient()
  
  const { error } = await supabase.auth.signOut()
  
  if (error) {
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
  redirect('/')
}