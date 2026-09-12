// Mirrors normalizeNopol in the backend's fleet-vehicles module. Applied on every keystroke so
// the field shows exactly the string that will be stored — otherwise the operator types
// "B 9114 KYZ", the register holds "B9114KYZ", and the duplicate warning they get back names a
// plate they never typed.
export function normalizeNopolInput(raw: string): string {
  return raw.replace(/[\s.-]/g, '').toUpperCase()
}
