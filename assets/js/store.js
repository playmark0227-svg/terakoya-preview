/* ============================================================
   保存層（試作版はこのブラウザの localStorage だけ）
   ------------------------------------------------------------
   本番ではここを Firestore などに差し替える。画面とルールは
   CLG.store.state を読み、CLG.store.update() で書く約束にしてあるので、
   差し替えてもほかのファイルは直さなくていい。

   ■ 使い方
     store.state                   いまの会員の状態（下の形）
     store.update(fn)              fn(state) の中で書き換える → 保存 → 画面に知らせる。fn の戻り値を返す
     store.on(fn) / store.off(fn)  変わったときに呼ばれる（別のタブで変わったときも。管理画面のタブと会員のタブをそろえるため）
     store.resetDemo(keep)         デモ会員（高橋さくら・入会24日目）に戻す。keep=true ならログインしたまま
     store.startVeteran(keep)      在籍半年の会員（木村あや）で始める
     store.startFresh(form)        公開サイトの入会フォームから、入会したての会員として始める
     （3つとも、講座のメモの古いキーと、探す欄の最近の言葉（terakoya-search-recent:…）も消す）
     store.login() / logout()      store.migrate(s) v1 の状態を v2 に直す（テスト用に外に出してある）
     store.applyCms()              state.cms を data.js の配列に重ね直す（ふつうは呼ばなくていい。読み込み・update・別のタブの変更で自動）
     store.cmsBase(kind)           data.js の元の中身（運営が直す前）。kind: faculty / course / lesson / archive / gig / perk / event / notice

   ■ 運営が直した中身（CMS）と、サービス全体の設定 ★2026-09-25
     state.cms（運営画面の R.cmsUpsert / R.cmsRemove / R.cmsReorder が書く）を、data.js の配列
     FACULTIES・COURSES（回を含む）・ARCHIVE・GIGS・GIGS_CLOSED・PERKS・EVENTS に「その場で」重ねる。
     見えていない学部（下書き・削除）の講座は COURSES から外す。
     重ね方は毎回 data.js の元の中身から作り直す（何度重ねても同じ。記録を消せば元に戻る）。
     会員に見せるのは公開のものだけ（下書き・非公開・予約公開の前・削除は配列から外す。回が1つも公開されていない講座も外す）。
     運営画面で下書きも含めて並べるときは R.cmsList(kind) を使う（DATA の配列は「会員に見えるもの」）。
     重ねる時：読み込んだとき・update のあと（cms が変わったときと、予約公開の時刻が来たとき）・別のタブで保存が変わったとき。
     state.cms と state.settings は、人を切り替えても（resetDemo・startVeteran・startFresh）引き継ぐ（運営の中身なので）。
     タイムラインの見回り（staffPosts・pins・hiddenPosts・hiddenComments）も同じく引き継ぐ（運営が書くもの。R.resetStaffFeed で消す）。

   ■ 状態の形（v2）。足すのはよいが、名前は変えない。★ はルール（domain.js）があとから書く入れ物
   { v: 2, kind: 'demo'|'veteran'|'fresh', session: bool,
     me: { id（会員番号 TS-000000 の形。前の TK- で保存した記録は、読み込む前に TS- に直す＝下の renumber）, name, kana, area, job, goal, joinedAt, color, refCode, email, card, lineLinked, personId?（PEOPLE のid。タイムラインの同じ人を自分として扱う） },
     // 学び
     done: {回id: 時刻}, archiveSeen: {録画id: 時刻}, lessonPos: {回id: 秒}, notes: {回id: 文}, quiz: {講座id: {score, total, passed, at}},
     certificates: {講座id: {no, at}}, steps: {項目id: 時刻}, goal30: {what, by, at}|null, xpLog: [{at, xp, why, link?}], seenLevel,
     // タイムライン
     posts: [{id, kind, text, at, likes, comments, replies[], images?[]}], likes: {投稿id: true},
     comments: [{id, postId, replyTo, by:'me', at, text, answer, thanks（もらった数）, thanksFrom[]}],
     thanks: {コメントid: 時刻}（自分が押した「ありがとう」）, postEdits: {投稿id: {text, at}}, deleted: {投稿id: 時刻},
     reports: [{id, postId, commentId?, reason, at, status（受付/非表示/注意/対応不要）, doneAt?}], mutes: {人のid: 時刻},
     ★answerMarks: {コメントid: 時刻}（運営が回答に選んだ、ほかの人のコメント）,
     ★staffPosts: [{id, kind（news/new/gig/event）, by（運営のid）, text, link?, pinned?, at, editedAt?}]（運営画面から出した投稿。at が先なら予約）,
     ★pins: {投稿id: {on, at}}（運営が固定した・外した印。data.js の投稿の pinned より優先。運営の投稿は記録の pinned に書く）,
     ★hiddenPosts: {投稿id: {at, reason}}（運営が隠した投稿）, ★hiddenComments: {コメントid: {at, reason}}（運営が隠したコメント）,
     // 案件
     gigs: {案件id: {status（applied/meeting/active/done/rewarded/declined）, at, note, reward?, doneAt?, meetingAt?, meetingOfferedAt?, startedAt?, rewardedAt?,
             declinedAt?, declineReason?, paidAt?（振込先を消したときに、払った報酬を残す）}},
     myGigs: [自分が出した募集（GIGS と同じ形＋applicants[{person, at, note, status, decidedAt?}]
              ＋ status（review/open/rejected/closed）, submittedAt, payment, place, rejectReason, closedAt?, resubmittedAt?）],
     gigThreads: {案件id: [{from, at, text}]},
     gigHistory: {案件id: [{at, text}]}, workReports: [{id, gig, at, month（「9月分」）, url, fileName, memo, status}],
     bank: null|{bank, branch, kind（普通/当座）, tail（口座番号の下4桁だけ）, holder, invoiceNo, at},
     // イベント
     events: {イベントid: 予約した時刻}, attended: [{id, title, at, kind?, speaker?}], waitlist: {イベントid: 時刻},
     proposals: [{id, kind:'event'|'speaker', event?, title, at?, online, place, cap, fee, desc, status（review/approved/rejected）, sentAt, decidedAt?, reason?}],
     // メッセージ・お知らせ・相談
     thread: [{from, at, text, kind?, auto?（自動送信）, ref?（'lesson:<講座>/<回>' / 'archive:<録画>' / 'gig:<案件>' / 'meeting:<id>'）,
               attachments?[{name, type（image/pdf/file）, size, url}],
               card?{type:'meeting', id, at, status（pending/confirmed/canceled）, min, bookedAt, zoomUrl?, confirmedAt?}}]
              （at が未来のものは、その時刻まで出さない）, threadRead: 時刻|null,
     noticesRead: {お知らせid: 時刻}, ★extraNotices: [{id, type, icon, at, text, link, go}]（ルールと運営画面が出したお知らせ）,
     expertRequests: [{id, expert, at, status（受付/日程調整/予約確定/相談済み）, text, when, history[{at, status}]}],
     // 紹介・ポイント
     referred: [{id, person, initial, joinedAt, status（active/left）, leftAt?, no?}], refClicks, referredBy,
     rewardStatus: {明細id（'r1-1' など）: {status（confirmed/scheduled/paid/void）, at, payAt?, ym?（締めた月 'YYYY-MM'）, note?（繰り越しの理由）, reason?（取消の理由）}}
                   （運営画面が確定・締め・支払い・取消を付けたもの。振込先を消したときは、払った分を paid で残す）,
     pointsLog: [{id?, at, pt, why, rule, link?（#/feed/<投稿>?c=<コメント> など）, by?:'staff', revoked?, revokedAt?, revokeWhy?}],
     ★pointGrants: [{id, person, at, pt, rule, why, link, by:'staff', revoked?, revokedAt?, revokeWhy?}]（運営がほかの会員に付けたpt）,
     // 支払い・アカウント
     plan: {status, cancelAt, graceUntil, endedAt, pausedUntil, failedAt?, pausedAt?, cancelReasons?[], canceledAt?},
     invoices: [{id, at, amount, status（paid/failed/refunded）, paidAt?, refund?{at, amount, reason}, demo?（試作版バーが足した行。切り替えのたびに消す）}],
     pause: null|{at, until},
     emailPending: null|{addr, at, sentAt, token}, passwordSetAt: 時刻|null（入会したては null）, sessions: [{id, device, place, since, lastAt, current}],
     notifyPrefs: {種類: {line, email}}, profile: {nickname, visibility（city/pref/none）, photo（data URL か ''）},
     lineLink: {status（none/pending/linked/failed）, at, code?（連携コード）},
     dataRequests: [{id, kind（export/delete）, at, status（received/canceled/done）, canceledAt?, doneAt?}],
     ★loginBlock: null|{on, at, reason}（運営画面の「ログインを止める」。R.setLoginBlocked が書く）,
     // 運営の中身（人を切り替えても引き継ぐ）
     ★cms: {savedAt, rev, items: {種類: {id: 記録}}, order: {並びの名前: [id…]}}（R.cmsUpsert などが書く。重ね方は下の「運営が直した中身」）,
     ★settings: {meetSlots?: {min, weekly[{dow, time}], off[{at, why}], fixed?[時刻]}}（R.setMeetingSlots が書く） }
   ============================================================ */
(function (global) {
  'use strict';
  var CLG = global.CLG = global.CLG || {};
  var DATA = CLG.DATA;
  var KEY = 'terakoya-proto-v1';      // 保存のキーは v1 のまま（中身の v で版を見分けて、古いものは直して使う）
  var NOTES_KEY = 'terakoya-notes';   // v1 で講座のメモを入れていたキー。v2 は state.notes に入れる
  var ADMIN_KEY = 'terakoya-admin-v1';  // 運営画面の保存（seed.js）。ここでは会員番号を直すときだけ触る
  var VERSION = 2;
  var MIN = 60000, DAY = 86400000;
  var listeners = [];

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function daysAgo(n, hh, mm) { return DATA.D(-n, hh, mm); }
  function plus(x, minutes) { return new Date(new Date(x).getTime() + minutes * MIN).toISOString(); }
  function nowIso() { return CLG.now().toISOString(); }
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i]; return null; }
  /* data.js の元の中身（運営が直す前）。デモの人の記録（見終えた回・録画など）は、運営の直しに左右されないように、こちらから作る */
  var BASE = {
    FACULTIES: DATA.FACULTIES.slice(), COURSES: DATA.COURSES.slice(), ARCHIVE: DATA.ARCHIVE.slice(), GIGS: DATA.GIGS.slice(), GIGS_CLOSED: DATA.GIGS_CLOSED.slice(),
    PERKS: DATA.PERKS.slice(), EVENTS: DATA.EVENTS.slice()
  };
  function course(id) { return byId(BASE.COURSES, id); }
  function pad(n, w) { var s = String(n); while (s.length < w) s = '0' + s; return s; }
  /** いまより前に収める（n 分前まで） */
  function past(x, n) { return new Date(Math.min(new Date(x).getTime(), CLG.now().getTime() - (n || 1) * MIN)).toISOString(); }
  /** 次の平日の10:00（入会のあいさつを担当が送る時刻） */
  function nextTen(from) {
    var d = new Date(from), t = new Date(d);
    t.setHours(10, 0, 0, 0);
    if (t <= d) t.setDate(t.getDate() + 1);
    while (t.getDay() === 0 || t.getDay() === 6) t.setDate(t.getDate() + 1);
    return t.toISOString();
  }
  /** 通知の最初の設定（DATA.NOTIFY_TYPES の既定値） */
  function defaultPrefs() {
    var o = {};
    (DATA.NOTIFY_TYPES || []).forEach(function (t) { o[t.id] = { line: !!t.line, email: !!t.email }; });
    return o;
  }
  /** 投稿の本文の頭（ポイントの理由に「◯◯さん「…」」と書くため） */
  function head(text, n) {
    var t = String(text || '').split('\n')[0];
    var q = t.search(/[？?。]/);
    if (q >= 0 && q < (n || 26)) return t.slice(0, q + 1);
    return t.length > (n || 26) ? t.slice(0, n || 26) + '…' : t;
  }
  function personName(id) { var p = DATA.PEOPLE[id]; return p ? p.name : '会員'; }
  function post(id) { return byId(DATA.FEED, id); }

  /* ---------- 何もしていない状態（すべての入れ物をそろえる） ---------- */
  function blank(me) {
    return {
      v: VERSION,
      kind: 'fresh',
      session: false,
      me: me,
      // 学び
      done: {}, archiveSeen: {}, lessonPos: {}, notes: {}, quiz: {}, certificates: {},
      steps: {}, goal30: null, xpLog: [], seenLevel: 1,
      // タイムライン（answerMarks・staffPosts・hiddenPosts は運営画面が R.* で書く）
      posts: [], likes: {}, comments: [], thanks: {}, postEdits: {}, deleted: {}, reports: [], mutes: {},
      answerMarks: {}, staffPosts: [], pins: {}, hiddenPosts: {}, hiddenComments: {},
      // 案件
      gigs: {}, myGigs: [], gigThreads: {}, gigHistory: {}, workReports: [], bank: null,
      // イベント
      events: {}, attended: [], waitlist: {}, proposals: [],
      // メッセージ・お知らせ・相談
      thread: [], threadRead: null, noticesRead: {}, extraNotices: [], expertRequests: [],
      // 紹介・ポイント
      referred: [], refClicks: 0, referredBy: null, rewardStatus: {}, pointsLog: [], pointGrants: [],
      // 支払い・アカウント
      plan: { status: 'active', cancelAt: null, graceUntil: null, endedAt: null, pausedUntil: null },
      invoices: [], pause: null,
      emailPending: null, passwordSetAt: null, sessions: [], notifyPrefs: defaultPrefs(),
      profile: { nickname: '', visibility: 'pref', photo: '' },
      lineLink: { status: 'none', at: null },
      dataRequests: [], loginBlock: null,
      // 運営の中身（人を切り替えても引き継ぐ。carry を見る）
      cms: emptyCms(), settings: {}
    };
  }
  function emptyCms() { return { savedAt: null, rev: '', items: {}, order: {} }; }

  /* 見終えた回を入れて、XPを記録する。times: [[回id, 時刻], ...] */
  function watch(s, times) {
    times.forEach(function (x) {
      var id = x[0], at = x[1], c = null, l = null;
      BASE.COURSES.forEach(function (cc) { cc.lessons.forEach(function (ll) { if (ll.id === id) { c = cc; l = ll; } }); });
      if (!l) return;
      s.done[id] = at;
      s.xpLog.push({ at: at, xp: DATA.XP.lesson, why: '講座「' + c.title + '」' + l.title, link: '#/lesson/' + c.id + '/' + l.id });
    });
  }
  /* 修了した講座に修了証の番号を付ける（修了した順に 01, 02, …） */
  function certify(s) {
    var list = BASE.COURSES.map(function (c) {
      var ts = c.lessons.map(function (l) { return s.done[l.id]; });
      if (ts.some(function (t) { return !t; })) return null;
      return { id: c.id, at: ts.sort().pop() };
    }).filter(Boolean).sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
    s.certificates = {};
    list.forEach(function (x, i) { s.certificates[x.id] = { no: s.me.id + '-' + pad(i + 1, 2), at: x.at }; });
  }
  function nthLessonAt(s, n) {
    var ts = Object.keys(s.done).map(function (k) { return s.done[k]; }).sort(function (a, b) { return new Date(a) - new Date(b); });
    return ts[n - 1] || ts[ts.length - 1];
  }
  function stepAt(s, id, at) {
    var st = byId(DATA.ONBOARDING, id);
    s.steps[id] = at;
    s.xpLog.push({ at: at, xp: st.xp, why: 'スタートガイド「' + st.title + '」', link: '#/start' });
  }
  /** お知らせは、新しいほうから keep 件だけ未読にしておく */
  function readAllBut(s, keep) {
    var list = DATA.noticesFor(s).sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
    s.noticesRead = {};
    list.slice(keep).forEach(function (n) { s.noticesRead[n.id] = plus(n.at, 30); });
  }

  /* ---------- デモ会員（高橋さくら・入会24日目）の状態 ----------
     XPの合計は530（Lv3「稽古」）。講座をあと2回見るとLv4になり、講座が4つ開く。
     打ち合わせで「見終わる → レベルが上がる → 次が開く」をその場で見せるための設定。
     スタートガイドの各項目の時刻は、それを済ませた記録（3回目の講座・自己紹介・応募など）の時刻にそろえる。 */
  function demoState() {
    var M = DATA.MEMBER, DM = DATA.DEMO;
    var joinedAt = M.joinedAt;
    var s = blank({
      id: M.id, name: M.name, kana: M.kana, area: M.area, job: M.job, goal: M.goal,
      joinedAt: joinedAt, color: M.color, refCode: M.refCode, email: M.email, card: M.card,
      lineLinked: true
    });
    s.kind = 'demo';
    function log(at, xp, why, link) { s.xpLog.push({ at: at, xp: xp, why: why, link: link }); }

    // 見終えた回（14回）。子どもが寝たあとの22時台
    var W = [];
    ['ori-1', 'ori-2', 'ori-3', 'ori-4'].forEach(function (id, i) { W.push([id, daysAgo(22 - i, 22, 10 + i * 3)]); });
    ['bb-1', 'bb-2', 'bb-3', 'bb-4', 'bb-5'].forEach(function (id, i) { W.push([id, daysAgo(19 - i, 22, 40)]); });
    ['ok-1', 'ok-2', 'ok-3'].forEach(function (id, i) { W.push([id, daysAgo(14 - i, 22, 20)]); });
    ['sb-1', 'sb-2'].forEach(function (id, i) { W.push([id, daysAgo(4 - i, 22, 15)]); });
    watch(s, W);
    s.lessonPos = { 'sb-3': 214 };   // 第3回を3分半まで見たところ

    // 自分の投稿（自己紹介と、はじめての案件の報告）
    var my1 = clone(DATA.DEMO_POSTS.my1), my2 = clone(DATA.DEMO_POSTS.my2);
    s.posts.push(my1, my2);
    log(my1.at, DATA.XP.post, 'タイムラインに投稿', '#/feed/my1');
    log(my2.at, DATA.XP.post, 'タイムラインに投稿', '#/feed/my2');

    // イベント参加（2回）。XPは終わった時刻に付く
    DATA.PAST_EVENTS.forEach(function (e) {
      s.attended.push({ id: e.id, title: e.title, at: e.at, kind: e.kind });
      log(plus(e.at, e.min || 60), DATA.XP.event, 'イベント「' + e.title + '」に参加', e.archive ? '#/courses/archive/' + e.archive : '#/events');
    });

    // 勉強会の録画（2本）。動画編集の勉強会と、いちばん新しいAI勉強会
    [['ar-7', daysAgo(10, 22, 30)], ['ar-1', null]].forEach(function (x) {
      var a = byId(BASE.ARCHIVE, x[0]);
      var at = x[1];
      if (!at) { var t = new Date(a.newAt); t.setHours(22, 0, 0, 0); if (t < new Date(a.newAt)) t.setDate(t.getDate() + 1); at = past(t.toISOString(), 60); }
      s.archiveSeen[a.id] = at;
      log(at, DATA.XP.archive, '勉強会の録画「' + a.title + '」', '#/courses/archive/' + a.id);
    });

    // 案件：商品モニター（完了）と、アプリのテストユーザー（面談の調整中）
    var g1At = daysAgo(14, 12, 20), g1Done = daysAgo(11, 20, 0), g2At = daysAgo(2, 12, 5);
    s.gigs.g1 = { status: 'done', at: g1At, reward: 1200, doneAt: g1Done };
    log(g1Done, DATA.XP.gigDone, '案件「' + byId(BASE.GIGS, 'g1').title + '」が完了', '#/gigs/g1');
    s.gigs.g2 = { status: 'meeting', at: g2At, note: '平日の夜なら参加できます', meetingOfferedAt: DM.g2MsgAt };
    s.gigHistory = {
      g1: [{ at: g1At, text: '応募しました' }, { at: DATA.staffAfter(g1At, 60), text: '運営から手順が届きました' },
        { at: daysAgo(13, 18, 30), text: '商品が届きました' }, { at: daysAgo(12, 22, 5), text: 'アンケートに答えて写真を出しました' },
        { at: g1Done, text: '完了しました（報酬は翌月末払い）' }],
      g2: [{ at: g2At, text: '応募しました' }, { at: DM.g2MsgAt, text: '運営から面談の候補が届きました' }]
    };
    s.gigThreads = {
      g2: [{ from: 'staff3', at: DATA.staffAfter(g2At, 50), text: '応募ありがとうございます。担当の青木です。面談の候補は運営の佐藤さんから「相談・メッセージ」に送ります。' }]
    };

    // スタートガイド（9/10。残りは成果発表会）。時刻は済ませた記録にそろえる
    stepAt(s, 'profile', plus(joinedAt, 13));
    stepAt(s, 'line', plus(joinedAt, 16));
    stepAt(s, 'intro', my1.at);
    stepAt(s, 'orient', s.done['ori-4']);
    stepAt(s, 'lesson3', nthLessonAt(s, 3));
    stepAt(s, 'event', plus(DATA.PAST_EVENTS[0].at, 60));
    stepAt(s, 'gig', g1At);
    stepAt(s, 'meet', DM.meetBookedAt);
    stepAt(s, 'goal', DM.goalAt);
    var by = new Date(joinedAt); by.setDate(by.getDate() + 30); by.setHours(23, 59, 0, 0);
    s.goal30 = { what: '動画編集の講座を修了して、最初の編集案件に応募する', by: by.toISOString(), at: DM.goalAt };
    certify(s);

    // イベントの予約とキャンセル待ち
    s.events.e2 = daysAgo(2, 20, 0);
    s.events.e4 = daysAgo(5, 20, 0);
    s.waitlist = { e15: daysAgo(4, 22, 0) };   // Instagram添削会（満席）

    // タイムラインのコメント（質問への回答4件・新入生へのあいさつ4件）と、もらった「ありがとう」
    var C = [
      ['c-d1', 'q8', daysAgo(9, 21, 50), true, ['m17'], '私は商品モニターから始めました。スマホで写真を撮ってアンケートに答えるだけなので、子どもがいても進めやすかったです。'],
      ['c-d2', 'q6', daysAgo(7, 22, 5), true, ['m16'], '22時から30分だけ、と決めています。眠い日は1回だけ見て寝ます。'],
      ['c-d3', 'q5', daysAgo(5, 22, 20), true, ['m24'], '各回の動画の下に「資料」があります。第1回のPDFは1ページでした。'],
      ['c-d4', 'q3', daysAgo(3, 21, 40), true, ['m13'], '私は30日後の目標の決め方を相談しました。15分で、話しやすかったです。'],
      ['c-d5', 'i17', daysAgo(12, 22, 5), false, [], '比嘉さん、よろしくお願いします。私も子どもが寝たあとに進めています。'],
      ['c-d6', 'i16', daysAgo(9, 22, 50), false, [], '工藤さん、よろしくお願いします。同じ事務職です。'],
      ['c-d7', 'i13', daysAgo(6, 22, 30), false, [], '岡田さん、よろしくお願いします。紹介の案件は、オリエンテーションを見終えると応募できますよ。'],
      ['c-d8', 'i15', daysAgo(3, 22, 0), false, ['m15'], 'はるなさん、よろしくお願いします。北海道どうしですね。']
    ];
    s.comments = C.map(function (c) {
      return { id: c[0], postId: c[1], replyTo: null, by: 'me', at: c[2], text: c[5], answer: c[3], thanks: c[4].length, thanksFrom: c[4] };
    });
    s.thanks = { 'p10-r2': daysAgo(3, 22, 30) };   // 中島さんのもくもく会の進め方に「ありがとう」

    // 紹介
    s.referred = DATA.REFERRED.map(function (r) {
      return { id: r.id, person: r.person, initial: (DATA.PEOPLE[r.person] || {}).initial || '', joinedAt: daysAgo(r.joinedDaysAgo, 20), status: r.status };
    });
    s.refClicks = DATA.REF_CLICKS;

    // 貢献ポイント（合計140。紹介ではポイントは付かない）。理由と、その記録へのリンク
    var P = [];
    function pt(at, rule, why, link) {
      var r = byId(DATA.POINT_RULES, rule);
      P.push({ at: at, pt: r.pt, rule: rule, why: why, link: link });
    }
    var pe2 = DATA.PAST_EVENTS[1];
    pt(plus(pe2.at, 90), 'host', 'イベントを手伝った（「' + pe2.title + '」の受付）', '#/courses/archive/' + pe2.archive);
    pt(my2.at, 'win', '成果を報告した（はじめての案件が完了）', '#/feed/my2');
    s.comments.forEach(function (c) {
      var p = post(c.postId);
      if (!p) return;
      // リンクはそのコメントの場所まで（#/feed/<投稿>?c=<コメント>）
      var at = '#/feed/' + p.id + '?c=' + c.id;
      if (c.answer) pt(DATA.staffAfter(c.at, 20), 'answer', '質問に答えた（' + personName(p.by) + 'さん「' + head(p.text) + '」）', at);
      else pt(c.at, 'welcome', '新入生に声をかけた（' + personName(p.by) + 'さんの自己紹介）', at);
    });
    [['c-d1', daysAgo(1, 21, 30)], ['c-d2', daysAgo(7, 22, 30)], ['c-d3', daysAgo(5, 22, 40)], ['c-d4', daysAgo(2, 12, 30)], ['c-d8', daysAgo(3, 22, 30)]]
      .forEach(function (x) {
        var c = byId(s.comments, x[0]);
        pt(x[1], 'thanks', 'コメントに「ありがとう」をもらった（' + personName(c.thanksFrom[0]) + 'さんから）', '#/feed/' + c.postId + '?c=' + c.id);
      });
    s.pointsLog = P.sort(function (a, b) { return new Date(a.at) - new Date(b.at); });

    s.likes = { p9: true, p6: true, p14: true };
    s.thread = clone(DATA.THREAD);
    s.threadRead = plus(DM.g2MsgAt, -1);        // 今日の1通だけ未読
    readAllBut(s, 4);                            // お知らせは新しい4件だけ未読
    s.invoices = [{ id: 'in_' + M.id + '_1', at: joinedAt, amount: DATA.SITE.price, status: 'paid' }];
    s.seenLevel = 3;
    s.passwordSetAt = plus(joinedAt, 8);
    s.lineLink = { status: 'linked', at: plus(joinedAt, 16) };
    s.sessions = [
      { id: 'se1', device: 'iPhone（Safari）', place: '北海道', since: plus(joinedAt, 8), lastAt: nowIso(), current: true },
      { id: 'se2', device: 'iPad（Safari）', place: '北海道', since: daysAgo(15, 21, 0), lastAt: daysAgo(2, 22, 30), current: false }
    ];
    return s;
  }

  /* ---------- 在籍半年の会員（木村あや＝タイムラインの m8）の状態 ----------
     Lv5「独り立ち」。案件2つが進行中（g4 稼働中・g5 面談の調整中）、イベント14回（うち成果発表会で2回発表）、
     紹介の明細は 保留・確定・支払済・取消 がそろう（支払予定は、毎月1日〜24日のあいだに出る）。 */
  function veteranState() {
    var V = DATA.VETERAN, VJ = V.joinedAt, DD = DATA.D;
    var s = blank({
      id: V.id, name: V.name, kana: V.kana, area: V.area, job: V.job, goal: V.goal,
      joinedAt: VJ, color: V.color, refCode: V.refCode, email: V.email, card: V.card,
      lineLinked: true, personId: V.person
    });
    s.kind = 'veteran';
    function log(at, xp, why, link) { s.xpLog.push({ at: at, xp: xp, why: why, link: link }); }
    function ago(n, h, m) { return DD(-n, h, m); }

    // 講座：はじめの5講座（入会の月）、Instagram運用（4か月前）、動画編集（今月）
    var W = [], d = 179;
    ['orientation', 'business-basic', 'okozukai', 'money-tax', 'sns-basic'].forEach(function (cid) {
      course(cid).lessons.forEach(function (l) { W.push([l.id, ago(d, 21, 50)]); d -= 1; });
    });
    course('instagram').lessons.forEach(function (l, i) { W.push([l.id, ago(122 - i * 4, 22, 0)]); });
    course('video').lessons.forEach(function (l, i) { W.push([l.id, ago(20 - i * 3, 22, 10)]); });
    watch(s, W);
    s.lessonPos = { 'mk-1': 312 };
    // 確認テスト（合格でXP）
    s.quiz = {
      orientation: { score: 3, total: 3, passed: true, at: plus(s.done['ori-4'], 12) },
      'sns-basic': { score: 2, total: 3, passed: true, at: plus(s.done['sb-5'], 10) }
    };
    log(s.quiz.orientation.at, DATA.XP.quiz, '確認テストに合格（オリエンテーション）', '#/courses/orientation');
    log(s.quiz['sns-basic'].at, DATA.XP.quiz, '確認テストに合格（SNS発信入門）', '#/courses/sns-basic');
    certify(s);

    // 自分の投稿（タイムラインの p17・p18 も本人の投稿として扱う：me.personId）
    var posts = [
      { id: 'mv1', kind: 'intro', at: DATA.T(-178, 22, 30), likes: 24,
        text: 'はじめまして、木村あやです。\n住んでいるところ：沖縄県 浦添市\nいまのお仕事：パート（飲食店のホール）・1児の母\nやりたいこと：お店のInstagramを任せてもらえるようになりたいです。\nよろしくお願いします！' },
      { id: 'mv2', kind: 'win', at: ago(139, 21, 40), likes: 18, text: 'はじめての案件（試食モニター）が終わりました。写真の撮り方を講座で見直してから出しました。' },
      { id: 'mv3', kind: 'post', at: ago(94, 22, 10), likes: 15, text: '那覇オフ会、今回は受付をやりました。はじめての人が5人。子連れの人が多くて、お店の人が座敷を広げてくれました。' },
      { id: 'mv4', kind: 'win', at: ago(29, 21, 30), likes: 29, text: '飲食店のInstagram投稿代行、今月から始めました。面談で見積もりの出し方を教えてもらえたのが大きかったです。' }
    ];
    posts.forEach(function (p) { p.comments = 0; p.replies = []; s.posts.push(p); log(p.at, DATA.XP.post, 'タイムラインに投稿', '#/feed/' + p.id); });

    // 参加したイベント（14回）
    var A = [];
    function att(id, title, at, kind, speaker, min) { A.push({ id: id, title: title, at: at, kind: kind, speaker: !!speaker, min: min || 60 }); }
    var w = new Date(VJ); w.setHours(20, 0, 0, 0); while (w.getDay() !== 3 || w <= new Date(VJ)) w.setDate(w.getDate() + 1);
    att('va1', '新入生オリエンテーション', w.toISOString(), 'online');   // 入会後はじめての水曜
    var sc = [-5, -3, -2, -1].map(function (k) { return DATA.lastDow(k, 5, 20); });
    att('va2', '月末の成果発表会', sc[0], 'showcase', false, 120);
    att('va3', '月末の成果発表会', sc[1], 'showcase', true, 120);
    att('va4', '月末の成果発表会', sc[2], 'showcase', false, 120);
    att('va5', '月末の成果発表会', sc[3], 'showcase', true, 120);
    function sat(n) { return DATA.satBack(n); }   // タイムラインの那覇オフ会の投稿（data.js）と同じ日にするため、data.js の道具を使う
    att('va6', '那覇オフ会', sat(95), 'offline', false, 120);
    att('va7', '那覇オフ会', sat(40), 'offline', false, 120);
    att('va8', '那覇オフ会', sat(13), 'offline', false, 120);
    var ai = [];
    for (var k = 0; ai.length < 6 && k < 30; k++) { var t = DATA.prevDow(2, 20.5, k); if (DATA.aiWeek(t)) ai.push(t); }
    att('va9', 'AI勉強会（ライブ）', ai[0], 'online', false, 75);
    att('va10', 'AI勉強会（ライブ）', ai[3], 'online', false, 75);
    att('va11', 'AI勉強会（ライブ）', ai[5], 'online', false, 75);
    att('va12', 'もくもく作業会（夜）', DATA.prevDow(5, 21, 2), 'online', false, 90);
    att('va13', 'もくもく作業会（夜）', DATA.prevDow(5, 21, 11), 'online', false, 90);
    att('va14', '税金Q&A（提携税理士と）', DATA.nthDow(-3, 3, 4, 20), 'online', false, 60);
    A.sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
    A.forEach(function (e) {
      s.attended.push({ id: e.id, title: e.title, at: e.at, kind: e.kind, speaker: e.speaker });
      log(plus(e.at, e.min), DATA.XP.event, 'イベント「' + e.title + '」に' + (e.speaker ? '発表者として' : '') + '参加', '#/events');
    });

    // 勉強会の録画（3本）
    [['ar-9', 1], ['ar-1', 2], ['ar-4', 3]].forEach(function (x) {
      var a = byId(BASE.ARCHIVE, x[0]); if (!a) return;
      var at = past(plus(a.newAt, 60 * 10 + x[1]), 60);
      s.archiveSeen[a.id] = at;
      log(at, DATA.XP.archive, '勉強会の録画「' + a.title + '」', '#/courses/archive/' + a.id);
    });

    // 案件：試食モニター・那覇の撮影（完了）、飲食店のInstagram（稼働中）、ショート動画（面談の調整中）
    var gc1At = ago(148, 12, 30), gc5At = ago(78, 21, 0), g4At = ago(40, 21, 15), g5At = ago(3, 21, 30);
    s.gigs = {
      gc1: { status: 'done', at: gc1At, reward: 1000, doneAt: ago(140, 20, 0) },
      gc5: { status: 'done', at: gc5At, reward: 18000, doneAt: ago(66, 18, 0) },
      g4: { status: 'active', at: g4At, meetingAt: ago(38, 21, 0), startedAt: ago(30, 10, 0), reward: 24000, note: '飲食店の運用を2店舗やっています。' },
      g5: { status: 'meeting', at: g5At, note: '編集した動画のリンクを用意できます。', meetingOfferedAt: DATA.THREAD_VETERAN[DATA.THREAD_VETERAN.length - 1].at }
    };
    log(s.gigs.gc1.doneAt, DATA.XP.gigDone, '案件「新商品の試食モニター（冷凍食品）」が完了', '#/gigs');
    log(s.gigs.gc5.doneAt, DATA.XP.gigDone, '案件「店舗のInstagram撮影（那覇・3店舗）」が完了', '#/gigs');
    var lastMonth = DATA.D(-35);
    var lm = (new Date(lastMonth).getMonth() + 1) + '月分';
    s.gigHistory = {
      // 募集を終えた2つも、応募から完了までの流れを残す（案件の履歴の画面で「報酬確定」から始まらないように）
      gc1: [{ at: gc1At, text: '応募しました' }, { at: DATA.staffAfter(gc1At, 60), text: '運営から手順が届きました' },
        { at: ago(144, 18, 30), text: '商品が届きました' }, { at: ago(141, 21, 50), text: 'アンケートに答えました' },
        { at: s.gigs.gc1.doneAt, text: '完了しました（報酬は翌月末払い）' }],
      gc5: [{ at: gc5At, text: '応募しました' }, { at: ago(76, 21, 0), text: '運営と面談（15分）' },
        { at: ago(70, 10, 0), text: '3店舗の撮影（那覇市内）' }, { at: ago(67, 21, 30), text: '写真を納品しました（120枚）' },
        { at: s.gigs.gc5.doneAt, text: '完了しました（報酬は翌月末払い）' }],
      g4: [{ at: g4At, text: '応募しました' }, { at: s.gigs.g4.meetingAt, text: '運営と面談（15分）' },
        { at: ago(33, 14, 0), text: 'お店とオンラインで顔合わせ' }, { at: s.gigs.g4.startedAt, text: '稼働を始めました' },
        { at: ago(5, 9, 50), text: lm + 'の作業報告を出しました' }, { at: ago(5, 10, 30), text: lm + 'の作業報告が受け取られました' }],
      g5: [{ at: g5At, text: '応募しました' }, { at: s.gigs.g5.meetingOfferedAt, text: '面談の候補が届きました' }]
    };
    s.gigThreads = {
      g4: [
        { from: 'staff4', at: DATA.staffAfter(s.gigs.g4.meetingAt, 30), text: '面談ありがとうございました。お店との顔合わせは来週の月曜14時でどうでしょう。30分の予定です。' },
        { from: 'me', at: ago(37, 21, 40), text: '月曜14時でお願いします。お店の写真は、先に何枚かもらえますか。' },
        { from: 'staff4', at: ago(36, 10, 5), text: '店長さんから20枚届いています。共有のフォルダに入れました。' },
        { from: 'me', at: ago(5, 9, 50), text: lm + 'の投稿レポートを出しました。保存数が多かったのは、ランチの日替わりの投稿でした。' },
        { from: 'staff4', at: ago(5, 10, 30), text: '受け取りました。店長さんにも共有します。来月もこの形でお願いします。' }
      ],
      g5: [{ from: 'staff3', at: DATA.staffAfter(g5At, 40), text: '応募ありがとうございます。面談の候補は「相談・メッセージ」に送りました。' }]
    };
    s.workReports = [{ id: 'wr1', gig: 'g4', at: ago(5, 9, 50), month: lm, url: '', fileName: lm + '_投稿レポート.pdf',
      memo: '8投稿（うちリール2本）。保存数が多かったのはランチの日替わり。', status: '受領' }];
    s.bank = { bank: '琉球銀行', branch: '浦添支店', kind: '普通', tail: '4567', holder: 'キムラ アヤ', invoiceNo: '', at: ago(139, 22, 0) };
    // 自分が出した募集（会員どうし）
    s.myGigs = [{ id: 'mg1', type: 'peer', title: '店舗撮影のアシスタント（浦添市内・2時間）', reward: '1回 4,000円', rewardType: 'shot', level: 2,
      time: '2時間・浦添市内', remote: false, slots: '1名', by: 'me', status: 'open', postedAt: ago(6, 21, 0), closesAt: DATA.D(8, 23, 59), isNew: true,
      desc: '飲食店の撮影で、レフ板を持ったり料理を並べたりする手伝いです。撮影はこちらでします。',
      applicants: [
        { person: 'm25', at: ago(4, 22, 10), note: '土曜なら行けます。', status: 'applied' },
        { person: 'm17', at: ago(2, 13, 0), note: '子どもを預けられる日なら行けます。', status: 'applied' }
      ] }];

    // スタートガイド（10/10）
    var sorted = W.map(function (x) { return x[1]; }).sort();
    stepAt(s, 'profile', plus(VJ, 15));
    stepAt(s, 'line', plus(VJ, 18));
    stepAt(s, 'intro', posts[0].at);
    stepAt(s, 'orient', s.done['ori-4']);
    stepAt(s, 'lesson3', sorted[2]);
    stepAt(s, 'event', plus(A[0].at, 60));
    stepAt(s, 'meet', plus(VJ, 60 * 24 * 7 + 60));
    stepAt(s, 'goal', plus(VJ, 60 * 24 * 8 + 90));
    stepAt(s, 'gig', gc1At);
    stepAt(s, 'showcase', plus(sc[0], 120));
    var by = new Date(VJ); by.setDate(by.getDate() + 30); by.setHours(23, 59, 0, 0);
    s.goal30 = { what: 'Instagram運用の講座まで進んで、運用代行の案件に応募する', by: by.toISOString(), at: s.steps.goal };

    // イベントの予約
    s.events = { e6: ago(3, 22, 0), e4: ago(10, 21, 0) };

    // 紹介：保留・確定・支払予定/支払済・取消がそろうように
    var refLeft = DATA.ROSTER.filter(function (m) { return m.status === 'left' && m.joinedDaysAgo > 50 && m.joinedDaysAgo < 120; })[0];
    s.referred = [
      { id: 'v1', person: 'm14', initial: 'F', joinedAt: ago(150, 20, 0), status: 'active' },
      { id: 'v2', person: 'm19', initial: 'K', joinedAt: ago(95, 21, 0), status: 'active' },
      { id: 'v3', person: 'm25', initial: 'T', joinedAt: plus(nowIso(), -(30 * 24 * 60 + 10)), status: 'active' },   // 30日と10分前 → 1か月目がちょうど「確定」
      { id: 'v4', person: 'm17', initial: 'H', joinedAt: ago(12, 13, 0), status: 'active' },
      { id: 'v5', person: null, no: refLeft ? refLeft.no : null, initial: 'T', joinedAt: ago(70, 20, 0), leftAt: ago(52, 23, 59), status: 'left' }
    ];
    s.refClicks = 38;
    // 支払予定は、日付だけで決めると毎月1日〜25日の10時にしか出ない。運営が締めた行（rewardStatus の scheduled）を1つ置いて、
    // いつ開いても保留・確定・支払予定・支払済・取消の5つがそろうようにする（v2 の3回目の決済は35日前 → 5日前に確定 → 運営が締めた）
    s.rewardStatus = { 'v2-3': { status: 'scheduled', at: ago(1, 18, 0) } };

    // 貢献ポイント（42件。今月は170）。どの行にも、その記録の場所（投稿・コメント・録画）へのリンクを付ける。
    // 古い分の投稿（半年前までの質問・自己紹介・オフ会の報告）も data.js の FEED に入れてある。
    // 今月の分（25日前より後）の日付は変えない（今月の合計を170にそろえているため）
    var P = [];
    function pt(at, rule, why, link) { var r = byId(DATA.POINT_RULES, rule); P.push({ at: at, pt: r.pt, rule: rule, why: why, link: link || '' }); }
    /** タイムラインにある、木村さん（m8）のコメント */
    function mine(postId, commentId) {
      var p = post(postId), c = p && byId(p.replies || [], commentId);
      return c && c.by === V.person ? { p: p, c: c, href: '#/feed/' + p.id + '?c=' + c.id } : null;
    }
    function asked(x) { return personName(x.p.by) + 'さん「' + head(x.p.text) + '」'; }
    /** 成果発表会：その日の録画があれば録画、なければその回のことを書いた運営の投稿 */
    function showcaseLink(at, postId) {
      var day = new Date(at).toDateString();
      var a = DATA.ARCHIVE.filter(function (x) { return x.faculty === 'showcase' && new Date(x.date).toDateString() === day; })[0];
      return a ? '#/courses/archive/' + a.id : post(postId) ? '#/feed/' + postId : '#/events';
    }
    pt(plus(sc[1], 125), 'speak', '成果発表会で発表した（Instagramの写真の撮り方）', showcaseLink(sc[1], 'p43'));
    pt(plus(sc[3], 125), 'speak', '成果発表会で発表した（運用代行を始めるまで）', showcaseLink(sc[3], 'p43'));
    pt(plus(sat(95), 150), 'host', 'イベントを手伝った（那覇オフ会の受付）', '#/feed/mv3');
    pt(plus(sat(40), 150), 'host', 'イベントを手伝った（那覇オフ会の受付）', post('p42') ? '#/feed/p42' : '#/events');
    pt(plus(sat(13), 150), 'host', 'イベントを手伝った（那覇オフ会の受付）', '#/feed/p34');
    pt(posts[1].at, 'win', '成果を報告した（はじめての案件が完了）', '#/feed/mv2');
    pt(posts[3].at, 'win', '成果を報告した（運用代行を始めた）', '#/feed/mv4');
    pt(post('p17').at, 'win', '成果を報告した（投稿の曜日を変えた話）', '#/feed/p17');
    // 質問に答えた（運営が回答に選んだもの）。[コメントid, 選ばれた日（何日前）]。今月の分は翌朝10時台、古い分は運営の営業時間
    [['q11-r1', 152], ['q12-r1', 122], ['q13-r1', 92], ['q14-r1', 62], ['q15-r1', 58], ['q16-r1', 25], ['q17-r1', 22], ['q18-r1', 18], ['q19-r1', 15],
      ['q10-r2', 0], ['p36-r3', 0], ['p23-r3', 0]].forEach(function (a, i) {
      var x = mine(a[0].split('-')[0], a[0]);
      if (!x) return;
      pt(a[1] && a[1] <= 25 ? ago(a[1], 10, 30 + i) : DATA.staffAfter(x.c.at, 20), 'answer', '質問に答えた（' + asked(x) + '）', x.href);
    });
    // コメントに「ありがとう」をもらった。[コメントid, 押した人, 何日前]
    [['q11-r1', 'm3', 150], ['q12-r1', 'm2', 120], ['q13-r1', 'm6', 90], ['q14-r1', 'm23', 60], ['q16-r1', 'm18', 23], ['q17-r1', 'm9', 21],
      ['q17-r1', 'm21', 19], ['q18-r1', 'm10', 17]].forEach(function (t) {
      var x = mine(t[0].split('-')[0], t[0]);
      if (x) pt(ago(t[2], 22, 0), 'thanks', 'コメントに「ありがとう」をもらった（' + personName(t[1]) + 'さんから）', x.href);
    });
    [['q10-r2', 'm19', 14], ['i17-r1', 'm17', 12], ['p36-r3', 'm11', 9], ['p23-r3', 'm1', 6], ['p17-r2', 'm12', 4], ['p17-r2', 'm14', 2]].forEach(function (t) {
      var x = mine(t[0].split('-')[0], t[0]);
      if (x) pt(ago(t[2], 22, 20), 'thanks', 'コメントに「ありがとう」をもらった（' + personName(t[1]) + 'さんから）', x.href);
    });
    // 新入生に声をかけた（自己紹介へのコメントの時刻）
    ['i12-r1', 'i26-r1', 'i19-r1', 'i20-r1', 'i22-r1', 'i17-r1', 'i16-r3', 'i15-r3'].forEach(function (cid) {
      var x = mine(cid.split('-')[0], cid);
      if (x) pt(x.c.at, 'welcome', '新入生に声をかけた（' + personName(x.p.by) + 'さんの自己紹介）', x.href);
    });
    s.pointsLog = P.sort(function (a, b) { return new Date(a.at) - new Date(b.at); });

    // 相談・専門家・支払い・アカウント
    s.thread = clone(DATA.THREAD_VETERAN);
    s.threadRead = plus(s.thread[s.thread.length - 1].at, -1);
    s.expertRequests = [{ id: 'x1', expert: 'ex1', at: ago(60, 21, 0), status: '相談済み', text: '開業届と、青色申告の承認申請の出し方',
      history: [{ at: ago(60, 21, 0), status: '受付' }, { at: ago(59, 10, 20), status: '日程調整' }, { at: ago(58, 12, 0), status: '予約確定' }, { at: ago(52, 20, 30), status: '相談済み' }] }];
    s.invoices = [];
    for (var n = 0; n < 24; n++) {
      var at = DATA.addMonths(VJ, n);
      if (at > CLG.now()) break;
      s.invoices.push({ id: 'in_' + V.id + '_' + (n + 1), at: at.toISOString(), amount: DATA.SITE.price, status: 'paid' });
    }
    s.likes = { p14: true, p1: true, p34: true, i17: true };
    s.seenLevel = 5;
    s.passwordSetAt = plus(VJ, 9);
    s.lineLink = { status: 'linked', at: plus(VJ, 18) };
    s.profile = { nickname: '', visibility: 'city', photo: '' };
    s.sessions = [
      { id: 'se1', device: 'iPhone（Safari）', place: '沖縄県', since: plus(VJ, 9), lastAt: nowIso(), current: true },
      { id: 'se2', device: 'MacBook Air（Chrome）', place: '沖縄県', since: ago(120, 21, 0), lastAt: ago(1, 22, 15), current: false }
    ];
    var np = defaultPrefs(); np.comment_thanks = { line: true, email: false };
    s.notifyPrefs = np;
    readAllBut(s, 3);
    return s;
  }

  /* ---------- 公開サイトの入会フォームから作る新しい会員 ----------
     会員番号は名簿（312人）の次から。紹介コードはメールアドレスの@の前の英字＋番号の下3桁（例：HANA313） */
  function freshState(form) {
    form = form || {};
    var now = nowIso();
    var num = 313 + Math.floor(Date.now() / 1000) % 80;
    var no = 'TS-' + pad(num, 6);
    var local = String(form.email || '').split('@')[0].replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 6);
    var s = blank({
      id: no, name: form.name || '新しい会員', kana: form.kana || '', area: form.area || '', job: form.job || '',
      goal: '', joinedAt: now, color: '#274868', refCode: (local || 'MEMBER') + pad(num, 3).slice(-3),
      email: form.email || '', card: form.card || 'Visa •••• 4242', lineLinked: false
    });
    s.session = true;
    s.referredBy = form.ref || null;
    var call = (form.name ? String(form.name).split(/\s+/)[0] + 'さん、' : '');
    s.thread = [
      { from: 'staff2', auto: true, at: plus(now, 0.1),
        text: '入会の手続きが終わりました。会員番号とログインの案内は、登録のメールアドレスに送っています。\n分からないことは、このメッセージから運営に聞けます。' + DATA.SITE.replySla + '。' },
      // 担当のあいさつは次の平日の10:00に届く（それまでは出さない）
      { from: 'staff2', at: nextTen(now),
        text: call + 'はじめまして。コミュニティ運営の佐藤です。\nまずはスタートガイドを見てください。最初の1週間でやることが並んでいます。\n水曜20:00の新入生オリエンテーションで会えたらうれしいです。' }
    ];
    s.invoices = [{ id: 'in_' + no + '_1', at: now, amount: DATA.SITE.price, status: 'paid' }];
    s.sessions = [{ id: 'se1', device: 'このブラウザ', place: '', since: now, lastAt: now, current: true }];
    return s;
  }

  /* ---------- v1 → v2 ----------
     v1 の入会したての会員（公開サイトの入会フォームで作ったもの）は、足りない入れ物を足すだけで中身は消さない。
     v1 のデモ会員は、会員が自分でした操作を残したまま、台本（メッセージ・投稿・ポイントの理由）を新しいものに差し替える。 */
  var V1_DEMO_THREAD = 5, V1_DEMO_POINTS = 15;
  var OLD_MAIL = {
    'sakura.takahashi.0417@gmail.com': function () { return DATA.MEMBER.email; },
    'aya.kimura.0707@gmail.com': function () { return DATA.VETERAN.email; },
    'hana.yamada.0312@gmail.com': function () { return 'hana.yamada.0312@example.jp'; }   // 試作版の札の「入会したて」の人
  };
  function fillDefaults(s) {
    var d = blank(s.me || {});
    Object.keys(d).forEach(function (k) { if (s[k] === undefined || s[k] === null && d[k] !== null) s[k] = d[k]; });
    ['done', 'archiveSeen', 'steps', 'likes', 'gigs', 'events'].forEach(function (k) { if (!s[k] || typeof s[k] !== 'object') s[k] = {}; });
    if (!s.plan || typeof s.plan !== 'object') s.plan = d.plan;
    ['graceUntil', 'endedAt', 'pausedUntil'].forEach(function (k) { if (s.plan[k] === undefined) s.plan[k] = null; });
    if (!s.notifyPrefs || typeof s.notifyPrefs !== 'object') s.notifyPrefs = defaultPrefs();
    Object.keys(d.notifyPrefs).forEach(function (k) { if (!s.notifyPrefs[k]) s.notifyPrefs[k] = d.notifyPrefs[k]; });
    // お知らせの既読：v1（と古いルール）は「ここまで読んだ」時刻を1つ持つ → id ごとの印に直す
    if (!s.noticesRead || typeof s.noticesRead !== 'object') {
      var t = typeof s.noticesRead === 'string' ? s.noticesRead : null;
      s.noticesRead = {};
      if (t) DATA.noticesFor(s).forEach(function (n) { if (new Date(n.at) <= new Date(t)) s.noticesRead[n.id] = t; });
    }
    if (s.me && s.me.lineLinked && s.lineLink.status === 'none') s.lineLink = { status: 'linked', at: s.me.joinedAt };
    // 運営の中身と設定の入れ物（形がくずれていたら空に戻す）
    if (!s.cms || typeof s.cms !== 'object' || !s.cms.items || typeof s.cms.items !== 'object') s.cms = emptyCms();
    if (!s.cms.order || typeof s.cms.order !== 'object') s.cms.order = {};
    if (!s.settings || typeof s.settings !== 'object' || Array.isArray(s.settings)) s.settings = {};
    // デモの人のメールアドレス：前の版は実在のドメイン（gmail.com）だった → 架空のドメイン（example.jp）に
    if (s.me && Object.prototype.hasOwnProperty.call(OLD_MAIL, s.me.email)) s.me.email = OLD_MAIL[s.me.email]();
    (s.referred || []).forEach(function (r) { if (!r.initial && r.person && DATA.PEOPLE[r.person]) r.initial = DATA.PEOPLE[r.person].initial || ''; });
    // デモ会員の自己紹介（my1）に付くコメントは台本（DATA.DEMO_POSTS）のもの。台本が増えたら、前に保存した分にも足す
    // （会員が自分で書いたコメントは state.comments にあるので、ここを入れ替えても消えない）
    var my1 = s.kind === 'demo' && byId(s.posts || [], 'my1'), d1 = DATA.DEMO_POSTS && DATA.DEMO_POSTS.my1;
    if (my1 && d1 && (my1.replies || []).length < (d1.replies || []).length) { my1.replies = clone(d1.replies); my1.comments = d1.comments; }
    return s;
  }
  function migrateDemo(s) {
    var fresh = demoState();
    // 会員番号・紹介コード・メールは、v1 の初期値のままなら新しい値に
    if (/^T[KS]-000128$/.test(s.me.id)) s.me.id = fresh.me.id;
    if (s.me.refCode === 'SAKURA128') s.me.refCode = fresh.me.refCode;
    if (/@example\.com$/.test(s.me.email || '')) s.me.email = fresh.me.email;
    // メッセージ：v1 の台本（先頭5通）を新しい台本に。会員が送ったものと、その返事は残す
    var mine = (s.thread || []).slice(V1_DEMO_THREAD);
    s.thread = fresh.thread.concat(mine).sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
    if (!mine.length) s.threadRead = fresh.threadRead;
    // 投稿：台本の2件（my1・my2）だけ新しいものに
    s.posts = (s.posts || []).map(function (p) { return p.id === 'my1' || p.id === 'my2' ? byId(fresh.posts, p.id) : p; });
    // 案件 g2 は「面談の調整中」に
    if (s.gigs.g2 && s.gigs.g2.status === 'applied') s.gigs.g2 = fresh.gigs.g2;
    // ポイント：台本の15件を、理由とリンクの付いたものに。あとから増えた分は残す
    s.pointsLog = fresh.pointsLog.concat((s.pointsLog || []).slice(V1_DEMO_POINTS));
    // 新しく増えた入れ物は、デモの台本の中身で埋める
    ['comments', 'thanks', 'lessonPos', 'certificates', 'waitlist', 'gigHistory', 'gigThreads', 'sessions', 'lineLink', 'passwordSetAt', 'noticesRead']
      .forEach(function (k) { s[k] = fresh[k]; });
    s.referred = fresh.referred;
    return s;
  }
  function migrate(s) {
    if (!s || typeof s !== 'object' || !s.me) return null;
    if (s.v === VERSION) return fillDefaults(s);
    if (s.v !== 1) return null;
    var notes = s.notes;
    fillDefaults(s);
    // 講座のメモ：v1 はブラウザ全体のキーに入れていた → 会員の状態に移す（元のキーは、デモを戻したときに消す）
    try {
      var o = JSON.parse(global.localStorage.getItem(NOTES_KEY) || '{}');
      if (o && typeof o === 'object') s.notes = Object.assign({}, o, notes || {});
    } catch (e) {}
    if (s.kind === 'demo') migrateDemo(s);
    s.v = VERSION;
    return s;
  }

  /* ---------- 運営が直した中身を、data.js の配列に重ねる（CMS） ----------
     記録（state.cms.items[種類][id]）：{ id, …直した欄, publish?, publishAt?, removed?, added?, savedAt（書いた時刻）, course?（回のときは入っている講座） }
       at はイベントの日時・お知らせの時刻として欄のまま重ねる（記録を書いた時刻は savedAt）。
       publish：published（既定）/ draft 下書き / hidden 非公開 / scheduled 予約公開（publishAt を過ぎたら公開）。removed は削除。
     並び（state.cms.order[名前]）：'course' 'course:<学部>' 'lesson:<講座>' 'archive' 'gig' 'perk' 'perk:<分類>' 'event' などに id の並び。
       並べ直すのは、そこに書いてある id どうしだけ（ほかのものの位置は変えない）。
     毎回 BASE（data.js の元の中身）から作り直すので、何度重ねても同じ結果になる。 */
  var CMS_META = { id: 1, publish: 1, publishAt: 1, removed: 1, added: 1, savedAt: 1 };
  var applied = { stamp: undefined, next: null };
  /** 記録が変わったかを見る印（domain.js が書くたびに rev を変える） */
  function stampOf(c) { return c ? (c.rev || '') + '|' + (c.savedAt || '') : ''; }
  function isVisible(r, n) {
    if (!r) return true;
    if (r.removed) return false;
    var p = r.publish || 'published';
    if (p === 'published') return true;
    return p === 'scheduled' && !!r.publishAt && new Date(r.publishAt) <= n;
  }
  /** 元の1件に記録を重ねた新しい1件（元は書き換えない）。skip は重ねない欄 */
  function over(base, r, skip) {
    var o = Object.assign({}, base || {});
    Object.keys(r || {}).forEach(function (k) { if (!CMS_META[k] && !(skip && skip[k]) && r[k] !== undefined) o[k] = r[k]; });
    return o;
  }
  /** 並べ直す：ids に書いてあるものだけを、いまそれらがある位置の中で ids の順に入れ替える */
  function reorder(list, ids) {
    if (!Array.isArray(ids) || !ids.length) return list;
    var byKey = {}, slots = [], picked = [];
    list.forEach(function (x, i) { if (x && ids.indexOf(x.id) >= 0) { slots.push(i); byKey[x.id] = x; } });
    ids.forEach(function (id) { if (byKey[id] && picked.indexOf(byKey[id]) < 0) picked.push(byKey[id]); });
    var out = list.slice();
    slots.forEach(function (p, j) { out[p] = picked[j]; });
    return out;
  }
  function reorderAll(list, order, kind) {
    var out = list;
    if (order[kind]) out = reorder(out, order[kind]);
    Object.keys(order).forEach(function (k) { if (k.indexOf(kind + ':') === 0) out = reorder(out, order[k]); });
    return out;
  }
  function facultyOf(id) { return byId(DATA.FACULTIES, id); }
  /* 学部：data.js の学部に、運営が足した・直した学部を重ねる（下書き・非公開・削除は外す）。講座より先に作る
     （講座は、見えている学部のものだけを出すため）。写真のない学部は、学部の並びの最初の学部の写真を借りない（講座の写真で足りる） */
  function buildFaculties(n, it, order) {
    var R = it.faculty || {}, out = [];
    BASE.FACULTIES.forEach(function (b) { var r = R[b.id]; if (!isVisible(r, n)) return; out.push(r ? over(b, r) : b); });
    Object.keys(R).forEach(function (id) {
      if (byId(BASE.FACULTIES, id)) return;
      var r = R[id];
      if (!isVisible(r, n) || !r.name) return;
      var o = over({ desc: '', img: '', alt: '' }, r);
      o.id = r.id;
      out.push(o);
    });
    return reorderAll(out, order, 'faculty');
  }
  function newAtOf(date, n) {
    var pub = new Date(date); pub.setDate(pub.getDate() + 1); pub.setHours(12, 0, 0, 0);
    return new Date(Math.min(pub.getTime(), n.getTime() - 30 * MIN)).toISOString();
  }

  function buildCourses(n, it, order) {
    var C = it.course || {}, L = it.lesson || {}, home = {}, baseLesson = {}, touched = {};
    BASE.COURSES.forEach(function (c) { c.lessons.forEach(function (l) { home[l.id] = c.id; baseLesson[l.id] = l; }); });
    Object.keys(L).forEach(function (id) {
      var r = L[id];
      if (home[id]) touched[home[id]] = 1;
      if (r && r.course) touched[r.course] = 1;
    });
    Object.keys(order).forEach(function (k) { if (k.indexOf('lesson:') === 0) touched[k.slice(7)] = 1; });
    function lessonsOf(cid) {
      var base = byId(BASE.COURSES, cid), list = [];
      (base ? base.lessons : []).forEach(function (l) {
        var r = L[l.id];
        if (r && r.course && r.course !== cid) return;            // ほかの講座へ移した回
        list.push({ l: l, r: r });
      });
      Object.keys(L).forEach(function (id) {
        var r = L[id];
        if (r && r.course === cid && home[id] !== cid) list.push({ l: baseLesson[id] || null, r: r });   // 足した回・移してきた回
      });
      var out = [];
      list.forEach(function (x) {
        if (!isVisible(x.r, n)) return;
        if (!x.r) { out.push(x.l); return; }
        if (!x.l && !x.r.title) return;
        var o = over(x.l || { min: 10 }, x.r, { course: 1 });
        o.id = x.r.id || x.l.id;
        o.min = Math.max(1, Math.round(+o.min || 10));
        if (!x.l) o.newAt = x.r.newAt || x.r.publishAt || x.r.savedAt || n.toISOString();
        out.push(o);
      });
      return reorder(out, order['lesson:' + cid]);
    }
    var list = BASE.COURSES.map(function (c) { return { c: c, r: C[c.id] }; });
    Object.keys(C).forEach(function (id) { if (!byId(BASE.COURSES, id)) list.push({ c: null, r: C[id] }); });
    var out = [];
    list.forEach(function (x) {
      if (!isVisible(x.r, n)) return;
      if (!facultyOf((x.r && x.r.faculty) || (x.c && x.c.faculty))) return;        // 学部が見えていない（下書き・削除した学部）講座は出さない
      if (x.c && !x.r && !touched[x.c.id]) { out.push(x.c); return; }          // 手を入れていない講座は元のまま
      if (!x.c && !(x.r && x.r.title && facultyOf(x.r.faculty))) return;
      var f = facultyOf((x.r && x.r.faculty) || (x.c && x.c.faculty)) || DATA.FACULTIES[0] || BASE.FACULTIES[0];
      var pic = f.img ? f : BASE.FACULTIES[0];   // 運営が足した学部に写真がなければ、講座の写真は最初の学部のもの
      var o = x.c ? over(x.c, x.r, { lessons: 1 })
        : over({ faculty: f.id, level: 1, teacher: 'staff2', summary: '', img: pic.img, alt: pic.alt, learn: [] }, x.r, { lessons: 1 });
      o.id = x.c ? x.c.id : x.r.id;
      o.level = Math.min(6, Math.max(1, parseInt(o.level, 10) || 1));
      if (!o.img) { o.img = pic.img; o.alt = pic.alt; }
      if (!Array.isArray(o.learn)) o.learn = [];
      o.lessons = lessonsOf(o.id);
      if (!o.lessons.length) return;                                            // 公開した回がない講座は出さない
      if (o.quiz && !(Array.isArray(o.quiz) && o.quiz.length)) delete o.quiz;
      out.push(o);
    });
    return reorderAll(out, order, 'course');
  }
  function buildList(kind, base, n, it, order, make) {
    var R = it[kind] || {}, out = [];
    base.forEach(function (b) {
      var r = R[b.id];
      if (!isVisible(r, n)) return;
      var o = r ? make(b, r) : b;
      if (o) out.push(o);
    });
    Object.keys(R).forEach(function (id) {
      if (byId(base, id)) return;
      var r = R[id];
      if (!isVisible(r, n) || !r.title) return;
      var o = make(null, r);
      if (o) out.push(o);
    });
    return reorderAll(out, order, kind);
  }
  function buildArchive(n, it, order) {
    return buildList('archive', BASE.ARCHIVE, n, it, order, function (b, r) {
      if (!b && !r.date) return null;
      var o = over(b || { faculty: 'basic', min: 60, teacher: 'staff2', desc: '', chapters: [], files: [] }, r);
      o.id = b ? b.id : r.id;
      var f = facultyOf(o.faculty);
      o.genre = o.faculty === 'showcase' ? '成果発表会' : f ? f.name : (o.genre || '');
      if (!b || r.date) o.newAt = r.newAt || newAtOf(o.date, n);
      if (!Array.isArray(o.chapters)) o.chapters = [];
      if (!Array.isArray(o.files)) o.files = [];
      return o;
    });
  }
  function buildGigs(n, it, order) {
    var G = it.gig || {};
    function make(b, r) {
      var o = over(b || { status: 'open', rewardType: 'shot', level: 1, remote: true, slots: '随時', by: 'staff2', desc: '', time: '', reward: '',
        postedAt: r.savedAt || n.toISOString(), closesAt: null }, r);
      o.id = b ? b.id : r.id;
      if (!o.type) return null;
      // 運営が締め切った：締切の日を締めた時刻に（「募集終了（直近30日）」に入るように）
      if (r.status === 'closed' && (!b || b.status !== 'closed') && !r.closesAt) o.closesAt = r.closedAt || r.savedAt || n.toISOString();
      if (!b || r.postedAt) o.isNew = (n - new Date(o.postedAt)) / DAY <= 7;
      return o;
    }
    var open = buildList('gig', BASE.GIGS, n, it, order, make);
    var closed = BASE.GIGS_CLOSED.map(function (b) { var r = G[b.id]; return !isVisible(r, n) ? null : r ? make(b, r) : b; }).filter(Boolean);
    // 足した案件のうち、はじめから募集を終えているものは GIGS_CLOSED へ
    return { open: open.filter(function (g) { return !(g.status === 'closed' && !byId(BASE.GIGS, g.id)); }),
      closed: closed.concat(open.filter(function (g) { return g.status === 'closed' && !byId(BASE.GIGS, g.id); })) };
  }
  function buildPerks(n, it, order) {
    var d0 = BASE.PERKS[0] || {};
    return buildList('perk', BASE.PERKS, n, it, order, function (b, r) {
      var o = over(b || { cat: '暮らし', desc: '', how: '', example: '', area: '', until: '', partner: d0.partner || '', note: d0.note || '' }, r);
      o.id = b ? b.id : r.id;
      return o;
    });
  }
  function buildEvents(n, it, order) {
    return buildList('event', BASE.EVENTS, n, it, order, function (b, r) {
      if (!b && !r.at) return null;
      var o = over(b || { kind: 'online', min: 60, place: 'オンライン（Zoom）', cap: 30, count: 0, attendees: [], fee: '無料', host: 'staff2', desc: '', agenda: [] }, r);
      o.id = b ? b.id : r.id;
      o.cap = Math.max(1, parseInt(o.cap, 10) || 1);
      o.count = Math.min(o.cap, Math.max(0, parseInt(o.count, 10) || 0));
      if (!o.img) { o.img = (DATA.EVENT_IMG || {})[o.kind] || ''; o.alt = o.alt || ''; }
      if (o.kind !== 'offline' && !o.zoomUrl) o.zoomUrl = DATA.SITE.zoomPlaceholder;
      if (!Array.isArray(o.attendees)) o.attendees = [];
      if (!Array.isArray(o.agenda)) o.agenda = [];
      return o;
    });
  }
  /** お知らせ：data.js のお知らせ（n1… v1… f1…）を直した記録と、運営が足したお知らせ */
  function buildNotices(n, it) {
    var N = it.notice || {}, edits = {}, added = [];
    Object.keys(N).forEach(function (id) {
      var r = N[id];
      if (!r) return;
      if (!r.added) { edits[id] = r; return; }
      if (!isVisible(r, n) || !r.text) return;
      var o = over({ type: 'system', link: '', target: 'all' }, r, {});
      o.id = id; o.at = r.publishAt || r.at || r.savedAt;
      added.push(o);
    });
    return { edits: edits, added: added };
  }
  function nextFlip(it, n) {
    var next = null;
    Object.keys(it).forEach(function (k) {
      Object.keys(it[k] || {}).forEach(function (id) {
        var r = it[k][id];
        if (r && !r.removed && r.publish === 'scheduled' && r.publishAt) {
          var t = new Date(r.publishAt);
          if (t > n && (!next || t < next)) next = t;
        }
      });
    });
    return next;
  }
  function fill(arr, list) { if (arr === list) return; arr.length = 0; Array.prototype.push.apply(arr, list); }
  /** state.cms を DATA の配列に重ねる。何も直していなければ data.js の元の中身に戻す */
  function applyCms(s) {
    var c = (s && s.cms) || emptyCms(), it = c.items || {}, order = c.order || {}, n = CLG.now();
    var any = Object.keys(order).length > 0 || Object.keys(it).some(function (k) { return it[k] && Object.keys(it[k]).length; });
    var gigs, nt;
    if (!any) {
      fill(DATA.FACULTIES, BASE.FACULTIES); fill(DATA.COURSES, BASE.COURSES); fill(DATA.ARCHIVE, BASE.ARCHIVE); fill(DATA.GIGS, BASE.GIGS); fill(DATA.GIGS_CLOSED, BASE.GIGS_CLOSED);
      fill(DATA.PERKS, BASE.PERKS); fill(DATA.EVENTS, BASE.EVENTS);
      nt = { edits: {}, added: [] };
    } else {
      var facs = buildFaculties(n, it, order);
      fill(DATA.FACULTIES, facs.length ? facs : BASE.FACULTIES);
      var courses = buildCourses(n, it, order);
      // 講座を1つも見せられないときは元の中身に戻す（画面が空にならないように）
      fill(DATA.COURSES, courses.length ? courses : BASE.COURSES);
      fill(DATA.ARCHIVE, buildArchive(n, it, order));
      gigs = buildGigs(n, it, order);
      fill(DATA.GIGS, gigs.open); fill(DATA.GIGS_CLOSED, gigs.closed);
      fill(DATA.PERKS, buildPerks(n, it, order));
      fill(DATA.EVENTS, buildEvents(n, it, order));
      nt = buildNotices(n, it);
    }
    DATA.NOTICE_EDITS = nt.edits;
    DATA.CMS_NOTICES = nt.added;
    if (typeof DATA.refreshContent === 'function') DATA.refreshContent();
    applied.stamp = stampOf(c); applied.next = any ? nextFlip(it, n) : null;
  }
  /** cms が変わったとき・予約公開の時刻が来たときだけ重ね直す */
  function applyIfChanged(s) {
    var c = s && s.cms;
    if (!c) return;
    if (stampOf(c) !== applied.stamp || (applied.next && CLG.now() >= applied.next)) applyCms(s);
  }
  /** data.js の元の中身（運営の直しを重ねる前）。kind は CMS の種類 */
  function cmsBase(kind) {
    if (kind === 'faculty') return BASE.FACULTIES.slice();
    if (kind === 'course') return BASE.COURSES.slice();
    if (kind === 'lesson') {
      var out = [];
      BASE.COURSES.forEach(function (c) { c.lessons.forEach(function (l, i) { out.push(Object.assign({}, l, { course: c.id, n: i + 1 })); }); });
      return out;
    }
    if (kind === 'archive') return BASE.ARCHIVE.slice();
    if (kind === 'gig') return BASE.GIGS.concat(BASE.GIGS_CLOSED);
    if (kind === 'perk') return BASE.PERKS.slice();
    if (kind === 'event') return BASE.EVENTS.slice();
    if (kind === 'notice') {
      return (DATA.NOTICES || []).concat(DATA.NOTICES_VETERAN || [], DATA.freshNotices ? DATA.freshNotices(nowIso()) : []);
    }
    return [];
  }
  /** 人を切り替えるとき、運営の中身（cms）と設定（settings）と、タイムラインの見回り（運営の投稿・固定・隠した投稿とコメント）を
      次の人に引き継ぐ。どれも運営が書くもので、会員ごとのものではないため（運営画面を開いていなくても、隠したものは隠れたまま） */
  var CARRY = { cms: 'o', settings: 'o', staffPosts: 'a', pins: 'o', hiddenPosts: 'o', hiddenComments: 'o' };
  function carry(next) {
    var prev = store && store.state;
    if (!prev) return next;
    Object.keys(CARRY).forEach(function (k) {
      var v = prev[k];
      if (CARRY[k] === 'a' ? Array.isArray(v) : v && typeof v === 'object' && !Array.isArray(v)) next[k] = v;
    });
    return next;
  }

  /* ---------- 保存と読み込み ---------- */
  /* 会員番号の頭は TS-（2026-09-25 に TK- から変えた）。前に保存した会員ページと運営画面の記録の中の「TK-000271」を
     「TS-000271」に直す。読み込む前に1回（直すものがなければ何もしない。何度呼んでも同じ）。
     運営画面も会員ページもこのファイルを先に読むので、どちらを先に開いても両方の記録がそろう */
  // 英字に続かない「TK-」＋6桁（請求の id「in_TK-000271_1」のように _ のあとに来るものも直す）
  var OLD_NO = /(^|[^A-Za-z])TK-(\d{6})(?!\d)/;
  function renumber(key) {
    try {
      var ls = global.localStorage, raw = ls && ls.getItem(key);
      if (raw && OLD_NO.test(raw)) ls.setItem(key, raw.replace(new RegExp(OLD_NO.source, 'g'), '$1TS-$2'));
    } catch (e) {}
  }
  renumber(KEY); renumber(ADMIN_KEY);

  var migrated = false;
  function load() {
    try {
      var raw = global.localStorage.getItem(KEY);
      if (raw) {
        var s = JSON.parse(raw);
        var was = s && s.v;
        var m = migrate(s);
        if (m) { migrated = was !== VERSION; return m; }
      }
    } catch (e) {}
    return null;
  }
  function persist() {
    try { global.localStorage.setItem(KEY, JSON.stringify(store.state)); } catch (e) {}
  }
  function notify() {
    listeners.slice().forEach(function (l) { try { l(store.state); } catch (e) { console.error(e); } });
  }
  /** 人を切り替えるときに、その人の分として残っているブラウザの印を消す：
      v1 の講座のメモのキーと、探す欄の最近の言葉（search.js が 'terakoya-search-recent:…' に人ごとに入れている） */
  var RECENT_PREFIX = 'terakoya-search-recent:';
  function clearNotes() {
    try {
      var ls = global.localStorage;
      ls.removeItem(NOTES_KEY);
      var drop = [];
      for (var i = 0; i < ls.length; i++) { var k = ls.key(i); if (k && k.indexOf(RECENT_PREFIX) === 0) drop.push(k); }
      drop.forEach(function (k) { ls.removeItem(k); });
    } catch (e) {}
  }

  var store = {
    KEY: KEY,
    version: VERSION,
    state: load() || demoState(),
    /** fn(state) の中で書き換える。終わったら保存して、画面に知らせる（運営の中身が変わっていれば、先に DATA に重ね直す） */
    update: function (fn) {
      var r = fn(store.state);
      applyIfChanged(store.state);
      persist();
      notify();
      return r;
    },
    save: persist,
    on: function (fn) { listeners.push(fn); return function () { store.off(fn); }; },
    off: function (fn) { listeners = listeners.filter(function (l) { return l !== fn; }); },
    /** いまの人の種類（'demo' / 'veteran' / 'fresh'） */
    persona: function () { return store.state.kind; },
    /** デモ会員に戻す（講座のメモも消す。運営の中身と設定は引き継ぐ） */
    resetDemo: function (keepSession) {
      store.state = carry(demoState());
      store.state.session = !!keepSession;
      clearNotes();
      persist();
    },
    /** 在籍半年の会員（木村あや）で始める */
    startVeteran: function (keepSession) {
      store.state = carry(veteranState());
      store.state.session = keepSession !== false;
      clearNotes();
      persist();
    },
    /** 入会フォームから新しい会員として始める */
    startFresh: function (form) {
      store.state = carry(freshState(form || {}));
      clearNotes();
      persist();
    },
    logout: function () { store.update(function (s) { s.session = false; }); },
    login: function () { store.update(function (s) { s.session = true; }); },
    migrate: migrate,
    applyCms: function () { applyCms(store.state); },
    cmsBase: cmsBase
  };
  // 運営の中身を DATA に重ねる（何も直していなければ何もしない）
  applyCms(store.state);
  // 古い版から直したときは、直したものをすぐ保存しておく（次に開いたときにもう一度直さないため）
  if (migrated) persist();

  /* 別のタブ（管理画面など）が同じ保存先を書き換えたら、読み直して（運営の中身も重ね直して）画面に知らせる */
  if (typeof global.addEventListener === 'function') {
    global.addEventListener('storage', function (e) {
      if (e && e.key !== KEY && e.key !== null) return;
      var s = load();
      if (!s) return;
      store.state = s;
      applyIfChanged(s);
      notify();
    });
  }

  CLG.store = store;
})(window);
