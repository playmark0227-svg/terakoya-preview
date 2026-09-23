/* ============================================================
   会員証（#/card、#/card?show=1 で提示用の画面を開く）
   - 色は続けた期間で変わる（黒 → 紺 → 金）
   - 今月の貢献ポイントが10位以内なら、カードの右上に順位を出す（紹介の人数とは関係ない）
   - QRは試作版では会員番号から作った模様（読み取れない）
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon;

  /* from：入会日を0日目として数えた日数（入会から90日たった日に紺になる） */
  var TIERS = [
    { id: 'black', name: '黒', from: 0,   span: '入会から',     past: '入会から3ヶ月までの色です。' },
    { id: 'navy',  name: '紺', from: 90,  span: '入会3ヶ月から', past: '入会3ヶ月から1年までの色です。' },
    { id: 'gold',  name: '金', from: 365, span: '入会1年から' }
  ];

  /* ---------- 会員番号から毎回同じ模様を作る ---------- */
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), a | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /** QRコードに似た21×21の模様。位置合わせの四角とタイミングの点線だけ本物に合わせてある */
  function qrSvg(seed) {
    var N = 21, rand = rng(hash('qr|' + seed)), g = [], x, y;
    for (y = 0; y < N; y++) { g[y] = []; for (x = 0; x < N; x++) g[y][x] = rand() < 0.48; }
    function finder(ox, oy) {
      for (var dy = -1; dy <= 7; dy++) for (var dx = -1; dx <= 7; dx++) {
        var px = ox + dx, py = oy + dy;
        if (px < 0 || py < 0 || px >= N || py >= N) continue;
        var ring = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6 && (dx === 0 || dx === 6 || dy === 0 || dy === 6);
        var core = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
        g[py][px] = ring || core;
      }
    }
    finder(0, 0); finder(N - 7, 0); finder(0, N - 7);
    for (var i = 8; i < N - 8; i++) { g[6][i] = i % 2 === 0; g[i][6] = i % 2 === 0; }
    g[N - 8][8] = true;
    var d = '';
    for (y = 0; y < N; y++) {
      x = 0;
      while (x < N) {
        if (!g[y][x]) { x++; continue; }
        var s = x;
        while (x < N && g[y][x]) x++;
        d += 'M' + (s + 2) + ' ' + (y + 2) + 'h' + (x - s) + 'v1h-' + (x - s) + 'z';
      }
    }
    return '<svg viewBox="0 0 ' + (N + 4) + ' ' + (N + 4) + '" shape-rendering="crispEdges" role="img" aria-label="会員番号のコード">' +
      '<path fill="currentColor" d="' + d + '"/></svg>';
  }

  function dot(d) { d = new Date(d); return d.getFullYear() + '.' + U.pad(d.getMonth() + 1) + '.' + U.pad(d.getDate()); }

  /* ---------- 画面で使う値 ---------- */
  function model() {
    var m = R.me(), lv = R.level(), plan = R.plan();
    var day = R.day(), days = Math.max(0, day - 1);
    var ti = 0;
    TIERS.forEach(function (t, i) { if (days >= t.from) ti = i; });
    var tier = TIERS[ti], next = TIERS[ti + 1] || null;
    var mine = R.ranking('points').filter(function (r) { return r.me; })[0] || null;
    var end = null;
    // 解約は「次の請求日の前日まで使える」ので、有効期限はその前日
    if (plan.status === 'canceling' && plan.cancelAt) { end = new Date(plan.cancelAt); end.setDate(end.getDate() - 1); }
    return {
      name: m.name || '会員', id: m.id || '', joinedAt: m.joinedAt || CLG.now().toISOString(),
      cohort: R.cohort(), lv: lv, day: day, days: days,
      tier: tier, tierIndex: ti, next: next, toNext: next ? next.from - days : 0,
      rank: mine ? mine.rank : null, points: mine ? mine.value : 0,
      top: mine && mine.rank <= 10 && mine.value > 0 ? mine.rank : null,
      end: end
    };
  }
  function shareText(v) {
    return DATA.SITE.name + 'で学んでいます（Lv' + v.lv.lv + '「' + v.lv.name + '」・' + v.cohort + '）';
  }

  /* ---------- 会員証そのもの ----------
     opt.tier：見本の色 / opt.big：提示用 / opt.noQr：下に大きいQRを出すとき / opt.sample：見本（順位は出さない） */
  function cardHtml(v, opt) {
    opt = opt || {};
    var tier = opt.tier || v.tier;
    var top = opt.sample ? null : v.top;
    return '<div class="mcard t-' + tier.id + (opt.big ? ' mcard-big' : '') + (opt.noQr ? ' is-noqr' : '') + '">' +
      '<div class="mcard__in">' +
        '<div class="mcard__top">' +
          '<span class="mcard__brand"><b>' + esc(DATA.SITE.name) + '</b><small>会員証</small></span>' +
          (top ? '<span class="mcard__rank' + (top === 1 ? ' is-first' : '') + '">今月の貢献 ' + top + '位</span>' : '') +
        '</div>' +
        '<div class="mcard__who">' +
          '<p class="mcard__name">' + esc(v.name) + '</p>' +
          '<p class="mcard__id">' + esc(v.id) + '</p>' +
          '<p class="mcard__meta"><b>Lv' + esc(v.lv.lv) + ' ' + esc(v.lv.name) + '</b>・' + esc(v.cohort) + '</p>' +
        '</div>' +
        (opt.noQr ? '' : '<div class="mcard__qr">' + qrSvg(v.id) + '</div>') +
        '<dl class="mcard__kv">' +
          '<div><dt>入会日</dt><dd>' + dot(v.joinedAt) + '</dd></div>' +
          '<div><dt>有効期限</dt><dd>' + (v.end ? dot(v.end) + 'まで' : '自動更新') + '</dd></div>' +
        '</dl>' +
      '</div>' +
    '</div>';
  }

  /* ---------- 画面の部品 ---------- */
  function tierList(v) {
    return '<section class="cd-sec"><h2 class="sec-ttl">会員証の色</h2><div class="list">' +
      TIERS.map(function (t, i) {
        var now = i === v.tierIndex;
        var end = i === v.tierIndex + 1 ? 'あと' + v.toNext + '日' : '';
        return '<button class="li has-ico cd-tier' + (now ? ' is-now' : '') + '" data-tier="' + t.id + '" aria-label="' + esc(t.name + 'の会員証を見る') + '"' + (now ? ' aria-current="true"' : '') + '>' +
          '<span class="li__ico"><i class="cd-sw t-' + t.id + '"></i></span>' +
          '<span class="li__body"><span class="li__ttl">' + esc(t.name) + '<span class="cd-tier__span">' + esc(t.span) + '</span></span></span>' +
          (end ? '<span class="li__end">' + esc(end) + '</span>' : '') +
          U.chevron() + '</button>';
      }).join('') +
    '</div></section>';
  }

  function moreList(v) {
    return '<div class="list">' +
      '<a class="li" href="#/ranking">' +
        '<span class="li__body"><span class="li__ttl">今月の貢献ポイント</span>' +
          '<span class="li__sub">10位以内に入ると、会員証に順位が出ます</span></span>' +
        (v.rank && v.points > 0 ? '<span class="li__end cd-rank">' + v.rank + '位</span>' : '') +
        U.chevron() + '</a>' +
      '<button class="li" data-c="share">' +
        '<span class="li__body"><span class="li__ttl">シェア用の文面をコピー</span>' +
          '<span class="cd-share">' + esc(shareText(v)) + '</span></span>' +
        '<span class="li__end">' + icon('copy') + '</span></button>' +
    '</div>';
  }

  function perksList() {
    var list = (DATA.PERKS || []).filter(function (p) { return p.how === '会員証を提示'; });
    if (!list.length) return '<div class="card">' + U.empty('', '会員証で使える割引は準備中です') + '</div>';
    return '<div class="list">' + list.map(function (p) {
      return '<a class="li" href="#/perks?focus=' + encodeURIComponent(p.id) + '">' +
        '<span class="li__body"><span class="li__ttl">' + esc(p.title) + '</span></span>' +
        U.chevron() + '</a>';
    }).join('') + '</div>';
  }

  /* ---------- 窓 ---------- */
  /** 提携先で見せる画面。明るい地に大きく出し、時刻を動かしてスクリーンショットと見分けられるようにする */
  function openPresent() {
    if (document.querySelector('.scr-card-present')) return;
    var v = model(), timer = null, lock = null, closed = false;
    var m = U.modal(
      '<div class="scr-card cd-present">' +
        '<div class="cd-present__bar"><p class="cd-present__ttl">会員証</p>' +
          '<button class="iconbtn" data-close aria-label="閉じる">' + icon('close') + '</button></div>' +
        cardHtml(v, { big: true, noQr: true }) +
        '<div class="cd-present__panel">' +
          '<div class="cd-present__qr">' + qrSvg(v.id) + '</div>' +
          '<dl class="cd-present__info">' +
            '<div><dt>会員番号</dt><dd class="cd-present__id">' + esc(v.id) + '</dd></div>' +
            '<div><dt>表示時刻</dt><dd class="cd-present__clock"><b data-clock-t></b><span data-clock-d></span></dd></div>' +
          '</dl>' +
        '</div>' +
        '<button class="btn btn-ink btn-l btn-block" data-close>閉じる</button>' +
      '</div>',
      { onClose: function () {
        closed = true;
        clearInterval(timer);
        window.removeEventListener('hashchange', onHash);
        document.removeEventListener('visibilitychange', onVisible);
        if (lock) { try { lock.release(); } catch (e) {} lock = null; }
      } });
    m.classList.add('scr-card-present');
    var ct = m.querySelector('[data-clock-t]'), cd = m.querySelector('[data-clock-d]');
    function tick() {
      var n = CLG.now();
      ct.textContent = U.pad(n.getHours()) + ':' + U.pad(n.getMinutes()) + ':' + U.pad(n.getSeconds());
      cd.textContent = U.fmtDate(n, { noYear: true });
    }
    tick();
    timer = setInterval(tick, 1000);
    // 全面の窓なので、スマホの「戻る」で別の画面に移ったら一緒に閉じる（窓だけ残って下の画面が変わるのを防ぐ）
    function onHash() { m.close(); }
    window.addEventListener('hashchange', onHash);
    // 見せている間は画面を消さない（対応していない端末では何もしない）。
    // 別のアプリに切り替えると自動で外れるので、戻ってきたら付け直す
    function keepAwake() {
      try {
        if (closed || lock || !navigator.wakeLock || !navigator.wakeLock.request) return;
        navigator.wakeLock.request('screen').then(function (l) {
          if (closed) { try { l.release(); } catch (e) {} return; }
          lock = l;
          l.addEventListener('release', function () { if (lock === l) lock = null; });
        }).catch(function () {});
      } catch (e) {}
    }
    function onVisible() { if (document.visibilityState === 'visible') keepAwake(); }
    document.addEventListener('visibilitychange', onVisible);
    keepAwake();
  }

  function openTier(id) {
    var v = model(), t = null, i;
    for (i = 0; i < TIERS.length; i++) if (TIERS[i].id === id) { t = TIERS[i]; break; }
    if (!t) return;
    var text;
    if (i === v.tierIndex) text = 'いまの会員証です。';
    else if (i > v.tierIndex) text = t.span + '。あと' + (t.from - v.days) + '日です。';
    else text = t.past;
    U.modal(
      '<div class="scr-card cd-preview">' +
        '<h3 class="modal__ttl">' + esc(t.name) + 'の会員証</h3>' +
        cardHtml(v, { tier: t, sample: i !== v.tierIndex }) +
        '<p class="sub cd-preview__txt">' + esc(text) + '</p>' +
        '<div class="modal__foot"><button class="btn btn-ink" data-close>閉じる</button></div>' +
      '</div>');
  }

  CLG.screens.card = {
    title: '会員証',
    render: function (ctx) {
      var v = model();
      var notice = '';
      if (v.end) {
        notice = '<div class="notice notice-warn cd-notice">' + icon('info') +
          '<div>解約の手続きが済んでいます。会員証は' + esc(U.fmtDate(v.end)) + 'まで使えます。' +
          '<a href="#/account">取り消すときはアカウントから</a></div></div>';
      } else if (v.day <= 1) {
        notice = '<div class="notice notice-ok cd-notice">' + icon('checkc') +
          '<div>入会ありがとうございます。会員証は今日から使えます。</div></div>';
      }
      return '<div class="scr-card">' +
        '<div class="page-head"><h1 class="page-ttl">会員証</h1></div>' +
        notice +
        '<div class="cd-hero"><div class="cd-hero__in">' +
          '<div class="cd-stage">' + cardHtml(v) + '</div>' +
          '<div class="cd-side">' +
            '<button class="btn btn-primary btn-l btn-block" data-c="present">' + icon('qr') + 'お店で見せる</button>' +
            tierList(v) +
            moreList(v) +
          '</div>' +
        '</div></div>' +
        '<section class="sec"><h2 class="sec-ttl">会員証で使える割引<a href="#/perks">すべての福利厚生</a></h2>' +
          perksList() +
        '</section>' +
      '</div>';
    },
    mount: function (root, ctx) {
      var el = root.querySelector('.scr-card');
      if (!el) return;
      // 描き直すたびに新しい要素になるので、ここに付ければ二重にならない
      el.addEventListener('click', function (e) {
        var b = e.target.closest('[data-c],[data-tier]');
        if (!b || !el.contains(b)) return;
        if (b.hasAttribute('data-tier')) { openTier(b.getAttribute('data-tier')); return; }
        var act = b.getAttribute('data-c');
        if (act === 'present') openPresent();
        else if (act === 'share') {
          U.copyText(shareText(model())).then(function () { U.toast('コピーしました', 'ok'); });
        }
      });
      // 福利厚生の窓から「会員証を表示」で来たときは、すぐ提示用を開く
      if (ctx.query && ctx.query.show === '1') {
        try { history.replaceState(null, '', '#/card'); } catch (e) {}
        openPresent();
      }
    }
  };
})();
