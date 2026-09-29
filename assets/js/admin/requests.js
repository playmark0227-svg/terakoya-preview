/* ============================================================
   運営画面：「あったらいい」リクエスト（#/requests、#/requests/<リクエストid>）
   ------------------------------------------------------------
   会員が会員ページの #/requests で出したリクエスト（見本は data.js の REQUESTS、デモ会員の分は会員ページの保存）を
   ＋1の多い順に並べ、状態・返事・リンクを付ける。一覧の元は R.requests({ admin:true })（匿名でも本名 byName・会員番号 byNo が付く）。
   - 一覧（#/requests）：状態の丸い札（受付中・検討中・追加しました・今回は見送り）と種類（案件・講座・イベント・勉強会）で絞る。
     並びは ＋1 の多い順（?sort=-votes が既定。新着 -at・返事の新しい順 -answeredAt）。上の数字は押すとその状態に絞る。
     ?status=active（受付中と検討中）・done（追加しました と 今回は見送り）でも絞れる。?focus=<id>（会員ページと同じ形）はその1件を開く。
   - 詳細（#/requests/<id>）：中身・出した人（匿名のものは「会員ページでは匿名」と出す）と、返事の欄。
     返事は AD.ops.answerRequest（R.answerRequest）→ 出した人と＋1した人にお知らせ（会員ページのタブに届く）。
     「追加しました」は追加した講座・案件・イベントを選ぶ（会員ページの行にリンクが出る）。出した人に +20pt（1回だけ）なので、確かめてから保存する。
     「今回は見送り」は理由が要る（会員ページにそのまま出る）。返事に載せられない言葉（AD.cms.flags：収入の約束・「月◯万円」など）があれば止める。
     保存したら操作の記録（AD.db.audit）に残す。追加した先は運営画面の講座・案件・イベントの詳細へのリンク。
   - 役割：返事を書けるのは「会員・メッセージ」の役割（代表・運営）。講師・経理は見るだけ（AU.roleNote。返事の欄は出さず、いまの返事だけ）。
   - 数：メニューの数は受付中で返事がまだのもの（AD.data.metrics().requests ＝ R.requestCounts().pending）。
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, AD = CLG.admin, AU = AD.ui, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon;
  var cur = null;
  var MAX = 400;
  var STATUS = [['open', '受付中'], ['considering', '検討中'], ['added', '追加しました'], ['declined', '今回は見送り']];
  var KINDS = (DATA.REQUEST_KINDS || []).map(function (k) { return [k.id, k.name]; });
  // 返事のひな形（押すと返事の欄に入る。そのままでなく、中身に合わせて直して使う）
  var PRESETS = {
    considering: ['運営で検討しています。決まったら、ここでお知らせします。', '講師と日程を相談しています。決まったらお知らせします。'],
    declined: ['いまある講座・案件と中身が重なるため、今回は見送ります。', '続けて開ける講師の手が足りないため、今回は見送ります。時期を変えてまた考えます。'],
    added: ['追加しました。リンクから見られます。']
  };

  function can() { return AU.can('members'); }
  function list() { try { return R.requests({ admin: true, sort: 'popular' }); } catch (e) { console.error(e); return []; } }
  function find(id) { try { return R.request(id, { admin: true }); } catch (e) { return null; } }
  function counts() {
    try { return R.requestCounts(); } catch (e) { return { open: 0, considering: 0, added: 0, declined: 0, pending: 0, all: 0 }; }
  }
  function statusName(id) { var s = STATUS.filter(function (x) { return x[0] === id; })[0]; return s ? s[1] : id; }
  function head(text, n) { text = String(text || ''); return text.length > n ? text.slice(0, n - 1) + '…' : text; }

  /* 出した人：会員の顔と名前（押すと会員の詳細）。匿名で出したものは「会員ページでは匿名」を添える */
  function whoHtml(r, o) {
    o = o || {};
    var m = r.byNo ? AD.data.member(r.byNo) : null;
    var w = m ? AU.who(m, { sub: o.sub }) : '<span class="ad-who"><span class="ad-who__txt"><span class="ad-who__name">' + esc(r.byName || r.who) + '</span></span></span>';
    return w + (r.anonymous ? '<span class="a-rq__anon">会員ページでは匿名</span>' : '') + (r.mine ? '<span class="a-rq__live">デモ会員</span>' : '');
  }
  function replyCell(r) {
    if (!r.reply) return can() && r.status !== 'added' && r.status !== 'declined'
      ? '<a class="btn btn-ghost btn-s a-rq__go" href="#/requests/' + esc(encodeURIComponent(r.id)) + '" aria-label="「' + esc(r.title) + '」に返事を書く">返事を書く</a>'
      : '<span class="muted">まだ</span>';
    return '<span class="num">' + esc(U.fmtShort(r.reply.at)) + '</span><span class="a-rq__sub">' + esc(r.reply.who) + '</span>';
  }
  /* 追加した先：運営画面の講座・案件・イベントの詳細へ（見つからないものは文字だけ） */
  function linkHtml(l) {
    if (!l) return '';
    var t = esc(l.typeLabel || '') + '「' + esc(l.title || l.id) + '」';
    var to = { course: '#/courses/', gig: '#/gigs/', event: '#/events/' }[l.type];
    return l.found && to ? '<a class="a-rq__link" href="' + esc(to + encodeURIComponent(l.id)) + '">' + t + '</a>' : '<span class="a-rq__link">' + t + '</span>';
  }

  /* ---------- 一覧 ---------- */
  /* 状態で絞る：丸い札は4つの状態。ほかの画面から来る ?status=active（受付中と検討中）・done（対応済み）は、そのときだけ札を足す */
  var GROUPS = { active: ['受付中・検討中', { open: 1, considering: 1 }], done: ['対応済み', { added: 1, declined: 1 }] };
  function statusOptions(v) { return [['', 'すべて']].concat(STATUS).concat(GROUPS[v] ? [[v, GROUPS[v][0]]] : []); }
  function statusMatch(r, v) { return GROUPS[v] ? !!GROUPS[v][1][r.status] : r.status === v; }
  function kpis(c) {
    function k(id, label, n, o) {
      return AU.kpi(Object.assign({ label: label, value: U.num(n), unit: '件', href: '#/requests?status=' + id }, o || {}));
    }
    return '<div class="ad-kpis a-rq__kpis">' +
      k('open', '受付中', c.open, { tone: c.pending ? 'alert' : '', sub: c.pending ? '返事がまだ ' + c.pending + '件' : '返事はすべて書いています' }) +
      k('considering', '検討中', c.considering) +
      k('added', '追加しました', c.added) +
      k('declined', '今回は見送り', c.declined) +
    '</div>';
  }
  function listView(ctx) {
    var rows = list(), c = counts();
    return '<div class="a-requests">' +
      AU.head({ title: 'リクエスト', sub: '会員から ' + rows.length + '件',
        actions: '<a class="btn btn-ghost btn-s" href="' + esc(AD.data.memberHref('#/requests')) + '" target="_blank" rel="noopener">' + icon('external', 'ico-s') + '会員ページで見る</a>' }) +
      AU.roleNote('members', 'リクエストへの返事', { strict: true }) +
      kpis(c) +
      AU.table({
        id: 'requests', rows: rows, query: ctx.query, sort: '-votes', label: 'リクエストの一覧', pageSize: 50,
        search: { placeholder: '題・中身・名前', label: 'リクエストの題・中身・出した人で探す', keys: ['title', 'detail', 'byName'] },
        filters: [
          { key: 'status', label: '状態', chips: true, options: statusOptions(ctx.query.status), match: statusMatch },
          { key: 'kind', label: '種類', options: [['', 'すべて']].concat(KINDS) }
        ],
        columns: [
          { key: 'votes', label: '＋1', align: 'r', dir: 'desc', nowrap: true, cls: 'a-rq__votes',
            html: function (r) { return '<b class="num">' + esc(r.votes) + '</b>'; } },
          { key: 'title', label: 'リクエスト', main: true, value: function (r) { return r.title; },
            html: function (r) {
              return '<a class="a-rq__ttl" href="#/requests/' + esc(encodeURIComponent(r.id)) + '">' + esc(r.title) + '</a>' +
                '<span class="a-rq__sub">' + esc(r.kindLabel) + (r.detail ? '・' + esc(head(r.detail, 36)) : '') + '</span>';
            } },
          { key: 'kind', label: '種類', csvOnly: true, csv: function (r) { return r.kindLabel; } },
          { key: 'detail', label: '中身', csvOnly: true },
          { key: 'byName', label: '出した人', hide: 'sm', html: function (r) { return whoHtml(r); },
            csv: function (r) { return (r.byName || '') + (r.byNo ? ' ' + r.byNo : '') + (r.anonymous ? '（匿名）' : ''); } },
          AU.col.date('at', '出した日', { hide: 'md' }),
          AU.col.status('status', '状態', 'request', { value: function (r) { return { open: r.reply ? 1 : 0, considering: 2, added: 3, declined: 4 }[r.status]; } }),
          { key: 'answeredAt', label: '返事', dir: 'desc', nowrap: true, html: replyCell,
            csv: function (r) { return r.reply ? AU.ymd(r.reply.at, true) + ' ' + r.reply.who + '：' + r.reply.text : ''; } },
          { key: 'link', label: 'リンク', csvOnly: true, csv: function (r) { return r.link ? r.link.typeLabel + '：' + r.link.title : ''; } }
        ],
        rowHref: function (r) { return '#/requests/' + encodeURIComponent(r.id); },
        rowClass: function (r) { return r.status === 'open' && !r.reply ? 'is-alert' : r.status === 'declined' ? 'is-quiet' : ''; },
        rowLabel: function (r) { return r.title; },
        csv: { name: 'リクエスト' },
        empty: 'まだリクエストはありません。'
      }) +
    '</div>';
  }

  /* ---------- 詳細：返事を書く ---------- */
  /* 追加した先の候補（会員に見えている講座・案件・イベント）。リクエストの種類を先に並べる */
  function linkOptions(r) {
    var now = CLG.now(), sel = r.link ? r.link.type + ':' + r.link.id : '';
    var groups = {
      course: ['講座', (DATA.COURSES || []).map(function (c) { return ['course:' + c.id, c.title + '（Lv' + c.level + '）']; })],
      gig: ['案件', (DATA.GIGS || []).filter(function (g) { return g.by !== 'me'; }).map(function (g) { return ['gig:' + g.id, g.title]; })],
      event: ['イベント・勉強会', (DATA.EVENTS || []).filter(function (e) { return new Date(e.at) > now || 'event:' + e.id === sel; })
        .sort(function (a, b) { return new Date(a.at) - new Date(b.at); }).map(function (e) { return ['event:' + e.id, U.fmtShort(e.at) + ' ' + e.title]; })]
    };
    var order = [r.kind].concat(['course', 'gig', 'event'].filter(function (k) { return k !== r.kind; }));
    return '<option value="">選んでください</option>' + order.filter(function (k) { return groups[k]; }).map(function (k) {
      return '<optgroup label="' + esc(groups[k][0]) + '">' + groups[k][1].map(function (o) {
        return '<option value="' + esc(o[0]) + '"' + (o[0] === sel ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
      }).join('') + '</optgroup>';
    }).join('');
  }
  function presetsHtml(st) {
    var list = PRESETS[st] || [];
    return list.length ? '<div class="chips a-rq__presets" role="group" aria-label="返事のひな形">' + list.map(function (t, i) {
      return '<button type="button" class="chip" data-rq-preset="' + i + '">' + esc(t) + '</button>';
    }).join('') + '</div>' : '';
  }
  /* 返事の欄の名前：見送りは理由が要る。検討中は、まだ返事がないときは一言が要る（R.answerRequest と同じ決まり） */
  function replyLabel(st, r) {
    if (st === 'declined') return '見送りの理由<span class="req">必須</span>';
    if (st === 'considering' && !r.reply) return '返事<span class="req">必須</span>';
    return '返事<span class="opt">任意</span>';
  }
  function answerForm(r) {
    var st = r.status, dis = can() ? '' : ' disabled';
    return '<form class="a-rq__form" id="rqForm" data-rq-form="' + esc(r.id) + '" novalidate>' +
      '<fieldset class="field a-rq__st"><legend class="field__label">状態</legend><div class="a-rq__radios">' + STATUS.map(function (s) {
        return '<label class="check"><input type="radio" name="status" value="' + s[0] + '"' + (s[0] === st ? ' checked' : '') + dis + '><span>' + esc(s[1]) + '</span></label>';
      }).join('') + '</div></fieldset>' +
      '<div class="field a-rq__linkbox" data-rq-linkbox' + (st === 'added' ? '' : ' hidden') + '>' +
        '<label class="field__label" for="rqLink">追加した講座・案件・イベント</label>' +
        '<select class="select" id="rqLink" name="link"' + dis + '>' + linkOptions(r) + '</select></div>' +
      '<div class="field a-rq__reply"><label class="field__label" for="rqReply" data-rq-label>' + replyLabel(st, r) + '</label>' +
        '<div data-rq-presets>' + (can() ? presetsHtml(st) : '') + '</div>' +
        '<textarea class="textarea" id="rqReply" name="reply" rows="4" maxlength="' + MAX + '"' + dis + ' aria-describedby="rqCount">' + esc(r.reply ? r.reply.text : '') + '</textarea>' +
        '<small class="a-rq__count" id="rqCount"><span class="num" data-rq-count>' + (r.reply ? r.reply.text.length : 0) + '</span>/' + MAX + '文字・会員ページにそのまま出ます</small></div>' +
      '<p class="form-err" role="alert" data-rq-err></p>' +
      // お知らせが届くのは、状態が変わったときと、はじめて返事が付いたとき（R.answerRequest と同じ）。返事を直すだけでは届かない
      '<div class="a-rq__acts"><button type="submit" class="btn btn-primary"' + dis + '>保存する</button>' +
        '<span class="a-rq__note">' + (r.reply ? '状態を変えると' : '保存すると') + '、出した人と<span class="nw">＋1した人</span>にお知らせが届きます。</span></div>' +
    '</form>';
  }
  /* 返事を書けない役割（講師・経理）：欄は出さず、いまの返事だけ */
  function answerView(r) {
    if (!r.reply) return '<p class="a-rq__none">まだ返事はありません。</p>';
    return '<div class="a-rq__now"><p class="a-rq__nowhead">' + AU.status('request', r.status) +
      '<span>' + esc(r.reply.who) + '・<span class="num">' + esc(U.fmtShort(r.reply.at, true)) + '</span></span></p>' +
      '<p class="a-rq__nowtext">' + U.jp(r.reply.text, { br: true }) + '</p>' + (r.link ? '<p class="a-rq__nowlink">' + linkHtml(r.link) + '</p>' : '') + '</div>';
  }
  function requestPt() { return ((DATA.POINT_RULES || []).filter(function (x) { return x.id === 'request'; })[0] || { pt: 20 }).pt; }
  /* 貢献ポイントの欄：付けた／これから付く／最初から「追加しました」の見本（この画面の前に追加したもの） */
  function pointText(r) {
    if (r.pointed) return '+' + requestPt() + 'pt を付けました';
    if (r.status === 'added') return '追加済み（+' + requestPt() + 'pt は1回だけ）';
    return '「追加しました」にすると +' + requestPt() + 'pt';
  }
  function history(r) {
    var log = (AD.db.state.audit || []).filter(function (a) { return a.target && a.target.type === 'request' && a.target.id === r.id; });
    var rows = log.map(function (a) {
      return '<li><time class="num" datetime="' + esc(a.at) + '">' + esc(U.fmtShort(a.at, true)) + '</time><span>' + esc(a.label) + '</span><small>' + esc(AD.db.staffName(a.by)) + '</small></li>';
    });
    rows.push('<li><time class="num" datetime="' + esc(r.at) + '">' + esc(U.fmtShort(r.at, true)) + '</time><span>' + esc(r.anonymous ? '匿名で出された' : '出された') + '</span><small>' + esc(r.byName || '') + '</small></li>');
    return '<ol class="a-rq__hist">' + rows.join('') + '</ol>';
  }
  function detail(ctx, r) {
    var cur0 = r.reply ? answerView(r) : '';
    var body = '<div class="a-rq__body"><p class="a-rq__meta">' + AU.status('request', r.status) + '<span>' + esc(r.kindLabel) + '</span>' +
        (r.editedAt ? '<span>' + esc(U.fmtShort(r.editedAt)) + 'に直した</span>' : '') + '</p>' +
      (r.detail ? '<p class="a-rq__detail">' + U.jp(r.detail, { br: true }) + '</p>' : '<p class="a-rq__detail muted">中身は書かれていません。</p>') + '</div>';
    var main = AU.panel({ title: 'リクエスト', id: 'rqBody', body: body }) +
      (can() ? AU.panel({ title: r.reply ? '返事を直す' : '返事を書く', id: 'rqAnswer', body: (r.reply ? '<h3 class="a-rq__h">いまの返事</h3>' + cur0 : '') + answerForm(r) })
        : AU.panel({ title: '運営の返事', id: 'rqAnswer', body: answerView(r) }));
    var side = AU.panel({ title: '出した人', id: 'rqWho', body: '<div class="a-rq__whobox">' + whoHtml(r) + '</div>' + AU.kv([
        ['出した日', U.fmtDate(r.at)],
        ['＋1', '<b class="num">' + esc(r.votes) + '</b>人' + (r.voted ? '（デモ会員も）' : ''), true],
        ['貢献ポイント', pointText(r)]
      ]) }) +
      AU.panel({ title: '記録', id: 'rqLog', body: history(r) });
    return '<div class="a-requests">' +
      AU.head({ title: r.title, crumb: [['#/requests', 'リクエスト']], sub: r.kindLabel + '・＋1 ' + r.votes + '人・' + U.fmtShort(r.at) + 'に出された',
        actions: '<a class="btn btn-ghost btn-s" href="' + esc(AD.data.memberHref(r.href)) + '" target="_blank" rel="noopener">' + icon('external', 'ico-s') + '会員ページで見る</a>' }) +
      AU.roleNote('members', 'リクエストへの返事', { strict: true }) +
      '<div class="a-rq__grid"><div class="a-rq__main">' + main + '</div><div class="a-rq__side">' + side + '</div></div>' +
    '</div>';
  }
  function notFound() {
    return '<div class="a-requests">' + AU.head({ title: 'ページが見つかりません', crumb: [['#/requests', 'リクエスト']], sub: 'このリクエストはありません。消されたか、アドレスが違います。' }) +
      '<a class="btn btn-ink" href="#/requests">リクエストの一覧へ</a></div>';
  }

  /* ---------- 保存 ---------- */
  function save(form) {
    if (!AU.need('members')) return;
    var id = form.getAttribute('data-rq-form'), before = find(id);
    if (!before) { U.toast('このリクエストは見つかりませんでした', 'error'); return; }
    var err = form.querySelector('[data-rq-err]');
    var st = (form.querySelector('input[name=status]:checked') || {}).value || before.status;
    var d = { status: st, reply: String(form.reply.value || '').trim(), link: st === 'added' ? form.link.value : null };
    if (err) err.textContent = '';
    U.fieldErrors(form, { status: '', reply: '', link: '' }, { focus: false });
    var same = st === before.status && d.reply === (before.reply ? before.reply.text : '') &&
      (st !== 'added' || d.link === (before.link ? before.link.type + ':' + before.link.id : ''));
    if (same) { if (err) err.textContent = '変えたところがありません。'; return; }
    // 確かめの窓を出す前に、足りない欄を知らせる（窓で「保存する」を押してから誤りが出ないように）
    // 返事は会員ページの一覧にそのまま出るので、ほかの掲載と同じく載せられない言葉（収入の約束・「月◯万円」など）を止める
    var hit = d.reply && AD.cms && AD.cms.flags ? AD.cms.flags(d.reply) : [];
    if (hit.length) { U.fieldErrors(form, { reply: 'この内容は出せません（' + hit.join('・') + '）' }); return; }
    if (st === 'added' && !d.link) { U.fieldErrors(form, { link: '追加した講座・案件・イベントを選んでください' }); return; }
    if (st === 'declined' && !d.reply) { U.fieldErrors(form, { reply: '見送りの理由を書いてください' }); return; }
    if (st === 'considering' && !d.reply && !before.reply) { U.fieldErrors(form, { reply: 'どう検討しているかを一言書いてください' }); return; }
    var ask = st === 'added' && before.status !== 'added' && !before.pointed
      ? U.confirmBox('「追加しました」にしますか', (before.byName ? before.byName + 'さん' : '出した人') + 'に貢献ポイント +' + requestPt() + 'pt が付き、出した人と＋\u20601した人にお知らせが届きます。', '保存する', false, { kind: 'ink' })
      : Promise.resolve(true);
    ask.then(function (ok) {
      if (!ok) return;
      var res = AD.ops.answerRequest(id, d);
      if (!res.ok) {
        if (res.errors) U.fieldErrors(form, res.errors);
        else if (err) err.textContent = res.error || '保存できませんでした';
        return;
      }
      AD.db.audit(res.audit);
      var live = AD.data.live();
      U.toast('返事を保存しました' + (res.notified ? '。' + live.name + 'さんにお知らせが届きます' : '') + (res.pt ? '（+' + res.pt + 'pt）' : ''), 'ok');
      cur.refresh({ focus: '#rqAnswer' });
    });
  }

  AD.screens.requests = {
    title: function (ctx) {
      var id = ctx.params[0] || ctx.query.focus;
      if (!id) return 'リクエスト';
      var r = find(id); return r ? r.title : ctx.params[0] ? 'ページが見つかりません' : 'リクエスト';
    },
    skeleton: 'table',
    render: function (ctx) {
      if (ctx.params[0]) { var r = find(ctx.params[0]); return r ? detail(ctx, r) : notFound(); }
      // 会員ページと同じ形のリンク（#/requests?focus=<id>。お知らせ・ポイントの理由から）は、その1件を開く
      if (ctx.query.focus) { var f = find(ctx.query.focus); if (f) return detail(ctx, f); }
      return listView(ctx);
    },
    mount: function (root, ctx) {
      cur = ctx;
      if (root.__boundRequests) return;
      root.__boundRequests = true;
      root.addEventListener('change', function (e) {
        var t = e.target, f = t.closest && t.closest('.a-requests [data-rq-form]');
        if (!f || t.name !== 'status') return;
        var st = t.value, box = f.querySelector('[data-rq-linkbox]'), lab = f.querySelector('[data-rq-label]'), pr = f.querySelector('[data-rq-presets]');
        var r = find(f.getAttribute('data-rq-form'));
        if (box) box.hidden = st !== 'added';
        if (lab && r) lab.innerHTML = replyLabel(st, r);
        if (pr) pr.innerHTML = can() ? presetsHtml(st) : '';
        U.fieldErrors(f, { status: '', reply: '', link: '' }, { focus: false });
      });
      root.addEventListener('click', function (e) {
        var b = e.target.closest('.a-requests [data-rq-preset]'); if (!b) return;
        var f = b.closest('[data-rq-form]'), st = (f.querySelector('input[name=status]:checked') || {}).value;
        var t = (PRESETS[st] || [])[+b.getAttribute('data-rq-preset')]; if (!t) return;
        f.reply.value = t; f.reply.focus();
        var n = f.querySelector('[data-rq-count]'); if (n) n.textContent = String(t.length);
        U.fieldErrors(f, { reply: '' }, { focus: false });
      });
      root.addEventListener('input', function (e) {
        var f = e.target.closest && e.target.closest('.a-requests [data-rq-form]'); if (!f) return;
        if (e.target.name === 'reply') { var n = f.querySelector('[data-rq-count]'); if (n) n.textContent = String(e.target.value.length); }
        if (e.target.getAttribute('aria-invalid')) { var o = {}; o[e.target.name] = ''; U.fieldErrors(f, o, { focus: false }); }
        var er = f.querySelector('[data-rq-err]'); if (er) er.textContent = '';
      });
      root.addEventListener('submit', function (e) {
        var f = e.target.closest && e.target.closest('.a-requests [data-rq-form]'); if (!f) return;
        e.preventDefault(); save(f);
      });
    }
  };
})();
