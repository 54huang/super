/* 三种待验证的风格实验：丝网印刷 / 电子墨水 / 金属铭牌
 *
 * 这三个不是"再来三种配色"，它们在介质上与 01–06 各差一层：
 *   01 发光屏 / 02 纸墨 / 03 玻璃荧光 / 04 粉笔灰 / 05 自发光板 / 06 打印纸+圆珠笔
 *   → 07 两块色版叠印（多版套准关系）
 *   → 08 无背光的灰阶屏（时间留在屏幕上的残影）
 *   → 09 金属凹刻（不可修改的最终态）
 *
 * 每个函数只画一帧静态图，用途是验证"这个介质能不能一眼认出来"。
 * 过了这一关才写案例卡——案例卡里的「已知缺陷」必须是真踩过的。
 *
 * 纪律与主渲染器一致：禁 Math.random / shadowBlur / 随机量走固定种子。
 * 唯一例外是 07 用了 globalCompositeOperation='multiply'：油墨叠印本来就是
 * 减色相乘，用半透明压一层近似出来的颜色是错的（试过，见文件末尾注）。
 */
(function () {
  'use strict';

  const W = 1080, H = 1920;

  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

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

  const F_MONO = '"Consolas","Courier New","Source Han Serif CN","SimSun",monospace';
  const F_SONG = '"Source Han Serif CN","Songti SC","SimSun",serif';
  const F_SANS = '"Microsoft YaHei","PingFang SC","Source Han Sans CN","SimHei",sans-serif';

  /* ============================================================
   * 07 · 丝网印刷（两块色版 + 错版）
   * 论点：说好的一版和印出来的一版，永远差一点。
   * 关键不是网点，是**两块版的位置关系**——所以错位量是唯一的可调参数。
   *
   * 只有两种油墨，没有黑。最深的颜色是两版叠出来的第三色，
   * 所以"哪里叠了"本身携带信息：叠加=强调，单版=次要。
   * ============================================================ */
  const RISO = {
    paper: '#F1EBDE',
    shade: '#D8CCB6',
    teal: '#1E6F8A',      // 版一
    pink: '#FF4E7A',      // 版二（荧光粉，riso 的招牌）
    deep: '#1E2242'       // 两版相乘的结果，不是独立油墨
  };

  function risoPaper(c) {
    c.fillStyle = RISO.paper;
    c.fillRect(0, 0, W, H);

    const rnd = mulberry32(0x41A7);
    // 再生纸：粗纤维
    for (let i = 0; i < 420; i++) {
      const x = rnd() * W, y = rnd() * H;
      const len = 8 + rnd() * 30;
      c.strokeStyle = hexA(RISO.shade, 0.12 + rnd() * 0.2);
      c.lineWidth = 0.8 + rnd() * 1.6;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + len, y + (rnd() - 0.5) * 5);
      c.stroke();
    }
    // 纸里的杂点
    for (let i = 0; i < 2200; i++) {
      c.fillStyle = hexA(RISO.shade, 0.07 + rnd() * 0.14);
      c.fillRect(rnd() * W, rnd() * H, 1.7, 1.7);
    }
  }

  /* 网点：只在给定矩形里撒，间距 7px、点径随种子抖。
   * 为什么不撒全屏：实测全画面（1080×1920 / step 7）是 42625 个圆、77ms，
   * 加在 87ms 的帧上约 164ms —— 不快，但**不是**性能问题。
   * 真正的理由是墨只落在有画面的地方：纸上空白处本来就不上墨，
   * 全屏撒出来的是一层均匀的噪点，看一眼就知道是滤镜。 */
  function risoDots(c, x, y, w, h, color, o) {
    const step = o.step || 7;
    const rnd = mulberry32(o.seed || 9);
    const r = o.r || 2.3;
    const a0 = o.alpha == null ? 0.9 : o.alpha;
    for (let yy = y; yy < y + h; yy += step) {
      for (let xx = x; xx < x + w; xx += step) {
        const jx = xx + (rnd() - 0.5) * 1.4;
        const jy = yy + (rnd() - 0.5) * 1.4;
        const rr = r * (0.7 + rnd() * 0.6);
        c.fillStyle = hexA(color, a0 * (0.72 + rnd() * 0.28));
        c.beginPath();
        c.arc(jx, jy, rr, 0, 6.2832);
        c.fill();
      }
    }
  }

  function riso(c, p) {
    const t = clamp01(p == null ? 1 : p);
    risoPaper(c);

    const OFF = { x: 5, y: -4 };     // 错版量：第二版整体偏移
    const BAR = { x: 108, y: 960, w: 864, h: 96, fill: 0.78 };

    c.save();                        // 全套印刷在一个画布上做减色
    c.globalCompositeOperation = 'multiply';

    // ---- 版二的实色块先落（叠印顺序对 multiply 没有影响）----
    c.fillStyle = hexA(RISO.pink, 0.92);
    c.fillRect(100, 830, 596, 70);

    // ================= 版一：青，所有"说好的一版"的结构 =================
    c.save();

    c.font = '400 28px ' + F_MONO;
    c.fillStyle = hexA(RISO.teal, 0.78);
    c.fillText('交付台账 / 2027 Q1', 108, 300);

    c.font = '700 104px ' + F_SANS;
    c.fillStyle = hexA(RISO.teal, 0.95);
    c.fillText('已交付', 108, 462);

    c.font = '700 150px ' + F_SANS;
    c.fillText('42', 104, 700);
    c.font = '400 42px ' + F_SANS;
    c.fillStyle = hexA(RISO.teal, 0.82);
    c.fillText('项', 300, 700);

    // 这一行两版都印，重叠处会变成深靛——正文级的错版最明显
    c.font = '400 30px ' + F_SANS;
    c.fillStyle = hexA(RISO.teal, 0.9);
    c.fillText('合同 12 · 方案 18 · 上线 9', 108, 800);

    // 压在那块粉上的字：青印在粉上 = 深靛，这是叠印最有力的证据
    c.font = '400 28px ' + F_SANS;
    c.fillStyle = hexA(RISO.teal, 0.95);
    c.fillText('其中 3 项延后到下个季度', 124, 876);

    // 进度条：底色块 + 网点密度，只有完成的部分被网点盖住
    c.fillStyle = hexA(RISO.teal, 0.14);
    c.fillRect(BAR.x, BAR.y, BAR.w, BAR.h);
    c.save();
    c.beginPath();
    c.rect(BAR.x, BAR.y, BAR.w * BAR.fill, BAR.h);
    c.clip();
    c.fillStyle = hexA(RISO.teal, 0.26);
    c.fillRect(BAR.x, BAR.y, BAR.w, BAR.h);
    risoDots(c, BAR.x - 4, BAR.y - 6, BAR.w + 8, BAR.h + 12, RISO.teal, { alpha: 0.9, seed: 31 });
    c.restore();

    c.font = '400 26px ' + F_MONO;
    c.fillStyle = hexA(RISO.teal, 0.62);
    c.fillText('DELIVERED 42 / TOTAL 54', BAR.x, 1120);
    c.fillText('78%', 972 - c.measureText('78%').width, 1120);

    // 论点句
    c.font = '400 36px ' + F_SONG;
    c.fillStyle = hexA(RISO.teal, 0.9);
    c.fillText('印出来的，和说好的，差一点。', 108, 1520);

    c.restore();   // 版一结束

    // ================= 版二：粉，整体歪 5px =================
    c.save();
    c.translate(W / 2, H / 2);
    c.rotate(0.0016);              // 第二块版压上去时手会歪零点几度
    c.translate(-W / 2, -H / 2);
    c.translate(OFF.x, OFF.y);

    // 标题两版都印 → 深靛的芯，两侧露出青与粉
    c.font = '700 104px ' + F_SANS;
    c.fillStyle = hexA(RISO.pink, 0.92);
    c.fillText('已交付', 108, 462);

    /* 正文行**不**双版。试过双版：30px 的字错开 5px 就是六分之一字高，
     * 二十来个字一起糊，读不成句。双版只在大字上成立，这是一条代价。 */

    // 进度条的外框跟着版二一起歪
    c.strokeStyle = hexA(RISO.pink, 0.8);
    c.lineWidth = 3;
    c.strokeRect(BAR.x, BAR.y, BAR.w, BAR.h);

    // 未完成的那 22%：只有粉版印了网点
    c.save();
    c.beginPath();
    c.rect(BAR.x + BAR.w * BAR.fill, BAR.y, BAR.w * (1 - BAR.fill), BAR.h);
    c.clip();
    risoDots(c, BAR.x + BAR.w * BAR.fill, BAR.y - 6, BAR.w * (1 - BAR.fill) + 6, BAR.h + 12,
      RISO.pink, { alpha: 0.75, seed: 77, step: 9 });
    c.restore();

    c.restore();   // 版二结束
    c.restore();   // multiply 结束

    /* 套准标记：印刷厂的语汇，也是"这是印出来的"最快的一眼。
     * 故意只画在版一的位置——现实里套准线是印在咬口上的，两版共用。 */
    c.strokeStyle = hexA(RISO.deep, 0.55);
    c.lineWidth = 1.6;
    const M = 64, L = 34;
    for (const [x, y, sx, sy] of [[M, M, 1, 1], [W - M, M, -1, 1], [M, H - M, 1, -1], [W - M, H - M, -1, -1]]) {
      c.beginPath();
      c.moveTo(x, y + sy * L); c.lineTo(x, y); c.lineTo(x + sx * L, y);
      c.stroke();
    }

    // 色标条：三种颜色，第三种是前两种乘出来的
    const BARS = [RISO.teal, RISO.pink, RISO.deep];
    c.save();
    c.globalCompositeOperation = 'multiply';
    BARS.forEach((col, i) => {
      c.fillStyle = hexA(col, 0.95);
      c.fillRect(108 + i * 46, 1620, 36, 36);
    });
    c.restore();

    c.font = '400 24px ' + F_MONO;
    c.fillStyle = hexA(RISO.deep, 0.62);
    c.fillText('2 INKS · 3 COLORS · MISREG ' + Math.abs(OFF.x) + 'px', 254, 1646);
  }

  /* ============================================================
   * 08 · 电子墨水屏（无背光 + 局部刷新残影）
   * 论点：信息是滞后的。改一次要闪一次，旧内容不会立刻走。
   * 一眼认出的不是灰，是**低对比 + 没有背光的光晕 + 该消失而没消失的字**。
   * ============================================================ */
  const EINK = {
    bg: '#D5D3CA',
    ink: '#1B1B18',
    ghost: '#6F6D66',
    edge: '#B9B7AE',
    wash: '#C6C4BA'
  };

  function eink(c, p) {
    const t = clamp01(p == null ? 1 : p);

    c.fillStyle = EINK.bg;
    c.fillRect(0, 0, W, H);

    /* 无背光：屏幕自己不发光的，亮度全靠环境光。
     * 所以越靠边越暗、上沿比下沿亮一点——是上面那盏灯照下来的。
     * （第一版用了中心径向渐变，出来后是一团雾，已改成竖向线性。） */
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(255,255,255,0.10)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.00)');
    g.addColorStop(1, 'rgba(60,58,50,0.16)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    // ---- 状态栏 ----
    c.font = '400 26px ' + F_SANS;
    c.fillStyle = hexA(EINK.ink, 0.74);
    c.fillText('09:41', 72, 120);
    c.fillText('季度复盘', W / 2 - 52, 120);
    c.strokeStyle = hexA(EINK.ink, 0.5);
    c.lineWidth = 2.4;
    c.strokeRect(W - 148, 100, 62, 30);
    c.fillStyle = hexA(EINK.ink, 0.74);
    c.fillRect(W - 84, 108, 6, 14);
    c.fillRect(W - 144, 104, 40, 22);
    c.font = '400 22px ' + F_MONO;
    c.fillStyle = hexA(EINK.ink, 0.38);
    c.fillText('E-INK · NO BACKLIGHT', 72, 176);

    // ---- 残影：上一屏的字，不刷新就一直在 ----
    c.font = '400 30px ' + F_SANS;
    c.fillStyle = hexA(EINK.ghost, 0.24);
    c.fillText('共 3 项 · 2 项待批', 74, 404);

    // ---- 本屏内容 ----
    c.fillStyle = hexA(EINK.ink, 0.95);
    c.font = '700 76px ' + F_SANS;
    c.fillText('待确认', 72, 326);

    const ROWS = [
      ['A 方案', '已批'],
      ['B 方案', '待法务'],
      ['C 方案', '已否决']
    ];
    const ROW_Y = 480, ROW_H = 116;

    /* 局部刷新过的第一行：底色比别处浅一格（刷过的地方残余电荷不一样），
     * 更关键的是旧值"待审批"还压在同一个基线上，只淡到 0.18。 */
    const k = t > 0.55 ? clamp01((t - 0.55) / 0.45) : 0;
    if (k > 0) {
      c.fillStyle = hexA(EINK.wash, 0.42 * k);
      c.fillRect(56, ROW_Y - 44, W - 112, ROW_H);
    }

    ROWS.forEach((r, i) => {
      const y = ROW_Y + i * ROW_H;
      c.strokeStyle = hexA(EINK.edge, 0.85);
      c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(72, y + 56); c.lineTo(W - 72, y + 56); c.stroke();

      c.fillStyle = hexA(EINK.ink, 0.9);
      c.font = '400 38px ' + F_SANS;
      c.fillText(r[0], 72, y + 36);

      /* 状态列右对齐——不是为了好看，是为了让残影露出来：
       * 旧值"预算待批"比新值"已批"长，右对齐之后左边会多出一大截鬼影。
       * 反过来的话（新值比旧值长）鬼影被新字整个盖住，白画。 */
      c.textAlign = 'right';
      if (i === 0 && k > 0) {
        c.fillStyle = hexA('#5E5C55', 0.36 * k);
        c.font = '400 32px ' + F_SANS;
        c.fillText('预算待批', W - 72, y + 36);
      }
      c.fillStyle = hexA(EINK.ink, i === 2 ? 0.46 : 0.78);
      c.font = '400 32px ' + F_SANS;
      c.fillText(r[1], W - 72, y + 36);
      c.textAlign = 'left';
    });

    /* 整屏残影：下面是上一屏留下的表格，没做全屏刷新（全屏刷会黑闪一下）。
     * 一块干净的空白反而不像 e-ink——屏幕是记事的。
     * 位置必须落在当前内容的空白处：第一版放在 y≈700，正好和列表三行叠在一起，
     * 看起来像排版 bug 而不是残影。 */
    if (k > 0) {
      c.font = '400 26px ' + F_MONO;
      c.fillStyle = hexA(EINK.ghost, 0.18 * k);
      c.fillText('上月结转', 72, 880);
      const PAST = [['7 月', '未结 7'], ['8 月', '未结 4'], ['9 月', '未结 2']];
      PAST.forEach((r, i) => {
        const y = 948 + i * 88;
        c.strokeStyle = hexA(EINK.ghost, 0.12 * k);
        c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(72, y); c.lineTo(W - 72, y); c.stroke();
        c.font = '400 30px ' + F_SANS;
        c.fillStyle = hexA(EINK.ghost, 0.15 * k);
        c.fillText(r[0], 72, y - 16);
        c.textAlign = 'right';
        c.fillText(r[1], W - 72, y - 16);
        c.textAlign = 'left';
      });
    }

    // 底部操作区
    c.strokeStyle = hexA(EINK.edge, 1);
    c.lineWidth = 1.8;
    c.strokeRect(72, 1560, W - 144, 96);
    c.font = '400 34px ' + F_SANS;
    c.fillStyle = hexA(EINK.ink, 0.82);
    c.fillText('刷新本页', 108, 1622);

    // 页码：三个点，第二个是当前
    for (let i = 0; i < 3; i++) {
      c.fillStyle = hexA(EINK.ink, i === 1 ? 0.7 : 0.24);
      c.beginPath();
      c.arc(W / 2 - 28 + i * 28, 1700, i === 1 ? 6 : 4.5, 0, 6.2832);
      c.fill();
    }

    c.font = '400 24px ' + F_MONO;
    c.fillStyle = hexA(EINK.ink, 0.4);
    c.fillText('PARTIAL REFRESH / GHOSTING', 72, 1790);
  }

  /* ============================================================
   * 09 · 金属铭牌（拉丝 + 凹刻 + 铆钉）
   * 论点：这一条是最终版，刻上去就改不动了。
   * 一眼认出的不是灰金配色，是**拉丝的纤维方向**和**刻痕的明暗朝向**。
   * ============================================================ */
  const METAL = {
    dark: '#69707A',
    mid: '#A2A9B0',
    light: '#D6DBE0',
    hi: '#F0F4F7',
    body: '#464D54',      // 凹槽底：比表面暗，但不是黑
    warm: '#C9A227'
  };

  function metal(c, p) {
    const t = clamp01(p == null ? 1 : p);

    // 背景：深色工作台
    c.fillStyle = '#1E2226';
    c.fillRect(0, 0, W, H);

    const X = 80, Y = 500, PW = W - 160, PH = 660;

    // 牌体投在工作台上的影子：下沿一条渐隐的暗带
    const sg = c.createLinearGradient(0, Y + PH, 0, Y + PH + 90);
    sg.addColorStop(0, 'rgba(0,0,0,0.55)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = sg;
    c.fillRect(X + 18, Y + PH, PW - 36, 90);

    // 牌体本体：竖向渐变给厚度，上沿亮下沿暗
    const g = c.createLinearGradient(0, Y, 0, Y + PH);
    g.addColorStop(0, '#C6CDD4');
    g.addColorStop(0.10, '#DAE0E5');
    g.addColorStop(0.42, '#98A0A8');
    g.addColorStop(0.72, '#C0C7CE');
    g.addColorStop(0.94, '#6B737B');
    g.addColorStop(1, '#868E96');
    c.fillStyle = g;
    c.fillRect(X, Y, PW, PH);

    /* 拉丝：极细的水平纤维，密集、断续、明暗各半。
     * 第一版只画 420 条、长 60–420px，出来像被抹布擦过，不像拉丝。
     * 现在 3200 条、多数贯通全宽、线宽 0.5–1.3。 */
    const rnd = mulberry32(0x7C31);
    for (let i = 0; i < 3200; i++) {
      const y = Y + rnd() * PH;
      const full = rnd() > 0.35;
      const x0 = full ? X : X + rnd() * PW * 0.7;
      const len = full ? PW : 40 + rnd() * (PW * 0.3);
      const bright = rnd() > 0.48;
      c.strokeStyle = bright
        ? hexA('#FFFFFF', 0.03 + rnd() * 0.13)
        : hexA('#3F464D', 0.03 + rnd() * 0.11);
      c.lineWidth = 0.5 + rnd() * 0.8;
      c.beginPath();
      c.moveTo(x0, y);
      c.lineTo(Math.min(X + PW, x0 + len), y);
      c.stroke();
    }
    // 几道更深的横向沟槽，打破均匀
    for (let i = 0; i < 9; i++) {
      const y = Y + 24 + rnd() * (PH - 48);
      c.strokeStyle = hexA('#3A4148', 0.10 + rnd() * 0.10);
      c.lineWidth = 1.6 + rnd() * 1.6;
      c.beginPath(); c.moveTo(X + 4, y); c.lineTo(X + PW - 4, y); c.stroke();
    }

    /* 倒角：四条边都有一圈窄的明暗，上左亮、下右暗——
     * 没有这一圈，牌体就是一张贴上去的纸。 */
    c.strokeStyle = hexA('#FFFFFF', 0.6);
    c.lineWidth = 3;
    c.beginPath(); c.moveTo(X + 2, Y + 2); c.lineTo(X + PW - 2, Y + 2); c.stroke();
    c.beginPath(); c.moveTo(X + 2, Y + 2); c.lineTo(X + 2, Y + PH - 2); c.stroke();
    c.strokeStyle = hexA('#31373D', 0.55);
    c.beginPath(); c.moveTo(X + 2, Y + PH - 2); c.lineTo(X + PW - 2, Y + PH - 2); c.stroke();
    c.beginPath(); c.moveTo(X + PW - 2, Y + 2); c.lineTo(X + PW - 2, Y + PH - 2); c.stroke();

    // 铆钉
    for (const [cx, cy] of [[X + 52, Y + 52], [X + PW - 52, Y + 52], [X + 52, Y + PH - 52], [X + PW - 52, Y + PH - 52]]) {
      const rg = c.createRadialGradient(cx - 6, cy - 7, 2, cx, cy, 22);
      rg.addColorStop(0, '#FAFCFD');
      rg.addColorStop(0.42, '#A9AFB6');
      rg.addColorStop(1, '#4E555C');
      c.fillStyle = rg;
      c.beginPath(); c.arc(cx, cy, 18, 0, 6.2832); c.fill();
      c.strokeStyle = hexA('#2F353B', 0.6);
      c.lineWidth = 1.4;
      c.beginPath(); c.arc(cx, cy, 18, 0, 6.2832); c.stroke();
      // 铆钉自己的凹槽
      c.strokeStyle = hexA('#3C4248', 0.5);
      c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(cx - 11, cy); c.lineTo(cx + 11, cy); c.stroke();
    }

    /* 凹刻字：字是"刻进去"的，所以是「上暗下亮」——
     * 光从上往下照，凹槽上沿背光、下沿接光。
     * 第一版写反了（上亮下暗），出来是浮雕，凸的。 */
    function etchText(text, x, y, size, o) {
      o = o || {};
      const d = size * 0.075;              // 刻深：第一版 0.055 太浅，看不出是凹的
      c.font = (o.weight || '700') + ' ' + size + 'px ' + (o.font || F_SANS);
      c.textAlign = o.align || 'left';
      c.fillStyle = hexA('#22282D', 0.9);
      c.fillText(text, x, y - d);          // 上沿：背光
      c.fillStyle = hexA('#FFFFFF', 0.88);
      c.fillText(text, x, y + d);          // 下沿：接光
      c.fillStyle = hexA(METAL.body, 0.97);
      c.fillText(text, x, y);              // 槽底
      c.textAlign = 'left';
    }

    etchText('好礼乐', X + 110, Y + 190, 86);
    etchText('年度供货资质', X + 110, Y + 258, 34, { weight: '400' });

    // 一道刻线把标题区与编号区切开
    c.strokeStyle = hexA('#2F353B', 0.35);
    c.lineWidth = 2;
    c.beginPath(); c.moveTo(X + 110, Y + 316); c.lineTo(X + PW - 110, Y + 316); c.stroke();
    c.strokeStyle = hexA('#FFFFFF', 0.4);
    c.beginPath(); c.moveTo(X + 110, Y + 318); c.lineTo(X + PW - 110, Y + 318); c.stroke();

    etchText('NO. 0027', X + 110, Y + 410, 58, { font: F_MONO });
    etchText('R-60 / 2027 年度', X + 110, Y + 474, 30, { weight: '400', font: F_MONO });

    // 金色检验章：全片唯一一点暖色，也是"检验过"的意思
    const CX = X + PW - 168, CY = Y + 176;
    c.strokeStyle = hexA(METAL.warm, 0.92);
    c.lineWidth = 3;
    c.beginPath(); c.arc(CX, CY, 62, 0, 6.2832); c.stroke();
    c.font = '400 26px ' + F_SANS;
    c.textAlign = 'center';
    c.fillStyle = hexA(METAL.warm, 0.95);
    c.fillText('检验', CX, CY - 4);
    c.fillText('合格', CX, CY + 32);
    c.textAlign = 'left';

    // 论点句
    c.font = '400 36px ' + F_SONG;
    c.fillStyle = hexA('#C9CFD5', 0.66);
    c.fillText('刻上去的东西，改不了。', 80, 1360);
  }

  window.Exp = { W, H, STYLES: { riso, eink, metal }, PAL: { RISO, EINK, METAL } };
})();
