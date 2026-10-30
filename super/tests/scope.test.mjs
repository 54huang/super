// v3「示波器」渲染器契约测试
// 与 v2 共用同一套 canvas 桩，但断言的重点不同：
// v2 守的是"纸面元素不漂移"，v3 要守的是"时间轴上的波形必须成立"。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadScope } from './_env.mjs';

const R = loadScope();
const SRC = fs.readFileSync(path.join(ROOT, 'renderer/src/scope-renderer.js'), 'utf8');
// 断言要看的是代码，不是注释。注释里写着"不用 shadowBlur"是解释，不是违规。
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

test('八镜齐全，编号 P01–P08 连续且不重复', () => {
  assert.equal(R.SHOTS.length, 8, '镜头数应为 8');
  // 数组来自 vm 的另一个 realm，先搬回本域再比
  const ids = Array.from(R.SHOTS, s => s.id);
  assert.deepEqual(ids, ['P01', 'P02', 'P03', 'P04', 'P05', 'P06', 'P07', 'P08']);
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
  const R2 = loadScope(log);

  R2.renderAt(3, 0); // 预热
  let mark = log.length;
  R2.renderAt(3, 1850);
  const first = log.slice(mark).join('|');

  R2.renderAt(0, 0);
  mark = log.length;
  R2.renderAt(3, 1850);
  const second = log.slice(mark).join('|');

  assert.equal(first, second, '同一 t 渲染出了不同结果，逐帧导出会闪烁');
});

test('波形噪声来自确定性函数，代码里不出现 Math.random', () => {
  assert.ok(!/Math\.random/.test(CODE),
    '用了 Math.random，同一时间点会渲染出不同帧');
  assert.match(CODE, /mulberry32/, '固定种子生成器丢了');
});

test('辉光用叠描边实现，代码里不用 shadowBlur', () => {
  assert.ok(!/shadowBlur/.test(CODE),
    'shadowBlur 是软件高斯核，成本随面积×核半径上升；这一版用三段描边替代');
  assert.match(CODE, /glowStroke/, '辉光函数不见了');
});

test('两条通道的基线不重叠，否则对比镜头看不出落差', () => {
  const m = SRC.match(/ch1:\s*(\d+),\s*ch2:\s*(\d+),\s*amp:\s*(\d+)/);
  assert.ok(m, '解析不到通道布局常量');
  const [, ch1, ch2, amp] = m.map(Number);
  assert.ok(ch2 - ch1 > amp, `两条基线间距 ${ch2 - ch1}px 小于振幅 ${amp}px，波形会互相穿过`);
});

test('scope.html 引用的脚本存在且导出 Scope', () => {
  const html = fs.readFileSync(path.join(ROOT, 'renderer/scope.html'), 'utf8');
  const m = html.match(/<script src="([^"]+)"><\/script>/);
  assert.ok(m, 'scope.html 没有引用渲染脚本');
  const p = path.join(ROOT, 'renderer', m[1]);
  assert.ok(fs.existsSync(p), `引用了不存在的脚本 ${m[1]}`);
  assert.ok(typeof R.renderAt === 'function', '没有暴露 renderAt，测试无法脱离动画循环断言');
});
