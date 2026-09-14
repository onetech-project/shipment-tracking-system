// Hardcoded here rather than stored on the master row: these are wording choices about the form,
// and an admin adding a document type should not have to compose two sentence fragments for it.
// A code that is not listed falls back to its own label, so new types still read sensibly.
const DOC_LABELS: Record<string, { issued: string; expires: string }> = {
  kir: { issued: 'Tanggal uji KIR', expires: 'Masa berlaku KIR sampai' },
  stnk: { issued: 'STNK terbit', expires: 'Masa berlaku STNK' },
  pajak: { issued: 'Pajak dibayar', expires: 'Jatuh tempo pajak tahunan' },
  asuransi: { issued: 'Asuransi mulai', expires: 'Masa berlaku asuransi' },
  kartu_pengawasan: {
    issued: 'Kartu pengawasan terbit',
    expires: 'Masa berlaku kartu pengawasan',
  },
  emisi: { issued: 'Uji emisi terakhir', expires: 'Masa berlaku uji emisi' },
  servis: { issued: 'Servis berkala terakhir', expires: 'Servis berkala berikutnya' },
}

export function docLabels(code: string, label: string): { issued: string; expires: string } {
  return DOC_LABELS[code] ?? { issued: `${label} terbit`, expires: `${label} berlaku sampai` }
}
