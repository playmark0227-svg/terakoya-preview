/* ============================================================
   公開サイト（サービス紹介・入会の申込み・お問い合わせ・表記）
   ------------------------------------------------------------
   - ヘッダーとフッターは描き直さず、#site-main だけを描き直す。
   - 屋号はロゴ（U.brandmark。包むリンクの aria-label が「TAISEI トップへ」なのでロゴは読み上げない）。文字で要るとき（題・契約の条件・
     規約）は BRAND（SITE.name。SITE.note があるときだけ「（注記）」を付ける）。合言葉 SITE.tagline はフッターのロゴの下に1回だけ、
     名前の由来の1文は #/about の「運営会社」の下に1回だけ。どちらも収入・紹介の話の隣には置かない。
   - URL：#/（紹介）、#/join（申込み）、#/contact（お問い合わせ）、#/about（運営と講師）、#/company（運営会社）、
          #/curriculum（講座の一覧。?c=<講座id> でその講座へ）、#/news（お知らせ）、#/tokushoho、#/terms（?art=<条の番号> でその条へ）、#/privacy。
          #/faq・#/price など区切りの名前だけのものは、紹介ページのその場所へ。知らない名前は「ページが見つかりません」。
   - 申込みの段は URL に持つ：#/join → ?step=confirm → ?step=pay → ?step=done。ブラウザの戻る・進むで段を行き来できる。
     決済が済んだら完了の段で履歴を置き換え、戻るで決済の段が開き直らないようにする。完了のあとの戻るは、
     使えなくなった前の段を飛ばして、申込みより前のページまで戻す（skipBack）。
     入力中の内容はこのタブの sessionStorage に置き、読み込み直しても消えない。お問い合わせも同じ形（?step=confirm|sent）。
     Stripe から戻った（やめた）ときは #/join?step=pay&canceled=1。再入会は #/join?rejoin=1（会員ページの R.rejoinLink）。
   - ページ内の移動は data-scroll で行う（#id のリンクにすると画面の切り替えと混ざるため）。
   - 料金と契約の条件は COND に一か所で持つ。紹介・確認画面・特商法・規約で文言をそろえるため。
     講座の数と開き方は DATA.SITE.contentLine（全部を最初から見られるとは書かない。レベルで順に開くため）。
   - 紹介の報酬のことは、この紹介ページには書かない（収入を目的に入会を勧めない）。
   - 押したときの印は data-site / data-join / data-contact（会員ページの data-act とは分ける）。
   - 画面の見本は会員ページの実際のスクリーンショット（assets/img/shot-*.webp。tools/lp-images.js で撮る）。
     SHOTS の top は上の帯（56px）を切る高さ、h は見せる高さ（どちらも幅390のときの px）。撮り直したら h を合わせる。
   ============================================================ */
(function (global) {
  'use strict';
  var CLG = global.CLG, U = CLG.ui, DATA = CLG.DATA, SITE = DATA.SITE;
  var R = CLG.rules || null;          // domain.js（紹介コードの確認・再入会）。読み込まれていなくても紹介ページは出す
  var esc = U.esc, icon = U.icon;
  /** 数と単位（「1か月」「10,000円」「10:00〜18:00」）は行の途中で割らない。
      狭い画面の長い文は文節で折らずに行を埋める（site.css）ので、U.jp の上でここでも守る */
  var NUM_RE = /((?:毎月|毎週|[全第月週毎約])?\d[\d,]*(?:\.\d+)?(?:〜\d[\d,]*)?(?:分|円|本|回|人|名|件|日|か月|時間|秒|XP|pt|%)|\d{1,2}:\d{2}(?:〜\d{1,2}:\d{2})?)/g;
  // カタカナの長い言葉も途中で割らない（「Webデザイ／ン」のような折れ方を防ぐ）
  var NW_WORDS = ['Webデザイン', 'オリエンテーション', 'タイムライン', 'フリーランス', 'プライバシーポリシー', 'スタートガイド', 'アカウント', 'オンライン', 'イベント', 'サービス', 'スタッフ'];
  function jp(s) {
    var h = U.jp(s).replace(NUM_RE, '<span class="site-nw">$1</span>');
    NW_WORDS.forEach(function (w) { h = h.split(w).join('<span class="site-nw">' + w + '</span>'); });
    return h;
  }
  var doc = global.document;

  /** 屋号の文字（題・契約の条件・規約で使う）。注記（SITE.note）が空なら付けない（「TAISEI（）」にしない） */
  var BRAND = SITE.name + (SITE.note ? '（' + SITE.note + '）' : '');
  var LP_TITLE = BRAND + '｜' + SITE.catchcopy;
  /** 合言葉（「人生を大成させる。」）。フッターのロゴの下に飾らずに1回だけ出す。収入・紹介の話の隣には置かない */
  var TAGLINE = SITE.tagline || '';
  var WD = ['日', '月', '火', '水', '木', '金', '土'];

  /* ---------- 小さな道具 ---------- */
  function yen(n) { return U.yen(n); }
  function courseAt(lv) { return DATA.COURSES.filter(function (c) { return c.level === lv; }); }
  function person(id) { return DATA.PEOPLE[id] || null; }
  /** 公開サイトの人の名前は架空なので「（仮）」を付ける（決定事項） */
  function kari(p) { return p ? p.name + '（仮）' : ''; }
  /** 句読点（または ・）のあとで区切り、塊ごとに折り返す（変なところで割れないように） */
  function phrases(s, sep) {
    var re = sep === '・' ? /[^・]+・?/g : /[^、。]+[、。]?/g;
    return (String(s).match(re) || [s]).map(function (p) {
      return '<span class="site-nb">' + jp(p) + '</span>';
    }).join('');
  }
  function reduceMotion() {
    try { return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }
  function ss(key, val) {
    try {
      if (val === undefined) return JSON.parse(global.sessionStorage.getItem(key) || 'null');
      if (val === null) global.sessionStorage.removeItem(key);
      else global.sessionStorage.setItem(key, JSON.stringify(val));
    } catch (e) {}
    return null;
  }
  /** 全角の英数字・記号を半角に（メールアドレスや紹介コードを全角で打つ人がいるため） */
  function half(s) {
    return String(s == null ? '' : s).replace(/[！-～]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }).replace(/　/g, ' ');
  }
  function sameYear(d) { return new Date(d).getFullYear() === CLG.now().getFullYear(); }
  function dateText(d) { return U.fmtDate(d, { noYear: sameYear(d) }); }
  function newTab() { return icon('external', 'ico-s site-ext') + '<span class="sr-only">（新しいタブで開きます）</span>'; }
  function newTabLink(href, text) {
    return '<a class="site-link site-nw" href="' + esc(href) + '" target="_blank" rel="noopener">' + esc(text) + newTab() + '</a>';
  }

  /** 会員ページのスクリーンショット（390×844 を2倍で撮ったもの）。上の帯は切り、見せる高さは1枚ずつ決める。
      押せるリンクの中に置くときは alt を空にする（リンクの名前は隣の文字で付ける） */
  function shotFrame(s, alt, lazy) {
    return '<span class="site-shot__frame" style="aspect-ratio:390/' + s.h + ';--top:' + s.top + '">' +
      '<img src="assets/img/shot-' + esc(s.name) + '.webp" width="390" height="844" alt="' + esc(alt || '') + '"' +
      (lazy ? ' loading="lazy"' : '') + ' decoding="async"></span>';
  }
  /** 写真（生成したイメージ写真。人物は実在の会員ではない。docs/生成画像 → tools/prep-images.js）。最初の1枚だけ先に読む */
  function photoImg(src, w, h, alt, first) {
    return '<img src="' + esc(src) + '" width="' + w + '" height="' + h + '" alt="' + esc(alt) + '"' +
      (first ? ' loading="eager" fetchpriority="high"' : ' loading="lazy"') + ' decoding="async">';
  }
  var EVENT_IMG = DATA.EVENT_IMG || {};

  var EXPERT_NOTE = (DATA.EXPERTS[0] && DATA.EXPERTS[0].note) || '初回無料';
  /** 決まった曜日の会（オリエンテーション・成果発表会）の「水曜20:00」。data.js の日付から作る */
  function eventOf(series) { for (var i = 0; i < DATA.EVENTS.length; i++) if (DATA.EVENTS[i].series === series) return DATA.EVENTS[i]; return null; }
  function dowTime(series, fallback) {
    var e = eventOf(series);
    if (!e) return fallback;
    var d = new Date(e.at);
    return WD[d.getDay()] + '曜' + DATA.hm(d);
  }
  var ORIENT_AT = dowTime('orientation', '水曜20:00');
  var SHOWCASE_AT = dowTime('showcase', '金曜20:00');

  /* ---------- 契約の条件（紹介・確認画面・特商法・規約で同じ文言を使う） ---------- */
  var COND = {
    service: BRAND + ' 月額会員',
    content: SITE.contentLine + '。ほかに、案件への応募、イベント、運営への相談（回数の制限なし）、専門家の紹介（' + EXPERT_NOTE +
      '）、福利厚生と会員証を使えます',
    monthly: yen(SITE.price) + '（税込）',
    entry: yen(SITE.entryFee),
    payment: SITE.payment,
    billing: SITE.billing,
    payDay: '入会日と同じ日に毎月（ない月は月末）',
    timing: '申込みのときに初回。以後、入会日と同じ日に毎月（ない月は月末）',
    start: '決済の完了後すぐ（会員番号を画面に出し、メールでもお送りします）',
    term: '期間の定めなし・1か月ごとの自動更新',
    cancel: '会員ページの「アカウント」から、いつでも2回の操作で解約できます。次の更新日の前日まで使え、そこで終わります',
    refund: '途中解約による日割りの返金はありません（法令で認められる場合を除く）',
    // 月額以外にかかる費用。紹介の料金の表も、確認画面・特商法と同じ文にする（紹介だけ「実費のみ」と書くと食い違うため）
    extraLegal: 'インターネット接続の通信費、オフ会の飲食代などの実費（参加は任意）'
  };
  /** 最初の画面・申込み・最後の行で使う3つの条件（中黒でつながず、間をあけて並べる） */
  var CONDS = ['月額' + COND.monthly, '入会金' + COND.entry, 'いつでも解約'];
  function condSpans(cls) {
    return '<p class="site-conds' + (cls ? ' ' + cls : '') + '">' + CONDS.map(function (c) { return '<span>' + jp(c) + '</span>'; }).join('') + '</p>';
  }
  COND.short = CONDS.join('・');
  function nextBill() { return DATA.addMonths(CLG.now(), 1); }
  function payDayText() { return '本日（初回）。以後、毎月' + CLG.now().getDate() + '日（ない月は月末）'; }
  /** 解約の期限を実際の日付で（次の更新日の前日23:59） */
  function cancelDeadline() {
    var next = nextBill(), last = new Date(next); last.setDate(last.getDate() - 1);
    function nw(t) { return '<span class="site-nw">' + esc(t) + '</span>'; }
    return nw(dateText(last) + '23:59') + 'までに解約すれば、次の請求（' + nw(dateText(next)) + '）はありません';
  }

  /* ---------- 紹介コード ----------
     ?ref=CODE（URLの ? のあと・# のあとのどちらでも）を読み、このタブの中だけ覚えておく。
     申込みの「紹介コード」欄に最初から入れるため。 */
  var REF_KEY = 'terakoya-ref', refMem = '';
  function cleanRef(v) { v = half(v).trim(); return /^[A-Za-z0-9_-]{1,32}$/.test(v) ? v : ''; }
  function queryOf(s) {
    var q = {};
    String(s || '').replace(/^\?/, '').split('&').forEach(function (kv) {
      if (!kv) return;
      var p = kv.split('=');
      try { q[decodeURIComponent(p[0])] = decodeURIComponent((p[1] || '').replace(/\+/g, ' ')); } catch (e) {}
    });
    return q;
  }
  function captureRef(hashQuery) {
    var code = cleanRef(hashQuery && hashQuery.ref) || cleanRef(queryOf(global.location && global.location.search).ref);
    if (!code) return '';
    refMem = code;
    try { global.sessionStorage.setItem(REF_KEY, code); } catch (e) {}
    // 本人が欄を消したあとは入れ直さない
    if (J && !J.f.ref && !J.refTouched && !J.confirmed && !J.paid) J.f.ref = code;
    return code;
  }
  function getRef() {
    if (refMem) return refMem;
    try { return cleanRef(global.sessionStorage.getItem(REF_KEY)); } catch (e) { return ''; }
  }

  /* ---------- ヘッダーとフッター ---------- */
  var NAV = [['can', 'できること'], ['portal', '会員ページの中身'], ['levels', '講座'], ['price', '料金'], ['faq', 'よくある質問']];
  var SECTIONS = ['can', 'portal', 'levels', 'team', 'days', 'fit', 'price', 'faq'];

  function headerHtml() {
    var navBtns = NAV.map(function (n) {
      return '<button type="button" data-scroll="' + n[0] + '">' + esc(n[1]) + '</button>';
    }).join('');
    return '<a class="skip-link" href="#site-main" data-site="skip">本文へ移動</a>' +
      '<header class="site-head">' +
      '<div class="site-wrap site-head__in">' +
        // ロゴは読み上げない（リンクの aria-label で「TAISEI トップへ」と読むので、二度読まれないように）
        '<a class="site-head__brand" href="#/" aria-label="' + esc(BRAND) + ' トップへ">' + U.brandmark(SITE, '', { decorative: true }) + '</a>' +
        '<nav class="site-nav" aria-label="ページ内の案内">' + navBtns + '</nav>' +
        '<div class="site-head__act">' +
          '<a class="site-head__login" href="member.html">ログイン</a>' +
          '<a class="site-btn site-btn--primary site-btn--s site-head__cta" href="#/join">入会する</a>' +
          '<button type="button" class="site-head__menu" data-site="menu" aria-expanded="false" aria-controls="site-menu" aria-label="メニューを開く">' + icon('menu') + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="site-menu" id="site-menu" hidden>' +
        '<div class="site-wrap">' +
          '<nav class="site-menu__nav" aria-label="メニュー">' + NAV.map(function (n) {
            return '<button type="button" data-scroll="' + n[0] + '"><span>' + esc(n[1]) + '</span>' + U.chevron() + '</button>';
          }).join('') +
            '<a href="#/about"><span>運営と講師</span>' + U.chevron() + '</a>' +
            '<a href="#/contact"><span>お問い合わせ</span>' + U.chevron() + '</a>' +
          '</nav>' +
          // ログインは会員だけが使うので、ページの案内とは分けて下に置く
          '<div class="site-menu__login"><a class="site-btn site-btn--ghost site-btn--block" href="member.html">会員の方はログイン</a></div>' +
        '</div>' +
      '</div>' +
    '</header>';
  }

  function footerHtml() {
    var A = [['#/curriculum', '講座の一覧'], ['#/about', '運営と講師'], ['#/news', 'お知らせ'], ['#/faq', 'よくある質問'], ['member.html', '会員ログイン']];
    var B = [['#/company', '運営会社'], ['#/contact', 'お問い合わせ'], ['#/tokushoho', '特定商取引法に基づく表記'], ['#/terms', '利用規約'], ['#/privacy', 'プライバシーポリシー']];
    function list(l, label) {
      return '<ul class="site-foot__links" aria-label="' + esc(label) + '">' + l.map(function (x) {
        return '<li><a href="' + esc(x[0]) + '">' + esc(x[1]) + '</a></li>';
      }).join('') + '</ul>';
    }
    return '<footer class="site-foot">' +
      '<div class="site-wrap">' +
        '<div class="site-foot__top">' +
          '<div class="site-foot__id">' +
            '<a class="site-foot__brand" href="#/" aria-label="' + esc(BRAND) + ' トップへ">' + U.brandmark(SITE, '', { decorative: true }) + '</a>' +
            (TAGLINE ? '<p class="site-foot__tag">' + esc(TAGLINE) + '</p>' : '') +
          '</div>' +
          '<nav class="site-foot__nav" aria-label="フッター">' + list(A, 'サービス') + list(B, '会社と表記') + '</nav>' +
        '</div>' +
        '<div class="site-foot__bottom">' +
          '<p>© ' + CLG.now().getFullYear() + ' ' + esc(SITE.company) + '</p>' +
          '<p>試作版です。料金・内容は検討中で、人物と数字は架空です。フォームの内容はどこにも送られません。</p>' +
        '</div>' +
      '</div>' +
    '</footer>';
  }

  function h2(title, id) { return '<h2 class="site-h2"' + (id ? ' id="' + id + '"' : '') + ' tabindex="-1">' + esc(title) + '</h2>'; }
  function backLink() { return '<p class="site-back"><a href="#/">' + icon('back', 'ico-s') + 'トップへ戻る</a></p>'; }

  /* ============================================================
     サービス紹介（#/）
     ============================================================ */

  function hero() {
    return '<section class="site-hero" id="sec-top">' +
      '<div class="site-wrap site-hero__grid">' +
        '<div class="site-hero__text">' +
          '<h1 class="site-h1" data-page-title tabindex="-1">' + jp(SITE.catchcopy) + '</h1>' +
          '<p class="site-hero__lead">' + jp(SITE.contentLine + '。') + '</p>' +
          '<p class="site-hero__lead2">案件の紹介、運営への相談、各地のオフ会もあります。</p>' +
          condSpans('site-hero__cond') +
          '<div class="site-hero__cta">' +
            '<a class="site-btn site-btn--primary site-btn--l" href="#/join">入会する</a>' +
            '<a class="site-btn site-btn--ghost site-btn--l" href="member.html?demo=1#/home">デモを見る</a>' +
          '</div>' +
        '</div>' +
        '<figure class="site-hero__media">' +
          '<div class="site-hero__photo">' +
            photoImg(EVENT_IMG.offline || 'assets/img/photo-meetup.webp', 1200, 800, 'カフェのテーブルでノートパソコンを広げて話す5人と、ベビーカーの赤ちゃん', true) +
          '</div>' +
          '<figcaption class="site-hero__note">写真はイメージです。</figcaption>' +
        '</figure>' +
      '</div>' +
    '</section>';
  }

  /* ---------- できること（名前と中身の2列）＋写真の並び ---------- */
  function can() {
    var rows = [
      ['講座', 'ビジネスの基礎、SNS、AI、動画編集、Webデザイン、営業など。' + SITE.lessonLength + 'です。ライブ勉強会の録画も、あとから見られます。'],
      ['案件', 'アンケートやモニターなどのお小遣い案件、業務委託、紹介できるサービス。会員ページから応募できます。報酬はどれも目安です。'],
      ['イベント', 'オンラインの勉強会・作業会と、土日に各地で開くオフ会。毎月最終' + SHOWCASE_AT + 'から成果発表会があります。参加は任意です。'],
      ['タイムライン', '運営からのお知らせ、新しい講座や案件、会員の投稿が流れてきます。'],
      ['相談', '運営への相談は回数の制限なし。' + SITE.replySla + '。税理士・司法書士などの専門家も紹介します（' + EXPERT_NOTE + '）。'],
      ['福利厚生', '日用品の会員価格、映画館やレジャー施設の優待など。割引の内容は商品・店舗により異なります。会員証はスマホの画面を見せて使います。']
    ];
    return '<section class="site-sec" id="sec-can" aria-labelledby="h-can">' +
      '<div class="site-wrap">' +
        h2('できること', 'h-can') +
        '<dl class="site-can">' + rows.map(function (r) {
          return '<div><dt>' + esc(r[0]) + '</dt><dd>' + jp(r[1]) + '</dd></div>';
        }).join('') + '</dl>' +
        photoRow() +
      '</div>' +
    '</section>';
  }

  function photoRow() {
    var P = [
      ['assets/img/photo-hero.webp', 1200, 900, '家で講座を見る', '夜、自宅の机でヘッドホンをつけてノートパソコンに向かう女性の後ろ姿'],
      [EVENT_IMG.online || 'assets/img/photo-online.webp', 1200, 800, 'オンラインの勉強会', '夜、自宅の机でイヤホンをつけ、ノートパソコンを見ながらメモを取る男性'],
      [EVENT_IMG.showcase || 'assets/img/photo-showcase.webp', 1200, 800, '月末の成果発表会', '器の写真を映したテレビの前で、座っている人たちに話す女性']
    ];
    return '<ul class="site-photos site-snap">' + P.map(function (p) {
      return '<li><figure>' +
        '<div class="site-photos__img">' + photoImg(p[0], p[1], p[2], p[4]) + '</div>' +
        '<figcaption>' + esc(p[3]) + '</figcaption>' +
      '</figure></li>';
    }).join('') + '</ul>';
  }

  /* ---------- 会員ページの中身（実際の画面のスクリーンショット3枚） ---------- */
  // h はカードとカードのすき間（講座・スタートガイド）か、投稿・案件の行と行の境目の少し上（タイムライン・案件）で切れる高さ。
  // カードや行の途中で切れると、撮りそこねに見えるため。tools/lp-images.js が撮るたびに出す値に合わせる
  var SHOTS = [
    { name: 'courses', route: 'courses', title: '講座の一覧', top: 56, h: 685 },
    { name: 'feed', route: 'feed', title: 'タイムライン', top: 56, h: 648 },
    { name: 'gigs', route: 'gigs', title: '案件', top: 56, h: 629 }
  ];
  var START_SHOT = { name: 'start', top: 56, h: 547 };

  function portal() {
    return '<section class="site-sec site-sec--band" id="sec-portal" aria-labelledby="h-portal">' +
      '<div class="site-wrap">' +
        h2('会員ページの中身', 'h-portal') +
        '<p class="site-sec__lead">講座、運営からのお知らせ、相談、イベントや案件の申込みは、どれも会員ページからできます。入会すると会員番号が届きます。</p>' +
        '<ul class="site-shots site-snap">' + SHOTS.map(function (s) {
          return '<li><a class="site-shot" href="member.html?demo=1#/' + s.route + '">' +
            '<b class="site-shot__ttl">' + esc(s.title) + '</b>' + shotFrame(s, '', true) + '</a></li>';
        }).join('') + '</ul>' +
        '<div class="site-portal__foot">' +
          '<a class="site-btn site-btn--ghost site-btn--l" href="member.html?demo=1#/home">デモを見る</a>' +
        '</div>' +
      '</div>' +
    '</section>';
  }

  /* ---------- 講座とレベル（表） ---------- */
  function levels() {
    var X = DATA.XP;
    return '<section class="site-sec" id="sec-levels" aria-labelledby="h-levels">' +
      '<div class="site-wrap">' +
        h2('講座とレベル', 'h-levels') +
        '<p class="site-sec__lead">講座を見る・イベントに出る・案件をやり終えると経験値（XP）がたまります。レベルが上がると次の講座が開きます（勉強会の録画は最初から見られます）。</p>' +
        '<table class="site-tbl site-lv">' +
          '<caption class="sr-only">レベルごとに開く講座</caption>' +
          '<thead><tr><th scope="col">レベル</th><th scope="col" class="site-lv__xp">必要なXP</th><th scope="col">目安</th><th scope="col">開く講座</th></tr></thead>' +
          '<tbody>' + DATA.LEVELS.map(function (l) {
            var n = Math.ceil(l.min / X.lesson);
            return '<tr><th scope="row">Lv' + esc(l.lv) + ' ' + esc(l.name) + '</th>' +
              '<td class="site-lv__xp">' + (l.min ? '<span class="num">' + U.num(l.min) + '</span><span class="site-lv__unit"> XP</span>' : '入会時') + '</td>' +
              '<td class="site-lv__aim">' + (l.min ? '動画' + n + '本ほど' : '<span class="site-lv__none">—</span>') + '</td>' +
              '<td class="site-lv__courses">' + courseAt(l.lv).map(function (c) {
                return '<a class="site-hit" href="#/curriculum?c=' + encodeURIComponent(c.id) + '">' + esc(c.title) + '</a>';
              }).join('<span class="site-lv__sep">、</span>') + '</td></tr>';
          }).join('') + '</tbody>' +
        '</table>' +
        '<p class="site-sec__after">XPは講座の動画1本で+' + esc(X.lesson) + '、録画1本で+' + esc(X.archive) + '、イベント参加で+' + esc(X.event) +
          '、案件の完了で+' + esc(X.gigDone) + '。目安は講座の動画だけで上げた場合です。<a class="site-link site-nw" href="#/curriculum">講座と回の一覧</a></p>' +
      '</div>' +
    '</section>';
  }

  /* ---------- 運営と講師（名前は仮）。見出しはメニュー・フッター・#/about と同じ「運営と講師」 ---------- */
  var TEAM = ['staff1', 'staff2', 'staff3', 'staff4', 'staff5', 'guest2', 'guest1'];
  function taught(id) { return DATA.COURSES.filter(function (c) { return c.teacher === id; }); }
  function avatar(p) { return U.avatar({ name: p.name, color: p.color, photo: p.photo }, ''); }
  function team() {
    return '<section class="site-sec" id="sec-team" aria-labelledby="h-team">' +
      '<div class="site-wrap">' +
        h2('運営と講師', 'h-team') +
        '<ul class="site-team">' + TEAM.map(function (id) {
          var p = person(id); if (!p) return '';
          var cs = taught(id);
          return '<li>' + avatar(p) +
            '<div class="site-team__body">' +
              '<p class="site-team__name"><span class="site-nw"><b>' + esc(p.name) + '</b>（仮）</span><span class="site-team__role">' + esc(p.role || '') + '</span></p>' +
              // 講座名ごとに折る（「コーチングと自分の／育て方」のように講座名の途中で切れないように）
              (cs.length ? '<p class="site-team__courses">' + phrases(cs.map(function (c) { return c.title; }).join('、'), '、') + '</p>' : '') +
            '</div></li>';
        }).join('') + '</ul>' +
        '<p class="site-sec__after"><a class="site-link site-more" href="#/about">運営会社と提携の専門家</a></p>' +
      '</div>' +
    '</section>';
  }

  /* ---------- 入会後の30日（週ごとの一覧と、スタートガイドの画面を横に） ---------- */
  function days() {
    var weeks = [1, 2, 3, 4].map(function (w) {
      var list = DATA.ONBOARDING.filter(function (s) { return s.week === w; });
      // 項目ごとに折る（「LINEで／通知を受け取る」のように1つの項目が2行に分かれないように）
      return '<li><b>' + w + '週目</b><span>' + phrases(list.map(function (s) { return s.title; }).join('、'), '、') + '</span></li>';
    }).join('');
    return '<section class="site-sec" id="sec-days" aria-labelledby="h-days">' +
      '<div class="site-wrap site-days">' +
        '<div class="site-days__text">' +
          h2('入会後の30日', 'h-days') +
          '<ul class="site-weeks">' + weeks + '</ul>' +
          '<p class="site-sec__after">' + jp('新入生オリエンテーションは毎週' + ORIENT_AT + '（オンライン）。運営のスタッフが') + '<span class="site-nw">進みぐあいを見て、</span><span class="site-nw">声をかけます。</span></p>' +
        '</div>' +
        '<figure class="site-days__shot">' + shotFrame(START_SHOT, '会員ページのスタートガイドの画面。週ごとの項目と、済んだ数が並んでいる', true) +
          '<figcaption>スタートガイド（会員ページ）</figcaption></figure>' +
      '</div>' +
    '</section>';
  }

  /* ---------- 向いている人・向いていない人 ---------- */
  function fit() {
    var YES = [
      '副業を始めたいが、何からやればいいか分からない',
      '1日10〜30分なら時間が取れる',
      '近くに同じことをしている仲間がいない',
      '学んだことを小さな案件で試したい',
      'すでに事業をしていて、学び直しや横のつながりがほしい'
    ];
    var NO = [
      'すぐに大きな収入がほしい',
      '講座を見るだけで、手を動かす時間は取れない',
      '人を勧誘して稼ぎたい',
      '借金をしてまで始めようとしている'
    ];
    function list(a) { return '<ul class="site-bullets">' + a.map(function (t) { return '<li>' + jp(t) + '</li>'; }).join('') + '</ul>'; }
    return '<section class="site-sec" id="sec-fit" aria-label="向いている人・向いていない人">' +
      '<div class="site-wrap">' +
        '<div class="site-fit">' +
          '<div>' + h2('向いている人') + list(YES) + '</div>' +
          '<div>' + h2('向いていない人') + list(NO) + '</div>' +
        '</div>' +
      '</div>' +
    '</section>';
  }

  /* ---------- 料金（プランはひとつ。入会の流れと並べる） ---------- */
  function planRows() {
    return [
      ['内容', COND.content + '。'],
      ['月額以外にかかる費用', COND.extraLegal],
      ['お支払い', COND.payment],
      ['お支払い日', COND.payDay],
      ['解約', COND.cancel + '。'],
      ['返金', COND.refund]
    ];
  }
  var FLOW = [
    ['申込みのフォームに入力', 'お名前とメールアドレス。2分ほどです。'],
    ['確認画面で条件を確かめる', '料金・お支払い日・解約の方法を1画面で見られます。'],
    ['カードで支払う', 'Stripe の決済画面で入力します。'],
    ['会員番号が届く', 'パスワードを決めて、会員ページにログインします。']
  ];
  function price() {
    return '<section class="site-sec site-sec--band" id="sec-price" aria-labelledby="h-price">' +
      '<div class="site-wrap">' +
        h2('料金', 'h-price') +
        '<div class="site-price">' +
          '<div class="site-plan">' +
            '<p class="site-plan__name">' + esc(COND.service) + '</p>' +
            '<p class="site-plan__price">月額<b class="num">' + esc(U.num(SITE.price)) + '</b>円（税込）</p>' +
            '<p class="site-plan__entry">入会金' + esc(COND.entry) + '・いつでも解約</p>' +
            '<a class="site-btn site-btn--primary site-btn--l site-btn--block" href="#/join">入会する</a>' +
            '<p class="site-plan__links"><a class="site-link" href="#/tokushoho">特定商取引法に基づく表記</a><a class="site-link" href="#/terms">利用規約</a></p>' +
          '</div>' +
          '<div class="site-flow">' +
            '<h3 class="site-h3">入会の流れ</h3>' +
            '<ol>' + FLOW.map(function (f, i) {
              return '<li><span class="site-flow__n num" aria-hidden="true">' + (i + 1) + '</span><div><b>' + esc(f[0]) + '</b><span>' + jp(f[1]) + '</span></div></li>';
            }).join('') + '</ol>' +
          '</div>' +
        '</div>' +
        kvTable(planRows(), 'site-price__kv site-kv--stack') +
      '</div>' +
    '</section>';
  }

  /* ---------- よくある質問 ---------- */
  function faqItems() {
    return [
      ['入会の手順を教えてください。',
        'このページの「入会する」から、お名前とメールアドレスを入れます。確認画面で料金と解約の条件を確かめてからカードで支払うと、その場で会員番号が出ます。パスワードを決めるリンクは、メールでお送りします。'],
      ['ビジネスの経験がなくても始められますか。',
        '始められます。最初はレベル1の講座が開いていて、言葉の意味から学べます。分からないことは運営に何度でも聞けます。'],
      ['仕事や家事で忙しくても続けられますか。',
        '講座は' + SITE.lessonLength + 'です。ライブの勉強会は録画が残るので、あとから見られます。'],
      ['地方に住んでいても参加できますか。',
        '講座も相談もオンラインです。オフ会は土日に各地で開いていて、参加は任意です。'],
      ['何歳から入会できますか。',
        '18歳以上の方が対象です。18歳未満の方は、保護者の同意があれば入会できます。会員は会社員、パート、子育て中の方、お店や会社をしている方が中心です。'],
      ['ほかのスクールやオンラインサロンとの違いは何ですか。',
        '講座、運営からの連絡、イベントや案件の申込み、相談が会員ページにまとまっていて、LINEグループや別のサイトを行き来しなくて済みます。講座はレベルに合わせて順に開きます。'],
      ['会員どうしで会う機会はありますか。',
        'あります。オンラインの勉強会・作業会と、土日に各地で開くオフ会です。毎月最終' + SHOWCASE_AT + 'からの成果発表会は、見るだけの参加もできます。どれも参加は任意で、オフ会の飲食代などは実費です。'],
      ['支払い方法は何がありますか。',
        COND.payment + 'のみです。カード情報は Stripe が管理し、運営はカード番号を持ちません。お支払い日は、' + COND.payDay + 'です。'],
      ['解約や返金はどうなりますか。',
        COND.cancel + '。電話や面談は要りません。' + COND.refund + '。'],
      ['収入は保証されますか。',
        'いいえ。学ぶ場と小さく試す機会を提供するもので、収入を保証するものではありません。案件の報酬も、すべて目安です。'],
      ['会費は経費になりますか。',
        '事業の内容によって変わるため、一律にはお答えできません。経費にできるかどうかは、提携の税理士に相談できます（' + EXPERT_NOTE + '）。'],
      ['会社で副業が禁止されている場合はどうすればいいですか。',
        'まず、お勤め先の就業規則を確認してください。講座で学ぶだけなら問題にならないことが多いですが、案件で報酬を受け取る前には、規則に沿っているかを必ず確かめてください。']
    ];
  }
  function faq() {
    return '<section class="site-sec" id="sec-faq" aria-labelledby="h-faq">' +
      '<div class="site-wrap"><div class="site-narrow">' +
        h2('よくある質問', 'h-faq') +
        '<div class="site-faq">' + faqItems().map(function (f) {
          return '<details><summary><span class="site-faq__q" aria-hidden="true">Q</span><span class="site-faq__s">' + jp(f[0]) + '</span>' +
            '<span class="site-faq__pm" aria-hidden="true"></span></summary><div class="site-faq__a">' + jp(f[1]) + '</div></details>';
        }).join('') + '</div>' +
        '<p class="site-faq__more">ここにない質問は<a class="site-link" href="#/contact">お問い合わせ</a>からどうぞ。' + jp(SITE.replySla) + '。</p>' +
        '<button type="button" class="site-totop" data-site="top">' + icon('back', 'ico-s') + 'ページの上へ</button>' +
      '</div></div>' +
    '</section>';
  }

  /* ---------- 最後の行（白地。料金の3つと、入会・デモ）。3つは最初の画面と同じく間をあけて並べる（行末に中黒を残さない） ---------- */
  function ending() {
    return '<section class="site-end" aria-label="入会の案内">' +
      '<div class="site-wrap site-end__in">' +
        condSpans('site-end__txt') +
        '<div class="site-end__cta">' +
          '<a class="site-btn site-btn--primary site-btn--l" href="#/join">入会する</a>' +
          '<a class="site-btn site-btn--ghost site-btn--l" href="member.html?demo=1#/home">デモを見る</a>' +
        '</div>' +
      '</div>' +
    '</section>';
  }

  function refBar() {
    var code = getRef();
    if (!code) return '';
    return '<div class="site-refbar" role="note"><div class="site-wrap">' +
      '<span class="site-nb">紹介リンクから開いています</span><span class="site-nb">（紹介コード：<b class="mono">' + esc(code) + '</b>）</span></div></div>';
  }

  function lp() {
    return refBar() + hero() + can() + portal() + levels() + team() + days() + fit() + price() + faq() + ending();
  }

  /* ============================================================
     フォームの共通部品（入会の申込み・お問い合わせ）
     ============================================================ */
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function emailError(v) {
    if (!v) return 'メールアドレスを入力してください';
    if (v.indexOf('@') < 0) return 'メールアドレスに「@」が入っていません';
    if (!EMAIL_RE.test(v)) return 'メールアドレスの「@」のあとを確かめてください（例：name@example.jp）';
    return '';
  }
  /** よくある打ちまちがい（gmail・yahoo）。当てはまれば直したアドレスを返す */
  var TYPO = {
    'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gnail.com': 'gmail.com',
    'gmail.co': 'gmail.com', 'gmail.cm': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.om': 'gmail.com', 'gmail.co.jp': 'gmail.com', 'gmail.jp': 'gmail.com',
    'yahoo.co.jo': 'yahoo.co.jp', 'yahoo.co.j': 'yahoo.co.jp', 'yahoo.cojp': 'yahoo.co.jp', 'yaho.co.jp': 'yahoo.co.jp', 'yahooo.co.jp': 'yahoo.co.jp',
    'yahoo.jp': 'yahoo.co.jp', 'yahoo.co.pj': 'yahoo.co.jp', 'yhoo.co.jp': 'yahoo.co.jp', 'yahoo.ne.jp': 'yahoo.co.jp'
  };
  function typoOf(v) {
    var m = /^([^\s@]+)@([^\s@]+)$/.exec(String(v || '').trim().toLowerCase());
    return m && TYPO[m[2]] ? m[1] + '@' + TYPO[m[2]] : '';
  }

  /** 欄のまとまり。F はフォームの状態（f・err・ok）、p は id の頭 */
  function fieldBox(F, p, name, label, o) {
    o = o || {};
    var e = F.err[name], ok = F.ok && F.ok[name];
    return '<div class="site-field' + (e ? ' is-err' : '') + (o.cls ? ' ' + o.cls : '') + '" data-field="' + p + name + '">' +
      '<label class="site-field__label" for="' + p + name + '">' + esc(label) + (o.optional ? '<span class="site-opt">任意</span>' : '') + '</label>' +
      o.control +
      (o.help ? '<p class="site-field__help" id="' + p + name + '-help">' + esc(o.help) + '</p>' : '') +
      (o.hint ? '<p class="site-field__hint" id="' + p + name + '-hint" aria-live="polite"></p>' : '') +
      msgHtml(p + name, e, ok) +
    '</div>';
  }
  function msgHtml(id, e, ok) {
    return '<p class="site-field__err' + (!e && ok ? ' is-ok' : '') + '" id="' + id + '-err">' +
      (e ? icon('info', 'ico-s') + '<span>' + esc(e) + '</span>' : ok ? icon('check', 'ico-s') + '<span>' + esc(ok) + '</span>' : '') + '</p>';
  }
  function describedby(p, name, o) {
    return p + name + '-err' + (o && o.help ? ' ' + p + name + '-help' : '') + (o && o.hint ? ' ' + p + name + '-hint' : '');
  }
  function inputHtml(F, p, name, type, attrs, o) {
    return '<input class="site-input" id="' + p + name + '" name="' + name + '" type="' + type + '" value="' + esc(F.f[name] || '') + '"' +
      ' aria-describedby="' + describedby(p, name, o) + '"' + (F.err[name] ? ' aria-invalid="true"' : '') +
      (o && o.required ? ' aria-required="true"' : '') + (attrs || '') + '>';
  }
  function selectHtml(F, p, name, list, blank, o) {
    var v = F.f[name] || '';
    return '<select class="site-select' + (v ? '' : ' is-empty') + '" id="' + p + name + '" name="' + name + '"' +
      ' aria-describedby="' + describedby(p, name, o) + '"' + (F.err[name] ? ' aria-invalid="true"' : '') +
      (o && o.required ? ' aria-required="true"' : '') + '>' +
      '<option value="">' + esc(blank) + '</option>' +
      list.map(function (x) { return '<option' + (x === v ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') +
    '</select>';
  }
  /** 同意のチェック（規約・プライバシーは新しいタブで開く） */
  function consentHtml(F, p, name, linksHtml, text) {
    var e = F.err[name];
    return '<div class="site-field site-agree' + (e ? ' is-err' : '') + '" data-field="' + p + name + '">' +
      // リンクが2つ並ぶもの（利用規約とプライバシーポリシー）は、狭い画面で2行に割れたときに行の間を広げる（site.css）
      '<label class="site-check' + ((linksHtml.match(/site-link/g) || []).length > 1 ? ' site-check--links' : '') + '"><input type="checkbox" id="' + p + name + '" name="' + name + '"' + (F.f[name] ? ' checked' : '') +
        ' aria-required="true" aria-describedby="' + p + name + '-err"' + (e ? ' aria-invalid="true"' : '') + '>' +
        '<span>' + linksHtml + esc(text) + '<span class="site-req">必須</span></span></label>' +
      msgHtml(p + name, e, '') +
    '</div>';
  }
  function kvTable(rows, cls) {
    return '<table class="site-kv' + (cls ? ' ' + cls : '') + '"><tbody>' + rows.filter(Boolean).map(function (r) {
      return '<tr><th scope="row">' + esc(r[0]) + '</th><td>' + (r[2] ? r[1] : jp(r[1])) + '</td></tr>';
    }).join('') + '</tbody></table>';
  }
  function stepper(labels, cur, allDone) {
    return '<ol class="site-steps" aria-label="手続きの流れ">' + labels.map(function (s, i) {
      var n = i + 1, done = allDone || n < cur, cls = (done ? 'is-done' : '') + (n === cur ? ' is-cur' : '');
      return '<li class="' + cls + '"' + (n === cur ? ' aria-current="step"' : '') + '>' +
        '<span class="site-steps__n">' + (done ? icon('check') + '<span class="sr-only">' + n + '（済み）</span>' : n) + '</span>' +
        '<span class="site-steps__t">' + esc(s) + '</span></li>';
    }).join('') + '</ol>';
  }

  /* ============================================================
     入会の申込み（#/join）
     入力 → 確認（?step=confirm）→ お支払い（?step=pay）→ 完了（?step=done）
     ============================================================ */
  var PREFS = ['北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県', '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
    '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県',
    '鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県', '海外'];
  var JOBS = ['会社員', 'パート・アルバイト', '主婦・主夫', '自営業・経営者', '学生', 'その他'];
  var JOIN_STEPS = ['入力', '確認', 'お支払い', '完了'];
  var STEP_KEYS = ['input', 'confirm', 'pay', 'done'];
  var JOIN_KEY = 'terakoya-join';
  var FIELDS = ['name', 'kana', 'email', 'pref', 'job', 'ref', 'agree'];

  var J = null;
  function blankJoin() {
    return { step: 'input', f: { name: '', kana: '', email: '', pref: '', job: '', ref: getRef(), agree: false, adult: false },
      err: {}, ok: {}, busy: false, confirmed: false, paid: false, id: '', rejoin: false, dup: false, payState: '', card: '' };
  }
  function resetJoin() { J = blankJoin(); ss(JOIN_KEY, null); }
  /** 入力中の内容をこのタブに置く（読み込み直しても消えないように）。決済の途中の印は置かない */
  function saveJoin() {
    ss(JOIN_KEY, { f: J.f, confirmed: J.confirmed, paid: J.paid, id: J.id, rejoin: J.rejoin, dup: J.dup, doneSeen: !!J.doneSeen,
      refTouched: !!J.refTouched, card: J.card, paidAt: J.paidAt || '' });
  }
  (function restoreJoin() {
    J = blankJoin();
    var d = ss(JOIN_KEY);
    if (!d || !d.f) return;
    FIELDS.concat('adult').forEach(function (k) { if (d.f[k] != null) J.f[k] = d.f[k]; });
    ['confirmed', 'paid', 'id', 'rejoin', 'dup', 'doneSeen', 'refTouched', 'card', 'paidAt'].forEach(function (k) { if (d[k] != null) J[k] = d[k]; });
    if (J.paid && !J.id) J.paid = false;
  })();

  /* 入力の決まり。空欄のときに叱るのは「確認画面へ」を押したときだけ */
  function checkJoin(name, v) {
    v = typeof v === 'string' ? v.trim() : v;
    if (name === 'name') {
      if (!v) return 'お名前を入力してください';
      if (v.length > 40) return 'お名前は40文字までで入力してください';
    }
    if (name === 'kana' && v && !/^[぀-ゟ゠-ヿ\s　]+$/.test(v)) return 'ふりがなは、ひらがなかカタカナで入力してください';
    if (name === 'email') return emailError(half(v).trim());
    if (name === 'ref' && v) {
      var r = refCheck(v);
      if (!r.ok) return r.message;
    }
    if (name === 'agree' && !v) return '利用規約とプライバシーポリシーへの同意が必要です';
    return '';
  }
  /** 紹介コードを名簿と照らす（domain.js）。読み込まれていないときは形だけ見る */
  function refCheck(v) {
    if (R && R.validateRefCode) return R.validateRefCode(half(v));
    return cleanRef(v) ? { ok: true, code: cleanRef(v).toUpperCase(), message: '' } : { ok: false, message: '見つかりません（空欄でも申込めます）' };
  }
  function joinFormOk() { return FIELDS.every(function (k) { return !checkJoin(k, J.f[k]); }); }
  /** すでに会員になっているメールアドレスか（試作版はデモの2人のアドレス） */
  function isRegistered(email) {
    var e = half(email).trim().toLowerCase();
    return !!e && [DATA.MEMBER && DATA.MEMBER.email, DATA.VETERAN && DATA.VETERAN.email].some(function (x) { return x && String(x).toLowerCase() === e; });
  }
  /** 再入会できる状態か（このブラウザの会員の契約が終わっている） */
  function rejoinable() {
    try { return !!(R && R.plan && CLG.store.state && R.plan().status === 'ended'); } catch (e) { return false; }
  }
  function startRejoin() {
    if (J.rejoin && !J.paid) return;
    J = blankJoin();
    J.rejoin = true;
    if (rejoinable()) {
      var m = CLG.store.state.me || {};
      var pref = String(m.area || '').split(/\s+/)[0];
      J.f.name = m.name || ''; J.f.kana = m.kana || ''; J.f.email = m.email || '';
      J.f.pref = PREFS.indexOf(pref) >= 0 ? pref : ''; J.f.job = JOBS.indexOf(m.job) >= 0 ? m.job : '';
      J.f.ref = '';
    }
    saveJoin();
  }

  /** 段の URL。再入会の途中はどの段にも rejoin=1 を付ける（戻る・訂正で普通の申込みに変わらないように） */
  function joinHash(step) {
    var q = [];
    if (step && step !== 'input') q.push('step=' + step);
    if (J && J.rejoin) q.push('rejoin=1');
    return '#/join' + (q.length ? '?' + q.join('&') : '');
  }
  /** その段を開いてよいか。だめならいちばん近い段を返す */
  function allowedJoin(want) {
    if (J.paid) return 'done';
    if (J.busy) return 'pay';
    if (want === 'done') want = 'pay';
    if (want === 'pay' && !J.confirmed) want = 'confirm';
    if (want === 'confirm' && !joinFormOk()) want = 'input';
    return want;
  }
  function routeJoin(q, entering) {
    var want = STEP_KEYS.indexOf(q.step) >= 0 ? q.step : 'input';
    // 完了のあと、戻るで前の段へ来たときは、申込みより前のページまで戻す
    if (!entering && J.paid && J.doneSeen && want !== 'done') { skipBack(joinHash('done')); return false; }
    // 完了を見たあとに申込みを開き直したら、空のフォームから
    if (entering && J.paid && J.doneSeen && want !== 'done') resetJoin();
    // 再入会（?rejoin=1）と普通の申込みの切り替え。同じ画面の中のリンク（登録済みの知らせの「再入会する」など）でも切り替える
    if (q.rejoin === '1') { if (!J.rejoin && !J.paid) startRejoin(); }
    else if (J.rejoin && !J.paid) { J = blankJoin(); saveJoin(); }
    var ok = allowedJoin(want);
    if (ok !== want) { replaceHash(joinHash(ok)); return false; }
    J.canceled = want === 'pay' && q.canceled === '1';
    if (want !== 'pay') J.payState = '';
    J.step = want;
    return true;
  }
  function goJoin(step) { go(joinHash(step)); }

  function joinPlanBox() {
    return '<div class="site-join__plan"><b>' + esc(COND.service) + '</b>' + condSpans() + '</div>';
  }

  function stepInput() {
    var F = J, p = 'f-';
    if (J.rejoin && !rejoinable()) return rejoinGate();
    return '<div class="site-join__head">' +
        '<h1 class="site-join__ttl" data-page-title tabindex="-1">' + (J.rejoin ? '再入会のお申込み' : '入会のお申込み') + '</h1>' +
        (J.rejoin ? '<p class="site-join__lead">会員番号 <b class="mono site-nw">' + esc(CLG.store.state.me.id) + '</b> と、これまでの記録をそのまま使います。</p>' : '') +
      '</div>' +
      joinPlanBox() +
      '<form class="site-panel site-form" id="site-join-form" novalidate>' +
        '<div class="site-field-row">' +
          fieldBox(F, p, 'name', 'お名前', { control: inputHtml(F, p, 'name', 'text', ' autocomplete="name" placeholder="例：山田 はな" maxlength="40"', { required: true }) }) +
          fieldBox(F, p, 'kana', 'ふりがな', { optional: true, control: inputHtml(F, p, 'kana', 'text', ' placeholder="例：やまだ はな" maxlength="60"') }) +
        '</div>' +
        fieldBox(F, p, 'email', 'メールアドレス', { cls: 'site-field--email', hint: true,
          help: J.rejoin ? '申込みの控えを送ります。' : '会員番号と、パスワードを決めるリンクを送ります。',
          control: inputHtml(F, p, 'email', 'email', ' autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" placeholder="例：name@example.jp"',
            { required: true, help: true, hint: true }) }) +
        '<div class="site-field-row">' +
          fieldBox(F, p, 'pref', '住んでいる地域', { optional: true, control: selectHtml(F, p, 'pref', PREFS, '選んでください') }) +
          fieldBox(F, p, 'job', 'いまのお仕事', { optional: true, control: selectHtml(F, p, 'job', JOBS, '選んでください') }) +
        '</div>' +
        (J.rejoin ? '' : fieldBox(F, p, 'ref', '紹介コード', { optional: true, cls: 'site-field--ref', help: '会員から紹介された方だけ。英字と数字です。',
          control: inputHtml(F, p, 'ref', 'text', ' autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="32" placeholder="例：HANA123"', { help: true }) })) +
        consentHtml(F, p, 'agree', newTabLink('index.html#/terms', '利用規約') + 'と' + newTabLink('index.html#/privacy', 'プライバシーポリシー'), 'に同意します') +
        '<div class="site-form__foot">' +
          '<p class="site-form__sum" id="site-form-sum" aria-live="polite"></p>' +
          '<button type="submit" class="site-btn site-btn--ink site-btn--l site-btn--block">確認画面へ進む</button>' +
        '</div>' +
      '</form>';
  }
  /** 再入会：このブラウザに終わった会員がいないとき（ログインしてから進めてもらう） */
  function rejoinGate() {
    return '<div class="site-join__head">' +
        '<h1 class="site-join__ttl" data-page-title tabindex="-1">再入会のお申込み</h1>' +
        '<p class="site-join__lead">以前の会員番号でログインしてから進めてください。会員期間が終わっている方には、ログインのあとに再入会の案内が出ます。</p>' +
      '</div>' +
      '<div class="site-panel site-gate">' +
        '<div class="site-gate__act">' +
          '<a class="site-btn site-btn--ink site-btn--l" href="member.html#/login">ログインする</a>' +
          '<a class="site-link site-more" href="member.html#/forgot">パスワードを忘れた方</a>' +
        '</div>' +
        '<p class="site-gate__new">はじめての方は<a class="site-link" href="#/join">入会のお申込み</a>へ。</p>' +
      '</div>';
  }

  function youRows() {
    var f = J.f;
    return [
      J.rejoin ? ['会員番号', CLG.store.state.me.id + '（これまでと同じ）'] : null,
      ['お名前', f.name],
      f.kana ? ['ふりがな', f.kana] : null,
      ['メールアドレス', '<span class="site-email">' + esc(half(f.email).trim()) + '</span>', true],
      f.pref ? ['住んでいる地域', f.pref] : null,
      f.job ? ['いまのお仕事', f.job] : null,
      f.ref ? ['紹介コード', f.ref] : null
    ];
  }
  function dealRows() {
    return [
      ['サービス', COND.service], ['内容', COND.content + '。'], ['月額', COND.monthly], ['入会金', COND.entry],
      ['月額以外にかかる費用', COND.extraLegal],
      ['お支払い方法', COND.payment], ['お支払い時期', payDayText()], ['提供開始', COND.start],
      ['契約期間', COND.term],
      ['解約', jp(COND.cancel + '。') + cancelDeadline() + '。', true],
      ['返金', COND.refund]
    ];
  }
  function dupNotice() {
    return '<div class="site-alert site-alert--warn" id="join-dup" role="alert" tabindex="-1">' +
      '<p class="site-alert__ttl"><span class="site-nb">このメールアドレスは</span><span class="site-nb">すでに登録されています</span></p>' +
      '<p>ログインしてお使いください。以前に退会した方は、ログインすると再入会の手続きに進めます。</p>' +
      '<div class="site-alert__act">' +
        '<a class="site-btn site-btn--ink" href="member.html#/login">ログインする</a>' +
        '<a class="site-btn site-btn--ghost" href="#/join?rejoin=1">再入会する</a>' +
        '<button type="button" class="site-textbtn" data-join="edit" data-focus="email">メールアドレスを訂正する</button>' +
      '</div>' +
    '</div>';
  }
  function stepConfirm() {
    var e = J.err.adult;
    return '<div class="site-join__head">' +
        '<h1 class="site-join__ttl" data-page-title tabindex="-1">お申込み内容の確認</h1>' +
        '<p class="site-join__lead">まだお申込みは確定していません。</p>' +
      '</div>' +
      (J.dup ? dupNotice() : '') +
      '<div class="site-panel">' +
        '<h2 class="site-panel__ttl">ご契約の内容</h2>' + kvTable(dealRows(), 'site-kv--confirm site-kv--deal site-kv--stack') +
      '</div>' +
      '<div class="site-panel">' +
        '<div class="site-panel__head"><h2 class="site-panel__ttl">お客さまの情報</h2>' +
          '<button type="button" class="site-textbtn site-edit" data-join="edit">訂正する</button></div>' +
        kvTable(youRows(), 'site-kv--confirm site-kv--stack') +
      '</div>' +
      '<div class="site-field site-adult' + (e ? ' is-err' : '') + '" data-field="f-adult">' +
        '<label class="site-check"><input type="checkbox" id="f-adult" name="adult"' + (J.f.adult ? ' checked' : '') +
          ' aria-required="true" aria-describedby="f-adult-err"' + (e ? ' aria-invalid="true"' : '') + '>' +
          '<span>18歳以上です（未成年の方は保護者の同意があります）<span class="site-req">必須</span></span></label>' +
        msgHtml('f-adult', e, '') +
      '</div>' +
      '<p class="site-join__notice">決済が完了した時点でお申込みが確定します。' +
        newTabLink('index.html#/tokushoho', '特定商取引法に基づく表記') + '</p>' +
      '<div class="site-join__btns">' +
        '<button type="button" class="site-btn site-btn--ghost site-btn--l" data-join="edit">' + icon('back') + '内容を訂正する</button>' +
        '<button type="button" class="site-btn site-btn--primary site-btn--l site-btn--wrap site-btn--confirm" data-join="confirm">' +
          '<span>申込みを確定する</span><span class="site-btn__sub">（次の画面でカード決済）</span></button>' +
      '</div>';
  }

  function payNotice() {
    if (J.payState === 'failed') {
      return '<div class="site-alert site-alert--err" id="pay-state" role="alert" tabindex="-1">' +
        '<p class="site-alert__ttl">決済が完了しませんでした</p>' +
        '<p>カード会社で決済が承認されませんでした。お申込みはまだ確定しておらず、料金もかかっていません。</p>' +
        '<div class="site-alert__act">' +
          '<button type="button" class="site-btn site-btn--ink" data-join="pay" data-retry="1">もう一度試す</button>' +
          '<button type="button" class="site-btn site-btn--ghost" data-join="pay" data-card="other">別のカードで支払う</button>' +
        '</div></div>';
    }
    if (J.canceled) {
      return '<div class="site-alert site-alert--info" id="pay-state" role="status" tabindex="-1">' +
        '<p class="site-alert__ttl">決済の画面から戻りました</p>' +
        '<p>お申込みはまだ確定しておらず、料金もかかっていません。続けるときは、下のボタンから決済に進んでください。</p></div>';
    }
    return '';
  }
  function stepPay() {
    return '<div class="site-join__head">' +
        '<h1 class="site-join__ttl" data-page-title tabindex="-1">お支払い</h1>' +
      '</div>' +
      payNotice() +
      '<div class="site-panel site-pay">' +
        '<p class="site-pay__demo"><b>決済（デモ）</b>本番ではここで Stripe の決済画面が開きます。試作版ではカード情報を入力しません。</p>' +
        kvTable([
          ['本日のお支払い', COND.monthly],
          ['次回から', '毎月' + CLG.now().getDate() + '日（ない月は月末）に' + COND.monthly],
          ['お支払い方法', COND.payment]
        ], 'site-kv--stack') +
        '<button type="button" class="site-btn site-btn--primary site-btn--l site-btn--block site-btn--wrap site-btn--confirm" data-join="pay">' +
          '<span>デモの決済を完了する</span><span class="site-btn__sub"><span class="site-nb">（月額' + esc(yen(SITE.price)) + 'の</span><span class="site-nb">継続課金が始まります）</span></span></button>' +
        '<p class="site-pay__status" id="pay-status" role="status" aria-live="polite"></p>' +
        '<details class="site-pay__alt"><summary>ほかの結果を見る（デモ）</summary>' +
          '<div class="site-pay__alts">' +
            '<button type="button" class="site-textbtn" data-join="demo-fail">カードが通らなかった</button>' +
            '<button type="button" class="site-textbtn" data-join="demo-cancel">決済の画面で「戻る」を押した</button>' +
            (J.rejoin ? '' : '<button type="button" class="site-textbtn" data-join="demo-dup">登録済みのメールアドレスだった</button>') +
          '</div>' +
        '</details>' +
        '<button type="button" class="site-textbtn site-pay__back" data-join="back">' + icon('back', 'ico-s') + '確認画面に戻る</button>' +
      '</div>';
  }

  function stepDone() {
    var f = J.f, email = half(f.email).trim();
    var week1 = DATA.ONBOARDING.filter(function (s) { return s.week === 1; });
    var nb = nextBill();
    var keep = [
      ['月額', COND.monthly],
      ['本日の決済', COND.monthly + '・決済済み'],
      ['次回', dateText(nb) + '・' + COND.monthly],
      ['解約の方法', jp('会員ページの「アカウント」から') + '<span class="site-nw">（2回の操作）</span>', true],
      ['控えのメール', '<span class="site-email">' + esc(email) + '</span> に送りました', true],
      ['領収書', '会員ページの「アカウント」から出せます']
    ];
    return '<div class="site-done">' +
      '<div class="site-join__head">' +
        '<h1 class="site-join__ttl" data-page-title tabindex="-1">' + (J.rejoin ? '再入会の手続きが完了しました' : 'お申込みが完了しました') + '</h1>' +
        '<p class="site-join__lead">' + phrases(f.name + 'さん、' + (J.rejoin ? 'おかえりなさい。' : 'ご入会ありがとうございます。') + '今日から会員ページを使えます。') + '</p>' +
      '</div>' +
      '<div class="site-panel site-idbox">' +
        '<h2 class="site-panel__ttl" id="site-id-ttl">会員番号</h2>' +
        '<p class="site-idbox__id mono" id="site-member-no" aria-labelledby="site-id-ttl site-member-no">' + esc(J.id) + '</p>' +
        '<button type="button" class="site-btn site-btn--ghost site-btn--s" data-join="copy">' + icon('copy', 'ico-s') + 'コピーする</button>' +
        (J.rejoin ?
          '<p class="site-idbox__pw">パスワードはこれまでと同じです。</p>' +
          '<a class="site-btn site-btn--primary site-btn--l site-btn--block" href="member.html#/home">会員ページへ進む</a>' :
          '<p class="site-idbox__pw">パスワードを決めるリンクを <span class="site-email">' + esc(email) + '</span> に送りました（24時間有効）。</p>' +
          '<a class="site-btn site-btn--primary site-btn--l site-btn--block" href="member.html#/set-password?token=demo-set">パスワードを決める</a>') +
      '</div>' +
      '<div class="site-panel">' +
        '<h2 class="site-panel__ttl">ご契約の控え</h2>' + kvTable(keep, 'site-kv--confirm site-kv--stack') +
      '</div>' +
      (J.rejoin ? '' :
        '<div class="site-done__next">' +
          '<h2 class="site-panel__ttl">最初の1週間にやること</h2>' +
          '<ol>' + week1.map(function (s) { return '<li>' + jp(s.title) + '</li>'; }).join('') + '</ol>' +
          '<p><a class="site-link site-more" href="member.html#/start">スタートガイドで進める</a></p>' +
        '</div>') +
    '</div>';
  }

  function joinPage() {
    var i = STEP_KEYS.indexOf(J.step) + 1;
    var body = J.step === 'confirm' ? stepConfirm() : J.step === 'pay' ? stepPay() : J.step === 'done' ? stepDone() : stepInput();
    // 再入会の入口（ログインを頼む画面）はまだ手続きの前なので、段の表示を出さない
    var gate = J.step === 'input' && J.rejoin && !rejoinable();
    return '<div class="site-wrap site-wrap--narrow site-join' + (gate ? ' site-join--gate' : '') + '">' +
      (gate ? '' : stepper(JOIN_STEPS, i, J.step === 'done')) + '<div class="site-join__body">' + body + '</div></div>';
  }

  /** 申込みを確定する（確認 → お支払い）。18歳以上の確認と、登録済みのメールアドレスを見る */
  function confirmJoin(btn) {
    if (J.busy || J.confirming) return;
    var box = doc.getElementById('f-adult');
    J.f.adult = !!(box && box.checked);
    if (!J.f.adult) {
      J.err.adult = '年齢の確認が必要です';
      showMsg('f-adult', J.err.adult, '');
      if (box) box.focus();
      saveJoin();
      return;
    }
    if (!J.rejoin && isRegistered(J.f.email)) {
      J.dup = true; J.confirmed = false; saveJoin();
      renderMain(false);
      focusEl(doc.getElementById('join-dup'), true);
      return;
    }
    // 2回押しても1回だけ進む
    J.confirming = true;
    btn.setAttribute('disabled', '');
    J.confirmed = true; J.dup = false; saveJoin();
    goJoin('pay');
    setTimeout(function () { J.confirming = false; }, 400);
  }

  function pay(btn, card) {
    if (J.busy || J.paid) return;
    J.busy = true; J.payState = ''; J.canceled = false;
    if (card) J.card = card;
    U.$$('button', main).forEach(function (b) { b.setAttribute('disabled', ''); });
    btn.setAttribute('aria-busy', 'true');
    btn.innerHTML = '<span class="site-spin" aria-hidden="true"></span>決済しています…';
    var st = doc.getElementById('pay-status');
    if (st) st.textContent = '決済しています。画面を閉じずにお待ちください。';
    setTimeout(function () {
      var f = J.f;
      if (J.rejoin && rejoinable()) {
        R.setPlanDemo('active');
        CLG.store.login();
      } else {
        CLG.store.startFresh({ name: f.name.trim(), kana: f.kana.trim(), email: half(f.email).trim(), area: f.pref, job: f.job,
          ref: f.ref ? refCheck(f.ref).code || f.ref : '', card: J.card === 'other' ? 'Mastercard •••• 5454' : '' });
      }
      J.id = CLG.store.state.me.id;
      J.busy = false; J.paid = true; J.paidAt = CLG.now().toISOString();
      saveJoin();
      // 決済の待ち時間に別のページへ移っていたら、そのページは描き直さない（戻ったときに完了の段を出す）
      if (current === 'join') replaceHash(joinHash('done'));
    }, 1100);
  }

  function joinAct(name, el) {
    if (J.busy) return;
    if (name === 'edit') {
      J.confirmed = false; J.dup = false; saveJoin();
      pendingFocus = el.getAttribute('data-focus') ? '#f-' + el.getAttribute('data-focus') : null;
      goJoin('input');
    } else if (name === 'confirm') confirmJoin(el);
    else if (name === 'back') goJoin('confirm');
    else if (name === 'pay') {
      if (el.getAttribute('data-card') === 'other') U.toast('本番では Stripe の画面で別のカードを入れます');
      pay(el, el.getAttribute('data-card') || '');
    } else if (name === 'demo-fail') {
      J.payState = 'failed'; J.canceled = false;
      renderMain(false);
      focusEl(doc.getElementById('pay-state'), true);
    } else if (name === 'demo-cancel') {
      // Stripe の cancel_url で戻ってきたことにする
      var h = joinHash('pay') + '&canceled=1';
      J.payState = '';
      if (global.location.hash === h) { J.canceled = true; renderMain(false); focusEl(doc.getElementById('pay-state'), true); }
      else { pendingFocus = '#pay-state'; replaceHash(h); }
    } else if (name === 'demo-dup') {
      J.dup = true; J.confirmed = false; saveJoin();
      pendingFocus = '#join-dup';
      goJoin('confirm');
    } else if (name === 'copy') {
      U.copyText(J.id).then(function () { U.toast('会員番号をコピーしました', 'ok'); });
    } else if (name === 'fix-email') {
      fixEmail(el);
    }
  }

  /* ============================================================
     お問い合わせ（#/contact）
     入力 → 確認（?step=confirm）→ 送信（?step=sent）。試作版はどこにも送らない（決定事項）
     ============================================================ */
  var CONTACT_KINDS = ['入会前の質問', '支払い', 'ログインできない', '取材・提携', 'その他'];
  var CONTACT_STEPS = ['入力', '確認', '送信'];
  var CONTACT_KEYS = ['input', 'confirm', 'sent'];
  var CONTACT_KEY = 'terakoya-contact';
  var CFIELDS = ['name', 'email', 'kind', 'body', 'agree'];
  var BODY_MAX = 2000;
  var C = null;
  function blankContact() { return { step: 'input', f: { name: '', email: '', kind: '', body: '', agree: false }, err: {}, ok: {}, sent: false, no: '', busy: false }; }
  function resetContact() { C = blankContact(); ss(CONTACT_KEY, null); }
  function saveContact() { ss(CONTACT_KEY, { f: C.f, sent: C.sent, no: C.no, sentSeen: !!C.sentSeen, confirmed: !!C.confirmed }); }
  (function restoreContact() {
    C = blankContact();
    var d = ss(CONTACT_KEY);
    if (!d || !d.f) return;
    CFIELDS.forEach(function (k) { if (d.f[k] != null) C.f[k] = d.f[k]; });
    C.sent = !!d.sent; C.no = d.no || ''; C.sentSeen = !!d.sentSeen; C.confirmed = !!d.confirmed;
  })();
  function checkContact(name, v) {
    v = typeof v === 'string' ? v.trim() : v;
    if (name === 'name') {
      if (!v) return 'お名前を入力してください';
      if (v.length > 40) return 'お名前は40文字までで入力してください';
    }
    if (name === 'email') return emailError(half(v).trim());
    if (name === 'kind' && !v) return 'お問い合わせの種類を選んでください';
    if (name === 'body') {
      if (!v) return '内容を入力してください';
      if (v.length > BODY_MAX) return '内容は' + U.num(BODY_MAX) + '文字までで入力してください';
    }
    if (name === 'agree' && !v) return 'プライバシーポリシーへの同意が必要です';
    return '';
  }
  function contactOk() { return CFIELDS.every(function (k) { return !checkContact(k, C.f[k]); }); }
  function contactHash(step) { return '#/contact' + (step && step !== 'input' ? '?step=' + step : ''); }
  function allowedContact(want) {
    if (C.sent) return 'sent';
    if (want === 'sent') want = 'confirm';
    if (want === 'confirm' && !contactOk()) want = 'input';
    return want;
  }
  function routeContact(q, entering) {
    var want = CONTACT_KEYS.indexOf(q.step) >= 0 ? q.step : 'input';
    // 送信のあと、戻るで前の段へ来たときは、お問い合わせより前のページまで戻す
    if (!entering && C.sent && C.sentSeen && want !== 'sent') { skipBack(contactHash('sent')); return false; }
    if (entering) {
      if (C.sent && C.sentSeen && want !== 'sent') resetContact();
      // 会員ページの「ログインできない」などから来たときは、種類を選んだ状態で開く
      if (q.kind && CONTACT_KINDS.indexOf(q.kind) >= 0 && !C.f.kind && !C.sent) C.f.kind = q.kind;
    }
    var ok = allowedContact(want);
    if (ok !== want) { replaceHash(contactHash(ok)); return false; }
    C.step = want;
    return true;
  }

  function contactInput() {
    var F = C, p = 'c-', len = (C.f.body || '').length;
    return '<div class="site-join__head">' +
        '<h1 class="site-join__ttl" data-page-title tabindex="-1">お問い合わせ</h1>' +
        '<p class="site-join__lead">' + jp(SITE.replySla) + '。受付時間は<span class="site-nw">' + esc(SITE.contactHours) + '</span>です。</p>' +
      '</div>' +
      '<form class="site-panel site-form" id="site-contact-form" novalidate>' +
        '<div class="site-field-row">' +
          fieldBox(F, p, 'name', 'お名前', { control: inputHtml(F, p, 'name', 'text', ' autocomplete="name" placeholder="例：山田 はな" maxlength="40"', { required: true }) }) +
          fieldBox(F, p, 'kind', 'お問い合わせの種類', { control: selectHtml(F, p, 'kind', CONTACT_KINDS, '選んでください', { required: true }) }) +
        '</div>' +
        fieldBox(F, p, 'email', 'メールアドレス', { cls: 'site-field--email', hint: true, help: '返信はこのアドレスに届きます。',
          control: inputHtml(F, p, 'email', 'email', ' autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" placeholder="例：name@example.jp"',
            { required: true, help: true, hint: true }) }) +
        fieldBox(F, p, 'body', '内容', {
          control: '<textarea class="site-input site-textarea" id="c-body" name="body" rows="7" maxlength="' + BODY_MAX + '" aria-required="true"' +
            ' aria-describedby="c-body-err c-body-help c-body-count"' + (C.err.body ? ' aria-invalid="true"' : '') + '>' +
            esc(C.f.body || '') + '</textarea>' +
            '<div class="site-field__foot"><p class="site-field__help" id="c-body-help">会員の方は、会員番号も書いてください。</p>' +
            '<p class="site-count" id="c-body-count"><span class="num" data-count>' + U.num(len) + '</span> / ' + U.num(BODY_MAX) + '文字</p></div>' }) +
        consentHtml(F, p, 'agree', newTabLink('index.html#/privacy', 'プライバシーポリシー'), 'に同意します') +
        '<div class="site-form__foot">' +
          '<p class="site-form__sum" id="site-form-sum" aria-live="polite"></p>' +
          '<button type="submit" class="site-btn site-btn--ink site-btn--l site-btn--block">確認画面へ進む</button>' +
        '</div>' +
      '</form>';
  }
  function contactConfirm() {
    var f = C.f;
    return '<div class="site-join__head">' +
        '<h1 class="site-join__ttl" data-page-title tabindex="-1">送る内容の確認</h1>' +
        '<p class="site-join__lead">まだ送っていません。</p>' +
      '</div>' +
      '<div class="site-panel">' +
        '<div class="site-panel__head"><h2 class="site-panel__ttl">お問い合わせの内容</h2>' +
          '<button type="button" class="site-textbtn site-edit" data-contact="edit">訂正する</button></div>' +
        kvTable([
          ['お名前', f.name], ['メールアドレス', '<span class="site-email">' + esc(half(f.email).trim()) + '</span>', true],
          ['種類', f.kind], ['内容', '<span class="site-pre">' + esc(f.body.trim()) + '</span>', true]
        ], 'site-kv--confirm site-kv--stack') +
      '</div>' +
      '<div class="site-join__btns">' +
        '<button type="button" class="site-btn site-btn--ghost site-btn--l" data-contact="edit">' + icon('back') + '内容を訂正する</button>' +
        '<button type="button" class="site-btn site-btn--ink site-btn--l" data-contact="send">送信する</button>' +
      '</div>' +
      '<p class="site-pay__status" id="contact-status" role="status" aria-live="polite"></p>';
  }
  function contactSent() {
    var f = C.f;
    return '<div class="site-join__head">' +
        '<h1 class="site-join__ttl" data-page-title tabindex="-1">送信しました</h1>' +
        '<p class="site-join__lead">お問い合わせありがとうございます。' + jp(SITE.replySla) + '。</p>' +
      '</div>' +
      '<div class="site-panel">' +
        kvTable([
          ['受付番号', '<span class="mono site-nw">' + esc(C.no) + '</span>', true],
          ['種類', f.kind],
          ['控えのメール', '<span class="site-email">' + esc(half(f.email).trim()) + '</span> に送りました', true],
          ['受付時間', SITE.contactHours + '（土日祝・年末年始を除く）']
        ], 'site-kv--confirm site-kv--stack') +
      '</div>' +
      (f.kind === 'ログインできない' ?
        '<p class="site-join__notice">パスワードを忘れた方は、<a class="site-link" href="member.html#/forgot">パスワードの再設定</a>からすぐに入り直せます。</p>' : '') +
      '<p class="site-join__notice"><a class="site-btn site-btn--ghost" href="#/">トップへ戻る</a></p>';
  }
  function contactPage() {
    var i = CONTACT_KEYS.indexOf(C.step) + 1;
    var body = C.step === 'confirm' ? contactConfirm() : C.step === 'sent' ? contactSent() : contactInput();
    return '<div class="site-wrap site-wrap--narrow site-join site-contact">' + stepper(CONTACT_STEPS, i, C.step === 'sent') + '<div class="site-join__body">' + body + '</div></div>';
  }
  function sendContact(btn) {
    if (C.busy || C.sent) return;
    C.busy = true;
    U.$$('button', main).forEach(function (b) { b.setAttribute('disabled', ''); });
    btn.setAttribute('aria-busy', 'true');
    btn.innerHTML = '<span class="site-spin" aria-hidden="true"></span>送信しています…';
    var st = doc.getElementById('contact-status');
    if (st) st.textContent = '送信しています。';
    setTimeout(function () {
      var n = CLG.now();
      C.no = 'C-' + String(n.getFullYear()).slice(2) + U.pad(n.getMonth() + 1) + U.pad(n.getDate()) + '-' + String(1000 + n.getTime() % 9000).slice(-4);
      C.busy = false; C.sent = true; saveContact();
      if (current === 'contact') replaceHash(contactHash('sent'));
    }, 700);
  }
  function contactAct(name, el) {
    if (C.busy) return;
    if (name === 'edit') { C.confirmed = false; saveContact(); go(contactHash('input')); }
    else if (name === 'send') sendContact(el);
  }

  /* ---------- フォームの動き（申込み・お問い合わせで共通） ---------- */
  var FORMS = {
    'site-join-form': { p: 'f-', fields: FIELDS, check: checkJoin, state: function () { return J; }, save: function () { saveJoin(); },
      change: function (name) { J.confirmed = false; if (name === 'email') J.dup = false; if (name === 'ref') { J.refTouched = true; J.ok.ref = ''; } },
      submit: function () { J.dup = false; saveJoin(); goJoin('confirm'); } },
    'site-contact-form': { p: 'c-', fields: CFIELDS, check: checkContact, state: function () { return C; }, save: function () { saveContact(); },
      change: function () { C.confirmed = false; }, submit: function () { C.confirmed = true; saveContact(); go(contactHash('confirm')); } }
  };
  function specOf(el) { var f = el && el.form; return f && FORMS[f.id] ? FORMS[f.id] : null; }
  function readField(el) { return el.type === 'checkbox' ? el.checked : el.value; }

  /** 1つの欄の知らせだけを書き換える（入力中に全体を描き直すと、カーソルが飛ぶため） */
  function showMsg(id, e, ok) {
    var box = main && main.querySelector('[data-field="' + id + '"]');
    if (!box) return;
    var p = doc.getElementById(id + '-err'), inp = box.querySelector('input,select,textarea');
    box.classList.toggle('is-err', !!e);
    if (p) {
      p.classList.toggle('is-ok', !e && !!ok);
      p.innerHTML = e ? icon('info', 'ico-s') + '<span>' + esc(e) + '</span>' : ok ? icon('check', 'ico-s') + '<span>' + esc(ok) + '</span>' : '';
    }
    if (inp) { if (e) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid'); }
  }
  function badCount(S, spec) { return spec.fields.filter(function (k) { return S.err[k]; }).length; }
  /** まとめの知らせ（何か所まちがっているか）。一度出したら、直すたびに数を合わせる */
  function updateSum(S, spec) {
    var sum = doc.getElementById('site-form-sum');
    if (!sum) return;
    var n = badCount(S, spec);
    if (!S.sumShown || !n) { sum.textContent = ''; if (!n) S.sumShown = false; return; }
    sum.textContent = '入力内容をご確認ください（' + n + 'か所）';
  }
  function refOkText(v) {
    if (!v) return '';
    var r = refCheck(v);
    return r.ok && !r.empty ? r.message || '有効な紹介コードです' : '';
  }
  function showHint(spec, v) {
    var h = doc.getElementById(spec.p + 'email-hint');
    if (!h) return;
    var s = typoOf(half(v));
    // 同じ候補なら描き直さない（欄を離れたときの change で「直す」が作り直され、押した操作が消えるため）
    if ((h.getAttribute('data-s') || '') === s) return;
    h.setAttribute('data-s', s);
    h.innerHTML = s ? '<span>もしかして <b class="site-email">' + esc(s) + '</b> ですか？</span>' +
      '<button type="button" class="site-textbtn" data-join="fix-email" data-fix="' + esc(s) + '" data-form="' + esc(spec.p) + '">直す</button>' : '';
  }
  function fixEmail(el) {
    var p = el.getAttribute('data-form') || 'f-', v = el.getAttribute('data-fix') || '';
    var inp = doc.getElementById(p + 'email');
    if (!inp) return;
    inp.value = v;
    var spec = specOf(inp), S = spec.state();
    S.f.email = v; S.err.email = spec.check('email', v);
    showMsg(p + 'email', S.err.email, '');
    showHint(spec, v);
    updateSum(S, spec); spec.save();
    inp.focus();
  }
  function onFormInput(e) {
    var el = e.target, spec = specOf(el);
    if (!spec || !el.name || spec.fields.indexOf(el.name) < 0) {
      if (el && el.id === 'f-adult') { J.f.adult = el.checked; if (el.checked) { J.err.adult = ''; showMsg('f-adult', '', ''); } saveJoin(); }
      return;
    }
    var S = spec.state(), name = el.name;
    S.f[name] = readField(el);
    spec.change(name);
    if (el.tagName === 'SELECT') el.classList.toggle('is-empty', !el.value);
    if (name === 'body') { var c = main.querySelector('[data-count]'); if (c) c.textContent = U.num(el.value.length); }
    if (name === 'email') showHint(spec, el.value);
    if (S.err[name] || el.type === 'checkbox' || el.tagName === 'SELECT') { S.err[name] = spec.check(name, S.f[name]); showMsg(spec.p + name, S.err[name], ''); }
    else if (name === 'ref') showMsg(spec.p + name, '', '');
    updateSum(S, spec);
    spec.save();
  }
  /* 欄を離れたときの知らせは、押している最中なら押し終わってから出す。
     知らせが出ると下のボタン・チェックが押し下げられ、押したつもりの「確認画面へ進む」「同意」が空振りするため */
  var ptrDown = false, blurQueue = [];
  function holdStart() { ptrDown = true; }
  function holdEnd() {
    setTimeout(function () {
      ptrDown = false;
      var q = blurQueue; blurQueue = [];
      q.forEach(function (f) { f(); });
    }, 0);
  }
  function onFormBlur(e) {
    var el = e.target;
    if (ptrDown) { blurQueue.push(function () { if (main.contains(el)) checkOnBlur(el); }); return; }
    checkOnBlur(el);
  }
  function checkOnBlur(el) {
    var spec = specOf(el);
    if (!spec || !el.name || spec.fields.indexOf(el.name) < 0 || el.type === 'checkbox') return;
    var S = spec.state(), v = readField(el);
    if (typeof v === 'string' && !v.trim()) { if (el.name === 'ref') { S.err.ref = ''; S.ok.ref = ''; showMsg(spec.p + 'ref', '', ''); } return; }
    S.err[el.name] = spec.check(el.name, v);
    if (el.name === 'ref') {
      S.ok.ref = S.err.ref ? '' : refOkText(v);
      // 有効なコードは大文字の形にそろえて見せる
      if (S.ok.ref && refCheck(v).code) { S.f.ref = refCheck(v).code; el.value = S.f.ref; spec.save(); }
    }
    showMsg(spec.p + el.name, S.err[el.name], S.ok[el.name] || '');
    updateSum(S, spec);
  }
  function onFormSubmit(e) {
    var form = e.target, spec = form && FORMS[form.id];
    if (!spec) return;
    e.preventDefault();
    var S = spec.state(), firstBad = null, bad = 0;
    spec.fields.forEach(function (k) {
      var el = form.elements[k];
      if (el) { var v = readField(el); S.f[k] = typeof v === 'string' ? v.trim() : v; }
      if (k === 'email' && typeof S.f[k] === 'string') { S.f[k] = half(S.f[k]).trim(); if (el) el.value = S.f[k]; }
      S.err[k] = spec.check(k, S.f[k]);
      if (k === 'ref') S.ok.ref = S.err.ref ? '' : refOkText(S.f.ref);
      showMsg(spec.p + k, S.err[k], (S.ok && S.ok[k]) || '');
      if (S.err[k]) { bad++; if (!firstBad) firstBad = el; }
    });
    spec.save();
    if (bad) {
      S.sumShown = true;
      updateSum(S, spec);
      if (firstBad && firstBad.focus) {
        // 上に貼り付いたヘッダーの下に隠れないよう、欄を画面の中ほどへ
        try { firstBad.focus({ preventScroll: true }); } catch (x) { firstBad.focus(); }
        var box = firstBad.closest ? firstBad.closest('.site-field') : null;
        if (box && box.scrollIntoView) {
          try { box.scrollIntoView({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' }); } catch (x) { box.scrollIntoView(); }
        }
      }
      return;
    }
    S.sumShown = false;
    spec.submit();
  }
  /** 描いたあとの欄の知らせ（紹介コードは入っていれば確かめて見せる） */
  function afterFormRender() {
    var inp = doc.getElementById('f-ref');
    if (inp && J.f.ref && !J.err.ref) {
      var t = refOkText(J.f.ref);
      if (t) { J.ok.ref = t; showMsg('f-ref', '', t); }
      else if (J.f.ref && !J.refTouched) { J.err.ref = checkJoin('ref', J.f.ref); showMsg('f-ref', J.err.ref, ''); }
    }
    ['f-', 'c-'].forEach(function (p) {
      var em = doc.getElementById(p + 'email');
      if (em && em.value) showHint(specOf(em), em.value);
    });
  }

  /* ============================================================
     運営と講師（#/about）・運営会社（#/company）・講座の一覧（#/curriculum）・お知らせ（#/news）
     ============================================================ */
  function personBlock(id, extra) {
    var p = person(id); if (!p) return '';
    return '<li class="site-person">' + avatar(p) +
      '<div class="site-person__body">' +
        '<p class="site-person__name"><span class="site-nw"><b>' + esc(p.name) + '</b>（仮）</span><span class="site-team__role">' + esc(p.role || '') + '</span></p>' +
        (p.bio ? '<p class="site-person__bio">' + jp(p.bio) + '</p>' : '') +
        (extra || '') +
      '</div></li>';
  }
  function coursesLine(id) {
    var cs = taught(id);
    return cs.length ? '<p class="site-person__sub site-person__courses">教える講座：' + cs.map(function (c) {
      return '<a class="site-link site-nw" href="#/curriculum?c=' + encodeURIComponent(c.id) + '">' + esc(c.title) + '</a>';
    }).join('、') + '</p>' : '';
  }
  /** 名前の由来（1文だけ。運営と講師のページの「運営会社」の下）。合言葉が無ければ出さない */
  function nameOrigin() {
    var t = String(SITE.tagline || '').replace(/[。．.]+$/, '');
    if (!t) return '';
    return '<p class="site-page__p site-page__origin">' +
      // 合言葉の「」の中は途中で折らない（狭い画面で「人生を／大成させる」と割れないように）
      jp(SITE.name + (SITE.nameKana ? '（' + SITE.nameKana + '）' : '') + 'は') + '<span class="site-nw">「' + esc(t) + '」</span>' + jp('から取った名前です。') + '</p>';
  }
  /** 事業内容。狭い画面で「の運営」だけが次の行に落ちないよう、屋号からあとをまとめて折る */
  function bizLine() {
    return jp('オンラインスクール兼コミュニティ') + '<span class="site-nw">「' + esc(BRAND) + '」の運営</span>';
  }
  function about() {
    var teachers = ['staff3', 'staff4', 'staff5', 'guest2'];
    return '<article class="site-wrap site-wrap--narrow site-page">' +
      backLink() +
      '<h1 class="site-page__ttl" data-page-title tabindex="-1">運営と講師</h1>' +
      '<section class="site-page__sec"><h2 class="site-h3">運営会社</h2>' +
        kvTable([['会社名', '<a class="site-link site-hit" href="#/company">' + esc(SITE.company) + '</a>', true],
          ['事業内容', bizLine(), true]], 'site-kv--page site-kv--stack') +
        nameOrigin() + '</section>' +
      '<section class="site-page__sec"><h2 class="site-h3">代表</h2><ul class="site-people">' + personBlock('staff1', coursesLine('staff1')) + '</ul></section>' +
      '<section class="site-page__sec"><h2 class="site-h3">コミュニティ運営</h2><ul class="site-people">' + personBlock('staff2', coursesLine('staff2')) + '</ul></section>' +
      '<section class="site-page__sec"><h2 class="site-h3">講師</h2><ul class="site-people">' +
        teachers.map(function (id) { return personBlock(id, coursesLine(id)); }).join('') + '</ul></section>' +
      '<section class="site-page__sec"><h2 class="site-h3">提携の専門家</h2>' +
        '<p class="site-page__p">会員は' + esc(EXPERT_NOTE) + 'で相談できます。</p><ul class="site-people">' +
        DATA.EXPERTS.map(function (x) {
          return personBlock(x.person, '<p class="site-person__sub">' + jp(x.office) + '。' + jp(x.desc) + '</p>' + coursesLine(x.person));
        }).join('') + '</ul></section>' +
    '</article>';
  }
  function company() {
    var TBD = '調整中（本番前に記載）';
    return '<article class="site-wrap site-wrap--narrow site-page">' +
      backLink() +
      '<h1 class="site-page__ttl" data-page-title tabindex="-1">運営会社</h1>' +
      kvTable([
        ['会社名', SITE.company],
        ['代表', kari(person('staff1'))],
        ['所在地', TBD],
        ['設立', TBD],
        ['事業内容', bizLine(), true],
        ['お問い合わせ', '<a class="site-link site-nw" href="#/contact">お問い合わせのフォーム</a><span class="site-nw">（' + esc(SITE.contactHours) + '）</span>', true]
      ], 'site-kv--page site-kv--stack') +
      '<p class="site-page__p"><a class="site-link site-more" href="#/about">運営と講師</a></p>' +
    '</article>';
  }
  function curriculum() {
    var sample = DATA.COURSES[0], sl = sample && sample.lessons[0];
    var minutes = function (c) { return c.lessons.reduce(function (a, l) { return a + l.min; }, 0); };
    return '<article class="site-wrap site-wrap--narrow site-page site-cur">' +
      backLink() +
      '<h1 class="site-page__ttl" data-page-title tabindex="-1">講座の一覧</h1>' +
      '<p class="site-page__lead">' + jp(SITE.contentLine + '。' + SITE.lessonLength + 'です。') + '</p>' +
      (sl ? '<section class="site-cur__sample" aria-labelledby="h-sample">' +
        '<h2 class="site-h3" id="h-sample">見本の回：' + esc(sample.title) + ' 第1回「' + esc(sl.title) + '」（' + esc(sl.min) + '分）</h2>' +
        (sl.desc ? '<p>' + jp(sl.desc) + '</p>' : '') +
        (sl.points ? '<ul class="site-bullets">' + sl.points.map(function (t) { return '<li>' + jp(t) + '</li>'; }).join('') + '</ul>' : '') +
        '<p><a class="site-btn site-btn--ghost" href="member.html?demo=1#/lesson/' + encodeURIComponent(sample.id) + '/' + encodeURIComponent(sl.id) + '">デモの会員ページで見る</a></p>' +
      '</section>' : '') +
      DATA.FACULTIES.map(function (fac) {
        var list = DATA.COURSES.filter(function (c) { return c.faculty === fac.id; }).sort(function (a, b) { return a.level - b.level; });
        if (!list.length) return '';
        return '<section class="site-cur__fac" aria-labelledby="fac-' + esc(fac.id) + '">' +
          '<h2 class="site-h2" id="fac-' + esc(fac.id) + '">' + esc(fac.name) + '</h2>' +
          '<p class="site-cur__desc">' + jp(fac.desc) + '</p>' +
          list.map(function (c) {
            var t = person(c.teacher);
            return '<div class="site-cur__course" id="c-' + esc(c.id) + '">' +
              '<h3 class="site-h3" tabindex="-1">' + esc(c.title) + '</h3>' +
              '<p class="site-cur__meta">Lv' + esc(c.level) + 'で開く・全' + c.lessons.length + '回・' + minutes(c) + '分' + (t ? '・講師 <span class="site-nw">' + esc(kari(t)) + '</span>' : '') + '</p>' +
              '<p class="site-cur__sum">' + jp(c.summary) + '</p>' +
              '<ol class="site-cur__lessons">' + c.lessons.map(function (l, i) {
                return '<li><span class="site-cur__no">第' + (i + 1) + '回</span><span class="site-cur__lt">' + jp(l.title) + '</span><span class="site-cur__min num">' + esc(l.min) + '分</span></li>';
              }).join('') + '</ol>' +
            '</div>';
          }).join('') +
        '</section>';
      }).join('') +
      '<p class="site-page__p">講座はレベルで順に開きます。<a class="site-link site-nw" href="#/levels">講座とレベル</a></p>' +
    '</article>';
  }
  function newsItems() {
    var e4 = eventOf('showcase'), D = SITE.docsDate || {};
    return [
      // 公開した日（制定日）より前の日付にしない
      e4 ? [DATA.D(-1, 12), '次の成果発表会は' + U.fmtShort(e4.at, true) + 'から。' + (e4.place || 'オンライン') + 'で開きます。', ''] : null,
      D.revised ? [D.revised + 'T10:00:00', '利用規約・プライバシーポリシー・特定商取引法に基づく表記を改定しました。', '#/terms'] : null,
      D.made ? [D.made + 'T10:00:00', BRAND + 'の試作版を公開しました。', ''] : null
    ].filter(Boolean).sort(function (a, b) { return new Date(b[0]) - new Date(a[0]); });
  }
  function news() {
    return '<article class="site-wrap site-wrap--narrow site-page">' +
      backLink() +
      '<h1 class="site-page__ttl" data-page-title tabindex="-1">お知らせ</h1>' +
      '<ul class="site-news">' + newsItems().map(function (n) {
        return '<li><time class="num" datetime="' + esc(new Date(n[0]).toISOString().slice(0, 10)) + '">' + esc(U.fmtDate(n[0], { wd: false })) + '</time>' +
          '<p>' + jp(n[1]) + (n[2] ? ' <a class="site-link" href="' + esc(n[2]) + '">読む</a>' : '') + '</p></li>';
      }).join('') + '</ul>' +
    '</article>';
  }

  /* ---------- 見つからない ---------- */
  function notFound() {
    return '<section class="site-wrap site-wrap--narrow site-page site-nf">' +
      '<h1 class="site-page__ttl" data-page-title tabindex="-1">ページが見つかりません</h1>' +
      '<p class="site-page__lead">アドレスが違うか、ページがなくなりました。</p>' +
      '<ul class="site-nf__links">' +
        '<li><a class="site-btn site-btn--ghost" href="#/">トップ</a></li>' +
        '<li><a class="site-btn site-btn--ghost" href="#/join">入会のお申込み</a></li>' +
        '<li><a class="site-btn site-btn--ghost" href="member.html">ログイン</a></li>' +
        '<li><a class="site-btn site-btn--ghost" href="#/contact">お問い合わせ</a></li>' +
      '</ul>' +
    '</section>';
  }

  /* ============================================================
     表記のページ（ひな形）。本番の前に弁護士の確認を受ける
     ============================================================ */
  function docDates() {
    var D = SITE.docsDate || {};
    return '<p class="site-doc__dates">' + (D.made ? '制定：' + esc(U.fmtDate(D.made + 'T12:00:00', { wd: false })) : '') +
      (D.revised && D.revised !== D.made ? '<span>改定：' + esc(U.fmtDate(D.revised + 'T12:00:00', { wd: false })) + '</span>' : '') + '</p>';
  }
  /** 表記の題。titleHtml は折り返しの位置を決めたいときだけ（狭い画面で「表記」だけが次の行に残らないように） */
  function docPage(title, body, toc, titleHtml) {
    return '<article class="site-wrap site-wrap--narrow site-doc">' +
      backLink() +
      '<h1 class="site-doc__ttl" data-page-title tabindex="-1">' + (titleHtml || esc(title)) + '</h1>' +
      docDates() +
      '<p class="site-doc__draft"><b>ひな形です。</b>試作版のための下書きで、本番の前に弁護士の確認を受けて差し替えます。</p>' +
      (toc && toc.length ? '<nav class="site-doc__toc" aria-label="目次"><p class="site-doc__tocttl">目次</p><ol>' + toc.map(function (t) {
        return '<li><a href="#/' + t[0] + '" data-doc="' + esc(t[1]) + '">' + esc(t[2]) + '</a></li>';
      }).join('') + '</ol></nav>' : '') +
      body +
    '</article>';
  }
  function ol(items) { return '<ol class="site-doc__ol">' + items.map(function (t) { return '<li>' + jp(t) + '</li>'; }).join('') + '</ol>'; }
  function para(t) { return '<p>' + jp(t) + '</p>'; }

  function tokushoho() {
    var TBD = '調整中（本番前に記載）';
    return docPage('特定商取引法に基づく表記', kvTable([
      ['事業者名', TBD],
      ['代表者または運営統括責任者', TBD],
      ['所在地', TBD],
      ['電話番号', TBD],
      ['メールアドレス', esc(TBD) + '。<a class="site-link site-nw" href="#/contact">お問い合わせのフォーム</a>からも受け付けます', true],
      ['受付時間', SITE.contactHours + '（土日祝・年末年始を除く）。' + SITE.replySla],
      ['サービス名', COND.service],
      ['販売価格', '月額' + COND.monthly],
      ['入会金', COND.entry],
      ['役務の内容', COND.content + '。'],
      ['商品代金以外の必要料金', COND.extraLegal],
      ['支払方法', COND.payment],
      ['支払時期', COND.timing],
      ['役務の提供時期', COND.start],
      ['契約期間と更新', COND.term],
      ['解約', COND.cancel + '。'],
      ['申込みの撤回・解除', '決済の完了後にお申込みを取り消すことはできません。インターネットでの申込み（通信販売）には、クーリング・オフの制度はありません。やめるときは、上の「解約」のとおりです。'],
      ['返品・返金', COND.refund],
      ['成果について', '講座や案件で得られる成果・収入には個人差があります。成果や収入を保証するものではありません。'],
      ['動作環境', 'パソコン：Windows 10以降・macOS 12以降の Google Chrome、Microsoft Edge、Safari（いずれも最新版）。スマートフォン：iOS 16以降の Safari、Android 10以降の Google Chrome。動画を見るには 3Mbps 以上の回線をおすすめします。']
    ], 'site-kv--doc site-kv--stack'), null, '<span class="site-nb">特定商取引法に</span><span class="site-nb">基づく表記</span>');
  }

  var TERMS = [
    ['この規約について', function (co) {
      return ol([
        'この規約は、' + co + '（以下「当社」）が運営する「' + BRAND + '」（以下「本サービス」）を使うときの約束ごとです。',
        '本サービスは、講座・イベント・案件の紹介・運営への相談などを通じて、会員が副業を学び、小さく試す場です。',
        '会員は、この規約に同意したうえで本サービスを使います。'
      ]);
    }],
    ['会員', function () {
      return ol([
        '所定の方法で申し込み、当社が承諾した方を会員とします。',
        '会員は18歳以上の方とします。18歳未満の方は、保護者の同意を得て申し込んでください。',
        '会員番号とパスワードは会員本人が管理し、他人に使わせてはいけません。'
      ]);
    }],
    ['料金と支払い', function () {
      return ol([
        '料金は月額' + COND.monthly + '、入会金は' + COND.entry + 'です。',
        '支払方法：' + COND.payment,
        '支払時期：' + COND.timing,
        '契約は、' + COND.billing + 'とします。'
      ]);
    }],
    ['解約と返金', function () {
      return ol([
        '解約：' + COND.cancel + '。',
        '返金：' + COND.refund + '。'
      ]);
    }],
    ['退会・資格停止', function () {
      return para('会員が退会するときは、第4条の解約の手続きをします。') +
        para('当社は、会員が次のどれかに当たるときは、事前に通知せず、本サービスの利用を止め、または会員の資格を取り消すことがあります。') + ol([
        '第6条の禁止事項をしたとき',
        '料金の支払いが確認できないとき',
        '登録した内容に偽りがあったとき',
        'そのほか、会員として適当でないと当社が判断したとき'
      ]) + para('資格を取り消したときも、すでに支払われた料金は返金しません（法令で認められる場合を除く）。');
    }],
    ['禁止事項', function () {
      return para('会員は、次のことをしてはいけません。') + ol([
        'ほかの会員への勧誘・営業行為（案件ページの「会員どうし」の募集を除く）',
        '講座・勉強会の録画・資料の無断転載、転売、配布',
        '誹謗中傷、差別的な発言、ほかの会員の名誉やプライバシーを傷つける行為',
        '収入を約束・断定して本サービスを勧める行為',
        '法令または公序良俗に反する行為、本サービスの運営を妨げる行為'
      ]);
    }],
    ['紹介のルール', function () {
      return ol([
        '紹介の対象は1段（直接紹介した方）に限ります。紹介した方がさらにほかの方を紹介しても、最初に紹介した会員に報酬は発生しません。',
        '収入を約束する勧誘、紹介であることを隠した勧誘は禁止します。',
        '紹介の報酬の額・支払いの時期など、そのほかの詳細は別に定めます。'
      ]);
    }],
    ['貢献ポイント', function () {
      return ol([
        '貢献ポイントは、コミュニティへの貢献に応じて付ける点数です。',
        '現金その他の財産と交換することはできません。',
        '有効期限は、付与から1年です。'
      ]);
    }],
    ['知的財産', function () {
      return ol([
        '講座・録画・資料などの著作権は、当社または正当な権利を持つ方にあります。',
        '会員は、本サービスの中で自分が学ぶためにだけ使えます。',
        '会員がタイムラインなどに投稿した文章や画像の権利は、投稿した会員にあります。当社は、本サービスの運営とお知らせに必要な範囲で使うことがあります。'
      ]);
    }],
    ['サービスの変更・中断・終了', function () {
      return ol([
        '当社は、講座・イベント・案件などの内容を変更することがあります。',
        'システムの保守、災害、通信の障害などのときは、本サービスを一時的に止めることがあります。',
        '本サービスを終了するときは、1か月前までに会員ページでお知らせします。'
      ]);
    }],
    ['反社会的勢力の排除', function () {
      return ol([
        '会員は、暴力団、暴力団員、そのほかの反社会的勢力に当たらないこと、また関係を持たないことを約束します。',
        'これに反したときは、当社は直ちに会員の資格を取り消すことができます。'
      ]);
    }],
    ['免責', function () {
      return ol([
        '本サービスは学びと機会を提供するもので、収入や成果を保証するものではありません。案件の報酬は目安です。',
        '当社の故意または重大な過失による場合を除き、当社が負う賠償の額は、会員が直近1か月に支払った月額を上限とします。'
      ]);
    }],
    ['規約の変更', function () {
      return para('当社は、民法の定めに従ってこの規約を変更することがあります。変更するときは、効力が生じる日より前に、変更の内容と時期を会員ページとこのページでお知らせします。');
    }],
    ['準拠法・管轄', function () {
      return ol([
        'この規約は日本の法律に従って解釈します。',
        '本サービスについて争いが起きたときは、当社の本店の所在地を管轄する地方裁判所を、第一審の専属的な合意管轄裁判所とします。'
      ]);
    }]
  ];
  function terms() {
    var co = SITE.company, D = SITE.docsDate || {};
    var toc = TERMS.map(function (t, i) { return ['terms', 'a' + (i + 1), '第' + (i + 1) + '条 ' + t[0]]; }).concat([['terms', 'fu', '附則']]);
    var body = TERMS.map(function (t, i) {
      return '<section class="site-doc__art" id="doc-a' + (i + 1) + '"><h2 tabindex="-1">第' + (i + 1) + '条（' + esc(t[0]) + '）</h2>' + t[1](co) + '</section>';
    }).join('') +
      '<section class="site-doc__art" id="doc-fu"><h2 tabindex="-1">附則</h2>' +
        (D.made ? para('この規約は、' + U.fmtDate(D.made + 'T12:00:00', { wd: false }) + 'から実施します。') : '') +
        (D.revised && D.revised !== D.made ? para(U.fmtDate(D.revised + 'T12:00:00', { wd: false }) + '改定。') : '') +
      '</section>';
    return docPage('利用規約', body, toc);
  }

  function privacy() {
    var co = SITE.company, n = 0;
    function sec(t, body) { n++; return '<section class="site-doc__art" id="doc-p' + n + '"><h2 tabindex="-1">' + n + '. ' + esc(t) + '</h2>' + body + '</section>'; }
    var body = para(co + '（以下「当社」）は、' + BRAND + 'の会員とお申込みの方の個人情報を、次のとおり取り扱います。') +
      sec('取得する情報', ol([
        'お申込みのときに入力いただく情報（お名前、ふりがな、メールアドレス、住んでいる地域、お仕事、紹介コード）',
        '会員ページの利用記録（講座の視聴、投稿、イベントの予約、案件への応募など）',
        'お問い合わせ・ご相談の内容'
      ])) +
      sec('利用目的', ol([
        '本サービスの提供、本人確認、料金の請求',
        '新しい講座・案件・イベントなどのお知らせ',
        'サービスの改善、不正な利用の防止',
        'お問い合わせ・ご相談への対応'
      ])) +
      sec('会員どうしで表示される情報', ol([
        '会員ページでは、表示名・地域・レベル・入会した月・自己紹介・投稿が、ほかの会員に表示されます。',
        '地域は、はじめは都道府県までです。市区町村まで出すか、出さないかは本人が選べます。',
        '本名（表示名と別にした場合）・メールアドレス・住所・支払いの情報は、ほかの会員には表示しません。'
      ])) +
      sec('紹介の記録', ol([
        '紹介リンクが開かれた回数と、紹介コードで入会した方の記録（入会日・会員の状態）を、紹介した会員に表示します。',
        '紹介した会員に表示するのは、入会した方の名前の頭文字だけです。'
      ])) +
      sec('LINE連携で取得する情報', ol([
        'LINE連携をした会員からは、LINEのユーザーIDと表示名を受け取ります。',
        '返信・イベント・新しい案件などの通知を送るためだけに使います。',
        '連携を外すと、受け取った情報は消します。'
      ])) +
      sec('第三者への提供', ol([
        '法令に基づく場合を除き、ご本人の同意なく第三者に提供しません。',
        '案件に応募したときは、応募に必要な範囲（お名前・連絡先）を依頼主に提供します。応募の画面でお知らせします。',
        '決済・メール配信・システムの運用などを外部に任せるときは、必要な範囲で預け、適切に管理するよう求めます。'
      ])) +
      sec('決済の情報', para('クレジットカードの情報は、決済代行の Stripe が管理します。当社はカード番号を受け取らず、保持しません。')) +
      sec('Cookie・解析', ol([
        'ログインの状態を保つために、Cookie とブラウザの保存領域を使います。',
        'サービスの改善のために、利用状況の解析ツールを使うことがあります（使うツールは本番の前にここに記載します）。解析の情報に、お名前やメールアドレスは含めません。',
        'Cookie はブラウザの設定で止められます。止めると、ログインできないことがあります。'
      ])) +
      sec('安全管理措置', ol([
        '個人情報にさわれる従業者を必要な人だけにし、取り扱いのルールを定めて教育します。',
        '通信は暗号化し、会員ページへのログインにはパスワードを使います。',
        '外部に預けるときは、預け先の管理の状況を確かめます。'
      ])) +
      sec('開示等の手続き', ol([
        'ご本人から、個人情報の開示・訂正・利用の停止・削除のご請求があったときは、本人であることを確かめたうえで、遅滞なく対応します。',
        'ご請求は、下の窓口で受け付けます。手数料はいただきません。'
      ])) +
      sec('改定', para('このポリシーを変えるときは、会員ページとこのページでお知らせします。')) +
      sec('お問い合わせ窓口', kvTable([['窓口', co + '　個人情報のお問い合わせ窓口'],
        ['連絡先', '調整中（本番前に記載）。<a class="site-link site-nw" href="#/contact">お問い合わせのフォーム</a>からも受け付けます', true]], 'site-kv--doc site-kv--stack'));
    return docPage('プライバシーポリシー', body);
  }

  /* ============================================================
     画面の切り替え
     ============================================================ */
  var ROUTES = {
    '': { title: '', render: lp },
    join: { title: function () { return J.rejoin ? '再入会のお申込み' : '入会のお申込み'; }, render: joinPage, simple: true },
    contact: { title: 'お問い合わせ', render: contactPage },
    about: { title: '運営と講師', render: about },
    company: { title: '運営会社', render: company },
    curriculum: { title: '講座の一覧', render: curriculum },
    news: { title: 'お知らせ', render: news },
    tokushoho: { title: '特定商取引法に基づく表記', render: tokushoho },
    terms: { title: '利用規約', render: terms },
    privacy: { title: 'プライバシーポリシー', render: privacy },
    notfound: { title: 'ページが見つかりません', render: notFound }
  };

  function parse() {
    var h = String((global.location && global.location.hash) || '').replace(/^#\/?/, ''), q = {}, qi = h.indexOf('?');
    if (qi >= 0) { q = queryOf(h.slice(qi + 1)); h = h.slice(0, qi); }
    var parts = h.split('/').filter(Boolean);
    return { name: parts[0] || '', params: parts.slice(1), query: q };
  }

  var main = null, current = null, pendingScroll = null, pendingFocus = null, firstRender = true, curStep = null;

  function go(hash) {
    if (global.location.hash === hash) render();
    else global.location.hash = hash;
  }
  function replaceHash(h) {
    try { global.location.replace(h); } catch (e) { global.location.hash = h; }
  }
  /** 完了・送信のあとに戻るを押したとき、前の段（もう使えない）を飛ばして、その手続きより前のページまで戻す。
      それ以上戻れない（履歴の最初）ときは、完了・送信の段のまま */
  var skipTimer = null;
  function skipBack(stayHash) {
    var before = global.location.href;
    clearTimeout(skipTimer);
    try { global.history.back(); } catch (e) {}
    skipTimer = setTimeout(function () { if (global.location.href === before) replaceHash(stayHash); }, 500);
  }
  function focusEl(el, scroll) {
    if (!el) return;
    if (!el.hasAttribute('tabindex') && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) el.setAttribute('tabindex', '-1');
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
    if (scroll && el.scrollIntoView) {
      try { el.scrollIntoView({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' }); } catch (e) { el.scrollIntoView(); }
    }
  }
  var markTimer = null;
  function markTarget(el) {
    clearTimeout(markTimer);
    el.classList.add('is-target');
    markTimer = setTimeout(function () { el.classList.remove('is-target'); }, 1800);
  }
  function focusTitle() {
    var t = main && (main.querySelector('[data-page-title]') || main.querySelector('h1'));
    focusEl(t, false);
  }

  function scrollToSec(key, smooth, focus) {
    var el = doc.getElementById('sec-' + key);
    if (!el) return;
    try { el.scrollIntoView({ behavior: smooth && !reduceMotion() ? 'smooth' : 'auto', block: 'start' }); }
    catch (e) { el.scrollIntoView(); }
    // ヘッダーの案内から来たときは、その区切りの見出しへ焦点を移す（読み上げの位置も合わせる）
    if (focus) focusEl(el.querySelector('.site-h2'), false);
  }
  function goSection(key) {
    toggleMenu(false);
    if (current === '') { scrollToSec(key, true, true); spy(); return; }
    pendingScroll = key;
    global.location.hash = '#/';
  }

  function renderMain(toTop) {
    if (!main) return;
    var route = ROUTES[current] || ROUTES[''];
    main.innerHTML = route.render();
    if (current === 'join' && J.step === 'done') { J.doneSeen = true; saveJoin(); }
    if (current === 'contact' && C.step === 'sent') { C.sentSeen = true; saveContact(); }
    if (current === 'join' || current === 'contact') afterFormRender();
    if (toTop) global.scrollTo(0, 0);
    watchLp();
  }

  function render() {
    var r = parse();
    captureRef(r.query);
    var name = r.name.replace(/^sec-/, '');
    if (!ROUTES[name] || name === 'notfound') {
      // #/price のような古い書き方や、区切りの名前だけのリンクは、紹介ページのその場所へ
      if (SECTIONS.indexOf(name) >= 0) pendingScroll = name;
      name = SECTIONS.indexOf(name) >= 0 || !name ? '' : 'notfound';
    }
    var changed = name !== current;
    if (name === 'join' && !routeJoin(r.query, changed)) return;
    if (name === 'contact' && !routeContact(r.query, changed)) return;
    // 段と、再入会かどうか（同じ段でも中身が入れ替わるので、見出しへ焦点を移す）
    var step = name === 'join' ? J.step + (J.rejoin ? '-rejoin' : '') : name === 'contact' ? C.step : '';
    var stepChanged = !changed && step !== curStep;
    current = name; curStep = step;
    // 申込みの画面は屋号とログインだけの簡単なヘッダーにする（ほかへ気が散らないように）
    try { doc.body.setAttribute('data-route', name || 'lp'); } catch (e) {}
    renderMain(false);
    var route = ROUTES[name], t = typeof route.title === 'function' ? route.title() : route.title;
    if (name === 'curriculum' && r.query.c) pendingFocus = '#c-' + String(r.query.c).replace(/[^\w-]/g, '');
    // 規約のその条（紹介の画面の「第7条（紹介のルール）」から #/terms?art=7 で来る）
    if (name === 'terms' && r.query.art) pendingFocus = '#doc-a' + String(r.query.art).replace(/\D/g, '');
    doc.title = t ? t + '｜' + BRAND : LP_TITLE;
    toggleMenu(false);
    if (pendingScroll && name === '') {
      var key = pendingScroll; pendingScroll = null;
      // 読み込んだときの #/faq なども、その区切りの見出しへ焦点を置く（#/terms?art= と同じ。次の Tab がそこから進むように）
      scrollToSec(key, false, true);
    } else if (pendingFocus && main.querySelector(pendingFocus)) {
      var el = main.querySelector(pendingFocus); pendingFocus = null;
      // 講座・条は、その見出しへ焦点を置き、短く目印を付ける（どこへ来たかが分かるように）
      var anchor = el.matches('.site-cur__course, .site-doc__art');
      var target = anchor ? el.querySelector('h2, h3') : el;
      if (anchor || el.matches('.site-alert')) {
        try { el.scrollIntoView({ block: 'start' }); } catch (x) { el.scrollIntoView(); }
        focusEl(target, false);
        if (anchor) markTarget(el);
      } else { global.scrollTo(0, 0); focusEl(target, true); }
    } else if ((changed || stepChanged) && !firstRender) {
      global.scrollTo(0, 0);
      focusTitle();
    }
    pendingFocus = null;
    firstRender = false;
    markCurrent();
    spy();
  }
  /** メニューとフッターの、いま開いているページへのリンクに印を付ける（読み上げで「現在のページ」と分かるように。メニューでは太字） */
  function markCurrent() {
    U.$$('#site-menu a[href^="#/"], .site-foot__links a[href^="#/"]').forEach(function (a) {
      var to = a.getAttribute('href').replace(/^#\/?/, '').split('?')[0];
      if (to && to === current) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  /* ---------- 紹介ページの見張り（最初の画面の「入会する」・いまの区切り） ---------- */
  var heroIO = null, spyTick = false;
  function watchLp() {
    if (heroIO) { heroIO.disconnect(); heroIO = null; }
    doc.body.classList.remove('is-hero-cta');
    if (current !== '' || !('IntersectionObserver' in global)) return;
    var cta = main.querySelector('.site-hero__cta');
    if (!cta) return;
    // 最初の画面の「入会する」が見えているあいだは、ヘッダーの「入会する」を隠す（同じボタンが2つ並ばないように）
    heroIO = new global.IntersectionObserver(function (es) {
      doc.body.classList.toggle('is-hero-cta', es[0].isIntersecting);
    }, { rootMargin: '-56px 0px 0px 0px' });
    heroIO.observe(cta);
  }
  function spy() {
    var btns = U.$$('[data-scroll]');
    var cur = '';
    if (current === '') {
      var line = 140;
      SECTIONS.forEach(function (k) {
        var el = doc.getElementById('sec-' + k);
        if (el && el.getBoundingClientRect().top <= line) cur = k;
      });
    }
    var nav = { can: 'can', portal: 'portal', levels: 'levels', price: 'price', faq: 'faq' }[cur] || '';
    btns.forEach(function (b) {
      if (b.getAttribute('data-scroll') === nav) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    });
  }
  function onScroll() {
    if (spyTick) return;
    spyTick = true;
    (global.requestAnimationFrame || setTimeout)(function () { spyTick = false; spy(); });
  }

  /* ---------- 押したときの動き ---------- */
  function menuItems() {
    var m = doc.getElementById('site-menu');
    return m ? U.$$('button, a', m) : [];
  }
  /** open が省略なら開け閉めを入れ替える。byKey（キーボードで開いた）ときだけ、最初の項目へ焦点を移す */
  function toggleMenu(open, byKey) {
    var m = doc.getElementById('site-menu'), b = doc.querySelector('[data-site="menu"]');
    if (!m || !b) return;
    if (open == null) open = m.hidden;
    if (!open && m.hidden) return;
    m.hidden = !open;
    b.setAttribute('aria-expanded', open ? 'true' : 'false');
    b.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
    b.innerHTML = icon(open ? 'close' : 'menu');
    doc.body.classList.toggle('is-menu', !!open);
    if (open && byKey) { var first = menuItems()[0]; if (first) first.focus(); }
  }

  function siteAct(name, el, e) {
    if (name === 'menu') { toggleMenu(undefined, e && e.detail === 0); return; }
    if (name === 'skip') { e.preventDefault(); focusTitle(); return; }
    if (name === 'top') {
      try { global.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' }); } catch (x) { global.scrollTo(0, 0); }
      focusTitle();
    }
  }

  function onClick(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var menu = doc.getElementById('site-menu');
    if (menu && !menu.hidden && !t.closest('.site-head')) toggleMenu(false);

    var el = t.closest('[data-scroll],[data-site],[data-join],[data-contact],[data-doc],a[href^="#"]');
    if (!el) return;
    if (el.hasAttribute('data-scroll')) { e.preventDefault(); goSection(el.getAttribute('data-scroll')); return; }
    if (el.hasAttribute('data-site')) { siteAct(el.getAttribute('data-site'), el, e); return; }
    if (el.hasAttribute('data-join')) { if (el.disabled) return; joinAct(el.getAttribute('data-join'), el); return; }
    if (el.hasAttribute('data-contact')) { if (el.disabled) return; contactAct(el.getAttribute('data-contact'), el); return; }
    if (el.hasAttribute('data-doc')) {
      // 規約の目次：URL は変えず、その条へ動かして見出しに焦点を置く
      e.preventDefault();
      var art = doc.getElementById('doc-' + el.getAttribute('data-doc'));
      if (art) { U.smoothScroll(art); focusEl(art.querySelector('h2'), false); }
      return;
    }
    // いま開いている画面へのリンクは、ページの先頭へ戻すだけにする（入力は消さない）
    var href = el.getAttribute('href') || '';
    var to = href.replace(/^#\/?/, '').split('?')[0].split('/')[0];
    if (ROUTES[to] && to === current && href.indexOf('?') < 0 && (href === global.location.hash || to === '')) {
      e.preventDefault();
      toggleMenu(false);
      try { global.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' }); } catch (x) { global.scrollTo(0, 0); }
      focusTitle();
    }
  }
  function onKey(e) {
    var m = doc.getElementById('site-menu');
    if (!m || m.hidden) return;
    var b = doc.querySelector('[data-site="menu"]');
    if (e.key === 'Escape') { toggleMenu(false); if (b) b.focus(); return; }
    // メニューを開いているあいだは、焦点をメニューとその開閉ボタンの中で回す
    if (e.key === 'Tab') {
      var list = [b].concat(menuItems()).filter(function (x) { return x && x.offsetParent !== null; });
      var i = list.indexOf(doc.activeElement);
      if (i < 0) return;
      var next = e.shiftKey ? (i === 0 ? list.length - 1 : i - 1) : (i === list.length - 1 ? 0 : i + 1);
      e.preventDefault();
      list[next].focus();
    }
  }

  function boot() {
    var host = doc.getElementById('site');
    if (!host || host.__booted) return;
    host.__booted = true;
    host.innerHTML = headerHtml() + '<main class="site-main" id="site-main" tabindex="-1"></main>' + footerHtml();
    main = doc.getElementById('site-main');
    doc.addEventListener('click', onClick);
    doc.addEventListener('keydown', onKey);
    // フォームの動きは main に1回だけ付ける（main の中身は描き直しても main 自体は同じ）
    main.addEventListener('submit', onFormSubmit);
    main.addEventListener('input', onFormInput);
    main.addEventListener('change', onFormInput);
    main.addEventListener('focusout', onFormBlur);
    doc.addEventListener('pointerdown', holdStart, true);
    doc.addEventListener('mousedown', holdStart, true);
    doc.addEventListener('pointerup', holdEnd, true);
    doc.addEventListener('mouseup', holdEnd, true);
    doc.addEventListener('pointercancel', holdEnd, true);
    global.addEventListener('hashchange', render);
    global.addEventListener('scroll', onScroll, { passive: true });
    render();
  }

  CLG.site = {
    ROUTES: ROUTES, COND: COND, parse: parse, render: render,
    join: function () { return J; }, resetJoin: resetJoin, contact: function () { return C; }, resetContact: resetContact,
    getRef: getRef, captureRef: captureRef, header: headerHtml, footer: footerHtml, faq: faqItems
  };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
