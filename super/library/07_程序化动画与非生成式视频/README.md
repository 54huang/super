# 07 · 程序化动画与非生成式视频

> 这一层是**不用视频模型**的那一半：用代码/HTML/Canvas/SVG **逐帧画出来**，再用 FFmpeg 合成。
> 特点是**完全可控**（每个像素都由你决定），代价是写实画面做不了。

**收录逻辑**：能"用代码出片"的引擎、Skill、案例库。
**什么时候来**：做知识讲解、数据可视化、字效片、流程图、公式动画、产品发布片；或者 AI 生成怎么调都不对、但画面其实是"图形"而不是"实拍"。

| # | 仓库 | ★ | 形态 | 来源与定位 | 具体参考用途 | 节点 |
|---|--:|--:|---|---|---|:--:|
| 40 | [joeseesun/opus-video-prompts](https://github.com/joeseesun/opus-video-prompts) | 806 | 提示词集 | 18 份完整提示词 + 54 个公开案例 + 9 条技术路线（HTML Canvas / p5.js / Three.js / Remotion / Manim / Blender 脚本），每条附原帖 | **这一层的路线图**：先看它列出的 9 条路线，选定一条再深入；提示词原文可以直接投喂给编码 agent | N21 |
| 41 | [blixvip/html-anime](https://github.com/blixvip/html-anime) | 186 | Skill + 引擎 | 把场景提示词变成 shot sheet，再让编码 agent **用 HTML 把整片画出来**，不需要视频模型；`films/` 有成品、`harness/` 有渲染管线 | 做手绘/线稿/水墨风动画短片时最省事：结构是"提示词 → 分镜表 → 代码"，正好接 04 目录的分镜方法 | N22 |
| 42 | [haidrrrry/claude-remotion-skill](https://github.com/haidrrrry/claude-remotion-skill) | 686 | Skill (TS) | 教 agent 用 Remotion 做专业动态图形、字幕、转场 | 动态图形/字幕动效/数据片的实操入口；比直接写 Remotion 少踩坑 | N23 |
| 43 | [guanmo-ai/awesome-ai-motion](https://github.com/guanmo-ai/awesome-ai-motion) | 457 | 案例集 | 动效、创意视频、交互艺术案例，附源码 + 提示词 + 制作过程 | **找参考最快的一处**：先看成品再决定用哪条技术路线 | N28 |
| 44 | [remotion-dev/remotion](https://github.com/remotion-dev/remotion) | 68.5k | 引擎 (TS) | React 写视频：组件即帧，`packages/` 下是核心与渲染器 | 底层引擎。会 React 就用它，时间轴、字幕、数据绑定都是原生能力 | - |
| 45 | [ManimCommunity/manim](https://github.com/ManimCommunity/manim) | 41.9k | 引擎 (Py) | 数学动画引擎（3Blue1Brown 那套） | 公式推导、几何变换、坐标系动画；`camera.frame` 可以当"虚拟摄影机"做推拉摇移 | - |
| 46 | [motion-canvas/motion-canvas](https://github.com/motion-canvas/motion-canvas) | 19.5k | 引擎 (TS) | 代码驱动的矢量动画，带可视化编辑器 | 流程图、关系图、UI 演示动画；比 Manim 更适合"信息图"类内容 | - |

---

## 三条路线的取舍

先别急着选引擎：**N28 的 1728 个成品**按七个方向编好了索引，先翻一遍"我要的效果长什么样"，再回来对下面这张表选路线——按炫技筛出来的东西放进竖屏会满屏动效，观众抓不住主体。

| 路线 | 适合 | 不适合 | 上手成本 |
|---|---|---|---|
| **HTML + GSAP/SVG**（N22） | 手绘感、字效、版式动画、讲解片 | 三维、写实 | 低（会 HTML 就行） |
| **Remotion**（N23 / remotion） | 动态图形、字幕、数据可视化、模板化量产 | 复杂三维 | 中（要会 React） |
| **Manim**（manim） | 数学/物理/公式、精确几何 | 人物、场景叙事 | 中高（要会 Python + 它的坐标系思维） |

## 关键认知

- 非生成式视频**画面里的一切都要你写**，所以"分镜脚本"的精度要求比 AI 生成更高 —— 04 目录的 JSON 骨架在这里更好用。
- 镜头的推拉摇移在代码里是**变换矩阵/相机参数**，不是自然语言；但 02 目录的镜头语言照样指导"该怎么动"。
- 合成链路通常是：逐帧渲染 → PNG 序列 → FFmpeg 合成 MP4 → 配音/字幕轨道叠加。
- 做竖屏：画布直接设 1080×1920，别用横屏渲染再裁 —— 裁完字号全毁。
