const readSvgSize = (svg: SVGSVGElement) => {
  const { width, height } = svg.viewBox.baseVal;
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0)
    return { width, height };
  throw new Error('图表缺少有效的 viewBox');
};

const loadSvgImage = (svgText: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    const svgUrl = URL.createObjectURL(
      new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }),
    );
    image.onload = () => {
      URL.revokeObjectURL(svgUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      reject(new Error('无法读取图表 SVG'));
    };
    image.src = svgUrl;
  });

const canvasToPng = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('浏览器无法生成 PNG'));
    }, 'image/png');
  });

export const exportSvgAsPng = async (svg: SVGSVGElement, fileName: string) => {
  const size = readSvgSize(svg);
  const svgClone = svg.cloneNode(true) as SVGSVGElement;
  svgClone.setAttribute('width', String(size.width));
  svgClone.setAttribute('height', String(size.height));

  const image = await loadSvgImage(new XMLSerializer().serializeToString(svgClone));
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法创建图片画布');

  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const png = await canvasToPng(canvas);
  const pngUrl = URL.createObjectURL(png);
  const link = document.createElement('a');
  link.href = pngUrl;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(pngUrl), 0);
};
