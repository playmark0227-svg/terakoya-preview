/* ============================================================
   タイムライン（#/feed）と投稿1件（#/feed/<投稿id>）
   ------------------------------------------------------------
   運営・講師・仲間の新しい動きが流れる場所。打ち合わせの
   「X や Instagram のように、新しい情報がどんどん流れる」に当たる。
   - 絞り込み・ページは URL の ?kind= ?cohort= ?page= で持つ（戻るボタンで戻れるように）
   - #/feed?kind=intro&cohort=2026-09 … 書いた人の入会月でしぼる（スタートガイドの「9月入会の仲間の自己紹介」）。
     運営の投稿（staff）・自分の投稿（mine）ではしぼらない。種類の札を押すと入会月の条件は外れる
   - #/feed?intro=1 … 自己紹介のひな形が入った状態で始まる
   - #/feed?compose=<種類>&text=<書き出し> … 種類と書き出しを入れた状態で始まる（イベントの「感想を書く」）。
     書きかけがあるときは消さずに残し、一言の知らせの「置きかえる」で入れかえられる
   - #/feed?post=<id> … 一覧の中のその投稿まで送って目印を付ける。一覧に出ない投稿（運営が隠した自分の投稿・
     ミュート中の人の投稿）は、知らせのある投稿1件の画面（#/feed/<id>）へ移しかえる
   - #/feed/<id>?c=<コメントid> … 投稿1件。そのコメントまで送って目印を付ける（?write=1 は書く欄へ）
     #/feed?c=<コメントid>（?post= つきも）や、ほかの投稿の id で来たときは、そのコメントがある投稿へ移しかえる
   - 一覧の中のコメント（最新2件）の時刻は、そのコメントの場所（?c=）へのリンク
   - 運営が隠した投稿・コメント（R.hidePost / hideComment / 通報の非表示）は、書いた本人にだけ理由つきで見える。
     投稿は1件の画面の上に知らせ、「自分の投稿」の一覧の上にも全部並べる（R.feed には出てこないため）。
     コメントはその下に「運営が非表示にしました」と理由
   - 同じものを受付中にもう一度通報しようとしたら、窓を開かずに「通報済み」と知らせる
   - コメントの「ありがとう」は書いた人に +2pt（ランキングに入る）。自分の pt は CLG.app.reward で知らせる
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon, enc = encodeURIComponent;
  var PAGE = 15, MAX = 1000;
  var IMG_MAX = (R.imageLimit && R.imageLimit.max) || 4;

  /* 書く欄の種類と、絞り込みの札の名前はそろえる */
  var KINDS = [['post', '近況'], ['question', '質問'], ['win', '成果報告'], ['intro', '自己紹介']];
  var KIND_LABEL = { post: '近況', question: '質問', win: '成果報告', intro: '自己紹介' };
  var FILTERS = [['all', 'すべて'], ['staff', '運営から']].concat(KINDS).concat([['mine', '自分の投稿']]);
  /* 前の版のリンク（?kind=news など）は「運営から」で開く */
  var LEGACY = { news: 'staff', 'new': 'staff', gig: 'staff', event: 'staff' };
  var EMPTY = {
    all: 'まだ投稿はありません', staff: '運営からの投稿はまだありません', post: 'まだ近況の投稿はありません',
    question: 'まだ質問はありません', win: 'まだ成果の報告はありません', intro: 'まだ自己紹介はありません', mine: 'まだ投稿していません'
  };
  /* 成果の例は、金額でなく「やったこと」にしておく（収入を言い切る投稿が並ばないように） */
  var PLACEHOLDER = {
    post: '近況を書く',
    question: '質問を書く',
    win: '例：講座を1本見終えた／はじめて案件に応募した',
    intro: '自己紹介を書く'
  };
  var LINK_LABEL = { 'new': '講座を見る', gig: '案件を見る', event: 'イベントを見る' };
  /* 運営の投稿のリンクの文言は、行き先で決める（運営画面では「お知らせ」の種類からイベントへ飛ばすこともある） */
  var ROUTE_LABEL = { events: 'イベントを見る', gigs: '案件を見る', courses: '講座を見る', lesson: '講座を見る', perks: '福利厚生を見る',
    referral: '紹介を見る', ranking: 'ランキングを見る', start: 'スタートガイドを見る', feed: '投稿を見る', members: '会員名簿を見る', help: 'ヘルプを見る', card: '会員証を見る' };
  /* 入会月でしぼれる種類（運営の投稿・自分の投稿は入会月と関係がない） */
  var COHORT_KINDS = { all: 1, post: 1, question: 1, win: 1, intro: 1 };
  var COHORT_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

  /* 書きかけ。いいねや絞り込みで描き直しても消えないよう、画面の外に持つ（auto：種類を絞り込みに合わせただけのとき true） */
  var draft = { text: '', kind: 'post', images: [] };
  var cdraft = { post: null, text: '' };   // 投稿1件の画面の、いちばん下のコメント欄
  var rdraft = null;                       // 返信の書きかけ { post, root, to, name, text }
  var draftOwner = null;       // 試作版は会員を切り替えられる。別の人の書きかけを持ち越さない
  var focusComposer = false;   // ひな形を入れた直後だけ、入力欄に移る
  var lastPosted = null;       // 投稿した直後の1件を、ひと呼吸だけ目立たせる
  var freshCmt = null;         // コメントした直後の1件
  var popLike = null;          // いいねした直後のハートだけ弾ませる
  var open = {};               // コメントを開いている投稿
  var reading = 0;             // 読み込み中の写真の数
  var posting = false;
  var pending = null;          // ?post= で来たとき、描いたあとに送る先 { id, found, hash }
  var moveTo = null;           // ?c= のコメントが別の投稿にあったとき、描いたあとに移る先（#/feed/<投稿>?c=<コメント>）
  var lostC = false;           // ?c= のコメントが見つからなかった（描いたあとに知らせる）
  var composeLater = null;     // ?compose= で来たが書きかけがあった { text, kind }（描いたあとに「置きかえる」を出す）
  var lastKey = null;          // 同じ画面の描き直しか、来たばかりか
  var cur = null;              // mount で受け取った ctx

  /* ---------- 小さな道具 ---------- */
  function filterOf(q) {
    var k = q && q.kind;
    return EMPTY[k] ? k : LEGACY[k] || 'all';
  }
  /** ?cohort=2026-09。形が違うもの・入会月でしぼれない種類のときは '' */
  function cohortOf(q, kind) {
    var c = String((q && q.cohort) || '');
    return COHORT_RE.test(c) && COHORT_KINDS[kind] ? c : '';
  }
  /** 「2026年9月入会」 */
  function cohortName(c) { var m = COHORT_RE.exec(c); return m ? m[1] + '年' + (+m[2]) + '月入会' : ''; }
  function listHash(kind, page, cohort) {
    var p = [];
    if (kind && kind !== 'all') p.push('kind=' + enc(kind));
    if (cohort) p.push('cohort=' + enc(cohort));
    if (page > 1) p.push('page=' + page);
    return '#/feed' + (p.length ? '?' + p.join('&') : '');
  }
  function ym(at) {
    var d = new Date(at);
    return isNaN(d.getTime()) ? '' : d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
  }
  /** 書いた人の入会月。名簿（R.members）にあればそれ、なければ会員のページの入会日、それもなければ投稿の月 */
  function cohortTable() {
    var idx = {};
    R.members({}).forEach(function (m) { idx[m.me ? 'me' : m.id] = m.cohortKey; });
    return function (p) {
      if (p.mine) return idx.me || ym(R.me().joinedAt);
      if (idx[p.by]) return idx[p.by];
      if (R.person(p.by).staff) return '';
      var pr = R.memberProfile(p.by);
      return (pr && pr.joinedAt && ym(pr.joinedAt)) || ym(p.at);
    };
  }
  /** 一覧の1ページ（R.feed の形）。入会月でしぼるときは、しぼってからページに分ける */
  function pageOf(kind, cohort, page) {
    var all = R.feed({ kind: kind, page: 1, pageSize: 100000 }).items;
    if (cohort) { var of = cohortTable(); all = all.filter(function (p) { return of(p) === cohort; }); }
    var pages = Math.max(1, Math.ceil(all.length / PAGE));
    page = Math.min(pages, Math.max(1, page));
    return { all: all, items: all.slice((page - 1) * PAGE, page * PAGE), shown: all.slice(0, page * PAGE), total: all.length,
      page: page, hasMore: page * PAGE < all.length, next: all[page * PAGE] || null };
  }
  /** 運営が隠した自分の投稿（R.feed には出ないので、隠した記録から R.post で拾う。R.post は本人にだけ hidden つきで返す） */
  function myHidden() {
    var h = (CLG.store.state && CLG.store.state.hiddenPosts) || {};
    return Object.keys(h).map(function (id) { return R.post(id); })
      .filter(function (p) { return p && p.mine && p.hidden; })
      .sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
  }
  /** コメントがどの投稿にあるか（hint の投稿を先に見る）。見えないコメントなら null */
  function postOfComment(cid, hint) {
    if (!cid) return null;
    function has(pid) { return flatten(R.comments(pid)).some(function (c) { return c.id === cid; }); }
    if (hint && R.post(hint) && has(hint)) return hint;
    var list = R.feed('all').concat(myHidden());
    for (var i = 0; i < list.length; i++) if (list[i].id !== hint && has(list[i].id)) return list[i].id;
    return null;
  }
  /** 文の切れ目で折る（「ほかの／会員には」のように文の途中で割らない）。中身はこの画面の決まった文だけ */
  function sents() {
    return Array.prototype.map.call(arguments, function (t) { return '<span class="feed-sent">' + esc(t) + '</span>'; }).join('');
  }
  function oneHash(pid, cid) { return '#/feed/' + enc(pid) + (cid ? '?c=' + enc(cid) : ''); }
  /** 同じものを、受付中のまま通報しているか（通報の記録は読むだけ） */
  function reported(postId, commentId) {
    return ((CLG.store.state && CLG.store.state.reports) || []).some(function (x) {
      return x.postId === postId && (x.commentId || null) === (commentId || null) && x.status === '受付';
    });
  }
  function introStep() { return R.steps().filter(function (s) { return s.id === 'intro'; })[0] || null; }
  /* 自己紹介のすすめは、書く欄にひな形が入っているあいだは隠す（同じことを2か所で言わない） */
  function showIntroCard() { return !(draft.kind === 'intro' && draft.text.trim()); }
  /* ひな形の「〜：」のあとが空のままの行（カーソルを置く先・投稿前の確認に使う） */
  var BLANK = /：[ \t\u3000]*(\n|$)/;
  function blankLabel(text) {
    var m = /^(.+?)：[ \t\u3000]*$/m.exec(text);
    return m ? m[1].trim() : '';
  }
  function roleOf(who) { return who.staff ? (who.role || '運営') : ''; }
  function flatten(top) {
    var out = [];
    (top || []).forEach(function (c) { out.push(c); (c.replies || []).forEach(function (r) { out.push(r); }); });
    return out.sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
  }
  function imagesOf(p) {
    if (p.images && p.images.length) return p.images;
    return p.img ? [{ src: p.img, alt: p.alt || '' }] : [];
  }
  function headOf(p) {
    var who = R.person(p.by);
    return p.mine ? '自分の投稿' : who.name + 'さんの投稿';
  }
  /** 描き直さずに URL の一度きりの引数（?post= ?c= ?intro=）を消す */
  function replaceHash(h) {
    try { history.replaceState(history.state, '', h); } catch (e) {}
  }
  function sendState() {
    var len = draft.text.length, left = MAX - len;
    var why = reading ? '写真を読み込んでいます' : !draft.text.trim() ? '本文を書くと投稿できます' : '';
    return { disabled: !!why, why: why, count: left < 200 ? (left > 0 ? 'あと' + left + '文字' : MAX + '文字までです') : '', over: left <= 0 };
  }

  /* ---------- 部品：書く欄 ---------- */
  function introCard() {
    return '<div class="card intro-cta">' +
      '<p class="intro-cta__ttl">まだ自己紹介を書いていません。</p>' +
      '<button type="button" class="btn btn-ink btn-s" data-feed-intro>自己紹介を書く</button>' +
    '</div>';
  }

  function thumbs() {
    if (!draft.images.length) return '';
    return '<ul class="composer__imgs" aria-label="付けた写真">' + draft.images.map(function (im, i) {
      return '<li class="composer__img"><img src="' + esc(im.src) + '" alt="">' +
        '<button type="button" class="composer__unimg" data-feed-unimg="' + i + '" data-focus-after="[data-feed-photo]" aria-label="' + (i + 1) + '枚目の写真を外す">' +
        icon('close') + '</button></li>';
    }).join('') + '</ul>';
  }

  function composer() {
    var k = draft.kind, st = sendState(), n = draft.images.length;
    return '<form class="card composer" data-feed-form novalidate>' +
      '<div class="composer__row">' + U.avatar(R.person('me')) +
        '<div class="composer__main">' +
          '<label class="sr-only" for="feedText">投稿の本文</label>' +
          '<textarea id="feedText" class="textarea composer__ta" rows="3" maxlength="' + MAX + '" placeholder="' +
            esc(PLACEHOLDER[k] || PLACEHOLDER.post) + '" aria-describedby="feedCount">' + esc(draft.text) + '</textarea>' +
          thumbs() +
        '</div>' +
      '</div>' +
      '<div class="composer__foot">' +
        '<div class="seg composer__seg" role="group" aria-label="投稿の種類">' + KINDS.map(function (o) {
          var on = o[0] === k;
          return '<button type="button" data-feed-kind="' + o[0] + '" class="' + (on ? 'is-on' : '') + '" aria-pressed="' + on + '">' + esc(o[1]) + '</button>';
        }).join('') + '</div>' +
        '<div class="composer__acts">' +
          '<button type="button" class="composer__photo" data-feed-photo aria-label="写真を付ける（' + IMG_MAX + '枚まで・いま' + n + '枚）"' +
            (n >= IMG_MAX ? ' disabled' : '') + '>' + icon('camera') + (n ? '<span class="num">' + n + '/' + IMG_MAX + '</span>' : '') + '</button>' +
          '<input type="file" id="feedFile" class="composer__file" accept="image/jpeg,image/png,image/webp" multiple tabindex="-1" aria-hidden="true">' +
          '<span class="composer__count num' + (st.over ? ' is-over' : '') + '" id="feedCount">' + esc(st.count) + '</span>' +
          '<span class="composer__why" id="feedWhy">' + esc(st.why) + '</span>' +
          '<button type="submit" class="btn btn-primary composer__send" aria-keyshortcuts="Meta+Enter Control+Enter" aria-describedby="feedWhy"' +
            (st.disabled ? ' disabled' : '') + '>投稿する</button>' +
        '</div>' +
      '</div>' +
    '</form>';
  }

  function chips(kind) {
    return '<div class="chips feed-chips" role="group" aria-label="絞り込み">' + FILTERS.map(function (f) {
      var on = f[0] === kind;
      return '<button type="button" class="chip' + (on ? ' is-on' : '') + '" data-feed-filter="' + f[0] + '" aria-pressed="' + on + '">' + esc(f[1]) + '</button>';
    }).join('') + '</div>';
  }

  /* ---------- 部品：投稿 ---------- */
  function popItem(attr, val, label, danger, extra) {
    return '<button type="button" class="pop__item' + (danger ? ' is-danger' : '') + '" ' + attr + '="' + esc(val) + '"' + (extra || '') + '>' + esc(label) + '</button>';
  }
  function postMenu(p, who) {
    var id = 'fp-' + p.id, items;
    if (p.mine) items = popItem('data-feed-edit', p.id, '編集する') + popItem('data-feed-del', p.id, '削除する', true);
    else {
      items = popItem('data-feed-report', p.id, '通報する');
      if (!who.staff && !p.muted) items += popItem('data-feed-mute', p.by, 'この人をミュート', false, ' data-feed-at="' + esc(p.id) + '"');
    }
    return '<div class="post__more">' +
      '<button type="button" class="iconbtn post__menu" data-pop="' + esc(id) + '" aria-expanded="false" aria-controls="' + esc(id) + '" aria-label="' +
        esc(headOf(p) + 'のメニュー') + '">' + icon('more') + '</button>' +
      '<div class="pop post__pop" id="' + esc(id) + '" hidden>' + items + '</div>' +
    '</div>';
  }

  function postImages(p) {
    var list = imagesOf(p);
    if (!list.length) return '';
    return '<div class="post__imgs n-' + list.length + '">' + list.map(function (im, i) {
      return '<button type="button" class="post__img" data-feed-img="' + esc(p.id) + '" data-feed-i="' + i + '">' +
        '<img src="' + esc(im.src) + '" alt="' + esc(im.alt || (list.length > 1 ? '写真（' + (i + 1) + '枚目）' : '写真')) + '" loading="lazy" decoding="async"></button>';
    }).join('') + '</div>';
  }

  function thankBtn(c) {
    var n = c.thanks, cnt = n ? '<span class="num">' + U.num(n) + '</span>' : '';
    var label = 'ありがとう' + (n ? '（' + U.num(n) + '件）' : '');
    if (c.mine) {
      // 自分のコメントには押せないので、ボタンにしない。もらった数だけ「ありがとう 2件」と文字で見せる（0件なら出さない。
      // 「件」まで書いて、押せるボタンの「ありがとう 2」と見分けられるようにする）
      return n ? '<span class="cmt__got">ありがとう' + cnt + '件</span>' : '';
    }
    if (c.thanked) {
      return '<button type="button" class="cmt__thank is-on" data-feed-thank="' + esc(c.id) + '" aria-pressed="true" aria-disabled="true" aria-label="' +
        esc(label + '・送りました') + '">' + icon('check', 'ico-s') + 'ありがとう' + cnt + '</button>';
    }
    return '<button type="button" class="cmt__thank" data-feed-thank="' + esc(c.id) + '" aria-pressed="false" aria-label="' + esc(label) + '">ありがとう' + cnt + '</button>';
  }

  function cmtMenu(c, postId) {
    var id = 'cp-' + c.id, items;
    if (c.mine) items = popItem('data-feed-cdel', c.id, '削除する', true);
    else {
      items = popItem('data-feed-creport', c.id, '通報する', false, ' data-feed-at="' + esc(postId) + '"');
      if (!c.who.staff) items += popItem('data-feed-mute', c.by, 'この人をミュート', false, ' data-feed-at="' + esc(postId) + '"');
    }
    return '<div class="cmt__more">' +
      '<button type="button" class="iconbtn cmt__menu" data-pop="' + esc(id) + '" aria-expanded="false" aria-controls="' + esc(id) + '" aria-label="' +
        esc(c.who.name + 'さんのコメントのメニュー') + '">' + icon('more') + '</button>' +
      '<div class="pop post__pop" id="' + esc(id) + '" hidden>' + items + '</div>' +
    '</div>';
  }

  /** コメント1件。o.compact はタイムラインの中の「最新2件」（返信・メニューなし。時刻はそのコメントの場所へのリンク） */
  function cmtItem(c, o) {
    o = o || {};
    var who = c.who, reply = !!c.parent, rel = U.relTime(c.at);
    var time = '<time datetime="' + esc(c.at) + '">' + esc(rel) + '</time>';
    // 運営が隠したコメント・隠された投稿（o.locked）には返信できない（ほかの人には元が見えないため）
    var acts = thankBtn(c) + (o.compact || o.locked || c.hidden ? '' :
      '<button type="button" class="cmt__act" data-feed-reply="' + esc(c.id) + '" data-feed-root="' + esc(c.parent || c.id) + '">返信する</button>');
    return '<article class="cmt' + (reply ? ' is-reply' : '') + (c.hidden ? ' is-hidden' : '') + (c.id === freshCmt ? ' is-fresh' : '') + '" id="cmt-' + esc(c.id) + '" aria-label="' +
        esc(who.name + 'さんのコメント') + '">' +
      '<header class="cmt__head">' + U.personLink(who, { size: o.compact ? 'xs' : 's', sub: roleOf(who) }) +
        (o.compact
          ? '<a class="cmt__time" href="' + esc(oneHash(o.postId, c.id)) + '" aria-label="' + esc(who.name + 'さんのコメント（' + rel + '）を開く') + '">' + time + '</a>'
          : '<span class="cmt__time">' + time + '</span>') +
        (o.compact ? '' : cmtMenu(c, o.postId)) +
      '</header>' +
      '<div class="cmt__text">' + U.jp(c.text, { br: true }) + '</div>' +
      // 隠したコメントは、書いた本人にだけ理由つきで見せる（投稿の知らせと同じ「理由：」の形。一覧の中の2件では理由は省く）
      (c.hidden ? '<div class="cmt__hidden"><p>' + sents('運営が非表示にしました。', 'ほかの会員には見えていません。') + '</p>' +
        (c.hidden.reason && !o.compact ? '<p class="cmt__hidden-why">理由：' + esc(c.hidden.reason) + '</p>' : '') + '</div>' : '') +
      (c.answer ? '<p class="cmt__ans"><span class="tag tag-ok">運営が回答に選びました</span></p>' : '') +
      (acts ? '<div class="cmt__acts">' + acts + '</div>' : '') +
      (!o.compact && c.replies && c.replies.length ? '<div class="cmt__replies">' + c.replies.map(function (r) { return cmtItem(r, o); }).join('') + '</div>' : '') +
      (!o.compact && !o.locked && !reply && rdraft && rdraft.post === o.postId && rdraft.root === c.id ? replyForm() : '') +
    '</article>';
  }

  function preview(p) {
    var last = flatten(R.comments(p.id)).slice(-2);
    return '<div class="post__cmts" id="pc-' + esc(p.id) + '">' +
      last.map(function (c) { return cmtItem(c, { compact: true, postId: p.id }); }).join('') +
      // 2件以下なら全部見えているので、そのまま書く欄へ
      '<p class="post__all"><a href="#/feed/' + esc(enc(p.id)) + (p.comments > 2 ? '">すべて見る（' + U.num(p.comments) + '件）' : '?write=1">コメントする') + '</a></p>' +
    '</div>';
  }

  function linkLabel(p, link) {
    if (/^#\/courses\/archive\//.test(link)) return '録画を見る';
    var m = /^#\/(\w+)/.exec(link);
    return (m && ROUTE_LABEL[m[1]]) || LINK_LABEL[p.kind] || '詳しく見る';
  }

  /** 投稿1件。o.detail は投稿1件の画面（コメントは下に全部出すので、ここでは開かない） */
  function postItem(p, o) {
    o = o || {};
    var who = R.person(p.by);
    var sub = who.staff ? roleOf(who) : (who.area || '');
    // 外へ飛ぶリンクは作らない（会員ページの中の画面だけ）
    var link = p.link && /^#\/[\w]/.test(p.link) ? p.link : '';
    // 種類の名前は、その種類でしぼった一覧では出さない（全部に同じ名前が並ぶだけになるため）
    var kindTxt = KIND_LABEL[p.kind] && p.kind !== 'post' && p.kind !== o.kind ? KIND_LABEL[p.kind] : '';
    var rel = U.relTime(p.at), when = '<time datetime="' + esc(p.at) + '">' + esc(rel) + '</time>';
    var n = p.comments, isOpen = !o.detail && open[p.id] && n > 0;
    var cmtCtl = o.detail ? ''
      // aria-controls は開いているときだけ（閉じているあいだ、指す先の要素がないため）
      : n ? '<button type="button" class="post__act post__cmt" data-feed-cmts="' + esc(p.id) + '" aria-expanded="' + (isOpen ? 'true' : 'false') + '"' +
            (isOpen ? ' aria-controls="pc-' + esc(p.id) + '"' : '') + ' aria-label="コメント' + U.num(n) + '件">' + icon('comment') + '<span class="num">' + U.num(n) + '</span></button>'
      : '<a class="post__act post__cmt" href="#/feed/' + esc(enc(p.id)) + '?write=1">' + icon('comment') + '<span>コメントする</span></a>';
    return '<article class="post' + (p.id === lastPosted ? ' is-fresh' : '') + '" id="post-' + esc(p.id) + '" data-post="' + esc(p.id) + '" data-by="' +
        esc(p.by || 'me') + '" aria-label="' + esc(headOf(p)) + '">' +
      '<header class="post__head">' + U.personLink(who, { size: '', sub: sub }) +
        '<p class="post__meta">' + (p.pinned ? '<span class="post__pin">固定</span>' : '') +
          (o.detail ? when : '<a class="post__time" href="#/feed/' + esc(enc(p.id)) + '" aria-label="' + esc(headOf(p) + '（' + rel + '）を開く') + '">' + when + '</a>') +
          (p.edited ? '<span class="post__ed">編集済み</span>' : '') +
        '</p>' +
        postMenu(p, who) +
      '</header>' +
      (kindTxt ? '<p class="post__kind">' + esc(kindTxt) + '</p>' : '') +
      '<div class="post__text">' + U.jp(p.text, { br: true }) + '</div>' +
      postImages(p) +
      (link ? '<p class="post__link"><a href="' + esc(link) + '">' + esc(linkLabel(p, link)) + '</a></p>' : '') +
      '<footer class="post__foot">' +
        '<button type="button" class="post__act post__like' + (p.liked ? ' is-on' : '') + (p.id === popLike ? ' is-pop' : '') + '" data-feed-like="' + esc(p.id) + '"' +
          ' aria-pressed="' + (p.liked ? 'true' : 'false') + '" aria-label="いいね（' + U.num(p.likeCount) + '件）">' +
          icon('heart') + '<span class="num">' + U.num(p.likeCount) + '</span></button>' +
        cmtCtl +
      '</footer>' +
      (isOpen ? preview(p) : '') +
    '</article>';
  }

  /* ---------- 部品：横の列（広い画面）と、上の帯（せまい画面） ---------- */
  function sideData() {
    var rows = R.ranking('points'), mine = rows.filter(function (r) { return r.me; })[0];
    var rank = mine && mine.value ? U.num(R.rankTotal()) + '人中' + mine.rank + '位' : '';
    return {
      rank: rank ? rank + '・' + U.num(mine.value) + 'pt' : '今月のポイントはまだありません',
      rankShort: rank || 'ポイントはまだありません',
      events: R.upcoming().slice(0, 2),
      members: R.members({}).length,
      mutes: R.mutes()
    };
  }
  function evWhen(e) { return U.fmtShort(e.at, true) + (R.isReserved(e.id) ? '・予約済み' : ''); }

  function strip(d) {
    var items = [['#/ranking', '今月のランキング', d.rankShort]]
      .concat(d.events.map(function (e) { return ['#/events/' + enc(e.id), evWhen(e), e.title]; }))
      .concat([['#/members', '会員名簿', U.num(d.members) + '人']]);
    return '<nav class="fstrip" aria-label="あわせて見る"><ul class="fstrip__list">' + items.map(function (x) {
      return '<li><a class="fstrip__it" href="' + esc(x[0]) + '"><span class="fstrip__k">' + esc(x[1]) + '</span>' +
        '<span class="fstrip__v">' + U.jp(x[2]) + '</span></a></li>';
    }).join('') + '</ul></nav>';
  }

  function side(d) {
    return '<aside class="feed-side" aria-label="あわせて見る">' +
      '<div class="list">' +
        '<a class="li" href="#/ranking"><span class="li__body"><span class="li__ttl">今月のランキング</span><span class="li__sub">' + esc(d.rank) + '</span></span>' + U.chevron() + '</a>' +
        '<a class="li" href="#/members"><span class="li__body"><span class="li__ttl">会員名簿</span><span class="li__sub num">' + U.num(d.members) + '人</span></span>' + U.chevron() + '</a>' +
      '</div>' +
      (d.events.length ?
        '<div class="feed-side__head"><h2 class="feed-side__ttl">近いイベント</h2><a href="#/events">すべて見る</a></div>' +
        '<div class="list">' + d.events.map(function (e) {
          return '<a class="li" href="#/events/' + esc(enc(e.id)) + '">' +
            '<span class="li__body"><span class="li__ttl">' + U.jp(e.title) + '</span>' +
            '<span class="li__sub">' + esc(evWhen(e)) + '</span></span>' + U.chevron() + '</a>';
        }).join('') + '</div>' : '') +
      '<div class="feed-rules">' +
        '<h2 class="feed-side__ttl">' + esc(DATA.RULES_TITLE || 'コミュニティのルール') + '</h2>' +
        rulesList() +
        (d.mutes.length ? '<button type="button" class="btn btn-text feed-side__mutes" data-feed-mutes>ミュート中の人（' + d.mutes.length + '人）</button>' : '') +
      '</div>' +
    '</aside>';
  }
  function rulesList() {
    return '<ol class="feed-rules__list">' + DATA.RULES.map(function (r) { return '<li>' + U.jp(r) + '</li>'; }).join('') + '</ol>';
  }
  function mutesList() {
    var list = R.mutes();
    if (!list.length) return '<p class="sub">ミュート中の人はいません。</p>';
    return '<div class="list feed-mutes">' + list.map(function (m) {
      return '<div class="li">' + U.personLink(m.who, { id: m.id, size: 's' }) + '<span class="spacer"></span>' +
        '<button type="button" class="btn btn-soft btn-s" data-feed-unmute="' + esc(m.id) + '">ミュートをやめる</button></div>';
    }).join('') + '</div>';
  }

  /* ---------- 画面：一覧 ---------- */
  /** 入会月でしぼっているときの帯（件数と「条件を外す」） */
  function cohortBar(kind, cohort, n) {
    return '<div class="feed-cohort">' +
      '<p class="feed-cohort__txt"><b>' + esc(cohortName(cohort)) + '</b>の人の' + esc(KIND_LABEL[kind] || '投稿') +
        '<span class="num feed-cohort__n">' + U.num(n) + '件</span></p>' +
      '<a class="feed-cohort__clear" href="' + esc(listHash(kind, 1)) + '" data-focus-after="' + esc("[data-feed-filter='" + kind + "']") + '">条件を外す</a>' +
    '</div>';
  }
  /** 運営が隠した自分の投稿（「自分の投稿」の一覧の上）。ほかの会員には見えていないことと、その投稿へのリンク */
  function hiddenMine(list) {
    if (!list.length) return '';
    return '<div class="notice notice-warn feed-hidden">' + icon('info') +
      '<div><p>' + sents('運営が非表示にした投稿が' + U.num(list.length) + '件あります。', 'ほかの会員には見えていません。') + '</p>' +
        '<ul class="feed-hidden__list">' + list.map(function (p) {
          var t = String(p.text || '').split('\n').filter(function (x) { return x.trim(); })[0] || '';
          return '<li><a href="' + esc(oneHash(p.id)) + '">' + esc(t.length > 30 ? t.slice(0, 30) + '…' : t) + '</a></li>';
        }).join('') + '</ul></div>' +
    '</div>';
  }

  function listPage(ctx) {
    var q = ctx.query || {};
    // #/feed?c=<コメント>：そのコメントがある投稿1件の画面へ移す（描いたあとに移る。見つからなければ一覧のまま知らせる）
    moveTo = null; lostC = false;
    var moving = function (h) {
      moveTo = h;
      return '<div class="scr-feed"><div class="page-head feed-head"><h1 class="page-ttl" data-page-title tabindex="-1">タイムライン</h1></div>' +
        U.skeleton('list', 3) + '</div>';
    };
    if (q.c) {
      var at = postOfComment(String(q.c), q.post ? String(q.post) : '');
      if (at) return moving(oneHash(at, String(q.c)));
      lostC = true;
    } else if (q.post) {
      // 一覧に出ない投稿（運営が隠した自分の投稿・ミュート中の人の投稿）は、知らせのある投稿1件の画面へ
      var hp = R.post(String(q.post));
      if (hp && (hp.hidden || hp.muted)) return moving(oneHash(hp.id));
    }
    var step = introStep(), introOpen = !!(step && !step.done);
    // #/feed?intro=1（スタートガイドなどから）→ 書きかけがなければ、ひな形を入れておく。
    // 書きかけがあるときは消さずに書く欄へ送る（すすめのカードから、確かめてから置きかえられる）
    composeLater = null;
    if (q.intro === '1') {
      if (!draft.text.trim()) { draft.text = R.introText(); draft.kind = 'intro'; draft.auto = false; }
      focusComposer = true;
    } else if (q.compose || q.text) {
      // ほかの画面の「感想を書く」など：種類と書き出しを入れて書く欄へ。
      // 書きかけがあれば消さずに残し、描いたあとの知らせの「置きかえる」で入れかえられるようにする
      var incoming = String(q.text || '').slice(0, MAX), kindIn = KIND_LABEL[q.compose] ? q.compose : '';
      if (!draft.text.trim() || draft.text === incoming) {
        draft.text = incoming;
        if (kindIn) { draft.kind = kindIn; draft.auto = false; }
      } else if (incoming.trim()) composeLater = { text: incoming, kind: kindIn };
      focusComposer = true;
    }
    var kind = filterOf(q), cohort = cohortOf(q, kind), page = Math.max(1, parseInt(q.page, 10) || 1);
    // 「質問」などの種類で絞っているときは、まだ何も書いていなければ書く欄の種類もそれに合わせる。
    // 絞り込みを外したら（すべて・運営から・自分の投稿）、絞り込みで合わせた種類だけを近況に戻す（自分で選んだ種類は残す）
    if (!draft.text.trim() && !(draft.images || []).length) {
      if (KIND_LABEL[kind]) { draft.kind = kind; draft.auto = true; }
      else if (draft.auto) { draft.kind = 'post'; draft.auto = false; }
    }
    var res = pageOf(kind, cohort, page);
    pending = null;
    if (q.post) {
      // 深いリンク：その投稿が出るページまで開く。絞り込みで見えないときは「すべて」で探す
      var find = function (list) {
        for (var i = 0; i < list.length; i++) if (list[i].id === q.post) return i;
        return -1;
      };
      var idx = find(res.all);
      if (idx < 0 && (kind !== 'all' || cohort)) { kind = 'all'; cohort = ''; res = pageOf(kind, '', 1); idx = find(res.all); }
      if (idx >= 0 && Math.floor(idx / PAGE) + 1 > res.page) res = pageOf(kind, cohort, Math.floor(idx / PAGE) + 1);
      pending = { id: String(q.post), found: idx >= 0, hash: listHash(kind, res.page, cohort) };
    }
    page = res.page;
    var d = sideData();
    var hidden = kind === 'mine' ? myHidden() : [];
    var empty = cohort
      ? U.empty('', cohortName(cohort) + 'の人の' + (KIND_LABEL[kind] || '投稿') + 'はまだありません',
          { href: listHash(kind, 1), label: 'すべての' + (KIND_LABEL[kind] || '投稿') + 'を見る' })
      : U.empty('', hidden.length ? 'ほかの会員に見えている投稿はありません' : EMPTY[kind]);

    return '<div class="scr-feed">' +
      '<div class="page-head feed-head"><h1 class="page-ttl" data-page-title tabindex="-1">タイムライン</h1>' +
        '<button type="button" class="btn btn-text feed-head__rules" data-feed-rules>' + esc(DATA.RULES_TITLE || 'コミュニティのルール') + '</button></div>' +
      '<div class="feed-layout">' +
        '<div class="feed-main">' +
          strip(d) +
          (introOpen && showIntroCard() ? introCard() : '') +
          composer() +
          chips(kind) +
          (cohort && res.total ? cohortBar(kind, cohort, res.total) : '') +
          hiddenMine(hidden) +
          '<div class="feed-list">' +
            (res.shown.length ? res.shown.map(function (p) { return postItem(p, { kind: kind }); }).join('') : empty) +
          '</div>' +
          (res.next
            ? '<p class="feed-more"><a class="btn btn-ghost" href="' + esc(listHash(kind, page + 1, cohort)) + '" data-focus-after="' +
                esc("[data-post='" + res.next.id + "']") + '">これより前の投稿を見る</a></p>'
            : res.total ? '<p class="feed-end">これより前の投稿はありません</p>' : '') +
        '</div>' +
        side(d) +
      '</div>' +
    '</div>';
  }

  /* ---------- 画面：投稿1件 ---------- */
  function replyForm() {
    return '<form class="cmt-form cmt-form--reply" data-feed-rform novalidate>' +
      '<label class="cmt-form__to" for="cmtReplyTa">' + esc(rdraft.name) + 'さんへの返信</label>' +
      '<textarea id="cmtReplyTa" class="textarea cmt-form__ta" rows="2" maxlength="' + MAX + '" aria-describedby="cmtReplyErr">' + esc(rdraft.text) + '</textarea>' +
      '<p class="form-err" id="cmtReplyErr" role="alert"></p>' +
      '<div class="cmt-form__foot">' +
        '<button type="button" class="btn btn-soft btn-s" data-feed-reply-cancel="' + esc(rdraft.to) + '">やめる</button>' +
        '<button type="submit" class="btn btn-ink btn-s" aria-keyshortcuts="Meta+Enter Control+Enter">返信する</button>' +
      '</div>' +
    '</form>';
  }
  function commentForm(p) {
    var text = cdraft.post === p.id ? cdraft.text : '';
    return '<form class="card cmt-form cmt-form--new" data-feed-cform novalidate>' +
      '<div class="cmt-form__row">' + U.avatar(R.person('me'), 's') +
        '<div class="cmt-form__main">' +
          '<label class="sr-only" for="cmtTa">コメント</label>' +
          '<textarea id="cmtTa" class="textarea cmt-form__ta" rows="2" maxlength="' + MAX + '" placeholder="コメントを書く" aria-describedby="cmtErr">' + esc(text) + '</textarea>' +
          '<p class="form-err" id="cmtErr" role="alert"></p>' +
        '</div>' +
      '</div>' +
      '<div class="cmt-form__foot"><button type="submit" class="btn btn-primary" aria-keyshortcuts="Meta+Enter Control+Enter">コメントする</button></div>' +
    '</form>';
  }
  function mutedNotice(who, by) {
    return '<div class="notice notice-warn feed-muted">' + icon('info') +
      '<div>' + sents(who.name + 'さんをミュートしています。', 'この人の投稿は、タイムラインに出ません。') + '</div>' +
      '<button type="button" class="btn btn-soft btn-s" data-feed-unmute="' + esc(by) + '">ミュートをやめる</button></div>';
  }

  /** 運営が隠した自分の投稿（本人にだけ見える）。理由と、運営に聞く先 */
  function hiddenNotice(h) {
    return '<div class="notice notice-warn feed-hidden">' + icon('info') +
      '<div><p>' + sents('運営がこの投稿を非表示にしました。', 'ほかの会員には見えていません。') + '</p>' +
        (h.reason ? '<p class="feed-hidden__why">理由：' + esc(h.reason) + '</p>' : '') +
        '<p class="feed-hidden__act"><a class="btn btn-soft btn-s" href="#/messages?kind=' + enc('質問') + '">運営に聞く</a></p></div></div>';
  }

  function detailPage(ctx, id) {
    var p = R.post(id);
    if (!p) return U.notFound({ lead: 'この投稿は削除されたか、見られなくなっています。' });
    var top = R.comments(p.id), n = p.comments;
    if (rdraft && (rdraft.post !== p.id || p.hidden)) rdraft = null;
    return '<div class="scr-feed scr-feed--one">' +
      '<p class="crumb"><a href="#/feed">タイムライン</a></p>' +
      '<div class="page-head"><h1 class="page-ttl" data-page-title tabindex="-1">' + esc(headOf(p)) + '</h1></div>' +
      (p.hidden ? hiddenNotice(p.hidden) : p.muted ? mutedNotice(R.person(p.by), p.by) : '') +
      '<div class="feed-list">' + postItem(p, { detail: true }) + '</div>' +
      '<section class="thread" aria-labelledby="threadTtl">' +
        '<h2 class="sec-ttl" id="threadTtl"><span>コメント' + (n ? '<span class="num">' + U.num(n) + '</span>件' : '') + '</span></h2>' +
        (top.length
          ? '<div class="card thread__list">' + top.map(function (c) { return cmtItem(c, { postId: p.id, locked: !!p.hidden }); }).join('') + '</div>'
          : '<p class="thread__none">まだコメントはありません。</p>') +
        // 隠された投稿にはコメントを足さない（ほかの人には投稿ごと見えないため）
        (p.hidden ? '' : commentForm(p)) +
      '</section>' +
    '</div>';
  }

  function resetDrafts() {
    draft = { text: '', kind: 'post', images: [] };
    cdraft = { post: null, text: '' };
    rdraft = null; open = {};
    draftOwner = CLG.store.state.me.id;
  }

  /* ---------- 入力欄の見た目を、描き直さずに合わせる（打っている途中で入力欄が消えないように） ---------- */
  function autosize(ta, max) {
    if (!ta) return;
    max = max || 360;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight + 2, max) + 'px';
    ta.style.overflowY = ta.scrollHeight + 2 > max ? 'auto' : 'hidden';
  }
  function syncComposer(form) {
    if (!form) return;
    var ta = form.querySelector('#feedText'), k = draft.kind, st = sendState();
    U.$$('[data-feed-kind]', form).forEach(function (b) {
      var on = b.getAttribute('data-feed-kind') === k;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    ta.placeholder = PLACEHOLDER[k] || PLACEHOLDER.post;
    form.querySelector('.composer__send').disabled = st.disabled;
    form.querySelector('#feedWhy').textContent = st.why;
    var cnt = form.querySelector('#feedCount');
    cnt.textContent = st.count; cnt.classList.toggle('is-over', st.over);
    autosize(ta);
  }
  /** ひな形の最初の空欄（「：」で終わる行）にカーソルを置く */
  function caretToBlank(ta) {
    var m = BLANK.exec(ta.value);
    var pos = m ? m.index + 1 : ta.value.length;
    try { ta.focus({ preventScroll: true }); } catch (e) { ta.focus(); }
    try { ta.setSelectionRange(pos, pos); } catch (e) {}
  }
  function err(el, text) {
    if (!el) return;
    el.innerHTML = text ? icon('info', 'ico-s') + '<span>' + esc(text) + '</span>' : '';
  }

  /* ---------- 写真：端末で小さくしてから持つ（保存先が5MBほどのため） ---------- */
  function shrink(file) {
    return new Promise(function (resolve, reject) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type || '')) { reject('写真はJPEGかPNGを選んでください'); return; }
      var fr = new FileReader();
      fr.onerror = function () { reject('写真を読み込めませんでした'); };
      fr.onload = function () {
        var img = new Image();
        img.onerror = function () { reject('写真を読み込めませんでした'); };
        img.onload = function () {
          var limit = (R.imageLimit && R.imageLimit.bytes) || 600000, side = 1280, url = '';
          for (var t = 0; t < 4; t++) {
            var k = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
            var c = document.createElement('canvas');
            c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
            var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
            url = c.toDataURL('image/jpeg', 0.8);
            if (url.length <= limit) break;
            side = Math.round(side * 0.75);
          }
          if (url.length > limit) reject('写真が大きすぎます'); else resolve(url);
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  function addFiles(files) {
    var room = IMG_MAX - draft.images.length, list = Array.prototype.slice.call(files || []);
    if (!list.length) return;
    if (list.length > room) U.toast('写真は' + IMG_MAX + '枚までです。' + (room > 0 ? '最初の' + room + '枚を付けます' : ''), room > 0 ? null : 'error');
    list = list.slice(0, Math.max(0, room));
    if (!list.length) return;
    reading += list.length;
    syncComposer(document.querySelector('.scr-feed [data-feed-form]'));
    var owner = draftOwner, done = 0;
    list.forEach(function (f) {
      shrink(f).then(function (src) {
        if (owner === draftOwner && draft.images.length < IMG_MAX) draft.images.push({ src: src });
      }, function (msg) { U.toast(msg, 'error'); }).then(function () {
        reading = Math.max(0, reading - 1);
        if (++done === list.length && cur && cur.name === 'feed' && !cur.params[0]) cur.refresh({ focus: '[data-feed-photo]' });
      });
    });
  }

  /* ---------- 投稿する ---------- */
  function doPost(text) {
    posting = true;
    var name = R.person('me').name, n = draft.images.length;
    var imgs = draft.images.map(function (im, i) { return { src: im.src, alt: name + 'さんの写真' + (n > 1 ? '（' + (i + 1) + '枚目）' : '') }; });
    var res = R.addPost(text, draft.kind, imgs);
    posting = false;
    if (!res) { U.toast('投稿できませんでした。もう一度お試しください', 'error'); return; }
    lastPosted = res.post || null;
    draft = { text: '', kind: 'post', images: [] };
    CLG.app.reward(res);
    if (!res.xp && !res.pt && !res.levelUp) U.toast('投稿しました。今日のXPは上限に達しています');
    // 絞り込み中でも、自分の投稿が見えるように「すべて」の先頭へ戻す
    cur.go('#/feed');
  }
  function submitPost(form) {
    var ta = form.querySelector('#feedText'), text = ta.value;
    if (posting || reading) return;
    if (!text.trim()) { ta.focus(); return; }
    // ひな形の空欄を残したまま出してしまわないよう、1回だけ確かめる
    var label = draft.kind === 'intro' && BLANK.test(text) ? blankLabel(text) : '';
    if (!label) { doPost(text); return; }
    posting = true;
    U.confirmBox('まだ空いているところがあります', '「' + label + '」が空いたままです。このまま投稿しますか？', 'このまま投稿する')
      .then(function (ok) {
        posting = false;
        if (ok) doPost(text); else { var t = document.getElementById('feedText'); if (t) caretToBlank(t); }
      });
  }

  /* ---------- コメント・返信 ---------- */
  function sendComment(form, reply) {
    var postId = cur.params[0], ta = form.querySelector('textarea'), text = ta.value;
    var e = form.querySelector('.form-err');
    if (!text.trim()) { err(e, reply ? '返信を書いてください' : 'コメントを書いてください'); ta.focus(); return; }
    var res = R.addComment(postId, text, reply ? rdraft.to : null);
    if (!res || !res.ok) { err(e, (res && res.error) || '送れませんでした'); ta.focus(); return; }
    freshCmt = res.id;
    if (reply) rdraft = null; else cdraft = { post: postId, text: '' };
    if (res.pt) CLG.app.reward(res); else U.toast(reply ? '返信しました' : 'コメントしました', 'ok');
    // 返信の欄は消えるので、書いたコメントへ。下の欄は続けて書けるように残す
    cur.refresh(reply ? { focus: '#cmt-' + res.id } : { focus: '#cmtTa' });
  }
  function thank(id) {
    var res = R.thankComment(id);
    if (!res || !res.ok) { U.toast('ありがとうは1つのコメントに1回だけ送れます'); return; }
    U.toast('ありがとうを送りました' + (res.toPt && res.to ? '（' + res.to.name + 'さんに+' + res.toPt + 'pt）' : ''), 'ok');
    cur.refresh();
  }

  /* ---------- メニューの動き（編集・削除・通報・ミュート） ---------- */
  /** 消えた投稿の次に焦点を置く先（なければ見出し） */
  function nextPostSel(id, skipBy) {
    var arts = U.$$('.scr-feed .feed-list > .post'), i, at = -1;
    for (i = 0; i < arts.length; i++) if (arts[i].getAttribute('data-post') === id) at = i;
    var pick = function (from, step) {
      for (var j = from; j >= 0 && j < arts.length; j += step) {
        if (arts[j].getAttribute('data-post') === id) continue;
        if (skipBy && arts[j].getAttribute('data-by') === skipBy) continue;
        return arts[j].getAttribute('data-post');
      }
      return null;
    };
    var next = at >= 0 ? pick(at + 1, 1) || pick(at - 1, -1) : pick(0, 1);
    return next ? "[data-post='" + next + "']" : '[data-page-title]';
  }
  function editPost(id) {
    var p = R.post(id);
    if (!p) return;
    var m = U.modal(
      '<form data-feed-editform novalidate>' +
        '<label class="sr-only" for="feedEditTa">本文</label>' +
        '<textarea id="feedEditTa" class="textarea feed-edit__ta" rows="7" maxlength="' + MAX + '" aria-describedby="feedEditErr">' + esc(p.text) + '</textarea>' +
        '<p class="form-err" id="feedEditErr" role="alert"></p>' +
      '</form>',
      { title: '投稿を編集', cls: 'scr-feed', dirty: true,
        foot: '<button type="button" class="btn btn-soft" data-close>やめる</button><button type="button" class="btn btn-primary" data-feed-save>保存する</button>' });
    var ta = m.querySelector('textarea'), e = m.querySelector('.form-err');
    function save() {
      if (!ta.value.trim()) { err(e, '本文を入れてください'); ta.focus(); return; }
      if (!R.editPost(id, ta.value)) { err(e, '保存できませんでした'); return; }
      m.close();
      U.toast('投稿を直しました', 'ok');
      cur.refresh();
    }
    m.querySelector('[data-feed-save]').addEventListener('click', save);
    m.querySelector('form').addEventListener('submit', function (ev) { ev.preventDefault(); save(); });
    ta.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey) && !ev.isComposing) { ev.preventDefault(); save(); } });
  }
  function delPost(id) {
    U.confirmBox('投稿を削除しますか', 'コメントといいねも見えなくなります。元には戻せません。', '削除する', true).then(function (ok) {
      if (!ok) return;
      var sel = nextPostSel(id);
      if (!R.deletePost(id)) { U.toast('削除できませんでした', 'error'); return; }
      U.toast('投稿を削除しました');
      if (cur.params[0]) cur.go('#/feed'); else cur.refresh({ focus: sel });
    });
  }
  /** popId は押したメニューの印（窓を開かずに終わるとき、焦点をメニューのボタンへ戻すため） */
  function report(postId, commentId, popId) {
    var reasons = R.REPORT_REASONS || ['その他'];
    var target = commentId ? 'コメント' : '投稿';
    // 受付中の通報がある（運営が確かめている）ものは、窓を開かずにそう知らせる
    if (reported(postId, commentId)) {
      U.toast('この' + target + 'は通報済みです。運営が確かめています');
      var t = popId && document.querySelector('.scr-feed [data-pop="' + popId + '"]');
      if (t) t.focus();
      return;
    }
    var m = U.modal(
      '<form data-feed-repform novalidate>' +
        '<p class="sub feed-report__lead">' + sents('運営だけに届きます。', '書いた人には知らされません。') + '</p>' +
        '<fieldset class="feed-report__reasons" aria-describedby="feedRepErr"><legend class="field__label">理由</legend>' +
          reasons.map(function (r, i) {
            return '<label class="check"><input type="radio" name="reason" value="' + esc(r) + '"' + (i === 0 ? ' required' : '') + '><span>' + esc(r) + '</span></label>';
          }).join('') +
        '</fieldset>' +
        '<p class="form-err" id="feedRepErr" role="alert"></p>' +
      '</form>',
      { title: target + 'を通報する', cls: 'scr-feed',
        foot: '<button type="button" class="btn btn-soft" data-close>やめる</button><button type="button" class="btn btn-primary" data-feed-repsend>通報する</button>' });
    function send() {
      var picked = m.querySelector('input[name="reason"]:checked');
      if (!picked) { err(m.querySelector('.form-err'), '理由を選んでください'); var f = m.querySelector('input[name="reason"]'); if (f) f.focus(); return; }
      var res = R.reportPost(postId, picked.value, commentId || null);
      if (!res || !res.ok) { err(m.querySelector('.form-err'), (res && res.error) || '送れませんでした'); return; }
      m.close();
      U.toast(res.existing ? 'この' + target + 'は通報済みです。運営が確かめています' : '運営に知らせました。対応が決まったらお知らせします', 'ok');
    }
    m.querySelector('[data-feed-repsend]').addEventListener('click', send);
    m.querySelector('form').addEventListener('submit', function (ev) { ev.preventDefault(); send(); });
  }
  function unmute(pid) {
    var who = R.person(pid);
    R.unmutePerson(pid);
    U.toast(who.name + 'さんのミュートをやめました');
  }
  /** popId は押したメニューのボタンの印（元に戻したとき、そのメニューのボタンへ焦点を戻すため） */
  function mute(pid, postId, popId) {
    var who = R.person(pid);
    U.confirmBox(who.name + 'さんをミュートしますか', 'この人の投稿とコメントが、タイムラインに出なくなります。相手には知らされません。', 'ミュートする', false, { kind: 'ink' })
      .then(function (ok) {
        if (!ok) return;
        var sel = cur.params[0] ? null : nextPostSel(postId, pid);
        if (!R.mutePerson(pid)) { U.toast('この人はミュートできません', 'error'); return; }
        U.toast(who.name + 'さんをミュートしました', null, { action: '元に戻す', onAction: function () {
          unmute(pid);
          CLG.app.refresh(popId ? { focus: '[data-pop="' + popId + '"]' } : undefined);
        } });
        cur.refresh(sel ? { focus: sel } : undefined);
      });
  }
  function delComment(id) {
    U.confirmBox('コメントを削除しますか', '元には戻せません。', '削除する', true).then(function (ok) {
      if (!ok) return;
      if (!R.deleteComment(id)) { U.toast('削除できませんでした', 'error'); return; }
      U.toast('コメントを削除しました');
      cur.refresh({ focus: '#cmtTa' });
    });
  }
  function rulesBox() {
    var mutes = R.mutes();
    U.modal(rulesList() +
      (mutes.length ? '<h3 class="feed-mutes__ttl">ミュート中の人</h3>' + mutesList() : ''),
      { title: DATA.RULES_TITLE || 'コミュニティのルール', foot: true, cls: 'scr-feed feed-rules-box' });
  }
  function mutesBox() {
    U.modal(mutesList(), { title: 'ミュート中の人', foot: true, cls: 'scr-feed' });
  }
  function viewImage(postId, i) {
    var p = R.post(postId), list = p ? imagesOf(p) : [], im = list[i];
    if (!im) return;
    U.modal('<img class="feed-viewer__img" src="' + esc(im.src) + '" alt="' + esc(im.alt || '') + '">',
      { title: '写真' + (list.length > 1 ? '（' + (i + 1) + '/' + list.length + '）' : ''), wide: true, foot: true, cls: 'scr-feed feed-viewer' });
  }

  /* ほかの画面へ移ったら「来たばかり」の印を戻す（戻ってきたときに、また深いリンクの目印を付けるため） */
  if (window.addEventListener) {
    window.addEventListener('hashchange', function () {
      if (!/^#\/feed(\/|\?|$)/.test(String(location.hash || ''))) lastKey = null;
    });
  }

  /* 窓の中の「ミュートをやめる」（窓は #view の外なので、document で拾う） */
  if (document.addEventListener) document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('.modal [data-feed-unmute]');
    if (!b) return;
    var id = b.getAttribute('data-feed-unmute'), row = b.closest('.li'), box = b.closest('.list'), m = b.closest('.modal');
    var next = row && (row.nextElementSibling || row.previousElementSibling);
    unmute(id);
    if (row) row.parentNode.removeChild(row);
    if (box && !box.querySelector('.li')) box.outerHTML = '<p class="sub">ミュート中の人はいません。</p>';
    // 押したボタンは消えるので、隣の人の「ミュートをやめる」か、窓の「閉じる」へ
    var to = (next && next.querySelector('[data-feed-unmute]')) || (m && m.querySelector('.modal__foot [data-close]'));
    if (to) to.focus();
    CLG.app.refresh();
  });

  /* ---------- 押したときの動き（#view に1回だけ付ける） ---------- */
  function onClick(e) {
    var t = e.target, b;
    if (!t.closest || !t.closest('.scr-feed')) return;
    if ((b = t.closest('[data-feed-kind]'))) {
      var ta = document.getElementById('feedText');
      draft.kind = b.getAttribute('data-feed-kind'); draft.auto = false;
      if (draft.kind === 'intro' && ta && !ta.value.trim()) {
        ta.value = R.introText(); draft.text = ta.value;
        syncComposer(b.closest('form')); caretToBlank(ta);
      } else syncComposer(b.closest('form'));
      // 上のすすめのカードはここでは消さない（押した場所の上で入力欄が動いてしまうため。次に描き直すときに合わせる）
      return;
    }
    if ((b = t.closest('[data-feed-intro]'))) {
      var now = draft.text.trim(), tpl = R.introText();
      var apply = function () { draft.text = tpl; draft.kind = 'intro'; draft.auto = false; focusComposer = true; cur.refresh(); };
      if (now && now !== tpl.trim()) {
        U.confirmBox('書きかけの文章があります', '自己紹介のひな形に置きかえます。いま書いている文章は消えます。', '置きかえる')
          .then(function (ok) { if (ok) apply(); });
      } else apply();
      return;
    }
    if ((b = t.closest('[data-feed-filter]'))) {
      var k = b.getAttribute('data-feed-filter');
      cur.go(listHash(k, 1));
      return;
    }
    if ((b = t.closest('[data-feed-like]'))) {
      var id = b.getAttribute('data-feed-like');
      popLike = R.toggleLike(id) ? id : null;
      cur.refresh();
      return;
    }
    if ((b = t.closest('[data-feed-cmts]'))) {
      var pid = b.getAttribute('data-feed-cmts');
      open[pid] = !open[pid];
      cur.refresh();
      return;
    }
    if ((b = t.closest('[data-feed-thank]'))) {
      if (b.getAttribute('aria-disabled') === 'true') { U.toast('ありがとうは1つのコメントに1回だけ送れます'); return; }
      thank(b.getAttribute('data-feed-thank'));
      return;
    }
    if ((b = t.closest('[data-feed-reply]'))) {
      var to = b.getAttribute('data-feed-reply'), root = b.getAttribute('data-feed-root');
      var art = document.getElementById('cmt-' + to), nm = art && art.querySelector('.plink__name');
      var keep = rdraft && rdraft.root === root ? rdraft.text : '';
      rdraft = { post: cur.params[0], root: root, to: to, name: nm ? nm.textContent : '', text: keep };
      cur.refresh({ focus: '#cmtReplyTa' });
      return;
    }
    if ((b = t.closest('[data-feed-reply-cancel]'))) {
      var back = b.getAttribute('data-feed-reply-cancel');
      rdraft = null;
      cur.refresh({ focus: "[data-feed-reply='" + back + "']" });
      return;
    }
    if ((b = t.closest('[data-feed-photo]'))) { var f = document.getElementById('feedFile'); if (f) { f.value = ''; f.click(); } return; }
    if ((b = t.closest('[data-feed-unimg]'))) {
      draft.images.splice(+b.getAttribute('data-feed-unimg'), 1);
      cur.refresh();
      return;
    }
    if ((b = t.closest('[data-feed-img]'))) { viewImage(b.getAttribute('data-feed-img'), +b.getAttribute('data-feed-i') || 0); return; }
    if ((b = t.closest('[data-feed-edit]'))) { editPost(b.getAttribute('data-feed-edit')); return; }
    if ((b = t.closest('[data-feed-del]'))) { delPost(b.getAttribute('data-feed-del')); return; }
    if ((b = t.closest('[data-feed-report]'))) { report(b.getAttribute('data-feed-report'), null, 'fp-' + b.getAttribute('data-feed-report')); return; }
    if ((b = t.closest('[data-feed-creport]'))) { report(b.getAttribute('data-feed-at'), b.getAttribute('data-feed-creport'), 'cp-' + b.getAttribute('data-feed-creport')); return; }
    if ((b = t.closest('[data-feed-cdel]'))) { delComment(b.getAttribute('data-feed-cdel')); return; }
    if ((b = t.closest('[data-feed-mute]'))) {
      var pop = b.closest('.pop');
      mute(b.getAttribute('data-feed-mute'), b.getAttribute('data-feed-at'), pop ? pop.id : '');
      return;
    }
    if ((b = t.closest('[data-feed-unmute]'))) { unmute(b.getAttribute('data-feed-unmute')); cur.refresh({ focus: '[data-page-title]' }); return; }
    if ((b = t.closest('[data-feed-rules]'))) { rulesBox(); return; }
    if ((b = t.closest('[data-feed-mutes]'))) { mutesBox(); return; }
  }
  function onInput(e) {
    var t = e.target;
    if (!t.closest || !t.closest('.scr-feed')) return;
    if (t.id === 'feedText') { draft.text = t.value; syncComposer(t.closest('form')); }
    else if (t.id === 'cmtTa') { cdraft = { post: cur.params[0], text: t.value }; err(document.getElementById('cmtErr'), ''); autosize(t, 280); }
    else if (t.id === 'cmtReplyTa' && rdraft) { rdraft.text = t.value; err(document.getElementById('cmtReplyErr'), ''); autosize(t, 240); }
  }
  function onKey(e) {
    var t = e.target;
    if (!t.closest || !t.closest('.scr-feed') || t.tagName !== 'TEXTAREA') return;
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.isComposing) {
      e.preventDefault();
      var form = t.closest('form');
      if (form && form.requestSubmit) form.requestSubmit(); else if (form) onSubmit({ target: form, preventDefault: function () {} });
    } else if ((e.key === 'Escape' || e.key === 'Esc') && t.id === 'cmtReplyTa' && !t.value.trim() && !e.isComposing) {
      var back = rdraft && rdraft.to;
      rdraft = null;
      cur.refresh({ focus: "[data-feed-reply='" + back + "']" });
    }
  }
  function onSubmit(e) {
    var f = e.target;
    if (!f.closest || !f.closest('.scr-feed')) return;
    if (f.matches('[data-feed-form]')) { e.preventDefault(); submitPost(f); }
    else if (f.matches('[data-feed-cform]')) { e.preventDefault(); sendComment(f, false); }
    else if (f.matches('[data-feed-rform]')) { e.preventDefault(); sendComment(f, true); }
  }
  function onChange(e) {
    if (e.target && e.target.id === 'feedFile') addFiles(e.target.files);
  }

  /** 描いたあとにすること（来たばかりのときだけ：深いリンクの場所へ送る・目印・書く欄へ） */
  function mark(el) {
    if (!el) return;
    el.classList.remove('is-target'); void el.offsetWidth; el.classList.add('is-target');
    // 窓（お知らせ・ポイントの記録）のリンクから来たときは、窓が閉じてから焦点を置く（閉じる前は本文が inert のため）
    setTimeout(function () { if (el.isConnected) U.smoothScroll(el, { block: 'center', focus: true }); }, 0);
  }
  /** 履歴を増やさずに別の場所へ移る（?c= の移しかえ。戻るボタンで移しかえの前に戻らないように） */
  function moveHash(h) {
    try { location.replace(h); } catch (e) { location.hash = h; }
  }
  /** 深いリンクの行き先がなかったとき。窓から来ると焦点がどこにもなくなるので、見出しに置く */
  function keepFocus(scope) {
    setTimeout(function () {
      var a = document.activeElement, h = scope.querySelector('[data-page-title]');
      if (h && h.isConnected && (!a || a === document.body)) { try { h.focus({ preventScroll: true }); } catch (e) { h.focus(); } }
    }, 0);
  }
  function afterRender(root, ctx) {
    var el = root.querySelector('.scr-feed');
    var arrived = lastKey !== ctx.key;
    lastKey = ctx.key;
    if (!el) return;
    var q = ctx.query || {};
    if (ctx.params[0]) {
      var id = ctx.params[0];
      autosize(document.getElementById('cmtTa'), 280);
      autosize(document.getElementById('cmtReplyTa'), 240);
      if (q.c) {
        var c = document.getElementById('cmt-' + q.c);
        if (c) mark(c);
        else {
          // 別の投稿のコメントの id で来たときは、そのコメントがある投稿へ移しかえる
          var other = postOfComment(String(q.c), '');
          if (other && other !== id) { moveHash(oneHash(other, String(q.c))); return; }
          U.toast('このコメントは削除されたか、見られなくなっています'); keepFocus(el);
        }
      } else if (arrived && !q.write) {
        var p = el.querySelector('.post');
        if (p) { p.classList.add('is-target'); }
      }
      if (q.write) { var ta = document.getElementById('cmtTa'); if (ta) { U.smoothScroll(ta.closest('form'), { block: 'center' }); try { ta.focus({ preventScroll: true }); } catch (x) { ta.focus(); } } }
      if (q.c || q.write) replaceHash('#/feed/' + enc(id));
      return;
    }
    // #/feed?c=<コメント>：そのコメントがある投稿へ（履歴を増やさずに移る）
    if (moveTo) { var to = moveTo; moveTo = null; moveHash(to); return; }
    autosize(document.getElementById('feedText'));
    var kind = filterOf(q);
    if (lostC) { lostC = false; U.toast('このコメントは削除されたか、見られなくなっています'); keepFocus(el); }
    if (composeLater) {
      var later = composeLater;
      composeLater = null;
      U.toast('書きかけの投稿を残しています', null, { action: '置きかえる', onAction: function () {
        draft.text = later.text; if (later.kind) { draft.kind = later.kind; draft.auto = false; } focusComposer = true;
        CLG.app.refresh({ focus: '#feedText' });
      } });
    }
    // ?intro=1 と ?post= は一度だけ効かせる。残したままだと、投稿後の描き直しでまた効いてしまう
    if (pending) {
      var target = pending.found ? el.querySelector("[data-post='" + String(pending.id).replace(/'/g, '') + "']") : null;
      if (target) mark(target); else { U.toast('この投稿は削除されたか、見られなくなっています'); keepFocus(el); }
      replaceHash(pending.hash);
      pending = null;
    } else if (q.intro || q.compose || q.text || q.c) {
      replaceHash(listHash(kind, parseInt(q.page, 10) || 1, cohortOf(q, kind)));
    }
    if (focusComposer) {
      focusComposer = false;
      var t = document.getElementById('feedText');
      if (t) { caretToBlank(t); try { t.closest('form').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (x) {} }
    }
    // せまい画面では絞り込みが横に流れる。選んでいる札が見える位置まで送っておく
    var strip = el.querySelector('.feed-chips'), onChip = strip && strip.querySelector('.is-on');
    if (onChip && strip.scrollWidth > strip.clientWidth) strip.scrollLeft = Math.max(0, onChip.offsetLeft - 16);
  }

  CLG.screens.feed = {
    title: function (ctx) {
      if (!ctx.params[0]) return 'タイムライン';
      var p = R.post(ctx.params[0]);
      return p ? headOf(p) : 'ページが見つかりません';
    },
    back: function (ctx) { return ctx.params[0] ? { href: '#/feed', label: 'タイムライン' } : null; },

    render: function (ctx) {
      if (draftOwner !== CLG.store.state.me.id) resetDrafts();
      return ctx.params[0] ? detailPage(ctx, ctx.params[0]) : listPage(ctx);
    },

    mount: function (root, ctx) {
      cur = ctx;
      afterRender(root, ctx);
      // 目立たせるのは描いた1回だけ
      lastPosted = null; popLike = null; freshCmt = null;
      if (root.__boundFeed) return;
      root.__boundFeed = true;
      root.addEventListener('click', onClick);
      root.addEventListener('input', onInput);
      root.addEventListener('keydown', onKey);
      root.addEventListener('submit', onSubmit);
      root.addEventListener('change', onChange);
    }
  };
})();
