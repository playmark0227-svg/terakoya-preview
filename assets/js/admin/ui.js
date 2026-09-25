/* ============================================================
   運営画面の部品（CLG.admin.ui。画面のファイルでは AU と呼ぶ）
   ------------------------------------------------------------
   会員ページの部品（CLG.ui ＝ U：btn・tag・field・modal・toast・avatar など）はそのまま使える。
   ここにあるのは運営画面で足りないものだけ：表（並べ替え・絞り込み・探す・ページ・選択・まとめて操作・CSV）、
   横から出る引き出し、理由を書いて確かめる窓（操作の記録に残す）、数字のかたまり、見出し、状態の札。
   すべて HTML の文字列を返す。外から来た文字は中で esc() する（html を渡す欄は、渡す側で esc 済みにする）。

   ■ 見出し（1画面に1つ）
     AU.head({ title, sub, crumb: [['#/members', '会員']], actions: '<a class="btn btn-ink btn-s" …>…</a>' })
       → h1 に data-page-title tabindex="-1" が付く（画面が変わると骨組みがここへ焦点を移す）

   ■ 表
     AU.table({
       id: 'members',                        // 表の名前（1画面の中でほかの表と重ならない名前。選択はこの名前ごとに覚える）
       rows: [...],                          // 全部の行（絞り込む前）
       rowId: function (r) { return r.no; },  // 既定は r.id || r.no
       query: ctx.query,                     // 並べ替え・絞り込み・探す・ページは URL の ? に入る（戻る・再読み込みで残る）
       qp: 'ap',                             // 任意。1画面に表が2つ以上あるときの ? のキーの頭（ap.sort / ap.page …）
       columns: [{
         key: 'no', label: '会員番号',
         value: function (r) { return r.no; },   // 並べ替え・探す・CSV に使う値（既定は r[key]）
         html: function (r) { return '…'; },     // 表示（esc 済みの HTML）。無ければ esc(value)
         csv: function (r) { return …; } | false,// CSV の値（既定は value）。false なら CSV に入れない
         sort: true|false,                       // 既定 true。 dir: 'desc' で最初に押したとき大きい順
         align: 'r', cls: 'mono', width: '8em', hide: 'md'|'sm'（本文が狭いとき隠す列）, nowrap: true,
         csvOnly: true（画面には出さず CSV にだけ入れる列）, csvLabel: 'CSV の見出し',
         main: true（スマホで行の題にする列。無ければ最初の列。会員の名前・件名の列に付ける）
       }],
       sort: '-joinedAt',                    // 最初の並び（- は大きい順）
       search: { placeholder: '名前・会員番号', label: '名前・会員番号で探す', keys: ['name', 'no'] }  // または fn(row, 言葉) / null
                                             // placeholder は欄に入る短さに（260px。狭い幅は 16px の字）。探せるものを全部書くときは label（読み上げ）へ
       filters: [{ key: 'status', label: '状態', chips: true,           // chips: 丸い札で出す（1表に1つまで）。無ければ選ぶ欄
                  options: [['', 'すべて'], ['active', '有効'], …], match: function (r, v) { return r.status === v; },
                  value: 'review' }],                                   // 任意。最初に選んでおく値（「すべて」は ?status=* になる）
                                                                        // 丸い札で絞ったとき、同じ key の列がどの行も同じ表示なら、その列は画面に出さない（CSV には入る）
       pageSize: 50,
       select: true, bulk: [{ id: 'msg', label: 'メッセージを送る', icon: 'mail', run: function (rows) { … } }],
       rowHref: function (r) { return '#/members/' + r.no; },   // 行を押したときの行き先（行の中のリンクも1つ置く）
       rowClass: function (r) { return r.status === 'past_due' ? 'is-alert' : ''; },
       csv: { name: '会員' } | false,        // 「CSVを書き出す」。絞り込んだ全行（選んでいれば選んだ行）
       empty: 'まだ会員はいません',           // 行が1つもないとき（絞り込みで0件のときは「絞り込みを外す」を出す）
       tools: '<button …>',                  // 任意。道具の行の右に足すボタン（esc 済み）
       cards: false                          // 任意。スマホでも表のまま出す（列が3つまでの小さな表だけ）
     })
     押したときの動き（並べ替え・絞り込み・ページ・選択・まとめて操作・CSV・行のリンク）は、ここで document に
     1回だけ付けてある。画面の mount で表の動きを書く必要はない。表は本文（#adView）の中だけで使う（窓の中では使わない）。
     本文が 560px 以下（スマホ）では、1行を1つのかたまりにして「列の名前 値」を並べる（見出しの行の代わりに並べ替えの選ぶ欄）。
     ページ送りも 560px 以下では番号の列の代わりに「3 / 7」だけを出す（番号と矢印が2行に折れないように）。
     手で組む表も <table class="ad-tbl is-cards"> と td の data-label（題の列は class="is-main"）で同じ形になる。
     AU.tableRows(id)  いま絞り込まれている行（全ページ）。 AU.selected(id) 選んだ行。 AU.clearSelection(id)
     AU.hydrate(root)  「すべて選ぶ」の一部だけの見た目を付け、横に流れるタブ（.ad-tabs）はいまのタブが見える位置まで送る。
                       骨組みが描くたびに呼ぶので、画面からは呼ばなくていい
     手で組む表のチェックも <label class="ad-ckhit"><input type="checkbox" class="ad-ck" …></label> で包む（指で押せる広さ）

   ■ 引き出し（右から出る詳細。スマホでは下から）
     AU.drawer(html, { title, foot, wide, cls: 'a-<画面名>', dirty, focus, onClose }) → U.modal と同じ（.close()）

   ■ 理由を書いて確かめる（お金・ポイント・状態を変える操作はこれを通す。操作の記録に残る）
     AU.act({
       title: '返金する', text: '9月3日の請求 10,000円を返金します。', ok: '返金する', danger: true,
       reasons: ['二重の請求', '解約の申し出が遅れた'],   // 押すと理由の欄に入る候補（任意）
       reason: true | 'optional' | false,                 // 理由の欄（既定 true＝必須）
       fields: '<label class="field">…</label>',          // 足す欄（任意。name を付ける）
       run: function (reason, form) { … return { ok: true } | { ok: false, error | errors } },
       audit: { action: 'refund', label: '返金', target: { type: 'payment', id, name }, detail: '10,000円' }  // または fn(reason, form, result)
       done: '返金しました'                               // 済んだら出す一言（任意）
     }) → Promise(result か null＝やめた)

   ■ 役割でできること（設定の「運営の人と役割」の表と同じ。AU.ROLE_TABLE が正本）
     AU.can(種類, scope?)   いまの人ができるか。種類：members 会員・メッセージ / content 掲載 / money 返金など / rewards 紹介報酬 /
                            points 貢献ポイント / rules レベル・ルール / owner 料金・規約 / staff 運営の人。
                            講師は members が { kind:'講座の質問' } だけ、content が { owner: 自分の person の id } だけ
     AU.dis(種類, scope?) → ' disabled' か ''（ボタンの属性に足す）   AU.need(種類, scope?) 押したときの見張り（できなければ一言で知らせて false）
     AU.roleNote(種類, '何を（名詞）', { strict, only }?)   見るだけ・一部だけのときに画面の上に出す知らせ。
                            strict：一部だけの役割も「できない」として書く（講師の「自分の講座とイベント」が関係しない案件・特典・タイムライン・面談の枠）。
                            only：「〜は見るだけです」を付けない（ほかの操作はできる画面。会員の詳細の経理など）
     AU.whoCan(種類) '代表・運営'   AU.role() いまの役割

   ■ 小さな部品
     AU.kpi({ label, value, unit, sub, href, tone: 'alert'|'warn' })   数字のかたまり（押すとその画面へ）
     AU.panel({ title, id, actions, body, flush, cls })               区切りの面（見出し＋右にリンク）
     AU.tabs([{ id, label, href, n }], いまのid, '会員の詳細')         画面の中のタブ（リンク。?tab= で切り替える）
     AU.status(種類, キー, 文言?)   状態の札。種類：member / thread / payment / reward / review / app / report / expert / interview
                                   いつもの状態（有効・完了・支払済）は札にせず文字だけ（札は例外に付ける）
     AU.who(行 or 会員番号, { sub, link:false, size })   顔＋名前＋会員番号（#/members/<会員番号> へ）
     AU.kv([['会員番号', 'TS-000271'], ['メール', html, true（html のまま）]])
     AU.steps(済んだ数, 全体)   スタートガイドの 9/10 と細い棒
     AU.age(iso) → { text:'31時間', hours, over（24時間以上） }   AU.ageTag(iso, 24)  超えたら朱の文字
     AU.when(iso) 9/26(土) 20:00   AU.date(iso) 9/26(土)   AU.money(n) 1,200円   AU.num(n)
     AU.empty(文, { href, label } | ボタンの html)   AU.skeleton('table'|'page', 行数)
     AU.csv(rows, columns) / AU.downloadCsv(名前, rows, columns)   = 表の CSV と同じ書き方（Excel 用の BOM・式にならないように）
     AU.setQuery({ status: 'past_due', page: null }, { replace })  いまの画面の ? を変える（null で消す）
     AU.col.date / when / rel / money / member / status   よく使う列（表の columns に入れる）。AU.ymd(d, 時刻も?) CSV 用の日付
   ============================================================ */
(function (global) {
  'use strict';
  var CLG = global.CLG, U = CLG.ui, DATA = CLG.DATA;
  var AD = CLG.admin = CLG.admin || {};
  var esc = U.esc, icon = U.icon, doc = global.document;
  var tables = {};      // 表の設定と絞り込んだ行（描いたときに入れて、押したときに引く）
  var selection = {};   // { 表id: { 行id: true } }
  var seq = 0;

  function setQuery(patch, opt) { if (AD.app && AD.app.setQuery) AD.app.setQuery(patch, opt); }
  function num(n) { return U.num(n); }
  function money(n) { return U.yen(n); }
  function when(d) { return U.fmtShort(d, true); }
  function date(d) { return U.fmtShort(d); }

  /* ---------- 見出し ---------- */
  function head(o) {
    o = o || {};
    var crumb = (o.crumb || []).length ? '<nav class="ad-crumb" aria-label="現在地">' + o.crumb.map(function (c) {
      return '<a href="' + esc(c[0]) + '">' + esc(c[1]) + '</a><span aria-hidden="true">/</span>';
    }).join('') + '</nav>' : '';
    return '<header class="ad-head">' +
      '<div class="ad-head__main">' + crumb +
        '<h1 class="ad-head__ttl" data-page-title tabindex="-1">' + esc(o.title || '') + '</h1>' +
        (o.sub ? '<p class="ad-head__sub">' + (o.subHtml ? o.sub : esc(o.sub)) + '</p>' : '') +
      '</div>' +
      (o.actions ? '<div class="ad-head__acts">' + o.actions + '</div>' : '') +
    '</header>';
  }

  /* ---------- 状態の札 ----------
     色は U.statusTag のキーで決める（藍＝進行中、緑＝済み、朱＝いま見てほしい、黄土＝気をつけて、線＝終わった）。
     '' はいつもの状態：札にせず文字だけ（273行ぜんぶに「有効」の札が並ぶと、例外が見えなくなるため） */
  var ST = {
    member: { active: ['', '有効'], canceling: ['waitlist', '解約予定'], past_due: ['new', '支払いエラー'], left: ['closed', '終了'], paused: ['hold', '休会中'] },
    thread: { open: ['new', '未返信'], doing: ['meeting', '対応中'], done: ['', '完了'] },
    payment: { paid: ['', '支払済'], failed: ['new', '失敗'], refunded: ['closed', '返金済み'], upcoming: ['scheduled', '予定'] },
    reward: { hold: ['hold', '保留'], ready: ['review', '確定待ち'], confirmed: ['confirmed', '確定'], scheduled: ['scheduled', '支払予定'], paid: ['', '支払済'], 'void': ['void', '取消'] },
    review: { review: ['review', '確認待ち'], open: ['confirmed', '掲載中'], approved: ['confirmed', '承認'], rejected: ['closed', '差し戻し'], closed: ['closed', '掲載終了'] },
    app: { applied: ['review', '応募'], meeting: ['meeting', '面談'], active: ['active', '稼働中'], done: ['done', '完了'], rewarded: ['', '報酬確定'], declined: ['closed', '見送り'] },
    report: { 受付: ['new', '受付'], 非表示: ['closed', '非表示'], 注意: ['waitlist', '注意した'], 対応不要: ['', '対応不要'] },
    expert: { 受付: ['new', '受付'], 日程調整: ['meeting', '日程調整'], 予約確定: ['confirmed', '予約確定'], 相談済み: ['', '相談済み'] },
    interview: { pending: ['review', '確定待ち'], confirmed: ['confirmed', '予約済み'], done: ['', '済み'], canceled: ['canceled', '取消'] }
  };
  function status(group, key, label) {
    var g = ST[group] || {}, s = g[key];
    var text = label || (s ? s[1] : key);
    if (!s || !s[0]) return '<span class="ad-st" data-status="' + esc(key) + '">' + esc(text) + '</span>';
    return U.statusTag(s[0], text);
  }
  function statusLabel(group, key) { var s = (ST[group] || {})[key]; return s ? s[1] : String(key || ''); }

  /* ---------- 役割でできること ----------
     設定の「運営の人と役割」の表（ROLE_TABLE）がそのまま決まり。画面はここを見て、押せるものを分ける。
     値：true できる / false 見るだけ / 文字 一部だけ（'lesson'＝講座の質問だけ、'own'＝自分の講座とイベントだけ） */
  var ROLES = ['代表', '運営', '講師', '経理'];
  var ROLE_TABLE = [
    { id: 'members', name: '会員・メッセージ・新入生への声かけ', can: { 代表: true, 運営: true, 講師: 'lesson', 経理: false }, part: { lesson: '講座の質問だけ' } },
    { id: 'content', name: '講座・案件・イベント・タイムラインの掲載', can: { 代表: true, 運営: true, 講師: 'own', 経理: false }, part: { own: '自分の講座とイベントだけ' } },
    { id: 'money', name: '返金・支払いのやり直し・領収書', can: { 代表: true, 運営: true, 講師: false, 経理: true } },
    { id: 'rewards', name: '紹介報酬の確定・締め・振込', can: { 代表: true, 運営: true, 講師: false, 経理: true } },
    { id: 'points', name: '貢献ポイントを付ける・取り消す', can: { 代表: true, 運営: true, 講師: true, 経理: false } },
    { id: 'rules', name: 'レベル・XP・コミュニティのルール', can: { 代表: true, 運営: true, 講師: false, 経理: false } },
    { id: 'owner', name: '料金・紹介の形・規約', can: { 代表: true, 運営: false, 講師: false, 経理: false } },
    { id: 'staff', name: '運営の人と役割', can: { 代表: true, 運営: false, 講師: false, 経理: false } }
  ];
  function roleRow(perm) { for (var i = 0; i < ROLE_TABLE.length; i++) if (ROLE_TABLE[i].id === perm) return ROLE_TABLE[i]; return null; }
  function me() { return (AD.db && AD.db.staff && AD.db.staff()) || null; }
  function roleOf() { var s = me(); return s ? s.role : '運営'; }
  /** いまの人が、その操作をできるか。scope で一部だけの役割を見分ける：
      { kind }（メッセージの種類。講師は「講座の質問」だけ）/ { owner }（講座の講師・イベントの主催の人の id。講師は自分のものだけ） */
  function can(perm, scope) {
    var row = roleRow(perm); if (!row) return true;
    var v = row.can[roleOf()];
    if (v === true || v === false || v == null) return !!v;
    scope = scope || {};
    var s = me();
    if (v === 'lesson') return scope.kind === '講座の質問';
    if (v === 'own') return !!(s && s.person && scope.owner && scope.owner === s.person);
    return false;
  }
  /** 一部だけでもできるか（講師が「自分の講座」を直せる、など。画面に見るだけの知らせを出すかどうかに使う） */
  function canSome(perm) { var row = roleRow(perm); var v = row ? row.can[roleOf()] : true; return v !== false && v != null; }
  function whoCan(perm) {
    var row = roleRow(perm); if (!row) return '';
    return ROLES.filter(function (r) { return row.can[r] === true; }).join('・');
  }
  /** 押せないときの ' disabled'（ボタンの属性に足す） */
  function dis(perm, scope) { return can(perm, scope) ? '' : ' disabled'; }
  /** 押したときの見張り：できないなら一言で知らせて false */
  function need(perm, scope) {
    if (can(perm, scope)) return true;
    var row = roleRow(perm), v = row && row.can[roleOf()];
    // 一部だけの役割でも、その一部に当たる場面（scope を渡したとき）なら「◯◯だけです」と言う。当たらない操作は「代表・運営です」
    U.toast(typeof v === 'string' && scope ? roleOf() + 'の役割でできるのは' + row.part[v] + 'です' : 'この操作ができるのは' + whoCan(perm) + 'です', 'error');
    return false;
  }
  /** 画面の上に出す知らせ（見るだけ・一部だけのとき）。できるときは ''。what は名詞（「返信」「講座と録画の編集」） */
  function roleNote(perm, what, o) {
    o = o || {};
    var row = roleRow(perm); if (!row) return '';
    var r = roleOf(), v = row.can[r];
    if (v === true) return '';
    what = what || 'この画面の操作';
    // 一部だけ：「講師の役割では、返信は講座の質問だけです。」（「講師が返信ができるのは」の「が」の重なりを避ける）
    var text = typeof v === 'string' && !o.strict ? r + 'の役割では、' + what + 'は' + row.part[v] + 'です。'
      : what + 'ができるのは' + whoCan(perm) + 'です。' + (o.only ? '' : r + 'は見るだけです。');
    return '<div class="notice ad-role-note">' + icon('lock') + '<div>' + esc(text) + '</div></div>';
  }

  /* ---------- 顔と名前 ---------- */
  var TONES = ['#c0694e', '#6a8caf', '#4f8a6b', '#b0875a', '#5b6fa8', '#a0617f', '#7b8f4f', '#c27a3e', '#4e7f93', '#b8647a', '#6b7f5e', '#8f6aa8', '#5d8a8a', '#a57758'];
  function colorOf(row) {
    var p = row.person && DATA.PEOPLE[row.person];
    if (p && p.color) return p.color;
    if (row.person === 'demo') return DATA.MEMBER.color;
    var n = parseInt(String(row.no || '').slice(-3), 10) || 0;
    return TONES[n % TONES.length];
  }
  function who(row, o) {
    o = o || {};
    if (typeof row === 'string') row = (AD.data && AD.data.member(row)) || { no: row, name: row };
    if (!row) return '';
    var inner = U.avatar({ name: row.name, color: colorOf(row) }, o.size || 'xs') +
      '<span class="ad-who__txt"><span class="ad-who__name">' + esc(row.name) + '</span>' +
      (o.sub !== false ? '<span class="ad-who__sub num">' + esc(o.sub || row.no) + '</span>' : '') + '</span>';
    if (o.link === false || !row.no) return '<span class="ad-who">' + inner + '</span>';
    return '<a class="ad-who" href="#/members/' + encodeURIComponent(row.no) + '">' + inner + '</a>';
  }

  /* ---------- 数字のかたまり・面・タブ・表の小物 ---------- */
  function kpi(o) {
    var tone = o.tone ? ' is-' + o.tone : '';
    var inner = '<span class="ad-kpi__label">' + esc(o.label) + '</span>' +
      '<span class="ad-kpi__val"><b>' + esc(o.value) + '</b>' + (o.unit ? '<small>' + esc(o.unit) + '</small>' : '') + '</span>' +
      (o.sub ? '<span class="ad-kpi__sub">' + (o.subHtml ? o.sub : esc(o.sub)) + '</span>' : '');
    return o.href ? '<a class="ad-kpi' + tone + '" href="' + esc(o.href) + '"' + (o.id ? ' id="' + esc(o.id) + '"' : '') + '>' + inner + '</a>'
      : '<div class="ad-kpi' + tone + '">' + inner + '</div>';
  }
  function panel(o) {
    var id = o.id || 'pn' + (++seq);
    return '<section class="ad-panel' + (o.flush ? ' is-flush' : '') + (o.cls ? ' ' + esc(o.cls) : '') + '" aria-labelledby="' + esc(id) + '">' +
      '<div class="ad-panel__head"><h2 class="ad-panel__ttl" id="' + esc(id) + '">' + esc(o.title) + (o.count != null ? '<span class="ad-panel__n num">' + esc(o.count) + '</span>' : '') + '</h2>' +
        (o.actions ? '<div class="ad-panel__acts">' + o.actions + '</div>' : '') + '</div>' +
      '<div class="ad-panel__body">' + (o.body || '') + '</div></section>';
  }
  function tabs(items, cur, label) {
    return '<nav class="ad-tabs" aria-label="' + esc(label || 'タブ') + '">' + items.map(function (t) {
      var on = t.id === cur;
      return '<a class="ad-tabs__a" href="' + esc(t.href) + '"' + (on ? ' aria-current="page"' : '') + ' data-tab-id="' + esc(t.id) + '">' + esc(t.label) +
        (t.n != null && t.n !== '' ? '<span class="ad-tabs__n num' + (t.alert ? ' is-alert' : '') + '">' + esc(t.n) + '</span>' : '') + '</a>';
    }).join('') + '</nav>';
  }
  function kv(rows) {
    return '<dl class="ad-kv">' + rows.filter(Boolean).map(function (r) {
      return '<div class="ad-kv__row"><dt>' + esc(r[0]) + '</dt><dd>' + (r[2] ? r[1] : esc(r[1] == null || r[1] === '' ? '―' : r[1])) + '</dd></div>';
    }).join('') + '</dl>';
  }
  function steps(done, total) {
    total = total || DATA.ONBOARDING.length;
    var pct = Math.round(done / total * 100);
    return '<span class="ad-steps' + (done >= total ? ' is-done' : '') + '"><span class="ad-steps__bar" aria-hidden="true"><i style="width:' + pct + '%"></i></span>' +
      '<span class="num">' + esc(done) + '/' + esc(total) + '</span></span>';
  }
  function age(iso) {
    if (!iso) return { text: '', hours: 0, over: false };
    var ms = CLG.now() - new Date(iso), h = ms / 3600000;
    var text = ms < 3600000 ? Math.max(1, Math.floor(ms / 60000)) + '分' : h < 48 ? Math.floor(h) + '時間' : Math.floor(h / 24) + '日';
    return { text: text, hours: h, over: h >= 24 };
  }
  function ageTag(iso, limit) {
    var a = age(iso), over = a.hours >= (limit || 24);
    return '<span class="ad-age' + (over ? ' is-over' : '') + '">' + (over ? icon('alert', 'ico-s') : '') + '<span class="num">' + esc(a.text) + '</span>' +
      (over ? '<span class="sr-only">（' + esc(limit || 24) + '時間を過ぎています）</span>' : '') + '</span>';
  }
  function empty(text, act) {
    var a = '';
    if (act && typeof act === 'object' && act.href) a = '<a class="btn btn-ghost btn-s" href="' + esc(act.href) + '">' + esc(act.label || '見る') + '</a>';
    else if (typeof act === 'string') a = act;
    return '<div class="ad-empty"><p>' + esc(text) + '</p>' + (a ? '<div class="ad-empty__act">' + a + '</div>' : '') + '</div>';
  }
  function skeleton(kind, n) {
    n = n || 8;
    if (kind !== 'table') return U.skeleton(kind || 'page');
    var rows = '';
    for (var i = 0; i < n; i++) rows += '<div class="ad-skel__row"><span class="skel-line" style="width:' + [18, 26, 12, 16, 22, 10][i % 6] + '%"></span><span class="skel-line" style="width:' + [30, 18, 24, 14, 20, 26][i % 6] + '%"></span><span class="skel-line" style="width:12%"></span></div>';
    return '<div class="ad-skel" aria-busy="true"><span class="sr-only">読み込み中</span><div aria-hidden="true">' +
      '<span class="skel-line is-h1"></span><div class="ad-skel__box">' + rows + '</div></div></div>';
  }

  /* ---------- CSV ----------
     Excel で開けるように BOM を付ける（U.download）。= + - @ で始まる値は式として動かないように ' を前に付ける */
  function csvCell(v) {
    var s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d[\d,.]*$/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function csvValue(col, r) {
    if (typeof col.csv === 'function') return col.csv(r);
    if (typeof col.value === 'function') return col.value(r);
    return r[col.key];
  }
  function csv(rows, columns) {
    var cols = columns.filter(function (c) { return c.csv !== false; });
    var lines = [cols.map(function (c) { return csvCell(c.csvLabel || c.label); }).join(',')];
    rows.forEach(function (r) { lines.push(cols.map(function (c) { return csvCell(csvValue(c, r)); }).join(',')); });
    return lines.join('\r\n') + '\r\n';
  }
  function stamp() { var d = CLG.now(); return d.getFullYear() + U.pad(d.getMonth() + 1) + U.pad(d.getDate()); }
  function downloadCsv(name, rows, columns) {
    U.download(String(name || 'data') + '_' + stamp() + '.csv', csv(rows, columns), 'text/csv');
    U.toast(rows.length + '件をCSVで書き出しました', 'ok');
  }

  /* ---------- 表 ---------- */
  /** 探すときの比べ方：大文字小文字・空白・ひらがなとカタカナの違いは見ない */
  function norm(s) { return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, '').replace(/[ぁ-ゖ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) + 0x60); }); }
  function qk(cfg, k) { return cfg.qp ? cfg.qp + '.' + k : k; }
  function colValue(c, r) { return typeof c.value === 'function' ? c.value(r) : r[c.key]; }
  function rowIdOf(cfg, r) { return String(cfg.rowId ? cfg.rowId(r) : (r.id != null ? r.id : r.no)); }
  /* 既定の値（f.value）がある絞り込みで「すべて」を選んだときは、? に '*' を入れる（消すと既定の値に戻ってしまうため） */
  function filterValue(cfg, f) { var v = (cfg.query || {})[qk(cfg, f.key)]; return v == null ? (f.value || '') : v === '*' ? '' : v; }
  function filterParam(cfg, key, v) {
    var f = (cfg.filters || []).filter(function (x) { return x.key === key; })[0];
    if (!v) return f && f.value ? '*' : null;
    return f && v === f.value ? null : v;
  }
  function matchFilter(f, r, v) {
    if (v === '' || v == null) return true;
    return typeof f.match === 'function' ? f.match(r, v) : String(r[f.key]) === v;
  }
  function matchSearch(cfg, r, q) {
    if (!q) return true;
    var s = cfg.search;
    if (typeof s === 'function') return s(r, q);
    var keys = (s && s.keys) || cfg.columns.map(function (c) { return c.key; });
    var nq = norm(q);
    return keys.some(function (k) {
      var col = cfg.columns.filter(function (c) { return c.key === k; })[0];
      var v = col ? colValue(col, r) : r[k];
      if (norm(v).indexOf(nq) >= 0) return true;
      // 列の値が表示用に変えてある（会員番号の列に名前を出すなど）ときは、元の値でも探す
      return !!col && r[k] != null && typeof r[k] !== 'object' && norm(r[k]).indexOf(nq) >= 0;
    });
  }
  function compare(a, b) {
    if (a == null || a === '') return b == null || b === '' ? 0 : 1;
    if (b == null || b === '') return -1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    if (typeof a === 'boolean' || typeof b === 'boolean') return (a ? 1 : 0) - (b ? 1 : 0);
    return String(a).localeCompare(String(b), 'ja', { numeric: true });
  }
  /** 絞り込み・探す・並べ替えを済ませた行（全ページ） */
  function computeRows(cfg, skipFilter) {
    var q = (cfg.query || {})[qk(cfg, 'q')] || '';
    var rows = (cfg.rows || []).filter(function (r) {
      if (!matchSearch(cfg, r, q)) return false;
      return (cfg.filters || []).every(function (f) { return f === skipFilter || matchFilter(f, r, filterValue(cfg, f)); });
    });
    if (skipFilter) return rows;
    var sort = (cfg.query || {})[qk(cfg, 'sort')] || cfg.sort || '';
    var desc = sort.charAt(0) === '-', key = sort.replace(/^-/, '');
    var col = cfg.columns.filter(function (c) { return c.key === key; })[0];
    if (col) {
      var val = col.sortValue || function (r) { return colValue(col, r); };
      rows = rows.map(function (r, i) { return { r: r, v: val(r), i: i }; })
        .sort(function (a, b) { var c = compare(a.v, b.v); if (desc && a.v != null && a.v !== '' && b.v != null && b.v !== '') c = -c; return c || a.i - b.i; })
        .map(function (x) { return x.r; });
    }
    return rows;
  }
  function pageList(page, pages) {
    var out = [], i;
    if (pages <= 7) { for (i = 1; i <= pages; i++) out.push(i); return out; }
    out.push(1);
    var a = Math.max(2, page - 1), b = Math.min(pages - 1, page + 1);
    if (a > 2) out.push('…');
    for (i = a; i <= b; i++) out.push(i);
    if (b < pages - 1) out.push('…');
    out.push(pages);
    return out;
  }
  function table(cfg) {
    cfg.columns = cfg.columns || [];
    var id = cfg.id || 'tb';
    var sel = selection[id] = selection[id] || {};
    var q = (cfg.query || {})[qk(cfg, 'q')] || '';
    var rows = computeRows(cfg);
    var total = (cfg.rows || []).length, count = rows.length;
    var size = cfg.pageSize || 50, pages = Math.max(1, Math.ceil(count / size));
    var page = Math.min(pages, Math.max(1, parseInt((cfg.query || {})[qk(cfg, 'page')], 10) || 1));
    var shown = rows.slice((page - 1) * size, page * size);
    tables[id] = { cfg: cfg, rows: rows };
    var sort = (cfg.query || {})[qk(cfg, 'sort')] || cfg.sort || '';
    var sortKey = sort.replace(/^-/, ''), sortDesc = sort.charAt(0) === '-';
    var active = !!q || (cfg.filters || []).some(function (f) { return filterValue(cfg, f) !== (f.value || ''); });
    var nSel = Object.keys(sel).length;

    // 絞り込み：丸い札（1つまで）と、選ぶ欄
    var chipF = (cfg.filters || []).filter(function (f) { return f.chips; })[0];
    var chips = chipF ? '<div class="chips ad-tb__chips" role="group" aria-label="' + esc(chipF.label) + 'で絞り込む">' + chipF.options.map(function (o) {
      var v = o[0], on = filterValue(cfg, chipF) === v;
      var n = o[2] != null ? o[2] : computeRows(cfg, chipF).filter(function (r) { return matchFilter(chipF, r, v); }).length;
      return '<button type="button" class="chip" aria-pressed="' + on + '" data-tb-chip="' + esc(id) + '" data-tb-key="' + esc(chipF.key) + '" data-v="' + esc(v) + '">' +
        esc(o[1]) + '<span class="n num">' + esc(n) + '</span></button>';
    }).join('') + '</div>' : '';
    var selects = (cfg.filters || []).filter(function (f) { return !f.chips; }).map(function (f) {
      var v = filterValue(cfg, f), fid = 'tbf-' + id + '-' + f.key;
      return '<div class="ad-tb__filter"><label class="sr-only" for="' + esc(fid) + '">' + esc(f.label) + '</label>' +
        '<select class="select ad-tb__select' + (v ? ' is-on' : '') + '" id="' + esc(fid) + '" data-tb-filter="' + esc(id) + '" data-tb-key="' + esc(f.key) + '">' +
        f.options.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === v ? ' selected' : '') + '>' + esc(o[0] === '' ? f.label + '：' + o[1] : o[1]) + '</option>'; }).join('') +
        '</select></div>';
    }).join('');
    var search = cfg.search === null ? '' : '<form class="ad-tb__search" role="search" data-tb-searchform="' + esc(id) + '">' +
      '<label class="sr-only" for="tbq-' + esc(id) + '">' + esc((cfg.search && cfg.search.label) || 'この表を探す') + '</label>' + icon('search', 'ico-s') +
      '<input class="input" type="search" id="tbq-' + esc(id) + '" data-tb-q="' + esc(id) + '" value="' + esc(q) + '" placeholder="' + esc((cfg.search && cfg.search.placeholder) || '探す') + '" autocomplete="off" enterkeyhint="search"></form>';
    // スマホ（かたまりの形）では見出しの行が隠れるので、並べ替えは選ぶ欄で
    var cards = cfg.cards !== false;
    var sortCols = cfg.sortable === false ? [] : cfg.columns.filter(function (c) { return !c.csvOnly && c.sort !== false; });
    var sortSel = cards && sortCols.length > 1 ? '<div class="ad-tb__filter ad-tb__sortsel"><label class="sr-only" for="tbs-' + esc(id) + '">並べ替え</label>' +
      '<select class="select ad-tb__select" id="tbs-' + esc(id) + '" data-tb-sortsel="' + esc(id) + '">' +
      (sortKey ? '' : '<option value="" selected>並べ替え：いつもの順</option>') +
      sortCols.map(function (c) {
        return [c.key, '-' + c.key].map(function (v) {
          return '<option value="' + esc(v) + '"' + (v === sort ? ' selected' : '') + '>' + esc('並べ替え：' + c.label + (v.charAt(0) === '-' ? '（降順）' : '（昇順）')) + '</option>';
        }).join('');
      }).join('') + '</select></div>' : '';
    var tools = '<div class="ad-tb__bar">' + search + selects + sortSel +
      '<span class="ad-tb__count"><b class="num">' + num(count) + '</b>件' + (count !== total ? '<span class="ad-tb__of">（' + num(total) + '件中）</span>' : '') + '</span>' +
      (active ? '<button type="button" class="btn btn-text btn-s ad-tb__reset" data-tb-clear="' + esc(id) + '">絞り込みを外す</button>' : '') +
      '<span class="ad-tb__tools">' + (cfg.tools || '') +
        (cfg.csv !== false ? '<button type="button" class="btn btn-ghost btn-s" data-tb-csv="' + esc(id) + '"' + (count ? '' : ' disabled') + '>' + icon('download', 'ico-s') + 'CSVを書き出す</button>' : '') +
      '</span></div>';

    // まとめて操作（選んでいるときだけ出す）
    var bulk = cfg.select ? '<div class="ad-tb__bulk" data-tb-bulkbar="' + esc(id) + '"' + (nSel ? '' : ' hidden') + ' role="region" aria-label="選んだ行の操作">' +
      '<span class="ad-tb__seln" aria-live="polite"><b class="num" data-tb-seln="' + esc(id) + '">' + nSel + '</b>件を選択中</span>' +
      (cfg.bulk || []).map(function (b) {
        return '<button type="button" class="btn btn-ink btn-s" data-tb-bulk="' + esc(id) + '" data-tb-act="' + esc(b.id) + '">' + (b.icon ? icon(b.icon, 'ico-s') : '') + esc(b.label) + '</button>';
      }).join('') +
      (cfg.csv !== false ? '<button type="button" class="btn btn-ghost btn-s" data-tb-csv="' + esc(id) + '" data-tb-csvsel="1">' + icon('download', 'ico-s') + '選んだ行をCSVに</button>' : '') +
      (count > shown.length ? '<button type="button" class="btn btn-text btn-s" data-tb-selall="' + esc(id) + '">条件に合う' + num(count) + '件をすべて選ぶ</button>' : '') +
      '<button type="button" class="btn btn-text btn-s" data-tb-clearsel="' + esc(id) + '">選択を外す</button></div>' : '';

    var cols = cfg.columns.filter(function (c) { return !c.csvOnly; });
    var mainCol = cols.filter(function (c) { return c.main; })[0] || cols[0];
    // 丸い札で1つの状態に絞ったとき、その列がどの行も同じ表示なら画面には出さない（同じ札が全部の行に並ぶだけなので。CSV には入る）
    var chipV = chipF ? filterValue(cfg, chipF) : '';
    if (chipV && shown.length) {
      cols = cols.filter(function (c) {
        if (c.key !== chipF.key || c === mainCol) return true;
        var first = null, same = true;
        shown.forEach(function (r) {
          var h = typeof c.html === 'function' ? c.html(r) : String(colValue(c, r) == null ? '' : colValue(c, r));
          if (first === null) first = h; else if (h !== first) same = false;
        });
        return !same;
      });
    }
    function hideCls(c) { return (c.hide ? ' ad-hide-' + c.hide : '') + (c.align === 'r' ? ' r' : '') + (c.nowrap ? ' nw' : '') + (c.cls ? ' ' + c.cls : ''); }
    // チェックは label で包む（指で押せる広さを 40px にするため。見た目の大きさは変えない）
    var thead = '<thead><tr>' + (cfg.select ? '<th scope="col" class="ad-tbl__ck"><label class="ad-ckhit"><input type="checkbox" class="ad-ck" data-tb-all="' + esc(id) + '" aria-label="このページの行をすべて選ぶ"' +
      (shown.length && shown.every(function (r) { return sel[rowIdOf(cfg, r)]; }) ? ' checked' : '') + '></label></th>' : '') +
      cols.map(function (c) {
        var canSort = c.sort !== false && cfg.sortable !== false;
        var on = sortKey === c.key;
        var aria = on ? ' aria-sort="' + (sortDesc ? 'descending' : 'ascending') + '"' : '';
        var w = c.width ? ' style="width:' + esc(c.width) + '"' : '';
        if (!canSort) return '<th scope="col" class="' + hideCls(c) + '"' + w + '>' + esc(c.label) + '</th>';
        return '<th scope="col" class="' + hideCls(c) + '"' + aria + w + '><button type="button" class="ad-sort' + (on ? ' is-on' : '') + '" data-tb-sort="' + esc(id) + '" data-tb-key="' + esc(c.key) + '">' +
          esc(c.label) + '<svg class="ad-sort__ico" viewBox="0 0 12 12" aria-hidden="true"><path d="' + (on ? (sortDesc ? 'M3 4.5 6 8l3-3.5' : 'M3 7.5 6 4l3 3.5') : 'M3.5 5 6 2.5 8.5 5M3.5 7 6 9.5 8.5 7') + '" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button></th>';
      }).join('') + '</tr></thead>';
    var body;
    if (!shown.length) {
      var msg = total && active ? '条件に合うものはありません。' : (cfg.empty || 'まだありません。');
      body = '<tbody><tr class="ad-tbl__empty"><td colspan="' + (cols.length + (cfg.select ? 1 : 0)) + '">' +
        empty(msg, total && active ? '<button type="button" class="btn btn-ghost btn-s" data-tb-clear="' + esc(id) + '">絞り込みを外す</button>' : '') + '</td></tr></tbody>';
    } else {
      body = '<tbody>' + shown.map(function (r) {
        var rid = rowIdOf(cfg, r), href = cfg.rowHref ? cfg.rowHref(r) : '', on = !!sel[rid];
        var cls = (href ? 'is-link' : '') + (on ? ' is-sel' : '') + (cfg.rowClass ? ' ' + (cfg.rowClass(r) || '') : '');
        return '<tr' + (cls.trim() ? ' class="' + esc(cls.trim()) + '"' : '') + ' data-tb-row="' + esc(rid) + '"' + (href ? ' data-tb-href="' + esc(href) + '"' : '') + '>' +
          (cfg.select ? '<td class="ad-tbl__ck"><label class="ad-ckhit"><input type="checkbox" class="ad-ck" data-tb-ck="' + esc(id) + '" data-tb-rid="' + esc(rid) + '" aria-label="' + esc((cfg.rowLabel ? cfg.rowLabel(r) : (r.name || rid)) + 'を選ぶ') + '"' + (on ? ' checked' : '') + '></label></td>' : '') +
          cols.map(function (c) {
            var h = typeof c.html === 'function' ? c.html(r) : esc(colValue(c, r) == null ? '' : colValue(c, r));
            var isMain = cards && c === mainCol;
            // data-label：スマホのかたまりの形で、値の前に列の名前を出す（題の列には出さない）
            return '<td class="' + (hideCls(c) + (isMain ? ' is-main' : '')).trim() + '"' + (cards && !isMain ? ' data-label="' + esc(c.label) + '"' : '') + '>' + h + '</td>';
          }).join('') + '</tr>';
      }).join('') + '</tbody>';
    }
    var pager = '';
    if (pages > 1) {
      pager = '<nav class="ad-tb__pager" aria-label="ページ">' +
        '<span class="ad-tb__range num">' + num((page - 1) * size + 1) + '–' + num(Math.min(count, page * size)) + '件目</span>' +
        '<button type="button" class="btn btn-ghost btn-s" data-tb-page="' + esc(id) + '" data-p="' + (page - 1) + '"' + (page <= 1 ? ' disabled' : '') + ' aria-label="前のページ">' + icon('back', 'ico-s') + '</button>' +
        pageList(page, pages).map(function (p) {
          if (p === '…') return '<span class="ad-tb__gap" aria-hidden="true">…</span>';
          return '<button type="button" class="ad-tb__pg num" data-tb-page="' + esc(id) + '" data-p="' + p + '"' + (p === page ? ' aria-current="page"' : '') + '>' + p + '</button>';
        }).join('') +
        // 狭い幅（本文 560px 以下）では番号の列の代わりに「3 / 7」だけを出す（番号が2行に折れないように。admin.css）
        '<span class="ad-tb__pos num"><span aria-hidden="true">' + page + ' / ' + pages + '</span><span class="sr-only">' + pages + 'ページ中' + page + 'ページ目</span></span>' +
        '<button type="button" class="btn btn-ghost btn-s" data-tb-page="' + esc(id) + '" data-p="' + (page + 1) + '"' + (page >= pages ? ' disabled' : '') + ' aria-label="次のページ">' + icon('arrow', 'ico-s') + '</button>' +
      '</nav>';
    }
    return '<div class="ad-tb" data-tb="' + esc(id) + '">' + chips + tools + bulk +
      '<div class="ad-tbl-wrap" tabindex="-1"><table class="ad-tbl' + (cfg.dense ? ' is-dense' : '') + (cards ? ' is-cards' : '') + (cfg.select ? ' has-ck' : '') + '"' + (cfg.caption ? '' : ' aria-label="' + esc(cfg.label || '一覧') + '"') + '>' +
        (cfg.caption ? '<caption class="sr-only">' + esc(cfg.caption) + '</caption>' : '') + thead + body + '</table></div>' + pager + '</div>';
  }
  function tableRows(id) { return tables[id] ? tables[id].rows : []; }
  function selected(id) {
    var t = tables[id], sel = selection[id] || {};
    if (!t) return [];
    var all = t.cfg.rows || [];
    return all.filter(function (r) { return sel[rowIdOf(t.cfg, r)]; });
  }
  function clearSelection(id) { selection[id] = {}; }
  /** 描いたあとに骨組みが呼ぶ：一部だけ選んでいる表の「すべて選ぶ」を「一部」の見た目にする（HTML では書けないため） */
  function hydrate(rootEl) {
    U.$$('[data-tb-all]', rootEl || doc).forEach(function (all) {
      var box = all.closest('[data-tb]'); if (!box) return;
      var cks = U.$$('[data-tb-ck]', box), k = cks.filter(function (c) { return c.checked; }).length;
      all.indeterminate = k > 0 && k < cks.length;
    });
    // 狭い幅でタブが横に流れるとき、いまのタブが見える位置まで送っておく（右の端に隠れたままにしない）
    U.$$('.ad-tabs', rootEl || doc).forEach(function (nav) {
      var on = nav.querySelector('[aria-current="page"]'), over = nav.scrollWidth > nav.clientWidth + 1;
      nav.classList.toggle('is-scroll', over);
      if (!on || !over) return;
      var left = on.getBoundingClientRect().left - nav.getBoundingClientRect().left + nav.scrollLeft, right = left + on.offsetWidth;
      if (right > nav.scrollLeft + nav.clientWidth || left < nav.scrollLeft) nav.scrollLeft = Math.max(0, left - 24);
    });
  }

  /* 選択だけは描き直さずに見た目をそろえる（273行の表を描き直すと、押したチェックの焦点が揺れるため） */
  function syncSel(id) {
    var box = doc.querySelector('[data-tb="' + id + '"]'); if (!box) return;
    var sel = selection[id] || {}, n = Object.keys(sel).length;
    var bar = box.querySelector('[data-tb-bulkbar]'); if (bar) bar.hidden = !n;
    var nEl = box.querySelector('[data-tb-seln]'); if (nEl) nEl.textContent = n;
    var cks = U.$$('[data-tb-ck]', box);
    cks.forEach(function (c) { var on = !!sel[c.getAttribute('data-tb-rid')]; c.checked = on; var tr = c.closest('tr'); if (tr) tr.classList.toggle('is-sel', on); });
    var all = box.querySelector('[data-tb-all]');
    if (all) { var k = cks.filter(function (c) { return c.checked; }).length; all.checked = k && k === cks.length; all.indeterminate = k > 0 && k < cks.length; }
  }

  var qTimer = null;
  function bind() {
    if (!doc || !doc.addEventListener || bind.done) return;
    bind.done = true;
    function inView(el) { return el && el.closest('#adView'); }
    doc.addEventListener('click', function (e) {
      var t = e.target, b, id, cfg;
      if (!inView(t)) return;
      if ((b = t.closest('[data-tb-sort]'))) {
        cfg = (tables[b.getAttribute('data-tb-sort')] || {}).cfg; if (!cfg) return;
        var key = b.getAttribute('data-tb-key'), cur = (cfg.query || {})[qk(cfg, 'sort')] || cfg.sort || '';
        var col = cfg.columns.filter(function (c) { return c.key === key; })[0] || {};
        var next = cur.replace(/^-/, '') === key ? (cur.charAt(0) === '-' ? key : '-' + key) : (col.dir === 'desc' ? '-' + key : key);
        var p = {}; p[qk(cfg, 'sort')] = next; p[qk(cfg, 'page')] = null; setQuery(p, { replace: true });
        return;
      }
      if ((b = t.closest('[data-tb-chip]'))) {
        cfg = (tables[b.getAttribute('data-tb-chip')] || {}).cfg; if (!cfg) return;
        var p2 = {}; p2[qk(cfg, b.getAttribute('data-tb-key'))] = filterParam(cfg, b.getAttribute('data-tb-key'), b.getAttribute('data-v')); p2[qk(cfg, 'page')] = null;
        clearSelection(b.getAttribute('data-tb-chip'));
        setQuery(p2);
        return;
      }
      if ((b = t.closest('[data-tb-page]'))) {
        cfg = (tables[b.getAttribute('data-tb-page')] || {}).cfg; if (!cfg || b.disabled) return;
        var p3 = {}; p3[qk(cfg, 'page')] = +b.getAttribute('data-p') > 1 ? b.getAttribute('data-p') : null;
        setQuery(p3);
        setTimeout(function () { var nb = doc.querySelector('[data-tb="' + (cfg.id || 'tb') + '"]'); if (nb && nb.getBoundingClientRect().top < 0) U.smoothScroll(nb, { block: 'start' }); }, 30);
        return;
      }
      if ((b = t.closest('[data-tb-clear]'))) {
        id = b.getAttribute('data-tb-clear'); cfg = (tables[id] || {}).cfg; if (!cfg) return;
        var p4 = {}; p4[qk(cfg, 'q')] = null; p4[qk(cfg, 'page')] = null;
        (cfg.filters || []).forEach(function (f) { p4[qk(cfg, f.key)] = null; });
        clearSelection(id); setQuery(p4, { focus: '[data-tb-q="' + id + '"]' });
        return;
      }
      if ((b = t.closest('[data-tb-csv]'))) {
        id = b.getAttribute('data-tb-csv'); var tb = tables[id]; if (!tb) return;
        var rows = b.getAttribute('data-tb-csvsel') ? selected(id) : tb.rows;
        downloadCsv((tb.cfg.csv && tb.cfg.csv.name) || id, rows, tb.cfg.columns);
        return;
      }
      if ((b = t.closest('[data-tb-selall]'))) {
        id = b.getAttribute('data-tb-selall'); var tb2 = tables[id]; if (!tb2) return;
        var s = selection[id] = {}; tb2.rows.forEach(function (r) { s[rowIdOf(tb2.cfg, r)] = true; });
        syncSel(id); b.hidden = true;
        CLG.admin.app && CLG.admin.app.announce(tb2.rows.length + '件を選びました');
        return;
      }
      if ((b = t.closest('[data-tb-clearsel]'))) {
        id = b.getAttribute('data-tb-clearsel'); clearSelection(id); syncSel(id);
        var first = doc.querySelector('[data-tb="' + id + '"] [data-tb-all]'); if (first) first.focus();
        return;
      }
      if ((b = t.closest('[data-tb-bulk]'))) {
        id = b.getAttribute('data-tb-bulk'); var tb3 = tables[id]; if (!tb3) return;
        var act = (tb3.cfg.bulk || []).filter(function (x) { return x.id === b.getAttribute('data-tb-act'); })[0];
        if (act && act.run) act.run(selected(id), { clear: function () { clearSelection(id); syncSel(id); } });
        return;
      }
      // 行を押したら、その行のリンク先へ（中のリンク・ボタン・チェックはそのまま）
      var tr = t.closest('tr[data-tb-href]');
      if (tr && !t.closest('a,button,input,select,textarea,label,summary,[data-no-row]')) {
        var sel2 = global.getSelection ? String(global.getSelection()) : '';
        if (sel2) return;   // 文字を選んでいるときは移らない（会員番号をコピーしたいとき）
        global.location.hash = tr.getAttribute('data-tb-href').replace(/^#/, '');
      }
    });
    doc.addEventListener('change', function (e) {
      var t = e.target, id, cfg;
      if (!inView(t)) return;
      if (t.matches('[data-tb-filter]')) {
        cfg = (tables[t.getAttribute('data-tb-filter')] || {}).cfg; if (!cfg) return;
        var p = {}; p[qk(cfg, t.getAttribute('data-tb-key'))] = filterParam(cfg, t.getAttribute('data-tb-key'), t.value); p[qk(cfg, 'page')] = null;
        clearSelection(t.getAttribute('data-tb-filter'));
        setQuery(p);
        return;
      }
      if (t.matches('[data-tb-sortsel]')) {
        cfg = (tables[t.getAttribute('data-tb-sortsel')] || {}).cfg; if (!cfg) return;
        var ps = {}; ps[qk(cfg, 'sort')] = t.value || null; ps[qk(cfg, 'page')] = null;
        setQuery(ps, { replace: true });
        return;
      }
      if (t.matches('[data-tb-ck]')) {
        id = t.getAttribute('data-tb-ck');
        var s = selection[id] = selection[id] || {}, rid = t.getAttribute('data-tb-rid');
        if (t.checked) s[rid] = true; else delete s[rid];
        syncSel(id);
        return;
      }
      if (t.matches('[data-tb-all]')) {
        id = t.getAttribute('data-tb-all');
        var s2 = selection[id] = selection[id] || {};
        U.$$('[data-tb="' + id + '"] [data-tb-ck]').forEach(function (c) { var r = c.getAttribute('data-tb-rid'); if (t.checked) s2[r] = true; else delete s2[r]; });
        syncSel(id);
      }
    });
    doc.addEventListener('input', function (e) {
      var t = e.target;
      if (!inView(t) || !t.matches('[data-tb-q]')) return;
      if (e.isComposing) return;   // 変換中は待つ
      clearTimeout(qTimer);
      qTimer = setTimeout(function () { applySearch(t); }, 280);
    });
    doc.addEventListener('compositionend', function (e) {
      var t = e.target;
      if (inView(t) && t.matches && t.matches('[data-tb-q]')) { clearTimeout(qTimer); qTimer = setTimeout(function () { applySearch(t); }, 120); }
    });
    doc.addEventListener('submit', function (e) {
      var f = e.target;
      if (!inView(f) || !f.matches('[data-tb-searchform]')) return;
      e.preventDefault();
      clearTimeout(qTimer);
      var inp = f.querySelector('[data-tb-q]'); if (inp) applySearch(inp);
    });
  }
  function applySearch(inp) {
    var id = inp.getAttribute('data-tb-q'), cfg = (tables[id] || {}).cfg; if (!cfg) return;
    var v = String(inp.value || '').trim(), cur = (cfg.query || {})[qk(cfg, 'q')] || '';
    if (v === cur) return;
    var p = {}; p[qk(cfg, 'q')] = v || null; p[qk(cfg, 'page')] = null;
    clearSelection(id);
    setQuery(p, { replace: true });
  }

  /* ---------- 引き出し ---------- */
  function drawer(html, o) {
    o = o || {};
    var bg = U.modal(html, { title: o.title, foot: o.foot, dirty: o.dirty, focus: o.focus, label: o.label, onClose: o.onClose,
      cls: 'ad-drawer' + (o.wide ? ' ad-drawer--wide' : '') + (o.cls ? ' ' + o.cls : '') });
    bg.classList.add('ad-drawer-bg');
    return bg;
  }

  /* ---------- 理由を書いて確かめる ---------- */
  function act(o) {
    o = o || {};
    return new Promise(function (resolve) {
      var fid = 'act' + (++seq), done = false, m;
      var need = o.reason === undefined ? true : o.reason;
      var presets = (o.reasons || []).length ? '<div class="chips ad-act__presets" role="group" aria-label="よくある理由">' + o.reasons.map(function (r, i) {
        return '<button type="button" class="chip" data-act-preset="' + i + '">' + esc(r) + '</button>';
      }).join('') + '</div>' : '';
      var body = (o.text ? '<p class="ad-act__text">' + U.jp(o.text, { br: true }) + '</p>' : '') + (o.html || '') +
        '<form class="ad-act" id="' + fid + '" novalidate>' + (o.fields || '') +
        (need === false ? '' : '<div class="field ad-act__reason"><label class="field__label" for="' + fid + '-r">' + esc(o.reasonLabel || '理由') +
          (need === 'optional' ? '<span class="opt">任意</span>' : '') + '</label>' + presets +
          '<textarea class="textarea" id="' + fid + '-r" name="reason" rows="3" maxlength="400"' + (need === true ? ' required' : '') + '>' + esc(o.defaultReason || '') + '</textarea>' +
          (o.audit ? '<small>操作の記録に残ります</small>' : '') + '</div>') +
        '<p class="form-err" role="alert" data-act-err></p></form>';
      m = U.modal(body, {
        title: o.title || '確かめる', wide: !!o.wide, cls: 'ad-actbox' + (o.cls ? ' ' + o.cls : ''), dirty: need !== false,
        foot: '<button type="button" class="btn btn-soft" data-close>' + esc(o.cancel || 'やめる') + '</button>' +
          '<button type="submit" form="' + fid + '" class="btn ' + (o.danger ? 'btn-danger' : o.kind === 'ink' ? 'btn-ink' : 'btn-primary') + '">' + esc(o.ok || '実行する') + '</button>',
        focus: o.focus || (need === true ? 'textarea' : null),
        onClose: function () { if (!done) { done = true; resolve(null); } }
      });
      var form = m.querySelector('#' + fid);
      if (form.querySelector('[required]')) U.fieldErrors(form, {}, { focus: false });
      m.addEventListener('click', function (e) {
        var b = e.target.closest('[data-act-preset]'); if (!b) return;
        var ta = form.querySelector('textarea[name=reason]'); ta.value = o.reasons[+b.getAttribute('data-act-preset')]; ta.focus();
        U.fieldErrors(form, { reason: '' }, { focus: false });
        if (m.setDirty) m.setDirty(true);
      });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var data = {};
        U.$$('input,select,textarea', form).forEach(function (el) {
          if (!el.name) return;
          if (el.type === 'checkbox') data[el.name] = el.checked; else if (el.type === 'radio') { if (el.checked) data[el.name] = el.value; } else data[el.name] = el.value;
        });
        var reason = String(data.reason || '').trim();
        var err = form.querySelector('[data-act-err]'); err.innerHTML = '';
        if (need === true && !reason) { U.fieldErrors(form, { reason: (o.reasonLabel || '理由') + 'を入れてください' }); return; }
        var res = o.run ? o.run(reason, data) : { ok: true };
        if (res && res.ok === false) {
          if (res.errors) U.fieldErrors(form, res.errors);
          else { err.innerHTML = icon('info', 'ico-s') + '<span>' + esc(res.error || 'できませんでした') + '</span>'; }
          return;
        }
        if (o.audit && AD.db) {
          var a = typeof o.audit === 'function' ? o.audit(reason, data, res) : o.audit;
          if (a) AD.db.audit(Object.assign({}, a, { reason: a.reason != null ? a.reason : reason }));
        }
        done = true;
        m.close();
        if (o.done) U.toast(o.done, 'ok');
        resolve(res || { ok: true });
      });
    });
  }

  /* ---------- よく使う列 ----------
     AU.col.date('joinedAt', '入会')  AU.col.when('at', '日時')  AU.col.rel('lastActive', '最後のログイン')
     AU.col.money('amount', '金額')   AU.col.member('no', '会員')  AU.col.status('status', '状態', 'member')
     2つ目の引数のあとに、上書きしたい列の設定を渡せる（{ hide: 'md' } など） */
  function ymdhm(d, time) {
    if (!d) return '';
    d = new Date(d);
    return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate()) + (time ? ' ' + U.pad(d.getHours()) + ':' + U.pad(d.getMinutes()) : '');
  }
  var col = {
    date: function (key, label, o) {
      return Object.assign({ key: key, label: label, dir: 'desc', nowrap: true,
        html: function (r) { return r[key] ? '<span class="num">' + esc(U.fmtShort(r[key])) + '</span>' : '<span class="muted">―</span>'; },
        csv: function (r) { return ymdhm(r[key]); } }, o || {});
    },
    when: function (key, label, o) {
      return Object.assign({ key: key, label: label, dir: 'desc', nowrap: true,
        html: function (r) { return r[key] ? '<span class="num">' + esc(U.fmtShort(r[key], true)) + '</span>' : '<span class="muted">―</span>'; },
        csv: function (r) { return ymdhm(r[key], true); } }, o || {});
    },
    rel: function (key, label, o) {
      return Object.assign({ key: key, label: label, dir: 'desc', nowrap: true,
        html: function (r) { return r[key] ? '<time datetime="' + esc(r[key]) + '" title="' + esc(U.fmtShort(r[key], true)) + '">' + esc(U.relTime(r[key])) + '</time>' : '<span class="muted">―</span>'; },
        csv: function (r) { return ymdhm(r[key], true); } }, o || {});
    },
    money: function (key, label, o) {
      return Object.assign({ key: key, label: label, align: 'r', dir: 'desc', nowrap: true,
        html: function (r) { return '<span class="num">' + esc(U.yen(r[key])) + '</span>'; },
        csv: function (r) { return r[key]; } }, o || {});
    },
    member: function (key, label, o) {
      return Object.assign({ key: key, label: label,
        value: function (r) { var m = AD.data && AD.data.member(r[key]); return m ? m.name : r[key]; },
        html: function (r) { return who(r[key]); },
        csv: function (r) { var m = AD.data && AD.data.member(r[key]); return (m ? m.name + ' ' : '') + r[key]; } }, o || {});
    },
    status: function (key, label, group, o) {
      return Object.assign({ key: key, label: label, nowrap: true,
        html: function (r) { return status(group, r[key]); },
        csv: function (r) { return statusLabel(group, r[key]); } }, o || {});
    }
  };

  bind();

  AD.ui = {
    col: col, ymd: ymdhm,
    head: head, status: status, statusLabel: statusLabel, STATUS: ST, who: who, colorOf: colorOf, kpi: kpi, panel: panel, tabs: tabs, kv: kv,
    steps: steps, age: age, ageTag: ageTag, empty: empty, skeleton: skeleton,
    table: table, tableRows: tableRows, selected: selected, clearSelection: clearSelection, hydrate: hydrate,
    csv: csv, downloadCsv: downloadCsv, drawer: drawer, act: act, setQuery: setQuery,
    when: when, date: date, money: money, num: num,
    ROLES: ROLES, ROLE_TABLE: ROLE_TABLE, can: can, canSome: canSome, whoCan: whoCan, dis: dis, need: need, roleNote: roleNote, role: roleOf
  };
})(window);
