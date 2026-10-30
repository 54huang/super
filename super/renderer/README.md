# 渲染器目录

这里有三个渲染器，对应案例库里的三个现役案例。

| 页面 | 案例 | 镜头 | 实现 |
|---|---|---|---|
| `index.html` | 案例 02 制图台 | **7 镜全片**（S01–S07，30.000 秒） | `src/shot-renderer.js` |
| `scope.html` | 案例 03 示波器 | 8 镜（P01–P08，32 秒） | `src/scope-renderer.js` |
| `board.html` | 案例 04 黑板粉笔 | 8 镜（B01–B08，32 秒） | `src/board-renderer.js` |
| — | 案例 01 深空蓝 | 3 镜（已弃用） | `legacy/shot-renderer.v1.js` |

**这份 README 只讲目录结构与可调参数。** 视觉是怎么构成的、技术点、已知缺陷、换题材怎么迁移，都在 `../docs/cases/` 的五张卡里——那才是参考存储的正文。

```
renderer/
├── index.html                  ← 制图台工作台（打开即用）
├── scope.html                  ← 示波器工作台（打开即用）
├── board.html                  ← 黑板粉笔工作台（打开即用）
├── src/shot-renderer.js        ← v2 全部绘制逻辑
├── src/scope-renderer.js       ← v3 全部绘制逻辑
├── src/board-renderer.js       ← v4 全部绘制逻辑
├── legacy/shot-renderer.v1.js  ← v1 留档
└── README.md
```

三个页面都是纯本地、无依赖、无 CDN。测试统一收在仓库根 `tests/`。

```bash
npm test                              # 全部契约测试（65 项）
node --test tests/renderer.test.mjs   # 只跑 v2
node --test tests/scope.test.mjs      # 只跑 v3
node --test tests/board.test.mjs      # 只跑 v4
```

---

## 案例 02：七镜的设计

默认**全片连播**，一打开就是完整的 30 秒；也可以切单镜循环逐镜调。

**S01 钩子（0–4s）**
一张比画布更宽的词条卡，整镜持续推近。`~File::~File()` 打字机出现，「析构函数」擦除进入，然后「只清内存」被装进制图方框——四角定位标记卡住它。红笔从左上到右下划一道否定线，旁边写「真的？」，最后一个大问号回弹落下。

**S02 举证（4–8s）**
三行真实 C++ 逐行打字机，右侧同步长出状态框：`持有句柄` ✓ / `数据已读` ✓ / `流程中断` ✗（红）。第三行左侧加红色方括号，标「这里就断了」。底部一行等宽小字汇总资源状态。

**S03 异常（8–12s）**
一张带图框的代码图纸（图注 `CODE-01 / C++ EXCEPTION`，右上 `FIG. S03 08-12s`），三行**真实可读的 C++** 逐行打字机出现：

```cpp
auto f = std::ifstream{"data.txt"};
f.read(buf, 4096);
throw std::runtime_error{"bad"};
```

第 3 行被红笔划波浪线 → 朱红校对章落下（回弹 + 画面震 1.4px）→ 红线引出的手写批注「close 谁调？」→ 边角红墨晕开，表示异常外溢。

**S04 反转（12–16s）**
一张七行的 `CALL TRACE` 表，只有前五行有内容，后两行是虚线。第 05 行 `~File()` 的 CALLER 写着 `compiler`，被红笔圈住，批注「没人写这一行」。整镜持续**拉远**，最后看见这张表大部分是空的。

**S05 作用域（16–22s）**
三张图纸叠成景深，标 `SCOPE 01/02/03`。纸盒按自由落体 t² 下坠，带虚线速度线（随速度变长）；穿过每层时该层被**盖章**并弹出波纹圈；落地散成 130 片纸屑 + 26 个墨点，落地线出现并标注 `dtor`。

**S06 结构（22–26s）**
纸屑从右下方汇聚 → 左侧两张错位矩形（`栈 STACK`）、右侧圆环（`堆 HEAP`），全部用 dash 描出；中线带箭头，标 `lifetime`；收尾整图轻微压蓝。

**S07 收尾（26–30s）**
左右对照。左栏 `try/finally` 被红笔斜线划掉、盖叉章；右栏 `~File()` 被红框标出、打勾。底部一行「不需要 finally」+ 等宽小字。收尾压一层极淡的蓝，表示结束。

---

## 案例 03：八镜的编排

八镜各 4 秒，共 32 秒。每镜的波形就是一个 `events` 数组（`{t, v}` 折线顶点），`tracePoints()` 统一插值加噪——**加镜头只需要加数据，不改绘制逻辑**。

| 镜 | 动作 | 波形形态 |
|---|---|---|
| P01 上电 | 网格展开、自检 | 无波形，只有扫描光带 |
| P02 构造 | 抬到 +1.0 | 台阶上升 |
| P03 正常析构 | 落回基线，ΔT 16.0ms | 台阶下降，两端加游标 |
| P04 异常 | 触发灯亮，红字 throw | 高频抖动 |
| P05 栈展开 | 三层逐个盖章 | 三级阶梯下降 |
| P06 对比上场 | CH2 出现 | 双通道并置 |
| P07 泄漏 | CH2 停在半空 | 一条归零、一条持高 |
| P08 读数 | PAIRED / LEAKED 并置 | 两条静态线 |

`renderAt(shotIdx, ms)` 可以脱离动画循环直接渲染某一时刻，测试靠它断言确定性。

---

## 与 AI 生成的分工

| 镜 | 交给谁 | 理由 |
|---|---|---|
| S03 | **代码** | 要真实代码、红笔、印章的精确位置；AI 生成必然写乱码 |
| S05 | **代码** | 自由落体、三次穿层、盖章时序必须精确 |
| S06 | **代码** | 结构图 AI 必画错 |
| S01 / S02 / S04 / S07 | AI | 氛围向与转场，代码画反而生硬 |

如果确定用制图台方向，另外四镜的提示词要换成 `../campaign/30s-raii/3_逐镜提示词.md` 文末的**方案 B 风格块 + 方案 B 负面清单**——只改正面描述、不改负面词，模型会继续往科技蓝跑。

---

## 操作（两个页面一致）

| 操作 | 说明 |
|---|---|
| 全片 / 单镜 | 切播放模式。全片模式时间轴是 0–30s，跨镜自动衔接 |
| 空格 | 播放 / 暂停 |
| ← → | 逐帧（1/30 秒） |
| 拖时间轴 | 任意定位，画面即时重算 |
| 导出当前帧 | 单帧 PNG，文件名带帧号 |
| 导出整镜序列 | 30fps 全帧导出（浏览器会连续弹下载） |
| 中文标注 / 安全区 / 字幕 | 开关；字幕层是预览用的，正式出片建议后期叠 |

```bash
# 单镜
ffmpeg -framerate 30 -i S05_%04d.png -c:v libx264 -pix_fmt yuv420p -crf 16 s05.mp4

# 全片 900 帧 → 30.000 秒
ffmpeg -framerate 30 -i full_%04d.png -c:v libx264 -pix_fmt yuv420p -crf 16 raii-30s.mp4
```

七镜入轨：S01 0s / S02 4s / S03 8s / S04 12s / S05 16s / S06 22s / S07 26s，收在 30s。v3 是独立实验片，时间轴不接原片。

---

## 导出视频

三条路，从简到精：

| 路 | 怎么做 | 需要什么 | 代价 |
|---|---|---|---|
| **录制** | 点「录制 30s 视频」，等 30 秒，直接得到 `raii-30s.mp4` | Chrome / Edge | 实时录制，期间不能切标签；画质由浏览器编码器决定 |
| **离线渲染**（不打开浏览器） | `node scripts/render-offline.mjs --all --out frames --mp4 raii-30s.mp4` | `@napi-rs/canvas` | 约 5.5 分钟，全自动，可脚本化 |
| **浏览器序列** | 「导出全片 900 帧」→ ffmpeg 合成 | 本地有 ffmpeg | 900 次下载，要人盯着点 |

离线渲染这条路值得单独说：它用 `@napi-rs/canvas` 顶替浏览器 Canvas，把同一份 `shot-renderer.js` 原样跑在 Node 里，**渲染器一行不改**。适合反复重出、接 CI、或者机器上根本开不了浏览器的情况。

```bash
npm i -D @napi-rs/canvas            # 不写进 package.json，按需装
node scripts/render-offline.mjs --frame 18000 --out a.png     # 单帧
node scripts/render-offline.mjs --all --out frames --mp4 out.mp4
```

**它有一个浏览器里不会遇到的坑：字体。** 浏览器画中文时，`monospace` 这类通用族会自动 fallback 到系统中文字体；Skia 不会。所以等宽字体栈里必须显式写出中文字体名，否则「调用来源」这种标签会被画成豆腐块。字体文件放在 `D:\Tools\fonts`，栈的顺序是：

```
F_DISPLAY  "Songti SC","Source Han Serif CN","SimSun","Noto Serif SC",serif
F_MONO     ui-monospace,Consolas,"Courier New","Source Han Serif CN","Songti SC","SimSun",monospace
```

装了思源宋体就用它（有真 700 字重，SimSun 没有，大字号只能伪粗体），没装自动落到 SimSun，浏览器端行为不变。

ffmpeg 已装在 `D:\Tools\ffmpeg\bin` 并进了用户 PATH。**录制最快，离线渲染最稳，浏览器序列最可控**：想立刻看到结果就录制，要重复出片就走离线，要逐帧修再导序列。

录制优先用 `video/mp4;codecs=avc1`（H.264），浏览器不支持 mp4 时会自动退回 webm，文件名跟着变。

录制要点：

- **必须保持页面在前台。** 切到别的标签会让 `requestAnimationFrame` 暂停，录制卡住，20 秒后超时报错。
- 30 秒就是 30 秒，不会快进——它是实时抓流，不是逐帧推流。
- 分辨率固定 1080×1920，码率 16 Mbps。

ffmpeg 自查与重装：

```bash
ffmpeg -version    # 应输出 6.1.1-essentials_build
```

全新机器上装，别用 `npm i ffmpeg-static`——它把 exe 塞进 `node_modules`，安装一旦中断就留下体积异常的半截文件（本仓库真踩过：13MB 的坏包，报「不是有效应用程序」）。改成独立目录：

```bash
# 二进制放 D 盘，与项目解耦；国内走阿里云 CDN，8 秒下完
curl -L -o ffmpeg.exe.gz https://cdn.npmmirror.com/binaries/ffmpeg-static/b6.1.1/ffmpeg-win32-x64.gz
gunzip -c ffmpeg.exe.gz > D:/Tools/ffmpeg/bin/ffmpeg.exe
# 再把 D:\Tools\ffmpeg\bin 加进用户 PATH
```

装好后用一次真实合成自查，别只看 `-version`：

```bash
ffmpeg -framerate 30 -i S05_%04d.png -c:v libx264 -pix_fmt yuv420p -crf 16 -y selfcheck.mp4
ffmpeg -i selfcheck.mp4 2>&1 | grep -E "Duration|Stream #"   # 核对时长、分辨率、编码
```

---

## 想改的参数

**案例 02 制图台**

| 想改什么 | 位置 |
|---|---|
| 纸色、墨色、朱红 | `src/shot-renderer.js` 顶部 `const P = {...}`，同时改 `specs/style-tokens.json` |
| 方格密度 | `drawPaper` 里的 `36`（细格）/ `180`（粗格） |
| 代码内容 | `CODE` 数组 |
| 红章位置/大小 | `stamp(...)` 调用的坐标与 `r` |
| 纸盒大小、落地高度 | `drawS05` 的 `drawPaperBox(...)`、`GROUND` |
| 纸屑数量 | `drawS05` 里的 `N`、`rng(771)` 种子 |
| 结构图栏位 | `drawS06` 的 `LEFT` / `RIGHT` |
| 镜头时长 | 末尾 `SHOTS` 数组的 `dur` |
| 全片总长 | `TOTAL`（默认 30000），改完要同步 `specs/shots.json` 的 `totalSec` |
| 字幕文案 | `SHOTS` 每项的 `sub` 字段 |

**案例 03 示波器**

| 想改什么 | 位置 |
|---|---|
| 玻璃底色、荧光色 | `src/scope-renderer.js` 顶部 `const C = {...}` |
| 波形区、通道基线、振幅 | 布局常量 `L`（`ch2 - ch1` 必须大于 `amp`，否则两条线会穿过） |
| 某镜的波形 | 该镜 `draw` 里的 `events` 数组 |
| 八镜时长 | `SHOTS` 数组的 `dur` |
| 触发点、游标位置 | `drawCursor(c, p, label, color)` 的第二个参数 |
| 辉光强度 | `glowStroke` 里三层描边的线宽与透明度 |

---

## 验证情况（如实）

- `node --check` 两个渲染器语法均通过。
- 逐帧冒烟测试：v2 七镜 **1150 个时间点**、全片 **900 帧连续渲染**、v3 八镜 964 个时间点，全部 0 异常，由 `tests/` 里的断言覆盖。
- **视觉效果未截图核验**——本机无无头浏览器。构图与节奏是按设计写死的，但"好不好看"需要人看一眼。
