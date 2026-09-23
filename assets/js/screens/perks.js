/* ============================================================
   福利厚生・専門家（#/perks、#/perks?tab=experts）
   - 福利厚生：種類で絞り込み、行を押すと使い方ごとの窓を出す
   - 専門家に相談：申し込みは運営へのメッセージとして送る（運営が日程を調整する）
   #/perks?focus=pk4 で来たときは、その福利厚生の行まで送って目印を付ける（会員証の画面から）。
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon;

  var cat = 'all';   // 絞り込みは画面を離れても覚えておく（戻ってきたとき同じ一覧が出るように）

  /* 一覧の右端に出す、使い方の短い名前 */
  var HOW_SHORT = { id: 'ID発行', coupon: 'クーポン', card: '会員証を提示', site: '提携サイト', other: '' };
  /* 相談の入力欄に薄く出す例 */
  var EX_HINT = {
    '税理士': '例：副業の収入が年20万円を超えそうです。確定申告までに何を準備すればいいか知りたいです。',
    '司法書士': '例：来年、合同会社をつくりたいと考えています。登記の流れと費用の目安を知りたいです。',
    '社会保険労務士': '例：はじめてパートさんを1人雇う予定です。必要な手続きを知りたいです。',
    '行政書士': '例：補助金に申し込みたいです。どんな書類が必要か相談したいです。'
  };
  var WAYS = ['メッセージ', 'Zoom', '電話'];

  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  /* 見つからないときは null（別の専門家に「会費は経費に？」の相談が行かないように） */
  function byTitle(list, t) { for (var i = 0; i < list.length; i++) if (list[i].title === t) return list[i]; return null; }

  /** 使い方の文字から、窓の出し分けを決める */
  function kind(how) {
    how = String(how || '');
    if (how.indexOf('ID発行') === 0) return 'id';
    if (how.indexOf('クーポン') === 0) return 'coupon';
    if (how.indexOf('会員証') === 0) return 'card';
    if (how.indexOf('提携サイト') === 0) return 'site';
    return 'other';
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
      return 'TKP-' + s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8);
    }
    var A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // 読み違えやすい 0/O・1/I/L は使わない
    for (i = 0; i < 8; i++) s += A.charAt(Math.floor(rand() * A.length));
    var n = String(p.id).replace(/\D/g, '');
    return 'TK' + ('0' + n).slice(-2) + '-' + s.slice(0, 4) + '-' + s.slice(4);
  }

  /* ---------- 描く ---------- */
  function perkRow(p) {
    var k = kind(p.how);
    return '<button class="li pk" data-use="' + esc(p.id) + '" data-perk="' + esc(p.id) + '">' +
      '<span class="li__body"><span class="li__ttl">' + esc(p.title) + '</span>' +
        '<span class="li__sub">' + esc(p.desc) + '</span></span>' +
      (HOW_SHORT[k] ? '<span class="li__end pk__how">' + esc(HOW_SHORT[k]) + '</span>' : '') +
      (k === 'site' ? '<span class="pk__ext">' + icon('external', 'ico-s') + '</span>' : U.chevron()) +
    '</button>';
  }

  function renderPerks() {
    var list = DATA.PERKS || [], cats = [];
    list.forEach(function (p) { if (cats.indexOf(p.cat) < 0) cats.push(p.cat); });
    if (cat !== 'all' && cats.indexOf(cat) < 0) cat = 'all';
    var shown = cat === 'all' ? list : list.filter(function (p) { return p.cat === cat; });
    function chip(id, label, n) {
      var on = cat === id;
      return '<button class="chip' + (on ? ' is-on' : '') + '" data-cat="' + esc(id) + '" aria-pressed="' + on + '">' +
        esc(label) + '<span class="n num">' + n + '</span></button>';
    }
    return '<div class="chips pk-chips" role="group" aria-label="種類で絞り込む">' + chip('all', 'すべて', list.length) +
        cats.map(function (c) { return chip(c, c, list.filter(function (p) { return p.cat === c; }).length); }).join('') +
      '</div>' +
      (shown.length ? '<div class="list pk-list">' + shown.map(perkRow).join('') + '</div>'
        : '<div class="card">' + U.empty('', 'この種類の福利厚生は準備中です') + '</div>') +
      '<p class="pk-note">割引率は商品・店舗・時期によって異なります。</p>' +
      '<div class="list pk-more">' +
        '<a class="li" href="#/card"><span class="li__body"><span class="li__ttl">会員証を表示</span></span>' + U.chevron() + '</a>' +
        '<button class="li" data-wish><span class="li__body"><span class="li__ttl">ほしい福利厚生を運営に伝える</span></span>' + U.chevron() + '</button>' +
      '</div>';
  }

  function expertRow(ex) {
    return '<button class="li ex-row" data-consult="' + esc(ex.id) + '" aria-label="' + esc(ex.title + 'に相談する') + '">' +
      '<span class="li__body"><span class="li__ttl">' + esc(ex.title) + '</span>' +
        '<span class="li__sub">' + esc(ex.desc) + '</span></span>' +
      U.chevron() +
    '</button>';
  }

  function renderExperts() {
    var list = DATA.EXPERTS || [], tax = byTitle(list, '税理士');
    return '<p class="ex-lead">申し込むと運営が日程を調整して、提携の専門家につなぎます。初回30分は無料、2回目からは各事務所の料金です。</p>' +
      (list.length ? '<div class="list ex-list">' + list.map(expertRow).join('') + '</div>'
        : '<div class="card">' + U.empty('', '提携の専門家は準備中です') + '</div>') +
      '<div class="list ex-more">' +
        '<a class="li" href="#/messages"><span class="li__body"><span class="li__ttl">どこに聞くか分からないときは運営へ</span></span>' + U.chevron() + '</a>' +
      '</div>' +
      '<section class="sec"><h2 class="sec-ttl">会費と経費</h2>' +
        '<div class="card card-pad ex-fee">' +
          '<p>経費にできるかは事業の内容によります。提携の税理士に無料で相談できます。</p>' +
          '<div class="row ex-fee__acts">' +
            (tax ? '<button class="btn btn-ghost btn-s" data-consult="' + esc(tax.id) + '" data-preset="fee">税理士に相談する</button>' : '') +
            '<a class="btn btn-text btn-s" href="#/account">領収書を見る</a>' +
          '</div>' +
        '</div>' +
      '</section>';
  }

  /* ---------- 窓 ---------- */
  function codeBox(label, code) {
    return '<div class="pk-code">' +
      '<div class="pk-code__main"><span class="pk-code__label">' + esc(label) + '</span>' +
        '<span class="pk-code__val">' + esc(code) + '</span></div>' +
      '<button class="btn btn-ghost btn-s" data-copy>' + icon('copy', 'ico-s') + '<span>コピー</span></button>' +
    '</div>';
  }

  function usePerk(p) {
    var k = kind(p.how);
    if (k === 'site') { U.toast('本番では提携サイトが開きます'); return; }
    if (k === 'other') { U.toast('本番では、この福利厚生の使い方をここに出します'); return; }
    var code = '', body = '', foot = '';
    if (k === 'id') {
      code = perkCode(p, 'id');
      // ログインの「会員ID」と取り違えないよう、提携サイト用だと名前で分かるようにする
      body = '<p class="sub">提携サイトの登録画面で、このIDを入力してください。</p>' + codeBox('提携サイト用のID', code);
      foot = '<button class="btn btn-ink" data-open-site>' + icon('external', 'ico-s') + '提携サイトを開く</button>';
    } else if (k === 'coupon') {
      code = perkCode(p, 'coupon');
      body = '<p class="sub">提携先の予約・申込の画面で、このコードを入力してください。</p>' + codeBox('クーポンコード', code);
      foot = '<button class="btn btn-ink" data-open-site>' + icon('external', 'ico-s') + '申込画面を開く</button>';
    } else {
      body = '<p class="sub">受付で会員証の画面を見せてください。</p>';
      foot = '<a class="btn btn-ink" href="#/card?show=1" data-close>' + icon('qr', 'ico-s') + '会員証を表示</a>';
    }
    var m = U.modal('<div class="scr-perks">' +
      '<h3 class="modal__ttl">' + esc(p.title) + '</h3>' + body +
      '<div class="modal__foot"><button class="btn btn-soft" data-close>閉じる</button>' + foot + '</div></div>');

    var copyBtn = m.querySelector('[data-copy]');
    if (copyBtn) copyBtn.addEventListener('click', function () {
      U.copyText(code).then(function () {
        U.toast('コピーしました', 'ok');
        copyBtn.innerHTML = icon('check', 'ico-s') + '<span>コピーしました</span>';
        setTimeout(function () { copyBtn.innerHTML = icon('copy', 'ico-s') + '<span>コピー</span>'; }, 2000);
      });
    });
    var site = m.querySelector('[data-open-site]');
    if (site) site.addEventListener('click', function () {
      U.toast(k === 'id' ? '本番では提携先のURLが開きます' : '本番では提携先の申込画面が開きます');
    });
  }

  /** 送ったあとの窓（閉じる／メッセージを見る） */
  function showSent(m, ctx, title, lead, msg) {
    var box = m.querySelector('.modal');
    box.innerHTML = '<div class="scr-perks">' +
      '<h3 class="modal__ttl">' + esc(title) + '</h3><p class="sub">' + esc(lead) + '</p>' +
      '<p class="pk-sent small">' + U.nl2br(msg) + '</p>' +
      '<div class="modal__foot"><button class="btn btn-soft" data-x-close>閉じる</button>' +
        '<button class="btn btn-ink" data-x-msg>メッセージを見る</button></div>' +
    '</div>';
    box.querySelector('[data-x-close]').addEventListener('click', m.close);
    box.querySelector('[data-x-msg]').addEventListener('click', function () { m.close(); ctx.go('#/messages'); });
    var b = box.querySelector('[data-x-msg]');
    if (b && b.focus) b.focus();
  }

  /** 1行の入力窓（相談・要望で共通）。onSend(text, form) が送る文を返す */
  function formModal(html, ctx, onSend) {
    var m = U.modal('<div class="scr-perks">' + html + '</div>');
    var form = m.querySelector('form'), ta = form.querySelector('textarea'), err = form.querySelector('.pk-err');
    if (ta.value) setTimeout(function () { try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e) {} }, 60);
    ta.addEventListener('input', function () { err.textContent = ''; });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = ta.value.trim();
      if (!text) { err.textContent = ta.getAttribute('data-empty') || '内容を書いてください'; ta.focus(); return; }
      var sent = onSend(text, form);
      // 自動返信（試作版）が届いたら、スタートガイドなどの達成を共通の見せ方で知らせる
      R.sendMessage(sent.msg, sent.kind).then(function (r) { CLG.app.reward(r); });
      showSent(m, ctx, sent.title, sent.lead, sent.msg);
      ctx.refresh();
    });
    return m;
  }

  function openConsult(ex, preset, ctx) {
    var ways = WAYS.map(function (w) { return '<option value="' + esc(w) + '">' + esc(w) + '</option>'; }).join('');
    formModal(
      '<h3 class="modal__ttl">' + esc(ex.title) + 'に相談する</h3>' +
      '<form class="pk-form" novalidate>' +
        '<label class="field"><span>相談したいこと</span>' +
          '<textarea class="textarea" name="text" rows="5" data-empty="相談したいことを書いてください" placeholder="' + esc(EX_HINT[ex.title] || '例：相談したいことを書いてください。') + '">' + esc(preset || '') + '</textarea></label>' +
        '<label class="field"><span>希望の連絡方法</span><select class="select" name="way">' + ways + '</select></label>' +
        '<p class="pk-err xsmall" role="alert"></p>' +
        '<p class="pk-mnote">' + esc(ex.note || '初回30分無料') + '。2回目からは各事務所の料金です。</p>' +
        '<div class="modal__foot"><button type="button" class="btn btn-soft" data-close>やめる</button>' +
          '<button type="submit" class="btn btn-primary">申し込む</button></div>' +
      '</form>',
      ctx,
      function (text, form) {
        var way = form.way.value;
        return {
          msg: '【専門家への相談：' + ex.title + '】\n' + text + '\n希望の連絡方法：' + way,
          kind: '壁打ち・相談',
          title: '申し込みました',
          lead: '運営が' + ex.title + 'と日程を調整して、候補の日時を「相談・メッセージ」に送ります。'
        };
      });
  }

  function openWish(ctx) {
    formModal(
      '<h3 class="modal__ttl">ほしい福利厚生を伝える</h3>' +
      '<form class="pk-form" novalidate>' +
        '<label class="field"><span>内容</span>' +
          '<textarea class="textarea" name="text" rows="4" data-empty="ほしい福利厚生を書いてください" placeholder="例：子どもの習い事（スイミングなど）の割引があるとうれしいです。"></textarea></label>' +
        '<p class="pk-err xsmall" role="alert"></p>' +
        '<div class="modal__foot"><button type="button" class="btn btn-soft" data-close>やめる</button>' +
          '<button type="submit" class="btn btn-primary">送る</button></div>' +
      '</form>',
      ctx,
      function (text) {
        return {
          msg: '【ほしい福利厚生】\n' + text,
          kind: 'その他',
          title: '送りました',
          lead: 'ありがとうございます。返信は「相談・メッセージ」に届きます。'
        };
      });
  }

  function presetText(key) {
    if (key === 'fee') return '月額の会費（' + U.yen(DATA.SITE.price) + '）を経費にできるか知りたいです。\n事業の内容：';
    return '';
  }

  CLG.screens.perks = {
    title: '福利厚生・専門家',
    render: function (ctx) {
      var q = ctx.query || {};
      var tab = q.tab === 'experts' ? 'experts' : 'perks';
      // 会員証の画面から特定の福利厚生を指して来たときは、絞り込みを外して必ず見えるようにする
      if (tab === 'perks' && q.focus && byId(DATA.PERKS || [], q.focus)) cat = 'all';
      function segBtn(id, label) {
        var on = tab === id;
        return '<button role="tab" aria-selected="' + on + '" class="' + (on ? 'is-on' : '') + '" data-tab="' + id + '">' + esc(label) + '</button>';
      }
      return '<div class="scr-perks">' +
        '<div class="page-head"><h1 class="page-ttl">福利厚生・専門家</h1></div>' +
        '<div class="seg pk-seg" role="tablist" aria-label="表示の切り替え">' + segBtn('perks', '福利厚生') + segBtn('experts', '専門家に相談') + '</div>' +
        (tab === 'experts' ? renderExperts() : renderPerks()) +
      '</div>';
    },
    mount: function (root, ctx) {
      var el = root.querySelector('.scr-perks');
      if (!el) return;
      // 描き直すたびに新しい要素になるので、ここに付ければ二重にならない
      el.addEventListener('click', function (e) {
        var t = e.target.closest('[data-tab],[data-cat],[data-use],[data-consult],[data-wish]');
        if (!t || !el.contains(t)) return;
        if (t.hasAttribute('data-tab')) {
          var want = t.getAttribute('data-tab') === 'experts' ? '#/perks?tab=experts' : '#/perks';
          if ((ctx.query.tab === 'experts') !== (want !== '#/perks')) ctx.go(want);
          return;
        }
        if (t.hasAttribute('data-cat')) { cat = t.getAttribute('data-cat'); ctx.refresh(); return; }
        if (t.hasAttribute('data-use')) { var p = byId(DATA.PERKS || [], t.getAttribute('data-use')); if (p) usePerk(p); return; }
        if (t.hasAttribute('data-consult')) {
          var ex = byId(DATA.EXPERTS || [], t.getAttribute('data-consult'));
          if (ex) openConsult(ex, presetText(t.getAttribute('data-preset')), ctx);
          return;
        }
        if (t.hasAttribute('data-wish')) openWish(ctx);
      });

      var focus = ctx.query && ctx.query.focus;
      // 専門家のタブを開いているときは目印を付けない（URLを #/perks に戻すと、表示とタブがずれるため）
      if (focus && ctx.query.tab !== 'experts' && byId(DATA.PERKS || [], focus)) {
        var row = el.querySelector('[data-perk="' + focus + '"]');
        // 描き直しのたびに同じ場所へ飛ばないよう、URLから目印を外しておく（hashchange は起きない）
        try { history.replaceState(null, '', '#/perks'); } catch (e) {}
        if (row) {
          row.classList.add('is-focus');
          setTimeout(function () {
            try { row.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { row.scrollIntoView(); }
          }, 60);
        }
      }
    }
  };
})();
