/* ============================================================
   運営画面：タイムライン・お知らせ（#/feed ?tab=posts|reports|staff|notices|line）
   ------------------------------------------------------------
   - 投稿：すべての投稿（デモ会員の投稿も）。非表示にする・注意する・質問への回答に選ぶ（R.markAnswer）。
   - 見回り（?tab=reports）：通報の対応（非表示・注意・対応不要）、収入をうたう言葉の自動の印
     （R.checkBanned と「月◯万円」。「不労所得」「必ず稼げる」など）、自動で止めた投稿の公開・止めたまま。
     デモ会員への注意は R.staffReply（会員ページの「相談・メッセージ」に届く）。
   - 運営の投稿：種類・固定・リンク・公開の日時（予約）。出したあと・予約のままでも直せる・取り下げられる。
   - 固定：どの投稿も（data.js の投稿・会員の投稿・運営の投稿）。会員のタイムラインの先頭に並ぶ。
   - お知らせ：右上の鈴に出すお知らせを、届け先（全員・入会30日以内・入会月・Lv・会員1人）を決めて出す（R.publishNotice）。予約もできる。
   - LINE：公式LINEの一斉送信（予約・送った記録）。試作版は送らず記録だけ残す。
   会員ページに効くもの（正本は会員ページの記録。見る人を切り替えても残る）：
     非表示・表示に戻す（R.hidePost / R.unhidePost）、コメントを隠す・戻す（R.hideComment / R.unhideComment。どちらも
     デモ会員の投稿・コメントなら本人にお知らせ＝返り値の notified）、通報の対応（デモ会員の通報は R.resolveReport。
     ほかの会員の通報で非表示にしたら R.hidePost）、固定（R.pinPost / R.unpinPost。いまの固定は R.pinnedPosts()）、
     運営の投稿（R.addStaffPost。予約は at に先の時刻 → その時刻まで会員に出ない。直す R.updateStaffPost・取り下げる R.removeStaffPost）、
     お知らせ（R.cmsUpsert('notice')：会員ページの鈴に出る。予約は publishAt。取り消しは R.cmsRemove）。
   運営の保存：AD.db.state.feedOps { hidden{ 投稿: { at, by（隠した運営）, reason, report? } }, held[], flagsDone{}, reportStatus{},
     warned[], scheduled[]（予約したお知らせ）, line[] }。前の版の staffPosts[]・pins{} は、開いたときに会員ページの記録へ1回だけ移す（migrate）
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, AD = CLG.admin, AU = AD.ui, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon;
  var cur = null;
  var MIN = 60000, DAY = 86400000;
  function cms() { return AD.cms; }
  var KIND = { news: 'お知らせ', 'new': '新着', gig: '案件', event: 'イベント', win: '成果', post: '近況', question: '質問', intro: '自己紹介' };
  var STAFF_KINDS = [['news', 'お知らせ'], ['new', '新着'], ['gig', '案件'], ['event', 'イベント']];
  var LINKS = [['', 'なし'], ['#/events', 'イベント'], ['#/gigs', '案件'], ['#/courses', '講座'], ['#/courses?tab=archive', '勉強会の録画'], ['#/start', 'スタートガイド'],
    ['#/perks', '福利厚生'], ['#/perks?tab=experts', '専門家'], ['#/referral', '紹介'], ['#/ranking', 'ランキング'], ['#/messages', '相談・メッセージ'], ['custom', 'ほかのページ（#/… を入れる）']];

  var K = 'feedOps';
  function ago(m) { return new Date(CLG.now().getTime() - m * MIN).toISOString(); }
  /* はじめて開いたときのデモ：自動で止めた投稿2件と、LINE の一斉送信の記録 */
  function empty() {
    var r = DATA.rng(20260925), rows = DATA.ROSTER.filter(function (m) { return m.status === 'active' && !m.person && m.joinedDaysAgo > 20 && m.joinedDaysAgo < 120; });
    function pick() { return rows.splice(Math.floor(r() * rows.length), 1)[0] || DATA.ROSTER[0]; }
    var a = pick(), b = pick();
    var t17 = new Date(CLG.now()); t17.setHours(17, 0, 0, 0);
    return {
      hidden: {}, flagsDone: {}, reportStatus: {}, warned: [], scheduled: [],
      held: [
        { id: 'hd1', no: a.no, kind: 'post', at: ago(95), status: 'held',
          text: '在宅で不労所得をつくる方法、知りたい人いますか？ 私は3か月で月20万円になりました。気になる人はコメントください。' },
        { id: 'hd2', no: b.no, kind: 'post', at: ago(26 * 60 + 40), status: 'held',
          text: '友だちに紹介するだけで毎月お金が入る仕組みがあります。オンラインの説明会は無料です。' }
      ],
      line: [
        { id: 'ln1', target: 'all', text: '10月の予定を会員ページに載せました。オリエンテーションと成果発表会の日にちを見てください。', at: DATA.D(-10, 12, 0), by: 'staff2', status: 'sent' },
        { id: 'ln2', target: 'new30', text: '新入生オリエンテーションは毎週水曜20:00からです。予約はイベントのページから。', at: DATA.D(-6, 19, 0), by: 'staff2', status: 'sent' },
        { id: 'ln3', target: 'lv>=3', text: 'Instagram添削会（9/28）は満席です。キャンセル待ちを受け付けています。', at: DATA.D(-3, 12, 30), by: 'staff4', status: 'sent' },
        { id: 'ln4', target: 'all', text: '今夜20:00から月末の成果発表会です。見るだけでも参加できます。', at: t17.toISOString(), by: 'staff2', status: t17 > CLG.now() ? 'scheduled' : 'sent' }
      ]
    };
  }
  function box() { return cms().box(K, empty); }
  function save(fn) { return cms().save(K, empty, fn); }
  function me() { return (AD.db.staff() || {}).id; }
  function nowIso() { return CLG.now().toISOString(); }
  function liveNo() { return AD.data.live().no; }

  /* 投稿した人の会員番号（運営は null） */
  function noOf(by) {
    if (by === 'me') return liveNo();
    var s = CLG.store.state;
    if (s.me && s.me.personId === by) return liveNo();
    var p = DATA.PEOPLE[by];
    return p && !p.staff ? p.no || null : DATA.ROSTER_INDEX[by] ? by : null;
  }
  function isStaff(by) { return !!(DATA.PEOPLE[by] && DATA.PEOPLE[by].staff); }
  // 一覧・操作の記録に出す頭の部分（改行は空白にして、1行目が「【10月の予定】」だけの投稿も中身が分かるように）
  function head(t, n) { t = String(t || '').replace(/\s*\n+\s*/g, ' ').trim(); return t.length > (n || 40) ? t.slice(0, n || 40) + '…' : t; }

  /* ---------- 投稿 ---------- */
  /* 隠した投稿：会員ページの記録（R.hidePost・通報の対応）が正本。隠した運営の名前だけ運営の記録から */
  function hiddenOf(id, ops) {
    var m = (CLG.store.state.hiddenPosts || {})[id];
    if (!m) return null;
    var h = (ops || box()).hidden[id];
    return { at: m.at, reason: m.reason || '', by: (h && h.by) || null, report: m.report || (h && h.report) || null };
  }
  /* 固定している投稿（会員ページの記録。data.js で固定の投稿・運営の投稿の固定・R.pinPost の印を合わせたもの） */
  function pinSet() {
    var o = {};
    (R.pinnedPosts ? R.pinnedPosts() : []).forEach(function (id) { o[id] = 1; });
    return o;
  }
  /* 前の版は、運営の投稿（予約も）と固定を運営画面の記録だけに持っていた。会員ページの記録（R.*）へ1回だけ移して消す */
  function migrate() {
    var ops = AD.db.state && AD.db.state[K];
    if (!ops || !AD.db.state.session || (!ops.staffPosts && !ops.pins)) return false;
    var s = CLG.store.state, have = {};
    (s.staffPosts || []).forEach(function (p) { have[p.id] = 1; });
    (ops.staffPosts || []).forEach(function (p) {
      if (have[p.id] || p.status === 'draft' || p.status === 'canceled' || !p.text) return;
      R.addStaffPost({ id: p.id, kind: p.kind, by: p.by, text: p.text, link: p.link || '', pinned: ops.pins && ops.pins[p.id] != null ? !!ops.pins[p.id] : !!p.pinned, at: p.at });
    });
    var pins = pinSet();
    Object.keys(ops.pins || {}).forEach(function (id) {
      var on = !!ops.pins[id];
      if (!!pins[id] !== on && findRaw(id)) { if (on) R.pinPost(id); else R.unpinPost(id); }
    });
    AD.db.update(function (st) { delete st[K].staffPosts; delete st[K].pins; });
    return true;
  }
  function findRaw(id) {
    var s = CLG.store.state;
    return DATA.FEED.some(function (p) { return p.id === id; }) || (s.staffPosts || []).some(function (p) { return p.id === id; }) ||
      (s.posts || []).some(function (p) { return p.id === id; });
  }
  function posts() {
    var s = CLG.store.state, n = CLG.now(), ops = box(), pins = pinSet();
    var list = DATA.FEED.map(function (p) { return Object.assign({ src: 'data' }, p); });
    (s.posts || []).forEach(function (p) { list.push(Object.assign({ by: 'me', src: 'live' }, p, { mine: true })); });
    (s.staffPosts || []).forEach(function (p) { list.push(Object.assign({ src: 'staff', likes: 0, replies: [] }, p)); });
    return list.filter(function (p) { return !(s.deleted || {})[p.id] && new Date(p.at) <= n; }).map(function (p) {
      var ed = (s.postEdits || {})[p.id], text = ed ? ed.text : p.text;
      var no = noOf(p.by);
      return Object.assign({}, p, {
        text: text, edited: !!ed || !!p.editedAt, no: no, staff: isStaff(p.by), author: cms().personName(no || p.by) || cms().personName(p.by),
        flags: isStaff(p.by) ? [] : cms().flags(text), hidden: hiddenOf(p.id, ops),
        pinned: !!pins[p.id],
        likeCount: (p.likes || 0) + ((s.likes || {})[p.id] ? 1 : 0),
        comments: R.commentCount(p.id), live: p.src === 'live' || no === liveNo()
      });
    });
  }
  function findPost(id) { return posts().filter(function (p) { return p.id === id; })[0] || null; }
  function postState(p) {
    if (p.hidden) return U.statusTag('closed', '非表示');
    if (p.flags.length) { var d = box().flagsDone[p.id]; if (!d) return U.statusTag('new', '印あり'); }
    if (p.pinned) return '<span class="ad-st">固定</span>';
    return '<span class="ad-st">公開</span>';
  }
  function whoOf(p) { return p.no ? AU.who(p.no) : cms().personWho(p.by); }

  function postsView(ctx) {
    return AU.table({
      id: 'posts', rows: posts(), query: ctx.query, sort: '-at', label: '投稿',
      filters: [
        { key: 'mark', label: '印', chips: true, options: [['', 'すべて'], ['flag', '印あり'], ['hidden', '非表示'], ['staff', '運営'], ['live', 'デモ会員']],
          match: function (p, v) { return v === 'flag' ? p.flags.length > 0 : v === 'hidden' ? !!p.hidden : v === 'staff' ? p.staff : v === 'live' ? p.live : true; } },
        { key: 'kind', label: '種類', options: [['', 'すべて']].concat(Object.keys(KIND).map(function (k) { return [k, KIND[k]]; })) }
      ],
      search: { placeholder: '本文・投稿した人', keys: ['text', 'author'] },
      columns: [
        AU.col.when('at', '日時', { hide: 'sm' }),
        { key: 'author', label: '投稿した人', html: function (p) { return whoOf(p) + (p.live ? '<span class="a-fd__live">デモ会員</span>' : ''); } },
        { key: 'kind', label: '種類', hide: 'sm', value: function (p) { return KIND[p.kind] || p.kind; } },
        { key: 'text', label: '本文', main: true, sort: false, html: function (p) {
          return '<button type="button" class="a-linkbtn a-fd__text" data-fd-post="' + esc(p.id) + '">' + (p.flags.length ? cms().marks(head(p.text, 70)) : esc(head(p.text, 70))) + '</button>' +
            (p.flags.length ? '<span class="a-fd__flag">' + icon('alert', 'ico-s') + esc(p.flags.join('・')) + '</span>' : '');
        } },
        { key: 'likeCount', label: 'いいね', align: 'r', dir: 'desc', hide: 'md', html: function (p) { return '<span class="num">' + p.likeCount + '</span>'; } },
        { key: 'comments', label: 'コメント', align: 'r', dir: 'desc', hide: 'md', html: function (p) { return '<span class="num">' + p.comments + '</span>'; } },
        { key: 'state', label: '状態', value: function (p) { return p.hidden ? '非表示' : p.flags.length && !box().flagsDone[p.id] ? '印あり' : p.pinned ? '固定' : '公開'; }, html: postState }
      ],
      rowClass: function (p) { return 'is-link' + (p.hidden ? ' is-quiet' : p.flags.length && !box().flagsDone[p.id] ? ' is-alert' : ''); },
      pageSize: 30, csv: { name: 'タイムライン' }, empty: 'まだ投稿はありません。'
    });
  }

  /* 投稿の引き出し（通報から開いたときは rep を渡す） */
  /* 会員ページで隠しているコメント（書いた本人のほかには見えないので R.comments には出ない）をこの投稿の分だけ */
  function hiddenCommentsOf(p, shown) {
    var s = CLG.store.state, hc = s.hiddenComments || {}, seen = {}, out = [];
    shown.forEach(function (c) { seen[c.id] = 1; });
    var raw = DATA.FEED.filter(function (x) { return x.id === p.id; })[0];
    (s.comments || []).filter(function (c) { return c.postId === p.id; }).map(function (c) { return Object.assign({}, c, { by: 'me' }); })
      .concat((raw && raw.replies) || []).forEach(function (c) {
        if (!hc[c.id] || seen[c.id]) return;
        seen[c.id] = 1;
        out.push({ id: c.id, by: c.by, at: c.at, text: c.text, reply: !!c.replyTo, hidden: { at: hc[c.id].at, reason: hc[c.id].reason || '' } });
      });
    return out;
  }
  function postDrawer(p, rep) {
    var cms_ = cms(), comments = R.comments(p.id) || [];
    var flat = [];
    comments.forEach(function (c) { flat.push(c); (c.replies || []).forEach(function (r) { flat.push(Object.assign({ reply: true }, r)); }); });
    flat = flat.concat(hiddenCommentsOf(p, flat)).sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
    var canC = AU.can('content');
    var isQ = p.kind === 'question';
    var body = '<div class="a-fd__author">' + whoOf(p) + (p.live ? '<span class="a-fd__live">デモ会員</span>' : '') +
      '<span class="a-fd__meta">' + esc(KIND[p.kind] || '') + '・<time datetime="' + esc(p.at) + '">' + esc(U.fmtShort(p.at, true)) + '</time>' + (p.edited ? '・編集済み' : '') + '</span></div>' +
      (rep ? '<div class="notice notice-warn a-fd__rep">' + icon('alert') + '<div>通報：<b>' + esc(rep.reason) + '</b>（' + esc(cms_.personName(rep.by)) + 'さん・' + esc(U.fmtShort(rep.at, true)) + '）</div></div>' : '') +
      (p.flags.length ? '<div class="notice notice-warn a-fd__rep">' + icon('alert') + '<div>自動の印：<b>' + esc(p.flags.join('・')) + '</b></div></div>' : '') +
      (p.hidden ? '<div class="notice a-fd__rep">' + icon('info') + '<div>非表示にしています（' + esc(U.fmtShort(p.hidden.at, true)) + (p.hidden.by ? '・' + esc(AD.db.staffName(p.hidden.by)) : '') + '）' +
        (p.hidden.reason ? '：' + esc(p.hidden.reason) : '') + '</div></div>' : '') +
      '<p class="a-fd__body">' + cms_.marks(p.text, { br: true }) + '</p>' +
      ((p.images || []).length ? '<div class="a-fd__imgs">' + p.images.map(function (im) { return '<img src="' + esc(im.src) + '" alt="' + esc(im.alt || '') + '" loading="lazy">'; }).join('') + '</div>' : '') +
      '<p class="a-fd__counts"><span class="num">' + p.likeCount + '</span> いいね・<span class="num">' + p.comments + '</span> コメント</p>' +
      (flat.length ? '<h3 class="a-fd__h">コメント</h3><ul class="a-fd__cmts">' + flat.map(function (c) {
        var canAns = isQ && !c.answer && !c.reply && !c.hidden;
        var staffC = isStaff(c.by);
        return '<li class="' + (c.reply ? 'is-reply' : '') + (c.answer ? ' is-ans' : '') + (c.hidden ? ' is-hidden' : '') + '">' +
          '<div class="a-fd__crow">' + cms_.personWho(c.by === 'me' ? 'me' : c.by, { size: 'xs' }) + '<time class="num" datetime="' + esc(c.at) + '">' + esc(U.relTime(c.at)) + '</time>' +
            (c.answer ? '<span class="a-fd__ans">' + icon('check', 'ico-s') + '回答</span>' : '') +
            (c.hidden ? U.statusTag('closed', '非表示') : '') + '</div>' +
          '<p>' + cms_.marks(c.text, { br: true }) + '</p>' +
          (c.hidden && c.hidden.reason ? '<p class="a-fd__sub">隠した理由：' + esc(c.hidden.reason) + '</p>' : '') +
          ((canAns || !staffC) ? '<div class="a-fd__cacts">' +
            (canAns ? '<button type="button" class="btn btn-text btn-s" data-fd-answer="' + esc(c.id) + '"' + (canC ? '' : ' disabled') + '>回答に選ぶ</button>' : '') +
            (staffC ? '' : c.hidden ? '<button type="button" class="btn btn-text btn-s" data-fd-cunhide="' + esc(c.id) + '"' + (canC ? '' : ' disabled') + '>表示に戻す</button>'
              : '<button type="button" class="btn btn-text btn-s a-fd__cdel" data-fd-chide="' + esc(c.id) + '"' + (canC ? '' : ' disabled') + '>コメントを隠す</button>') +
          '</div>' : '') +
        '</li>';
      }).join('') + '</ul>' + (isQ ? '<p class="a-fd__hint">回答に選ぶと、書いた人に貢献ポイント +' + ((DATA.POINT_RULES.filter(function (x) { return x.id === 'answer'; })[0] || {}).pt || 10) + 'pt。</p>' : '') : '');
    // 掲載（非表示・固定・注意）は代表・運営だけ（講師は自分の講座とイベントだけなので、タイムラインは見るだけ）
    var dis = canC ? '' : ' disabled';
    var repC = rep && rep.commentId ? flat.filter(function (c) { return c.id === rep.commentId; })[0] : null;
    var foot = '<a class="btn btn-text" href="' + esc(AD.data.memberHref('#/feed/' + encodeURIComponent(p.id) + (rep && rep.commentId ? '?c=' + encodeURIComponent(rep.commentId) : ''))) + '" target="_blank" rel="noopener">' + icon('external', 'ico-s') + '会員ページで見る</a>' +
      (rep && rep.status === '受付' ? '<button type="button" class="btn btn-ghost" data-fd-dismiss' + dis + '>対応不要</button>' : '') +
      (rep && rep.status !== '受付' ? '<button type="button" class="btn btn-ghost" data-fd-reopen' + dis + '>受付に戻す</button>' : '') +
      (!p.staff && p.no ? '<button type="button" class="btn btn-ghost" data-fd-warn' + dis + '>注意する</button>' : '') +
      // 運営画面から出した投稿（会員ページの記録）は直す・取り下げる。data.js の投稿と会員の投稿は隠す
      (p.src === 'staff' ? '<button type="button" class="btn btn-ghost" data-fd-sedit' + dis + '>直す</button>' : '') +
      (!p.hidden ? '<button type="button" class="btn btn-ghost" data-fd-pin' + dis + '>' + (p.pinned ? '固定を外す' : '固定する') + '</button>' : '') +
      // コメントの通報は、そのコメントを隠す（投稿はそのまま）
      (repC ? (repC.hidden ? '' : '<button type="button" class="btn btn-danger" data-fd-chide="' + esc(repC.id) + '"' + dis + '>コメントを隠す</button>') :
        p.src === 'staff' && !p.hidden ? '<button type="button" class="btn btn-danger" data-fd-sremove' + dis + '>取り下げる</button>' :
        p.hidden ? '<button type="button" class="btn btn-ink" data-fd-unhide' + dis + '>表示に戻す</button>' : '<button type="button" class="btn btn-danger" data-fd-hide' + dis + '>非表示にする</button>');
    var dw = AU.drawer((canC ? '' : AU.roleNote('content', 'タイムラインの対応', { strict: true })) + body, { title: rep ? (rep.commentId ? '通報されたコメント' : '通報された投稿') : '投稿', cls: 'a-feed', foot: foot });
    dw.addEventListener('click', function (e) {
      var b = e.target.closest('[data-fd-answer],[data-fd-dismiss],[data-fd-reopen],[data-fd-warn],[data-fd-hide],[data-fd-unhide],[data-fd-pin],[data-fd-chide],[data-fd-cunhide],[data-fd-sedit],[data-fd-sremove]'); if (!b || b.disabled) return;
      if (!AU.need('content')) return;
      if (b.hasAttribute('data-fd-sedit') || b.hasAttribute('data-fd-sremove')) {
        var sp = staffPost(p.id);
        dw.close();
        if (!sp) { U.toast('この投稿は見つかりません', 'error'); return; }
        if (b.hasAttribute('data-fd-sedit')) staffPostForm(sp); else removeStaff(sp);
        return;
      }
      if (b.hasAttribute('data-fd-chide') || b.hasAttribute('data-fd-cunhide')) {
        var cid = b.getAttribute('data-fd-chide') || b.getAttribute('data-fd-cunhide');
        var c0 = flat.filter(function (c) { return c.id === cid; })[0] || { id: cid, text: '' };
        dw.close();
        if (b.hasAttribute('data-fd-chide')) hideComment(p, c0, rep && rep.commentId === cid ? rep : null); else unhideComment(p, c0);
        return;
      }
      if (b.hasAttribute('data-fd-answer')) {
        var res = R.markAnswer(b.getAttribute('data-fd-answer'));
        if (!res) { U.toast('回答に選べませんでした', 'error'); return; }
        AD.db.audit({ action: 'answer', label: '質問の回答に選んだ', target: { type: 'post', id: p.id, name: head(p.text, 24) }, detail: (res.to && res.to.name ? res.to.name : '') + (res.pt ? '・+' + res.pt + 'pt' : '') });
        dw.close();
        U.toast((res.to && res.to.name ? res.to.name + 'さんの' : '') + 'コメントを回答に選びました' + (res.pt ? '（+' + res.pt + 'pt）' : ''), 'ok');
        cur.refresh();
        return;
      }
      dw.close();
      if (b.hasAttribute('data-fd-dismiss')) setReport(rep, '対応不要', '');
      else if (b.hasAttribute('data-fd-reopen')) setReport(rep, '受付', '');
      else if (b.hasAttribute('data-fd-warn')) warn(p, rep);
      else if (b.hasAttribute('data-fd-hide')) hide(p, rep);
      else if (b.hasAttribute('data-fd-unhide')) unhide(p);
      else pin(p);
    });
  }
  /* 通報の状態を変える。デモ会員の通報は R.resolveReport（非表示で投稿・コメントを隠し、受付に戻すと戻す。通報した会員にお知らせ）。
     ほかの会員の通報は運営の記録で、非表示なら R.hidePost（会員ページのタイムラインからも消える）。quiet：一言を出さない */
  function setReport(rep, status, why, quiet) {
    if (!rep) return { ok: false };
    var was = rep.status, at = nowIso();
    if (rep.live) {
      var r = R.resolveReport(rep.id, status, why);
      if (!r || r.ok === false) { U.toast((r && r.error) || '通報の状態を変えられませんでした', 'error'); return r || { ok: false }; }
      save(function (b) { b.reportStatus[rep.id] = { status: status, at: at, by: me() }; if (status === '非表示' && !rep.commentId) b.hidden[rep.postId] = { at: at, by: me(), reason: why || rep.reason, report: rep.id }; if (was === '非表示' && status === '受付' && b.hidden[rep.postId] && b.hidden[rep.postId].report === rep.id) delete b.hidden[rep.postId]; });
    } else {
      AD.db.update(function (s) {
        var x = (s.reports || []).filter(function (y) { return y.id === rep.id; })[0];
        if (x) { x.status = status; x.doneAt = status === '受付' ? null : at; x.doneBy = status === '受付' ? null : me(); }
      });
      if (status === '非表示') {
        if (rep.commentId) R.hideComment(rep.commentId, why || rep.reason);
        else { R.hidePost(rep.postId, why || rep.reason); save(function (b) { b.hidden[rep.postId] = { at: at, by: me(), reason: why || rep.reason, report: rep.id }; }); }
      } else if (was === '非表示') {
        // この通報で隠したものは戻す
        if (rep.commentId) { if ((CLG.store.state.hiddenComments || {})[rep.commentId]) R.unhideComment(rep.commentId); }
        else {
          var h = box().hidden[rep.postId];
          if (!h || h.report === rep.id) { if ((CLG.store.state.hiddenPosts || {})[rep.postId]) R.unhidePost(rep.postId); save(function (b) { delete b.hidden[rep.postId]; }); }
        }
      }
    }
    AD.db.audit({ action: 'report', label: status === '受付' ? '通報を受付に戻した' : '通報に対応した', target: { type: 'post', id: rep.postId, name: head((findPost(rep.postId) || {}).text, 24) }, reason: why || '', detail: status + (rep.commentId ? '（コメント）' : '') });
    if (!quiet && status === '対応不要') { U.toast('対応不要にしました' + (rep.live ? '。通報した' + AD.data.live().name + 'さんに知らせが届きます' : ''), 'ok'); cur.refresh(); }
    if (!quiet && status === '受付') { U.toast('受付に戻しました' + (was === '非表示' ? '。隠したものは表示に戻しました' : ''), 'ok'); cur.refresh(); }
    return { ok: true };
  }
  /* 隠したことを書いた人に知らせたか（会員ページの会員の分は R が本人にお知らせを出す。ほかの会員は本番で届く）の一言 */
  function toldText(notified, staffAuthor) {
    return notified ? '書いた人にお知らせしました' : staffAuthor ? '会員のタイムラインからも消えました' : '本番では書いた人にもお知らせが届きます';
  }
  function hide(p, rep) {
    AU.act({
      title: '投稿を非表示にする', ok: '非表示にする', danger: true,
      text: (p.author ? p.author + 'さんの' : '') + '投稿をタイムラインから隠します。' + (p.staff ? '' : '書いた人には理由つきで知らせます。'),
      reasons: ['収入を約束・連想させる書き方', '勧誘・営業', '個人情報が書かれている', '人を傷つける内容'],
      run: function (reason) {
        var notified = false;
        if (rep) {
          var r0 = setReport(rep, '非表示', reason, true);
          if (!r0.ok) return { ok: false, error: '非表示にできませんでした' };
          notified = !!p.live;   // 通報の対応で隠しても、デモ会員の投稿なら本人にお知らせが届く（R.resolveReport / R.hidePost）
        } else {
          var r = R.hidePost(p.id, reason);
          if (!r || r.ok === false) return r || { ok: false, error: '非表示にできませんでした' };
          notified = !!r.notified;
          save(function (b) { b.hidden[p.id] = { at: nowIso(), by: me(), reason: reason }; });
        }
        save(function (b) { b.flagsDone[p.id] = { at: nowIso(), by: me(), action: 'hidden' }; });
        return { ok: true, notified: notified };
      },
      audit: { action: 'post_hide', label: '投稿を非表示にした', target: { type: 'post', id: p.id, name: head(p.text, 24) }, detail: p.author || '' }
    }).then(function (r) {
      if (!r) return;
      U.toast('非表示にしました。' + toldText(r.notified, p.staff), 'ok');
      cur.refresh();
    });
  }
  function unhide(p) {
    var r = (CLG.store.state.hiddenPosts || {})[p.id] ? R.unhidePost(p.id) : { ok: true };
    if (r && r.ok === false) { U.toast(r.error || '戻せませんでした', 'error'); return; }
    save(function (b) { delete b.hidden[p.id]; });
    AD.db.audit({ action: 'post_unhide', label: '投稿を表示に戻した', target: { type: 'post', id: p.id, name: head(p.text, 24) } });
    U.toast('表示に戻しました', 'ok'); cur.refresh();
  }
  /* コメントを隠す・戻す（会員ページでは書いた本人にだけ理由つきで見える） */
  function hideComment(p, c, rep) {
    var own = c.by === 'me' || noOf(c.by) === liveNo(), staffC = isStaff(c.by);
    AU.act({
      title: 'コメントを隠す', ok: '隠す', danger: true,
      text: (c.by === 'me' ? AD.data.live().name + 'さんの' : cms().personName(noOf(c.by) || c.by) ? cms().personName(noOf(c.by) || c.by) + 'さんの' : '') + 'コメント「' + head(c.text, 30) + '」を隠します。書いた本人には理由つきで見えます。',
      reasons: ['収入を約束・連想させる書き方', '勧誘・営業', '個人情報が書かれている', '人を傷つける内容'],
      run: function (reason) {
        if (rep) { var r0 = setReport(rep, '非表示', reason, true); return r0 && r0.ok ? { ok: true, notified: own } : r0; }
        var r = R.hideComment(c.id, reason);
        return r && r.ok !== false ? { ok: true, notified: !!r.notified } : r || { ok: false, error: '隠せませんでした' };
      },
      audit: { action: 'comment_hide', label: 'コメントを隠した', target: { type: 'post', id: p.id, name: head(p.text, 24) }, detail: head(c.text, 24) }
    }).then(function (r) {
      if (!r) return;
      U.toast('コメントを隠しました。' + toldText(r.notified, staffC), 'ok');
      cur.refresh();
    });
  }
  function unhideComment(p, c) {
    var r = R.unhideComment(c.id);
    if (!r || r.ok === false) { U.toast((r && r.error) || '戻せませんでした', 'error'); return; }
    AD.db.audit({ action: 'comment_unhide', label: 'コメントを表示に戻した', target: { type: 'post', id: p.id, name: head(p.text, 24) }, detail: head(c.text, 24) });
    U.toast('コメントを表示に戻しました', 'ok'); cur.refresh();
  }
  function warn(p, rep) {
    var name = p.author || cms().personName(p.no);
    AU.act({
      title: '注意する', ok: '送る', kind: 'ink',
      text: name + 'さんに、運営から1対1のメッセージで伝えます。',
      reasonLabel: '本人に送る文',
      defaultReason: name + 'さん、タイムラインの投稿「' + head(p.text, 20) + '」について運営からです。',
      reasons: ['収入を約束・連想させる書き方（「月◯万円」「不労所得」など）はタイムラインに書けません。書き直しをお願いします。',
        'ほかの会員への勧誘・営業はタイムラインではできません。', '個人が分かる情報が入っていたので、消してください。'],
      run: function (reason) {
        if (p.live) R.staffReply(reason);
        save(function (b) { b.warned.push({ at: nowIso(), by: me(), no: p.no, postId: p.id, text: reason }); b.flagsDone[p.id] = { at: nowIso(), by: me(), action: 'warned' }; });
        if (rep) setReport(rep, '注意', reason, true);
        return { ok: true };
      },
      audit: { action: 'post_warn', label: '投稿した会員に注意した', target: { type: 'member', id: p.no, name: name }, detail: head(p.text, 24) }
    }).then(function (r) {
      if (!r) return;
      U.toast(p.live ? name + 'さんの「相談・メッセージ」に送りました' : '送りました。本番では会員の「相談・メッセージ」に届きます', 'ok');
      cur.refresh();
    });
  }
  /* 固定する・外す（会員ページの記録。data.js の投稿・会員の投稿・運営の投稿のどれでも。会員のタイムラインの先頭に並ぶ） */
  function pin(p) {
    var on = !p.pinned, r = on ? R.pinPost(p.id) : R.unpinPost(p.id);
    if (!r || r.ok === false) { U.toast((r && r.error) || '固定を変えられませんでした', 'error'); return; }
    AD.db.audit({ action: 'post_pin', label: on ? '投稿を固定した' : '投稿の固定を外した', target: { type: 'post', id: p.id, name: head(p.text, 24) } });
    U.toast(on ? '固定しました。会員のタイムラインのいちばん上に出ます' : '固定を外しました', 'ok');
    cur.refresh();
  }
  function flagOk(p) {
    save(function (b) { b.flagsDone[p.id] = { at: nowIso(), by: me(), action: 'ok' }; });
    AD.db.audit({ action: 'flag_ok', label: '自動の印を問題なしにした', target: { type: 'post', id: p.id, name: head(p.text, 24) } });
    U.toast('問題なしにしました', 'ok'); cur.refresh();
  }

  /* ---------- 見回り ---------- */
  function reports() {
    var ops = box();
    return AD.data.queues().reports.map(function (x) {
      // デモ会員の通報の状態は会員ページの記録（R.resolveReport）。運営の記録からは対応した人だけ
      var o = x.live ? ops.reportStatus[x.id] : null;
      var p = findPost(x.postId);
      return Object.assign({}, x, o && x.status !== '受付' ? { doneAt: x.doneAt || o.at, doneBy: o.by } : {}, { post: p, postHead: p ? head(p.text, 50) : '（消された投稿）', author: p ? p.author : '' });
    });
  }
  function flagged() {
    var ops = box();
    return posts().filter(function (p) { return p.flags.length; }).map(function (p) {
      var d = ops.flagsDone[p.id];
      return Object.assign(p, { flagState: p.hidden ? 'hidden' : d ? d.action : 'open' });
    });
  }
  var FLAG_LABEL = { open: '未確認', ok: '問題なし', hidden: '非表示', warned: '注意した' };
  function reportsView(ctx) {
    var rp = reports(), fl = flagged(), held = box().held || [];
    var heldOpen = held.filter(function (h) { return h.status === 'held'; });
    var t1 = AU.table({
      id: 'reports', qp: 'rp', rows: rp, query: ctx.query, sort: '-at', label: '通報', search: null,
      filters: [{ key: 'status', label: '状態', chips: true, value: '受付', options: [['受付', '受付'], ['非表示', '非表示'], ['注意', '注意した'], ['対応不要', '対応不要'], ['', 'すべて']] }],
      columns: [
        AU.col.when('at', '届いた', { hide: 'sm' }),
        { key: 'postHead', label: '投稿', main: true, html: function (x) { return '<button type="button" class="a-linkbtn" data-fd-report="' + esc(x.id) + '">' + esc(x.postHead) + '</button>' + (x.author ? '<span class="a-fd__sub">' + esc(x.author) + 'さんの投稿</span>' : ''); } },
        { key: 'reason', label: '理由', nowrap: true },
        AU.col.member('by', '通報した会員', { hide: 'md' }),
        AU.col.status('status', '状態', 'report')
      ],
      rowClass: function (x) { return 'is-link' + (x.status === '受付' ? ' is-alert' : ''); },
      csv: { name: '通報' }, empty: '通報はまだありません。'
    });
    var t2 = AU.table({
      id: 'flags', qp: 'fl', rows: fl, query: ctx.query, sort: '-at', label: '自動の印', search: null,
      filters: [{ key: 'flagState', label: '状態', chips: true, value: 'open', options: [['open', '未確認'], ['ok', '問題なし'], ['warned', '注意した'], ['hidden', '非表示'], ['', 'すべて']] }],
      columns: [
        AU.col.when('at', '日時', { hide: 'sm' }),
        { key: 'text', label: '本文', main: true, sort: false, html: function (p) { return '<button type="button" class="a-linkbtn a-fd__text" data-fd-post="' + esc(p.id) + '">' + cms().marks(head(p.text, 80)) + '</button>'; } },
        { key: 'author', label: '投稿した人', html: function (p) { return whoOf(p) + (p.live ? '<span class="a-fd__live">デモ会員</span>' : ''); } },
        { key: 'flags', label: '理由', value: function (p) { return p.flags.join('・'); } },
        { key: 'flagState', label: '状態', html: function (p) { return p.flagState === 'open' ? U.statusTag('new', '未確認') : '<span class="ad-st">' + esc(FLAG_LABEL[p.flagState]) + '</span>'; }, csv: function (p) { return FLAG_LABEL[p.flagState]; } },
        { key: 'act', label: '操作', sort: false, csv: false, cls: 'a-tdact', html: function (p) { return p.flagState === 'open' ? '<button type="button" class="btn btn-ghost btn-s" data-fd-ok="' + esc(p.id) + '"' + AU.dis('content') + '>問題なし</button>' : ''; } }
      ],
      rowClass: function (p) { return 'is-link' + (p.flagState === 'open' ? ' is-alert' : ''); },
      csv: { name: '自動の印' }, empty: '印の付いた投稿はありません。'
    });
    // 印の付いた投稿が1件もないときは、0件の札と空の表を並べず、ひとことだけにする
    if (!fl.length) t2 = '<div class="ad-panel a-fd__heldp">' + AU.empty('いまタイムラインに出ている投稿に、印の付いたものはありません。') + '</div>';
    var heldHtml = held.length ? '<ul class="a-fd__held">' + held.slice().sort(function (a, b) { return new Date(b.at) - new Date(a.at); }).map(function (h) {
      var fl = cms().flags(h.text);
      return '<li class="' + (h.status === 'held' ? 'is-open' : '') + '"><div class="a-fd__crow">' + AU.who(h.no) + '<time class="num" datetime="' + esc(h.at) + '">' + esc(U.fmtShort(h.at, true)) + '</time>' +
          (h.status === 'held' ? U.statusTag('review', '止めている') : '<span class="ad-st">' + (h.status === 'released' ? '公開した' : '止めたまま') + '</span>') + '</div>' +
        '<p class="a-fd__body">' + cms().marks(h.text, { br: true }) + '</p>' +
        '<p class="a-fd__sub">理由：' + esc(fl.join('・') || 'なし') + (h.doneBy ? '・' + esc(AD.db.staffName(h.doneBy)) + '（' + esc(U.fmtShort(h.doneAt, true)) + '）' : '') + '</p>' +
        (h.status === 'held' ? '<div class="a-fd__acts"><button type="button" class="btn btn-ghost btn-s" data-fd-release="' + esc(h.id) + '"' + AU.dis('content') + '>公開する</button>' +
          '<button type="button" class="btn btn-ink btn-s" data-fd-keep="' + esc(h.id) + '"' + AU.dis('content') + '>止めたまま本人に伝える</button></div>' : '') +
      '</li>';
    }).join('') + '</ul>' : AU.empty('自動で止めた投稿はありません。');
    return '<div class="a-fd__watch">' +
      '<section class="a-fd__sec" aria-labelledby="fdRp"><h2 class="a-fd__sttl" id="fdRp">通報</h2>' + t1 + '</section>' +
      '<section class="a-fd__sec" aria-labelledby="fdFl"><h2 class="a-fd__sttl" id="fdFl">自動の印<span class="a-fd__stsub">不労所得・必ず稼げる・月◯万円・勧誘など</span></h2>' + t2 + '</section>' +
      '<section class="a-fd__sec" aria-labelledby="fdHd"><h2 class="a-fd__sttl" id="fdHd">自動で止めた投稿</h2>' +
        '<div class="ad-panel a-fd__heldp">' + heldHtml + '</div></section>' +
    '</div>';
  }
  function releaseHeld(h) {
    var fl = cms().flags(h.text);
    AU.act({
      title: '公開する', ok: '公開する', kind: 'ink', reason: fl.length ? true : 'optional', reasonLabel: '公開する理由',
      text: fl.length ? '載せられない言葉（' + fl.join('・') + '）が入っています。公開するなら理由を残してください。' : 'この投稿をタイムラインに出します。',
      run: function () { save(function (b) { b.held = b.held.map(function (x) { return x.id === h.id ? Object.assign({}, x, { status: 'released', doneAt: nowIso(), doneBy: me() }) : x; }); }); return { ok: true }; },
      audit: { action: 'held_release', label: '止めた投稿を公開した', target: { type: 'member', id: h.no, name: cms().personName(h.no) }, detail: head(h.text, 24) },
      done: '公開しました。本番ではタイムラインに出ます'
    }).then(function (r) { if (r) cur.refresh(); });
  }
  function keepHeld(h) {
    var name = cms().personName(h.no);
    AU.act({
      title: '止めたまま本人に伝える', ok: '送る', kind: 'ink', reasonLabel: '本人に送る文',
      defaultReason: name + 'さん、タイムラインへの投稿は、収入を約束・連想させる書き方や勧誘にあたる書き方が入っていたため、公開していません。書き直して投稿し直してください。',
      run: function (reason) {
        save(function (b) { b.held = b.held.map(function (x) { return x.id === h.id ? Object.assign({}, x, { status: 'rejected', doneAt: nowIso(), doneBy: me(), reason: reason }) : x; }); });
        return { ok: true };
      },
      audit: { action: 'held_reject', label: '止めた投稿を止めたままにした', target: { type: 'member', id: h.no, name: name }, detail: head(h.text, 24) },
      done: '送りました。本番では会員の「相談・メッセージ」に届きます'
    }).then(function (r) { if (r) cur.refresh(); });
  }

  /* 見回りで確認が要る数（未確認の自動の印＋止めている投稿）。通報の数は metrics().reports にある。
     メニューの数を見回りのタブとそろえるため、骨組み（app.js）から AD.cms.feedWatch() で読めるようにしておく */
  function watchParts() {
    return { flags: flagged().filter(function (p) { return p.flagState === 'open'; }).length,
      held: (box().held || []).filter(function (h) { return h.status === 'held'; }).length };
  }
  function watchExtra() { var w = watchParts(); return w.flags + w.held; }
  /* メニューの数とダッシュボードの「今日やること」が見回りのタブと同じ数になるように（通報のほかの分） */
  AD.cms.feedWatch = function () { try { return watchExtra(); } catch (e) { return 0; } };
  AD.cms.feedWatchParts = function () { try { return watchParts(); } catch (e) { return { flags: 0, held: 0 }; } };

  /* ---------- 運営の投稿 ----------
     正本は会員ページの記録（state.staffPosts。見る人を切り替えても残る）。data.js の運営の投稿も並べる（直せないので、固定と非表示だけ）。
     予約は at が先の時刻の投稿（その時刻まで会員に出ない）。予約のまま・出したあとのどちらも直せる・取り下げられる */
  function staffPost(id) { return (CLG.store.state.staffPosts || []).filter(function (x) { return x.id === id; })[0] || null; }
  function staffRows() {
    var s = CLG.store.state, n = CLG.now(), ops = box(), pins = pinSet();
    var list = DATA.FEED.filter(function (p) { return isStaff(p.by) && new Date(p.at) <= n; }).map(function (p) {
      return Object.assign({}, p, { src: 'data', status: 'published' });
    });
    (s.staffPosts || []).forEach(function (p) { list.push(Object.assign({}, p, { src: 'staff', status: new Date(p.at) > n ? 'scheduled' : 'published' })); });
    return list.filter(function (p) { return !(s.deleted || {})[p.id]; }).map(function (p) {
      return Object.assign(p, { pinned: !!pins[p.id], hidden: hiddenOf(p.id, ops), author: cms().personName(p.by) });
    });
  }
  function staffView(ctx) {
    var d = AU.dis('content');
    return AU.table({
      id: 'staffPosts', rows: staffRows(), query: ctx.query, sort: '-at', label: '運営の投稿',
      filters: [{ key: 'kind', label: '種類', chips: true, options: [['', 'すべて']].concat(STAFF_KINDS) }],
      search: { placeholder: '本文', keys: ['text', 'author'] },
      columns: [
        AU.col.when('at', '公開', { html: function (p) { return '<span class="num">' + esc(U.fmtShort(p.at, true)) + '</span>'; } }),
        { key: 'text', label: '本文', main: true, sort: false, html: function (p) {
          // 予約の投稿はタイムラインにまだ無いので、押すと直す窓
          return (p.status === 'scheduled' ? '<button type="button" class="a-linkbtn a-fd__text" data-fd-sedit="' + esc(p.id) + '"' + d + '>' + esc(head(p.text, 70)) + '</button>'
            : '<button type="button" class="a-linkbtn a-fd__text" data-fd-post="' + esc(p.id) + '">' + esc(head(p.text, 70)) + '</button>') +
            (p.link ? '<span class="a-fd__sub">リンク：' + esc(linkName(p.link)) + '</span>' : '');
        } },
        { key: 'kind', label: '種類', nowrap: true, value: function (p) { return KIND[p.kind] || p.kind; } },
        { key: 'author', label: '出した人', hide: 'md' },
        { key: 'pinned', label: '固定', sort: false, nowrap: true, html: function (p) { return p.pinned ? '<span class="a-fd__pin">' + icon('pin', 'ico-s') + '固定</span>' : '<span class="muted">―</span>'; }, csv: function (p) { return p.pinned ? '固定' : ''; } },
        { key: 'status', label: '状態', value: function (p) { return p.hidden ? '非表示' : p.status === 'scheduled' ? '予約' : '公開中'; }, html: function (p) {
          if (p.hidden) return U.statusTag('closed', '非表示');
          if (p.status === 'scheduled') return U.statusTag('scheduled', '予約') + ' <button type="button" class="btn btn-text btn-s" data-fd-unsched="' + esc(p.id) + '"' + d + '>取り消す</button>';
          return '<span class="ad-st">公開中</span>';
        } }
      ],
      rowClass: function (p) { return 'is-link'; },
      csv: { name: '運営の投稿' }, empty: '運営の投稿はまだありません。'
    });
  }
  /* リンクの行き先を名前で（#/events/e4 → イベント「月末の成果発表会」） */
  function linkName(l) {
    var x = LINKS.filter(function (o) { return o[0] === l; })[0], m;
    if (x) return x[1];
    l = String(l || '');
    if ((m = /^#\/events\/([\w-]+)/.exec(l))) { var e = R.event(m[1]); return e ? 'イベント「' + e.title + '」' : 'イベント'; }
    if ((m = /^#\/gigs\/([\w-]+)/.exec(l))) { var g = R.gig(m[1]); return g ? '案件「' + g.title + '」' : '案件'; }
    if ((m = /^#\/courses\/archive\/([\w-]+)/.exec(l))) { var a = DATA.ARCHIVE.filter(function (y) { return y.id === m[1]; })[0]; return a ? '録画「' + a.title + '」' : '勉強会の録画'; }
    if ((m = /^#\/courses\/([\w-]+)/.exec(l))) { var c = R.course(m[1]); return c ? '講座「' + c.title + '」' : '講座'; }
    if (/^#\/feed\//.test(l)) return 'タイムラインの投稿';
    if (/^#\/messages/.test(l)) { var k = /kind=([^&]+)/.exec(l); try { return '相談・メッセージ' + (k ? '（' + decodeURIComponent(k[1]) + '）' : ''); } catch (err) { return '相談・メッセージ'; } }
    try { return decodeURIComponent(l); } catch (err2) { return l; }
  }
  /* 出す時刻（いますぐ／日時を決める）。at を渡すと「日時を決める」をその時刻で開く（予約を直すとき） */
  function whenFields(pre, at) {
    return cms().radios({ name: pre + 'When', label: '出す時刻', value: at ? 'later' : 'now', options: [['now', 'いますぐ'], ['later', '日時を決める']] }) +
      cms().field({ name: pre + 'At', label: '出す日時', type: 'datetime-local', value: cms().localDT(at || new Date(CLG.now().getTime() + 60 * MIN).toISOString()), hidden: !at, cls: 'a-cms__when' });
  }
  function bindWhen(form, pre) {
    form.addEventListener('change', function (e) { if (e.target.name === pre + 'When') form.querySelector('[name=' + pre + 'At]').closest('.field').hidden = e.target.value !== 'later'; });
  }
  function checkWhen(d, pre, e) {
    if (d[pre + 'When'] !== 'later') return null;
    var at = cms().parseDT(d[pre + 'At']);
    if (!at) e[pre + 'At'] = '出す日時を選んでください';
    else if (at <= CLG.now()) e[pre + 'At'] = '出す日時は、いまより後にしてください';
    else if (at - CLG.now() > 60 * DAY) e[pre + 'At'] = '予約は60日先までです';
    return at;
  }
  function linkFields(value) {
    var known = LINKS.some(function (o) { return o[0] === (value || ''); });
    return '<div class="a-cms__row2">' +
      cms().field({ name: 'link', label: 'リンク', type: 'select', value: known ? value || '' : 'custom', options: LINKS }) +
      cms().field({ name: 'linkCustom', label: 'リンク先（#/…）', value: known ? '' : value, hidden: known, placeholder: '#/events/e4', maxlength: 80 }) +
    '</div>';
  }
  function bindLink(form) { form.addEventListener('change', function (e) { if (e.target.name === 'link') form.querySelector('[name=linkCustom]').closest('.field').hidden = e.target.value !== 'custom'; }); }
  function linkOf(d, e) {
    if (d.link !== 'custom') return d.link || '';
    var v = String(d.linkCustom || '').trim();
    if (!/^#\/[\w\-/?=&%.]*$/.test(v)) { e.linkCustom = '会員ページの中のリンク（#/ で始まる）を入れてください'; return ''; }
    return v;
  }
  /* 会員ページのルールが断った欄を、窓の欄の名前に */
  function formErrors(r) {
    var x = (r && r.errors) || {}, e = {};
    if (x.text) e.text = x.text;
    if (x.link) e.linkCustom = x.link;
    if (x.kind) e.kind = x.kind;
    if (x.at) e.pAt = x.at;
    return Object.keys(e).length ? { ok: false, errors: e } : { ok: false, error: (r && r.error) || '保存できませんでした' };
  }
  /* 投稿した運営（PEOPLE の運営の id。運営の人が PEOPLE にいなければ、コミュニティ運営の名前で出す） */
  function postBy() {
    var st = AD.db.staff() || {}, p = DATA.PEOPLE[st.person] || DATA.PEOPLE[st.id];
    return p && p.staff ? (DATA.PEOPLE[st.person] ? st.person : st.id) : 'staff2';
  }
  /** 運営として投稿する・直す（sp：直す運営の投稿。会員ページの記録の形） */
  function staffPostForm(sp) {
    var edit = !!sp, sched = edit && new Date(sp.at) > CLG.now();
    sp = sp || { kind: 'news', text: '', link: '', pinned: false };
    cms().formDrawer({
      title: edit ? (sched ? '予約した投稿を直す' : '運営の投稿を直す') : '運営として投稿する', ok: edit ? '保存する' : '投稿する', cls: 'a-feed', wide: true,
      body: cms().field({ name: 'kind', label: '種類', type: 'select', value: sp.kind, options: STAFF_KINDS }) +
        cms().field({ name: 'text', label: '本文', type: 'textarea', value: sp.text, rows: 6, required: true, maxlength: 500, attrs: ' data-fd-count="500"' }) +
        '<p class="a-cms__count" data-fd-counter aria-live="polite"><span class="num">0</span>/500</p>' +
        linkFields(sp.link || '') +
        cms().check({ name: 'pinned', label: 'タイムラインのいちばん上に固定する', value: edit ? !!pinSet()[sp.id] : false }) +
        // 出したあとの投稿は時刻を動かさない（タイムラインの並びが変わるため）
        (edit && !sched ? '' : whenFields('p', sched ? sp.at : null)),
      foot: sched ? '<button type="button" class="btn btn-text a-fd__sremove" data-fd-sremove>予約を取り消す</button>' : '',
      onMount: function (form, dw) {
        bindWhen(form, 'p'); bindLink(form); counter(form);
        var rm = dw.querySelector('[data-fd-sremove]');
        if (rm) rm.addEventListener('click', function () { if (!AU.need('content')) return; dw.close(false); removeStaff(sp); });
      },
      onSubmit: function (d) {
        var e = {}, text = String(d.text || '').trim();
        if (!text) e.text = '本文を入れてください';
        else { var hit = cms().flags(text); if (hit.length) e.text = 'この内容は載せられません（' + hit.join('・') + '）'; }
        var link = linkOf(d, e), at = edit && !sched ? null : checkWhen(d, 'p', e);
        if (Object.keys(e).length) return { ok: false, errors: e };
        var later = !(edit && !sched) && d.pWhen === 'later';
        var r, id = edit ? sp.id : cms().uid('sp');
        if (edit) {
          var patch = { kind: d.kind, text: text, link: link, pinned: !!d.pinned };
          if (sched) patch.at = later ? at.toISOString() : nowIso();
          r = R.updateStaffPost(id, patch);
        } else {
          // at が先の時刻なら予約（その時刻まで会員のタイムラインに出ない。運営画面を閉じていても時刻が来たら出る）
          r = R.addStaffPost({ id: id, kind: d.kind, by: postBy(), text: text, link: link, pinned: !!d.pinned, at: later ? at.toISOString() : undefined });
        }
        if (!r || r.ok === false) return formErrors(r);
        AD.db.audit({ action: edit ? 'staff_post_edit' : 'staff_post', label: edit ? (sched ? '予約した運営の投稿を直した' : '運営の投稿を直した') : later ? '運営の投稿を予約した' : '運営として投稿した',
          target: { type: 'post', id: id, name: head(text, 24) }, detail: KIND[d.kind] + (later ? '・' + U.fmtShort(at, true) : '') });
        U.toast(later ? U.fmtShort(at, true) + 'に出します' : edit && !sched ? '投稿を直しました。会員のタイムラインにも出ています' : 'タイムラインに投稿しました', 'ok');
        cur.refresh();
        return { ok: true };
      }
    });
  }
  /** 運営の投稿を取り下げる（予約のままなら取り消す）。会員ページの記録ごと消す（R.removeStaffPost） */
  function removeStaff(sp) {
    var sched = new Date(sp.at) > CLG.now();
    U.confirmBox(sched ? '予約を取り消しますか' : '投稿を取り下げますか', sched ? 'この投稿は出しません。' : '会員のタイムラインから消えます。', sched ? '取り消す' : '取り下げる', true).then(function (ok) {
      if (!ok) return;
      var r = R.removeStaffPost(sp.id);
      if (!r || r.ok === false) { U.toast((r && r.error) || '取り下げられませんでした', 'error'); return; }
      save(function (b) { delete b.hidden[sp.id]; });
      AD.db.audit({ action: sched ? 'schedule_cancel' : 'staff_post_remove', label: sched ? '運営の投稿の予約を取り消した' : '運営の投稿を取り下げた', target: { type: 'post', id: sp.id, name: head(sp.text, 24) } });
      U.toast(sched ? '予約を取り消しました' : '取り下げました。会員のタイムラインからも消えました', 'ok');
      cur.refresh({ focus: '[data-fd-new]' });
    });
  }

  function counter(form) {
    var ta = form.querySelector('[data-fd-count]'), out = form.querySelector('[data-fd-counter] .num'); if (!ta || !out) return;
    var max = +ta.getAttribute('data-fd-count');
    function sync() { out.textContent = ta.value.length; out.parentNode.classList.toggle('is-over', ta.value.length > max * 0.9); }
    ta.addEventListener('input', sync); sync();
  }

  /* ---------- お知らせ ---------- */
  function noticeRows() {
    var ops = box();
    var sent = (AD.db.state.notices || []).map(function (x) { return Object.assign({}, x, { status: 'sent' }); });
    var sch = (ops.scheduled || []).filter(function (x) { return x.status !== 'sent'; }).map(function (x) { return Object.assign({}, x, { delivered: cms().countTarget(x.target) }); });
    return sent.concat(sch);
  }
  function noticesView(ctx) {
    return AU.table({
      id: 'notices', rows: noticeRows(), query: ctx.query, sort: '-at', label: 'お知らせ',
      filters: [{ key: 'status', label: '状態', chips: true, options: [['', 'すべて'], ['sent', '出した'], ['scheduled', '予約'], ['canceled', '取り消した']] }],
      search: { placeholder: '本文・届け先', keys: ['text', 'targetLabel'] },
      columns: [
        AU.col.when('at', '出した日時'),
        { key: 'text', label: '本文', main: true, html: function (x) { return '<span class="a-fd__ntext">' + esc(x.text) + '</span>' + (x.link ? '<span class="a-fd__sub">リンク：' + esc(linkName(x.link)) + '</span>' : ''); } },
        { key: 'targetLabel', label: '届け先', nowrap: true, value: function (x) { return x.targetLabel || cms().targetLabel(x.target); } },
        { key: 'delivered', label: '人数', align: 'r', dir: 'desc', html: function (x) { return '<span class="num">' + U.num(x.delivered) + '</span>人'; } },
        { key: 'by', label: '出した人', hide: 'md', value: function (x) { return AD.db.staffName(x.by); } },
        { key: 'status', label: '状態', value: function (x) { return x.status === 'scheduled' ? '予約' : x.status === 'canceled' ? '取り消した' : '出した'; }, html: function (x) {
          if (x.status === 'scheduled') return U.statusTag('scheduled', '予約') + ' <button type="button" class="btn btn-text btn-s" data-fd-ncancel="' + esc(x.id) + '"' + AU.dis('content') + '>取り消す</button>';
          if (x.status === 'canceled') return U.statusTag('closed', '取り消した');
          return '<span class="ad-st">出した</span>' + (x.line ? '<span class="a-fd__sub">LINEにも</span>' : '');
        } }
      ],
      rowClass: function (x) { return x.status === 'canceled' ? 'is-quiet' : ''; },
      csv: { name: 'お知らせ' }, empty: 'まだお知らせを出していません。'
    });
  }
  /** お知らせを出す（会員ページの鈴。AD.cms.notify → R.cmsUpsert('notice')）。予約の分は時刻が来たら runDue が記録に足す
      （会員ページには予約の時刻に出る。運営画面が閉じていても） */
  function deliver(x) {
    var r = x.cmsDone ? { ok: true, count: cms().countTarget(x.target), hit: cms().liveHit(x.target) } : cms().notify({ id: x.id, target: x.target, text: x.text, link: x.link || '', log: false });
    if (!r || r.ok === false) return r || { ok: false };
    var n = r.count;
    AD.db.update(function (s) { s.notices.unshift({ id: x.id || cms().uid('nt'), at: x.at || nowIso(), by: x.by || me(), target: x.target, targetLabel: cms().targetLabel(x.target), text: x.text, link: x.link || '', delivered: n, line: !!x.line }); });
    if (x.line) save(function (b) { b.line.push({ id: cms().uid('ln'), target: x.target, text: x.text, at: x.at || nowIso(), by: x.by || me(), status: 'sent' }); });
    return { ok: true, delivered: r.hit, count: n };
  }
  function noticeForm() {
    cms().formDrawer({
      title: 'お知らせを出す', ok: '出す', cls: 'a-feed', wide: true,
      body: cms().targetFields('t', 'all') +
        cms().field({ name: 'text', label: '本文', type: 'textarea', rows: 3, required: true, maxlength: 120, attrs: ' data-fd-count="120"' }) +
        '<p class="a-cms__count" data-fd-counter aria-live="polite"><span class="num">0</span>/120</p>' +
        linkFields('') +
        cms().check({ name: 'line', label: '公式LINEにも同じ文を送る' }) +
        whenFields('n'),
      onMount: function (form) { cms().bindTarget(form, 't'); bindWhen(form, 'n'); bindLink(form); counter(form); },
      onSubmit: function (d) {
        var e = {}, text = String(d.text || '').trim();
        if (!text) e.text = '本文を入れてください';
        else if (text.length > 120) e.text = '120文字までにしてください';
        else { var hit = cms().flags(text); if (hit.length) e.text = 'この内容は出せません（' + hit.join('・') + '）'; }
        var te = cms().checkTarget(d, 't'); if (te) Object.assign(e, te);
        var link = linkOf(d, e), at = checkWhen(d, 'n', e);
        if (Object.keys(e).length) return { ok: false, errors: e };
        var target = cms().targetOf(d, 't');
        if (d.nWhen === 'later') {
          // 会員ページには予約の時刻に出す（R.cmsUpsert の予約公開）
          var nid = cms().uid('nt');
          var rs = cms().notify({ id: nid, target: target, text: text, link: link, at: at.toISOString(), log: false });
          if (!rs.ok) return rs.errors ? { ok: false, errors: { text: rs.errors.text || '', linkCustom: rs.errors.link || '' } } : { ok: false, error: rs.error || 'お知らせを予約できませんでした' };
          save(function (b) { b.scheduled.push({ id: nid, target: target, targetLabel: cms().targetLabel(target), text: text, link: link, at: at.toISOString(), by: me(), status: 'scheduled', line: !!d.line, cmsDone: true }); });
          AD.db.audit({ action: 'notice_schedule', label: 'お知らせを予約した', target: { type: 'notice', id: target, name: cms().targetLabel(target) }, detail: U.fmtShort(at, true) + '・' + text });
          U.toast(U.fmtShort(at, true) + 'に出します', 'ok'); cur.refresh();
          return { ok: true };
        }
        var res = deliver({ id: cms().uid('nt'), target: target, text: text, link: link, line: !!d.line });
        if (!res.ok) return res.errors ? { ok: false, errors: { text: res.errors.text || '', linkCustom: res.errors.link || '' } } : { ok: false, error: res.error || 'お知らせを出せませんでした' };
        AD.db.audit({ action: 'notice', label: 'お知らせを出した', target: { type: 'notice', id: target, name: cms().targetLabel(target) }, detail: text });
        U.toast(U.num(res.count) + '人に出しました' + (res.delivered ? '（' + AD.data.live().name + 'さんの鈴にも届きました）' : ''), 'ok');
        cur.refresh();
        return { ok: true };
      }
    });
  }
  /* 予約したお知らせ・LINE で、時刻が来たもの（運営の記録に「出した」として残す。会員ページには予約の時刻に出ている）。
     予約した運営の投稿は会員ページの記録が時刻で出すので、ここでは何もしない */
  var dueBusy = false;
  function runDue() {
    if (dueBusy) return;
    var ops = box(), n = CLG.now();
    var dueN = (ops.scheduled || []).filter(function (x) { return x.status === 'scheduled' && new Date(x.at) <= n; });
    var dueL = (ops.line || []).filter(function (x) { return x.status === 'scheduled' && new Date(x.at) <= n; });
    if (!dueN.length && !dueL.length) return;
    dueBusy = true;
    try {
      dueN.forEach(function (x) { deliver(x); });
      save(function (b) {
        b.scheduled.forEach(function (x) { if (dueN.some(function (y) { return y.id === x.id; })) x.status = 'sent'; });
        b.line.forEach(function (x) { if (dueL.some(function (y) { return y.id === x.id; })) x.status = 'sent'; });
      });
    } finally { dueBusy = false; }
  }

  /* ---------- LINE ---------- */
  function lineReach(t) {
    var live = AD.data.live();
    return AD.data.members().filter(function (r) {
      if (r.status === 'left' || !cms().matchTarget(r, t)) return false;
      if (r.live) return R.lineLink ? R.lineLink().status === 'linked' : true;
      return r.stepsDone >= 3;   // スタートガイドの3つ目が LINE の連携（名簿の進みから数える）
    }).length;
  }
  function lineView(ctx) {
    var rows = (box().line || []).map(function (x) { return Object.assign({}, x, { targetLabel: cms().targetLabel(x.target), count: x.count || lineReach(x.target) }); });
    var friends = lineReach('all'), enrolled = cms().countTarget('all');
    var kp = '<div class="ad-kpis a-fd__kpis">' +
      AU.kpi({ label: '公式LINEの友だち（在籍）', value: U.num(friends), unit: '人', sub: '在籍 ' + U.num(enrolled) + '人の ' + Math.round(friends / Math.max(1, enrolled) * 100) + '%' }) +
      AU.kpi({ label: '今月送った回数', value: String(rows.filter(function (x) { return x.status === 'sent' && AD.data.inMonth(x.at, 0); }).length), unit: '回', sub: '予約 ' + rows.filter(function (x) { return x.status === 'scheduled'; }).length + '件' }) +
    '</div>';
    return kp + AU.table({
      id: 'line', rows: rows, query: ctx.query, sort: '-at', label: 'LINEの一斉送信',
      filters: [{ key: 'status', label: '状態', chips: true, options: [['', 'すべて'], ['sent', '送った'], ['scheduled', '予約'], ['canceled', '取り消した']] }],
      search: { placeholder: '本文', keys: ['text'] },
      columns: [
        AU.col.when('at', '送る日時'),
        { key: 'text', label: '本文', main: true, html: function (x) { return '<span class="a-fd__ntext">' + esc(x.text) + '</span>'; } },
        { key: 'targetLabel', label: '届け先', nowrap: true },
        { key: 'count', label: '人数', align: 'r', dir: 'desc', html: function (x) { return '<span class="num">' + U.num(x.count) + '</span>人'; } },
        { key: 'by', label: '送った人', hide: 'md', value: function (x) { return AD.db.staffName(x.by); } },
        { key: 'status', label: '状態', value: function (x) { return x.status === 'scheduled' ? '予約' : x.status === 'canceled' ? '取り消した' : '送った'; }, html: function (x) {
          if (x.status === 'scheduled') return U.statusTag('scheduled', '予約') + ' <button type="button" class="btn btn-text btn-s" data-fd-lcancel="' + esc(x.id) + '"' + AU.dis('content') + '>取り消す</button>';
          if (x.status === 'canceled') return U.statusTag('closed', '取り消した');
          return '<span class="ad-st">送った</span>';
        } }
      ],
      rowClass: function (x) { return x.status === 'canceled' ? 'is-quiet' : ''; },
      csv: { name: 'LINEの一斉送信' }, empty: 'まだ送っていません。'
    });
  }
  function lineForm() {
    cms().formDrawer({
      title: 'LINEで一斉に送る', ok: '送る', cls: 'a-feed', wide: true,
      body: cms().targetFields('l', 'all') +
        cms().field({ name: 'text', label: '本文', type: 'textarea', rows: 5, required: true, maxlength: 500, attrs: ' data-fd-count="500"' }) +
        '<p class="a-cms__count" data-fd-counter aria-live="polite"><span class="num">0</span>/500</p>' +
        whenFields('w'),
      foot: '<button type="button" class="btn btn-text" data-fd-test>自分に試しに送る</button>',
      onMount: function (form, dw) {
        // 届く人数は、公式LINEの友だちだけで数える
        cms().bindTarget(form, 'l', { count: lineReach, unit: '人（公式LINEの友だち）' });
        bindWhen(form, 'w'); counter(form);
        dw.querySelector('[data-fd-test]').addEventListener('click', function () { U.toast('本番では' + ((AD.db.staff() || {}).name || '運営') + 'さんのLINEに届きます'); });
      },
      onSubmit: function (d) {
        var e = {}, text = String(d.text || '').trim();
        if (!text) e.text = '本文を入れてください';
        else { var hit = cms().flags(text); if (hit.length) e.text = 'この内容は送れません（' + hit.join('・') + '）'; }
        var te = cms().checkTarget(d, 'l'); if (te) Object.assign(e, te);
        var at = checkWhen(d, 'w', e);
        if (Object.keys(e).length) return { ok: false, errors: e };
        var t = cms().targetOf(d, 'l'), later = d.wWhen === 'later', n = lineReach(t);
        save(function (b) { b.line.push({ id: cms().uid('ln'), target: t, text: text, at: later ? at.toISOString() : nowIso(), by: me(), status: later ? 'scheduled' : 'sent', count: later ? null : n }); });
        AD.db.audit({ action: 'line', label: later ? 'LINEの一斉送信を予約した' : 'LINEで一斉に送った', target: { type: 'line', id: t, name: cms().targetLabel(t) }, detail: n + '人' + (later ? '・' + U.fmtShort(at, true) : '') });
        U.toast(later ? U.fmtShort(at, true) + 'に送ります' : U.num(n) + '人に送りました。本番では公式LINEから届きます', 'ok');
        cur.refresh();
        return { ok: true };
      }
    });
  }
  function cancelSched(kind, id) {
    U.confirmBox('予約を取り消しますか', 'この' + (kind === 'line' ? 'LINE' : 'お知らせ') + 'は出しません。', '取り消す', true).then(function (ok) {
      if (!ok) return;
      // 予約したお知らせは会員ページの予約公開も消す
      if (kind === 'notice') AD.ops.cmsRemove('notice', id);
      save(function (b) {
        var list = kind === 'line' ? b.line : b.scheduled;
        list.forEach(function (x) { if (x.id === id) x.status = 'canceled'; });
      });
      AD.db.audit({ action: 'schedule_cancel', label: '予約を取り消した', target: { type: kind, id: id, name: kind } });
      U.toast('予約を取り消しました', 'ok'); cur.refresh();
    });
  }

  AD.screens.feed = {
    title: 'タイムライン・お知らせ',
    render: function (ctx) {
      AD.db.ensure(K, empty);
      var tab = ctx.query.tab || 'posts', m = ctx.data.metrics();
      var all = posts(), watchN = m.reports + watchExtra();
      var schN = (box().scheduled || []).filter(function (x) { return x.status === 'scheduled'; }).length;
      var tabs = AU.tabs([
        { id: 'posts', label: '投稿', href: '#/feed', n: all.length },
        { id: 'reports', label: '見回り', href: '#/feed?tab=reports', n: watchN || '', alert: watchN > 0 },
        { id: 'staff', label: '運営の投稿', href: '#/feed?tab=staff' },
        { id: 'notices', label: 'お知らせ', href: '#/feed?tab=notices', n: schN ? '予約 ' + schN : '' },
        { id: 'line', label: 'LINE', href: '#/feed?tab=line' }
      ], tab, 'タイムラインの表示');
      var body = tab === 'reports' ? reportsView(ctx) : tab === 'staff' ? staffView(ctx) : tab === 'notices' ? noticesView(ctx) : tab === 'line' ? lineView(ctx) : postsView(ctx);
      var dis = AU.dis('content');
      var acts = tab === 'notices' ? '<button type="button" class="btn btn-ink btn-s" data-fd-notice' + dis + '>' + icon('bell', 'ico-s') + 'お知らせを出す</button>' :
        tab === 'line' ? '<button type="button" class="btn btn-ink btn-s" data-fd-line' + dis + '>' + icon('line', 'ico-s') + 'LINEで送る</button>' :
        '<button type="button" class="btn btn-ink btn-s" data-fd-new' + dis + '>' + icon('pen', 'ico-s') + '運営として投稿する</button>';
      var today = all.filter(function (p) { return new Date(p.at).toDateString() === CLG.now().toDateString(); }).length;
      // 投稿・お知らせ・LINE・見回りの対応は「掲載」の役割（講師・経理は見るだけ）
      var note = AU.roleNote('content', '投稿・お知らせ・見回りの対応', { strict: true });
      return '<div class="a-feed">' + AU.head({ title: 'タイムライン・お知らせ', sub: '投稿 ' + all.length + '件（今日 ' + today + '件）・確認が要るもの ' + watchN + '件', actions: acts }) + tabs + note + body + '</div>';
    },
    mount: function (root, ctx) {
      cur = ctx;
      setTimeout(function () { runDue(); if (migrate() && cur) cur.refresh(); }, 0);
      if (root.__boundFeed) return;
      root.__boundFeed = true;
      // 予約したお知らせ・LINE は、ほかの画面を開いていても時刻が来たら出す
      setInterval(function () { if (AD.db.state.session && document.getElementById('adView')) runDue(); }, 30000);
      root.addEventListener('click', function (e) {
        var t = e.target, b;
        if (!t.closest('.a-feed')) return;
        // 書き換える操作は役割を確かめる（ボタンを disabled にしていても、キーボードや古い描画から来ることがあるため）
        if (t.closest('[data-fd-new],[data-fd-notice],[data-fd-line],[data-fd-ok],[data-fd-release],[data-fd-keep],[data-fd-ncancel],[data-fd-lcancel],[data-fd-unsched],[data-fd-sedit]') && !AU.need('content')) return;
        if ((b = t.closest('[data-fd-new]'))) { staffPostForm(); return; }
        if ((b = t.closest('[data-fd-notice]'))) { noticeForm(); return; }
        if ((b = t.closest('[data-fd-line]'))) { lineForm(); return; }
        if ((b = t.closest('[data-fd-post]'))) { var p = findPost(b.getAttribute('data-fd-post')); if (p) postDrawer(p); else U.toast('この投稿は見つかりません', 'error'); return; }
        if ((b = t.closest('[data-fd-report]'))) {
          var rp = reports().filter(function (x) { return x.id === b.getAttribute('data-fd-report'); })[0];
          if (rp && rp.post) postDrawer(rp.post, rp); else if (rp) U.toast('通報された投稿は消されています', 'error');
          return;
        }
        if ((b = t.closest('[data-fd-ok]'))) { var fp = findPost(b.getAttribute('data-fd-ok')); if (fp) flagOk(fp); return; }
        if ((b = t.closest('[data-fd-release]'))) { var h = (box().held || []).filter(function (x) { return x.id === b.getAttribute('data-fd-release'); })[0]; if (h) releaseHeld(h); return; }
        if ((b = t.closest('[data-fd-keep]'))) { var h2 = (box().held || []).filter(function (x) { return x.id === b.getAttribute('data-fd-keep'); })[0]; if (h2) keepHeld(h2); return; }
        if ((b = t.closest('[data-fd-ncancel]'))) { cancelSched('notice', b.getAttribute('data-fd-ncancel')); return; }
        if ((b = t.closest('[data-fd-lcancel]'))) { cancelSched('line', b.getAttribute('data-fd-lcancel')); return; }
        if ((b = t.closest('[data-fd-unsched],[data-fd-sedit]'))) {
          var sp = staffPost(b.getAttribute('data-fd-unsched') || b.getAttribute('data-fd-sedit'));
          if (!sp) { U.toast('この投稿は見つかりません', 'error'); cur.refresh(); return; }
          if (b.hasAttribute('data-fd-sedit')) staffPostForm(sp); else removeStaff(sp);
          return;
        }
        var tr = t.closest('tr[data-tb-row]');
        if (tr && !t.closest('a,button,input,select,textarea,label') && !String(window.getSelection ? window.getSelection() : '')) {
          var ob = tr.querySelector('[data-fd-post],[data-fd-report],[data-fd-sedit]'); if (ob && !ob.disabled) { ob.focus(); ob.click(); }
        }
      });
    }
  };
})();
