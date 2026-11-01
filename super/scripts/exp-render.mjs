#!/usr/bin/env node
/* 风格实验出帧：把 renderer/exp/styles.js 里的一帧画成 PNG。
 *
 * 用法
 *   node scripts/exp-render.mjs --style riso --out docs/samples/style-07-riso.jpg
 *   node scripts/exp-render.mjs --style eink --t 0.8 --w 540
 *
 * 为什么单独一个脚本，不并进 render-offline.mjs：
 *   那边是"整片十镜 + 分镜契约"，这边只验证"介质认不认得出来"。
 *   一帧几十毫秒，改一版看一眼，不需要跑任何断言。
 *
 * 依赖 @napi-rs/canvas（仓库不装依赖，按需指定路径）
 *   NAPI_CANVAS_PATH=D:/Tools/fontlab/node_modules/@napi-rs/canvas
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const FONT_DIR = process.env.FONT_DIR || 'D:/Tools/fonts';

const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf('--' + n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

const STYLE = arg('style', 'riso');
const T = Number(arg('t', 1));
const WIDTH = Number(arg('w', 1080));
const QUALITY = Number(arg('q', 90));
const OUT = arg('out', `exp-${STYLE}.png`);
const IS_JPG = /\.jpe?g$/i.test(OUT);

async function loadCanvas() {
  const spec = process.env.NAPI_CANVAS_PATH;
  if (!spec) return import('@napi-rs/canvas');
  let p = spec;
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
    const pkg = JSON.parse(fs.readFileSync(path.join(p, 'package.json'), 'utf8'));
    p = path.join(p, typeof pkg.main === 'string' ? pkg.main : 'index.js');
  }
  return import(pathToFileURL(p).href);
}

let canvasMod;
try {
  canvasMod = await loadCanvas();
} catch (e) {
  console.error(`找不到 @napi-rs/canvas（${e.message}）`);
  console.error('设 NAPI_CANVAS_PATH 指向已有安装，例如 D:/Tools/fontlab/node_modules/@napi-rs/canvas');
  process.exit(1);
}
const { createCanvas, GlobalFonts } = canvasMod;

for (const f of ['SourceHanSerifCN-Regular.otf', 'SourceHanSerifCN-Bold.otf']) {
  const p = path.join(FONT_DIR, f);
  if (fs.existsSync(p)) GlobalFonts.registerFromPath(p);
}

const SRC = fs.readFileSync(path.join(ROOT, 'renderer/exp/styles.js'), 'utf8');
const canvas = createCanvas(1080, 1920);
const sandbox = { window: {}, console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(SRC, sandbox, { filename: 'styles.js' });

const Exp = sandbox.Exp;
if (!Exp) {
  console.error('styles.js 没有导出 window.Exp');
  process.exit(1);
}
const fn = Exp.STYLES[STYLE];
if (!fn) {
  console.error(`没有 ${STYLE} 这个风格。可选：${Object.keys(Exp.STYLES).join(' / ')}`);
  process.exit(1);
}

const ctx = canvas.getContext('2d');
const t0 = Date.now();
fn(ctx, T);

let buf;
const enc = IS_JPG ? ['image/jpeg', QUALITY / 100] : ['image/png'];
if (WIDTH !== 1080) {
  const small = createCanvas(WIDTH, Math.round(1920 * WIDTH / 1080));
  small.getContext('2d').drawImage(canvas, 0, 0, small.width, small.height);
  buf = small.toBuffer(...enc);
} else {
  buf = canvas.toBuffer(...enc);
}

fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
fs.writeFileSync(OUT, buf);
console.log(`${STYLE} @t=${T} → ${OUT}  ${(buf.length / 1024).toFixed(0)}KB  ${Date.now() - t0}ms`);
