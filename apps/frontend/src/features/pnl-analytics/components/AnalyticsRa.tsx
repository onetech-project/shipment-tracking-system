'use client'

import { PnlNamedCostItem } from '@/features/pnl/hooks/usePnl'
import { shareTable } from '../utils/share'
import { AnalyticsSection } from './AnalyticsSection'
import { RangeFallbackNote, ScopeFallbackNote } from './AnalyticsNotes'
import { ShareBlock } from './ShareBlock'

interface AnalyticsRaProps {
  data: PnlNamedCostItem[] | undefined
  isLoading: boolean
  isError: boolean
  scoped: boolean
  ranged: boolean
}

export function AnalyticsRa({ data, isLoading, isError, scoped, ranged }: AnalyticsRaProps) {
  return (
    <AnalyticsSection
      id="ra"
      title="Regulated Agent"
      subtitle="Screening cost, by provider"
    >
      {scoped && <ScopeFallbackNote />}
      {ranged && <RangeFallbackNote />}
      <ShareBlock
        what="RA providers"
        nameHeader="RA provider"
        share={data ? shareTable(data, 'name') : undefined}
        isLoading={isLoading}
        isError={isError}
      />
    </AnalyticsSection>
  )
}
