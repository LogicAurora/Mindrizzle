import mermaid from 'mermaid';

let isInitialized = false;
let nextRenderId = 0;

const normalizeSvgSize = (svgText: string): string => {
  const document = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const svg = document.documentElement;
  const viewBox = svg
    .getAttribute('viewBox')
    ?.trim()
    .split(/[,\s]+/)
    .map(Number);
  const width = viewBox?.[2];
  const height = viewBox?.[3];
  if (
    svg.localName !== 'svg' ||
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  )
    throw new Error('Mermaid 图表缺少有效的 viewBox');

  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  return new XMLSerializer().serializeToString(svg);
};

export const renderMermaid = async (source: string): Promise<string> => {
  if (!isInitialized) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'default',
      // HTML 标签生成 foreignObject，会污染 PNG 导出使用的 canvas。
      htmlLabels: false,
    });
    isInitialized = true;
  }

  const { svg } = await mermaid.render(`mindrizzle-mermaid-${++nextRenderId}`, source);
  return normalizeSvgSize(svg);
};
