import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST /api/auth/login
// Body: { email: string }
// Sends 6-digit OTP. User must already have an account (shouldCreateUser: false).
export async function POST(req: NextRequest) {
  const { email } = await req.json()

  if (!email) {
    return NextResponse.json({ error: 'email required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false, // prevents magic link fallback for unknown emails
    },
  })

  if (error) {
    // Supabase returns "Signups not allowed" when email not found + shouldCreateUser:false
    if (error.message.includes('not allowed') || error.message.includes('not found')) {
      return NextResponse.json({ error: 'no account found for this email' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ message: 'OTP sent' })
}
