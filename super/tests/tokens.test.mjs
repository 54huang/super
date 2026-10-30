// 设计令牌测试：防止「改了代码没改文档」或「改了文档没改代码」
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './_env.mjs';

const tokens = JSON.parse(fs.readFileSync(path.join(ROOT, 'specs/style-tokens.json'), 'utf8'));
const src = fs.readFileSync(path.join(ROOT, 'renderer/src/shot-renderer.js'), 'utf8');

test('调色板里每个色值都真的出现在渲染器源码里', () => {
  for (const [name, hex] of Object.entries(tokens.palette)) {
    assert.match(hex, /^#[0-9A-F]{6}$/, `${name} 不是合法大写 hex`);
    assert.ok(src.includes(hex), `源码里找不到 ${name} = ${hex}（文档与实现已漂移）`);
  }
});

test('渲染器契约与令牌一致（尺寸 / 帧率）', () => {
  assert.equal(tokens.rendererContract.canvas.width, 1080);
  assert.equal(tokens.rendererContract.canvas.height, 1920);
  assert.equal(tokens.rendererContract.fps, 30);
  const { width, height } = tokens.rendererContract.canvas;
  assert.match(src, new RegExp(`W\\s*=\\s*${width}`), '源码里找不到画布宽度');
  assert.match(src, new RegExp(`H\\s*=\\s*${height}`), '源码里找不到画布高度');
});

test('层序完整：7 层，顺序从 1 递增', () => {
  assert.equal(tokens.layers.length, 7);
  tokens.layers.forEach((l, i) => assert.equal(l.order, i + 1));
  assert.equal(tokens.layers[4].name, '批注层', '第 5 层必须是批注层（强调色唯一出现的地方）');
});

test('强调色面积上限被显式约束', () => {
  assert.ok(tokens.constraints.accentMaxArea > 0 && tokens.constraints.accentMaxArea <= 0.05);
});

test('固定种子全部为整数（确定性渲染的前提）', () => {
  for (const [k, v] of Object.entries(tokens.rendererContract.seeds)) {
    assert.equal(Number.isInteger(v), true, `${k} 种子必须是整数`);
    assert.ok(src.includes(String(v)), `源码里找不到种子 ${k}=${v}`);
  }
});

test('字号层级不超过 6 级，且排序后严格递减', () => {
  const sizes = [...new Set(['display', 'code', 'label', 'meta'].map(k => tokens.typography[k].size))].sort((a, b) => b - a);
  assert.ok(sizes.length <= 6);
  for (let i = 1; i < sizes.length; i++) assert.ok(sizes[i] < sizes[i - 1]);
});
