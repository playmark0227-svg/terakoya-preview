/* ============================================================
   会員ページの骨組み（ログイン・メニュー・画面の切り替え・共通の知らせ）
   ------------------------------------------------------------
   画面の中身は assets/js/screens/<画面名>.js が CLG.screens に登録する。
     CLG.screens.home = {
       title: 'ホーム',                    // または function (ctx) { return '…'; }
       render: function (ctx) { return '<div class="scr-home">…</div>'; },
       mount:  function (root, ctx) { … }  // 押したときの動きを付ける（任意）
     };
   URL は #/<画面名>/<引数>/<引数>?<キー>=<値>。
   例：#/courses/ai → CLG.screens.courses に params ['ai'] が渡る。
   ============================================================ */
(function (global) {
  'use strict';
  var CLG = global.CLG, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA, store = CLG.store;
  var esc = U.esc, icon = U.icon;
  CLG.screens = CLG.screens || {};

  var NAV = [
    { items: [['home', 'ホーム', 'home'], ['start', 'スタートガイド', 'flag']] },
    { label: '講座', items: [['courses', '講座', 'play'], ['feed', 'タイムライン', 'feed']] },
    { label: '案件・紹介', items: [['gigs', '案件', 'briefcase'], ['referral', '紹介・報酬', 'gift'], ['ranking', 'ランキング', 'trophy']] },
    { label: 'コミュニティ', items: [['events', 'イベント', 'calendar'], ['messages', '相談・メッセージ', 'message']] },
    { label: '特典', items: [['perks', '福利厚生・専門家', 'ticket'], ['card', '会員証', 'card']] },
    { items: [['account', 'アカウント', 'user']] }
  ];
  var TABS = [['home', 'ホーム', 'home'], ['courses', '講座', 'play'], ['feed', 'タイムライン', 'feed'], ['gigs', '案件', 'briefcase'], ['menu', 'メニュー', 'grid']];
  /* ナビでどの項目を光らせるか（画面名 → ナビの項目） */
  var NAV_OF = { lesson: 'courses', archive: 'courses' };

  var root = null, lastRoute = null;

  /* ---------- URL ---------- */
  function parse() {
    var h = location.hash.replace(/^#\/?/, ''), q = {}, qi = h.indexOf('?');
    if (qi >= 0) {
      h.slice(qi + 1).split('&').forEach(function (kv) {
        var p = kv.split('='); if (p[0]) q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
      });
      h = h.slice(0, qi);
    }
    var parts = h.split('/').filter(Boolean).map(decodeURIComponent);
    return { name: parts[0] || 'home', params: parts.slice(1), query: q, key: h };
  }
  function go(hash) { if (location.hash === hash) render(true); else location.hash = hash; }

  /* ---------- 骨組み ---------- */
  function shell() {
    var site = DATA.SITE;
    return '<div class="app">' +
      '<aside class="side" aria-label="メニュー">' +
        '<a class="side__brand" href="#/home">' + U.brandmark(site, '会員ページ') + '</a>' +
        '<div class="side__me" id="sideMe"></div>' +
        '<nav class="side__nav" id="sideNav"></nav>' +
        '<div class="side__foot">' +
          '<a class="side__link" href="index.html">' + icon('external') + 'サービス紹介</a>' +
          '<button class="side__link side__btn" data-act="logout">' + icon('logout') + 'ログアウト</button>' +
        '</div>' +
      '</aside>' +
      '<div class="main">' +
        '<header class="topbar">' +
          '<a href="#/home" style="text-decoration:none">' + U.brandmark(site) + '</a>' +
          '<div class="row" style="gap:2px">' +
            '<button class="iconbtn" data-act="notices" aria-label="お知らせ">' + icon('bell') + '<span class="dot" hidden></span></button>' +
            '<a class="iconbtn" href="#/card" aria-label="会員証">' + icon('card') + '</a>' +
          '</div>' +
        '</header>' +
        '<main class="main__inner" id="view" tabindex="-1"></main>' +
      '</div>' +
      '<nav class="tabbar" id="tabbar" aria-label="タブ"></nav>' +
    '</div>' +
    '<div class="protobar" id="protobar">' +
      '<span>試作版</span>' +
      '<button data-act="guide">この画面の見かた</button>' +
      '<button data-act="fresh">入会したての状態で見る</button>' +
      '<button data-act="reset">デモを最初から</button>' +
    '</div>';
  }

  /** 左の帯（自分・ナビ）と下のタブ。状態が変わるたびに描き直す */
  function chrome() {
    if (!root || !document.getElementById('sideNav')) return;
    var m = R.me(), lv = R.level(), cur = NAV_OF[parse().name] || parse().name;
    var unreadMsg = R.unread(), unreadNotice = R.unreadNotices();
    var ob = R.onboarding();

    document.getElementById('sideMe').innerHTML =
      '<div class="me-card">' +
        '<a class="me-card__who" href="#/account">' + U.avatar({ name: m.name, color: m.color }) +
          '<span><b>' + esc(m.name) + '</b><small>' + esc(m.id) + '</small></span></a>' +
        '<button class="iconbtn" data-act="notices" aria-label="お知らせ">' + icon('bell') + (unreadNotice ? '<span class="dot"></span>' : '') + '</button>' +
      '</div>' +
      '<button class="lvbox" data-act="level">' +
        '<span class="row-between">' + U.lvBadge(lv.lv, lv.name) +
        '<small class="muted">' + (lv.next ? 'あと <b class="num">' + lv.toNext + '</b> XP' : '最高レベル') + '</small></span>' +
        U.progressBar(lv.pct, 'gold') +
      '</button>';

    document.getElementById('sideNav').innerHTML = NAV.map(function (g) {
      return '<div class="side__group">' + (g.label ? '<div class="side__label">' + esc(g.label) + '</div>' : '') +
        g.items.map(function (it) {
          var badge = '';
          if (it[0] === 'messages' && unreadMsg) badge = '<span class="count">' + unreadMsg + '</span>';
          if (it[0] === 'start' && !ob.finished) badge = '<span class="count count-soft">' + (ob.total - ob.done) + '</span>';
          return '<a class="side__link' + (cur === it[0] ? ' is-active' : '') + '" href="#/' + it[0] + '"' + (cur === it[0] ? ' aria-current="page"' : '') + '>' +
            icon(it[2]) + '<span>' + esc(it[1]) + '</span>' + badge + '</a>';
        }).join('') + '</div>';
    }).join('');

    document.getElementById('tabbar').innerHTML = TABS.map(function (t) {
      var on = cur === t[0] || (t[0] === 'menu' && TABS.every(function (x) { return x[0] !== cur; }));
      var dot = (t[0] === 'menu' && unreadMsg) ? '<span class="dot"></span>' : '';
      if (t[0] === 'menu') return '<button data-act="menu" class="' + (on ? 'is-active' : '') + '">' + icon(t[2]) + t[1] + dot + '</button>';
      return '<a href="#/' + t[0] + '" class="' + (on ? 'is-active' : '') + '">' + icon(t[2]) + t[1] + '</a>';
    }).join('');

    U.$$('.topbar [data-act="notices"] .dot').forEach(function (d) { d.hidden = !unreadNotice; });
  }

  /* ---------- 画面を描く ---------- */
  function render(keepScroll) {
    if (!store.state.session) { renderLogin(); return; }
    if (!document.getElementById('view')) { document.body.className = 'app-body'; root.innerHTML = shell(); }
    var r = parse();
    var scr = CLG.screens[r.name];
    var view = document.getElementById('view');
    var ctx = {
      name: r.name, params: r.params, query: r.query,
      go: go, refresh: function () { render(true); },
      R: R, U: U, DATA: DATA, state: store.state
    };
    var html;
    try {
      html = scr ? scr.render(ctx) : notFound(r.name);
    } catch (e) {
      console.error(e);
      html = '<div class="notice notice-warn">' + icon('info') + '<div>この画面を表示できませんでした（' + esc(e.message) + '）</div></div>';
      scr = null;
    }
    view.innerHTML = html;
    var changed = lastRoute !== r.key;
    if (changed) {
      view.classList.remove('view-enter'); void view.offsetWidth; view.classList.add('view-enter');
      if (!keepScroll) window.scrollTo(0, 0);
    }
    lastRoute = r.key;
    if (scr && scr.mount) { try { scr.mount(view, ctx); } catch (e) { console.error(e); } }
    var t = scr ? (typeof scr.title === 'function' ? scr.title(ctx) : scr.title) : 'ページが見つかりません';
    document.title = (t ? t + '｜' : '') + DATA.SITE.name + ' 会員ページ';
    chrome();
  }

  function notFound(name) {
    return '<div class="page-head"><h1 class="page-ttl">準備中です</h1><p class="page-lead">「' + esc(name) + '」の画面はまだありません。</p></div>' +
      '<a class="btn btn-soft" href="#/home">' + icon('back') + 'ホームへ</a>';
  }

  /* ---------- ログイン ---------- */
  function renderLogin() {
    document.body.className = 'app-body';
    document.title = 'ログイン｜' + DATA.SITE.name + ' 会員ページ';
    var fresh = store.state.kind === 'fresh';
    root.innerHTML =
      '<div class="login"><div class="login__box">' +
        '<div style="text-align:center;margin-bottom:22px">' + U.brandmark(DATA.SITE, '会員ページ') + '</div>' +
        '<div class="login__card">' +
          '<h1 class="h2" style="margin-bottom:4px">ログイン</h1>' +
          '<p class="sub" style="margin-bottom:20px">入会時にメールでお送りしたIDとパスワードを入れてください。</p>' +
          '<form id="loginForm" novalidate>' +
            '<label class="field"><span>会員ID または メールアドレス</span>' +
              '<input class="input" name="id" autocomplete="username" value="' + esc(fresh ? store.state.me.id : DATA.MEMBER.id) + '"></label>' +
            '<label class="field"><span>パスワード</span>' +
              '<input class="input" name="pw" type="password" autocomplete="current-password" placeholder="demo1234"></label>' +
            '<p class="xsmall" id="loginErr" style="color:var(--accent-ink);min-height:1.2em;margin:-6px 0 8px"></p>' +
            '<button class="btn btn-ink btn-l btn-block" type="submit">ログイン</button>' +
          '</form>' +
          '<div class="divider"></div>' +
          '<button class="btn btn-primary btn-l btn-block" data-act="demo">デモ会員で入る</button>' +
          '<p class="xsmall muted" style="margin-top:8px;text-align:center">高橋さくらさん（入会24日目・Lv3）として入ります</p>' +
        '</div>' +
        '<p class="small" style="text-align:center;margin-top:18px"><a href="index.html#/join" style="color:var(--indigo)">まだ会員でない方（入会はこちら）</a></p>' +
        '<p class="proto-note" style="text-align:center;margin-top:10px">試作版：パスワードは demo1234。入力した内容はこのブラウザの中にだけ保存されます。</p>' +
      '</div></div>';

    U.$('#loginForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var pw = e.target.pw.value;
      if (pw !== 'demo1234') { U.$('#loginErr').textContent = 'パスワードが違います（試作版は demo1234）'; return; }
      store.login(); render();
    });
    U.$('[data-act="demo"]').addEventListener('click', function () {
      if (store.state.kind !== 'demo') store.resetDemo(true); else store.login();
      if (!location.hash || location.hash === '#/') location.hash = '#/home';
      render();
    });
  }

  /* ---------- 共通の知らせ ----------
     ルール側の関数が返した結果を、どの画面からでも同じ見せ方で知らせる。 */
  function reward(r) {
    if (!r) return;
    if (r.levelUp) { celebrate(r); return; }
    if (r.courseCompleted) { completed(r); return; }
    if (r.steps && r.steps.length) {
      U.toast('スタートガイド「' + r.steps[r.steps.length - 1].title + '」達成　+' + r.xp + ' XP', 'ok');
      return;
    }
    if (r.xp) U.toast('+' + r.xp + ' XP', 'ok');
  }

  function celebrate(r) {
    var up = r.levelUp;
    // レベルだけでなく講座の修了条件も満たして、いま本当に応募できるものだけを数える
    var gigs = DATA.GIGS.filter(function (g) { return g.level > up.from && g.level <= up.to && !R.gigLock(g).locked; });
    var m = U.modal(
      '<div class="lvup">' +
        '<div class="lvup__seal"><span>Lv</span><b class="num">' + up.to + '</b></div>' +
        '<p class="lvup__eyebrow">レベルアップ</p>' +
        '<h3 class="lvup__ttl">Lv' + up.to + '「' + esc(up.name) + '」になりました</h3>' +
        (r.courseCompleted ? '<p class="sub" style="margin-top:6px">講座「' + esc(r.courseCompleted.title) + '」も修了しました。</p>' : '') +
      '</div>' +
      (up.unlocked.length ?
        '<p class="sec-ttl" style="margin:18px 0 8px">見られるようになった講座</p>' +
        '<div class="list">' + up.unlocked.map(function (c) {
          return '<a class="li" href="#/courses/' + esc(c.id) + '" data-close>' +
            '<span class="li__body"><span class="li__ttl">' + esc(c.title) + '</span><span class="li__sub">' + esc(c.summary) + '</span></span>' + U.chevron() + '</a>';
        }).join('') + '</div>' : '') +
      (gigs.length ? '<p class="sub" style="margin-top:12px">' + icon('briefcase', 'ico-s') + ' 応募できる案件も ' + gigs.length + ' 件増えました。</p>' : '') +
      '<div class="modal__foot"><button class="btn btn-soft" data-close>閉じる</button>' +
      (up.unlocked.length ? '<a class="btn btn-primary" href="#/courses" data-close>講座を見る</a>' : '') + '</div>'
    );
    CLG.store.update(function (s) { s.seenLevel = up.to; });
  }

  function completed(r) {
    var c = r.courseCompleted;
    var m = U.modal(
      '<div class="lvup">' +
        '<div class="lvup__seal lvup__seal-ok">' + icon('check', 'ico-l') + '</div>' +
        '<p class="lvup__eyebrow">修了</p>' +
        '<h3 class="lvup__ttl">' + esc(c.title) + '</h3>' +
        '<p class="sub" style="margin-top:6px">全' + c.lessons.length + '本を見終えました。+' + r.xp + ' XP</p>' +
      '</div>' +

      '<div class="modal__foot"><button class="btn btn-soft" data-close>閉じる</button>' +
      '<button class="btn btn-primary" data-share>タイムラインに投稿する</button></div>'
    );
    m.querySelector('[data-share]').addEventListener('click', function () {
      var res = R.addPost('講座「' + c.title + '」を修了しました！', 'win');
      m.close(); U.toast('タイムラインに投稿しました', 'ok');
      if (res && res.levelUp) reward(res);
      go('#/feed');
    });
  }

  /** 経験値のしくみと、これまでの記録 */
  function levelInfo() {
    var lv = R.level(), log = CLG.store.state.xpLog.slice().sort(function (a, b) { return new Date(b.at) - new Date(a.at); }).slice(0, 12);
    U.modal(
      '<h3 class="modal__ttl">学びのレベル</h3>' +
      '<div class="row-between" style="margin-bottom:8px">' + U.lvBadge(lv.lv, lv.name) +
        '<span class="small"><b class="num">' + lv.xp + '</b> XP' + (lv.next ? '　/　Lv' + lv.next.lv + 'まで あと <b class="num">' + lv.toNext + '</b>' : '') + '</span></div>' +
      U.progressBar(lv.pct, 'gold') +
      '<p class="sub" style="margin-top:14px">講座やイベントに参加するとXPがたまります。レベルが上がると見られる講座と応募できる案件が増えます。</p>' +
      '<div class="tbl-wrap"><table class="tbl" style="margin-top:12px"><thead><tr><th>すること</th><th class="r">XP</th></tr></thead><tbody>' +
        '<tr><td>講座を1本見終える</td><td class="r num">+' + DATA.XP.lesson + '</td></tr>' +
        '<tr><td>勉強会アーカイブを1本見る</td><td class="r num">+' + DATA.XP.archive + '</td></tr>' +
        '<tr><td>イベントに参加する</td><td class="r num">+' + DATA.XP.event + '</td></tr>' +
        '<tr><td>案件をやり終える</td><td class="r num">+' + DATA.XP.gigDone + '</td></tr>' +
        '<tr><td>タイムラインに投稿する（1日3回まで）</td><td class="r num">+' + DATA.XP.post + '</td></tr>' +
      '</tbody></table></div>' +
      '<p class="xsmall muted" style="margin-top:8px">紹介した人数では、レベルも貢献ポイントも増えません。</p>' +
      '<p class="sec-ttl" style="margin:18px 0 8px">最近の記録</p>' +
      '<div class="list">' + (log.length ? log.map(function (l) {
        return '<div class="li"><span class="li__body"><span class="li__ttl" style="font-weight:500;font-size:14px">' + esc(l.why) + '</span>' +
          '<span class="li__sub">' + U.relTime(l.at) + '</span></span><span class="li__end num" style="color:var(--gold);font-weight:700">+' + l.xp + '</span></div>';
      }).join('') : '<div class="empty">まだ記録はありません</div>') + '</div>' +
      '<div class="modal__foot"><button class="btn btn-soft" data-close>閉じる</button></div>', { wide: false });
  }

  function noticesBox() {
    var list = R.notices();
    var m = U.modal(
      '<h3 class="modal__ttl">お知らせ</h3>' +
      '<div class="list">' + (list.length ? list.map(function (n) {
        return '<a class="li has-ico" href="' + esc(n.go) + '" data-close><span class="li__ico">' + icon(n.icon) + '</span>' +
          '<span class="li__body"><span class="li__ttl" style="font-weight:' + (n.unread ? 700 : 500) + '">' + esc(n.text) + '</span>' +
          '<span class="li__sub">' + U.relTime(n.at) + '</span></span>' + (n.unread ? '<span class="tag tag-accent">新着</span>' : '') + '</a>';
      }).join('') : '<div class="empty">お知らせはありません</div>') + '</div>' +
      '<div class="modal__foot"><button class="btn btn-soft" data-close>閉じる</button></div>');
    R.markNoticesRead();
    return m;
  }

  function menuSheet() {
    var unreadMsg = R.unread();
    U.modal(
      '<h3 class="modal__ttl">メニュー</h3>' +
      NAV.map(function (g) {
        return (g.label ? '<p class="sec-ttl" style="margin:14px 4px 6px">' + esc(g.label) + '</p>' : '<div style="height:10px"></div>') +
          '<div class="list">' + g.items.map(function (it) {
            return '<a class="li has-ico" href="#/' + it[0] + '" data-close><span class="li__ico">' + icon(it[2]) + '</span>' +
              '<span class="li__body"><span class="li__ttl">' + esc(it[1]) + '</span></span>' +
              (it[0] === 'messages' && unreadMsg ? '<span class="tag tag-accent">' + unreadMsg + '</span>' : '') + U.chevron() + '</a>';
          }).join('') + '</div>';
      }).join('') +
      '<div class="list" style="margin-top:18px">' +
        '<button class="li has-ico" data-g><span class="li__ico">' + icon('info') + '</span><span class="li__body"><span class="li__ttl">この試作版について</span></span>' + U.chevron() + '</button>' +
        '<button class="li has-ico" data-act="fresh"><span class="li__ico">' + icon('user') + '</span><span class="li__body"><span class="li__ttl">入会したての状態で見る（試作版）</span></span></button>' +
        '<button class="li has-ico" data-act="reset"><span class="li__ico">' + icon('back') + '</span><span class="li__body"><span class="li__ttl">デモを最初から（試作版）</span></span></button>' +
        '<a class="li has-ico" href="index.html"><span class="li__ico">' + icon('external') + '</span><span class="li__body"><span class="li__ttl">サービス紹介ページ</span></span>' + U.chevron() + '</a>' +
        '<button class="li has-ico" data-lo><span class="li__ico">' + icon('logout') + '</span><span class="li__body"><span class="li__ttl">ログアウト</span></span></button>' +
      '</div>' +
      '<div class="modal__foot"><button class="btn btn-soft" data-close>閉じる</button></div>');
    U.$('[data-g]').addEventListener('click', function () { U.$('.modal-bg').close(); guide(); });
    U.$('[data-lo]').addEventListener('click', function () { U.$('.modal-bg').close(); logout(); });
  }

  /* ---------- 試作版の案内 ---------- */
  function guide() {
    U.modal(
      '<p class="tag tag-accent" style="margin-bottom:10px">試作版 v0.1</p>' +
      '<h3 class="modal__ttl">この画面の見かた</h3>' +
      '<p class="sub">会員ページの試作です。いまは <b>' + esc(R.me().name) + '</b> さん（' + (CLG.store.state.kind === 'demo' ? '入会24日目・Lv3' : '入会したて') + '）として見ています。</p>' +
      '<p class="sec-ttl" style="margin:18px 0 8px">試してほしいところ</p>' +
      '<ol class="guide-list">' +
        '<li><b>講座 → 「SNS発信入門」の続きを2本見る</b><br>Lv4に上がって、講座が4つ見られるようになります。</li>' +
        '<li><b>紹介・報酬、ランキング</b><br>紹介リンク、報酬の明細、今月の順位。ランキングは紹介の人数とは関係ありません。</li>' +
        '<li><b>スタートガイド</b><br>入会後30日でやることの一覧。「入会したての状態で見る」で1日目の画面になります。</li>' +
        '<li><b>公開サイト → 入会する</b><br>申込、決済（デモ）、ログインIDの発行、会員ページまで通しで動きます。</li>' +
      '</ol>' +
      '<div class="card-flat" style="margin-top:16px"><p class="xsmall" style="line-height:1.9">' +
        '人物・案件・数値はすべて架空です。動画は入っていません（再生画面の形だけ）。<br>' +
        '決済・LINE通知・メッセージの返信は動きを再現しているだけで、外には何も送られません。<br>' +
        '料金・紹介の料率・レベルの区切りは仮の値です（data.js で一か所から変えられます）。</p></div>' +
      '<div class="modal__foot"><button class="btn btn-ink" data-close>閉じる</button></div>', { wide: true });
  }

  function logout() {
    store.logout(); location.hash = ''; render();
  }

  /* ---------- 押したときの動き（骨組みの部分） ---------- */
  function onClick(e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var act = b.getAttribute('data-act');
    if (act === 'notices') { noticesBox(); chrome(); }
    else if (act === 'menu') menuSheet();
    else if (act === 'level') levelInfo();
    else if (act === 'logout') logout();
    else if (act === 'guide') guide();
    else if (act === 'reset' || act === 'fresh') { U.$$('.modal-bg').forEach(function (m) { if (m.close) m.close(); }); }
    if (act === 'reset') {
      U.confirmBox('デモを最初からにする', '高橋さくらさん（入会24日目）の状態に戻します。この試作版で操作した内容は消えます。', '最初からにする').then(function (ok) {
        if (!ok) return; store.resetDemo(true); lastRoute = null; location.hash = '#/home'; render(); U.toast('デモを最初の状態に戻しました');
      });
    } else if (act === 'fresh') {
      U.confirmBox('入会したての状態で見る', '「山田 はな」さんが今日入会した、という状態で会員ページを開きます。\n元に戻すときは「デモを最初から」を押してください。', '入会1日目で見る').then(function (ok) {
        if (!ok) return;
        store.startFresh({ name: '山田 はな', area: '', job: '' });
        lastRoute = null; location.hash = '#/start'; render();
      });
    }
  }

  CLG.app = { go: go, refresh: function () { render(true); }, reward: reward, levelInfo: levelInfo, guide: guide, chrome: chrome };

  document.addEventListener('DOMContentLoaded', function () {
    root = document.getElementById('root');
    if (/[?&]demo=1\b/.test(location.search)) {
      if (store.state.kind !== 'demo') store.resetDemo(true); else store.login();
      try { history.replaceState(null, '', location.pathname + (location.hash || '#/home')); } catch (e) {}
    }
    document.addEventListener('click', onClick);
    window.addEventListener('hashchange', function () { render(false); });
    store.on(function () { chrome(); });
    R.syncSteps();
    render();
  });
})(window);
