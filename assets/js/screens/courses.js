/* ============================================================
   講座（一覧・講座の目次・1回の再生画面・勉強会の録画・確認テスト・修了証）
     #/courses                        一覧（レベルごと）
     #/courses?tab=archive            勉強会の録画の一覧
     #/courses/<講座>                 講座の目次（学べること・講師・目次・確認テスト）
     #/courses/<講座>?focus=quiz      確認テストの場所へ
     #/courses/<講座>/certificate     修了証（印刷・画像で保存）
     #/courses/archive/<録画>         勉強会の録画1本
     #/lesson/<講座>/<回>             1回の再生画面
   開く・開かないの判定は domain.js（R.courseState / R.lessonState / R.quiz / R.certificate）。
   中身は data.js のまま読む：回の説明・要点・資料（l.desc / points / material）、確認テストの戻る回（R.submitQuiz の results[].lesson）、
   録画に近い講座（a.course）。運営が直した中身（CMS）は store.js が DATA に重ねてあるので、DATA には会員に見えるものだけが入る。
   運営が隠した・下書きの・消した講座／回／録画へのリンクで来たときは「いま公開していません」を出す（R.cmsItem で見分ける）。
   ほかの講座へ移した回は、移った先を案内する。
   動画は入っていない。再生は「時間だけが進む」試作（1倍速で REAL_SEC 秒で1回ぶん）。
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon;

  /* 画面の中だけの状態（会員が替わったら捨てる。前の人の続きやテストの答えを見せないため） */
  var owner = null;
  var fac = 'all';        // 学部の絞り込み
  var genre = 'all';      // 録画の絞り込み（学部の id か 'showcase'）
  var played = {};        // この表示中に最後まで再生した回・録画（描き直しても「見終わった」を押せるままにする）
  var quizRes = {};       // 答え合わせの結果（講座id → R.submitQuiz の戻り値）
  var retake = {};        // 合格したあとに、もう一度受けているところ
  var live = {};          // 再生の位置（描き直しても同じ場所から）
  var rate = 1;           // 再生の速さ（講座をまたいで同じにする）
  var cur = null;         // mount で受け取った ctx
  var focusDone = null;   // ?focus=quiz で動かし済みの場所

  var REAL_SEC = 12;      // 試作版：1倍速で1回ぶんを流しきる秒数
  var RATES = [1, 1.25, 1.5, 2];
  var NEW_DAYS = 7;       // 「新着」を付ける日数
  var DAY = 86400000;

  var SVG_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8.4 5.7v12.6c0 .7.8 1.1 1.4.7l9.9-6.3a.8.8 0 0 0 0-1.4L9.8 5c-.6-.4-1.4 0-1.4.7z"/></svg>';
  var SVG_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="6.5" y="5" width="3.8" height="14" rx="1" fill="currentColor"/><rect x="13.7" y="5" width="3.8" height="14" rx="1" fill="currentColor"/></svg>';
  var SVG_BACK10 = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M4.6 9.2A8 8 0 1 1 4 12.9"/><path d="M4.2 4.8v4.6h4.6"/><text x="12.4" y="15.6" fill="currentColor" stroke="none" font-size="7.4" font-weight="700" text-anchor="middle" font-family="-apple-system,Helvetica,Arial,sans-serif">10</text></svg>';
  var SVG_FULL = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 9V4.5H9M15 4.5h4.5V9M19.5 15v4.5H15M9 19.5H4.5V15"/></svg>';

  /** 会員が替わったら、画面の中の状態を捨てる。別の画面から来たら、再生の位置は残したまま「前回の続き」を出し直す */
  var lastView = null;
  function own(ctx) {
    var id = R.me().id, view = ctx ? ctx.name + '/' + ctx.key : null;
    if (owner !== id) {
      owner = id; fac = 'all'; genre = 'all'; played = {}; quizRes = {}; retake = {}; live = {};
      stopRun(true);
    }
    if (view && view !== lastView) {
      lastView = view;
      Object.keys(live).forEach(function (k) { if (!(run.timer && run.key === k)) live[k].touched = false; });
    }
  }

  /* ---------- 小さな道具 ---------- */
  function byId(list, id) { for (var i = 0; list && i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function levelOf(lv) {
    for (var i = 0; i < DATA.LEVELS.length; i++) if (DATA.LEVELS[i].lv === lv) return DATA.LEVELS[i];
    return DATA.LEVELS[0];
  }
  function facName(id) { var f = byId(DATA.FACULTIES, id); return f ? f.name : ''; }
  function enc(s) { return encodeURIComponent(String(s)); }
  /** 日本語の文（esc 済み）。「第3回」「全4回」「月2回」は U.jp が数の前の1文字ごと守る */
  function jp(s) { return U.jp(s); }
  function courseHref(c) { return '#/courses/' + enc(c.id); }
  function lessonHref(c, l) { return '#/lesson/' + enc(c.id) + '/' + enc(l.id); }
  function archiveHref(a) { return '#/courses/archive/' + enc(a.id); }
  function certHref(c) { return '#/courses/' + enc(c.id) + '/certificate'; }
  /** 運営への質問（messages の画面が種類とどの回かを入れて開く） */
  function askHref(ref) { return '#/messages?kind=' + enc('講座の質問') + '&ref=' + enc(ref); }
  function lessonIndex(c, id) { for (var i = 0; i < c.lessons.length; i++) if (c.lessons[i].id === id) return i; return -1; }
  function totalLessons() { return DATA.COURSES.reduce(function (a, c) { return a + c.lessons.length; }, 0); }
  function needXp(lv) { return Math.max(0, levelOf(lv).min - R.xp()); }
  /** 残りXPを、見る動画（講座の回）の本数に直す。「講座2本」と書くと講座まるごと2本に読めるので「動画2本」と書く */
  function lessonsFor(need) { return Math.max(1, Math.ceil(need / DATA.XP.lesson)); }
  function needText(need) { return '<span class="nw">（動画' + lessonsFor(need) + '本）</span>'; }
  function clock(sec) {
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60;
    return (h ? h + ':' + U.pad(m) : m) + ':' + U.pad(s);
  }
  /** 読み上げ用の位置「3分34秒（全9分）」 */
  function spoken(pos, sec) {
    pos = Math.floor(pos);
    var m = Math.floor(pos / 60), s = pos % 60;
    return (m ? m + '分' : '') + s + '秒（全' + Math.round(sec / 60) + '分）';
  }
  /** 見終えた日。「9月4日(金)に」、今日なら「今日」（後ろに動詞をつなげる） */
  function onDay(iso) { return isToday(iso) ? '今日' : detailDate(iso) + 'に'; }
  function isToday(iso) { return new Date(iso).toDateString() === CLG.now().toDateString(); }
  /** 詳細の日付。今年なら年を省く（年をまたいだ録画・記録は年まで出す） */
  function detailDate(iso) {
    return U.fmtDate(iso, { noYear: new Date(iso).getFullYear() === CLG.now().getFullYear() });
  }
  function doneMap() { return CLG.store.state.done || {}; }
  function seenMap() { return CLG.store.state.archiveSeen || {}; }
  function isNew(at) {
    if (!at) return false;
    var d = CLG.now() - new Date(at);
    return d >= 0 && d < NEW_DAYS * DAY;
  }
  /** まだ見ていない新しい回がある講座 */
  function hasNew(c) { var d = doneMap(); return c.lessons.some(function (l) { return isNew(l.newAt) && !d[l.id]; }); }

  function img(src, alt, cls) {
    if (!src) return '';
    return '<img' + (cls ? ' class="' + cls + '"' : '') + ' src="' + esc(src) + '" alt="' + esc(alt || '') + '" width="960" height="540" loading="lazy" decoding="async">';
  }
  /** 講座の写真（写っている人は会員ではないので、alt は data.js の場面の文）。リンクの中（題名が隣にある）では alt を空にする */
  function coursePhoto(c, cls, deco) {
    var f = byId(DATA.FACULTIES, c.faculty);
    var src = c.img || (f && f.img), alt = c.img ? c.alt : f && f.alt;
    return img(src, deco ? '' : alt, cls);
  }
  /** 16:9の枠に入れた写真。枠は並びの最後に置いて CSS で左に出す（読み上げは題名から始まるように） */
  function photoBox(c, cls, deco) {
    var h = coursePhoto(c, '', deco);
    return h ? '<span class="' + cls + '">' + h + '</span>' : '';
  }
  /** 録画の写真（行の小さな写真・再生画面の下敷き。どちらも題名が隣にあるので alt は空）：
      関係する講座の写真 → 学部の写真 → 成果発表会は会の写真 */
  function archiveSrc(a) {
    var rc = relatedCourse(a), f = byId(DATA.FACULTIES, a.faculty);
    return (rc && rc.img) || (f && f.img) || (DATA.EVENT_IMG || {})[a.faculty] || '';
  }
  /** 録画に近い講座（data.js の a.course。運営が隠した講座なら出さない） */
  function relatedCourse(a) { return a.course ? R.course(a.course) : null; }

  /* ---------- 運営が直した中身（CMS）で、いま見せていないもの ----------
     DATA には会員に見えるものだけが入っている。見つからないときだけ、運営の記録にあるか（非公開・下書き・予約公開の前・削除）を聞く */
  function cmsKnown(kind, id) {
    if (!id || typeof R.cmsItem !== 'function') return null;
    try { return R.cmsItem(kind, id); } catch (e) { return null; }
  }
  /** 回がいま入っている講座（ほかの講座へ移した回のため） */
  function lessonHome(id) {
    for (var k = 0; k < DATA.COURSES.length; k++) {
      var i = lessonIndex(DATA.COURSES[k], id);
      if (i >= 0) return { c: DATA.COURSES[k], l: DATA.COURSES[k].lessons[i], i: i };
    }
    return null;
  }
  /** 講座・録画の URL の行き先。{ view: 'detail'|'cert'|'archive'|'off'|'nf', c?, a?, off? } */
  function resolve(p) {
    if (p[0] === 'archive' && p[1]) {
      var a = byId(DATA.ARCHIVE, p[1]);
      if (p[2]) return { view: 'nf' };
      if (a) return { view: 'archive', a: a };
      return cmsKnown('archive', p[1]) ? { view: 'off', off: OFF.archive } : { view: 'nf' };
    }
    if (!p[0] || p[0] === 'archive') return { view: 'list' };
    if ((p[1] && p[1] !== 'certificate') || p[2]) return { view: 'nf' };
    var c = R.course(p[0]);
    if (c) return { view: p[1] ? 'cert' : 'detail', c: c };
    return cmsKnown('course', p[0]) ? { view: 'off', off: OFF.course } : { view: 'nf' };
  }
  /** 回の URL の行き先。{ view: 'lesson'|'moved'|'off'|'nf', c, l, i, off? } */
  function resolveLesson(p) {
    if (p.length > 2 || !p[1]) return { view: 'nf' };
    var c = R.course(p[0]), i = c ? lessonIndex(c, p[1]) : -1;
    if (i >= 0) return { view: 'lesson', c: c, l: c.lessons[i], i: i };
    var knownCourse = c || cmsKnown('course', p[0]);
    if (!knownCourse) return { view: 'nf' };                   // 講座の id がちがう
    var h = lessonHome(p[1]);
    if (h) return { view: 'moved', c: h.c, l: h.l, i: h.i };
    var kl = cmsKnown('lesson', p[1]);
    if (c && kl && kl.course === c.id) return { view: 'off', c: c, off: OFF.lesson };
    if (!c) return { view: 'off', off: OFF.course };
    return { view: 'nf' };
  }
  var OFF = {
    course: { title: 'この講座はいま公開していません', lead: '講座の一覧から選び直してください。', href: '#/courses', label: '講座の一覧を見る' },
    lesson: { title: 'この回はいま公開していません', lead: '講座の目次から選び直してください。', label: '目次を見る' },
    archive: { title: 'この録画はいま公開していません', lead: '録画の一覧から選び直してください。', href: '#/courses?tab=archive', label: '録画の一覧を見る' }
  };
  /** 「いま公開していません」の画面（道しるべ・見出し・戻る先のボタン1つ） */
  function offView(off, trail, href) {
    return trail +
      '<div class="page-head"><h1 class="page-ttl" data-page-title tabindex="-1">' + esc(off.title) + '</h1>' +
        '<p class="page-lead">' + esc(off.lead) + '</p></div>' +
      '<p><a class="btn btn-ink" href="' + esc(href || off.href) + '">' + esc(off.label) + '</a></p>';
  }
  /** ほかの講座へ移した回：移った先を案内する */
  function movedView(f) {
    var n = f.i + 1;
    return crumb([['講座', '#/courses'], [f.c.title, courseHref(f.c)], ['第' + n + '回']]) +
      '<div class="page-head"><h1 class="page-ttl" data-page-title tabindex="-1">この回は講座「' + jp(f.c.title) + '」に移りました</h1>' +
        '<p class="page-lead">いまは<span class="nw">第' + n + '回</span>「' + jp(f.l.title) + '」です。</p></div>' +
      '<p><a class="btn btn-ink" href="' + lessonHref(f.c, f.l) + '">第' + n + '回を見る</a></p>';
  }

  /** 道しるべ。items: [[表示, リンク先（なければ今いる場所）], …] */
  function crumb(items) {
    return '<nav class="crumb" aria-label="現在地">' + items.map(function (it, i) {
      return (i ? U.chevron() : '') +
        (it[1] ? '<a href="' + esc(it[1]) + '">' + esc(it[0]) + '</a>' : '<span aria-current="page">' + esc(it[0]) + '</span>');
    }).join('') + '</nav>';
  }
  function stateIcon(ls) { return ls === 'done' ? icon('checkc') : ls === 'open' ? icon('play') : icon('lock'); }

  /* ============================================================
     再生の枠（講座の回・録画で共通）
     画面（16:9。写真を暗くして敷く）＋その下に操作の帯（位置・再生・10秒戻る・速さ・字幕・全画面）
     ============================================================ */
  function vt(pos, sec) { return spoken(pos, sec); }
  /** o: { key, sec, poster, locked, pos, resume }  resume：「前回の続き 4:12 から」を出すか */
  function player(o) {
    var poster = o.poster || '';
    if (o.locked) {
      return '<div class="cr-player is-locked">' +
        '<div class="cr-player__screen' + (poster ? ' has-poster' : '') + '">' + poster +
          '<div class="cr-player__lock">' + icon('lock') + '<span>まだ見られません</span></div>' +
        '</div></div>';
    }
    var sec = Math.max(60, Math.round(o.sec)), st = live[o.key];
    var pos = st ? st.pos : Math.min(sec, o.pos || 0), ended = pos >= sec;
    // 「前回の続き」は、この表示でまだ再生も位置の移動もしていないときだけ（描き直しても出し直さない）
    var touched = !!(st && st.touched);
    var resume = o.resume && pos > 0 && !ended && !touched ? '前回の続き ' + clock(pos) + ' から' : '';
    var k = esc(o.key), pct = Math.round(pos / sec * 1000) / 10;
    return '<div class="cr-player' + (ended ? ' is-ended' : '') + (touched ? ' is-started' : '') + '" role="group" aria-label="動画" data-cr-player="' + k + '" data-sec="' + sec + '" data-pos="' + Math.floor(pos) + '">' +
      '<div class="cr-player__screen' + (poster ? ' has-poster' : '') + '">' + poster +
        // 画面を押しても再生できる（マウス・指のため）。キーボードは下の帯のボタンを使う
        '<div class="cr-player__big" data-cr-big aria-hidden="true"><span class="cr-player__bigbtn">' + SVG_PLAY + '</span>' +
          (resume ? '<span class="cr-player__resume">' + esc(resume) + '</span>' : '') + '</div>' +
      '</div>' +
      '<div class="cr-ctrl">' +
        '<input type="range" class="cr-seek" data-cr-seek="' + k + '" min="0" max="' + sec + '" step="1" value="' + Math.floor(pos) + '"' +
          ' aria-label="再生位置" aria-valuetext="' + esc(vt(pos, sec)) + '" style="--p:' + pct + '%">' +
        '<div class="cr-ctrl__row">' +
          '<button type="button" class="cr-ctrl__btn" data-cr-toggle="' + k + '" aria-label="' +
            esc(ended ? 'もう一度再生する' : resume ? '再生する（' + resume + '）' : '再生する') + '">' + SVG_PLAY + '</button>' +
          '<button type="button" class="cr-ctrl__btn" data-cr-back10="' + k + '" aria-label="10秒戻る">' + SVG_BACK10 + '</button>' +
          '<span class="cr-ctrl__time num" aria-hidden="true"><span data-cr-time>' + clock(pos) + '</span><span class="cr-ctrl__total"> / ' + clock(sec) + '</span></span>' +
          '<span class="cr-ctrl__sp"></span>' +
          '<button type="button" class="cr-ctrl__btn cr-ctrl__txt" data-cr-rate="' + k + '" aria-label="再生速度 ' + rate + '倍">' + rate + 'x</button>' +
          '<button type="button" class="cr-ctrl__btn cr-ctrl__txt" data-cr-cc="' + k + '" aria-label="字幕">字幕</button>' +
          '<button type="button" class="cr-ctrl__btn" data-cr-full="' + k + '" aria-label="全画面">' + SVG_FULL + '</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /* 再生中のものは1つだけ。描き直しで枠が作り直されても、同じ key なら続けて流す */
  var run = { key: null, el: null, sec: 0, timer: null, o: null };
  function stopRun(silent) {
    if (!run.timer) return;
    clearInterval(run.timer); run.timer = null;
    var st = live[run.key];
    if (!silent && run.el && run.el.isConnected) setPlaying(run.el, false);
    if (run.o && run.o.save && st) run.o.save(st.pos, run.sec);
  }
  function setPlaying(el, on) {
    el.classList.toggle('is-playing', on);
    if (on) el.classList.add('is-started');
    var t = el.querySelector('[data-cr-toggle]');
    if (t) { t.setAttribute('aria-label', on ? '一時停止' : '再生する'); t.innerHTML = on ? SVG_PAUSE : SVG_PLAY; }
  }
  function paint(el, pos, sec) {
    var s = el.querySelector('[data-cr-seek]'), t = el.querySelector('[data-cr-time]');
    if (s) {
      s.value = Math.floor(pos);
      s.style.setProperty('--p', (Math.round(pos / sec * 1000) / 10) + '%');
      s.setAttribute('aria-valuetext', vt(pos, sec));
    }
    if (t) t.textContent = clock(pos);
    if (run.o && run.o.onTick && run.el === el) run.o.onTick(pos, sec);
  }

  /** 枠に動きを付ける。o: { onTick(pos, sec), onEnd(), save(pos, sec) } */
  function bindPlayer(el, o) {
    if (!el) return null;
    var key = el.getAttribute('data-cr-player'), sec = +el.getAttribute('data-sec') || 60;
    var st = live[key] || (live[key] = { pos: +el.getAttribute('data-pos') || 0 });
    var keep = run.timer && run.key === key;       // 描き直し：同じものを流し続ける
    if (run.timer && !keep) stopRun();
    run.key = key; run.el = el; run.sec = sec; run.o = o || {};

    function play() {
      if (run.timer && run.el === el) return;
      if (st.pos >= sec - 0.5) st.pos = 0;
      st.touched = true;
      el.classList.remove('is-ended');
      setPlaying(el, true);
      var t0 = Date.now(), lastSave = t0;
      run.timer = setInterval(function () {
        // 別の画面へ移った：止めて、位置だけ残す
        if (!run.el || !run.el.isConnected) { stopRun(true); return; }
        var now = Date.now();
        st.pos = Math.min(sec, st.pos + (now - t0) / 1000 * sec / REAL_SEC * rate);
        t0 = now;
        paint(run.el, st.pos, sec);
        if (run.o.save && now - lastSave > 3000) { lastSave = now; run.o.save(st.pos, sec); }
        if (st.pos >= sec) end();
      }, 100);
    }
    function pause() { stopRun(); }
    function end() {
      if (run.timer) { clearInterval(run.timer); run.timer = null; }
      st.pos = sec;
      var e = run.el || el;
      setPlaying(e, false);
      e.classList.add('is-ended', 'is-started');
      var t = e.querySelector('[data-cr-toggle]');
      if (t) t.setAttribute('aria-label', 'もう一度再生する');
      paint(e, sec, sec);
      if (run.o.save) run.o.save(0, sec);
      CLG.app.announce('再生が終わりました');
      if (run.o.onEnd) run.o.onEnd();
    }
    function seekTo(s, keepPlaying) {
      st.pos = Math.max(0, Math.min(sec, s));
      el.classList.remove('is-ended');
      el.classList.add('is-started'); st.touched = true;   // 動かしたら「前回の続き」の札は消す（位置が変わったため）
      paint(el, st.pos, sec);
      if (st.pos >= sec) { end(); return; }
      if (run.o.save && !run.timer) run.o.save(st.pos, sec);
      if (keepPlaying) play();
    }
    function toggle() { if (run.timer && run.el === el) pause(); else play(); }

    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-cr-big],[data-cr-toggle],[data-cr-back10],[data-cr-rate],[data-cr-cc],[data-cr-full]');
      if (!b) return;
      if (b.hasAttribute('data-cr-big') || b.hasAttribute('data-cr-toggle')) { toggle(); return; }
      if (b.hasAttribute('data-cr-back10')) { seekTo(st.pos - 10, !!run.timer); return; }
      if (b.hasAttribute('data-cr-rate')) {
        rate = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
        b.textContent = rate + 'x';
        b.setAttribute('aria-label', '再生速度 ' + rate + '倍');
        return;
      }
      if (b.hasAttribute('data-cr-cc')) { U.toast('本番では字幕を表示します'); return; }
      if (b.hasAttribute('data-cr-full')) {
        var d = document;
        if (d.fullscreenElement === el) { d.exitFullscreen(); return; }
        if (el.requestFullscreen) { el.requestFullscreen().catch(function () { U.toast('この端末では全画面にできませんでした'); }); }
        else U.toast('この端末では全画面にできませんでした');
      }
    });
    var seek = el.querySelector('[data-cr-seek]');
    if (seek) {
      seek.addEventListener('input', function () { seekTo(+seek.value, false); });
      // 矢印は5秒ずつ（1秒ずつだと動いた感じがしないため）。Home・End・PageUp/Down は標準のまま
      seek.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 5 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -5 : 0;
        if (!d) return;
        e.preventDefault();
        seekTo(st.pos + d, !!run.timer);
      });
    }

    paint(el, st.pos, sec);
    if (keep) setPlaying(el, true);
    return { play: play, pause: pause, seekTo: seekTo, el: el };
  }
  var ctl = null;     // いまの画面の再生の枠

  /* ============================================================
     一覧
     ============================================================ */
  function head(arc) {
    var lv = R.level();
    var lead = arc
      ? '録画はレベルに関係なく全部見られます。'
      : '講座は' + DATA.COURSES.length + '本、動画は' + totalLessons() + '本です。レベルが上がると順に開きます。';
    return '<div class="page-head"><div class="page-head__row">' +
        '<div><h1 class="page-ttl" data-page-title tabindex="-1">講座</h1><p class="page-lead">' + esc(lead) + '</p></div>' +
        '<button type="button" class="cr-lvline" data-cr-level aria-haspopup="dialog">' + U.lvBadge(lv.lv, lv.name) +
          '<span class="cr-lvline__to">' + (lv.next ? 'あと<b class="num">' + U.num(lv.toNext) + '</b>XP' : '最高レベル') + '</span>' +
          '<span class="sr-only">レベルのしくみ</span>' + U.chevron() + '</button>' +
      '</div></div>' +
      '<nav class="seg cr-seg" aria-label="講座と録画の切り替え">' +
        '<a href="#/courses"' + (arc ? '' : ' class="is-on" aria-current="page"') + '>講座</a>' +
        '<a href="#/courses?tab=archive"' + (arc ? ' class="is-on" aria-current="page"' : '') + '>勉強会の録画</a>' +
      '</nav>';
  }

  function listView() {
    var lv = R.level();
    if (fac !== 'all' && !byId(facList(), fac)) fac = 'all';
    return resumeBlock(lv) +
      '<section class="sec cr-all" aria-labelledby="crAllTtl">' +
        '<h2 class="sec-ttl" id="crAllTtl">講座の一覧</h2>' +
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
      return '<section class="sec"><div class="notice notice-ok cr-alldone">' + icon('checkc') +
        (lv.next
          ? '<div>開いている講座は全部見終わりました。勉強会の録画でもXPがたまります。' +
            '<a class="cr-inlink" href="#/courses?tab=archive">録画を見る</a></div>'
          : '<div>全講座を修了しました。</div>') +
        '</div></section>';
    }
    return '<section class="sec cr-resume" aria-labelledby="crResumeTtl">' +
      '<h2 class="sec-ttl" id="crResumeTtl">' + ttl + '</h2>' +
      '<div class="list">' + rows.map(function (x) {
        return U.resumeCard(x.c, x.st.next, { variant: 'row', st: x.st, resumeText: R.resumeText(x.st.next.id) });
      }).join('') + '</div>' +
    '</section>';
  }

  /** 講座がある学部だけ（運営が学部の講座を全部隠したら、その札は出さない） */
  function facList() {
    return DATA.FACULTIES.map(function (f) {
      return { id: f.id, name: f.name, n: DATA.COURSES.filter(function (c) { return c.faculty === f.id; }).length };
    }).filter(function (f) { return f.n > 0; });
  }
  function facChips() {
    var all = [{ id: 'all', name: 'すべて', n: DATA.COURSES.length }].concat(facList());
    return '<div class="chips cr-chips" role="group" aria-label="学部で絞り込む">' + all.map(function (f) {
      var on = f.id === fac;
      return '<button type="button" class="chip' + (on ? ' is-on' : '') + '" aria-pressed="' + on + '" data-cr-fac="' + esc(f.id) + '">' +
        esc(f.name) + '<span class="n num">' + f.n + '</span></button>';
    }).join('') + '</div>';
  }

  /** レベルごとのまとまり。開いていないレベルも同じカードの並びで出す（鍵の印と「Lv4で開きます」） */
  function levelSection(L, lv) {
    var list = DATA.COURSES.filter(function (c) { return c.level === L.lv && (fac === 'all' || c.faculty === fac); });
    if (!list.length) return '';
    var locked = L.lv > lv.lv, need = Math.max(0, L.min - lv.xp);
    var hid = 'crLv' + L.lv;
    return '<section class="cr-lvsec' + (locked ? ' is-locked' : '') + '" aria-labelledby="' + hid + '">' +
      '<div class="cr-lvhead">' +
        '<h3 class="cr-lvhead__ttl" id="' + hid + '">Lv' + L.lv + ' ' + esc(L.name) + '<span class="cr-lvhead__n">' + list.length + '本</span></h3>' +
        (locked ? '<p class="cr-lvhead__need"><span class="nw">あと' + U.num(need) + 'XP</span>' + (L.lv === lv.lv + 1 ? needText(need) : '') + 'で開きます</p>' : '') +
      '</div>' +
      '<div class="cr-grid">' + list.map(courseCard).join('') + '</div>' +
    '</section>';
  }

  function courseCard(c) {
    var st = R.courseState(c), t = R.person(c.teacher), locked = st.locked;
    var tag = st.completed ? U.statusTag('done', '修了') : !locked && hasNew(c) ? U.statusTag('new') : '';
    // 講師の名前は途中で割らない（「青木 はる／と」にならないように）。
    // 開くレベルはまとまりの見出し（「Lv4 実践・あと30XPで開きます」）にあるので、カードには書かない（読み上げだけ）
    var meta = jp('全' + st.total + '回・' + st.minutes + '分・') + '<span class="nw">' + esc(t.name) + '</span>';
    var photo = photoBox(c, 'cr-card__img', true);
    return '<a class="card card-link cr-card' + (photo ? ' has-img' : '') + (locked ? ' is-locked' : '') + '" href="' + courseHref(c) + '">' +
      '<span class="cr-card__body">' +
        '<span class="cr-card__ttl">' + (locked ? icon('lock', 'ico-s cr-card__lock') : '') + jp(c.title) +
          (locked ? '<span class="sr-only">（Lv' + c.level + 'で開きます）</span>' : '') + '</span>' +
        '<span class="cr-card__meta">' + meta + '</span>' +
        (st.started && !st.completed && !locked
          ? '<span class="cr-prog">' + U.progressBar(st.pct, 'ink', { decorative: true }) + '<span class="num">' + st.done + '/' + st.total + '回</span></span>' : '') +
        // 札は本文の中に置く（広いときは右の列、スマホでは題名の下。320px で題名の幅を取らないように）
        (tag ? '<span class="cr-card__tag">' + tag + '</span>' : '') +
      '</span>' +
      // 開いていない講座も目次（学べること・開き方）へのリンクなので、同じく山かっこを付ける
      U.chevron() + photo +
    '</a>';
  }

  /* ============================================================
     講座の目次
     ============================================================ */
  function detailView(c, ctx) {
    var st = R.courseState(c);
    var photo = photoBox(c, 'cr-dhead__img', false);
    return crumb([['講座', '#/courses'], [c.title]]) +
      '<div class="page-head cr-dhead' + (photo ? ' has-img' : '') + (st.locked ? ' is-locked' : '') + '">' +
        '<div class="cr-dhead__body">' +
          '<h1 class="page-ttl" data-page-title tabindex="-1">' + jp(c.title) + '</h1>' +
          (c.summary ? '<p class="page-lead">' + jp(c.summary) + '</p>' : '') +
          '<p class="cr-meta">' + esc(facName(c.faculty)) + '・全' + st.total + '回・' + st.minutes + '分</p>' +
          startArea(c, st) +
        '</div>' +
        photo +
      '</div>' +
      infoBlock(c) +
      '<section class="sec cr-tocsec" aria-labelledby="crTocTtl">' +
        '<h2 class="sec-ttl"><span id="crTocTtl">目次</span>' + (st.locked ? '' : '<span class="cr-ttlnote num">' + st.done + '/' + st.total + '回</span>') + '</h2>' +
        '<div class="list cr-lslist">' + c.lessons.map(function (l, i) { return lessonRow(c, l, i); }).join('') + '</div>' +
      '</section>' +
      quizSection(c, st) +
      gigsFor(c);
  }

  /** レベルが足りない講座で、XPをためるために次に見る1回 */
  function catchUpBtn() {
    var cont = R.continueList()[0];
    // 長い講座名は狭い幅で折り返す（文字は1つの span にまとめる。.btn は flex なので、分けると横に並んでしまう）
    return cont
      ? '<a class="btn btn-primary cr-catchup" href="' + lessonHref(cont.c, cont.st.next) + '"><span>' + jp(cont.c.title) +
        ' <span class="nw">第' + (lessonIndex(cont.c, cont.st.next.id) + 1) + '回を見る</span></span></a>'
      : '<a class="btn btn-primary" href="#/courses?tab=archive">録画を見る</a>';
  }
  function levelNeed(c) {
    var L = levelOf(c.level), need = needXp(c.level);
    // 本数は次のレベルのときだけ（先のレベルで「動画44本」と出しても目安にならないため）
    return 'Lv' + L.lv + '「' + esc(L.name) + '」から見られます。<span class="nw">あと' + U.num(need) + 'XP</span>' +
      (L.lv === R.level().lv + 1 ? needText(need) : '') + 'です。';
  }

  function startArea(c, st) {
    if (st.locked) {
      return '<div class="notice cr-lock">' + icon('lock') + '<div>' + levelNeed(c) + '</div></div>' +
        '<div class="cr-start">' + catchUpBtn() + '<button type="button" class="btn btn-soft" data-cr-level aria-haspopup="dialog">レベルのしくみ</button></div>';
    }
    if (st.completed) {
      var d = doneMap(), last = c.lessons.reduce(function (a, l) { var x = d[l.id]; return x && (!a || x > a) ? x : a; }, null);
      var cont = R.continueList()[0];
      return '<p class="cr-start__done">' + (last ? onDay(last) : '') + '修了しました。</p>' +
        '<div class="cr-start">' +
          '<a class="btn btn-ink" href="' + certHref(c) + '">修了証を見る</a>' +
          '<a class="btn btn-soft" href="' + lessonHref(c, c.lessons[0]) + '">最初から見る</a>' +
        '</div>' +
        (cont ? '<p class="cr-start__nextc"><a class="btn btn-text cr-nextcourse" href="' + courseHref(cont.c) + '"><span>次は「' + jp(cont.c.title) + '<span class="nw">」' + icon('arrow', 'ico-s') + '</span></span></a></p>' : '');
    }
    var nx = st.next, n = lessonIndex(c, nx.id) + 1, rt = R.resumeText(nx.id);
    // 修了したあとに運営が回を足した講座：新しい回へ進みつつ、出した修了証も見られるようにする
    // （R.certificate は一度出した修了証を、あとで回が足されても返す）
    var cert = st.started && R.certificate(c.id);
    return '<div class="cr-start">' +
      '<a class="btn btn-primary btn-l" href="' + lessonHref(c, nx) + '">' + icon('play') + (st.started || rt ? '続きから見る' : '第1回から見る') + '</a>' +
      (st.started
        ? '<div class="cr-start__prog">' +
            '<p><b class="num">' + st.done + '/' + st.total + '回</b>・残り' + st.left + '分</p>' +
            U.progressBar(st.pct, 'ink', { label: c.title + 'の進みぐあい', valuetext: st.total + '回のうち' + st.done + '回' }) +
          '</div>'
        : rt ? '<p class="cr-start__note">第' + n + '回・' + esc(rt) + '</p>' : '') +
      (cert ? '<a class="btn btn-soft" href="' + certHref(c) + '">修了証を見る</a>' : '') +
    '</div>';
  }

  /** 学べること＋講師 */
  function infoBlock(c) {
    var t = R.person(c.teacher), learn = (c.learn || []).filter(Boolean);
    return '<div class="cr-info">' +
      (learn.length ? '<section class="sec cr-learn" aria-labelledby="crLearnTtl">' +
        '<h2 class="sec-ttl" id="crLearnTtl">学べること</h2>' +
        '<ul class="card cr-learn__list">' + learn.map(function (x) { return '<li>' + jp(x) + '</li>'; }).join('') + '</ul>' +
      '</section>' : '') +
      '<section class="sec cr-teach" aria-labelledby="crTeachTtl">' +
        '<h2 class="sec-ttl" id="crTeachTtl">講師</h2>' +
        '<div class="list">' +
          '<a class="li cr-teacher" href="#/members/' + enc(t.id || c.teacher) + '">' + U.avatar(t) +
            '<span class="li__body">' +
              '<span class="li__ttl"><span class="nw">' + esc(t.name) + '</span>' + (t.role ? ' <span class="cr-teacher__role">' + esc(t.role) + '</span>' : '') + '</span>' +
              (t.bio ? '<span class="li__sub cr-teacher__bio">' + jp(t.bio) + '</span>' : '') +
            '</span>' + U.chevron() +
          '</a>' +
        '</div>' +
      '</section>' +
    '</div>';
  }

  /** 目次の1行。見終わった回は薄い墨＋緑の印、鍵の回だけ灰＋鍵 */
  function lessonRow(c, l, i) {
    var ls = R.lessonState(c, l.id), note = R.lessonNote(l.id);
    var sub = '第' + (i + 1) + '回・' + l.min + '分' + (ls === 'done' ? '・見終わった' : '') + (note ? '・メモあり' : '');
    // 新着は、前の回を見終えていなくても付ける（公開された回として知らせる）。レベルで閉じている講座には付けない（一覧のカードと同じ）
    var tag = ls !== 'done' && c.level <= R.level().lv && isNew(l.newAt) ? '<span class="li__end">' + U.statusTag('new') + '</span>' : '';
    var inner = '<span class="li__ico">' + stateIcon(ls) + '</span>' +
      '<span class="li__body"><span class="li__ttl">' + jp(l.title) + (ls === 'locked' ? '<span class="sr-only">（まだ見られません）</span>' : '') + '</span>' +
      '<span class="li__sub">' + jp(sub) + '</span></span>' + tag;
    if (ls === 'locked') return '<div class="li has-ico cr-ls is-locked">' + inner + '</div>';
    return '<a class="li has-ico cr-ls is-' + ls + '" href="' + lessonHref(c, l) + '">' + inner + U.chevron() + '</a>';
  }

  /* ---------- 確認テスト（決定事項：3問・修了の条件にはしない・合格でXP） ---------- */
  function quizSection(c, st) {
    var q = R.quiz(c.id);
    if (!q || q.locked) return '';
    var ttl = '<h2 class="sec-ttl" id="crQuizTtl">確認テスト</h2>';
    // 進みの数（2/5回）は目次の見出しにあるので、ここでは残りの回だけ書く
    // XP は初めて合格したときだけなので、合格したあとの受け直しでは書かない
    var passed = q.result && q.result.passed;
    var rule = q.total + '問中' + q.pass + '問以上正解で合格' + (passed ? '' : '（<b class="num xp-num">+' + DATA.XP.quiz + '</b> XP）');
    var open = '<section class="sec cr-quiz" id="crQuiz" tabindex="-1" aria-labelledby="crQuizTtl">' + ttl;
    // 合格したあとに運営が回を足したときは、合格のまま（受け直しは全回を見終えてから）
    if (!q.ready && !passed) {
      return open + '<div class="card card-pad cr-quiz__wait"><p>' + jp('全' + st.total + '回を見終わると受けられます（あと' + (st.total - st.done) + '回）。') + rule + '。</p></div></section>';
    }
    var res = quizRes[c.id];
    // 答え合わせのあとに運営が問いを直したら、古い結果は出さない
    if (res && (!q.ready || !res.results || res.results.length !== q.total)) { delete quizRes[c.id]; res = null; }
    if (res) return open + quizResult(c, q, res) + '</section>';
    if (passed && (!retake[c.id] || !q.ready)) {
      var cert = R.certificate(c.id);
      return open + '<div class="card card-pad cr-quiz__passed">' +
        '<p><b>合格しています。</b>' + (q.result.at ? (isToday(q.result.at) ? '今日' : detailDate(q.result.at)) + '・' : '') + q.result.total + '問中' + q.result.score + '問正解。</p>' +
        (cert || q.ready ? '<div class="cr-quiz__acts">' +
          (cert ? '<a class="btn btn-ghost" href="' + certHref(c) + '">修了証を見る</a>' : '') +
          (q.ready ? '<button type="button" class="btn btn-soft" data-cr-retry="' + esc(c.id) + '">もう一度受ける</button>' : '') +
        '</div>' : '') + '</div></section>';
    }
    return open + '<form class="card card-pad cr-quiz__form" data-cr-quiz="' + esc(c.id) + '" novalidate>' +
      '<p class="cr-quiz__rule">' + rule + (q.result && !q.result.passed ? '。前回は' + q.result.total + '問中' + q.result.score + '問正解でした' : '') + '</p>' +
      q.questions.map(function (x) {
        // 区切りの線は外の箱に引く（fieldset の上の線は legend に重なるため）
        return '<div class="cr-q"><fieldset>' +
          '<legend class="cr-q__q"><span class="num">' + (x.i + 1) + '.</span>' + jp(x.q) + '</legend>' +
          x.choices.map(function (ch, k) {
            return '<label class="check cr-q__c"><input type="radio" name="q' + x.i + '" value="' + k + '"><span>' + jp(ch) + '</span></label>';
          }).join('') +
        '</fieldset></div>';
      }).join('') +
      '<p class="form-err" role="alert" id="crQuizErr"></p>' +
      '<div class="cr-quiz__acts"><button type="submit" class="btn btn-ink" data-cr-submit="' + esc(c.id) + '" data-focus-after="#crQuizRes">答え合わせをする</button></div>' +
    '</form></section>';
  }

  /** 間違えた問いの下の「第N回を見直す」。戻る回は R.submitQuiz が決める（data.js の quiz[].lesson・解説の「第N回」） */
  function quizResult(c, q, res) {
    return '<div class="card cr-quiz__res">' +
      '<div class="cr-quiz__sum' + (res.passed ? ' is-pass' : '') + '" id="crQuizRes" tabindex="-1">' +
        (res.passed
          ? '<p><b>合格です。</b>' + res.total + '問中' + res.score + '問正解でした。' + (res.firstPass ? '<b class="num xp-num">+' + DATA.XP.quiz + '</b> XP' : '') + '</p>'
          : '<p><b>' + res.total + '問中' + res.score + '問正解でした。</b>合格は' + q.pass + '問からです。間違えたところの回を見直してください。</p>') +
      '</div>' +
      '<ol class="cr-qres">' + res.results.map(function (r, i) {
        var x = q.questions[i] || { q: '', choices: [] };
        // 戻る回はいまの目次で番号と題を引く（運営が並べ替え・題の直し・非公開にしたとき）
        var li = r.lesson ? lessonIndex(c, r.lesson.id) : -1, back = li >= 0 ? c.lessons[li] : null;
        return '<li class="cr-qres__item ' + (r.correct ? 'is-ok' : 'is-ng') + '">' +
          '<p class="cr-qres__q"><span class="num">' + (i + 1) + '.</span>' + jp(x.q) + '</p>' +
          '<p class="cr-qres__mark">' + (r.correct ? '正解' : '不正解') + '</p>' +
          '<p class="cr-qres__a">' + (r.chosen == null ? '答えていません' : 'あなたの答え：' + jp(x.choices[r.chosen])) + '</p>' +
          (r.correct ? '' : '<p class="cr-qres__a">正しい答え：' + jp(x.choices[r.answer]) + '</p>') +
          (r.why ? '<p class="cr-qres__why">' + jp(r.why) + '</p>' : '') +
          (!r.correct && back ? '<a class="btn btn-text cr-qres__back" href="' + lessonHref(c, back) + '"><span><span class="nw">第' + (li + 1) + '回</span>「' + jp(back.title) + '」<span class="nw">を見直す' + icon('arrow', 'ico-s') + '</span></span></a>' : '') +
        '</li>';
      }).join('') + '</ol>' +
      '<div class="card-foot">' +
        '<button type="button" class="btn btn-soft" data-cr-retry="' + esc(c.id) + '">もう一度受ける</button>' +
        (res.passed && R.certificate(c.id) ? '<a class="btn btn-ink" href="' + certHref(c) + '">修了証を見る</a>' : '') +
      '</div>' +
    '</div>';
  }

  /** この講座の修了が条件になっている案件。報酬は必ず「目安」と書く */
  function gigsFor(c) {
    var gs = (DATA.GIGS || []).filter(function (g) { return g.requires === c.id; });
    if (!gs.length) return '';
    return '<section class="sec" aria-labelledby="crGigTtl">' +
      '<h2 class="sec-ttl" id="crGigTtl">修了すると応募できる案件</h2>' +
      '<div class="list">' + gs.map(function (g) {
        var mine = R.gigState(g.id), lock = R.gigLock(g);
        var tag = mine ? U.statusTag(mine.tag || 'applied', mine.label)
          : !lock.locked ? '<span class="tag tag-ok">応募できます</span>'
          : !lock.course ? '<span class="tag">Lv' + esc(g.level) + 'から</span>' : '';
        // 札は本文の中（広いときは右の列、狭いときは補足の下。題名の幅を取らないように）
        return '<a class="li cr-gig" href="#/gigs/' + enc(g.id) + '">' +
          '<span class="li__body"><span class="li__ttl">' + jp(g.title) + '</span>' +
          '<span class="li__sub">報酬の目安 ' + jp(g.reward) + '・' + jp(g.time) + (g.remote === false && g.place ? '・' + jp(g.place) : '') + '</span>' +
          (tag ? '<span class="cr-gig__tag">' + tag + '</span>' : '') + '</span>' +
          U.chevron() + '</a>';
      }).join('') + '</div>' +
    '</section>';
  }

  /* ============================================================
     修了証
     ============================================================ */
  function certView(c) {
    var cert = R.certificate(c.id), st = R.courseState(c);
    var trail = crumb([['講座', '#/courses'], [c.title, courseHref(c)], ['修了証']]);
    if (!cert) {
      // まだ修了していない：条件と、いまの進み（目次の上と同じ形）と、次に見る回
      return trail + '<div class="page-head"><h1 class="page-ttl" data-page-title tabindex="-1">修了証</h1>' +
          '<p class="page-lead">' + (st.locked
            ? '講座「' + jp(c.title) + '」はLv' + c.level + 'で開きます。全' + st.total + '回を見終わると修了証が出ます。'
            : '講座「' + jp(c.title) + '」の全' + st.total + '回を見終わると出ます。') + '</p></div>' +
        '<div class="cr-start">' +
          (!st.locked && st.next ? '<a class="btn btn-primary" href="' + lessonHref(c, st.next) + '">第' + (lessonIndex(c, st.next.id) + 1) + '回を見る</a>' : '') +
          '<a class="btn btn-soft" href="' + courseHref(c) + '">目次に戻る</a>' +
          (!st.locked && st.started
            ? '<div class="cr-start__prog"><p><b class="num">' + st.done + '/' + st.total + '回</b>・残り' + st.left + '分</p>' +
                U.progressBar(st.pct, 'ink', { label: c.title + 'の進みぐあい', valuetext: st.total + '回のうち' + st.done + '回' }) + '</div>'
            : '') +
        '</div>';
    }
    return trail +
      '<div class="page-head cr-cert-head"><h1 class="page-ttl" data-page-title tabindex="-1">修了証</h1></div>' +
      '<div class="cr-cert-acts">' +
        '<button type="button" class="btn btn-ink" data-cr-print="' + esc(c.id) + '">印刷する</button>' +
        '<button type="button" class="btn btn-ghost" data-cr-png="' + esc(c.id) + '">' + icon('download', 'ico-s') + '画像で保存</button>' +
      '</div>' +
      '<article class="cr-cert" aria-labelledby="crCertName">' +
        '<p class="cr-cert__no">No. <span class="num">' + esc(cert.no) + '</span></p>' +
        '<p class="cr-cert__ttl">修了証</p>' +
        '<p class="cr-cert__name" id="crCertName">' + esc(cert.name) + '</p>' +
        '<p class="cr-cert__body">講座「' + jp(cert.course.title) + '」<span class="nw">' + certCount(c) + 'を</span><br>修了したことを証します。</p>' +
        '<dl class="cr-cert__kv">' +
          '<div><dt>修了日</dt><dd>' + esc(U.fmtDate(cert.date, { wd: false })) + '</dd></div>' +
          '<div><dt>会員番号</dt><dd class="num">' + esc(cert.memberNo) + '</dd></div>' +
          '<div><dt>講師</dt><dd>' + esc(cert.teacher) + '</dd></div>' +
        '</dl>' +
        '<p class="cr-cert__by">' + U.brandmark(DATA.SITE) + '</p>' +
      '</article>';
  }

  /** 修了証に書く回の数「（全5回）」。修了したあとに運営が回を足した講座では、いまの数と合わないので書かない */
  function certCount(c) { var st = R.courseState(c); return st.completed ? '（全' + st.total + '回）' : ''; }

  /** 修了証を画像（PNG・A4縦の比率）にして保存する */
  function certPng(c) {
    var cert = R.certificate(c.id);
    if (!cert) return;
    var W = 1240, H = 1754, cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var g = cv.getContext && cv.getContext('2d');
    if (!g || !cv.toBlob) { U.toast('この端末では画像を作れませんでした。印刷から PDF で保存できます', 'error'); return; }
    var ff = '';
    try { ff = getComputedStyle(document.body).fontFamily; } catch (e) {}
    ff = ff || 'sans-serif';
    var INK = '#1d1b18', INK2 = '#55514a', INK3 = '#726d65', LINE = '#d6d1c7';
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    g.strokeStyle = INK; g.lineWidth = 4; g.strokeRect(80, 80, W - 160, H - 160);
    g.strokeStyle = LINE; g.lineWidth = 2; g.strokeRect(100, 100, W - 200, H - 200);
    g.textBaseline = 'alphabetic';
    g.fillStyle = INK3; g.textAlign = 'right'; g.font = '500 30px ' + ff;
    g.fillText('No. ' + cert.no, W - 160, 190);
    g.textAlign = 'center'; g.fillStyle = INK; g.font = '800 104px ' + ff;
    g.fillText('修了証', W / 2, 430);
    // 長い名前は枠に収まるまで字を小さくする
    for (var fs = 76; fs > 40; fs -= 4) { g.font = '700 ' + fs + 'px ' + ff; if (g.measureText(cert.name).width <= W - 420) break; }
    g.fillText(cert.name, W / 2, 660);
    g.fillStyle = LINE; g.fillRect(W / 2 - 330, 700, 660, 3);
    g.fillStyle = INK2; g.font = '500 40px ' + ff;
    wrap('講座「' + cert.course.title + '」' + certCount(c) + 'を', W / 2, 830, 900, 56)
      .concat(['修了したことを証します。']).forEach(function (line, i) { g.fillText(line, W / 2, 830 + i * 60); });
    // 修了証の番号は右上の「No.」だけ（下の表に同じ番号を2度書かない）
    var rows = [['修了日', U.fmtDate(cert.date, { wd: false })], ['会員番号', cert.memberNo], ['講師', cert.teacher]];
    rows.forEach(function (r, i) {
      var y = 1110 + i * 78;
      g.textAlign = 'left'; g.fillStyle = INK3; g.font = '500 34px ' + ff; g.fillText(r[0], 300, y);
      g.fillStyle = INK; g.font = '600 36px ' + ff; g.fillText(r[1], 560, y);
      g.fillStyle = LINE; g.fillRect(300, y + 26, W - 600, 2);
    });
    // 下の屋号はロゴ（画面の修了証と同じ U.brandmark の形）。描けない端末では文字で
    logoImage(INK, 76, function (img, w, h) {
      var ok = false;
      if (img) { try { g.drawImage(img, (W - w) / 2, H - 230 - h + 12, w, h); ok = true; } catch (e) {} }
      if (!ok) { g.textAlign = 'center'; g.fillStyle = INK; g.font = '800 44px ' + ff; g.fillText(DATA.SITE.name, W / 2, H - 230); }
      save(ok);
    });
    function wrap(text, x, y, max) {
      var out = [], line = '';
      String(text).split('').forEach(function (ch) {
        if (g.measureText(line + ch).width > max && line) { out.push(line); line = ch; } else line += ch;
      });
      if (line) out.push(line);
      return out;
    }
    function save(withLogo) {
      try {
        cv.toBlob(function (b) {
          if (!b) { U.toast('画像を作れませんでした', 'error'); return; }
          var a = document.createElement('a');
          a.href = URL.createObjectURL(b);
          a.download = '修了証_' + cert.no + '.png';
          document.body.appendChild(a); a.click(); a.parentNode.removeChild(a);
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
          U.toast('修了証の画像を保存しました', 'ok');
        }, 'image/png');
      } catch (e) {
        // ロゴの絵で書き出せない端末（キャンバスが汚れた扱い）：ロゴの場所を塗り直して、文字で書き直す
        if (!withLogo) { U.toast('画像を作れませんでした', 'error'); return; }
        g.fillStyle = '#fff'; g.fillRect(140, H - 330, W - 280, 140);
        g.textAlign = 'center'; g.fillStyle = INK; g.font = '800 44px ' + ff; g.fillText(DATA.SITE.name, W / 2, H - 230);
        save(false);
      }
    }
  }
  /** ロゴ（U.brandmark の SVG）をキャンバスに描ける絵にする。墨の部分（currentColor）は ink、頭の四角は朱のまま。
      cb(img, 幅, 高さ)。作れなければ cb(null) */
  function logoImage(ink, h, cb) {
    try {
      var box = document.createElement('div');
      box.innerHTML = U.brandmark(DATA.SITE, '', { decorative: true });
      var svg = box.querySelector('svg'), vb = (svg.getAttribute('viewBox') || '0 0 329.12 100').split(/\s+/);
      var w = Math.round(h * (+vb[2] / +vb[3]));
      svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      svg.setAttribute('width', w); svg.setAttribute('height', h); svg.setAttribute('color', ink);
      var url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
      var img = new Image(), done = false;
      var fin = function (ok) { if (done) return; done = true; setTimeout(function () { URL.revokeObjectURL(url); }, 0); cb(ok ? img : null, w, h); };
      img.onload = function () { fin(true); };
      img.onerror = function () { fin(false); };
      setTimeout(function () { fin(false); }, 3000);
      img.src = url;
    } catch (e) { cb(null, 0, 0); }
  }

  /* ============================================================
     勉強会の録画（一覧）
     ============================================================ */
  function genres() {
    var have = {};
    DATA.ARCHIVE.forEach(function (a) { have[a.faculty] = a.genre || facName(a.faculty) || a.faculty; });
    // 学部の順（DATA.FACULTIES）、そのあとに成果発表会など学部でないもの
    var out = DATA.FACULTIES.filter(function (f) { return have[f.id]; }).map(function (f) { return { id: f.id, name: have[f.id] }; });
    Object.keys(have).forEach(function (k) { if (!byId(DATA.FACULTIES, k)) out.push({ id: k, name: have[k] }); });
    return out;
  }

  function archiveView() {
    var seen = seenMap(), gs = genres();
    if (genre !== 'all' && !byId(gs, genre)) genre = 'all';
    var list = DATA.ARCHIVE.filter(function (a) { return genre === 'all' || a.faculty === genre; })
      .sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    var seenN = DATA.ARCHIVE.filter(function (a) { return seen[a.id]; }).length;
    // 録画が残るオンラインの回だけ。オフ会は録画がないので出さない
    var lives = R.upcoming().filter(function (e) { return e.recording && e.kind !== 'offline'; }).slice(0, 2);

    var chips = '<div class="chips cr-chips" role="group" aria-label="学部で絞り込む">' +
      [{ id: 'all', name: 'すべて' }].concat(gs).map(function (g) {
        var on = g.id === genre, n = g.id === 'all' ? DATA.ARCHIVE.length : DATA.ARCHIVE.filter(function (a) { return a.faculty === g.id; }).length;
        return '<button type="button" class="chip' + (on ? ' is-on' : '') + '" aria-pressed="' + on + '" data-cr-genre="' + esc(g.id) + '">' +
          esc(g.name) + '<span class="n num">' + n + '</span></button>';
      }).join('') + '</div>';

    var none = !DATA.ARCHIVE.length;
    return (lives.length ? '<section class="sec" aria-labelledby="crLiveTtl">' +
        '<h2 class="sec-ttl" id="crLiveTtl">これからのライブ</h2>' +
        '<div class="list">' + lives.map(function (e) {
          return '<a class="li" href="#/events/' + enc(e.id) + '">' +
            '<span class="li__body"><span class="li__ttl">' + jp(e.title) + '</span>' +
            '<span class="li__sub">' + U.fmtShort(e.at, true) + '・' + jp(e.place) + '</span></span>' +
            '<span class="li__end">' + (R.isReserved(e.id) ? U.statusTag('reserved') : '') + U.chevron() + '</span></a>';
        }).join('') + '</div>' +
      '</section>' : '') +
      '<section class="sec" aria-labelledby="crArcTtl">' +
        '<h2 class="sec-ttl"><span id="crArcTtl">録画</span>' + (none ? '' : '<span class="cr-ttlnote num">見終わった ' + seenN + '/' + DATA.ARCHIVE.length + '本</span>') + '</h2>' +
        (none ? '' : chips) +
        '<div class="list cr-alist">' + (list.length ? list.map(function (a) { return archiveRow(a, seen); }).join('')
          : none ? U.empty('play', 'まだ録画はありません。', { href: '#/events', label: 'イベントを見る' })
          // 同じ URL へのリンクでは絞り込みが外れないので、「すべて」のチップと同じボタンにする
          : U.empty('play', 'この学部の録画はまだありません。', '<button type="button" class="btn btn-soft btn-s" data-cr-genre="all">すべての録画を見る</button>')) + '</div>' +
      '</section>';
  }

  function archiveRow(a, seen) {
    var t = R.person(a.teacher), s = !!seen[a.id], ph = archiveSrc(a);
    var tag = !s && isNew(a.newAt) ? '<span class="li__end">' + U.statusTag('new') + '</span>' : '';
    return '<a class="li cr-arow' + (s ? ' is-seen' : '') + '" href="' + archiveHref(a) + '">' +
      '<span class="li__body"><span class="li__ttl">' + jp(a.title) + '</span>' +
        '<span class="li__sub">' + (a.faculty === 'showcase' ? jp(U.fmtShort(a.date) + '・' + a.min + '分')
          : jp(U.fmtShort(a.date) + '・' + a.min + '分・') + '<span class="nw">' + esc(t.name) + '</span>') +
          (s ? '<span class="cr-seen">・見終わった</span>' : '') + '</span></span>' +
      tag + U.chevron() +
      '<span class="cr-thumb">' + img(ph, '', '') + '<span class="cr-thumb__play" aria-hidden="true">' + SVG_PLAY + '</span></span>' +
    '</a>';
  }

  /* ============================================================
     勉強会の録画（1本）
     ============================================================ */
  function archiveDetail(a) {
    var seenAt = seenMap()[a.id], t = R.person(a.teacher), rel = relatedCourse(a);
    var key = 'arc-' + a.id, sec = a.min * 60, isPlayed = !!played[key];
    var files = fileList(a.files), chaps = chapters(a.chapters), showcase = a.faculty === 'showcase';
    return crumb([['講座', '#/courses'], ['勉強会の録画', '#/courses?tab=archive'], [a.title]]) +
      '<div class="cr-lesson cr-arc">' +
        '<div class="cr-lesson__main">' +
          // 録画の位置は保存しない（この表示のあいだだけ）。ほかの画面から戻ったら「前回の続き」を出す
          player({ key: key, sec: sec, poster: img(archiveSrc(a), '', 'cr-player__poster'), resume: true }) +
          '<div class="cr-lesson__head">' +
            '<div class="cr-lesson__hbody">' +
              '<h1 class="cr-lesson__ttl" data-page-title tabindex="-1">' + jp(a.title) + '</h1>' +
              // 成果発表会は会員が発表する会なので、講師は書かない（会の名前は題にある）
              '<p class="cr-lesson__meta">' + detailDate(a.date) + (showcase ? '・' + a.min + '分' : 'の勉強会・' + a.min + '分・講師 ' + esc(t.name)) + '</p>' +
              (seenAt ? '<p class="cr-lesson__done" id="crDone" tabindex="-1">' + onDay(seenAt) + '見終わりました</p>' : '') +
            '</div>' +
            (seenAt ? '' : actArea({ key: key, id: a.id, sec: sec, xp: DATA.XP.archive, played: isPlayed, attr: 'data-cr-seen', after: '#crDone' })) +
          '</div>' +
          (a.desc ? '<div class="cr-about"><p class="cr-about__desc">' + jp(a.desc) + '</p></div>' : '') +
          filesBlock(files, a.id) +
          (rel ? '<section class="sec" aria-labelledby="crRelTtl"><h2 class="sec-ttl" id="crRelTtl">関連する講座</h2><div class="list">' + relatedRow(rel) + '</div></section>' : '') +
          askBlock(askHref('archive:' + a.id), 'この録画について質問する') +
        '</div>' +
        (chaps.length ? '<aside class="cr-lesson__side" aria-labelledby="crChapTtl">' +
          '<h2 class="sec-ttl" id="crChapTtl">チャプター</h2>' +
          '<div class="list cr-chaps">' + chaps.map(function (ch) {
            return '<button type="button" class="li cr-chap" data-cr-chap="' + ch.sec + '">' +
              '<span class="cr-chap__at num">' + esc(ch.at) + '</span>' +
              '<span class="li__body"><span class="li__ttl">' + jp(ch.title) + '</span></span></button>';
          }).join('') + '</div>' +
        '</aside>' : '') +
      '</div>';
  }
  function toSec(s) { var p = String(s).split(':').map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : (p[0] || 0) * 60 + (p[1] || 0); }
  /** チャプター（data.js は [時刻, 題]。運営が足したものは {at, title} でも読む）。時刻の順に並べ、読めないものは外す */
  function chapters(list) {
    return (Array.isArray(list) ? list : []).map(function (ch) {
      var at = Array.isArray(ch) ? ch[0] : ch && (ch.at || ch.time), t = Array.isArray(ch) ? ch[1] : ch && (ch.title || ch.t);
      at = String(at == null ? '' : at).trim();
      return /^\d{1,2}(:\d{2}){1,2}$/.test(at) && t ? { at: at, sec: toSec(at), title: String(t) } : null;
    }).filter(Boolean).sort(function (a, b) { return a.sec - b.sec; });
  }
  /** 資料（{name, type}。名前だけの文字も読む） */
  function fileList(list) {
    return (Array.isArray(list) ? list : []).map(function (f) {
      return typeof f === 'string' ? { name: f } : f && f.name ? f : null;
    }).filter(Boolean);
  }

  function relatedRow(c) {
    var st = R.courseState(c);
    var sub = st.locked ? 'Lv' + c.level + 'で開きます・全' + st.total + '回'
      : st.completed ? '修了・全' + st.total + '回'
      : st.started ? st.done + '/' + st.total + '回・残り' + st.left + '分' : '全' + st.total + '回・' + st.minutes + '分';
    return '<a class="li cr-rel' + (st.locked ? ' is-locked' : '') + '" href="' + courseHref(c) + '">' +
      '<span class="li__body"><span class="li__ttl">' + jp(c.title) + '</span><span class="li__sub">' + jp(sub) + '</span></span>' + U.chevron() +
      '<span class="cr-thumb">' + coursePhoto(c, '', true) + '</span>' +
    '</a>';
  }

  /** 資料の行（試作版はダウンロードしない。本番で何が起きるかを知らせる） */
  function filesBlock(files, id) {
    if (!files || !files.length) return '';
    return '<section class="sec cr-files" aria-labelledby="crFileTtl">' +
      '<h2 class="sec-ttl" id="crFileTtl">資料</h2>' +
      '<div class="list">' + files.map(function (f, i) {
        return '<button type="button" class="li has-ico cr-file" data-cr-file="' + esc(id + ':' + i) + '">' +
          '<span class="li__ico">' + icon('download') + '</span>' +
          '<span class="li__body"><span class="li__ttl">' + jp(f.name) + '</span></span>' +
          '<span class="li__end">ダウンロード</span></button>';
      }).join('') + '</div>' +
    '</section>';
  }
  function fileName(ref) {
    var p = String(ref).split(':'), i = +p[1] || 0, id = p[0];
    var a = byId(DATA.ARCHIVE, id);
    if (a) return (fileList(a.files)[i] || {}).name || '';
    for (var k = 0; k < DATA.COURSES.length; k++) {
      var l = byId(DATA.COURSES[k].lessons, id);
      if (l) return (fileList([l.material])[0] || {}).name || '';
    }
    return '';
  }
  function askBlock(href, label) {
    return '<p class="cr-ask"><a class="btn btn-ghost" href="' + esc(href) + '">' + icon('message', 'ico-s') + esc(label) + '</a></p>';
  }

  /** 題の下：見終わるまでは静かな1行（いまの位置は再生の帯にあるので書かない）、見終えたら朱のボタン */
  function actArea(o) {
    if (o.played) {
      return '<div class="cr-lesson__act"><button type="button" class="btn btn-primary cr-lesson__btn" id="crAct" ' + o.attr + '="' + esc(o.id) + '"' +
        ' data-focus-after="' + esc(o.after) + '">見終わった（+' + o.xp + ' XP）</button></div>';
    }
    return '<div class="cr-lesson__act"><p class="cr-gate">最後まで見ると <b class="num xp-num">+' + o.xp + '</b> XP</p></div>';
  }

  CLG.screens.courses = {
    title: function (ctx) {
      var r = resolve(ctx.params);
      if (r.view === 'archive') return r.a.title;
      if (r.view === 'detail') return r.c.title;
      if (r.view === 'cert') return '修了証（' + r.c.title + '）';
      if (r.view === 'off') return r.off.title;
      if (r.view === 'nf') return 'ページが見つかりません';
      return ctx.query.tab === 'archive' || ctx.params[0] === 'archive' ? '勉強会の録画' : '講座';
    },
    render: function (ctx) {
      own(ctx);
      var r = resolve(ctx.params), html;
      if (r.view === 'archive') html = archiveDetail(r.a);
      else if (r.view === 'detail') html = detailView(r.c, ctx);
      else if (r.view === 'cert') html = certView(r.c);
      else if (r.view === 'off') {
        html = offView(r.off, r.off === OFF.archive
          ? crumb([['講座', '#/courses'], ['勉強会の録画', '#/courses?tab=archive']])
          : crumb([['講座', '#/courses']]));
      } else if (r.view === 'nf') {
        html = U.notFound({ lead: ctx.params[0] === 'archive'
          ? '録画が見つかりませんでした。一覧から選び直してください。'
          : '講座が見つかりませんでした。講座の一覧から選び直してください。' });
      } else {
        var arc = ctx.query.tab === 'archive' || ctx.params[0] === 'archive';
        html = head(arc) + (arc ? archiveView() : listView());
      }
      return '<div class="scr-courses">' + html + '</div>';
    },
    back: function (ctx) {
      var p = ctx.params;
      if (!p[0]) return null;
      if (p[0] === 'archive') return p[1] ? { href: '#/courses?tab=archive', label: '勉強会の録画' } : { href: '#/courses', label: '講座' };
      if (p[1] === 'certificate' && R.course(p[0])) return { href: '#/courses/' + enc(p[0]), label: '講座の目次' };
      return { href: '#/courses', label: '講座' };
    },
    mount: function (root, ctx) {
      cur = ctx;
      bindRoot(root);
      var el = root.querySelector('.scr-courses');
      if (!el) return;
      var p = ctx.params;
      if (p[0] === 'archive' && p[1]) mountArchive(el, p[1]);
      // 「確認テストを受ける」で来たとき（描き直しのたびには動かさない）
      var fk = ctx.query.focus === 'quiz' && p[0] && !p[1] ? ctx.key + '?quiz' : null;
      if (fk && focusDone !== fk) {
        var qz = el.querySelector('#crQuiz');
        if (qz) setTimeout(function () { U.smoothScroll(qz, { focus: true }); }, 0);
      }
      focusDone = fk;
    }
  };

  function mountArchive(el, id) {
    var a = byId(DATA.ARCHIVE, id);
    if (!a) return;
    var key = 'arc-' + a.id;
    ctl = bindPlayer(el.querySelector('[data-cr-player]'), {
      onEnd: function () {
        if (seenMap()[a.id]) return;
        played[key] = true;
        swapGate(el, actArea({ key: key, id: a.id, sec: a.min * 60, xp: DATA.XP.archive, played: true, attr: 'data-cr-seen', after: '#crDone' }));
      }
    });
    // チャプターを再生中の場所に合わせて太字にする
    var chaps = el.querySelectorAll('[data-cr-chap]');
    if (chaps.length && ctl) {
      var o = run.o, prev = o.onTick;
      o.onTick = function (pos, sec) {
        if (prev) prev(pos, sec);
        var at = -1;
        for (var i = 0; i < chaps.length; i++) if (+chaps[i].getAttribute('data-cr-chap') <= pos + 0.5) at = i;
        for (var j = 0; j < chaps.length; j++) {
          chaps[j].classList.toggle('is-current', j === at);
          if (j === at) chaps[j].setAttribute('aria-current', 'true'); else chaps[j].removeAttribute('aria-current');
        }
      };
      o.onTick(live[key] ? live[key].pos : 0, a.min * 60);
    }
  }

  /** 見終わったら、静かな1行を朱のボタンに差し替えて、そこへ焦点を移す。
      焦点を移すのは再生の枠を触っていたとき（か、焦点が本文の入れ物・見出しにあるとき）だけ。
      見ながらメモを書いている人や、目次をたどっている人の焦点を取ると、続けて打った Enter・スペースで「見終わった」が押されてしまうため */
  function swapGate(el, html) {
    var box = el.querySelector('.cr-lesson__act');
    if (!box) return;
    var a = document.activeElement, player = el.querySelector('[data-cr-player]');
    var move = !a || a === document.body || a.id === 'view' || a.hasAttribute('data-page-title') ||
      (player && player.contains(a)) || box.contains(a);
    box.outerHTML = html;
    var b = el.querySelector('#crAct');
    if (b && move) { try { b.focus({ preventScroll: true }); } catch (e) { b.focus(); } }
  }

  /* ---------- 押したときの動き（講座・再生画面で共通。#view に1回だけ付ける） ---------- */
  function bindRoot(root) {
    if (root.__crBound) return;
    root.__crBound = true;
    root.addEventListener('click', function (e) {
      var t = e.target.closest('.scr-courses [data-cr-level], .scr-lesson [data-cr-level], .scr-courses [data-cr-fac], .scr-courses [data-cr-genre],' +
        '.scr-courses [data-cr-file], .scr-lesson [data-cr-file], .scr-lesson [data-cr-complete], .scr-courses [data-cr-seen],' +
        '.scr-courses [data-cr-print], .scr-courses [data-cr-png], .scr-courses [data-cr-retry], .scr-courses [data-cr-chap]');
      if (!t || !cur) return;
      if (t.hasAttribute('data-cr-level')) { CLG.app.levelInfo(); return; }
      if (t.hasAttribute('data-cr-fac')) { fac = t.getAttribute('data-cr-fac'); cur.refresh(); return; }
      if (t.hasAttribute('data-cr-genre')) { genre = t.getAttribute('data-cr-genre'); cur.refresh(); return; }
      if (t.hasAttribute('data-cr-file')) { U.toast('本番では「' + fileName(t.getAttribute('data-cr-file')) + '」をダウンロードします'); return; }
      if (t.hasAttribute('data-cr-complete')) { completeLesson(t); return; }
      if (t.hasAttribute('data-cr-seen')) {
        // 二度押しで2回記録しないように。disabled にすると焦点が外れて、次のボタンへ移せなくなるので印だけ
        if (t.__busy) return;
        t.__busy = true;
        var r = R.seeArchive(t.getAttribute('data-cr-seen'));
        // 描き直して焦点を「見終わりました」へ移してから知らせる（窓を閉じたら、そこへ戻るように）
        cur.refresh();
        CLG.app.reward(r);
        return;
      }
      if (t.hasAttribute('data-cr-print')) { window.print(); return; }
      if (t.hasAttribute('data-cr-png')) { var pc = R.course(t.getAttribute('data-cr-png')); if (pc) certPng(pc); return; }
      if (t.hasAttribute('data-cr-retry')) {
        var cid = t.getAttribute('data-cr-retry');
        delete quizRes[cid]; retake[cid] = true;
        cur.refresh({ focus: '[name="q0"]' });
        return;
      }
      if (t.hasAttribute('data-cr-chap') && ctl) { ctl.seekTo(+t.getAttribute('data-cr-chap'), true); }
    });
    root.addEventListener('submit', function (e) {
      var f = e.target.closest('.scr-courses [data-cr-quiz]');
      if (!f || !cur) return;
      e.preventDefault();
      var cid = f.getAttribute('data-cr-quiz'), q = R.quiz(cid);
      if (!q) return;
      var answers = [], missing = null;
      q.questions.forEach(function (x) {
        var c = f.querySelector('input[name="q' + x.i + '"]:checked');
        answers.push(c ? c.value : null);
        if (!c && !missing) missing = f.querySelector('input[name="q' + x.i + '"]');
      });
      var err = f.querySelector('#crQuizErr');
      if (missing) {
        if (err) err.textContent = q.total + '問すべてに答えてください。';
        try { missing.focus(); } catch (x) {}
        return;
      }
      var r = R.submitQuiz(cid, answers);
      if (!r) return;
      quizRes[cid] = r; retake[cid] = false;
      cur.refresh({ focus: '#crQuizRes' });
      CLG.app.reward(r);
    });
    // メモ：手が止まってから保存したと知らせる（打つたびに出すとうるさい）
    var tm = null, off = null;
    root.addEventListener('input', function (e) {
      var m = e.target.closest('.scr-lesson [data-cr-memo]');
      if (!m) return;
      var id = m.getAttribute('data-cr-memo'), ok = true;
      try { R.lessonNote(id, m.value); } catch (x) { ok = false; }
      clearTimeout(tm); clearTimeout(off);
      tm = setTimeout(function () {
        var s = document.querySelector('.scr-lesson [data-cr-saved]');
        if (!s) return;
        s.textContent = ok ? '保存しました' : '保存できませんでした';
        s.classList.add('is-on');
        off = setTimeout(function () { s.classList.remove('is-on'); }, 2000);
      }, 500);
    });
    // 再生中に画面を離れるとき、位置を残す
    window.addEventListener('pagehide', function () { stopRun(true); });
    document.addEventListener('fullscreenchange', function () {
      var f = document.querySelector('.cr-player [data-cr-full]');
      if (f) f.setAttribute('aria-label', document.fullscreenElement && document.fullscreenElement.contains(f) ? '全画面を終える' : '全画面');
    });
  }

  function completeLesson(btn) {
    var f = findLesson(cur);
    if (!f) return;
    if (btn.__busy) return;   // 二度押しで2回記録しないように（disabled にすると焦点が外れる）
    btn.__busy = true;
    var r = R.completeLesson(f.c.id, f.l.id);
    if (!r) U.toast('この回はすでに記録されています');
    cur.refresh();       // 焦点を「次の回を見る」へ移してから知らせる（窓を閉じたら、そこへ戻る）
    CLG.app.reward(r);
  }

  /* ============================================================
     1回の再生画面
     ============================================================ */
  function findLesson(ctx) {
    var r = resolveLesson(ctx.params);
    return r.view === 'lesson' ? r : null;
  }

  function lessonView(ctx) {
    var f = resolveLesson(ctx.params);
    if (f.view === 'moved') return movedView(f);
    if (f.view === 'off') {
      return f.off === OFF.lesson
        ? offView(f.off, crumb([['講座', '#/courses'], [f.c.title, courseHref(f.c)]]), courseHref(f.c))
        : offView(f.off, crumb([['講座', '#/courses']]));
    }
    if (f.view !== 'lesson') return U.notFound({ lead: 'この回は見つかりませんでした。講座の目次から選び直してください。' });
    var c = f.c, l = f.l, i = f.i, n = i + 1;
    var ls = R.lessonState(c, l.id), st = R.courseState(c), t = R.person(c.teacher);
    var sec = l.min * 60, pos = ls === 'open' ? R.lessonPos(l.id) : 0;
    return crumb([['講座', '#/courses'], [c.title, courseHref(c)], ['第' + n + '回']]) +
      '<div class="cr-lesson">' +
        '<div class="cr-lesson__main">' +
          player({ key: l.id, sec: sec, locked: ls === 'locked', poster: coursePhoto(c, 'cr-player__poster', true), pos: pos, resume: true }) +
          '<div class="cr-lesson__head">' +
            '<div class="cr-lesson__hbody">' +
              '<h1 class="cr-lesson__ttl" data-page-title tabindex="-1">' + jp(l.title) + '</h1>' +
              '<p class="cr-lesson__meta">第' + n + '回（全' + c.lessons.length + '回）・' + l.min + '分・講師 ' + esc(t.name) +
                (isNew(l.newAt) && ls !== 'done' && !st.locked ? U.statusTag('new') : '') + '</p>' +
              doneLine(l, ls) +
            '</div>' +
            (ls === 'open' ? actArea({ key: l.id, id: l.id, sec: sec, pos: pos, xp: DATA.XP.lesson, played: !!played[l.id], attr: 'data-cr-complete', after: '[data-cr-next]' }) : '') +
          '</div>' +
          lockNotice(c, ls, st, i) +
          (ls === 'done' ? nextCard(c, i) : '') +
          // 説明と要点は、まだ開いていない回でも出す（何を学ぶ回かは見られる）。資料・質問・メモは開いてから
          about(l) +
          (ls === 'locked' ? '' : filesBlock(fileList([l.material]), l.id) +
            askBlock(askHref('lesson:' + c.id + '/' + l.id), 'この回について質問する')) +
        '</div>' +
        '<aside class="cr-lesson__side" aria-label="この講座の目次">' + toc(c, i, st) + '</aside>' +
        (ls === 'locked' ? '' : '<div class="cr-lesson__memo">' + memo(l) + '</div>') +
      '</div>';
  }

  function doneLine(l, ls) {
    if (ls !== 'done') return '';
    var at = doneMap()[l.id];
    return '<p class="cr-lesson__done" id="crDone" tabindex="-1">' + (at ? onDay(at) : '') + '見終わりました</p>';
  }

  /** この回の中身：説明と、この回でわかること（data.js の desc・points。運営が足した回はないこともある） */
  function about(l) {
    var pts = (Array.isArray(l.points) ? l.points : []).filter(function (p) { return p != null && String(p).trim(); });
    if (!l.desc && !pts.length) return '';
    return '<div class="cr-about">' +
      (l.desc ? '<p class="cr-about__desc">' + jp(l.desc) + '</p>' : '') +
      (pts.length ? '<ul class="cr-points">' + pts.map(function (p) { return '<li>' + jp(p) + '</li>'; }).join('') + '</ul>' : '') +
    '</div>';
  }

  /** 見終えた回の下：次の回（写真・題・分）。最後の回なら、確認テストと修了証 */
  function nextCard(c, i) {
    var nx = c.lessons[i + 1];
    if (nx) {
      var rt = R.resumeText(nx.id);
      return '<div class="card cr-next">' +
        '<span class="cr-next__img">' + coursePhoto(c, '', true) + '<span class="cr-thumb__play" aria-hidden="true">' + SVG_PLAY + '</span></span>' +
        '<div class="cr-next__body">' +
          '<p class="cr-next__over">次の回・第' + (i + 2) + '回</p>' +
          '<p class="cr-next__ttl">' + jp(nx.title) + '</p>' +
          '<p class="cr-next__meta">' + nx.min + '分' + (doneMap()[nx.id] ? '・見終わった' : rt ? '・' + esc(rt) : '') + '</p>' +
        '</div>' +
        '<a class="btn btn-primary cr-next__btn" id="crAct" data-cr-next="' + esc(nx.id) + '" href="' + lessonHref(c, nx) + '">次の回を見る</a>' +
      '</div>';
    }
    var q = R.quiz(c.id), needQuiz = q && q.ready && !(q.result && q.result.passed), cert = R.certificate(c.id);
    return '<div class="card cr-next cr-next--end">' +
      '<div class="cr-next__body">' +
        '<p class="cr-next__ttl">全' + c.lessons.length + '回を見終わりました</p>' +
        (needQuiz ? '<p class="cr-next__meta">確認テスト（' + q.total + '問）に合格すると <b class="num xp-num">+' + DATA.XP.quiz + '</b> XP</p>' : '') +
      '</div>' +
      '<div class="cr-next__btns">' +
        (needQuiz ? '<a class="btn btn-primary" id="crAct" data-cr-next="quiz" href="' + courseHref(c) + '?focus=quiz">確認テストを受ける</a>' : '') +
        (cert ? '<a class="btn ' + (needQuiz ? 'btn-ghost' : 'btn-ink') + '"' + (needQuiz ? '' : ' id="crAct" data-cr-next="cert"') + ' href="' + certHref(c) + '">修了証を見る</a>' : '') +
        '<a class="btn btn-soft" href="' + courseHref(c) + '">目次に戻る</a>' +
      '</div>' +
    '</div>';
  }

  /** 見られない回の知らせ。i はこの回の位置（0始まり） */
  function lockNotice(c, ls, st, i) {
    if (ls !== 'locked') return '';
    if (st.locked) {
      return '<div class="notice cr-lock">' + icon('lock') + '<div>' + levelNeed(c) +
        '<div class="cr-lock__btns">' + catchUpBtn() +
        '<button type="button" class="btn btn-soft" data-cr-level aria-haspopup="dialog">レベルのしくみ</button></div></div></div>';
    }
    // 開く条件は「すぐ前の回」まで見終えること。ボタンは次に見る回（まだの回がいくつかあるときは「第N回まで」と書く）
    var nx = st.next, k = nx ? lessonIndex(c, nx.id) + 1 : 1, prev = c.lessons[i - 1];
    var cond = !prev ? '前の回を見終わると開きます。'
      : nx && nx.id === prev.id ? '<span class="nw">第' + i + '回</span>「' + jp(prev.title) + '」を見終わると開きます。'
      : '<span class="nw">第' + i + '回</span>まで見終わると開きます。';
    return '<div class="notice cr-lock">' + icon('lock') + '<div>' + cond +
      '<div class="cr-lock__btns">' +
        (nx ? '<a class="btn btn-primary" href="' + lessonHref(c, nx) + '">第' + k + '回を見る</a>' : '<a class="btn btn-primary" href="' + courseHref(c) + '">目次に戻る</a>') +
      '</div></div></div>';
  }

  function memo(l) {
    return '<section class="sec cr-memo" aria-labelledby="crMemoTtl">' +
      '<h2 class="sec-ttl"><label for="crMemo" id="crMemoTtl">メモ</label><span class="cr-saved" data-cr-saved aria-live="polite"></span></h2>' +
      '<textarea id="crMemo" class="textarea" rows="4" maxlength="2000" data-cr-memo="' + esc(l.id) + '" placeholder="自分だけが見られるメモ">' + esc(R.lessonNote(l.id)) + '</textarea>' +
    '</section>';
  }

  function toc(c, cur0, st) {
    return '<h2 class="sec-ttl"><span>目次</span>' + (st.locked ? '' : '<span class="cr-ttlnote num">' + st.done + '/' + st.total + '回</span>') + '</h2>' +
      '<div class="list cr-toc">' +
        '<a class="li cr-toc__head" href="' + courseHref(c) + '"><span class="li__body"><span class="li__ttl">' + jp(c.title) + '</span></span>' + U.chevron() + '</a>' +
        c.lessons.map(function (l, i) {
          var ls = R.lessonState(c, l.id), isCur = i === cur0;
          var sub = '第' + (i + 1) + '回・' + l.min + '分' + (ls === 'done' ? '・見終わった' : '');
          var inner = '<span class="li__ico">' + stateIcon(ls) + '</span>' +
            '<span class="li__body"><span class="li__ttl">' + jp(l.title) + (ls === 'locked' ? '<span class="sr-only">（まだ見られません）</span>' : '') + '</span>' +
            '<span class="li__sub">' + jp(sub) + '</span></span>';
          // いま見ている回は押しても同じ画面なので、リンクにしない
          if (isCur) return '<div class="li has-ico cr-ls is-' + ls + ' is-current" aria-current="page">' + inner + '</div>';
          if (ls === 'locked') return '<div class="li has-ico cr-ls is-locked">' + inner + '</div>';
          return '<a class="li has-ico cr-ls is-' + ls + '" href="' + lessonHref(c, l) + '">' + inner + U.chevron() + '</a>';
        }).join('') +
      '</div>';
  }

  CLG.screens.lesson = {
    title: function (ctx) {
      var f = resolveLesson(ctx.params);
      return f.view === 'lesson' ? f.l.title : f.view === 'moved' ? 'この回は講座「' + f.c.title + '」に移りました' : f.view === 'off' ? f.off.title : 'ページが見つかりません';
    },
    render: function (ctx) { own(ctx); return '<div class="scr-lesson">' + lessonView(ctx) + '</div>'; },
    back: function (ctx) { return ctx.params[0] && R.course(ctx.params[0]) ? { href: '#/courses/' + enc(ctx.params[0]), label: '講座の目次' } : { href: '#/courses', label: '講座' }; },
    mount: function (root, ctx) {
      cur = ctx; focusDone = null;
      bindRoot(root);
      var el = root.querySelector('.scr-lesson'), f = findLesson(ctx);
      if (!el || !f) return;
      var l = f.l, ls = R.lessonState(f.c, l.id);
      ctl = bindPlayer(el.querySelector('[data-cr-player]'), {
        // 見終わっていない回だけ、前回の位置を残す（見終わった回は最初から）
        save: ls === 'open' ? function (pos, sec) { R.lessonPos(l.id, pos >= sec ? 0 : pos); } : null,
        onEnd: function () {
          if (R.lessonState(f.c, l.id) !== 'open') return;
          played[l.id] = true;
          swapGate(el, actArea({ key: l.id, id: l.id, sec: l.min * 60, xp: DATA.XP.lesson, played: true, attr: 'data-cr-complete', after: '[data-cr-next]' }));
        }
      });
    }
  };
})();
