// 案例库契约：案例卡是参考存储的检索单元，结构一旦不齐就没法比着看。
// 这里守三件事：卡片编号连续、八节齐全、索引能走到每一张。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './_env.mjs';

const DIR = path.join(ROOT, 'docs/cases');
const SECTIONS = [
  '一句话',
  '视觉构成',
  '实现入口',
  '关键技术点',
  '已知缺陷',
  '什么场合用',
  '什么场合别用',
  '换个题材怎么改'
];

const files = fs.readdirSync(DIR).filter(f => /^\d\d-.+\.md$/.test(f)).sort();

test('案例卡至少三张，编号从 01 起连续', () => {
  assert.ok(files.length >= 3, `案例卡只有 ${files.length} 张`);
  const nums = files.map(f => Number(f.slice(0, 2)));
  nums.forEach((n, i) => assert.equal(n, i + 1, `编号断了：第 ${i + 1} 张是 ${n}`));
});

test('每张卡八节齐全，顺序固定', () => {
  for (const f of files) {
    const text = fs.readFileSync(path.join(DIR, f), 'utf8');
    let last = -1;
    for (const s of SECTIONS) {
      const re = new RegExp('^## ' + s + '$', 'm');
      const m = re.exec(text);
      assert.ok(m, `${f} 缺少「${s}」一节`);
      assert.ok(m.index > last, `${f} 的「${s}」顺序不对`);
      last = m.index;
    }
  }
});

test('索引页覆盖全部案例卡', () => {
  const readme = fs.readFileSync(path.join(DIR, 'README.md'), 'utf8');
  for (const f of files) {
    const name = f.replace(/\.md$/, '');
    const hit = readme.includes(name) || readme.includes(name.slice(0, 2));
    assert.ok(hit, `索引页没有链到 ${f}`);
  }
});

test('每张卡都写了自己的代价，不是只写优点', () => {
  for (const f of files) {
    const text = fs.readFileSync(path.join(DIR, f), 'utf8');
    const start = text.indexOf('## 已知缺陷');
    const end = text.indexOf('## 什么场合用');
    const body = text.slice(start + 8, end).trim();
    assert.ok(body.length > 60, `${f} 的「已知缺陷」几乎是空的`);
  }
});

test('换个题材怎么改：必须有可执行步骤，不是一句感想', () => {
  for (const f of files) {
    const text = fs.readFileSync(path.join(DIR, f), 'utf8');
    const start = text.indexOf('## 换个题材怎么改');
    const body = text.slice(start + 10).trim();
    const steps = (body.match(/^\d\.\s/gm) || []).length;
    assert.ok(steps >= 3, `${f} 的迁移方法只有 ${steps} 步，少于 3 步就不可执行`);
  }
});

// 引导块是「选中心仪风格后拿去用」的出口。只放在展示台里不够——
// 从案例卡直接进来的人也得能整段抄走，否则这张卡就只是"看过"而已。
// 名单不写死：扫目录，凡标了「状态：现役」的卡都必须带。
test('现役风格卡都带可整段复制的引导块', () => {
  const live = fs.readdirSync(DIR)
    .filter(f => /^\d\d-.+\.md$/.test(f))
    .filter(f => /状态：现役/.test(fs.readFileSync(path.join(DIR, f), 'utf8')));
  assert.ok(live.length >= 3, `只找到 ${live.length} 张现役卡，像是状态标注丢了`);

  for (const file of live) {
    const id = file.replace(/\.md$/, '');
    const text = fs.readFileSync(path.join(DIR, file), 'utf8');
    const sec = text.split(/^## 风格引导块$/m)[1];
    assert.ok(sec, `${id} 缺少「风格引导块」一节`);
    const code = sec.match(/```\n([\s\S]*?)```/);
    assert.ok(code, `${id} 的引导块里没有代码块，没法整段复制`);
    assert.ok(
      code[1].trim().length > 100,
      `${id} 的引导块只有 ${code[1].trim().length} 字，撑不起一次风格迁移`
    );
    assert.ok(/#[0-9A-Fa-f]{6}/.test(code[1]), `${id} 的引导块里没有具体色值，等于没给约束`);
    assert.ok(/px/.test(code[1]), `${id} 的引导块里没有尺寸，等于没给约束`);
  }
});
