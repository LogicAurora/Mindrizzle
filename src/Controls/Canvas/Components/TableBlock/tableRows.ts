export const MIN_TABLE_ROWS = 2;
export const MIN_TABLE_COLUMNS = 2;
export const MAX_TABLE_ROWS = 200;
export const MAX_TABLE_COLUMNS = 20;

// 渲染与增删列都按矩形处理，所以补齐到最大列数、最少两行两列
export const normalizeTableRows = (raw: unknown): string[][] => {
  const source = Array.isArray(raw) ? raw : [];
  const rows = source
    .filter((row) => Array.isArray(row))
    .slice(0, MAX_TABLE_ROWS)
    .map((row) => (row as unknown[]).map((cell) => String(cell ?? "")));
  while (rows.length < MIN_TABLE_ROWS) rows.push([]);
  const columnCount = Math.min(
    MAX_TABLE_COLUMNS,
    Math.max(MIN_TABLE_COLUMNS, ...rows.map((row) => row.length)),
  );
  return rows.map((row) => {
    const cells = row.slice(0, columnCount);
    while (cells.length < columnCount) cells.push("");
    return cells;
  });
};

export const columnCountOf = (rows: string[][]): number =>
  rows[0]?.length ?? MIN_TABLE_COLUMNS;

export const bodyRowCountOf = (rows: string[][], header: boolean): number =>
  Math.max(0, rows.length - (header ? 1 : 0));

// 选中框与合并都用矩阵坐标：row 含表头行，col 不含行号列
export interface TableSelection {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

// 合并坐标按 vxe-table 语义：row 从表体首行算起，col 不含行号列
export interface TableMerge {
  row: number;
  col: number;
  rowspan: number;
  colspan: number;
}

const isIndex = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0;

const mergeOfRaw = (
  raw: unknown,
  rowCount: number,
  columnCount: number,
): TableMerge | null => {
  if (!raw || typeof raw !== "object") return null;
  const { row, col, rowspan, colspan } = raw as Partial<TableMerge>;
  if (!isIndex(row) || !isIndex(col) || !isIndex(rowspan) || !isIndex(colspan))
    return null;
  if (
    rowspan === 0 ||
    colspan === 0 ||
    row + rowspan > rowCount ||
    col + colspan > columnCount
  )
    return null;
  return { row, col, rowspan, colspan };
};

const mergeKeysOf = (merge: TableMerge): string[] => {
  const keys: string[] = [];
  for (let row = merge.row; row < merge.row + merge.rowspan; row++) {
    for (let col = merge.col; col < merge.col + merge.colspan; col++)
      keys.push(`${row}-${col}`);
  }
  return keys;
};

// 重叠合并会让 vxe 渲染错位，所以按写入顺序只保留互不覆盖的那些
export const normalizeTableMerges = (
  raw: unknown,
  rowCount: number,
  columnCount: number,
): TableMerge[] => {
  const source = Array.isArray(raw) ? raw : [];
  const used = new Set<string>();
  const merges: TableMerge[] = [];
  for (const item of source) {
    const merge = mergeOfRaw(item, rowCount, columnCount);
    if (!merge) continue;
    const keys = mergeKeysOf(merge);
    if (keys.some((key) => used.has(key))) continue;
    keys.forEach((key) => used.add(key));
    merges.push(merge);
  }
  return merges;
};

// 表头行不参与合并：vxe 的表体合并索引从首行数据起算
export const mergeOfSelection = (
  selection: TableSelection,
  bodyRowCount: number,
  columnCount: number,
  header: boolean,
): TableMerge | null => {
  const row = selection.top - (header ? 1 : 0);
  const rowspan = selection.bottom - selection.top + 1;
  const colspan = selection.right - selection.left + 1;
  if (row < 0 || (rowspan < 2 && colspan < 2)) return null;
  return {
    row,
    col: Math.min(selection.left, columnCount - 1),
    rowspan: Math.min(rowspan, bodyRowCount - row),
    colspan: Math.min(colspan, columnCount - selection.left),
  };
};

export const mergeIntersectsSelection = (
  merge: TableMerge,
  selection: TableSelection,
  header: boolean,
): boolean => {
  const top = merge.row + (header ? 1 : 0);
  const left = merge.col;
  const bottom = top + merge.rowspan - 1;
  const right = left + merge.colspan - 1;
  return !(
    bottom < selection.top ||
    top > selection.bottom ||
    right < selection.left ||
    left > selection.right
  );
};

export const removeMergesInSelection = (
  merges: TableMerge[],
  selection: TableSelection,
  header: boolean,
): TableMerge[] =>
  merges.filter((merge) => !mergeIntersectsSelection(merge, selection, header));
