// SPDX-License-Identifier: MIT
export interface ExportBounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

/** 画布静态快照：html 为清掉交互层的 .canvas 克隆，bounds 为块群包围盒 */
export interface ExportCanvasSnapshot {
  html: string;
  bounds: ExportBounds;
  themeVars: string;
}

export type ExportFormat = 'html' | 'pdf';
