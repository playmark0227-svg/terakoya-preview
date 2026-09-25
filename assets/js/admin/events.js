/* ============================================================
   運営画面：イベント（#/events ?tab=list|past|proposals、#/events/<イベントid>）
   ------------------------------------------------------------
   - これから：作る・直す・中止する。予約した会員・キャンセル待ち（繰り上げ）・参加URLと会場の案内を送る。
   - 当日から出欠を付けられる。デモ会員の出席は R.markAttendance（会員ページのタブに +30 XP が付く）。
     ほかの会員の出欠は運営の記録（eventOps.attendance）に入る。
   - 終わった会：出席の数と、録画を「勉強会の録画」に載せる（講座の画面の録画の登録を AD.cms.archiveForm で使う）。
   - 会員からの企画・発表の申込み：通す／見送る（デモ会員の分は R.approveEventProposal）。通した企画はそのままイベントにできる。
   - 会員ページとのつながり：作った・直した・中止したイベントは R.cmsUpsert('event') で会員ページにも出す（中止は会員ページから外す）。
     一覧の元は data.js の元の中身（cms.base('event')）。デモ会員の繰り上げは R.promoteWaitlist(イベント, 会員番号)、出席は R.markAttendance。
     新しいイベントのお知らせは AD.cms.notify（会員ページの鈴）。
   - 役割：作る・直す・中止・出欠・繰り上げ・案内・企画の確認は代表・運営。講師は自分が主催のイベントだけ。経理は見るだけ。
   運営の保存：AD.db.state.eventOps { created[], edits{}, canceled{}, attendance{ev:{会員番号: 時刻|false}}, promoted{ev:{会員番号: 時刻}},
                                    sent{ev:[{at,by,kind,count}]}, archived{ev:{at,by,archiveId}}, fromProposal{企画id: イベントid} }
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, AD = CLG.admin, AU = AD.ui, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon;
  var cur = null;
  var MIN = 60000, DAY = 86400000;
  function cms() { return AD.cms; }
  var KIND = { online: 'オンライン', offline: '会場', showcase: '成果発表会' };

  var K = 'eventOps';
  function empty() { return { created: [], edits: {}, canceled: {}, attendance: {}, promoted: {}, sent: {}, archived: {}, fromProposal: {} }; }
  function box() { return cms().box(K, empty); }
  function save(fn) { return cms().save(K, empty, fn); }
  function me() { return (AD.db.staff() || {}).id; }
  function nowIso() { return CLG.now().toISOString(); }
  function liveNo() { return AD.data.live().no; }
  function hm(d) { d = new Date(d); return U.pad(d.getHours()) + ':' + U.pad(d.getMinutes()); }
  function dayStart(d) { d = new Date(d); d.setHours(0, 0, 0, 0); return d; }
  function endOf(e) { return new Date(new Date(e.at).getTime() + (e.min || 60) * MIN); }
  function hostName(id) { return cms().personName(id) || (DATA.PEOPLE[id] || {}).name || ''; }
  /* 役割：講師は自分が主催のイベントだけ */
  function myPerson() { var s = AD.db.staff(); return s && s.person ? s.person : null; }
  function canE(e) { return AU.can('content', e ? { owner: e.host } : null); }
  function disE(e) { return canE(e) ? '' : ' disabled'; }
  /** 会員ページにもあるイベントか（data.js の分と、ここで作って会員ページに出したもの） */
  function onMember(e) { return !!e && (e.src === 'data' || (e.src === 'created' && !!R.event(e.id))); }
  function clean(o) { Object.keys(o).forEach(function (k) { if (o[k] === undefined) delete o[k]; }); return o; }
  /** 作った・直した・中止したイベントを会員ページにも出す（中止は会員ページから外す） */
  function syncEvent(id) {
    var e = allEvents().filter(function (x) { return x.id === id && x.src !== 'past'; })[0]; if (!e) return false;
    // 主催：会員ページの人（PEOPLE）か、名簿の会員番号（会員の企画から作った会。名簿に PEOPLE の人がいればその人で渡す）
    var rh = DATA.ROSTER_INDEX[e.host];
    var host = DATA.PEOPLE[e.host] ? e.host : rh ? (DATA.PEOPLE[rh.person] ? rh.person : e.host) : undefined;
    return cms().push('event', clean({ id: e.id, title: e.title, kind: e.kind, at: e.at, min: +e.min || 60, place: String(e.place || '').slice(0, 60), cap: +e.cap, fee: e.fee || '無料',
      host: host, desc: e.desc || '', audience: e.audience || '', recording: e.recording !== false, venue: e.venue || null, venues: e.venues || null,
      zoomUrl: e.kind === 'offline' ? null : (e.zoomUrl || undefined), publish: e.canceled ? 'hidden' : 'published' }), 'イベントを');
  }

  /* ---------- イベントの一覧（これから・終わった会） ---------- */
  function norm(e, src) {
    var b = box(), x = Object.assign({ src: src, attendees: [], count: 0, cap: 0 }, e, (b.edits || {})[e.id] || {});
    x.canceled = (b.canceled || {})[e.id] || null;
    x.ended = endOf(x) <= CLG.now();
    x.archivedTo = (b.archived || {})[e.id] || (x.archive ? { archiveId: x.archive } : null);
    return x;
  }
  /* 終わった会：デモ会員が出た会（PAST_EVENTS）と、勉強会の録画の元になった会（ARCHIVE） */
  function pastSeed() {
    var used = {};
    var list = DATA.PAST_EVENTS.map(function (p) {
      if (p.archive) used[p.archive] = 1;
      var a = p.archive ? cms().base('archive').filter(function (x) { return x.id === p.archive; })[0] : null;
      return { id: p.id, title: p.title, at: p.at, min: p.min || 60, kind: p.kind || 'online', place: 'オンライン（Zoom）', cap: 50, fee: '無料',
        host: a ? a.teacher : 'staff2', recording: !!p.archive || /オリエンテーション/.test(p.title), archive: p.archive || null, past: true };
    });
    cms().base('archive').forEach(function (a) {
      if (used[a.id]) return;
      list.push({ id: 'pa-' + a.id, title: a.title, at: a.date, min: a.min, kind: a.faculty === 'showcase' ? 'showcase' : 'online',
        place: a.faculty === 'showcase' ? 'オンライン＋札幌・那覇の会場' : 'オンライン（Zoom）', cap: a.faculty === 'showcase' ? 120 : 100, fee: '無料',
        host: a.teacher, recording: true, archive: a.id, past: true, desc: a.desc });
    });
    return list;
  }
  function allEvents() {
    return cms().base('event').map(function (e) { return norm(e, 'data'); })
      .concat((box().created || []).map(function (e) { return norm(e, 'created'); }))
      .concat(pastSeed().map(function (e) { return norm(e, 'past'); }));
  }
  function findEvent(id) { return allEvents().filter(function (e) { return e.id === id; })[0] || null; }

  /* 予約した人：データの予約（attendees）＋繰り上げた人＋デモ会員。終わった会は名簿から決まった人数を選ぶ */
  function pickRoster(seed, n, skip) {
    var r = DATA.rng(cms().hash(seed)), pool = DATA.ROSTER.filter(function (m) { return m.status !== 'left' && !skip[m.no]; }), out = [];
    while (out.length < n && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0].no);
    return out;
  }
  function reservations(e) {
    var b = box(), ln = liveNo(), skip = {}, nos;
    skip[ln] = 1;
    if (e.src === 'past') {
      var n = Math.round((e.cap || 50) * (0.28 + DATA.rng(cms().hash(e.id))() * 0.3));
      nos = pickRoster('att-' + e.id, n, skip);
    } else nos = (e.attendees || []).filter(function (no) { return no !== ln; });
    var promoted = Object.keys((b.promoted || {})[e.id] || {});
    var rows = nos.concat(promoted.filter(function (no) { return nos.indexOf(no) < 0 && no !== ln; })).map(function (no, i) {
      var r = DATA.rng(cms().hash(e.id + no));
      var at = new Date(Math.min(new Date(e.at).getTime() - 3600000, CLG.now().getTime() - 3600000) - Math.floor(r() * 14 * DAY));
      // 予約した時刻は夜中を避ける（7〜23時に寄せる。夜中の0時台・1時台の予約がずらりと並ばないように）
      if (at.getHours() < 7) at.setHours(at.getHours() + 12 + Math.floor(r() * 4));
      var lim = Math.min(new Date(e.at).getTime(), CLG.now().getTime()) - 3600000;
      if (at.getTime() > lim) at = new Date(lim - Math.floor(r() * 5 * 3600000));
      return { no: no, at: (b.promoted[e.id] || {})[no] || at.toISOString(), promoted: !!(b.promoted[e.id] || {})[no], idx: i };
    });
    // 予約した順（先に予約した人が上）
    rows.sort(function (x, y) { return new Date(x.at) - new Date(y.at); });
    var liveRes = onMember(e) ? R.isReserved(e.id) : false;
    var liveAtt = e.src !== 'created' && R.attended(e.id);
    // 運営の繰り上げの記録は、会員ページでいまも予約していれば使う（会員ページがデモを戻したら、キャンセル待ちに戻っている）
    var livePro = liveRes ? (b.promoted[e.id] || {})[ln] : null;
    if (liveRes || liveAtt || livePro) {
      var s = CLG.store.state, at = (s.events || {})[e.id] || ((s.attended || []).filter(function (x) { return x.id === e.id; })[0] || {}).at || livePro || nowIso();
      rows.unshift({ no: ln, at: at, live: true, liveAttended: liveAtt, promoted: !!livePro });
    }
    // 出欠：運営の記録（時刻か false）。終わった会で記録が無い人は、当日の記録として8割5分を出席にしておく
    var att = (b.attendance || {})[e.id] || {};
    var base = Math.round(rows.length * 0.85);
    rows.forEach(function (x, i) {
      if (x.live && x.liveAttended) { x.attended = true; x.fixed = true; return; }
      if (att[x.no] !== undefined) x.attended = !!att[x.no];
      else x.attended = e.src === 'past' && i < base;
    });
    return rows;
  }
  /* キャンセル待ち：満席の会だけ。データの waiting（無ければ1人）＋デモ会員 */
  function waitlist(e) {
    if (e.src === 'past' || e.ended) return [];
    var ln = liveNo(), b = box(), pro = (b.promoted || {})[e.id] || {};
    var full = (e.count || 0) >= e.cap;
    var rows = [];
    if (full) {
      var skip = {}; (e.attendees || []).forEach(function (no) { skip[no] = 1; }); skip[ln] = 1;
      pickRoster('wl-' + e.id, e.waiting != null ? e.waiting : 1, skip).forEach(function (no, i) {
        rows.push({ no: no, at: new Date(CLG.now().getTime() - (5 + i) * DAY + i * 3600000).toISOString() });
      });
    }
    var pos = onMember(e) ? R.waitlistPos(e.id) : 0;
    if (pos > 0) rows.push({ no: ln, at: ((CLG.store.state.waitlist || {})[e.id]) || nowIso(), live: true });
    // デモ会員は会員ページの記録（R.waitlistPos）がそのまま正本。運営の繰り上げの記録が残っていても、待っていれば並べる
    return rows.filter(function (x) { return x.live || !pro[x.no]; }).sort(function (a, c) { return new Date(a.at) - new Date(c.at); });
  }
  function reservedCount(e) { return reservations(e).length; }
  function canMark(e) { return !e.canceled && CLG.now() >= dayStart(e.at); }

  /* ---------- 表 ---------- */
  function upcomingRows() {
    return allEvents().filter(function (e) { return e.src !== 'past' && !e.ended; }).map(function (e) {
      var n = reservedCount(e);
      return Object.assign(e, { reserved: n, waiting: waitlist(e).length, hostName: hostName(e.host) });
    });
  }
  function pastRows() {
    return allEvents().filter(function (e) { return e.ended || e.src === 'past'; }).map(function (e) {
      var rs = reservations(e);
      return Object.assign(e, { reserved: rs.length, attendedN: rs.filter(function (x) { return x.attended; }).length, hostName: hostName(e.host) });
    });
  }
  function seatBar(n, cap) {
    var p = cap ? Math.min(100, Math.round(n / cap * 100)) : 0;
    return '<span class="a-seat"><span class="a-seat__bar" aria-hidden="true"><i style="width:' + p + '%"' + (n >= cap ? ' class="is-full"' : '') + '></i></span><span class="num">' + n + '/' + cap + '</span></span>';
  }
  function stateHtml(e) {
    if (e.canceled) return U.statusTag('closed', '中止');
    if (e.ended) return '<span class="ad-st">終了</span>';
    if (new Date(e.at) <= CLG.now()) return U.statusTag('active', '開催中');
    // 今日の会は藍の札（朱は「いま押してほしいもの」に取っておく）
    if (dayStart(e.at).getTime() === dayStart(CLG.now()).getTime()) return U.statusTag('scheduled', '今日');
    if (e.reserved >= e.cap) return U.statusTag('waitlist', '満席');
    return '<span class="ad-st">受付中</span>';
  }
  function listView(ctx) {
    return AU.table({
      id: 'events', rows: upcomingRows(), query: ctx.query, sort: 'at', label: 'これからのイベント',
      filters: [{ key: 'kind', label: '種類', chips: true, options: [['', 'すべて'], ['online', 'オンライン'], ['offline', '会場'], ['showcase', '成果発表会']] }],
      search: { placeholder: 'イベント・場所・主催', keys: ['title', 'place', 'hostName'] },
      columns: [
        AU.col.when('at', '日時', { dir: 'asc' }),
        { key: 'title', label: 'イベント', main: true, html: function (e) {
          return '<a class="a-ev__ttl" href="#/events/' + esc(encodeURIComponent(e.id)) + '">' + esc(e.title) + '</a><span class="a-ev__sub">' + esc(e.place || '') + (e.audience === 'new30' ? '・入会30日以内の方' : '') + '</span>';
        } },
        { key: 'kind', label: '種類', hide: 'sm', value: function (e) { return KIND[e.kind] || ''; } },
        { key: 'reserved', label: '予約', dir: 'desc', html: function (e) { return seatBar(e.reserved, e.cap); }, csv: function (e) { return e.reserved + '/' + e.cap; } },
        { key: 'waiting', label: '待ち', align: 'r', dir: 'desc', hide: 'md', html: function (e) { return e.waiting ? '<span class="num">' + e.waiting + '</span>人' : '<span class="muted">―</span>'; } },
        { key: 'hostName', label: '主催', hide: 'md' },
        { key: 'state', label: '状態', sort: false, html: stateHtml, csv: function (e) { return e.canceled ? '中止' : e.reserved >= e.cap ? '満席' : '受付中'; } }
      ],
      rowHref: function (e) { return '#/events/' + encodeURIComponent(e.id); },
      rowClass: function (e) { return e.canceled ? 'is-quiet' : ''; },
      csv: { name: 'イベント' }, empty: 'これからのイベントはありません。'
    });
  }
  function pastView(ctx) {
    return AU.table({
      id: 'eventsPast', rows: pastRows(), query: ctx.query, sort: '-at', label: '終わったイベント',
      filters: [{ key: 'rec', label: '録画', chips: true, options: [['', 'すべて'], ['todo', '録画を載せていない'], ['done', '録画を載せた']],
        match: function (e, v) { return v === 'todo' ? e.recording && !e.archivedTo && !e.canceled : !!e.archivedTo; } }],
      search: { placeholder: 'イベント', keys: ['title', 'hostName'] },
      columns: [
        AU.col.when('at', '日時'),
        { key: 'title', label: 'イベント', main: true, html: function (e) { return '<a class="a-ev__ttl" href="#/events/' + esc(encodeURIComponent(e.id)) + '">' + esc(e.title) + '</a>'; } },
        { key: 'kind', label: '種類', hide: 'sm', value: function (e) { return KIND[e.kind] || ''; } },
        { key: 'attendedN', label: '出席', align: 'r', dir: 'desc', html: function (e) { return '<span class="num">' + e.attendedN + '/' + e.reserved + '</span>人'; }, csv: function (e) { return e.attendedN + '/' + e.reserved; } },
        { key: 'rec', label: '録画', value: function (e) { return e.canceled ? '中止' : !e.recording ? '残さない' : e.archivedTo ? '載せた' : 'まだ'; }, html: function (e) {
          if (e.canceled) return U.statusTag('closed', '中止');
          if (!e.recording) return '<span class="muted">残さない</span>';
          return e.archivedTo ? '<span class="ad-st">載せた</span>' : U.statusTag('review', 'まだ載せていない');
        } },
        { key: 'hostName', label: '主催', hide: 'md' }
      ],
      rowHref: function (e) { return '#/events/' + encodeURIComponent(e.id); },
      csv: { name: '終わったイベント' }, empty: '終わったイベントはまだありません。'
    });
  }
  function propLabel(p) { return p.kind === 'speaker' ? '発表の申込み' : '企画'; }
  function propRows(q) {
    return q.proposals.map(function (p) {
      var e = p.kind === 'speaker' && p.event ? findEvent(p.event) : null;
      return Object.assign({}, p, { when: p.at || (e ? e.at : null), where: p.kind === 'speaker' ? (e ? e.title : '') : p.online ? 'オンライン' : (p.place || ''), name: cms().personName(p.no) });
    });
  }
  function proposalsView(ctx, q) {
    return AU.table({
      id: 'proposals', rows: propRows(q), query: ctx.query, sort: '-sentAt', label: '会員からの企画',
      filters: [{ key: 'status', label: '状態', chips: true, value: 'review', options: [['review', '確認待ち'], ['approved', '通した'], ['rejected', '見送った'], ['', 'すべて']] }],
      search: { placeholder: '企画・会員', keys: ['title', 'name', 'no'] },
      columns: [
        AU.col.when('sentAt', '届いた', { hide: 'sm' }),
        { key: 'title', label: '企画', main: true, html: function (p) {
          return '<button type="button" class="a-linkbtn" data-ev-prop="' + esc(p.id) + '">' + esc(p.title) + '</button><span class="a-ev__sub">' + esc(propLabel(p)) + '</span>';
        } },
        { key: 'name', label: '出した会員', html: function (p) { return AU.who(p.no) + (p.live ? '<span class="a-ev__live">デモ会員</span>' : ''); } },
        AU.col.when('when', '開催', { dir: 'asc' }),
        { key: 'where', label: '場所・会', hide: 'md', html: function (p) { return esc(p.where) + (p.cap ? '<span class="a-ev__sub">定員 ' + esc(p.cap) + '人・' + esc(p.fee || '') + '</span>' : ''); } },
        { key: 'status', label: '状態', html: function (p) { return AU.status('review', p.status, p.status === 'approved' ? '通した' : p.status === 'rejected' ? '見送った' : null); },
          csv: function (p) { return p.status === 'approved' ? '通した' : p.status === 'rejected' ? '見送った' : '確認待ち'; } }
      ],
      rowClass: function () { return 'is-link'; },
      csv: { name: 'イベントの企画' }, empty: '会員からの企画はまだありません。'
    });
  }

  /* ---------- イベント1件 ---------- */
  function detail(ctx, e) {
    var rs = reservations(e), wl = waitlist(e), b = box();
    var sent = (b.sent || {})[e.id] || [];
    var mark = canMark(e), attN = rs.filter(function (x) { return x.attended; }).length;
    var start = new Date(e.at), end = endOf(e);
    var when = U.fmtDate(start) + ' ' + hm(start) + '〜' + hm(end);
    var acts = (onMember(e) && !e.canceled ? '<a class="btn btn-ghost btn-s" href="' + esc(AD.data.memberHref('#/events/' + encodeURIComponent(e.id))) + '" target="_blank" rel="noopener">' + icon('external', 'ico-s') + '会員ページで見る</a>' : '') +
      (!e.ended && !e.canceled && e.src !== 'past' ? '<button type="button" class="btn btn-ghost btn-s" data-ev-cancel="' + esc(e.id) + '"' + disE(e) + '>中止する</button>' +
        '<button type="button" class="btn btn-ink btn-s" data-ev-edit="' + esc(e.id) + '"' + disE(e) + '>イベントを直す</button>' : '');
    // 終わった会は、空き・キャンセル待ち・案内の代わりに録画の状態を出す
    var over = e.ended || e.src === 'past';
    var kpis = '<div class="ad-kpis a-ev__kpis">' +
      AU.kpi({ label: '予約', value: rs.length + '/' + e.cap, unit: '人', sub: !over && e.cap ? '空き ' + Math.max(0, e.cap - rs.length) + '人' : '' }) +
      (over ? '' : AU.kpi({ label: 'キャンセル待ち', value: String(wl.length), unit: '人', tone: wl.length ? 'warn' : '' })) +
      AU.kpi({ label: '出席', value: mark ? String(attN) : '―', unit: mark ? '人' : '', sub: mark ? '予約の ' + (rs.length ? Math.round(attN / rs.length * 100) : 0) + '%' : '当日から付けられます' }) +
      (over ? AU.kpi({ label: '録画', value: e.canceled ? '中止' : !e.recording ? '残さない' : e.archivedTo ? '載せた' : 'まだ', tone: e.recording && !e.archivedTo && !e.canceled ? 'warn' : '',
          sub: e.archivedTo && e.archivedTo.at ? U.fmtShort(e.archivedTo.at, true) : '' }) : '') +
      AU.kpi({ label: '送った案内', value: String(sent.length), unit: '回', sub: sent.length ? '最後 ' + U.fmtShort(sent[sent.length - 1].at, true) : over ? '' : 'まだ送っていません' }) +
    '</div>';

    // 予約した会員と出欠
    var attRows = rs.map(function (x) {
      var dis = !mark || x.fixed || !canE(e), id = 'evAtt-' + x.no;
      return '<tr class="' + (x.attended ? 'is-att' : '') + '"><td class="a-ev__ck"><label class="ad-ckhit"><input type="checkbox" class="ad-ck" id="' + esc(id) + '" data-ev-att="' + esc(x.no) + '"' + (x.attended ? ' checked' : '') + (dis ? ' disabled' : '') +
          ' aria-label="' + esc(cms().personName(x.no)) + 'さんを出席にする"></label></td>' +
        '<td class="is-main">' + AU.who(x.no) + (x.live ? '<span class="a-ev__live">デモ会員</span>' : '') + '</td>' +
        '<td data-label="予約" class="nw ad-hide-sm"><span class="num">' + esc(U.fmtShort(x.at, true)) + '</span>' + (x.promoted ? '<span class="a-ev__sub">キャンセル待ちから</span>' : '') + '</td>' +
        '<td data-label="出欠" class="nw">' + (x.attended ? '<span class="a-ev__in">' + icon('check', 'ico-s') + '出席</span>' : mark ? '<span class="muted">まだ</span>' : '<span class="muted">―</span>') +
          (x.fixed ? '<span class="a-ev__sub">会員ページの記録</span>' : '') + '</td></tr>';
    }).join('');
    var attTools = mark && rs.length ? '<button type="button" class="btn btn-ghost btn-s" data-ev-attall="' + esc(e.id) + '"' + (attN === rs.length || !canE(e) ? ' disabled' : '') + '>残りを全員出席にする</button>' : '';
    var attPanel = AU.panel({ title: '予約した会員', id: 'evRes', count: rs.length + '人', flush: true,
      actions: attTools + '<button type="button" class="btn btn-ghost btn-s" data-ev-csv="' + esc(e.id) + '">' + icon('download', 'ico-s') + 'CSV</button>',
      body: (!mark && !e.canceled ? '<p class="a-ev__hint">出欠は当日（' + esc(U.fmtShort(e.at)) + '）から付けられます。</p>' : '') +
        (rs.length ? '<div class="ad-tbl-wrap a-ev__attwrap"><table class="ad-tbl is-cards has-ck a-ev__att" aria-labelledby="evRes"><thead><tr><th scope="col" class="a-ev__ck">出席</th><th scope="col">会員</th><th scope="col" class="ad-hide-sm">予約</th><th scope="col">出欠</th></tr></thead><tbody>' + attRows + '</tbody></table></div>'
          : AU.empty('まだ予約はありません。')) });

    var wlPanel = !e.ended && e.src !== 'past' ? AU.panel({ title: 'キャンセル待ち', id: 'evWl', count: wl.length ? wl.length + '人' : '', flush: !!wl.length,
      body: wl.length ? '<ol class="a-ev__wl">' + wl.map(function (x, i) {
        return '<li><span class="a-ev__wln num">' + (i + 1) + '</span><span class="a-ev__wlwho">' + AU.who(x.no) + (x.live ? '<span class="a-ev__live">デモ会員</span>' : '') + '</span>' +
          '<span class="a-ev__wlat num">' + esc(U.fmtShort(x.at, true)) + '</span>' +
          '<button type="button" class="btn btn-ghost btn-s" data-ev-promote="' + esc(x.no) + '"' + (e.canceled || !canE(e) ? ' disabled' : '') + '>繰り上げる</button></li>';
      }).join('') + '</ol>' : '<p class="a-ev__none">いま待っている人はいません。</p>' }) : '';

    // 参加のしかた
    var online = e.kind !== 'offline', venues = e.venues || (e.venue ? [e.venue] : []);
    var howBody = (online ? AU.kv([['参加URL', '<span class="mono">' + esc(e.zoomUrl || DATA.SITE.zoomPlaceholder) + '</span>', true], e.ended ? null : ['会員ページ', '開始30分前から予約した人に出ます']]) : '') +
      venues.map(function (v) { return '<div class="a-ev__venue">' + AU.kv([['会場', v.name], ['住所', v.address], ['持ち物', v.bring || ''], ['当日の連絡', v.contact || '']]) + '</div>'; }).join('') +
      (!online && !venues.length ? '<p class="a-ev__none">会場はまだ決まっていません。</p>' : '') +
      (!e.ended && !e.canceled && rs.length ? '<div class="a-ev__send">' +
        (online ? '<button type="button" class="btn btn-ghost btn-s" data-ev-send="url"' + disE(e) + '>' + icon('link', 'ico-s') + '参加URLを送る</button>' : '') +
        (venues.length ? '<button type="button" class="btn btn-ghost btn-s" data-ev-send="venue"' + disE(e) + '>' + icon('pin', 'ico-s') + '会場の案内を送る</button>' : '') +
        (dayStart(e.at) > dayStart(CLG.now()) ? '<button type="button" class="btn btn-ghost btn-s" data-ev-send="remind"' + disE(e) + '>' + icon('bell', 'ico-s') + '前日の案内を送る</button>' : '') + '</div>' : '') +
      (sent.length ? '<h3 class="a-ev__h">送った案内</h3><ul class="a-ev__sent">' + sent.slice().reverse().map(function (s) {
        return '<li><span class="num">' + esc(U.fmtShort(s.at, true)) + '</span><span>' + esc(SEND[s.kind] ? SEND[s.kind].name : s.kind) + '・' + esc(s.count) + '人</span><small>' + esc(AD.db.staffName(s.by)) + '</small></li>';
      }).join('') + '</ul>' : '');
    var howPanel = AU.panel({ title: '参加のしかた', id: 'evHow', body: howBody });

    // 録画
    var recBody;
    if (!e.recording) recBody = '<p class="a-ev__none">この会は録画を残しません。</p>';
    else if (e.archivedTo) {
      var arc = (cms().archiveRows ? cms().archiveRows() : []).filter(function (a) { return a.id === e.archivedTo.archiveId; })[0];
      recBody = '<p class="a-ev__recok">' + icon('check', 'ico-s') + '<span>勉強会の録画に載せました' + (arc ? '：「' + esc(arc.title) + '」' : '') + '</span></p>' +
        '<a class="btn btn-text btn-s" href="#/courses?tab=archive">勉強会の録画を見る</a>';
    } else if (e.canceled) recBody = '<p class="a-ev__none">中止した会です。</p>';
    else if (!e.ended) recBody = '<p class="a-ev__none">終わったあと（' + esc(U.fmtShort(end, true)) + '以降）に載せられます。</p>';
    else recBody = '<p class="a-ev__rectodo">まだ勉強会の録画に載せていません。</p><button type="button" class="btn btn-ink btn-s" data-ev-archive="' + esc(e.id) + '"' + disE(e) + '>録画に載せる</button>';
    var recPanel = AU.panel({ title: '録画', id: 'evRec', body: recBody });

    var info = AU.panel({ title: '開催', id: 'evInfo', body: AU.kv([
      ['日時', when + '（' + (e.min || 60) + '分）'],
      ['種類', KIND[e.kind] || ''],
      ['場所', e.place || ''],
      ['定員', e.cap + '人'],
      ['参加費', e.fee || '無料'],
      ['主催', hostName(e.host)],
      ['対象', e.audience === 'new30' ? '入会30日以内の方' : '全員'],
      e.canceled ? ['中止', U.fmtShort(e.canceled.at, true) + '・' + e.canceled.reason] : null
    ]) + (e.desc ? '<p class="a-ev__desc">' + U.jp(e.desc, { br: true }) + '</p>' : '') });

    var spk = (e.speakers || []).slice();
    var sp = e.src === 'data' && e.kind === 'showcase' ? R.speakerApp(e.id) : null;
    var spPanel = e.kind === 'showcase' && (spk.length || sp) ? AU.panel({ title: '発表する人', id: 'evSpk', count: (spk.length + (sp && sp.status === 'approved' ? 1 : 0)) + '人', flush: true,
      body: '<ol class="a-ev__spk">' + spk.map(function (s) { return '<li>' + cms().personWho(s.person) + '<span class="a-ev__spt">' + esc(s.title) + '</span></li>'; }).join('') +
        (sp ? '<li>' + AU.who(liveNo()) + '<span class="a-ev__spt">' + esc(sp.title) + '</span>' + (sp.status === 'review' ? '<button type="button" class="btn btn-ghost btn-s" data-ev-prop="' + esc(sp.id) + '">確認する</button>' : AU.status('review', sp.status, sp.status === 'approved' ? '通した' : '見送った')) + '</li>' : '') + '</ol>' }) : '';

    return '<div class="a-events">' +
      AU.head({ title: e.title, crumb: [['#/events' + (e.ended || e.src === 'past' ? '?tab=past' : ''), 'イベント']], actions: acts,
        sub: when + '・' + (KIND[e.kind] || '') + (e.canceled ? '・中止' : e.ended ? '・終わった会' : '') }) +
      (canE(e) ? '' : AU.roleNote('content', 'イベントの対応')) +
      kpis +
      '<div class="a-ev__grid"><div class="a-ev__main">' + attPanel + wlPanel + spPanel + '</div>' +
        '<div class="a-ev__side">' + info + howPanel + recPanel + '</div></div>' +
    '</div>';
  }

  /* ---------- 出欠 ---------- */
  function setAttendance(e, no, on) {
    var ln = liveNo();
    if (no === ln && on && onMember(e)) {
      var r = R.markAttendance(e.id, no);
      if (!r) { U.toast('出席を付けられませんでした', 'error'); return false; }
      var xp = r.xp || DATA.XP.event, st = (r.steps || [])[0];
      AD.db.audit({ action: 'attendance', label: '出席を付けた', target: { type: 'member', id: no, name: AD.data.live().name }, detail: e.title + '・+' + xp + ' XP' });
      // スタートガイドの項目（成果発表会・イベント）も済みになったときは、その分も合わせて言う
      U.toast(AD.data.live().name + 'さんを出席にしました（+' + xp + ' XP' + (st ? '。スタートガイドの「' + (st.baseTitle || st.title) + '」も済み' : '') + '）', 'ok');
      return true;
    }
    save(function (b) { (b.attendance[e.id] = b.attendance[e.id] || {})[no] = on ? nowIso() : false; });
    return true;
  }
  function markAll(e) {
    var rest = reservations(e).filter(function (x) { return !x.attended && !x.fixed; });
    if (!rest.length) return;
    U.confirmBox(rest.length + '人を出席にしますか', '出欠を付けていない人をまとめて出席にします。来なかった人はあとで外せます。', '出席にする', false, { kind: 'ink' }).then(function (ok) {
      if (!ok) return;
      var liveOne = rest.filter(function (x) { return x.live; })[0];
      save(function (b) { var m = b.attendance[e.id] = b.attendance[e.id] || {}; rest.forEach(function (x) { if (!x.live || !onMember(e)) m[x.no] = nowIso(); }); });
      if (liveOne && onMember(e)) setAttendance(e, liveOne.no, true);
      AD.db.audit({ action: 'attendance', label: '出席をまとめて付けた', target: { type: 'event', id: e.id, name: e.title }, detail: rest.length + '人' });
      U.toast(rest.length + '人を出席にしました', 'ok'); cur.refresh();
    });
  }

  /* ---------- 繰り上げ ---------- */
  function promote(e, no) {
    var name = cms().personName(no), rs = reservations(e).length, over = rs >= e.cap;
    U.confirmBox(name + 'さんを繰り上げますか', over ? '定員（' + e.cap + '人）を超えるので、定員を1人増やして予約にします。' : '予約に切り替えて、本人に知らせます。', '繰り上げる', false, { kind: 'ink' }).then(function (ok) {
      if (!ok) return;
      var ln = liveNo();
      // デモ会員：会員ページの予約に入り、お知らせが届く。ほかの会員は運営の記録（R は { other:true } を返すだけ）
      var r = onMember(e) ? R.promoteWaitlist(e.id, no) : { ok: true, other: true };
      if (!r || r.ok === false) { U.toast((r && r.error) || '繰り上げられませんでした', 'error'); return; }
      save(function (b) {
        (b.promoted[e.id] = b.promoted[e.id] || {})[no] = nowIso();
        if (over) {
          b.edits[e.id] = Object.assign({}, b.edits[e.id] || {}, { cap: e.cap + 1 });
          if (e.src === 'created') b.created = b.created.map(function (x) { return x.id === e.id ? Object.assign({}, x, { cap: e.cap + 1 }) : x; });
        }
      });
      // 定員を増やしたときは会員ページの定員も（data.js の分も、作った分も）
      if (over && onMember(e)) syncEvent(e.id);
      AD.db.audit({ action: 'waitlist_promote', label: 'キャンセル待ちから繰り上げた', target: { type: 'member', id: no, name: name }, detail: e.title });
      U.toast(name + 'さんを予約にしました' + (no === ln && !r.other ? '。会員ページの予約にも入り、本人に知らせが届きました' : ''), 'ok');
      cur.refresh();
    });
  }

  /* ---------- 案内を送る ---------- */
  var SEND = {
    url: { name: '参加URL', text: function (e) { return '「' + e.title + '」は' + U.fmtShort(e.at, true) + 'からです。参加のリンクはイベントのページにあります。'; } },
    venue: { name: '会場の案内', text: function (e) { var v = (e.venues || [e.venue])[0] || {}; return '「' + e.title + '」の会場は' + (v.name || '') + '（' + (v.address || '') + '）です。くわしくはイベントのページで。'; } },
    remind: { name: '前日の案内', text: function (e) { return '明日' + U.fmtShort(e.at, true) + 'から「' + e.title + '」です。くわしくはイベントのページで。'; } }
  };
  function send(e, kind) {
    var rs = reservations(e), def = SEND[kind];
    AU.act({
      title: def.name + 'を送る', ok: '送る', kind: 'ink', reason: false,
      text: '予約した ' + rs.length + '人に、会員ページのお知らせとメール・LINEで送ります。',
      html: '<div class="a-ev__preview"><p class="a-ev__plbl">送る文</p><p>' + U.jp(def.text(e)) + '</p></div>',
      run: function () {
        var ln = liveNo(), hit = rs.some(function (x) { return x.no === ln; });
        if (hit) R.publishNotice({ target: 'member:' + ln, text: def.text(e).slice(0, 120), link: onMember(e) ? '#/events/' + e.id : '#/events', type: kind === 'remind' ? 'event_before' : 'event_30min' });
        save(function (b) { (b.sent[e.id] = b.sent[e.id] || []).push({ at: nowIso(), by: me(), kind: kind, count: rs.length }); });
        return { ok: true, live: hit };
      },
      audit: { action: 'event_send', label: 'イベントの案内を送った', target: { type: 'event', id: e.id, name: e.title }, detail: def.name + '・' + rs.length + '人' }
    }).then(function (r) {
      if (!r) return;
      U.toast(rs.length + '人に送りました' + (r.live ? '（' + AD.data.live().name + 'さんのお知らせにも届きます）' : '') + '。本番ではメールとLINEでも届きます', 'ok');
      cur.refresh();
    });
  }

  /* ---------- 作る・直す・中止 ---------- */
  function eventForm(e, pre) {
    var isNew = !e;
    var base = e || Object.assign({ title: '', kind: 'online', at: new Date(dayStart(CLG.now()).getTime() + 7 * DAY + 20 * 60 * MIN).toISOString(), min: 60, cap: 30, fee: '無料',
      place: '', host: me() || 'staff2', recording: true, audience: '', desc: '', zoomUrl: DATA.SITE.zoomPlaceholder, venue: null }, pre || {});
    var v = base.venue || (base.venues || [])[0] || { name: '', address: '', bring: '' };
    var hosts = cms().staffOptions();
    if (base.host && !DATA.PEOPLE[base.host] && DATA.ROSTER_INDEX[base.host]) hosts.unshift([base.host, DATA.ROSTER_INDEX[base.host].name + '（会員）']);
    else if (base.host && DATA.PEOPLE[base.host] && !DATA.PEOPLE[base.host].staff) hosts.unshift([base.host, DATA.PEOPLE[base.host].name + '（会員）']);
    // 講師（自分の講座とイベントだけ）は、主催を自分にしたイベントだけ作れる・直せる
    var mine = !AU.can('content') && myPerson();
    if (mine) { base.host = mine; hosts = hosts.filter(function (h) { return h[0] === mine; }); if (!hosts.length) hosts = [[mine, hostName(mine) || mine]]; }
    cms().formDrawer({
      title: isNew ? 'イベントを作る' : 'イベントを直す', ok: isNew ? '作る' : '保存する', cls: 'a-events', wide: true,
      body: cms().field({ name: 'title', label: 'イベントの名前', value: base.title, required: true, maxlength: 40 }) +
        '<div class="a-cms__row3">' +
          cms().field({ name: 'kind', label: '種類', type: 'select', value: base.kind, options: [['online', 'オンライン'], ['offline', '会場'], ['showcase', '成果発表会']] }) +
          cms().field({ name: 'date', label: '日付', type: 'date', value: cms().localD(base.at), required: true }) +
          cms().field({ name: 'time', label: '始まり', type: 'time', value: hm(base.at), required: true }) +
        '</div><div class="a-cms__row3">' +
          cms().field({ name: 'min', label: '長さ（分）', type: 'number', value: base.min, required: true, min: 15, max: 480 }) +
          cms().field({ name: 'cap', label: '定員', type: 'number', value: base.cap, required: true, min: 2, max: 500 }) +
          cms().field({ name: 'fee', label: '参加費', value: base.fee, maxlength: 30, placeholder: '無料・実費（ランチ代）' }) +
        '</div>' +
        cms().field({ name: 'place', label: '場所（一覧に出す1行）', value: base.place, maxlength: 40, placeholder: 'オンライン（Zoom）・札幌市中央区（会場は予約後にお知らせ）', opt: true }) +
        cms().field({ name: 'zoomUrl', label: '参加URL', type: 'url', value: base.zoomUrl || '', hidden: base.kind === 'offline', required: true, maxlength: 200, hint: '予約した人にだけ、開始30分前から出します' }) +
        '<fieldset class="a-cms__sub" data-ev-venue' + (base.kind === 'online' ? ' hidden' : '') + '><legend>会場（予約した人にだけ出す）</legend>' +
          '<div class="a-cms__row2">' + cms().field({ name: 'vName', label: '会場の名前', value: v.name, required: true, maxlength: 60 }) + cms().field({ name: 'vAddress', label: '住所', value: v.address, required: true, maxlength: 60 }) + '</div>' +
          cms().field({ name: 'vBring', label: '持ち物', value: v.bring || '', maxlength: 80, opt: true }) +
        '</fieldset>' +
        '<div class="a-cms__row2">' +
          cms().field({ name: 'host', label: '主催', type: 'select', value: base.host, options: hosts }) +
          cms().field({ name: 'audience', label: '対象', type: 'select', value: base.audience || '', options: [['', '全員'], ['new30', '入会30日以内の方']] }) +
        '</div>' +
        cms().field({ name: 'desc', label: '内容', type: 'textarea', value: base.desc, rows: 3, maxlength: 400, opt: true }) +
        cms().check({ name: 'recording', label: '録画を残す', value: base.recording !== false }) +
        (isNew ? cms().check({ name: 'notify', label: '会員にお知らせを出す', value: true }) : ''),
      onMount: function (form) {
        form.addEventListener('change', function (ev) {
          if (ev.target.name !== 'kind') return;
          var k = ev.target.value;
          form.querySelector('[name=zoomUrl]').closest('.field').hidden = k === 'offline';
          form.querySelector('[data-ev-venue]').hidden = k === 'online';
          if (k === 'online' && !form.place.value) form.place.value = 'オンライン（Zoom）';
        });
      },
      onSubmit: function (d) {
        var er = {}, title = String(d.title || '').trim(), at = cms().parseDT(d.date + 'T' + (d.time || '')), min = parseInt(d.min, 10), cap = parseInt(d.cap, 10);
        if (!title) er.title = 'イベントの名前を入れてください';
        else { var hit = cms().flags(title); if (hit.length) er.title = 'この名前は使えません（' + hit.join('・') + '）'; }
        if (!d.date) er.date = '日付を選んでください';
        if (!d.time) er.time = '始まりの時刻を選んでください';
        if (d.date && d.time && !at) er.date = '日付と時刻を選び直してください';
        else if (at && isNew && at <= CLG.now()) er.date = '日時は、いまより後にしてください';
        if (!(min >= 15 && min <= 480)) er.min = '長さは15〜480分で入れてください';
        if (!(cap >= 2 && cap <= 500)) er.cap = '定員は2〜500で入れてください';
        else if (!isNew && cap < reservedCount(e)) er.cap = 'いまの予約（' + reservedCount(e) + '人）より少なくできません';
        if (!AU.can('content', { owner: d.host })) er.host = '主催は自分にしてください';
        if (d.kind !== 'offline' && !/^https:\/\/\S+$/.test(String(d.zoomUrl || '').trim())) er.zoomUrl = 'https:// で始まる参加URLを入れてください';
        if (d.kind !== 'online') {
          if (!String(d.vName || '').trim()) er.vName = '会場の名前を入れてください';
          if (!String(d.vAddress || '').trim()) er.vAddress = '住所を入れてください（番地まで）';
        }
        if (Object.keys(er).length) return { ok: false, errors: er };
        var venue = d.kind === 'online' ? null : { name: String(d.vName).trim(), address: String(d.vAddress).trim(), bring: String(d.vBring || '').trim(), contact: '当日の連絡は「相談・メッセージ」へ' };
        var patch = { title: title, kind: d.kind, at: at.toISOString(), min: min, cap: cap, fee: String(d.fee || '').trim() || '無料',
          place: String(d.place || '').trim() || (d.kind === 'offline' ? venue.address.replace(/\d.*$/, '') + '（会場は予約後にお知らせ）' : 'オンライン（Zoom）'),
          zoomUrl: d.kind === 'offline' ? null : String(d.zoomUrl).trim(), host: d.host, audience: d.audience || undefined, desc: String(d.desc || '').trim(), recording: !!d.recording };
        if (venue) { patch.venue = venue; if (e && e.venues) patch.venues = [venue].concat(e.venues.slice(1)); } else { patch.venue = null; patch.venues = null; }
        var id = e && e.id;
        save(function (b) {
          if (isNew) {
            id = cms().uid('ev');
            b.created.push(Object.assign({ id: id, count: 0, attendees: [], createdAt: nowIso(), createdBy: me(), proposal: pre && pre.proposal || null }, patch));
            if (pre && pre.proposal) b.fromProposal[pre.proposal] = id;
          } else if (e.src === 'created') b.created = b.created.map(function (x) { return x.id === id ? Object.assign({}, x, patch) : x; });
          else b.edits[id] = Object.assign({}, b.edits[id] || {}, patch);
        });
        var pushed = syncEvent(id);
        AD.db.audit({ action: isNew ? 'event_add' : 'event_edit', label: isNew ? 'イベントを作った' : 'イベントを直した', target: { type: 'event', id: id, name: title }, detail: U.fmtShort(at, true) });
        if (isNew && d.notify && pushed) cms().notify({ target: d.audience === 'new30' ? 'new30' : 'all', text: '「' + title + '」（' + U.fmtShort(at, true) + '）の予約を受け付けています', link: '#/events/' + encodeURIComponent(id), type: 'event_before' });
        if (pushed) U.toast(isNew ? 'イベントを作りました。会員ページのイベントにも出ています' : 'イベントを保存しました。会員ページにも出ています', 'ok');
        if (isNew) AD.app.go('#/events/' + encodeURIComponent(id)); else cur.refresh();
        return { ok: true };
      }
    });
  }
  function cancelEvent(e) {
    var rs = reservations(e);
    AU.act({
      title: 'イベントを中止する', ok: '中止する', danger: true,
      text: '「' + e.title + '」（' + U.fmtShort(e.at, true) + '）を中止します。予約した ' + rs.length + '人に知らせます。',
      reasons: ['講師の体調不良', '会場が使えなくなった', '人が集まらなかった', '天候'],
      reasonLabel: '中止の理由（予約した人に届きます）',
      run: function (reason) {
        save(function (b) { b.canceled[e.id] = { at: nowIso(), by: me(), reason: reason }; });
        // 会員ページのイベントの一覧からも外す
        if (onMember(e)) syncEvent(e.id);
        var ln = liveNo();
        if (rs.some(function (x) { return x.no === ln; })) R.publishNotice({ target: 'member:' + ln, text: ('「' + e.title + '」は中止になりました。' + reason).slice(0, 120), link: '#/events', type: 'system' });
        return { ok: true };
      },
      audit: { action: 'event_cancel', label: 'イベントを中止した', target: { type: 'event', id: e.id, name: e.title }, detail: rs.length + '人に連絡' },
      done: 'イベントを中止しました'
    }).then(function (r) { if (r) cur.refresh(); });
  }
  function toArchive(e) {
    var guess = /AI|動画|ノーコード|ライティング|デザイン/.test(e.title) ? 'skill' : /SNS|Instagram|ショート/.test(e.title) ? 'sns' : /営業|紹介/.test(e.title) ? 'sales' : /税|起業|法人|LINE公式/.test(e.title) ? 'biz' : e.kind === 'showcase' ? 'showcase' : 'basic';
    var host = DATA.PEOPLE[e.host] && DATA.PEOPLE[e.host].staff ? e.host : 'staff2';
    cms().archiveForm({ title: e.title, faculty: guess, date: e.at, min: e.min || 60, teacher: host, desc: e.desc || '', event: e.id,
      chapters: (e.agenda || []).map(function (a, i) { var mm = i === 0 ? 0 : Math.round((toMin(a[0]) - toMin(e.agenda[0][0]))); return [Math.floor(mm / 60) + ':' + U.pad(mm % 60), a[1]]; }) },
    function (archiveId) {
      save(function (b) { b.archived[e.id] = { at: nowIso(), by: me(), archiveId: archiveId }; });
      cur.refresh();
    });
  }
  function toMin(t) { var p = String(t).split(':'); return (+p[0]) * 60 + (+p[1] || 0); }

  /* ---------- 企画 ---------- */
  /* 通した企画からイベントを作るときの下書き（主催は企画を出した会員。会場の集まりは録画しない） */
  function fromProposal(p) {
    return { title: p.title, at: p.at, kind: p.online ? 'online' : 'offline', cap: p.cap, fee: p.fee, desc: p.desc, host: p.no, recording: !!p.online,
      place: p.online ? 'オンライン（Zoom）' : p.place, proposal: p.id, venue: p.online ? null : { name: '', address: p.place || '', bring: '' } };
  }
  function propDrawer(p) {
    var e = p.kind === 'speaker' && p.event ? findEvent(p.event) : null;
    var made = box().fromProposal[p.id];
    var foot = '<button type="button" class="btn btn-soft" data-close>閉じる</button>';
    var dp = AU.can('content') ? '' : ' disabled';
    if (p.status === 'review') foot = '<button type="button" class="btn btn-ghost" data-ev-decide="no"' + dp + '>見送る</button><button type="button" class="btn btn-primary" data-ev-decide="yes"' + dp + '>通す</button>';
    else if (p.status === 'approved' && p.kind !== 'speaker' && !made) foot += '<button type="button" class="btn btn-ink" data-ev-make' + dp + '>イベントとして作る</button>';
    var hits = cms().flags(p.title + '\n' + (p.desc || ''));
    var dw = AU.drawer(
      '<div class="a-ev__who">' + AU.who(p.no, { size: 's' }) + (p.live ? '<span class="a-ev__live">デモ会員</span>' : '') + '</div>' +
      '<h3 class="a-ev__ptitle">' + cms().marks(p.title) + '</h3>' +
      (p.desc ? '<p class="a-ev__desc">' + cms().marks(p.desc, { br: true }) + '</p>' : '') +
      AU.kv([
        ['種類', propLabel(p)],
        e ? ['発表する会', e.title + '（' + U.fmtShort(e.at, true) + '）'] : ['開催の希望', p.at ? U.fmtDate(p.at, { time: true }) : ''],
        p.kind === 'speaker' ? null : ['場所', p.online ? 'オンライン' : p.place],
        p.cap ? ['定員', p.cap + '人'] : null, p.fee ? ['参加費', p.fee] : null,
        ['届いた', U.fmtShort(p.sentAt, true)],
        ['状態', AU.status('review', p.status, p.status === 'approved' ? '通した' : p.status === 'rejected' ? '見送った' : null), true],
        p.reason ? ['見送った理由', p.reason] : null,
        made ? ['イベント', '<a href="#/events/' + esc(encodeURIComponent(made)) + '">作ったイベントを見る</a>', true] : null
      ]) +
      (hits.length ? '<p class="a-ev__flag">' + icon('alert', 'ico-s') + '載せられない言葉：' + esc(hits.join('・')) + '</p>' : ''),
      { title: p.kind === 'speaker' ? '発表の申込み' : 'イベントの企画', cls: 'a-events', foot: foot });
    dw.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-ev-decide],[data-ev-make]'); if (!b || b.disabled) return;
      dw.close();
      if (b.hasAttribute('data-ev-make')) { eventForm(null, fromProposal(p)); return; }
      decide(p, b.getAttribute('data-ev-decide') === 'yes');
    });
  }
  function decide(p, yes) {
    var name = cms().personName(p.no);
    function apply(reason) {
      if (p.live) { var r = R.approveEventProposal(p.id, yes, reason); if (!r || r.ok === false) return r || { ok: false, error: 'できませんでした' }; }
      else AD.db.update(function (s) {
        var x = (s.proposals || []).filter(function (y) { return y.id === p.id; })[0]; if (!x) return;
        x.status = yes ? 'approved' : 'rejected'; x.decidedAt = nowIso(); if (!yes) x.reason = reason;
      });
      return { ok: true };
    }
    if (yes) {
      var r = apply('');
      if (r.ok === false) { U.toast(r.error || 'できませんでした', 'error'); return; }
      AD.db.audit({ action: 'event_approve', label: p.kind === 'speaker' ? '発表の申込みを通した' : 'イベントの企画を通した', target: { type: 'proposal', id: p.id, name: p.title }, detail: name });
      U.toast('「' + p.title + '」を通しました' + (p.live ? '。' + name + 'さんに知らせが届きます' : ''), 'ok', p.kind !== 'speaker' ? { action: 'イベントを作る', onAction: function () {
        eventForm(null, fromProposal(p));
      } } : null);
      cur.refresh();
      return;
    }
    AU.act({
      title: '見送る', ok: '見送る', danger: true,
      text: name + 'さんの「' + p.title + '」を見送ります。理由は本人に届きます。',
      reasonLabel: '本人に届く理由',
      reasons: ['同じ日に運営のイベントがあるため、日にちを変えて出し直してください。', '会場の住所（番地まで）と、当日の連絡のしかたを書いて出し直してください。', '参加費の内訳を書いて出し直してください。', '今回の発表は枠がいっぱいになりました。来月の会に申し込んでください。'],
      run: function (reason) { return apply(reason); },
      audit: { action: 'event_reject', label: p.kind === 'speaker' ? '発表の申込みを見送った' : 'イベントの企画を見送った', target: { type: 'proposal', id: p.id, name: p.title }, detail: name },
      done: '見送りました'
    }).then(function (r) { if (r) cur.refresh(); });
  }

  function csvRes(e) {
    var rs = reservations(e);
    AU.downloadCsv(e.title + '_予約', rs, [
      { label: '会員番号', value: function (x) { return x.no; } }, { label: '名前', value: function (x) { return cms().personName(x.no); } },
      { label: '予約', value: function (x) { return AU.ymd(x.at, true); } }, { label: '出欠', value: function (x) { return x.attended ? '出席' : ''; } }
    ]);
  }

  AD.screens.events = {
    title: function (ctx) { if (!ctx.params[0]) return 'イベント'; var e = findEvent(ctx.params[0]); return e ? e.title : 'ページが見つかりません'; },
    render: function (ctx) {
      if (ctx.params[0]) {
        var e = findEvent(ctx.params[0]);
        if (!e) return '<div class="a-events">' + AU.head({ title: 'ページが見つかりません', crumb: [['#/events', 'イベント']], sub: 'このイベントはありません。' }) + '<a class="btn btn-ink" href="#/events">イベントの一覧へ</a></div>';
        return detail(ctx, e);
      }
      var tab = ctx.query.tab || 'list', q = ctx.data.queues(), m = ctx.data.metrics();
      var up = upcomingRows(), todo = pastRows().filter(function (e) { return e.recording && !e.archivedTo && !e.canceled; }).length;
      var tabs = AU.tabs([
        { id: 'list', label: 'これから', href: '#/events', n: up.length },
        { id: 'past', label: '終わった会', href: '#/events?tab=past', n: todo ? '録画待ち ' + todo : '' },
        { id: 'proposals', label: '会員からの企画', href: '#/events?tab=proposals', n: m.proposals || '', alert: m.proposals > 0 }
      ], tab, 'イベントの表示');
      var body = tab === 'proposals' ? proposalsView(ctx, q) : tab === 'past' ? pastView(ctx) : listView(ctx);
      var wk = ctx.data.weekEvents();
      return '<div class="a-events">' + AU.head({ title: 'イベント', sub: 'これから7日 ' + wk.length + '件・予約 ' + U.num(ctx.data.metrics().weekReserved) + '人',
        actions: '<button type="button" class="btn btn-ink btn-s" data-ev-new' + (AU.canSome('content') ? '' : ' disabled') + '>' + icon('plus', 'ico-s') + 'イベントを作る</button>' }) +
        AU.roleNote('content', 'イベントの作成と編集') + tabs + body + '</div>';
    },
    mount: function (root, ctx) {
      cur = ctx;
      if (root.__boundEvents) return;
      root.__boundEvents = true;
      root.addEventListener('click', function (ev) {
        var t = ev.target, b;
        if (!t.closest('.a-events')) return;
        var e = cur.params[0] ? findEvent(cur.params[0]) : null;
        var own = e ? { owner: e.host } : null;
        // 講師は主催を自分にして作れる（フォームの主催は自分だけになる）
        if ((b = t.closest('[data-ev-new]'))) { if (AU.canSome('content') ? true : AU.need('content')) eventForm(null); return; }
        if ((b = t.closest('[data-ev-edit]'))) { if (e && AU.need('content', own)) eventForm(e); return; }
        if ((b = t.closest('[data-ev-cancel]'))) { if (e && AU.need('content', own)) cancelEvent(e); return; }
        if ((b = t.closest('[data-ev-attall]'))) { if (e && AU.need('content', own)) markAll(e); return; }
        if ((b = t.closest('[data-ev-csv]'))) { if (e) csvRes(e); return; }
        if ((b = t.closest('[data-ev-promote]'))) { if (e && AU.need('content', own)) promote(e, b.getAttribute('data-ev-promote')); return; }
        if ((b = t.closest('[data-ev-send]'))) { if (e && AU.need('content', own)) send(e, b.getAttribute('data-ev-send')); return; }
        if ((b = t.closest('[data-ev-archive]'))) { if (e && AU.need('content', own)) toArchive(e); return; }
        if ((b = t.closest('[data-ev-prop]'))) {
          var p = propRows(AD.data.queues()).filter(function (x) { return x.id === b.getAttribute('data-ev-prop'); })[0];
          if (p) propDrawer(p);
          return;
        }
        var tr = t.closest('tr[data-tb-row]');
        if (tr && !tr.hasAttribute('data-tb-href') && !t.closest('a,button,input,select,textarea,label') && !String(window.getSelection ? window.getSelection() : '')) {
          var ob = tr.querySelector('[data-ev-prop]'); if (ob) { ob.focus(); ob.click(); }
        }
      });
      root.addEventListener('change', function (ev) {
        var t = ev.target;
        if (!t.matches || !t.matches('.a-events [data-ev-att]')) return;
        var e = findEvent(cur.params[0]); if (!e) return;
        if (setAttendance(e, t.getAttribute('data-ev-att'), t.checked)) cur.refresh();
        else t.checked = !t.checked;
      });
    }
  };
})();
