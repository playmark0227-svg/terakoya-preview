/* ============================================================
   ホーム（#/home）
   上から：見出し → 今日の会（あるときだけ）→ 続きから（講座かスタートガイドの次の1つ）→
   未読など → 2段組み（左：新着・イベント／右：案件と紹介・学びのレベル）。
   1段になる幅では、新着 → イベント → 案件と紹介 → 学びのレベルの順に並ぶ。
   数字は本人の記録だけ。行はそれぞれの行き先（投稿1件・イベント1件）へ直接つなぐ。
   スタートガイドの項目のボタンは、スタートガイドと同じもの（CLG.screens.start.stepAction）。
   支払いの猶予切れ・休会のあいだは、使えるもの（相談・会員証・アカウント）とレベルだけを出す（limitedHome）。
   止まっている理由は骨組みの帯（R.planBanner。支払いエラーのまま解約した人も同じ帯）が出す。帯が出ないときだけ、ここで1回書く。
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon;
  var cur = null;
  var WD = ['日', '月', '火', '水', '木', '金', '土'];

  /* ---------- 小さな道具 ---------- */
  var firstLine = function (text) { return String(text || '').split('\n')[0]; };
  var hhmm = function (at) { var d = new Date(at); return U.pad(d.getHours()) + ':' + U.pad(d.getMinutes()); };
  var start = function () { return CLG.screens.start || null; };
  /** 区切りの見出し。リンクは見出しの外に置く（見出しの名前にリンクの文字が混ざらないように） */
  function secHead(id, title, link) {
    return '<div class="home-sec__head"><h2 class="sec-ttl" id="' + id + '">' + esc(title) + '</h2>' +
      (link ? '<a class="home-sec__more" href="' + esc(link[0]) + '">' + esc(link[1]) + '</a>' : '') + '</div>';
  }
  /** 行の札。広い幅では右端、狭い幅（本文368px以下）では題の下に出す（CSSで片方だけ見せる） */
  function tagPair(tag) {
    return { under: '<span class="home-tag home-tag--under">' + tag + '</span>', end: '<span class="home-tag home-tag--end">' + tag + '</span>' };
  }

  /* ---------- いちばん上に何を出すか ----------
     入会して7日以内か、まだ1本も見ていない人はスタートガイドの次の項目。
     それ以外は、続きの講座の次の1本。 */
  function pickFocus(ctx, ob) {
    var noLessons = !Object.keys(ctx.state.done).length;
    if (!ob.finished && ob.current && (ob.day <= 7 || noLessons)) return { kind: 'step', step: ob.current };
    var cont = R.continueList()[0];
    if (cont && cont.st.next) return { kind: 'lesson', c: cont.c, st: cont.st, l: cont.st.next };
    if (!ob.finished && ob.current) return { kind: 'step', step: ob.current };
    return { kind: 'rest' };
  }

  /* ---------- 見出し ---------- */
  function head(limited) {
    var sk = R.streak();
    // 入会の月（「（2026年9月入会）」）は、狭い幅では隠す（「・」が行の終わりに残って2行になるため。会員証とアカウントにもある）
    var meta = '<span class="nw">入会' + esc(R.day()) + '日目</span><span class="home-meta__cohort">（' + esc(R.cohort()) + '）</span>';
    // 「1週連続」は日本語として変なので、2週から出す。講座を止めているあいだ（休会・猶予切れ）は「学習中」と言わない
    if (sk.weeks >= 2 && !limited) meta += '・<span class="nw">' + esc(sk.thisWeek ? sk.weeks + '週連続で学習中' : '先週まで' + sk.weeks + '週連続') + '</span>';
    return '<header class="page-head home-head">' +
      '<h1 class="page-ttl" data-page-title tabindex="-1">ホーム</h1>' +
      '<p class="home-meta">' + meta + '</p>' +
    '</header>';
  }

  /* ---------- 今日の会（あるときだけ、いちばん上に） ---------- */
  /** 1件ぶんの状態の文（esc 済みの HTML）と、押すもの。live：いま入れる（朱のボタン）。
      「予約済み・」のあとは1かたまりで折る（「19:30から／入れます」と割れないように） */
  function todayState(e) {
    var a = e.access || R.eventAccess(e.id) || {}, id = esc(e.id), href = '#/events/' + encodeURIComponent(e.id);
    var view = '<a class="btn btn-soft btn-s home-today__btn" href="' + href + '" data-home-today="' + id + '">見る</a>';
    function booked(rest) { return '予約済み' + (rest ? '・<span class="nw">' + esc(rest) + '</span>' : ''); }
    if (e.reserved) {
      if (a.online && a.ready) {
        return { live: true, sub: a.live ? '開催中です' : booked('Zoomに入れます'),
          btn: '<button type="button" class="btn btn-primary btn-s home-today__btn" data-home-today="' + id + '" data-home-join="' + id + '">参加する</button>' };
      }
      if (a.online) return { sub: booked(hhmm(a.opensAt) + 'から入れます'), btn: view };
      return { sub: booked(a.venue ? a.venue.name : ''), btn: view };
    }
    if (R.eventOpen(e.id)) {
      return { sub: U.jp(e.place),
        btn: '<button type="button" class="btn btn-ink btn-s home-today__btn" data-home-today="' + id + '" data-home-reserve="' + id + '">予約する</button>' };
    }
    return { sub: R.isFull(e.id) ? '満席' : U.jp(e.place), btn: view };
  }
  function today(list) {
    if (!list.length) return { html: '', live: false };
    var live = false;
    var rows = list.map(function (e) {
      var s = todayState(e);
      if (s.live) live = true;
      return '<div class="home-today__row">' +
        '<p class="home-today__when"><b>今日</b> <span class="num">' + esc(hhmm(e.at)) + '〜</span></p>' +
        '<div class="home-today__body">' +
          '<p class="home-today__ttl"><a href="#/events/' + encodeURIComponent(e.id) + '">' + U.jp(e.title) + '</a></p>' +
          '<p class="home-today__sub">' + s.sub + '</p>' +
        '</div>' + s.btn +
      '</div>';
    }).join('');
    return { live: live, html: '<section class="card home-today" aria-label="今日のイベント">' + rows + '</section>' };
  }

  /* ---------- 続きから（1つだけ） ---------- */
  function focusLesson(f, quiet) {
    // 今日の会に「参加する」（朱）が出ているときは、こちらを墨にして朱を1つにする。
    // 講座の名前は文字だけ（resumeCard の 'home'）。講座の目次へは見出しの「講座を見る」から
    var html = U.resumeCard(f.c, f.l, { variant: 'home', st: f.st, resumeText: R.resumeText(f.l.id), h: 'h3', btnCls: quiet ? 'btn-ink' : 'btn-primary' });
    return '<section class="home-sec home-next" aria-labelledby="homeNextTtl">' +
      secHead('homeNextTtl', f.st.started ? '続きから' : '次に見る講座', ['#/courses', '講座を見る']) + html +
    '</section>';
  }

  function focusStep(f, ob, quiet) {
    var s = f.step, S = start();
    var a = S ? S.stepAction(s) : { label: '開く', href: s.go };
    var sub = s.id === 'profile' && ob.missing && ob.missing.text ? ob.missing.text : s.desc;
    var cls = 'btn ' + (a.soft || quiet ? 'btn-ink' : 'btn-primary') + ' home-step__btn';
    // data-home-next：LINE の連携などで項目が済んで、押したボタンが次の項目のボタンに替わっても、窓を閉じたらそこへ焦点が戻る
    var btn = S ? S.actionHtml(a, cls, 'data-home-step', 'data-home-next') : '<a class="' + cls + '" href="' + esc(a.href) + '">' + esc(a.label) + '</a>';
    return '<section class="home-sec home-next" aria-labelledby="homeNextTtl">' +
      secHead('homeNextTtl', 'スタートガイド', ['#/start', 'スタートガイドを見る']) +
      '<div class="card home-step">' +
        '<div class="home-step__body">' +
          '<h3 class="home-step__ttl">' + U.jp(s.title) + '</h3>' +
          '<p class="home-step__sub">' + U.jp(sub) + '</p>' +
          '<div class="home-step__prog">' + U.progressBar(ob.pct, 'ink',
            { label: 'スタートガイドの進みぐあい', valuetext: ob.total + '項目のうち' + ob.done + '項目済み' }) +
            '<span class="num">' + ob.done + '/' + ob.total + '</span></div>' +
        '</div>' + btn +
      '</div>' +
    '</section>';
  }

  /* 開いている講座をすべて見終えたとき */
  function focusRest(ctx) {
    var lv = R.level(), seen = ctx.state.archiveSeen || {};
    var unseen = DATA.ARCHIVE.filter(function (a) { return !seen[a.id]; }).length;
    // まだ見ていない勉強会の録画があればそちらへ。なければ講座の一覧（朱にはしない）
    var toArchive = unseen > 0;
    var sub = lv.next ? 'Lv' + lv.next.lv + 'まであと' + U.num(lv.toNext) + 'XP。' + (toArchive ? '勉強会の録画を見てもXPが入ります。' : '')
      : toArchive ? 'まだ見ていない勉強会の録画が' + unseen + '本あります。' : '';
    return '<section class="home-sec home-next" aria-labelledby="homeNextTtl">' +
      secHead('homeNextTtl', '講座', toArchive ? ['#/courses', '講座を見る'] : null) +
      '<div class="card home-step">' +
        '<div class="home-step__body">' +
          '<h3 class="home-step__ttl">' + (lv.next ? '開いている講座は全部見終わりました' : '全部の講座を見終わりました') + '</h3>' +
          (sub ? '<p class="home-step__sub">' + U.jp(sub) + '</p>' : '') +
        '</div>' +
        '<a class="btn ' + (toArchive ? 'btn-primary' : 'btn-soft') + ' home-step__btn" href="' + (toArchive ? '#/courses?tab=archive' : '#/courses') + '">' +
          (toArchive ? '録画を見る' : '講座を見る') + '</a>' +
      '</div>' +
    '</section>';
  }

  /* ---------- 未読・スタートガイド・予約（最大3行） ---------- */
  function quick(ob, focus, shownEv) {
    var rows = [];
    var unread = R.unread();
    if (unread) {
      var last = R.thread().filter(function (m) { return m.from !== 'me'; }).slice(-1)[0];
      var who = last ? R.person(last.from) : null;
      var t1 = tagPair('<span class="tag tag-indigo">未読 ' + unread + '</span>');
      rows.push('<a class="li has-ico" href="#/messages">' +
        '<span class="li__ico">' + icon('message') + '</span>' +
        '<span class="li__body"><span class="li__ttl">運営からのメッセージ</span>' + t1.under +
          '<span class="li__sub home-clamp">' + (who ? esc(who.name) + '：' : '') + esc(last ? firstLine(last.text) : '') + '</span></span>' +
        '<span class="li__end">' + t1.end + U.chevron() + '</span></a>');
    }
    // 上がスタートガイドのときは、同じものを2回出さない
    if (!ob.finished && focus.kind !== 'step') {
      // 成果発表会の項目は題が「次の成果発表会（M/D）」なので、「次：」を付けない
      var nx = ob.current ? (ob.current.outside ? ob.current.title : '次：' + ob.current.title) : '';
      rows.push('<a class="li has-ico" href="#/start">' +
        '<span class="li__ico">' + icon('flag') + '</span>' +
        '<span class="li__body"><span class="li__ttl">スタートガイド</span>' +
          (nx ? '<span class="li__sub home-clamp">' + U.jp(nx) + '</span>' : '') + '</span>' +
        '<span class="li__end"><span class="num home-count">' + ob.done + '/' + ob.total + '</span>' + U.chevron() + '</span></a>');
    }
    // 予約中のイベントは、今日の会・下の「イベント」に出ていないときだけ
    var ev = R.myUpcoming().filter(function (e) { return shownEv.indexOf(e.id) < 0; })[0];
    if (ev) {
      var t2 = tagPair(U.statusTag('reserved'));
      rows.push('<a class="li has-ico" href="#/events/' + encodeURIComponent(ev.id) + '">' +
        '<span class="li__ico">' + icon('calendar') + '</span>' +
        '<span class="li__body"><span class="li__ttl">' + U.jp(ev.title) + '</span>' + t2.under +
          '<span class="li__sub home-clamp">' + U.jp(U.fmtShort(ev.at, true) + '・' + ev.place) + '</span></span>' +
        '<span class="li__end">' + t2.end + U.chevron() + '</span></a>');
    }
    if (!rows.length) return '';
    return '<div class="list home-quick" role="group" aria-label="お知らせ">' + rows.slice(0, 3).join('') + '</div>';
  }

  /* ---------- 新着（タイムラインから3件。押すとその投稿） ---------- */
  function latest() {
    var items = R.feed().slice().sort(function (a, b) { return new Date(b.at) - new Date(a.at); }).slice(0, 3);
    var body = items.length ? '<div class="list">' + items.map(function (p) {
      var who = R.person(p.by);
      return '<a class="li home-post" href="#/feed/' + encodeURIComponent(p.id) + '">' +
        U.avatar(who, 's') +
        '<span class="li__body">' +
          '<span class="home-post__by"><b>' + esc(who.name) + '</b><span>' + esc(U.relTime(p.at)) + '</span></span>' +
          '<span class="home-post__txt">' + esc(firstLine(p.text)) + '</span>' +
        '</span></a>';
    }).join('') + '</div>'
      : '<div class="card">' + U.empty('', 'まだ投稿はありません', { href: '#/feed', label: 'タイムラインを見る' }) + '</div>';
    return '<section class="home-sec home-sec--feed" aria-labelledby="homeFeedTtl">' +
      secHead('homeFeedTtl', '新着', items.length ? ['#/feed', 'タイムラインを見る'] : null) + body +
    '</section>';
  }

  /* ---------- イベント（2件） ---------- */
  function events(list) {
    var body = list.length ? '<div class="list">' + list.map(function (e) {
      var d = new Date(e.at), t = tagPair(U.statusTag('reserved'));
      var reserved = R.isReserved(e.id);
      return '<a class="li home-ev" href="#/events/' + encodeURIComponent(e.id) + '">' +
        '<span class="home-ev__when"><b class="num">' + (d.getMonth() + 1) + '/' + d.getDate() + '</b>(' + WD[d.getDay()] + ')' +
          '<span class="num">' + esc(hhmm(e.at)) + '〜</span></span>' +
        '<span class="li__body"><span class="li__ttl">' + U.jp(e.title) + '</span>' + (reserved ? t.under : '') +
          '<span class="li__sub">' + U.jp(e.place) + '</span></span>' +
        '<span class="li__end">' + (reserved ? t.end : '') + U.chevron() + '</span></a>';
    }).join('') + '</div>'
      : '<div class="card">' + U.empty('', '予定しているイベントはまだありません') + '</div>';
    return '<section class="home-sec home-sec--ev" aria-labelledby="homeEvTtl">' +
      secHead('homeEvTtl', 'イベント', ['#/events', 'イベントを見る']) + body +
    '</section>';
  }

  /* ---------- 学びのレベル ----------
     上の面（レベル・XP・次まで）は「レベルのしくみ」を開くボタン。XPの棒は、左の帯に同じものがある
     タブレットとパソコンでは出さない。下に次のレベルで開く講座（押すと講座の目次） */
  function levelCard(noCourses) {
    var lv = R.level();
    var next = lv.next && !noCourses ? R.coursesAtLevel(lv.next.lv) : [];
    var rows = next.map(function (c) {
      var t = DATA.PEOPLE[c.teacher];
      return '<a class="li home-lvc" href="#/courses/' + encodeURIComponent(c.id) + '">' +
        '<span class="home-lvc__thumb" aria-hidden="true">' +
          (c.img ? '<img src="' + esc(c.img) + '" alt="" loading="lazy" decoding="async">' : '') +
          '<span class="home-lvc__lock">' + icon('lock', 'ico-s') + '</span></span>' +
        '<span class="li__body"><span class="li__ttl">' + U.jp(c.title) + '</span>' +
          '<span class="li__sub">' + U.jp('全' + c.lessons.length + '回' + (t ? '・講師 ' + t.name : '')) + '</span></span>' +
        U.chevron() + '</a>';
    }).join('');
    return '<section class="home-sec home-sec--lv" aria-labelledby="homeLvTtl">' +
      secHead('homeLvTtl', '学びのレベル', null) +
      '<div class="card home-lv">' +
        '<button type="button" class="home-lv__btn" data-home-level>' +
          '<span class="home-lv__row">' + U.lvBadge(lv.lv, lv.name) +
            '<span class="home-lv__xp"><b class="num">' + U.num(lv.xp) + '</b> XP</span></span>' +
          '<span class="home-lv__bar">' + U.progressBar(lv.pct, 'gold', { decorative: true }) + '</span>' +
          '<span class="home-lv__to">' + (lv.next
            ? 'Lv' + esc(lv.next.lv) + '「' + esc(lv.next.name) + '」まであと<b class="num">' + U.num(lv.toNext) + '</b>XP'
            : '最高レベルです。講座は全部開いています。') + '</span>' +
          '<span class="home-lv__more">レベルのしくみ' + U.chevron() + '</span>' +
        '</button>' +
        (rows ? '<p class="home-lv__open" id="homeLvOpen">Lv' + esc(lv.next.lv) + 'で開く講座</p>' +
          '<div class="list" role="group" aria-labelledby="homeLvOpen">' + rows + '</div>' : '') +
      '</div>' +
    '</section>';
  }

  /* ---------- 案件・紹介（本人の分だけ） ---------- */
  function gigsAndReferral(ctx) {
    var gigs = ctx.state.gigs || {}, ids = Object.keys(gigs).filter(function (id) { return R.gigState(id); });
    var rows;
    if (ids.length) {
      var counts = {}, L = R.GIG_LABELS || {};
      ids.forEach(function (id) { var k = R.gigState(id).key; counts[k] = (counts[k] || 0) + 1; });
      var parts = Object.keys(L).filter(function (k) { return counts[k]; })
        .map(function (k) { return L[k] + ' ' + counts[k] + '件'; });
      rows = '<a class="li" href="#/gigs">' +
        '<span class="li__body"><span class="li__ttl">応募した案件</span>' +
          '<span class="li__sub">' + U.jp(parts.join('・')) + '</span></span>' +
        '<span class="li__end"><span class="num home-count">' + ids.length + '件</span>' + U.chevron() + '</span></a>';
    } else {
      var open = DATA.GIGS.filter(function (g) { return !R.gigLock(g).locked; }).length;
      rows = '<a class="li" href="#/gigs">' +
        '<span class="li__body"><span class="li__ttl">いま応募できる案件</span></span>' +
        '<span class="li__end"><span class="num home-count">' + open + '件</span>' + U.chevron() + '</span></a>';
    }

    // 紹介の行は、本人に紹介の記録があるときだけ。ホームから紹介を勧めることはしない
    var ref = R.referral(), hasRef = !!(ref.list.length && (ref.held || ref.confirmed));
    if (hasRef) {
      var held = ref.held > 0;
      rows += '<a class="li" href="#/referral">' +
        '<span class="li__body"><span class="li__ttl">' + (held ? '紹介報酬（保留中）' : '紹介報酬（確定）') + '</span>' +
          '<span class="li__sub">' + U.jp(held ? ref.holdDays + '日たって返金・解約がなければ確定' : ref.closeLabel) + '</span></span>' +
        '<span class="li__end"><span class="num home-count">' + esc(U.yen(held ? ref.held : ref.confirmed)) + '</span>' + U.chevron() + '</span></a>';
    }
    return '<section class="home-sec home-sec--money" aria-labelledby="homeMoneyTtl">' +
      secHead('homeMoneyTtl', hasRef ? '案件・紹介' : '案件', null) +
      '<div class="list">' + rows + '</div>' +
    '</section>';
  }

  /* ---------- 支払いの猶予切れ・休会のとき ----------
     講座・タイムライン・イベント・案件は止まっている（帯の知らせは骨組みが出す）。
     止まっている画面へのリンクを並べても行き止まりになるので、使えるものとレベルだけを出す */
  function limitedHome(ob) {
    var unread = R.unread(), p = R.plan();
    function row(href, ico, ttl, end) {
      return '<a class="li has-ico" href="' + esc(href) + '">' +
        '<span class="li__ico">' + icon(ico) + '</span>' +
        '<span class="li__body"><span class="li__ttl">' + esc(ttl) + '</span></span>' +
        '<span class="li__end">' + (end || '') + U.chevron() + '</span></a>';
    }
    var rows = row('#/messages', 'message', '相談・メッセージ', unread ? '<span class="tag tag-indigo">未読 ' + unread + '</span>' : '') +
      (ob.finished ? '' : row('#/start', 'flag', 'スタートガイド', '<span class="num home-count">' + ob.done + '/' + ob.total + '</span>')) +
      row('#/card', 'card', '会員証') +
      // 止まっているのは休会か、お支払いの期限切れ（支払いエラーのまま解約した人も）。お支払いはカードの場所へ
      row('#/account?focus=' + (p.status === 'paused' ? 'plan' : 'card'), 'user', p.status === 'paused' ? 'アカウント（休会）' : 'アカウント（お支払い）');
    // 骨組みの帯（R.planBanner）が出ないときだけ、止まっている理由をここで1回だけ言う（いまのルールでは帯が出るので、念のため）
    var why = R.planBanner && !R.planBanner()
      ? '<div class="notice notice-warn home-stop">' + icon('alert') + '<div><b>お支払いが確認できないため、講座・タイムライン・イベント・案件を止めています。</b>' +
        (p.lastDay ? '<span class="nw">' + esc(U.fmtDate(p.lastDay, { noYear: new Date(p.lastDay).getFullYear() === CLG.now().getFullYear() })) + 'で</span>会員期間が終わります。' : '') + '</div></div>'
      : '';
    return why + '<div class="home-cols home-cols--stop">' +
      '<div class="home-col"><section class="home-sec" aria-labelledby="homeUseTtl">' + secHead('homeUseTtl', 'いま使えるもの', null) +
        '<div class="list">' + rows + '</div></section></div>' +
      '<div class="home-col">' + levelCard(true) + '</div>' +
    '</div>';
  }

  /* ---------- 押したとき ---------- */
  function reserveToday(id) {
    var e = R.event(id);
    if (!e || R.isReserved(id)) return;
    var r = R.reserve(id);
    if (!r) { U.toast(R.isFull(id) ? '満席になりました' : '予約できませんでした', 'error'); cur.refresh(); return; }
    CLG.app.reward(r);
    U.toast('「' + e.title + '」を予約しました（今日 ' + hhmm(e.at) + '〜）', 'ok');
    cur.refresh();
  }
  function joinToday(id) {
    var a = R.eventAccess(id);
    if (!a || !a.zoomUrl) { cur.refresh(); return; }
    // 試作版の Zoom は置き場所だけのアドレスなので、開かずに何が起きるかを言う
    if (a.zoomUrl === DATA.SITE.zoomPlaceholder) { U.toast('本番ではZoomが開きます'); return; }
    try { window.open(a.zoomUrl, '_blank', 'noopener'); } catch (e) {}
  }

  CLG.screens.home = {
    title: 'ホーム',
    render: function (ctx) {
      var ob = R.onboarding();
      if (R.plan().limited) return '<div class="scr-home">' + head(true) + limitedHome(ob) + '</div>';
      var focus = pickFocus(ctx, ob);
      var todays = R.todayEvents().slice(0, 2);
      var todayIds = todays.map(function (e) { return e.id; });
      var evList = R.upcoming().filter(function (e) { return todayIds.indexOf(e.id) < 0; }).slice(0, 2);
      var shownEv = todayIds.concat(evList.map(function (e) { return e.id; }));
      var t = today(todays);
      var focusHtml = focus.kind === 'lesson' ? focusLesson(focus, t.live)
        : focus.kind === 'step' ? focusStep(focus, ob, t.live) : focusRest(ctx);
      return '<div class="scr-home">' +
        head() +
        t.html +
        focusHtml +
        quick(ob, focus, shownEv) +
        '<div class="home-cols">' +
          // 案件と紹介は右の上に置く（左に3つ積むと、右の学びのレベルとの高さの差が大きいため）
          '<div class="home-col">' + latest() + events(evList) + '</div>' +
          '<div class="home-col">' + gigsAndReferral(ctx) + levelCard() + '</div>' +
        '</div>' +
      '</div>';
    },
    mount: function (root, ctx) {
      cur = ctx;
      // root は画面が変わっても同じ要素なので、付けるのは1回だけ
      if (root.__boundHome) return;
      root.__boundHome = true;
      root.addEventListener('click', function (e) {
        var b = e.target.closest('.scr-home [data-home-level], .scr-home [data-home-step], .scr-home [data-home-reserve], .scr-home [data-home-join]');
        if (!b) return;
        if (b.hasAttribute('data-home-level')) { CLG.app.levelInfo(); return; }
        if (b.hasAttribute('data-home-reserve')) { reserveToday(b.getAttribute('data-home-reserve')); return; }
        if (b.hasAttribute('data-home-join')) { joinToday(b.getAttribute('data-home-join')); return; }
        var S = start();
        if (S) S.runStep(b.getAttribute('data-home-step'), b.getAttribute('data-id'), cur);
      });
    }
  };
})();
