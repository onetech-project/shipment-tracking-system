'use client'

import { ModeTabs } from '@/components/ui/segmented'

export type VehiclesTab = 'armada' | 'berkas' | 'angsuran'

const TABS: { value: VehiclesTab; label: string }[] = [
  { value: 'armada', label: 'Armada & dokumen' },
  { value: 'berkas', label: 'Softcopy berkas' },
  { value: 'angsuran', label: 'Kepemilikan & angsuran' },
]

interface Props {
  value: VehiclesTab
  onChange: (tab: VehiclesTab) => void
}

// Tabs inside the vehicles page, not entries in the fleet sub-nav: in the prototype these are
// three views of the same register, and the spec keeps them that way (§6.3).
export function VehiclesTabs({ value, onChange }: Props) {
  return (
    <ModeTabs
      value={value}
      onValueChange={onChange}
      items={TABS}
      aria-label="Tampilan"
      className="mb-4"
    />
  )
}
