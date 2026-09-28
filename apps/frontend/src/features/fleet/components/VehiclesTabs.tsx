'use client'

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
    <nav role="tablist" aria-label="Tampilan" className="mb-4 flex gap-1 border-b">
      {TABS.map((tab) => (
        <button
          key={tab.value}
          role="tab"
          aria-selected={value === tab.value}
          onClick={() => onChange(tab.value)}
          className={`-mb-px border-b-2 px-4 py-2 text-sm transition-colors ${
            value === tab.value
              ? 'border-primary font-medium text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
