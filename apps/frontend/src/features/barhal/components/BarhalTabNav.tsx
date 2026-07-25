'use client'

const TABS = [
  { key: 'koli', label: 'Koli', href: '/barhal/koli' },
  { key: 'smu', label: 'SMU', href: '/barhal/smu' },
  { key: 'dashboard', label: 'Dashboard', href: '/barhal/dashboard' },
] as const

interface BarhalTabNavProps {
  active: 'koli' | 'smu' | 'dashboard'
}

export function BarhalTabNav({ active }: BarhalTabNavProps) {
  return (
    <div className="flex gap-1 border-b border-border">
      {TABS.map((tab) => (
        <a
          key={tab.key}
          href={tab.href}
          className={`px-4 py-2 text-sm font-medium ${
            active === tab.key
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {tab.label}
        </a>
      ))}
    </div>
  )
}
