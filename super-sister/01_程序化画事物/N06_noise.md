# N06 · FastNoiseLite + simplex-noise.js

| 项 | 内容 |
|---|---|
| 仓库 | [Auburn/FastNoiseLite](https://github.com/Auburn/FastNoiseLite) · [jwagner/simplex-noise.js](https://github.com/jwagner/simplex-noise.js) |
| 规模 | ★ 3.5k（C/C++/C#/GLSL/HLSL/JS/Rust/Java/Python… 15 语言同构） · ★ 1.9k（JS/TS） |
| 许可 | 两个都 MIT |
| 形态 | 单文件噪声库（FastNoiseLite 每语言一个文件）· npm 包 + 单文件（simplex-noise） |
| 目录（已核对） | FastNoiseLite：`C/` `Cpp/` `CSharp/` `GLSL/` `HLSL/` `JavaScript/` `Rust/` `Java/` `Haxe/` `Odin/` `Zig/` `Fortran/` `GML/` `Pascal/` `PowerShell/` `WebPreviewApp/` · simplex-noise：`simplex-noise.js` `alea.md` `index.d.ts` `perf/` `test/` |

## 为什么是节点

因为**所有"有机形状"都要它，而它只有几十行**。

山、云、烟、水、木纹、石头的边缘、布料的皱——这些东西的共同点是"不规则但连续"：不能是直线，也不能是每帧乱跳。噪声函数就是"可复现的随机连续场"。

两个仓放在一个节点里，是因为它们解决**同一个问题的两半**：

- **FastNoiseLite 解决"跨语言一致"**：同一套 OpenSimplex2 / Perlin / Value / Cellular 参数，在 15 种语言里逐行对应。你可以在 JS 里调好参数，把同样的数字搬进 GLSL 着色器或 C++ 渲染器，**形状完全一样**。这是做"预览和成片必须一致"的唯一可靠办法。
- **simplex-noise.js 解决"同种子同结果"**：它的 `alea.md` 讲清了怎么用一个可播种的 PRNG 替代 `Math.random()`。**逐帧渲染 1800 帧时，第 900 帧的随机数必须每次一样**，否则重渲就和音轨对不上。

## 它能给你什么

1. **三种场**：`OpenSimplex2`（最自然的有机形）、`Perlin`（经典，有明显的方格感）、`Cellular`（细胞/龟裂纹，做石头与鳞片）。选错场是最常见的"看着怪但说不出哪怪"。
2. **分形叠加（Fractal）**：`FBm`（一层层加，出云雾）、`Ridged`（脊线，出山脉与闪电）、`PingPong`（回声状，出涟漪）、`DomainWarp`（把坐标本身扰动，出"被风撕开的烟"）。
   **烟与水几乎都靠 DomainWarp**，不是靠加更多层。
3. **`seed` 一个整数锁一切**。参数表里所有"随机"都由它派生。
4. **`simplex-noise` 的 4D 版本**：把**时间当第四维**。于是"烟在飘"不需要每帧重算，而是同一个 4D 场沿 w 轴前进一步——**逐帧之间是连续的**，不会跳。这是做长时间流体感最省事的办法。

## 怎么落到 9:16 竖屏

- **噪声频率必须按画布尺寸归一**。同一个 `frequency`，1080 宽和 1920 宽完全不是一个密度。写成 `frequency = k / 画布宽度`。
- **竖屏的"竖向拉伸"要抵掉**：1080×1920 不是方的，直接用二维噪声会得到横向被压扁的纹理。做法是把 y 坐标乘 `1080/1920` 再喂进去。
- 做烟/雾时**别用噪声直接当 alpha**，用噪声调制"每层的偏移量"——层数固定（3 层就够），每层的偏移由噪声驱动。这样轮廓是硬的、内部是动的，正是烟该有的样子。
- 竖屏上噪声的**细节尺度要放大**：手机屏小、观看距离近，高频噪声会变成脏点。

## 取用路径

1. 先定"这东西的不规则来自哪"：轮廓（→ 调噪声）、内部（→ 调噪声当位移）、还是不规律（→ 调噪声当密度）。
2. 选场：自然物 OpenSimplex2，龟裂/石头 Cellular，云与烟 OpenSimplex2 + DomainWarp。
3. 固定种子 → 渲染两帧对比 → 确认是连续演化不是跳变。
4. 要搬进着色器就把 FastNoiseLite 的 `GLSL/` 那份直接拿，参数照抄。

## 注意

- **不要用 `Math.random()`**。它不可播种，逐帧渲染必然对不上。这是这一层唯一会致命的错。
- FastNoiseLite 各语言实现是**人工同步**的，偶尔有版本差；跨语言时先跑一个基准图对比。
- 噪声不是"越多越好"。三个八度（octave）通常够，五个以上只是在烧 CPU。
