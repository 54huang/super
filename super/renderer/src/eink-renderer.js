/* 08 · 电子墨水屏工作台 · 5 镜
 *
 * 论点：信息是滞后的。改一次要闪一次，旧内容不会立刻走。
 * 分镜顺序按 e-ink 的真实行为排：先整屏刷一次（黑→白→落字），
 * 再改一条（局部刷新），再让鬼影浮上来，最后安静下来。
 */
(function () {
  'use strict';

  const K = window.ExpKit;
  const { W, H, mulberry32, hexA, clamp01, seg, easeOut } = K;

  const PAL = {
    bg: '#D5D3CA',
    ink: '#1B1B18',
    ghost: '#6F6D66',
    edge: '#B9B7AE',
    wash: '#C6C4BA'
  };

  const F_MONO = '"Consolas","Courier New","Source Han Serif CN",monospace';
  const F_SANS = '"Microsoft YaHei","PingFang SC","Source Han Sans CN","SimHei",sans-serif';

  const X = 72, XR = W - 72;
  const TITLE_Y = 420;
  const ROW_Y = 580, ROW_H = 120;

  /* 三行状态。old 是"上一屏写的"，new 是"这一屏改成"。
   * old 一律比 new 长——不是巧合，是排版决定的：右对齐时旧值才能从左边露出来。
   * 反过来（新值比旧值长）鬼影会被新字整个盖住，白画。 */
  const ROWS = [
    { name: 'A 方案', old: '待审批', next: '已批' },
    { name: 'B 方案', old: '待法务', next: '通过' },
    { name: 'C 方案', old: '已否决', next: '已否决' }
  ];

  let bgCache = null;

  function paintBg(c) {
    c.fillStyle = PAL.bg;
    c.fillRect(0, 0, W, H);
    /* 无背光：光从上面来，越靠下越暗。
     * 中心径向渐变试过，出来的是一团雾——那是暗角，不是屏幕。 */
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(255,255,255,0.10)');
    g.addColorStop(0.45, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(60,58,50,0.16)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    // 极细的颗粒：e-ink 的底不是纯色，是微胶囊
    const rnd = mulberry32(0x2E11);
    for (let i = 0; i < 5200; i++) {
      c.fillStyle = hexA(rnd() > 0.5 ? '#FFFFFF' : '#8C8A82', 0.02 + rnd() * 0.03);
      c.fillRect(rnd() * W, rnd() * H, 1.6, 1.6);
    }
  }

  function bg(c) {
    if (!bgCache) bgCache = K.offscreen(W, H, paintBg);
    if (bgCache) c.drawImage(bgCache, 0, 0);
    else paintBg(c);
  }

  function statusBar(c, p) {
    c.save();
    c.globalAlpha = clamp01(p);
    c.font = '400 26px ' + F_SANS;
    c.fillStyle = hexA(PAL.ink, 0.74);
    c.fillText('09:41', X, 120);
    c.fillText('季度复盘', W / 2 - 52, 120);
    c.strokeStyle = hexA(PAL.ink, 0.5);
    c.lineWidth = 2.4;
    c.strokeRect(W - 148, 100, 62, 30);
    c.fillStyle = hexA(PAL.ink, 0.74);
    c.fillRect(W - 84, 108, 6, 14);
    c.fillRect(W - 144, 104, 40, 22);
    c.font = '400 22px ' + F_MONO;
    c.fillStyle = hexA(PAL.ink, 0.38);
    c.fillText('E-INK · NO BACKLIGHT', X, 186);
    c.restore();
  }

  function scene(c, o) {
    bg(c);
    statusBar(c, o.statusP == null ? 1 : o.statusP);

    // 标题
    if (o.titleP > 0) {
      c.save();
      c.globalAlpha = clamp01(o.titleP);
      c.fillStyle = hexA(PAL.ink, 0.95);
      c.font = '700 76px ' + F_SANS;
      c.fillText('待确认', X, TITLE_Y);
      c.restore();
    }

    // 上一屏留下的说明行：不刷新就一直在
    if (o.hintGhostP > 0) {
      c.save();
      c.globalAlpha = clamp01(o.hintGhostP);
      c.font = '400 30px ' + F_SANS;
      c.fillStyle = hexA(PAL.ghost, 0.24);
      c.fillText('共 3 项 · 2 项待批', X + 2, TITLE_Y + 84);
      c.restore();
    }

    // 列表
    ROWS.forEach((r, i) => {
      const rp = clamp01((o.rowsP - i * 0.2) / 0.4);
      if (rp <= 0) return;
      const y = ROW_Y + i * ROW_H;
      c.save();
      c.globalAlpha = clamp01(rp * 1.3);

      /* 刷新区：刷过的地方残余电荷不一样，底色比别处浅一格。
       * 只在"这一行刚被改过"时出现。 */
      if (o.wash && o.wash.i === i && o.wash.k > 0) {
        c.fillStyle = hexA(PAL.wash, 0.42 * o.wash.k);
        c.fillRect(X - 16, y - 44, W - 2 * (X - 16), ROW_H);
      }

      c.strokeStyle = hexA(PAL.edge, 0.85);
      c.lineWidth = 1.6;
      c.beginPath();
      c.moveTo(X, y + 56);
      c.lineTo(XR, y + 56);
      c.stroke();

      /* 被刷新的那一行：整行留一层重影——名字和旧值一起，错开 2px。
       * 只留旧值多出来的那个字是错的：读起来像"多印了一个字"，不像重影。
       * 真实局部刷新是整块重画，残影也是整行。 */
      if (o.wash && o.wash.i === i && o.wash.k > 0) {
        const k = o.wash.k;
        c.save();
        /* 残影画成一圈淡灰轮廓，不是一个能读出来的字。
         * 直接用 0.3 的灰写一遍旧值，读者会把它当"多印了一个字"；
         * 四个方向各偏 2px、每条只给 0.06，叠出来才是"这块被刷脏了"。 */
        c.font = '400 38px ' + F_SANS;
        c.fillStyle = hexA('#5E5C55', 0.07 * k);
        for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-2, -2], [2, 2]]) {
          c.textAlign = 'left';
          c.fillText(r.name, X + dx, y + 36 + dy);
          c.textAlign = 'right';
          c.font = '400 32px ' + F_SANS;
          c.fillText(r.old, XR + dx, y + 36 + dy);
        }
        c.restore();
      }

      c.fillStyle = hexA(PAL.ink, 0.9);
      c.font = '400 38px ' + F_SANS;
      c.fillText(r.name, X, y + 36);

      c.textAlign = 'right';
      c.fillStyle = hexA(PAL.ink, i === 2 ? 0.46 : 0.78);
      c.font = '400 32px ' + F_SANS;
      c.fillText(r.next, XR, y + 36);
      c.textAlign = 'left';
      c.restore();
    });

    // 整屏残影：上一屏的旧表格，落在当前内容的空白带里
    if (o.pastP > 0) {
      const k = clamp01(o.pastP);
      c.save();
      c.font = '400 26px ' + F_MONO;
      c.fillStyle = hexA(PAL.ghost, 0.22 * k);
      c.fillText('上月结转', X, 1010);
      [['7 月', '未结 7'], ['8 月', '未结 4'], ['9 月', '未结 2']].forEach((r, i) => {
        const y = 1078 + i * 88;
        c.strokeStyle = hexA(PAL.ghost, 0.15 * k);
        c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(X, y); c.lineTo(XR, y); c.stroke();
        c.font = '400 30px ' + F_SANS;
        c.fillStyle = hexA(PAL.ghost, 0.19 * k);
        c.fillText(r[0], X, y - 16);
        c.textAlign = 'right';
        c.fillText(r[1], XR, y - 16);
        c.textAlign = 'left';
      });
      c.restore();
    }

    // 底部按钮
    if (o.btnP > 0) {
      c.save();
      c.globalAlpha = clamp01(o.btnP);
      c.strokeStyle = hexA(PAL.edge, 1);
      c.lineWidth = 1.8;
      c.strokeRect(X, 1560, W - 2 * X, 96);
      c.font = '400 34px ' + F_SANS;
      c.fillStyle = hexA(PAL.ink, 0.82);
      c.fillText('刷新本页', X + 36, 1622);

      // 页码点
      for (let i = 0; i < 3; i++) {
        c.fillStyle = hexA(PAL.ink, i === 1 ? 0.7 : 0.24);
        c.beginPath();
        c.arc(W / 2 - 28 + i * 28, 1710, i === 1 ? 6 : 4.5, 0, 6.2832);
        c.fill();
      }
      c.font = '400 24px ' + F_MONO;
      c.fillStyle = hexA(PAL.ink, 0.4);
      c.fillText('PARTIAL REFRESH / GHOSTING', X, 1790);
      c.restore();
    }
  }

  /* 整屏刷新的两下闪：先全黑，再全白，然后内容落下。
   * e-ink 最像自己的动作就是这个——第一版只做了"淡入"，看起来像文字浮现，
   * 不像屏幕在刷。 */
  function fullRefresh(c, t, total) {
    const a = seg(t / total, 0, 0.10);
    const b = seg(t / total, 0.10, 0.20);
    c.save();
    if (a < 1) {
      c.fillStyle = 'rgba(12,12,11,' + (1 - a) + ')';
      c.fillRect(0, 0, W, H);
    } else if (b < 1) {
      c.fillStyle = 'rgba(242,241,236,' + (1 - b * 0.96) + ')';
      c.fillRect(0, 0, W, H);
    }
    c.restore();
  }

  const SHOTS = [
    {
      id: 'E01', name: '整屏刷新', dur: 4500,
      /* 黑 → 白 → 落字。这一下是这套介质唯一的高潮，不能省。 */
      draw(c, t, p) {
        const land = seg(p, 0.22, 0.62);
        scene(c, {
          statusP: land, titleP: land, hintGhostP: 0,
          rowsP: seg(p, 0.4, 0.9), wash: null,
          pastP: 0, btnP: seg(p, 0.75, 1)
        });
        fullRefresh(c, t, 4500);
      }
    },
    {
      id: 'E02', name: '改一条', dur: 5500,
      /* 只刷第一行：底色浅一格，旧值从"已批"左边露出来。 */
      draw(c, t, p) {
        const k = seg(p, 0.25, 0.75);
        scene(c, {
          titleP: 1, hintGhostP: 1, rowsP: 1,
          wash: { i: 0, k },
          pastP: 0, btnP: 1
        });
      }
    },
    {
      id: 'E03', name: '鬼影', dur: 5000,
      /* 旧表格从下往上浮出来。屏幕是记事的。 */
      draw(c, t, p) {
        scene(c, {
          titleP: 1, hintGhostP: 1, rowsP: 1,
          wash: { i: 0, k: 1 }, pastP: seg(p, 0.1, 0.9),
          btnP: 1
        });
      }
    },
    {
      id: 'E04', name: '再改一条', dur: 4500,
      /* 第二次局部刷新：两层残影同时在——A 是刚才的，B 是现在的。 */
      draw(c, t, p) {
        const k = seg(p, 0.2, 0.7);
        scene(c, {
          titleP: 1, hintGhostP: 1, rowsP: 1,
          wash: { i: 1, k }, pastP: 1, btnP: 1
        });
        // A 行的旧残影保持不散
        c.save();
        c.translate(-2, -2);
        c.fillStyle = hexA('#5E5C55', 0.24);
        c.font = '400 38px ' + F_SANS;
        c.fillText(ROWS[0].name, X, ROW_Y + 36);
        c.textAlign = 'right';
        c.font = '400 32px ' + F_SANS;
        c.fillText(ROWS[0].old, XR, ROW_Y + 36);
        c.restore();
      }
    },
    {
      id: 'E05', name: '安静下来', dur: 4000,
      /* 不再动它。字幕退到下面，画面只剩"改过的痕迹"。 */
      draw(c, t, p) {
        scene(c, {
          titleP: 1, hintGhostP: 1, rowsP: 1,
          wash: { i: 1, k: 1 }, pastP: seg(p, 0.4, 1), btnP: 1
        });
        c.save();
        c.globalAlpha = clamp01(seg(p, 0, 0.4));
        c.font = '400 34px ' + F_SANS;
        c.fillStyle = hexA(PAL.ink, 0.72);
        c.fillText('改过的东西，不会立刻走。', X, 1430);
        c.restore();
      }
    }
  ];

  window.Exp = {
    id: 'eink',
    label: '电子墨水屏',
    PAL,
    TOTAL: SHOTS.reduce((a, s) => a + s.dur, 0),
    SHOTS
  };
})();
