/* ============================================================
   相談・メッセージ（#/messages）
   ------------------------------------------------------------
   運営と会員の1対1だけ（会員どうしのDMは作らない。決定事項）。
   1枚の面に、上から 返信する人の帯 → やりとり（中だけスクロール）→ 書く欄。
   パソコンでは面を画面の高さに合わせ、860px 以下は画面いっぱい（下のタブは layout:'full' で隠す）。
   - 送信は R.sendMessage(text, kind, attachments, ref)。試作版は、すぐの自動返信と、5秒ほどあとの担当の返事が届く。
   - 届いたもの・送ったものは、やりとりの末尾に足すだけ（描き直さない）。読み上げが新しい分だけになり、書く欄の焦点も残る。
   - 面談の予約は、候補の日時（R.meetingSlots。運営の「面談の枠」から作られる）を選んで R.bookMeeting。
     やりとりに予約の札（日時・Zoom・変更・取り消し）が出る。
     スタートガイドの「面談」が済みになるのは、運営が確定したとき（bookMeeting の confirmed）。
     候補を開いているあいだに運営が枠を変えたら（別のタブ・運営画面の保存）、候補だけを差し替える（書きかけは残す）。
     860px 以下は候補の列だけを横に送り、「この日時で予約する」は列の下に置く（列の外に送られて見えなくならないように）。
   - 吹き出しの本文は bodyHtml()：URL はリンクに、ほかは U.jp（Safari でも「10分」「9/26(土)」を行の途中で割らない）。
   - #/messages?kind=講座の質問&ref=lesson:<講座>/<回>（録画は ref=archive:<録画>）で来たら、種類と「どの回の質問か」の札と
     書き出しを入れておく。kind がなくても ref が講座の回・録画なら「講座の質問」にする。ref=gig:<案件> は札だけ。
     送るときは R.sendMessage(text, kind, attachments, ref) に ref を渡す（やりとりの吹き出しの下にその回へのリンクが出る）。
     書き出しは、空か、こちらが入れた書き出しのままのときだけ入れ替える（自分で書いた文は消さない）。
     ref=gig: で種類の指定がないときは「講座の質問」のままにせず、最初の種類（質問）に戻す。
     #/messages?kind=面談の予約 で来たら、候補の日時を出して最初の候補に焦点を置く。
   - 予約があるあいだは、帯のボタンは「面談の日時を変える」。候補の中のいまの日時は「（いま）」を付けて選べなくする。
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon;

  var STAFF_ID = 'staff2';
  var MEET = '面談の予約';
  var LESSON_Q = '講座の質問';
  var MAX_ATT = 4;

  var PH = {
    '質問': '例：スタートガイドの「LINEで通知を受け取る」が済みになりません。',
    '講座の質問': '例：SNS発信入門の第3回、プロフィール文の1行目の決め方が分かりませんでした。',
    '相談したい': '例：在宅でできる副業を探しています。平日の夜に1時間くらい使えます。',
    '面談の予約': '例：候補の日時が合わないときは、都合のよい時間帯を書いてください。',
    'その他': '例：講座の動画が途中で止まることがあります。'
  };
  var TEMPLATES = [
    { label: '講座の質問', kind: '講座の質問', text: '講座「」について質問です。\n分からなかったところ：\n試したこと：' },
    { label: '副業の相談', kind: '相談したい', text: '副業の方向性を相談させてください。\nいまの状況：\nやってみたいこと：\n使える時間（1週間に）：' }
  ];
  // 講座の回・勉強会の録画から来たときに入れる書き出し（そのままなら、別の回から来たときに入れ替えてよい）
  var LESSON_TEXT = /^(講座|勉強会の録画)「[^\n]*」について質問です。\n分からなかったところ：\n試したこと：$/;

  // 画面の中だけの状態。書きかけ（draft・添付・どの回の質問か）は描き直しても消えないようにここで持つ
  var view = {
    kind: (DATA.MESSAGE_KINDS || [])[0] || '質問', draft: '', atts: [], ref: null, slot: null,
    qk: null, owner: null, waiting: 0, fromQuery: false, focusSlot: false, caretTo: null, busy: false,
    rendered: 0, lastDay: '', lastFrom: '',
    atBottom: true, ro: null,         // いちばん下を見ているか・やりとりの枠の高さを見張るもの（pin）
    top: null, enter: true, mountedFor: null   // 読み返していた位置・URL が変わって来たか・前に描いた会員
  };
  // URL が変わって来たときは、いちばん下（か「ここから新着」）から見せる。
  // 変わらずに描き直されたとき（別のタブ・運営画面の保存）は、読み返していた位置を保つ（mount）
  if (window.addEventListener) window.addEventListener('hashchange', function () { view.enter = true; });

  /* ---------- 小さな道具 ---------- */
  function kinds() { return DATA.MESSAGE_KINDS || []; }
  function validKind(k) { return kinds().indexOf(k) >= 0; }
  function now() { return CLG.now(); }
  function hm(d) { d = new Date(d); return U.pad(d.getHours()) + ':' + U.pad(d.getMinutes()); }
  function onScreen() { return /^#\/?messages(?:[/?]|$)/.test(location.hash); }
  function reduced() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function size(n) { n = +n || 0; return n >= 1048576 ? (Math.round(n / 104857.6) / 10) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB'; }
  /** 空か、こちらが入れた書き出しのままなら「上書きしてよい」 */
  function untouched(text) {
    text = String(text || '').trim();
    if (!text || LESSON_TEXT.test(text)) return true;
    return TEMPLATES.some(function (t) { return t.text.trim() === text; });
  }
  function dayDiff(d) {
    var a = new Date(d); a.setHours(0, 0, 0, 0);
    var n = now(); n.setHours(0, 0, 0, 0);
    return Math.round((a - n) / 86400000);
  }
  function dayLabel(d) {
    var n = dayDiff(d);
    if (n === 0) return '今日';
    if (n === -1) return '昨日';
    return U.fmtDate(d, { noYear: new Date(d).getFullYear() === now().getFullYear() });
  }
  /** 吹き出しの本文：URL をリンクにし、それ以外は U.jp で出す（Safari でも「10分」「9/26(土)」を行の途中で割らない。改行は <br>）。
      URL は半角の文字だけ（' " < > の手前まで）。すぐ後ろの「。」「）」や、文の終わりの . , : ! ? ( ) [ ] ; は URL に含めない。
      URL の文字には U.jp の印を入れない（日付に見える道 /9/26 などでリンクが切れないように） */
  function bodyHtml(text) {
    var s = String(text || ''), out = '', last = 0, re = /https:\/\/[!#-;=?-~]+/g, m;
    while ((m = re.exec(s))) {
      var u = m[0], cut = u.search(/['"<>]/);
      if (cut >= 0) u = u.slice(0, cut);
      while (/[.,:!?()\[\];]$/.test(u)) u = u.slice(0, -1);
      if (u.length <= 8) continue;                 // 「https://」だけなどはリンクにしない（文字のまま）
      out += U.jp(s.slice(last, m.index), { br: true }) +
        '<a href="' + esc(u) + '" target="_blank" rel="noopener" data-msg-link="1">' + esc(u) + '</a>';
      last = m.index + u.length;
      re.lastIndex = last;
    }
    return out + U.jp(s.slice(last), { br: true });
  }
  var ASK_TAIL = 'について質問です。\n分からなかったところ：\n試したこと：';
  /** 「どの回・どの録画・どの案件の話か」の ref を、見せる形にする。知らない ref は null。
      lesson:<講座>/<回> と archive:<録画> は { kind:'講座の質問', icon, label, chip, href, ref, text（書き出し） }、
      gig:<案件> は書き出しなし（text:''・kind:null） */
  function refInfo(ref) {
    var s = String(ref || ''), a = /^archive:(.+)$/.exec(s), m;
    if (a) {
      var rec = (DATA.ARCHIVE || []).filter(function (x) { return x.id === a[1]; })[0];
      if (!rec) return null;
      var at = '勉強会の録画「' + rec.title + '」';
      return { kind: LESSON_Q, icon: 'play', label: at, chip: at, href: '#/courses/archive/' + encodeURIComponent(rec.id),
        ref: 'archive:' + rec.id, text: at + ASK_TAIL };
    }
    if ((m = /^gig:(.+)$/.exec(s))) {
      var g = R.gig(m[1]);
      if (!g) return null;
      var gt = '案件「' + g.title + '」';
      return { kind: null, icon: 'briefcase', label: gt, chip: gt, href: '#/gigs/' + encodeURIComponent(g.id), ref: 'gig:' + g.id, text: '' };
    }
    m = /^lesson:([^/]+)\/(.+)$/.exec(s);
    var c = m && R.course(m[1]);
    if (!c) return null;
    for (var i = 0; i < (c.lessons || []).length; i++) {
      var l = c.lessons[i];
      if (l.id === m[2]) return { kind: LESSON_Q, icon: 'play', label: c.title + ' 第' + (i + 1) + '回', chip: c.title + ' 第' + (i + 1) + '回「' + l.title + '」',
        href: '#/lesson/' + encodeURIComponent(c.id) + '/' + encodeURIComponent(l.id), ref: 'lesson:' + c.id + '/' + l.id,
        text: '講座「' + c.title + '」第' + (i + 1) + '回「' + l.title + '」' + ASK_TAIL };
    }
    return null;
  }

  /* ---------- やりとり ---------- */
  function refLink(ref) {
    var L = refInfo(ref);
    // 名前は U.jp（せまい幅で「（新サ」「ービス）」のように語の途中で割らない）
    return L ? '<a class="msg__ref" href="' + esc(L.href) + '">' + icon(L.icon, 'ico-s') + '<span class="msg__reftxt">' + U.jp(L.label) + '</span></a>' : '';
  }
  function attsHtml(list, i) {
    return '<div class="msg__atts">' + list.map(function (a, k) {
      if (a.type === 'image' && a.url) {
        return '<button type="button" class="msg-att msg-att--img" data-msg-img="' + i + '-' + k + '" aria-label="' + esc(a.name + 'を大きく見る') + '">' +
          '<img src="' + esc(a.url) + '" alt="" loading="lazy" decoding="async"></button>';
      }
      var inner = '<span class="msg-att__kind">' + (a.type === 'pdf' ? 'PDF' : a.type === 'image' ? '画像' : 'ファイル') + '</span>' +
        '<span class="msg-att__name">' + esc(a.name) + '</span><span class="msg-att__size num">' + size(a.size) + '</span>';
      return a.url ? '<a class="msg-att msg-att--file" href="' + esc(a.url) + '" download="' + esc(a.name) + '">' + inner + '</a>'
        : '<span class="msg-att msg-att--file">' + inner + '</span>';
    }).join('') + '</div>';
  }
  /** 面談の予約の札（日時・Zoom・変更・取り消し）。状態は R.meeting から取る */
  function meetCard(raw) {
    var c = R.meeting(raw.id) || raw, st = c.status || 'pending';
    var start = new Date(c.at), end = new Date(start.getTime() + (c.min || 15) * 60000), n = now();
    var future = start > n, over = end < n;
    var tag = st === 'confirmed' ? U.statusTag('confirmed', '予約確定') : st === 'canceled' ? U.statusTag('canceled', '取り消し') : U.statusTag('pending', '確認中');
    var zoom = st === 'canceled' ? '—'
      : st !== 'confirmed' ? '予約が決まったら、ここに出ます'
      : over ? '終わりました'
      : /^https:\/\//.test(c.zoomUrl || '') ? '<a class="msg-card__zoom" href="' + esc(c.zoomUrl) + '" target="_blank" rel="noopener" data-msg-link="1">' + icon('external', 'ico-s') + 'Zoomを開く</a>' : '—';
    var acts = st !== 'canceled' && future
      ? '<div class="msg-card__acts"><button type="button" class="btn btn-soft btn-s" data-msg-mt-change="' + esc(c.id) + '">変更</button>' +
        '<button type="button" class="btn btn-text btn-s" data-msg-mt-cancel="' + esc(c.id) + '">取り消し</button></div>' : '';
    return '<div class="msg-card' + (st === 'canceled' ? ' is-canceled' : '') + '" data-msg-card="' + esc(c.id) + '" data-st="' + esc(st) + '">' +
      '<div class="msg-card__head"><b>15分の面談</b>' + tag + '</div>' +
      '<dl class="msg-card__kv"><dt>日時</dt><dd>' + esc(U.fmtDate(start, { noYear: start.getFullYear() === n.getFullYear() })) + ' <span class="num">' + hm(start) + '〜' + hm(end) + '</span></dd>' +
        '<dt>Zoom</dt><dd>' + zoom + '</dd></dl>' + acts +
    '</div>';
  }
  function msgHtml(list, i, first) {
    var m = list[i], mine = m.from === 'me', p = mine ? null : R.person(m.from);
    var name = mine ? 'あなた' : p.name;
    var card = m.card && m.card.type === 'meeting';
    var auto = m.auto ? (i > 0 && list[i - 1].from === 'me' ? '自動返信・' : '自動送信・') : '';
    return '<div class="msg ' + (mine ? 'msg-me' : 'msg-them') + (first ? ' is-first' : '') + '">' +
      (mine ? '' : (first ? U.avatar(p, 's') : '<span class="msg__gap" aria-hidden="true"></span>')) +
      '<div class="msg__col">' +
        // 名前は続けて届いた2通目からは見た目だけ省く（読み上げでは毎回、誰の発言か分かるように）
        '<span class="' + (!mine && first ? 'msg__name' : 'sr-only') + '">' + esc(name) + '</span>' +
        (card ? meetCard(m.card) : m.text ? '<div class="msg__bubble">' + bodyHtml(m.text) + '</div>' : '') +
        (m.attachments && m.attachments.length ? attsHtml(m.attachments, i) : '') +
        (m.ref ? refLink(m.ref) : '') +
        '<span class="msg__meta">' + auto + (mine && m.kind ? esc(m.kind) + '・' : '') +
          '<time datetime="' + esc(m.at) + '">' + U.fmtShort(m.at, true) + '</time></span>' +
      '</div>' +
    '</div>';
  }
  /** from 番目から後ろを HTML に。日付が変わるところに日付、前に読んだところに「ここから新着」 */
  function itemsHtml(list, from, firstUnread) {
    var html = '', lastDay = from ? view.lastDay : '', lastFrom = from ? view.lastFrom : '';
    for (var i = from; i < list.length; i++) {
      var m = list[i], day = new Date(m.at).toDateString();
      if (day !== lastDay) {
        html += '<div class="msg-day"><span>' + esc(dayLabel(m.at)) + '</span></div>';
        lastDay = day; lastFrom = '';
      }
      // 前に読んだ分がある時だけ「ここから新着」を出す（最初の1通だけのときは出さない）
      if (i === firstUnread && i > 0) { html += '<div class="msg-new"><span>ここから新着</span></div>'; lastFrom = ''; }
      html += msgHtml(list, i, m.from !== lastFrom);
      lastFrom = m.from;
    }
    view.lastDay = lastDay; view.lastFrom = lastFrom;
    return html;
  }
  function typingHtml() {
    var s = R.person(STAFF_ID);
    return '<div class="msg msg-them msg-typing is-first" id="msgTyping" aria-hidden="true"' + (view.waiting ? '' : ' hidden') + '>' + U.avatar(s, 's') +
      '<div class="msg__col"><div class="msg__bubble"><span class="msg-dots"><i></i><i></i><i></i></span>' +
      '<span class="msg-typing__txt">' + esc(String(s.name || '運営').split(/\s+/)[0] + 'さんが入力中') + '</span></div></div></div>';
  }

  /** やりとりの上の帯：返信する運営の人と、面談の予約（860px 以下は返信の目安をここに出し、面談は記号だけのボタン） */
  function head() {
    var s = R.person(STAFF_ID);
    return '<div class="msg-head">' + U.avatar(s, 's') +
      '<p class="msg-head__who"><b>' + esc(s.name) + '</b><span class="msg-head__role">' + esc(s.role || '運営') + '</span>' +
        '<span class="msg-head__sla">' + esc(DATA.SITE.replySla) + '</span></p>' +
      '<button type="button" class="btn btn-ghost btn-s msg-head__meet" data-msg-meet="1">' + icon('calendar', 'ico-s') +
        '<span class="msg-head__meettxt">' + meetLabel() + '</span></button>' +
    '</div>';
  }
  /** 帯の面談のボタンの名前。予約があるときは、押すと「日時を変える」候補が開くので、その名前にする */
  function meetLabel() { return activeMeeting() ? '面談の日時を変える' : '15分の面談を予約'; }
  function syncHead(el) {
    var t = el && el.querySelector('.msg-head__meettxt'), v = meetLabel();
    if (t && t.textContent !== v) t.textContent = v;
  }

  /* ---------- 書く欄 ---------- */
  /** いまの予約（まだ先で、取り消していないもの）か null */
  function activeMeeting() {
    var mt = R.meeting();
    return mt && mt.status !== 'canceled' && new Date(mt.at) > now() ? mt : null;
  }
  function sameTime(a, b) { return !!a && !!b && new Date(a).getTime() === new Date(b).getTime(); }
  /** 候補の並びと、いまの予約（見出しの「いまは◯日」）。変わったら候補を描き直す印 */
  function slotsSig(slots) {
    var mt = activeMeeting();
    return slots.map(function (s) { return s.id; }).join(',') + '|' + (mt ? mt.id + '@' + mt.at : '');
  }
  function slotsHtml() {
    var active = activeMeeting(), slots = R.meetingSlots() || [];
    // 日時を変えるときは、いまの予約と同じ日時は選べない（選んでも同じ予約を取り直すだけになる）
    var isNow = function (s) { return !!active && sameTime(s.at, active.at); };
    if (view.slot && !slots.some(function (s) { return s.id === view.slot && !isNow(s); })) view.slot = null;
    var legend = '<legend class="msg-compose__lbl">' +
      esc(active ? '面談の日時を変える（いまは' + active.when + '）' : '面談の日時を選ぶ（15分・Zoom）') + '</legend>';
    // 運営の枠がすべて埋まっているなど、選べる日時がないとき
    if (!slots.length) {
      return '<fieldset class="msg-slots" data-sig="' + esc(slotsSig(slots)) + '">' + legend +
        '<p class="msg-slots__none">いま選べる日時がありません。都合のよい曜日と時間帯を書いて送ってください。</p></fieldset>';
    }
    // 860px 以下は候補の列だけを横に送り、ボタンはその下に置く（列の外に送られて見えなくならないように）
    return '<fieldset class="msg-slots" data-sig="' + esc(slotsSig(slots)) + '">' + legend +
      '<div class="msg-slots__body"><div class="msg-slots__row">' + slots.map(function (s) {
        var cur = isNow(s);
        return '<label class="msg-slot' + (cur ? ' is-now' : '') + '"><input type="radio" name="msgSlot" value="' + esc(s.id) + '"' +
          (cur ? ' disabled' : view.slot === s.id ? ' checked' : '') + '>' +
          '<span class="num">' + esc(s.label) + (cur ? '（いま）' : '') + '</span></label>';
      }).join('') + '</div>' +
      '<button type="button" class="btn btn-ink btn-s msg-slots__go" data-msg-book="1"' + (view.slot ? '' : ' disabled') + '>' +
        (active ? 'この日時に変える' : 'この日時で予約する') + '</button></div></fieldset>';
  }
  /** 候補を開いているあいだに、運営が枠を変えた・予約が確定した：候補だけを差し替える。
      書く欄・添付・どの回の質問かの札には触らない。候補の中に焦点があれば、同じ日時（なければ最初の候補）へ戻す */
  function refreshSlots(el) {
    var fs = el && view.kind === MEET && !view.busy ? el.querySelector('.msg-slots') : null;
    if (!fs) return;
    var slots = R.meetingSlots() || [], was = fs.getAttribute('data-sig') || '', sig = slotsSig(slots);
    if (was === sig) return;
    var a = document.activeElement, inside = !!(a && fs.contains(a));
    var val = inside && a.name === 'msgSlot' ? a.value : null, onGo = inside && a.hasAttribute('data-msg-book');
    var box = document.createElement('div');
    box.innerHTML = slotsHtml();
    fs.parentNode.replaceChild(box.firstChild, fs);
    if (inside) {
      var nf = el.querySelector('.msg-slots');
      var t = (val && nf.querySelector('input[value="' + String(val).replace(/["\\]/g, '') + '"]')) ||
        (onGo && !nf.querySelector('[data-msg-book]').disabled && nf.querySelector('[data-msg-book]')) ||
        nf.querySelector('input:checked') || nf.querySelector('input:not(:disabled)') || el.querySelector('#msgText');
      if (t) { try { t.focus({ preventScroll: true }); } catch (e) { t.focus(); } }
    }
    // 読み上げは候補の日時が変わったときだけ（見出しの「いまは◯日」だけが変わったときは言わない）
    if (was.split('|')[0] !== sig.split('|')[0]) CLG.app.announce(slots.length ? '面談の候補の日時が変わりました' : 'いま選べる面談の日時がありません');
  }
  function refChip() {
    var L = refInfo(view.ref);
    if (!L) return '';
    return '<div class="msg-refchip">' + icon(L.icon, 'ico-s') + '<span>' + esc(L.chip) + '</span>' +
      '<button type="button" class="msg-refchip__x" data-msg-unref="1" aria-label="' + esc(L.label + 'の質問として送るのをやめる') + '">' + icon('close', 'ico-s') + '</button></div>';
  }
  function attPreview() {
    if (!view.atts.length) return '';
    return '<ul class="msg-pre" aria-label="添付するファイル">' + view.atts.map(function (a, i) {
      return '<li class="msg-pre__item">' +
        (a.type === 'image' && a.url ? '<img src="' + esc(a.url) + '" alt="">' : '<span class="msg-pre__kind">' + (a.type === 'pdf' ? 'PDF' : '画像') + '</span>') +
        '<span class="msg-pre__txt"><span class="msg-pre__name">' + esc(a.name) + '</span><span class="msg-pre__size num">' + size(a.size) + '</span></span>' +
        '<button type="button" class="msg-pre__x" data-msg-unatt="' + i + '" aria-label="' + esc(a.name + 'を外す') + '">' + icon('close', 'ico-s') + '</button></li>';
    }).join('') + '</ul>';
  }
  function extraHtml() { return (view.kind === MEET ? slotsHtml() : '') + refChip() + attPreview(); }
  function canSend() { return !!(String(view.draft || '').trim() || view.atts.length); }
  function composer() {
    var k = view.kind;
    return '<div class="msg-compose">' +
      '<div class="msg-kinds-row"><span class="msg-compose__lbl" id="msgKindLbl">種類</span>' +
        '<div class="chips msg-kinds" role="group" aria-labelledby="msgKindLbl">' + kinds().map(function (x) {
          var on = x === k;
          return '<button type="button" class="chip' + (on ? ' is-on' : '') + '" aria-pressed="' + on + '" data-msg-kind="' + esc(x) + '">' + esc(x) + '</button>';
        }).join('') + '</div></div>' +
      '<div class="msg-extra" id="msgExtra">' + extraHtml() + '</div>' +
      '<label class="sr-only" for="msgText">メッセージ</label>' +
      '<textarea class="textarea msg-ta" id="msgText" rows="3" maxlength="2000" placeholder="' + esc(PH[k] || '') + '">' + esc(view.draft) + '</textarea>' +
      '<div class="msg-compose__foot">' +
        '<button type="button" class="iconbtn msg-attach" data-msg-attach="1" aria-label="画像かPDFを添付（4つまで）">' + icon('upload') + '</button>' +
        '<input type="file" id="msgFile" class="msg-file" accept="image/*,application/pdf,.pdf" multiple tabindex="-1" aria-hidden="true">' +
        '<button type="button" class="btn btn-text btn-s msg-tpl-btn" data-pop="msgTplMenu" aria-expanded="false" aria-controls="msgTplMenu">定型文' + icon('chevdown', 'ico-s') + '</button>' +
        '<div class="pop msg-tpl-pop" id="msgTplMenu" hidden>' +
          TEMPLATES.map(function (t, i) { return '<button type="button" class="pop__item" data-msg-tpl="' + i + '">' + esc(t.label) + '</button>'; }).join('') +
          '<hr class="pop__sep"><a class="pop__item" href="#/perks?tab=experts&amp;focus=ex1">税理士に聞きたい（専門家に相談）</a>' +
        '</div>' +
        '<span class="spacer"></span>' +
        '<button type="button" class="btn btn-primary msg-send" data-msg-send="1" aria-keyshortcuts="Control+Enter Meta+Enter"' + (canSend() ? '' : ' disabled') + '>送る</button>' +
      '</div>' +
    '</div>';
  }

  /* ---------- 書く欄の操作（描き直さずに DOM だけ変える。入力中の文字と変換を守るため） ---------- */
  function $el() { return document.querySelector('.scr-messages'); }
  function syncSend(el) {
    var b = el && el.querySelector('[data-msg-send]');
    if (b) b.disabled = !canSend();
  }
  function updateExtra(el) {
    var x = el && el.querySelector('#msgExtra');
    if (x) x.innerHTML = extraHtml();
    syncSend(el);
  }
  /** 書いた分だけ高くする（下限は CSS の min-height、上限はここ） */
  function autosize(ta) {
    if (!ta) return;
    ta.style.height = '0px';
    var max = window.innerWidth <= 860 ? 140 : 220;
    ta.style.height = Math.min(max, ta.scrollHeight + 2) + 'px';
  }
  function placeCaret(ta, pos, scroll) {
    try { ta.focus({ preventScroll: !scroll }); } catch (e) { ta.focus(); }
    if (pos == null || pos > ta.value.length) pos = ta.value.length;
    try { ta.setSelectionRange(pos, pos); } catch (e) {}
  }
  /** 860px 以下は種類が横に流れる。選んでいる種類（帯のボタン・リンクで「面談の予約」になったときなど）が
      端に隠れていたら、見える位置まで送る（右端の 24px は薄くぼかしてあるので、その内側まで） */
  function showKind(el) {
    var strip = el && el.querySelector('.msg-kinds'), on = strip && strip.querySelector('.is-on');
    if (!on || strip.scrollWidth <= strip.clientWidth + 1 || !on.getBoundingClientRect) return;
    var s = strip.getBoundingClientRect(), r = on.getBoundingClientRect(), dx = 0;
    if (r.left < s.left + 12) dx = r.left - s.left - 12;
    else if (r.right > s.right - 28) dx = r.right - s.right + 28;
    if (dx) strip.scrollLeft += dx;
  }
  function setKind(el, k, focusSlot) {
    if (!validKind(k)) return;
    var was = view.kind;
    view.kind = k;
    U.$$('[data-msg-kind]', el).forEach(function (b) {
      var on = b.getAttribute('data-msg-kind') === k;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    showKind(el);
    var ta = el.querySelector('#msgText');
    if (ta) ta.placeholder = PH[k] || '';
    if (was !== k || focusSlot) updateExtra(el);
    if (focusSlot) {
      var r = el.querySelector('.msg-slots input:checked') || el.querySelector('.msg-slots input:not(:disabled)');
      if (r) { try { r.focus({ preventScroll: true }); } catch (e) { r.focus(); } }
    }
  }
  function setText(el, text, caret) {
    var ta = el.querySelector('#msgText');
    if (!ta) return;
    ta.value = text;
    view.draft = text;
    autosize(ta);
    syncSend(el);
    if (caret != null) placeCaret(ta, caret, false);
  }
  function useTemplate(el, t) {
    var ta = el.querySelector('#msgText');
    if (!ta) return;
    if (validKind(t.kind)) setKind(el, t.kind);
    var curText = ta.value, prefix = untouched(curText) ? '' : curText.replace(/\s+$/, '') + '\n\n';
    // 「」の中、なければ最初の「行末の：」のあとにカーソルを置く（すぐ書き始められるように）
    var at = t.text.indexOf('」');
    if (at < 0) at = t.text.indexOf('：\n') + 1;
    if (at <= 0) at = t.text.length;
    setText(el, prefix + t.text, prefix.length + at);
  }

  /* 添付：画像は長い辺を1280pxまで縮めてから持つ（保存の容量を超えないように）。PDF は小さいものだけ中身を持つ */
  function readUrl(f, cb) {
    try { var r = new FileReader(); r.onload = function () { cb(String(r.result || '')); }; r.onerror = function () { cb(''); }; r.readAsDataURL(f); }
    catch (e) { cb(''); }
  }
  function shrink(f, cb) {
    readUrl(f, function (src) {
      if (!src) { cb(''); return; }
      var img = new Image();
      img.onload = function () {
        try {
          var k = Math.min(1, 1280 / Math.max(img.width, img.height)), c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          var out = c.toDataURL('image/jpeg', 0.8);
          if (out.length > 390000) out = c.toDataURL('image/jpeg', 0.6);
          cb(out.length > 390000 ? '' : out);
        } catch (e) { cb(''); }
      };
      img.onerror = function () { cb(''); };
      img.src = src;
    });
  }
  function addFiles(el, files) {
    var list = Array.prototype.slice.call(files || []), room = MAX_ATT - view.atts.length;
    if (!list.length) return;
    if (room <= 0) { U.toast('添付は4つまでです', 'error'); return; }
    if (list.length > room) { U.toast('添付は4つまでです。はじめの' + room + 'つを付けました'); list = list.slice(0, room); }
    list.forEach(function (f) {
      var isImg = /^image\//.test(f.type || ''), isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '');
      if (!isImg && !isPdf) { U.toast('「' + f.name + '」は付けられません（画像かPDFだけです）', 'error'); return; }
      if (f.size > 10 * 1048576) { U.toast('「' + f.name + '」は10MBを超えています', 'error'); return; }
      var a = { name: f.name || (isImg ? '画像' : '資料.pdf'), type: isImg ? 'image' : 'pdf', size: f.size || 0, url: '' };
      view.atts.push(a);
      var done = function (url) { a.url = url || ''; if ($el() === el) updateExtra(el); };
      if (isImg) shrink(f, done); else if (f.size <= 280 * 1024) readUrl(f, done); else done('');
    });
    updateExtra(el);
  }

  /* ---------- やりとりに足す（描き直さない） ---------- */
  function toBottom(smooth) {
    var sc = document.getElementById('msgScroll');
    if (!sc) return;
    try { sc.scrollTo({ top: sc.scrollHeight, behavior: smooth && !reduced() ? 'smooth' : 'auto' }); } catch (e) { sc.scrollTop = sc.scrollHeight; }
  }
  function setTyping(on) {
    var t = document.getElementById('msgTyping');
    if (!t) return;
    t.hidden = !on;
    if (on) toBottom(true);
  }
  /** 予約の札の状態が変わったら（確認中 → 予約確定・取り消し）、その札だけ差し替える */
  function updateCards(log) {
    var list = R.thread();
    U.$$('[data-msg-card]', log).forEach(function (node) {
      var id = node.getAttribute('data-msg-card'), c = R.meeting(id);
      if (!c || c.status === node.getAttribute('data-st')) return;
      var m = list.filter(function (x) { return x.card && x.card.id === id; })[0];
      if (m) node.outerHTML = meetCard(m.card);
    });
  }
  /** 保存が変わるたびに呼ぶ。新しいメッセージを末尾に足し、運営からのものが来たら既読にする */
  function sync() {
    var log = document.getElementById('msgLog');
    if (!log || !onScreen() || R.me().id !== view.owner) return;
    refreshSlots($el());                           // R.setMeetingSlots・予約の変更で候補が変わったとき
    syncHead($el());                               // 予約した・取り消した：帯のボタンの名前
    var list = R.thread();
    if (list.length < view.rendered) return;       // 減った（デモを戻したなど）は、骨組みの描き直しに任せる
    var staffNew = false, mineNew = false;
    if (list.length > view.rendered) {
      var sc = document.getElementById('msgScroll');
      // 上のほうを読み返しているときは、届いても勝手に下へ送らない（自分が送ったときは送る）
      var near = !sc || sc.scrollHeight - sc.scrollTop - sc.clientHeight < 160;
      var empty = log.querySelector('.empty');
      if (empty) empty.parentNode.removeChild(empty);
      for (var i = view.rendered; i < list.length; i++) { if (list[i].from === 'me') mineNew = true; else staffNew = true; }
      log.insertAdjacentHTML('beforeend', itemsHtml(list, view.rendered, -1));
      view.rendered = list.length;
      if (near || mineNew) toBottom(true);
    }
    updateCards(log);
    if (staffNew && R.unread() > 0 && document.visibilityState !== 'hidden') R.markRead();
  }
  if (CLG.store && CLG.store.on) CLG.store.on(function () { sync(); });
  // 運営画面の保存（面談の枠）が別のタブで変わったとき。書いている途中は骨組みが描き直さないので、候補だけ差し替える
  if (window.addEventListener) {
    window.addEventListener('storage', function (e) {
      if (!e || e.key !== 'terakoya-admin-v1') return;
      setTimeout(function () { var el = $el(); if (el && onScreen() && R.me().id === view.owner) refreshSlots(el); }, 0);
    });
  }

  /* ---------- 送る・面談を予約する ---------- */
  function send(el) {
    var ta = el.querySelector('#msgText');
    if (!ta) return;
    var text = ta.value.trim();
    if (!text && !view.atts.length) { U.toast('メッセージを入力してください'); placeCaret(ta, null, false); return; }
    var kind = view.kind, atts = view.atts.map(function (a) { return { name: a.name, type: a.type, size: a.size, url: a.url }; }), ref = view.ref;
    view.draft = ''; view.atts = []; view.ref = null;
    ta.value = ''; autosize(ta);
    // 面談の予約は1回送れば足りる。続けて書く文に、また面談の返事が届かないよう種類を戻す
    if (kind === MEET) setKind(el, kinds()[0] || kind); else updateExtra(el);
    syncSend(el);
    // 送ったあとも書く欄に焦点を残す（続けて書けるように）
    placeCaret(ta, 0, false);
    view.waiting++;
    setTyping(true);
    var p = R.sendMessage(text, kind, atts, ref);   // 保存が変わる → sync が自分のメッセージを足す
    var done = function () { view.waiting = Math.max(0, view.waiting - 1); setTyping(view.waiting > 0); };
    p.then(function (res) {
      // 1通目（自動返信）は sync が足す。担当の返事が届くまで「入力中」を出したまま
      if (res && res.next) res.next.then(done, done); else done();
    }, done);
  }
  function book(el) {
    if (!view.slot) return;
    var slot = R.meetingSlots().filter(function (s) { return s.id === view.slot; })[0];
    // 予約で保存が変わると sync が候補を描き直そうとする。すぐ下で候補を閉じるので、そのあいだは止める
    view.busy = true;
    var r = null;
    try { r = slot ? R.bookMeeting(slot) : null; } finally { view.busy = false; }
    if (!r) { U.toast('この日時は選べません。別の日時を選んでください', 'error'); view.slot = null; updateExtra(el); return; }
    view.slot = null;
    setKind(el, kinds()[0] || MEET);
    U.toast('面談を申し込みました。運営が確認します', 'ok');
    var ta = el.querySelector('#msgText');
    if (ta) placeCaret(ta, null, false);
    // スタートガイドの「面談」が済みになるのは、運営が確定したときだけ
    r.confirmed.then(function (res) { if (res) CLG.app.reward(res); });
  }
  function cancelMeet(el, id) {
    var c = R.meeting(id);
    if (!c) return;
    U.confirmBox('面談を取り消しますか', c.when + 'の面談を取り消します。', '取り消す', true).then(function (ok) {
      if (!ok) return;
      view.busy = true;
      try { R.cancelMeeting(id); } finally { view.busy = false; }
      U.toast('面談を取り消しました');
      // 「変更」から候補を開いていたら閉じる（「いまは◯日」の見出しが古いまま残らないように）
      if (view.kind === MEET) setKind(el, kinds()[0] || MEET);
      var ta = el.querySelector('#msgText');
      if (ta) placeCaret(ta, null, false);
    });
  }
  function viewImage(key) {
    var p = String(key).split('-'), m = R.thread()[+p[0]], a = m && m.attachments && m.attachments[+p[1]];
    if (!a || !a.url) return;
    U.modal('<img class="msg-view__img" src="' + esc(a.url) + '" alt="' + esc(a.name) + '">', { title: a.name, cls: 'scr-messages msg-view', wide: true, foot: true });
  }

  /* ---------- 高さ：パソコンは面を画面の高さに、860px 以下は画面いっぱい ---------- */
  /** ページの上端からの位置。画面の入りの動き（#view を 6px 下から上げる transform）に左右されないよう、
      getBoundingClientRect ではなく offsetTop を足していく */
  function docTop(n) { var y = 0; while (n) { y += n.offsetTop || 0; n = n.offsetParent; } return y; }
  function fit(el) {
    var v = document.getElementById('view'), box = el && el.querySelector('.msg-box');
    if (!v || !box || !window.getComputedStyle) return;
    var cs = getComputedStyle(v);
    el.style.setProperty('--mv-pt', cs.paddingTop);
    el.style.setProperty('--mv-pr', cs.paddingRight);
    el.style.setProperty('--mv-pb', cs.paddingBottom);
    el.style.setProperty('--mv-pl', cs.paddingLeft);
    // 860px 以下は本文の余白を打ち消してから測る（先に --mv-* を入れておかないと余白の分ずれる）
    el.style.setProperty('--msg-top', Math.round(docTop(box)) + 'px');
  }
  if (window.addEventListener) {
    window.addEventListener('resize', function () {
      var el = $el();
      if (!el || !onScreen()) return;
      fit(el);
      autosize(el.querySelector('#msgText'));
      toastSpace(el);
    });
    // パソコンで画面が低いと、ページが少しスクロールして書く欄が下に貼り付く。そのときも知らせを書く欄の上に
    window.addEventListener('scroll', function () { var el = $el(); if (el && onScreen()) toastSpace(el); }, { passive: true });
  }
  /** 一言の知らせ（#toast）は書く欄のすぐ上に出す（「送る」・種類・面談の候補に重ねない）。
      書く欄は候補・添付・文の長さで高さが変わるので、上端を測って --msg-toast-b に入れる（messages.css が使う） */
  function toastSpace(el) {
    var c = el && el.querySelector('.msg-compose');
    if (!c || !c.getBoundingClientRect) return;
    var top = c.getBoundingClientRect().top, h = window.innerHeight || document.documentElement.clientHeight;
    if (!(top > 0) || top >= h) return;
    document.documentElement.style.setProperty('--msg-toast-b', Math.round(h - top + 8) + 'px');
  }
  /** やりとりの枠の高さが変わっても（書く欄が伸びる・面談の候補が開く・キーボードで画面が縮む）、
      いちばん下を見ていたなら、いちばん下を見たままにする */
  function pin(el) {
    var sc = el.querySelector('#msgScroll');
    if (view.ro) { try { view.ro.disconnect(); } catch (e) {} view.ro = null; }
    if (!sc) return;
    var near = function () { return sc.scrollHeight - sc.scrollTop - sc.clientHeight < 48; };
    view.atBottom = near();
    view.top = sc.scrollTop;
    sc.addEventListener('scroll', function () { view.atBottom = near(); view.top = sc.scrollTop; }, { passive: true });
    if (window.ResizeObserver) {
      view.ro = new ResizeObserver(function () {
        if (view.atBottom && sc.isConnected) sc.scrollTop = sc.scrollHeight;
        if (el.isConnected) toastSpace(el);
      });
      view.ro.observe(sc);
      var c = el.querySelector('.msg-compose');
      if (c) view.ro.observe(c);
    }
    toastSpace(el);
  }

  function bind(el) {
    var ta = el.querySelector('#msgText'), file = el.querySelector('#msgFile');
    el.addEventListener('click', function (ev) {
      var t = ev.target, b;
      if ((b = t.closest('[data-msg-kind]'))) { setKind(el, b.getAttribute('data-msg-kind'), b.getAttribute('data-msg-kind') === MEET); return; }
      if ((b = t.closest('[data-msg-tpl]'))) { var tp = TEMPLATES[+b.getAttribute('data-msg-tpl')]; if (tp) useTemplate(el, tp); return; }
      if ((b = t.closest('[data-msg-send]'))) { send(el); return; }
      if ((b = t.closest('[data-msg-meet]'))) { setKind(el, MEET, true); return; }
      if ((b = t.closest('[data-msg-book]'))) { book(el); return; }
      if ((b = t.closest('[data-msg-mt-change]'))) { setKind(el, MEET, true); return; }
      if ((b = t.closest('[data-msg-mt-cancel]'))) { cancelMeet(el, b.getAttribute('data-msg-mt-cancel')); return; }
      if ((b = t.closest('[data-msg-attach]'))) { if (file) file.click(); return; }
      if ((b = t.closest('[data-msg-unatt]'))) {
        var i = +b.getAttribute('data-msg-unatt');
        view.atts.splice(i, 1);
        updateExtra(el);
        var next = el.querySelector('[data-msg-unatt="' + Math.min(i, view.atts.length - 1) + '"]') || el.querySelector('[data-msg-attach]');
        if (next) next.focus();
        return;
      }
      if ((b = t.closest('[data-msg-unref]'))) { view.ref = null; updateExtra(el); if (ta) placeCaret(ta, null, false); return; }
      if ((b = t.closest('[data-msg-img]'))) { viewImage(b.getAttribute('data-msg-img')); return; }
      if ((b = t.closest('[data-msg-link]')) && b.getAttribute('href') === DATA.SITE.zoomPlaceholder) {
        ev.preventDefault();
        U.toast('本番では、面談のZoomミーティングが開きます');
      }
    });
    el.addEventListener('change', function (ev) {
      var t = ev.target;
      if (t.name === 'msgSlot') {
        view.slot = t.value;
        var go = el.querySelector('[data-msg-book]');
        if (go) go.disabled = false;
      } else if (t === file) {
        addFiles(el, file.files);
        file.value = '';
      }
    });
    if (ta) {
      autosize(ta);
      ta.addEventListener('input', function () { view.draft = ta.value; autosize(ta); syncSend(el); });
      ta.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey) && !ev.isComposing) { ev.preventDefault(); send(el); }
      });
      // 画像を貼り付けたら添付にする
      ta.addEventListener('paste', function (ev) {
        var fs = ev.clipboardData && ev.clipboardData.files;
        if (fs && fs.length) { ev.preventDefault(); addFiles(el, fs); }
      });
    }
  }

  CLG.screens.messages = {
    title: '相談・メッセージ',
    layout: 'full',
    back: function () { return null; },
    render: function (ctx) {
      // 「入会したての状態で見る」などで会員が替わったら、前の人の書きかけを持ち越さない
      var owner = R.me().id;
      if (view.owner !== owner) {
        view.owner = owner; view.kind = kinds()[0] || ''; view.draft = ''; view.atts = []; view.ref = null; view.slot = null;
        view.waiting = 0; view.qk = null; view.atBottom = true; view.top = null;
      }
      var q = ctx.query || {}, qk = (q.kind || '') + '|' + (q.ref || '');
      if (qk !== view.qk) {
        view.qk = qk;
        var L = q.ref ? refInfo(q.ref) : null;
        // kind がなくても、講座の回・録画の ref なら「講座の質問」
        var k = validKind(q.kind) ? q.kind : (L && L.kind) || null;
        // 案件の話（ref=gig:）で種類の指定がないときは、前の「講座の質問」のままにしない
        if (!k && L && view.kind === LESSON_Q) k = kinds()[0] || null;
        if (k || q.ref) {
          if (k) view.kind = k;
          view.fromQuery = true;
          view.caretTo = null;
          var fresh = untouched(view.draft);
          if (L) {
            // 別の回・録画から来た：札はその回に替える。書き出しは、自分で書いた文でなければ入れ替える
            view.ref = L.ref;
            if (fresh && L.text) {
              view.draft = L.text;
              view.caretTo = view.draft.indexOf('分からなかったところ：') + '分からなかったところ：'.length;
            } else if (fresh && LESSON_TEXT.test(view.draft.trim())) view.draft = '';
          } else if (fresh) {
            // 別の種類で来た・知らない回（消えた録画など）：前の回の札と、こちらが入れたその回の書き出しを持ち越さない
            view.ref = null;
            if (LESSON_TEXT.test(view.draft.trim())) view.draft = '';
          }
          view.focusSlot = k === MEET;
        }
      }
      if (!validKind(view.kind)) view.kind = kinds()[0] || '';

      var s = R.person(STAFF_ID), list = R.thread(), st = ctx.state;
      var since = st.threadRead ? new Date(st.threadRead) : null, firstUnread = -1;
      list.forEach(function (m, i) { if (firstUnread < 0 && m.from !== 'me' && (!since || new Date(m.at) > since)) firstUnread = i; });
      var items = list.length ? itemsHtml(list, 0, firstUnread) : U.empty('message', 'まだメッセージはありません。');
      view.rendered = list.length;

      return '<div class="scr-messages">' +
        '<div class="page-head"><h1 class="page-ttl" data-page-title tabindex="-1">相談・メッセージ</h1>' +
          '<p class="page-lead">回数の制限はありません。' + esc(DATA.SITE.replySla) + '。税理士・司法書士に聞きたいことは<a href="#/perks?tab=experts">専門家に相談</a>から。</p></div>' +
        '<section class="card msg-box" aria-label="運営とのメッセージ">' +
          head() +
          '<div class="msg-scroll" id="msgScroll" role="log" aria-label="' + esc(s.name + 'さんとのメッセージ') + '" tabindex="0">' +
            '<div class="msg-log" id="msgLog">' + items + '</div>' + typingHtml() +
          '</div>' +
          composer() +
        '</section>' +
      '</div>';
    },
    mount: function (root, ctx) {
      var el = root.querySelector('.scr-messages');
      if (!el) return;
      fit(el);
      var sc = el.querySelector('#msgScroll'), ta = el.querySelector('#msgText');
      // 同じ会員のまま URL が変わらずに描き直された（別のタブの変更など）：上を読み返していたなら、その位置のまま
      var again = !view.enter && view.mountedFor === R.me().id;
      var keepTop = again && !view.atBottom && view.top != null ? view.top : null;
      view.enter = false; view.mountedFor = R.me().id;
      if (sc && keepTop != null) sc.scrollTop = keepTop;
      else if (sc) {
        sc.scrollTop = sc.scrollHeight;
        // 未読が長いときは、いちばん下ではなく「ここから新着」が上に見える位置で止める
        var nw = sc.querySelector('.msg-new');
        if (nw) {
          var top = nw.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 8;
          if (top < sc.scrollTop) sc.scrollTop = top;
        }
      }
      pin(el);
      // 文字（Webフォント）が読み込み終わると見出しの行数が変わることがあるので、測り直す
      try { if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if ($el() === el) fit(el); }); } catch (e) {}
      if (R.unread() > 0) R.markRead();
      bind(el);
      showKind(el);

      // ?kind= は1回使ったら URL から外す。次にまた同じリンクで来たときも書き出しが入るように
      if (view.fromQuery) {
        view.fromQuery = false;
        view.qk = '|';
        try { history.replaceState(null, '', '#/messages'); } catch (e) {}
        if (view.focusSlot) {
          view.focusSlot = false;
          var r = el.querySelector('.msg-slots input:not(:disabled)');
          if (r) { try { r.focus({ preventScroll: true }); } catch (e) { r.focus(); } }
        } else if (ta) {
          placeCaret(ta, view.caretTo, false);
          view.caretTo = null;
        }
      }
    }
  };
})();
