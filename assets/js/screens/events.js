/* ============================================================
   イベント（#/events）
   ------------------------------------------------------------
   これから / 予約済み / 参加した を切り替え、日付ごとにまとめて並べる。
   予約・取り消し・参加は R.reserve / R.unreserve / R.attend だけで行う。
   #/events/e2 のように開くと、そのイベントの詳細を最初から開く。
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon;

  var TABS = [['upcoming', 'これから'], ['reserved', '予約済み'], ['attended', '参加した']];
  var KINDS = [['all', 'すべて'], ['online', 'オンライン'], ['offline', '会場'], ['showcase', '成果発表会']];
  var KIND_TAG = { online: ['オンライン', 'tag-indigo'], offline: ['会場', 'tag-line'], showcase: ['成果発表会', 'tag-gold'] };
  var WD = ['日', '月', '火', '水', '木', '金', '土'];
  var SHOWCASE_NOTE = '1人3分で「やったこと・できたこと・次」。見るだけの参加もOK';

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
  function relDay(d) {
    var n = dayDiff(d);
    if (n < 0) return '';
    return n === 0 ? '今日' : n === 1 ? '明日' : n === 2 ? 'あさって' : n + '日後';
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
  function kindTag(e) {
    var k = KIND_TAG[e.kind];
    return k ? '<span class="tag ' + k[1] + '">' + esc(k[0]) + '</span>' : '';
  }
  function tags(e) {
    return kindTag(e) + (e.recording ? '<span class="tag tag-line">' + icon('play') + '録画あり</span>' : '');
  }
  /** 成果発表会の注記。説明文にもう書いてあるところ（詳細の窓・.ics）では重ねない */
  function needsNote(e) { return e.kind === 'showcase' && String(e.desc || '').indexOf('1人3分') < 0; }
  function byKind(list) {
    return view.kind === 'all' ? list : list.filter(function (e) { return e.kind === view.kind; });
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
    var desc = (e.desc || '') + (needsNote(e) ? '\n' + SHOWCASE_NOTE : '') +
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
    U.toast('カレンダー用のファイル（.ics）を保存しました', 'ok');
  }

  /* ---------- 一覧 ---------- */
  function dateBlock(d) {
    d = new Date(d);
    var rel = relDay(d);
    return '<div class="ev-date" aria-hidden="true">' +
      '<span class="ev-date__m">' + (d.getMonth() + 1) + '月</span>' +
      '<b class="ev-date__d num">' + d.getDate() + '</b>' +
      '<span class="ev-date__w">' + WD[d.getDay()] + '曜</span>' +
      (rel ? '<span class="ev-date__rel">' + rel + '</span>' : '') +
    '</div>';
  }

  function action(e, done, reserved, st) {
    var id = esc(e.id);
    if (done) return '<span class="ev__state">' + icon('checkc', 'ico-s') + '参加しました</span>';
    if (reserved) {
      return '<span class="ev__state">' + icon('check', 'ico-s') + '予約済み</span>' +
        '<button type="button" class="btn btn-text btn-s" data-ev="unreserve" data-id="' + id + '">取り消す</button>';
    }
    if (!st.left) return '<button type="button" class="btn btn-soft btn-s" data-ev="wait" data-id="' + id + '">キャンセル待ち</button>';
    return '<button type="button" class="btn btn-ink btn-s" data-ev="reserve" data-id="' + id + '">予約する</button>';
  }

  function card(e, att) {
    var reserved = R.isReserved(e.id), done = !!att[e.id], st = seats(e), h = host(e);
    return '<article class="card ev' + (reserved ? ' is-reserved' : '') + (done ? ' is-done' : '') + '" data-open="' + esc(e.id) + '">' +
      '<div class="ev__tags">' + tags(e) + '</div>' +
      // 面ごと押すと詳細が開く。押せることが分かるよう、題の右に山かっこを置く
      '<h3 class="ev__ttl"><button type="button" class="ev__link" aria-haspopup="dialog">' + esc(e.title) + '</button>' + U.chevron() + '</h3>' +
      '<ul class="ev__meta">' +
        '<li>' + icon('clock', 'ico-s') + '<span><span class="num">' + timeRange(e) + '</span>（' + e.min + '分）</span></li>' +
        '<li>' + icon('pin', 'ico-s') + '<span>' + esc(e.place) + '</span></li>' +
        '<li>' + icon('user', 'ico-s') + '<span>' + esc(h.name) + ' <span class="muted">' + esc(h.sub) + '</span></span></li>' +
        '<li>' + icon('yen', 'ico-s') + '<span>' + esc(fee(e)) + '</span></li>' +
      '</ul>' +
      (e.kind === 'showcase' ? '<p class="ev__note">' + icon('info', 'ico-s') + '<span>' + esc(SHOWCASE_NOTE) + '</span></p>' : '') +
      '<div class="ev__foot">' +
        '<div class="ev-cap' + (st.few ? ' is-few' : '') + '">' +
          '<span>' + (st.left ? '残り<b class="num">' + st.left + '</b>席' : '<b>満席</b>') + '<span class="muted">（定員' + e.cap + '名）</span></span>' +
          U.progressBar(st.pct, 'ink') +
        '</div>' +
        '<div class="ev__act">' + action(e, done, reserved, st) + '</div>' +
      '</div>' +
    '</article>';
  }

  function days(list, att) {
    var groups = [], cur = null;
    list.forEach(function (e) {
      var k = new Date(e.at).toDateString();
      if (!cur || cur.k !== k) { cur = { k: k, d: e.at, items: [] }; groups.push(cur); }
      cur.items.push(e);
    });
    return '<div class="ev-days">' + groups.map(function (g) {
      return '<section class="ev-day" aria-label="' + esc(U.fmtDate(g.d, { noYear: true })) + '">' + dateBlock(g.d) +
        '<div class="ev-day__list">' + g.items.map(function (e) { return card(e, att); }).join('') + '</div></section>';
    }).join('') + '</div>';
  }

  function emptyCard(iconName, text, btn) {
    return '<div class="card ev-empty">' + U.empty(iconName, text) + (btn ? '<div class="ev-empty__act">' + btn + '</div>' : '') + '</div>';
  }
  var SHOW_ALL = '<button type="button" class="btn btn-soft btn-s" data-ev-kind="all">すべての種類を見る</button>';
  var TO_UPCOMING = '<button type="button" class="btn btn-soft btn-s" data-ev-tab="upcoming">これからのイベントを見る</button>';

  /** 一覧の上の一言。予約があれば次の予定、なければスタートガイドの案内 */
  function topNote() {
    var mine = R.myUpcoming();
    if (mine.length) {
      var n = mine[0];
      return '<div class="notice ev-top">' + icon('calendar') +
        '<div class="ev-top__txt">予約中 <b class="num">' + mine.length + '</b>件。次は <b>' + U.fmtShort(n.at, true) + '</b>「' + esc(n.title) + '」です。</div>' +
        '<button type="button" class="btn btn-text btn-s" data-ev-tab="reserved">予約済みを見る</button></div>';
    }
    var step = R.steps().filter(function (s) { return s.id === 'event'; })[0];
    if (step && !step.done) {
      // はじめての人には「まずこれ」を1つだけ。いちばん近いオンラインの会をすすめる
      var rec = R.upcoming().filter(function (e) { return e.kind === 'online' && seats(e).left > 0; })[0];
      return '<div class="notice ev-top">' + icon('flag') +
        '<div class="ev-top__txt">スタートガイドの「' + esc(step.title) + '」がまだです（+' + step.xp + ' XP）。' +
          (rec ? 'はじめてなら、' + U.fmtShort(rec.at, true) + 'の「' + esc(rec.title) + '」がおすすめです。自宅からそのまま参加できます。'
            : 'オンラインの勉強会なら、自宅からそのまま参加できます。') + '</div>' +
        (rec ? '<button type="button" class="btn btn-text btn-s" data-open="' + esc(rec.id) + '">詳しく見る</button>'
          : '<a class="btn btn-text btn-s" href="#/start">スタートガイドへ</a>') + '</div>';
    }
    return '';
  }

  function upcomingView(att) {
    var all = R.upcoming(), list = byKind(all);
    var body;
    if (!all.length) body = emptyCard('calendar', '予定しているイベントはまだありません。決まりしだい、こことタイムラインでお知らせします。');
    else if (!list.length) body = emptyCard('calendar', 'この種類のイベントは、いまのところ予定がありません。', SHOW_ALL);
    else body = days(list, att);
    return topNote() + body;
  }

  function reservedView(att) {
    var all = R.myUpcoming(), list = byKind(all);
    if (!all.length) return emptyCard('ticket', 'まだ予約はありません。気になるイベントの「予約する」を押すと、ここに並びます。', TO_UPCOMING);
    if (!list.length) return emptyCard('ticket', 'この種類で予約しているイベントはありません。', SHOW_ALL);
    return days(list, att) +
      '<p class="ev-foot-note">' + icon('info', 'ico-s') + '予約の取り消しは、開始の前までいつでもできます。都合が悪くなったら、ほかの方のために早めに取り消してください。</p>';
  }

  function attendedView() {
    var list = CLG.store.state.attended.slice().sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
    if (!list.length) {
      return emptyCard('checkc', 'まだ参加したイベントはありません。はじめての方は、オンラインの勉強会から気軽にどうぞ。', TO_UPCOMING);
    }
    return '<p class="ev-sum">これまでに <b class="num">' + list.length + '</b>回 参加しました。イベントに参加するたびに +' + DATA.XP.event + ' XP たまります。</p>' +
      '<div class="list">' + list.map(function (a) {
        return '<div class="li has-ico"><span class="li__ico ev-ok">' + icon('checkc') + '</span>' +
          '<span class="li__body"><span class="li__ttl">' + esc(a.title) + '</span>' +
          '<span class="li__sub">' + U.fmtDate(a.at) + '</span></span>' +
          '<span class="li__end ev-xp num">+' + DATA.XP.event + ' XP</span></div>';
      }).join('') + '</div>' +
      '<div class="card-flat ev-share">' +
        '<p class="small">参加して気づいたことを、タイムラインでひとこと共有しませんか。次に参加する人の参考になります。</p>' +
        '<a class="btn btn-ghost btn-s" href="#/feed">' + icon('feed', 'ico-s') + 'タイムラインへ</a>' +
      '</div>';
  }

  /* ---------- 詳細の窓 ---------- */
  /** confirming：窓の中で「取り消しますか」を聞いているところ。
      確認の窓を重ねると、Esc で下の窓まで閉じたり、背景がスクロールしたりするので、同じ窓の中で聞く */
  function detailHtml(e, confirming) {
    var reserved = R.isReserved(e.id), done = !!attendedMap()[e.id], st = seats(e), h = host(e);
    var start = new Date(e.at), future = start > CLG.now(), rel = relDay(start);
    var foot;
    if (reserved && confirming) {
      foot = '<button type="button" class="btn btn-soft" data-ev="keep">やめる</button>' +
        '<button type="button" class="btn btn-danger" data-ev="unreserve-yes">予約を取り消す</button>';
    } else if (done) {
      foot = (future ? '<button type="button" class="btn btn-ghost" data-ev="ics">' + icon('calendar', 'ico-s') + 'カレンダーに追加</button>' : '') +
        '<button type="button" class="btn btn-ink" data-close>閉じる</button>';
    } else if (reserved) {
      foot = '<button type="button" class="btn btn-text ev-detail__cancel" data-ev="unreserve">予約を取り消す</button>' +
        '<button type="button" class="btn btn-ghost" data-ev="ics">' + icon('calendar', 'ico-s') + 'カレンダーに追加</button>' +
        '<button type="button" class="btn btn-ink" data-close>閉じる</button>';
    } else {
      foot = '<button type="button" class="btn btn-soft" data-close>閉じる</button>' +
        '<button type="button" class="btn btn-ghost" data-ev="ics">' + icon('calendar', 'ico-s') + 'カレンダーに追加</button>' +
        (st.left ? '<button type="button" class="btn btn-primary" data-ev="reserve">予約する</button>'
          : '<button type="button" class="btn btn-ink" data-ev="wait">キャンセル待ち</button>');
    }
    var joinNote = e.kind === 'offline'
      ? '本番では、会場の場所をこの画面とLINEでお知らせします。'
      : e.kind === 'showcase'
        ? '本番では、オンラインの参加用URLと会場の場所を、この画面とLINEでお知らせします。'
        : '本番では、参加用のURLを開始30分前にこの画面とLINEでお知らせします。';

    return '<div class="scr-events ev-detail">' +
      '<div class="ev__tags">' + tags(e) + '</div>' +
      '<h3 class="modal__ttl">' + esc(e.title) + '</h3>' +
      '<p class="ev-detail__when">' + icon('calendar', 'ico-s') + '<span>' + U.fmtDate(start, { noYear: true }) + ' <span class="num">' + timeRange(e) + '</span>' +
        '<span class="ev-detail__min">（' + e.min + '分）</span></span>' +
        (rel ? '<span class="tag">' + rel + '</span>' : '') + '</p>' +
      '<p class="ev-detail__desc">' + U.nl2br(e.desc) + '</p>' +
      (needsNote(e) ? '<p class="ev__note">' + icon('info', 'ico-s') + '<span>' + esc(SHOWCASE_NOTE) + '</span></p>' : '') +
      '<table class="kv ev-detail__kv"><tbody>' +
        '<tr><th>場所</th><td>' + esc(e.place) + '</td></tr>' +
        '<tr><th>主催</th><td><span class="ev-detail__host">' + U.avatar(h.p, 's') + '<span>' + esc(h.name) + '<br><span class="xsmall muted">' + esc(h.sub) + '</span></span></span></td></tr>' +
        '<tr><th>参加費</th><td>' + esc(fee(e)) + '</td></tr>' +
        '<tr><th>定員</th><td>' + e.cap + '名・' + (st.left ? '残り<b class="num">' + st.left + '</b>席' : '満席') + '</td></tr>' +
        '<tr><th>録画</th><td>' + (e.recording ? 'あり（参加できなくても、あとからアーカイブで見られます）' : 'なし（その場だけの会です）') + '</td></tr>' +
        '<tr><th>経験値</th><td>参加すると +' + DATA.XP.event + ' XP</td></tr>' +
      '</tbody></table>' +
      (done ? '<div class="notice notice-ok ev-detail__state">' + icon('checkc') + '<div>このイベントには参加済みです。おつかれさまでした。</div></div>' : '') +
      (reserved && confirming ? '<div class="notice notice-warn ev-detail__state" role="alert">' + icon('info') +
        '<div><b>この予約を取り消しますか。</b><br>席に空きがあれば、あとからもう一度予約できます。</div></div>' : '') +
      (reserved && !confirming ? '<div class="notice notice-ok ev-detail__state">' + icon('check') + '<div><b>予約済みです。</b><br>' + joinNote + '</div></div>' +
        (future ? '<div class="ev-detail__proto"><button type="button" class="btn btn-text btn-s" data-ev="attend">（試作版）参加したことにする</button>' +
          '<span class="proto-note">本番では、出欠は運営が付けます</span></div>' : '') : '') +
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
    // 描き直すと押したボタンが消えて焦点が迷子になるので、次に押しそうなボタンへ移す
    function redraw(sel) {
      if (!m.parentNode) return;
      box.innerHTML = detailHtml(e, confirming);
      focusIn(box, sel || '.modal__foot [data-close]');
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
      '「' + e.title + '」（' + U.fmtShort(e.at, true) + '）の予約を取り消します。\n席に空きがあれば、あとからもう一度予約できます。',
      '取り消す', true).then(function (ok) {
      if (ok) doUnreserve(e);
      return ok;
    });
  }
  function waitToast() { U.toast('本番では、キャンセル待ちに登録し、空きが出たらLINEでお知らせします'); }

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
        var n = k[0] === 'all' ? base.length : base.filter(function (e) { return e.kind === k[0]; }).length;
        var on = view.kind === k[0];
        return '<button type="button" class="chip' + (on ? ' is-on' : '') + '" aria-pressed="' + on + '" data-ev-kind="' + k[0] + '">' +
          k[1] + '<span class="n num">' + n + '</span></button>';
      }).join('') + '</div>';

      var body = view.tab === 'reserved' ? reservedView(att) : view.tab === 'attended' ? attendedView() : upcomingView(att);

      return '<div class="scr-events">' +
        '<div class="page-head"><h1 class="page-ttl">イベント</h1>' +
          '<p class="page-lead">オンラインの勉強会と、地域のオフ会。見るだけの参加もOKです。</p></div>' +
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
