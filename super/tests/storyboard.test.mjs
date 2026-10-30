// 分镜契约测试：时间码是硬约束，其他都可以谈
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './_env.mjs';

const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'specs/shots.json'), 'utf8'));
const { format, shots } = spec;

test('格式合法：9:16 / 1080×1920 / 30fps', () => {
  assert.equal(format.ratio, '9:16');
  assert.equal(format.width, 1080);
  assert.equal(format.height, 1920);
  assert.equal(format.fps, 30);
});

test('镜头 id 唯一且编号连续', () => {
  const ids = shots.map(s => s.id);
  assert.equal(new Set(ids).size, ids.length, '存在重复 id');
  shots.forEach((s, i) => {
    assert.equal(s.id, 'S' + String(i + 1).padStart(2, '0'));
    assert.equal(s.index, i + 1);
  });
});

test('时间码无缝覆盖 0–totalSec，不重叠不留空', () => {
  assert.equal(shots[0].start, 0, '第一个镜头必须从 0 开始');
  for (let i = 1; i < shots.length; i++) {
    assert.equal(shots[i].start, shots[i - 1].end, `${shots[i].id} 与 ${shots[i - 1].id} 之间有空洞或重叠`);
  }
  assert.equal(shots.at(-1).end, format.totalSec, '最后一个镜头必须收满总时长');
});

test('每个镜头时长 = end - start，且落在平台档位内', () => {
  for (const s of shots) {
    const d = +(s.end - s.start).toFixed(3);
    assert.equal(s.duration, d, `${s.id} 的 duration 与时间码不一致`);
    assert.ok(format.durationBuckets.includes(s.duration), `${s.id} 时长 ${s.duration}s 不在档位 ${format.durationBuckets} 内`);
  }
});

test('单条字幕不超过 16 字符（不含空格，竖屏可读性）', () => {
  for (const s of shots) {
    const len = s.subtitle.replace(/\s/g, '').length;
    assert.ok(len <= 16, `${s.id} 字幕 ${len} 字符：${s.subtitle}`);
    assert.ok(len > 0);
  }
});

test('每 8 秒内至少一次视觉变化（景别或时长切换）', () => {
  let lastKey = null, lastAt = 0;
  for (const s of shots) {
    const key = s.shotSize + '|' + s.motion;
    if (key !== lastKey) { lastAt = s.start; lastKey = key; }
    assert.ok(s.start - lastAt <= 8, `${s.id} 起镜头长时间没有视觉变化`);
  }
});

test('producedBy=code 的镜头必须在渲染器里有对应镜头', () => {
  const src = fs.readFileSync(path.join(ROOT, 'renderer/src/shot-renderer.js'), 'utf8');
  const codeShots = shots.filter(s => s.producedBy === 'code');
  assert.ok(codeShots.length > 0, '至少要有一个代码渲染镜头');
  for (const s of codeShots) {
    assert.ok(s.rendererShot, `${s.id} 缺少 rendererShot`);
    assert.ok(src.includes(`'${s.rendererShot}'`), `渲染器里找不到镜头 ${s.rendererShot}`);
  }
});

test('AI 镜头必须带首帧或提示词引用（可复现）', () => {
  for (const s of shots.filter(x => x.producedBy === 'ai')) {
    assert.ok(s.promptRef, `${s.id} 缺少 promptRef`);
    assert.ok(fs.existsSync(path.join(ROOT, s.promptRef.split('#')[0])), `${s.id} 的 promptRef 指向的文件不存在`);
  }
});

test('美术方向：每个 active 方案都要被镜头引用', () => {
  const active = spec.artDirections.filter(d => d.status === 'active');
  assert.ok(active.length >= 1);
  for (const d of active) {
    assert.ok(d.usedBy.every(id => shots.some(s => s.id === id)), `${d.id} 引用了不存在的镜头`);
  }
});
