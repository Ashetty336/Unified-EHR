// Multilingual prescription understanding via a Groq vision model.
// One structured-JSON pass does OCR + source-language detection + English
// translation (preserving medical terminology) + structured medication extraction.

import { groqChat, imageContentPart } from './client'

export interface ExtractedMedication {
  name: string
  dosage?: string // e.g. "500 mg"
  frequency?: string // e.g. "twice daily" / "BID"
  duration?: string // e.g. "5 days"
  route?: string // e.g. "oral"
  instructions?: string // free-text sig
}

export interface PrescriptionExtraction {
  detectedLanguage: string // ISO-ish code, e.g. "kn", "hi", "ta", "en", "other"
  detectedLanguageName: string // human-readable, e.g. "Kannada"
  extractedText: string // raw OCR in the native script
  translatedText: string // English translation
  prescriber?: string
  patientName?: string
  prescribedDate?: string // ISO (YYYY-MM-DD) if parseable
  medications: ExtractedMedication[]
  warnings: string[] // low-confidence / unreadable flags
}

export type ExtractionResult =
  | { ok: true; extraction: PrescriptionExtraction }
  | { ok: false; error: string; status?: number }

const SYSTEM_PROMPT = `You are a clinical document understanding assistant for an EHR system in India.
You receive an image of a medical prescription that may be handwritten or printed in Kannada, Hindi, Tamil, or English.

Perform ALL of the following and return ONLY a single JSON object (no markdown, no prose):
1. OCR the prescription text verbatim in its original script.
2. Detect the source language.
3. Translate the full text to English, PRESERVING medical terminology. Keep drug names as proper generic or brand names (do not phonetically transliterate them into nonsense). Keep units (mg, ml) and clinical abbreviations.
4. Extract every prescribed medication as structured data.

Return JSON with EXACTLY this shape:
{
  "detectedLanguage": "kn | hi | ta | en | other",
  "detectedLanguageName": "Kannada | Hindi | Tamil | English | <name>",
  "extractedText": "<verbatim OCR in native script>",
  "translatedText": "<full English translation>",
  "prescriber": "<doctor name or empty string>",
  "patientName": "<patient name or empty string>",
  "prescribedDate": "<YYYY-MM-DD or empty string>",
  "medications": [
    {
      "name": "<drug name in English>",
      "dosage": "<strength e.g. 500 mg, or empty string>",
      "frequency": "<e.g. twice daily / 1-0-1, or empty string>",
      "duration": "<e.g. 5 days, or empty string>",
      "route": "<e.g. oral, or empty string>",
      "instructions": "<sig / special instructions in English, or empty string>"
    }
  ],
  "warnings": ["<note any text that was illegible or any low-confidence reading>"]
}

Rules:
- If the image is not a prescription or is unreadable, return empty fields and explain in "warnings".
- Never invent medications. If a field is unknown, use an empty string.
- "medications" and "warnings" must always be arrays (possibly empty).`

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function normalizeMedication(raw: unknown): ExtractedMedication | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>
  const name = asString(m.name)
  if (!name) return null
  const med: ExtractedMedication = { name }
  const dosage = asString(m.dosage)
  const frequency = asString(m.frequency)
  const duration = asString(m.duration)
  const route = asString(m.route)
  const instructions = asString(m.instructions)
  if (dosage) med.dosage = dosage
  if (frequency) med.frequency = frequency
  if (duration) med.duration = duration
  if (route) med.route = route
  if (instructions) med.instructions = instructions
  return med
}

// Defensively coerce the model's JSON into a PrescriptionExtraction.
function normalize(parsed: unknown): PrescriptionExtraction {
  const p = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>
  const meds = Array.isArray(p.medications)
    ? (p.medications.map(normalizeMedication).filter(Boolean) as ExtractedMedication[])
    : []
  const warnings = Array.isArray(p.warnings)
    ? (p.warnings.map(asString).filter(Boolean) as string[])
    : []

  const extraction: PrescriptionExtraction = {
    detectedLanguage: asString(p.detectedLanguage) || 'other',
    detectedLanguageName: asString(p.detectedLanguageName) || 'Unknown',
    extractedText: asString(p.extractedText),
    translatedText: asString(p.translatedText),
    medications: meds,
    warnings,
  }
  const prescriber = asString(p.prescriber)
  const patientName = asString(p.patientName)
  const prescribedDate = asString(p.prescribedDate)
  if (prescriber) extraction.prescriber = prescriber
  if (patientName) extraction.patientName = patientName
  if (/^\d{4}-\d{2}-\d{2}/.test(prescribedDate)) extraction.prescribedDate = prescribedDate.slice(0, 10)

  if (meds.length === 0 && !extraction.warnings.length) {
    extraction.warnings.push('No medications could be extracted from the image.')
  }
  return extraction
}

export async function extractPrescription(
  imageBase64: string,
  mimeType: string,
): Promise<ExtractionResult> {
  const res = await groqChat(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extract this prescription. Return only the JSON object.' },
          imageContentPart(imageBase64, mimeType),
        ],
      },
    ],
    { jsonObject: true, temperature: 0.1, maxTokens: 4096 },
  )

  if (!res.ok) return { ok: false, error: res.error, status: res.status }

  let parsed: unknown
  try {
    parsed = JSON.parse(res.content)
  } catch {
    return { ok: false, error: 'Groq did not return valid JSON', status: 502 }
  }

  return { ok: true, extraction: normalize(parsed) }
}
