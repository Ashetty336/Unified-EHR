// Build a FHIR R4 batch-ready Bundle directly from a StructuredReport.
// We bypass the Microsoft FHIR Converter for PDF input because the bundled
// Liquid `ExamplePatient` template only emits Patient demographics and drops
// labResults / medications / diagnoses. This builder emits Patient,
// Observation (labs), DiagnosticReport groups, MedicationRequest, and Condition
// resources so the extracted clinical data actually lands in HAPI.

import { randomUUID } from 'node:crypto'
import type { StructuredReport } from './structure'

type FhirResource = Record<string, unknown> & { resourceType: string; id: string }

type BundleEntry = {
  fullUrl: string
  resource: FhirResource
  request: { method: 'PUT'; url: string }
}

export type FhirBundleResult = { resourceType: 'Bundle'; type: 'collection'; entry: BundleEntry[] }

function entry(resource: FhirResource): BundleEntry {
  return {
    fullUrl: `urn:uuid:${resource.id}`,
    resource,
    request: { method: 'PUT', url: `${resource.resourceType}/${resource.id}` },
  }
}

function toIsoDate(input: string | undefined): string | undefined {
  if (!input) return undefined
  // Accept dd/mm/yyyy, mm/dd/yyyy (best-effort), or already ISO.
  const trimmed = input.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10)
  const parts = trimmed.split(/[/\-]/).map((s) => s.trim())
  if (parts.length === 3) {
    const [a, b, c] = parts
    if (a.length === 4) return `${a}-${b.padStart(2, '0')}-${c.padStart(2, '0')}` // yyyy-mm-dd
    if (c.length === 4) {
      // dd/mm/yyyy assumed (Indian convention given ABHA context)
      return `${c}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`
    }
  }
  return undefined
}

function toFhirGender(g: string | undefined): 'male' | 'female' | 'unknown' {
  if (!g) return 'unknown'
  const v = g.toLowerCase()
  if (v === 'm' || v === 'male') return 'male'
  if (v === 'f' || v === 'female') return 'female'
  return 'unknown'
}

function parseRange(range: string): { low?: number; high?: number } {
  const m = range.match(/([\d.]+)\s*[-–]\s*([\d.]+)/)
  if (!m) return {}
  const low = Number(m[1])
  const high = Number(m[2])
  return {
    low: Number.isFinite(low) ? low : undefined,
    high: Number.isFinite(high) ? high : undefined,
  }
}

function parseValue(value: string): number | string {
  const n = Number(value.replace(/,/g, ''))
  return Number.isFinite(n) ? n : value
}

export function pdfReportToBundle(
  report: StructuredReport,
  documentDate: string = new Date().toISOString(),
): FhirBundleResult {
  const patientId = randomUUID()
  const fullName = [report.FirstName, report.LastName].filter(Boolean).join(' ').trim()
  const patient: FhirResource = {
    resourceType: 'Patient',
    id: patientId,
    ...(report.MRN
      ? {
          identifier: [
            {
              system: 'urn:mrn',
              value: report.MRN,
            },
          ],
        }
      : {}),
    ...(fullName
      ? {
          name: [
            {
              use: 'official',
              ...(report.FirstName ? { given: [report.FirstName] } : {}),
              ...(report.LastName ? { family: report.LastName } : {}),
              text: fullName,
            },
          ],
        }
      : {}),
    gender: toFhirGender(report.Gender),
    ...(toIsoDate(report.DOB) ? { birthDate: toIsoDate(report.DOB) } : {}),
    ...(report['Phone Number']?.length
      ? {
          telecom: report['Phone Number'].map((p) => ({ system: 'phone', value: p })),
        }
      : {}),
  }

  const entries: BundleEntry[] = [entry(patient)]
  const patientReference = { reference: `Patient/${patientId}` }
  const reportResults = new Map<string, { date: string; result: { reference: string }[] }>()

  // Observations (lab results)
  for (const lab of report.labResults) {
    const obsId = randomUUID()
    const effectiveDateTime = toIsoDate(lab.date) ?? documentDate
    const numericOrText = parseValue(lab.value)
    const valueQuantity =
      typeof numericOrText === 'number'
        ? {
            valueQuantity: {
              value: numericOrText,
              ...(lab.unit ? { unit: lab.unit, code: lab.unit, system: 'http://unitsofmeasure.org' } : {}),
            },
          }
        : { valueString: String(numericOrText) }

    const range = parseRange(lab.referenceRange)
    const referenceRange =
      range.low !== undefined || range.high !== undefined
        ? [
            {
              ...(range.low !== undefined ? { low: { value: range.low, unit: lab.unit || undefined } } : {}),
              ...(range.high !== undefined ? { high: { value: range.high, unit: lab.unit || undefined } } : {}),
              text: lab.referenceRange,
            },
          ]
        : lab.referenceRange
          ? [{ text: lab.referenceRange }]
          : undefined

    const obs: FhirResource = {
      resourceType: 'Observation',
      id: obsId,
      status: 'final',
      category: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/observation-category',
              code: 'laboratory',
              display: 'Laboratory',
            },
          ],
        },
      ],
      code: { text: lab.name },
      subject: patientReference,
      effectiveDateTime,
      ...valueQuantity,
      ...(referenceRange ? { referenceRange } : {}),
    }
    entries.push(entry(obs))

    const reportName = lab.reportName?.trim() || 'Laboratory Report'
    const grouped = reportResults.get(reportName) ?? { date: effectiveDateTime, result: [] }
    grouped.result.push({ reference: `Observation/${obsId}` })
    reportResults.set(reportName, grouped)
  }

  // DiagnosticReports, grouped by the report/panel heading extracted from the PDF.
  for (const [reportName, grouped] of reportResults.entries()) {
    const id = randomUUID()
    const diagnosticReport: FhirResource = {
      resourceType: 'DiagnosticReport',
      id,
      status: 'final',
      category: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v2-0074',
              code: 'LAB',
              display: 'Laboratory',
            },
          ],
        },
      ],
      code: { text: reportName },
      subject: patientReference,
      effectiveDateTime: grouped.date,
      result: grouped.result,
    }
    entries.push(entry(diagnosticReport))
  }

  // Medications → MedicationRequest
  for (const med of report.medications) {
    const id = randomUUID()
    const medRequest: FhirResource = {
      resourceType: 'MedicationRequest',
      id,
      status: med.status === 'active' ? 'active' : (med.status || 'unknown'),
      intent: 'order',
      medicationCodeableConcept: {
        text: [med.name, med.dosage].filter(Boolean).join(' ').trim() || med.name,
      },
      subject: patientReference,
      authoredOn: documentDate,
      ...(med.frequency || med.dosage
        ? {
            dosageInstruction: [
              {
                text: [med.dosage, med.frequency].filter(Boolean).join(' ').trim(),
              },
            ],
          }
        : {}),
    }
    entries.push(entry(medRequest))
  }

  // Diagnoses → Condition
  for (const dx of report.diagnoses) {
    const id = randomUUID()
    const cond: FhirResource = {
      resourceType: 'Condition',
      id,
      clinicalStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
            code: 'active',
          },
        ],
      },
      verificationStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
            code: 'unconfirmed',
          },
        ],
      },
      code: { text: dx },
      subject: patientReference,
      recordedDate: documentDate,
    }
    entries.push(entry(cond))
  }

  return {
    resourceType: 'Bundle',
    type: 'collection',
    entry: entries,
  }
}
