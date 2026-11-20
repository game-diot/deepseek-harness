/**
 * Surface theme tokens admitted through the `dsh_theme` metadata extension.
 *
 * The tokens map onto the catalog CSS custom properties this container publishes, so a
 * Surface can choose an accent, spacing rhythm, and type scale from closed sets. Free-form
 * colours, sizes, and CSS stay out: a custom catalog remains the way to restyle the
 * catalog's own components.
 */

/** Closed token sets mirrored from the Host schema. */
export interface SurfaceTheme {
  readonly tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger' | undefined
  readonly density?: 'compact' | 'comfortable' | 'spacious' | undefined
  readonly textScale?: 'sm' | 'md' | 'lg' | undefined
}

/** Accent colours per tone, applied to the catalog's primary colour token. */
const TONE: Readonly<Record<NonNullable<SurfaceTheme['tone']>, string>> = {
  neutral: '#8a8f98',
  info: '#4c8dff',
  success: '#3fb950',
  warning: '#d29922',
  danger: '#f85149',
}

/** Catalog spacing tokens per density. */
const DENSITY: Readonly<Record<NonNullable<SurfaceTheme['density']>, Readonly<Record<string, string>>>> = {
  compact: { '--a2ui-grid-base': '4px', '--a2ui-spacing-m': '6px', '--a2ui-spacing-l': '12px' },
  comfortable: { '--a2ui-grid-base': '8px', '--a2ui-spacing-m': '8px', '--a2ui-spacing-l': '16px' },
  spacious: { '--a2ui-grid-base': '12px', '--a2ui-spacing-m': '12px', '--a2ui-spacing-l': '24px' },
}

/** Catalog type scale per text scale. */
const TEXT_SCALE: Readonly<Record<NonNullable<SurfaceTheme['textScale']>, Readonly<Record<string, string>>>> = {
  sm: { '--a2ui-font-size': '12px', '--a2ui-font-size-s': '11px', '--a2ui-font-size-m': '12px', '--a2ui-font-size-l': '15px' },
  md: { '--a2ui-font-size': '13px', '--a2ui-font-size-s': '12px', '--a2ui-font-size-m': '13px', '--a2ui-font-size-l': '16px' },
  lg: { '--a2ui-font-size': '15px', '--a2ui-font-size-s': '13px', '--a2ui-font-size-m': '15px', '--a2ui-font-size-l': '18px' },
}

function token<T extends string>(value: unknown, allowed: Readonly<Record<T, unknown>>): T | undefined {
  if (typeof value !== 'string') return undefined
  return Object.hasOwn(allowed, value) ? value as T : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Read the first surface theme in a persisted envelope.
 * @param messages - canonical A2UI messages already admitted by the Host.
 * @returns the admitted tokens, or undefined when no surface carries any.
 */
export function readSurfaceTheme(messages: readonly unknown[]): SurfaceTheme | undefined {
  for (const message of messages) {
    if (!isRecord(message) || !isRecord(message.createSurface)) continue
    const { createSurface } = message
    if (!isRecord(createSurface.metadata) || !isRecord(createSurface.metadata.extensions)) continue
    const raw = createSurface.metadata.extensions.dsh_theme
    if (!isRecord(raw)) continue
    const theme: { tone?: SurfaceTheme['tone']; density?: SurfaceTheme['density']; textScale?: SurfaceTheme['textScale'] } = {}
    const tone = token(raw.tone, TONE)
    const density = token(raw.density, DENSITY)
    const textScale = token(raw.textScale, TEXT_SCALE)
    if (tone !== undefined) theme.tone = tone
    if (density !== undefined) theme.density = density
    if (textScale !== undefined) theme.textScale = textScale
    if (tone === undefined && density === undefined && textScale === undefined) continue
    return theme
  }
  return undefined
}

/**
 * Map admitted tokens onto the catalog CSS custom properties this container publishes.
 * @param theme - tokens read from the envelope.
 * @returns the tone attribute value and the custom properties to apply.
 */
export function surfaceThemeStyle(theme: SurfaceTheme | undefined): {
  readonly tone?: string | undefined
  readonly vars: Readonly<Record<string, string>>
} {
  if (theme === undefined) return { vars: {} }
  const vars: Record<string, string> = {}
  if (theme.tone !== undefined) vars['--a2ui-color-primary'] = TONE[theme.tone]
  if (theme.density !== undefined) Object.assign(vars, DENSITY[theme.density])
  if (theme.textScale !== undefined) Object.assign(vars, TEXT_SCALE[theme.textScale])
  return { tone: theme.tone, vars }
}
