import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { Pill } from '../pill'

describe('Pill', () => {
  it('renders children text', () => {
    render(<Pill>high</Pill>)
    expect(screen.getByText('high')).toBeDefined()
  })

  it('indigo tone applies primary bg class', () => {
    const { container } = render(<Pill tone="indigo">indigo</Pill>)
    const el = container.querySelector('span') as HTMLElement
    expect(el.className).toContain('bg-primary')
  })

  it('amber tone applies amber-tinted classes', () => {
    const { container } = render(<Pill tone="amber">amber</Pill>)
    const el = container.querySelector('span') as HTMLElement
    expect(el.className).toContain('color-amber')
  })

  it('rose tone applies rose-tinted classes', () => {
    const { container } = render(<Pill tone="rose">rose</Pill>)
    const el = container.querySelector('span') as HTMLElement
    expect(el.className).toContain('color-rose')
  })

  it('azure tone applies azure-tinted classes', () => {
    const { container } = render(<Pill tone="azure">azure</Pill>)
    const el = container.querySelector('span') as HTMLElement
    expect(el.className).toContain('color-azure')
  })

  it('outline tone applies border-border class', () => {
    const { container } = render(<Pill tone="outline">outline</Pill>)
    const el = container.querySelector('span') as HTMLElement
    expect(el.className).toContain('bg-transparent')
  })

  it('defaults to outline when no tone provided', () => {
    const { container } = render(<Pill>default</Pill>)
    const el = container.querySelector('span') as HTMLElement
    expect(el.className).toContain('bg-transparent')
  })

  it('always renders rounded-full and text-[11px]', () => {
    const { container } = render(<Pill tone="indigo">test</Pill>)
    const el = container.querySelector('span') as HTMLElement
    expect(el.className).toContain('rounded-full')
    expect(el.className).toContain('text-[11px]')
  })
})
