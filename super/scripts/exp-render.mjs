#!/usr/bin/env node
/* 风格实验工作台出帧：把某个风格的某一镜、某一时刻画成一张 PNG。
 *
 * 用法
 *   node scripts/exp-render.mjs --style riso --shot 2 --t 0.6 --w 720 --out docs/samples/style-07-riso.png
 *   node scripts/exp-render.mjs --style eink --list                 # 看这个风格有几镜、各多长
 *   node scripts/exp-render.mjs --style metal --shot M04 --t 1      # 镜号也可以写 id
 *
 * 为什么单独一个脚本，不并进 render-offline.mjs：
 *   那边跑的是"一条片子的分镜契约"，这边只是把某个介质的一帧拿出来看。
 *   一帧几十毫秒，改一版看一眼，不需要任何断言。
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
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const flag = n => argv.includes('--' + n);

const STYLE = arg('style', 'riso');
const SHOT = arg('shot', '1');
const T = Number(arg('t', 1));
const WIDTH = Number(arg('w', 1080));
const QUALITY = Number(arg('q', 0.9));
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

/* 浏览器替身：引擎用 document.createElement('canvas') 做静态层缓存，
 * 在 node 里换成 napi 的画布，两个环境跑同一份代码。 */
const sandbox = {
  console,
  document: {
    createElement: tag => (tag === 'canvas' ? createCanvas(1, 1) : {}),
    getElementById: () => null,
    querySelectorAll: () => [],
    body: { appendChild() {}, removeChild() {} }
  },
  addEventListener: () => {},
  requestAnimationFrame: () => 0,
  performance: { now: () => 0 }
};
sandbox.window = sandbox;
vm.createContext(sandbox);

function run(rel) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  vm.runInContext(src, sandbox, { filename: path.basename(rel) });
}

run('renderer/src/exp-engine.js');
run(`renderer/src/${STYLE}-renderer.js`);

const E = sandbox.Exp;
if (!E) {
  console.error(`renderer/src/${STYLE}-renderer.js 没有导出 window.Exp`);
  process.exit(1);
}

const list = () => E.SHOTS.map((s, i) => `  ${i + 1}. ${s.id} ${s.name}  ${s.dur}ms`).join('\n');
if (flag('list')) {
  console.log(`${E.id} · ${E.label} · ${E.SHOTS.length} 镜 · 共 ${E.TOTAL}ms\n${list()}`);
  process.exit(0);
}

const idx = /^\d+$/.test(SHOT)
  ? Number(SHOT) - 1
  : E.SHOTS.findIndex(s => s.id.toLowerCase() === String(SHOT).toLowerCase());
if (idx < 0 || idx >= E.SHOTS.length) {
  console.error(`没有这一镜：${SHOT}。可选：\n${list()}`);
  process.exit(1);
}

const shot = E.SHOTS[idx];
const canvas = createCanvas(1080, 1920);
const ctx = canvas.getContext('2d');
const t0 = Date.now();
shot.draw(ctx, Math.round(T * shot.dur), T);

let buf;
const enc = IS_JPG ? ['image/jpeg', QUALITY] : ['image/png'];
if (WIDTH !== 1080) {
  const small = createCanvas(WIDTH, Math.round(1920 * WIDTH / 1080));
  small.getContext('2d').drawImage(canvas, 0, 0, small.width, small.height);
  buf = small.toBuffer(...enc);
} else {
  buf = canvas.toBuffer(...enc);
}

fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
fs.writeFileSync(OUT, buf);
console.log(`${E.id}/${shot.id} @t=${T} → ${OUT}  ${(buf.length / 1024).toFixed(0)}KB  ${Date.now() - t0}ms`);
