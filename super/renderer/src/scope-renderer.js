/* v3「示波器」—— 8 镜 · 1080×1920 · 30fps · 确定性逐帧
 *
 * 为什么是示波器，不是第三种"版面"：
 *   v1 深空蓝、v2 制图台，都是在平面上排布信息。
 *   但 RAII 讲的事情本质是「构造与析构在时间上必须配对」——
 *   那是两条时间序列的关系，不是一张图能说尽的。
 *   示波器就是测量时间的仪器：横轴是时间，两条通道叠在一起，
 *   一条回到基线，一条停在半空。这个落差本身就是论证。
 *
 * 确定性：同一 t 必产同一帧。所有"随机"都来自固定种子的 mulberry32，
 * 噪声用正弦叠加而非 Math.random，导出整镜序列时不会闪烁。
 * 辉光不用 shadowBlur（软件高斯核，成本随面积×核半径爆），
 * 改用三段粗细不同的描边叠出来。
 */
(function () {
  'use strict';

  const W = 1080, H = 1920, FPS = 30;

  /* ---------------- 配色 ---------------- */
  const C = {
    bg0: '#0C1310', bg1: '#030605',
    grid: '#14332A', gridMajor: '#1F5138',
    grn: '#5EF2A0', grnMid: '#2E8F63', grnDim: '#1B4A36',
    amb: '#F2A93B', ambMid: '#96671D', ambDim: '#4A3410',
    red: '#E8503A',
    ink: '#CBDAD0', ink2: '#6E8B7A', ink3: '#39524A',
    paper: '#E8E4D8'
  };

  // 等宽栈必须显式写中文字体：Skia（Node 端离线渲染）不做 monospace 的隐式 CJK fallback，
  // 只靠通用族会把这行底注画成一排豆腐块。这里是仪器风格，用无衬线兜底而不是宋体。
  const F_MONO = 'ui-monospace,Consolas,"Courier New","Noto Sans SC","Microsoft YaHei","SimSun",monospace';
  const F_UI = '"Microsoft YaHei","PingFang SC","Noto Sans SC",system-ui,sans-serif';

  /* ---------------- 版面 ---------------- */
  const L = {
    x0: 96, x1: 984,
    yTop: 316, yBot: 1452,
    ch1: 700, ch2: 1148,
    amp: 248
  };

  /* ---------------- 工具 ---------------- */
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const seg = (t, a, b) => clamp01((t - a) / (b - a));
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  // 固定种子，保证每次导出同一序列
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

  // 平滑噪声：正弦叠加，确定性，比 rng 更适合连续信号
  function noise(t, f1, f2, seed) {
    return (Math.sin(t * f1 + seed) * 0.55 + Math.sin(t * f2 + seed * 2.7) * 0.45);
  }

  const xAt = p => lerp(L.x0, L.x1, clamp01(p));

  /* ---------------- 底层绘制 ---------------- */

  function drawGlass(c) {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, C.bg0);
    g.addColorStop(1, C.bg1);
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    // 屏幕四角轻微内暗，模拟玻璃罩
    const v = c.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.78);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.55)');
    c.fillStyle = v;
    c.fillRect(0, 0, W, H);
  }

  // 荧光余晖：这里刻意不用 shadowBlur
  function glowStroke(c, path, color, w, alpha) {
    c.save();
    c.lineJoin = 'round';
    c.lineCap = 'round';
    c.strokeStyle = hexA(color, alpha * 0.10);
    c.lineWidth = w * 5.5;
    c.beginPath(); path(c); c.stroke();
    c.strokeStyle = hexA(color, alpha * 0.26);
    c.lineWidth = w * 2.6;
    c.beginPath(); path(c); c.stroke();
    c.strokeStyle = hexA(color, alpha);
    c.lineWidth = w;
    c.beginPath(); path(c); c.stroke();
    c.restore();
  }

  function drawGrid(c, reveal) {
    const r = clamp01(reveal);
    if (r <= 0) return;
    const cols = 10, rows = 12;
    const h = L.yBot - L.yTop, w = L.x1 - L.x0;

    c.save();
    c.beginPath();
    c.rect(L.x0, L.yTop, w * r, h);
    c.clip();

    for (let i = 0; i <= cols; i++) {
      const x = L.x0 + w * i / cols;
      const major = i === 0 || i === cols;
      c.strokeStyle = major ? hexA(C.gridMajor, 0.9) : hexA(C.grid, 0.7);
      c.lineWidth = major ? 2 : 1;
      c.beginPath(); c.moveTo(x, L.yTop); c.lineTo(x, L.yBot); c.stroke();
    }
    for (let j = 0; j <= rows; j++) {
      const y = L.yTop + h * j / rows;
      const major = j === 0 || j === rows;
      c.strokeStyle = major ? hexA(C.gridMajor, 0.9) : hexA(C.grid, 0.7);
      c.lineWidth = major ? 2 : 1;
      c.beginPath(); c.moveTo(L.x0, y); c.lineTo(L.x1, y); c.stroke();
    }

    // 细刻度：每格再切五份
    c.strokeStyle = hexA(C.grid, 0.32);
    c.lineWidth = 1;
    for (let i = 0; i <= cols * 5; i++) {
      const x = L.x0 + w * i / (cols * 5);
      if (i % 5 === 0) continue;
      c.beginPath(); c.moveTo(x, L.yTop); c.lineTo(x, L.yTop + 9); c.stroke();
      c.beginPath(); c.moveTo(x, L.yBot); c.lineTo(x, L.yBot - 9); c.stroke();
    }
    c.restore();

    // 基线：两条通道各自的零位
    c.save();
    c.setLineDash([10, 8]);
    c.strokeStyle = hexA(C.grn, 0.16);
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(L.x0, L.ch1); c.lineTo(L.x0 + w * r, L.ch1); c.stroke();
    c.strokeStyle = hexA(C.amb, 0.13);
    c.beginPath(); c.moveTo(L.x0, L.ch2); c.lineTo(L.x0 + w * r, L.ch2); c.stroke();
    c.restore();
  }

  function drawAxisLabels(c, tdiv, vdiv) {
    c.save();
    c.font = '15px ' + F_MONO;
    c.fillStyle = hexA(C.ink2, 0.75);
    c.textAlign = 'center';
    for (let i = 0; i <= 10; i += 2) {
      const x = L.x0 + (L.x1 - L.x0) * i / 10;
      c.fillText((i * tdiv).toFixed(1), x, L.yBot + 26);
    }
    c.textAlign = 'right';
    c.fillText('s', L.x1 + 40, L.yBot + 26);

    c.textAlign = 'right';
    c.fillStyle = hexA(C.ink2, 0.6);
    c.font = '13px ' + F_MONO;
    c.fillText('CH1', L.x0 - 14, L.ch1 + 4);
    c.fillText('CH2', L.x0 - 14, L.ch2 + 4);
    c.restore();
  }

  /* ---------------- 波形 ---------------- */

  // 直接按像素铺点，便于加噪声
  function tracePoints(events, head, base, amp, jitterAmp, seed) {
    const pts = [];
    const n = Math.max(2, Math.round((L.x1 - L.x0) * head / 6));
    for (let i = 0; i <= n; i++) {
      const p = head * i / n;
      const v = valueAt2(events, p);
      const nz = jitterAmp ? noise(p * 60, 137.5, 311.3, seed) * jitterAmp : 0;
      pts.push({ x: xAt(p), y: base - (v + nz) * amp });
    }
    return pts;
  }

  function valueAt2(events, p) {
    let prev = events[0];
    for (let i = 1; i < events.length; i++) {
      const e = events[i];
      if (p < e.t) {
        const k = e.t === prev.t ? 1 : (p - prev.t) / (e.t - prev.t);
        return lerp(prev.v, e.v, k);
      }
      prev = e;
    }
    return prev.v;
  }

  function pathFromPoints(pts) {
    return function (c) {
      c.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
    };
  }

  function drawTrace(c, opts) {
    const { events, head, base, color, jitter, seed, width } = opts;
    if (head <= 0) return;
    const pts = tracePoints(events, head, base, L.amp, jitter || 0, seed || 1);
    if (pts.length < 2) return;
    glowStroke(c, pathFromPoints(pts), color, width || 2, 1);

    // 写头附近提亮，模拟扫描线经过时的荧光
    const tail = pts.filter(p => p.x > xAt(head) - 190);
    if (tail.length > 2) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      glowStroke(c, pathFromPoints(tail), color, (width || 2) * 1.5, 0.55);
      c.restore();
    }
  }

  // 扫描光带
  function drawBeam(c, head, color) {
    if (head <= 0 || head >= 1) return;
    const x = xAt(head);
    const g = c.createLinearGradient(x - 46, 0, x + 46, 0);
    g.addColorStop(0, hexA(color, 0));
    g.addColorStop(0.5, hexA(color, 0.16));
    g.addColorStop(1, hexA(color, 0));
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = g;
    c.fillRect(x - 46, L.yTop, 92, L.yBot - L.yTop);
    c.strokeStyle = hexA(color, 0.7);
    c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(x, L.yTop); c.lineTo(x, L.yBot); c.stroke();
    c.restore();
  }

  function drawCursor(c, p, label, color, y0, y1) {
    const x = xAt(p);
    c.save();
    c.setLineDash([6, 6]);
    c.strokeStyle = hexA(color, 0.55);
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(x, y0 || L.yTop); c.lineTo(x, y1 || L.yBot); c.stroke();
    c.setLineDash([]);
    // 顶部三角
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(x, (y0 || L.yTop) + 2);
    c.lineTo(x - 7, (y0 || L.yTop) - 12);
    c.lineTo(x + 7, (y0 || L.yTop) - 12);
    c.closePath(); c.fill();
    if (label) {
      c.font = '15px ' + F_MONO;
      c.fillStyle = color;
      c.textAlign = 'center';
      c.fillText(label, x, (y0 || L.yTop) - 20);
    }
    c.restore();
  }

  /* ---------------- 文字 ---------------- */

  function tracked(c, text, x, y, spacing) {
    const chars = String(text).split('');
    let cx = x;
    for (let i = 0; i < chars.length; i++) {
      c.fillText(chars[i], cx, y);
      cx += c.measureText(chars[i]).width + spacing;
    }
    return cx;
  }

  function typewriter(c, text, p, x, y, opt) {
    opt = opt || {};
    const n = Math.floor(String(text).length * clamp01(p));
    if (n <= 0) return;
    c.fillStyle = opt.color || C.ink;
    c.font = (opt.size || 20) + 'px ' + (opt.mono ? F_MONO : F_UI);
    c.textAlign = 'left';
    c.fillText(String(text).slice(0, n), x, y);
    // 光标
    if (opt.caret !== false && n < String(text).length) {
      const w = c.measureText(String(text).slice(0, n)).width;
      c.fillStyle = opt.color || C.ink;
      c.fillRect(x + w + 2, y - (opt.size || 20) * 0.78, 3, (opt.size || 20) * 0.95);
    }
  }

  /* ---------------- 面板 ---------------- */

  function drawPlate(c, p, meta) {
    // 顶部铭牌
    c.save();
    c.fillStyle = hexA(C.ink, 0.04);
    c.fillRect(0, 0, W, 150);
    c.strokeStyle = hexA(C.gridMajor, 0.8);
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(0, 150); c.lineTo(W, 150); c.stroke();

    c.font = '600 21px ' + F_MONO;
    c.fillStyle = C.ink;
    c.textAlign = 'left';
    const tw = tracked(c, 'RAII · SCOPE', 62, 62, 3.5);

    c.font = '13px ' + F_MONO;
    c.fillStyle = hexA(C.ink2, 0.9);
    c.fillText('2000', tw + 10, 62);

    c.textAlign = 'right';
    c.fillStyle = hexA(C.ink2, 0.75);
    c.fillText(meta.sn || 'SN 20261028', W - 62, 62);

    // 状态条
    const on = clamp01((p - 0.1) / 0.3);
    const items = [
      ['TIME', meta.time || '500ms/div'],
      ['VOLT', meta.volt || '1.0V/div'],
      ['TRIG', meta.trig || 'AUTO'],
      ['MODE', meta.mode || 'DC']
    ];
    c.textAlign = 'left';
    c.font = '12px ' + F_MONO;
    let x = 62;
    for (let i = 0; i < items.length; i++) {
      const a = clamp01(on * 4 - i);
      c.fillStyle = hexA(C.ink3, 0.9 * a);
      c.fillText(items[i][0], x, 108);
      c.fillStyle = hexA(i === 2 && meta.trigOn ? C.red : C.grn, a);
      c.fillText(items[i][1], x, 128);
      x += 132;
    }

    // 触发灯
    const lit = meta.trigOn ? 1 : 0;
    c.beginPath();
    c.arc(W - 82, 118, 7, 0, Math.PI * 2);
    c.fillStyle = lit ? C.red : hexA(C.ink3, 0.7);
    c.fill();
    if (lit) {
      c.beginPath();
      c.arc(W - 82, 118, 13, 0, Math.PI * 2);
      c.fillStyle = hexA(C.red, 0.18);
      c.fill();
    }
    c.restore();
  }

  function drawFoot(c, p, lines) {
    // 底部告示条
    c.save();
    c.strokeStyle = hexA(C.gridMajor, 0.7);
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(0, 1560); c.lineTo(W, 1560); c.stroke();

    c.font = '16px ' + F_UI;
    c.textAlign = 'left';
    for (let i = 0; i < lines.length; i++) {
      const a = clamp01(p * 3 - i * 0.6);
      if (a <= 0) continue;
      c.fillStyle = hexA(C.ink2, 0.95 * a);
      c.fillText(lines[i], 96, 1614 + i * 34);
    }
    c.restore();
  }

  function drawMeasure(c, boxes, p) {
    // 右下角测量框
    const bw = 380, bh = 44 + boxes.length * 46;
    const bx = W - 96 - bw, by = 300;
    c.save();
    const a = clamp01(p * 2);
    c.fillStyle = hexA(C.ink, 0.03 * a);
    c.fillRect(bx, by, bw, bh);
    c.strokeStyle = hexA(C.gridMajor, a);
    c.lineWidth = 1;
    c.strokeRect(bx, by, bw, bh);
    c.font = '12px ' + F_MONO;
    c.fillStyle = hexA(C.ink3, a);
    c.textAlign = 'left';
    c.fillText('MEASURE', bx + 16, by + 26);
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      const y = by + 66 + i * 46;
      c.font = '15px ' + F_MONO;
      c.fillStyle = hexA(C.ink2, a);
      c.fillText(b.k, bx + 16, y);
      c.fillStyle = hexA(b.color || C.ink, a);
      c.textAlign = 'right';
      c.fillText(b.v, bx + bw - 16, y);
      c.textAlign = 'left';
    }
    c.restore();
  }

  function drawChannelTag(c, y, text, color, a) {
    c.save();
    c.globalAlpha = a === undefined ? 1 : a;
    c.fillStyle = color;
    c.fillRect(30, y - 13, 3, 26);
    c.font = '13px ' + F_MONO;
    c.textAlign = 'left';
    c.fillStyle = hexA(color, 0.85);
    c.fillText(text, 42, y + 5);
    c.restore();
  }

  /* ---------------- 镜头脚本 ---------------- */

  // 每镜 4 秒；p = 0..1 是镜头内进度
  const SHOTS = [
    {
      id: 'P01', name: '上电', dur: 4000,
      draw: function (c, p) {
        drawGrid(c, easeOut(clamp01(p / 0.55)));
        drawAxisLabels(c, 0.5, 1.0);
        drawPlate(c, p, { sn: 'SN 20261028', time: '500ms/div', volt: '1.0V/div', trig: 'AUTO', mode: 'DC' });
        drawBeam(c, seg(p, 0.15, 0.92), C.grn);
        // 自检文字
        typewriter(c, 'SELF TEST ...', seg(p, 0.10, 0.45), 96, 1560 - 4, { size: 18, color: C.grn, mono: true });
        typewriter(c, 'CH1 READY / CH2 READY', seg(p, 0.42, 0.78), 96, 1614, { size: 16, color: C.ink2, mono: true, caret: false });
        drawFoot(c, p, []);
      }
    },

    {
      id: 'P02', name: '构造', dur: 4000,
      draw: function (c, p) {
        drawGrid(c, 1);
        drawAxisLabels(c, 0.5, 1.0);
        drawPlate(c, p, { time: '500ms/div', volt: '1.0V/div', trig: 'AUTO', mode: 'DC' });
        const ev = [
          { t: 0, v: 0 }, { t: 0.16, v: 0 }, { t: 0.18, v: 1 },
          { t: 0.62, v: 1 }, { t: 0.64, v: 0.94 }, { t: 0.66, v: 1 },
          { t: 1, v: 1 }
        ];
        const head = seg(p, 0.02, 0.88);
        drawTrace(c, { events: ev, head, base: L.ch1, color: C.grn, jitter: 0.006, seed: 3, width: 2.2 });
        drawCursor(c, 0.18, 'C1', C.paper);
        drawChannelTag(c, L.ch1 - 30, 'CH1  FILE f{"data.txt"}', C.grn, clamp01(p * 3));
        drawBeam(c, head, C.grn);

        drawMeasure(c, [
          { k: 'V(peak)', v: '+1.00 V', color: C.grn },
          { k: 'CTOR', v: '0.18 s', color: C.ink }
        ], clamp01(p * 2));

        typewriter(c, 'std::ifstream f{"data.txt"};', seg(p, 0.20, 0.62), 96, 1614,
          { size: 19, color: C.ink, mono: true });
        drawFoot(c, p, []);
        if (p > 0.62) {
          c.font = '16px ' + F_UI;
          c.fillStyle = hexA(C.ink2, clamp01((p - 0.62) * 3));
          c.textAlign = 'left';
          c.fillText('资源在这里被拿走，不是在使用的时候，是在构造的时候', 96, 1688);
        }
      }
    },

    {
      id: 'P03', name: '正常析构', dur: 4000,
      draw: function (c, p) {
        drawGrid(c, 1);
        drawAxisLabels(c, 0.5, 1.0);
        drawPlate(c, p, { time: '500ms/div', volt: '1.0V/div', trig: 'AUTO', mode: 'DC' });
        const ev = [
          { t: 0, v: 1 }, { t: 0.60, v: 1 }, { t: 0.62, v: 0 },
          { t: 0.64, v: 0.05 }, { t: 0.66, v: 0 }, { t: 1, v: 0 }
        ];
        const head = seg(p, 0.02, 0.9);
        drawTrace(c, { events: ev, head, base: L.ch1, color: C.grn, jitter: 0.006, seed: 5, width: 2.2 });
        drawCursor(c, 0.18, 'C1', C.paper);
        drawCursor(c, 0.62, 'C2', C.paper);
        drawChannelTag(c, L.ch1 - 30, 'CH1  scope exit', C.grn, clamp01(p * 3));
        drawBeam(c, head, C.grn);

        // ΔT 标注
        const a = clamp01((p - 0.6) * 4);
        if (a > 0) {
          c.save();
          c.globalAlpha = a;
          const y = L.ch1 + 96;
          c.strokeStyle = hexA(C.paper, 0.7);
          c.lineWidth = 1;
          c.beginPath();
          c.moveTo(xAt(0.18), y); c.lineTo(xAt(0.62), y);
          c.moveTo(xAt(0.18), y - 9); c.lineTo(xAt(0.18), y + 9);
          c.moveTo(xAt(0.62), y - 9); c.lineTo(xAt(0.62), y + 9);
          c.stroke();
          c.font = '17px ' + F_MONO;
          c.fillStyle = C.paper;
          c.textAlign = 'center';
          c.fillText('\u0394T = 16.0 ms', (xAt(0.18) + xAt(0.62)) / 2, y - 20);
          c.restore();
        }

        drawMeasure(c, [
          { k: '\u0394T', v: '16.0 ms', color: C.paper },
          { k: 'STATUS', v: 'PAIRED', color: C.grn }
        ], clamp01(p * 2));

        typewriter(c, '}  // 离开作用域，析构被调用', seg(p, 0.22, 0.66), 96, 1614,
          { size: 19, color: C.ink, mono: true });
        drawFoot(c, p, []);
        if (p > 0.66) {
          c.font = '16px ' + F_UI;
          c.fillStyle = hexA(C.ink2, clamp01((p - 0.66) * 3));
          c.fillText('没有 finally，没有手动 close，配对由编译器保证', 96, 1688);
        }
      }
    },

    {
      id: 'P04', name: '异常', dur: 4000,
      draw: function (c, p) {
        // 触发瞬间整体轻微抖动
        const shake = p > 0.46 && p < 0.62 ? (1 - seg(p, 0.46, 0.62)) * 3 : 0;
        c.save();
        if (shake) c.translate(Math.sin(p * 900) * shake, Math.cos(p * 700) * shake);

        drawGrid(c, 1);
        drawAxisLabels(c, 0.5, 1.0);
        drawPlate(c, p, { time: '500ms/div', volt: '1.0V/div', trig: 'TRIG', mode: 'DC', trigOn: p > 0.46 });

        const ev = [
          { t: 0, v: 1 }, { t: 0.44, v: 1 }, { t: 0.46, v: 1.06 },
          { t: 0.50, v: 0.92 }, { t: 0.54, v: 1.05 }, { t: 0.58, v: 0.95 },
          { t: 0.62, v: 1.02 }, { t: 1, v: 1 }
        ];
        const head = seg(p, 0.02, 0.92);
        drawTrace(c, {
          events: ev, head, base: L.ch1, color: C.red,
          jitter: p > 0.46 ? 0.030 : 0.005, seed: 7, width: 2.2
        });
        drawBeam(c, head, C.red);
        drawChannelTag(c, L.ch1 - 30, 'CH1  unwinding', C.red, clamp01(p * 3));

        // 触发点
        if (p > 0.46) {
          drawCursor(c, 0.46, 'TRIG', C.red);
          c.save();
          const a = clamp01((p - 0.46) * 6);
          c.font = '600 20px ' + F_MONO;
          c.fillStyle = hexA(C.red, a);
          c.textAlign = 'left';
          c.fillText('throw std::runtime_error{"bad"};', 96, 1614);
          c.font = '13px ' + F_MONO;
          c.fillStyle = hexA(C.red, a * 0.8);
          c.fillText('\u2191 信号在这里断开，但对象没有逃掉', 96, 1646);
          c.restore();
        }

        drawMeasure(c, [
          { k: 'TRIG', v: '0.46 s', color: C.red },
          { k: 'V', v: '+1.06 V', color: C.ink }
        ], clamp01(p * 2));
        c.restore();
      }
    },

    {
      id: 'P05', name: '栈展开', dur: 4000,
      draw: function (c, p) {
        drawGrid(c, 1);
        drawAxisLabels(c, 0.5, 1.0);
        drawPlate(c, p, { time: '500ms/div', volt: '1.0V/div', trig: 'TRIG', mode: 'DC', trigOn: true });

        // 阶梯：每级代表一层析构
        const ev = [
          { t: 0, v: 1 }, { t: 0.20, v: 1 }, { t: 0.22, v: 0.66 },
          { t: 0.42, v: 0.66 }, { t: 0.44, v: 0.33 },
          { t: 0.62, v: 0.33 }, { t: 0.64, v: 0 },
          { t: 1, v: 0 }
        ];
        const head = seg(p, 0.02, 0.92);
        drawTrace(c, { events: ev, head, base: L.ch1, color: C.grn, jitter: 0.004, seed: 11, width: 2.2 });
        drawBeam(c, head, C.grn);
        drawChannelTag(c, L.ch1 - 30, 'CH1  stack unwinding', C.grn, clamp01(p * 3));

        // 三层标注
        const steps = [
          { t: 0.22, v: 0.83, txt: '~Buf()  f1' },
          { t: 0.44, v: 0.50, txt: '~File()  f2' },
          { t: 0.64, v: 0.17, txt: '~Conn()  f3' }
        ];
        for (let i = 0; i < steps.length; i++) {
          const s = steps[i];
          const a = clamp01((p - s.t) * 6);
          if (a <= 0) continue;
          c.save();
          c.globalAlpha = a;
          c.strokeStyle = hexA(C.ink2, 0.6);
          c.lineWidth = 1;
          c.beginPath();
          c.moveTo(xAt(s.t), L.ch1 - s.v * L.amp);
          c.lineTo(xAt(s.t) + 56, L.ch1 - s.v * L.amp);
          c.stroke();
          c.font = '16px ' + F_MONO;
          c.fillStyle = C.paper;
          c.textAlign = 'left';
          c.fillText(s.txt, xAt(s.t) + 64, L.ch1 - s.v * L.amp + 5);
          c.restore();
        }

        drawMeasure(c, [
          { k: 'DTORS', v: '3', color: C.grn },
          { k: 'STATUS', v: 'PAIRED', color: C.grn }
        ], clamp01(p * 2));

        typewriter(c, '// 逐层析构，一层都没漏', seg(p, 0.30, 0.72), 96, 1614,
          { size: 19, color: C.ink2, mono: true });
        drawFoot(c, p, []);
      }
    },

    {
      id: 'P06', name: '对比上场', dur: 4000,
      draw: function (c, p) {
        drawGrid(c, 1);
        drawAxisLabels(c, 0.5, 1.0);
        drawPlate(c, p, { time: '500ms/div', volt: '1.0V/div', trig: 'TRIG', mode: 'DC', trigOn: true });

        const head = seg(p, 0.02, 0.94);

        // CH1：异常后持平
        drawTrace(c, {
          events: [{ t: 0, v: 1 }, { t: 0.5, v: 1 }, { t: 0.52, v: 1.04 }, { t: 1, v: 1 }],
          head, base: L.ch1, color: C.grn, jitter: 0.012, seed: 13, width: 2.2
        });
        // CH2：后上场
        drawTrace(c, {
          events: [{ t: 0, v: 0 }, { t: 0.36, v: 0 }, { t: 0.38, v: 1 }, { t: 1, v: 1 }],
          head, base: L.ch2, color: C.amb, jitter: 0.006, seed: 17, width: 2.2
        });

        drawChannelTag(c, L.ch1 - 30, 'CH1  RAII', C.grn, clamp01(p * 3));
        const a2 = clamp01((p - 0.34) * 5);
        drawChannelTag(c, L.ch2 - 30, 'CH2  MANUAL', C.amb, a2);

        drawCursor(c, 0.38, 'C1', C.paper);
        drawBeam(c, head, C.grn);

        drawMeasure(c, [
          { k: 'CH1', v: 'PAIRED', color: C.grn },
          { k: 'CH2', v: 'PENDING', color: C.amb }
        ], clamp01(p * 2));

        if (p > 0.40) {
          c.save();
          c.globalAlpha = clamp01((p - 0.40) * 4);
          c.font = '16px ' + F_UI;
          c.fillStyle = C.ink2;
          c.textAlign = 'left';
          c.fillText('第二条线是同一个异常，但没人替它收尾', 96, 1614);
          c.restore();
        }
        drawFoot(c, p, []);
      }
    },

    {
      id: 'P07', name: '泄漏', dur: 4000,
      draw: function (c, p) {
        drawGrid(c, 1);
        drawAxisLabels(c, 0.5, 1.0);
        drawPlate(c, p, { time: '500ms/div', volt: '1.0V/div', trig: 'TRIG', mode: 'DC', trigOn: true });
        const head = seg(p, 0.02, 0.95);

        // CH1 已回零
        drawTrace(c, {
          events: [{ t: 0, v: 0 }, { t: 1, v: 0 }],
          head, base: L.ch1, color: C.grn, jitter: 0.003, seed: 19, width: 2.2
        });
        // CH2 停在半空
        drawTrace(c, {
          events: [{ t: 0, v: 1 }, { t: 1, v: 1 }],
          head, base: L.ch2, color: C.amb, jitter: 0.005, seed: 23, width: 2.2
        });

        // 虚线延伸
        const a = clamp01((p - 0.35) * 3);
        if (a > 0) {
          c.save();
          c.globalAlpha = a;
          c.setLineDash([9, 9]);
          c.strokeStyle = hexA(C.amb, 0.75);
          c.lineWidth = 1.6;
          c.beginPath();
          c.moveTo(xAt(0.95), L.ch2 - L.amp);
          c.lineTo(L.x1 + 0, L.ch2 - L.amp);
          c.stroke();
          c.setLineDash([]);
          c.font = '600 17px ' + F_MONO;
          c.fillStyle = C.amb;
          c.textAlign = 'right';
          c.fillText('\u2192 \u221E', L.x1 - 8, L.ch2 - L.amp - 14);
          c.restore();
        }

        drawChannelTag(c, L.ch1 - 30, 'CH1  back to baseline', C.grn, 1);
        drawChannelTag(c, L.ch2 - 30, 'CH2  still high', C.amb, 1);
        drawBeam(c, head, C.grn);

        drawMeasure(c, [
          { k: 'LEAKED', v: '4,096 B', color: C.amb },
          { k: 'CH1', v: 'PAIRED', color: C.grn }
        ], clamp01(p * 2));

        if (p > 0.42) {
          c.save();
          c.globalAlpha = clamp01((p - 0.42) * 4);
          c.font = '600 20px ' + F_MONO;
          c.fillStyle = C.amb;
          c.textAlign = 'left';
          c.fillText('// 进程退出前，这 4KB 一直挂着', 96, 1614);
          c.restore();
        }
        drawFoot(c, p, []);
      }
    },

    {
      id: 'P08', name: '读数', dur: 4000,
      draw: function (c, p) {
        drawGrid(c, 1);
        drawAxisLabels(c, 0.5, 1.0);
        drawPlate(c, p, { time: '500ms/div', volt: '1.0V/div', trig: 'STOP', mode: 'DC', trigOn: false });

        // 两条完整静态线
        drawTrace(c, {
          events: [{ t: 0, v: 0 }, { t: 0.55, v: 0 }, { t: 0.57, v: 1 }, { t: 0.88, v: 1 }, { t: 0.9, v: 0 }, { t: 1, v: 0 }],
          head: 1, base: L.ch1, color: C.grn, jitter: 0.004, seed: 29, width: 2.2
        });
        drawTrace(c, {
          events: [{ t: 0, v: 0 }, { t: 0.55, v: 0 }, { t: 0.57, v: 1 }, { t: 1, v: 1 }],
          head: 1, base: L.ch2, color: C.amb, jitter: 0.004, seed: 31, width: 2.2
        });

        drawChannelTag(c, L.ch1 - 30, 'CH1  RAII', C.grn, 1);
        drawChannelTag(c, L.ch2 - 30, 'CH2  MANUAL', C.amb, 1);

        // 大读数
        c.save();
        const a = clamp01(p * 2.2);
        c.globalAlpha = a;
        c.font = '600 46px ' + F_MONO;
        c.textAlign = 'left';
        c.fillStyle = C.grn;
        c.fillText('PAIRED', 96, 1652);
        c.fillStyle = hexA(C.ink3, 0.9);
        c.fillText('/', 96 + 232, 1652);
        c.fillStyle = C.amb;
        c.fillText('LEAKED', 96 + 272, 1652);

        c.font = '14px ' + F_MONO;
        c.fillStyle = hexA(C.ink2, 0.9);
        c.fillText('\u0394T 16.0ms', 96, 1686);
        c.fillText('\u0394T \u221E', 96 + 272, 1686);
        c.restore();

        typewriter(c, 'RAII 不是语法糖，是编译器替你写在每个出口的 finally。',
          seg(p, 0.25, 0.95), 96, 1766, { size: 21, color: C.paper });
      }
    }
  ];

  /* ---------------- 引擎 ---------------- */

  const state = {
    shotIdx: 0, t: 0, playing: true, loop: true,
    labels: true, safe: false
  };

  let canvas = null, ctx = null, onChange = null, raf = 0, last = 0;

  function render() {
    const shot = SHOTS[state.shotIdx];
    const p = clamp01(state.t / shot.dur);
    ctx.save();
    drawGlass(ctx);
    shot.draw(ctx, p);
    // 帧号水印（导出序列时便于核对）
    ctx.font = '12px ' + F_MONO;
    ctx.fillStyle = hexA(C.ink3, 0.55);
    ctx.textAlign = 'right';
    ctx.fillText(shot.id + '  ' + String(state.t).padStart(4, '0') + 'ms', W - 96, L.yTop - 16);
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
    W: W, H: H, FPS: FPS, SHOTS: SHOTS, state: state,

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
      const a = document.createElement('a');
      a.download = SHOTS[state.shotIdx].id + '_' + String(state.t).padStart(4, '0') + '.png';
      a.href = canvas.toDataURL('image/png');
      a.click();
    },

    exportSequence: function (frameMs, onProgress) {
      const shot = SHOTS[state.shotIdx];
      const step = frameMs || Math.round(1000 / FPS);
      const total = Math.round(shot.dur / step);
      const wasPlaying = state.playing;
      state.playing = false;
      let i = 0;
      return new Promise(function (resolve) {
        function next() {
          if (i > total) {
            state.playing = wasPlaying;
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

    // 测试用：不依赖动画循环，直接渲染指定时刻的绘制序列
    renderAt: function (shotIdx, ms) {
      const keep = { i: state.shotIdx, t: state.t };
      state.shotIdx = shotIdx;
      state.t = ms;
      render();
      state.shotIdx = keep.i;
      state.t = keep.t;
    }
  };

  if (typeof window !== 'undefined') window.Scope = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
