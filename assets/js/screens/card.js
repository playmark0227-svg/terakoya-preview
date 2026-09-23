/* ============================================================
   会員証（#/card、#/card?show=1 で提示用の画面を開く）
   打ち合わせ：会員が「ここに入っている」と人に見せたくなるもの。
   - 色は続けた期間で変わる（墨 → 藍 → 漆 → 金）。続けるほど良くなるものを1つ持たせるため
   - 今月の貢献ポイントが10位以内なら「今月の印」を押す（紹介の人数とは関係ない）
   - QRは試作版では会員番号から作った模様（読み取れない）
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon;

  /* from：入会日を0日目として数えた日数（入会から90日たった日に藍になる） */
  var TIERS = [
    { id: 'ink',    name: '墨', from: 0,   span: '入会から',  lead: '' },
    { id: 'ai',     name: '藍', from: 90,  span: '3ヶ月から', lead: '3ヶ月で藍の会員証になります' },
    { id: 'urushi', name: '漆', from: 180, span: '半年から',  lead: '半年で漆の会員証になります' },
    { id: 'kin',    name: '金', from: 365, span: '1年から',   lead: '1年で金の会員証になります' }
  ];
  var CAT_ICON = { '暮らし': 'home', '子育て': 'heart', '遊び': 'sparkle', '仕事': 'briefcase', '学び': 'book' };
  var seq = 0;   // 模様の <pattern> の id を画面内で重ねないため

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
    return '<svg viewBox="0 0 ' + (N + 4) + ' ' + (N + 4) + '" shape-rendering="crispEdges" role="img" aria-label="会員番号のコード（試作版は模様）">' +
      '<path fill="currentColor" d="' + d + '"/></svg>';
  }
  /** 地紋：七宝つなぎ（円が重なり続く吉祥の柄） */
  function patternSvg() {
    var id = 'cdpat' + (++seq);
    return '<svg class="mcard__pat" aria-hidden="true" focusable="false">' +
      '<defs><pattern id="' + id + '" width="24" height="24" patternUnits="userSpaceOnUse">' +
        '<g fill="none" stroke="currentColor" stroke-width=".7">' +
          '<circle cx="0" cy="0" r="12"/><circle cx="24" cy="0" r="12"/><circle cx="0" cy="24" r="12"/>' +
          '<circle cx="24" cy="24" r="12"/><circle cx="12" cy="12" r="12"/>' +
        '</g></pattern></defs>' +
      '<rect width="100%" height="100%" fill="url(#' + id + ')"/></svg>';
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
      tierPct: next ? (days - tier.from) / (next.from - tier.from) * 100 : 100,
      rank: mine ? mine.rank : null, points: mine ? mine.value : 0,
      stamp: mine && mine.rank <= 10 && mine.value > 0 ? mine.rank : null,
      end: end
    };
  }
  function shareText(v) {
    return DATA.SITE.name + 'で学んでいます（Lv' + v.lv.lv + '「' + v.lv.name + '」・' + v.cohort + '）';
  }

  /* ---------- 会員証そのもの ----------
     opt.tier：見本の色 / opt.big：提示用 / opt.noQr：下に大きいQRを出すとき / opt.sample：見本（印は付けない） */
  function cardHtml(v, opt) {
    opt = opt || {};
    var tier = opt.tier || v.tier;
    var stamp = opt.sample ? null : v.stamp;
    return '<div class="mcard t-' + tier.id + (opt.big ? ' mcard-big' : '') + (opt.noQr ? ' is-noqr' : '') + '">' +
      patternSvg() +
      '<div class="mcard__in">' +
        '<div class="mcard__top">' +
          '<span class="mcard__brand"><span class="mcard__seal" aria-hidden="true">' + esc(DATA.SITE.seal) + '</span>' +
            '<span class="mcard__brandtx"><b class="mcard__site foil">' + esc(DATA.SITE.name) + '</b><small>会員証</small></span></span>' +
          (stamp
            ? '<span class="mcard__stamp' + (stamp === 1 ? ' is-gold' : '') + '"><small>' + (stamp === 1 ? '金の印' : '今月の印') + '</small>' +
                '<b>貢献<span class="num">' + stamp + '</span>位</b></span>'
            : '<span class="mcard__crest" title="' + esc(tier.name + 'の会員証') + '">' + esc(tier.name) + '</span>') +
        '</div>' +
        '<div class="mcard__who">' +
          '<p class="mcard__name foil">' + esc(v.name) + '</p>' +
          '<p class="mcard__id">' + esc(v.id) + '</p>' +
          '<p class="mcard__meta"><span class="mcard__lv">Lv' + esc(v.lv.lv) + '　' + esc(v.lv.name) + '</span><span>' + esc(v.cohort) + '</span></p>' +
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
  function tierBox(v) {
    var head = v.next
      ? v.next.lead + '（あと' + v.toNext + '日）'
      : '1年続けてきた方の、金の会員証です';
    return '<div class="card card-pad cd-tier">' +
      '<p class="cd-tier__now">いまは' + esc(v.tier.name) + 'の会員証・入会' + v.day + '日目</p>' +
      '<p class="cd-tier__ttl">' + esc(head) + '</p>' +
      '<div class="cd-tier__bar">' + U.progressBar(v.tierPct, 'gold') + '</div>' +
      '<div class="cd-tiers">' + TIERS.map(function (t, i) {
        var cls = i === v.tierIndex ? ' is-now' : i < v.tierIndex ? ' is-past' : '';
        return '<button class="cd-tiers__it' + cls + '" data-tier="' + t.id + '" aria-label="' + esc(t.name + 'の会員証の見本を見る') + '">' +
          '<i class="cd-tiers__sw t-' + t.id + '"></i>' +
          '<span class="cd-tiers__name">' + esc(t.name) + (i === v.tierIndex ? '<em>いま</em>' : '') + '</span>' +
          '<span class="cd-tiers__span">' + esc(t.span) + '</span></button>';
      }).join('') + '</div>' +
      '<p class="cd-tier__foot">会員証の色は、続けた期間で変わります。色を押すと見本を見られます。</p>' +
    '</div>';
  }

  function rankRow(v) {
    var sub;
    if (v.stamp === 1) sub = '今月の貢献ポイントで1位です。1位のあいだは、会員証に金の印がつきます。';
    else if (v.stamp) sub = '今月の貢献ポイントで' + v.stamp + '位です。10位以内のあいだ、会員証に印がつきます。';
    else if (!v.points) sub = '質問に答える・イベントを手伝うなどで貢献ポイントがたまります。今月10位以内に入ると、会員証に印がつきます。';
    else sub = '貢献ポイントで今月10位以内に入ると、会員証に印がつきます（いま' + v.rank + '位）。';
    return '<div class="list cd-rank"><a class="li has-ico" href="#/ranking">' +
      '<span class="li__ico">' + icon('trophy') + '</span>' +
      '<span class="li__body"><span class="li__ttl">今月の印</span><span class="li__sub">' + esc(sub) + '</span></span>' +
      (v.stamp ? '<span class="li__end"><span class="tag tag-gold">' + v.stamp + '位</span></span>' : '') +
      U.chevron() + '</a></div>';
  }

  function perksList() {
    var list = (DATA.PERKS || []).filter(function (p) { return p.how === '会員証を提示'; });
    if (!list.length) return '<div class="card">' + U.empty('card', '会員証を見せて使える福利厚生は準備中です') + '</div>';
    return '<div class="list">' + list.map(function (p) {
      return '<a class="li has-ico" href="#/perks?focus=' + encodeURIComponent(p.id) + '">' +
        '<span class="li__ico">' + icon(CAT_ICON[p.cat] || 'ticket') + '</span>' +
        '<span class="li__body"><span class="li__ttl">' + esc(p.title) + '</span><span class="li__sub">' + esc(p.desc) + '</span></span>' +
        U.chevron() + '</a>';
    }).join('') + '</div>';
  }

  /* ---------- 窓 ---------- */
  /** 提携先で見せる画面。明るい地に大きく出し、時刻を動かして「いま出している画面」だと分かるようにする */
  function openPresent() {
    if (document.querySelector('.scr-card-present')) return;
    var v = model(), timer = null, lock = null, closed = false;
    var meta = 'Lv' + v.lv.lv + '「' + v.lv.name + '」・' + v.cohort + (v.end ? '・' + dot(v.end) + 'まで有効' : '');
    var m = U.modal(
      '<div class="scr-card cd-present">' +
        '<div class="cd-present__bar"><p class="cd-present__ttl">' + icon('card') + '提携先でお見せください</p>' +
          '<button class="iconbtn" data-close aria-label="閉じる">' + icon('close') + '</button></div>' +
        cardHtml(v, { big: true, noQr: true }) +
        '<div class="cd-present__panel">' +
          '<div class="cd-present__qr">' + qrSvg(v.id) + '</div>' +
          '<div class="cd-present__info">' +
            '<p class="cd-present__name">' + esc(v.name) + '</p>' +
            '<p class="cd-present__id">' + esc(v.id) + '</p>' +
            '<p class="cd-present__meta">' + esc(meta) + '</p>' +
            '<p class="cd-present__clock"><i aria-hidden="true"></i><b data-clock-t></b><span data-clock-d></span></p>' +
          '</div>' +
        '</div>' +
        '<p class="cd-present__note">時刻が動いていることが、いま表示している会員証のしるしです。画面を明るくしてお見せください。</p>' +
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
    if (i === v.tierIndex) text = 'いまのあなたの会員証です。';
    else if (i > v.tierIndex) text = 'あと' + (t.from - v.days) + '日続けると、この色になります。';
    else text = 'ここまで続けてきた色です。';
    U.modal(
      '<div class="scr-card cd-preview">' +
        '<p class="cd-preview__eyebrow">' + (i === v.tierIndex ? '<span class="tag tag-gold">いまの会員証</span>' : '<span class="tag">見本</span>') +
          '<span>' + esc(t.span) + '</span></p>' +
        '<h3 class="modal__ttl">' + esc(t.name) + 'の会員証</h3>' +
        cardHtml(v, { tier: t, sample: i !== v.tierIndex }) +
        '<p class="sub cd-preview__txt">' + esc(text) + '</p>' +
        '<div class="modal__foot"><button class="btn btn-ink" data-close>閉じる</button></div>' +
      '</div>');
  }

  CLG.screens.card = {
    title: '会員証',
    render: function (ctx) {
      var v = model(), text = shareText(v);
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
        '<div class="page-head"><h1 class="page-ttl">会員証</h1>' +
          '<p class="page-lead">ここで学んでいる証です。提携先では、この画面を見せて使えます。</p></div>' +
        notice +
        '<div class="cd-hero"><div class="cd-hero__in">' +
          '<div class="cd-stage">' + cardHtml(v) + '</div>' +
          '<div class="cd-side">' +
            '<div class="cd-acts">' +
              '<button class="btn btn-primary btn-l btn-block" data-c="present">' + icon('qr') + '提示用に大きく表示</button>' +
              '<button class="btn btn-ghost btn-l btn-block" data-c="share">' + icon('copy') + 'シェア用の文面をコピー</button>' +
            '</div>' +
            '<div class="cd-share">' +
              '<p class="cd-share__label">コピーされる文面</p>' +
              '<p class="cd-share__text">' + esc(text) + '</p>' +
              '<p class="cd-share__hint">紹介リンクをつけて伝えるときは<a href="#/referral">紹介・報酬</a>から（#PR入りの文面があります）。</p>' +
            '</div>' +
            tierBox(v) +
            rankRow(v) +
          '</div>' +
        '</div></div>' +
        '<section class="sec"><h2 class="sec-ttl">会員証を見せると使えるもの<a href="#/perks">福利厚生をすべて見る</a></h2>' +
          perksList() +
        '</section>' +
        '<p class="proto-note cd-proto">試作版：QRコードは会員番号から作った模様で、読み取りはできません。本番では提携先で読み取れるコードにします。</p>' +
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
          U.copyText(shareText(model())).then(function () { U.toast('シェア用の文面をコピーしました', 'ok'); });
        }
      });
      // 福利厚生の窓から「会員証を表示する」で来たときは、すぐ提示用を開く
      if (ctx.query && ctx.query.show === '1') {
        try { history.replaceState(null, '', '#/card'); } catch (e) {}
        openPresent();
      }
    }
  };
})();
