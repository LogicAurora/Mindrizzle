const SIZE_UNITS = ['B', 'KB', 'MB', 'GB']

export const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), SIZE_UNITS.length - 1)
  const value = bytes / 1024 ** exponent
  const shown = exponent === 0 || value >= 10 ? Math.round(value) : value.toFixed(1)
  return `${shown} ${SIZE_UNITS[exponent]}`
}
