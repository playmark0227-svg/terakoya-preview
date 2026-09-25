/* ============================================================
   会員証（#/card、#/card?show=1 で提示用の画面を開く）
   - 色は続けた期間で変わる（黒 → 紺 → 金）
   - 表に出すもの：顔・名前・会員番号・レベルと入会の月・バッジ（修了した講座・発表・完了した案件）・
     入会日・次回更新。今月の貢献ポイントが10位以内なら右上に順位（紹介の人数とは関係ない）
   - 使えない状態（終了・休会・支払いの猶予切れ）は、QRの場所にその状態を出し、お店で見せるボタンを出さない。
     止まっている画面（講座・ランキング・福利厚生）へのリンク、シェア用の文面、割引の一覧も出さない。
     終了した人（R.planGate('card') で開ける）は「会員期間終了」の面。色はもう変わらないので、色の一覧は押せない行にする
   - 解約予定のときは上に知らせを出し、その場で「解約を取り消す」（R.resumePlan）。
     支払いエラーのまま解約した人（plan().failedAt）も取り消せる（支払いエラーに戻る）。お支払いは骨組みの帯の「カードを更新する」
   - 表の左上は屋号のロゴ（U.brandmark。濃い面の色は会員証の色 --t-fg に合わせる：card.css）
   - 割引の一覧は、会員証を見せて使う福利厚生（使い方の決め方と期限は福利厚生の画面と同じ：CLG.screens.perks.howKind / isOpen）
   - QRは試作版では会員番号から作った模様（読み取れない）。スタートガイドの LINE の窓も同じものを使う（qr）
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon;
  var cur = null;

  /* from：入会日を0日目として数えた日数（入会から90日たった日に紺になる）
     short：狭い幅で出す長さ（「入会」を省く） */
  var TIERS = [
    { id: 'black', name: '黒', from: 0,   pre: '', span: '入会から',  past: '入会から3か月までの色です。' },
    { id: 'navy',  name: '紺', from: 90,  pre: '入会', span: '3か月から', past: '入会3か月から1年までの色です。' },
    { id: 'gold',  name: '金', from: 365, pre: '入会', span: '1年から' }
  ];
  /* 使えない状態と、表に出す文字 */
  var OFF = { ended: '会員期間終了', paused: '休会中', limited: '利用停止中' };

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
  /** QRコードに似た21×21の模様。位置合わせの四角とタイミングの点線だけ本物に合わせてある。
      label は読み上げの名前（esc はここでする） */
  function qrSvg(seed, label) {
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
    return '<svg viewBox="0 0 ' + (N + 4) + ' ' + (N + 4) + '" shape-rendering="crispEdges" role="img" aria-label="' + esc(label || '会員番号のコード') + '">' +
      '<path fill="currentColor" d="' + d + '"/></svg>';
  }

  function dot(d) { d = new Date(d); return d.getFullYear() + '.' + U.pad(d.getMonth() + 1) + '.' + U.pad(d.getDate()); }
  /** 「10/2」。今年でなければ年も付ける */
  function md(d) {
    d = new Date(d);
    if (isNaN(d)) return '';
    return (d.getFullYear() !== CLG.now().getFullYear() ? d.getFullYear() + '/' : '') + (d.getMonth() + 1) + '/' + d.getDate();
  }

  /* ---------- 画面で使う値 ---------- */
  function badges() {
    var st = CLG.store.state, list = [];
    var courses = R.completedCount();
    var speak = (st.attended || []).filter(function (a) { return a.speaker; }).length;
    var gigs = Object.keys(st.gigs || {}).filter(function (id) { var g = R.gigState(id); return g && g.key === 'done'; }).length;
    if (courses) list.push('講座 ' + courses + '本修了');
    if (speak) list.push('発表 ' + speak + '回');
    if (gigs) list.push('案件 ' + gigs + '件完了');
    return list;
  }
  function model() {
    var m = R.me(), lv = R.level(), plan = R.plan(), p = R.person('me');
    var day = R.day(), days = Math.max(0, day - 1);
    var ti = 0;
    TIERS.forEach(function (t, i) { if (days >= t.from) ti = i; });
    var tier = TIERS[ti], next = TIERS[ti + 1] || null;
    var mine = R.ranking('points').filter(function (r) { return r.me; })[0] || null;
    var points = mine ? mine.value : 0;
    // 使えない状態：終了・休会・支払いの猶予切れ
    var off = plan.status === 'ended' ? 'ended' : plan.status === 'paused' ? 'paused' : plan.limited ? 'limited' : '';
    // 表の2つ目の欄：ふだんは次回更新。解約予定は使える最後の日、終了・休会はその日
    var term = ['次回更新', plan.nextBill ? md(plan.nextBill) : ''];
    if (plan.status === 'canceling') term = ['有効期限', md(plan.lastDay) + 'まで'];
    else if (plan.status === 'ended') term = ['終了日', md(plan.lastDay)];
    else if (plan.status === 'paused') term = ['再開', md(plan.pausedUntil)];
    else if (plan.status === 'past_due') term = ['次回更新', off ? '' : 'お支払い確認中'];
    return {
      name: m.name || '会員', id: m.id || '', joinedAt: m.joinedAt || CLG.now().toISOString(),
      face: { name: m.name || '会員', color: m.color, photo: p.photo },
      cohort: R.cohort(), lv: lv, day: day, days: days,
      tier: tier, tierIndex: ti, next: next, toNext: next ? next.from - days : 0,
      rank: mine && points > 0 ? mine.rank : null, points: points, total: R.rankTotal(),
      top: mine && mine.rank <= 10 && points > 0 ? mine.rank : null,
      plan: plan, off: off, term: term, courses: R.completedCount(), badges: badges()
    };
  }
  function shareText(v) {
    return DATA.SITE.name + 'で学んでいます（Lv' + v.lv.lv + '「' + v.lv.name + '」・' + v.cohort + '）';
  }
  /** 画面に出すときの同じ文。レベルと入会の月は途中で割らない（「独り／立ち」と割れるため） */
  function shareHtml(v) {
    return esc(DATA.SITE.name) + 'で学んでいます（<span class="nw">Lv' + esc(v.lv.lv) + '「' + esc(v.lv.name) + '」</span>・' +
      '<span class="nw">' + esc(v.cohort) + '</span>）';
  }

  /* ---------- 会員証そのもの ----------
     opt.tier：見本の色 / opt.big：提示用 / opt.noQr：下に大きいQRを出すとき / opt.sample：見本（順位・バッジ・状態は出さない） */
  function cardHtml(v, opt) {
    opt = opt || {};
    var tier = opt.tier || v.tier;
    var top = opt.sample ? null : v.top;
    var off = opt.sample ? '' : v.off;
    var bs = opt.sample ? [] : v.badges.slice(0, 3);
    return '<div class="mcard t-' + tier.id + (opt.big ? ' mcard-big' : '') + (opt.noQr ? ' is-noqr' : '') + (off ? ' is-off' : '') + '">' +
      '<div class="mcard__in">' +
        '<div class="mcard__top">' +
          '<span class="mcard__brand">' + U.brandmark(DATA.SITE, '会員証', { cls: 'brandmark--deep' }) + '</span>' +
          (top && !off ? '<span class="mcard__rank' + (top === 1 ? ' is-first' : '') + '">今月の貢献 ' + top + '位</span>' : '') +
        '</div>' +
        '<div class="mcard__who">' +
          '<span class="mcard__av">' + U.avatar(v.face) + '</span>' +
          '<div class="mcard__txt">' +
            '<p class="mcard__name">' + esc(v.name) + '</p>' +
            '<p class="mcard__id">' + esc(v.id) + '</p>' +
            '<p class="mcard__meta"><b>Lv' + esc(v.lv.lv) + ' ' + esc(v.lv.name) + '</b><span class="mcard__cohort">・' + esc(v.cohort) + '</span></p>' +
          '</div>' +
        '</div>' +
        (bs.length ? '<ul class="mcard__badges" aria-label="バッジ">' + bs.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>' : '') +
        (off ? '<p class="mcard__state">' + esc(OFF[off]) + '</p>'
          : opt.noQr ? '' : '<div class="mcard__qr">' + qrSvg(v.id) + '</div>') +
        '<dl class="mcard__kv">' +
          '<div><dt>入会日</dt><dd>' + dot(v.joinedAt) + '</dd></div>' +
          (v.term[1] ? '<div><dt>' + esc(v.term[0]) + '</dt><dd>' + esc(v.term[1]) + '</dd></div>' : '') +
        '</dl>' +
      '</div>' +
    '</div>';
  }

  /* ---------- 画面の部品 ---------- */
  function tierList(v) {
    // 会員期間が終わった人は、色がもう変わらない。見本の窓は開かず、いまの色を示すだけの行にする
    var still = v.off === 'ended';
    return '<section class="cd-sec" aria-labelledby="cdTierTtl"><h2 class="sec-ttl" id="cdTierTtl">会員証の色</h2><div class="list">' +
      TIERS.map(function (t, i) {
        var now = i === v.tierIndex;
        // 会員期間が終わった人には、次の色までの日数を出さない（もう進まないため）
        var end = i === v.tierIndex + 1 && !still ? 'あと' + v.toNext + '日' : '';
        var inner = '<span class="li__ico"><i class="cd-sw t-' + t.id + '"></i></span>' +
          '<span class="li__body"><span class="li__ttl">' + esc(t.name) +
            '<span class="cd-tier__span">・' + (t.pre ? '<span class="cd-tier__pre">' + esc(t.pre) + '</span>' : '') + esc(t.span) + '</span></span></span>' +
          (end ? '<span class="li__end num">' + esc(end) + '</span>' : '');
        if (still) {
          return '<div class="li has-ico cd-tier' + (now ? ' is-now' : '') + '"' + (now ? ' aria-current="true"' : '') + '>' + inner + '</div>';
        }
        return '<button type="button" class="li has-ico cd-tier' + (now ? ' is-now' : '') + '" data-cd-tier="' + t.id + '" aria-haspopup="dialog"' + (now ? ' aria-current="true"' : '') + '>' +
          inner + U.chevron() + '</button>';
      }).join('') +
    '</div></section>';
  }

  function recordList(v) {
    var rank = v.rank
      ? '<span class="li__ttl">今月の貢献ポイント ' + v.rank + '位</span>' +
        '<span class="li__sub">' + (v.total ? U.num(v.total) + '人中・' : '') + U.num(v.points) + 'pt</span>'
      : '<span class="li__ttl">今月の貢献ポイント</span><span class="li__sub">今月のポイントはまだありません</span>';
    // 使えない状態（終了・休会・支払いの猶予切れ）では、講座とランキングの画面は止まっているので、行を押せる形にしない。
    // シェア用の文面（「学んでいます」）も出さない
    function row(href, body) {
      return v.off ? '<div class="li">' + body + '</div>' : '<a class="li" href="' + href + '">' + body + U.chevron() + '</a>';
    }
    return '<section class="cd-sec" aria-labelledby="cdRecTtl"><h2 class="sec-ttl" id="cdRecTtl">記録</h2><div class="list">' +
      row('#/courses', '<span class="li__body"><span class="li__ttl">修了した講座</span></span>' +
        '<span class="li__end cd-val num">' + v.courses + '本</span>') +
      // 会員期間が終わった人は今月のランキングに入らないので、順位の行は出さない
      (v.off === 'ended' ? '' : row('#/ranking', '<span class="li__body">' + rank + '</span>')) +
      (v.off ? '' : '<button type="button" class="li" data-cd-share>' +
        '<span class="li__body"><span class="li__ttl">シェア用の文面をコピー</span>' +
          '<span class="cd-share">' + shareHtml(v) + '</span></span>' +
        '<span class="li__end">' + icon('copy') + '</span></button>') +
    '</div></section>';
  }

  /** 期限（'2026-12-31'）が過ぎた福利厚生は出さない。使い方と期限の決め方は福利厚生の画面のものを使う（食い違わないように） */
  function perkOpen(p) {
    var P = CLG.screens.perks;
    if (P && P.isOpen) return P.isOpen(p);
    if (!p.until) return true;
    var s = String(p.until), d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T23:59:59') : new Date(s);
    return isNaN(d) || d >= CLG.now();
  }
  function byCard(p) {
    var P = CLG.screens.perks;
    return P && P.howKind ? P.howKind(p) === 'card' : (p.howType === 'card' || String(p.how || '').indexOf('会員証') >= 0);
  }
  function perksList() {
    // 会員証を見せて使うもの（運営が足した福利厚生は「受付で会員証を見せる」のような文のこともある）
    var list = (DATA.PERKS || []).filter(function (p) { return byCard(p) && perkOpen(p); });
    if (!list.length) return '<div class="card">' + U.empty('', '会員証で使える割引はまだありません') + '</div>';
    return '<div class="list">' + list.map(function (p) {
      return '<a class="li" href="#/perks?focus=' + encodeURIComponent(p.id) + '">' +
        '<span class="li__body"><span class="li__ttl">' + U.jp(p.title) + '</span>' +
          (p.example ? '<span class="li__sub">' + U.jp(p.example) + '</span>' : '') + '</span>' +
        U.chevron() + '</a>';
    }).join('') + '</div>';
  }

  /** お店で見せるボタン（使えない状態では出さず、理由を書く） */
  function presentBtn(v) {
    if (v.off === 'ended') return '<p class="cd-off">会員期間が終わったため、お店では使えません。</p>';
    if (v.off === 'paused') return '<p class="cd-off">休会中は、お店では使えません。</p>';
    if (v.off === 'limited') return '<p class="cd-off">お支払いが確認できるまで、お店では使えません。</p>';
    return '<button type="button" class="btn btn-primary btn-l btn-block cd-present-btn" data-cd-present>' + icon('qr') + 'お店で見せる</button>';
  }

  /* ---------- 窓 ---------- */
  /** 提携先で見せる画面。明るい地に大きく出し、時刻を動かしてスクリーンショットと見分けられるようにする */
  function openPresent() {
    if (document.querySelector('.scr-card-present')) return;
    var v = model(), timer = null, lock = null, closed = false;
    if (v.off) return;
    var m = U.modal(
      '<div class="scr-card cd-present">' +
        '<div class="cd-present__bar"><h2 class="cd-present__ttl">会員証</h2>' +
          '<button type="button" class="iconbtn" data-close aria-label="閉じる">' + icon('close') + '</button></div>' +
        cardHtml(v, { big: true, noQr: true }) +
        '<div class="cd-present__panel">' +
          '<div class="cd-present__qr">' + qrSvg(v.id) + '</div>' +
          '<dl class="cd-present__info">' +
            '<div><dt>会員番号</dt><dd class="cd-present__id">' + esc(v.id) + '</dd></div>' +
            '<div><dt>表示時刻</dt><dd class="cd-present__clock"><b data-clock-t></b><span data-clock-d></span></dd></div>' +
          '</dl>' +
        '</div>' +
        '<button type="button" class="btn btn-ink btn-l btn-block" data-close>閉じる</button>' +
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
    else if (i > v.tierIndex) text = t.pre + t.span + '。あと' + (t.from - v.days) + '日です。';
    else text = t.past;
    U.modal(
      '<div class="cd-preview">' + cardHtml(v, { tier: t, sample: i !== v.tierIndex }) +
        '<p class="sub cd-preview__txt">' + esc(text) + '</p></div>',
      { title: t.name + 'の会員証', cls: 'scr-card', foot: true });
  }

  CLG.screens.card = {
    title: '会員証',
    render: function (ctx) {
      var v = model();
      var notice = '';
      if (v.plan.status === 'canceling') {
        // 取り消しはその場で（アカウントの契約の欄と同じ R.resumePlan）。
        // 支払いエラーのまま解約した人は、期限を過ぎると使えなくなるので「使えます」とは言わない。取り消すと支払いエラーに戻り、
        // お支払い（カードを更新する）は骨組みの帯にあるので、ここには置かない
        var last = '<span class="nw">' + esc(U.fmtDate(v.plan.lastDay, { noYear: true })) + '</span>';
        notice = '<div class="notice notice-warn cd-notice">' + icon('info') +
          '<div>解約の手続きが済んでいます。' + (v.plan.failedAt ? '会員期間は' + last + 'で終わります。' : '会員証は' + last + 'まで使えます。') +
          '<div class="cd-notice__acts"><button type="button" class="btn btn-ghost btn-s" data-cd-resume data-focus-after="[data-cd-present]">解約を取り消す</button></div></div></div>';
      } else if (v.day <= 1 && !v.off) {
        notice = '<div class="notice notice-ok cd-notice">' + icon('checkc') +
          '<div>入会ありがとうございます。会員証は今日から使えます。</div></div>';
      }
      return '<div class="scr-card">' +
        '<div class="page-head"><h1 class="page-ttl" data-page-title tabindex="-1">会員証</h1></div>' +
        notice +
        '<div class="cd-hero">' +
          '<div class="cd-stage">' + cardHtml(v) + presentBtn(v) + '</div>' +
          '<div class="cd-side">' + tierList(v) + recordList(v) + '</div>' +
        '</div>' +
        // お店で使えない状態のあいだは、割引の一覧も出さない（福利厚生の画面も止まっているため）
        (v.off ? '' : '<section class="sec" aria-labelledby="cdPerkTtl">' +
          '<div class="cd-sec__head"><h2 class="sec-ttl" id="cdPerkTtl">会員証で使える割引</h2><a class="cd-sec__more" href="#/perks">福利厚生を見る</a></div>' +
          perksList() +
        '</section>') +
      '</div>';
    },
    mount: function (root, ctx) {
      cur = ctx;
      // 福利厚生の窓から「会員証を出す」で来たときは、すぐ提示用を開く
      if (ctx.query && ctx.query.show === '1') {
        try { history.replaceState(null, '', '#/card'); } catch (e) {}
        openPresent();
      }
      if (root.__boundCard) return;
      root.__boundCard = true;
      root.addEventListener('click', function (e) {
        var b = e.target.closest('.scr-card [data-cd-tier], .scr-card [data-cd-present], .scr-card [data-cd-share], .scr-card [data-cd-resume]');
        if (!b || b.closest('.modal')) return;
        if (b.hasAttribute('data-cd-resume')) {
          if (R.plan().status !== 'canceling') { cur.refresh(); return; }   // 描き直す前の古いボタン
          var np = R.resumePlan();
          CLG.app.reward(np);
          // 支払いエラーのまま解約していた人は、支払いエラーに戻る（払えていない請求が残っている）
          if (np && np.status === 'past_due') U.toast('解約を取り消しました。カードを更新すると、お支払いが済みます');
          else U.toast('解約を取り消しました。このまま続けて使えます', 'ok');
          cur.refresh();
          return;
        }
        if (b.hasAttribute('data-cd-tier')) openTier(b.getAttribute('data-cd-tier'));
        else if (b.hasAttribute('data-cd-present')) openPresent();
        else U.copyText(shareText(model())).then(function () { U.toast('シェア用の文面をコピーしました', 'ok'); });
      });
    },
    /* スタートガイドの LINE の窓（友だち追加のコード）でも同じ模様を使う */
    qr: qrSvg
  };
})();
