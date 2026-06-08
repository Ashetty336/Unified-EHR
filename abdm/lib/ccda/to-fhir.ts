// Direct C-CDA R2.1 → FHIR R4 Bundle converter.
//
// Replaces the Microsoft FHIR Converter for CCDA input. The MS converter ships
// generic Liquid templates that drop or mangle several CCDA sections in our
// HAPI deployment (medications, encounters, immunizations, diagnostic reports
// often missing). This mapper walks the CCDA DOM directly with fast-xml-parser
// and emits a FHIR batch bundle that HAPI accepts as-is.
//
// Sections covered (with their CCDA section template root):
//   2.16.840.1.113883.10.20.22.2.6.1 / .6  → AllergyIntolerance
//   2.16.840.1.113883.10.20.22.2.1.1 / .1  → MedicationStatement
//   2.16.840.1.113883.10.20.22.2.3.1 / .3  → Observation (results) + DiagnosticReport
//   2.16.840.1.113883.10.20.22.2.5.1 / .5  → Condition (problems)
//   2.16.840.1.113883.10.20.22.2.7.1 / .7  → Procedure
//   2.16.840.1.113883.10.20.22.2.22       → Encounter
//   2.16.840.1.113883.10.20.22.2.4.1       → Observation (vital signs)
//   2.16.840.1.113883.10.20.22.2.2         → Immunization
//
// Resource ids are deterministic UUIDs derived from the CCDA entry id when
// available — keeps re-uploads idempotent and lets HAPI PUT-merge updates.

import { XMLParser } from 'fast-xml-parser'
import { createHash, randomUUID } from 'node:crypto'

type FhirResource = Record<string, unknown> & { resourceType: string; id: string }
type Entry = {
  fullUrl: string
  resource: FhirResource
  request: { method: 'PUT'; url: string }
}
export type CcdaBundle = { resourceType: 'Bundle'; type: 'collection'; entry: Entry[] }

// fast-xml-parser config — preserve attributes (with `_` prefix), keep arrays
// where multiple repeats are possible, allow text nodes via `#text`.
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '_',
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
  textNodeName: '#text',
  isArray: (name) =>
    [
      'templateId',
      'entry',
      'component',
      'section',
      'entryRelationship',
      'observation',
      'reference',
      'translation',
      'identifier',
      'name',
      'given',
      'addr',
      'telecom',
      'organizer',
      'act',
      'procedure',
      'encounter',
      'substanceAdministration',
      'supply',
      'value',
      'streetAddressLine',
      'languageCommunication',
      'participant',
    ].includes(name),
})

// ─── helpers ─────────────────────────────────────────────────────────────────

function deterministicId(seed: string | undefined, fallback?: string): string {
  if (!seed) return fallback ?? randomUUID()
  // UUID v4-shape derived from sha1 — stable across runs for the same seed.
  const hex = createHash('sha1').update(seed).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${(((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16))}${hex.slice(18, 20)}-${hex.slice(20, 32)}`
}

function pickArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return []
  return Array.isArray(v) ? v : [v]
}

function pickFirst<T>(v: T | T[] | undefined): T | undefined {
  return pickArray(v)[0]
}

// HL7 dateTime "YYYYMMDDHHMMSS[+-ZZZZ]" → ISO. Accepts shorter (date only).
function fmtDateTime(v: string | undefined): string | undefined {
  if (!v) return undefined
  const s = String(v).trim()
  if (!/^\d{4}/.test(s)) return undefined
  const y = s.slice(0, 4)
  const mo = s.slice(4, 6) || '01'
  const d = s.slice(6, 8) || '01'
  const hh = s.slice(8, 10)
  const mm = s.slice(10, 12)
  const ss = s.slice(12, 14)
  if (!hh) return `${y}-${mo}-${d}`
  return `${y}-${mo}-${d}T${hh || '00'}:${mm || '00'}:${ss || '00'}Z`
}

function fmtDate(v: string | undefined): string | undefined {
  const dt = fmtDateTime(v)
  return dt ? dt.slice(0, 10) : undefined
}

// Build a CodeableConcept from a CCDA <code> element (or <value xsi:type="CD">).
function codeFromCcda(node: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!node) return undefined
  const code = node._code as string | undefined
  const system = mapCodeSystem(node._codeSystem as string | undefined)
  const display = (node._displayName as string | undefined) ?? undefined
  const text = (node._displayName as string | undefined) ?? deepText(node)
  const cc: Record<string, unknown> = {}
  if (code) {
    cc.coding = [
      {
        ...(system ? { system } : {}),
        code,
        ...(display ? { display } : {}),
      },
    ]
  }
  if (text) cc.text = text
  if (!cc.coding && !cc.text) return undefined
  return cc
}

const OID_TO_SYSTEM: Record<string, string> = {
  '2.16.840.1.113883.6.96': 'http://snomed.info/sct',
  '2.16.840.1.113883.6.1': 'http://loinc.org',
  '2.16.840.1.113883.6.88': 'http://www.nlm.nih.gov/research/umls/rxnorm',
  '2.16.840.1.113883.12.292': 'http://hl7.org/fhir/sid/cvx',
  '2.16.840.1.113883.6.238': 'urn:oid:2.16.840.1.113883.6.238',
  '2.16.840.1.113883.5.4': 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
  '2.16.840.1.113883.5.1': 'http://hl7.org/fhir/administrative-gender',
  '2.16.840.1.113883.6.103': 'http://hl7.org/fhir/sid/icd-9-cm',
  '2.16.840.1.113883.6.90': 'http://hl7.org/fhir/sid/icd-10-cm',
}

function mapCodeSystem(oid: string | undefined): string | undefined {
  if (!oid) return undefined
  return OID_TO_SYSTEM[oid] ?? `urn:oid:${oid}`
}

function deepText(node: unknown): string | undefined {
  if (node === null || node === undefined) return undefined
  if (typeof node === 'string') return node.trim() || undefined
  const obj = node as Record<string, unknown>
  if (typeof obj['#text'] === 'string') return (obj['#text'] as string).trim() || undefined
  return undefined
}

// CCDA observation values come in many xsi:type flavors.
function readValue(value: unknown): {
  valueQuantity?: { value: number; unit?: string; system?: string; code?: string }
  valueString?: string
  valueCodeableConcept?: Record<string, unknown>
} {
  if (!value) return {}
  if (Array.isArray(value)) value = value[0]
  const v = value as Record<string, unknown>
  const type = (v['_xsi:type'] as string | undefined) ?? (v._type as string | undefined)
  if (type?.endsWith('PQ')) {
    const num = Number(v._value)
    if (Number.isFinite(num)) {
      return {
        valueQuantity: {
          value: num,
          ...(v._unit ? { unit: String(v._unit), code: String(v._unit), system: 'http://unitsofmeasure.org' } : {}),
        },
      }
    }
  }
  if (type?.endsWith('CD') || type?.endsWith('CE') || type?.endsWith('CV')) {
    const cc = codeFromCcda(v)
    return cc ? { valueCodeableConcept: cc } : {}
  }
  if (type?.endsWith('ST') || type?.endsWith('ED')) {
    const t = deepText(v) ?? (v['#text'] as string | undefined)
    return t ? { valueString: String(t) } : {}
  }
  if (v._value && !Number.isNaN(Number(v._value))) {
    return { valueQuantity: { value: Number(v._value), ...(v._unit ? { unit: String(v._unit), code: String(v._unit), system: 'http://unitsofmeasure.org' } : {}) } }
  }
  const t = deepText(v)
  return t ? { valueString: t } : {}
}

function entry(resource: FhirResource): Entry {
  return {
    fullUrl: `urn:uuid:${resource.id}`,
    resource,
    request: { method: 'PUT', url: `${resource.resourceType}/${resource.id}` },
  }
}

// ─── section locator ─────────────────────────────────────────────────────────

function findSection(
  doc: Record<string, unknown>,
  templateRoot: string,
): Record<string, unknown> | null {
  const components = pickArray(
    (doc.ClinicalDocument as Record<string, unknown> | undefined)?.component as
      | Record<string, unknown>
      | Record<string, unknown>[]
      | undefined,
  )
  for (const top of components) {
    const struct = (top.structuredBody as Record<string, unknown> | undefined) ?? top
    const inner = pickArray(struct.component as Record<string, unknown> | Record<string, unknown>[])
    for (const c of inner) {
      const sections = pickArray(c.section as Record<string, unknown> | Record<string, unknown>[] | undefined)
      for (const section of sections) {
        const tids = pickArray(section.templateId as Record<string, unknown> | Record<string, unknown>[])
        if (tids.some((t) => (t._root as string | undefined) === templateRoot)) return section
      }
    }
  }
  return null
}

// ─── Patient ─────────────────────────────────────────────────────────────────

function buildPatient(doc: Record<string, unknown>, abhaNumber?: string): FhirResource {
  const recordTarget = (doc.ClinicalDocument as Record<string, unknown>)?.recordTarget as
    | Record<string, unknown>
    | undefined
  const patientRole = recordTarget?.patientRole as Record<string, unknown> | undefined
  const patientNode = patientRole?.patient as Record<string, unknown> | undefined

  const idNode = pickArray(patientRole?.id as Record<string, unknown> | Record<string, unknown>[])[0]
  const sourceId =
    (idNode?._extension as string | undefined) ??
    (idNode?._root as string | undefined) ??
    abhaNumber ??
    randomUUID()
  const id = deterministicId(`Patient|${sourceId}`)

  const nameNode = pickArray(patientNode?.name as Record<string, unknown> | Record<string, unknown>[])[0]
  const given = pickArray(nameNode?.given as string | string[]).map((g) =>
    typeof g === 'string' ? g : ((g as Record<string, unknown>)?.['#text'] as string),
  )
  const family = nameNode?.family as string | undefined
  const name: Record<string, unknown> = { use: 'official' }
  if (given.length) name.given = given
  if (family) name.family = family
  const text = [...given, family].filter(Boolean).join(' ').trim()
  if (text) name.text = text

  const genderRaw = (patientNode?.administrativeGenderCode as Record<string, unknown> | undefined)?._code as
    | string
    | undefined
  const gender = genderRaw === 'M' ? 'male' : genderRaw === 'F' ? 'female' : 'unknown'

  const birthTime = (patientNode?.birthTime as Record<string, unknown> | undefined)?._value as string | undefined

  const addrNode = pickArray(patientRole?.addr as Record<string, unknown> | Record<string, unknown>[])[0]
  const addrLines = pickArray(addrNode?.streetAddressLine as string | string[]).map((s) =>
    typeof s === 'string' ? s : ((s as Record<string, unknown>)?.['#text'] as string),
  )
  const address = addrNode
    ? {
        ...(addrLines.length ? { line: addrLines } : {}),
        ...(addrNode.city ? { city: deepText(addrNode.city) ?? String(addrNode.city) } : {}),
        ...(addrNode.state ? { state: deepText(addrNode.state) ?? String(addrNode.state) } : {}),
        ...(addrNode.postalCode ? { postalCode: deepText(addrNode.postalCode) ?? String(addrNode.postalCode) } : {}),
        ...(addrNode.country ? { country: deepText(addrNode.country) ?? String(addrNode.country) } : {}),
      }
    : null

  const telecomNodes = pickArray(patientRole?.telecom as Record<string, unknown> | Record<string, unknown>[])
  const telecom = telecomNodes
    .map((t) => {
      const value = t._value as string | undefined
      if (!value || value.startsWith('null')) return null
      const useRaw = (t._use as string | undefined)?.toLowerCase()
      const system = value.startsWith('mailto:') ? 'email' : value.startsWith('tel:') ? 'phone' : 'phone'
      return {
        system,
        value: value.replace(/^mailto:|^tel:/i, ''),
        ...(useRaw ? { use: useRaw === 'hp' ? 'home' : useRaw === 'wp' ? 'work' : 'mobile' } : {}),
      }
    })
    .filter(Boolean)

  const identifiers: Record<string, unknown>[] = []
  if (sourceId) {
    identifiers.push({ system: idNode?._root ? `urn:oid:${idNode._root}` : 'urn:source-id', value: sourceId })
  }
  if (abhaNumber) {
    identifiers.push({ system: 'urn:abha', value: abhaNumber, use: 'official' })
  }

  return {
    resourceType: 'Patient',
    id,
    ...(identifiers.length ? { identifier: identifiers } : {}),
    name: text ? [name] : [],
    gender,
    ...(birthTime ? { birthDate: fmtDate(birthTime) } : {}),
    ...(address ? { address: [address] } : {}),
    ...(telecom.length ? { telecom } : {}),
  }
}

// ─── section walkers ─────────────────────────────────────────────────────────

function walkAllergies(
  doc: Record<string, unknown>,
  patientRef: { reference: string },
): FhirResource[] {
  const section = findSection(doc, '2.16.840.1.113883.10.20.22.2.6.1') ?? findSection(doc, '2.16.840.1.113883.10.20.22.2.6')
  if (!section) return []
  const out: FhirResource[] = []
  const entries = pickArray(section.entry as Record<string, unknown> | Record<string, unknown>[])
  for (const e of entries) {
    const act = pickFirst(e.act as Record<string, unknown> | Record<string, unknown>[] | undefined)
    if (!act) continue
    const er = pickFirst(act.entryRelationship as Record<string, unknown> | Record<string, unknown>[] | undefined)
    const obs = pickFirst(er?.observation as Record<string, unknown> | Record<string, unknown>[] | undefined)
    const playingEntity = (
      pickFirst(obs?.participant as Record<string, unknown> | Record<string, unknown>[] | undefined)
        ?.participantRole as Record<string, unknown> | undefined
    )?.playingEntity as Record<string, unknown> | undefined
    const substanceCode = playingEntity?.code as Record<string, unknown> | undefined
    const idNode = pickArray(act.id as Record<string, unknown> | Record<string, unknown>[])[0]
    const seed = (idNode?._root as string | undefined) ?? `${(act.id as { _root?: string })?._root ?? ''}-${out.length}`
    const id = deterministicId(`AllergyIntolerance|${seed}`)
    const onset = ((act.effectiveTime as Record<string, unknown> | undefined)?.low as Record<string, unknown> | undefined)?._value as
      | string
      | undefined
    out.push({
      resourceType: 'AllergyIntolerance',
      id,
      clinicalStatus: {
        coding: [
          { system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: 'active' },
        ],
      },
      verificationStatus: {
        coding: [
          { system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification', code: 'confirmed' },
        ],
      },
      type: 'allergy',
      patient: patientRef,
      ...(onset ? { recordedDate: fmtDateTime(onset) ?? fmtDate(onset) } : {}),
      ...(substanceCode ? { code: codeFromCcda(substanceCode) ?? { text: 'Unknown allergen' } } : { code: { text: 'Unknown allergen' } }),
    })
  }
  return out
}

function walkMedications(
  doc: Record<string, unknown>,
  patientRef: { reference: string },
): FhirResource[] {
  const section = findSection(doc, '2.16.840.1.113883.10.20.22.2.1.1') ?? findSection(doc, '2.16.840.1.113883.10.20.22.2.1')
  if (!section) return []
  const out: FhirResource[] = []
  const entries = pickArray(section.entry as Record<string, unknown> | Record<string, unknown>[])
  for (const e of entries) {
    const sa = pickFirst(e.substanceAdministration as Record<string, unknown> | Record<string, unknown>[] | undefined)
    if (!sa) continue
    const consumable = sa.consumable as Record<string, unknown> | undefined
    const material = (
      (consumable?.manufacturedProduct as Record<string, unknown> | undefined)
        ?.manufacturedMaterial as Record<string, unknown> | undefined
    )
    const code = codeFromCcda(material?.code as Record<string, unknown> | undefined) ??
      (material?.name ? { text: deepText(material.name) ?? String(material.name) } : undefined)
    const idNode = pickArray(sa.id as Record<string, unknown> | Record<string, unknown>[])[0]
    const seed = (idNode?._root as string | undefined) ?? `${out.length}`
    const id = deterministicId(`MedicationStatement|${seed}`)
    const eff = sa.effectiveTime as Record<string, unknown> | undefined
    const low = (eff?.low as Record<string, unknown> | undefined)?._value as string | undefined
    const high = (eff?.high as Record<string, unknown> | undefined)?._value as string | undefined
    const statusCode = (sa.statusCode as Record<string, unknown> | undefined)?._code as string | undefined
    const status =
      statusCode === 'completed'
        ? 'completed'
        : statusCode === 'active'
          ? 'active'
          : statusCode === 'aborted' || statusCode === 'cancelled'
            ? 'stopped'
            : 'unknown'

    out.push({
      resourceType: 'MedicationStatement',
      id,
      status,
      medicationCodeableConcept: code ?? { text: 'Unknown medication' },
      subject: patientRef,
      ...(low ? { effectivePeriod: { start: fmtDateTime(low), ...(high ? { end: fmtDateTime(high) } : {}) } } : {}),
    })
  }
  return out
}

function walkProblems(
  doc: Record<string, unknown>,
  patientRef: { reference: string },
): FhirResource[] {
  const section = findSection(doc, '2.16.840.1.113883.10.20.22.2.5.1') ?? findSection(doc, '2.16.840.1.113883.10.20.22.2.5')
  if (!section) return []
  const out: FhirResource[] = []
  const entries = pickArray(section.entry as Record<string, unknown> | Record<string, unknown>[])
  for (const e of entries) {
    const act = pickFirst(e.act as Record<string, unknown> | Record<string, unknown>[] | undefined)
    if (!act) continue
    const er = pickFirst(act.entryRelationship as Record<string, unknown> | Record<string, unknown>[] | undefined)
    const obs = pickFirst(er?.observation as Record<string, unknown> | Record<string, unknown>[] | undefined)
    const value = obs?.value
    const code = codeFromCcda(pickArray(value as Record<string, unknown> | Record<string, unknown>[])[0]) ?? codeFromCcda(obs?.code as Record<string, unknown> | undefined)
    const idNode = pickArray(act.id as Record<string, unknown> | Record<string, unknown>[])[0]
    const seed = (idNode?._root as string | undefined) ?? `${out.length}`
    const id = deterministicId(`Condition|${seed}`)
    const onset = ((obs?.effectiveTime as Record<string, unknown> | undefined)?.low as Record<string, unknown> | undefined)?._value as
      | string
      | undefined
    const statusCode = (act.statusCode as Record<string, unknown> | undefined)?._code as string | undefined
    out.push({
      resourceType: 'Condition',
      id,
      clinicalStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
            code: statusCode === 'completed' ? 'resolved' : 'active',
          },
        ],
      },
      verificationStatus: {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: 'confirmed' }],
      },
      code: code ?? { text: 'Unknown problem' },
      subject: patientRef,
      ...(onset ? { onsetDateTime: fmtDateTime(onset) ?? fmtDate(onset) } : {}),
    })
  }
  return out
}

function walkProcedures(
  doc: Record<string, unknown>,
  patientRef: { reference: string },
): FhirResource[] {
  const section = findSection(doc, '2.16.840.1.113883.10.20.22.2.7.1') ?? findSection(doc, '2.16.840.1.113883.10.20.22.2.7')
  if (!section) return []
  const out: FhirResource[] = []
  const entries = pickArray(section.entry as Record<string, unknown> | Record<string, unknown>[])
  for (const e of entries) {
    const procedureNode = pickFirst(e.procedure as Record<string, unknown> | Record<string, unknown>[] | undefined) ??
      pickFirst(e.act as Record<string, unknown> | Record<string, unknown>[] | undefined) ??
      pickFirst(e.observation as Record<string, unknown> | Record<string, unknown>[] | undefined)
    if (!procedureNode) continue
    const code = codeFromCcda(procedureNode.code as Record<string, unknown> | undefined)
    const idNode = pickArray(procedureNode.id as Record<string, unknown> | Record<string, unknown>[])[0]
    const seed = (idNode?._root as string | undefined) ?? `${out.length}`
    const id = deterministicId(`Procedure|${seed}`)
    const eff = procedureNode.effectiveTime as Record<string, unknown> | undefined
    const performed = (eff?.low as Record<string, unknown> | undefined)?._value as string | undefined
    const performedSingle = (eff?._value as string | undefined) ?? performed
    const statusCode = (procedureNode.statusCode as Record<string, unknown> | undefined)?._code as string | undefined
    out.push({
      resourceType: 'Procedure',
      id,
      status: statusCode === 'completed' ? 'completed' : statusCode === 'aborted' ? 'stopped' : 'completed',
      code: code ?? { text: 'Unknown procedure' },
      subject: patientRef,
      ...(performedSingle ? { performedDateTime: fmtDateTime(performedSingle) } : {}),
    })
  }
  return out
}

function walkEncounters(
  doc: Record<string, unknown>,
  patientRef: { reference: string },
): FhirResource[] {
  const section = findSection(doc, '2.16.840.1.113883.10.20.22.2.22.1') ??
    findSection(doc, '2.16.840.1.113883.10.20.22.2.22')
  if (!section) return []
  const out: FhirResource[] = []
  const entries = pickArray(section.entry as Record<string, unknown> | Record<string, unknown>[])
  for (const e of entries) {
    const enc = pickFirst(e.encounter as Record<string, unknown> | Record<string, unknown>[] | undefined)
    if (!enc) continue
    const code = codeFromCcda(enc.code as Record<string, unknown> | undefined)
    const idNode = pickArray(enc.id as Record<string, unknown> | Record<string, unknown>[])[0]
    const seed = (idNode?._root as string | undefined) ?? `${out.length}`
    const id = deterministicId(`Encounter|${seed}`)
    const eff = enc.effectiveTime as Record<string, unknown> | undefined
    const start = (eff?.low as Record<string, unknown> | undefined)?._value as string | undefined
    const end = (eff?.high as Record<string, unknown> | undefined)?._value as string | undefined
    out.push({
      resourceType: 'Encounter',
      id,
      status: 'finished',
      class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' },
      ...(code ? { type: [code] } : {}),
      subject: patientRef,
      ...(start ? { period: { start: fmtDateTime(start), ...(end ? { end: fmtDateTime(end) } : {}) } } : {}),
    })
  }
  return out
}

function walkImmunizations(
  doc: Record<string, unknown>,
  patientRef: { reference: string },
): FhirResource[] {
  const section = findSection(doc, '2.16.840.1.113883.10.20.22.2.2.1') ?? findSection(doc, '2.16.840.1.113883.10.20.22.2.2')
  if (!section) return []
  const out: FhirResource[] = []
  const entries = pickArray(section.entry as Record<string, unknown> | Record<string, unknown>[])
  for (const e of entries) {
    const sa = pickFirst(e.substanceAdministration as Record<string, unknown> | Record<string, unknown>[] | undefined)
    if (!sa) continue
    const consumable = sa.consumable as Record<string, unknown> | undefined
    const material = (consumable?.manufacturedProduct as Record<string, unknown> | undefined)
      ?.manufacturedMaterial as Record<string, unknown> | undefined
    const code = codeFromCcda(material?.code as Record<string, unknown> | undefined) ??
      (material?.name ? { text: deepText(material.name) ?? String(material.name) } : undefined)
    const idNode = pickArray(sa.id as Record<string, unknown> | Record<string, unknown>[])[0]
    const seed = (idNode?._root as string | undefined) ?? `${out.length}`
    const id = deterministicId(`Immunization|${seed}`)
    const occurrence = (sa.effectiveTime as Record<string, unknown> | undefined)?._value as string | undefined
    const occurrenceLow = ((sa.effectiveTime as Record<string, unknown> | undefined)?.low as Record<string, unknown> | undefined)?._value as
      | string
      | undefined
    const statusCode = (sa.statusCode as Record<string, unknown> | undefined)?._code as string | undefined

    out.push({
      resourceType: 'Immunization',
      id,
      status: statusCode === 'completed' ? 'completed' : statusCode === 'aborted' ? 'not-done' : 'completed',
      vaccineCode: code ?? { text: 'Unknown vaccine' },
      patient: patientRef,
      ...(occurrence || occurrenceLow ? { occurrenceDateTime: fmtDateTime(occurrence ?? occurrenceLow) } : {}),
    })
  }
  return out
}

function walkResults(
  doc: Record<string, unknown>,
  patientRef: { reference: string },
): { observations: FhirResource[]; reports: FhirResource[] } {
  const section = findSection(doc, '2.16.840.1.113883.10.20.22.2.3.1') ?? findSection(doc, '2.16.840.1.113883.10.20.22.2.3')
  if (!section) return { observations: [], reports: [] }
  const observations: FhirResource[] = []
  const reports: FhirResource[] = []
  const entries = pickArray(section.entry as Record<string, unknown> | Record<string, unknown>[])
  for (const e of entries) {
    const organizer = pickFirst(e.organizer as Record<string, unknown> | Record<string, unknown>[] | undefined)
    if (!organizer) continue
    const reportCode = codeFromCcda(organizer.code as Record<string, unknown> | undefined)
    const reportIdNode = pickArray(organizer.id as Record<string, unknown> | Record<string, unknown>[])[0]
    const reportSeed = (reportIdNode?._root as string | undefined) ?? `${reports.length}`
    const reportId = deterministicId(`DiagnosticReport|${reportSeed}`)
    const reportEff = ((organizer.effectiveTime as Record<string, unknown> | undefined)?.low as Record<string, unknown> | undefined)?._value as
      | string
      | undefined

    const obsRefs: Record<string, unknown>[] = []
    const components = pickArray(organizer.component as Record<string, unknown> | Record<string, unknown>[])
    for (const c of components) {
      const obs = pickFirst(c.observation as Record<string, unknown> | Record<string, unknown>[] | undefined)
      if (!obs) continue
      const obsCode = codeFromCcda(obs.code as Record<string, unknown> | undefined)
      const obsIdNode = pickArray(obs.id as Record<string, unknown> | Record<string, unknown>[])[0]
      const obsSeed = (obsIdNode?._root as string | undefined) ?? `${reportSeed}-${observations.length}`
      const obsId = deterministicId(`Observation|${obsSeed}`)
      const obsEff = (obs.effectiveTime as Record<string, unknown> | undefined)?._value as string | undefined ??
        ((obs.effectiveTime as Record<string, unknown> | undefined)?.low as Record<string, unknown> | undefined)?._value as
          | string
          | undefined
      const valueParsed = readValue(obs.value)
      const ref = pickArray(obs.referenceRange as Record<string, unknown> | Record<string, unknown>[])[0]
      const refRange = ref
        ? [
            {
              text: deepText((ref.observationRange as Record<string, unknown> | undefined)?.text) ??
                deepText(ref.text) ?? undefined,
            },
          ]
        : undefined

      observations.push({
        resourceType: 'Observation',
        id: obsId,
        status: 'final',
        category: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/observation-category',
                code: 'laboratory',
              },
            ],
          },
        ],
        code: obsCode ?? { text: 'Observation' },
        subject: patientRef,
        ...(obsEff ? { effectiveDateTime: fmtDateTime(obsEff) } : reportEff ? { effectiveDateTime: fmtDateTime(reportEff) } : {}),
        ...valueParsed,
        ...(refRange && refRange[0]?.text ? { referenceRange: refRange } : {}),
      })
      obsRefs.push({ reference: `Observation/${obsId}` })
    }

    reports.push({
      resourceType: 'DiagnosticReport',
      id: reportId,
      status: 'final',
      category: [
        {
          coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0074', code: 'LAB', display: 'Laboratory' }],
        },
      ],
      code: reportCode ?? { text: 'Diagnostic report' },
      subject: patientRef,
      ...(reportEff ? { effectiveDateTime: fmtDateTime(reportEff) } : {}),
      ...(obsRefs.length ? { result: obsRefs } : {}),
    })
  }
  return { observations, reports }
}

function walkVitalSigns(
  doc: Record<string, unknown>,
  patientRef: { reference: string },
): FhirResource[] {
  const section = findSection(doc, '2.16.840.1.113883.10.20.22.2.4.1') ?? findSection(doc, '2.16.840.1.113883.10.20.22.2.4')
  if (!section) return []
  const out: FhirResource[] = []
  const entries = pickArray(section.entry as Record<string, unknown> | Record<string, unknown>[])
  for (const e of entries) {
    const organizer = pickFirst(e.organizer as Record<string, unknown> | Record<string, unknown>[] | undefined)
    if (!organizer) continue
    const orgEff = ((organizer.effectiveTime as Record<string, unknown> | undefined)?.low as Record<string, unknown> | undefined)?._value as
      | string
      | undefined
    const components = pickArray(organizer.component as Record<string, unknown> | Record<string, unknown>[])
    for (const c of components) {
      const obs = pickFirst(c.observation as Record<string, unknown> | Record<string, unknown>[] | undefined)
      if (!obs) continue
      const obsCode = codeFromCcda(obs.code as Record<string, unknown> | undefined)
      const obsIdNode = pickArray(obs.id as Record<string, unknown> | Record<string, unknown>[])[0]
      const obsSeed = (obsIdNode?._root as string | undefined) ?? `${out.length}`
      const obsId = deterministicId(`Observation|vital|${obsSeed}`)
      const obsEff = (obs.effectiveTime as Record<string, unknown> | undefined)?._value as string | undefined ??
        ((obs.effectiveTime as Record<string, unknown> | undefined)?.low as Record<string, unknown> | undefined)?._value as
          | string
          | undefined
      const valueParsed = readValue(obs.value)
      out.push({
        resourceType: 'Observation',
        id: obsId,
        status: 'final',
        category: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/observation-category',
                code: 'vital-signs',
              },
            ],
          },
        ],
        code: obsCode ?? { text: 'Vital sign' },
        subject: patientRef,
        ...(obsEff || orgEff ? { effectiveDateTime: fmtDateTime(obsEff ?? orgEff) } : {}),
        ...valueParsed,
      })
    }
  }
  return out
}

// ─── public entry point ──────────────────────────────────────────────────────

export function ccdaToFhirBundle(
  ccdaXml: string,
  options: { abhaNumber?: string } = {},
): CcdaBundle {
  const parsed = parser.parse(ccdaXml) as Record<string, unknown>
  const patient = buildPatient(parsed, options.abhaNumber)
  const patientRef = { reference: `Patient/${patient.id}` }

  const allergies = walkAllergies(parsed, patientRef)
  const medications = walkMedications(parsed, patientRef)
  const problems = walkProblems(parsed, patientRef)
  const procedures = walkProcedures(parsed, patientRef)
  const encounters = walkEncounters(parsed, patientRef)
  const immunizations = walkImmunizations(parsed, patientRef)
  const { observations: labs, reports } = walkResults(parsed, patientRef)
  const vitals = walkVitalSigns(parsed, patientRef)

  const all: FhirResource[] = [
    patient,
    ...allergies,
    ...medications,
    ...problems,
    ...procedures,
    ...encounters,
    ...immunizations,
    ...labs,
    ...vitals,
    ...reports,
  ]

  return {
    resourceType: 'Bundle',
    type: 'collection',
    entry: all.map(entry),
  }
}
