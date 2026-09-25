/* ============================================================
   探す（#/search?q=<言葉>&type=<群>）
   ------------------------------------------------------------
   R.search(q) の群（講座・講座の回・勉強会の録画・案件・イベント・投稿・ヘルプ）に、
   この画面で持っている「ページ」（解約・領収書・振込先など、言葉で行き先が決まる場所）を足して出す。
   - すべて：群ごとに PER 件まで。多い群は「すべて見る」で ?type=<群> に切り替える
   - 当たった言葉は <mark>。文字は esc（U.jp）してから包む。位置は R.search と同じ「1文字ずつそろえる」やり方で探す
   - 最近探した言葉は、見る人（デモの人と会員番号）ごとに localStorage へ。使えないときは出さないだけ
   探す欄の送信は ui.js の [data-u-search] が #/search?q=… に移す（この画面では拾わない）。
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon;
  var cur = null;
  var PER = 4;                 // 「すべて」で群ごとに出す数
  var RECENT_MAX = 8;
  var lastHash = null;         // mount のたびに比べて、来たばかりか・言葉を変えたか・描き直しかを見分ける
  var lastQ = '';
  var ASK = '#/messages?kind=' + encodeURIComponent('質問');

  function coarse() { try { return window.matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } }
  function focusNoScroll(el) {
    if (!el) return;
    if (!el.matches('a[href],button,input,select,textarea,[tabindex]')) el.setAttribute('tabindex', '-1');
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
  }
  /** スマホでは種類の札が横に流れる。描き直すと先頭に戻るので、選んでいる札が隠れていたら見える位置まで送る */
  function chipInView(strip) {
    var on = strip && strip.querySelector('[aria-pressed="true"]');
    if (!on || strip.scrollWidth <= strip.clientWidth) return;
    var r = on.getBoundingClientRect(), p = strip.getBoundingClientRect();
    if (r.left < p.left || r.right > p.right - 24) strip.scrollLeft += r.left - p.left - 16;
  }

  /* ---------- 文字のそろえ方（domain.js の normText と同じ。1文字を1文字に直すので位置がずれない） ---------- */
  function nchar(c) {
    var x = c;
    if (x.normalize) { var y = x.normalize('NFKC'); if (y.length === 1) x = y; }
    var lo = x.toLowerCase(); if (lo.length === 1) x = lo;
    var code = x.charCodeAt(0);
    if (code >= 0x30a1 && code <= 0x30f6) x = String.fromCharCode(code - 0x60);
    return x;
  }
  function norm(t) { t = String(t == null ? '' : t); var o = ''; for (var i = 0; i < t.length; i++) o += nchar(t.charAt(i)); return o; }
  function termsOf(q) {
    var raw = String(q || '').trim();
    if (raw.normalize) raw = raw.normalize('NFKC');
    return norm(raw).split(/\s+/).filter(Boolean);
  }
  function qOf(ctx) { return String((ctx.query && ctx.query.q) || '').trim().slice(0, 100); }

  /** 当たった言葉をすべて <mark> で包む。範囲が重なったらまとめる。中の文字は U.jp（esc と同じく安全） */
  function hl(text, terms) {
    text = String(text == null ? '' : text);
    if (!text || !terms.length) return glue(U.jp(text));
    var n = norm(text), hits = [];
    terms.forEach(function (t) {
      for (var i = 0, k; (k = n.indexOf(t, i)) >= 0; i = k + t.length) hits.push([k, k + t.length]);
    });
    if (!hits.length) return glue(U.jp(text));
    hits.sort(function (a, b) { return a[0] - b[0]; });
    var merged = [];
    hits.forEach(function (x) {
      var last = merged[merged.length - 1];
      if (last && x[0] <= last[1]) last[1] = Math.max(last[1], x[1]); else merged.push([x[0], x[1]]);
    });
    var out = '', pos = 0;
    merged.forEach(function (x) { out += U.jp(text.slice(pos, x[0])) + '<mark>' + U.jp(text.slice(x[0], x[1])) + '</mark>'; pos = x[1]; });
    return glue(out + U.jp(text.slice(pos)));
  }
  /** 「10/15(木) 20:00」を割らない印のすぐ後ろの「・」を、印の中へ入れる（「・」が行の頭に来ないように） */
  function glue(h) { return h.replace(/<\/span>・/g, '・</span>'); }
  function cut(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; }
  /** 抜き出しの頭が言葉の途中（「…0 もくもく」）なら、次の区切りまで落とす。当たった言葉は20字あとなので消えない */
  function tidy(s) {
    s = String(s || '');
    if (s.charAt(0) !== '…') return s;
    var m = /^…[^\s、。，．・：]{0,10}[\s、。，．・：]+/.exec(s);
    return m && m[0].length < s.length - 1 ? '…' + s.slice(m[0].length) : s;
  }

  /* ---------- 最近探した言葉（見る人ごと） ---------- */
  function recentKey() {
    var who = 'demo', no = '';
    try { who = CLG.store.persona() || who; no = (R.me() || {}).id || ''; } catch (e) {}
    return 'terakoya-search-recent:' + who + ':' + no;
  }
  function loadRecent() {
    try {
      var v = JSON.parse(window.localStorage.getItem(recentKey()) || '[]');
      return Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string' && x.trim(); }).slice(0, RECENT_MAX) : [];
    } catch (e) { return []; }
  }
  function storeRecent(list) {
    try { window.localStorage.setItem(recentKey(), JSON.stringify(list.slice(0, RECENT_MAX))); return true; } catch (e) { return false; }
  }
  function addRecent(q) {
    var k = norm(q);
    storeRecent([q].concat(loadRecent().filter(function (x) { return norm(x) !== k; })));
  }

  /* ---------- ページ（R.search に入っていない行き先。言葉で当てる） ----------
     [名前, 行き先, 記号, どこにあるか, 当てる言葉, 出す条件（関数。省けばいつも）] */
  var PAGES = [
    ['スタートガイド', '#/start', 'flag', '', 'はじめ 最初 入会 30日 オリエンテーション やること'],
    ['講座の一覧', '#/courses', 'play', '', '講座 動画 コース 学び レベル'],
    ['勉強会の録画', '#/courses?tab=archive', 'play', '講座', '録画 勉強会 アーカイブ 見逃し'],
    ['タイムライン', '#/feed', 'feed', '', '投稿 質問 成果 つぶやき'],
    ['会員名簿', '#/members', 'users', '', '名簿 会員 メンバー 仲間 地域'],
    ['ランキング', '#/ranking', 'trophy', '', '順位 貢献ポイント pt xp'],
    ['イベント', '#/events', 'calendar', '', 'オフ会 勉強会 成果発表会 予約 オンライン zoom'],
    ['案件', '#/gigs', 'briefcase', '', '仕事 お小遣い 業務委託 副業 応募 募集'],
    ['紹介', '#/referral', 'link', '', '紹介リンク 紹介コード 紹介報酬 報酬 明細 友だち'],
    ['相談・メッセージ', '#/messages', 'message', '', '相談 質問 運営 問い合わせ 連絡'],
    ['面談の予約', '#/messages?kind=' + encodeURIComponent('面談の予約'), 'message', '相談・メッセージ', '面談 予約 zoom 話したい'],
    ['福利厚生', '#/perks', 'gift', '', '割引 特典 優待'],
    ['専門家に相談', '#/perks?tab=experts', 'gift', '福利厚生', '専門家 税理士 司法書士 社労士 確定申告 税金 経費'],
    ['会員証', '#/card', 'card', '', '会員番号 qr 割引'],
    ['お知らせ', '#/notices', 'bell', '', '通知 新着'],
    ['プロフィール', '#/account', 'user', 'アカウント', '名前 ニックネーム 写真 地域 お仕事 公開範囲'],
    ['カードの変更', '#/account?focus=card', 'card', 'アカウント', 'クレジットカード カード 支払い 決済 更新 お支払い'],
    ['契約', '#/account?focus=plan', 'receipt', 'アカウント', 'プラン 月額 料金 会費 請求日 休会'],
    ['領収書', '#/account?focus=invoices', 'receipt', 'アカウント', '請求 明細 インボイス お支払い'],
    ['通知の設定', '#/account?focus=notify', 'bell', 'アカウント', '通知 line メール 止める 設定'],
    ['LINEの連携', '#/account?focus=line', 'line', 'アカウント', 'line ライン 連携 公式line 通知'],
    ['ミュート中の人', '#/account?focus=mutes', 'users', 'アカウント', 'ミュート 非表示 ブロック 解除 やめる', function () { return !!(R.mutes && R.mutes().length); }],
    ['パスワードの変更', '#/account?focus=password', 'lock', 'アカウント', 'パスワード ログイン'],
    ['メールアドレスの変更', '#/account?focus=email', 'mail', 'アカウント', 'メールアドレス メール'],
    ['振込先', '#/account?focus=bank', 'yen', 'アカウント', '口座 銀行 報酬 振込 受け取り'],
    ['解約', '#/account/cancel', 'logout', 'アカウント', '退会 やめる 解約'],
    ['記録の書き出しと削除', '#/account?focus=data', 'download', 'アカウント', '書き出し ダウンロード データ 記録 削除 個人情報 退会'],
    ['ヘルプ', '#/help', 'help', '', 'よくある質問 faq 使い方 困った'],
    ['コミュニティのルール', '#/help?focus=rules', 'help', 'ヘルプ', 'ルール 決まり マナー 勧誘 営業 禁止 #pr'],
    ['利用規約', 'index.html#/terms', 'book', '公開サイト', '規約'],
    ['プライバシーポリシー', 'index.html#/privacy', 'shield', '公開サイト', '個人情報 プライバシー'],
    ['特定商取引法に基づく表記', 'index.html#/tokushoho', 'book', '公開サイト', '特商法 返金 事業者'],
    ['お問い合わせ', 'index.html#/contact', 'mail', '公開サイト', '問い合わせ 連絡']
  ];
  function pageHits(terms) {
    return PAGES.filter(function (p) {
      if (p[5] && !p[5]()) return false;
      var all = norm(p[0] + ' ' + p[4]);
      return terms.every(function (t) { return all.indexOf(t) >= 0; });
    }).map(function (p) { return { type: 'page', id: p[1], title: p[0], href: p[1], ico: p[2], sub: p[3] }; });
  }

  /** 全部の群（ページを先頭に）。R.search の群の形にそろえる */
  function results(q) {
    var terms = termsOf(q), res = R.search(q) || { groups: [] }, groups = [];
    var pages = terms.length ? pageHits(terms) : [];
    if (pages.length) groups.push({ key: 'pages', label: 'ページ', total: pages.length, items: pages });
    groups = groups.concat(res.groups || []);
    // R.search は新しい順に並べる。これからのイベントは近い順のほうが探しやすい（題で当たったものが先なのは同じ）
    groups.forEach(function (g) {
      if (g.key !== 'events') return;
      g.items = g.items.slice().sort(function (a, b) { return (b.score || 0) - (a.score || 0) || new Date(a.at) - new Date(b.at); });
    });
    var total = groups.reduce(function (a, g) { return a + g.total; }, 0);
    return { terms: terms, groups: groups, total: total };
  }

  /* ---------- 1行 ---------- */
  // 投稿の種類はタイムラインの札と同じ名前にする（運営の投稿はタイムラインの「運営から」）。近況は出さない
  var POST_KIND = { win: '成果報告', question: '質問', intro: '自己紹介', news: '運営から', 'new': '運営から', gig: '運営から', event: '運営から' };
  var NEW_DAYS = 7;            // 「新着」を付ける日数（講座の画面と同じ）
  function isNew(at) { if (!at) return false; var d = CLG.now() - new Date(at); return d >= 0 && d < NEW_DAYS * 86400000; }
  function courseOfLesson(id) {
    for (var i = 0; i < DATA.COURSES.length; i++) {
      var c = DATA.COURSES[i];
      for (var j = 0; j < c.lessons.length; j++) if (c.lessons[j].id === id) return { c: c, l: c.lessons[j] };
    }
    return null;
  }
  function byId(list, id) { list = list || []; for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  /** 鍵の印。開く条件は補足（sub）に文字で書いてあるので、読み上げは二度言わない */
  function lock() { return '<span class="lockmark sr-lock" aria-hidden="true">' + icon('lock', 'ico-s') + '</span>'; }

  /* 抜き出しを元のデータから作り直す。R.search は「学べること」「章」「資料」を空白でつないで探すので、
     そのまま出すと「はじめに 読みやすいテロップ 参加者の…」と並んでしまう。当たった1項目だけを出す。
     parts：[文, 頭に付ける言葉, 一覧の1項目か]。どこにも当たらない（題で当たった）ときは最初の文の頭 */
  function hasAny(text, terms) { var n = norm(text); return terms.some(function (t) { return n.indexOf(t) >= 0; }); }
  function around(text, terms) {
    var n = norm(text), k = -1, len = 0;
    terms.some(function (t) { var i = n.indexOf(t); if (i >= 0) { k = i; len = t.length; return true; } return false; });
    if (k < 0) return '';
    var s = Math.max(0, k - 20), e = Math.min(text.length, k + len + 50);
    return tidy((s > 0 ? '…' : '') + text.slice(s, e) + (e < text.length ? '…' : ''));
  }
  function snipFrom(parts, terms) {
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i], t = String(p[0] || '').replace(/\s+/g, ' ').trim();
      if (!t) continue;
      if (p[2]) { if (hasAny(t, terms)) return p[1] + t; }
      else { var a = around(t, terms); if (a) return p[1] + a; }
    }
    return parts[0] && parts[0][0] ? cut(parts[0][0], 60) : '';
  }
  function asItems(arr, head) { return (arr || []).map(function (x) { return [x, head, true]; }); }
  function snipOf(it, terms) {
    if (it.type === 'course') {
      var c = R.course(it.id);
      return c ? snipFrom([[c.summary, '']].concat(asItems(c.learn, '学べること：')), terms) : null;
    }
    if (it.type === 'lesson') {
      var f = courseOfLesson(it.id);
      return f ? snipFrom([[f.l.desc, '']].concat(asItems(f.l.points, '')), terms) : null;
    }
    if (it.type === 'archive') {
      var a = byId(DATA.ARCHIVE, it.id);
      if (!a) return null;
      return snipFrom([[a.desc, '']]
        .concat((a.chapters || []).map(function (x) { return [x[1], x[0] + ' ', true]; }))
        .concat((a.files || []).map(function (x) { return [x.name, '資料：', true]; })), terms);
    }
    // 案件の報酬・種類、イベントの場所は補足に出ているので、抜き出しは説明から
    if (it.type === 'gig') { var g = R.gig(it.id); return g ? snipFrom([[g.desc, '']], terms) : null; }
    if (it.type === 'event') { var e = R.event(it.id); return e ? snipFrom([[e.desc, '']], terms) : null; }
    return null;
  }

  /** 群の種類ごとに、補足（sub）・右端（札か鍵）・左（記号か顔）・抜き出し（snip）を決める */
  function decorate(it, terms) {
    var own = snipOf(it, terms);
    var o = { sub: it.sub || '', end: '', lead: '', snip: own != null ? own : tidy(it.snippet), locked: false, title: it.title };
    var st = CLG.store.state || {};
    if (it.type === 'page') {
      o.lead = '<span class="li__ico">' + icon(it.ico) + '</span>';
    } else if (it.type === 'course') {
      var cs = R.courseState(it.id), c = R.course(it.id);
      // 開いていない講座は「Lv2・全4回・Lv2「手習い」で開きます」と Lv が2回出るので、回の数と開く条件だけにする
      if (cs && cs.locked) { o.locked = true; o.sub = (c ? '全' + c.lessons.length + '回・' : '') + cs.lockReason; o.end = lock(); }
      else if (cs && cs.completed) o.end = U.statusTag('done', '修了');
      else if (cs && cs.started) o.sub += '・' + cs.done + '/' + cs.total + '回';
    } else if (it.type === 'lesson') {
      var f = courseOfLesson(it.id);
      if (f) {
        var ls = R.lessonState(f.c, it.id);
        // 見終わった回は講座の目次と同じく補足に書く（札は「新着」だけ）
        if (ls === 'done') o.sub += '・見終わった';
        else if (ls === 'locked') {
          var cs2 = R.courseState(f.c), why = cs2.locked ? cs2.lockReason : '前の回を見ると開きます';
          o.locked = true; o.sub += '・' + why; o.end = lock();
        } else if (isNew(f.l.newAt)) o.end = U.statusTag('new');
      }
    } else if (it.type === 'archive') {
      var ar = byId(DATA.ARCHIVE, it.id), seen = st.archiveSeen && st.archiveSeen[it.id];
      if (it.at) o.sub += '・' + U.fmtShort(it.at);
      if (seen) o.sub += '・見終わった';
      else if (ar && isNew(ar.newAt)) o.end = U.statusTag('new');
    } else if (it.type === 'gig') {
      var gs = R.gigState(it.id), gl = gs ? null : R.gigLock(it.id), g = R.gig(it.id);
      if (gs) o.end = U.statusTag(gs.tag, gs.label);
      else if (gl && gl.locked) { o.locked = true; o.sub += '・' + gl.reason; o.end = lock(); }
      else if (g && g.isNew) o.end = U.statusTag('new');
    } else if (it.type === 'event') {
      var wp = R.waitlistPos ? R.waitlistPos(it.id) : 0;
      if (R.isReserved(it.id)) o.end = U.statusTag('reserved');
      else if (wp) o.end = U.statusTag('waitlist', 'キャンセル待ち（' + wp + '番目）');
      else if (R.isFull(it.id)) o.end = U.statusTag('closed', '満席');
    } else if (it.type === 'post') {
      var p = R.post(it.id), who = p ? R.person(p.by) : null;
      o.lead = who ? U.avatar(who, 's') : '';
      o.sub = [U.relTime(it.at), p && POST_KIND[p.kind]].filter(Boolean).join('・');
    }
    return o;
  }
  function row(it, terms) {
    var o = decorate(it, terms);
    // 札のある行（鍵ではない）には has-tag。せまい幅では札を題の下へ回す（右に置くと題が1行数文字に縮むため）
    var cls = (o.lead ? ' has-ico' : '') + (o.locked ? ' is-locked' : '') + (o.end && !o.locked ? ' has-tag' : '') + (it.type === 'post' ? ' sr-item--post' : '');
    return '<a class="li sr-item' + cls + '" href="' + esc(it.href) + '" data-sr-hit="' + esc(it.type + ':' + it.id) + '">' +
      o.lead +
      '<span class="li__body">' +
        '<span class="li__ttl">' + hl(o.title, terms) + '</span>' +
        (o.sub ? '<span class="li__sub">' + hl(o.sub, terms) + '</span>' : '') +
        (o.snip ? '<span class="sr-snip">' + hl(o.snip, terms) + '</span>' : '') +
      '</span>' +
      (o.end ? '<span class="li__end">' + o.end + '</span>' : '') +
      U.chevron() + '</a>';
  }

  /* ---------- まとまり ---------- */
  function searchForm(q) {
    return '<form class="sr-form" role="search" data-u-search>' +
      '<label class="sr-only" for="srchQ">会員ページの中を探す</label>' +
      '<span class="sr-form__box">' + icon('search') +
        '<input class="input" id="srchQ" name="q" type="search" enterkeyhint="search" autocomplete="off" maxlength="100" value="' + esc(q) + '" placeholder="講座・案件・投稿">' +
      '</span>' +
      '<button class="btn btn-ink" type="submit">探す</button>' +
    '</form>';
  }
  function hrefFor(q, type) {
    return '#/search?q=' + encodeURIComponent(q) + (type && type !== 'all' ? '&type=' + encodeURIComponent(type) : '');
  }
  function chips(q, r, type) {
    if (r.groups.length < 2) return '';
    return '<div class="chips sr-chips" role="group" aria-label="種類で絞る">' +
      '<button type="button" class="chip" data-sr-type="all" aria-pressed="' + (type === 'all') + '">すべて<span class="n num">' + U.num(r.total) + '</span></button>' +
      r.groups.map(function (g) {
        return '<button type="button" class="chip" data-sr-type="' + esc(g.key) + '" aria-pressed="' + (type === g.key) + '">' + esc(g.label) +
          '<span class="n num">' + U.num(g.total) + '</span></button>';
      }).join('') +
    '</div>';
  }
  function groupBlock(q, g, terms, all) {
    var list = all ? g.items.slice(0, PER) : g.items;
    var more = all && g.total > list.length;
    var hid = 'srg-' + g.key;
    return '<section class="sec sr-group" aria-labelledby="' + hid + '">' +
      '<div class="sec-ttl"><h2 class="sr-h" id="' + hid + '">' + esc(g.label) + '<span class="sr-h__n num">' + U.num(g.total) + '件</span></h2>' +
        (more ? '<a href="' + esc(hrefFor(q, g.key)) + '" data-sr-more="' + esc(g.key) + '" data-focus-after="[data-sr-type=\'' + esc(g.key) + '\']">すべて見る</a>' : '') +
      '</div>' +
      '<div class="list">' + list.map(function (it) { return row(it, terms); }).join('') + '</div>' +
      (!all && g.total > g.items.length ? '<p class="sub sr-cap">先頭の' + U.num(g.items.length) + '件です。言葉を足すと絞り込めます。</p>' : '') +
    '</section>';
  }
  /** 何も入れていないとき・見つからないときの「一覧から探す」 */
  function browse(title) {
    var L = [['#/courses', 'play', '講座'], ['#/courses?tab=archive', 'play', '勉強会の録画'], ['#/gigs', 'briefcase', '案件'],
      ['#/events', 'calendar', 'イベント'], ['#/feed', 'feed', 'タイムライン'], ['#/members', 'users', '会員名簿'],
      ['#/perks', 'gift', '福利厚生'], ['#/help', 'help', 'ヘルプ']];
    return '<section class="sec sr-browse" aria-labelledby="srBrowse"><h2 class="sec-ttl" id="srBrowse">' + esc(title) + '</h2>' +
      '<div class="sr-browse__links">' + L.map(function (x) {
        return '<a class="btn btn-ghost" href="' + x[0] + '">' + icon(x[1], 'ico-s') + esc(x[2]) + '</a>';
      }).join('') + '</div></section>';
  }
  function recentBlock() {
    var list = loadRecent();
    if (!list.length) return '';
    return '<section class="sec sr-recent" aria-labelledby="srRecent">' +
      '<div class="sec-ttl"><h2 class="sr-h" id="srRecent">最近探した言葉</h2>' +
        '<button type="button" class="btn btn-text sr-recent__clear" data-sr-clear data-focus-after="#srchQ">すべて消す</button></div>' +
      '<ul class="list">' + list.map(function (w, i) {
        // 消したあとは同じ番号（＝次の言葉）へ。最後の1つなら前へ、ひとつもなくなれば探す欄へ
        var after = list.length === 1 ? '#srchQ' : "[data-sr-del='" + (i === list.length - 1 ? i - 1 : i) + "']";
        return '<li class="li sr-recent__row">' +
          '<a class="sr-recent__go" href="' + esc(hrefFor(w)) + '">' + icon('clock', 'ico-s') + '<span>' + esc(w) + '</span></a>' +
          '<button type="button" class="iconbtn sr-recent__x" data-sr-del="' + i + '" data-sr-word="' + esc(w) + '" data-focus-after="' + esc(after) + '" aria-label="「' + esc(w) + '」を消す">' + icon('close', 'ico-s') + '</button>' +
        '</li>';
      }).join('') + '</ul></section>';
  }
  function noHit(q, terms) {
    // 言葉が2つ以上なら、1つずつで探したときの数を出す（どれかで当たることが多い）
    var singles = terms.length > 1 ? terms.map(function (t) { return { t: t, n: results(t).total }; }).filter(function (x) { return x.n > 0; }) : [];
    return '<div class="card sr-none">' +
      U.empty('search', '「' + cut(q, 40) + '」に当てはまるものはありません',
        '<p class="sr-none__tip">言葉を短くするか、別の言い方で探してください。</p>' +
        '<a class="btn btn-soft btn-s" href="' + esc(ASK) + '">運営に聞く</a>') +
      (singles.length ? '<div class="sr-none__split"><p class="group-ttl">1つずつ探す</p><div class="chips">' + singles.map(function (x) {
        return '<a class="chip" href="' + esc(hrefFor(x.t)) + '">' + esc(x.t) + '<span class="n num">' + U.num(x.n) + '</span></a>';
      }).join('') + '</div></div>' : '') +
    '</div>';
  }

  CLG.screens.search = {
    title: function (ctx) {
      if (ctx.params[0]) return 'ページが見つかりません';
      var q = qOf(ctx);
      return q ? '「' + cut(q, 24) + '」の検索結果' : '探す';
    },
    back: function (ctx) { return ctx.params[0] ? { href: '#/search', label: '探す' } : null; },
    render: function (ctx) {
      if (ctx.params[0]) return U.notFound();
      var q = qOf(ctx), body = '';
      if (!q) {
        body = recentBlock() + browse('一覧から探す');
      } else {
        var r = results(q), keys = r.groups.map(function (g) { return g.key; });
        var type = keys.indexOf(ctx.query.type) >= 0 ? ctx.query.type : 'all';
        if (!r.total) body = noHit(q, r.terms) + browse('一覧から探す');
        else {
          body = '<p class="sr-count" id="srCount">「' + esc(q) + '」<b class="num">' + U.num(r.total) + '</b>件</p>' +
            chips(q, r, type) +
            r.groups.filter(function (g) { return type === 'all' || g.key === type; })
              .map(function (g) { return groupBlock(q, g, r.terms, type === 'all'); }).join('');
        }
      }
      return '<div class="scr-search">' +
        '<div class="page-head"><h1 class="page-ttl" data-page-title tabindex="-1">探す</h1></div>' +
        searchForm(q) + body +
      '</div>';
    },
    mount: function (root, ctx) {
      cur = ctx;
      var q = qOf(ctx), h = window.location.hash;
      var prev = lastHash, prevQ = lastQ, arrived = h !== prev;
      lastHash = h; lastQ = q;
      if (arrived && q) addRecent(q);
      if (arrived && !q) {
        // 「探す」を押して来たとき（結果の画面からメニューの「探す」を押したときも）は、すぐ打てるように欄へ
        focusNoScroll(root.querySelector('#srchQ'));
      }
      chipInView(root.querySelector('.scr-search .sr-chips'));
      // 同じ画面の中で言葉・種類を変えたとき：数を読み上げる（画面が変わったときは骨組みが題を読む）
      if (arrived && prev !== null && q) {
        var r = results(q), t = ctx.query.type, g = null;
        r.groups.forEach(function (x) { if (x.key === t) g = x; });
        ctx.announce(!r.total ? '見つかりませんでした' : g ? g.label + ' ' + g.total + '件' : r.total + '件見つかりました');
        // 指で使う端末で言葉を変えたときは、キーボードを閉じて結果を見せる（件数の行へ焦点を移す）
        if (q !== prevQ && coarse()) focusNoScroll(root.querySelector('#srCount') || root.querySelector('.sr-none'));
      }

      if (root.__boundSearch) return;
      root.__boundSearch = true;
      // ほかの画面へ移ったら「来たばかり」の印を戻す（同じ言葉でまた来たときも、来たばかりとして扱う）
      window.addEventListener('hashchange', function () {
        if (!/^#\/search(?:[?/]|$)/.test(window.location.hash)) lastHash = null;
      });
      root.addEventListener('click', function (e) {
        var t = e.target.closest('.scr-search [data-sr-type]');
        if (t) {
          if (t.getAttribute('aria-pressed') === 'true') return;
          cur.go(hrefFor(qOf(cur), t.getAttribute('data-sr-type')));
          return;
        }
        var d = e.target.closest('.scr-search [data-sr-del]');
        if (d) {
          // 消すのは言葉で決める（番号は焦点の移り先を決めるためだけ。ほかのタブで増減していても違う言葉を消さない）
          var w = d.getAttribute('data-sr-word') || '';
          if (storeRecent(loadRecent().filter(function (x) { return x !== w; }))) { cur.refresh(); cur.announce('「' + w + '」を消しました'); }
          return;
        }
        if (e.target.closest('.scr-search [data-sr-clear]')) {
          var keep = loadRecent();
          if (!storeRecent([])) return;
          cur.refresh();
          U.toast('最近探した言葉を消しました', null, { action: '元に戻す', onAction: function () { storeRecent(keep); CLG.app.refresh(); } });
        }
      });
    }
  };
})();
