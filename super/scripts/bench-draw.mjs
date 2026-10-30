// 绘制开销测量：统计每个镜头「每帧到底发出多少次绘制调用」以及贵在哪里。
// 注意：Node 里的 canvas 桩不做光栅化，所以这里量的是**调用次数与结构**，不是毫秒。
// 毫秒必须在真实浏览器里测（DevTools Performance 或页面里的 ?perf 面板）。
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dirname, '..');
const W = 1080, H = 1920, FULL = W * H;

function instrument() {
  const c = {
    ops: 0, grad: 0, fullFill: 0, shadowed: 0, saveRestore: 0,
    arcs: 0, texts: 0, fills: 0, strokes: 0, dash: 0, bigShadows: 0
  };
  const store = {};
  const noop = () => { };
  const ctx = new Proxy(store, {
    get(t, p) {
      if (p === 'createLinearGradient') return () => { c.grad++; c.ops++; return { addColorStop: noop }; };
      if (p === 'createRadialGradient') return () => { c.grad++; c.ops++; return { addColorStop: noop }; };
      if (p === 'createPattern') return () => { c.ops++; return {}; };
      if (p === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
      if (p === 'measureText') return (s) => ({ width: String(s).length * 12 });
      if (p === 'fillRect') return (...a) => { c.ops++; if (a[2] * a[3] >= FULL * 0.9) c.fullFill++; };
      if (p === 'fill') return () => { c.ops++; c.fills++; };
      if (p === 'stroke') return () => { c.ops++; c.strokes++; };
      if (p === 'fillText' || p === 'strokeText') return () => { c.ops++; c.texts++; };
      if (p === 'arc' || p === 'ellipse') return () => { c.ops++; c.arcs++; };
      if (p === 'save' || p === 'restore') return () => { c.ops++; c.saveRestore++; };
      if (p === 'setLineDash') return () => { c.ops++; c.dash++; };
      if (p in t) return t[p];
      t[p] = () => { c.ops++; };
      return t[p];
    },
    set(t, p, v) {
      if (p === 'shadowBlur' && v > 0) { c.bigShadows++; if (v >= 15) c.shadowed++; }
      t[p] = v;
      return true;
    }
  });
  return { ctx, c };
}

const { ctx, c } = instrument();
const canvas = { width: 0, height: 0, getContext: () => ctx, toDataURL: () => 'data:' };
const sandbox = {
  window: {},
  document: { createElement: (tag) => tag === 'canvas' ? { width: 0, height: 0, getContext: () => instrument().ctx } : { click() { }, set download(v) { }, set href(v) { } } },
  requestAnimationFrame: () => 0,
  setTimeout, console
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'renderer/src/shot-renderer.js'), 'utf8'), sandbox);
const R = sandbox.Renderer;
R.init(canvas);

const rows = [];
for (let i = 0; i < R.SHOTS.length; i++) {
  const shot = R.SHOTS[i];
  R.select(i);
  // 预热一帧（噪声 pattern 只创建一次）
  R.seek(0);
  const base = { ...c };
  const pick = (s) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v - (s[k] || 0)]));
  const start = { ...c };
  let frames = 0;
  for (let t = 0; t <= shot.dur; t += 1000 / 30) { R.seek(t); frames++; }
  const d = pick(start);
  const per = (k) => +(d[k] / frames).toFixed(1);
  rows.push({
    shot: shot.id,
    frames,
    ops: per('ops'),
    grad: per('grad'),
    fullFill: per('fullFill'),
    shadowBlur: per('shadowed'),
    saveRestore: per('saveRestore'),
    pathFill: per('fills'),
    pathStroke: per('strokes'),
    texts: per('texts'),
    arcs: per('arcs')
  });
}

console.log('\n每帧绘制调用（Node 桩统计，不含光栅化耗时）\n');
const head = ['镜头', '帧数', '总调用', '渐变', '全屏填充', '大模糊', 'save/restore', 'fill', 'stroke', '文字', '圆弧'];
const widths = [6, 6, 8, 6, 10, 8, 13, 6, 7, 6, 6];
const pad = (s, w) => String(s).padEnd(w);
console.log(head.map((h, i) => pad(h, widths[i])).join(''));
console.log('-'.repeat(widths.reduce((a, b) => a + b, 0)));
for (const r of rows) {
  console.log([r.shot, r.frames, r.ops, r.grad, r.fullFill, r.shadowBlur, r.saveRestore, r.pathFill, r.pathStroke, r.texts, r.arcs]
    .map((v, i) => pad(v, widths[i])).join(''));
}

const total = rows.reduce((a, r) => a + r.ops, 0) / rows.length;
console.log(`\n三镜平均每帧 ${total.toFixed(0)} 次调用；1 秒 30 帧约 ${(total * 30).toFixed(0)} 次。`);
console.log('全屏级操作（渐变/颗粒/暗角）是大头：它们按 1080×1920 = 2,073,600 像素计，与调用次数不成比例。');
