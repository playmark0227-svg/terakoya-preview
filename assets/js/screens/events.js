/* ============================================================
   イベント（#/events、#/events/<id>）
   ------------------------------------------------------------
   これから / 予約済み / 参加した を切り替え、一覧か月のカレンダーで見る。
   - 詳細は窓で開く。一覧から開くと #/events/<id> を履歴に積む（ブラウザの戻るで窓が閉じ、#/events に残る）。
     × などで閉じたときは積んだ1枚を戻して、URL を #/events にする。
     お知らせなどから #/events/e2 に直接来たときは、下に #/events を1枚はさんでから開く（戻るで一覧に戻れるように）。
   - 予約・取り消し・キャンセル待ち・発表の申込み・企画は R.* だけで書き換える。
   - 参加のしかた（Zoom は開始30分前から、会場の住所は予約した人だけ）は R.eventAccess の判定をそのまま出す。
   - 会員の企画（R.proposeEvent）は運営の確認のあと「掲載中」になり、一覧にも出る（主催は自分。参加者の一覧が見える）。
   - キャンセル待ちからの繰り上げ（運営画面の R.promoteWaitlist）は、予約済みとして出し、そのお知らせが未読のあいだは
     一覧の上に「キャンセル待ちから予約に繰り上がりました」を出す（詳細を開くと既読にする）。詳細の窓にも同じことを書く。
     詳細を開いているあいだに別のタブで変わったら、窓の中だけ描き直して読み上げる（骨組みは窓が開いていると描き直さないため）。
   - #/events/<id> に直接来たとき（お知らせ・戻る→進む）は、一覧のその行を「開いたもの」にしてから開く（閉じたらその行へ戻る）。
     閉じて #/events に戻ると骨組みは「別の画面」として見出しへ焦点を送るので、mount がその行の題へ焦点を戻す（§5-3 の mount の焦点）。
   - 会の題は ttl() で出す（短い（ ）の中を割らない。「札幌オフ会（子連れOK）」が「（子連れ」「OK）」に割れないように）。
   - 終わった会の詳細（お知らせのリンクなどから開く）は「この会は終わりました」。予約していた会でも「予約済み」とは言わず、
     出欠の確認待ち（出欠は運営が付ける）と書く。参加のしかた（Zoom・会場・持ち物）は出さない。
   - 成果発表会の発表が決まったら、札は「決定」（R.proposals の statusLabel。企画は「掲載中」）。
   - 予約していて終わった会で、運営がまだ出欠を付けていないもの（R.pastReserved）は「参加した」の中に「出欠の確認待ち」の札で出す
     （これから・予約済みからは外れ、出欠が付くと参加済みの行に変わる）。
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon;

  var TABS = [['upcoming', 'これから'], ['reserved', '予約済み'], ['attended', '参加した']];
  var KINDS = [['all', 'すべて'], ['online', 'オンライン'], ['offline', '会場（オフ会）'], ['showcase', '成果発表会']];
  var MODES = [['list', '一覧'], ['cal', 'カレンダー']];
  var WD = ['日', '月', '火', '水', '木', '金', '土'];

  // 画面の中だけの状態。URL の ?tab= / ?kind= / ?mode= が変わったときだけ上書きする
  var view = { tab: 'upcoming', kind: 'all', mode: 'list', month: null, day: null, qk: null, opened: null, owner: null, reward: null, backTo: null };
  var detail = null;   // 開いている詳細の窓 { id, m, st, pushed }
  var cur = null;      // mount で受け取った ctx（押したときに使う）

  // #/events/e4 の詳細は「その URL に来たとき」に1回だけ開く。URL が変わるたびに忘れる
  // （Node の確認ツールには addEventListener がないので確かめてから付ける）
  if (window.addEventListener) window.addEventListener('hashchange', function () { view.opened = null; });

  /* 別のタブ（運営画面）で状態が変わったとき。窓が開いていると骨組みは描き直さないので、窓の中だけ描き直す。
     キャンセル待ちから繰り上がったら、読み上げでも知らせる（一覧は骨組みの描き直しで「予約済み」と上の知らせが出る） */
  var waitSeen = null;   // 前に見たキャンセル待ちの会（render と、この下の見張りで更新）
  function waitIds() { return Object.keys((CLG.store && CLG.store.state && CLG.store.state.waitlist) || {}); }
  function onEvents() { return typeof location !== 'undefined' && /^#\/?events(?:[/?]|$)/.test(location.hash || ''); }
  if (CLG.store && CLG.store.on) {
    CLG.store.on(function () {
      var was = waitSeen, nowIds = waitIds();
      waitSeen = nowIds;
      if (!onEvents()) return;
      var changed = refreshDetail();
      var up = (was || []).filter(function (id) { return nowIds.indexOf(id) < 0 && promotion(id); });
      if (up.length) {
        var e = findEvent(up[0]);
        if (e) CLG.app.announce('「' + e.title + '」がキャンセル待ちから予約に繰り上がりました');
      } else if (changed) CLG.app.announce('このイベントの予約の状態が変わりました');
    });
  }

  /* ---------- 小さな道具 ---------- */
  function now() { return CLG.now(); }
  function has(list, key) { return list.some(function (x) { return x[0] === key; }); }
  function byAt(a, b) { return new Date(a.at) - new Date(b.at); }
  function endOf(e) { return new Date(new Date(e.at).getTime() + (e.min || 0) * 60000); }
  function hm(d) { d = new Date(d); return U.pad(d.getHours()) + ':' + U.pad(d.getMinutes()); }
  function timeRange(e) { return e.min ? hm(e.at) + '–' + hm(endOf(e)) : hm(e.at) + '〜'; }
  function ymd(d) { d = new Date(d); return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate()); }
  function ym(d) { return ymd(d).slice(0, 7); }
  function dayDiff(d) {
    var a = new Date(d); a.setHours(0, 0, 0, 0);
    var n = now(); n.setHours(0, 0, 0, 0);
    return Math.round((a - n) / 86400000);
  }
  /** 今日・明日だけ文字で添える（それより先は日付を見れば分かる） */
  function relDay(d) { var n = dayDiff(d); return n === 0 ? '今日' : n === 1 ? '明日' : ''; }
  /** 画面の中に見えているか（スマホの上の帯 56px と下のタブ 72px にかからない） */
  function inView(el) { var r = el.getBoundingClientRect(); return r.top >= 56 && r.bottom <= (window.innerHeight || 0) - 72; }
  function isLive(e) { var n = now(); return new Date(e.at) <= n && n <= endOf(e); }
  /** 会の題。短い（ ）の中（「（8名）」「（子連れOK）」「（夜）」）は途中で割らない。
      せまい幅で「Instagram添削会（8」「名）」のように割れると読みにくいため。残りは U.jp のまま */
  function ttl(s) {
    return String(s == null ? '' : s).split(/(（[^（）]{1,10}）)/).map(function (part, i) {
      return !part ? '' : i % 2 ? '<span class="nw">' + esc(part) + '</span>' : U.jp(part);
    }).join('');
  }
  function fee(e) { return typeof e.fee === 'number' ? (e.fee ? U.yen(e.fee) : '無料') : String(e.fee || '無料'); }
  function safeUrl(u) { return /^https:\/\//.test(String(u || '')) ? String(u) : ''; }
  function attendedList() { return CLG.store.state.attended || []; }
  function attendedMap() { var m = {}; attendedList().forEach(function (a) { m[a.id] = true; }); return m; }
  /** 残りの席。自分が予約していれば、その1席も埋まっているものとして数える */
  function seats(e) {
    var taken = Math.min(e.cap, (e.count || 0) + (R.isReserved(e.id) ? 1 : 0));
    var left = Math.max(0, e.cap - taken);
    return { left: left, few: left > 0 && left <= Math.max(3, Math.ceil(e.cap * 0.2)) };
  }
  /** 主催の呼び方。表示名に「さん」は付けず、運営は役割（「講師（デザイン・SNS）」など）、会員は「会員」と添える */
  function host(e) {
    var p = R.person(e.host) || { name: '運営' };
    var role = p.me ? '' : p.staff ? (p.role || '運営') : '会員';
    return { p: p, me: !!p.me, role: role, label: p.me ? 'あなた' : p.name + '・' + role };
  }
  function byKind(list) { return view.kind === 'all' ? list : list.filter(function (e) { return e.kind === view.kind; }); }

  /* ---------- 見せるイベントの集め方 ---------- */
  /** 自分の企画で、運営が載せたもの（R.proposals の approved）。一覧・詳細ではイベントと同じ形で扱う */
  function ownEvents() {
    return (R.proposals() || []).filter(function (p) { return p.kind === 'event' && p.status === 'approved'; }).map(function (p) {
      return { id: p.id, own: true, kind: p.online ? 'online' : 'offline', title: p.title, at: p.at, min: 0,
        place: p.place, cap: p.cap, count: 0, fee: p.fee, host: 'me', desc: p.desc };
    });
  }
  function findEvent(id) {
    if (!id) return null;
    return R.event(id) || ownEvents().filter(function (e) { return e.id === id; })[0] || null;
  }
  /** オリエンテーションに一度出た人には、次の回を出さない（予約していれば出す）。
      入会30日を過ぎた人を外すのは R.upcoming がしている */
  function sawOrientation() {
    return attendedList().some(function (a) {
      var e = R.event(a.id);
      return (e && e.series === 'orientation') || /オリエンテーション/.test(a.title || '');
    });
  }
  function shown(e) { return !(e.audience === 'new30' && !R.isReserved(e.id) && sawOrientation()); }
  /** これからの会。始まっている今日の会も、終わるまでは残す（Zoom の入口をここから開けるように） */
  function upcomingAll() {
    var seen = {}, out = [];
    function add(e) { if (e && !seen[e.id] && shown(e)) { seen[e.id] = 1; out.push(e); } }
    (R.todayEvents() || []).forEach(function (t) { add(R.event(t.id)); });
    R.upcoming().forEach(add);
    ownEvents().forEach(function (e) { if (new Date(e.at) > now()) add(e); });
    return out.sort(byAt);
  }
  function reservedAll() { return upcomingAll().filter(function (e) { return R.isReserved(e.id); }); }
  /** 参加した会（運営が出欠を付けたもの）と、予約していて終わった会で出欠がまだのもの（pending）。新しい順 */
  function attendedAll() {
    var pend = (R.pastReserved ? R.pastReserved() : []).map(function (e) { return Object.assign({ pending: true }, e); });
    return pend.concat(attendedList()).sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
  }

  /** その人から見た状態（一覧の行・カレンダー・詳細で同じものを使う） */
  function stateOf(e) {
    var s = { reserved: !e.own && R.isReserved(e.id), done: !!attendedMap()[e.id], wait: e.own ? 0 : R.waitlistPos(e.id),
      seat: seats(e), own: !!e.own || host(e).me, live: isLive(e), started: new Date(e.at) <= now(), ended: endOf(e) < now() };
    s.full = s.seat.left <= 0;
    // オリエンテーションに一度出た人は、URL から次の回を開いても予約できない形にする（一覧にも出さない。shown）
    s.open = !e.own && R.eventOpen(e) && shown(e);
    s.access = s.reserved && !s.done ? R.eventAccess(e.id) : null;
    return s;
  }

  /* ---------- 写真（イベントごとの1枚。なければ種類ごとの1枚） ---------- */
  var PHOTO_ALT = {
    online: '夜、自宅でパソコンを見ながらメモを取る男性',
    offline: 'カフェのテーブルを囲んで話す人たち',
    showcase: 'テレビの前で話す女性と、座って聞く人たち'
  };
  /** w・h は枠の比率を先に決めておくための値（読み込みでずれないように）。
      一覧の小さな写真は飾り（alt は空）。行ごとに写真の説明を読み上げると、題にたどり着くまでが長くなるため */
  function photo(e, cls, w, h, eager, deco) {
    var src = e.img || (DATA.EVENT_IMG && DATA.EVENT_IMG[e.kind]);
    if (!src) return '';
    return '<img class="' + cls + '" src="' + esc(src) + '" width="' + w + '" height="' + h + '"' +
      ' alt="' + (deco ? '' : esc((e.img && e.alt) || PHOTO_ALT[e.kind] || '')) + '"' + (eager ? '' : ' loading="lazy"') + ' decoding="async">';
  }
  /** 空きが出たときの知らせ方（LINE をつないでいない人に「LINEで」とは言わない） */
  function notifyWay() {
    var l = R.lineLink ? R.lineLink() : null;
    return l && l.status === 'linked' ? (DATA.SITE.lineName || 'LINE') + 'とお知らせ' : 'お知らせ';
  }

  /* ---------- キャンセル待ちからの繰り上がり（運営画面の R.promoteWaitlist） ---------- */
  var PROMO = /^キャンセル待ちから予約に繰り上がりました/;
  /** その会の繰り上がりのお知らせ { id, at, unread, … } か null。
      いまの予約がそのお知らせと同じときに入ったものだけ（あとで取り消して、別に予約し直したものは違う） */
  function promotion(id) {
    if (!id || !R.isReserved(id) || !R.notices) return null;
    var at = (CLG.store.state.events || {})[id], hit = null;
    (R.notices() || []).forEach(function (n) {
      var m = /^#\/events\/([^?#]+)/.exec(n.link || ''), nid;
      if (!m || !PROMO.test(n.text || '')) return;
      try { nid = decodeURIComponent(m[1]); } catch (e) { nid = m[1]; }
      if (nid !== id) return;
      if (typeof at === 'string' && Math.abs(new Date(at) - new Date(n.at)) > 60000) return;
      if (!hit || new Date(n.at) > new Date(hit.at)) hit = n;
    });
    return hit;
  }
  /** 一覧の上の知らせ：繰り上がって、そのお知らせをまだ読んでいない会（詳細を開くと既読になって消える） */
  function promoNote(list) {
    return list.map(function (e) { var n = promotion(e.id); return n && n.unread ? e : null; }).filter(Boolean).map(function (e) {
      return '<div class="notice notice-ok ev-promo">' + icon('checkc') +
        '<p class="ev-promo__txt"><b>キャンセル待ちから<span class="nw">予約に繰り上がりました</span></b>' +
          '<span>' + U.jp(U.fmtShort(e.at, true)) + '「' + ttl(e.title) + '」</span></p>' +
        '<button type="button" class="btn btn-text btn-s" data-ev-open="' + esc(e.id) + '" aria-haspopup="dialog">詳細を見る</button></div>';
    }).join('');
  }

  /* ---------- カレンダー（.ics） ---------- */
  function siteHost() { return String(DATA.SITE.siteUrl || DATA.SITE.previewUrl || '').replace(/^https?:\/\//, '').replace(/[?#].*$/, '').replace(/\/+$/, ''); }
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
    var domain = siteHost().split('/')[0] || 'localhost';
    var desc = (e.desc || '') + '\n\n主催：' + h.label + '\n参加費：' + fee(e) +
      '\n' + DATA.SITE.name + ' 会員ページ「イベント」から追加';
    var lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//' + DATA.SITE.name + '//Member Page Prototype//JA', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:' + e.id + '-' + icsDate(e.at) + '@' + domain,
      'DTSTAMP:' + icsDate(now()),
      'DTSTART:' + icsDate(e.at),
      'DTEND:' + icsDate(e.min ? endOf(e) : new Date(new Date(e.at).getTime() + 3600000)),
      'SUMMARY:' + icsText('【' + DATA.SITE.name + '】' + e.title),
      'LOCATION:' + icsText(e.place),
      'DESCRIPTION:' + icsText(desc),
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsText(e.title), 'TRIGGER:-PT30M', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'
    ];
    return lines.map(fold).join('\r\n') + '\r\n';
  }
  // .ics は BOM があると読み込めないカレンダーがあるので、BOM なしで保存する
  function saveIcs(e) {
    U.download('event-' + e.id + '.ics', icsFor(e), 'text/calendar', { bom: false });
    U.toast('カレンダー用のファイルを保存しました', 'ok');
  }
  /** 購読用の URL（試作版は形だけ）。会員番号はそのまま出さず、短い印にする */
  function subUrl() {
    var id = String(R.me().id || ''), h = 7;
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return 'webcal://' + (siteHost() || 'localhost') + '/cal/' + h.toString(36) + '.ics';
  }

  /* ---------- 一覧の行 ---------- */
  /** 左の列：日付と開始時刻（せまい幅では1行にまとまる） */
  function whenCol(e, s) {
    var d = new Date(e.at), rel = s && s.live ? '開催中' : relDay(d);
    return '<p class="ev__when"><b>' + U.fmtShort(d) + '</b>' +
      '<span class="num">' + hm(d) + '</span>' + (rel ? '<span class="ev__rel">' + rel + '</span>' : '') + '</p>';
  }
  /** 行の補足。広い幅では1行、せまい幅では2行に分ける */
  function meta(e) {
    var a = [], b = [fee(e)];
    if (e.audience === 'new30') a.push('入会30日以内の方向け');
    if (e.min) a.push(e.min + '分');
    a.push(e.place);
    if (e.recording) b.push('録画あり');
    return '<span class="ev__m1">' + U.jp(a.join('・')) + '</span><span class="ev__m2">' + U.jp(b.join('・')) + '</span>';
  }
  function zoomLink(a, cls, label) {
    var url = safeUrl(a && a.zoomUrl);
    if (!url) return '';
    return '<a class="' + cls + '" href="' + esc(url) + '" target="_blank" rel="noopener" data-ev-zoom="' + esc(a.id || '') + '">' +
      icon('external', 'ico-s') + esc(label || 'Zoomに参加する') + '</a>';
  }
  /** 行の右：状態（札は1つまで）と、いちばん使うボタン1つ */
  function action(e, s) {
    var id = esc(e.id);
    if (s.done) return U.statusTag('done', '参加済み');
    if (s.own) return '<span class="ev__seats">あなたの企画</span>';
    if (s.reserved) {
      if (s.access && s.access.ready) return zoomLink({ zoomUrl: s.access.zoomUrl, id: e.id }, 'btn btn-primary btn-s');
      // 「予約済み」の一覧では全部が予約済みなので、札は出さない
      return (view.tab === 'reserved' ? '' : U.statusTag('reserved')) + (s.started ? '' :
        '<button type="button" class="btn btn-text btn-s" data-ev-cancel="' + id + '" data-focus-after="[data-ev-reserve=\'' + id + '\'], [data-ev-wait=\'' + id + '\']">取り消す</button>');
    }
    if (s.wait) {
      return U.statusTag('waitlist', 'キャンセル待ち（' + s.wait + '番目）') +
        '<button type="button" class="btn btn-text btn-s" data-ev-leave="' + id + '" data-focus-after="[data-ev-wait=\'' + id + '\'], [data-ev-reserve=\'' + id + '\']">やめる</button>';
    }
    if (s.started) return '<span class="ev__seats">開催中</span>';
    if (s.full) {
      return '<span class="ev__seats is-few">満席</span>' +
        '<button type="button" class="btn btn-soft btn-s" data-ev-wait="' + id + '" data-focus-after="[data-ev-leave=\'' + id + '\']">キャンセル待ちする</button>';
    }
    if (!s.open) return '';
    return '<span class="ev__seats' + (s.seat.few ? ' is-few' : '') + '">残り' + s.seat.left + '席</span>' +
      '<button type="button" class="btn btn-ink btn-s" data-ev-reserve="' + id + '" data-focus-after="[data-ev-cancel=\'' + id + '\']">予約する</button>';
  }
  /** 行の主催。役割の（）の中（「講師（デザイン・SNS）」の担当分野）は、せまい幅では CSS で隠す（行が1段伸びるだけなので） */
  function hostLine(e) {
    var h = host(e);
    if (h.me) return esc(h.label);
    var m = /^([^（]+)(（.+）)$/.exec(h.role);
    return esc(h.p.name + '・' + (m ? m[1] : h.role)) + (m ? '<span class="ev__hostx">' + esc(m[2]) + '</span>' : '');
  }
  /** h：行の題の見出しの段（カレンダーの日の一覧では、日付の h3 の下なので h4） */
  function row(e, h) {
    var s = stateOf(e), id = esc(e.id);
    h = h === 'h4' ? 'h4' : 'h3';
    return '<article class="ev' + (s.reserved ? ' is-reserved' : '') + (s.done ? ' is-done' : '') + '" data-ev-row="' + id + '">' +
      whenCol(e, s) +
      photo(e, 'ev__photo', 112, 75, false, true) +
      '<div class="ev__body">' +
        '<' + h + ' class="ev__ttl"><button type="button" class="ev__link" data-ev-open="' + id + '" aria-haspopup="dialog">' + ttl(e.title) + '</button></' + h + '>' +
        '<p class="ev__meta">' + meta(e) + '</p>' +
        '<p class="ev__host">主催 ' + hostLine(e) + '</p>' +
      '</div>' +
      '<div class="ev__act">' + action(e, s) + '</div>' +
      U.chevron() +
    '</article>';
  }
  function listHtml(list) { return '<div class="card ev-list">' + list.map(function (e) { return row(e); }).join('') + '</div>'; }

  /* 参加した会：録画（あれば）と、タイムラインに感想を書くリンク。
     感想を書くのは参加して30日以内の会だけ（半年前の会にまで並べると、同じリンクが続くだけになるため） */
  var FEEDBACK_DAYS = 30;
  function archiveFor(a) {
    var e = R.event(a.id) || {}, pe = (DATA.PAST_EVENTS || []).filter(function (x) { return x.id === a.id; })[0] || {};
    var id = a.archive || e.archive || pe.archive;
    if (id) return id;
    if (a.kind === 'offline') return null;
    // 録画の日時が会の開始と90分以内でそろうものを、その会の録画とみなす
    var t = new Date(a.at).getTime();
    var hit = (DATA.ARCHIVE || []).filter(function (x) { return Math.abs(new Date(x.date).getTime() - t) <= 90 * 60000; })[0];
    return hit ? hit.id : null;
  }
  function pastRow(a, h) {
    var arc = archiveFor(a), id = esc(a.id);
    var text = '「' + a.title + '」に参加しました。\n';
    var recent = -dayDiff(a.at) <= FEEDBACK_DAYS;
    h = h === 'h4' ? 'h4' : 'h3';
    return '<div class="ev ev-past" data-ev-past="' + id + '">' +
      '<p class="ev__when"><b>' + U.fmtShort(a.at) + '</b><span class="num">' + hm(a.at) + '</span></p>' +
      '<div class="ev__body"><' + h + ' class="ev__ttl">' + ttl(a.title) + '</' + h + '>' +
        '<p class="ev__meta">' + (a.speaker ? '発表した・' : '') + '<b class="num xp-num">+' + DATA.XP.event + '</b> XP</p></div>' +
      '<div class="ev__act">' +
        (arc ? '<a class="btn btn-text btn-s" href="#/courses/archive/' + encodeURIComponent(arc) + '">' + icon('play', 'ico-s') + '録画を見る</a>' : '') +
        (recent ? '<a class="btn btn-text btn-s" href="#/feed?compose=post&amp;text=' + encodeURIComponent(text) + '">' + icon('pen', 'ico-s') + '感想を書く</a>' : '') +
      '</div>' +
    '</div>';
  }

  /** 予約していて終わった会（出欠の確認待ち）。題から詳細を開ける（「出欠の確認待ちです。出欠は運営が付けます」） */
  function pendingRow(e, h) {
    var id = esc(e.id);
    h = h === 'h4' ? 'h4' : 'h3';
    return '<div class="ev ev-past is-pending" data-ev-past="' + id + '">' +
      '<p class="ev__when"><b>' + U.fmtShort(e.at) + '</b><span class="num">' + hm(e.at) + '</span></p>' +
      '<div class="ev__body"><' + h + ' class="ev__ttl"><button type="button" class="ev__link" data-ev-open="' + id + '" aria-haspopup="dialog">' + ttl(e.title) + '</button></' + h + '>' +
        '<p class="ev__meta">' + U.jp(e.place || '') + '</p></div>' +
      '<div class="ev__act">' + U.statusTag('pending', '出欠の確認待ち') + '</div>' +
    '</div>';
  }
  function pastOrPending(a, h) { return a.pending ? pendingRow(a, h) : pastRow(a, h); }

  function emptyCard(iconName, text, btn) { return '<div class="card ev-empty">' + U.empty(iconName, text, btn) + '</div>'; }
  var SHOW_ALL = '<button type="button" class="btn btn-soft btn-s" data-ev-kind="all">すべて表示</button>';
  var TO_UPCOMING = '<button type="button" class="btn btn-soft btn-s" data-ev-tab="upcoming">これからのイベント</button>';

  /** スタートガイドの「イベントに参加する」が残っている人にだけ、近いオンラインの会を1つすすめる */
  function topNote() {
    if (R.myUpcoming().length) return '';
    var step = R.steps().filter(function (s) { return s.id === 'event'; })[0];
    if (!step || step.done) return '';
    // 入会したての人にはオリエンテーションを、それ以外は近いオンラインの会を
    var open = upcomingAll().filter(function (e) { return e.kind === 'online' && !e.own && stateOf(e).open && !isLive(e); });
    var rec = open.filter(function (e) { return e.audience === 'new30'; })[0] || open[0];
    if (!rec) return '';
    // 文と会を2行に分ける（1文にすると、せまい幅で「」がおすすめです。」だけが次の行に落ちるため）
    return '<div class="notice ev-top">' + icon('info') +
      '<p class="ev-top__txt">はじめての方におすすめです。<span>' + U.jp(U.fmtShort(rec.at, true)) + '「' + ttl(rec.title) + '」</span></p>' +
      '<button type="button" class="btn btn-text btn-s" data-ev-open="' + esc(rec.id) + '" aria-haspopup="dialog">詳細を見る</button></div>';
  }

  function listBody(list, base) {
    if (view.tab === 'attended') {
      if (!list.length) return emptyCard('calendar', '参加したイベントはまだありません。', TO_UPCOMING);
      return '<div class="card ev-list">' + list.map(function (a) { return pastOrPending(a); }).join('') + '</div>';
    }
    if (!base.length) {
      return view.tab === 'reserved' ? emptyCard('calendar', '予約しているイベントはありません。', TO_UPCOMING)
        : emptyCard('calendar', '予定しているイベントはありません。');
    }
    if (!list.length) return emptyCard('', view.tab === 'reserved' ? 'この種類で予約しているイベントはありません。' : 'この種類のイベントは予定がありません。', SHOW_ALL);
    return (view.tab === 'upcoming' ? topNote() : '') + listHtml(list);
  }

  /* ---------- 月のカレンダー ---------- */
  function markOf(it) {
    if (it.past) return 'is-done';
    var s = stateOf(it);
    return s.reserved ? 'is-res' : s.wait ? 'is-wait' : s.own ? 'is-own' : '';
  }
  function monthShift(m, n) { var y = +m.slice(0, 4), mo = +m.slice(5, 7) - 1 + n; return ym(new Date(y, mo, 1)); }
  function monthLabel(m) { return +m.slice(0, 4) + '年' + (+m.slice(5, 7)) + '月'; }
  function dayLabel(key) { var p = key.split('-'); return U.fmtDate(new Date(+p[0], +p[1] - 1, +p[2]), { noYear: +p[0] === now().getFullYear() }); }

  function calBody(list) {
    var items = list.map(function (x) { return view.tab === 'attended' ? Object.assign({ past: true }, x) : x; });
    var months = items.map(function (x) { return ym(x.at); });
    var today = ym(now());
    var min = view.tab === 'attended' ? (months.length ? months.slice().sort()[0] : today) : today;
    var max = months.length ? months.slice().sort().pop() : today;
    if (max < min) max = min;
    var m = view.month && view.month >= min && view.month <= max ? view.month : (view.tab === 'attended' ? max : (months.filter(function (x) { return x >= today; })[0] || today));
    view.month = m;

    var byDay = {};
    items.forEach(function (x) { var k = ymd(x.at); if (k.slice(0, 7) === m) (byDay[k] = byDay[k] || []).push(x); });
    var keys = Object.keys(byDay).sort(), todayKey = ymd(now());
    var sel = view.day && byDay[view.day] ? view.day : null;
    if (!sel) sel = view.tab === 'attended' ? keys[keys.length - 1] : (keys.filter(function (k) { return k >= todayKey; })[0] || keys[0]) || null;
    view.day = sel;

    var y = +m.slice(0, 4), mo = +m.slice(5, 7) - 1;
    var lead = new Date(y, mo, 1).getDay(), days = new Date(y, mo + 1, 0).getDate();
    var cells = [], d;
    for (d = 0; d < lead; d++) cells.push('<td class="evcal__td is-out"></td>');
    for (d = 1; d <= days; d++) {
      var key = y + '-' + U.pad(mo + 1) + '-' + U.pad(d), evs = byDay[key] || [];
      var wd = new Date(y, mo, d).getDay(), isToday = key === todayKey;
      var cls = 'evcal__day' + (isToday ? ' is-today' : '') + (wd === 0 ? ' is-sun' : wd === 6 ? ' is-sat' : '');
      if (!evs.length) {
        cells.push('<td class="evcal__td"><span class="' + cls + '"><span class="evcal__n num">' + d + '</span></span></td>');
        continue;
      }
      // 読み上げ：印の色（予約済み・キャンセル待ち・自分の企画）も件数で言う
      var marks = evs.map(markOf), sub = [];
      [['is-res', '予約済み'], ['is-wait', 'キャンセル待ち'], ['is-own', 'あなたの企画']].forEach(function (k) {
        var n = marks.filter(function (x) { return x === k[0]; }).length;
        if (n) sub.push(k[1] + n + '件');
      });
      var label = (mo + 1) + '月' + d + '日(' + WD[wd] + ')' + (isToday ? '・今日' : '') + ' ' + evs.length + '件' + (sub.length ? '（' + sub.join('・') + '）' : '');
      cells.push('<td class="evcal__td"><button type="button" class="' + cls + ' is-has" data-ev-day="' + key + '" aria-pressed="' + (key === sel) + '" aria-label="' + esc(label) + '">' +
        '<span class="evcal__n num">' + d + '</span>' +
        '<span class="evcal__evs">' + evs.slice(0, 2).map(function (x) {
          return '<span class="evcal__ev ' + markOf(x) + '"><span class="num">' + hm(x.at) + '</span> ' + esc(x.title) + '</span>';
        }).join('') + (evs.length > 2 ? '<span class="evcal__more">ほか' + (evs.length - 2) + '件</span>' : '') + '</span>' +
        '<span class="evcal__dots">' + evs.slice(0, 4).map(function (x) { return '<i class="' + markOf(x) + '"></i>'; }).join('') + '</span>' +
      '</button></td>');
    }
    while (cells.length % 7) cells.push('<td class="evcal__td is-out"></td>');
    var rows = '';
    for (var i = 0; i < cells.length; i += 7) rows += '<tr>' + cells.slice(i, i + 7).join('') + '</tr>';

    var prevOk = m > min, nextOk = m < max;
    var navBtn = function (dir, ok, lbl) {
      return '<button type="button" class="iconbtn evcal__nav' + (dir < 0 ? ' is-prev' : '') + '" data-ev-month="' + dir + '" aria-label="' + lbl + '"' +
        (ok ? '' : ' aria-disabled="true"') + '>' + U.chevron() + '</button>';
    };
    // 凡例は、その月に出ている印だけ。印が1種類だけの月（予約済みの一覧など）は出さない
    var LEG = [['is-res', '予約済み'], ['is-wait', 'キャンセル待ち'], ['is-own', 'あなたの企画'], ['', 'そのほか']];
    var shownMarks = {};
    items.forEach(function (x) { if (ym(x.at) === m) shownMarks[markOf(x)] = true; });
    var legs = LEG.filter(function (k) { return shownMarks[k[0]]; });
    var legend = view.tab === 'attended' || legs.length < 2 ? '' :
      '<p class="evcal__legend" aria-hidden="true">' + legs.map(function (k) {
        return '<span><i' + (k[0] ? ' class="' + k[0] + '"' : '') + '></i>' + k[1] + '</span>';
      }).join('') + '</p>';

    var dayList = '';
    if (sel) {
      var dl = byDay[sel] || [];
      dayList = '<section class="evcal-day" aria-labelledby="evDayTtl"><h3 class="evcal-day__ttl" id="evDayTtl">' + esc(dayLabel(sel)) + '</h3>' +
        '<div class="card ev-list">' + dl.map(function (x) { return x.past ? pastOrPending(x, 'h4') : row(x, 'h4'); }).join('') + '</div></section>';
    } else {
      dayList = '<p class="evcal-day__none">' + (view.tab === 'attended' ? 'この月に参加したイベントはありません。' : 'この月のイベントはありません。') + '</p>';
    }
    return '<div class="card evcal">' +
      '<div class="evcal__head">' + navBtn(-1, prevOk, '前の月') + '<h3 class="evcal__ttl">' + monthLabel(m) + '</h3>' + navBtn(1, nextOk, '次の月') + '</div>' +
      '<table class="evcal__grid"><thead><tr>' + WD.map(function (w, i) {
        return '<th scope="col" class="' + (i === 0 ? 'is-sun' : i === 6 ? 'is-sat' : '') + '">' + w + '</th>';
      }).join('') + '</tr></thead><tbody>' + rows + '</tbody></table>' + legend +
    '</div>' + dayList;
  }

  /* ---------- 会員の企画と、カレンダーの購読 ---------- */
  /** 企画・発表の札。発表が決まったものは「決定」（R.proposals が付ける。お知らせの「発表が決まりました」とそろう） */
  function propTag(p) { return U.statusTag(p.tag, p.statusLabel); }
  function propRow(p) {
    var tag = propTag(p);
    if (p.kind === 'speaker') {
      var e = R.event(p.event);
      return '<button type="button" class="li ev-prop__row" data-ev-open="' + esc(p.event) + '" aria-haspopup="dialog">' +
        '<span class="li__body"><span class="li__ttl">' + U.jp('成果発表会の発表「' + p.title + '」') + '</span>' +
          '<span class="li__sub">' + esc(e ? U.fmtShort(e.at, true) + '・' + e.title : '') + '</span></span>' +
        '<span class="li__end">' + tag + '</span>' + U.chevron() + '</button>';
    }
    var sub = U.fmtShort(p.at, true) + '・' + (p.online ? 'オンライン' : p.place) + '・定員' + p.cap + '名';
    var body = '<span class="li__body"><span class="li__ttl">' + ttl(p.title) + '</span><span class="li__sub">' + U.jp(sub) + '</span>' +
      (p.status === 'rejected' && p.reason ? '<span class="li__sub ev-prop__why">' + U.jp('見送りの理由：' + p.reason) + '</span>' : '') + '</span>';
    if (p.status === 'approved') {
      return '<button type="button" class="li ev-prop__row" data-ev-open="' + esc(p.id) + '" aria-haspopup="dialog">' + body +
        '<span class="li__end">' + tag + '</span>' + U.chevron() + '</button>';
    }
    return '<div class="li ev-prop__row">' + body + '<span class="li__end">' + tag + '</span></div>';
  }
  function proposalsSec() {
    var list = R.proposals() || [];
    var btn = '<button type="button" class="btn btn-ghost" data-ev-propose="new">' + icon('plus', 'ico-s') + '企画を出す</button>';
    return '<section class="sec ev-prop" aria-labelledby="evPropTtl"><h2 class="sec-ttl" id="evPropTtl">会員の企画</h2>' +
      (list.length
        ? '<div class="list">' + list.map(propRow).join('') + '</div><div class="ev-prop__foot">' + btn + '</div>'
        : '<div class="card card-pad ev-prop__empty"><p>オフ会や勉強会は、会員も企画できます。運営が確認してから、この画面に載せます。</p>' + btn + '</div>') +
    '</section>';
  }
  function subSec() {
    return '<section class="sec ev-sub" aria-labelledby="evSubTtl"><h2 class="sec-ttl" id="evSubTtl">カレンダーアプリに入れる</h2>' +
      '<div class="card card-pad">' +
        '<p class="ev-sub__txt">予約したイベントが、GoogleカレンダーやiPhoneのカレンダーに入ります。</p>' +
        '<div class="ev-sub__row"><label class="sr-only" for="evSubUrl">購読用のURL</label>' +
          '<input class="input ev-sub__url" id="evSubUrl" type="text" readonly value="' + esc(subUrl()) + '">' +
          '<button type="button" class="btn btn-ink" data-ev-copycal="1">' + icon('copy', 'ico-s') + 'コピー</button></div>' +
      '</div></section>';
  }

  /* ---------- 詳細の窓 ---------- */
  /** 満席の会の予約を取り消すと、席は次の人に回って、もう一度は予約できない（キャンセル待ちになる） */
  function fullWarn(e) { return !e.own && R.isFull(e) ? '満席の会なので、取り消すと次はキャンセル待ちになります。' : ''; }
  function stateNote(e, s, st) {
    // 知らせの形は共通（記号＋文）。色で状態を分ける：済み・予約は緑、気をつけては黄土、そのほかは藍
    var ICO = { 'notice-ok': 'checkc', 'notice-warn': 'alert' };
    var n = function (cls, text, role) {
      return '<div class="notice ' + cls + ' evd__state"' + (role ? ' role="' + role + '"' : '') + '>' + icon(ICO[cls] || 'info') + '<p>' + text + '</p></div>';
    };
    if (s.reserved && st.confirming) return n('notice-warn', '<b>この予約を取り消しますか。</b>' + fullWarn(e), 'alert');
    if (s.done) return n('notice-ok', '<b>参加済みです。</b>');
    if (s.own) return n('', '<b>あなたの企画です。</b>' + (e.own ? '運営が確認して載せました。' : ''));
    // 終わった会（お知らせのリンクなどから開いた）：予約していても「予約済み」とは言わない。
    // 一覧では「参加した」の中に「出欠の確認待ち」で出ているので、同じ言葉で言う（参加の記録と XP は運営の出欠のあと）
    if (s.ended) return n('', s.reserved ? '<b>この会は終わりました。</b>出欠の確認待ちです。出欠は運営が付けます。' : 'この会は終わりました。');
    if (s.reserved) return n('notice-ok', '<b>予約済みです。</b>' + (promotion(e.id) ? 'キャンセル待ちから繰り上がりました。' : ''));
    if (s.wait) return n('notice-warn', '<b>キャンセル待ち（' + s.wait + '番目）です。</b>空きが出たら' + notifyWay() + 'で連絡します。');
    if (s.live) return n('', '<b>開催中です。</b>');
    if (s.full) return n('', '<b>満席です。</b>キャンセル待ちができます。');
    if (e.audience === 'new30' && !s.open) return n('', sawOrientation() ? 'オリエンテーションには前に参加しています。' : '入会30日以内の方向けの会です。');
    return '';
  }
  /** 当日の連絡先。データの「当日の連絡は「相談・メッセージ」へ…」の「相談・メッセージ」を、その画面へのリンクにする */
  function contactHtml(text) {
    var MSG = '「相談・メッセージ」';
    var parts = String(text || '').replace(/^当日の連絡は/, '').split(MSG);
    return parts.map(function (t) { return U.jp(t); }).join('<a class="evd__msg" href="#/messages">相談・メッセージ</a>');
  }
  /** 参加のしかた：Zoom は開始30分前から、会場は予約した人だけ（R.eventAccess の判定のまま） */
  function accessSec(e, s) {
    var a = s.access;
    // 終わった会には出さない（Zoom・会場・持ち物は、もう使わないため）
    if (!a || a.ended || s.ended) return '';
    var rows = [];
    if (a.online) {
      var z = a.ended ? '終わりました'
        : a.ready ? zoomLink({ zoomUrl: a.zoomUrl, id: e.id }, 'btn btn-primary evd__zoom')
        : '開始30分前（' + hm(a.opensAt) + '）にここに出ます';
      rows.push(['Zoom', z]);
    }
    var vs = a.venue ? [a.venue] : (a.venues || []);
    vs.forEach(function (v) {
      var map = safeUrl(v.mapUrl);
      rows.push(['会場', '<b>' + esc(v.name) + '</b><br>' + U.jp(v.address) +
        (map ? '<a class="evd__map" href="' + esc(map) + '" target="_blank" rel="noopener">' + icon('pin', 'ico-s') + '地図を開く</a>' : '')]);
    });
    if (vs.length) {
      rows.push(['当日の連絡', contactHtml(vs[0].contact)]);
      if (vs[0].bring) rows.push(['持ち物', U.jp(vs[0].bring)]);
    }
    return '<section class="evd__sec evd__access" aria-labelledby="evdAcc"><h3 class="evd__h" id="evdAcc">参加のしかた</h3>' +
      '<table class="kv evd__kv"><tbody>' + rows.map(function (r) {
        return '<tr><th scope="row">' + esc(r[0]) + '</th><td>' + r[1] + '</td></tr>';
      }).join('') + '</tbody></table>' +
      (!a.ended ? '<button type="button" class="btn btn-text btn-s evd__demo" data-evd="attend">参加したことにする（デモ）</button>' : '') +
    '</section>';
  }
  function agendaSec(e) {
    if (!e.agenda || !e.agenda.length) return '';
    return '<section class="evd__sec"><h3 class="evd__h">当日の流れ</h3><ol class="evd__agenda">' + e.agenda.map(function (a) {
      return '<li><span class="num">' + esc(a[0]) + '</span><span>' + U.jp(a[1]) + '</span></li>';
    }).join('') + '</ol></section>';
  }
  function speakForm() {
    return '<form class="evd__speak" data-evd-form="speak" novalidate>' +
      '<label class="field"><span>発表の題</span>' +
        '<input class="input" name="title" maxlength="40" required autocomplete="off" placeholder="例：Instagramの投稿を3か月続けてみて">' +
        '<small>40文字まで。金額は入れないでください。</small></label>' +
      '<div class="row"><button type="button" class="btn btn-soft btn-s" data-evd="speak-cancel">やめる</button>' +
        '<button type="submit" class="btn btn-ink btn-s">申し込む</button></div>' +
    '</form>';
  }
  function speakersSec(e, s, st) {
    if (e.kind !== 'showcase') return '';
    var list = e.speakers || [], app = R.speakerApp(e.id), future = new Date(e.at) > now();
    var mine = '';
    if (app) mine = '<div class="evd__mine" data-evd-mine tabindex="-1"><p>' +
      (app.status === 'review' ? '発表「' + U.jp(app.title) + '」を申し込みました。運営が確認してから、お知らせで返事をします。' : 'あなたの発表「' + U.jp(app.title) + '」') +
      '</p>' + propTag(app) + '</div>';
    else if (future && st.speaking) mine = speakForm();
    else if (future) mine = '<button type="button" class="btn btn-ghost btn-s evd__speakbtn" data-evd="speak">発表者として申し込む</button>';
    return '<section class="evd__sec"><h3 class="evd__h">発表する人<span class="evd__n num">' + list.length + '人</span></h3>' +
      (list.length ? '<ul class="evd__speakers">' + list.map(function (sp) {
        return '<li>' + U.personLink(R.person(sp.person), { size: 'xs' }) + '<span class="evd__talk">' + U.jp(sp.title) + '</span></li>';
      }).join('') + '</ul>' : '') + mine + '</section>';
  }
  /** 参加予定：5人の顔と名前。主催者には全員の一覧 */
  function peopleSec(e, s) {
    var at = e.own ? { count: 0, list: [] } : R.attendees(e.id);
    // 終わった会は「予定」ではないので、予約した人と書く（出欠は運営が付ける）
    var head = '<h3 class="evd__h">' + (s.own ? '参加者' : s.ended ? '予約した人' : '参加予定') + '<span class="evd__n num">' + at.count + '人</span></h3>';
    if (!at.count) return '<section class="evd__sec">' + head + '<p class="evd__none">まだ予約はありません。</p></section>';
    var list = s.own ? at.list : at.list.slice(0, 5), rest = at.count - list.length;
    return '<section class="evd__sec">' + head +
      '<ul class="evd__people' + (s.own ? ' is-all' : '') + '">' + list.map(function (p) {
        return '<li>' + U.personLink(p, { size: 'xs' }) + '</li>';
      }).join('') + (rest > 0 ? '<li class="evd__rest">ほか' + rest + '人</li>' : '') + '</ul></section>';
  }
  function kvSec(e, s) {
    var h = host(e), rows = [['場所', U.jp(e.place)]];
    if (e.audience === 'new30') rows.push(['対象', '入会30日以内の方']);
    rows.push(['主催', h.me ? 'あなた' : U.personLink(h.p, { size: 'xs', sub: h.role })]);
    rows.push(['参加費', U.jp(fee(e))]);
    // 満席の会に繰り上がったときは、運営が定員を1人増やしている（予約した人の数に合わせる）
    var cap = s.reserved ? Math.max(e.cap, (e.count || 0) + 1) : e.cap;
    // 終わった会には残りの席を出さない
    rows.push(['定員', cap + '名' + (s.ended ? '' : '・' + (s.seat.left ? '残り' + s.seat.left + '席' : '満席'))]);
    if (!e.own) rows.push(['録画', e.recording ? 'あり（あとで勉強会の録画に載ります）' : 'なし']);
    // 終わった会：予約していた人は出欠が付いたら XP。予約していなかった人には出さない
    if (!s.own && !s.done && !(s.ended && !s.reserved)) {
      rows.push(['XP', '<b class="num xp-num">+' + DATA.XP.event + '</b>' + (s.ended ? '（出欠が付いたら）' : '（参加したら）')]);
    }
    return '<table class="kv evd__kv evd__info"><tbody>' + rows.map(function (r) {
      return '<tr><th scope="row">' + esc(r[0]) + '</th><td>' + r[1] + '</td></tr>';
    }).join('') + '</tbody></table>';
  }
  function detailBody(e, st) {
    var s = stateOf(e), start = new Date(e.at);
    var rel = s.live ? '開催中' : s.ended ? '' : relDay(start);
    return '<div class="evd">' +
      photo(e, 'evd__photo', 560, 315, true) +
      '<p class="evd__when">' + U.fmtDate(start, { noYear: start.getFullYear() === now().getFullYear() }) +
        ' <span class="num">' + timeRange(e) + '</span>' + (e.min ? '<span class="evd__min">（' + e.min + '分）</span>' : '') +
        (rel ? '<span class="evd__rel">' + rel + '</span>' : '') + '</p>' +
      (!s.ended && !s.done ? '<button type="button" class="btn btn-text btn-s evd__ics" data-evd="ics">' + icon('calendar', 'ico-s') + 'カレンダーに追加する</button>' : '') +
      stateNote(e, s, st) +
      accessSec(e, s) +
      '<div class="evd__desc">' + U.jp(e.desc || '', { br: true }) + '</div>' +
      agendaSec(e) +
      speakersSec(e, s, st) +
      peopleSec(e, s) +
      kvSec(e, s) +
    '</div>';
  }
  function detailFoot(e, st) {
    var s = stateOf(e);
    var close = function (kind) { return '<button type="button" class="btn ' + (kind || 'btn-soft') + '" data-close>閉じる</button>'; };
    if (s.reserved && st.confirming) {
      return '<button type="button" class="btn btn-soft" data-evd="keep">やめる</button>' +
        '<button type="button" class="btn btn-danger" data-evd="unreserve-yes">予約を取り消す</button>';
    }
    if (s.done || s.own || s.ended) return close();
    if (s.reserved) return (s.started ? '' : '<button type="button" class="btn btn-text evd__cancel" data-evd="unreserve">予約を取り消す</button>') + close();
    if (s.wait) return '<button type="button" class="btn btn-text evd__cancel" data-evd="leave">キャンセル待ちをやめる</button>' + close();
    if (s.started) return close();
    if (s.full) return close() + '<button type="button" class="btn btn-ink" data-evd="wait">キャンセル待ちする</button>';
    if (!s.open) return close();
    return close() + '<button type="button" class="btn btn-primary" data-evd="reserve">予約する</button>';
  }

  /** 窓の中を描き直す。押したボタンが消えるので、次に押しそうなものへ焦点を移す（窓の中だけの話）。
      top：予約した・取り消したなど、上の「予約済みです」「参加のしかた」が変わるときは先頭まで戻して見せる */
  function redraw(d, sel, top, keep) {
    if (!d || !d.m.parentNode) return;
    var e = findEvent(d.id);
    if (!e) { d.m.close(); return; }
    d.sig = detailSig(e);
    var box = d.m.querySelector('.modal'), body = box.querySelector('.modal__body'), foot = box.querySelector('.modal__foot');
    // 写真は読み込み済みの要素をそのまま戻す（描き直しで一瞬白くならないように）
    var img = body.querySelector('.evd__photo');
    body.innerHTML = detailBody(e, d.st);
    var fresh = body.querySelector('.evd__photo');
    if (img && fresh) fresh.parentNode.replaceChild(img, fresh);
    if (foot) foot.innerHTML = detailFoot(e, d.st);
    if (top) box.scrollTop = 0;
    if (keep) return;
    var t = (sel && box.querySelector(sel)) || box.querySelector('.modal__foot [data-close]') || box.querySelector('[data-x]');
    if (t) { try { t.focus({ preventScroll: false }); } catch (err) { t.focus(); } }
  }
  /** 窓の中身を変える状態（予約・キャンセル待ち・参加済み・満席）。時刻で変わるもの（始まった・終わった）は入れない */
  function detailSig(e) { var s = stateOf(e); return [s.reserved, s.wait, s.done, s.full].join(','); }
  /** 別のタブ（運営画面の繰り上げ・取り消しなど）で状態が変わったとき：窓の中だけ描き直す。
      焦点は同じボタンへ（消えたら「閉じる」へ）。発表の題を書いている途中は描き直さない */
  function refreshDetail() {
    var d = detail;
    if (!d || d.acting || !d.m.parentNode) return false;
    var e = findEvent(d.id);
    if (!e || detailSig(e) === d.sig) return false;
    var box = d.m.querySelector('.modal'), a = document.activeElement, inside = !!(a && box && box.contains(a));
    if (inside && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return false;
    var sel = null;
    if (inside) {
      if (a.hasAttribute('data-evd')) sel = '[data-evd="' + a.getAttribute('data-evd') + '"]';
      else if (a.hasAttribute('data-close')) sel = '.modal__foot [data-close]';
      else if (a.hasAttribute('data-x')) sel = '[data-x]';
    }
    d.st.confirming = false;
    redraw(d, sel, false, !inside || !!(sel && sel === '[data-x]'));
    return true;
  }

  /** 一覧のその会の題のボタン（繰り上がりの知らせの「詳細を見る」より、行の題を先に） */
  function rowOpener(id) {
    var q = String(id).replace(/["\\]/g, '');
    return document.querySelector('.scr-events [data-ev-row="' + q + '"] [data-ev-open]') ||
      document.querySelector('.scr-events [data-ev-open="' + q + '"]');
  }
  function openDetail(id, how) {
    var e = findEvent(id);
    if (!e) { U.toast('このイベントは見つかりませんでした', 'error'); return; }
    if (detail && detail.m.parentNode) { if (detail.id === id) return; detail.silent = true; detail.m.close(); }
    // URL から開くとき（お知らせ・戻る→進む）は、一覧のその行の題を「開いたもの」にする（閉じたらその行へ焦点が戻る）
    if (how === 'pushed') {
      var row = rowOpener(id);
      if (row) { try { row.focus({ preventScroll: true }); } catch (err) {} }
    }
    // 描き直しを通らずに状態が変わっていても（デモを戻したなど）、繰り上がりを見分けられるように
    waitSeen = waitIds();
    var d = { id: id, st: { confirming: false, speaking: false }, pushed: how === 'pushed', sig: detailSig(e) };
    d.m = U.modal(detailBody(e, d.st), {
      title: e.title, foot: detailFoot(e, d.st), cls: 'scr-events evd-modal',
      onClose: function () { onDetailClose(d); }
    });
    detail = d;
    view.opened = id;
    // 繰り上がりのお知らせは、この会を開いたら読んだことにする（一覧の上の知らせも消える）
    var pn = promotion(id);
    if (pn && pn.unread && R.markNoticeRead) R.markNoticeRead(pn.id);
    if (how === 'push') {
      // 窓を開いてから履歴を積む（hashchange は起きないので、一覧は描き直さない＝スクロールも焦点も動かない）
      try {
        history.pushState({ evd: id, k: 'events/' + id, y: window.scrollY || 0 }, '', '#/events/' + encodeURIComponent(id));
        d.pushed = true;
      } catch (err) {}
    }
    bindDetail(d);
  }
  /** #/events/e2 に直接来たとき：下に #/events をはさむ（戻るで一覧に戻れるように） */
  function openFromRoute(id) {
    var hs = null, mark = 'events/' + id;
    try { hs = history.state; } catch (e) {}
    if (hs && (hs.evd === id || hs.k === mark)) { openDetail(id, 'pushed'); return; }
    try {
      history.replaceState({ k: 'events', y: 0 }, '', '#/events');
      history.pushState({ evd: id, k: mark, y: 0 }, '', '#/events/' + encodeURIComponent(id));
      openDetail(id, 'pushed');
    } catch (e) { openDetail(id); }
  }
  /** 閉じたとき：URL を #/events に戻す。戻る・リンクですでに別の場所にいるなら何もしない */
  function onDetailClose(d) {
    if (detail === d) detail = null;
    if (d.silent) return;                 // 画面の側で閉じた（戻るで #/events に来た・別の詳細に替えた）
    var h = String(location.hash || ''), m = /^#\/events\/([^?]+)/.exec(h), id = null;
    try { id = m ? decodeURIComponent(m[1]) : null; } catch (e) { id = m && m[1]; }
    if (id === d.id) {
      // 戻った #/events の描き直しのあと、mount がこの会の行へ焦点を戻す
      // （URL から開いたときは「別の画面」からの移動になり、骨組みは見出しへ焦点を送るため）
      if (d.pushed) { view.backTo = { id: d.id, t: Date.now() }; history.back(); return; }
      try { history.replaceState(null, '', '#/events'); } catch (e) {}
      if (cur) cur.refresh();
      return;
    }
    // 履歴を積めずに #/events のまま開いていたとき：窓の中で変えたことを一覧に映す
    if (/^#\/events(?:\?|$)/.test(h) && cur) cur.refresh();
  }

  function bindDetail(d) {
    var box = d.m.querySelector('.modal');
    box.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-evd], [data-ev-zoom]');
      if (!b) return;
      var e = findEvent(d.id);
      if (!e) return;
      if (b.hasAttribute('data-ev-zoom')) { zoomClick(ev, b); return; }
      // 押した動きで保存が変わっても、store.on の描き直し（refreshDetail）はしない。ここで焦点の行き先を決めて描き直す
      d.acting = true;
      try { detailAct(d, e, b); } finally { d.acting = false; }
    });
    box.addEventListener('submit', function (ev) {
      var f = ev.target.closest('[data-evd-form="speak"]');
      if (!f) return;
      ev.preventDefault();
      d.acting = true;
      try { speakSubmit(d, f); } finally { d.acting = false; }
    });
  }
  function detailAct(d, e, b) {
    var act = b.getAttribute('data-evd');
    // 窓の中では一言の知らせを出さない（窓の下のボタンに重なるため）。上の「予約済みです」などを変えて、読み上げで伝える
    if (act === 'ics') saveIcs(e);
    else if (act === 'reserve') {
      if (!R.reserve(e.id)) { U.toast('予約できませんでした（満席か、対象外の会です）', 'error'); redraw(d); return; }
      CLG.app.announce('予約しました');
      redraw(d, '.modal__foot [data-close]', true);
    } else if (act === 'unreserve') { d.st.confirming = true; redraw(d, '[data-evd="keep"]', true); }
    else if (act === 'keep') { d.st.confirming = false; redraw(d, '[data-evd="unreserve"]'); }
    else if (act === 'unreserve-yes') {
      d.st.confirming = false;
      R.unreserve(e.id);
      CLG.app.announce('予約を取り消しました');
      redraw(d, '[data-evd="reserve"], [data-evd="wait"]', true);
    } else if (act === 'wait') {
      var w = R.joinWaitlist(e.id);
      if (!w || !w.ok) { U.toast((w && w.error) || 'キャンセル待ちできませんでした', 'error'); return; }
      CLG.app.announce('キャンセル待ちにしました。' + w.position + '番目です');
      redraw(d, '[data-evd="leave"]', true);
    } else if (act === 'leave') {
      R.leaveWaitlist(e.id);
      CLG.app.announce('キャンセル待ちをやめました');
      redraw(d, '[data-evd="wait"]', true);
    } else if (act === 'speak') { d.st.speaking = true; redraw(d, '.evd__speak input'); }
    else if (act === 'speak-cancel') { d.st.speaking = false; redraw(d, '[data-evd="speak"]'); }
    else if (act === 'attend') {
      // 試作版だけ：出欠は本番では運営が付ける（R.markAttendance）
      view.reward = R.attend(e.id);
      view.tab = 'attended'; view.mode = 'list';
      d.m.close();
    }
  }
  function speakSubmit(d, f) {
    var r = R.applySpeaker(d.id, f.title.value);
    if (r && r.errors) { U.fieldErrors(f, r.errors); return; }
    if (!r || !r.ok) { U.toast((r && r.error) || '申し込めませんでした', 'error'); return; }
    d.st.speaking = false;
    CLG.app.announce('発表を申し込みました。運営が確認してから、お知らせで返事をします');
    redraw(d, '[data-evd-mine]');
  }
  /** Zoom の URL が試作用の仮のものなら、開かずに本番の動きを知らせる */
  function zoomClick(ev, a) {
    if (a.getAttribute('href') === DATA.SITE.zoomPlaceholder) {
      ev.preventDefault();
      U.toast('本番では、この会のZoomミーティングが開きます');
    }
  }

  /* ---------- 企画を出す（窓の中のフォーム） ---------- */
  function localInput(d) { return ymd(d) + 'T' + hm(d); }
  function proposeForm() {
    var t = now(); t.setDate(t.getDate() + 1); t.setHours(0, 0, 0, 0);
    var sug = new Date(t); sug.setDate(sug.getDate() + 7); sug.setHours(20, 0, 0, 0);
    return '<form class="ev-pform" id="evPropForm" novalidate>' +
      '<label class="field"><span>題</span><input class="input" name="title" maxlength="40" required autocomplete="off" placeholder="例：旭川オフ会（子連れOK）"><small>40文字まで</small></label>' +
      '<label class="field"><span>日時</span><input class="input" name="at" type="datetime-local" required min="' + localInput(t) + '" value="' + localInput(sug) + '"><small>明日以降</small></label>' +
      '<fieldset class="field ev-pform__where" data-field><legend class="field__label">場所</legend>' +
        '<div class="ev-pform__radios">' +
          '<label class="check"><input type="radio" name="online" value="online" checked><span>オンライン（Zoom）</span></label>' +
          '<label class="check"><input type="radio" name="online" value="offline"><span>会場</span></label>' +
        '</div></fieldset>' +
      '<label class="field ev-pform__place" hidden><span>会場の場所</span><input class="input" name="place" autocomplete="off" placeholder="例：旭川市（駅の近くのカフェ）"><small>市区町村まで。店の名前は予約した人に<span class="nw">だけ伝えます</span></small></label>' +
      '<div class="grid-2 ev-pform__2">' +
        '<label class="field"><span>定員</span><input class="input" name="cap" type="number" inputmode="numeric" min="2" max="100" required value="10"><small>2〜100人</small></label>' +
        '<label class="field"><span>実費<span class="opt">任意</span></span><input class="input" name="fee" autocomplete="off" placeholder="例：ランチ代（1,500円くらい）"><small>空なら「無料」</small></label>' +
      '</div>' +
      '<label class="field"><span>内容</span><textarea class="textarea" name="desc" rows="4" maxlength="1000" required placeholder="例：旭川に住んでいる会員で、ランチを食べながら近況を話します。はじめての方も歓迎です。"></textarea></label>' +
      '<p class="ev-pform__note">運営が内容を確認してから載せます（2営業日ほど）。勧誘や販売が目的の会は載せられません。</p>' +
    '</form>';
  }
  function openPropose() {
    var m = U.modal(proposeForm(), {
      title: 'イベントを企画する', cls: 'scr-events', dirty: true,
      foot: '<button type="button" class="btn btn-soft" data-close>やめる</button>' +
        '<button type="submit" form="evPropForm" class="btn btn-primary">運営に送る</button>'
    });
    var f = m.querySelector('#evPropForm'), place = m.querySelector('.ev-pform__place');
    U.fieldErrors(f, {});   // 必須の札を付けておく
    f.addEventListener('change', function (ev) {
      if (ev.target.name !== 'online') return;
      var off = f.online.value === 'offline';
      place.hidden = !off;
      if (!off) U.fieldErrors(f, { place: '' }, { focus: false });
    });
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var r = R.proposeEvent({
        title: f.title.value, at: f.at.value ? new Date(f.at.value).toISOString() : '', online: f.online.value,
        place: f.place.value, cap: f.cap.value, fee: f.fee.value, desc: f.desc.value
      });
      if (!r.ok) {
        var errs = r.errors || {};
        ['title', 'at', 'place', 'cap', 'fee', 'desc'].forEach(function (k) { if (!errs[k]) errs[k] = ''; });
        U.fieldErrors(f, errs);
        return;
      }
      m.close();
      U.toast('企画を送りました。運営が確認したら、お知らせで返事をします', 'ok');
      if (cur) cur.refresh();
    });
  }

  /* ---------- 一覧の書き換え（ルールの関数を呼ぶだけ） ---------- */
  function doReserve(e) {
    if (R.isReserved(e.id)) return;
    if (!R.reserve(e.id)) { U.toast('予約できませんでした（満席か、対象外の会です）', 'error'); cur.refresh(); return; }
    U.toast('予約しました', 'ok');
    cur.refresh();
  }
  /** 一覧の「取り消す」。確かめてから。予約済みの一覧では行が消えるので、次の行の題へ焦点を送る */
  function askUnreserve(e, btn) {
    var next = null;
    if (view.tab === 'reserved') {
      var rowEl = btn.closest('.ev'), sib = rowEl && (rowEl.nextElementSibling || rowEl.previousElementSibling);
      var link = sib && sib.querySelector('[data-ev-open]');
      next = link ? '[data-ev-open="' + link.getAttribute('data-ev-open') + '"]' : '[data-ev-tab="upcoming"]';
    }
    U.confirmBox('予約を取り消しますか', '「' + e.title + '」（' + U.fmtShort(e.at, true) + '）の予約を取り消します。' + fullWarn(e), '取り消す', true)
      .then(function (ok) {
        if (!ok) return;
        R.unreserve(e.id);
        U.toast('予約を取り消しました');
        cur.refresh(next ? { focus: next } : undefined);
      });
  }
  function doWait(e) {
    var w = R.joinWaitlist(e.id);
    if (!w || !w.ok) { U.toast((w && w.error) || 'キャンセル待ちできませんでした', 'error'); return; }
    U.toast('キャンセル待ちにしました（' + w.position + '番目）。空きが出たら' + notifyWay() + 'で連絡します', 'ok');
    cur.refresh();
  }
  function doLeave(e) {
    R.leaveWaitlist(e.id);
    U.toast('キャンセル待ちをやめました');
    cur.refresh();
  }

  function onClick(ev) {
    var t = ev.target;
    if (!t || !t.closest || !t.closest('.scr-events') || !cur) return;
    var b;
    if ((b = t.closest('[data-ev-tab]'))) { view.tab = b.getAttribute('data-ev-tab'); view.month = null; view.day = null; cur.refresh(); return; }
    if ((b = t.closest('[data-ev-kind]'))) { view.kind = b.getAttribute('data-ev-kind'); view.day = null; cur.refresh(); return; }
    if ((b = t.closest('[data-ev-mode]'))) { view.mode = b.getAttribute('data-ev-mode'); cur.refresh(); return; }
    if ((b = t.closest('[data-ev-month]'))) {
      if (b.getAttribute('aria-disabled') === 'true' || !view.month) return;
      view.month = monthShift(view.month, +b.getAttribute('data-ev-month')); view.day = null;
      cur.refresh();
      // 見出しは描き直しで入れ替わるので、変わった月は読み上げで伝える
      if (cur.announce) cur.announce(monthLabel(view.month));
      return;
    }
    if ((b = t.closest('[data-ev-day]'))) { view.day = b.getAttribute('data-ev-day'); cur.refresh(); return; }
    if ((b = t.closest('[data-ev-propose]'))) { openPropose(); return; }
    if ((b = t.closest('[data-ev-copycal]'))) {
      U.copyText(subUrl()).then(function () { U.toast('URLをコピーしました。本番では、カレンダーアプリに貼ると予約したイベントが入ります', 'ok'); });
      return;
    }
    if ((b = t.closest('[data-ev-zoom]'))) { zoomClick(ev, b); return; }
    var e;
    if ((b = t.closest('[data-ev-reserve]'))) { if ((e = R.event(b.getAttribute('data-ev-reserve')))) doReserve(e); return; }
    if ((b = t.closest('[data-ev-cancel]'))) { if ((e = R.event(b.getAttribute('data-ev-cancel')))) askUnreserve(e, b); return; }
    if ((b = t.closest('[data-ev-wait]'))) { if ((e = R.event(b.getAttribute('data-ev-wait')))) doWait(e); return; }
    if ((b = t.closest('[data-ev-leave]'))) { if ((e = R.event(b.getAttribute('data-ev-leave')))) doLeave(e); return; }
    // 参加した会の行は開かない（出欠の確認待ちの行は、題のボタンから詳細を開く）
    if (t.closest('a, input, label, .ev-past:not(.is-pending)')) return;
    b = t.closest('[data-ev-open], [data-ev-row]');
    if (!b) return;
    var id = b.getAttribute('data-ev-open') || b.getAttribute('data-ev-row');
    // 行のすき間を押したときも、閉じたあと焦点が戻るように題のボタンを「開いたもの」にする
    var link = b.hasAttribute('data-ev-open') ? b : b.querySelector('[data-ev-open]');
    if (link && link !== document.activeElement) { try { link.focus({ preventScroll: true }); } catch (err) {} }
    openDetail(id, 'push');
  }

  CLG.screens.events = {
    title: function (ctx) {
      var id = ctx.params && ctx.params[0];
      return id && !findEvent(id) ? 'ページが見つかりません' : 'イベント';
    },
    back: function (ctx) { return ctx.params && ctx.params[0] ? { href: '#/events', label: 'イベント' } : null; },
    render: function (ctx) {
      var q = ctx.query || {};
      var pid = ctx.params && ctx.params[0];
      if (pid && !findEvent(pid)) return U.notFound({ lead: 'このイベントは見つかりませんでした。日にちが変わったか、取りやめになりました。' });
      // 「入会したての状態で見る」などで会員が替わったら、前の人の切り替えを持ち越さない
      var owner = R.me().id;
      if (view.owner !== owner) { view.owner = owner; view.tab = 'upcoming'; view.kind = 'all'; view.mode = 'list'; view.month = null; view.day = null; view.qk = null; }
      var qk = (q.tab || '') + '|' + (q.kind || '') + '|' + (q.mode || '');
      if (qk !== view.qk) {
        view.qk = qk;
        if (has(TABS, q.tab)) view.tab = q.tab;
        if (has(KINDS, q.kind)) view.kind = q.kind;
        if (has(MODES, q.mode)) view.mode = q.mode;
      }
      var up = upcomingAll(), mine = reservedAll(), past = attendedAll();
      waitSeen = waitIds();
      var counts = { upcoming: up.length, reserved: mine.length, attended: past.length };
      var base = view.tab === 'reserved' ? mine : view.tab === 'attended' ? past : up;
      var list = view.tab === 'attended' ? past : byKind(base);

      // 数は見た目では名前のすぐ右。読み上げでは「予約済み、2件」と区切る
      var seg = '<div class="seg ev-tabs" role="group" aria-label="表示するイベント">' + TABS.map(function (t) {
        var on = view.tab === t[0];
        return '<button type="button" aria-pressed="' + on + '" class="' + (on ? 'is-on' : '') + '" data-ev-tab="' + t[0] + '">' +
          t[1] + '<span class="num ev-n"><span class="sr-only">、</span>' + counts[t[0]] + '<span class="sr-only">件</span></span></button>';
      }).join('') + '</div>';
      var modes = '<div class="seg ev-modes" role="group" aria-label="表示の形">' + MODES.map(function (m) {
        var on = view.mode === m[0];
        return '<button type="button" aria-pressed="' + on + '" class="' + (on ? 'is-on' : '') + '" data-ev-mode="' + m[0] + '">' +
          icon(m[0] === 'list' ? 'feed' : 'calendar', 'ico-s') + m[1] + '</button>';
      }).join('') + '</div>';
      // 参加した・中身が空のタブでは、絞り込みを出しても意味がないので隠す
      var chips = view.tab === 'attended' || !base.length ? '' : '<div class="chips ev-chips" role="group" aria-label="種類で絞り込む">' + KINDS.map(function (k) {
        var on = view.kind === k[0];
        return '<button type="button" class="chip' + (on ? ' is-on' : '') + '" aria-pressed="' + on + '" data-ev-kind="' + k[0] + '">' + k[1] + '</button>';
      }).join('') + '</div>';

      var body = view.mode === 'cal' ? (base.length ? calBody(list) : listBody(list, base)) : listBody(list, base);
      return '<div class="scr-events">' +
        '<div class="page-head"><div class="page-head__row">' +
          '<h1 class="page-ttl" data-page-title tabindex="-1">イベント</h1>' + modes +
        '</div></div>' +
        '<div class="ev-bar">' + seg + chips + '</div>' +
        (view.tab !== 'attended' ? promoNote(mine) : '') +
        '<h2 class="sr-only">イベントの一覧</h2>' +
        body +
        (view.tab === 'upcoming' ? proposalsSec() : '') +
        (view.tab !== 'attended' ? subSec() : '') +
      '</div>';
    },
    mount: function (root, ctx) {
      cur = ctx;
      var el = root.querySelector('.scr-events');
      if (!el) return;
      var pid = ctx.params[0];
      if (!pid) {
        view.opened = null;
        // ブラウザの戻るで #/events に来た：開いている詳細を閉じる（焦点は開いた行へ戻る）
        if (detail && detail.m.parentNode) { detail.silent = true; detail.m.close(); }
        // 詳細を × などで閉じて戻ってきた：その会の行の題へ焦点を戻す（行が今の絞り込みに無ければ骨組みに任せる）
        var bt = view.backTo;
        view.backTo = null;
        if (bt && Date.now() - bt.t < 3000) {
          var rb = rowOpener(bt.id);
          if (rb) { try { rb.focus({ preventScroll: true }); } catch (err) { rb.focus(); } if (rb.scrollIntoView && !inView(rb)) rb.scrollIntoView({ block: 'center' }); }
        }
      } else if (view.opened !== pid && (!detail || detail.id !== pid)) {
        view.opened = pid;
        if (findEvent(pid)) openFromRoute(pid);
      }
      // 「参加したことにする」のあと：一覧を描き直してから XP を知らせる（窓を閉じる移動で知らせが消えないように）
      if (view.reward) { var r = view.reward; view.reward = null; CLG.app.reward(r); }
      // せまい画面では絞り込みが横に流れる。選んでいる札が見える位置まで送っておく
      var strip = el.querySelector('.ev-chips'), on = strip && strip.querySelector('.is-on');
      if (on && strip.scrollWidth > strip.clientWidth) strip.scrollLeft = Math.max(0, on.offsetLeft - 16);
      if (root.__boundEvents) return;
      root.__boundEvents = true;
      root.addEventListener('click', onClick);
    }
  };
})();
