'use client'

import { PnlNamedCostItem, PnlSgInRouteCostItem } from '@/features/pnl/hooks/usePnl'
import { shareTable } from '../utils/share'
import { AnalyticsSection } from './AnalyticsSection'
import { RangeFallbackNote, ScopeFallbackNote } from './AnalyticsNotes'
import { ShareBlock } from './ShareBlock'

interface AnalyticsSgProps {
  outgoing: PnlNamedCostItem[] | undefined
  incoming: PnlSgInRouteCostItem[] | undefined
  isLoading: boolean
  isError: boolean
  scoped: boolean
  ranged: boolean
}

export function AnalyticsSg({
  outgoing,
  incoming,
  isLoading,
  isError,
  scoped,
  ranged,
}: AnalyticsSgProps) {
  return (
    <AnalyticsSection
      id="sg"
      title="Incoming & Outgoing"
      subtitle="Ground handling either side of the main leg"
    >
      {scoped && <ScopeFallbackNote />}
      {ranged && <RangeFallbackNote />}

      <div>
        <p className="text-sm font-medium">Outgoing (SG Out), by handler</p>
        <ShareBlock
          what="Outgoing handlers"
          nameHeader="Handler"
          share={outgoing ? shareTable(outgoing, 'name') : undefined}
          isLoading={isLoading}
          isError={isError}
        />
      </div>

      <div>
        <p className="text-sm font-medium">Incoming (SG In), by route</p>
        {/* Incoming is reported per route, not per handler — the endpoint has no handler name. */}
        <ShareBlock
          what="Incoming routes"
          nameHeader="Route"
          share={incoming ? shareTable(incoming, 'route') : undefined}
          isLoading={isLoading}
          isError={isError}
        />
      </div>
    </AnalyticsSection>
  )
}
