// 本库结构自检：node check.mjs
// 守四件事：节点编号连续 / 每张节点卡小节齐全 / 相对链接不断 / 全仓清单与分栏数字自洽
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const bad = [];
const ok = [];

const md = [path.join(ROOT, 'README.md')];
for (const dir of fs.readdirSync(ROOT, { withFileTypes: true })) {
  if (!dir.isDirectory() || dir.name.startsWith('.')) continue;
  const dp = path.join(ROOT, dir.name);
  for (const f of fs.readdirSync(dp)) if (f.endsWith('.md')) md.push(path.join(dp, f));
}

// 1. 节点文件 01–15 连续
const nodeFiles = md.filter((p) => /^N\d{2}_/.test(path.basename(p))).sort();
const nums = nodeFiles.map((p) => Number(path.basename(p).slice(1, 3)));
if (nodeFiles.length !== 15) bad.push(`节点文件应为 15 个，实际 ${nodeFiles.length}`);
for (let i = 1; i <= 15; i++) if (!nums.includes(i)) bad.push(`缺 N${String(i).padStart(2, '0')}`);
ok.push(`节点文件 ${nodeFiles.length} 个，编号 01–15 连续`);

// 2. 每张节点卡的小节齐全
const SECTIONS = ['为什么是节点', '它能给你什么', '怎么落到 9:16 竖屏', '取用路径', '注意'];
for (const p of nodeFiles) {
  const t = fs.readFileSync(p, 'utf8');
  for (const s of SECTIONS) if (!t.includes(s)) bad.push(`${path.basename(p)} 缺小节「${s}」`);
  if (!t.startsWith('# N')) bad.push(`${path.basename(p)} 首行不是 # Nxx 标题`);
  if (!t.includes('已核对')) bad.push(`${path.basename(p)} 没有「目录（已核对）」`);
}
ok.push('五节齐全 + 首行标题 + 目录已核对');

// 3. 相对链接必须指到真文件
for (const p of md) {
  const t = fs.readFileSync(p, 'utf8');
  for (const m of t.matchAll(/\]\((\.[^)]+)\)/g)) {
    if (!fs.existsSync(path.resolve(path.dirname(p), m[1]))) bad.push(`${path.basename(p)} 断链 → ${m[1]}`);
  }
}
ok.push('相对链接全部可达');

// 4. 正文引用的节点号必须存在
const allText = md.map((p) => fs.readFileSync(p, 'utf8')).join('\n');
const cited = [...new Set([...allText.matchAll(/N(\d{2})/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
for (const n of cited) if (!nums.includes(n)) bad.push(`引用了不存在的 N${String(n).padStart(2, '0')}`);
ok.push(`引用到的节点：${cited.map((n) => 'N' + String(n).padStart(2, '0')).join(' ')}`);

// 5. 全仓清单行数 / 节点标记数 / 分栏仓数
const inv = fs.readFileSync(path.join(ROOT, '00_起点/全仓清单.md'), 'utf8');
const rows = [...inv.matchAll(/^\| (\d{2}) \| \[/gm)].map((m) => Number(m[1]));
if (rows.length !== 24) bad.push(`全仓清单应为 24 行，实际 ${rows.length}`);
const marks = [...inv.matchAll(/\*\*N\d{2}\*\*/g)].length;
if (marks !== 18) bad.push(`节点标记应为 18 个（15 节点分布 18 仓），实际 ${marks}`);
const sec = { 1: 0, 2: 0, 3: 0 };
for (const n of rows) sec[n <= 10 ? 1 : n <= 17 ? 2 : 3]++;
if (sec[1] !== 10 || sec[2] !== 7 || sec[3] !== 7) bad.push(`分栏仓数应为 10/7/7，实际 ${sec[1]}/${sec[2]}/${sec[3]}`);
ok.push(`全仓清单 ${rows.length} 行 · ${marks} 个节点标记 · 分栏 ${sec[1]}/${sec[2]}/${sec[3]}`);

console.log('--- 通过 ---');
ok.forEach((s) => console.log('  ' + s));
if (bad.length) {
  console.log('\n--- 不合规 ---');
  bad.forEach((s) => console.log('  ✗ ' + s));
  process.exit(1);
}
console.log('\n全部通过');
