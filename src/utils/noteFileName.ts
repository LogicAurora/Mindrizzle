// SPDX-License-Identifier: MIT

// 与 Rust resolve_mdrf_file_name 的规则保持一致，两端校验漂移会让文件名只在其中一端被拒
export const NOTE_FILE_NAME_MAX_LEN = 50;

const FORBIDDEN_CHARS = /[\\/:*?"<>|]/;
// 首字符不得空格，尾字符不得空格或点（Windows 会静默截断）
const EDGE_CHARS = /^\s|[\s.]$/;
const RESERVED_NAMES = [
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9",
];

export function isValidNoteFileName(name: string): boolean {
  if (!name || name.length > NOTE_FILE_NAME_MAX_LEN) return false;
  if (FORBIDDEN_CHARS.test(name)) return false;
  if (EDGE_CHARS.test(name)) return false;
  return !RESERVED_NAMES.includes(name.toUpperCase());
}

export const NOTE_FILE_NAME_RULE_HINT = `文件名需 ≤ ${NOTE_FILE_NAME_MAX_LEN} 字符，不含 \\ / : * ? " < > |，不以空格开头或空格/点结尾，且不能是 CON、NUL 等保留设备名`;
