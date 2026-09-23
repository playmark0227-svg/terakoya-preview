/* ============================================================
   アカウント（#/account）と解約（#/account/cancel）
   ------------------------------------------------------------
   - プロフィール・通知・契約とお支払い・請求と領収書・ログアウト
     （スマホだけ、試作版バーの代わりの2つのボタン）
   - 解約は「アカウント → 解約の手続き → 解約する」の2回で終わる。
     引き止めは解約の画面1枚だけ（確認の窓を重ねない）。
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon;

  var PREFS = ['北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
    '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
    '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県',
    '三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県',
    '鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県',
    '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'];
  var REASONS = ['料金', '時間がない', '内容が合わない', '目的を達成した', 'その他'];

  /* 画面の中だけの状態。解約の直後かどうかで、完了画面の言い方を変える */
  var local = { justCanceled: false, reasons: [], sentReasons: [] };
  function resetLocal() { local.justCanceled = false; local.reasons = []; local.sentReasons = []; }
  /** 「直後」はこの画面にいるあいだだけ。よそへ移ったら、次に開いたときは「済んでいます」と言う */
  function markJustCanceled() {
    local.justCanceled = true;
    window.addEventListener('hashchange', function off() {
      local.justCanceled = false;
      window.removeEventListener('hashchange', off);
    });
  }
  /** 試作版の操作で別の画面へ移るとき。refresh() はスクロール位置を保つので、ここで上に戻す */
  function jump(hash) {
    location.hash = hash;
    CLG.app.refresh();
    try { window.scrollTo(0, 0); } catch (e) {}
  }

  /* ---------- 小さな道具 ---------- */
  function prevDay(d) { d = new Date(d); d.setDate(d.getDate() - 1); return d; }
  function endOfDay(d) { d = new Date(d); d.setHours(23, 59, 59, 999); return d; }
  function isEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }
  /** 開いていて見終えていない講座の、残りの本数と分数。
      R.unusedSummary().minutes は講座全体の長さなので、見た回を引いて数え直す */
  function remaining() {
    var r = { courses: 0, lessons: 0, minutes: 0 };
    DATA.COURSES.forEach(function (c) {
      var st = R.courseState(c);
      if (st.locked || st.completed) return;
      r.courses++;
      c.lessons.forEach(function (l) {
        if (R.lessonState(c, l.id) !== 'done') { r.lessons++; r.minutes += l.min; }
      });
    });
    return r;
  }
  /** 使える最後の日。期間の終わり（次の請求日）の前日 */
  function lastDay(p) { return prevDay(p.cancelAt || p.periodEnd); }
  function isoDay(d) { d = new Date(d); return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate()); }
  function addMonths(d, n) { d = new Date(d); var day0 = d.getDate(); d.setMonth(d.getMonth() + n); if (d.getDate() < day0) d.setDate(0); return d; }
  function stepDone(id) { return R.steps().some(function (s) { return s.id === id && s.done; }); }
  function stepXp(id) { var s = DATA.ONBOARDING.filter(function (x) { return x.id === id; })[0]; return s ? s.xp : 0; }
  function orEmpty(v, emptyText) { return v ? esc(v) : '<span class="muted">' + esc(emptyText || '未入力') + '</span>'; }
  /** 「北海道 旭川市」→ 都道府県と市区町村。都道府県が見つからなければ全部を市区町村側に */
  function splitArea(area) {
    area = String(area || '').replace(/　/g, ' ').trim();
    for (var i = 0; i < PREFS.length; i++) {
      if (area.indexOf(PREFS[i]) === 0) return { pref: PREFS[i], city: area.slice(PREFS[i].length).trim() };
    }
    return { pref: '', city: area };
  }

  /* ============================================================
     アカウント
     ============================================================ */
  function renderAccount(ctx) {
    var m = R.me(), p = R.plan(), canceling = p.status === 'canceling';
    local.justCanceled = false;
    return '<div class="scr-account">' +
      '<div class="page-head"><h1 class="page-ttl">アカウント</h1></div>' +
      profileCard(m) +
      '<section class="sec"><h2 class="sec-ttl">通知</h2>' + notifyList(m) + '</section>' +
      '<section class="sec"><h2 class="sec-ttl">契約とお支払い</h2>' + planCard(m, p, canceling, ctx.state) + '</section>' +
      '<section class="sec"><h2 class="sec-ttl">請求と領収書</h2>' + invoiceList() + '</section>' +
      '<div class="acc-bottom">' +
        '<button type="button" class="btn btn-ghost" data-acc="logout">ログアウト</button>' +
      '</div>' +
      protoBox() +
    '</div>';
  }

  function profileCard(m) {
    var needs = !stepDone('profile');
    return '<div class="card acc-prof">' +
      '<div class="acc-prof__head">' +
        U.avatar({ name: m.name, color: m.color }, 'l') +
        '<div class="acc-prof__who">' +
          (m.kana ? '<p class="acc-prof__kana">' + esc(m.kana) + '</p>' : '') +
          '<p class="acc-prof__name">' + esc(m.name) + '</p>' +
          '<p class="acc-prof__meta"><span class="mono">' + esc(m.id) + '</span>・' + esc(R.cohort()) + '</p>' +
        '</div>' +
      '</div>' +
      (needs ? '<p class="notice acc-prof__hint">地域といまのお仕事を入れてください（スタートガイド +' + stepXp('profile') + ' XP）。</p>' : '') +
      '<div class="acc-prof__body"><table class="kv acc-kv"><tbody>' +
        '<tr><th>住んでいる地域</th><td>' + orEmpty(m.area) + '</td></tr>' +
        '<tr><th>いまのお仕事</th><td>' + orEmpty(m.job) + '</td></tr>' +
        '<tr><th>やりたいこと</th><td>' + (m.goal ? U.nl2br(m.goal) : '<span class="muted">未入力</span>') + '</td></tr>' +
        '<tr><th>メールアドレス</th><td class="acc-break">' + orEmpty(m.email, '未登録') + '</td></tr>' +
      '</tbody></table></div>' +
      '<div class="card-foot acc-prof__foot">' +
        '<a class="btn btn-text" href="#/card">会員証を見る</a>' +
        '<button type="button" class="btn ' + (needs ? 'btn-primary' : 'btn-soft') + ' btn-s" data-acc="edit">編集する</button>' +
      '</div>' +
    '</div>';
  }

  function notifyList(m) {
    var mailOn = m.notifyMail !== false;
    var lineNote = m.lineLinked ? '連携済み：' + DATA.SITE.lineName : '未連携';
    return '<div class="list">' +
      '<label class="li acc-sw">' +
        '<span class="li__body"><span class="li__ttl">LINE</span>' +
          '<span class="li__sub">' + esc(lineNote) + '</span></span>' +
        '<span class="switch"><input type="checkbox" data-acc-sw="line" aria-label="LINEで通知を受け取る"' + (m.lineLinked ? ' checked' : '') + '><i></i></span>' +
      '</label>' +
      '<label class="li acc-sw">' +
        '<span class="li__body"><span class="li__ttl">メール</span>' +
          '<span class="li__sub acc-break">' + (m.email ? esc(m.email) : 'メールアドレス未登録') + '</span></span>' +
        '<span class="switch"><input type="checkbox" data-acc-sw="mail" aria-label="メールで通知を受け取る"' + (mailOn ? ' checked' : '') + '><i></i></span>' +
      '</label>' +
    '</div>';
  }

  function planCard(m, p, canceling, state) {
    var until = lastDay(p);
    var ref = state && state.referredBy;
    return '<div class="card acc-plan">' +
      '<div class="acc-plan__head">' +
        '<p class="acc-plan__name">月額会員</p>' +
        (canceling ? '<span class="tag tag-warn">解約予定</span>' : '<span class="tag tag-ok">有効</span>') +
      '</div>' +
      (canceling ?
        '<div class="notice notice-warn acc-plan__notice"><div>' + U.fmtDate(until) + 'で終了します。次の請求はありません。' +
          '<div class="acc-plan__undo"><button type="button" class="btn btn-ghost btn-s" data-acc="resume">解約を取り消す</button></div></div></div>' : '') +
      '<div class="acc-plan__body"><table class="kv acc-kv"><tbody>' +
        '<tr><th>月額</th><td>' + U.yen(p.price) + '（税込）</td></tr>' +
        (canceling ? '' :
          '<tr><th>次回のお支払い日</th><td>' + U.fmtDate(p.nextBill) + '</td></tr>') +
        '<tr><th>お支払い方法</th><td><div class="acc-pay">' +
          '<span class="num">' + orEmpty(p.card, '未登録') + '</span>' +
          '<button type="button" class="btn btn-text btn-s" data-acc="card">変更</button></div></td></tr>' +
        '<tr><th>更新</th><td>' + esc(DATA.SITE.billing) + '</td></tr>' +
        '<tr><th>入会日</th><td>' + U.fmtDate(m.joinedAt) + '（' + R.day() + '日目）</td></tr>' +
        (ref ? '<tr><th>紹介コード</th><td class="mono">' + esc(ref) + '</td></tr>' : '') +
      '</tbody></table></div>' +
      '<div class="card-foot acc-plan__foot">' +
        '<a class="acc-leave" href="#/account/cancel">' + (canceling ? '解約の状況' : '解約の手続き') + '</a>' +
      '</div>' +
    '</div>';
  }

  function invoiceList() {
    var list = R.invoices();
    if (!list.length) return '<div class="card card-pad acc-inv-empty">まだ請求はありません。</div>' + taxNote();
    return '<div class="list">' + list.map(function (x) {
      var paid = x.status === 'paid';
      return '<div class="li acc-inv">' +
        '<span class="li__body">' +
          '<span class="li__ttl">' + U.fmtDate(x.at) + '</span>' +
          '<span class="li__sub">月額会費　<span class="num">' + U.yen(x.amount) + '</span>（税込）　' +
            (paid ? '支払済' : '<b class="acc-inv__wait">お支払い待ち</b>') + '</span>' +
        '</span>' +
        '<span class="li__end"><button type="button" class="btn btn-ghost btn-s" data-acc="receipt" data-id="' + esc(x.id) + '">' +
          icon('download', 'ico-s') + '領収書</button></span>' +
      '</div>';
    }).join('') + '</div>' + taxNote();
  }
  function taxNote() {
    return '<p class="acc-hint">会費を経費にできるかは、<a href="#/perks?tab=experts">提携の税理士</a>に相談できます（初回30分無料）。</p>';
  }

  /** スマホでは右下の試作版バーが出ないので、同じ2つをここに置く（パソコンでは出さない） */
  function protoBox() {
    return '<div class="acc-proto">' +
      '<span>試作版</span>' +
      '<button type="button" data-acc="fresh">入会したての状態で見る</button>' +
      '<button type="button" data-acc="reset">デモを最初から</button>' +
    '</div>';
  }

  /* ---------- プロフィールの編集 ---------- */
  function openEditor() {
    if (document.querySelector('.acc-edit')) return;   // 続けて押しても窓は1枚
    var m = R.me(), a = splitArea(m.area);
    // 窓は body の直下に出るので、画面の CSS が効くように .scr-account で包む
    var box = U.modal('<div class="scr-account acc-edit">' +
      '<h3 class="modal__ttl">プロフィールを編集</h3>' +
      '<p class="sub acc-form__lead">お名前・地域・お仕事はほかの会員にも表示されます。メールアドレスは表示されません。</p>' +
      '<form class="acc-form" novalidate>' +
        '<label class="field"><span>お名前</span>' +
          '<input class="input" name="name" autocomplete="name" maxlength="30" value="' + esc(m.name) + '"></label>' +
        '<label class="field"><span>ふりがな</span>' +
          '<input class="input" name="kana" maxlength="40" placeholder="例：たかはし さくら" value="' + esc(m.kana) + '"></label>' +
        '<div class="field"><span>住んでいる地域</span>' +
          '<div class="acc-area">' +
            '<select class="select" name="pref" aria-label="都道府県"><option value="">都道府県</option>' +
              PREFS.map(function (x) { return '<option' + (x === a.pref ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') +
            '</select>' +
            '<input class="input" name="city" maxlength="30" aria-label="市区町村" placeholder="市区町村（例：旭川市）" value="' + esc(a.city) + '">' +
          '</div></div>' +
        '<label class="field"><span>いまのお仕事</span>' +
          '<input class="input" name="job" maxlength="40" placeholder="例：会社員（事務）・2児の母" value="' + esc(m.job) + '"></label>' +
        '<label class="field"><span>やりたいこと</span>' +
          '<textarea class="textarea" name="goal" maxlength="120" rows="3" placeholder="例：動画編集を覚えて、在宅の仕事を1件受ける">' + esc(m.goal) + '</textarea></label>' +
        '<label class="field"><span>メールアドレス</span>' +
          '<input class="input" name="email" type="email" inputmode="email" autocomplete="email" maxlength="80" placeholder="例：name@example.com" value="' + esc(m.email) + '"></label>' +
        '<p class="acc-form__err" role="alert"></p>' +
        '<div class="modal__foot"><button type="button" class="btn btn-soft" data-close>閉じる</button>' +
          '<button type="submit" class="btn btn-primary">保存する</button></div>' +
      '</form></div>');
    var form = box.querySelector('form');
    function field(n) { return form.querySelector('[name="' + n + '"]'); }
    function v(n) { return String(field(n).value || '').replace(/　/g, ' ').replace(/\s+/g, ' ').trim(); }
    function fail(n, msg) { form.querySelector('.acc-form__err').textContent = msg; field(n).focus(); }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = v('name'), email = v('email').replace(/\s/g, '');
      if (!name) { fail('name', 'お名前を入れてください。'); return; }
      if (email && !isEmail(email)) { fail('email', 'メールアドレスの形を確かめてください（例：name@example.com）。'); return; }
      var mailChanged = email !== (m.email || '');
      var goal = String(field('goal').value || '').trim();
      var result = R.saveProfile({
        name: name, kana: v('kana'), area: [v('pref'), v('city')].filter(Boolean).join(' '), job: v('job'), goal: goal, email: email
      });
      box.close();
      if (result) CLG.app.reward(result);
      else U.toast(mailChanged && email ? '保存しました。新しいアドレスに確認のメールを送ります' : '保存しました', 'ok');
      CLG.app.refresh();
    });
  }

  /* ---------- 領収書（印刷できる1枚のHTML） ---------- */
  function receiptHtml(inv) {
    var m = R.me(), site = DATA.SITE, amount = inv.amount, tax = Math.floor(amount * 10 / 110);
    var from = new Date(inv.at), to = prevDay(addMonths(from, 1));
    var nameFull = site.name + (site.nameJa ? '（' + site.nameJa + '）' : '');
    return '<!doctype html>\n<html lang="ja"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>領収書 ' + esc(isoDay(inv.at)) + '｜' + esc(site.name) + '</title>' +
      '<style>' +
        '*{box-sizing:border-box}body{margin:0;background:#f3f2ef;color:#1d1b18;font-family:-apple-system,"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic",Meiryo,sans-serif;line-height:1.7}' +
        '.sheet{max-width:720px;margin:32px auto;background:#fff;padding:48px 52px;border:1px solid #e7e3dc}' +
        '.top{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;flex-wrap:wrap}' +
        'h1{margin:0;font-size:26px;letter-spacing:.02em;font-weight:800}' +
        '.meta{margin:0;font-size:13px;display:grid;grid-template-columns:auto auto;gap:2px 14px;color:#55514a}.meta dt{color:#8b867d}.meta dd{margin:0}' +
        '.to{margin:36px 0 0;font-size:20px;border-bottom:1px solid #1d1b18;padding-bottom:6px;display:inline-block;min-width:60%}.to small{font-size:15px;margin-left:12px}' +
        '.amount{margin:28px 0 0;background:#faf9f7;border:1px solid #e7e3dc;padding:18px 22px;display:flex;align-items:baseline;gap:18px;flex-wrap:wrap}' +
        '.amount span{font-size:13px;color:#55514a}.amount b{font-size:32px;letter-spacing:.02em;font-variant-numeric:tabular-nums}.amount small{font-size:13px;color:#55514a}' +
        '.for{margin:18px 0 0;font-size:14px}.nw{white-space:nowrap}' +
        'table{width:100%;border-collapse:collapse;margin-top:26px;font-size:13.5px}th,td{text-align:left;padding:9px 0;border-bottom:1px solid #e7e3dc;vertical-align:top}th{width:9em;color:#8b867d;font-weight:500}' +
        '.issuer{margin-top:34px;display:flex;justify-content:flex-end}.issuer div{font-size:13.5px;min-width:260px}.issuer b{font-size:15px}' +
        '.note{margin-top:30px;font-size:11.5px;color:#8b867d;border-top:1px dashed #d6d1c7;padding-top:12px}' +
        '.print{margin-top:20px;text-align:center}.print button{font:inherit;font-size:14px;font-weight:700;padding:10px 22px;border-radius:10px;border:0;background:#1d1b18;color:#fff;cursor:pointer}' +
        '@media (max-width:600px){.sheet{margin:0;padding:28px 20px;border:0}h1{font-size:24px}.amount b{font-size:26px}}' +
        '@page{size:A4;margin:16mm}@media print{body{background:#fff}.sheet{margin:0;border:0;padding:0;max-width:none}.print{display:none}}' +
      '</style></head><body><main class="sheet">' +
        '<div class="top"><h1>領収書</h1>' +
          '<dl class="meta"><dt>番号</dt><dd>' + esc(inv.id) + '</dd><dt>発行日</dt><dd>' + esc(U.fmtDate(CLG.now(), { wd: false })) + '</dd></dl></div>' +
        '<p class="to">' + esc(m.name) + '<small>様</small></p>' +
        '<div class="amount"><span>金額</span><b>' + esc(U.yen(amount)) + '-</b><small>（税込）</small></div>' +
        '<p class="for">但し　' + esc(site.name) + ' 月額会費として<br>上記の金額を正に領収いたしました。</p>' +
        '<table><tbody>' +
          '<tr><th>お支払い日</th><td>' + esc(U.fmtDate(inv.at, { wd: false })) + '</td></tr>' +
          '<tr><th>対象期間</th><td><span class="nw">' + esc(U.fmtDate(from, { wd: false })) + ' 〜</span> <span class="nw">' + esc(U.fmtDate(to, { wd: false })) + '</span></td></tr>' +
          '<tr><th>内訳</th><td>10%対象　' + esc(U.yen(amount)) + '<span class="nw">（うち消費税 ' + esc(U.yen(tax)) + '）</span></td></tr>' +
          '<tr><th>お支払い方法</th><td>クレジットカード' + (m.card ? '（' + esc(m.card) + '）' : '') + '</td></tr>' +
          '<tr><th>会員ID</th><td>' + esc(m.id) + '</td></tr>' +
        '</tbody></table>' +
        '<div class="issuer"><div><b>' + esc(nameFull) + '</b><br>発行者：' + esc(site.company) + '<br>登録番号：登録予定</div></div>' +
        '<p class="note">試作版の見本です。領収書としては使えません。</p>' +
        '<div class="print"><button type="button" onclick="window.print()">印刷する</button></div>' +
      '</main></body></html>';
  }

  /* ============================================================
     解約（引き止めはこの1画面だけ）
     ============================================================ */
  function renderCancel(ctx) {
    var p = R.plan();
    var head = '<nav class="crumb" aria-label="現在地"><a href="#/account">アカウント</a>' + U.chevron() + '<span>解約</span></nav>' +
      '<div class="page-head"><h1 class="page-ttl">解約の手続き</h1></div>';
    if (p.status === 'canceling') return '<div class="scr-account acc-cancel">' + head + doneView(p) + '</div>';

    var until = lastDay(p), u = R.unusedSummary(), left = remaining();
    // 予約中でも、使える最後の日より後のイベントには出られない。先に伝える
    var lateBooked = R.myUpcoming().filter(function (e) { return new Date(e.at) > endOfDay(until); }).length;
    var rows = [];
    if (left.courses > 0) rows.push('<tr><th>見終えていない講座</th><td>' + left.courses + '講座（残り' + left.lessons + '本・' + U.num(left.minutes) + '分）</td></tr>');
    if (u.events > 0) rows.push('<tr><th>これからのイベント</th><td>' + u.events + '件' +
      (lateBooked ? '<br><span class="acc-warn">予約中のうち' + lateBooked + '件は' + U.fmtDate(until, { noYear: true }) + 'より後のため、参加できません。</span>' : '') + '</td></tr>');
    // 紹介の報酬は引き止めの理由に使わない（会員資格と紹介収入を結びつけないため）

    return '<div class="scr-account acc-cancel">' + head +
      '<div class="card acc-cancel__lead">' +
        '<p class="acc-cancel__until"><b>' + U.fmtDate(until) + '</b>まで使えて、その日で終了します。</p>' +
        '<p>' + U.fmtDate(p.periodEnd, { noYear: true }) + '以降の請求はありません。途中解約の返金・違約金もありません。</p>' +
      '</div>' +
      (rows.length ? '<section class="sec"><h2 class="sec-ttl">まだ使っていないもの</h2>' +
        '<div class="card acc-cancel__left"><table class="kv acc-kv"><tbody>' + rows.join('') + '</tbody></table></div>' +
      '</section>' : '') +
      '<section class="sec"><h2 class="sec-ttl">解約の理由（任意）</h2>' +
        '<div class="chips" role="group" aria-label="解約の理由">' + REASONS.map(function (r) {
          var on = local.reasons.indexOf(r) >= 0;
          return '<button type="button" class="chip' + (on ? ' is-on' : '') + '" aria-pressed="' + on + '" data-acc="reason" data-v="' + esc(r) + '">' + esc(r) + '</button>';
        }).join('') + '</div>' +
      '</section>' +
      '<div class="acc-cancel__act">' +
        '<a class="btn btn-soft btn-l" href="#/account">戻る</a>' +
        '<button type="button" class="btn btn-danger btn-l" data-acc="cancel">解約する</button>' +
      '</div>' +
    '</div>';
  }

  /** 解約を受け付けたあと（押した直後と、あとから開いたときで言い方を変える） */
  function doneView(p) {
    var until = lastDay(p), just = local.justCanceled;
    return '<div class="card acc-done">' +
      '<h2 class="acc-done__ttl">' + (just ? '解約を受け付けました' : '解約の手続きは済んでいます') + '</h2>' +
      (just ? '<p class="acc-done__msg">確認のメールを送りました。' +
        (local.sentReasons.length ? '理由の回答もありがとうございました。' : '') + '</p>' : '') +
      '<table class="kv acc-kv acc-done__kv"><tbody>' +
        '<tr><th>使える最後の日</th><td>' + U.fmtDate(until) + '</td></tr>' +
        '<tr><th>次回のお支払い</th><td>なし</td></tr>' +
        '<tr><th>返金・違約金</th><td>なし</td></tr>' +
        '<tr><th>取り消し</th><td>' + U.fmtDate(until, { noYear: true }) + 'までできます</td></tr>' +
      '</tbody></table>' +
      '<div class="acc-done__act">' +
        '<button type="button" class="btn btn-ghost" data-acc="resume-go">解約を取り消す</button>' +
        '<a class="btn btn-text" href="#/account">アカウントに戻る</a>' +
      '</div>' +
    '</div>';
  }

  /* ============================================================
     押したときの動き
     ============================================================ */
  function onClick(e, ctx) {
    var b = e.target.closest('[data-acc]');
    if (!b) return;
    var act = b.getAttribute('data-acc');

    if (act === 'edit') openEditor();
    else if (act === 'card') U.toast('本番では Stripe のカード変更画面が開きます');
    else if (act === 'receipt') {
      var inv = R.invoices().filter(function (x) { return x.id === b.getAttribute('data-id'); })[0];
      if (!inv) return;
      U.download('領収書_' + isoDay(inv.at) + '.html', receiptHtml(inv), 'text/html');
      U.toast('領収書をダウンロードしました', 'ok');
    }
    else if (act === 'resume') {
      CLG.app.reward(R.resumePlan());
      U.toast('解約を取り消しました', 'ok');
      ctx.refresh();
    }
    else if (act === 'resume-go') {
      CLG.app.reward(R.resumePlan());
      local.justCanceled = false;
      U.toast('解約を取り消しました', 'ok');
      ctx.go('#/account');
    }
    else if (act === 'reason') {
      var v = b.getAttribute('data-v'), i = local.reasons.indexOf(v);
      if (i >= 0) local.reasons.splice(i, 1); else local.reasons.push(v);
      b.classList.toggle('is-on', i < 0);
      b.setAttribute('aria-pressed', String(i < 0));
    }
    else if (act === 'cancel') {
      // 確認の窓は出さない（2回の操作で終わらせるため）
      CLG.app.reward(R.cancelPlan());
      markJustCanceled();
      local.sentReasons = local.reasons.slice();
      local.reasons = [];
      ctx.refresh();
      try { window.scrollTo(0, 0); } catch (err) {}
    }
    else if (act === 'reset') {
      U.confirmBox('デモを最初からにする', '高橋さくらさん（入会24日目）の状態に戻します。この試作版で操作した内容は消えます。', '最初からにする').then(function (ok) {
        if (!ok) return;
        CLG.store.resetDemo(true);
        resetLocal();
        jump('#/home');
        U.toast('デモを最初の状態に戻しました');
      });
    }
    else if (act === 'fresh') {
      U.confirmBox('入会したての状態で見る', '「山田 はな」さんが今日入会した、という状態で会員ページを開きます。\n元に戻すときは「デモを最初から」を押してください。', '入会1日目で見る').then(function (ok) {
        if (!ok) return;
        CLG.store.startFresh({ name: '山田 はな' });
        resetLocal();
        jump('#/start');
      });
    }
    else if (act === 'logout') {
      CLG.store.logout();
      resetLocal();
      jump('');
    }
  }

  function onChange(e, ctx) {
    var sw = e.target.closest('[data-acc-sw]');
    if (!sw) return;
    var on = sw.checked, kind = sw.getAttribute('data-acc-sw'), result;
    if (kind === 'line') {
      result = R.linkLine(on);
      U.toast(on ? 'LINEと連携しました' : 'LINEの通知を止めました');
    } else {
      result = R.saveProfile({ notifyMail: on });
      U.toast(on ? 'メールの通知をオンにしました' : 'メールの通知を止めました');
    }
    CLG.app.reward(result);
    // スイッチが動き終わってから描き直す（すぐだと動きが見えない）
    setTimeout(function () { ctx.refresh(); }, 220);
  }

  CLG.screens = CLG.screens || {};
  CLG.screens.account = {
    title: function (ctx) { return ctx.params[0] === 'cancel' ? '解約' : 'アカウント'; },
    render: function (ctx) {
      return ctx.params[0] === 'cancel' ? renderCancel(ctx) : renderAccount(ctx);
    },
    mount: function (root, ctx) {
      // 描くたびに中身は新しくなるので、新しい要素に付ければ二重にならない
      var el = root.querySelector('.scr-account');
      if (!el) return;
      el.addEventListener('click', function (e) { onClick(e, ctx); });
      el.addEventListener('change', function (e) { onChange(e, ctx); });
    }
  };
})();
