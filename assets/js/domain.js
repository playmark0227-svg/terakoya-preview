/* ============================================================
   ルール本体（レベル・講座の開放・スタートガイド・紹介報酬・ランキング）
   ------------------------------------------------------------
   判定はすべてここに集める。画面側にはルールを書かない。
   状態は保存せず、その場で計算する（講座が開いているか、報酬がいくらか、など）。
   そうしておけば「保存し忘れて、開くはずのものが開かない」事故が起きない。

   書き換える関数は結果を返す。画面はそれを CLG.app.reward(result) に渡すと、
   XPの加算・レベルアップ・講座の開放を同じ見せ方で知らせてくれる。
   ============================================================ */
(function (global) {
  'use strict';
  var CLG = global.CLG = global.CLG || {};
  var DATA = CLG.DATA;
  var S = function () { return CLG.store.state; };

  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function nowIso() { return CLG.now().toISOString(); }
  function sameDay(a, b) { a = new Date(a); b = new Date(b); return a.toDateString() === b.toDateString(); }

  /* ---------- 会員 ---------- */
  function me() { return S().me; }
  /** 入会から何日目か（入会日が1日目） */
  function day() {
    var j = new Date(me().joinedAt); j.setHours(0, 0, 0, 0);
    var n = CLG.now(); n.setHours(0, 0, 0, 0);
    return Math.floor((n - j) / 86400000) + 1;
  }
  function person(id) {
    if (id === 'me') { var m = me(); return { name: m.name, area: m.area, color: m.color, lv: level().lv, me: true }; }
    return DATA.PEOPLE[id] || { name: '会員', color: '#8b867d' };
  }

  /** 入会した月で決まる「期」。同期どうしで見つけやすくする */
  function cohort() { var j = new Date(me().joinedAt); return j.getFullYear() + '年' + (j.getMonth() + 1) + '月期'; }
  /** 何週続けて学んでいるか（毎日ではなく週単位。忙しい人に罪悪感を持たせないため）。
      今週まだ何もしていなくても、先週まで続いていれば途切れない */
  function streak() {
    function weekStart(d) { d = new Date(d); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }
    var weeks = {};
    S().xpLog.forEach(function (l) { weeks[weekStart(l.at)] = true; });
    var w = weekStart(CLG.now()), WEEK = 7 * 86400000, n = 0, thisWeek = !!weeks[w];
    if (!thisWeek) w -= WEEK;
    while (weeks[w]) { n++; w -= WEEK; }
    return { weeks: n, thisWeek: thisWeek };
  }

  /* ---------- 学びのレベル ---------- */
  function xp() { return S().xpLog.reduce(function (a, l) { return a + l.xp; }, 0); }
  function level(x) {
    if (x == null) x = xp();
    var L = DATA.LEVELS, cur = L[0], next = null;
    for (var i = 0; i < L.length; i++) { if (x >= L[i].min) { cur = L[i]; next = L[i + 1] || null; } }
    var pct = next ? (x - cur.min) / (next.min - cur.min) * 100 : 100;
    return { lv: cur.lv, name: cur.name, min: cur.min, xp: x, next: next, toNext: next ? next.min - x : 0, pct: pct };
  }
  function levelName(lv) { var x = DATA.LEVELS.filter(function (l) { return l.lv === lv; })[0]; return x ? x.name : ''; }
  function coursesAtLevel(lv) { return DATA.COURSES.filter(function (c) { return c.level === lv; }); }

  /** XPを足す。レベルが上がったら、開いた講座も返す */
  function addXp(s, amount, why) {
    var before = level();
    s.xpLog.push({ at: nowIso(), xp: amount, why: why });
    var after = level();
    var r = { xp: amount, why: why, levelUp: null };
    if (after.lv > before.lv) {
      var unlocked = [];
      for (var lv = before.lv + 1; lv <= after.lv; lv++) unlocked = unlocked.concat(coursesAtLevel(lv));
      r.levelUp = { from: before.lv, to: after.lv, name: after.name, unlocked: unlocked };
    }
    return r;
  }
  function merge(a, b) {
    if (!a) return b; if (!b) return a;
    return {
      xp: (a.xp || 0) + (b.xp || 0),
      why: a.why || b.why,
      levelUp: b.levelUp || a.levelUp,
      courseCompleted: a.courseCompleted || b.courseCompleted,
      steps: (a.steps || []).concat(b.steps || [])
    };
  }

  /* ---------- 講座 ---------- */
  function course(id) { return byId(DATA.COURSES, id); }
  function courseState(c) {
    if (typeof c === 'string') c = course(c);
    var s = S(), lv = level().lv;
    var done = c.lessons.filter(function (l) { return s.done[l.id]; }).length;
    var next = null;
    for (var i = 0; i < c.lessons.length; i++) { if (!s.done[c.lessons[i].id]) { next = c.lessons[i]; break; } }
    var locked = c.level > lv;
    return {
      locked: locked,
      lockReason: locked ? 'Lv' + c.level + '「' + levelName(c.level) + '」で開きます' : '',
      done: done, total: c.lessons.length, pct: done / c.lessons.length * 100,
      completed: done === c.lessons.length, started: done > 0, next: next,
      minutes: c.lessons.reduce(function (a, l) { return a + l.min; }, 0)
    };
  }
  /** 'done' / 'open' / 'locked'。講座の中は1本ずつ順に開く */
  function lessonState(c, lessonId) {
    if (typeof c === 'string') c = course(c);
    var s = S();
    if (c.level > level().lv) return 'locked';
    for (var i = 0; i < c.lessons.length; i++) {
      if (c.lessons[i].id !== lessonId) continue;
      if (s.done[lessonId]) return 'done';
      if (i === 0 || s.done[c.lessons[i - 1].id]) return 'open';
      return 'locked';
    }
    return 'locked';
  }
  function completeLesson(courseId, lessonId) {
    var c = course(courseId), l = byId(c.lessons, lessonId);
    if (!l || lessonState(c, lessonId) !== 'open') return null;
    var r = CLG.store.update(function (s) {
      s.done[lessonId] = nowIso();
      var x = addXp(s, DATA.XP.lesson, '講座「' + c.title + '」' + l.title);
      if (courseState(c).completed) x.courseCompleted = c;
      return x;
    });
    return merge(r, syncSteps());
  }
  /** 続きから見る講座（始めていて終わっていないもの → なければ開いていて未着手のもの） */
  function continueList() {
    var list = DATA.COURSES.map(function (c) { return { c: c, st: courseState(c) }; })
      .filter(function (x) { return !x.st.locked && !x.st.completed; });
    list.sort(function (a, b) { return (b.st.started - a.st.started) || (a.c.level - b.c.level); });
    return list;
  }
  function seeArchive(id) {
    var a = byId(DATA.ARCHIVE, id);
    if (!a || S().archiveSeen[id]) return null;
    return CLG.store.update(function (s) {
      s.archiveSeen[id] = nowIso();
      return addXp(s, DATA.XP.archive, 'アーカイブ「' + a.title + '」');
    });
  }

  /* ---------- スタートガイド（最初の30日） ---------- */
  function autoDone(step) {
    var s = S();
    if (!step.auto) return false;
    var p = step.auto.split(':');
    if (p[0] === 'course') return courseState(p[1]).completed;
    if (p[0] === 'lessons') return Object.keys(s.done).length >= +p[1];
    if (p[0] === 'post') return s.posts.some(function (x) { return x.kind === p[1]; });
    if (p[0] === 'gig') return Object.keys(s.gigs).length > 0;
    if (p[0] === 'event' && p[1] === 'any') return s.attended.length > 0;
    if (p[0] === 'event' && p[1] === 'showcase') return s.attended.some(function (a) { var e = byId(DATA.EVENTS, a.id); return e && e.kind === 'showcase'; });
    return false;
  }
  function steps() {
    var s = S();
    return DATA.ONBOARDING.map(function (st) {
      return Object.assign({}, st, { done: !!s.steps[st.id], doneAt: s.steps[st.id] || null });
    });
  }
  function onboarding() {
    var list = steps();
    var done = list.filter(function (x) { return x.done; }).length;
    return { steps: list, done: done, total: list.length, pct: done / list.length * 100, day: day(),
      current: list.filter(function (x) { return !x.done; })[0] || null, finished: done === list.length };
  }
  /** 自動で済になる項目を確かめて、済にしたものにXPを付ける */
  function syncSteps() {
    var newly = DATA.ONBOARDING.filter(function (st) { return !S().steps[st.id] && autoDone(st); });
    if (!newly.length) return null;
    return CLG.store.update(function (s) {
      var r = null;
      newly.forEach(function (st) {
        s.steps[st.id] = nowIso();
        var x = addXp(s, st.xp, 'スタートガイド「' + st.title + '」');
        x.steps = [st];
        r = merge(r, x);
      });
      return r;
    });
  }
  /** 手で済にする項目（プロフィール・LINE・目標・面談） */
  function completeStep(id) {
    var st = byId(DATA.ONBOARDING, id);
    if (!st || S().steps[id]) return null;
    return CLG.store.update(function (s) {
      s.steps[id] = nowIso();
      var x = addXp(s, st.xp, 'スタートガイド「' + st.title + '」');
      x.steps = [st];
      return x;
    });
  }
  function setGoal(what, by) {
    CLG.store.update(function (s) { s.goal30 = { what: what, by: by }; s.me.goal = what; });
    return completeStep('goal');
  }
  function saveProfile(patch) {
    CLG.store.update(function (s) { Object.assign(s.me, patch); });
    // 通知の切り替えなど、プロフィール以外を保存したときは済にしない
    var touched = ['name', 'area', 'job'].some(function (k) { return k in (patch || {}); });
    var m = me();
    if (touched && m.name && m.area && m.job) return completeStep('profile');
    return null;
  }
  function linkLine(on) {
    CLG.store.update(function (s) { s.me.lineLinked = on !== false; });
    return on === false ? null : completeStep('line');
  }

  /* ---------- タイムライン ---------- */
  function feed(kind) {
    var s = S();
    var mine = s.posts.map(function (p) { return Object.assign({ by: 'me', mine: true }, p); });
    var all = DATA.FEED.concat(mine).map(function (p) {
      var liked = !!s.likes[p.id];
      // data.js の likes は「自分以外」の数。自分が押していれば1足す
      return Object.assign({}, p, { liked: liked, likeCount: (p.likes || 0) + (liked ? 1 : 0) });
    });
    if (kind && kind !== 'all') all = all.filter(function (p) { return p.kind === kind || (kind === 'post' && p.kind === 'intro'); });
    all.sort(function (a, b) { return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || new Date(b.at) - new Date(a.at); });
    return all;
  }
  function toggleLike(postId) {
    CLG.store.update(function (s) { if (s.likes[postId]) delete s.likes[postId]; else s.likes[postId] = true; });
    return !!S().likes[postId];
  }
  /** 投稿する。kind: post / win / intro。XPは1日3回まで */
  function addPost(text, kind) {
    text = String(text || '').trim();
    if (!text) return null;
    var r = CLG.store.update(function (s) {
      var todays = s.posts.filter(function (p) { return sameDay(p.at, CLG.now()); });
      var winToday = todays.some(function (p) { return p.kind === 'win'; });
      s.posts.push({ id: 'my' + Date.now(), kind: kind || 'post', text: text, at: nowIso(), likes: 0, comments: 0 });
      if (kind === 'win' && !winToday) {
        var rule = byId(DATA.POINT_RULES, 'win');
        if (rule) s.pointsLog.push({ at: nowIso(), pt: rule.pt, why: rule.name });
      }
      return todays.length < DATA.XP.postPerDay ? addXp(s, DATA.XP.post, 'タイムラインに投稿') : { xp: 0 };
    });
    return merge(r, syncSteps());
  }
  function introText() {
    var m = me();
    return DATA.INTRO_TEMPLATE.replace('{name}', m.name || '').replace('{area}', m.area || '').replace('{job}', m.job || '').replace('{goal}', m.goal || '');
  }

  /* ---------- 案件 ---------- */
  function gig(id) { return byId(DATA.GIGS, id); }
  /** 応募できるか。レベルと、必要な講座の修了で決まる */
  function gigLock(g) {
    if (typeof g === 'string') g = gig(g);
    var lv = level().lv;
    if (g.level > lv) return { locked: true, reason: 'Lv' + g.level + 'から応募できます' };
    if (g.requires && !courseState(g.requires).completed) return { locked: true, reason: '講座「' + course(g.requires).title + '」の修了で応募できます', course: g.requires };
    return { locked: false };
  }
  var GIG_STATUS = { applied: '応募済み・運営が確認中', meeting: '面談の日程調整中', active: '稼働中', done: 'やり終えた' };
  var GIG_APPLIED = { refer: 'つなぎ依頼済み・運営が確認中', peer: '応募済み・募集した会員に連絡中' };
  function gigState(id) {
    var x = S().gigs[id], g = gig(id);
    if (!x) return null;
    var label = x.status === 'applied' && g && GIG_APPLIED[g.type] ? GIG_APPLIED[g.type] : GIG_STATUS[x.status];
    return Object.assign({ label: label }, x);
  }
  function applyGig(id, note) {
    var g = gig(id);
    if (!g || gigLock(g).locked || S().gigs[id]) return null;
    CLG.store.update(function (s) { s.gigs[id] = { status: 'applied', at: nowIso(), note: note || '' }; });
    return syncSteps() || { xp: 0 };
  }
  function withdrawGig(id) { CLG.store.update(function (s) { if (s.gigs[id] && s.gigs[id].status === 'applied') delete s.gigs[id]; }); }
  /** 案件で得た報酬（確定分）の合計 */
  function gigEarnings() {
    var s = S();
    return Object.keys(s.gigs).reduce(function (a, k) { return a + (s.gigs[k].reward || 0); }, 0);
  }

  /* ---------- イベント ---------- */
  function event(id) { return byId(DATA.EVENTS, id); }
  function isReserved(id) { return !!S().events[id]; }
  function isFull(e) { if (typeof e === 'string') e = event(e); return !!e && e.count >= e.cap; }
  function attended(id) { return S().attended.some(function (a) { return a.id === id; }); }
  /** 予約する。満席なら null */
  function reserve(id) {
    if (isFull(id) || attended(id)) return null;
    CLG.store.update(function (s) { s.events[id] = nowIso(); });
    return { xp: 0 };
  }
  function unreserve(id) { CLG.store.update(function (s) { delete s.events[id]; }); }
  function upcoming() {
    var now = CLG.now();
    return DATA.EVENTS.filter(function (e) { return new Date(e.at) > now && !attended(e.id); })
      .sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
  }
  function myUpcoming() { return upcoming().filter(function (e) { return isReserved(e.id); }); }
  /** 試作版だけ：予約中のイベントに「参加したことにする」（本番は出欠を運営が付ける） */
  function attend(id) {
    var e = event(id);
    if (!e || S().attended.some(function (a) { return a.id === id; })) return null;
    var r = CLG.store.update(function (s) {
      s.attended.push({ id: id, title: e.title, at: e.at });
      delete s.events[id];
      return addXp(s, DATA.XP.event, 'イベント「' + e.title + '」に参加');
    });
    return merge(r, syncSteps());
  }

  /* ---------- 紹介プログラム ----------
     報酬の明細は、紹介した人ごと・月ごとに作る。
     状態：hold（保留：初回決済から30日以内）→ confirmed（確定）→ scheduled（支払予定）→ paid（支払済）／ void（取消） */
  var REWARD_STATUS = { hold: '保留', confirmed: '確定', scheduled: '支払予定', paid: '支払済', void: '取消' };
  function initials(name) {
    var kana = { '佐々木': 'S', '清水': 'S', '山本': 'Y', '伊藤': 'I', '渡辺': 'W', '中島': 'N', '小川': 'O', '井上': 'I', '木村': 'K', '林': 'H', '山口': 'Y', '松田': 'M', '岡田': 'O', '藤井': 'F' };
    var fam = String(name || '').split(/\s+/)[0];
    return (kana[fam] || fam.charAt(0)) + '.さん';
  }
  /** 支払日（土日なら次の月曜） */
  function payDateAfter(closing) {
    var d = new Date(closing.getFullYear(), closing.getMonth() + 1, DATA.REFERRAL.payDay, 10);
    if (d.getDay() === 6) d.setDate(d.getDate() + 2);
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    return d;
  }
  /** 明細の1行 = 紹介した人の1回ぶんの決済。
      決済から holdDays 日は保留 → 確定 → その月末で締めて支払予定 → 支払日を過ぎたら支払済。
      保留中に退会・返金があれば取消。 */
  function rewardRows() {
    var s = S(), RF = DATA.REFERRAL, now = CLG.now(), rows = [], DAY = 86400000;
    s.referred.forEach(function (r) {
      var joined = new Date(r.joinedAt);
      var left = r.leftAt ? new Date(r.leftAt) : null;
      var months = RF.model === 'once' ? 1 : Math.max(1, Math.floor(((left || now) - joined) / (30 * DAY)) + 1);
      for (var i = 0; i < months; i++) {
        var at = new Date(joined.getTime() + i * 30 * DAY);
        if (at > now) break;
        var confirmAt = new Date(at.getTime() + RF.holdDays * DAY);
        var closing = new Date(confirmAt.getFullYear(), confirmAt.getMonth() + 1, 0, 23, 59);
        var pay = payDateAfter(closing);
        var status;
        if (left && left < confirmAt) status = 'void';
        else if (now < confirmAt) status = 'hold';
        else if (now >= pay) status = 'paid';
        else if (now > closing) status = 'scheduled';
        else status = 'confirmed';
        var amount = RF.model === 'once' ? RF.onceAmount : Math.round(DATA.SITE.price * RF.rate);
        rows.push({ ref: r.id, who: initials(person(r.person).name), at: at.toISOString(), amount: amount,
          status: status, label: REWARD_STATUS[status], confirmAt: confirmAt.toISOString(), payAt: pay.toISOString() });
      }
    });
    return rows.sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
  }
  function referral() {
    var s = S(), m = me(), RF = DATA.REFERRAL, now = CLG.now();
    var list = s.referred.map(function (r) {
      var p = person(r.person);
      var held = (now - new Date(r.joinedAt)) / 86400000 < RF.holdDays;
      return Object.assign({ who: initials(p.name), held: held,
        confirmAt: new Date(new Date(r.joinedAt).getTime() + RF.holdDays * 86400000).toISOString() }, r);
    });
    var active = list.filter(function (r) { return r.status === 'active'; });
    var per = RF.model === 'once' ? RF.onceAmount : Math.round(DATA.SITE.price * RF.rate);
    var rows = rewardRows();
    var sum = function (st) { return rows.filter(function (x) { return st.indexOf(x.status) >= 0; }).reduce(function (a, x) { return a + x.amount; }, 0); };
    // 次の支払日：確定・支払予定の明細のうち、いちばん早いもの。無ければ最初に確定する明細の支払日
    var pending = rows.filter(function (x) { return x.status === 'confirmed' || x.status === 'scheduled'; });
    if (!pending.length) pending = rows.filter(function (x) { return x.status === 'hold'; });
    pending.sort(function (a, b) { return new Date(a.payAt) - new Date(b.payAt); });
    var pay = pending.length ? new Date(pending[0].payAt) : null;
    return {
      code: m.refCode,
      url: DATA.SITE.siteUrl + '?ref=' + encodeURIComponent(m.refCode),
      model: RF.model, rate: RF.rate, perPerson: per, holdDays: RF.holdDays, minPayout: RF.minPayout,
      list: list, active: active.length,
      monthly: RF.model === 'once' ? 0 : active.length * per,
      held: sum(['hold']), confirmed: sum(['confirmed', 'scheduled']), paid: sum(['paid']),
      rows: rows, clicks: s.refClicks || 0,
      recent: list.filter(function (r) { return (now - new Date(r.joinedAt)) / 86400000 <= 30; }).length,
      payDate: pay ? pay.toISOString() : null, closeLabel: '月末締め・翌月' + RF.payDay + '日払い（土日は翌営業日）',
      shareText: DATA.SHARE_TEMPLATE.replace('{site}', DATA.SITE.name).replace('{price}', DATA.SITE.price.toLocaleString('ja-JP'))
        .replace('{url}', DATA.SITE.siteUrl + '?ref=' + encodeURIComponent(m.refCode))
    };
  }

  /* ---------- 貢献ポイントとランキング ---------- */
  /** total：有効な合計（付与から1年）／recent：直近30日（ランキングに使う） */
  function points() {
    var now = CLG.now(), DAY = 86400000;
    var log = S().pointsLog.filter(function (l) { return (now - new Date(l.at)) / DAY <= 365; })
      .sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
    var sum = function (list) { return list.reduce(function (a, l) { return a + l.pt; }, 0); };
    return { total: sum(log), recent: sum(log.filter(function (l) { return (now - new Date(l.at)) / DAY <= 30; })), log: log };
  }
  /** kind: 'points'（貢献）/ 'xp'（今月の学び） */
  function ranking(kind) {
    var monthXp = S().xpLog.filter(function (l) { return (CLG.now() - new Date(l.at)) / 86400000 <= 30; })
      .reduce(function (a, l) { return a + l.xp; }, 0);
    var rows = DATA.RANKING.map(function (r) {
      var p = DATA.PEOPLE[r.person];
      return { person: r.person, name: p.name, area: p.area, color: p.color, lv: p.lv, value: kind === 'xp' ? r.xp : r.points, me: false };
    });
    var m = me();
    rows.push({ person: 'me', name: m.name, area: m.area, color: m.color, lv: level().lv, value: kind === 'xp' ? monthXp : points().recent, me: true });
    rows.sort(function (a, b) { return b.value - a.value || (a.me ? -1 : 1); });
    rows.forEach(function (r, i) { r.rank = i + 1; });
    return rows;
  }

  /* ---------- メッセージ ---------- */
  function thread() { return S().thread; }
  function unread() {
    var s = S(), since = s.threadRead ? new Date(s.threadRead) : null;
    return s.thread.filter(function (m) { return m.from !== 'me' && (!since || new Date(m.at) > since); }).length;
  }
  function markRead() {
    CLG.store.update(function (s) { s.threadRead = nowIso(); });
  }
  /** 送る。試作版は数秒後に運営の自動返信が届く */
  function sendMessage(text, kind) {
    text = String(text || '').trim();
    if (!text) return Promise.resolve(null);
    CLG.store.update(function (s) { s.thread.push({ from: 'me', at: nowIso(), text: text, kind: kind || '' }); s.threadRead = nowIso(); });
    var step = kind === '面談の予約' ? completeStep('meet') : null;
    var sentFrom = S();
    return new Promise(function (resolve) {
      setTimeout(function () {
        // 待っているあいだに「デモを最初から」などで別の会員になっていたら、返事は捨てる
        if (S() !== sentFrom) { resolve(null); return; }
        var reply = kind === '面談の予約'
          ? '面談のご予約ありがとうございます。候補の日時を3つお送りしますね。\n（試作版の自動返信です。本番では運営が返信します）'
          : kind === '壁打ち・相談'
            ? 'ありがとうございます。じっくり読んで、今日中にお返事します。必要なら15分だけ通話もできます。\n（試作版の自動返信です。本番では運営が返信します）'
            : 'メッセージありがとうございます。確認して、今日中にお返事します。\n（試作版の自動返信です。本番では運営が返信します）';
        // 既読にはしない。メッセージ画面を開いていれば、その画面が既読にする
        CLG.store.update(function (s) { s.thread.push({ from: 'staff2', at: nowIso(), text: reply }); });
        resolve(step);
      }, 1600);
    });
  }

  /* ---------- お知らせ（右上の鈴） ---------- */
  function notices() {
    var s = S(), since = s.noticesRead ? new Date(s.noticesRead) : null;
    var list = s.kind === 'demo' ? DATA.NOTICES.slice() : [
      { id: 'w1', icon: 'flag', text: 'ようこそ！まずはスタートガイドから進めてみましょう', at: s.me.joinedAt, go: '#/start' }
    ];
    list.sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
    return list.map(function (n) { return Object.assign({ unread: !since || new Date(n.at) > since }, n); });
  }
  function unreadNotices() { return notices().filter(function (n) { return n.unread; }).length; }
  function markNoticesRead() { CLG.store.update(function (s) { s.noticesRead = nowIso(); }); }

  /* ---------- 支払い ---------- */
  function addMonths(d, n) { d = new Date(d); var day0 = d.getDate(); d.setMonth(d.getMonth() + n); if (d.getDate() < day0) d.setDate(0); return d; }
  function plan() {
    var s = S(), joined = new Date(me().joinedAt), now = CLG.now();
    var n = 1, next = addMonths(joined, 1);
    while (next <= now) { n++; next = addMonths(joined, n); }
    var canceling = s.plan.status === 'canceling' && s.plan.cancelAt;
    var ended = canceling && new Date(s.plan.cancelAt) <= now;
    return {
      status: ended ? 'ended' : s.plan.status, price: DATA.SITE.price, card: me().card,
      nextBill: canceling ? null : next.toISOString(),
      periodEnd: canceling ? s.plan.cancelAt : next.toISOString(), cancelAt: s.plan.cancelAt
    };
  }
  function invoices() { return S().invoices.slice().sort(function (a, b) { return new Date(b.at) - new Date(a.at); }); }
  /** 解約は「次の請求日の前日まで使えて、そこで終わる」。途中の返金・違約金はなし */
  function cancelPlan() { var p = plan(); CLG.store.update(function (s) { s.plan = { status: 'canceling', cancelAt: p.periodEnd }; }); return plan(); }
  function resumePlan() { CLG.store.update(function (s) { s.plan = { status: 'active', cancelAt: null }; }); return plan(); }
  /** 解約前に見せる「まだ使っていないもの」 */
  function unusedSummary() {
    var open = DATA.COURSES.filter(function (c) { var st = courseState(c); return !st.locked && !st.completed; });
    return {
      courses: open.length,
      // まだ見ていない回だけの分数
      minutes: open.reduce(function (a, c) { return a + c.lessons.filter(function (l) { return !S().done[l.id]; }).reduce(function (x, l) { return x + l.min; }, 0); }, 0),
      events: upcoming().length,
      referralMonthly: referral().monthly,
      perks: DATA.PERKS.length
    };
  }

  CLG.rules = {
    me: me, day: day, person: person, cohort: cohort, streak: streak,
    xp: xp, level: level, levelName: levelName, coursesAtLevel: coursesAtLevel,
    course: course, courseState: courseState, lessonState: lessonState, completeLesson: completeLesson,
    continueList: continueList, seeArchive: seeArchive,
    steps: steps, onboarding: onboarding, syncSteps: syncSteps, completeStep: completeStep,
    setGoal: setGoal, saveProfile: saveProfile, linkLine: linkLine,
    feed: feed, toggleLike: toggleLike, addPost: addPost, introText: introText,
    gig: gig, gigLock: gigLock, gigState: gigState, applyGig: applyGig, withdrawGig: withdrawGig, gigEarnings: gigEarnings,
    event: event, isReserved: isReserved, isFull: isFull, attended: attended, reserve: reserve, unreserve: unreserve, upcoming: upcoming, myUpcoming: myUpcoming, attend: attend,
    referral: referral, rewardRows: rewardRows,
    points: points, ranking: ranking,
    thread: thread, unread: unread, markRead: markRead, sendMessage: sendMessage,
    notices: notices, unreadNotices: unreadNotices, markNoticesRead: markNoticesRead,
    plan: plan, invoices: invoices, cancelPlan: cancelPlan, resumePlan: resumePlan, unusedSummary: unusedSummary
  };
})(window);
