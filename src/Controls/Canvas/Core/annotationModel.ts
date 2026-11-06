import type { Point } from "../../../utils/canvasCoords.ts";
import type { Rect } from "../Registry/canvasComponents.ts";

export type ConnectorShape = "line" | "arrow" | "curve";
export type AnnotationTool = "pen" | ConnectorShape | "eraser";

export interface AnnotationStroke {
  id: string;
  kind: "stroke";
  points: Point[];
}

export interface AnnotationConnector {
  id: string;
  kind: "connector";
  shape: ConnectorShape;
  fromUuid: string;
  toUuid: string;
}

export type AnnotationItem = AnnotationStroke | AnnotationConnector;

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

const roundCoord = (value: number): number =>
  Math.round(value * COORD_SCALE) / COORD_SCALE;

const centerOf = (rect: Rect): Point => ({
  x: rect.x + rect.w / 2,
  y: rect.y + rect.h / 2,
});

const lerp = (from: Point, to: Point, t: number): Point => ({
  x: from.x + (to.x - from.x) * t,
  y: from.y + (to.y - from.y) * t,
});

// 箭头端点要贴在块边上，所以从块心朝目标点做射线，取与矩形边框的交点
export const anchorOnRect = (rect: Rect, towards: Point): Point => {
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

// 曲线走主轴中线出弯，贴边接线才不会在块角处急拐
const curveControls = (
  start: Point,
  end: Point,
): { first: Point; second: Point } => {
  const isHorizontal =
    Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
  if (isHorizontal) {
    const midX = (start.x + end.x) / 2;
    return {
      first: { x: midX, y: start.y },
      second: { x: midX, y: end.y },
    };
  }
  const midY = (start.y + end.y) / 2;
  return {
    first: { x: start.x, y: midY },
    second: { x: end.x, y: midY },
  };
};

const linearControls = (
  start: Point,
  end: Point,
): { first: Point; second: Point } => ({
  first: lerp(start, end, THIRD),
  second: lerp(start, end, THIRD * 2),
});

const cubicAt = (
  start: Point,
  first: Point,
  second: Point,
  end: Point,
  t: number,
): Point => {
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

const samplePath = (
  start: Point,
  first: Point,
  second: Point,
  end: Point,
): Point[] => {
  const samples: Point[] = [];
  for (let i = 0; i <= CURVE_SAMPLES; i++) {
    samples.push(cubicAt(start, first, second, end, i / CURVE_SAMPLES));
  }
  return samples;
};

const pathOf = (
  start: Point,
  first: Point,
  second: Point,
  end: Point,
): string =>
  `M ${roundCoord(start.x)} ${roundCoord(start.y)} C ${roundCoord(first.x)} ${roundCoord(first.y)} ${roundCoord(second.x)} ${roundCoord(second.y)} ${roundCoord(end.x)} ${roundCoord(end.y)}`;

const buildPath = (
  start: Point,
  end: Point,
  shape: ConnectorShape,
): ConnectorPath => {
  const { first, second } =
    shape === "curve" ? curveControls(start, end) : linearControls(start, end);
  return {
    d: pathOf(start, first, second, end),
    tip: end,
    approach: second,
    samples: samplePath(start, first, second, end),
  };
};

export const connectorPathOf = (
  from: Rect,
  to: Rect,
  shape: ConnectorShape,
): ConnectorPath => {
  const start = anchorOnRect(from, centerOf(to));
  const end = anchorOnRect(to, centerOf(from));
  return buildPath(start, end, shape);
};

// 拖拽预览时末端还没有落块，直接落到指针位置
export const previewConnectorPath = (
  from: Rect,
  point: Point,
  shape: ConnectorShape,
): ConnectorPath => buildPath(anchorOnRect(from, point), point, shape);

export const arrowHeadOf = (path: ConnectorPath): string => {
  const angle = Math.atan2(
    path.tip.y - path.approach.y,
    path.tip.x - path.approach.x,
  );
  const baseX = path.tip.x - Math.cos(angle) * ARROW_LENGTH;
  const baseY = path.tip.y - Math.sin(angle) * ARROW_LENGTH;
  const offsetX = Math.sin(angle) * ARROW_HALF_WIDTH;
  const offsetY = -Math.cos(angle) * ARROW_HALF_WIDTH;
  return [
    `${roundCoord(path.tip.x)},${roundCoord(path.tip.y)}`,
    `${roundCoord(baseX + offsetX)},${roundCoord(baseY + offsetY)}`,
    `${roundCoord(baseX - offsetX)},${roundCoord(baseY - offsetY)}`,
  ].join(" ");
};

const distanceToSegment = (point: Point, from: Point, to: Point): number => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq < EPSILON) return Math.hypot(point.x - from.x, point.y - from.y);
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSq,
    ),
  );
  return Math.hypot(point.x - (from.x + dx * t), point.y - (from.y + dy * t));
};

const distanceToPolyline = (point: Point, samples: Point[]): number => {
  if (samples.length === 1)
    return Math.hypot(point.x - samples[0].x, point.y - samples[0].y);
  let best = Infinity;
  for (let i = 1; i < samples.length; i++) {
    const distance = distanceToSegment(point, samples[i - 1], samples[i]);
    if (distance < best) best = distance;
  }
  return best;
};

const polylineOf = (
  item: AnnotationItem,
  blockMap: Map<string, Rect>,
): Point[] | null => {
  if (item.kind === "stroke") return item.points;
  const from = blockMap.get(item.fromUuid);
  const to = blockMap.get(item.toUuid);
  if (!from || !to) return null;
  return connectorPathOf(from, to, item.shape).samples;
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
    const samples = polylineOf(input.items[i], input.blockMap);
    if (!samples || samples.length === 0) continue;
    if (distanceToPolyline(input.point, samples) <= input.tolerance)
      return input.items[i].id;
  }
  return null;
};

const isConnectorShape = (value: unknown): value is ConnectorShape =>
  value === "line" || value === "arrow" || value === "curve";

const isFinitePoint = (value: unknown): value is Point => {
  const point = value as Point | null;
  return (
    !!point &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y)
  );
};

const normalizeStroke = (raw: any): AnnotationStroke | null => {
  if (!Array.isArray(raw?.points)) return null;
  const points: Point[] = (raw.points as unknown[]).filter(isFinitePoint);
  if (points.length < 2) return null;
  // 外部文件可能被手改，所以坐标必须重建成新对象
  return {
    id: String(raw.id),
    kind: "stroke",
    points: points.map((point) => ({ x: point.x, y: point.y })),
  };
};

const normalizeConnector = (
  raw: any,
  blockIds: Set<string>,
): AnnotationConnector | null => {
  if (typeof raw?.fromUuid !== "string" || typeof raw?.toUuid !== "string")
    return null;
  if (!isConnectorShape(raw?.shape)) return null;
  if (!blockIds.has(raw.fromUuid) || !blockIds.has(raw.toUuid)) return null;
  return {
    id: String(raw.id),
    kind: "connector",
    shape: raw.shape,
    fromUuid: raw.fromUuid,
    toUuid: raw.toUuid,
  };
};

// 连接线依赖块几何，块已不存在的连接直接丢弃，避免渲染出悬空箭头
export const normalizeAnnotations = (
  raw: unknown,
  blockIds: Set<string>,
): AnnotationItem[] => {
  if (!Array.isArray(raw)) return [];
  const items: AnnotationItem[] = [];
  raw.forEach((entry) => {
    if (entry?.kind === "stroke") {
      const stroke = normalizeStroke(entry);
      if (stroke && stroke.id) items.push(stroke);
      return;
    }
    if (entry?.kind === "connector") {
      const connector = normalizeConnector(entry, blockIds);
      if (connector && connector.id) items.push(connector);
    }
  });
  return items;
};
