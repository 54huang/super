# 05 · 单模型专用库

**收录逻辑**：同一个意图（"黄昏，女孩回头"）在不同模型里要换写法。这一层只放**模型原生语法**的库，换模型时只需要重写这一层，01–04 层的结构不动。
**什么时候来**：提示词在 A 模型好用、换到 B 就崩；或者想用某个模型但不知道怎么"说它的话"。

```
05_单模型专用库/
├── Seedance/        （4 仓 · 2 节点）
│   ├── N13_awesome-seedance.md
│   └── N14_sd-2-5-prompt.md
├── Sora/            （2 仓 · 1 节点）
│   └── N15_sora-prompt-zh.md
├── Veo/             （1 仓 · 0 节点）
├── Kling与海螺/     （1 仓 · 1 节点）
│   └── N16_awesome-MiniMax-H3-cases.md
└── Grok/            （1 仓 · 0 节点）
```

## 总览

| 模型 | 仓库 | ★ | 参考用途 | 节点 |
|---|---|--:|---|:--:|
| Seedance / 即梦 | [ZeroLu/awesome-seedance](https://github.com/ZeroLu/awesome-seedance) | 2.8k | 提示词 + 可播放成片对照，质量最高的一处 | N13 |
| Seedance 2.5 | [huangbai-AI/sd-2-5-prompt](https://github.com/huangbai-AI/sd-2-5-prompt) | 209 | 五段式（主体/风格/时间线/BGM/限制）骨架 | N14 |
| Seedance 2.0 | [liangdabiao/make-prompt-seedance2](https://github.com/liangdabiao/make-prompt-seedance2) | 741 | 把口语需求结构化，减少语义歧义 | - |
| Seedance | [LearnPrompt/awesome-seedance](https://github.com/LearnPrompt/awesome-seedance) | 2.3k | 840+ 案例，每条可溯源到原帖，适合查"这个效果别人怎么写的" | - |
| Sora 2 | [zhangchenchen/awesome_sora2_prompt](https://github.com/zhangchenchen/awesome_sora2_prompt) | 221 | Sora 2 提示词合集，中文场景多 | - |
| Sora | [SoraEase/sora-prompt-zh](https://github.com/SoraEase/sora-prompt-zh) | 129 | 中文表达与"调教"话术，适合短视频场景 | N15 |
| Veo 3 | [liu-kaining/Awesome-Veo3-Prompts](https://github.com/liu-kaining/Awesome-Veo3-Prompts) | 75 | 31 条创意场景，含音频/对白写法 | - |
| 海螺 MiniMax H3 | [SkyNotSilent/awesome-MiniMax-H3-cases](https://github.com/SkyNotSilent/awesome-MiniMax-H3-cases) | 215 | 2801 个可播案例 + 731 条完整提示词 | N16 |
| Grok Imagine | [YouMind-OpenLab/awesome-grok-imagine-prompts](https://github.com/YouMind-OpenLab/awesome-grok-imagine-prompts) | 57 | 电影/动作/动漫/产品/梗图风格 | - |

## 怎么用这一层（换模型的标准动作）

1. 在 01–04 写好**与模型无关的内容**：镜头、动作、光线、约束。
2. 到对应子目录找 2-3 条"同题材"的原生写法。
3. 只替换**语法外壳**：参数顺序、时长单位、负面字段的位置、是否支持首尾帧。
4. 保留自己的画面内容，别整段照抄 —— 抄结构，不抄主体。

## 语法差异速记（跨仓归纳，具体以各仓最新为准）

- **时长**：多数平台按 4/6/8/10 秒档位，部分支持首尾帧插值，写"5.5 秒"通常会被吸到 6 秒。
- **负面词**：有的平台有独立字段，有的只能写在正文末尾 —— 有的（如 Seedance 系）倾向把"不要什么"写在**段落末尾**而不是塞进描述中间。
- **首帧**：支持"图生视频"的模型，首帧提示词要单独写一段"静帧描述"，别和运动描述混一起。
- **音频**：Veo 系支持对白与环境音，写法是独立段落（谁在说、说什么、背景什么声），不要塞进画面描述。
