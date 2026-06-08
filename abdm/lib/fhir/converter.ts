// Microsoft FHIR Converter — HTTP client.
// Container: docker run -d -p 5000:8080 mcr.microsoft.com/healthcareapis/fhir-converter:1.0.430-preview

const CONVERTER_BASE = process.env.FHIR_CONVERTER_URL ?? 'http://localhost:5000'

export type ConvertResult =
  | { ok: true; bundle: object }
  | { ok: false; error: string }

// Supported root templates for C-CDA types
export const CCDA_TEMPLATES = {
  CCD: 'CCD',
  ConsultationNote: 'ConsultationNote',
  DischargeSummary: 'DischargeSummary',
  HistoryandPhysical: 'HistoryandPhysical',
  OperativeNote: 'OperativeNote',
  ProcedureNote: 'ProcedureNote',
  ProgressNote: 'ProgressNote',
  ReferralNote: 'ReferralNote',
  TransferSummary: 'TransferSummary',
} as const

export type CcdaTemplate = keyof typeof CCDA_TEMPLATES

export const JSON_TEMPLATES = {
  ExamplePatient: 'ExamplePatient',
} as const

export type JsonTemplate = keyof typeof JSON_TEMPLATES

type InputDataType = 'Ccda' | 'Hl7v2' | 'Json' | 'Stu3ToR4'

type ConverterResponse = {
  result?: object
  error?: { code?: string; message?: string; innerError?: { code?: string; message?: string } }
  // legacy/alt shapes
  resourceType?: string
  entry?: unknown[]
}

// Default template refs. Override via FHIR_CONVERTER_TEMPLATE_<TYPE> env vars
// or pass an explicit `templateCollectionReference` argument.
const DEFAULT_TEMPLATE_REFS: Record<InputDataType, string> = {
  Ccda: process.env.FHIR_CONVERTER_TEMPLATE_CCDA ?? 'microsofthealth/ccdatemplates:default',
  Hl7v2: process.env.FHIR_CONVERTER_TEMPLATE_HL7V2 ?? 'microsofthealth/hl7v2templates:default',
  Json: process.env.FHIR_CONVERTER_TEMPLATE_JSON ?? 'microsofthealth/jsontemplates:default',
  Stu3ToR4: process.env.FHIR_CONVERTER_TEMPLATE_STU3 ?? 'microsofthealth/stu3tor4templates:default',
}

const API_VERSION = process.env.FHIR_CONVERTER_API_VERSION ?? '2024-05-01-preview'

async function callConverter(
  inputData: string,
  inputDataFormat: InputDataType,
  rootTemplateName: string,
  templateCollectionReference?: string,
): Promise<ConvertResult> {
  const body = {
    InputDataString: inputData,
    InputDataFormat: inputDataFormat,
    RootTemplateName: rootTemplateName,
    TemplateCollectionReference: templateCollectionReference ?? DEFAULT_TEMPLATE_REFS[inputDataFormat],
  }

  let res: Response
  try {
    res = await fetch(`${CONVERTER_BASE}/convertToFhir?api-version=${API_VERSION}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (err) {
    return { ok: false, error: `converter unreachable: ${err instanceof Error ? err.message : String(err)}` }
  }

  const text = await res.text()
  if (!res.ok) {
    let msg = text.slice(0, 800)
    try {
      const parsed = JSON.parse(text) as ConverterResponse
      const inner = parsed.error?.innerError?.message
      const outer = parsed.error?.message
      msg = inner ?? outer ?? msg
    } catch { /* keep raw */ }
    return { ok: false, error: `converter ${res.status}: ${msg}` }
  }

  let parsed: ConverterResponse
  try {
    parsed = JSON.parse(text) as ConverterResponse
  } catch {
    return { ok: false, error: 'converter returned non-JSON response' }
  }

  if (parsed.result && typeof parsed.result === 'object') {
    return { ok: true, bundle: parsed.result }
  }
  if (parsed.resourceType === 'Bundle') {
    return { ok: true, bundle: parsed as unknown as object }
  }

  return { ok: false, error: parsed.error?.message ?? 'converter returned no FHIR resource' }
}

export async function convertCcda(
  ccdaContent: string | Buffer,
  rootTemplate: CcdaTemplate = 'CCD',
  templateCollectionReference?: string,
): Promise<ConvertResult> {
  const xml = typeof ccdaContent === 'string' ? ccdaContent : ccdaContent.toString('utf-8')
  return callConverter(xml, 'Ccda', CCDA_TEMPLATES[rootTemplate], templateCollectionReference)
}

export async function convertJson(
  jsonInput: object,
  rootTemplate: JsonTemplate = 'ExamplePatient',
  templateCollectionReference?: string,
): Promise<ConvertResult> {
  const payload = JSON.stringify(jsonInput)
  return callConverter(payload, 'Json', JSON_TEMPLATES[rootTemplate], templateCollectionReference)
}

// Health check for diagnostics (optional use).
export async function converterHealth(): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const res = await fetch(`${CONVERTER_BASE}/health/check`)
    return { ok: res.ok, status: res.status }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
