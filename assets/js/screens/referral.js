/* ============================================================
   紹介（#/referral）。報酬の受け取り・明細もこの画面の中（決定事項：メニューの名前は「紹介」）
   ------------------------------------------------------------
   法律まわりでいちばん気をつける画面（docs/参考調査メモ.md §3）。
   - 数字は R.referral() / R.rewardRows() / R.gigReward() からだけ取る。画面で計算し直さない
   - 収入を約束する言い方をしない。ランキング・ほかの会員のお金は出さない
   - 紹介した相手は頭文字だけ
   - 振込先は R.setBank で保存する（口座番号は下4桁だけ。全部は本番の振込の側で持つ）。案件の報酬も同じ口座
   - 文章は docs/脱AIの約束.md に合わせて短く。UIの説明・図解・飾りの記号は置かない
   - ?focus=bank で来たら振込先の行へ（案件の画面・お知らせから）。?focus=rows は明細へ
   - 明細の状態（保留 → 確定 → 支払予定 → 支払済）は domain.js が決める。運営画面の月末の締め（R.closeMonth）で「支払予定」、
     支払い（R.payMonth）で「支払済」になる。報酬の受け取りの表は、明細と同じ言葉で「支払予定（振込の日ごと）」「確定」を分けて出す。
     振込先がないまま支払日を過ぎた行・最低額に届かない行は、支払予定のまま次の支払日へ（carried・note）。取消（R.voidReward・
     30日以内の退会）は voidReason。どちらも明細の行の下（狭い幅は2段目の続き）に書く（rowNote）。
     別のタブで進んだとき（確定・支払予定・支払済・取消・繰り越し）は、その行に短く色を付けて一言で知らせる（noticeRows）
   - 紹介のルールの条は公開サイトの index.html#/terms?art=7（その条へ送られる）
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon;
  var cur = null;                                   // mount で受け取った ctx

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
  function day(d) { return U.fmtDate(d, { noYear: true }); }        // 詳細・支払いの行：9月26日(土)
  function ymd(d) { d = new Date(d); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /** 保留中の明細のうち、いちばん早い確定日（なければ null）。毎月の分も入る。
      退会した方の分は domain.js が「取消」にするので、ここには入らない */
  function firstConfirm(ref) {
    var t = null;
    ref.rows.forEach(function (x) {
      if (x.status !== 'hold') return;
      var c = new Date(x.confirmAt).getTime();
      if (t === null || c < t) t = c;
    });
    return t === null ? null : new Date(t);
  }
  /** 完了した案件の報酬（R.gigReward）。振込先が要るかどうかと、支払調書に使う */
  function gigRewards() {
    var gigs = (CLG.store.state && CLG.store.state.gigs) || {};
    return Object.keys(gigs).map(function (id) {
      var rw = R.gigReward(id), g = R.gig(id);
      return rw && g ? { id: id, title: g.title, amount: rw.amount, status: rw.status, payAt: rw.payAt, needBank: rw.needBank } : null;
    }).filter(Boolean);
  }

  /* ---------- QRコード（スマホのカメラで読める本物） ----------
     Project Nayuki の QR Code generator（MIT ライセンス）と同じ手順を、ここで使う分だけ短く書いたもの。
     文字は UTF-8 のバイトで入れ、誤り訂正は M（15%まで汚れても読める）。版（大きさ）は文字数から決め、
     8つのマスクのうち減点がいちばん少ないものを選ぶ。返すのは true（黒）/ false（白）の2次元配列。 */
  var QR = (function () {
    // 版ごとの「1ブロックの誤り訂正の語数」と「ブロックの数」（誤り訂正 M の列だけ）
    var ECC = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
    var BLK = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];
    function bit(x, i) { return ((x >>> i) & 1) !== 0; }
    function rawModules(v) {
      var r = (16 * v + 128) * v + 64;
      if (v >= 2) { var n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; }
      return r;
    }
    function dataWords(v) { return Math.floor(rawModules(v) / 8) - ECC[v] * BLK[v]; }
    function mul(x, y) {
      var z = 0;
      for (var i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; }
      return z;
    }
    function divisor(deg) {
      var r = [], i, j, root = 1;
      for (i = 0; i < deg - 1; i++) r.push(0);
      r.push(1);
      for (i = 0; i < deg; i++) {
        for (j = 0; j < r.length; j++) { r[j] = mul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
        root = mul(root, 2);
      }
      return r;
    }
    function remainder(data, div) {
      var r = div.map(function () { return 0; });
      data.forEach(function (b) {
        var f = b ^ r.shift();
        r.push(0);
        div.forEach(function (c, i) { r[i] ^= mul(c, f); });
      });
      return r;
    }

    function make(text) {
      var s = unescape(encodeURIComponent(String(text))), bytes = [], i, j, v, cc, cap;
      for (i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i));
      for (v = 1; v <= 40; v++) { cc = v < 10 ? 8 : 16; cap = dataWords(v) * 8; if (4 + cc + bytes.length * 8 <= cap) break; }
      if (v > 40) return null;

      // 1) データの並び（バイトのモード → 文字数 → 中身 → 終わりの印 → 埋め草）
      var bb = [];
      function put(val, len) { for (var k = len - 1; k >= 0; k--) bb.push((val >>> k) & 1); }
      put(4, 4); put(bytes.length, cc);
      bytes.forEach(function (b) { put(b, 8); });
      put(0, Math.min(4, cap - bb.length));
      put(0, (8 - bb.length % 8) % 8);
      for (var pad = 0xEC; bb.length < cap; pad ^= 0xEC ^ 0x11) put(pad, 8);
      var data = [];
      for (i = 0; i < bb.length; i += 8) { var w = 0; for (j = 0; j < 8; j++) w = (w << 1) | bb[i + j]; data.push(w); }

      // 2) ブロックに分けて誤り訂正の語を足し、互い違いに並べる
      var nb = BLK[v], ne = ECC[v], raw = Math.floor(rawModules(v) / 8);
      var nShort = nb - raw % nb, shortLen = Math.floor(raw / nb), div = divisor(ne), blocks = [], k = 0;
      for (i = 0; i < nb; i++) {
        var d = data.slice(k, k + shortLen - ne + (i < nShort ? 0 : 1));
        k += d.length;
        var e = remainder(d, div);
        if (i < nShort) d.push(0);
        blocks.push(d.concat(e));
      }
      var words = [];
      for (i = 0; i < blocks[0].length; i++) {
        for (j = 0; j < blocks.length; j++) if (i !== shortLen - ne || j >= nShort) words.push(blocks[j][i]);
      }

      // 3) 目印（角の四角・点線・位置合わせ・形式と版の情報）を置く
      var size = v * 4 + 17, m = [], fn = [];
      for (i = 0; i < size; i++) { m.push([]); fn.push([]); for (j = 0; j < size; j++) { m[i].push(false); fn[i].push(false); } }
      function setF(x, y, dark) { m[y][x] = dark; fn[y][x] = true; }
      for (i = 0; i < size; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
      function finder(x, y) {
        for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
          var dist = Math.max(Math.abs(dx), Math.abs(dy)), xx = x + dx, yy = y + dy;
          if (xx >= 0 && xx < size && yy >= 0 && yy < size) setF(xx, yy, dist !== 2 && dist !== 4);
        }
      }
      finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
      if (v > 1) {
        var na = Math.floor(v / 7) + 2, step = Math.floor((v * 8 + na * 3 + 5) / (na * 4 - 4)) * 2, pos = [6];
        for (var p = size - 7; pos.length < na; p -= step) pos.splice(1, 0, p);
        for (i = 0; i < na; i++) for (j = 0; j < na; j++) {
          if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue;
          for (var ay = -2; ay <= 2; ay++) for (var ax = -2; ax <= 2; ax++) setF(pos[i] + ax, pos[j] + ay, Math.max(Math.abs(ax), Math.abs(ay)) !== 1);
        }
      }
      function format(mask) {
        var dt = mask, r = dt;                     // 誤り訂正 M の印は 0
        for (var q = 0; q < 10; q++) r = (r << 1) ^ ((r >>> 9) * 0x537);
        var bits = ((dt << 10) | r) ^ 0x5412, t;
        for (t = 0; t <= 5; t++) setF(8, t, bit(bits, t));
        setF(8, 7, bit(bits, 6)); setF(8, 8, bit(bits, 7)); setF(7, 8, bit(bits, 8));
        for (t = 9; t < 15; t++) setF(14 - t, 8, bit(bits, t));
        for (t = 0; t < 8; t++) setF(size - 1 - t, 8, bit(bits, t));
        for (t = 8; t < 15; t++) setF(8, size - 15 + t, bit(bits, t));
        setF(8, size - 8, true);
      }
      format(0);
      if (v >= 7) {
        var vr = v;
        for (i = 0; i < 12; i++) vr = (vr << 1) ^ ((vr >>> 11) * 0x1F25);
        var vb = (v << 12) | vr;
        for (i = 0; i < 18; i++) { var a = size - 11 + i % 3, b = Math.floor(i / 3), on = bit(vb, i); setF(a, b, on); setF(b, a, on); }
      }

      // 4) データを右下から2列ずつ、上下に折り返して置く
      k = 0;
      for (var right = size - 1; right >= 1; right -= 2) {
        if (right === 6) right = 5;
        for (var vert = 0; vert < size; vert++) {
          for (j = 0; j < 2; j++) {
            var x = right - j, y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
            if (!fn[y][x] && k < words.length * 8) { m[y][x] = bit(words[k >>> 3], 7 - (k & 7)); k++; }
          }
        }
      }

      // 5) マスク：8通り試して、読み取りにくい模様（同じ色の長い並び・2x2の塊・角の目印に似た並び・白黒の偏り）が少ないものを使う
      function flip(mask) {
        for (var yy = 0; yy < size; yy++) for (var xx = 0; xx < size; xx++) {
          if (fn[yy][xx]) continue;
          var inv;
          switch (mask) {
            case 0: inv = (xx + yy) % 2 === 0; break;
            case 1: inv = yy % 2 === 0; break;
            case 2: inv = xx % 3 === 0; break;
            case 3: inv = (xx + yy) % 3 === 0; break;
            case 4: inv = (Math.floor(xx / 3) + Math.floor(yy / 2)) % 2 === 0; break;
            case 5: inv = xx * yy % 2 + xx * yy % 3 === 0; break;
            case 6: inv = (xx * yy % 2 + xx * yy % 3) % 2 === 0; break;
            default: inv = ((xx + yy) % 2 + xx * yy % 3) % 2 === 0;
          }
          if (inv) m[yy][xx] = !m[yy][xx];
        }
      }
      function addHist(run, h) { if (h[0] === 0) run += size; h.pop(); h.unshift(run); }
      function countPat(h) {
        var n = h[1], core = n > 0 && h[2] === n && h[3] === n * 3 && h[4] === n && h[5] === n;
        return (core && h[0] >= n * 4 && h[6] >= n ? 1 : 0) + (core && h[6] >= n * 4 && h[0] >= n ? 1 : 0);
      }
      function endCount(color, run, h) { if (color) { addHist(run, h); run = 0; } run += size; addHist(run, h); return countPat(h); }
      function penalty() {
        var score = 0, a, b, dark = 0;
        for (var pass = 0; pass < 2; pass++) {
          for (a = 0; a < size; a++) {
            var color = false, run = 0, h = [0, 0, 0, 0, 0, 0, 0];
            for (b = 0; b < size; b++) {
              var c = pass === 0 ? m[a][b] : m[b][a];
              if (c === color) { run++; if (run === 5) score += 3; else if (run > 5) score++; }
              else { addHist(run, h); if (!color) score += countPat(h) * 40; color = c; run = 1; }
            }
            score += endCount(color, run, h) * 40;
          }
        }
        for (a = 0; a < size - 1; a++) for (b = 0; b < size - 1; b++) {
          var c2 = m[a][b];
          if (c2 === m[a][b + 1] && c2 === m[a + 1][b] && c2 === m[a + 1][b + 1]) score += 3;
        }
        for (a = 0; a < size; a++) for (b = 0; b < size; b++) if (m[a][b]) dark++;
        var total = size * size;
        score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
        return score;
      }
      var best = 0, min = Infinity;
      for (i = 0; i < 8; i++) {
        flip(i); format(i);
        var pe = penalty();
        if (pe < min) { min = pe; best = i; }
        flip(i);
      }
      flip(best); format(best);
      return m;
    }
    return { make: make };
  })();

  /** 画面に出すQR（SVG）。まわりの白（2マス分）も含める。横に続く黒は1本の四角にまとめて軽くする */
  function qrSvg(text) {
    var m = QR.make(text);
    if (!m) return '';
    var n = m.length, q = 2, S = n + q * 2, d = '';
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        if (!m[y][x]) continue;
        var run = 1;
        while (x + run < n && m[y][x + run]) run++;
        d += 'M' + (x + q) + ' ' + (y + q) + 'h' + run + 'v1h-' + run + 'z';
        x += run - 1;
      }
    }
    return '<svg viewBox="0 0 ' + S + ' ' + S + '" role="img" aria-label="紹介リンクのQRコード" shape-rendering="crispEdges">' +
      '<rect width="' + S + '" height="' + S + '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
  }
  /** 印刷やチラシに使えるよう、大きめのPNGで保存する（まわりの白は規格どおり4マス） */
  function saveQr(ref) {
    var m = QR.make(ref.url);
    if (!m || !document.createElement) return;
    var n = m.length, q = 4, s = 12, c = document.createElement('canvas');
    c.width = c.height = (n + q * 2) * s;
    var g = c.getContext && c.getContext('2d');
    if (!g) { U.toast('この端末では画像を作れませんでした', 'error'); return; }
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#000';
    m.forEach(function (row, y) { row.forEach(function (on, x) { if (on) g.fillRect((x + q) * s, (y + q) * s, s, s); }); });
    var name = DATA.SITE.name + '_紹介QR_' + ref.code + '.png';
    function fire(url) {
      var a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
    }
    if (c.toBlob) {
      c.toBlob(function (blob) {
        if (!blob) { fire(c.toDataURL('image/png')); return; }
        var u = URL.createObjectURL(blob); fire(u);
        setTimeout(function () { URL.revokeObjectURL(u); }, 1000);
      }, 'image/png');
    } else fire(c.toDataURL('image/png'));
    U.toast('QRコードを画像で保存しました', 'ok');
  }

  /* ---------- 紹介リンク・コード・紹介文・QR ---------- */
  function canShare() { return typeof navigator !== 'undefined' && !!navigator.share; }
  function linkCard(ref) {
    var line = 'https://line.me/R/share?text=' + encodeURIComponent(ref.shareText);
    return '<section class="card rf-link" aria-labelledby="rfLinkTtl">' +
      '<div class="rf-link__main">' +
        '<h2 class="h3" id="rfLinkTtl">紹介リンク</h2>' +
        '<div class="rf-url">' +
          '<span class="rf-url__text mono" title="' + esc(ref.url) + '">' + esc(ref.url) + '</span>' +
          '<button type="button" class="btn btn-ink btn-s" data-rf-copy="url" aria-label="紹介リンクをコピー">' + icon('copy', 'ico-s') + 'コピー</button>' +
        '</div>' +
        '<div class="rf-code">' +
          '<span>紹介コード <b class="mono">' + esc(ref.code) + '</b></span>' +
          '<button type="button" class="btn btn-text" data-rf-copy="code" aria-label="紹介コードをコピー">コピー</button>' +
        '</div>' +
        '<label class="field rf-text"><span>紹介文</span>' +
          '<textarea class="textarea rf-share" readonly rows="5" data-rf-select>' + esc(ref.shareText) + '</textarea>' +
        '</label>' +
        '<p class="rf-pr">先頭の #PR は消さないでください（ステマ規制のため）。</p>' +
      '</div>' +
      '<div class="rf-link__side">' +
        '<div class="rf-qr">' + qrSvg(ref.url) + '</div>' +
        '<div class="rf-acts">' +
          '<button type="button" class="btn btn-ghost btn-s" data-rf-qr="save">' + icon('download', 'ico-s') + 'QRを保存</button>' +
          '<button type="button" class="btn btn-ghost btn-s" data-rf-copy="text">' + icon('copy', 'ico-s') + '文面をコピー</button>' +
          '<a class="btn btn-ghost btn-s" href="' + esc(line) + '" target="_blank" rel="noopener">' + icon('line', 'ico-s') + 'LINEで送る</a>' +
          (canShare() ? '<button type="button" class="btn btn-ghost btn-s" data-rf-share="text">' + icon('share', 'ico-s') + '共有する</button>' : '') +
        '</div>' +
      '</div>' +
    '</section>';
  }

  /* ---------- 本人の記録 ---------- */
  function stat(label, value, unit) {
    // 「在籍中（紹介した人）」が狭い幅で「（紹介した／人）」と割れないよう、かっこの中はまとめて折る
    var dt = esc(label).replace(/（[^（）]+）/g, function (m) { return '<span class="nw">' + m + '</span>'; });
    return '<div><dt>' + dt + '</dt><dd>' + value + (unit ? '<small>' + esc(unit) + '</small>' : '') + '</dd></div>';
  }
  function stats(ref) {
    return '<div class="card rf-stats"><dl class="stats">' +
      stat('30日のクリック', '<span class="num">' + U.num(ref.clicks) + '</span>', '回') +
      stat('30日の入会', '<span class="num">' + U.num(ref.recent) + '</span>', '人') +
      stat('在籍中（紹介した人）', '<span class="num">' + U.num(ref.active) + '</span>', '人') +
      stat('保留中の報酬', '<span class="num">' + esc(U.yen(ref.held)) + '</span>', '') +
    '</dl></div>';
  }

  /* ---------- 報酬の受け取り（キー：値の表） ---------- */
  function statementYear(ref) {
    var y = CLG.now().getFullYear();
    var n = ref.rows.filter(function (x) { return x.status === 'paid' && new Date(x.paidAt || x.payAt).getFullYear() === y; }).length +
      gigRewards().filter(function (x) { return x.status === 'paid' && new Date(x.payAt).getFullYear() === y; }).length;
    return n ? y : 0;
  }
  /** 明細を状態ごとに足したもの。額は R.referral().rows の金額を足すだけ（行の状態は domain.js が決める）。
      支払予定（運営が月末に締めた分）は振込日ごとにまとめる：[{ at, amount, note }]。
      note は最低額に届かず翌月へ回した行の断り（振込先がないための繰り越しは、振込先の行で分かるので入れない） */
  function byStatus(ref) {
    var out = { confirmed: 0, scheduled: 0, dates: [] }, seen = {};
    ref.rows.forEach(function (x) {
      if (x.status === 'confirmed') out.confirmed += x.amount;
      if (x.status !== 'scheduled') return;
      out.scheduled += x.amount;
      var k = ymd(x.payAt);
      if (!seen[k]) { seen[k] = { at: x.payAt, amount: 0, note: '' }; out.dates.push(seen[k]); }
      seen[k].amount += x.amount;
      if (x.carried && x.note && !/振込先/.test(x.note) && !seen[k].note) seen[k].note = x.note;
    });
    out.dates.sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
    return out;
  }
  function payCard(ref) {
    var first = firstConfirm(ref), b = ref.bank || R.bank(), sum = byStatus(ref);
    var gigNeed = gigRewards().some(function (x) { return x.status !== 'paid'; });
    var owed = ref.held + ref.confirmed > 0 || gigNeed;
    var rows = [];
    // 支払予定：運営が月末に締めた分。振込の日と額が決まっている（R.closeMonth）
    if (sum.scheduled > 0) {
      // 振込先がないと運営は振り込めない（支払日を過ぎても支払予定のまま、次の支払日へ繰り越す）ので、
      // 登録すればその日に振り込む、と書く。最低額に届かず翌月へ回した分は、その断りを添える
      rows.push(['支払予定', sum.dates.map(function (d) {
        var when = b ? day(d.at) + 'に振込' + (d.note ? '（' + d.note + '）' : '') : '振込先を登録すると、' + day(d.at) + 'に振込';
        return '<span class="rf-kv__line"><b class="num">' + esc(U.yen(d.amount)) + '</b>' +
          '<span class="rf-kv__note">' + esc(when) + '</span></span>';
      }).join('')]);
    }
    // 確定：保留の期間が過ぎて、まだ締めていない分（明細の「確定」と同じ言葉）。支払予定があって確定が0円なら行を出さない
    if (sum.confirmed > 0 || !sum.scheduled) {
      var conf = '<b class="num">' + esc(U.yen(sum.confirmed)) + '</b>';
      if (sum.confirmed > 0 && ref.confirmed < ref.minPayout) {
        conf += '<span class="rf-kv__note">' + esc(U.yen(ref.minPayout)) + '未満のため翌月に繰り越し</span>';
      }
      rows.push(['確定', conf]);
    }
    // 確定した分があるときだけ日付を出す（0円で日付だけあると「この日に入る」と読めてしまう）。
    // 支払予定があるときは、その行に振込の日が書いてあるので出さない
    if (!sum.scheduled && ref.confirmed >= ref.minPayout && ref.payDate) {
      rows.push(['次の振込', esc(day(ref.payDate)) + '（予定）']);
    } else if (first) {
      // 保留中は取消になることもあるので、条件を添える
      rows.push(['次の確定', esc(day(first)) + '（返金・解約がなければ）']);
    }
    rows.push(['締め・支払日', esc(ref.closeLabel)]);
    if (ref.paid > 0 || ref.rows.length) rows.push(['受け取り済み', '<span class="num">' + esc(U.yen(ref.paid)) + '</span>']);
    rows.push(['振込先', b
      ? '<span class="rf-bank"><span class="rf-bank__acct">' + esc(b.masked) + '</span>' +
          '<button type="button" class="btn btn-text btn-s" data-rf-bank="acct" aria-label="振込先を変更する">変更する</button></span>'
      : '<span class="rf-bank"><span class="rf-bank__none' + (owed ? ' is-warn' : '') + '">未登録</span>' +
          '<button type="button" class="btn btn-s ' + (owed ? 'btn-primary' : 'btn-ghost') + '" data-rf-bank="acct" aria-label="振込先を登録する">登録する</button></span>',
      'rfBank']);
    var y = statementYear(ref);
    if (y) {
      rows.push(['支払調書', '<button type="button" class="btn btn-text btn-s rf-dl" data-rf-statement="' + y + '">' +
        icon('download', 'ico-s') + y + '年分を保存</button>']);
    }
    return '<section class="card card-pad rf-pay" aria-labelledby="rfPayTtl">' +
      '<h2 class="h3" id="rfPayTtl">報酬の受け取り</h2>' +
      '<table class="kv rf-kv"><tbody>' + rows.map(function (r) {
        return '<tr' + (r[2] ? ' id="' + r[2] + '" tabindex="-1"' : '') + '><th scope="row">' + esc(r[0]) + '</th><td>' + r[1] + '</td></tr>';
      }).join('') + '</tbody></table>' +
    '</section>';
  }

  /* ---------- 明細 ----------
     広い幅は表。狭い幅（本文が440px以下）では1行を2段のかたまりにする：
       O.さん・3,000円          保留
       9/19(土)発生 → 10/19(月)確定予定
     2段目は狭い幅だけで出す td（広い幅では隠す）。表の列は広い幅だけで出す */
  function flowText(x) {
    var at = U.fmtShort(x.at) + '発生';
    if (x.status === 'void') return at + ' → ' + (x.voidAt ? U.fmtShort(x.voidAt) : '') + '取消';
    if (x.status === 'hold') return at + ' → ' + U.fmtShort(x.confirmAt) + '確定予定';
    if (x.status === 'confirmed') return at + ' → ' + U.fmtShort(x.confirmAt) + '確定';
    if (x.status === 'scheduled') return at + ' → ' + U.fmtShort(x.payAt) + '支払予定';
    return at + ' → ' + U.fmtShort(x.paidAt || x.payAt) + '支払済';
  }
  /** 行の断り：取消の理由（R.voidReward・30日以内の退会）と、支払日を繰り越した理由（振込先がない・最低額に届かない）。
      広い幅は行の下の1行、狭い幅は2段目の続き */
  function rowNote(x) {
    if (x.status === 'void') return x.voidReason ? '理由：' + x.voidReason : '';
    return x.carried && x.note && x.status !== 'paid' ? x.note : '';
  }
  function rowsCard(ref) {
    var rows = ref.rows;
    var head = '<div class="card-head"><h2 class="h3" id="rfRowsTtl">明細</h2>' +
      (rows.length ? '<button type="button" class="btn btn-text btn-s" data-rf-csv="rows">' + icon('download', 'ico-s') + 'CSVで保存</button>' : '') +
    '</div>';
    if (!rows.length) {
      return '<section class="card rf-rows" aria-labelledby="rfRowsTtl">' + head +
        '<p class="rf-none">' + (ref.list.length ? 'まだ明細はありません。' : 'まだ紹介した方はいません。') + '</p></section>';
    }
    return '<section class="card rf-rows" aria-labelledby="rfRowsTtl">' + head +
      '<div class="tbl-wrap"><table class="tbl rf-tbl"><thead><tr>' +
        '<th scope="col">対象</th><th scope="col">発生日</th><th scope="col" class="r">金額</th><th scope="col">状態</th>' +
        '<th scope="col">確定日</th><th scope="col">支払日</th>' +
      '</tr></thead><tbody>' + rows.map(function (x) {
        var v = x.status === 'void';
        var conf = v ? '—' : esc(U.fmtShort(x.confirmAt)) + (x.status === 'hold' ? '<span class="rf-soon">予定</span>' : '');
        var pay = v || x.status === 'hold' ? '—'
          : x.status === 'paid' ? esc(U.fmtShort(x.paidAt || x.payAt))
          : esc(U.fmtShort(x.payAt)) + '<span class="rf-soon">予定</span>';
        var note = rowNote(x), id = esc(x.id);
        // 断りは広い幅では下の行（列の幅を広げないため）。狭い幅ではその行を隠し、2段目の続きに書く（CSS）
        return '<tr class="rf-row' + (v ? ' is-void' : '') + (note ? ' has-note' : '') + '" data-rf-row="' + id + '">' +
          '<td class="rf-c-who">' + esc(x.who) + '</td>' +
          '<td class="rf-c-at">' + esc(U.fmtShort(x.at)) + '</td>' +
          '<td class="r num rf-c-amt">' + (v ? '<s>' + esc(U.yen(x.amount)) + '</s><span class="sr-only">（取消）</span>' : esc(U.yen(x.amount))) + '</td>' +
          '<td class="rf-c-st">' + U.statusTag(x.status, x.label) + '</td>' +
          '<td class="rf-c-conf">' + conf + '</td>' +
          '<td class="rf-c-pay">' + pay + '</td>' +
          '<td class="rf-c-m">' + esc(flowText(x)) + (note ? '<span class="rf-c-m__note">' + esc(note) + '</span>' : '') + '</td>' +
        '</tr>' +
        (note ? '<tr class="rf-note' + (v ? ' is-void' : '') + '" data-rf-note="' + id + '"><td colspan="6">' + esc(note) + '</td></tr>' : '');
      }).join('') + '</tbody></table></div>' +
    '</section>';
  }

  /* ---------- 紹介した人（頭文字だけ） ---------- */
  function people(ref) {
    if (!ref.list.length) return '';
    var list = ref.list.slice().sort(function (a, b) { return new Date(b.joinedAt) - new Date(a.joinedAt); });
    return '<section class="card rf-people" aria-labelledby="rfPeopleTtl">' +
      '<div class="card-head"><h2 class="h3" id="rfPeopleTtl">紹介した人</h2><span class="rf-count num">' + list.length + '人</span></div>' +
      '<ul class="rf-people__list">' + list.map(function (r) {
        var active = r.status === 'active';
        return '<li>' +
          '<b>' + esc(r.who) + '</b>' +
          '<span class="rf-people__date">' + esc(U.fmtShort(r.joinedAt)) + '入会' +
            (!active && r.leftAt ? '・' + esc(U.fmtShort(r.leftAt)) + '退会' : '') + '</span>' +
          (active ? U.statusTag('active', '在籍中') : U.statusTag('closed', '退会')) +
        '</li>';
      }).join('') + '</ul>' +
    '</section>';
  }

  /* ---------- 報酬のしくみ（試作版の断り書きは下の「試作版メモ」だけ） ---------- */
  function howCard(ref) {
    var monthly = ref.model === 'monthly';
    var lead = monthly
      ? '紹介した方が在籍しているあいだ、毎月その方の月額の' + Math.round(ref.rate * 100) + '%（' + U.yen(ref.perPerson) + '）をお支払いします。'
      : '紹介した方1名につき、' + U.yen(ref.perPerson) + 'を1回だけお支払いします。';
    return '<section class="card card-pad rf-how" aria-labelledby="rfHowTtl">' +
      '<h2 class="h3" id="rfHowTtl">報酬のしくみ</h2>' +
      '<p class="rf-how__lead">' + U.jp(lead) + '</p>' +
      '<ul class="rf-bullets">' +
        '<li>紹介は1段だけです。紹介した方がさらに紹介しても、あなたへの報酬はありません。</li>' +
        '<li>紹介の人数で料率は変わりません。</li>' +
        (monthly ? '<li>紹介した方が退会すると、それ以降の報酬はありません。</li>' : '') +
        '<li>報酬は、紹介した方のお支払いから' + esc(ref.holdDays) + '日間「保留」です。返金・解約がなければ「確定」、あれば「取消」になります。</li>' +
        '<li>確定した分は月末に締めて「支払予定」になり、翌月に振り込みます。</li>' +
        '<li>最低支払額は' + esc(U.yen(ref.minPayout)) + 'です。届かない月は翌月に繰り越します。</li>' +
        '<li>紹介はランキングに関係しません。</li>' +
        '<li>確定申告が必要になることがあります。提携の税理士に相談できます（初回30分無料）。' +
          '<a href="#/perks?tab=experts">専門家の一覧</a></li>' +
      '</ul>' +
    '</section>';
  }

  /* ---------- 紹介のルール（いつも見せる） ---------- */
  function rulesCard() {
    return '<section class="card card-pad rf-rules" aria-labelledby="rfRulesTtl">' +
      '<h2 class="h3" id="rfRulesTtl">紹介のルール</h2>' +
      '<ol class="rf-rules__list">' + RULES.map(function (t) { return '<li>' + U.jp(t) + '</li>'; }).join('') + '</ol>' +
      '<p class="rf-rules__warn">守られなかった場合、報酬はお支払いできません。</p>' +
      '<p class="rf-rules__ask"><a href="index.html#/terms?art=7" target="_blank" rel="noopener">利用規約 第7条（紹介のルール）' +
        icon('external', 'ico-s') + '<span class="sr-only">（新しいタブで開きます）</span></a></p>' +
      '<p class="rf-rules__ask">分からないことは<a href="#/messages">運営に相談</a>してください。</p>' +
    '</section>';
  }

  /* ---------- 窓：振込先（紹介と案件の報酬で同じ口座） ----------
     案件の画面（gigs.js）からも CLG.screens.referral.openBank() で開く。 */
  function field(label, control, o) {
    o = o || {};
    return '<label class="field' + (o.cls ? ' ' + o.cls : '') + '"><span>' + esc(label) + (o.opt ? '<span class="opt">任意</span>' : '') + '</span>' +
      control + (o.hint ? '<small>' + esc(o.hint) + '</small>' : '') + '</label>';
  }
  function openBank(opts) {
    opts = opts || {};
    var b = R.bank(), fid = 'rfBankForm';
    function v(k) { return b && b[k] ? ' value="' + esc(b[k]) + '"' : ''; }
    var kind = b && b.kind === '当座' ? '当座' : '普通';
    var m = U.modal(
      '<p class="rf-bank-lead">紹介と案件の報酬を、この口座に振り込みます。本人名義の口座を登録してください。</p>' +
      (b ? '<p class="rf-bank-now">いまの口座：' + esc(b.masked) + '</p>' : '') +
      '<form class="rf-bank-form" id="' + fid + '" autocomplete="off" novalidate>' +
        field('金融機関名', '<input class="input" name="bank" required autocomplete="off" maxlength="30" placeholder="例：北洋銀行"' + v('bank') + '>') +
        '<div class="rf-bank-2">' +
          field('支店名', '<input class="input" name="branch" required autocomplete="off" maxlength="30" placeholder="例：旭川中央支店"' + v('branch') + '>') +
          field('種類', '<select class="select" name="kind" required><option' + (kind === '普通' ? ' selected' : '') + '>普通</option>' +
            '<option' + (kind === '当座' ? ' selected' : '') + '>当座</option></select>') +
        '</div>' +
        field('口座番号', '<input class="input num" name="number" required autocomplete="off" inputmode="numeric" maxlength="8" placeholder="1234567">',
          { hint: b ? '7桁の数字。変えないときも、もう一度入れてください' : '7桁の数字（6桁以下なら頭に0を付けます）' }) +
        field('口座名義（カタカナ）', '<input class="input" name="holder" required autocomplete="off" maxlength="40" placeholder="例：ヤマダ ハナコ"' + v('holder') + '>') +
        field('インボイス登録番号', '<input class="input" name="invoiceNo" autocomplete="off" maxlength="16" placeholder="T から始まる13桁"' + v('invoiceNo') + '>', { opt: true }) +
      '</form>',
      { title: b ? '振込先を変える' : '振込先の登録', cls: 'scr-referral', dirty: true,
        foot: '<button type="button" class="btn btn-soft" data-close>やめる</button>' +
          '<button type="submit" class="btn btn-primary" form="' + fid + '">' + (b ? '変更する' : '登録する') + '</button>' });
    var form = m.querySelector('form');
    U.fieldErrors(form, {}, { focus: false });            // 必須の札だけ先に付ける
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = {};
      ['bank', 'branch', 'kind', 'number', 'holder', 'invoiceNo'].forEach(function (k) { data[k] = form.elements[k].value; });
      var res = R.setBank(data);
      if (!res.ok) {
        // 直った欄の誤りは消す（fieldErrors は渡した欄だけ書き換える）
        var errs = { bank: '', branch: '', kind: '', number: '', holder: '', invoiceNo: '' };
        Object.keys(res.errors || {}).forEach(function (k) { errs[k] = res.errors[k]; });
        U.fieldErrors(form, errs);
        return;
      }
      m.close();
      U.toast(b ? '振込先を変更しました' : '振込先を登録しました', 'ok');
      CLG.app.refresh();
      if (opts.onSaved) opts.onSaved(res.bank);
    });
    return m;
  }

  /* ---------- 明細のCSV・支払調書 ---------- */
  function cell(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
  function csv(ref) {
    var lines = [['対象', '発生日', '金額（円）', '状態', '確定日', '支払日', '備考'].map(cell).join(',')].concat(ref.rows.map(function (x) {
      var v = x.status === 'void';
      return [x.who, ymd(x.at), x.amount, x.label, v ? '' : ymd(x.confirmAt),
        v || x.status === 'hold' ? '' : ymd(x.paidAt || x.payAt), rowNote(x)].map(cell).join(',');
    }));
    U.download('紹介報酬の明細_' + ymd(CLG.now()) + '.csv', lines.join('\r\n'), 'text/csv');
    U.toast('明細をCSVで保存しました', 'ok');
  }
  /** 支払調書（その年に支払った紹介報酬と案件の報酬）。試作版は形の見本（本番は年明けにPDFで出す） */
  function statement(ref, year) {
    var me = R.me(), rows = [];
    ref.rows.forEach(function (x) {
      var at = x.paidAt || x.payAt;
      if (x.status === 'paid' && new Date(at).getFullYear() === year) rows.push(['紹介報酬', ymd(at), x.who + 'の紹介（' + ymd(x.at) + '発生）', x.amount]);
    });
    gigRewards().forEach(function (x) {
      if (x.status === 'paid' && new Date(x.payAt).getFullYear() === year) rows.push(['案件の報酬', ymd(x.payAt), x.title, x.amount]);
    });
    rows.sort(function (a, b) { return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0; });
    var total = rows.reduce(function (a, r) { return a + r[3]; }, 0);
    var lines = [
      [year + '年分 報酬の支払調書（見本）'],
      ['支払を受ける者', me.name + '（会員番号 ' + me.id + '）'],
      ['支払者', DATA.SITE.company],
      ['作成日', ymd(CLG.now())],
      [],
      ['区分', '支払日', '内容', '支払金額（円）', '源泉徴収税額（円）']
    ].concat(rows.map(function (r) { return r.concat([0]); })).concat([['合計', '', '', total, 0]]);
    U.download('支払調書_' + year + '年分.csv', lines.map(function (l) { return l.map(cell).join(','); }).join('\r\n'), 'text/csv');
    U.toast(year + '年分の支払調書を保存しました', 'ok');
  }

  function copy(text, msg) {
    U.copyText(text).then(function () { U.toast(msg, 'ok'); });
  }

  /* ---------- 別のタブ（運営画面）で明細が進んだとき ----------
     運営が確定・月末の締め（R.closeMonth）・支払い（R.payMonth）をすると、この画面は描き直される（storage のイベント）。
     同じ画面の描き直しで明細の状態が先へ進んでいたら、その行に短く色を付け、一言の知らせ（読み上げも）で額を言う。
     戻る向き（デモを最初に戻した など）と、画面に来たとき・見る人を切り替えたときは黙って覚え直す */
  var STEP = { hold: 1, confirmed: 2, scheduled: 3, paid: 4 };
  var seenRows = {}, shownFor = '';
  function noticeRows(root) {
    var who = R.me().id, ref = R.referral(), prev = seenRows[who], now = {};
    var moved = { confirmed: [], scheduled: [], paid: [], void: [], carried: [] };
    ref.rows.forEach(function (x) {
      var note = x.carried ? x.note || '' : '';
      now[x.id] = { s: x.status, n: note, p: ymd(x.payAt) };
      var was = prev && prev[x.id];
      if (!was) return;
      // 運営の取消（R.voidReward。紹介した方の決済の返金）
      if (x.status === 'void') { if (was.s !== 'void') moved.void.push(x); return; }
      if (x.status === 'paid') { if (was.s !== 'paid') moved.paid.push(x); return; }
      // 支払日を繰り越した（振込先がない・最低額に届かない：R.payMonth）。確定から支払予定に進んだ行でも、
      // 振込先がなくて繰り越した分は「振込」とは言わず、繰り越しとして知らせる
      if (note && (note !== was.n || now[x.id].p !== was.p)) { moved.carried.push(x); return; }
      if (moved[x.status] && (STEP[x.status] || 0) > (STEP[was.s] || 0)) moved[x.status].push(x);
    });
    seenRows[who] = now;
    var same = shownFor === who;
    shownFor = who;
    if (!same || !prev) return;
    function total(list) { return U.yen(list.reduce(function (a, x) { return a + x.amount; }, 0)); }
    var msg = [];
    if (moved.paid.length) msg.push('紹介報酬 ' + total(moved.paid) + 'を振り込みました');
    if (moved.scheduled.length) msg.push('紹介報酬 ' + total(moved.scheduled) + 'が支払予定になりました（' + day(moved.scheduled[0].payAt) + 'に振込）');
    if (moved.confirmed.length) msg.push('紹介報酬 ' + total(moved.confirmed) + 'が確定しました');
    if (moved.carried.length) {
      // 断りの頭（「振込先が未登録のため」「1,000円未満のため」）を理由として添える
      var why = String(moved.carried[0].note || '').split('、')[0];
      msg.push('紹介報酬 ' + total(moved.carried) + 'は' + (why ? why + '、' : '') + day(moved.carried[0].payAt) + 'の支払いに繰り越しました');
    }
    if (moved.void.length) msg.push('紹介報酬 ' + total(moved.void) + 'を取り消しました');
    if (!msg.length) return;
    moved.paid.concat(moved.scheduled, moved.confirmed, moved.carried, moved.void).forEach(function (x) {
      var key = String(x.id).replace(/["\\]/g, '');
      U.$$('.scr-referral [data-rf-row="' + key + '"], .scr-referral [data-rf-note="' + key + '"]', root).forEach(function (tr) {
        tr.classList.add('is-flash');
        setTimeout(function () { tr.classList.remove('is-flash'); }, 2400);
      });
    });
    // 取消・繰り越しは「できた」の印（チェック）を付けない
    U.toast(msg.join('。'), moved.void.length || moved.carried.length ? null : 'ok');
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
    title: '紹介',
    render: function () {
      var ref = R.referral();
      return '<div class="scr-referral">' +
        '<div class="page-head"><h1 class="page-ttl" data-page-title tabindex="-1">紹介</h1>' +
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
    mount: function (root, ctx) {
      cur = ctx;
      fitShare(root.querySelector('.scr-referral .rf-share'));
      if (!resizeBound) {
        resizeBound = true;
        window.addEventListener('resize', function () { fitShare(document.querySelector('.scr-referral .rf-share')); });
        // ほかの画面へ移ったら「同じ画面の描き直し」ではなくなる（戻ってきたときに知らせを出さない）
        window.addEventListener('hashchange', function () { if (!/^#\/referral(\?|$)/.test(location.hash)) shownFor = ''; });
      }
      noticeRows(root);
      // ?focus=bank：振込先の行へ（案件の画面・お知らせから来たとき）
      var fq = ctx && ctx.query && ctx.query.focus;
      if (fq === 'bank' || fq === 'rows') {
        var target = root.querySelector(fq === 'bank' ? '#rfBank' : '.rf-rows');
        if (target) {
          setTimeout(function () {
            // 明細は画面より高くなる（在籍半年の人）ので、見出しが上の帯に隠れないよう頭をそろえる。振込先は1行なので真ん中へ
            U.smoothScroll(target, { block: fq === 'rows' ? 'start' : 'center', focus: true });
            target.classList.add('is-flash');
            setTimeout(function () { target.classList.remove('is-flash'); }, 1600);
          }, 60);
        }
      }
      if (root.__boundReferral) return;               // root（#view）への登録は1回だけ
      root.__boundReferral = true;
      root.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('.scr-referral [data-rf-copy],.scr-referral [data-rf-qr],.scr-referral [data-rf-share],' +
          '.scr-referral [data-rf-bank],.scr-referral [data-rf-csv],.scr-referral [data-rf-statement]');
        if (!b) return;
        var ref = R.referral();
        var what = b.getAttribute('data-rf-copy');
        if (what === 'url') copy(ref.url, '紹介リンクをコピーしました');
        else if (what === 'code') copy(ref.code, '紹介コードをコピーしました');
        else if (what === 'text') copy(ref.shareText, '文面をコピーしました');
        else if (b.hasAttribute('data-rf-qr')) saveQr(ref);
        else if (b.hasAttribute('data-rf-share')) {
          try { navigator.share({ text: ref.shareText }).catch(function () {}); } catch (x) { copy(ref.shareText, '文面をコピーしました'); }
        }
        else if (b.hasAttribute('data-rf-bank')) openBank();
        else if (b.hasAttribute('data-rf-csv')) csv(ref);
        else if (b.hasAttribute('data-rf-statement')) statement(ref, +b.getAttribute('data-rf-statement'));
      });
      // 文面の欄を押したら全体を選ぶ（手でコピーする人のため）
      root.addEventListener('focusin', function (e) {
        if (e.target.closest && e.target.closest('.scr-referral') && e.target.hasAttribute('data-rf-select')) e.target.select();
      });
    },
    openBank: openBank                                // 案件の画面から使う（振込先は紹介と案件で同じ口座）
  };
})();
