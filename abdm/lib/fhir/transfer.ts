// Cross-hospital resource visibility transfer.
// Adds the requesting hospital's tag to existing resources for a patient,
// optionally filtered by resource type. Resources stay singletons in HAPI
// — we do not copy/duplicate. We just widen who can see them.

import { adminClient } from '@/lib/supabase/admin'

const HAPI_BASE = process.env.HAPI_FHIR_URL ?? 'http://localhost:8080/fhir'

const TRANSFERABLE_TYPES = [
  'Patient',
  'Observation',
  'Condition',
  'AllergyIntolerance',
  'Procedure',
  'MedicationStatement',
  'MedicationRequest',
  'Medication',
  'DiagnosticReport',
  'Encounter',
  'Immunization',
  'DocumentReference',
] as const

type FhirResource = Record<string, unknown> & {
  resourceType?: string
  id?: string
  meta?: { tag?: { system?: string; code?: string }[] }
}

type FhirBundle = { entry?: { resource?: FhirResource }[] }

async function hapiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${HAPI_BASE}${path}`, {
    headers: { Accept: 'application/fhir+json' },
  })
  if (!res.ok) throw new Error(`HAPI GET ${path} → ${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}

async function hapiPut(resourceType: string, id: string, body: object): Promise<void> {
  const res = await fetch(`${HAPI_BASE}/${resourceType}/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/fhir+json',
      Accept: 'application/fhir+json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`HAPI PUT /${resourceType}/${id} → ${res.status}: ${await res.text()}`)
  }
}

// Resolve hospital tag code for a requester user_id (hospital or doctor).
export async function resolveRequesterHospitalCode(
  requesterUserId: string,
  requesterRole: 'hospital' | 'doctor',
): Promise<string | null> {
  if (requesterRole === 'hospital') {
    const { data } = await adminClient
      .from('hospitals')
      .select('hospital_id')
      .eq('user_id', requesterUserId)
      .single()
    return data?.hospital_id ?? null
  }
  const { data } = await adminClient
    .from('doctors')
    .select('hospital_id')
    .eq('user_id', requesterUserId)
    .single()
  return data?.hospital_id ?? null
}

export type TransferStats = {
  scanned: number
  transferred: number
  skipped: number
  byType: Record<string, number>
  errors: string[]
}

// Stamp resources for the patient (filtered by ABHA tag) with the requester's hospital tag.
// scopeTypes empty / undefined = full access. Otherwise restricted to listed FHIR types.
export async function transferPatientResourcesToHospital(opts: {
  abhaNumber: string
  requesterHospitalCode: string
  scopeTypes?: string[]
}): Promise<TransferStats> {
  const { abhaNumber, requesterHospitalCode, scopeTypes } = opts
  const stats: TransferStats = { scanned: 0, transferred: 0, skipped: 0, byType: {}, errors: [] }
  const tagParam = encodeURIComponent(`urn:abha|${abhaNumber}`)
  const allowed = scopeTypes && scopeTypes.length > 0
    ? new Set(scopeTypes.map((s) => s.toLowerCase()))
    : null

  for (const rt of TRANSFERABLE_TYPES) {
    if (allowed && !allowed.has(rt.toLowerCase()) && rt !== 'Patient') {
      // Patient resource always transferred so requester can resolve identity.
      continue
    }
    let bundle: FhirBundle
    try {
      bundle = await hapiGet<FhirBundle>(`/${rt}?_tag=${tagParam}&_count=200`)
    } catch (err) {
      stats.errors.push(`${rt} fetch: ${err instanceof Error ? err.message : String(err)}`)
      continue
    }
    const resources = bundle.entry?.map((e) => e.resource).filter((r): r is FhirResource => !!r) ?? []
    for (const resource of resources) {
      stats.scanned++
      if (!resource.id || !resource.resourceType) {
        stats.skipped++
        continue
      }
      const meta = resource.meta ?? {}
      const tags = Array.isArray(meta.tag) ? meta.tag : []
      const alreadyTagged = tags.some(
        (t) => t.system === 'urn:hospital' && t.code === requesterHospitalCode,
      )
      if (alreadyTagged) {
        stats.skipped++
        continue
      }
      const updated: FhirResource = {
        ...resource,
        meta: {
          ...meta,
          tag: [...tags, { system: 'urn:hospital', code: requesterHospitalCode }],
        },
      }
      try {
        await hapiPut(resource.resourceType, resource.id, updated)
        stats.transferred++
        stats.byType[resource.resourceType] = (stats.byType[resource.resourceType] ?? 0) + 1
      } catch (err) {
        stats.errors.push(`${resource.resourceType}/${resource.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  return stats
}
