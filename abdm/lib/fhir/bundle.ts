// Helpers for shaping FHIR bundles before HAPI store.

type FhirResource = Record<string, unknown>
type FhirEntry = Record<string, unknown> & { resource?: FhirResource; request?: { method?: string; url?: string } }

export type ResourceTag = { system: string; code: string }

// Stamp every resource in a bundle with the given meta.tag entries (deduped).
export function tagBundleResources(entries: FhirEntry[], tags: ResourceTag[]): void {
  if (tags.length === 0) return
  for (const entry of entries) {
    const resource = entry.resource
    if (!resource) continue
    const meta = (resource.meta as Record<string, unknown> | undefined) ?? {}
    const existing = Array.isArray(meta.tag) ? (meta.tag as Record<string, unknown>[]) : []
    for (const t of tags) {
      const has = existing.some((e) => e.system === t.system && e.code === t.code)
      if (!has) existing.push({ system: t.system, code: t.code })
    }
    resource.meta = { ...meta, tag: existing }
  }
}

// Inject ABHA identifier into Patient resources (in place).
export function injectAbhaIdentifier(entries: FhirEntry[], abhaNumber: string): void {
  for (const entry of entries) {
    const resource = entry.resource
    if (resource?.resourceType !== 'Patient') continue
    const ids = Array.isArray(resource.identifier)
      ? (resource.identifier as Record<string, unknown>[])
      : []
    const has = ids.some((i) => i.system === 'urn:abha' && i.value === abhaNumber)
    if (!has) {
      resource.identifier = [...ids, { system: 'urn:abha', value: abhaNumber, use: 'official' }]
    }
  }
}

// Convert a converter-emitted Bundle (mixed types) into a HAPI batch with proper request URLs.
// Preserves resource IDs so cross-references inside the bundle keep working.
export function toBatchBundle(bundle: Record<string, unknown>): Record<string, unknown> {
  const entries = Array.isArray(bundle.entry) ? (bundle.entry as FhirEntry[]) : []
  return {
    ...bundle,
    resourceType: 'Bundle',
    type: 'batch',
    entry: entries.map((entry) => {
      const resource = entry.resource as { resourceType?: string; id?: string } | undefined
      const existing = entry.request
      const method = existing?.method ?? (resource?.id ? 'PUT' : 'POST')
      const url =
        existing?.url ??
        (resource?.id ? `${resource.resourceType}/${resource.id}` : (resource?.resourceType ?? 'Unknown'))
      return { ...entry, request: { method, url } }
    }),
  }
}
