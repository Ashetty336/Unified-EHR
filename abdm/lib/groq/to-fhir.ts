// Build a FHIR R4 batch-ready Bundle from a Groq PrescriptionExtraction.
// Mirrors lib/pdf/to-fhir.ts conventions: urn:uuid fullUrls, PUT requests, and
// free-text CodeableConcepts (no fabricated SNOMED/RxNorm codes). Emits one
// Patient + one MedicationRequest per extracted medication.

import { randomUUID } from 'node:crypto'
import type { ExtractedMedication, PrescriptionExtraction } from './prescription'

type FhirResource = Record<string, unknown> & { resourceType: string; id: string }

type BundleEntry = {
  fullUrl: string
  resource: FhirResource
  request: { method: 'PUT'; url: string }
}

export type FhirBundleResult = { resourceType: 'Bundle'; type: 'collection'; entry: BundleEntry[] }

// Split a free-text name into a FHIR HumanName. The dashboard reads name[0].given
// and name[0].family, so populate both (text alone renders as "Unknown").
function buildHumanName(full: string): Record<string, unknown> {
  const parts = full.trim().split(/\s+/)
  const given = parts.slice(0, -1)
  const family = parts.length > 1 ? parts[parts.length - 1] : parts[0]
  return {
    use: 'official',
    text: full.trim(),
    ...(given.length ? { given } : {}),
    family,
  }
}

function entry(resource: FhirResource): BundleEntry {
  return {
    fullUrl: `urn:uuid:${resource.id}`,
    resource,
    request: { method: 'PUT', url: `${resource.resourceType}/${resource.id}` },
  }
}

// UCUM-ish duration parser: "5 days" / "2 weeks" / "10 d" → Duration quantity.
function parseDuration(duration: string | undefined): Record<string, unknown> | undefined {
  if (!duration) return undefined
  const m = duration.trim().match(/(\d+(?:\.\d+)?)\s*(day|days|d|week|weeks|wk|month|months|mo|hour|hours|hr|h)/i)
  if (!m) return undefined
  const value = Number(m[1])
  if (!Number.isFinite(value)) return undefined
  const unitRaw = m[2].toLowerCase()
  const map: Record<string, { unit: string; code: string }> = {
    d: { unit: 'days', code: 'd' },
    day: { unit: 'days', code: 'd' },
    days: { unit: 'days', code: 'd' },
    wk: { unit: 'weeks', code: 'wk' },
    week: { unit: 'weeks', code: 'wk' },
    weeks: { unit: 'weeks', code: 'wk' },
    mo: { unit: 'months', code: 'mo' },
    month: { unit: 'months', code: 'mo' },
    months: { unit: 'months', code: 'mo' },
    h: { unit: 'hours', code: 'h' },
    hr: { unit: 'hours', code: 'h' },
    hour: { unit: 'hours', code: 'h' },
    hours: { unit: 'hours', code: 'h' },
  }
  const u = map[unitRaw]
  if (!u) return undefined
  return { value, unit: u.unit, system: 'http://unitsofmeasure.org', code: u.code }
}

// Parse a strength like "500 mg" / "5ml" into a dose Quantity.
function parseDose(dosage: string | undefined): Record<string, unknown> | undefined {
  if (!dosage) return undefined
  const m = dosage.trim().match(/(\d+(?:\.\d+)?)\s*(mg|mcg|µg|g|ml|mL|iu|unit|units|tab|tablet|drop|drops|puff)/i)
  if (!m) return undefined
  const value = Number(m[1])
  if (!Number.isFinite(value)) return undefined
  const unit = m[2]
  return { value, unit, system: 'http://unitsofmeasure.org', code: unit }
}

function buildDosageInstruction(med: ExtractedMedication): Record<string, unknown> | undefined {
  const text = [med.dosage, med.frequency, med.duration, med.instructions].filter(Boolean).join(' ').trim()
  const dose = parseDose(med.dosage)
  const di: Record<string, unknown> = {}
  if (text) di.text = text
  if (med.instructions) di.patientInstruction = med.instructions
  if (med.frequency) di.timing = { code: { text: med.frequency } }
  if (med.route) di.route = { text: med.route }
  if (dose) di.doseAndRate = [{ doseQuantity: dose }]
  return Object.keys(di).length ? di : undefined
}

export function prescriptionToBundle(
  extraction: PrescriptionExtraction,
  documentDate: string = new Date().toISOString(),
): FhirBundleResult {
  const authoredOn = extraction.prescribedDate
    ? `${extraction.prescribedDate}T00:00:00.000Z`
    : documentDate

  const patientId = randomUUID()
  const patient: FhirResource = {
    resourceType: 'Patient',
    id: patientId,
    ...(extraction.patientName ? { name: [buildHumanName(extraction.patientName)] } : {}),
  }

  const entries: BundleEntry[] = [entry(patient)]
  const patientReference = { reference: `Patient/${patientId}` }

  for (const med of extraction.medications) {
    const id = randomUUID()
    const strengthText = [med.name, med.dosage].filter(Boolean).join(' ').trim() || med.name
    const di = buildDosageInstruction(med)
    const supply = parseDuration(med.duration)

    const medRequest: FhirResource = {
      resourceType: 'MedicationRequest',
      id,
      status: 'active',
      intent: 'order',
      medicationCodeableConcept: { text: strengthText },
      subject: patientReference,
      authoredOn,
      ...(extraction.prescriber
        ? { note: [{ text: `Prescriber: ${extraction.prescriber}` }] }
        : {}),
      ...(di ? { dosageInstruction: [di] } : {}),
      ...(supply ? { dispenseRequest: { expectedSupplyDuration: supply } } : {}),
    }
    entries.push(entry(medRequest))
  }

  return { resourceType: 'Bundle', type: 'collection', entry: entries }
}
