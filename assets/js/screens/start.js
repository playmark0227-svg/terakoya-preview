/* ============================================================
   スタートガイド（#/start）
   ------------------------------------------------------------
   入会から30日の10項目を、週ごとに並べる。済かどうかの判定は
   R.onboarding() に任せ、ここでは見せ方と「押したときの行き先」だけを書く。
   - 目標とLINEは、この画面の窓で済ませる（よその画面に飛ばすと戻ってこないため）
   - 自動で済になる項目は、その操作ができる画面へ案内するだけにする
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon;

  var DAY = 86400000;
  /* 描き直しても、開いた週・ルールは開いたままにする */
  var openWeeks = {}, rulesOpen = false;
  var STAFF_ID = 'staff2';
  var MEET_KIND = '面談の予約';

  /* 週ごとのねらい。data.js の ONBOARDING.week と対応する */
  var WEEKS = [
    { n: 1, name: '慣れる',   days: '1〜7日目',   lead: '使い方を知って、仲間にあいさつする週です。' },
    { n: 2, name: '学ぶ',     days: '8〜14日目',  lead: '目標を決めて、講座を少しずつ進める週です。' },
    { n: 3, name: '動く',     days: '15〜21日目', lead: '案件とイベントに、ひとつずつ手を出してみる週です。' },
    { n: 4, name: 'ふり返る', days: '22〜30日目', lead: '30日でやったこと・できたことを、言葉にする週です。' }
  ];
  /* 行き先の画面名 → ボタンの文言 */
  var DEST = { courses: '講座へ', feed: 'タイムラインへ', gigs: '案件へ', events: 'イベントへ' };

  var GOAL_EXAMPLES = [
    'オリエンテーションと「ビジネスの基礎」を見終える',
    'お小遣い案件に1件応募して、最後までやり終える',
    'SNSのプロフィールを整えて、週3回投稿する'
  ];
  var LINE_ITEMS = [
    ['play', '新しい講座', 'レベルが上がって開いた講座や、追加された回'],
    ['briefcase', '新着の案件', 'いまのレベルで応募できる案件'],
    ['calendar', 'イベント', '新しい勉強会と、予約したイベントの前日のお知らせ'],
    ['message', '運営からの返信', '相談・メッセージに返事が届いたとき']
  ];

  /* ---------- 小さな道具 ---------- */
  function dayStart(d) { d = new Date(d); d.setHours(0, 0, 0, 0); return d; }
  /** n日後の0時（ミリ秒で足すと、夏時間のある地域で1日ずれるため setDate で足す） */
  function addDays(d, n) { d = dayStart(d); d.setDate(d.getDate() + n); return d; }
  function validDate(d) { d = d ? new Date(d) : null; return d && !isNaN(d.getTime()) ? d : null; }
  /** 「3つ」「10項目」。「つ」で数えられるのは9まで */
  function count(n) { return n + (n < 10 ? 'つ' : '項目'); }
  /** 満席か。自分が予約済みなら、その席はある */
  function isFull(e) { return !!e && !R.isReserved(e.id) && e.cap > 0 && e.count >= e.cap; }
  /** 今日から見て何日後か（今日=0、過去は負） */
  function daysFromToday(d) { return Math.round((dayStart(d) - dayStart(CLG.now())) / DAY); }
  function toInputDate(d) { return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate()); }
  /** <input type="date"> の値 → その日の 23:59 */
  function fromInputDate(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || ''));
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 0, 0);
    return d.getMonth() === +m[2] - 1 ? d : null;
  }
  /** 入会何日目が何週目か。30日を過ぎたら 0（どの週でもない） */
  function weekOfDay(day) { return day > 30 ? 0 : Math.min(4, Math.max(1, Math.ceil(day / 7))); }
  /** 参加済みのものは除く（試作版の「参加したことにする」は、開催前のイベントにも付けられるため） */
  function attended(id) { return (CLG.store.state.attended || []).some(function (a) { return a.id === id; }); }
  function upcomingOpen() { return R.upcoming().filter(function (e) { return !attended(e.id); }); }
  function nextShowcase() { return upcomingOpen().filter(function (e) { return e.kind === 'showcase'; })[0] || null; }
  /** いまのレベルで応募できて、まだ応募していない案件の数。
      紹介できる商材（refer）は「応募」ではなく人をつなぐものなので数えない */
  function openGigs(type) {
    return DATA.GIGS.filter(function (g) {
      return g.type !== 'refer' && (!type || g.type === type) && !R.gigLock(g).locked && !R.gigState(g.id);
    }).length;
  }
  function countDone(list) { return list.filter(function (s) { return s.done; }).length; }
  function sumXp(list) { return list.reduce(function (a, s) { return a + (s.xp || 0); }, 0); }
  function destLabel(hash) {
    var name = String(hash || '').replace(/^#\/?/, '').split(/[\/?]/)[0];
    return DEST[name] || '開く';
  }
  /** 最後の項目を終えたのが入会何日目か */
  function finishDay(ob) {
    var last = null;
    ob.steps.forEach(function (s) { var t = validDate(s.doneAt); if (t && (!last || t > last)) last = t; });
    if (!last) return Math.max(1, ob.day);
    return Math.max(1, Math.round((dayStart(last) - dayStart(R.me().joinedAt)) / DAY) + 1);
  }

  /* ---------- 上の帯 ---------- */
  function heroMsg(ob, day, nowWeek) {
    var cur = ob.current, left = ob.total - ob.done, name = R.me().name;
    if (day > 30) return '30日を過ぎても、残りの' + count(left) + 'はいつでも進められます。次は「' + esc(cur.title) + '」です。';
    if (!ob.done && day <= 7) return (name ? esc(name) + 'さん、' : '') + 'ようこそ。上から順に進めると、1週目でこの場所の使い方がひと通り分かります。';
    // 1週目を過ぎてまだ何もしていない人にも、責めずに最初の1つだけを示す
    if (!ob.done) return 'まずは1つ目の「' + esc(cur.title) + '」から始めてみましょう。自分のペースで大丈夫です。';
    var s = 'あと' + count(left) + 'です。次は「' + esc(cur.title) + '」。';
    // 予定とずれているときだけ一言そえる。遅れは責めない
    if (cur.week < nowWeek) s += '少し遅れていても大丈夫です。自分のペースで進めましょう。';
    else if (cur.week > nowWeek) s += '予定より早く進んでいます。';
    return s;
  }

  function track(groups, nowWeek) {
    return '<div class="st-track">' + WEEKS.map(function (w, i) {
      var list = groups[i], d = countDone(list), full = list.length > 0 && d === list.length;
      var pct = list.length ? d / list.length * 100 : 0;
      return '<button type="button" class="st-seg' + (nowWeek === w.n ? ' is-now' : '') + (full ? ' is-full' : '') + '" data-st="week" data-n="' + w.n + '"' +
          ' aria-label="' + w.n + '週目「' + esc(w.name) + '」へ移動（' + d + ' / ' + list.length + '）">' +
        '<span class="st-seg__bar"><i style="width:' + pct + '%"></i></span>' +
        '<span class="st-seg__lbl">' + w.n + '週目' + (nowWeek === w.n ? '<em>いま</em>' : '') + '</span>' +
        '<span class="st-seg__name">' + esc(w.name) + (full ? icon('check', 'ico-s') : '') + '</span>' +
      '</button>';
    }).join('') + '</div>';
  }

  function hero(ob, groups, nowWeek) {
    var me = R.me(), day = Math.max(1, ob.day);
    var earned = sumXp(ob.steps.filter(function (s) { return s.done; })), all = sumXp(ob.steps);
    var head, msg, side;
    if (ob.finished) {
      head = '<p class="st-hero__big">すべて終えました</p>';
      msg = '入会' + finishDay(ob) + '日目で、' + ob.total + '項目をやり終えました。ここからは自分のペースで、学ぶ・動くを続けていきましょう。';
      side = '<div class="st-stamp" aria-hidden="true"><span>よく<br>できました</span></div>';
    } else {
      head = day > 30
        ? '<p class="st-hero__big">30日を過ぎました</p>'
        : '<p class="st-hero__day"><span class="num">Day <b>' + day + '</b><small>/ 30</small></span>' +
          '<span class="tag">' + (day < 30 ? 'あと' + (30 - day) + '日' : '今日が30日目') + '</span></p>';
      // 1つ目がまだなら、いまの項目はすぐ下に見えているので案内しない
      msg = heroMsg(ob, day, nowWeek) +
        (ob.done ? ' <button type="button" class="btn btn-text st-hero__jump" data-st="current">いまの項目を見る</button>' : '');
      side = '<div class="st-hero__ring">' + U.ring(ob.pct, ob.done + '/' + ob.total, 76) + '<small>できた項目</small></div>';
    }
    return '<section class="card st-hero" aria-label="最初の30日の進みぐあい">' +
      '<div class="st-hero__top">' +
        '<div class="st-hero__txt">' +
          '<p class="st-hero__eyebrow">最初の30日<span class="tag tag-line">' + esc(R.cohort()) + '</span></p>' +
          head +
          '<p class="st-hero__msg">' + msg + '</p>' +
          '<p class="st-hero__meta"><span>入会 ' + U.fmtDate(me.joinedAt, { noYear: true }) + '</span>' +
            '<span>スタートガイドのXP <b class="num">' + earned + '</b> / ' + all + '</span></p>' +
        '</div>' +
        side +
      '</div>' +
      track(groups, ob.finished ? 0 : nowWeek) +
    '</section>';
  }

  /* ---------- 30日後の目標 ---------- */
  function goalCard(g) {
    var by = validDate(g.by), due = '';
    if (by) {
      var left = daysFromToday(by);
      due = '<p class="st-goal__due">' + icon('clock', 'ico-s') + U.fmtDate(by, { noYear: true }) + 'まで' +
        (left > 0 ? '<b>あと' + left + '日</b>' : left === 0 ? '<b>今日まで</b>' : '<span class="tag tag-warn">期限を過ぎました</span>') + '</p>';
    }
    return '<section class="card st-goal" aria-label="30日後の目標">' +
      '<span class="st-goal__ico">' + icon('target') + '</span>' +
      '<div class="st-goal__body">' +
        '<p class="st-goal__lbl">30日後の目標</p>' +
        '<p class="st-goal__what">' + esc(g.what) + '</p>' +
        due +
      '</div>' +
      '<button type="button" class="btn btn-soft btn-s" data-st="goal">変える</button>' +
    '</section>';
  }

  /* ---------- 項目の一行 ---------- */
  /** まだの項目に添える、いまの状況（外の文字は esc 済みで返す） */
  function hint(st, ctx) {
    var s = ctx.state;
    // 記号と文を分けておく（狭い画面で、文だけが折り返すように）
    function hi(ico, html) { return icon(ico, 'ico-s') + '<span>' + html + '</span>'; }
    if (st.id === 'profile') {
      var m = R.me(), miss = [];
      if (!m.name) miss.push('名前');
      if (!m.area) miss.push('地域');
      if (!m.job) miss.push('いまのお仕事');
      return miss.length ? hi('pen', 'まだ：' + miss.join('・')) : '';
    }
    if (st.id === 'orient') {
      var cs = R.courseState('orientation');
      return cs.done ? hi('play', cs.done + ' / ' + cs.total + '本 見ました') : '';
    }
    if (st.id === 'lesson3') {
      return hi('play', 'いま ' + Math.min(3, Object.keys(s.done || {}).length) + ' / 3本');
    }
    if (st.id === 'gig') {
      var n = openGigs('small');
      return n ? hi('briefcase', 'すぐ始められるお小遣い案件：' + n + '件') : '';
    }
    if (st.id === 'event') {
      var mine = R.myUpcoming()[0], ev = mine || upcomingOpen()[0];
      return ev ? hi('calendar', (mine ? '予約中：' : '直近：') + U.fmtShort(ev.at, true) + '「' + esc(ev.title) + '」') : '';
    }
    if (st.id === 'showcase') {
      var sc = nextShowcase();
      if (!sc) return hi('calendar', '次回の日程は、決まりしだいお知らせします');
      return hi('calendar', '次回 ' + U.fmtDate(sc.at, { noYear: true, time: true }) +
        (R.isReserved(sc.id) ? '<span class="tag tag-ok">予約済み</span>'
          : isFull(sc) ? '<span class="st-step__not">満席です</span>'
          : '<span class="st-step__not">まだ予約していません</span>'));
    }
    return '';
  }

  function action(st, isCur) {
    var cls = 'btn btn-s ' + (isCur ? 'btn-primary' : 'btn-soft');
    if (st.id === 'goal') return '<button type="button" class="' + cls + '" data-st="goal">決める</button>';
    if (st.id === 'line') return '<button type="button" class="' + cls + '" data-st="line">連携する</button>';
    if (st.id === 'profile') return '<a class="' + cls + '" href="#/account">プロフィールへ</a>';
    if (st.id === 'meet') return '<a class="' + cls + '" href="#/messages?kind=' + encodeURIComponent(MEET_KIND) + '">予約する</a>';
    if (st.id === 'showcase') {
      var sc = nextShowcase();
      if (sc && !R.isReserved(sc.id) && !isFull(sc)) return '<button type="button" class="' + cls + '" data-st="reserve" data-id="' + esc(sc.id) + '">発表会を予約</button>';
      // 予約済み・満席なら、その回の詳細を開く（試作版の「参加したことにする」もそこにある）
      if (sc) return '<a class="' + cls + '" href="#/events/' + encodeURIComponent(sc.id) + '">' + destLabel(st.go) + '</a>';
    }
    return '<a class="' + cls + '" href="' + esc(st.go) + '">' + destLabel(st.go) + '</a>';
  }

  function stepRow(st, cur, ctx) {
    var isCur = !!cur && cur.id === st.id;
    var meta = '<span class="tag tag-gold num">+' + st.xp + ' XP</span>';
    if (st.done) {
      var at = validDate(st.doneAt);
      if (at) meta += '<span class="st-step__when">' + icon('check', 'ico-s') + U.fmtDate(at, { noYear: true, wd: false }) + 'にできました</span>';
    } else {
      var h = hint(st, ctx);
      if (h) meta += '<span class="st-step__hint">' + h + '</span>';
    }
    return '<div class="li has-ico st-step' + (st.done ? ' is-done' : '') + (isCur ? ' is-current' : '') + '"' + (isCur ? ' id="st-current"' : '') + '>' +
      '<span class="li__ico st-step__mark">' + icon(st.done ? 'checkc' : 'circle') +
        '<span class="sr-only">' + (st.done ? 'できました' : 'まだ') + '</span></span>' +
      '<div class="li__body">' +
        '<div class="li__ttl"><span>' + esc(st.title) + '</span>' + (isCur ? '<span class="tag tag-accent">いまここ</span>' : '') + '</div>' +
        '<div class="li__sub">' + esc(st.desc) + '</div>' +
        '<div class="st-step__meta">' + meta + '</div>' +
      '</div>' +
      (st.done ? '' : '<div class="st-step__act">' + action(st, isCur) + '</div>') +
    '</div>';
  }

  function weekBlock(w, list, cur, nowWeek, ctx) {
    if (!list.length) return '';
    var d = countDone(list);
    var rows = list.map(function (st) { return stepRow(st, cur, ctx); }).join('');
    if (d === list.length) {
      // 済んだ週はたたんで、残りの項目に目が行くようにする（押せば中身と日付が見える）
      return '<details class="card st-week st-week--done" id="st-week-' + w.n + '" data-week="' + w.n + '"' + (openWeeks[w.n] ? ' open' : '') + '>' +
        '<summary class="st-week__sum">' +
          '<span class="st-week__sum-ico">' + icon('check') + '</span>' +
          '<span class="st-week__sum-body">' +
            '<span class="st-week__sum-ttl"><span class="st-week__n">' + w.n + '週目</span>' + esc(w.name) + '</span>' +
            '<span class="st-week__sum-sub">' + (list.length === 1 ? 'できました' : list.length + 'つともできました') +
              '<span aria-hidden="true">・</span>+' + sumXp(list) + ' XP</span>' +
          '</span>' +
          U.chevron() +
        '</summary>' +
        '<div class="st-week__rows">' + rows + '</div>' +
      '</details>';
    }
    return '<section class="st-week" id="st-week-' + w.n + '" aria-labelledby="st-week-ttl-' + w.n + '">' +
      '<div class="st-week__head">' +
        '<h2 class="st-week__ttl" id="st-week-ttl-' + w.n + '"><span class="st-week__n">' + w.n + '週目</span>' + esc(w.name) + '</h2>' +
        '<span class="st-week__days">' + esc(w.days) + '</span>' +
        (nowWeek === w.n ? '<span class="tag tag-line">いまの週</span>' : '') +
        '<span class="spacer"></span>' +
        '<span class="st-week__count num">' + d + ' / ' + list.length + '</span>' +
      '</div>' +
      '<p class="st-week__lead">' + esc(w.lead) + '</p>' +
      '<div class="list">' + rows + '</div>' +
    '</section>';
  }

  /* ---------- 全部終えたあと ---------- */
  function nextBlock() {
    var cont = R.continueList()[0];
    var gigsOpen = openGigs();
    var sc = nextShowcase();
    function row(href, ico, ttl, sub) {
      return '<a class="li has-ico" href="' + esc(href) + '"><span class="li__ico">' + icon(ico) + '</span>' +
        '<div class="li__body"><div class="li__ttl">' + esc(ttl) + '</div><div class="li__sub">' + esc(sub) + '</div></div>' + U.chevron() + '</a>';
    }
    return '<section class="st-next" aria-labelledby="st-next-ttl">' +
      '<h2 class="sec-ttl" id="st-next-ttl">次にすること</h2>' +
      '<div class="list">' +
        row(cont ? '#/courses/' + cont.c.id : '#/courses', 'play', '講座を続ける',
          cont ? (cont.st.started ? '続き：' : '次の講座：') + cont.c.title + '（' + cont.st.done + ' / ' + cont.st.total + '本）' : '開いている講座から、次の1本を選べます') +
        row('#/gigs', 'briefcase', '案件に応募する',
          gigsOpen ? 'いまのレベルで応募できる案件が ' + gigsOpen + '件 あります' : 'レベルが上がると、応募できる案件が増えます') +
        row(sc ? '#/events/' + encodeURIComponent(sc.id) : '#/events', 'trophy', '成果発表会で、次の30日を宣言する',
          sc ? '次回 ' + U.fmtDate(sc.at, { noYear: true, time: true }) +
            (R.isReserved(sc.id) ? '・予約済み' : isFull(sc) ? '・満席です' : '・まだ予約していません') : '次回の日程は、決まりしだいお知らせします') +
      '</div>' +
    '</section>';
  }

  /* ---------- 横の欄：担当スタッフ・ルール ---------- */
  function staffCard() {
    var p = DATA.PEOPLE[STAFF_ID] || { name: '運営', role: '', staff: true };
    return '<section class="card st-staff" aria-labelledby="st-staff-ttl">' +
      '<h2 class="st-aside__ttl" id="st-staff-ttl">担当スタッフ</h2>' +
      '<div class="st-staff__who">' + U.avatar(p) +
        '<div><p class="st-staff__name">' + esc(p.name) + '</p><p class="st-staff__role">' + esc(p.role) + '</p></div></div>' +
      '<p class="st-staff__note">最初の30日を一緒に見ていく担当です。進め方で迷ったら、気軽に相談してください。回数の制限はありません。</p>' +
      '<p class="st-staff__reply">' + icon('clock', 'ico-s') + '返信の目安：24時間以内</p>' +
      '<a class="btn btn-ghost btn-block" href="#/messages">' + icon('message', 'ico-s') + '相談する</a>' +
    '</section>';
  }

  function rulesBox() {
    // ルールを説明している回を題で探す（回の並びが変わっても「第◯回」がずれないように）
    var ori = R.course('orientation'), no = 0, lesson = null;
    (ori ? ori.lessons : []).forEach(function (l, i) { if (!lesson && l.title.indexOf('ルール') >= 0) { lesson = l; no = i + 1; } });
    return '<details class="card st-rules"' + (rulesOpen ? ' open' : '') + '>' +
      '<summary class="st-rules__sum">' + icon('shield') + '<span>この場所のルール</span>' + U.chevron() + '</summary>' +
      '<ol class="st-rules__list">' + DATA.RULES.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ol>' +
      (lesson ? '<p class="st-rules__more">くわしくは、オリエンテーション第' + no + '回「' + esc(lesson.title) + '」で説明しています。' +
        '<a href="#/courses/orientation">オリエンテーションへ</a></p>' : '') +
    '</details>';
  }

  /* ---------- 窓：目標 ---------- */
  function goalModal(ctx) {
    var g = ctx.state.goal30, today = dayStart(CLG.now()), cur = g ? String(g.what || '') : '';
    var def = (g && validDate(g.by)) || addDays(R.me().joinedAt, 30);
    if (dayStart(def) < today) def = addDays(today, 30);
    var m = U.modal(
      '<form class="scr-start st-form" novalidate>' +
        '<h3 class="modal__ttl">' + (g ? '目標を変える' : '30日後の目標を決める') + '</h3>' +
        '<p class="sub st-form__lead">「何を」「いつまでに」が入っていると、運営があなたに合う講座や案件を案内しやすくなります。</p>' +
        '<label class="field"><span>30日後にどうなっていたいか</span>' +
          '<textarea class="textarea" name="what" rows="3" maxlength="80" placeholder="動画編集の講座を修了して、最初の編集案件に応募する">' + esc(cur) + '</textarea>' +
          '<small>「◯◯を修了する」「◯◯に応募する」のように、行動で書くのがおすすめです。</small></label>' +
        '<p class="st-form__ex-ttl">例から選ぶ</p>' +
        '<div class="chips st-form__ex">' + GOAL_EXAMPLES.map(function (x) {
          return '<button type="button" class="chip' + (x === cur ? ' is-on' : '') + '" aria-pressed="' + (x === cur) + '" data-ex="' + esc(x) + '">' + esc(x) + '</button>';
        }).join('') + '</div>' +
        '<label class="field"><span>期限</span>' +
          '<input class="input st-form__date" type="date" name="by" value="' + toInputDate(def) + '" min="' + toInputDate(today) + '">' +
          '<small>入会から30日後が目安です。</small></label>' +
        '<p class="st-form__err" role="alert"></p>' +
        '<div class="modal__foot">' +
          '<button type="button" class="btn btn-soft" data-close>やめる</button>' +
          '<button type="submit" class="btn btn-primary">' + (g ? 'この目標に変える' : 'この目標で決める') + '</button>' +
        '</div>' +
      '</form>');
    var form = m.querySelector('form'), f = form.elements, err = m.querySelector('.st-form__err');
    /* 入っている文と同じ例文だけを「選んだ」形にする */
    function mark() {
      U.$$('[data-ex]', m).forEach(function (x) {
        var on = x.getAttribute('data-ex') === f.what.value;
        x.classList.toggle('is-on', on); x.setAttribute('aria-pressed', on);
      });
    }
    U.$$('[data-ex]', m).forEach(function (b) {
      b.addEventListener('click', function () { f.what.value = b.getAttribute('data-ex'); err.textContent = ''; mark(); });
    });
    f.what.addEventListener('input', function () { err.textContent = ''; mark(); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var what = f.what.value.replace(/\s+/g, ' ').trim(), by = fromInputDate(f.by.value);
      if (!what) { err.textContent = '30日後にどうなっていたいかを、ひとことで書いてください。'; f.what.focus(); return; }
      if (!by) { err.textContent = '期限の日付を選んでください。'; f.by.focus(); return; }
      if (dayStart(by) < today) { err.textContent = '期限は今日以降の日付にしてください。'; f.by.focus(); return; }
      var r = R.setGoal(what, by.toISOString());
      m.close();
      if (r) CLG.app.reward(r); else U.toast('目標を変えました', 'ok');
      ctx.refresh();
    });
  }

  /* ---------- 窓：LINE ---------- */
  function lineModal(ctx) {
    var m = U.modal(
      '<div class="scr-start">' +
        '<h3 class="modal__ttl">LINEで通知を受け取る</h3>' +
        '<p class="sub">会員ページを開かなくても、大事なお知らせだけがLINEに届きます。</p>' +
        '<div class="list st-line">' + LINE_ITEMS.map(function (it) {
          return '<div class="li has-ico"><span class="li__ico">' + icon(it[0]) + '</span>' +
            '<div class="li__body"><div class="li__ttl">' + esc(it[1]) + '</div><div class="li__sub">' + esc(it[2]) + '</div></div></div>';
        }).join('') + '</div>' +
        '<p class="st-line__note">通知はアカウントの画面から、いつでも止められます。本番ではLINEの友だち追加の画面が開きます。試作版では、押すと連携したことになります。</p>' +
        '<div class="modal__foot">' +
          '<button type="button" class="btn btn-soft" data-close>あとで</button>' +
          '<button type="button" class="btn btn-primary" data-link>' + icon('line', 'ico-s') + 'LINEと連携する（試作）</button>' +
        '</div>' +
      '</div>');
    m.querySelector('[data-link]').addEventListener('click', function () {
      var r = R.linkLine(true);
      m.close();
      if (r) CLG.app.reward(r); else U.toast('LINEと連携しました', 'ok');
      ctx.refresh();
    });
  }

  /* ---------- 成果発表会をその場で予約 ---------- */
  function reserve(id, ctx) {
    var ev = R.event(id);
    if (!ev || R.isReserved(id)) return;
    if (isFull(ev)) { U.toast('満席です。本番では、キャンセル待ちに登録し、空きが出たらLINEでお知らせします'); ctx.refresh(); return; }
    CLG.app.reward(R.reserve(id));
    U.toast('「' + ev.title + '」を予約しました（' + U.fmtShort(ev.at, true) + '）', 'ok');
    ctx.refresh();
  }

  function scrollToEl(target, block) {
    if (!target || !target.scrollIntoView) return;
    var smooth = !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    target.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: block || 'start' });
  }

  CLG.screens = CLG.screens || {};
  CLG.screens.start = {
    title: 'スタートガイド',
    render: function (ctx) {
      var ob = R.onboarding();
      var nowWeek = ob.finished ? 0 : weekOfDay(Math.max(1, ob.day));
      var groups = WEEKS.map(function (w) { return ob.steps.filter(function (s) { return s.week === w.n; }); });
      return '<div class="scr-start' + (ob.finished ? ' is-finished' : '') + '">' +
        '<div class="page-head">' +
          '<h1 class="page-ttl">スタートガイド</h1>' +
          '<p class="page-lead">' + (ob.finished
            ? '入会から30日の歩みの記録です。ここで身につけたことを、次の30日につなげましょう。'
            : '入会から30日で、この場所の使い方と最初の一歩をひと通り。上から順に進めれば大丈夫です。') + '</p>' +
        '</div>' +
        hero(ob, groups, nowWeek) +
        '<div class="st-cols">' +
          '<div class="st-main">' +
            (ctx.state.goal30 && ctx.state.goal30.what ? goalCard(ctx.state.goal30) : '') +
            (ob.finished ? nextBlock() : '') +
            '<div class="st-weeks">' +
              (ob.finished ? '<h2 class="sec-ttl">30日の記録</h2>' : '') +
              WEEKS.map(function (w, i) { return weekBlock(w, groups[i], ob.current, nowWeek, ctx); }).join('') +
            '</div>' +
          '</div>' +
          '<aside class="st-aside" aria-label="相談とルール">' + staffCard() + rulesBox() + '</aside>' +
        '</div>' +
      '</div>';
    },
    mount: function (root, ctx) {
      // .scr-start は描き直すたびに新しい要素になるので、ここに付ければ二重にならない
      var el = root.querySelector('.scr-start');
      if (!el) return;
      el.addEventListener('click', function (e) {
        var b = e.target.closest('[data-st]');
        if (!b || !el.contains(b)) return;
        var act = b.getAttribute('data-st');
        if (act === 'goal') goalModal(ctx);
        else if (act === 'line') lineModal(ctx);
        else if (act === 'reserve') reserve(b.getAttribute('data-id'), ctx);
        else if (act === 'week') {
          var wk = el.querySelector('#st-week-' + b.getAttribute('data-n'));
          if (wk && wk.tagName === 'DETAILS' && !wk.open) wk.open = true;
          scrollToEl(wk);
        }
        else if (act === 'current') scrollToEl(el.querySelector('#st-current'), 'center');
      });
      // toggle は泡立たないので、1つずつ付ける（要素は描くたびに新しい）
      U.$$('details[data-week]', el).forEach(function (d) {
        d.addEventListener('toggle', function () { openWeeks[d.getAttribute('data-week')] = d.open; });
      });
      var rules = el.querySelector('.st-rules');
      if (rules) rules.addEventListener('toggle', function () { rulesOpen = rules.open; });
    }
  };
})();
