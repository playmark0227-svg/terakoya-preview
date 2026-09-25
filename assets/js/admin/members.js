/* ============================================================
   運営画面：会員（#/members）と、A1 の画面で共通に使う道具（CLG.admin.people。画面のファイルでは P と呼ぶ）
   ------------------------------------------------------------
   名簿は AD.data.members()（DATA.ROSTER ＋ デモ会員は CLG.store から）。運営が変えたところは AD.db.state.members[会員番号]。
   このファイルは A1 の4つの画面（会員・会員の詳細・新入生の30日・メッセージ）の中でいちばん先に読まれるので、
   共通の道具をここに置く（admin.html の読み込み順：members → member-detail → onboarding → inbox）。

   ■ P（AD.people）
     P.callName(m)                 呼ぶときの名前（姓だけ。「高橋」）。表示名が「ゆか｜旭川…」の人は本名の姓
     P.fill(文, m)                 ひな形の {name} {no} {step} {day} {orient} {slots} {date} {amount} {until} {staff} を入れる
     P.TEMPLATES / P.REPLIES       会員に送るひな形（声かけ・まとめて送る）/ 返信のひな形（メッセージの画面）
     P.threadOf(会員番号)          その会員とのやりとりの id（デモ会員は 'live'。まだ無ければ null）
     P.send(会員番号, 文, { status, kind, template, contact }) → { ok, threadId } / { ok:false, errors }
                                   会員の「相談・メッセージ」に運営から送る。デモ会員は R.staffReply（会員ページのタブに届く）
     P.compose(会員の行の配列, { template, status, contact, audit, title }) → Promise({ sent, threadId } | null)
                                   送る文を書く引き出し（1人でも、まとめてでも）
     P.steps(m)                    スタートガイドの10項目 [{ id, title, short, done, doneAt, due（予定より遅れ） }]
     P.interviewOf(会員番号)       いちばん新しい面談（取消を除く）か null
     P.confirmInterview(面談) / P.setInterview(面談, 'done'|'canceled', 理由)
     P.slotCfg() / P.slotList(日数) / P.nextSlots(数)   面談の枠（運営画面だけの保存：db.meetSlots）。枠の booked は最初の予約、all は同じ時刻の予約すべて
     P.staffOptions(選んでいるid, 空の文, 短く)   担当を選ぶ <option> の並び（短く＝役割を付けない）
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, AD = CLG.admin, AU = AD.ui, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon;
  var DAY = 86400000;
  var cur = null;

  function nowIso() { return CLG.now().toISOString(); }
  function byId(list, id) { for (var i = 0; list && i < list.length; i++) if (list[i] && list[i].id === id) return list[i]; return null; }
  function staffId() { var s = AD.db.staff(); return s ? s.id : AD.db.DEMO_STAFF; }
  function whenText(at) { return DATA.mdw(at) + ' ' + DATA.hm(at); }

  /* ============================================================
     共通の道具
     ============================================================ */
  var P = AD.people = {};

  /** 呼ぶときの名前：姓だけ（メッセージは「高橋さん」で始める）。表示名にくぎりがない人は表示名のまま */
  P.callName = function (m) {
    if (!m) return '';
    var n = String(m.realName || m.name || '').trim(), parts = n.split(/\s+/);
    if (parts.length > 1) return parts[0];
    return n.replace(/[｜|@＠（(].*$/, '') || n;
  };
  function staffCall() { var s = AD.db.staff(); return s ? String(s.name).split(/\s+/)[0] : '運営'; }

  /* 支払いエラーのひな形に入れる値（いちばん新しい失敗した請求から） */
  function failedInfo(m) {
    var f = AD.data.payments({ no: m.no, status: 'failed' })[0];
    if (!f) return {};
    var until = new Date(new Date(f.at).getTime() + (DATA.SITE.graceDays || 7) * DAY);
    return { date: DATA.md(f.at), amount: U.yen(f.amount), until: DATA.mdw(until.toISOString()) };
  }
  function nextOrient() {
    var n = CLG.now();
    var e = DATA.EVENTS.filter(function (x) { return x.series === 'orientation' && new Date(x.at) > n; })
      .sort(function (a, b) { return new Date(a.at) - new Date(b.at); })[0];
    return e ? whenText(e.at) : '毎週水曜20:00';
  }

  /* 会員に送るひな形。文は運営の人が書いた口調で、短く。{…} は送るときに1人ずつ入れる */
  P.TEMPLATES = [
    { id: 'free', name: '自由に書く', text: '' },
    { id: 'stalled', name: 'スタートガイドが止まっている', text: '{name}さん、運営の{staff}です。スタートガイドは「{step}」まで来ています。分からないところや、つまずいているところがあれば、ここに送ってください。' },
    { id: 'orient', name: 'オリエンテーションの案内', text: '{name}さん、運営の{staff}です。まずはオリエンテーション（全4回・30分）を見てください。講座の一覧のいちばん上にあります。\n次のライブのオリエンテーションは{orient}からです。' },
    { id: 'meet', name: '面談の案内', text: '{name}さん、運営の{staff}です。15分の面談で、これからの進め方を一緒に決めませんか。\n{slots}\n都合のいい日時を返信してください。ほかの日時でも合わせます。' },
    { id: 'line', name: 'LINE連携の案内', text: '{name}さん、運営の{staff}です。LINEをつなぐと、返信や新しい案件がLINEに届きます。「アカウント」の「LINEで通知を受け取る」から1分でできます。' },
    { id: 'idle', name: 'しばらくログインがない', text: '{name}さん、運営の{staff}です。しばらくログインがなかったので連絡しました。忙しい時期なら、講座は1日1回（10分）からでも進みます。困っていることがあれば返信してください。' },
    { id: 'payment', name: '支払いエラーの連絡', text: '{name}さん、運営の{staff}です。{date}の月額（{amount}）のお支払いができませんでした。{until}までに、会員ページの「アカウント」→「お支払い」からカードを更新してください。更新すると自動で請求をやり直します。' }
  ];
  /* 返信のひな形（メッセージの画面） */
  P.REPLIES = [
    { id: 'hello', name: 'はじめのあいさつ', text: '{name}さん、運営の{staff}です。入会ありがとうございます。分からないことは、このメッセージで聞いてください。' },
    { id: 'check', name: '確認して返す', text: '確認して、今日中に返信します。' },
    { id: 'teacher', name: '講師に確認する', text: '講師に確認します。1〜2日で返信します。' },
    { id: 'slots', name: '面談の候補', text: '面談の候補です。\n{slots}\nどれか選んでください。15分の予定です。' },
    { id: 'card', name: 'カードの更新のしかた', text: '会員ページの「アカウント」→「お支払い」からカードを更新できます。更新すると、止まっていた請求を自動でやり直します。' },
    { id: 'expert', name: '専門家に日程を聞く', text: '専門家の先生に日程を聞いています。候補が届いたら、ここでお送りします。' },
    { id: 'close', name: '済んだかの確認', text: 'ほかに分からないところがあれば、また送ってください。' }
  ];

  P.fill = function (text, m, extra) {
    m = m || {};
    var x = Object.assign({ name: P.callName(m), no: m.no || '', step: m.currentStep || 'スタートガイド', day: m.day != null ? String(m.day) : '',
      orient: nextOrient(), slots: P.nextSlots(3).map(function (s) { return '・' + whenText(s.at); }).join('\n'), staff: staffCall() }, extra || {});
    if (/\{(date|amount|until)\}/.test(text || '')) Object.assign(x, failedInfo(m));
    return String(text || '').replace(/\{(\w+)\}/g, function (all, k) { return x[k] != null && x[k] !== '' ? x[k] : all; });
  };

  /* ---------- メッセージを送る ---------- */
  P.threadOf = function (no) {
    if (!no) return null;
    if (no === AD.data.live().no) return 'live';
    var best = null;
    AD.db.state.threads.forEach(function (t) {
      if (t.no !== no) return;
      var last = t.messages[t.messages.length - 1], at = last ? new Date(last.at).getTime() : 0;
      if (!best || at > best.at) best = { id: t.id, at: at };
    });
    return best ? best.id : null;
  };
  /** 運営から送る。やりとりがあればそこに足し、無ければ新しく作る（会員ページでは運営との1本のやりとりに入る）。
      status：送ったあとの状態。声かけは「対応中」（返事を待つ）、まとめて送ったものは「完了」 */
  P.send = function (no, text, o) {
    o = o || {};
    text = String(text || '').trim();
    if (!text) return { ok: false, errors: { text: '本文を入れてください' } };
    if (text.length > 2000) return { ok: false, errors: { text: '2000文字までにしてください' } };
    var who = staffId(), at = nowIso(), tid = P.threadOf(no);
    if (tid === 'live') {
      var res = AD.ops.reply('live', text);
      if (!res.ok) return res;
      if (o.status === 'done') AD.ops.setThreadStatus('live', 'done');
    } else {
      tid = AD.db.update(function (s) {
        var t = tid ? byId(s.threads, tid) : null;
        if (!t) {
          t = { id: AD.db.uid('th'), no: no, kind: o.kind || '運営から', status: o.status || 'doing', assignee: who, ref: '', doneAt: at, messages: [], notes: [], outbound: true };
          s.threads.push(t);
        } else {
          if (t.status === 'open') t.status = 'doing';
          else if (o.status) t.status = o.status;
          if (!t.assignee) t.assignee = who;
          t.doneAt = at;
        }
        t.messages.push({ from: who, at: at, text: text });
        return t.id;
      });
    }
    if (o.contact) {
      AD.db.update(function (s) { s.contacts.unshift({ id: AD.db.uid('ct'), no: no, at: at, by: who, template: o.template || 'free', text: text }); });
    }
    return { ok: true, threadId: tid };
  };

  /** 送る文を書く引き出し。list は会員の行（AD.data.members() の形）か会員番号 */
  P.compose = function (list, o) {
    o = o || {};
    // 役割：会員に送るのは「会員・メッセージ」の役割（代表・運営）だけ
    if (!AU.need('members')) return Promise.resolve(null);
    list = (list || []).map(function (x) { return typeof x === 'string' ? AD.data.member(x) : x; }).filter(Boolean);
    var skip = list.filter(function (m) { return m.status === 'left'; });
    var to = list.filter(function (m) { return m.status !== 'left'; });
    if (!to.length) { U.toast('終了した会員には送れません', 'error'); return Promise.resolve(null); }
    var single = to.length === 1, first = to[0];
    var tplId = o.template && byId(P.TEMPLATES, o.template) ? o.template : 'free';
    // 1人に送るときは、ひな形の {name} などをその場で入れて、送る文そのものを直せるようにする。
    // まとめて送るときは {name} のまま書き、下に1人目に届く文を出す
    function startText(t) { return single ? P.fill(t, first) : t; }
    var start = startText(byId(P.TEMPLATES, tplId).text);
    var shown = to.slice(0, 12);
    var rcpt = '<div class="a-pc__to"><span class="a-pc__label">宛先</span><ul class="a-pc__names">' + shown.map(function (m) {
      return '<li>' + AU.who(m, { link: false, sub: m.no }) + '</li>';
    }).join('') + (to.length > shown.length ? '<li class="a-pc__more">ほか' + (to.length - shown.length) + '人</li>' : '') + '</ul></div>';
    var skipNote = skip.length ? '<p class="notice notice-warn a-pc__skip">' + icon('info', 'ico-s') + '<span>終了した会員' + skip.length + '人には送りません。</span></p>' : '';
    var html = rcpt + skipNote +
      '<form class="a-pc__form" id="pcForm" novalidate>' +
        '<div class="field"><label class="field__label" for="pcTpl">ひな形</label>' +
          '<select class="select" id="pcTpl" name="tpl">' + P.TEMPLATES.map(function (t) {
            return '<option value="' + esc(t.id) + '"' + (t.id === tplId ? ' selected' : '') + '>' + esc(t.name) + '</option>';
          }).join('') + '</select></div>' +
        '<div class="field"><label class="field__label" for="pcText">本文</label>' +
          '<textarea class="textarea" id="pcText" name="text" rows="' + (single ? 9 : 7) + '" maxlength="2000" required>' + esc(start) + '</textarea>' +
          (single ? '' : '<small>{name} は1人ずつ名前（姓）に置き換わります</small>') + '</div>' +
        (single ? '' : '<div class="a-pc__preview"><p class="a-pc__label">' + esc(P.callName(first)) + 'さんに届く文</p><p class="a-pc__prev" id="pcPrev"></p></div>') +
        '<p class="form-err" role="alert" id="pcErr"></p>' +
      '</form>';
    var title = o.title || (single ? (first.realName || first.name) + 'さんにメッセージ' : to.length + '人にメッセージ');
    return new Promise(function (resolve) {
      var done = false;
      var m = AU.drawer(html, {
        title: title, cls: 'a-compose', dirty: true, focus: '#pcText',
        foot: '<button type="button" class="btn btn-soft" data-close>やめる</button>' +
          '<button type="submit" form="pcForm" class="btn btn-primary">' + icon('arrow', 'ico-s') + (single ? '送る' : to.length + '人に送る') + '</button>',
        onClose: function () { if (!done) { done = true; resolve(null); } }
      });
      var form = m.querySelector('#pcForm'), ta = form.querySelector('#pcText'), prev = m.querySelector('#pcPrev');
      U.fieldErrors(form, {}, { focus: false });
      // 書き足しやすいように、カーソルは文の終わりに置く
      setTimeout(function () { if (document.activeElement === ta) { try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e) {} } }, 0);
      function preview() { if (prev) prev.innerHTML = U.jp(P.fill(ta.value, first), { br: true }) || '<span class="a-pc__empty">本文を入れると、ここに出ます</span>'; }
      preview();
      form.addEventListener('input', function (e) {
        if (e.target === ta) { preview(); if (ta.getAttribute('aria-invalid')) U.fieldErrors(form, { text: '' }, { focus: false }); }
      });
      form.addEventListener('change', function (e) {
        if (e.target.name !== 'tpl') return;
        var t = byId(P.TEMPLATES, e.target.value);
        if (t && t.text) { ta.value = startText(t.text); preview(); if (m.setDirty) m.setDirty(true); }
        else if (t && t.id === 'free') { ta.value = ''; preview(); }
      });
      form.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.isComposing) { e.preventDefault(); form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true })); }
      });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var text = String(ta.value || '').trim();
        if (!text) { U.fieldErrors(form, { text: '本文を入れてください' }); return; }
        if (/\{(date|amount|until)\}/.test(P.fill(text, first))) { U.fieldErrors(form, { text: '支払いの失敗がない会員です。{date} {amount} {until} を消してください' }); return; }
        var sent = 0, tid = null, tpl = form.tpl.value;
        to.forEach(function (x) {
          var res = P.send(x.no, P.fill(text, x), { status: o.status || (single ? 'doing' : 'done'), template: tpl, contact: o.contact });
          if (res.ok) { sent++; tid = res.threadId; }
        });
        if (o.audit) {
          var a = typeof o.audit === 'function' ? o.audit(text, to) : o.audit;
          if (a) AD.db.audit(a);
        } else if (!single) {
          AD.db.audit({ action: 'bulk_message', label: 'まとめてメッセージを送った', target: { type: 'members', id: 'bulk', name: sent + '人' },
            reason: '', detail: text.split('\n')[0].slice(0, 40) });
        }
        done = true;
        m.close();
        if (single) U.toast(P.callName(first) + 'さんに送りました', 'ok', { action: '開く', onAction: function () { AD.app.go('#/inbox/' + encodeURIComponent(tid)); } });
        else U.toast(sent + '人に送りました', 'ok', { action: 'メッセージを見る', onAction: function () { AD.app.go('#/inbox?kind=' + encodeURIComponent('運営から')); } });
        resolve({ sent: sent, threadId: single ? tid : null });
      });
    });
  };

  /* ---------- スタートガイド ---------- */
  var SHORT = { profile: 'プロフィール', orient: 'オリエンテーション', line: 'LINE', intro: '自己紹介', goal: '目標', meet: '面談', lesson3: '講座3回',
    gig: '案件', event: 'イベント', showcase: '成果発表会' };
  P.SHORT = SHORT;
  /** 10項目の済・まだ。デモ会員は本当の記録（R.steps）。名簿の人は済んだ数だけ上から順に済（ダッシュボードの「止まっている項目」と合わせる） */
  P.steps = function (m) {
    // 「遅れ」は入会5〜30日目だけ（始めたばかりの人と、30日を過ぎた人には付けない。スタートガイドは最初の30日のもの）
    var exp = (m.day || 1) >= 5 && (m.day || 1) <= 30 && m.status !== 'left' ? AD.data.expectedSteps(m.day) : 0;
    if (m.live) {
      return R.steps().map(function (s, i) {
        return { id: s.id, title: s.baseTitle || s.title, short: SHORT[s.id] || s.title, done: !!s.done, doneAt: s.doneAt || null, due: !s.done && i < exp };
      });
    }
    // 済んだ日は入会から40日のあいだに置く（スタートガイドは最初の30日でやるもののため）
    var join = new Date(m.joinedAt).getTime(), end = Math.max(join + 3600000, Math.min(CLG.now().getTime(), new Date(m.lastActive || m.joinedAt).getTime(), join + 40 * DAY));
    // 時刻は朝・昼休み・夜のどれか（夜中の3時に済ませたことにしない）。順番は項目の順のまま
    var HRS = [21, 12, 20, 22, 8, 21, 13, 22, 19, 21], prev = join;
    return DATA.ONBOARDING.map(function (s, i) {
      var done = i < m.stepsDone, at = null;
      if (done) {
        var d = new Date(join + (end - join) * (i + 1) / (m.stepsDone + 1));
        d.setHours(HRS[i % HRS.length], (i * 17 + 5) % 60, 0, 0);
        at = Math.min(end, Math.max(prev + 7 * 60000, d.getTime()));
        prev = at;
      }
      return { id: s.id, title: s.title, short: SHORT[s.id] || s.title, done: done,
        doneAt: at ? new Date(at).toISOString() : null, due: !done && i < exp };
    });
  };

  /* ---------- 面談 ---------- */
  P.interviewOf = function (no) {
    var list = AD.data.queues().interviews.filter(function (x) { return x.no === no && x.status !== 'canceled'; })
      .sort(function (a, b) { return new Date(b.bookedAt || b.at) - new Date(a.bookedAt || a.at); });
    return list[0] || null;
  };
  /** 面談を確定する。デモ会員は R.confirmMeeting（会員ページに予約の知らせが届き、スタートガイドの「面談」が済になる）。
      ほかの会員は運営画面の記録を変えて、Zoom のリンクを送る */
  P.confirmInterview = function (iv) {
    if (!AU.can('members')) return { ok: false, error: '面談を確定できるのは' + AU.whoCan('members') + 'です' };
    if (!iv || iv.status !== 'pending') return { ok: false, error: '確定待ちの面談ではありません' };
    if (iv.live) {
      var res = R.confirmMeeting(iv.id);
      return res ? { ok: true } : { ok: false, error: '確定できませんでした' };
    }
    AD.db.update(function (s) { var x = byId(s.interviews, iv.id); if (x) { x.status = 'confirmed'; x.confirmedAt = nowIso(); x.confirmedBy = staffId(); } });
    var m = AD.data.member(iv.no);
    P.send(iv.no, P.fill('{name}さん、' + whenText(iv.at) + 'で面談を予約しました。当日はこのリンクから入ってください。\n' + DATA.SITE.zoomPlaceholder + '\nカメラはオフでもかまいません。', m),
      { status: 'done', kind: '面談の予約' });
    return { ok: true };
  };
  P.setInterview = function (iv, status, reason) {
    if (!AU.can('members')) return { ok: false, error: '面談を変えられるのは' + AU.whoCan('members') + 'です' };
    if (!iv || iv.live) return { ok: false, error: 'デモ会員の面談は会員ページで変えます' };
    AD.db.update(function (s) {
      var x = byId(s.interviews, iv.id); if (!x) return;
      x.status = status; x.updatedAt = nowIso(); x.updatedBy = staffId(); if (reason) x.reason = reason;
    });
    return { ok: true };
  };

  /* ---------- 面談の枠（運営画面だけの保存） ---------- */
  var WD = ['日', '月', '火', '水', '木', '金', '土'];
  P.WD = WD;
  P.slotCfg = function () {
    return AD.db.ensure('meetSlots', function () {
      // 会員ページの候補（平日の夜2つと土曜の午前）と同じ時間帯から始める
      return { min: 15, weekly: [
        { id: 'ms1', dow: 1, time: '21:00', staff: 'staff2' }, { id: 'ms2', dow: 2, time: '21:30', staff: 'staff2' },
        { id: 'ms3', dow: 3, time: '12:15', staff: 'staff3' }, { id: 'ms4', dow: 4, time: '21:00', staff: 'staff2' },
        { id: 'ms5', dow: 6, time: '10:00', staff: 'staff2' }, { id: 'ms6', dow: 6, time: '10:30', staff: 'staff4' }
      ], off: [] };
    });
  };
  function dayKey(d) { d = new Date(d); return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate()); }
  /** これから days 日の枠（休みの日を除いたもの。予約が入っていれば booked に面談） */
  P.slotList = function (days) {
    var cfg = P.slotCfg(), n = CLG.now(), out = [];
    var off = {}; (cfg.off || []).forEach(function (o) { off[dayKey(o.at)] = o; });
    var ivs = AD.data.queues().interviews.filter(function (x) { return x.status === 'pending' || x.status === 'confirmed'; });
    var base = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    for (var i = 0; i < (days || 14); i++) {
      var d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      cfg.weekly.filter(function (w) { return w.dow === d.getDay(); }).sort(function (a, b) { return a.time < b.time ? -1 : 1; }).forEach(function (w) {
        var hm = String(w.time).split(':'), at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), +hm[0], +hm[1] || 0);
        if (at <= n) return;
        // 同じ時刻の予約が2つ以上あることもある（会員ページから同時に申し込まれたとき）。全部持っておく
        var all = ivs.filter(function (x) { return Math.abs(new Date(x.at) - at) < 60000; });
        out.push({ id: w.id + '-' + dayKey(at), at: at.toISOString(), staff: w.staff, off: off[dayKey(at)] || null, booked: all[0] || null, all: all });
      });
    }
    return out;
  };
  P.nextSlots = function (k) {
    var list = [];
    try { list = P.slotList(21).filter(function (s) { return !s.off && !s.booked; }); } catch (e) { list = []; }
    // 同じ日は1つだけ（候補は別の日にする）
    var seen = {}, out = [];
    list.forEach(function (s) { var dk = dayKey(s.at); if (!seen[dk] && out.length < (k || 3)) { seen[dk] = 1; out.push(s); } });
    return out;
  };
  P.staffOptions = function (sel, emptyLabel, short) {
    var list = AD.db.state.staff.filter(function (s) { return s.active && s.role !== '経理'; });
    var cur2 = sel ? AD.db.staff(sel) : null;
    if (cur2 && list.indexOf(cur2) < 0) list.push(cur2);
    return (emptyLabel ? '<option value=""' + (!sel ? ' selected' : '') + '>' + esc(emptyLabel) + '</option>' : '') + list.map(function (s) {
      return '<option value="' + esc(s.id) + '"' + (s.id === sel ? ' selected' : '') + '>' + esc(s.name) + (short ? '' : '（' + esc(s.role) + '）') + '</option>';
    }).join('');
  };
  P.idleDays = function (m) { return m.lastActive ? Math.max(0, Math.floor((CLG.now() - new Date(m.lastActive)) / DAY)) : (m.day || 0); };

  /* ============================================================
     会員の一覧
     ============================================================ */
  /* タグ（運営だけが見る。会員には出ない）。タイムラインの「自動の印」と取り違えないよう「タグ」と呼ぶ */
  var TAGS = ['オフ会の世話役', '発表したい', '面談済み', '要フォロー', '講師候補', '紹介の確認中'];
  P.TAGS = TAGS;
  P.allTags = function () {
    var seen = {}, out = [];
    TAGS.concat.apply(TAGS.slice(), Object.keys(AD.db.state.members).map(function (no) { return AD.db.state.members[no].tags || []; }))
      .forEach(function (t) { if (t && !seen[t]) { seen[t] = 1; out.push(t); } });
    return out;
  };

  function nameCell(r) {
    var marks = (r.live ? '<span class="a-mb__mark">デモ会員</span>' : '') + (r.suspended ? '<span class="a-mb__mark is-stop">ログイン停止中</span>' : '');
    return '<span class="a-mb__name" title="' + esc(r.name) + '">' + AU.who(r, { sub: r.kana || '―', link: false }) + (marks ? '<span class="a-mb__marks">' + marks + '</span>' : '') + '</span>';
  }

  /** 選んだ会員にタグを付ける */
  function tagMany(list, clear) {
    if (!AU.need('members')) return;   // 役割：会員の印を付けるのも「会員・メッセージ」の役割
    var fid = 'mbTagForm';
    var m = U.modal('<form id="' + fid + '" class="a-mb__tagform" novalidate>' +
        '<p class="a-mb__tagto">' + esc(list.length) + '人に付けます。</p>' +
        '<div class="chips a-mb__tagchips" role="group" aria-label="タグ">' + P.allTags().map(function (t, i) {
          return '<button type="button" class="chip" data-mb-pick="' + i + '" aria-pressed="false">' + esc(t) + '</button>';
        }).join('') + '</div>' +
        '<label class="field"><span>タグ</span><input class="input" id="mbTagNew" name="tag" maxlength="16" required autocomplete="off"></label>' +
        '<p class="form-err" role="alert"></p></form>',
      { title: 'タグを付ける', cls: 'a-members', dirty: true,
        foot: '<button type="button" class="btn btn-soft" data-close>やめる</button><button type="submit" form="' + fid + '" class="btn btn-ink">付ける</button>' });
    var form = m.querySelector('form'), tags = P.allTags();
    U.fieldErrors(form, {}, { focus: false });
    m.addEventListener('click', function (e) {
      var b = e.target.closest('[data-mb-pick]'); if (!b) return;
      form.tag.value = tags[+b.getAttribute('data-mb-pick')];
      U.$$('[data-mb-pick]', m).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      U.fieldErrors(form, { tag: '' }, { focus: false });
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var t = String(form.tag.value || '').trim();
      if (!t) { U.fieldErrors(form, { tag: 'タグを選ぶか、入れてください' }); return; }
      AD.db.update(function (s) {
        list.forEach(function (r) {
          var ex = s.members[r.no] = s.members[r.no] || { tags: [], memo: '' };
          ex.tags = ex.tags || [];
          if (ex.tags.indexOf(t) < 0) ex.tags.push(t);
        });
      });
      m.close();
      if (clear) clear();
      U.toast(list.length + '人に「' + t + '」を付けました', 'ok');
    });
  }

  AD.screens.members = {
    title: '会員',
    skeleton: 'table',
    render: function (ctx) {
      var rows = ctx.data.members();
      var enrolled = rows.filter(function (r) { return r.status !== 'left'; }).length;
      var cohorts = {};
      rows.forEach(function (r) { cohorts[r.cohortKey] = r.cohort; });
      var cohortOpts = Object.keys(cohorts).sort().reverse().map(function (k) { return [k, cohorts[k].replace(/入会$/, '')]; });
      var used = {}; rows.forEach(function (r) { (r.tags || []).forEach(function (t) { used[t] = (used[t] || 0) + 1; }); });
      var tagOpts = Object.keys(used).sort().map(function (t) { return [t, t + '（' + used[t] + '）']; });
      var statusOpts = [['', 'すべて'], ['active', '有効'], ['canceling', '解約予定'], ['past_due', '支払いエラー'], ['left', '終了']];
      if (rows.some(function (r) { return r.status === 'paused'; })) statusOpts.splice(4, 0, ['paused', '休会中']);
      var filters = [
        { key: 'status', label: '状態', chips: true, options: statusOpts },
        { key: 'cohort', label: '入会月', options: [['', 'すべて']].concat(cohortOpts), match: function (r, v) { return r.cohortKey === v; } },
        { key: 'lv', label: 'Lv', options: [['', 'すべて']].concat(DATA.LEVELS.map(function (l) { return [String(l.lv), 'Lv' + l.lv + ' ' + l.name]; })),
          match: function (r, v) { return String(r.level) === v; } },
        { key: 'seen', label: 'ログイン', options: [['', 'すべて'], ['7', '7日以上ない'], ['30', '30日以上ない']],
          match: function (r, v) { return r.status !== 'left' && P.idleDays(r) >= +v; } }
      ];
      if (tagOpts.length) filters.push({ key: 'tag', label: 'タグ', options: [['', 'すべて']].concat(tagOpts), match: function (r, v) { return (r.tags || []).indexOf(v) >= 0; } });
      return '<div class="a-members">' +
        AU.head({ title: '会員', sub: '在籍 ' + U.num(enrolled) + '人・これまでの会員 ' + U.num(rows.length) + '人' }) +
        AU.table({
          // 新しい会員が上（運営がいちばん気にかけるのは入ったばかりの人のため）
          id: 'members', rows: rows, query: ctx.query, sort: '-no', label: '会員の一覧', pageSize: 50,
          rowId: function (r) { return r.no; },
          search: { placeholder: '名前・会員番号・メール', label: '名前・会員番号・メール・紹介コードで探す', keys: ['name', 'no', 'kana', 'email', 'refCode', 'area', 'realName'] },
          filters: filters,
          columns: [
            { key: 'no', label: '会員番号', nowrap: true, cls: 'a-mb__no', html: function (r) { return '<a class="num" href="#/members/' + encodeURIComponent(r.no) + '">' + esc(r.no) + '</a>'; } },
            { key: 'name', label: '名前', main: true, value: function (r) { return r.name; }, html: nameCell, csv: function (r) { return r.name; } },
            { key: 'realName', label: '本名', csvOnly: true, csv: function (r) { return r.realName || r.name; } },
            { key: 'kana', label: 'フリガナ', csvOnly: true },
            AU.col.date('joinedAt', '入会', { dir: 'asc', hide: 'sm' }),
            { key: 'cohort', label: '入会月', csvOnly: true, csv: function (r) { return r.cohortKey; } },
            { key: 'level', label: 'Lv', align: 'r', dir: 'desc', html: function (r) { return '<span class="num">' + esc(r.level) + '</span>'; } },
            { key: 'xp', label: 'XP', csvOnly: true },
            AU.col.status('status', '状態', 'member', { value: function (r) { return { past_due: 0, canceling: 1, paused: 2, active: 3, left: 4 }[r.status]; } }),
            { key: 'stepsDone', label: 'スタートガイド', dir: 'desc', html: function (r) { return AU.steps(r.stepsDone); }, csv: function (r) { return r.stepsDone + '/' + DATA.ONBOARDING.length; } },
            AU.col.rel('lastActive', '最後のログイン'),
            { key: 'area', label: '地域', hide: 'sm', cls: 'a-mb__area', html: function (r) {
              // 都道府県と市区町村のあいだで折り返せるように（狭いときは2行になる）
              return esc(r.pref || '') + (r.city ? ' <span class="nw">' + esc(r.city) + '</span>' : '');
            } },
            { key: 'refCode', label: '紹介コード', hide: 'sm', cls: 'mono a-mb__ref' },
            { key: 'job', label: 'いまのお仕事', csvOnly: true },
            { key: 'email', label: 'メール', csvOnly: true },
            { key: 'referredBy', label: '紹介した人', csvOnly: true, csv: function (r) { return r.referredBy || ''; } },
            { key: 'cancelAt', label: '会員期間の終わり', csvOnly: true, csv: function (r) { return r.status === 'canceling' ? AU.ymd(r.cancelAt) : r.status === 'left' ? AU.ymd(r.leftAt) : ''; } },
            { key: 'tags', label: 'タグ', csvOnly: true, csv: function (r) { return (r.tags || []).join(' '); } }
          ],
          rowHref: function (r) { return '#/members/' + encodeURIComponent(r.no); },
          rowClass: function (r) { return r.status === 'past_due' ? 'is-alert' : r.status === 'left' ? 'is-quiet' : ''; },
          rowLabel: function (r) { return r.name + '（' + r.no + '）'; },
          // まとめて送る・印を付けるのは「会員・メッセージ」の役割だけ（講師・経理は選ぶ欄を出さない）
          select: AU.can('members'),
          bulk: [
            { id: 'msg', label: 'メッセージを送る', icon: 'mail', run: function (list, t) {
              P.compose(list).then(function (res) { if (res && res.sent) t.clear(); });
            } },
            { id: 'tag', label: 'タグを付ける', icon: 'flag', run: function (list, t) { tagMany(list, t.clear); } }
          ],
          csv: { name: '会員' }, empty: 'まだ会員はいません。'
        }) +
      '</div>';
    },
    mount: function (root, ctx) { cur = ctx; }
  };
})();
