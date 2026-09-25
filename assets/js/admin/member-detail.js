/* ============================================================
   運営画面：会員の詳細（#/members/<会員番号>?tab=…）→ AD.screens.member
   ------------------------------------------------------------
   上：名前・会員番号・入会月・状態と、よく見る数字（レベル・XP・スタートガイド・最後のログイン・今月のpt・紹介）。
   支払いエラー・解約予定・終了・ログイン停止のときは、その知らせをいちばん上に出す。
   タブ（?tab=）：profile プロフィール / pay 契約と支払い / xp XPとレベル / courses 講座の進み / gigs 案件とイベント /
                  ref 紹介 / points 貢献ポイント / msg メッセージ / memo 運営メモとタグ
   - デモ会員（会員ページで開いている人）は CLG.store の本当の記録を読む。書くのは R.*（会員ページのタブに届く）。
   - 名簿のほかの人は、講座の進み・XPの記録・参加したイベントを XP とスタートガイドの数から決まった形で作る
     （名簿には人ごとの記録がないため。会員番号ごとに毎回同じ中身になる）。
   - お金・ポイント・契約・ログインを変える操作は AU.act で理由を書いてもらい、操作の記録に残す。
     返金・ログインの停止・ポイント・記録の申込みは AD.ops（refund / setSuspended / grantPoints / revokePoints / completeDataRequest）を通す。
     デモ会員なら会員ページにも効き（R.refundInvoice・R.setLoginBlocked・R.grantPoints・R.completeDataRequest）、支払いの画面と同じ操作の記録になる。
   - デモ会員が会員ページのアカウントから出した「記録の書き出し・削除」の申込みは、プロフィールのタブに出す（受付中は先頭に「済みにする」）。
   - 役割（設定の「役割でできること」）：メッセージ・連絡・契約・ログイン・メモは members、返金・やり直し・領収書は money、
     ポイントは points。できない操作のボタンは押せないようにする（講師・経理）。
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, AD = CLG.admin, AU = AD.ui, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon, P = AD.people;
  var cur = null;
  var DAY = 86400000;
  var TABS = [['profile', 'プロフィール'], ['pay', '契約と支払い'], ['xp', 'XPとレベル'], ['courses', '講座の進み'], ['gigs', '案件とイベント'],
    ['ref', '紹介'], ['points', '貢献ポイント'], ['msg', 'メッセージ'], ['memo', '運営メモとタグ']];
  var CANCEL_REASONS = ['時間がない', '料金', '内容が合わない', '目的を達成した', 'その他'];

  function find(ctx) { return ctx.data.member(ctx.params[0]); }
  function nowIso() { return CLG.now().toISOString(); }
  function byId(list, id) { for (var i = 0; list && i < list.length; i++) if (list[i] && list[i].id === id) return list[i]; return null; }
  function staffId() { var s = AD.db.staff(); return s ? s.id : AD.db.DEMO_STAFF; }
  function mt(m) { return { type: 'member', id: m.no, name: m.name }; }
  function hash(s) { var h = 0; String(s).split('').forEach(function (c) { h = (h * 31 + c.charCodeAt(0)) >>> 0; }); return h; }
  function sortDesc(list) { return list.sort(function (a, b) { return new Date(b.at) - new Date(a.at); }); }
  function yen(n) { return U.yen(n); }
  function dateY(d) { return d ? U.fmtDate(d, { wd: false }) : ''; }
  function lessonNo(c, l) { return '第' + (c.lessons.indexOf(l) + 1) + '回'; }
  function staffLabel(id) {
    if (!id) return '―';
    if (id === 'staff') return '運営';
    return (DATA.PEOPLE[id] && DATA.PEOPLE[id].name) || AD.db.staffName(id);
  }
  function tabHref(m, id) { return '#/members/' + encodeURIComponent(m.no) + (id && id !== 'profile' ? '?tab=' + id : ''); }

  /* ============================================================
     記録（講座・XP・イベント）
     ============================================================ */
  var cache = {};
  function activity(m) {
    if (m.live) return liveActivity();
    var key = [m.xp, m.level, m.stepsDone, m.joinedAt, m.lastActive, m.leftAt].join('|');
    if (cache[m.no] && cache[m.no].key === key) return cache[m.no].v;
    var v = synth(m);
    cache[m.no] = { key: key, v: v };
    return v;
  }
  function liveActivity() {
    var s = CLG.store.state, n = CLG.now();
    var log = (s.xpLog || []).filter(function (l) { return new Date(l.at) <= n; })
      .map(function (l, i) { return { id: 'x' + i, at: l.at, xp: l.xp || 0, why: l.why || '', link: l.link || '' }; });
    var courses = DATA.COURSES.map(function (c) {
      var st = R.courseState(c), last = null;
      c.lessons.forEach(function (l) { var t = s.done[l.id]; if (t && (!last || new Date(t) > new Date(last))) last = t; });
      return { c: c, done: st.done, total: st.total, locked: st.locked, completed: st.completed, last: last, next: st.next, quiz: (s.quiz || {})[c.id] || null };
    });
    var attended = (s.attended || []).map(function (a) {
      var e = R.event(a.id);
      return { id: a.id, title: a.title || (e && e.title) || 'イベント', at: a.at || (e && e.at), kind: a.kind || (e && e.kind) || '' };
    }).filter(function (x) { return x.at; });
    var reserved = Object.keys(s.events || {}).map(function (id) { return R.event(id); })
      .filter(function (e) { return e && new Date(e.at) > n; }).sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
    return { log: sortDesc(log), courses: courses, attended: sortDesc(attended), reserved: reserved,
      posts: (s.posts || []).length, archives: Object.keys(s.archiveSeen || {}).length, lessonsDone: Object.keys(s.done || {}).length };
  }
  function monthStart() { var n = CLG.now(); return new Date(n.getFullYear(), n.getMonth(), 1); }
  /* 講座を見る・投稿する時刻は、朝・昼休み・夜のどれか（夜中の3時に並ばないように） */
  var HOURS = [7, 8, 12, 12, 13, 19, 20, 21, 21, 22, 22, 23];
  function between(a, b, r) {
    if (b <= a) return new Date(a).toISOString();
    var d = new Date(a + (b - a) * r());
    d.setHours(HOURS[Math.floor(r() * HOURS.length)], Math.floor(r() * 60), 0, 0);
    return new Date(Math.min(b, Math.max(a, d.getTime()))).toISOString();
  }
  /** 名簿の人の記録を XP から作る（決まった乱数なので、開くたびに同じ）。
      今月の分は名簿の monthXp（会員ページのXPランキングの数字）に合わせる */
  function synth(m) {
    var r = DATA.rng(hash(m.no) || 7), n = CLG.now().getTime(), join = new Date(m.joinedAt).getTime();
    var end = Math.min(n - 60000, new Date(m.lastActive || m.joinedAt).getTime());
    if (m.leftAt) end = Math.min(end, new Date(m.leftAt).getTime());
    if (end <= join) end = join + 3600000;
    var ms = monthStart().getTime();
    var fixed = [], move = [], stepXp = 0, orientAt = null;
    P.steps(m).forEach(function (st, i) {
      if (!st.done) return;
      if (st.id === 'orient') orientAt = new Date(st.doneAt).getTime();
      var ob = DATA.ONBOARDING[i]; stepXp += ob.xp;
      fixed.push({ at: st.doneAt, xp: ob.xp, why: 'スタートガイド「' + ob.title + '」', link: '#/start' });
    });
    var rest = Math.max(0, m.xp - stepXp);
    // 開いている講座：オリエンテーションが先。そのあとはレベルの順で、同じレベルの中の順番は人ごとに変える
    var open = DATA.COURSES.filter(function (c) { return c.level <= m.level; })
      .map(function (c) { return { c: c, k: c.id === 'orientation' ? -1 : c.level * 10 + r() * 9 }; })
      .sort(function (a, b) { return a.k - b.k; }).map(function (x) { return x.c; });
    var want = Math.floor(rest * 0.7 / DATA.XP.lesson), picks = [];
    open.forEach(function (c) {
      if (want <= 0) return;
      var k = Math.min(want, c.lessons.length);
      // 3つに1つくらいは途中で止まっている（順に全部を見終える人は少ない）
      if (k === c.lessons.length && c.id !== 'orientation' && r() < 0.3) k = Math.max(1, Math.floor(r() * c.lessons.length));
      for (var i = 0; i < k; i++) picks.push({ c: c, l: c.lessons[i] });
      want -= k;
    });
    rest -= picks.length * DATA.XP.lesson;
    picks.forEach(function (p, i) {
      p.e = { xp: DATA.XP.lesson, why: '講座「' + p.c.title + '」' + p.l.title, link: '#/lesson/' + p.c.id + '/' + p.l.id, f: (i + 0.7 + r() * 0.5) / (picks.length + 1), lesson: true };
      // オリエンテーションの回は、スタートガイドの「オリエンテーションを見る」より前に見たことにする
      if (p.c.id === 'orientation' && orientAt) { p.e.at = between(join, orientAt - 60000, r); p.pinned = true; fixed.push(p.e); }
      else { if (orientAt) p.e.after = orientAt; move.push(p.e); }
    });
    // イベント：入会のあとに開かれた勉強会・成果発表会（録画のあるもの）。日時は開かれた日時のまま
    var evs = DATA.ARCHIVE.filter(function (a) { var t = new Date(a.date).getTime(); return t > join && t < end; })
      .map(function (a) { return { a: a, k: r() }; }).sort(function (x, y) { return x.k - y.k; }).map(function (x) { return x.a; });
    var nEv = Math.min(evs.length, Math.floor(rest * 0.45 / DATA.XP.event));
    var attended = evs.slice(0, nEv).map(function (a) { return { id: a.id, title: a.title, at: a.date, kind: a.faculty === 'showcase' ? 'showcase' : 'online' }; });
    rest -= nEv * DATA.XP.event;
    attended.forEach(function (e) { fixed.push({ at: e.at, xp: DATA.XP.event, why: 'イベント「' + e.title + '」に参加', link: '#/events' }); });
    // 録画（開かれた日より前には見られない）
    var ars = DATA.ARCHIVE.filter(function (a) { return new Date(a.date).getTime() < end && !attended.some(function (x) { return x.id === a.id; }); });
    var nAr = Math.min(ars.length, Math.floor(rest * 0.5 / DATA.XP.archive));
    ars.slice(0, nAr).forEach(function (a) {
      move.push({ xp: DATA.XP.archive, why: '勉強会の録画「' + a.title + '」', link: '#/courses/archive/' + a.id, f: r(), after: new Date(a.date).getTime() });
    });
    rest -= nAr * DATA.XP.archive;
    var nPost = Math.floor(rest / DATA.XP.post);
    for (var i = 0; i < nPost; i++) move.push({ xp: DATA.XP.post, why: 'タイムラインに投稿', link: '#/feed', f: r() });
    // 日時を決める。新しいものから順に、名簿の「今月のXP」に収まるだけ今月に置き、残りは先月までに置く
    var target = m.status === 'left' ? 0 : ((DATA.ROSTER_INDEX[m.no] || {}).monthXp || 0);
    var budget = target - fixed.filter(function (x) { return new Date(x.at).getTime() >= ms; }).reduce(function (s, x) { return s + x.xp; }, 0);
    move.forEach(function (x) { x.lo = Math.max(join, x.after || join); if (x.lo >= ms) { x.month = true; budget -= x.xp; } });
    var canMonth = end > Math.max(ms, join);
    move.filter(function (x) { return !x.month; }).sort(function (a, b) { return b.f - a.f; }).forEach(function (x) {
      if (canMonth && budget >= x.xp) { x.month = true; budget -= x.xp; }
    });
    move.forEach(function (x) {
      x.at = x.month ? between(Math.max(x.lo, ms), end, r) : between(x.lo, Math.min(ms - 60000, end), r);
    });
    // 講座の回は順番どおりに見たことにする（日時の並びを回の順に付け直す。オリエンテーションとほかは別々に）
    [picks.filter(function (p) { return p.pinned; }), picks.filter(function (p) { return !p.pinned; })].forEach(function (group) {
      var lt = group.map(function (p) { return p.e.at; }).sort();
      group.forEach(function (p, j) { p.e.at = lt[j]; p.at = lt[j]; });
    });
    var log = fixed.concat(move).map(function (x) { return { at: x.at, xp: x.xp, why: x.why, link: x.link }; });
    var courses = DATA.COURSES.map(function (c) {
      var mine = picks.filter(function (p) { return p.c === c; }), last = null;
      mine.forEach(function (p) { if (!last || new Date(p.at) > new Date(last)) last = p.at; });
      return { c: c, done: mine.length, total: c.lessons.length, locked: c.level > m.level, completed: mine.length === c.lessons.length, last: last,
        next: c.level > m.level ? null : c.lessons[mine.length] || null, quiz: null };
    });
    var reserved = DATA.EVENTS.filter(function (e) { return (e.attendees || []).indexOf(m.no) >= 0 && new Date(e.at).getTime() > n; })
      .sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
    sortDesc(log).forEach(function (l, j) { l.id = 'x' + j; });
    return { log: log, courses: courses, attended: sortDesc(attended), reserved: reserved, posts: nPost, archives: nAr, lessonsDone: picks.length };
  }

  /* ============================================================
     支払い・契約
     ============================================================ */
  function payments(m) { return AD.data.payments({ no: m.no }); }
  function failedOf(m) { return payments(m).filter(function (p) { return p.status === 'failed'; })[0] || null; }
  function graceEnd(p) { return new Date(new Date(p.at).getTime() + (DATA.SITE.graceDays || 7) * DAY); }
  function nextBill(m) {
    if (m.live && m.plan) return m.plan.nextBill || null;
    var last = payments(m)[0], base = last ? new Date(last.at) : new Date(m.joinedAt), k = 1, n = CLG.now();
    if (!last) k = 0;
    while (DATA.addMonths(base, k) <= n) k++;
    return DATA.addMonths(base, k).toISOString();
  }
  function masked(email) { var p = String(email || '').split('@'); return p.length === 2 ? p[0].slice(0, 2) + '•••@' + p[1] : '登録のメールアドレス'; }

  /* ============================================================
     貢献ポイント
     ============================================================ */
  function ruleOf(id) { return byId(DATA.POINT_RULES, id) || { id: id, name: id, pt: 0 }; }
  /* 名簿の人の「今月の会員どうしの分」（名簿の monthPoints）を、ありがとう(+2)と新入生への声かけ(+5)の行にする。
     名簿には人ごとの記録がないため。大きな数の人（ランキングの上位）は行を作らない（数だけ出す） */
  function autoRows(m) {
    var base = m.status === 'left' ? 0 : ((DATA.ROSTER_INDEX[m.no] || {}).monthPoints || 0);
    if (!base || base > 60) return [];
    var r = DATA.rng((hash(m.no + 'pt') || 11)), n = CLG.now().getTime();
    var lo = Math.max(monthStart().getTime(), new Date(m.joinedAt).getTime()), hi = Math.min(n - 60000, new Date(m.lastActive || n).getTime());
    if (hi <= lo) hi = n - 60000;
    var others = DATA.ROSTER.filter(function (x) { return x.status !== 'left' && x.no !== m.no && !x.person; });
    var fresh = others.filter(function (x) { return x.joinedDaysAgo <= 30; });
    function nameOf(list) { var x = list[Math.floor(r() * list.length)]; return x ? x.name : ''; }
    var v = base, out = [];
    if (v % 2 === 1 && v >= 5) { out.push({ rule: 'welcome', pt: 5, why: '新入生に声をかけた（' + nameOf(fresh.length ? fresh : others) + 'さんの自己紹介）' }); v -= 5; }
    while (v >= 2) { out.push({ rule: 'thanks', pt: 2, why: 'コメントに「ありがとう」をもらった（' + nameOf(others) + 'さんから）' }); v -= 2; }
    return out.map(function (x, i) { return Object.assign(x, { id: 'auto-' + i, src: 'auto', at: between(lo, hi, r), link: '#/feed' }); });
  }
  function pointRows(m) {
    var grants = AD.db.state.pointGrants.filter(function (g) { return g.no === m.no; });
    if (!m.live) {
      return grants.map(function (g) { return Object.assign({ src: 'db' }, g); }).concat(autoRows(m));
    }
    // デモ会員：会員ページの記録（取り消したものも出す）。運営が付けたものは、運営画面の記録から付けた人を引く
    var byRid = {}; grants.forEach(function (g) { if (g.rid) byRid[g.rid] = g; });
    return (CLG.store.state.pointsLog || []).map(function (l, i) {
      var id = l.id || 'pl-' + i, g = byRid[id];
      return { id: id, src: 'live', at: l.at, pt: l.pt, rule: l.rule, why: l.why, link: l.link || '', by: g ? g.by : (l.by === 'staff' ? 'staff' : null),
        staff: l.by === 'staff', revoked: !!l.revoked, revokedAt: l.revokedAt, revokeWhy: l.revokeWhy, dbId: g ? g.id : null };
    }).filter(function (x) { return new Date(x.at) <= CLG.now(); });
  }
  /** ポイントを付ける・取り消す：AD.ops（会員ページの記録＝R.grantPoints / R.revokePoints と、運営画面の記録の両方。貢献ポイントの画面と同じ） */
  function grant(m, ruleId, why, link) { return AD.ops.grantPoints(m.no, ruleId, why, link); }
  function revoke(m, row, why) {
    // デモ会員の行は会員ページの記録の id（運営が付けたものは運営画面の記録の id もある）。ほかの会員は運営画面の記録の id
    return AD.ops.revokePoints(row.dbId || row.id, why);
  }

  /* ============================================================
     描く
     ============================================================ */
  function notFound() {
    return '<div class="a-member">' + AU.head({ title: 'ページが見つかりません', sub: 'この会員番号の会員はいません。', crumb: [['#/members', '会員']] }) +
      '<div class="row"><a class="btn btn-ink" href="#/members">会員の一覧へ</a></div></div>';
  }

  function dis(perm) { return AU.can(perm) ? '' : ' disabled'; }
  function head(ctx, m) {
    var no = esc(m.no);
    // 終了した会員は名簿に出ないので、会員ページへのリンクは出さない
    var view = m.live
      ? '<a class="btn btn-ghost btn-s" href="' + esc(AD.data.memberHref('#/home')) + '" target="_blank" rel="noopener">' + icon('external', 'ico-s') + 'この会員として見る</a>'
      : m.status === 'left' ? ''
      : '<a class="btn btn-ghost btn-s" href="' + esc(AD.data.memberHref('#/members/' + encodeURIComponent(m.no))) + '" target="_blank" rel="noopener">' + icon('external', 'ico-s') + '会員ページで見る</a>';
    var msg = m.status !== 'left' ? '<button type="button" class="btn btn-ink btn-s" data-md-msg="' + no + '"' + dis('members') + '>' + icon('mail', 'ico-s') + 'メッセージを送る</button>' : '';
    var more = '<div class="a-md__more">' +
      '<button type="button" class="btn btn-ghost btn-s a-md__morebtn" data-pop="mdMore" aria-expanded="false" aria-controls="mdMore" aria-label="その他の操作">' + icon('more', 'ico-s') + '<span>その他</span></button>' +
      '<div class="pop a-md__menu" id="mdMore" hidden>' +
        '<button type="button" class="pop__item" data-md-reset="' + no + '"' + dis('members') + '>' + icon('mail') + 'パスワードの再設定メールを送る</button>' +
        '<button type="button" class="pop__item' + (m.suspended ? '' : ' is-danger') + '" data-md-suspend="' + no + '"' + dis('members') + '>' + icon(m.suspended ? 'unlock' : 'lock') + (m.suspended ? 'ログインを再開する' : 'ログインを止める') + '</button>' +
        '<hr class="pop__sep">' +
        '<button type="button" class="pop__item" data-md-copy="' + no + '">' + icon('copy') + '会員番号をコピー</button>' +
        (m.email ? '<button type="button" class="pop__item" data-md-copymail="' + no + '">' + icon('copy') + 'メールアドレスをコピー</button>' : '') +
      '</div></div>';
    var sub = '<span class="a-md__idl"><span class="num">' + no + '</span><span class="a-md__sep" aria-hidden="true">・</span>' + esc(m.cohort) +
      '<span class="a-md__sep" aria-hidden="true">・</span>' + (m.status === 'left' ? '在籍' + esc(Math.max(1, DATA.dayDiff(m.leftAt || CLG.now(), m.joinedAt) + 1)) + '日' : '入会' + esc(m.day) + '日目') + '</span>' +
      '<span class="a-md__st">' + AU.status('member', m.status) + '</span>' +
      (m.live ? '<span class="a-md__live">デモ会員・会員ページとつながっています</span>' : '');
    return AU.head({ title: m.name, crumb: [['#/members', '会員']], subHtml: true, sub: sub, actions: view + msg + more });
  }

  function facts(m) {
    var rank = rankOf(m), kids = AD.data.members().filter(function (x) { return x.referredBy === m.no; }).length;
    function f(label, html) { return '<div class="a-md__fact"><dt>' + esc(label) + '</dt><dd>' + html + '</dd></div>'; }
    return '<dl class="a-md__facts">' +
      f('レベル', U.lvBadge(m.level, m.levelName)) +
      f('XP', '<span class="num">' + U.num(m.xp) + '</span>') +
      f('スタートガイド', AU.steps(m.stepsDone)) +
      f('最後のログイン', m.lastActive ? '<time datetime="' + esc(m.lastActive) + '" title="' + esc(U.fmtShort(m.lastActive, true)) + '">' + esc(U.relTime(m.lastActive)) + '</time>' : '―') +
      f('今月の貢献ポイント', '<span class="num">' + U.num(rank ? rank.value : m.monthPoints) + '</span> pt' + (rank && rank.value > 0 ? '<span class="a-md__rank num">' + rank.rank + '位</span>' : '')) +
      f('紹介した会員', '<span class="num">' + kids + '</span>人') +
    '</dl>';
  }
  function rankOf(m) {
    if (m.status === 'left') return null;
    try { return R.ranking('points').filter(function (r) { return m.live ? r.me : r.no === m.no; })[0] || null; } catch (e) { return null; }
  }

  /* いちばん上の知らせ（支払いエラー・解約予定・終了・ログイン停止） */
  function alerts(m) {
    var out = '', no = esc(m.no);
    var f = m.status === 'past_due' ? failedOf(m) : null;
    if (f) {
      var retry = f.failure && f.failure.nextRetryAt && new Date(f.failure.nextRetryAt) > CLG.now() ? '次のやり直しは' + U.fmtShort(f.failure.nextRetryAt) + '。' : '';
      out += '<div class="notice notice-accent a-md__alert" role="note">' + icon('alert') +
        '<div class="a-md__alertbody"><p><b>' + esc(U.fmtShort(f.at)) + 'の請求（' + esc(yen(f.amount)) + '）が通りませんでした</b>' +
          (f.failure ? '：' + esc(f.failure.label) : '') + '</p>' +
          '<p>' + esc(retry) + esc(U.fmtShort(graceEnd(f))) + 'まで会員ページを使えます。</p></div>' +
        '<div class="a-md__alertacts">' +
          (!f.live && f.failure && f.failure.code !== 'expired_card' ? '<button type="button" class="btn btn-ghost btn-s" data-md-retry="' + esc(f.id) + '"' + dis('money') + '>やり直す</button>' : '') +
          '<button type="button" class="btn btn-ink btn-s" data-md-contact="' + no + '"' + dis('money') + '>連絡する</button>' +
        '</div></div>';
    }
    if (m.status === 'canceling' && m.cancelAt) {
      out += '<div class="notice notice-warn a-md__alert" role="note">' + icon('info') +
        '<div class="a-md__alertbody"><p><b>解約予定：' + esc(U.fmtDate(m.cancelAt)) + 'で会員期間が終わります</b></p>' +
        (m.cancelReason ? '<p>理由：' + esc(m.cancelReason) + '</p>' : '') + '</div></div>';
    }
    if (m.status === 'left' && m.leftAt) {
      var keep = new Date(new Date(m.leftAt).getTime() + (DATA.SITE.keepDays || 365) * DAY);
      out += '<div class="notice a-md__alert is-quiet" role="note">' + icon('info') +
        '<div class="a-md__alertbody"><p><b>' + esc(U.fmtDate(m.leftAt)) + 'に会員期間が終わりました</b>' + (m.cancelReason ? '（理由：' + esc(m.cancelReason) + '）' : '') + '</p>' +
        '<p>記録は' + esc(dateY(keep)) + 'まで残ります。</p></div></div>';
    }
    if (m.suspended) {
      // デモ会員は会員ページが従っている記録（R.loginBlocked）から。運営画面の記録があれば止めた人も出す
      var ex = AD.db.state.members[m.no] || {}, lb = m.live && R.loginBlocked ? R.loginBlocked() : null;
      var at = (lb && lb.at) || ex.suspendedAt, why = (lb && lb.reason) || ex.suspendReason;
      out += '<div class="notice notice-accent a-md__alert" role="note">' + icon('lock') +
        '<div class="a-md__alertbody"><p><b>ログインを止めています</b>' + (at ? '（' + esc(U.fmtShort(at, true)) + (ex.suspended && ex.suspendedBy ? '・' + esc(staffLabel(ex.suspendedBy)) : '') + '）' : '') + '</p>' +
        (why ? '<p>理由：' + esc(why) + '</p>' : '') + (m.live ? '<p>開いている会員ページも「ログインを止めています」になっています。</p>' : '') + '</div>' +
        '<div class="a-md__alertacts"><button type="button" class="btn btn-ghost btn-s" data-md-suspend="' + no + '"' + dis('members') + '>再開する</button></div></div>';
    }
    return out ? '<div class="a-md__alerts">' + out + '</div>' : '';
  }

  /* ---------- プロフィール ---------- */
  function stepsList(m) {
    var list = P.steps(m), first = -1;
    // 終了した会員には「次の項目」を付けない
    if (m.status !== 'left') list.forEach(function (s, i) { if (!s.done && first < 0) first = i; });
    return '<ol class="a-md__steps">' + list.map(function (s, i) {
      var state = s.done ? 'is-done' : i === first ? 'is-next' : s.due ? 'is-due' : '';
      var right = s.done ? '<span class="a-md__stepat num">' + esc(U.fmtShort(s.doneAt)) + '</span>'
        : i === first ? '<span class="a-md__stepat">次の項目</span>' : s.due ? '<span class="a-md__stepat is-due">予定より遅れ</span>' : '';
      return '<li class="' + state + '"><span class="a-md__stepn num" aria-hidden="true">' + (i + 1) + '</span>' +
        '<span class="a-md__stept">' + esc(s.title) + '<span class="sr-only">' + (s.done ? '（済み）' : '（まだ）') + '</span></span>' + right + '</li>';
    }).join('') + '</ol>';
  }
  function tabProfile(m, a) {
    var by = m.referredBy ? AD.data.member(m.referredBy) : null;
    var iv = P.interviewOf(m.no);
    var info = AU.panel({ title: '会員の情報', id: 'mdInfo', body: AU.kv([
      ['表示名', m.name],
      m.realName && m.realName !== m.name ? ['本名', m.realName] : null,
      ['フリガナ', m.kana],
      ['会員番号', '<span class="num">' + esc(m.no) + '</span><button type="button" class="btn btn-text btn-s a-md__copy" data-md-copy="' + esc(m.no) + '" aria-label="会員番号をコピー">' + icon('copy', 'ico-s') + '</button>', true],
      // 狭い幅で折り返すときは @ の前で（「…gm / ail.com」のように途中で割らない）
      ['メール', m.email ? esc(m.email).replace('@', '<wbr>@') + '<button type="button" class="btn btn-text btn-s a-md__copy" data-md-copymail="' + esc(m.no) + '" aria-label="メールアドレスをコピー">' + icon('copy', 'ico-s') + '</button>' : '―', true],
      ['地域', m.area],
      ['いまのお仕事', m.job],
      ['入会', U.fmtDate(m.joinedAt) + '（' + m.cohort + '）'],
      ['紹介コード', m.refCode ? '<span class="mono">' + esc(m.refCode) + '</span>' : '―', true],
      ['紹介元', by ? AU.who(by) : '紹介なしで入会', !!by]
    ]) });
    var steps = AU.panel({ title: 'スタートガイド', id: 'mdSteps', count: m.stepsDone + '/' + DATA.ONBOARDING.length,
      actions: m.day <= 30 && m.status !== 'left' ? '<a class="ad-panel__link" href="#/onboarding">新入生の30日</a>' : '',
      body: stepsList(m) + (iv ? '<p class="a-md__iv">面談：' + AU.status('interview', iv.status) + '<span class="num">' + esc(U.fmtShort(iv.at, true)) + '</span></p>' : '') });
    var recent = a.log.slice(0, 6);
    var act = AU.panel({ title: '最近の記録', id: 'mdRecent', flush: true, actions: '<a class="ad-panel__link" href="' + esc(tabHref(m, 'xp')) + '">XPの記録</a>',
      body: recent.length ? '<ul class="a-md__feed">' + recent.map(function (l) {
        return '<li><time class="num" datetime="' + esc(l.at) + '">' + esc(U.fmtShort(l.at)) + '</time><span class="a-md__feedt">' + U.jp(l.why) + '</span><b class="num xp-num">+' + esc(l.xp) + '</b></li>';
      }).join('') + '</ul>' : AU.empty('まだ記録はありません。') });
    var dr = dataPanel(m), open = dr && /data-md-datadone/.test(dr);
    // 受付中の申込みがあるときは、会員の情報の前に置く（済んだものだけなら、いちばん下）
    return '<div class="a-md__cols">' + '<div class="a-md__col">' + (open ? dr : '') + info + act + (open ? '' : dr) + '</div>' + '<div class="a-md__col">' + steps + '</div></div>';
  }
  /* 記録の書き出し・削除の申込み（デモ会員が会員ページのアカウントから出したもの。AD.ops.dataRequests）。
     受付中のものは「済みにする」→ AD.ops.completeDataRequest（会員にお知らせが届き、会員ページのアカウントも「済み」になる） */
  var DATA_ST = { done: '済み', canceled: '取り消し' };
  function dataPanel(m) {
    var list = m.live && AD.ops.dataRequests ? AD.ops.dataRequests() : [];
    if (!list.length) return '';
    return AU.panel({ title: '記録の書き出し・削除の申込み', id: 'mdData', flush: true, body: '<ul class="a-md__feed a-md__data">' + list.map(function (x) {
      var st = x.status === 'received'
        ? '<button type="button" class="btn btn-ink btn-s" data-md-datadone="' + esc(x.id) + '" aria-label="' + esc((x.label || '記録の申込み') + 'を済みにする') + '"' + dis('members') + '>済みにする</button>'
        : '<span class="a-md__datast">' + esc((x.status === 'done' && x.doneAt ? U.fmtShort(x.doneAt) + 'に' : '') + (DATA_ST[x.status] || x.status)) + '</span>';
      return '<li><time class="num" datetime="' + esc(x.at) + '">' + esc(U.fmtShort(x.at)) + '</time>' +
        '<span class="a-md__feedt">' + esc(x.label || '記録の申込み') + (x.status === 'received' ? '<span class="a-md__datanew nw">（受付中）</span>' : '') + '</span>' + st + '</li>';
    }).join('') + '</ul>' });
  }

  /* ---------- 契約と支払い ---------- */
  function tabPay(m) {
    var pays = payments(m), n = CLG.now();
    var paid = pays.filter(function (p) { return p.status !== 'failed'; });
    var total = paid.reduce(function (s, p) { return s + p.amount; }, 0);
    var refunded = pays.reduce(function (s, p) { return s + (p.refund ? p.refund.amount : 0); }, 0);
    var nb = m.status === 'active' || m.status === 'past_due' ? nextBill(m) : null;
    var no = esc(m.no);
    var acts = '';
    if (m.status === 'active') acts = '<button type="button" class="btn btn-ghost btn-s" data-md-cancel="' + no + '"' + dis('members') + '>解約の手続きをする</button>';
    else if (m.status === 'canceling') acts = '<button type="button" class="btn btn-ghost btn-s" data-md-resume="' + no + '"' + dis('members') + '>解約を取り消す</button>';
    else if (m.status === 'past_due' && m.live) acts = '<button type="button" class="btn btn-ghost btn-s" data-md-activate="' + no + '"' + dis('members') + '>有効に戻す</button>';
    var cust = m.cust || '';
    var plan = AU.panel({ title: '契約', id: 'mdPlan', actions: acts, body: AU.kv([
      ['プラン', '月額' + yen(DATA.SITE.price) + '（税込）・' + DATA.SITE.billing],
      ['状態', AU.status('member', m.status) + (m.suspended ? '<span class="a-md__inline">ログイン停止中</span>' : ''), true],
      ['入会日', U.fmtDate(m.joinedAt)],
      nb ? ['次の請求日', U.fmtDate(nb)] : null,
      m.status === 'canceling' ? ['会員期間の終わり', U.fmtDate(m.cancelAt)] : null,
      m.status === 'left' ? ['会員期間の終わり', U.fmtDate(m.leftAt)] : null,
      m.cancelReason ? ['解約の理由', m.cancelReason] : null,
      ['カード', m.card || '―'],
      ['Stripe の顧客', cust ? '<span class="mono">' + esc(cust) + '</span><button type="button" class="btn btn-text btn-s" data-md-stripe="' + esc(cust) + '">' + icon('external', 'ico-s') + 'Stripeで開く</button>' : (m.live ? 'デモ会員（会員ページの支払い）' : '―'), true],
      ['支払いの累計', paid.length + '回・' + yen(total) + (refunded ? '（返金 ' + yen(refunded) + '）' : '')]
    ]) });
    var rows = pays.map(function (p) {
      // 一部だけ返したときは「一部返金」（全額の返金と見分けがつくように）
      var st = AU.status('payment', p.status, p.refund && p.refund.amount < p.amount ? '一部返金' : null), sub = '';
      if (p.failure) sub = esc(p.failure.label) + (p.attempts > 1 ? '・' + p.attempts + '回試した' : '');
      if (p.refund) sub = '返金 ' + esc(yen(p.refund.amount)) + '・' + esc(U.fmtShort(p.refund.at)) + '<br>' + esc(p.refund.reason || '');
      if (p.recovered) sub = 'やり直しで支払い済み';
      var btns = '', dm = dis('money');
      // 返金はデモ会員の請求もできる（R.refundInvoice。会員ページの領収書が「返金済み」になる）
      if (p.status === 'paid') btns = '<button type="button" class="btn btn-text btn-s a-md__danger" data-md-refund="' + esc(p.id) + '"' + dm + '>返金</button>' +
        '<button type="button" class="btn btn-text btn-s" data-md-receipt="' + esc(p.id) + '"' + dm + '>領収書を送る</button>';
      if (p.status === 'failed' && !p.live) btns = (p.failure && p.failure.code !== 'expired_card' ? '<button type="button" class="btn btn-ghost btn-s" data-md-retry="' + esc(p.id) + '"' + dm + '>やり直す</button>' : '') +
        '<button type="button" class="btn btn-text btn-s" data-md-contact="' + no + '"' + dm + '>連絡する</button>';
      return '<tr' + (p.status === 'failed' ? ' class="is-alert"' : p.status === 'refunded' ? ' class="is-quiet"' : '') + '>' +
        '<td class="is-main nw"><span class="num">' + esc(U.fmtShort(p.at)) + '</span></td>' +
        '<td class="r num" data-label="金額">' + esc(yen(p.amount)) + '</td>' +
        '<td data-label="状態">' + st + (sub ? '<span class="a-md__paysub">' + sub + '</span>' : '') + '</td>' +
        '<td class="ad-hide-sm mono" data-label="領収書">' + esc(p.receiptNo || '―') + '</td>' +
        '<td class="ad-hide-md mono" data-label="決済">' + esc(String(p.id || '').slice(0, 14)) + (String(p.id || '').length > 14 ? '…' : '') + '</td>' +
        '<td class="a-md__rowacts" data-label="">' + (btns || '<span class="muted">―</span>') + '</td></tr>';
    }).join('');
    var table = AU.panel({ title: '請求', id: 'mdCharges', flush: true, count: pays.length + '件',
      actions: '<a class="ad-panel__link" href="#/payments">支払い</a>',
      body: pays.length ? '<div class="ad-tbl-wrap"><table class="ad-tbl is-dense is-cards" aria-label="請求の記録"><thead><tr>' +
        '<th scope="col">請求日</th><th scope="col" class="r">金額</th><th scope="col">状態</th><th scope="col" class="ad-hide-sm">領収書</th><th scope="col" class="ad-hide-md">決済</th><th scope="col"><span class="sr-only">操作</span></th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>' : AU.empty('まだ請求はありません。') });
    return plan + table;
  }

  /* ---------- XPとレベル ---------- */
  function tabXp(ctx, m, a) {
    var L = DATA.LEVELS, cl = L.filter(function (x) { return x.lv === m.level; })[0] || L[0], nx = L.filter(function (x) { return x.lv === m.level + 1; })[0] || null;
    var pct = nx ? (m.xp - cl.min) / (nx.min - cl.min) * 100 : 100;
    // 今月のXPは下の記録から数える（名簿の人の記録は、今月の分が名簿の数字に合うように作ってある）
    var mStart = monthStart();
    var monthXp = a.log.filter(function (l) { return new Date(l.at) >= mStart; }).reduce(function (s, l) { return s + l.xp; }, 0);
    var kinds = { lesson: 0, event: 0, archive: 0, post: 0, step: 0 };
    a.log.forEach(function (l) {
      if (/^スタートガイド/.test(l.why)) kinds.step++; else if (/^講座「/.test(l.why)) kinds.lesson++; else if (/^イベント「/.test(l.why)) kinds.event++;
      else if (/^勉強会の録画/.test(l.why)) kinds.archive++; else if (/^タイムラインに投稿/.test(l.why)) kinds.post++;
    });
    function st(label, v, unit) { return '<div><dt>' + esc(label) + '</dt><dd><b class="num">' + U.num(v) + '</b>' + esc(unit) + '</dd></div>'; }
    var top = '<section class="ad-panel a-md__lv" aria-labelledby="mdLvT">' +
      '<div class="a-md__lvmain"><h2 class="sr-only" id="mdLvT">レベル</h2>' + U.lvBadge(m.level, m.levelName) +
        '<p class="a-md__xp"><b class="num">' + U.num(m.xp) + '</b> XP</p>' +
        U.progressBar(pct, 'gold', { label: '次のレベルまでの進み', valuetext: nx ? '次のLv' + nx.lv + 'まで' + (nx.min - m.xp) + ' XP' : '最高のレベル' }) +
        '<p class="a-md__lvnext">' + (nx ? '次のLv' + esc(nx.lv) + '「' + esc(nx.name) + '」まで <b class="num">' + U.num(nx.min - m.xp) + '</b> XP' : '最高のレベルです') + '</p></div>' +
      '<dl class="a-md__lvstats">' + st('今月のXP', monthXp, ' XP') + st('講座', kinds.lesson, '回') + st('イベント', kinds.event, '回') +
        st('録画', kinds.archive, '本') + st('投稿', kinds.post, '回') + '</dl></section>';
    var tbl = AU.table({
      id: 'mdxp', qp: 'x', rows: a.log, query: ctx.query, sort: '-at', label: 'XPの記録', pageSize: 20, rowId: function (r) { return r.id; },
      search: { placeholder: '内容で探す', keys: ['why'] },
      columns: [
        AU.col.when('at', '日時'),
        { key: 'why', label: '内容', main: true, sort: false, html: function (r) { return U.jp(r.why); } },
        { key: 'xp', label: 'XP', align: 'r', dir: 'desc', html: function (r) { return '<b class="num xp-num">+' + esc(r.xp) + '</b>'; } }
      ],
      csv: { name: 'XP_' + m.no }, empty: 'まだXPの記録はありません。'
    });
    return top + '<h2 class="a-md__h2">XPの記録</h2>' + tbl;
  }

  /* ---------- 講座の進み ---------- */
  function tabCourses(m, a) {
    var list = a.courses, done = list.filter(function (c) { return c.completed; }).length;
    var started = list.filter(function (c) { return c.done > 0 && !c.completed; }).length;
    var open = list.filter(function (c) { return !c.locked; }).length;
    var rows = list.map(function (c) {
      var state = c.locked ? '<span class="muted">Lv' + esc(c.c.level) + 'で開く</span>' : c.completed ? U.statusTag('done', '修了') : c.done ? '受講中' : '<span class="muted">まだ</span>';
      var teacher = DATA.PEOPLE[c.c.teacher] ? DATA.PEOPLE[c.c.teacher].name : '';
      var quiz = c.quiz ? (c.quiz.passed ? '合格 ' : '') + c.quiz.score + '/' + c.quiz.total : '';
      return '<tr' + (c.locked ? ' class="is-quiet"' : '') + '>' +
        '<td class="is-main"><span class="a-md__course">' + esc(c.c.title) + '</span><span class="a-md__teacher">' + esc(teacher) + '</span></td>' +
        '<td class="nw" data-label="開くレベル"><span class="num">Lv' + esc(c.c.level) + '</span></td>' +
        '<td data-label="進み"><span class="a-md__prog">' + U.progressBar(c.total ? c.done / c.total * 100 : 0, c.completed ? 'ok' : 'ink', { decorative: true, cls: 'bar-s' }) +
          '<span class="num">' + c.done + '/' + c.total + '</span></span></td>' +
        '<td class="nw" data-label="状態">' + state + '</td>' +
        '<td class="nw" data-label="最後に見た日">' + (c.last ? '<span class="num">' + esc(U.fmtShort(c.last)) + '</span>' : '<span class="muted">―</span>') + '</td>' +
        '<td class="ad-hide-sm a-md__nextl" data-label="次の回">' + (c.next && !c.completed && c.done ? esc(lessonNo(c.c, c.next) + ' ' + c.next.title) : '<span class="muted">―</span>') + '</td>' +
        (m.live ? '<td class="ad-hide-sm nw" data-label="確認テスト">' + (quiz ? esc(quiz) : '<span class="muted">―</span>') + '</td>' : '') +
      '</tr>';
    }).join('');
    var sum = '<p class="a-md__sum">修了 <b class="num">' + done + '</b>講座・受講中 <b class="num">' + started + '</b>講座・見た回 <b class="num">' + a.lessonsDone + '</b>本・開いている講座 <b class="num">' + open + '</b>/' + list.length + '</p>';
    return sum + AU.panel({ title: '講座', id: 'mdCourses', flush: true, actions: '<a class="ad-panel__link" href="#/courses">講座の管理</a>',
      body: '<div class="ad-tbl-wrap"><table class="ad-tbl is-dense is-cards" aria-label="講座の進み"><thead><tr>' +
        '<th scope="col">講座</th><th scope="col" class="nw">開くレベル</th><th scope="col">進み</th><th scope="col">状態</th><th scope="col" class="nw">最後に見た日</th><th scope="col" class="ad-hide-sm">次の回</th>' +
        (m.live ? '<th scope="col" class="ad-hide-sm">確認テスト</th>' : '') + '</tr></thead><tbody>' + rows + '</tbody></table></div>' });
  }

  /* ---------- 案件とイベント ---------- */
  function gigTitle(id) { var g = R.gig(id); return g ? g.title : '終わった案件'; }
  function tabGigs(m, a) {
    var q = AD.data.queues();
    var apps = q.gigApps.filter(function (x) { return x.no === m.no; }).sort(function (x, y) { return new Date(y.at) - new Date(x.at); });
    var posts = q.peerGigs.filter(function (x) { return x.no === m.no; });
    var props = q.proposals.filter(function (x) { return x.no === m.no; });
    function tbl(label, head, body) {
      return '<div class="ad-tbl-wrap"><table class="ad-tbl is-dense is-cards" aria-label="' + esc(label) + '"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>';
    }
    var appsP = AU.panel({ title: '案件への応募', id: 'mdApps', flush: true, count: apps.length + '件', actions: '<a class="ad-panel__link" href="#/gigs?tab=apps">応募の一覧</a>',
      body: apps.length ? tbl('案件への応募', '<th scope="col">案件</th><th scope="col">応募</th><th scope="col">状態</th><th scope="col" class="ad-hide-sm">最後の更新</th>',
        apps.map(function (x) {
          return '<tr><td class="is-main">' + esc(gigTitle(x.gig)) + (x.note ? '<span class="a-md__paysub">' + esc(x.note) + '</span>' : '') + '</td>' +
            '<td class="nw num" data-label="応募">' + esc(U.fmtShort(x.at)) + '</td><td data-label="状態">' + AU.status('app', x.status) + '</td>' +
            '<td class="nw ad-hide-sm" data-label="最後の更新">' + esc(U.relTime(x.updatedAt || x.at)) + '</td></tr>';
        }).join('')) : AU.empty('まだ案件に応募していません。') });
    var postsP = posts.length ? AU.panel({ title: '会員どうしの募集', id: 'mdPosts', flush: true, count: posts.length + '件', actions: '<a class="ad-panel__link" href="#/gigs?tab=review">募集の確認</a>',
      body: tbl('会員どうしの募集', '<th scope="col">募集</th><th scope="col">出した日</th><th scope="col">状態</th>', posts.map(function (g) {
        return '<tr><td class="is-main">' + esc(g.title) + (g.rejectReason ? '<span class="a-md__paysub">差し戻しの理由：' + esc(g.rejectReason) + '</span>' : '') + '</td>' +
          '<td class="nw num" data-label="出した日">' + esc(U.fmtShort(g.submittedAt)) + '</td><td data-label="状態">' + AU.status('review', g.status) + '</td></tr>';
      }).join('')) }) : '';
    var evList = function (list, empty) {
      return list.length ? '<ul class="a-md__evs">' + list.map(function (e) {
        var on = e.kind === 'offline' ? '会場' : e.kind === 'showcase' ? '成果発表会' : 'オンライン';
        return '<li><span class="a-md__evat num">' + esc(U.fmtShort(e.at, true)) + '</span><span class="a-md__evt">' + U.jp(e.title) + '</span><span class="a-md__evk">' + esc(on) + '</span></li>';
      }).join('') + '</ul>' : '<p class="a-md__none">' + esc(empty) + '</p>';
    };
    var evP = AU.panel({ title: 'イベント', id: 'mdEvents', actions: '<a class="ad-panel__link" href="#/events">イベント</a>',
      body: '<h3 class="a-md__h3">予約しているもの</h3>' + evList(a.reserved, '予約しているイベントはありません。') +
        '<h3 class="a-md__h3">参加したもの<span class="num">（' + a.attended.length + '回）</span></h3>' + evList(a.attended.slice(0, 8), 'まだイベントに参加していません。') });
    var propP = props.length ? AU.panel({ title: 'イベントの企画', id: 'mdProps', flush: true, actions: '<a class="ad-panel__link" href="#/events?tab=proposals">企画の確認</a>',
      body: tbl('イベントの企画', '<th scope="col">企画</th><th scope="col">出した日</th><th scope="col">状態</th>', props.map(function (p) {
        return '<tr><td class="is-main">' + esc(p.title || '成果発表会の発表') + '</td><td class="nw num" data-label="出した日">' + esc(U.fmtShort(p.sentAt || p.at)) + '</td>' +
          '<td data-label="状態">' + AU.status('review', p.status) + '</td></tr>';
      }).join('')) }) : '';
    return '<div class="a-md__cols"><div class="a-md__col">' + appsP + postsP + '</div><div class="a-md__col">' + evP + propP + '</div></div>';
  }

  /* ---------- 紹介（1段だけ） ---------- */
  function tabRef(m) {
    var by = m.referredBy ? AD.data.member(m.referredBy) : null;
    var kids = AD.data.members().filter(function (x) { return x.referredBy === m.no; }).sort(function (a, b) { return new Date(b.joinedAt) - new Date(a.joinedAt); });
    var rw = AD.data.rewards({ referrer: m.no });
    var sum = function (sts) { return rw.filter(function (x) { return sts.indexOf(x.status) >= 0; }).reduce(function (s, x) { return s + x.amount; }, 0); };
    var sameCard = rw.some(function (x) { return x.flag === 'same_card'; }) || kids.some(function (k) { return k.card && k.card === m.card; });
    var bank = m.live ? R.bank() : AD.db.state.banks[m.no];
    var byP = AU.panel({ title: '紹介元', id: 'mdRefBy', body: by ?
      '<div class="a-md__refby">' + AU.who(by) + '<span class="a-md__refcode">紹介コード <span class="mono">' + esc(by.refCode || '―') + '</span></span></div>'
      : '<p class="a-md__none">紹介なしで入会しました。</p>' });
    var kidsP = AU.panel({ title: '紹介した会員', id: 'mdKids', flush: true, count: kids.length + '人',
      body: kids.length ? '<div class="ad-tbl-wrap"><table class="ad-tbl is-dense is-cards" aria-label="紹介した会員"><thead><tr><th scope="col">会員</th><th scope="col">入会</th><th scope="col">状態</th></tr></thead><tbody>' +
        kids.map(function (k) {
          return '<tr class="is-link" data-tb-href="#/members/' + esc(encodeURIComponent(k.no)) + '"><td class="is-main">' + AU.who(k) + '</td>' +
            '<td class="nw num" data-label="入会">' + esc(U.fmtShort(k.joinedAt)) + '</td><td data-label="状態">' + AU.status('member', k.status) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : AU.empty('紹介した会員はいません。') });
    var warn = '';
    if (sameCard) warn += '<p class="notice notice-warn a-md__refwarn">' + icon('alert', 'ico-s') + '<span>紹介した会員とカードの下4桁が同じです。本人が自分を紹介していないか確かめてください。</span></p>';
    var bankBody;
    if (bank) {
      var mismatch = m.kana && bank.holder && String(bank.holder).replace(/\s/g, '') !== String(m.kana).replace(/\s/g, '');
      bankBody = AU.kv([['銀行', bank.bank + ' ' + bank.branch], ['口座', (bank.kind || '普通') + ' ***' + (bank.tail || '')], ['名義', bank.holder],
        ['登録', bank.at ? U.fmtDate(bank.at) : '―']]);
      if (mismatch) warn += '<p class="notice notice-warn a-md__refwarn">' + icon('alert', 'ico-s') + '<span>振込先の名義（' + esc(bank.holder) + '）が会員の名前（' + esc(m.kana) + '）と違います。</span></p>';
    } else {
      bankBody = '<p class="a-md__none">' + (rw.length ? '振込先が登録されていません。確定した報酬を払えません。' : '振込先は登録されていません。') + '</p>';
    }
    var rwRows = rw.slice(0, 40).map(function (x) {
      var kid = x.referred ? AD.data.member(x.referred) : null;
      var when = x.status === 'hold' ? U.fmtShort(x.confirmAt) + 'に確定' : x.status === 'paid' ? U.fmtShort(x.paidAt || x.payAt) + 'に支払い' : x.status === 'void' ? (x.voidReason || '') : U.fmtShort(x.payAt) + 'に支払い予定';
      return '<tr' + (x.status === 'void' ? ' class="is-quiet"' : '') + '><td class="is-main nw"><span class="num">' + esc(U.fmtShort(x.at)) + '</span></td>' +
        '<td data-label="紹介した会員">' + (kid ? esc(kid.name) : esc((x.initial || '') + '.さん')) + '<span class="a-md__paysub num">' + esc(x.month) + '回目の決済</span></td>' +
        '<td class="r num" data-label="金額">' + esc(yen(x.amount)) + '</td><td data-label="状態">' + AU.status('reward', x.status) + '</td>' +
        '<td class="ad-hide-sm" data-label="日付">' + esc(when) + '</td></tr>';
    }).join('');
    var totals = '<dl class="a-md__totals">' +
      '<div><dt>保留</dt><dd class="num">' + esc(yen(sum(['hold']))) + '</dd></div>' +
      '<div><dt>確定待ち</dt><dd class="num">' + esc(yen(sum(['ready']))) + '</dd></div>' +
      '<div><dt>確定・支払予定</dt><dd class="num">' + esc(yen(sum(['confirmed', 'scheduled']))) + '</dd></div>' +
      '<div><dt>支払済</dt><dd class="num">' + esc(yen(sum(['paid']))) + '</dd></div></dl>';
    var rwP = AU.panel({ title: '紹介報酬の明細', id: 'mdRewards', flush: true, count: rw.length + '件', actions: '<a class="ad-panel__link" href="#/referrals">紹介報酬</a>',
      body: rw.length ? totals + '<div class="ad-tbl-wrap"><table class="ad-tbl is-dense is-cards" aria-label="紹介報酬の明細"><thead><tr><th scope="col">決済日</th><th scope="col">紹介した会員</th><th scope="col" class="r">金額</th><th scope="col">状態</th><th scope="col" class="ad-hide-sm">日付</th></tr></thead><tbody>' +
        rwRows + '</tbody></table></div>' + (rw.length > 40 ? '<p class="a-md__more2">ほか' + (rw.length - 40) + '件は紹介報酬の画面で見られます。</p>' : '') : AU.empty('まだ紹介報酬の明細はありません。') });
    if (!kids.length && !rw.length) {
      // 紹介したことがない人は、紹介元とコードだけ（空の面を並べない）
      return '<div class="a-md__cols"><div class="a-md__col">' + byP + '</div><div class="a-md__col">' +
        AU.panel({ title: 'この会員の紹介', id: 'mdRefMine', body: AU.kv([['紹介コード', m.refCode ? '<span class="mono">' + esc(m.refCode) + '</span>' : '―', true],
          ['紹介した会員', 'まだいません'], ['振込先', bank ? bank.bank + ' ' + bank.branch : '登録なし']]) }) + '</div></div>';
    }
    return warn + '<div class="a-md__cols"><div class="a-md__col">' + byP + kidsP + '</div><div class="a-md__col">' +
      AU.panel({ title: '振込先', id: 'mdBank', body: bankBody }) + '</div></div>' + rwP;
  }

  /* ---------- 貢献ポイント ---------- */
  function tabPoints(ctx, m) {
    var rank = rankOf(m), total = 0;
    try { total = R.rankTotal('points'); } catch (e) { total = 0; }
    var rows = pointRows(m), yearAgo = CLG.now().getTime() - 365 * DAY;
    var staffSum = rows.filter(function (r) { return (r.src === 'db' || r.staff) && !r.revoked && new Date(r.at).getTime() > yearAgo; }).reduce(function (s, r) { return s + r.pt; }, 0);
    var base = m.live ? null : ((DATA.ROSTER_INDEX[m.no] || {}).monthPoints || 0);
    var canGrant = m.status !== 'left', dp = dis('points');
    var top = '<div class="a-md__ptop">' +
      '<dl class="a-md__totals">' +
        '<div><dt>今月</dt><dd><b class="num">' + U.num(rank ? rank.value : 0) + '</b> pt' + (rank && rank.value > 0 ? '<span class="a-md__rank num">' + rank.rank + '位（' + U.num(total) + '人中）</span>' : '') + '</dd></div>' +
        '<div><dt>運営が付けた分（1年）</dt><dd><b class="num">' + U.num(staffSum) + '</b> pt</dd></div>' +
        (base != null ? '<div><dt>会員どうしの分（今月）</dt><dd><b class="num">' + U.num(base) + '</b> pt</dd></div>' : '') +
      '</dl>' +
      (canGrant ? '<button type="button" class="btn btn-ink btn-s" data-md-grant="' + esc(m.no) + '"' + dp + '>' + icon('plus', 'ico-s') + 'ポイントを付ける</button>' : '') + '</div>';
    var tbl = AU.table({
      id: 'mdpt', qp: 'p', rows: rows, query: ctx.query, sort: '-at', label: '貢献ポイントの記録', pageSize: 20, search: null, rowId: function (r) { return r.id; },
      filters: [{ key: 'who', label: '付けた人', options: [['', 'すべて'], ['staff', '運営が付けた'], ['member', '自動で付いた']],
        match: function (r, v) { var st = r.src === 'db' || r.staff; return v === 'staff' ? st : !st; } }],
      columns: [
        AU.col.when('at', '日時'),
        { key: 'why', label: '内容', main: true, sort: false, html: function (r) {
          // ルールの名前は、内容がそのルールの文で始まらないときだけ下に出す（同じ文を2回並べない）
          var rn = ruleOf(r.rule).name, head = rn.replace(/（.*$/, '');
          var sub = (String(r.why || '').indexOf(head) === 0 ? '' : rn) + (r.revoked ? (String(r.why || '').indexOf(head) === 0 ? '' : '・') + '取り消し：' + (r.revokeWhy || '') : '');
          return '<span class="a-md__ptwhy">' + U.jp(r.why) + '</span>' + (sub ? '<span class="a-md__paysub">' + esc(sub) + '</span>' : '');
        }, csv: function (r) { return r.why; } },
        { key: 'rule', label: 'ルール', csvOnly: true, csv: function (r) { return ruleOf(r.rule).name; } },
        { key: 'pt', label: 'pt', align: 'r', html: function (r) { return r.revoked ? '<s class="num muted">+' + esc(r.pt) + '</s>' : '<b class="num">+' + esc(r.pt) + '</b>'; } },
        { key: 'by', label: '付けた人', hide: 'sm', value: function (r) { return r.src === 'db' || r.staff ? staffLabel(r.by) : '自動'; },
          html: function (r) { return r.src === 'db' || r.staff ? esc(staffLabel(r.by)) : '<span class="muted">自動</span>'; } },
        { key: 'exp', label: '期限', hide: 'md', value: function (r) { return new Date(new Date(r.at).getTime() + 365 * DAY).toISOString(); },
          html: function (r) { var d = new Date(new Date(r.at).getTime() + 365 * DAY); return '<span class="num">' + esc(dateY(d)) + '</span>'; }, csv: function (r) { return AU.ymd(new Date(new Date(r.at).getTime() + 365 * DAY)); } },
        { key: 'act', label: '操作', sort: false, csv: false, html: function (r) {
          if (r.revoked || !(r.src === 'db' || r.staff)) return '';
          return '<button type="button" class="btn btn-text btn-s a-md__danger" data-md-revoke="' + esc(r.id) + '"' + dp + '>取り消す</button>';
        } }
      ],
      rowClass: function (r) { return r.revoked ? 'is-quiet' : ''; },
      csv: { name: '貢献ポイント_' + m.no }, empty: 'まだ貢献ポイントの記録はありません。'
    });
    return top + tbl;
  }

  /* ---------- メッセージ ---------- */
  function tabMsg(m) {
    var ths = AD.data.threads().filter(function (t) { return t.no === m.no; });
    var cts = AD.db.state.contacts.filter(function (c) { return c.no === m.no; });
    var q = AD.data.queues();
    var exs = q.experts.filter(function (x) { return x.no === m.no; });
    var ivs = q.interviews.filter(function (x) { return x.no === m.no; });
    var main = ths[0] || null;
    var convo = '';
    if (main) {
      var msgs = main.messages.filter(function (x) { return !x.auto; }).slice(-4);
      convo = '<ol class="a-md__msgs">' + msgs.map(function (x) {
        var me = x.from === 'member';
        return '<li class="' + (me ? 'is-member' : 'is-staff') + '"><p class="a-md__msgfrom"><b>' + esc(me ? m.name : staffLabel(x.from)) + '</b><time class="num" datetime="' + esc(x.at) + '">' + esc(U.fmtShort(x.at, true)) + '</time></p>' +
          '<p class="a-md__msgtext">' + U.jp(x.text, { br: true }) + '</p></li>';
      }).join('') + '</ol>';
    }
    var thP = AU.panel({ title: 'やりとり', id: 'mdThread',
      actions: main ? '<a class="btn btn-ghost btn-s" href="#/inbox/' + esc(encodeURIComponent(main.id)) + '">' + icon('message', 'ico-s') + '開く</a>' : '',
      body: main ? '<p class="a-md__thmeta">' + AU.status('thread', main.status) + '<span>' + esc(main.kind) + '</span><span>担当：' + esc(staffLabel(main.assignee)) + '</span>' +
          (main.waitingSince ? AU.ageTag(main.waitingSince, 24) : '') + '</p>' + convo +
          (ths.length > 1 ? '<p class="a-md__more2">ほかのやりとり ' + ths.slice(1).map(function (t) { return '<a href="#/inbox/' + esc(encodeURIComponent(t.id)) + '">' + esc(t.kind) + '（' + esc(U.fmtShort(t.updatedAt)) + '）</a>'; }).join('・') + '</p>' : '')
        : AU.empty('まだやりとりはありません。', m.status !== 'left' ? '<button type="button" class="btn btn-ink btn-s" data-md-msg="' + esc(m.no) + '"' + dis('members') + '>メッセージを送る</button>' : '') });
    var ctP = AU.panel({ title: '声かけの記録', id: 'mdContacts', flush: true, count: cts.length + '件',
      body: cts.length ? '<ul class="a-md__feed">' + cts.map(function (c) {
        var tp = byId(P.TEMPLATES, c.template);
        return '<li><time class="num" datetime="' + esc(c.at) + '">' + esc(U.fmtShort(c.at)) + '</time><span class="a-md__feedt">' + esc(tp ? tp.name : '声かけ') + '・' + esc(staffLabel(c.by)) + '</span></li>';
      }).join('') + '</ul>' : AU.empty('まだ声をかけていません。') });
    var side = '';
    if (ivs.length) side += AU.panel({ title: '面談', id: 'mdIv', flush: true, actions: '<a class="ad-panel__link" href="#/onboarding?view=interviews">面談の一覧</a>',
      body: '<ul class="a-md__feed">' + ivs.map(function (x) {
        return '<li><time class="num" datetime="' + esc(x.at) + '">' + esc(U.fmtShort(x.at, true)) + '</time><span class="a-md__feedt">' + AU.status('interview', x.status) + '</span>' +
          (x.status === 'pending' ? '<button type="button" class="btn btn-ghost btn-s" data-md-iv="' + esc(x.id) + '"' + dis('members') + '>確定する</button>' : '') + '</li>';
      }).join('') + '</ul>' });
    if (exs.length) side += AU.panel({ title: '専門家への相談', id: 'mdEx', flush: true, actions: '<a class="ad-panel__link" href="#/inbox?view=experts">引き継ぎの一覧</a>',
      body: '<ul class="a-md__feed">' + exs.map(function (x) {
        var ex = byId(DATA.EXPERTS, x.expert) || { title: '専門家' };
        return '<li><time class="num" datetime="' + esc(x.at) + '">' + esc(U.fmtShort(x.at)) + '</time><span class="a-md__feedt">' + esc(ex.title) + '</span>' + AU.status('expert', x.status) + '</li>';
      }).join('') + '</ul>' });
    return '<div class="a-md__cols"><div class="a-md__col">' + thP + '</div><div class="a-md__col">' + ctP + side + '</div></div>';
  }

  /* ---------- 運営メモとタグ ---------- */
  function tabMemo(ctx, m) {
    var ex = AD.db.state.members[m.no] || {};
    var mine = m.tags || [];
    var all = P.allTags(); mine.forEach(function (t) { if (all.indexOf(t) < 0) all.push(t); });
    var memo = AU.panel({ title: '運営メモ', id: 'mdMemoP', body:
      '<form id="mdMemoForm" class="a-md__memo" data-md-memo="' + esc(m.no) + '" novalidate>' +
        '<label class="sr-only" for="mdMemo">運営メモ</label>' +
        '<textarea class="textarea" id="mdMemo" name="memo" rows="6" maxlength="1000" placeholder="会員には見えません">' + esc(m.memo || '') + '</textarea>' +
        '<div class="a-md__memobar"><span class="a-md__memometa">' + (ex.memoAt ? esc(staffLabel(ex.memoBy)) + '・' + esc(U.fmtShort(ex.memoAt, true)) : '') + '</span>' +
          '<button type="submit" class="btn btn-ink btn-s"' + dis('members') + '>保存する</button></div>' +
      '</form>' });
    var tags = AU.panel({ title: 'タグ', id: 'mdTags', body:
      '<div class="chips a-md__tags" role="group" aria-label="タグ">' + all.map(function (t) {
        var on = mine.indexOf(t) >= 0;
        return '<button type="button" class="chip" aria-pressed="' + on + '" data-md-tag="' + esc(t) + '">' + esc(t) + '</button>';
      }).join('') + '</div>' +
      '<form id="mdTagForm" class="a-md__tagadd" data-md-tagform="' + esc(m.no) + '" novalidate>' +
        '<label class="sr-only" for="mdTagNew">新しいタグ</label><input class="input" id="mdTagNew" name="tag" maxlength="16" placeholder="新しいタグ" autocomplete="off">' +
        '<button type="submit" class="btn btn-ghost btn-s"' + dis('members') + '>足す</button></form>' });
    var pays = {}; payments(m).forEach(function (p) { pays[p.id] = 1; });
    var log = AD.db.state.audit.filter(function (a) { var t = a.target || {}; return t.id === m.no || (t.type === 'payment' && pays[t.id]); });
    var logP = AU.panel({ title: '操作の記録', id: 'mdAudit', flush: true, count: log.length + '件', actions: '<a class="ad-panel__link" href="#/settings?tab=audit">すべての操作の記録</a>',
      body: log.length ? '<ul class="a-md__log">' + log.slice(0, 30).map(function (a) {
        return '<li><time class="num" datetime="' + esc(a.at) + '">' + esc(U.fmtShort(a.at, true)) + '</time><span class="a-md__logwho">' + esc(staffLabel(a.by)) + '</span>' +
          '<span class="a-md__logwhat"><b>' + esc(a.label) + '</b>' + (a.detail ? '<span class="a-md__logdetail">' + esc(a.detail) + '</span>' : '') + (a.reason ? '<span class="a-md__paysub">理由：' + esc(a.reason) + '</span>' : '') + '</span></li>';
      }).join('') + '</ul>' : AU.empty('この会員への操作の記録はまだありません。') });
    return '<div class="a-md__cols"><div class="a-md__col">' + memo + tags + '</div><div class="a-md__col">' + logP + '</div></div>';
  }

  /* ============================================================
     押したとき
     ============================================================ */
  function member() { return cur ? AD.data.member(cur.params[0]) : null; }
  function payOf(id) { var m = member(); return m ? payments(m).filter(function (p) { return p.id === id; })[0] || null : null; }
  function refresh(focus) { if (cur) cur.refresh(focus ? { focus: focus } : undefined); }

  /* 返金の本体は AD.ops.refund。返金した決済が、会員ページの会員（デモ会員）が紹介した方のものなら、
     会員ページの紹介の明細も取消になる（AD.ops.refund の中の R.voidReward({ no, at })。数は r.liveVoided） */
  function refundWithReward(p, amount, reason) { return AD.ops.refund(p.id, amount, reason); }
  /* デモ会員が紹介した方の決済なら、その分の紹介報酬も取消になることを返金の窓に書く */
  function referredNote(p) {
    var lv = AD.data.live(), m = AD.data.member(p.no);
    return !p.live && m && m.referredBy && m.referredBy === lv.no ? '\n' + lv.name + 'さんの紹介報酬（この決済の分）も取消になります。' : '';
  }
  function voidedText(r) {
    return (r.voided ? '（紹介報酬 ' + r.voided + '件を取消）' : '') +
      (r.liveVoided ? '。' + AD.data.live().name + 'さんの紹介報酬の明細も取消にしました' : '');
  }
  function doRefund(p) {
    var m = member(); if (!m || !p || p.status !== 'paid') return;
    AU.act({
      title: '返金する', ok: '返金する', danger: true,
      text: U.fmtDate(p.at) + 'の請求（' + yen(p.amount) + '）を返金します。Stripe から会員のカードに戻ります。' + (p.live ? '\n会員ページの領収書も「返金済み」になり、本人にお知らせが届きます。' : '') + referredNote(p),
      fields: '<label class="field"><span>返金する金額（円）</span><input class="input num" type="number" name="amount" min="1" max="' + esc(p.amount) + '" step="1" value="' + esc(p.amount) + '" inputmode="numeric" required></label>',
      reasons: ['二重の請求', '解約の申し出が更新日に間に合わなかった', '入会直後の解約', 'サービスの不具合'],
      // 返金の本体は AD.ops.refund（支払いの画面と同じ。まだ払っていない紹介報酬の取消と、操作の記録の形がそろう）
      run: function (reason, data) { return refundWithReward(p, data.amount, reason); },
      audit: function (reason, data, res) { return res.audit; }
    }).then(function (res) {
      if (!res) return;
      U.toast(yen(res.amount) + 'を返金しました' + voidedText(res) + (res.live ? '。会員ページの領収書も変わりました' : ''), 'ok');
      refresh('[data-md-receipt]');
    });
  }
  function doRetry(p) {
    var m = member(); if (!m || !p || p.status !== 'failed' || p.live) return;
    AU.act({
      title: '決済をやり直す', ok: 'やり直す', kind: 'ink', reason: 'optional',
      text: U.fmtDate(p.at) + 'の請求（' + yen(p.amount) + '）を、登録のカード（' + (p.card || m.card) + '）でもう一度請求します。',
      run: function () {
        if (p.failure && p.failure.code === 'expired_card') return { ok: false, error: 'カードの有効期限が切れているため通りません。会員にカードの更新を頼んでください。' };
        AD.db.update(function (s) {
          var x = byId(s.payments, p.id); if (!x) return;
          x.status = 'paid'; x.attempts = (x.attempts || 1) + 1; x.recovered = true; x.failure = null; x.paidAt = nowIso();
          x.receiptNo = x.receiptNo || 'R' + AD.data.monthKey(x.at).replace('-', '') + '-' + String(Math.floor(Math.random() * 90000) + 10000);
          var ex = s.members[m.no] = s.members[m.no] || { tags: [], memo: '' };
          ex.status = 'active';
        });
        return { ok: true };
      },
      audit: { action: 'payment_retry', label: '決済をやり直した', target: { type: 'payment', id: p.id, name: m.name + '（' + m.no + '）' }, detail: DATA.md(p.at) + 'の請求・' + yen(p.amount) },
      done: '決済が通りました。状態を有効に戻しました'
    }).then(function (res) { if (res) refresh(); });
  }
  function doContact() {
    var m = member(); if (!m) return;
    P.compose([m], { template: 'payment', status: 'doing',
      audit: { action: 'payment_contact', label: '支払いエラーの連絡をした', target: mt(m), detail: 'メッセージ' } }).then(function (res) { if (res) refresh(); });
  }
  function doContract(kind) {
    var m = member(); if (!m) return;
    var nb = nextBill(m);
    if (kind === 'cancel') {
      AU.act({
        title: '解約の手続きをする', ok: '解約予定にする', danger: true,
        text: m.name + 'さんの解約を代わりに受け付けます。' + (nb ? U.fmtDate(new Date(new Date(nb).getTime() - 60000)) + 'まで使えて、そのあとの請求は止まります。' : ''),
        fields: '<label class="field"><span>解約の理由</span><select class="select" name="why" required>' + CANCEL_REASONS.map(function (r) { return '<option>' + esc(r) + '</option>'; }).join('') + '</select></label>',
        reasonLabel: '受け付けた経緯',
        reasons: ['本人からメッセージで申し出があった', '会員ページで手続きができないと連絡があった'],
        run: function (reason, data) {
          // デモ会員は会員ページの解約（R.cancelPlan。理由も残り、会員ページも「解約予定」になる）
          if (m.live) { R.cancelPlan({ reasons: [data.why] }); }
          AD.db.update(function (s) {
            var ex = s.members[m.no] = s.members[m.no] || { tags: [], memo: '' };
            ex.cancelReason = data.why;
            if (!m.live) { ex.status = 'canceling'; ex.cancelAt = new Date(new Date(nb).getTime() - 60000).toISOString(); }
          });
          return { ok: true };
        },
        audit: function (reason, data) { return { action: 'cancel', label: '解約の手続きをした', target: mt(m), reason: reason, detail: data.why }; },
        done: '解約予定にしました'
      }).then(function (res) { if (res) refresh('[data-md-resume]'); });
    } else if (kind === 'resume' || kind === 'activate') {
      AU.act({
        title: kind === 'resume' ? '解約を取り消す' : '有効に戻す', ok: kind === 'resume' ? '取り消す' : '有効に戻す', kind: 'ink', reason: 'optional',
        text: kind === 'resume' ? m.name + 'さんの解約を取り消して、有効に戻します。次の請求日から今までどおり請求します。' : m.name + 'さんの契約を有効に戻します。',
        run: function () {
          if (m.live) { if (kind === 'resume') R.resumePlan(); else R.setMemberStatus('active'); }
          AD.db.update(function (s) {
            var ex = s.members[m.no] = s.members[m.no] || { tags: [], memo: '' };
            ex.cancelReason = '';
            if (!m.live) { ex.status = 'active'; ex.cancelAt = null; }
          });
          return { ok: true };
        },
        audit: { action: kind === 'resume' ? 'cancel_undo' : 'reactivate', label: kind === 'resume' ? '解約を取り消した' : '契約を有効に戻した', target: mt(m) },
        done: kind === 'resume' ? '解約を取り消しました' : '有効に戻しました'
      }).then(function (res) { if (res) refresh('[data-md-cancel]'); });
    }
  }
  function doReset() {
    var m = member(); if (!m) return;
    var tpl = (DATA.MAIL_TEMPLATES || {}).reset;
    var prev = tpl ? '<div class="a-md__mail"><p class="a-md__mailsub">' + esc(tpl.email.subject) + '</p><p class="a-md__mailbody">' +
      U.jp(tpl.email.body.replace(/\{name\}/g, m.realName || m.name).replace(/\{url\}/g, 'https://…/member.html#/reset?token=…'), { br: true }) + '</p></div>' : '';
    AU.act({
      title: 'パスワードの再設定メールを送る', ok: '送る', kind: 'ink', reason: 'optional', cls: 'a-member',
      text: masked(m.email) + 'に、パスワードを決め直すリンク（24時間有効）を送ります。いまのパスワードは、会員がリンクから決め直すまで使えます。',
      html: prev,
      reasons: ['本人から「メールが届かない」と連絡があった', '本人から「ログインできない」と連絡があった'],
      audit: { action: 'password_reset', label: 'パスワードの再設定メールを送った', target: mt(m) }
    }).then(function (res) {
      if (!res) return;
      U.toast('記録しました。本番では' + masked(m.email) + 'にメールが届きます', 'ok');
      refresh();
    });
  }
  function doDataDone(id) {
    var m = member(); if (!m) return;
    var x = (AD.ops.dataRequests() || []).filter(function (y) { return y.id === id; })[0];
    if (!x || x.status !== 'received') { U.toast('この申込みはもう受付中ではありません', 'error'); refresh(); return; }
    var ex = x.kind === 'export';
    AU.act({
      title: ex ? '記録の書き出しを済みにする' : '記録の削除の申込みを済みにする', ok: '済みにする', kind: 'ink', reason: 'optional', cls: 'a-member',
      text: ex ? m.name + 'さんの会員ページのアカウントに、書き出したファイルの「保存する」が出ます。本人にお知らせが届きます。'
        : m.name + 'さんの削除の手続きを済みにします。会員期間が終わってから30日以内に、アカウントと記録を削除します。本人にお知らせが届きます。',
      run: function () { return AD.ops.completeDataRequest(id); },
      audit: function (reason, d, res) { return res.audit; },
      done: (ex ? '記録の書き出し' : '記録の削除の申込み') + 'を済みにしました'
    }).then(function (res) { if (res) refresh('#mdData'); });
  }
  function doSuspend() {
    var m = member(); if (!m) return;
    var on = !m.suspended;
    AU.act({
      title: on ? 'ログインを止める' : 'ログインを再開する', ok: on ? '止める' : '再開する', danger: on, kind: on ? null : 'ink', reason: on ? true : 'optional',
      text: on ? m.name + 'さんは会員ページに入れなくなります。契約と請求はそのままです。' + (m.live ? '\n開いている会員ページもすぐに止まります。' : '')
        : m.name + 'さんが、また会員ページに入れるようにします。',
      reasons: on ? ['規約に反する投稿の確認中', '不正な利用の疑い', '本人から依頼があった'] : ['確認が終わった'],
      // AD.ops.setSuspended：運営画面の記録と、デモ会員なら会員ページの R.setLoginBlocked（開いているタブがすぐ変わる）
      run: function (reason) { return AD.ops.setSuspended(m.no, on, reason); },
      audit: function (reason, d, res) { return res.audit; },
      done: on ? 'ログインを止めました' + (m.live ? '。会員ページも止まりました' : '') : 'ログインを再開しました' + (m.live ? '。会員ページに入れます' : '')
    }).then(function (res) { if (res) refresh(); });
  }
  function doGrant() {
    var m = member(); if (!m) return;
    var rules = DATA.POINT_RULES.filter(function (r) { return r.id !== 'thanks'; });
    AU.act({
      title: 'ポイントを付ける', ok: '付ける', kind: 'ink',
      text: m.name + 'さんに貢献ポイントを付けます。会員の記録とランキングに入ります。',
      fields: '<label class="field"><span>ルール</span><select class="select" name="rule" required>' + rules.map(function (r) {
        return '<option value="' + esc(r.id) + '">' + esc(r.name) + '（+' + esc(r.pt) + 'pt）</option>';
      }).join('') + '</select></label>' +
        '<label class="field"><span>リンク<span class="opt">任意</span></span><input class="input" name="link" maxlength="120" placeholder="#/feed/p27" autocomplete="off"></label>',
      reasonLabel: '理由（会員の記録に出ます）',
      reasons: ['イベントを手伝った（受付）', '成果発表会で発表した', '成果を報告した', '新入生の質問に答えた'],
      run: function (reason, data) {
        var link = String(data.link || '').trim();
        if (link && !/^#\//.test(link)) return { ok: false, errors: { link: '会員ページの中のリンク（#/…）にしてください' } };
        return grant(m, data.rule, reason, link);
      },
      audit: function (reason, data, res) { return res.audit; },
      done: 'ポイントを付けました'
    }).then(function (res) { if (res) refresh('[data-md-grant]'); });
  }
  function doRevoke(id) {
    var m = member(); if (!m) return;
    var row = pointRows(m).filter(function (r) { return r.id === id; })[0];
    if (!row || row.revoked) return;
    AU.act({
      title: 'ポイントを取り消す', ok: '取り消す', danger: true,
      text: '「' + row.why + '」の +' + row.pt + 'pt を取り消します。会員の記録とランキングから消えます。',
      reasons: ['同じことに2回付けていた', '付ける相手を間違えた', '内容が条件に合わなかった'],
      run: function (reason) { return revoke(m, row, reason); },
      audit: function (reason, d, res) { return Object.assign({}, res.audit, { target: mt(m), detail: '-' + row.pt + 'pt（' + row.why + '）' }); },
      done: '取り消しました'
    }).then(function (res) { if (res) refresh('[data-md-grant]'); });
  }
  function doReceipt(p) {
    var m = member(); if (!m || !p) return;
    U.confirmBox('領収書を送り直しますか', U.fmtDate(p.at) + 'の請求（' + yen(p.amount) + '・' + (p.receiptNo || '') + '）の領収書を、' + masked(m.email) + 'に送ります。', '送る', false, { kind: 'ink' })
      .then(function (ok) {
        if (!ok) return;
        AD.db.audit({ action: 'receipt_resend', label: '領収書を送り直した', target: { type: 'payment', id: p.id, name: m.name + '（' + m.no + '）' }, detail: p.receiptNo || '' });
        U.toast('記録しました。本番では' + masked(m.email) + 'に領収書が届きます', 'ok');
        refresh();
      });
  }

  AD.screens.member = {
    nav: 'members',
    title: function (ctx) { var m = find(ctx); return m ? m.name : 'ページが見つかりません'; },
    render: function (ctx) {
      var m = find(ctx);
      if (!m) return notFound();
      var tab = ctx.query.tab && TABS.some(function (t) { return t[0] === ctx.query.tab; }) ? ctx.query.tab : 'profile';
      var a = activity(m);
      var ths = AD.data.threads().filter(function (t) { return t.no === m.no; });
      var open = ths.filter(function (t) { return t.status === 'open'; }).length;
      var failed = m.status === 'past_due' ? 1 : 0;
      var tabs = AU.tabs(TABS.map(function (t) {
        var n = t[0] === 'msg' && open ? open : t[0] === 'pay' && failed ? '!' : '';
        return { id: t[0], label: t[1], href: tabHref(m, t[0]), n: n, alert: !!n };
      }), tab, '会員の詳細');
      var body = tab === 'pay' ? tabPay(m) : tab === 'xp' ? tabXp(ctx, m, a) : tab === 'courses' ? tabCourses(m, a) : tab === 'gigs' ? tabGigs(m, a) :
        tab === 'ref' ? tabRef(m) : tab === 'points' ? tabPoints(ctx, m) : tab === 'msg' ? tabMsg(m) : tab === 'memo' ? tabMemo(ctx, m) : tabProfile(m, a);
      // 役割で押せないもの（連絡・契約・ログイン・メモ）があるときは、見出しの下にひとことだけ
      var note = AU.can('members') ? '' : AU.roleNote('members', '会員への連絡・契約・ログインの対応', { strict: true, only: true });
      return '<div class="a-member' + (m.status === 'left' ? ' is-left' : '') + '">' + head(ctx, m) + note + alerts(m) + facts(m) + tabs +
        '<div class="a-md__body" data-md-tab="' + esc(tab) + '">' + body + '</div></div>';
    },
    mount: function (root, ctx) {
      cur = ctx;
      if (root.__boundMember) return;
      root.__boundMember = true;
      root.addEventListener('click', function (e) {
        var t = e.target, b;
        if (!t.closest('.a-member')) return;
        if (b = t.closest('button[disabled]')) return;
        if ((b = t.closest('[data-md-msg]'))) { var m = member(); if (m && AU.need('members')) P.compose([m]).then(function (res) { if (res) refresh(); }); return; }
        if ((b = t.closest('[data-md-copy]'))) { var no = b.getAttribute('data-md-copy'); U.copyText(no).then(function () { U.toast(no + 'をコピーしました', 'ok'); }); return; }
        if ((b = t.closest('[data-md-copymail]'))) { var mm = member(); if (mm && mm.email) U.copyText(mm.email).then(function () { U.toast('メールアドレスをコピーしました', 'ok'); }); return; }
        if ((b = t.closest('[data-md-stripe]'))) { U.toast('本番では Stripe のダッシュボードで ' + b.getAttribute('data-md-stripe') + ' を開きます'); return; }
        if ((b = t.closest('[data-md-reset]'))) { if (AU.need('members')) doReset(); return; }
        if ((b = t.closest('[data-md-suspend]'))) { if (AU.need('members')) doSuspend(); return; }
        if ((b = t.closest('[data-md-datadone]'))) { if (AU.need('members')) doDataDone(b.getAttribute('data-md-datadone')); return; }
        if ((b = t.closest('[data-md-refund]'))) { if (AU.need('money')) doRefund(payOf(b.getAttribute('data-md-refund'))); return; }
        if ((b = t.closest('[data-md-retry]'))) { if (AU.need('money')) doRetry(payOf(b.getAttribute('data-md-retry'))); return; }
        if ((b = t.closest('[data-md-receipt]'))) { if (AU.need('money')) doReceipt(payOf(b.getAttribute('data-md-receipt'))); return; }
        if ((b = t.closest('[data-md-contact]'))) { if (AU.need('money')) doContact(); return; }
        if ((b = t.closest('[data-md-cancel]'))) { if (AU.need('members')) doContract('cancel'); return; }
        if ((b = t.closest('[data-md-resume]'))) { if (AU.need('members')) doContract('resume'); return; }
        if ((b = t.closest('[data-md-activate]'))) { if (AU.need('members')) doContract('activate'); return; }
        if ((b = t.closest('[data-md-grant]'))) { if (AU.need('points')) doGrant(); return; }
        if ((b = t.closest('[data-md-revoke]'))) { if (AU.need('points')) doRevoke(b.getAttribute('data-md-revoke')); return; }
        if ((b = t.closest('[data-md-iv]'))) {
          if (!AU.need('members')) return;
          var iv = AD.data.queues().interviews.filter(function (x) { return x.id === b.getAttribute('data-md-iv'); })[0];
          var r2 = P.confirmInterview(iv);
          U.toast(r2.ok ? '面談を確定しました' : r2.error, r2.ok ? 'ok' : 'error');
          refresh();
          return;
        }
        if ((b = t.closest('[data-md-tag]'))) {
          var tag = b.getAttribute('data-md-tag'), mem = member(); if (!mem || !AU.need('members')) return;
          var on = b.getAttribute('aria-pressed') !== 'true';
          AD.db.update(function (s) {
            var ex = s.members[mem.no] = s.members[mem.no] || { tags: [], memo: '' };
            ex.tags = (ex.tags || []).filter(function (x) { return x !== tag; });
            if (on) ex.tags.push(tag);
          });
          U.toast(on ? '「' + tag + '」を付けました' : '「' + tag + '」を外しました', 'ok');
          refresh();
        }
      });
      root.addEventListener('submit', function (e) {
        var f = e.target, m = member();
        if (!m || !f.closest('.a-member')) return;
        if (!AU.can('members')) { e.preventDefault(); AU.need('members'); return; }
        if (f.matches('[data-md-memo]')) {
          e.preventDefault();
          var v = String(f.memo.value || '').trim();
          AD.db.update(function (s) {
            var ex = s.members[m.no] = s.members[m.no] || { tags: [], memo: '' };
            ex.memo = v; ex.memoAt = nowIso(); ex.memoBy = staffId();
          });
          U.toast('メモを保存しました', 'ok');
          refresh('#mdMemo');
        } else if (f.matches('[data-md-tagform]')) {
          e.preventDefault();
          var tg = String(f.tag.value || '').trim();
          if (!tg) { U.fieldErrors(f, { tag: 'タグの名前を入れてください' }); return; }
          AD.db.update(function (s) {
            var ex = s.members[m.no] = s.members[m.no] || { tags: [], memo: '' };
            ex.tags = ex.tags || [];
            if (ex.tags.indexOf(tg) < 0) ex.tags.push(tg);
          });
          U.toast('「' + tg + '」を付けました', 'ok');
          refresh('#mdTagNew');
        }
      });
    }
  };
})();
