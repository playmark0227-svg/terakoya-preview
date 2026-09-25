/* ============================================================
   運営画面の骨組み（ログイン・メニュー・画面の切り替え・焦点・会員ページとのつながり）
   ------------------------------------------------------------
   A1〜A3 の担当へ：画面は assets/js/admin/<画面>.js で CLG.admin.screens に登録する。形は会員ページの画面と同じ。

     (function () {
       'use strict';
       var CLG = window.CLG, AD = CLG.admin, AU = AD.ui, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
       var esc = U.esc, icon = U.icon;
       var cur = null;                               // mount で受け取った ctx（押したときに使う）
       AD.screens.members = {
         title: '会員',                              // または function (ctx) { return '…'; }（タブの題「会員｜TAISEI 運営」）
         render: function (ctx) {                    // HTML の文字列を返す。DOM に触らない。何度も呼ばれる
           return '<div class="a-members">' + AU.head({ title: '会員' }) + AU.table({ id: 'members', rows: ctx.data.members(), … }) + '</div>';
         },
         mount: function (root, ctx) {               // 押したときの動き。root は毎回同じ #adView
           cur = ctx;
           if (root.__boundMembers) return;          // root への addEventListener は1回だけ
           root.__boundMembers = true;
           root.addEventListener('click', function (e) {
             var b = e.target.closest('.a-members [data-mb-note]'); if (!b) return;
             …; cur.refresh();
           });
         },
         load: function (ctx) { return Promise.resolve(); },  // 任意。待つあいだは AU.skeleton(skeleton) を出す
         skeleton: 'table',                          // 任意。'table' | 'page'
         nav: 'members'                              // 任意。光らせるメニューの項目（既定は画面名）
       };
     })();

   ■ URL と画面
     #/<画面名>/<引数>?<キー>=<値>。#/members/<会員番号> だけは会員の詳細（screens.member・member-detail.js）に回す。
     ほかの画面の引数（#/inbox/<スレッドid>、#/gigs/<id>、#/events/<id>）は、その画面が ctx.params で受ける。
     画面の一覧：dashboard members member onboarding inbox courses gigs events feed perks payments referrals points reports settings
     ? の後ろだけが変わるとき（絞り込み・タブ）は同じ画面の描き直し：先頭に戻さず、焦点も残す。
     リンクの形（ほかの画面から飛んでくるもの。受ける側で作る）：
       #/members?status=past_due  #/members/<会員番号>?tab=pay  #/onboarding  #/inbox?status=open  #/inbox/<id>（デモ会員は live）
       #/gigs?tab=apps|review  #/events?tab=proposals  #/feed?tab=reports  #/perks?tab=experts
       #/payments?status=failed  #/referrals?status=ready  #/points  #/reports  #/settings?tab=audit|staff|templates

   ■ ctx
     name params query key（会員ページと同じ）/ go(hash) / refresh({ focus }) / setQuery(patch, { replace, focus }) / announce(text)
     R U DATA（会員ページと同じもの）/ AU（CLG.admin.ui）/ db（CLG.admin.db）/ data（CLG.admin.data）/ ops（CLG.admin.ops）
     staff（いまログインしている運営 { id, name, role, email, person }）/ live（AD.data.live()：いま会員ページにいるデモ会員）

   ■ 決まりごと
     - 画面の CSS は .a-<画面名> で閉じる（people.css・content.css・money.css）。骨組みと部品は .ad-*（admin.css）。
       窓・引き出しは body の直下に出るので AU.drawer(html, { cls: 'a-<画面名>' }) にする。
     - 外から来た文字（会員の名前・メッセージ・運営の入力）は必ず esc()。href に入れる値は encodeURIComponent も。
     - デモ会員の分を書き換えるのは R.*（§5-12）。運営画面だけの分は AD.db.update(fn)。お金・ポイント・状態を変える操作は
       AU.act({ …, audit }) で理由を書いてもらい、操作の記録に残す。
       返金・ログインの停止・ポイント・面談の枠・運営が直す中身（CMS）は AD.ops（seed.js の先頭）を通す（会員ページの R.* と運営画面の記録を
       一度に書き、画面が違っても同じ操作の記録になる）。デモ会員の応募・繰り上げ・通報・月末の締めは、その画面から R.* を直接呼ぶ。
     - 役割（設定の「役割でできること」＝ AU.ROLE_TABLE）：押せない操作は AU.dis で disabled にし、AU.roleNote で理由を1行出す。
       押したときも AU.need で確かめる（ボタンを作らない経路・キーボードの送信もあるため）。
     - 書き換えたら ctx.refresh()。会員ページのタブで変わったとき（storage）も、ここが描き直す（入力中・窓が開いているときは待つ）。
       骨組みが自分で描き直すとき（別のタブで変わった・? だけ変わった）は、書きかけの欄（id のある input・textarea）の文を残す。
       ctx.refresh() は画面が呼ぶ描き直しなので残さない（送ったあとの返信欄は空に戻る）。
     - 紹介した人数・紹介報酬の額で会員を並べる表（ランキング）は作らない（画面づくりの約束 §3）。
     - ボタンの data-* は画面の略を頭に付ける（data-mb-… など）。骨組みが使う名前：data-ad-act data-ad-demo data-ad-member data-ad-skip
       data-ad-find data-pw data-pop data-tb-*（表）data-nav。id：adRoot adApp adView adSide adNav adTop adFind adMe adProto adAnnouncer toast
     - 見出しは AU.head（h1 に data-page-title）。画面が変わると骨組みがそこへ焦点を移す。
     - メニューの数（受信箱の未返信など）は AD.data.metrics() から骨組みが出す。画面の側で数え直さない。
   ============================================================ */
(function (global) {
  'use strict';
  var CLG = global.CLG, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA, store = CLG.store;
  var AD = CLG.admin = CLG.admin || {};
  AD.screens = AD.screens || {};
  var AU = AD.ui, db = AD.db;
  var esc = U.esc, icon = U.icon, doc = global.document, SITE = DATA.SITE;

  /* ---------- メニュー ----------
     [画面名, 名前, 記号, 細い帯（タブレット）で出す短い名前, 数のキー] */
  var NAV = [
    { items: [['dashboard', 'ダッシュボード', 'grid', 'ホーム']] },
    { label: '会員', items: [['members', '会員', 'users'], ['onboarding', '新入生の30日', 'flag', '新入生', 'stalled'], ['inbox', 'メッセージ', 'message', null, 'inbox']] },
    { label: '掲載', items: [['courses', '講座', 'play'], ['gigs', '案件', 'briefcase', null, 'gigs'], ['events', 'イベント', 'calendar', null, 'proposals'],
      ['feed', 'タイムライン・お知らせ', 'feed', '投稿', 'reports'], ['perks', '福利厚生・専門家', 'ticket', '特典', 'experts']] },
    { label: 'お金とポイント', items: [['payments', '支払い', 'yen', null, 'failed'], ['referrals', '紹介報酬', 'gift', '紹介', 'rewards'], ['points', '貢献ポイント', 'star', 'pt']] },
    { label: '運営', items: [['reports', 'レポート', 'chart'], ['settings', '設定', 'settings']] }
  ];
  var DETAIL = { members: 'member' };   // #/members/<会員番号> は会員の詳細の画面
  var NAV_OF = { member: 'members' };
  var DEMO_Q = /[?&]demo=([\w-]+)/;
  var root = null, lastKey = null, booting = true, loading = null, loadedFor = null;
  var pendingFocus = null, refreshTimer = null, stale = false, lastSeen = null;

  /* ---------- URL ---------- */
  function dec(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }
  function parse() {
    var h = String(global.location.hash || '').replace(/^#\/?/, ''), q = {}, qi = h.indexOf('?');
    if (qi >= 0) {
      h.slice(qi + 1).split('&').forEach(function (kv) {
        var i = kv.indexOf('='), k = i < 0 ? kv : kv.slice(0, i);
        if (k) q[dec(k)] = i < 0 ? '' : dec(kv.slice(i + 1).replace(/\+/g, ' '));
      });
      h = h.slice(0, qi);
    }
    var parts = h.split('/').filter(Boolean).map(dec);
    return { name: parts[0] || 'dashboard', params: parts.slice(1), query: q, key: parts.join('/') || 'dashboard' };
  }
  function hashOf(key, q) {
    var qs = Object.keys(q || {}).filter(function (k) { return q[k] != null && q[k] !== ''; })
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(q[k]); }).join('&');
    return '#/' + String(key).split('/').map(encodeURIComponent).join('/') + (qs ? '?' + qs : '');
  }
  function go(hash) { if (global.location.hash === hash) render(true); else global.location.hash = hash; }
  function setQuery(patch, opt) {
    opt = opt || {};
    var r = parse(), q = Object.assign({}, r.query);
    Object.keys(patch || {}).forEach(function (k) { if (patch[k] == null || patch[k] === '') delete q[k]; else q[k] = String(patch[k]); });
    var hash = hashOf(r.key, q);
    if (opt.replace) {
      try { global.history.replaceState(global.history.state, '', hash); } catch (e) { global.location.hash = hash; return; }
      render(true, { focus: opt.focus, keepDrafts: true });
    } else if (global.location.hash === hash) render(true, { focus: opt.focus, keepDrafts: true });
    else { pendingFocus = opt.focus || null; global.location.hash = hash; }
  }
  function setTitle(t) { doc.title = (t ? t + '｜' : '') + SITE.name + ' 運営'; }
  function announce(msg) {
    var a = doc.getElementById('adAnnouncer'); if (!a) return;
    a.textContent = '';
    setTimeout(function () { a.textContent = String(msg || ''); }, 60);
  }

  /* ---------- 焦点（会員ページの骨組みと同じ考え方） ---------- */
  var FOCUSABLE = 'a[href],button,input,select,textarea,summary,[tabindex]';
  function qv(v) { return String(v).replace(/["\\]/g, '\\$&'); }
  function focusEl(el) {
    if (!el) return false;
    if (!el.matches(FOCUSABLE)) el.setAttribute('tabindex', '-1');
    try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (e2) {} }
    return doc.activeElement === el;
  }
  function focusMain() {
    var view = doc.getElementById('adView');
    focusEl((view && (view.querySelector('[data-page-title]') || view.querySelector('h1'))) || view);
  }
  function captureFocus() {
    var a = doc.activeElement, view = doc.getElementById('adView');
    if (!a || a === doc.body || !view || !view.contains(a) || a === view) return null;
    var tag = a.tagName.toLowerCase(), o = { after: a.getAttribute('data-focus-after'), sel: null, index: 0, singles: [] };
    if (a.id) o.sel = '[id="' + qv(a.id) + '"]';
    else {
      var all = '';
      for (var i = 0; i < a.attributes.length; i++) {
        var at = a.attributes[i];
        if (!/^data-/.test(at.name) || at.name === 'data-focus-after') continue;
        var one = '[' + at.name + '="' + qv(at.value) + '"]';
        all += one; o.singles.push(one);
      }
      if (all) o.sel = tag + all;
      if (!o.sel && a.name) o.sel = tag + '[name="' + qv(a.name) + '"]';
      if (!o.sel && a.getAttribute('href')) o.sel = 'a[href="' + qv(a.getAttribute('href')) + '"]';
    }
    if (o.sel) { try { o.index = Math.max(0, U.$$(o.sel, view).indexOf(a)); } catch (e) { o.sel = null; } }
    if (typeof a.selectionStart === 'number') { try { o.caret = [a.selectionStart, a.selectionEnd]; o.value = a.value; } catch (e) {} }
    return o.sel || o.after ? o : null;
  }
  /* 書きかけの文：骨組みが勝手に描き直すときに消さないように、id のある欄の文を覚えて戻す */
  function captureDrafts(view) {
    var out = [];
    U.$$('textarea[id], input[id]', view).forEach(function (el) {
      if (el.matches('[data-tb-q]') || /^(checkbox|radio|hidden|file|submit|button|reset)$/.test(el.type)) return;
      if (el.value && el.value !== el.defaultValue) out.push({ id: el.id, value: el.value });
    });
    return out;
  }
  function restoreDrafts(view, list) {
    (list || []).forEach(function (d) {
      var el = doc.getElementById(d.id);
      if (el && view.contains(el) && !el.value) el.value = d.value;
    });
  }
  function visible(el) { return !!(el && el.getClientRects && el.getClientRects().length && !el.closest('[hidden],[inert]')); }
  function restoreFocus(o, want) {
    var view = doc.getElementById('adView'), a = doc.activeElement;
    if (a && a !== doc.body && a !== view && a.isConnected && view && view.contains(a) && !want) return;
    function pick(sel) { try { return U.$$(sel, view).filter(visible); } catch (e) { return []; } }
    var el = null;
    if (want) el = pick(want)[0] || null;
    if (!el && o && o.after) el = pick(o.after)[0] || null;
    if (!el && o && o.sel) { var l = pick(o.sel); el = l[o.index] || l[0] || null; }
    if (!el && o && o.singles) {
      for (var i = o.singles.length - 1; i >= 0 && !el; i--) {
        var hits = pick(o.singles[i]).filter(function (x) { return x.matches(FOCUSABLE); });
        if (hits.length === 1) el = hits[0];
      }
    }
    if (!el || !focusEl(el)) return;
    if (o && o.caret && el.value === o.value && el.setSelectionRange) { try { el.setSelectionRange(o.caret[0], o.caret[1]); } catch (e) {} }
  }

  /* ---------- ログイン ---------- */
  function session() { var s = db.state.session; return s && db.staff(s.staffId) ? s : null; }
  function login(staffId) {
    db.update(function (s) {
      s.session = { staffId: staffId, at: new Date().toISOString() };
      var st = s.staff.filter(function (x) { return x.id === staffId; })[0]; if (st) st.lastLogin = CLG.now().toISOString();
    });
  }
  function logout() {
    db.update(function (s) { s.session = null; });
    try { global.localStorage.removeItem(BEAT_KEY); } catch (e) {}
    lastKey = null; root.innerHTML = '';
    render();
    U.toast('ログアウトしました');
  }
  function renderLogin() {
    var demo = db.staff(db.DEMO_STAFF) || { name: '佐藤 圭', role: '運営' };
    var person = demo.person ? DATA.PEOPLE[demo.person] : null;
    lastKey = null;
    root.innerHTML = '<div class="login ad-login">' +
      '<div class="login__box">' +
        // ロゴ（印の下に TAISEI）と合言葉を1回。会員ページのログインと同じ形
        '<div class="login__brand">' + U.brandmark(SITE, '', { stack: true }) +
          (SITE.tagline ? '<p class="login__tagline">' + esc(SITE.tagline) + '</p>' : '') + '</div>' +
        '<div class="login__card">' +
          '<h1 class="h2" data-page-title tabindex="-1">運営画面にログイン</h1>' +
          '<p class="form-err" role="alert" id="adLoginErr"></p>' +
          '<form id="adLoginForm" class="ad-login__form" novalidate>' +
            '<label class="field"><span>メールアドレス</span><input class="input" type="email" name="email" id="adLoginEmail" autocomplete="username" inputmode="email" required></label>' +
            '<div class="field"><label class="field__label" for="adLoginPw">パスワード</label>' +
              '<div class="pw"><input class="input" id="adLoginPw" type="password" name="pw" autocomplete="current-password" required>' +
              '<button type="button" class="pw__toggle" data-pw="adLoginPw" aria-pressed="false" aria-label="パスワードを表示">' + icon('eye') + '</button></div>' +
              '<small>試作版のパスワードは admin です</small></div>' +
            '<button class="btn btn-ink btn-block login__submit" type="submit">ログインする</button>' +
          '</form>' +
          '<div class="ad-login__or" role="separator"><span>または</span></div>' +
          '<div class="ad-login__demo">' +
            '<div class="ad-login__who">' + U.avatar({ name: demo.name, color: demo.color || (person && person.color) }, 's') +
              '<span class="ad-login__name"><b>' + esc(demo.name) + '</b><small>' + esc(person ? person.role : '') + '</small></span>' +
              '<span class="tag tag-ink ad-role">' + esc(demo.role) + '</span></div>' +
            '<button type="button" class="btn btn-primary btn-block" data-ad-demo>デモのスタッフで入る</button>' +
          '</div>' +
        '</div>' +
        '<p class="login__links"><a href="' + esc(AD.data.memberHref('#/home')) + '">会員ページ</a><a href="index.html">公開サイト</a></p>' +
      '</div></div>';
    setTitle('ログイン');
    var form = doc.getElementById('adLoginForm'), err = doc.getElementById('adLoginErr');
    U.fieldErrors(form, {}, { focus: false });
    form.addEventListener('input', function () { err.innerHTML = ''; });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var em = String(form.email.value || '').trim().toLowerCase(), pw = String(form.pw.value || '');
      var errs = { email: em ? '' : 'メールアドレスを入れてください', pw: pw ? '' : 'パスワードを入れてください' };
      if (U.fieldErrors(form, errs)) return;
      var st = db.state.staff.filter(function (x) { return x.email.toLowerCase() === em && x.active; })[0];
      if (!st || pw !== 'admin') {
        err.innerHTML = '';
        setTimeout(function () { err.innerHTML = icon('info', 'ico-s') + '<span>メールアドレスかパスワードが違います</span>'; }, 30);
        form.pw.value = ''; form.pw.focus();
        return;
      }
      enter(st.id);
    });
    root.querySelector('[data-ad-demo]').addEventListener('click', function () { enter(db.DEMO_STAFF); });
    if (!booting) { var h = root.querySelector('[data-page-title]'); focusEl(h); announce('運営画面にログイン'); }
  }
  function enter(staffId) {
    login(staffId);
    var r = parse();
    if (r.name === 'login' || !global.location.hash) { try { global.history.replaceState(null, '', '#/dashboard'); } catch (e) {} }
    lastKey = null; root.innerHTML = '';
    render();
    focusMain();
    if (U.toast.clear) U.toast.clear(true);   // 「ログアウトしました」が残ったまま重ならないように
    U.toast((db.staff() || {}).name + 'さんとしてログインしました', 'ok');
  }

  /* ---------- 骨組み ---------- */
  function navLink(it, where) {
    return '<a class="ad-nav__a" href="#/' + it[0] + '" data-nav="' + it[0] + '"' + (it[3] ? ' data-short="' + esc(it[3]) + '"' : '') + (where ? ' data-where="' + where + '"' : '') + '>' +
      icon(it[2]) + '<span class="ad-nav__txt">' + esc(it[1]) + '</span><span class="ad-nav__n" data-n="' + (it[4] || '') + '" aria-hidden="true" hidden></span>' +
      '<span class="sr-only ad-nav__sr"></span></a>';
  }
  function navHtml(where) {
    return NAV.map(function (g) {
      return '<div class="ad-nav__group">' + (g.label ? '<p class="ad-nav__label">' + esc(g.label) + '</p>' : '') +
        g.items.map(function (it) { return navLink(it, where); }).join('') + '</div>';
    }).join('');
  }
  function shell() {
    var st = db.staff() || {};
    var person = st.person ? DATA.PEOPLE[st.person] : null;
    return '<div class="ad" id="adApp">' +
      '<aside class="ad-side" id="adSide">' +
        '<div class="ad-side__top">' +
          // リンクに名前（aria-label）があるので、ロゴは読み上げない。タブレットの 72px の帯では「大」の印だけ（admin.css）
          '<a class="ad-brand" href="#/dashboard" aria-label="' + esc(SITE.name) + ' 運営 ダッシュボード">' +
            U.brandmark(SITE, '運営', { decorative: true }) + U.brandmark(SITE, '', { mark: true, decorative: true }) + '</a>' +
          '<div class="ad-proto">' +
            '<button type="button" class="ad-proto__pill" data-pop="adProto" aria-expanded="false" aria-controls="adProto">試作版</button>' +
            '<div class="pop ad-proto__menu" id="adProto" hidden>' +
              '<p class="pop__label">別のタブで開く</p>' +
              '<a class="pop__item" href="#" target="_blank" rel="noopener" data-ad-member="#/home">' + icon('external') + '<span data-ad-livename>デモ会員で開く</span></a>' +
              '<a class="pop__item" href="index.html" target="_blank" rel="noopener">' + icon('external') + '公開サイトを開く</a>' +
              '<hr class="pop__sep">' +
              '<button type="button" class="pop__item" data-ad-act="reset">' + icon('refresh') + '運営のデモデータを最初に戻す</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<nav class="ad-nav" id="adNav" aria-label="運営メニュー">' + navHtml('side') + '</nav>' +
        '<div class="ad-side__me">' +
          '<button type="button" class="ad-me" id="adMeBtn" data-pop="adMe" aria-expanded="false" aria-controls="adMe">' +
            U.avatar({ name: st.name, color: st.color || (person && person.color) }, 's') +
            '<span class="ad-me__txt"><b>' + esc(st.name || '') + '</b><small>' + esc(st.role || '') + '</small></span>' + icon('chevdown', 'ad-me__caret') +
          '</button>' +
          '<div class="pop ad-me__menu" id="adMe" hidden>' +
            '<p class="pop__label">' + esc(st.email || '') + '</p>' +
            '<a class="pop__item" href="#/settings?tab=staff">' + icon('user') + '運営の人と役割</a>' +
            '<a class="pop__item" href="#" target="_blank" rel="noopener" data-ad-member="#/home">' + icon('external') + '会員ページを開く</a>' +
            '<hr class="pop__sep">' +
            '<button type="button" class="pop__item" data-ad-act="logout">' + icon('logout') + 'ログアウト</button>' +
          '</div>' +
        '</div>' +
      '</aside>' +
      '<div class="ad-main">' +
        '<header class="ad-top" id="adTop">' +
          '<button type="button" class="iconbtn ad-top__menu" data-ad-act="menu" aria-label="メニュー">' + icon('menu') + '<span class="ad-top__dot" hidden></span></button>' +
          '<a class="ad-top__brand" href="#/dashboard">' + U.brandmark(SITE, '運営') + '</a>' +
          '<form class="ad-find" role="search" data-ad-find>' +
            '<label class="sr-only" for="adFind">会員を探す</label>' + icon('search', 'ico-s') +
            '<input class="input" type="search" id="adFind" name="q" placeholder="会員番号・名前・メールで探す" autocomplete="off" enterkeyhint="search">' +
            '<kbd class="ad-find__key" aria-hidden="true">/</kbd>' +
          '</form>' +
          '<div class="ad-top__acts">' +
            '<a class="btn btn-ghost btn-s ad-top__member" href="#" target="_blank" rel="noopener" data-ad-member="#/home">' + icon('external', 'ico-s') + '<span>会員ページ</span></a>' +
          '</div>' +
        '</header>' +
        '<main id="adView" class="ad-view" tabindex="-1"></main>' +
      '</div>' +
    '</div>';
  }
  function ensureShell() {
    if (doc.getElementById('adApp')) return false;
    root.innerHTML = shell();
    return true;
  }

  /* メニューの数・光っている項目・会員ページへのリンク */
  var BADGE = {
    inbox: function (m) { return { n: m.unanswered, alert: m.over24 > 0, sr: '未返信' + m.unanswered + '件' }; },
    stalled: function (m) { return { n: m.stalled, sr: '止まっている新入生' + m.stalled + '人' }; },
    gigs: function (m) { return { n: m.gigApps + m.peerGigs, sr: '確認待ち' + (m.gigApps + m.peerGigs) + '件' }; },
    proposals: function (m) { return { n: m.proposals, sr: '企画の確認待ち' + m.proposals + '件' }; },
    // 見回りのタブと同じ数：通報（受付）＋自動の印（未確認）＋自動で止めた投稿（feed.js が AD.cms.feedWatch で出す）
    reports: function (m) {
      var extra = 0;
      try { extra = AD.cms && AD.cms.feedWatch ? AD.cms.feedWatch() : 0; } catch (e) { extra = 0; }
      var n = m.reports + extra;
      return { n: n, sr: '見回り' + n + '件' + (m.reports ? '（うち通報' + m.reports + '件）' : '') };
    },
    experts: function (m) { return { n: m.experts, sr: '専門家の相談' + m.experts + '件' }; },
    failed: function (m) { return { n: m.failed, alert: m.failed > 0, sr: '支払いエラー' + m.failed + '件' }; },
    rewards: function (m) { return { n: m.rewardsReady, sr: '確定待ち' + m.rewardsReady + '件' }; }
  };
  function chrome() {
    if (!doc.getElementById('adApp')) return;
    var r = parse(), key = DETAIL[r.name] && r.params.length ? DETAIL[r.name] : r.name, scr = AD.screens[key];
    var cur = (scr && scr.nav) || NAV_OF[key] || r.name, m = null;
    try { m = AD.data.metrics(); } catch (e) { console.error(e); }
    var alertAny = false;
    U.$$('[data-nav]').forEach(function (a) {
      var on = a.getAttribute('data-nav') === cur;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      var nEl = a.querySelector('.ad-nav__n'), srEl = a.querySelector('.ad-nav__sr'), k = nEl && nEl.getAttribute('data-n');
      if (!nEl) return;
      var b = k && m && BADGE[k] ? BADGE[k](m) : null;
      // 数は見た目だけ。読み上げは「（未返信6件）」の文で（数字だけだと何の数か分からないため）
      if (b && b.n > 0) {
        nEl.hidden = false; nEl.textContent = b.n > 99 ? '99+' : String(b.n);
        nEl.classList.toggle('is-alert', !!b.alert);
        if (srEl) srEl.textContent = '（' + b.sr + '）';
        if (b.alert) alertAny = true;
      } else { nEl.hidden = true; nEl.textContent = ''; if (srEl) srEl.textContent = ''; }
    });
    var dot = doc.querySelector('.ad-top__dot'); if (dot) dot.hidden = !alertAny;
    var lv = AD.data.live();
    U.$$('[data-ad-member]').forEach(function (a) { a.setAttribute('href', AD.data.memberHref(a.getAttribute('data-ad-member') || '#/home')); });
    U.$$('[data-ad-livename]').forEach(function (s) { s.textContent = lv.name + 'として開く'; });
  }

  function makeCtx(r) {
    return {
      name: r.name, params: r.params, query: r.query, key: r.key,
      go: go, refresh: function (o) { render(true, o); }, setQuery: setQuery, announce: announce,
      R: R, U: U, DATA: DATA, AU: AU, db: db, data: AD.data, ops: AD.ops, staff: db.staff(), live: AD.data.live(), state: store.state
    };
  }
  function titleOf(scr, ctx) { return typeof scr.title === 'function' ? scr.title(ctx) : scr.title || ''; }
  function notFound() {
    return '<div class="ad-nf">' + AU.head({ title: 'ページが見つかりません', sub: 'アドレスが違うか、ページがなくなりました。' }) +
      '<div class="row"><a class="btn btn-ink" href="#/dashboard">ダッシュボードへ</a><a class="btn btn-ghost" href="#/members">会員</a><a class="btn btn-ghost" href="#/inbox">メッセージ</a></div></div>';
  }
  function errorPage() {
    return '<div class="ad-nf">' + AU.head({ title: 'この画面を表示できませんでした', sub: '時間をおいて、もう一度開いてください。' }) +
      '<div class="row"><button type="button" class="btn btn-ink" data-ad-act="reload">' + icon('refresh', 'ico-s') + '再読み込み</button><a class="btn btn-ghost" href="#/dashboard">ダッシュボードへ</a></div></div>';
  }

  function render(keepScroll, opt) {
    if (!root) return;
    clearTimeout(refreshTimer); refreshTimer = null; stale = false;
    var r = parse();
    if (!session()) { renderLogin(); return; }
    if (r.name === 'login') {
      try { global.history.replaceState(null, '', '#/dashboard'); } catch (e) { global.location.hash = '#/dashboard'; return; }
      r = parse();
    }
    var built = ensureShell();
    var view = doc.getElementById('adView');
    var changed = built || lastKey !== r.key;
    var focus = changed ? null : captureFocus();
    var drafts = !changed && opt && opt.keepDrafts ? captureDrafts(view) : null;
    var key = DETAIL[r.name] && r.params.length ? DETAIL[r.name] : r.name;
    var scr = AD.screens[key], ctx = makeCtx(r), html, title;

    if (changed && scr && typeof scr.load === 'function' && loadedFor !== r.key) {
      var p = null;
      try { p = scr.load(ctx); } catch (e) { console.error(e); }
      if (p && typeof p.then === 'function') {
        var token = loading = {};
        view.innerHTML = AU.skeleton(scr.skeleton || 'page');
        lastKey = r.key; setTitle(titleOf(scr, ctx)); chrome();
        if (!keepScroll) global.scrollTo(0, 0);
        p.then(function () { if (loading === token) { loading = null; loadedFor = r.key; lastKey = null; render(true); } },
          function (e) { console.error(e); if (loading === token) { loading = null; view.innerHTML = errorPage(); setTitle('表示できませんでした'); focusMain(); } });
        return;
      }
    }
    loading = null;
    if (!scr) { html = notFound(); title = 'ページが見つかりません'; }
    else {
      try { html = scr.render(ctx); title = titleOf(scr, ctx); }
      catch (e) { console.error(e); html = errorPage(); title = '表示できませんでした'; scr = null; }
    }
    view.innerHTML = html;
    if (changed) {
      view.classList.remove('view-enter'); void view.offsetWidth; view.classList.add('view-enter');
      var st = null; try { st = global.history.state; } catch (e) {}
      if (st && st.k === r.key && typeof st.y === 'number') global.scrollTo(0, st.y);
      else if (!keepScroll) global.scrollTo(0, 0);
    }
    lastKey = r.key;
    if (loadedFor !== r.key) loadedFor = null;
    if (drafts) restoreDrafts(view, drafts);
    if (scr && scr.mount) { try { scr.mount(view, ctx); } catch (e) { console.error(e); } }
    if (AU.hydrate) AU.hydrate(view);
    setTitle(title);
    chrome();
    rememberSeen();
    var want = (opt && opt.focus) || pendingFocus; pendingFocus = null;
    if (changed) {
      if (!booting) {
        var a = doc.activeElement;
        if (want) restoreFocus(null, want);
        else if (!(a && a !== view && view.contains(a))) focusMain();
        announce(doc.title);
      }
    } else restoreFocus(focus, want);
  }

  /* ---------- 会員ページのタブで変わったとき ----------
     入力中・窓が開いているときは描き直さず、メニューの数だけ直す（書いている返信が消えないように）。
     会員から新しいメッセージ・確認待ちが届いたら、一言で知らせる */
  function busy() {
    var a = doc.activeElement, view = doc.getElementById('adView');
    // 書きかけの欄に焦点があるときだけ待つ（空の返信欄なら描き直しても消えるものはない。焦点は id で戻る）
    var typing = a && view && view.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'checkbox' && a.type !== 'radio' &&
      !a.matches('[data-tb-q]') && (a.tagName === 'SELECT' || String(a.value || '') !== '');
    return typing || !!doc.querySelector('.modal-bg') || !!loading;
  }
  function refreshSoon() {
    if (!doc.getElementById('adView')) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function () {
      refreshTimer = null;
      if (busy()) { stale = true; chrome(); return; }
      render(true, { keepDrafts: true });
    }, 0);
  }
  function seenNow() {
    try {
      var m = AD.data.metrics(), t = R.thread(), lastMe = null;
      t.forEach(function (x) { if (x.from === 'me') lastMe = x; });
      return { msgAt: lastMe ? lastMe.at : null, msg: lastMe, peer: m.peerGigs, prop: m.proposals, rep: m.reports, gig: m.gigApps, exp: m.experts, no: store.state.me.id };
    } catch (e) { return null; }
  }
  function rememberSeen() { lastSeen = seenNow(); }
  function onOtherTab(e) {
    if (e && e.key !== store.KEY && e.key !== null) return;
    var before = lastSeen, now = seenNow();
    lastSeen = now;
    if (!before || !now || !session() || before.no !== now.no) { refreshSoon(); return; }
    var name = store.state.me.name;
    if (now.msgAt && (!before.msgAt || new Date(now.msgAt) > new Date(before.msgAt))) {
      U.toast(name + 'さんからメッセージ：' + String(now.msg.text || '').slice(0, 28), null, { action: '開く', onAction: function () { go('#/inbox/live'); } });
    } else if (now.peer > before.peer) U.toast(name + 'さんが会員どうしの案件を出しました（確認待ち）', null, { action: '開く', onAction: function () { go('#/gigs?tab=review'); } });
    else if (now.prop > before.prop) U.toast(name + 'さんからイベントの企画が届きました', null, { action: '開く', onAction: function () { go('#/events?tab=proposals'); } });
    else if (now.gig > before.gig) U.toast(name + 'さんが案件に応募しました', null, { action: '開く', onAction: function () { go('#/gigs?tab=apps'); } });
    else if (now.rep > before.rep) U.toast('タイムラインに通報が届きました', null, { action: '開く', onAction: function () { go('#/feed?tab=reports'); } });
    else if (now.exp > before.exp) U.toast(name + 'さんから専門家への相談が届きました', null, { action: '開く', onAction: function () { go('#/perks?tab=experts'); } });
    refreshSoon();
  }

  /* ---------- スマホのメニュー ---------- */
  function menuSheet() {
    var st = db.staff() || {};
    var m = U.modal('<form class="ad-find ad-find--sheet" role="search" data-ad-find>' +
        '<label class="sr-only" for="adFindSheet">会員を探す</label>' + icon('search', 'ico-s') +
        '<input class="input" type="search" id="adFindSheet" name="q" placeholder="会員番号・名前・メールで探す" autocomplete="off" enterkeyhint="search"></form>' +
      '<nav class="ad-sheetnav" aria-label="運営メニュー">' + navHtml('sheet') + '</nav>' +
      '<div class="ad-sheetnav__foot">' +
        '<a class="btn btn-ghost btn-block" href="#" target="_blank" rel="noopener" data-ad-member="#/home">' + icon('external', 'ico-s') + '会員ページを開く</a>' +
        '<p class="ad-sheetnav__me">' + esc(st.name || '') + '・' + esc(st.role || '') + '</p>' +
        '<button type="button" class="btn btn-soft btn-block" data-ad-act="logout">' + icon('logout', 'ico-s') + 'ログアウト</button>' +
      '</div>', { title: 'メニュー', cls: 'ad-sheet' });
    chrome();
    m.addEventListener('click', function (e) { if (e.target.closest('a[href^="#/"]')) m.close(); });
  }

  /* ---------- 押したとき（骨組みの分） ---------- */
  function onClick(e) {
    var t = e.target;
    // 「本文へ移動」：# のリンクのままだと画面の切り替え（#/…）を壊すので、焦点だけ移す
    if (t.closest('[data-ad-skip]')) { e.preventDefault(); focusMain(); return; }
    var pw = t.closest('[data-pw]');
    if (pw) {
      var inp = doc.getElementById(pw.getAttribute('data-pw')); if (!inp) return;
      var show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      pw.setAttribute('aria-pressed', String(show));
      pw.setAttribute('aria-label', show ? 'パスワードを隠す' : 'パスワードを表示');
      pw.innerHTML = icon(show ? 'eyeoff' : 'eye');
      return;
    }
    var b = t.closest('[data-ad-act]');
    if (!b) return;
    var act = b.getAttribute('data-ad-act');
    if (act === 'logout') { U.closePops(); U.$$('.modal-bg').forEach(function (x) { if (x.close) x.close(); }); logout(); }
    else if (act === 'menu') menuSheet();
    else if (act === 'reload') global.location.reload();
    else if (act === 'reset') {
      U.confirmBox('運営のデモデータを最初に戻しますか', '返信・返金・確定などの操作と記録、講座や案件の直した中身、タイムラインの非表示・固定と運営の投稿、面談の枠、ログインの停止が最初に戻ります。デモ会員の学びや投稿の記録は変わりません。', '最初に戻す', true)
        .then(function (ok) {
          if (!ok) return;
          db.reset();
          // 会員ページの保存に書いた運営の中身（CMS・面談の枠・ログインの停止・タイムラインの見回り）も戻す。開いている会員ページのタブもすぐ変わる
          if (AD.ops && AD.ops.resetLinks) AD.ops.resetLinks();
          render(true); U.toast('運営のデモデータを最初に戻しました', 'ok');
        });
    }
  }
  /* 会員を探す：会員番号（TS-000271・271。前の頭の TK- も）ならその人の詳細、それ以外は会員の一覧で探す */
  function onFind(e) {
    var f = e.target;
    if (!f.matches || !f.matches('[data-ad-find]')) return;
    e.preventDefault();
    var v = String(f.q.value || '').trim();
    // スマホのメニューの中から探したときは、メニューを閉じてから移る
    var sheet = f.closest('.modal-bg'); if (sheet && sheet.close) sheet.close();
    if (!v) { go('#/members'); return; }
    var m = /^(?:t[sk])?-?0*(\d{1,6})$/i.exec(v.replace(/\s+/g, ''));
    if (m) {
      var no = 'TS-' + ('000000' + m[1]).slice(-6);
      if (AD.data.member(no)) { f.q.value = ''; go('#/members/' + no); return; }
    }
    f.q.value = '';
    go(hashOf('members', { q: v }));
  }
  function onKey(e) {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
    var a = doc.activeElement;
    if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return;
    if (doc.querySelector('.modal-bg')) return;
    var inp = doc.getElementById('adFind');
    if (inp && inp.getClientRects().length) { e.preventDefault(); inp.focus(); }
  }

  /* 運営画面が開いていることを会員ページに知らせる印（試作版）。
     会員ページの「5秒後の運営の返事」の再現は、運営画面が開いているあいだは要らない（運営が本当に返すため）。
     会員ページの側でこの印を見る約束は domain.js の担当に頼んである */
  var BEAT_KEY = 'terakoya-admin-open';
  function beat() { try { if (session()) global.localStorage.setItem(BEAT_KEY, String(Date.now())); } catch (e) {} }

  /* 戻る・進むで元の場所に戻すため、スクロール位置を履歴に書いておく */
  var saveT = null;
  function saveScroll() {
    if (!doc.getElementById('adView') || loading) return;
    try { global.history.replaceState({ y: global.scrollY || global.pageYOffset || 0, k: lastKey }, ''); } catch (e) {}
  }

  AD.app = {
    go: go, refresh: function (o) { render(true, o); }, setQuery: setQuery, announce: announce, chrome: chrome,
    focusMain: focusMain, parse: parse, hashOf: hashOf, NAV: NAV
  };

  doc.addEventListener('DOMContentLoaded', function () {
    root = doc.getElementById('adRoot');
    if (!root) return;
    try { if ('scrollRestoration' in global.history) global.history.scrollRestoration = 'manual'; } catch (e) {}
    // ?demo=1：デモのスタッフ（佐藤 圭・運営）で入る（撮影の道具と「デモを見る」のリンクが使う）
    if (DEMO_Q.test(global.location.search || '')) {
      if (!session()) login(db.DEMO_STAFF);
      try { global.history.replaceState(null, '', global.location.pathname + (global.location.hash || '#/dashboard')); } catch (e) {}
    }
    doc.addEventListener('click', onClick);
    doc.addEventListener('submit', onFind);
    doc.addEventListener('keydown', onKey);
    doc.addEventListener('focusout', function () { setTimeout(function () { if (stale && !busy()) render(true, { keepDrafts: true }); }, 0); });
    global.addEventListener('hashchange', function () { render(false, { keepDrafts: true }); });
    global.addEventListener('storage', onOtherTab);
    global.addEventListener('scroll', function () { clearTimeout(saveT); saveT = setTimeout(saveScroll, 200); }, { passive: true });
    store.on(function () { refreshSoon(); });
    db.on(function () { refreshSoon(); });
    render();
    booting = false;
    beat(); setInterval(beat, 15000);
    // 閉じたら印を消す（ほかの運営画面のタブが開いていれば、15秒以内にまた書く）
    global.addEventListener('pagehide', function () { try { global.localStorage.removeItem(BEAT_KEY); } catch (e) {} });
  });
})(window);
