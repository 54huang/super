# 01 · 通用提示词总库

**收录逻辑**：跨模型、跨题材的提示词集合，特点是「一条提示词配一条真实出片」，能直接对照效果挑，不用赌。
**什么时候来**：手上没有任何提示词、需要 5 分钟内出一条能发的东西；或者要给团队一份"什么题材该写什么"的参照。

| # | 仓库 | ★ | 形态 | 来源与定位 | 具体参考用途 | 节点 |
|---|--:|--:|---|---|---|:--:|
| 1 | [ai-boost/awesome-image-video-prompts](https://github.com/ai-boost/awesome-image-video-prompts) | 3.4k | Python + md | 2023 年起持续维护的多模型提示词库，`prompts/` 存提示词、`recipes/` 存组合配方、`previews/` 存成片预览 | 每写一个新题材，先在这里找同类的"提示词→成片"配对，确认哪种措辞真的有效；`recipes/` 可以当"多镜头组合"的模板 | N01 |
| 2 | [songguoxs/awesome-video-prompts](https://github.com/songguoxs/awesome-video-prompts) | 591 | 纯 md | 50 个中文案例，覆盖 Veo3/3.1、即梦、可灵、海螺、豆包，每条带视频 | 找中文语境的写法（"中国女性介绍音箱产品""PS5 控制器组装"），适合带货与产品演示类的镜头参考 | N02 |
| 3 | [cclank/lanshu-awesome-ai-video-kit](https://github.com/cclank/lanshu-awesome-ai-video-kit) | 436 | md + HTML | 企业项目里逼出来的工具包：`prompts/` 604 条、`methodology/` 14 篇方法论、`skills/` 7 个 Skill、`viewer.html` 本地浏览 | **换模型时最省事的一处**：22 个模型的语法差异集中对比；`methodology/` 适合当团队内部写作规范的底稿 | N03 |
| 4 | [geekjourneyx/awesome-ai-video-prompts](https://github.com/geekjourneyx/awesome-ai-video-prompts) | 87 | 索引型 | 官方指南 + 模板 + 电影感资源的链接集合 | 当"资源地图"用：想找某个模型的官方提示词文档时，从这里跳 | - |

---

## 取用顺序

1. 先在 **N01** 找题材相近的提示词 → 复制 → 只换主体。
2. 中文语境 / 国内平台，看 **N02**；需要覆盖多模型，用 **N03** 对比语法。
3. 觉得"能用但不够好"时，别在这层继续改，去 02 补镜头、去 03 补质感。

## 与其他目录的边界

- 本目录只解决"**说什么**"，不解决"**怎么拍**"（那是 02）和"**看起来贵不贵**"（那是 03）。
- 模型专属语法（Seedance/Sora/Veo/海螺）的深度写法在 **05**，这里只做通用层。
