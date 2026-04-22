import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'
import { LiveDot } from '../live-dot'

describe('LiveDot', () => {
  it('renders with default rose color class', () => {
    const { container } = render(<LiveDot />)
    const spans = container.querySelectorAll('span')
    // The filled dot and the ping ring both get the rose color class
    const hasRose = Array.from(spans).some((s) =>
      s.className.includes('color-rose') || s.className.includes('rose')
    )
    expect(hasRose).toBe(true)
  })

  it('renders with azure color class when color=azure', () => {
    const { container } = render(<LiveDot color="azure" />)
    const spans = container.querySelectorAll('span')
    const hasAzure = Array.from(spans).some((s) =>
      s.className.includes('color-azure') || s.className.includes('azure')
    )
    expect(hasAzure).toBe(true)
  })

  it('renders with amber color class when color=amber', () => {
    const { container } = render(<LiveDot color="amber" />)
    const spans = container.querySelectorAll('span')
    const hasAmber = Array.from(spans).some((s) =>
      s.className.includes('color-amber') || s.className.includes('amber')
    )
    expect(hasAmber).toBe(true)
  })

  it('renders exactly 3 spans (wrapper + ping + dot)', () => {
    const { container } = render(<LiveDot />)
    const spans = container.querySelectorAll('span')
    expect(spans.length).toBe(3)
  })

  it('ping span has animate-ping class', () => {
    const { container } = render(<LiveDot />)
    const spans = container.querySelectorAll('span')
    const hasPing = Array.from(spans).some((s) =>
      s.className.includes('animate-ping')
    )
    expect(hasPing).toBe(true)
  })

  it('renders md size with larger dot class', () => {
    const { container } = render(<LiveDot size="md" />)
    const spans = container.querySelectorAll('span')
    // md uses w-2.5 h-2.5
    const hasMd = Array.from(spans).some((s) =>
      s.className.includes('w-2.5')
    )
    expect(hasMd).toBe(true)
  })
})
