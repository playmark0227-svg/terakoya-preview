/* ============================================================
   スタートガイド（#/start）
   ------------------------------------------------------------
   入会から30日の10項目を、週ごとのチェックリストで出す。済かどうかの判定は
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

  /* data.js の ONBOARDING.week と対応する */
  var WEEKS = [
    { n: 1, days: '1〜7日目' },
    { n: 2, days: '8〜14日目' },
    { n: 3, days: '15〜21日目' },
    { n: 4, days: '22〜30日目' }
  ];
  /* 項目ごとのボタンの文言（行き先の画面へ飛ぶもの） */
  var VERB = { orient: '見る', intro: '書く', lesson3: '見る', gig: '探す', event: '探す', showcase: '見る' };

  var GOAL_EXAMPLES = [
    'オリエンテーションと「ビジネスの基礎」を見終える',
    'お小遣い案件に1件応募して、最後までやり終える',
    'SNSのプロフィールを整えて、週3回投稿する'
  ];
  var LINE_ITEMS = [
    '新しい講座（レベルが上がって開いたものも）',
    'いまのレベルで応募できる新着の案件',
    'イベントの新着と、予約したイベントの前日',
    '相談・メッセージへの返信'
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
  /** 最後の項目を終えたのが入会何日目か */
  function finishDay(ob) {
    var last = null;
    ob.steps.forEach(function (s) { var t = validDate(s.doneAt); if (t && (!last || t > last)) last = t; });
    if (!last) return Math.max(1, ob.day);
    return Math.max(1, Math.round((dayStart(last) - dayStart(R.me().joinedAt)) / DAY) + 1);
  }
  /** 次の成果発表会の日時と予約の状態（文字は esc 済みで返す） */
  function showcaseLine(sc) {
    if (!sc) return '次回の成果発表会は日程未定';
    return '次回 ' + U.fmtShort(sc.at, true) +
      (R.isReserved(sc.id) ? '<span class="tag tag-ok">予約済み</span>'
        : isFull(sc) ? '・満席' : '・未予約');
  }

  /* ---------- 見出しの下の一文（進みぐあい） ---------- */
  function progressText(ob) {
    var day = Math.max(1, ob.day);
    if (ob.finished) return ob.total + '項目すべて済み。入会' + finishDay(ob) + '日目に終わりました。';
    if (day > 30) return '入会' + day + '日目。残り' + count(ob.total - ob.done) + '。';
    if (!ob.done) return '入会' + day + '日目。やることは' + ob.total + '項目です。';
    return '入会' + day + '日目。' + ob.total + '項目のうち<b class="num">' + ob.done + '</b>つ済み。';
  }

  /* ---------- 30日後の目標 ---------- */
  function goalCard(g) {
    var by = validDate(g.by), due = '';
    if (by) due = U.fmtDate(by, { noYear: true }) + 'まで' + (daysFromToday(by) < 0 ? '（過ぎています）' : '');
    return '<section class="card st-goal" aria-labelledby="st-goal-ttl">' +
      '<div class="st-goal__body">' +
        '<h2 class="st-goal__ttl" id="st-goal-ttl">30日後の目標' + (due ? '<span class="st-goal__due">' + due + '</span>' : '') + '</h2>' +
        '<p class="st-goal__what">' + esc(g.what) + '</p>' +
      '</div>' +
      '<button type="button" class="btn btn-soft btn-s" data-st="goal">変える</button>' +
    '</section>';
  }

  /* ---------- 項目の一行 ---------- */
  /** まだの項目に添える、いまの状況（外の文字は esc 済みで返す） */
  function hint(st, ctx) {
    var s = ctx.state;
    if (st.id === 'orient') {
      var cs = R.courseState('orientation');
      return cs.done ? cs.done + ' / ' + cs.total + '本 見ました' : '';
    }
    if (st.id === 'lesson3') return 'いま ' + Math.min(3, Object.keys(s.done || {}).length) + ' / 3本';
    if (st.id === 'gig') {
      var n = openGigs('small');
      return n ? '応募できるお小遣い案件 ' + n + '件' : '';
    }
    if (st.id === 'event') {
      var mine = R.myUpcoming()[0], ev = mine || upcomingOpen()[0];
      return ev ? (mine ? '予約中：' : '直近：') + U.fmtShort(ev.at, true) + '「' + esc(ev.title) + '」' : '';
    }
    if (st.id === 'showcase') return showcaseLine(nextShowcase());
    return '';
  }
  /** 説明の文。プロフィールは、足りない欄をそのまま書く */
  function descText(st) {
    if (st.id === 'profile') {
      var m = R.me(), miss = [];
      if (!m.name) miss.push('名前');
      if (!m.area) miss.push('地域');
      if (!m.job) miss.push('いまのお仕事');
      if (miss.length) return '未入力：' + miss.join('・');
    }
    return esc(st.desc);
  }
  /** 項目の下の1行。いまの状況が出せるものはそれだけを出し、なければ説明を出す。
      成果発表会だけは「1人3分・見るだけも可」を知らずに予約させないよう、両方出す */
  function subLine(st, ctx) {
    var h = hint(st, ctx);
    if (!h) return descText(st);
    return st.id === 'showcase' ? esc(st.desc) + '<br>' + h : h;
  }

  function action(st, isCur) {
    var cls = 'btn btn-s ' + (isCur ? 'btn-primary' : 'btn-soft');
    if (st.id === 'goal') return '<button type="button" class="' + cls + '" data-st="goal">決める</button>';
    if (st.id === 'line') return '<button type="button" class="' + cls + '" data-st="line">連携する</button>';
    if (st.id === 'profile') return '<a class="' + cls + '" href="#/account">入力する</a>';
    if (st.id === 'meet') return '<a class="' + cls + '" href="#/messages?kind=' + encodeURIComponent(MEET_KIND) + '">予約する</a>';
    if (st.id === 'showcase') {
      var sc = nextShowcase();
      if (sc && !R.isReserved(sc.id) && !isFull(sc)) return '<button type="button" class="' + cls + '" data-st="reserve" data-id="' + esc(sc.id) + '">予約する</button>';
      // 予約済み・満席なら、その回の詳細を開く（試作版の「参加したことにする」もそこにある）。
      // 当日まですることはないので朱にしない
      if (sc) return '<a class="btn btn-s btn-soft" href="#/events/' + encodeURIComponent(sc.id) + '">見る</a>';
    }
    if (st.id === 'event') {
      // もう予約しているなら、探させずにその回を開く（成果発表会と同じく、当日まですることはない）
      var mine = R.myUpcoming()[0];
      if (mine) return '<a class="btn btn-s btn-soft" href="#/events/' + encodeURIComponent(mine.id) + '">見る</a>';
    }
    return '<a class="' + cls + '" href="' + esc(st.go) + '">' + (VERB[st.id] || '開く') + '</a>';
  }

  function stepRow(st, cur, ctx) {
    if (st.done) {
      var at = validDate(st.doneAt);
      return '<div class="st-step is-done">' +
        '<span class="st-step__mark">' + icon('checkc') + '<span class="sr-only">済み</span></span>' +
        '<p class="st-step__ttl">' + esc(st.title) + '</p>' +
        (at ? '<span class="st-step__when">' + U.fmtShort(at) + '</span>' : '') +
      '</div>';
    }
    var isCur = !!cur && cur.id === st.id;
    return '<div class="st-step' + (isCur ? ' is-current' : '') + '">' +
      '<span class="st-step__mark">' + icon('circle') + '<span class="sr-only">まだ</span></span>' +
      '<div class="st-step__body">' +
        '<p class="st-step__ttl">' + esc(st.title) + ' <span class="st-step__xp">+' + st.xp + ' XP</span></p>' +
        '<p class="st-step__desc">' + subLine(st, ctx) + '</p>' +
      '</div>' +
      '<div class="st-step__act">' + action(st, isCur) + '</div>' +
    '</div>';
  }

  /* ---------- 週ごとのまとまり ---------- */
  function group(w, list, cur, ctx) {
    if (!list.length) return '';
    var d = countDone(list), full = d === list.length;
    var rows = list.map(function (st) { return stepRow(st, cur, ctx); }).join('');
    var head = '<span class="st-grp__n">' + w.n + '週目</span>' +
      '<span class="st-grp__days">' + w.days + '</span>' +
      '<span class="st-grp__count num">' + d + ' / ' + list.length + '</span>';
    if (full) {
      // 済んだ週はたたむ（押せば中身と日付が見える）
      return '<details class="st-grp is-full" data-week="' + w.n + '"' + (openWeeks[w.n] ? ' open' : '') + '>' +
        '<summary class="st-grp__head">' + head + U.chevron() + '</summary>' + rows +
      '</details>';
    }
    return '<section class="st-grp" aria-labelledby="st-grp-' + w.n + '">' +
      '<h2 class="st-grp__head" id="st-grp-' + w.n + '">' + head + '</h2>' + rows +
    '</section>';
  }

  /* ---------- 全部終えたあと ---------- */
  function nextBlock() {
    var cont = R.continueList()[0];
    var gigsOpen = openGigs();
    var sc = nextShowcase();
    function row(href, ttl, sub) {
      return '<a class="li" href="' + esc(href) + '">' +
        '<div class="li__body"><div class="li__ttl">' + esc(ttl) + '</div><div class="li__sub">' + sub + '</div></div>' + U.chevron() + '</a>';
    }
    return '<section class="st-next" aria-labelledby="st-next-ttl">' +
      '<h2 class="st-h2" id="st-next-ttl">次にすること</h2>' +
      '<div class="list">' +
        row(cont ? '#/courses/' + cont.c.id : '#/courses', '講座',
          cont ? esc((cont.st.started ? '続き：' : '次：') + cont.c.title + '（' + cont.st.done + ' / ' + cont.st.total + '本）') : '開いている講座から選ぶ') +
        row('#/gigs', '案件',
          gigsOpen ? '応募できる案件 ' + gigsOpen + '件' : 'いま応募できる案件はありません') +
        row(sc ? '#/events/' + encodeURIComponent(sc.id) : '#/events', '成果発表会', showcaseLine(sc)) +
      '</div>' +
    '</section>';
  }

  /* ---------- 横の欄：担当スタッフ・ルール ---------- */
  function staffCard() {
    var p = DATA.PEOPLE[STAFF_ID] || { name: '運営', role: '', staff: true };
    return '<section class="card st-staff" aria-labelledby="st-staff-ttl">' +
      '<h2 class="st-side__ttl" id="st-staff-ttl">担当スタッフ</h2>' +
      '<div class="st-staff__who">' + U.avatar(p) +
        '<div><p class="st-staff__name">' + esc(p.name) + '</p><p class="st-staff__role">' + esc(p.role) + '</p></div></div>' +
      '<p class="st-staff__note">相談は回数無制限です。<br>返信は24時間以内。</p>' +
      '<a class="btn btn-ghost btn-block" href="#/messages">相談する</a>' +
    '</section>';
  }

  function rulesBox() {
    // ルールを説明している回を題で探す（回の並びが変わっても「第◯回」がずれないように）
    var ori = R.course('orientation'), no = 0, lesson = null;
    (ori ? ori.lessons : []).forEach(function (l, i) { if (!lesson && l.title.indexOf('ルール') >= 0) { lesson = l; no = i + 1; } });
    return '<details class="card st-rules"' + (rulesOpen ? ' open' : '') + '>' +
      '<summary class="st-rules__sum"><span>会員のルール</span>' + U.chevron() + '</summary>' +
      '<ol class="st-rules__list">' + DATA.RULES.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ol>' +
      (lesson ? '<p class="st-rules__more"><a href="#/courses/orientation">オリエンテーション第' + no + '回</a>でも説明しています。</p>' : '') +
    '</details>';
  }

  /* ---------- 窓：目標 ---------- */
  function goalModal(ctx) {
    var g = ctx.state.goal30, today = dayStart(CLG.now()), cur = g ? String(g.what || '') : '';
    var def = (g && validDate(g.by)) || addDays(R.me().joinedAt, 30);
    if (dayStart(def) < today) def = addDays(today, 30);
    var m = U.modal(
      '<form class="scr-start st-form" novalidate>' +
        '<h3 class="modal__ttl">30日後の目標</h3>' +
        '<label class="field"><span>目標</span>' +
          '<textarea class="textarea" name="what" rows="3" maxlength="80">' + esc(cur) + '</textarea></label>' +
        '<p class="st-form__ex-ttl">例</p>' +
        '<div class="chips st-form__ex">' + GOAL_EXAMPLES.map(function (x) {
          return '<button type="button" class="chip' + (x === cur ? ' is-on' : '') + '" aria-pressed="' + (x === cur) + '" data-ex="' + esc(x) + '">' + esc(x) + '</button>';
        }).join('') + '</div>' +
        '<label class="field"><span>期限</span>' +
          '<input class="input st-form__date" type="date" name="by" value="' + toInputDate(def) + '" min="' + toInputDate(today) + '"></label>' +
        '<p class="st-form__err" role="alert"></p>' +
        '<div class="modal__foot">' +
          '<button type="button" class="btn btn-soft" data-close>やめる</button>' +
          '<button type="submit" class="btn btn-primary">' + (g ? '変える' : '決める') + '</button>' +
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
      if (!what) { err.textContent = '目標を入れてください。'; f.what.focus(); return; }
      if (!by) { err.textContent = '期限の日付を選んでください。'; f.by.focus(); return; }
      if (dayStart(by) < today) { err.textContent = '期限は今日以降にしてください。'; f.by.focus(); return; }
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
        '<p class="st-line__lead">届くもの</p>' +
        '<ul class="st-line">' + LINE_ITEMS.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' +
        '<p class="st-line__note">通知はアカウントの画面で止められます。</p>' +
        '<div class="modal__foot">' +
          '<button type="button" class="btn btn-soft" data-close>あとで</button>' +
          '<button type="button" class="btn btn-primary" data-link>' + icon('line', 'ico-s') + 'LINEと連携する</button>' +
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
    if (isFull(ev)) { U.toast('満席になりました'); ctx.refresh(); return; }
    CLG.app.reward(R.reserve(id));
    U.toast('「' + ev.title + '」を予約しました（' + U.fmtShort(ev.at, true) + '）', 'ok');
    ctx.refresh();
  }

  CLG.screens = CLG.screens || {};
  CLG.screens.start = {
    title: 'スタートガイド',
    render: function (ctx) {
      var ob = R.onboarding();
      var groups = WEEKS.map(function (w) { return ob.steps.filter(function (s) { return s.week === w.n; }); });
      var goal = ctx.state.goal30 && ctx.state.goal30.what ? goalCard(ctx.state.goal30) : '';
      return '<div class="scr-start' + (ob.finished ? ' is-finished' : '') + '">' +
        '<div class="page-head">' +
          '<h1 class="page-ttl">スタートガイド</h1>' +
          '<p class="page-lead st-progress">' + progressText(ob) + '</p>' +
        '</div>' +
        '<div class="st-cols">' +
          '<div class="st-main">' +
            goal +
            (ob.finished ? nextBlock() : '') +
            '<div class="st-checklist">' +
              (ob.finished ? '<h2 class="st-h2">やったこと</h2>' : '') +
              '<div class="card st-list">' +
                WEEKS.map(function (w, i) { return group(w, groups[i], ob.current, ctx); }).join('') +
              '</div>' +
            '</div>' +
          '</div>' +
          '<aside class="st-aside" aria-label="担当スタッフとルール">' + staffCard() + rulesBox() + '</aside>' +
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
