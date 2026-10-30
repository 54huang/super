# N13 · Sonic Pi + SuperCollider

| 项 | 内容 |
|---|---|
| 仓库 | [sonic-pi-net/sonic-pi](https://github.com/sonic-pi-net/sonic-pi) · [supercollider/supercollider](https://github.com/supercollider/supercollider) |
| 规模 | ★ 12.2k · ★ 6.8k |
| 许可 | Sonic Pi：**主代码 MIT** · **`etc/samples/` 与 `etc/wavetables/` 全部 CC0** · 文档与示例 CC BY-SA 4.0 · synthdefs MIT（其中 5 个是 GPL-3.0）<br>SuperCollider：**GPL-3.0**（scsynth 核心部分为 GPL-2.0+） |
| 形态 | Sonic Pi：Ruby 写的音乐编程环境（GUI + 语言 + 内置采样）· SuperCollider：声音合成语言与引擎（Sonic Pi 底下那台） |
| 目录（已核对） | Sonic Pi：`app/` `etc/` `bin/` `install/` `packaging/` + `VERSION` `SYNTH_DESIGN.md` 等<br>SuperCollider：`SCClassLibrary/` `HelpSource/` `examples/` `server/` `lang/` `sounds/` `testsuite/` |

## 为什么是节点

**这是本库唯一一份"现成、成套、可商用"的采样库，藏在一个代码仓库里。**

我最初按 `sound effects cc0` 检索 GitHub，结论是"GitHub 上没有好的免费音效库，只有工具"。那个结论对"独立素材仓"是对的，但漏了一类东西：**音效藏在音乐软件的安装包里**。

Sonic Pi 的 `etc/samples/` 就是一整套：鼓（808 / boom / fat / haus）、贝斯、吉他、电音、故障音、环境音、人声切片、`arovane_` 与 `tbd_`（两位音乐人捐的）。格式是 `.flac`，**逐条 CC0 公有领域**，来源清单写在 `etc/samples/README.md` 里（多数来自 freesound.org，每条的原始链接都在）。

**零署名要求、可商用、不用注册、不用点下载按钮**——`git clone` 就有了。这在音效这件事上比什么都实际。

## 它能给你什么

1. **`etc/samples/`**：200 多个 `.flac`。做"纸/木/金属/摩擦/环境底"这些**真实材质声**，先来这里翻，翻不到再去合成（N12）。
2. **`etc/wavetables/`**：全套波形表（来自 Adventure Kid），做合成器音色时用得上。
3. **`etc/synthdefs/`**：内置合成器的定义（MIT，5 个除外）。`SYNTH_DESIGN.md` 讲清了每个合成器的参数——**这是"这个音色由什么构成"最好的参考**。
4. **Sonic Pi 语言本身**：几行写一个 loop（`live_loop`、`sample`、`sleep`）。做"氛围垫音"最快的一档。
5. **SuperCollider 的合成原语**：要摩擦、材质、空间感这类"非音乐性声音设计"，它的粒度比任何音效库都细——因为它是**算法**，不是素材。`HelpSource/` 是它的文档，`examples/` 有可跑例子。

## 怎么落到 9:16 竖屏

- **采样要重采样，不要直接铺**。CC0 的鼓与贝斯是"音乐用"的，直接铺在 60 秒片里会像加了个 loop。做法是：取一个 **瞬态**（前 100–200ms）当落点音，或者把整条降速/降调当氛围底。
- **竖屏片的人声在中间**，所以采样音效要在**左右声道分离**（哪怕是单声道源的假立体声）：落点音偏左、环境音偏右，人声一进来不打架。
- Sonic Pi 的 `sample` 支持 `rate:` / `amp:` / `start:` / `finish:`，做"只取前 80ms"这类切片很方便——这正好是落点音需要的。
- 时长按秒算，不按小节算：`sleep 0.12` 就是 120ms，别引入 BPM 思维（那是做音乐，不是做片子）。

## 取用路径

1. `git clone` Sonic Pi → 只看 `etc/samples/`，别的目录先不管。
2. 读 `etc/samples/README.md`，按类别挑（`bd_` 底鼓、`drum_` 鼓组、`elec_` 电子、`ambi_` 环境、`glitch_` 故障）。
3. 要"这一下的声音"就用 N12 算；要"真实的材质声"就从这里挑。
4. 想自己造非音乐性声音 → 进 SuperCollider 的 `examples/`，别从零学语言。

## 注意

- **Sonic Pi 是分发整体、许可是分层的**：`app/` 是 MIT，但因为它链接了 GPLv3 组件，**分发 GUI 二进制时要遵守 GPL**。你只是拿它的采样，不受影响（采样是 CC0）。
- **SuperCollider 是 GPL-3.0**，只能在它的环境里用，别把它的引擎链进闭源程序。
- 采样是 `.flac`，**浏览器里播放要先转 mp3/wav**（Safari 对 flac 支持不稳）。转一次就好。
- **别把采样复制进仓库**。本库的规矩：只记来源与许可，用时现取（见 `00_起点/需求速查.md` 末节）。
- 采样来源是 freesound，虽然 Sonic Pi 声明了 CC0，**个别条目的原始授权历史上被质疑过**。商用大片里要绝对安全，就挑 `README.md` 里标了明确来源的那批。
