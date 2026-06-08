import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { createFhirResource } from '@/lib/fhir/hapi'
import { auditLog } from '@/lib/audit'
import { adminClient } from '@/lib/supabase/admin'

// POST /api/fhir/prescriptions
// Doctor creates a MedicationRequest FHIR resource for a patient.
// Prescribing is a write action by the treating clinician — it does not require
// an approved data-sharing consent (those gate read access to existing records).
// Body: { abha_number, medication, status?, dosageInstruction? }
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'doctor')
  if (!auth.ok) return auth.response

  const body = await req.json()
  const { abha_number, medication, status = 'active', dosageInstruction } = body

  if (!abha_number || !medication) {
    return NextResponse.json({ error: 'abha_number and medication required' }, { status: 400 })
  }

  // Resolve ABHA → patient UUID + FHIR patient ID
  const { data: abha, error: abhaErr } = await adminClient
    .from('abha_registry')
    .select('patient_id')
    .eq('abha_number', abha_number)
    .single()

  if (abhaErr || !abha) {
    return NextResponse.json({ error: 'patient not found' }, { status: 404 })
  }

  const { data: patient, error: patientErr } = await adminClient
    .from('patients')
    .select('user_id, fhir_patient_id')
    .eq('patient_id', abha.patient_id)
    .single()

  if (patientErr || !patient?.fhir_patient_id) {
    return NextResponse.json({ error: 'patient has no FHIR record' }, { status: 404 })
  }

  const resource = {
    resourceType: 'MedicationRequest',
    status,
    intent: 'order',
    medicationCodeableConcept: {
      text: medication,
      coding: [{ display: medication }],
    },
    subject: { reference: `Patient/${patient.fhir_patient_id}` },
    authoredOn: new Date().toISOString(),
    ...(dosageInstruction
      ? { dosageInstruction: [{ text: dosageInstruction }] }
      : {}),
  }

  let created: { id: string }
  try {
    created = await createFhirResource('MedicationRequest', resource)
  } catch (err) {
    console.error('[fhir/prescriptions] create error:', err)
    return NextResponse.json({ error: 'failed to create FHIR resource' }, { status: 502 })
  }

  // Index the prescription so the patient dashboard can list it with doctor metadata.
  const { error: insertErr } = await adminClient.from('prescriptions').insert({
    patient_user_id: patient.user_id,
    doctor_user_id: auth.profile.user_id,
    fhir_resource_id: created.id,
    medication,
    dosage: dosageInstruction ?? null,
    status,
  })
  if (insertErr) {
    console.error('[fhir/prescriptions] index insert error:', insertErr)
  }

  auditLog({
    accessed_by: auth.profile.user_id,
    accessor_role: auth.profile.role,
    patient_id: abha.patient_id,
    action: 'fhir_upload',
    resource_type: 'MedicationRequest',
    fhir_resource_id: created.id,
  })

  return NextResponse.json({ ok: true, fhir_id: created.id }, { status: 201 })
}
