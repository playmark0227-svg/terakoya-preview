/* ============================================================
   福利厚生・専門家（#/perks、#/perks?tab=experts）
   - 福利厚生：種類で絞り込み、「使う」で使い方ごとの窓を出す
   - 専門家に相談：申し込みは運営へのメッセージとして送る（運営が日程を調整する）
   #/perks?focus=pk4 で来たときは、その福利厚生の位置まで送って目印を付ける（会員証の画面から）。
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon;

  var cat = 'all';   // 絞り込みは画面を離れても覚えておく（戻ってきたとき同じ一覧が出るように）

  var CAT_ICON = { '暮らし': 'home', '子育て': 'heart', '遊び': 'sparkle', '仕事': 'briefcase', '学び': 'book' };
  var HOW_ICON = { id: 'user', coupon: 'ticket', card: 'card', site: 'external', other: 'info' };
  var EX_ICON = { '税理士': 'yen', '司法書士': 'pen', '社会保険労務士': 'users', '行政書士': 'receipt' };
  /* 何を書けばいいか迷わないように、専門家ごとの書き出しの例 */
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
  function perkCard(p) {
    var k = kind(p.how);
    return '<article class="card pk" data-perk="' + esc(p.id) + '">' +
      '<div class="pk__head"><span class="pk__ico">' + icon(CAT_ICON[p.cat] || 'gift') + '</span>' +
        '<span class="tag">' + esc(p.cat) + '</span></div>' +
      '<h3 class="pk__ttl">' + esc(p.title) + '</h3>' +
      '<p class="pk__desc">' + esc(p.desc) + '</p>' +
      '<div class="pk__foot">' +
        '<span class="tag tag-line pk__how">' + icon(HOW_ICON[k], 'ico-s') + esc(p.how) + '</span>' +
        '<button class="btn btn-soft btn-s" data-use="' + esc(p.id) + '" aria-label="' + esc(p.title + 'を使う') + '">使う' +
          (k === 'site' ? icon('external', 'ico-s') : '') + '</button>' +
      '</div>' +
    '</article>';
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
    return '<div class="pk-bar">' +
        '<div class="chips" role="group" aria-label="種類で絞り込む">' + chip('all', 'すべて', list.length) +
          cats.map(function (c) { return chip(c, c, list.filter(function (p) { return p.cat === c; }).length); }).join('') +
        '</div>' +
        '<p class="pk-note">' + icon('info') + '<span>提携先は調整中です。割引率は商品・店舗・時期によって異なります。</span></p>' +
      '</div>' +
      (shown.length ? '<div class="grid-2 pk-grid">' + shown.map(perkCard).join('') + '</div>'
        : '<div class="card">' + U.empty('ticket', 'この種類の福利厚生は準備中です') + '</div>') +
      '<section class="sec"><div class="list">' +
        '<a class="li has-ico" href="#/card"><span class="li__ico">' + icon('card') + '</span>' +
          '<span class="li__body"><span class="li__ttl">会員証を表示する</span>' +
          '<span class="li__sub">店頭で使う福利厚生は、会員ページの会員証を見せて使います</span></span>' + U.chevron() + '</a>' +
        '<button class="li has-ico" data-wish><span class="li__ico">' + icon('pen') + '</span>' +
          '<span class="li__body"><span class="li__ttl">ほしい福利厚生を運営に伝える</span>' +
          '<span class="li__sub">「こんな割引があったら」を募集しています。提携先を探すときの参考にします</span></span>' + U.chevron() + '</button>' +
      '</div></section>';
  }

  function expertRow(ex) {
    return '<button class="li has-ico ex-row" data-consult="' + esc(ex.id) + '" aria-label="' + esc(ex.title + 'への相談を申し込む') + '">' +
      '<span class="li__ico">' + icon(EX_ICON[ex.title] || 'user') + '</span>' +
      '<span class="li__body"><span class="li__ttl">' + esc(ex.title) +
        (ex.note ? '<span class="tag tag-indigo">' + esc(ex.note) + '</span>' : '') + '</span>' +
        '<span class="li__sub">' + esc(ex.desc) + '</span></span>' +
      '<span class="li__end"><span class="ex-row__cta">相談を申し込む</span>' + U.chevron() + '</span>' +
    '</button>';
  }

  function renderExperts() {
    var list = DATA.EXPERTS || [], tax = byTitle(list, '税理士');
    var arrow = '<span class="ex-flow__arrow" aria-hidden="true">' + icon('arrow', 'ico-s') + '</span>';
    return '<div class="card-flat ex-flow">' +
        '<p class="ex-flow__lead">提携の専門家を、運営がおつなぎします。</p>' +
        '<p class="ex-flow__steps"><span>申し込む</span>' + arrow + '<span>運営が日程を調整</span>' + arrow + '<span>専門家と相談（初回30分は無料）</span></p>' +
      '</div>' +
      (list.length ? '<div class="list ex-list">' + list.map(expertRow).join('') + '</div>'
        : '<div class="card">' + U.empty('users', '提携の専門家は準備中です') + '</div>') +
      '<p class="ex-fee">2回目からは各事務所の料金です。続けるかどうかは、初回の相談のあとで決められます。</p>' +
      '<section class="sec"><h2 class="sec-ttl">よくある質問</h2>' +
        '<div class="card card-pad ex-faq">' +
          '<p class="ex-faq__q"><span class="ex-faq__mark" aria-hidden="true">Q</span>会費は経費になりますか？</p>' +
          '<p class="ex-faq__a">事業の内容によって変わります。提携の税理士に無料で相談できます。領収書はアカウントからダウンロードできます。</p>' +
          '<div class="row ex-faq__acts">' +
            (tax ? '<button class="btn btn-ghost btn-s" data-consult="' + esc(tax.id) + '" data-preset="fee">' + icon('yen', 'ico-s') + '税理士に相談する</button>' : '') +
            '<a class="btn btn-text btn-s" href="#/account">' + icon('receipt', 'ico-s') + '領収書を見る</a>' +
          '</div>' +
        '</div>' +
      '</section>' +
      '<section class="sec"><div class="list">' +
        '<a class="li has-ico" href="#/messages"><span class="li__ico">' + icon('message') + '</span>' +
          '<span class="li__body"><span class="li__ttl">どの専門家に聞けばいいか迷ったら</span>' +
          '<span class="li__sub">まずは運営に相談してください。回数の制限はありません</span></span>' + U.chevron() + '</a>' +
      '</div></section>';
  }

  /* ---------- 窓 ---------- */
  function mhead(ico, eyebrow, title) {
    return '<div class="pk-mhead"><span class="pk__ico">' + icon(ico) + '</span>' +
      '<div><p class="pk-mhead__eyebrow">' + esc(eyebrow) + '</p><h3 class="modal__ttl">' + esc(title) + '</h3></div></div>';
  }
  function codeBox(label, code, done) {
    return '<div class="pk-code">' +
      '<div class="pk-code__main"><span class="pk-code__label">' + esc(label) + (done ? '<span class="tag tag-ok">' + esc(done) + '</span>' : '') + '</span>' +
        '<span class="pk-code__val">' + esc(code) + '</span></div>' +
      '<button class="btn btn-ghost btn-s" data-copy>' + icon('copy', 'ico-s') + '<span>コピー</span></button>' +
    '</div>';
  }

  function usePerk(p) {
    var k = kind(p.how);
    if (k === 'site') { U.toast('本番では提携サイトが開きます'); return; }
    if (k === 'other') { U.toast('本番では、この福利厚生の使い方をここでご案内します'); return; }
    var head = mhead(CAT_ICON[p.cat] || 'gift', p.cat + 'の福利厚生', p.title) + '<p class="sub">' + esc(p.desc) + '</p>';
    var code = '', body = '', foot = '';
    if (k === 'id') {
      code = perkCode(p, 'id');
      // ログインの「会員ID」と取り違えないよう、提携サイト用だと名前で分かるようにする
      body = codeBox('提携サイトで使うあなたのID', code, '発行済み') +
        '<p class="pk-mnote">提携サイトの登録画面で入力します（本番では提携先のURLが開きます）</p>';
      foot = '<button class="btn btn-ink" data-open-site>' + icon('external', 'ico-s') + '提携サイトを開く</button>';
    } else if (k === 'coupon') {
      code = perkCode(p, 'coupon');
      body = codeBox('クーポンコード', code, '') +
        '<p class="pk-mnote">提携先の予約・申込の画面で入力してください。本番では、提携先ごとの使える条件と期限もここに出します。</p>';
      foot = '<button class="btn btn-ink" data-open-site>' + icon('external', 'ico-s') + '提携先の申込画面へ</button>';
    } else {
      body = '<div class="card-flat pk-how">' +
          '<p class="pk-how__ttl">' + icon('card', 'ico-s') + '会員証を見せて使います</p>' +
          '<p class="small">お店の受付で、会員ページの会員証を見せてください。お店が会員番号を確かめたうえで、割引の料金になります。</p>' +
        '</div>' +
        '<p class="pk-mnote">下のボタンで、お店で見せるための明るい会員証がすぐに開きます。</p>';
      foot = '<a class="btn btn-ink" href="#/card?show=1" data-close>' + icon('qr', 'ico-s') + '提示用の会員証を開く</a>';
    }
    var m = U.modal('<div class="scr-perks">' + head + body +
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
      '<div class="pk-done"><span class="pk-done__ico">' + icon('checkc') + '</span>' +
        '<h3 class="modal__ttl">' + esc(title) + '</h3><p class="sub">' + esc(lead) + '</p></div>' +
      '<div class="card-flat pk-done__sent"><p class="pk-done__label">送った内容</p><p class="small">' + U.nl2br(msg) + '</p></div>' +
      '<div class="modal__foot"><button class="btn btn-soft" data-x-close>閉じる</button>' +
        '<button class="btn btn-ink" data-x-msg>' + icon('message', 'ico-s') + 'メッセージを見る</button></div>' +
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
      U.toast(sent.toast, 'ok');
      showSent(m, ctx, sent.title, sent.lead, sent.msg);
      ctx.refresh();
    });
    return m;
  }

  function openConsult(ex, preset, ctx) {
    var ways = WAYS.map(function (w) { return '<option value="' + esc(w) + '">' + esc(w) + '</option>'; }).join('');
    formModal(
      mhead(EX_ICON[ex.title] || 'user', '専門家に相談', ex.title + 'への相談を申し込む') +
      '<p class="sub">' + esc(ex.desc) + (ex.note ? ' <span class="tag tag-indigo">' + esc(ex.note) + '</span>' : '') + '</p>' +
      '<form class="pk-form" novalidate>' +
        '<label class="field"><span>相談したいこと</span>' +
          '<textarea class="textarea" name="text" rows="5" data-empty="相談したいことを書いてください" placeholder="' + esc(EX_HINT[ex.title] || '例：相談したいことを、分かる範囲で書いてください。') + '">' + esc(preset || '') + '</textarea>' +
          '<small>分かる範囲で大丈夫です。運営が専門家に伝えます。</small></label>' +
        '<label class="field"><span>希望の連絡方法</span><select class="select" name="way">' + ways + '</select></label>' +
        '<p class="pk-err xsmall" role="alert"></p>' +
        '<p class="pk-mnote">初回30分の相談は無料です。2回目からは各事務所の料金で、続けるかどうかはあなたが決められます。</p>' +
        '<div class="modal__foot"><button type="button" class="btn btn-soft" data-close>やめる</button>' +
          '<button type="submit" class="btn btn-primary">申し込む</button></div>' +
      '</form>',
      ctx,
      function (text, form) {
        var way = form.way.value;
        return {
          msg: '【専門家への相談：' + ex.title + '】\n' + text + '\n希望の連絡方法：' + way,
          kind: '壁打ち・相談',
          toast: '運営が専門家との日程を調整します',
          title: '申し込みました',
          lead: '運営が' + ex.title + 'との日程を調整して、候補の日時を「相談・メッセージ」にお送りします。'
        };
      });
  }

  function openWish(ctx) {
    formModal(
      mhead('pen', '福利厚生', 'ほしい福利厚生を伝える') +
      '<p class="sub">暮らしや仕事で「これが安くなったら助かる」を教えてください。提携先を探すときの参考にします。</p>' +
      '<form class="pk-form" novalidate>' +
        '<label class="field"><span>ほしい福利厚生</span>' +
          '<textarea class="textarea" name="text" rows="4" data-empty="ほしい福利厚生を書いてください" placeholder="例：子どもの習い事（スイミングなど）の割引があるとうれしいです。"></textarea></label>' +
        '<p class="pk-err xsmall" role="alert"></p>' +
        '<div class="modal__foot"><button type="button" class="btn btn-soft" data-close>やめる</button>' +
          '<button type="submit" class="btn btn-primary">運営に送る</button></div>' +
      '</form>',
      ctx,
      function (text) {
        return {
          msg: '【ほしい福利厚生】\n' + text,
          kind: 'その他',
          toast: '運営に届きました',
          title: '送りました',
          lead: 'ありがとうございます。提携先を探すときの参考にします。返信は「相談・メッセージ」に届きます。'
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
        '<div class="page-head"><h1 class="page-ttl">福利厚生・専門家</h1>' +
          '<p class="page-lead">毎月の暮らしと、仕事の困りごとに。</p></div>' +
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
        var card = el.querySelector('[data-perk="' + focus + '"]');
        // 描き直しのたびに同じ場所へ飛ばないよう、URLから目印を外しておく（hashchange は起きない）
        try { history.replaceState(null, '', '#/perks'); } catch (e) {}
        if (card) {
          card.classList.add('is-focus');
          setTimeout(function () {
            try { card.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { card.scrollIntoView(); }
          }, 60);
        }
      }
    }
  };
})();
