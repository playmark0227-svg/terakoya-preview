/* ============================================================
   アカウント（#/account）と解約（#/account/cancel）
   ------------------------------------------------------------
   - アカウント：プロフィール・契約とお支払い・請求と領収書・ログインとセキュリティ・
     通知（種類 × LINE／メール）・ミュートしている人（いるときだけ）・振込先・記録の書き出しと削除・ホーム画面に追加・ログアウト。
     契約が「有効」でないとき（解約予定・終了・支払いエラー・休会中）は、契約の欄をいちばん上に出す。
   - #/account?focus=card|plan|invoices|notify|password|email|bank（ほかに profile・line・sessions・mutes・data）：
     その場所へスクロールして焦点を置き、短く目印を付ける。描き直しで同じ場所へ飛ばないよう、URL からは外す。
   - 請求の行：支払済（領収書を保存）・お支払いエラー・予定・返金（R.refundInvoice。返金の日と額を2行目に書く。
     全額は「返金済み」の札で領収書なし、一部は領収書を残す。領収書は返金のあとの額で、返金の行を足す）。
   - ミュート中の人（R.mutes）がいるときだけ、その欄を出して「ミュートをやめる」（R.unmutePerson・元に戻せる）。
   - 記録の書き出し・削除の申込みは R.requestData / R.dataRequests / R.cancelDataRequest に残す（運営画面の一覧に出る）。
     書き出しは試作版では数秒で「できた」にする（運営画面が開いていれば運営が済みにするのを待つ）。
   - LINE の連携は、スタートガイドと同じ窓（CLG.screens.start.runStep('line')）。
   - 解約は「アカウント → 解約の手続き → 解約する」の2回で終わる。理由は R.cancelPlan({ reasons }) に渡す（運営画面の集計）。
     引き止めは解約の画面1枚だけ（確認の窓を重ねない）。休会は SITE.allowPause が true のときだけ出す。
     終わる日は R.plan().cancelEnd（有効・支払いエラーは次の請求日、休会中は休会が明ける日）。
     取り消し（R.resumePlan）は、ふつうの解約予定と、支払いエラーのままの解約（plan().failedAt がある解約予定）。
     後者は取り消すと支払いエラー（同じ期限）に戻り、カードを更新すると払える（R.updateCard は解約予定のままでも払い直す）。
     休会中の解約は、取り消すと休会も終わって請求が始まるので、相談・メッセージで運営が受ける。
   - 契約の欄の知らせは、骨組みの帯（支払いエラー・休会・終了）と同じ文を出さない。帯にないこと（どの請求か・止まっているもの・記録の期限）と押すものだけ。
   - 押すものは data-acc-<何>="<値>"（骨組みが document 全体で拾う名前（§5-4）とは分ける）。
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon, jp = U.jp;
  var SITE = DATA.SITE;
  var cur = null;                                   // mount で受け取った ctx

  var PREFS = ['北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
    '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
    '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県',
    '三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県',
    '鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県',
    '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'];
  var REASONS = ['料金', '時間がない', '内容が合わない', '目的を達成した', 'その他'];
  var VIS = [['city', '市区町村まで'], ['pref', '都道府県だけ'], ['none', '出さない']];
  /* 契約の状態の札。1枚のカードに1つだけ */
  var PLAN_TAG = { active: 'tag-ok', canceling: 'tag-warn', ended: 'tag-line', past_due: 'tag-accent', paused: 'tag-indigo' };
  /* ?focus= の名前 → 動かす先の id */
  var FOCUS = { profile: 'acc-profile', plan: 'acc-plan', card: 'acc-plan', invoices: 'acc-invoices', security: 'acc-security',
    email: 'acc-email', password: 'acc-password', sessions: 'acc-sessions', notify: 'acc-notify', line: 'acc-line',
    mutes: 'acc-mutes', bank: 'acc-bank', data: 'acc-data' };
  var EXPORT_DAYS = 7;       // 書き出したファイルを保存できる日数
  var DELETE_DAYS = 30;      // 会員期間が終わってから削除するまでの日数
  var EXPORT_WAIT = 2500;    // 試作版：書き出しの受付から「できた」にするまで

  /* 画面の中だけの状態。
     justCanceled：解約を押した直後かどうか（完了画面の言い方を変える。よそへ移ったら戻す）
     申込み（書き出し・削除）は R.requestData に残すので、ここには持たない */
  var local = { justCanceled: false, reasons: [], sentReasons: [], pauseMonths: 1, invAll: false };
  function resetLocal() { local.justCanceled = false; local.reasons = []; local.sentReasons = []; local.pauseMonths = 1; local.invAll = false; }
  function markJustCanceled() {
    local.justCanceled = true;
    window.addEventListener('hashchange', function off() {
      local.justCanceled = false;
      window.removeEventListener('hashchange', off);
    });
  }

  /* ---------- 小さな道具 ---------- */
  function now() { return CLG.now(); }
  function prevDay(d) { d = new Date(d); d.setDate(d.getDate() - 1); return d; }
  function plusDays(d, n) { d = new Date(d); d.setDate(d.getDate() + n); return d; }
  function endOfDay(d) { d = new Date(d); d.setHours(23, 59, 59, 999); return d; }
  function isoDay(d) { d = new Date(d); return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate()); }
  /** 9月2日（今年でないものは年も付ける。領収書のボタンの名前が年をまたいで重ならないように） */
  function jaMD(d) { d = new Date(d); return (thisYear(d) ? '' : d.getFullYear() + '年') + (d.getMonth() + 1) + '月' + d.getDate() + '日'; }
  function thisYear(d) { return new Date(d).getFullYear() === now().getFullYear(); }
  /** 詳細の日付。今年なら年を省く */
  function day(d, o) { o = o || {}; return U.fmtDate(d, { noYear: o.year ? false : thisYear(d), wd: o.wd }); }
  function stepDone(id) { return R.steps().some(function (s) { return s.id === id && s.done; }); }
  function stepXp(id) { var s = DATA.ONBOARDING.filter(function (x) { return x.id === id; })[0]; return s ? s.xp : 0; }
  function orEmpty(v, emptyText) { return v ? esc(v) : '<span class="muted">' + esc(emptyText || '未入力') + '</span>'; }
  function kvRow(k, v) { return '<tr><th scope="row">' + esc(k) + '</th><td>' + v + '</td></tr>'; }
  function norm(s) { return String(s == null ? '' : s).replace(/　/g, ' ').replace(/\s+/g, ' ').trim(); }
  /** 「北海道 旭川市」→ 都道府県と市区町村。都道府県が見つからなければ全部を市区町村側に */
  function splitArea(area) {
    area = norm(area);
    for (var i = 0; i < PREFS.length; i++) {
      if (area.indexOf(PREFS[i]) === 0) return { pref: PREFS[i], city: area.slice(PREFS[i].length).trim() };
    }
    return { pref: '', city: area };
  }
  /** 公開範囲で切った地域（R.person と同じ切り方。見せる例に使う） */
  function areaFor(area, vis) {
    area = norm(area);
    if (!area || vis === 'none') return '';
    return vis === 'city' ? area : area.split(' ')[0];
  }
  /** 開いていて見終えていない講座の、残りの本数と分数 */
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
  /** 解約の手続きが済んでいるか（休会中に解約した人は、休会のまま明ける日で終わる） */
  function canceled(p) { return p.status === 'canceling' || (p.status === 'paused' && !!p.cancelAt); }
  /** スマホ（LINE のアプリで連携する端末）か。スタートガイドの LINE の窓と同じ決め方 */
  function phoneLike() {
    try { return window.matchMedia('(max-width: 640px), (pointer: coarse)').matches; } catch (e) { return false; }
  }
  function standalone() {
    try { return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches; } catch (e) { return false; }
  }

  /* ---------- 記録の書き出し・削除の申込み（R.requestData に残す） ---------- */
  function lastReq(kind) {
    return (R.dataRequests() || []).filter(function (x) { return x.kind === kind && x.status !== 'canceled'; })[0] || null;
  }
  /** 書き出し：受付中か、できて保存の期限の中のものだけ（期限が過ぎたら、もう一度書き出せる） */
  function exportReq() {
    var x = lastReq('export');
    if (!x) return null;
    if (x.status === 'done' && plusDays(x.doneAt || x.at, EXPORT_DAYS) < now()) return null;
    return x;
  }
  /** 試作版：受付中の書き出しを、少し待って「できた」にする。運営画面が開いていれば、運営が済みにするのを待つ */
  var exportTimer = null;
  function scheduleExport() {
    var x = exportReq();
    if (!x || x.status !== 'received' || exportTimer || (R.adminOpen && R.adminOpen())) return;
    var wait = Math.max(300, new Date(x.at).getTime() + EXPORT_WAIT - now().getTime());
    exportTimer = setTimeout(function () {
      exportTimer = null;
      var y = exportReq();
      if (!y || y.id !== x.id || y.status !== 'received' || (R.adminOpen && R.adminOpen())) return;
      R.completeDataRequest(y.id);
      if (!/^#\/account(\?|$)/.test(location.hash) || document.querySelector('.modal-bg')) return;
      // 焦点が書き出しの行にあるときだけ「保存する」へ移す（ほかを触っている人の焦点は動かさない）
      var a = document.activeElement, here = a && a.closest && a.closest('#acc-export');
      CLG.app.refresh(here ? { focus: '#acc-export [data-acc-data="save"]' } : undefined);
    }, wait);
  }

  /* ============================================================
     アカウント
     ============================================================ */
  function sec(id, title, body) {
    return '<section class="sec acc-sec" id="' + id + '" aria-labelledby="' + id + '-h">' +
      '<h2 class="sec-ttl" id="' + id + '-h">' + esc(title) + '</h2>' + body + '</section>';
  }
  function renderAccount(ctx) {
    var m = R.me(), p = R.plan();
    var parts = {
      profile: sec('acc-profile', 'プロフィール', profileCard(m, p)),
      plan: sec('acc-plan', '契約とお支払い', planCard(m, p, ctx.state)),
      invoices: sec('acc-invoices', '請求と領収書', invoiceList(p)),
      security: sec('acc-security', 'ログインとセキュリティ', securityCard(m)),
      // 会員期間が終わったら、お支払いのメール以外は届かないので出さない
      notify: p.status === 'ended' ? '' : sec('acc-notify', '通知', notifyCard(m)),
      // ミュートしている人がいるときだけ（タイムラインで「ミュート」にした人を、ここで戻せる）
      mutes: muteCard(),
      bank: sec('acc-bank', '振込先', bankCard()),
      data: sec('acc-data', '記録の書き出しと削除', dataCard(p))
    };
    var order = p.status === 'active'
      ? ['profile', 'plan', 'invoices', 'security', 'notify', 'mutes', 'bank', 'data']
      : ['plan', 'invoices', 'profile', 'security', 'notify', 'mutes', 'bank', 'data'];
    return '<div class="scr-account">' +
      '<div class="page-head"><h1 class="page-ttl" data-page-title tabindex="-1">アカウント</h1></div>' +
      order.map(function (k) { return parts[k]; }).join('') +
      otherList() +
    '</div>';
  }

  /* ---------- プロフィール ---------- */
  function profileCard(m, p) {
    var pr = R.profile(), miss = R.missingFields(), stepOpen = !stepDone('profile');
    var shown = areaFor(m.area, pr.visibility);
    var visName = (VIS.filter(function (v) { return v[0] === pr.visibility; })[0] || VIS[1])[1];
    // 契約の欄がいちばん上に来ているときは、朱のボタンをそちらに譲る
    var urge = miss.list.length && p.status === 'active';
    return '<div class="card acc-prof">' +
      '<div class="acc-prof__head">' +
        U.avatar({ name: m.name, color: m.color, photo: pr.photo }, 'l') +
        '<div class="acc-prof__who">' +
          (m.kana ? '<p class="acc-prof__kana">' + esc(m.kana) + '</p>' : '') +
          '<p class="acc-prof__name">' + esc(m.name) + '</p>' +
          '<p class="acc-prof__meta"><span class="num">' + esc(m.id) + '</span>・' + esc(R.cohort()) + '</p>' +
        '</div>' +
      '</div>' +
      (miss.list.length ? '<div class="notice acc-prof__hint">' + icon('info') + '<div>' + esc(miss.text) +
        (stepOpen ? '。入れるとスタートガイドが1つ進みます（<b class="num xp-num">+' + stepXp('profile') + '</b> XP）' : '') + '</div></div>' : '') +
      '<div class="acc-pad"><table class="kv acc-kv"><tbody>' +
        kvRow('表示名', pr.nickname ? esc(pr.nickname) : '<span class="muted">お名前のまま</span>') +
        kvRow('住んでいる地域', m.area
          ? esc(m.area) + '<span class="acc-kv__sub">ほかの会員には' + (shown ? '「' + esc(shown) + '」と表示' : '表示しません') + '（' + esc(visName) + '）</span>'
          : '<span class="muted">未入力</span>') +
        kvRow('いまのお仕事', orEmpty(m.job)) +
        kvRow('やりたいこと', m.goal ? jp(m.goal, { br: true }) : '<span class="muted">未入力</span>') +
      '</tbody></table></div>' +
      '<div class="card-foot">' +
        '<button type="button" class="btn ' + (urge ? 'btn-primary' : 'btn-ghost') + ' btn-s" data-acc-profile="edit">変更する</button>' +
      '</div>' +
    '</div>';
  }

  /* ---------- 契約とお支払い ---------- */
  /** 支払いエラーのまま解約した人（解約予定で、払えていない請求が残っている）。
      カードを更新すれば払える（解約はそのまま）。解約を取り消すと支払いエラーに戻る（R.resumePlan） */
  function unpaidCancel(p) { return p.status === 'canceling' && !!p.failedAt; }
  /** 休会中の解約の取り消しの窓口（相談・メッセージが開ける状態のときだけリンク） */
  function askStaff(what) {
    var link = R.planGate('messages').ok ? '<a href="#/messages">相談・メッセージ</a>' : '相談・メッセージ';
    return esc(what) + 'は、' + link + 'で運営に伝えてください。';
  }
  /* 支払いエラー・休会・終了は、骨組みの帯（R.planBanner）が同じ画面の上に同じ文を出している。
     ここでは帯にないこと（どの請求か・何が止まっているか・記録の期限）と、押すものだけを書く（同じ文を2回出さない） */
  function planNotice(p) {
    if (p.status === 'canceling') {
      // 支払いエラーのまま解約した人：お支払いの期限を過ぎたら止めたまま（ルールの plan() の limited）
      // （期限が会員期間の終わりより後なら、止まる前に終わるので、ふつうの解約予定と同じ文にする）
      var unpaid = unpaidCancel(p) && (p.limited || new Date(p.graceUntil) < endOfDay(p.lastDay));
      return '<div class="notice notice-warn acc-plan__notice">' + icon('info') + '<div>' +
        (unpaid
          // お支払いの期限の日は帯と下の表（お支払いの期限）にあるので、ここでは言わない（支払いエラーと同じ）
          ? '<b>' + day(p.lastDay) + 'で会員期間が終わります。</b>' + (p.limited
            ? 'お支払いが確認できないため、講座・イベントなどを止めています。'
            : 'お支払いの期限までは、<span class="nw">いつもどおり</span>使えます。')
          : '<b>' + day(p.lastDay) + 'まで使えて、<span class="nw">その日で</span>終わります。</b>次の請求はありません。') +
        // 支払いエラーのまま解約した人も、その場で取り消せる（支払いエラーに戻る）。お支払いは下の「カードを更新する」
        '<div class="acc-plan__acts"><button type="button" class="btn btn-ghost btn-s" data-acc-plan="resume">解約を取り消す</button></div>' +
        '</div></div>';
    }
    if (p.status === 'past_due') {
      // 期限の日は帯と下の表にあるので、ここはどの請求か・何が止まっているか
      return '<div class="notice notice-accent acc-plan__notice" role="note">' + icon('alert') + '<div>' +
        '<b>' + day(p.failedAt) + 'のお支払いができませんでした。</b>' + (p.limited
          ? '期限を過ぎたため、講座・タイムライン・イベント・案件を止めています。'
          : '期限までは、<span class="nw">いつもどおり</span>使えます。') +
        '</div></div>';
    }
    // 休会中に解約した：休会のまま、明ける日で終わる。同じ文は骨組みの帯に出ていて、終わる日と次の請求は下の表にあるので、ここには出さない
    if (p.status === 'paused' && p.cancelAt) return '';
    if (p.status === 'paused') {
      // 再開する日は帯と下の表にある
      return '<div class="notice acc-plan__notice">' + icon('info') + '<div>' +
        '<b>休会のあいだは会費がかかりません。</b>講座・タイムライン・イベント・案件は止まっています。' +
        '<div class="acc-plan__acts"><button type="button" class="btn btn-ghost btn-s" data-acc-plan="unpause">休会をやめる</button></div></div></div>';
    }
    if (p.status === 'ended') {
      // 終わった日は帯と下の表（会員期間）にある
      var href = (p.rejoin && p.rejoin.href) || 'index.html#/join?rejoin=1';
      return '<div class="notice acc-plan__notice">' + icon('info') + '<div>' +
        '<b>記録は' + day(p.keepUntil, { year: true }) + 'まで残ります。</b>再入会すると、続きから使えます。' +
        '<div class="acc-plan__acts"><a class="btn btn-primary btn-s" href="' + esc(href) + '">再入会する</a></div></div></div>';
    }
    return '';
  }
  function payCell(p) {
    var card = R.me().card, due = p.status === 'past_due' || unpaidCancel(p);
    if (p.status === 'ended') return orEmpty(card, '未登録');
    return '<div class="acc-pay' + (due ? ' is-due' : '') + '">' +
      '<span class="acc-pay__card">' + (card ? '<span class="num">' + esc(card) + '</span>' : '<span class="muted">未登録</span>') +
        (due ? '<span class="acc-pay__warn">このカードで払えませんでした</span>' : '') + '</span>' +
      (due
        ? '<button type="button" class="btn btn-primary btn-s" data-acc-card="open">カードを更新する</button>'
        : '<button type="button" class="btn btn-ghost btn-s" data-acc-card="open">' + (card ? '変更する' : '登録する') + '</button>') +
    '</div>';
  }
  function planCard(m, p, state) {
    var ref = state && state.referredBy, rows = [];
    var price = '<span class="num">' + esc(U.yen(p.price)) + '</span>（税込）';
    if (p.status === 'ended') {
      // 同じ年なら後ろの年は省く（骨組みの「会員期間が終わりました」の画面と同じ書き方）
      var sameYear = new Date(m.joinedAt).getFullYear() === new Date(p.lastDay).getFullYear();
      rows.push(kvRow('会員期間', U.fmtDate(m.joinedAt, { wd: false }) + '〜' + U.fmtDate(p.lastDay, { wd: false, noYear: sameYear })));
      rows.push(kvRow('次回のお支払い', 'なし'));
      rows.push(kvRow('お支払い方法', payCell(p)));
    } else {
      rows.push(kvRow('月額', price));
      if (p.status === 'active') rows.push(kvRow('次回のお支払い', U.fmtDate(p.nextBill)));
      if (p.status === 'canceling') {
        // 支払いエラーのまま解約した人は、期限を過ぎると止まるので「使える」とは言わない
        rows.push(kvRow(unpaidCancel(p) ? '会員期間の終わり' : '使える最後の日', U.fmtDate(p.lastDay)));
        rows.push(kvRow('次回のお支払い', 'なし'));
        // 払えていない請求の期限（支払いエラーと同じ。カードを更新すれば払える）
        if (unpaidCancel(p) && p.graceUntil) rows.push(kvRow('お支払いの期限', U.fmtDate(p.graceUntil) + (p.limited ? '<span class="acc-warn">（過ぎています）</span>' : '')));
      }
      if (p.status === 'past_due') rows.push(kvRow('お支払いの期限', U.fmtDate(p.graceUntil) + (p.limited ? '<span class="acc-warn">（過ぎています）</span>' : '')));
      if (p.status === 'paused' && p.cancelAt) {
        rows.push(kvRow('会員期間の終わり', U.fmtDate(p.lastDay || p.cancelAt)));
        rows.push(kvRow('次回のお支払い', 'なし'));
      } else if (p.status === 'paused') {
        rows.push(kvRow('再開する日', U.fmtDate(p.pausedUntil) + '<span class="acc-kv__sub">その日に次のお支払いがあります</span>'));
      }
      rows.push(kvRow('お支払い方法', payCell(p)));
      if (p.status === 'active' || (p.status === 'paused' && !p.cancelAt)) rows.push(kvRow('更新', esc(SITE.billing)));
      rows.push(kvRow('入会日', U.fmtDate(m.joinedAt) + '（' + R.day() + '日目）'));
      if (ref) rows.push(kvRow('紹介コード', '<span class="num">' + esc(ref) + '</span>'));
    }
    var foot = p.status === 'ended' ? '' :
      '<div class="card-foot acc-plan__foot"><a class="acc-leave" href="#/account/cancel">' + (canceled(p) ? '解約の状況' : '解約の手続き') + '</a></div>';
    return '<div class="card acc-plan is-' + esc(p.status) + '">' +
      '<div class="acc-plan__head">' +
        '<h3 class="acc-plan__name" id="acc-plan-ttl">月額会員</h3>' +
        '<span class="tag ' + (PLAN_TAG[p.status] || '') + '">' + esc(p.label || R.PLAN_LABELS[p.status] || '') + '</span>' +
      '</div>' +
      planNotice(p) +
      '<div class="acc-pad"><table class="kv acc-kv"><tbody>' + rows.join('') + '</tbody></table></div>' +
      foot +
    '</div>';
  }

  /* ---------- 請求と領収書 ---------- */
  var INV_SHOW = 6;          // 請求の行は新しい6件まで。それより多いときだけ「以前の請求」で開く
  function invoiceList(p) {
    var list = R.invoices({ upcoming: true });
    // 隠すのが1〜2件なら、ボタンを置くより全部見せたほうが早い
    var cut = !local.invAll && list.length > INV_SHOW + 2, shown = cut ? list.slice(0, INV_SHOW) : list;
    var more = '';
    if (cut) {
      var next = list.slice(INV_SHOW).filter(function (x) { return x.status === 'paid' || (x.status === 'refunded' && !refundOf(x).full); })[0];
      more = '<button type="button" class="li acc-inv-more" data-acc-inv="more"' +
        (next ? ' data-focus-after="[data-acc-receipt=\'' + esc(next.id) + '\']"' : '') + '>' +
        '<span class="li__body"><span class="li__ttl">以前の請求を見る（' + (list.length - INV_SHOW) + '件）</span></span>' + U.icon('chevdown', 'ico-s') + '</button>';
    }
    var body = !list.length
      ? '<div class="card">' + U.empty('receipt', 'まだ請求はありません') + '</div>'
      : '<div class="list acc-inv-list">' + shown.map(invRow).join('') + more + '</div>';
    return body + taxNote(p);
  }
  /** 返金の記録（R.refundInvoice）。全額なら領収書は出さない。一部なら残りの額の領収書 */
  function refundOf(x) {
    if (x.status !== 'refunded') return null;
    var r = x.refund || {}, n = Math.min(x.amount, Math.max(0, Number(r.amount) || x.amount));
    return { at: r.at || null, amount: n, full: n >= x.amount, left: x.amount - n };
  }
  function receiptBtn(x) {
    return '<button type="button" class="btn btn-ghost btn-s" data-acc-receipt="' + esc(x.id) + '">' +
      icon('download', 'ico-s') + '<span class="sr-only">' + esc(jaMD(x.at)) + 'の</span>領収書を保存</button>';
  }
  function invRow(x) {
    var amt = '月額会費 <span class="num">' + esc(U.yen(x.amount)) + '</span>（税込）';
    var ttl = '<span class="li__ttl num">' + esc(U.fmtDate(x.at, { wd: false })) + '</span>';
    if (x.status === 'upcoming') {
      return '<div class="li acc-inv is-upcoming"><span class="li__body">' + ttl + '<span class="li__sub">' + amt + '</span></span>' +
        '<span class="li__end">' + U.statusTag('scheduled', '予定') + '</span></div>';
    }
    if (x.status === 'failed') {
      return '<div class="li acc-inv is-failed"><span class="li__body">' + ttl + '<span class="li__sub">' + amt + '</span></span>' +
        '<span class="li__end"><span class="tag tag-accent">お支払いエラー</span></span></div>';
    }
    var rf = refundOf(x);
    if (rf) {
      // 返金の日と額は補足に。全額は「返金済み」の札だけ、一部は領収書のボタンを残す（1行に札かボタンの1つ）
      var when = rf.at ? '<span class="nw">' + esc(U.fmtShort(rf.at)) + '</span>に' : '';
      return '<div class="li acc-inv is-refunded"><span class="li__body">' + ttl +
          '<span class="li__sub">' + amt + '</span>' +
          '<span class="li__sub acc-inv__refund">' + when + '<span class="num">' + esc(U.yen(rf.amount)) + '</span>を返金' +
            (rf.full ? '' : '（お支払い <span class="num">' + esc(U.yen(rf.left)) + '</span>）') + '</span></span>' +
        '<span class="li__end">' + (rf.full ? '<span class="tag tag-line">返金済み</span>' : receiptBtn(x)) + '</span></div>';
    }
    return '<div class="li acc-inv"><span class="li__body">' + ttl + '<span class="li__sub">' + amt + '・支払済</span></span>' +
      '<span class="li__end">' + receiptBtn(x) + '</span></div>';
  }
  function taxNote(p) {
    // 止めている画面（福利厚生）へのリンクは、使えないときは出さない
    if (!p.canUse) return '';
    return '<p class="acc-hint">会費を経費にできるかは、<a href="#/perks?tab=experts">提携の税理士</a>に相談できます<span class="nw">（初回30分無料）</span>。</p>';
  }

  /* ---------- ログインとセキュリティ ---------- */
  function securityCard(m) {
    var pe = R.pendingEmail(), st = CLG.store.state, sess = R.sessions();
    var others = sess.filter(function (x) { return !x.current; }).length;
    var pw = R.needsPassword()
      ? '<p class="acc-row__v"><span class="muted">まだ決めていません</span></p>'
      // 入会の日に決めたままなら「設定」、あとで変えたら「変更」
      : '<p class="acc-row__v">' + (st.passwordSetAt ? esc(U.fmtDate(st.passwordSetAt, { wd: false })) +
          (isoDay(st.passwordSetAt) === isoDay(m.joinedAt) ? 'に設定' : 'に変更') : '設定済み') + '</p>';
    return '<div class="card acc-security">' +
      '<div class="acc-row">' +
        '<div class="acc-row__main"><p class="acc-row__k">会員番号</p><p class="acc-row__v num">' + esc(m.id) + '</p></div>' +
      '</div>' +
      '<div class="acc-row acc-row--fit" id="acc-email">' +
        '<div class="acc-row__main"><p class="acc-row__k">メールアドレス</p>' +
          '<p class="acc-row__v acc-break">' + (m.email ? esc(m.email) : '<span class="muted">未登録</span>') + '</p></div>' +
        '<div class="acc-row__end"><button type="button" class="btn btn-ghost btn-s" data-acc-email="change">' + (m.email ? '変更する' : '登録する') + '</button></div>' +
        (pe ? pendingBox(pe) : '') +
      '</div>' +
      '<div class="acc-row acc-row--fit" id="acc-password">' +
        '<div class="acc-row__main"><p class="acc-row__k">パスワード</p>' + pw + '</div>' +
        '<div class="acc-row__end">' + (R.needsPassword()
          ? '<a class="btn btn-ghost btn-s" href="#/set-password?token=demo-set">決める</a>'
          : '<button type="button" class="btn btn-ghost btn-s" data-acc-password="change">変更する</button>') + '</div>' +
      '</div>' +
      '<div class="acc-row acc-row--stack" id="acc-sessions">' +
        '<div class="acc-row__main"><p class="acc-row__k">ログイン中の端末</p></div>' +
        '<ul class="acc-sess">' + sess.map(sessionRow).join('') + '</ul>' +
        (others ? '<div class="acc-sess__foot"><button type="button" class="btn btn-ghost btn-s" data-acc-sessions="others">ほかの端末からログアウト</button></div>' : '') +
      '</div>' +
    '</div>';
  }
  function pendingBox(pe) {
    return '<div class="acc-pending' + (pe.expired ? ' is-expired' : '') + '" role="status">' +
      '<p class="acc-pending__addr"><b>確認待ち：</b><span class="acc-break">' + esc(pe.addr) + '</span></p>' +
      '<p class="acc-pending__txt">' + (pe.expired
        ? '確認の期限（24時間）が切れました。送り直すか、取り消してください。'
        : esc(U.fmtShort(pe.sentAt, true)) + 'に確認のメールを送りました。メールのリンクを開くまでは、いまのアドレスのままです。') + '</p>' +
      '<div class="acc-pending__acts">' +
        (pe.expired ? '' : '<button type="button" class="btn btn-ink btn-s" data-acc-email="confirm">メールのリンクを開く</button>') +
        '<button type="button" class="btn btn-ghost btn-s" data-acc-email="resend">再送する</button>' +
        '<button type="button" class="btn btn-text btn-s" data-acc-email="cancel">取り消す</button>' +
      '</div>' +
    '</div>';
  }
  function sessionRow(x) {
    var sub = [x.place, x.current ? 'いま使っています' : '最後の利用 ' + U.relTime(x.lastAt)].filter(Boolean).join('・');
    return '<li class="acc-sess__row">' +
      '<span class="acc-sess__body"><span class="acc-sess__dev">' + esc(x.device) + '</span><span class="acc-sess__sub">' + esc(sub) + '</span></span>' +
      (x.current ? '<span class="tag tag-indigo">この端末</span>'
        : '<button type="button" class="btn btn-text btn-s" data-acc-session="' + esc(x.id) + '"' +
          ' aria-label="' + esc(x.device + 'をログアウト') + '">ログアウト</button>') +
    '</li>';
  }

  /* ---------- 通知（種類 × LINE／メール） ---------- */
  /** LINE の連携。いちばん大事なボタンには、状態が変わっても同じ印（data-acc-linebtn）を付ける
      （連携の窓を閉じたとき・描き直したとき、「連携する」が「連携を外す」に替わっても、そこへ焦点が戻る） */
  function lineBlock(l) {
    var name = SITE.lineName, body, acts;
    if (l.status === 'linked') {
      body = '<p class="acc-line__ttl">' + esc(name) + 'と連携しています</p>' +
        (l.at ? '<p class="acc-line__sub">' + esc(U.fmtDate(l.at, { wd: false, noYear: thisYear(l.at) })) + 'から</p>' : '');
      acts = '<button type="button" class="btn btn-text btn-s" data-acc-line="unlink" data-acc-linebtn="1">連携を外す</button>';
    } else if (l.status === 'pending') {
      // スマホはアプリで「許可する」、パソコンは友だち追加と連携コード（スタートガイドの LINE の窓と同じ分け方）
      body = '<p class="acc-line__ttl">連携の途中です</p>' + (phoneLike()
        ? '<p class="acc-line__sub">LINEのアプリで「許可する」を押してください。</p>'
        : '<p class="acc-line__sub">LINEで' + esc(name) + 'を友だちに追加して、連携コード <b class="num acc-code">' + esc(l.code || '') + '</b> を送ってください。</p>');
      acts = '<button type="button" class="btn btn-ink btn-s" data-acc-line="start" data-acc-linebtn="1">続ける</button>' +
        '<button type="button" class="btn btn-text btn-s" data-acc-line="cancel">やめる</button>';
    } else if (l.status === 'failed') {
      body = '<p class="acc-line__ttl">連携できませんでした</p><p class="acc-line__sub">もう一度やり直してください。</p>';
      acts = '<button type="button" class="btn btn-ink btn-s" data-acc-line="start" data-acc-linebtn="1">もう一度</button>';
    } else {
      body = '<p class="acc-line__ttl">LINEは連携していません</p><p class="acc-line__sub">連携するまで、LINEには届きません。</p>';
      acts = '<button type="button" class="btn btn-ink btn-s" data-acc-line="start" data-acc-linebtn="1">連携する</button>';
    }
    return '<div class="acc-line is-' + esc(l.status) + '" id="acc-line">' +
      '<span class="acc-line__ico">' + icon('line') + '</span>' +
      '<div class="acc-line__body">' + body + '</div>' +
      '<div class="acc-line__acts">' + acts + '</div>' +
    '</div>';
  }
  function notifyCard(m) {
    var l = R.lineLink(), prefs = R.notifyPrefs(), lineOk = l.status === 'linked', mailOk = !!m.email;
    function cell(t, ch, ready) {
      var label = t.name + '（' + (ch === 'line' ? 'LINE' : 'メール') + '）';
      if (t.fixed && !t[ch]) return '<td><span class="acc-mx__none" aria-label="' + esc(label + '：送りません') + '">—</span></td>';
      // 連携していない・アドレスがないあいだは届かないので、オンに見せない（設定は残っていて、つながると戻る）
      var on = !!t[ch] && ready, off = t.fixed || !ready;
      return '<td><label class="switch acc-sw' + (off ? ' is-off' : '') + '">' +
        '<input type="checkbox" data-acc-notify="' + esc(t.id) + '" data-ch="' + ch + '"' + (on ? ' checked' : '') + (off ? ' disabled' : '') + '>' +
        '<i></i><span class="sr-only">' + esc(label) + '</span></label></td>';
    }
    return '<div class="card acc-notify">' +
      lineBlock(l) +
      (mailOk ? '' : '<div class="acc-row acc-nomail"><div class="acc-row__main"><p class="acc-row__s">メールアドレスが未登録のため、メールは届きません。</p></div>' +
        '<div class="acc-row__end"><button type="button" class="btn btn-ghost btn-s" data-acc-email="change">登録する</button></div></div>') +
      '<table class="acc-mx"><caption class="sr-only">通知の受け取り方</caption>' +
        '<thead><tr><th scope="col" class="acc-mx__k">種類</th><th scope="col">LINE</th><th scope="col">メール</th></tr></thead><tbody>' +
        prefs.map(function (t) {
          return '<tr' + (t.fixed ? ' class="is-fixed"' : '') + '><th scope="row" class="acc-mx__k">' + esc(t.name) +
            (t.fixed ? '<span class="acc-mx__note">止められません</span>' : '') + '</th>' +
            cell(t, 'line', lineOk) + cell(t, 'email', mailOk) + '</tr>';
        }).join('') +
      '</tbody></table>' +
    '</div>';
  }

  /* ---------- 振込先 ---------- */
  function bankCard() {
    var b = R.bank ? R.bank() : null;
    // 何の振込先かは見出しの代わりに行のラベルで言う（説明の灰色の文を足さない）
    var k = '<p class="acc-row__k">案件の報酬・紹介報酬の振込先</p>';
    if (!b) {
      return '<div class="card acc-bank"><div class="acc-row acc-row--fit">' +
        '<div class="acc-row__main">' + k + '<p class="acc-row__v"><span class="muted">未登録</span></p></div>' +
        '<div class="acc-row__end"><button type="button" class="btn btn-ghost btn-s" data-acc-bank="edit">登録する</button></div>' +
      '</div></div>';
    }
    return '<div class="card acc-bank"><div class="acc-row acc-row--fit">' +
      '<div class="acc-row__main">' + k +
        '<p class="acc-row__v">' + esc([b.bank, b.branch].filter(Boolean).join(' ')) + '</p>' +
        '<p class="acc-row__s">' + esc(b.kind) + ' <span class="num">' + esc(b.number) + '</span>　' + esc(b.holder) + '</p>' +
        (b.invoiceNo ? '<p class="acc-row__s">インボイス登録番号 <span class="num">' + esc(b.invoiceNo) + '</span></p>' : '') +
      '</div>' +
      '<div class="acc-row__end"><button type="button" class="btn btn-ghost btn-s" data-acc-bank="edit">変更する</button>' +
        '<button type="button" class="btn btn-text btn-s" data-acc-bank="remove" data-focus-after="[data-acc-bank=\'edit\']">削除する</button></div>' +
    '</div></div>';
  }

  /* ---------- ミュート中の人（いるときだけ） ---------- */
  function muteCard() {
    var list = R.mutes ? R.mutes() : [];
    if (!list.length) return '';
    // 会員名簿を止めている状態（終了・支払いの猶予切れ・休会）では、名前をリンクにしない（押しても止めた画面になるだけ）
    var linkable = R.planGate('members').ok;
    return sec('acc-mutes', 'ミュート中の人', '<div class="list acc-mutes">' + list.map(function (m, i) {
      // やめたら次の人のボタンへ。最後の1人なら前の人、いなくなれば欄ごと消えるので振込先のボタンへ
      var after = list.length === 1 ? "#acc-bank [data-acc-bank='edit']" : "[data-acc-unmute='" + esc(list[i === list.length - 1 ? i - 1 : i + 1].id) + "']";
      return '<div class="li acc-mute">' +
        U.personLink(m.who, { id: m.id, size: 's', sub: m.at ? U.fmtShort(m.at) + 'から' : '', link: linkable }) +
        '<span class="li__end"><button type="button" class="btn btn-ghost btn-s" data-acc-unmute="' + esc(m.id) + '"' +
          ' data-focus-after="' + esc(after) + '" aria-label="' + esc(m.who.name + 'さんのミュートをやめる') + '">ミュートをやめる</button></span>' +
      '</div>';
    }).join('') + '</div>');
  }

  /* ---------- 記録の書き出しと削除 ---------- */
  function dataCard(p) {
    var ex = exportReq(), del = lastReq('delete'), exBody, exEnd = '', delBody, delEnd = '';
    if (!ex) {
      exBody = '<p class="acc-row__s">プロフィール・学びの記録・投稿・ポイント・お支払いを1つのファイル（JSON）にまとめます。</p>';
      exEnd = '<button type="button" class="btn btn-ghost btn-s" data-acc-data="export">書き出す</button>';
    } else if (ex.status !== 'done') {
      exBody = '<p class="acc-row__s" role="status">' + esc(U.fmtShort(ex.at, true)) + 'に受け付けました。ファイルを用意しています。</p>';
    } else {
      exBody = '<p class="acc-row__s" role="status">ファイルができました。<span class="nw">' + esc(U.fmtShort(plusDays(ex.doneAt || ex.at, EXPORT_DAYS))) + 'まで</span>保存できます。</p>';
      exEnd = '<button type="button" class="btn btn-ink btn-s" data-acc-data="save">' + icon('download', 'ico-s') + '保存する</button>';
    }
    var from = p.status === 'ended' ? '' : (p.lastDay ? day(p.lastDay) + 'に' : '') + '会員期間が終わったあと、';
    var cancelLink = p.status === 'active' || p.status === 'past_due' || (p.status === 'paused' && !p.cancelAt)
      ? '<p class="acc-row__s">解約は別の手続きです。<a href="#/account/cancel">解約の手続き</a></p>' : '';
    if (!del) {
      delBody = '<p class="acc-row__s">' + (p.status === 'ended' ? '申し込むと' + DELETE_DAYS + '日以内に' : '会員期間が終わったあと、') + 'アカウントと記録を削除します。</p>';
      delEnd = '<button type="button" class="btn btn-danger btn-s" data-acc-data="delete">削除を申し込む</button>';
    } else if (del.status === 'done') {
      // 運営が受け付けを済ませたもの（運営画面の completeDataRequest）。取り消しは運営に伝える
      delBody = '<p class="acc-row__s" role="status"><b>' + esc(U.fmtShort(del.doneAt || del.at)) + 'に手続きが済みました。</b>' + from + DELETE_DAYS + '日以内に削除します。</p>' +
        (R.planGate('messages').ok ? '<p class="acc-row__s">取り消すときは<a href="#/messages">相談・メッセージ</a>で運営に伝えてください。</p>' : '');
    } else {
      delBody = '<p class="acc-row__s" role="status"><b>' + esc(U.fmtShort(del.at)) + 'に受け付けました。</b>' + from + DELETE_DAYS + '日以内に削除します。</p>' + cancelLink;
      delEnd = '<button type="button" class="btn btn-ghost btn-s" data-acc-data="undelete" data-focus-after="[data-acc-data=\'delete\']">取り消す</button>';
    }
    return '<div class="card acc-data">' +
      '<div class="acc-row" id="acc-export"><div class="acc-row__main"><p class="acc-row__k">記録の書き出し</p>' + exBody + '</div>' +
        (exEnd ? '<div class="acc-row__end">' + exEnd + '</div>' : '') + '</div>' +
      '<div class="acc-row" id="acc-delete"><div class="acc-row__main"><p class="acc-row__k">記録の削除</p>' + delBody + '</div>' +
        (delEnd ? '<div class="acc-row__end">' + delEnd + '</div>' : '') + '</div>' +
    '</div>';
  }

  /* ---------- そのほか（ホーム画面に追加・ヘルプ・ログアウト） ---------- */
  function otherList() {
    var added = standalone();
    return '<div class="sec acc-other">' +
      '<div class="list">' +
        (added ? '<div class="li"><span class="li__body"><span class="li__ttl">ホーム画面に追加</span><span class="li__sub">ホーム画面から開いています</span></span></div>'
          : '<button type="button" class="li" data-acc-a2hs="open"><span class="li__body"><span class="li__ttl">ホーム画面に追加</span></span>' + U.chevron() + '</button>') +
        '<a class="li" href="#/help"><span class="li__body"><span class="li__ttl">ヘルプ・よくある質問</span></span>' + U.chevron() + '</a>' +
      '</div>' +
      '<div class="acc-bottom"><button type="button" class="btn btn-ghost" data-acc-logout="go">' + icon('logout', 'ico-s') + 'ログアウト</button></div>' +
    '</div>';
  }

  /* ============================================================
     窓（プロフィール・メール・パスワード・カード・振込先・ホーム画面に追加）
     ============================================================ */
  function cancelBtn() { return '<button type="button" class="btn btn-soft" data-cancel>やめる</button>'; }
  /** 「やめる」も、書きかけなら確かめてから閉じる（×・Esc・背景と同じにする） */
  function wireCancel(box) {
    box.addEventListener('click', function (e) { if (e.target.closest('[data-cancel]')) box.dismiss(); });
  }

  /* ---------- プロフィールの変更 ---------- */
  function squarePhoto(file, cb) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type || '')) { cb({ error: '写真はJPEGかPNGの画像を選んでください' }); return; }
    if (file.size > 20 * 1024 * 1024) { cb({ error: '写真が大きすぎます（20MBまで）' }); return; }
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function () {
      // 真ん中を正方形に切って、320px の JPEG にする（保存先の大きさを抑えるため）
      var w = img.naturalWidth, h = img.naturalHeight, s = Math.min(w, h), size = Math.min(320, s);
      var c = document.createElement('canvas'); c.width = c.height = size;
      var g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, size, size);
      g.drawImage(img, (w - s) / 2, (h - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      var out = '';
      try { out = c.toDataURL('image/jpeg', 0.85); } catch (e) {}
      cb(out ? { photo: out } : { error: '写真を読み込めませんでした。別の写真を選んでください' });
    };
    img.onerror = function () { URL.revokeObjectURL(url); cb({ error: '写真を読み込めませんでした。別の写真を選んでください' }); };
    img.src = url;
  }
  function photoPreview(photo, m) {
    return photo
      ? '<img class="acc-photo__img" src="' + esc(photo) + '" alt="選んだ写真">'
      : '<span class="acc-photo__img is-empty" aria-hidden="true">' + U.avatar({ name: m.name, color: m.color }, 'l') + '</span>';
  }
  function openProfile() {
    var m = R.me(), pr = R.profile(), a = splitArea(m.area), photo = pr.photo || '';
    var html = '<form class="acc-form" id="accProfileForm" novalidate>' +
      '<div class="field acc-photo" data-field>' +
        '<span class="field__label">写真<span class="opt">任意</span></span>' +
        '<div class="acc-photo__row">' +
          '<span class="acc-photo__box">' + photoPreview(photo, m) + '</span>' +
          '<div class="acc-photo__acts">' +
            '<button type="button" class="btn btn-ghost btn-s" data-photo="pick">' + icon('camera', 'ico-s') + (photo ? '選び直す' : '写真を選ぶ') + '</button>' +
            '<button type="button" class="btn btn-text btn-s" data-photo="remove"' + (photo ? '' : ' hidden') + '>削除</button>' +
          '</div>' +
          '<input type="file" name="photo" accept="image/jpeg,image/png,image/webp" hidden>' +
        '</div>' +
      '</div>' +
      '<label class="field"><span>お名前</span>' +
        '<input class="input" name="name" required autocomplete="name" maxlength="30" value="' + esc(m.name) + '"></label>' +
      '<label class="field"><span>ふりがな<span class="opt">任意</span></span>' +
        '<input class="input" name="kana" maxlength="40" placeholder="例：たかはし さくら" value="' + esc(m.kana) + '"></label>' +
      '<label class="field"><span>表示名<span class="opt">任意</span></span>' +
        '<input class="input" name="nickname" maxlength="20" placeholder="例：さくら" value="' + esc(pr.nickname) + '">' +
        '<small>タイムラインや名簿に出る名前です。空欄なら<span class="nw">お名前を出します。</span></small></label>' +
      '<div class="field" data-field><span class="field__label" id="accAreaLbl">住んでいる地域</span>' +
        '<div class="acc-area" role="group" aria-labelledby="accAreaLbl">' +
          '<select class="select" name="pref" aria-label="都道府県"><option value="">都道府県</option>' +
            PREFS.map(function (x) { return '<option' + (x === a.pref ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') +
          '</select>' +
          '<input class="input" name="city" maxlength="30" aria-label="市区町村" placeholder="市区町村（例：旭川市）" value="' + esc(a.city) + '">' +
        '</div></div>' +
      '<fieldset class="field acc-vis"><legend class="field__label">ほかの会員に見せる地域</legend>' +
        VIS.map(function (v) {
          return '<label class="acc-radio"><input type="radio" name="visibility" value="' + v[0] + '"' + (pr.visibility === v[0] ? ' checked' : '') + '>' +
            '<span class="acc-radio__t">' + esc(v[1]) + '</span><span class="acc-radio__ex" data-vis-ex="' + v[0] + '"></span></label>';
        }).join('') +
      '</fieldset>' +
      '<label class="field"><span>いまのお仕事<span class="opt">任意</span></span>' +
        '<input class="input" name="job" maxlength="40" placeholder="例：会社員（事務）・2児の母" value="' + esc(m.job) + '"></label>' +
      '<label class="field"><span>やりたいこと<span class="opt">任意</span></span>' +
        '<textarea class="textarea" name="goal" maxlength="120" rows="3" placeholder="例：動画編集を覚えて、在宅の仕事を1件受ける">' + esc(m.goal) + '</textarea></label>' +
    '</form>';
    var fine = false;
    try { fine = window.matchMedia('(pointer: fine)').matches; } catch (e) {}
    var box = U.modal(html, {
      title: 'プロフィールを変更', cls: 'scr-account', dirty: true,
      // 隠した写真の入力が「最初の入力欄」に選ばれて焦点が迷子になるので、パソコンではお名前に置く（スマホは「やめる」のまま）
      focus: fine ? '[name="name"]' : null,
      foot: cancelBtn() + '<button type="submit" form="accProfileForm" class="btn btn-primary">保存する</button>'
    });
    wireCancel(box);
    var form = box.querySelector('form'), file = form.querySelector('[name="photo"]');
    U.fieldErrors(form, {}, { focus: false });          // 必須の札だけ付ける
    function v(n) { return norm(form.querySelector('[name="' + n + '"]').value); }
    function area() { return [v('pref'), v('city')].filter(Boolean).join(' '); }
    function showEx() {
      var ar = area();
      U.$$('[data-vis-ex]', form).forEach(function (el) {
        var t = areaFor(ar, el.getAttribute('data-vis-ex'));
        el.textContent = el.getAttribute('data-vis-ex') === 'none' ? '' : (t ? '「' + t + '」' : '');
      });
    }
    function setPhoto(p) {
      photo = p || '';
      form.querySelector('.acc-photo__box').innerHTML = photoPreview(photo, m);
      form.querySelector('[data-photo="pick"]').innerHTML = icon('camera', 'ico-s') + (photo ? '選び直す' : '写真を選ぶ');
      form.querySelector('[data-photo="remove"]').hidden = !photo;
      box.setDirty(true);
    }
    showEx();
    form.addEventListener('input', function (e) { if (e.target.name === 'city') showEx(); });
    form.addEventListener('change', function (e) { if (e.target.name === 'pref') showEx(); });
    form.addEventListener('click', function (e) {
      var b = e.target.closest('[data-photo]');
      if (!b) return;
      if (b.getAttribute('data-photo') === 'pick') file.click();
      else { setPhoto(''); U.fieldErrors(form, { photo: '' }, { focus: false }); form.querySelector('[data-photo="pick"]').focus(); }
    });
    file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      squarePhoto(f, function (r) {
        file.value = '';
        if (r.error) { U.fieldErrors(form, { photo: r.error }, { focus: false }); form.querySelector('[data-photo="pick"]').focus(); return; }
        U.fieldErrors(form, { photo: '' }, { focus: false });
        setPhoto(r.photo);
      });
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var visEl = form.querySelector('[name="visibility"]:checked');
      var patch = { name: v('name'), kana: v('kana'), nickname: v('nickname'), visibility: visEl ? visEl.value : 'pref',
        area: area(), job: v('job'), goal: String(form.querySelector('[name="goal"]').value || '').trim(), photo: photo };
      var chk = R.validateProfile(patch), er = chk.errors || {};
      // 地域の誤りは市区町村の欄に出す（都道府県は選ぶだけなので）
      var shown = { name: er.name || '', nickname: er.nickname || '', city: er.area || '', job: er.job || '', goal: er.goal || '', photo: er.photo || '', visibility: er.visibility || '' };
      if (U.fieldErrors(form, shown)) return;
      var result = R.saveProfile(patch);
      box.close();
      if (result) CLG.app.reward(result);
      else U.toast('プロフィールを保存しました', 'ok');
      CLG.app.refresh();
    });
  }

  /* ---------- メールアドレスの変更（確認されるまで今のまま） ---------- */
  function openEmail() {
    var m = R.me();
    var box = U.modal(
      '<form class="acc-form" id="accEmailForm" novalidate>' +
        (m.email ? '<p class="acc-form__now"><span>いまのアドレス</span><b class="acc-break">' + esc(m.email) + '</b></p>' : '') +
        '<label class="field"><span>新しいメールアドレス</span>' +
          '<input class="input" name="email" type="email" required inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false" maxlength="80" placeholder="例：name@mail.jp">' +
          '<small>確認のメールのリンクを開くと切り替わります（24時間有効）。</small></label>' +
      '</form>',
      { title: m.email ? 'メールアドレスを変更' : 'メールアドレスを登録', cls: 'scr-account', dirty: true,
        foot: cancelBtn() + '<button type="submit" form="accEmailForm" class="btn btn-primary">確認のメールを送る</button>' });
    wireCancel(box);
    var form = box.querySelector('form');
    U.fieldErrors(form, {}, { focus: false });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var res = R.requestEmailChange(form.querySelector('[name="email"]').value);
      if (!res.ok) { U.fieldErrors(form, { email: res.error }); return; }
      box.close();
      U.toast(res.pending.addr + ' に確認のメールを送りました', 'ok');
      CLG.app.refresh();
    });
  }

  /* ---------- パスワードの変更 ---------- */
  function pwField(id, name, label, ac, hint) {
    return '<div class="field"><label class="field__label" for="' + id + '">' + esc(label) + '</label>' +
      '<div class="pw"><input class="input" id="' + id + '" name="' + name + '" type="password" required autocomplete="' + ac + '" autocapitalize="none" spellcheck="false"' +
        (hint ? ' aria-describedby="' + id + '-h"' : '') + '>' +
      '<button type="button" class="pw__toggle" data-pw="' + id + '" aria-pressed="false" aria-label="パスワードを表示">' + icon('eye') + '</button></div>' +
      (hint ? '<small id="' + id + '-h">' + esc(hint) + '</small>' : '') + '</div>';
  }
  function openPassword() {
    var m = R.me();
    var box = U.modal(
      '<form class="acc-form" id="accPwForm" novalidate>' +
        // パスワードの管理アプリが会員番号と組にして覚えられるように（見た目には出さない）
        '<input class="sr-only" name="username" autocomplete="username" value="' + esc(m.id) + '" readonly tabindex="-1" aria-hidden="true">' +
        pwField('accPwCur', 'cur', '今のパスワード', 'current-password') +
        pwField('accPwNext', 'next', '新しいパスワード', 'new-password', R.PASSWORD_RULE) +
        pwField('accPwAgain', 'again', '新しいパスワード（もう一度）', 'new-password') +
        '<p class="acc-form__link"><a href="#/forgot">今のパスワードが分からないとき</a></p>' +
      '</form>',
      { title: 'パスワードを変更', cls: 'scr-account', dirty: true,
        foot: cancelBtn() + '<button type="submit" form="accPwForm" class="btn btn-primary">変更する</button>' });
    wireCancel(box);
    var form = box.querySelector('form');
    U.fieldErrors(form, {}, { focus: false });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var res = R.changePassword(form.elements.cur.value, form.elements.next.value, form.elements.again.value);
      if (!res.ok) { var er = res.errors || {}; U.fieldErrors(form, { cur: er.cur || '', next: er.next || '', again: er.again || '' }); return; }
      box.close();
      U.toast('パスワードを変更しました' + (res.loggedOut ? '。ほかの端末（' + res.loggedOut + '台）はログアウトしました' : ''), 'ok');
      CLG.app.refresh();
    });
  }

  /* ---------- お支払い方法（Stripe へ進む → 変えました） ---------- */
  function openCard() {
    var p = R.plan(), card = R.me().card, due = p.status === 'past_due' || unpaidCancel(p), changed = false;
    var failed = (R.invoices() || []).filter(function (x) { return x.status === 'failed'; })[0];
    var start = '<div class="acc-cardsheet">' +
      '<div class="acc-curcard"><p class="acc-curcard__k">いまのカード</p><p class="acc-curcard__v num">' + (card ? esc(card) : '未登録') + '</p></div>' +
      (due ? '<p class="acc-cardsheet__due">' + (failed ? esc(jaMD(failed.at)) + 'の' : '') + 'お支払い（' + esc(U.yen(p.price)) + '）ができませんでした。' +
        'カードを更新すると、その場でお支払いします。</p>' : '') +
      '<p class="acc-cardsheet__txt">カードの変更は Stripe の画面で行います。</p>' +
    '</div>';
    var box = U.modal(start, {
      title: due ? 'カードを更新する' : 'お支払い方法', cls: 'scr-account',
      foot: cancelBtn() + '<button type="button" class="btn btn-primary" data-acc-stripe>Stripeへ進む（デモ）</button>',
      // 変えたあとは窓の裏で描き直してある。閉じたら「変更する」に焦点が戻る
      onClose: function () { if (changed) CLG.app.refresh(); }
    });
    box.addEventListener('click', function (e) {
      if (e.target.closest('[data-cancel]')) { box.close(); return; }
      if (!e.target.closest('[data-acc-stripe]')) return;
      var body = box.querySelector('.modal__body'), foot = box.querySelector('.modal__foot');
      body.innerHTML = '<div class="acc-busy" role="status" tabindex="-1"><span class="acc-spin" aria-hidden="true"></span>Stripe の画面を開いています</div>';
      foot.innerHTML = '<button type="button" class="btn btn-soft" disabled>閉じる</button>';
      body.firstChild.focus();
      setTimeout(function () {
        if (!box.isConnected) return;
        var res = R.updateCard();
        changed = true;
        CLG.app.refresh();          // 窓の裏の契約の欄・帯の知らせを、すぐ新しい状態にする
        body.innerHTML = '<div class="acc-done-sheet">' + icon('checkc', 'ico-l') +
          '<h3 class="acc-done-sheet__ttl" tabindex="-1">カードを変更しました</h3>' +
          '<p>いまのカード：<span class="num">' + esc(res.card) + '</span></p>' +
          (res.recovered ? '<p>' + (failed ? esc(jaMD(failed.at)) + '分の' : '') + esc(U.yen(p.price)) + 'のお支払いが済みました。' +
            // 解約の予定はそのまま（使える最後の日まで使える）
            (res.plan && res.plan.status === 'canceling'
              ? '<span class="nw">' + esc(day(res.plan.lastDay)) + 'まで</span>使えます。</p>'
              : '<span class="nw">いつもどおり</span>使えます。</p>') : '') +
        '</div>';
        foot.innerHTML = '<button type="button" class="btn btn-ink" data-close>閉じる</button>';
        body.querySelector('.acc-done-sheet__ttl').focus();
      }, 900);
    });
  }

  /* ---------- 振込先 ---------- */
  function bankField(label, control, opt) {
    return '<label class="field"><span>' + esc(label) + (opt ? '<span class="opt">任意</span>' : '') + '</span>' + control + '</label>';
  }
  function openBank() {
    var b = R.bank ? R.bank() : null;
    var val = function (k) { return b && b[k] ? ' value="' + esc(b[k]) + '"' : ''; };
    var box = U.modal(
      '<form class="acc-form" id="accBankForm" autocomplete="off" novalidate>' +
        '<p class="acc-form__lead">本人名義の口座を入れてください。案件の報酬と紹介報酬の両方に使います。</p>' +
        bankField('金融機関名', '<input class="input" name="bank" required maxlength="30" placeholder="例：〇〇銀行"' + val('bank') + '>') +
        '<div class="acc-bank2">' +
          bankField('支店名', '<input class="input" name="branch" required maxlength="30" placeholder="例：〇〇支店"' + val('branch') + '>') +
          bankField('口座の種類', '<select class="select" name="kind" required><option' + (b && b.kind === '当座' ? '' : ' selected') + '>普通</option><option' + (b && b.kind === '当座' ? ' selected' : '') + '>当座</option></select>') +
        '</div>' +
        bankField('口座番号', '<input class="input num" name="number" required inputmode="numeric" maxlength="8" placeholder="' + (b ? '***' + esc(b.tail) + '（もう一度7桁で）' : '7桁の数字') + '">') +
        bankField('口座名義（カタカナ）', '<input class="input" name="holder" required maxlength="40" placeholder="例：ヤマダ ハナコ"' + val('holder') + '>') +
        bankField('インボイス登録番号', '<input class="input num" name="invoiceNo" maxlength="16" placeholder="T から始まる13桁"' + val('invoiceNo') + '>', true) +
      '</form>',
      { title: b ? '振込先を変更' : '振込先を登録', cls: 'scr-account', dirty: true,
        foot: cancelBtn() + '<button type="submit" form="accBankForm" class="btn btn-primary">保存する</button>' });
    wireCancel(box);
    var form = box.querySelector('form');
    U.fieldErrors(form, {}, { focus: false });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = {};
      ['bank', 'branch', 'kind', 'number', 'holder', 'invoiceNo'].forEach(function (k) { f[k] = form.querySelector('[name="' + k + '"]').value; });
      var res = R.setBank(f);
      if (!res.ok) {
        var er = res.errors || {};
        U.fieldErrors(form, { bank: er.bank || '', branch: er.branch || '', kind: er.kind || '', number: er.number || '', holder: er.holder || '', invoiceNo: er.invoiceNo || '' });
        return;
      }
      box.close();
      U.toast('振込先を保存しました', 'ok');
      CLG.app.refresh();
    });
  }

  /* ---------- ホーム画面に追加 ---------- */
  function openA2hs() {
    U.modal(
      '<h3 class="acc-steps__ttl">iPhone（Safari）</h3>' +
      '<ol class="acc-steps"><li>画面の下の共有ボタン（四角から上に矢印）を押す</li><li>「ホーム画面に追加」を選ぶ</li><li>右上の「追加」を押す</li></ol>' +
      '<h3 class="acc-steps__ttl">Android（Chrome）</h3>' +
      '<ol class="acc-steps"><li>右上の︙を押す</li><li>「ホーム画面に追加」か「アプリをインストール」を選ぶ</li><li>「追加」を押す</li></ol>' +
      '<p class="acc-steps__note">ホーム画面の「' + esc(SITE.name) + '」から、ログインしたまま開けます。</p>',
      { title: 'ホーム画面に追加', cls: 'scr-account', foot: true });
  }

  /* ---------- 書き出すファイル（自分の記録だけ） ---------- */
  function exportJson() {
    var s = CLG.store.state, m = R.me(), pr = R.profile();
    var out = {
      service: SITE.name, exportedAt: now().toISOString(),
      member: { memberNo: m.id, name: m.name, kana: m.kana || '', email: m.email || '', area: m.area || '', job: m.job || '', goal: m.goal || '',
        joinedAt: m.joinedAt, nickname: pr.nickname, areaVisibility: pr.visibility, hasPhoto: !!pr.photo },
      plan: { status: R.plan().status, card: m.card || '' },
      learning: { lessonsDone: s.done, archiveSeen: s.archiveSeen, quiz: s.quiz, certificates: s.certificates, notes: s.notes, xpLog: s.xpLog, steps: s.steps },
      timeline: { posts: s.posts, comments: s.comments },
      points: s.pointsLog,
      events: { reserved: s.events, attended: s.attended },
      // 自分が出した募集は、応募した人の名前と文を外して数だけにする（ほかの会員のものなので）
      gigs: { applied: s.gigs, workReports: s.workReports || [],
        posted: (s.myGigs || []).map(function (g) {
          var o = {};
          Object.keys(g).forEach(function (k) { if (k !== 'applicants') o[k] = g[k]; });
          o.applicantCount = (g.applicants || []).length;
          return o;
        }) },
      // 振込先は下4桁だけ（保存しているのもそこまで）
      bank: R.bank ? (R.bank() ? R.bank().masked : null) : null,
      notifyPrefs: s.notifyPrefs,
      messages: s.thread,
      invoices: s.invoices,
      // 紹介した人は頭文字だけ（ほかの人の名前は書き出さない）
      referred: (s.referred || []).map(function (r) { return { initial: r.initial || '', joinedAt: r.joinedAt, status: r.status }; })
    };
    return JSON.stringify(out, null, 2);
  }

  /* ---------- 領収書（印刷できる1枚のHTML） ---------- */
  function receiptHtml(inv) {
    // 一部を返金した請求は、返金のあとの額で出す（返金の行を足す）
    var rf = refundOf(inv);
    var m = R.me(), site = SITE, amount = rf ? rf.left : inv.amount, tax = Math.floor(amount * 10 / 110);
    var from = new Date(inv.at), to = prevDay(DATA.addMonths(from, 1));
    var nameFull = site.name + (site.note ? '（' + site.note + '）' : '');
    return '<!doctype html>\n<html lang="ja"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>領収書 ' + esc(isoDay(inv.at)) + '｜' + esc(site.name) + '</title>' +
      '<style>' +
        '*{box-sizing:border-box}body{margin:0;background:#f3f2ef;color:#1d1b18;font-family:-apple-system,"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic",Meiryo,sans-serif;line-height:1.7}' +
        '.sheet{max-width:720px;margin:32px auto;background:#fff;padding:48px 52px;border:1px solid #e7e3dc}' +
        '.top{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;flex-wrap:wrap}' +
        'h1{margin:0;font-size:26px;letter-spacing:.02em;font-weight:800}' +
        '.meta{margin:0;font-size:13px;display:grid;grid-template-columns:auto auto;gap:2px 14px;color:#55514a}.meta dt{color:#726d65}.meta dd{margin:0}' +
        '.to{margin:36px 0 0;font-size:20px;border-bottom:1px solid #1d1b18;padding-bottom:6px;display:inline-block;min-width:60%}.to small{font-size:15px;margin-left:12px}' +
        '.amount{margin:28px 0 0;background:#faf9f7;border:1px solid #e7e3dc;padding:18px 22px;display:flex;align-items:baseline;gap:18px;flex-wrap:wrap}' +
        '.amount span{font-size:13px;color:#55514a}.amount b{font-size:32px;letter-spacing:.02em;font-variant-numeric:tabular-nums}.amount small{font-size:13px;color:#55514a}' +
        '.for{margin:18px 0 0;font-size:14px}.nw{white-space:nowrap}' +
        'table{width:100%;border-collapse:collapse;margin-top:26px;font-size:13.5px}th,td{text-align:left;padding:9px 0;border-bottom:1px solid #e7e3dc;vertical-align:top}th{width:9em;color:#726d65;font-weight:500}' +
        '.issuer{margin-top:34px;display:flex;justify-content:flex-end}.issuer div{font-size:13.5px;min-width:260px}.issuer b{font-size:15px}' +
        '.note{margin-top:30px;font-size:11.5px;color:#726d65;border-top:1px dashed #d6d1c7;padding-top:12px}' +
        '.print{margin-top:20px;text-align:center}.print button{font:inherit;font-size:14px;font-weight:700;padding:10px 22px;border-radius:10px;border:0;background:#1d1b18;color:#fff;cursor:pointer}' +
        '@media (max-width:600px){.sheet{margin:0;padding:28px 20px;border:0}h1{font-size:24px}.amount b{font-size:26px}}' +
        '@page{size:A4;margin:16mm}@media print{body{background:#fff}.sheet{margin:0;border:0;padding:0;max-width:none}.print{display:none}}' +
      '</style></head><body><main class="sheet">' +
        '<div class="top"><h1>領収書</h1>' +
          // 番号は請求の日付と会員番号から作る（内部の id をそのまま出さない）
          '<dl class="meta"><dt>番号</dt><dd>' + esc('R' + isoDay(inv.at).replace(/-/g, '') + '-' + String(m.id).replace(/\D/g, '')) + '</dd><dt>発行日</dt><dd>' + esc(U.fmtDate(now(), { wd: false })) + '</dd></dl></div>' +
        '<p class="to">' + esc(m.name) + '<small>様</small></p>' +
        '<div class="amount"><span>金額</span><b>' + esc(U.yen(amount, { mark: true })) + '-</b><small>（税込）</small></div>' +
        '<p class="for">但し　' + esc(site.name) + ' 月額会費として<br>上記の金額を正に領収いたしました。</p>' +
        '<table><tbody>' +
          '<tr><th>お支払い日</th><td>' + esc(U.fmtDate(inv.paidAt || inv.at, { wd: false })) + '</td></tr>' +
          '<tr><th>対象期間</th><td><span class="nw">' + esc(U.fmtDate(from, { wd: false })) + ' 〜</span> <span class="nw">' + esc(U.fmtDate(to, { wd: false })) + '</span></td></tr>' +
          (rf ? '<tr><th>返金</th><td>' + esc(U.yen(inv.amount, { mark: true })) + 'のうち ' + esc(U.yen(rf.amount, { mark: true })) +
            (rf.at ? '<span class="nw">（' + esc(U.fmtDate(rf.at, { wd: false })) + '）</span>' : '') + '</td></tr>' : '') +
          '<tr><th>内訳</th><td>10%対象　' + esc(U.yen(amount, { mark: true })) + '<span class="nw">（うち消費税 ' + esc(U.yen(tax, { mark: true })) + '）</span></td></tr>' +
          '<tr><th>お支払い方法</th><td>クレジットカード' + (m.card ? '（' + esc(m.card) + '）' : '') + '</td></tr>' +
          '<tr><th>会員番号</th><td>' + esc(m.id) + '</td></tr>' +
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
      '<div class="page-head"><h1 class="page-ttl" data-page-title tabindex="-1">解約の手続き</h1></div>';
    if (canceled(p)) return '<div class="scr-account acc-cancel">' + head + doneView(p) + '</div>';
    if (p.status === 'ended') {
      return '<div class="scr-account acc-cancel">' + head +
        '<div class="card acc-done"><h2 class="acc-done__ttl">会員期間は終わっています</h2>' +
          '<table class="kv acc-kv acc-done__kv"><tbody>' +
            kvRow('会員期間の終わり', U.fmtDate(p.lastDay)) + kvRow('次回のお支払い', 'なし') +
            kvRow('記録を残す期限', U.fmtDate(p.keepUntil, { wd: false }) + 'まで') +
          '</tbody></table>' +
          '<div class="acc-done__act"><a class="btn btn-text" href="#/account">アカウントに戻る</a></div>' +
        '</div></div>';
    }

    // 終わる日はルールと同じ（有効・支払いエラーは次の請求日、休会中は休会が明ける日）
    var end = new Date(p.cancelEnd || p.nextBill || p.periodEnd), until = prevDay(end), left = remaining(), rows = [];
    var paused = p.status === 'paused', due = p.status === 'past_due';
    // 休会中・支払いの猶予切れは講座もイベントも止まっているので、「まだ使っていないもの」は出さない
    if (!paused && !p.limited) {
      // 予約中でも、使える最後の日より後のイベントには出られない。先に伝える
      var lateBooked = R.myUpcoming().filter(function (e) { return new Date(e.at) > endOfDay(until); }).length;
      // イベントは使える最後の日までに開かれるものだけを数える
      var evs = R.upcoming().filter(function (e) { return new Date(e.at) <= endOfDay(until); }).length;
      if (left.courses > 0) rows.push(kvRow('見終えていない講座', left.courses + '本（残り' + left.lessons + '回・' + U.num(left.minutes) + '分）'));
      if (evs > 0 || lateBooked) rows.push(kvRow(DATA.md(until) + 'までのイベント', evs + '件' +
        (lateBooked ? '<span class="acc-kv__sub acc-warn">予約中のうち' + lateBooked + '件は' + esc(DATA.md(until)) + 'より後のため、参加できません。</span>' : '')));
    }
    // 紹介の報酬は引き止めの理由に使わない（会員資格と紹介収入を結びつけないため）

    return '<div class="scr-account acc-cancel">' + head +
      '<div class="card acc-cancel__lead">' +
        // 休会中は使えないまま終わる（休会が明ける前の日で会員期間が終わる）
        (paused
          ? '<p class="acc-cancel__until">休会のまま、<b>' + U.fmtDate(until) + '</b>で<span class="nw">会員期間が</span>終わります。</p>'
          : due
            ? '<p class="acc-cancel__until"><b>' + U.fmtDate(until) + '</b>で<span class="nw">会員期間が</span>終わります。</p>'
            : '<p class="acc-cancel__until"><b>' + U.fmtDate(until) + 'まで</b>使えて、<span class="nw">その日で</span>終わります。</p>') +
        '<p>' + day(end, { wd: false }) + '以降の請求はありません。途中解約の返金・違約金もありません。</p>' +
        // 支払いエラーのまま解約しても、お支払いの期限が過ぎたら止めたまま（ルールの plan() と同じ）
        // 期限が会員期間の終わりより後なら、止まる前に終わるので書かない
        (due && (p.limited || new Date(p.graceUntil) < endOfDay(until)) ? '<p class="acc-cancel__due">' + (p.limited
          ? 'お支払いが確認できるまで、講座・イベントなどは止まったままです。'
          : 'お支払いの期限（' + esc(day(p.graceUntil)) + '）までにカードを更新しないと、その次の日から講座・イベントなどが止まります。') + '</p>' : '') +
      '</div>' +
      (rows.length ? '<section class="sec"><h2 class="sec-ttl">まだ使っていないもの</h2>' +
        '<div class="card"><div class="acc-pad"><table class="kv acc-kv"><tbody>' + rows.join('') + '</tbody></table></div></div>' +
      '</section>' : '') +
      pauseBox(p) +
      '<section class="sec"><h2 class="sec-ttl" id="accReasonsH">解約の理由<span class="opt">任意</span></h2>' +
        '<div class="chips acc-reasons" role="group" aria-labelledby="accReasonsH">' + REASONS.map(function (r) {
          var on = local.reasons.indexOf(r) >= 0;
          return '<button type="button" class="chip" aria-pressed="' + on + '" data-acc-reason="' + esc(r) + '">' + esc(r) + '</button>';
        }).join('') + '</div>' +
      '</section>' +
      '<div class="acc-cancel__act">' +
        '<a class="btn btn-soft btn-l" href="#/account">戻る</a>' +
        '<button type="button" class="btn btn-danger btn-l" data-acc-cancel="go">解約する</button>' +
      '</div>' +
    '</div>';
  }
  /** 休会（SITE.allowPause が true のときだけ。引き止めと同じ画面の中に置く） */
  function pauseBox(p) {
    if (!SITE.allowPause || p.status !== 'active') return '';
    var n = local.pauseMonths;
    return '<section class="sec" id="acc-pause"><h2 class="sec-ttl">休会</h2>' +
      '<div class="card card-pad acc-pause">' +
        '<p>解約せずに1〜3か月休めます。休会のあいだは会費がかからず、講座やイベントは止まります。記録はそのまま残ります。</p>' +
        '<div class="acc-pause__row">' +
          '<div class="seg" role="group" aria-label="休む期間">' + [1, 2, 3].map(function (k) {
            return '<button type="button" aria-pressed="' + (k === n) + '" data-acc-pause-n="' + k + '">' + k + 'か月</button>';
          }).join('') + '</div>' +
          '<button type="button" class="btn btn-ghost" data-acc-pause="go">休会する</button>' +
        '</div>' +
        '<p class="acc-pause__back" data-acc-pause-back>' + pauseBack(p, n) + '</p>' +
      '</div></section>';
  }
  function pauseBack(p, n) { return esc(day(DATA.addMonths(p.nextBill, n))) + 'から再開します（その日にお支払い）。'; }

  /** 解約を受け付けたあと（押した直後と、あとから開いたときで言い方を変える） */
  function doneView(p) {
    var just = local.justCanceled, paused = p.status === 'paused', unpaid = unpaidCancel(p);
    // 休会中に解約した人は、休会のまま終わる（取り消すと休会も終わって請求が始まる）。運営が受けるので、ここにボタンは置かない。
    // 支払いエラーのまま解約した人は、期限を過ぎると止まるので「使える最後の日」とは言わない（取り消すと支払いエラーに戻る）
    var byStaff = paused;
    return '<div class="card acc-done">' +
      '<h2 class="acc-done__ttl" id="accDoneTtl" tabindex="-1">' + (just ? '解約を受け付けました' : '解約の手続きは済んでいます') + '</h2>' +
      (just ? '<p class="acc-done__msg">確認のメールを送りました。' +
        (local.sentReasons.length ? '理由の回答もありがとうございました。' : '') + '</p>' : '') +
      '<table class="kv acc-kv acc-done__kv"><tbody>' +
        kvRow(byStaff || unpaid ? '会員期間の終わり' : '使える最後の日', U.fmtDate(p.lastDay)) +
        kvRow('次回のお支払い', 'なし') +
        kvRow('返金・違約金', 'なし') +
        kvRow('取り消し', byStaff ? askStaff('取り消し') : esc(day(p.lastDay)) + 'までできます') +
      '</tbody></table>' +
      '<div class="acc-done__act">' +
        (byStaff ? '' : '<button type="button" class="btn btn-ghost" data-acc-resume="go">解約を取り消す</button>') +
        '<a class="btn btn-text" href="#/account">アカウントに戻る</a>' +
      '</div>' +
    '</div>';
  }

  /* ============================================================
     ?focus=… の場所へ
     ============================================================ */
  function flash(el) {
    if (!el) return;
    el.classList.remove('acc-flash'); void el.offsetWidth; el.classList.add('acc-flash');
    setTimeout(function () { el.classList.remove('acc-flash'); }, 2400);
  }
  function applyFocus(ctx) {
    var key = ctx.query && ctx.query.focus;
    if (!key || ctx.params[0]) return;
    // 描き直しのたびに同じ場所へ飛ばないよう、URL から目印を外す（hashchange は起きない）
    try { history.replaceState(history.state, '', '#/account'); } catch (e) {}
    var el = FOCUS[key] && document.getElementById(FOCUS[key]);
    if (!el) return;
    // 帯の知らせ（骨組み）が入って位置がずれてから動かす
    setTimeout(function () {
      if (!el.isConnected) return;
      var box = el.classList.contains('acc-sec') ? (el.querySelector('.card,.list') || el) : el;
      if (key === 'card') {
        var btn = el.querySelector('[data-acc-card]');
        U.smoothScroll(btn || el, { block: 'center', focus: true });
      } else if (el.classList.contains('acc-sec')) {
        var h = el.querySelector('.sec-ttl');
        U.smoothScroll(el, { block: 'start' });
        if (h) { h.setAttribute('tabindex', '-1'); try { h.focus({ preventScroll: true }); } catch (e) { h.focus(); } }
      } else {
        U.smoothScroll(el, { block: 'center', focus: true });
      }
      flash(box);
    }, 60);
  }

  /** 解約を取り消したあとの一言。支払いエラーのまま解約していた人は、支払いエラーに戻る（R.resumePlan）ので、そのことを言う */
  function resumeToast(np) {
    CLG.app.reward(np);
    if (np && np.status === 'past_due') U.toast('解約を取り消しました。カードを更新すると、お支払いが済みます');
    else U.toast('解約を取り消しました。このまま続けて使えます', 'ok');
  }

  /* ============================================================
     押したときの動き
     ============================================================ */
  function onClick(e) {
    var ctx = cur, t = e.target;
    if (!ctx || !t.closest || !t.closest('.scr-account')) return;
    var b;

    if ((b = t.closest('[data-acc-profile]'))) { openProfile(); return; }
    if ((b = t.closest('[data-acc-card]'))) { openCard(); return; }
    if ((b = t.closest('[data-acc-bank]'))) {
      if (b.getAttribute('data-acc-bank') === 'edit') { openBank(); return; }
      U.confirmBox('振込先を削除する', '登録した口座を消します。報酬を受け取る前に、もう一度登録してください。', '削除する', true).then(function (ok) {
        if (!ok) return;
        R.removeBank();
        U.toast('振込先を削除しました');
        ctx.refresh();
      });
      return;
    }
    if ((b = t.closest('[data-acc-inv]'))) { local.invAll = true; ctx.refresh(); return; }
    if ((b = t.closest('[data-acc-receipt]'))) {
      var inv = R.invoices().filter(function (x) { return x.id === b.getAttribute('data-acc-receipt'); })[0];
      if (!inv) return;
      U.download('領収書_' + isoDay(inv.at) + '.html', receiptHtml(inv), 'text/html');
      U.toast(jaMD(inv.at) + 'の領収書を保存しました', 'ok');
      return;
    }
    if ((b = t.closest('[data-acc-plan]'))) {
      var what = b.getAttribute('data-acc-plan');
      if (what === 'resume') {
        if (R.plan().status !== 'canceling') { ctx.refresh(); return; }   // 描き直す前に押された古いボタン
        resumeToast(R.resumePlan());
      } else if (what === 'unpause') {
        // 試作版の札で休会にしたとき（SITE.allowPause が false）は、ルールの resumePause が動かないので、状態だけ戻す
        if (!R.resumePause()) R.setPlanDemo('active');
        U.toast('休会をやめました。今日から使えます', 'ok');
      }
      // 契約の欄は状態で並びが変わるので、?focus=plan の仕組みでその場所へ動かして焦点を置く
      ctx.go('#/account?focus=plan');
      return;
    }
    if ((b = t.closest('[data-acc-email]'))) {
      var ea = b.getAttribute('data-acc-email'), r;
      if (ea === 'change') { openEmail(); return; }
      if (ea === 'confirm') {
        r = R.confirmEmailChange('demo');
        if (!r.ok) { U.toast(r.error, 'error'); ctx.refresh(); return; }
        U.toast('メールアドレスを ' + r.email + ' に変更しました', 'ok');
        ctx.refresh({ focus: '#acc-email [data-acc-email="change"]' });
        return;
      }
      if (ea === 'resend') {
        r = R.resendEmailChange();
        if (!r.ok) { U.toast(r.wait ? '送り直しは、あと' + r.wait + '秒たってからできます' : r.error); return; }
        U.toast('確認のメールを送り直しました', 'ok');
        ctx.refresh();
        return;
      }
      if (ea === 'cancel') {
        R.cancelEmailChange();
        U.toast('メールアドレスの変更を取り消しました');
        ctx.refresh({ focus: '#acc-email [data-acc-email="change"]' });
      }
      return;
    }
    if ((b = t.closest('[data-acc-password]'))) { openPassword(); return; }
    if ((b = t.closest('[data-acc-session]'))) {
      var dev = b.getAttribute('aria-label') || '';
      if (R.logoutSession(b.getAttribute('data-acc-session'))) U.toast(dev.replace(/をログアウト$/, '') + 'をログアウトしました');
      // 押したボタンは消えるので、残りがあれば「ほかの端末からログアウト」、なければ見出しへ
      var left = R.sessions().some(function (x) { return !x.current; });
      ctx.refresh({ focus: left ? '#acc-sessions [data-acc-sessions]' : '#acc-sessions .acc-row__k' });
      return;
    }
    if ((b = t.closest('[data-acc-sessions]'))) {
      var n = R.logoutOthers();
      U.toast('ほかの端末' + (n ? '（' + n + '台）' : '') + 'からログアウトしました');
      ctx.refresh({ focus: '#acc-sessions .acc-row__k' });
      return;
    }
    if ((b = t.closest('[data-acc-line]'))) {
      var la = b.getAttribute('data-acc-line');
      if (la === 'start') {
        // スタートガイドと同じ窓（スマホは LINE のアプリへ、パソコンは友だち追加のコード）。済んだらこの画面も描き直る
        var S = CLG.screens.start;
        if (S && S.runStep) { S.runStep('line', null, ctx); return; }
        var res = R.finishLineLink(true);
        if (res && res.steps) CLG.app.reward(res); else U.toast(SITE.lineName + 'と連携しました', 'ok');
        ctx.refresh({ focus: '#acc-line [data-acc-line="unlink"]' });
        return;
      }
      if (la === 'cancel') { R.unlinkLine(); ctx.refresh({ focus: '#acc-line [data-acc-line="start"]' }); return; }
      if (la === 'unlink') {
        U.confirmBox('LINEの連携を外す', '外すと、LINEには通知が届かなくなります。メールの通知はそのままです。', '外す', true).then(function (ok) {
          if (!ok) return;
          R.unlinkLine();
          U.toast('LINEの連携を外しました');
          ctx.refresh({ focus: '#acc-line [data-acc-line="start"]' });
        });
      }
      return;
    }
    if ((b = t.closest('[data-acc-unmute]'))) {
      var mid = b.getAttribute('data-acc-unmute'), mwho = R.person(mid);
      R.unmutePerson(mid);
      U.toast(mwho.name + 'さんのミュートをやめました', null, { action: '元に戻す', onAction: function () {
        R.mutePerson(mid);
        CLG.app.refresh({ focus: "[data-acc-unmute='" + mid + "']" });
      } });
      ctx.refresh();
      return;
    }
    if ((b = t.closest('[data-acc-data]'))) {
      var da = b.getAttribute('data-acc-data');
      if (da === 'export') {
        U.confirmBox('記録を書き出す', 'プロフィール・学びの記録・投稿・ポイント・お支払いを、1つのファイルにまとめます。できたら、この画面から保存できます。', '書き出す', false, { kind: 'ink' }).then(function (ok) {
          if (!ok) return;
          var rq = R.requestData('export');
          if (!rq || !rq.ok) { U.toast((rq && rq.error) || '受け付けられませんでした', 'error'); return; }
          ctx.refresh({ focus: '#acc-export .acc-row__s' });
          // 試作版：数秒で用意ができたことにする（運営画面が開いていれば、運営が済みにする）
          scheduleExport();
        });
        return;
      }
      if (da === 'save') {
        U.download(SITE.name + '_記録_' + isoDay(now()) + '.json', exportJson(), 'application/json', { bom: false });
        U.toast('記録を保存しました', 'ok');
        return;
      }
      if (da === 'delete') {
        var p = R.plan();
        U.confirmBox('記録の削除を申し込む',
          (p.status === 'ended' ? '' : '会員期間が終わったあと') + DELETE_DAYS + '日以内に、アカウントと記録（学びの記録・投稿・ポイント）を削除します。削除したものは戻せません。' +
          (p.status === 'active' ? '\n解約は別の手続きです。' : ''), '申し込む', true).then(function (ok) {
          if (!ok) return;
          var rd = R.requestData('delete');
          if (!rd || !rd.ok) { U.toast((rd && rd.error) || '受け付けられませんでした', 'error'); return; }
          U.toast('削除の申込みを受け付けました', 'ok');
          ctx.refresh({ focus: '#acc-delete [data-acc-data="undelete"]' });
        });
        return;
      }
      if (da === 'undelete') {
        var dr = lastReq('delete');
        if (dr && R.cancelDataRequest(dr.id)) U.toast('削除の申込みを取り消しました');
        ctx.refresh();
      }
      return;
    }
    if ((b = t.closest('[data-acc-a2hs]'))) { openA2hs(); return; }
    if ((b = t.closest('[data-acc-logout]'))) {
      // 骨組みのログアウト（窓を閉じる・メニューの覚えを消す・ログインの画面へ・知らせ）に任せる（§5-5）
      resetLocal();
      if (CLG.app.logout) { CLG.app.logout(); return; }
      U.closePops();
      CLG.store.logout();
      try { history.replaceState(null, '', location.pathname + location.search); } catch (err) {}
      CLG.app.refresh();
      U.toast('ログアウトしました');
      return;
    }

    /* 解約の画面 */
    if ((b = t.closest('[data-acc-reason]'))) {
      var v = b.getAttribute('data-acc-reason'), i = local.reasons.indexOf(v);
      if (i >= 0) local.reasons.splice(i, 1); else local.reasons.push(v);
      b.setAttribute('aria-pressed', String(i < 0));
      return;
    }
    if ((b = t.closest('[data-acc-pause-n]'))) {
      local.pauseMonths = +b.getAttribute('data-acc-pause-n') || 1;
      U.$$('[data-acc-pause-n]', b.parentNode).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      var back = document.querySelector('[data-acc-pause-back]');
      if (back) back.innerHTML = pauseBack(R.plan(), local.pauseMonths);
      return;
    }
    if ((b = t.closest('[data-acc-pause]'))) {
      var pp = R.pausePlan(local.pauseMonths);
      if (!pp) { U.toast('いまは休会できません', 'error'); return; }
      U.toast('休会にしました（' + day(pp.pausedUntil) + 'から再開）', 'ok');
      ctx.go('#/account?focus=plan');
      return;
    }
    if ((b = t.closest('[data-acc-cancel]'))) {
      // 確認の窓は出さない（2回の操作で終わらせるため）。理由は plan().cancelReasons に残る（運営画面の集計）
      CLG.app.reward(R.cancelPlan({ reasons: local.reasons.slice() }));
      markJustCanceled();
      local.sentReasons = local.reasons.slice();
      local.reasons = [];
      ctx.refresh({ focus: '#accDoneTtl' });
      try { window.scrollTo(0, 0); } catch (err) {}
      // 休会中・支払いエラーのままの解約は「使える」と言わない（止まったまま・期限で止まる）
      var np = R.plan();
      ctx.announce('解約を受け付けました。' + U.fmtDate(np.lastDay) + (np.status === 'paused' || unpaidCancel(np) ? 'で会員期間が終わります' : 'まで使えます'));
      return;
    }
    if ((b = t.closest('[data-acc-resume]'))) {
      if (R.plan().status !== 'canceling') { ctx.refresh(); return; }
      resumeToast(R.resumePlan());
      local.justCanceled = false;
      ctx.go('#/account?focus=plan');
    }
  }

  function onChange(e) {
    var ctx = cur, sw = e.target.closest && e.target.closest('.scr-account [data-acc-notify]');
    if (!ctx || !sw) return;
    var type = sw.getAttribute('data-acc-notify'), ch = sw.getAttribute('data-ch'), on = sw.checked;
    if (!R.setNotifyPref(type, ch, on)) { sw.checked = !on; return; }
    var t = (R.notifyPrefs().filter(function (x) { return x.id === type; })[0] || {}).name || '';
    ctx.announce(t + '：' + (ch === 'line' ? 'LINE' : 'メール') + 'を' + (on ? 'オン' : 'オフ') + 'にしました');
  }

  CLG.screens = CLG.screens || {};
  /* #/account と #/account/cancel のほかは「見つかりません」 */
  function known(ctx) { return !ctx.params[0] || (ctx.params[0] === 'cancel' && ctx.params.length === 1); }
  CLG.screens.account = {
    title: function (ctx) { return !known(ctx) ? 'ページが見つかりません' : ctx.params[0] === 'cancel' ? '解約の手続き' : 'アカウント'; },
    render: function (ctx) {
      if (!known(ctx)) return U.notFound({ lead: 'アカウントの中に、このページはありません。' });
      return ctx.params[0] === 'cancel' ? renderCancel(ctx) : renderAccount(ctx);
    },
    back: function (ctx) { return ctx.params[0] ? { href: '#/account', label: 'アカウント' } : null; },
    mount: function (root, ctx) {
      cur = ctx;
      if (!root.__boundAccount) {
        root.__boundAccount = true;
        root.addEventListener('click', onClick);
        root.addEventListener('change', onChange);
      }
      applyFocus(ctx);
      // 受付中の書き出し（読み込み直したとき・ほかの画面から戻ったとき）も、数秒で「できた」にする
      scheduleExport();
    }
  };
})();
