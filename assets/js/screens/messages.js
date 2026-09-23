/* ============================================================
   相談・メッセージ（#/messages）
   ------------------------------------------------------------
   運営と会員の1対1だけ（会員どうしのDMは作らない。調査メモ参照）。
   送信は R.sendMessage。試作版は数秒後に運営の自動返信が届く。
   #/messages?kind=面談の予約 で来たら、種類を選んで書き出しを入れておく。
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon;

  var STAFF_ID = 'staff2';
  var MEET = '面談の予約';
  var MEET_TEXT = '15分の面談をお願いしたいです。\n都合のよい時間帯：';

  var HINT = {
    '質問': '講座・案件・会員ページの使い方など、何でもどうぞ。',
    '壁打ち・相談': '考えがまとまっていなくても大丈夫です。箇条書きでどうぞ。',
    '面談の予約': '15分のオンライン面談です。都合のよい時間帯を書いてください。候補の日時をお送りします。',
    'その他': 'ご意見や、会員ページの不具合の報告もこちらへどうぞ。'
  };
  var PH = {
    '質問': '例：「SNS発信入門」の第3回で、プロフィール文の書き方がよく分かりませんでした。',
    '壁打ち・相談': '例：在宅でできる副業を探しています。平日の夜に1時間くらい使えます。',
    '面談の予約': '例：15分の面談をお願いしたいです。平日の21時以降だと助かります。',
    'その他': '例：講座の動画が途中で止まることがあります。'
  };
  var TEMPLATES = [
    { label: '講座について質問', kind: '質問', text: '講座「」について質問です。\n分からなかったところ：\n試したこと：' },
    { label: '副業の方向性を相談したい', kind: '壁打ち・相談', text: '副業の方向性を相談させてください。\nいまの状況：\nやってみたいこと：\n使える時間（1週間に）：' },
    { label: '税理士に相談したい', kind: '質問', text: '税理士さんに相談したいことがあります。\n内容（例：確定申告・開業届・経費のこと）：\n急ぎかどうか：' }
  ];

  // 画面の中だけの状態。書きかけ（draft）は描き直しても消えないようにここで持つ
  var view = { kind: DATA.MESSAGE_KINDS[0] || '質問', draft: '', qk: null, pending: 0, focus: false, caret: null, fromQuery: false, owner: null };

  /* ---------- 小さな道具 ---------- */
  function kinds() { return DATA.MESSAGE_KINDS || []; }
  function validKind(k) { return kinds().indexOf(k) >= 0; }
  /** 空か、こちらが入れた書き出しのままなら「上書きしてよい」 */
  function untouched(text) {
    text = String(text || '').trim();
    if (!text || text === MEET_TEXT.trim()) return true;
    return TEMPLATES.some(function (t) { return t.text.trim() === text; });
  }
  function dayDiff(d) {
    var a = new Date(d); a.setHours(0, 0, 0, 0);
    var n = CLG.now(); n.setHours(0, 0, 0, 0);
    return Math.round((a - n) / 86400000);
  }
  function dayLabel(d) {
    var n = dayDiff(d);
    if (n === 0) return '今日';
    if (n === -1) return '昨日';
    return U.fmtDate(d, { noYear: new Date(d).getFullYear() === CLG.now().getFullYear() });
  }
  function onScreen() { return /^#\/?messages(?:[/?]|$)/.test(location.hash); }
  /** 「佐藤 圭」→「佐藤さん」。会員から見た呼び方にそろえる */
  function callName(p) { return String((p && p.name) || '運営').split(/\s+/)[0] + 'さん'; }

  /* ---------- やりとり ---------- */
  function threadInner() {
    var list = R.thread(), st = CLG.store.state;
    var since = st.threadRead ? new Date(st.threadRead) : null;
    var firstUnread = -1;
    list.forEach(function (m, i) {
      if (firstUnread < 0 && m.from !== 'me' && (!since || new Date(m.at) > since)) firstUnread = i;
    });
    var html = '<p class="msg-private">' + icon('lock', 'ico-s') + '運営とあなただけのやりとりです。ほかの会員には見えません。</p>';
    if (!list.length && !view.pending) {
      return html + U.empty('message', 'まだメッセージはありません。分からないことを、最初のひとことでどうぞ。');
    }
    var lastDay = '', lastFrom = '';
    list.forEach(function (m, i) {
      var day = new Date(m.at).toDateString();
      if (day !== lastDay) {
        html += '<div class="msg-day"><span>' + esc(dayLabel(m.at)) + '</span></div>';
        lastDay = day; lastFrom = '';
      }
      // 前に読んだ分がある時だけ「ここから新着」を出す（最初の1通だけのときは出さない）
      if (i === firstUnread && i > 0) html += '<div class="msg-new"><span>ここから新着</span></div>';
      var mine = m.from === 'me';
      var p = mine ? null : R.person(m.from);
      var first = m.from !== lastFrom;
      lastFrom = m.from;
      html += '<div class="msg ' + (mine ? 'msg-me' : 'msg-them') + (first ? ' is-first' : '') + '">' +
        (mine ? '' : (first ? U.avatar(p, 's') : '<span class="msg__gap" aria-hidden="true"></span>')) +
        '<div class="msg__col">' +
          (!mine && first ? '<span class="msg__name">' + esc(p.name) + (p.role ? '<small>' + esc(p.role) + '</small>' : '') + '</span>' : '') +
          '<div class="msg__bubble">' + U.nl2br(m.text) + '</div>' +
          '<span class="msg__meta">' + (mine && m.kind ? '<span class="msg__kind">' + esc(m.kind) + '</span>' : '') +
            '<time datetime="' + esc(m.at) + '">' + U.fmtShort(m.at, true) + '</time></span>' +
        '</div>' +
      '</div>';
    });
    if (view.pending > 0) {
      var s = R.person(STAFF_ID);
      html += '<div class="msg msg-them msg-typing is-first">' + U.avatar(s, 's') +
        '<div class="msg__col"><div class="msg__bubble"><span class="msg-dots" aria-hidden="true"><i></i><i></i><i></i></span>' +
        '<span class="msg-typing__txt">' + esc(callName(s)) + 'が入力中…</span></div></div></div>';
    }
    return html;
  }

  function staffCard() {
    var s = DATA.PEOPLE[STAFF_ID] || R.person(STAFF_ID);
    return '<section class="card msg-staff" aria-label="相談の窓口">' +
      '<div class="msg-staff__main">' +
        U.avatar(s, 'l') +
        '<div class="msg-staff__body">' +
          '<p class="msg-staff__eyebrow">相談の窓口</p>' +
          '<p class="msg-staff__name">' + esc(s.name) + '<span class="msg-staff__role">' + esc(s.role || '運営') + '</span></p>' +
          '<p class="msg-staff__eta">' + icon('clock', 'ico-s') + '返信の目安：24時間以内（試作版は数秒で自動返信）</p>' +
        '</div>' +
        '<button type="button" class="btn btn-ghost btn-s msg-staff__meet" data-msg="meet">' + icon('calendar', 'ico-s') + '15分の面談を予約</button>' +
      '</div>' +
      '<a class="li has-ico msg-staff__experts" href="#/perks?tab=experts">' +
        '<span class="li__ico">' + icon('shield') + '</span>' +
        '<span class="li__body"><span class="li__ttl">専門家（税理士・司法書士など）に相談したいとき</span>' +
        '<span class="li__sub">提携の専門家をご紹介します。初回30分の相談は無料です</span></span>' + U.chevron() +
      '</a>' +
    '</section>';
  }

  function composer() {
    var k = view.kind;
    return '<section class="card card-pad msg-compose" aria-label="メッセージを書く">' +
      '<p class="msg-compose__lbl" id="msgKindLbl">種類</p>' +
      '<div class="chips msg-kinds" role="group" aria-labelledby="msgKindLbl">' + kinds().map(function (x) {
        var on = x === k;
        return '<button type="button" class="chip' + (on ? ' is-on' : '') + '" aria-pressed="' + on + '" data-msg-kind="' + esc(x) + '">' + esc(x) + '</button>';
      }).join('') + '</div>' +
      '<p class="msg-compose__hint" id="msgHint">' + esc(HINT[k] || '') + '</p>' +
      '<label class="sr-only" for="msgText">メッセージ</label>' +
      '<textarea class="textarea" id="msgText" rows="4" placeholder="' + esc(PH[k] || '') + '">' + esc(view.draft) + '</textarea>' +
      '<div class="msg-tpl"><span class="msg-tpl__lbl">書き出しを使う</span>' + TEMPLATES.map(function (t, i) {
        return '<button type="button" class="btn btn-ghost btn-s" data-msg-tpl="' + i + '">' + esc(t.label) + '</button>';
      }).join('') + '</div>' +
      '<div class="msg-compose__foot">' +
        '<span class="msg-compose__kbd">Ctrl（Mac は ⌘）＋ Enter でも送れます</span>' +
        '<button type="button" class="btn btn-primary" data-msg="send"' + (view.draft.trim() ? '' : ' disabled') + '>送る</button>' +
      '</div>' +
    '</section>';
  }

  /* ---------- 書く欄の操作（描き直さずに DOM だけ変える。入力中の文字と変換を守るため） ---------- */
  function setKind(el, k) {
    if (!validKind(k)) return;
    var ta = el.querySelector('#msgText');
    // 面談を選んだら書き出しを入れ、ほかに切り替えたら入れた書き出しだけ消す
    if (ta && k === MEET && !ta.value.trim()) setText(el, MEET_TEXT);
    else if (ta && k !== MEET && ta.value.trim() === MEET_TEXT.trim()) setText(el, '');
    view.kind = k;
    U.$$('[data-msg-kind]', el).forEach(function (b) {
      var on = b.getAttribute('data-msg-kind') === k;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    var hint = el.querySelector('#msgHint');
    if (hint) hint.textContent = HINT[k] || '';
    if (ta) ta.placeholder = PH[k] || '';
  }
  function setText(el, text, caret) {
    var ta = el.querySelector('#msgText');
    if (!ta) return;
    ta.value = text;
    view.draft = text;
    syncSend(el);
    if (caret != null) placeCaret(ta, caret, false);
  }
  function syncSend(el) {
    var ta = el.querySelector('#msgText'), b = el.querySelector('[data-msg="send"]');
    if (ta && b) b.disabled = !ta.value.trim();
  }
  function placeCaret(ta, pos, scroll) {
    try { ta.focus({ preventScroll: !scroll }); } catch (e) { ta.focus(); }
    if (pos == null || pos > ta.value.length) pos = ta.value.length;
    try { ta.setSelectionRange(pos, pos); } catch (e) {}
  }
  function useTemplate(el, t) {
    var ta = el.querySelector('#msgText');
    if (!ta) return;
    if (validKind(t.kind)) setKind(el, t.kind);
    var cur = ta.value, prefix = untouched(cur) ? '' : cur.replace(/\s+$/, '') + '\n\n';
    // 「」の中、なければ最初の「行末の：」のあとにカーソルを置く（すぐ書き始められるように）。
    // 「内容（例：確定申告…）：」のような行で、例の中に入らないよう「：＋改行」で探す
    var at = t.text.indexOf('」');
    if (at < 0) at = t.text.indexOf('：\n') + 1;
    if (at <= 0) at = t.text.length;
    setText(el, prefix + t.text, prefix.length + at);
  }

  /* ---------- 送る ---------- */
  function send(el) {
    var ta = el.querySelector('#msgText');
    if (!ta) return;
    var text = ta.value;
    if (!text.trim()) { U.toast('メッセージを入力してください'); placeCaret(ta, null, true); return; }
    var kind = view.kind;
    view.draft = '';
    view.pending++;
    // 面談の予約は1回送れば足りる。続けて書く文に、また面談の返信が届かないよう種類を戻す
    if (kind === MEET) view.kind = kinds()[0] || kind;
    // Ctrl+Enter で送ったときは、描き直したあとも書く欄にカーソルを戻す
    view.focus = document.activeElement === ta;
    view.caret = 0;
    var p = R.sendMessage(text, kind);
    CLG.app.refresh();
    p.then(function (step) {
      view.pending = Math.max(0, view.pending - 1);
      CLG.app.reward(step);
      if (!onScreen()) return;
      var ta2 = document.getElementById('msgText');
      // 次の文を打っている最中なら、書く欄は触らずにやりとりだけ描き直す（日本語の変換中に消えないように）
      if (ta2 && document.activeElement === ta2) { view.draft = ta2.value; redrawThread(); return; }
      CLG.app.refresh();
    });
  }
  function redrawThread() {
    var sc = document.getElementById('msgScroll');
    if (!sc) return;
    sc.innerHTML = threadInner();
    sc.scrollTop = sc.scrollHeight;
  }

  CLG.screens.messages = {
    title: '相談・メッセージ',
    render: function (ctx) {
      // 「入会したての状態で見る」などで会員が替わったら、前の人の書きかけを持ち越さない
      var owner = R.me().id;
      if (view.owner !== owner) {
        view.owner = owner; view.kind = kinds()[0] || ''; view.draft = ''; view.pending = 0; view.qk = null; view.focus = false;
      }
      var q = (ctx.query && ctx.query.kind) || '';
      if (q !== view.qk) {
        view.qk = q;
        if (validKind(q)) {
          view.kind = q;
          if (q === MEET && untouched(view.draft)) view.draft = MEET_TEXT;
          view.fromQuery = true;
        }
      }
      if (!validKind(view.kind)) view.kind = kinds()[0] || '';

      return '<div class="scr-messages">' +
        '<div class="page-head"><h1 class="page-ttl">相談・メッセージ</h1>' +
          '<p class="page-lead">運営への質問・壁打ち・面談の予約。回数の制限はありません。</p></div>' +
        staffCard() +
        '<section class="card msg-thread" aria-label="運営とのメッセージ">' +
          '<div class="msg-thread__scroll" id="msgScroll" role="log" aria-live="polite" tabindex="0">' + threadInner() + '</div>' +
        '</section>' +
        composer() +
        '<p class="proto-note msg-proto">試作版：送った内容はこのブラウザの中にだけ保存され、外には送られません。返信は自動です。</p>' +
      '</div>';
    },
    mount: function (root, ctx) {
      var el = root.querySelector('.scr-messages');
      if (!el) return;
      var sc = el.querySelector('#msgScroll'), ta = el.querySelector('#msgText');
      if (sc) {
        sc.scrollTop = sc.scrollHeight;
        // 未読が長いときは、いちばん下ではなく「ここから新着」が上に見える位置で止める
        var nw = sc.querySelector('.msg-new');
        if (nw) {
          var top = nw.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 8;
          if (top < sc.scrollTop) sc.scrollTop = top;
        }
      }
      if (R.unread() > 0) R.markRead();

      // ?kind= は1回使ったら URL から外す。次にまた同じリンクで来たときも書き出しが入るように
      if (view.fromQuery) {
        view.fromQuery = false;
        view.qk = '';
        try { history.replaceState(null, '', '#/messages'); } catch (e) {}
        if (ta) placeCaret(ta, null, true);
      } else if (view.focus && ta) {
        view.focus = false;
        placeCaret(ta, view.caret, false);
      }

      // 描くたびに新しくなる要素に付けるので、二重にはならない
      el.addEventListener('click', function (ev) {
        var k = ev.target.closest('[data-msg-kind]');
        if (k) { setKind(el, k.getAttribute('data-msg-kind')); return; }
        var t = ev.target.closest('[data-msg-tpl]');
        if (t) { var tp = TEMPLATES[+t.getAttribute('data-msg-tpl')]; if (tp) useTemplate(el, tp); return; }
        var b = ev.target.closest('[data-msg]');
        if (!b) return;
        var act = b.getAttribute('data-msg');
        if (act === 'send') send(el);
        else if (act === 'meet') {
          setKind(el, MEET);
          var box = el.querySelector('#msgText');
          if (box) {
            if (untouched(box.value)) setText(el, MEET_TEXT);
            box.scrollIntoView({ block: 'center', behavior: 'smooth' });
            placeCaret(box, null, false);
          }
        }
      });
      if (ta) {
        ta.addEventListener('input', function () { view.draft = ta.value; syncSend(el); });
        ta.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey) && !ev.isComposing) { ev.preventDefault(); send(el); }
        });
      }
    }
  };
})();
