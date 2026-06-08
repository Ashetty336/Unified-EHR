// FHIR resource → UI-friendly plain objects.
// Never expose raw FHIR JSON to the client.

type FhirResource = Record<string, unknown>
type FhirBundle = { entry?: { resource?: FhirResource }[] }

export type LabResult = {
  id: string
  name: string
  value: string
  unit: string | null
  referenceRange: string | null
  status: string
  effectiveDate: string | null
}

export type Prescription = {
  id: string
  medication: string
  status: string
  intent: string
  authoredOn: string | null
  dosageInstruction: string | null
}

export type ConditionRecord = {
  id: string
  name: string
  clinicalStatus: string | null
  verificationStatus: string | null
  onsetDate: string | null
  recordedDate: string | null
}

export type AllergyRecord = {
  id: string
  substance: string
  category: string | null
  criticality: string | null
  clinicalStatus: string | null
  recordedDate: string | null
}

export type ProcedureRecord = {
  id: string
  name: string
  status: string
  performedDate: string | null
}

export type DiagnosticReportRecord = {
  id: string
  name: string
  status: string
  effectiveDate: string | null
  conclusion: string | null
}

export type EncounterRecord = {
  id: string
  type: string
  status: string
  startDate: string | null
  endDate: string | null
}

export type ImmunizationRecord = {
  id: string
  vaccine: string
  status: string
  occurrenceDate: string | null
}

export type PatientSummary = {
  id: string
  name: string
  gender: string | null
  birthDate: string | null
  identifiers: { system: string; value: string }[]
}

export type FhirRecords = {
  patient: PatientSummary | null
  labResults: LabResult[]
  prescriptions: Prescription[]
  conditions: ConditionRecord[]
  allergies: AllergyRecord[]
  procedures: ProcedureRecord[]
  diagnosticReports: DiagnosticReportRecord[]
  encounters: EncounterRecord[]
  immunizations: ImmunizationRecord[]
}

function extractText(element: unknown): string {
  if (!element) return 'Unknown'
  if (typeof element === 'string') return element
  const e = element as FhirResource
  if (Array.isArray(e)) return extractText((e as unknown[])[0])
  if (e.text) return String(e.text)
  if (e.coding && Array.isArray(e.coding)) {
    const coding = (e.coding as FhirResource[])[0]
    return String(coding?.display ?? coding?.code ?? 'Unknown')
  }
  return String(e.display ?? e.code ?? 'Unknown')
}

function extractStatus(element: unknown): string | null {
  if (!element) return null
  if (typeof element === 'string') return element
  const e = element as FhirResource
  if (e.coding && Array.isArray(e.coding)) {
    return String((e.coding as FhirResource[])[0]?.code ?? '') || null
  }
  return null
}

function transformPatient(r: FhirResource): PatientSummary {
  const names = r.name as FhirResource[] | undefined
  const nameEntry = names?.[0]
  const given = (nameEntry?.given as string[] | undefined)?.join(' ') ?? ''
  const family = nameEntry?.family as string ?? ''
  const name = `${given} ${family}`.trim() || 'Unknown'

  const identifiers = ((r.identifier as FhirResource[]) ?? []).map((id) => ({
    system: String(id.system ?? ''),
    value: String(id.value ?? ''),
  }))

  return {
    id: String(r.id ?? ''),
    name,
    gender: r.gender ? String(r.gender) : null,
    birthDate: r.birthDate ? String(r.birthDate) : null,
    identifiers,
  }
}

function transformObservation(r: FhirResource): LabResult {
  const valueQty = r.valueQuantity as FhirResource | undefined
  const valueString = r.valueString as string | undefined
  const value = valueQty
    ? String(valueQty.value ?? '')
    : (valueString ?? String(r.valueCodeableConcept ? extractText(r.valueCodeableConcept) : ''))

  const refRange = (r.referenceRange as FhirResource[] | undefined)?.[0]
  const refText = refRange?.text
    ? String(refRange.text)
    : refRange?.low || refRange?.high
    ? `${(refRange.low as FhirResource)?.value ?? ''}–${(refRange.high as FhirResource)?.value ?? ''}`
    : null

  const effective = r.effectiveDateTime
    ? String(r.effectiveDateTime)
    : r.effectivePeriod
    ? String((r.effectivePeriod as FhirResource).start ?? '')
    : null

  return {
    id: String(r.id ?? ''),
    name: extractText(r.code),
    value,
    unit: valueQty?.unit ? String(valueQty.unit) : null,
    referenceRange: refText,
    status: String(r.status ?? 'unknown'),
    effectiveDate: effective,
  }
}

function transformMedication(r: FhirResource): Prescription {
  const medConcept = r.medicationCodeableConcept
  const medRef = r.medicationReference as FhirResource | undefined
  const medication = medConcept
    ? extractText(medConcept)
    : String(medRef?.display ?? 'Unknown')

  const dosage = (r.dosageInstruction as FhirResource[] | undefined)?.[0]
  const dosageText = dosage?.text ? String(dosage.text) : null

  // MedicationStatement uses effectiveDateTime / effectivePeriod / dateAsserted
  const authoredOn = r.authoredOn
    ? String(r.authoredOn)
    : r.dateAsserted
    ? String(r.dateAsserted)
    : r.effectiveDateTime
    ? String(r.effectiveDateTime)
    : r.effectivePeriod
    ? String((r.effectivePeriod as FhirResource).start ?? '')
    : null

  return {
    id: String(r.id ?? ''),
    medication,
    status: String(r.status ?? 'unknown'),
    intent: String(r.intent ?? r.resourceType ?? 'unknown'),
    authoredOn,
    dosageInstruction: dosageText,
  }
}

function transformCondition(r: FhirResource): ConditionRecord {
  return {
    id: String(r.id ?? ''),
    name: extractText(r.code),
    clinicalStatus: extractStatus(r.clinicalStatus),
    verificationStatus: extractStatus(r.verificationStatus),
    onsetDate: r.onsetDateTime ? String(r.onsetDateTime) : null,
    recordedDate: r.recordedDate ? String(r.recordedDate) : null,
  }
}

function transformAllergy(r: FhirResource): AllergyRecord {
  const categoryArr = r.category as string[] | undefined
  return {
    id: String(r.id ?? ''),
    substance: extractText(r.code),
    category: categoryArr?.[0] ?? null,
    criticality: r.criticality ? String(r.criticality) : null,
    clinicalStatus: extractStatus(r.clinicalStatus),
    recordedDate: r.recordedDate ? String(r.recordedDate) : null,
  }
}

function transformProcedure(r: FhirResource): ProcedureRecord {
  const performed = r.performedDateTime
    ? String(r.performedDateTime)
    : r.performedPeriod
    ? String((r.performedPeriod as FhirResource).start ?? '')
    : null
  return {
    id: String(r.id ?? ''),
    name: extractText(r.code),
    status: String(r.status ?? 'unknown'),
    performedDate: performed,
  }
}

function transformDiagnosticReport(r: FhirResource): DiagnosticReportRecord {
  const effective = r.effectiveDateTime
    ? String(r.effectiveDateTime)
    : r.effectivePeriod
    ? String((r.effectivePeriod as FhirResource).start ?? '')
    : null
  return {
    id: String(r.id ?? ''),
    name: extractText(r.code),
    status: String(r.status ?? 'unknown'),
    effectiveDate: effective,
    conclusion: r.conclusion ? String(r.conclusion) : null,
  }
}

function transformEncounter(r: FhirResource): EncounterRecord {
  const period = r.period as FhirResource | undefined
  const typeArr = r.type as FhirResource[] | undefined
  return {
    id: String(r.id ?? ''),
    type: typeArr?.[0] ? extractText(typeArr[0]) : extractText(r.class ?? 'Encounter'),
    status: String(r.status ?? 'unknown'),
    startDate: period?.start ? String(period.start) : null,
    endDate: period?.end ? String(period.end) : null,
  }
}

function transformImmunization(r: FhirResource): ImmunizationRecord {
  return {
    id: String(r.id ?? ''),
    vaccine: extractText(r.vaccineCode),
    status: String(r.status ?? 'unknown'),
    occurrenceDate: r.occurrenceDateTime ? String(r.occurrenceDateTime) : null,
  }
}

export function transformFhirBundle(
  patientResource: FhirResource | null,
  bundles: { resourceType: string; bundle: FhirBundle }[]
): FhirRecords {
  const records: FhirRecords = {
    patient: patientResource ? transformPatient(patientResource) : null,
    labResults: [],
    prescriptions: [],
    conditions: [],
    allergies: [],
    procedures: [],
    diagnosticReports: [],
    encounters: [],
    immunizations: [],
  }

  for (const { resourceType, bundle } of bundles) {
    const entries = bundle.entry ?? []
    for (const entry of entries) {
      const r = entry.resource
      if (!r) continue
      switch (resourceType) {
        case 'Observation':
          records.labResults.push(transformObservation(r))
          break
        case 'MedicationRequest':
        case 'MedicationStatement':
          records.prescriptions.push(transformMedication(r))
          break
        case 'Condition':
          records.conditions.push(transformCondition(r))
          break
        case 'AllergyIntolerance':
          records.allergies.push(transformAllergy(r))
          break
        case 'Procedure':
          records.procedures.push(transformProcedure(r))
          break
        case 'DiagnosticReport':
          records.diagnosticReports.push(transformDiagnosticReport(r))
          break
        case 'Encounter':
          records.encounters.push(transformEncounter(r))
          break
        case 'Immunization':
          records.immunizations.push(transformImmunization(r))
          break
      }
    }
  }

  return records
}
