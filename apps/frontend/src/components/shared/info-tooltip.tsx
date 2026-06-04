'use client'

import { useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface InfoTooltipProps {
  text: string
  className?: string
}

export function InfoTooltip({ text, className }: InfoTooltipProps) {
  const triggerRef = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const show = () => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) setCoords({ top: rect.bottom + 6, left: rect.left + rect.width / 2 })
    setOpen(true)
  }
  const hide = () => setOpen(false)

  return (
    <span
      ref={triggerRef}
      className={cn('inline-flex items-center', className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <HelpCircle
        size={14}
        tabIndex={0}
        role="img"
        aria-label={text}
        className="cursor-help text-muted-foreground outline-none"
      />
      {mounted &&
        open &&
        createPortal(
          <span
            role="tooltip"
            style={{ position: 'fixed', top: coords.top, left: coords.left }}
            className="pointer-events-none z-[200] w-56 -translate-x-1/2 rounded-md border bg-popover px-2 py-1 text-xs font-normal text-popover-foreground shadow-md"
          >
            {text}
          </span>,
          document.body
        )}
    </span>
  )
}
