# specs · 契约层

三个文件，都是**机器可读的事实**。判断与解释不在这里（在 `docs/decisions/`）。

| 文件 | 是什么 | 谁在用 |
|---|---|---|
| `shots.json` | 一条片子的分镜事实：时间码、时长、景别、字幕、生产方式 | `tests/storyboard.test.mjs`、渲染器对齐、后期剪辑 |
| `shots.schema.json` | 上面那个文件的 JSON Schema（draft-07），规定字段与取值域 | 编辑器提示、未来接入 ajv |
| `style-tokens.json` | 美术方向的事实：色值、层序、字号、缓动、固定种子、渲染契约 | `tests/tokens.test.mjs`、`renderer/src/shot-renderer.js` |

## 一条规则

> **事实进 specs，判断进 docs。**

- 「S05 是 6 秒」是事实 → `shots.json`
- 「为什么 S05 交给代码渲染」是判断 → `ADR-003`
- 「朱红是 #BE3A2B」是事实 → `style-tokens.json`
- 「为什么从深空蓝改成制图台」是判断 → `ADR-004`

这样分的好处：事实可以被断言（测试会失败），判断只能被解释（人能看懂）。两者混在一起时，事实会被观点淹没。

## 与实现的约束关系

```
style-tokens.json  ──(色值必须出现在源码)──►  shot-renderer.js
shots.json         ──(时长必须一致)────────►  SHOTS 数组
```

违反时 `npm test` 变红。这是防止"改了代码没改文档"或反之的唯一可靠手段。

## 加一条新片子

1. 复制 `shots.json` 为 `<project>.shots.json`；
2. 填 `format` 与 `shots`（时长必须落在 `durationBuckets` 内）；
3. 把测试里的 spec 路径参数化（当前硬编码为 `shots.json`，见 `ARCHITECTURE.md` 的架构债）。
