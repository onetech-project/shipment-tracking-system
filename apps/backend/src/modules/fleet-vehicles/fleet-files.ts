import { randomUUID } from 'crypto'
import { extensionFor } from '../storage/storage.constants'

// A slot code comes from master data, which an admin types. It reaches the object key, so it is
// held to a plain identifier: refusing an odd code is a visible error, while silently rewriting
// it would put the file somewhere the operator did not ask for.
const SLOT_CODE = /^[a-z0-9_-]+$/i

function assertSlotCode(slotCode: string): void {
  if (!SLOT_CODE.test(slotCode)) {
    throw new Error(`slot code must be a plain identifier, got "${slotCode}"`)
  }
}

function extensionOrThrow(mime: string): string {
  const ext = extensionFor(mime)
  if (!ext) throw new Error(`unsupported mime type: ${mime}`)
  return ext
}

// A fresh uuid per upload, never the slot code alone: replacing a file repoints the row first and
// deletes the old object second, so reusing a key would delete the replacement.
export function buildVehicleFileKey(vehicleId: string, slotCode: string, mime: string): string {
  assertSlotCode(slotCode)
  return `fleet/${vehicleId}/${slotCode}/${randomUUID()}.${extensionOrThrow(mime)}`
}

export function buildDriverSimKey(driverId: string, mime: string): string {
  return `fleet/drivers/${driverId}/sim/${randomUUID()}.${extensionOrThrow(mime)}`
}

// Parsed rather than pattern-matched, so scheme detection matches what the browser will do with
// the string. Only http and https are allowed: the prototype stored whatever was typed and put it
// straight into an anchor, which made javascript: a working payload (spec §4.3).
export function isSafeExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}
