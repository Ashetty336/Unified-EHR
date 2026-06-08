import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { adminClient } from '@/lib/supabase/admin'
import { findAllPatientsByAbha } from '@/lib/fhir/hapi'

// GET /api/patient/link-records
// Returns Patient resources in HAPI matching the user's ABHA number that are not
// linked to their account yet (different fhir_patient_id, not already linked).
//
// POST /api/patient/link-records { fhir_patient_id }
// Persists a link between the user and the external Patient resource.

async function getCandidates(userId: string) {
  const { data: patient } = await adminClient
    .from('patients')
    .select('abha_number, fhir_patient_id')
    .eq('user_id', userId)
    .single()

  if (!patient?.abha_number) return { abha: null, ownId: null, candidates: [] }

  const all = await findAllPatientsByAbha(patient.abha_number)
  const { data: existingLinks } = await adminClient
    .from('linked_patient_records')
    .select('fhir_patient_id')
    .eq('user_id', userId)
  const linkedSet = new Set((existingLinks ?? []).map((l) => l.fhir_patient_id as string))

  const candidates = all.filter(
    (p) => p.id !== patient.fhir_patient_id && !linkedSet.has(p.id),
  )

  // Decorate with hospital name when hospital_code looks like a UUID we know.
  const hospitalIds = Array.from(
    new Set(candidates.map((c) => c.hospitalCode).filter((c): c is string => !!c && c !== 'self')),
  )
  let hospitalMap = new Map<string, string>()
  if (hospitalIds.length > 0) {
    const { data: hospitals } = await adminClient
      .from('hospitals')
      .select('hospital_id, name')
      .in('hospital_id', hospitalIds)
    hospitalMap = new Map((hospitals ?? []).map((h) => [h.hospital_id as string, h.name as string]))
  }

  const decorated = candidates.map((c) => ({
    fhir_patient_id: c.id,
    hospital_code: c.hospitalCode,
    hospital_name:
      c.hospitalCode === 'self'
        ? 'Self upload'
        : c.hospitalCode
          ? hospitalMap.get(c.hospitalCode) ?? 'Unknown hospital'
          : 'Unknown source',
    last_updated: ((c.resource as { meta?: { lastUpdated?: string } }).meta?.lastUpdated) ?? null,
  }))

  return { abha: patient.abha_number, ownId: patient.fhir_patient_id, candidates: decorated }
}

export async function GET(req: Request) {
  const auth = await requireRole(req as never, 'patient')
  if (!auth.ok) return auth.response

  const { abha, candidates } = await getCandidates(auth.profile.user_id)
  if (!abha) {
    return NextResponse.json({ error: 'no ABHA number on profile' }, { status: 404 })
  }
  return NextResponse.json({ abha, candidates })
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'patient')
  if (!auth.ok) return auth.response

  let body: { fhir_patient_id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  const fhirPatientId = body.fhir_patient_id?.trim()
  if (!fhirPatientId) {
    return NextResponse.json({ error: 'fhir_patient_id is required' }, { status: 400 })
  }

  // Verify candidate is real and matches the user's ABHA before linking.
  const { candidates } = await getCandidates(auth.profile.user_id)
  const match = candidates.find((c) => c.fhir_patient_id === fhirPatientId)
  if (!match) {
    return NextResponse.json({ error: 'record is not a valid candidate' }, { status: 422 })
  }

  const { data: patient } = await adminClient
    .from('patients')
    .select('abha_number')
    .eq('user_id', auth.profile.user_id)
    .single()

  const { error } = await adminClient.from('linked_patient_records').insert({
    user_id: auth.profile.user_id,
    abha_number: patient?.abha_number ?? '',
    fhir_patient_id: fhirPatientId,
    hospital_code: match.hospital_code ?? null,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
