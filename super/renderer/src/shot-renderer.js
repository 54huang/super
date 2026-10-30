/* ============================================================
   30 秒竖屏知识片 · 程序化渲染器  v2「制图台」
   美术方向：工程图纸 / 印刷品 —— 纸底、墨线、朱红批注、真实可读代码
   镜头：S03 异常（8–12s）/ S05 作用域（16–22s）/ S06 结构（22–26s）

   为什么换掉 v1（深空蓝 + 发光立方体）：
     v1 是 2026 年 AIGC 的默认皮肤（青蓝渐变 + 线框 + 粒子），在任何信息流里都不出挑。
     v2 改用"纸"作为介质：暖白纸底 + 5mm 方格 + 墨线制图 + 朱红校对笔。
     反差来自"冷内容 × 暖印刷"，而且它天然自带叙事——代码写在纸上，批注是人的动作。

   渲染原则（和 v1 一致）：
     1. 画面完全由 t 决定，随机数用固定种子 → 同一帧永远同一张图，可逐帧导出
     2. 所有"文字"都是矢量绘制的，不依赖字体渲染差异极大的装饰效果
     3. 无 HUD、无时间码烧进画面（只保留设计内的图注）
   ============================================================ */
(() => {
  const W = 1080, H = 1920, FPS = 30;
  const TAU = Math.PI * 2;

  /* ---------------- 工具 ---------------- */
  const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => { t = clamp01(t); return t * t * (3 - 2 * t); };
  const easeOut = t => 1 - Math.pow(1 - clamp01(t), 3);
  const easeIn = t => Math.pow(clamp01(t), 2.6);
  const easeOutExpo = t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp01(t)));
  const backOut = t => { t = clamp01(t); const s = 1.7; return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); };
  // 区间进度：把任意时间段映射为 0-1
  const seg = (t, a, b) => clamp01((t - a) / (b - a));

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------------- 色板与字体 ---------------- */
  const P = {
    paperTop: '#F4EFE3', paperBot: '#E3D9C4',
    ink: '#1B1A17', ink2: '#4A463C',
    blue: '#2B4A6F', red: '#BE3A2B', yellow: '#D9A521',
  };
  const inkA = a => `rgba(27,26,23,${a})`;
  const blueA = a => `rgba(43,74,111,${a})`;
  const redA = a => `rgba(190,58,43,${a})`;

  // 字体栈的排序逻辑：越靠前越优先，找不到就往后落。
  // 思源宋体排在 SimSun 之前——它有真 700 字重，SimSun 没有，大字号下 SimSun 只能伪粗体。
  // 没装思源宋体的机器会自动落到 SimSun，行为不变。
  // 等宽栈里必须显式写出中文字体：Skia（Node 端渲染）不做 monospace 的隐式中日韩 fallback，
  // 只靠 monospace 通用族会把「调用来源」这类中文标签画成豆腐块。
  const F_DISPLAY = '"Songti SC","Source Han Serif CN","SimSun","Noto Serif SC",serif';
  const F_LABEL = '"Microsoft YaHei","PingFang SC","Noto Sans SC",sans-serif';
  const F_MONO = 'ui-monospace,Consolas,"Courier New","Source Han Serif CN","Songti SC","SimSun",monospace';

  /* ---------------- 纸：底色 + 方格 + 颗粒 + 暗角 ---------------- */
  let grainPat = null;
  function getGrain(c) {
    if (grainPat) return grainPat;
    const n = document.createElement('canvas');
    n.width = n.height = 160;
    const nc = n.getContext('2d');
    const img = nc.createImageData(160, 160);
    const r = rng(20261028);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 170 + r() * 85;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    nc.putImageData(img, 0, 0);
    grainPat = c.createPattern(n, 'repeat');
    return grainPat;
  }

  function drawPaper(c, t, opt = {}) {
    const g = c.createLinearGradient(0, 0, W * 0.3, H);
    g.addColorStop(0, P.paperTop);
    g.addColorStop(1, P.paperBot);
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    // 纸张不均匀受光（大块极淡暖斑）
    const bl = c.createRadialGradient(W * 0.28, H * 0.22, 100, W * 0.28, H * 0.22, H * 0.9);
    bl.addColorStop(0, 'rgba(255,252,244,0.55)');
    bl.addColorStop(1, 'rgba(255,252,244,0)');
    c.fillStyle = bl;
    c.fillRect(0, 0, W, H);

    // 方格：5mm 细格 + 25mm 粗格（用 36px / 180px 近似）
    c.save();
    c.lineWidth = 1;
    for (let x = 0; x <= W; x += 36) {
      c.strokeStyle = inkA(0.045);
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke();
    }
    for (let y = 0; y <= H; y += 36) {
      c.strokeStyle = inkA(0.045);
      c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
    }
    c.lineWidth = 1.4;
    for (let x = 0; x <= W; x += 180) {
      c.strokeStyle = inkA(0.10);
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke();
    }
    for (let y = 0; y <= H; y += 180) {
      c.strokeStyle = inkA(0.10);
      c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
    }
    c.restore();

    // 颗粒（印刷网点感）
    const pat = getGrain(c);
    if (pat) {
      c.save();
      c.globalAlpha = 0.055;
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = pat;
      c.fillRect(0, 0, W, H);
      c.restore();
    }

    // 暗角
    const v = c.createRadialGradient(W / 2, H * 0.42, H * 0.30, W / 2, H * 0.42, H * 0.92);
    v.addColorStop(0, 'rgba(60,48,30,0)');
    v.addColorStop(1, `rgba(60,48,30,${opt.vignette ?? 0.22})`);
    c.fillStyle = v;
    c.fillRect(0, 0, W, H);
  }

  /* ---------------- 绘图小工具 ---------------- */
  function rrPath(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }

  // 带字距的文字（画布没有 letter-spacing，逐字摆）
  function tracked(c, text, x, y, track = 0, align = 'left') {
    const chars = [...text];
    const widths = chars.map(ch => c.measureText(ch).width);
    const total = widths.reduce((s, v) => s + v, 0) + track * (chars.length - 1);
    let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    const prevAlign = c.textAlign;
    c.textAlign = 'left';
    chars.forEach((ch, i) => { c.fillText(ch, cx, y); cx += widths[i] + track; });
    c.textAlign = prevAlign;
    return total;
  }

  // 尺寸标注（制图语言：两端短竖线 + 箭头 + 中间数值）
  function dimH(c, x1, x2, y, label, color = P.blue, alpha = 1) {
    c.save();
    c.strokeStyle = color; c.fillStyle = color;
    c.globalAlpha = alpha;
    c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(x1, y); c.lineTo(x2, y); c.stroke();
    [x1, x2].forEach(x => {
      c.beginPath(); c.moveTo(x, y - 9); c.lineTo(x, y + 9); c.stroke();
      // 箭头
      const dir = x === x1 ? 1 : -1;
      c.beginPath();
      c.moveTo(x, y); c.lineTo(x + dir * 9, y - 4); c.lineTo(x + dir * 9, y + 4);
      c.closePath(); c.fill();
    });
    c.font = `11px ${F_MONO}`;
    c.textAlign = 'center';
    c.fillText(label, (x1 + x2) / 2, y - 8);
    c.restore();
  }

  // 引线 + 说明小字
  function leader(c, x1, y1, x2, y2, label, color = P.red, alpha = 1, alignRight = false) {
    c.save();
    c.globalAlpha = alpha;
    c.strokeStyle = color; c.fillStyle = color;
    c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    // 起点小圆
    c.beginPath(); c.arc(x1, y1, 3, 0, TAU); c.fill();
    c.font = `500 17px ${F_LABEL}`;
    c.textAlign = alignRight ? 'right' : 'left';
    c.fillText(label, x2 + (alignRight ? -10 : 10), y2 + 6);
    c.restore();
  }

  // 红章（校对章）
  function stamp(c, x, y, r, p, alpha = 1) {
    if (p <= 0) return;
    const s = lerp(1.45, 1, backOut(p));
    c.save();
    c.globalAlpha = alpha * clamp01(p * 2);
    c.translate(x, y);
    c.rotate(-0.14);
    c.scale(s, s);
    c.strokeStyle = P.red;
    c.lineWidth = 6;
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke();
    c.lineWidth = 2;
    c.beginPath(); c.arc(0, 0, r - 12, 0, TAU); c.stroke();
    // 叉
    c.lineWidth = 7;
    c.lineCap = 'round';
    const k = r * 0.52;
    c.beginPath(); c.moveTo(-k, -k); c.lineTo(k, k); c.stroke();
    c.beginPath(); c.moveTo(k, -k); c.lineTo(-k, k); c.stroke();
    c.restore();
  }

  // 手写波浪下划线（红色校对笔）
  function wavyUnderline(c, x1, x2, y, p, amp = 5) {
    if (p <= 0) return;
    const xe = lerp(x1, x2, p);
    c.save();
    c.strokeStyle = redA(0.92);
    c.lineWidth = 3;
    c.lineCap = 'round';
    c.beginPath();
    for (let x = x1; x <= xe; x += 4) {
      const yy = y + Math.sin((x - x1) / 9) * amp;
      x === x1 ? c.moveTo(x, yy) : c.lineTo(x, yy);
    }
    c.stroke();
    c.restore();
  }

  // 擦除式出现（clip 从中心向两侧展开，比淡入高级）
  function wipeH(c, x, y, w, h, p) {
    if (p <= 0) return;
    const pw = w * p;
    c.save();
    c.beginPath();
    c.rect(x + w / 2 - pw / 2, y, pw, h);
    c.clip();
    c.restore();
  }

  // 纸屑
  function scrap(c, x, y, w, h, rot, alpha, col) {
    c.save();
    c.globalAlpha = alpha;
    c.translate(x, y); c.rotate(rot);
    c.fillStyle = col || 'rgba(250,246,236,0.95)';
    c.fillRect(-w / 2, -h / 2, w, h);
    c.strokeStyle = inkA(0.25); c.lineWidth = 1;
    c.strokeRect(-w / 2, -h / 2, w, h);
    c.restore();
  }

  /* ==========================================================
     S01 · 0–4s 钩子：特写一张词条卡，把"常识"划掉
     字幕：你以为析构函数只清内存？
     ========================================================== */
  function drawS01(c, t) {
    drawPaper(c, t, { vignette: 0.32 });

    // 全片持续推近，制造压迫感——观众被迫看那一行字
    const zoom = lerp(1.0, 1.17, easeOut(seg(t, 0, 4000)));
    c.save();
    c.translate(W / 2, H * 0.42);
    c.scale(zoom, zoom);
    c.translate(-W / 2, -H * 0.42);

    const SW = 1240, SH = 1340;
    const SX = (W - SW) / 2, SY = H * 0.095;

    const pin = easeOutExpo(seg(t, 0, 420));
    c.save();
    c.shadowColor = 'rgba(50,38,20,0.20)';
    c.shadowBlur = 40; c.shadowOffsetY = 12;
    c.fillStyle = 'rgba(253,250,242,0.97)';
    c.fillRect(SX, SY, SW * pin, SH);
    c.restore();

    c.save();
    c.beginPath(); c.rect(SX, SY, SW * pin, SH); c.clip();

    // 图纸内细格
    c.strokeStyle = inkA(0.05); c.lineWidth = 1;
    for (let x = SX; x < SX + SW; x += 24) { c.beginPath(); c.moveTo(x, SY); c.lineTo(x, SY + SH); c.stroke(); }
    for (let y = SY; y < SY + SH; y += 24) { c.beginPath(); c.moveTo(SX, y); c.lineTo(SX + SW, y); c.stroke(); }

    // 图框
    c.strokeStyle = inkA(0.75); c.lineWidth = 2.5;
    c.strokeRect(SX + 20, SY + 20, SW - 40, SH - 40);
    c.strokeStyle = inkA(0.30); c.lineWidth = 1;
    c.strokeRect(SX + 32, SY + 32, SW - 64, SH - 64);

    // 图注
    c.fillStyle = inkA(0.8);
    c.font = `600 20px ${F_MONO}`;
    tracked(c, 'DOC-01', SX + 56, SY + 82, 2.5);
    c.font = `13px ${F_MONO}`;
    c.fillStyle = inkA(0.45);
    tracked(c, 'C++ / DESTRUCTOR', SX + 56, SY + 108, 1.6);
    c.textAlign = 'right';
    c.font = `13px ${F_MONO}`;
    c.fillText('FIG. S01  00-04s', SX + SW - 56, SY + 82);
    c.textAlign = 'left';

    c.strokeStyle = inkA(0.22); c.lineWidth = 1;
    c.beginPath(); c.moveTo(SX + 56, SY + 134); c.lineTo(SX + SW - 56, SY + 134); c.stroke();

    // 词条头：函数签名（打字机）
    const sig = '~File::~File()';
    const sp = seg(t, 340, 900);
    if (sp > 0) {
      const n = Math.ceil(sig.length * sp);
      c.font = `25px ${F_MONO}`;
      c.fillStyle = inkA(0.88);
      c.fillText(sig.slice(0, n), SX + 120, SY + 232);
      if (sp < 1) {
        const cw = c.measureText(sig.slice(0, n)).width;
        c.fillStyle = inkA(0.6);
        c.fillRect(SX + 120 + cw + 3, SY + 212, 3, 24);
      }
    }

    // 词条名：析构函数（擦除进入）
    const tp = easeOut(seg(t, 620, 1280));
    if (tp > 0) {
      c.save();
      c.beginPath();
      const tw = 300 * tp;
      c.rect(SX + 120 - tw / 2 + 150, SY + 300, tw * 2, 90);
      c.clip();
      c.fillStyle = inkA(0.92);
      c.font = `600 74px ${F_DISPLAY}`;
      c.fillText('析构函数', SX + 120, SY + 372);
      c.restore();
    }

    // 被否定的那句话：只清内存
    const bp = seg(t, 1250, 1900);
    if (bp > 0) {
      const bx = SX + 120, by = SY + 470, bw = 520, bh = 120;
      c.save();
      c.globalAlpha = easeOut(bp);
      c.strokeStyle = inkA(0.55); c.lineWidth = 1.6;
      c.strokeRect(bx, by, bw, bh);
      // 四角制图标记
      c.lineWidth = 2.2;
      [[bx, by], [bx + bw, by], [bx, by + bh], [bx + bw, by + bh]].forEach(([x, y]) => {
        c.beginPath();
        c.moveTo(x - 10, y); c.lineTo(x + 10, y);
        c.moveTo(x, y - 10); c.lineTo(x, y + 10);
        c.stroke();
      });
      c.fillStyle = inkA(0.9);
      c.font = `600 62px ${F_DISPLAY}`;
      c.textAlign = 'center';
      c.fillText('只清内存', bx + bw / 2, by + 82);
      c.textAlign = 'left';
      c.restore();
    }

    // 红笔划过：从左上到右下，一笔否定
    const xp = seg(t, 1900, 2500);
    if (xp > 0) {
      const x0 = SX + 130, y0 = SY + 545, x1 = SX + 130 + 470, y1 = SY + 505;
      const xe = lerp(x0, x1, easeOut(xp));
      const ye = lerp(y0, y1, easeOut(xp));
      c.save();
      c.strokeStyle = redA(0.92);
      c.lineWidth = 6;
      c.lineCap = 'round';
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(xe, ye); c.stroke();
      // 起笔的小勾
      c.lineWidth = 4;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 - 16, y0 + 8); c.stroke();
      c.restore();
    }

    // 批注：真的？
    const np = seg(t, 2480, 3050);
    if (np > 0) {
      c.save();
      c.globalAlpha = easeOut(np);
      c.fillStyle = redA(0.95);
      c.font = `italic 600 44px ${F_DISPLAY}`;
      c.fillText('真的？', SX + 700, SY + 560);
      c.font = `13px ${F_MONO}`;
      c.fillStyle = redA(0.55);
      c.fillText('only memory?', SX + 702, SY + 592);
      c.restore();
    }

    // 问号：放大浮现，作为这一镜的落点
    const qp = seg(t, 2900, 3600);
    if (qp > 0) {
      const s = backOut(qp);
      c.save();
      c.globalAlpha = clamp01(qp * 1.6);
      c.translate(SX + SW - 300, SY + 640);
      c.rotate(-0.10);
      c.scale(s, s);
      c.fillStyle = redA(0.88);
      c.font = `600 220px ${F_DISPLAY}`;
      c.fillText('?', -60, 70);
      c.restore();
    }

    // 底注：这一条的出处感
    const fp = seg(t, 2700, 3300);
    if (fp > 0) {
      c.save();
      c.globalAlpha = fp * 0.5;
      c.fillStyle = inkA(0.6);
      c.font = `13px ${F_MONO}`;
      tracked(c, 'ENTRY 01 / REV. A', SX + 56, SY + SH - 60, 1.8);
      c.restore();
    }

    c.restore(); // 图纸裁切

    c.strokeStyle = inkA(0.30); c.lineWidth = 1.5;
    c.strokeRect(SX, SY, SW * pin, SH);

    c.restore(); // 推近
  }

  /* ==========================================================
     S02 · 4–8s 举证：三行代码逐行出现，右侧状态逐个判定
     字幕：开文件、读数据、抛异常
     ========================================================== */
  const CODE2 = [
    'auto f = std::ifstream{"data.txt"};',
    'f.read(buf, 4096);',
    'throw std::runtime_error{"bad"};',
  ];
  const STATE2 = ['持有句柄', '数据已读', '流程中断'];

  function drawS02(c, t) {
    drawPaper(c, t, { vignette: 0.22 });

    const SX = 84, SY = H * 0.145, SW = 912, SH = 900;
    const pin = easeOutExpo(seg(t, 0, 380));

    c.save();
    c.shadowColor = 'rgba(50,38,20,0.18)';
    c.shadowBlur = 34; c.shadowOffsetY = 10;
    c.fillStyle = 'rgba(252,249,241,0.96)';
    c.fillRect(SX, SY, SW * pin, SH);
    c.restore();

    c.save();
    c.beginPath(); c.rect(SX, SY, SW * pin, SH); c.clip();

    c.strokeStyle = inkA(0.05); c.lineWidth = 1;
    for (let x = SX; x < SX + SW; x += 24) { c.beginPath(); c.moveTo(x, SY); c.lineTo(x, SY + SH); c.stroke(); }
    for (let y = SY; y < SY + SH; y += 24) { c.beginPath(); c.moveTo(SX, y); c.lineTo(SX + SW, y); c.stroke(); }

    c.strokeStyle = inkA(0.75); c.lineWidth = 2.5;
    c.strokeRect(SX + 18, SY + 18, SW - 36, SH - 36);
    c.strokeStyle = inkA(0.30); c.lineWidth = 1;
    c.strokeRect(SX + 28, SY + 28, SW - 56, SH - 56);

    // 图注
    c.fillStyle = inkA(0.8);
    c.font = `600 20px ${F_MONO}`;
    tracked(c, 'CODE-02', SX + 48, SY + 74, 2.5);
    c.font = `13px ${F_MONO}`;
    c.fillStyle = inkA(0.45);
    tracked(c, 'C++ / RESOURCE ACQUIRED', SX + 48, SY + 100, 1.6);
    c.textAlign = 'right';
    c.font = `13px ${F_MONO}`;
    c.fillText('FIG. S02  04-08s', SX + SW - 48, SY + 74);
    c.textAlign = 'left';

    c.strokeStyle = inkA(0.22); c.lineWidth = 1;
    c.beginPath(); c.moveTo(SX + 48, SY + 124); c.lineTo(SX + SW - 48, SY + 124); c.stroke();

    // 表头
    c.font = `13px ${F_MONO}`;
    c.fillStyle = inkA(0.40);
    tracked(c, '#', SX + 56, SY + 168, 0);
    tracked(c, 'STATEMENT', SX + 110, SY + 168, 1.6);
    c.textAlign = 'right';
    tracked(c, 'STATE', SX + SW - 56, SY + 168, 1.4, 'right');
    c.textAlign = 'left';
    c.strokeStyle = inkA(0.30); c.lineWidth = 1;
    c.beginPath(); c.moveTo(SX + 48, SY + 186); c.lineTo(SX + SW - 48, SY + 186); c.stroke();

    // 三行代码
    const codeX = SX + 110, codeY0 = SY + 258, lineH = 106;
    CODE2.forEach((line, i) => {
      const t0 = 320 + i * 640;
      const lp = seg(t, t0, t0 + 380);
      if (lp <= 0) return;

      c.fillStyle = inkA(0.32);
      c.font = `15px ${F_MONO}`;
      c.fillText(String(i + 1).padStart(2, '0'), SX + 56, codeY0 + i * lineH - 2);

      const n = Math.ceil(line.length * lp);
      c.font = `24px ${F_MONO}`;
      c.fillStyle = i === 2 ? redA(0.95) : inkA(0.90);
      c.fillText(line.slice(0, n), codeX, codeY0 + i * lineH);

      if (lp < 1) {
        const cw = c.measureText(line.slice(0, n)).width;
        c.fillStyle = inkA(0.65);
        c.fillRect(codeX + cw + 3, codeY0 + i * lineH - 19, 3, 23);
      }

      // 状态框：打完 180ms 后判定
      const sp = seg(t, t0 + 300, t0 + 480);
      if (sp > 0) {
        const bx = SX + SW - 232, by = codeY0 + i * lineH - 32, bw = 176, bh = 52;
        const isErr = i === 2;
        c.save();
        c.globalAlpha = easeOut(sp);
        c.strokeStyle = isErr ? redA(0.85) : inkA(0.55);
        c.lineWidth = 1.8;
        c.strokeRect(bx, by, bw, bh);

        // 勾或叉
        const ix = bx + 24, iy = by + bh / 2;
        c.strokeStyle = isErr ? redA(0.9) : blueA(0.9);
        c.lineWidth = 3;
        c.lineCap = 'round';
        if (isErr) {
          c.beginPath(); c.moveTo(ix - 7, iy - 7); c.lineTo(ix + 7, iy + 7); c.stroke();
          c.beginPath(); c.moveTo(ix + 7, iy - 7); c.lineTo(ix - 7, iy + 7); c.stroke();
        } else {
          c.beginPath(); c.moveTo(ix - 7, iy); c.lineTo(ix - 1, iy + 7); c.lineTo(ix + 9, iy - 8); c.stroke();
        }

        c.fillStyle = isErr ? redA(0.92) : inkA(0.78);
        c.font = `500 17px ${F_LABEL}`;
        c.fillText(STATE2[i], bx + 46, by + 34);
        c.restore();
      }
    });

    // 第三行的红色括号：标出中断点
    const mp = seg(t, 2300, 2800);
    if (mp > 0) {
      const y = codeY0 + 2 * lineH;
      c.save();
      c.globalAlpha = easeOut(mp);
      c.strokeStyle = redA(0.75);
      c.lineWidth = 2.4;
      c.beginPath();
      c.moveTo(codeX - 18, y - 26);
      c.lineTo(codeX - 26, y - 26);
      c.lineTo(codeX - 26, y + 10);
      c.lineTo(codeX - 18, y + 10);
      c.stroke();
      c.fillStyle = redA(0.85);
      c.font = `italic 600 26px ${F_DISPLAY}`;
      c.fillText('这里就断了', codeX + 470, y - 46);
      c.restore();
    }

    // 底部：资源状态小结
    const fp = seg(t, 2800, 3500);
    if (fp > 0) {
      c.save();
      c.globalAlpha = easeOut(fp);
      c.fillStyle = inkA(0.55);
      c.font = `13px ${F_MONO}`;
      tracked(c, 'HANDLE: OPEN / BUFFER: 4096 B / STATE: EXCEPTION', SX + 48, SY + SH - 54, 1.2);
      c.restore();
    }

    c.restore();

    c.strokeStyle = inkA(0.30); c.lineWidth = 1.5;
    c.strokeRect(SX, SY, SW * pin, SH);
  }

  /* ==========================================================
     S03 · 8–12s 异常：一张代码图纸，红笔找出问题
     ========================================================== */
  const CODE = [
    'auto f = std::ifstream{"data.txt"};',
    'f.read(buf, 4096);',
    'throw std::runtime_error{"bad"};',
  ];

  function drawS03(c, t) {
    drawPaper(c, t);
    const shake = t > 1550 && t < 1800 ? Math.sin(t / 12) * 1.4 : 0;
    c.save();
    c.translate(shake, 0);

    const SX = 90, SY = H * 0.155, SW = 900, SH = 760;

    // ---- 图纸本体：擦除进入 ----
    const pin = easeOutExpo(seg(t, 0, 380));
    c.save();
    c.shadowColor = 'rgba(50,38,20,0.18)';
    c.shadowBlur = 34; c.shadowOffsetY = 10;
    c.fillStyle = 'rgba(252,249,241,0.96)';
    c.fillRect(SX, SY, SW * pin, SH);
    c.restore();

    c.save();
    // 裁切到图纸范围内，后续内容都在纸上
    c.beginPath(); c.rect(SX, SY, SW * pin, SH); c.clip();

    // 图纸内细格（比背景更密，形成"第二层纸"）
    c.strokeStyle = inkA(0.05); c.lineWidth = 1;
    for (let x = SX; x < SX + SW; x += 24) { c.beginPath(); c.moveTo(x, SY); c.lineTo(x, SY + SH); c.stroke(); }
    for (let y = SY; y < SY + SH; y += 24) { c.beginPath(); c.moveTo(SX, y); c.lineTo(SX + SW, y); c.stroke(); }

    // 图框 + 图注（制图规范感）
    c.strokeStyle = inkA(0.75); c.lineWidth = 2.5;
    c.strokeRect(SX + 18, SY + 18, SW - 36, SH - 36);
    c.strokeStyle = inkA(0.30); c.lineWidth = 1;
    c.strokeRect(SX + 28, SY + 28, SW - 56, SH - 56);

    // 图注：左上 CODE-01 / 右上 FIG. S03
    c.fillStyle = inkA(0.8);
    c.font = `600 20px ${F_MONO}`;
    tracked(c, 'CODE-01', SX + 48, SY + 74, 2.5);
    c.font = `13px ${F_MONO}`;
    c.fillStyle = inkA(0.45);
    tracked(c, 'C++ / EXCEPTION', SX + 48, SY + 100, 1.6);
    c.textAlign = 'right';
    c.font = `13px ${F_MONO}`;
    c.fillText('FIG. S03  08-12s', SX + SW - 48, SY + 74);
    c.textAlign = 'left';

    // 分隔线
    c.strokeStyle = inkA(0.22); c.lineWidth = 1;
    c.beginPath(); c.moveTo(SX + 48, SY + 124); c.lineTo(SX + SW - 48, SY + 124); c.stroke();

    // ---- 代码行：打字机逐行出现 ----
    const codeX = SX + 48, codeY0 = SY + 210, lineH = 74;
    c.font = `25px ${F_MONO}`;
    CODE.forEach((line, i) => {
      const lp = seg(t, 480 + i * 190, 480 + i * 190 + 260);
      if (lp <= 0) return;
      // 行号
      c.fillStyle = inkA(0.32);
      c.font = `15px ${F_MONO}`;
      c.fillText(String(i + 1).padStart(2, '0'), codeX, codeY0 + i * lineH - 2);

      // 代码（按字符截断）
      const n = Math.ceil(line.length * lp);
      c.font = `25px ${F_MONO}`;
      c.fillStyle = i === 2 ? redA(0.95) : inkA(0.92);
      c.fillText(line.slice(0, n), codeX + 44, codeY0 + i * lineH);

      // 打字机光标
      if (lp < 1) {
        const cw = c.measureText(line.slice(0, n)).width;
        c.fillStyle = inkA(0.7);
        c.fillRect(codeX + 44 + cw + 2, codeY0 + i * lineH - 20, 3, 24);
      }
    });

    // ---- 红笔波浪线（第 3 行）----
    const up = seg(t, 1250, 2150);
    if (up > 0) {
      const yy = codeY0 + 2 * lineH + 26;
      wavyUnderline(c, codeX + 44, codeX + 44 + 470, yy, easeOut(up));
    }

    // ---- 红章：落章 + 震一下 ----
    stamp(c, SX + SW - 190, SY + 360, 74, seg(t, 1560, 1900), 0.9);

    // ---- 手写批注 + 引线 ----
    const np = seg(t, 2350, 2900);
    if (np > 0) {
      const nx = SX + SW - 300, ny = SY + 500;
      c.save();
      c.globalAlpha = easeOut(np);
      c.strokeStyle = redA(0.9); c.lineWidth = 1.4;
      c.beginPath();
      c.moveTo(codeX + 44 + 470, codeY0 + 2 * lineH + 8);
      c.quadraticCurveTo(codeX + 560, codeY0 + 2 * lineH - 40, nx + 40, ny - 30);
      c.stroke();
      c.fillStyle = redA(0.95);
      c.font = `italic 600 30px ${F_DISPLAY}`;
      c.fillText('close 谁调？', nx, ny);
      c.font = `13px ${F_MONO}`;
      c.fillStyle = redA(0.55);
      c.fillText('no dtor called', nx + 2, ny + 26);
      c.restore();
    }

    // ---- 墨迹蔓延（异常外溢）：边角红色晕开 ----
    const bp = seg(t, 3100, 4000);
    if (bp > 0) {
      const g = c.createRadialGradient(SX + SW - 60, SY + 60, 10, SX + SW - 60, SY + 60, 60 + 300 * easeOut(bp));
      g.addColorStop(0, redA(0.20 * bp));
      g.addColorStop(1, redA(0));
      c.fillStyle = g;
      c.fillRect(SX, SY, SW, SH);
    }

    c.restore(); // 图纸裁切结束

    // 图纸投影边
    c.strokeStyle = inkA(0.30); c.lineWidth = 1.5;
    c.strokeRect(SX, SY, SW * pin, SH);

    c.restore();
  }

  /* ==========================================================
     S04 · 12–16s 反转：一张没填完的调用表，那一行自己长出来
     字幕：没人写，但它一定会执行
     ========================================================== */
  const TRACE = [
    ['01', 'main()', '—', 'RUN', false],
    ['02', 'open()', 'main()', 'OK', false],
    ['03', 'read()', 'main()', 'OK', false],
    ['04', 'throw', 'read()', 'ERR', false],
    ['05', '~File()', 'compiler', 'AUTO', true],
    ['06', '—', '—', '—', false],
    ['07', '—', '—', '—', false],
  ];

  function drawS04(c, t) {
    drawPaper(c, t, { vignette: 0.22 });

    // 拉远：从贴近到退后，最后看见整张表大部分是空的
    const zoom = lerp(1.13, 1.0, easeInOut2(seg(t, 0, 3600)));
    c.save();
    c.translate(W / 2, H * 0.44);
    c.scale(zoom, zoom);
    c.translate(-W / 2, -H * 0.44);

    const SX = 88, SY = H * 0.135, SW = 904, SH = 1020;
    const pin = easeOutExpo(seg(t, 0, 380));

    c.save();
    c.shadowColor = 'rgba(50,38,20,0.18)';
    c.shadowBlur = 34; c.shadowOffsetY = 10;
    c.fillStyle = 'rgba(252,249,241,0.96)';
    c.fillRect(SX, SY, SW * pin, SH);
    c.restore();

    c.save();
    c.beginPath(); c.rect(SX, SY, SW * pin, SH); c.clip();

    c.strokeStyle = inkA(0.05); c.lineWidth = 1;
    for (let x = SX; x < SX + SW; x += 24) { c.beginPath(); c.moveTo(x, SY); c.lineTo(x, SY + SH); c.stroke(); }
    for (let y = SY; y < SY + SH; y += 24) { c.beginPath(); c.moveTo(SX, y); c.lineTo(SX + SW, y); c.stroke(); }

    c.strokeStyle = inkA(0.75); c.lineWidth = 2.5;
    c.strokeRect(SX + 18, SY + 18, SW - 36, SH - 36);
    c.strokeStyle = inkA(0.30); c.lineWidth = 1;
    c.strokeRect(SX + 28, SY + 28, SW - 56, SH - 56);

    // 图注
    c.fillStyle = inkA(0.8);
    c.font = `600 20px ${F_MONO}`;
    tracked(c, 'CALL TRACE', SX + 48, SY + 74, 2.5);
    c.font = `13px ${F_MONO}`;
    c.fillStyle = inkA(0.45);
    tracked(c, 'RUNTIME / WHO CALLED WHAT', SX + 48, SY + 100, 1.6);
    c.textAlign = 'right';
    c.font = `13px ${F_MONO}`;
    c.fillText('FIG. S04  12-16s', SX + SW - 48, SY + 74);
    c.textAlign = 'left';

    // 表头线
    const topY = SY + 148, rowH = 108;
    const COL = [SX + 56, SX + 136, SX + 452, SX + 712];
    const drawRule = (y, alpha, lw) => {
      c.strokeStyle = inkA(alpha); c.lineWidth = lw || 1;
      c.beginPath(); c.moveTo(SX + 48, y); c.lineTo(SX + SW - 48, y); c.stroke();
    };

    // 表头
    const hp = seg(t, 240, 620);
    if (hp > 0) {
      c.save();
      c.globalAlpha = hp;
      c.font = `13px ${F_MONO}`;
      c.fillStyle = inkA(0.42);
      tracked(c, '#', COL[0], topY - 18, 0);
      tracked(c, 'FUNCTION', COL[1], topY - 18, 1.6);
      tracked(c, 'CALLER', COL[2], topY - 18, 1.6);
      tracked(c, 'STATE', COL[3], topY - 18, 1.6);
      drawRule(topY, 0.45, 2);
      c.restore();
    }

    // 行
    TRACE.forEach((row, i) => {
      const y = topY + 60 + i * rowH;
      const isHero = i === 4;
      const isEmpty = row[1] === '—';

      // 空行：只有虚线
      if (isEmpty) {
        c.save();
        c.setLineDash([6, 8]);
        c.strokeStyle = inkA(0.16);
        c.lineWidth = 1;
        c.beginPath(); c.moveTo(SX + 48, y); c.lineTo(SX + SW - 48, y); c.stroke();
        c.setLineDash([]);
        c.restore();
        return;
      }

      // 普通行：0.8s 起逐行淡入
      const rp = isHero ? seg(t, 1750, 2050) : seg(t, 780 + i * 120, 1080 + i * 120);
      if (rp <= 0) return;

      const alpha = isHero ? 1 : 0.72;
      c.save();
      c.globalAlpha = easeOut(rp) * alpha;
      c.font = `13px ${F_MONO}`;
      c.fillStyle = inkA(0.40);
      c.fillText(row[0], COL[0], y + 5);

      c.font = `${isHero ? '600 ' : ''}21px ${F_MONO}`;
      c.fillStyle = row[3] === 'ERR' ? redA(0.95) : inkA(0.88);
      c.fillText(row[1], COL[1], y + 7);

      c.font = `19px ${F_MONO}`;
      c.fillStyle = isHero ? redA(0.95) : inkA(0.6);
      c.fillText(row[2], COL[2], y + 7);

      c.font = `13px ${F_MONO}`;
      c.fillStyle = row[3] === 'AUTO' ? redA(0.9) : row[3] === 'ERR' ? redA(0.85) : inkA(0.5);
      c.fillText(row[3], COL[3], y + 5);
      c.restore();

      if (!isEmpty) drawRule(y + 38, isHero ? 0.35 : 0.14, 1);
    });

    // compiler 被红圈：这一行的调用者不是人
    const cp = seg(t, 2400, 3050);
    if (cp > 0) {
      const y = topY + 60 + 4 * rowH + 7;
      c.save();
      c.globalAlpha = easeOut(cp);
      c.strokeStyle = redA(0.85);
      c.lineWidth = 2.6;
      c.beginPath();
      c.ellipse(COL[2] + 90, y - 6, 132 * easeOut(cp), 34 * easeOut(cp), -0.04, 0, TAU);
      c.stroke();
      c.fillStyle = redA(0.9);
      c.font = `italic 600 30px ${F_DISPLAY}`;
      c.fillText('没人写这一行', SX + SW - 380, y + 92);
      c.font = `13px ${F_MONO}`;
      c.fillStyle = redA(0.5);
      c.fillText('not written by you', SX + SW - 378, y + 120);
      c.restore();
    }

    // 空行计数：把"大部分是空的"说出来
    const ep = seg(t, 3000, 3700);
    if (ep > 0) {
      c.save();
      c.globalAlpha = easeOut(ep) * 0.65;
      c.fillStyle = inkA(0.6);
      c.font = `13px ${F_MONO}`;
      tracked(c, '5 RECORDS SHOWN / 2 BLANK', SX + 48, SY + SH - 54, 1.2);
      c.restore();
    }

    c.restore();

    c.strokeStyle = inkA(0.30); c.lineWidth = 1.5;
    c.strokeRect(SX, SY, SW * pin, SH);

    c.restore();
  }

  // S04 用的平滑函数（v2 原本没有 inOut）
  function easeInOut2(t) {
    t = clamp01(t);
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  /* ==========================================================
     S05 · 16–22s 作用域：纸盒穿过三层图纸，落地成纸屑
     ========================================================== */
  function drawS05(c, t) {
    drawPaper(c, t, { vignette: 0.24 });

    const CX = W / 2;
    const layers = [
      { y: H * 0.315, label: 'SCOPE 01', a: 0.30 },
      { y: H * 0.455, label: 'SCOPE 02', a: 0.55 },
      { y: H * 0.595, label: 'SCOPE 03', a: 0.80 },
    ];
    const START = H * 0.135, GROUND = H * 0.745;

    // ---- 三层图纸：由远到近，透视错位 ----
    layers.forEach((L, i) => {
      const w = 700 + i * 60, h = 300;
      const x = CX - w / 2 + (i - 1) * 26;
      const lit = clamp01((t - (3000 * Math.sqrt((L.y - START) / (GROUND - START)))) / 260);

      c.save();
      c.translate(0, -lit * 6);
      // 纸
      c.shadowColor = 'rgba(50,38,20,0.16)';
      c.shadowBlur = 26; c.shadowOffsetY = 8;
      c.fillStyle = `rgba(252,249,241,${0.90 + lit * 0.08})`;
      c.fillRect(x, L.y - h / 2, w, h);
      c.shadowBlur = 0;

      // 框 + 内侧线
      c.strokeStyle = inkA(L.a * 0.9); c.lineWidth = 2;
      c.strokeRect(x, L.y - h / 2, w, h);
      c.strokeStyle = inkA(L.a * 0.45); c.lineWidth = 1;
      c.strokeRect(x + 12, L.y - h / 2 + 12, w - 24, h - 24);

      // 标签
      c.fillStyle = inkA(L.a * 0.95);
      c.font = `600 17px ${F_MONO}`;
      tracked(c, L.label, x + 28, L.y - h / 2 + 40, 2);

      // 层内刻度
      c.strokeStyle = inkA(L.a * 0.22); c.lineWidth = 1;
      for (let k = 0; k < 5; k++) {
        const yy = L.y - h / 2 + 70 + k * 48;
        c.beginPath(); c.moveTo(x + 28, yy); c.lineTo(x + 28 + 120, yy); c.stroke();
      }
      c.restore();

      // 穿过时：盖章 + 波纹
      const stampP = clamp01((t - (3000 * Math.sqrt((L.y - START) / (GROUND - START)))) / 320);
      if (stampP > 0) {
        stamp(c, x + w - 110, L.y + 20, 46, stampP, 0.85);
        const rp = clamp01((t - (3000 * Math.sqrt((L.y - START) / (GROUND - START)))) / 700);
        c.save();
        c.strokeStyle = redA(0.35 * (1 - rp));
        c.lineWidth = 3 * (1 - rp);
        c.beginPath();
        c.arc(x + w - 110, L.y + 20, 46 + 90 * easeOut(rp), 0, TAU);
        c.stroke();
        c.restore();
      }
    });

    // ---- 纸盒：自由落体 t² ----
    const fp = clamp01(t / 4000);
    const by = lerp(START, GROUND, fp * fp);
    const speed = 2 * fp;                      // 速度感（用于速度线长度）
    const landed = t >= 4000;

    if (!landed) {
      // 速度线（虚线，随速度变长）
      if (speed > 0.12) {
        c.save();
        c.strokeStyle = inkA(0.28);
        c.lineWidth = 2;
        c.setLineDash([16, 16]);
        for (let i = -1; i <= 1; i++) {
          c.beginPath();
          c.moveTo(CX + i * 46, by - 78);
          c.lineTo(CX + i * 46, by - 78 - 60 - 220 * speed);
          c.stroke();
        }
        c.setLineDash([]);
        c.restore();
      }
      drawPaperBox(c, CX, by, 168, 0.10 + speed * 0.06);
    } else {
      // ---- 落地：纸屑 + 墨点 ----
      const p1 = clamp01((t - 4000) / 1400);
      const p2 = clamp01((t - 5400) / 600);
      const r = rng(771);
      const N = 130;
      for (let i = 0; i < N; i++) {
        const ang = -Math.PI + r() * Math.PI * 2;
        const spd = 90 + r() * 520;
        const dl = r() * 0.1;
        const pp = clamp01((p1 - dl) / (1 - dl));
        const dist = spd * easeOut(pp);
        const x = CX + Math.cos(ang) * dist * 1.15;
        const y = GROUND + Math.sin(ang) * dist * 0.46 - 120 * pp * (1 - pp) * 2 + 150 * pp * pp;
        const w = 8 + r() * 22, h = 6 + r() * 12;
        scrap(c, x, y, w, h * (1 - p2 * 0.2), r() * TAU + pp * 3, (1 - 0.1 * p2) * (0.55 + 0.45 * r()));
      }
      // 墨点
      const r2 = rng(918);
      for (let i = 0; i < 26; i++) {
        const ang = Math.PI + r2() * Math.PI;
        const d = 60 + r2() * 300 * easeOut(p1);
        c.save();
        c.fillStyle = inkA((1 - p2 * 0.4) * (0.25 + r2() * 0.45));
        c.beginPath();
        c.ellipse(CX + Math.cos(ang) * d, GROUND + Math.abs(Math.sin(ang)) * d * 0.22,
          2 + r2() * 5, 1.5 + r2() * 3.5, 0, 0, TAU);
        c.fill();
        c.restore();
      }

      // 落地线 + 尺寸标注
      const lp = seg(t, 4000, 4600);
      c.save();
      c.globalAlpha = lp;
      c.strokeStyle = inkA(0.5); c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(W * 0.12, GROUND + 30); c.lineTo(W * 0.88, GROUND + 30); c.stroke();
      c.fillStyle = inkA(0.55);
      c.font = `13px ${F_MONO}`;
      c.textAlign = 'center';
      c.fillText('scope end', CX, GROUND + 56);
      c.textAlign = 'left';
      c.restore();
      dimH(c, W * 0.16, W * 0.84, GROUND + 96, 'dtor', P.blue, lp * 0.85);
    }
  }

  // 等轴测"纸盒"（线框 + 淡填充，比发光立方体更图纸）
  function drawPaperBox(c, cx, cy, s, rot) {
    const h = s / 2;
    const k = 0.62;                       // 等轴测压扁系数
    const top = [[-h, -k * h], [0, -k * h - 26], [h, -k * h], [0, -k * h + 26]];
    const bot = [[-h, k * h], [0, k * h - 26], [h, k * h], [0, k * h + 26]];

    c.save();
    c.translate(cx, cy);
    c.rotate(Math.sin(rot) * 0.04);

    // 底面
    poly(c, bot, 'rgba(252,249,241,0.85)', inkA(0.55), 2);
    // 左右立面
    poly(c, [bot[0], bot[3], top[3], top[0]], 'rgba(238,231,214,0.9)', inkA(0.6), 2);
    poly(c, [bot[3], bot[2], top[2], top[3]], 'rgba(226,217,196,0.9)', inkA(0.6), 2);
    // 顶面
    poly(c, top, 'rgba(253,250,243,0.95)', inkA(0.8), 2.4);

    // 顶面十字对位线（图纸感）
    c.strokeStyle = inkA(0.18); c.lineWidth = 1;
    c.setLineDash([6, 6]);
    c.beginPath(); c.moveTo(top[0][0], top[0][1]); c.lineTo(top[2][0], top[2][1]); c.stroke();
    c.beginPath(); c.moveTo(top[1][0], top[1][1]); c.lineTo(top[3][0], top[3][1]); c.stroke();
    c.setLineDash([]);
    c.restore();
  }

  function poly(c, pts, fill, stroke, lw) {
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1.5; c.stroke(); }
  }

  /* ==========================================================
     S06 · 22–26s 结构：纸屑重组成栈/堆关系图
     ========================================================== */
  function drawS06(c, t, showLabels) {
    drawPaper(c, t, { vignette: 0.2 });

    const conv = easeOut(seg(t, 0, 1000));
    const LEFT = { x: W * 0.30, y1: H * 0.335, y2: H * 0.455 };
    const RIGHT = { x: W * 0.72, y: H * 0.395 };

    // ---- 纸屑汇聚 ----
    const r = rng(4321);
    const N = 120;
    for (let i = 0; i < N; i++) {
      const ang = r() * TAU, d = 260 + r() * 620;
      const sx = W / 2 + Math.cos(ang) * d;
      const sy = H * 0.72 + Math.sin(ang) * d * 0.42;
      const tx = i % 3 === 0 ? LEFT.x : i % 3 === 1 ? LEFT.x + 40 : RIGHT.x;
      const ty = i % 3 === 0 ? LEFT.y1 : i % 3 === 1 ? LEFT.y2 : RIGHT.y;
      const x = lerp(sx, tx, conv), y = lerp(sy, ty, conv);
      const a = (1 - conv * 0.72) * (0.3 + 0.6 * r());
      if (a < 0.03) continue;
      scrap(c, x, y, 7 + r() * 14, 5 + r() * 8, r() * TAU + conv * 2, a);
    }

    // ---- 左栏：栈（两张错位矩形，dash 描出）----
    const pL1 = seg(t, 900, 1650), pL2 = seg(t, 1500, 2250);
    drawStackBox(c, LEFT.x, LEFT.y1, 300, 108, pL1);
    drawStackBox(c, LEFT.x + 22, LEFT.y2, 300, 108, pL2);

    // ---- 右栏：堆（圆 + 内部点）----
    const pR = seg(t, 1350, 2400);
    if (pR > 0) {
      const R = 100;
      c.save();
      c.strokeStyle = inkA(0.85); c.lineWidth = 2.6;
      const per = TAU * R;
      c.setLineDash([per * pR, per]);
      c.beginPath(); c.arc(RIGHT.x, RIGHT.y, R, -Math.PI / 2, -Math.PI / 2 + TAU); c.stroke();
      c.setLineDash([]);
      // 内侧虚线环
      c.strokeStyle = inkA(0.22); c.lineWidth = 1;
      c.setLineDash([7, 7]);
      c.beginPath(); c.arc(RIGHT.x, RIGHT.y, R - 14, 0, TAU); c.stroke();
      c.setLineDash([]);
      // 内部点
      const rr2 = rng(88);
      for (let i = 0; i < 9; i++) {
        const a2 = rr2() * TAU, d2 = rr2() * (R - 26);
        c.fillStyle = inkA(0.55 * pR);
        c.beginPath();
        c.arc(RIGHT.x + Math.cos(a2) * d2, RIGHT.y + Math.sin(a2) * d2, 2 + rr2() * 4, 0, TAU);
        c.fill();
      }
      c.restore();
    }

    // ---- 中线：箭头 + lifetime 标签 ----
    const pM = seg(t, 2300, 3200);
    if (pM > 0) {
      const x0 = LEFT.x + 170, x1 = RIGHT.x - 118, y = RIGHT.y;
      const xe = lerp(x0, x1, easeOut(pM));
      c.save();
      c.strokeStyle = inkA(0.8); c.lineWidth = 2.2;
      c.beginPath(); c.moveTo(x0, y); c.lineTo(xe, y); c.stroke();
      // 箭头
      if (pM > 0.92) {
        c.fillStyle = inkA(0.85);
        c.beginPath();
        c.moveTo(x1, y); c.lineTo(x1 - 14, y - 7); c.lineTo(x1 - 14, y + 7);
        c.closePath(); c.fill();
      }
      // 标签
      c.fillStyle = inkA(0.55);
      c.font = `13px ${F_MONO}`;
      c.textAlign = 'center';
      c.fillText('lifetime', (x0 + x1) / 2, y - 14);
      c.textAlign = 'left';
      c.restore();
    }

    // ---- 中文大字 + 英文小字（这是渲染层才有的，AI 版靠后期叠）----
    if (showLabels) {
      const pl = easeOut(seg(t, 1700, 2350));
      c.save();
      c.globalAlpha = pl;
      // 栈
      c.fillStyle = inkA(0.9);
      c.font = `600 52px ${F_DISPLAY}`;
      c.fillText('栈', LEFT.x - 150, LEFT.y1 - 28);
      c.font = `13px ${F_MONO}`;
      c.fillStyle = inkA(0.45);
      tracked(c, 'STACK', LEFT.x - 150, LEFT.y1 - 6, 2);
      // 堆
      c.fillStyle = inkA(0.9);
      c.font = `600 52px ${F_DISPLAY}`;
      c.fillText('堆', RIGHT.x - 20, RIGHT.y - 128);
      c.font = `13px ${F_MONO}`;
      c.fillStyle = inkA(0.45);
      tracked(c, 'HEAP', RIGHT.x - 20, RIGHT.y - 106, 2);
      c.restore();
    }

    // ---- 收尾：整图等轴倾斜 + 网格收束 ----
    const tp = seg(t, 3400, 4000);
    if (tp > 0) {
      c.save();
      c.globalAlpha = 0.10 * tp;
      c.fillStyle = P.blue;
      c.fillRect(0, 0, W, H);
      c.restore();
    }
  }

  function drawStackBox(c, x, y, w, h, p) {
    if (p <= 0) return;
    c.save();
    const per = 2 * (w + h);
    c.strokeStyle = inkA(0.8);
    c.lineWidth = 2.4;
    c.setLineDash([per * p, per]);
    rrPath(c, x - w / 2, y - h / 2, w, h, 2);
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = 'rgba(252,249,241,0.82)';
    c.fill();

    // 内部刻度（示意"栈帧"）
    c.strokeStyle = inkA(0.20); c.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      const yy = y - h / 2 + (h / 3) * i;
      c.beginPath(); c.moveTo(x - w / 2 + 16, yy); c.lineTo(x + w / 2 - 16, yy); c.stroke();
    }
    c.restore();
  }

  /* ==========================================================
     S07 · 26–30s 收尾：两栏对照，左边被划掉，右边被盖章认可
     字幕：所以 C++ 不需要 finally
     ========================================================== */
  const LEFT_CODE = ['try {', '  use();', '} finally {', '  f.close();', '}'];
  const RIGHT_CODE = ['~File() {', '  f.close();', '}'];

  function drawS07(c, t) {
    drawPaper(c, t, { vignette: 0.24 });

    const SX = 64, SY = H * 0.215, SW = 952, SH = 780;
    const pin = easeOutExpo(seg(t, 0, 380));

    // 图纸
    c.save();
    c.shadowColor = 'rgba(50,38,20,0.18)';
    c.shadowBlur = 34; c.shadowOffsetY = 10;
    c.fillStyle = 'rgba(252,249,241,0.96)';
    c.fillRect(SX, SY, SW * pin, SH);
    c.restore();

    c.save();
    c.beginPath(); c.rect(SX, SY, SW * pin, SH); c.clip();

    c.strokeStyle = inkA(0.05); c.lineWidth = 1;
    for (let x = SX; x < SX + SW; x += 24) { c.beginPath(); c.moveTo(x, SY); c.lineTo(x, SY + SH); c.stroke(); }
    for (let y = SY; y < SY + SH; y += 24) { c.beginPath(); c.moveTo(SX, y); c.lineTo(SX + SW, y); c.stroke(); }

    c.strokeStyle = inkA(0.75); c.lineWidth = 2.5;
    c.strokeRect(SX + 18, SY + 18, SW - 36, SH - 36);
    c.strokeStyle = inkA(0.30); c.lineWidth = 1;
    c.strokeRect(SX + 28, SY + 28, SW - 56, SH - 56);

    // 图注
    c.fillStyle = inkA(0.8);
    c.font = `600 20px ${F_MONO}`;
    tracked(c, 'FIG. S07', SX + 48, SY + 74, 2.5);
    c.font = `13px ${F_MONO}`;
    c.fillStyle = inkA(0.45);
    tracked(c, 'CLEANUP / TWO WAYS', SX + 48, SY + 100, 1.6);
    c.textAlign = 'right';
    c.font = `13px ${F_MONO}`;
    c.fillText('26-30s', SX + SW - 48, SY + 74);
    c.textAlign = 'left';

    // 两栏
    const LW = 400, RW = 400;
    const LX = SX + 56, RX = SX + SW - 56 - RW;
    const CY = SY + 190;
    const CH = 380;

    // ---- 左栏：try/finally ----
    const lp = seg(t, 180, 820);
    if (lp > 0) {
      c.save();
      c.globalAlpha = clamp01(lp * 1.5);
      c.strokeStyle = inkA(0.55); c.lineWidth = 1.8;
      const per = 2 * (LW + CH);
      c.setLineDash([per * easeOut(lp), per]);
      c.strokeRect(LX, CY, LW, CH);
      c.setLineDash([]);

      c.fillStyle = inkA(0.45);
      c.font = `13px ${F_MONO}`;
      tracked(c, 'MANUAL', LX, CY - 16, 1.8);

      LEFT_CODE.forEach((line, i) => {
        const yp = seg(t, 320 + i * 90, 500 + i * 90);
        if (yp <= 0) return;
        const n = Math.ceil(line.length * yp);
        c.font = `22px ${F_MONO}`;
        c.fillStyle = inkA(0.72);
        c.fillText(line.slice(0, n), LX + 26, CY + 76 + i * 56);
      });
      c.restore();
    }

    // 左栏被斜线划掉：这是"要你手动做"的那套
    const xp = seg(t, 1000, 1650);
    if (xp > 0) {
      c.save();
      c.strokeStyle = redA(0.85);
      c.lineWidth = 5;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(LX - 10, CY + CH - 20);
      c.lineTo(lerp(LX - 10, LX + LW + 10, easeOut(xp)), lerp(CY + CH - 20, CY + 20, easeOut(xp)));
      c.stroke();
      c.restore();
    }

    // ---- 中间箭头 ----
    const ap = seg(t, 1500, 2050);
    if (ap > 0) {
      const x0 = LX + LW + 26, x1 = RX - 26;
      const y = CY + CH / 2;
      const xe = lerp(x0, x1, easeOut(ap));
      c.save();
      c.strokeStyle = inkA(0.7); c.lineWidth = 2.4;
      c.beginPath(); c.moveTo(x0, y); c.lineTo(xe, y); c.stroke();
      if (ap > 0.85) {
        c.fillStyle = inkA(0.8);
        c.beginPath();
        c.moveTo(x1, y); c.lineTo(x1 - 14, y - 8); c.lineTo(x1 - 14, y + 8);
        c.closePath(); c.fill();
      }
      c.restore();
    }

    // ---- 右栏：析构函数 ----
    const rp = seg(t, 1750, 2400);
    if (rp > 0) {
      c.save();
      c.globalAlpha = clamp01(rp * 1.5);
      const per2 = 2 * (RW + CH);
      c.strokeStyle = inkA(0.65); c.lineWidth = 2;
      c.setLineDash([per2 * easeOut(rp), per2]);
      c.strokeRect(RX, CY, RW, CH);
      c.setLineDash([]);

      c.fillStyle = inkA(0.45);
      c.font = `13px ${F_MONO}`;
      tracked(c, 'RAII', RX, CY - 16, 1.8);

      RIGHT_CODE.forEach((line, i) => {
        const yp = seg(t, 1900 + i * 100, 2090 + i * 100);
        if (yp <= 0) return;
        const n = Math.ceil(line.length * yp);
        c.font = `22px ${F_MONO}`;
        c.fillStyle = i === 0 ? inkA(0.9) : inkA(0.78);
        c.fillText(line.slice(0, n), RX + 26, CY + 100 + i * 62);
      });
      c.restore();
    }

    // 右栏被框 + 勾：认可
    const gp = seg(t, 2380, 2850);
    if (gp > 0) {
      c.save();
      c.globalAlpha = easeOut(gp);
      c.strokeStyle = redA(0.85);
      c.lineWidth = 2.8;
      c.strokeRect(RX - 12, CY - 12, RW + 24, CH + 24);
      // 勾
      c.strokeStyle = redA(0.95);
      c.lineWidth = 7;
      c.lineCap = 'round';
      const gx = RX + RW - 40, gy = CY + 40;
      c.beginPath();
      c.moveTo(gx - 26, gy);
      c.lineTo(lerp(gx - 26, gx - 8, easeOut(seg(t, 2380, 2580))), lerp(gy, gy + 18, easeOut(seg(t, 2380, 2580))));
      c.lineTo(gx + 18, gy - 24);
      c.stroke();
      c.restore();
    }

    // 字幕条：两栏各自的归属
    const tp2 = seg(t, 2050, 2600);
    if (tp2 > 0) {
      c.save();
      c.globalAlpha = easeOut(tp2);
      c.font = `500 19px ${F_LABEL}`;
      c.fillStyle = inkA(0.5);
      c.textAlign = 'center';
      c.fillText('你写的', LX + LW / 2, CY + CH + 44);
      c.fillStyle = redA(0.85);
      c.fillText('它替编译器保证的', RX + RW / 2, CY + CH + 44);
      c.textAlign = 'left';
      c.restore();
    }

    // 叉章：盖在左栏
    stamp(c, LX + LW - 96, CY + 96, 54, seg(t, 2820, 3200), 0.85);

    // 底部结论
    const fp = seg(t, 3100, 3700);
    if (fp > 0) {
      c.save();
      c.globalAlpha = easeOut(fp);
      c.strokeStyle = inkA(0.22); c.lineWidth = 1;
      c.beginPath(); c.moveTo(SX + 48, SY + SH - 128); c.lineTo(SX + SW - 48, SY + SH - 128); c.stroke();
      c.fillStyle = inkA(0.85);
      c.font = `600 40px ${F_DISPLAY}`;
      c.fillText('不需要 finally', SX + 52, SY + SH - 66);
      c.font = `13px ${F_MONO}`;
      c.fillStyle = inkA(0.42);
      tracked(c, 'NO EXPLICIT CLEANUP REQUIRED', SX + 52, SY + SH - 40, 1.6);
      c.restore();
    }

    c.restore();

    c.strokeStyle = inkA(0.30); c.lineWidth = 1.5;
    c.strokeRect(SX, SY, SW * pin, SH);

    // 整片收尾：压一层极淡的蓝，表示结束
    const endp = seg(t, 3500, 4000);
    if (endp > 0) {
      c.save();
      c.globalAlpha = 0.09 * endp;
      c.fillStyle = P.blue;
      c.fillRect(0, 0, W, H);
      c.restore();
    }
  }

  /* ---------------- 安全区 ---------------- */
  function drawSafeArea(c) {
    c.save();
    c.strokeStyle = redA(0.55);
    c.lineWidth = 2;
    c.setLineDash([14, 12]);
    c.beginPath(); c.moveTo(0, H * 0.82); c.lineTo(W, H * 0.82); c.stroke();
    c.beginPath(); c.moveTo(W * 0.88, 0); c.lineTo(W * 0.88, H); c.stroke();
    c.setLineDash([]);
    c.fillStyle = redA(0.85);
    c.font = `600 24px ${F_MONO}`;
    c.fillText('BOTTOM 18%', 26, H * 0.82 - 18);
    c.save();
    c.translate(W * 0.88 - 14, 34);
    c.rotate(Math.PI / 2);
    c.fillText('RIGHT 12%', 0, 0);
    c.restore();
    c.restore();
  }

  /* ---------------- 字幕层（后期叠，预览用） ---------------- */
  function drawSubtitle(c, text) {
    if (!text) return;
    c.save();
    c.font = `500 44px ${F_DISPLAY}`;
    c.textAlign = 'center';
    const w = c.measureText(text).width;
    const y = H * 0.745;

    // 底衬：一条纸色半透明带，保证在任何画面上都读得清
    c.fillStyle = 'rgba(250,246,236,0.82)';
    c.fillRect(W / 2 - w / 2 - 34, y - 52, w + 68, 78);
    c.strokeStyle = inkA(0.18); c.lineWidth = 1;
    c.strokeRect(W / 2 - w / 2 - 34, y - 52, w + 68, 78);

    c.fillStyle = inkA(0.95);
    c.fillText(text, W / 2, y);
    c.textAlign = 'left';
    c.restore();
  }

  /* ---------------- 镜头表 + 对外接口 ---------------- */
  const TOTAL = 30000;          // 全片 30 秒，与 specs/shots.json 的时间码一致

  const SHOTS = [
    { id: 'S01', name: '钩子', from: 0, dur: 4000, sub: '你以为析构函数只清内存？', draw: (c, t) => drawS01(c, t) },
    { id: 'S02', name: '举证', from: 4, dur: 4000, sub: '开文件、读数据、抛异常', draw: (c, t) => drawS02(c, t) },
    { id: 'S03', name: '异常', from: 8, dur: 4000, sub: '崩了之后，close 谁来调？', draw: (c, t) => drawS03(c, t) },
    { id: 'S04', name: '反转', from: 12, dur: 4000, sub: '没人写，但它一定会执行', draw: (c, t) => drawS04(c, t) },
    { id: 'S05', name: '作用域', from: 16, dur: 6000, sub: '离开作用域，死前必调析构', draw: (c, t) => drawS05(c, t) },
    { id: 'S06', name: '结构', from: 22, dur: 4000, sub: '把资源绑在对象生命周期上', draw: drawS06 },
    { id: 'S07', name: '收尾', from: 26, dur: 4000, sub: '所以 C++ 不需要 finally', draw: (c, t) => drawS07(c, t) },
  ];

  const state = {
    shotIdx: 0, t: 0, playing: true, loop: true,
    labels: true, safe: false, sub: false, fps: FPS,
    mode: 'shot',        // 'shot' 单镜循环 / 'full' 全片连播
    time: 0,             // 全片模式下的毫秒位置，0..TOTAL
  };

  let canvas, ctx, rafId = null, lastTs = 0;
  const listeners = [];

  // 定位：单镜模式看 state.t，全片模式按 state.time 反查镜头
  function locate() {
    if (state.mode === 'full') {
      const ms = Math.max(0, Math.min(TOTAL, state.time));
      for (let i = SHOTS.length - 1; i >= 0; i--) {
        if (ms >= SHOTS[i].from * 1000) {
          return { idx: i, shot: SHOTS[i], t: Math.min(ms - SHOTS[i].from * 1000, SHOTS[i].dur) };
        }
      }
      return { idx: 0, shot: SHOTS[0], t: 0 };
    }
    return { idx: state.shotIdx, shot: SHOTS[state.shotIdx], t: state.t };
  }

  function render() {
    const { shot, t } = locate();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    shot.draw(ctx, Math.min(t, shot.dur), state.labels);
    if (state.sub) drawSubtitle(ctx, shot.sub);
    if (state.safe) drawSafeArea(ctx);
    listeners.forEach(fn => fn(state, shot));
  }

  function tick(ts) {
    if (!lastTs) lastTs = ts;
    const dt = ts - lastTs;
    lastTs = ts;
    if (state.playing) {
      if (state.mode === 'full') {
        state.time += dt;
        if (state.time >= TOTAL) {
          if (state.loop) state.time = state.time % TOTAL;
          else { state.time = TOTAL; state.playing = false; }
        }
      } else {
        state.t += dt;
        const shot = SHOTS[state.shotIdx];
        if (state.t >= shot.dur) {
          if (state.loop) state.t = state.t % shot.dur;
          else { state.t = shot.dur; state.playing = false; }
        }
      }
    }
    render();
    rafId = requestAnimationFrame(tick);
  }

  window.Renderer = {
    W, H, FPS, SHOTS, state, TOTAL,
    init(cv) {
      canvas = cv;
      canvas.width = W; canvas.height = H;
      ctx = canvas.getContext('2d');
      render();
      rafId = requestAnimationFrame(tick);
    },
    select(i) {
      state.shotIdx = i;
      state.t = 0;
      if (state.mode === 'full') state.time = SHOTS[i].from * 1000;
      render();
    },
    seek(ms) {
      if (state.mode === 'full') {
        state.time = Math.max(0, Math.min(TOTAL, ms));
      } else {
        const shot = SHOTS[state.shotIdx];
        state.t = Math.max(0, Math.min(shot.dur, ms));
      }
      render();
    },
    setMode(m) {
      state.mode = m === 'full' ? 'full' : 'shot';
      if (state.mode === 'full') {
        state.time = SHOTS[state.shotIdx].from * 1000 + state.t;
      } else {
        const { idx, t } = locate();
        state.shotIdx = idx;
        state.t = t;
      }
      render();
    },
    toggle() { state.playing = !state.playing; lastTs = 0; },
    onChange(fn) { listeners.push(fn); },
    exportFrame() {
      render();
      const { shot, t } = locate();
      const a = document.createElement('a');
      const f = Math.round(t / 1000 * state.fps);
      a.download = `${shot.id}_${String(f).padStart(4, '0')}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    },
    async exportSequence(interval = 120, onProgress) {
      const shot = SHOTS[state.shotIdx];
      const total = Math.round(shot.dur / 1000 * state.fps);
      const wasPlaying = state.playing;
      const wasMode = state.mode;
      state.playing = false;
      state.mode = 'shot';
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
      state.mode = wasMode;
    },
    // 全片导出：900 帧，文件名带全片帧号，可直接 ffmpeg 合成
    async exportFull(interval = 110, onProgress) {
      const total = Math.round(TOTAL / 1000 * state.fps);
      const wasPlaying = state.playing;
      const wasMode = state.mode;
      const wasTime = state.time;
      state.playing = false;
      state.mode = 'full';
      for (let i = 0; i < total; i++) {
        state.time = (i / state.fps) * 1000;
        render();
        const a = document.createElement('a');
        a.download = `full_${String(i).padStart(4, '0')}.png`;
        a.href = canvas.toDataURL('image/png');
        a.click();
        onProgress && onProgress(i + 1, total);
        await new Promise(r => setTimeout(r, interval));
      }
      state.playing = wasPlaying;
      state.mode = wasMode;
      state.time = wasTime;
      render();
    },
    // 浏览器内直接录成 mp4：canvas 抓流 + MediaRecorder，不需要 ffmpeg
    // 录制是实时的（30 秒就跑 30 秒），所以帧率跟渲染速度绑定；
    // 渲染是确定性的，只要不掉帧，录出来就是正确的那 30 秒。
    async recordFull(onProgress) {
      const MR = typeof MediaRecorder !== 'undefined' ? MediaRecorder : null;
      if (!MR) throw new Error('这个浏览器没有 MediaRecorder，请用 Chrome / Edge');

      const cands = [
        'video/mp4;codecs=avc1.42E01E',
        'video/mp4',
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
      ];
      const mime = cands.find(t => { try { return MR.isTypeSupported(t); } catch (e) { return false; } });
      if (!mime) throw new Error('这个浏览器不支持任何可录制的格式');

      const stream = canvas.captureStream(FPS);
      const rec = new MR(stream, { mimeType: mime, videoBitsPerSecond: 16000000 });
      const chunks = [];
      rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      const stopped = new Promise(res => { rec.onstop = res; });

      const prev = { mode: state.mode, loop: state.loop, time: state.time, playing: state.playing };
      state.mode = 'full';
      state.loop = false;
      state.time = 0;
      state.playing = true;
      lastTs = 0;
      render();

      rec.start(120);

      // 等它播完；带超时保护，防止页面被切到后台时 rAF 暂停导致永远等下去
      await new Promise((resolve, reject) => {
        const t0 = Date.now();
        const iv = setInterval(() => {
          if (onProgress) onProgress(Math.min(1, state.time / TOTAL));
          if (state.time >= TOTAL) { clearInterval(iv); resolve(); }
          else if (Date.now() - t0 > TOTAL + 20000) {
            clearInterval(iv);
            reject(new Error('录制超时。录制期间请让这个页面保持在前台，不要切到别的标签'));
          }
        }, 100);
      });

      await new Promise(r => setTimeout(r, 260));
      rec.stop();
      await stopped;

      state.mode = prev.mode; state.loop = prev.loop;
      state.time = prev.time; state.playing = prev.playing;
      render();

      const blob = new Blob(chunks, { type: mime });
      const ext = mime.indexOf('mp4') >= 0 ? 'mp4' : 'webm';
      const a = document.createElement('a');
      a.download = `raii-30s.${ext}`;
      a.href = URL.createObjectURL(blob);
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);

      return { ext, size: blob.size, mime };
    },

    // 测试用：脱离动画循环，渲染全片某一毫秒
    renderAt(ms) {
      state.mode = 'full';
      state.time = ms;
      render();
    },
  };
})();
