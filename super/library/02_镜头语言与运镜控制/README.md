# 02 · 镜头语言与运镜控制

**收录逻辑**：能回答「这一镜用什么景别、什么机位、怎么动、动多久」的仓库。判断标准是——里面必须有**镜头维度的词表或决策规则**，而不只是画面描述。
**什么时候来**：提示词写出来"画面对，但像 PPT"；或者一条片子里所有镜头都是同一个景别。

| # | 仓库 | ★ | 形态 | 来源与定位 | 具体参考用途 | 节点 |
|---|--:|--:|---|---|---|:--:|
| 5 | [smixs/visual-skills](https://github.com/smixs/visual-skills) | 593 | Skill (md) | 两个 Claude Skill（`video/`、`image/`），把 agent 变成摄制组：按导演、编剧、剪辑师三种视角写提示词，理论底子来自 Murch 的剪辑观 | 一个脚本要拆镜头时的**分工骨架**：谁决定节奏、谁决定画面、谁决定切点 | N04 |
| 6 | [wuwangzhang1216/DirectorSKILL](https://github.com/wuwangzhang1216/DirectorSKILL) | 289 | Skill (md) | `SKILL.md` + `references/` + `evals/`，输出镜头清单（shot list）与关键帧/视频提示词，带 10 位导演风格的覆盖层 | 需要"某种导演味"时，用覆盖层改镜头语言；`evals/` 里的评测样例可以当"合格线"参照 | N05 |
| 7 | [luozhilzh/video-prompt-reverse](https://github.com/luozhilzh/video-prompt-reverse) | 48 | Skill (md) | 纯 Markdown 零代码，把**运动设计**当一等维度：运镜/时序/主体运动/物理连续，另附视频专属负面词库与跨镜一致性锚点 | **运镜与负面词的首选**：想要"动得对"而不是"动得多"，抄它的四维度拆法；负面词表直接拿去用 | N06 |
| 8 | [Rylaispirit/cinematic-video-prompt-skill](https://github.com/Rylaispirit/cinematic-video-prompt-skill) | 164 | 速查表 | 电影感提示词速查：机位角度、运镜、灯光、构图、调色五块 | 当**桌垫速查卡**：写提示词时逐块对一遍，防漏项 | N25 |
| 9 | [CyberJ0605/cinematic-video-prompt-engineer-skill](https://github.com/CyberJ0605/cinematic-video-prompt-engineer-skill) | 134 | Skill (py+md) | 从剧情摘要出发，先诊断故事/情绪/结构，再落到镜头设计 | 剧情片段的"先诊断后写词"流程，适合有台词、有情绪转折的内容 | N27 |
| 10 | [zhouwei713/fpv-immersive-video-prompting](https://github.com/zhouwei713/fpv-immersive-video-prompting) | 94 | Skill (md) | 路线优先（route-first）的 FPV/沉浸式写法，含编号分镜 | 做穿越、俯冲、第一视角开场时，用它的"路径描述法"，比写"快速运动"稳得多 | N26 |
| 11 | [bkingfilm/lapian-notes](https://github.com/bkingfilm/lapian-notes) | 739 | 工具 (TS) | AI 拉片工具：把片子拆成剧情泳道时间轴、结构树、情绪曲线 | **不是提示词库，是练镜头感的地方**：分析对标账号的片子，得出"它每 3 秒切一次、每 8 秒一个转折"这类可量化结论，再反过来定自己的分镜 | - |

---

## 取用顺序

1. 定"这一镜在叙事上要干什么"（N04 的分工视角）。
2. 选景别 + 机位 + 运镜（N05 的镜头清单 / 模板 2 词表），一条只留一个主动作。
3. 逐格对一遍怕漏项（N25 的六册速查与九段式公式），填不动的格回册里查词。
4. 补齐时序与物理连续，加负面词（N06）。
5. 这一镜是"一镜到底/穿越/第一视角"→ 换成路线写法（N26 的八个问题 + 两种路线模式）。
6. 有剧情、有台词、要判断"能拍几秒"→ 先过 N27 的诊断，再回来选运镜。
7. 需要风格化，才加 N05 的导演覆盖层 —— **顺序不能反**，先有镜头再加风格。

## 常见误区

- 把"运镜"写成形容词（"镜头很有张力"）→ 模型无法解析，必须写成可执行动作（"从腰部高度升至俯视"）。
- 一镜叠三个运动（推 + 摇 + 跟）→ 直接崩，拆成三镜。
- 全片同一景别 → 完播率低；竖屏尤其要"特写—中景—全景"交替。
