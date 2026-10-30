// 渲染器契约测试：能跑、不崩、同一时间点必须产出同一帧
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { ROOT, loadRenderer } from './_env.mjs';

const SRC = path.join(ROOT, 'renderer/src/shot-renderer.js');

test('渲染器源码语法合法（node --check）', () => {
  execFileSync(process.execPath, ['--check', SRC], { stdio: 'pipe' });
});

test('画布被设为 1080×1920', () => {
  const R = loadRenderer();
  assert.equal(R.W, 1080);
  assert.equal(R.H, 1920);
  assert.equal(R.FPS, 30);
});

test('七个镜头在整条时间轴上逐帧渲染不抛异常', () => {
  const R = loadRenderer();
  let frames = 0;
  for (let i = 0; i < R.SHOTS.length; i++) {
    R.select(i);
    const shot = R.SHOTS[i];
    for (let t = 0; t <= shot.dur; t += 1000 / 30) {
      assert.doesNotThrow(() => R.seek(t), `${shot.id} 在 t=${Math.round(t)} 崩了`);
      frames++;
    }
  }
  assert.ok(frames > 900, `渲染帧数偏少：${frames}`);
});

test('开关「中文标注 / 安全区」不改变渲染稳定性', () => {
  const R = loadRenderer();
  for (const key of ['labels', 'safe']) {
    R.state[key] = true;
    assert.doesNotThrow(() => R.seek(1200));
    R.state[key] = false;
    assert.doesNotThrow(() => R.seek(1200));
  }
});

test('确定性：同一时间点两次渲染产生完全相同的绘制序列', () => {
  const log = [];
  const R = loadRenderer(log);
  R.select(0);
  R.seek(1000);                 // 预热，让噪声 pattern 只创建一次

  const mark = log.length;
  R.seek(1234);
  const first = log.slice(mark).join('|');

  R.seek(0);
  const mark2 = log.length;
  R.seek(1234);
  const second = log.slice(mark2).join('|');

  assert.ok(first.length > 200, '绘制序列过短，可能是空渲染');
  assert.equal(first, second, '同一 t 渲染出了不同结果，逐帧导出会闪烁');
});

// 渲染器现在能画完整 30 秒。画面一旦和分镜表脱节，剪出来的片子就和设计不是一回事，
// 所以这里逐镜对齐：数量、编号、起始秒、时长，一个都不许错。
test('渲染器七镜与分镜表逐镜对齐', async () => {
  const fs = await import('node:fs');
  const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'specs/shots.json'), 'utf8'));
  const R = loadRenderer();

  assert.equal(R.SHOTS.length, spec.shots.length,
    `渲染器 ${R.SHOTS.length} 镜，分镜表 ${spec.shots.length} 镜`);

  spec.shots.forEach((s, i) => {
    const r = R.SHOTS[i];
    assert.equal(r.id, s.id, `第 ${i + 1} 镜编号不一致`);
    assert.equal(r.from, s.start, `${s.id} 起始秒不一致`);
    assert.equal(r.dur, s.duration * 1000, `${s.id} 时长不一致`);
  });

  const last = R.SHOTS[R.SHOTS.length - 1];
  assert.equal(last.from + last.dur / 1000, spec.format.totalSec, '七镜没有铺满全片');
});

test('全片 900 帧可以连续渲染（不只是单镜循环）', () => {
  const R = loadRenderer();
  for (let i = 0; i < 900; i++) {
    assert.doesNotThrow(() => R.renderAt(i * 1000 / 30), `全片第 ${i} 帧崩了`);
  }
  assert.equal(R.TOTAL, 30000, '全片时长必须 30 秒');
});

// 导出是这套东西的出口。方法名一改，界面上的按钮就静默失效了。
test('导出通道齐全：录制 / 单帧 / 整镜序列 / 全片序列', () => {
  const R = loadRenderer();
  for (const fn of ['exportFrame', 'exportSequence', 'exportFull', 'recordFull', 'renderAt']) {
    assert.equal(typeof R[fn], 'function', `缺少导出方法 ${fn}`);
  }
});
