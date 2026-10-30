// 测试环境：为浏览器端渲染器提供一个最小的 canvas 2D 桩
// 目的不是画对，而是让「所有绘制调用」在 Node 里能跑通并留下可断言的记录。
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

export const ROOT = path.resolve(import.meta.dirname, '..');

/* opts.args = true 时记录完整参数（用 | 分隔，避免文本里的逗号切错），
 * 用来断言"画到哪儿去了"；默认只记方法名，够 v2/v3 的确定性比对用。 */
export function makeCtx(log = [], opts = {}) {
  const store = {};
  const record = (name) => (...args) => {
    if (opts.args) {
      log.push(name + '(' + args.map(a =>
        typeof a === 'number' ? Math.round(a)
          : typeof a === 'string' ? a
            : '').join('|') + ')');
      return;
    }
    log.push(name + (typeof args[0] === 'string' ? ':' + args[0] : ''));
  };
  return new Proxy(store, {
    get(target, prop) {
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return (...args) => { log.push('grad:' + args.length); return { addColorStop: record('addColorStop') }; };
      }
      if (prop === 'createPattern') return () => { log.push('pattern'); return {}; };
      if (prop === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
      if (prop === 'measureText') return (s) => {
        // 按当前字号估算宽度：中文全角≈1em，ASCII≈0.55em。
        // 之前一律返回 length*12，字号 132 的标题会被低估十倍，
        // 导致"文字有没有超出板面"这类断言形同虚设。
        const size = parseFloat(String(target.font || '16px'));
        const px = isFinite(size) ? size : 16;
        let w = 0;
        for (const ch of String(s)) w += ch.charCodeAt(0) > 0x2E80 ? px : px * 0.55;
        return { width: w };
      };
      if (prop in target) return target[prop];
      target[prop] = record(prop);
      return target[prop];
    },
    set(target, prop, value) { target[prop] = value; return true; }
  });
}

// 通用加载器：在 Node 里运行 IIFE 版渲染器，返回它挂在 window 上的 API。
// relPath 相对仓库根，globalName 是 window 上的属性名。
export function loadScript(relPath, globalName, log = [], opts = {}) {
  const ctx = makeCtx(log, opts);
  const canvas = {
    width: 0, height: 0,
    getContext: () => ctx,
    toDataURL: () => 'data:image/png;base64,'
  };

  const sandbox = {
    window: {},
    document: {
      createElement: (tag) => tag === 'canvas'
        ? { width: 0, height: 0, getContext: () => makeCtx(log, opts) }
        : { click() {}, set download(v) {}, set href(v) {} }
    },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    setTimeout,
    console
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);

  const code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  vm.runInContext(code, sandbox, { filename: path.basename(relPath) });

  const R = sandbox[globalName];
  if (!R) throw new Error(relPath + ' 没有导出 window.' + globalName);
  R.init(canvas);
  return R;
}

// v2「制图台」渲染器
export function loadRenderer(log = []) {
  return loadScript('renderer/src/shot-renderer.js', 'Renderer', log);
}

// v3「示波器」渲染器
export function loadScope(log = []) {
  return loadScript('renderer/src/scope-renderer.js', 'Scope', log);
}

// v4「黑板粉笔」渲染器
export function loadBoard(log = [], opts = {}) {
  return loadScript('renderer/src/board-renderer.js', 'Board', log, opts);
}
