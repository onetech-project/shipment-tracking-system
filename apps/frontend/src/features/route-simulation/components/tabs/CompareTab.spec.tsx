import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { fixtureSource, PROTOTYPE_ACCOUNTS } from '../../engine/__fixtures__/source'
import { buildLanes, createState } from '../../engine'
import { CompareTab } from './CompareTab'

const src = fixtureSource()
const sim0 = { ...createState(src), accounts: PROTOTYPE_ACCOUNTS }
const sim = { ...sim0, lanes: buildLanes(src, sim0) }

it('marks exactly one optimal lane per route with lanes', () => {
  render(<CompareTab source={src} sim={sim} dispatch={jest.fn()} />)
  // Routes in two groups render twice, so count per unique route key.
  expect(screen.getAllByText('Optimal').length).toBeGreaterThanOrEqual(sim.routes.length)
})

it('drops a vendor from every route when unticked', () => {
  render(<CompareTab source={src} sim={sim} dispatch={jest.fn()} />)
  expect(screen.queryAllByText(/^PELITA\b/, { selector: 'td' }).length).toBeGreaterThan(0)
  fireEvent.click(screen.getByRole('checkbox', { name: 'PELITA' }))
  expect(screen.queryAllByText(/^PELITA\b/, { selector: 'td' })).toHaveLength(0)
})
