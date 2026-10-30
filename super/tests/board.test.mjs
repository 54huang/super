// v4「黑板粉笔」渲染器契约测试
// 与 v2/v3 共用同一套 canvas 桩，但断言的重点又换了一次：
//   v2 守"纸面元素不漂移"，v3 守"时间轴上的波形成立"，
//   v4 要守的是"手写的东西不能跑出板面"——因为这一版所有元素都贴着
//   板框内沿排，一旦坐标漂了，木框就会把字切掉，而且屏上很难一眼看出来。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadBoard } from './_env.mjs';

const SRC = fs.readFileSync(path.join(ROOT, 'renderer/src/board-renderer.js'), 'utf8');
// 断言要看的是代码，不是注释。注释里写着"不用 destination-out"是解释，不是违规。
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const R = loadBoard();

test('八镜齐全，编号 B01–B08 连续且不重复', () => {
  assert.equal(R.SHOTS.length, 8, '镜头数应为 8');
  // 数组来自 vm 的另一个 realm，先搬回本域再比
  const ids = Array.from(R.SHOTS, s => s.id);
  assert.deepEqual(ids, ['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07', 'B08']);
  assert.equal(new Set(ids).size, 8, '镜头编号有重复');
});

test('每镜都有中文名与正数时长，且时长统一', () => {
  const durs = new Set();
  for (const s of R.SHOTS) {
    assert.ok(s.name && /[\u4e00-\u9fa5]/.test(s.name), `${s.id} 缺少中文名`);
    assert.ok(s.dur > 0 && Number.isFinite(s.dur), `${s.id} 时长非法`);
    durs.add(s.dur);
  }
  assert.equal(durs.size, 1, '八镜时长不一致，逐帧导出无法统一节奏');
});

test('八镜在整条时间轴上逐帧渲染不抛异常', () => {
  const step = 1000 / R.FPS;
  let frames = 0;
  for (let i = 0; i < R.SHOTS.length; i++) {
    const dur = R.SHOTS[i].dur;
    for (let t = 0; t <= dur; t += step) {
      R.renderAt(i, t);
      frames++;
    }
  }
  assert.ok(frames > 900, `渲染帧数偏少：${frames}`);
});

test('确定性：同一镜同一时刻两次渲染产生完全相同的绘制序列', () => {
  const log = [];
  const R2 = loadBoard(log);

  R2.renderAt(1, 0); // 预热
  let mark = log.length;
  R2.renderAt(1, 1780);
  const first = log.slice(mark).join('|');

  R2.renderAt(6, 0);
  mark = log.length;
  R2.renderAt(1, 1780);
  const second = log.slice(mark).join('|');

  assert.equal(first, second, '同一 t 渲染出了不同结果，逐帧导出会闪');
});

test('抖动全部来自固定种子，代码里不出现 Math.random', () => {
  assert.ok(!/Math\.random/.test(CODE),
    '用了 Math.random，同一时间点会渲染出不同帧');
  assert.match(CODE, /mulberry32/, '固定种子生成器丢了');
});

test('粉笔质感不用 shadowBlur', () => {
  assert.ok(!/shadowBlur/.test(CODE),
    'shadowBlur 是软件高斯核，成本随面积×核半径上升；这一版靠短划痕叠出颗粒');
  assert.match(CODE, /chalkStroke/, '粉笔笔触函数不见了');
});

test('不许用 destination-out 做断续，导出 PNG 会留透明洞', () => {
  // 这是粉笔质感的头号陷阱：把线挖断确实像粉笔，
  // 但 destination-out 挖掉的是像素本身，转 PNG 时变成透明，
  // 合成到视频里就是一片黑斑。实测过，肉眼在小图上看不出来。
  assert.ok(!/destination-out/.test(CODE),
    '用了 destination-out，导出序列会出现透明像素');
  assert.ok(!/globalCompositeOperation/.test(CODE),
    '出现了混合模式，先确认它不会破坏底色再放行');
});

test('字体栈里必须显式写出中文字体', () => {
  // Skia（Node 端离线渲染）不做通用族的中日韩隐式 fallback。
  // 只写 monospace/serif 会把中文画成豆腐块，而这个缺陷在浏览器里永远暴露不了。
  const chalk = SRC.match(/const F_CHALK\s*=\s*'([^']+)'/);
  const code = SRC.match(/const F_CODE\s*=\s*'([^']+)'/);
  assert.ok(chalk, '找不到板书字体栈');
  assert.ok(code, '找不到代码字体栈');
  assert.match(chalk[1], /KaiTi|楷体/, '板书字体栈没有楷体，粉笔手写感会退化成印刷体');
  assert.match(code[1], /KaiTi|SimSun|Noto|Microsoft YaHei/, '代码字体栈没有中文字体兜底，中文注释会变豆腐块');
});

test('板框不能压到内容：框宽必须小于左右边距', () => {
  // 常量块里每行后面带注释，正则要跨过去
  const m = SRC.match(/frame:\s*(\d+)[\s\S]*?x0:\s*(\d+),\s*x1:\s*(\d+)/);
  assert.ok(m, '解析不到版面常量');
  const [, frame, x0, x1] = m.map(Number);
  assert.ok(frame < x0, `左框 ${frame}px 吃掉了内容左边距 ${x0}px`);
  assert.ok(frame < 1080 - x1, `右框 ${frame}px 吃掉了内容右边距 ${1080 - x1}px`);
});

test('所有文字都画在板面之内，不会被木框切掉', () => {
  const log = [];
  const R2 = loadBoard(log, { args: true });
  const W = R2.W, H = R2.H;
  const F = Number(SRC.match(/frame:\s*(\d+)/)[1]);
  const pad = 6;                       // 框内侧还有一道暗边
  const lo = F + pad, hi = W - F - pad;

  // 每镜取末帧，此时元素最全
  for (let i = 0; i < R2.SHOTS.length; i++) R2.renderAt(i, R2.SHOTS[i].dur);

  const texts = log.filter(s => s.startsWith('fillText('));
  assert.ok(texts.length > 200, `记录的 fillText 太少（${texts.length}），桩可能没生效`);

  const bad = [];
  for (const s of texts) {
    const m = s.match(/^fillText\(([\s\S]*)\)$/);
    if (!m) continue;
    const parts = m[1].split('|');
    const x = Number(parts[1]), y = Number(parts[2]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < lo || x > hi) bad.push(`${parts[0]} x=${x}`);
    if (y < lo || y > H - F - pad) bad.push(`${parts[0]} y=${y}`);
  }
  assert.deepEqual(bad.slice(0, 8), [], `有 ${bad.length} 处文字落到板框外，导出后会被切掉`);
});

test('板面上的矩形不能有负尺寸', () => {
  // 注意这里不断言"不许超出画布"：板面灰痕、擦痕本来就是满铺纹理，
  // 越界交给 canvas 裁，无害。真正会出事的是负宽高 —— fillRect(x,y,-w,h)
  // 一个像素都不画，画面上表现成"这块东西凭空消失了"，很难定位。
  const log = [];
  const R2 = loadBoard(log, { args: true });
  for (let i = 0; i < R2.SHOTS.length; i++) R2.renderAt(i, R2.SHOTS[i].dur);

  const bad = [];
  for (const s of log) {
    const m = s.match(/^fillRect\((-?\d+)\|(-?\d+)\|(-?\d+)\|(-?\d+)\)$/);
    if (!m) continue;
    const [, , , w, h] = m.map(Number);
    if (w < 0 || h < 0) bad.push(s);
  }
  assert.deepEqual(bad.slice(0, 6), [], `有 ${bad.length} 个矩形尺寸为负，实际什么都不会画`);
});

test('board.html 引用的脚本存在且导出 Board', () => {
  const html = fs.readFileSync(path.join(ROOT, 'renderer/board.html'), 'utf8');
  const m = html.match(/<script src="([^"]+)"><\/script>/);
  assert.ok(m, 'board.html 没有引用渲染脚本');
  const p = path.join(ROOT, 'renderer', m[1]);
  assert.ok(fs.existsSync(p), `引用了不存在的脚本 ${m[1]}`);
  assert.ok(typeof R.renderAt === 'function', '没有暴露 renderAt，测试无法脱离动画循环断言');
  assert.ok(typeof R.exportSequence === 'function', '没有暴露 exportSequence，工作台导不出序列');
});
