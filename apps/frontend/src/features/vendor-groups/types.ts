export interface AvailableVendor {
  vendor: string // raw name, byte-identical to what v_pnl_to.vendor holds — never trimmed or cased
  hasData: boolean // false = no TO has ever carried this vendor, so it renders as an empty column
  inMaster: boolean // false = booked but absent from the SMU rate card entirely
}

export interface VendorGroup {
  id: string
  name: string
  description: string | null
  vendors: string[]
}

// The write shape. Vendors go back exactly as they came out of the picker.
export interface VendorGroupPayload {
  name: string
  // description: null clears it; omitting the field leaves it unchanged on update.
  description?: string | null
  vendors: string[]
}
