# Seedance / 即梦 专用

字节系模型，国内可直连，是做竖屏短视频最常用的一档。写法上偏"结构化叙述"：**主体 → 动作 → 环境 → 镜头 → 风格 → 限制**，顺序稳定时出片更稳。

| 仓库 | ★ | 来源与定位 | 具体参考用途 | 节点 |
|---|--:|---|---|:--:|
| [ZeroLu/awesome-seedance](https://github.com/ZeroLu/awesome-seedance) | 2.8k | 社区维护的 Seedance 2.0 提示词与资源，`prompts/` 存提示词、`videos/` 存成片、多语言 README | 首选对照库：同一条提示词能看到成片，判断"这句到底有没有用" | N13 |
| [huangbai-AI/sd-2-5-prompt](https://github.com/huangbai-AI/sd-2-5-prompt) | 209 | 五段式方法论 + 15 个真实案例（`skills/sd-2-5-prompt/references/examples.md`） | **骨架优先看这个**：五段式填完基本不会漏项 | N14 |
| [liangdabiao/make-prompt-seedance2](https://github.com/liangdabiao/make-prompt-seedance2) | 741 | 结构化提示语与通用 Skill，主打"把话说清楚" | 口语需求容易写得含糊时，用它做一次结构化改写 | - |
| [LearnPrompt/awesome-seedance](https://github.com/LearnPrompt/awesome-seedance) | 2.3k | 840+ 案例、490+ 跨模型复测，每条溯源到原帖 | 想验证"同一个提示词在别的模型上还成立吗"时查它的复测记录 | - |

## 建议组合

**N14 定结构 → N13 找同类参考 → 04 目录切镜 → 03 目录压质感。**

即梦/Seedance 做竖屏时特别注意：
- 单条提示词别超过一个完整句群，超过就拆镜；
- "限制"段写在最后，包含画幅、留白、禁文字；
- 需要连续性时，把人物描述固定成字符串逐镜复用（不要换同义词）。
