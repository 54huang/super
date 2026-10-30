#!/usr/bin/env node
// 在 Node 里跑浏览器版渲染器，直接产出 PNG 序列（可选接着调 ffmpeg 合成 mp4）。
// 为什么需要它：浏览器里「导出全片 900 帧」要连续弹 900 次下载，没法自动化；
// 这里用 @napi-rs/canvas 顶替浏览器 Canvas，同一份渲染器原样跑。
//
// 用法
//   node scripts/render-offline.mjs --frame 18000 --out /tmp/a.png
//   node scripts/render-offline.mjs --all --out frames/
//   node scripts/render-offline.mjs --all --out frames/ --mp4 out.mp4
//   node scripts/render-offline.mjs --style v4 --frame 6000 --out /tmp/b.png
//
// 三种风格共用这一个脚本，差别只在两处：
//   1. 渲染器文件与挂在 window 上的全局名不同；
//   2. 时间语义不同 —— v2 的 renderAt(ms) 吃整片时间，
//      v3/v4 的 renderAt(shotIdx, ms) 吃镜内时间（每镜独立计时）。
// 这里统一成"整片毫秒"再按镜长换算，外面调用只认一个时间轴。
//
//   --style v2|v3|v4   默认 v2（保持旧命令行为不变）
//
// 依赖（不写进 package.json，按需装）
//   npm i -D @napi-rs/canvas
//   或者已有安装：NAPI_CANVAS_PATH=D:/Tools/fontlab/node_modules/@napi-rs/canvas
//
// 字体
//   默认读 D:/Tools/fonts 下的思源宋体；没有就用系统字体（SimSun / Consolas）。
//   换目录：FONT_DIR=/path/to/fonts
//   注意：Skia 只在字体栈内查找，栈里没有中文字体就画成豆腐块，
//   所以渲染器的 F_MONO 必须显式写出中文字体名。

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const FONT_DIR = process.env.FONT_DIR || 'D:/Tools/fonts';
const FPS = 30;

// 每种风格的接入点。mode 说明时间轴怎么喂：
//   abs     —— 渲染器自己管整片时间
//   perShot —— 渲染器只认镜内时间，外面得先算这一毫秒落在第几镜
const STYLES = {
  v2: { file: 'shot-renderer.js', global: 'Renderer', mode: 'abs', total: 30000 },
  v3: { file: 'scope-renderer.js', global: 'Scope', mode: 'perShot' },
  v4: { file: 'board-renderer.js', global: 'Board', mode: 'perShot' }
};

// ---------- 参数 ----------
const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const ALL = argv.includes('--all');
const FRAME_MS = Number(arg('--frame', 0));
const OUT = arg('--out', ALL ? 'frames' : 'frame.png');
const MP4 = arg('--mp4', '');
const STYLE = arg('--style', 'v2');

if (!ALL && !argv.includes('--frame')) {
  console.error('用法: node scripts/render-offline.mjs --frame <毫秒> | --all  [--style v2|v3|v4] [--out 路径] [--mp4 输出.mp4]');
  process.exit(1);
}
if (!STYLES[STYLE]) {
  console.error(`没有 ${STYLE} 这种风格。可选：${Object.keys(STYLES).join(' / ')}`);
  process.exit(1);
}
const CFG = STYLES[STYLE];

// ---------- canvas 后端 ----------
// 默认从 node_modules 解析；也可用 NAPI_CANVAS_PATH 指向别处的安装（目录或入口文件）。
async function loadCanvas() {
  const spec = process.env.NAPI_CANVAS_PATH;
  if (!spec) return import('@napi-rs/canvas');
  let p = spec;
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
    const pkgPath = path.join(p, 'package.json');
    if (!fs.existsSync(pkgPath)) throw new Error(`${p} 下没有 package.json`);
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    p = path.join(p, typeof pkg.main === 'string' ? pkg.main : 'index.js');
  }
  return import(pathToFileURL(p).href);
}

let canvasMod;
try {
  canvasMod = await loadCanvas();
} catch (e) {
  console.error(`找不到 @napi-rs/canvas（${e.message}）。装一下：npm i -D @napi-rs/canvas`);
  console.error(`或用 NAPI_CANVAS_PATH 指向已有安装，例如 NAPI_CANVAS_PATH=D:/Tools/fontlab/node_modules/@napi-rs/canvas`);
  process.exit(1);
}
const { createCanvas, GlobalFonts } = canvasMod;

// ---------- 字体 ----------
for (const f of ['SourceHanSerifCN-Regular.otf', 'SourceHanSerifCN-Bold.otf']) {
  const p = path.join(FONT_DIR, f);
  if (fs.existsSync(p)) GlobalFonts.registerFromPath(p);
}
if (!GlobalFonts.has('SimSun') && !GlobalFonts.has('Source Han Serif CN')) {
  console.error('警告：既没有系统 SimSun 也没有思源宋体，中文会渲染成豆腐块');
}

// ---------- 加载渲染器 ----------
const SRC = fs.readFileSync(path.join(ROOT, 'renderer/src', CFG.file), 'utf8');
const canvas = createCanvas(1080, 1920);
const sandbox = {
  window: {},
  document: {
    createElement(tag) {
      if (tag === 'canvas') return createCanvas(1, 1);
      return { click() { }, style: {}, set download(v) { }, set href(v) { } };
    },
  },
  requestAnimationFrame: () => 0,      // 不跑动画循环，靠 renderAt 定点渲染
  cancelAnimationFrame: () => { },
  setTimeout, clearTimeout, setInterval, clearInterval,
  console,
  performance: { now: () => Date.now() },
  URL: { createObjectURL: () => 'blob:mock', revokeObjectURL: () => { } },
  Blob: class { constructor() { this.size = 0; } },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(SRC, sandbox);

const R = sandbox[CFG.global];
if (!R) { console.error(`${CFG.global} 没有挂到 window 上（${CFG.file}）`); process.exit(1); }
R.init(canvas);
if (typeof R.setMode === 'function') R.setMode('full');

// ---------- 时间轴适配 ----------
// 整片毫秒 → 渲染器认的参数。perShot 风格要自己累加镜长找出落点。
const SHOT_DURS = CFG.mode === 'perShot' ? Array.from(R.SHOTS, s => s.dur) : null;
const TOTAL_MS = CFG.mode === 'perShot'
  ? SHOT_DURS.reduce((a, b) => a + b, 0)
  : CFG.total;

function renderAbs(ms) {
  if (CFG.mode === 'abs') { R.renderAt(ms); return; }
  let acc = 0;
  for (let i = 0; i < SHOT_DURS.length; i++) {
    const d = SHOT_DURS[i];
    if (ms < acc + d || i === SHOT_DURS.length - 1) {
      R.renderAt(i, Math.max(0, Math.min(d, ms - acc)));
      return;
    }
    acc += d;
  }
}

const fontNote = ['SimSun', 'Source Han Serif CN', 'Consolas', 'KaiTi']
  .map(f => `${f}=${GlobalFonts.has(f) ? '✓' : '✗'}`).join('  ');
console.log(`风格: ${STYLE}（${CFG.file}）  总长 ${(TOTAL_MS / 1000).toFixed(1)}s`);
console.log(`字体: ${fontNote}`);

// ---------- 渲染 ----------
if (!ALL) {
  const t0 = Date.now();
  renderAbs(FRAME_MS);
  const buf = canvas.toBuffer('image/png');
  fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
  fs.writeFileSync(OUT, buf);
  console.log(`${FRAME_MS}ms → ${OUT}  ${(buf.length / 1024).toFixed(0)}KB  ${Date.now() - t0}ms`);
  process.exit(0);
}

fs.mkdirSync(OUT, { recursive: true });
const n = Math.round((TOTAL_MS / 1000) * FPS);
const t0 = Date.now();
let bytes = 0;
for (let i = 0; i < n; i++) {
  renderAbs((i * 1000) / FPS);        // 用乘法不累加，避免浮点漂移
  const buf = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(OUT, `${STYLE}_${String(i + 1).padStart(4, '0')}.png`), buf);
  bytes += buf.length;
  if (i % 90 === 0 || i === n - 1) {
    const el = (Date.now() - t0) / 1000;
    process.stdout.write(`\r  ${i + 1}/${n}  ${el.toFixed(0)}s  ${(bytes / 1048576).toFixed(0)}MB   `);
  }
}
console.log(`\n完成 ${n} 帧，${((Date.now() - t0) / 1000).toFixed(0)} 秒，${(bytes / 1048576).toFixed(0)}MB → ${OUT}/`);

if (MP4) {
  // ffmpeg 不一定在 PATH 里：Windows 上它常被单独装在 D:\Tools\ffmpeg\bin，
  // 而不同 shell 会话的 PATH 并不共享。所以先看 FFMPEG 环境变量，再退回命令名。
  const ff = process.env.FFMPEG || 'ffmpeg';
  const pattern = path.join(OUT, `${STYLE}_%04d.png`);
  const r = spawnSync(ff, [
    '-hide_banner', '-loglevel', 'error',
    '-framerate', String(FPS), '-i', pattern,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-y', MP4,
  ], { stdio: 'inherit' });
  if (r.error || r.status !== 0) {
    console.error(`ffmpeg 调用失败（${r.error ? r.error.code : 'exit ' + r.status}）。`);
    console.error('没装的话把 ffmpeg 放进 PATH；装在别处的用 FFMPEG 指定：');
    console.error(`  FFMPEG=D:/Tools/ffmpeg/bin/ffmpeg.exe node scripts/render-offline.mjs ...`);
    console.error('或者手动跑这一条：');
    console.error(`  ${ff} -framerate ${FPS} -i "${pattern}" -c:v libx264 -pix_fmt yuv420p -crf 16 ${MP4}`);
    process.exit(1);
  }
  console.log(`合成 ${MP4}  ${(fs.statSync(MP4).size / 1048576).toFixed(1)}MB`);
}
