/* ============================================================
   講座（一覧・講座の中身・1本の再生画面・勉強会アーカイブ）
     #/courses                     一覧（レベルごと）
     #/courses?tab=archive         勉強会アーカイブ
     #/courses/<講座>              講座の中身
     #/lesson/<講座>/<回>          1本の再生画面
   開く・開かないの判定は domain.js（R.courseState / R.lessonState）。
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon;

  /* 画面の中だけの状態 */
  var fac = 'all';        // 学部の絞り込み
  var genre = 'all';      // アーカイブのジャンル
  var played = {};        // この表示中に再生し終えた回（描き直しても「見終わった」を押せるままにする）

  var PLAY_MS = 2500;     // 試作版の「再生」にかける時間
  var NOTE_KEY = 'terakoya-notes';
  var PLAY_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8.4 5.7v12.6c0 .7.8 1.1 1.4.7l9.9-6.3a.8.8 0 0 0 0-1.4L9.8 5c-.6-.4-1.4 0-1.4.7z"/></svg>';

  /* ---------- 小さな道具 ---------- */
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function levelOf(lv) {
    for (var i = 0; i < DATA.LEVELS.length; i++) if (DATA.LEVELS[i].lv === lv) return DATA.LEVELS[i];
    return DATA.LEVELS[0];
  }
  function facName(id) { var f = byId(DATA.FACULTIES, id); return f ? f.name : ''; }

  /* 学部の写真（DATA.FACULTIES の img）。写っている人は会員ではないので、alt は場面だけ書く */
  var FAC_ALT = {
    basic: '電卓で計算している手元',
    sns: 'カフェでスマートフォンを構える女性',
    skill: '夜、自宅でノートパソコンを見ながらメモを取る男性',
    sales: 'タブレットを見ながら話す二人',
    biz: '店の棚に器を並べる女性'
  };
  /** 講座の学部の写真（img だけ）。写真がない学部は空文字 */
  function facPhoto(c, cls) {
    var f = byId(DATA.FACULTIES, c.faculty);
    // 講座ごとの写真（c.img）があればそれ、なければ学部の写真
    var src = c.img || (f && f.img), alt = c.img ? c.alt : f && (f.alt || FAC_ALT[f.id] || f.name + 'の写真');
    if (!src) return '';
    return '<img' + (cls ? ' class="' + cls + '"' : '') + ' src="' + esc(src) + '" alt="' + esc(alt || '') + '"' +
      ' width="960" height="540" loading="lazy" decoding="async">';
  }
  /** 16:9の枠に入れた写真。枠は並びの最後に置いて CSS で左に出す（読み上げは題名から始まるように） */
  function photoBox(c, cls) {
    var img = facPhoto(c, '');
    return img ? '<span class="' + cls + '">' + img + '</span>' : '';
  }
  function needXp(lv) { return Math.max(0, levelOf(lv).min - R.xp()); }
  /** 残りXPを講座の本数に直す */
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
  /** 見終えた日。「9月4日(金)に」、今日なら「今日」（後ろに動詞をつなげる） */
  function onDay(iso) {
    return new Date(iso).toDateString() === CLG.now().toDateString() ? '今日' : U.fmtDate(iso, { noYear: true }) + 'に';
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

  /** back: [ボタンの文字, 行き先]。なければ講座の一覧へ */
  function notFound(msg, trail, back) {
    back = back || ['講座の一覧へ', '#/courses'];
    return crumb(trail) +
      '<div class="card cr-nf">' + U.empty('search', msg) +
        '<div class="cr-nf__btns"><a class="btn btn-soft" href="' + esc(back[1]) + '">' + esc(back[0]) + '</a></div>' +
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

  /* ---------- 再生画面の枠（講座とアーカイブで共通）。黒い16:9に再生ボタンだけ ----------
     o: { key, min, ended, locked, poster }。poster は学部の写真（img）。暗くして後ろに敷く */
  function player(o) {
    var total = clock(o.min * 60);
    return '<div class="cr-player' + (o.poster ? ' has-poster' : '') + (o.locked ? ' is-locked' : o.ended ? ' is-ended' : '') + '" data-cr-player="' + esc(o.key) + '" data-min="' + (+o.min || 1) + '">' +
      (o.poster || '') +
      (o.locked
        ? '<div class="cr-player__lock">' + icon('lock') + '<span>まだ見られません</span></div>'
        : '<button type="button" class="cr-player__play" data-cr-play aria-label="' + (o.ended ? 'もう一度再生する' : '再生する') + '">' + PLAY_SVG + '</button>' +
          '<span class="cr-player__time num"><span data-cr-time>' + (o.ended ? total : '0:00') + '</span> / ' + total + '</span>') +
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

  function stateIcon(ls) {
    return ls === 'done' ? icon('checkc') : ls === 'open' ? icon('play') : icon('lock');
  }

  /* ============================================================
     一覧
     ============================================================ */
  function head(arc) {
    var lv = R.level();
    var lead = arc
      ? '録画はレベルに関係なく全部見られます。'
      : '全' + DATA.COURSES.length + '講座、動画は' + totalLessons() + '本です。';
    return '<div class="page-head"><div class="page-head__row">' +
        '<div><h1 class="page-ttl">講座</h1><p class="page-lead">' + lead + '</p></div>' +
        '<button type="button" class="cr-lvline" data-cr-level>' + U.lvBadge(lv.lv, lv.name) +
          '<span class="cr-lvline__to">' + (lv.next ? 'あと<b class="num">' + lv.toNext + '</b>XP' : '最高レベル') + '</span>' +
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

  /** 続きから（始めていて終わっていない講座を1〜2本）。何も始めていなければ最初の1本 */
  function resumeBlock(lv) {
    var list = R.continueList();
    var rows = list.filter(function (x) { return x.st.started; }).slice(0, 2), ttl = '続きから';
    if (!rows.length && list.length) { rows = [list[0]]; ttl = Object.keys(doneMap()).length ? '次の講座' : '最初に見る講座'; }
    if (!rows.length) {
      return '<section class="sec"><div class="notice notice-ok cr-alldone">' +
        (lv.next
          ? '<div>開いている講座は全部見終わりました。勉強会アーカイブでもXPがたまります。' +
            '<a class="cr-inlink" href="#/courses?tab=archive">勉強会アーカイブへ</a></div>'
          : '<div>全講座を修了しました。</div>') +
        '</div></section>';
    }
    return '<section class="sec cr-resume">' +
      '<h2 class="sec-ttl">' + ttl + '</h2>' +
      '<div class="list">' + rows.map(resumeRow).join('') + '</div>' +
    '</section>';
  }

  function resumeRow(x) {
    var c = x.c, st = x.st, l = st.next, n = lessonIndex(c, l.id) + 1;
    return '<a class="li cr-rrow" href="' + lessonHref(c, l) + '">' +
      '<span class="li__body">' +
        '<span class="li__sub">' + esc(c.title) + ' 第' + n + '回・' + l.min + '分</span>' +
        '<span class="li__ttl">' + esc(l.title) + '</span>' +
        (st.started ? '<span class="cr-prog">' + U.progressBar(st.pct) + '<span class="num">' + st.done + '/' + st.total + '本</span></span>' : '') +
      '</span>' + U.chevron() +
      '<span class="cr-thumb">' + facPhoto(c, '') + '<span class="cr-thumb__play" aria-hidden="true">' + PLAY_SVG + '</span></span>' +
    '</a>';
  }

  function facChips() {
    var all = [{ id: 'all', name: 'すべて', n: DATA.COURSES.length }].concat(DATA.FACULTIES.map(function (f) {
      return { id: f.id, name: f.name, n: DATA.COURSES.filter(function (c) { return c.faculty === f.id; }).length };
    }));
    return '<div class="chips cr-chips" role="group" aria-label="学部で絞り込む">' + all.map(function (f) {
      var on = f.id === fac;
      return '<button type="button" class="chip' + (on ? ' is-on' : '') + '" aria-pressed="' + on + '" data-cr-fac="' + esc(f.id) + '">' +
        esc(f.name) + '<span class="n num">' + f.n + '</span></button>';
    }).join('') + '</div>';
  }

  /** 開いているレベルはカード、まだのレベルは行の一覧にする */
  function levelSection(L, lv) {
    var list = DATA.COURSES.filter(function (c) { return c.level === L.lv && (fac === 'all' || c.faculty === fac); });
    if (!list.length) return '';
    var locked = L.lv > lv.lv;
    var need = Math.max(0, L.min - lv.xp);
    var right = locked
      ? '<span class="cr-lvhead__need">あと' + need + 'XP' + (L.lv === lv.lv + 1 ? '（講座' + lessonsFor(need) + '本）' : '') + 'で開きます</span>'
      : '';
    return '<div class="cr-lvsec' + (locked ? ' is-locked' : '') + '">' +
      '<div class="cr-lvhead">' +
        '<h3 class="cr-lvhead__ttl">Lv' + L.lv + ' ' + esc(L.name) + '<span class="cr-lvhead__n">' + list.length + '講座</span></h3>' +
        right +
      '</div>' +
      (locked
        ? '<div class="list cr-llist">' + list.map(lockedRow).join('') + '</div>'
        : '<div class="grid-2 cr-grid">' + list.map(courseCard).join('') + '</div>') +
    '</div>';
  }

  function courseMeta(c, st) {
    var t = R.person(c.teacher);
    return st.total + '本・' + st.minutes + '分・' + esc(t.name);
  }

  function courseCard(c) {
    var st = R.courseState(c);
    var end = st.completed ? '<span class="tag tag-ok">修了</span>' : '';
    var photo = photoBox(c, 'cr-card__img');
    return '<a class="card card-link cr-card' + (photo ? ' has-img' : '') + '" href="' + courseHref(c) + '">' +
      '<span class="cr-card__body">' +
        '<span class="cr-card__ttl">' + esc(c.title) + '</span>' +
        '<span class="cr-card__meta">' + courseMeta(c, st) + '</span>' +
        (st.started && !st.completed ? '<span class="cr-prog">' + U.progressBar(st.pct) + '<span class="num">' + st.done + '/' + st.total + '</span></span>' : '') +
      '</span>' +
      end + U.chevron() + photo +
    '</a>';
  }

  /** まだ開いていない講座。写真は同じものを薄くして、鍵がかかっていると分かるようにする */
  function lockedRow(c) {
    var st = R.courseState(c);
    var photo = photoBox(c, 'cr-lrow__img');
    return '<a class="li cr-lrow' + (photo ? ' has-img' : '') + '" href="' + courseHref(c) + '">' +
      '<span class="li__body"><span class="li__ttl">' + esc(c.title) + '</span>' +
      '<span class="li__sub">' + courseMeta(c, st) + '</span></span>' + U.chevron() + photo +
    '</a>';
  }

  /* ============================================================
     講座の中身
     ============================================================ */
  function detailView(id) {
    var c = R.course(id);
    if (!c) return notFound('講座が見つかりませんでした。', [['講座', '#/courses'], ['見つかりません']]);
    var st = R.courseState(c), t = R.person(c.teacher), notes = readNotes();
    var photo = photoBox(c, 'cr-dhead__img');
    return crumb([['講座', '#/courses'], [c.title]]) +
      '<div class="page-head cr-dhead' + (photo ? ' has-img' : '') + (st.locked ? ' is-locked' : '') + '">' +
        '<div class="cr-dhead__body">' +
          '<h1 class="page-ttl">' + esc(c.title) + '</h1>' +
          '<p class="page-lead">' + esc(c.summary) + '</p>' +
          '<p class="cr-meta">' + esc(facName(c.faculty)) + '・全' + st.total + '回・' + st.minutes + '分・講師 ' + esc(t.name) + '</p>' +
        '</div>' +
        photo +
      '</div>' +
      startArea(c, st) +
      '<section class="sec">' +
        '<h2 class="sec-ttl"><span>目次</span>' + (st.locked ? '' : '<span class="cr-ttlnote num">' + st.done + '/' + st.total + '本</span>') + '</h2>' +
        '<div class="list">' + c.lessons.map(function (l, i) { return lessonRow(c, l, i, notes); }).join('') + '</div>' +
      '</section>' +
      gigsFor(c);
  }

  /** レベルが足りない講座で、XPをためるために次に見る1本 */
  function catchUpBtn() {
    var cont = R.continueList()[0];
    return cont
      ? '<a class="btn btn-primary" href="' + lessonHref(cont.c, cont.st.next) + '">' + esc(cont.c.title) + ' 第' + (lessonIndex(cont.c, cont.st.next.id) + 1) + '回を見る</a>'
      : '<a class="btn btn-primary" href="#/courses?tab=archive">勉強会アーカイブへ</a>';
  }
  function levelNeed(c) {
    var L = levelOf(c.level), need = needXp(c.level);
    return 'Lv' + L.lv + '「' + esc(L.name) + '」から見られます。あと' + need + 'XP（講座' + lessonsFor(need) + '本）です。';
  }

  function startArea(c, st) {
    var cont = R.continueList()[0];
    if (st.locked) {
      return '<div class="notice cr-lock"><div>' + levelNeed(c) + '</div></div>' +
        '<div class="cr-start">' + catchUpBtn() + '<button type="button" class="btn btn-soft" data-cr-level>レベルのしくみ</button></div>';
    }
    if (st.completed) {
      var last = c.lessons.reduce(function (a, l) { var d = doneMap()[l.id]; return d && (!a || d > a) ? d : a; }, null);
      return '<div class="cr-start">' +
        '<p class="cr-start__done">' + (last ? onDay(last) : '') + '修了しました。</p>' +
        '<a class="btn btn-soft" href="' + lessonHref(c, c.lessons[0]) + '">最初から見る</a>' +
        (cont ? '<a class="btn btn-text cr-nextcourse" href="' + courseHref(cont.c) + '">次は「' + esc(cont.c.title) + '」' + icon('arrow', 'ico-s') + '</a>' : '') +
      '</div>';
    }
    var nx = st.next, n = lessonIndex(c, nx.id) + 1;
    return '<div class="cr-start">' +
      '<a class="btn btn-primary btn-l" href="' + lessonHref(c, nx) + '">' + icon('play') + (st.started ? '続きから見る' : '第1回から見る') + '</a>' +
      (st.started ? '<p class="cr-start__next">第' + n + '回「' + esc(nx.title) + '」' + nx.min + '分</p>' : '') +
    '</div>';
  }

  function lessonRow(c, l, i, notes) {
    var ls = R.lessonState(c, l.id);
    var sub = '第' + (i + 1) + '回・' + l.min + '分' + (notes[l.id] ? '・メモあり' : '');
    var inner = '<span class="li__ico">' + stateIcon(ls) + '</span>' +
      '<span class="li__body"><span class="li__ttl">' + esc(l.title) + '</span><span class="li__sub">' + sub + '</span></span>';
    if (ls === 'locked') return '<div class="li has-ico cr-ls is-locked">' + inner + '</div>';
    return '<a class="li has-ico cr-ls is-' + ls + '" href="' + lessonHref(c, l) + '">' + inner + U.chevron() + '</a>';
  }

  /** この講座の修了が条件になっている案件。報酬は必ず「目安」と書く */
  function gigsFor(c) {
    var gs = DATA.GIGS.filter(function (g) { return g.requires === c.id; });
    if (!gs.length) return '';
    return '<section class="sec">' +
      '<h2 class="sec-ttl">修了すると応募できる案件</h2>' +
      '<div class="list">' + gs.map(function (g) {
        var mine = R.gigState(g.id), lock = R.gigLock(g);
        var tag = mine ? '<span class="tag tag-indigo">' + esc(mine.label) + '</span>'
          : !lock.locked ? '<span class="tag tag-ok">応募できます</span>'
          : !lock.course ? '<span class="tag">Lv' + g.level + 'から</span>' : '';
        return '<a class="li cr-gig" href="#/gigs/' + esc(g.id) + '">' +
          '<span class="li__body"><span class="li__ttl">' + esc(g.title) + '</span>' +
          '<span class="li__sub">報酬の目安 ' + esc(g.reward) + '・' + esc(g.time) + '</span></span>' +
          '<span class="li__end">' + tag + U.chevron() + '</span></a>';
      }).join('') + '</div>' +
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
        '<h2 class="sec-ttl">これからのライブ</h2>' +
        '<div class="list">' + live.map(function (e) {
          return '<a class="li" href="#/events/' + esc(e.id) + '">' +
            '<span class="li__body"><span class="li__ttl">' + esc(e.title) + '</span>' +
            '<span class="li__sub">' + U.fmtDate(e.at, { noYear: true, time: true }) + '・' + esc(e.place) + '</span></span>' +
            '<span class="li__end">' + (R.isReserved(e.id) ? '<span class="tag tag-indigo">予約済み</span>' : '') + U.chevron() + '</span></a>';
        }).join('') + '</div>' +
      '</section>' : '') +
      '<section class="sec">' +
        '<h2 class="sec-ttl"><span>録画</span><span class="cr-ttlnote num">視聴 ' + seenN + '/' + DATA.ARCHIVE.length + '本</span></h2>' +
        chips +
        '<div class="list cr-alist">' + (list.length ? list.map(function (a) {
          var t = R.person(a.teacher), s = !!seen[a.id];
          return '<button type="button" class="li cr-arow' + (s ? ' is-seen' : '') + '" data-cr-arc="' + esc(a.id) + '">' +
            '<span class="li__body"><span class="li__ttl">' + esc(a.title) + '</span>' +
            '<span class="li__sub">' + U.fmtDate(a.date, { noYear: true }) + '・' + a.min + '分・' + esc(t.name) +
              (s ? '<span class="cr-seen">・視聴済み</span>' : '') + '</span></span>' +
            U.chevron() +
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
        player({ key: 'arc-' + a.id, min: a.min, ended: !!seenAt }) +
        '<h3 class="modal__ttl">' + esc(a.title) + '</h3>' +
        '<p class="sub">' + U.fmtDate(a.date, { noYear: true }) + '・' + a.min + '分・' + esc(t.name) + '</p>' +
        (seenAt ? '<p class="cr-seen cr-amodal__seen">' + onDay(seenAt) + '視聴しました</p>' : '') +
        '<div class="modal__foot"><button type="button" class="btn btn-soft" data-close>閉じる</button>' +
          (seenAt ? '' : '<button type="button" class="btn btn-primary" data-cr-seen>見終わった（+' + DATA.XP.archive + ' XP）</button>') +
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
      return c0
        ? notFound('この回は見つかりませんでした。', [['講座', '#/courses'], [c0.title, '#/courses/' + c0.id], ['見つかりません']], ['講座の目次へ', '#/courses/' + c0.id])
        : notFound('この回は見つかりませんでした。', [['講座', '#/courses'], ['見つかりません']]);
    }
    var c = f.c, l = f.l, i = f.i, n = i + 1;
    var ls = R.lessonState(c, l.id), st = R.courseState(c), t = R.person(c.teacher);
    return crumb([['講座', '#/courses'], [c.title, '#/courses/' + c.id], ['第' + n + '回']]) +
      '<div class="cr-lesson">' +
        '<div class="cr-lesson__main">' +
          player({ key: l.id, min: l.min, ended: ls === 'done' || !!played[l.id], locked: ls === 'locked', poster: facPhoto(c, 'cr-player__poster') }) +
          '<div class="cr-lesson__head">' +
            '<div class="cr-lesson__hbody">' +
              '<h1 class="cr-lesson__ttl">' + esc(l.title) + '</h1>' +
              '<p class="cr-lesson__meta">第' + n + '回（全' + c.lessons.length + '回）・' + l.min + '分・講師 ' + esc(t.name) + '</p>' +
              doneLine(l, ls) +
            '</div>' +
            headButton(c, l, i, ls) +
          '</div>' +
          lockNotice(c, ls, st) +
          (ls === 'locked' ? '' : memo(l)) +
        '</div>' +
        '<aside class="cr-lesson__side" aria-label="この講座の目次">' + toc(c, i, st) + '</aside>' +
      '</div>';
  }

  function doneLine(l, ls) {
    if (ls !== 'done') return '';
    var at = doneMap()[l.id];
    return '<p class="cr-lesson__done">' + (at ? onDay(at) : '') + '見終わりました</p>';
  }

  /** 題の右のボタン。まだの回は「見終わった」、見た回は「次の回へ」 */
  function headButton(c, l, i, ls) {
    if (ls === 'locked') return '';
    if (ls === 'done') {
      var next = c.lessons[i + 1];
      return next
        ? '<a class="btn btn-primary cr-lesson__btn" href="' + lessonHref(c, next) + '">次の回へ' + icon('arrow', 'ico-s') + '</a>'
        : '<a class="btn btn-soft cr-lesson__btn" href="' + courseHref(c) + '">講座の目次へ</a>';
    }
    // 再生し終えるまでは灰色。押すと理由を知らせる（スマホでは title が見えないため）
    var ready = !!played[l.id];
    return '<button type="button" class="btn ' + (ready ? 'btn-primary' : 'btn-soft') + ' cr-lesson__btn" data-cr-complete' + (ready ? '' : ' aria-disabled="true"') + '>見終わった（+' + DATA.XP.lesson + ' XP）</button>';
  }

  function lockNotice(c, ls, st) {
    if (ls !== 'locked') return '';
    if (st.locked) {
      return '<div class="notice cr-lock"><div>' + levelNeed(c) +
        '<div class="cr-lock__btns">' + catchUpBtn() +
        '<button type="button" class="btn btn-soft" data-cr-level>レベルのしくみ</button></div></div></div>';
    }
    var nx = st.next, k = nx ? lessonIndex(c, nx.id) + 1 : 1;
    return '<div class="notice cr-lock"><div>' +
      (nx ? '第' + k + '回「' + esc(nx.title) + '」を見終わると開きます。' : '前の回を見終わると開きます。') +
      '<div class="cr-lock__btns">' +
        (nx ? '<a class="btn btn-primary" href="' + lessonHref(c, nx) + '">第' + k + '回を見る</a>' : '<a class="btn btn-primary" href="' + courseHref(c) + '">講座の目次へ</a>') +
      '</div></div></div>';
  }

  function memo(l) {
    var text = readNotes()[l.id] || '';
    return '<section class="sec cr-memo">' +
      '<h2 class="sec-ttl"><label for="crMemo">メモ</label><span class="cr-saved" data-cr-saved aria-live="polite"></span></h2>' +
      '<textarea id="crMemo" class="textarea" rows="4" data-cr-memo placeholder="この回のメモ">' + esc(text) + '</textarea>' +
    '</section>';
  }

  function toc(c, cur, st) {
    return '<h2 class="sec-ttl"><span>目次</span>' + (st.locked ? '' : '<span class="cr-ttlnote num">' + st.done + '/' + st.total + '本</span>') + '</h2>' +
      '<div class="list cr-toc">' +
        '<a class="li cr-toc__head" href="' + courseHref(c) + '"><span class="li__body"><span class="li__ttl">' + esc(c.title) + '</span></span>' + U.chevron() + '</a>' +
        c.lessons.map(function (l, i) {
          var ls = R.lessonState(c, l.id), isCur = i === cur;
          var inner = '<span class="li__ico">' + stateIcon(ls) + '</span>' +
            '<span class="li__body"><span class="li__ttl">' + (i + 1) + '. ' + esc(l.title) + '</span><span class="li__sub">' + l.min + '分</span></span>';
          // いま見ている回は押しても同じ画面なので、リンクにしない
          if (isCur) return '<div class="li has-ico cr-ls is-' + ls + ' is-current" aria-current="page">' + inner + '</div>';
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
      var btn = el.querySelector('[data-cr-complete]');

      bindPlayer(el.querySelector('[data-cr-player]'), function () {
        played[f.l.id] = true;
        if (btn && btn.getAttribute('aria-disabled') === 'true' && btn.isConnected !== false) {
          btn.removeAttribute('aria-disabled');
          btn.classList.remove('btn-soft');
          btn.classList.add('btn-primary');
        }
      });

      if (btn) btn.addEventListener('click', function () {
        if (btn.getAttribute('aria-disabled') === 'true') { U.toast('最後まで再生すると押せます'); return; }
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
          saved.textContent = ok ? '保存しました' : '保存できませんでした';
          saved.classList.add('is-on');
          off = setTimeout(function () { saved.classList.remove('is-on'); }, 2000);
        }, 500);
      });
    }
  };
})();
