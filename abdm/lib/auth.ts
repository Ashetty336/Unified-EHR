import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'

export type UserProfile = {
  user_id: string
  email: string
  role: 'patient' | 'doctor' | 'hospital' | 'admin'
  full_name: string | null
}

type AuthResult =
  | { ok: true; profile: UserProfile }
  | { ok: false; response: NextResponse }

// Verify session and return user profile. Uses service role for read to bypass RLS.
export async function requireAuth(req: NextRequest): Promise<AuthResult> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return { ok: false, response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) }
  }

  const { data: profile, error: profileErr } = await adminClient
    .from('users')
    .select('user_id, email, role, full_name')
    .eq('user_id', user.id)
    .single()

  if (profileErr || !profile) {
    return { ok: false, response: NextResponse.json({ error: 'profile not found' }, { status: 404 }) }
  }

  return { ok: true, profile: profile as UserProfile }
}

// requireAuth + role check
export async function requireRole(
  req: NextRequest,
  ...roles: UserProfile['role'][]
): Promise<AuthResult> {
  const result = await requireAuth(req)
  if (!result.ok) return result

  if (!roles.includes(result.profile.role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'forbidden' }, { status: 403 }),
    }
  }

  return result
}
