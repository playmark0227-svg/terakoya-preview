/* ============================================================
   運営画面：支払い（#/payments）
   ?tab=charges（請求の一覧。既定）| failed（支払いエラー）| cancels（解約予定）| refunds（返金）
   ?month=0|-1|…|-7（請求の一覧と上の数字の月）  ?status=paid|failed|refunded（請求の一覧の絞り込み）
   ?pay=<決済のID>（その請求の引き出しを開く。ほかの画面からのリンクにも使える）
   - 金額はすべて税込。数字は AD.data.payments / revenue（デモのデータ＋デモ会員の請求）から作る。
   - 書き換え：デモ会員の分は R.updateCard（払い直し）・R.staffReply（連絡）・返金は AD.ops.refund（R.refundInvoice。会員ページの
     領収書が「返金済み」になり、お知らせが届く）。ほかの会員は AD.db。返金はどちらも AD.ops.refund を通すので、まだ払っていない
     紹介報酬の取消と操作の記録は、会員の詳細の返金と同じ形になる。
     お金を動かす操作（返金・やり直し）と連絡は、AU.act で理由を書いてもらい操作の記録に残す（返金・やり直しは理由が必須）。
   - 返金・やり直し・連絡・領収書は代表・運営・経理だけ（講師は見るだけ。設定の「役割でできること」と同じ）。
   - Stripe の画面は外のリンク（本番の管理画面）。Customer Portal のリンクは本番で API から作る。
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, AD = CLG.admin, AU = AD.ui, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon, SITE = DATA.SITE;
  var cur = null;
  var DAY = 86400000;
  var STRIPE = 'https://dashboard.stripe.com/';
  // 解約の理由（会員ページの account.js と同じ5つ）。答えなかった人は「未回答」
  var REASONS = ['料金', '時間がない', '内容が合わない', '目的を達成した', 'その他'];
  var REFUND_REASONS = ['二重の請求', '解約の申し出が更新日の前だった', '入会の直後に解約の申し出', 'サービスの不具合で使えなかった'];
  var RETRY_REASONS = ['カードを更新したと連絡があった', '残高を戻したと連絡があった', '自動のやり直しを待たずに請求する'];
  /* ---------- 小さな道具 ----------
     お金の操作（返金・やり直し・連絡・領収書）ができる役割は、設定の「役割でできること」（AU.ROLE_TABLE の money）。講師は見るだけ */
  function canMoney() { return AU.can('money'); }
  function roleNote() { return AU.roleNote('money', '返金・やり直し・連絡'); }
  function dis() { return canMoney() ? '' : ' disabled'; }
  function hashWith(patch) { return AD.app.hashOf('payments', Object.assign({}, (cur && cur.query) || {}, patch)); }
  function member(no) { return AD.data.member(no) || { no: no, name: no }; }
  function isLive(p) { return !!p.live || p.no === AD.data.live().no; }
  function find(id) { return AD.data.payments().filter(function (p) { return p.id === id; })[0] || null; }
  function graceEnd(p) {
    var d = new Date(new Date(p.at).getTime() + (SITE.graceDays || 7) * DAY); d.setHours(23, 59, 0, 0); return d;
  }
  function monthLabel(off) {
    var n = CLG.now(), d = new Date(n.getFullYear(), n.getMonth() + off, 1);
    return (d.getFullYear() !== n.getFullYear() ? d.getFullYear() + '年' : '') + (d.getMonth() + 1) + '月' + (off === 0 ? '（今月）' : '');
  }
  function monthOff(q) { var v = parseInt(q.month, 10); return isNaN(v) ? 0 : Math.max(-7, Math.min(0, v)); }
  /* 連絡の記録（支払いエラー・振込先のお願いなど。運営画面だけが持つ） */
  function contacts() { return AD.db.ensure('moneyContacts', function () { return []; }); }
  function lastContact(no, kind) {
    return contacts().filter(function (c) { return c.no === no && (!kind || c.kind === kind); })
      .sort(function (a, b) { return new Date(b.at) - new Date(a.at); })[0] || null;
  }
  // 最初の連絡：操作の記録に残っている「支払いエラーの連絡をした」（デモのデータ）も数える
  function contactOf(p) {
    var c = lastContact(p.no, 'payment_failed');
    if (c) return c;
    var a = AD.db.state.audit.filter(function (x) { return x.action === 'payment_contact' && x.target && x.target.id === p.no; })[0];
    return a ? { at: a.at, by: a.by } : null;
  }
  function fill(tpl, v) { return String(tpl || '').replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }); }

  /* ---------- 請求の一覧 ---------- */
  function reasonCell(p) {
    if (p.failure) return '<span class="ad-age is-over">' + esc(p.failure.label) + '</span>';
    if (p.refund) return '<span class="pm-muted">' + esc(p.refund.reason) + '</span>';
    if (p.recovered) return '<span class="pm-muted">やり直しで支払い</span>';
    return '';
  }
  function chargesTab(ctx) {
    var off = monthOff(ctx.query), rv = AD.data.revenue(off);
    var rows = AD.data.payments({ month: off });
    // 今月は途中なので、前の月の同じ日までと比べる（月の全体と比べると、毎月「減った」に見えるため）
    var n = CLG.now(), upto = off === 0 ? n.getDate() : 31;
    var prevPaid = AD.data.payments({ month: off - 1 }).filter(function (p) {
      return AD.data.inMonth(p.at, off - 1) && p.status !== 'failed' && new Date(p.at).getDate() <= upto;
    }).reduce(function (a, p) { return a + p.amount; }, 0);
    var diff = rv.paid - prevPaid;
    var opts = [];
    for (var k = 0; k >= -7; k--) opts.push('<option value="' + k + '"' + (k === off ? ' selected' : '') + '>' + esc(monthLabel(k)) + '</option>');
    var filters = '<div class="pm-filters">' +
      '<label class="pm-filters__f"><span>月</span><select class="select ad-tb__select" id="pmMonth" data-pm-month>' + opts.join('') + '</select></label>' +
      '<span class="pm-filters__note">請求日で集計（返金は返した日）</span></div>';
    var kpis = '<div class="ad-kpis pm-kpis">' +
      AU.kpi({ label: '請求', value: U.num(rv.charged), unit: '円', sub: U.num(rv.count) + '件' }) +
      AU.kpi({ label: '入金', value: U.num(rv.paid), unit: '円',
        sub: (off === 0 ? '先月の' + upto + '日までより ' : '前の月より ') + (diff >= 0 ? '+' : '−') + U.num(Math.abs(diff)) + '円' }) +
      AU.kpi({ label: '失敗', value: U.num(rv.failed), unit: '円', sub: rv.failedCount + '件', tone: rv.failedCount && off === 0 ? 'alert' : '',
        href: hashWith({ tab: 'charges', status: 'failed', page: null, pay: null }) }) +
      AU.kpi({ label: '返金', value: U.num(rv.refunded), unit: '円', sub: rv.refundCount + '件・差し引き ' + U.yen(rv.net),
        href: hashWith({ tab: 'charges', status: 'refunded', page: null, pay: null }) }) +
    '</div>';
    var table = AU.table({
      id: 'payments', rows: rows, query: ctx.query, sort: '-at', label: monthLabel(off) + 'の請求',
      search: { placeholder: '会員番号・名前・決済のID', label: '会員番号・名前・カード・決済のIDで探す', keys: ['no', 'who', 'card', 'id', 'receiptNo'] },
      filters: [{ key: 'status', label: '状態', chips: true, options: [['', 'すべて'], ['paid', '支払済'], ['failed', '失敗'], ['refunded', '返金済み']] }],
      columns: [
        AU.col.when('at', '請求日', { html: function (p) { return '<a class="num" href="' + esc(hashWith({ pay: p.id })) + '">' + esc(U.fmtShort(p.at, true)) + '</a>'; } }),
        AU.col.member('no', '会員', { key: 'who', main: true, value: function (p) { return member(p.no).name; }, html: function (p) { return AU.who(p.no); } }),
        AU.col.money('amount', '金額'),
        AU.col.status('status', '状態', 'payment'),
        { key: 'note', label: '失敗・返金の理由', sort: false, value: function (p) { return p.failure ? p.failure.label : p.refund ? p.refund.reason : ''; }, html: reasonCell },
        { key: 'card', label: 'カード', hide: 'md', nowrap: true },
        { key: 'receiptNo', label: '領収書番号', hide: 'md', cls: 'mono', sort: false },
        { key: 'id', label: '決済のID', csvOnly: true }
      ],
      rowHref: function (p) { return hashWith({ pay: p.id }); },
      rowClass: function (p) { return p.status === 'failed' ? 'is-alert' : ''; },
      csv: { name: '請求_' + AD.data.monthKey(new Date(CLG.now().getFullYear(), CLG.now().getMonth() + off, 1)) },
      empty: monthLabel(off) + 'の請求はありません。'
    });
    return filters + kpis + table;
  }

  /* ---------- 支払いエラー ---------- */
  function failedRows() {
    return AD.data.payments({ status: 'failed' }).map(function (p) {
      var c = contactOf(p);
      return Object.assign({}, p, { grace: graceEnd(p).toISOString(), contactAt: c ? c.at : null, nextRetry: p.failure && p.failure.nextRetryAt });
    });
  }
  function failedTab(ctx) {
    var rows = failedRows(), n = CLG.now();
    var soon = rows.filter(function (p) { return new Date(p.grace) - n < 2 * DAY; }).length;
    var lead = rows.length
      ? '<p class="pm-lead">' + esc(rows.length + '件。カードが通らないまま' + (SITE.graceDays || 7) + '日たつと、会員ページの講座とイベントが止まります。') +
        (soon ? '<b class="pm-alert">' + esc('猶予が2日を切ったもの ' + soon + '件') + '</b>' : '') + '</p>'
      : '';
    return lead + AU.table({
      id: 'failed', rows: rows, query: ctx.query, qp: 'f', sort: 'grace', label: '支払いエラー',
      search: { placeholder: '会員番号・名前', keys: ['no', 'who'] },
      columns: [
        AU.col.member('no', '会員', { key: 'who', main: true, value: function (p) { return member(p.no).name; }, html: function (p) { return AU.who(p.no); } }),
        AU.col.date('at', '請求日'),
        AU.col.money('amount', '金額', { hide: 'sm' }),
        { key: 'reason', label: '理由', nowrap: true, value: function (p) { return p.failure ? p.failure.label : ''; } },
        { key: 'attempts', label: '試した回数', align: 'r', html: function (p) { return '<span class="num">' + (p.attempts || 1) + '</span>回'; } },
        AU.col.date('nextRetry', '次の自動のやり直し', { hide: 'md', dir: 'asc' }),
        { key: 'grace', label: '猶予の終わり', nowrap: true, dir: 'asc', value: function (p) { return p.grace; },
          html: function (p) {
            var left = Math.ceil((new Date(p.grace) - n) / DAY);
            return '<span class="num' + (left <= 2 ? ' pm-alert' : '') + '">' + esc(U.fmtShort(p.grace)) + '</span><span class="pm-muted">（あと' + Math.max(0, left) + '日）</span>';
          }, csv: function (p) { return AU.ymd(p.grace); } },
        { key: 'contactAt', label: '連絡', nowrap: true, value: function (p) { return p.contactAt || ''; },
          html: function (p) { return p.contactAt ? '<time class="pm-muted" datetime="' + esc(p.contactAt) + '">' + esc(U.relTime(p.contactAt)) + '</time>' : '<span class="pm-warn">まだ</span>'; },
          csv: function (p) { return p.contactAt ? AU.ymd(p.contactAt, true) : ''; } },
        { key: 'acts', label: '', sort: false, csv: false, html: function (p) {
          // 有効期限切れのカードは、会員がカードを変えるまで何度請求しても通らない（会員の詳細と同じく、やり直しは出さない）
          if (p.failure && p.failure.code === 'expired_card') return '<span class="pm-acts"><button type="button" class="btn btn-ink btn-s" data-pm-contact="' + esc(p.id) + '"' + dis() + '>連絡する</button></span>';
          return '<span class="pm-acts"><button type="button" class="btn btn-ghost btn-s" data-pm-contact="' + esc(p.id) + '"' + dis() + '>連絡する</button>' +
            '<button type="button" class="btn btn-ink btn-s" data-pm-retry="' + esc(p.id) + '"' + dis() + '>やり直す</button></span>';
        } }
      ],
      select: canMoney(),
      bulk: !canMoney() ? null : [
        { id: 'contact', label: 'まとめて連絡する', icon: 'mail', run: function (list, o) { contactMany(list, o); } },
        { id: 'retry', label: 'まとめてやり直す', icon: 'refresh', run: function (list, o) { retryMany(list, o); } }
      ],
      rowLabel: function (p) { return member(p.no).name + 'の請求'; },
      rowHref: function (p) { return hashWith({ pay: p.id }); },
      rowClass: function () { return 'is-alert'; },
      csv: { name: '支払いエラー' }, empty: '支払いエラーはありません。'
    });
  }

  /* ---------- 解約予定 ---------- */
  function cancelTally(ms) {
    var n = CLG.now(), since = new Date(n.getTime() - 183 * DAY), c = {};
    var list = ms.filter(function (m) { return m.status === 'canceling' || (m.status === 'left' && m.leftAt && new Date(m.leftAt) >= since); });
    list.forEach(function (m) { var k = REASONS.indexOf(m.cancelReason) >= 0 ? m.cancelReason : '未回答'; c[k] = (c[k] || 0) + 1; });
    var rows = REASONS.concat(['未回答']).map(function (k) { return { label: k, n: c[k] || 0 }; }).filter(function (x) { return x.n || x.label !== '未回答'; });
    rows.sort(function (a, b) { return (a.label === '未回答') - (b.label === '未回答') || b.n - a.n; });
    return { rows: rows, total: list.length };
  }
  function cancelsTab(ctx) {
    var ms = AD.data.members(), n = CLG.now();
    var rows = ms.filter(function (m) { return m.status === 'canceling'; }).map(function (m) {
      var months = Math.max(1, Math.round((new Date(m.cancelAt || n) - new Date(m.joinedAt)) / (30.44 * DAY)));
      return Object.assign({}, m, { months: months });
    });
    var t = cancelTally(ms), max = Math.max.apply(null, t.rows.map(function (x) { return x.n; }).concat([1]));
    var in30 = rows.filter(function (m) { return m.cancelAt && new Date(m.cancelAt) - n <= 30 * DAY; }).length;
    var tally = AU.panel({
      title: '解約の理由', id: 'pmReasons', cls: 'pm-reasons',
      actions: '<span>解約予定と、この6か月の退会 ' + t.total + '人</span>',
      body: t.total ? '<ul class="pm-bars" aria-label="解約の理由の人数">' + t.rows.map(function (x) {
        var pct = Math.round(x.n / max * 100);
        return '<li class="pm-bars__row"><span class="pm-bars__label">' + esc(x.label) + '</span>' +
          '<span class="pm-bars__track" aria-hidden="true"><i style="width:' + pct + '%"></i></span>' +
          '<span class="pm-bars__n"><b class="num">' + x.n + '</b>人<span class="pm-muted num">' + Math.round(x.n / t.total * 100) + '%</span></span></li>';
      }).join('') + '</ul>' : AU.empty('解約予定と退会はありません。')
    });
    var kpis = '<div class="ad-kpis pm-kpis">' +
      AU.kpi({ label: '解約予定', value: U.num(rows.length), unit: '人', sub: '30日以内に終わる人 ' + in30 + '人' }) +
      AU.kpi({ label: '次の請求で減る額', value: U.num(rows.length * SITE.price), unit: '円', sub: '月額 ' + U.yen(SITE.price) + '（税込）× ' + rows.length + '人' }) +
    '</div>';
    var table = AU.table({
      id: 'cancels', rows: rows, query: ctx.query, qp: 'c', sort: 'cancelAt', label: '解約予定の会員',
      search: { placeholder: '会員番号・名前', keys: ['no', 'name'] },
      filters: [{ key: 'cancelReason', label: '理由', options: [['', 'すべて']].concat(REASONS.map(function (r) { return [r, r]; })).concat([['-', '未回答']]),
        match: function (m, v) { return v === '-' ? REASONS.indexOf(m.cancelReason) < 0 : m.cancelReason === v; } }],
      columns: [
        AU.col.member('no', '会員', { key: 'name', main: true, value: function (m) { return m.name; }, html: function (m) { return AU.who(m); } }),
        AU.col.date('cancelAt', '終わる日', { dir: 'asc' }),
        { key: 'cancelReason', label: '理由', value: function (m) { return REASONS.indexOf(m.cancelReason) >= 0 ? m.cancelReason : '未回答'; },
          html: function (m) { return REASONS.indexOf(m.cancelReason) >= 0 ? esc(m.cancelReason) : '<span class="pm-muted">未回答</span>'; } },
        AU.col.date('joinedAt', '入会', { hide: 'sm' }),
        { key: 'months', label: '在籍', align: 'r', html: function (m) { return '<span class="num">' + m.months + '</span>か月'; } },
        { key: 'level', label: 'レベル', hide: 'md', html: function (m) { return 'Lv<span class="num">' + m.level + '</span> ' + esc(m.levelName); } },
        AU.col.rel('lastActive', '最後の活動', { hide: 'md' })
      ],
      rowHref: function (m) { return '#/members/' + encodeURIComponent(m.no); },
      csv: { name: '解約予定' }, empty: '解約予定の会員はいません。'
    });
    return kpis + '<div class="pm-cancels">' + table + tally + '</div>';
  }

  /* ---------- 返金 ---------- */
  function refundsTab(ctx) {
    var rows = AD.data.payments({ status: 'refunded' }).map(function (p) {
      return Object.assign({}, p, { refundAt: p.refund ? p.refund.at : p.at, refundAmount: p.refund ? p.refund.amount : p.amount, refundBy: p.refund ? p.refund.by : '' });
    });
    var sum = rows.reduce(function (a, p) { return a + p.refundAmount; }, 0);
    return '<p class="pm-lead">' + esc(rows.length + '件・合わせて ' + U.yen(sum)) + '</p>' + AU.table({
      id: 'refunds', rows: rows, query: ctx.query, qp: 'r', sort: '-refundAt', label: '返金',
      search: { placeholder: '会員番号・名前・理由', keys: ['no', 'who', 'reason'] },
      columns: [
        AU.col.date('refundAt', '返金日'),
        AU.col.member('no', '会員', { key: 'who', main: true, value: function (p) { return member(p.no).name; }, html: function (p) { return AU.who(p.no); } }),
        AU.col.money('refundAmount', '返金額'),
        { key: 'reason', label: '理由', sort: false, value: function (p) { return p.refund ? p.refund.reason : ''; } },
        { key: 'refundBy', label: '返金した人', hide: 'sm', value: function (p) { return p.refundBy ? AD.db.staffName(p.refundBy) : ''; } },
        AU.col.date('at', '元の請求日', { hide: 'md' }),
        { key: 'id', label: '決済のID', csvOnly: true }
      ],
      rowHref: function (p) { return hashWith({ pay: p.id }); },
      csv: { name: '返金' }, empty: 'まだ返金はありません。'
    });
  }

  /* ============================================================
     引き出し（?pay=<決済のID>）
     ============================================================ */
  var dr = null, drFor = null, quiet = false;
  function timeline(p) {
    var out = [{ at: p.at, text: '請求 ' + U.yen(p.amount) + '（' + (p.card || 'カード') + '）' }];
    if (p.failure) out.push({ at: p.at, text: '失敗：' + p.failure.label + '（' + (p.attempts || 1) + '回試した）', alert: true });
    if (p.failure && p.failure.nextRetryAt) out.push({ at: p.failure.nextRetryAt, text: '次の自動のやり直し', future: new Date(p.failure.nextRetryAt) > CLG.now() });
    if (p.status === 'failed') out.push({ at: graceEnd(p).toISOString(), text: '猶予の終わり（講座とイベントが止まる）', future: true });
    if (p.recovered) out.push({ at: p.recoveredAt || p.at, text: 'やり直しで支払われた' });
    if (p.refund) out.push({ at: p.refund.at, text: '返金 ' + U.yen(p.refund.amount) + '：' + p.refund.reason + (p.refund.by ? '（' + AD.db.staffName(p.refund.by) + '）' : '') });
    (p.reissues || []).forEach(function (x) { out.push({ at: x.at, text: '領収書を再発行（宛名：' + x.to + '）' }); });
    return '<ol class="pm-tl">' + out.sort(function (a, b) { return new Date(a.at) - new Date(b.at); }).map(function (x) {
      return '<li class="pm-tl__i' + (x.alert ? ' is-alert' : '') + (x.future ? ' is-future' : '') + '"><time class="num" datetime="' + esc(x.at) + '">' + esc(U.fmtShort(x.at, true)) + '</time><span>' + esc(x.text) + '</span></li>';
    }).join('') + '</ol>';
  }
  function drawerBody(p) {
    var m = member(p.no), live = isLive(p);
    return '<div class="pm-dr">' +
      '<div class="pm-dr__top"><div class="pm-dr__amt"><b class="num">' + esc(U.num(p.amount)) + '</b><small>円（税込）</small></div>' + AU.status('payment', p.status) + '</div>' +
      '<div class="pm-dr__who">' + AU.who(m, { size: 's', sub: m.no + (m.statusLabel && m.status !== 'active' ? '・' + m.statusLabel : '') }) +
        '<a class="btn btn-text btn-s" href="#/members/' + encodeURIComponent(p.no) + '?tab=pay">会員の支払い</a></div>' +
      AU.kv([
        ['請求日', U.fmtDate(p.at, { time: true })],
        ['カード', p.card || ''],
        ['領収書番号', p.receiptNo || '―'],
        ['決済のID', '<span class="mono">' + esc(p.id) + '</span>', true],
        live ? ['記録のもと', '会員ページ（デモ会員）'] : ['Stripe の顧客', p.cust ? '<span class="mono">' + esc(p.cust) + '</span>' : '―', true]
      ]) +
      '<h3 class="pm-dr__h">経過</h3>' + timeline(p) +
      '<p class="pm-dr__links">' +
        '<a class="btn btn-text btn-s" href="' + esc(STRIPE + 'payments/' + encodeURIComponent(p.id)) + '" target="_blank" rel="noopener">' + icon('external', 'ico-s') + 'Stripe で見る</a>' +
        (p.cust ? '<a class="btn btn-text btn-s" href="' + esc(STRIPE + 'customers/' + encodeURIComponent(p.cust)) + '" target="_blank" rel="noopener">' + icon('external', 'ico-s') + 'Stripe の顧客</a>' : '') +
        '<button type="button" class="btn btn-text btn-s" data-pm-portal="' + esc(p.id) + '"' + dis() + '>' + icon('link', 'ico-s') + 'Customer Portal のリンクを送る</button>' +
      '</p>' +
    '</div>';
  }
  function drawerFoot(p) {
    var live = isLive(p), b = '', why = '';
    if (p.status === 'failed' && p.failure && p.failure.code === 'expired_card' && !live) {
      b = '<button type="button" class="btn btn-primary" data-pm-contact="' + esc(p.id) + '"' + dis() + '>' + icon('mail', 'ico-s') + 'カードの更新を頼む</button>';
    } else if (p.status === 'failed') {
      b = '<button type="button" class="btn btn-ghost" data-pm-contact="' + esc(p.id) + '"' + dis() + '>' + icon('mail', 'ico-s') + '連絡する</button>' +
        '<button type="button" class="btn btn-primary" data-pm-retry="' + esc(p.id) + '"' + dis() + '>' + icon('refresh', 'ico-s') + 'もう一度請求する</button>';
    } else if (p.status === 'paid') {
      // デモ会員の請求も返金できる（R.refundInvoice。会員ページの領収書が「返金済み」になる）
      b = '<button type="button" class="btn btn-ghost pm-danger" data-pm-refund="' + esc(p.id) + '"' + dis() + '>返金する</button>' +
        '<button type="button" class="btn btn-ink" data-pm-receipt="' + esc(p.id) + '"' + dis() + '>' + icon('receipt', 'ico-s') + '領収書を再発行</button>';
    }
    if (b && !canMoney()) why = '<span class="pm-dr__why">' + esc(AU.whoCan('money') + 'だけ') + '</span>';
    return '<button type="button" class="btn btn-soft" data-close>閉じる</button><span class="pm-dr__sp"></span>' + why + b;
  }
  function openDrawer(id) {
    var p = find(id);
    if (!p) {
      AD.app.setQuery({ pay: null }, { replace: true });
      U.toast('この請求は見つかりませんでした', 'error');
      return;
    }
    drFor = id;
    dr = AU.drawer(drawerBody(p), { title: '請求の詳細', foot: drawerFoot(p), cls: 'a-payments pm-drawer',
      onClose: function () {
        dr = null; drFor = null;
        if (quiet) return;
        var r = AD.app.parse();
        if (r.name === 'payments' && r.query.pay) AD.app.setQuery({ pay: null }, { replace: true });
      } });
    dr.addEventListener('click', onAction);
  }
  /* 操作のあと：引き出しを閉じて、画面を描き直し、同じ請求の引き出しを開き直す（新しい状態で） */
  function after() {
    if (dr) { quiet = true; dr.close(); quiet = false; }
    if (cur) cur.refresh();
  }
  function syncDrawer(ctx) {
    var id = ctx.query.pay || '';
    if (!id) { if (dr) { quiet = true; dr.close(); quiet = false; } return; }
    if (dr && drFor === id && dr.parentNode) return;
    if (dr) { quiet = true; dr.close(); quiet = false; }
    // 描き終わってから開く（開いた窓が描き直しに巻き込まれないように）
    setTimeout(function () { if (AD.app.parse().query.pay === id && !dr) openDrawer(id); }, 0);
  }

  /* ============================================================
     操作
     ============================================================ */
  function templateVars(p) {
    var m = member(p.no);
    return { name: m.name, no: m.no, date: U.fmtDate(p.at, { noYear: true }), amount: U.yen(p.amount),
      until: U.fmtDate(graceEnd(p), { noYear: true }), url: SITE.siteUrl + 'member.html#/account?focus=card', site: SITE.name };
  }
  function contactHtml(p) {
    var T = DATA.MAIL_TEMPLATES.payment_failed, v = templateVars(p);
    return '<div class="pm-mail">' +
      '<p class="pm-mail__h">メール</p><p class="pm-mail__subj">' + esc(fill(T.email.subject, v)) + '</p>' +
      '<div class="pm-mail__body">' + U.nl2br(fill(T.email.body, v)) + '</div>' +
      '<p class="pm-mail__h">LINE</p><div class="pm-mail__line">' + esc(fill(T.line.text, v)) + '</div></div>';
  }
  function recordContact(p, how) {
    var T = DATA.MAIL_TEMPLATES.payment_failed, v = templateVars(p);
    if (isLive(p)) {
      // デモ会員には「相談・メッセージ」にも届ける（開いている会員ページのタブに出る）
      R.staffReply(fill(T.line.text, v) + '\n会員ページの「アカウント」→「お支払い」からカードを更新できます。');
    }
    AD.db.update(function (s) {
      (s.moneyContacts = s.moneyContacts || []).push({ id: AD.db.uid('mc'), kind: 'payment_failed', no: p.no, ref: p.id, at: CLG.now().toISOString(), by: (AD.db.staff() || {}).id, how: how });
    });
  }
  function contactOne(p) {
    var m = member(p.no);
    return AU.act({
      title: m.name + 'さんに連絡する', ok: '送る', kind: 'ink', wide: true, cls: 'a-payments',
      html: contactHtml(p),
      fields: '<fieldset class="pm-how"><legend class="field__label">送る先</legend>' +
        '<label class="check"><input type="checkbox" name="email" checked><span>メール（' + esc(m.email || '登録のアドレス') + '）</span></label>' +
        '<label class="check"><input type="checkbox" name="line" checked><span>LINE（連携していれば）</span></label>' +
        (isLive(p) ? '<label class="check"><input type="checkbox" name="thread" checked disabled><span>会員ページのメッセージ</span></label>' : '') + '</fieldset>',
      reason: 'optional', reasonLabel: 'メモ', defaultReason: 'カードの更新のお願い',
      run: function (reason, f) {
        if (!f.email && !f.line && !isLive(p)) return { ok: false, error: '送る先を1つ以上選んでください' };
        recordContact(p, [f.email ? 'メール' : '', f.line ? 'LINE' : '', isLive(p) ? 'メッセージ' : ''].filter(Boolean).join('・'));
        return { ok: true };
      },
      audit: { action: 'payment_contact', label: '支払いエラーの連絡をした', target: { type: 'member', id: p.no, name: m.name }, detail: U.fmtShort(p.at) + 'の請求・' + U.yen(p.amount) },
      done: m.name + 'さんに連絡しました'
    });
  }
  function contactMany(list, o) {
    if (!list.length) return;
    AU.act({
      title: list.length + '人に連絡する', ok: '送る', kind: 'ink', cls: 'a-payments',
      text: '「' + DATA.MAIL_TEMPLATES.payment_failed.name + '」の文面を、メールとLINEで送ります。',
      html: '<ul class="pm-names">' + list.map(function (p) { return '<li>' + esc(member(p.no).name) + '<span class="num pm-muted">' + esc(U.yen(p.amount)) + '</span></li>'; }).join('') + '</ul>',
      reason: 'optional', reasonLabel: 'メモ', defaultReason: 'カードの更新のお願い',
      run: function () { list.forEach(function (p) { recordContact(p, 'メール・LINE'); }); return { ok: true }; },
      audit: { action: 'payment_contact', label: '支払いエラーの連絡をした', target: { type: 'payments', id: 'bulk', name: list.length + '人' }, detail: list.map(function (p) { return member(p.no).name; }).join('、') },
      done: list.length + '人に連絡しました'
    }).then(function (r) { if (r && o) o.clear(); if (r && cur) cur.refresh(); });
  }
  /* やり直し：デモ会員は R.updateCard（会員ページの帯が消える）。ほかの会員は、失敗の理由で結果を決める
     （有効期限切れ・承認されなかったカードは、会員がカードを変えるまで通らない） */
  function retry(p) {
    var now = CLG.now().toISOString();
    if (isLive(p)) {
      var me = CLG.store.state.me;
      R.updateCard(me.card);
      return { ok: true, paid: true };
    }
    var code = p.failure ? p.failure.code : '';
    var paid = code === 'insufficient_funds';
    AD.db.update(function (s) {
      var x = s.payments.filter(function (y) { return y.id === p.id; })[0]; if (!x) return;
      x.attempts = (x.attempts || 1) + 1;
      if (paid) {
        x.status = 'paid'; x.recovered = true; x.recoveredAt = now;
        x.failure = Object.assign({}, x.failure, { resolvedAt: now, nextRetryAt: null });
        x.receiptNo = 'R' + AD.data.monthKey(x.at).replace('-', '') + '-' + String(s.payments.length).slice(-5);
        var ex = s.members[x.no]; if (ex) ex.status = 'active';
      } else {
        x.failure = Object.assign({}, x.failure, { nextRetryAt: new Date(CLG.now().getTime() + 3 * DAY).toISOString() });
      }
    });
    return { ok: true, paid: paid };
  }
  function retryOne(p) {
    var m = member(p.no), res = null;
    return AU.act({
      title: 'もう一度請求する', ok: '請求する', kind: 'ink', cls: 'a-payments',
      text: m.name + 'さんの' + U.fmtShort(p.at) + 'の請求 ' + U.yen(p.amount) + 'を、登録のカード（' + (isLive(p) ? CLG.store.state.me.card : p.card) + '）でもう一度請求します。',
      // カードに請求をかける操作なので、理由は必ず書いてもらう（操作の記録に残す）
      defaultReason: isLive(p) ? RETRY_REASONS[0] : '', reasons: RETRY_REASONS,
      run: function () { res = retry(p); return res; },
      audit: function (reason, f, r) {
        return { action: 'payment_retry', label: '支払いをやり直した', target: { type: 'payment', id: p.id, name: m.name + '（' + p.no + '）' },
          detail: U.yen(p.amount) + '・' + (r && r.paid ? '支払われた' : '失敗（' + (p.failure ? p.failure.label : '') + '）') };
      }
    }).then(function (r) {
      if (!r) return;
      if (r.paid) U.toast(m.name + 'さんの支払いが済みました', 'ok');
      else U.toast('通りませんでした（' + (p.failure ? p.failure.label : '') + '）。3日後に自動でやり直します', 'error', { action: '連絡する', onAction: function () { contactOne(p).then(function (x) { if (x) after(); }); } });
      after();
    });
  }
  function retryMany(list, o) {
    if (!list.length) return;
    var paid = 0;
    AU.act({
      title: list.length + '件をやり直す', ok: '請求する', kind: 'ink', cls: 'a-payments',
      text: '選んだ請求を、登録のカードでもう一度請求します。',
      html: '<ul class="pm-names">' + list.map(function (p) { return '<li>' + esc(member(p.no).name) + '<span class="num pm-muted">' + esc(U.yen(p.amount)) + '</span></li>'; }).join('') + '</ul>',
      reasons: RETRY_REASONS,
      run: function () { list.forEach(function (p) { if (retry(p).paid) paid++; }); return { ok: true }; },
      audit: function () { return { action: 'payment_retry', label: '支払いをやり直した', target: { type: 'payments', id: 'bulk', name: list.length + '件' }, detail: '支払われた ' + paid + '件・失敗 ' + (list.length - paid) + '件' }; }
    }).then(function (r) {
      if (!r) return;
      if (o) o.clear();
      U.toast(list.length + '件のうち' + paid + '件が支払われました', paid ? 'ok' : 'error');
      if (cur) cur.refresh();
    });
  }
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
  function refundOne(p) {
    var m = member(p.no), live = isLive(p);
    return AU.act({
      title: '返金する', ok: '返金する', danger: true, cls: 'a-payments',
      text: m.name + 'さんの' + U.fmtShort(p.at) + 'の請求（' + U.yen(p.amount) + '）を、' + (p.card || '登録のカード') + 'に返金します。取り消せません。' +
        (live ? '\n会員ページの領収書も「返金済み」になり、本人にお知らせが届きます。' : '') + referredNote(p),
      fields: '<label class="field pm-amt"><span>返金額（円）</span><input class="input num" type="number" name="amount" inputmode="numeric" min="1" max="' + p.amount + '" step="1" value="' + p.amount + '" required>' +
        '<small>' + esc(U.yen(p.amount)) + 'まで。一部だけ返すときは金額を変えます。</small></label>',
      reasons: REFUND_REASONS,
      // 返金の本体は AD.ops.refund（会員の詳細の返金と同じ。まだ払っていない紹介報酬の取消と、操作の記録の形もそろう）
      run: function (reason, f) { return refundWithReward(p, f.amount, reason); },
      audit: function (reason, f, r) { return r.audit; }
    }).then(function (r) {
      if (!r) return;
      // 一部だけ返したときも、返した額を出す
      U.toast(U.yen(r.amount) + 'を返金しました' + voidedText(r) + (r.live ? '。会員ページの領収書も変わりました' : ''), 'ok');
      after();
    });
  }
  /* 領収書の再発行：宛名と但し書きを変えられる（屋号にしたい、など）。印刷できる HTML を保存する */
  function receiptHtml(p, to, note, reissue) {
    var tax = Math.round(p.amount - p.amount / 1.1), d = new Date(p.at);
    return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>領収書 ' + esc(p.receiptNo) + '</title>' +
      '<style>body{font-family:-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;color:#1d1b18;max-width:640px;margin:40px auto;padding:0 24px;line-height:1.7}' +
      'h1{font-size:26px;text-align:center;letter-spacing:.3em;margin:0 0 28px}.to{font-size:18px;border-bottom:1px solid #1d1b18;padding-bottom:4px;margin-bottom:20px}' +
      '.amt{font-size:28px;font-weight:800;text-align:center;border:1px solid #d6d1c7;padding:14px;margin:0 0 8px}table{width:100%;border-collapse:collapse;font-size:14px;margin:18px 0}' +
      'th,td{border-bottom:1px solid #e7e3dc;padding:8px 4px;text-align:left}td.r{text-align:right}.meta{font-size:13px;color:#55514a}.re{float:right;font-size:12px;border:1px solid #1d1b18;padding:0 6px}</style></head><body>' +
      (reissue ? '<span class="re">再発行</span>' : '') + '<h1>領収書</h1>' +
      '<p class="meta">No. ' + esc(p.receiptNo) + '<br>発行日 ' + esc(U.fmtDate(CLG.now(), { wd: false })) + '</p>' +
      '<p class="to">' + esc(to) + ' 様</p>' +
      '<p class="amt">' + esc(U.yen(p.amount, { mark: true })) + '-（税込）</p>' +
      '<p>但し ' + esc(note) + '<br>上記正に領収いたしました。</p>' +
      '<table><tr><th>内容</th><td>' + esc(SITE.name + ' 月額会費') + '</td></tr><tr><th>お支払い日</th><td>' + esc(U.fmtDate(d, { wd: false })) + '</td></tr>' +
      '<tr><th>お支払い方法</th><td>' + esc(p.card || 'クレジットカード') + '</td></tr><tr><th>10%対象</th><td class="r">' + esc(U.yen(p.amount, { mark: true })) + '（うち消費税 ' + esc(U.yen(tax, { mark: true })) + '）</td></tr></table>' +
      '<p class="meta">' + esc(SITE.company) + '<br>登録番号 T0000000000000（調整中）</p></body></html>';
  }
  function receiptOne(p) {
    var m = member(p.no), month = new Date(p.at).getMonth() + 1;
    var note = SITE.name + ' 月額会費（' + month + '月分）として';
    return AU.act({
      title: '領収書を再発行する', ok: '再発行する', kind: 'ink', cls: 'a-payments',
      fields: '<label class="field"><span>宛名</span><input class="input" name="to" id="pmRcTo" maxlength="60" value="' + esc(m.realName || m.name) + '" required></label>' +
        '<label class="field"><span>但し書き</span><input class="input" name="note" id="pmRcNote" maxlength="60" value="' + esc(note) + '" required></label>' +
        '<div class="pm-rc" aria-hidden="true"><p class="pm-rc__to"><span data-pm-rc-to>' + esc(m.realName || m.name) + '</span> 様</p>' +
          '<p class="pm-rc__amt num">' + esc(U.yen(p.amount, { mark: true })) + '-</p><p class="pm-rc__note">但し <span data-pm-rc-note>' + esc(note) + '</span></p>' +
          '<p class="pm-rc__no num">No. ' + esc(p.receiptNo || '') + '</p></div>',
      reasons: ['宛名を屋号にしたい', 'なくしたので送ってほしい', '但し書きを変えたい'], reason: 'optional', reasonLabel: '再発行の理由',
      run: function (reason, f) {
        var to = String(f.to || '').trim(), nt = String(f.note || '').trim();
        if (!to || !nt) return { ok: false, errors: { to: to ? '' : '宛名を入れてください', note: nt ? '' : '但し書きを入れてください' } };
        U.download('領収書_' + (p.receiptNo || p.id) + '.html', receiptHtml(p, to, nt, true), 'text/html', { bom: false });
        if (!isLive(p)) AD.db.update(function (s) {
          var x = s.payments.filter(function (y) { return y.id === p.id; })[0];
          if (x) (x.reissues = x.reissues || []).push({ at: CLG.now().toISOString(), to: to, by: (AD.db.staff() || {}).id });
        });
        return { ok: true, to: to };
      },
      audit: function (reason, f, r) { return { action: 'receipt_reissue', label: '領収書を再発行した', target: { type: 'payment', id: p.id, name: m.name + '（' + p.no + '）' }, detail: '宛名：' + r.to + '・' + (p.receiptNo || '') }; },
      done: '領収書を保存しました（本番では会員にメールでも送ります）'
    }).then(function (r) { if (r) after(); });
  }

  function onAction(e) {
    var b = e.target.closest('[data-pm-contact],[data-pm-retry],[data-pm-refund],[data-pm-receipt],[data-pm-portal]');
    if (!b || b.disabled) return;
    var id = b.getAttribute('data-pm-contact') || b.getAttribute('data-pm-retry') || b.getAttribute('data-pm-refund') || b.getAttribute('data-pm-receipt') || b.getAttribute('data-pm-portal');
    var p = find(id); if (!p) { U.toast('この請求は見つかりませんでした', 'error'); return; }
    if (!AU.need('money')) return;
    if (b.hasAttribute('data-pm-contact')) contactOne(p).then(function (r) { if (r) after(); });
    else if (b.hasAttribute('data-pm-retry')) retryOne(p);
    else if (b.hasAttribute('data-pm-refund')) refundOne(p);
    else if (b.hasAttribute('data-pm-receipt')) receiptOne(p);
    else U.toast('本番では Stripe の Customer Portal のリンクを作って、' + member(p.no).name + 'さんに送ります');
  }

  AD.screens.payments = {
    title: '支払い',
    render: function (ctx) {
      cur = ctx;
      var tab = ctx.query.tab || (ctx.query.status === 'failed' && !ctx.query.month ? 'failed' : 'charges');
      if (['charges', 'failed', 'cancels', 'refunds'].indexOf(tab) < 0) tab = 'charges';
      var failedN = AD.data.payments({ status: 'failed' }).length;
      var cancelN = AD.data.members().filter(function (m) { return m.status === 'canceling'; }).length;
      var refundN = AD.data.payments({ status: 'refunded' }).length;
      var tabs = AU.tabs([
        { id: 'charges', label: '請求', href: '#/payments' },
        { id: 'failed', label: '支払いエラー', href: '#/payments?tab=failed', n: failedN, alert: failedN > 0 },
        { id: 'cancels', label: '解約予定', href: '#/payments?tab=cancels', n: cancelN },
        { id: 'refunds', label: '返金', href: '#/payments?tab=refunds', n: refundN }
      ], tab, '支払いの表示');
      var body = tab === 'failed' ? failedTab(ctx) : tab === 'cancels' ? cancelsTab(ctx) : tab === 'refunds' ? refundsTab(ctx) : chargesTab(ctx);
      return '<div class="a-payments">' +
        AU.head({ title: '支払い', sub: '金額はすべて税込・月額 ' + U.yen(SITE.price) + '・' + SITE.billing,
          actions: '<a class="btn btn-ghost btn-s" href="' + esc(STRIPE) + '" target="_blank" rel="noopener">' + icon('external', 'ico-s') + 'Stripe を開く</a>' }) +
        tabs + roleNote() + body + '</div>';
    },
    mount: function (root, ctx) {
      cur = ctx;
      syncDrawer(ctx);
      if (root.__boundPayments) return;
      root.__boundPayments = true;
      root.addEventListener('click', function (e) { if (e.target.closest('.a-payments')) onAction(e); });
      root.addEventListener('change', function (e) {
        var s = e.target.closest('.a-payments [data-pm-month]'); if (!s) return;
        AD.app.setQuery({ month: s.value === '0' ? null : s.value, page: null, status: null }, { focus: '#pmMonth' });
      });
    }
  };

  /* 領収書の見本は、書いたそばから変える（窓は body の直下にあるので document で拾う） */
  document.addEventListener('input', function (e) {
    var t = e.target; if (!t || !t.id || (t.id !== 'pmRcTo' && t.id !== 'pmRcNote')) return;
    var box = t.closest('.modal'); if (!box) return;
    var el = box.querySelector(t.id === 'pmRcTo' ? '[data-pm-rc-to]' : '[data-pm-rc-note]');
    if (el) el.textContent = t.value;
  });
})();
