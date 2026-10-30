# 06 · 抖音短剧 / 短视频工作流

**收录逻辑**：不是单个提示词，而是**一条片子从想法到可发**的流水线 —— 钩子、脚本、分镜、提示词、配音、花字、导出、QC。这一层的价值是"顺序"，顺序错了后面全废。
**什么时候来**：要做系列内容（每天一条）；或者单条能出但产能上不去。

| # | 仓库 | ★ | 形态 | 来源与定位 | 具体参考用途 | 节点 |
|---|--:|--:|---|---|---|:--:|
| 32 | [zenstory-ai/drama-skills](https://github.com/zenstory-ai/drama-skills) | 3.5k | 11 个 Skill | 面向编剧/漫剧工作室：一个点子或一部原著 → 分集剧本 → 分镜 → 图片/视频提示词 → 成片，含审查环节 | **短剧/漫剧全链路最完整的一处**：`skills/` 里按环节拆分，可以只用其中一环；`docs/`/`examples/` 有输出样例，先看样例定预期 | N17 |
| 33 | [xianyu110/ecommerce-video-skills](https://github.com/xianyu110/ecommerce-video-skills) | 107 | 13 个 Skill | 一张商品图 → 9:16 带货视频：3 秒钩子、爆款翻拍、卖点分镜、edge-tts 配音、字幕花字、本地 ffmpeg 合成，导出对接抖音/TikTok Shop/视频号/小红书 | **抖音带货最直接的一套**：钩子模板与卖点分镜是现成的；`tools/` 里有本地渲染脚本，不依赖 API key | N18 |
| 34 | [duoduoler-ops/Table-VideoSOP](https://github.com/duoduoler-ops/Table-VideoSOP) | 225 | 模板 (JS) | AI 视频制作的 SOP、规则、模板与提示词的表格化沉淀 | 把"每次都要重新想"的环节压成表格规则：选题→脚本→分镜→提示词→验收，适合做团队规范 | N19 |
| 35 | [jnMetaCode/ai-shortfilm-prompts](https://github.com/jnMetaCode/ai-shortfilm-prompts) | 498 | Skill (py+md) | 想法 → 电影级、可直接投喂模型的视频提示词，含 21 套生成器，适配 Sora/Kling/Veo/Seedance | 想"一句话直出多套备选"时用：多个生成器并跑，挑最好的那条再手改 | N20 |
| 36 | [UnderleveledBuilder/awesome-short-drama-skills](https://github.com/UnderleveledBuilder/awesome-short-drama-skills) | 1.1k | 索引 | 短剧/漫剧技能包精选：剧本、改编、分镜、Seedance/可灵/MiniMax 提示词 | 当"短剧工具地图"：按环节找具体 Skill，再决定装哪个 | - |
| 37 | [suihe1/short-drama-production](https://github.com/suihe1/short-drama-production) | 187 | Skill (JS) | 短剧生产总控：专业导演与分镜、声音资产、粗剪与 QC，默认 16:9 | 需要"总控视角"（谁在什么阶段交付什么）时参考；注意它默认横屏，做竖屏要改画幅约定 | - |
| 38 | [sorker/ai-shotlive](https://github.com/sorker/ai-shotlive) | 346 | 系统 (TS) | 小说/剧本 → 分镜 → 提示词 → 关键帧 → 视频 → AI 剪辑的一站式服务 | 想做"平台化"流水线时的架构参考；单条片子用它反而重 | - |
| 39 | [nutllwhy/seedance-tvc-director](https://github.com/nutllwhy/seedance-tvc-director) | 330 | Skill (md) | 15s/30s 广告片导演技能：分镜、旁白节奏、配音路由 | **时长与镜头配比**最细的一处：15 秒里几个镜头、旁白说几句、哪一秒出产品 | - |

---

## 抖音向的固定流水线（把上面这些仓串起来）

```
选题 → 钩子(3s) → 口播稿 → 按秒切镜 → 逐镜提示词 → 出片 → 配音/花字 → 封面与标题
  ↑        ↑         ↑          ↑            ↑
 N19     N18       N18        N10          N14/05目录
```

1. **钩子先写，画面后配**。前 3 秒决定完播，钩子文案定不下来就别急着生成画面。
2. **口播稿 → SRT → 按时间码切镜**（N10 的方法），这是防"音画不同步"的唯一可靠做法。
3. **逐镜提示词用 05 目录的模型语法**，画面与镜头用 02/03。
4. **配音与花字**在 N18 里有现成方案（edge-tts + 字幕花字 + ffmpeg）。
5. **QC 三查**：首帧是否有信息、字幕是否被 UI 挡、每 8 秒是否有变化。

## 竖屏与横屏的差别（容易踩）

- 短剧仓（N17/N19 部分内容）默认 16:9，直接拿来用会出现"人物被裁半个头"。
- 竖屏的构图逻辑是"上下留白、主体居中偏上"，横屏的"三分法"要改成"纵向分层"。
- 竖屏不要用大远景，远景在手机上等于一片糊。
