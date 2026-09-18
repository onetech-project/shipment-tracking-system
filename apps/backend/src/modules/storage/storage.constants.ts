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

// Requirement §5 caps vehicle photos at 5 MB and expects images, not scans: a photo slot is
// where an operator puts a picture of the unit, and a pdf there is a mis-drop rather than a
// document. The global ceiling above still applies first — this narrows, never widens.
export const PHOTO_MAX_UPLOAD_BYTES = 5 * 1024 * 1024

export const PHOTO_MIME_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp']

// Photo slots are recognised by their code, not by an id list: ids differ per environment and an
// admin may add a fifth photo slot from the Master Data screen without a deploy. The frontend
// mirrors this prefix in useVehicleBerkas.ts for the same reason ACCEPTED is duplicated in
// BerkasUploadDialog — the browser saves a doomed upload, this refuses one.
export const PHOTO_SLOT_PREFIX = 'foto_'

export function isPhotoSlot(code: string): boolean {
  return code.startsWith(PHOTO_SLOT_PREFIX)
}
