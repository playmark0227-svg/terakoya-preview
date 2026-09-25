/* ============================================================
   運営画面：福利厚生・専門家（#/perks ?tab=list|experts|pros）
   ------------------------------------------------------------
   - 福利厚生：特典の一覧（使い方・コード・使われた回数・期限・状態）。足す・直す・止める。
     クーポンコードの特典は、共通のコード1つか、1人1つのコードを発行する（CSVで書き出せる）。
     割引は「最大◯%」だけを題に書かない・「商品・店舗により異なる」を添える（画面づくりの約束 §3）。
   - 専門家への相談：受付 → 日程調整 → 予約確定 → 相談済み。デモ会員の分は R.advanceExpert と R.staffReply
     （会員ページの「福利厚生・専門家」と「相談・メッセージ」に届く）。ほかの会員の分は AD.db.state.experts。
   - 専門家：事務所・受付時間・次に空いている枠・受付を止める。
   - 会員ページとのつながり：足した・直した・公開した・止めた特典は R.cmsUpsert('perk') で会員ページの福利厚生にも出す
     （下書きは出さない・止めたものは外す）。一覧の元は data.js の元の中身（cms.base('perk')）。
   - 役割：特典は代表・運営だけ。専門家への相談を進めるのは「会員・メッセージ」の役割（代表・運営）。講師・経理は見るだけ。
   運営の保存：AD.db.state.perkOps { added[], edits{}, status{}, codes{}, experts{} }
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, AD = CLG.admin, AU = AD.ui, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon;
  var cur = null;
  var DAY = 86400000;
  function cms() { return AD.cms; }

  var K = 'perkOps';
  function empty() { return { added: [], edits: {}, status: {}, codes: {}, experts: {} }; }
  function box() { return cms().box(K, empty); }
  function save(fn) { return cms().save(K, empty, fn); }
  function me() { return (AD.db.staff() || {}).id; }
  function nowIso() { return CLG.now().toISOString(); }

  var CATS = ['暮らし', '子育て', '遊び', '仕事', '学び'];
  var HOW = [['code', 'クーポンコード'], ['card', '会員証を見せる'], ['site', '提携サイトから'], ['account', 'アカウントを発行']];
  function howType(p) {
    if (p.howType) return p.howType;
    var h = String(p.how || '');
    return /コード/.test(h) ? 'code' : /会員証/.test(h) ? 'card' : /アカウント/.test(h) ? 'account' : 'site';
  }
  function howName(t) { var x = HOW.filter(function (h) { return h[0] === t; })[0]; return x ? x[1] : ''; }

  /* ---------- 特典 ---------- */
  function today0() { var d = CLG.now(); d.setHours(0, 0, 0, 0); return d; }
  function canP() { return AU.can('content'); }
  function canM() { return AU.can('members'); }
  function dis(ok) { return ok ? '' : ' disabled'; }
  /** 特典を会員ページにも出す（下書き＝出さない・止めた＝外す） */
  function syncPerk(id) {
    var p = findPerk(id); if (!p) return false;
    var st = box().status[id] || p.status;
    return cms().push('perk', { id: p.id, cat: p.cat, title: p.title, desc: p.desc || '', how: p.how || howName(howType(p)), howType: howType(p), example: p.example || '', area: p.area || '',
      until: p.until || '', partner: p.partner || '', note: p.note || '', publish: st === 'draft' ? 'draft' : st === 'paused' ? 'hidden' : 'published' }, '特典を');
  }
  function perks() {
    var b = box(), enrolled = cms().countTarget('all');
    return cms().base('perk').concat(b.added || []).map(function (p, i) {
      var x = Object.assign({}, p, b.edits[p.id] || {});
      var st = b.status[p.id] || x.status || 'open';
      if (st === 'open' && x.until && cms().parseDT(x.until) && cms().parseDT(x.until) < today0()) st = 'ended';
      var r = DATA.rng(cms().hash(p.id) + 5);
      var uses = st === 'draft' || p.added ? 0 : Math.round(enrolled * (0.02 + r() * 0.14));
      return Object.assign(x, { status: st, howType: howType(x), uses: uses, added: !!p.added, idx: i });
    });
  }
  function findPerk(id) { return perks().filter(function (p) { return p.id === id; })[0] || null; }
  /* コード：運営が発行したもの。まだのときは、使われた回数から決まった形を作っておく（試作版のデータ） */
  function codeOf(p) {
    if (p.howType !== 'code') return null;
    var c = box().codes[p.id];
    if (c) return c;
    var r = DATA.rng(cms().hash('code' + p.id));
    var unique = r() < 0.5;
    return { mode: unique ? 'unique' : 'shared', shared: unique ? '' : 'TSY' + String(1000 + Math.floor(r() * 9000)), stock: unique ? 300 : null,
      issued: p.uses, until: p.until || '', seed: true };
  }
  function codeText(p) {
    var c = codeOf(p);
    if (!c) return '';
    if (c.mode === 'shared') return '共通：' + c.shared;
    return '1人1つ：残り ' + Math.max(0, (c.stock || 0) - (c.issued || 0)) + '/' + (c.stock || 0);
  }
  var ST = { open: '公開', draft: '下書き', paused: '止めている', ended: '期限切れ' };
  function stHtml(p) {
    if (p.status === 'open') return '<span class="ad-st">公開</span>';
    if (p.status === 'draft') return U.statusTag('closed', '下書き');
    if (p.status === 'paused') return U.statusTag('hold', '止めている');
    return U.statusTag('closed', '期限切れ');
  }
  function listView(ctx) {
    return AU.table({
      id: 'perks', rows: perks(), query: ctx.query, sort: '', label: '福利厚生',
      filters: [{ key: 'cat', label: '種類', chips: true, options: [['', 'すべて']].concat(CATS.map(function (c) { return [c, c]; })) },
        { key: 'status', label: '状態', options: [['', 'すべて'], ['open', '公開'], ['draft', '下書き'], ['paused', '止めている'], ['ended', '期限切れ']] }],
      search: { placeholder: '特典・提携先・地域', keys: ['title', 'partner', 'area'] },
      columns: [
        { key: 'title', label: '特典', main: true, html: function (p) {
          return '<button type="button" class="a-linkbtn" data-pk-open="' + esc(p.id) + '">' + esc(p.title) + '</button><span class="a-pk__sub">' + esc(p.partner || '') + '</span>';
        } },
        { key: 'cat', label: '種類', hide: 'md' },
        { key: 'howType', label: '使い方', value: function (p) { return howName(p.howType); } },
        { key: 'code', label: 'コード', sort: false, hide: 'sm', value: function (p) { return codeText(p); }, html: function (p) {
          var t = codeText(p); return t ? '<span class="a-pk__code">' + esc(t) + '</span>' : '<span class="muted">―</span>';
        } },
        { key: 'uses', label: '30日で使われた', align: 'r', dir: 'desc', html: function (p) { return '<span class="num">' + U.num(p.uses) + '</span>回'; } },
        { key: 'until', label: '期限', nowrap: true, html: function (p) { return p.until ? '<span class="num">' + esc(U.fmtShort(cms().parseDT(p.until))) + '</span>' : 'なし'; }, csv: function (p) { return p.until || ''; } },
        { key: 'status', label: '状態', value: function (p) { return ST[p.status]; }, html: stHtml }
      ],
      rowClass: function (p) { return 'is-link' + (p.status !== 'open' ? ' is-quiet' : ''); },
      csv: { name: '福利厚生' }, empty: 'まだ特典はありません。'
    });
  }
  function perkDrawer(p) {
    var c = codeOf(p);
    var codeHtml = '';
    if (c) {
      if (c.mode === 'shared') codeHtml = '<div class="a-pk__codebox"><span class="a-pk__codelbl">共通のコード</span><b class="mono a-pk__big">' + esc(c.shared) + '</b>' +
        '<button type="button" class="btn btn-ghost btn-s" data-pk-copy="' + esc(c.shared) + '">' + icon('copy', 'ico-s') + 'コピー</button></div>';
      else codeHtml = '<div class="a-pk__codebox"><span class="a-pk__codelbl">1人1つのコード</span><b class="num a-pk__big">' + U.num(Math.max(0, c.stock - c.issued)) + '<small>/' + U.num(c.stock) + ' 残り</small></b>' +
        (c.list ? '<button type="button" class="btn btn-ghost btn-s" data-pk-codecsv="' + esc(p.id) + '">' + icon('download', 'ico-s') + 'コードをCSVに</button>' : '') + '</div>';
      codeHtml += '<p class="a-pk__sub">' + (c.until ? 'コードの期限 ' + esc(U.fmtShort(cms().parseDT(c.until))) + '・' : '') + (c.seed ? '最初の発行' : '発行 ' + esc(U.fmtShort(c.createdAt)) + '・' + esc(AD.db.staffName(c.by))) + '</p>';
    }
    var foot = '<button type="button" class="btn btn-text" data-pk-toggle="' + esc(p.id) + '"' + dis(canP()) + '>' + (p.status === 'paused' || p.status === 'draft' ? '公開する' : '止める') + '</button>' +
      (p.howType === 'code' ? '<button type="button" class="btn btn-ghost" data-pk-code="' + esc(p.id) + '"' + dis(canP()) + '>コードを発行する</button>' : '') +
      '<button type="button" class="btn btn-ink" data-pk-edit="' + esc(p.id) + '"' + dis(canP()) + '>直す</button>';
    var dw = AU.drawer(
      '<h3 class="a-pk__ttl">' + esc(p.title) + '</h3>' +
      (p.desc ? '<p class="a-pk__desc">' + U.jp(p.desc) + '</p>' : '') +
      AU.kv([['状態', stHtml(p), true], ['種類', p.cat], ['使い方', howName(p.howType) + (p.how && p.how !== howName(p.howType) ? '（' + p.how + '）' : '')], ['提携先', p.partner],
        ['例', String(p.example || '').replace(/^例[：:]\s*/, '')], ['地域', p.area],
        ['期限', p.until ? U.fmtDate(cms().parseDT(p.until)) : 'なし'], ['注記', p.note], ['30日で使われた', p.uses + '回']]) +
      (codeHtml ? '<h3 class="a-pk__h">コード</h3>' + codeHtml : ''),
      { title: '福利厚生', cls: 'a-perks', foot: foot });
    dw.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pk-toggle],[data-pk-code],[data-pk-edit],[data-pk-copy],[data-pk-codecsv]'); if (!b || b.disabled) return;
      if (b.hasAttribute('data-pk-copy')) { U.copyText(b.getAttribute('data-pk-copy')).then(function () { U.toast('コピーしました', 'ok'); }); return; }
      if (b.hasAttribute('data-pk-codecsv')) { codeCsv(p); return; }
      dw.close();
      if (b.hasAttribute('data-pk-toggle')) toggle(p);
      else if (b.hasAttribute('data-pk-code')) codeForm(p);
      else perkForm(p);
    });
  }
  function toggle(p) {
    var open = p.status === 'paused' || p.status === 'draft';
    if (open) {
      save(function (b) { b.status[p.id] = 'open'; });
      var pushed = syncPerk(p.id);
      AD.db.audit({ action: 'perk_open', label: '特典を公開した', target: { type: 'perk', id: p.id, name: p.title } });
      if (pushed) U.toast('公開しました。会員ページの福利厚生にも出ています', 'ok');
      cur.refresh();
      return;
    }
    AU.act({
      title: '特典を止める', ok: '止める', danger: true, reason: true,
      text: '「' + p.title + '」を会員ページの一覧から下げます。',
      reasons: ['提携先の都合で一時停止', '内容を見直す', '提携が終わった'],
      run: function () { save(function (b) { b.status[p.id] = 'paused'; }); syncPerk(p.id); return { ok: true }; },
      audit: { action: 'perk_pause', label: '特典を止めた', target: { type: 'perk', id: p.id, name: p.title } },
      done: '特典を止めました。会員ページの福利厚生からも外れました'
    }).then(function (r) { if (r) cur.refresh(); });
  }
  function codeCsv(p) {
    var c = codeOf(p); if (!c || !c.list) return;
    AU.downloadCsv(p.title + '_コード', c.list.map(function (x, i) { return { i: i + 1, code: x }; }), [
      { label: '番号', value: function (x) { return x.i; } }, { label: 'コード', value: function (x) { return x.code; } }, { label: '期限', value: function () { return c.until || ''; } }
    ]);
  }
  function genCode(prefix, r) {
    var A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = '';
    for (var i = 0; i < 6; i++) s += A.charAt(Math.floor(r() * A.length));
    return (prefix || 'TSY') + '-' + s;
  }
  function codeForm(p) {
    var c = codeOf(p) || {};
    var seedR = DATA.rng(cms().hash(p.id + Date.now()));
    cms().formDrawer({
      title: 'コードを発行する', ok: '発行する', kind: 'ink', cls: 'a-perks',
      lead: '<p class="a-cms__lead">「' + esc(p.title) + '」のクーポンコード</p>',
      body: cms().radios({ name: 'mode', label: '発行の形', value: c.mode || 'shared', options: [['shared', '全員に同じコード'], ['unique', '1人1つずつ']] }) +
        cms().field({ name: 'shared', label: 'コード', value: c.shared || genCode('TSY', seedR), maxlength: 20, required: true, hidden: (c.mode || 'shared') !== 'shared', hint: '英字と数字。提携先から受け取ったものを入れる' }) +
        '<div class="a-cms__row2" data-pk-unique' + ((c.mode || 'shared') === 'unique' ? '' : ' hidden') + '>' +
          cms().field({ name: 'stock', label: '発行する数', type: 'number', value: 100, min: 1, max: 2000, required: true }) +
          cms().field({ name: 'prefix', label: 'コードの頭', value: 'TSY', maxlength: 6, required: true }) +
        '</div>' +
        cms().field({ name: 'until', label: 'コードの期限', type: 'date', value: p.until || '', opt: true }),
      onMount: function (form) {
        form.addEventListener('change', function (e) {
          if (e.target.name !== 'mode') return;
          form.querySelector('[name=shared]').closest('.field').hidden = e.target.value !== 'shared';
          form.querySelector('[data-pk-unique]').hidden = e.target.value !== 'unique';
        });
      },
      onSubmit: function (d) {
        var e = {}, stock = parseInt(d.stock, 10), code = String(d.shared || '').trim().toUpperCase(), prefix = String(d.prefix || '').trim().toUpperCase();
        if (d.mode === 'shared' && !/^[A-Z0-9-]{4,20}$/.test(code)) e.shared = 'コードは英字・数字・ハイフンで4〜20文字にしてください';
        if (d.mode === 'unique') {
          if (!(stock >= 1 && stock <= 2000)) e.stock = '発行する数は1〜2,000で入れてください';
          if (!/^[A-Z0-9]{1,6}$/.test(prefix)) e.prefix = 'コードの頭は英字と数字で6文字までです';
        }
        var until = d.until ? cms().parseDT(d.until) : null;
        if (d.until && (!until || until < today0())) e.until = '期限は今日以降の日にしてください';
        if (Object.keys(e).length) return { ok: false, errors: e };
        var rec = { mode: d.mode, until: d.until || '', createdAt: nowIso(), by: me(), issued: 0 };
        if (d.mode === 'shared') rec.shared = code;
        else {
          var seen = {}, list = [], r = DATA.rng(cms().hash(p.id + nowIso()));
          while (list.length < stock) { var x = genCode(prefix, r); if (!seen[x]) { seen[x] = 1; list.push(x); } }
          rec.stock = stock; rec.list = list;
        }
        save(function (b) { b.codes[p.id] = rec; });
        AD.db.audit({ action: 'perk_code', label: 'クーポンコードを発行した', target: { type: 'perk', id: p.id, name: p.title }, detail: d.mode === 'shared' ? '共通 ' + code : '1人1つ ' + stock + '件' });
        U.toast((d.mode === 'shared' ? 'コードを発行しました' : stock + '件のコードを発行しました') + '。本番では会員ページの特典に出ます', 'ok');
        cur.refresh();
        setTimeout(function () { var np = findPerk(p.id); if (np) perkDrawer(np); }, 50);
        return { ok: true };
      }
    });
  }
  function perkForm(p) {
    var isNew = !p;
    p = p || { title: '', cat: '暮らし', desc: '', howType: 'code', how: '', partner: '', example: '', area: '全国', until: '', note: '商品・店舗により異なります', status: 'draft' };
    cms().formDrawer({
      title: isNew ? '特典を足す' : '特典を直す', ok: isNew ? '足す' : '保存する', cls: 'a-perks', wide: true,
      body: cms().field({ name: 'title', label: '特典の名前', value: p.title, required: true, maxlength: 40, hint: '「最大◯%OFF」のように最大値だけを題に書かない' }) +
        '<div class="a-cms__row2">' +
          cms().field({ name: 'cat', label: '種類', type: 'select', value: p.cat, options: CATS.map(function (c) { return [c, c]; }) }) +
          cms().field({ name: 'howType', label: '使い方', type: 'select', value: howType(p), options: HOW }) +
        '</div>' +
        cms().field({ name: 'how', label: '使い方の説明', value: p.how, maxlength: 60, opt: true, placeholder: '提携通販のアカウントを発行（会員ページで即日）' }) +
        cms().field({ name: 'desc', label: '内容', type: 'textarea', rows: 3, value: p.desc, required: true, maxlength: 200 }) +
        '<div class="a-cms__row2">' +
          cms().field({ name: 'partner', label: '提携先', value: p.partner, required: true, maxlength: 40 }) +
          cms().field({ name: 'area', label: '使える地域', value: p.area, required: true, maxlength: 40 }) +
        '</div>' +
        cms().field({ name: 'example', label: '例', value: p.example, maxlength: 60, opt: true }) +
        '<div class="a-cms__row2">' +
          cms().field({ name: 'until', label: '期限', type: 'date', value: p.until, opt: true, hint: '空なら期限なし' }) +
          cms().field({ name: 'note', label: '注記', value: p.note, maxlength: 60, hint: '割引の特典は「商品・店舗により異なります」を入れる' }) +
        '</div>' +
        cms().radios({ name: 'status', label: '状態', value: p.status === 'open' || p.status === 'ended' ? 'open' : p.status === 'paused' ? 'paused' : 'draft', options: [['draft', '下書き'], ['open', '公開'], ['paused', '止めている']] }),
      onSubmit: function (d) {
        var e = {}, title = String(d.title || '').trim(), desc = String(d.desc || '').trim(), note = String(d.note || '').trim();
        if (!title) e.title = '特典の名前を入れてください';
        else if (/最大\s*[0-9０-９]+\s*[%％]/.test(title)) e.title = '「最大◯%」だけを題に書かないでください（割引の幅は本文に）';
        if (!desc) e.desc = '内容を入れてください';
        if (!String(d.partner || '').trim()) e.partner = '提携先を入れてください（決まっていなければ「提携先（交渉中）」）';
        if (!String(d.area || '').trim()) e.area = '使える地域を入れてください';
        if (/割引|[%％]|OFF|オフ|会員価格/.test(title + desc) && !/異なり|異なる/.test(note)) e.note = '割引の特典は「商品・店舗により異なります」を入れてください';
        var hit = cms().flags(title + '\n' + desc); if (hit.length && !e.desc) e.desc = 'この内容は載せられません（' + hit.join('・') + '）';
        if (d.until && !cms().parseDT(d.until)) e.until = '期限の日を選び直してください';
        if (Object.keys(e).length) return { ok: false, errors: e };
        var patch = { title: title, cat: d.cat, howType: d.howType, how: String(d.how || '').trim() || howName(d.howType), desc: desc, partner: String(d.partner).trim(),
          area: String(d.area).trim(), example: String(d.example || '').trim(), until: d.until || '', note: note };
        var id = p.id;
        save(function (b) {
          if (isNew) { id = cms().uid('pk'); b.added.push(Object.assign({ id: id, added: true, createdAt: nowIso(), createdBy: me() }, patch)); }
          else if (p.added) b.added = b.added.map(function (x) { return x.id === id ? Object.assign({}, x, patch) : x; });
          else b.edits[id] = Object.assign({}, b.edits[id] || {}, patch);
          b.status[id] = d.status;
        });
        var pushed = syncPerk(id);
        AD.db.audit({ action: isNew ? 'perk_add' : 'perk_edit', label: isNew ? '特典を足した' : '特典を直した', target: { type: 'perk', id: id, name: title }, detail: ST[d.status] });
        if (pushed) U.toast(d.status === 'open' ? '特典を公開しました。会員ページの福利厚生にも出ています' : d.status === 'paused' ? '特典を止めて保存しました。会員ページには出ません' : '特典を下書きで保存しました。会員ページにはまだ出ません', 'ok');
        cur.refresh();
        return { ok: true };
      }
    });
  }

  /* ---------- 専門家への相談 ---------- */
  function expert(id) { return DATA.EXPERTS.filter(function (x) { return x.id === id; })[0] || { title: '専門家', person: null }; }
  function expertInfo(ex) { return Object.assign({ open: true }, ex, box().experts[ex.id] || {}); }
  var STEPS = ['受付', '日程調整', '予約確定', '相談済み'];
  var NEXT = { '受付': '日程調整にする', '日程調整': '予約を確定する', '予約確定': '済みにする' };
  /* メッセージの画面の「専門家への引き継ぎ」も、同じ言葉・同じ流れ（本人に送る文つき）で進める */
  AD.expertSteps = { NEXT: NEXT, step: function (id) { var x = requests().filter(function (r) { return r.id === id; })[0]; if (x) stepReq(x); return !!x; } };
  function requests() {
    return AD.data.queues().experts.map(function (x) {
      var ex = expert(x.expert);
      return Object.assign({}, x, { exTitle: ex.title, exName: ex.person && DATA.PEOPLE[ex.person] ? DATA.PEOPLE[ex.person].name : '', name: cms().personName(x.no) });
    });
  }
  function reqView(ctx) {
    return AU.table({
      id: 'experts', rows: requests(), query: ctx.query, sort: '-at', label: '専門家への相談',
      filters: [{ key: 'status', label: '進み', chips: true, options: [['', 'すべて']].concat(STEPS.map(function (s) { return [s, s]; })) },
        { key: 'expert', label: '専門家', options: [['', 'すべて']].concat(DATA.EXPERTS.map(function (x) { return [x.id, x.title]; })) }],
      search: { placeholder: '会員・相談の中身', keys: ['name', 'no', 'text'] },
      columns: [
        AU.col.when('at', '受付', { hide: 'sm' }),
        { key: 'text', label: '相談の中身', sort: false, main: true, html: function (x) { return '<button type="button" class="a-linkbtn a-pk__text" data-pk-req="' + esc(x.id) + '"><span class="a-pk__clamp">' + esc(x.text) + '</span></button>'; } },
        { key: 'name', label: '会員', html: function (x) { return AU.who(x.no) + (x.live ? '<span class="a-pk__live">デモ会員</span>' : ''); } },
        { key: 'exTitle', label: '専門家', html: function (x) { return '<span class="nw">' + esc(x.exTitle) + '</span>' + (x.exName ? '<span class="a-pk__sub">' + esc(x.exName) + '</span>' : ''); } },
        { key: 'when', label: '希望', hide: 'md' },
        { key: 'status', label: '進み', value: function (x) { return STEPS.indexOf(x.status); }, html: function (x) { return AU.status('expert', x.status); }, csv: function (x) { return x.status; } },
        { key: 'act', label: '次にすること', sort: false, csv: false, cls: 'a-tdact', html: function (x) {
          return NEXT[x.status] ? '<button type="button" class="btn btn-ghost btn-s" data-pk-next="' + esc(x.id) + '"' + dis(canM()) + '>' + esc(NEXT[x.status]) + '</button>' : '<span class="muted">―</span>';
        } }
      ],
      rowClass: function (x) { return 'is-link' + (x.status === '相談済み' ? ' is-quiet' : x.status === '受付' ? ' is-warn' : ''); },
      csv: { name: '専門家への相談' }, empty: '専門家への相談はまだありません。'
    });
  }
  function advanceReq(x, to, msg, extra) {
    if (x.live) {
      var r = R.advanceExpert(x.id, to);
      if (!r) { U.toast('進められませんでした', 'error'); return false; }
      if (msg) R.staffReply(msg);
    } else AD.db.update(function (s) {
      var y = (s.experts || []).filter(function (z) { return z.id === x.id; })[0]; if (!y) return;
      y.status = to; y.history = (y.history || []).concat([{ at: nowIso(), status: to }]);
      if (extra && extra.bookedAt) y.bookedAt = extra.bookedAt;
      if (msg) y.lastMessage = msg;
    });
    AD.db.audit({ action: 'expert', label: '専門家への相談を進めた', target: { type: 'member', id: x.no, name: x.name }, detail: x.exTitle + '：' + to });
    return true;
  }
  function stepReq(x) {
    // メッセージの画面（専門家への引き継ぎ）からも呼ぶので、描き直しは骨組みに頼む（この画面の ctx が無いときもあるため）
    function again() { if (AD.app && AD.app.refresh) AD.app.refresh(); }
    var to = STEPS[STEPS.indexOf(x.status) + 1]; if (!to) return;
    var ex = expertInfo(expert(x.expert)), who = ex.person && DATA.PEOPLE[ex.person] ? DATA.PEOPLE[ex.person].name : ex.title;
    if (to === '日程調整') {
      AU.act({
        title: '日程調整にする', ok: '送る', kind: 'ink', reasonLabel: x.name + 'さんに送る文',
        defaultReason: ex.title + 'の' + who + 'さんに日程を聞いています。候補が届いたら、ここでお送りします。',
        text: '専門家に日程を聞き、本人に知らせます。',
        run: function (msg) { return advanceReq(x, to, msg) ? { ok: true } : { ok: false, error: '進められませんでした' }; }
      }).then(function (r) { if (r) { U.toast(x.live ? x.name + 'さんの「相談・メッセージ」に送りました' : '日程調整にしました。本番では本人に届きます', 'ok'); again(); } });
      return;
    }
    if (to === '予約確定') {
      var def = ex.next && new Date(ex.next) > CLG.now() ? ex.next : new Date(CLG.now().getTime() + 3 * DAY).toISOString();
      AU.act({
        title: '予約を確定する', ok: '確定して送る', kind: 'ink', reason: false,
        text: x.name + 'さんと' + ex.title + 'の' + who + 'さんの相談の日時を決めます。',
        fields: '<label class="field"><span>相談の日時</span><input class="input" type="datetime-local" name="at" required value="' + esc(cms().localDT(def)) + '"><small>' + esc(ex.hours || '') + '</small></label>' +
          '<label class="field"><span>本人に送る文に足すこと<span class="opt">任意</span></span><textarea class="textarea" name="note" rows="2" maxlength="200">事前に聞きたいことを3つほどメモしておいてください。</textarea></label>',
        run: function (reason, d) {
          var at = cms().parseDT(d.at);
          if (!at) return { ok: false, errors: { at: '相談の日時を選んでください' } };
          if (at <= CLG.now()) return { ok: false, errors: { at: '相談の日時は、いまより後にしてください' } };
          var msg = ex.title + 'の' + who + 'さんとの相談は、' + U.fmtShort(at, true) + 'から30分です。ZoomのURLは前日に送ります。' + (String(d.note || '').trim() ? '\n' + String(d.note).trim() : '');
          return advanceReq(x, to, msg, { bookedAt: at.toISOString() }) ? { ok: true } : { ok: false, error: '進められませんでした' };
        }
      }).then(function (r) { if (r) { U.toast('予約を確定しました' + (x.live ? '。' + x.name + 'さんに届きます' : ''), 'ok'); again(); } });
      return;
    }
    U.confirmBox('済みにしますか', x.name + 'さんと' + ex.title + 'の相談を「相談済み」にします。', '済みにする', false, { kind: 'ink' }).then(function (ok) {
      if (!ok) return;
      if (advanceReq(x, to)) { U.toast('相談済みにしました', 'ok'); again(); }
    });
  }
  function reqDrawer(x) {
    var ex = expertInfo(expert(x.expert));
    // これまで：受付と、段が進んだ日時（段を4つ並べた図にはしない。起きたことを日付の順に書く）
    var hist = [{ at: x.at, status: '受付' }].concat((x.history || []).filter(function (h) { return h.status !== '受付'; }))
      .sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
    var HIST = { '受付': '相談が届いた', '日程調整': '日程調整にした', '予約確定': '予約を確定した', '相談済み': '相談が済んだ' };
    var dw = AU.drawer(
      '<div class="a-pk__who">' + AU.who(x.no, { size: 's' }) + (x.live ? '<span class="a-pk__live">デモ会員</span>' : '') + '</div>' +
      '<p class="a-pk__req">' + U.jp(x.text, { br: true }) + '</p>' +
      AU.kv([['専門家', ex.title + (x.exName ? '（' + x.exName + '）' : '')], ['事務所', ex.office], ['受付時間', ex.hours], ['希望', x.when], ['受付', U.fmtShort(x.at, true)],
        ['進み', AU.status('expert', x.status), true], x.bookedAt ? ['相談の日時', U.fmtShort(x.bookedAt, true)] : null]) +
      '<h3 class="a-pk__h">これまで</h3><ol class="a-hist">' + hist.map(function (h) {
        return '<li><time class="num" datetime="' + esc(h.at) + '">' + esc(U.fmtShort(h.at, true)) + '</time><span>' + esc(HIST[h.status] || h.status) + '</span></li>';
      }).join('') + '</ol>',
      { title: '専門家への相談', cls: 'a-perks',
        foot: '<button type="button" class="btn btn-soft" data-close>閉じる</button>' + (NEXT[x.status] ? '<button type="button" class="btn btn-ink" data-pk-step' + dis(canM()) + '>' + esc(NEXT[x.status]) + '</button>' : '') });
    dw.addEventListener('click', function (e) { var b = e.target.closest('[data-pk-step]'); if (!b || b.disabled) return; dw.close(); stepReq(x); });
  }

  /* ---------- 専門家 ---------- */
  function prosView(ctx) {
    var reqs = requests();
    var rows = DATA.EXPERTS.map(function (ex) {
      var x = expertInfo(ex);
      return Object.assign(x, { name: x.person && DATA.PEOPLE[x.person] ? DATA.PEOPLE[x.person].name : '', month: reqs.filter(function (r) { return r.expert === ex.id && AD.data.inMonth(r.at, 0); }).length,
        waiting: reqs.filter(function (r) { return r.expert === ex.id && (r.status === '受付' || r.status === '日程調整'); }).length });
    });
    return AU.table({
      id: 'pros', rows: rows, query: ctx.query, sort: '', label: '専門家', search: null, cards: true,
      columns: [
        { key: 'title', label: '専門家', main: true, html: function (x) { return '<b>' + esc(x.title) + '</b><span class="a-pk__sub">' + esc(x.name) + (x.note ? '・' + esc(x.note) : '') + '</span>'; } },
        { key: 'office', label: '事務所', hide: 'md' },
        { key: 'hours', label: '受付時間', hide: 'md' },
        AU.col.when('next', '次に空いている枠', { dir: 'asc' }),
        { key: 'month', label: '今月の相談', align: 'r', html: function (x) { return '<span class="num">' + x.month + '</span>件' + (x.waiting ? '<span class="a-pk__sub">対応中 ' + x.waiting + '件</span>' : ''); } },
        { key: 'open', label: '状態', value: function (x) { return x.open ? '受付中' : '止めている'; }, html: function (x) { return x.open ? '<span class="ad-st">受付中</span>' : U.statusTag('hold', '止めている'); } },
        { key: 'act', label: '操作', sort: false, csv: false, cls: 'a-tdact', html: function (x) {
          return '<span class="a-pk__acts"><button type="button" class="btn btn-ghost btn-s" data-pk-slot="' + esc(x.id) + '"' + dis(canP()) + '>枠を直す</button>' +
            '<button type="button" class="btn btn-text btn-s" data-pk-pro="' + esc(x.id) + '"' + dis(canP()) + '>' + (x.open ? '受付を止める' : '受付を再開する') + '</button></span>';
        } }
      ],
      csv: { name: '専門家' }, empty: '専門家はまだいません。'
    });
  }
  function slotForm(ex) {
    var x = expertInfo(ex);
    cms().formDrawer({
      title: x.title + 'の枠', ok: '保存する', cls: 'a-perks',
      body: cms().field({ name: 'next', label: '次に空いている枠', type: 'datetime-local', value: cms().localDT(x.next), required: true }) +
        cms().field({ name: 'hours', label: '受付時間', value: x.hours, required: true, maxlength: 60 }),
      onSubmit: function (d) {
        var e = {}, at = cms().parseDT(d.next);
        if (!at) e.next = '日時を選んでください'; else if (at <= CLG.now()) e.next = 'いまより後の日時にしてください';
        if (!String(d.hours || '').trim()) e.hours = '受付時間を入れてください';
        if (Object.keys(e).length) return { ok: false, errors: e };
        save(function (b) { b.experts[ex.id] = Object.assign({}, b.experts[ex.id] || {}, { next: at.toISOString(), hours: String(d.hours).trim() }); });
        AD.db.audit({ action: 'expert_slot', label: '専門家の枠を直した', target: { type: 'expert', id: ex.id, name: ex.title }, detail: U.fmtShort(at, true) });
        U.toast('保存しました。本番では会員ページの専門家の「次の枠」に出ます', 'ok'); cur.refresh();
        return { ok: true };
      }
    });
  }
  function togglePro(ex) {
    var x = expertInfo(ex);
    if (!x.open) {
      save(function (b) { b.experts[ex.id] = Object.assign({}, b.experts[ex.id] || {}, { open: true }); });
      AD.db.audit({ action: 'expert_open', label: '専門家の受付を再開した', target: { type: 'expert', id: ex.id, name: ex.title } });
      U.toast('受付を再開しました', 'ok'); cur.refresh();
      return;
    }
    AU.act({
      title: '受付を止める', ok: '止める', danger: true, reasons: ['先生の都合（繁忙期）', '契約の見直し中'],
      text: ex.title + 'への新しい相談を受け付けないようにします。受付済みの相談はそのまま進めます。',
      run: function () { save(function (b) { b.experts[ex.id] = Object.assign({}, b.experts[ex.id] || {}, { open: false }); }); return { ok: true }; },
      audit: { action: 'expert_pause', label: '専門家の受付を止めた', target: { type: 'expert', id: ex.id, name: ex.title } },
      done: '受付を止めました'
    }).then(function (r) { if (r) cur.refresh(); });
  }

  AD.screens.perks = {
    title: '福利厚生・専門家',
    render: function (ctx) {
      var tab = ctx.query.tab || 'list', m = ctx.data.metrics(), list = perks();
      var tabs = AU.tabs([
        { id: 'list', label: '福利厚生', href: '#/perks', n: list.length },
        { id: 'experts', label: '専門家への相談', href: '#/perks?tab=experts', n: m.experts || '', alert: false },
        { id: 'pros', label: '専門家', href: '#/perks?tab=pros', n: DATA.EXPERTS.length }
      ], tab, '福利厚生の表示');
      var body = tab === 'experts' ? reqView(ctx) : tab === 'pros' ? prosView(ctx) : listView(ctx);
      var acts = tab === 'list' ? '<button type="button" class="btn btn-ink btn-s" data-pk-new' + dis(canP()) + '>' + icon('plus', 'ico-s') + '特典を足す</button>' : '';
      var open = list.filter(function (p) { return p.status === 'open'; }).length;
      var note = tab === 'experts' ? AU.roleNote('members', '相談の対応', { strict: true }) : AU.roleNote('content', '特典と専門家の枠の編集', { strict: true });
      return '<div class="a-perks">' + AU.head({ title: '福利厚生・専門家', sub: '公開中の特典 ' + open + '件・専門家 ' + DATA.EXPERTS.length + '人・対応中の相談 ' + (m.experts || 0) + '件', actions: acts }) + note + tabs + body + '</div>';
    },
    mount: function (root, ctx) {
      cur = ctx;
      if (root.__boundPerks) return;
      root.__boundPerks = true;
      root.addEventListener('click', function (e) {
        var t = e.target, b;
        if (!t.closest('.a-perks')) return;
        function req(id) { return requests().filter(function (x) { return x.id === id; })[0]; }
        if ((b = t.closest('[data-pk-new]'))) { if (AU.need('content')) perkForm(null); return; }
        if ((b = t.closest('[data-pk-open]'))) { var p = findPerk(b.getAttribute('data-pk-open')); if (p) perkDrawer(p); return; }
        if ((b = t.closest('[data-pk-next]'))) { var x = req(b.getAttribute('data-pk-next')); if (x && AU.need('members')) stepReq(x); return; }
        if ((b = t.closest('[data-pk-req]'))) { var x2 = req(b.getAttribute('data-pk-req')); if (x2) reqDrawer(x2); return; }
        if ((b = t.closest('[data-pk-slot]'))) { if (AU.need('content')) slotForm(expert(b.getAttribute('data-pk-slot'))); return; }
        if ((b = t.closest('[data-pk-pro]'))) { if (AU.need('content')) togglePro(expert(b.getAttribute('data-pk-pro'))); return; }
        var tr = t.closest('tr[data-tb-row]');
        if (tr && !t.closest('a,button,input,select,textarea,label') && !String(window.getSelection ? window.getSelection() : '')) {
          var ob = tr.querySelector('[data-pk-open],[data-pk-req]'); if (ob) { ob.focus(); ob.click(); }
        }
      });
    }
  };
})();
