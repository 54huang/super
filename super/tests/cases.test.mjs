// 案例库契约：案例卡是参考存储的检索单元，结构一旦不齐就没法比着看。
// 这里守三件事：卡片编号连续、八节齐全、索引能走到每一张。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
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

// 实验卡（07–09）的样图是可以重新出一遍的：卡里就写着命令。
// 但命令里的 --style / --shot 一旦和渲染器对不上，那行字就变成"看起来像命令的装饰"——
// 页面照开、图照显示，只是再也复现不出来。没人会收到通知，所以让测试替人跑。
//
// 上一版这里读的是 renderer/exp/styles.js（单帧版）。那版已被五镜工作台取代，
// 所以断言也跟着换成"真的把渲染器跑起来，看它导出的分镜表"。
async function loadStyle(style) {
  const sandbox = { console };
  sandbox.window = sandbox;
  // 只跑到模块顶层：引擎要 document 只是为了离屏画布，给一个空壳就够，
  // 因为这里不画任何一帧。真正画图的是 scripts/exp-render.mjs。
  sandbox.document = { createElement: () => ({ getContext: () => ({}) }) };
  vm.createContext(sandbox);
  for (const f of ['renderer/src/exp-engine.js', `renderer/src/${style}-renderer.js`]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
  }
  return sandbox.window.Exp;
}

const STYLES = ['riso', 'eink', 'metal'];

test('三种实验介质都能导出完整的分镜表', async () => {
  for (const style of STYLES) {
    const E = await loadStyle(style);
    assert.ok(E, `${style} 没有导出 window.Exp`);
    assert.equal(E.id, style, `${style} 导出的 id 是 ${E.id}`);
    assert.ok(E.SHOTS.length >= 4, `${style} 只有 ${E.SHOTS.length} 镜，撑不起一条片子`);

    const prefix = E.SHOTS[0].id[0];
    for (const s of E.SHOTS) {
      assert.ok(s.id.startsWith(prefix), `${style} 的镜号 ${s.id} 前缀不统一`);
      assert.ok(s.name && s.name.length >= 2, `${style}/${s.id} 没有镜头名`);
      assert.ok(s.dur >= 1000, `${style}/${s.id} 只有 ${s.dur}ms，短到看不见`);
      assert.equal(typeof s.draw, 'function', `${style}/${s.id} 没有 draw()`);
    }

    const sum = E.SHOTS.reduce((a, s) => a + s.dur, 0);
    assert.equal(E.TOTAL, sum, `${style} 的 TOTAL 和分镜时长之和对不上`);
    // 9:16 竖屏，平台侧通常在 20 秒以上开始劝退；超过 40 秒说明某一镜失控了
    assert.ok(sum > 10000 && sum < 40000, `${style} 总长 ${sum}ms 不在合理区间`);
  }
});

test('实验卡的出图命令指向真实存在的风格与镜号', async () => {
  const exp = files.filter(f => /状态：实验/.test(fs.readFileSync(path.join(DIR, f), 'utf8')));
  assert.ok(exp.length >= 3, `只找到 ${exp.length} 张实验卡，像是状态标注丢了`);

  for (const f of exp) {
    const text = fs.readFileSync(path.join(DIR, f), 'utf8');
    const used = [...text.matchAll(/--style\s+(\w+)/g)].map(m => m[1]);
    assert.ok(used.length > 0, `${f} 没写复现命令，别人拿不到这张样图`);

    for (const style of used) {
      assert.ok(STYLES.includes(style), `${f} 里的 --style ${style} 不存在（可选 ${STYLES.join(' / ')}）`);
      const E = await loadStyle(style);

      // --shot 可以写序号也可以写镜号，两种都要能落到具体某一镜上
      const shots = [...text.matchAll(/--shot\s+(\w+)/g)].map(m => m[1]);
      for (const v of shots) {
        const idx = /^\d+$/.test(v)
          ? Number(v) - 1
          : E.SHOTS.findIndex(s => s.id === v);
        assert.ok(
          idx >= 0 && idx < E.SHOTS.length,
          `${f} 里的 --shot ${v} 在 ${style} 里找不到（共 ${E.SHOTS.length} 镜：${E.SHOTS.map(s => s.id).join(' ')}）`
        );
      }

      // 实现入口必须指向真实存在的工作台，否则"能切镜"就是一句空话
      const wb = `renderer/${style}.html`;
      assert.ok(text.includes(wb), `${f} 的「实现入口」没写出工作台 ${wb}`);
      assert.ok(fs.existsSync(path.join(ROOT, wb)), `${f} 指向的工作台 ${wb} 不存在`);
    }

    const imgs = [...text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(m => m[1]);
    assert.ok(imgs.length > 0, `${f} 没有嵌样图`);
    for (const p of imgs) {
      assert.ok(fs.existsSync(path.join(DIR, p)), `${f} 嵌的样图 ${p} 不存在`);
    }
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
