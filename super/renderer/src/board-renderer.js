/* v4「黑板粉笔」—— 8 镜 · 1080×1920 · 30fps · 确定性逐帧
 *
 * 为什么是黑板，不是第四种"版面"：
 *   v1 深空蓝是发光，v2 制图台是纸面，v3 示波器是仪器。
 *   前三种介质都是「印好了就不动」——纸上的字、屏幕上的波形，
 *   一旦画上去就只是被观看的对象。
 *   粉笔不是。板书的本质是「边写边推」：先写一句，看着不对劲，
 *   划掉，在旁边重写。每一笔有先后，划掉的动作和写下的动作同等重要。
 *   RAII 恰好是这样一条推导链：写下裸指针 → 发现异常时没人收尾 →
 *   划掉 → 改成栈对象 → 箭头指回资源。这个过程本身就是论证。
 *   所以这一版的动词是「写」和「划」，不是「排」和「测」。
 *
 * 粉笔质感怎么做：
 *   核心是「笔芯由短划痕拼成」，不是一条实线。短划痕段长 5–11px、
 *   间隔 1–3px、粗细与透明度各自抖动，叠出来天然断续、有颗粒。
 *   外缘再撒一层更淡的短划痕当粉笔灰。全部抖动来自固定种子的
 *   mulberry32，同一 t 必产同一帧，导出序列不会闪。
 *   刻意不用 destination-out 做"断续"——那会在导出 PNG 时留下透明像素。
 *   也刻意不用 shadowBlur，那是软件高斯核，成本随面积×核半径爆。
 *
 * 字体：楷体是系统自带的手写体，有笔锋顿挫，最接近板书。
 *   宋体是印刷体（横细竖粗带三角衬线），写在黑板上会很假，所以排后面。
 *   栈里同时写英文名 KaiTi 和中文名 楷体：浏览器认中文族名，
 *   Skia（Node 端离线渲染）只认英文名，两端都能命中。
 *   代码栈必须显式补中文字体——Skia 不做 monospace 的隐式 CJK fallback，
 *   只靠通用族会把中文注释画成一排豆腐块。v2、v3 都踩过这个坑。
 */
(function () {
  'use strict';

  const W = 1080, H = 1920, FPS = 30;
  const SHOT_MS = 4000;

  /* ---------------- 配色 ---------------- */
  const C = {
    board0: '#25332C', boardBase: '#1E2B25', board1: '#16211C',
    frame0: '#5C4634', frame1: '#2E2018', frameEdge: '#1A120C',
    chalk: '#EDEAE0',
    yellow: '#E8D48A',
    pink: '#E89E9E',
    blue: '#9BC0DC',
    green: '#A9C89C',
    dust: '#93A398'
  };

  const F_CHALK = '"KaiTi","Kaiti SC","STKaiti","楷体","Source Han Serif CN","Noto Serif SC","SimSun",serif';
  const F_CODE = 'ui-monospace,Consolas,"Courier New","KaiTi","SimSun",monospace';

  /* ---------------- 版面 ----------------
   * 竖屏 1920 高，内容只在 300–1700 之间，所以垂直节奏必须排满：
   *   标题带 560–800 · 主体带 850–1450 · 落款带 1480–1700
   * 空着不是"留白"，在 4 秒的镜头里读起来就是没写完。
   */
  const L = {
    frame: 52,          // 木框宽
    x0: 104, x1: 976,   // 内容左右界
    yTop: 300,
    yBot: 1700,
    tray: 1752,         // 粉笔槽上沿
    titleY: 610,        // 标题基线
    subY: 716,          // 副标题基线
    ruleY: 786          // 标题下的分区线
  };

  /* ---------------- 工具 ---------------- */
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const seg = (t, a, b) => clamp01((t - a) / (b - a));
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function hexA(hex, a) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  /* ---------------- 预生成：板面脏污与木纹 ----------------
   * 模块加载时算一次，用固定种子。不放在 render 里，
   * 否则每帧重算几百个随机数，导出 900 帧会明显拖慢。
   */
  const SMUDGE = (() => {
    const rnd = mulberry32(0xB0A2D);
    const a = [];
    for (let i = 0; i < 96; i++) {
      a.push({
        x: rnd() * W, y: rnd() * H,
        w: 130 + rnd() * 430, h: 9 + rnd() * 36,
        al: 0.030 + rnd() * 0.072
      });
    }
    return a;
  })();

  const DUST = (() => {
    const rnd = mulberry32(0xD057);
    const a = [];
    for (let i = 0; i < 360; i++) {
      a.push({ x: rnd() * W, y: rnd() * H, r: 0.6 + rnd() * 1.9, al: 0.03 + rnd() * 0.08 });
    }
    return a;
  })();

  /* ---------------- 粉笔笔触 ---------------- */

  // Catmull-Rom 加密采样：点列太疏时沿线取的是折线，会露出电脑线的尖角。
  // 加密后按弧长撒划痕，曲线才是弧。
  function densify(pts, per) {
    if (pts.length < 2) return pts.slice();
    const n = pts.length;
    const P = i => pts[i < 0 ? 0 : i >= n ? n - 1 : i];
    const out = [];
    for (let i = 0; i < n - 1; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      for (let k = 0; k < per; k++) {
        const t = k / per, t2 = t * t, t3 = t2 * t;
        out.push([
          0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
        ]);
      }
    }
    out.push(pts[n - 1]);
    return out;
  }

  function arclen(pts) {
    const segs = [];
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      segs.push(d); total += d;
    }
    const at = function (s) {
      let acc = 0, i = 0;
      while (i < segs.length - 1 && acc + segs[i] < s) { acc += segs[i]; i++; }
      const u = segs[i] ? clamp01((s - acc) / segs[i]) : 0;
      const p = pts[i], q = pts[i + 1] || p;
      return [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];
    };
    at.total = total;
    return at;
  }

  /* 粉笔线：pts 是控制点列，内部加密后按弧长撒短划痕。
   * o = { color, w, alpha, seed, reveal }  reveal 0–1 控制画到哪（书写过程）。 */
  function chalkStroke(c, pts, o) {
    const color = o.color || C.chalk;
    const w = o.w == null ? 3 : o.w;
    const alpha = o.alpha == null ? 1 : o.alpha;
    const reveal = o.reveal == null ? 1 : clamp01(o.reveal);
    if (alpha <= 0 || reveal <= 0 || pts.length < 2) return;

    const dense = densify(pts, 10);
    const at = arclen(dense);
    const total = at.total * reveal;
    if (total < 0.5) return;

    const rnd = mulberry32(o.seed || 17);

    c.save();
    c.lineCap = 'round';
    c.lineJoin = 'round';

    // 1) 底子：一条连贯的淡线，防止断得太碎。
    //    只用它保证"连贯感"，透明度压到很低，看不出是描边。
    c.strokeStyle = hexA(color, alpha * 0.13);
    c.lineWidth = w * 1.2;
    c.beginPath();
    c.moveTo(dense[0][0], dense[0][1]);
    const step = Math.max(1, Math.floor(dense.length / 60));
    for (let i = step; i < dense.length; i += step) c.lineTo(dense[i][0], dense[i][1]);
    c.lineTo(dense[dense.length - 1][0], dense[dense.length - 1][1]);
    c.stroke();

    // 2) 笔芯：短划痕拼成，段长/间隔/粗细/透明度各自抖动 —— 粉笔的颗粒就来自这里
    let s = 0;
    while (s < total) {
      const len = 5 + rnd() * 6;
      const gap = 0.6 + rnd() * 2.2;
      const a = at(Math.min(total, s));
      const b = at(Math.min(total, s + len));
      const dx = (rnd() - 0.5) * 1.5, dy = (rnd() - 0.5) * 1.5;
      c.strokeStyle = hexA(color, alpha * (0.36 + rnd() * 0.30));
      c.lineWidth = Math.max(0.85, w * (0.55 + rnd() * 0.75));
      c.beginPath();
      c.moveTo(a[0] + dx, a[1] + dy);
      c.lineTo(b[0] + dx, b[1] + dy);
      c.stroke();
      s += len + gap;
    }

    // 3) 外缘粉笔灰：更淡的短划痕，离笔芯 2–6px，不压在笔芯上
    const n = Math.max(3, Math.round(total / 10));
    for (let k = 0; k < n; k++) {
      const p = at(total * (k + rnd() * 0.9) / n);
      const ox = (rnd() - 0.5) * (w + 7), oy = (rnd() - 0.5) * (w + 7);
      const len = 0.8 + rnd() * 2.3, ang = rnd() * Math.PI;
      c.strokeStyle = hexA(color, alpha * (0.07 + rnd() * 0.15));
      c.lineWidth = 0.5 + rnd() * 0.7;
      c.beginPath();
      c.moveTo(p[0] + ox, p[1] + oy);
      c.lineTo(p[0] + ox + Math.cos(ang) * len, p[1] + oy + Math.sin(ang) * len);
      c.stroke();
    }
    c.restore();
  }

  // 手绘方框：四条边各自略微不直，起笔收笔略出头
  function handBox(c, x, y, w, h, o) {
    const ov = o.overshoot == null ? 5 : o.overshoot;
    chalkStroke(c, [
      [x - ov, y + 1], [x + w * 0.5, y - 1], [x + w + ov, y + 2]
    ], Object.assign({}, o, { seed: (o.seed || 1) + 1 }));
    chalkStroke(c, [
      [x + w + 1, y - ov], [x + w + 2, y + h * 0.55], [x + w - 1, y + h + ov]
    ], Object.assign({}, o, { seed: (o.seed || 1) + 2 }));
    chalkStroke(c, [
      [x + w + ov, y + h], [x + w * 0.45, y + h + 2], [x - ov, y + h - 1]
    ], Object.assign({}, o, { seed: (o.seed || 1) + 3 }));
    chalkStroke(c, [
      [x - 1, y + h + ov], [x - 2, y + h * 0.45], [x + 1, y - ov]
    ], Object.assign({}, o, { seed: (o.seed || 1) + 4 }));
  }

  // 手绘椭圆：一圈不闭合的弧，起笔收笔略交叠
  function handEllipse(c, cx, cy, rx, ry, o) {
    const pts = [];
    const a0 = -0.35;
    for (let a = a0; a <= Math.PI * 2 + a0 + 0.24; a += Math.PI / 9) {
      const wob = 1 + 0.026 * Math.sin(a * 3.1);
      pts.push([cx + Math.cos(a) * rx * wob, cy + Math.sin(a) * ry * wob]);
    }
    chalkStroke(c, pts, o);
  }

  // 手绘左大括号。hook 是上下两端的钩长，tick 是中间拐弯前的直段——
  // 都调得比等宽字体里的 { 更大，否则在竖屏上会瘦成一根线，包不住内容。
  function handBrace(c, x, yTop, yBot, o) {
    const mid = (yTop + yBot) / 2;
    const tick = 26, hook = 40;
    chalkStroke(c, [
      [x + hook, yTop],
      [x + 14, yTop + 3], [x + 3, yTop + tick],
      [x + 3, mid - tick], [x - 3, mid - 6], [x - 16, mid],
      [x - 3, mid + 6], [x + 3, mid + tick],
      [x + 3, yBot - tick], [x + 14, yBot - 3], [x + hook, yBot]
    ], o);
  }

  /* ---------------- 粉笔字 ---------------- */

  /* 单段文字。叠印次数按字号定：大字叠 3 层出毛边，小字叠 2 层就够。
   * 叠印是粉笔字的关键——单次 fillText 边缘太干净，像印刷不像手写。 */
  function chalkText(c, text, x, y, o) {
    const size = o.size;
    const color = o.color || C.chalk;
    const alpha = o.alpha == null ? 1 : o.alpha;
    if (alpha <= 0.004 || !text) return;

    c.font = size + 'px ' + (o.code ? F_CODE : F_CHALK);
    c.textAlign = o.align || 'left';
    c.textBaseline = 'alphabetic';

    const layers = o.layers || (size >= 58 ? 3 : size >= 32 ? 2 : 1);
    const j = o.jitter == null ? Math.min(2.4, size * 0.024) : o.jitter;
    const per = layers === 1 ? Math.min(1, alpha * 0.95) : Math.min(1, alpha * 0.62);
    const rnd = mulberry32(o.seed || 7);

    for (let i = 0; i < layers; i++) {
      const dx = layers > 1 ? (rnd() - 0.5) * j * 2 : 0;
      const dy = layers > 1 ? (rnd() - 0.5) * j * 1.6 : 0;
      c.fillStyle = hexA(color, per);
      c.fillText(text, x + dx, y + dy);
    }
  }

  function textWidth(c, text, size, code) {
    c.font = size + 'px ' + (code ? F_CODE : F_CHALK);
    return c.measureText(text).width;
  }

  /* 逐字书写：r 是"已经写了几个字"（浮点数）。
   * 每个字落笔时略下沉 3px 再归位，模拟粉笔尖压下板面。 */
  function writeChars(c, text, x, y, o, r) {
    if (r <= 0 || !text) return;
    const code = !!o.code;
    c.font = o.size + 'px ' + (code ? F_CODE : F_CHALK);
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';

    let cx = x;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const w = c.measureText(ch).width;
      const local = clamp01(r - i);
      if (local > 0) {
        chalkText(c, ch, cx, y - (1 - local) * 3.2, {
          size: o.size, color: o.color, code: code,
          alpha: (o.alpha == null ? 1 : o.alpha) * Math.min(1, local * 1.35),
          seed: (o.seed || 7) + i * 37,
          layers: o.layers, jitter: o.jitter
        });
      }
      cx += w;
    }
    return cx;
  }

  /* ---------------- 板面 ---------------- */

  function boardGrad(c) {
    const g = c.createLinearGradient(0, 0, W * 0.62, H);
    g.addColorStop(0, C.board0);
    g.addColorStop(0.55, C.boardBase);
    g.addColorStop(1, C.board1);
    return g;
  }

  // 板面四周压暗（灯在中间上方）。抽出来是因为 cleanPatch 必须复用它，
  // 否则局部重绘会亮出一块方形。
  function vignetteGrad(c) {
    const v = c.createRadialGradient(W * 0.5, H * 0.24, H * 0.26, W * 0.5, H * 0.5, H * 0.9);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,.30)');
    return v;
  }

  // 未擦区的灰痕与浮尘。按上下半区各自的擦除前沿裁剪。
  function drawDirt(c, cleanTop, cleanBot, alpha) {
    const topEnd = Math.max(0, Math.min(W, cleanTop));
    const botEnd = Math.max(0, Math.min(W, cleanBot));

    // 上半区（y < 900）
    c.save();
    c.beginPath();
    c.rect(topEnd, 0, Math.max(0, W - topEnd), 900);
    c.clip();
    for (const s of SMUDGE) {
      if (s.y >= 900) continue;
      c.fillStyle = hexA(C.dust, s.al * alpha);
      c.fillRect(s.x, s.y, s.w, s.h);
    }
    for (const d of DUST) {
      if (d.y >= 900) continue;
      c.fillStyle = hexA(C.dust, d.al * alpha);
      c.beginPath();
      c.arc(d.x, d.y, d.r, 0, 6.2832);
      c.fill();
    }
    c.restore();

    // 下半区（y >= 900）
    c.save();
    c.beginPath();
    c.rect(botEnd, 900, Math.max(0, W - botEnd), H - 900);
    c.clip();
    for (const s of SMUDGE) {
      if (s.y < 900) continue;
      c.fillStyle = hexA(C.dust, s.al * alpha);
      c.fillRect(s.x, s.y, s.w, s.h);
    }
    for (const d of DUST) {
      if (d.y < 900) continue;
      c.fillStyle = hexA(C.dust, d.al * alpha);
      c.beginPath();
      c.arc(d.x, d.y, d.r, 0, 6.2832);
      c.fill();
    }
    c.restore();
  }

  // 板擦推过的边界：一层灰雾，说明灰被堆到了前沿，不是凭空消失
  function drawEraseEdge(c, x, y0, y1) {
    if (x <= -60 || x >= W + 60) return;
    const g = c.createLinearGradient(x - 46, 0, x + 54, 0);
    g.addColorStop(0, 'rgba(176,188,180,0)');
    g.addColorStop(0.48, 'rgba(176,188,180,0.17)');
    g.addColorStop(1, 'rgba(176,188,180,0)');
    c.fillStyle = g;
    c.fillRect(x - 46, y0, 100, y1 - y0);

    const rnd = mulberry32(0xED6E + Math.round(x));
    for (let i = 0; i < 26; i++) {
      const py = y0 + rnd() * (y1 - y0);
      const px = x + (rnd() - 0.5) * 70;
      c.fillStyle = hexA(C.dust, 0.04 + rnd() * 0.09);
      c.fillRect(px, py, 1 + rnd() * 4, 0.8 + rnd() * 1.6);
    }
  }

  /* 擦过的痕迹：已擦区域的板面不是纯色，粉笔灰被抹开留下一层极淡的白雾。
   * 没有这一层，擦完的板和一块新的深色板没有区别，B01 的"擦"就白擦了。
   * 带子跟着板擦走的两条高度（600 / 1220）来画。 */
  function drawWipeTrail(c, cleanTop, cleanBot) {
    const bands = [
      { y: 600, end: cleanTop, h: 210 },
      { y: 1220, end: cleanBot, h: 230 }
    ];
    for (const b of bands) {
      if (b.end <= 0) continue;
      const x1 = Math.min(W, b.end);
      const g = c.createLinearGradient(0, b.y - b.h / 2, 0, b.y + b.h / 2);
      g.addColorStop(0, 'rgba(202,210,202,0)');
      g.addColorStop(0.5, 'rgba(202,210,202,0.055)');
      g.addColorStop(1, 'rgba(202,210,202,0)');
      c.fillStyle = g;
      c.fillRect(0, b.y - b.h / 2, x1, b.h);

      // 绒布留下的几道平行细纹
      const rnd = mulberry32(0x77A1 + b.y);
      for (let i = 0; i < 16; i++) {
        const yy = b.y - b.h / 2 + rnd() * b.h;
        c.fillStyle = hexA('#C6CFC6', 0.010 + rnd() * 0.020);
        c.fillRect(0, yy, x1 * (0.55 + rnd() * 0.45), 1 + rnd() * 2);
      }
    }
  }

  /* 局部擦痕：把一块矩形还原成"干净板面"。
   * 关键是要把暗角一起补上 —— 只填 boardGrad 会在画面里亮出一个矩形，
   * 因为周围板面盖着一层径向压暗。这两层必须同进同退。 */
  function cleanPatch(c, x, y, w, h) {
    c.save();
    c.beginPath();
    c.rect(x, y, w, h);
    c.clip();
    c.fillStyle = boardGrad(c);
    c.fillRect(x, y, w, h);
    c.fillStyle = vignetteGrad(c);
    c.fillRect(x, y, w, h);
    // 板擦绒布留下的横向细纹。alpha 必须压到几乎看不见：
    // 十几条浅色细纹在小面积里叠起来，会把这整块擦除区提亮成一枚方形补丁。
    const rnd = mulberry32(0x9A11 + Math.round(x));
    for (let i = 0; i < 8; i++) {
      const yy = y + rnd() * h;
      c.fillStyle = hexA('#8FA096', 0.005 + rnd() * 0.010);
      c.fillRect(x, yy, w, 1 + rnd() * 2.4);
    }
    c.restore();
    // 边界不做灰雾：雾会画到矩形外面，在干净的板面上反而留下四条亮带。
    // 真实的擦除边界本来就比描出来的柔和得多，这里靠纹理差异暗示就够了。
  }

  function drawFrame(c) {
    const f = L.frame;

    // 木框底色。之前用一条斜向渐变，出来是塑料感 —— 木头的信息在纹理不在色相，
    // 所以底色压平，靠下面那层竖纹把"木"讲出来。
    c.fillStyle = '#3B2A1E';
    c.fillRect(0, 0, W, f);
    c.fillRect(0, H - f, W, f);
    c.fillRect(0, 0, f, H);
    c.fillRect(W - f, 0, f, H);

    // 竖向木纹：每条深浅不一，宽度 1–7px。
    // 上下两条框用横纹（木料方向不同），左右两条用竖纹。
    const rnd = mulberry32(0x7123);
    for (let i = 0; i < 130; i++) {
      const p = rnd() * W;
      const w = 1 + rnd() * 6;
      const dark = rnd() > 0.5;
      const col = dark ? 'rgba(24,15,9,' : 'rgba(126,96,66,';
      const al = 0.05 + rnd() * 0.16;
      c.fillStyle = col + al + ')';
      c.fillRect(p, 0, w, f);
      c.fillRect(p, H - f, w, f);
    }
    for (let i = 0; i < 70; i++) {
      const p = rnd() * H;
      const w = 1 + rnd() * 6;
      const dark = rnd() > 0.5;
      const col = dark ? 'rgba(24,15,9,' : 'rgba(126,96,66,';
      const al = 0.05 + rnd() * 0.15;
      c.fillStyle = col + al + ')';
      c.fillRect(0, p, f, w);
      c.fillRect(W - f, p, f, w);
    }

    // 框内侧的倒角：一道暗、一道亮，板面才像嵌进去而不是贴上去
    c.fillStyle = 'rgba(10,7,4,.75)';
    c.fillRect(f, f, W - f * 2, 5);
    c.fillRect(f, H - f - 5, W - f * 2, 5);
    c.fillRect(f, f, 5, H - f * 2);
    c.fillRect(W - f - 5, f, 5, H - f * 2);

    c.strokeStyle = 'rgba(150,116,82,.42)';
    c.lineWidth = 1.6;
    c.strokeRect(f + 4.5, f + 4.5, W - f * 2 - 9, H - f * 2 - 9);
  }

  /* 粉笔槽：三支粉笔 + 一个板擦。这是"这是黑板"最强的识别信号，
   * 没有它，上面的一切也可以被读成一块深色背景。
   * 槽高 116（1752→1868），下面才是木框，所以粉笔有足够厚度，
   * 不会被压成一条线。 */
  function drawTray(c) {
    const y0 = L.tray;
    const yEnd = H - L.frame;
    const h = yEnd - y0;
    if (h <= 4) return;

    // 槽底板（比木框暗，是被挡住的凹处）
    const g = c.createLinearGradient(0, y0, 0, yEnd);
    g.addColorStop(0, '#1E140D');
    g.addColorStop(0.2, '#3A281B');
    g.addColorStop(0.72, '#4B3524');
    g.addColorStop(1, '#2A1C12');
    c.fillStyle = g;
    c.fillRect(0, y0, W, h);

    // 槽口：板面下沿投在槽里的阴影
    const sh = c.createLinearGradient(0, y0, 0, y0 + 34);
    sh.addColorStop(0, 'rgba(0,0,0,.62)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = sh;
    c.fillRect(0, y0, W, 34);

    // 槽的前缘横线
    c.fillStyle = 'rgba(140,106,74,.30)';
    c.fillRect(0, y0 + 2, W, 1.4);

    const cy = y0 + 62;

    drawChalkStick(c, 92, cy, 268, '#DFDACE', 0.32);
    drawChalkStick(c, 396, cy, 246, '#D6C086', 0.26);
    drawChalkStick(c, 678, cy, 172, '#D49E9E', 0.22);
    drawEraserStatic(c, 892, cy);
  }

  function drawChalkStick(c, x, cy, len, color, worn) {
    const h = 34;
    c.save();
    // 落影
    c.fillStyle = 'rgba(0,0,0,.46)';
    c.fillRect(x + 3, cy - h / 2 + 6, len, h);
    // 笔身
    const g = c.createLinearGradient(0, cy - h / 2, 0, cy + h / 2);
    g.addColorStop(0, hexA(color, 0.98));
    g.addColorStop(0.4, color);
    g.addColorStop(1, hexA(color, 0.66));
    c.fillStyle = g;
    c.fillRect(x, cy - h / 2, len, h);
    // 圆头
    c.beginPath();
    c.arc(x + h / 2, cy, h / 2, Math.PI / 2, -Math.PI / 2);
    c.fill();
    c.beginPath();
    c.arc(x + len - h / 2, cy, h / 2, -Math.PI / 2, Math.PI / 2);
    c.fill();
    // 磨损：笔端有缺口
    if (worn > 0) {
      c.fillStyle = 'rgba(30,20,13,.55)';
      c.beginPath();
      c.moveTo(x + len - 8, cy - 11);
      c.lineTo(x + len - 1, cy - 14);
      c.lineTo(x + len - 3, cy + 3);
      c.closePath();
      c.fill();
    }
    // 高光
    c.fillStyle = 'rgba(255,255,255,.26)';
    c.fillRect(x + 14, cy - h / 2 + 5, len - 30, 3);
    c.restore();
  }

  function drawEraserStatic(c, x, cy) {
    const w = 104, h = 52;
    c.save();
    c.fillStyle = 'rgba(0,0,0,.48)';
    c.fillRect(x + 3, cy - h / 2 + 7, w, h);
    // 木托
    c.fillStyle = '#5A4433';
    c.fillRect(x, cy - h / 2, w, h * 0.36);
    c.fillStyle = 'rgba(255,255,255,.10)';
    c.fillRect(x, cy - h / 2, w, 2);
    // 绒布
    const g = c.createLinearGradient(0, cy - h / 2 + h * 0.36, 0, cy + h / 2);
    g.addColorStop(0, '#556A60');
    g.addColorStop(1, '#2C3833');
    c.fillStyle = g;
    c.fillRect(x, cy - h / 2 + h * 0.36, w, h * 0.64);
    for (let i = 0; i < 6; i++) {
      c.fillStyle = 'rgba(255,255,255,.055)';
      c.fillRect(x + 5, cy - h / 2 + h * 0.40 + i * 5.6, w - 10, 1.4);
    }
    // 前缘沾的粉笔灰
    const gd = c.createLinearGradient(x + w - 20, 0, x + w, 0);
    gd.addColorStop(0, 'rgba(210,216,208,0)');
    gd.addColorStop(1, 'rgba(210,216,208,.34)');
    c.fillStyle = gd;
    c.fillRect(x + w - 20, cy - h / 2 + h * 0.36, 20, h * 0.64);
    c.restore();
  }

  // 板擦（擦板时的那一个，画得比槽里的大，因为它在动）
  function drawEraserMoving(c, x, cy, alpha) {
    if (alpha <= 0.01) return;
    const w = 252, h = 122;
    c.save();
    c.globalAlpha = alpha;

    c.fillStyle = 'rgba(0,0,0,.55)';
    c.fillRect(x - w / 2 + 14, cy - h / 2 + 20, w, h);

    // 木托
    const gt = c.createLinearGradient(0, cy - h / 2, 0, cy - h / 2 + h * 0.36);
    gt.addColorStop(0, '#6A5140');
    gt.addColorStop(1, '#4A3728');
    c.fillStyle = gt;
    c.fillRect(x - w / 2, cy - h / 2, w, h * 0.36);

    // 绒布
    const gf = c.createLinearGradient(0, cy - h / 2 + h * 0.36, 0, cy + h / 2);
    gf.addColorStop(0, '#465750');
    gf.addColorStop(0.6, '#33423B');
    gf.addColorStop(1, '#242E2A');
    c.fillStyle = gf;
    c.fillRect(x - w / 2, cy - h / 2 + h * 0.36, w, h * 0.64);

    // 绒布横纹
    for (let i = 0; i < 9; i++) {
      c.fillStyle = i % 2 ? 'rgba(255,255,255,.045)' : 'rgba(0,0,0,.10)';
      c.fillRect(x - w / 2 + 6, cy - h / 2 + h * 0.40 + i * 6.4, w - 12, 2.2);
    }

    // 前缘沾满粉笔灰
    const gd = c.createLinearGradient(x + w / 2 - 34, 0, x + w / 2 + 6, 0);
    gd.addColorStop(0, 'rgba(200,208,200,0)');
    gd.addColorStop(1, 'rgba(200,208,200,.30)');
    c.fillStyle = gd;
    c.fillRect(x + w / 2 - 34, cy - h / 2, 40, h);

    c.restore();
  }

  /* 板面总入口。cleanTop / cleanBot 是上下半区各自擦到的 x（W 表示全干净）。 */
  function drawBoard(c, o) {
    const opt = o || {};
    const cleanTop = opt.cleanTop == null ? W : opt.cleanTop;
    const cleanBot = opt.cleanBot == null ? W : opt.cleanBot;

    c.fillStyle = boardGrad(c);
    c.fillRect(0, 0, W, H);

    c.fillStyle = vignetteGrad(c);
    c.fillRect(0, 0, W, H);

    // 只有 B01 擦板那一镜才画脏污与擦痕。
    // 之前写的是 `dirt !== false`，于是 B02–B08 每镜都会画一遍擦痕横带——
    // 那两条白带本来是"刚擦过"的证据，出现在已经写满字的画面上就是两条亮带。
    if (opt.dirty === true) {
      drawDirt(c, cleanTop, cleanBot, 1);
      drawWipeTrail(c, cleanTop, cleanBot);
      drawEraseEdge(c, cleanTop, 0, 900);
      drawEraseEdge(c, cleanBot, 900, H);
    }
  }

  /* ---------------- 分镜里的固定元素 ----------------
   * 后续镜头要重画前面写过的东西，所以每个元素都做成带 alpha / reveal 的函数。
   * DIM 是"退到背景"的透明度：焦点永远在刚写下的那笔上。
   */
  const DIM = 0.30;

  /* 把「本镜内的时间窗口」换算成「该写到第几个字」。
   * 之前每个调用点手写 seg(p,a,b) * 某个魔数，经常和实际字数对不上，
   * 表现是整行只画出第一个字。统一走这里，字数从文本自己来。 */
  const chars = (p, a, b, text) => seg(p, a, b) * (String(text).length + 0.8);

  const TITLE = '资源去哪了';
  const CODE1 = 'FILE* f = fopen("a.txt","r");';
  const CODE2 = 'File f{"a.txt"};';

  const TITLE_SIZE = 132;

  function drawTitle(c, o) {
    const a = o.alpha == null ? 1 : o.alpha;
    const r = o.reveal == null ? 99 : o.reveal;
    if (a <= 0.004) return;
    const x = L.x0, y = L.titleY;
    writeChars(c, TITLE, x, y, { size: TITLE_SIZE, color: C.chalk, alpha: a, seed: 101 }, r);
    // 问号换黄粉笔，稍微抬高，是这一版的视觉锚点
    if (r > TITLE.length + 0.1) {
      const qx = x + textWidth(c, TITLE, TITLE_SIZE) + 14;
      chalkText(c, '？', qx, y - 14, { size: TITLE_SIZE + 8, color: C.yellow, alpha: a, seed: 149, layers: 3 });
    }
    // 重点双横：「资源」下面
    if (o.mark !== false && r > TITLE.length + 0.4) {
      const bw = textWidth(c, '资源', TITLE_SIZE);
      if (o.markR1 !== false) chalkStroke(c, [[x + 4, y + 26], [x + bw * 0.5, y + 23], [x + bw - 2, y + 27]],
        { color: C.yellow, w: 4.6, alpha: a * 0.85, seed: 211 });
      if (o.markR2 !== false) chalkStroke(c, [[x + 12, y + 48], [x + bw * 0.5, y + 45], [x + bw - 12, y + 49]],
        { color: C.yellow, w: 3.4, alpha: a * 0.68, seed: 213 });
    }
  }

  // 标题下的分区线：板书常见的横贯线，把"标题"和"正文"分开
  function drawRule(c, o) {
    const a = o.alpha == null ? 1 : o.alpha;
    const p = o.reveal == null ? 1 : clamp01(o.reveal);
    if (a <= 0.004 || p <= 0) return;
    chalkStroke(c, [[L.x0, L.ruleY], [W * 0.5, L.ruleY - 5], [L.x1, L.ruleY + 3]],
      { color: C.chalk, w: 3.4, alpha: a * 0.55, seed: 341, reveal: p });
  }

  /* B02 的时间轴示意图：一条手绘横线，左端"拿到"，右端"？"，
   * 中间一段虚点。这是"提出问题"的图示 —— 光有标题撑不满竖屏，
   * 而且这个图直接把下一镜要写的东西预告了。
   *
   * 注意这里的 p 是父级传进来的 reveal（已经归一化过一次），
   * 不是镜内进度。所以下面的时间窗口是"reveal 轴"上的相对位置，
   * 不是秒数。窗口排得太靠后的话，字会挤在镜头最后一百毫秒里写完。 */
  function drawAskAxis(c, o) {
    const a = o.alpha == null ? 1 : o.alpha;
    const p = o.reveal == null ? 1 : clamp01(o.reveal);
    if (a <= 0.004 || p <= 0) return;
    const y = 1160;

    // 主线
    chalkStroke(c, [[150, y], [420, y - 7], [700, y + 6], [930, y - 2]],
      { color: C.chalk, w: 4.2, alpha: a * 0.85, seed: 351, reveal: clamp01(p / 0.36) });

    // 左端：取到的时刻，一个实心点加一条向上的引线
    if (p > 0.28) {
      const k = seg(p, 0.28, 0.44);
      chalkStroke(c, [[150, y], [150, y - 54]], { color: C.yellow, w: 3, alpha: a * k, seed: 361 });
      c.save();
      c.fillStyle = hexA(C.yellow, 0.8 * a * k);
      c.beginPath();
      c.arc(150, y, 9 * k, 0, 6.2832);
      c.fill();
      c.restore();
      writeChars(c, '拿到', 108, y - 76, { size: 42, color: C.yellow, alpha: a, seed: 371 }, k * 3.2);
    }

    // 右端：还回去的时刻 —— 这里是个问号，因为还不知道在哪
    if (p > 0.40) {
      const k = seg(p, 0.40, 0.56);
      chalkStroke(c, [[930, y], [930, y - 54]], { color: C.pink, w: 3, alpha: a * k, seed: 381 });
      chalkText(c, '？', 894, y - 68, { size: 68, color: C.pink, alpha: a * k, seed: 387 });
      writeChars(c, '还回去', 860, y - 134, { size: 42, color: C.pink, alpha: a, seed: 391 }, k * 3.2);
    }

    // 中间：不知道有多长，用虚点表示
    if (p > 0.52) {
      const k = seg(p, 0.52, 0.72);
      for (let i = 0; i < 6; i++) {
        const lp = clamp01(k * 7 - i);
        if (lp <= 0) continue;
        const cx = 462 + i * 50;
        c.fillStyle = hexA(C.chalk, 0.46 * a * lp);
        c.beginPath();
        c.arc(cx, y - 2, 4, 0, 6.2832);
        c.fill();
      }
    }

    // 轴下方的注解：把"这段空白"的性质讲出来
    if (p > 0.60) {
      const k = seg(p, 0.60, 0.86);
      writeChars(c, '这段时间里，资源一直占着', 150, y + 76,
        { size: 34, color: C.chalk, alpha: a * 0.52, seed: 397 }, k * 13.2);
    }
  }

  function drawAskLine(c, o) {
    const a = o.alpha == null ? 1 : o.alpha;
    const r = o.reveal == null ? 9 : o.reveal;
    if (a <= 0.004) return;
    writeChars(c, '中间这一段，谁来管？', 150, 1540,
      { size: 44, color: C.chalk, alpha: a * 0.88, seed: 401 }, r);
  }

  function drawCode1(c, o) {
    const a = o.alpha == null ? 1 : o.alpha;
    const r = o.reveal == null ? 99 : o.reveal;
    if (a <= 0.004) return;
    writeChars(c, CODE1, L.x0, 930, { size: 36, code: true, color: C.chalk, alpha: a, seed: 431 }, r);
    if (r > CODE1.length + 2) {
      writeChars(c, '// 拿到了，但谁还？', L.x0 + 6, 994,
        { size: 28, code: true, color: C.chalk, alpha: a * 0.55, seed: 451 }, r - CODE1.length - 2);
    }
  }

  const BLOCK = { x: 752, y: 880, w: 186, h: 132 };

  function drawResBlock(c, o) {
    const a = o.alpha == null ? 1 : o.alpha;
    if (a <= 0.004) return;
    const B = BLOCK;
    handBox(c, B.x, B.y, B.w, B.h, { color: o.color || C.chalk, w: 3.4, alpha: a, seed: 503 });
    chalkText(c, 'FILE', B.x + B.w / 2, B.y + B.h / 2 + 13,
      { size: 42, code: true, color: o.color || C.chalk, alpha: a * 0.95, align: 'center', seed: 517, layers: 2 });
    if (o.label !== false) {
      chalkText(c, '堆上 · 文件句柄', B.x + B.w / 2, B.y + B.h + 50,
        { size: 26, color: o.labelColor || C.chalk, alpha: a * 0.55, align: 'center', seed: 531 });
    }
  }

  // 箭头：从代码末尾弯到资源方块，收笔处一个手绘箭头
  function drawArrow(c, o) {
    const a = o.alpha == null ? 1 : o.alpha;
    const r = o.reveal == null ? 1 : o.reveal;
    if (a <= 0.004 || r <= 0) return;
    const pts = [[672, 916], [706, 906], [728, 924], [748, 940]];
    chalkStroke(c, pts, { color: o.color || C.chalk, w: 3, alpha: a * 0.9, seed: 601, reveal: r });
    if (o.reveal == null || r > 0.72) {
      const ra = o.reveal == null ? 1 : seg(r, 0.72, 1);
      chalkStroke(c, [[734, 952], [749, 941], [758, 922]], { color: o.color || C.chalk, w: 2.8, alpha: a * 0.9 * ra, seed: 607 });
    }
  }

  // 红叉：两笔，先撇后捺
  function drawCross(c, cx, cy, size, o) {
    const a = o.alpha == null ? 1 : o.alpha;
    const p = o.reveal == null ? 1 : clamp01(o.reveal);
    if (a <= 0.004) return;
    const r1 = clamp01(p / 0.55), r2 = clamp01((p - 0.45) / 0.55);
    if (r1 > 0) chalkStroke(c, [[cx - size, cy - size * 0.86], [cx - size * 0.2, cy - size * 0.1], [cx + size, cy + size * 0.88]],
      { color: o.color || C.pink, w: 4.8, alpha: a, seed: 701, reveal: r1 });
    if (r2 > 0) chalkStroke(c, [[cx + size * 0.92, cy - size * 0.92], [cx + size * 0.1, cy - size * 0.05], [cx - size, cy + size * 0.9]],
      { color: o.color || C.pink, w: 4.8, alpha: a, seed: 709, reveal: r2 });
  }

  function drawThrow(c, o) {
    const a = o.alpha == null ? 1 : o.alpha;
    const r = o.reveal == null ? 9 : o.reveal;
    if (a <= 0.004) return;
    writeChars(c, 'throw', 556, 818, { size: 46, code: true, color: C.pink, alpha: a, seed: 801 }, r);
  }

  function drawWho(c, o) {
    const a = o.alpha == null ? 1 : o.alpha;
    const r = o.reveal == null ? 99 : o.reveal;
    if (a <= 0.004) return;
    writeChars(c, '谁负责', 322, 1020, { size: TITLE_SIZE, color: C.yellow, alpha: a, seed: 901 }, r);
  }

  const CANDS = ['main 里的 fclose', 'caller 传进来的指针', '没有人'];
  const CAND_Y = [1190, 1300, 1410];

  function drawCandidates(c, o) {
    const a = o.alpha == null ? 1 : o.alpha;
    const r = o.reveal == null ? 99 : o.reveal;
    if (a <= 0.004) return;
    for (let i = 0; i < CANDS.length; i++) {
      const local = clamp01(r - i * 2);
      if (local <= 0) continue;
      const y = CAND_Y[i];
      // 行首短横自己画，不用 └ ├ 这类制表符 —— 楷体里不一定有字形
      chalkStroke(c, [[288, y - 12], [316, y - 13]], {
        color: i === 2 ? C.pink : C.chalk, w: 3, alpha: a * 0.75 * local, seed: 1001 + i * 13
      });
      writeChars(c, CANDS[i], 344, y, {
        size: 42, color: i === 2 ? C.pink : C.chalk, alpha: a * (i === 2 ? 1 : 0.86), seed: 1031 + i * 17
      }, local * (CANDS[i].length + 0.8));
    }
  }

  function drawCircleNobody(c, o) {
    const a = o.alpha == null ? 1 : o.alpha;
    const p = o.reveal == null ? 1 : clamp01(o.reveal);
    if (a <= 0.004 || p <= 0) return;
    handEllipse(c, 458, CAND_Y[2] - 14, 128, 44, { color: C.pink, w: 3.4, alpha: a, seed: 1103, reveal: p });
  }

  // 划掉：红粉笔两道斜线，压在代码行上
  function drawStrike(c, o) {
    const a = o.alpha == null ? 1 : o.alpha;
    const p = o.reveal == null ? 1 : clamp01(o.reveal);
    if (a <= 0.004 || p <= 0) return;
    const r1 = clamp01(p / 0.6), r2 = clamp01((p - 0.5) / 0.5);
    if (r1 > 0) chalkStroke(c, [[96, 952], [400, 934], [664, 916]],
      { color: C.pink, w: 6.4, alpha: a * 0.95, seed: 1201, reveal: r1 });
    if (r2 > 0) chalkStroke(c, [[108, 908], [402, 928], [658, 952]],
      { color: C.pink, w: 5.4, alpha: a * 0.85, seed: 1207, reveal: r2 });
  }

  function drawWrong(c, o) {
    const a = o.alpha == null ? 1 : o.alpha;
    const r = o.reveal == null ? 9 : o.reveal;
    if (a <= 0.004) return;
    writeChars(c, '错', 700, 942, { size: 58, color: C.pink, alpha: a, seed: 1301 }, r);
  }

  function drawCode2(c, o) {
    const a = o.alpha == null ? 1 : o.alpha;
    const r = o.reveal == null ? 99 : o.reveal;
    if (a <= 0.004) return;
    writeChars(c, CODE2, 176, 1196, { size: 42, code: true, color: C.blue, alpha: a, seed: 1401 }, r);
    // 注释单独走一个进度窗口。之前是从代码的 reveal 里减去字数，
    // 但那个值上限就是"写完代码"，减完必然为负，注释永远出不来。
    if (o.noteReveal > 0) {
      writeChars(c, '// 作用域一结束，析构自己来', 176, 1258,
        { size: 28, code: true, color: C.blue, alpha: a * 0.58, seed: 1421 }, o.noteReveal);
    }
  }

  function drawBraceAndNote(c, o) {
    const a = o.alpha == null ? 1 : o.alpha;
    const p = o.reveal == null ? 1 : clamp01(o.reveal);
    if (a <= 0.004 || p <= 0) return;
    handBrace(c, 118, 1136, 1318, { color: C.blue, w: 3.2, alpha: a, seed: 1501, reveal: clamp01(p / 0.62) });
    if (p > 0.58) {
      const ra = seg(p, 0.58, 0.80);
      chalkStroke(c, [[118, 1318], [108, 1348], [98, 1372]], { color: C.green, w: 2.8, alpha: a * ra, seed: 1511 });
    }
    if (p > 0.74) {
      writeChars(c, '退出即调用 ~File()', 62, 1408,
        { size: 36, color: C.green, alpha: a, seed: 1523 }, (p - 0.74) / 0.26 * 15);
    }
  }

  /* 绿色通路：从"析构被调用"这句话的末尾出发，弯回资源方块原来的位置。
   * 起点跟着文字走 —— 之前从大括号底出发，曲线直接穿过下面那行字，
   * 看起来像从字里长出来的。终点也不落在方块中心，而是落在"已释放"
   * 这三个字的左边，箭头和结论连成一句才读得顺。 */
  function drawReleasePath(c, o) {
    const a = o.alpha == null ? 1 : o.alpha;
    const p = o.reveal == null ? 1 : clamp01(o.reveal);
    if (a <= 0.004 || p <= 0) return;
    const pts = [[500, 1396], [616, 1350], [700, 1210], [760, 1086], [800, 1004]];
    chalkStroke(c, pts, { color: C.green, w: 3.6, alpha: a * 0.95, seed: 1601, reveal: p });
    if (p > 0.88) {
      chalkStroke(c, [[776, 1036], [800, 1002], [828, 1028]], { color: C.green, w: 3.2, alpha: a, seed: 1613 });
    }
  }

  function drawReleased(c, o) {
    const a = o.alpha == null ? 1 : o.alpha;
    const r = o.reveal == null ? 9 : o.reveal;
    if (a <= 0.004) return;
    writeChars(c, '已释放', 816, 1006, { size: 38, color: C.green, alpha: a, seed: 1701 }, r);
  }

  function drawCheck(c, o) {
    const a = o.alpha == null ? 1 : o.alpha;
    const p = o.reveal == null ? 1 : clamp01(o.reveal);
    if (a <= 0.004 || p <= 0) return;
    chalkStroke(c, [[842, 1100], [864, 1130], [916, 1058]], { color: C.green, w: 4.8, alpha: a, seed: 1801, reveal: p });
  }

  function drawLead(c, o) {
    const a = o.alpha == null ? 1 : o.alpha;
    const r = o.reveal == null ? 9 : o.reveal;
    if (a <= 0.004) return;
    writeChars(c, '裸指针只是借了个地址', 104, 1560, { size: 36, color: C.chalk, alpha: a * 0.52, seed: 1901 }, r);
    if (r > 5) {
      writeChars(c, '对象才对资源负责', 104, 1620, { size: 36, color: C.chalk, alpha: a * 0.52, seed: 1913 }, r - 5);
    }
  }

  function drawConclusion(c, o) {
    const a = o.alpha == null ? 1 : o.alpha;
    const r = o.reveal == null ? 99 : o.reveal;
    if (a <= 0.004) return;
    writeChars(c, '离开，就释放', L.x0, 906, { size: 136, color: C.chalk, alpha: a, seed: 2001 }, r);
  }

  function drawUnderline(c, o) {
    const a = o.alpha == null ? 1 : o.alpha;
    const p = o.reveal == null ? 1 : clamp01(o.reveal);
    if (a <= 0.004 || p <= 0) return;
    const w = textWidth(c, '离开，就释放', 136);
    chalkStroke(c, [[L.x0 + 4, 948], [L.x0 + w * 0.5, 942], [L.x0 + w - 6, 950]],
      { color: C.yellow, w: 5.2, alpha: a * 0.9, seed: 2101, reveal: p });
    if (p > 0.8) {
      chalkStroke(c, [[L.x0 + w - 6, 950], [L.x0 + w + 26, 934]], { color: C.yellow, w: 3.4, alpha: a * 0.8, seed: 2107 });
    }
  }

  function drawRaii(c, o) {
    const a = o.alpha == null ? 1 : o.alpha;
    const r = o.reveal == null ? 9 : o.reveal;
    if (a <= 0.004) return;
    writeChars(c, 'RAII · Resource Acquisition Is Initialization', L.x0, 1024,
      { size: 28, code: true, color: C.yellow, alpha: a * 0.7, seed: 2201 }, r);
  }

  /* ---------------- 八镜 ---------------- */

  const SHOTS = [
    {
      id: 'B01', name: '擦板', dur: SHOT_MS,
      draw: function (c, p) {
        // 两趟擦除：上半区先，下半区后。没擦到的部分还留着上一节课的灰痕。
        const r1 = easeInOut(seg(p, 0.02, 0.32));
        const r2 = easeInOut(seg(p, 0.38, 0.68));
        const cleanTop = lerp(-360, W + 40, r1);
        const cleanBot = lerp(-360, W + 40, r2);

        drawBoard(c, { dirty: true, cleanTop: cleanTop, cleanBot: cleanBot });

        const inFlight = (r1 > 0 && r1 < 1) || (r2 > 0 && r2 < 1);
        if (inFlight) {
          if (r1 > 0 && r1 < 1) drawEraserMoving(c, lerp(-320, W + 240, r1), 600, 1);
          else drawEraserMoving(c, lerp(-320, W + 240, r2), 1220, 1);
        }

        // 擦完在右下角标课程号 —— 上课前先在角上写一行
        const rr = seg(p, 0.76, 0.94) * 8;
        if (rr > 0) {
          writeChars(c, '第 4 课 · 资源管理', 690, 1664,
            { size: 30, color: C.chalk, alpha: 0.5, seed: 2501 }, rr);
        }
        // 粉笔灰在光里飘（擦完才有，慢慢升）
        const dp = seg(p, 0.70, 1);
        if (dp > 0) {
          const rnd = mulberry32(0xF1A9);
          for (let i = 0; i < 46; i++) {
            const bx = rnd() * W;
            const by = 1300 + rnd() * 460;
            const rise = dp * (60 + rnd() * 190);
            const a = (0.05 + rnd() * 0.14) * (1 - dp * 0.55) * dp;
            c.fillStyle = hexA(C.dust, a);
            c.beginPath();
            c.arc(bx + Math.sin(dp * 6 + i) * 14, by - rise, 0.8 + rnd() * 1.7, 0, 6.2832);
            c.fill();
          }
        }
      }
    },

    {
      id: 'B02', name: '起笔', dur: SHOT_MS,
      draw: function (c, p) {
        drawBoard(c, {});
        // 这一镜不写副标题：标题 6 个字位 + 时间轴 4 处标注 + 注解 12 字 + 问题 10 字，
        // 已经 32 个字位，4000ms 下每字只有 125ms。再加 15 个字就要挤到 87ms，
        // 手上的粉笔会写成"打字"。课程号在 B01 已经落过了。
        drawTitle(c, {
          reveal: chars(p, 0.05, 0.36, TITLE),
          markR1: p > 0.34, markR2: p > 0.40
        });
        drawRule(c, { reveal: seg(p, 0.34, 0.44) });
        drawAskAxis(c, { reveal: seg(p, 0.40, 1.0) });
        drawAskLine(c, { reveal: chars(p, 0.74, 0.96, '中间这一段，谁来管？') });
      }
    },

    {
      id: 'B03', name: '写第一行', dur: SHOT_MS,
      draw: function (c, p) {
        drawBoard(c, {});
        drawTitle(c, { alpha: DIM, mark: false });
        drawRule(c, { alpha: DIM });

        drawCode1(c, { reveal: chars(p, 0.08, 0.42, CODE1) });
        drawResBlock(c, { alpha: seg(p, 0.46, 0.60), color: C.chalk });
        drawArrow(c, { reveal: seg(p, 0.62, 0.84) });
        // 方块描边转黄：这一刻资源被"拿到"了
        if (p > 0.78) {
          const k = seg(p, 0.78, 0.94);
          c.save();
          c.globalAlpha = k;
          drawResBlock(c, { alpha: 0.85, color: C.yellow, label: false });
          c.restore();
          writeChars(c, '拿到了', BLOCK.x + 22, BLOCK.y + BLOCK.h + 130,
            { size: 40, color: C.yellow, alpha: k, seed: 2601 }, k * 3.6);
        }
        // 底部补一句：把"从这一刻起"的责任讲清楚，否则下面两镜没有落点
        writeChars(c, '从这一刻起，它在你的责任范围里', 104, 1600,
          { size: 36, color: C.chalk, alpha: 0.58, seed: 2611 },
          chars(p, 0.82, 0.98, '从这一刻起，它在你的责任范围里'));
      }
    },

    {
      id: 'B04', name: '出事', dur: SHOT_MS,
      draw: function (c, p) {
        drawBoard(c, {});
        drawTitle(c, { alpha: DIM, mark: false });
        drawRule(c, { alpha: DIM });
        drawCode1(c, { alpha: 0.85 });
        drawResBlock(c, { alpha: 0.9, color: C.yellow, labelColor: C.chalk });
        drawArrow(c, { alpha: 0.6 });

        // 箭头中间被打叉 —— 通路断了
        drawCross(c, 728, 936, 30, { reveal: seg(p, 0.10, 0.34) });
        drawThrow(c, { reveal: chars(p, 0.32, 0.50, 'throw') });
        // 方块还在原地，标一句"还在这"
        if (p > 0.50) {
          const k = seg(p, 0.50, 0.68);
          writeChars(c, '还在这', BLOCK.x + 26, BLOCK.y - 46,
            { size: 38, color: C.yellow, alpha: k, seed: 2701 }, k * 3.6);
          chalkStroke(c, [[BLOCK.x + 38, BLOCK.y - 32], [BLOCK.x + 58, BLOCK.y - 6]], { color: C.yellow, w: 3, alpha: k, seed: 2711 });
        }
        // 中间落一句：解释这个叉意味着什么
        writeChars(c, '资源还在，手已经撤了', 104, 1256,
          { size: 38, color: C.pink, alpha: 0.9 * seg(p, 0.62, 0.80), seed: 2731 },
          chars(p, 0.62, 0.80, '资源还在，手已经撤了'));
        // 结论提前落一句，为下一镜的追问留口子
        writeChars(c, '没有人负责', 104, 1470,
          { size: 50, color: C.pink, alpha: seg(p, 0.82, 0.96), seed: 2741 },
          chars(p, 0.82, 0.96, '没有人负责'));
      }
    },

    {
      id: 'B05', name: '追问', dur: SHOT_MS,
      draw: function (c, p) {
        drawBoard(c, {});
        // 这一镜是停顿，板面留空。试过保留标题残影当肌理，
        // 但在深底上只要 7% 的白就足够抢注意力，"问"的力度全被分走了。
        drawWho(c, { reveal: chars(p, 0.08, 0.38, '谁负责') });
        drawCandidates(c, { reveal: seg(p, 0.42, 0.78) * 7 });
        drawCircleNobody(c, { reveal: seg(p, 0.80, 0.94) });
        // 承接下一镜：答案是"没人"，那就只能换个写法
        writeChars(c, '换个写法', 322, 1560,
          { size: 44, color: C.chalk, alpha: seg(p, 0.92, 1.0) * 0.82, seed: 1151 },
          chars(p, 0.92, 1.0, '换个写法'));
      }
    },

    {
      id: 'B06', name: '划掉，重写', dur: SHOT_MS,
      draw: function (c, p) {
        drawBoard(c, {});
        drawTitle(c, { alpha: 0.20, mark: false });
        drawRule(c, { alpha: 0.20 });

        drawCode1(c, { alpha: 0.9 });
        drawResBlock(c, { alpha: 0.28, color: C.yellow, label: false });
        drawArrow(c, { alpha: 0.18 });

        drawStrike(c, { reveal: seg(p, 0.06, 0.32) });
        drawWrong(c, { reveal: chars(p, 0.30, 0.44, '错') });

        drawCode2(c, {
          reveal: chars(p, 0.46, 0.68, CODE2),
          noteReveal: chars(p, 0.62, 0.76, '// 作用域一结束，析构自己来')
        });
        drawBraceAndNote(c, { reveal: seg(p, 0.56, 1.0) });
      }
    },

    {
      id: 'B07', name: '资源回家', dur: SHOT_MS,
      draw: function (c, p) {
        drawBoard(c, {});

        // 上一镜的现场压低
        drawTitle(c, { alpha: 0.08, mark: false });
        drawRule(c, { alpha: 0.08 });
        drawCode1(c, { alpha: 0.10 });
        drawStrike(c, { alpha: 0.26, reveal: 1 });
        drawCode2(c, { alpha: 0.55, noteReveal: 14 });
        drawBraceAndNote(c, { alpha: 0.6, reveal: 1 });

        // 方块被擦掉：这块板面回到干净状态
        const ep = easeOut(seg(p, 0.10, 0.42));
        if (ep > 0) {
          cleanPatch(c, BLOCK.x - 30, BLOCK.y - 70, BLOCK.w + 60, BLOCK.h + 130);
          if (ep < 1) {
            // 擦到一半：右侧还留着半块
            c.save();
            c.beginPath();
            c.rect(BLOCK.x - 30 + (BLOCK.w + 60) * ep, BLOCK.y - 70, (BLOCK.w + 60) * (1 - ep), BLOCK.h + 130);
            c.clip();
            drawResBlock(c, { alpha: 0.9, color: C.yellow, label: false });
            c.restore();
          }
        } else {
          drawResBlock(c, { alpha: 0.5, color: C.yellow, label: false });
        }

        drawReleasePath(c, { reveal: seg(p, 0.10, 0.60) });
        drawReleased(c, { alpha: seg(p, 0.46, 0.62), reveal: chars(p, 0.46, 0.62, '已释放') });
        drawCheck(c, { reveal: seg(p, 0.60, 0.76) });
        drawLead(c, { reveal: seg(p, 0.72, 1.0) * 16 });
      }
    },

    {
      id: 'B08', name: '落款', dur: SHOT_MS,
      draw: function (c, p) {
        drawBoard(c, {});
        // 黑板擦干净了再写最后一句 —— 不留上一屏的字，
        // 深底上 5% 的白依然清楚，会让大字读起来发灰。
        drawConclusion(c, { reveal: chars(p, 0.04, 0.40, '离开，就释放') });
        drawUnderline(c, { reveal: seg(p, 0.40, 0.56) });
        drawRaii(c, { reveal: chars(p, 0.52, 0.74, 'RAII · Resource Acquisition Is Initialization') });
        // 右上角标课程号：和 B01 擦完板写的那行首尾呼应，也把顶部的空填上
        writeChars(c, '第 4 课 · 完', 748, 396,
          { size: 32, color: C.chalk, alpha: seg(p, 0.90, 1.0) * 0.38, seed: 2401 },
          chars(p, 0.90, 1.0, '第 4 课 · 完'));
        // 片尾回顾：把整节课压回一句话。"两个时刻"是这一节反复用的轴
        writeChars(c, '一个类，两个时刻：拿到，还回去', 104, 1520,
          { size: 38, color: C.chalk, alpha: seg(p, 0.84, 0.98) * 0.55, seed: 2411 },
          chars(p, 0.84, 0.98, '一个类，两个时刻：拿到，还回去'));
      }
    }
  ];

  const TOTAL = SHOTS.reduce((s, x) => s + x.dur, 0);

  /* ---------------- 运行时 ---------------- */

  let canvas = null, ctx = null, onChange = null, raf = 0, last = 0;

  const state = {
    shotIdx: 0, t: 0, playing: false, loop: true,
    safe: false, watermark: false
  };

  function drawSafe(c) {
    // 竖屏通用安全区：上下各留 220，左右各留 90
    c.save();
    c.strokeStyle = 'rgba(155,192,220,.30)';
    c.lineWidth = 2;
    c.setLineDash([14, 10]);
    c.strokeRect(90, 220, W - 180, H - 440);
    c.setLineDash([]);
    c.restore();
  }

  function render() {
    const shot = SHOTS[state.shotIdx];
    const p = clamp01(state.t / shot.dur);
    ctx.save();
    shot.draw(ctx, p);
    drawFrame(ctx);
    drawTray(ctx);
    if (state.safe) drawSafe(ctx);
    // 帧号水印：默认关。它只用来核对逐帧导出，出现在正片里就是瑕疵。
    // 工作台上手动打开，导出帧/序列时强制关掉。
    if (state.watermark) {
      ctx.font = '13px ' + F_CODE;
      ctx.fillStyle = hexA(C.chalk, 0.30);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(shot.id + '  ' + String(state.t).padStart(4, '0') + 'ms', 74, 218);
    }
    ctx.restore();
  }

  function tick(now) {
    if (!state.playing) return;
    if (!last) last = now;
    const dt = now - last;
    last = now;
    state.t += dt;
    const shot = SHOTS[state.shotIdx];
    if (state.t >= shot.dur) {
      if (state.loop) state.t = 0;
      else { state.t = shot.dur; state.playing = false; }
    }
    render();
    if (onChange) onChange(state, shot);
    raf = requestAnimationFrame(tick);
  }

  const API = {
    W: W, H: H, FPS: FPS, TOTAL: TOTAL, SHOTS: SHOTS, state: state,

    init: function (cv) {
      canvas = cv;
      cv.width = W;
      cv.height = H;
      ctx = cv.getContext('2d');
      render();
      return API;
    },

    select: function (i) {
      state.shotIdx = Math.max(0, Math.min(SHOTS.length - 1, i));
      state.t = 0;
      render();
      if (onChange) onChange(state, SHOTS[state.shotIdx]);
    },

    seek: function (ms) {
      const shot = SHOTS[state.shotIdx];
      state.t = Math.max(0, Math.min(shot.dur, ms));
      render();
      if (onChange) onChange(state, shot);
    },

    toggle: function () {
      state.playing = !state.playing;
      last = 0;
      if (state.playing) raf = requestAnimationFrame(tick);
      else if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (onChange) onChange(state, SHOTS[state.shotIdx]);
    },

    onChange: function (fn) { onChange = fn; },

    exportFrame: function () {
      if (!canvas) return;
      // 导出的帧是拿去合成的，不能带帧号水印
      const keepMark = state.watermark;
      state.watermark = false;
      render();
      const a = document.createElement('a');
      a.download = SHOTS[state.shotIdx].id + '_' + String(Math.round(state.t)).padStart(5, '0') + '.png';
      a.href = canvas.toDataURL('image/png');
      a.click();
      state.watermark = keepMark;
      render();
    },

    exportSequence: function (frameMs, onProgress) {
      const shot = SHOTS[state.shotIdx];
      const step = frameMs || Math.round(1000 / FPS);
      const total = Math.round(shot.dur / step);
      const wasPlaying = state.playing;
      const keepMark = state.watermark;
      state.playing = false;
      state.watermark = false;   // 序列是拿去合成的，整批都不带水印
      let i = 0;
      return new Promise(function (resolve) {
        function next() {
          if (i > total) {
            state.playing = wasPlaying;
            state.watermark = keepMark;
            render();
            if (wasPlaying) { last = 0; raf = requestAnimationFrame(tick); }
            resolve(total + 1);
            return;
          }
          state.t = Math.min(shot.dur, i * step);
          render();
          const a = document.createElement('a');
          a.download = shot.id + '_' + String(i).padStart(4, '0') + '.png';
          a.href = canvas.toDataURL('image/png');
          a.click();
          if (onProgress) onProgress(i, total + 1);
          i++;
          setTimeout(next, 30);
        }
        next();
      });
    },

    renderAt: function (shotIdx, ms) {
      const keep = { i: state.shotIdx, t: state.t };
      state.shotIdx = shotIdx;
      state.t = ms;
      render();
      state.shotIdx = keep.i;
      state.t = keep.t;
    }
  };

  if (typeof window !== 'undefined') window.Board = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
