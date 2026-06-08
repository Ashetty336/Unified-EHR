import { PDFParse } from 'pdf-parse'

export type ExtractResult =
  | { ok: true; text: string; method: 'pdfparse' }
  | { ok: false; error: string }

// Below this length pdf-parse output is treated as empty (image-only/scanned PDF).
const MIN_TEXT_LENGTH = 40

// Extract text from a PDF buffer using pdf-parse (pdfjs-dist underneath).
// Only digital/searchable PDFs are supported. Scanned image-only PDFs return an
// error explaining that OCR is not enabled — tesseract.js does not accept PDF
// input directly so the previous fallback never worked. To support OCR, rasterize
// pages to PNG via a separate pipeline and call tesseract on each image.
export async function extractTextFromPdf(pdfBuffer: Buffer): Promise<ExtractResult> {
  let parser: PDFParse | null = null
  try {
    parser = new PDFParse({ data: new Uint8Array(pdfBuffer) })
    const result = await parser.getText()
    const text = (result.text ?? '').trim()

    if (text.length < MIN_TEXT_LENGTH) {
      return {
        ok: false,
        error:
          'PDF contains no extractable text (likely a scanned/image-only PDF). Re-upload as a digital PDF or as JSON / C-CDA.',
      }
    }

    return { ok: true, text, method: 'pdfparse' }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  } finally {
    try {
      await parser?.destroy()
    } catch {
      /* ignore */
    }
  }
}
