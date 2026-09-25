/* ============================================================
   お知らせ（#/notices）
   ------------------------------------------------------------
   - 「すべて」と「未読」を切り替える（#/notices?tab=unread）。日ごとに区切る（今日・昨日・9月23日(水)）。
   - 行を押すと、そのお知らせだけ既読にして、その先へ移る（右上の鈴の印とメニューの数も変わる）。
     リンクのないお知らせは、既読にするだけ。
   - 「すべて既読にする」はページの上。未読がないときは出さない。
   - 30件を超えたら「さらに見る」で30件ずつ足す。
   - 通知を LINE・メールで受け取るかは、アカウントの「通知」（#/account?focus=notify）。会員期間が終わった人には出さない
     （アカウントに「通知」の欄がないため）。
   - 契約の状態で止めている画面へのお知らせは、リンクにしない（押しても止めた画面になるだけのため）。
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, U = CLG.ui, R = CLG.rules;
  var esc = U.esc, icon = U.icon;
  var cur = null;
  var PAGE = 30, upTo = PAGE;              // 長くなったら30件ずつ出す（画面を離れたら30件に戻す）

  /* 運営が書いたリンクでも、会員ページと公開サイトの中だけにする（骨組みの safeHref と同じ）。
     契約の状態（終了・支払いの猶予切れ・休会）で止めている画面へのリンクは、押しても止めた画面になるだけなのでリンクにしない */
  function safe(h) {
    h = String(h || '');
    if (!/^(#\/|index\.html|member\.html)/.test(h)) return '';
    var m = /^#\/([^/?]+)/.exec(h), g = m && R.planGate ? R.planGate(m[1]) : null;
    return g && g.ok === false ? '' : h;
  }
  function day0(d) { d = new Date(d); d.setHours(0, 0, 0, 0); return d; }
  function daysAgo(d) { return Math.round((day0(CLG.now()) - day0(d)) / 86400000); }
  /** 区切りの見出し：今日・昨日・9月23日(水)（去年のものだけ年を付ける） */
  function dayLabel(d) {
    var n = daysAgo(d);
    if (n <= 0) return '今日';
    if (n === 1) return '昨日';
    return U.fmtDate(d, { noYear: new Date(d).getFullYear() === CLG.now().getFullYear() });
  }
  /** 行の時刻：今日の分は「3時間前」、それより前は時刻だけ（日付は区切りの見出しにある） */
  function timeText(at) {
    if (new Date(at) > CLG.now()) return 'たった今';
    if (daysAgo(at) <= 0) return U.relTime(at);
    var d = new Date(at);
    return d.getHours() + ':' + U.pad(d.getMinutes());
  }

  function row(n, tab) {
    var href = safe(n.link || n.go), cls = 'li has-ico nt-row' + (n.unread ? ' is-unread' : '');
    var inner = '<span class="li__ico">' + icon(n.icon || 'bell') + '</span>' +
      '<span class="li__body"><span class="li__ttl">' + U.jp(n.text) + '</span>' +
        '<span class="li__sub"><time datetime="' + esc(n.at) + '">' + esc(timeText(n.at)) + '</time></span></span>' +
      (n.unread ? '<span class="udot" aria-hidden="true"></span><span class="sr-only">未読</span>' : '') +
      // リンクのない行も、未読の点をほかの行と同じ位置にそろえる（山かっこの幅をあける）
      (href ? U.chevron() : n.unread ? '<span class="nt-nochev" aria-hidden="true"></span>' : '');
    if (href) return '<a class="' + cls + '" href="' + esc(href) + '" data-notice="' + esc(n.id) + '">' + inner + '</a>';
    // リンクのない行：既読なら押せない行。未読なら押すと既読になるだけで、行は押せなくなるので、焦点は切り替えのボタンへ
    if (!n.unread) return '<div class="' + cls + '">' + inner + '</div>';
    return '<button type="button" class="' + cls + '" data-notice="' + esc(n.id) + '" data-focus-after="[data-nt-tab=\'' + tab + '\']">' + inner + '</button>';
  }
  /** 日ごとに分けて、区切りの見出しの下に一覧を置く */
  function groups(list, tab) {
    var out = [], last = null;
    list.forEach(function (n) {
      var k = day0(n.at).getTime();
      if (k !== last) { out.push({ label: dayLabel(n.at), items: [] }); last = k; }
      out[out.length - 1].items.push(n);
    });
    return out.map(function (g) {
      return '<section class="nt-day"><h2 class="group-ttl nt-day__ttl">' + esc(g.label) + '</h2>' +
        '<div class="list">' + g.items.map(function (n) { return row(n, tab); }).join('') + '</div></section>';
    }).join('');
  }
  function segBtn(key, label, n, tab) {
    return '<button type="button" data-nt-tab="' + key + '" aria-pressed="' + (key === tab) + '">' + esc(label) +
      '<span class="n num">' + n + '</span></button>';
  }

  CLG.screens.notices = {
    title: function (ctx) { return ctx.params.length ? 'ページが見つかりません' : 'お知らせ'; },
    render: function (ctx) {
      // お知らせ1件のページはない（押すとその先へ移る）
      if (ctx.params.length) return U.notFound({ lead: 'お知らせは一覧から開いてください。' });
      var tab = ctx.query.tab === 'unread' ? 'unread' : 'all';
      var all = R.notices(), unread = all.filter(function (n) { return n.unread; });
      var list = tab === 'unread' ? unread : all, body;
      if (list.length) {
        body = groups(list.slice(0, upTo), tab);
        if (list.length > upTo) {
          // 押したら、新しく出た最初の行（押せる行）へ焦点を移す
          var next = list.slice(upTo).filter(function (n) { return safe(n.link || n.go) || n.unread; })[0];
          body += '<div class="nt-more"><button type="button" class="btn btn-ghost" data-nt-more="1"' +
            (next ? ' data-focus-after="[data-notice=\'' + esc(next.id) + '\']"' : '') + '>さらに見る（残り' + (list.length - upTo) + '件）</button></div>';
        }
      }
      else if (tab === 'unread' && all.length) body = '<div class="card">' + U.empty('checkc', '未読のお知らせはありません', { href: '#/notices', label: 'すべて見る' }) + '</div>';
      else body = '<div class="card">' + U.empty('bell', 'まだお知らせはありません') + '</div>';
      return '<div class="scr-notices">' +
        '<div class="page-head nt-head">' +
          '<h1 class="page-ttl" data-page-title tabindex="-1">お知らせ</h1>' +
          (unread.length ? '<button type="button" class="btn btn-ghost btn-s" data-nt-readall="1" data-focus-after="[data-nt-tab=\'' + tab + '\']">すべて既読にする</button>' : '') +
        '</div>' +
        '<div class="nt-bar">' +
          // 1件もないときは「すべて 0／未読 0」を並べても意味がないので、切り替えは出さない
          (all.length ? '<div class="seg" role="group" aria-label="表示するお知らせ">' + segBtn('all', 'すべて', all.length, tab) + segBtn('unread', '未読', unread.length, tab) + '</div>' : '') +
          (R.plan().status === 'ended' ? '' : '<a class="nt-set" href="#/account?focus=notify">' + icon('settings', 'ico-s') + '通知の設定</a>') +
        '</div>' +
        body +
      '</div>';
    },
    mount: function (root, ctx) {
      cur = ctx;
      if (root.__boundNotices) return;
      root.__boundNotices = true;
      window.addEventListener('hashchange', function () { if (!/^#\/notices(\?|$)/.test(location.hash)) upTo = PAGE; });
      root.addEventListener('click', function (e) {
        var ctx = cur;
        if (!ctx || !e.target.closest) return;
        var tabBtn = e.target.closest('.scr-notices [data-nt-tab]');
        if (tabBtn) {
          var t = tabBtn.getAttribute('data-nt-tab');
          upTo = PAGE;
          ctx.go(t === 'unread' ? '#/notices?tab=unread' : '#/notices');
          return;
        }
        if (e.target.closest('.scr-notices [data-nt-more]')) { upTo += PAGE; ctx.refresh(); return; }
        if (e.target.closest('.scr-notices [data-nt-readall]')) {
          var n = R.markAllNoticesRead();
          ctx.refresh();
          ctx.announce(n ? 'すべて既読にしました' : '未読のお知らせはありません');
          return;
        }
        var it = e.target.closest('.scr-notices [data-notice]');
        if (!it) return;
        // そのお知らせだけ既読に。リンクの行はそのまま先へ移る（store の更新で鈴の印も変わる）
        R.markNoticeRead(it.getAttribute('data-notice'));
        if (it.tagName !== 'A') ctx.refresh();
      });
    }
  };
})();
