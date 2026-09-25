/* ============================================================
   運営画面：設定（#/settings）
   ?tab=plan（料金とレベル。既定）| referral（紹介の形）| rules（ルールと規約）| staff（運営の人と役割）| audit（操作の記録）| templates（送る文面）
   ?log=<記録のid>（操作の記録の引き出し）  ?tpl=<文面のid>（送る文面の見本）  ?raw=1（差し込みの印のまま見る）
   - いまの値は data.js（DATA.SITE・LEVELS・XP・REFERRAL・RULES・MAIL_TEMPLATES）から読む。
     変更は「反映する日」を決めて予約する（settingChanges。AD.db.ensure）。会員ページに出るのは反映の日から。
     本番では反映の日に設定の保存先を書き換える。試作版は予約と操作の記録まで。
   - 役割で押せるものを分ける：料金・紹介の形・規約・運営の人は「代表」だけ。レベル・XP・ルールは「代表」と「運営」。
     押せないボタンは disabled にして、理由を横に書く。
   - 会員に知らせる（値上げ・規約の改定・ルールの変更）は AD.cms.notify（R.cmsUpsert('notice')。全員のお知らせに出て、
     開いている会員ページの鈴にもすぐ届く。見る人を切り替えても残る）。
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, AD = CLG.admin, AU = AD.ui, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon, SITE = DATA.SITE, RF = DATA.REFERRAL;
  var cur = null;
  var DAY = 86400000;
  var ROLES = AU.ROLES;
  /* 役割でできること：正本は AU.ROLE_TABLE（admin/ui.js）。ほかの画面もそれを見て押せるものを分けるので、表もそこから作る。
     このファイルの owner＝料金・紹介の形・規約（代表だけ）、ops＝レベル・XP・ルール（代表と運営） */
  var GROUP = { owner: 'owner', ops: 'rules', staff: 'staff' };
  var MATRIX = AU.ROLE_TABLE.map(function (row) {
    return [row.name, ROLES.map(function (r) { var v = row.can[r]; return v === true ? '○' : typeof v === 'string' ? row.part[v] : '―'; })];
  });
  var DOCS = [['terms', '利用規約'], ['privacy', 'プライバシーポリシー'], ['tokushoho', '特定商取引法に基づく表記']];

  function staff() { return AD.db.staff() || { role: '運営' }; }
  function can(k) { return AU.can(GROUP[k] || k); }
  function whoCan(k) { return AU.whoCan(GROUP[k] || k); }
  function nowIso() { return CLG.now().toISOString(); }
  function staffId() { return staff().id || AD.db.DEMO_STAFF; }
  function hashWith(patch) { return AD.app.hashOf('settings', Object.assign({}, (cur && cur.query) || {}, patch)); }
  function ymd(d) { d = new Date(d); return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate()); }
  function nextMonth1() { var n = CLG.now(); return new Date(n.getFullYear(), n.getMonth() + 1, 1); }
  function addDays(d, k) { return new Date(new Date(d).getTime() + k * DAY); }
  function changes() { return AD.db.ensure('settingChanges', function () { return []; }); }
  function pending(key) { return changes().filter(function (c) { return c.key === key && c.status === 'scheduled'; }); }
  function staffList() { return AD.db.state.staff; }

  /* 押せないときは、ボタンを disabled にして横に理由を書く */
  function editBtn(key, group, label) {
    var ok = can(group);
    return '<span class="st-edit">' + (ok ? '' : '<span class="pm-muted">' + esc('変えられるのは' + whoCan(group) + 'だけ') + '</span>') +
      '<button type="button" class="btn btn-ghost btn-s" data-st-edit="' + esc(key) + '"' + (ok ? '' : ' disabled') + '>' + esc(label || '変更する') + '</button></span>';
  }
  function pendingNote(key) {
    var ps = pending(key);
    return ps.map(function (c) {
      return '<p class="st-pend"><span><b>' + esc(U.fmtShort(c.effectiveAt)) + 'から</b> ' + esc(c.summary) + '<span class="pm-muted">（' + esc(AD.db.staffName(c.by)) + 'が予約）</span></span>' +
        (can(c.group) ? '<button type="button" class="btn btn-text btn-s" data-st-cancel="' + esc(c.id) + '">予約を取り消す</button>' : '') + '</p>';
    }).join('');
  }

  /* 予約を足す（操作の記録にも残す）。notify があれば会員ページのお知らせにも出す */
  function schedule(o, reason) {
    var c = { id: AD.db.uid('sc'), key: o.key, group: o.group, label: o.label, summary: o.summary, from: o.from || '', payload: o.payload || null,
      effectiveAt: o.effectiveAt, at: nowIso(), by: staffId(), reason: reason, status: 'scheduled', notified: false };
    if (o.notify) {
      var res = AD.cms.notify({ target: 'all', text: o.notify, link: o.link || '' });
      c.notified = !!(res && res.ok);
    }
    AD.db.update(function (s) { (s.settingChanges = s.settingChanges || []).unshift(c); });
    return c;
  }
  function dateField(def, min, label) {
    return '<label class="field"><span>' + esc(label || '反映する日') + '</span><input class="input" type="date" name="eff" value="' + esc(ymd(def)) + '" min="' + esc(ymd(min)) + '" required></label>';
  }
  function checkDate(f, min) {
    var d = f.eff ? new Date(f.eff + 'T00:00:00') : null;
    if (!d || isNaN(d)) return { ok: false, errors: { eff: '日付を入れてください' } };
    if (d < new Date(ymd(min) + 'T00:00:00')) return { ok: false, errors: { eff: U.fmtShort(min) + 'より後の日にしてください' } };
    return { ok: true, date: d };
  }

  /* ============================================================
     料金とレベル
     ============================================================ */
  function planTab() {
    var ms = AD.data.members().filter(function (m) { return m.status !== 'left'; });
    var price = AU.panel({
      title: '料金と請求', id: 'stPrice', cls: 'st-panel', actions: editBtn('price', 'owner'),
      body: AU.kv([
        ['月額（税込）', '<b class="num">' + esc(U.yen(SITE.price)) + '</b>', true],
        ['入会金', U.yen(SITE.entryFee || 0)],
        ['請求', SITE.billing],
        ['支払い方法', SITE.payment],
        ['最低契約期間', 'なし（いつでも解約できる）'],
        ['支払いエラーの猶予', (SITE.graceDays || 7) + '日（過ぎたら講座とイベントを止める）'],
        ['退会後に記録を残す', (SITE.keepDays || 365) + '日'],
        ['休会', SITE.allowPause ? '会員ページに出す' : '出さない（試作版の札からだけ）']
      ]) + pendingNote('price')
    });
    var lvRows = DATA.LEVELS.map(function (l, i) {
      var next = DATA.LEVELS[i + 1];
      var n = ms.filter(function (m) { return m.level === l.lv; }).length;
      var cs = DATA.COURSES.filter(function (c) { return c.level === l.lv; });
      return '<tr><td class="nw is-main"><b>Lv' + l.lv + '</b> ' + esc(l.name) + '</td><td class="r num nw" data-label="XP">' + U.num(l.min) + (next ? '〜' + U.num(next.min - 1) : '〜') + '</td>' +
        '<td data-label="開く講座">' + (cs.length ? esc(cs.map(function (c) { return c.title; }).join('・')) : '<span class="pm-muted">―</span>') + '</td><td class="r num nw" data-label="いまの人数">' + n + '人</td></tr>';
    }).join('');
    var levels = AU.panel({
      title: 'レベル', id: 'stLevels', cls: 'st-panel', flush: true, actions: editBtn('levels', 'ops'),
      body: '<div class="ad-tbl-wrap"><table class="ad-tbl is-dense is-cards st-lv" aria-label="レベルの区切り"><thead><tr><th scope="col">レベル</th><th scope="col" class="r">XP</th><th scope="col">開く講座</th><th scope="col" class="r">いまの人数</th></tr></thead><tbody>' + lvRows + '</tbody></table></div>' +
        (pending('levels').length ? '<div class="ad-panel__pad">' + pendingNote('levels') + '</div>' : '')
    });
    var X = DATA.XP;
    var xpList = [['講座を1回見終える', X.lesson], ['勉強会の録画を1本見る', X.archive], ['イベントに参加する', X.event], ['タイムラインに投稿する（1日' + X.postPerDay + '回まで）', X.post],
      ['案件をやり終える', X.gigDone], ['講座の確認テストに合格する', X.quiz]];
    var xp = AU.panel({
      title: 'XP（学びの経験値）', id: 'stXp', cls: 'st-panel', actions: editBtn('xp', 'ops'),
      body: '<ul class="st-xp">' + xpList.map(function (x) { return '<li><span>' + esc(x[0]) + '</span><b class="num">+' + x[1] + ' XP</b></li>'; }).join('') + '</ul>' +
        '<p class="st-note">紹介の人数ではレベルは上がりません。</p>' + pendingNote('xp')
    });
    return '<div class="st-cols">' + price + xp + '</div>' + levels;
  }
  function editPrice() {
    var min = addDays(CLG.now(), 30), def = nextMonth1() < min ? new Date(min.getFullYear(), min.getMonth() + 1, 1) : nextMonth1();
    AU.act({
      title: '月額を変える', ok: '予約する', kind: 'ink', cls: 'a-settings',
      text: 'いまは ' + U.yen(SITE.price) + '（税込）。変えた額は、反映する日のあとの最初の請求から使います。',
      fields: '<label class="field"><span>新しい月額（税込・円）</span><input class="input num" type="number" name="price" inputmode="numeric" min="1000" max="100000" step="100" value="' + SITE.price + '" required></label>' +
        dateField(def, min) +
        '<label class="check"><input type="checkbox" name="notify" checked><span>会員に知らせる（お知らせ・メール）</span></label>',
      reasons: ['講座と案件が増えたため', '決済の手数料の見直し'],
      run: function (reason, f) {
        var p = Math.round(Number(f.price));
        if (!p || p < 1000 || p > 100000) return { ok: false, errors: { price: '1,000〜100,000円で入れてください' } };
        if (p === SITE.price) return { ok: false, errors: { price: 'いまと同じ額です' } };
        var d = checkDate(f, min); if (!d.ok) return d;
        if (p > SITE.price && !f.notify) return { ok: false, error: '値上げのときは、会員に知らせてください' };
        var c = schedule({ key: 'price', group: 'owner', label: '月額', summary: '月額 ' + U.yen(SITE.price) + ' → ' + U.yen(p) + '（税込）', from: U.yen(SITE.price), payload: { price: p }, effectiveAt: d.date.toISOString(),
          notify: f.notify ? U.fmtShort(d.date) + 'から月額を' + U.yen(p) + '（税込）に変えます。それまでの請求は' + U.yen(SITE.price) + 'です。' : '', link: '#/account?focus=plan' }, reason);
        return { ok: true, c: c };
      },
      audit: function (reason, f, r) { return { action: 'setting_change', label: '月額の変更を予約した', target: { type: 'setting', id: 'price', name: '月額' }, detail: r.c.summary + '・' + U.fmtShort(r.c.effectiveAt) + 'から' + (r.c.notified ? '・会員に知らせた' : '') }; },
      done: '予約しました'
    }).then(function (r) { if (r && cur) cur.refresh(); });
  }
  function editLevels() {
    var min = addDays(CLG.now(), 1);
    AU.act({
      title: 'レベルの区切りを変える', ok: '予約する', kind: 'ink', cls: 'a-settings', wide: true,
      text: 'XP が下がる人は出ません。区切りを上げると、いまのレベルのまま次に上がるまでの XP が増えます。',
      fields: '<table class="st-lvedit"><thead><tr><th scope="col">レベル</th><th scope="col">名前</th><th scope="col">必要なXP</th></tr></thead><tbody>' +
        DATA.LEVELS.map(function (l, i) {
          return '<tr><th scope="row">Lv' + l.lv + '</th><td><input class="input" name="n' + l.lv + '" value="' + esc(l.name) + '" maxlength="6" aria-label="Lv' + l.lv + 'の名前" required></td>' +
            '<td><input class="input num" type="number" name="x' + l.lv + '" value="' + l.min + '" min="0" step="10" aria-label="Lv' + l.lv + 'に必要なXP"' + (i === 0 ? ' readonly' : '') + ' required></td></tr>';
        }).join('') + '</tbody></table>' + dateField(nextMonth1(), min),
      reasons: ['Lv4 までが早すぎる', '名前を分かりやすくする'],
      run: function (reason, f) {
        var errs = {}, list = [], changed = [];
        DATA.LEVELS.forEach(function (l, i) {
          var name = String(f['n' + l.lv] || '').trim(), x = Math.round(Number(f['x' + l.lv]));
          if (!name) errs['n' + l.lv] = '名前を入れてください';
          if (i && (!(x > list[i - 1].min))) errs['x' + l.lv] = 'ひとつ前より大きくしてください';
          list.push({ lv: l.lv, name: name, min: i ? x : 0 });
          if (name !== l.name || (i && x !== l.min)) changed.push('Lv' + l.lv + (name !== l.name ? ' ' + l.name + '→' + name : '') + (i && x !== l.min ? ' ' + l.min + '→' + x + 'XP' : ''));
        });
        if (Object.keys(errs).length) return { ok: false, errors: errs };
        if (!changed.length) return { ok: false, error: '変わったところがありません' };
        var d = checkDate(f, min); if (!d.ok) return d;
        return { ok: true, c: schedule({ key: 'levels', group: 'ops', label: 'レベル', summary: changed.join('、'), payload: { levels: list }, effectiveAt: d.date.toISOString() }, reason) };
      },
      audit: function (reason, f, r) { return { action: 'setting_change', label: 'レベルの変更を予約した', target: { type: 'setting', id: 'levels', name: 'レベル' }, detail: r.c.summary }; },
      done: '予約しました'
    }).then(function (r) { if (r && cur) cur.refresh(); });
  }
  function editXp() {
    var X = DATA.XP, min = addDays(CLG.now(), 1);
    var items = [['lesson', '講座を1回見終える'], ['archive', '勉強会の録画を1本見る'], ['event', 'イベントに参加する'], ['post', 'タイムラインに投稿する'], ['postPerDay', '投稿で XP が付く回数（1日）'], ['gigDone', '案件をやり終える'], ['quiz', '確認テストに合格する']];
    AU.act({
      title: 'XP を変える', ok: '予約する', kind: 'ink', cls: 'a-settings',
      fields: '<div class="st-xpedit">' + items.map(function (x) {
        return '<label class="field"><span>' + esc(x[1]) + '</span><input class="input num" type="number" name="' + x[0] + '" value="' + X[x[0]] + '" min="0" max="200" step="1" required></label>';
      }).join('') + '</div>' + dateField(nextMonth1(), min),
      reasons: ['イベントへの参加を増やしたい', '投稿の数を追いかけすぎないように'],
      run: function (reason, f) {
        var changed = [], errs = {}, p = {};
        items.forEach(function (x) {
          var v = Math.round(Number(f[x[0]]));
          if (isNaN(v) || v < 0 || v > 200) errs[x[0]] = '0〜200で入れてください';
          p[x[0]] = v; if (v !== X[x[0]]) changed.push(x[1] + ' ' + X[x[0]] + '→' + v);
        });
        if (Object.keys(errs).length) return { ok: false, errors: errs };
        if (!changed.length) return { ok: false, error: '変わったところがありません' };
        var d = checkDate(f, min); if (!d.ok) return d;
        return { ok: true, c: schedule({ key: 'xp', group: 'ops', label: 'XP', summary: changed.join('、'), payload: p, effectiveAt: d.date.toISOString() }, reason) };
      },
      audit: function (reason, f, r) { return { action: 'setting_change', label: 'XP の変更を予約した', target: { type: 'setting', id: 'xp', name: 'XP' }, detail: r.c.summary }; },
      done: '予約しました'
    }).then(function (r) { if (r && cur) cur.refresh(); });
  }

  /* ============================================================
     紹介の形
     ============================================================ */
  function referralTab() {
    var per = Math.round(SITE.price * RF.rate);
    return '<div class="notice notice-warn st-legal">' + icon('alert') + '<div>紹介の形・料率・支払いの条件を変えるときは、先に弁護士の確認を受けます（特定商取引法の連鎖販売取引に当たらないか）。紹介は1段だけ、紹介人数で料率を上げない、の2つは変えられません。</div></div>' +
      AU.panel({
        title: '紹介報酬', id: 'stRef', cls: 'st-panel', actions: editBtn('referral', 'owner'),
        body: AU.kv([
          ['報酬の形', RF.model === 'once' ? '1人につき1回' : '紹介した方が在籍しているあいだ毎月'],
          ['料率', RF.model === 'once' ? U.yen(RF.onceAmount) + '（1回）' : Math.round(RF.rate * 100) + '%（' + U.yen(per) + '／月）'],
          ['保留', '初回の決済から' + RF.holdDays + '日（返金・解約がなければ確定）'],
          ['締めと支払い', '月末締め・翌月' + RF.payDay + '日払い（土日は翌営業日）'],
          ['最低支払額', U.yen(RF.minPayout) + '（届かない月は繰り越し）'],
          ['段数', '1段だけ（変えられません）'],
          ['紹介人数と料率', '人数で上げない（変えられません）'],
          ['ランキング', '紹介は数えない（貢献ポイントと学びのXPだけ）']
        ]) + pendingNote('referral')
      });
  }
  function editReferral() {
    var min = addDays(CLG.now(), 14);
    AU.act({
      title: '紹介報酬の形を変える', ok: '予約する', kind: 'ink', cls: 'a-settings',
      fields: '<fieldset class="st-radios"><legend class="field__label">報酬の形</legend>' +
          '<label class="check"><input type="radio" name="model" value="monthly"' + (RF.model !== 'once' ? ' checked' : '') + '><span>在籍中は毎月（料率）</span></label>' +
          '<label class="check"><input type="radio" name="model" value="once"' + (RF.model === 'once' ? ' checked' : '') + '><span>1人につき1回（金額）</span></label></fieldset>' +
        '<div class="st-row2"><label class="field"><span>料率（%）</span><input class="input num" type="number" name="rate" value="' + Math.round(RF.rate * 100) + '" min="1" max="50" step="1"></label>' +
        '<label class="field"><span>1回の金額（円）</span><input class="input num" type="number" name="once" value="' + RF.onceAmount + '" min="100" max="20000" step="100"></label></div>' +
        '<div class="st-row2"><label class="field"><span>保留（日）</span><input class="input num" type="number" name="hold" value="' + RF.holdDays + '" min="14" max="90" step="1"></label>' +
        '<label class="field"><span>最低支払額（円）</span><input class="input num" type="number" name="minp" value="' + RF.minPayout + '" min="0" max="10000" step="100"></label></div>' +
        dateField(new Date(min.getFullYear(), min.getMonth() + 1, 1), min) +
        '<label class="check"><input type="checkbox" name="legal" required><span>弁護士の確認が済んでいる</span></label>',
      reasons: ['弁護士の確認をもとに1回払いへ', '料率の見直し'],
      run: function (reason, f) {
        if (!f.legal) return { ok: false, error: '弁護士の確認が済んでから予約してください' };
        var rate = Math.round(Number(f.rate)), once = Math.round(Number(f.once)), hold = Math.round(Number(f.hold)), minp = Math.round(Number(f.minp));
        var errs = {};
        if (f.model === 'monthly' && !(rate >= 1 && rate <= 50)) errs.rate = '1〜50%で入れてください';
        if (f.model === 'once' && !(once >= 100 && once <= 20000)) errs.once = '100〜20,000円で入れてください';
        if (!(hold >= 14 && hold <= 90)) errs.hold = '14〜90日で入れてください';
        if (!(minp >= 0 && minp <= 10000)) errs.minp = '0〜10,000円で入れてください';
        if (Object.keys(errs).length) return { ok: false, errors: errs };
        var d = checkDate(f, min); if (!d.ok) return d;
        var sum = (f.model === 'once' ? '1人につき1回 ' + U.yen(once) : '毎月 ' + rate + '%') + '・保留' + hold + '日・最低' + U.yen(minp);
        var now = (RF.model === 'once' ? '1人につき1回 ' + U.yen(RF.onceAmount) : '毎月 ' + Math.round(RF.rate * 100) + '%') + '・保留' + RF.holdDays + '日・最低' + U.yen(RF.minPayout);
        if (sum === now) return { ok: false, error: '変わったところがありません' };
        return { ok: true, c: schedule({ key: 'referral', group: 'owner', label: '紹介報酬', summary: now + ' → ' + sum, payload: { model: f.model, rate: rate / 100, onceAmount: once, holdDays: hold, minPayout: minp }, effectiveAt: d.date.toISOString(),
          notify: U.fmtShort(d.date) + 'から紹介報酬の条件が変わります。くわしくは紹介の画面の「報酬のしくみ」を見てください。', link: '#/referral' }, reason) };
      },
      audit: function (reason, f, r) { return { action: 'setting_change', label: '紹介報酬の変更を予約した', target: { type: 'setting', id: 'referral', name: '紹介報酬' }, detail: r.c.summary }; },
      done: '予約しました'
    }).then(function (r) { if (r && cur) cur.refresh(); });
  }

  /* ============================================================
     ルールと規約
     ============================================================ */
  function termsRows() {
    var made = SITE.docsDate.made, rev = SITE.docsDate.revised;
    return DOCS.map(function (d) {
      var hist = changes().filter(function (c) { return c.key === 'terms' && c.payload && c.payload.doc === d[0]; });
      var next = hist.filter(function (c) { return c.status === 'scheduled'; })[0];
      var ver = '1.' + (made === rev ? 0 : 1);
      return { id: d[0], name: d[1], ver: ver, made: made, revised: rev, next: next || null, hist: hist };
    });
  }
  function rulesTab() {
    var rp = pending('rules')[0];
    var rules = AU.panel({
      title: DATA.RULES_TITLE, id: 'stRules', cls: 'st-panel', actions: editBtn('rules', 'ops', '書き直す'),
      body: '<ol class="st-rules">' + DATA.RULES.map(function (r) { return '<li>' + U.jp(r) + '</li>'; }).join('') + '</ol>' + pendingNote('rules') +
        (rp && rp.payload ? '<details class="st-diff"><summary>予約した文を見る</summary><ol class="st-rules">' + rp.payload.rules.map(function (r) { return '<li>' + U.jp(r) + '</li>'; }).join('') + '</ol></details>' : '')
    });
    var docs = termsRows();
    var terms = AU.panel({
      title: '規約の版', id: 'stTerms', cls: 'st-panel', flush: true, actions: editBtn('terms', 'owner', '改定を予約する'),
      body: '<div class="ad-tbl-wrap"><table class="ad-tbl is-dense is-cards" aria-label="規約の版"><thead><tr><th scope="col">文書</th><th scope="col">版</th><th scope="col">制定</th><th scope="col">最後の改定</th><th scope="col">次の改定</th></tr></thead><tbody>' +
        docs.map(function (d) {
          return '<tr><td class="is-main"><b>' + esc(d.name) + '</b></td><td data-label="版" class="num">' + esc(d.ver) + '</td>' +
            '<td data-label="制定" class="num nw">' + esc(U.fmtDate(d.made + 'T10:00:00', { wd: false })) + '</td><td data-label="最後の改定" class="num nw">' + esc(U.fmtDate(d.revised + 'T10:00:00', { wd: false })) + '</td>' +
            '<td data-label="次の改定">' + (d.next ? '<span class="num">' + esc(U.fmtShort(d.next.effectiveAt)) + '</span>から・' + esc(d.next.summary) : '<span class="pm-muted">―</span>') + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<p class="st-foot">試作版の規約はひな形です（事業者名などは調整中）。改定は施行の14日以上前に会員に知らせます。</p>'
    });
    return rules + terms;
  }
  function editRules() {
    var min = addDays(CLG.now(), 1);
    AU.act({
      title: DATA.RULES_TITLE + 'を書き直す', ok: '予約する', kind: 'ink', cls: 'a-settings', wide: true,
      fields: '<label class="field"><span>ルール（1行に1つ・10個まで）</span><textarea class="textarea" name="rules" rows="8" maxlength="1200" required>' + esc(DATA.RULES.join('\n')) + '</textarea></label>' +
        dateField(addDays(CLG.now(), 7), min) +
        '<label class="check"><input type="checkbox" name="notify" checked><span>会員に知らせる（お知らせ）</span></label>',
      reasons: ['勧誘の相談が増えたため', '言い回しを分かりやすく'],
      run: function (reason, f) {
        var list = String(f.rules || '').split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean);
        if (!list.length) return { ok: false, errors: { rules: 'ルールを1つ以上入れてください' } };
        if (list.length > 10) return { ok: false, errors: { rules: '10個までにしてください' } };
        if (list.join('\n') === DATA.RULES.join('\n')) return { ok: false, errors: { rules: '変わったところがありません' } };
        var d = checkDate(f, min); if (!d.ok) return d;
        var added = list.filter(function (x) { return DATA.RULES.indexOf(x) < 0; }).length, removed = DATA.RULES.filter(function (x) { return list.indexOf(x) < 0; }).length;
        return { ok: true, c: schedule({ key: 'rules', group: 'ops', label: DATA.RULES_TITLE, summary: list.length + '個（書き直し ' + Math.max(added, removed) + '個）', payload: { rules: list }, effectiveAt: d.date.toISOString(),
          notify: f.notify ? U.fmtShort(d.date) + 'から' + DATA.RULES_TITLE + 'が変わります。' : '', link: '#/help' }, reason) };
      },
      audit: function (reason, f, r) { return { action: 'setting_change', label: DATA.RULES_TITLE + 'の変更を予約した', target: { type: 'setting', id: 'rules', name: DATA.RULES_TITLE }, detail: r.c.summary }; },
      done: '予約しました'
    }).then(function (r) { if (r && cur) cur.refresh(); });
  }
  function editTerms() {
    var min = addDays(CLG.now(), 14);
    AU.act({
      title: '規約の改定を予約する', ok: '予約する', kind: 'ink', cls: 'a-settings',
      fields: '<label class="field"><span>文書</span><select class="select" name="doc">' + DOCS.map(function (d) { return '<option value="' + d[0] + '">' + esc(d[1]) + '</option>'; }).join('') + '</select></label>' +
        dateField(min, min, '施行日') +
        '<label class="field"><span>変わるところ（会員に知らせる文）</span><textarea class="textarea" name="what" rows="3" maxlength="100" required placeholder="例：解約の受付時間を「平日10:00〜18:00」に直します"></textarea><small>100文字まで。くわしい新旧対照は規約のページに載せます</small></label>' +
        '<label class="check"><input type="checkbox" name="notify" checked disabled><span>会員に知らせる（改定は必ず知らせます）</span></label>',
      reasons: ['事業者の情報が決まった', '法務の確認で文言を直す'],
      run: function (reason, f) {
        var what = String(f.what || '').trim();
        if (!what) return { ok: false, errors: { what: '変わるところを入れてください' } };
        var d = checkDate(f, min); if (!d.ok) return d;
        var doc = DOCS.filter(function (x) { return x[0] === f.doc; })[0] || DOCS[0];
        return { ok: true, c: schedule({ key: 'terms', group: 'owner', label: doc[1], summary: doc[1] + '：' + what, payload: { doc: doc[0], what: what }, effectiveAt: d.date.toISOString(),
          notify: U.fmtShort(d.date) + 'から' + doc[1] + 'を改定します。' + what, link: '' }, reason) };
      },
      audit: function (reason, f, r) { return { action: 'setting_change', label: '規約の改定を予約した', target: { type: 'setting', id: 'terms', name: r.c.label }, detail: r.c.summary + '・' + U.fmtShort(r.c.effectiveAt) + '施行' }; },
      done: '予約して、会員に知らせました'
    }).then(function (r) { if (r && cur) cur.refresh(); });
  }
  function cancelChange(id) {
    var c = changes().filter(function (x) { return x.id === id; })[0]; if (!c) return;
    AU.act({
      title: '予約を取り消す', ok: '取り消す', danger: true, cls: 'a-settings',
      text: U.fmtShort(c.effectiveAt) + 'から：' + c.summary + (c.notified ? '\n会員には知らせてあります。取り消したことも知らせます。' : ''),
      reasons: ['見送りになった', '内容を直して予約し直す'],
      run: function (reason) {
        if (c.notified) AD.cms.notify({ target: 'all', text: U.fmtShort(c.effectiveAt) + 'からの「' + c.label + '」の変更は取りやめになりました。', link: '' });
        AD.db.update(function (s) { var x = (s.settingChanges || []).filter(function (y) { return y.id === id; })[0]; if (x) { x.status = 'canceled'; x.canceledAt = nowIso(); x.canceledBy = staffId(); x.cancelWhy = reason; } });
        return { ok: true };
      },
      audit: { action: 'setting_cancel', label: '設定の変更の予約を取り消した', target: { type: 'setting', id: c.key, name: c.label }, detail: c.summary },
      done: '取り消しました'
    }).then(function (r) { if (r && cur) cur.refresh(); });
  }

  /* ============================================================
     運営の人と役割
     ============================================================ */
  function staffTab(ctx) {
    var me = staff(), owners = staffList().filter(function (s) { return s.role === '代表' && s.active !== false; }).length;
    var table = AU.table({
      id: 'staff', rows: staffList(), query: ctx.query, qp: 's', sort: '', label: '運営の人', search: null, cards: true,
      columns: [
        { key: 'name', label: '名前', main: true, html: function (s) {
          var p = s.person && DATA.PEOPLE[s.person];
          return '<span class="ad-who">' + U.avatar({ name: s.name, color: s.color }, 'xs') + '<span class="ad-who__txt"><span class="ad-who__name">' + esc(s.name) + (s.id === me.id ? '（自分）' : '') + '</span>' +
            '<span class="ad-who__sub">' + esc(p ? p.role : s.role) + '</span></span></span>';
        } },
        { key: 'role', label: '役割', nowrap: true, html: function (s) { return '<b class="st-role">' + esc(s.role) + '</b>'; } },
        { key: 'email', label: 'メール', hide: 'sm' },
        AU.col.rel('lastLogin', '最後のログイン'),
        { key: 'active', label: '状態', nowrap: true, value: function (s) { return s.invited ? '招待中' : s.active === false ? '停止' : '有効'; },
          html: function (s) { return s.invited ? U.statusTag('review', '招待中') : s.active === false ? U.statusTag('closed', '停止') : '<span class="ad-st">有効</span>'; } },
        { key: 'acts', label: '', sort: false, csv: false, html: function (s) {
          if (!can('owner')) return '';
          var lastOwner = s.role === '代表' && owners <= 1;
          return '<span class="pm-acts">' + (lastOwner ? '<span class="pm-muted st-why">代表が1人のため変えられません</span>' : '<button type="button" class="btn btn-ghost btn-s" data-st-role="' + esc(s.id) + '">役割を変える</button>') +
            // 行ごとに朱の枠を並べない（止めるときの確かめる窓で朱にする）
            (s.id === me.id ? '' : '<button type="button" class="btn btn-ghost btn-s" data-st-active="' + esc(s.id) + '">' + (s.active === false ? '戻す' : '止める') + '</button>') + '</span>';
        } }
      ],
      rowClass: function (s) { return s.active === false ? 'is-quiet' : ''; },
      tools: can('owner') ? '<button type="button" class="btn btn-ink btn-s" data-st-invite>' + icon('plus', 'ico-s') + '招待する</button>'
        : '<span class="pm-muted st-inline">招待と役割の変更は代表だけ</span>',
      csv: { name: '運営の人' }
    });
    var matrix = AU.panel({
      title: '役割でできること', id: 'stMatrix', cls: 'st-panel', flush: true,
      body: '<div class="ad-tbl-wrap"><table class="ad-tbl is-dense st-matrix" aria-label="役割でできること"><thead><tr><th scope="col">操作</th>' +
        ROLES.map(function (r) { return '<th scope="col"' + (r === me.role ? ' class="is-me"' : '') + '>' + esc(r) + (r === me.role ? '<span class="sr-only">（自分の役割）</span>' : '') + '</th>'; }).join('') + '</tr></thead><tbody>' +
        MATRIX.map(function (m) {
          return '<tr><th scope="row">' + esc(m[0]) + '</th>' + m[1].map(function (v, i) {
            return '<td class="' + (v === '○' ? 'is-yes' : v === '―' ? 'is-no' : 'is-part') + (ROLES[i] === me.role ? ' is-me' : '') + '">' + esc(v) + '</td>';
          }).join('') + '</tr>';
        }).join('') + '</tbody></table></div>'
    });
    return table + matrix;
  }
  function invite() {
    AU.act({
      title: '運営の人を招待する', ok: '招待する', kind: 'ink', cls: 'a-settings',
      fields: '<label class="field"><span>名前</span><input class="input" name="name" maxlength="20" required autocomplete="off"></label>' +
        '<label class="field"><span>メールアドレス</span><input class="input" type="email" name="email" maxlength="80" required autocomplete="off" placeholder="name@taisei.example.jp"></label>' +
        '<label class="field"><span>役割</span><select class="select" name="role">' + ROLES.map(function (r) { return '<option' + (r === '運営' ? ' selected' : '') + '>' + r + '</option>'; }).join('') + '</select></label>',
      reason: 'optional', reasonLabel: 'メモ', reasons: ['講師として入る', '経理の手伝い'],
      run: function (reason, f) {
        var name = String(f.name || '').trim(), email = String(f.email || '').trim().toLowerCase(), errs = {};
        if (!name) errs.name = '名前を入れてください';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'メールアドレスの形で入れてください';
        else if (staffList().some(function (s) { return s.email.toLowerCase() === email; })) errs.email = 'このアドレスの人はもういます';
        if (Object.keys(errs).length) return { ok: false, errors: errs };
        var s2 = { id: AD.db.uid('st'), person: null, name: name, role: f.role, email: email, color: '#5b6b7a', lastLogin: null, active: false, invited: true, invitedAt: nowIso(), invitedBy: staffId() };
        AD.db.update(function (s) { s.staff.push(s2); });
        return { ok: true, s: s2 };
      },
      audit: function (reason, f, r) { return { action: 'staff_invite', label: '運営の人を招待した', target: { type: 'staff', id: r.s.id, name: r.s.name }, detail: r.s.role + '・' + r.s.email }; },
      done: '招待のメールを送りました（本番ではメールのリンクからパスワードを決めます）'
    }).then(function (r) { if (r && cur) cur.refresh(); });
  }
  function changeRole(id) {
    var s0 = staffList().filter(function (x) { return x.id === id; })[0]; if (!s0) return;
    AU.act({
      title: s0.name + 'さんの役割', ok: '変える', kind: 'ink', cls: 'a-settings',
      fields: '<fieldset class="st-radios"><legend class="field__label">役割</legend>' + ROLES.map(function (r) {
        return '<label class="check"><input type="radio" name="role" value="' + r + '"' + (r === s0.role ? ' checked' : '') + '><span>' + r + '</span></label>';
      }).join('') + '</fieldset>',
      reasons: ['担当が変わった', '経理を兼ねる'],
      run: function (reason, f) {
        if (f.role === s0.role) return { ok: false, error: 'いまと同じ役割です' };
        if (s0.role === '代表' && staffList().filter(function (x) { return x.role === '代表' && x.active !== false; }).length <= 1) return { ok: false, error: '代表が1人だけのときは、ほかの役割にできません' };
        AD.db.update(function (s) { var x = s.staff.filter(function (y) { return y.id === id; })[0]; if (x) x.role = f.role; });
        return { ok: true, role: f.role };
      },
      audit: function (reason, f, r) { return { action: 'staff_role', label: '運営の人の役割を変えた', target: { type: 'staff', id: id, name: s0.name }, detail: s0.role + ' → ' + r.role }; },
      done: '役割を変えました'
    }).then(function (r) { if (r && cur) cur.refresh(); });
  }
  function toggleActive(id) {
    var s0 = staffList().filter(function (x) { return x.id === id; })[0]; if (!s0) return;
    var stop = s0.active !== false;
    AU.act({
      title: stop ? s0.name + 'さんを止める' : s0.name + 'さんを戻す', ok: stop ? '止める' : '戻す', danger: stop, kind: 'ink', cls: 'a-settings',
      text: stop ? 'ログインできなくなります。これまでの操作の記録は残ります。' : 'またログインできるようになります。',
      reasons: stop ? ['退職した', '契約が終わった'] : ['復帰した'],
      run: function () {
        AD.db.update(function (s) { var x = s.staff.filter(function (y) { return y.id === id; })[0]; if (x) { x.active = !stop; if (!stop) x.invited = false; } });
        return { ok: true };
      },
      audit: { action: stop ? 'staff_stop' : 'staff_resume', label: stop ? '運営の人を止めた' : '運営の人を戻した', target: { type: 'staff', id: id, name: s0.name }, detail: s0.role },
      done: stop ? '止めました' : '戻しました'
    }).then(function (r) { if (r && cur) cur.refresh(); });
  }

  /* ============================================================
     操作の記録
     ============================================================ */
  var KINDS = [['money', 'お金'], ['reward', '紹介報酬'], ['points', 'ポイント'], ['member', '会員・連絡'], ['content', '掲載'], ['setting', '設定・運営の人']];
  function kindOf(a) {
    var x = a.action || '';
    if (/^(reward|bank_|statement|referral)/.test(x)) return 'reward';
    if (/^(refund|payment|receipt)/.test(x)) return 'money';
    if (/^(points|ranking|prize|answer)/.test(x)) return 'points';
    if (/^(setting|staff_(invite|role|stop|resume))/.test(x)) return 'setting';
    if (/^(gig|event|post|perk|expert|notice|lesson|quiz|faculty|report|hidden|warned|waitlist|attendance|staff_post|flag|held|schedule)/.test(x)) return 'content';
    return 'member';
  }
  function auditTab(ctx) {
    var rows = AD.db.state.audit.map(function (a) { return Object.assign({ kind: kindOf(a) }, a); });
    return AU.table({
      id: 'audit', rows: rows, query: ctx.query, qp: 'a', sort: '-at', label: '操作の記録', pageSize: 50,
      search: { placeholder: '操作・相手・理由・内容', keys: ['label', 'target', 'reason', 'detail'] },
      filters: [
        { key: 'kind', label: '種類', chips: true, options: [['', 'すべて']].concat(KINDS) },
        { key: 'by', label: '操作した人', options: [['', 'すべて']].concat(staffList().map(function (s) { return [s.id, s.name]; })) }
      ],
      columns: [
        AU.col.when('at', '日時', { html: function (a) { return '<a class="num" href="' + esc(hashWith({ log: a.id })) + '">' + esc(U.fmtShort(a.at, true)) + '</a>'; } }),
        { key: 'by', label: '操作した人', nowrap: true, value: function (a) { return AD.db.staffName(a.by); } },
        { key: 'label', label: '操作', main: true, html: function (a) { return '<b>' + esc(a.label) + '</b>' + (a.detail ? '<span class="st-sub">' + esc(a.detail) + '</span>' : ''); } },
        { key: 'target', label: '相手', value: function (a) { return a.target ? a.target.name || '' : ''; } },
        { key: 'reason', label: '理由', sort: false, hide: 'sm', html: function (a) { return a.reason ? esc(a.reason) : '<span class="pm-muted">―</span>'; } },
        { key: 'detail', label: '内容', csvOnly: true },
        { key: 'kindLabel', label: '種類', csvOnly: true, value: function (a) { var k = KINDS.filter(function (x) { return x[0] === a.kind; })[0]; return k ? k[1] : ''; } }
      ],
      rowHref: function (a) { return hashWith({ log: a.id }); },
      csv: { name: '操作の記録' }, empty: 'まだ操作の記録はありません。'
    });
  }
  var dr = null, drFor = null, quiet = false;
  function openLog(id) {
    var a = AD.db.state.audit.filter(function (x) { return x.id === id; })[0];
    if (!a) { AD.app.setQuery({ log: null }, { replace: true }); U.toast('この記録は見つかりませんでした', 'error'); return; }
    var t = a.target || {}, st = AD.db.staff(a.by);
    var link = t.type === 'member' && t.id ? '#/members/' + encodeURIComponent(t.id) : t.type === 'payment' ? '#/payments?pay=' + encodeURIComponent(t.id) : t.type === 'reward' ? '#/referrals?tab=rows&row=' + encodeURIComponent(t.id) : '';
    drFor = id;
    dr = AU.drawer('<div class="st-log">' + AU.kv([
      ['日時', U.fmtDate(a.at, { time: true })],
      ['操作した人', (st ? st.name + '（' + st.role + '）' : AD.db.staffName(a.by))],
      ['操作', a.label],
      ['相手', t.name || '―'],
      ['内容', a.detail || '―'],
      ['理由', a.reason || '―'],
      ['記録のid', '<span class="mono">' + esc(a.id) + '</span>', true]
    ]) + (link ? '<p class="st-log__go"><a class="btn btn-ghost btn-s" href="' + esc(link) + '">' + esc(t.type === 'member' ? '会員の詳細' : t.type === 'payment' ? '請求の詳細' : '明細') + '</a></p>' : '') +
      '<p class="st-foot">操作の記録は書き換えられません。</p></div>',
      { title: '操作の記録', foot: true, cls: 'a-settings',
        onClose: function () { dr = null; drFor = null; if (quiet) return; var r = AD.app.parse(); if (r.name === 'settings' && r.query.log) AD.app.setQuery({ log: null }, { replace: true }); } });
  }
  function syncDrawer(ctx) {
    var id = ctx.query.log || '';
    if (!id) { if (dr) { quiet = true; dr.close(); quiet = false; } return; }
    if (dr && drFor === id && dr.parentNode) return;
    if (dr) { quiet = true; dr.close(); quiet = false; }
    setTimeout(function () { if (AD.app.parse().query.log === id && !dr) openLog(id); }, 0);
  }

  /* ============================================================
     送る文面
     ============================================================ */
  function sample(id) {
    var lv = AD.data.live(), n = CLG.now(), ev = DATA.EVENTS.filter(function (e) { return new Date(e.at) > n; })[0];
    return { name: lv.name, no: lv.no, site: SITE.name, url: SITE.siteUrl + 'member.html', date: id === 'reward_confirmed' ? U.fmtDate(new Date(n.getFullYear(), n.getMonth() + 1, RF.payDay), { noYear: true }) : ev ? U.fmtDate(ev.at, { noYear: true, time: /event/.test(id) }) : U.fmtDate(n, { noYear: true }),
      event: ev ? ev.title : 'イベント', amount: id === 'reward_confirmed' ? U.yen(Math.round(SITE.price * RF.rate)) : U.yen(SITE.price), until: U.fmtDate(new Date(n.getTime() + (SITE.graceDays || 7) * DAY), { noYear: true }),
      text: '面談の日程は、9/30(水) 21:00で確定しました。当日はZoomのリンクを会員ページに出します。' };
  }
  function fillT(t, v, raw) {
    var h = esc(t);
    // 差し込みのすぐ後ろの閉じかっこ・句読点は、短い差し込み（会員番号・金額など）と一緒に折る
    // （「（会員番号 TS-000271」の次の行に「）」だけ残さない。長いイベント名は中で折れるように包まない）
    return h.replace(/\{(\w+)\}([）」』。、]*)/g, function (m, k, tail) {
      var ph = raw || v[k] == null, val = ph ? '{' + k + '}' : String(v[k]);
      var mk = ph ? '<mark class="st-ph">' + esc(val) + '</mark>' : '<mark class="st-fill">' + esc(val) + '</mark>';
      return tail && val.length <= 20 ? '<span class="nw">' + mk + tail + '</span>' : mk + tail;
    }).replace(/\n/g, '<br>');
  }
  function templatesTab(ctx) {
    var T = DATA.MAIL_TEMPLATES, ids = Object.keys(T), id = T[ctx.query.tpl] ? ctx.query.tpl : ids[0], t = T[id], raw = ctx.query.raw === '1', v = sample(id);
    var ph = {}; (t.email.subject + t.email.body + t.line.text).replace(/\{(\w+)\}/g, function (m, k) { ph[k] = 1; return m; });
    var list = '<nav class="st-tpls" aria-label="文面の一覧"><ul>' + ids.map(function (k) {
      return '<li><a class="st-tpls__a" href="' + esc(hashWith({ tpl: k })) + '"' + (k === id ? ' aria-current="page"' : '') + '>' + esc(T[k].name) + '</a></li>';
    }).join('') + '</ul></nav>';
    var prev = '<section class="st-prev" aria-labelledby="stPrevH">' +
      '<div class="st-prev__head"><h2 class="st-prev__ttl" id="stPrevH">' + esc(t.name) + '</h2>' +
        '<div class="pm-acts"><a class="btn btn-ghost btn-s" href="' + esc(hashWith({ raw: raw ? null : '1' })) + '">' + (raw ? '見本を差し込む' : '差し込みの印を見る') + '</a>' +
        '<button type="button" class="btn btn-ink btn-s" data-st-test="' + esc(id) + '">' + icon('mail', 'ico-s') + '自分に送って確かめる</button></div></div>' +
      '<p class="st-prev__meta">差し込み：' + Object.keys(ph).map(function (k) { return '<code>{' + esc(k) + '}</code>'; }).join(' ') + (raw ? '' : '・見本は' + esc(v.name) + 'さん（' + esc(v.no) + '）') + '</p>' +
      '<div class="st-mail"><p class="st-mail__label">メール</p>' +
        '<div class="st-mail__box"><p class="st-mail__from">差出人：' + esc(SITE.name) + ' 運営事務局 <span class="nw">&lt;no-reply@taisei.example.jp&gt;</span></p>' +
        '<p class="st-mail__subj">' + fillT(t.email.subject, v, raw) + '</p><div class="st-mail__body">' + fillT(t.email.body, v, raw) + '</div></div></div>' +
      '<div class="st-line"><p class="st-mail__label">LINE（' + esc(SITE.lineName) + '）</p><div class="st-line__box"><div class="st-line__bubble">' + fillT(t.line.text, v, raw) + '</div></div></div>' +
    '</section>';
    return '<div class="st-tplwrap">' + list + prev + '</div>';
  }

  AD.screens.settings = {
    title: '設定',
    render: function (ctx) {
      cur = ctx;
      var tab = ctx.query.tab || 'plan', db = AD.db.state;
      if (['plan', 'referral', 'rules', 'staff', 'audit', 'templates'].indexOf(tab) < 0) tab = 'plan';
      var pend = changes().filter(function (c) { return c.status === 'scheduled'; }).length;
      var tabs = AU.tabs([
        { id: 'plan', label: '料金とレベル', href: '#/settings' },
        { id: 'referral', label: '紹介の形', href: '#/settings?tab=referral' },
        { id: 'rules', label: 'ルールと規約', href: '#/settings?tab=rules' },
        { id: 'staff', label: '運営の人と役割', href: '#/settings?tab=staff', n: db.staff.length },
        { id: 'audit', label: '操作の記録', href: '#/settings?tab=audit', n: db.audit.length },
        { id: 'templates', label: '送る文面', href: '#/settings?tab=templates', n: Object.keys(DATA.MAIL_TEMPLATES).length }
      ], tab, '設定の表示');
      var body = tab === 'referral' ? referralTab() : tab === 'rules' ? rulesTab() : tab === 'staff' ? staffTab(ctx) : tab === 'audit' ? auditTab(ctx) : tab === 'templates' ? templatesTab(ctx) : planTab();
      var me = staff();
      return '<div class="a-settings">' +
        AU.head({ title: '設定', sub: me.name + 'さん（' + me.role + '）でログイン中' + (pend ? '・予約した変更 ' + pend + '件' : '') }) +
        tabs + body + '</div>';
    },
    mount: function (root, ctx) {
      cur = ctx;
      syncDrawer(ctx);
      if (root.__boundSettings) return;
      root.__boundSettings = true;
      root.addEventListener('click', function (e) {
        var b = e.target.closest('.a-settings [data-st-edit],.a-settings [data-st-cancel],.a-settings [data-st-invite],.a-settings [data-st-role],.a-settings [data-st-active],.a-settings [data-st-test]');
        if (!b || b.disabled) return;
        if (b.hasAttribute('data-st-edit')) {
          var k = b.getAttribute('data-st-edit');
          ({ price: editPrice, levels: editLevels, xp: editXp, referral: editReferral, rules: editRules, terms: editTerms }[k] || function () {})();
        } else if (b.hasAttribute('data-st-cancel')) cancelChange(b.getAttribute('data-st-cancel'));
        else if (b.hasAttribute('data-st-invite')) invite();
        else if (b.hasAttribute('data-st-role')) changeRole(b.getAttribute('data-st-role'));
        else if (b.hasAttribute('data-st-active')) toggleActive(b.getAttribute('data-st-active'));
        else if (b.hasAttribute('data-st-test')) U.toast('本番では ' + (staff().email || '自分のアドレス') + ' とLINEに、見本の差し込みで送ります');
      });
    }
  };
})();
