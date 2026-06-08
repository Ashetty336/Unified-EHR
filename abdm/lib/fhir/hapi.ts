const HAPI_BASE = process.env.HAPI_FHIR_URL ?? 'http://localhost:8080/fhir'

async function hapiRequest<T>(
  method: string,
  path: string,
  body?: object
): Promise<T> {
  const res = await fetch(`${HAPI_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/fhir+json',
      'Accept': 'application/fhir+json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HAPI ${method} ${path} → ${res.status}: ${text}`)
  }

  return res.json() as Promise<T>
}

// Store a full FHIR Bundle (transaction or batch). Returns the response Bundle.
export async function storeFhirBundle(bundle: object): Promise<object> {
  const b = bundle as Record<string, unknown>
  if (b.resourceType !== 'Bundle' || (b.type !== 'transaction' && b.type !== 'batch')) {
    throw new Error('bundle must be type=transaction or type=batch')
  }
  return hapiRequest<object>('POST', '/', bundle)
}

type PatientResourceType =
  | 'Patient'
  | 'Observation'
  | 'MedicationRequest'
  | 'MedicationStatement'
  | 'Medication'
  | 'Condition'
  | 'AllergyIntolerance'
  | 'Procedure'
  | 'Encounter'
  | 'Immunization'
  | 'DiagnosticReport'
  | 'DocumentReference'

// Fetch all resources of a type for a patient by FHIR patient ID.
// Optional tagFilter scopes the query to resources tagged with that system|code.
export async function fetchPatientResources(
  patientFhirId: string,
  resourceType: PatientResourceType,
  tagFilter?: { system: string; code: string },
): Promise<object> {
  if (resourceType === 'Patient') {
    if (tagFilter) {
      const tagParam = encodeURIComponent(`${tagFilter.system}|${tagFilter.code}`)
      const bundle = await hapiRequest<{ entry?: { resource?: object }[] }>(
        'GET',
        `/Patient?_id=${patientFhirId}&_tag=${tagParam}`,
      )
      const r = bundle.entry?.[0]?.resource
      if (!r) throw new Error(`Patient ${patientFhirId} not visible under tag`)
      return r
    }
    return hapiRequest<object>('GET', `/Patient/${patientFhirId}`)
  }
  const tagQ = tagFilter
    ? `&_tag=${encodeURIComponent(`${tagFilter.system}|${tagFilter.code}`)}`
    : ''
  return hapiRequest<object>('GET', `/${resourceType}?patient=${patientFhirId}&_count=200${tagQ}`)
}

// Fetch all resources of a type that carry a given tag, irrespective of patient.
// Used to scoop up every resource produced by a single upload (urn:upload|<id>).
export async function fetchResourcesByTag(
  resourceType: PatientResourceType,
  tagFilter: { system: string; code: string },
): Promise<object> {
  const tagParam = encodeURIComponent(`${tagFilter.system}|${tagFilter.code}`)
  return hapiRequest<object>('GET', `/${resourceType}?_tag=${tagParam}&_count=200`)
}

// Find every distinct Patient resource that has a given identifier (e.g. ABHA number).
// Returns one entry per distinct fhir_patient_id along with its first hospital tag (if any).
export async function findAllPatientsByAbha(
  abhaNumber: string,
): Promise<{ id: string; hospitalCode: string | null; resource: Record<string, unknown> }[]> {
  const idQ = `identifier=${encodeURIComponent('urn:abha|' + abhaNumber)}`
  const bundle = await hapiRequest<{
    entry?: { resource?: Record<string, unknown> & { id?: string; resourceType?: string; meta?: { tag?: { system?: string; code?: string }[] } } }[]
  }>('GET', `/Patient?${idQ}&_sort=-_lastUpdated&_count=50`)
  const seen = new Set<string>()
  const results: { id: string; hospitalCode: string | null; resource: Record<string, unknown> }[] = []
  for (const e of bundle.entry ?? []) {
    const r = e.resource
    if (!r || r.resourceType !== 'Patient' || !r.id) continue
    if (seen.has(r.id)) continue
    seen.add(r.id)
    const hospitalTag = (r.meta?.tag ?? []).find((t) => t.system === 'urn:hospital')
    results.push({
      id: r.id,
      hospitalCode: hospitalTag?.code ?? null,
      resource: r,
    })
  }
  return results
}

// Look up Patient resource by ABHA identifier, optionally filtered by hospital tag.
// Returns the most-recently-updated matching Patient.
export async function findPatientByAbha(
  abhaNumber: string,
  tagFilter?: { system: string; code: string },
): Promise<{ id: string; resource: object } | null> {
  const idQ = `identifier=${encodeURIComponent('urn:abha|' + abhaNumber)}`
  const tagQ = tagFilter
    ? `&_tag=${encodeURIComponent(`${tagFilter.system}|${tagFilter.code}`)}`
    : ''
  const bundle = await hapiRequest<{ entry?: { resource?: { id?: string; resourceType?: string; meta?: { lastUpdated?: string } } }[] }>(
    'GET',
    `/Patient?${idQ}${tagQ}&_sort=-_lastUpdated&_count=1`,
  )
  const entry = bundle.entry?.find((e) => e.resource?.resourceType === 'Patient' && e.resource?.id)
  if (!entry?.resource?.id) return null
  return { id: entry.resource.id, resource: entry.resource as object }
}

// Create a single FHIR resource. Returns created resource with server-assigned ID.
export async function createFhirResource(
  resourceType: string,
  resource: object
): Promise<object & { id: string }> {
  return hapiRequest<object & { id: string }>('POST', `/${resourceType}`, resource)
}

// Read a single resource by type + ID.
export async function getFhirResource(
  resourceType: string,
  id: string
): Promise<object> {
  return hapiRequest<object>('GET', `/${resourceType}/${id}`)
}

// Delete a resource (used for cleanup/test scenarios).
export async function deleteFhirResource(
  resourceType: string,
  id: string
): Promise<void> {
  const res = await fetch(`${HAPI_BASE}/${resourceType}/${id}`, {
    method: 'DELETE',
    headers: { Accept: 'application/fhir+json' },
  })
  if (!res.ok && res.status !== 404) {
    throw new Error(`HAPI DELETE /${resourceType}/${id} → ${res.status}`)
  }
}
