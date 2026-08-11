'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Step1CreateKoli } from './Step1CreateKoli'
import { Step2SelectTos } from './Step2SelectTos'
import { Step3Packing } from './Step3Packing'
import { BarhalKoli } from '../../types'

const STEP_LABELS = ['Buat Koli', 'Pilih TO', 'Kelola Koli & Berat']

export function isKoliIncomplete(koli: BarhalKoli): boolean {
  return (
    koli.total_to === 0 ||
    koli.weight_after == null ||
    koli.length_cm == null ||
    koli.width_cm == null ||
    koli.height_cm == null ||
    koli.batang_kayu == null
  )
}

function nextStepFor(koli: BarhalKoli): number {
  if (koli.total_to === 0) return 2
  return 3
}

interface BarhalKoliWizardProps {
  open: boolean
  initialKoli?: BarhalKoli
  onClose: () => void
  onDone: () => void
}

export function BarhalKoliWizard({ open, initialKoli, onClose, onDone }: BarhalKoliWizardProps) {
  const [koli, setKoli] = useState<BarhalKoli | undefined>(initialKoli)
  const [step, setStep] = useState(initialKoli ? nextStepFor(initialKoli) : 1)

  useEffect(() => {
    if (open) {
      setKoli(initialKoli)
      setStep(initialKoli ? nextStepFor(initialKoli) : 1)
    }
  }, [open, initialKoli])

  const handleClose = () => {
    setKoli(undefined)
    setStep(1)
    onClose()
  }

  const handleStepDone = (updated: BarhalKoli, isFinal: boolean) => {
    setKoli(updated)
    if (isFinal) {
      onDone()
      handleClose()
      return
    }
    setStep((s) => s + 1)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{koli ? koli.koli_number : 'Tambah Koli'}</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 border-b border-border pb-3 text-xs">
          {STEP_LABELS.map((label, i) => {
            const target = i + 1
            const enabled = target === 1 || !!koli
            return (
              <button
                key={label}
                type="button"
                disabled={!enabled}
                onClick={() => enabled && setStep(target)}
                className={`rounded-full px-3 py-1 transition ${
                  step === target
                    ? 'bg-primary text-primary-foreground'
                    : enabled
                      ? 'bg-muted text-muted-foreground hover:bg-muted/70'
                      : 'cursor-not-allowed bg-muted/50 text-muted-foreground/50'
                }`}
              >
                {target} · {label}
              </button>
            )
          })}
        </div>

        <div className="max-h-[70vh] overflow-y-auto py-2">
          {step === 1 && <Step1CreateKoli koli={koli} onCreated={(k) => handleStepDone(k, false)} />}
          {step === 2 && koli && <Step2SelectTos koli={koli} onAttached={(k) => handleStepDone(k, false)} />}
          {step === 3 && koli && <Step3Packing koli={koli} onSaved={(k) => handleStepDone(k, true)} />}
        </div>
      </DialogContent>
    </Dialog>
  )
}
