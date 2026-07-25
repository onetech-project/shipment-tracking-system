'use client'

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

interface TimeSelectProps {
  value: string
  onChange: (value: string) => void
  className: string
}

export function TimeSelect({ value, onChange, className }: TimeSelectProps) {
  const [hour, minute] = value ? value.split(':') : ['', '']

  const emit = (nextHour: string, nextMinute: string) => {
    onChange(nextHour && nextMinute ? `${nextHour}:${nextMinute}` : '')
  }

  return (
    <div className="flex gap-1">
      <select value={hour} onChange={(e) => emit(e.target.value, minute || '00')} className={className}>
        <option value="">HH</option>
        {HOURS.map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      <select value={minute} onChange={(e) => emit(hour || '00', e.target.value)} className={className}>
        <option value="">MM</option>
        {MINUTES.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    </div>
  )
}
