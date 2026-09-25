/* ============================================================
   福利厚生・専門家（#/perks、#/perks?tab=experts）
   - 福利厚生：種類で絞り込み、行を押すと使い方ごとの窓を出す。行には使い方・地域・期限を必ず出す
   - 専門家に相談：提携の専門家の札と、申し込んだ相談（受付 → 日程調整 → 予約確定 → 相談済み）
     申し込みは R.requestExpert で受け付け、運営へのメッセージにも残す（運営が日程を調整する）
   #/perks?focus=pk4 で来たときは、その福利厚生の行まで送って目印を付ける（会員証の画面から）。
   #/perks?tab=experts&focus=ex1 は、その専門家の札まで送る。
   - 一覧は DATA.PERKS（運営画面で直した・足したものも store.js が重ねてある）。期限が過ぎたものは出さない。
     使い方は howType（code・account・card・site）があればそれ、なければ how の文の中の言葉で決める（kind。会員証の画面も howKind で同じものを使う）。
   - 行の補足（使い方・地域・期限・提携先）は「・」の区切りでだけ折る（「東京／23区」のように言葉の途中で割らない）。
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon;
  var cur = null;

  var cat = 'all';   // 絞り込みは画面を離れても覚えておく（戻ってきたとき同じ一覧が出るように）

  /* 使い方の短い名前（動詞で。一覧の補足と窓の表に出す）。
     ID は「会員番号」と取り違えないよう「専用ID」と呼ぶ（決定事項：番号の呼び方は会員番号だけにする） */
  var HOW_SHORT = { id: '専用IDで登録', coupon: 'クーポンコードを使う', card: '会員証を出す', site: '', other: '' };
  /* 相談の入力欄に薄く出す例 */
  var EX_HINT = {
    '税理士': '例：副業の収入が年20万円を超えそうです。確定申告までに何を準備すればいいか知りたいです。',
    '司法書士': '例：来年、合同会社をつくりたいと考えています。登記の流れと費用の目安を知りたいです。',
    '社会保険労務士': '例：はじめてパートさんを1人雇う予定です。必要な手続きを知りたいです。',
    '行政書士': '例：補助金に申し込みたいです。どんな書類が必要か相談したいです。'
  };

  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  /* 見つからないときは null（別の専門家に「会費は経費に？」の相談が行かないように） */
  function byTitle(list, t) { for (var i = 0; i < list.length; i++) if (list[i].title === t) return list[i]; return null; }

  /* 運営画面で足した・直した福利厚生（R.cmsUpsert('perk')）は、使い方を howType で持つことがある */
  var HOW_TYPE = { code: 'coupon', account: 'id', card: 'card', site: 'site' };
  /** 使い方（howType か文字）から、窓の出し分けを決める。会員証の画面の「会員証で使える割引」も同じ決め方（howKind）。
      運営画面で書いた文（「受付で会員証を見せる」など）も拾えるよう、文の頭だけでなく中の言葉で決める（運営画面の howType と同じ順） */
  function kind(p) {
    if (p && HOW_TYPE[p.howType]) return HOW_TYPE[p.howType];
    var how = String((p && p.how) || '');
    if (/クーポン|コード/.test(how)) return 'coupon';
    if (/会員証/.test(how)) return 'card';
    if (/ID発行|アカウント/.test(how)) return 'id';
    if (/サイト|予約|申し込|申込/.test(how)) return 'site';
    return 'other';
  }
  function howText(p) { return HOW_SHORT[kind(p)] || p.how || ''; }
  /** 提携先のロゴの代わりの1文字。提携先が決まるまで（交渉中・調整中）は福利厚生の題の頭の字 */
  function mono(p) {
    var src = realPartner(p) || String(p.title || '');
    return src.replace(/^[\s（(【「]+/, '').charAt(0) || '・';
  }
  /** 期限の日（'2026-12-31' はその日の終わり）。無い・読めないときは null */
  function untilDate(p) {
    if (!p.until) return null;
    var s = String(p.until), d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T23:59:59') : new Date(s);
    return isNaN(d) ? null : d;
  }
  function isOpen(p) { var d = untilDate(p); return !d || d >= CLG.now(); }
  function untilText(p, long) {
    var d = untilDate(p);
    if (!d) return '';
    return (long ? U.fmtDate(d) : U.fmtShort(d).replace(/\(.\)$/, '')) + 'まで';
  }
  /** 期限が過ぎたものは出さない（会員証の画面と同じ） */
  function perks() { return (DATA.PERKS || []).filter(isOpen); }
  /** 提携先の名前が決まっているか（交渉中・調整中の仮の名前は、行ごとには出さない） */
  function realPartner(p) { var n = String(p.partner || ''); return n && !/交渉中|調整中/.test(n) ? n : ''; }
  /** すべての福利厚生で同じ注記なら、一覧の下に1回だけ出す */
  function commonNote(list) {
    var n = list.length ? list[0].note : '';
    return n && list.every(function (p) { return p.note === n; }) ? n : '';
  }

  /* ---------- 会員ごとに決まるID・コード ----------
     本番は提携先のAPIで発行する。試作版は会員番号から毎回同じ値を作る（開き直しても変わらないように） */
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), a | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function perkCode(p, type) {
    var rand = rng(hash(String(R.me().id) + '|' + p.id + '|' + type)), i, s = '';
    if (type === 'id') {
      for (i = 0; i < 12; i++) s += Math.floor(rand() * 10);
      return 'TSP-' + s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8);
    }
    var A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // 読み違えやすい 0/O・1/I/L は使わない
    for (i = 0; i < 8; i++) s += A.charAt(Math.floor(rand() * A.length));
    var n = String(p.id).replace(/\D/g, '');
    return 'TS' + ('0' + n).slice(-2) + '-' + s.slice(0, 4) + '-' + s.slice(4);
  }

  /* ---------- 描く：福利厚生 ---------- */
  /** 行の補足（使い方・地域・期限・提携先）。「・」の区切りでだけ折る（「東京／23区」「全国（一部地域を／除く）」のように
      言葉の途中で割らない）。「・」は前の言葉に付けて、行の頭に来ないようにする。長い言葉だけはふつうに折る */
  function metaHtml(parts) {
    var toks = [];
    parts.forEach(function (s) { String(s || '').split('・').forEach(function (t) { t = t.trim(); if (t) toks.push(t); }); });
    return toks.map(function (t, i) {
      var dot = i < toks.length - 1 ? '・' : '';
      return t.length <= 14 ? '<span class="nw">' + esc(t) + dot + '</span>' : U.jp(t) + dot;
    }).join('');
  }
  function perkRow(p) {
    var meta = metaHtml([howText(p), p.area, untilText(p), realPartner(p)]);
    return '<button type="button" class="li pk" id="perk-' + esc(p.id) + '" data-pk-use="' + esc(p.id) + '" aria-haspopup="dialog">' +
      '<span class="pk__mono" aria-hidden="true">' + esc(mono(p)) + '</span>' +
      '<span class="li__body"><span class="li__ttl">' + U.jp(p.title) + '</span>' +
        (p.example ? '<span class="li__sub pk__ex">' + U.jp(p.example) + '</span>' : '') +
        '<span class="li__sub pk__meta">' + meta + '</span></span>' +
      // 行を押すと窓が開く（提携サイトへはその中のボタンから）ので、どの行も山かっこ
      U.chevron() +
    '</button>';
  }

  function renderPerks() {
    var list = perks(), cats = [];
    list.forEach(function (p) { if (p.cat && cats.indexOf(p.cat) < 0) cats.push(p.cat); });
    if (cat !== 'all' && cats.indexOf(cat) < 0) cat = 'all';
    var shown = cat === 'all' ? list : list.filter(function (p) { return p.cat === cat; });
    var note = commonNote(list);
    // 提携先がまだ決まっていないとき（全部が同じ仮の名前）は、行ごとではなく一覧の下に1回だけ書く
    var pending = list.length && list.every(function (p) { return !realPartner(p) && p.partner === list[0].partner; }) ? String(list[0].partner || '') : '';
    function chip(id, label, n) {
      var on = cat === id;
      return '<button type="button" class="chip' + (on ? ' is-on' : '') + '" data-pk-cat="' + esc(id) + '" aria-pressed="' + on + '">' +
        esc(label) + '<span class="n num">' + n + '</span></button>';
    }
    return '<div class="chips pk-chips" role="group" aria-label="種類で絞り込む">' + chip('all', 'すべて', list.length) +
        cats.map(function (c) { return chip(c, c, list.filter(function (p) { return p.cat === c; }).length); }).join('') +
      '</div>' +
      (shown.length ? '<div class="list pk-list">' + shown.map(perkRow).join('') + '</div>'
        : '<div class="card">' + U.empty('', 'この種類の福利厚生はまだありません') + '</div>') +
      (note || pending ? '<p class="pk-note">' + (pending ? (/^提携先/.test(pending) ? '' : '提携先：') + esc(pending) + '。' : '') + (note ? '割引の内容は、' + esc(note) + '。' : '') + '</p>' : '') +
      '<div class="list pk-more">' +
        '<a class="li" href="#/card?show=1"><span class="li__body"><span class="li__ttl">会員証を出す</span></span>' + U.chevron() + '</a>' +
        '<button type="button" class="li" data-pk-wish aria-haspopup="dialog"><span class="li__body"><span class="li__ttl">ほしい福利厚生を運営に伝える</span></span>' + U.chevron() + '</button>' +
      '</div>';
  }

  /* ---------- 描く：専門家 ---------- */
  function expertCard(ex) {
    var p = ex.person ? R.person(ex.person) : null;
    var next = ex.next ? U.fmtShort(ex.next, true) : '';
    return '<article class="card ex-card" id="expert-' + esc(ex.id) + '">' +
      '<div class="ex-card__who">' +
        (p ? U.personLink(p, { id: ex.person, size: '' }) : '<p class="ex-card__name">' + esc(ex.title) + '</p>') +
        '<p class="ex-card__role">' + esc(ex.title) + '</p>' +
      '</div>' +
      (ex.office ? '<p class="ex-card__office">' + U.jp(ex.office) + '</p>' : '') +
      '<p class="ex-card__desc">' + U.jp(ex.desc) + '</p>' +
      '<p class="ex-card__meta">' + U.jp(ex.note || '初回30分無料') +
        // 次の枠は別の行に（「次に空いている／枠」と途中で割れないように）
        (next ? '<span class="ex-card__next"><span class="nw">次に空いている枠</span> <span class="nw">' + esc(next) + '</span></span>' : '') + '</p>' +
      '<button type="button" class="btn btn-ghost btn-s ex-card__btn" data-pk-consult="' + esc(ex.id) + '" aria-haspopup="dialog">相談を申し込む</button>' +
    '</article>';
  }

  function requestRow(r) {
    var who = r.who ? r.who.name : '';
    return '<button type="button" class="li ex-req" data-pk-req="' + esc(r.id) + '" aria-haspopup="dialog">' +
      '<span class="li__body">' +
        '<span class="li__ttl">' + esc(r.ex.title) + (who ? '・' + esc(who) : '') + '</span>' +
        '<span class="li__sub ex-req__txt">' + esc(r.text) + '</span>' +
        '<span class="li__sub">' + esc(U.fmtShort(r.at)) + 'に申込み</span>' +
      '</span>' +
      '<span class="li__end">' + U.statusTag(r.tag, r.status) + U.chevron() + '</span>' +
    '</button>';
  }

  function renderExperts() {
    var list = DATA.EXPERTS || [], tax = byTitle(list, '税理士');
    var reqs = R.expertRequests ? R.expertRequests() : [];
    // 申し込んだ相談：まだ済んでいないものがあれば、専門家の札より上に出す（申し込んだ直後にすぐ見えるように）
    var active = reqs.some(function (r) { return r.status !== '相談済み'; });
    var reqHtml = reqs.length ? '<section class="sec ex-reqsec' + (active ? ' is-top' : '') + '" aria-labelledby="exReqTtl"><h2 class="sec-ttl" id="exReqTtl">申し込んだ相談</h2>' +
      '<div class="list ex-reqs">' + reqs.map(requestRow).join('') + '</div></section>' : '';
    return '<p class="ex-lead">運営が日程を調整して、提携の専門家につなぎます。2回目からは各事務所の料金です。</p>' +
      (active ? reqHtml : '') +
      (list.length ? '<div class="ex-grid">' + list.map(expertCard).join('') + '</div>'
        : '<div class="card">' + U.empty('', '提携の専門家はまだいません', { href: '#/messages?kind=' + encodeURIComponent('相談したい'), label: '運営に相談する' }) + '</div>') +
      (active ? '' : reqHtml) +
      '<div class="list ex-more">' +
        '<a class="li" href="#/messages?kind=' + encodeURIComponent('相談したい') + '"><span class="li__body"><span class="li__ttl">どこに聞くか分からないときは運営へ</span></span>' + U.chevron() + '</a>' +
      '</div>' +
      '<section class="sec" aria-labelledby="exFeeTtl"><h2 class="sec-ttl" id="exFeeTtl">会費と経費</h2>' +
        '<div class="card card-pad ex-fee">' +
          '<p>経費にできるかは事業の内容によります。提携の税理士に無料で相談できます。</p>' +
          '<div class="row ex-fee__acts">' +
            (tax ? '<button type="button" class="btn btn-ghost btn-s" data-pk-consult="' + esc(tax.id) + '" data-pk-preset="fee" aria-haspopup="dialog">税理士に相談する</button>' : '') +
            '<a class="btn btn-text btn-s" href="#/account?focus=invoices">領収書を見る</a>' +
          '</div>' +
        '</div>' +
      '</section>';
  }

  /* ---------- 窓：福利厚生を使う ---------- */
  function codeBox(label, code, copyLabel) {
    return '<div class="pk-code">' +
      '<div class="pk-code__main"><span class="pk-code__label">' + esc(label) + '</span>' +
        '<span class="pk-code__val">' + esc(code) + '</span></div>' +
      '<button type="button" class="btn btn-ghost btn-s" data-pk-copy>' + icon('copy', 'ico-s') + '<span>' + esc(copyLabel) + '</span></button>' +
    '</div>';
  }

  function usePerk(p) {
    var k = kind(p), code = '', lead = '', box = '', act = '';
    // 提携先が仮の名前（「提携先（交渉中）」）のときは、表の値を「交渉中」にする（見出しと同じ言葉を繰り返さない）
    var partner = realPartner(p) || String(p.partner || '').replace(/^提携先/, '').replace(/^[（(](.*)[）)]$/, '$1');
    var rows = [['使い方', howText(p)], ['地域', p.area], ['期限', untilText(p, true)], ['提携先', partner]]
      .filter(function (r) { return r[1]; });
    if (k === 'id') {
      code = perkCode(p, 'id');
      lead = '提携サイトの登録画面で、このIDを入れてください。';
      box = codeBox('提携サイト用のID', code, 'IDをコピー');
      act = '<button type="button" class="btn btn-ink" data-pk-site="id">' + icon('external', 'ico-s') + '提携サイトを開く</button>';
    } else if (k === 'coupon') {
      code = perkCode(p, 'coupon');
      lead = '提携先の予約・申込みの画面で、このコードを入れてください。';
      box = codeBox('クーポンコード', code, 'コードをコピー');
      act = '<button type="button" class="btn btn-ink" data-pk-site="coupon">' + icon('external', 'ico-s') + '申込みの画面を開く</button>';
    } else if (k === 'card') {
      lead = '受付で会員証の画面を見せてください。';
      act = '<a class="btn btn-ink" href="#/card?show=1">' + icon('qr', 'ico-s') + '会員証を出す</a>';
    } else if (k === 'site') {
      act = '<button type="button" class="btn btn-ink" data-pk-site="site">' + icon('external', 'ico-s') + '提携サイトを開く</button>';
    }
    var m = U.modal(
      (p.example ? '<p class="pk-m__ex">' + U.jp(p.example) + '</p>' : '') +
      (p.desc ? '<p class="pk-m__desc">' + U.jp(p.desc) + '</p>' : '') +
      '<table class="kv pk-m__kv"><tbody>' + rows.map(function (r) {
        return '<tr><th scope="row">' + esc(r[0]) + '</th><td>' + U.jp(r[1]) + '</td></tr>';
      }).join('') + '</tbody></table>' +
      (lead ? '<p class="pk-m__how">' + esc(lead) + '</p>' : '') + box +
      (p.note ? '<p class="pk-m__note">' + esc(p.note) + '。</p>' : ''),
      { title: p.title, cls: 'scr-perks',
        foot: '<button type="button" class="btn btn-soft" data-close>閉じる</button>' + act });

    var copyBtn = m.querySelector('[data-pk-copy]');
    if (copyBtn) copyBtn.addEventListener('click', function () {
      var label = copyBtn.querySelector('span').textContent;
      U.copyText(code).then(function () {
        U.toast((k === 'id' ? 'IDを' : 'コードを') + 'コピーしました', 'ok');
        copyBtn.innerHTML = icon('check', 'ico-s') + '<span>コピーしました</span>';
        setTimeout(function () { copyBtn.innerHTML = icon('copy', 'ico-s') + '<span>' + esc(label) + '</span>'; }, 2000);
      });
    });
    var site = m.querySelector('[data-pk-site]');
    if (site) site.addEventListener('click', function () {
      U.toast(k === 'coupon' ? '本番では提携先の申込みの画面が開きます' : '本番では提携サイトが開きます');
    });
  }

  /* ---------- 窓：相談・要望 ---------- */
  /** 送ったあとの窓（閉じる／メッセージを見る） */
  function showSent(title, lead, text) {
    U.modal(
      '<p class="pk-m__how">' + esc(lead) + '</p>' +
      '<p class="pk-sent">' + U.nl2br(text) + '</p>',
      { title: title, cls: 'scr-perks',
        foot: '<button type="button" class="btn btn-soft" data-close>閉じる</button>' +
          '<a class="btn btn-ink" href="#/messages">メッセージを見る</a>' });
  }

  function openConsult(ex, preset) {
    var hours = ex.hours ? '<p class="pk-mnote">相談の時間：' + U.jp(ex.hours) + '</p>' : '';
    var m = U.modal(
      '<form class="pk-form" id="pkConsultForm" novalidate>' +
        '<label class="field"><span>相談したいこと</span>' +
          '<textarea class="textarea" name="text" rows="5" required maxlength="1000" placeholder="' + esc(EX_HINT[ex.title] || '例：相談したいことを書いてください。') + '">' + esc(preset || '') + '</textarea></label>' +
        '<label class="field"><span>希望の日時<span class="opt">任意</span></span>' +
          '<input class="input" name="when" maxlength="100" placeholder="例：平日の夜、土曜の午前"></label>' +
        '<p class="pk-mnote">' + esc(ex.note || '初回30分無料') + '。2回目からは各事務所の料金です。</p>' + hours +
      '</form>',
      { title: ex.title + 'に相談する', cls: 'scr-perks', dirty: true,
        foot: '<button type="button" class="btn btn-soft" data-close>やめる</button>' +
          '<button type="submit" class="btn btn-primary" form="pkConsultForm">申し込む</button>' });
    var form = m.querySelector('form'), ta = form.elements.text;
    U.fieldErrors(form, {}, { focus: false });   // 「必須」の札を付ける
    if (ta.value) setTimeout(function () { try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e) {} }, 60);
    ta.addEventListener('input', function () { U.fieldErrors(form, { text: '' }, { focus: false }); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = ta.value.trim(), when = form.elements.when.value.trim();
      var r = R.requestExpert(ex.id, { text: text, when: when });
      if (!r || !r.ok) {
        if (r && r.errors) U.fieldErrors(form, r.errors);
        else U.toast((r && r.error) || '申し込めませんでした', 'error');
        return;
      }
      var msg = '【専門家への相談：' + ex.title + '】\n' + text + (when ? '\n希望の日時：' + when : '');
      // 自動返信（試作版）が届いたら、スタートガイドなどの達成を共通の見せ方で知らせる
      R.sendMessage(msg, '相談したい').then(function (res) { CLG.app.reward(res); });
      m.close();
      cur.refresh();
      showSent('申し込みました', '運営が' + ex.title + 'と日程を調整して、候補の日時を「相談・メッセージ」に送ります。', msg);
    });
  }

  function openRequest(id) {
    var r = (R.expertRequests ? R.expertRequests() : []).filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    var at = {};
    (r.history || []).forEach(function (h) { at[h.status] = h.at; });
    var steps = (R.EXPERT_STEPS || []).map(function (s, i) {
      var done = i <= r.stepIndex;
      return '<tr' + (i === r.stepIndex ? ' class="is-now"' : '') + '><th scope="row">' + esc(s) + '</th>' +
        '<td>' + (done && at[s] ? esc(U.fmtDate(at[s], { noYear: true })) : done ? '済み' : '<span class="pk-m__todo">まだ</span>') + '</td></tr>';
    }).join('');
    U.modal(
      '<p class="pk-m__who">' + esc(r.ex.title) + (r.who ? '・' + esc(r.who.name) : '') + '</p>' +
      '<table class="kv pk-m__kv"><tbody>' + steps + '</tbody></table>' +
      '<p class="pk-m__lead">相談したいこと</p><p class="pk-sent">' + U.nl2br(r.text) + '</p>' +
      (r.when ? '<p class="pk-mnote">希望の日時：' + esc(r.when) + '</p>' : ''),
      { title: r.ex.title + 'への相談', cls: 'scr-perks',
        foot: '<button type="button" class="btn btn-soft" data-close>閉じる</button>' +
          '<a class="btn btn-ink" href="#/messages">メッセージを見る</a>' });
  }

  function openWish() {
    var m = U.modal(
      '<form class="pk-form" id="pkWishForm" novalidate>' +
        '<label class="field"><span>内容</span>' +
          '<textarea class="textarea" name="text" rows="4" required maxlength="1000" placeholder="例：子どもの習い事（スイミングなど）の割引があるとうれしいです。"></textarea></label>' +
      '</form>',
      { title: 'ほしい福利厚生を伝える', cls: 'scr-perks', dirty: true,
        foot: '<button type="button" class="btn btn-soft" data-close>やめる</button>' +
          '<button type="submit" class="btn btn-primary" form="pkWishForm">送る</button>' });
    var form = m.querySelector('form'), ta = form.elements.text;
    U.fieldErrors(form, {}, { focus: false });
    ta.addEventListener('input', function () { U.fieldErrors(form, { text: '' }, { focus: false }); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = ta.value.trim();
      if (!text) { U.fieldErrors(form, { text: 'ほしい福利厚生を書いてください' }); return; }
      var msg = '【ほしい福利厚生】\n' + text;
      R.sendMessage(msg, 'その他').then(function (res) { CLG.app.reward(res); });
      m.close();
      showSent('送りました', 'ありがとうございます。返信は「相談・メッセージ」に届きます。', msg);
    });
  }

  function presetText(key) {
    if (key === 'fee') return '月額の会費（' + U.yen(DATA.SITE.price) + '）を経費にできるか知りたいです。\n事業の内容：';
    return '';
  }

  /* ---------- ?focus= の場所へ送る ---------- */
  function focusTo(el, back) {
    // 描き直しのたびに同じ場所へ飛ばないよう、URLから目印を外しておく（hashchange は起きない）
    try { history.replaceState(null, '', back); } catch (e) {}
    if (!el) return;
    el.classList.add('is-focus');
    setTimeout(function () { U.smoothScroll(el, { block: 'center', focus: true }); }, 60);
  }

  CLG.screens.perks = {
    title: '福利厚生・専門家',
    render: function (ctx) {
      var q = ctx.query || {};
      var tab = q.tab === 'experts' ? 'experts' : 'perks';
      // 会員証の画面から特定の福利厚生を指して来たときは、絞り込みを外して必ず見えるようにする
      if (tab === 'perks' && q.focus && byId(perks(), q.focus)) cat = 'all';
      function tabLink(id, label, href) {
        var on = tab === id;
        return '<a href="' + href + '" class="' + (on ? 'is-on' : '') + '"' + (on ? ' aria-current="page"' : '') + '>' + esc(label) + '</a>';
      }
      return '<div class="scr-perks">' +
        '<div class="page-head"><h1 class="page-ttl" data-page-title tabindex="-1">福利厚生・専門家</h1></div>' +
        '<nav class="seg pk-seg" aria-label="福利厚生と専門家">' +
          tabLink('perks', '福利厚生', '#/perks') + tabLink('experts', '専門家に相談', '#/perks?tab=experts') +
        '</nav>' +
        (tab === 'experts' ? renderExperts() : renderPerks()) +
      '</div>';
    },
    /* 会員証の画面の「会員証で使える割引」も同じ決め方にする（使い方・期限） */
    howKind: kind,
    isOpen: isOpen,
    mount: function (root, ctx) {
      cur = ctx;
      var q = ctx.query || {}, el = root.querySelector('.scr-perks');
      if (el && q.focus) {
        if (q.tab === 'experts' && byId(DATA.EXPERTS || [], q.focus)) focusTo(el.querySelector('#expert-' + q.focus), '#/perks?tab=experts');
        else if (q.tab !== 'experts' && byId(perks(), q.focus)) focusTo(el.querySelector('#perk-' + q.focus), '#/perks');
      }
      // root は画面が変わっても同じ要素なので、付けるのは1回だけ
      if (root.__boundPerks) return;
      root.__boundPerks = true;
      root.addEventListener('click', function (e) {
        var t = e.target.closest('.scr-perks [data-pk-cat], .scr-perks [data-pk-use], .scr-perks [data-pk-consult], .scr-perks [data-pk-wish], .scr-perks [data-pk-req]');
        if (!t) return;
        if (t.hasAttribute('data-pk-cat')) { cat = t.getAttribute('data-pk-cat'); cur.refresh(); return; }
        if (t.hasAttribute('data-pk-use')) { var p = byId(perks(), t.getAttribute('data-pk-use')); if (p) usePerk(p); return; }
        if (t.hasAttribute('data-pk-consult')) {
          var ex = byId(DATA.EXPERTS || [], t.getAttribute('data-pk-consult'));
          if (ex) openConsult(ex, presetText(t.getAttribute('data-pk-preset')));
          return;
        }
        if (t.hasAttribute('data-pk-req')) { openRequest(t.getAttribute('data-pk-req')); return; }
        if (t.hasAttribute('data-pk-wish')) openWish();
      });
    }
  };
})();
