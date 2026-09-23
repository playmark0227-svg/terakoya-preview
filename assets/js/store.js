/* ============================================================
   保存層（試作版はこのブラウザの localStorage だけ）
   ------------------------------------------------------------
   本番ではここを Firestore などに差し替える。画面とルールは
   CLG.store.state を読み、CLG.store.update() で書く約束にしてあるので、
   差し替えてもほかのファイルは直さなくていい。
   ============================================================ */
(function (global) {
  'use strict';
  var CLG = global.CLG = global.CLG || {};
  var DATA = CLG.DATA;
  var KEY = 'terakoya-proto-v1';
  var listeners = [];

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function daysAgo(n, hh, mm) { return DATA.D(-n, hh, mm); }

  /* ---------- デモ会員（高橋さくら・入会24日目）の状態 ----------
     XPの合計は530（Lv3）。講座をあと2本見るとLv4になり、講座が4つ開く。
     打ち合わせで「見終わる → レベルが上がる → 次が開く」をその場で見せるための設定。 */
  function demoState() {
    var M = DATA.MEMBER;
    var joinedAt = daysAgo(M.joinedDaysAgo, 21, 12);
    var s = blank({
      id: M.id, name: M.name, kana: M.kana, area: M.area, job: M.job, goal: M.goal,
      joinedAt: joinedAt, color: M.color, refCode: M.refCode, email: M.email, card: M.card,
      lineLinked: true
    });
    s.kind = 'demo';

    function log(at, xp, why) { s.xpLog.push({ at: at, xp: xp, why: why }); }

    // 見終えた講座（14本）
    var watched = [
      ['orientation', 4, 22], ['business-basic', 5, 19], ['okozukai', 3, 14], ['sns-basic', 2, 4]
    ];
    watched.forEach(function (w) {
      var c = DATA.COURSES.filter(function (x) { return x.id === w[0]; })[0];
      c.lessons.slice(0, w[1]).forEach(function (l, i) {
        var at = daysAgo(Math.max(1, w[2] - i), 22, 10 + i * 3);
        s.done[l.id] = at;
        log(at, DATA.XP.lesson, '講座「' + c.title + '」' + l.title);
      });
    });

    // スタートガイド
    [['profile', 23], ['orient', 18], ['line', 23], ['intro', 22], ['goal', 16], ['meet', 15], ['lesson3', 21], ['gig', 12], ['event', 20]]
      .forEach(function (p) {
        var st = DATA.ONBOARDING.filter(function (x) { return x.id === p[0]; })[0];
        var at = daysAgo(p[1], 21, 30);
        s.steps[st.id] = at;
        log(at, st.xp, 'スタートガイド「' + st.title + '」');
      });
    s.goal30 = { what: '動画編集の講座を修了して、最初の編集案件に応募する', by: DATA.D(7, 23, 59) };

    // イベント参加（2回）
    DATA.PAST_EVENTS.forEach(function (e) {
      s.attended.push({ id: e.id, title: e.title, at: e.at });
      log(e.at, DATA.XP.event, 'イベント「' + e.title + '」に参加');
    });

    // 勉強会アーカイブ（2本）
    [['ar-5', 10], ['ar-1', 1]].forEach(function (x) {
      var id = x[0], at = daysAgo(x[1], 21, 30);
      s.archiveSeen[id] = at;
      var a = DATA.ARCHIVE.filter(function (x) { return x.id === id; })[0];
      log(at, DATA.XP.archive, 'アーカイブ「' + a.title + '」');
    });

    // 自分の投稿（2件）
    s.posts.push({ id: 'my1', kind: 'intro', at: daysAgo(22, 22, 40), likes: 21, comments: 7,
      text: 'はじめまして、高橋さくらです。\n住んでいるところ：北海道 旭川市\nいまのお仕事：会社員（事務）・2児の母\nここでやりたいこと：在宅で、月3万円の副収入をつくる\nよろしくお願いします！' });
    log(daysAgo(22, 22, 40), DATA.XP.post, 'タイムラインに投稿');
    s.posts.push({ id: 'my2', kind: 'win', at: daysAgo(11, 21, 5), likes: 16, comments: 3,
      text: 'お小遣い案件の商品モニター、はじめての報酬が確定しました！金額は小さいけど、自分で稼いだ1,200円はうれしい。' });
    log(daysAgo(11, 21, 5), DATA.XP.post, 'タイムラインに投稿');

    // 案件
    s.gigs.g1 = { status: 'done', at: daysAgo(14), reward: 1200, doneAt: daysAgo(11) };
    log(daysAgo(11, 21), DATA.XP.gigDone, '案件「' + DATA.GIGS[0].title + '」をやり終えた');
    s.gigs.g2 = { status: 'applied', at: daysAgo(2, 12), note: '平日の夜なら参加できます' };

    // イベントの予約
    s.events.e2 = daysAgo(2, 20);
    s.events.e4 = daysAgo(5, 20);

    // 紹介
    s.referred = DATA.REFERRED.map(function (r) {
      return { id: r.id, person: r.person, joinedAt: daysAgo(r.joinedDaysAgo, 20), status: r.status };
    });
    s.refClicks = DATA.REF_CLICKS;

    // 貢献ポイント（合計140。紹介ではポイントは付かない）
    s.pointsLog = [
      { at: daysAgo(18, 20), pt: 50, why: 'オンライン勉強会の受付を手伝った' },
      { at: daysAgo(11, 21), pt: 20, why: '成果を報告した' },
      { at: daysAgo(9, 22), pt: 10, why: 'タイムラインで質問に答えた' },
      { at: daysAgo(7, 21), pt: 10, why: 'タイムラインで質問に答えた' },
      { at: daysAgo(5, 21), pt: 10, why: 'タイムラインで質問に答えた' },
      { at: daysAgo(4, 12), pt: 5, why: '新入生に声をかけた' },
      { at: daysAgo(3, 12), pt: 5, why: '新入生に声をかけた' },
      { at: daysAgo(3, 20), pt: 10, why: 'タイムラインで質問に答えた' },
      { at: daysAgo(2, 12), pt: 5, why: '新入生に声をかけた' },
      { at: daysAgo(2, 21), pt: 2, why: '「ありがとう」を受け取った' },
      { at: daysAgo(2, 22), pt: 2, why: '「ありがとう」を受け取った' },
      { at: daysAgo(1, 12), pt: 5, why: '新入生に声をかけた' },
      { at: daysAgo(1, 21), pt: 2, why: '「ありがとう」を受け取った' },
      { at: daysAgo(1, 21, 30), pt: 2, why: '「ありがとう」を受け取った' },
      { at: daysAgo(1, 22), pt: 2, why: '「ありがとう」を受け取った' }
    ];

    s.likes = { p9: true, p6: true };
    s.thread = clone(DATA.THREAD);
    s.threadRead = daysAgo(3, 14, 0);   // 最後の1通だけ未読
    s.invoices = [{ id: 'in_' + M.id + '_1', at: joinedAt, amount: DATA.SITE.price, status: 'paid' }];
    s.seenLevel = 3;
    return s;
  }

  /* ---------- 何もしていない状態（公開サイトから入会した人） ---------- */
  function blank(me) {
    return {
      v: 1,
      kind: 'fresh',
      session: false,
      me: me,
      done: {}, archiveSeen: {}, steps: {}, xpLog: [],
      posts: [], likes: {}, gigs: {}, events: {}, attended: [],
      thread: [], threadRead: null, noticesRead: null,
      referred: [], refClicks: 0, pointsLog: [],
      plan: { status: 'active', cancelAt: null },
      invoices: [], goal30: null, seenLevel: 1, referredBy: null
    };
  }

  /** 公開サイトの入会フォームから作る新しい会員 */
  function freshState(form) {
    var now = CLG.now().toISOString();
    var seq = String(Math.floor(200 + (Date.now() % 700))).padStart(6, '0');
    var code = (String(form.name || '').replace(/\s/g, '').slice(0, 4) || 'NEW').toUpperCase() + seq.slice(-3);
    var s = blank({
      id: 'TK-' + seq, name: form.name || '新しい会員', kana: form.kana || '', area: form.area || '', job: form.job || '',
      goal: '', joinedAt: now, color: '#274868', refCode: /^[\x20-\x7e]+$/.test(code) ? code : 'MEMBER' + seq.slice(-3),
      email: form.email || '', card: form.card || 'Visa •••• 4242', lineLinked: false
    });
    s.session = true;
    s.referredBy = form.ref || null;
    s.thread = [{ from: 'staff2', at: now,
      text: (form.name || '') + 'さん、ご入会ありがとうございます！コミュニティ運営の佐藤です。\n' +
        'まずは「スタートガイド」を上から進めてみてください。最初の1週間で、この場所の使い方がひと通り分かるようになっています。\n' +
        '分からないことは、このメッセージでいつでも聞いてください。回数の制限はありません。' }];
    s.invoices = [{ id: 'in_' + seq + '_1', at: now, amount: DATA.SITE.price, status: 'paid' }];
    return s;
  }

  /* ---------- 読み書き ---------- */
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var s = JSON.parse(raw);
        if (s && s.v === 1) return s;
      }
    } catch (e) {}
    return null;
  }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(store.state)); } catch (e) {}
  }

  var store = {
    state: load() || demoState(),
    /** fn(state) の中で書き換える。終わったら保存して、画面に知らせる */
    update: function (fn) {
      var r = fn(store.state);
      persist();
      listeners.forEach(function (l) { try { l(store.state); } catch (e) { console.error(e); } });
      return r;
    },
    save: persist,
    on: function (fn) { listeners.push(fn); },
    /** デモ会員に戻す */
    resetDemo: function (keepSession) {
      store.state = demoState();
      store.state.session = !!keepSession;
      persist();
    },
    /** 入会フォームから新しい会員として始める */
    startFresh: function (form) {
      store.state = freshState(form || {});
      persist();
    },
    logout: function () { store.update(function (s) { s.session = false; }); },
    login: function () { store.update(function (s) { s.session = true; }); }
  };

  CLG.store = store;
})(window);
