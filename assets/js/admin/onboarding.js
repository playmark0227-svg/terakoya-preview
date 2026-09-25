/* ============================================================
   運営画面：新入生の30日（#/onboarding）
   ------------------------------------------------------------
   入会30日以内の会員を、スタートガイドの10項目の表で並べる。止まっている項目・最後の活動（7日動きがなければ朱）・
   面談の予約・声かけの記録を1行に。「声をかける」はひな形を選んで送る（P.compose → 受信箱に「対応中」で入る）。
   ?filter=stalled|idle|nomeet|done   ?week=1〜4   ?view=interviews（面談。最初は確定待ちだけ）| contacts（声かけの記録）
   止まっているかどうかは AD.data.stalled()（ダッシュボードの数と同じ決め方）。
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, AD = CLG.admin, AU = AD.ui, U = CLG.ui, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon, P = AD.people;
  var cur = null;
  var IV_ORDER = { none: 0, pending: 1, confirmed: 2, done: 3 };

  function lastContact(no) {
    var list = AD.db.state.contacts.filter(function (c) { return c.no === no; });
    return list.sort(function (a, b) { return new Date(b.at) - new Date(a.at); })[0] || null;
  }
  function meetDone(r) { return r.steps.some(function (s) { return s.id === 'meet' && s.done; }); }
  /** 声をかけるときのひな形：止まっている項目に合わせる */
  function templateFor(r) {
    if (r.idleDays >= 7) return 'idle';
    var next = r.steps.filter(function (s) { return !s.done; })[0];
    if (!next) return 'free';
    if (next.id === 'orient') return 'orient';
    if (next.id === 'line') return 'line';
    if (next.id === 'meet') return 'meet';
    return 'stalled';
  }

  function rowsOf(ctx) {
    var st = {};
    ctx.data.stalled().forEach(function (s) { st[s.no] = s; });
    return ctx.data.members().filter(function (m) { return m.day <= 30 && m.status !== 'left'; }).map(function (m) {
      var s = st[m.no], steps = P.steps(m), exp = ctx.data.expectedSteps(m.day);
      return Object.assign({}, m, {
        stalled: !!s, why: s ? s.why : '', idleDays: P.idleDays(m), expected: exp, gap: exp - m.stepsDone,
        steps: steps, iv: P.interviewOf(m.no), contact: lastContact(m.no), week: Math.min(4, Math.ceil(m.day / 7))
      });
    });
  }

  function matrix(r) {
    var first = -1;
    var cells = r.steps.map(function (s, i) {
      if (!s.done && first < 0) first = i;
      var cls = s.done ? 'is-done' : i === first ? 'is-next' : s.due ? 'is-due' : '';
      var tip = (i + 1) + ' ' + s.title + '：' + (s.done ? '済み ' + U.fmtShort(s.doneAt) : i === first ? '次の項目' : s.due ? '予定より遅れ' : 'まだ');
      return '<i' + (cls ? ' class="' + cls + '"' : '') + ' title="' + esc(tip) + '"></i>';
    }).join('');
    var label = 'スタートガイド ' + r.stepsDone + '/' + r.steps.length + '。' + (first >= 0 ? '次は「' + r.steps[first].title + '」' : 'すべて済み');
    // 本文が狭いときは「止まっている項目」の列を隠し、ここに同じものを出す（CSS で切り替える）
    return '<span class="a-ob__mxw"><span class="a-ob__mx" role="img" aria-label="' + esc(label) + '">' + cells + '</span>' +
      '<span class="a-ob__mxn num" aria-hidden="true">' + r.stepsDone + '/' + r.steps.length + '</span></span>' +
      '<span class="a-ob__mxnext" aria-hidden="true">' + stepCell(r, true) + '</span>';
  }
  function stepCell(r, inline) {
    var next = r.steps.filter(function (s) { return !s.done; })[0];
    if (!next) return inline ? '' : '<span class="muted">すべて済み</span>';
    var why = r.why === 'idle' ? '7日以上動きがない' : r.day >= 5 && r.gap >= 2 ? '予定より' + r.gap + '項目遅れ' : '';
    return '<span class="a-ob__step' + (r.stalled ? ' is-stalled' : '') + '" title="' + esc(next.title) + '">' + (inline ? '次：' : '') + esc(P.SHORT[next.id] || next.title) + '</span>' +
      (why ? '<span class="a-ob__why' + (r.why === 'idle' ? ' is-idle' : '') + '">' + esc(why) + '</span>' : '');
  }
  function ivKey(r) { return r.iv ? r.iv.status : meetDone(r) ? 'done' : 'none'; }
  function ivCell(r) {
    var iv = r.iv;
    if (!iv) return meetDone(r) ? '済み' : '<span class="muted">未予約</span>';
    if (iv.status === 'pending') return AU.status('interview', 'pending') + '<span class="a-ob__ivat num">' + esc(U.fmtShort(iv.at, true)) + '</span>';
    if (iv.status === 'confirmed') return '<span class="num">' + esc(U.fmtShort(iv.at, true)) + '</span>';
    return AU.status('interview', iv.status);
  }
  function idleCell(r) {
    if (r.idleDays >= 7) return '<span class="ad-age is-over">' + icon('alert', 'ico-s') + '<span><span class="num">' + r.idleDays + '</span>日前</span><span class="sr-only">（7日以上動きがありません）</span></span>';
    return r.lastActive ? '<time datetime="' + esc(r.lastActive) + '" title="' + esc(U.fmtShort(r.lastActive, true)) + '">' + esc(U.relTime(r.lastActive)) + '</time>' : '<span class="muted">―</span>';
  }

  function legend() {
    return '<ol class="a-ob__legend" aria-label="スタートガイドの項目">' + DATA.ONBOARDING.map(function (s, i) {
      return '<li><span class="num">' + (i + 1) + '</span>' + esc(P.SHORT[s.id] || s.title) + '</li>';
    }).join('') + '<li class="a-ob__key"><i class="is-done"></i>済み</li><li class="a-ob__key"><i class="is-next"></i>次の項目</li><li class="a-ob__key"><i class="is-due"></i>予定より遅れ</li></ol>';
  }

  function listView(ctx, rows) {
    return legend() + AU.table({
      id: 'onboarding', rows: rows, query: ctx.query, sort: '-joinedAt', label: '入会30日以内の会員', pageSize: 100,
      rowId: function (r) { return r.no; },
      search: { placeholder: '名前・会員番号', keys: ['name', 'no', 'kana', 'realName'] },
      filters: [
        { key: 'filter', label: '表示', chips: true,
          options: [['', 'すべて'], ['stalled', '止まっている'], ['idle', '7日動きがない'], ['nomeet', '面談が未予約'], ['done', '終えた']],
          match: function (r, v) {
            return v === 'stalled' ? r.stalled : v === 'idle' ? r.idleDays >= 7 : v === 'nomeet' ? ivKey(r) === 'none' : v === 'done' ? r.stepsDone >= r.steps.length : true;
          } },
        { key: 'week', label: '入会', options: [['', 'すべて'], ['1', '1週目（1〜7日目）'], ['2', '2週目（8〜14日目）'], ['3', '3週目（15〜21日目）'], ['4', '4週目（22〜30日目）']],
          match: function (r, v) { return String(r.week) === v; } }
      ],
      columns: [
        { key: 'name', label: '会員', main: true, value: function (r) { return r.name; },
          html: function (r) { return AU.who(r, { sub: r.no + '・' + r.day + '日目' + (r.live ? '・デモ会員' : '') }); }, csv: function (r) { return r.name + ' ' + r.no; } },
        { key: 'joinedAt', label: '入会', dir: 'desc', nowrap: true, hide: 'md', value: function (r) { return r.joinedAt; },
          html: function (r) { return '<span class="num">' + esc(U.fmtShort(r.joinedAt)) + '</span><span class="a-ob__day num">' + r.day + '日目</span>'; },
          csv: function (r) { return AU.ymd(r.joinedAt); } },
        { key: 'stepsDone', label: 'スタートガイド', dir: 'asc', html: matrix, csv: function (r) { return r.stepsDone + '/' + r.steps.length; } },
        { key: 'next', label: '止まっている項目', value: function (r) { var n = r.steps.filter(function (s) { return !s.done; })[0]; return n ? n.title : ''; },
          sortValue: function (r) { return r.gap; }, dir: 'desc', hide: 'md', html: function (r) { return stepCell(r); } },
        { key: 'idleDays', label: '最後の活動', align: 'r', dir: 'desc', html: function (r) {
          return idleCell(r) + (r.contact ? '<span class="a-ob__said">声かけ ' + esc(U.fmtShort(r.contact.at)) + '</span>' : '');
        }, csv: function (r) { return r.idleDays; } },
        { key: 'iv', label: '面談', value: function (r) { return IV_ORDER[ivKey(r)]; }, html: ivCell, csv: function (r) { return AU.statusLabel('interview', ivKey(r)) || '未予約'; }, hide: 'sm' },
        { key: 'contact', label: '声かけ', csvOnly: true, csv: function (r) { return r.contact ? AU.ymd(r.contact.at, true) : ''; } },
        { key: 'act', label: '操作', sort: false, csv: false, nowrap: true,
          html: function (r) { return '<button type="button" class="btn btn-ghost btn-s a-ob__say" data-ob-say="' + esc(r.no) + '" title="声をかける"' + AU.dis('members') + '>' + icon('mail', 'ico-s') + '<span class="a-ob__saytxt">声をかける</span></button>'; } }
      ],
      rowHref: function (r) { return '#/members/' + encodeURIComponent(r.no); },
      rowClass: function (r) { return r.idleDays >= 7 ? 'is-alert' : r.stalled ? 'is-warn' : ''; },
      rowLabel: function (r) { return r.name; },
      select: AU.can('members'),
      bulk: [{ id: 'say', label: '声をかける', icon: 'mail', run: function (list, t) {
        P.compose(list, { template: 'stalled', status: 'doing', contact: true }).then(function (res) { if (res && res.sent) { t.clear(); if (cur) cur.refresh(); } });
      } }],
      csv: { name: '新入生の30日' }, empty: '入会30日以内の会員はいません。'
    });
  }

  function interviewsView(ctx) {
    var rows = ctx.data.queues().interviews.map(function (x) {
      var m = ctx.data.member(x.no);
      return Object.assign({}, x, { who: m ? m.name : x.no, day: m ? m.day : null });
    });
    var n = CLG.now(), slot = {};
    rows.forEach(function (r) { if (r.status === 'pending' || r.status === 'confirmed') { var k = new Date(r.at).getTime(); slot[k] = (slot[k] || 0) + 1; } });
    return AU.table({
      id: 'interviews', rows: rows, query: ctx.query, sort: 'at', label: '面談',
      search: { placeholder: '名前・会員番号', keys: ['who', 'no'] },
      filters: [{ key: 'status', label: '状態', chips: true, value: 'pending',
        options: [['pending', '確定待ち'], ['confirmed', '予約済み'], ['done', '済み'], ['canceled', '取消'], ['', 'すべて']] }],
      columns: [
        { key: 'who', label: '会員', main: true, html: function (r) { return AU.who(r.no, { sub: r.no + (r.day ? '・入会' + r.day + '日目' : '') }); }, csv: function (r) { return r.who + ' ' + r.no; } },
        AU.col.when('at', '面談の日時', { dir: 'asc', html: function (r) {
          var k = new Date(r.at).getTime(), same = (r.status === 'pending' || r.status === 'confirmed') ? (slot[k] || 1) - 1 : 0;
          return '<span class="num">' + esc(U.fmtShort(r.at, true)) + '</span>' + (same ? '<span class="a-ob__clash">同じ時刻にほか' + same + '件</span>' : '');
        } }),
        AU.col.rel('bookedAt', '申込み', { hide: 'sm' }),
        AU.col.status('status', '状態', 'interview'),
        { key: 'act', label: '操作', sort: false, csv: false, nowrap: true, html: function (r) {
          var b = '';
          var d = AU.dis('members');
          if (r.status === 'pending') b += '<button type="button" class="btn btn-ghost btn-s" data-ob-ivok="' + esc(r.id) + '"' + d + '>確定する</button>';
          if (r.status === 'confirmed' && new Date(r.at) < n && !r.live) b += '<button type="button" class="btn btn-ghost btn-s" data-ob-ivdone="' + esc(r.id) + '"' + d + '>済みにする</button>';
          if ((r.status === 'pending' || r.status === 'confirmed') && !r.live) b += '<button type="button" class="btn btn-text btn-s" data-ob-ivcancel="' + esc(r.id) + '"' + d + '>取り消す</button>';
          return b || '<span class="muted">―</span>';
        } }
      ],
      rowHref: function (r) { return '#/members/' + encodeURIComponent(r.no); },
      tools: '<a class="btn btn-ghost btn-s" href="#/inbox?view=slots">' + icon('calendar', 'ico-s') + '面談の枠</a>',
      csv: { name: '面談' }, empty: 'まだ面談の申込みはありません。'
    });
  }

  function contactsView(ctx) {
    var rows = AD.db.state.contacts.map(function (c) {
      var m = ctx.data.member(c.no), tid = P.threadOf(c.no), th = tid ? ctx.data.thread(tid) : null;
      var replied = th ? th.messages.some(function (x) { return x.from === 'member' && !x.auto && new Date(x.at) > new Date(c.at); }) : false;
      var tp = P.TEMPLATES.filter(function (t) { return t.id === c.template; })[0];
      return Object.assign({}, c, { who: m ? m.name : c.no, tpl: tp ? tp.name : '声かけ', replied: replied, tid: tid });
    });
    return AU.table({
      id: 'contacts', rows: rows, query: ctx.query, sort: '-at', label: '声かけの記録',
      search: { placeholder: '名前・会員番号・本文', keys: ['who', 'no', 'text'] },
      filters: [{ key: 'replied', label: '返事', chips: true, options: [['', 'すべて'], ['no', '返事がまだ'], ['yes', '返事あり']],
        match: function (r, v) { return v === 'yes' ? r.replied : !r.replied; } }],
      columns: [
        AU.col.when('at', '送った日時'),
        { key: 'who', label: '会員', main: true, html: function (r) { return AU.who(r.no); }, csv: function (r) { return r.who + ' ' + r.no; } },
        { key: 'tpl', label: 'ひな形', nowrap: true, hide: 'sm' },
        { key: 'text', label: '本文', sort: false, html: function (r) {
          return '<a class="a-ob__text" href="' + (r.tid ? '#/inbox/' + esc(encodeURIComponent(r.tid)) : '#/members/' + esc(encodeURIComponent(r.no))) + '">' + esc(String(r.text).replace(/\s+/g, ' ').slice(0, 160)) + '</a>';
        } },
        { key: 'by', label: '送った人', hide: 'sm', nowrap: true, value: function (r) { return AD.db.staffName(r.by); } },
        { key: 'replied', label: '返事', value: function (r) { return r.replied ? 1 : 0; }, html: function (r) { return r.replied ? '返事あり' : '<span class="muted">まだ</span>'; },
          csv: function (r) { return r.replied ? 'あり' : 'まだ'; } }
      ],
      rowHref: function (r) { return r.tid ? '#/inbox/' + encodeURIComponent(r.tid) : '#/members/' + encodeURIComponent(r.no); },
      csv: { name: '声かけの記録' }, empty: 'まだ声をかけていません。新入生の一覧の「声をかける」から送れます。'
    });
  }

  AD.screens.onboarding = {
    title: '新入生の30日',
    skeleton: 'table',
    render: function (ctx) {
      var view = ctx.query.view === 'interviews' || ctx.query.view === 'contacts' ? ctx.query.view : 'list';
      var rows = rowsOf(ctx);
      var stalled = rows.filter(function (r) { return r.stalled; }).length, idle = rows.filter(function (r) { return r.idleDays >= 7; }).length;
      var pending = ctx.data.queues().interviews.filter(function (x) { return x.status === 'pending'; }).length;
      var body = view === 'interviews' ? interviewsView(ctx) : view === 'contacts' ? contactsView(ctx) : listView(ctx, rows);
      return '<div class="a-onboarding">' +
        AU.head({ title: '新入生の30日', sub: '入会30日以内 ' + rows.length + '人・止まっている ' + stalled + '人・7日動きがない ' + idle + '人' }) +
        AU.tabs([
          { id: 'list', label: '入会30日以内', href: '#/onboarding', n: rows.length },
          { id: 'interviews', label: '面談', href: '#/onboarding?view=interviews', n: pending || '', alert: false },
          { id: 'contacts', label: '声かけの記録', href: '#/onboarding?view=contacts', n: AD.db.state.contacts.length || '' }
        ], view, '新入生の30日の表示') +
        body +
      '</div>';
    },
    mount: function (root, ctx) {
      cur = ctx;
      if (root.__boundOnboarding) return;
      root.__boundOnboarding = true;
      root.addEventListener('click', function (e) {
        var t = e.target, b;
        if (!t.closest('.a-onboarding')) return;
        if ((b = t.closest('[data-ob-say]'))) {
          var no = b.getAttribute('data-ob-say'), r = rowsOf(cur).filter(function (x) { return x.no === no; })[0];
          if (!r) return;
          P.compose([r], { template: templateFor(r), status: 'doing', contact: true }).then(function (res) { if (res && res.sent) cur.refresh(); });
          return;
        }
        var ivs = function (id) { return AD.data.queues().interviews.filter(function (x) { return x.id === id; })[0]; };
        if ((b = t.closest('[data-ob-ivok]'))) {
          var res = P.confirmInterview(ivs(b.getAttribute('data-ob-ivok')));
          U.toast(res.ok ? '面談を確定しました。Zoom のリンクを送りました' : res.error, res.ok ? 'ok' : 'error');
          cur.refresh();
          return;
        }
        if ((b = t.closest('[data-ob-ivdone]'))) {
          P.setInterview(ivs(b.getAttribute('data-ob-ivdone')), 'done');
          U.toast('済みにしました', 'ok');
          cur.refresh();
          return;
        }
        if ((b = t.closest('[data-ob-ivcancel]'))) {
          var iv = ivs(b.getAttribute('data-ob-ivcancel')); if (!iv) return;
          var m = AD.data.member(iv.no);
          AU.act({
            title: '面談を取り消す', ok: '取り消す', danger: true,
            text: (m ? m.name + 'さんの' : '') + U.fmtShort(iv.at, true) + 'の面談を取り消します。',
            reasons: ['本人から取り消しの連絡があった', '運営の都合（担当が出られない）'],
            run: function (reason) { return P.setInterview(iv, 'canceled', reason); },
            done: '取り消しました'
          }).then(function (r2) { if (r2) cur.refresh(); });
        }
      });
    }
  };
})();
