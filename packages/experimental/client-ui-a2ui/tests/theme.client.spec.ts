import { describe, expect, it } from 'vitest'
import { readSurfaceTheme, surfaceThemeStyle } from '../src/client/theme.ts'

const surface = (theme: unknown) => ({
  version: '1.0',
  createSurface: {
    surfaceId: 'themed',
    catalogId: 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json',
    components: [{ id: 'root', component: 'Text', text: 'x' }],
    metadata: { extensions: { dsh_theme: theme } },
  },
})

describe('A2UI surface theme tokens', () => {
  it('reads admitted tokens and ignores unknown ones', () => {
    expect(readSurfaceTheme([surface({ tone: 'danger', density: 'compact', textScale: 'lg' })]))
      .toEqual({ tone: 'danger', density: 'compact', textScale: 'lg' })

    expect(readSurfaceTheme([surface({ tone: 'chartreuse', density: 'compact' })]))
      .toEqual({ density: 'compact' })
  })

  it('ignores envelopes without a theme', () => {
    expect(readSurfaceTheme([{ version: '1.0', deleteSurface: { surfaceId: 'x' } }])).toBeUndefined()
    expect(readSurfaceTheme([surface({})])).toBeUndefined()
    expect(readSurfaceTheme([{ version: '1.0', createSurface: { surfaceId: 'x' } }])).toBeUndefined()
    expect(readSurfaceTheme([surface('danger')])).toBeUndefined()
  })

  it('maps a single token without touching the other custom properties', () => {
    const toneOnly = surfaceThemeStyle({ tone: 'info' })
    expect(toneOnly.vars).toEqual({ '--a2ui-color-primary': '#4c8dff' })

    const densityOnly = surfaceThemeStyle({ density: 'spacious' })
    expect(Object.keys(densityOnly.vars).every(key => key.startsWith('--a2ui-spacing') || key === '--a2ui-grid-base')).toBe(true)
    expect(densityOnly.tone).toBeUndefined()

    const scaleOnly = surfaceThemeStyle({ textScale: 'sm' })
    expect(scaleOnly.vars['--a2ui-font-size']).toBe('12px')
    expect(scaleOnly.vars['--a2ui-color-primary']).toBeUndefined()
  })

  it('maps tokens onto catalog custom properties', () => {
    const themed = surfaceThemeStyle({ tone: 'success', density: 'spacious', textScale: 'sm' })
    expect(themed.tone).toBe('success')
    expect(themed.vars['--a2ui-color-primary']).toBe('#3fb950')
    expect(themed.vars['--a2ui-spacing-l']).toBe('24px')
    expect(themed.vars['--a2ui-font-size']).toBe('12px')
    expect(surfaceThemeStyle(undefined)).toEqual({ vars: {} })
  })
})
