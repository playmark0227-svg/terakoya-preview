/* ============================================================
   公開サイト（サービス紹介・入会の申込み・特商法などの表記）
   ------------------------------------------------------------
   - 「読んでもらう紙の資料」。ヘッダーとフッターは描き直さず、#site-main だけを描き直す。
   - URL：#/（紹介）、#/join（申込み）、#/tokushoho、#/terms、#/privacy
   - ページ内の移動は data-scroll で行う（#id のリンクにすると画面の切り替えと混ざるため）。
   - 料金と契約の条件は COND に一か所で持つ。紹介・確認画面・特商法で文言を完全にそろえるため。
   - 紹介の報酬のことは、この紹介ページには書かない（収入を目的に入会を勧めない）。
   ============================================================ */
(function (global) {
  'use strict';
  var CLG = global.CLG, U = CLG.ui, DATA = CLG.DATA, SITE = DATA.SITE;
  var esc = U.esc, icon = U.icon;

  var BRAND = SITE.name + '（' + SITE.note + '）';
  var LP_TITLE = BRAND + '｜' + SITE.catchcopy;

  /* ---------- 小さな道具 ---------- */
  /** 10000 → 「10,000円」（法定表示に合わせて円で書く） */
  function en(n) { return U.num(n) + '円'; }
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function courseAt(lv) { return DATA.COURSES.filter(function (c) { return c.level === lv; }); }
  /** 句読点（または sep の文字）のあとで区切り、塊ごとに折り返す（変なところで割れないように） */
  function phrases(s, sep) {
    var re = sep === '・' ? /[^・]+・?/g : /[^、。]+[、。]?/g;
    return (String(s).match(re) || [s]).map(function (p) {
      return '<span class="site-nb">' + esc(p) + '</span>';
    }).join('');
  }
  function reduceMotion() {
    try { return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }
  /** 今日から日付の上で何日後か（時刻は見ない） */
  function daysUntil(iso) {
    var a = CLG.now(); a.setHours(0, 0, 0, 0);
    var b = new Date(iso); b.setHours(0, 0, 0, 0);
    return Math.round((b - a) / 86400000);
  }

  var LESSONS = DATA.COURSES.reduce(function (a, c) { return a.concat(c.lessons); }, []);
  var LONGEST = LESSONS.reduce(function (a, l) { return Math.max(a, l.min); }, 0);
  var EXPERT_NOTE = (DATA.EXPERTS[0] && DATA.EXPERTS[0].note) || '初回無料';

  /* ---------- 契約の条件（紹介・確認画面・特商法・規約で同じ文言を使う） ---------- */
  var COND = {
    service: BRAND + ' 月額会員',
    content: '全' + DATA.COURSES.length + '講座・勉強会アーカイブ・案件・イベント・運営への相談・福利厚生',
    monthly: en(SITE.price) + '（税込）',
    entry: en(SITE.entryFee),
    payment: SITE.payment,
    billing: SITE.billing,
    timing: '申込みのときに初回。以後、入会日から1ヶ月ごと（該当日がない月は月末）',
    start: '決済の完了後すぐ（ログインIDを表示し、メールでもお送りします）',
    term: '期間の定めなし・1ヶ月ごとの自動更新',
    cancel: '会員ページからいつでも。次の更新日の前日まで利用でき、そこで終了します',
    refund: '途中解約による日割りの返金はありません（法令で認められる場合を除く）',
    extra: 'オフ会の飲食代などの実費のみ（参加は任意）',
    extraLegal: 'インターネット接続の通信費、オフ会の飲食代などの実費（参加は任意）'
  };
  COND.short = '月額' + COND.monthly + '・入会金' + COND.entry + '・会員ページからいつでも解約';
  function payDayText() { return '本日（初回）、以後毎月' + CLG.now().getDate() + '日（該当日がない月は月末）'; }
  var CONFIRM_LABEL = '申込みを確定する（月額' + en(SITE.price) + 'の継続課金が始まります）';
  function confirmLabelHtml() {
    var m = /^([^（]+)(（.+）)$/.exec(CONFIRM_LABEL);
    return m ? '<span>' + esc(m[1]) + '</span><span class="site-btn__sub">' + esc(m[2]) + '</span>' : esc(CONFIRM_LABEL);
  }

  /* ---------- 紹介コード ----------
     ?ref=CODE（URLの ? のあと・# のあとのどちらでも）を読み、このタブの中だけ覚えておく。
     申込みの「紹介コード」欄に最初から入れるため。 */
  var REF_KEY = 'terakoya-ref', refMem = '';
  function cleanRef(v) { v = String(v == null ? '' : v).trim(); return /^[A-Za-z0-9_-]{1,32}$/.test(v) ? v : ''; }
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
    if (J && !J.f.ref && !J.refTouched && J.step === 1) J.f.ref = code;
    return code;
  }
  function getRef() {
    if (refMem) return refMem;
    try { return cleanRef(global.sessionStorage.getItem(REF_KEY)); } catch (e) { return ''; }
  }

  /* ---------- 見出しとページ内の案内 ---------- */
  var NAV = [['can', '学べること'], ['portal', '会員ページ'], ['price', '料金'], ['faq', 'よくある質問']];
  var SECTIONS = ['why', 'can', 'levels', 'days', 'portal', 'fit', 'price', 'faq'];

  function headerHtml() {
    var navBtns = NAV.map(function (n) {
      return '<button type="button" data-scroll="' + n[0] + '">' + esc(n[1]) + '</button>';
    }).join('');
    return '<header class="site-head">' +
      '<div class="site-wrap site-head__in">' +
        '<a class="site-head__brand" href="#/" aria-label="' + esc(BRAND) + ' トップへ">' + U.brandmark(SITE, SITE.note) + '</a>' +
        '<nav class="site-nav" aria-label="ページ内の案内">' + navBtns + '</nav>' +
        '<div class="site-head__act">' +
          '<a class="site-head__login" href="member.html">' + icon('user', 'ico-s') + '会員ログイン</a>' +
          '<a class="site-btn site-btn--primary site-btn--s site-head__cta" href="#/join">入会する</a>' +
          '<button type="button" class="site-head__menu" data-menu aria-expanded="false" aria-controls="site-menu" aria-label="メニューを開く">' + icon('menu') + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="site-menu" id="site-menu" hidden>' +
        '<div class="site-wrap">' +
          '<nav class="site-menu__nav" aria-label="メニュー">' + NAV.map(function (n) {
            return '<button type="button" data-scroll="' + n[0] + '"><span>' + esc(n[1]) + '</span>' + U.chevron() + '</button>';
          }).join('') +
            '<a href="member.html"><span>' + icon('user', 'ico-s') + '会員ログイン</span>' + U.chevron() + '</a>' +
          '</nav>' +
        '</div>' +
      '</div>' +
    '</header>';
  }

  function footerHtml() {
    var links = [
      ['#/tokushoho', '特定商取引法に基づく表記'], ['#/terms', '利用規約'],
      ['#/privacy', 'プライバシーポリシー'], ['member.html', '会員ログイン']
    ];
    return '<footer class="site-foot">' +
      '<div class="site-wrap">' +
        '<div class="site-foot__top">' +
          '<div class="site-foot__brand">' + U.brandmark(SITE, SITE.nameJa + '（' + SITE.note + '）') +
            '<p>令和の寺子屋。' + esc(SITE.catchcopy) + '</p></div>' +
          '<ul class="site-foot__links">' + links.map(function (l) {
            return '<li><a href="' + esc(l[0]) + '">' + esc(l[1]) + '</a></li>';
          }).join('') + '</ul>' +
        '</div>' +
        '<div class="site-foot__bottom">' +
          '<p>運営：' + esc(SITE.company) + '</p>' +
          '<p class="site-foot__proto">試作版：名前・料金・内容は検討中です。人物・数値はすべて架空です。</p>' +
        '</div>' +
      '</div>' +
    '</footer>';
  }

  function secHead(title, lead) {
    return '<h2 class="site-h2">' + phrases(title) + '</h2>' + (lead ? '<p class="site-sec__lead">' + esc(lead) + '</p>' : '');
  }

  /* ============================================================
     サービス紹介（#/）
     ============================================================ */

  /* ---------- 最初の画面：会員ページのホームの見本 ----------
     デモ会員（高橋さん・入会24日目・Lv3 あと30XP）と同じ状態を、画像ではなく部品で組む */
  function mockHome() {
    var M = DATA.MEMBER, L = DATA.LEVELS;
    var cur = L[2] || L[0], next = L[3] || cur, toNext = 30;
    var xp = next.min - toNext;
    var pct = next.min > cur.min ? Math.round((xp - cur.min) / (next.min - cur.min) * 100) : 100;
    var first = String(M.name).split(' ')[1] || M.name;
    var sns = byId(DATA.COURSES, 'sns-basic') || DATA.COURSES[0];
    var les = sns.lessons[2] || sns.lessons[0];
    var no = sns.lessons.indexOf(les) + 1;
    var day = M.joinedDaysAgo + 1;
    var show = DATA.EVENTS.filter(function (e) { return e.kind === 'showcase'; })[0];
    var showIn = show ? daysUntil(show.at) : 0;
    var opens = courseAt(next.lv).length;

    return '<a class="site-mock" href="member.html?demo=1#/home" aria-label="会員ページのデモを開く（ホーム画面の見本）">' +
      '<div class="site-mock__screen">' +
        '<div class="site-mock__top"><span class="site-mock__seal">' + esc(SITE.seal) + '</span>ホーム' +
          '<span class="site-mock__av" aria-hidden="true">' + esc(U.initials(M.name)) + '</span></div>' +
        '<div class="site-mock__body">' +
          '<p class="site-mock__hello">おかえりなさい、' + esc(first) + 'さん</p>' +
          '<div class="site-mock__card">' +
            '<div class="site-mock__row"><span class="site-mock__lv"><b>Lv' + esc(cur.lv) + '</b>' + esc(cur.name) + '</span>' +
              '<span>あと <b class="num">' + toNext + '</b> XP</span></div>' +
            '<div class="site-mock__meter"><i data-w="' + pct + '"></i></div>' +
            '<p class="site-mock__hint">Lv' + esc(next.lv) + 'になると、講座が' + opens + 'つ開きます</p>' +
          '</div>' +
          '<p class="site-mock__k">今日やること</p>' +
          '<div class="site-mock__card site-mock__today">' +
            '<span class="site-mock__play">' + icon('play') + '</span>' +
            '<span class="site-mock__t"><b>' + esc(sns.title) + ' 第' + no + '回</b><small>' + esc(les.title) + '・' + esc(les.min) + '分</small></span>' +
            U.chevron() +
          '</div>' +
          '<p class="site-mock__k">スタートガイド</p>' +
          '<div class="site-mock__card">' +
            '<div class="site-mock__row"><b class="site-mock__day">Day ' + day + ' <small>/ 30</small></b>' +
              (show && showIn > 0 ? '<span>成果発表会まで あと' + showIn + '日</span>' : '') + '</div>' +
            '<div class="site-mock__meter site-mock__meter--ink"><i data-w="' + Math.round(day / 30 * 100) + '"></i></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</a>';
  }

  function hero() {
    return '<section class="site-hero">' +
      '<div class="site-wrap site-hero__grid">' +
        '<div class="site-hero__text">' +
          '<p class="site-hero__eyebrow">月額制のオンラインスクール兼コミュニティ</p>' +
          '<h1 class="site-h1">' + phrases(SITE.catchcopy) + '</h1>' +
          '<p class="site-hero__lead">' + esc(SITE.lead) + '</p>' +
          '<p class="site-hero__cond">' + phrases(COND.short, '・') + '</p>' +
          '<div class="site-hero__cta">' +
            '<a class="site-btn site-btn--primary site-btn--l" href="#/join">入会する' + icon('arrow') + '</a>' +
            '<a class="site-btn site-btn--ghost site-btn--l" href="member.html?demo=1#/home">会員ページのデモを見る</a>' +
          '</div>' +
          '<p class="site-hero__fine">申込みの最後に、料金と解約の条件をもう一度確認できます。</p>' +
        '</div>' +
        '<figure class="site-hero__fig">' + mockHome() +
          '<figcaption>会員ページのホーム（試作版）。押すとデモが開きます。</figcaption></figure>' +
      '</div>' +
    '</section>';
  }

  /* ---------- 情報がばらばら → ひとつに ---------- */
  function why() {
    var before = [['講座は', '外部の講座サイト'], ['お知らせは', 'LINEグループ'], ['資料は', 'Notion'], ['申込は', 'フォーム'], ['相談は', '個別のLINE']];
    var after = [
      ['play', '講座と、勉強会の録画'],
      ['bell', '運営からのお知らせ'],
      ['feed', '仲間の近況が流れるタイムライン'],
      ['briefcase', '案件への応募と、その進みぐあい'],
      ['calendar', 'イベントの予約'],
      ['message', '運営への相談'],
      ['card', '会員証と福利厚生']
    ];
    return '<section class="site-sec" id="sec-why">' +
      '<div class="site-wrap">' +
        secHead('情報が、ばらばらになっていませんか。', '学ぶ場所がいくつものアプリやサイトに分かれていると、それだけで続けにくくなります。') +
        '<div class="site-ba">' +
          '<div class="site-ba__before">' +
            '<p class="site-ba__k">よくあるかたち</p>' +
            '<ul class="site-ba__list">' + before.map(function (b) {
              return '<li><b>' + esc(b[0]) + '</b><i aria-hidden="true"></i><span>' + esc(b[1]) + '</span></li>';
            }).join('') + '</ul>' +
            '<p class="site-ba__note">見る場所も、覚えるパスワードも、そのぶん増えていきます。</p>' +
          '</div>' +
          '<div class="site-ba__arrow" aria-hidden="true">' + icon('arrow', 'ico-l') + '</div>' +
          '<div class="site-ba__after">' +
            '<p class="site-ba__k">' + esc(SITE.name) + 'では</p>' +
            '<p class="site-ba__big">ログインひとつで、<br>全部ここに。</p>' +
            '<ul class="site-ba__have">' + after.map(function (a) {
              return '<li>' + icon(a[0]) + '<span>' + esc(a[1]) + '</span></li>';
            }).join('') + '</ul>' +
          '</div>' +
        '</div>' +
        '<p class="site-why__close">どこを見ればいいか迷わないことは、続けるうえで思っている以上に大切です。' +
          '入会するとログインIDが届き、学ぶことも、案件への応募も、相談も、ひとつの会員ページで済みます。' +
          '<b>きちんと整った場所だから、安心して続けられます。</b></p>' +
      '</div>' +
    '</section>';
  }

  /* ---------- この場所でできること（5つの柱・番号は振らない） ---------- */
  function pillars() {
    var P = [
      { ico: 'book', k: '学ぶ', sub: DATA.COURSES.length + '講座・勉強会アーカイブ',
        t: 'ビジネスの基礎から、AI活用・動画編集・Webデザイン・営業まで、' + DATA.FACULTIES.length + 'つの学部に分けています。講座は1本10分前後。ライブ勉強会の録画も、あとから見られます。' },
      { ico: 'briefcase', k: '試す', sub: 'お小遣い案件・業務委託・紹介できる商材',
        t: 'スマホで完結する小さな案件から、講座で身につけた腕を使う業務委託まで。学んだことを小さく試せる場を用意しています。報酬はどれも目安です。' },
      { ico: 'users', k: 'つながる', sub: 'タイムライン・オンライン勉強会・地域のオフ会',
        t: '新しい講座や案件、仲間の近況が流れるタイムライン。オンラインの勉強会や作業会に加えて、各地でオフ会も開きます（参加は任意です）。' },
      { ico: 'chat', k: '相談する', sub: '運営に回数の制限なく相談・税理士や司法書士の紹介',
        t: '進め方に迷ったら、会員ページから運営に相談できます。回数の制限はありません。開業や確定申告のことは、提携の税理士・司法書士をご紹介します（' + EXPERT_NOTE + '）。' },
      { ico: 'ticket', k: '暮らし', sub: '福利厚生・デジタル会員証',
        t: '日用品の会員価格や、映画館・レジャー施設の優待などを使えます（割引の内容は商品・店舗により異なります）。会員証はスマホで見せるだけです。' }
    ];
    return '<section class="site-sec" id="sec-can">' +
      '<div class="site-wrap">' +
        secHead('この場所でできること', '学んで終わりにしないために、試す・つながる・相談するまでを、ひとつの会費でまとめています。') +
        '<dl class="site-pillars">' + P.map(function (p) {
          return '<div class="site-pillar">' +
            '<dt><span class="site-pillar__ico">' + icon(p.ico) + '</span>' +
              '<span><span class="site-pillar__k">' + esc(p.k) + '</span><span class="site-pillar__sub">' + esc(p.sub) + '</span></span></dt>' +
            '<dd>' + esc(p.t) + '</dd>' +
          '</div>';
        }).join('') + '</dl>' +
      '</div>' +
    '</section>';
  }

  /* ---------- レベルで開く学び方（カリキュラムを全部見せる） ---------- */
  function levels() {
    var L = DATA.LEVELS, X = DATA.XP;
    var steps = L.map(function (l, i) {
      var cs = courseAt(l.lv);
      return '<li class="site-step" style="--i:' + i + '">' +
        '<p class="site-step__lv"><span class="num">Lv' + esc(l.lv) + '</span><b>' + esc(l.name) + '</b></p>' +
        '<p class="site-step__xp">' + (l.min ? '<span class="num">' + U.num(l.min) + '</span> XP から' : '入会した日から') + '</p>' +
        '<ul class="site-step__list">' + cs.map(function (c) { return '<li>' + esc(c.title) + '</li>'; }).join('') + '</ul>' +
      '</li>';
    }).join('');
    var earn = [['講座を1本見終える', X.lesson], ['勉強会の録画を1本見る', X.archive], ['イベントに参加する', X.event], ['案件をやり終える', X.gigDone]];
    return '<section class="site-sec" id="sec-levels">' +
      '<div class="site-wrap">' +
        secHead('レベルで開く学び方', '全部を一度に見せません。いまのあなたに必要な講座から開きます。') +
        '<p class="site-sec__lead site-sec__lead--2">講座を見る・イベントに出る・案件をやり終えると経験値（XP）がたまり、レベルが上がるたびに次の講座が開きます。全' +
          DATA.COURSES.length + '講座・' + LESSONS.length + '本の中身は、次のとおりです。</p>' +
        // 段の数は DATA.LEVELS から（CSS に 6 を決め打ちしない）
        '<ol class="site-ladder" style="--n:' + L.length + '">' + steps + '</ol>' +
        '<div class="site-levels__foot">' +
          '<ul class="site-earn" aria-label="経験値のたまり方">' + earn.map(function (e) {
            return '<li><span>' + esc(e[0]) + '</span><b class="num">+' + esc(e[1]) + '</b></li>';
          }).join('') + '</ul>' +
          '<ul class="site-levels__notes">' +
            '<li>' + icon('lock', 'ico-s') + '<span>鍵のかかった講座も、題と開く条件は見えます。先の見通しが立つようにしています。</span></li>' +
            '<li>' + icon('play', 'ico-s') + '<span>勉強会の録画（アーカイブ）は、レベルに関係なくすべて見られます。</span></li>' +
          '</ul>' +
        '</div>' +
      '</div>' +
    '</section>';
  }

  /* ---------- 最初の30日 ---------- */
  function days() {
    var NAMES = { 1: '慣れる', 2: '学ぶ', 3: '動く', 4: 'ふり返る' };
    var weeks = [1, 2, 3, 4].map(function (w) {
      var list = DATA.ONBOARDING.filter(function (s) { return s.week === w; });
      return '<li class="site-week">' +
        '<div class="site-week__head"><p class="site-week__no">' + w + '週目</p><p class="site-week__ttl">' + esc(NAMES[w]) + '</p></div>' +
        '<ul class="site-week__list">' + list.map(function (s) { return '<li>' + esc(s.title) + '</li>'; }).join('') + '</ul>' +
      '</li>';
    }).join('');
    return '<section class="site-sec" id="sec-days">' +
      '<div class="site-wrap">' +
        secHead('最初の30日', '入会したら、会員ページの「スタートガイド」を上から進めてください。週ごとにやることを決めてあるので、何から始めるかで迷いません。') +
        '<ol class="site-weeks">' + weeks + '</ol>' +
        '<div class="site-duo">' +
          '<div class="site-duo__item"><span class="site-duo__ico">' + icon('users') + '</span><div>' +
            '<p class="site-duo__ttl">担当スタッフが伴走します</p>' +
            '<p class="site-duo__txt">スタートガイドの進みぐあいを見ながら、運営のスタッフが声をかけます。分からないことは、会員ページのメッセージからいつでも聞けます。</p></div></div>' +
          '<div class="site-duo__item"><span class="site-duo__ico">' + icon('flag') + '</span><div>' +
            '<p class="site-duo__ttl">月末の成果発表会で、ふり返る</p>' +
            '<p class="site-duo__txt">1人3分で「やったこと・できたこと・次」を話す会です。見るだけの参加もできます。オンラインと地域の会場で開きます。</p></div></div>' +
        '</div>' +
      '</div>' +
    '</section>';
  }

  /* ---------- 会員ページの見本（4つ） ---------- */
  function portal() {
    var M = DATA.MEMBER;
    var sns = byId(DATA.COURSES, 'sns-basic') || DATA.COURSES[0];
    var les = sns.lessons[2] || sns.lessons[0];
    var seen = 2;   // デモ会員が見終えた本数
    var lockRows = [3, 4, 5].map(function (lv) { return courseAt(lv)[0]; }).filter(Boolean);
    var gigs = ['g1', 'g5'].map(function (id) { return byId(DATA.GIGS, id); }).filter(Boolean);
    var joined = new Date(DATA.D(-M.joinedDaysAgo));
    var cohort = joined.getFullYear() + '年' + (joined.getMonth() + 1) + '月期';
    var lv3 = DATA.LEVELS[2] || DATA.LEVELS[0];

    function typeName(t) { var x = byId(DATA.GIG_TYPES, t); return x ? x.name : ''; }

    var figs = [
      { ico: 'play', go: 'home', ttl: '今日やること', txt: 'ホームのいちばん上には、続きの1本だけを出します。開いたら、何から見ればいいか迷いません。',
        ui: '<div class="site-ui site-ui--today">' +
          '<p class="site-ui__k">続きから</p>' +
          '<div class="site-ui__row"><span class="site-ui__play">' + icon('play') + '</span>' +
            '<span class="site-ui__t"><b>' + esc(sns.title) + ' 第' + (sns.lessons.indexOf(les) + 1) + '回</b><small>' + esc(les.title) + '・' + esc(les.min) + '分</small></span></div>' +
          '<div class="site-ui__meter"><i data-w="' + Math.round(seen / sns.lessons.length * 100) + '"></i></div>' +
          '<p class="site-ui__note">全' + sns.lessons.length + '本のうち ' + seen + '本 見終えました</p>' +
        '</div>' },
      { ico: 'unlock', go: 'courses', ttl: 'レベル', txt: '講座を見る・イベントに出ると経験値がたまり、次の講座が開きます。鍵のかかった講座も、題と開く条件は見えます。',
        ui: '<div class="site-ui"><ul class="site-ui__list">' + lockRows.map(function (c) {
          var open = c.level <= lv3.lv;
          return '<li class="' + (open ? '' : 'is-locked') + '">' + icon(open ? 'unlock' : 'lock', 'ico-s') +
            '<span>' + esc(c.title) + '</span><small>' + (open ? '開いています' : 'Lv' + esc(c.level) + 'で開く') + '</small></li>';
        }).join('') + '</ul></div>' },
      { ico: 'briefcase', go: 'gigs', ttl: '案件', txt: 'お小遣い案件から業務委託まで、会員ページから応募できます。報酬はどれも目安で、案件の数や内容は時期によって変わります。',
        ui: '<div class="site-ui"><ul class="site-ui__gigs">' + gigs.map(function (g) {
          return '<li><span class="site-ui__type">' + esc(typeName(g.type)) + (g.level > 1 ? '・Lv' + esc(g.level) + 'から' : '') + '</span>' +
            '<b>' + esc(g.title) + '</b><small>' + esc(g.reward) + '（目安）・' + esc(g.time) + '</small></li>';
        }).join('') + '</ul></div>' },
      { ico: 'card', go: 'card', ttl: '会員証', txt: '会員番号・期・レベルが入ったデジタル会員証。福利厚生の提携先で、スマホの画面を見せて使います。',
        ui: '<div class="site-ui-card">' +
          '<div class="site-ui-card__top"><span class="site-ui-card__seal">' + esc(SITE.seal) + '</span><span>' + esc(SITE.name) + '<small>MEMBER</small></span></div>' +
          '<p class="site-ui-card__name">' + esc(M.name) + '</p>' +
          '<div class="site-ui-card__foot"><span class="mono">' + esc(M.id) + '</span><span>' + esc(cohort) + '</span>' +
            '<span class="site-ui-card__lv">Lv' + esc(lv3.lv) + ' ' + esc(lv3.name) + '</span></div>' +
        '</div>' }
    ];

    return '<section class="site-sec" id="sec-portal">' +
      '<div class="site-wrap">' +
        secHead('会員ページ', '毎日開く場所なので、迷わず使えることをいちばんに考えました。いま、試作版を実際に触れます。') +
        // 見本は押せる形をしているので、押したらデモが開くようにする（飾りのボタンにしない）
        '<div class="site-figs">' + figs.map(function (f) {
          return '<figure class="site-fig">' +
            '<a class="site-fig__stage" href="member.html?demo=1#/' + (f.go || 'home') + '" aria-label="' + esc(f.ttl) + 'をデモで見る">' + f.ui + '</a>' +
            '<figcaption><p class="site-fig__ttl">' + icon(f.ico, 'ico-s') + esc(f.ttl) + '</p><p class="site-fig__txt">' + esc(f.txt) + '</p></figcaption>' +
          '</figure>';
        }).join('') + '</div>' +
        '<div class="site-portal__foot">' +
          '<a class="site-btn site-btn--ghost" href="member.html?demo=1#/home">デモを触ってみる' + icon('arrow') + '</a>' +
          '<p>ログインの画面で「デモ会員で入る」を押すと、' + esc(M.name) + 'さん（入会' + (M.joinedDaysAgo + 1) + '日目）として見られます。人物・数値はすべて架空です。</p>' +
        '</div>' +
      '</div>' +
    '</section>';
  }

  /* ---------- 向き・不向き（正直に書く） ---------- */
  function fit() {
    var YES = [
      '副業を始めたいけれど、何から手をつければいいか分からない方',
      '家事や仕事の合間に、1日10〜30分ずつ学びたい方',
      '近くに、同じように挑戦している仲間がいない方',
      '学んだことを、小さな案件で実際に試してみたい方',
      'すでに事業をしていて、学び直しと横のつながりがほしい方'
    ];
    var NO = [
      'すぐに大きな収入がほしい方',
      '動画を見るだけで変われると思っている方',
      '人を強く勧誘して稼ぎたい方',
      '借入れをしてまで始めようとしている方'
    ];
    return '<section class="site-sec" id="sec-fit">' +
      '<div class="site-wrap">' +
        secHead('入る前に、正直にお伝えします', 'ここが合うかどうかを、先に確かめてください。入ってから「思っていたのと違う」とならないように。') +
        '<div class="site-fit">' +
          '<div class="site-fit__col">' +
            '<p class="site-fit__ttl">こんな方に</p>' +
            '<ul class="site-fit__list">' + YES.map(function (t) { return '<li>' + icon('check') + '<span>' + esc(t) + '</span></li>'; }).join('') + '</ul>' +
          '</div>' +
          '<div class="site-fit__col site-fit__col--no">' +
            '<p class="site-fit__ttl">向いていないかもしれない方</p>' +
            '<ul class="site-fit__list">' + NO.map(function (t) { return '<li><i class="site-fit__mark" aria-hidden="true"></i><span>' + esc(t) + '</span></li>'; }).join('') + '</ul>' +
            '<p class="site-fit__note">ここは、学んで、小さく試して、仲間と続ける場所です。生活のお金を削ってまで入る場所ではありません。</p>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</section>';
  }

  /* ---------- 料金（プランはひとつ） ---------- */
  function planRows() {
    return [
      ['月額以外にかかる費用', COND.extra],
      ['お支払い', COND.payment],
      ['課金日', COND.billing],
      ['解約', COND.cancel],
      ['返金', COND.refund]
    ];
  }
  function price() {
    var INC = [
      '全' + DATA.COURSES.length + '講座と、勉強会の録画（アーカイブ）',
      'お小遣い案件・業務委託・紹介できる商材への応募',
      'タイムライン・オンライン勉強会・地域のオフ会',
      '運営への相談（回数の制限なし）',
      '税理士・司法書士などの紹介（' + EXPERT_NOTE + '）',
      '福利厚生とデジタル会員証',
      '最初の30日のスタートガイドと、担当スタッフの伴走'
    ];
    return '<section class="site-sec site-sec--desk" id="sec-price">' +
      '<div class="site-wrap site-split">' +
        '<div class="site-split__head">' +
          secHead('料金', 'プランはひとつだけです。講座の数やレベルで、料金が変わることはありません。') +
          '<p class="site-split__links"><a class="site-link" href="#/tokushoho">特定商取引法に基づく表記</a><a class="site-link" href="#/terms">利用規約</a></p>' +
        '</div>' +
        '<div class="site-plan">' +
          '<div class="site-plan__head">' +
            '<div><p class="site-plan__name">' + esc(COND.service) + '</p>' +
              '<p class="site-plan__price"><span>月額</span><b>' + esc(U.num(SITE.price)) + '</b><span>円（税込）</span></p></div>' +
            '<p class="site-plan__entry">入会金 <b>' + esc(COND.entry) + '</b></p>' +
          '</div>' +
          '<div class="site-plan__inc">' +
            '<p class="site-plan__k">含まれるもの</p>' +
            '<ul>' + INC.map(function (t) { return '<li>' + icon('check', 'ico-s') + '<span>' + esc(t) + '</span></li>'; }).join('') + '</ul>' +
          '</div>' +
          '<table class="site-kv site-plan__kv"><tbody>' + planRows().map(function (r) {
            return '<tr><th scope="row">' + esc(r[0]) + '</th><td>' + esc(r[1]) + '</td></tr>';
          }).join('') + '</tbody></table>' +
          '<div class="site-plan__foot">' +
            '<a class="site-btn site-btn--primary site-btn--l" href="#/join">入会する' + icon('arrow') + '</a>' +
            '<p>申込みの最後に、この内容をもう一度確認できます。</p>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</section>';
  }

  /* ---------- よくある質問 ---------- */
  function faqItems() {
    return [
      ['入会の手順を教えてください。',
        'このページの「入会する」から、お名前とメールアドレスを入力してください。確認画面で料金と解約の条件をご確認のうえ、クレジットカードでお支払いいただくと、その場でログインIDが表示されます（同じ内容をメールでもお送りします）。あとは会員ページの「スタートガイド」を上から進めるだけです。'],
      ['ビジネスの経験がなくても大丈夫ですか。',
        '大丈夫です。はじめての方を前提に作っています。最初はレベル1の講座だけが開いていて、言葉の意味から順に学べます。分からないことは、運営に何度でも聞けます。'],
      ['仕事や家事で忙しくても続けられますか。',
        '講座は1本10分前後（長いものでも' + LONGEST + '分ほど）です。1日1本、週に数本のペースでも進められるようにしています。ライブの勉強会は録画が残るので、あとから見られます。'],
      ['地方に住んでいても大丈夫ですか。',
        '学ぶことも相談も、オンラインで完結します。オフ会は各地で開いています。参加は任意なので、近くで開かれるときに気が向いたらどうぞ。'],
      ['どんな年齢の方がいますか。',
        '年齢の区切りはありません。会社員の方、子育て中の方、すでにお店や会社をしている方など、さまざまな立場の方に向けて作っています。未成年の方は、保護者の同意が必要です。'],
      ['ほかのスクールやオンラインサロンとの違いは何ですか。',
        '大きく3つです。ひとつの会員ページで全部が済むこと、講座がレベルに合わせて順に開くこと、最初の30日を担当スタッフが伴走すること。「講座はここ、連絡はLINE、資料は別のサイト」ということがありません。'],
      ['交流会はありますか。',
        'あります。オンラインの勉強会や作業会のほか、各地でオフ会を開いています。月末には成果発表会があり、見るだけの参加もできます。どれも参加は任意で、飲食代などは実費です。'],
      ['支払い方法は何がありますか。',
        COND.payment + 'のみです。カード情報は Stripe が管理し、運営はカード番号を持ちません。' + COND.billing + 'です。'],
      ['解約や返金はどうなりますか。',
        '解約は、' + COND.cancel + '。アカウントの画面から2回の操作で済み、電話や面談の必要はありません。' + COND.refund + '。'],
      ['収入は保証されますか。',
        'いいえ。学びと小さく試す機会を提供するもので、収入を保証するものではありません。案件の報酬も、すべて目安です。'],
      ['会費は経費になりますか。',
        '事業の内容によって変わるため、ここでは一律にお答えできません。経費にできるかどうかは、提携の税理士に無料で相談できます（' + EXPERT_NOTE.replace(/無料$/, '') + '）。'],
      ['会社で副業が禁止されている場合はどうすればいいですか。',
        'まずは、お勤め先の就業規則をご確認ください。講座で学ぶだけなら問題にならないことが多いですが、案件で報酬を受け取る前には、規則に沿っているかを必ず確かめてください。']
    ];
  }
  function faq() {
    return '<section class="site-sec" id="sec-faq">' +
      '<div class="site-wrap site-split">' +
        '<div class="site-split__head">' + secHead('よくある質問', '') + '</div>' +
        '<div>' +
          '<div class="site-faq">' + faqItems().map(function (f) {
            return '<details><summary><span class="site-faq__q" aria-hidden="true">Q</span><span class="site-faq__s">' + esc(f[0]) + '</span>' +
              '<span class="site-faq__pm" aria-hidden="true"></span></summary><div class="site-faq__a">' + esc(f[1]) + '</div></details>';
          }).join('') + '</div>' +
          '<p class="site-faq__more">ここにない質問は、' +
            '<button type="button" class="site-textbtn" data-act="line">' + icon('line', 'ico-s') + esc(SITE.lineName) + '</button>' +
            'からどうぞ。</p>' +
        '</div>' +
      '</div>' +
    '</section>';
  }

  function refBar() {
    var code = getRef();
    if (!code) return '';
    return '<div class="site-refbar" role="note"><div class="site-wrap">' + icon('link', 'ico-s') +
      '<span>紹介リンクから開いています（紹介コード：<b class="mono">' + esc(code) + '</b>）</span></div></div>';
  }

  function lp() {
    return refBar() + hero() + why() + pillars() + levels() + days() + portal() + fit() + price() + faq();
  }

  /** 進みぐあいの棒を 0 から伸ばす（最初の表示に少しだけ動きを付ける） */
  function mountLp(root) {
    var bars = U.$$('[data-w]', root);
    function fill() { bars.forEach(function (b) { b.style.width = b.getAttribute('data-w') + '%'; }); }
    if (reduceMotion()) fill(); else setTimeout(fill, 180);
  }

  /* ============================================================
     入会の申込み（#/join）
     1 入力 → 2 確認 → 3 お支払い → 4 完了。状態はこの画面の中だけで持つ。
     ============================================================ */
  var PREFS = ['北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県', '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
    '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県',
    '鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県', '海外'];
  var JOBS = ['会社員', 'パート・アルバイト', '主婦・主夫', '自営業・経営者', '学生', 'その他'];
  var STEPS = ['入力', '確認', 'お支払い', '完了'];

  var J = null;
  function resetJoin() {
    J = { step: 1, f: { name: '', kana: '', email: '', pref: '', job: '', ref: getRef(), agree: false }, err: {}, busy: false, id: '' };
  }
  resetJoin();

  /* 入力の決まり。空欄のときに叱るのは「確認画面へ」を押したときだけ */
  function check(name, v) {
    v = typeof v === 'string' ? v.trim() : v;
    if (name === 'name') {
      if (!v) return 'お名前を入力してください';
      if (v.length > 40) return 'お名前は40文字までで入力してください';
    }
    if (name === 'kana' && v && !/^[぀-ゟ゠-ヿ\s　]+$/.test(v)) return 'ふりがなは、ひらがなで入力してください';
    if (name === 'email') {
      if (!v) return 'メールアドレスを入力してください';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'メールアドレスの形が正しくないようです（例：hana@example.com）';
    }
    if (name === 'ref' && v && !cleanRef(v)) return '紹介コードは、半角の英数字で入力してください';
    if (name === 'agree' && !v) return '利用規約とプライバシーポリシーへの同意が必要です';
    return '';
  }
  var FIELDS = ['name', 'kana', 'email', 'pref', 'job', 'ref', 'agree'];

  function stepper(cur) {
    return '<ol class="site-steps" aria-label="お申込みの流れ">' + STEPS.map(function (s, i) {
      var n = i + 1, cls = n < cur ? 'is-done' : n === cur ? 'is-cur' : '';
      return '<li class="' + cls + '"' + (n === cur ? ' aria-current="step"' : '') + '>' +
        '<span class="site-steps__n">' + (n < cur ? icon('check') : n) + '</span>' +
        '<span class="site-steps__t">' + esc(s) + '</span></li>';
    }).join('') + '</ol>';
  }

  function errHtml(name) {
    var e = J.err[name];
    return '<p class="site-field__err" id="e-' + name + '">' + (e ? icon('info', 'ico-s') + '<span>' + esc(e) + '</span>' : '') + '</p>';
  }
  function field(name, label, req, control, help) {
    return '<div class="site-field' + (J.err[name] ? ' is-err' : '') + '" data-field="' + name + '">' +
      '<label class="site-field__label" for="f-' + name + '">' + esc(label) +
        (req ? '<span class="site-req">必須</span>' : '<span class="site-opt">任意</span>') + '</label>' +
      control + (help ? '<p class="site-field__help">' + esc(help) + '</p>' : '') + errHtml(name) +
    '</div>';
  }
  function input(name, type, value, attrs) {
    return '<input class="site-input" id="f-' + name + '" name="' + name + '" type="' + type + '" value="' + esc(value) + '"' +
      ' aria-describedby="e-' + name + '"' + (J.err[name] ? ' aria-invalid="true"' : '') + (attrs || '') + '>';
  }
  function select(name, list, value, blank) {
    return '<select class="site-select" id="f-' + name + '" name="' + name + '">' +
      '<option value="">' + esc(blank) + '</option>' +
      list.map(function (o) { return '<option' + (o === value ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') +
    '</select>';
  }

  function stepInput() {
    var f = J.f, fromLink = f.ref && f.ref === getRef();
    return '<div class="site-join__head">' +
        '<h1 class="site-join__ttl">入会のお申込み</h1>' +
        '<p class="site-join__lead">入力は1分ほどで終わります。次の画面で内容を確認できるので、まだお申込みは確定しません。</p>' +
      '</div>' +
      '<div class="site-join__plan">' + icon('receipt') + '<p><b>' + esc(COND.service) + '</b><span>' + phrases(COND.short, '・') + '</span></p></div>' +
      '<form class="site-panel site-form" id="site-join-form" novalidate>' +
        '<div class="site-field-row">' +
          field('name', 'お名前', true, input('name', 'text', f.name, ' autocomplete="name" placeholder="例：山田 はな" maxlength="40"')) +
          field('kana', 'ふりがな', false, input('kana', 'text', f.kana, ' placeholder="例：やまだ はな" maxlength="60"')) +
        '</div>' +
        field('email', 'メールアドレス', true, input('email', 'email', f.email, ' autocomplete="email" inputmode="email" placeholder="例：hana@example.com"'),
          'ログインIDとパスワードをお送りします。') +
        '<div class="site-field-row">' +
          field('pref', '住んでいる地域', false, select('pref', PREFS, f.pref, '選択してください'), '近くのオフ会をご案内するのに使います。') +
          field('job', 'いまのお仕事', false, select('job', JOBS, f.job, '選択してください')) +
        '</div>' +
        field('ref', '紹介コード', false, input('ref', 'text', f.ref, ' autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="32" placeholder="お持ちの方のみ"'),
          fromLink ? '紹介リンクから開いたので、最初から入れてあります。' : '') +
        '<div class="site-field site-agree' + (J.err.agree ? ' is-err' : '') + '" data-field="agree">' +
          '<label class="site-check"><input type="checkbox" id="f-agree" name="agree"' + (f.agree ? ' checked' : '') + ' aria-describedby="e-agree"' + (J.err.agree ? ' aria-invalid="true"' : '') + '>' +
            '<span><a class="site-link" href="index.html#/terms" target="_blank" rel="noopener">利用規約</a>と' +
            '<a class="site-link" href="index.html#/privacy" target="_blank" rel="noopener">プライバシーポリシー</a>に同意します' +
            '<span class="site-req">必須</span></span></label>' +
          errHtml('agree') +
        '</div>' +
        '<div class="site-form__foot">' +
          '<p class="site-form__sum" id="site-form-sum" aria-live="polite"></p>' +
          '<button type="submit" class="site-btn site-btn--ink site-btn--l site-btn--block">確認画面へ' + icon('arrow') + '</button>' +
        '</div>' +
      '</form>';
  }

  function kvTable(rows, cls) {
    return '<table class="site-kv' + (cls ? ' ' + cls : '') + '"><tbody>' + rows.map(function (r) {
      return '<tr><th scope="row">' + esc(r[0]) + '</th><td>' + esc(r[1]) + '</td></tr>';
    }).join('') + '</tbody></table>';
  }

  function stepConfirm() {
    var f = J.f;
    var deal = [
      ['サービス', COND.service], ['内容', COND.content], ['月額', COND.monthly], ['入会金', COND.entry],
      ['お支払い方法', COND.payment], ['お支払い時期', payDayText()], ['提供開始', COND.start],
      ['契約期間', COND.term], ['解約', COND.cancel], ['返金', COND.refund]
    ];
    var you = [
      ['お名前', f.name], ['ふりがな', f.kana || '（未入力）'], ['メールアドレス', f.email],
      ['住んでいる地域', f.pref || '（未選択）'], ['いまのお仕事', f.job || '（未選択）'], ['紹介コード', f.ref || 'なし']
    ];
    return '<div class="site-join__head">' +
        '<h1 class="site-join__ttl">お申込み内容の確認</h1>' +
        '<p class="site-join__lead">まだお申込みは確定していません。内容をご確認のうえ、いちばん下のボタンを押してください。</p>' +
      '</div>' +
      '<div class="site-panel">' +
        '<h2 class="site-panel__ttl">ご契約の内容</h2>' + kvTable(deal, 'site-kv--confirm') +
      '</div>' +
      '<div class="site-panel">' +
        '<div class="site-panel__head"><h2 class="site-panel__ttl">お客さまの情報</h2>' +
          '<button type="button" class="site-textbtn" data-act="join-edit">' + icon('pen', 'ico-s') + '訂正する</button></div>' +
        kvTable(you, 'site-kv--confirm') +
      '</div>' +
      '<p class="site-join__notice">「申込みを確定する」を押すと、決済の画面に進みます。決済が完了した時点でお申込みが確定し、月額の継続課金が始まります。' +
        '<a class="site-link" href="index.html#/tokushoho" target="_blank" rel="noopener">特定商取引法に基づく表記</a></p>' +
      '<div class="site-join__btns">' +
        '<button type="button" class="site-btn site-btn--ghost site-btn--l" data-act="join-edit">' + icon('back') + '内容を訂正する</button>' +
        // 文言は1つのまま、狭い画面では括弧の前で改行する（「継／続」のように割れないように）
        '<button type="button" class="site-btn site-btn--primary site-btn--l site-btn--wrap site-btn--confirm" data-act="join-confirm">' +
          confirmLabelHtml() + '</button>' +
      '</div>';
  }

  function stepPay() {
    return '<div class="site-join__head">' +
        '<h1 class="site-join__ttl">お支払い</h1>' +
        '<p class="site-join__lead">お支払いが終わると、すぐにログインIDを発行します。</p>' +
      '</div>' +
      '<div class="site-panel site-pay">' +
        '<div class="site-pay__demo">' + icon('shield', 'ico-l') +
          '<p>本番ではここで Stripe の決済画面が開きます。試作版ではカード情報は入力しません。</p></div>' +
        kvTable([
          ['本日のお支払い', COND.monthly],
          ['次回から', '毎月' + CLG.now().getDate() + '日（該当日がない月は月末）に ' + COND.monthly],
          ['お支払い方法', COND.payment]
        ]) +
        '<button type="button" class="site-btn site-btn--primary site-btn--l site-btn--block" data-act="join-pay">デモの決済を完了する</button>' +
        '<button type="button" class="site-textbtn site-pay__back" data-act="join-back">' + icon('back', 'ico-s') + '確認画面に戻る</button>' +
      '</div>';
  }

  function stepDone() {
    var f = J.f;
    var week1 = DATA.ONBOARDING.filter(function (s) { return s.week === 1; });
    return '<div class="site-done">' +
      '<span class="site-done__seal" aria-hidden="true">' + esc(SITE.seal) + '</span>' +
      '<h1 class="site-join__ttl">ようこそ、' + esc(f.name) + 'さん</h1>' +
      '<p class="site-join__lead">お申込みと決済が完了しました。今日から会員ページのすべての機能を使えます。</p>' +
      '<div class="site-panel site-idbox">' +
        '<p class="site-idbox__k">あなたのログインID</p>' +
        '<div class="site-idbox__row"><b class="mono" id="site-login-id">' + esc(J.id) + '</b>' +
          '<button type="button" class="site-btn site-btn--ghost site-btn--s" data-act="copy-id">' + icon('copy', 'ico-s') + 'コピー</button></div>' +
        '<p class="site-idbox__pw">パスワードは登録のメールアドレスにお送りしました（試作版：demo1234）</p>' +
        '<p class="site-idbox__mail">' + icon('message', 'ico-s') + '<span>送り先：' + esc(f.email) + '（試作版ではメールは送信されません）</span></p>' +
      '</div>' +
      '<div class="site-done__next">' +
        '<p class="site-done__k">会員ページで、最初にやること</p>' +
        '<ul>' + week1.map(function (s) { return '<li>' + icon('circle', 'ico-s') + '<span>' + esc(s.title) + '</span></li>'; }).join('') + '</ul>' +
        '<p class="site-done__hint">「スタートガイド」に、上から順に並んでいます。担当スタッフからのメッセージも届いています。</p>' +
      '</div>' +
      '<a class="site-btn site-btn--primary site-btn--l site-btn--block" href="member.html#/start">会員ページへ' + icon('arrow') + '</a>' +
    '</div>';
  }

  function joinPage() {
    var body = J.step === 1 ? stepInput() : J.step === 2 ? stepConfirm() : J.step === 3 ? stepPay() : stepDone();
    return '<div class="site-wrap site-join">' + stepper(J.step) + '<div class="site-join__body">' + body + '</div></div>';
  }

  function setStep(n) {
    J.step = n;
    // 決済の待ち時間に別のページへ移っていたら、そのページは描き直さない（戻ったときに完了画面を出す）
    if (current !== 'join') return;
    renderMain(true);
    try { main.focus({ preventScroll: true }); } catch (e) {}
  }

  /** 1つの欄の知らせだけを書き換える（入力中に全体を描き直すと、カーソルが飛ぶため） */
  function showErr(name) {
    var box = main && main.querySelector('[data-field="' + name + '"]');
    if (!box) return;
    var e = J.err[name], p = box.querySelector('.site-field__err'), inp = box.querySelector('input,select');
    box.classList.toggle('is-err', !!e);
    if (p) p.innerHTML = e ? icon('info', 'ico-s') + '<span>' + esc(e) + '</span>' : '';
    if (inp) { if (e) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid'); }
  }
  function readField(el) { return el.type === 'checkbox' ? el.checked : el.value; }

  function onJoinInput(e) {
    var el = e.target;
    if (!el.name || FIELDS.indexOf(el.name) < 0 || J.step !== 1) return;
    J.f[el.name] = readField(el);
    if (el.name === 'ref') J.refTouched = true;
    if (J.err[el.name] || el.type === 'checkbox') { J.err[el.name] = check(el.name, J.f[el.name]); showErr(el.name); }
    if (!Object.keys(J.err).some(function (k) { return J.err[k]; })) { var s = document.getElementById('site-form-sum'); if (s) s.textContent = ''; }
  }
  function onJoinBlur(e) {
    var el = e.target;
    if (!el.name || FIELDS.indexOf(el.name) < 0 || J.step !== 1 || el.type === 'checkbox') return;
    var v = readField(el);
    if (typeof v === 'string' && !v.trim()) return;
    J.err[el.name] = check(el.name, v);
    showErr(el.name);
  }
  function onJoinSubmit(e) {
    if (!e.target || e.target.id !== 'site-join-form') return;
    e.preventDefault();
    var form = e.target, firstBad = null, bad = 0;
    FIELDS.forEach(function (k) {
      var el = form.elements[k];
      if (el) J.f[k] = typeof readField(el) === 'string' ? readField(el).trim() : readField(el);
      J.err[k] = check(k, J.f[k]);
      showErr(k);
      if (J.err[k]) { bad++; if (!firstBad) firstBad = el; }
    });
    var sum = document.getElementById('site-form-sum');
    if (bad) {
      if (sum) sum.textContent = '入力内容をご確認ください（' + bad + 'か所）';
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
    setStep(2);
  }

  function pay(btn) {
    if (J.busy) return;
    J.busy = true;
    btn.setAttribute('disabled', '');
    btn.setAttribute('aria-busy', 'true');
    btn.innerHTML = '<span class="site-spin" aria-hidden="true"></span>決済しています…';
    // 決済の途中で確認画面へ戻れないようにする（戻ったあとに完了してしまうため）
    U.$$('[data-act="join-back"]', main).forEach(function (b) { b.setAttribute('disabled', ''); });
    setTimeout(function () {
      var f = J.f;
      CLG.store.startFresh({ name: f.name, kana: f.kana, email: f.email, area: f.pref, job: f.job, ref: f.ref });
      J.id = CLG.store.state.me.id;
      J.busy = false;
      setStep(4);
    }, 1000);
  }

  /* ============================================================
     表記のページ（ひな形）
     ============================================================ */
  function docPage(title, body) {
    var others = [['#/tokushoho', '特定商取引法に基づく表記'], ['#/terms', '利用規約'], ['#/privacy', 'プライバシーポリシー']]
      .filter(function (o) { return o[1] !== title; });
    return '<article class="site-wrap site-doc">' +
      '<p class="site-doc__back"><a href="#/">' + icon('back', 'ico-s') + 'トップへ戻る</a></p>' +
      '<h1 class="site-doc__ttl">' + esc(title) + '</h1>' +
      '<p class="site-doc__draft">' + icon('info', 'ico-s') +
        '<span><b>ひな形・専門家の確認前</b>　試作版のための下書きです。本番の前に、弁護士などの専門家の確認を受けて差し替えます。</span></p>' +
      body +
      '<p class="site-doc__others">' + others.map(function (o) {
        return '<a class="site-link" href="' + o[0] + '">' + esc(o[1]) + '</a>';
      }).join('') + '</p>' +
    '</article>';
  }

  function tokushoho() {
    var TBD = '調整中（本番前に記載）';
    return docPage('特定商取引法に基づく表記', kvTable([
      ['事業者名', TBD],
      ['代表者または運営統括責任者', TBD],
      ['所在地', TBD],
      ['電話番号', TBD],
      ['メールアドレス', TBD],
      ['販売価格', '月額' + COND.monthly],
      ['入会金', COND.entry],
      ['商品代金以外の必要料金', COND.extraLegal],
      ['支払方法', COND.payment],
      ['支払時期', COND.timing],
      ['役務の提供時期', COND.start],
      ['契約期間と更新', COND.term],
      ['解約', COND.cancel],
      ['返品・返金', COND.refund],
      ['動作環境', '最新のブラウザ（パソコン・スマートフォン）']
    ], 'site-kv--stack'));
  }

  function article(n, title, body) {
    return '<section class="site-doc__art"><h2>第' + n + '条（' + esc(title) + '）</h2>' + body + '</section>';
  }
  function ol(items) { return '<ol>' + items.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ol>'; }
  function para(t) { return '<p>' + esc(t) + '</p>'; }

  function terms() {
    var co = SITE.company;
    return docPage('利用規約',
      para('この規約は、' + co + '（以下「当社」）が提供するオンラインスクール兼コミュニティ「' + BRAND + '」（以下「本サービス」）の利用条件を定めるものです。') +
      article(1, '目的', para('本サービスは、会員が学び、学んだことを小さく試し、仲間とつながる場を提供することを目的とします。')) +
      article(2, '会員', ol([
        '所定の方法で申し込み、当社が承諾した方を会員とします。',
        '未成年の方は、保護者の同意を得て申し込んでください。',
        'ログインIDとパスワードは会員本人が管理し、他人に使わせてはいけません。'
      ])) +
      article(3, '料金と支払い', ol([
        '料金は月額' + COND.monthly + '、入会金は' + COND.entry + 'です。',
        '支払方法：' + COND.payment,
        '支払時期：' + COND.timing,
        '契約は、' + COND.billing + 'とします。'
      ])) +
      article(4, '解約と返金', ol([
        '解約：' + COND.cancel + '。',
        '返金：' + COND.refund + '。'
      ])) +
      article(5, '禁止事項', para('会員は、次のことをしてはいけません。') + ol([
        'ほかの会員への勧誘・営業行為（案件ページの「会員どうし」の募集を除く）',
        '講座・勉強会の録画・資料の無断転載、転売、配布',
        '誹謗中傷、差別的な発言、ほかの会員の名誉やプライバシーを傷つける行為',
        '収入を約束・断定して本サービスを勧める行為',
        '法令または公序良俗に反する行為、本サービスの運営を妨げる行為'
      ])) +
      article(6, '貢献ポイント', ol([
        '貢献ポイントは、コミュニティへの貢献に応じて付ける点数です。',
        '現金その他の財産と交換することはできません。',
        '有効期限は、付与から1年です。'
      ])) +
      article(7, '紹介のルール', ol([
        '紹介に関する詳細は、別途定めます。',
        '紹介の対象は1段（直接紹介した方）に限ります。紹介した方がさらにほかの方を紹介しても、最初に紹介した会員には何も発生しません。',
        '収入を約束する勧誘、紹介であることを隠した勧誘は禁止します。'
      ])) +
      article(8, '免責', ol([
        '本サービスは学びと機会を提供するもので、収入や成果を保証するものではありません。案件の報酬は目安です。',
        '当社の故意または重大な過失による場合を除き、当社が負う賠償の額は、会員が直近1ヶ月に支払った月額を上限とします。'
      ])) +
      article(9, '規約の変更', para('当社は、民法の定めに従ってこの規約を変更することがあります。変更するときは、効力が生じる日より前に、変更の内容と時期を会員ページでお知らせします。'))
    );
  }

  function privacy() {
    var co = SITE.company;
    function sec(t, body) { return '<section class="site-doc__art"><h2>' + esc(t) + '</h2>' + body + '</section>'; }
    return docPage('プライバシーポリシー',
      para(co + '（以下「当社」）は、' + BRAND + 'の会員とお申込みの方の個人情報を、次のとおり取り扱います。') +
      sec('1. 取得する情報', ol([
        'お申込みのときに入力いただく情報（お名前、ふりがな、メールアドレス、住んでいる地域、お仕事、紹介コード）',
        '会員ページの利用記録（講座の視聴、投稿、イベントの予約、案件への応募など）',
        'お問い合わせ・ご相談の内容'
      ])) +
      sec('2. 利用目的', ol([
        '本サービスの提供、本人確認、料金の請求',
        '新しい講座・案件・イベントなどのお知らせ',
        'サービスの改善、不正な利用の防止',
        'お問い合わせ・ご相談への対応'
      ])) +
      sec('3. 第三者への提供', ol([
        '法令に基づく場合を除き、ご本人の同意なく第三者に提供しません。',
        '案件に応募したときは、応募に必要な範囲（お名前・連絡先）を依頼主に提供します。応募の画面でお知らせします。',
        '決済・メール配信・システムの運用などを外部に任せるときは、必要な範囲で預け、適切に管理するよう求めます。'
      ])) +
      sec('4. 決済の情報', para('クレジットカードの情報は、決済代行の Stripe が管理します。当社はカード番号を受け取らず、保持しません。')) +
      sec('5. お問い合わせ', para('個人情報の開示・訂正・削除などのご請求は、次の窓口で受け付けます。') +
        kvTable([['窓口', co + '　個人情報のお問い合わせ窓口'], ['連絡先', '調整中（本番前に記載）']]))
    );
  }

  /* ============================================================
     画面の切り替え
     ============================================================ */
  var ROUTES = {
    '': { title: '', render: lp, mount: mountLp },
    join: { title: '入会のお申込み', render: joinPage },
    tokushoho: { title: '特定商取引法に基づく表記', render: tokushoho },
    terms: { title: '利用規約', render: terms },
    privacy: { title: 'プライバシーポリシー', render: privacy }
  };

  function parse() {
    var h = String((global.location && global.location.hash) || '').replace(/^#\/?/, ''), q = {}, qi = h.indexOf('?');
    if (qi >= 0) { q = queryOf(h.slice(qi + 1)); h = h.slice(0, qi); }
    var parts = h.split('/').filter(Boolean);
    return { name: parts[0] || '', query: q };
  }

  var main = null, current = null, pendingScroll = null, firstRender = true;

  function scrollToSec(key, smooth) {
    var el = document.getElementById('sec-' + key);
    if (!el) return;
    try { el.scrollIntoView({ behavior: smooth && !reduceMotion() ? 'smooth' : 'auto', block: 'start' }); }
    catch (e) { el.scrollIntoView(); }
  }
  function goSection(key) {
    toggleMenu(false);
    if (current === '') { scrollToSec(key, true); return; }
    pendingScroll = key;
    location.hash = '#/';
  }

  function renderMain(toTop) {
    if (!main) return;
    var route = ROUTES[current] || ROUTES[''];
    main.innerHTML = route.render();
    if (current === 'join' && J.step === 4) J.doneSeen = true;
    if (route.mount) route.mount(main);
    if (toTop) global.scrollTo(0, 0);
  }

  function render() {
    var r = parse();
    captureRef(r.query);
    var name = r.name.replace(/^sec-/, '');
    if (!ROUTES[name]) {
      // #/price のような古い書き方や、区切りの名前だけのリンクは、紹介ページのその場所へ
      if (SECTIONS.indexOf(name) >= 0) pendingScroll = name;
      name = '';
    }
    var changed = name !== current;
    // 完了画面を一度見たあとに申込みを開き直したら、空のフォームから
    if (changed && name === 'join' && J.step === 4 && J.doneSeen) resetJoin();
    current = name;
    // 申込みの画面ではヘッダーの「入会する」を隠す（朱のボタンを1画面に1つにするため）
    try { document.body.setAttribute('data-route', name || 'lp'); } catch (e) {}
    renderMain(false);
    var route = ROUTES[name];
    document.title = route.title ? route.title + '｜' + BRAND : LP_TITLE;
    toggleMenu(false);
    if (pendingScroll && name === '') {
      var key = pendingScroll; pendingScroll = null;
      scrollToSec(key, false);
    } else if (changed && !firstRender) {
      global.scrollTo(0, 0);
      try { main.focus({ preventScroll: true }); } catch (e) {}
    }
    firstRender = false;
  }

  /* ---------- 押したときの動き ---------- */
  function toggleMenu(open) {
    var m = document.getElementById('site-menu'), b = document.querySelector('[data-menu]');
    if (!m || !b) return;
    if (open == null) open = m.hidden;
    m.hidden = !open;
    b.setAttribute('aria-expanded', open ? 'true' : 'false');
    b.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
    b.innerHTML = icon(open ? 'close' : 'menu');
  }

  function act(name, el) {
    if (J.busy && name.indexOf('join-') === 0) return;
    if (name === 'join-edit') setStep(1);
    else if (name === 'join-confirm') setStep(3);
    else if (name === 'join-back') setStep(2);
    else if (name === 'join-pay') pay(el);
    else if (name === 'copy-id') U.copyText(J.id).then(function () { U.toast('ログインIDをコピーしました', 'ok'); });
    else if (name === 'line') U.toast('本番では、' + SITE.lineName.replace(/（.*）$/, '') + 'の友だち追加の画面が開きます');
  }

  function onClick(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var menu = document.getElementById('site-menu');
    if (menu && !menu.hidden && !t.closest('.site-head')) toggleMenu(false);

    var el = t.closest('[data-scroll],[data-menu],[data-act],a[href^="#"]');
    if (!el) return;
    if (el.hasAttribute('data-scroll')) { e.preventDefault(); goSection(el.getAttribute('data-scroll')); return; }
    if (el.hasAttribute('data-menu')) { toggleMenu(); return; }
    if (el.hasAttribute('data-act')) { act(el.getAttribute('data-act'), el); return; }
    // いま開いている画面へのリンクは、ページの先頭へ戻すだけにする（申込みの入力は消さない）
    var href = el.getAttribute('href') || '';
    var to = href.replace(/^#\/?/, '').split('?')[0].split('/')[0];
    if (ROUTES[to] && to === current && href.indexOf('?') < 0) {
      e.preventDefault();
      toggleMenu(false);
      try { global.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' }); } catch (x) { global.scrollTo(0, 0); }
    }
  }
  function onKey(e) {
    if (e.key === 'Escape') {
      var m = document.getElementById('site-menu');
      if (m && !m.hidden) { toggleMenu(false); var b = document.querySelector('[data-menu]'); if (b) b.focus(); }
    }
  }

  function boot() {
    var host = document.getElementById('site');
    if (!host || host.__booted) return;
    host.__booted = true;
    host.innerHTML = headerHtml() + '<main class="site-main" id="site-main" tabindex="-1"></main>' + footerHtml();
    main = document.getElementById('site-main');
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    // 申込みフォームの動きは main に1回だけ付ける（main の中身は描き直しても main 自体は同じ）
    main.addEventListener('submit', onJoinSubmit);
    main.addEventListener('input', onJoinInput);
    main.addEventListener('change', onJoinInput);
    main.addEventListener('focusout', onJoinBlur);
    global.addEventListener('hashchange', render);
    render();
  }

  CLG.site = {
    ROUTES: ROUTES, COND: COND, parse: parse, render: render,
    join: function () { return J; }, resetJoin: resetJoin, getRef: getRef, captureRef: captureRef,
    header: headerHtml, footer: footerHtml, faq: faqItems
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
