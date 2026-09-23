/* ============================================================
   ホーム（#/home）
   上から：見出し → 続きから（講座かスタートガイドの次の1つ）→ 未読など →
   新着・イベント／レベル・案件。数字は本人の記録だけ。
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon;

  /* スタートガイドの項目ごとのボタンの文言 */
  var STEP_BTN = {
    profile: 'プロフィールを開く', orient: '1本目を見る', line: '通知の設定へ', intro: 'ひな形で書く',
    goal: '目標を書く', meet: '面談を予約する', lesson3: '講座を選ぶ', gig: '案件を見る',
    event: 'イベントを見る', showcase: '発表会の日程を見る'
  };
  /* 案件の状態（ホームでは短く） */
  var GIG_SHORT = { applied: '確認中', meeting: '面談の調整中', active: '稼働中', done: '完了' };
  var WD = ['日', '月', '火', '水', '木', '金', '土'];

  /* ---------- 小さな道具 ---------- */
  var firstLine = function (text) { return String(text || '').split('\n')[0]; };
  var hhmm = function (at) { var d = new Date(at); return U.pad(d.getHours()) + ':' + U.pad(d.getMinutes()); };
  var lessonNo = function (c, lessonId) {
    for (var i = 0; i < c.lessons.length; i++) if (c.lessons[i].id === lessonId) return i + 1;
    return 1;
  };
  /** スタートガイドの項目から飛ぶ先（ボタンの文言どおりの場所まで直接つなぐ） */
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
    return STEP_BTN[s.id] || '開く';
  };

  /* ---------- いちばん上に何を出すか ----------
     入会して7日以内か、まだ1本も見ていない人はスタートガイドの次の項目。
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
    var sk = R.streak();
    var meta = ['入会' + R.day() + '日目（' + R.cohort() + '）'];
    // 「1週連続」は日本語として変なので、2週から出す
    if (sk.weeks >= 2) meta.push(sk.thisWeek ? sk.weeks + '週連続で学習中' : '先週まで' + sk.weeks + '週連続');
    return '<header class="page-head home-head">' +
      '<h1 class="page-ttl">ホーム</h1>' +
      '<p class="home-meta">' + esc(meta.join('・')) + '</p>' +
    '</header>';
  };

  /* ---------- 続きから（1つだけ） ---------- */
  var nextCard = function (o) {
    return '<section class="home-sec home-next" aria-labelledby="homeNextTtl">' +
      '<h2 class="sec-ttl" id="homeNextTtl">' + esc(o.label) + (o.link ? '<a href="' + esc(o.link[0]) + '">' + esc(o.link[1]) + '</a>' : '') + '</h2>' +
      '<div class="card home-next__card">' +
        '<div class="home-next__body">' +
          (o.over ? '<p class="home-next__over">' + o.over + '</p>' : '') +
          '<h3 class="home-next__ttl"><a href="' + esc(o.href) + '">' + o.ttl + '</a></h3>' +
          (o.sub ? '<p class="home-next__sub">' + o.sub + '</p>' : '') +
          (o.prog ? '<div class="home-next__prog">' + U.progressBar(o.prog[0], 'ink') + '<span class="num">' + esc(o.prog[1]) + '</span></div>' : '') +
        '</div>' +
        '<a class="btn ' + (o.soft ? 'btn-soft' : 'btn-primary') + ' home-next__btn" href="' + esc(o.href) + '">' + (o.btnIco ? icon(o.btnIco) : '') + esc(o.btn) + '</a>' +
      '</div>' +
    '</section>';
  };

  var focusLesson = function (f) {
    var c = f.c, l = f.l, st = f.st;
    var teacher = DATA.PEOPLE[c.teacher];
    return nextCard({
      label: st.started ? '続きから' : '次に見る講座', link: ['#/courses', '講座一覧'],
      over: '<a href="#/courses/' + esc(c.id) + '">' + esc(c.title) + '</a>',
      ttl: '第' + lessonNo(c, l.id) + '回　' + esc(l.title),
      href: '#/lesson/' + c.id + '/' + l.id,
      sub: esc(l.min + '分' + (teacher ? '・講師 ' + teacher.name : '')),
      prog: [st.pct, st.done + '/' + st.total + '本'],
      btn: st.started ? '続きを見る' : '見る', btnIco: 'play'
    });
  };

  var focusStep = function (f, ob) {
    var s = f.step;
    return nextCard({
      label: 'スタートガイド', link: ['#/start', 'すべて見る'],
      ttl: esc(s.title), href: stepHref(s),
      sub: esc(s.desc),
      prog: [ob.pct, ob.done + '/' + ob.total],
      btn: stepBtn(s)
    });
  };

  /* 開いている講座をすべて見終えたとき */
  var focusRest = function (ctx) {
    var lv = R.level(), seen = ctx.state.archiveSeen || {};
    var unseen = DATA.ARCHIVE.filter(function (a) { return !seen[a.id]; }).length;
    // まだ見ていないアーカイブがあればそちらへ。なければ講座一覧（朱にはしない）
    var toArchive = unseen > 0;
    return nextCard({
      label: '講座', link: toArchive ? ['#/courses', '講座一覧'] : null,
      ttl: lv.next ? '開いている講座は全部見終わりました' : '全部の講座を見終わりました',
      href: toArchive ? '#/courses?tab=archive' : '#/courses',
      sub: lv.next ? esc('Lv' + lv.next.lv + 'まであと' + lv.toNext + 'XP。' + (toArchive ? '勉強会のアーカイブを見てもXPが入ります。' : ''))
        : toArchive ? esc('まだ見ていない勉強会のアーカイブが' + unseen + '本あります。') : '',
      btn: toArchive ? 'アーカイブを見る' : '講座一覧', soft: !toArchive
    });
  };

  /* ---------- 未読・スタートガイド・予約（最大3行） ---------- */
  var quick = function (ob, focus, shownEv) {
    var rows = [];
    var unread = R.unread();
    if (unread) {
      var last = R.thread().filter(function (m) { return m.from !== 'me'; }).slice(-1)[0];
      var who = last ? R.person(last.from) : null;
      rows.push('<a class="li has-ico" href="#/messages">' +
        '<span class="li__ico">' + icon('message') + '</span>' +
        '<span class="li__body"><span class="li__ttl">運営からのメッセージ</span>' +
          '<span class="li__sub home-1line">' + (who ? esc(who.name) + '：' : '') + esc(last ? firstLine(last.text) : '') + '</span></span>' +
        '<span class="li__end"><span class="tag tag-indigo">未読 ' + unread + '</span>' + U.chevron() + '</span></a>');
    }
    // 上がスタートガイドのときは、同じものを2回出さない
    if (!ob.finished && focus.kind !== 'step') {
      rows.push('<a class="li has-ico" href="#/start">' +
        '<span class="li__ico">' + icon('flag') + '</span>' +
        '<span class="li__body"><span class="li__ttl">スタートガイド</span>' +
          (ob.current ? '<span class="li__sub home-1line">次：' + esc(ob.current.title) + '</span>' : '') + '</span>' +
        '<span class="li__end"><span class="num home-count">' + ob.done + '/' + ob.total + '</span>' + U.chevron() + '</span></a>');
    }
    // 予約中のイベントは、下の「イベント」に出ていないときだけ
    var ev = R.myUpcoming().filter(function (e) { return shownEv.indexOf(e.id) < 0; })[0];
    if (ev) {
      rows.push('<a class="li has-ico" href="#/events/' + esc(ev.id) + '">' +
        '<span class="li__ico">' + icon('calendar') + '</span>' +
        '<span class="li__body"><span class="li__ttl">' + esc(ev.title) + '</span>' +
          '<span class="li__sub home-1line">' + esc(U.fmtShort(ev.at, true) + '・' + ev.place) + '</span></span>' +
        '<span class="li__end"><span class="tag tag-ok">予約済み</span>' + U.chevron() + '</span></a>');
    }
    if (!rows.length) return '';
    return '<div class="list home-quick" aria-label="お知らせ">' + rows.slice(0, 3).join('') + '</div>';
  };

  /* ---------- 新着（タイムラインから3件） ---------- */
  var latest = function () {
    var items = R.feed().slice().sort(function (a, b) { return new Date(b.at) - new Date(a.at); }).slice(0, 3);
    if (!items.length) return '';
    return '<section class="home-sec home-sec--feed" aria-labelledby="homeFeedTtl">' +
      '<h2 class="sec-ttl" id="homeFeedTtl">新着<a href="#/feed">タイムライン</a></h2>' +
      '<div class="list">' + items.map(function (p) {
        var who = R.person(p.by);
        return '<a class="li home-post" href="#/feed">' +
          U.avatar({ name: who.name, color: who.color, staff: who.staff }, 's') +
          '<span class="li__body">' +
            '<span class="home-post__by"><b>' + esc(who.name) + '</b><span>' + esc(U.relTime(p.at)) + '</span></span>' +
            '<span class="home-post__txt">' + esc(firstLine(p.text)) + '</span>' +
          '</span></a>';
      }).join('') + '</div>' +
    '</section>';
  };

  /* ---------- イベント（2件） ---------- */
  var events = function (list) {
    var body = list.length ? '<div class="list">' + list.map(function (e) {
      var d = new Date(e.at), reserved = R.isReserved(e.id);
      return '<a class="li home-ev" href="#/events/' + esc(e.id) + '">' +
        '<span class="home-ev__when"><b class="num">' + (d.getMonth() + 1) + '/' + d.getDate() + '</b>(' + WD[d.getDay()] + ')' +
          '<span class="num">' + esc(hhmm(e.at)) + '〜</span></span>' +
        '<span class="li__body"><span class="li__ttl">' + esc(e.title) + '</span>' +
          '<span class="li__sub">' + esc(e.place) + '</span></span>' +
        '<span class="li__end">' + (reserved ? '<span class="tag tag-ok">予約済み</span>' : '') + U.chevron() + '</span></a>';
    }).join('') + '</div>'
      : '<p class="home-none">予定しているイベントはまだありません。</p>';
    return '<section class="home-sec home-sec--ev" aria-labelledby="homeEvTtl">' +
      '<h2 class="sec-ttl" id="homeEvTtl">イベント<a href="#/events">すべて見る</a></h2>' + body +
    '</section>';
  };

  /* ---------- 学びのレベル（押すとXPのため方） ---------- */
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
          ? 'Lv' + lv.next.lv + '「' + esc(lv.next.name) + '」まであと<b class="num">' + U.num(lv.toNext) + '</b>XP'
          : '最高レベルです。講座は全部開いています。') + '</p>' +
        (next.length ? '<p class="home-lv__open">Lv' + lv.next.lv + 'で開く講座：</p><ul class="home-lv__list">' + next.map(function (c) {
          return '<li>' + esc(c.title) + '</li>';
        }).join('') + '</ul>' : '') +
        '<p class="home-lv__more">XPのため方</p>' +
      '</div>' +
    '</section>';
  };

  /* ---------- 案件・紹介（本人の分だけ） ---------- */
  var gigsAndReferral = function (ctx) {
    var gigs = ctx.state.gigs || {}, ids = Object.keys(gigs);
    var rows;
    if (ids.length) {
      var counts = {};
      ids.forEach(function (id) { var st = gigs[id].status; counts[st] = (counts[st] || 0) + 1; });
      var parts = Object.keys(GIG_SHORT).filter(function (k) { return counts[k]; })
        .map(function (k) { return GIG_SHORT[k] + ' ' + counts[k] + '件'; });
      rows = '<a class="li" href="#/gigs">' +
        '<span class="li__body"><span class="li__ttl">応募した案件</span>' +
          '<span class="li__sub">' + esc(parts.join('・')) + '</span></span>' +
        '<span class="li__end"><span class="num home-count">' + ids.length + '件</span>' + U.chevron() + '</span></a>';
    } else {
      var open = DATA.GIGS.filter(function (g) { return !R.gigLock(g).locked; }).length;
      rows = '<a class="li" href="#/gigs">' +
        '<span class="li__body"><span class="li__ttl">いま応募できる案件</span></span>' +
        '<span class="li__end"><span class="num home-count">' + open + '件</span>' + U.chevron() + '</span></a>';
    }

    // 紹介の行は、本人に紹介の記録があるときだけ。ホームから紹介を勧めることはしない
    var ref = R.referral(), hasRef = !!(ref.list.length && (ref.held || ref.confirmed));
    if (hasRef) {
      var held = ref.held > 0;
      rows += '<a class="li" href="#/referral">' +
        '<span class="li__body"><span class="li__ttl">' + (held ? '紹介報酬（保留中）' : '紹介報酬（確定）') + '</span>' +
          '<span class="li__sub">' + esc(held
            ? ref.holdDays + '日たって返金・解約がなければ確定'
            : ref.closeLabel) + '</span></span>' +
        '<span class="li__end"><span class="num home-count">' + esc(U.yen(held ? ref.held : ref.confirmed)) + '</span>' + U.chevron() + '</span></a>';
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
      var evList = R.upcoming().slice(0, 2);
      var shownEv = evList.map(function (e) { return e.id; });
      var focusHtml = focus.kind === 'lesson' ? focusLesson(focus) : focus.kind === 'step' ? focusStep(focus, ob) : focusRest(ctx);
      return '<div class="scr-home">' +
        head() +
        focusHtml +
        quick(ob, focus, shownEv) +
        '<div class="home-cols">' +
          '<div class="home-col">' + latest() + events(evList) + '</div>' +
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
