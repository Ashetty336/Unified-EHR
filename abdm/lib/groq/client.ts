// Groq API — HTTP client (OpenAI-compatible chat completions).
// No SDK dependency; raw fetch matches the project's lib/fhir/converter.ts style.
// Used for multilingual prescription OCR + translation + medication extraction.

const GROQ_BASE = 'https://api.groq.com/openai/v1'

// Vision-capable default. Override with GROQ_VISION_MODEL.
const DEFAULT_VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct'

export function visionModel(): string {
  return process.env.GROQ_VISION_MODEL || DEFAULT_VISION_MODEL
}

export type GroqResult =
  | { ok: true; content: string }
  | { ok: false; error: string; status?: number }

type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string | Array<Record<string, unknown>>
}

// Call Groq chat completions and return the assistant message content.
// `jsonObject` requests response_format json_object so callers get parseable JSON.
export async function groqChat(
  messages: ChatMessage[],
  opts: { model?: string; temperature?: number; jsonObject?: boolean; maxTokens?: number } = {},
): Promise<GroqResult> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    return { ok: false, error: 'GROQ_API_KEY not configured', status: 503 }
  }

  const body: Record<string, unknown> = {
    model: opts.model ?? visionModel(),
    messages,
    temperature: opts.temperature ?? 0.1,
    ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
    ...(opts.jsonObject ? { response_format: { type: 'json_object' } } : {}),
  }

  let res: Response
  try {
    res = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), status: 502 }
  }

  if (!res.ok) {
    let detail = ''
    try {
      const j = (await res.json()) as { error?: { message?: string } }
      detail = j.error?.message ?? ''
    } catch {
      /* ignore */
    }
    return { ok: false, error: `Groq request failed (${res.status})${detail ? `: ${detail}` : ''}`, status: 502 }
  }

  let json: { choices?: { message?: { content?: string } }[] }
  try {
    json = await res.json()
  } catch (err) {
    return { ok: false, error: `invalid Groq response: ${err instanceof Error ? err.message : String(err)}`, status: 502 }
  }

  const content = json.choices?.[0]?.message?.content
  if (typeof content !== 'string' || content.length === 0) {
    return { ok: false, error: 'Groq returned an empty completion', status: 502 }
  }
  return { ok: true, content }
}

// Build an OpenAI-style image_url content part from raw image bytes.
export function imageContentPart(base64: string, mimeType: string): Record<string, unknown> {
  return {
    type: 'image_url',
    image_url: { url: `data:${mimeType};base64,${base64}` },
  }
}
