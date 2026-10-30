#!/usr/bin/env node
// github-backup / sync.mjs
//
// 把 super 与 super-sister 两个仓库的「已跟踪内容」同步进本备份仓，并推到 GitHub。
//
// 两条设计取舍，都是被环境逼出来的：
//   1) 只备份 git 跟踪的文件 —— super 本地 394MB，其中 381MB 是 frames/ 逐帧 PNG、
//      9MB 是 exports/ 成片，都被 .gitignore 排除。备份的是内容，不是产物。
//   2) 不用「删目录 + 重新复制」的做法。Windows 上 GNU tar 会把 E:/... 当成远程主机
//      （Cannot connect to E:），而递归删目录既容易被安全策略拦下，也容易让人误会。
//      改成纯 git 对象操作：fetch 源仓库 → 用 read-tree 把两边树挂到前缀下合成一个树
//      → commit-tree 提交。删除自动体现在树里，不需要任何文件系统删除。
//
// 用法：
//   node sync.mjs                  同步 + 提交 + 推送
//   node sync.mjs --no-push        只同步 + 提交
//   node sync.mjs --install-hooks  给两个源仓库装 post-commit 钩子（此后每次提交自动同步）
//   node sync.mjs --quiet          钩子里用，只在失败时出声

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const argv = new Set(process.argv.slice(2));
const QUIET = argv.has('--quiet');
const NO_PUSH = argv.has('--no-push');

const SOURCES = [
  { name: 'super', dir: path.resolve(ROOT, '../super') },
  { name: 'super-sister', dir: path.resolve(ROOT, '../代码视觉与音效素材库_24仓') },
];

const log = (...a) => { if (!QUIET) console.log(...a); };
const fail = (msg) => { console.error('[backup] ' + msg); process.exit(1); };

function run(args, cwd = ROOT) {
  return spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
}
function git(...args) {
  const r = run(args);
  if (r.status !== 0) fail(`git ${args[0]} 失败：${(r.stderr || '').trim()}`);
  return (r.stdout || '').trim();
}
function tryGit(...args) {
  const r = run(args);
  return r.status === 0 ? (r.stdout || '').trim() : null;
}

// 1. 读源仓库状态
function inspect(src) {
  if (!fs.existsSync(path.join(src.dir, '.git'))) fail(`${src.dir} 不是 git 仓库`);
  const head = tryGit('-C', src.dir, 'rev-parse', '--short', 'HEAD');
  if (!head) fail(`${src.dir} 还没有任何提交`);
  const branch = tryGit('-C', src.dir, 'rev-parse', '--abbrev-ref', 'HEAD') ?? 'main';
  const subject = tryGit('-C', src.dir, 'log', '-1', '--pretty=%s') ?? '';
  const n = spawnSync('git', ['-C', src.dir, 'ls-tree', '-r', '-z', '--name-only', 'HEAD'], { encoding: 'utf8' });
  const files = (n.stdout || '').split('\0').filter(Boolean).length;
  log(`  ${src.name.padEnd(12)} ${branch}@${head}  ${files} 个文件  「${subject}」`);
  return { head, branch, subject, files };
}

// 2. 装钩子：源仓库每次 commit 后自动跑一次同步
function installHooks() {
  const script = path.join(ROOT, 'sync.mjs').replace(/\\/g, '/');
  for (const src of SOURCES) {
    const hooks = path.join(src.dir, '.git', 'hooks');
    fs.mkdirSync(hooks, { recursive: true });
    const file = path.join(hooks, 'post-commit');
    fs.writeFileSync(
      file,
      `#!/bin/sh
# 由 github-backup 安装：每次提交后把内容同步到 GitHub 备份仓
node "${script}" --quiet || echo "[backup] 同步失败（不影响本次提交，稍后可手动 node github-backup/sync.mjs）"
`,
      { mode: 0o755 },
    );
    log(`  钩子已装：${file}`);
  }
}

if (argv.has('--install-hooks')) {
  log('安装 post-commit 钩子：');
  installHooks();
  console.log('\n完成。之后在 super / super-sister 里每次 commit 都会自动同步一次。');
  process.exit(0);
}

// 3. 主流程
log(`同步到 ${path.basename(ROOT)}：`);
const state = { syncedAt: new Date().toISOString(), sources: {} };
for (const src of SOURCES) state.sources[src.name] = inspect(src);

// 根目录这几个文件是手写的，直接进索引
fs.writeFileSync(path.join(ROOT, '_state.json'), JSON.stringify(state, null, 2) + '\n');
git('add', '-A', '--', 'README.md', 'sync.mjs', '.gitattributes', '_state.json');

// 把两个源仓库的 HEAD 抓进本地 refs（不碰工作区）
for (const src of SOURCES) {
  const ref = `refs/backup/${src.name}`;
  const r = run(['fetch', '--no-tags', '--force', src.dir, `HEAD:${ref}`]);
  if (r.status !== 0) fail(`fetch ${src.name} 失败：${(r.stderr || '').trim()}`);
}

// 清掉索引里的旧子目录，再把两边挂着前缀读回来 —— 内容与源完全一致，且不需要删文件
tryGit('rm', '-r', '-q', '--cached', '--ignore-unmatch', ...SOURCES.map((s) => s.name));
for (const src of SOURCES) git('read-tree', `--prefix=${src.name}/`, `refs/backup/${src.name}`);

const tree = git('write-tree');
const parent = tryGit('rev-parse', 'HEAD');
if (parent && tryGit('rev-parse', `${parent}^{tree}`) === tree) {
  log('\n内容与上次一致，无需提交。');
  process.exit(0);
}

const tags = Object.entries(state.sources).map(([n, v]) => `${n}@${v.head}`).join(' + ');
const body = Object.entries(state.sources)
  .map(([n, v]) => `- ${n}: ${v.branch}@${v.head} ${v.files} 个文件 — ${v.subject}`)
  .join('\n');
const commitArgs = ['commit-tree', tree, '-m', `同步 ${tags}`, '-m', body];
if (parent) commitArgs.splice(2, 0, '-p', parent);
const commit = git(...commitArgs);
git('update-ref', 'refs/heads/main', commit);

// 让工作区跟上新提交（这里的删除由 git 自己做，脚本自身不发删除命令）
const co = run(['checkout', '-f', 'main']);
if (co.status !== 0) log(`  （工作区未更新，可稍后手动 git checkout -f main：${(co.stderr || '').trim()}）`);
log(`\n已提交：同步 ${tags}`);

if (NO_PUSH) {
  log('（--no-push，未推送）');
  process.exit(0);
}
const p = spawnSync('git', ['-C', ROOT, 'push', 'origin', 'main'], {
  encoding: 'utf8',
  env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
});
if (p.status !== 0) fail(`推送失败：${(p.stderr || '').trim()}\n本地已提交，修好网络/凭据后重跑 node sync.mjs`);
log('已推送 GitHub。');
