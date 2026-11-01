/* 07 · 丝网印刷工作台 · 5 镜
 *
 * 论点：说好的一版和印出来的一版，永远差一点。
 * 分镜不是为了讲一个故事，是为了让"错版"这个动作**发生**——
 * 所以第一镜只有一块版，第二镜第二块版才压上来。
 */
(function () {
  'use strict';

  const K = window.ExpKit;
  const { W, H, mulberry32, hexA, clamp01, seg, easeOut, easeInOut } = K;

  const PAL = {
    paper: '#F1EBDE',
    shade: '#D8CCB6',
    teal: '#1E6F8A',
    pink: '#FF4E7A',
    deep: '#1E2242'
  };

  const F_MONO = '"Consolas","Courier New","Source Han Serif CN",monospace';
  const F_SONG = '"Source Han Serif CN","Songti SC","SimSun",serif';
  const F_SANS = '"Microsoft YaHei","PingFang SC","Source Han Sans CN","SimHei",sans-serif';

  const X = 108, XR = 972;
  const TITLE_Y = 580, NUM_Y = 840;
  const ROW_Y = [960, 1022, 1084];
  const BLOCK = { y: 1046, h: 68 };
  const BAR = { x: X, y: 1200, w: 864, h: 96, fill: 0.78 };

  let paperCache = null;

  function paintPaper(c) {
    c.fillStyle = PAL.paper;
    c.fillRect(0, 0, W, H);
    const rnd = mulberry32(0x41A7);
    for (let i = 0; i < 420; i++) {
      const x = rnd() * W, y = rnd() * H, len = 8 + rnd() * 30;
      c.strokeStyle = hexA(PAL.shade, 0.12 + rnd() * 0.2);
      c.lineWidth = 0.8 + rnd() * 1.6;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + len, y + (rnd() - 0.5) * 5);
      c.stroke();
    }
    for (let i = 0; i < 2200; i++) {
      c.fillStyle = hexA(PAL.shade, 0.07 + rnd() * 0.14);
      c.fillRect(rnd() * W, rnd() * H, 1.7, 1.7);
    }
  }

  function paper(c) {
    if (!paperCache) paperCache = K.offscreen(W, H, paintPaper);
    if (paperCache) c.drawImage(paperCache, 0, 0);
    else paintPaper(c);
  }

  /* 网点：只在给定矩形里撒。全画面撒过一版，实测 42625 个圆 77ms——
   * 不是性能问题，是纸上空白处本来就不上墨。 */
  function dots(c, x, y, w, h, color, o) {
    const step = o.step || 7;
    const rnd = mulberry32(o.seed || 9);
    const r0 = o.r || 2.3;
    const a0 = o.alpha == null ? 0.9 : o.alpha;
    for (let yy = y; yy < y + h; yy += step) {
      for (let xx = x; xx < x + w; xx += step) {
        const rr = r0 * (0.7 + rnd() * 0.6);
        c.fillStyle = hexA(color, a0 * (0.72 + rnd() * 0.28));
        c.beginPath();
        c.arc(xx + (rnd() - 0.5) * 1.4, yy + (rnd() - 0.5) * 1.4, rr, 0, 6.2832);
        c.fill();
      }
    }
  }

  function clipText(c, text, x, y, w, p, font, color) {
    if (p <= 0) return;
    c.save();
    c.beginPath();
    c.rect(x - 6, y - 140, (w + 6) * clamp01(p), 200);
    c.clip();
    c.font = font;
    c.fillStyle = color;
    c.fillText(text, x, y);
    c.restore();
  }

  /* 整幅印刷：先画纸，再开 multiply 叠两版油墨。
   * 用半透明压一层近似叠印是错的（试过），油墨是减色相乘。 */
  function scene(c, o) {
    paper(c);
    c.save();
    c.globalCompositeOperation = 'multiply';

    const G = (col, a) => hexA(col, a);

    // ---- 版二先落：实色块（叠印顺序对 multiply 无影响）----
    if (o.blockP > 0) {
      /* 块的宽度必须等于这一行的宽度（X-16 → XR），不能比行短。
       * 短一截的话它读成"贴在旁边的一张便签"，而这一镜要说的是
       * "本来该印这一行的位置，改印了别的"——盖不满就不是替换。 */
      c.save();
      c.beginPath();
      c.rect(X - 16, BLOCK.y, XR - X + 16, BLOCK.h * clamp01(o.blockP));
      c.clip();
      c.fillStyle = G(PAL.pink, 0.92);
      c.fillRect(X - 16, BLOCK.y, XR - X + 16, BLOCK.h);
      c.restore();
    }

    // ================= 版一：青 =================
    if (o.eyebrowP > 0) {
      c.globalAlpha = clamp01(o.eyebrowP);
      c.font = '400 28px ' + F_MONO;
      c.fillStyle = G(PAL.teal, 0.78);
      c.fillText('交付台账 / 2027 Q1', X, 380);
      c.globalAlpha = 1;
    }

    if (o.titleP > 0) {
      clipText(c, '已交付', X, TITLE_Y, 320, o.titleP, '700 104px ' + F_SANS, G(PAL.teal, 0.95));
    }

    if (o.numP > 0) {
      clipText(c, '42', X - 4, NUM_Y, 190, o.numP, '700 150px ' + F_SANS, G(PAL.teal, 0.95));
      c.globalAlpha = clamp01(o.numP * 1.4);
      c.font = '400 42px ' + F_SANS;
      c.fillStyle = G(PAL.teal, 0.82);
      c.fillText('项', 330, NUM_Y);
      c.globalAlpha = 1;
    }

    // 三行台账：每一行一条细线，逐行印出来
    const ROWS = [['合同', '12'], ['方案', '18'], ['上线', '9']];
    ROWS.forEach((r, i) => {
      const p = clamp01((o.rowsP - i * 0.18) / 0.4);
      if (p <= 0) return;
      /* 第三行会被粉块盖掉：multiply 盖不住东西，只能让它自己退场。
       * 真印刷里这块是"本来该印第三行，改印了别的"——所以是替换，不是遮挡。 */
      const hide = (i === 2) ? clamp01((o.blockP - 0.25) / 0.5) : 0;
      if (hide >= 1) return;
      c.globalAlpha = 1 - hide;
      const y = ROW_Y[i];
      c.save();
      c.beginPath();
      c.rect(X - 6, y - 60, (XR - X + 12) * p, 90);
      c.clip();
      c.font = '400 40px ' + F_SANS;
      c.fillStyle = G(PAL.teal, 0.9);
      c.fillText(r[0], X, y);
      c.font = '700 44px ' + F_MONO;
      c.fillText(r[1], X + 150, y);
      // 行尾的一条引导线：印刷里的"填到这儿"
      c.strokeStyle = G(PAL.teal, 0.28);
      c.lineWidth = 1.4;
      c.beginPath();
      c.moveTo(X + 240, y - 12);
      c.lineTo(XR, y - 12);
      c.stroke();
      c.restore();
      c.globalAlpha = 1;
    });

    // 压在第三行上的粉块：本该印完的那行被换成了别的
    if (o.blockP > 0.5) {
      c.globalAlpha = clamp01((o.blockP - 0.5) / 0.5);
      c.font = '400 30px ' + F_SANS;
      c.fillStyle = G(PAL.teal, 0.95);
      c.fillText('其中 3 项延后到下季度', 124, BLOCK.y + BLOCK.h - 22);
      c.globalAlpha = 1;
    }

    // 进度条：青版网点覆盖完成度
    if (o.barP > 0) {
      c.fillStyle = G(PAL.teal, 0.14);
      c.fillRect(BAR.x, BAR.y, BAR.w, BAR.h);
      c.save();
      c.beginPath();
      c.rect(BAR.x, BAR.y, BAR.w * BAR.fill * clamp01(o.barP), BAR.h);
      c.clip();
      c.fillStyle = G(PAL.teal, 0.10);
      c.fillRect(BAR.x, BAR.y, BAR.w, BAR.h);
      dots(c, BAR.x - 4, BAR.y - 6, BAR.w + 8, BAR.h + 12, PAL.teal, { alpha: 0.82, seed: 31, step: 8.5, r: 2.2 });
      c.restore();

      c.font = '400 26px ' + F_MONO;
      c.fillStyle = G(PAL.teal, 0.62);
      c.fillText('DELIVERED 42 / TOTAL 54', BAR.x, BAR.y + 152);
    }

    if (o.thesisP > 0) {
      const s = '印出来的，和说好的，差一点。';
      const n = Math.floor(s.length * clamp01(o.thesisP));
      c.font = '400 36px ' + F_SONG;
      c.fillStyle = G(PAL.teal, 0.9);
      c.fillText(s.slice(0, n), X, 1440);
    }

    // ================= 版二：粉，整体歪一点 =================
    if (o.pinkP > 0) {
      const k = clamp01(o.pinkP);
      c.save();
      c.translate(W / 2, H / 2);
      c.rotate(0.0016);
      c.translate(-W / 2, -H / 2);
      /* 落版过程中偏移从 46 收到 5：错版是"发生"的，不是一开始就在那儿。
       * 写成 5 + (46-5)*(1-k) 的话，k=1 会停在 46 —— 反过来算过一次，
       * 结果第二块版永远没对准，画面看起来像两块版各印各的。 */
      const q = 1 - easeOut(k);
      c.translate(5 + (46 - 5) * q, -4 + (-38 + 4) * q);
      c.globalAlpha = clamp01(k * 1.2);

      c.font = '700 104px ' + F_SANS;
      c.fillStyle = G(PAL.pink, 0.92);
      c.fillText('已交付', X, TITLE_Y);

      /* 第二块版只印大字。40px 的行标签错 5px 就是八分之一字高，
       * 两份叠在一起读成了三个字——正文一律单版，这条是介质本身的限制。 */
      if (o.numP > 0.5) {
        c.font = '700 150px ' + F_SANS;
        c.fillStyle = G(PAL.pink, 0.9);
        c.fillText('42', X - 4, NUM_Y);
      }

      if (o.barFrameP > 0) {
        c.globalAlpha = clamp01(k * 1.2) * clamp01(o.barFrameP);
        c.strokeStyle = G(PAL.pink, 0.8);
        c.lineWidth = 3;
        c.strokeRect(BAR.x, BAR.y, BAR.w, BAR.h);
        c.save();
        c.beginPath();
        c.rect(BAR.x + BAR.w * BAR.fill, BAR.y, BAR.w * (1 - BAR.fill), BAR.h);
        c.clip();
        dots(c, BAR.x + BAR.w * BAR.fill, BAR.y - 6, BAR.w * (1 - BAR.fill) + 6, BAR.h + 12,
          PAL.pink, { alpha: 0.7, seed: 77, step: 8.5, r: 2.2 });
        c.restore();
      }
      c.restore();
    }
    c.restore();   // multiply 结束

    // ---- 套准标记与色标：印刷厂的语汇，宣告"这是印的" ----
    if (o.marksP > 0) {
      c.save();
      c.globalAlpha = clamp01(o.marksP);
      c.strokeStyle = hexA(PAL.deep, 0.55);
      c.lineWidth = 1.6;
      const M = 64, L = 34;
      for (const [x, y, sx, sy] of [[M, M, 1, 1], [W - M, M, -1, 1], [M, H - M, 1, -1], [W - M, H - M, -1, -1]]) {
        c.beginPath();
        c.moveTo(x, y + sy * L); c.lineTo(x, y); c.lineTo(x + sx * L, y);
        c.stroke();
      }
      if (o.colorbarP > 0) {
        c.globalAlpha = clamp01(o.marksP) * clamp01(o.colorbarP);
        c.save();
        c.globalCompositeOperation = 'multiply';
        [PAL.teal, PAL.pink, PAL.deep].forEach((col, i) => {
          c.fillStyle = hexA(col, 0.95);
          c.fillRect(X + i * 46, 1530, 36, 36);
        });
        c.restore();
        c.font = '400 24px ' + F_MONO;
        c.fillStyle = hexA(PAL.deep, 0.62);
        c.fillText('2 INKS · 3 COLORS · MISREG 5px', 254, 1556);
      }
      c.restore();
    }
  }

  const SHOTS = [
    {
      id: 'R01', name: '落版一', dur: 5000,
      /* 只有一块版。观众先看到"说好的一版"长什么样——青、干净、对得准。 */
      draw(c, t, p) {
        scene(c, {
          eyebrowP: seg(p, 0.05, 0.3),
          titleP: seg(p, 0.12, 0.55),
          numP: seg(p, 0.34, 0.68),
          rowsP: seg(p, 0.55, 0.92),
          blockP: 0, barP: 0, thesisP: 0,
          pinkP: 0, barFrameP: 0, marksP: seg(p, 0.9, 1)
        });
      }
    },
    {
      id: 'R02', name: '压版二', dur: 4500,
      /* 第二块版压上来，从 46px 收到 5px。错版从此存在，且收不回去。 */
      draw(c, t, p) {
        scene(c, {
          eyebrowP: 1, titleP: 1, numP: seg(p, 0, 0.3), rowsP: 1,
          blockP: 0, barP: 0, thesisP: 0,
          pinkP: seg(p, 0.12, 0.62), barFrameP: seg(p, 0.55, 0.85), marksP: seg(p, 0.7, 1)
        });
      }
    },
    {
      id: 'R03', name: '三行差一点', dur: 5500,
      /* 三行本该齐。第三行被一块粉盖住，换成"延后到下季度"。 */
      draw(c, t, p) {
        scene(c, {
          eyebrowP: 1, titleP: 1, numP: 1,
          rowsP: seg(p, 0.05, 0.55),
          blockP: seg(p, 0.6, 0.95),
          barP: seg(p, 0.75, 1) * 0.04, thesisP: 0,
          pinkP: 1, barFrameP: 0, marksP: 1
        });
      }
    },
    {
      id: 'R04', name: '网点进度', dur: 4000,
      /* 网点表达密度，不表达质感。78% 是印上去的，剩下 22% 只有粉版。 */
      draw(c, t, p) {
        scene(c, {
          eyebrowP: 1, titleP: 1, numP: 1, rowsP: 1, blockP: 1,
          barP: seg(p, 0.05, 0.75), thesisP: 0,
          pinkP: 1, barFrameP: seg(p, 0.55, 0.9), marksP: 1
        });
      }
    },
    {
      id: 'R05', name: '结论', dur: 4500,
      /* 收尾：一句话 + 色标条。两个元素都在宣告"这是印出来的"。 */
      draw(c, t, p) {
        scene(c, {
          eyebrowP: 1, titleP: 1, numP: 1, rowsP: 1, blockP: 1,
          barP: 1, thesisP: seg(p, 0.1, 0.7),
          pinkP: 1, barFrameP: 1,
          marksP: 1, colorbarP: seg(p, 0.45, 0.85)
        });
      }
    }
  ];

  window.Exp = {
    id: 'riso',
    label: '丝网印刷',
    PAL,
    TOTAL: SHOTS.reduce((a, s) => a + s.dur, 0),
    SHOTS
  };
})();
