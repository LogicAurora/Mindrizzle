export const MIN_TABLE_ROWS = 2
export const MIN_TABLE_COLUMNS = 2
export const MAX_TABLE_ROWS = 200
export const MAX_TABLE_COLUMNS = 20

// 渲染与增删列都按矩形处理，所以补齐到最大列数、最少两行两列
export const normalizeTableRows = (raw: unknown): string[][] => {
  const source = Array.isArray(raw) ? raw : []
  const rows = source
    .filter((row) => Array.isArray(row))
    .slice(0, MAX_TABLE_ROWS)
    .map((row) => (row as unknown[]).map((cell) => String(cell ?? '')))
  while (rows.length < MIN_TABLE_ROWS) rows.push([])
  const columnCount = Math.min(MAX_TABLE_COLUMNS, Math.max(MIN_TABLE_COLUMNS, ...rows.map((row) => row.length)))
  return rows.map((row) => {
    const cells = row.slice(0, columnCount)
    while (cells.length < columnCount) cells.push('')
    return cells
  })
}

export const columnCountOf = (rows: string[][]): number => rows[0]?.length ?? MIN_TABLE_COLUMNS
