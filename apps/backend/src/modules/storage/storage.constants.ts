// The allow-list is a map rather than a bare array because the extension is derived from the
// verified MIME type, never from the filename the client sent (spec §4.2): a client that names
// its upload "stnk.pdf.exe" must still land in the bucket as .pdf or be refused outright.
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

export const ALLOWED_MIME_TYPES: readonly string[] = Object.keys(EXTENSION_BY_MIME)

// 10 MB, far above the prototype's ~190 KB ceiling — that limit existed only because base64 had
// to fit in localStorage, a constraint this port does not have.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export function extensionFor(mime: string): string | null {
  return EXTENSION_BY_MIME[mime] ?? null
}
