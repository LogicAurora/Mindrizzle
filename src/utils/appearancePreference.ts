export const APPEARANCE_SETTING_KEY = 'appearance'

export type AppearancePreference = {
  theme: 'light' | 'dark' | 'system'
  primaryColor: string
  colorMode: 'wallpaper' | 'color'
  isDefaultTheme: boolean
  lightColors: Record<string, string | number>
  darkColors: Record<string, string | number>
}

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i

export function isAppearancePreference(value: unknown): value is AppearancePreference {
  if (!value || typeof value !== 'object') return false
  const preference = value as Partial<AppearancePreference>
  return (preference.theme === 'light' || preference.theme === 'dark' || preference.theme === 'system')
    && typeof preference.primaryColor === 'string'
    && HEX_COLOR_PATTERN.test(preference.primaryColor)
    && (preference.colorMode === 'wallpaper' || preference.colorMode === 'color')
    && typeof preference.isDefaultTheme === 'boolean'
    && isColorMap(preference.lightColors)
    && isColorMap(preference.darkColors)
}

function isColorMap(value: unknown): value is Record<string, string | number> {
  return !!value
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.values(value).every((color) =>
      typeof color === 'number'
        ? Number.isFinite(color)
        : typeof color === 'string' && HEX_COLOR_PATTERN.test(color),
    )
}