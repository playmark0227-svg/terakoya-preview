/* ============================================================
   運営画面：ダッシュボード（#/dashboard）
   「今日、手を付けることは何か」に答える画面。数字はすべて AD.data（デモのデータ＋会員ページの状態）から作る。
   - 上：在籍・今月の入会・解約予定・今月の売上（税込）・未返信
   - 今日やること（確認待ちの列を急ぐ順に）と、デモ会員へのその場の返信（R.staffReply → 会員ページのタブに届く）
   - 止まっている新入生・今週のイベント・最近の操作
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, AD = CLG.admin, AU = AD.ui, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon;
  var cur = null;
  var DAY = 86400000;

  function yen(n) { return U.num(n); }
  function sameDay(a, b) { a = new Date(a); b = new Date(b); return a.toDateString() === b.toDateString(); }
  function whenShort(at) {
    var n = CLG.now(), d = new Date(at), t = U.pad(d.getHours()) + ':' + U.pad(d.getMinutes());
    if (sameDay(d, n)) return '今日 ' + t;
    var tm = new Date(n.getTime() + DAY);
    if (sameDay(d, tm)) return '明日 ' + t;
    return U.fmtShort(d, true);
  }

  /* 在籍（先月末の時点）：先月末までに入会して、先月末より後に終わった（か、まだ続いている）人 */
  function enrolledAt(members, end) {
    return members.filter(function (m) {
      return new Date(m.joinedAt) < end && (!m.leftAt || m.status !== 'left' || new Date(m.leftAt) >= end);
    }).length;
  }

  function kpis(m, ms) {
    var n = CLG.now(), monthStart = new Date(n.getFullYear(), n.getMonth(), 1);
    var before = enrolledAt(ms, monthStart);
    var diff = m.enrolled - before;
    var rv = m.revenue;
    var nc = m.nextCancel;
    return '<div class="ad-kpis a-dash__kpis">' +
      AU.kpi({ label: '在籍', value: U.num(m.enrolled), unit: '人', href: '#/members',
        sub: '先月末 ' + U.num(before) + '人（' + (diff >= 0 ? '+' : '−') + Math.abs(diff) + '）' }) +
      AU.kpi({ label: '今月の入会', value: U.num(m.joined), unit: '人', href: '#/members?cohort=' + encodeURIComponent(AD.data.monthKey(n)) + '&sort=-joinedAt',
        sub: '先月 ' + U.num(m.joinedLast) + '人' }) +
      AU.kpi({ label: '解約予定', value: U.num(m.canceling), unit: '人', href: '#/members?status=canceling',
        // 「次の終了 9/25(金)」は途中で折れないように1つのかたまりにする
        sub: esc('今月の退会 ' + U.num(m.left) + '人') + (nc && nc.cancelAt ? '・<span class="nw">' + esc('次の終了 ' + U.fmtShort(nc.cancelAt)) + '</span>' : ''), subHtml: true }) +
      AU.kpi({ label: '今月の売上（税込）', value: yen(rv.net), unit: '円', href: '#/payments',
        tone: rv.failedCount ? 'warn' : '',
        sub: (rv.failedCount ? '<span class="ad-kpi__warn">' + icon('alert', 'ico-s') + '失敗 ' + rv.failedCount + '件</span>・' : '') +
          '返金 ' + rv.refundCount + '件', subHtml: true }) +
      AU.kpi({ label: '未返信のメッセージ', value: U.num(m.unanswered), unit: '件', href: '#/inbox?status=open',
        tone: m.over24 ? 'alert' : '',
        sub: m.over24 ? '<span class="ad-kpi__alert">' + icon('alert', 'ico-s') + '24時間を過ぎた ' + m.over24 + '件</span>' : '24時間を過ぎたものはありません', subHtml: true }) +
    '</div>';
  }

  /* 今日やること：急ぐ順。0件の列も出す（毎日同じ場所を見られるように） */
  function todo(m) {
    var oldest = m.oldestOpen;
    var failedList = AD.data.payments({ status: 'failed' });
    var graceEnd = failedList.map(function (p) { return new Date(new Date(p.at).getTime() + (DATA.SITE.graceDays || 7) * DAY); }).sort(function (a, b) { return a - b; })[0];
    var q = AD.data.queues();
    var banned = q.peerGigs.filter(function (g) { return g.status === 'review' && R.checkBanned(g.title + '\n' + g.desc).length; }).length;
    // 見回りのタブ・メニューの数と同じ：通報（受付）＋自動の印（未確認）＋自動で止めた投稿
    var watch = (AD.cms && AD.cms.feedWatchParts) ? AD.cms.feedWatchParts() : { flags: 0, held: 0 };
    var rows = [
      { icon: 'message', label: '未返信のメッセージ', n: m.unanswered, href: '#/inbox?status=open', alert: m.over24 > 0,
        sub: oldest ? 'いちばん古いもの ' + AU.age(oldest.waitingSince).text + '前' + (m.over24 ? '・24時間を過ぎた ' + m.over24 + '件' : '') : '' },
      { icon: 'yen', label: '支払いエラー', n: m.failed, href: '#/payments?status=failed', alert: m.failed > 0,
        sub: graceEnd ? '猶予がいちばん早く終わる日 ' + U.fmtShort(graceEnd) : '' },
      { icon: 'briefcase', label: '会員どうしの募集の確認', n: m.peerGigs, href: '#/gigs?tab=review',
        sub: banned ? '載せられない言葉を含むもの ' + banned + '件' : '' },
      { icon: 'briefcase', label: '案件への応募', n: m.gigApps, href: '#/gigs?tab=apps', sub: '' },
      { icon: 'calendar', label: '会員からのイベントの企画', n: m.proposals, href: '#/events?tab=proposals', sub: '' },
      { icon: 'alert', label: 'タイムラインの見回り', n: m.reports + watch.flags + watch.held, href: '#/feed?tab=reports',
        sub: watch.flags + watch.held ? ['通報 ' + m.reports + '件', watch.flags ? '自動の印 ' + watch.flags + '件' : '', watch.held ? '自動で止めた投稿 ' + watch.held + '件' : '']
          .filter(Boolean).join('・') : '' },
      { icon: 'gift', label: '紹介報酬の確定待ち', n: m.rewardsReady, href: '#/referrals?status=ready',
        sub: m.rewardsReady ? '合わせて ' + U.yen(m.rewardsReadySum) : '' },
      { icon: 'chat', label: '専門家への相談（受付・日程調整）', n: m.experts, href: '#/perks?tab=experts', sub: '' },
      { icon: 'clock', label: '面談の日時の確定待ち', n: m.interviews, href: '#/onboarding?view=interviews', sub: '' },
      { icon: 'flag', label: 'スタートガイドで止まっている新入生', n: m.stalled, href: '#/onboarding?filter=stalled', unit: '人',
        sub: '入会30日以内の ' + m.newMembers + '人のうち' }
    ];
    var open = rows.filter(function (x) { return x.n > 0; }).length;
    return AU.panel({
      title: '今日やること', id: 'dashTodo', cls: 'a-dash__todo', flush: true,
      actions: '<span class="a-dash__todoN">' + (open ? open + '種類が残っています' : 'すべて済んでいます') + '</span>',
      body: '<ul class="a-todo">' + rows.map(function (x) {
        var zero = !x.n;
        return '<li><a class="a-todo__row' + (zero ? ' is-zero' : '') + (x.alert ? ' is-alert' : '') + '" href="' + esc(x.href) + '">' +
          '<span class="a-todo__ico">' + icon(x.icon) + '</span>' +
          '<span class="a-todo__body"><span class="a-todo__ttl">' + esc(x.label) + '</span>' +
            (x.sub && !zero ? '<span class="a-todo__sub">' + esc(x.sub) + '</span>' : '') + '</span>' +
          '<span class="a-todo__n' + (x.alert ? ' is-alert' : '') + '"><b class="num">' + x.n + '</b>' + esc(x.unit || '件') + '</span>' +
          U.chevron() + '</a></li>';
      }).join('') + '</ul>'
    });
  }

  /* デモ会員：最近のやりとりと、その場で返す欄 */
  function liveCard(ctx) {
    var lv = ctx.live, row = lv.row || {}, th = AD.data.thread('live');
    var msgs = (th && th.messages || []).slice(-3);
    var waiting = th && th.status === 'open';
    var staffName = function (id) { return (DATA.PEOPLE[id] && DATA.PEOPLE[id].name) || AD.db.staffName(id); };
    var who = '<div class="a-live__who">' + U.avatar({ name: lv.name, color: AU.colorOf(row) }) +
      '<div class="a-live__id"><a class="a-live__name" href="#/members/' + encodeURIComponent(lv.no) + '">' + esc(lv.name) + '</a>' +
        '<span class="a-live__meta"><span class="num">' + esc(lv.no) + '</span>・入会' + esc(row.day) + '日目・Lv' + esc(row.level) + ' ' + esc(row.levelName || '') + '</span>' +
        '<span class="a-live__meta">スタートガイド ' + AU.steps(row.stepsDone || 0) + (row.status && row.status !== 'active' ? '　' + AU.status('member', row.status) : '') + '</span>' +
      '</div></div>';
    var list = msgs.length ? '<ol class="a-live__msgs" aria-label="最近のやりとり">' + msgs.map(function (x) {
      var me = x.from === 'member';
      return '<li class="a-live__msg' + (me ? ' is-member' : ' is-staff') + '">' +
        '<span class="a-live__from">' + esc(me ? lv.name : staffName(x.from)) + (x.auto ? '（自動）' : '') + '<time class="num" datetime="' + esc(x.at) + '">' + esc(U.relTime(x.at)) + '</time></span>' +
        '<span class="a-live__text">' + U.jp(x.text, { br: true }) + '</span></li>';
    }).join('') + '</ol>' : AU.empty('まだやりとりはありません。');
    var status = waiting ? '<p class="a-live__wait">' + AU.status('thread', 'open') + '<span>' + esc(AU.age(th.waitingSince).text) + '前から返事を待っています</span></p>' : '';
    // 返信できる役割だけ返信の欄を出す（講師は講座の質問のやりとりだけ。経理は見るだけ）
    var form = !AU.can('members', { kind: th && th.kind }) ? '' : '<form class="a-live__reply" data-dl-form novalidate>' +
      '<label class="sr-only" for="dlReply">' + esc(lv.name) + 'さんへの返信</label>' +
      '<textarea class="textarea" id="dlReply" name="text" rows="3" maxlength="2000" placeholder="' + esc(lv.name) + 'さんへの返信"></textarea>' +
      '<div class="a-live__acts"><a class="btn btn-text btn-s" href="#/inbox/live">スレッドを開く</a>' +
        '<button type="submit" class="btn btn-primary btn-s">' + icon('arrow', 'ico-s') + '送る</button></div>' +
    '</form>';
    return AU.panel({
      title: 'デモ会員', id: 'dashLive', cls: 'a-dash__live',
      actions: '<a class="btn btn-ghost btn-s" href="' + esc(AD.data.memberHref('#/messages')) + '" target="_blank" rel="noopener">' + icon('external', 'ico-s') + 'この会員として見る</a>',
      body: who + status + list + form
    });
  }

  function stalledPanel(m) {
    var list = m.stalledList.slice(0, 6);
    var body = list.length ? '<div class="ad-tbl-wrap"><table class="ad-tbl is-dense is-cards" aria-label="止まっている新入生">' +
      '<thead><tr><th scope="col">会員</th><th scope="col">進み</th><th scope="col" class="ad-hide-sm">止まっている項目</th><th scope="col" class="r">最後の活動</th></tr></thead><tbody>' +
      list.map(function (x) {
        return '<tr class="is-link" data-tb-href="#/members/' + esc(encodeURIComponent(x.no)) + '">' +
          '<td class="is-main">' + AU.who(x, { sub: '入会' + x.day + '日目' }) + '</td>' +
          '<td data-label="進み">' + AU.steps(x.stepsDone) + '</td>' +
          '<td class="ad-hide-sm" data-label="止まっている項目">' + esc(x.currentStep) + '</td>' +
          '<td class="r nw" data-label="最後の活動">' + (x.idleDays >= 7 ? '<span class="ad-age is-over">' + icon('alert', 'ico-s') + '<span class="num">' + x.idleDays + '</span>日前</span>' : esc(U.relTime(x.lastActive))) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : AU.empty('止まっている新入生はいません。');
    return AU.panel({ title: 'スタートガイドで止まっている新入生', id: 'dashStalled', count: m.stalled, cls: 'a-dash__stalled', flush: true,
      actions: '<a class="ad-panel__link" href="#/onboarding">新入生の30日</a>', body: body });
  }

  function eventsPanel(m) {
    var list = m.weekEvents.slice(0, 7);
    var body = list.length ? '<ul class="a-ev">' + list.map(function (e) {
      var full = e.reserved >= e.cap, pct = Math.min(100, Math.round(e.reserved / e.cap * 100));
      var on = e.kind === 'offline' ? '会場' : e.kind === 'showcase' ? 'オンライン＋会場' : 'オンライン';
      return '<li><a class="a-ev__row" href="#/events/' + encodeURIComponent(e.id) + '">' +
        '<span class="a-ev__when num">' + esc(whenShort(e.at)) + '</span>' +
        '<span class="a-ev__body"><span class="a-ev__ttl">' + esc(e.title) + '</span><span class="a-ev__sub">' + esc(on) + (e.liveReserved ? '・デモ会員が予約' : '') + '</span></span>' +
        '<span class="a-ev__cap"><span class="a-ev__bar' + (full ? ' is-full' : '') + '" aria-hidden="true"><i style="width:' + pct + '%"></i></span>' +
          '<span class="num">' + e.reserved + '/' + e.cap + '</span>' + (full ? U.statusTag('waitlist', '満席') : '') + '</span>' +
        U.chevron() + '</a></li>';
    }).join('') + '</ul>' : AU.empty('これから7日のイベントはありません。', { href: '#/events', label: 'イベントを作る' });
    return AU.panel({ title: '今週のイベント', id: 'dashEvents', count: '予約 ' + U.num(m.weekReserved) + '人', cls: 'a-dash__events', flush: true,
      actions: '<a class="ad-panel__link" href="#/events">イベント</a>', body: body });
  }

  function auditPanel() {
    var list = AD.db.state.audit.slice(0, 6);
    var body = list.length ? '<ul class="a-log">' + list.map(function (a) {
      var t = a.target || {};
      return '<li class="a-log__row"><time class="a-log__at num" datetime="' + esc(a.at) + '">' + esc(U.relTime(a.at)) + '</time>' +
        '<span class="a-log__who">' + esc(AD.db.staffName(a.by)) + '</span>' +
        '<span class="a-log__what"><b>' + esc(a.label) + '</b>' + (t.name ? ' <span class="a-log__target">' + esc(t.name) + '</span>' : '') + (a.detail ? ' <span class="a-log__detail">' + esc(a.detail) + '</span>' : '') +
          (a.reason ? '<span class="a-log__why">理由：' + esc(a.reason) + '</span>' : '') + '</span></li>';
    }).join('') + '</ul>' : AU.empty('まだ操作の記録はありません。');
    return AU.panel({ title: '最近の操作', id: 'dashLog', cls: 'a-dash__log', flush: true,
      actions: '<a class="ad-panel__link" href="#/settings?tab=audit">操作の記録</a>', body: body });
  }

  AD.screens.dashboard = {
    title: 'ダッシュボード',
    render: function (ctx) {
      var m = AD.data.metrics(), ms = AD.data.members(), n = CLG.now();
      var today = m.weekEvents.filter(function (e) { return sameDay(e.at, n); });
      var sub = U.fmtDate(n) + (today.length ? '・今日のイベント：' + today.map(function (e) {
        return e.title + '（' + U.pad(new Date(e.at).getHours()) + ':' + U.pad(new Date(e.at).getMinutes()) + '）';
      }).join('、') : '');
      return '<div class="a-dashboard">' +
        AU.head({ title: 'ダッシュボード', sub: sub }) +
        kpis(m, ms) +
        '<div class="a-dash__grid">' + todo(m) + liveCard(ctx) + '</div>' +
        '<div class="a-dash__grid a-dash__grid--b">' + stalledPanel(m) + eventsPanel(m) + '</div>' +
        auditPanel() +
      '</div>';
    },
    mount: function (root, ctx) {
      cur = ctx;
      if (root.__boundDash) return;
      root.__boundDash = true;
      function send(form) {
        var th = AD.data.thread('live');
        if (!AU.need('members', { kind: th && th.kind })) return;
        var ta = form.querySelector('textarea'), res = AD.ops.reply('live', ta.value);
        if (!res.ok) { U.fieldErrors(form, res.errors || { text: res.error }); return; }
        var name = AD.data.live().name;
        ta.value = '';
        U.toast(name + 'さんに返信しました', 'ok');
        cur.refresh({ focus: '#dlReply' });
      }
      root.addEventListener('submit', function (e) {
        var f = e.target.closest('.a-dashboard [data-dl-form]'); if (!f) return;
        e.preventDefault(); send(f);
      });
      // ⌘+Enter（Ctrl+Enter）でも送る
      root.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey) || e.isComposing) return;
        var f = e.target.closest('.a-dashboard [data-dl-form]'); if (!f) return;
        e.preventDefault(); send(f);
      });
      root.addEventListener('input', function (e) {
        var f = e.target.closest('.a-dashboard [data-dl-form]');
        if (f && e.target.getAttribute('aria-invalid')) U.fieldErrors(f, { text: '' }, { focus: false });
      });
    }
  };
})();
