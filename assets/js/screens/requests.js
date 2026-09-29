/* ============================================================
   「あったらいい」リクエスト（#/requests）
   ------------------------------------------------------------
   - 会員が欲しい案件・講座・イベントを出し、ほかの会員が＋1を付ける。状態と返事は運営が付ける（運営画面の R.answerRequest）。
   - 一覧は 人気順（受付中と検討中・＋1の多い順）／新着（同じものを新しい順）／対応済み（追加しました・今回は見送り。返事の新しい順）と、
     種類の絞り込み。タブと種類はこのファイルの変数に持つ（見る人が替わったら最初に戻す）。種類で絞っているときは行に種類を出さない。
     #/requests?tab=popular|new|done と ?kind=gig|course|event|all で、そのタブ・種類を選んだ状態で開く（URL が変わったときだけ読む）。
   - ＋1（R.toggleVote）は押した行だけをその場で直す（描き直すと人気順の並びが動いて、押した行が手元から逃げるため）。
     自分のリクエストと、対応が済んだものは数だけを出す。＋1にも、出しただけにも貢献ポイントは付かない
     （出した人に +20pt が付くのは「追加しました」になったときだけ。domain.js）。
   - 出す・直す（R.addRequest / R.editRequest）は窓のフォーム。題40文字・中身400文字（数を出す）。匿名にできる（運営には名前が見える）。
     同じ題があれば、そのリクエストへのリンクを出す（＋1をすすめる）。直す・消す（R.removeRequest）は自分の・受付中のものだけ。
   - 開いたら R.markRequestsSeen()（メニューの数が消える）。この画面にいるあいだは、開いた時点で新しかった返事に印を残す（view.fresh）。
   - #/requests?focus=<id>：その行のあるタブに切り替えて送り、短く色を付ける。見つからない id は一言で知らせる。
     #/requests?new=1&kind=gig|course|event：種類を選んだ状態でフォームを開く。
     どちらも mount で1回だけ動かし、URL から外す（描き直しのたびに動かないように。アカウントの ?focus= と同じ形）。
   - #/requests/<id>（運営画面と同じ形。貼り付けたリンクなど）：あるリクエストなら #/requests?focus=<id> へ置きかえ、
     無ければ「ページが見つかりません」。
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon;

  var TITLE_MAX = 40, DETAIL_MAX = 400;
  // [キー, 名前, R.requests の status, sort]
  var TABS = [['popular', '人気順', 'active', 'popular'], ['new', '新着', 'active', 'new'], ['done', '対応済み', 'done', 'answered']];
  var PH = { gig: '例：在宅でできるデータ入力', course: '例：Canvaで投稿画像を作る講座', event: '例：22時からのもくもく会' };
  var TYPE_NAME = { course: '講座', gig: '案件', event: 'イベント' };

  // 画面の中だけの状態。fresh：開いた時点で新しかった返事（リクエストid → true）。focus：mount で送る行。miss：見つからなかった id
  // qk：最後に読んだ URL の ?tab= と ?kind=（変わったときだけ上書きする。イベントの画面と同じ形）
  var view = { owner: null, tab: 'popular', kind: 'all', fresh: {}, focus: null, miss: false, open: null, qk: null };
  var cur = null;        // mount で受け取った ctx（押したときに使う）

  // この画面を離れたら、新しい返事の印を忘れる（次に来たときは、その時点の新しい返事だけに付ける）
  if (window.addEventListener) window.addEventListener('hashchange', function () {
    if (!/^#\/?requests(?:[/?]|$)/.test(String(location.hash || ''))) { view.fresh = {}; view.qk = null; }
  });

  function kinds() { return DATA.REQUEST_KINDS || []; }
  function kindName(id) { var k = kinds().filter(function (x) { return x.id === id; })[0]; return k ? k.name : ''; }
  function tabOf(key) { return TABS.filter(function (t) { return t[0] === key; })[0] || TABS[0]; }
  function rowsFor(tab, kind) {
    var t = tabOf(tab);
    return R.requests({ status: t[2], sort: t[3], kind: kind && kind !== 'all' ? kind : '' });
  }
  function isActive(r) { return r.status === 'open' || r.status === 'considering'; }
  /** 採用されたときの貢献ポイント（DATA.POINT_RULES の 'request'。画面に数を直に書かない） */
  function reqPt() { var x = (DATA.POINT_RULES || []).filter(function (p) { return p.id === 'request'; })[0]; return x ? x.pt : 0; }

  /* ---------- 一覧の1行 ---------- */
  function whoText(r) { return r.mine ? (r.anonymous ? 'あなた（匿名で出しました）' : 'あなた') : r.who; }
  function voteLabel(r) { return '＋1（' + r.votes + '人）'; }
  /** ＋1。押せるのは、ほかの人の・受付中か検討中のものだけ。押せないものは数だけ */
  function voteHtml(r) {
    var n = '<b class="num" data-rq-n>' + U.num(r.votes) + '</b>';
    if (r.canVote) {
      return '<button type="button" class="rq__vote" data-rq-vote="' + esc(r.id) + '" aria-pressed="' + !!r.voted + '" aria-label="' + esc(voteLabel(r)) + '">' +
        '<span class="rq__plus" aria-hidden="true">＋1</span>' + n + '</button>';
    }
    return '<span class="rq__votes"><span class="nw">＋1が' + n + '人</span>' + (r.voted ? '<span class="rq__mine">＋1しました</span>' : '') + '</span>';
  }
  /** 追加したもの（講座・案件・イベント）へのリンク。消えていたらそう書く */
  function linkHtml(r) {
    var l = r.link;
    if (!l) return '';
    if (!l.found) return '<p class="rq__gone">' + esc((TYPE_NAME[l.type] || '') + 'の公開は終わりました。') + '</p>';
    var label = (TYPE_NAME[l.type] || '') + '「' + l.title + '」を見る';
    return '<a class="btn btn-soft btn-s rq__link" href="' + esc(l.href) + '"><span>' + U.jp(label) + '</span></a>';
  }
  /** 運営の返事（見送りは理由）。開いた時点で新しかった返事は「新しい返事」と書いて地に色を付ける */
  function replyHtml(r) {
    if (!r.reply) return '';
    var p = r.reply, isNew = !!view.fresh[r.id];
    var head = isNew ? '新しい返事' : r.status === 'declined' ? '見送りの理由' : '運営の返事';
    return '<div class="rq__reply' + (isNew ? ' is-new' : '') + '">' +
      '<p class="rq__rhead"><b>' + head + '</b><span>' + esc(p.who) + '・' + U.fmtShort(p.at) + '</span></p>' +
      '<p class="rq__rtext">' + U.jp(p.text, { br: true }) + '</p>' + linkHtml(r) +
    '</div>';
  }
  function ownActs(r) {
    if (!r.canEdit) return '';
    var id = esc(r.id);
    return '<span class="rq__own">' +
      '<button type="button" class="btn btn-text btn-s" data-rq-edit="' + id + '">' + icon('pen', 'ico-s') + '直す</button>' +
      '<button type="button" class="btn btn-text btn-s rq__del" data-rq-del="' + id + '">消す</button></span>';
  }
  function row(r) {
    var id = esc(r.id), meta = [];
    if (view.kind === 'all') meta.push(r.kindLabel);
    meta.push(whoText(r));
    meta.push(U.fmtShort(r.at));
    return '<article class="rq' + (r.mine ? ' is-mine' : '') + '" id="rq-' + id + '" data-rq-row="' + id + '" tabindex="-1" aria-labelledby="rq-' + id + '-t">' +
      '<div class="rq__head"><h3 class="rq__ttl" id="rq-' + id + '-t">' + U.jp(r.title) + '</h3>' + U.statusTag(r.tag, r.statusLabel) + '</div>' +
      '<p class="rq__meta">' + U.jp(meta.join('・')) + '</p>' +
      '<p class="rq__detail">' + U.jp(r.detail, { br: true }) + '</p>' +
      replyHtml(r) +
      '<div class="rq__foot">' + voteHtml(r) + ownActs(r) + '</div>' +
    '</article>';
  }

  /* ---------- 画面のかたまり ---------- */
  /** 自分が出したもの（状態の早見。押すと一覧のその行へ） */
  function mineSec() {
    var mine = R.requests({ mine: true, sort: 'new' });
    if (!mine.length) return '';
    return '<section class="sec rq-mine" aria-labelledby="rqMineTtl"><h2 class="sec-ttl" id="rqMineTtl">あなたのリクエスト</h2>' +
      '<div class="list">' + mine.map(function (r) {
        // 「＋1が」と数を別の行に割らない
        var sub = U.jp(r.kindLabel) + '・<span class="nw">＋1が' + U.num(r.votes) + '人</span>・' + esc(U.fmtShort(r.at));
        return '<a class="li rq-mine__row" href="' + esc(r.href) + '" data-rq-go="' + esc(r.id) + '">' +
          '<span class="li__body"><span class="li__ttl">' + U.jp(r.title) + '</span><span class="li__sub">' + sub + '</span></span>' +
          '<span class="li__end">' + U.statusTag(r.tag, r.statusLabel) + '</span>' + U.chevron() + '</a>';
      }).join('') + '</div></section>';
  }
  /** 開いた時点で新しかった返事の数と、いちばん新しいものへのリンク */
  function freshNote() {
    var ids = Object.keys(view.fresh);
    if (!ids.length) return '';
    var rows = ids.map(function (id) { return R.request(id); }).filter(Boolean)
      .sort(function (a, b) { return new Date(b.answeredAt || 0) - new Date(a.answeredAt || 0); });
    if (!rows.length) return '';
    return '<div class="notice rq-fresh">' + icon('chat') +
      // 出した・＋1したものへの返事だけが数に入る（せまい幅で文が細切れにならないよう短く）
      '<p class="rq-fresh__txt">運営から新しい返事が<b class="num nw">' + rows.length + '件</b>あります。</p>' +
      '<a class="btn btn-text btn-s" href="' + esc(rows[0].href) + '" data-rq-go="' + esc(rows[0].id) + '">見る</a></div>';
  }
  function tabsHtml() {
    return '<div class="seg rq-tabs" role="group" aria-label="表示するリクエスト">' + TABS.map(function (t) {
      var on = view.tab === t[0];
      return '<button type="button" class="' + (on ? 'is-on' : '') + '" aria-pressed="' + on + '" data-rq-tab="' + t[0] + '">' + t[1] + '</button>';
    }).join('') + '</div>';
  }
  function chipsHtml() {
    var all = rowsFor(view.tab, 'all');
    var chips = [['all', 'すべて']].concat(kinds().map(function (k) { return [k.id, k.name]; }));
    return '<div class="chips rq-kinds" role="group" aria-label="種類で絞り込む">' + chips.map(function (c) {
      var on = view.kind === c[0];
      var n = c[0] === 'all' ? all.length : all.filter(function (r) { return r.kind === c[0]; }).length;
      return '<button type="button" class="chip' + (on ? ' is-on' : '') + '" aria-pressed="' + on + '" data-rq-kind="' + esc(c[0]) + '">' +
        esc(c[1]) + '<span class="n num">' + n + '</span></button>';
    }).join('') + '</div>';
  }
  function emptyHtml() {
    var k = view.kind !== 'all' ? kindName(view.kind) : '';
    if (view.tab === 'done') {
      return U.empty('chat', 'まだ対応済みの' + (k ? k + 'の' : '') + 'リクエストはありません。',
        k ? '<button type="button" class="btn btn-soft btn-s" data-rq-kind="all">すべて表示</button>' : '');
    }
    // 人気順・新着には検討中も並ぶので「受付中・検討中」と書く
    return U.empty('chat', '受付中・検討中の' + (k ? k + 'の' : '') + 'リクエストはありません。',
      '<button type="button" class="btn btn-soft btn-s" data-rq-new="' + esc(view.kind !== 'all' ? view.kind : '') + '">' +
        (k ? k + 'をリクエストする' : 'リクエストを出す') + '</button>');
  }
  function boardSec() {
    var rows = rowsFor(view.tab, view.kind);
    return '<section class="sec rq-board" aria-labelledby="rqBoardTtl">' +
      '<h2 class="sec-ttl" id="rqBoardTtl" tabindex="-1">みんなのリクエスト</h2>' +
      '<div class="rq-bar">' + tabsHtml() + chipsHtml() + '</div>' +
      (rows.length ? '<div class="card rq-list">' + rows.map(row).join('') + '</div>' : '<div class="card rq-empty">' + emptyHtml() + '</div>') +
    '</section>';
  }

  /** ?focus= で来たとき：その行が見えるタブと種類にする（mount で送る）。見つからなければ一言で知らせる */
  function takeFocus(id) {
    var r = id ? R.request(id) : null;
    view.focus = null; view.miss = false;
    if (!id) return;
    if (!r) { view.miss = true; return; }
    if (!isActive(r)) view.tab = 'done';
    else if (view.tab === 'done') view.tab = 'popular';
    if (view.kind !== 'all' && view.kind !== r.kind) view.kind = 'all';
    view.focus = r.id;
  }

  /** #/requests/<id>（運営画面と同じ形のアドレス）：あるリクエストなら ?focus= の形へ、無ければ「ページが見つかりません」 */
  function paramId(ctx) { return ctx && ctx.params && ctx.params[0] ? String(ctx.params[0]) : ''; }

  CLG.screens.requests = {
    title: function (ctx) { var pid = paramId(ctx); return pid && !R.request(pid) ? 'ページが見つかりません' : 'リクエスト'; },
    back: function (ctx) { return paramId(ctx) ? { href: '#/requests', label: 'リクエスト' } : null; },
    skeleton: 'list',
    render: function (ctx) {
      var q = ctx.query || {}, pid = paramId(ctx);
      if (pid && !R.request(pid)) return U.notFound({ lead: 'このリクエストは見つかりませんでした。消されたか、アドレスが違います。' });
      // 見る人が替わったら、前の人の切り替えと印を持ち越さない
      var owner = R.me().id;
      if (view.owner !== owner) { view.owner = owner; view.tab = 'popular'; view.kind = 'all'; view.fresh = {}; view.qk = null; }
      // ?tab=popular|new|done と ?kind=gig|course|event（?new=1 のときの kind はフォームの種類なので、絞り込みには使わない）
      var qKind = q['new'] ? '' : String(q.kind || ''), qk = String(q.tab || '') + '|' + qKind;
      if (qk !== view.qk) {
        view.qk = qk;
        if (TABS.some(function (t) { return t[0] === q.tab; })) view.tab = q.tab;
        if (qKind === 'all' || kindName(qKind)) view.kind = qKind;
      }
      if (q.focus) takeFocus(String(q.focus));
      // 自分が出した・＋1したものに来た、まだ見ていない返事（mount で見た印を付けても、この画面にいるあいだは印を残す）
      R.requests().forEach(function (r) { if (r.updated) view.fresh[r.id] = true; });
      return '<div class="scr-requests">' +
        '<div class="page-head rq-head">' +
          '<h1 class="page-ttl" data-page-title tabindex="-1">リクエスト</h1>' +
          '<button type="button" class="btn btn-primary rq-post" data-rq-new="">' + icon('plus', 'ico-s') + '<span>リクエストを出す</span></button>' +
          '<p class="page-lead">欲しい案件・講座・イベントを運営に出せます。<span class="nw">＋1</span>の多いものから検討します。</p>' +
        '</div>' +
        freshNote() +
        mineSec() +
        boardSec() +
      '</div>';
    },
    mount: function (root, ctx) {
      cur = ctx;
      var el = root.querySelector('.scr-requests');
      if (!el) return;
      var q = ctx.query || {}, pid = paramId(ctx);
      // #/requests/<id>：履歴を増やさずに ?focus= の形へ移す（そこでタブを切り替えて送る）
      if (pid) { try { location.replace('#/requests?focus=' + encodeURIComponent(pid)); return; } catch (e) {} }
      // 返事を見た印（メニューの数が消える）。同じタブの書き換えは骨組みが描き直さないので、この画面の印はそのまま
      R.markRequestsSeen();
      if (q.focus || q['new']) {
        // 描き直しのたびに同じことをしないよう、URL から目印を外す（hashchange は起きない）
        try { history.replaceState(history.state, '', '#/requests'); } catch (e) {}
      }
      if (view.miss) { view.miss = false; U.toast('このリクエストは見つかりませんでした。消されたか、アドレスが違います', 'error'); }
      if (view.focus) {
        var id = view.focus; view.focus = null;
        // 帯の知らせ（骨組み）が入って位置がずれてから動かす
        setTimeout(function () { var r = document.getElementById('rq-' + id); if (r && r.isConnected) { flash(r); U.smoothScroll(r, { block: 'center', focus: true }); } }, 0);
      } else if (q['new']) {
        var k = String(q.kind || '');
        setTimeout(function () { openForm(null, kinds().some(function (x) { return x.id === k; }) ? k : ''); }, 0);
      }
      // せまい画面では絞り込みが横に流れる。選んでいる札が見える位置まで送っておく
      var strip = el.querySelector('.rq-kinds'), on = strip && strip.querySelector('.is-on');
      if (on && strip.scrollWidth > strip.clientWidth) strip.scrollLeft = Math.max(0, on.offsetLeft - 16);
      if (root.__boundRequests) return;
      root.__boundRequests = true;
      root.addEventListener('click', onClick);
    }
  };

  /* ---------- 押したとき ---------- */
  function flash(el) {
    el.classList.remove('is-target'); void el.offsetWidth; el.classList.add('is-target');
    setTimeout(function () { el.classList.remove('is-target'); }, 2400);
  }
  function onClick(ev) {
    var t = ev.target;
    if (!t || !t.closest || !t.closest('.scr-requests') || !cur) return;
    var b;
    if ((b = t.closest('[data-rq-tab]'))) { view.tab = b.getAttribute('data-rq-tab'); cur.refresh(); return; }
    if ((b = t.closest('[data-rq-kind]'))) { view.kind = b.getAttribute('data-rq-kind'); cur.refresh(); return; }
    if ((b = t.closest('[data-rq-new]'))) { openForm(null, b.getAttribute('data-rq-new') || ''); return; }
    if ((b = t.closest('[data-rq-vote]'))) { vote(b); return; }
    if ((b = t.closest('[data-rq-edit]'))) { openForm(b.getAttribute('data-rq-edit')); return; }
    if ((b = t.closest('[data-rq-del]'))) { askRemove(b.getAttribute('data-rq-del')); return; }
    // 同じ画面の中の行へ：URL を変えずに、その行のタブへ切り替えて送る（戻るで同じ画面が積み重ならないように）
    if ((b = t.closest('[data-rq-go]'))) {
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button > 0) return;
      ev.preventDefault();
      takeFocus(b.getAttribute('data-rq-go'));
      cur.refresh();
      var id = view.focus; view.focus = null;
      var r = id && document.getElementById('rq-' + id);
      if (r) { flash(r); U.smoothScroll(r, { block: 'center', focus: true }); }
    }
  }
  /** ＋1：押した行だけをその場で直す（並びは次に開いたときに変わる） */
  function vote(b) {
    var id = b.getAttribute('data-rq-vote'), res = R.toggleVote(id);
    if (!res || !res.ok) { U.toast((res && res.error) || '＋1できませんでした', 'error'); cur.refresh(); return; }
    b.setAttribute('aria-pressed', String(!!res.voted));
    b.setAttribute('aria-label', voteLabel({ votes: res.votes }));
    var n = b.querySelector('[data-rq-n]');
    if (n) n.textContent = U.num(res.votes);
    // 絞り込みの札の数は変わらない（＋1で状態は変わらない）ので描き直さない
    CLG.app.announce(res.voted ? '＋1しました。' + res.votes + '人です' : '＋1を外しました。' + res.votes + '人です');
  }
  function askRemove(id) {
    var r = R.request(id);
    if (!r || !r.canEdit) { U.toast('このリクエストは消せません', 'error'); cur.refresh(); return; }
    U.confirmBox('リクエストを消しますか', '「' + r.title + '」を消します。付いていた＋1もなくなります。', '消す', true).then(function (ok) {
      if (!ok) return;
      var res = R.removeRequest(id);
      if (!res || !res.ok) { U.toast((res && res.error) || '消せませんでした', 'error'); cur.refresh(); return; }
      cur.refresh();
      // 消した行のボタンはもう無いので、一覧の見出しへ焦点を置く
      var h = document.getElementById('rqBoardTtl');
      if (h) { try { h.focus({ preventScroll: true }); } catch (e) { h.focus(); } }
      U.toast('リクエストを消しました', 'ok');
    });
  }

  /* ---------- 出す・直すフォーム（窓） ---------- */
  function countHtml(name, v, max) {
    var n = String(v || '').length;
    return '<small class="rq-count' + (n > max ? ' is-over' : '') + '" id="rqCount-' + name + '" data-rq-count="' + name + '" data-max="' + max + '">' +
      '<span class="num">' + n + '</span>/' + max + '文字</small>';
  }
  function formHtml(d, editing) {
    var radios = kinds().map(function (k, i) {
      return '<label class="check"><input type="radio" name="kind" value="' + esc(k.id) + '"' + (d.kind === k.id ? ' checked' : '') + (i === 0 ? ' required' : '') + '>' +
        '<span>' + esc(k.name) + '</span></label>';
    }).join('');
    return '<form class="rq-form" id="rqForm" novalidate>' +
      (editing || !reqPt() ? '' : '<p class="rq-form__lead">運営が追加したら、出した人に貢献ポイント <b class="num nw">+' + U.num(reqPt()) + 'pt</b>。<span class="nw">＋1</span>や、出しただけでは付きません。</p>') +
      '<fieldset class="field rq-form__kinds" data-field><legend class="field__label">種類</legend><div class="rq-radios">' + radios + '</div></fieldset>' +
      '<div class="field"><label class="field__label" for="rqTitle">題</label>' +
        '<input class="input" id="rqTitle" name="title" required autocomplete="off" aria-describedby="rqCount-title" placeholder="' + esc(PH[d.kind] || '例：在宅でできるデータ入力') + '" value="' + esc(d.title) + '">' +
        countHtml('title', d.title, TITLE_MAX) + '</div>' +
      '<div class="rq-dup" data-rq-dupbox hidden></div>' +
      '<div class="field"><label class="field__label" for="rqDetail">中身</label>' +
        '<textarea class="textarea" id="rqDetail" name="detail" rows="5" required aria-describedby="rqCount-detail" placeholder="例：平日の夜に1〜2時間ずつできるものがあるとうれしいです。">' + esc(d.detail) + '</textarea>' +
        countHtml('detail', d.detail, DETAIL_MAX) + '</div>' +
      '<div class="field rq-form__anon" data-field><label class="check"><input type="checkbox" name="anonymous"' + (d.anonymous ? ' checked' : '') + '>' +
        '<span>名前を出さない（匿名）</span></label><small>ほかの会員には「匿名」と出ます。運営には名前が見えます。</small></div>' +
    '</form>';
  }
  /** 開く。id があれば自分のリクエストを直す（受付中だけ）。kind は種類を選んだ状態で開くとき */
  function openForm(id, kind) {
    var r = id ? R.request(id) : null;
    if (id && (!r || !r.canEdit)) { U.toast(r ? r.statusLabel + 'のリクエストは直せません' : 'リクエストが見つかりません', 'error'); cur && cur.refresh(); return; }
    if (view.open && view.open.parentNode) return;
    var d = r ? { kind: r.kind, title: r.title, detail: r.detail, anonymous: r.anonymous } : { kind: kind || '', title: '', detail: '', anonymous: false };
    var m = U.modal(formHtml(d, !!r), {
      title: r ? 'リクエストを直す' : 'リクエストを出す', cls: 'scr-requests rq-modal', dirty: true,
      foot: '<button type="button" class="btn btn-soft" data-close>やめる</button>' +
        '<button type="submit" form="rqForm" class="btn btn-primary">' + (r ? '保存する' : '出す') + '</button>',
      onClose: function () { if (view.open === m) view.open = null; }
    });
    view.open = m;
    // 最初の焦点は窓に任せる（パソコンは題の欄。スマホはキーボードを出さないよう「やめる」）
    var f = m.querySelector('#rqForm');
    U.fieldErrors(f, {}, { focus: false });   // 必須の札だけ先に付ける（ほかのフォームと同じ）
    f.addEventListener('input', function (ev) { onInput(f, ev.target); });
    f.addEventListener('change', function (ev) {
      if (ev.target.name !== 'kind') return;
      var ti = f.querySelector('#rqTitle');
      if (ti && PH[ev.target.value]) ti.setAttribute('placeholder', PH[ev.target.value]);
      if (f.__tried) U.fieldErrors(f, { kind: '' }, { focus: false });
    });
    f.addEventListener('submit', function (ev) { ev.preventDefault(); submit(f, m, r); });
    m.addEventListener('click', function (ev) {
      var b = ev.target.closest && ev.target.closest('[data-rq-dup]');
      if (!b) return;
      // 同じ題のリクエストへ：窓を閉じて、その行へ送る（＋1をすすめる）
      var dupId = b.getAttribute('data-rq-dup');
      m.close();
      takeFocus(dupId);
      cur.refresh();
      var fid = view.focus; view.focus = null;
      var row = fid && document.getElementById('rq-' + fid);
      if (row) { flash(row); U.smoothScroll(row, { block: 'center', focus: true }); }
    });
  }
  function textLen(name, v) { v = String(v || '').trim(); return (name === 'title' ? v.replace(/\s+/g, ' ') : v).length; }
  /** 打つたびに文字の数を直す。一度「出す」を押したあとは、直した欄の誤りもその場で直す */
  function onInput(f, el) {
    if (!el || (el.name !== 'title' && el.name !== 'detail')) return;
    var max = el.name === 'title' ? TITLE_MAX : DETAIL_MAX, n = textLen(el.name, el.value);
    var c = f.querySelector('[data-rq-count="' + el.name + '"]');
    if (c) { c.querySelector('.num').textContent = n; c.classList.toggle('is-over', n > max); }
    if (!f.__tried) return;
    var e = {};
    e[el.name] = !n ? (el.name === 'title' ? '題を入れてください' : '中身を入れてください') : n > max ? max + '文字までにしてください（いま' + n + '文字）' : '';
    U.fieldErrors(f, e, { focus: false });
    if (el.name === 'title') dupBox(f, null);
  }
  function readForm(f) {
    var k = f.querySelector('input[name="kind"]:checked');
    return { kind: k ? k.value : '', title: f.elements.title.value, detail: f.elements.detail.value, anonymous: !!f.elements.anonymous.checked };
  }
  /** 同じ題のリクエストがあるとき：その題と状態、そこへ移るボタン */
  function dupBox(f, dupId) {
    var box = f.querySelector('[data-rq-dupbox]'), r = dupId ? R.request(dupId) : null;
    if (!box) return;
    if (!r) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    box.innerHTML = '<p class="rq-dup__txt">' + U.jp('「' + r.title + '」') + '<span class="nw">（' + esc(r.statusLabel) + '・＋1が' + r.votes + '人）</span></p>' +
      '<button type="button" class="btn btn-soft btn-s" data-rq-dup="' + esc(r.id) + '">そのリクエストを見る</button>';
  }
  function submit(f, m, r) {
    f.__tried = true;
    var data = readForm(f);
    var res = r ? R.editRequest(r.id, data) : R.addRequest(data);
    if (!res || !res.ok) {
      if (res && res.errors) {
        var errs = Object.assign({ kind: '', title: '', detail: '' }, res.errors), dup = res.duplicate && R.request(res.duplicate);
        // 同じ題：＋1できないもの（自分の・対応が済んだもの）と、もう＋1したものは「＋1できます」と言わない
        if (dup && errs.title) {
          errs.title = dup.mine ? '同じ題のリクエストを、もう出しています' : dup.voted ? '同じ題のリクエストがあります。もう＋1しています'
            : dup.canVote ? errs.title : '同じ題のリクエストがあります（' + dup.statusLabel + '）';
        }
        U.fieldErrors(f, errs);
        dupBox(f, res.duplicate);
        return;
      }
      // 直しているあいだに運営が返事をした（受付中でなくなった）など
      m.close();
      U.toast((res && res.error) || '保存できませんでした', 'error');
      cur.refresh();
      return;
    }
    var row = res.request;
    m.close();
    if (!r) view.tab = 'new';
    if (view.kind !== 'all' && view.kind !== row.kind) view.kind = 'all';
    cur.refresh();
    var el = document.getElementById('rq-' + row.id);
    if (el) { flash(el); U.smoothScroll(el, { block: 'center', focus: true }); }
    U.toast(r ? 'リクエストを直しました' : 'リクエストを出しました。運営から返事があればお知らせします', 'ok');
  }
})();
