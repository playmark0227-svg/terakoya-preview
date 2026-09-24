/* ============================================================
   イベント（#/events）
   ------------------------------------------------------------
   これから / 予約済み / 参加した を切り替え、日付の順に1枚の一覧で並べる。
   写真は種類ごとの1枚（DATA.EVENT_IMG）を一覧の行と詳細の窓に出す。参加したの一覧には出さない。
   予約・取り消し・参加は R.reserve / R.unreserve / R.attend だけで行う。
   #/events/e2 のように開くと、そのイベントの詳細を最初から開く。
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon;

  var TABS = [['upcoming', 'これから'], ['reserved', '予約済み'], ['attended', '参加した']];
  var KINDS = [['all', 'すべて'], ['online', 'オンライン'], ['offline', '会場'], ['showcase', '成果発表会']];

  // 画面の中だけの状態。URL の ?tab= / ?kind= が変わったときだけ上書きする
  var view = { tab: 'upcoming', kind: 'all', qk: null, opened: null, owner: null };

  // #/events/e4 の詳細は「その URL に来たとき」に1回だけ開く。
  // 別の画面へ行って同じリンクで戻ってきたときにも開くよう、URL が変わるたびに忘れる
  // （Node の確認ツールには addEventListener がないので確かめてから付ける）
  if (window.addEventListener) window.addEventListener('hashchange', function () { view.opened = null; });

  /* ---------- 小さな道具 ---------- */
  function has(list, key) { return list.some(function (x) { return x[0] === key; }); }
  function endOf(e) { return new Date(new Date(e.at).getTime() + e.min * 60000); }
  function hm(d) { return U.pad(d.getHours()) + ':' + U.pad(d.getMinutes()); }
  function timeRange(e) { return hm(new Date(e.at)) + '–' + hm(endOf(e)); }
  function dayDiff(d) {
    var a = new Date(d); a.setHours(0, 0, 0, 0);
    var n = CLG.now(); n.setHours(0, 0, 0, 0);
    return Math.round((a - n) / 86400000);
  }
  /** 今日・明日だけ文字で添える（それより先は日付を見れば分かる） */
  function relDay(d) {
    var n = dayDiff(d);
    return n === 0 ? '今日' : n === 1 ? '明日' : '';
  }
  function fee(e) { return typeof e.fee === 'number' ? (e.fee ? U.yen(e.fee) : '無料') : String(e.fee || '無料'); }
  function attendedMap() {
    var m = {};
    CLG.store.state.attended.forEach(function (a) { m[a.id] = true; });
    return m;
  }
  /** 残りの席。自分が予約していれば、その1席も埋まっているものとして数える */
  function seats(e) {
    var taken = Math.min(e.cap, e.count + (R.isReserved(e.id) ? 1 : 0));
    var left = Math.max(0, e.cap - taken);
    return { left: left, pct: taken / e.cap * 100, few: left > 0 && left <= Math.max(3, Math.ceil(e.cap * 0.2)) };
  }
  function host(e) {
    var p = R.person(e.host);
    return {
      p: p,
      name: p.staff ? p.name : p.name + 'さん',
      sub: p.staff ? (p.role || '運営') : '会員' + (p.area ? '・' + p.area : '')
    };
  }
  function byKind(list) {
    return view.kind === 'all' ? list : list.filter(function (e) { return e.kind === view.kind; });
  }

  /* ---------- 写真（種類ごとに1枚。DATA.EVENT_IMG） ---------- */
  var PHOTO_ALT = {
    online: '夜、自宅でパソコンを見ながらメモを取る男性',
    offline: 'カフェのテーブルを囲んで話す人たち',
    showcase: 'テレビの前で話す女性と、座って聞く人たち'
  };
  /** w・h は枠の比率を先に決めておくための値（読み込みでずれないように） */
  function photo(e, cls, w, h) {
    // イベントごとの写真（e.img）があればそれ、なければ種類ごとの写真
    var src = e.img || (DATA.EVENT_IMG && DATA.EVENT_IMG[e.kind]);
    if (!src) return '';
    return '<img class="' + cls + '" src="' + esc(src) + '" width="' + w + '" height="' + h + '"' +
      ' alt="' + esc((e.img && e.alt) || PHOTO_ALT[e.kind] || '') + '" loading="lazy" decoding="async">';
  }

  /* ---------- カレンダー（.ics） ---------- */
  function icsDate(d) { return new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
  function icsText(s) {
    return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }
  // 1行75オクテットで折り返す（RFC 5545）。日本語は1文字3バイトなのでバイトで数える。
  // 「\n」などのエスケープは途中で切らない（切ると読めないカレンダーがあるため）
  function fold(line) {
    var out = '', n = 0;
    for (var i = 0; i < line.length; i++) {
      var ch = line.charAt(i), code = line.charCodeAt(i), b;
      if (ch === '\\' && i + 1 < line.length) { ch = line.substr(i, 2); i++; b = 2; }
      else if (code >= 0xD800 && code <= 0xDBFF && i + 1 < line.length) { ch = line.substr(i, 2); i++; b = 4; }
      else b = code < 0x80 ? 1 : code < 0x800 ? 2 : 3;
      if (n + b > 75) { out += '\r\n '; n = 1; }
      out += ch; n += b;
    }
    return out;
  }
  function icsFor(e) {
    var h = host(e);
    var domain = String(DATA.SITE.siteUrl || '').replace(/^https?:\/\//, '').replace(/[\/?#].*$/, '') || 'example.com';
    var desc = (e.desc || '') +
      '\n\n主催：' + h.name + '（' + h.sub + '）\n参加費：' + fee(e) +
      '\n' + DATA.SITE.name + ' 会員ページ「イベント」から追加';
    var lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//' + DATA.SITE.name + '//Member Page Prototype//JA',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:' + e.id + '-' + icsDate(e.at) + '@' + domain,
      'DTSTAMP:' + icsDate(CLG.now()),
      'DTSTART:' + icsDate(e.at),
      'DTEND:' + icsDate(endOf(e)),
      'SUMMARY:' + icsText('【' + DATA.SITE.name + '】' + e.title),
      'LOCATION:' + icsText(e.place),
      'DESCRIPTION:' + icsText(desc),
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:' + icsText(e.title),
      'TRIGGER:-PT30M',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR'
    ];
    return lines.map(fold).join('\r\n') + '\r\n';
  }
  // U.download は先頭に BOM を付ける（CSV を Excel で開くため）。
  // .ics は BOM があると読み込めないカレンダーがあるので、ここだけ BOM なしで保存する
  function saveIcs(e) {
    var blob = new Blob([icsFor(e)], { type: 'text/calendar;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'event.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    U.toast('カレンダー用のファイルを保存しました', 'ok');
  }

  /* ---------- 一覧 ---------- */
  /** 左の列：日付と開始時刻 */
  function whenCol(e) {
    var d = new Date(e.at), rel = relDay(d);
    return '<div class="ev__when">' +
      '<b>' + U.fmtShort(d) + '</b>' +
      '<span class="num">' + hm(d) + (rel ? '<span class="ev__rel">' + rel + '</span>' : '') + '</span>' +
    '</div>';
  }

  function action(e, done, reserved, st) {
    var id = esc(e.id);
    if (done) return '<span class="tag tag-ok">参加済み</span>';
    if (reserved) {
      // 「予約済み」タブでは全部が予約済みなので、札は出さない
      return (view.tab === 'reserved' ? '' : '<span class="tag tag-ok">予約済み</span>') +
        '<button type="button" class="btn btn-text btn-s" data-ev="unreserve" data-id="' + id + '">取り消す</button>';
    }
    var seat = st.left ? '<span class="ev__seats' + (st.few ? ' is-few' : '') + '">残り' + st.left + '席</span>'
      : '<span class="ev__seats is-few">満席</span>';
    return seat + (st.left
      ? '<button type="button" class="btn btn-ink btn-s" data-ev="reserve" data-id="' + id + '">予約する</button>'
      : '<button type="button" class="btn btn-soft btn-s" data-ev="wait" data-id="' + id + '">キャンセル待ち</button>');
  }

  function row(e, att) {
    var reserved = R.isReserved(e.id), done = !!att[e.id], st = seats(e), h = host(e);
    return '<article class="ev' + (reserved ? ' is-reserved' : '') + (done ? ' is-done' : '') + '" data-open="' + esc(e.id) + '">' +
      whenCol(e) +
      photo(e, 'ev__photo', 120, 80) +
      '<div class="ev__body">' +
        '<h3 class="ev__ttl"><button type="button" class="ev__link" aria-haspopup="dialog">' + esc(e.title) + '</button></h3>' +
        '<p class="ev__meta">' + e.min + '分・' + esc(e.place) + '・' + esc(fee(e)) + (e.recording ? '・録画あり' : '') + '</p>' +
        '<p class="ev__host">主催 ' + esc(h.name) + '</p>' +
      '</div>' +
      '<div class="ev__act">' + action(e, done, reserved, st) + '</div>' +
    '</article>';
  }

  function listHtml(list, att) {
    return '<div class="card ev-list">' + list.map(function (e) { return row(e, att); }).join('') + '</div>';
  }

  function emptyCard(text, btn) {
    return '<div class="card ev-empty"><p>' + esc(text) + '</p>' + (btn || '') + '</div>';
  }
  var SHOW_ALL = '<button type="button" class="btn btn-soft btn-s" data-ev-kind="all">すべて表示</button>';
  var TO_UPCOMING = '<button type="button" class="btn btn-soft btn-s" data-ev-tab="upcoming">これからのイベント</button>';

  /** スタートガイドの「イベントに参加する」が残っている人にだけ、近いオンラインの会を1つすすめる */
  function topNote() {
    if (R.myUpcoming().length) return '';
    var step = R.steps().filter(function (s) { return s.id === 'event'; })[0];
    if (!step || step.done) return '';
    var rec = R.upcoming().filter(function (e) { return e.kind === 'online' && seats(e).left > 0; })[0];
    if (!rec) return '';
    return '<div class="notice ev-top">' +
      '<p class="ev-top__txt">はじめてなら、' + U.fmtShort(rec.at, true) + 'の「' + esc(rec.title) + '」がおすすめです。</p>' +
      '<button type="button" class="btn btn-text btn-s" data-open="' + esc(rec.id) + '">詳細を見る</button></div>';
  }

  function upcomingView(att) {
    var all = R.upcoming(), list = byKind(all);
    if (!all.length) return emptyCard('予定しているイベントはありません。');
    if (!list.length) return emptyCard('この種類のイベントは予定がありません。', SHOW_ALL);
    return topNote() + listHtml(list, att);
  }

  function reservedView(att) {
    var all = R.myUpcoming(), list = byKind(all);
    if (!all.length) return emptyCard('予約しているイベントはありません。', TO_UPCOMING);
    if (!list.length) return emptyCard('この種類で予約しているイベントはありません。', SHOW_ALL);
    return listHtml(list, att) +
      '<p class="ev-foot-note">行けなくなったら、早めに取り消してください。</p>';
  }

  function attendedView() {
    var list = CLG.store.state.attended.slice().sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
    if (!list.length) return emptyCard('参加したイベントはまだありません。', TO_UPCOMING);
    return '<div class="card ev-list">' + list.map(function (a) {
      return '<div class="ev ev-past">' +
        '<div class="ev__when"><b>' + U.fmtShort(a.at) + '</b></div>' +
        '<div class="ev__body"><p class="ev__ttl">' + esc(a.title) + '</p></div>' +
        '<div class="ev__act ev__xp num">+' + DATA.XP.event + ' XP</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  /* ---------- 詳細の窓 ---------- */
  /** confirming：窓の中で「取り消しますか」を聞いているところ。
      確認の窓を重ねると、Esc で下の窓まで閉じたり、背景がスクロールしたりするので、同じ窓の中で聞く */
  function detailHtml(e, confirming) {
    var reserved = R.isReserved(e.id), done = !!attendedMap()[e.id], st = seats(e), h = host(e);
    var start = new Date(e.at), future = start > CLG.now(), rel = relDay(start);
    var ics = '<button type="button" class="btn btn-ghost" data-ev="ics">カレンダーに追加</button>';
    var foot;
    if (reserved && confirming) {
      foot = '<button type="button" class="btn btn-soft" data-ev="keep">やめる</button>' +
        '<button type="button" class="btn btn-danger" data-ev="unreserve-yes">予約を取り消す</button>';
    } else if (done) {
      foot = (future ? ics : '') + '<button type="button" class="btn btn-ink" data-close>閉じる</button>';
    } else if (reserved) {
      foot = '<button type="button" class="btn btn-text ev-detail__cancel" data-ev="unreserve">予約を取り消す</button>' +
        ics + '<button type="button" class="btn btn-ink" data-close>閉じる</button>';
    } else {
      foot = '<button type="button" class="btn btn-soft" data-close>閉じる</button>' + ics +
        (st.left ? '<button type="button" class="btn btn-primary" data-ev="reserve">予約する</button>'
          : '<button type="button" class="btn btn-ink" data-ev="wait">キャンセル待ち</button>');
    }
    var joinNote = e.kind === 'offline'
      ? '会場の場所は、この画面とLINEでお知らせします。'
      : e.kind === 'showcase'
        ? '参加用のURLと会場の場所は、この画面とLINEでお知らせします。'
        : '参加用のURLは、開始30分前にこの画面とLINEでお送りします。';
    var state = '';
    if (done) state = '<div class="notice notice-ok ev-detail__state"><p>参加済みです。</p></div>';
    else if (reserved && confirming) state = '<div class="notice notice-warn ev-detail__state" role="alert"><p><b>この予約を取り消しますか。</b></p></div>';
    else if (reserved) {
      state = '<div class="notice notice-ok ev-detail__state"><p><b>予約済みです。</b>' + joinNote + '</p></div>' +
        (future ? '<button type="button" class="btn btn-text btn-s ev-detail__proto" data-ev="attend">参加したことにする（デモ）</button>' : '');
    }

    return '<div class="scr-events ev-detail">' +
      photo(e, 'ev-detail__photo', 480, 270) +
      '<h3 class="modal__ttl">' + esc(e.title) + '</h3>' +
      '<p class="ev-detail__when">' + U.fmtDate(start, { noYear: true }) + ' <span class="num">' + timeRange(e) + '</span>' +
        '<span class="ev-detail__min">（' + e.min + '分）</span>' + (rel ? '<span class="ev-detail__rel">' + rel + '</span>' : '') + '</p>' +
      '<p class="ev-detail__desc">' + U.nl2br(e.desc) + '</p>' +
      '<table class="kv ev-detail__kv"><tbody>' +
        '<tr><th>場所</th><td>' + esc(e.place) + '</td></tr>' +
        '<tr><th>主催</th><td><span class="ev-detail__host">' + U.avatar(h.p, 's') + '<span>' + esc(h.name) + ' <span class="ev-detail__sub">' + esc(h.sub) + '</span></span></span></td></tr>' +
        '<tr><th>参加費</th><td>' + esc(fee(e)) + '</td></tr>' +
        '<tr><th>定員</th><td>' + e.cap + '名・' + (st.left ? '残り' + st.left + '席' : '満席') + '</td></tr>' +
        '<tr><th>録画</th><td>' + (e.recording ? 'あり' : 'なし') + '</td></tr>' +
        '<tr><th>XP</th><td>+' + DATA.XP.event + '</td></tr>' +
      '</tbody></table>' +
      state +
      '<div class="modal__foot">' + foot + '</div>' +
    '</div>';
  }

  function focusIn(box, sel) {
    var c = box.querySelector(sel);
    if (c) { try { c.focus({ preventScroll: true }); } catch (err) { c.focus(); } }
  }

  function openDetail(id) {
    var e = R.event(id);
    if (!e) return null;
    var confirming = false;
    var m = U.modal(detailHtml(e, false));
    var box = m.querySelector('.modal');
    // ボタンの行は窓の下に留めてある（events.css）。その下に隠れた要素を、行の上まで窓をずらして見せる
    function reveal(el) {
      var ft = box.querySelector('.modal__foot');
      if (!el || el === box || !ft || ft.contains(el)) return;
      var over = el.getBoundingClientRect().bottom - ft.getBoundingClientRect().top + 12;
      if (over > 0) box.scrollTop += over;
    }
    // Tab で進んだ先（「参加したことにする」など）がボタンの行に隠れないように
    box.addEventListener('focusin', function (ev) { reveal(ev.target); });
    // 描き直すと押したボタンが消えて焦点が迷子になるので、次に押しそうなボタンへ移す
    // 写真は読み込み済みの要素をそのまま戻す（描き直しで一瞬白くならないように）
    // 「予約済みです」「取り消しますか」は窓の下のほうに出るので、ボタンの行の上に見えるところまでずらす
    function redraw(sel) {
      if (!m.parentNode) return;
      var img = box.querySelector('.ev-detail__photo');
      box.innerHTML = detailHtml(e, confirming);
      var fresh = box.querySelector('.ev-detail__photo');
      if (img && fresh) fresh.parentNode.replaceChild(img, fresh);
      focusIn(box, sel || '.modal__foot [data-close]');
      reveal(box.querySelector('.ev-detail__state'));
    }
    // U.modal は最初のボタンに焦点を置く。試作用や取り消しのボタンに置かないよう「閉じる」へ移す
    setTimeout(function () { if (m.parentNode) focusIn(box, '.modal__foot [data-close]'); }, 60);
    // 中身を描き直すので、閉じるボタンもここでまとめて受ける
    box.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-ev], [data-close]');
      if (!b) return;
      if (b.hasAttribute('data-close')) { m.close(); return; }
      var act = b.getAttribute('data-ev');
      if (act === 'ics') saveIcs(e);
      else if (act === 'reserve') { doReserve(e); redraw(); }
      else if (act === 'unreserve') { confirming = true; redraw('[data-ev="keep"]'); }
      else if (act === 'keep') { confirming = false; redraw(); }
      else if (act === 'unreserve-yes') { confirming = false; doUnreserve(e); redraw(); }
      else if (act === 'wait') waitToast();
      else if (act === 'attend') {
        m.close();
        var r = R.attend(e.id);
        view.tab = 'attended';
        CLG.app.refresh();
        CLG.app.reward(r);
      }
    });
    return m;
  }

  /* ---------- 書き換え（ルールの関数を呼ぶだけ） ---------- */
  function doReserve(e) {
    if (R.isReserved(e.id)) return;
    CLG.app.reward(R.reserve(e.id));
    U.toast('予約しました', 'ok');
    CLG.app.refresh();
  }
  function doUnreserve(e) {
    if (!R.isReserved(e.id)) return;
    R.unreserve(e.id);
    U.toast('予約を取り消しました');
    CLG.app.refresh();
  }
  /** 一覧の「取り消す」から。詳細の窓の中では detailHtml の confirming で聞く */
  function askUnreserve(e) {
    return U.confirmBox('予約を取り消しますか',
      '「' + e.title + '」（' + U.fmtShort(e.at, true) + '）の予約を取り消します。',
      '取り消す', true).then(function (ok) {
      if (ok) doUnreserve(e);
      return ok;
    });
  }
  function waitToast() { U.toast('キャンセル待ちに登録しました。空きが出たらLINEでお知らせします'); }

  CLG.screens.events = {
    title: 'イベント',
    render: function (ctx) {
      var q = ctx.query || {};
      // 「入会したての状態で見る」などで会員が替わったら、前の人の切り替えを持ち越さない
      var owner = R.me().id;
      if (view.owner !== owner) { view.owner = owner; view.tab = 'upcoming'; view.kind = 'all'; view.qk = null; }
      var qk = (q.tab || '') + '|' + (q.kind || '');
      if (qk !== view.qk) {
        view.qk = qk;
        if (has(TABS, q.tab)) view.tab = q.tab;
        if (has(KINDS, q.kind)) view.kind = q.kind;
      }
      var att = attendedMap();
      var up = R.upcoming(), mine = R.myUpcoming();
      var counts = { upcoming: up.length, reserved: mine.length, attended: ctx.state.attended.length };
      var base = view.tab === 'reserved' ? mine : up;

      var seg = '<div class="seg" role="tablist" aria-label="表示するイベント">' + TABS.map(function (t) {
        var on = view.tab === t[0];
        return '<button type="button" role="tab" aria-selected="' + on + '" class="' + (on ? 'is-on' : '') + '" data-ev-tab="' + t[0] + '">' +
          t[1] + ' <span class="num ev-n">' + counts[t[0]] + '</span></button>';
      }).join('') + '</div>';

      // 参加した・中身が空のタブでは、絞り込みを出しても意味がないので隠す
      var chips = view.tab === 'attended' || !base.length ? '' : '<div class="chips ev-chips" aria-label="種類で絞り込む">' + KINDS.map(function (k) {
        var on = view.kind === k[0];
        return '<button type="button" class="chip' + (on ? ' is-on' : '') + '" aria-pressed="' + on + '" data-ev-kind="' + k[0] + '">' + k[1] + '</button>';
      }).join('') + '</div>';

      var body = view.tab === 'reserved' ? reservedView(att) : view.tab === 'attended' ? attendedView() : upcomingView(att);

      return '<div class="scr-events">' +
        '<div class="page-head"><h1 class="page-ttl">イベント</h1></div>' +
        '<div class="ev-bar">' + seg + chips + '</div>' +
        body +
      '</div>';
    },
    mount: function (root, ctx) {
      var el = root.querySelector('.scr-events');
      if (!el) return;

      // #/events/e2 で来たときは詳細を開く。描き直すたびに開かないよう、同じ引数では1回だけ
      var pid = ctx.params[0];
      if (!pid) view.opened = null;
      else if (view.opened !== pid) {
        view.opened = pid;
        if (R.event(pid)) openDetail(pid);
        else U.toast('このイベントは見つかりませんでした');
      }

      // 描くたびに新しくなる要素に付けるので、二重にはならない
      el.addEventListener('click', function (ev) {
        var t = ev.target.closest('[data-ev-tab]');
        if (t) { view.tab = t.getAttribute('data-ev-tab'); ctx.refresh(); return; }
        var k = ev.target.closest('[data-ev-kind]');
        if (k) { view.kind = k.getAttribute('data-ev-kind'); ctx.refresh(); return; }
        var b = ev.target.closest('[data-ev]');
        if (b) {
          var e = R.event(b.getAttribute('data-id'));
          if (!e) return;
          var act = b.getAttribute('data-ev');
          if (act === 'reserve') doReserve(e);
          else if (act === 'unreserve') askUnreserve(e);
          else if (act === 'wait') waitToast();
          return;
        }
        if (ev.target.closest('a')) return;
        var c = ev.target.closest('[data-open]');
        if (c) openDetail(c.getAttribute('data-open'));
      });
    }
  };
})();
