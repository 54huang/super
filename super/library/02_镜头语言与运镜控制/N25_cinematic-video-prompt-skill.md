# N25 · cinematic-video-prompt-skill（电影词汇速查卡）

| 项 | 内容 |
|---|---|
| 仓库 | [Rylaispirit/cinematic-video-prompt-skill](https://github.com/Rylaispirit/cinematic-video-prompt-skill) |
| 规模 | ★ 164 · Markdown · 最近提交 2026-09-27 |
| 形态 | Skill + 速查表：700+ 术语分六册，外加一个九段式拼装公式 |
| 目录 | `SKILL.md`、`references/01-camera-angles-and-movement.md` … `06-materials-weather-pose.md`、`examples/`、`bonus-skills/` |

## 为什么是节点

它把"电影感"拆成六个**可勾选的维度**：机位角度、运镜、灯光、构图、镜头技术、风格色彩。写提示词时逐册对一遍，漏项就补——这是**防漏清单**，不是灵感来源。N04/N05 给你分工和导演味，这一份给你的是"这一镜到底该写哪些字段"。

## 它能给你什么

1. **角度与运镜**（`references/01`）：70+ 角度与景别、60+ 运镜（dolly / arc / crane / FPV / dolly zoom / bullet time），每条都带"什么时候用"。
2. **灯光**（`references/02`）：80+ 术语，从 golden hour、rim light 到 chiaroscuro、practical、neon。
3. **构图**（`references/03`）：80+ 规则，含 leading lines、S-curve、negative space、repoussoir 这类中文语境里常被含糊带过的词。
4. **镜头与胶片**（`references/04`）：焦段、光圈、快门、景深、眩光、滤镜、画幅比——想控制"看起来像什么机器拍的"就查这一册。
5. **九段式公式**：`[景别+角度] [主体] [动作] [环境+天气] [光线] [运镜] [风格+色彩] [情绪] [技术]`。比五段式多出"光线"和"情绪"两格，正好补住竖屏最容易空的两项。

## 抖音 9:16 用法

- 竖屏第一格写 `vertical 9:16, medium close-up`——景别要在开头就锁，否则模型按横幅逻辑给全身，人就被裁掉半张脸。
- 它内置的四条硬规则直接可用：**一镜只写一个运镜、一镜只写一个主动作、光线要跟天气/时间一致、风格-色彩-情绪三者要指向同一个方向**。
- 竖屏别用 `wide establishing shot` 开局：留白全在两侧，主体被压成一条。换成 `low angle, subject fills lower two-thirds`。

## 取用路径

1. 读 `SKILL.md` 第 2 节拿公式，用它当填空表。
2. 填不动的那一格，去对应的 `references/0x` 册里查词，别自己造。
3. 要成套模板时看 `examples/`（按视频类型分的工作示例）。
4. 需要人物跨镜一致：`bonus-skills/character-sheet-lite/` 出的是"三视角全身 + 近景"一张图的人物设定表。

## 注意

- **术语是英文、解释是越南语**。词可以直接抄进提示词，但解释得自己过一遍；中文用户实际用法是"只取词、不取解释"。
- `bonus-skills/` 里是 Lite 版，完整版要联系作者拿——别把它当成免费全量库。
- 它给的是**词汇与清单**，不给叙事结构。要"讲一个故事"仍得回 04 目录。
