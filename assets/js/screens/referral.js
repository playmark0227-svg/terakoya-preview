/* ============================================================
   紹介・報酬（#/referral）
   ------------------------------------------------------------
   法律まわりでいちばん気をつける画面（docs/参考調査メモ.md §3）。
   - 数字は R.referral() / R.rewardRows() からだけ取る。画面で計算し直さない
   - 収入を約束する言い方をしない。ランキング・ほかの会員のお金は出さない
   - 紹介した相手は頭文字だけ
   - 振込先はどこにも保存しない（本番は決済サービス側で保管する）
   - 文章は docs/脱AIの約束.md に合わせて短く。UIの説明・図解・飾りの記号は置かない
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, U = CLG.ui, R = CLG.rules;
  var esc = U.esc, icon = U.icon;

  /* 明細の状態 → 札の色。緑は「支払済」だけ（できた、の意味でしか使わない） */
  var TAG = { hold: 'tag-line', confirmed: 'tag-indigo', scheduled: 'tag-indigo', paid: 'tag-ok', void: '' };

  var RULES = [
    '収入を約束する言い方をしない（「必ず稼げる」「会費はすぐ取り戻せる」など）',
    '会費と解約の条件は、そのまま伝える',
    'SNSでは #PR などで、紹介だと分かるようにする',
    '知らない人への一斉DMはしない',
    '目的を言わずに呼び出して勧誘しない',
    '学生や収入のない方に、借入・分割を勧めない',
    '断られたら、重ねて誘わない'
  ];

  /* ---------- 小さな道具 ---------- */
  // 曜日は付けない（支払日が土日にあたっても、ここでは前倒しの規則を持っていないため）
  function md(d) { return U.fmtDate(d, { noYear: true, wd: false }); }   // 9月6日
  function ymd(d) { d = new Date(d); return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate()); }

  /** 在籍中で、まだ保留中の紹介のうち、いちばん早い確定日（なければ null）。
      退会した方の分は確定しないので数えない */
  function firstConfirm(ref) {
    var t = null;
    ref.list.forEach(function (r) {
      if (!r.held || r.status !== 'active') return;
      var x = new Date(r.confirmAt).getTime();
      if (t === null || x < t) t = x;
    });
    return t === null ? null : new Date(t);
  }

  /* ---------- 紹介リンクと紹介文 ---------- */
  function linkCard(ref) {
    return '<section class="card card-pad rf-link">' +
      '<h2 class="h3">紹介リンク</h2>' +
      '<div class="rf-url">' +
        '<span class="rf-url__text mono">' + esc(ref.url) + '</span>' +
        '<button class="btn btn-ink btn-s" data-rf="copy-url">' + icon('copy', 'ico-s') + 'コピー</button>' +
      '</div>' +
      '<div class="rf-code">' +
        '<span>紹介コード <b class="mono">' + esc(ref.code) + '</b></span>' +
        '<button class="btn btn-text" data-rf="copy-code">コピー</button>' +
      '</div>' +
      '<div class="rf-text">' +
        '<label class="field"><span>紹介文</span>' +
          '<textarea class="textarea rf-share" readonly rows="5" data-rf-select>' + esc(ref.shareText) + '</textarea>' +
        '</label>' +
        '<div class="row rf-share-btns">' +
          '<button class="btn btn-ghost btn-s" data-rf="copy-text">' + icon('copy', 'ico-s') + '文面をコピー</button>' +
          '<button class="btn btn-ghost btn-s" data-rf="line">' + icon('line', 'ico-s') + 'LINEで送る</button>' +
          '<button class="btn btn-ghost btn-s" data-rf="qr">' + icon('qr', 'ico-s') + 'QRコード</button>' +
        '</div>' +
        '<p class="rf-pr">先頭の #PR は消さないでください（ステマ規制のため）。</p>' +
      '</div>' +
    '</section>';
  }

  /* ---------- 本人の記録 ---------- */
  function stat(label, value, unit) {
    return '<div><dt>' + esc(label) + '</dt><dd>' + value + (unit ? '<small>' + esc(unit) + '</small>' : '') + '</dd></div>';
  }
  function stats(ref) {
    return '<div class="card rf-stats"><dl class="stats">' +
      stat('この30日のクリック', U.num(ref.clicks), '回') +
      stat('この30日の入会', U.num(ref.recent), '人') +
      stat('在籍中の紹介', U.num(ref.active), '人') +
      stat('保留中の報酬', esc(U.yen(ref.held)), '') +
    '</dl></div>';
  }

  /* ---------- 受け取り（キー：値の表） ---------- */
  function payCard(ref) {
    var first = firstConfirm(ref), has = ref.held + ref.confirmed > 0;
    var rows = [];
    var conf = esc(U.yen(ref.confirmed));
    if (ref.confirmed > 0 && ref.confirmed < ref.minPayout) {
      conf += '<span class="rf-kv__note">' + esc(U.yen(ref.minPayout)) + '未満のため翌月に繰り越し</span>';
    }
    rows.push(['確定（未払い）', '<b class="num">' + conf + '</b>']);
    // 確定した分があるときだけ日付を出す（0円で日付だけあると「この日に入る」と読めてしまう）
    if (ref.confirmed >= ref.minPayout && ref.payDate) {
      rows.push(['次の振込', esc(md(ref.payDate)) + '（予定）']);
    } else if (first) {
      // 保留中は取消になることもあるので、条件を添える
      rows.push(['次の確定', esc(md(first)) + '（返金・解約がなければ）']);
    }
    rows.push(['締め・支払日', esc(ref.closeLabel)]);
    rows.push(['受け取り済み', '<span class="num">' + esc(U.yen(ref.paid)) + '</span>']);
    rows.push(['振込先', '<span class="rf-bank"><span class="' + (has ? 'rf-bank__warn' : '') + '">未登録</span>' +
      '<button class="btn btn-s ' + (has ? 'btn-primary' : 'btn-ghost') + '" data-rf="bank">登録する</button></span>']);
    return '<section class="card card-pad rf-pay">' +
      '<h2 class="h3">報酬の受け取り</h2>' +
      '<table class="kv rf-kv"><tbody>' + rows.map(function (r) {
        return '<tr><th>' + esc(r[0]) + '</th><td>' + r[1] + '</td></tr>';
      }).join('') + '</tbody></table>' +
    '</section>';
  }

  /* ---------- 明細 ---------- */
  function rowsCard(ref) {
    var rows = ref.rows;
    var body = rows.length ?
      '<div class="tbl-wrap"><table class="tbl rf-tbl"><thead><tr>' +
        '<th>対象</th><th>発生日</th><th class="r">金額</th><th>状態</th><th>確定日</th>' +
      '</tr></thead><tbody>' + rows.map(function (x) {
        var when = x.status === 'void' ? '—' : esc(md(x.confirmAt)) + (x.status === 'hold' ? '（予定）' : '');
        return '<tr' + (x.status === 'void' ? ' class="is-void"' : '') + '>' +
          '<td>' + esc(x.who) + '</td>' +
          '<td>' + esc(md(x.at)) + '</td>' +
          '<td class="r num">' + esc(U.yen(x.amount)) + '</td>' +
          '<td><span class="tag ' + (TAG[x.status] || '') + '">' + esc(x.label) + '</span></td>' +
          '<td>' + when + '</td></tr>';
      }).join('') + '</tbody></table></div>'
      : '<p class="rf-none">' + (ref.list.length ? 'まだ明細はありません。' : 'まだ紹介した方はいません。') + '</p>';
    return '<section class="card rf-rows">' +
      '<div class="card-head"><h2 class="h3">明細</h2>' +
        (rows.length ? '<button class="btn btn-text" data-rf="csv">' + icon('download', 'ico-s') + 'CSVで保存</button>' : '') +
      '</div>' +
      (rows.length ? '<div class="rf-tbl-pad">' + body + '</div>' : body) +
    '</section>';
  }

  /* ---------- 紹介した人（頭文字だけ） ---------- */
  function people(ref) {
    if (!ref.list.length) return '';
    var list = ref.list.slice().sort(function (a, b) { return new Date(b.joinedAt) - new Date(a.joinedAt); });
    return '<section class="card rf-people">' +
      '<div class="card-head"><h2 class="h3">紹介した人</h2><span class="rf-count">' + list.length + '人</span></div>' +
      '<ul class="rf-people__list">' + list.map(function (r) {
        var active = r.status === 'active';
        // 緑は「できた」の色なので、在籍中は藍（情報）にする
        return '<li>' +
          '<b>' + esc(r.who) + '</b>' +
          '<span class="rf-people__date">' + esc(md(r.joinedAt)) + '入会</span>' +
          '<span class="tag' + (active ? ' tag-indigo' : '') + '">' + (active ? '在籍中' : '退会') + '</span>' +
        '</li>';
      }).join('') + '</ul>' +
    '</section>';
  }

  /* ---------- 報酬のしくみ ---------- */
  function howCard(ref) {
    var monthly = ref.model === 'monthly';
    var lead = monthly
      ? '紹介した方が在籍しているあいだ、毎月その方の月額の' + Math.round(ref.rate * 100) + '%（' + U.yen(ref.perPerson) + '）をお支払いします。'
      : '紹介した方1名につき、' + U.yen(ref.perPerson) + 'を1回だけお支払いします。';
    return '<section class="card card-pad rf-how">' +
      '<h2 class="h3">報酬のしくみ（仮）</h2>' +
      '<p class="rf-how__lead">' + esc(lead) + '</p>' +
      '<ul class="rf-bullets">' +
        '<li>紹介は1段だけです。紹介した方がさらに紹介しても、あなたへの報酬はありません。</li>' +
        '<li>紹介の人数で料率は変わりません。</li>' +
        (monthly ? '<li>紹介した方が退会すると、それ以降の報酬はありません。</li>' : '') +
        '<li>報酬は、紹介した方のお支払いから' + esc(ref.holdDays) + '日間「保留」です。返金・解約がなければ「確定」、あれば「取消」になります。</li>' +
        '<li>最低支払額は' + esc(U.yen(ref.minPayout)) + 'です。届かない月は翌月に繰り越します。</li>' +
        '<li>紹介はランキングに関係しません。</li>' +
        '<li>確定申告が必要になることがあります。提携の税理士に相談できます（初回30分無料）。' +
          '<a href="#/perks?tab=experts">専門家の一覧</a></li>' +
      '</ul>' +
    '</section>';
  }

  /* ---------- 紹介のルール（いつも見せる） ---------- */
  function rulesCard() {
    return '<section class="card card-pad rf-rules">' +
      '<h2 class="h3">紹介のルール</h2>' +
      '<ol class="rf-rules__list">' + RULES.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ol>' +
      '<p class="rf-rules__warn">守られなかった場合、報酬はお支払いできません。</p>' +
      '<p class="rf-rules__ask">分からないことは<a href="#/messages">運営に相談</a>してください。</p>' +
    '</section>';
  }

  /* ---------- 窓：QRコード ----------
     試作版は見た目だけ。URLの文字から決まる模様なので、同じリンクなら毎回同じ絵になる。 */
  function qrSvg(text) {
    var N = 25, Q = 3, seed = 7, i, x, y, d = '';
    for (i = 0; i < text.length; i++) seed = (seed * 31 + text.charCodeAt(i)) | 0;
    if (!seed) seed = 1;
    function rnd() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; }
    // 目印（3つの角・右下の小さな角・点線）は本物のQRコードと同じ位置に置く
    function fixed(x, y) {
      var corners = [[0, 0], [N - 7, 0], [0, N - 7]];
      for (var k = 0; k < corners.length; k++) {
        var fx = x - corners[k][0], fy = y - corners[k][1];
        if (fx >= -1 && fx <= 7 && fy >= -1 && fy <= 7) {
          if (fx < 0 || fx > 6 || fy < 0 || fy > 6) return 0;
          return Math.max(Math.abs(fx - 3), Math.abs(fy - 3)) === 2 ? 0 : 1;
        }
      }
      var ax = x - (N - 7), ay = y - (N - 7);
      if (Math.abs(ax) <= 2 && Math.abs(ay) <= 2) return Math.max(Math.abs(ax), Math.abs(ay)) === 1 ? 0 : 1;
      if (y === 6) return x % 2 === 0 ? 1 : 0;
      if (x === 6) return y % 2 === 0 ? 1 : 0;
      return -1;
    }
    for (y = 0; y < N; y++) {
      for (x = 0; x < N; x++) {
        var f = fixed(x, y), on = f === -1 ? rnd() < 0.48 : f === 1;
        if (on) d += 'M' + (x + Q) + ' ' + (y + Q) + 'h1v1h-1z';
      }
    }
    var S = N + Q * 2;
    // 地の白と点の墨は .rf-qr の色（トークン）から取る
    return '<svg viewBox="0 0 ' + S + ' ' + S + '" role="img" aria-label="紹介リンクのQRコード（試作版の見た目だけ）" shape-rendering="crispEdges">' +
      '<path d="' + d + '" fill="currentColor"/></svg>';
  }
  function qrModal(ref) {
    var m = U.modal(
      '<div class="scr-referral">' +
        '<h3 class="modal__ttl">紹介リンクのQRコード</h3>' +
        '<div class="rf-qr">' + qrSvg(ref.url) + '</div>' +
        '<p class="rf-qr__url mono">' + esc(ref.url) + '</p>' +
        '<div class="modal__foot"><button class="btn btn-soft" data-close>閉じる</button>' +
          '<button class="btn btn-ink" data-qr-copy>' + icon('copy', 'ico-s') + 'リンクをコピー</button></div>' +
      '</div>');
    m.querySelector('[data-qr-copy]').addEventListener('click', function () {
      copy(ref.url, '紹介リンクをコピーしました');
    });
  }

  /* ---------- 窓：振込先 ----------
     口座の情報は、試作版ではどこにも保存しない（state にも localStorage にも入れない）。 */
  function field(label, control) {
    return '<label class="field"><span>' + esc(label) + '</span>' + control + '</label>';
  }
  function bankModal() {
    var m = U.modal(
      '<div class="scr-referral">' +
        '<h3 class="modal__ttl">振込先の登録</h3>' +
        '<p class="sub rf-bank-lead">本人名義の口座を登録してください。</p>' +
        '<form class="rf-bank-form" autocomplete="off" novalidate>' +
          field('金融機関名', '<input class="input" autocomplete="off" placeholder="例：〇〇銀行">') +
          '<div class="rf-bank-2">' +
            field('支店名', '<input class="input" autocomplete="off" placeholder="例：〇〇支店">') +
            field('口座の種類', '<select class="select"><option>普通</option><option>当座</option></select>') +
          '</div>' +
          field('口座番号', '<input class="input" autocomplete="off" inputmode="numeric" maxlength="7" placeholder="7桁の数字">') +
          field('口座名義（カタカナ）', '<input class="input" autocomplete="off" placeholder="例：ヤマダ ハナコ">') +
          field('インボイス登録番号（任意）', '<input class="input" autocomplete="off" maxlength="14" placeholder="T から始まる13桁">') +
          '<div class="modal__foot"><button type="button" class="btn btn-soft" data-close>やめる</button>' +
            '<button type="submit" class="btn btn-ink">登録する</button></div>' +
        '</form>' +
      '</div>');
    m.querySelector('form').addEventListener('submit', function (e) {
      e.preventDefault();
      e.target.reset();
      m.close();
      U.toast('本番ではここで振込先を登録します');
    });
  }

  /* ---------- 明細のCSV ---------- */
  function csv(ref) {
    function cell(v) { return '"' + String(v).replace(/"/g, '""') + '"'; }
    var lines = [['対象', '発生日', '金額（円）', '状態', '確定日'].map(cell).join(',')].concat(ref.rows.map(function (x) {
      return [x.who, ymd(x.at), x.amount, x.label, x.status === 'void' ? '' : ymd(x.confirmAt)].map(cell).join(',');
    }));
    U.download('紹介報酬の明細_' + ymd(CLG.now()) + '.csv', lines.join('\r\n'), 'text/csv');
    U.toast('明細をCSVで保存しました', 'ok');
  }

  function copy(text, msg) {
    U.copyText(text).then(function () { U.toast(msg, 'ok'); });
  }

  /* 文面が途中で切れないよう、欄の高さを中身に合わせる。
     幅が変わると折り返しも変わるので、窓の大きさが変わったときも合わせ直す（登録は1回だけ） */
  var resizeBound = false;
  function fitShare(ta) {
    if (!ta) return;
    ta.style.height = '';
    if (ta.scrollHeight > ta.clientHeight) ta.style.height = (ta.scrollHeight + 2) + 'px';
  }

  CLG.screens.referral = {
    title: '紹介・報酬',
    render: function () {
      var ref = R.referral();
      return '<div class="scr-referral">' +
        '<div class="page-head"><h1 class="page-ttl">紹介・報酬</h1>' +
          '<p class="page-lead">紹介は任意です。収入を保証するものではありません。</p></div>' +
        linkCard(ref) +
        stats(ref) +
        payCard(ref) +
        rowsCard(ref) +
        people(ref) +
        '<div class="grid-2 rf-pair">' + howCard(ref) + rulesCard() + '</div>' +
        '<p class="proto-note rf-proto">試作版メモ：報酬のしくみは弁護士の確認前の仮のものです。</p>' +
      '</div>';
    },
    mount: function (root) {
      // 描き直すたびに中身は新しくなるので、毎回できる .scr-referral に付ける（二重にならない）
      var el = root.querySelector('.scr-referral');
      if (!el) return;
      fitShare(el.querySelector('.rf-share'));
      if (!resizeBound) {
        resizeBound = true;
        window.addEventListener('resize', function () { fitShare(document.querySelector('.scr-referral .rf-share')); });
      }
      el.addEventListener('click', function (e) {
        var b = e.target.closest('[data-rf]');
        if (!b) return;
        var act = b.getAttribute('data-rf'), ref = R.referral();
        if (act === 'copy-url') copy(ref.url, '紹介リンクをコピーしました');
        else if (act === 'copy-code') copy(ref.code, '紹介コードをコピーしました');
        else if (act === 'copy-text') copy(ref.shareText, '文面をコピーしました');
        else if (act === 'line') U.toast('本番ではLINEが開いて、この文面を送れます');
        else if (act === 'qr') qrModal(ref);
        else if (act === 'bank') bankModal();
        else if (act === 'csv') csv(ref);
      });
      // 文面の欄を押したら全体を選ぶ（手でコピーする人のため）
      el.addEventListener('focusin', function (e) {
        if (e.target.hasAttribute && e.target.hasAttribute('data-rf-select')) e.target.select();
      });
    }
  };
})();
