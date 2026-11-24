import type { Point } from '../../../utils/canvasCoords.ts';
import type { Rect } from '../Registry/canvasComponents.ts';

export type ConnectorShape = 'line' | 'arrow' | 'curve';
export type AnnotationTool = 'pen' | ConnectorShape | 'eraser' | 'select' | 'text';
export type AnchorSide = 'auto' | 'top' | 'right' | 'bottom' | 'left';
export type CurveBend = 'auto' | 'horizontal' | 'vertical';

export const DEFAULT_ANNOTATION_COLOR = '#ef4444';
export const DEFAULT_TEXT_WIDTH = 240;
export const DEFAULT_TEXT_FONT_SIZE = 16;
export const TEXT_LINE_HEIGHT = 1.4;
export const MIN_TEXT_FONT_SIZE = 10;
export const MAX_TEXT_FONT_SIZE = 48;
const MAX_TEXT_LENGTH = 2000;

export interface AnnotationStroke {
  id: string;
  kind: 'stroke';
  points: Point[];
  color?: string;
}

export interface AnnotationConnector {
  id: string;
  kind: 'connector';
  shape: ConnectorShape;
  fromUuid: string;
  toUuid: string;
  fromAnchor?: AnchorSide;
  toAnchor?: AnchorSide;
  bend?: CurveBend;
  // 0..1，映射到控制点距十字中线的比例；1 即旧版出弯位置
  curvature?: number;
  color?: string;
}

export interface AnnotationText {
  id: string;
  kind: 'text';
  x: number;
  y: number;
  text: string;
  width?: number;
  fontSize?: number;
  color?: string;
}

export type AnnotationItem = AnnotationStroke | AnnotationConnector | AnnotationText;

export interface ConnectorStyle {
  shape: ConnectorShape;
  fromAnchor?: AnchorSide;
  toAnchor?: AnchorSide;
  bend?: CurveBend;
  curvature?: number;
}

export type AnnotationPatch = Partial<ConnectorStyle> & {
  color?: string;
  text?: string;
  fontSize?: number;
};

export interface AnnotationBlock {
  uuid: string;
  rect: Rect;
}

export interface ConnectorPath {
  d: string;
  tip: Point;
  approach: Point;
  samples: Point[];
}

const CURVE_SAMPLES = 24;
const ARROW_LENGTH = 16;
const ARROW_HALF_WIDTH = 7;
const COORD_SCALE = 100;
const THIRD = 1 / 3;
const EPSILON = 1e-6;
export const DEFAULT_CURVATURE = 1;
// curvature=1 时控制点落在中线，再大就会越过中线把曲线拉成回环
const MAX_CONTROL_RATIO = 0.5;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const roundCoord = (value: number): number => Math.round(value * COORD_SCALE) / COORD_SCALE;

const centerOf = (rect: Rect): Point => ({
  x: rect.x + rect.w / 2,
  y: rect.y + rect.h / 2,
});

const lerp = (from: Point, to: Point, t: number): Point => ({
  x: from.x + (to.x - from.x) * t,
  y: from.y + (to.y - from.y) * t,
});

const edgeMidpointOf = (rect: Rect, side: Exclude<AnchorSide, 'auto'>): Point => {
  const center = centerOf(rect);
  if (side === 'top') return { x: center.x, y: rect.y };
  if (side === 'bottom') return { x: center.x, y: rect.y + rect.h };
  if (side === 'left') return { x: rect.x, y: center.y };
  return { x: rect.x + rect.w, y: center.y };
};

// 箭头端点要贴在块边上，所以从块心朝目标点做射线，取与矩形边框的交点；指定锚边时取该边中点
export const anchorOnRect = (rect: Rect, towards: Point, side: AnchorSide = 'auto'): Point => {
  if (side !== 'auto') return edgeMidpointOf(rect, side);
  const center = centerOf(rect);
  const dx = towards.x - center.x;
  const dy = towards.y - center.y;
  if (Math.abs(dx) < EPSILON && Math.abs(dy) < EPSILON) return center;
  const halfW = Math.max(rect.w, 1) / 2;
  const halfH = Math.max(rect.h, 1) / 2;
  const scaleX = Math.abs(dx) < EPSILON ? Infinity : halfW / Math.abs(dx);
  const scaleY = Math.abs(dy) < EPSILON ? Infinity : halfH / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);
  return { x: center.x + dx * scale, y: center.y + dy * scale };
};

// 曲线沿选定轴出弯，贴边接线才不会在块角处急拐；curvature 越小控制点越靠近端点，曲线越平直
const curveControls = (
  start: Point,
  end: Point,
  bend: CurveBend,
  curvature: number,
): { first: Point; second: Point } => {
  const axis =
    bend === 'auto'
      ? Math.abs(end.x - start.x) >= Math.abs(end.y - start.y)
        ? 'horizontal'
        : 'vertical'
      : bend;
  const ratio = clamp01(curvature) * MAX_CONTROL_RATIO;
  if (axis === 'horizontal') {
    return {
      first: { x: start.x + (end.x - start.x) * ratio, y: start.y },
      second: { x: end.x - (end.x - start.x) * ratio, y: end.y },
    };
  }
  return {
    first: { x: start.x, y: start.y + (end.y - start.y) * ratio },
    second: { x: end.x, y: end.y - (end.y - start.y) * ratio },
  };
};

const linearControls = (start: Point, end: Point): { first: Point; second: Point } => ({
  first: lerp(start, end, THIRD),
  second: lerp(start, end, THIRD * 2),
});

const cubicAt = (start: Point, first: Point, second: Point, end: Point, t: number): Point => {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * start.x + b * first.x + c * second.x + d * end.x,
    y: a * start.y + b * first.y + c * second.y + d * end.y,
  };
};

const samplePath = (start: Point, first: Point, second: Point, end: Point): Point[] => {
  const samples: Point[] = [];
  for (let i = 0; i <= CURVE_SAMPLES; i++) {
    samples.push(cubicAt(start, first, second, end, i / CURVE_SAMPLES));
  }
  return samples;
};

const pathOf = (start: Point, first: Point, second: Point, end: Point): string =>
  `M ${roundCoord(start.x)} ${roundCoord(start.y)} C ${roundCoord(first.x)} ${roundCoord(first.y)} ${roundCoord(second.x)} ${roundCoord(second.y)} ${roundCoord(end.x)} ${roundCoord(end.y)}`;

const buildPath = (start: Point, end: Point, style: ConnectorStyle): ConnectorPath => {
  const { first, second } =
    style.shape === 'curve'
      ? curveControls(start, end, style.bend ?? 'auto', style.curvature ?? DEFAULT_CURVATURE)
      : linearControls(start, end);
  return {
    d: pathOf(start, first, second, end),
    tip: end,
    approach: second,
    samples: samplePath(start, first, second, end),
  };
};

export const connectorPathOf = (from: Rect, to: Rect, style: ConnectorStyle): ConnectorPath => {
  const start = anchorOnRect(from, centerOf(to), style.fromAnchor ?? 'auto');
  const end = anchorOnRect(to, centerOf(from), style.toAnchor ?? 'auto');
  return buildPath(start, end, style);
};

// 拖拽预览时末端还没有落块，直接落到指针位置
export const previewConnectorPath = (
  from: Rect,
  point: Point,
  style: ConnectorStyle,
): ConnectorPath => buildPath(anchorOnRect(from, point, style.fromAnchor ?? 'auto'), point, style);

// 曲率 0 时控制点与端点重合，方向向量退化，所以回退到最后一小段采样
const directionAtTip = (path: ConnectorPath): Point => {
  const dx = path.tip.x - path.approach.x;
  const dy = path.tip.y - path.approach.y;
  if (Math.hypot(dx, dy) > EPSILON) return { x: dx, y: dy };
  const previous = path.samples[path.samples.length - 2];
  if (!previous) return { x: 1, y: 0 };
  return { x: path.tip.x - previous.x, y: path.tip.y - previous.y };
};

export const arrowHeadOf = (path: ConnectorPath): string => {
  const direction = directionAtTip(path);
  const angle = Math.atan2(direction.y, direction.x);
  const baseX = path.tip.x - Math.cos(angle) * ARROW_LENGTH;
  const baseY = path.tip.y - Math.sin(angle) * ARROW_LENGTH;
  const offsetX = Math.sin(angle) * ARROW_HALF_WIDTH;
  const offsetY = -Math.cos(angle) * ARROW_HALF_WIDTH;
  return [
    `${roundCoord(path.tip.x)},${roundCoord(path.tip.y)}`,
    `${roundCoord(baseX + offsetX)},${roundCoord(baseY + offsetY)}`,
    `${roundCoord(baseX - offsetX)},${roundCoord(baseY - offsetY)}`,
  ].join(' ');
};

const distanceToSegment = (point: Point, from: Point, to: Point): number => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq < EPSILON) return Math.hypot(point.x - from.x, point.y - from.y);
  const t = Math.max(
    0,
    Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSq),
  );
  return Math.hypot(point.x - (from.x + dx * t), point.y - (from.y + dy * t));
};

const distanceToPolyline = (point: Point, samples: Point[]): number => {
  if (samples.length === 1) return Math.hypot(point.x - samples[0].x, point.y - samples[0].y);
  let best = Infinity;
  for (let i = 1; i < samples.length; i++) {
    const distance = distanceToSegment(point, samples[i - 1], samples[i]);
    if (distance < best) best = distance;
  }
  return best;
};

const polylineOf = (item: AnnotationItem, blockMap: Map<string, Rect>): Point[] | null => {
  if (item.kind === 'stroke') return item.points;
  if (item.kind === 'text') return null;
  const from = blockMap.get(item.fromUuid);
  const to = blockMap.get(item.toUuid);
  if (!from || !to) return null;
  return connectorPathOf(from, to, item).samples;
};

// 文本框按内容估算行数，命中判定不必与 DOM 像素级一致
const textBoxOf = (item: AnnotationText): Rect => {
  const fontSize = item.fontSize ?? DEFAULT_TEXT_FONT_SIZE;
  const width = item.width ?? DEFAULT_TEXT_WIDTH;
  const charsPerLine = Math.max(1, Math.floor(width / (fontSize * 0.75)));
  const lines = item.text
    .split('\n')
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
  return { x: item.x, y: item.y, w: width, h: lines * fontSize * TEXT_LINE_HEIGHT };
};

const isPointInTextBox = (point: Point, item: AnnotationText): boolean => {
  const box = textBoxOf(item);
  return (
    point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h
  );
};

interface AnnotationHit {
  items: AnnotationItem[];
  point: Point;
  tolerance: number;
  blockMap: Map<string, Rect>;
}

// 后画的批注压在先画的上层，所以从尾部往前找第一条命中的
export const hitAnnotationId = (input: AnnotationHit): string | null => {
  for (let i = input.items.length - 1; i >= 0; i--) {
    const item = input.items[i];
    if (item.kind === 'text') {
      if (isPointInTextBox(input.point, item)) return item.id;
      continue;
    }
    const samples = polylineOf(item, input.blockMap);
    if (!samples || samples.length === 0) continue;
    if (distanceToPolyline(input.point, samples) <= input.tolerance) return item.id;
  }
  return null;
};

const isConnectorShape = (value: unknown): value is ConnectorShape =>
  value === 'line' || value === 'arrow' || value === 'curve';

const isFinitePoint = (value: unknown): value is Point => {
  const point = value as Point | null;
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y);
};

const ANCHOR_SIDES: readonly AnchorSide[] = ['auto', 'top', 'right', 'bottom', 'left'];
const CURVE_BENDS: readonly CurveBend[] = ['auto', 'horizontal', 'vertical'];

const isAnchorSide = (value: unknown): value is AnchorSide =>
  typeof value === 'string' && (ANCHOR_SIDES as readonly string[]).includes(value);

const isCurveBend = (value: unknown): value is CurveBend =>
  typeof value === 'string' && (CURVE_BENDS as readonly string[]).includes(value);

const normalizeColor = (raw: unknown): string | undefined =>
  typeof raw === 'string' && /^#[0-9a-f]{3,8}$/i.test(raw) ? raw : undefined;

const normalizeCurvature = (raw: unknown): number | undefined =>
  typeof raw === 'number' && Number.isFinite(raw) ? clamp01(raw) : undefined;

const normalizeStroke = (raw: any): AnnotationStroke | null => {
  if (!Array.isArray(raw?.points)) return null;
  const points: Point[] = (raw.points as unknown[]).filter(isFinitePoint);
  if (points.length < 2) return null;
  // 外部文件可能被手改，所以坐标必须重建成新对象
  return {
    id: String(raw.id),
    kind: 'stroke',
    points: points.map((point) => ({ x: point.x, y: point.y })),
    color: normalizeColor(raw.color),
  };
};

const normalizeText = (raw: any): AnnotationText | null => {
  if (typeof raw?.text !== 'string') return null;
  if (!Number.isFinite(raw?.x) || !Number.isFinite(raw?.y)) return null;
  const fontSize =
    typeof raw.fontSize === 'number' && Number.isFinite(raw.fontSize)
      ? Math.min(MAX_TEXT_FONT_SIZE, Math.max(MIN_TEXT_FONT_SIZE, raw.fontSize))
      : undefined;
  const width =
    typeof raw.width === 'number' && Number.isFinite(raw.width) && raw.width > 0
      ? raw.width
      : undefined;
  return {
    id: String(raw.id),
    kind: 'text',
    x: raw.x,
    y: raw.y,
    text: raw.text.slice(0, MAX_TEXT_LENGTH),
    width,
    fontSize,
    color: normalizeColor(raw.color),
  };
};

const normalizeConnector = (raw: any, blockIds: Set<string>): AnnotationConnector | null => {
  if (typeof raw?.fromUuid !== 'string' || typeof raw?.toUuid !== 'string') return null;
  if (!isConnectorShape(raw?.shape)) return null;
  if (!blockIds.has(raw.fromUuid) || !blockIds.has(raw.toUuid)) return null;
  return {
    id: String(raw.id),
    kind: 'connector',
    shape: raw.shape,
    fromUuid: raw.fromUuid,
    toUuid: raw.toUuid,
    fromAnchor: isAnchorSide(raw.fromAnchor) ? raw.fromAnchor : undefined,
    toAnchor: isAnchorSide(raw.toAnchor) ? raw.toAnchor : undefined,
    bend: isCurveBend(raw.bend) ? raw.bend : undefined,
    curvature: normalizeCurvature(raw.curvature),
    color: normalizeColor(raw.color),
  };
};

// 连接线依赖块几何，块已不存在的连接直接丢弃，避免渲染出悬空箭头
export const normalizeAnnotations = (raw: unknown, blockIds: Set<string>): AnnotationItem[] => {
  if (!Array.isArray(raw)) return [];
  const items: AnnotationItem[] = [];
  raw.forEach((entry) => {
    if (entry?.kind === 'stroke') {
      const stroke = normalizeStroke(entry);
      if (stroke && stroke.id) items.push(stroke);
      return;
    }
    if (entry?.kind === 'connector') {
      const connector = normalizeConnector(entry, blockIds);
      if (connector && connector.id) items.push(connector);
      return;
    }
    if (entry?.kind === 'text') {
      const text = normalizeText(entry);
      if (text && text.id) items.push(text);
    }
  });
  return items;
};
