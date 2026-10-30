// 素材库契约测试：50 个仓库、24 个节点、每个节点都有实体文件
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './_env.mjs';

const LIB = path.join(ROOT, 'library');
const snap = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/research/repos.snapshot.json'), 'utf8'));
const repos = snap.repos;

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

test('快照收录 50 个仓库，编号 1–50 连续且不重复', () => {
  assert.equal(snap.count, 50);
  assert.equal(repos.length, 50);
  assert.deepEqual(repos.map(r => r.id), Array.from({ length: 50 }, (_, i) => i + 1));
});

test('仓库地址唯一且都在 github.com', () => {
  const urls = repos.map(r => r.url);
  assert.equal(new Set(urls).size, 50, '存在重复仓库');
  for (const r of repos) {
    assert.match(r.url, /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/);
    assert.ok(r.url.endsWith(r.repo), `${r.repo} 与 url 不匹配`);
  }
});

test('节点恰好 24 个，编号 N01–N24 不重复', () => {
  const nodes = repos.filter(r => r.node).map(r => r.node);
  assert.equal(nodes.length, 24);
  assert.equal(new Set(nodes).size, 24);
  const sorted = [...nodes].sort();
  assert.equal(sorted[0], 'N01');
  assert.equal(sorted.at(-1), 'N24');
});

test('每个节点在 library 下都有对应的说明文件', () => {
  const files = walk(LIB).filter(p => p.endsWith('.md'));
  for (const r of repos.filter(x => x.node)) {
    const hit = files.find(p => path.basename(p).startsWith(r.node + '_'));
    assert.ok(hit, `节点 ${r.node}（${r.repo}）缺少说明文件`);
  }
});

const CAT_DIRS = fs.readdirSync(LIB).filter(n => /^0[1-8]_/.test(n));

test('8 个分类目录齐全（00_起点 是导航，不计入分类），且各有 README', () => {
  assert.equal(CAT_DIRS.length, 8, `分类目录应为 8 个，实际 ${CAT_DIRS.length}`);
  for (const d of CAT_DIRS) {
    assert.ok(fs.existsSync(path.join(LIB, d, 'README.md')), `${d} 缺少 README.md`);
  }
});

test('每个分类的 README 覆盖该分类下的全部仓库', () => {
  for (const d of CAT_DIRS) {
    const prefix = d.slice(0, 2);
    const expected = repos.filter(r => r.category.startsWith(prefix)).length;
    const readme = fs.readFileSync(path.join(LIB, d, 'README.md'), 'utf8');
    const links = [...readme.matchAll(/github\.com\//g)].length;
    assert.ok(expected > 0, `分类 ${d} 在快照里没有任何仓库`);
    assert.ok(links >= expected, `${d}: README 只有 ${links} 个仓库链接，快照里有 ${expected} 个`);
  }
});

test('节点总表覆盖全部 24 个节点', () => {
  const t = fs.readFileSync(path.join(LIB, '00_起点/节点总表.md'), 'utf8');
  const nums = new Set([...t.matchAll(/\|\s*(N\d{2})\s*\|/g)].map(m => m[1]));
  for (const r of repos.filter(x => x.node)) {
    assert.ok(nums.has(r.node), `节点总表缺少 ${r.node}`);
  }
});

test('快照里的用途描述不为空（收容的是资料，不是链接）', () => {
  for (const r of repos) {
    assert.ok(r.purpose && r.purpose.length >= 4, `${r.repo} 缺少用途说明`);
  }
});
