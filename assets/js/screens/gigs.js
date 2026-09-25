/* ============================================================
   案件（#/gigs 一覧・#/gigs/<id> くわしく・#/gigs/new 募集を出す）
   ------------------------------------------------------------
   - 報酬はすべて「目安」と書く。収入を約束・断定する言い方はしない。
   - 応募できるかどうかは R.gigLock（レベルと講座の修了）で決まる。画面では判定しない。
   - 種類の絞り込みは #/gigs?type=small のように URL に持つ（戻る・共有で同じ画面になるように）。
     スマホで札が横に流れるときは、選んでいる札が見えるよう列だけを送る（mount）。
   - 一覧は求人サイトの一覧と同じ組み方：題・報酬・「15分・在宅・随時募集・9/23掲載・10/5締切」の1行。札は1行に1つまで。
   - 会員どうしの募集は、運営の確認（R.reviewGig）を通ってから載る。連絡は運営も見える3者のスレッド（R.gigThread）。
     会員どうしのDMは作らない（決定事項）。
   - 振込先は紹介の報酬と同じ口座（R.bank）。登録の窓は紹介の画面のもの（CLG.screens.referral.openBank）を使う。
   - 書きかけ（募集のフォーム・スレッドの返事）はこのファイルの変数に持つ。運営の画面が書き換えて描き直されても消えないように。
   - 応募の進み（応募済み → 面談の調整中 → 稼働中 → 完了 → 報酬確定、見送り）は運営画面の R.advanceGigApp で変わる。
     自分の募集の確認（確認中 → 掲載中・差し戻し）は R.reviewGig。別のタブで進んで同じくわしくの画面が描き直されたときは、
     状態の行に短く色を付け、一言の知らせ（読み上げも）で何が変わったかを言う（noticeChange）。戻る向き（デモを戻したなど）と、
     この画面で自分が変えたとき（selfChange）は知らせない。
     紹介の案件は面談・稼働がないので、札と文を「引き継ぎ済み・商談中・成約」に言い換える（REFER_LABEL。運営画面と同じ言葉）。
     流れの予定の「面談」も「担当者と紹介先の商談」に言い換える（fullHistory）。
   - 自分の募集の「直す」は #/gigs/new?from=<id>（差し戻し・確認中だけ）。R.editGig で同じ募集を直す（2件目は作らない）。
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon;
  var DAY = 86400000;
  var cur = null;                 // mount で受け取った ctx（押したときに使う）
  var draft = null, draftFrom = null, draftWho = null;   // 募集を出すフォームの書きかけ（だれの・どの募集を元にしたか）
  var msgDraft = {};              // スレッドの書きかけ（案件ごと）
  var bannedShown = {};           // 募集のフォームで、禁止の言葉の誤りを出している欄
  var newTried = false;           // 募集のフォームで一度「確認する」を押したか（そのあとは直すたびに誤りを消す）
  var closedOpen = false;         // 「募集終了（直近30日）」を開いているか（絞り込みで描き直しても閉じないように）
  var seenState = {};             // くわしくで最後に見せた状態（会員番号:案件id → 状態のキー）。別のタブで変わったら知らせる
  var lastShown = '';             // 最後に描いたくわしくの画面（会員番号:案件id）。同じ画面の描き直しのときだけ知らせる
  var selfChange = false;         // この画面で自分が変えた（応募・取り消し・掲載を終える・直す）ときは知らせない

  var TYPES = {};
  DATA.GIG_TYPES.forEach(function (t) { TYPES[t.id] = t; });
  var RT = { shot: '1回ごと', stock: '毎月' };
  var PLACEHOLDER = {
    small: '例：平日の21時以降なら作業できます。',
    work: '例：講座を修了しました。平日の夜と土曜の午前に作業できます。',
    peer: '例：市内に住んでいます。土日の午前なら伺えます。'
  };
  /* 紹介できるサービスに手順が書かれていないときの流れ */
  var REFER_STEPS = [
    '紹介先に「担当者から連絡してよいか」の了承をもらう',
    '「担当者につなぐ」から紹介先を知らせる',
    '担当者が商談と契約を行う（同席はいりません）',
    '条件を満たすと報酬が確定'
  ];
  /* 募集のフォームの上に出す、載せられないもの（domain.js の checkBanned と同じ種類） */
  var BANNED_TEXT = '投資・FX・暗号資産、ローン・借入、ノウハウの販売（高額な塾・教材）、収入を保証する書き方、マルチなどの勧誘。';
  var NEW_KEYS = ['title', 'desc', 'reward', 'payment', 'remote', 'place', 'time', 'slots', 'level', 'closesAt', 'agree'];

  /* ---------- 小さな道具 ---------- */
  function typeOf(g) { return TYPES[g.type] || { id: g.type, name: '案件', desc: '' }; }
  function isClosed(g) { return g.status === 'closed' || !!(g.closesAt && new Date(g.closesAt) < CLG.now()); }
  function openGigs(type) { return DATA.GIGS.filter(function (g) { return !isClosed(g) && (!type || g.type === type); }); }
  /** 直近30日に締め切った案件（新しい順） */
  function recentClosed(type) {
    var now = CLG.now();
    return DATA.GIGS_CLOSED.concat(DATA.GIGS.filter(isClosed)).filter(function (g) {
      return (!type || g.type === type) && g.closesAt && (now - new Date(g.closesAt)) / DAY <= 30;
    }).sort(function (a, b) { return new Date(b.closesAt) - new Date(a.closesAt); });
  }
  function levelMin(lv) { var L = DATA.LEVELS.filter(function (x) { return x.lv === lv; })[0]; return L ? L.min : 0; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function md(d) { d = new Date(d); return (d.getMonth() + 1) + '/' + d.getDate(); }        // 一覧の「9/23掲載」
  function day(d) { return U.fmtDate(d, { noYear: true }); }                                 // くわしくの「9月23日(水)」
  function trim(v) { return String(v == null ? '' : v).trim(); }
  function merge(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; for (k in b || {}) o[k] = b[k]; return o; }
  /** 題を出す（U.jp と同じく esc 済み）。短い（…）は途中で折らない：「（月8投稿）」が「（月／8投稿）」と割れないように。
      （…）の中に「・」があれば、そこでだけ折れる（「（日用品・スマホで完結）」が 320px の見出しからはみ出さないように）。
      「・」で分けても長いかたまり（10字以上）は、ふつうの折り方に任せる */
  function jpTitle(t) {
    return String(t == null ? '' : t).split(/(（[^（）]{1,14}）)/).map(function (part) {
      if (!/^（[^（）]{1,14}）$/.test(part)) return U.jp(part);
      var segs = part.split('・');
      return segs.map(function (x, i) {
        var seg = x + (i < segs.length - 1 ? '・' : '');
        return seg.length <= 9 ? '<span class="nw">' + esc(seg) + '</span>' : U.jp(seg);
      }).join('');
    }).join('');
  }
  /** 応募できるものを先に、まだのものを後に（元の並びは保つ） */
  function sorted(list) {
    return list.map(function (g, i) { return { g: g, i: i, l: R.gigLock(g).locked ? 1 : 0 }; })
      .sort(function (a, b) { return a.l - b.l || a.i - b.i; })
      .map(function (x) { return x.g; });
  }
  /* data.js の案件には場所の項目がないものがあるので、「2時間・札幌市内」のような所要時間から場所を分けて出す */
  function timePlace(g) {
    var t = String(g.time || ''), i = t.indexOf('・');
    if (g.place) return { time: t, place: g.place };
    if (!g.remote && i > 0) return { time: t.slice(0, i), place: t.slice(i + 1) };
    return { time: t, place: '' };
  }
  function slotsShort(g) {
    var s = String(g.slots || '');
    if (!s || s === '—') return '';
    if (s === '随時') return '随時募集';
    return /^\d/.test(s) ? '募集' + s : s;
  }
  function slotsLong(g) {
    var s = String(g.slots || '');
    if (!s || s === '—') return '制限なし';
    return s;
  }
  /* 支払いの単位。「1件 500円」「月 24,000円」「（継続中は毎月）」のように報酬の文で分かるときは書かない */
  function rtLabel(g) {
    var rt = RT[g.rewardType] || '', r = String(g.reward || '');
    if (!rt || r.indexOf(rt) >= 0) return '';
    if (g.rewardType === 'shot' && (/^1\S/.test(r) || /1回/.test(r))) return '';
    if (g.rewardType === 'stock' && /^月/.test(r)) return '';
    return rt;
  }
  /** 「9/23掲載・10/5締切」。締切のない随時募集は掲載日だけ */
  function dateLine(g) {
    var out = [];
    if (g.postedAt) out.push(md(g.postedAt) + '掲載');
    if (g.closesAt) out.push(md(g.closesAt) + '締切');
    return out.join('・');
  }
  /** 掲載した人の立場。講師は「講師」、運営は「運営」、会員は「会員」（「小林 みお（講師）」の形で出す） */
  function roleOf(p) {
    if (!p) return '';
    if (p.me) return '自分';
    if (p.staff) return /^講師/.test(p.role || '') ? '講師' : /運営/.test(p.role || '') ? '運営' : (p.role || '運営');
    return '会員';
  }
  function hostHtml(g) {
    var p = R.person(g.by);
    return '<span class="gd-host">' + U.personLink(p, { size: 'xs' }) + '<span class="gd-host__role">（' + esc(roleOf(p)) + '）</span></span>';
  }
  function ownGig(id) { return (R.myGigs ? R.myGigs() : []).filter(function (x) { return x.id === id; })[0] || null; }
  /** 直せる自分の募集（差し戻し・確認中）。掲載中・終了は直せない（R.editGig と同じ決まり） */
  function editable(g) { return !!g && (g.status === 'rejected' || g.status === 'review'); }

  /* 紹介の案件には面談も稼働もない。運営画面（引き継ぎ済み・商談中・成約）と同じ言葉にする */
  var REFER_LABEL = { meeting: '引き継ぎ済み', active: '商談中', done: '成約' };
  /** R.gigState に、紹介の案件の言い換えを重ねたもの（札・一覧・くわしくで同じ言葉にする）。応募していなければ null */
  function stateOf(g) {
    var st = g ? R.gigState(g.id) : null;
    if (st && g.type === 'refer' && REFER_LABEL[st.key]) st = merge(st, { label: REFER_LABEL[st.key] });
    return st;
  }
  /** 終わった応募（完了・見送り）。一覧では下へ回し、やりとりの欄は何も書かれていなければ出さない */
  function ended(st) { return !!st && (st.key === 'done' || st.key === 'declined'); }

  /* ---------- 別のタブ（運営画面）で進んだことを知らせる ----------
     state.gigs の status（報酬確定の rewarded も分ける）と、自分の募集の status を順番の数にする。
     数が増えたときだけ知らせる（デモを最初に戻したときのような、戻る向きは黙って覚え直す） */
  var APP_STEP = { '': 0, applied: 1, meeting: 2, active: 3, done: 4, rewarded: 5, declined: 6 };
  var OWN_STEP = { review: 1, rejected: 2, open: 2, closed: 3 };
  function progressOf(g) {
    var own = g.by === 'me' ? ownGig(g.id) : null;
    if (own) return { key: own.status, step: OWN_STEP[own.status] || 0, own: own };
    var st = stateOf(g), raw = st ? (st.status === 'rewarded' ? 'rewarded' : st.key === 'referred' ? 'applied' : st.key) : '';
    return { key: raw, step: APP_STEP[raw] || 0, st: st };
  }
  /** 知らせの文。何がどう変わったかを1文で（「応募の状況が「稼働中」になりました」） */
  function changeText(g, p) {
    if (p.own) {
      if (p.key === 'open') return '募集が掲載されました';
      if (p.key === 'rejected') return '募集が差し戻されました。理由を確認してください';
      return '募集の状態が「' + p.own.statusLabel + '」になりました';
    }
    var what = g.type === 'refer' ? '紹介の状況' : '応募の状況';
    if (p.key === 'rewarded') {
      var rw = R.gigReward(g.id);
      return '報酬が確定しました' + (rw && rw.amount ? '（' + U.yen(rw.amount) + '）' : '');
    }
    return what + 'が「' + ((p.st && p.st.label) || '') + '」になりました';
  }
  function noticeChange(root, ctx) {
    var id = ctx.params && ctx.params[0], g = id && id !== 'new' ? R.gig(id) : null;
    var mine = selfChange;
    selfChange = false;
    if (!g) { lastShown = ''; return; }
    var who = R.me().id + ':' + g.id, p = progressOf(g), prev = seenState[who];
    seenState[who] = p;
    var same = lastShown === who;
    lastShown = who;
    if (!same || mine || !prev) return;
    // 自分の募集に応募が届いた（状態は掲載中のまま）
    if (p.own && prev.own && p.key === prev.key && p.own.applicantCount > prev.own.applicantCount) {
      U.toast('新しい応募が届きました（' + p.own.applicantCount + '人目）', 'ok');
      return;
    }
    if (p.step <= prev.step) return;
    var el = root.querySelector('.scr-gigs [data-gg-state="' + g.id.replace(/["\\]/g, '') + '"]');
    if (el) {
      el.classList.add('is-flash');
      setTimeout(function () { el.classList.remove('is-flash'); }, 2400);
    }
    // 一言の知らせは読み上げにも出る。見送り・差し戻しは「できた」の印（チェック）を付けない
    U.toast(changeText(g, p), p.key === 'declined' || p.key === 'rejected' ? null : 'ok');
  }

  /** 鍵の理由を、条件を先に1文で：「講座「Instagram運用」を見終えると応募できます・0/5回」 */
  function lockOf(g) {
    var lk = R.gigLock(g);
    if (!lk.locked) return { locked: false };
    var out = { locked: true, course: null, courseTitle: '', text: lk.reason, need: '' };
    if (lk.course) {
      var c = R.course(lk.course), cs = R.courseState(lk.course);
      out.course = lk.course; out.courseTitle = c ? c.title : '';
      out.text = '講座「' + out.courseTitle + '」を見終えると応募できます・' + (cs.locked ? '講座は' + cs.lockReason : cs.done + '/' + cs.total + '回');
    } else {
      var need = levelMin(g.level) - R.xp();
      if (need > 0) out.need = 'あと' + U.num(need) + ' XP';
    }
    return out;
  }
  /** 鍵の文（HTML）。「あと30 XP」は途中で折らない */
  function lockHtml(lk) {
    return U.jp(lk.text) + (lk.need ? '・<span class="nw">' + esc(lk.need) + '</span>' : '');
  }
  /** 鍵を開けるための行き先。講座は名前入りの読み上げにする（「講座を見る」だけだと、どの講座か分からない） */
  function unlockLink(lk, g, cls) {
    return lk.course
      ? '<a class="' + cls + '" href="#/courses/' + encodeURIComponent(lk.course) + '" aria-label="講座「' + esc(lk.courseTitle) + '」を見る">講座を見る</a>'
      : '<button type="button" class="' + cls + '" data-gg-level="' + esc(g.id) + '">レベルのしくみ</button>';
  }

  function crumb(links, here) {
    return '<nav class="crumb gg-crumb" aria-label="現在地"><ol>' + links.map(function (l) {
      return '<li><a href="' + esc(l[0]) + '">' + esc(l[1]) + '</a>' + U.chevron() + '</li>';
    }).join('') + '<li><span aria-current="page">' + esc(here) + '</span></li></ol></nav>';
  }
  function postBtn() {
    return '<a class="btn btn-ghost btn-s gg-post" href="#/gigs/new">' + icon('plus', 'ico-s') + '募集を出す</a>';
  }

  /* ---------- 一覧の1行 ----------
     h: 題の見出しの段（種類ごとの見出しの下では h4、絞り込み中は h3）。o.preview：掲載前の確認の窓で使う（リンク・状態なし） */
  function item(g, h, o) {
    o = o || {};
    var lk = o.preview ? { locked: false } : lockOf(g), st = o.preview ? null : stateOf(g), tp = timePlace(g);
    h = h || 'h3';
    // 紹介の案件は所要時間が「紹介のみ」しかなく、題と報酬で足りるので時間と場所は出さない
    var meta = [];
    if (g.type !== 'refer') {
      if (tp.time) meta.push(tp.time);
      meta.push(g.remote ? '在宅' : (tp.place || '現地'));
    }
    var sl = slotsShort(g), dl = dateLine(g);
    if (sl) meta.push(sl);
    if (dl) meta.push(dl);

    // 札は1つだけ（見出しの外）。応募の状態があればそれ、なければ新着。鍵のかかった案件には新着を付けない
    var tag = st ? U.statusTag(st.tag, st.label) : g.isNew && !lk.locked ? U.statusTag('new') : '';
    var ttl = o.preview
      ? '<span class="gg-item__link">' + jpTitle(g.title) + '</span>'
      : '<a class="gg-item__link" href="#/gigs/' + esc(g.id) + '">' + jpTitle(g.title) +
          (lk.locked ? '<span class="sr-only">（まだ応募できません）</span>' : '') + '</a>';

    return '<article class="gg-item' + (lk.locked ? ' is-locked' : '') + (o.preview ? ' is-preview' : '') + '">' +
      '<' + h + ' class="gg-item__ttl">' + (lk.locked ? icon('lock', 'ico-s gg-item__lk') : '') + ttl + '</' + h + '>' +
      '<div class="gg-item__side"><p class="gg-item__pay"><b>' + esc(g.reward) + '</b><span>（目安）</span></p>' +
        (tag ? '<p class="gg-item__tag">' + tag + '</p>' : '') + '</div>' +
      (lk.locked ? '<p class="gg-item__lock">' + lockHtml(lk) + ' ' + unlockLink(lk, g, 'gg-item__go') + '</p>' : '') +
      (meta.length ? '<p class="gg-item__meta">' + U.jp(meta.join('・')) + '</p>' : '') +
      (o.preview ? '' : U.chevron()) +
    '</article>';
  }
  function itemList(list, h) {
    return '<div class="list gg-list">' + list.map(function (g) { return item(g, h); }).join('') + '</div>';
  }

  /* ---------- 自分の募集（会員どうし） ---------- */
  function mySub(g) {
    if (g.status === 'review') return g.resubmittedAt ? U.fmtShort(g.resubmittedAt) + 'に出し直し・運営が確認中' : U.fmtShort(g.submittedAt) + 'に申し込み・運営が確認中';
    if (g.status === 'rejected') return '差し戻し：' + (g.rejectReason || '内容を直してください');
    if (g.status === 'closed' && !g.postedAt) return (g.closedAt ? U.fmtShort(g.closedAt) + 'に' : '') + '申し込みを取り消しました';
    var s = [];
    if (g.postedAt) s.push(md(g.postedAt) + '掲載');
    if (g.closesAt) s.push(md(g.closesAt) + '締切');
    s.push('応募' + g.applicantCount + '人' + (g.status === 'open' && g.newApplicants ? '（未対応' + g.newApplicants + '）' : ''));
    return s.join('・');
  }
  function myBlock() {
    var list = R.myGigs ? R.myGigs() : [];
    if (!list.length) return '';
    return '<section class="sec gg-my" aria-labelledby="ggMyTtl"><h2 class="sec-ttl" id="ggMyTtl">自分の募集</h2>' +
      '<div class="list">' + list.map(function (g) {
        return '<a class="li gg-row" href="#/gigs/' + esc(g.id) + '">' +
          '<span class="li__body"><span class="li__ttl">' + jpTitle(g.title) + '</span>' +
            '<span class="li__sub">' + U.jp(mySub(g)) + '</span></span>' +
          '<span class="li__end">' + U.statusTag(g.tag, g.statusLabel) + '</span>' + U.chevron() + '</a>';
      }).join('') + '</div></section>';
  }

  /* ---------- 応募した案件 ---------- */
  function mineRows() {
    // CLG.store.state をそのつど読む（見る人の切り替え・別のタブの保存で入れ物ごと差し替わるので、mount で覚えた ctx.state は古い）
    var gigs = (CLG.store.state || {}).gigs || {};
    return Object.keys(gigs).map(function (id) { var g = R.gig(id); return { g: g, st: stateOf(g) }; })
      .filter(function (r) { return r.g && r.st; });
  }
  function mineWhen(r) {
    var st = r.st, refer = r.g.type === 'refer';
    if (st.key === 'done') {
      var rw = R.gigReward(r.g.id);
      return U.fmtShort(st.doneAt || st.at) + 'に' + (refer ? '成約' : '完了') +
        (rw && rw.amount ? '・報酬 ' + U.yen(rw.amount) + '（' + rw.label + '）' : '・報酬の額を確認中');
    }
    if (st.key === 'active') return refer ? '担当者と紹介先が話を進めています' : U.fmtShort(st.startedAt || st.at) + 'から稼働';
    if (st.key === 'meeting') {
      if (refer) return U.fmtShort(st.meetingOfferedAt || st.at) + 'に担当者へ引き継ぎ';
      return st.meetingAt ? '面談 ' + U.fmtShort(st.meetingAt, true) : st.sub;
    }
    var sent = U.fmtShort(st.at) + 'に' + (refer ? '紹介' : '応募');
    if (st.key === 'declined') return sent + (st.declinedAt ? '・' + U.fmtShort(st.declinedAt) + 'に見送り' : '');
    return sent + (st.sub ? '・' + st.sub : '');
  }
  /** 並べる日付：いちばん新しい出来事 */
  function lastAt(st) { return new Date(st.declinedAt || st.rewardedAt || st.doneAt || st.startedAt || st.meetingOfferedAt || st.at); }
  function mineBlock() {
    var rows = mineRows();
    if (!rows.length) return '';
    // 進んでいるものを上に、終わったもの（完了・見送り）は下に。どちらも新しい順
    rows.sort(function (a, b) {
      return (ended(a.st) ? 1 : 0) - (ended(b.st) ? 1 : 0) || lastAt(b.st) - lastAt(a.st);
    });
    var total = rows.reduce(function (a, r) { var rw = R.gigReward(r.g.id); return a + (rw ? rw.amount || 0 : 0); }, 0);
    return '<section class="sec gg-mine" aria-labelledby="ggMineTtl"><h2 class="sec-ttl" id="ggMineTtl">応募した案件</h2>' +
      '<div class="list">' + rows.map(function (r) {
        return '<a class="li gg-row" href="#/gigs/' + esc(r.g.id) + '">' +
          '<span class="li__body"><span class="li__ttl">' + jpTitle(r.g.title) + '</span>' +
            '<span class="li__sub">' + U.jp(mineWhen(r)) + '</span></span>' +
          '<span class="li__end">' + U.statusTag(r.st.tag, r.st.label) + '</span>' + U.chevron() + '</a>';
      }).join('') +
        (total ? '<div class="gg-mine__total"><span>完了した案件の報酬</span><b class="num">' + U.yen(total) + '</b></div>' : '') +
      '</div></section>';
  }

  /* ---------- 絞り込みと一覧 ---------- */
  function filterBlock(type) {
    var chips = [['all', 'すべて', openGigs().length]].concat(DATA.GIG_TYPES.map(function (t) {
      return [t.id, t.name, openGigs(t.id).length];
    }));
    return '<div class="chips gg-filter" role="group" aria-label="案件の種類">' + chips.map(function (c) {
      var on = c[0] === (type || 'all');
      return '<button type="button" class="chip" data-gg-type="' + esc(c[0]) + '" aria-pressed="' + on + '">' +
        esc(c[1]) + '<span class="n num">' + c[2] + '</span></button>';
    }).join('') + '</div>';
  }
  function listBody(type) {
    if (type) {
      var items = sorted(openGigs(type));
      return items.length ? itemList(items, 'h3')
        : '<div class="card">' + U.empty('briefcase', 'いま募集中の' + typeOf({ type: type }).name + 'はありません。', { href: '#/gigs', label: 'すべての案件を見る' }) + '</div>';
    }
    var html = DATA.GIG_TYPES.map(function (t) {
      var items = sorted(openGigs(t.id));
      if (!items.length) return '';
      return '<section class="gg-group" aria-labelledby="ggGrp-' + esc(t.id) + '">' +
        '<h3 class="gg-group__ttl" id="ggGrp-' + esc(t.id) + '">' + esc(t.name) + '</h3>' +
        itemList(items, 'h4') + '</section>';
    }).join('');
    return html || '<div class="card">' + U.empty('briefcase', 'いま募集中の案件はありません。') + '</div>';
  }
  function closedBlock(type) {
    var list = recentClosed(type);
    if (!list.length) return '';
    // 開いているかはこのファイルの変数に持つ（絞り込みの札を押して描き直しても閉じない）
    return '<details class="gg-closed" data-gg-closed' + (closedOpen ? ' open' : '') + '>' +
      '<summary class="gg-closed__sum"><span>募集終了（直近30日）<span class="num">' + list.length + '件</span></span>' + icon('chevdown', 'ico-s gg-closed__caret') + '</summary>' +
      '<div class="list">' + list.map(function (g) {
        var sub = [g.reward + '（目安）', md(g.closesAt) + '締切'], st = stateOf(g);
        if (g.filled) sub.push(g.filled + '名決定');
        // 自分が応募していた案件は、その状態の札を1つだけ
        return '<a class="li gg-row" href="#/gigs/' + esc(g.id) + '"><span class="li__body">' +
          '<span class="li__ttl">' + jpTitle(g.title) + '</span><span class="li__sub">' + U.jp(sub.join('・')) + '</span></span>' +
          (st ? '<span class="li__end">' + U.statusTag(st.tag, st.label) + '</span>' : '') +
          U.chevron() + '</a>';
      }).join('') + '</div></details>';
  }

  function renderList(ctx) {
    var q = ctx.query || {};
    var type = TYPES[q.type] ? q.type : '';
    return '<div class="scr-gigs">' +
      '<div class="page-head gg-head"><h1 class="page-ttl" data-page-title tabindex="-1">案件</h1>' + postBtn() + '</div>' +
      myBlock() +
      mineBlock() +
      '<section class="sec gg-board" aria-labelledby="ggBoardTtl">' +
        '<h2 class="sec-ttl" id="ggBoardTtl">募集中の案件</h2>' +
        filterBlock(type) + listBody(type) + closedBlock(type) +
      '</section>' +
      '<p class="gg-safe">投資・FX・暗号資産・借入が必要な案件は載せていません。あやしい案件を見つけたら<a href="#/messages">運営に知らせてください</a>。</p>' +
    '</div>';
  }

  /* ---------- くわしく：右の面（報酬と、いまできること） ---------- */
  function stateLine(g, st) {
    var refer = g.type === 'refer';
    if (st.key === 'declined') return (st.declinedAt ? day(st.declinedAt) + '、' : '') + '今回は見送りになりました';
    if (st.key === 'done') {
      var done = day(st.doneAt || st.at) + 'に' + (refer ? '成約' : '完了');
      return R.gigReward(g.id) ? done : done + '。報酬の額を運営が確認しています';
    }
    if (refer && st.key === 'active') return '担当者と紹介先が話を進めています';
    if (refer && st.key === 'meeting') return day(st.meetingOfferedAt || st.at) + 'に担当者へ引き継ぎました。担当者から紹介先に連絡します';
    if (st.key === 'active') return day(st.startedAt || st.at) + 'から';
    if (st.key === 'meeting') return st.meetingAt ? '面談 ' + U.fmtDate(st.meetingAt, { noYear: true, time: true }) : '面談の日にちを決めています';
    if (refer) return day(st.at) + 'に紹介先を伝えました。担当者が確認しています';
    // 1段落2文まで（誰が確かめているかは、応募の窓の知らせと流れの「掲載した会員から返事」に出ている）
    if (g.type === 'peer') return day(st.at) + 'に応募。採用が決まると、この画面で掲載者・運営とやりとりできます';
    return day(st.at) + 'に応募。運営から2営業日以内に連絡します';
  }
  function actionBlock(g, lk, st, closed) {
    var refer = g.type === 'refer', id = esc(g.id);
    if (st) {
      var head = '<p class="gd-state" data-gg-state="' + id + '" tabindex="-1">' + U.statusTag(st.tag, st.label) +
        '<span>' + U.jp(stateLine(g, st)) + '</span></p>';
      if (st.key === 'declined') {
        return head + '<a class="btn btn-soft btn-block" href="#/gigs?type=' + esc(g.type) + '">同じ種類の案件を見る</a>';
      }
      // 紹介の案件は、引き継いだあとは担当者が進める（作業の報告も面談もない）
      if (refer && (st.key === 'meeting' || st.key === 'active')) {
        return head + '<a class="btn btn-soft btn-block" href="#/messages">運営に問い合わせる</a>';
      }
      if (st.key === 'done') {
        var rw = R.gigReward(g.id), b = R.bank();
        return head +
          (rw ? '<table class="kv gd-reward"><tbody>' +
            '<tr><th scope="row">報酬</th><td><b class="num">' + esc(U.yen(rw.amount)) + '</b>（' + esc(rw.label) + '）</td></tr>' +
            // 振込先がないまま支払日を過ぎた報酬は、確定のまま次の支払日へ（R.gigReward の carried・note）
            '<tr><th scope="row">' + (rw.status === 'paid' ? '支払日' : '支払予定') + '</th><td>' + esc(day(rw.payAt)) +
              (rw.carried && rw.note && rw.status !== 'paid' ? '<span class="gd-reward__note">' + U.jp(rw.note) + '</span>' : '') + '</td></tr>' +
            '<tr><th scope="row">振込先</th><td>' + (b ? esc(b.masked) : '<span class="gd-warn">未登録</span>') + '</td></tr>' +
          '</tbody></table>' : '') +
          (rw && rw.needBank && rw.status !== 'paid'
            ? '<button type="button" class="btn btn-primary btn-block" data-gg-bank="' + id + '" data-focus-after="[data-gg-state=\'' + id + '\']">振込先を登録する</button>' : '') +
          '<a class="btn btn-soft btn-block" href="#/gigs?type=' + esc(g.type) + '">同じ種類の案件を見る</a>';
      }
      if (st.key === 'active') {
        return head + '<button type="button" class="btn btn-ink btn-block" data-gg-report="' + id + '">作業を報告する</button>';
      }
      if (st.key === 'meeting') {
        return head + '<a class="btn btn-soft btn-block" href="#/messages">相談・メッセージで日程を見る</a>';
      }
      // 取り消すと、このボタンは「応募する」に入れ替わる。焦点はその新しいボタンへ（スマホでは下の帯のもの）
      return head +
        (st.note ? '<div class="gd-sent"><p class="gd-sent__label">送った内容</p><p>' + U.nl2br(st.note) + '</p></div>' : '') +
        '<a class="btn btn-soft btn-block" href="#/messages">運営に問い合わせる</a>' +
        '<button type="button" class="btn btn-text gd-withdraw" data-gg-withdraw="' + id + '" data-focus-after="[data-gg-apply=\'' + id + '\']">' +
          (refer ? '依頼' : '応募') + 'を取り消す</button>';
    }
    if (closed) {
      return '<p class="gd-state">' + U.statusTag('closed', '募集終了') + '<span>' +
        (g.closesAt ? esc(day(g.closesAt)) + 'に締め切りました' : '募集を終えました') + (g.filled ? '（' + esc(g.filled) + '名決定）' : '') + '</span></p>' +
        '<a class="btn btn-soft btn-block" href="#/gigs?type=' + esc(g.type) + '">同じ種類の案件を見る</a>';
    }
    if (lk.locked) {
      return '<p class="gd-state gd-state--lock">' + icon('lock', 'ico-s') + '<span>' + lockHtml(lk) + '</span></p>' +
        unlockLink(lk, g, 'btn btn-soft btn-block');
    }
    return '<button type="button" class="btn btn-primary btn-l btn-block gd-apply" data-gg-apply="' + id + '" data-focus-after="[data-gg-state=\'' + id + '\']">' +
        (refer ? '担当者につなぐ' : '応募する') + '</button>';
  }
  function sideCard(g, lk, st, closed) {
    // 「目安」は金額の横に書いてあるので、紹介の「契約しなければ出ない」だけを足す（完了したあとは出さない）
    var caution = g.type === 'refer' && !ended(st)
      ? '<p class="gd-pay__note">契約に至らなければ報酬は出ません。</p>' : '';
    var until = !st && !closed && !lk.locked && g.closesAt ? '<p class="gd-pay__note">' + esc(day(g.closesAt)) + 'まで募集</p>' : '';
    return '<div class="card gd-side">' +
      '<div class="gd-side__pay"><p class="gd-pay"><b>' + esc(g.reward) + '</b><span>（目安）</span></p>' + caution + until + '</div>' +
      '<div class="gd-act">' + actionBlock(g, lk, st, closed) + '</div>' +
    '</div>';
  }
  /** スマホで下に留まる帯（報酬の目安＋応募のボタン）。応募できるときだけ */
  function applyBar(g) {
    var id = esc(g.id);
    return '<div class="gd-bar">' +
      '<p class="gd-bar__pay"><b>' + esc(g.reward) + '</b><span>（目安）</span></p>' +
      '<button type="button" class="btn btn-primary gd-bar__btn" data-gg-apply="' + id + '" data-focus-after="[data-gg-state=\'' + id + '\']">' +
        (g.type === 'refer' ? '担当者につなぐ' : '応募する') + '</button>' +
    '</div>';
  }

  /* ---------- くわしく：日付つきの流れ・作業報告 ---------- */
  /** R.gigHistory に、応募の記録（R.gigState）にある日付を足して、応募・面談・稼働・完了がそろった流れにする。
      古い案件（募集終了の案件など）は記録が「報酬確定」からしかないため。すでに同じ出来事の行があれば足さない */
  function fullHistory(g, st) {
    var list = R.gigHistory(g.id).slice(), refer = g.type === 'refer';
    function has(re) { return list.some(function (h) { return re.test(h.text); }); }
    function add(at, text) { if (at && new Date(at) <= CLG.now()) list.push({ at: at, text: text, done: true }); }
    // 運営画面が進めたときの行（R.advanceGigApp）と同じ出来事は足さない。紹介は「引き継ぎ・話を進めて・成約」
    if (st.at && !has(/応募|紹介先を伝え/)) add(st.at, refer ? '紹介先を伝えました' : '応募しました');
    if (st.meetingAt && st.key !== 'meeting' && !has(/面談/)) add(st.meetingAt, '面談');
    if (st.startedAt && !has(refer ? /話を進め|商談/ : /稼働/)) add(st.startedAt, refer ? '担当者と紹介先が話を進めています' : '稼働を始めました');
    if (st.key === 'done' && st.doneAt && !has(/完了|成約/)) add(st.doneAt, refer ? '成約しました' : '完了しました');
    // 会員どうしの募集は、運営ではなく掲載した会員が決める
    if (g.type === 'peer') list.forEach(function (h) { if (!h.done && /運営から連絡/.test(h.text)) h.text = '掲載した会員から返事'; });
    // 紹介の案件には面談も作業の報告もない。引き継いだあとの予定は「面談」ではなく担当者と紹介先の商談。
    // いまのルール（R.advanceGigApp）は「紹介先」と書く。前に保存した履歴に残る「先方」だけ、この画面の言葉にそろえる
    if (refer) {
      list = list.filter(function (h) { return h.done || !/の作業報告$/.test(h.text); });
      list.forEach(function (h) {
        if (!h.done && h.text === '面談') h.text = '担当者と紹介先の商談';
        h.text = h.text.replace('担当者と先方が', '担当者と紹介先が');
      });
    }
    // 今月の作業報告を出したあとは「◯月分の作業報告（予定）」の行を出さない
    if (st.key === 'active') {
      var sent = R.workReports(g.id).map(function (r) { return r.month; });
      list = list.filter(function (h) { return h.done || !sent.some(function (m) { return h.text.indexOf(m + 'の作業報告') === 0; }); });
    }
    // 日付のあるものは古い順、予定（日付なし・これから）は後ろ。同じ時刻なら「完了」を「報酬確定」より前に
    var done = list.filter(function (h) { return h.done; }), next = list.filter(function (h) { return !h.done; });
    done.sort(function (a, b) { return new Date(a.at) - new Date(b.at) || (/報酬確定/.test(a.text) ? 1 : 0) - (/報酬確定/.test(b.text) ? 1 : 0); });
    return done.concat(next);
  }
  function histList(list) {
    if (!list.length) return '';
    return '<ol class="gd-hist">' + list.map(function (h) {
      return '<li class="' + (h.done ? 'is-done' : 'is-next') + '">' +
        '<span class="gd-hist__at num">' + (h.at ? esc(U.fmtShort(h.at, h.done)) : '未定') + '</span>' +
        '<span class="gd-hist__txt">' + U.jp(h.text) + (h.done || /予定/.test(h.text) ? '' : '<span class="gd-hist__soon">予定</span>') + '</span>' +
      '</li>';
    }).join('') + '</ol>';
  }
  function reportsBlock(g) {
    var list = R.workReports(g.id);
    if (!list.length) return '';
    return '<div class="gd-reports"><h3 class="group-ttl">作業報告</h3><ul class="gd-reports__list">' + list.map(function (r) {
      var ok = r.status === '受領';
      return '<li><span class="gd-reports__main"><b>' + esc(r.month) + '</b>' +
          '<span class="gd-reports__sub">' + esc(U.fmtShort(r.at)) + 'に提出' +
            (r.fileName ? '・' + esc(r.fileName) : '') + (r.url ? '・' + esc(r.url) : '') + '</span></span>' +
        U.statusTag(ok ? 'done' : 'review', ok ? '受け取り済み' : '確認中') + '</li>';
    }).join('') + '</ul></div>';
  }
  function progressCard(g, st) {
    return '<section class="card gd-prog" aria-labelledby="gdProgTtl">' +
      '<div class="card-head"><h2 class="h3" id="gdProgTtl">' + (g.type === 'refer' ? '紹介の状況' : '応募の状況') + '</h2></div>' +
      histList(fullHistory(g, st)) +
      (st.key === 'active' ? reportsBlock(g) : '') +
    '</section>';
  }

  /* ---------- くわしく：3者のスレッド（掲載者・応募者・運営） ---------- */
  function threadRole(g, p) {
    if (!p) return '';
    if (p.id === g.by || (p.me && g.by === 'me')) return '掲載';
    if (p.staff) return '運営';
    return '応募';
  }
  function threadCard(g) {
    var t = R.gigThread(g.id);
    if (!t) return '';
    // 終わった応募（完了・見送り）で、まだ何も書かれていないときは出さない（空の欄だけが残るため）
    var st = stateOf(g);
    if (!t.messages.length && (!t.canSend || ended(st))) return '';
    var id = esc(g.id);
    var who = t.participants.map(function (p) {
      return '<span class="gt-who__p">' + U.personLink(p, { size: 'xs' }) + '<span class="gt-who__role">（' + esc(threadRole(g, p)) + '）</span></span>';
    }).join('');
    var msgs = t.messages.map(function (m) {
      var p = m.who || {};
      return '<li class="gt-msg' + (m.mine ? ' is-me' : '') + '">' +
        (m.mine ? '' : U.avatar(p, 's')) +
        '<div class="gt-msg__col">' +
          (m.mine ? '' : '<span class="gt-msg__name">' + esc(p.name) + '<span>（' + esc(threadRole(g, p)) + '）</span></span>') +
          '<div class="gt-msg__bubble">' + U.nl2br(m.text) + '</div>' +
          '<time class="gt-msg__at" datetime="' + esc(m.at) + '">' + (m.mine ? '自分・' : '') + esc(U.relTime(m.at)) + '</time>' +
        '</div></li>';
    }).join('');
    // 履歴は高さを決めて中だけスクロールするので、キーボードでもスクロールできるよう焦点を置けるようにする
    return '<section class="card gd-thread" id="ggThread-' + id + '" aria-labelledby="gdThTtl-' + id + '">' +
      '<div class="card-head"><h2 class="h3" id="gdThTtl-' + id + '">やりとり</h2></div>' +
      '<p class="gt-who"><span class="gt-who__lbl">見られる人</span>' + who + '</p>' +
      (msgs ? '<ol class="gt-list" tabindex="0" aria-label="やりとりの履歴（' + t.messages.length + '件）">' + msgs + '</ol>'
        : '<p class="gd-none">まだメッセージはありません。</p>') +
      (t.canSend
        ? '<form class="gt-compose" data-gg-send="' + id + '" novalidate>' +
            '<label class="sr-only" for="ggMsg-' + id + '">メッセージ</label>' +
            '<textarea class="textarea" id="ggMsg-' + id + '" name="text" rows="3" maxlength="1000" placeholder="' +
              (st && st.key === 'declined' ? '質問など' : ended(st) ? '報酬・作業の確認など'
                : g.type === 'refer' ? '紹介先のこと・進み具合の確認など' : '日時・場所・進め方など') + '">' +
              esc(msgDraft[g.id] || '') + '</textarea>' +
            '<p class="form-err" role="alert"></p>' +
            '<div class="gt-compose__foot"><button type="submit" class="btn btn-ink" aria-keyshortcuts="Control+Enter Meta+Enter">送る</button></div>' +
          '</form>'
        : '') +
    '</section>';
  }

  /* ---------- くわしく：中身と募集要項 ---------- */
  function reqText(g) {
    var c = g.requires ? R.course(g.requires) : null;
    return 'Lv' + esc(g.level) + '「' + esc(R.levelName(g.level)) + '」から' +
      (c ? '<br>講座「<a href="#/courses/' + esc(c.id) + '">' + esc(c.title) + '</a>」を見終えていること' : '');
  }
  function kvTable(g, o) {
    o = o || {};
    var refer = g.type === 'refer', rt = rtLabel(g), tp = timePlace(g);
    var steps = g.steps || (refer ? REFER_STEPS : null);
    // 紹介は「作業：紹介のみ」になり、説明文と「流れ」で言っていることの繰り返しなので行を作らない
    var kv = [['報酬', '<b>' + esc(g.reward) + '</b>（目安）' + (rt ? '・' + esc(rt) : '')]];
    if (g.payment) kv.push(['支払い', esc(g.payment)]);
    if (!refer) {
      kv.push(['作業時間', esc(tp.time || '—')]);
      kv.push(['場所', g.remote ? '在宅' : '現地' + (tp.place ? '（' + esc(tp.place) + '）' : '')]);
    }
    kv.push(['募集人数', esc(slotsLong(g))]);
    kv.push(['掲載日', g.postedAt && !o.preview ? esc(day(g.postedAt)) : '運営の確認のあと']);
    kv.push(['締切', g.closesAt ? esc(day(g.closesAt)) : 'なし（随時募集）']);
    kv.push(['掲載者', o.preview ? esc(R.person('me').name) + '（会員）' : hostHtml(g)]);
    kv.push(['応募条件', reqText(g)]);
    if (steps) {
      kv.push([refer && !g.steps ? '流れ' : '進め方', '<ol class="gd-steps">' + steps.map(function (s) {
        return '<li>' + esc(s) + '</li>';
      }).join('') + '</ol>']);
    }
    return '<table class="kv gd-kv"><tbody>' + kv.map(function (r) {
      return '<tr><th scope="row">' + r[0] + '</th><td>' + r[1] + '</td></tr>';
    }).join('') + '</tbody></table>';
  }
  /** o.own：掲載した本人の画面。応募する人に向けた注意（「条件は掲載した会員と決めます」）は、本人の画面と募集を終えた案件では出さない */
  function bodyCard(g, o) {
    var note = '';
    if ((o && o.own) || isClosed(g)) {
      note = '';
    } else if (g.type === 'refer') {
      note = '<p class="gd-note">紹介先の了承を取ってから依頼してください。SNSで紹介するときは「#PR」を付けて、報酬があることが分かるように書いてください。</p>';
    } else if (g.type === 'peer') {
      // 1段落2文まで。運営も見ていることは、やりとりの欄の「見られる人」と応募の窓に出る
      note = '<p class="gd-note">会員どうしの募集です（手数料なし）。条件は掲載した会員と決め、困ったときは<a href="#/messages">運営に相談</a>できます。</p>';
    }
    return '<section class="card gd-body" aria-labelledby="gdBodyTtl-' + esc(g.id) + '">' +
      '<h2 class="sr-only" id="gdBodyTtl-' + esc(g.id) + '">案件の内容</h2>' +
      '<p class="gd-desc">' + U.jp(g.desc, { br: true }) + '</p>' + note +
      '<h2 class="gd-h">募集要項</h2>' + kvTable(g) +
    '</section>';
  }
  function relatedBlock(g) {
    var related = sorted(openGigs(g.type).filter(function (x) { return x.id !== g.id; })).slice(0, 3);
    if (!related.length) return '';
    return '<section class="sec gd-related" aria-labelledby="gdRelTtl"><h2 class="sec-ttl" id="gdRelTtl">同じ種類の案件<a href="#/gigs?type=' + esc(g.type) + '">すべて見る</a></h2>' +
      '<div class="list">' + related.map(function (x) {
        var xs = stateOf(x), xl = R.gigLock(x).locked;
        return '<a class="li gg-row" href="#/gigs/' + esc(x.id) + '"><span class="li__body">' +
          '<span class="li__ttl">' + jpTitle(x.title) + '</span>' +
          '<span class="li__sub">' + esc(x.reward) + '（目安）' + (xl && !xs ? '・まだ応募できません' : '') + '</span></span>' +
          (xs ? '<span class="li__end">' + U.statusTag(xs.tag, xs.label) + '</span>' : '') +
          U.chevron() + '</a>';
      }).join('') + '</div></section>';
  }

  function renderDetail(ctx, g) {
    var own = g.by === 'me' ? ownGig(g.id) : null;
    if (own) return renderOwn(own);
    var t = typeOf(g), lk = lockOf(g), st = stateOf(g), closed = isClosed(g);
    var canApply = !st && !lk.locked && !closed;
    return '<div class="scr-gigs gd-page' + (canApply ? ' has-bar' : '') + '">' +
      crumb([['#/gigs', '案件'], ['#/gigs?type=' + g.type, t.name]], g.title) +
      '<div class="page-head gd-head"><h1 class="page-ttl" data-page-title tabindex="-1">' + jpTitle(g.title) + '</h1></div>' +
      '<div class="gd">' +
        '<aside class="gd__side" aria-label="報酬と応募">' + sideCard(g, lk, st, closed) + '</aside>' +
        '<div class="gd__main">' +
          (st ? progressCard(g, st) : '') +
          threadCard(g) +
          bodyCard(g, {}) +
          relatedBlock(g) +
        '</div>' +
      '</div>' +
      (canApply ? applyBar(g) : '') +
    '</div>';
  }

  /* ---------- 自分の募集のくわしく（掲載した人の画面） ---------- */
  function ownSide(g) {
    var id = esc(g.id), line, acts = '';
    var after = ' data-focus-after="[data-gg-state=\'' + id + '\']"', edit = '#/gigs/new?from=' + encodeURIComponent(g.id);
    if (g.status === 'review') {
      line = g.resubmittedAt ? day(g.resubmittedAt) + 'に直して出し直しました。運営が確認しています（2営業日以内）'
        : day(g.submittedAt) + 'に申し込みました。運営が確認しています（2営業日以内）';
      acts = '<a class="btn btn-soft btn-block" href="' + edit + '">内容を直す</a>' +
        '<button type="button" class="btn btn-ghost btn-block" data-gg-close="' + id + '"' + after + '>申し込みを取り消す</button>';
    } else if (g.status === 'open') {
      line = (g.postedAt ? day(g.postedAt) + 'から掲載中' : '掲載中') + (g.closesAt ? '。' + day(g.closesAt) + 'に締め切ります' : '');
      acts = '<button type="button" class="btn btn-ghost btn-block" data-gg-close="' + id + '"' + after + '>掲載を終える</button>';
    } else if (g.status === 'rejected') {
      line = '運営から差し戻しがありました。直して出し直せます';
      acts = '<a class="btn btn-primary btn-block" href="' + edit + '">直して出し直す</a>' +
        '<button type="button" class="btn btn-ghost btn-block" data-gg-close="' + id + '"' + after + '>申し込みを取り消す</button>';
    } else {
      // 確認中に取り消したもの（一度も載っていない）と、載せたあとで終えたものを言い分ける
      line = (g.closedAt ? day(g.closedAt) + 'に' : '') + (g.postedAt ? '掲載を終えました' : '申し込みを取り消しました');
      acts = '<a class="btn btn-soft btn-block" href="#/gigs/new">新しい募集を出す</a>';
    }
    return '<div class="card gd-side">' +
      '<div class="gd-side__pay"><p class="gd-pay"><b>' + esc(g.reward) + '</b><span>（目安）</span></p></div>' +
      '<div class="gd-act"><p class="gd-state" data-gg-state="' + id + '" tabindex="-1">' + U.statusTag(g.tag, g.statusLabel) +
        '<span>' + U.jp(line) + '</span></p>' + acts + '</div>' +
    '</div>';
  }
  function applicantsCard(g) {
    if (g.status === 'review' || g.status === 'rejected') return '';
    var list = R.applicants(g.id), id = esc(g.id);
    var head = '<div class="card-head"><h2 class="h3" id="gdApplTtl">応募した人</h2><span class="gd-count num">' + list.length + '人</span></div>';
    if (!list.length) {
      return '<section class="card gd-appl" aria-labelledby="gdApplTtl">' + head +
        '<p class="gd-none">' + (g.status === 'open' ? 'まだ応募はありません。' : '応募はありませんでした。') + '</p></section>';
    }
    return '<section class="card gd-appl" aria-labelledby="gdApplTtl">' + head +
      '<ul class="gd-appl__list">' + list.map(function (a) {
        var pid = esc(a.person), p = a.who || {};
        var act = a.status === 'applied'
          ? '<button type="button" class="btn btn-ghost btn-s" data-gg-decline="' + pid + '" data-gig="' + id + '"' +
              ' data-focus-after="[data-gg-appl=\'' + pid + '\']" aria-label="' + esc(p.name) + 'さんを見送る">見送る</button>' +
            '<button type="button" class="btn btn-ink btn-s" data-gg-accept="' + pid + '" data-gig="' + id + '"' +
              ' aria-label="' + esc(p.name) + 'さんを採用する">採用する</button>'
          : U.statusTag(a.tag, a.label);
        return '<li class="gd-appl__row" data-gg-appl="' + pid + '" tabindex="-1">' +
          '<div class="gd-appl__head">' + U.personLink(p, { size: 's', sub: p.area || '' }) +
            '<span class="gd-appl__at">' + esc(U.fmtShort(a.at, true)) + 'に応募</span></div>' +
          (a.note ? '<p class="gd-appl__note">' + U.nl2br(a.note) + '</p>' : '') +
          '<div class="gd-appl__act">' + act + '</div>' +
        '</li>';
      }).join('') + '</ul></section>';
  }
  function renderOwn(g) {
    var hist = R.gigHistory(g.id);
    return '<div class="scr-gigs gd-page">' +
      crumb([['#/gigs', '案件']], g.title) +
      '<div class="page-head gd-head"><h1 class="page-ttl" data-page-title tabindex="-1">' + jpTitle(g.title) + '</h1></div>' +
      '<div class="gd">' +
        '<aside class="gd__side" aria-label="掲載の状態">' + ownSide(g) + '</aside>' +
        '<div class="gd__main">' +
          (g.status === 'rejected' && g.rejectReason
            ? '<div class="notice notice-warn gd-reason">' + icon('alert') + '<div><b>差し戻しの理由</b><br>' + U.jp(g.rejectReason) + '</div></div>' : '') +
          applicantsCard(g) +
          threadCard(g) +
          (hist.length ? '<section class="card gd-prog" aria-labelledby="gdHistTtl"><div class="card-head"><h2 class="h3" id="gdHistTtl">掲載の記録</h2></div>' +
            histList(hist) + '</section>' : '') +
          '<section class="sec gd-mine-pv" aria-labelledby="gdPvTtl"><h2 class="sec-ttl" id="gdPvTtl">' +
            (g.status === 'open' ? '掲載している内容' : g.status === 'closed' && g.postedAt ? '掲載した内容' : '申し込んだ内容') + '</h2>' +
            bodyCard(g, { own: true }) + '</section>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /* ---------- 募集を出す（#/gigs/new）・直す（#/gigs/new?from=<自分の募集のid>。差し戻し・確認中だけ） ---------- */
  function isoDay(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function addDays(n) { var t = CLG.now(); return new Date(t.getFullYear(), t.getMonth(), t.getDate() + n); }
  function parseDay(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || ''));
    return m ? new Date(+m[1], +m[2] - 1, +m[3], 23, 59) : null;
  }
  /** ?from= の自分の募集。見つからない（ほかの人の・消えた）ときは null で、新しく出す形になる */
  function fromGig(ctx) { var f = (ctx.query && ctx.query.from) || ''; return f ? ownGig(f) : null; }
  /** 選べる締切の最後の日。ルールは「締切の日の 23:59 がいまから60日以内」なので、夕方なら59日後まで */
  function lastCloseDay() {
    for (var n = 60; n > 1; n--) { if ((parseDay(isoDay(addDays(n))) - CLG.now()) / DAY <= 60) return addDays(n); }
    return addDays(1);
  }
  /** 締切の欄の初期値：直すときは元の締切（明日〜最後の日の範囲にあるときだけ）、なければ14日後 */
  function closeDefault(src) {
    var c = src && src.closesAt ? parseDay(isoDay(new Date(src.closesAt))) : null;
    return c && c >= addDays(1) && c <= parseDay(isoDay(lastCloseDay())) ? isoDay(c) : isoDay(addDays(14));
  }
  function blankDraft(src) {
    var tp = src ? timePlace(src) : { time: '', place: '' };
    return {
      title: src ? src.title : '', desc: src ? src.desc || '' : '', reward: src ? src.reward : '', payment: src ? src.payment || '' : '',
      remote: src && !src.remote ? 'onsite' : 'remote', place: src ? src.place || tp.place : '', time: tp.time,
      slots: src ? String(parseInt(src.slots, 10) || 1) : '1', level: src ? String(src.level || 1) : '1',
      closesAt: closeDefault(src), agree: false
    };
  }
  function nf(label, name, control, o) {
    o = o || {};
    return '<label class="field gn-f gn-f--' + name + (o.cls ? ' ' + o.cls : '') + '"' + (o.hidden ? ' hidden' : '') + '>' +
      '<span>' + esc(label) + (o.opt ? '<span class="opt">任意</span>' : '') + '</span>' + control +
      (o.hint ? '<small>' + esc(o.hint) + '</small>' : '') + '</label>';
  }
  /** 直せない自分の募集（掲載中・終了）を ?from= で開いたとき。別のタブで運営が確認を終えたときもここになる */
  function renderLocked(src) {
    var open = src.status === 'open';
    return '<div class="scr-gigs gn-page">' +
      crumb([['#/gigs', '案件'], ['#/gigs/' + src.id, src.title]], '募集を直す') +
      '<div class="page-head"><h1 class="page-ttl" data-page-title tabindex="-1">募集を直す</h1></div>' +
      '<div class="card">' + U.empty('briefcase', open ? '掲載中の募集は直せません。直すときは掲載を終えてから、新しく出してください。' : '終わった募集は直せません。',
        { href: '#/gigs/' + encodeURIComponent(src.id), label: '募集を見る' }) + '</div>' +
    '</div>';
  }
  function renderNew(ctx) {
    var src = fromGig(ctx), from = src ? src.id : '';
    if (src && !editable(src)) return renderLocked(src);
    var who = R.me().id, rejected = !!src && src.status === 'rejected';
    if (!draft || draftFrom !== from || draftWho !== who) { draft = blankDraft(src); draftFrom = from; draftWho = who; bannedShown = {}; newTried = false; }
    var d = draft, fid = 'ggNewForm', here = src ? '募集を直す' : '募集を出す';
    var lead = !src ? '会員どうしの募集です。運営が確認してから載せます（2営業日以内）。手数料はかかりません。'
      : rejected ? '直した内容を、運営がもう一度確認します（2営業日以内）。' : '運営の確認中です。直した内容で確認します。';
    function val(k) { return ' value="' + esc(d[k]) + '"'; }
    var lvOpts = DATA.LEVELS.map(function (L) {
      return '<option value="' + L.lv + '"' + (String(L.lv) === String(d.level) ? ' selected' : '') + '>Lv' + L.lv + ' ' + esc(L.name) +
        (L.lv === 1 ? '（だれでも）' : 'から') + '</option>';
    }).join('');
    var onsite = d.remote === 'onsite';
    return '<div class="scr-gigs gn-page">' +
      crumb(src ? [['#/gigs', '案件'], ['#/gigs/' + src.id, src.title]] : [['#/gigs', '案件']], here) +
      '<div class="page-head"><h1 class="page-ttl" data-page-title tabindex="-1">' + here + '</h1>' +
        '<p class="page-lead">' + lead + '</p></div>' +
      (rejected && src.rejectReason ? '<div class="notice notice-warn gn-reason">' + icon('alert') + '<div><b>差し戻しの理由</b><br>' + U.jp(src.rejectReason) + '</div></div>' : '') +
      '<form class="card gn-form" id="' + fid + '" novalidate>' +
        '<div class="notice notice-warn gn-rule">' + icon('alert') + '<div><b>載せられない募集</b><br>' + esc(BANNED_TEXT) + '</div></div>' +
        nf('題', 'title', '<input class="input" name="title" required maxlength="40" autocomplete="off" placeholder="例：子ども服の商品撮影"' + val('title') + '>', { hint: '40文字まで' }) +
        nf('内容', 'desc', '<textarea class="textarea" name="desc" required maxlength="1000" rows="6" placeholder="例：自宅で販売している子ども服の撮影を手伝ってくれる方を探しています。スマホ撮影でかまいません。">' + esc(d.desc) + '</textarea>',
          { hint: '何をしてほしいか・用意してほしいもの・日時の候補' }) +
        '<div class="gn-2">' +
          nf('報酬の目安', 'reward', '<input class="input" name="reward" required maxlength="40" autocomplete="off" placeholder="例：1回 5,000円"' + val('reward') + '>') +
          nf('支払いの時期と方法', 'payment', '<input class="input" name="payment" required maxlength="60" autocomplete="off" placeholder="例：作業の翌週に銀行振込"' + val('payment') + '>') +
        '</div>' +
        '<fieldset class="field gn-f gn-where" data-field><legend class="field__label">場所</legend>' +
          '<div class="gn-radios">' +
            '<label class="check"><input type="radio" name="remote" value="remote"' + (onsite ? '' : ' checked') + '><span>在宅（オンライン）</span></label>' +
            '<label class="check"><input type="radio" name="remote" value="onsite"' + (onsite ? ' checked' : '') + '><span>現地</span></label>' +
          '</div></fieldset>' +
        nf('現地の場所（市区町村まで）', 'place', '<input class="input" name="place" required maxlength="40" autocomplete="off" placeholder="例：札幌市中央区"' + val('place') + '>', { hidden: !onsite }) +
        nf('期間', 'time', '<input class="input" name="time" required maxlength="40" autocomplete="off" placeholder="例：2時間／納期2週間"' + val('time') + '>') +
        '<div class="gn-3">' +
          nf('人数', 'slots', '<span class="gn-unit"><input class="input num" type="number" name="slots" required min="1" max="20" step="1" inputmode="numeric"' + val('slots') + '><span>名</span></span>') +
          nf('応募できるLv', 'level', '<select class="select" name="level">' + lvOpts + '</select>') +
          nf('締切', 'closesAt', '<input class="input" type="date" name="closesAt" required min="' + isoDay(addDays(1)) + '" max="' + isoDay(lastCloseDay()) + '"' + val('closesAt') + '>',
            { hint: '60日以内' }) +
        '</div>' +
        '<div class="field gn-f gn-agree" data-field><label class="check"><input type="checkbox" name="agree"' + (d.agree ? ' checked' : '') + '>' +
          '<span>収入を保証する表現を使っていません</span></label></div>' +
        '<div class="gn-foot"><a class="btn btn-soft" href="' + (src ? '#/gigs/' + esc(src.id) : '#/gigs') + '">やめる</a>' +
          '<button type="submit" class="btn btn-primary">内容を確認する</button></div>' +
      '</form>' +
    '</div>';
  }
  function readForm(form) {
    var d = {}, el = form.elements;
    ['title', 'desc', 'reward', 'payment', 'place', 'time', 'slots', 'level', 'closesAt'].forEach(function (k) { d[k] = el[k] ? el[k].value : ''; });
    var r = form.querySelector('input[name="remote"]:checked');
    d.remote = r ? r.value : 'remote';
    d.agree = !!(el.agree && el.agree.checked);
    return d;
  }
  function blankErrs() { var e = {}; NEW_KEYS.forEach(function (k) { e[k] = ''; }); return e; }
  function bannedMsg(text) { var hit = R.checkBanned(text); return hit.length ? 'この内容は掲載できません（' + hit.join('・') + '）' : ''; }
  /** 確認の窓を出す前の見直し。R.validateGig があればそれ（ルールは domain.js に置く）、
      なければ空欄と禁止の言葉だけを見る（日付の範囲などは R.createGig が最後に見る） */
  function precheck(d) {
    if (R.validateGig) { var v = R.validateGig(d); return (v && v.errors) || {}; }
    var e = {};
    if (!trim(d.title)) e.title = '題を入れてください';
    if (!trim(d.desc)) e.desc = '内容を入れてください';
    if (!trim(d.reward)) e.reward = '報酬の目安を入れてください';
    if (!trim(d.payment)) e.payment = '支払いの時期と方法を入れてください';
    if (d.remote !== 'remote' && !trim(d.place)) e.place = '場所を入れてください（市区町村まで）';
    if (!trim(d.time)) e.time = '期間か時間の目安を入れてください';
    var n = parseInt(d.slots, 10);
    if (!(n >= 1 && n <= 20)) e.slots = '人数は1〜20で入れてください';
    // 締切の範囲も窓を開く前に見る（R.createGig と同じ文。窓で「掲載を申し込む」を押してから戻されないように）
    var close = parseDay(d.closesAt);
    if (!close) e.closesAt = '締切の日を選んでください';
    else if (close <= CLG.now()) e.closesAt = '締切は明日以降の日にしてください';
    else if ((close - CLG.now()) / DAY > 60) e.closesAt = '締切は60日以内にしてください';
    ['title', 'desc', 'reward'].forEach(function (k) { var b = bannedMsg(d[k]); if (b && !e[k]) e[k] = b; });
    if (!d.agree) e.agree = '確認にチェックを入れてください';
    return e;
  }
  function previewGig(d) {
    var n = parseInt(d.slots, 10) || 1;
    return { id: 'preview', type: 'peer', title: trim(d.title), desc: trim(d.desc), reward: trim(d.reward), payment: trim(d.payment),
      rewardType: 'shot', remote: d.remote === 'remote', place: d.remote === 'remote' ? '' : trim(d.place), time: trim(d.time),
      slots: n + '名', level: parseInt(d.level, 10) || 1, by: 'me', postedAt: null, closesAt: parseDay(d.closesAt), isNew: false };
  }
  /** 確認の窓 → 申し込む。?from= の自分の募集なら R.editGig で同じ募集を直す（差し戻しは確認に出し直し・確認中はその場で直す） */
  function openPreview(form) {
    var d = readForm(form), errs = precheck(d);
    if (U.fieldErrors(form, merge(blankErrs(), errs))) { newTried = true; return; }
    var src = draftFrom ? ownGig(draftFrom) : null, rejected = !!src && src.status === 'rejected';
    if (src) d.rewardType = src.rewardType;
    var g = previewGig(d);
    var m = U.modal(
      '<p class="group-ttl">一覧での見え方</p>' +
      '<div class="list gn-pv__row">' + item(g, 'h3', { preview: true }) + '</div>' +
      '<p class="group-ttl gn-pv__ttl">くわしく</p>' +
      '<p class="gd-desc">' + U.jp(g.desc, { br: true }) + '</p>' +
      kvTable(g, { preview: true }),
      { title: src ? '直した内容の確認' : '掲載前の確認', cls: 'scr-gigs', wide: true,
        foot: '<button type="button" class="btn btn-soft" data-close>修正する</button>' +
          '<button type="button" class="btn btn-primary" data-gn-submit>' + (!src ? '掲載を申し込む' : rejected ? '出し直す' : '直す') + '</button>' });
    m.querySelector('[data-gn-submit]').addEventListener('click', function () {
      var res = !src ? R.createGig(d)
        : R.editGig ? R.editGig(src.id, d) : R.createGig(merge(d, { from: src.id }));
      if (!res.ok) {
        m.close();
        if (res.errors) { newTried = true; U.fieldErrors(form, merge(blankErrs(), res.errors)); return; }
        // 直せなくなった（別のタブで運営が確認を終えた など）。描き直すと「直せません」の画面になる
        U.toast(res.error || '直せませんでした', 'error');
        CLG.app.refresh();
        return;
      }
      draft = null; draftFrom = null; bannedShown = {}; newTried = false;
      m.close();
      U.toast(!src ? '掲載を申し込みました。運営が確認します' : res.resubmitted || rejected ? '直して出し直しました。運営が確認します' : '内容を直しました', 'ok');
      selfChange = true;
      CLG.app.go('#/gigs/' + encodeURIComponent(res.gig.id));
    });
  }
  /** 書いているそばから、禁止の言葉だけは欄の下に出す（直したら消す） */
  function bannedLive(form, el) {
    var msg = bannedMsg(el.value);
    if (!msg && !bannedShown[el.name]) return;
    bannedShown[el.name] = !!msg;
    var e = {}; e[el.name] = msg;
    U.fieldErrors(form, e, { focus: false });
  }

  /* ---------- 窓：応募する ---------- */
  function openApply(g) {
    if (!g) return;
    var refer = g.type === 'refer', label = refer ? '担当者につなぐ' : '応募する', rt = rtLabel(g), fid = 'ggApplyForm';
    var fields = refer
      ? '<p class="gg-apply__lead">紹介先の了承を取ってから送ってください。</p>' +
        '<label class="field"><span>紹介先の会社・お店の名前</span>' +
          '<input class="input" name="to" required maxlength="60" autocomplete="off" placeholder="例：〇〇整骨院"></label>' +
        '<label class="field"><span>紹介先との関係<span class="opt">任意</span></span>' +
          '<input class="input" name="rel" maxlength="60" autocomplete="off" placeholder="例：学生時代の友人が経営しています"></label>' +
        '<label class="field"><span>担当者へのメモ<span class="opt">任意</span></span>' +
          '<textarea class="textarea" name="memo" maxlength="400" placeholder="例：ホームページを作り直したいと話していました。連絡は平日の昼が都合がよいそうです。"></textarea></label>'
      : '<label class="field"><span>ひとこと<span class="opt">任意</span></span>' +
          '<textarea class="textarea" name="note" maxlength="400" placeholder="' + esc(PLACEHOLDER[g.type] || PLACEHOLDER.small) + '"></textarea></label>';

    var m = U.modal(
      '<p class="gg-apply__reward">報酬 <b>' + esc(g.reward) + '</b>（目安）' + (rt ? '・' + esc(rt) : '') + '</p>' +
      '<form class="gg-apply__form" id="' + fid + '" novalidate>' + fields +
        '<div class="field gg-apply__okf" data-field><label class="check gg-apply__check"><input type="checkbox" name="ok">' +
          '<span>報酬は目安で、成果を保証するものではないことを確認しました</span></label></div>' +
        '<p class="gg-apply__disc">' + icon('info', 'ico-s') + '<span>' + esc(R.gigDisclosure(g.id)) + '。</span></p>' +
      '</form>',
      { title: g.title, cls: 'scr-gigs gg-apply', dirty: true,
        foot: '<button type="button" class="btn btn-soft" data-close>やめる</button>' +
          '<button type="submit" class="btn btn-primary" form="' + fid + '">' + label + '</button>' });

    var form = m.querySelector('form'), tried = false;
    U.fieldErrors(form, {}, { focus: false });            // 必須の札だけ先に付ける
    function val(name) { var el = form.elements[name]; return el ? trim(el.value) : ''; }
    function problems() {
      var e = { ok: form.elements.ok.checked ? '' : '確認のチェックを入れてください' };
      if (refer) e.to = val('to') ? '' : '紹介先の名前を入れてください';
      return e;
    }
    // 間違いは送ろうとしたときに初めて出す。そのあとは直すたびに消える
    function sync() { if (tried) U.fieldErrors(form, problems(), { focus: false }); }
    form.addEventListener('input', sync);
    form.addEventListener('change', sync);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      tried = true;
      if (U.fieldErrors(form, problems())) return;
      var note = refer
        ? [['紹介先', val('to')], ['関係', val('rel')], ['メモ', val('memo')]]
            .filter(function (x) { return x[1]; })
            .map(function (x) { return x[0] + '：' + x[1]; }).join('\n')
        : val('note');
      selfChange = true;
      var result = R.applyGig(g.id, note);
      m.close();
      if (!result) {
        U.toast('応募できませんでした。条件をもう一度確認してください', 'error');
        CLG.app.refresh();
        return;
      }
      CLG.app.reward(result);
      U.toast(refer ? '紹介先を担当者に伝えました。2営業日以内に連絡します'
        : g.type === 'peer' ? '応募しました。掲載した会員が確認します'
        : '応募しました。運営から2営業日以内に連絡します', 'ok');
      CLG.app.refresh();
    });
  }

  /* ---------- 窓：作業を報告する（稼働中の案件） ---------- */
  function openReport(g) {
    if (!g) return;
    var fid = 'ggReportForm', month = (CLG.now().getMonth() + 1) + '月分';
    var m = U.modal(
      '<form class="gg-report" id="' + fid + '" novalidate>' +
        '<label class="field"><span>URL</span><input class="input" type="url" name="url" inputmode="url" autocomplete="off" placeholder="https://"><small>作ったもの・共有フォルダなど。ファイルとどちらか1つ</small></label>' +
        '<label class="field"><span>ファイル</span><input class="input gg-file" type="file" name="file"><small>PDF・画像・表計算など</small></label>' +
        '<label class="field"><span>メモ<span class="opt">任意</span></span>' +
          '<textarea class="textarea" name="memo" maxlength="1000" placeholder="例：8投稿（うちリール2本）。保存数が多かったのはランチの投稿でした。"></textarea></label>' +
      '</form>',
      { title: '作業を報告する（' + month + '）', cls: 'scr-gigs', dirty: true,
        foot: '<button type="button" class="btn btn-soft" data-close>やめる</button>' +
          '<button type="submit" class="btn btn-primary" form="' + fid + '">報告する</button>' });
    var form = m.querySelector('form');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = form.elements.file && form.elements.file.files && form.elements.file.files[0];
      var res = R.submitWorkReport(g.id, { url: form.elements.url.value, memo: form.elements.memo.value, fileName: f ? f.name : '' });
      if (!res.ok) {
        if (res.errors) U.fieldErrors(form, merge({ url: '', memo: '' }, res.errors));
        else U.toast(res.error || '報告できませんでした', 'error');
        return;
      }
      m.close();
      U.toast(res.report.month + 'の作業報告を出しました', 'ok');
      CLG.app.refresh();
    });
  }

  /* ---------- 押したときの動き ---------- */
  function withdraw(g) {
    if (!g) return;
    var w = g.type === 'refer' ? '依頼' : '応募';
    U.confirmBox(w + 'を取り消しますか',
      '「' + g.title + '」への' + w + 'を取り消します。あとでまた' + w + 'できます。', '取り消す', true)
      .then(function (ok) {
        if (!ok) return;
        selfChange = true;
        R.withdrawGig(g.id);
        // withdrawGig は「応募済み」のときだけ消す。消えていなければ、そのことをそのまま伝える
        U.toast(R.gigState(g.id)
          ? '確認が進んでいるため取り消せませんでした。相談・メッセージから連絡してください'
          : w + 'を取り消しました');
        CLG.app.refresh();
      });
  }
  function closeMine(id) {
    var g = ownGig(id);
    if (!g) return;
    // 確認中・差し戻しは一度も載っていないので「申し込みを取り消す」。載っているものは「掲載を終える」
    var review = g.status === 'review' || g.status === 'rejected';
    U.confirmBox(review ? '申し込みを取り消しますか' : '掲載を終えますか',
      review ? '「' + g.title + '」の掲載の申し込みを取り消します。'
        : '「' + g.title + '」を一覧から外します。採用した人とのやりとりは続けられます。',
      review ? '取り消す' : '掲載を終える', true)
      .then(function (ok) {
        if (!ok) return;
        selfChange = true;
        if (!R.closeGig(id)) { U.toast('すでに終わっています'); CLG.app.refresh(); return; }
        U.toast(review ? '申し込みを取り消しました' : '掲載を終えました', 'ok');
        CLG.app.refresh();
      });
  }
  function decide(gid, pid, accept) {
    var p = R.person(pid), name = p.name || '会員';
    var ask = accept
      ? U.confirmBox(name + 'さんを採用しますか', '採用すると、' + name + 'さん・あなた・運営の3人のやりとりがこの画面で始まります。', '採用する', false, { kind: 'ink' })
      : U.confirmBox(name + 'さんを見送りますか', name + 'さんには、今回は見送りになったことをお知らせします。', '見送る', true);
    ask.then(function (ok) {
      if (!ok) return;
      var res = accept ? R.acceptApplicant(gid, pid) : R.declineApplicant(gid, pid);
      if (!res) { U.toast('変更できませんでした', 'error'); CLG.app.refresh(); return; }
      U.toast(name + 'さんを' + (accept ? '採用しました' : '見送りました'), 'ok');
      if (!accept) { CLG.app.refresh(); return; }
      // 採用したら、始まったやりとりの欄へ
      CLG.app.refresh({ focus: '#ggMsg-' + gid });
      var th = document.getElementById('ggThread-' + gid);
      if (th) U.smoothScroll(th, { block: 'start' });
    });
  }
  function sendMsg(form) {
    var id = form.getAttribute('data-gg-send'), ta = form.elements.text, err = form.querySelector('.form-err');
    var res = R.sendGigMessage(id, ta.value);
    if (!res.ok) {
      if (err) err.innerHTML = icon('info', 'ico-s') + '<span>' + esc(res.error) + '</span>';
      ta.setAttribute('aria-invalid', 'true');
      ta.focus();
      return;
    }
    msgDraft[id] = '';
    if (cur) cur.announce('送りました');
    CLG.app.refresh({ focus: '#ggMsg-' + id });
    msgDraft[id] = '';   // 描き直しで古い欄が外れるときの change（下の onInput）で書きかけが戻らないように
  }
  function openBank() {
    var rf = CLG.screens.referral;
    if (rf && rf.openBank) rf.openBank();
    else CLG.app.go('#/referral?focus=bank');
  }

  function onClick(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var b = t.closest('.scr-gigs [data-gg-type],.scr-gigs [data-gg-apply],.scr-gigs [data-gg-withdraw],.scr-gigs [data-gg-level],' +
      '.scr-gigs [data-gg-report],.scr-gigs [data-gg-bank],.scr-gigs [data-gg-close],.scr-gigs [data-gg-accept],.scr-gigs [data-gg-decline]');
    if (!b || b.disabled) return;
    if (b.hasAttribute('data-gg-type')) {
      var ty = b.getAttribute('data-gg-type');
      CLG.app.go('#/gigs' + (ty && ty !== 'all' ? '?type=' + encodeURIComponent(ty) : ''));
    }
    else if (b.hasAttribute('data-gg-apply')) openApply(R.gig(b.getAttribute('data-gg-apply')));
    else if (b.hasAttribute('data-gg-withdraw')) withdraw(R.gig(b.getAttribute('data-gg-withdraw')));
    else if (b.hasAttribute('data-gg-level')) CLG.app.levelInfo();
    else if (b.hasAttribute('data-gg-report')) openReport(R.gig(b.getAttribute('data-gg-report')));
    else if (b.hasAttribute('data-gg-bank')) openBank();
    else if (b.hasAttribute('data-gg-close')) closeMine(b.getAttribute('data-gg-close'));
    else if (b.hasAttribute('data-gg-accept')) decide(b.getAttribute('data-gig'), b.getAttribute('data-gg-accept'), true);
    else if (b.hasAttribute('data-gg-decline')) decide(b.getAttribute('data-gig'), b.getAttribute('data-gg-decline'), false);
  }
  function onSubmit(e) {
    var f = e.target;
    if (!f || !f.closest || !f.closest('.scr-gigs')) return;
    if (f.id === 'ggNewForm') { e.preventDefault(); openPreview(f); }
    else if (f.hasAttribute('data-gg-send')) { e.preventDefault(); sendMsg(f); }
  }
  function onInput(e) {
    var el = e.target, f = el && el.form;
    if (!f || !f.closest || !f.closest('.scr-gigs')) return;
    // 文字の欄は input で拾う。change は、描き直しで外れた古い欄からも届くので、選ぶ欄（ラジオ・チェック・選択・日付）だけ
    if (e.type === 'change' && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|number|url|search)$/.test(el.type)))) return;
    if (f.id === 'ggNewForm') {
      draft = readForm(f);
      if (el.name === 'remote') {
        var pl = f.querySelector('.gn-f--place');
        if (pl) pl.hidden = el.value === 'remote';
        if (el.value === 'remote') U.fieldErrors(f, { place: '' }, { focus: false });
      }
      // 一度確かめたあとは、直すたびに誤りを見直す。まだなら禁止の言葉だけをその場で出す
      if (newTried) U.fieldErrors(f, merge(blankErrs(), precheck(draft)), { focus: false });
      else if (/^(title|desc|reward)$/.test(el.name)) bannedLive(f, el);
    } else if (f.hasAttribute('data-gg-send') && el.name === 'text') {
      msgDraft[f.getAttribute('data-gg-send')] = el.value;
      var err = f.querySelector('.form-err');
      if (err && err.textContent) { err.innerHTML = ''; el.removeAttribute('aria-invalid'); }
    }
  }
  /* スレッドの欄は Ctrl（Mac は ⌘）＋Enter でも送れる（変換中の Enter では送らない） */
  function onKey(e) {
    var el = e.target;
    if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.isComposing || e.keyCode === 229) return;
    var f = el && el.form;
    if (!f || !f.hasAttribute('data-gg-send') || !f.closest('.scr-gigs')) return;
    e.preventDefault();
    sendMsg(f);
  }

  CLG.screens.gigs = {
    title: function (ctx) {
      var id = ctx.params && ctx.params[0];
      if (!id) return '案件';
      if (id === 'new') return fromGig(ctx) ? '募集を直す' : '募集を出す';   // 見出し（renderNew・renderLocked）と同じ
      var g = R.gig(id);
      return g ? g.title : 'ページが見つかりません';
    },
    render: function (ctx) {
      var id = ctx.params && ctx.params[0];
      if (!id) return renderList(ctx);
      if (id === 'new') return renderNew(ctx);
      var g = R.gig(id);
      return g ? renderDetail(ctx, g) : U.notFound({ lead: 'この案件は見つかりません。掲載が終わったか、アドレスが違います。' });
    },
    back: function (ctx) {
      var id = ctx.params && ctx.params[0];
      if (!id) return null;
      var from = id === 'new' && ctx.query && ctx.query.from;
      if (from && ownGig(from)) return { href: '#/gigs/' + encodeURIComponent(from), label: '自分の募集' };
      return { href: '#/gigs', label: '案件' };
    },
    mount: function (root, ctx) {
      cur = ctx;
      var f = root.querySelector('#ggNewForm');
      if (f) U.fieldErrors(f, {}, { focus: false });   // 必須の札
      // やりとりは新しいものが下。開いたとき・送ったときは下の端を見せる
      U.$$('.scr-gigs .gt-list', root).forEach(function (l) { l.scrollTop = l.scrollHeight; });
      // 絞り込みの札はスマホで横に流れる。選んでいる札が列の外（右端のぼかしの中も）にあれば、列だけを送って見せる
      // （「同じ種類の案件を見る」から ?type=peer で来たときなど。ページの縦の位置は動かさない）
      var on = root.querySelector('.scr-gigs .gg-filter [aria-pressed="true"]');
      if (on && on.parentNode.scrollWidth > on.parentNode.clientWidth + 1) {
        var bar = on.parentNode, br = bar.getBoundingClientRect(), cr = on.getBoundingClientRect();
        if (cr.left < br.left || cr.right > br.right - 24) bar.scrollLeft += cr.left - br.left - 16;
      }
      noticeChange(root, ctx);
      // root（#view）はどの画面でも同じ要素。付けるのは1回だけにし、案件の画面の中の操作だけを拾う
      if (root.__boundGigs) return;
      root.__boundGigs = true;
      root.addEventListener('click', onClick);
      root.addEventListener('submit', onSubmit);
      root.addEventListener('input', onInput);
      root.addEventListener('change', onInput);
      root.addEventListener('keydown', onKey);
      // 「募集終了（直近30日）」を開いたか。toggle は泡立たないので、捕まえる側で拾う
      root.addEventListener('toggle', function (e) {
        var d = e.target;
        if (d && d.matches && d.matches('.scr-gigs [data-gg-closed]')) closedOpen = d.open;
      }, true);
      // ほかの画面へ移ったら「同じ画面の描き直し」ではなくなる（戻ってきたときに知らせを出さない）
      window.addEventListener('hashchange', function () { if (!/^#\/gigs\/[^?]/.test(location.hash)) lastShown = ''; });
    }
  };
})();
