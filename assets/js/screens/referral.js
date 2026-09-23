/* ============================================================
   紹介・報酬（#/referral）
   ------------------------------------------------------------
   法律まわりでいちばん気をつける画面（docs/参考調査メモ.md §3）。
   - 数字は R.referral() / R.rewardRows() からだけ取る。画面で計算し直さない
   - 収入を約束する言い方をしない。ランキング・ほかの会員のお金は出さない
   - 紹介した相手は頭文字だけ
   - 振込先はどこにも保存しない（本番は決済サービス側で保管する）
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
  function payDay(ref) { return new Date(ref.payDate).getDate(); }

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
  function countOf(ref, status) {
    var rows = ref.rows.filter(function (x) { return x.status === status; });
    return { n: rows.length, sum: rows.reduce(function (a, x) { return a + x.amount; }, 0) };
  }

  /* ---------- 1. 紹介リンクと文面 ---------- */
  function linkCard(ref) {
    return '<section class="card rf-link">' +
      '<div class="rf-link__main">' +
        '<h2 class="rf-link__ttl">' + icon('link') + 'あなたの紹介リンク</h2>' +
        '<p class="sub">このリンクから入会した方が、あなたからの紹介になります。</p>' +
        '<div class="rf-url">' +
          '<span class="rf-url__text mono">' + esc(ref.url) + '</span>' +
          '<button class="btn btn-ink btn-s" data-rf="copy-url">' + icon('copy', 'ico-s') + 'コピー</button>' +
        '</div>' +
        '<div class="rf-link__sub">' +
          '<button class="btn btn-ghost btn-s" data-rf="qr">' + icon('qr', 'ico-s') + 'QRコード</button>' +
          '<span class="rf-code">紹介コード <b class="mono">' + esc(ref.code) + '</b>' +
            '<button class="btn btn-text rf-code__copy" data-rf="copy-code">コピー</button></span>' +
        '</div>' +
        '<p class="xsmall muted">リンクを使わずに入会する方は、入会フォームの「紹介コード」にこのコードを入れてもらえば紹介になります。</p>' +
      '</div>' +
      '<div class="rf-link__text">' +
        '<label class="field"><span>紹介するときの文面</span>' +
          '<textarea class="textarea rf-share" readonly rows="6" data-rf-select>' + esc(ref.shareText) + '</textarea>' +
        '</label>' +
        '<div class="row">' +
          '<button class="btn btn-ghost btn-s" data-rf="copy-text">' + icon('copy', 'ico-s') + '文面をコピー</button>' +
          '<button class="btn btn-ghost btn-s" data-rf="line">' + icon('line', 'ico-s') + 'LINEで送る</button>' +
        '</div>' +
        '<p class="rf-pr">' + icon('info', 'ico-s') + '<span>文面の最初の #PR は消さないでください（広告であることを示す決まりです）</span></p>' +
      '</div>' +
    '</section>';
  }

  /* ---------- 2. 本人の記録 ---------- */
  function stat(label, value, unit) {
    return '<div><dt>' + esc(label) + '</dt><dd>' + value + (unit ? '<small>' + esc(unit) + '</small>' : '') + '</dd></div>';
  }
  function stats(ref) {
    return '<div class="card rf-stats"><dl class="stats">' +
      stat('この30日のクリック', U.num(ref.clicks), '回') +
      stat('この30日の入会', U.num(ref.recent), '人') +
      stat('在籍中の紹介', U.num(ref.active), '人') +
      stat('保留中の報酬', esc(U.yen(ref.held)), '') +
    '</dl></div>' +
    '<p class="rf-caption">クリックは、紹介リンクが開かれた回数です。数字はあなたの分だけで、ほかの会員には見えません。</p>';
  }

  /* ---------- 3. 受け取り ---------- */
  function payCard(ref) {
    var first = firstConfirm(ref), has = ref.held + ref.confirmed > 0, msg, cls = '';
    if (ref.confirmed >= ref.minPayout) {
      // 試作版は振込先を保存しないので、いつも「登録が要る」と添える
      msg = '確定した ' + U.yen(ref.confirmed) + ' を、' + md(ref.payDate) + 'にお振り込みする予定です（振込先の登録が必要です）。';
      cls = ' notice-ok';
    } else if (ref.confirmed > 0) {
      msg = '確定した報酬が最低支払額（' + U.yen(ref.minPayout) + '）に届いていないため、翌月に繰り越します。';
    } else if (first) {
      // 保留中は取消になることもあるので、条件を添えて言い切らない
      msg = '返金・解約がなければ、' + md(first) + 'に' + (ref.paid > 0 ? '次の' : '最初の') + '報酬が確定します。確定した報酬は月末で締めて、翌月' + payDay(ref) + '日にお振り込みします。';
    } else if (ref.held > 0) {
      msg = '保留中の報酬は、返金・解約がないことを確かめてから確定します。確定した報酬は月末で締めて、翌月' + payDay(ref) + '日にお振り込みします。';
    } else {
      msg = 'まだ報酬はありません。紹介した方が入会した場合、報酬は初回のお支払いから' + ref.holdDays + '日の保留のあとに確定します。';
    }
    return '<section class="card rf-pay">' +
      '<div class="rf-pay__nums">' +
        '<div><p class="rf-pay__k">確定した報酬</p><p class="rf-pay__v num">' + esc(U.yen(ref.confirmed)) + '</p>' +
          '<p class="rf-pay__s">支払予定の分を含みます</p></div>' +
        '<div><p class="rf-pay__k">次のお支払い予定日</p><p class="rf-pay__v rf-pay__v-date">' + esc(md(ref.payDate)) + '</p>' +
          '<p class="rf-pay__s">' + esc(ref.closeLabel) + '</p>' +
          // 確定が0円でも日付だけ出ていると「この日に入る」と読めてしまうため
          (ref.confirmed > 0 ? '' : '<p class="rf-pay__s muted">確定した報酬があるときだけ、お振り込みします</p>') + '</div>' +
      '</div>' +
      '<div class="notice' + cls + '">' + icon(cls ? 'checkc' : 'clock') + '<div>' + esc(msg) + '</div></div>' +
      '<div class="rf-bank">' +
        '<span class="rf-bank__ico">' + icon('card') + '</span>' +
        '<div class="rf-bank__body"><p class="rf-bank__ttl">振込先 <span class="tag ' + (has ? 'tag-warn' : 'tag-line') + '">未登録</span></p>' +
          '<p class="xsmall muted">' + (has ? '登録がないと、確定した報酬をお振り込みできません。' : '報酬が確定する前に登録しておけば大丈夫です。') + '</p></div>' +
        '<button class="btn btn-s ' + (has ? 'btn-primary' : 'btn-ghost') + '" data-rf="bank">登録する</button>' +
      '</div>' +
      '<div class="rf-paid"><span>これまでに受け取った報酬</span><b class="num">' + esc(U.yen(ref.paid)) + '</b></div>' +
    '</section>';
  }

  /* ---------- 4. 報酬が支払われるまで ---------- */
  function flow(ref) {
    var steps = [
      { name: '発生', text: ref.model === 'monthly' ? '紹介した方の月額のお支払いが済むたびに発生します' : '紹介した方の初回のお支払いが済むと発生します' },
      { name: '保留（' + ref.holdDays + '日）', st: 'hold', text: '返金や解約がないかを確かめる期間です' },
      { name: '確定', st: 'confirmed', text: '返金・解約がなければ確定します' },
      { name: '支払予定', st: 'scheduled', text: '月末で締めて、翌月' + payDay(ref) + '日にお振り込みします' },
      { name: '支払済', st: 'paid', text: '登録した口座にお振り込みしました' }
    ];
    return '<section class="card">' +
      '<ol class="rf-flow">' + steps.map(function (s) {
        var c = s.st ? countOf(ref, s.st) : { n: 0 };
        return '<li class="rf-step' + (c.n ? ' is-on' : '') + '">' +
          '<span class="rf-step__dot" aria-hidden="true"></span>' +
          '<p class="rf-step__name">' + esc(s.name) + '</p>' +
          '<p class="rf-step__text">' + esc(s.text) + '</p>' +
          (c.n ? '<span class="rf-step__n num">' + c.n + '件・' + esc(U.yen(c.sum)) + '</span>' : '') +
        '</li>';
      }).join('') + '</ol>' +
      '<p class="rf-flow__foot">保留のあいだに返金・解約があった場合は「取消」になり、その分の報酬はお支払いしません。</p>' +
    '</section>';
  }

  /* ---------- 5. 明細 ---------- */
  function rowsCard(ref) {
    var rows = ref.rows;
    var body = rows.length ?
      '<div class="tbl-wrap"><table class="tbl rf-tbl"><thead><tr>' +
        '<th>対象</th><th>発生日</th><th class="r">金額</th><th>状態</th><th>確定予定</th>' +
      '</tr></thead><tbody>' + rows.map(function (x) {
        var when = x.status === 'hold' ? esc(md(x.confirmAt)) : x.status === 'void' ? '—' : '<span class="muted">確定済み</span>';
        return '<tr' + (x.status === 'void' ? ' class="is-void"' : '') + '>' +
          '<td>' + esc(x.who) + '</td>' +
          '<td>' + esc(md(x.at)) + '</td>' +
          '<td class="r num">' + esc(U.yen(x.amount)) + '</td>' +
          '<td><span class="tag ' + (TAG[x.status] || '') + '">' + esc(x.label) + '</span></td>' +
          '<td>' + when + '</td></tr>';
      }).join('') + '</tbody></table></div>'
      : U.empty('receipt', 'まだ明細はありません。紹介した方が入会すると、ここに1件ずつ並びます。');
    return '<section class="card">' +
      '<div class="card-head rf-head">' +
        '<div><h2 class="h3">明細</h2><p class="xsmall muted">' +
          (ref.model === 'monthly' ? '紹介した方1名につき、在籍中は毎月1件ずつ増えます。' : '紹介した方1名につき1件です。') + '</p></div>' +
        (rows.length ? '<button class="btn btn-text" data-rf="csv">' + icon('download', 'ico-s') + 'CSVで保存</button>' : '') +
      '</div>' +
      '<div class="rf-tbl-pad">' + body + '</div>' +
    '</section>';
  }

  /* ---------- 6. 紹介した人（頭文字だけ） ---------- */
  function people(ref) {
    if (!ref.list.length) {
      return '<div class="card">' + U.empty('users', '紹介した方はまだいません。入会されると、ここに頭文字で表示されます。') + '</div>';
    }
    var list = ref.list.slice().sort(function (a, b) { return new Date(b.joinedAt) - new Date(a.joinedAt); });
    return '<div class="list">' + list.map(function (r) {
      var active = r.status === 'active';
      // 緑は「できた」の色なので、在籍中は藍（情報）にする
      return '<div class="li">' + U.avatar({ name: r.who.charAt(0), color: 'var(--ink-3)' }, 's') +
        '<span class="li__body"><span class="li__ttl">' + esc(r.who) + '</span>' +
          '<span class="li__sub">' + esc(md(r.joinedAt)) + 'に入会' +
          (r.held && active ? '・報酬は' + esc(md(r.confirmAt)) + 'に確定予定' : '') + '</span></span>' +
        '<span class="tag' + (active ? ' tag-indigo' : '') + '">' + (active ? '在籍中' : '退会') + '</span>' +
      '</div>';
    }).join('') + '</div>';
  }

  /* ---------- 7. 報酬のしくみ ---------- */
  function howCard(ref) {
    var monthly = ref.model === 'monthly';
    var lead = monthly
      ? '紹介した方が会員でいるあいだ、毎月その方の月額の' + Math.round(ref.rate * 100) + '%（' + U.yen(ref.perPerson) + '）をお支払いします。'
      : '紹介した方1名につき、' + U.yen(ref.perPerson) + 'を1回だけお支払いします。';
    return '<section class="card card-pad rf-how">' +
      '<h2 class="h3">報酬のしくみ（仮）</h2>' +
      '<p class="rf-how__lead">' + esc(lead) + '</p>' +
      '<ul class="rf-bullets">' +
        '<li>1段だけです（紹介した方がさらに紹介しても、あなたへの報酬はありません）</li>' +
        '<li>紹介の人数で料率は変わりません</li>' +
        (monthly ? '<li>紹介した方が退会すると、それ以降の報酬はありません</li>' : '') +
        '<li>最低支払額は' + esc(U.yen(ref.minPayout)) + 'です（届かないときは翌月に繰り越します）</li>' +
        '<li>ランキングには関係しません（ランキングは貢献ポイントと学びのXPだけで決まります）</li>' +
      '</ul>' +
      '<p class="rf-how__tax">報酬は、所得として確定申告が必要になることがあります。提携の税理士に相談できます（初回30分無料）。' +
        '<a href="#/perks">専門家に相談する</a></p>' +
    '</section>';
  }

  /* ---------- 8. 紹介のルール（いつも見せる） ---------- */
  function rulesCard() {
    return '<section class="card card-pad rf-rules">' +
      '<h2 class="h3 rf-rules__ttl">' + icon('shield') + '紹介のルール</h2>' +
      '<p class="sub">紹介するときに守っていただくことです。</p>' +
      '<ul class="rf-rules__list">' + RULES.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' +
      '<p class="rf-rules__warn">' + icon('info', 'ico-s') + '<span>守られなかった場合、報酬はお支払いできません。</span></p>' +
      '<p class="xsmall muted rf-rules__ask">伝え方に迷ったら、<a href="#/messages">運営に相談</a>できます。</p>' +
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
        '<p class="sub">会って紹介するときに、相手のスマホで読み取ってもらうためのものです。</p>' +
        '<div class="rf-qr">' + qrSvg(ref.url) + '</div>' +
        '<p class="rf-qr__url mono">' + esc(ref.url) + '</p>' +
        '<p class="proto-note rf-qr__note">試作版の見た目だけ。読み取れません</p>' +
        '<div class="modal__foot"><button class="btn btn-soft" data-close>閉じる</button>' +
          '<button class="btn btn-ink" data-qr-copy>' + icon('copy', 'ico-s') + 'リンクをコピー</button></div>' +
      '</div>');
    m.querySelector('[data-qr-copy]').addEventListener('click', function () {
      copy(ref.url, '紹介リンクをコピーしました');
    });
  }

  /* ---------- 窓：振込先 ----------
     口座の情報は、試作版ではどこにも保存しない（state にも localStorage にも入れない）。 */
  function field(label, control, note) {
    return '<label class="field"><span>' + esc(label) + '</span>' + control + (note ? '<small>' + esc(note) + '</small>' : '') + '</label>';
  }
  function bankModal() {
    var m = U.modal(
      '<div class="scr-referral">' +
        '<h3 class="modal__ttl">振込先の登録</h3>' +
        '<p class="sub">確定した報酬をお振り込みする口座です。ご本人名義の口座を登録してください。</p>' +
        '<div class="notice rf-bank-note">' + icon('shield') + '<div>試作版では、入力した内容は保存しません。</div></div>' +
        '<form class="rf-bank-form" autocomplete="off" novalidate>' +
          field('金融機関名', '<input class="input" autocomplete="off" placeholder="例：〇〇銀行">') +
          '<div class="rf-bank-2">' +
            field('支店名', '<input class="input" autocomplete="off" placeholder="例：〇〇支店">') +
            field('口座の種類', '<select class="select"><option>普通</option><option>当座</option></select>') +
          '</div>' +
          field('口座番号', '<input class="input" autocomplete="off" inputmode="numeric" maxlength="7" placeholder="7桁の数字">') +
          field('口座名義（カタカナ）', '<input class="input" autocomplete="off" placeholder="例：ヤマダ ハナコ">', '通帳やキャッシュカードに書かれているとおりに入力してください。') +
          field('インボイス登録番号（任意）', '<input class="input" autocomplete="off" maxlength="14" placeholder="T から始まる13桁">', '適格請求書発行事業者の方だけ。お持ちでなければ空欄のままで大丈夫です。') +
          '<div class="modal__foot"><button type="button" class="btn btn-soft" data-close>やめる</button>' +
            '<button type="submit" class="btn btn-ink">登録する</button></div>' +
        '</form>' +
      '</div>');
    m.querySelector('form').addEventListener('submit', function (e) {
      e.preventDefault();
      e.target.reset();
      m.close();
      U.toast('試作版では保存しません。本番では決済サービス側で安全に保管します');
    });
  }

  /* ---------- 明細のCSV ---------- */
  function csv(ref) {
    function cell(v) { return '"' + String(v).replace(/"/g, '""') + '"'; }
    var lines = [['対象', '発生日', '金額（円）', '状態', '確定予定'].map(cell).join(',')].concat(ref.rows.map(function (x) {
      return [x.who, ymd(x.at), x.amount, x.label, x.status === 'hold' ? ymd(x.confirmAt) : ''].map(cell).join(',');
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
          '<p class="page-lead">この場所が合いそうな人に、紹介できます。紹介は入会の条件ではなく、収入を約束するものでもありません。</p></div>' +
        (ref.list.length ? '' :
          '<div class="notice rf-first">' + icon('info') + '<div>紹介は急がなくて大丈夫です。まずはご自身で講座やイベントを使ってみて、合いそうな人が思い浮かんだときに使ってください。</div></div>') +
        linkCard(ref) +
        stats(ref) +
        '<div class="sec"><p class="sec-ttl">報酬の受け取り</p>' + payCard(ref) + '</div>' +
        '<div class="sec"><p class="sec-ttl">報酬が支払われるまで</p>' + flow(ref) + '</div>' +
        '<div class="sec">' + rowsCard(ref) + '</div>' +
        '<div class="sec"><p class="sec-ttl">紹介した人<span class="rf-sec-note">お名前は頭文字だけ表示しています</span></p>' + people(ref) + '</div>' +
        '<div class="sec grid-2 rf-pair">' + howCard(ref) + rulesCard() + '</div>' +
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
        else if (act === 'copy-text') copy(ref.shareText, '文面をコピーしました（#PR 入り）');
        else if (act === 'line') U.toast('本番ではLINEの送信画面が開き、この文面が入った状態で送る相手を選べます');
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
