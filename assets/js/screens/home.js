/* ============================================================
   ホーム（#/home）
   ------------------------------------------------------------
   いちばん上に「今日やること」を1つだけ大きく出す（次の一歩を迷わせないため）。
   その下は、未読・スタートガイド・予約中のイベントの短い一覧（最大3行）と、
   新着・イベント・レベル・案件と紹介。数字は本人の記録だけを出す。
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon;

  /* スタートガイドの項目ごとのボタンの文言（題と同じ言葉をくり返さないため） */
  var STEP_BTN = {
    profile: 'プロフィールを開く', orient: '1本目を見る', line: '通知の設定へ', intro: 'ひな形で書く',
    goal: '目標を書く', meet: '面談を予約する', lesson3: '講座を選ぶ', gig: '案件を見る',
    event: 'イベントを見る', showcase: '発表会の日程を見る'
  };
  /* タイムラインの種類の札（ふつうの投稿には付けない） */
  var FEED_KIND = {
    news: ['運営', 'tag-indigo'], win: ['成果', 'tag-ok'], 'new': ['講座', 'tag-line'],
    gig: ['案件', 'tag-line'], event: ['イベント', 'tag-line'], intro: ['自己紹介', 'tag-line']
  };
  /* 案件の状態（ホームでは短く） */
  var GIG_SHORT = { applied: '確認中', meeting: '面談の調整中', active: '稼働中', done: 'やり終えた' };
  var WD = ['日', '月', '火', '水', '木', '金', '土'];

  /* ---------- 小さな道具 ---------- */
  var greeting = function () {
    var h = CLG.now().getHours();
    if (h >= 5 && h < 10) return 'おはようございます';
    if (h >= 10 && h < 17) return 'こんにちは';
    return 'こんばんは';
  };
  var familyName = function (name) { return String(name || '').trim().split(/\s+/)[0] || ''; };
  var firstLine = function (text) { return String(text || '').split('\n')[0]; };
  /** 今日から何日後か（日付の区切りで数える） */
  var daysUntil = function (at) {
    var a = new Date(at); a.setHours(0, 0, 0, 0);
    var n = CLG.now(); n.setHours(0, 0, 0, 0);
    return Math.round((a - n) / 86400000);
  };
  var untilLabel = function (at) {
    var n = daysUntil(at);
    return n <= 0 ? '今日' : n === 1 ? '明日' : 'あと' + n + '日';
  };
  var hhmm = function (at) { var d = new Date(at); return U.pad(d.getHours()) + ':' + U.pad(d.getMinutes()); };
  var facultyName = function (id) {
    var f = DATA.FACULTIES.filter(function (x) { return x.id === id; })[0];
    return f ? f.name : '';
  };
  var lessonNo = function (c, lessonId) {
    for (var i = 0; i < c.lessons.length; i++) if (c.lessons[i].id === lessonId) return i + 1;
    return 1;
  };
  /** スタートガイドの項目から飛ぶ先。ボタンの文言どおりの場所まで直接つなぐ
      （「ひな形で書く」ならひな形が入った状態、「面談を予約する」なら面談の予約が選ばれた状態） */
  var stepHref = function (s) {
    if (s.id === 'intro') return '#/feed?intro=1';
    if (s.id === 'meet') return '#/messages?kind=' + encodeURIComponent('面談の予約');
    if (s.id === 'orient') {
      var c = R.course('orientation'), st = c ? R.courseState(c) : null;
      if (st && st.next) return '#/lesson/' + c.id + '/' + st.next.id;
    }
    if (s.id === 'showcase') {
      var sc = R.upcoming().filter(function (e) { return e.kind === 'showcase'; })[0];
      if (sc) return '#/events/' + sc.id;
    }
    return s.go;
  };
  var stepBtn = function (s) {
    if (s.id === 'orient') {
      var c = R.course('orientation');
      if (c && R.courseState(c).started) return '続きを見る';
    }
    return STEP_BTN[s.id] || 'はじめる';
  };

  /* ---------- 今日やること：何を出すか ----------
     入会して間もない（7日以内）か、まだ1本も見ていない人はスタートガイドの次の項目。
     それ以外は、続きの講座の次の1本。 */
  var pickFocus = function (ctx, ob) {
    var noLessons = !Object.keys(ctx.state.done).length;
    if (!ob.finished && ob.current && (ob.day <= 7 || noLessons)) return { kind: 'step', step: ob.current };
    var cont = R.continueList()[0];
    if (cont && cont.st.next) return { kind: 'lesson', c: cont.c, st: cont.st, l: cont.st.next };
    if (!ob.finished && ob.current) return { kind: 'step', step: ob.current };
    return { kind: 'rest' };
  };

  /* ---------- 見出し ---------- */
  var head = function () {
    var m = R.me(), sk = R.streak(), fam = familyName(m.name);
    var streak;
    // 記録は講座に限らず、スタートガイドや投稿でも付く。何から始めてもよい言い方にする
    if (!sk.weeks) streak = '今週ひとつ進めると、続けた週の記録が始まります';
    else if (sk.thisWeek) streak = sk.weeks + '週つづけて学んでいます';
    else streak = sk.weeks + '週つづけて学んでいます（今週はこれから）';
    return '<header class="page-head home-head">' +
      '<p class="home-date">' + esc(U.fmtDate(CLG.now(), { noYear: true })) + '</p>' +
      '<h1 class="page-ttl">' + esc(greeting()) + (fam ? '、' + esc(fam) + 'さん' : '') + '</h1>' +
      '<p class="home-meta"><span>入会' + R.day() + '日目・' + esc(R.cohort()) + '</span>' +
        '<span class="home-streak' + (sk.weeks ? '' : ' is-zero') + '">' + icon('fire') + esc(streak) + '</span></p>' +
    '</header>';
  };

  /* 入会したての人にだけ出す。押すものは置かず、読むだけにする（次の一歩は下のカード） */
  var welcome = function () {
    return '<section class="home-welcome" aria-label="ようこそ">' +
      '<span class="home-welcome__seal" aria-hidden="true">' + esc(DATA.SITE.seal) + '</span>' +
      '<div class="home-welcome__body">' +
        '<h2 class="home-welcome__ttl"><span>ようこそ。</span><span>まずはスタートガイドから。</span></h2>' +
        '<p class="home-welcome__txt">最初の1週間で、この場所の使い方がひと通り分かります。' +
        '1日10分ずつで大丈夫です。分からないことは、運営にいつでも聞いてください（回数の制限はありません）。</p>' +
      '</div>' +
    '</section>';
  };

  /* ---------- 今日やること（1つだけ） ---------- */
  var focusLesson = function (f) {
    var c = f.c, l = f.l, st = f.st, lv = R.level();
    var no = lessonNo(c, l.id), href = '#/lesson/' + c.id + '/' + l.id;
    var teacher = DATA.PEOPLE[c.teacher];
    var hint = '';
    // 次のレベルが近いときだけ、あと何本で何が開くかを添える
    if (lv.next && lv.toNext <= 2 * DATA.XP.lesson) {
      var need = Math.max(1, Math.ceil(lv.toNext / DATA.XP.lesson));
      var opens = R.coursesAtLevel(lv.next.lv).length;
      hint = '<p class="home-focus__hint">' + icon('sparkle') + '<span>あと<b class="num">' + lv.toNext + '</b>XP。' +
        need + '本見るとLv' + lv.next.lv + '「' + esc(lv.next.name) + '」になり' +
        (opens ? '、講座が' + opens + 'つ開きます' : 'ます') + '</span></p>';
    }
    return '<section class="card home-focus" aria-labelledby="homeFocusTtl">' +
      '<a class="home-focus__media is-lesson" href="' + esc(href) + '" tabindex="-1" aria-hidden="true">' +
        '<span class="home-focus__kicker">' + esc(facultyName(c.faculty)) + '</span>' +
        '<span class="home-focus__big">第' + no + '回</span>' +
        '<span class="home-focus__foot"><span class="home-focus__play">' + icon('play') + '</span><span class="num">' + l.min + '分</span></span>' +
      '</a>' +
      '<div class="home-focus__body">' +
        '<p class="home-focus__eyebrow">' + icon('target') + '<b>今日やること</b><span>' + (st.started ? '続きの1本' : '次の講座') + '</span></p>' +
        '<p class="home-focus__course"><a href="#/courses/' + esc(c.id) + '">' + esc(c.title) + '</a>・第' + no + '回／全' + st.total + '回</p>' +
        '<h2 class="home-focus__ttl" id="homeFocusTtl">' + esc(l.title) + '</h2>' +
        '<p class="home-focus__meta"><span>' + icon('clock', 'ico-s') + l.min + '分</span>' +
          (teacher ? '<span>講師 ' + esc(teacher.name) + '</span>' : '') +
          '<span>見終えると +' + DATA.XP.lesson + ' XP</span></p>' +
        '<div class="home-focus__prog">' + U.progressBar(st.pct, 'ink') + '<span class="num">' + st.done + '/' + st.total + '本</span></div>' +
        hint +
        '<div class="home-focus__acts">' +
          '<a class="btn btn-primary btn-l" href="' + esc(href) + '">' + icon('play') + (st.started ? '続きを見る' : 'この講座を始める') + '</a>' +
          '<a class="btn btn-text" href="#/courses">ほかの講座を選ぶ</a>' +
        '</div>' +
      '</div>' +
    '</section>';
  };

  var focusStep = function (f, ob) {
    var s = f.step;
    var dots = ob.steps.map(function (x) {
      return '<i class="' + (x.done ? 'is-done' : x === s ? 'is-cur' : '') + '"></i>';
    }).join('');
    // 30日を過ぎたら「Day 30」で止めず、済んだ数を大きく出す（日付がずれて見えないように）
    var big = ob.day <= 30 ? 'Day ' + ob.day : ob.done + '/' + ob.total;
    return '<section class="card home-focus" aria-labelledby="homeFocusTtl">' +
      '<a class="home-focus__media is-step" href="#/start" tabindex="-1" aria-hidden="true">' +
        '<span class="home-focus__kicker">' + (ob.day <= 30 ? 'スタートガイド・最初の30日' : 'スタートガイド・済んだ項目') + '</span>' +
        '<span class="home-focus__big num">' + big + '</span>' +
        '<span class="home-focus__foot"><span class="home-dots">' + dots + '</span></span>' +
      '</a>' +
      '<div class="home-focus__body">' +
        '<p class="home-focus__eyebrow">' + icon('target') + '<b>今日やること</b><span>スタートガイド・あと' + (ob.total - ob.done) + '項目</span></p>' +
        '<h2 class="home-focus__ttl" id="homeFocusTtl">' + esc(s.title) + '</h2>' +
        '<p class="home-focus__desc">' + esc(s.desc) + '</p>' +
        '<p class="home-focus__meta"><span>' + icon('flag', 'ico-s') + s.week + '週目の目安</span><span>できたら +' + s.xp + ' XP</span></p>' +
        '<div class="home-focus__acts">' +
          '<a class="btn btn-primary btn-l" href="' + esc(stepHref(s)) + '">' + esc(stepBtn(s)) + icon('arrow') + '</a>' +
          '<a class="btn btn-text" href="#/start">スタートガイドを見る</a>' +
        '</div>' +
      '</div>' +
    '</section>';
  };

  /* 開いている講座をすべて見終えたとき */
  var focusRest = function (ctx) {
    var lv = R.level(), seen = ctx.state.archiveSeen || {};
    // 次のレベルがあるなら、まだ見ていないアーカイブへ（本文の「アーカイブでもXPがたまる」と同じ行き先にする）
    var unseen = DATA.ARCHIVE.filter(function (a) { return !seen[a.id]; }).length;
    var toArchive = !!(lv.next && unseen);
    return '<section class="card home-focus" aria-labelledby="homeFocusTtl">' +
      '<a class="home-focus__media is-rest" href="#/courses" tabindex="-1" aria-hidden="true">' +
        '<span class="home-focus__kicker">学びのレベル</span>' +
        '<span class="home-focus__big num">Lv' + lv.lv + '</span>' +
        '<span class="home-focus__foot">' + icon('checkc') + '<span>開いた講座はすべて修了</span></span>' +
      '</a>' +
      '<div class="home-focus__body">' +
        '<p class="home-focus__eyebrow">' + icon('target') + '<b>今日やること</b><span>ふり返り</span></p>' +
        '<h2 class="home-focus__ttl" id="homeFocusTtl">開いている講座は、すべて見終えました</h2>' +
        '<p class="home-focus__desc">' + (lv.next
          ? '勉強会のアーカイブやイベントでもXPがたまります。Lv' + lv.next.lv + 'まで、あと' + lv.toNext + 'XPです。'
          : '最高レベルです。学んだことを講座にして、この場所で教える道もあります。') + '</p>' +
        '<div class="home-focus__acts">' +
          (toArchive
            ? '<a class="btn btn-primary btn-l" href="#/courses?tab=archive">勉強会アーカイブを見る' + icon('arrow') + '</a>'
            : '<a class="btn btn-primary btn-l" href="#/courses">講座の一覧へ' + icon('arrow') + '</a>') +
          '<a class="btn btn-text" href="#/events">イベントを見る</a>' +
        '</div>' +
      '</div>' +
    '</section>';
  };

  /* ---------- 短い一覧（最大3行） ---------- */
  var quick = function (ob, focus) {
    var rows = [];
    var unread = R.unread();
    if (unread) {
      var last = R.thread().filter(function (m) { return m.from !== 'me'; }).slice(-1)[0];
      var who = last ? R.person(last.from) : null;
      rows.push('<a class="li has-ico" href="#/messages">' +
        '<span class="li__ico home-ico-indigo">' + icon('message') + '</span>' +
        '<span class="li__body"><span class="li__ttl">運営からのメッセージ</span>' +
          '<span class="li__sub home-1line">' + (who ? esc(who.name) + '：' : '') + esc(last ? firstLine(last.text) : '') + '</span></span>' +
        '<span class="li__end"><span class="tag tag-indigo">未読 ' + unread + '</span>' + U.chevron() + '</span></a>');
    }
    // 今日やることがスタートガイドのときは、同じものを2回出さない
    if (!ob.finished && focus.kind !== 'step') {
      var left = ob.total - ob.done;
      rows.push('<a class="li has-ico" href="#/start">' +
        '<span class="li__ico">' + icon('flag') + '</span>' +
        '<span class="li__body"><span class="li__ttl">スタートガイド</span>' +
          '<span class="li__sub home-1line">' + (ob.day <= 30 ? 'Day ' + ob.day + ' / 30' : '入会' + ob.day + '日目') +
          '・あと' + left + '項目' + (ob.current ? '：' + esc(ob.current.title) : '') + '</span></span>' +
        '<span class="li__end">' + U.ring(ob.pct, ob.done + '/' + ob.total, 42) + U.chevron() + '</span></a>');
    }
    var ev = R.myUpcoming()[0];
    if (ev) {
      rows.push('<a class="li has-ico" href="#/events/' + esc(ev.id) + '">' +
        '<span class="li__ico">' + icon('calendar') + '</span>' +
        '<span class="li__body"><span class="li__ttl">' + esc(ev.title) + '</span>' +
          '<span class="li__sub home-1line">予約中・' + esc(U.fmtShort(ev.at, true)) + '・' + esc(ev.place) + '</span></span>' +
        '<span class="li__end"><span class="home-until">' + esc(untilLabel(ev.at)) + '</span>' + U.chevron() + '</span></a>');
    }
    if (!rows.length) return '';
    return '<div class="list home-quick" aria-label="確認しておくこと">' + rows.slice(0, 3).join('') + '</div>';
  };

  /* ---------- 新着（タイムラインから3件） ---------- */
  var latest = function () {
    var items = R.feed().slice().sort(function (a, b) { return new Date(b.at) - new Date(a.at); }).slice(0, 3);
    if (!items.length) return '';
    return '<section class="home-sec home-sec--feed" aria-labelledby="homeFeedTtl">' +
      '<h2 class="sec-ttl" id="homeFeedTtl">新着<a href="#/feed">タイムラインへ</a></h2>' +
      '<div class="list">' + items.map(function (p) {
        var who = R.person(p.by), k = FEED_KIND[p.kind];
        return '<a class="li home-post" href="#/feed">' +
          U.avatar({ name: who.name, color: who.color, staff: who.staff }, 's') +
          '<span class="li__body">' +
            '<span class="home-post__by"><b>' + esc(who.name) + '</b>' +
              (k ? '<span class="tag ' + k[1] + '">' + esc(k[0]) + '</span>' : '') +
              '<span class="home-post__at">' + esc(U.relTime(p.at)) + '</span></span>' +
            '<span class="home-post__txt">' + esc(firstLine(p.text)) + '</span>' +
          '</span>' + U.chevron() + '</a>';
      }).join('') + '</div>' +
    '</section>';
  };

  /* ---------- これからのイベント（2件） ---------- */
  var events = function () {
    var list = R.upcoming().slice(0, 2);
    var body = list.length ? '<div class="list">' + list.map(function (e) {
      var d = new Date(e.at), reserved = R.isReserved(e.id);
      return '<a class="li home-ev" href="#/events/' + esc(e.id) + '">' +
        '<span class="home-ev__date" aria-hidden="true"><small>' + (d.getMonth() + 1) + '月</small><b class="num">' + d.getDate() + '</b>' +
          '<small>' + WD[d.getDay()] + '</small></span>' +
        '<span class="li__body"><span class="li__ttl">' + esc(e.title) + '</span>' +
          '<span class="li__sub">' + esc(untilLabel(e.at)) + '・' + esc(hhmm(e.at)) + '〜・' + esc(e.place) + '</span></span>' +
        '<span class="li__end">' + (reserved ? '<span class="tag tag-ok">予約済み</span>' : '') + U.chevron() + '</span></a>';
    }).join('') + '</div>'
      : '<div class="card-flat home-none">次のイベントは準備中です。決まったら、お知らせでお伝えします。</div>';
    return '<section class="home-sec home-sec--ev" aria-labelledby="homeEvTtl">' +
      '<h2 class="sec-ttl" id="homeEvTtl">これからのイベント<a href="#/events">すべて見る</a></h2>' + body +
    '</section>';
  };

  /* ---------- 学びのレベル ---------- */
  var levelCard = function () {
    var lv = R.level();
    var next = lv.next ? R.coursesAtLevel(lv.next.lv) : [];
    return '<section class="home-sec home-sec--lv" aria-labelledby="homeLvTtl">' +
      '<h2 class="sec-ttl" id="homeLvTtl">学びのレベル</h2>' +
      '<div class="card home-lv" role="button" tabindex="0" data-home-act="level" aria-label="学びのレベルとXPのため方を見る">' +
        '<div class="row-between">' + U.lvBadge(lv.lv, lv.name) +
          '<span class="home-lv__xp"><b class="num">' + U.num(lv.xp) + '</b> XP</span></div>' +
        U.progressBar(lv.pct, 'gold') +
        '<p class="home-lv__to">' + (lv.next
          ? 'Lv' + lv.next.lv + '「' + esc(lv.next.name) + '」まで あと <b class="num">' + U.num(lv.toNext) + '</b> XP'
          : '最高レベルです。すべての講座が開いています') + '</p>' +
        (next.length ? '<p class="home-lv__h">Lv' + lv.next.lv + 'で開く講座</p>' +
          '<ul class="home-lv__list">' + next.map(function (c) {
            return '<li>' + icon('lock', 'ico-s') + '<span>' + esc(c.title) + '</span><small>' + esc(facultyName(c.faculty)) + '</small></li>';
          }).join('') + '</ul>' : '') +
        '<p class="home-lv__foot"><span>XPのため方と記録を見る</span>' + U.chevron() + '</p>' +
      '</div>' +
    '</section>';
  };

  /* ---------- 案件・紹介（本人の分だけ・控えめに） ---------- */
  var gigsAndReferral = function (ctx) {
    var gigs = ctx.state.gigs || {}, ids = Object.keys(gigs);
    var counts = {};
    ids.forEach(function (id) { var st = gigs[id].status; counts[st] = (counts[st] || 0) + 1; });
    var parts = Object.keys(GIG_SHORT).filter(function (k) { return counts[k]; })
      .map(function (k) { return GIG_SHORT[k] + ' ' + counts[k] + '件'; });
    var rows = '<a class="li has-ico" href="#/gigs">' +
      '<span class="li__ico">' + icon('briefcase') + '</span>' +
      '<span class="li__body"><span class="li__ttl">' + (ids.length ? '応募した案件' : '応募できる案件を見る') + '</span>' +
        '<span class="li__sub">' + (ids.length ? esc(parts.join('・')) : '応募すると、進みぐあいがここに出ます') + '</span></span>' +
      '<span class="li__end">' + (ids.length ? '<span class="num">' + ids.length + '件</span>' : '') + U.chevron() + '</span></a>';

    // 紹介の行は、本人に紹介の記録があるときだけ。ホームから紹介を勧めることはしない
    var ref = R.referral(), hasRef = !!(ref.list.length && (ref.held || ref.confirmed));
    if (hasRef) {
      var held = ref.held > 0;
      rows += '<a class="li has-ico" href="#/referral">' +
        '<span class="li__ico">' + icon('gift') + '</span>' +
        '<span class="li__body"><span class="li__ttl">' + (held ? '保留中の紹介報酬' : '確定した紹介報酬') + '</span>' +
          '<span class="li__sub">' + (held
            ? ref.holdDays + '日の保留のあと、返金・解約がなければ確定します'
            : esc(ref.closeLabel)) + '</span></span>' +
        '<span class="li__end"><span class="num">' + esc(U.yen(held ? ref.held : ref.confirmed)) + '</span>' + U.chevron() + '</span></a>';
    }
    return '<section class="home-sec home-sec--money" aria-labelledby="homeMoneyTtl">' +
      '<h2 class="sec-ttl" id="homeMoneyTtl">' + (hasRef ? '案件・紹介' : '案件') + '</h2>' +
      '<div class="list">' + rows + '</div>' +
    '</section>';
  };

  CLG.screens.home = {
    title: 'ホーム',
    render: function (ctx) {
      var ob = R.onboarding();
      var focus = pickFocus(ctx, ob);
      var isNew = ctx.state.kind === 'fresh' && ob.done === 0 && !Object.keys(ctx.state.done).length;
      var focusHtml = focus.kind === 'lesson' ? focusLesson(focus) : focus.kind === 'step' ? focusStep(focus, ob) : focusRest(ctx);
      return '<div class="scr-home">' +
        head() +
        (isNew ? welcome() : '') +
        focusHtml +
        quick(ob, focus) +
        '<div class="home-cols">' +
          '<div class="home-col">' + latest() + events() + '</div>' +
          '<div class="home-col">' + levelCard() + gigsAndReferral(ctx) + '</div>' +
        '</div>' +
      '</div>';
    },
    mount: function (root) {
      // root は画面が変わっても同じ要素なので、付けるのは1回だけ
      if (root.__boundHome) return;
      root.__boundHome = true;
      root.addEventListener('click', function (e) {
        var b = e.target.closest('[data-home-act]');
        if (!b) return;
        if (b.getAttribute('data-home-act') === 'level') CLG.app.levelInfo();
      });
      // role="button" の面をキーボードでも押せるようにする
      root.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var b = e.target;
        if (!b || !b.getAttribute || !b.getAttribute('data-home-act')) return;
        e.preventDefault();
        b.click();
      });
    }
  };
})();
