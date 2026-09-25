/* ============================================================
   スタートガイド（#/start）
   ------------------------------------------------------------
   入会から30日の10項目を、週ごとのチェックリストで出す。済かどうかの判定は
   R.onboarding() に任せ、ここでは見せ方と「押したときの行き先」だけを書く。
   - 成果発表会は週の並びの外（onboarding().showcase）。題は「次の成果発表会（M/D）」
   - 目標とLINEは、この画面の窓で済ませる（よその画面に飛ばすと戻ってこないため）
   - 自動で済になる項目は、その操作ができる画面へ案内するだけにする
   - 項目ごとのボタン（文言と行き先）は stepAction() に1か所で持ち、ホームも同じものを使う
     （CLG.screens.start.stepAction / runStep）
   - LINE の連携から戻ってきたときは #/start?line=ok（失敗は ?line=ng）で開く
   - 支払いの猶予切れ・休会のあいだは、止まっている画面（講座・タイムラインなど）へのボタンを押せない形にする（blocked）
   - 横の欄の「9月入会の仲間の自己紹介」は #/feed?kind=intro&cohort=2026-09（同じ月の人がいなければ、しぼらずに自己紹介の一覧）
   - いまの項目のボタンには data-st-current（ホームは data-home-next）。LINE の窓で項目が済んでボタンが消えても、
     窓を閉じたら次の項目のボタンへ焦点が戻る。いまの項目より先の LINE・目標を押したときは、押したボタンにも同じ印を付けてから開く
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon;

  var DAY = 86400000;
  var cur = null;                       // mount で受け取った ctx（押したときに使う）
  /* 描き直しても、開いた週・ルールは開いたままにする */
  var openWeeks = {}, rulesOpen = false;
  var STAFF_ID = 'staff2';
  var MEET_KIND = '面談の予約';

  /* data.js の ONBOARDING.week と対応する */
  var WEEK_DAYS = { 1: '1〜7日目', 2: '8〜14日目', 3: '15〜21日目', 4: '22〜30日目' };

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
  /* 試作版で、LINE の側の操作が済んだことにするまでの時間 */
  var LINE_WAIT = { app: 2400, code: 7000 };

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
  function narrow() {
    try { return window.matchMedia('(max-width: 640px), (pointer: coarse)').matches; } catch (e) { return false; }
  }
  /** 参加済みのものは除く（試作版の「参加したことにする」は、開催前のイベントにも付けられるため） */
  function attended(id) { return (CLG.store.state.attended || []).some(function (a) { return a.id === id; }); }
  function upcomingOpen() { return R.upcoming().filter(function (e) { return !attended(e.id); }); }
  function nextShowcase() { return upcomingOpen().filter(function (e) { return e.kind === 'showcase'; })[0] || null; }
  /** いまのレベルで応募できて、まだ応募していない案件の数。
      紹介できるサービス（refer）は「応募」ではなく人をつなぐものなので数えない */
  function openGigs(type) {
    return DATA.GIGS.filter(function (g) {
      return g.type !== 'refer' && (!type || g.type === type) && !R.gigLock(g).locked && !R.gigState(g.id);
    }).length;
  }
  function countDone(list) { return list.filter(function (s) { return s.done; }).length; }
  /** そのリンクの先が、契約の状態（支払いの猶予切れ・休会）で止まっているか。止まっている先へのボタンは押せない形にする */
  function blocked(href) {
    var name = String(href || '').replace(/^#\/?/, '').split(/[/?]/)[0];
    if (!name || !R.planGate) return false;
    var g = R.planGate(name);
    return !!(g && !g.ok);
  }
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
    return '<span class="nw">' + esc(U.fmtShort(sc.at, true)) + '</span>' +
      (R.isReserved(sc.id) ? U.statusTag('reserved') : isFull(sc) ? '・満席' : '・未予約');
  }

  /* ---------- 項目ごとのボタン（ホームと共通） ----------
     { label, href }：その画面へ飛ぶ / { label, act:'goal'|'line'|'reserve', id? }：この画面の窓・その場の予約
     soft：当日まですることがない（予約済みの会を開くだけ）ので朱にしない */
  function stepAction(st) {
    var a = st ? baseAction(st) : null;
    if (a) a.step = st.id;
    return a;
  }
  function baseAction(st) {
    if (st.id === 'goal') return { label: '決める', act: 'goal' };
    if (st.id === 'line') return { label: R.lineLink().status === 'failed' ? 'もう一度' : '連携する', act: 'line' };
    if (st.id === 'profile') return { label: '入力する', href: '#/account' };
    if (st.id === 'meet') return { label: '予約する', href: '#/messages?kind=' + encodeURIComponent(MEET_KIND) };
    if (st.id === 'intro') return { label: '書く', href: '#/feed?intro=1' };
    if (st.id === 'orient') {
      // 講座の目次ではなく、次に見る回を直接開く
      var c = R.course('orientation'), cs = c ? R.courseState(c) : null;
      if (cs && !cs.locked && cs.next) return { label: cs.started ? '続きを見る' : '見る', href: '#/lesson/' + c.id + '/' + cs.next.id };
      return { label: '見る', href: st.go };
    }
    if (st.id === 'lesson3') {
      var cont = R.continueList()[0];
      if (cont && cont.st.next) return { label: '見る', href: '#/lesson/' + cont.c.id + '/' + cont.st.next.id };
      return { label: '見る', href: '#/courses' };
    }
    if (st.id === 'gig') return { label: '探す', href: openGigs('small') ? '#/gigs?type=small' : '#/gigs' };
    if (st.id === 'event') {
      // もう予約しているなら、探させずにその回を開く（当日まですることはない）
      var mine = R.myUpcoming()[0];
      if (mine) return { label: '見る', href: '#/events/' + encodeURIComponent(mine.id), soft: true };
      return { label: '探す', href: '#/events' };
    }
    if (st.id === 'showcase') {
      var sc = nextShowcase();
      if (sc && !R.isReserved(sc.id) && !isFull(sc)) return { label: '予約する', act: 'reserve', id: sc.id };
      // 予約済み・満席なら、その回の詳細を開く（試作版の「参加したことにする」もそこにある）
      if (sc) return { label: '見る', href: '#/events/' + encodeURIComponent(sc.id), soft: true };
      return { label: '見る', href: '#/events' };
    }
    return { label: '開く', href: st.go };
  }
  /** そのボタンの行き先（その場の予約はイベント）が止まっているか */
  function actBlocked(a) { return a.href ? blocked(a.href) : a.act === 'reserve' && blocked('#/events'); }
  /** stepAction をボタンの HTML にする。attr：押したときの印（画面ごとに名前が違う）。
      data-step-id は描き直しで押したものが入れ替わっても（予約する → 見る）焦点を戻すための印。
      mark：いまの項目のボタンに付ける印の名前（例 'data-st-current'）。LINE の窓などで項目が済んで押したボタンが消えても、
      窓を閉じたとき次の項目のボタンへ焦点が戻る（骨組みは消えたボタンの data-* で探し直す） */
  function actionHtml(a, cls, attr, mark) {
    var key = (a.step ? ' data-step-id="' + esc(a.step) + '"' : '') + (mark && /^data-[a-z-]+$/.test(mark) ? ' ' + mark + '="1"' : '');
    // 止まっている画面へのボタンは押せない形にする（理由はリストの上の知らせに1回だけ書く）
    if (actBlocked(a)) return '<button type="button" class="' + cls + '" disabled' + key + '>' + esc(a.label) + '</button>';
    if (a.act) {
      return '<button type="button" class="' + cls + '" ' + attr + '="' + esc(a.act) + '"' +
        (a.id ? ' data-id="' + esc(a.id) + '"' : '') + key + '>' + esc(a.label) + '</button>';
    }
    return '<a class="' + cls + '" href="' + esc(a.href) + '"' + key + '>' + esc(a.label) + '</a>';
  }
  function runStep(act, id, ctx) {
    ctx = ctx || cur;
    if (act === 'goal') goalModal(ctx);
    else if (act === 'line') lineFlow(ctx);
    else if (act === 'reserve') reserve(id, ctx);
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
  /** done：スタートガイドを終えたあと。期限が過ぎていても「過ぎています」とは言わず、記録として出す（変えるボタンもなし） */
  function goalCard(g, done) {
    var by = validDate(g.by), due = '', past = by && daysFromToday(by) < 0;
    if (by) due = U.fmtDate(by, { noYear: by.getFullYear() === CLG.now().getFullYear() }) + 'まで' + (past && !done ? '（過ぎています）' : '');
    var fixed = done && past;
    return '<section class="card st-goal" aria-labelledby="st-goal-ttl">' +
      '<div class="st-goal__body">' +
        '<h2 class="st-goal__ttl" id="st-goal-ttl">30日後の目標' + (due ? '<span class="st-goal__due">' + esc(due) + '</span>' : '') + '</h2>' +
        '<p class="st-goal__what">' + U.jp(g.what) + '</p>' +
      '</div>' +
      (fixed ? '' : '<button type="button" class="btn btn-soft btn-s" data-st="goal">変える</button>') +
    '</section>';
  }

  /* ---------- 項目の一行 ---------- */
  /** まだの項目に添える、いまの状況（esc 済みで返す） */
  function hint(st, ctx) {
    var s = ctx.state;
    if (st.id === 'orient') {
      var cs = R.courseState('orientation');
      return cs.done ? cs.done + '/' + cs.total + '回 見ました' : '';   // 講座の中は「回」で数える（ほかの画面の「2/5回」とそろえる）
    }
    if (st.id === 'lesson3') return 'いま ' + Math.min(3, Object.keys(s.done || {}).length) + ' / 3本';
    if (st.id === 'gig') {
      var n = openGigs('small');
      return n ? '応募できるお小遣い案件 ' + n + '件' : '';
    }
    if (st.id === 'event') {
      var mine = R.myUpcoming()[0], ev = mine || upcomingOpen()[0];
      return ev ? (mine ? '予約中：' : '直近：') + '<span class="nw">' + esc(U.fmtShort(ev.at, true)) + '</span>「' + U.jp(ev.title) + '」' : '';
    }
    if (st.id === 'line') {
      var l = R.lineLink();
      return l.status === 'pending' ? '連携の途中です' : l.status === 'failed' ? '連携できませんでした' : '';
    }
    return '';
  }
  /** 説明の文。プロフィールは、足りない欄をそのまま書く（ホームと同じ文：onboarding().missing） */
  function descText(st, ob) {
    if (st.id === 'profile' && ob.missing && ob.missing.text) return esc(ob.missing.text);
    return U.jp(st.desc);
  }
  /** 項目の下の1行。いまの状況が出せるものはそれだけを出し、なければ説明を出す。
      成果発表会だけは「1人3分・見るだけも可」を知らずに予約させないよう、両方出す */
  function subLine(st, ctx, ob) {
    if (st.id === 'showcase') return U.jp(st.desc) + '<br>' + showcaseLine(nextShowcase());
    return hint(st, ctx) || descText(st, ob);
  }

  function stepRow(st, ob, ctx) {
    if (st.done) {
      var at = validDate(st.doneAt);
      return '<div class="st-step is-done">' +
        '<span class="st-step__mark">' + icon('checkc') + '<span class="sr-only">済み</span></span>' +
        '<p class="st-step__ttl">' + U.jp(st.baseTitle || st.title) + '</p>' +
        (at ? '<span class="st-step__when">' + esc(U.fmtShort(at)) + '</span>' : '') +
      '</div>';
    }
    var isCur = !!ob.current && ob.current.id === st.id;
    var a = stepAction(st);
    var cls = 'btn btn-s ' + (isCur && !a.soft && !actBlocked(a) ? 'btn-primary' : 'btn-soft');
    return '<div class="st-step' + (isCur ? ' is-current' : '') + '">' +
      '<span class="st-step__mark">' + icon('circle') + '<span class="sr-only">まだ</span></span>' +
      '<div class="st-step__body">' +
        '<p class="st-step__ttl">' + U.jp(st.title) + '</p>' +
        '<p class="st-step__desc">' + subLine(st, ctx, ob) + '</p>' +
      '</div>' +
      // XP はボタンの下に（題の横に置くと、スマホで題が2行に割れるため）
      '<div class="st-step__act">' + actionHtml(a, cls, 'data-st', isCur ? 'data-st-current' : '') + '<span class="st-step__xp">+' + esc(st.xp) + ' XP</span></div>' +
    '</div>';
  }

  /* ---------- まとまり（週ごと・成果発表会） ---------- */
  function group(key, head, list, ob, ctx) {
    if (!list.length) return '';
    var d = countDone(list), full = d === list.length;
    var rows = list.map(function (st) { return stepRow(st, ob, ctx); }).join('');
    var inner = head + '<span class="st-grp__count num">' + d + ' / ' + list.length + '</span>';
    if (full) {
      // 済んだまとまりはたたむ（押せば中身と日付が見える）
      return '<details class="st-grp is-full" data-st-week="' + esc(key) + '"' + (openWeeks[key] ? ' open' : '') + '>' +
        '<summary class="st-grp__head">' + inner + U.chevron() + '</summary>' + rows +
      '</details>';
    }
    return '<section class="st-grp" aria-labelledby="st-grp-' + esc(key) + '">' +
      '<h2 class="st-grp__head" id="st-grp-' + esc(key) + '">' + inner + '</h2>' + rows +
    '</section>';
  }
  function weekGroup(w, ob, ctx) {
    return group(String(w.n), '<span class="st-grp__n">' + w.n + '週目</span>' +
      (WEEK_DAYS[w.n] ? '<span class="st-grp__days">' + WEEK_DAYS[w.n] + '</span>' : ''), w.steps, ob, ctx);
  }
  function showcaseGroup(ob, ctx) {
    if (!ob.showcase) return '';
    return group('sc', '<span class="st-grp__n">成果発表会</span>', [ob.showcase], ob, ctx);
  }

  /** 支払いの猶予切れ・休会のあいだ：押せない項目があることを1回だけ書く（帯の知らせとは別に、この一覧の話だけ） */
  function stopNotice() {
    var p = R.plan ? R.plan() : null;
    if (!p || !p.limited) return '';
    var text = p.status === 'paused' ? '休会中は、講座・タイムライン・イベント・案件の項目を進められません。'
      : 'お支払いが確認できるまで、講座・タイムライン・イベント・案件の項目を進められません。';
    return '<div class="notice st-stop">' + icon('info') + '<div>' + esc(text) + '</div></div>';
  }

  /* ---------- 全部終えたあと ---------- */
  function nextBlock() {
    var cont = R.continueList()[0];
    var gigsOpen = openGigs();
    var sc = nextShowcase();
    function row(href, ttl, sub) {
      var body = '<span class="li__body"><span class="li__ttl">' + esc(ttl) + '</span><span class="li__sub">' + sub + '</span></span>';
      if (blocked(href)) return '<div class="li is-locked">' + body + '</div>';
      return '<a class="li" href="' + esc(href) + '">' + body + U.chevron() + '</a>';
    }
    // 支払いの猶予切れ・休会で行き先が全部止まっているときは、この欄ごと出さない
    if (blocked('#/courses') && blocked('#/gigs') && blocked('#/events')) return '';
    return '<section class="st-next" aria-labelledby="st-next-ttl">' +
      '<h2 class="st-h2" id="st-next-ttl">次にすること</h2>' +
      '<div class="list">' +
        row(cont ? '#/courses/' + encodeURIComponent(cont.c.id) : '#/courses', '講座',
          cont ? U.jp((cont.st.started ? '続き：' : '次：') + cont.c.title + '（' + cont.st.done + '/' + cont.st.total + '回）') : '開いている講座から選ぶ') +
        row('#/gigs', '案件',
          gigsOpen ? '応募できる案件 ' + gigsOpen + '件' : 'いま応募できる案件はありません') +
        row(sc ? '#/events/' + encodeURIComponent(sc.id) : '#/events', '成果発表会', showcaseLine(sc)) +
      '</div>' +
    '</section>';
  }

  /* ---------- 横の欄：担当スタッフ・同期・ルール ---------- */
  function staffCard() {
    var p = R.person(STAFF_ID);
    return '<section class="card st-staff" aria-labelledby="st-staff-ttl">' +
      '<h2 class="st-side__ttl" id="st-staff-ttl">担当スタッフ</h2>' +
      '<div class="st-staff__who">' + U.avatar(p) +
        '<div><p class="st-staff__name">' + esc(p.name) + '</p><p class="st-staff__role">' + esc(p.role || '運営') + '</p></div></div>' +
      '<p class="st-staff__note">相談は回数無制限です。' + U.jp(DATA.SITE.replySla) + '。</p>' +
      '<a class="btn btn-ghost btn-block" href="#/messages">相談する</a>' +
    '</section>';
  }

  /** 「2026-09」（タイムラインの ?cohort= の形） */
  function ym(d) { d = validDate(d); return d ? d.getFullYear() + '-' + U.pad(d.getMonth() + 1) : ''; }
  /** 同じ月に入った人の自己紹介（タイムラインを自己紹介と入会月で絞った形 #/feed?kind=intro&cohort=2026-09 で開く）。
      書いた人の入会月の決め方はタイムラインと同じ（名簿 → 会員のページの入会日 → 投稿の月）。
      同じ月の人がいないとき（入会して何か月もたった人）は、しぼらずに「新しく入った人の自己紹介」にする（名前と中身を食い違わせない） */
  function peersLink() {
    if (blocked('#/feed')) return '';
    var j = validDate(R.me().joinedAt) || CLG.now(), mine = ym(j), idx = {};
    (R.members ? R.members({}) : []).forEach(function (m) { if (!m.me) idx[m.id] = m.cohortKey; });
    var peers = R.feed('intro').filter(function (p) {
      if (p.mine || p.by === 'me' || R.person(p.by).me || R.person(p.by).staff) return false;
      if (idx[p.by]) return idx[p.by] === mine;
      var pr = R.memberProfile ? R.memberProfile(p.by) : null;
      return ((pr && pr.joinedAt && ym(pr.joinedAt)) || ym(p.at)) === mine;
    }).length;
    var label = peers ? (j.getMonth() + 1) + '月入会の仲間の自己紹介' : '新しく入った人の自己紹介';
    var href = '#/feed?kind=intro' + (peers ? '&cohort=' + encodeURIComponent(mine) : '');
    return '<div class="list st-peers">' +
      '<a class="li" href="' + esc(href) + '">' +
        '<span class="li__body"><span class="li__ttl">' + esc(label) + '</span></span>' +
        U.chevron() + '</a>' +
    '</div>';
  }

  function rulesBox() {
    // ルールを説明している回を題で探す（回の並びが変わっても「第◯回」がずれないように）
    var ori = R.course('orientation'), no = 0, lesson = null;
    (ori ? ori.lessons : []).forEach(function (l, i) { if (!lesson && l.title.indexOf('ルール') >= 0) { lesson = l; no = i + 1; } });
    return '<details class="card st-rules"' + (rulesOpen ? ' open' : '') + '>' +
      '<summary class="st-rules__sum"><span>' + esc(DATA.RULES_TITLE || 'コミュニティのルール') + '</span>' + U.chevron() + '</summary>' +
      '<ol class="st-rules__list">' + DATA.RULES.map(function (r) { return '<li>' + U.jp(r) + '</li>'; }).join('') + '</ol>' +
      // 講座を止めている状態（支払いの猶予切れ・休会）では、開けない回を案内しない
      (lesson && !blocked('#/courses') ? '<p class="st-rules__more"><a href="#/courses/orientation">オリエンテーション第' + no + '回</a>でも説明しています。</p>' : '') +
    '</details>';
  }

  /* ---------- 窓：目標 ---------- */
  function goalModal(ctx) {
    var g = CLG.store.state.goal30, today = dayStart(CLG.now()), was = g ? String(g.what || '') : '';
    var def = (g && validDate(g.by)) || addDays(R.me().joinedAt, 30);
    if (dayStart(def) < today) def = addDays(today, 30);
    var m = U.modal(
      '<form class="st-form" id="stGoalForm" novalidate>' +
        '<label class="field"><span>目標</span>' +
          '<textarea class="textarea" name="what" rows="3" maxlength="80" required>' + esc(was) + '</textarea></label>' +
        '<div class="st-ex" role="group" aria-labelledby="stGoalEx"><p class="st-ex__ttl" id="stGoalEx">例</p>' +
          GOAL_EXAMPLES.map(function (x, i) {
            return '<button type="button" class="st-ex__item" aria-pressed="' + (x === was) + '" data-st-ex="' + i + '">' + esc(x) + '</button>';
          }).join('') +
        '</div>' +
        '<label class="field"><span>期限</span>' +
          '<input class="input st-form__date" type="date" name="by" required value="' + toInputDate(def) + '" min="' + toInputDate(today) + '"></label>' +
      '</form>',
      { title: '30日後の目標', cls: 'scr-start', dirty: true,
        foot: '<button type="button" class="btn btn-soft" data-close>やめる</button>' +
          '<button type="submit" class="btn btn-primary" form="stGoalForm">' + (g ? '変える' : '決める') + '</button>' });
    var form = m.querySelector('form'), f = form.elements;
    U.fieldErrors(form, {}, { focus: false });   // 「必須」の札を付ける
    /* 入っている文と同じ例文だけを「選んだ」形にする */
    function mark() {
      U.$$('[data-st-ex]', m).forEach(function (x) { x.setAttribute('aria-pressed', String(x.textContent === f.what.value)); });
    }
    U.$$('[data-st-ex]', m).forEach(function (b) {
      b.addEventListener('click', function () {
        f.what.value = b.textContent; m.setDirty(true);
        U.fieldErrors(form, { what: '' }, { focus: false }); mark();
      });
    });
    f.what.addEventListener('input', function () { U.fieldErrors(form, { what: '' }, { focus: false }); mark(); });
    f.by.addEventListener('input', function () { U.fieldErrors(form, { by: '' }, { focus: false }); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var what = f.what.value.replace(/\s+/g, ' ').trim(), by = fromInputDate(f.by.value);
      var errs = { what: what ? '' : '目標を入れてください', by: !by ? '期限の日付を選んでください' : dayStart(by) < today ? '期限は今日以降にしてください' : '' };
      if (U.fieldErrors(form, errs)) return;
      var r = R.setGoal(what, by.toISOString());
      m.close();
      if (r) CLG.app.reward(r); else U.toast('目標を変えました', 'ok');
      ctx.refresh();
    });
  }

  /* ---------- 窓：LINE の連携 ----------
     スマホ：LINE のアプリへ移る → 「許可する」で戻る → 連携しました／できませんでした（もう一度）
     パソコン：友だち追加のQRと連携コード → コードが届いたら連携しました
     試作版は LINE を開けないので、少し待ってから「LINE の側で済んだ」ことにする */
  function lineFlow(ctx, start) {
    var timer = null, lineName = DATA.SITE.lineName || 'LINE';
    var m = U.modal('<div class="st-line" aria-live="polite"></div>', {
      title: 'LINEで通知を受け取る', cls: 'scr-start', foot: ' ',
      onClose: function () { clearTimeout(timer); }
    });
    var body = m.querySelector('.st-line'), foot = m.querySelector('.modal__foot');
    var itemsHtml = '<p class="st-line__lead">届くもの</p>' +
      '<ul class="st-line__list">' + LINE_ITEMS.map(function (x) { return '<li>' + U.jp(x) + '</li>'; }).join('') + '</ul>';
    var later = '<button type="button" class="btn btn-soft" data-close>あとで</button>';

    function show(state) {
      clearTimeout(timer);
      var l = R.lineLink();
      if (state === 'intro' || state === 'failed') {
        body.innerHTML = (state === 'failed'
          ? '<div class="notice notice-warn st-line__err">' + icon('alert') + '<div>連携できませんでした。</div></div>' : '') + itemsHtml;
        foot.innerHTML = later + '<button type="button" class="btn btn-primary" data-st-line="go">' +
          (state === 'failed' ? 'もう一度' : icon('line', 'ico-s') + 'LINEと連携する') + '</button>';
      } else if (state === 'app') {
        // スマホでは「本番ではLINEのアプリが開きます」の一言（toast）が窓の下の方に重なるので、
        // 文は上に寄せ、下を空けておく（.st-line__app の高さ）
        // 開くのは LINE のアプリ（公式LINE はアカウントの名前なので、アプリの名前には使わない）
        body.innerHTML = '<div class="st-line__app"><p class="st-line__big">LINEのアプリで「許可する」を押してください。</p>' +
          '<p class="st-line__wait" role="status">LINEのアプリを開いています…</p></div>';
        foot.innerHTML = '<button type="button" class="btn btn-soft" data-close>やめる</button>';
        timer = setTimeout(function () { finish(true); }, LINE_WAIT.app);
      } else if (state === 'code') {
        var code = String(l.code || ''), cardScr = CLG.screens.card;
        var qr = cardScr && cardScr.qr ? cardScr.qr('line|' + code, lineName + 'を友だちに追加するコード') : '';
        body.innerHTML = '<div class="st-line__pc">' +
            (qr ? '<div class="st-line__qr">' + qr + '</div>' : '') +
            '<ol class="st-line__steps">' +
              '<li>スマホのカメラで読み取って、' + esc(lineName) + 'を友だちに追加</li>' +
              '<li>トークに連携コードを送る</li>' +
            '</ol>' +
          '</div>' +
          '<div class="st-line__code"><span class="st-line__code-l">連携コード</span>' +
            '<b class="st-line__code-v num">' + esc(code.replace(/^(\d{3})(\d{3})$/, '$1 $2')) + '</b>' +
            '<button type="button" class="btn btn-ghost btn-s" data-st-line="copy">' + icon('copy', 'ico-s') + '<span>コードをコピー</span></button></div>' +
          '<p class="st-line__wait" role="status">コードが届くのを待っています…</p>';
        foot.innerHTML = '<button type="button" class="btn btn-soft" data-close>やめる</button>';
        timer = setTimeout(function () { finish(true); }, LINE_WAIT.code);
      } else if (state === 'done') {
        body.innerHTML = '<div class="st-line__done">' + icon('checkc', 'ico-l') +
          '<p class="st-line__done-ttl">連携しました</p>' +
          '<p class="st-line__done-sub">通知は' + esc(lineName) + 'に届きます。</p></div>';
        foot.innerHTML = '<button type="button" class="btn btn-ink" data-close>閉じる</button>';
        var b = foot.querySelector('button'); if (b) b.focus();
      }
    }
    function begin() {
      var l = R.startLineLink();
      if (narrow()) { U.toast('本番ではLINEのアプリが開きます'); show('app'); }
      else show(l.code ? 'code' : 'app');
    }
    function finish(ok) {
      if (!m.parentNode) return;
      var r = R.finishLineLink(ok);
      show(ok ? 'done' : 'failed');
      if (ok && r && r.steps) CLG.app.reward(r);
      ctx.refresh();
    }
    m.addEventListener('click', function (e) {
      var b = e.target.closest('[data-st-line]');
      if (!b) return;
      var act = b.getAttribute('data-st-line');
      if (act === 'go') begin();
      else if (act === 'copy') {
        U.copyText(String(R.lineLink().code || '')).then(function () { U.toast('連携コードをコピーしました', 'ok'); });
      }
    });

    var st = R.lineLink().status;
    if (start === 'ok' || start === 'ng') show(start === 'ok' ? 'done' : 'failed');
    else if (st === 'failed') show('failed');
    // 途中でやめた人がパソコンで開き直したときは、同じコードのまま待つ
    else if (st === 'pending' && !narrow() && R.lineLink().code) show('code');
    else show('intro');
    return m;
  }
  /** LINE から戻ってきたとき（#/start?line=ok / ?line=ng）。連携を始めていた人だけ */
  function lineReturn(ctx, q) {
    try { history.replaceState(null, '', '#/start'); } catch (e) {}
    if (R.lineLink().status !== 'pending') return;
    var ok = q === 'ok', r = R.finishLineLink(ok);
    lineFlow(ctx, ok ? 'ok' : 'ng');
    if (ok && r && r.steps) CLG.app.reward(r);
    ctx.refresh();
  }

  /* ---------- 成果発表会をその場で予約 ---------- */
  function reserve(id, ctx) {
    var ev = R.event(id);
    if (!ev || R.isReserved(id)) return;
    if (isFull(ev)) { U.toast('満席になりました'); ctx.refresh(); return; }
    var r = R.reserve(id);
    if (!r) { U.toast('予約できませんでした', 'error'); ctx.refresh(); return; }
    CLG.app.reward(r);
    U.toast('「' + ev.title + '」を予約しました（' + U.fmtShort(ev.at, true) + '）', 'ok');
    ctx.refresh();
  }

  CLG.screens = CLG.screens || {};
  CLG.screens.start = {
    title: 'スタートガイド',
    render: function (ctx) {
      var ob = R.onboarding();
      var goal = ctx.state.goal30 && ctx.state.goal30.what ? goalCard(ctx.state.goal30, ob.finished) : '';
      return '<div class="scr-start' + (ob.finished ? ' is-finished' : '') + '">' +
        '<div class="page-head">' +
          '<h1 class="page-ttl" data-page-title tabindex="-1">スタートガイド</h1>' +
          '<p class="page-lead st-progress">' + progressText(ob) + '</p>' +
          '<div class="st-bar">' + U.progressBar(ob.pct, ob.finished ? 'ok' : 'ink',
            { label: 'スタートガイドの進みぐあい', valuetext: ob.total + '項目のうち' + ob.done + '項目済み', cls: 'bar-s' }) + '</div>' +
        '</div>' +
        '<div class="st-cols">' +
          '<div class="st-main">' +
            // 終えたあとは「次にすること」を先に。目標は「やったこと」の中へ
            (ob.finished ? nextBlock() : goal) +
            '<div class="st-checklist">' +
              (ob.finished ? '<h2 class="st-h2">やったこと</h2>' + goal : '') +
              (ob.finished ? '' : stopNotice()) +
              '<div class="card st-list">' +
                ob.weeks.map(function (w) { return weekGroup(w, ob, ctx); }).join('') +
                showcaseGroup(ob, ctx) +
              '</div>' +
            '</div>' +
          '</div>' +
          '<aside class="st-aside" aria-label="担当スタッフとルール">' + staffCard() + peersLink() + rulesBox() + '</aside>' +
        '</div>' +
      '</div>';
    },
    mount: function (root, ctx) {
      cur = ctx;
      var q = ctx.query || {};
      // 描いている途中で描き直さないよう、次の番で開く
      if (q.line === 'ok' || q.line === 'ng') setTimeout(function () { lineReturn(ctx, q.line); }, 0);
      if (root.__boundStart) return;
      root.__boundStart = true;
      root.addEventListener('click', function (e) {
        var b = e.target.closest('.scr-start [data-st]');
        if (!b) return;
        var act = b.getAttribute('data-st');
        // いまの項目より先の LINE・目標（オリエンテーションの前に LINE を済ませる人が多い）も、済んでボタンが消えたら
        // いまの項目のボタンへ焦点が戻るように、押したボタンにも同じ印を付けてから窓を開く（骨組みは消えたボタンの data-* で探し直す）
        if ((act === 'line' || act === 'goal') && b.hasAttribute('data-step-id')) b.setAttribute('data-st-current', '1');
        runStep(act, b.getAttribute('data-id'), cur);
      });
      // toggle は泡立たないので、取り込みの段階で拾う（開いた週・ルールを描き直しても保つ）
      root.addEventListener('toggle', function (e) {
        var d = e.target;
        if (!d || !d.closest || !d.closest('.scr-start')) return;
        if (d.hasAttribute('data-st-week')) openWeeks[d.getAttribute('data-st-week')] = d.open;
        else if (d.classList.contains('st-rules')) rulesOpen = d.open;
      }, true);
    },
    /* ホームから使う（ボタンの文言と行き先をスタートガイドとそろえる） */
    stepAction: stepAction,
    actionHtml: actionHtml,
    runStep: runStep,
    blocked: blocked,
    actBlocked: actBlocked
  };
})();
