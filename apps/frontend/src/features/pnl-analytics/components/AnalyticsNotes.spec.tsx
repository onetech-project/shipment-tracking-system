/**
 * An endpoint that failed to load and one that genuinely returned nothing are different facts.
 * Rendering the first as an empty table tells the reader "nothing happened this period", which is
 * a claim nobody made — so the two notes are pinned apart here.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { AbsentNote, EmptyNote, RangeFallbackNote, ScopeFallbackNote } from './AnalyticsNotes'

describe('AnalyticsNotes', () => {
  it('says the scope selector does not reach this section', () => {
    render(<ScopeFallbackNote />)
    expect(screen.getByText(/route scope selected above does not apply/i)).toBeInTheDocument()
  })

  it('says a custom range falls back to the full period', () => {
    render(<RangeFallbackNote />)
    expect(screen.getByText(/whole period/i)).toBeInTheDocument()
  })

  it('distinguishes a dataset that failed to load from one that is empty', () => {
    const { unmount } = render(<AbsentNote what="Vendor costs" />)
    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument()
    unmount()
    render(<EmptyNote what="Vendor costs" />)
    expect(screen.getByText(/no vendor costs in this period/i)).toBeInTheDocument()
  })

  // The label arrives capitalised from the section heading but lands mid-sentence here, so the
  // exact casing is asserted rather than matched case-insensitively.
  it('lowercases the dataset label inside the empty sentence', () => {
    render(<EmptyNote what="Vendor costs" />)
    expect(screen.getByText('No vendor costs in this period.')).toBeInTheDocument()
  })

  // AbsentNote names the dataset it failed to load; a note that names the wrong one, or none,
  // sends the reader to the wrong section.
  it('names the dataset that failed to load', () => {
    render(<AbsentNote what="Vendor costs" />)
    expect(
      screen.getByText('Vendor costs could not be loaded, so this section is incomplete.'),
    ).toBeInTheDocument()
  })
})
