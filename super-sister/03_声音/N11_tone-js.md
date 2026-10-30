# N11 · Tone.js

| 项 | 内容 |
|---|---|
| 仓库 | [Tonejs/Tone.js](https://github.com/Tonejs/Tone.js) |
| 规模 | ★ 14.9k · TypeScript · 最近提交 2026-10 |
| 许可 | MIT |
| 形态 | 浏览器音频框架：合成器 + 效果器 + 时间轴 |
| 目录（已核对） | `Tone/`（源码，按模块分目录）· `examples/` `test/` `scripts/` |

## 为什么是节点

因为**在浏览器里排声音，只有它把"时间"这件事做对了**。

网页排声音最常见的错法是 `setTimeout`。`setTimeout` 的精度是几十毫秒且会漂移——排一段 60 秒的片子，误差能累积到半秒，声音和画面对不上。

`Tone.js` 用的是 **AudioContext 的音频时钟**（`Tone.Transport`），精度是采样级，而且它自己处理了"提前调度"（look-ahead）：在 JS 主线程卡顿之前就把未来几百毫秒的音符排进音频线程。**这是唯一可靠的浏览器内音画同步方案。**

## 它能给你什么

1. **`Tone.Transport`**：一根全局时间轴，`start/stop/pause`、`bpm`、`seconds`、`position`。你的渲染器用同一根时间轴，音画天然对齐。
2. **合成器**：`Synth`（振荡器 + 包络）、`FMSynth`、`AMSynth`、`MembraneSynth`（鼓）、`MetalSynth`、`PluckSynth`（拨弦）、`NoiseSynth`。**做"垫音 + 拨弦 + 低频轰"这一套够用了**。
3. **采样器**：`Sampler`（按音高映射采样，配 N13 的 CC0 采样或 N15 的音色）。
4. **效果器**：`Reverb` `Delay` `Chorus` `Distortion` `Compressor` `Limiter` `EQ3`。**`Compressor` + `Limiter` 是"垫乐不盖人声"的关键**（见下）。
5. **调度**：`Sequence`（循环序列）、`Part`（按时间码排）、`Loop`。
6. **`examples/`**：每个特性一个例子，比读文档快。

## 怎么落到 9:16 竖屏

- **人声轨不进 Tone，走 HTMLAudioElement 或 `<audio>`**，然后用 `Tone.Transport` 对齐它的 `currentTime`。Tone 管配乐与音效，人声单独一条，混在 `Tone.Destination` 前面加一个 `Gain`。
- **垫乐必须比人声低 12dB 以上**。做法：给垫乐一个 `Gain`，再挂一个 `Compressor`（阈值 −20dB、比率 3:1），让人声一进来垫乐自动让路——这比静态音量好用。
- 落点音用 `Tone.now()` 触发（立刻响），不要排进 Transport——落点音的意义就是"这一帧"，排进时间轴反而可能晚一点。
- 逐帧出片时**不要用 Tone**（它是浏览器运行时）。出片走离线合成（见 N12），Tone 只用于"在网页里预览"或"现场播放的视频"。

## 取用路径

1. 先跑 `examples/` 里的 transport 那个，确认时间轴能驱动你的画面。
2. 搭三层：垫音（长音 + Reverb）→ 拨弦（PluckSynth，稀疏）→ 落点（NoiseSynth 短促）。
3. 挂 `Compressor` 收尾，再 `toDestination()`。
4. 把这里的参数（BPM、和弦、包络）记下来，出片时用离线合成重现同一套。

## 注意

- **浏览器自动播放策略**：AudioContext 必须在用户手势（点击）后 `resume()`，否则静音。这不是 bug，绕不过去。
- 它是 **Web Audio 的封装**，纯低频正弦垫乐如果只做峰值归一，音量会失控——**要按 RMS 归一**，这是本库反复强调的那条。
- MIT，商用无碍。
- 它不给你音效素材，只给你造声音的能力。素材见 N13。
