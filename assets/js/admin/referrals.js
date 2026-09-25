/* ============================================================
   運営画面：紹介報酬（#/referrals）
   ?tab=close（月末の締め。既定）| rows（明細）| banks（振込先）| history（締めの記録）
   ?status=hold|ready|confirmed|scheduled|paid|void（明細の絞り込み。?status=ready だけで来たら締めの画面）
   ?row=<明細id>（その明細の引き出し）
   - 紹介は1段だけ。紹介した人数・報酬の額で会員を並べる表は作らない（画面づくりの約束 §3）。
     支払いの一覧は振込のための表なので、並びは会員番号の順。金額の列では並べ替えない。
   - 流れ：保留（初回の決済から holdDays 日）→ 確定待ち → 確定（R.confirmReward／AD.db）→ 締め（支払予定）
     → 振込データ（全銀形式）→ 支払済（R.payReward／AD.db）。振込先がない・名義が違う・1,000円未満は次の支払いへ繰り越す。
   - デモ会員の明細は会員ページの記録（R.rewardRows）。確定は R.confirmReward、締めは R.closeMonth（その月の末までに確定した明細を
     まとめて支払予定に。締めの束に入った繰り越しは R.scheduleReward）、支払いは R.payMonth（束の月の明細をまとめて。月の違う明細が
     残れば R.payReward）。どれも会員ページの紹介の画面がすぐ変わる。
   - 運営画面だけが持つもの：締めの記録 rewardCloses、締めの記録のない支払いを済ませた印 rewardPays、
     あやしい紹介の判断 refFlags、連絡の記録 moneyContacts（AD.db.ensure）。
   - 支払済にした束に残った人（振込先がない・名義が違う・1,000円未満）は繰り越し。前の月の支払いからの繰り越しは今月の締めに、
     今月の締めの支払いからの繰り越しは来月の締めに入る。確定・締め・振込は代表・運営・経理だけ（講師は見るだけ）。
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, AD = CLG.admin, AU = AD.ui, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon, RF = DATA.REFERRAL;
  var cur = null;
  var DAY = 86400000;

  /* ---------- 日付と締め ---------- */
  function pad(n, w) { var s = String(n); while (s.length < (w || 2)) s = '0' + s; return s; }
  function closingOf(d) { d = new Date(d); return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59); }
  function payDateOf(closing) {
    var c = new Date(closing), d = new Date(c.getFullYear(), c.getMonth() + 1, RF.payDay, 10);
    if (d.getDay() === 6) d.setDate(d.getDate() + 2);
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    return d;
  }
  function mKey(d) { return AD.data.monthKey(d); }
  function mLabel(d) { d = new Date(d); var n = CLG.now(); return (d.getFullYear() !== n.getFullYear() ? d.getFullYear() + '年' : '') + (d.getMonth() + 1) + '月分'; }
  function staffId() { return (AD.db.staff() || {}).id || AD.db.DEMO_STAFF; }
  function nowIso() { return CLG.now().toISOString(); }
  function hashWith(patch) { return AD.app.hashOf('referrals', Object.assign({}, (cur && cur.query) || {}, patch)); }
  function member(no) { return AD.data.member(no) || { no: no, name: no || '―', kana: '' }; }
  function sum(list) { return list.reduce(function (a, x) { return a + (x.amount || 0); }, 0); }

  /* ---------- 運営画面だけが持つもの ---------- */
  function closes() { return AD.db.ensure('rewardCloses', function () { return []; }); }
  function flagsState() { return AD.db.ensure('refFlags', function () { return {}; }); }
  // 締めの記録のない支払い（デモのデータで前から支払予定のもの）を支払済にした印。{ 'pay-2026-09-25': { at, by, count, total, carried } }
  function paysState() { return AD.db.ensure('rewardPays', function () { return {}; }); }

  /* お金の操作（確定・締め・振込・取消）ができる役割。設定の「役割でできること」の rewards（講師は見るだけ） */
  function canMoney() { return AU.can('rewards'); }
  function dis() { return canMoney() ? '' : ' disabled'; }
  function roleNote() { return AU.roleNote('rewards', '確定・締め・振込'); }

  /* あやしい紹介：自分を紹介している（同じ名前）・紹介した人と同じカード。デモ会員の分は会員ページの記録なので見ない */
  function flagOf(x) {
    if (x.live || !x.referred) return null;
    var a = AD.db.state.members[x.referrer] || {}, b = AD.db.state.members[x.referred] || {};
    var ma = member(x.referrer), mb = member(x.referred);
    if (x.referrer === x.referred || (ma.realName && ma.realName === mb.realName) || (a.email && a.email === b.email)) return { kind: 'self', label: '自分を紹介しているかも' };
    if (x.flag === 'same_card' || (a.card && a.card === b.card)) return { kind: 'same_card', label: '紹介した人と同じカード' };
    return null;
  }

  /* 明細（AD.data.rewards に、締め・印を重ねる） */
  function rows() {
    var byClose = {};
    closes().forEach(function (c) { (c.rowIds || []).forEach(function (id) { byClose[id] = c; }); });
    var fs = flagsState();
    // デモ会員の明細は会員ページの記録（R.rewardRows）から、取消の理由・繰り越しの印も読む
    var liveRows = {};
    (R.rewardRows ? R.rewardRows() : []).forEach(function (r) { liveRows[r.id] = r; });
    return AD.data.rewards().map(function (x) {
      var y = Object.assign({}, x), lr = x.live ? liveRows[x.id] : null;
      if (lr) {
        if (lr.status === 'void') { y.voidAt = lr.voidAt || y.voidAt; y.voidReason = lr.voidReason || y.voidReason || ''; }
        if (lr.carried) { y.carried = true; y.note = lr.note || ''; }
      }
      y.closing = x.closing || closingOf(x.confirmAt).toISOString();
      var c = byClose[x.id];
      if (c) {
        y.closeId = c.id; y.closedAt = c.at;
        if (!x.paidAt && x.status !== 'paid' && x.status !== 'void') { y.status = 'scheduled'; y.payAt = c.payAt; }
      }
      y.label = AD.data.REWARD_LABEL[y.status];
      var f = flagOf(x);
      if (f) {
        y.flagKind = f.kind; y.flagLabel = f.label; y.flagRes = fs[x.referred] || null;
        y.flagOpen = !y.flagRes && ['hold', 'ready', 'confirmed'].indexOf(y.status) >= 0;
      }
      return y;
    });
  }
  function find(id) { return rows().filter(function (x) { return x.id === id; })[0] || null; }

  /* 振込先（デモ会員は会員ページの R.bank()）。名義は会員の読みと比べる */
  function norm(s) { return AD.data.kana(String(s || '')).replace(/[\s　・.]/g, ''); }
  function bankOf(no) {
    var live = AD.data.live();
    if (no === live.no) return R.bank();
    var b = AD.db.state.banks[no];
    return b || null;
  }
  function bankCheck(no) {
    var b = bankOf(no), m = member(no);
    if (!b) return { ok: false, key: 'none', label: '振込先が未登録', bank: null };
    if (m.kana && b.holder && norm(b.holder) !== norm(m.kana)) return { ok: false, key: 'name', label: '名義が本人と違う（' + b.holder + '）', bank: b };
    return { ok: true, key: 'ok', label: '', bank: b };
  }
  function bankText(b) { return b ? b.bank + ' ' + b.branch + ' ' + (b.kind || '普通') + ' ***' + (b.tail || '') + ' ' + (b.holder || '') : ''; }

  /* ---------- 支払予定の行を「まだ払っていない束」と「繰り越し」に分ける ----------
     束は、支払済にするまで残る（支払日を過ぎても勝手に次へ回さない。振込が済んだかは運営が押して決める）。
     支払済にした束に残った行（振込先がない・名義が違う・最低額に届かない）が繰り越しで、次の締めに入る */
  function split(list) {
    var cs = {}, paid = paysState(), open = {}, carried = [];
    closes().forEach(function (c) { cs[c.id] = c; });
    list.filter(function (x) { return x.status === 'scheduled' && !x.paidAt; }).forEach(function (x) {
      var c = x.closeId && cs[x.closeId], k;
      if (c) {
        if (c.paidAt) { carried.push(x); return; }
        k = c.id;
        (open[k] = open[k] || { id: k, rec: c, month: c.month, label: mLabel(c.closing), payAt: c.payAt, rows: [] }).rows.push(x);
      } else {
        k = 'pay-' + AU.ymd(x.payAt);
        if (paid[k]) { carried.push(x); return; }
        (open[k] = open[k] || { id: k, rec: null, month: mKey(x.closing), label: mLabel(x.closing), payAt: x.payAt, rows: [] }).rows.push(x);
      }
    });
    return { open: Object.keys(open).map(function (k) { return open[k]; }).sort(function (a, b) { return new Date(a.payAt) - new Date(b.payAt); }), carried: carried };
  }

  /* ---------- いまの締め ---------- */
  function cycle(list) {
    var n = CLG.now(), closing = closingOf(n), payAt = payDateOf(closing);
    list = list || rows();
    var ready = list.filter(function (x) { return x.status === 'ready'; });
    var confirmed = list.filter(function (x) { return x.status === 'confirmed' && !x.flagOpen && new Date(x.closing) <= closing; });
    // 繰り越し：前の支払いで振り込めなかったもの（振込先がない、など）。次の締めに入れる
    // ただし、今月の締めの支払いから繰り越したものは、来月の締めに入れる（同じ月に何度も締め直さないように）
    var cs = {}; closes().forEach(function (c) { cs[c.id] = c; });
    var allCarried = split(list).carried;
    var carried = allCarried.filter(function (x) { var c = x.closeId && cs[x.closeId]; return !(c && c.month === mKey(n)); });
    var waiting = allCarried.filter(function (x) { return carried.indexOf(x) < 0; });
    var holdSoon = list.filter(function (x) { return x.status === 'hold' && new Date(x.confirmAt) <= closing; });
    var voidNow = list.filter(function (x) { return x.status === 'void' && x.voidAt && AD.data.inMonth(x.voidAt, 0); });
    var flags = list.filter(function (x) { return x.flagOpen; });
    return { n: n, closing: closing, payAt: payAt, key: mKey(n), label: mLabel(n), ready: ready, confirmed: confirmed, carried: carried, waiting: waiting,
      holdSoon: holdSoon, hold: list.filter(function (x) { return x.status === 'hold'; }), voidNow: voidNow, flags: flags, done: closes().filter(function (c) { return c.month === mKey(n); }) };
  }
  /* 支払いの束：締めの記録ごと（まだ支払済にしていないもの）。締めの記録のない支払予定は支払日ごと */
  function batches(list) { return split(list || rows()).open; }
  /* 束を会員ごとにまとめる（並びは会員番号の順） */
  function payees(list) {
    var by = {};
    list.forEach(function (x) { (by[x.referrer] = by[x.referrer] || []).push(x); });
    return Object.keys(by).sort().map(function (no) {
      var rs = by[no], amt = sum(rs), bc = bankCheck(no), m = member(no);
      var why = !bc.ok ? bc.label : amt < RF.minPayout ? U.yen(RF.minPayout) + '未満' : '';
      return { id: no, no: no, name: m.name, kana: m.kana, rows: rs, count: rs.length, amount: amt, bank: bc.bank, bankKey: bc.key, ok: !why, why: why, live: rs.some(function (x) { return x.live; }) };
    });
  }

  /* ============================================================
     全銀形式（総合振込）。1行120文字・Shift_JIS・半角カナ。
     口座番号は下4桁しか保管していないので、試作版は残りを0で埋める（本番は振込先の保管場所から読む）
     ============================================================ */
  var BANKS = {
    'みずほ銀行': ['0001', 'ﾐｽﾞﾎ'], '三菱UFJ銀行': ['0005', 'ﾐﾂﾋﾞｼUFJ'], '三井住友銀行': ['0009', 'ﾐﾂｲｽﾐﾄﾓ'], 'りそな銀行': ['0010', 'ﾘｿﾅ'],
    '楽天銀行': ['0036', 'ﾗｸﾃﾝ'], '住信SBIネット銀行': ['0038', 'ｽﾐｼﾝSBIﾈﾂﾄ'], 'ゆうちょ銀行': ['9900', 'ﾕｳﾁﾖ'], '北洋銀行': ['0501', 'ﾎｸﾖｳ'],
    '北海道銀行': ['0116', 'ﾎﾂｶｲﾄﾞｳ'], '琉球銀行': ['0187', 'ﾘﾕｳｷﾕｳ'], '沖縄銀行': ['0188', 'ｵｷﾅﾜ'], '七十七銀行': ['0125', 'ｼﾁｼﾞﾕｳｼﾁ'],
    '福岡銀行': ['0177', 'ﾌｸｵｶ'], '西日本シティ銀行': ['0190', 'ﾆｼﾆﾂﾎﾟﾝｼﾃｲ']
  };
  // 振込元（会社の口座）。正本は data.js の SITE.payer（口座は調整中。決まったら data.js だけ直す）
  var PAYER = Object.assign({ code: '0000000000', name: '', bank: '0000', bankName: '', branch: '000', branchName: '', kind: '1', account: '0000000' }, DATA.SITE.payer || {});
  var FW = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
  var HW = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜｦﾝ';
  var SMALL = { 'ァ': 'ｱ', 'ィ': 'ｲ', 'ゥ': 'ｳ', 'ェ': 'ｴ', 'ォ': 'ｵ', 'ッ': 'ﾂ', 'ャ': 'ﾔ', 'ュ': 'ﾕ', 'ョ': 'ﾖ', 'ヮ': 'ﾜ', 'ヰ': 'ｲ', 'ヱ': 'ｴ' };
  var DAK = 'ガギグゲゴザジズゼゾダヂヅデドバビブベボ', DAK_B = 'カキクケコサシスセソタチツテトハヒフヘホ', HAN = 'パピプペポ', HAN_B = 'ハヒフヘホ';
  /** 全角カナ・ひらがな・英数字 → 全銀で使える半角（小さい字は大きく、長音は -） */
  function hankaku(s) {
    s = AD.data.kana(String(s || '')).toUpperCase();
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i), k;
      if (SMALL[c]) out += SMALL[c];
      else if ((k = FW.indexOf(c)) >= 0) out += HW.charAt(k);
      else if ((k = DAK.indexOf(c)) >= 0) out += HW.charAt(FW.indexOf(DAK_B.charAt(k))) + 'ﾞ';
      else if ((k = HAN.indexOf(c)) >= 0) out += HW.charAt(FW.indexOf(HAN_B.charAt(k))) + 'ﾟ';
      else if (c === 'ヴ') out += 'ｳﾞ';
      else if (c === 'ー' || c === '－' || c === '−') out += '-';
      else if (c === '　' || c === ' ') out += ' ';
      else if (/[０-９Ａ-Ｚ]/.test(c)) out += String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
      else if (/[0-9A-Z().\-\/ ]/.test(c)) out += c;
    }
    return out;
  }
  function fx(s, w) { s = String(s == null ? '' : s); if (s.length > w) s = s.slice(0, w); while (s.length < w) s += ' '; return s; }
  function fn(v, w) { var s = String(Math.max(0, Math.round(Number(v) || 0))); if (s.length > w) s = s.slice(-w); return pad(s, w); }
  function hash3(s) { var h = 0; String(s).split('').forEach(function (c) { h = (h * 31 + c.charCodeAt(0)) >>> 0; }); return pad(100 + h % 900, 3); }
  function zenginLines(list, payAt) {
    var d = new Date(payAt), mmdd = pad(d.getMonth() + 1) + pad(d.getDate());
    var head = '1' + '21' + '0' + fx(PAYER.code, 10) + fx(PAYER.name, 40) + mmdd + fx(PAYER.bank, 4) + fx(PAYER.bankName, 15) + fx(PAYER.branch, 3) + fx(PAYER.branchName, 15) + PAYER.kind + fx(PAYER.account, 7) + fx('', 17);
    var lines = [head], total = 0;
    list.forEach(function (p) {
      var b = p.bank || {}, bk = BANKS[b.bank] || ['0000', ''];
      var br = String(b.branch || '').replace(/支店$|出張所$/, '');
      var brKana = /^[ぁ-んァ-ヶー]+$/.test(br) ? hankaku(br) : '';
      total += p.amount;
      lines.push('2' + fx(bk[0], 4) + fx(bk[1], 15) + fx(hash3(b.bank + b.branch), 3) + fx(brKana, 15) + fx('', 4) + (b.kind === '当座' ? '2' : '1') +
        fx(pad(b.tail || '', 7), 7) + fx(hankaku(b.holder), 30) + fn(p.amount, 10) + '0' + fx(pad(p.no.replace(/\D/g, ''), 10), 10) + fx('', 10) + ' ' + ' ' + fx('', 7));
    });
    lines.push('8' + fn(list.length, 6) + fn(total, 12) + fx('', 101));
    lines.push('9' + fx('', 119));
    return lines;
  }
  /** Shift_JIS のバイト列にする（使うのは英数字と半角カナだけなので、1文字1バイトで決まる） */
  function sjis(text) {
    var out = new Uint8Array(text.length);
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      out[i] = c < 0x80 ? c : (c >= 0xFF61 && c <= 0xFF9F) ? c - 0xFEC0 : 0x20;
    }
    return out;
  }
  function saveBytes(name, bytes) {
    var blob = new Blob([bytes], { type: 'text/plain' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  /* ============================================================
     操作（お金を動かすものは AU.act で理由を書いてもらい、操作の記録に残す）
     ============================================================ */
  function confirmRows(list, o) {
    list = list.filter(function (x) { return x.status === 'ready' && !x.flagOpen; });
    if (!list.length) { U.toast('確定できる明細がありません', 'error'); return; }
    var res = null;
    AU.act({
      title: list.length + '件を確定する', ok: '確定する', kind: 'ink', cls: 'a-referrals',
      text: '合わせて ' + U.yen(sum(list)) + '。確定すると、紹介した会員に「紹介報酬が確定しました」と知らせます。',
      defaultReason: '初回の決済から' + RF.holdDays + '日が過ぎ、返金・解約なし',
      run: function () {
        var errs = [], ids = {}, at = nowIso(), by = staffId();
        list.forEach(function (x) {
          if (x.live) { var r = R.confirmReward(x.id); if (!r.ok) errs.push(r.error); }
          else ids[x.id] = 1;
        });
        AD.db.update(function (s) { s.rewards.forEach(function (w) { if (ids[w.id] && !w.confirmedAt) { w.confirmedAt = at; w.confirmedBy = by; } }); });
        res = { ok: true, n: list.length - errs.length, errs: errs };
        return res;
      },
      audit: function () { return { action: 'reward_confirm', label: '紹介報酬を確定した', target: { type: 'rewards', id: 'confirm-' + AU.ymd(CLG.now()), name: list.length + '件' }, detail: U.yen(sum(list)) }; }
    }).then(function (r) {
      if (!r) return;
      if (o && o.clear) o.clear();
      U.toast(r.n + '件を確定しました' + (r.errs.length ? '（' + r.errs[0] + '）' : ''), r.errs.length ? 'error' : 'ok');
      after();
    });
  }
  function runClose() {
    var cy = cycle(), list = cy.confirmed.concat(cy.carried);
    if (!list.length) { U.toast('締める明細がありません', 'error'); return; }
    var add = cy.done.length > 0;
    AU.act({
      title: cy.label + 'を' + (add ? '追加で' : '') + '締める', ok: '締める', cls: 'a-referrals',
      text: '確定した ' + cy.confirmed.length + '件' + (cy.carried.length ? '・繰り越し ' + cy.carried.length + '件' : '') + '（' + U.yen(sum(list)) + '）を、' +
        U.fmtDate(cy.payAt, { noYear: true }) + 'の支払予定にします。' +
        (cy.ready.length ? '\n確定待ちの ' + cy.ready.length + '件は、確定してから追加で締められます。' : ''),
      defaultReason: cy.label + 'の締め',
      run: function () {
        var at = nowIso(), rec = { id: AD.db.uid('rc'), month: cy.key, closing: cy.closing.toISOString(), payAt: cy.payAt.toISOString(), at: at, by: staffId(),
          rowIds: list.map(function (x) { return x.id; }), count: list.length, total: sum(list), carried: cy.carried.length };
        // デモ会員の明細は会員ページの記録へ：R.closeMonth でその月の確定をまとめて支払予定に（会員ページの紹介の画面も「支払予定」になる）。
        // 繰り越し（前の締めから残った支払予定）は R.scheduleReward で支払日だけ直す
        var liveRows = list.filter(function (x) { return x.live; });
        if (liveRows.length) {
          var cm = R.closeMonth(cy.key, { payAt: rec.payAt }), done = {};
          if (cm && cm.ok) (cm.rows || []).forEach(function (id) { done[id] = 1; });
          liveRows.forEach(function (x) { if (!done[x.id]) R.scheduleReward(x.id, { payAt: rec.payAt }); });
        }
        // 締めた会員には、いくらをいつ振り込むかを知らせる（振り込めないときは、その理由と直す場所）
        if (liveRows.length) {
          var lp = payees(liveRows)[0];
          R.publishNotice({ target: 'member:' + AD.data.live().no, type: 'reward_confirmed',
            text: lp && lp.ok ? cy.label + 'の紹介報酬 ' + U.yen(lp.amount) + 'を' + U.fmtDate(cy.payAt, { noYear: true }) + 'に振り込みます'
              : cy.label + 'の紹介報酬 ' + U.yen(sum(liveRows)) + 'は、' + (lp ? lp.why : '振込先が未登録') + 'のため次の支払いに回ります',
            link: lp && lp.bankKey !== 'ok' ? '#/account?focus=bank' : '#/referral' });
        }
        AD.db.update(function (s) {
          (s.rewardCloses = s.rewardCloses || []).push(rec);
          // 締めた明細は支払予定（AD.data.rewards の状態も「支払予定」になる）。支払日はこの締めの支払日
          s.rewards.forEach(function (w) { if (rec.rowIds.indexOf(w.id) >= 0) { w.closedAt = at; w.closeId = rec.id; w.payAt = rec.payAt; } });
        });
        return { ok: true, rec: rec };
      },
      audit: function () { return { action: 'reward_close', label: '紹介報酬を締めた', target: { type: 'rewards', id: cy.key, name: cy.label }, detail: list.length + '件・' + U.yen(sum(list)) + '・支払日 ' + U.fmtShort(cy.payAt) }; },
      done: cy.label + 'を締めました。' + U.fmtShort(cy.payAt) + 'の支払予定です'
    }).then(function (r) { if (r) after(); });
  }
  function exportZengin(b) {
    var ps = payees(b.rows).filter(function (p) { return p.ok; });
    if (!ps.length) { U.toast('振り込める人がいません', 'error'); return; }
    var lines = zenginLines(ps, b.payAt), total = sum(ps);
    AU.act({
      title: '振込データを書き出す', ok: '書き出す', kind: 'ink', cls: 'a-referrals', wide: true, reason: false,
      text: '全銀協の総合振込の形式（Shift_JIS・1行120文字）。' + ps.length + '人・' + U.yen(total) + '・振込日 ' + U.fmtShort(b.payAt) + '。',
      html: '<pre class="rf-zg" aria-label="振込データの先頭">' + esc(lines.slice(0, 6).join('\n')) + (lines.length > 6 ? '\n…' : '') + '</pre>' +
        '<p class="rf-zg__note">口座番号は下4桁しか保管していないため、残りは0で埋めています。振込元の口座は調整中です。</p>',
      run: function () {
        saveBytes('zengin_' + AU.ymd(b.payAt).replace(/-/g, '') + '.txt', sjis(lines.join('\r\n') + '\r\n'));
        AD.db.update(function (s) { var c = (s.rewardCloses || []).filter(function (x) { return x.id === b.id; })[0]; if (c) { c.exportedAt = nowIso(); c.exportedBy = staffId(); } });
        return { ok: true };
      },
      audit: { action: 'reward_export', label: '振込データを書き出した', target: { type: 'rewards', id: b.id, name: b.label }, detail: ps.length + '人・' + U.yen(total) },
      done: '振込データを保存しました'
    }).then(function (r) { if (r) after(); });
  }
  function runPay(b) {
    var ps = payees(b.rows), okp = ps.filter(function (p) { return p.ok; }), ng = ps.filter(function (p) { return !p.ok; });
    var paidRows = [], ngRows = [];
    okp.forEach(function (p) { paidRows = paidRows.concat(p.rows); });
    ng.forEach(function (p) { ngRows = ngRows.concat(p.rows); });
    // 振り込める人がいない束は「次の締めに回す」だけ（押せないままだと、この束がずっと残るため）
    var none = !okp.length;
    AU.act({
      title: none ? '次の締めに回す' : '支払済にする', ok: none ? '次の締めに回す' : '支払済にする', kind: none ? 'ink' : '', cls: 'a-referrals',
      text: (none ? '振り込める人がいません。' : okp.length + '人・' + U.yen(sum(paidRows)) + 'を支払済にします。銀行で振込が済んでから押してください。') +
        (ng.length ? '\n繰り越し：' + ng.length + '人・' + U.yen(sum(ngRows)) + '（次の締めに入ります）' : ''),
      defaultReason: none ? '振込先が揃わないため繰り越し' : U.fmtShort(b.payAt) + 'の振込（' + b.label + '）',
      run: function () {
        var errs = [], ids = {}, at = nowIso(), by = staffId(), liveCarry = null;
        // デモ会員の明細：R.payMonth で束の月をまとめて支払済に（会員ページの紹介の画面も「支払済」）。月の違う明細が残れば1行ずつ。
        // 振込先がない・最低額に届かないと R.payMonth は払わずに繰り越す（{ ok:false, carried }。最低額のときは ym が翌月で、支払日も翌月に動く）
        // 振り込めない（振込先がない・最低額に届かない）ときも R.payMonth を呼ぶ：会員ページの明細が支払日を過ぎて支払済に見えないよう、繰り越しを書く。
        // 名義が違う（運営の確認で止めた）ときは会員ページに振込先があるので、支払日だけ次の支払日に動かす（R.scheduleReward）
        var livePaid = paidRows.filter(function (x) { return x.live; }), liveP = ps.filter(function (p) { return p.live; })[0];
        if (liveP && (liveP.ok || liveP.bankKey !== 'name')) {
          var ym = b.month || mKey(b.payAt), pm = R.payMonth(ym), paidLive = {}, carriedLive = {};
          if (pm && pm.ok) (pm.rows || []).forEach(function (id) { paidLive[id] = 1; });
          else if (pm && pm.carried) { pm.carried.forEach(function (id) { carriedLive[id] = 1; }); liveCarry = { n: pm.carried.length, error: pm.error || '', ym: pm.ym || null }; }
          livePaid.forEach(function (x) { if (paidLive[x.id] || carriedLive[x.id]) return; var r = R.payReward(x.id); if (!r.ok) errs.push(r.error); });
          if (liveCarry) paidRows = paidRows.filter(function (x) { return !carriedLive[x.id]; });
        } else if (liveP) {
          var nx = payDateOf(b.payAt).toISOString();
          liveP.rows.forEach(function (x) { if (x.live) R.scheduleReward(x.id, { payAt: nx }); });
          liveCarry = { n: liveP.rows.length, error: liveP.why, ym: mKey(nx) };
        }
        paidRows.forEach(function (x) { if (!x.live) ids[x.id] = 1; });
        AD.db.update(function (s) {
          s.rewards.forEach(function (w) { if (ids[w.id]) { w.paidAt = at; w.paidBy = by; } });
          var rec = { paidAt: at, paidBy: by, paidCount: paidRows.length - errs.length, paidTotal: sum(paidRows), carriedOut: ng.length };
          var c = (s.rewardCloses || []).filter(function (x) { return x.id === b.id; })[0];
          if (c) Object.assign(c, rec);
          else (s.rewardPays = s.rewardPays || {})[b.id] = Object.assign({ payAt: b.payAt, month: b.month }, rec);
        });
        return { ok: true, errs: errs, liveCarry: liveCarry };
      },
      audit: { action: 'reward_pay', label: none ? '紹介報酬を繰り越した' : '紹介報酬を支払った', target: { type: 'rewards', id: b.id, name: b.label },
        detail: (none ? '' : okp.length + '人・' + U.yen(sum(paidRows))) + (ng.length ? (none ? '' : '・') + '繰り越し ' + ng.length + '人・' + U.yen(sum(ngRows)) : '') }
    }).then(function (r) {
      if (!r) return;
      var le = r.liveCarry ? r.liveCarry.error : '';
      var lw = /未満/.test(le) ? U.yen(RF.minPayout) + '未満' : /振込先/.test(le) ? '振込先が未登録' : /名義/.test(le) ? '名義の確認が要る' : '';
      var lc = r.liveCarry ? '。' + AD.data.live().name + 'さんの分は翌月に繰り越し' + (lw ? '（' + lw + '）' : '') : '';
      U.toast(r.errs.length ? '一部を支払済にできませんでした（' + r.errs[0] + '）' : (none ? ng.length + '人を次の締めに回しました' : okp.length + '人を支払済にしました' + (ng.length ? '。' + ng.length + '人は次の締めに回ります' : '')) + lc, r.errs.length ? 'error' : 'ok');
      after();
    });
  }
  function voidRow(x) {
    AU.act({
      title: '明細を取り消す', ok: '取り消す', danger: true, cls: 'a-referrals',
      text: member(x.referrer).name + 'さんの紹介（' + (x.initial || '') + '.さん・' + x.month + 'か月目・' + U.yen(x.amount) + '）を取り消します。',
      reasons: ['紹介した方の決済が返金された', '紹介の条件に当たらない', '重複した明細'],
      run: function (reason) {
        if (x.live) {
          // デモ会員：会員ページの紹介の明細も「取消」になり、本人にお知らせが届く
          var r = R.voidReward(x.id, reason);
          if (!r || r.ok === false) return { ok: false, error: (r && r.error) || '取り消せませんでした' };
          return { ok: true, live: true };
        }
        AD.db.update(function (s) { s.rewards.forEach(function (w) { if (w.id === x.id) { w.voidAt = nowIso(); w.voidReason = reason; } }); });
        return { ok: true };
      },
      audit: { action: 'reward_void', label: '紹介報酬の明細を取り消した', target: { type: 'reward', id: x.id, name: member(x.referrer).name + '（' + x.referrer + '）' }, detail: U.yen(x.amount) }
    }).then(function (r) {
      if (!r) return;
      U.toast('明細を取り消しました' + (r.live ? '。' + member(x.referrer).name + 'さんの紹介の画面も「取消」になりました' : ''), 'ok');
      after();
    });
  }
  function resolveFlag(x, ok) {
    var mr = member(x.referrer), md = member(x.referred);
    AU.act({
      title: ok ? '問題なしにする' : '紹介として扱わない', ok: ok ? '問題なしにする' : '取り消す', danger: !ok, kind: 'ink', cls: 'a-referrals',
      text: mr.name + 'さん → ' + md.name + 'さん（' + x.flagLabel + '）。' + (ok ? '確定できるようになります。' : 'この紹介の、まだ払っていない明細をすべて取り消します。'),
      reasons: ok ? ['本人に確認した（家族のカードを借りている）', '別人と確認した'] : ['本人が自分を紹介していた', '確認の連絡に返事がない'],
      run: function (reason) {
        var at = nowIso(), by = staffId();
        AD.db.update(function (s) {
          (s.refFlags = s.refFlags || {})[x.referred] = { status: ok ? 'ok' : 'void', at: at, by: by, note: reason, kind: x.flagKind };
          if (!ok) s.rewards.forEach(function (w) { if (w.referred === x.referred && !w.paidAt && !w.voidAt) { w.voidAt = at; w.voidReason = '確認の結果、紹介として扱わない（' + reason + '）'; } });
          var ex = s.members[x.referred]; if (ex && ex.tags) ex.tags = ex.tags.filter(function (t) { return t !== '紹介の確認中'; });
        });
        return { ok: true };
      },
      audit: { action: ok ? 'referral_flag_ok' : 'referral_void', label: ok ? 'あやしい紹介を問題なしにした' : '紹介を取り消した', target: { type: 'member', id: x.referred, name: md.name }, detail: x.flagLabel + '・紹介した会員 ' + mr.name },
      done: ok ? '問題なしにしました' : '紹介を取り消しました'
    }).then(function (r) { if (r) after(); });
  }
  var BANK_MSG = '紹介報酬の振込先が、まだ登録されていません。会員ページの「アカウント」の振込先から登録してください。登録がないあいだ、報酬は次の支払いに繰り越します。';
  var NAME_MSG = '紹介報酬の振込先の名義が、ご本人の名前と違っていました。報酬はご本人名義の口座にだけお振り込みします。「アカウント」の振込先を直してください。';
  function contactBank(no, key) {
    var m = member(no), live = no === AD.data.live().no, text = key === 'name' ? NAME_MSG : BANK_MSG;
    AU.act({
      title: m.name + 'さんに連絡する', ok: '送る', kind: 'ink', cls: 'a-referrals',
      html: '<div class="pm-mail"><p class="pm-mail__h">' + (live ? '会員ページのメッセージ・メール' : 'メール・LINE') + '</p><div class="pm-mail__body">' + esc(m.name) + 'さん<br><br>' + esc(text) + '</div></div>',
      reason: 'optional', reasonLabel: 'メモ', defaultReason: key === 'name' ? '名義の違い' : '振込先の登録のお願い',
      run: function () {
        if (live) R.staffReply(text);
        AD.db.update(function (s) { (s.moneyContacts = s.moneyContacts || []).push({ id: AD.db.uid('mc'), kind: 'bank_' + key, no: no, at: nowIso(), by: staffId(), how: live ? 'メッセージ・メール' : 'メール・LINE' }); });
        return { ok: true };
      },
      audit: { action: 'bank_contact', label: '振込先のことで連絡した', target: { type: 'member', id: no, name: m.name }, detail: key === 'name' ? '名義が本人と違う' : '振込先が未登録' },
      done: m.name + 'さんに連絡しました'
    }).then(function (r) { if (r) after(); });
  }
  function exportStatements(year) {
    var list = rows().filter(function (x) { return x.status === 'paid' && x.paidAt && new Date(x.paidAt).getFullYear() === year; });
    var by = {};
    list.forEach(function (x) { (by[x.referrer] = by[x.referrer] || []).push(x); });
    var data = Object.keys(by).sort().map(function (no) {
      var m = member(no), rs = by[no], amt = sum(rs);
      return { no: no, name: m.realName || m.name, kana: m.kana, addr: m.area || '', amount: amt, count: rs.length, over: amt > 50000 };
    });
    AU.downloadCsv('支払調書の元_' + year, data, [
      { key: 'year', label: '年', value: function () { return year; } },
      { key: 'no', label: '会員番号' }, { key: 'name', label: '支払を受ける者の氏名' }, { key: 'kana', label: 'フリガナ' },
      { key: 'addr', label: '住所（都道府県・市区町村）' },
      { key: 'kind', label: '区分', value: function () { return '紹介料'; } },
      { key: 'detail', label: '細目', value: function () { return DATA.SITE.name + ' 紹介報酬'; } },
      { key: 'amount', label: '支払金額（円）' }, { key: 'tax', label: '源泉徴収税額（円）', value: function () { return 0; } },
      { key: 'count', label: '支払の回数' }, { key: 'over', label: '5万円を超える', value: function (r) { return r.over ? 'はい' : 'いいえ'; } }
    ]);
    AD.db.audit({ action: 'statement_export', label: '支払調書の元データを書き出した', target: { type: 'rewards', id: 'y' + year, name: year + '年' }, detail: data.length + '人' });
  }

  /* ============================================================
     表示
     ============================================================ */
  function whoRef(x) { return AU.who(x.referrer); }
  function referredCell(x) {
    return esc((x.initial || '') + '.さん') + (x.referred ? ' <span class="pm-muted num">' + esc(x.referred) + '</span>' : '');
  }
  function statusCell(x) {
    return AU.status('reward', x.status) + (x.flagOpen ? ' <span class="rf-flag">' + icon('alert', 'ico-s') + esc(x.flagLabel) + '</span>' : '');
  }

  function closeTab(ctx, list) {
    var cy = cycle(list), bs = batches(list);
    var readySum = sum(cy.ready), confSum = sum(cy.confirmed);
    var closable = cy.confirmed.length + cy.carried.length;
    var kpis = '<div class="ad-kpis pm-kpis">' +
      AU.kpi({ label: '確定待ち', value: U.num(cy.ready.length), unit: '件', sub: U.yen(readySum), href: '#/referrals?tab=rows&status=ready', tone: cy.ready.length ? 'warn' : '' }) +
      AU.kpi({ label: '確定（締めの前）', value: U.num(cy.confirmed.length), unit: '件', sub: U.yen(confSum) + (cy.carried.length ? '・繰り越し ' + cy.carried.length + '件' : '') }) +
      AU.kpi({ label: '保留（月末までに明ける）', value: U.num(cy.holdSoon.length), unit: '件', sub: '保留は全部で ' + cy.hold.length + '件', href: '#/referrals?tab=rows&status=hold' }) +
      AU.kpi({ label: '今月の取消', value: U.num(cy.voidNow.length), unit: '件', sub: '返金・' + RF.holdDays + '日以内の退会', href: '#/referrals?tab=rows&status=void' }) +
    '</div>';

    // 1. 確定待ち
    var readyTbl = AU.table({
      id: 'ready', rows: cy.ready, query: ctx.query, qp: 'rd', sort: 'confirmAt', label: '確定待ちの明細', search: null, pageSize: 25,
      columns: [
        AU.col.member('referrer', '紹介した会員', { key: 'who', main: true, value: function (x) { return member(x.referrer).name; }, html: whoRef }),
        { key: 'referred', label: '紹介された方', nowrap: true, value: function (x) { return (x.initial || '') + '.さん'; }, html: referredCell },
        { key: 'month', label: '回', align: 'r', nowrap: true, html: function (x) { return '<span class="num">' + x.month + '</span>か月目'; } },
        AU.col.date('at', '決済', { hide: 'sm' }),
        AU.col.date('confirmAt', '保留が明けた日', { dir: 'asc' }),
        AU.col.money('amount', '金額', { sort: false }),
        { key: 'acts', label: '', sort: false, csv: false, html: function (x) {
          return x.flagOpen ? '<span class="rf-flag">' + icon('alert', 'ico-s') + '確認が済むまで確定できません</span>'
            : '<button type="button" class="btn btn-ghost btn-s" data-rf-confirm="' + esc(x.id) + '"' + dis() + '>確定する</button>';
        } }
      ],
      select: canMoney(), bulk: canMoney() ? [{ id: 'confirm', label: 'まとめて確定する', icon: 'check', run: function (l, o) { confirmRows(l, o); } }] : null,
      rowLabel: function (x) { return member(x.referrer).name + 'の紹介'; },
      rowHref: function (x) { return hashWith({ row: x.id }); },
      csv: { name: '紹介報酬_確定待ち' }, empty: '確定待ちはありません。', cards: true
    });
    // 確定待ちがないときは、空の表ではなく「次に保留が明ける日」を書く
    var nextHold = cy.hold.slice().sort(function (a, b) { return new Date(a.confirmAt) - new Date(b.confirmAt); })[0];
    var nextN = nextHold ? cy.hold.filter(function (x) { return AU.ymd(x.confirmAt) === AU.ymd(nextHold.confirmAt); }).length : 0;
    var readyPanel = '<section class="rf-sec" id="rfReady" aria-labelledby="rfReadyH"><div class="rf-sec__head"><h2 class="rf-sec__ttl" id="rfReadyH">確定待ち<span class="num">' + cy.ready.length + '</span></h2>' +
      (cy.ready.length ? '<button type="button" class="btn btn-ink btn-s" data-rf-confirmall' + dis() + '>' + icon('check', 'ico-s') + 'すべて確定する</button>' : '') + '</div>' +
      (cy.ready.length ? '<p class="rf-sec__lead">初回の決済から' + RF.holdDays + '日たち、返金・解約がなかった明細です。</p>' + readyTbl
        : '<p class="rf-none">確定待ちはありません。' + (nextHold ? '次に保留が明けるのは <b class="num">' + esc(U.fmtShort(nextHold.confirmAt)) + '</b>（' + nextN + '件）です。' : '') + '</p>') + '</section>';

    // 2. あやしい紹介
    var flagPanel = cy.flags.length ? AU.panel({
      title: '確認が要る紹介', id: 'rfFlags', count: uniqBy(cy.flags, 'referred').length + '件', cls: 'rf-flags', flush: true,
      body: '<ul class="rf-flaglist">' + uniqBy(cy.flags, 'referred').map(function (x) {
        return '<li class="rf-flaglist__i"><div class="rf-flaglist__who">' + whoRef(x) + '<span class="rf-arrow" aria-hidden="true">→</span>' + AU.who(x.referred) + '</div>' +
          '<p class="rf-flaglist__why">' + icon('alert', 'ico-s') + '<b>' + esc(x.flagLabel) + '</b>' + esc(memoOf(x.referred)) + '</p>' +
          '<div class="pm-acts"><button type="button" class="btn btn-ghost btn-s" data-rf-flagok="' + esc(x.id) + '"' + dis() + '>問題なし</button>' +
          '<button type="button" class="btn btn-ghost btn-s pm-danger" data-rf-flagng="' + esc(x.id) + '"' + dis() + '>紹介として扱わない</button></div></li>';
      }).join('') + '</ul>'
    }) : '';

    // 3. 締め
    var done = cy.done, lastDone = done[done.length - 1];
    var closeBox = '<section class="rf-close" aria-labelledby="rfCloseH">' +
      '<div class="rf-close__main"><h2 class="rf-close__ttl" id="rfCloseH">' + esc(cy.label) + 'の締め</h2>' +
        '<p class="rf-close__meta">締め日 <b class="num">' + esc(U.fmtShort(cy.closing)) + '</b>・支払日 <b class="num">' + esc(U.fmtShort(cy.payAt)) + '</b>' +
          (lastDone ? '・<span class="pm-ok">' + esc(U.fmtShort(lastDone.at, true)) + 'に締めました（' + esc(AD.db.staffName(lastDone.by)) + '）</span>' : '') + '</p>' +
        '<p class="rf-close__sum"><span>' + (closable ? '締めの対象 <b class="num">' + closable + '</b>件・<b class="num">' + esc(U.yen(sum(cy.confirmed.concat(cy.carried)))) + '</b>' +
          (cy.carried.length ? '（うち繰り越し ' + cy.carried.length + '件）' : '') : (done.length ? '締めたあとに確定したものはありません。' : 'まだ締める明細がありません。')) + '</span>' +
          (cy.ready.length && closable ? '<span class="pm-warn">確定待ちの ' + cy.ready.length + '件は入りません</span>' : '') +
          (cy.waiting.length ? '<span>来月の締めに回した分 <b class="num">' + cy.waiting.length + '</b>件・<b class="num">' + esc(U.yen(sum(cy.waiting))) + '</b>（' +
            uniqBy(cy.waiting, 'referrer').length + '人）</span>' : '') + '</p></div>' +
      '<button type="button" class="btn ' + (bs.length ? 'btn-ink' : 'btn-primary') + '" data-rf-close' + (closable && canMoney() ? '' : ' disabled') + '>' + (done.length ? '追加で締める' : '締める') + '</button>' +
    '</section>';

    // 4. 支払い（締めた束ごと）
    var payPanels = bs.map(function (b) { return batchPanel(ctx, b); }).join('');

    return kpis + flagPanel + readyPanel + closeBox + payPanels;
  }
  function uniqBy(list, k) { var seen = {}; return list.filter(function (x) { if (seen[x[k]]) return false; seen[x[k]] = 1; return true; }); }
  function memoOf(no) { var ex = AD.db.state.members[no]; return ex && ex.memo ? '　' + ex.memo : ''; }

  function batchPanel(ctx, b) {
    var ps = payees(b.rows), okp = ps.filter(function (p) { return p.ok; }), ng = ps.filter(function (p) { return !p.ok; });
    var rec = b.rec, qp = 'b' + String(b.id).replace(/\W/g, '').slice(-5);
    var tbl = AU.table({
      id: 'pay-' + b.id, rows: ps, query: ctx.query, qp: qp, sort: 'no', label: b.label + 'の支払い', search: null, pageSize: 50,
      columns: [
        AU.col.member('no', '会員', { key: 'name', main: true, value: function (p) { return p.name; }, html: function (p) { return AU.who(p.no); } }),
        { key: 'count', label: '件数', align: 'r', sort: false, html: function (p) { return '<span class="num">' + p.count + '</span>件'; } },
        AU.col.money('amount', '金額', { sort: false }),
        { key: 'bank', label: '振込先', sort: false, value: function (p) { return bankText(p.bank); },
          html: function (p) { return p.bank ? '<span class="rf-bank">' + esc(p.bank.bank + ' ' + p.bank.branch) + '<span class="pm-muted num">' + esc((p.bank.kind || '普通') + ' ***' + (p.bank.tail || '')) + '</span></span>' : '<span class="pm-muted">―</span>'; } },
        { key: 'why', label: '確認', sort: false, value: function (p) { return p.ok ? '振り込める' : '繰り越し：' + p.why; },
          html: function (p) {
            if (p.ok) return '<span class="ad-st">振り込める</span>';
            // 折り返すときは「：」の後ろで（「未登 / 録」のように言葉の途中で割らない）
            return '<span class="pm-warn">' + icon('alert', 'ico-s') + '<span class="nw">繰り越し：</span><wbr><span class="rf-why">' + esc(p.why) + '</span></span>' +
              (p.bankKey !== 'ok' ? ' <button type="button" class="btn btn-text btn-s" data-rf-bankmsg="' + esc(p.no) + '" data-rf-key="' + esc(p.bankKey) + '"' + dis() + '>連絡する</button>' : '');
          } }
      ],
      rowClass: function (p) { return p.ok ? '' : 'is-warn'; },
      csv: { name: '紹介報酬_支払い_' + b.month }, empty: 'この支払いの明細はありません。', cards: true
    });
    var head = '<div class="rf-batch__head"><div><h2 class="rf-batch__ttl">' + esc(b.label) + 'の支払い</h2>' +
      '<p class="rf-batch__meta">支払日 <b class="num">' + esc(U.fmtDate(b.payAt, { noYear: true })) + '</b>・振り込む <b class="num">' + okp.length + '</b>人・<b class="num">' +
        esc(U.yen(sum(okp.reduce(function (a, p) { return a.concat(p.rows); }, [])))) + '</b>' +
        (ng.length ? '・<span class="pm-warn">繰り越し ' + ng.length + '人・' + esc(U.yen(sum(ng.reduce(function (a, p) { return a.concat(p.rows); }, [])))) + '</span>' : '') +
        (!okp.length ? '・振り込める人がいません' : '') +
        (rec && rec.exportedAt ? '・振込データ ' + esc(U.fmtShort(rec.exportedAt, true)) : '') + '</p></div>' +
      '<div class="pm-acts">' + (okp.length ? '<button type="button" class="btn btn-ghost btn-s" data-rf-zengin="' + esc(b.id) + '"' + dis() + '>' + icon('download', 'ico-s') + '振込データ（全銀）</button>' +
        '<button type="button" class="btn btn-primary btn-s" data-rf-pay="' + esc(b.id) + '"' + dis() + '>支払済にする</button>'
        : '<button type="button" class="btn btn-ink btn-s" data-rf-pay="' + esc(b.id) + '"' + dis() + '>次の締めに回す</button>') + '</div></div>';
    return '<section class="rf-batch" aria-label="' + esc(b.label + 'の支払い') + '">' + head + tbl + '</section>';
  }

  function rowsTab(ctx, list) {
    return AU.table({
      id: 'rewards', rows: list, query: ctx.query, sort: '-at', label: '紹介報酬の明細',
      search: { placeholder: '会員番号・名前', keys: ['referrer', 'who', 'referred'] },
      filters: [{ key: 'status', label: '状態', chips: true, options: [['', 'すべて'], ['hold', '保留'], ['ready', '確定待ち'], ['confirmed', '確定'], ['scheduled', '支払予定'], ['paid', '支払済'], ['void', '取消']] },
        { key: 'closing', label: '締めの月', options: [['', 'すべて']].concat(monthOptions(list)), match: function (x, v) { return mKey(x.closing) === v; } }],
      columns: [
        AU.col.date('at', '決済'),
        AU.col.member('referrer', '紹介した会員', { key: 'who', main: true, value: function (x) { return member(x.referrer).name; }, html: whoRef }),
        { key: 'referred', label: '紹介された方', nowrap: true, value: function (x) { return (x.initial || '') + '.さん'; }, html: referredCell, csv: function (x) { return (x.initial || '') + '.さん ' + (x.referred || ''); } },
        { key: 'month', label: '回', align: 'r', nowrap: true, html: function (x) { return '<span class="num">' + x.month + '</span>か月目'; } },
        AU.col.money('amount', '金額', { sort: false }),
        { key: 'status', label: '状態', nowrap: true, html: statusCell, csv: function (x) { return x.label + (x.flagOpen ? '（' + x.flagLabel + '）' : ''); } },
        AU.col.date('confirmAt', '確定できる日', { hide: 'md', dir: 'asc' }),
        { key: 'payAt', label: '支払日', hide: 'md', nowrap: true, dir: 'desc', value: function (x) { return x.status === 'void' ? '' : x.paidAt || x.payAt; },
          html: function (x) { return x.status === 'void' ? '<span class="pm-muted">―</span>' : '<span class="num">' + esc(U.fmtShort(x.paidAt || x.payAt)) + '</span>' + (x.carried && x.status !== 'paid' ? '<span class="pm-muted">繰り越し</span>' : ''); },
          csv: function (x) { return x.status === 'void' ? '' : AU.ymd(x.paidAt || x.payAt); } },
        { key: 'voidReason', label: '取消の理由', csvOnly: true },
        { key: 'note', label: '繰り越しの理由', csvOnly: true, value: function (x) { return x.carried && x.status !== 'paid' ? x.note || '' : ''; } }
      ],
      rowHref: function (x) { return hashWith({ row: x.id }); },
      rowClass: function (x) { return x.flagOpen ? 'is-warn' : ''; },
      select: canMoney(), bulk: canMoney() ? [{ id: 'confirm', label: '確定する', icon: 'check', run: function (l, o) { confirmRows(l, o); } }] : null,
      rowLabel: function (x) { return member(x.referrer).name + 'の紹介'; },
      csv: { name: '紹介報酬_明細' }, empty: 'まだ紹介報酬の明細はありません。'
    });
  }
  function monthOptions(list) {
    var seen = {}, out = [];
    list.forEach(function (x) { var k = mKey(x.closing); if (!seen[k]) { seen[k] = 1; out.push([k, mLabel(x.closing)]); } });
    return out.sort(function (a, b) { return a[0] < b[0] ? 1 : -1; });
  }

  function banksTab(ctx, list) {
    var by = {};
    list.forEach(function (x) { (by[x.referrer] = by[x.referrer] || []).push(x); });
    var data = Object.keys(by).sort().map(function (no) {
      var bc = bankCheck(no), m = member(no), rs = by[no];
      var owed = rs.filter(function (x) { return ['confirmed', 'scheduled', 'ready'].indexOf(x.status) >= 0; });
      var c = (AD.db.state.moneyContacts || []).filter(function (y) { return y.no === no && /^bank_/.test(y.kind); }).sort(function (a, b) { return new Date(b.at) - new Date(a.at); })[0];
      return { id: no, no: no, name: m.name, key: bc.key, label: bc.key === 'ok' ? '登録済み' : bc.key === 'none' ? '未登録' : '名義が違う', bank: bc.bank,
        at: bc.bank ? bc.bank.at : null, owed: sum(owed), owedN: owed.length, contactAt: c ? c.at : null, live: no === AD.data.live().no };
    });
    return '<p class="pm-lead">本人名義の口座にだけ振り込みます。</p>' + AU.table({
      id: 'banks', rows: data, query: ctx.query, qp: 'bk', sort: 'no', label: '振込先',
      search: { placeholder: '会員番号・名前・銀行', keys: ['no', 'name', 'bankText'] },
      filters: [{ key: 'key', label: '状態', chips: true, options: [['', 'すべて'], ['none', '未登録'], ['name', '名義が違う'], ['ok', '登録済み']] }],
      columns: [
        AU.col.member('no', '会員', { key: 'name', main: true, value: function (r) { return r.name; }, html: function (r) { return AU.who(r.no); } }),
        { key: 'label', label: '状態', nowrap: true, html: function (r) { return r.key === 'ok' ? '<span class="ad-st">登録済み</span>' : '<span class="pm-warn">' + icon('alert', 'ico-s') + esc(r.label) + '</span>'; } },
        { key: 'bankText', label: '振込先', sort: false, value: function (r) { return bankText(r.bank); },
          html: function (r) { return r.bank ? esc(r.bank.bank + ' ' + r.bank.branch) + ' <span class="pm-muted num">' + esc((r.bank.kind || '普通') + ' ***' + r.bank.tail) + '</span><br><span class="pm-muted">' + esc(r.bank.holder) + '</span>' : '<span class="pm-muted">―</span>'; } },
        AU.col.date('at', '登録した日', { hide: 'md' }),
        { key: 'owed', label: 'これから払う額', align: 'r', sort: false, html: function (r) { return r.owed ? '<span class="num">' + esc(U.yen(r.owed)) + '</span>' : '<span class="pm-muted">―</span>'; } },
        { key: 'contactAt', label: '連絡', nowrap: true, hide: 'sm', value: function (r) { return r.contactAt || ''; },
          html: function (r) { return r.contactAt ? '<span class="pm-muted">' + esc(U.relTime(r.contactAt)) + '</span>' : r.key === 'ok' ? '' : '<span class="pm-warn">まだ</span>'; } },
        { key: 'acts', label: '', sort: false, csv: false, html: function (r) { return r.key === 'ok' ? '' : '<button type="button" class="btn btn-ghost btn-s" data-rf-bankmsg="' + esc(r.no) + '" data-rf-key="' + esc(r.key) + '"' + dis() + '>連絡する</button>'; } }
      ],
      rowHref: function (r) { return '#/members/' + encodeURIComponent(r.no); },
      rowClass: function (r) { return r.key === 'ok' ? '' : 'is-warn'; },
      csv: { name: '紹介報酬_振込先' }, empty: '紹介報酬を受け取る会員はまだいません。'
    });
  }

  function historyTab(ctx, list) {
    // 締めの月ごと。記録のない月（デモのデータ）は、明細の確定・支払いから組み立てる
    var by = {};
    list.filter(function (x) { return x.status !== 'void' && x.status !== 'hold' && x.status !== 'ready'; }).forEach(function (x) {
      var k = mKey(x.closing); (by[k] = by[k] || []).push(x);
    });
    var recs = closes();
    var data = Object.keys(by).sort().reverse().map(function (k) {
      var rs = by[k], paid = rs.filter(function (x) { return x.status === 'paid'; }), mine = recs.filter(function (c) { return c.month === k; });
      var closedAt = mine.length ? mine[0].at : null, by2 = mine.length ? mine[0].by : null;
      var first = rs[0], cl = new Date(first.closing);
      if (!closedAt && new Date(cl.getTime() + DAY) <= CLG.now()) { var d = new Date(cl.getTime() + DAY); d.setHours(10, 0, 0, 0); closedAt = d.toISOString(); by2 = 'acct1'; }
      var payAt = mine.length ? mine[mine.length - 1].payAt : (first.payAt || payDateOf(cl).toISOString());
      var st = paid.length === rs.length ? 'paid' : closedAt ? 'scheduled' : 'confirmed';
      return { id: k, month: k, label: mLabel(cl), closedAt: closedAt, by: by2, count: rs.length, amount: sum(rs), paidCount: paid.length, paid: sum(paid), payAt: payAt, status: st,
        payees: uniqBy(rs, 'referrer').length, carried: rs.length - paid.length };
    });
    return AU.table({
      id: 'closes', rows: data, query: ctx.query, qp: 'h', sort: '-month', label: '締めの記録', search: null,
      columns: [
        { key: 'month', label: '締めの月', main: true, value: function (r) { return r.month; }, html: function (r) { return '<b>' + esc(r.label) + '</b>'; } },
        AU.col.when('closedAt', '締めた日時'),
        { key: 'by', label: '締めた人', hide: 'sm', value: function (r) { return r.by ? AD.db.staffName(r.by) : ''; },
          html: function (r) { return r.by ? esc(AD.db.staffName(r.by)) : '<span class="muted">―</span>'; } },
        { key: 'count', label: '件数', align: 'r', html: function (r) { return '<span class="num">' + r.count + '</span>件'; } },
        { key: 'payees', label: '人数', align: 'r', hide: 'sm', html: function (r) { return '<span class="num">' + r.payees + '</span>人'; } },
        AU.col.money('amount', '合計', { sort: false }),
        AU.col.date('payAt', '支払日'),
        { key: 'status', label: '状態', nowrap: true, html: function (r) {
          // 締め前はまだ何も済んでいないので、緑の札にせず文字だけ
          return (r.status === 'confirmed' ? '<span class="ad-st">締め前</span>' : AU.status('reward', r.status)) + (r.status !== 'paid' && r.paidCount ? ' <span class="pm-muted">' + r.paidCount + '/' + r.count + '件</span>' : '');
        }, csv: function (r) { return r.status === 'confirmed' ? '締め前' : AU.statusLabel('reward', r.status); } }
      ],
      rowHref: function (r) { return '#/referrals?tab=rows&closing=' + encodeURIComponent(r.month); },
      csv: { name: '紹介報酬_締めの記録' }, empty: 'まだ締めた月はありません。'
    });
  }

  /* ---------- 引き出し（?row=） ---------- */
  var dr = null, drFor = null, quiet = false;
  function drawerBody(x) {
    var m = member(x.referrer), bc = bankCheck(x.referrer);
    var tl = [{ at: x.at, text: '紹介した方（' + (x.initial || '') + '.さん）の' + x.month + 'か月目の決済' }];
    if (x.status === 'void') tl.push({ at: x.voidAt || x.at, text: '取消：' + (x.voidReason || ''), alert: true });
    else {
      tl.push({ at: x.confirmAt, text: '保留が明ける（' + RF.holdDays + '日）', future: new Date(x.confirmAt) > CLG.now() });
      if (x.confirmedAt || x.confirmedBy) tl.push({ at: x.confirmedAt || x.confirmAt, text: '確定' + (x.confirmedBy && AD.db.state.staff.some(function (s) { return s.id === x.confirmedBy; }) ? '（' + AD.db.staffName(x.confirmedBy) + '）' : '') });
      if (x.closedAt) tl.push({ at: x.closedAt, text: '締め（支払予定）' });
      tl.push(x.paidAt ? { at: x.paidAt, text: '支払い' + (x.paidBy ? '（' + AD.db.staffName(x.paidBy) + '）' : '') } : { at: x.payAt, text: '支払日', future: true });
    }
    return '<div class="rf-dr">' +
      '<div class="pm-dr__top"><div class="pm-dr__amt"><b class="num">' + esc(U.num(x.amount)) + '</b><small>円</small></div>' + AU.status('reward', x.status) + '</div>' +
      (x.flagKind ? '<p class="rf-dr__flag' + (x.flagOpen ? '' : ' is-done') + '">' + icon('alert', 'ico-s') + esc(x.flagLabel) +
        (x.flagRes ? '：' + (x.flagRes.status === 'ok' ? '問題なし' : '紹介として扱わない') + '（' + esc(AD.db.staffName(x.flagRes.by)) + '・' + esc(x.flagRes.note || '') + '）' : '：確認中') + '</p>' : '') +
      AU.kv([
        ['紹介した会員', AU.who(m, { size: 's' }), true],
        ['紹介された方', referredCell(x), true],
        ['回', x.month + 'か月目（' + (RF.model === 'once' ? '1回だけ' : '在籍中は毎月') + '）'],
        ['決済', U.fmtDate(x.at)],
        ['確定できる日', U.fmtDate(x.confirmAt)],
        ['支払日', x.status === 'void' ? '―' : U.fmtDate(x.paidAt || x.payAt) + (x.carried && x.note && x.status !== 'paid' ? '（' + x.note + '）' : '')],
        ['振込先', bc.bank ? bankText(bc.bank) + (bc.ok ? '' : '（' + bc.label + '）') : '未登録'],
        x.live ? ['記録のもと', '会員ページ（デモ会員）'] : null
      ]) +
      '<h3 class="rf-dr__h">経過</h3><ol class="pm-tl">' + tl.sort(function (a, b) { return new Date(a.at) - new Date(b.at); }).map(function (t) {
        return '<li class="pm-tl__i' + (t.alert ? ' is-alert' : '') + (t.future ? ' is-future' : '') + '"><time class="num" datetime="' + esc(t.at) + '">' + esc(U.fmtShort(t.at)) + '</time><span>' + esc(t.text) + '</span></li>';
      }).join('') + '</ol>' +
    '</div>';
  }
  function drawerFoot(x) {
    var b = '';
    if (x.flagOpen) b += '<button type="button" class="btn btn-ghost" data-rf-flagok="' + esc(x.id) + '"' + dis() + '>問題なし</button>';
    // 取り消せるのは、まだ払っていない明細（保留・確定待ち・確定・支払予定）。デモ会員の分は会員ページの明細も取消に（R.voidReward）
    if (['hold', 'ready', 'confirmed', 'scheduled'].indexOf(x.status) >= 0) b += '<button type="button" class="btn btn-ghost pm-danger" data-rf-void="' + esc(x.id) + '"' + dis() + '>取り消す</button>';
    if (x.status === 'ready' && !x.flagOpen) b += '<button type="button" class="btn btn-ink" data-rf-confirm="' + esc(x.id) + '"' + dis() + '>確定する</button>';
    var why = b && !canMoney() ? '<span class="pm-dr__why">' + esc(AU.whoCan('rewards') + 'だけ') + '</span>' : '';
    return '<button type="button" class="btn btn-soft" data-close>閉じる</button><span class="rf-dr__sp"></span>' + why + b;
  }
  function openDrawer(id) {
    var x = find(id);
    if (!x) { AD.app.setQuery({ row: null }, { replace: true }); U.toast('この明細は見つかりませんでした', 'error'); return; }
    drFor = id;
    dr = AU.drawer(drawerBody(x), { title: '紹介報酬の明細', foot: drawerFoot(x), cls: 'a-referrals rf-drawer',
      onClose: function () {
        dr = null; drFor = null;
        if (quiet) return;
        var r = AD.app.parse(); if (r.name === 'referrals' && r.query.row) AD.app.setQuery({ row: null }, { replace: true });
      } });
    dr.addEventListener('click', onAction);
  }
  function after() { if (dr) { quiet = true; dr.close(); quiet = false; } if (cur) cur.refresh(); }
  function syncDrawer(ctx) {
    var id = ctx.query.row || '';
    if (!id) { if (dr) { quiet = true; dr.close(); quiet = false; } return; }
    if (dr && drFor === id && dr.parentNode) return;
    if (dr) { quiet = true; dr.close(); quiet = false; }
    setTimeout(function () { if (AD.app.parse().query.row === id && !dr) openDrawer(id); }, 0);
  }

  function onAction(e) {
    var t = e.target, b;
    var any = t.closest('[data-rf-confirm],[data-rf-confirmall],[data-rf-close],[data-rf-zengin],[data-rf-pay],[data-rf-void],[data-rf-flagok],[data-rf-flagng],[data-rf-bankmsg],[data-rf-statements]');
    if (any && (any.disabled || !canMoney())) { if (!any.disabled) AU.need('rewards'); return; }
    if ((b = t.closest('[data-rf-confirm]'))) { var x = find(b.getAttribute('data-rf-confirm')); if (x) confirmRows([x]); return; }
    if ((b = t.closest('[data-rf-confirmall]'))) { confirmRows(cycle().ready); return; }
    if ((b = t.closest('[data-rf-close]'))) { if (!b.disabled) runClose(); return; }
    if ((b = t.closest('[data-rf-zengin]'))) { var bz = batches().filter(function (y) { return y.id === b.getAttribute('data-rf-zengin'); })[0]; if (bz) exportZengin(bz); return; }
    if ((b = t.closest('[data-rf-pay]'))) { var bp = batches().filter(function (y) { return y.id === b.getAttribute('data-rf-pay'); })[0]; if (bp) runPay(bp); return; }
    if ((b = t.closest('[data-rf-void]'))) { var xv = find(b.getAttribute('data-rf-void')); if (xv) voidRow(xv); return; }
    if ((b = t.closest('[data-rf-flagok]'))) { var xo = find(b.getAttribute('data-rf-flagok')); if (xo) resolveFlag(xo, true); return; }
    if ((b = t.closest('[data-rf-flagng]'))) { var xn = find(b.getAttribute('data-rf-flagng')); if (xn) resolveFlag(xn, false); return; }
    if ((b = t.closest('[data-rf-bankmsg]'))) { contactBank(b.getAttribute('data-rf-bankmsg'), b.getAttribute('data-rf-key')); return; }
    if ((b = t.closest('[data-rf-statements]'))) { exportStatements(CLG.now().getFullYear()); }
  }

  AD.screens.referrals = {
    title: '紹介報酬',
    render: function (ctx) {
      cur = ctx;
      var list = rows();
      var tab = ctx.query.tab || (ctx.query.status && ctx.query.status !== 'ready' ? 'rows' : 'close');
      if (['close', 'rows', 'banks', 'history'].indexOf(tab) < 0) tab = 'close';
      var cy = cycle(list);
      var bankNg = uniqBy(list.filter(function (x) { return ['ready', 'confirmed', 'scheduled'].indexOf(x.status) >= 0; }), 'referrer').filter(function (x) { return !bankCheck(x.referrer).ok; }).length;
      var tabs = AU.tabs([
        { id: 'close', label: '月末の締め', href: '#/referrals', n: cy.ready.length + uniqBy(cy.flags, 'referred').length || '', alert: cy.flags.length > 0 },
        { id: 'rows', label: '明細', href: '#/referrals?tab=rows', n: list.length },
        { id: 'banks', label: '振込先', href: '#/referrals?tab=banks', n: bankNg || '' },
        { id: 'history', label: '締めの記録', href: '#/referrals?tab=history' }
      ], tab, '紹介報酬の表示');
      var per = RF.model === 'once' ? '1人につき ' + U.yen(RF.onceAmount) + '（1回）' : '月額の' + Math.round(RF.rate * 100) + '%（' + U.yen(Math.round(DATA.SITE.price * RF.rate)) + '）を毎月';
      var body = tab === 'rows' ? rowsTab(ctx, list) : tab === 'banks' ? banksTab(ctx, list) : tab === 'history' ? historyTab(ctx, list) : closeTab(ctx, list);
      return '<div class="a-referrals">' +
        AU.head({ title: '紹介報酬', sub: per + '・1段だけ・保留' + RF.holdDays + '日・月末締め・翌月' + RF.payDay + '日払い・' + U.yen(RF.minPayout) + '未満は繰り越し',
          actions: '<button type="button" class="btn btn-ghost btn-s" data-rf-statements' + dis() + '>' + icon('download', 'ico-s') + '支払調書の元データ（' + CLG.now().getFullYear() + '年）</button>' }) +
        tabs + roleNote() + body + '</div>';
    },
    mount: function (root, ctx) {
      cur = ctx;
      syncDrawer(ctx);
      if (root.__boundReferrals) return;
      root.__boundReferrals = true;
      root.addEventListener('click', function (e) { if (e.target.closest('.a-referrals')) onAction(e); });
    }
  };
})();
