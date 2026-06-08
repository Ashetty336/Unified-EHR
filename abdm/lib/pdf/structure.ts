// Extract structured clinical data from raw OCR/parsed PDF text.
// Output matches the field names expected by the JsonTemplate (ExamplePatient.liquid)
// plus extended fields for labs and medications — passed to convertJson.

export type StructuredReport = {
  // Patient demographics (maps to ExamplePatient template fields)
  PatientId?: string
  MRN?: string
  FirstName?: string
  LastName?: string
  DOB?: string
  Gender?: string
  'Phone Number'?: string[]

  // Extended clinical fields (used in custom templates or passed as metadata)
  labResults: LabEntry[]
  medications: MedEntry[]
  diagnoses: string[]
  rawText: string
}

export type LabEntry = {
  name: string
  value: string
  unit: string
  referenceRange: string
  date: string
  reportName?: string
}

export type MedEntry = {
  name: string
  dosage: string
  frequency: string
  status: string
}

// ── Regex helpers ─────────────────────────────────────────────────────────────

function extractFirst(text: string, patterns: RegExp[]): string | undefined {
  for (const re of patterns) {
    const m = text.match(re)
    if (m) return m[1]?.trim()
  }
  return undefined
}

const MED_LINE_RE = /(?:medication|drug|rx|prescribed)[:\s]+([^\n,]+?)(?:\s+(\d+\s*(?:mg|mcg|ml|g|IU)[^\s,]*))?(?:[,\s]+(\S+\s+(?:daily|qd|bid|tid|qid|weekly|prn|once)))?/gi
const DIAGNOSIS_RE = /(?:clinical diagnosis|diagnosis|assessment|impression|dx)\s*:\s*([^\n]+)/gi
const NAME_RE = /Name\s*:\s*(?:Mr|Mrs|Ms|Miss|Master|Dr)?\.?\s*([A-Z][A-Z\s'.-]+?)(?:\s+Gender|\s+Age|\s+Lab ID|$)/i
const DOB_RE = /(?:dob|date of birth|birth\s*date)[:\s]+([\d/\-]+)/i
const MRN_RE = /(?:mrn|medical record|patient id|pt\.?\s*id|lab id)[:\s#]*([A-Z0-9\-]+)/i
const GENDER_RE = /(?:sex|gender)[:\s]+(male|female|m\b|f\b|unknown)/i
const PHONE_RE = /(?:phone|tel|mobile)[:\s]+([\d\s\-().+]+)/gi

const UNIT_RE = /(?:mg\/dL|g\/dL|ng\/mL|pmol\/L|mEq\/L|U\/L|μg\/dL|mcg\/dL|μIU\/mL|µIU\/mL|ng\/dL|Cells\/cmm|million\/cmm|\/HPF|Leu\/uL|Ery\/uL|fL|pg|pH|%)/
const SECTION_HEADING_RE = /^[A-Z][A-Z0-9 /().,&-]{3,}$/
const RESULT_VALUE_RE = /^(?:[<>]=?\s*)?(?:\d+(?:\.\d+)?|NEGATIVE|POSITIVE(?:\(\+\))?|PRESENT(?:\(\+\))?|NORMAL|NIL|CLEAR|YELLOW|PALE YELLOW|TRACE)$/i
const METHOD_OR_NOTE_RE =
  /^(?:Calculated|SLS|Flow\s*Cytometry|Flowcytometry|Sheath flow|Capillary|Enzymatic|Uricase|ISE|Urease|Hexokinase|Turbidimetric|Arsenazo|Colorimetric|CMIA|Biuret|IFCC|PNPP|G-glutamyl|Diazonium|DIAZO|Glycerol|Accelerator|Ferene|Refractive|Indicator|Griess|Protein Error|Nitroprusside|Azo|Dip Stick|Sediment|Approved By|Released by|Consultant|Pathologist|KMC|DLH|DR |Dr |Note[:(]|TEST RESULTS|INTERPRETATION|Ref:|Measurement|Patients? |Approximately|Hypervitaminosis|Levels |CAUTIONS|End Of Report|[-#])/i
const METHOD_VALUE_RE =
  /^(?:Calculated|SLS|Flow\s*Cytometry|Flowcytometry|Sheath flow DC detection|Capillary Electrophoresis|Enzymatic|Uricase-Peroxidase method|ISE,?\s*Indirect|Urease|Hexokinase|Turbidimetric|Arsenazo III|Colorimetric|CMIA|Biuret|IFCC|PNPP-AMP Buffer|G-glutamyl-carboxy-nitroanilide|Diazonium Salt|DIAZO REACTION|Glycerol Phosphate Oxidase|Accelerator Selective Detergent|Ferene Method|Refractive Index|Indicator Method|Griess Method|Protein Error Of PH Indicator|Nitroprusside|Azo Coupling Method|Dip Stick,?.*|Sediment)\s+((?:[<>]=?\s*)?(?:\d+(?:\.\d+)?|NEGATIVE|POSITIVE(?:\(\+\))?|PRESENT(?:\(\+\))?|NORMAL|NIL|CLEAR|YELLOW|PALE YELLOW))$/i

function splitFullName(name: string): { first?: string; last?: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return {}
  if (parts.length === 1) return { first: parts[0] }
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

function normalizeDate(input: string | undefined): string {
  if (!input) return ''
  const m = input.match(/(\d{1,2})-([A-Za-z]{3})-(\d{4})/)
  if (!m) return input
  const months: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  }
  return `${m[1].padStart(2, '0')}/${months[m[2].toLowerCase()]}/${m[3]}`
}

function isBoilerplate(line: string): boolean {
  return /^(?:Printed On|Ref\. By|Reg Date|Sample Received|Sample Collected|Report Date|Name\s*:|Age\s*:|Page \d+|-- \d+ of|:|B2B$|MC-\d+|- FINAL|LABORATORY REPORT|Abnormal Result|Test Name Result|Note:|KMC|DLH|Released by|Consultant|Pathologist|Approved By|Dr |DR |# For test)/i.test(line)
}

function isSectionHeading(line: string): boolean {
  if (isBoilerplate(line) || METHOD_OR_NOTE_RE.test(line)) return false
  if (RESULT_VALUE_RE.test(line)) return false
  if (/^(?:PREDIABETES|DIABETES|NORMAL|DEFICIENT|OPTIMAL|TOXICITY|INSUFFICIENT|MICROSCOPY|INTERPRETATION)$/i.test(line)) return false
  if (!SECTION_HEADING_RE.test(line)) return false
  if (UNIT_RE.test(line)) return false
  return line.length <= 60
}

function cleanReferenceRange(range: string): string {
  return range
    .replace(/\s+/g, ' ')
    .replace(/\s+(Calculated|SLS|CMIA|IFCC|Enzymatic|Colorimetric)$/i, '')
    .trim()
}

function extractLineResult(line: string): { line: string; value?: string } {
  const tabParts = line.split(/\t+/).map((p) => p.trim()).filter(Boolean)
  if (tabParts.length > 1 && RESULT_VALUE_RE.test(tabParts[tabParts.length - 1])) {
    return { line: tabParts.slice(0, -1).join(' '), value: tabParts[tabParts.length - 1] }
  }
  return { line }
}

function nextResultValue(lines: string[], start: number): string | undefined {
  for (let i = start; i < Math.min(lines.length, start + 10); i++) {
    const line = lines[i]
    if (!line || isBoilerplate(line)) continue
    if (/Coll\. Time/i.test(line)) continue
    const methodValue = line.match(METHOD_VALUE_RE)
    if (methodValue) return methodValue[1]
    if (METHOD_OR_NOTE_RE.test(line)) continue
    if (isSectionHeading(line)) break
    if (UNIT_RE.test(line)) continue
    if (RESULT_VALUE_RE.test(line)) return line
  }
  return undefined
}

function parseTestLine(line: string): { name: string; unit: string; referenceRange: string; value?: string } | null {
  const withResult = extractLineResult(line)
  line = withResult.line.replace(/\s+/g, ' ').trim()

  const unitMatch = line.match(UNIT_RE)
  if (unitMatch?.index !== undefined) {
    const left = line.slice(0, unitMatch.index).trim()
    const unit = unitMatch[0]
    const right = line.slice(unitMatch.index + unit.length).trim()
    const name = left.replace(/\s+(H|L|A)$/i, '').trim()
    if (!name || name.length < 2 || isBoilerplate(name)) return null
    if (/^[\d<>/=+-]/.test(name) || /(?:risk|borderline|diabetes|deficient|optimal|toxicity|normal)$/i.test(name)) return null
    return { name, unit, referenceRange: cleanReferenceRange(right), value: withResult.value }
  }

  const qualitative = line.match(/^([A-Za-z][A-Za-z /().-]{2,}?)\s+(NEGATIVE|POSITIVE(?:\(\+\))?|PRESENT(?:\(\+\))?|NORMAL|NIL|CLEAR|YELLOW|PALE YELLOW)(?:\s+(.+))?$/i)
  if (qualitative && !isBoilerplate(qualitative[1])) {
    if (qualitative[1].length > 45 || /(?:bound|serum|risk|patients?|reference|antibod|levels?|range)/i.test(qualitative[1])) return null
    return {
      name: qualitative[1].trim(),
      unit: '',
      value: qualitative[2].trim(),
      referenceRange: qualitative[3]?.trim() ?? '',
    }
  }

  return null
}

function extractLabResults(rawText: string): LabEntry[] {
  const allLines = rawText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  const summaryEnd = allLines.findIndex((line) => /Abnormal Result\(s\) Summary End/i.test(line))
  const lines = summaryEnd >= 0 ? allLines.slice(summaryEnd + 1) : allLines
  const labs: LabEntry[] = []
  const seen = new Set<string>()
  let currentReport = 'Laboratory Report'
  let currentDate = normalizeDate(extractFirst(rawText, [/Sample Collected at\s*:\s*\n?\s*([0-9]{1,2}-[A-Za-z]{3}-[0-9]{4})/i, /Reg Date and Time\s*:\s*([0-9]{1,2}-[A-Za-z]{3}-[0-9]{4})/i]))

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/Sample Collected at/i.test(line)) {
      const nextDate = lines.slice(i + 1, i + 5).find((candidate) => /\d{1,2}-[A-Za-z]{3}-\d{4}/.test(candidate))
      currentDate = normalizeDate(nextDate) || currentDate
      continue
    }
    if (/^TEST RESULTS UNIT BIOLOGICAL REF RANGE REMARKS$/i.test(line)) {
      const nextTitle = lines.slice(i + 1, i + 5).find((candidate) =>
        candidate &&
        !isBoilerplate(candidate) &&
        !METHOD_OR_NOTE_RE.test(candidate) &&
        !RESULT_VALUE_RE.test(candidate) &&
        !UNIT_RE.test(candidate),
      )
      if (nextTitle) currentReport = nextTitle.replace(/\s+STANDARD$/i, '').trim()
      continue
    }
    if (isSectionHeading(line) && !/^(TEST RESULTS|MICROSCOPY|PHYSICAL EXAMINATION|URINE CHEMICAL EXAMINATION)/i.test(line)) {
      currentReport = line.replace(/\s+STANDARD$/i, '').trim()
      continue
    }
    if (isBoilerplate(line) || METHOD_OR_NOTE_RE.test(line)) continue

    const parsed = parseTestLine(line)
    if (!parsed) continue
    const value = parsed.value ?? nextResultValue(lines, i + 1)
    if (!value) continue

    const key = `${parsed.name.toLowerCase()}|${value.toLowerCase()}|${parsed.unit.toLowerCase()}|${currentDate}`
    if (seen.has(key)) continue
    seen.add(key)
    labs.push({
      name: parsed.name,
      value,
      unit: parsed.unit,
      referenceRange: parsed.referenceRange,
      date: currentDate,
      reportName: currentReport,
    })
  }

  return labs
}

export function structurePdfText(rawText: string): StructuredReport {
  const report: StructuredReport = {
    labResults: [],
    medications: [],
    diagnoses: [],
    rawText,
  }

  // Demographics
  const nameMatch = rawText.match(NAME_RE)
  if (nameMatch) {
    const name = splitFullName(nameMatch[1])
    report.FirstName = name.first
    report.LastName = name.last
  }
  report.DOB = extractFirst(rawText, [DOB_RE])
  report.MRN = extractFirst(rawText, [MRN_RE])

  const genderRaw = extractFirst(rawText, [GENDER_RE])
  if (genderRaw) {
    const g = genderRaw.toLowerCase()
    report.Gender = g === 'male' || g === 'm' ? 'M' : g === 'female' || g === 'f' ? 'F' : 'U'
  }

  const phones: string[] = []
  let phoneMatch
  const phoneReCopy = new RegExp(PHONE_RE.source, 'gi')
  while ((phoneMatch = phoneReCopy.exec(rawText)) !== null) {
    phones.push(phoneMatch[1].trim())
  }
  if (phones.length) report['Phone Number'] = phones

  report.labResults = extractLabResults(rawText)

  // Medications
  let medMatch
  const medReCopy = new RegExp(MED_LINE_RE.source, 'gi')
  while ((medMatch = medReCopy.exec(rawText)) !== null) {
    report.medications.push({
      name: medMatch[1].trim(),
      dosage: medMatch[2]?.trim() ?? '',
      frequency: medMatch[3]?.trim() ?? '',
      status: 'active',
    })
  }

  // Diagnoses
  let dxMatch
  const dxReCopy = new RegExp(DIAGNOSIS_RE.source, 'gi')
  while ((dxMatch = dxReCopy.exec(rawText)) !== null) {
    const line = dxMatch[1].trim()
    if (line && !/diabetes|normal|prediabetes|recommendation|ref range|risk/i.test(line)) {
      report.diagnoses.push(line)
    }
  }

  return report
}
