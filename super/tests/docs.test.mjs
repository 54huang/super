// 文档完整性测试：断链会让人失去信任，所以让它跑在 CI 里
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './_env.mjs';

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const mdFiles = walk(ROOT).filter(p => p.endsWith('.md'));

test('仓库里至少有 40 篇文档（内容资产没有丢）', () => {
  assert.ok(mdFiles.length >= 40, `只有 ${mdFiles.length} 篇 md`);
});

test('所有相对链接都指向真实存在的文件', () => {
  const broken = [];
  for (const file of mdFiles) {
    const text = fs.readFileSync(file, 'utf8');
    const dir = path.dirname(file);
    for (const m of text.matchAll(/\[([^\]]*)\]\(([^)]+)\)/g)) {
      const target = m[2].trim().split('#')[0];
      if (!target || /^(https?:|mailto:|tel:|#)/.test(target)) continue;
      if (!fs.existsSync(path.join(dir, decodeURIComponent(target)))) {
        broken.push(`${path.relative(ROOT, file)} → ${target}`);
      }
    }
  }
  assert.deepEqual(broken, [], '存在断链：\n' + broken.join('\n'));
});

test('顶层必备文档齐全', () => {
  for (const f of ['README.md', 'ARCHITECTURE.md', 'PROCESS.md', 'CHANGELOG.md']) {
    assert.ok(fs.existsSync(path.join(ROOT, f)), `缺少 ${f}`);
  }
});

test('每篇 ADR 都有状态、背景、决定、后果四段', () => {
  const dir = path.join(ROOT, 'docs/decisions');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
  assert.ok(files.length >= 4, `ADR 只有 ${files.length} 篇`);
  for (const f of files) {
    const t = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const h of ['状态', '背景', '决定', '后果']) {
      assert.ok(t.includes(h), `${f} 缺少「${h}」段落`);
    }
  }
});

test('campaign 与 renderer 的交叉引用有效', () => {
  const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'specs/shots.json'), 'utf8'));
  assert.ok(fs.existsSync(path.join(ROOT, spec.acceptance.checklist)), '验收清单路径不存在');
  assert.ok(fs.existsSync(path.join(ROOT, spec.narration.srt)), 'SRT 文件路径不存在');
  assert.ok(fs.existsSync(path.join(ROOT, 'renderer/index.html')));
  const html = fs.readFileSync(path.join(ROOT, 'renderer/index.html'), 'utf8');
  const m = html.match(/<script src="([^"]+)"><\/script>/);
  assert.ok(m, 'index.html 没有引用脚本');
  assert.ok(fs.existsSync(path.join(ROOT, 'renderer', m[1])), `index.html 引用了不存在的脚本 ${m[1]}`);
});

// 展示台是仓库门面。样品图裂了、链接 404 了，页面照样打开，
// 只是看起来"什么也没有"——这种坏法没人会收到通知。用断言替人看。
test('风格展示台的样品图与链接都真实存在', () => {
  const p = path.join(ROOT, 'index.html');
  assert.ok(fs.existsSync(p), '仓库根目录没有 index.html —— 展示台不见了');

  const html = fs.readFileSync(p, 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map(m => m[1])
    .filter(u => !/^(https?:|#|mailto:|data:)/.test(u));

  assert.ok(refs.length >= 5, `展示台只引用了 ${refs.length} 个本地资源，内容像是没写完`);

  const dead = refs.filter(u => {
    const clean = u.split('?')[0].split('#')[0];
    return !fs.existsSync(path.join(ROOT, clean));
  });
  assert.deepEqual(dead, [], `展示台有 ${dead.length} 处裂图或断链：${dead.join(' , ')}`);

  // 样品图不写死文件名：从页面里抽，加一种风格就自动覆盖，
  // 不用回来改测试（写死过一次，04 加进来时根本没被检查到）。
  const shots = refs.filter(u => u.startsWith('docs/samples/'));
  assert.ok(shots.length >= 3, `展示台只挂了 ${shots.length} 张风格样品图`);

  for (const u of shots) {
    const st = fs.statSync(path.join(ROOT, u));
    assert.ok(st.size > 8000, `${u} 只有 ${st.size} 字节，像是空图或占位`);
  }

  // 每张样品图都要在卡片里配三种出口：工作台、风格卡、引导块
  const cards = html.match(/<article class="card">[\s\S]*?<\/article>/g) || [];
  assert.equal(cards.length, shots.length, '卡片数和样品图数对不上');
  for (const c of cards) {
    const img = c.match(/docs\/samples\/[^"]+/);
    assert.ok(img, '有卡片没挂样品图');
    assert.match(c, /打开工作台/, `${img[0]} 的卡片缺少「打开工作台」入口`);
    assert.match(c, /docs\/cases\/[^"]+\.md/, `${img[0]} 的卡片缺少风格卡链接`);
    assert.match(c, /<details>[\s\S]*?<pre>[\s\S]*?<\/pre>/, `${img[0]} 的卡片缺少可复制的引导块`);
  }
});

// 工作台是用功能说的，不是用地址说的。
// 之前 README 写「npm run dev → http://localhost:8080/renderer/」，
// 读者得先起服务、再打开、再猜那是什么东西。地址不是描述。
test('README 用功能描述工作台，不用本地地址指代', () => {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  assert.ok(
    !/localhost|127\.0\.0\.1/.test(readme),
    'README 用本地地址指代了工作台，应该直接说它能做什么'
  );
  // 工作台的四项核心能力，缺一项就说明描述退化成了一句话
  for (const fn of ['切镜', '逐帧', '时间轴', '导出']) {
    assert.ok(readme.includes(fn), `README 没写工作台的「${fn}」能力`);
  }
});


// 断链测试只查 markdown 链接 [x](y)，抓不到反引号里的路径。
// 「渲染器/index.html」就这么在文档里烂了好几轮而测试全绿。
// 这里补上：本仓库自己的文档里，反引号写的文件路径必须真的存在。
// library/ 不扫——那些 md 描述的是 GitHub 仓库里的文件，本地没有是对的。
test('文档里反引号写出的文件路径真实存在', () => {
  const EXT = /\.(html|md|json|js|mjs|css|svg|png|yml)$/;
  const scope = mdFiles.filter(f => !path.relative(ROOT, f).startsWith('library'));
  const dead = [];
  for (const f of scope) {
    const text = fs.readFileSync(f, 'utf8');
    for (const m of text.matchAll(/`([^`\n]+)`/g)) {
      const p = m[1].trim().split('#')[0];
      if (!p.includes('/')) continue;            // 裸文件名不判断，避免误报
      if (/[*<>%${}\s]/.test(p)) continue;       // 通配符/模板/命令
      if (/^(https?:|npm |node |ffmpeg |git )/.test(p)) continue;
      if (!EXT.test(p)) continue;
      const fromRoot = path.resolve(ROOT, p);
      const fromFile = path.resolve(path.dirname(f), p);
      if (!fs.existsSync(fromRoot) && !fs.existsSync(fromFile)) {
        dead.push(`${path.relative(ROOT, f)}  →  ${p}`);
      }
    }
  }
  assert.deepEqual(dead, [], `文档里有过期路径：\n${dead.join('\n')}`);
});
