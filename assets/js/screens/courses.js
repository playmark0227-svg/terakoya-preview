/* ============================================================
   講座（一覧・講座の中身・1本の再生画面・勉強会アーカイブ）
   ------------------------------------------------------------
   打ち合わせでいちばん大事にした「レベルが上がると動画が開いていく」を見せる画面。
   鍵のかかった講座も隠さずに並べる。先に何が待っているかが見えることが、続ける理由になるため。
   開く・開かないの判定は domain.js（R.courseState / R.lessonState）に任せ、ここでは見せ方だけを書く。
     #/courses                     一覧（レベルごと）
     #/courses?tab=archive         勉強会アーカイブ
     #/courses/<講座>              講座の中身
     #/lesson/<講座>/<回>          1本の再生画面
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon;

  /* 画面の中だけの状態（URLに出すほどではないもの） */
  var fac = 'all';        // 学部の絞り込み
  var genre = 'all';      // アーカイブのジャンル
  var played = {};        // この表示中に再生し終えた回。描き直しても「見終わった」を押せるままにする

  var PLAY_MS = 2500;     // 試作版の「再生」にかける時間
  var NOTE_KEY = 'terakoya-notes';
  /* 再生ボタンの三角。U.icon の play は画面の枠つきなので、丸いボタンの中には塗りの三角を使う */
  var PLAY_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8.4 5.7v12.6c0 .7.8 1.1 1.4.7l9.9-6.3a.8.8 0 0 0 0-1.4L9.8 5c-.6-.4-1.4 0-1.4.7z"/></svg>';

  /* ---------- 小さな道具 ---------- */
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function levelOf(lv) {
    for (var i = 0; i < DATA.LEVELS.length; i++) if (DATA.LEVELS[i].lv === lv) return DATA.LEVELS[i];
    return DATA.LEVELS[0];
  }
  function facName(id) { var f = byId(DATA.FACULTIES, id); return f ? f.name : ''; }
  function needXp(lv) { return Math.max(0, levelOf(lv).min - R.xp()); }
  /** 残りXPを講座の本数に言い換える（「あと30XP」より「あと2本」のほうが行動に移しやすい） */
  function lessonsFor(need) { return Math.max(1, Math.ceil(need / DATA.XP.lesson)); }
  function lessonIndex(c, id) { for (var i = 0; i < c.lessons.length; i++) if (c.lessons[i].id === id) return i; return -1; }
  function courseHref(c) { return '#/courses/' + esc(c.id); }
  function lessonHref(c, l) { return '#/lesson/' + esc(c.id) + '/' + esc(l.id); }
  function totalLessons() { return DATA.COURSES.reduce(function (a, c) { return a + c.lessons.length; }, 0); }
  function clock(sec) {
    sec = Math.round(sec);
    var h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60;
    return (h ? h + ':' + U.pad(m) : m) + ':' + U.pad(s);
  }
  /** 見終えた日。今日なら「今日」 */
  function dayLabel(iso) {
    return new Date(iso).toDateString() === CLG.now().toDateString() ? '今日' : U.fmtDate(iso, { noYear: true });
  }
  function doneMap() { return CLG.store.state.done || {}; }
  function reduceMotion() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }

  /** 道しるべ。items: [[表示, リンク先（なければ今いる場所）], …] */
  function crumb(items) {
    return '<nav class="crumb" aria-label="現在地">' + items.map(function (it, i) {
      return (i ? U.chevron() : '') +
        (it[1] ? '<a href="' + esc(it[1]) + '">' + esc(it[0]) + '</a>' : '<span aria-current="page">' + esc(it[0]) + '</span>');
    }).join('') + '</nav>';
  }

  function notFound(msg, trail) {
    return crumb(trail) +
      '<div class="card cr-nf">' + U.empty('search', msg) +
        '<div class="cr-nf__btns"><a class="btn btn-soft" href="#/courses">' + icon('back') + '講座の一覧へ</a></div>' +
      '</div>';
  }

  /* ---------- メモ（回ごと・このブラウザの中だけ） ---------- */
  function readNotes() {
    try {
      var o = JSON.parse(localStorage.getItem(NOTE_KEY) || '{}');
      return o && typeof o === 'object' ? o : {};
    } catch (e) { return {}; }
  }
  function writeNote(id, text) {
    try {
      var o = readNotes();
      if (String(text).trim()) o[id] = String(text); else delete o[id];
      localStorage.setItem(NOTE_KEY, JSON.stringify(o));
      return true;
    } catch (e) { return false; }
  }

  /* ---------- 再生画面の枠（講座とアーカイブで共通） ----------
     o: { key, eyebrow, title, min, ended, locked } */
  function player(o) {
    var total = clock(o.min * 60);
    return '<div class="cr-player' + (o.locked ? ' is-locked' : o.ended ? ' is-ended' : '') + '" data-cr-player="' + esc(o.key) + '" data-min="' + (+o.min || 1) + '">' +
      '<span class="cr-player__seal" aria-hidden="true">' + esc(DATA.SITE.seal) + '</span>' +
      '<div class="cr-player__head"><span class="cr-player__eyebrow">' + esc(o.eyebrow) + '</span>' +
        '<span class="cr-player__ttl">' + esc(o.title) + '</span></div>' +
      (o.locked
        ? '<div class="cr-player__lock"><span class="cr-player__lockico">' + icon('lock', 'ico-l') + '</span>まだ開いていません</div>'
        : '<button type="button" class="cr-player__play" data-cr-play aria-label="' + (o.ended ? 'もう一度再生する' : '再生する') + '">' + PLAY_SVG + '</button>' +
          '<span class="cr-player__again" aria-hidden="true">もう一度再生</span>' +
          '<span class="cr-player__now" aria-hidden="true">再生中（試作版は早送りで進みます）</span>') +
      '<div class="cr-player__foot"><span class="cr-player__note">試作版のため動画は入っていません</span>' +
        (o.locked ? '' : '<span class="cr-player__time num"><span data-cr-time>' + (o.ended ? total : '0:00') + '</span> / ' + total + '</span>') +
      '</div>' +
      '<div class="cr-player__bar"><i style="width:' + (o.ended ? 100 : 0) + '%"></i></div>' +
    '</div>';
  }

  /** 再生ボタンを押すと、進みの帯を最後まで流す。動きを減らす設定なら、すぐ終わりにする */
  function bindPlayer(el, onEnd) {
    if (!el) return;
    var btn = el.querySelector('[data-cr-play]');
    if (!btn) return;
    btn.addEventListener('click', function () {
      if (el.classList.contains('is-playing')) return;
      var bar = el.querySelector('.cr-player__bar i'), time = el.querySelector('[data-cr-time]');
      var totalSec = (+el.getAttribute('data-min') || 1) * 60;
      var ms = reduceMotion() ? 0 : PLAY_MS, t0 = Date.now();
      el.classList.remove('is-ended');
      el.classList.add('is-playing');
      bar.style.transition = 'none'; bar.style.width = '0%';
      void bar.offsetWidth;
      bar.style.transition = ''; bar.style.width = '100%';
      var timer = setInterval(function () {
        // 再生中に別の画面へ移った・窓を閉じたときは、見終わったことにしない
        if (!el.isConnected) { clearInterval(timer); return; }
        var f = ms ? Math.min(1, (Date.now() - t0) / ms) : 1;
        if (time) time.textContent = clock(totalSec * f);
        if (f < 1) return;
        clearInterval(timer);
        el.classList.remove('is-playing');
        el.classList.add('is-ended');
        btn.setAttribute('aria-label', 'もう一度再生する');
        if (onEnd) onEnd();
      }, ms ? 80 : 0);
    });
  }

  /* ---------- 札 ---------- */
  function statusTag(c, st) {
    if (st.locked) return '<span class="tag">' + icon('lock', 'ico-s') + 'Lv' + c.level + '</span>';
    if (st.completed) return '<span class="tag tag-ok">' + icon('check', 'ico-s') + '修了</span>';
    if (st.started) return '<span class="tag tag-accent">受講中</span>';
    return '<span class="tag">未着手</span>';
  }
  function stateIcon(ls) {
    return ls === 'done' ? icon('checkc') : ls === 'open' ? icon('play') : icon('lock');
  }

  /* ============================================================
     一覧
     ============================================================ */
  function head(arc) {
    var lv = R.level();
    var lead = arc
      ? '勉強会の録画は、レベルに関係なく全員が見られます。'
      : '全' + DATA.COURSES.length + '講座・' + totalLessons() + '本。レベルが上がると、次の講座が開きます。';
    return '<div class="page-head"><div class="page-head__row">' +
        '<div><h1 class="page-ttl">講座</h1><p class="page-lead">' + lead + '</p></div>' +
        '<button type="button" class="cr-lvline" data-cr-level>' + U.lvBadge(lv.lv, lv.name) +
          '<span class="cr-lvline__to">' + (lv.next ? 'あと<b class="num">' + lv.toNext + '</b>XP' : '最高レベルです') + '</span>' +
          U.chevron() + '</button>' +
      '</div></div>' +
      '<div class="seg cr-seg" role="group" aria-label="表示の切り替え">' +
        '<button type="button" class="' + (arc ? '' : 'is-on') + '" aria-pressed="' + !arc + '" data-cr-tab="#/courses">講座</button>' +
        '<button type="button" class="' + (arc ? 'is-on' : '') + '" aria-pressed="' + arc + '" data-cr-tab="#/courses?tab=archive">勉強会アーカイブ</button>' +
      '</div>';
  }

  function listView() {
    var lv = R.level();
    if (fac !== 'all' && !byId(DATA.FACULTIES, fac)) fac = 'all';
    return resumeBlock(lv) +
      '<section class="sec cr-all">' +
        '<h2 class="sec-ttl">講座の一覧</h2>' +
        facChips() +
        DATA.LEVELS.map(function (L) { return levelSection(L, lv); }).join('') +
      '</section>';
  }

  /** 続きから（始めていて終わっていない講座を1〜2本）。何も始めていなければ最初の1本を出す */
  function resumeBlock(lv) {
    var list = R.continueList();
    var rows = list.filter(function (x) { return x.st.started; }).slice(0, 2), ttl = '続きから';
    // 1本も見ていない人には「まずはここから」、講座を1つ終えて次を選ぶ人には「次に見るなら」
    if (!rows.length && list.length) { rows = [list[0]]; ttl = Object.keys(doneMap()).length ? '次に見るなら' : 'まずはここから'; }
    if (!rows.length) {
      return '<section class="sec"><div class="notice notice-ok">' + icon('checkc') +
        (lv.next
          ? '<div>開いている講座は、すべて見終えました。勉強会アーカイブやイベントでも経験値（XP）がたまります。' +
            '<a class="cr-inlink" href="#/courses?tab=archive">勉強会アーカイブを見る' + icon('arrow', 'ico-s') + '</a></div>'
          : '<div>すべての講座を修了しました。見直したい回は、各講座の目次から開けます。</div>') +
        '</div></section>';
    }
    return '<section class="sec cr-resume">' +
      '<h2 class="sec-ttl">' + ttl + '</h2>' +
      '<div class="list">' + rows.map(resumeRow).join('') + '</div>' +
      nextHint(lv) +
    '</section>';
  }

  function resumeRow(x) {
    var c = x.c, st = x.st, l = st.next, n = lessonIndex(c, l.id) + 1;
    return '<a class="li cr-rrow" href="' + lessonHref(c, l) + '">' +
      '<span class="cr-thumb" aria-hidden="true">' + PLAY_SVG + '</span>' +
      '<span class="li__body">' +
        '<span class="li__sub">' + esc(c.title) + '・第' + n + '回</span>' +
        '<span class="li__ttl">' + esc(l.title) + '</span>' +
        '<span class="cr-rrow__prog">' + U.progressBar(st.pct) + '<span class="num">' + st.done + '/' + st.total + '本</span><span>' + l.min + '分</span></span>' +
      '</span>' + U.chevron() +
    '</a>';
  }

  /** 次のレベルまでを講座の本数で言う。打ち合わせの「見終わる → 上がる → 開く」を先に知らせる */
  function nextHint(lv) {
    if (!lv.next) return '';
    var k = lessonsFor(lv.toNext), n = R.coursesAtLevel(lv.next.lv).length;
    return '<p class="cr-hint">' + icon('sparkle', 'ico-s') +
      '<span>講座なら、あと<b class="num">' + k + '</b>本で Lv' + lv.next.lv + '「' + esc(lv.next.name) + '」に上がり、新しい講座が' + n + 'つ開きます。</span></p>';
  }

  function facChips() {
    var all = [{ id: 'all', name: 'すべて', n: DATA.COURSES.length }].concat(DATA.FACULTIES.map(function (f) {
      return { id: f.id, name: f.name, n: DATA.COURSES.filter(function (c) { return c.faculty === f.id; }).length };
    }));
    var cur = byId(DATA.FACULTIES, fac);
    return '<div class="chips cr-chips" role="group" aria-label="学部で絞り込む">' + all.map(function (f) {
      var on = f.id === fac;
      return '<button type="button" class="chip' + (on ? ' is-on' : '') + '" aria-pressed="' + on + '" data-cr-fac="' + esc(f.id) + '">' +
        esc(f.name) + '<span class="n num">' + f.n + '</span></button>';
    }).join('') + '</div>' +
    (cur ? '<p class="cr-facdesc">' + esc(cur.desc) + '</p>' : '');
  }

  function levelSection(L, lv) {
    var list = DATA.COURSES.filter(function (c) { return c.level === L.lv && (fac === 'all' || c.faculty === fac); });
    if (!list.length) return '';
    var state = L.lv === lv.lv ? 'cur' : L.lv < lv.lv ? 'open' : 'locked';
    var need = Math.max(0, L.min - lv.xp);
    var right = state === 'cur' ? '<span class="tag tag-gold">いまのレベル</span>'
      : state === 'open' ? '<span class="cr-lvstate is-open">' + icon('unlock', 'ico-s') + '開いています</span>'
      : '<span class="cr-lvstate">' + icon('lock', 'ico-s') + 'あと<b class="num">' + need + '</b>XPで開きます</span>';
    // すぐ次のレベルだけは、どこまで来ているかを帯で見せる
    var near = state === 'locked' && L.lv === lv.lv + 1
      ? '<div class="cr-lvnext">' + U.progressBar(lv.pct, 'gold') + '<span>講座あと' + lessonsFor(need) + '本ぶん</span></div>' : '';
    return '<div class="cr-lvsec is-' + state + '">' +
      '<div class="cr-lvhead">' +
        '<h3 class="cr-lvhead__ttl"><span class="cr-lvnum">Lv' + L.lv + '</span>「' + esc(L.name) + '」<span class="cr-lvhead__n">' + list.length + '講座</span></h3>' +
        right + near +
      '</div>' +
      '<div class="grid-2 cr-grid">' + list.map(courseCard).join('') + '</div>' +
    '</div>';
  }

  function courseCard(c) {
    var st = R.courseState(c), t = R.person(c.teacher);
    var foot = st.locked
      ? '<span class="lockmark">' + icon('lock', 'ico-s') + 'あと' + needXp(c.level) + 'XPで開きます</span>'
      : U.progressBar(st.pct, st.completed ? 'ok' : null) + '<span class="cr-card__count num">' + st.done + '/' + st.total + '</span>';
    return '<a class="card card-link cr-card' + (st.locked ? ' is-locked' : '') + '" href="' + courseHref(c) + '">' +
      '<span class="cr-card__top"><span class="tag tag-line">' + esc(facName(c.faculty)) + '</span>' + statusTag(c, st) + '</span>' +
      '<span class="cr-card__ttl">' + esc(c.title) + '</span>' +
      '<span class="cr-card__sum">' + esc(c.summary) + '</span>' +
      '<span class="cr-card__meta"><span>' + st.total + '本・' + st.minutes + '分</span><span>' + esc(t.name) + '</span></span>' +
      '<span class="cr-card__foot">' + foot + U.chevron() + '</span>' +
    '</a>';
  }

  /* ============================================================
     講座の中身
     ============================================================ */
  function detailView(id) {
    var c = R.course(id);
    if (!c) return notFound('お探しの講座は見つかりませんでした。', [['講座', '#/courses'], ['見つかりません']]);
    var st = R.courseState(c), L = levelOf(c.level), notes = readNotes();
    return crumb([['講座', '#/courses'], [c.title]]) +
      '<div class="page-head">' +
        '<div class="row cr-tags"><span class="tag tag-line">' + esc(facName(c.faculty)) + '</span>' +
          '<span class="tag tag-line">Lv' + L.lv + '「' + esc(L.name) + '」で開く講座</span></div>' +
        '<h1 class="page-ttl">' + esc(c.title) + '</h1>' +
        '<p class="page-lead">' + esc(c.summary) + '</p>' +
      '</div>' +
      hero(c, st) +
      '<section class="sec">' +
        '<h2 class="sec-ttl">目次（全' + st.total + '回）</h2>' +
        '<div class="list">' + c.lessons.map(function (l, i) { return lessonRow(c, l, i, st, notes); }).join('') + '</div>' +
      '</section>' +
      gigsFor(c);
  }

  function hero(c, st) {
    var t = R.person(c.teacher), act, cont = R.continueList()[0];
    if (st.locked) {
      var L = levelOf(c.level), need = needXp(c.level);
      act = '<div class="notice cr-lock">' + icon('lock') +
        '<div><b>Lv' + L.lv + '「' + esc(L.name) + '」で開きます。</b>あと' + need + 'XP（講座' + lessonsFor(need) + '本ぶん）です。' +
        '<span class="cr-lock__sub">講座の題と目次は、先に見られます。経験値（XP）は、講座・勉強会アーカイブ・イベントでたまります。</span></div></div>' +
        '<div class="cr-hero__btns">' +
          // 開いている講座を見終えていれば、アーカイブでためる道を出す（ボタンが消えて行き止まりにしない）
          (cont
            ? '<a class="btn btn-primary" href="' + lessonHref(cont.c, cont.st.next) + '">' + icon('play') + (cont.st.started ? '続きの講座でXPをためる' : '開いている講座でXPをためる') + '</a>'
            : '<a class="btn btn-primary" href="#/courses?tab=archive">' + icon('play') + '勉強会アーカイブでXPをためる</a>') +
          '<button type="button" class="btn btn-soft" data-cr-level>レベルのしくみ</button>' +
        '</div>' +
        (cont ? '<p class="cr-hero__next">' + esc(cont.c.title) + '・第' + (lessonIndex(cont.c, cont.st.next.id) + 1) + '回「' + esc(cont.st.next.title) + '」から見られます。</p>' : '');
    } else if (st.completed) {
      var last = c.lessons.reduce(function (a, l) { var d = doneMap()[l.id]; return d && (!a || d > a) ? d : a; }, null);
      act = '<div class="notice notice-ok">' + icon('checkc') +
        '<div><b>修了しました</b>' + (last ? '（' + dayLabel(last) + '）' : '') +
        '<span class="cr-lock__sub">全' + st.total + '本を見終えました。見直したい回は、下の目次からも開けます。</span></div></div>' +
        '<div class="cr-hero__btns">' +
          '<a class="btn btn-ghost" href="' + lessonHref(c, c.lessons[0]) + '">' + icon('play') + 'もう一度見る</a>' +
          (cont ? '<a class="btn btn-text cr-nextcourse" href="' + courseHref(cont.c) + '">次に見るなら「' + esc(cont.c.title) + '」' + icon('arrow', 'ico-s') + '</a>' : '') +
        '</div>';
    } else {
      var nx = st.next, n = lessonIndex(c, nx.id) + 1;
      act = '<div class="cr-prog">' + U.progressBar(st.pct) + '<span class="num">' + st.done + '/' + st.total + '本</span></div>' +
        '<div class="cr-hero__btns">' +
          '<a class="btn btn-primary btn-l" href="' + lessonHref(c, nx) + '">' + icon('play') + (st.started ? '続きから見る' : '最初から見る') + '</a>' +
          '<p class="cr-hero__next">次は第' + n + '回「' + esc(nx.title) + '」・' + nx.min + '分</p>' +
        '</div>';
    }
    return '<div class="card cr-hero">' +
      '<div class="cr-hero__who">' + U.avatar(t) +
        '<div><b>' + esc(t.name) + '</b><span class="cr-hero__role">' + esc(t.role || '講師') + '</span></div></div>' +
      '<dl class="stats cr-stats">' +
        '<div><dt>本数</dt><dd>' + st.total + '<small>本</small></dd></div>' +
        '<div><dt>合計</dt><dd>' + st.minutes + '<small>分</small></dd></div>' +
        '<div><dt>進み</dt><dd>' + Math.round(st.pct) + '<small>%</small></dd></div>' +
      '</dl>' +
      '<div class="cr-hero__act">' + act + '</div>' +
    '</div>';
  }

  function lessonRow(c, l, i, st, notes) {
    var ls = R.lessonState(c, l.id);
    var sub = '第' + (i + 1) + '回・' + l.min + '分';
    if (ls === 'locked') sub += '・' + (st.locked ? 'Lv' + c.level + 'で開きます' : '前の回を見ると開きます');
    else if (ls === 'done') sub += '・見終わりました';
    if (notes[l.id]) sub += '・メモあり';
    var inner = '<span class="li__ico">' + stateIcon(ls) + '</span>' +
      '<span class="li__body"><span class="li__ttl">' + esc(l.title) + '</span><span class="li__sub">' + sub + '</span></span>';
    if (ls === 'locked') return '<div class="li has-ico cr-ls is-locked">' + inner + '</div>';
    return '<a class="li has-ico cr-ls is-' + ls + '" href="' + lessonHref(c, l) + '">' + inner +
      (ls === 'open' ? '<span class="tag tag-accent">次はここ</span>' : '') + U.chevron() + '</a>';
  }

  /** この講座の修了が条件になっている案件。報酬は必ず「目安」と書く */
  function gigsFor(c) {
    var gs = DATA.GIGS.filter(function (g) { return g.requires === c.id; });
    var rows = gs.length ? gs.map(function (g) {
      var mine = R.gigState(g.id), lock = R.gigLock(g);
      var tag = mine ? '<span class="tag tag-indigo">' + esc(mine.label) + '</span>'
        : !lock.locked ? '<span class="tag tag-ok">応募できます</span>'
        : lock.course ? '<span class="tag">修了で応募できます</span>'
        : '<span class="tag">' + icon('lock', 'ico-s') + 'Lv' + g.level + 'から</span>';
      return '<a class="li has-ico" href="#/gigs/' + esc(g.id) + '"><span class="li__ico">' + icon('briefcase') + '</span>' +
        '<span class="li__body"><span class="li__ttl">' + esc(g.title) + '</span>' +
        '<span class="li__sub">報酬の目安 ' + esc(g.reward) + '・' + esc(g.time) + '</span></span>' +
        '<span class="li__end">' + tag + U.chevron() + '</span></a>';
    }).join('') : '<a class="li has-ico" href="#/gigs"><span class="li__ico">' + icon('briefcase') + '</span>' +
        '<span class="li__body"><span class="li__ttl">案件の一覧を見る</span>' +
        '<span class="li__sub">この講座に直接つながる案件は、いまはありません。お小遣い案件なら、どの講座からでも始められます。</span></span>' + U.chevron() + '</a>';
    return '<section class="sec">' +
      // つながる案件がない講座で「修了すると応募できる」と見出しだけ約束しないよう、見出しを変える
      '<h2 class="sec-ttl">' + (gs.length ? 'この講座を修了すると応募できる案件' : '案件') + '</h2>' +
      '<div class="list">' + rows + '</div>' +
      (gs.length ? '<p class="cr-note">報酬は目安です。内容や進み方によって変わります。</p>' : '') +
    '</section>';
  }

  /* ============================================================
     勉強会アーカイブ
     ============================================================ */
  function archiveView() {
    var seen = CLG.store.state.archiveSeen || {};
    var genres = [];
    DATA.ARCHIVE.forEach(function (a) { if (genres.indexOf(a.genre) < 0) genres.push(a.genre); });
    if (genre !== 'all' && genres.indexOf(genre) < 0) genre = 'all';
    var list = DATA.ARCHIVE.filter(function (a) { return genre === 'all' || a.genre === genre; })
      .sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    var seenN = DATA.ARCHIVE.filter(function (a) { return seen[a.id]; }).length;
    // 録画が残るオンラインの回だけ。オフ会は録画がないので出さない
    var live = R.upcoming().filter(function (e) { return e.recording && e.kind !== 'offline'; }).slice(0, 2);

    var chips = '<div class="chips cr-chips" role="group" aria-label="ジャンルで絞り込む">' +
      [{ id: 'all', name: 'すべて', n: DATA.ARCHIVE.length }].concat(genres.map(function (g) {
        return { id: g, name: g, n: DATA.ARCHIVE.filter(function (a) { return a.genre === g; }).length };
      })).map(function (g) {
        var on = g.id === genre;
        return '<button type="button" class="chip' + (on ? ' is-on' : '') + '" aria-pressed="' + on + '" data-cr-genre="' + esc(g.id) + '">' +
          esc(g.name) + '<span class="n num">' + g.n + '</span></button>';
      }).join('') + '</div>';

    return (live.length ? '<section class="sec">' +
        '<h2 class="sec-ttl"><span>これからのライブ</span><span class="cr-ttlnote">録画は終わったあと、ここに入ります</span></h2>' +
        '<div class="list">' + live.map(function (e) {
          return '<a class="li has-ico" href="#/events/' + esc(e.id) + '"><span class="li__ico">' + icon('calendar') + '</span>' +
            '<span class="li__body"><span class="li__ttl">' + esc(e.title) + '</span>' +
            '<span class="li__sub">' + U.fmtDate(e.at, { noYear: true, time: true }) + '・' + esc(e.place) + '</span></span>' +
            '<span class="li__end">' + (R.isReserved(e.id) ? '<span class="tag tag-indigo">予約済み</span>' : '') + U.chevron() + '</span></a>';
        }).join('') + '</div>' +
      '</section>' : '') +
      '<section class="sec">' +
        '<h2 class="sec-ttl"><span>録画</span><span class="cr-ttlnote">' + DATA.ARCHIVE.length + '本のうち ' + seenN + '本を見ました</span></h2>' +
        chips +
        '<div class="list cr-alist">' + (list.length ? list.map(function (a) {
          var t = R.person(a.teacher), s = !!seen[a.id];
          var tag = s ? '<span class="tag tag-ok">見た</span>' : '<span class="tag tag-gold num">+' + DATA.XP.archive + ' XP</span>';
          // 札は広い画面では右端、狭い画面では題の下に置く（題を細く折り返させないため）
          return '<button type="button" class="li has-ico cr-arow' + (s ? ' is-seen' : '') + '" data-cr-arc="' + esc(a.id) + '">' +
            '<span class="li__ico">' + icon(s ? 'checkc' : 'play') + '</span>' +
            '<span class="li__body"><span class="li__ttl">' + esc(a.title) + '</span>' +
            '<span class="li__sub">' + U.fmtDate(a.date, { noYear: true }) + '・' + a.min + '分・' + esc(t.name) + (genre === 'all' ? '・' + esc(a.genre) : '') + '</span>' +
            '<span class="cr-arow__tag is-narrow">' + tag + '</span></span>' +
            '<span class="li__end"><span class="cr-arow__tag is-wide">' + tag + '</span>' + U.chevron() + '</span>' +
          '</button>';
        }).join('') : U.empty('play', 'このジャンルの録画はまだありません。')) + '</div>' +
      '</section>';
  }

  function openArchive(id, ctx) {
    var a = byId(DATA.ARCHIVE, id);
    if (!a) return;
    var seenAt = (CLG.store.state.archiveSeen || {})[a.id], t = R.person(a.teacher);
    var m = U.modal(
      '<div class="scr-courses cr-amodal">' +
        player({ key: 'arc-' + a.id, eyebrow: '勉強会アーカイブ・' + a.genre, title: a.title, min: a.min, ended: !!seenAt }) +
        '<h3 class="modal__ttl">' + esc(a.title) + '</h3>' +
        '<p class="sub">' + U.fmtDate(a.date, { noYear: true }) + '・' + a.min + '分・' + esc(t.name) + '</p>' +
        (seenAt
          ? '<div class="notice notice-ok">' + icon('checkc') + '<div>' + dayLabel(seenAt) + 'に見ました。何度でも見直せます。</div></div>'
          : '<p class="xsmall muted cr-amodal__hint">見終わったら「見た」を押してください。学びの記録に +' + DATA.XP.archive + ' XP が付きます。</p>') +
        '<div class="modal__foot"><button type="button" class="btn btn-soft" data-close>閉じる</button>' +
          (seenAt ? '' : '<button type="button" class="btn btn-primary" data-cr-seen>見た（+' + DATA.XP.archive + ' XP）</button>') +
        '</div>' +
      '</div>', { wide: true });
    bindPlayer(m.querySelector('[data-cr-player]'));
    var b = m.querySelector('[data-cr-seen]');
    if (b) b.addEventListener('click', function () {
      b.disabled = true;
      var r = R.seeArchive(a.id);
      m.close();
      CLG.app.reward(r);
      ctx.refresh();
    });
  }

  CLG.screens.courses = {
    title: function (ctx) {
      if (ctx.params[0]) { var c = R.course(ctx.params[0]); return c ? c.title : '講座'; }
      return ctx.query.tab === 'archive' ? '勉強会アーカイブ' : '講座';
    },
    render: function (ctx) {
      if (ctx.params[0]) return '<div class="scr-courses">' + detailView(ctx.params[0]) + '</div>';
      var arc = ctx.query.tab === 'archive';
      return '<div class="scr-courses">' + head(arc) + (arc ? archiveView() : listView()) + '</div>';
    },
    mount: function (root, ctx) {
      // 描き直すたびに中身が新しくなるので、root ではなく画面の要素に付ける（二重にならない）
      var el = root.querySelector('.scr-courses');
      if (!el) return;
      el.addEventListener('click', function (e) {
        var t = e.target.closest('[data-cr-tab],[data-cr-fac],[data-cr-genre],[data-cr-level],[data-cr-arc]');
        if (!t || !el.contains(t)) return;
        var sel = null;
        if (t.hasAttribute('data-cr-tab')) { ctx.go(t.getAttribute('data-cr-tab')); return; }
        if (t.hasAttribute('data-cr-level')) { CLG.app.levelInfo(); return; }
        if (t.hasAttribute('data-cr-arc')) { openArchive(t.getAttribute('data-cr-arc'), ctx); return; }
        if (t.hasAttribute('data-cr-fac')) { fac = t.getAttribute('data-cr-fac'); sel = '[data-cr-fac="' + fac + '"]'; }
        if (t.hasAttribute('data-cr-genre')) { genre = t.getAttribute('data-cr-genre'); sel = '[data-cr-genre="' + genre + '"]'; }
        ctx.refresh();
        // 押した札に手元を戻す（キーボードで続けて選べるように）
        var again = null;
        try { again = root.querySelector(sel); } catch (err) {}
        if (again) { try { again.focus({ preventScroll: true }); } catch (err) {} }
      });
    }
  };

  /* ============================================================
     1本の再生画面
     ============================================================ */
  function findLesson(ctx) {
    var c = R.course(ctx.params[0]);
    if (!c) return null;
    var i = lessonIndex(c, ctx.params[1]);
    return i < 0 ? null : { c: c, l: c.lessons[i], i: i };
  }

  function lessonView(ctx) {
    var f = findLesson(ctx), c0 = R.course(ctx.params[0]);
    if (!f) {
      return notFound('お探しの回は見つかりませんでした。',
        c0 ? [['講座', '#/courses'], [c0.title, '#/courses/' + c0.id], ['見つかりません']] : [['講座', '#/courses'], ['見つかりません']]);
    }
    var c = f.c, l = f.l, i = f.i, n = i + 1;
    var ls = R.lessonState(c, l.id), st = R.courseState(c), t = R.person(c.teacher);
    return crumb([['講座', '#/courses'], [c.title, '#/courses/' + c.id], ['第' + n + '回']]) +
      '<div class="cr-lesson">' +
        '<div class="cr-lesson__main">' +
          player({ key: l.id, eyebrow: c.title + '・第' + n + '回', title: l.title, min: l.min, ended: ls === 'done' || !!played[l.id], locked: ls === 'locked' }) +
          '<div class="cr-lesson__head">' +
            '<h1 class="cr-lesson__ttl">' + esc(l.title) + '</h1>' +
            '<p class="cr-lesson__meta"><span>第' + n + '回 / 全' + c.lessons.length + '回</span><span>' + l.min + '分</span><span>講師 ' + esc(t.name) + '</span></p>' +
          '</div>' +
          action(c, l, i, ls, st) +
          todo(c, l) +
          (ls === 'locked' ? '' : memo(l)) +
          pager(c, i, ls, st) +
        '</div>' +
        '<aside class="cr-lesson__side" aria-label="この講座の目次">' + toc(c, i, st) + '</aside>' +
      '</div>';
  }

  function action(c, l, i, ls, st) {
    if (ls === 'locked') {
      if (st.locked) {
        var L = levelOf(c.level), need = needXp(c.level);
        return '<div class="notice cr-lock">' + icon('lock') +
          '<div><b>この講座は Lv' + L.lv + '「' + esc(L.name) + '」で開きます。</b>あと' + need + 'XP（講座' + lessonsFor(need) + '本ぶん）です。' +
          '<div class="cr-lock__btns"><a class="btn btn-primary" href="' + courseHref(c) + '">講座のページへ</a>' +
          '<button type="button" class="btn btn-ghost" data-cr-level>レベルのしくみ</button></div></div></div>';
      }
      var nx = st.next, k = nx ? lessonIndex(c, nx.id) + 1 : 1;
      return '<div class="notice cr-lock">' + icon('lock') +
        '<div><b>この回はまだ開いていません。</b>前の回を見ると開きます。いま開いているのは第' + k + '回「' + esc(nx ? nx.title : '') + '」です。' +
        '<div class="cr-lock__btns">' +
          (nx ? '<a class="btn btn-primary" href="' + lessonHref(c, nx) + '">第' + k + '回を見る</a>' : '<a class="btn btn-primary" href="' + courseHref(c) + '">講座のページへ</a>') +
        '</div></div></div>';
    }
    if (ls === 'done') {
      var next = c.lessons[i + 1], at = doneMap()[l.id];
      return '<div class="notice notice-ok cr-done">' + icon('checkc') +
        '<div class="cr-done__body"><b>見終わりました</b><span>' + (at ? dayLabel(at) + '・' : '') + '+' + DATA.XP.lesson + ' XP</span></div>' +
        (next
          ? '<a class="btn btn-primary" href="' + lessonHref(c, next) + '">次の回へ' + icon('arrow') + '</a>'
          : '<a class="btn btn-primary" href="' + courseHref(c) + '">講座に戻る</a>') +
      '</div>';
    }
    var ready = !!played[l.id], lv = R.level(), up = '';
    if (lv.next) {
      var k2 = lessonsFor(lv.toNext), cnt = R.coursesAtLevel(lv.next.lv).length;
      if (k2 === 1) up = 'この1本で Lv' + lv.next.lv + '「' + esc(lv.next.name) + '」に上がり、講座が' + cnt + 'つ開きます。';
      else if (k2 <= 3) up = 'あと' + k2 + '本で Lv' + lv.next.lv + '「' + esc(lv.next.name) + '」に上がります。';
    }
    return '<div class="card cr-act">' +
      '<div class="cr-act__body">' +
        '<p class="cr-act__hint" data-cr-hint aria-live="polite">' + (ready ? '見終わったら押してください。' : '再生して、最後まで見ると押せます。') + '</p>' +
        (up ? '<p class="cr-act__up">' + icon('sparkle', 'ico-s') + '<span>' + up + '</span></p>' : '') +
      '</div>' +
      '<button type="button" class="btn btn-primary btn-l cr-act__btn" data-cr-complete' + (ready ? '' : ' disabled') + '>見終わった（+' + DATA.XP.lesson + ' XP）</button>' +
    '</div>';
  }

  function todo(c, l) {
    return '<section class="sec">' +
      '<h2 class="sec-ttl">この回でやること</h2>' +
      '<div class="card card-pad cr-todo">' +
        '<ul class="cr-todo__list">' +
          '<li>「' + esc(l.title) + '」の要点を、' + l.min + '分でつかむ</li>' +
          '<li>気づいたことを、メモに1行だけ残す</li>' +
          '<li>今日か明日のうちに、小さく1つ試してみる</li>' +
        '</ul>' +
        '<p class="cr-todo__aim"><b>この講座のねらい</b>' + esc(c.summary) + '</p>' +
      '</div>' +
    '</section>';
  }

  function memo(l) {
    var text = readNotes()[l.id] || '';
    return '<section class="sec">' +
      '<h2 class="sec-ttl"><span>メモ</span><span class="cr-saved" data-cr-saved aria-live="polite"></span></h2>' +
      '<div class="card card-pad">' +
        '<label class="sr-only" for="crMemo">この回のメモ</label>' +
        '<textarea id="crMemo" class="textarea" rows="4" data-cr-memo placeholder="気づいたこと、やってみたいことを1行だけでも。">' + esc(text) + '</textarea>' +
        '<p class="xsmall muted cr-memo__note">書いたそばから保存されます。試作版では、このブラウザの中にだけ残ります。</p>' +
      '</div>' +
    '</section>';
  }

  function pager(c, i, ls, st) {
    var prev = c.lessons[i - 1], next = c.lessons[i + 1];
    function link(href, dir, ttl, cls) {
      return '<a class="cr-pager__a ' + cls + '" href="' + href + '"><span class="cr-pager__dir">' + dir + '</span>' +
        '<span class="cr-pager__ttl">' + esc(ttl) + '</span></a>';
    }
    var left;
    if (!prev) left = link(courseHref(c), icon('back', 'ico-s') + '講座の目次', c.title, 'is-prev');
    else if (R.lessonState(c, prev.id) === 'locked') {
      left = '<div class="cr-pager__a is-prev is-locked"><span class="cr-pager__dir">' + icon('lock', 'ico-s') + '前の回</span>' +
        '<span class="cr-pager__ttl">第' + i + '回 ' + esc(prev.title) + '</span>' +
        '<span class="cr-pager__sub">' + (st.locked ? 'Lv' + c.level + 'で開きます' : 'まだ開いていません') + '</span></div>';
    } else left = link(lessonHref(c, prev), icon('back', 'ico-s') + '前の回', '第' + i + '回 ' + prev.title, 'is-prev');
    var right;
    if (!next) right = link(courseHref(c), '講座の目次' + icon('arrow', 'ico-s'), c.title, 'is-next');
    else if (R.lessonState(c, next.id) === 'locked') {
      right = '<div class="cr-pager__a is-next is-locked"><span class="cr-pager__dir">' + icon('lock', 'ico-s') + '次の回</span>' +
        '<span class="cr-pager__ttl">第' + (i + 2) + '回 ' + esc(next.title) + '</span>' +
        '<span class="cr-pager__sub">' + (st.locked ? 'Lv' + c.level + 'で開きます' : ls === 'locked' ? '前の回を見ると開きます' : 'この回を見ると開きます') + '</span></div>';
    } else right = link(lessonHref(c, next), '次の回' + icon('arrow', 'ico-s'), '第' + (i + 2) + '回 ' + next.title, 'is-next');
    return '<nav class="cr-pager" aria-label="前後の回">' + left + right + '</nav>';
  }

  function toc(c, cur, st) {
    return '<h2 class="sec-ttl">目次</h2>' +
      '<div class="list cr-toc">' +
        '<a class="cr-toc__head" href="' + courseHref(c) + '"><span class="cr-toc__headbody">' +
          '<span class="cr-toc__ttl">' + esc(c.title) + '</span>' +
          '<span class="cr-toc__prog">' + U.progressBar(st.pct, st.completed ? 'ok' : null) + '<span class="num">' + st.done + '/' + st.total + '本</span></span>' +
        '</span>' + U.chevron() + '</a>' +
        c.lessons.map(function (l, i) {
          var ls = R.lessonState(c, l.id), isCur = i === cur;
          var inner = '<span class="li__ico">' + stateIcon(ls) + '</span>' +
            '<span class="li__body"><span class="li__ttl">' + (i + 1) + '. ' + esc(l.title) + '</span><span class="li__sub">' + l.min + '分</span></span>';
          // いま見ている回は押しても同じ画面なので、リンクにせず「いま」とだけ示す
          if (isCur) return '<div class="li has-ico cr-ls is-' + ls + ' is-current" aria-current="page">' + inner + '<span class="cr-toc__now">いま</span></div>';
          if (ls === 'locked') return '<div class="li has-ico cr-ls is-locked">' + inner + '</div>';
          return '<a class="li has-ico cr-ls is-' + ls + '" href="' + lessonHref(c, l) + '">' + inner + U.chevron() + '</a>';
        }).join('') +
      '</div>';
  }

  CLG.screens.lesson = {
    title: function (ctx) { var f = findLesson(ctx); return f ? f.l.title : '講座'; },
    render: function (ctx) { return '<div class="scr-lesson">' + lessonView(ctx) + '</div>'; },
    mount: function (root, ctx) {
      var el = root.querySelector('.scr-lesson'), f = findLesson(ctx);
      if (!el || !f) return;
      var btn = el.querySelector('[data-cr-complete]'), hint = el.querySelector('[data-cr-hint]');

      bindPlayer(el.querySelector('[data-cr-player]'), function () {
        played[f.l.id] = true;
        if (btn && btn.disabled && btn.isConnected !== false) {
          btn.disabled = false;
          if (hint) hint.textContent = '見終わったら押してください。';
        }
      });

      if (btn) btn.addEventListener('click', function () {
        btn.disabled = true;   // 二度押しで2回記録しないように
        var r = R.completeLesson(f.c.id, f.l.id);
        if (!r) U.toast('この回はすでに記録されています');
        CLG.app.reward(r);
        ctx.refresh();
      });

      el.addEventListener('click', function (e) {
        var t = e.target.closest('[data-cr-level]');
        if (t && el.contains(t)) CLG.app.levelInfo();
      });

      var memoEl = el.querySelector('[data-cr-memo]'), saved = el.querySelector('[data-cr-saved]'), tm = null, off = null;
      if (memoEl) memoEl.addEventListener('input', function () {
        var ok = writeNote(f.l.id, memoEl.value);
        clearTimeout(tm); clearTimeout(off);
        // 打つたびに出すとうるさいので、手が止まってから知らせる
        tm = setTimeout(function () {
          if (!saved) return;
          saved.textContent = ok ? '保存しました' : '保存できませんでした（ブラウザの設定を確かめてください）';
          saved.classList.add('is-on');
          off = setTimeout(function () { saved.classList.remove('is-on'); }, 2000);
        }, 500);
      });
    }
  };
})();
