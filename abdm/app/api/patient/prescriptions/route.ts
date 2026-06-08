import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { adminClient } from '@/lib/supabase/admin'

// GET /api/patient/prescriptions
// Lists every MedicationRequest a doctor has written for this patient, with the
// prescribing doctor + their hospital so the patient can see who prescribed what.
export async function GET(req: Request) {
  const auth = await requireRole(req as never, 'patient')
  if (!auth.ok) return auth.response

  const { data: rows, error } = await adminClient
    .from('prescriptions')
    .select('prescription_id, doctor_user_id, fhir_resource_id, medication, dosage, status, created_at')
    .eq('patient_user_id', auth.profile.user_id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'failed to load prescriptions' }, { status: 500 })
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json({ prescriptions: [] })
  }

  const doctorIds = Array.from(new Set(rows.map((r) => r.doctor_user_id as string)))

  const [{ data: users }, { data: doctors }] = await Promise.all([
    adminClient
      .from('users')
      .select('user_id, full_name, email')
      .in('user_id', doctorIds),
    adminClient
      .from('doctors')
      .select('user_id, specialization, license_number, hospital_id, hospitals(name, registration_no)')
      .in('user_id', doctorIds),
  ])

  type UserRow = { user_id: string; full_name: string | null; email: string }
  type DoctorRow = {
    user_id: string
    specialization: string | null
    license_number: string | null
    hospital_id: string | null
    hospitals: { name: string | null; registration_no: string | null } | { name: string | null; registration_no: string | null }[] | null
  }

  const userMap = new Map<string, UserRow>(((users ?? []) as UserRow[]).map((u) => [u.user_id, u]))
  const doctorMap = new Map<string, DoctorRow>(((doctors ?? []) as DoctorRow[]).map((d) => [d.user_id, d]))

  const prescriptions = rows.map((r) => {
    const u = userMap.get(r.doctor_user_id as string)
    const d = doctorMap.get(r.doctor_user_id as string)
    const hosp = Array.isArray(d?.hospitals) ? d?.hospitals?.[0] : d?.hospitals
    return {
      prescription_id: r.prescription_id,
      fhir_resource_id: r.fhir_resource_id,
      medication: r.medication,
      dosage: r.dosage,
      status: r.status,
      created_at: r.created_at,
      doctor: {
        full_name: u?.full_name ?? null,
        email: u?.email ?? null,
        specialization: d?.specialization ?? null,
        license_number: d?.license_number ?? null,
        hospital_name: hosp?.name ?? null,
        hospital_registration_no: hosp?.registration_no ?? null,
      },
    }
  })

  return NextResponse.json({ prescriptions })
}
