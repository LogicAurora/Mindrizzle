// 校验仓内所有 Markdown 的 mermaid 代码块能否被官方解析器解析，CI 与本地共用此入口
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SKIP_DIR = /(^|\/)(node_modules|dist|target|\.git)\//;
const FENCE_START = /^```mermaid\s*$/;
const FENCE_END = /^```\s*$/;

// mermaid 解析依赖 DOM，Node/Bun 环境需先注入 jsdom
async function loadMermaid() {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  const mermaid = (await import('mermaid')).default;
  mermaid.initialize({ startOnLoad: false, suppressErrorRendering: true });
  return mermaid;
}

function mermaidBlocksOf(text) {
  const lines = text.split('\n');
  const blocks = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!FENCE_START.test(lines[i])) continue;
    const startLine = i + 2;
    const body = [];
    i += 1;
    while (i < lines.length && !FENCE_END.test(lines[i])) {
      body.push(lines[i]);
      i += 1;
    }
    blocks.push({ startLine, code: body.join('\n') });
  }
  return blocks;
}

function markdownFiles() {
  return Array.from(new Bun.Glob('**/*.md').scanSync({ cwd: ROOT, dot: true })).filter(
    (file) => !SKIP_DIR.test(file),
  );
}

const mermaid = await loadMermaid();
const failures = [];
let checked = 0;

for (const file of markdownFiles()) {
  for (const block of mermaidBlocksOf(readFileSync(join(ROOT, file), 'utf8'))) {
    checked += 1;
    try {
      // parse 只做语法与语义解析，不渲染
      await mermaid.parse(block.code);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${file}:${block.startLine}\n${message}`);
    }
  }
}

if (failures.length) {
  console.error(`mermaid 校验失败 ${failures.length}/${checked} 块\n\n${failures.join('\n\n')}`);
  process.exit(1);
}

console.log(`mermaid 校验通过，共 ${checked} 块`);
