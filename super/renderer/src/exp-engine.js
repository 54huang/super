/* 风格实验工作台的共用引擎（07 丝网 / 08 电子墨水 / 09 金属铭牌）
 *
 * 三个工作台是同一台机器换介质，所以引擎只写一遍：
 *   切镜、播放/循环、拖时间轴到毫秒、← → 逐帧、安全区与水印开关、
 *   导出当前帧 PNG、导出整镜序列。
 * 风格模块只提供 SHOTS（分镜与画法），其余都不管。
 *
 * 和主渲染器（shot-renderer.js / board-renderer.js）的关系：
 *   那几个是"一条具体片子的实现"，帧内容写死在函数里；
 *   这里是"一种介质的试验台"，同一个引擎能跑三种风格，用途不同。
 *
 * 纪律一致：禁 Math.random、禁 shadowBlur、禁滤镜；随机量走 mulberry32 固定种子，
 * 同一时刻两次渲染必须同帧。
 */
(function () {
  'use strict';

  const W = 1080, H = 1920, FPS = 30;

  /* 竖屏安全区：底部 18%（1574 以下）与右侧 12% 会被平台 UI 遮挡。
   * 三个风格共用同一条线，改这里就等于三个工作台一起改。 */
  const SAFE = { x: 72, y: 210, w: W - 144, h: 1364 };

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

  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const seg = (t, a, b) => clamp01((t - a) / (b - a));

  /* 离屏画布缓存：纸纹、拉丝、牌体渐变这些每帧都一样的东西画一次就够。
   * 不做这一步，丝网那张纸每帧要重撒 2200 个杂点、金属要重画 3200 条拉丝，
   * 1080 下直接掉到十几帧——静态层缓存是这套做法能不能实时预览的前提。 */
  function offscreen(w, h, paint) {
    const c = (typeof document !== 'undefined')
      ? document.createElement('canvas')
      : null;
    if (!c) return null;
    c.width = w; c.height = h;
    paint(c.getContext('2d'));
    return c;
  }

  function boot(cv, E) {
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d', { alpha: false });
    const S = { shotIdx: 0, t: 0, playing: true, loop: true, safe: false, mark: false };
    const TOTAL = E.SHOTS.reduce((a, s) => a + s.dur, 0);
    const listeners = [];
    const $ = id => document.getElementById(id);

    function paint() {
      const shot = E.SHOTS[S.shotIdx];
      const p = clamp01(S.t / shot.dur);
      ctx.save();
      shot.draw(ctx, S.t, p);
      ctx.restore();

      if (S.safe) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,60,60,.85)';
        ctx.lineWidth = 2;
        ctx.setLineDash([12, 8]);
        ctx.strokeRect(SAFE.x, SAFE.y, SAFE.w, SAFE.h);
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,60,60,.85)';
        ctx.font = '400 22px ui-monospace,Consolas,monospace';
        ctx.fillText('SAFE ' + SAFE.w + '×' + SAFE.h, SAFE.x, SAFE.y - 12);
        ctx.restore();
      }
      if (S.mark) {
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,.62)';
        ctx.fillRect(0, H - 56, W, 56);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '400 24px ui-monospace,Consolas,monospace';
        const f = Math.min(Math.round(shot.dur / 1000 * FPS), Math.round(S.t / 1000 * FPS));
        ctx.fillText(shot.id + '  f' + String(f).padStart(3, '0') + '  ' + S.t + 'ms', 24, H - 20);
        ctx.restore();
      }
    }

    function emit() {
      const shot = E.SHOTS[S.shotIdx];
      listeners.forEach(fn => fn(S, shot, TOTAL));
      const scrub = $('scrub');
      if (scrub) { scrub.max = shot.dur; scrub.value = S.t; }
      const tCur = $('tCur');
      if (tCur) tCur.textContent = fmt(S.t);
      const tTot = $('tTot');
      if (tTot) tTot.textContent = fmt(shot.dur);
      const tag = $('shotTag');
      if (tag) tag.textContent = shot.id;
      const fi = $('frameInfo');
      if (fi) {
        const total = Math.round(shot.dur / 1000 * FPS);
        const cur = Math.min(total, Math.round(S.t / 1000 * FPS));
        fi.textContent = '帧 ' + cur + ' / ' + total;
      }
      const bp = $('btnPlay');
      if (bp) { bp.textContent = S.playing ? '暂停' : '播放'; bp.classList.toggle('active', S.playing); }
      document.querySelectorAll('[data-shot]').forEach(b =>
        b.classList.toggle('active', +b.dataset.shot === S.shotIdx));
    }

    function fmt(ms) {
      const s = Math.floor(ms / 1000);
      const f = Math.floor((ms % 1000) / 1000 * FPS);
      return '00:' + String(s).padStart(2, '0') + '.' + String(f).padStart(2, '0');
    }

    function select(i) { S.shotIdx = Math.max(0, Math.min(E.SHOTS.length - 1, i)); S.t = 0; paint(); emit(); }
    function seek(ms) {
      const dur = E.SHOTS[S.shotIdx].dur;
      S.t = Math.max(0, Math.min(dur, ms));
      paint(); emit();
    }
    function toggle() { S.playing = !S.playing; emit(); }
    function onChange(fn) { listeners.push(fn); fn(S, E.SHOTS[S.shotIdx], TOTAL); }

    /* 时钟：用 rAF 的时间差推进，不用 setInterval —— 后者在后台标签会被节流，
     * 回来时一次跳好几秒，观感像"卡了一下然后瞬移"。 */
    let last = 0;
    function tick(now) {
      if (!last) last = now;
      const dt = Math.min(120, now - last);
      last = now;
      if (S.playing) {
        S.t += dt;
        const dur = E.SHOTS[S.shotIdx].dur;
        if (S.t >= dur) {
          if (S.loop) { S.t = 0; }
          else { S.t = dur; S.playing = false; }
        }
        paint(); emit();
      }
      requestAnimationFrame(tick);
    }

    // ---- UI 绑定（元素不存在就跳过，方便只拿引擎出图）----
    const shotBtns = $('shotBtns');
    if (shotBtns) {
      E.SHOTS.forEach((s, i) => {
        const b = document.createElement('button');
        b.textContent = s.id + ' ' + s.name;
        b.dataset.shot = i;
        b.onclick = () => select(i);
        shotBtns.appendChild(b);
      });
    }
    const scrub = $('scrub');
    if (scrub) scrub.oninput = () => { S.playing = false; seek(+scrub.value); };
    if ($('btnPlay')) $('btnPlay').onclick = toggle;
    if ($('btnLoop')) $('btnLoop').onclick = e => { S.loop = !S.loop; e.target.textContent = '循环：' + (S.loop ? '开' : '关'); };
    if ($('btnRestart')) $('btnRestart').onclick = () => seek(0);
    if ($('chkSafe')) $('chkSafe').onchange = e => { S.safe = e.target.checked; paint(); };
    if ($('chkMark')) $('chkMark').onchange = e => { S.mark = e.target.checked; paint(); };

    function download(url, name) {
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    function exportFrame() {
      const was = S.mark; S.mark = false; paint();
      const url = cv.toDataURL('image/png');
      S.mark = was; paint();
      const shot = E.SHOTS[S.shotIdx];
      const f = Math.round(S.t / 1000 * FPS);
      download(url, E.id + '_' + shot.id + '_f' + String(f).padStart(3, '0') + '.png');
    }

    async function exportSequence(stepMs, onProgress) {
      const shot = E.SHOTS[S.shotIdx];
      const total = Math.round(shot.dur / 1000 * FPS);
      const was = S.mark, wasPlay = S.playing;
      S.mark = false; S.playing = false;
      for (let i = 0; i < total; i++) {
        S.t = i * (1000 / FPS);
        paint();
        download(cv.toDataURL('image/png'), E.id + '_' + shot.id + '_' + String(i).padStart(4, '0') + '.png');
        if (onProgress) onProgress(i + 1, total);
        if (i % 4 === 3) await new Promise(r => setTimeout(r, stepMs || 60));
      }
      S.mark = was; S.playing = wasPlay;
      paint();
    }

    if ($('btnFrame')) $('btnFrame').onclick = exportFrame;
    if ($('btnSeq')) $('btnSeq').onclick = async () => {
      const prog = $('prog'), hint = $('expHint');
      const total = Math.round(E.SHOTS[S.shotIdx].dur / 1000 * FPS);
      if (hint) hint.textContent = '正在导出 ' + total + ' 帧，请允许浏览器连续下载…';
      await exportSequence(60, (i, n) => {
        if (prog) prog.style.width = (i / n * 100) + '%';
        if (hint) hint.textContent = '导出中 ' + i + ' / ' + n;
      });
      if (prog) prog.style.width = '100%';
      if (hint) hint.textContent = '完成：' + total + ' 帧。';
    };

    window.addEventListener('keydown', e => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.code === 'Space') { e.preventDefault(); toggle(); }
      if (e.code === 'ArrowRight') { e.preventDefault(); S.playing = false; seek(S.t + 1000 / FPS); }
      if (e.code === 'ArrowLeft') { e.preventDefault(); S.playing = false; seek(S.t - 1000 / FPS); }
    });

    paint(); emit();
    requestAnimationFrame(tick);

    return { S, select, seek, toggle, onChange, exportFrame, exportSequence, paint, TOTAL };
  }

  window.ExpKit = {
    W, H, FPS, SAFE,
    mulberry32, hexA, clamp01, lerp, easeOut, easeInOut, seg, offscreen, boot
  };
})();
