/* ============================================================
   30 秒竖屏知识片 · 程序化渲染器
   镜头：S03 异常炸开 / S05 下坠碎裂 / S06 结构重组
   参考：实战演练_30秒竖屏_RAII/2_分镜表.md、3_逐镜提示词.md
   设计原则：
     1. 所有画面由时间 t 决定（同一个 t 永远画出同一帧）→ 可逐帧导出后用 ffmpeg 合成
     2. 视觉锚点与提示词完全一致（底色 #0B1220→#05070C / 青色 #22D3EE / 红光 #F43F5E）
     3. 代码渲染不生成文字也能有字：术语用矢量文字单独画，AI 版则留给后期字幕
   ============================================================ */
(() => {
  const W = 1080, H = 1920, FPS = 30;

  /* ---------------- 基础工具 ---------------- */
  const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => { t = clamp01(t); return t * t * (3 - 2 * t); };
  const easeOut = t => 1 - Math.pow(1 - clamp01(t), 3);
  const easeIn = t => Math.pow(clamp01(t), 3);
  const TAU = Math.PI * 2;

  // 固定种子随机：保证每次刷新、每次导出帧完全一致
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const C = {
    bgTop: '#0B1220', bgBot: '#05070C',
    cyan: '#22D3EE', card: '#0F172A',
    red: '#F43F5E', white: '#E2F8FF',
  };
  const rgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };

  function rr(c, x, y, w, h, r) { // 圆角矩形路径（自己拼，避免 roundRect 兼容性）
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }

  /* ---------------- 背景：深空蓝 + 透视网格地板 ---------------- */
  function drawBG(c, t) {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, C.bgTop);
    g.addColorStop(1, C.bgBot);
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    const hy = H * 0.52;              // 地平线
    const breathe = 0.85 + 0.15 * Math.sin(t / 1400); // 网格呼吸

    c.save();
    c.lineWidth = 1.5;
    // 横向线：靠近观察者间距变大（幂函数）
    for (let i = 0; i <= 16; i++) {
      const k = i / 16;
      const y = hy + (H - hy) * Math.pow(k, 1.9);
      c.strokeStyle = rgba(C.cyan, (0.02 + 0.10 * k) * breathe);
      c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
    }
    // 纵向线：从灭点向画面外发散
    for (let j = -9; j <= 9; j++) {
      c.strokeStyle = rgba(C.cyan, 0.07 * breathe);
      c.beginPath();
      c.moveTo(W / 2 + j * 26, hy);
      c.lineTo(W / 2 + j * 240, H);
      c.stroke();
    }
    c.restore();

    // 地平线辉光
    const hg = c.createLinearGradient(0, hy - 120, 0, hy + 120);
    hg.addColorStop(0, 'rgba(34,211,238,0)');
    hg.addColorStop(0.5, 'rgba(34,211,238,0.10)');
    hg.addColorStop(1, 'rgba(34,211,238,0)');
    c.fillStyle = hg; c.fillRect(0, hy - 120, W, 240);

    // 暗角
    const v = c.createRadialGradient(W / 2, H * 0.45, H * 0.25, W / 2, H * 0.45, H * 0.85);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.55)');
    c.fillStyle = v; c.fillRect(0, 0, W, H);
  }

  /* ---------------- 主体：青色发光立方体（伪 3D） ---------------- */
  const V8 = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
  const FACES = [[0,1,2,3],[4,5,6,7],[0,1,5,4],[3,2,6,7],[0,3,7,4],[1,2,6,5]];

  function project(size, rotY) {
    const h = size / 2, cs = Math.cos(rotY), sn = Math.sin(rotY);
    return V8.map(([x, y, z]) => {
      const x0 = x * h, y0 = y * h, z0 = z * h;
      const xr = x0 * cs - z0 * sn, zr = x0 * sn + z0 * cs;
      const s = 1 / (1 + zr / 2800);           // 极轻透视，越远越小
      return { x: xr * s, y: y0 * s, z: zr };
    });
  }

  function drawCube(c, cx, cy, size, rotY, opt = {}) {
    const p = project(size, rotY);
    const order = FACES.map((f, idx) => {
      const z = f.reduce((s, i) => s + p[i].z, 0) / 4;
      return { f, idx, z };
    }).sort((a, b) => a.z - b.z);          // 远的先画

    c.save();
    // 外发光
    if (opt.glow !== false) {
      const g = c.createRadialGradient(cx, cy, size * 0.2, cx, cy, size * 1.5);
      g.addColorStop(0, rgba(C.cyan, 0.22 * (opt.glowMul || 1)));
      g.addColorStop(1, rgba(C.cyan, 0));
      c.fillStyle = g;
      c.fillRect(cx - size * 1.6, cy - size * 1.6, size * 3.2, size * 3.2);
    }
    c.translate(cx, cy);

    order.forEach(({ f, z }) => {
      const depth = clamp01(1 - (z + size * 0.8) / (size * 1.6));  // 越近越亮
      const alpha = lerp(0.06, 0.30, depth) * (opt.alpha ?? 1);
      c.beginPath();
      c.moveTo(p[f[0]].x, p[f[0]].y);
      for (let i = 1; i < 4; i++) c.lineTo(p[f[i]].x, p[f[i]].y);
      c.closePath();

      const fg = c.createLinearGradient(-size / 2, -size / 2, size / 2, size / 2);
      fg.addColorStop(0, `rgba(226,248,255,${alpha * 0.9})`);   // 左上受光
      fg.addColorStop(1, `rgba(34,211,238,${alpha * 0.45})`);
      c.fillStyle = fg;
      c.fill();

      c.strokeStyle = rgba(C.cyan, lerp(0.25, 0.95, depth) * (opt.alpha ?? 1));
      c.lineWidth = 2.5;
      c.stroke();
    });

    // 内部粒子（固定在盒内的几个点，慢速漂移）
    const r = rng(7);
    c.fillStyle = rgba(C.white, 0.85 * (opt.alpha ?? 1));
    for (let i = 0; i < 26; i++) {
      const bx = (r() - 0.5) * size * 0.8;
      const by = (r() - 0.5) * size * 0.8;
      const ph = r() * TAU;
      const wob = Math.sin((opt.time || 0) / 600 + ph) * size * 0.03;
      const s = 1.6 + r() * 2.4;
      c.globalAlpha = 0.45 + 0.5 * (0.5 + 0.5 * Math.sin((opt.time || 0) / 400 + ph));
      c.beginPath(); c.arc(bx + wob, by - wob * 0.6, s, 0, TAU); c.fill();
    }
    c.globalAlpha = 1;

    // 裂纹（S03/S05 用），画在正面上
    if (opt.crack > 0) {
      const cp = clamp01(opt.crack);
      c.strokeStyle = rgba(C.red, 0.9);
      c.lineWidth = 3;
      c.shadowColor = C.red; c.shadowBlur = 18;
      for (const path of [[[-0.5,-0.15],[-0.18,-0.05],[0.05,-0.22],[0.3,0.02],[0.52,0.3]],
                          [[0.02,-0.25],[-0.06,0.02],[0.12,0.16],[0.04,0.38]]]) {
        c.beginPath();
        const n = Math.max(2, Math.ceil(path.length * cp));
        for (let i = 0; i < n; i++) {
          const q = path[i];
          i ? c.lineTo(q[0] * size, q[1] * size) : c.moveTo(q[0] * size, q[1] * size);
        }
        c.stroke();
      }
      c.shadowBlur = 0;
    }
    c.restore();
  }

  /* ---------------- 道具：代码卡片 ---------------- */
  const CARD = { w: 720, h: 420, r: 16 };

  function drawCard(c, cx, cy, opt = {}) {
    const { w, h, r } = CARD;
    const a = opt.alpha ?? 1;
    const x = cx - w / 2, y = cy - h / 2;
    c.save();

    // 背面内发光
    const bg = c.shadowColor = rgba(C.cyan, 0.6);
    c.shadowBlur = 40;
    rr(c, x, y, w, h, r);
    c.fillStyle = `rgba(15,23,42,${0.60 * a})`;
    c.fill();
    c.shadowBlur = 0;

    // 描边
    rr(c, x, y, w, h, r);
    c.strokeStyle = rgba(C.cyan, 0.85 * a);
    c.lineWidth = 2;
    c.stroke();

    // 四角刻度线
    c.strokeStyle = rgba(C.cyan, 0.9 * a);
    c.lineWidth = 2.5;
    const tick = 22, pad = 12;
    const corners = [[x + pad, y + pad, 1, 1], [x + w - pad, y + pad, -1, 1],
                     [x + pad, y + h - pad, 1, -1], [x + w - pad, y + h - pad, -1, -1]];
    for (const [px, py, sx, sy] of corners) {
      c.beginPath();
      c.moveTo(px, py + sy * tick); c.lineTo(px, py); c.lineTo(px + sx * tick, py);
      c.stroke();
    }

    // 三行代码短线（长度不同，按亮度依次点亮）
    const lens = [0.62, 0.42, 0.30];
    const bri = opt.lines || [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      const ly = y + 96 + i * 62;
      const lw = w * lens[i];
      const b = clamp01(bri[i]);
      // 底色（未点亮）
      c.fillStyle = `rgba(34,211,238,${0.10 * a})`;
      rr(c, x + 64, ly, lw, 12, 6); c.fill();
      // 点亮部分
      if (b > 0) {
        c.save();
        c.shadowColor = C.cyan; c.shadowBlur = 22 * b;
        const lg = c.createLinearGradient(x + 64, 0, x + 64 + lw, 0);
        lg.addColorStop(0, rgba(C.cyan, 0.95 * b * a));
        lg.addColorStop(1, rgba(C.white, 0.75 * b * a));
        c.fillStyle = lg;
        rr(c, x + 64, ly, lw * b, 12, 6); c.fill();
        c.restore();
      }
    }
    c.restore();
  }

  /* ---------------- S03 · 0–4s 异常炸开 ---------------- */
  function drawS03(c, t) {
    drawBG(c, t);

    const cx = W / 2, cy = H * 0.35;
    // 卡片（S02 已经把它推到位，这里保持不动）
    drawCard(c, cx, cy, { lines: [1, 1, 1] });

    // 立方体缩小版在左下
    const cubeX = W * 0.28, cubeY = H * 0.68, cubeSize = 200;
    drawCube(c, cubeX, cubeY, cubeSize, 0.5 + t / 9000, {
      time: t,
      crack: clamp01((t - 3000) / 1000),   // 3–4s 出现裂纹
    });

    // 0–50ms 强白光（约 2 帧）
    if (t < 50) {
      c.fillStyle = `rgba(255,255,255,${1 - t / 50})`;
      c.fillRect(0, 0, W, H);
    }

    // 红裂纹：从卡片中心沿对角线扩散
    const p = clamp01((t - 50) / 1950);
    if (p > 0) {
      const r = rng(21);
      c.save();
      c.translate(cx, cy);
      c.shadowColor = C.red; c.shadowBlur = 26;
      c.lineCap = 'round';
      // 主裂纹（沿对角线）
      const segs = 9;
      c.beginPath();
      for (let i = 0; i <= segs * p; i++) {
        const k = i / segs;
        const x = (k - 0.5) * CARD.w * 1.05;
        const y = (k - 0.5) * CARD.h * 1.05 + Math.sin(k * 12) * 16;
        i ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.strokeStyle = rgba(C.red, 0.95);
      c.lineWidth = 5;
      c.stroke();
      // 分叉
      for (let b = 0; b < 5; b++) {
        const k = 0.18 + b * 0.16;
        if (k > p) break;
        const bx = (k - 0.5) * CARD.w * 1.05;
        const by = (k - 0.5) * CARD.h * 1.05;
        c.beginPath();
        c.moveTo(bx, by);
        c.lineTo(bx + (r() - 0.5) * 260 * p, by + (r() - 0.5) * 200 * p);
        c.strokeStyle = rgba(C.red, 0.6);
        c.lineWidth = 2.5;
        c.stroke();
      }
      c.restore();

      // 悬停碎片：位置固定，随 p 外扩后停住
      if (t > 400) {
        const fr = rng(99);
        const drift = smooth((t - 400) / 1600);
        for (let i = 0; i < 46; i++) {
          const ang = fr() * TAU, dist = 40 + fr() * 300;
          const sx = cx + Math.cos(ang) * dist * (0.4 + drift * 0.6);
          const sy = cy + Math.sin(ang) * dist * (0.28 + drift * 0.5);
          const s = 2 + fr() * 5;
          const float = Math.sin(t / 500 + i) * 6;
          c.save();
          c.translate(sx, sy + float);
          c.rotate(ang + t / 3000);
          c.fillStyle = rgba(fr() > 0.6 ? C.red : C.white, 0.55 + 0.4 * fr());
          c.fillRect(-s / 2, -s / 2, s, s * 1.6);
          c.restore();
        }
      }
    }

    // 曝光下降 15%（0.4–3s）
    const dim = t > 400 && t < 3000 ? smooth((t - 400) / 600) * 0.15 : 0;
    if (dim > 0) { c.fillStyle = `rgba(0,0,0,${dim})`; c.fillRect(0, 0, W, H); }

    // 3–4s 画面轻微左下偏移 2px
    if (t > 3000) {
      const off = smooth((t - 3000) / 1000) * 2;
      c.save();
      c.globalCompositeOperation = 'source-over';
      c.fillStyle = 'rgba(0,0,0,0)';
      c.translate(-off, off);
      c.restore();
    }
  }

  /* ---------------- S05 · 16–22s 下坠碎裂（6s） ---------------- */
  function drawS05(c, t, showLabels) {
    drawBG(c, t);

    const SX = W / 2, START = H * 0.38, GROUND = H * 0.70;
    const frames = [
      { y: H * 0.42, a: 0.25, lit: 0 },
      { y: H * 0.50, a: 0.40, lit: 0 },
      { y: H * 0.58, a: 0.60, lit: 0 },
    ];

    // 立方体下坠位置：自由落体（t²），4 秒落地
    const fallP = clamp01(t / 4000);
    const cubeY = lerp(START, GROUND, fallP * fallP);
    const landed = t >= 4000;

    // 作用域边框（会被穿过的层亮起）
    frames.forEach((f, i) => {
      const passT = 4000 * Math.sqrt(clamp01((f.y - START) / (GROUND - START)));
      const lit = t > passT ? clamp01((t - passT) / 260) : 0;
      const a = f.a + lit * 0.35;
      c.save();
      c.strokeStyle = rgba(C.cyan, a);
      c.lineWidth = 2 + lit * 2;
      if (lit > 0) { c.shadowColor = C.cyan; c.shadowBlur = 26 * lit; }
      rr(c, W * 0.12, f.y - 78, W * 0.76, 156, 18);
      c.stroke();
      c.restore();

      // 层标识（给代码看的结构，不是给观众的文案）
      c.fillStyle = rgba(C.cyan, 0.10 + lit * 0.18);
      c.fillRect(W * 0.12, f.y - 78, 6, 156);
    });

    if (!landed) {
      drawCube(c, SX, cubeY, 180, 0.6 + t / 8000, {
        time: t,
        crack: clamp01((t - 2800) / 1000) * 0.7,
        glowMul: 1 + fallP * 0.5,
      });
    } else {
      // ---- 碎裂：p1 扩散(4→5.5s)  p2 回落静止(5.5→6s) ----
      const p1 = clamp01((t - 4000) / 1500);
      const p2 = clamp01((t - 5500) / 500);
      const R = rng(2024);
      const N = 260;
      c.save();
      for (let i = 0; i < N; i++) {
        const ang = R() * TAU;
        const spd = 120 + R() * 620;
        const size = 1.5 + R() * 3.5;
        const delay = R() * 0.12;
        const pp = clamp01((p1 - delay) / (1 - delay));
        // 先向外扩散（减速），再轻微回落（重力）
        const dist = spd * easeOut(pp) * (1 - 0.25 * p2);
        const x = SX + Math.cos(ang) * dist;
        const y = GROUND + Math.sin(ang) * dist * 0.72 + 240 * pp * pp * (1 - 0.35 * p2);
        const alpha = (1 - 0.15 * p2) * (0.35 + 0.65 * R());
        c.fillStyle = rgba(R() > 0.78 ? C.red : C.cyan, alpha * (pp > 0.02 ? 1 : 0));
        // 极短拖尾
        const tail = 4 + pp * 14;
        c.fillRect(x, y, size, size + tail * (1 - pp * 0.6));
      }
      c.restore();

      // 落地冲击环
      if (t < 4700) {
        const k = clamp01((t - 4000) / 700);
        c.save();
        c.strokeStyle = rgba(C.cyan, 0.5 * (1 - k));
        c.lineWidth = 6 * (1 - k);
        c.beginPath();
        c.ellipse(SX, GROUND, 60 + 420 * easeOut(k), (60 + 420 * easeOut(k)) * 0.34, 0, 0, TAU);
        c.stroke();
        c.restore();
      }
    }

    // 三个鼓点时刻的轻微画面亮度脉冲（对齐 BGM）
    [1, 2, 3].forEach(i => {
      const f = frames[i - 1];
      const passT = 4000 * Math.sqrt(clamp01((f.y - START) / (GROUND - START)));
      const d = t - passT;
      if (d > 0 && d < 220) {
        c.fillStyle = `rgba(34,211,238,${0.06 * (1 - d / 220)})`;
        c.fillRect(0, 0, W, H);
      }
    });

    if (showLabels) drawShotLabel(c, 'S05 · 下坠碎裂 · 16–22s');
  }

  /* ---------------- S06 · 22–26s 结构重组 ---------------- */
  function drawS06(c, t, showLabels) {
    drawBG(c, t);

    const orbitP = clamp01((t - 3500) / 500);
    c.save();
    // 环绕 15°：这里用轻微旋转 + 位移模拟，避免整体出画
    c.translate(W / 2, H * 0.42);
    c.rotate(-0.026 * orbitP);
    c.scale(1 + 0.02 * orbitP, 1 + 0.02 * orbitP);
    c.translate(-W / 2, -H * 0.42);

    // --- 粒子汇聚（0–1s）---
    const conv = easeOut(clamp01(t / 1000));
    const R = rng(555);
    const N = 150;
    const nodeL1 = { x: W * 0.30, y: H * 0.34 }, nodeL2 = { x: W * 0.30, y: H * 0.46 };
    const nodeR = { x: W * 0.70, y: H * 0.40 };
    for (let i = 0; i < N; i++) {
      const ang = R() * TAU, dist = 200 + R() * 620;
      const sx = W / 2 + Math.cos(ang) * dist;
      const sy = H * 0.58 + Math.sin(ang) * dist * 0.5;
      const target = i % 3 === 0 ? nodeL1 : i % 3 === 1 ? nodeL2 : nodeR;
      const x = lerp(sx, target.x, conv);
      const y = lerp(sy, target.y, conv);
      const s = 2 + R() * 3;
      c.fillStyle = rgba(C.cyan, (0.15 + 0.75 * R()) * (1 - conv * 0.55));
      c.beginPath(); c.arc(x, y, s, 0, TAU); c.fill();
    }

    // --- 左栏：栈（两层堆叠方块，1–2.5s 描出）---
    const pL = clamp01((t - 1000) / 750);
    const pL2 = clamp01((t - 1750) / 750);
    drawStackBlock(c, nodeL1.x, nodeL1.y, 260, 92, pL);
    drawStackBlock(c, nodeL2.x, nodeL2.y, 260, 92, pL2);

    // --- 右栏：堆（发光圆环，1.4–2.5s）---
    const pR = clamp01((t - 1400) / 1100);
    if (pR > 0) {
      c.save();
      const r = 96;
      c.shadowColor = C.cyan; c.shadowBlur = 30;
      c.strokeStyle = rgba(C.cyan, 0.9);
      c.lineWidth = 3;
      c.beginPath();
      c.arc(nodeR.x, nodeR.y, r, -Math.PI / 2, -Math.PI / 2 + TAU * pR);
      c.stroke();
      c.shadowBlur = 0;
      // 内部光晕
      const g = c.createRadialGradient(nodeR.x, nodeR.y, 0, nodeR.x, nodeR.y, r);
      g.addColorStop(0, rgba(C.cyan, 0.30 * pR));
      g.addColorStop(1, rgba(C.cyan, 0));
      c.fillStyle = g;
      c.beginPath(); c.arc(nodeR.x, nodeR.y, r, 0, TAU); c.fill();
      // 内部漂浮点
      const rr2 = rng(31);
      for (let i = 0; i < 8; i++) {
        const a2 = rr2() * TAU, d2 = rr2() * r * 0.7;
        c.fillStyle = rgba(C.white, 0.6 * pR);
        c.beginPath();
        c.arc(nodeR.x + Math.cos(a2) * d2, nodeR.y + Math.sin(a2) * d2, 2 + rr2() * 3, 0, TAU);
        c.fill();
      }
      c.restore();
    }

    // --- 中线（2.5–3.5s 从左到右）---
    const pM = clamp01((t - 2500) / 1000);
    if (pM > 0) {
      const x0 = nodeL1.x + 140, x1 = nodeR.x - 110;
      c.save();
      c.shadowColor = C.cyan; c.shadowBlur = 22;
      c.strokeStyle = rgba(C.cyan, 0.95);
      c.lineWidth = 2.5;
      c.beginPath();
      c.moveTo(x0, H * 0.40);
      c.lineTo(lerp(x0, x1, pM), H * 0.40);
      c.stroke();
      c.restore();

      // 文档图标（中点右侧，抵达后出现）
      if (pM > 0.85) {
        const da = (pM - 0.85) / 0.15;
        const ix = x1 + 34, iy = H * 0.40;
        c.save();
        c.globalAlpha = da;
        c.strokeStyle = rgba(C.white, 0.9);
        c.lineWidth = 2;
        rr(c, ix - 18, iy - 24, 36, 48, 4);
        c.stroke();
        c.beginPath();
        for (let i = 0; i < 3; i++) {
          c.moveTo(ix - 10, iy - 10 + i * 12);
          c.lineTo(ix + 10, iy - 10 + i * 12);
        }
        c.stroke();
        c.restore();
      }
    }

    c.restore();

    // --- 术语标注（AI 版没有这一层，靠后期字幕叠）---
    if (showLabels) {
      c.save();
      c.fillStyle = rgba(C.white, 0.85);
      c.font = '600 44px "PingFang SC","Microsoft YaHei",sans-serif';
      c.textAlign = 'center';
      c.fillText('栈', W * 0.30, H * 0.52);
      c.fillText('堆', W * 0.70, H * 0.50);
      c.restore();
      drawShotLabel(c, 'S06 · 结构重组 · 22–26s');
    }
  }

  function drawStackBlock(c, x, y, w, h, p) {
    if (p <= 0) return;
    c.save();
    c.strokeStyle = rgba(C.cyan, 0.9);
    c.lineWidth = 3;
    c.shadowColor = C.cyan; c.shadowBlur = 20;
    // 用 dash 做"描出"效果，比缩放更像制图
    const per = 2 * (w + h);
    c.setLineDash([per * p, per]);
    rr(c, x - w / 2, y - h / 2, w, h, 10);
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = rgba(C.cyan, 0.10 * p);
    c.fill();
    c.restore();
  }

  function drawShotLabel(c, text) {
    c.save();
    c.fillStyle = 'rgba(226,248,255,0.35)';
    c.font = '500 30px ui-monospace,Menlo,Consolas,monospace';
    c.textAlign = 'left';
    c.fillText(text, 56, H - 96);   // 放在底部安全区里，仅给人看
    c.restore();
  }

  /* ---------------- 安全区参考线 ---------------- */
  function drawSafeArea(c) {
    c.save();
    c.strokeStyle = 'rgba(244,63,94,0.55)';
    c.lineWidth = 2;
    c.setLineDash([14, 12]);
    c.beginPath(); c.moveTo(0, H * 0.82); c.lineTo(W, H * 0.82); c.stroke(); // 底部 18%
    c.beginPath(); c.moveTo(W * 0.88, 0); c.lineTo(W * 0.88, H); c.stroke(); // 右侧 12%
    c.setLineDash([]);
    c.fillStyle = 'rgba(244,63,94,0.75)';
    c.font = '600 26px ui-monospace,monospace';
    c.fillText('底部 18% 安全区', 24, H * 0.82 - 18);
    c.save();
    c.translate(W * 0.88 - 16, 40);
    c.rotate(Math.PI / 2);
    c.fillText('右侧 12%', 0, 0);
    c.restore();
    c.restore();
  }

  /* ---------------- 镜头表 ---------------- */
  const SHOTS = [
    { id: 'S03', name: '异常炸开', from: 8, dur: 4000, draw: (c, t, L) => drawS03(c, t) },
    { id: 'S05', name: '下坠碎裂', from: 16, dur: 6000, draw: drawS05 },
    { id: 'S06', name: '结构重组', from: 22, dur: 4000, draw: drawS06 },
  ];

  /* ---------------- 对外接口 ---------------- */
  const state = {
    shotIdx: 0, t: 0, playing: true, loop: true,
    labels: true, safe: false, fps: FPS,
  };

  let canvas, ctx, rafId = null, lastTs = 0;
  const listeners = [];

  function render() {
    const shot = SHOTS[state.shotIdx];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    shot.draw(ctx, Math.min(state.t, shot.dur), state.labels);
    if (state.safe) drawSafeArea(ctx);
    listeners.forEach(fn => fn(state, shot));
  }

  function tick(ts) {
    if (!lastTs) lastTs = ts;
    const dt = ts - lastTs;
    lastTs = ts;
    if (state.playing) {
      state.t += dt;
      const shot = SHOTS[state.shotIdx];
      if (state.t >= shot.dur) {
        if (state.loop) state.t = state.t % shot.dur;
        else { state.t = shot.dur; state.playing = false; }
      }
    }
    render();
    rafId = requestAnimationFrame(tick);
  }

  window.Renderer = {
    W, H, FPS, SHOTS, state,
    init(cv) {
      canvas = cv;
      canvas.width = W; canvas.height = H;
      ctx = canvas.getContext('2d');
      render();
      rafId = requestAnimationFrame(tick);
    },
    select(i) { state.shotIdx = i; state.t = 0; render(); },
    seek(ms) {
      const shot = SHOTS[state.shotIdx];
      state.t = Math.max(0, Math.min(shot.dur, ms));
      render();
    },
    toggle() { state.playing = !state.playing; lastTs = 0; },
    onChange(fn) { listeners.push(fn); },
    // 导出当前帧：直接拿 canvas 的 PNG
    exportFrame() {
      render();
      const a = document.createElement('a');
      const shot = SHOTS[state.shotIdx];
      const f = Math.round(state.t / 1000 * state.fps);
      a.download = `${shot.id}_${String(f).padStart(4, '0')}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    },
    // 导出整镜帧序列（浏览器会连续弹下载，建议间隔 120ms）
    async exportSequence(interval = 120, onProgress) {
      const shot = SHOTS[state.shotIdx];
      const total = Math.round(shot.dur / 1000 * state.fps);
      const wasPlaying = state.playing;
      state.playing = false;
      for (let i = 0; i < total; i++) {
        state.t = (i / state.fps) * 1000;
        render();
        const a = document.createElement('a');
        a.download = `${shot.id}_${String(i).padStart(4, '0')}.png`;
        a.href = canvas.toDataURL('image/png');
        a.click();
        onProgress && onProgress(i + 1, total);
        await new Promise(r => setTimeout(r, interval));
      }
      state.playing = wasPlaying;
    },
  };
})();
