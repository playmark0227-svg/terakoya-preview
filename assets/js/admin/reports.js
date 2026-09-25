/* ============================================================
   運営画面：レポート（#/reports）
   ?range=6|12（何か月ぶんを見るか。既定 6）  ?course=<講座id>（その講座の回ごとの進み）
   - 在籍の推移・入会と退会（理由つき）・入会月ごとの継続・講座の修了と止まる回・イベントの参加・紹介からの入会（合計だけ）。
   - グラフは dataviz の決まり：1つの系列は1色（藍の一段明るいもの）、入会と退会は藍と赤茶の2色（色の見分けを確かめた組）、
     継続は藍の濃淡（明るい→濃い）。数は全部に付けず、最後の月だけ。どの数も「表で見る」とCSVで読める。
     マウスでもキーボードでも、印に合わせると数が出る（#rpTip）。
   - 数はすべて名簿（DATA.ROSTER＋デモ会員）と運営の記録から、その場で数える。講座の回ごとの進みとイベントの参加は、
     本番では視聴と出欠の記録から数える（試作版は名簿のXPから決まった数を作っている）。
   - 紹介からの入会は合計と割合だけ。誰が何人紹介したかは出さない（画面づくりの約束 §3）。
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, AD = CLG.admin, AU = AD.ui, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon;
  var cur = null;
  var DAY = 86400000;
  var REASONS = ['料金', '時間がない', '内容が合わない', '目的を達成した', 'その他'];
  var SEQ = ['#eef3f9', '#d3e0ef', '#a9c1de', '#6f95c3', '#2e6aa6', '#1f4c7c'];   // 継続の濃淡（藍の明るい→濃い）

  function hashOf(s) { var h = 2166136261; String(s).split('').forEach(function (c) { h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; }); return h >>> 0; }
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }
  /* 目盛りの上の端：count 本の目盛りが切りのいい数になるように（0 / 100 / 200 / 300） */
  function niceMax(v, count) {
    count = count || 4;
    if (v <= 0) return count;
    var raw = v / count, mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), m = raw / mag;
    var step = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * mag;
    if (step < 1) step = 1;
    return Math.ceil(v / step) * step;
  }
  function tip() { return Array.prototype.slice.call(arguments).join('|'); }

  /* ============================================================
     数える（1回の描画で1度だけ）
     ============================================================ */
  var memo = { key: '', v: null };
  function months(range, first) {
    var n = CLG.now(), out = [];
    for (var k = -(range - 1); k <= 0; k++) {
      var a = new Date(n.getFullYear(), n.getMonth() + k, 1), b = new Date(n.getFullYear(), n.getMonth() + k + 1, 1);
      if (b <= first) continue;
      out.push({ off: k, start: a, end: k === 0 ? n : b, key: AD.data.monthKey(a),
        label: (a.getMonth() + 1) + '月', long: (a.getFullYear() !== n.getFullYear() ? a.getFullYear() + '年' : '') + (a.getMonth() + 1) + '月' + (k === 0 ? '（' + n.getDate() + '日まで）' : '') });
    }
    return out;
  }
  function isLeftBy(m, t) { return m.status === 'left' && m.leftAt && new Date(m.leftAt) <= t; }
  function compute(range) {
    var ms = AD.data.members(), n = CLG.now();
    var key = range + ':' + ms.length + ':' + AD.data.monthKey(n) + ':' + n.getDate() + ':' + JSON.stringify(AD.data.live().row && [AD.data.live().row.status, AD.data.live().row.xp]);
    if (memo.key === key) return memo.v;
    var first = ms.reduce(function (a, m) { var d = new Date(m.joinedAt); return d < a ? d : a; }, n);
    var mo = months(range, first);
    var rows = mo.map(function (x, i) {
      var joined = ms.filter(function (m) { var d = new Date(m.joinedAt); return d >= x.start && d < (i === mo.length - 1 ? new Date(n.getTime() + 1) : x.end); });
      var left = ms.filter(function (m) { var d = m.status === 'left' && m.leftAt ? new Date(m.leftAt) : null; return d && d >= x.start && d < x.end; });
      var startN = ms.filter(function (m) { return new Date(m.joinedAt) < x.start && !isLeftBy(m, x.start); }).length;
      var endN = ms.filter(function (m) { return new Date(m.joinedAt) <= x.end && !isLeftBy(m, x.end); }).length;
      var reasons = {};
      left.forEach(function (m) { var r = REASONS.indexOf(m.cancelReason) >= 0 ? m.cancelReason : '未回答'; reasons[r] = (reasons[r] || 0) + 1; });
      var ref = joined.filter(function (m) { return !!m.referredBy; }).length;
      return Object.assign({}, x, { joined: joined.length, left: left.length, startN: startN, endN: endN, reasons: reasons, ref: ref,
        churn: startN ? left.length / startN : 0 });
    });
    memo = { key: key, v: { ms: ms, rows: rows, first: first } };
    return memo.v;
  }

  /* 入会月ごとの継続：入会から1か月・2か月…たった人のうち、まだ在籍している人の割合 */
  function cohorts(ms, rows) {
    var n = CLG.now(), maxK = rows.length;
    return rows.map(function (x) {
      var c = ms.filter(function (m) { return AD.data.monthKey(m.joinedAt) === x.key; });
      var cells = [];
      for (var k = 1; k <= maxK; k++) {
        var elig = c.filter(function (m) { return DATA.addMonths(m.joinedAt, k) <= n; });
        if (elig.length < 3) { cells.push(null); continue; }
        var kept = elig.filter(function (m) { return !(m.status === 'left' && m.leftAt && new Date(m.leftAt) < DATA.addMonths(m.joinedAt, k)); }).length;
        cells.push({ k: k, v: kept / elig.length, n: elig.length, kept: kept });
      }
      return { key: x.key, label: x.long.replace(/（.*$/, ''), size: c.length, cells: cells };
    });
  }

  /* 講座：開いている人・始めた人・修了した人と、回ごとの進み（試作版は名簿のXPから決まった数を作る） */
  var cmemo = { key: '', v: null };
  function courseStats(ms) {
    var live = AD.data.live();
    var key = ms.length + ':' + JSON.stringify(Object.keys(CLG.store.state.done || {}).length) + ':' + (live.row ? live.row.level : 0);
    if (cmemo.key === key) return cmemo.v;
    var act = ms.filter(function (m) { return m.status !== 'left'; });
    var v = DATA.COURSES.map(function (c) {
      var n = c.lessons.length, hard = 1 + hashOf(c.id) % Math.max(1, n - 1);
      var reach = []; for (var i = 0; i < n; i++) reach.push(0);
      var open = act.filter(function (m) { return m.level >= c.level; }), started = 0, done = 0;
      open.forEach(function (m) {
        var k = 0;
        if (m.live) k = R.courseState(c).done;
        else {
          var r = DATA.rng(hashOf(m.no + ':' + c.id));
          var gap = m.level - c.level, startP = c.level === 1 ? 0.93 : gap >= 1 ? 0.84 : 0.55;
          if (r() < startP) { k = 1; while (k < n && r() < (k === hard ? 0.72 : 0.95 - (gap === 0 ? 0.08 : 0))) k++; }
        }
        if (k > 0) started++;
        if (k >= n) done++;
        for (var j = 0; j < k; j++) reach[j]++;
      });
      var stop = null;
      for (var s = 1; s < n; s++) {
        var drop = reach[s - 1] ? 1 - reach[s] / reach[s - 1] : 0;
        if (!stop || drop > stop.drop) stop = { i: s, drop: drop, lesson: c.lessons[s] };
      }
      return { id: c.id, title: c.title, level: c.level, n: n, open: open.length, started: started, done: done, rate: started ? done / started : 0, reach: reach, stop: stop, course: c };
    });
    cmemo = { key: key, v: v };
    return v;
  }

  /* イベント：これまでの回（定期の会は、次の回から間隔をさかのぼって作る）と、これからの予約 */
  function eventStats(rangeStart, first) {
    var n = CLG.now(), groups = {};
    DATA.EVENTS.forEach(function (e) {
      var g = e.series === 'offkai' || !e.series ? e.title.replace(/（.*$/, '') : e.series;
      (groups[g] = groups[g] || { key: g, kind: e.kind, title: e.title.replace(/[（：(].*$/, ''), list: [] }).list.push(e);
    });
    var past = [], up = [];
    Object.keys(groups).forEach(function (k) {
      var g = groups[k], list = g.list.sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
      var cap = Math.max.apply(null, list.map(function (e) { return e.cap; }));
      var base = Math.max.apply(null, list.map(function (e) { return e.count + (R.isReserved(e.id) ? 1 : 0); }));
      list.forEach(function (e) { if (new Date(e.at) > n) up.push({ id: e.id, key: k, title: e.title, kind: e.kind, at: e.at, reserved: e.count + (R.isReserved(e.id) ? 1 : 0), cap: e.cap }); });
      var step = list.length > 1 ? Math.round((new Date(list[1].at) - new Date(list[0].at)) / DAY / 7) * 7 : 28;
      if (step <= 0) step = 7;
      for (var j = 1; j < 60; j++) {
        var at = g.key === 'showcase' ? new Date(DATA.lastDow(-j, 5, 20)) : new Date(new Date(list[0].at).getTime() - j * step * DAY);
        if (at >= n) continue;
        if (at < rangeStart || at < first) break;
        var r = DATA.rng(hashOf(k + at.toISOString().slice(0, 10)));
        var reserved = Math.max(2, Math.min(cap, Math.round(base * (0.7 + r() * 0.45))));
        var rate = g.kind === 'offline' ? 0.84 + r() * 0.12 : g.kind === 'showcase' ? 0.72 + r() * 0.14 : 0.58 + r() * 0.2;
        past.push({ key: k, title: g.title, kind: g.kind, at: at.toISOString(), reserved: reserved, attended: Math.round(reserved * rate), cap: cap });
      }
    });
    var byKey = {};
    past.forEach(function (p) {
      var s = byKey[p.key] = byKey[p.key] || { key: p.key, title: p.title, kind: p.kind, sessions: 0, reserved: 0, attended: 0 };
      s.sessions++; s.reserved += p.reserved; s.attended += p.attended;
    });
    var series = Object.keys(byKey).map(function (k) { var s = byKey[k]; s.rate = s.reserved ? s.attended / s.reserved : 0; s.avg = s.sessions ? s.attended / s.sessions : 0; return s; })
      .sort(function (a, b) { return b.sessions - a.sessions || a.title.localeCompare(b.title, 'ja'); });
    return { past: past.sort(function (a, b) { return new Date(b.at) - new Date(a.at); }), up: up.sort(function (a, b) { return new Date(a.at) - new Date(b.at); }), series: series };
  }

  /* ============================================================
     グラフ（HTML と SVG。文字は HTML で書くので、幅が変わっても大きさが変わらない）
     ============================================================ */
  function xPos(i, n) { return n <= 1 ? 50 : i / (n - 1) * 100; }
  function trendChart(rows) {
    var vals = rows.map(function (r) { return r.endN; }), max = niceMax(Math.max.apply(null, vals.concat([1])) * 1.06, 4), N = rows.length;
    var pts = vals.map(function (v, i) { return [xPos(i, N), 100 - v / max * 100]; });
    var line = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(2) + ' ' + p[1].toFixed(2); }).join(' ');
    var area = line + ' L100 100 L0 100 Z';
    var ticks = [0, 0.25, 0.5, 0.75, 1].map(function (f) { return Math.round(max * f); });
    var last = rows[N - 1], lp = pts[N - 1];
    return '<figure class="rp-chart" aria-label="月末の在籍の推移">' +
      '<div class="rp-plot">' +
        '<div class="rp-y" aria-hidden="true">' + ticks.map(function (t) { return '<span style="bottom:' + (t / max * 100) + '%">' + U.num(t) + '</span>'; }).join('') + '</div>' +
        '<div class="rp-area">' +
          ticks.map(function (t) { return '<i class="rp-gl" style="bottom:' + (t / max * 100) + '%"></i>'; }).join('') +
          '<svg class="rp-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path class="rp-fill" d="' + area + '"/><path class="rp-line" d="' + line + '" vector-effect="non-scaling-stroke"/></svg>' +
          '<span class="rp-dot" style="left:' + lp[0] + '%;top:' + lp[1] + '%" aria-hidden="true"></span>' +
          // 最後の点が上の端に近いときは、数を点の下に出す（見出しの行にかからないように）
          '<span class="rp-end' + (lp[1] < 20 ? ' is-below' : '') + '" style="top:' + lp[1] + '%" aria-hidden="true"><b class="num">' + U.num(last.endN) + '</b>人</span>' +
          // 数を出す押せる範囲は、横幅を月の数で等しく分ける（両端の月も半分の幅にしない。スマホでも指で押せる 40px 前後に）。
          // 縦の線（--x）はその月の点の位置に引く
          rows.map(function (r, i) {
            var left = i * 100 / N, width = 100 / N;
            return '<button type="button" class="rp-hit" style="left:' + left + '%;width:' + width + '%;--x:' + ((xPos(i, N) - left) / width * 100) + '%" data-rp-tip="' + esc(tip(r.long, '在籍 ' + U.num(r.endN) + '人', '入会 ' + r.joined + '人・退会 ' + r.left + '人')) + '" aria-label="' + esc(r.long + ' 在籍' + r.endN + '人') + '"></button>';
          }).join('') +
        '</div>' +
      '</div>' +
      '<div class="rp-x" aria-hidden="true">' + rows.map(function (r, i) { return '<span style="left:' + xPos(i, N) + '%">' + esc(r.label) + '</span>'; }).join('') + '</div>' +
    '</figure>';
  }
  function inOutChart(rows) {
    var mj = Math.max.apply(null, rows.map(function (r) { return r.joined; }).concat([1])), ml = Math.max.apply(null, rows.map(function (r) { return r.left; }).concat([1]));
    var top = niceMax(mj, 2), bot = niceMax(ml, 1), H = top + bot, base = bot / H * 100;
    var last = rows[rows.length - 1];
    return '<figure class="rp-chart" aria-label="月ごとの入会と退会">' +
      '<ul class="rp-legend"><li><i class="rp-key rp-key--a"></i>入会</li><li><i class="rp-key rp-key--b"></i>退会</li></ul>' +
      '<div class="rp-plot">' +
        '<div class="rp-y" aria-hidden="true"><span style="bottom:100%">' + top + '</span><span style="bottom:' + base + '%">0</span><span style="bottom:0%">' + bot + '</span></div>' +
        '<div class="rp-area rp-cols">' +
          '<i class="rp-gl" style="bottom:100%"></i><i class="rp-gl rp-gl--base" style="bottom:' + base + '%"></i><i class="rp-gl" style="bottom:0"></i>' +
          rows.map(function (r, i) {
            var isLast = i === rows.length - 1;
            return '<button type="button" class="rp-col" data-rp-tip="' + esc(tip(r.long, '入会 ' + r.joined + '人', '退会 ' + r.left + '人', '差し引き ' + (r.joined - r.left >= 0 ? '+' : '') + (r.joined - r.left) + '人')) + '" aria-label="' + esc(r.long + ' 入会' + r.joined + '人 退会' + r.left + '人') + '">' +
              '<span class="rp-col__up" style="height:' + (100 - base) + '%"><i class="rp-bar rp-bar--a" style="height:' + (r.joined / top * 100) + '%">' + (isLast ? '<b class="rp-lab num">' + r.joined + '</b>' : '') + '</i></span>' +
              '<span class="rp-col__dn" style="height:' + base + '%"><i class="rp-bar rp-bar--b" style="height:' + (r.left / bot * 100) + '%">' + (isLast && r.left ? '<b class="rp-lab num">' + r.left + '</b>' : '') + '</i></span>' +
            '</button>';
          }).join('') +
        '</div>' +
      '</div>' +
      '<div class="rp-x rp-x--cols" aria-hidden="true">' + rows.map(function (r) { return '<span>' + esc(r.label) + '</span>'; }).join('') + '</div>' +
      '<figcaption class="sr-only">' + esc(last.long + 'は入会' + last.joined + '人・退会' + last.left + '人') + '</figcaption>' +
    '</figure>';
  }
  function hbars(list, unit, tipOf) {
    var max = Math.max.apply(null, list.map(function (x) { return x.n; }).concat([1])), total = list.reduce(function (a, x) { return a + x.n; }, 0);
    return '<ul class="pm-bars rp-hbars">' + list.map(function (x) {
      return '<li class="pm-bars__row"><span class="pm-bars__label" title="' + esc(x.label) + '">' + esc(x.label) + '</span>' +
        '<span class="pm-bars__track" aria-hidden="true"><i style="width:' + (x.n / max * 100) + '%"></i></span>' +
        '<span class="pm-bars__n"><b class="num">' + U.num(x.n) + '</b>' + esc(unit) + (x.sub != null ? '<span class="pm-muted num">' + esc(x.sub) + '</span>' : total ? '<span class="pm-muted num">' + pct(x.n, total) + '%</span>' : '') + '</span></li>';
    }).join('') + '</ul>';
  }
  function tableView(head, body, label) {
    return '<details class="rp-tv"><summary>表で見る</summary><div class="ad-tbl-wrap"><table class="ad-tbl is-dense" aria-label="' + esc(label) + '"><thead><tr>' +
      head.map(function (h, i) { return '<th scope="col"' + (i ? ' class="r"' : '') + '>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      body.map(function (r) { return '<tr>' + r.map(function (c, i) { return i ? '<td class="r num">' + esc(c) + '</td>' : '<th scope="row">' + esc(c) + '</th>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table></div></details>';
  }
  function csvBtn(id) { return '<button type="button" class="btn btn-ghost btn-s" data-rp-csv="' + esc(id) + '">' + icon('download', 'ico-s') + 'CSV</button>'; }

  /* ============================================================
     面
     ============================================================ */
  function kpis(d) {
    var rows = d.rows, last = rows[rows.length - 1], prev = rows[rows.length - 2];
    var joined = rows.reduce(function (a, r) { return a + r.joined; }, 0), left = rows.reduce(function (a, r) { return a + r.left; }, 0), ref = rows.reduce(function (a, r) { return a + r.ref; }, 0);
    var full = rows.filter(function (r) { return r.off < 0 && r.startN; });
    var churn = full.length ? full.reduce(function (a, r) { return a + r.churn; }, 0) / full.length : 0;
    var diff = prev ? last.endN - prev.endN : 0;
    return '<div class="ad-kpis pm-kpis">' +
      AU.kpi({ label: '在籍', value: U.num(last.endN), unit: '人', sub: prev ? '先月末より ' + (diff >= 0 ? '+' : '−') + Math.abs(diff) + '人' : '', href: '#/members' }) +
      AU.kpi({ label: rows.length + 'か月の入会', value: U.num(joined), unit: '人', sub: '月平均 ' + (joined / rows.length).toFixed(1) + '人' }) +
      AU.kpi({ label: rows.length + 'か月の退会', value: U.num(left), unit: '人', sub: '1か月の退会率 ' + (churn * 100).toFixed(1) + '%（平均）' }) +
      AU.kpi({ label: '紹介からの入会', value: U.num(ref), unit: '人', sub: '入会の ' + pct(ref, joined) + '%', href: '#rpRef' }) +
    '</div>';
  }
  function trendPanel(d) {
    var body = trendChart(d.rows) +
      tableView(['月', '月末の在籍', '入会', '退会'], d.rows.map(function (r) { return [r.long, U.num(r.endN) + '人', r.joined + '人', r.left + '人']; }), '月末の在籍の表');
    return AU.panel({ title: '在籍の推移', id: 'rpTrend', cls: 'rp-panel', actions: '<span>月末の人数（今月は今日まで）</span>' + csvBtn('trend'), body: body });
  }
  function inOutPanel(d) {
    var rs = {}, total = 0;
    d.rows.forEach(function (r) { Object.keys(r.reasons).forEach(function (k) { rs[k] = (rs[k] || 0) + r.reasons[k]; total += r.reasons[k]; }); });
    var reasons = REASONS.concat(['未回答']).map(function (k) { return { label: k, n: rs[k] || 0 }; }).filter(function (x) { return x.n || x.label !== '未回答'; })
      .sort(function (a, b) { return (a.label === '未回答') - (b.label === '未回答') || b.n - a.n; });
    var body = '<div class="rp-split"><div class="rp-split__main">' + inOutChart(d.rows) + '</div>' +
      '<div class="rp-split__side"><h3 class="rp-h3">退会の理由（' + total + '人）</h3>' + (total ? hbars(reasons, '人') : AU.empty('この期間の退会はありません。')) + '</div></div>' +
      tableView(['月', '入会', '退会', '差し引き'].concat(REASONS).concat(['未回答']), d.rows.map(function (r) {
        return [r.long, r.joined, r.left, (r.joined - r.left >= 0 ? '+' : '') + (r.joined - r.left)].concat(REASONS.concat(['未回答']).map(function (k) { return r.reasons[k] || 0; }));
      }), '月ごとの入会と退会の表');
    return AU.panel({ title: '入会と退会', id: 'rpInOut', cls: 'rp-panel', actions: csvBtn('inout'), body: body });
  }
  /* 数のある列だけ出す（6か月を見ていても、6か月たった入会月がまだなければ、その列は空になるため） */
  function cohortCols(cs, K) {
    var max = 0;
    cs.forEach(function (c) { c.cells.forEach(function (x, i) { if (x && i + 1 > max) max = i + 1; }); });
    return Math.max(1, Math.min(K, max));
  }
  function cohortPanel(d) {
    var cs = cohorts(d.ms, d.rows), K = cohortCols(cs, d.rows.length);
    var cols = []; for (var k = 1; k <= K; k++) cols.push(k);
    var tbl = '<div class="ad-tbl-wrap"><table class="ad-tbl rp-heat" aria-label="入会月ごとの継続（入会から1か月・2か月…たったときに在籍している割合）"><thead><tr>' +
      '<th scope="col">入会した月</th><th scope="col" class="r">人数</th>' + cols.map(function (k) { return '<th scope="col" class="r">' + k + 'か月</th>'; }).join('') + '</tr></thead><tbody>' +
      cs.slice().reverse().map(function (c) {
        return '<tr><th scope="row">' + esc(c.label) + '</th><td class="r num">' + c.size + '</td>' + c.cells.slice(0, K).map(function (x) {
          if (!x) return '<td class="rp-heat__na"><span class="sr-only">まだ</span></td>';
          // 75%〜100% を6段に分ける（継続はふつう8割より上に集まるので、その幅を細かく見る）
          var step = Math.min(SEQ.length - 1, Math.max(0, Math.floor((x.v - 0.75) / 0.25 * SEQ.length)));
          return '<td class="r num rp-heat__c' + (step >= 4 ? ' is-dark' : '') + '" style="background:' + SEQ[step] + '" tabindex="0" data-rp-tip="' + esc(tip(c.label + '入会・' + x.k + 'か月', '在籍 ' + x.kept + '/' + x.n + '人（' + pct(x.kept, x.n) + '%）')) + '">' + pct(x.kept, x.n) + '%</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="rp-scale" aria-hidden="true"><span>75%以下</span>' + SEQ.map(function (c) { return '<i style="background:' + c + '"></i>'; }).join('') + '<span>100%</span></div>';
    return AU.panel({ title: '入会月ごとの継続', id: 'rpCohort', cls: 'rp-panel', flush: true, actions: '<span>入会から1か月・2か月…たったときに在籍している割合</span>' + csvBtn('cohort'), body: tbl });
  }
  function coursePanel(ctx, d) {
    var cs = courseStats(d.ms), sel = cs.filter(function (c) { return c.id === ctx.query.course; })[0];
    var tbl = '<div class="ad-tbl-wrap"><table class="ad-tbl is-cards is-dense rp-courses" aria-label="講座ごとの修了"><thead><tr>' +
      '<th scope="col">講座</th><th scope="col" class="r">開いている人</th><th scope="col" class="r">始めた</th><th scope="col" class="r">修了</th><th scope="col">修了率（始めた人のうち）</th><th scope="col" class="ad-hide-sm">いちばん止まる回</th></tr></thead><tbody>' +
      cs.map(function (c) {
        var on = sel && sel.id === c.id;
        // 止まる回：狭い幅では列を隠すので、講座名の下にも出す（CSS で幅によって片方だけ見せる）
        var stop = c.stop && c.stop.drop > 0 && c.started >= 5 ? '第' + (c.stop.i + 1) + '回 ' + c.stop.lesson.title : '';
        return '<tr class="is-link' + (on ? ' is-sel' : '') + '" data-tb-href="' + esc(AD.app.hashOf('reports', Object.assign({}, ctx.query, { course: on ? null : c.id }))) + '">' +
          '<td class="is-main"><a href="' + esc(AD.app.hashOf('reports', Object.assign({}, ctx.query, { course: on ? null : c.id }))) + '"' + (on ? ' aria-current="true"' : '') + '><b>' + esc(c.title) + '</b></a><span class="rp-sub">Lv' + c.level + '・' + c.n + '回</span>' +
            (stop ? '<span class="rp-sub rp-stop-inline">止まる回：' + esc(stop) + '</span>' : '') + '</td>' +
          '<td class="r num" data-label="開いている人">' + c.open + '</td><td class="r num" data-label="始めた">' + c.started + '</td><td class="r num" data-label="修了">' + c.done + '</td>' +
          '<td data-label="修了率"><span class="rp-meter"><span class="rp-meter__bar" aria-hidden="true"><i style="width:' + Math.round(c.rate * 100) + '%"></i></span><span class="num">' + Math.round(c.rate * 100) + '%</span></span></td>' +
          '<td class="ad-hide-sm" data-label="止まる回">' + (stop ? esc(stop) + ' <span class="pm-muted num">−' + Math.round(c.stop.drop * 100) + '%</span>' : '<span class="pm-muted">―</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    var detail = '';
    if (sel) {
      var list = sel.course.lessons.map(function (l, i) {
        var prev = i ? sel.reach[i - 1] : sel.started, drop = prev ? 1 - sel.reach[i] / prev : 0;
        return { label: '第' + (i + 1) + '回 ' + l.title, n: sel.reach[i], sub: i ? '−' + Math.round(drop * 100) + '%' : '', hard: sel.stop && sel.stop.i === i };
      });
      detail = '<div class="rp-funnel" id="rpFunnel"><h3 class="rp-h3">' + esc(sel.title) + '：その回まで見終えた人</h3>' + hbars(list, '人') +
        '<p class="rp-note">右の数は、前の回から減った割合です。' + (sel.stop && sel.started >= 5 ? '第' + (sel.stop.i + 1) + '回で止まる人がいちばん多い講座です。' : '') + '</p></div>';
    }
    return AU.panel({ title: '講座の修了と止まる回', id: 'rpCourses', cls: 'rp-panel', flush: true,
      actions: '<span>いま在籍している人</span>' + csvBtn('courses'), body: tbl + detail });
  }
  function eventPanel(d, range) {
    var start = d.rows[0] ? d.rows[0].start : CLG.now();
    var es = eventStats(start, d.first);
    var totalR = es.past.reduce(function (a, p) { return a + p.reserved; }, 0), totalA = es.past.reduce(function (a, p) { return a + p.attended; }, 0);
    var upR = es.up.filter(function (e) { return new Date(e.at) - CLG.now() <= 14 * DAY; });
    var list = es.series.map(function (s) { return { label: s.title, n: Math.round(s.rate * 100), sub: s.sessions + '回・平均' + s.avg.toFixed(0) + '人' }; });
    var body = '<div class="rp-split"><div class="rp-split__main"><h3 class="rp-h3">予約した人のうち参加した割合（' + esc(range) + 'か月・' + es.past.length + '回）</h3>' +
      (list.length ? hbars(list, '%') : AU.empty('この期間のイベントはありません。')) + '</div>' +
      '<div class="rp-split__side"><dl class="rp-stats">' +
        '<div><dt>参加</dt><dd><b class="num">' + U.num(totalA) + '</b>人（予約の' + pct(totalA, totalR) + '%）</dd></div>' +
        '<div><dt>これから2週間の予約</dt><dd><b class="num">' + U.num(upR.reduce(function (a, e) { return a + e.reserved; }, 0)) + '</b>人・' + upR.length + '回</dd></div>' +
        '<div><dt>満席の回</dt><dd><b class="num">' + es.up.filter(function (e) { return e.reserved >= e.cap; }).length + '</b>回</dd></div>' +
      '</dl><a class="btn btn-ghost btn-s" href="#/events">予約を見る</a></div></div>' +
      tableView(['日時', 'イベント', '予約', '参加', '参加率'], es.past.slice(0, 40).map(function (p) { return [U.fmtShort(p.at, true), p.title, p.reserved + '人', p.attended + '人', pct(p.attended, p.reserved) + '%']; }), 'イベントごとの参加の表');
    return AU.panel({ title: 'イベントの参加', id: 'rpEvents', cls: 'rp-panel', actions: csvBtn('events'), body: body });
  }
  function refPanel(d) {
    var rows = d.rows, tj = 0, tr = 0;
    var tbl = '<div class="ad-tbl-wrap"><table class="ad-tbl is-dense rp-ref" aria-label="紹介からの入会（合計だけ）"><thead><tr><th scope="col">月</th><th scope="col" class="r">入会</th><th scope="col" class="r">紹介から</th><th scope="col">割合</th></tr></thead><tbody>' +
      rows.map(function (r) {
        tj += r.joined; tr += r.ref;
        return '<tr><th scope="row">' + esc(r.off === 0 ? r.label + '（途中）' : r.label) + '</th><td class="r num">' + r.joined + '</td><td class="r num">' + r.ref + '</td>' +
          '<td><span class="rp-meter"><span class="rp-meter__bar" aria-hidden="true"><i style="width:' + pct(r.ref, r.joined) + '%"></i></span><span class="num">' + pct(r.ref, r.joined) + '%</span></span></td></tr>';
      }).join('') +
      '<tr class="rp-total"><th scope="row">合計</th><td class="r num">' + tj + '</td><td class="r num">' + tr + '</td><td><span class="num">' + pct(tr, tj) + '%</span></td></tr>' +
      '</tbody></table></div>';
    return AU.panel({ title: '紹介からの入会', id: 'rpRef', cls: 'rp-panel', flush: true, actions: '<span>合計だけ</span>' + csvBtn('ref'), body: tbl });
  }

  /* ---------- CSV ---------- */
  function csv(id, ctx) {
    var range = rangeOf(ctx), d = compute(range);
    var col = function (key, label, v) { return { key: key, label: label, value: v }; };
    if (id === 'trend') AU.downloadCsv('在籍の推移', d.rows, [col('key', '月'), col('endN', '月末の在籍'), col('startN', '月初めの在籍'), col('joined', '入会'), col('left', '退会')]);
    else if (id === 'inout') AU.downloadCsv('入会と退会', d.rows, [col('key', '月'), col('joined', '入会'), col('left', '退会')].concat(REASONS.concat(['未回答']).map(function (k) { return col('r' + k, '退会の理由：' + k, function (r) { return r.reasons[k] || 0; }); })));
    else if (id === 'cohort') {
      var cs = cohorts(d.ms, d.rows), cols = [col('key', '入会した月'), col('size', '人数')], K = cohortCols(cs, d.rows.length);
      for (var k = 1; k <= K; k++) (function (k) { cols.push(col('k' + k, k + 'か月（%）', function (c) { var x = c.cells[k - 1]; return x ? pct(x.kept, x.n) : ''; })); })(k);
      AU.downloadCsv('入会月ごとの継続', cs, cols);
    } else if (id === 'courses') AU.downloadCsv('講座の修了', courseStats(d.ms), [col('id', '講座id'), col('title', '講座'), col('level', 'レベル'), col('n', '回数'), col('open', '開いている人'), col('started', '始めた'), col('done', '修了'),
      col('rate', '修了率（%）', function (c) { return Math.round(c.rate * 100); }), col('stop', 'いちばん止まる回', function (c) { return c.stop ? '第' + (c.stop.i + 1) + '回 ' + c.stop.lesson.title : ''; }),
      col('reach', '回ごとに見終えた人', function (c) { return c.reach.join(' / '); })]);
    else if (id === 'events') AU.downloadCsv('イベントの参加', eventStats(d.rows[0].start, d.first).past, [col('at', '日時', function (p) { return AU.ymd(p.at, true); }), col('title', 'イベント'), col('reserved', '予約'), col('attended', '参加'), col('cap', '定員')]);
    else if (id === 'ref') AU.downloadCsv('紹介からの入会', d.rows, [col('key', '月'), col('joined', '入会'), col('ref', '紹介から'), col('share', '割合（%）', function (r) { return pct(r.ref, r.joined); })]);
  }
  function rangeOf(ctx) { return ctx.query.range === '12' ? 12 : 6; }

  /* ---------- 数の吹き出し（マウスとキーボードで同じもの） ---------- */
  function showTip(el) {
    var t = document.getElementById('rpTip'); if (!t || !el) return;
    var parts = String(el.getAttribute('data-rp-tip') || '').split('|');
    t.textContent = '';
    parts.forEach(function (p, i) { var s = document.createElement(i ? 'span' : 'b'); s.textContent = p; t.appendChild(s); });
    t.hidden = false;
    var r = el.getBoundingClientRect(), tw = t.offsetWidth, th = t.offsetHeight;
    var x = Math.min(window.innerWidth - tw - 8, Math.max(8, r.left + r.width / 2 - tw / 2)), y = r.top - th - 8;
    if (y < 60) y = r.bottom + 8;
    t.style.left = x + 'px'; t.style.top = y + 'px';
  }
  function hideTip() { var t = document.getElementById('rpTip'); if (t) t.hidden = true; }

  AD.screens.reports = {
    title: 'レポート',
    render: function (ctx) {
      cur = ctx;
      var range = rangeOf(ctx), d = compute(range);
      var filters = '<div class="rp-filters" role="group" aria-label="期間">' +
        '<div class="seg rp-seg">' + [6, 12].map(function (k) {
          return '<a href="' + esc(AD.app.hashOf('reports', Object.assign({}, ctx.query, { range: k === 6 ? null : k }))) + '" aria-current="' + (k === range) + '" class="rp-seg__a">' + k + 'か月</a>';
        }).join('') + '</div>' +
        '<span class="pm-muted">' + esc(d.rows[0].long.replace(/（.*$/, '') + '〜' + d.rows[d.rows.length - 1].long) + '</span></div>';
      return '<div class="a-reports">' +
        AU.head({ title: 'レポート', sub: '入会・退会・継続・講座・イベント' }) +
        filters + kpis(d) +
        '<div class="rp-grid">' + trendPanel(d) + refPanel(d) + '</div>' +
        inOutPanel(d) + cohortPanel(d) + coursePanel(ctx, d) + eventPanel(d, range) +
        '<div class="rp-tip" id="rpTip" role="tooltip" hidden></div>' +
      '</div>';
    },
    mount: function (root, ctx) {
      cur = ctx;
      if (ctx.query.course) { var f = document.getElementById('rpFunnel'); if (f && f.getBoundingClientRect().top > window.innerHeight) U.smoothScroll(f, { block: 'center' }); }
      if (root.__boundReports) return;
      root.__boundReports = true;
      root.addEventListener('click', function (e) {
        var b = e.target.closest('.a-reports [data-rp-csv]'); if (b) { csv(b.getAttribute('data-rp-csv'), cur); return; }
        var k = e.target.closest('.a-reports a[href="#rpRef"]'); if (k) { e.preventDefault(); U.smoothScroll('#rpRef', { focus: true }); }
      });
      root.addEventListener('pointerover', function (e) { var el = e.target.closest('.a-reports [data-rp-tip]'); if (el) showTip(el); });
      root.addEventListener('pointerout', function (e) { var el = e.target.closest('.a-reports [data-rp-tip]'); if (el && !el.contains(e.relatedTarget)) hideTip(); });
      root.addEventListener('focusin', function (e) { var el = e.target.closest('.a-reports [data-rp-tip]'); if (el) showTip(el); else hideTip(); });
      root.addEventListener('focusout', function (e) { if (e.target.closest('.a-reports [data-rp-tip]')) hideTip(); });
      window.addEventListener('scroll', hideTip, { passive: true });
    }
  };
})();
