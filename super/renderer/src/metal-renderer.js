/* 09 · 金属铭牌工作台 · 5 镜
 *
 * 论点：这一条是最终版，刻上去就改不动。
 * 铭牌只有终态，没有过程可演——所以这五镜不是在讲"怎么办"，是在讲"办完了"：
 * 空牌 → 刻名 → 刻号 → 压章 → 光扫过。全片 22 秒，已经是这套介质的上限。
 */
(function () {
  'use strict';

  const K = window.ExpKit;
  const { W, H, mulberry32, hexA, clamp01, seg, easeOut } = K;

  const PAL = {
    dark: '#6B737B',
    mid: '#98A0A8',
    light: '#DAE0E5',
    body: '#464D54',
    warm: '#C9A227',
    bench: '#1E2226'
  };

  const F_MONO = '"Consolas","Courier New","Source Han Serif CN",monospace';
  const F_SONG = '"Source Han Serif CN","Songti SC","SimSun",serif';
  const F_SANS = '"Microsoft YaHei","PingFang SC","Source Han Sans CN","SimHei",sans-serif';

  const X = 80, Y = 520, PW = W - 160, PH = 660;

  /* 拉丝的线一次算好，之后每帧复用：
   * 3200 条如果每帧重算随机数，画面会在同一个种子下抖动——看起来像金属在呼吸，
   * 但那不是光在动，是随机数在动。 */
  const BRUSH = (() => {
    const rnd = mulberry32(0x7C31);
    const out = [];
    for (let i = 0; i < 3200; i++) {
      const yy = rnd();
      const full = rnd() > 0.35;
      const x0 = full ? 0 : rnd() * PW * 0.7;
      const len = full ? PW : 40 + rnd() * (PW * 0.3);
      out.push({
        y: yy, x0: x0, len: len,
        bright: rnd() > 0.48,
        a: rnd(), w: 0.5 + rnd() * 0.8
      });
    }
    for (let i = 0; i < 9; i++) {
      out.push({ y: 0.04 + rnd() * 0.92, x0: 4, len: PW - 8, groove: true, a: rnd(), w: 1.6 + rnd() * 1.6 });
    }
    return out;
  })();

  let benchCache = null;

  function paintBench(c) {
    c.fillStyle = PAL.bench;
    c.fillRect(0, 0, W, H);
  }

  function bench(c) {
    if (!benchCache) benchCache = K.offscreen(W, H, paintBench);
    if (benchCache) c.drawImage(benchCache, 0, 0);
    else paintBench(c);
  }

  function plateBase(c, p) {
    // 牌体投在工作台上的影子
    const sg = c.createLinearGradient(0, Y + PH, 0, Y + PH + 90);
    sg.addColorStop(0, 'rgba(0,0,0,0.55)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = sg;
    c.fillRect(X + 18, Y + PH, PW - 36, 90);

    const g = c.createLinearGradient(0, Y, 0, Y + PH);
    g.addColorStop(0, '#C6CDD4');
    g.addColorStop(0.10, PAL.light);
    g.addColorStop(0.42, PAL.mid);
    g.addColorStop(0.72, '#C0C7CE');
    g.addColorStop(0.94, PAL.dark);
    g.addColorStop(1, '#868E96');
    c.fillStyle = g;
    c.fillRect(X, Y, PW, PH);

    // 拉丝：极细的水平纤维，密度才是"面"，420 条像抹布擦过
    c.save();
    c.beginPath();
    c.rect(X, Y, PW, PH * clamp01(p));
    c.clip();
    for (const b of BRUSH) {
      const yy = Y + b.y * PH;
      if (b.groove) {
        c.strokeStyle = hexA('#3A4148', 0.10 + b.a * 0.10);
        c.lineWidth = b.w;
        c.beginPath(); c.moveTo(X + 4, yy); c.lineTo(X + PW - 4, yy); c.stroke();
        continue;
      }
      c.strokeStyle = b.bright
        ? hexA('#FFFFFF', 0.03 + b.a * 0.13)
        : hexA('#3F464D', 0.03 + b.a * 0.11);
      c.lineWidth = b.w;
      c.beginPath();
      c.moveTo(X + b.x0, yy);
      c.lineTo(Math.min(X + PW, X + b.x0 + b.len), yy);
      c.stroke();
    }
    c.restore();

    // 倒角：上左亮、下右暗。没有这一圈，牌体就是一张贴上去的纸
    c.strokeStyle = hexA('#FFFFFF', 0.6);
    c.lineWidth = 3;
    c.beginPath(); c.moveTo(X + 2, Y + 2); c.lineTo(X + PW - 2, Y + 2); c.stroke();
    c.beginPath(); c.moveTo(X + 2, Y + 2); c.lineTo(X + 2, Y + PH - 2); c.stroke();
    c.strokeStyle = hexA('#31373D', 0.55);
    c.beginPath(); c.moveTo(X + 2, Y + PH - 2); c.lineTo(X + PW - 2, Y + PH - 2); c.stroke();
    c.beginPath(); c.moveTo(X + PW - 2, Y + 2); c.lineTo(X + PW - 2, Y + PH - 2); c.stroke();
  }

  function rivet(c, cx, cy, k) {
    if (k <= 0) return;
    const r = 18 * (0.55 + 0.45 * easeOut(clamp01(k)));
    c.save();
    c.globalAlpha = clamp01(k * 1.4);
    const rg = c.createRadialGradient(cx - 6, cy - 7, 2, cx, cy, r * 1.22);
    rg.addColorStop(0, '#FAFCFD');
    rg.addColorStop(0.42, '#A9AFB6');
    rg.addColorStop(1, '#4E555C');
    c.fillStyle = rg;
    c.beginPath(); c.arc(cx, cy, r, 0, 6.2832); c.fill();
    c.strokeStyle = hexA('#2F353B', 0.6);
    c.lineWidth = 1.4;
    c.beginPath(); c.arc(cx, cy, r, 0, 6.2832); c.stroke();
    c.strokeStyle = hexA('#3C4248', 0.5);
    c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(cx - r * 0.6, cy); c.lineTo(cx + r * 0.6, cy); c.stroke();
    c.restore();
  }

  /* 凹刻字：光从上往下照，凹槽上沿背光（暗）、下沿接光（亮）。
   * 写成上亮下暗就是浮雕——而且是"很自然的凸"，不盯着看不会发现。 */
  function etch(c, text, x, y, size, o) {
    o = o || {};
    const d = size * 0.075;
    const w = o.reveal == null ? 1 : clamp01(o.reveal);
    if (w <= 0) return;
    c.save();
    c.font = (o.weight || '700') + ' ' + size + 'px ' + (o.font || F_SANS);
    /* 揭示宽度按这段字自己的宽度算。写死 4000 的话，rv=0.1 就够盖住一整行，
     * "一个字一个字刻"会变成"整行同时出现"。 */
    const tw = c.measureText(text).width;
    c.beginPath();
    c.rect(x - 30, y - size * 1.2, (tw + 62) * w, size * 1.8);
    c.clip();
    c.textAlign = o.align || 'left';
    c.fillStyle = hexA('#22282D', 0.9);
    c.fillText(text, x, y - d);
    c.fillStyle = hexA('#FFFFFF', 0.88);
    c.fillText(text, x, y + d);
    c.fillStyle = hexA(PAL.body, 0.97);
    c.fillText(text, x, y);
    c.textAlign = 'left';
    c.restore();
  }

  function scene(c, o) {
    bench(c);

    if (o.plateP > 0) {
      const k = clamp01(o.plateP);
      c.save();
      c.globalAlpha = k;
      plateBase(c, o.brushP == null ? 1 : o.brushP);
      c.restore();
      // 亮起来的最后一段：从暗到亮，避免"板子淡入"像 PPT
      if (k < 1) {
        c.fillStyle = 'rgba(30,34,38,' + (1 - k) * 0.85 + ')';
        c.fillRect(X, Y, PW, PH);
      }
    }

    // 标题与说明
    if (o.nameP > 0) {
      const chars = '好礼乐';
      const n = o.nameP * chars.length;
      for (let i = 0; i < chars.length; i++) {
        const rv = clamp01(n - i);
        if (rv <= 0) break;
        etch(c, chars[i], X + 110 + i * 88, Y + 190, 86, { reveal: rv });
      }
    }
    if (o.subP > 0) etch(c, '年度供货资质', X + 110, Y + 258, 34, { weight: '400', reveal: o.subP });

    // 刻线
    if (o.ruleP > 0) {
      const w = (PW - 220) * clamp01(o.ruleP);
      c.save();
      c.strokeStyle = hexA('#2F353B', 0.35);
      c.lineWidth = 2;
      c.beginPath(); c.moveTo(X + 110, Y + 316); c.lineTo(X + 110 + w, Y + 316); c.stroke();
      c.strokeStyle = hexA('#FFFFFF', 0.4);
      c.beginPath(); c.moveTo(X + 110, Y + 318); c.lineTo(X + 110 + w, Y + 318); c.stroke();
      c.restore();
    }

    if (o.idP > 0) etch(c, 'NO. 0027', X + 110, Y + 410, 58, { font: F_MONO, reveal: o.idP });
    if (o.yearP > 0) etch(c, 'R-60 / 2027 年度', X + 110, Y + 474, 30, { weight: '400', font: F_MONO, reveal: o.yearP });

    // 铆钉：四角，依次落位
    if (o.rivetP > 0) {
      const pts = [[X + 52, Y + 52], [X + PW - 52, Y + 52], [X + 52, Y + PH - 52], [X + PW - 52, Y + PH - 52]];
      pts.forEach(([cx, cy], i) => rivet(c, cx, cy, clamp01((o.rivetP - i * 0.16) / 0.4)));
    }

    // 检验章：唯一一处暖色。压下时从 1.6 收到 1，双层错位
    if (o.stampP > 0) {
      const k = clamp01(o.stampP);
      const s = 1.6 - 0.6 * easeOut(k);
      const cx = X + PW - 168, cy = Y + 176;
      c.save();
      c.globalAlpha = clamp01(k * 1.3);
      c.translate(cx, cy);
      c.scale(s, s);
      c.rotate(-0.06);
      c.strokeStyle = hexA(PAL.warm, 0.55);
      c.lineWidth = 3;
      c.beginPath(); c.arc(1.5, 1.5, 62, 0, 6.2832); c.stroke();
      c.strokeStyle = hexA(PAL.warm, 0.95);
      c.beginPath(); c.arc(0, 0, 62, 0, 6.2832); c.stroke();
      c.font = '400 26px ' + F_SANS;
      c.textAlign = 'center';
      c.fillStyle = hexA(PAL.warm, 0.95);
      c.fillText('检验', 0, -4);
      c.fillText('合格', 0, 32);
      c.textAlign = 'left';
      c.restore();
    }

    // 光扫过：一道斜向高光从左走到右。金属是自己不会亮的，亮的是扫过来的光
    if (o.sweepP > 0 && o.sweepP < 2) {
      const k = clamp01(o.sweepP);
      const sx = X - 300 + (PW + 600) * k;
      const g = c.createLinearGradient(sx - 220, Y, sx + 220, Y + PH * 0.3);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.20)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.save();
      c.beginPath();
      c.rect(X, Y, PW, PH);
      c.clip();
      c.fillStyle = g;
      c.fillRect(X, Y, PW, PH);
      c.restore();
    }

    if (o.captionP > 0) {
      c.save();
      c.globalAlpha = clamp01(o.captionP);
      c.font = '400 36px ' + F_SONG;
      c.fillStyle = hexA('#C9CFD5', 0.66);
      c.fillText('刻上去的东西，改不了。', 80, 1360);
      c.restore();
    }
  }

  const SHOTS = [
    {
      id: 'M01', name: '空牌', dur: 4000,
      /* 什么字都没有。先让观众认这层板：拉丝是从上往下长出来的。 */
      draw(c, t, p) {
        scene(c, { plateP: seg(p, 0, 0.45), brushP: seg(p, 0.15, 0.85) });
      }
    },
    {
      id: 'M02', name: '刻名', dur: 5000,
      /* 三个字一个一个刻进去，每刻一个亮一下——刻的痕迹是"新切面更亮"。 */
      draw(c, t, p) {
        scene(c, {
          plateP: 1, brushP: 1,
          nameP: seg(p, 0.08, 0.8),
          subP: seg(p, 0.72, 1)
        });
      }
    },
    {
      id: 'M03', name: '刻号', dur: 4500,
      /* 型号与编号，比名字小一档。铆钉这时候落位——牌子固定住了才算定稿。 */
      draw(c, t, p) {
        scene(c, {
          plateP: 1, brushP: 1, nameP: 1, subP: 1,
          ruleP: seg(p, 0, 0.25),
          idP: seg(p, 0.15, 0.6),
          yearP: seg(p, 0.5, 0.8),
          rivetP: seg(p, 0.55, 1)
        });
      }
    },
    {
      id: 'M04', name: '压章', dur: 4500,
      /* 章从大到小压下去，带一点错位。压完就完了，没有第二次。 */
      draw(c, t, p) {
        scene(c, {
          plateP: 1, brushP: 1, nameP: 1, subP: 1,
          ruleP: 1, idP: 1, yearP: 1, rivetP: 1,
          stampP: seg(p, 0.25, 0.7)
        });
      }
    },
    {
      id: 'M05', name: '光扫过', dur: 4000,
      /* 它自己不会亮，亮的是扫过来的光。扫过去就结束，不来回。 */
      draw(c, t, p) {
        scene(c, {
          plateP: 1, brushP: 1, nameP: 1, subP: 1,
          ruleP: 1, idP: 1, yearP: 1, rivetP: 1, stampP: 1,
          sweepP: seg(p, 0.05, 0.85),
          captionP: seg(p, 0.55, 1)
        });
      }
    }
  ];

  window.Exp = {
    id: 'metal',
    label: '金属铭牌',
    PAL,
    TOTAL: SHOTS.reduce((a, s) => a + s.dur, 0),
    SHOTS
  };
})();
