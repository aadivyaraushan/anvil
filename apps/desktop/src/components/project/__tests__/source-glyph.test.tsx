import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { SourceGlyph } from '../source-glyph'

describe('SourceGlyph', () => {
  it('renders "Desktop" label for desktop source', () => {
    render(<SourceGlyph source="desktop" />)
    expect(screen.getByText('Desktop')).toBeDefined()
  })

  it('renders "Calendar" label for cal source', () => {
    render(<SourceGlyph source="cal" />)
    expect(screen.getByText('Calendar')).toBeDefined()
  })

  it('renders "In-person" label for inperson source', () => {
    render(<SourceGlyph source="inperson" />)
    expect(screen.getByText('In-person')).toBeDefined()
  })

  it('renders "Uploaded" label for uploaded source', () => {
    render(<SourceGlyph source="uploaded" />)
    expect(screen.getByText('Uploaded')).toBeDefined()
  })

  it('renders "Meet link" label for meet_link source', () => {
    render(<SourceGlyph source="meet_link" />)
    expect(screen.getByText('Meet link')).toBeDefined()
  })

  it('desktop source uses rose color', () => {
    const { container } = render(<SourceGlyph source="desktop" />)
    const dot = container.querySelector('span > span:first-child') as HTMLElement | null
    expect(dot?.className ?? '').toContain('color-rose')
  })

  it('cal source uses azure color', () => {
    const { container } = render(<SourceGlyph source="cal" />)
    const dot = container.querySelector('span > span:first-child') as HTMLElement | null
    expect(dot?.className ?? '').toContain('color-azure')
  })

  it('inperson source uses amber color', () => {
    const { container } = render(<SourceGlyph source="inperson" />)
    const dot = container.querySelector('span > span:first-child') as HTMLElement | null
    expect(dot?.className ?? '').toContain('color-amber')
  })
})
