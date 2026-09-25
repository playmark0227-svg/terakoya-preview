/* ============================================================
   運営画面：貢献ポイント（#/points）
   ?tab=grant（付ける・記録。既定）| close（月末のランキングと賞の連絡）
   ?no=<会員番号>（その会員を選んだ状態で開く。会員の詳細からのリンクにも使える）
   - 付ける：AD.ops.grantPoints(会員番号, ルール, 理由, リンク)（中で R.grantPoints）。デモ会員なら会員ページのランキングの記録に
     理由つきで出て、お知らせが届く。ほかの会員は会員ページのランキングの数に足される（store の pointGrants）。運営画面の記録は AD.db.pointGrants
     （rid＝会員ページの記録の id。会員の詳細の「貢献ポイント」と同じ記録）。
   - 取り消す：AD.ops.revokePoints(記録のid)（中で R.revokePoints）。デモのデータの記録（store にないもの）は運営画面の記録だけを取り消す。
   - 有効期限は付けてから1年（DATA.POINT_RULES の説明と同じ）。紹介ではポイントは付かない。
   - 月末の締め：暦の月で締めて、上位10人の賞（RANK_PRIZES）の連絡を記録する（rankCloses。AD.db.ensure）。
   - 付ける・取り消す・締めるは代表・運営・講師だけ（経理は見るだけ。設定の「役割でできること」と同じ）。
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, AD = CLG.admin, AU = AD.ui, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon;
  var cur = null;
  var DAY = 86400000, YEAR = 365 * DAY;
  var CONTACT = ['未連絡', '連絡済み', '済み', '辞退'];
  var CONTACT_TAG = { 未連絡: 'new', 連絡済み: 'meeting', 済み: 'done', 辞退: 'canceled' };
  // ポイントを付ける・取り消す・ランキングを締める役割（設定の「役割でできること」の points。経理は見るだけ）
  function canPoint() { return AU.can('points'); }
  function dis() { return canPoint() ? '' : ' disabled'; }
  function roleNote() { return AU.roleNote('points', '貢献ポイントの付与と取り消し'); }

  function rule(id) { return DATA.POINT_RULES.filter(function (x) { return x.id === id; })[0] || null; }
  function ruleName(id) { var r = rule(id); return r ? r.name : id; }
  function member(no) { return AD.data.member(no) || { no: no, name: no || '―' }; }
  function hashWith(patch) { return AD.app.hashOf('points', Object.assign({}, (cur && cur.query) || {}, patch)); }
  function staffId() { return (AD.db.staff() || {}).id || AD.db.DEMO_STAFF; }
  function nowIso() { return CLG.now().toISOString(); }
  function expiry(at) { return new Date(new Date(at).getTime() + YEAR); }
  /* 期限は来年の日付なので、年まで書く（「9/24」だけだと、もう過ぎたように読めるため） */
  function ymdS(d) { d = new Date(d); return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate(); }
  function monthName(off) { var n = CLG.now(); return (new Date(n.getFullYear(), n.getMonth() + off, 1).getMonth() + 1) + '月'; }

  /* ---------- 会員ごとの数 ---------- */
  function rankRowOf(no, off) {
    var live = AD.data.live();
    return R.ranking('points', { month: off || 0 }).filter(function (r) { return no === live.no ? r.me : r.no === no; })[0] || null;
  }
  function summary(no) {
    var live = AD.data.live(), rk = rankRowOf(no, 0), n = CLG.now();
    var grants = AD.db.state.pointGrants.filter(function (g) { return g.no === no; });
    if (no === live.no) {
      var p = R.points(), soon = p.log.filter(function (l) { var e = expiry(l.at); return e > n && e - n <= 30 * DAY; });
      return { live: true, month: p.month, total: p.total, rank: rk ? rk.rank : null, soon: soon.reduce(function (a, l) { return a + l.pt; }, 0),
        log: p.log.slice(0, 10).map(function (l) { return { at: l.at, pt: l.pt, rule: l.rule, why: l.why, id: l.id }; }), grants: grants };
    }
    return { live: false, month: rk ? rk.value : 0, total: null, rank: rk && rk.value > 0 ? rk.rank : null, soon: 0,
      log: grants.filter(function (g) { return !g.revoked; }).slice(0, 10), grants: grants };
  }

  /* ---------- 付ける ---------- */
  function suggest(q) {
    q = String(q || '').trim(); if (!q) return [];
    var nq = AD.data.kana(q.toLowerCase()).replace(/\s+/g, ''), digits = q.replace(/\D/g, '');
    return AD.data.members().filter(function (m) {
      if (m.status === 'left') return false;
      var s = AD.data.kana((m.name + m.no + (m.kana || '') + (m.realName || '')).toLowerCase()).replace(/\s+/g, '');
      return s.indexOf(nq) >= 0 || (digits.length >= 2 && m.no.replace(/\D/g, '').replace(/^0+/, '').indexOf(digits.replace(/^0+/, '')) === 0);
    }).slice(0, 8);
  }
  function grantPanel(ctx) {
    var no = ctx.query.no || '', m = no ? AD.data.member(no) : null;
    var sel = '';
    if (m) {
      var s = summary(no);
      sel = '<div class="pt-sel">' +
        '<div class="pt-sel__who">' + AU.who(m, { size: 's', sub: m.no + '・Lv' + m.level + ' ' + m.levelName }) +
          '<a class="btn btn-text btn-s" href="' + esc(hashWith({ no: null })) + '" data-pt-clear>選び直す</a></div>' +
        '<dl class="pt-sel__nums">' +
          '<div><dt>' + esc(monthName(0)) + '</dt><dd><b class="num">' + U.num(s.month) + '</b>pt' + (s.rank ? '<span class="pm-muted">' + s.rank + '位</span>' : '') + '</dd></div>' +
          (s.total != null ? '<div><dt>1年の合計</dt><dd><b class="num">' + U.num(s.total) + '</b>pt</dd></div>' : '') +
          (s.live ? '<div><dt>30日以内に期限</dt><dd><b class="num">' + U.num(s.soon) + '</b>pt</dd></div>' : '<div><dt>運営が付けた</dt><dd><b class="num">' + s.grants.filter(function (g) { return !g.revoked; }).length + '</b>回</dd></div>') +
        '</dl>' +
        (m.status === 'left' ? '<p class="pm-warn">退会した会員です。ポイントは付けられません。</p>' : '') +
      '</div>';
    }
    var find = '<div class="field pt-find"><label class="field__label" for="ptFind">会員</label>' +
      '<div class="pt-find__box">' + icon('search', 'ico-s') + '<input class="input" type="search" id="ptFind" autocomplete="off" placeholder="名前・会員番号で探す" aria-describedby="ptFindHint"' + dis() + '>' + '</div>' +
      '<small id="ptFindHint">2文字以上で候補が出ます</small>' +
      '<p class="sr-only" id="ptSugN" aria-live="polite"></p>' +
      '<ul class="pt-sug" id="ptSug" aria-label="候補" hidden></ul></div>';
    var rules = '<fieldset class="pt-rules"><legend class="field__label">ルール</legend>' + DATA.POINT_RULES.map(function (r) {
      return '<label class="pt-rule"><input type="radio" name="rule" value="' + esc(r.id) + '"' + dis() + '>' +
        '<span class="pt-rule__name">' + esc(r.name) + '</span><b class="num pt-rule__pt">+' + r.pt + 'pt</b></label>';
    }).join('') + '</fieldset>';
    var form = '<form class="pt-form" id="ptForm" novalidate' + (m ? '' : ' data-pt-nomember') + '>' +
      (m ? sel : find) + rules +
      '<label class="field"><span>理由</span><textarea class="textarea" name="why" id="ptWhy" rows="2" maxlength="80" required placeholder="例：那覇オフ会の受付を手伝った"' + dis() + '></textarea><small>会員ページのランキングの記録に、この文のまま出ます（80文字まで）</small></label>' +
      '<label class="field"><span>会員ページのリンク<span class="opt">任意</span></span><input class="input" name="link" id="ptLink" maxlength="120" placeholder="例：#/events/e4"' + dis() + '></label>' +
      '<p class="form-err" role="alert" id="ptErr"></p>' +
      '<div class="pt-form__foot"><span class="pm-muted">' + (!canPoint() ? esc('付けられるのは' + AU.whoCan('points') + 'です') : m ? '有効期限 ' + esc(U.fmtDate(expiry(CLG.now()), { wd: false })) + 'まで' : '会員を選ぶと付けられます') + '</span>' +
        '<button type="submit" class="btn btn-primary"' + (m && m.status !== 'left' && canPoint() ? '' : ' disabled') + '>ポイントを付ける</button></div>' +
    '</form>';
    return AU.panel({ title: 'ポイントを付ける', id: 'ptGrantH', cls: 'pt-grant', body: form });
  }
  function logPanel(ctx) {
    var no = ctx.query.no; if (!no || !AD.data.member(no)) return '';
    var s = summary(no), m = member(no);
    var list = s.log;
    var body = list.length ? '<ol class="pt-log">' + list.map(function (l) {
      var exp = expiry(l.at), soon = exp - CLG.now() <= 30 * DAY;
      return '<li class="pt-log__i"><b class="num pt-log__pt">+' + l.pt + '</b><span class="pt-log__why">' + esc(l.why) + '</span>' +
        '<span class="pt-log__at num">' + esc(U.fmtShort(l.at)) + '・期限 <span class="' + (soon ? 'pm-warn' : '') + '">' + esc(ymdS(exp)) + '</span></span></li>';
    }).join('') + '</ol>' : AU.empty(s.live ? 'まだポイントはありません。' : '運営が付けたポイントはまだありません。');
    return AU.panel({ title: m.name + 'さんの記録', id: 'ptLogH', cls: 'pt-logp', flush: true, body: body,
      actions: s.live ? '<a class="ad-panel__link" href="' + esc(AD.data.memberHref('#/ranking')) + '" target="_blank" rel="noopener">会員ページで見る</a>' : '<span>コメントの「ありがとう」などは会員ページで数えます</span>' });
  }
  function historyTable(ctx) {
    var rows = AD.db.state.pointGrants.slice();
    return AU.table({
      id: 'grants', rows: rows, query: ctx.query, qp: 'g', sort: '-at', label: '運営が付けたポイント',
      search: { placeholder: '会員・理由', keys: ['who', 'why', 'no'] },
      filters: [{ key: 'rule', label: 'ルール', options: [['', 'すべて']].concat(DATA.POINT_RULES.map(function (r) { return [r.id, r.name]; })) },
        { key: 'state', label: '状態', options: [['', 'すべて'], ['ok', '有効'], ['revoked', '取り消し']], match: function (g, v) { return v === 'revoked' ? !!g.revoked : !g.revoked; } }],
      columns: [
        AU.col.when('at', '付けた日時'),
        AU.col.member('no', '会員', { key: 'who', main: true, value: function (g) { return member(g.no).name; }, html: function (g) { return AU.who(g.no); } }),
        { key: 'pt', label: 'pt', align: 'r', html: function (g) { return g.revoked ? '<s class="num pm-muted">+' + g.pt + '</s>' : '<b class="num">+' + g.pt + '</b>'; } },
        { key: 'why', label: '理由', html: function (g) {
          return esc(g.why) + '<span class="pt-rule-sub">' + esc(ruleName(g.rule)) + '</span>' + (g.revoked ? '<span class="pt-revoked">取り消し：' + esc(g.revokeWhy || '') + '</span>' : '');
        } },
        { key: 'rule', label: 'ルール', csvOnly: true, value: function (g) { return ruleName(g.rule); } },
        { key: 'by', label: '付けた人', hide: 'md', value: function (g) { return AD.db.staffName(g.by); } },
        { key: 'exp', label: '有効期限', hide: 'md', nowrap: true, value: function (g) { return expiry(g.at).toISOString(); },
          html: function (g) { return g.revoked ? '<span class="pm-muted">―</span>' : '<span class="num">' + esc(ymdS(expiry(g.at))) + '</span>'; }, csv: function (g) { return g.revoked ? '' : AU.ymd(expiry(g.at)); } },
        { key: 'acts', label: '', sort: false, csv: false, html: function (g) {
          return g.revoked ? '' : '<button type="button" class="btn btn-ghost btn-s" data-pt-revoke="' + esc(g.id) + '"' + dis() + '>取り消す</button>';
        } }
      ],
      rowHref: function (g) { return hashWith({ no: g.no }); },
      rowClass: function (g) { return g.revoked ? 'is-quiet' : ''; },
      csv: { name: '貢献ポイント_運営が付けたもの' }, empty: 'まだ運営が付けたポイントはありません。'
    });
  }
  function topPanel() {
    var list = snapshot(0).slice(0, 5);
    return AU.panel({ title: monthName(0) + 'の上位（途中）', id: 'ptTopH', cls: 'pt-top5', flush: true,
      actions: '<a class="ad-panel__link" href="#/points?tab=close">月末のランキング</a>',
      body: list.length ? '<ol class="pt-top5__list">' + list.map(function (r) {
        return '<li><a class="pt-top5__a" href="' + esc(hashWith({ no: r.no })) + '"><span class="num pt-top5__rk">' + r.rank + '</span>' +
          AU.who(r.no, { link: false }) + '<span class="pt-top5__v"><b class="num">' + U.num(r.value) + '</b>pt</span></a></li>';
      }).join('') + '</ol>' : AU.empty('まだポイントのある会員はいません。') });
  }
  function grantTab(ctx) {
    var sel = ctx.query.no && AD.data.member(ctx.query.no);
    return '<div class="pt-top">' + grantPanel(ctx) + (sel ? logPanel(ctx) : topPanel()) + '</div>' +
      '<h2 class="pt-h2">運営が付けたポイント</h2>' + historyTable(ctx);
  }

  function doGrant(form) {
    var no = cur.query.no, m = AD.data.member(no), err = form.querySelector('#ptErr');
    err.innerHTML = '';
    var rid = (form.querySelector('input[name=rule]:checked') || {}).value, why = String(form.why.value || '').trim(), link = String(form.link.value || '').trim();
    if (!m) { err.innerHTML = icon('info', 'ico-s') + '<span>会員を選んでください</span>'; return; }
    // ルールを選んだときの書き出し「〜（）」のままでは、会員に何のポイントか伝わらない
    var errs = { why: why ? (why.length > 80 ? '80文字までにしてください' : /（\s*）/.test(why) ? '（ ）の中に、何をしたかを書いてください' : '') : '理由を入れてください', link:link && !/^#\//.test(link) ? '#/ で始まる、会員ページの中の場所にしてください' : '' };
    if (U.fieldErrors(form, errs)) return;
    var r = rule(rid);
    if (!r) { err.innerHTML = icon('info', 'ico-s') + '<span>ルールを選んでください</span>'; var r0 = form.querySelector('input[name=rule]'); if (r0) r0.focus(); return; }
    U.confirmBox(m.name + 'さんに +' + r.pt + 'pt を付けます', why + (link ? '\n' + link : ''), '付ける', false).then(function (ok) {
      if (!ok) return;
      // 会員ページの記録（R.grantPoints）と運営画面の記録の両方へ（会員の詳細と同じ AD.ops）
      var res = AD.ops.grantPoints(no, r.id, why, link);
      if (!res || !res.ok) { err.innerHTML = icon('info', 'ico-s') + '<span>' + esc((res && res.error) || '付けられませんでした') + '</span>'; return; }
      AD.db.audit(res.audit);
      U.toast(m.name + 'さんに +' + r.pt + 'pt を付けました' + (m.live ? '。会員ページの記録とランキングにも入りました' : ''), 'ok');
      form.why.value = ''; form.link.value = '';
      cur.refresh({ focus: '#ptWhy' });
    });
  }
  function revoke(id) {
    var g = AD.db.state.pointGrants.filter(function (x) { return x.id === id; })[0]; if (!g) return;
    var m = member(g.no);
    AU.act({
      title: 'ポイントを取り消す', ok: '取り消す', danger: true, cls: 'a-points',
      text: m.name + 'さんの +' + g.pt + 'pt（' + g.why + '）を取り消します。会員ページのランキングからも引きます。',
      reasons: ['同じことに2回付けていた', '付ける人を間違えた', 'ルールに当たらなかった'],
      run: function (reason) { return AD.ops.revokePoints(g.id, reason); },
      audit: function (reason, f, res) { return res.audit; },
      done: '取り消しました'
    }).then(function (r) { if (r && cur) cur.refresh(); });
  }

  /* ---------- 月末の締め ---------- */
  function snapshot(off) {
    var live = AD.data.live();
    return R.ranking('points', { month: off }).filter(function (r) { return r.value > 0; }).slice(0, 10).map(function (r) {
      return { rank: r.rank, no: r.me ? live.no : r.no, name: r.me ? live.name : r.name, value: r.value, prize: r.prize || '', auto: r.rank > 3 };
    });
  }
  function rankCloses() {
    return AD.db.ensure('rankCloses', function () {
      // 先月の分は、今月1日の朝に締めてある（上位3人には連絡済み。1位は相談まで済んだ）
      var n = CLG.now(), at = new Date(n.getFullYear(), n.getMonth(), 1, 10, 5), k = AD.data.monthKey(new Date(n.getFullYear(), n.getMonth() - 1, 1));
      var rows = snapshot(-1).map(function (r) {
        var c = r.auto ? null : r.rank === 1 ? { status: '済み', at: new Date(at.getTime() + 11 * DAY).toISOString(), by: 'staff1', how: 'Zoom', note: '代表との個別相談（60分）を実施' }
          : { status: '連絡済み', at: new Date(at.getTime() + 2 * 3600000).toISOString(), by: 'staff2', how: 'メッセージ', note: '日程の候補を3つ送った' };
        return Object.assign(r, { contact: c });
      });
      return [{ id: 'rk-' + k, month: k, at: at.toISOString(), by: 'staff2', rows: rows }];
    });
  }
  function closeTab(ctx) {
    var n = CLG.now(), curKey = AD.data.monthKey(n), recs = rankCloses().slice().sort(function (a, b) { return a.month < b.month ? 1 : -1; });
    var nowRows = snapshot(0), end = new Date(n.getFullYear(), n.getMonth() + 1, 0);
    var lastKey = AD.data.monthKey(new Date(n.getFullYear(), n.getMonth() - 1, 1));
    var needLast = !recs.some(function (r) { return r.month === lastKey; });
    var prizes = '<ul class="pt-prizes">' + (DATA.RANK_PRIZES || []).map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>';
    var nowPanel = AU.panel({
      title: monthName(0) + 'のランキング（途中）', id: 'ptNowH', cls: 'pt-now', flush: true,
      actions: '<span>' + esc(U.fmtShort(end)) + 'まで・' + R.rankTotal('points') + '人にポイント</span>',
      body: rankTable(nowRows, null) +
        '<div class="pt-now__foot">' + prizes +
          '<div class="pt-now__act">' + (needLast
            ? '<button type="button" class="btn btn-primary" data-pt-close="' + esc(lastKey) + '"' + dis() + '>' + esc(monthName(-1)) + 'を締める</button>'
            : '<button type="button" class="btn btn-ink" disabled>' + esc(monthName(0)) + 'を締める</button><span class="pm-muted">' + esc(U.fmtShort(new Date(end.getTime() + DAY))) + 'から締められます</span>') +
          '</div></div>'
    });
    var past = recs.map(function (rec) {
      var todo = rec.rows.filter(function (r) { return !r.auto && (!r.contact || r.contact.status === '未連絡'); }).length;
      return AU.panel({
        title: rec.month.replace(/^\d{4}-0?/, '') + '月のランキング（締め済み）', id: 'pt' + rec.id.replace(/\W/g, ''), cls: 'pt-past', flush: true,
        actions: '<span>' + esc(U.fmtShort(rec.at, true)) + 'に締めた（' + esc(AD.db.staffName(rec.by)) + '）' + (todo ? '・<b class="pm-alert">未連絡 ' + todo + '人</b>' : '') + '</span>',
        body: rankTable(rec.rows, rec)
      });
    }).join('');
    return nowPanel + past;
  }
  function rankTable(list, rec) {
    if (!list.length) return AU.empty('まだポイントのある会員はいません。');
    return '<div class="ad-tbl-wrap"><table class="ad-tbl is-cards is-dense pt-rank" aria-label="ランキングの上位10人"><thead><tr>' +
      '<th scope="col" class="r">順位</th><th scope="col">会員</th><th scope="col" class="r">pt</th><th scope="col">賞</th>' + (rec ? '<th scope="col">連絡</th><th scope="col"><span class="sr-only">操作</span></th>' : '') +
      '</tr></thead><tbody>' + list.map(function (r) {
        var c = r.contact, st = r.auto ? '会員証に表示' : c ? c.status : '未連絡';
        return '<tr><td class="r nw" data-label="順位"><b class="num">' + r.rank + '</b>位</td>' +
          '<td class="is-main">' + AU.who(r.no) + '</td>' +
          '<td class="r nw" data-label="pt"><span class="num">' + U.num(r.value) + '</span>pt</td>' +
          '<td data-label="賞">' + esc(String(r.prize).replace(/^[^：]*：/, '')) + '</td>' +
          (rec ? '<td data-label="連絡">' + (r.auto ? '<span class="ad-st">会員証に表示</span>' : U.statusTag(CONTACT_TAG[st] || 'new', st)) +
            (c && c.at ? '<span class="pt-contact">' + esc(U.fmtShort(c.at)) + '・' + esc(AD.db.staffName(c.by)) + (c.how ? '・' + esc(c.how) : '') + (c.note ? '<br>' + esc(c.note) : '') + '</span>' : '') + '</td>' +
            '<td class="r" data-label="">' + (r.auto || (c && (c.status === '済み' || c.status === '辞退')) ? '' : '<button type="button" class="btn btn-ghost btn-s" data-pt-contact="' + esc(rec.id) + '" data-pt-rank="' + r.rank + '"' + dis() + '>' + (c && c.status === '連絡済み' ? '記録する' : '連絡した') + '</button>') + '</td>' : '') +
        '</tr>';
      }).join('') + '</tbody></table></div>';
  }
  function runRankClose(key) {
    var rows = snapshot(-1);
    AU.act({
      title: monthName(-1) + 'のランキングを締める', ok: '締める', cls: 'a-points',
      text: '上位' + rows.length + '人を記録します。1〜3位の賞は、このあと連絡を記録します。4〜10位は会員証に順位が出ます。',
      defaultReason: monthName(-1) + 'の締め',
      run: function () {
        AD.db.update(function (s) { (s.rankCloses = s.rankCloses || []).push({ id: 'rk-' + key, month: key, at: nowIso(), by: staffId(), rows: rows.map(function (r) { return Object.assign(r, { contact: null }); }) }); });
        return { ok: true };
      },
      audit: { action: 'ranking_close', label: 'ランキングを締めた', target: { type: 'ranking', id: key, name: monthName(-1) }, detail: '上位' + rows.length + '人' },
      done: monthName(-1) + 'のランキングを締めました'
    }).then(function (r) { if (r && cur) cur.refresh(); });
  }
  function contact(recId, rank) {
    var rec = rankCloses().filter(function (x) { return x.id === recId; })[0]; if (!rec) return;
    var row = rec.rows.filter(function (r) { return r.rank === rank; })[0]; if (!row) return;
    var live = AD.data.live(), isLive = row.no === live.no, cs = row.contact ? row.contact.status : '未連絡';
    AU.act({
      title: row.name + 'さん（' + row.rank + '位）への連絡', ok: '記録する', kind: 'ink', cls: 'a-points',
      text: '賞：' + row.prize,
      fields: '<fieldset class="pt-cstat"><legend class="field__label">状態</legend>' + ['連絡済み', '済み', '辞退'].map(function (s, i) {
          var on = cs === '連絡済み' ? s === '済み' : i === 0;
          return '<label class="check"><input type="radio" name="status" value="' + s + '"' + (on ? ' checked' : '') + '><span>' + s + (s === '済み' ? '（賞を受け取った）' : '') + '</span></label>';
        }).join('') + '</fieldset>' +
        '<label class="field"><span>方法</span><select class="select" name="how">' + ['メッセージ', 'メール', 'LINE', 'Zoom', '電話'].map(function (h) { return '<option>' + h + '</option>'; }).join('') + '</select></label>' +
        (isLive && cs === '未連絡' ? '<label class="check"><input type="checkbox" name="send" checked><span>会員ページのメッセージに賞の案内を送る</span></label>' : ''),
      reason: 'optional', reasonLabel: 'メモ', reasons: ['日程の候補を3つ送った', '相談を実施した', '本人から辞退の連絡'],
      run: function (reason, f) {
        if (f.send && isLive) R.staffReply(monthName(-1) + 'の貢献ポイントのランキングで' + row.rank + '位でした。賞は「' + String(row.prize).replace(/^[^：]*：/, '') + '」です。日程の候補を送るので、都合のいい時間を教えてください。');
        AD.db.update(function (s) {
          var x = (s.rankCloses || []).filter(function (y) { return y.id === recId; })[0]; if (!x) return;
          var y = x.rows.filter(function (z) { return z.rank === rank; })[0]; if (y) y.contact = { status: f.status || '連絡済み', at: nowIso(), by: staffId(), how: f.how, note: reason };
        });
        return { ok: true, status: f.status };
      },
      audit: function (reason, f) { return { action: 'prize_contact', label: 'ランキングの賞の連絡を記録した', target: { type: 'member', id: row.no, name: row.name }, detail: rec.month + '・' + row.rank + '位・' + (f.status || '連絡済み') + '（' + f.how + '）' }; },
      done: '記録しました'
    }).then(function (r) { if (r && cur) cur.refresh(); });
  }

  /* ---------- 候補（会員を探す欄の下に出す。描き直さず、この欄だけ変える） ---------- */
  function showSug(inp) {
    var ul = document.getElementById('ptSug'); if (!ul) return;
    var v = inp.value.trim(), list = v.length >= 2 ? suggest(v) : [];
    var live = document.getElementById('ptSugN');
    if (!v || v.length < 2) { ul.hidden = true; ul.innerHTML = ''; if (live) live.textContent = ''; return; }
    ul.innerHTML = list.length ? list.map(function (m) {
      return '<li><a class="pt-sug__a" href="' + esc(hashWith({ no: m.no })) + '" data-pt-pick="' + esc(m.no) + '">' + AU.who(m, { link: false, sub: m.no + '・Lv' + m.level + '・今月 ' + m.monthPoints + 'pt' }) + '</a></li>';
    }).join('') : '<li class="pt-sug__none">見つかりません</li>';
    ul.hidden = false;
    if (live) live.textContent = list.length ? '候補 ' + list.length + '人' : '見つかりません';
  }

  AD.screens.points = {
    title: '貢献ポイント',
    render: function (ctx) {
      cur = ctx;
      var tab = ctx.query.tab === 'close' ? 'close' : 'grant';
      var todo = 0;
      try { rankCloses().forEach(function (rec) { todo += rec.rows.filter(function (r) { return !r.auto && (!r.contact || r.contact.status === '未連絡'); }).length; }); } catch (e) { todo = 0; }
      var tabs = AU.tabs([
        { id: 'grant', label: '付ける・記録', href: '#/points' + (ctx.query.no ? '?no=' + encodeURIComponent(ctx.query.no) : ''), n: AD.db.state.pointGrants.filter(function (g) { return !g.revoked; }).length },
        { id: 'close', label: '月末のランキング', href: '#/points?tab=close', n: todo || '', alert: todo > 0 }
      ], tab, '貢献ポイントの表示');
      return '<div class="a-points">' +
        AU.head({ title: '貢献ポイント', sub: '付けてから1年で消えます・紹介では増えません・ランキングは暦の月で数えます' }) +
        tabs + roleNote() + (tab === 'close' ? closeTab(ctx) : grantTab(ctx)) + '</div>';
    },
    mount: function (root, ctx) {
      cur = ctx;
      // ルールを選んだら、理由の欄に書き出しを入れる（空のときだけ）
      if (root.__boundPoints) return;
      root.__boundPoints = true;
      root.addEventListener('input', function (e) {
        if (e.target.id === 'ptFind' && e.target.closest('.a-points')) showSug(e.target);
        if (e.target.id === 'ptWhy') e.target.removeAttribute('data-auto');
        var f = e.target.closest('.a-points #ptForm');
        if (f && e.target.getAttribute('aria-invalid')) U.fieldErrors(f, (function () { var o = {}; o[e.target.name] = ''; return o; })(), { focus: false });
      });
      root.addEventListener('keydown', function (e) {
        if (e.target.id !== 'ptFind' || !e.target.closest('.a-points')) return;
        if (e.key === 'ArrowDown') { var a = document.querySelector('#ptSug a'); if (a) { e.preventDefault(); a.focus(); } }
        if (e.key === 'Enter') { var one = document.querySelector('#ptSug a'); if (one) { e.preventDefault(); one.click(); } }
      });
      root.addEventListener('change', function (e) {
        var r = e.target.closest('.a-points input[name=rule]'); if (!r) return;
        var why = document.getElementById('ptWhy'), ru = rule(r.value);
        if (why && ru && (!why.value || why.getAttribute('data-auto') === '1')) { why.value = ru.name.replace(/（.*$/, '') + '（）'; why.setAttribute('data-auto', '1'); }
        if (why && ru) U.fieldErrors(r.closest('form'), { why: '' }, { focus: false });
        var err = document.getElementById('ptErr'); if (err) err.innerHTML = '';
      });
      // 書き出し「〜（）」のままなら、カーソルを（ ）の中に置く。押して入ったときは、押した位置に置かれたあとで直す（mouseup）
      function caretIn(t) {
        if (!t || t.id !== 'ptWhy' || t.getAttribute('data-auto') !== '1' || !/（）$/.test(t.value)) return;
        setTimeout(function () { try { t.setSelectionRange(t.value.length - 1, t.value.length - 1); } catch (x) {} }, 0);
      }
      root.addEventListener('focusin', function (e) { caretIn(e.target); });
      root.addEventListener('mouseup', function (e) { caretIn(e.target); });
      root.addEventListener('input', function (e) { if (e.target.id === 'ptWhy' && !/（）$/.test(e.target.value)) e.target.removeAttribute('data-auto'); });
      root.addEventListener('submit', function (e) {
        var f = e.target.closest('.a-points #ptForm'); if (!f) return;
        e.preventDefault();
        if (!AU.need('points')) return;
        doGrant(f);
      });
      root.addEventListener('click', function (e) {
        var b;
        if (!canPoint() && e.target.closest('.a-points [data-pt-revoke],.a-points [data-pt-close],.a-points [data-pt-contact]')) return;
        if ((b = e.target.closest('.a-points [data-pt-revoke]'))) { revoke(b.getAttribute('data-pt-revoke')); return; }
        if ((b = e.target.closest('.a-points [data-pt-close]'))) { runRankClose(b.getAttribute('data-pt-close')); return; }
        if ((b = e.target.closest('.a-points [data-pt-contact]'))) { contact(b.getAttribute('data-pt-contact'), +b.getAttribute('data-pt-rank')); return; }
        if ((b = e.target.closest('.a-points [data-pt-pick]'))) { e.preventDefault(); AD.app.setQuery({ no: b.getAttribute('data-pt-pick') }, { focus: '#ptWhy' }); }
      });
      // 候補の上で ↑↓
      root.addEventListener('keydown', function (e) {
        var a = e.target.closest('.a-points .pt-sug__a'); if (!a) return;
        var all = Array.prototype.slice.call(document.querySelectorAll('#ptSug a')), i = all.indexOf(a);
        if (e.key === 'ArrowDown' && all[i + 1]) { e.preventDefault(); all[i + 1].focus(); }
        if (e.key === 'ArrowUp') { e.preventDefault(); (all[i - 1] || document.getElementById('ptFind')).focus(); }
        if (e.key === 'Escape') { var inp = document.getElementById('ptFind'); if (inp) { inp.focus(); document.getElementById('ptSug').hidden = true; } }
      });
    }
  };
})();
