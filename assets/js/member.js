/* ============================================================
   会員ページの骨組み（ログイン・メニュー・画面の切り替え・焦点・共通の知らせ）
   ------------------------------------------------------------
   画面の中身は assets/js/screens/<画面名>.js が CLG.screens に登録する。
     CLG.screens.home = {
       title: 'ホーム',                        // または function (ctx) { return '…'; }
       render: function (ctx) { return '<div class="scr-home">…</div>'; },   // HTMLの文字列。DOMに触らない
       mount:  function (root, ctx) { … },     // 押したときの動き（任意。root は毎回同じ #view）
       back:   function (ctx) { return { href: '#/courses', label: '講座' }; },  // スマホの上の帯の「戻る」（任意）
       layout: 'full',                          // スマホで下のタブを隠す（任意。関数でもよい）
       load:   function (ctx) { return Promise; }   // 描く前に待つもの（任意。待つあいだは読み込み中の形）
     };
   URL は #/<画面名>/<引数>/<引数>?<キー>=<値>。例：#/courses/ai → params ['ai']。
   くわしい約束（焦点・戻る・契約の状態・リンクの形）は docs/画面づくりの約束.md の §5。
   ============================================================ */
(function (global) {
  'use strict';
  var CLG = global.CLG, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA, store = CLG.store;
  var esc = U.esc, icon = U.icon, doc = global.document;
  var SITE = DATA.SITE;
  CLG.screens = CLG.screens || {};

  /* ---------- メニューの並び ----------
     [画面名, 名前, 記号, 72px の帯で出す短い名前] */
  var NAV = [
    { items: [['home', 'ホーム', 'home'], ['start', 'スタートガイド', 'flag', 'ガイド']] },
    { label: '学び', items: [['courses', '講座', 'play']] },
    { label: 'コミュニティ', items: [['feed', 'タイムライン', 'feed', '投稿'], ['events', 'イベント', 'calendar'], ['ranking', 'ランキング', 'trophy']] },
    // 決定事項：主メニューの名前は「紹介」（報酬は紹介の画面の中に置く）
    { label: '案件と紹介', items: [['gigs', '案件', 'briefcase'], ['referral', '紹介', 'gift']] },
    { label: '会員特典', items: [['perks', '福利厚生・専門家', 'ticket', '特典'], ['card', '会員証', 'card']] },
    { items: [['messages', '相談・メッセージ', 'message', '相談']] }
  ];
  var TABS = [['home', 'ホーム', 'home'], ['courses', '講座', 'play'], ['feed', 'タイムライン', 'feed'], ['gigs', '案件', 'briefcase'], ['menu', 'メニュー', 'grid']];
  /* スマホのメニューに並べるもの（下のタブにないもの）。<wbr> は 320px で折る位置 */
  var GRID = [
    ['start', 'スタート<wbr>ガイド', 'flag'], ['events', 'イベント', 'calendar'], ['ranking', 'ランキング', 'trophy'],
    ['referral', '紹介', 'gift'], ['messages', '相談・<wbr>メッセージ', 'message'], ['perks', '福利厚生・<wbr>専門家', 'ticket'],
    ['card', '会員証', 'card'], ['account', 'アカウント', 'user'], ['help', 'ヘルプ', 'help']
  ];
  /* ナビでどの項目を光らせるか（画面名 → ナビの項目） */
  var NAV_OF = { lesson: 'courses', archive: 'courses', members: 'feed' };
  /* 戻る先の名前（スマホの上の帯。「◯◯に戻る」と読み上げる） */
  var LABEL = { courses: '講座', gigs: '案件', feed: 'タイムライン', events: 'イベント', members: '会員名簿', account: 'アカウント',
    perks: '福利厚生・専門家', referral: '紹介', messages: '相談', notices: 'お知らせ', help: 'ヘルプ', ranking: 'ランキング',
    start: 'スタートガイド', card: '会員証', search: '探す', home: 'ホーム' };
  /* ログインしていなくても開ける画面（パスワードの再設定など） */
  var AUTH = { forgot: 1, reset: 1, 'set-password': 1 };
  var LEGAL = [['index.html#/terms', '規約'], ['index.html#/privacy', 'プライバシー'], ['index.html#/tokushoho', '特商法'], ['index.html#/contact', 'お問い合わせ']];
  /* ログインまわりのお問い合わせは、種類を「ログインできない」にして開く（公開サイトが ?kind= で選んだ状態にする） */
  var CONTACT_LOGIN = 'index.html#/contact?kind=' + encodeURIComponent('ログインできない');
  var ADMIN_KEY = 'terakoya-admin-v1';
  /* 試作版の「見る人」と「契約の状態」 */
  var DEMO_DAY = (DATA.MEMBER.joinedDaysAgo || 23) + 1;
  function plain(name) { return String(name || '').replace(/\s+/g, ''); }
  var PERSONAS = {
    demo: { chip: '在籍' + DEMO_DAY + '日', label: '在籍' + DEMO_DAY + '日（' + plain(DATA.MEMBER.name) + '）', to: '#/home',
      ttl: '在籍' + DEMO_DAY + '日の会員で見る', msg: DATA.MEMBER.name + 'さん（入会' + DEMO_DAY + '日目）の画面に切り替えます。' },
    veteran: { chip: '在籍半年', label: '在籍半年（' + plain(DATA.VETERAN && DATA.VETERAN.name) + '）', to: '#/home',
      ttl: '在籍半年の会員で見る', msg: (DATA.VETERAN ? DATA.VETERAN.name : '') + 'さん（入会から半年）の画面に切り替えます。' },
    fresh: { chip: '入会したて', label: '入会したて（山田はな）', to: '#/start',
      ttl: '入会したての会員で見る', msg: '山田 はなさんが今日入会した、という状態で開きます。' }
  };
  /* 試作版の「入会したて」：入会フォームから来た人と同じ形（紹介コードはメールの@の前から作られる） */
  var FRESH_FORM = { name: '山田 はな', email: 'hana.yamada.0312@example.jp', area: '', job: '' };
  var PLAN_DEMO = [['active', '有効'], ['canceling', '解約予定'], ['ended', '終了'], ['past_due', '支払いエラー'], ['past_due_x', '猶予切れ'], ['paused', '休会']];

  var root = null, lastRoute = null, booting = true, loading = null, loadedFor = null;
  var A2HS_KEY = 'terakoya-a2hs-hint';

  /* ---------- URL ---------- */
  function dec(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }
  function parse() {
    var h = String(global.location.hash || '').replace(/^#\/?/, ''), q = {}, qi = h.indexOf('?');
    if (qi >= 0) {
      h.slice(qi + 1).split('&').forEach(function (kv) {
        var i = kv.indexOf('='), k = i < 0 ? kv : kv.slice(0, i);
        if (k) q[dec(k)] = i < 0 ? '' : dec(kv.slice(i + 1));
      });
      h = h.slice(0, qi);
    }
    var parts = h.split('/').filter(Boolean).map(dec);
    return { name: parts[0] || 'home', params: parts.slice(1), query: q, key: parts.join('/') || 'home' };
  }
  function go(hash) { if (global.location.hash === hash) render(true); else global.location.hash = hash; }
  function curNav(name) { return NAV_OF[name] || name; }
  function setTitle(t) { doc.title = (t ? t + '｜' : '') + SITE.name + ' 会員ページ'; }
  /** 通知の中のリンクは、会員ページと公開サイトの中だけにする（運営が書いた文字でも javascript: などを通さない） */
  function safeHref(h) { h = String(h || ''); return /^(#\/|index\.html|member\.html)/.test(h) ? h : ''; }

  /* ---------- 読み上げ ---------- */
  function announce(msg) {
    var a = doc.getElementById('announcer');
    if (!a) return;
    a.textContent = '';
    // 同じ文でも読み上げ直すように、いったん空にしてから入れる
    setTimeout(function () { a.textContent = String(msg || ''); }, 60);
  }

  /* ---------- 焦点 ----------
     画面が変わったら見出しへ。描き直し（refresh）では、押したものか、その代わりに出たものへ戻す。 */
  function focusEl(el, scroll) {
    if (!el) return false;
    if (!el.matches('a[href],button,input,select,textarea,[tabindex]')) el.setAttribute('tabindex', '-1');
    try { el.focus({ preventScroll: !scroll }); } catch (e) { try { el.focus(); } catch (e2) {} }
    return doc.activeElement === el;
  }
  function headingOf(scope) {
    scope = scope || doc;
    return scope.querySelector('[data-page-title]') || scope.querySelector('.page-ttl') || scope.querySelector('h1');
  }
  function focusMain(scroll) {
    var view = doc.getElementById('view');
    var h = headingOf(view || doc) || view || doc.querySelector('main');
    focusEl(h, scroll);
    if (scroll && h && h.scrollIntoView) { try { h.scrollIntoView({ block: 'start' }); } catch (e) {} }
  }
  function qv(v) { return String(v).replace(/["\\]/g, '\\$&'); }
  var FOCUSABLE_SEL = 'a[href],button,input,select,textarea,summary,[tabindex]';
  /** いま焦点がある要素を、描き直したあとに探すための手がかり。
      data-* は全部を組にして探す（data-ev="reserve" data-id="e1" のように、1つ目だけでは決まらない画面があるため）。
      見つからなければ data-* を1つずつ試し、ただ1つに決まるものへ（予約する → 取り消す で、同じ data-id を持つ新しいボタンへ） */
  function captureFocus() {
    var a = doc.activeElement, view = doc.getElementById('view');
    if (!a || a === doc.body || !view || !view.contains(a) || a === view) return null;
    var tag = a.tagName.toLowerCase();
    var o = { after: a.getAttribute('data-focus-after'), sel: null, index: 0, singles: [] };
    if (a.id) o.sel = '[id="' + qv(a.id) + '"]';
    else {
      var all = '';
      for (var i = 0; i < a.attributes.length; i++) {
        var at = a.attributes[i];
        if (!/^data-/.test(at.name) || at.name === 'data-focus-after') continue;
        var one = '[' + at.name + '="' + qv(at.value) + '"]';
        all += one;
        o.singles.push(one);
      }
      if (all) o.sel = tag + all;
      if (!o.sel && a.name) o.sel = tag + '[name="' + qv(a.name) + '"]' + (a.type === 'radio' || a.type === 'checkbox' ? '[value="' + qv(a.value) + '"]' : '');
      if (!o.sel && a.getAttribute('href')) o.sel = 'a[href="' + qv(a.getAttribute('href')) + '"]';
      // 最後の手がかり：1つ目の data-* と、その中の何番目か（前の版と同じ探し方）
      if (o.singles.length) o.first = tag + o.singles[0];
    }
    if (o.sel) { try { o.index = Math.max(0, U.$$(o.sel, view).indexOf(a)); } catch (e) { o.sel = null; } }
    if (o.first) { try { o.firstIndex = Math.max(0, U.$$(o.first, view).indexOf(a)); } catch (e) { o.first = null; } }
    if (typeof a.selectionStart === 'number') { try { o.caret = [a.selectionStart, a.selectionEnd]; o.value = a.value; } catch (e) {} }
    return o.sel || o.after ? o : null;
  }
  function visible(el) { return !!(el && el.getClientRects && el.getClientRects().length && !el.closest('[hidden],[inert]')); }
  function restoreFocus(o, want) {
    var view = doc.getElementById('view'), a = doc.activeElement;
    // 画面の mount が自分で焦点を置いたときは、それに任せる
    if (a && a !== doc.body && a !== view && a.isConnected && view && view.contains(a)) return;
    var el = null;
    function pick(sel, scope) { try { return U.$$(sel, scope).filter(visible); } catch (e) { return []; } }
    if (want) el = pick(want, view)[0] || pick(want, doc)[0] || null;
    if (!el && o && o.after) el = pick(o.after, view)[0] || pick(o.after, doc)[0] || null;
    if (!el && o && o.sel) { var l = pick(o.sel, view); el = l[o.index] || l[0] || null; }
    // 押したものが消えたとき：data-* のどれか1つで、ただ1つだけ見つかる押せるもの（入れ替わったボタン）
    if (!el && o && o.singles) {
      for (var i = o.singles.length - 1; i >= 0 && !el; i--) {
        var hits = pick(o.singles[i], view).filter(function (x) { return x.matches(FOCUSABLE_SEL); });
        if (hits.length === 1) el = hits[0];
      }
    }
    if (!el && o && o.first) { var f = pick(o.first, view); el = f[o.firstIndex] || f[0] || null; }
    if (!el || !focusEl(el)) return;
    if (o && o.caret && el.value === o.value && el.setSelectionRange) { try { el.setSelectionRange(o.caret[0], o.caret[1]); } catch (e) {} }
  }

  /* ---------- 骨組み ---------- */
  function navLink(it) {
    return '<a class="side__link" href="#/' + it[0] + '" data-nav="' + it[0] + '"' + (it[3] ? ' data-short="' + esc(it[3]) + '"' : '') + '>' +
      icon(it[2]) + '<span>' + esc(it[1]) + '</span></a>';
  }
  function shell() {
    var gi = 0;
    return '<div class="app" id="app">' +
      '<div class="side">' +
        // 屋号のリンクはロゴの幅だけにする（右に置く試作版の札と重ねない）。タブレットの記号の帯では「大」の印だけを出す（app.css）
        '<a class="side__brand" href="#/home">' + U.brandmark(SITE, '会員ページ') + U.brandmark(SITE, '', { mark: true }) + '</a>' +
        '<div class="side__me" id="sideMe">' +
          '<div class="me-card">' +
            '<button type="button" class="me-card__who" id="meBtn" data-pop="meMenu" aria-expanded="false" aria-controls="meMenu"></button>' +
            '<button type="button" class="iconbtn" id="sideBell" data-act="notices" aria-haspopup="dialog" aria-label="お知らせ">' + icon('bell') + '</button>' +
            '<div class="pop me-pop" id="meMenu" hidden>' +
              '<a class="pop__item" href="#/account">' + icon('user') + 'アカウント</a>' +
              '<a class="pop__item" href="index.html">' + icon('external') + 'サービス紹介</a>' +
              '<hr class="pop__sep">' +
              '<p class="pop__legal">' + LEGAL.map(function (l) { return '<a href="' + l[0] + '">' + l[1] + '</a>'; }).join('') + '<a href="#/help">ヘルプ</a></p>' +
              '<hr class="pop__sep">' +
              '<button type="button" class="pop__item" data-act="logout">' + icon('logout') + 'ログアウト</button>' +
            '</div>' +
          '</div>' +
          '<button type="button" class="lvbox" id="lvBox" data-act="level" aria-haspopup="dialog"></button>' +
        '</div>' +
        '<nav class="side__nav" id="sideNav" aria-label="メインメニュー">' +
          '<a class="side__search" href="#/search" data-nav="search">' + icon('search') + '<span>探す</span></a>' +
          NAV.map(function (g) {
            var id = 'navg' + (++gi);
            return '<div class="side__group"' + (g.label ? ' role="group" aria-labelledby="' + id + '"' : '') + '>' +
              (g.label ? '<p class="side__label" id="' + id + '">' + esc(g.label) + '</p>' : '') +
              g.items.map(navLink).join('') + '</div>';
          }).join('') +
        '</nav>' +
      '</div>' +
      '<div class="main">' +
        '<header class="topbar">' +
          '<a class="topbar__brand" href="#/home">' + U.brandmark(SITE) + '</a>' +
          '<div class="topbar__actions">' +
            '<a class="iconbtn" href="#/search" aria-label="探す">' + icon('search') + '</a>' +
            '<button type="button" class="iconbtn" id="topBell" data-act="notices" aria-haspopup="dialog" aria-label="お知らせ">' + icon('bell') + '</button>' +
          '</div>' +
        '</header>' +
        '<div class="netbar" id="netbar" role="status" hidden></div>' +
        '<div id="shellBanner"></div>' +
        '<main class="main__inner" id="view" tabindex="-1"></main>' +
      '</div>' +
      '<nav class="tabbar" id="tabbar" aria-label="メニュー">' +
        TABS.map(function (t) {
          if (t[0] === 'menu') return '<button type="button" data-act="menu" data-tab="menu" aria-haspopup="dialog">' + icon(t[2]) + '<span>' + t[1] + '</span></button>';
          return '<a href="#/' + t[0] + '" data-tab="' + t[0] + '">' + icon(t[2]) + '<span>' + t[1] + '</span></a>';
        }).join('') +
      '</nav>' +
    '</div>' +
    protobar();
  }

  /** 「試作版 v0.3」。版は data.js の SITE.version（この画面の見かた・README と同じ） */
  function protoName() { return '試作版' + (SITE.version ? ' v' + SITE.version : ''); }
  /** 試作版の札。押すと小さなメニュー（版・見る人・契約の状態・最初に戻す） */
  function protobar() {
    return '<div class="protobar" id="protobar">' +
      '<button type="button" class="protobar__pill" data-pop="protoMenu" aria-expanded="false" aria-controls="protoMenu">試作版</button>' +
      '<div class="pop protobar__menu" id="protoMenu" role="group" aria-label="試作版の切り替え" hidden>' +
        '<p class="pop__label">' + esc(protoName()) + '</p>' +
        '<button type="button" class="pop__item" data-act="guide">この画面の見かた</button>' +
        '<hr class="pop__sep">' +
        '<p class="pop__label" id="pmWho">見る人</p>' +
        '<div role="radiogroup" aria-labelledby="pmWho">' +
          ['demo', 'veteran', 'fresh'].map(function (k) {
            return '<button type="button" class="pop__item" role="radio" aria-checked="false" data-act="persona" data-persona="' + k + '">' + esc(PERSONAS[k].label) + '</button>';
          }).join('') +
        '</div>' +
        '<p class="pop__label" id="pmPlan">契約の状態</p>' +
        '<div class="pop__seg" role="group" aria-labelledby="pmPlan">' +
          PLAN_DEMO.map(function (p) { return '<button type="button" aria-pressed="false" data-act="plan" data-plan="' + p[0] + '">' + p[1] + '</button>'; }).join('') +
        '</div>' +
        '<hr class="pop__sep">' +
        '<button type="button" class="pop__item" data-act="reset">デモを最初の状態に戻す</button>' +
      '</div>' +
    '</div>';
  }

  function ensureShell() {
    if (doc.getElementById('view')) return false;
    doc.body.className = 'app-body';
    root.innerHTML = shell();
    chromeSig = {};
    netState(global.navigator && global.navigator.onLine === false ? false : null);
    return true;
  }

  /** 数の丸。読み上げ用の文も中に入れる（「相談・メッセージ 2」だけだと何の数か分からないため） */
  function setCount(host, n, cls, sr) {
    if (!host) return;
    var c = host.querySelector('.count');
    if (!n) { if (c) c.parentNode.removeChild(c); return; }
    if (!c) { c = doc.createElement('span'); host.appendChild(c); }
    c.className = 'count' + (cls ? ' ' + cls : '');
    c.innerHTML = '<span aria-hidden="true">' + esc(n) + '</span><span class="sr-only">（' + esc(sr) + '）</span>';
  }
  function setDot(host, on, sr) {
    if (!host) return;
    var d = host.querySelector('.dot'), s = host.querySelector('.dot-sr');
    if (on && !d) {
      host.insertAdjacentHTML('beforeend', '<span class="dot" aria-hidden="true"></span>' + (sr ? '<span class="sr-only dot-sr">' + esc(sr) + '</span>' : ''));
    } else if (!on) { if (d) d.parentNode.removeChild(d); if (s) s.parentNode.removeChild(s); }
  }
  function levelLabel(lv) { return 'レベルのしくみ（Lv' + lv.lv + '・' + (lv.next ? 'あと' + lv.toNext + 'XP' : '最高レベル') + '）'; }
  function currentPlanKey() {
    var p = R.plan ? R.plan() : { status: 'active' };
    return p.status === 'past_due' && p.limited ? 'past_due_x' : p.status;
  }

  /** 左の帯・上の帯・下のタブを、いまの状態に合わせる。
      作り直さずに、光らせる項目・数・名前だけを書き換える（押した項目の焦点が消えないように） */
  var chromeSig = {};
  function chrome() {
    if (!root || !doc.getElementById('view')) return;
    try {
      var r = parse(), cur = curNav(r.name), s = store.state;
      var m = R.me(), lv = R.level(), unreadMsg = R.unread(), unreadN = R.unreadNotices(), ob = R.onboarding();
      var prof = R.profile ? R.profile() : {};

      var sideNav = doc.getElementById('sideNav'), tabbar = doc.getElementById('tabbar');
      U.$$('[data-nav]', sideNav).forEach(function (a) {
        var on = a.getAttribute('data-nav') === cur;
        a.classList.toggle('is-active', on);
        if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      });
      setCount(doc.querySelector('[data-nav="messages"]'), unreadMsg, '', '未読' + unreadMsg + '件');
      setCount(doc.querySelector('[data-nav="start"]'), ob.finished ? 0 : ob.total - ob.done, 'count-soft', '残り' + (ob.total - ob.done) + '項目');

      var onTab = TABS.some(function (t) { return t[0] === cur; });
      U.$$('[data-tab]', tabbar).forEach(function (a) {
        var t = a.getAttribute('data-tab'), on = t === cur || (t === 'menu' && !onTab);
        a.classList.toggle('is-active', on);
        if (t !== 'menu') { if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }
      });
      setDot(doc.querySelector('[data-tab="menu"]'), !!unreadMsg, '未読メッセージあり');

      var bell = unreadN ? 'お知らせ（未読' + unreadN + '件）' : 'お知らせ';
      ['sideBell', 'topBell'].forEach(function (id) {
        var b = doc.getElementById(id);
        if (!b) return;
        b.setAttribute('aria-label', bell);
        setDot(b, !!unreadN);
      });

      // 自分とレベル（変わったときだけ書き換える）
      var sig = [m.name, m.id, m.color, prof.photo || '', lv.lv, lv.toNext, Math.round(lv.pct)].join('|');
      if (chromeSig.me !== sig) {
        chromeSig.me = sig;
        var who = doc.getElementById('meBtn');
        if (who) {
          who.setAttribute('aria-label', 'アカウントのメニュー（' + m.name + '）');
          who.innerHTML = U.avatar({ name: m.name, color: m.color, photo: prof.photo }) +
            '<span class="me-card__txt"><b>' + esc(m.name) + '</b><small>' + esc(m.id) + '</small></span>' + icon('chevdown', 'me-card__caret');
        }
        var box = doc.getElementById('lvBox');
        if (box) {
          box.setAttribute('aria-label', levelLabel(lv));
          box.innerHTML = '<span class="row-between">' + U.lvBadge(lv.lv, lv.name) +
            '<small class="muted">' + (lv.next ? 'あと <b class="num">' + U.num(lv.toNext) + '</b> XP' : '最高レベル') + '</small></span>' +
            U.progressBar(lv.pct, 'gold', { decorative: true });
        }
      }

      // 試作版のメニュー（いまの人・いまの契約の状態に印）
      var pk = currentPlanKey();
      U.$$('[data-act="persona"]').forEach(function (b) {
        var k = b.getAttribute('data-persona'), on = k === s.kind;
        if (b.getAttribute('role') === 'radio') b.setAttribute('aria-checked', String(on)); else b.setAttribute('aria-pressed', String(on));
        if (k === 'fresh' && b.classList.contains('pop__item')) b.textContent = '入会したて（' + (s.kind === 'fresh' ? plain(m.name) : '山田はな') + '）';
      });
      U.$$('#protoMenu [data-act="plan"]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-plan') === pk)); });

      banner(r.name);
    } catch (e) { console.error(e); }
  }

  /** 支払い・休会・終了の帯。止めている画面（gate）では、その画面が同じことを言うので出さない */
  var gateShown = false;
  function banner(name) {
    var host = doc.getElementById('shellBanner');
    if (!host) return;
    var b = !gateShown && R.planBanner ? R.planBanner() : null;
    var kind = b ? ({ warn: 'warn', end: 'accent', info: 'info' }[b.kind] || 'info') : '';
    // アカウントの画面では、帯のボタンと同じもの（カードの更新・再入会する）が画面の中にあるので、帯には出さない
    var act = b && b.href && !(name === 'account' && (/^#\/account/.test(b.href) || b.kind === 'end'));
    var sig = b ? kind + '|' + b.text + '|' + (act ? b.href : '') : '';
    if (host.getAttribute('data-sig') === sig) return;
    host.setAttribute('data-sig', sig);
    host.innerHTML = b ? '<div class="shell-banner shell-banner--' + kind + '" role="status">' + icon(kind === 'info' ? 'info' : 'alert') +
      '<p class="shell-banner__txt">' + U.jp(b.text) + '</p>' +
      (act ? '<a class="shell-banner__act" href="' + esc(safeHref(b.href)) + '">' + esc(b.action) + '</a>' : '') + '</div>' : '';
  }

  /** スマホの上の帯：引数のある画面（または画面の back()）では、屋号の代わりに「戻る」と短い題 */
  function backOf(scr, ctx) {
    if (scr && typeof scr.back === 'function') {
      try {
        var b = scr.back(ctx);
        if (b && b.href) return { href: safeHref(b.href) || '#/home', label: b.label || '前の画面' };
        if (b === null || b === false) return null;
      } catch (e) { console.error(e); }
    }
    if (!ctx.params.length) return null;
    if (ctx.name === 'lesson') return { href: '#/courses/' + encodeURIComponent(ctx.params[0]), label: '講座の目次' };
    return { href: '#/' + ctx.name, label: LABEL[ctx.name] || '一覧' };
  }
  function setTopbar(back, title) {
    var bar = doc.querySelector('.topbar'), app = doc.getElementById('app');
    if (app) app.classList.toggle('has-back', !!back);
    if (!bar) return;
    var sig = back ? back.href + '|' + back.label + '|' + title : '-';
    if (bar.getAttribute('data-sig') === sig) return;
    bar.setAttribute('data-sig', sig);
    U.$$('.topbar__brand,.topbar__back,.topbar__title', bar).forEach(function (el) { el.parentNode.removeChild(el); });
    bar.insertAdjacentHTML('afterbegin', back
      ? '<a class="topbar__back" href="' + esc(back.href) + '" aria-label="' + esc(back.label + 'に戻る') + '">' + icon('back') + '</a>' +
        '<p class="topbar__title">' + esc(title || '') + '</p>'
      : '<a class="topbar__brand" href="#/home">' + U.brandmark(SITE) + '</a>');
  }

  /* ---------- 画面を描く ---------- */
  function titleOf(scr, ctx) {
    try { return typeof scr.title === 'function' ? scr.title(ctx) : scr.title; } catch (e) { console.error(e); return ''; }
  }
  function makeCtx(r) {
    return {
      name: r.name, params: r.params, query: r.query, key: r.key,
      go: go, refresh: function (o) { render(true, o); }, announce: announce,
      R: R, U: U, DATA: DATA, state: store.state
    };
  }
  function errorPage() {
    return '<div class="page-head"><h1 class="page-ttl" data-page-title tabindex="-1">表示できませんでした</h1>' +
      '<p class="page-lead">読み込み直すと直ることがあります。直らないときは<a href="#/messages">相談・メッセージ</a>で知らせてください。</p></div>' +
      '<div class="row"><button type="button" class="btn btn-ink" data-shell-reload>' + icon('refresh', 'ico-s') + '再読み込み</button>' +
      '<a class="btn btn-soft" href="#/home">ホームへ</a></div>';
  }

  /** 契約の状態で止めている画面の代わりに出すもの（終了・支払いエラーの猶予切れ・休会） */
  function gatePage(g) {
    var p = g.plan || {}, b = p.banner || {};
    function head(t, lead) {
      return '<div class="page-head"><h1 class="page-ttl" data-page-title tabindex="-1">' + esc(t) + '</h1>' +
        (lead ? '<p class="page-lead">' + esc(lead) + '</p>' : '') + '</div>';
    }
    function kv(rows) {
      return '<table class="kv"><tbody>' + rows.map(function (x) { return '<tr><th scope="row">' + esc(x[0]) + '</th><td>' + esc(x[1]) + '</td></tr>'; }).join('') + '</tbody></table>';
    }
    /* 期間は曜日を付けずに短く（320px の表で3行に割れないように）。同じ年なら後ろの年は省く */
    function range(a, z) {
      var s1 = U.fmtDate(a, { wd: false }), sameYear = new Date(a).getFullYear() === new Date(z).getFullYear();
      return s1 + '〜' + U.fmtDate(z, { wd: false, noYear: sameYear });
    }
    if (g.reason === 'ended') {
      var t = b.text || '会員期間が終わりました';
      return { title: t, html: '<div class="gate">' + head(t, '講座・タイムライン・イベント・案件は見られません。再入会すると、続きから使えます。') +
        '<div class="card card-pad">' +
          kv([['会員期間', range(R.me().joinedAt, p.lastDay)], ['記録を残す期限', U.fmtDate(p.keepUntil, { wd: false }) + 'まで']]) +
          '<div class="row gate__acts">' +
            '<a class="btn btn-primary" href="' + esc(safeHref(p.rejoin && p.rejoin.href) || 'index.html#/join') + '">再入会する</a>' +
            '<a class="btn btn-ghost" href="#/account?focus=invoices">' + icon('receipt', 'ico-s') + '領収書を見る</a>' +
          '</div>' +
        '</div>' +
        '<p class="sub gate__help">わからないことは <a href="#/help">ヘルプ</a> か <a href="index.html#/contact">お問い合わせ</a> へ。</p>' +
      '</div>' };
    }
    if (p.status === 'paused') {
      return { title: '休会中です', html: '<div class="gate">' + head('休会中です', U.fmtDate(p.pausedUntil, { noYear: true }) + 'から、また使えます。') +
        '<div class="card card-pad">' + kv([['使えるもの', 'ホーム・スタートガイド・相談・会員証・アカウント']]) +
          '<div class="row gate__acts"><a class="btn btn-ink" href="#/account?focus=plan">アカウントを見る</a></div></div></div>' };
    }
    return { title: 'お支払いが確認できていません', html: '<div class="gate">' + head('お支払いが確認できていません', 'カードを更新すると、すぐに使えます。') +
      '<div class="card card-pad">' + kv([['止めているもの', '講座・タイムライン・イベント・案件など'], ['お支払いの期限', U.fmtDate(p.graceUntil, { wd: false }) + '（過ぎています）']]) +
        '<div class="row gate__acts"><a class="btn btn-primary" href="#/account?focus=card">カードを更新する</a>' +
        '<a class="btn btn-ghost" href="#/messages">運営に相談する</a></div></div></div>' };
  }

  function render(keepScroll, opt) {
    if (!root) return;
    var r = parse();
    if (AUTH[r.name]) { renderAuth(r); return; }
    if (!store.state.session) { renderLogin(); return; }
    // 運営画面で「ログインを止める」にされた会員は、会員ページの代わりにその知らせだけを出す
    var sus = loginStop();
    suspendedShown = !!sus;
    if (sus) { renderSuspended(); return; }
    if (r.name === 'login') {
      try { global.history.replaceState(null, '', '#/home'); } catch (e) { global.location.hash = '#/home'; return; }
      r = parse();
    }
    var built = ensureShell();
    var view = doc.getElementById('view');
    var changed = built || lastRoute !== r.key;
    var focus = changed ? null : captureFocus();
    var scr = CLG.screens[r.name], ctx = makeCtx(r), html, title, out;

    // 描く前に待つものがある画面（本番のデータ読み込み）：待つあいだは読み込み中の形
    if (changed && scr && typeof scr.load === 'function' && loadedFor !== r.key) {
      var p = null;
      try { p = scr.load(ctx); } catch (e) { console.error(e); }
      if (p && typeof p.then === 'function') {
        var token = loading = {};
        view.innerHTML = U.skeleton(scr.skeleton || 'page');
        lastRoute = r.key; setTitle(titleOf(scr, ctx)); chrome();
        if (!keepScroll) global.scrollTo(0, 0);
        p.then(function () { if (loading === token) { loading = null; loadedFor = r.key; lastRoute = null; render(true); } },
          function (e) { console.error(e); if (loading === token) { loading = null; view.innerHTML = errorPage(); setTitle('表示できませんでした'); focusMain(); } });
        return;
      }
    }
    loading = null;

    var gate = scr && R.planGate ? R.planGate(r.name) : { ok: true };
    gateShown = false;
    if (!scr) { html = U.notFound(); title = 'ページが見つかりません'; }
    else if (!gate.ok) { out = gatePage(gate); html = out.html; title = out.title; scr = null; gateShown = true; }
    else {
      try { html = scr.render(ctx); title = titleOf(scr, ctx); }
      catch (e) { console.error(e); html = errorPage(); title = '表示できませんでした'; scr = null; }
    }
    view.innerHTML = html;

    var app = doc.getElementById('app');
    var full = scr && (typeof scr.layout === 'function' ? scr.layout(ctx) : scr.layout) === 'full';
    if (app) app.classList.toggle('is-full', !!full);
    setTopbar(scr ? backOf(scr, ctx) : null, title);

    if (changed) {
      view.classList.remove('view-enter'); void view.offsetWidth; view.classList.add('view-enter');
      // 戻る・進むで来たときは、前にいた場所へ。新しく開いたときは先頭へ
      var st = null; try { st = global.history.state; } catch (e) {}
      if (st && st.k === r.key && typeof st.y === 'number') global.scrollTo(0, st.y);
      else if (!keepScroll) global.scrollTo(0, 0);
    }
    lastRoute = r.key;
    if (loadedFor !== r.key) loadedFor = null;
    if (scr && scr.mount) { try { scr.mount(view, ctx); } catch (e) { console.error(e); } }
    setTitle(title);
    chrome();

    if (changed) {
      if (!booting) {
        var a = doc.activeElement;
        if (!(a && a !== view && view.contains(a))) focusMain(false);
        announce(doc.title);
      }
    } else restoreFocus(focus, opt && opt.focus);
  }

  /** ログインを止められた会員の画面。試作版なので、ほかの会員に切り替える入口だけ置く（運営画面で再開すれば戻る） */
  var suspendedShown = false;
  function renderSuspended() {
    var k = store.state.kind;
    lastRoute = 'auth:suspended';
    showAuth(authShell(
      '<div class="login__state is-stop">' + icon('lock') + '<h1 class="h2" data-page-title tabindex="-1">ログインを止めています</h1>' +
        '<p>会員番号 <span class="num nw">' + esc(store.state.me.id) + '</span> では、いま会員ページに入れません。心当たりがないときは、<span class="nw">お問い合わせ</span>ください。</p></div>' +
      '<a class="btn btn-ink btn-l btn-block login__next" href="' + CONTACT_LOGIN + '">お問い合わせ</a>' +
      '<p class="login__proto"><span>試作版</span>' + ['demo', 'veteran', 'fresh'].filter(function (x) { return x !== k; }).map(function (x) {
        return '<button type="button" data-act="persona" data-persona="' + x + '">' + esc(PERSONAS[x].ttl) + '</button>';
      }).join('') + '</p>',
      '<a href="index.html">サービス紹介</a><a href="index.html#/faq">よくある質問</a>'
    ), 'ログインを止めています');
  }

  /* ---------- ログイン ---------- */
  /** 運営画面で止めているか。R.loginBlocked があればそれを、なければ R.adminSuspension を見る（どちらもなければ止めない） */
  function loginStop() {
    try {
      if (typeof R.loginBlocked === 'function') { var b = R.loginBlocked(store.state.me && store.state.me.id); if (b) return b; }
      return R.adminSuspension ? R.adminSuspension() : null;
    } catch (e) { console.error(e); return null; }
  }
  /** ログインまわりの画面の上のロゴ（印の下に TAISEI）。合言葉はログインの画面だけに1回（tagline=true） */
  function loginBrand(tagline) {
    return '<div class="login__brand"><a href="index.html" aria-label="' + esc(SITE.name) + ' サービス紹介へ">' +
      U.brandmark(SITE, '', { stack: true, decorative: true }) + '</a>' +
      (tagline && SITE.tagline ? '<p class="login__tagline">' + esc(SITE.tagline) + '</p>' : '') + '</div>';
  }
  function authShell(inner, links, tagline) {
    return '<main class="login" id="main"><div class="login__box">' + loginBrand(tagline) +
      '<div class="login__card">' + inner + '</div>' +
      (links === false ? '' : '<p class="login__links">' + (links || '<a href="#/login">ログインに戻る</a>') + '</p>') +
    '</div></main>';
  }
  function pwField(id, name, label, ac, hint) {
    return '<div class="field"><label class="field__label" for="' + id + '">' + esc(label) + '</label>' +
      '<div class="pw"><input class="input" id="' + id + '" name="' + name + '" type="password" autocomplete="' + ac + '" autocapitalize="none" spellcheck="false"' +
        (hint ? ' aria-describedby="' + id + '-h"' : '') + '>' +
      '<button type="button" class="pw__toggle" data-pw="' + id + '" aria-pressed="false" aria-label="パスワードを表示">' + icon('eye') + '</button></div>' +
      (hint ? '<small id="' + id + '-h">' + esc(hint) + '</small>' : '') + '</div>';
  }
  /** デモの入口の文字。320px では「名前」と「（24日目・Lv3）で入る」の間で折る */
  function demoLabel() {
    var lv = store.state.kind === 'demo' ? R.level().lv : 3;
    return '<span>' + esc(plain(DATA.MEMBER.name)) + '</span><span>（' + DEMO_DAY + '日目・Lv' + lv + '）で入る</span>';
  }
  function showAuth(html, t) {
    doc.body.className = 'app-body';
    U.closePops();
    root.innerHTML = html;
    setTitle(t);
    if (!booting) { focusMain(false); announce(doc.title); }
  }
  function afterLogin() {
    var r = parse();
    if (!global.location.hash || r.name === 'login' || AUTH[r.name]) {
      try { global.history.replaceState(null, '', global.location.pathname + global.location.search + '#/home'); } catch (e) {}
    }
    lastRoute = null;
    render();
  }

  function renderLogin() {
    var s = store.state;
    lastRoute = 'auth:login';
    var needPw = s.kind === 'fresh' && R.needsPassword && R.needsPassword();
    showAuth(authShell(
      '<h1 class="h2" data-page-title tabindex="-1">ログイン</h1>' +
      '<p class="sub login__lead">メールでお送りした会員番号とパスワードで入れます。</p>' +
      (needPw ? '<div class="notice login__notice">' + icon('info') + '<div>はじめてのときは、入会のメールのリンクからパスワードを決めてください。' +
        ' <a href="#/set-password?token=demo-set">パスワードを決める</a></div></div>' : '') +
      '<form id="loginForm" novalidate>' +
        '<label class="field"><span>会員番号 または メールアドレス</span>' +
          '<input class="input" id="loginId" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" value="' + esc(s.me.id) + '"></label>' +
        pwField('loginPw', 'password', 'パスワード', 'current-password') +
        '<p class="form-err" role="alert" id="loginErr"></p>' +
        '<button class="btn btn-ink btn-l btn-block login__submit" type="submit">ログイン</button>' +
      '</form>' +
      '<p class="login__forgot"><a href="#/forgot">パスワードを忘れた方</a></p>' +
      '<details class="login__help login__help--flush"><summary>会員番号が分からない方</summary>' +
        '<p>入会の手続きが終わったときのメール（件名「【' + esc(SITE.name) + '】入会の手続きが終わりました」）に書いてあります。TS- から始まる番号です。</p>' +
        '<p>登録のメールアドレスでもログインできます。見つからないときは <a href="' + CONTACT_LOGIN + '">お問い合わせ</a> へ。</p></details>' +
      '<div class="divider"></div>' +
      '<button type="button" class="btn btn-primary btn-block login__demo" data-demo>' + demoLabel() + '</button>',
      '<a href="index.html#/join">入会する</a><a href="index.html#/faq">よくある質問</a><a href="' + CONTACT_LOGIN + '">お問い合わせ</a>',
      true
    ), 'ログイン');

    var form = doc.getElementById('loginForm'), err = doc.getElementById('loginErr');
    var idEl = form.elements.username, pwEl = form.elements.password;
    function mark(el, on) {
      if (on) { el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', 'loginErr'); }
      else { el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby'); }
    }
    function say(html) {
      // 同じ文でも読み上げ直すように、いったん空にする
      err.textContent = '';
      setTimeout(function () { err.innerHTML = icon('info', 'ico-s') + '<span>' + html + '</span>'; }, 30);
    }
    /* 運営画面で「ログインを止める」にされた会員は、正しい会員番号とパスワードでも入れない。
       会員番号とパスワードは合っているので、欄に誤りの印は付けない。
       別のデモの人に切り替えて入るときは、切り替える前に会員番号で確かめる（R.loginBlocked(no)。いまの人の記録を消さない） */
    function refuse(stop, no) {
      mark(idEl, false); mark(pwEl, false);
      var why = typeof stop === 'string' ? stop : (stop && typeof stop.message === 'string' ? stop.message : '');
      // 欄の会員番号と違う人（デモの入口）で断るときは、どの会員番号かを書く
      var who = no ? '会員番号 <span class="num nw">' + esc(no) + '</span> では、いまログインできません。' : 'この会員番号では、いまログインできません。';
      say((why ? esc(why) : who) + '心当たりがないときは<a href="' + CONTACT_LOGIN + '">お問い合わせ</a>ください。');
      return true;
    }
    function refused() {
      var stop = loginStop();
      if (!stop) return false;
      store.logout();
      return refuse(stop);
    }
    /** デモ会員（高橋さくら）に切り替えて入る前に、その会員番号が止められていないか */
    function demoStopped() {
      if (store.state.kind === 'demo') return false;
      try { var b = typeof R.loginBlocked === 'function' ? R.loginBlocked(DATA.MEMBER.id) : null; return b ? refuse(b, idEl.value.trim() === DATA.MEMBER.id ? '' : DATA.MEMBER.id) : false; }
      catch (x) { console.error(x); return false; }
    }
    form.addEventListener('input', function (e) { if (e.target === idEl || e.target === pwEl) mark(e.target, false); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var res = R.checkLogin(idEl.value, pwEl.value);
      if (!res.ok) {
        say(esc(res.error));
        mark(idEl, res.field === 'id' || res.field === 'both');
        mark(pwEl, res.field === 'pw' || res.field === 'both');
        var target = res.field === 'id' ? idEl : pwEl;
        target.focus(); try { target.select(); } catch (x) {}
        return;
      }
      if (res.persona === 'demo' && demoStopped()) return;
      if (res.persona === 'demo' && store.state.kind !== 'demo') store.resetDemo(true); else store.login();
      if (refused()) return;
      afterLogin();
    });
    root.querySelector('[data-demo]').addEventListener('click', function () {
      if (demoStopped()) return;
      if (store.state.kind !== 'demo') store.resetDemo(true); else store.login();
      if (refused()) return;
      if (R.syncSteps) R.syncSteps();
      afterLogin();
    });
  }

  /* パスワードの再設定（メールを送る → 送った → 新しいパスワード → 終わり）と、はじめてのパスワード */
  var F = { step: 'form', to: '', value: '', sentAt: 0 }, RS = { done: false, token: null };
  function renderAuth(r) {
    var entering = lastRoute !== 'auth:' + r.name;
    lastRoute = 'auth:' + r.name;
    if (r.name === 'forgot') { if (entering) F.step = 'form'; renderForgot(); }
    else if (r.name === 'reset') {
      // 別のリンク（期限切れのリンクなど）を開き直したら、「変えました」の画面から出す
      var tk = r.query.token || '';
      if (entering || RS.token !== tk) RS.done = false;
      RS.token = tk;
      renderReset(tk);
    }
    else renderSetPassword(r.query.token || '');
  }
  function renderForgot() {
    if (F.step === 'sent') {
      var tpl = DATA.MAIL_TEMPLATES && DATA.MAIL_TEMPLATES.reset;
      var subject = tpl ? tpl.email.subject : '【' + SITE.name + '】パスワードの再設定';
      showAuth(authShell(
        '<div class="login__state">' + icon('mail') + '<h1 class="h2" data-page-title tabindex="-1">メールを送りました</h1>' +
          '<p><span class="nw">' + esc(F.to) + '</span>に、新しいパスワードを決めるリンクを送りました。リンクは24時間使えます。</p></div>' +
        '<div class="card-flat login__mail">' +
          '<p class="group-ttl">届くメール</p>' +
          '<p class="small"><b>' + esc(subject) + '</b></p>' +
          '<p class="small login__mail-body">下のリンクから新しいパスワードを決めてください（24時間有効）。</p>' +
          '<a class="btn btn-ghost btn-block login__mail-link" href="#/reset?token=demo">メールのリンクを開く</a>' +
        '</div>' +
        '<details class="login__help"><summary>メールが届かないとき</summary>' +
          '<p>迷惑メールのフォルダを見てください。件名は「' + esc(subject) + '」です。</p>' +
          '<p>届かないときは <button type="button" class="btn btn-text" data-resend>もう一度送る</button></p>' +
          '<p>アドレスを間違えたときは <button type="button" class="btn btn-text" data-again>入れ直す</button></p>' +
        '</details>'
      ), 'メールを送りました');
      root.querySelector('[data-resend]').addEventListener('click', function () {
        var wait = Math.ceil((60000 - (Date.now() - F.sentAt)) / 1000);
        if (wait > 0) { U.toast('送り直しは、あと' + wait + '秒たってからできます'); return; }
        var res = R.requestPasswordReset(F.value);
        if (res && res.ok) { F.sentAt = Date.now(); U.toast('もう一度送りました', 'ok'); }
      });
      root.querySelector('[data-again]').addEventListener('click', function () { F.step = 'form'; renderForgot(); });
      return;
    }
    showAuth(authShell(
      '<h1 class="h2" data-page-title tabindex="-1">パスワードの再設定</h1>' +
      '<p class="sub login__lead">登録のメールアドレスか会員番号を入れてください。新しいパスワードを決めるリンクを送ります。</p>' +
      '<form id="forgotForm" novalidate>' +
        '<label class="field"><span>メールアドレス または 会員番号</span>' +
          '<input class="input" name="account" autocomplete="username" autocapitalize="none" spellcheck="false" value="' + esc(F.value) + '"></label>' +
        '<button class="btn btn-ink btn-l btn-block" type="submit">リンクを送る</button>' +
      '</form>'
    ), 'パスワードの再設定');
    var form = doc.getElementById('forgotForm');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = form.elements.account.value, res = R.requestPasswordReset(v);
      if (!res.ok) { U.fieldErrors(form, { account: res.error }); return; }
      F = { step: 'sent', to: res.to, value: v, sentAt: Date.now() };
      renderForgot();
    });
  }
  function doneState(h, lead) {
    var inSession = store.state.session;
    return '<div class="login__state">' + icon('checkc') + '<h1 class="h2" data-page-title tabindex="-1">' + esc(h) + '</h1><p>' + esc(lead) + '</p></div>' +
      '<a class="btn btn-ink btn-l btn-block login__next" href="' + (inSession ? '#/home' : '#/login') + '">' + (inSession ? '会員ページへ' : 'ログインへ') + '</a>';
  }
  function badLink(t) {
    return '<div class="login__state">' + icon('alert') + '<h1 class="h2" data-page-title tabindex="-1">リンクが使えません</h1><p>' + esc(t.error) + '</p></div>' +
      '<a class="btn btn-ink btn-l btn-block login__next" href="#/forgot">もう一度送る</a>';
  }
  function newPwForm(id, btn) {
    return '<form id="' + id + '" novalidate>' +
      pwField(id + 'Next', 'next', '新しいパスワード', 'new-password', R.PASSWORD_RULE) +
      pwField(id + 'Again', 'again', 'もう一度', 'new-password') +
      '<button class="btn btn-ink btn-l btn-block" type="submit">' + esc(btn) + '</button></form>';
  }
  function renderReset(token) {
    var t = R.checkResetToken(token);
    if (RS.done) { showAuth(authShell(doneState('パスワードを変えました', store.state.session ? 'ほかの端末ではログアウトしました。' : '新しいパスワードでログインしてください。'), false), 'パスワードを変えました'); return; }
    if (!t.ok) { showAuth(authShell(badLink(t)), 'リンクが使えません'); return; }
    showAuth(authShell(
      '<h1 class="h2" data-page-title tabindex="-1">新しいパスワード</h1>' +
      '<p class="sub login__lead">ログインで使うパスワードを決め直します。</p>' + newPwForm('resetForm', 'パスワードを変える')
    ), '新しいパスワード');
    var form = doc.getElementById('resetForm');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var res = R.resetPassword(token, form.elements.next.value, form.elements.again.value);
      if (!res.ok) {
        if (res.errors) { U.fieldErrors(form, { next: res.errors.next || '', again: res.errors.again || '' }); return; }
        showAuth(authShell(badLink(res)), 'リンクが使えません'); return;
      }
      RS.done = true; renderReset(token);
    });
  }
  function renderSetPassword(token) {
    var t = R.checkResetToken(token), m = store.state.me;
    if (!t.ok) { showAuth(authShell(badLink(t)), 'リンクが使えません'); return; }
    if (!R.needsPassword()) {
      showAuth(authShell('<div class="login__state">' + icon('checkc') + '<h1 class="h2" data-page-title tabindex="-1">パスワードは決まっています</h1>' +
        '<p>ログインの画面から入ってください。忘れたときは再設定できます。</p></div>' +
        '<a class="btn btn-ink btn-l btn-block login__next" href="' + (store.state.session ? '#/home' : '#/login') + '">' + (store.state.session ? '会員ページへ' : 'ログインへ') + '</a>',
        '<a href="#/forgot">パスワードを忘れた方</a>'), 'パスワードは決まっています');
      return;
    }
    showAuth(authShell(
      '<h1 class="h2" data-page-title tabindex="-1">パスワードを決める</h1>' +
      '<p class="sub login__lead">はじめてのログインです。会員ページで使うパスワードを決めてください。</p>' +
      '<p class="small login__no">会員番号 <b class="num">' + esc(m.id) + '</b></p>' +
      // パスワードの管理アプリが会員番号と組にして覚えられるように（見た目には出さない）
      '<input class="sr-only" form="setForm" name="username" autocomplete="username" value="' + esc(m.id) + '" readonly tabindex="-1" aria-hidden="true">' +
      newPwForm('setForm', '決めてログインする'), '<a href="#/login">ログインに戻る</a>'
    ), 'パスワードを決める');
    var form = doc.getElementById('setForm');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var res = R.setPassword(form.elements.next.value, form.elements.again.value, token);
      if (!res.ok) {
        if (res.errors) { U.fieldErrors(form, { next: res.errors.next || '', again: res.errors.again || '' }); return; }
        showAuth(authShell(badLink(res)), 'リンクが使えません'); return;
      }
      store.login();
      if (R.syncSteps) R.syncSteps();
      U.toast('パスワードを決めました', 'ok');
      lastRoute = null;
      global.location.hash = store.state.kind === 'fresh' ? '#/start' : '#/home';
    });
  }
  /** パスワードの表示・非表示（ログインと再設定の画面で共通） */
  function togglePw(b) {
    var input = doc.getElementById(b.getAttribute('data-pw'));
    if (!input) return;
    var show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    b.setAttribute('aria-pressed', String(show));
    b.innerHTML = icon(show ? 'eyeoff' : 'eye');
  }

  /* ---------- 共通の知らせ ----------
     ルール側の関数が返した結果を、どの画面からでも同じ見せ方で知らせる。 */
  function reward(r) {
    if (!r) return;
    if (r.levelUp) { celebrate(r); return; }
    if (r.courseCompleted) { completed(r); return; }
    if (r.steps && r.steps.length) {
      U.toast('スタートガイド「' + r.steps[r.steps.length - 1].title + '」が済みました　+' + r.xp + ' XP', 'ok');
      return;
    }
    var parts = [];
    if (r.xp) parts.push('+' + r.xp + ' XP');
    if (r.pt) parts.push('+' + r.pt + 'pt');
    if (parts.length) U.toast(parts.join('・'), 'ok');
  }

  function celebrate(r) {
    var up = r.levelUp;
    // レベルだけでなく講座の修了条件も満たして、いま本当に応募できるものだけ
    var gigs = up.gigs || (DATA.GIGS || []).filter(function (g) { return g.level > up.from && g.level <= up.to && !R.gigLock(g).locked; });
    U.modal(
      '<div class="lvup">' +
        '<div class="lvup__seal" aria-hidden="true"><span>Lv</span><b class="num">' + esc(up.to) + '</b></div>' +
        '<h2 class="lvup__ttl">Lv' + esc(up.to) + '「' + esc(up.name) + '」になりました</h2>' +
        (r.courseCompleted ? '<p class="sub" style="margin-top:6px">講座「' + esc(r.courseCompleted.title) + '」も修了しました。</p>' + courseLinks(r.courseCompleted) : '') +
      '</div>' +
      (up.unlocked.length ?
        '<h3 class="group-ttl" style="margin:18px 0 8px">見られるようになった講座</h3>' +
        '<div class="list">' + up.unlocked.map(function (c) {
          return '<a class="li" href="#/courses/' + encodeURIComponent(c.id) + '" data-close>' +
            '<span class="li__body"><span class="li__ttl">' + esc(c.title) + '</span><span class="li__sub">' + esc(c.summary) + '</span></span>' + U.chevron() + '</a>';
        }).join('') + '</div>' : '') +
      (gigs.length ?
        '<h3 class="group-ttl" style="margin:18px 0 8px">応募できるようになった案件</h3>' +
        '<div class="list">' + gigs.map(function (g) {
          return '<a class="li" href="#/gigs/' + encodeURIComponent(g.id) + '" data-close>' +
            '<span class="li__body"><span class="li__ttl">' + esc(g.title) + '</span><span class="li__sub">' + esc(g.reward) + '（目安）</span></span>' + U.chevron() + '</a>';
        }).join('') + '</div>' : ''),
      { label: 'レベルアップ', foot: '<button type="button" class="btn btn-soft" data-close>閉じる</button>' +
        (up.unlocked.length ? '<a class="btn btn-primary" href="#/courses" data-close>講座を見る</a>' : '') }
    );
    store.update(function (s) { s.seenLevel = up.to; });
  }

  /** 修了したときの「修了証を見る」と、まだ合格していなければ「確認テストを受ける」（決定事項：テストは修了の条件にしない） */
  function courseLinks(c) {
    var id = encodeURIComponent(c.id), q = R.quiz ? R.quiz(c.id) : null, quiz = q && !(q.result && q.result.passed);
    return '<p class="lvup__links"><a class="btn btn-text" href="#/courses/' + id + '/certificate" data-close>修了証を見る</a>' +
      (quiz ? '<a class="btn btn-text" href="#/courses/' + id + '?focus=quiz" data-close>確認テストを受ける（' + q.total + '問）</a>' : '') + '</p>';
  }
  function completed(r) {
    var c = r.courseCompleted;
    var m = U.modal(
      '<div class="lvup">' +
        '<div class="lvup__seal lvup__seal-ok" aria-hidden="true">' + icon('check', 'ico-l') + '</div>' +
        '<h2 class="lvup__ttl">講座「' + esc(c.title) + '」を修了しました</h2>' +
        '<p class="sub" style="margin-top:6px">全' + c.lessons.length + '回を見終えました。<b class="num xp-num">+' + esc(r.xp) + '</b> XP</p>' +
        courseLinks(c) +
      '</div>',
      { label: '講座の修了', foot: '<button type="button" class="btn btn-soft" data-close>閉じる</button>' +
        '<button type="button" class="btn btn-primary" data-share>タイムラインに投稿する</button>' }
    );
    m.querySelector('[data-share]').addEventListener('click', function () {
      var res = R.addPost('講座「' + c.title + '」を修了しました。', 'win');
      m.close(); U.toast('タイムラインに投稿しました', 'ok');
      if (res && res.levelUp) reward(res);
      go('#/feed');
    });
  }

  /** レベルのしくみ（XP のため方・レベルごとに開く講座・最近の記録） */
  function levelInfo() {
    var lv = R.level(), X = DATA.XP;
    var log = (store.state.xpLog || []).slice().sort(function (a, b) { return new Date(b.at) - new Date(a.at); }).slice(0, 8);
    function xpRow(what, n) { return '<tr><td>' + esc(what) + '</td><td class="r"><b class="num xp-num">+' + esc(n) + '</b></td></tr>'; }
    U.modal(
      '<div class="row-between" style="flex-wrap:wrap">' + U.lvBadge(lv.lv, lv.name) +
        '<span class="small"><b class="num xp-num">' + U.num(lv.xp) + '</b> XP' +
        (lv.next ? '・Lv' + lv.next.lv + 'まで あと <b class="num xp-num">' + U.num(lv.toNext) + '</b> XP' : '・最高レベル') + '</span></div>' +
      '<div style="margin-top:10px">' + U.progressBar(lv.pct, 'gold', { label: 'レベルの進みぐあい', valuetext: lv.next ? 'Lv' + lv.next.lv + 'まで あと' + lv.toNext + 'XP' : '最高レベル' }) + '</div>' +
      '<p class="sub" style="margin-top:14px">XP（学びの経験値）は、講座やイベントでたまります。レベルが上がると、見られる講座と応募できる案件が増えます。</p>' +
      '<div class="tbl-wrap" style="margin-top:10px"><table class="tbl"><thead><tr><th scope="col">すること</th><th scope="col" class="r">XP</th></tr></thead><tbody>' +
        xpRow('講座の1回を見終える', X.lesson) + xpRow('勉強会の録画を1本見る', X.archive) +
        (X.quiz ? xpRow('講座の確認テストに合格する', X.quiz) : '') +
        xpRow('イベントに参加する', X.event) + xpRow('案件をやり終える', X.gigDone) +
        xpRow('タイムラインに投稿する（1日' + (X.postPerDay || 3) + '回まで）', X.post) +
      '</tbody></table></div>' +
      '<div class="tbl-wrap" style="margin-top:14px"><table class="tbl"><thead><tr><th scope="col">レベル</th><th scope="col" class="r">必要なXP</th><th scope="col" class="r">開く講座</th></tr></thead><tbody>' +
        DATA.LEVELS.map(function (l) {
          var cur = l.lv === lv.lv, b = function (s) { return cur ? '<b>' + s + '</b>' : s; };
          return '<tr' + (cur ? ' aria-current="true"' : '') + '><td>' + b('Lv' + l.lv + '「' + esc(l.name) + '」') + '</td>' +
            '<td class="r num">' + b(U.num(l.min)) + '</td><td class="r num">' + b(R.coursesAtLevel(l.lv).length + '本') + '</td></tr>';
        }).join('') +
      '</tbody></table></div>' +
      '<p class="sub" style="margin-top:14px">pt（貢献ポイント）は別の数字です。質問に答える、イベントを手伝うなど、ほかの会員の役に立つとたまり、ランキングに使います。紹介した人数では、XPもptも増えません。</p>' +
      '<h3 class="group-ttl" style="margin:20px 0 8px">最近の記録</h3>' +
      (log.length ? '<div class="list">' + log.map(function (l) {
        return '<div class="li"><span class="li__body"><span class="li__ttl">' + esc(l.why) + '</span>' +
          '<span class="li__sub">' + esc(U.relTime(l.at)) + '</span></span><span class="li__end"><b class="num xp-num">+' + esc(l.xp) + '</b></span></div>';
      }).join('') + '</div>' : U.empty('', 'まだ記録はありません。講座を1回見終えると、ここに出ます。')),
      { title: 'レベルのしくみ', foot: true });
  }

  /** お知らせ（新しい5件）。押すと既読にして、その先へ */
  function noticeRows(list) {
    return list.map(function (n) {
      var href = safeHref(n.link || n.go);
      var inner = '<span class="li__ico">' + icon(n.icon || 'bell') + '</span>' +
        '<span class="li__body"><span class="li__ttl">' + esc(n.text) + '</span><span class="li__sub">' + esc(U.relTime(n.at)) + '</span></span>' +
        (n.unread ? '<span class="udot" aria-hidden="true"></span><span class="sr-only">未読</span>' : '');
      var cls = 'li has-ico' + (n.unread ? ' is-unread' : '');
      return href ? '<a class="' + cls + '" href="' + esc(href) + '" data-notice="' + esc(n.id) + '">' + inner + '</a>'
        : '<button type="button" class="' + cls + '" data-notice="' + esc(n.id) + '">' + inner + '</button>';
    }).join('');
  }
  function noticesBox() {
    var list = R.notices().slice(0, 5), unread = R.unreadNotices();
    var m = U.modal(
      list.length ? '<div class="list" id="noticeList">' + noticeRows(list) + '</div>' : U.empty('bell', 'お知らせはありません'),
      { title: 'お知らせ', foot: (unread ? '<button type="button" class="btn btn-soft" data-read-all>すべて既読にする</button>' : '') +
        '<a class="btn btn-ink" href="#/notices" data-close>すべて見る</a>' });
    m.addEventListener('click', function (e) {
      var it = e.target.closest('[data-notice]');
      if (it) {
        R.markNoticeRead(it.getAttribute('data-notice'));
        if (it.tagName === 'A') { m.close(); return; }
        it.classList.remove('is-unread');
        U.$$('.udot,.sr-only', it).forEach(function (x) { x.parentNode.removeChild(x); });
        return;
      }
      var all = e.target.closest('[data-read-all]');
      if (all) {
        R.markAllNoticesRead();
        U.$$('.is-unread', m).forEach(function (x) {
          x.classList.remove('is-unread');
          U.$$('.udot,.sr-only', x).forEach(function (y) { y.parentNode.removeChild(y); });
        });
        var more = m.querySelector('.modal__foot a');
        all.parentNode.removeChild(all);
        if (more) more.focus();
        announce('すべて既読にしました');
      }
    });
    return m;
  }

  /** スマホのメニュー：自分とレベル → 下のタブにない行き先 → 規約など → 試作版 */
  function menuSheet() {
    var m = R.me(), lv = R.level(), cur = curNav(parse().name), unreadMsg = R.unread(), s = store.state;
    var prof = R.profile ? R.profile() : {};
    var planLabel = (PLAN_DEMO.filter(function (p) { return p[0] === currentPlanKey(); })[0] || ['', '有効'])[1];
    U.modal(
      '<button type="button" class="msheet__me" data-act="level" aria-haspopup="dialog" aria-label="' + esc(levelLabel(lv)) + '">' +
        U.avatar({ name: m.name, color: m.color, photo: prof.photo }) +
        '<span class="msheet__who"><b>' + esc(m.name) + '</b><small>' + esc(m.id) + '</small></span>' +
        '<span class="msheet__lv">' + U.lvBadge(lv.lv, lv.name) + U.progressBar(lv.pct, 'gold', { decorative: true }) + '</span>' +
      '</button>' +
      '<nav class="igrid" aria-label="ほかのページ">' + GRID.map(function (g) {
        var on = cur === g[0];
        return '<a class="igrid__item" href="#/' + g[0] + '" data-close' + (on ? ' aria-current="page"' : '') + '>' + icon(g[2]) + '<span>' + g[1] + '</span>' +
          (g[0] === 'messages' && unreadMsg ? '<span class="count"><span aria-hidden="true">' + unreadMsg + '</span><span class="sr-only">（未読' + unreadMsg + '件）</span></span>' : '') + '</a>';
      }).join('') + '</nav>' +
      // 規約などは1行に収める（320px でも折り返さない4つだけ）
      '<p class="msheet__legal">' + LEGAL.map(function (l) { return '<a href="' + l[0] + '">' + l[1] + '</a>'; }).join('') + '</p>' +
      '<div class="msheet__proto"><p class="group-ttl" id="msProto">' + esc(protoName()) + '</p>' +
        '<div class="chips" role="group" aria-labelledby="msProto">' +
          '<button type="button" class="chip" data-act="guide">この画面の見かた</button>' +
          ['demo', 'veteran', 'fresh'].map(function (k) {
            return '<button type="button" class="chip" data-act="persona" data-persona="' + k + '" aria-pressed="' + (s.kind === k) + '">' + esc(PERSONAS[k].chip) + '</button>';
          }).join('') +
          '<button type="button" class="chip" data-act="planmenu" aria-haspopup="dialog">契約：' + esc(planLabel) + '</button>' +
          '<button type="button" class="chip" data-act="reset">最初に戻す</button>' +
        '</div></div>',
      { title: 'メニュー', cls: 'msheet' });
  }

  /** 契約の状態を選ぶ（スマホのメニューから） */
  function planSheet() {
    var cur = currentPlanKey();
    U.modal('<div class="list">' + PLAN_DEMO.map(function (p) {
      var on = p[0] === cur;
      return '<button type="button" class="li" data-act="plan" data-plan="' + p[0] + '" aria-pressed="' + on + '">' +
        '<span class="li__body"><span class="li__ttl">' + p[1] + '</span></span>' + (on ? '<span class="li__end">' + icon('check') + '</span>' : '') + '</button>';
    }).join('') + '</div>', { title: '契約の状態', foot: true });
  }

  /* ---------- 試作版 ---------- */
  function guide() {
    var s = store.state, lv = R.level(), m = R.me(), sns = R.course('sns-basic');
    var tip = ['講座を1回見終える', 'XPがたまります。レベルが上がると、講座が開きます。'];
    if (s.kind === 'demo' && lv.next && sns && !R.courseState(sns).locked && !R.courseState(sns).completed) {
      var n = Math.max(1, Math.ceil(lv.toNext / (DATA.XP.lesson || 20)));
      tip = ['講座 →「' + sns.title + '」の続きを' + n + '回見る', 'Lv' + lv.next.lv + 'に上がって、講座が' + R.coursesAtLevel(lv.next.lv).length + '本開きます。'];
    }
    var tips = [tip,
      ['紹介、ランキング', '紹介リンクと報酬の明細、今月の順位。ランキングは紹介の人数とは関係ありません。'],
      ['スタートガイド', '入会から30日でやることの一覧。「試作版」のメニューで「入会したて」を選ぶと、1日目の画面になります。'],
      ['公開サイト →「入会する」', '申込み、決済（デモ）、会員番号の発行、会員ページまで通しで動きます。']];
    U.modal(
      '<p><span class="tag tag-accent">' + esc(protoName()) + '</span></p>' +
      '<p class="sub" style="margin-top:10px">会員ページの試作です。いまは <b>' + esc(m.name) + '</b>さん（入会' + R.day() + '日目・Lv' + lv.lv + '）として見ています。</p>' +
      '<h3 class="group-ttl" style="margin:18px 0 8px">試してほしいところ</h3>' +
      '<ol class="guide-list">' + tips.map(function (t) { return '<li><b>' + esc(t[0]) + '</b><br>' + esc(t[1]) + '</li>'; }).join('') + '</ol>' +
      '<div class="card-flat" style="margin-top:18px"><p class="small" style="line-height:1.9">' +
        '人物・案件・数値はすべて架空です。動画は入っていません（再生画面の形だけ）。<br>' +
        '決済・LINE通知・メール・運営の返信は、動きを再現しているだけで、外には何も送られません。<br>' +
        '料金・紹介の料率・レベルの区切りは仮の値です。設定1か所で変えられます。<br>' +
        '「試作版」のメニューで、見る人と契約の状態（支払いエラー・解約予定など）を切り替えられます。</p></div>',
      { title: 'この画面の見かた', wide: true, foot: true });
  }

  function closeModals() { U.$$('.modal-bg').forEach(function (m) { if (m.close) m.close(); }); U.closePops(); }

  function switchPersona(k) {
    var P = PERSONAS[k];
    if (!P) return;
    if (k === store.state.kind && k !== 'fresh') { U.toast('いま' + P.chip + 'の会員で見ています'); return; }
    U.confirmBox(P.ttl, P.msg + '\nこの試作版で操作した内容は消えます。', '切り替える').then(function (ok) {
      if (!ok) return;
      if (k === 'demo') store.resetDemo(true);
      else if (k === 'veteran') store.startVeteran(true);
      else store.startFresh(FRESH_FORM);
      if (R.syncSteps) R.syncSteps();
      chromeSig = {}; lastRoute = null;
      if (global.location.hash === P.to) render(); else global.location.hash = P.to;
      U.toast(R.me().name + 'さんの画面にしました', 'ok');
    });
  }
  function setPlan(key) {
    var expired = key === 'past_due_x', status = expired ? 'past_due' : key;
    R.setPlanDemo(status, { expired: expired });
    render(true);
    var label = (PLAN_DEMO.filter(function (p) { return p[0] === key; })[0] || ['', ''])[1];
    U.toast('契約の状態を「' + label + '」にしました');
  }
  function resetDemo() {
    U.confirmBox('デモを最初の状態に戻す', DATA.MEMBER.name + 'さん（入会' + DEMO_DAY + '日目）の状態に戻します。この試作版で操作した内容は消えます。', '戻す').then(function (ok) {
      if (!ok) return;
      store.resetDemo(true);
      if (R.syncSteps) R.syncSteps();
      chromeSig = {}; lastRoute = null;
      if (global.location.hash === '#/home') render(); else global.location.hash = '#/home';
      U.toast('デモを最初の状態に戻しました');
    });
  }

  function logout() {
    closeModals();
    store.logout();
    try { global.history.replaceState(null, '', global.location.pathname + global.location.search); } catch (e) {}
    lastRoute = null; chromeSig = {};
    render();
    U.toast('ログアウトしました');
  }

  /* ---------- 通信が切れたとき ---------- */
  var netT = null;
  function netState(online) {
    var bar = doc.getElementById('netbar');
    if (!bar || online == null) return;
    clearTimeout(netT);
    if (!online) {
      bar.classList.remove('is-online'); bar.hidden = false;
      setTimeout(function () { bar.innerHTML = icon('offline') + '<span>インターネットにつながっていません</span>'; }, 30);
    } else if (!bar.hidden) {
      bar.classList.add('is-online');
      bar.innerHTML = icon('check') + '<span>つながりました</span>';
      netT = setTimeout(function () { bar.hidden = true; bar.classList.remove('is-online'); bar.innerHTML = ''; }, 2000);
    }
  }

  /* ---------- iPhone の「ホーム画面に追加」（一度だけ） ---------- */
  function a2hsHint() {
    var nav = global.navigator || {}, ua = nav.userAgent || '';
    var ios = /iP(hone|od|ad)/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1);
    var standalone = nav.standalone === true || (global.matchMedia && global.matchMedia('(display-mode: standalone)').matches);
    if (!ios || standalone || !/Safari/.test(ua) || /CriOS|FxiOS|EdgiOS|Line\/|FBAN|FBAV|Instagram/.test(ua)) return;
    try { if (global.localStorage.getItem(A2HS_KEY)) return; } catch (e) { return; }
    setTimeout(function () {
      if (!store.state.session || doc.querySelector('.modal-bg')) return;
      U.toast('ホーム画面に追加すると、アプリのように開けます（共有ボタン →「ホーム画面に追加」）', null, { action: '閉じる', onAction: function () {}, duration: 12000 });
      try { global.localStorage.setItem(A2HS_KEY, '1'); } catch (e) {}
    }, 4000);
  }

  /* ---------- 押したときの動き（骨組みの部分） ---------- */
  function onClick(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('[data-skip]')) { e.preventDefault(); focusMain(true); return; }
    if (t.closest('[data-shell-reload]')) { global.location.reload(); return; }
    var pw = t.closest('[data-pw]');
    if (pw) { togglePw(pw); return; }
    var b = t.closest('[data-act]');
    if (!b) {
      // いま開いている画面のナビを押したら、先頭に戻す
      var nav = t.closest('[data-nav],[data-tab]');
      if (nav && nav.getAttribute('href') === global.location.hash) {
        e.preventDefault();
        try { global.scrollTo({ top: 0, behavior: 'smooth' }); } catch (x) { global.scrollTo(0, 0); }
        focusMain(false);
      }
      return;
    }
    if (b.tagName === 'A') e.preventDefault();
    var act = b.getAttribute('data-act');
    if (act === 'notices') noticesBox();
    else if (act === 'menu') menuSheet();
    else if (act === 'level') { closeModals(); levelInfo(); }
    else if (act === 'logout') logout();
    else if (act === 'guide') { if (b.closest('.modal')) closeModals(); guide(); }
    else if (act === 'reset') { closeModals(); resetDemo(); }
    else if (act === 'persona') { closeModals(); switchPersona(b.getAttribute('data-persona')); }
    else if (act === 'fresh') { closeModals(); switchPersona('fresh'); }
    else if (act === 'plan') { closeModals(); setPlan(b.getAttribute('data-plan')); }
    else if (act === 'planmenu') { closeModals(); planSheet(); }
  }

  /* 別のタブ（運営画面など）が同じ保存先を書き換えたとき：入力中でなければ描き直す */
  function refreshIfIdle() {
    var a = doc.activeElement, view = doc.getElementById('view');
    var typing = a && view && view.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
    if (typing || doc.querySelector('.modal-bg') || !view) { chrome(); return; }
    render(true);
  }
  function onOtherTab(e) {
    // 運営画面の保存が変わった：見るのは、ログインの停止・再開と、面談の枠（相談の画面の R.meetingSlots）だけ
    if (e && e.key === ADMIN_KEY) {
      setTimeout(function () {
        if (!store.state.session) return;
        if (!!loginStop() !== suspendedShown) { closeModals(); lastRoute = null; render(); return; }
        if (!suspendedShown && parse().name === 'messages') refreshIfIdle();
      }, 0);
      return;
    }
    if (e && e.key !== store.KEY && e.key !== null) return;
    setTimeout(function () {
      if (!store.state.session) { if (doc.getElementById('view')) { lastRoute = null; render(); } return; }
      // R.setLoginBlocked（会員ページの保存）で止めた・再開した：止めた画面には #view がないので、描き直しを待たずに入れ替える
      // （開いていた窓は閉じる。止めた画面の上に窓が残らないように）
      if (!!loginStop() !== suspendedShown) { closeModals(); lastRoute = null; render(); return; }
      refreshIfIdle();
    }, 0);
  }

  /* 戻る・進むで元の場所に戻すため、いまのスクロール位置を履歴に書いておく */
  var saveT = null;
  function saveScroll() {
    if (!doc.getElementById('view') || loading) return;
    try { global.history.replaceState({ y: global.scrollY || global.pageYOffset || 0, k: lastRoute }, ''); } catch (e) {}
  }

  CLG.app = {
    go: go, refresh: function (o) { render(true, o); }, reward: reward, levelInfo: levelInfo, guide: guide,
    chrome: chrome, announce: announce, notices: noticesBox, menu: menuSheet, focusMain: focusMain,
    logout: logout   // 窓を閉じて、ログアウトして、ログインの画面へ（アカウントの「ログアウト」ボタンから）
  };

  doc.addEventListener('DOMContentLoaded', function () {
    root = doc.getElementById('root');
    if (!root) return;
    try { if ('scrollRestoration' in global.history) global.history.scrollRestoration = 'manual'; } catch (e) {}
    // ?demo=1（在籍24日）・?demo=veteran・?demo=fresh で、その人として開く（公開サイトの「デモを見る」から）
    var dm = /[?&]demo=([\w-]+)/.exec(global.location.search || '');
    if (dm) {
      var want = dm[1] === 'veteran' || dm[1] === 'fresh' ? dm[1] : 'demo';
      if (want === 'veteran') { if (store.state.kind !== 'veteran') store.startVeteran(true); else store.login(); }
      else if (want === 'fresh') { if (store.state.kind !== 'fresh') store.startFresh(FRESH_FORM); else store.login(); }
      else if (store.state.kind !== 'demo') store.resetDemo(true); else store.login();
      try { global.history.replaceState(null, '', global.location.pathname + (global.location.hash || (want === 'fresh' ? '#/start' : '#/home'))); } catch (e) {}
    }
    doc.addEventListener('click', onClick);
    global.addEventListener('hashchange', function () { render(false); });
    global.addEventListener('storage', onOtherTab);
    global.addEventListener('online', function () { netState(true); });
    global.addEventListener('offline', function () { netState(false); });
    global.addEventListener('scroll', function () { clearTimeout(saveT); saveT = setTimeout(saveScroll, 200); }, { passive: true });
    store.on(function () { chrome(); });
    if (R.syncSteps) R.syncSteps();
    render();
    booting = false;
    a2hsHint();
  });
})(window);
