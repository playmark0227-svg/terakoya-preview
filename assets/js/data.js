/* ============================================================
   初期データ（試作版）
   ------------------------------------------------------------
   - 人物・案件・数値はすべて架空。実在の企業・団体・個人とは関係ない。メールアドレスは架空のドメイン（example.jp）。
   - 日付は「今日」からの相対で作る。いつ開いても新しく見えるようにするため。
     曜日の決まった会（オリエンテーションは水曜など）は、下の lastDow / nextDow で実際の暦から作る。
   - 料金・料率・レベルの閾値は検討中の仮の値。ここを直せば全画面に反映される。
   - 先方の回答で変わりうる決めごと（docs/決定事項.md）は、SITE か各定数の1か所で差し替えられる形にしてある。

   ■ データの形（ほかのファイルが読むもの。足すのはよいが、名前は変えない）

   SITE        { name（TAISEI）, nameEn, nameKana（タイセイ）, tagline（合言葉「人生を大成させる。」）,
                 note（名前の横の注記。いまは ''。空なら出さない。name に「（」note「）」を付ける側は空を扱う）, catchcopy, lead, contentLine, lessonLength, price, entryFee, billing, payment,
                 company, siteUrl（紹介リンクの土台。空なら実行時に決める）, previewUrl, lineName, version,
                 docsDate{made,revised}（YYYY-MM-DD）, replySla, contactHours, memberNoLabel, allowPause,
                 graceDays, keepDays, zoomPlaceholder, payer{ code, name, bank, bankName, branch, branchName, kind, account }（振込元・仮） }
   LEVELS      [{ lv, name, min }]           XP { lesson, archive, event, post, postPerDay, gigDone, quiz }
   FACULTIES   [{ id, name, desc, img, alt }]
   COURSES     [{ id, faculty, level, title, teacher, summary, img, alt, learn[],
                  lessons[{ id, title, min, desc, points[3], material{name,type}, newAt? }], quiz? }]（desc・points・material は全部の回にある。LESSON_DETAIL）
               quiz = [{ q, choices[], answer（0始まり）, why, lesson?（まちがえたときに戻る回のid） }]（3問・QUIZ_PASS 問以上で合格）
   ARCHIVE     [{ id, faculty（学部id か 'showcase'）, genre（表示の群名）, title, date, newAt, min, teacher,
                  desc, chapters[[時刻, 題]], files[{name,type}], course?（関係する講座のid） }]   … 勉強会の録画
   PEOPLE      { id: { name（表示名）, realName?, initial（姓のローマ字1字）, role?, staff?, color, area, lv, xp,
                  joinedDaysAgo, job, bio, visibility（'city'|'pref'|'none'）, photo（空＝頭文字の丸）, no（会員番号） } }
   MEMBER      デモ会員（高橋さくら・入会23日前）    VETERAN 在籍半年の会員（木村あや＝PEOPLE.m8）
   ROSTER      [{ id, no, person（PEOPLE のid / 'demo' / null）, name, pref, city, area, job, joinedAt, joinedDaysAgo,
                  xp, level, stepsDone, lastActive, status（active/canceling/left/past_due）, leftAt?, cancelAt?,
                  failedAt?・graceUntil?（past_due の人だけ：失敗した請求の日＝入会日から数えた直近の請求日と、猶予の最後）,
                  monthPoints, monthXp, cohort }]   genRoster(n, seed) で作る。ROSTER_INDEX[会員番号] で引ける
               past_due は直近の請求日が2・4・5日前の3人（運営画面の seed.js と同じ選び方。運営画面の支払いの失敗と日付がそろう）
   ONBOARDING  [{ id, week, xp, title, desc, go, auto? }]
   FEED        [{ id, kind（news/new/gig/event/win/post/question/intro）, by, at, text, likes, comments（=replies数）,
                  replies[{ id, by, at, text, thanks（数）, answer（運営が回答に選んだ）, replyTo? }],
                  pinned?, link?, img?, alt? }]
               replyTo はデモ会員のコメント（store の comments）を指すことがある。見つからなければ普通の返信として出す。
               2週より前の投稿（q11〜q19・i12 i19 i20 i22 i26・p42 p43）は、在籍半年の会員の貢献ポイントの記録が指す先（m8 のコメントは -r1）。
   GIGS        募集中 [{ id, type, title, reward（「目安」は画面で付ける）, rewardType（shot/stock）, level, time（時間の目安だけ）, remote,
                  place?（現地のときの場所。市区町村まで。time に詰めない）, slots, by, requires?, desc, steps?, status:'open', postedAt,
                  closesAt（null＝随時）, isNew }]
   GIGS_CLOSED 募集を終えたもの（形は GIGS と同じ。status:'closed', filled）
   GIG_TYPES   [{ id, name, desc }]
   EVENTS      [{ id, series?, kind（online/offline/showcase）, title, at, min, place, cap, count（自分以外の予約数）,
                  attendees[会員番号]（count と同じ数）, fee, host, recording?, desc, img, alt, audience?（'new30'）, waiting?（満席の会の、キャンセル待ちの人数）,
                  agenda[[時刻, 内容]], speakers?[{person,title}], venue?{name,address,mapUrl,contact,bring}（予約した人にだけ出す）,
                  venues?[同じ形]（成果発表会の会場）, zoomUrl?（開始30分前から出す） }]
   PAST_EVENTS デモ会員が参加したもの [{ id, title, at, kind, archive? }]
   REFERRAL / REFERRED / REF_CLICKS / SHARE_TEMPLATE（{site}{price}{url} を差し替える）
   POINT_RULES [{ id, name, pt }]   RANKING [{ person, points, xp（今月） }]   RANK_TOTAL（今月ポイントがある人数）
   PERKS       [{ id, cat, title, desc, how, partner, example, until（YYYY-MM-DD か ''）, area, note }]
   EXPERTS     [{ id, title, desc, note, person, office, hours, next（次に空いている枠） }]
   THREAD      デモ会員と運営のやりとり [{ from（'me' か PEOPLE のid）, at, text, kind?（me のとき）, auto?（自動送信）, ref? }]
   THREAD_VETERAN 同じ形。 DEMO { 各場面の時刻 }（store が記録の時刻をここに合わせる）
   MESSAGE_KINDS ['質問','講座の質問','相談したい','面談の予約','その他']   AUTO_REPLIES { 種類: [すぐの返事, 5秒後の返事] }
   NOTICES     [{ id, type, icon, text, at, link, go（= link。古い名前） }]
               type: reply / event_before / new_course / new_gig / comment / thanks / reward_confirmed / billing / referral / gig / system
   NOTICES_VETERAN 同じ形。 freshNotices(joinedAt) 入会したての会員の分。 noticesFor(state) 人ごとの一覧を返す
   NOTICE_EDITS / CMS_NOTICES  運営が CMS で直したお知らせ（store.js が入れる。domain.js の notices() が混ぜる。data.js では空）
   refreshContent()  SITE.contentLine と SITE.lead を、いまの COURSES の数で作り直す（store.js が CMS を重ねたあとに呼ぶ）
   RULES / RULES_TITLE / HELP [{ id, cat, q, a, link?{ href, label } }] / HELP_CATS
   NOTIFY_TYPES [{ id, name, line, email, fixed? }]（line/email は既定の値）
   MAIL_TEMPLATES { id: { name, email:{subject, body}, line:{text} } }（{name}{no}{site}{url} などを差し替える）
   DEMO_POSTS  デモ会員の2つの投稿（my1 自己紹介・my2 成果。store が state.posts に入れる）
   日付の道具  D(日, 時, 分) / ago(分) / T（D と同じだが未来なら前日）/ lastDow(月ずらし, 曜日, 時) / nthDow(月ずらし, 第n, 曜日, 時)
               nextDow(曜日, 時, 何日先から) / prevDow(曜日, 時, 何週前)（時は 20.5 で 20:30）/ staffAfter(時刻, 分)（平日9:30〜18:00）
               satBack(n)（n 日前から見て、その日かそれより前の土曜の18:00。那覇オフ会の日）
               md / mdw（9/26(土)）/ hm / dayDiff / addMonths / lastBill（いちばん最近の請求日）/ levelOf(xp) / rng(seed) / aiWeek
   ■ 人の見分け方
     - 会員ページの「自分」は store の state.me。在籍半年の会員（kind 'veteran'）は me.personId = 'm8' なので、
       FEED・RANKING・EVENTS の m8 は「自分」として扱う（同じ人が2人いるように見せない）。
     - 紹介した人の頭文字は PEOPLE[id].initial（名前のない人は referred[].initial）。
     - ROSTER の会員番号から PEOPLE を引くときは ROSTER_INDEX[no].person。
   ============================================================ */
(function (global) {
  'use strict';
  var CLG = global.CLG = global.CLG || {};

  /* いまの時刻。検証で動かしたいときはここを差し替える */
  CLG.now = function () { return new Date(); };

  var MIN = 60000, DAY = 86400000, WEEK = 7 * DAY;
  var WD = ['日', '月', '火', '水', '木', '金', '土'];

  /** 今日から days 日後の hh:mm（負なら過去） */
  function D(days, hh, mm) {
    var d = CLG.now();
    d.setHours(hh == null ? 10 : hh, mm || 0, 0, 0);
    d.setDate(d.getDate() + days);
    return d.toISOString();
  }
  /** いまから minutes 分前 */
  function ago(minutes) { return new Date(CLG.now().getTime() - minutes * MIN).toISOString(); }
  /** D() と同じ。ただし今日のまだ来ていない時刻なら前の日にする（投稿やメッセージを未来にしないため） */
  function T(days, hh, mm) { var s = D(days, hh, mm); return new Date(s) > CLG.now() ? D(days - 1, hh, mm) : s; }
  function plus(x, minutes) { return new Date(new Date(x).getTime() + minutes * MIN).toISOString(); }
  function days(x, n) { var d = new Date(x); d.setDate(d.getDate() + n); return d.toISOString(); }
  /** 時刻を h 時に（20.5 なら 20:30） */
  function atH(x, h) { var d = new Date(x); d.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0); return d; }
  function today0() { var n = CLG.now(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }

  /** 今月＋monthOffset の、最後の dow 曜日（0=日）の h 時 */
  function lastDow(monthOffset, dow, h) {
    var n = CLG.now(), d = new Date(n.getFullYear(), n.getMonth() + (monthOffset || 0) + 1, 0);
    while (d.getDay() !== dow) d.setDate(d.getDate() - 1);
    return atH(d, h == null ? 10 : h).toISOString();
  }
  /** 今月＋monthOffset の、第 nth の dow 曜日の h 時 */
  function nthDow(monthOffset, nth, dow, h) {
    var n = CLG.now(), d = new Date(n.getFullYear(), n.getMonth() + (monthOffset || 0), 1);
    while (d.getDay() !== dow) d.setDate(d.getDate() + 1);
    d.setDate(d.getDate() + (nth - 1) * 7);
    return atH(d, h == null ? 10 : h).toISOString();
  }
  /** これから来る dow 曜日の h 時。min 日より先から探す（既定 0＝今日の、まだ来ていない時刻も含む） */
  function nextDow(dow, h, min) {
    var t = today0(), d = atH(new Date(t.getFullYear(), t.getMonth(), t.getDate() + (min || 0)), h == null ? 10 : h);
    var now = CLG.now();
    while (d.getDay() !== dow || d <= now) d.setDate(d.getDate() + 1);
    return d.toISOString();
  }
  /** 終わって録画が出ているはずの dow 曜日の h 時（36時間より前）。weeksBack 週さかのぼる */
  function prevDow(dow, h, weeksBack) {
    var t = today0(), d = atH(t, h == null ? 10 : h), lim = CLG.now().getTime() - 36 * 3600000;
    while (d.getDay() !== dow || d.getTime() > lim) d.setDate(d.getDate() - 1);
    d.setDate(d.getDate() - 7 * (weeksBack || 0));
    return d.toISOString();
  }
  /** 運営が返事を書く時刻（平日 9:30〜18:00）。from の gap 分あとから探す。祝日は見ない */
  function staffAfter(from, gap) {
    var d = new Date(new Date(from).getTime() + (gap == null ? 60 : gap) * MIN);
    for (var i = 0; i < 14; i++) {
      var wd = d.getDay(), m = d.getHours() * 60 + d.getMinutes();
      if (wd === 0 || wd === 6 || m >= 18 * 60) { d.setDate(d.getDate() + 1); d.setHours(9, 42, 0, 0); continue; }
      if (m < 9 * 60 + 30) d.setHours(9, 42, 0, 0);
      break;
    }
    return d.toISOString();
  }
  /** 土日なら前の金曜に寄せる */
  function weekdayBack(x) { var d = new Date(x); while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1); return d.toISOString(); }
  /** n 日前の18:00から見て、その日かそれより前の土曜の18:00（那覇オフ会の日。store の在籍半年の会員の記録と同じ日にするため共通） */
  function satBack(n) { var x = new Date(D(-n, 18, 0)); while (x.getDay() !== 6) x.setDate(x.getDate() - 1); return x.toISOString(); }
  /** いまより n 分前までに収める */
  function capNow(x, n) { return new Date(Math.min(new Date(x).getTime(), CLG.now().getTime() - (n || 1) * MIN)).toISOString(); }
  /** 次の平日の h 時（after より後） */
  function nextWeekday(after, h) {
    var d = atH(after, h);
    if (d <= new Date(after)) d.setDate(d.getDate() + 1);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    return d.toISOString();
  }
  /** after より後の dow 曜日の h 時 */
  function dowAfter(after, dow, h) {
    var d = atH(after, h);
    while (d.getDay() !== dow || d <= new Date(after)) d.setDate(d.getDate() + 1);
    return d.toISOString();
  }

  /* 本文に日付を書くときの小さな書式（ui.js より先に読まれるので、ここで持つ） */
  function md(x) { var d = new Date(x); return (d.getMonth() + 1) + '/' + d.getDate(); }
  function mdw(x) { var d = new Date(x); return md(d) + '(' + WD[d.getDay()] + ')'; }
  function hm(x) { var d = new Date(x); return d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2); }
  function mon(x) { return new Date(x).getMonth() + 1; }
  /** 暦の上で何日先か（今日＝0） */
  function dayDiff(x, from) {
    var a = new Date(x), b = new Date(from || CLG.now());
    a.setHours(0, 0, 0, 0); b.setHours(0, 0, 0, 0);
    return Math.round((a - b) / DAY);
  }
  function yen(n) { return Number(n).toLocaleString('ja-JP') + '円'; }
  /** n か月後の同じ日（その日がない月は月末）。domain.js の請求日と同じ数え方 */
  function addMonths(x, n) { var d = new Date(x), d0 = d.getDate(); d.setMonth(d.getMonth() + n); if (d.getDate() < d0) d.setDate(0); return d; }
  /** 入会日から数えた、いちばん最近の請求日 */
  function lastBill(joinedAt) {
    var k = 0, now = CLG.now();
    while (addMonths(joinedAt, k + 1) <= now) k++;
    return addMonths(joinedAt, k).toISOString();
  }
  function pad(n, w) { var s = String(n); while (s.length < w) s = '0' + s; return s; }
  function ymd(d) { d = new Date(d); return d.getFullYear() + '-' + pad(d.getMonth() + 1, 2) + '-' + pad(d.getDate(), 2); }
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }

  /* ---------- サービスの基本 ---------- */
  var PREVIEW_URL = 'https://playmark0227-svg.github.io/terakoya-preview/';
  var SITE = {
    name: 'TAISEI',        // サービスの名前（2026-09-25 に決定）。画面・題・メール・シェアの文はここから作る
    nameEn: 'TAISEI',
    nameKana: 'タイセイ',  // 読み。読み上げ・よみがなの欄に使う（画面の屋号はロゴの絵。ui.js の brandmark）
    tagline: '人生を大成させる。',   // 合言葉。ログインの画面・公開サイトのフッター（site.js footerHtml）・共有の画像にだけ、飾らずに出す。収入の話の隣には置かない
    note: '',              // 名前の横の小さな注記。空なら出さない（使う側は空を必ず扱う）
    catchcopy: '副業を仲間と学べるオンラインスクール',
    lead: '',              // 下で contentLine から作る
    contentLine: '',       // 下で講座の数から作る
    lessonLength: '1本10〜15分（長いものでも20分）',
    price: 10000,          // 月額（税込・検討中）
    entryFee: 0,
    billing: '入会日から1か月ごとの自動更新（日割りなし）',
    payment: 'クレジットカード（Stripe）',
    company: '株式会社◯◯（調整中）',
    siteUrl: '',           // 紹介リンクの土台。本番のドメインが決まったらここに書く。空なら下の siteBase() で決める
    previewUrl: PREVIEW_URL,
    lineName: '公式LINE',
    version: '0.3',        // 画面の見かた・README の版はここを見る
    docsDate: { made: '2026-09-23', revised: '2026-09-25' },   // 規約・プライバシー・特商法の制定日と改定日
    replySla: '返信は平日24時間以内（土日祝は翌営業日）',
    contactHours: '平日10:00〜18:00',
    memberNoLabel: '会員番号',
    allowPause: false,     // 休会（決定事項：画面は作るが既定では出さない）
    graceDays: 7,          // 支払いエラーのあと使える日数
    keepDays: 365,         // 退会後に記録を残す日数
    zoomPlaceholder: 'https://zoom.us/j/0000000000',
    // 紹介報酬を振り込む元の口座（全銀の振込ファイルの頭の行。運営画面の紹介報酬が読む）。
    // 会社の口座が決まるまでは仮の値（決定事項：事業者情報は調整中）。name・bankName・branchName は半角カナ
    payer: { code: '0000000000', name: 'ｶ)ﾀｲｾｲ', bank: '0000', bankName: '', branch: '000', branchName: '', kind: '1', account: '0000000' }
  };

  /** 紹介リンクとQRの土台。公開プレビューなど手元以外で開いたときは、そのページのあるフォルダを使う。
      手元（localhost・ファイル）や Node で動かしたときは、公開プレビューの URL にする（外の人が開ける URL にするため） */
  function siteBase() {
    try {
      var loc = global.location;
      if (loc && /^https?:$/.test(loc.protocol || '') && loc.hostname) {
        var local = /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|\[?::1\]?)/.test(loc.hostname) || /\.local$/.test(loc.hostname);
        if (!local) return loc.origin + String(loc.pathname || '/').replace(/[^/]*$/, '');
      }
    } catch (e) {}
    return PREVIEW_URL;
  }
  if (!SITE.siteUrl) SITE.siteUrl = siteBase();

  /* ---------- 学びのレベル ----------
     講座・イベント参加・投稿などで「学びの経験値（XP）」がたまり、レベルが上がる。
     講座はレベルで開く。紹介の人数ではレベルは上がらない（勧誘を学びの条件にしないため）。 */
  var LEVELS = [
    { lv: 1, name: '入門',     min: 0 },
    { lv: 2, name: '手習い',   min: 120 },
    { lv: 3, name: '稽古',     min: 300 },
    { lv: 4, name: '実践',     min: 560 },
    { lv: 5, name: '独り立ち', min: 900 },
    { lv: 6, name: '師範代',   min: 1400 }
  ];
  function levelOf(xp) { var cur = LEVELS[0]; LEVELS.forEach(function (l) { if (xp >= l.min) cur = l; }); return cur.lv; }

  var XP = {
    lesson: 20,        // 講座を1回見終える
    archive: 10,       // 勉強会の録画を1本見る
    event: 30,         // イベントに参加する
    post: 5,           // タイムラインに投稿する
    postPerDay: 3,     // 投稿でXPが付くのは1日この回数まで
    gigDone: 40,       // 案件をやり終える
    quiz: 10           // 講座の確認テストに合格する（修了の条件にはしない）
  };
  var QUIZ_PASS = 2;   // 3問のうち、これだけ正解で合格

  /* ---------- 学部と講座 ----------
     level: その講座が開くレベル
     lessons: [id, 題, 分]。講座の中の1本は「回」、講座をまたいだ数は「本」と数える */
  var FACULTIES = [
    { id: 'basic', name: 'はじめの学部', desc: '副業の基礎、お金と税金', img: 'assets/img/fac-basic.webp', alt: '電卓で計算している手元' },
    { id: 'sns',   name: '発信の学部',   desc: 'SNS・Instagram・ショート動画', img: 'assets/img/fac-sns.webp', alt: 'カフェでスマートフォンを構える女性' },
    { id: 'skill', name: '在宅スキルの学部', desc: 'AI・動画編集・デザイン・ライティング', img: 'assets/img/fac-skill.webp', alt: '夜、自宅でノートパソコンを見ながらメモを取る男性' },
    { id: 'sales', name: '営業の学部',   desc: '営業、紹介、フリーランスの案件獲得', img: 'assets/img/fac-sales.webp', alt: 'タブレットを見ながら話す二人' },
    { id: 'biz',   name: '起業の学部',   desc: 'マーケティング、起業、法人化', img: 'assets/img/fac-biz.webp', alt: '店の棚に器を並べる女性' }
  ];

  function L(prefix, rows) {
    return rows.map(function (r, i) { return { id: prefix + '-' + (i + 1), title: r[0], min: r[1] }; });
  }

  var COURSES = [
    { id: 'orientation', img: 'assets/img/course-orientation.webp', alt: '夜、自宅でノートパソコンの動画を見る女性', faculty: 'basic', level: 1, title: 'オリエンテーション', teacher: 'staff2',
      summary: '会員ページの使い方と、入会後30日でやること。最初に見てください。',
      learn: ['会員ページでできること', '講座・イベント・案件の使い方', '最初の30日で目指すところ', 'コミュニティと紹介のルール'],
      lessons: L('ori', [['会員ページでできること', 8], ['会員ページの使い方（5分で全部）', 6], ['最初の30日で目指すところ', 9], ['コミュニティと紹介のルール', 7]]) },
    { id: 'business-basic', img: 'assets/img/course-business-basic.webp', alt: '朝の電車でスマートフォンを見る女性', faculty: 'basic', level: 1, title: 'ビジネスの基礎', teacher: 'staff1',
      summary: 'お金の流れ、副業の種類、1日30分で回す方法。',
      learn: ['副業でお金が生まれるしくみ', '自分に向いている副業の種類', '1日30分で回す時間割の作り方'],
      lessons: L('bb', [['お金はどこから生まれるか', 14], ['売れる人がやっていること', 12], ['副業の種類と、向き不向き', 16], ['1日30分でできる副業の設計', 11], ['やらないことを決める', 9]]) },
    { id: 'okozukai', img: 'assets/img/course-okozukai.webp', alt: '小包の横でスマートフォンを操作する手元', faculty: 'basic', level: 1, title: 'お小遣い案件の始め方', teacher: 'staff2',
      summary: 'アンケートやモニターなど、スマホで完結する案件のやり方。',
      learn: ['安全なお小遣い案件の見分け方', 'モニター・アンケートの進め方', '報酬の受け取りと記録のつけ方'],
      lessons: L('ok', [['お小遣い案件って何？安全に選ぶ3つの視点', 10], ['モニター・アンケート案件の進め方', 8], ['報酬の受け取りと記録のつけ方', 7]]) },
    { id: 'money-tax', img: 'assets/img/fac-basic.webp', alt: '電卓で計算している手元', faculty: 'basic', level: 1, title: 'お金と税金の基礎', teacher: 'guest1',
      summary: '確定申告、経費、20万円のライン、開業届。提携の税理士が話します。',
      learn: ['確定申告が必要になる条件', '経費になるもの・ならないもの', 'スマホで週1回つける帳簿', '開業届を出すタイミング'],
      lessons: L('mt', [['副業と確定申告、最初に知っておくこと', 15], ['経費になるもの・ならないもの', 13], ['帳簿は「スマホで週1」で足りる', 10], ['開業届はいつ出す？', 9]]) },
    { id: 'sns-basic', img: 'assets/img/fac-sns.webp', alt: 'カフェでスマートフォンを構える女性', faculty: 'sns', level: 1, title: 'SNS発信入門', teacher: 'staff4',
      summary: 'プロフィールの作り方と、投稿を続けるコツ。',
      learn: ['発信を始める前に決めること', '自分の軸を1行で言う方法', 'プロフィールの整え方', '投稿を続けるための型', '週1回の数字の見方'],
      lessons: L('sb', [['発信で得られるもの・失うもの', 10], ['自分の「軸」を1行で言う', 12], ['プロフィールの整え方', 9], ['投稿を続けるための型', 11], ['数字の見方（週1でOK）', 8]]) },
    { id: 'ai', img: 'assets/img/course-ai.webp', alt: 'カフェの窓際でノートパソコンに向かう女性', faculty: 'skill', level: 2, title: 'AI活用', teacher: 'staff3',
      summary: 'ChatGPTなどの生成AIで、文章・企画・表計算の作業を減らす。',
      learn: ['生成AIに任せられる作業・任せられない作業', '指示（プロンプト）の書き方', '文章・企画・表計算をAIと作る手順', '実際の案件でAIを使った例'],
      lessons: L('ai', [['生成AIでできること・できないこと', 12], ['指示の出し方（プロンプト）の基本', 15], ['文章・企画・表計算をAIと作る', 18], ['画像と動画のAI', 14], ['AIで副業の作業を減らす実例', 16]]) },
    { id: 'writing', img: 'assets/img/course-writing.webp', alt: '本棚の前でノートパソコンに文章を打つ男性', faculty: 'skill', level: 2, title: 'ライティング', teacher: 'guest2',
      summary: '記事の書き方、見出しと要約、納品前のチェック。',
      learn: ['読まれる文章の型', '見出しと要約の作り方', '納品前のチェック表'],
      lessons: L('wr', [['「読まれる」文章の型', 12], ['見出しと要約の作り方', 10], ['取材して書く', 14], ['納品前のチェック表', 8]]) },
    { id: 'instagram', img: 'assets/img/course-instagram.webp', alt: 'パン屋でパンをスマートフォンで撮る女性', faculty: 'sns', level: 3, title: 'Instagram運用', teacher: 'staff4',
      summary: 'アカウント設計、投稿、リール、運用代行の受け方。',
      learn: ['アカウントの設計（誰に・何を）', '保存される投稿の作り方', 'リールとストーリーズの使い分け', '運用代行として仕事を受けるまで'],
      lessons: L('ig', [['アカウント設計（誰に、何を）', 14], ['保存される投稿の作り方', 16], ['リールの基本', 13], ['ストーリーズで関係を深める', 11], ['運用代行として仕事にする', 15]]) },
    { id: 'video', img: 'assets/img/course-video.webp', alt: '三脚のスマートフォンで花を生ける手元を撮影しているところ', faculty: 'skill', level: 3, title: '動画編集', teacher: 'staff3',
      summary: 'カット、テロップ、音入れ。60秒の縦動画を1本作るまで。',
      learn: ['編集ソフトの準備と基本操作', 'カットとテロップでテンポを作る', '音と効果音の入れ方', 'ポートフォリオと、はじめての納品'],
      lessons: L('vd', [['編集ソフトの準備と基本操作', 16], ['カットとテンポ', 14], ['テロップの入れ方', 15], ['音と効果音', 11], ['ポートフォリオを作る', 12], ['はじめての納品', 10]]) },
    { id: 'design', img: 'assets/img/course-design.webp', alt: '色見本を持つ女性', faculty: 'skill', level: 3, title: 'Webデザイン', teacher: 'staff4',
      summary: 'バナー、チラシ、ノーコードのホームページ。見積もりの出し方まで。',
      learn: ['デザインの4原則', '配色と文字の選び方', 'バナーを1枚つくる手順', 'ノーコードのホームページ', '見積もりの出し方'],
      lessons: L('ds', [['デザインの4原則', 12], ['配色と文字の選び方', 13], ['バナーを1枚つくる', 18], ['ノーコードでホームページ', 20], ['見積もりと納品', 10]]) },
    { id: 'sales-basic', img: 'assets/img/fac-sales.webp', alt: 'タブレットを見ながら話す二人', faculty: 'sales', level: 3, title: '営業・セールスの基本', teacher: 'staff5',
      summary: 'ヒアリング、提案書、断られたときの対応。',
      learn: ['ヒアリングで聞くこと', '最初の5分の進め方', '1枚の提案書', '断られたときの考え方'],
      lessons: L('sl', [['営業は「相手の困りごと」を聞く仕事', 12], ['最初の5分でやること', 11], ['提案書は1枚でいい', 14], ['断られたときの考え方', 9], ['紹介をお願いする作法', 10]]) },
    { id: 'marketing', img: 'assets/img/course-marketing.webp', alt: 'ホワイトボードの付箋を前に話し合う三人', faculty: 'biz', level: 4, title: 'マーケティング', teacher: 'staff1',
      summary: 'お客さんの決め方、集客、LINEでのフォロー、数字の見方。',
      learn: ['誰に売るかの決め方', '商品の価値を言葉にする', '集客の入口のつくり方', 'LINEでのフォロー', '数字で直すところを見つける'],
      lessons: L('mk', [['誰に売るかの決め方', 15], ['商品の価値を言葉にする', 14], ['集客の入口をつくる', 16], ['LINEでつながり続ける', 13], ['数字で改善する', 12]]) },
    { id: 'affiliate', img: 'assets/img/course-affiliate.webp', alt: 'キッチンのテーブルでタブレットを見せ合う二人', faculty: 'sales', level: 4, title: '紹介・営業代行の始め方', teacher: 'staff5',
      summary: '会員限定のサービスを紹介するときの流れと、守るルール。',
      learn: ['紹介と営業代行のしくみ', 'やってはいけないこと（法律とルール）', '信頼を失わない紹介の仕方'],
      lessons: L('af', [['紹介と営業代行のしくみ', 11], ['法律とルール（やってはいけないこと）', 14], ['つなぐだけの「トスアップ」', 9], ['信頼を失わない紹介の仕方', 12]]) },
    { id: 'freelance', img: 'assets/img/course-freelance.webp', alt: 'コワーキングスペースでビデオ通話をする男性', faculty: 'sales', level: 4, title: 'フリーランスで案件を取る', teacher: 'staff5',
      summary: '職務経歴の書き方、面談、単価の決め方。',
      learn: ['職務経歴の書き直し方', '面談で聞かれること', '単価の決め方と交渉'],
      lessons: L('fl', [['フリーランスという働き方', 12], ['職務経歴を「売れる形」に書き直す', 15], ['面談で聞かれること', 11], ['単価の決め方と交渉', 13], ['継続してもらう人の共通点', 10]]) },
    { id: 'shortvideo', img: 'assets/img/course-shortvideo.webp', alt: 'スマートフォンで自分を撮影する女性', faculty: 'sns', level: 4, title: 'ショート動画で伸ばす', teacher: 'staff3',
      summary: 'TikTok・リール・YouTubeショートの企画と撮り方。',
      learn: ['ショート動画が見られる流れ', '最初の2秒のつくり方', '企画の出し方', '撮影から投稿まで30分で終える手順'],
      lessons: L('sv', [['ショート動画の視聴のされ方', 10], ['最初の2秒', 12], ['企画の出し方', 14], ['撮影から投稿まで30分', 15]]) },
    { id: 'startup', img: 'assets/img/fac-biz.webp', alt: '店の棚に器を並べる女性', faculty: 'biz', level: 5, title: '起業・法人化', teacher: 'staff1',
      summary: '個人事業と法人の違い、事業計画、資金、契約書。',
      learn: ['個人事業と法人の違い', '1枚の事業計画', '資金の集め方', '契約書の読み方'],
      lessons: L('su', [['個人事業と法人の違い', 14], ['事業計画を1枚にする', 16], ['資金の集め方', 15], ['契約書の読み方', 13], ['人に任せる', 12]]) },
    { id: 'nocode', img: 'assets/img/course-nocode.webp', alt: '夜、自宅のスタンディングデスクで作業する男性', faculty: 'skill', level: 5, title: 'ノーコード・プログラミング', teacher: 'staff3',
      summary: '予約フォームや表計算の自動化。AIにコードを書かせる方法も。',
      learn: ['ノーコードでできること', '予約フォームの作り方', 'スプレッドシートの自動化', 'AIにコードを書いてもらう方法'],
      lessons: L('nc', [['ノーコードでできること', 12], ['予約フォームを作る', 18], ['スプレッドシートを自動化する', 17], ['AIにコードを書いてもらう', 16], ['小さなWebアプリを公開する', 20]]) },
    { id: 'coaching', img: 'assets/img/course-coaching.webp', alt: '向かい合って話す二人の女性', faculty: 'biz', level: 5, title: 'コーチングと自分の育て方', teacher: 'staff2',
      summary: '目標の立て方、習慣、人の話の聴き方。',
      learn: ['行動で立てる目標', '続く習慣の組み方', '人の話の聴き方'],
      lessons: L('co', [['目標は「行動」で立てる', 12], ['習慣を設計する', 11], ['人の話を聴く', 14], ['チームで進む', 12]]) },
    { id: 'teacher', img: 'assets/img/course-teacher.webp', alt: 'テーブルを囲む人たちに話す女性', faculty: 'biz', level: 6, title: '師範代講座（講座を出す側へ）', teacher: 'staff1',
      summary: 'TAISEIで教える側になるための準備と、講座を出す手続き。',
      learn: ['TAISEIで教える側になるための準備', '講座の設計図', '収録と編集', '講座を出す手続きと売上の分け方'],
      lessons: L('tc', [['教える側になるとは', 10], ['講座の設計図', 16], ['収録と編集', 14], ['講座を出す手続きと売上の分け方', 12]]) }
  ];

  /* 講座の中身（19講座の全部の回）。回の id: [説明, この回でわかること3つ, [資料の名前, 種類（pdf/slide/doc/sheet/zip/video/txt）]]。
     タイムラインや運営の返事が「◯◯の第N回」と書いているものは、ここの中身と合わせてある */
  var LESSON_DETAIL = {
    'ori-1': ['講座・タイムライン・案件・イベント・相談・福利厚生を、実際の画面で順に見ます。',
      ['ホーム：今日やることと、続きの講座', '講座：レベルで開く順番', '相談・メッセージ：運営に聞く場所'], ['会員ページの地図（PDF・1ページ）', 'pdf']],
    'ori-2': ['スマホとパソコンで、ログインから講座の再生、投稿、イベントの予約までを通しでやってみせます。',
      ['ログインと会員番号', 'スマホのホーム画面に追加する', '通知をLINEで受け取る設定'], ['操作の手順書（PDF・2ページ）', 'pdf']],
    'ori-3': ['スタートガイドの10項目を、週ごとに何をするかで説明します。',
      ['1週目：プロフィールと自己紹介', '2週目：講座3回と運営との面談', '3〜4週目：案件への応募と成果発表会'], ['30日の目標シート（PDF）', 'pdf']],
    'ori-4': ['投稿・案件・紹介で守ってほしいことと、その理由です。',
      ['会員どうしの勧誘・営業はしない', '紹介では報酬があることを伝え、#PRを付ける', '講座や録画の中身は外に出さない'], ['コミュニティのルール（PDF・1ページ）', 'pdf']],
    'sb-1': ['発信を始める前に、何に時間を使うのかと、顔や名前をどこまで出すかを決めます。',
      ['発信で得られることと、かかる時間', '顔・名前・地域をどこまで出すか', '家族や職場との線引き'], ['公開範囲のチェック表（PDF）', 'pdf']],
    'sb-2': ['「誰に・何を・どんな自分が」の3つを埋めて、プロフィールの1行目を作ります。',
      ['軸は「誰に・何を・どんな自分が」', '会員の例文12個', '1行に収まらないときの削り方'], ['軸を決めるワークシート（Googleスライド）', 'slide']],
    'sb-3': ['Instagram・X・noteのプロフィールを、同じ軸でそろえます。',
      ['名前の横に何を書くか', 'アイコン写真の選び方', 'リンクは1つにしぼる'], ['プロフィール文の例12（PDF）', 'pdf']],
    'sb-4': ['毎回ゼロから考えずに済む、投稿の型を3つ渡します。',
      ['型1：やったことの記録', '型2：よく聞かれる質問に答える', '型3：おすすめを1つ紹介する'], ['投稿の型テンプレート（Googleドキュメント）', 'doc']],
    'sb-5': ['週に1回、見る数字を3つだけに決めます。',
      ['保存数', 'プロフィールを見た人の数', 'フォローが増えた投稿'], ['週1の記録表（スプレッドシート）', 'sheet']],
    'vd-1': ['無料の編集ソフトを入れて、素材を読み込み、書き出すまでを通しでやります。',
      ['スマホ版とパソコン版の違い', '素材の読み込みと並べ方', '書き出しの設定（縦 1080×1920）'], ['練習用の素材（動画3本・ZIP）', 'zip']],
    'vd-2': ['60秒の素材を、話の間を詰めて45秒にします。',
      ['最初の2秒に何を置くか', '間を詰めるカット', 'BGMの拍に合わせる'], ['カット前とカット後の見本（動画）', 'video']],
    'vd-3': ['読みやすいテロップの大きさ・位置・色を、見本を見ながら入れます。',
      ['1行は12文字まで', '字幕とテロップの違い', 'フォントは2種類まで'], ['テロップの見本（PDF）', 'pdf']],
    'vd-4': ['BGMの音量と、効果音の入れどころを決めます。',
      ['BGMは声より小さく', '効果音は1本に3か所まで', '使える音源サイトと利用規約'], ['音量の目安表（PDF）', 'pdf']],
    'vd-5': ['練習で作った動画を、仕事の相手に見せられる形にまとめます。',
      ['見せるのは3本でいい', '1本ごとに「何をしたか」を書く', '限定公開のリンクで渡す'], ['ポートフォリオのひな形（Googleスライド）', 'slide']],
    'vd-6': ['納品の前に見るチェック表と、修正の受け方です。',
      ['納品前のチェック10項目', 'ファイル名と渡し方', '修正は何回までかを先に決める'], ['納品前チェック表（PDF）', 'pdf']],
    'bb-1': ['誰かの困りごとを解決したときにお金が払われる、という基本を、会員の案件の例で見ます。',
      ['お金を払うのは困っている人', '同じ作業でも、相手によって値段が変わる', '最初の1件は小さくていい'], ['困りごと書き出しシート（PDF）', 'pdf']],
    'bb-2': ['案件を続けて頼まれる人がやっていることを、運営が見てきた例から3つ挙げます。',
      ['返事は24時間以内', '頼まれた範囲を先に確かめる', '終わったら報告を1行で'], ['連絡のひな形（テキスト）', 'txt']],
    'bb-3': ['お小遣い案件・業務委託・紹介・自分の商品の4つを、かかる時間と始めやすさで比べます。',
      ['お小遣い案件：すきま時間で始められる', '業務委託：講座を修了してから', '紹介：報酬があることを先に伝える'], ['副業の種類の比較表（PDF）', 'pdf']],
    'bb-4': ['平日30分・週末2時間で、1週間に何ができるかを時間割にします。',
      ['使える時間を先に書き出す', '講座を見る日と作業の日を分ける', '週末に翌週の予定を決める'], ['1週間の時間割（スプレッドシート）', 'sheet']],
    'bb-5': ['副業を始めるときに、手を出さないと決めておくものを整理します。',
      ['高額な教材・塾には申し込まない', '「必ず稼げる」という話には乗らない', '家族との時間を先に決める'], ['やらないことリスト（PDF）', 'pdf']],
    'ok-1': ['モニター・アンケートなどの案件を、安全に選ぶための見方です。',
      ['お金を先に払う案件は受けない', '会社名と連絡先を確かめる', '個人情報をどこまで出すか決めておく'], ['案件のチェック表（PDF）', 'pdf']],
    'ok-2': ['商品が届いてから報告を出すまでを、実際の案件の手順で見ます。',
      ['届いたらすぐ写真を撮る', '締切の前日に出す', '分からないことは運営に聞く'], ['報告のひな形（テキスト）', 'txt']],
    'ok-3': ['報酬の受け取り方と、確定申告のために残しておくものです。',
      ['振込先は本人名義の口座', 'いつ・いくら・何の案件かを記録する', '1年の合計は「お金と税金の基礎」で'], ['報酬の記録表（スプレッドシート）', 'sheet']],
    'mt-1': ['会社員が副業を始めたときに、確定申告がいる場合といらない場合を分けて説明します。住民税の申告も扱います。',
      ['副業の所得が年20万円を超えたら確定申告', '20万円以下でも住民税の申告はいる', '会社への届け出は就業規則を見てから'], ['申告がいるかどうかの早見表（PDF・1ページ）', 'pdf']],
    'mt-2': ['副業のために使ったお金のうち、経費にできるものとできないものを、会員の質問を例に分けます。',
      ['経費にできるのは仕事に使った分だけ', '家と兼ねるものは按分する（通信費・家賃）', 'レシートと明細を残しておく'], ['経費の早見表（PDF・2ページ）', 'pdf']],
    'mt-3': ['副業の帳簿を、スマホの会計アプリで週に1回つけるやり方です。',
      ['入れるのは日付・金額・何に使ったか', '週に1回まとめて入れる', '銀行とカードの明細をつないでおく'], ['週1の記帳チェック表（PDF）', 'pdf']],
    'mt-4': ['開業届と、青色申告の承認申請を出す時期と、出したあとに変わることです。',
      ['事業を始めて1か月以内が目安', '青色申告の承認申請と一緒に出す', '出すと変わること・変わらないこと'], ['開業届の書き方の見本（PDF）', 'pdf']],
    'ai-1': ['文章・画像・表計算で、AIに任せられることと、人が確かめることを分けます。',
      ['下書きはAI、確認は人', '数字と固有名詞は必ず確かめる', 'お客さんの情報は入れない'], ['AIに任せる作業の一覧（PDF）', 'pdf']],
    'ai-2': ['同じ頼みごとでも、結果が変わる指示の書き方です。',
      ['役割・目的・形を書く', '例を1つ付ける', '直してほしい点を具体的に返す'], ['指示文の例20（テキスト）', 'txt']],
    'ai-3': ['提案書の骨組み、SNSの投稿文、表計算の式を、AIと一緒に作ります。',
      ['提案書は見出しから作らせる', '投稿文は3案出させて選ぶ', '表計算の式は説明も書かせる'], ['練習用のデータ（スプレッドシート）', 'sheet']],
    'ai-4': ['バナーや動画の下書きを、画像・動画のAIで作るときの手順と注意です。',
      ['商用に使えるか利用規約を見る', '人の顔や店名は入れない', '文字は最後に自分で入れる'], ['利用規約の確認表（PDF）', 'pdf']],
    'ai-5': ['会員の運用代行と事務の案件で、AIを使って作業を減らした例を見ます。',
      ['月次レポートの下書き', 'お客さんへの返信の下書き', '議事録と要約'], ['実例の手順書（PDF・8ページ）', 'pdf']],

    // ライティング
    'wr-1': ['結論を先に書き、理由と例を続ける型で、400字の記事を1本書きます。',
      ['結論 → 理由 → 例 → まとめの順', '1文は60字まで', '読む人を1人に決めてから書く'], ['文章の型のテンプレート（Googleドキュメント）', 'doc']],
    'wr-2': ['見出しを読むだけで中身が分かるように直し、最後に3行の要約を付けます。',
      ['見出しには「何が分かるか」を書く', '要約は3行・1行40字まで', '数字を入れると中身が伝わりやすい'], ['見出しの直し方の例（PDF）', 'pdf']],
    'wr-3': ['お店や人に話を聞いて記事にするまでの流れです。質問の作り方と、公開前の確認のもらい方も扱います。',
      ['質問は10個書き出してから行く', '録音は先に許可をもらう', '公開前に相手に読んでもらう'], ['取材の質問リスト（PDF）', 'pdf']],
    'wr-4': ['納品の前に見る項目を、表でひとつずつ確かめます。',
      ['誤字と表記のゆれ', '名前・数字・日付', '文字数と納期'], ['納品前のチェック表（PDF）', 'pdf']],

    // Instagram運用
    'ig-1': ['誰に向けて何を出すアカウントかを決め、プロフィールと最初の9投稿の計画を作ります。',
      ['見てほしい人を1人に決める', '出す話題は3つまで', '最初の9投稿を先に決める'], ['アカウント設計シート（Googleスライド）', 'slide']],
    'ig-2': ['あとで見返したくなる投稿の作り方です。まとめの投稿と手順の投稿を、見本を見ながら作ります。',
      ['1枚目に何の投稿かを書く', '中身は手順か比べる形にする', '最後の1枚に次にしてほしいことを書く'], ['投稿の見本10（PDF）', 'pdf']],
    'ig-3': ['15秒前後のリールを1本作ります。撮る前に決めることと、スマホでの編集の手順です。',
      ['最初の2秒に見せたいものを置く', '縦で撮り、明るい場所を選ぶ', '文字は画面の真ん中あたりに入れる'], ['リールの台本シート（PDF）', 'pdf']],
    'ig-4': ['ストーリーズで、フォローしている人とのやりとりを増やす出し方です。',
      ['1日1〜3回、時間を決めて出す', 'アンケートと質問の機能を使う', '残したいものはハイライトにまとめる'], ['ストーリーズの計画表（スプレッドシート）', 'sheet']],
    'ig-5': ['お店のInstagramを任せてもらうまでの流れです。見積もりの出し方と、月の報告の形も扱います。',
      ['作業の範囲を1行ずつ書き出す', '修正の回数を見積書に書く', '月の報告は1枚にまとめる'], ['見積書と月の報告のひな形（スプレッドシート）', 'sheet']],

    // Webデザイン
    'ds-1': ['近接・整列・反復・コントラストの4つを、直す前と直した後のバナーで見比べます。',
      ['関係するものは近くに置く', '左か中央のどちらかにそろえる', '強調するのは1か所だけ'], ['直す前と直した後の見本（PDF）', 'pdf']],
    'ds-2': ['色は3色まで、文字は2種類までに決めて、読みやすい組み合わせを選びます。',
      ['ベース・メイン・強調の3色', '文字の種類は2つまで', '背景と文字の明るさに差をつける'], ['配色の見本帳（PDF）', 'pdf']],
    'ds-3': ['無料のデザインツールで、セールのバナーを1枚作って書き出すまでを通しでやります。',
      ['大きさは載せる場所に合わせて先に決める', '入れる文字は3行まで', '書き出しはPNGとJPEGを使い分ける'], ['バナーの練習用の素材（ZIP）', 'zip']],
    'ds-4': ['ノーコードの道具で、お店の1ページのホームページを作って公開します。',
      ['ひな形を選んでから直す', '写真と文章は先に用意する', 'スマホでの見え方を先に確かめる'], ['ホームページの手順書（PDF・6ページ）', 'pdf']],
    'ds-5': ['デザインの仕事の見積もりの出し方と、納品のしかたです。修正の回数は見積書に書いておきます。',
      ['作業ごとに金額を分けて書く', '修正は2回までと先に決める', 'データの形と渡し方を決めておく'], ['見積もりの表（スプレッドシート）', 'sheet']],

    // 営業・セールスの基本
    'sl-1': ['売り込む前に、相手が何に困っているかを聞く順番を覚えます。',
      ['話す時間より聞く時間を長く', '困りごとを相手の言葉で書き留める', 'その場で売り込まない'], ['ヒアリングシート（PDF）', 'pdf']],
    'sl-2': ['電話や面談の最初の5分で、名乗り方・時間の確かめ方・今日話すことを伝える流れです。',
      ['名前と用件を先に言う', '何分話せるかを聞く', '今日決めたいことを1つ伝える'], ['最初の5分の台本（PDF）', 'pdf']],
    'sl-3': ['相手の困りごと・やること・費用・期間を、1枚の提案書にまとめます。',
      ['困りごとは相手の言葉で書く', 'やることは3つまで', '費用と期間を同じ1枚に書く'], ['1枚の提案書のひな形（Googleスライド）', 'slide']],
    'sl-4': ['断られた理由を記録して、次の話し方を1か所ずつ直すやり方です。',
      ['断られた理由をその日に書く', '1か月分を見返して多い理由を探す', '台本は1行ずつ直す'], ['断られた理由の記録表（スプレッドシート）', 'sheet']],
    'sl-5': ['仕事を終えたお客さんに、知り合いを紹介してもらうときの頼み方です。',
      ['仕事が終わってから頼む', '紹介してほしい相手を具体的に言う', '断られても付き合い方は変えない'], ['紹介のお願いの文例（テキスト）', 'txt']],

    // マーケティング
    'mk-1': ['いまのお客さんを見直して、いちばん喜んでくれる人を1人に決めます。',
      ['いまのお客さんを5人書き出す', '年齢より「困っていること」で分ける', '1人に決めてから文章を書く'], ['お客さんの書き出しシート（PDF）', 'pdf']],
    'mk-2': ['お客さんから見た商品のよさを、短い言葉にまとめます。',
      ['機能ではなく、使ったあとの変化を書く', 'お客さんの声をそのまま使う', '15字で言えるまで削る'], ['言葉づくりのワークシート（Googleドキュメント）', 'doc']],
    'mk-3': ['SNS・チラシ・紹介など、お客さんが最初に知る場所を1つ決めて整えます。',
      ['入口は1つから始める', '入口から予約までの手順を短くする', '入口ごとに来た人の数を数える'], ['集客の入口の一覧表（スプレッドシート）', 'sheet']],
    'mk-4': ['LINE公式アカウントで、一度来たお客さんに次の知らせを届ける方法です。',
      ['あいさつの文を先に作る', '配信は月2回くらいから', '売り込みだけの配信にしない'], ['配信の予定表（スプレッドシート）', 'sheet']],
    'mk-5': ['毎週見る数字を決めて、どこを直すかを1つずつ決めていきます。',
      ['見る数字は3つまで', '1回に直すのは1か所', '直す前と後を同じ長さの期間で比べる'], ['週の数字の記録表（スプレッドシート）', 'sheet']],

    // 紹介・営業代行の始め方
    'af-1': ['紹介と営業代行の違いと、報酬の条件がどこに書いてあるかを、TAISEIの案件を例に見ます。',
      ['紹介はつなぐまで、営業代行は話を進めるまで', '報酬の条件は案件のページで確かめる', '契約するのは担当者と相手'], ['紹介と営業代行の比較表（PDF）', 'pdf']],
    'af-2': ['紹介のときに守ることです。報酬があることを先に伝え、SNSでは「#PR」を入れます。',
      ['報酬があることを最初に伝える', 'SNSでは「#PR」を入れる', '「必ず〜」「誰でも〜」とは言わない'], ['紹介のルールのチェック表（PDF）', 'pdf']],
    'af-3': ['話を進めるのは担当者に任せて、相手と担当者をつなぐまでの手順です。',
      ['つなぐ前に相手の了解をとる', '担当者の名前と会社を相手に伝える', 'つないだあとの連絡は担当者から'], ['つなぐときの文例（テキスト）', 'txt']],
    'af-4': ['相手に合わないと思ったら紹介しない、という決め方と、断られたあとの接し方です。',
      ['相手の困りごとに合うときだけ話す', '一度断られたら、もう誘わない', '紹介したあとも様子を聞く'], ['紹介する前の確認リスト（PDF）', 'pdf']],

    // フリーランスで案件を取る
    'fl-1': ['業務委託で仕事を受けるときの契約の形と、会社員との違いです。',
      ['業務委託の契約には請負と準委任がある', '税金と保険の手続きは自分でする', '本業と使う時間の分け方を先に決める'], ['業務委託の契約の見本（PDF）', 'pdf']],
    'fl-2': ['いままでの仕事を、相手が頼みたいことに合わせて書き直します。',
      ['やったことを数字で書く', '頼まれそうな作業から先に書く', '1枚に収める'], ['職務経歴のひな形（Googleドキュメント）', 'doc']],
    'fl-3': ['業務委託の面談でよく聞かれる質問と、答えの準備のしかたです。',
      ['週に何時間使えるか', '似た仕事をした経験', 'いつから始められるか'], ['面談の質問リスト（PDF）', 'pdf']],
    'fl-4': ['かかる時間から単価を出す方法と、金額を伝えるときの言い方です。',
      ['作業時間を先に見積もる', '修正と連絡の時間も入れる', '値下げの前に作業の範囲を減らす'], ['単価の計算表（スプレッドシート）', 'sheet']],
    'fl-5': ['同じ相手から続けて仕事を頼まれる人がしていることを、運営が見てきた例から挙げます。',
      ['納期の前日に一度報告する', '頼まれていない作業はしない', '月に一度、次にできることを伝える'], ['月の報告のひな形（テキスト）', 'txt']],

    // ショート動画で伸ばす
    'sv-1': ['ショート動画がどこで、どのくらいの長さで見られているかを、アプリの画面で見ます。',
      ['おすすめの画面で流れてくる', '最初の数秒で次の動画に移られる', '音を出さずに見る人もいる'], ['見られ方の説明（PDF）', 'pdf']],
    'sv-2': ['最初の2秒に何を置くかを、よく見られている動画の型で練習します。',
      ['結果を先に見せる', '画面に短い文字を入れる', '動きのある場面から始める'], ['最初の2秒の型（PDF）', 'pdf']],
    'sv-3': ['1か月分の企画を、お客さんからよく聞かれる質問をもとに書き出します。',
      ['よく聞かれる質問を10個書く', '1本に話は1つだけ', '同じ型で続ける'], ['企画の書き出しシート（スプレッドシート）', 'sheet']],
    'sv-4': ['1本を撮って、編集して、投稿するまでを30分で終える手順です。',
      ['台本は3行で書く', '撮るのは3カットまで', '編集はスマホのアプリで済ませる'], ['30分の手順表（PDF）', 'pdf']],

    // 起業・法人化
    'su-1': ['個人事業と会社で、税金・手続き・取引先からの見え方がどう変わるかを比べます。',
      ['会社にすると決算と登記の手続きが増える', '税金の違いは提携の税理士に相談できる', '会社でないと契約しない取引先もある'], ['個人事業と法人の比較表（PDF）', 'pdf']],
    'su-2': ['誰に・何を・いくらで・どうやって届けるかを、1枚の事業計画にまとめます。',
      ['お客さんと困りごとを1行で書く', '売上の見込みは控えめに置く', '1か月ごとにやることを書く'], ['1枚の事業計画のひな形（Googleスライド）', 'slide']],
    'su-3': ['自己資金・公的な窓口・補助金の違いと、申し込む前に用意するものです。',
      ['まず自己資金でできる範囲を決める', '創業の相談は商工会議所などの窓口でできる', '補助金は後払いで、審査がある'], ['資金の集め方の一覧（PDF）', 'pdf']],
    'su-4': ['業務委託や取引の契約書で、先に読むところを順に見ます。',
      ['お金を払う時期と方法', '途中でやめるときの決まり', '損害が出たときの責任の範囲'], ['契約書の読むところチェック表（PDF）', 'pdf']],
    'su-5': ['作業の一部を人に頼むときの、頼み方と確かめ方です。',
      ['任せる作業を手順書にする', '最初の1回は一緒にやる', '確かめる日を先に決める'], ['作業の手順書のひな形（Googleドキュメント）', 'doc']],

    // ノーコード・プログラミング
    'nc-1': ['プログラムを書かずに作れるもの（予約フォーム・表の自動化・小さなアプリ）と、向かないものを分けます。',
      ['フォームと表計算の組み合わせが得意', '支払いと個人情報は慎重に扱う', '無料で使える範囲を先に確かめる'], ['ノーコードの道具の一覧（PDF）', 'pdf']],
    'nc-2': ['お店の予約フォームを作って、届いた予約を表にためるところまでやります。',
      ['聞く項目は5つまで', '予約が入ったらお店にメールで知らせる', '予約の締切を決めておく'], ['予約フォームの手順書（PDF）', 'pdf']],
    'nc-3': ['毎週の集計を、関数と自動の実行で手を動かさずに済むようにします。',
      ['集計の手順を先に書き出す', '関数で済むところは関数で', '自動の実行は週1回から'], ['練習用の表（スプレッドシート）', 'sheet']],
    'nc-4': ['作りたいものを文章で伝えて、AIに短いコードを書いてもらい、動くまで直す手順です。',
      ['作りたいものを箇条書きで伝える', 'エラーの文はそのまま貼る', '動いたら何をしているかを説明させる'], ['指示文の例（テキスト）', 'txt']],
    'nc-5': ['作った道具を、ほかの人が使えるように公開するまでの手順と、公開の前に確かめることです。',
      ['誰が使えるかを決める', '個人情報を入れない作りにする', '困ったときの連絡先を書いておく'], ['公開前のチェック表（PDF）', 'pdf']],

    // コーチングと自分の育て方
    'co-1': ['結果ではなく、自分で決められる行動で目標を立てる方法です。スタートガイドの30日後の目標にも使えます。',
      ['「〜になる」より「〜をする」で書く', '期限と回数を入れる', '週に一度、できたかを見る'], ['目標シート（PDF）', 'pdf']],
    'co-2': ['続けたいことを、毎日決まってすることのあとにつなげる方法です。',
      ['「〜したら、〜する」の形で決める', '最初は5分から', 'できなかった次の日だけはやる'], ['習慣の記録表（スプレッドシート）', 'sheet']],
    'co-3': ['相手の話をさえぎらずに聴き、確かめるための質問のしかたです。',
      ['最後まで聴いてから話す', '相手の言葉をくり返して確かめる', '答えを急がず、質問で返す'], ['聴き方の練習メモ（PDF）', 'pdf']],
    'co-4': ['何人かで作業を進めるときの、役割の分け方と連絡の決まりです。',
      ['役割と締切を最初に書く', '連絡の場所を1つにする', '週に一度、短く集まる'], ['役割分担の表（スプレッドシート）', 'sheet']],

    // 師範代講座（講座を出す側へ）
    'tc-1': ['TAISEIで講座を出す人に頼んでいることと、準備にかかる時間の目安です。',
      ['自分がやってきたことから題を選ぶ', '1回10〜15分に分ける', '質問に答える時間もとる'], ['講師のしごとの説明（PDF）', 'pdf']],
    'tc-2': ['講座のゴールを決めて、4〜6回に分ける設計図を作ります。',
      ['見終えた人ができることを1行で書く', '1回に1つのことだけ', '最後に確認テストを3問つくる'], ['講座の設計図のひな形（Googleスライド）', 'slide']],
    'tc-3': ['スマホとパソコンで、講座の動画を収録して編集するまでの手順です。',
      ['声は近くのマイクで録る', '画面の文字は大きめに', '言いまちがいはカットで直す'], ['収録の手順書（PDF）', 'pdf']],
    'tc-4': ['講座を出すまでの確認と契約の流れと、売上の分け方を決める契約書の読み方です。',
      ['出す前に運営の確認がある', '売上の分け方は契約書で決める', '中身を直すときの手続き'], ['講座を出すまでの流れ（PDF）', 'pdf']]
  };
  /* 回を公開した日（講座を始めた日）。新しい回は「新着」になる */
  var LESSON_NEW = { orientation: -236, 'sns-basic': -230, video: -120 };
  var AI5_AT = T(0, 11, 5);   // 「AI活用」第5回は今日の公開（タイムラインの p3 と同じ時刻）
  COURSES.forEach(function (c) {
    c.lessons.forEach(function (l) {
      var x = LESSON_DETAIL[l.id];
      if (x) { l.desc = x[0]; l.points = x[1]; l.material = { name: x[2][0], type: x[2][1] }; }
      if (LESSON_NEW[c.id] != null) l.newAt = D(LESSON_NEW[c.id], 12);
    });
  });
  byId(byId(COURSES, 'video').lessons, 'vd-6').newAt = D(-12, 11, 0);
  byId(byId(COURSES, 'ai').lessons, 'ai-5').newAt = AI5_AT;

  /* 講座の最後の確認テスト（修了の条件にはしない） */
  byId(COURSES, 'orientation').quiz = [
    { q: '講座が開く順番は？', choices: ['入会した日から全部見られる', 'レベルが上がると開き、講座の中は1回ずつ順に開く', '運営に申し込むと開く'], answer: 1,
      why: '講座はレベルで開きます。講座の中は、前の回を見終えると次の回が開きます。', lesson: 'ori-1' },
    { q: '運営に質問したいときは？', choices: ['タイムラインに書く', '「相談・メッセージ」から送る', '公式LINEに電話する'], answer: 1,
      why: '運営への質問は「相談・メッセージ」からです。' + SITE.replySla + '。', lesson: 'ori-1' },
    { q: 'SNSで紹介リンクを載せるときに必ずすることは？', choices: ['「#PR」を入れる', '「必ず稼げる」と書く', '入会した人の名前を書く'], answer: 0,
      why: '紹介の報酬があることが分かるように「#PR」を入れます。収入を約束する書き方はしません。', lesson: 'ori-4' }
  ];
  byId(COURSES, 'sns-basic').quiz = [
    { q: '軸を1行で言うときに入れる3つは？', choices: ['誰に・何を・どんな自分が', 'いつ・どこで・いくらで', 'フォロワー数・投稿数・いいね数'], answer: 0,
      why: '第2回の「誰に・何を・どんな自分が」です。', lesson: 'sb-2' },
    { q: 'プロフィールに載せるリンクはいくつにしぼる？', choices: ['1つ', '3つ', '5つ以上'], answer: 0,
      why: '押してほしい先を1つにします（第3回）。', lesson: 'sb-3' },
    { q: '週1回見る数字に入らないものは？', choices: ['保存数', 'プロフィールを見た人の数', 'ほかの人のフォロワー数'], answer: 2,
      why: '見るのは自分の投稿の数字だけです（第5回）。', lesson: 'sb-5' }
  ];

  /* 公開サイト・料金・申込みの確認画面・特商法で同じ言い方をするための1文（全部を最初から見られるとは書かない。レベルで順に開くため）。
     運営が講座を足したり隠したりしたら、store.js が重ねたあとにもう一度呼ぶ（数を合わせるため） */
  function refreshContent() {
    var lessons = COURSES.reduce(function (a, c) { return a + c.lessons.length; }, 0);
    var lv1 = COURSES.filter(function (c) { return c.level === 1; }).length;
    SITE.contentLine = '講座は' + COURSES.length + '本（' + lessons + '本の動画）。レベルに合わせて順に開きます（入会時はLv1の' +
      lv1 + '講座）。勉強会の録画は最初から見られます';
    SITE.lead = '月額' + yen(SITE.price) + '（税込）。' + SITE.contentLine + '。案件の紹介、運営への相談、各地のオフ会も使えます。';
  }
  refreshContent();

  /* ---------- 人（すべて架空） ----------
     name は会員が決めた表示名（「さん」は付けない）。area の出し方は visibility（決定事項：既定は都道府県まで）。
     photo は空（決定事項：生成した顔写真は使わない。頭文字の丸を出し、本人が上げた写真だけ出す） */
  var PEOPLE = {
    staff1: { name: '森 大輔',   initial: 'M', role: '運営代表',             staff: true, color: '#c63f25',
      bio: '広告代理店で12年、地方の中小企業の集客を担当。TAISEIの代表。「マーケティング」「起業・法人化」を受け持つ。' },
    staff2: { name: '佐藤 圭',   initial: 'S', role: 'コミュニティ運営',     staff: true, color: '#274868',
      bio: '札幌在住。前職は学習塾の教室長。会員からの相談とオリエンテーションを担当。' },
    staff3: { name: '青木 はると', initial: 'A', role: '講師（AI・動画・開発）', staff: true, color: '#2c7a53',
      bio: '動画制作会社を経てフリーランス。企業のショート動画の制作と、AIの社内研修を受けている。' },
    staff4: { name: '小林 みお', initial: 'K', role: '講師（デザイン・SNS）', staff: true, color: '#9a4f8a',
      bio: 'デザイン事務所に8年。いまは那覇で、飲食店と美容室のInstagram運用を請け負っている。' },
    staff5: { name: '石田 けんじ', initial: 'I', role: '講師（営業）',        staff: true, color: '#9a6512',
      bio: '住宅と法人向けITの営業を15年。営業代行チームのまとめ役。' },
    guest1: { name: '中村 健',   initial: 'N', role: '提携税理士',          staff: true, color: '#55514a',
      bio: '札幌の税理士事務所の所長。副業・個人事業の確定申告を毎年200件ほど見ている。' },
    guest2: { name: '松本 ゆう', initial: 'M', role: '講師（ライティング）',  staff: true, color: '#3f6f8f',
      bio: 'Webメディアの編集者を経てライター。取材記事を月に10本ほど書いている。' },
    guest3: { name: '大野 真理子', initial: 'O', role: '提携司法書士',        staff: true, color: '#6b5a8e',
      bio: '仙台の司法書士事務所。会社の設立登記と、相続の手続きが専門。' },
    guest4: { name: '西田 恵',   initial: 'N', role: '提携社会保険労務士',    staff: true, color: '#4f7a6a',
      bio: '福岡の社会保険労務士事務所。小さな会社の労務と、助成金の申請を担当。' },
    guest5: { name: '上原 亮',   initial: 'U', role: '提携行政書士',        staff: true, color: '#8a6a3e',
      bio: '那覇の行政書士事務所。飲食店・民泊の許認可と、補助金の申請書類を担当。' },

    m1:  { name: 'ゆか｜旭川・在宅ワーク修行中', realName: '佐々木 ゆか', initial: 'S', area: '北海道 旭川市', xp: 320, joinedDaysAgo: 17, color: '#c0694e', visibility: 'city',
      job: 'パート（ドラッグストア）', bio: '小学生2人の母。夜の30分で動画編集を練習中。' },
    m2:  { name: '山本 りな',   initial: 'Y', area: '北海道 札幌市', xp: 260, joinedDaysAgo: 150, color: '#6a8caf', visibility: 'city',
      job: '子ども服のネットショップ運営', bio: '3児の母。札幌オフ会の世話役。' },
    m3:  { name: '伊藤 ひろし', initial: 'I', area: '沖縄県 那覇市', xp: 1150, joinedDaysAgo: 230, color: '#4f8a6b', visibility: 'city',
      job: 'ホテル勤務', bio: '週末に民泊の運営。那覇オフ会の主催。' },
    m4:  { name: 'Mai Watanabe', realName: '渡辺 まい', initial: 'W', area: '福岡県 福岡市', xp: 700, joinedDaysAgo: 200, color: '#b0875a', visibility: 'pref',
      job: '会社員（総務）', bio: '平日の朝と夜に、営業のアポ取りを業務委託で受けている。' },
    m5:  { name: '中島 翔太', initial: 'N', area: '東京都 世田谷区', xp: 1650, joinedDaysAgo: 238, color: '#5b6fa8', visibility: 'pref',
      job: 'ITエンジニア', bio: 'オンラインのもくもく作業会の主催。ノーコードとAIの質問に答えています。' },
    m6:  { name: '小川 ともみ', initial: 'O', area: '大阪府 堺市', xp: 420, joinedDaysAgo: 120, color: '#a0617f', visibility: 'pref',
      job: 'パート（事務）', bio: '2児の母。お小遣い案件から始めて、いまはInstagramを勉強中。' },
    m7:  { name: 'こうた@仙台もくもく会', realName: '井上 康太', initial: 'I', area: '宮城県 仙台市', xp: 760, joinedDaysAgo: 160, color: '#7b8f4f', visibility: 'city',
      job: '整体院の経営', bio: '仙台で月1回のもくもく会を始めました。' },
    m8:  { name: '木村 あや',   initial: 'K', area: '沖縄県 浦添市', xp: 1360, joinedDaysAgo: 180, color: '#c27a3e', visibility: 'city',
      job: 'Instagram運用代行', bio: '1児の母。飲食店のInstagram運用を請け負っています。' },
    m9:  { name: '林 翔平', initial: 'H', area: '愛知県 名古屋市', xp: 380, joinedDaysAgo: 110, color: '#4e7f93', visibility: 'pref',
      job: '会社員（メーカー）', bio: '週末にショート動画の編集を練習中。' },
    m10: { name: '清水 なつみ', initial: 'S', area: '北海道 函館市', xp: 200, joinedDaysAgo: 60, color: '#b8647a', visibility: 'pref',
      job: 'パート（事務）', bio: '去年はじめて確定申告をしました。' },
    m11: { name: '山口 けい',   initial: 'Y', area: '広島県 広島市', xp: 820, joinedDaysAgo: 190, color: '#6b7f5e', visibility: 'pref',
      job: 'フリーランス（ライター）', bio: '取材記事と、地元の店の紹介記事を書いています。' },
    m12: { name: 'さとみ（横浜・2児ママ）', realName: '松田 さとみ', initial: 'M', area: '神奈川県 横浜市', xp: 1080, joinedDaysAgo: 170, color: '#8f6aa8', visibility: 'city',
      job: 'Instagram運用代行', bio: '朝5時半から作業する派。美容室と花屋の運用を担当。' },
    m13: { name: '岡田 悠斗', initial: 'O', area: '静岡県 浜松市', xp: 130, joinedDaysAgo: 6, color: '#5d8a8a', visibility: 'city',
      job: '会社員（住宅の営業）', bio: '営業の経験を活かせる案件を探しています。' },
    m14: { name: '藤井 かおり', initial: 'F', area: '沖縄県 沖縄市', xp: 640, joinedDaysAgo: 150, color: '#a57758', visibility: 'pref',
      job: '看護師', bio: '夜勤明けにAIの講座を1回ずつ見ています。' },
    m15: { name: 'はるな', realName: '森本 春菜', initial: 'M', area: '北海道 帯広市', xp: 40, joinedDaysAgo: 3, color: '#b07a8f', visibility: 'pref',
      job: '保育士', bio: '園のおたよりを速く作れるようになりたい。' },
    m16: { name: '工藤 美咲', initial: 'K', area: '青森県 八戸市', xp: 60, joinedDaysAgo: 9, color: '#6f8fb0', visibility: 'pref',
      job: '会社員（事務）', bio: 'ライティングを覚えて、週末に記事を書きたい。' },
    m17: { name: '比嘉 ゆい', initial: 'H', area: '沖縄県 宜野湾市', xp: 70, joinedDaysAgo: 12, color: '#c08a4e', visibility: 'city',
      job: '育休中（元・歯科助手）', bio: '復帰する前に、在宅でできることを1つ見つけたい。' },
    m18: { name: 'たけし｜釧路の漁師町から', realName: '高田 武', initial: 'T', area: '北海道 釧路市', xp: 180, joinedDaysAgo: 45, color: '#56788f', visibility: 'city',
      job: '水産加工の会社員', bio: '仕事のあとに動画編集の練習。道東のオフ会をやりたい。' },
    m19: { name: '金城 まさと', initial: 'K', area: '沖縄県 うるま市', xp: 350, joinedDaysAgo: 95, color: '#7a8f5a', visibility: 'pref',
      job: 'ホテルのフロント', bio: '紹介の案件を中心にやっています。' },
    m20: { name: '新井 智子', initial: 'A', area: '新潟県 新潟市', xp: 330, joinedDaysAgo: 75, color: '#9a7a6a', visibility: 'pref',
      job: '主婦（元・銀行員）', bio: '在宅でライターを目指しています。' },
    m21: { name: '大西 直樹', initial: 'O', area: '石川県 金沢市', xp: 600, joinedDaysAgo: 130, color: '#5f7ea0', visibility: 'pref',
      job: '会社員（IT）', bio: 'ノーコードで小さな店の道具を作っています。' },
    m22: { name: '宮本 さや', initial: 'M', area: '熊本県 熊本市', xp: 90, joinedDaysAgo: 20, color: '#b56f6f', visibility: 'pref',
      job: 'パート（飲食）', bio: 'お小遣い案件から始めています。' },
    m23: { name: '前田 えり', initial: 'M', area: '岡山県 倉敷市', xp: 340, joinedDaysAgo: 85, color: '#8a7ab0', visibility: 'pref',
      job: '美容師', bio: '自分の店のInstagramを育てています。' },
    m24: { name: '石井 亮', initial: 'I', area: '長野県 松本市', xp: 150, joinedDaysAgo: 40, color: '#6a8a70', visibility: 'none',
      job: '会社員（製造）', bio: '夜22時から30分だけ講座を見ています。' },
    m25: { name: '平良 かな', initial: 'T', area: '沖縄県 那覇市', xp: 110, joinedDaysAgo: 30, color: '#c0766a', visibility: 'pref',
      job: '会社員（事務）', bio: 'Instagramの運用代行に興味があります。' },
    m26: { name: '村上 恵', initial: 'M', area: '北海道 札幌市', xp: 720, joinedDaysAgo: 140, color: '#7f6f9a', visibility: 'pref',
      job: 'フリーランス（デザイン）', bio: 'バナーとチラシのデザインを受けています。' },
    m27: { name: '北村 ひかり', initial: 'K', area: '北海道 北見市', xp: 20, joinedDaysAgo: 1, color: '#6f9aa0', visibility: 'pref',
      job: '病院の医療事務', bio: 'AIで職場の書類づくりを速くしたい。' }
  };
  Object.keys(PEOPLE).forEach(function (id) {
    var p = PEOPLE[id];
    p.photo = '';
    if (!p.staff) p.lv = levelOf(p.xp);
  });

  /* ---------- デモ会員（ログイン画面のボタンで入る人） ---------- */
  var MEMBER = {
    id: 'TS-000271',
    name: '高橋 さくら',
    kana: 'たかはし さくら',
    area: '北海道 旭川市',
    job: '会社員（事務）・2児の母',
    goal: '動画編集を覚えて、在宅の仕事を1件受ける',
    joinedDaysAgo: 23,
    color: '#c63f25',
    refCode: 'SAKURA271',
    email: 'sakura.takahashi@example.jp',   // デモの人のアドレスは架空のドメイン（example.jp）
    card: 'Visa •••• 4242'
  };
  var JOINED = D(-MEMBER.joinedDaysAgo, 21, 12);
  MEMBER.joinedAt = JOINED;

  /* ---------- 在籍半年の会員（試作版の切り替えで入る。タイムラインの m8 と同じ人） ---------- */
  var VETERAN = {
    id: 'TS-000069',
    person: 'm8',
    name: '木村 あや',
    kana: 'きむら あや',
    area: '沖縄県 浦添市',
    job: 'Instagram運用代行・1児の母',
    goal: 'Instagramの運用代行を3店舗まで増やす',
    joinedDaysAgo: 180,
    color: PEOPLE.m8.color,
    refCode: 'AYA069',
    email: 'aya.kimura@example.jp',
    card: 'Mastercard •••• 5454'
  };
  VETERAN.joinedAt = D(-VETERAN.joinedDaysAgo, 20, 40);

  /* ---------- 最初の30日（スタートガイド） ----------
     week: 何週目の目安 / go: 押すと飛ぶ先 / auto: 他の画面の操作で自動で済になるもの */
  var ONBOARDING = [
    { id: 'profile',  week: 1, xp: 10, title: 'プロフィールを整える', desc: '名前・地域・いまのお仕事を入れます。', go: '#/account' },
    { id: 'orient',   week: 1, xp: 20, title: 'オリエンテーションを見る', desc: '全4回、合わせて30分です。', go: '#/courses/orientation', auto: 'course:orientation' },
    { id: 'line',     week: 1, xp: 10, title: 'LINEで通知を受け取る', desc: '返信や新しい案件がLINEに届きます。', go: '#/account' },
    { id: 'intro',    week: 1, xp: 10, title: 'タイムラインで自己紹介する', desc: 'ひな形があります。', go: '#/feed?intro=1', auto: 'post:intro' },
    { id: 'goal',     week: 2, xp: 10, title: '30日後の目標を決める', desc: '1行で書いて、期限を決めます。', go: '#/start' },
    { id: 'meet',     week: 2, xp: 10, title: '運営と15分の面談を予約する', desc: '日時は相談・メッセージで決めます。', go: '#/messages?kind=面談の予約' },
    { id: 'lesson3',  week: 2, xp: 20, title: '講座を3回見終える', desc: 'どの講座でも数えます。', go: '#/courses', auto: 'lessons:3' },
    { id: 'gig',      week: 3, xp: 20, title: '最初の案件に応募する', desc: 'お小遣い案件ならスマホだけでできます。', go: '#/gigs', auto: 'gig:any' },
    { id: 'event',    week: 3, xp: 10, title: 'イベントに1回参加する', desc: 'オンラインでも会場でも数えます。', go: '#/events', auto: 'event:any' },
    { id: 'showcase', week: 4, xp: 30, title: '月末の成果発表会に出る', desc: '1人3分。見るだけの参加もできます。', go: '#/events', auto: 'event:showcase' }
  ];

  /* 自己紹介のひな形（スタートガイドの「自己紹介」から使う） */
  var INTRO_TEMPLATE = 'はじめまして、{name}です。\n住んでいるところ：{area}\nいまのお仕事：{job}\nやりたいこと：{goal}\nよろしくお願いします！';

  /* ---------- 会員名簿（管理画面・ランキングの下位・参加者の顔ぶれ・同期の一覧が読む） ----------
     番号は入会順。名前のある人（PEOPLE）とデモ会員・在籍半年の会員は、入会日に合う番号に入れる。
     同じ seed なら何度作っても同じ中身になる（日付だけは今日からの相対）。 */
  var FAM = ['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村', '小林', '加藤', '吉田', '山田', '佐々木', '山口', '松本',
    '井上', '木村', '林', '斎藤', '清水', '山崎', '森', '池田', '橋本', '阿部', '石川', '山下', '中島', '石井', '小川', '前田', '岡田',
    '長谷川', '藤田', '後藤', '近藤', '村上', '遠藤', '青木', '坂本', '福田', '太田', '西村', '藤井', '金子', '岡本', '藤原', '三浦',
    '中野', '原田', '松田', '竹内', '小野', '田村', '比嘉', '金城', '大城', '宮城', '新垣', '玉城', '島袋', '工藤', '菅原', '千葉', '菊地', '佐野'];
  var GIVEN_F = ['さくら', 'ゆい', 'あかり', '美咲', '葵', '結衣', '彩', '真由美', '恵', '由美', '智子', '裕子', '麻衣', 'かおり', 'なつみ',
    'ひとみ', '愛', '千尋', '舞', '瞳', '沙織', '理恵', '陽子', '直美', '亜希', '早紀', 'みゆき', 'はるか', 'まどか', '友美', 'のぞみ', '綾香'];
  var GIVEN_M = ['健太', '大輔', '翔', '拓也', '直樹', '亮', '誠', '和也', '陽介', '達也', '隆', '大樹', '慎也', '蓮', '颯太', '剛', '浩二', '聡', '淳', '修'];
  var AREAS = [
    ['北海道', ['札幌市', '札幌市', '旭川市', '函館市', '帯広市', '釧路市', '北見市', '苫小牧市', '小樽市', '江別市'], 22],
    ['沖縄県', ['那覇市', '那覇市', '浦添市', '沖縄市', '宜野湾市', 'うるま市', '名護市', '豊見城市'], 16],
    ['宮城県', ['仙台市', '石巻市'], 4], ['青森県', ['八戸市', '青森市'], 2], ['岩手県', ['盛岡市'], 2], ['秋田県', ['秋田市'], 1],
    ['山形県', ['山形市'], 1], ['福島県', ['郡山市', 'いわき市'], 2], ['新潟県', ['新潟市', '長岡市'], 3], ['長野県', ['松本市', '長野市'], 2],
    ['石川県', ['金沢市'], 2], ['富山県', ['富山市'], 1], ['静岡県', ['浜松市', '静岡市'], 3], ['岐阜県', ['岐阜市'], 1],
    ['岡山県', ['岡山市', '倉敷市'], 2], ['広島県', ['広島市', '福山市'], 3], ['愛媛県', ['松山市'], 1], ['香川県', ['高松市'], 1],
    ['高知県', ['高知市'], 1], ['福岡県', ['福岡市', '北九州市', '久留米市'], 5], ['熊本県', ['熊本市'], 2], ['鹿児島県', ['鹿児島市'], 2],
    ['大分県', ['大分市'], 1], ['長崎県', ['長崎市'], 1], ['宮崎県', ['宮崎市'], 1], ['東京都', ['世田谷区', '練馬区', '八王子市', '町田市'], 5],
    ['神奈川県', ['横浜市', '川崎市', '相模原市'], 4], ['埼玉県', ['さいたま市', '川口市'], 2], ['千葉県', ['千葉市', '船橋市'], 2],
    ['愛知県', ['名古屋市', '豊橋市'], 3], ['大阪府', ['大阪市', '堺市'], 3], ['兵庫県', ['神戸市', '姫路市'], 2], ['京都府', ['京都市'], 1]
  ];
  var JOBS = [['会社員（事務）', 14], ['主婦（子育て中）', 12], ['パート（販売）', 7], ['パート（事務）', 6], ['会社員（営業）', 6], ['看護師', 3],
    ['保育士', 3], ['介護職', 3], ['公務員', 2], ['会社員（製造）', 4], ['会社員（IT）', 3], ['飲食店勤務', 3], ['育休中', 4],
    ['自営業（美容室）', 2], ['フリーランス（デザイン）', 2], ['フリーランス（ライター）', 2], ['ホテル勤務', 2], ['医療事務', 2], ['農業', 1]];

  /** 決まった順に乱数を出す（mulberry32）。名簿を毎回同じにするため */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pickW(r, list, wi) {
    var sum = list.reduce(function (a, x) { return a + x[wi]; }, 0), x = r() * sum;
    for (var i = 0; i < list.length; i++) { x -= list[i][wi]; if (x < 0) return list[i]; }
    return list[list.length - 1];
  }
  function cohortOf(iso) { var d = new Date(iso); return d.getFullYear() + '年' + (d.getMonth() + 1) + '月入会'; }

  /** n 人の名簿。入会は240日前から昨日まで、あとになるほど増える（毎月の退会はおよそ4%） */
  function genRoster(n, seed) {
    var r = rng(seed || 1), list = [], i;
    var dayOf = function (k) { return 1 + Math.round(239 * Math.pow((n - k) / (n - 1), 1 / 0.85)); };
    var fixed = {};   // 番号 → 名前のある人
    fixed[MEMBER.id] = { person: 'demo', name: MEMBER.name, area: MEMBER.area, job: MEMBER.job, xp: 530, days: MEMBER.joinedDaysAgo, steps: 9 };
    fixed[VETERAN.id] = { person: 'm8', name: VETERAN.name, area: VETERAN.area, job: VETERAN.job, xp: PEOPLE.m8.xp, days: VETERAN.joinedDaysAgo, steps: 10 };
    // PEOPLE の会員は、入会日のいちばん近い空き番号に入れる
    Object.keys(PEOPLE).forEach(function (pid) {
      var p = PEOPLE[pid];
      if (p.staff || pid === 'm8') return;
      var best = 0, bd = 1e9;
      for (var k = 1; k <= n; k++) {
        var no = 'TS-' + pad(k, 6);
        if (fixed[no]) continue;
        var dd = Math.abs(dayOf(k) - p.joinedDaysAgo);
        if (dd < bd) { bd = dd; best = k; }
      }
      fixed['TS-' + pad(best, 6)] = { person: pid, name: p.name, area: p.area, job: p.job, xp: p.xp, days: p.joinedDaysAgo, steps: p.joinedDaysAgo >= 30 ? 10 : Math.min(9, 2 + Math.floor(p.joinedDaysAgo / 3)) };
    });
    var ranked = {};
    RANKING.forEach(function (x) { ranked[x.person] = x; });
    // 名前のある人（PEOPLE・デモ会員・在籍半年の会員）と同じ名前や、名簿の中の同姓同名は作らない
    // （名簿やランキングに同じ人が2人いるように見えるため）。乱数を引く回数は変えない（後ろの人の中身が変わらないように）
    var usedNames = {};
    Object.keys(PEOPLE).forEach(function (k) { usedNames[PEOPLE[k].name] = 1; });
    usedNames[MEMBER.name] = 1; usedNames[VETERAN.name] = 1;
    function uniqName(fi, gi, female) {
      var G = female ? GIVEN_F : GIVEN_M;
      for (var k = 0; k < G.length * 3; k++) {
        var nm = FAM[(fi + Math.floor(k / G.length)) % FAM.length] + ' ' + G[(gi + k * 7) % G.length];
        if (!usedNames[nm]) return nm;
      }
      return FAM[fi] + ' ' + G[gi];
    }
    /** 解約予定の人が使える最後の日：次の請求日（入会日から1か月ごと）の前日の23:59 */
    function lastDayBeforeNextBill(joinedAt) {
      var k = 1, next = addMonths(joinedAt, 1), now = CLG.now();
      while (next <= now) { k++; next = addMonths(joinedAt, k); }
      next.setDate(next.getDate() - 1); next.setHours(23, 59, 0, 0);
      return next.toISOString();
    }
    for (i = 1; i <= n; i++) {
      var no = 'TS-' + pad(i, 6), f = fixed[no];
      var dAgo = f ? f.days : dayOf(i);
      var joinedAt = D(-dAgo, 8 + Math.floor(r() * 15), Math.floor(r() * 60));
      var pr, city, name, job, xp, steps, status = 'active', leftAt = null, cancelAt = null, lastAgo;
      if (f) {
        var parts = String(f.area || '').split(' ');
        pr = parts[0]; city = parts[1] || ''; name = f.name; job = f.job; xp = f.xp; steps = f.steps;
        lastAgo = Math.floor(r() * 3);
        r(); r(); r();   // 乱数の並びを名前のない人とそろえる
      } else {
        var a = pickW(r, AREAS, 2);
        pr = a[0]; city = a[1][Math.floor(r() * a[1].length)];
        var female = r() < 0.68;
        var fi = Math.floor(r() * FAM.length), gi = Math.floor(r() * (female ? GIVEN_F : GIVEN_M).length);
        name = uniqName(fi, gi, female);
        usedNames[name] = 1;
        job = pickW(r, JOBS, 1)[0];
        var pace = 1.2 + r() * 5.5;              // 1日あたりのXP
        xp = Math.min(1900, Math.round(dAgo * pace * (0.6 + r() * 0.5) / 10) * 10);
        steps = dAgo >= 30 ? 6 + Math.floor(r() * 5) : Math.min(10, Math.floor(dAgo / 3 * (0.5 + r())));
        // 退会：在籍した月数に応じて、毎月4%ずつ
        var months = dAgo / 30.4;
        if (r() < 1 - Math.pow(0.96, months)) {
          status = 'left';
          leftAt = D(-Math.max(1, Math.floor(dAgo * r() * 0.9)), 23, 59);
          xp = Math.round(xp * 0.4 / 10) * 10;
          lastAgo = Math.max(1, dayDiff(CLG.now(), leftAt)) + Math.floor(r() * 10);
        } else {
          var s = r();
          // 解約予定は、次の請求日の前日まで（入会日から1か月ごとの更新なので、それより長くも短くもならない）。乱数は前と同じ回数だけ引く
          if (s < 0.025) { status = 'canceling'; r(); cancelAt = lastDayBeforeNextBill(joinedAt); }
          else if (s < 0.037) status = 'past_due';
          lastAgo = r() < 0.8 ? Math.floor(r() * 6) : 6 + Math.floor(r() * 30);
        }
        lastAgo = Math.min(lastAgo, dAgo);
      }
      var rk = f && ranked[f.person];
      var mp = 0, mx = 0;
      if (rk) { mp = rk.points; mx = rk.xp; }
      else if (f && f.person === 'demo') { mp = 140; mx = 530; }
      else if (status !== 'left' && lastAgo < 25) {
        // 名前のない人は、ランキングの上位（RANKING）より下に並ぶ小さな値
        if (r() < 0.93) mp = [2, 2, 2, 4, 4, 5, 5, 6, 7, 7][Math.floor(r() * 10)];
        mx = Math.min(xp, Math.round(r() * 12) * 10);
      }
      if (f && !rk && f.person !== 'demo') { mp = f.xp >= 20 ? [4, 2][i % 2] : 0; mx = Math.min(f.xp, 60); }
      list.push({
        id: no, no: no, person: f ? f.person : null, name: name, pref: pr, city: city, area: pr + (city ? ' ' + city : ''), job: job,
        joinedAt: joinedAt, joinedDaysAgo: dAgo, xp: xp, level: levelOf(xp), stepsDone: steps,
        lastActive: D(-lastAgo, 12 + Math.floor(r() * 11), Math.floor(r() * 60)), status: status, leftAt: leftAt, cancelAt: cancelAt,
        monthPoints: mp, monthXp: mx, cohort: cohortOf(joinedAt)
      });
    }
    /* 支払いエラーの人：入会日から1か月ごとの請求のうち、いちばん新しいものが2日前・4日前・5日前だった人を1人ずつ（猶予の7日の中）。
       運営画面（seed.js）と同じ選び方：名前のない・在籍33日以上の人を番号の若い順に。その請求日を失敗の日（failedAt）にする。
       乱数で決めた支払いエラーは、請求日とずれるので有効に戻す。乱数は引かない（ほかの人の中身を変えないため） */
    var nowT = CLG.now(), chosen = {};
    [2, 4, 5].forEach(function (d) {
      var m = list.filter(function (x) {
        return (x.status === 'active' || x.status === 'past_due') && !x.person && !chosen[x.no] && x.joinedDaysAgo >= 33 && dayDiff(nowT, lastBill(x.joinedAt)) === d;
      })[0];
      if (m) chosen[m.no] = 1;
    });
    list.forEach(function (m) {
      if (chosen[m.no]) {
        var g = new Date(lastBill(m.joinedAt));
        m.status = 'past_due'; m.failedAt = g.toISOString();
        g.setDate(g.getDate() + SITE.graceDays); g.setHours(23, 59, 0, 0);
        m.graceUntil = g.toISOString();
      } else if (m.status === 'past_due') m.status = 'active';
    });
    return list;
  }

  /* ---------- 貢献ポイント（ランキング用） ----------
     学びのレベルとは別。場を良くしてくれた人に付く。お金には換えない。有効期限は付与から1年。
     紹介した人数ではポイントは付かない（紹介を競わせないため）。
     「ありがとう」はコメントに付けるボタン（投稿のほうは「いいね」）。 */
  var POINT_RULES = [
    { id: 'answer',  name: '質問に答えた（運営が回答に選んだもの）', pt: 10 },
    { id: 'thanks',  name: 'コメントに「ありがとう」をもらった', pt: 2 },
    { id: 'host',    name: 'イベントを主催・手伝った', pt: 50 },
    { id: 'speak',   name: '成果発表会で発表した', pt: 30 },
    { id: 'win',     name: '成果を報告した', pt: 20 },
    { id: 'welcome', name: '新入生に声をかけた', pt: 5 }
  ];
  /* 今月のランキング（デモ会員以外の上位25人）。xp は今月たまったXP。
     下位（26位より下）は ROSTER の monthPoints から作る */
  var RANKING = [
    { person: 'm5',  points: 420, xp: 640 },
    { person: 'm3',  points: 360, xp: 590 },
    { person: 'm12', points: 240, xp: 480 },
    { person: 'm4',  points: 210, xp: 420 },
    { person: 'm7',  points: 180, xp: 350 },
    { person: 'm8',  points: 170, xp: 240 },
    { person: 'm14', points: 150, xp: 300 },
    { person: 'm11', points: 120, xp: 260 },
    { person: 'm26', points: 105, xp: 240 },
    { person: 'm1',  points: 96,  xp: 320 },
    { person: 'm6',  points: 90,  xp: 210 },
    { person: 'm21', points: 72,  xp: 200 },
    { person: 'm9',  points: 70,  xp: 150 },
    { person: 'm2',  points: 60,  xp: 180 },
    { person: 'm20', points: 48,  xp: 170 },
    { person: 'm19', points: 36,  xp: 160 },
    { person: 'm23', points: 30,  xp: 140 },
    { person: 'm10', points: 24,  xp: 120 },
    { person: 'm18', points: 20,  xp: 110 },
    { person: 'm22', points: 16,  xp: 90 },
    { person: 'm13', points: 14,  xp: 130 },
    { person: 'm24', points: 12,  xp: 80 },
    { person: 'm25', points: 10,  xp: 100 },
    { person: 'm17', points: 10,  xp: 70 },
    { person: 'm16', points: 8,   xp: 60 }
  ];
  var RANK_PRIZES = [
    '1位：代表との個別相談（60分）',
    '2〜3位：講師との個別相談（30分）',
    '10位まで：会員証に今月の順位を表示'
  ];

  var ROSTER = genRoster(312, 20260201);
  var ROSTER_INDEX = {};
  ROSTER.forEach(function (m) {
    ROSTER_INDEX[m.no] = m;
    if (m.person && PEOPLE[m.person]) PEOPLE[m.person].no = m.no;
  });
  /* 今月ポイントがある人数（ランキングの「◯人中」の母数） */
  var RANK_TOTAL = ROSTER.filter(function (m) { return m.monthPoints > 0; }).length;

  /* ---------- イベント ----------
     kind: online / offline / showcase(成果発表会)
     決まりごと（決定事項）：成果発表会は毎月最終金曜20:00、オリエンテーションは毎週水曜20:00、オフ会は土日。
     ほかに、AI勉強会は隔週火曜20:30、もくもく作業会は毎週金曜21:00、税金Q&Aは毎月第3木曜20:00。 */
  var AI_EPOCH = new Date(2026, 0, 6).getTime();   // AI勉強会がある火曜の起点（ここから2週ごと）
  function aiWeek(x) { var d = new Date(x); d.setHours(0, 0, 0, 0); return Math.round((d.getTime() - AI_EPOCH) / WEEK) % 2 === 0; }

  /* 成果発表会：今月の最終金曜。終わっていたら来月の */
  function showcaseAt(k) { return lastDow(k, 5, 20); }
  var E4_K = 0, E4_AT = showcaseAt(0);
  if (new Date(E4_AT).getTime() + 120 * MIN < CLG.now().getTime()) { E4_K = 1; E4_AT = showcaseAt(1); }
  var E4_PREV = showcaseAt(E4_K - 1);
  /* 税金Q&A：第3木曜 */
  var TAX_K = 0, TAX_AT = nthDow(0, 3, 4, 20);
  if (new Date(TAX_AT).getTime() + 60 * MIN < CLG.now().getTime()) { TAX_K = 1; TAX_AT = nthDow(1, 3, 4, 20); }
  var TAX_PREV = nthDow(TAX_K - 1, 3, 4, 20);
  var ORI_AT = nextDow(3, 20);
  var AI_AT = nextDow(2, 20.5); if (!aiWeek(AI_AT)) AI_AT = days(AI_AT, 7);
  var MOKU_AT = nextDow(5, 21, 1);            // 今日より後の金曜（今日の21:00には別の会がある）
  var SAP_AT = nextDow(6, 11, 2);             // 札幌オフ会：土曜の昼
  var NAHA_AT = nextDow(6, 18, 9);            // 那覇オフ会：土曜の夜
  var TOKYO_AT = nextDow(0, 18, 16);          // 東京オフ会：日曜の夜
  var IGC_AT = nextDow(1, 20, 3);             // Instagram添削会：月曜の夜
  var TODAY_AT = D(0, 21);
  var SHOWCASE_TODAY = dayDiff(E4_AT) === 0;  // 成果発表会の日は、今日の質問会を置かない

  function mapUrl(addr) { return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(addr); }
  var VENUE = {
    sapporo: { name: '円山のカフェ（2階の個室を貸切）', address: '札幌市中央区南1条西27丁目', contact: '当日の連絡は「相談・メッセージ」へ（運営が主催の山本さんにつなぎます）',
      bring: '会員証（スマホで表示）。ランチ代は各自（1,500円前後）' },
    naha: { name: '久茂地の居酒屋（座敷・20名まで）', address: '那覇市久茂地3丁目', contact: '当日の連絡は「相談・メッセージ」へ（運営が主催の伊藤さんにつなぎます）',
      bring: '会員証（スマホで表示）。飲食代は各自（3,500円前後）' },
    tokyo: { name: '神田のレンタルスペース（7階）', address: '東京都千代田区神田須田町1丁目', contact: '当日の連絡は「相談・メッセージ」へ',
      bring: '会員証（スマホで表示）。飲み物と軽食は会費に含みます（実費1,500円）' },
    scSapporo: { name: '札幌会場：大通のレンタルスペース（4階）', address: '札幌市中央区大通西5丁目', contact: '当日の連絡は「相談・メッセージ」へ',
      bring: '会員証（スマホで表示）。発表する人は、画面に出す資料をスマホかパソコンで' },
    scNaha: { name: '那覇会場：県庁前のコワーキング（会議室B）', address: '那覇市久茂地1丁目', contact: '当日の連絡は「相談・メッセージ」へ',
      bring: '会員証（スマホで表示）。発表する人は、画面に出す資料をスマホかパソコンで' }
  };
  Object.keys(VENUE).forEach(function (k) { VENUE[k].mapUrl = mapUrl(VENUE[k].address); });

  var EVENTS = [
    { id: 'e1', series: 'orientation', img: 'assets/img/course-orientation.webp', alt: '夜、自宅でノートパソコンの動画を見る女性', kind: 'online', title: '新入生オリエンテーション', at: ORI_AT, min: 60, place: 'オンライン（Zoom）', cap: 50, count: 18, fee: '無料', host: 'staff2', recording: true, audience: 'new30',
      desc: '入会して30日以内の方向けです。会員ページの使い方と、最初の30日でやることを説明します。',
      agenda: [['20:00', '会員ページをひと通り（画面共有）'], ['20:25', 'スタートガイドの進め方'], ['20:40', '質問']] },
    { id: 'e2', series: 'ai', img: 'assets/img/photo-hero.webp', alt: '夜、自宅でヘッドホンをしてパソコンに向かう女性', kind: 'online', title: 'AI勉強会（ライブ）：AIで見積書と提案書', at: AI_AT, min: 75, place: 'オンライン（Zoom）', cap: 100, count: 46, fee: '無料', host: 'staff3', recording: true,
      desc: '実際の案件の見積書と提案書を、AIといっしょに作るところを見せます。',
      agenda: [['20:30', '今日の題材（飲食店の運用代行の見積もり）'], ['20:40', 'AIで下書き→自分で直す'], ['21:20', '質問']] },
    { id: 'e3', series: 'offkai', img: 'assets/img/event-sapporo.webp', alt: '雪の見えるレストランで昼ごはんを食べる大人と子どもたち', kind: 'offline', title: '札幌オフ会（子連れOK）', at: SAP_AT, min: 150, place: '札幌市中央区（会場は予約後にお知らせ）', cap: 15, count: 11, fee: '実費（ランチ代）', host: 'm2',
      desc: 'ランチを食べながら近況を話す会です。はじめての方もどうぞ。', venue: VENUE.sapporo,
      agenda: [['11:00', '乾杯・自己紹介（1人1分）'], ['11:30', 'ランチ・自由に話す'], ['13:15', '次の予定を決める']] },
    { id: 'e4', series: 'showcase', img: 'assets/img/event-showcase.webp', alt: 'テレビの前で話す女性と、座って聞く人たち', kind: 'showcase', title: '月末の成果発表会', at: E4_AT, min: 120, place: 'オンライン＋札幌・那覇の会場', cap: 120, count: 64, fee: '無料（会場参加は実費）', host: 'staff1', recording: true,
      desc: '1人3分で、この1か月でやったことを話します。見るだけの参加もできます。', venues: [VENUE.scSapporo, VENUE.scNaha],
      agenda: [['20:00', 'はじめに（運営）'], ['20:05', '発表（1人3分）'], ['20:50', '休憩'], ['21:00', '発表の続き'], ['21:40', '来月やることを1行ずつチャットに'], ['21:55', 'おわりに']],
      speakers: [
        { person: 'm12', title: 'Instagramの運用代行、2店舗目を受けるまで' },
        { person: 'm9',  title: 'ショート動画の編集、添削3本目で直したこと' },
        { person: 'm21', title: 'ノーコードの予約フォームを知り合いの整体院で使ってもらった話' },
        { person: 'm1',  title: '子どもが寝たあとの30分で、動画編集を第4回まで' },
        { person: 'm14', title: '夜勤明けにAIの講座を1回ずつ見て、職場の資料づくりが変わった' },
        { person: 'm3',  title: '那覇オフ会の参加者が20名を超えるまでにやったこと' }
      ] },
    { id: 'e5', series: 'moku', img: 'assets/img/photo-online.webp', alt: '夜、自宅でパソコンを見ながらメモを取る男性', kind: 'online', title: 'もくもく作業会（夜）', at: MOKU_AT, min: 90, place: 'オンライン（Zoom・カメラ任意）', cap: 40, count: 12, fee: '無料', host: 'm5',
      desc: 'Zoomをつないで各自の作業をする会です。最初と最後に少しだけ話します。',
      agenda: [['21:00', '今日やることをチャットに書く'], ['21:05', '作業（マイクは切る）'], ['22:20', 'できたことを1行ずつ']] },
    { id: 'e6', series: 'offkai', img: 'assets/img/event-naha.webp', alt: '海の見えるテラスで夕食を囲む人たち', kind: 'offline', title: '那覇オフ会', at: NAHA_AT, min: 120, place: '那覇市（会場は予約後にお知らせ）', cap: 20, count: 9, fee: '実費（飲食代）', host: 'm3',
      desc: '沖縄に住んでいる会員のオフ会です。子連れの方もいます。', venue: VENUE.naha,
      agenda: [['18:00', '乾杯・自己紹介'], ['18:30', '食事・自由に話す'], ['19:45', '次の予定を決める']] },
    { id: 'e7', series: 'tax', img: 'assets/img/event-tax.webp', alt: '夜、ノートパソコンでビデオ通話をしながらメモを取る女性', kind: 'online', title: '税金Q&A（提携税理士と）', at: TAX_AT, min: 60, place: 'オンライン（Zoom）', cap: 100, count: 22, fee: '無料', host: 'guest1', recording: true,
      desc: '副業1年目の方向けです。事前に集めた質問に、提携の税理士が順に答えます。',
      agenda: [['20:00', '年末までにやっておくこと'], ['20:20', '事前の質問に答える'], ['20:45', 'その場の質問']] },
    { id: 'e8', series: 'offkai', img: 'assets/img/event-tokyo.webp', alt: '飲み物を手に立ち話をする人たち', kind: 'offline', title: '東京オフ会', at: TOKYO_AT, min: 120, place: '東京都千代田区（会場は予約後にお知らせ）', cap: 30, count: 14, fee: '実費（1,500円）', host: 'staff1',
      desc: '運営も参加します。関東の会員どうしで話す会です。', venue: VENUE.tokyo,
      agenda: [['18:00', '乾杯・自己紹介'], ['18:30', '自由に話す'], ['19:50', '締め']] },
    { id: 'e9', series: 'orientation', img: 'assets/img/course-orientation.webp', alt: '夜、自宅でノートパソコンの動画を見る女性', kind: 'online', title: '新入生オリエンテーション', at: days(ORI_AT, 7), min: 60, place: 'オンライン（Zoom）', cap: 50, count: 9, fee: '無料', host: 'staff2', recording: true, audience: 'new30',
      desc: '入会して30日以内の方向けです。会員ページの使い方と、最初の30日でやることを説明します。',
      agenda: [['20:00', '会員ページをひと通り（画面共有）'], ['20:25', 'スタートガイドの進め方'], ['20:40', '質問']] },
    { id: 'e10', series: 'orientation', img: 'assets/img/course-orientation.webp', alt: '夜、自宅でノートパソコンの動画を見る女性', kind: 'online', title: '新入生オリエンテーション', at: days(ORI_AT, 14), min: 60, place: 'オンライン（Zoom）', cap: 50, count: 4, fee: '無料', host: 'staff2', recording: true, audience: 'new30',
      desc: '入会して30日以内の方向けです。会員ページの使い方と、最初の30日でやることを説明します。',
      agenda: [['20:00', '会員ページをひと通り（画面共有）'], ['20:25', 'スタートガイドの進め方'], ['20:40', '質問']] },
    { id: 'e11', series: 'orientation', img: 'assets/img/course-orientation.webp', alt: '夜、自宅でノートパソコンの動画を見る女性', kind: 'online', title: '新入生オリエンテーション', at: days(ORI_AT, 21), min: 60, place: 'オンライン（Zoom）', cap: 50, count: 2, fee: '無料', host: 'staff2', recording: true, audience: 'new30',
      desc: '入会して30日以内の方向けです。会員ページの使い方と、最初の30日でやることを説明します。',
      agenda: [['20:00', '会員ページをひと通り（画面共有）'], ['20:25', 'スタートガイドの進め方'], ['20:40', '質問']] },
    { id: 'e12', series: 'ai', img: 'assets/img/photo-hero.webp', alt: '夜、自宅でヘッドホンをしてパソコンに向かう女性', kind: 'online', title: 'AI勉強会（ライブ）：議事録と要約をAIに任せる', at: days(AI_AT, 14), min: 75, place: 'オンライン（Zoom）', cap: 100, count: 21, fee: '無料', host: 'staff3', recording: true,
      desc: '会議の録音から、議事録と要約を作るまでを通しでやります。',
      agenda: [['20:30', '録音の準備と文字起こし'], ['20:50', '要約の指示の書き方'], ['21:20', '質問']] },
    { id: 'e13', series: 'moku', img: 'assets/img/photo-online.webp', alt: '夜、自宅でパソコンを見ながらメモを取る男性', kind: 'online', title: 'もくもく作業会（夜）', at: days(MOKU_AT, 7), min: 90, place: 'オンライン（Zoom・カメラ任意）', cap: 40, count: 7, fee: '無料', host: 'm5',
      desc: 'Zoomをつないで各自の作業をする会です。最初と最後に少しだけ話します。',
      agenda: [['21:00', '今日やることをチャットに書く'], ['21:05', '作業（マイクは切る）'], ['22:20', 'できたことを1行ずつ']] },
    { id: 'e14', series: 'moku', img: 'assets/img/photo-online.webp', alt: '夜、自宅でパソコンを見ながらメモを取る男性', kind: 'online', title: 'もくもく作業会（夜）', at: days(MOKU_AT, 14), min: 90, place: 'オンライン（Zoom・カメラ任意）', cap: 40, count: 3, fee: '無料', host: 'm5',
      desc: 'Zoomをつないで各自の作業をする会です。最初と最後に少しだけ話します。',
      agenda: [['21:00', '今日やることをチャットに書く'], ['21:05', '作業（マイクは切る）'], ['22:20', 'できたことを1行ずつ']] },
    { id: 'e15', img: 'assets/img/course-instagram.webp', alt: 'パン屋でパンをスマートフォンで撮る女性', kind: 'online', title: 'Instagram添削会（8名）', at: IGC_AT, min: 90, place: 'オンライン（Zoom・画面共有）', cap: 8, count: 8, waiting: 1, fee: '無料', host: 'staff4', recording: false,
      desc: '自分のアカウントのプロフィールと投稿3つを、講師がその場で直します。少人数なので録画はありません。',
      agenda: [['20:00', '1人10分ずつ添削'], ['21:20', 'まとめ']] }
  ];
  if (!SHOWCASE_TODAY) {
    EVENTS.push({ id: 'e16', img: 'assets/img/photo-online.webp', alt: '夜、自宅でパソコンを見ながらメモを取る男性', kind: 'online', title: '夜の質問会（30分）', at: TODAY_AT, min: 30, place: 'オンライン（Zoom・カメラ任意）', cap: 30, count: 7, fee: '無料', host: 'staff2', recording: false,
      desc: '会員ページの使い方や講座の分からないところを、運営にその場で聞ける会です。',
      agenda: [['21:00', '事前に届いた質問'], ['21:15', 'その場の質問']] });
  }
  /* 参加者（会員番号）。オフ会は近くに住んでいる人から選ぶ。名前のある人を先に入れる */
  (function () {
    var active = ROSTER.filter(function (m) { return m.status !== 'left' && m.person !== 'demo'; });
    var near = { e3: /北海道/, e6: /沖縄県/, e8: /東京都|神奈川県|埼玉県|千葉県/ };
    var named = { e3: ['m2', 'm26', 'm10'], e4: ['m12', 'm9', 'm21', 'm1', 'm14', 'm3', 'm5', 'm8'], e6: ['m3', 'm14', 'm17', 'm25', 'm19'],
      e8: ['m5', 'm12'], e2: ['m14', 'm21', 'm27', 'm5'], e1: ['m15', 'm27', 'm16'], e5: ['m5', 'm7', 'm24'], e15: ['m23', 'm25', 'm6', 'm8'], e7: ['m10', 'm20'] };
    EVENTS.forEach(function (e, ei) {
      var r = rng(1000 + ei * 97), out = [], seen = {};
      (named[e.id] || []).forEach(function (pid) { var p = PEOPLE[pid]; if (p && p.no && !seen[p.no] && out.length < e.count) { out.push(p.no); seen[p.no] = 1; } });
      var pool = active.filter(function (m) {
        if (near[e.id] && !near[e.id].test(m.pref)) return false;
        if (e.audience === 'new30' && m.joinedDaysAgo > 30) return false;
        return true;
      });
      if (pool.length < e.count) pool = active;
      var guard = 0;
      while (out.length < e.count && guard++ < 5000) {
        var m = pool[Math.floor(r() * pool.length)];
        if (!seen[m.no]) { out.push(m.no); seen[m.no] = 1; }
      }
      e.attendees = out;
      if (e.kind !== 'offline') e.zoomUrl = SITE.zoomPlaceholder;
    });
  })();

  /* イベントの種類ごとの写真（Higgsfield で生成したイメージ写真。元画像は docs/生成画像/） */
  var EVENT_IMG = { online: 'assets/img/photo-online.webp', offline: 'assets/img/photo-meetup.webp', showcase: 'assets/img/photo-showcase.webp' };

  /* デモ会員がすでに参加したイベント（XPの記録に使う）。
     pe1：入会後はじめての水曜のオリエンテーション／pe2：その週の土曜の勉強会（録画 ar-5） */
  var PE1_AT = dowAfter(JOINED, 3, 20);
  var PE2_AT = dowAfter(PE1_AT, 6, 10);
  var PAST_EVENTS = [
    { id: 'pe1', title: '新入生オリエンテーション', at: PE1_AT, kind: 'online', min: 60 },
    { id: 'pe2', title: 'SNS初心者勉強会：最初の10投稿', at: PE2_AT, kind: 'online', min: 58, archive: 'ar-5' }
  ];

  /* ---------- 勉強会の録画（レベルに関係なく全員が見られる） ----------
     学部ごとに並べる。成果発表会は別の群。日付は曜日の決まった会に合わせる */
  var FAC_NAME = { showcase: '成果発表会' };
  FACULTIES.forEach(function (f) { FAC_NAME[f.id] = f.name; });
  var aiPast = [];
  (function () { for (var k = 0; aiPast.length < 5 && k < 20; k++) { var t = prevDow(2, 20.5, k); if (aiWeek(t)) aiPast.push(t); } })();
  var scPast = [];
  (function () { for (var k = 0; scPast.length < 2 && k > -4; k--) { var t = showcaseAt(k); if (new Date(t).getTime() + 36 * 3600000 < CLG.now().getTime()) scPast.push(t); } })();
  var taxPast = [];
  (function () { for (var k = 0; taxPast.length < 2 && k > -4; k--) { var t = nthDow(k, 3, 4, 20); if (new Date(t).getTime() + 36 * 3600000 < CLG.now().getTime()) taxPast.push(t); } })();

  function AR(id, faculty, title, date, min, teacher, desc, chapters, files) {
    var pub = new Date(date); pub.setDate(pub.getDate() + 1); pub.setHours(12, 0, 0, 0);
    return { id: id, faculty: faculty, genre: FAC_NAME[faculty], title: title, date: date, newAt: capNow(pub.toISOString(), 30), min: min, teacher: teacher,
      desc: desc, chapters: chapters, files: files || [] };
  }
  var ARCHIVE = [
    AR('ar-1', 'skill', 'AI勉強会：ChatGPTで作業時間を半分にした実例', aiPast[0], 72, 'staff3',
      '運用代行の月次レポートと、提案書の下書きをAIで作るところを通しで見せました。',
      [['0:00', 'はじめに'], ['6:10', '月次レポートの下書き'], ['28:40', '提案書の骨組み'], ['51:00', '質問']],
      [{ name: 'スライド（PDF・18ページ）', type: 'pdf' }, { name: '指示文の例（テキスト）', type: 'txt' }]),
    AR('ar-2', 'skill', 'ノーコードでホームページを作る会', prevDow(4, 20, 1), 95, 'staff4',
      '1ページのお店のホームページを、ノーコードの道具で作って公開するまで。',
      [['0:00', 'はじめに'], ['12:00', 'ひな形を選ぶ'], ['40:30', '写真と文章を入れる'], ['78:00', '公開と独自ドメイン']],
      [{ name: '手順書（PDF・6ページ）', type: 'pdf' }]),
    AR('ar-3', 'sales', '紹介・営業代行の勉強会（はじめての人向け）', prevDow(1, 21, 1), 64, 'staff5',
      '紹介の案件で、声をかける前に決めておくことと、言ってはいけないこと。',
      [['0:00', 'はじめに'], ['8:20', '紹介の流れ'], ['30:00', '言ってはいけないこと'], ['48:30', '質問']],
      [{ name: '紹介のチェック表（PDF）', type: 'pdf' }]),
    AR('ar-4', 'basic', '副業の確定申告Q&A', taxPast[0], 88, 'guest1',
      '事前に集めた32問に、提携の税理士が答えました。家事按分と、20万円のラインの話が多め。',
      [['0:00', 'はじめに'], ['5:00', '申告がいる人・いらない人'], ['30:00', '家事按分'], ['55:00', '帳簿のつけ方'], ['70:00', 'その場の質問']],
      [{ name: '質問と答えの一覧（PDF）', type: 'pdf' }]),
    AR('ar-5', 'sns', 'SNS初心者勉強会：最初の10投稿', PE2_AT, 58, 'staff4',
      '最初の10投稿で何を出すかを、参加者のアカウントを見ながら決めました。',
      [['0:00', 'はじめに'], ['7:30', '10投稿の中身の決め方'], ['35:00', '参加者のアカウントを見る'], ['50:00', '質問']],
      [{ name: '10投稿の計画表（スプレッドシート）', type: 'sheet' }]),
    AR('ar-6', 'showcase', mon(scPast[0]) + '月の成果発表会', scPast[0], 110, 'staff1',
      '14人が1人3分で発表しました。会場は札幌と那覇。',
      [['0:00', 'はじめに'], ['5:00', '発表（前半）'], ['52:00', '休憩'], ['60:00', '発表（後半）'], ['100:00', 'おわりに']],
      []),
    AR('ar-7', 'skill', '動画編集の勉強会：テロップだけで30分', prevDow(4, 20, 4), 61, 'staff3',
      'テロップの大きさ・位置・出し方だけを、30分かけて直していきました。',
      [['0:00', 'はじめに'], ['4:00', '読みやすいテロップ'], ['25:00', '参加者の動画を直す'], ['52:00', '質問']],
      [{ name: 'テロップの見本（PDF）', type: 'pdf' }]),
    AR('ar-8', 'basic', '家計と副業：固定費の見直し会', prevDow(1, 20.5, 5), 54, 'staff2',
      'スマホ代・保険・サブスクの見直しを、参加者の家計簿を例にやりました。',
      [['0:00', 'はじめに'], ['10:00', 'スマホ代'], ['25:00', '保険'], ['40:00', 'サブスク']],
      [{ name: '固定費チェック表（PDF）', type: 'pdf' }]),
    AR('ar-9', 'skill', 'AI勉強会：画像生成AIでバナーを作る', aiPast[1], 70, 'staff3',
      'セールのバナーを、画像生成AIで下絵を作ってから仕上げるまで。',
      [['0:00', 'はじめに'], ['9:00', '下絵の指示'], ['32:00', '文字を入れて仕上げる'], ['58:00', '質問']],
      [{ name: '指示文の例（テキスト）', type: 'txt' }]),
    AR('ar-10', 'sns', 'Instagramのリール、最初の3本の作り方', prevDow(4, 20, 6), 66, 'staff4',
      '撮影から編集、投稿の時間帯まで。参加者のリールを3本直しました。',
      [['0:00', 'はじめに'], ['8:00', '撮る前に決めること'], ['30:00', '参加者のリールを直す'], ['55:00', '質問']],
      [{ name: 'リールの台本（PDF）', type: 'pdf' }]),
    AR('ar-11', 'showcase', mon(scPast[1]) + '月の成果発表会', scPast[1], 105, 'staff1',
      '12人が発表しました。はじめての会場参加（札幌）。',
      [['0:00', 'はじめに'], ['5:00', '発表（前半）'], ['50:00', '休憩'], ['58:00', '発表（後半）']],
      []),
    AR('ar-12', 'sales', 'フリーランスの面談練習会', prevDow(1, 21, 7), 75, 'staff5',
      '2人1組で面談の練習をして、講師が1組ずつ直しました。',
      [['0:00', 'はじめに'], ['10:00', 'よく聞かれる質問'], ['25:00', '練習と振り返り']],
      [{ name: '面談の質問リスト（PDF）', type: 'pdf' }]),
    AR('ar-13', 'skill', 'AI勉強会：表計算をAIに手伝ってもらう', aiPast[2], 68, 'staff3',
      '売上の表から、月ごとの集計とグラフを作るまで。',
      [['0:00', 'はじめに'], ['7:00', '関数をAIに聞く'], ['35:00', '集計とグラフ'], ['60:00', '質問']],
      [{ name: '練習用の表（スプレッドシート）', type: 'sheet' }]),
    AR('ar-14', 'biz', 'LINE公式アカウントの始め方', prevDow(4, 20, 8), 62, 'staff1',
      'お店のLINE公式アカウントを作って、あいさつの文と最初の配信を用意するまで。',
      [['0:00', 'はじめに'], ['8:00', 'アカウントを作る'], ['24:00', 'あいさつの文'], ['45:00', '配信の頻度']],
      [{ name: '設定の手順書（PDF）', type: 'pdf' }]),
    AR('ar-15', 'basic', '税金Q&A：開業届と青色申告', taxPast[1], 80, 'guest1',
      '開業届を出す時期と、青色申告の承認申請について。',
      [['0:00', 'はじめに'], ['6:00', '開業届はいつ出すか'], ['30:00', '青色申告'], ['60:00', '質問']],
      [{ name: '提出する書類の一覧（PDF）', type: 'pdf' }]),
    AR('ar-16', 'skill', 'ライティング添削会：見出しと要約', prevDow(1, 21, 9), 57, 'guest2',
      '参加者の記事の見出しと要約を、その場で書き直しました。',
      [['0:00', 'はじめに'], ['5:00', '見出しの型'], ['20:00', '参加者の記事を直す']],
      [{ name: '見出しの型（PDF）', type: 'pdf' }]),
    AR('ar-17', 'skill', 'AI勉強会：議事録と要約（前回）', aiPast[3], 64, 'staff3',
      '会議の録音から議事録を作る流れ。次回のライブでは続きをやります。',
      [['0:00', 'はじめに'], ['8:00', '文字起こし'], ['30:00', '要約の指示'], ['50:00', '質問']],
      []),
    AR('ar-18', 'biz', '起業の手続きQ&A（司法書士と）', prevDow(4, 20, 10), 55, 'guest3',
      '個人事業から会社にするときの手続きと、かかる費用の内訳。',
      [['0:00', 'はじめに'], ['6:00', '会社を作る流れ'], ['30:00', '費用の内訳'], ['45:00', '質問']],
      [{ name: '設立の流れ（PDF）', type: 'pdf' }]),
    AR('ar-19', 'sales', '営業の電話ロールプレイ', prevDow(1, 21, 11), 70, 'staff5',
      'アポ取りの電話を、台本どおりに練習しました。',
      [['0:00', 'はじめに'], ['5:00', '台本の読み合わせ'], ['20:00', 'ロールプレイ']],
      [{ name: '電話の台本（PDF）', type: 'pdf' }]),
    AR('ar-20', 'basic', '子育てと副業の時間割（座談会）', prevDow(0, 10, 11), 48, 'staff2',
      '子育て中の会員4人に、1週間の時間割を見せてもらいました。',
      [['0:00', 'はじめに'], ['5:00', '4人の時間割'], ['35:00', '質問']],
      [])
  ];
  /* 同じ日に2本重ならないように、ずらす。曜日の決まった会（AI勉強会・税金Q&A・成果発表会・pe2 の勉強会）は動かさない */
  (function () {
    var taken = {}, FIXED = { 'ar-1': 1, 'ar-4': 1, 'ar-5': 1, 'ar-6': 1, 'ar-9': 1, 'ar-11': 1, 'ar-13': 1, 'ar-15': 1, 'ar-17': 1 };
    ARCHIVE.forEach(function (a) { if (FIXED[a.id]) taken[ymd(a.date)] = 1; });
    ARCHIVE.forEach(function (a) {
      if (FIXED[a.id]) return;
      var k = ymd(a.date);
      // 水曜の夜はオリエンテーションがあるので避ける
      while (taken[k] || new Date(a.date).getDay() === 3) { a.date = days(a.date, -1); k = ymd(a.date); }
      taken[k] = 1;
      var pub = new Date(a.date); pub.setDate(pub.getDate() + 1); pub.setHours(12, 0, 0, 0);
      a.newAt = capNow(pub.toISOString(), 30);
    });
  })();

  /* 録画に近い講座（録画のページの「この講座で続きを学ぶ」と、講座の質問の書き出しに使う） */
  var ARC_COURSE = {
    'ar-1': 'ai', 'ar-2': 'design', 'ar-3': 'affiliate', 'ar-4': 'money-tax', 'ar-5': 'sns-basic', 'ar-7': 'video', 'ar-8': 'business-basic',
    'ar-9': 'ai', 'ar-10': 'instagram', 'ar-12': 'freelance', 'ar-13': 'ai', 'ar-14': 'marketing', 'ar-15': 'money-tax', 'ar-16': 'writing',
    'ar-17': 'ai', 'ar-18': 'startup', 'ar-19': 'sales-basic', 'ar-20': 'business-basic'
  };
  ARCHIVE.forEach(function (a) { if (ARC_COURSE[a.id] && byId(COURSES, ARC_COURSE[a.id])) a.course = ARC_COURSE[a.id]; });

  /* ---------- タイムライン ----------
     kind: news(運営から) / new(新着講座・録画) / gig(新着案件) / event / win(会員の成果。金額は書かない)
           / post(会員の投稿) / question(会員の質問) / intro(自己紹介)
     時刻は人の暮らしに合わせる（運営 9:30〜18:00、子育て中の人 21:00〜23:30、会社員 7:30・12:15・22:00）。
     返信は投稿より後・いまより前に収める。 */
  function rp(by, after, text, x) { var o = { by: by, after: after, text: text }; if (x) for (var k in x) o[k] = x[k]; return o; }
  function P(o) {
    var at = new Date(o.at).getTime(), nowT = CLG.now().getTime();
    var reps = o.replies || [], prev = at, out = [];
    for (var i = 0; i < reps.length; i++) {
      var r = reps[i];
      var t = r.after === 'staff' ? new Date(staffAfter(new Date(prev).toISOString(), 40)).getTime()
        : r.at ? new Date(r.at).getTime() : prev + (r.after || 30) * MIN;
      // 投稿してまもないときは、まだ返信が付いていない（いまより後の返信は作らない）
      if (t > nowT - MIN) {
        var cap = nowT - (reps.length - i) * 2 * MIN;
        if (cap - prev < 10 * MIN) break;
        t = cap;
      }
      if (t <= prev) t = prev + MIN;
      prev = t;
      r.at = new Date(t).toISOString();
      delete r.after;
      r.id = r.id || o.id + '-r' + (i + 1);
      r.thanks = r.thanks || 0;
      r.answer = !!r.answer;
      out.push(r);
    }
    o.replies = out;
    o.comments = reps.length;
    o.likes = o.likes || 0;
    return o;
  }
  /* 「◯月の予定」：20日を過ぎたら来月の分（月末に出した）、それまでは今月の分（月のはじめの平日に出した） */
  var P1_K = CLG.now().getDate() > 20 ? 1 : 0;
  var NM = mon(new Date(CLG.now().getFullYear(), CLG.now().getMonth() + P1_K, 1));
  var P1_AT = (function () {
    if (P1_K) return T(0, 9, 40);
    var d = new Date(CLG.now().getFullYear(), CLG.now().getMonth(), 1, 9, 40);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    // まだその時刻が来ていなければ、前の月の最後の平日に出したことにする
    if (d > CLG.now()) { d = new Date(CLG.now().getFullYear(), CLG.now().getMonth(), 0, 9, 40); return weekdayBack(d); }
    return d.toISOString();
  })();
  var THIS_M = mon(CLG.now());
  var AR1 = byId(ARCHIVE, 'ar-1');
  /* 「次の◯◯は」と書く投稿は、ひとつ前の回が終わったあとに出したことにする（その間に別の回があると日付が食い違うため） */
  function after(prevAt, minAt) { return capNow(new Date(prevAt) > new Date(minAt) ? prevAt : minAt, 5); }
  var P7_AT = after(atH(days(ORI_AT, -6), 10).toISOString(), D(-6, 10, 0));
  var P37_AT = after(atH(days(AI_AT, -13), 16).toISOString(), D(-13, 16, 0));
  var P19_AT = after(atH(days(TAX_PREV, 1), 16).toISOString(), D(-6, 16, 0));
  var P22_AT = after(atH(days(E4_PREV, 3), 15).toISOString(), D(-8, 15, 0));

  var FEED = [
    P({ id: 'p1', kind: 'news', by: 'staff2', at: P1_AT, pinned: true, likes: 31,
      text: '【' + NM + '月の予定】\n新入生オリエンテーション：毎週水曜20:00\nAI勉強会：隔週火曜20:30\nもくもく作業会：毎週金曜21:00\n税金Q&A：' +
        mdw(nthDow(P1_K, 3, 4, 20)) + ' 20:00\n成果発表会：' + mdw(showcaseAt(P1_K)) + ' 20:00（オンラインと札幌・那覇の会場。会場は各15名まで）\n予約はイベントのページからできます。',
      replies: [rp('m3', 50, '那覇の会場、今回も受付やります。'), rp('m2', 80, '札幌の会場も手伝えます。')] }),
    P({ id: 'p3', kind: 'new', by: 'staff3', at: AI5_AT, link: '#/courses/ai', likes: 24,
      text: '「AI活用」に第5回「AIで副業の作業を減らす実例」（16分）を追加しました。実際の案件で、どの作業をAIに任せて、どこを自分で直したかを画面で見せています。' }),
    P({ id: 'q1', kind: 'question', by: 'm13', at: T(0, 12, 15), likes: 3,
      text: '請求書って、みなさん何で作っていますか？ はじめての案件の前に用意しておきたくて。',
      replies: [rp('m11', 25, 'クラウド会計の無料プランで作っています。インボイスの登録番号を入れる欄もあります。', { thanks: 1 }),
        rp('staff2', 'staff', 'お小遣い案件と、運営が出している案件は請求書がいりません（運営から支払いの明細を出します）。会員どうしの案件は、相手と決めてください。', { answer: true, thanks: 2 })] }),

    P({ id: 'p2', kind: 'win', by: 'm1', at: D(-1, 22, 40), likes: 18,
      text: '動画編集の講座、第4回まで終わりました。\n子どもが寝たあとに30分ずつ。テロップと効果音が入るだけで、急にそれっぽくなって楽しいです。',
      replies: [rp('m12', 30, '分かります、効果音で一気に変わりますよね。'), rp('m9', 70, '第5回のポートフォリオの回を先に見ておくと、納品のイメージがつきます。', { thanks: 1 })] }),
    P({ id: 'p4', kind: 'gig', by: 'staff4', at: D(-1, 15, 20), link: '#/gigs/g4', likes: 12,
      text: '新着案件：飲食店のInstagram投稿代行（月8投稿・在宅・2名）。写真はお店から届きます。講座「Instagram運用」を修了した方が応募できます。' }),

    P({ id: 'p5', kind: 'post', by: 'm3', at: D(-2, 21, 10), likes: 9, img: 'assets/img/event-naha.webp', alt: '海の見えるテラスで夕食を囲む人たち',
      text: '那覇オフ会、次は' + mdw(NAHA_AT) + ' 18:00からです。初参加の方が3名います。子連れOKのお店です。写真は前回の様子。',
      replies: [rp('m17', 40, '初参加です。2歳の子どもを連れて行きます。'), rp('m14', 90, '受付手伝います。')] }),
    P({ id: 'p6', kind: 'win', by: 'm4', at: D(-2, 7, 30), likes: 27,
      text: 'はじめての業務委託（営業のアポ取り）、今日で1か月続きました。営業の学部の「最初の5分でやること」を毎朝の電車で見返しています。',
      replies: [rp('staff5', 'staff', '1か月続いたのがいちばんです。台本で直したところ、次の研修で共有させてください。'), rp('m13', 780, '営業の学部、早く開けたいです。')] }),
    P({ id: 'p7', kind: 'event', by: 'staff2', at: P7_AT, link: '#/events/e1', likes: 8,
      text: '次の新入生オリエンテーションは' + mdw(ORI_AT) + ' 20:00から。会員ページの使い方と、最初の30日でやることを説明します（録画あり）。' + THIS_M + '月に入会した方は予約しておいてください。' }),
    P({ id: 'p11', kind: 'gig', by: 'staff1', at: D(-2, 10, 30), link: '#/gigs/g12', likes: 7,
      text: '新着案件：LINE公式アカウントの初期設定代行（1件3〜4時間・在宅）。Lv4から、講座「マーケティング」の修了が条件です。' }),

    P({ id: 'q3', kind: 'question', by: 'm13', at: D(-3, 12, 15), likes: 2,
      text: 'スタートガイドの「運営と15分の面談」って、何を話すんですか？ 少し緊張していて。',
      replies: [rp('m6', 610, '私のときは、目標を1行にするのを手伝ってもらいました。'),
        rp('m13', 1440, 'ありがとうございます、予約してみます。', { replyTo: 'c-d4' })] }),
    P({ id: 'i15', kind: 'intro', by: 'm15', at: D(-3, 21, 20), likes: 14,
      text: 'はじめまして、はるなです。\n住んでいるところ：北海道 帯広市\nいまのお仕事：保育士\nやりたいこと：チラシを自分で作れるようになって、園のおたよりを速く作りたいです。いずれは副業でも。\nよろしくお願いします。',
      replies: [rp('staff2', 'staff', 'はるなさん、ようこそ。水曜20:00のオリエンテーションで会えたらうれしいです。'),
        rp('m26', 60, 'デザインの講座はLv3で開きます。それまでは「SNS発信入門」の第3回がチラシにも使えます。', { thanks: 1 }),
        rp('m8', 0, 'はるなさん、よろしくお願いします。子どもの写真の撮り方は「SNS発信入門」にもあるので、おたよりに使えると思います。', { at: D(-1, 21, 0) })] }),
    P({ id: 'p10', kind: 'post', by: 'm7', at: D(-3, 12, 40), likes: 11,
      text: '仙台もくもく会、第1回の日にちを決めたいです。' + NM + '月の土曜の午前で、都合のいい日をコメントください。場所は駅前の貸し会議室を考えています。',
      replies: [rp('m16', 40, '八戸からだと少し遠いけど、1回目は行きたいです。'),
        rp('m5', 180, 'オンラインのもくもく会では、最初の5分で「今日やること」をチャットに書いてもらっています。よかったら使ってください。', { thanks: 1 }),
        rp('staff2', 'staff', '会場費を運営で持てるか確認します。日にちが決まったらイベントに載せます。'),
        rp('m7', 600, '助かります。決まったらここに書きます。')] }),

    P({ id: 'p12', kind: 'new', by: 'staff3', at: AR1.newAt, link: '#/courses/archive/ar-1', likes: 14,
      text: '勉強会の録画「' + AR1.title + '」を公開しました（' + AR1.min + '分）。使った指示文は、録画の下の資料からダウンロードできます。' }),
    P({ id: 'p13', kind: 'win', by: 'm14', at: D(-4, 9, 10), likes: 22,
      text: '夜勤明けにAIの講座を1回ずつ見ています。今日、病棟の勉強会の資料をAIで下書きして、いつもの半分の時間で作れました。',
      replies: [rp('staff3', 'staff', '下書きはAI、直すのは自分、の順番が速いです。')] }),
    P({ id: 'p17', kind: 'win', by: 'm8', at: D(-4, 21, 30), likes: 19,
      text: '運用代行をしているお店の店長さんから、Instagramを見て予約した人が先月より増えたと言われました。投稿の曜日を変えただけです。',
      replies: [rp('m12', 15, '曜日、何曜にしました？'), rp('m8', 15, '火曜と金曜の夕方です。お店の予約が入りやすい日の前日にしました。', { thanks: 2 })] }),

    P({ id: 'q5', kind: 'question', by: 'm24', at: D(-5, 22, 0), likes: 1,
      text: 'オリエンテーションの資料（PDF）はどこからダウンロードできますか？',
      replies: [rp('m24', 60, 'ありました、ありがとうございます。', { replyTo: 'c-d3' })] }),
    P({ id: 'p14', kind: 'win', by: 'm12', at: D(-5, 21, 40), likes: 34,
      text: 'Instagramの運用代行、2店舗目の契約が決まりました。提案は講座の「提案書は1枚でいい」の型のまま出しました。',
      replies: [rp('m8', 30, 'おめでとうございます。1枚の提案書、私も使っています。'),
        rp('staff4', 'staff', '型をそのまま使えたのがよかったですね。成果発表会で話してもらえませんか。'), rp('m12', 700, 'はい、話します。')] }),
    P({ id: 'p15', kind: 'event', by: 'staff4', at: D(-5, 11, 0), link: '#/events/e15', likes: 6,
      text: 'Instagram添削会（' + mdw(IGC_AT) + ' 20:00・8名）は満席になりました。キャンセル待ちで申し込めます。' }),

    P({ id: 'i13', kind: 'intro', by: 'm13', at: D(-6, 22, 0), likes: 17,
      text: 'はじめまして、岡田悠斗です。\n住んでいるところ：静岡県 浜松市\nいまのお仕事：会社員（住宅の営業）\nやりたいこと：営業の経験を活かして、紹介や営業代行の案件をやってみたいです。\nよろしくお願いします。',
      replies: [rp('staff5', 'staff', '営業の講座は「営業・セールスの基本」がLv3で開きます。紹介の案件は、オリエンテーションを見終えると応募できます。'),
        rp('m4', 120, '営業代行やっています。分からないことあったら聞いてください。')] }),
    P({ id: 'p16', kind: 'gig', by: 'staff2', at: D(-6, 10, 20), link: '#/gigs/g14', likes: 9,
      text: '新着案件：オンライン座談会のモニター（子育て世帯・60分・在宅）。スマホかパソコンで参加できます。' }),
    P({ id: 'p18', kind: 'post', by: 'm8', at: D(-6, 21, 30), likes: 13,
      text: '運用代行の月末作業、次の月の投稿の予約を先に全部入れておくようにしたら楽になりました。ほかの方の段取りも聞きたいです。',
      replies: [rp('m12', 50, '私は日曜の朝に1週間分をまとめて作っています。'), rp('m23', 80, '写真だけ先にお店に送ってもらうようにしました。')] }),
    P({ id: 'p19', kind: 'event', by: 'staff2', at: P19_AT, link: '#/events/e7', likes: 11, img: 'assets/img/event-tax.webp', alt: '夜、ノートパソコンでビデオ通話をしながらメモを取る女性',
      text: '税金Q&A（' + mdw(TAX_AT) + ' 20:00）の質問を先に受け付けています。イベントのページの「質問を送る」から。前回は32問に答えました。' }),

    P({ id: 'q6', kind: 'question', by: 'm16', at: D(-7, 21, 45), likes: 6,
      text: '子どもが寝たあとに講座を見ている方、何時ごろやっていますか？ 眠くて続かなくて…',
      replies: [rp('m12', 40, '朝5時半派です。夜は寝落ちするのでやめました。'), rp('m2', 900, '昼休みに1回だけ見ています。')] }),
    P({ id: 'p20', kind: 'post', by: 'm5', at: D(-7, 22, 40), likes: 16, img: 'assets/img/photo-online.webp', alt: '夜、自宅でパソコンを見ながらメモを取る男性',
      text: '今週のもくもく作業会は12人でした。次は金曜21:00から。最初の5分で今日やることを書いて、あとは黙々とやります。' }),

    P({ id: 'p22', kind: 'news', by: 'staff1', at: P22_AT, link: '#/events/e4', likes: 21, img: 'assets/img/photo-showcase.webp', alt: '器の写真を映したテレビの前で、座っている人たちに話す女性',
      text: mdw(E4_AT) + 'の成果発表会、札幌と那覇の会場の予約をはじめました。各15名までです。写真は前回の札幌会場。' }),
    P({ id: 'p23', kind: 'question', by: 'm1', at: D(-8, 22, 50), likes: 4,
      text: '動画編集の練習用の素材、みなさんどこで撮っていますか？ 家の中だと同じ絵ばかりになってしまって。',
      replies: [rp('m9', 30, '近所の公園と、スーパーの帰り道です。10秒ずつ撮りためています。'),
        rp('staff3', 'staff', '第1回の練習用の素材（3本）を使ってもかまいません。自分で撮るなら、手元だけの動画が編集の練習に向いています。', { answer: true, thanks: 1 }),
        rp('m8', 0, 'お店の撮影のついでに、湯気や手元を5秒ずつ撮りためています。同じ場所でも、寄りと引きで2本撮ると絵が変わります。', { at: D(-7, 21, 30), answer: true, thanks: 1 })] }),
    P({ id: 'p24', kind: 'post', by: 'm12', at: D(-8, 21, 15), likes: 12, img: 'assets/img/photo-meetup.webp', alt: 'カフェのテーブルでノートパソコンを広げて話す数人と、ベビーカーの赤ちゃん',
      text: '横浜で子連れのもくもく会をやりたいです。平日の午前、駅の近くのカフェで。写真は札幌の会員さんたちの会（借りました）。',
      replies: [rp('m2', 60, 'どうぞ使ってください。')] }),

    P({ id: 'q8', kind: 'question', by: 'm17', at: D(-9, 13, 30), likes: 5,
      text: 'お小遣い案件、最初はどれがいいですか？ スマホだけでできるものがいいです。',
      replies: [rp('m6', 480, 'アンケート系は1件5分くらいなので、すきま時間に向いています。'),
        rp('m17', 1300, 'モニターから始めてみます。', { replyTo: 'c-d1' })] }),
    P({ id: 'i16', kind: 'intro', by: 'm16', at: D(-9, 22, 30), likes: 15,
      text: 'はじめまして、工藤美咲です。\n住んでいるところ：青森県 八戸市\nいまのお仕事：会社員（事務）\nやりたいこと：ライティングを覚えて、週末に記事を書く仕事を受けたいです。\nよろしくお願いします。',
      replies: [rp('guest2', 'staff', 'ライティングの講座はLv2で開きます。まずは「SNS発信入門」の第2回がおすすめです。'), rp('m20', 50, '事務から在宅ライター、同じ道です。'),
        rp('m8', 0, '工藤さん、よろしくお願いします。分からないことがあれば、タイムラインで気軽に聞いてください。', { at: D(-8, 22, 0) })] }),
    P({ id: 'p26', kind: 'post', by: 'm11', at: D(-9, 22, 0), likes: 10,
      text: 'ライターの仕事で、取材の前に質問を10個書き出すようにしたら、取材が30分で終わるようになりました。' }),

    P({ id: 'p27', kind: 'win', by: 'm26', at: D(-10, 22, 15), likes: 17,
      text: 'デザインの見積もりを、はじめて自分で出しました。講座の「見積もりと納品」の回の表をそのまま使っています。',
      replies: [rp('m11', 40, '見積もりの表、私も使ってます。')] }),
    P({ id: 'p29', kind: 'new', by: 'staff4', at: D(-10, 11, 30), link: '#/courses/sns-basic', likes: 10,
      text: '「SNS発信入門」第3回「プロフィールの整え方」の資料を差し替えました。プロフィール文の例を5つから12に増やしています。' }),
    P({ id: 'p30', kind: 'post', by: 'm4', at: D(-10, 12, 15), likes: 8,
      text: '営業のアポ取り、断られた日のメモを1か月分見返したら、断られる理由はほとんど同じでした。台本を1行だけ直してみます。' }),
    P({ id: 'p31', kind: 'question', by: 'm14', at: D(-10, 9, 30), likes: 3,
      text: '夜勤があるので、録画があるイベントだけ参加しています。録画は何日くらいで上がりますか？',
      replies: [rp('staff2', 'staff', '次の日の昼までに上げています。「講座」の「勉強会の録画」に並びます。', { answer: true, thanks: 1 })] }),

    P({ id: 'i17', kind: 'intro', by: 'm17', at: D(-12, 13, 40), likes: 16,
      text: 'はじめまして、比嘉ゆいです。\n住んでいるところ：沖縄県 宜野湾市\nいまのお仕事：育休中（元・歯科助手）\nやりたいこと：復帰する前に、在宅でできることを1つ見つけたいです。\nよろしくお願いします。',
      replies: [rp('m8', 60, '宜野湾なら那覇のオフ会が近いです。子連れで来る人も多いですよ。', { thanks: 1 }), rp('staff2', 'staff', '比嘉さん、ようこそ。分からないことは「相談・メッセージ」でいつでも聞いてください。')] }),
    P({ id: 'p33', kind: 'new', by: 'staff3', at: D(-12, 11, 0), link: '#/courses/video', likes: 13,
      text: '「動画編集」に第6回「はじめての納品」を追加しました（10分）。納品の前に見るチェック表つきです。' }),
    P({ id: 'p34', kind: 'win', by: 'm3', at: D(-12, 21, 0), likes: 23,
      text: '那覇オフ会、はじめて参加者が20名を超えました。受付を手伝ってくれた方、ありがとうございました。' }),
    P({ id: 'p35', kind: 'post', by: 'm7', at: D(-12, 12, 20), link: '#/gigs/g11', likes: 5,
      text: '整体院のチラシのデザインを、会員どうしの案件で募集しています。A4片面、写真と文章はこちらで用意します。' }),
    P({ id: 'p36', kind: 'question', by: 'm11', at: D(-12, 22, 30), likes: 4,
      text: '見積もりを出すとき、修正の回数は最初に決めていますか？',
      replies: [rp('m26', 30, '2回までと書いています。3回目からは別料金。'),
        rp('staff4', 'staff', '見積書に「修正は2回まで」と書いておくのがおすすめです。「動画編集」第6回と「Webデザイン」第5回でも扱っています。', { answer: true, thanks: 2 }),
        rp('m8', 0, '運用代行では「修正は月2回まで」と見積書に書いています。直してほしい点は、1回にまとめて送ってもらっています。', { at: D(-11, 21, 10), answer: true, thanks: 1 })] }),

    P({ id: 'p37', kind: 'event', by: 'staff3', at: P37_AT, link: '#/events/e2', likes: 15,
      text: '次のAI勉強会（ライブ）は' + mdw(AI_AT) + ' 20:30から。テーマは「AIで見積書と提案書」。実際の案件の見積書を、AIといっしょに作ります。' }),
    P({ id: 'p9', kind: 'news', by: 'staff1', at: D(-13, 10, 0), likes: 44,
      text: '【お知らせ】提携税理士の個別相談を、' + NM + '月から月2回にします（第2・第4木曜の夜・1回30分・初回無料）。申込みは「福利厚生・専門家」からできます。' }),

    P({ id: 'p39', kind: 'win', by: 'm5', at: D(-14, 22, 30), likes: 20,
      text: 'ノーコードの講座で作った在庫管理の表を、知り合いの店で3か月使ってもらえています。直してほしいところを毎週メモしてもらっています。' }),
    P({ id: 'q10', kind: 'question', by: 'm19', at: D(-14, 12, 15), likes: 7,
      text: '紹介の案件で、知り合いに声をかけるときに気をつけることはありますか？',
      replies: [rp('staff5', 'staff', '報酬があることを最初に伝えてください。SNSなら「#PR」を入れます。「必ず〜」のような言い方はしません。講座「紹介・営業代行の始め方」の第2回にまとめてあります。', { answer: true, thanks: 4 }),
        rp('m8', 0, '私は「紹介すると報酬が出る」と最初に言ってから話しています。興味がなさそうなら、それ以上は誘いません。', { at: D(-14, 21, 40), answer: true, thanks: 1 })] }),
    P({ id: 'p40', kind: 'gig', by: 'm2', at: D(-14, 21, 0), link: '#/gigs/g10', likes: 6,
      text: '子ども服の撮影を手伝ってくれる方を募集しています（札幌市内・2時間）。案件のページから応募できます。' }),
    P({ id: 'p41', kind: 'post', by: 'm26', at: D(-14, 22, 10), likes: 9,
      text: '札幌の会場で成果発表会を見てきました。発表の3分、短いと思っていたけど、みんなちょうどよくまとまっていました。' }),

    /* 2週より前の投稿。在籍半年の会員（木村あや＝m8）の貢献ポイントの記録が指す、質問への回答・自己紹介へのあいさつ・オフ会と成果発表会の報告。
       m8 のコメントはどれも1つ目（<投稿id>-r1）。store.js の veteranState がこの id を読むので、並びを変えないこと */
    P({ id: 'q11', kind: 'question', by: 'm3', at: D(-153, 12, 20), likes: 6,
      text: '民泊の紹介で、近所のお店の写真をInstagramに載せたいです。お店の人の許可は、どう取っていますか？',
      replies: [rp('m8', 0, '撮る前に「Instagramに載せてもいいですか」と聞いて、載せたらリンクを送っています。お客さんの顔が写るものは載せません。', { at: D(-153, 21, 30), answer: true, thanks: 1 }),
        rp('m3', 0, 'リンクを送るの、いいですね。まねします。', { at: D(-152, 12, 40) })] }),
    P({ id: 'q12', kind: 'question', by: 'm2', at: D(-123, 13, 0), likes: 5,
      text: 'ネットショップのInstagramを始めました。プロフィールの1行目に何を書けばいいか迷っています。',
      replies: [rp('m8', 0, '1行目には「誰に・何を」を書いています。お店のアカウントなら「那覇のランチを毎日更新」のように。「SNS発信入門」の第2回のワークシートが使えました。', { at: D(-123, 21, 40), answer: true, thanks: 1 })] }),
    P({ id: 'q13', kind: 'question', by: 'm6', at: D(-93, 12, 10), likes: 4,
      text: 'ハッシュタグ、いくつ付けていますか？ 30個付けたほうがいいと聞いて迷っています。',
      replies: [rp('m8', 0, 'お店の投稿は5個前後にしています。地名・料理の名前・お店の名前の3つから選ぶと、選ぶ時間も短くなりました。', { at: D(-93, 21, 20), answer: true, thanks: 1 }),
        rp('m6', 0, '5個でいいんですね。減らしてみます。', { at: D(-92, 12, 5) })] }),
    P({ id: 'q14', kind: 'question', by: 'm23', at: D(-63, 12, 30), likes: 7,
      text: 'お店の中で撮ると、写真が暗くなります。明るさはどう直していますか？',
      replies: [rp('m8', 0, '窓ぎわで撮れるときは、照明を消して外の光で撮っています。直すのはスマホの編集の「明るさ」と「シャドウ」だけです。上げすぎると料理の色が変わるので、少しずつにしています。', { at: D(-63, 21, 50), answer: true, thanks: 1 })] }),
    P({ id: 'q15', kind: 'question', by: 'm20', at: D(-59, 10, 40), likes: 3,
      text: '予約投稿は、何のアプリを使っていますか？',
      replies: [rp('m8', 0, 'Instagramのアプリにある予約投稿の機能を使っています。無料で、1か月くらい先まで入れておけます。', { at: D(-59, 21, 10), answer: true })] }),
    P({ id: 'q16', kind: 'question', by: 'm18', at: D(-26, 12, 5), likes: 4,
      text: 'ストーリーズは、1日に何回くらい出していますか？',
      replies: [rp('m8', 0, 'お店のアカウントは1日1〜3回です。ランチの日替わりと、売り切れのお知らせだけにしています。', { at: D(-26, 21, 30), answer: true, thanks: 1 })] }),
    P({ id: 'q17', kind: 'question', by: 'm9', at: D(-23, 7, 50), likes: 8,
      text: 'リールは何秒くらいにしていますか？ 長いと最後まで見てもらえない気がして。',
      replies: [rp('m8', 0, 'お店のリールは15秒前後が多いです。最初の2秒に、料理がいちばんおいしそうに見えるところを置いています。作り方を見せるときだけ30秒くらいにします。', { at: D(-23, 21, 20), answer: true, thanks: 2 })] }),
    P({ id: 'q18', kind: 'question', by: 'm10', at: D(-19, 12, 30), likes: 2,
      text: '予約投稿を入れたのに、その時間に投稿されていませんでした。設定で気をつけることはありますか？',
      replies: [rp('m8', 0, '私も一度ありました。アカウントがプロアカウントになっているかと、予約した日時（午前と午後）がずれていないかを確かめてみてください。', { at: D(-19, 21, 40), answer: true, thanks: 1 }),
        rp('m10', 0, 'プロアカウントになっていませんでした。直したら投稿されました。', { at: D(-18, 12, 20) })] }),
    P({ id: 'q19', kind: 'question', by: 'm25', at: D(-16, 12, 15), likes: 5,
      text: '運用代行をしている方、お店への月の報告はどんな形で出していますか？',
      replies: [rp('m8', 0, 'スプレッドシート1枚です。投稿の数・保存数・フォローが増えた投稿と、来月やることを1行。店長さんは忙しいので、長くしないようにしています。', { at: D(-16, 21, 30), answer: true }),
        rp('staff4', 'staff', '講座「Instagram運用」の第5回の資料に、月の報告のひな形も入っています。')] }),

    P({ id: 'i12', kind: 'intro', by: 'm12', at: D(-169, 12, 10), likes: 19,
      text: 'はじめまして、さとみです。\n住んでいるところ：神奈川県 横浜市\nいまのお仕事：美容室の受付（パート）・2児の母\nやりたいこと：美容室や花屋のInstagramの運用を、仕事として受けられるようになりたいです。\nよろしくお願いします！',
      replies: [rp('m8', 0, 'さとみさん、よろしくお願いします。私もInstagramの運用を勉強しています。', { at: D(-169, 21, 0) }),
        rp('staff2', 'staff', 'さとみさん、ようこそ。水曜20:00のオリエンテーションで会えたらうれしいです。')] }),
    P({ id: 'i26', kind: 'intro', by: 'm26', at: D(-139, 12, 30), likes: 15,
      text: 'はじめまして、村上恵です。\n住んでいるところ：北海道 札幌市\nいまのお仕事：印刷会社のデザイン（パート）\nやりたいこと：バナーとチラシのデザインを、個人でも受けられるようになりたいです。\nよろしくお願いします。',
      replies: [rp('m8', 0, '村上さん、よろしくお願いします。チラシのデザイン、いつか見せてください。', { at: D(-139, 21, 0) }),
        rp('m2', 60, 'デザインができる方が札幌に増えてうれしいです。オフ会でも話しましょう。')] }),
    P({ id: 'i19', kind: 'intro', by: 'm19', at: D(-94, 12, 40), likes: 12,
      text: 'はじめまして、金城まさとです。\n住んでいるところ：沖縄県 うるま市\nいまのお仕事：ホテルのフロント\nやりたいこと：紹介の案件から始めて、自分に合う副業を見つけたいです。\nよろしくお願いします。',
      replies: [rp('m8', 0, '金城さん、ようこそ。那覇のオフ会でも会えたらうれしいです。', { at: D(-94, 21, 0) }),
        rp('staff5', 'staff', '紹介の案件は、オリエンテーションを見終えると応募できます。講座「紹介・営業代行の始め方」はLv4で開きます。')] }),
    P({ id: 'i20', kind: 'intro', by: 'm20', at: D(-74, 13, 0), likes: 11,
      text: 'はじめまして、新井智子です。\n住んでいるところ：新潟県 新潟市\nいまのお仕事：主婦（前は銀行の窓口）\nやりたいこと：在宅でライターの仕事を受けたいです。\nよろしくお願いします。',
      replies: [rp('m8', 0, '新井さん、よろしくお願いします。分からないことは、タイムラインで聞くと誰かが答えてくれます。', { at: D(-74, 21, 0) }),
        rp('guest2', 'staff', 'ライターの松本です。ライティングの講座はLv2で開きます。第1回の「読まれる文章の型」から見てください。')] }),
    P({ id: 'i22', kind: 'intro', by: 'm22', at: D(-19, 12, 30), likes: 9,
      text: 'はじめまして、宮本さやです。\n住んでいるところ：熊本県 熊本市\nいまのお仕事：パート（飲食）\nやりたいこと：お小遣い案件から始めて、働いているお店のInstagramも手伝えるようになりたいです。\nよろしくお願いします。',
      replies: [rp('m8', 0, '宮本さん、よろしくお願いします。私も飲食店のInstagramをやっています。分からないことがあれば聞いてください。', { at: D(-19, 21, 0) }),
        rp('staff2', 'staff', '宮本さん、ようこそ。お小遣い案件は「案件」の画面から応募できます。')] }),

    P({ id: 'p42', kind: 'post', by: 'm3', at: plus(satBack(40), 27 * 60), likes: 14,
      text: '那覇オフ会、今回は16名でした。はじめての人が4人、子連れが3組。受付は木村さんに手伝ってもらいました。',
      replies: [rp('m8', 30, 'ありがとうございました。次も受付やります。')] }),
    P({ id: 'p43', kind: 'news', by: 'staff1', at: nextWeekday(lastDow(-3, 5, 20), 10), likes: 18,
      text: '【' + mon(lastDow(-3, 5, 20)) + '月の成果発表会】13人がオンラインで発表しました。「Instagramの写真の撮り方」「民泊の予約ページを直した話」など。成果発表会は毎月、最終金曜の20:00からです。',
      replies: [rp('m8', 600, 'はじめての発表で緊張しました。聞いてくださった方、ありがとうございました。')] })
  ];

  /* 自己紹介のひな形とは別に、デモ会員の2つの投稿（store が state に入れる） */
  var DEMO_POSTS = {
    my1: { id: 'my1', kind: 'intro', at: D(-22, 22, 40), likes: 21,
      text: 'はじめまして、高橋さくらです。\n住んでいるところ：北海道 旭川市\nいまのお仕事：会社員（事務）・2児の母\nやりたいこと：動画編集を覚えて、在宅の仕事を1件受ける\nよろしくお願いします！',
      replies: [rp('m12', 12, 'よろしくお願いします。私も子どもが寝てから派です。'),
        rp('m3', 40, '旭川なら札幌のオフ会も行きやすいですよ。'),
        rp('staff2', 'staff', '高橋さん、ようこそ。動画編集の講座はLv3で開きます。オリエンテーションのあとに「SNS発信入門」を見ておくと、編集の題材が決めやすいです。'),
        rp('m6', 1500, '2児の母仲間です。よろしくお願いします。'),
        rp('m17', 2400, '冬が長いところだと、家で進められるのがいいですね。私も子どもが寝てから講座を見ています。'),
        rp('m1', 3000, '同じ旭川です。札幌のオフ会、いつか一緒に行きましょう。'),
        // 1つ目のコメント（さとみさん）への返信。返信は1段だけ
        rp('m16', 3300, '子どもが寝てから派、私もです。22時からの30分が勉強の時間になりました。', { replyTo: 'my1-r1' })] },
    my2: { id: 'my2', kind: 'win', at: D(-11, 21, 5), likes: 16,
      text: 'はじめての案件（商品モニター）が完了しました。写真の撮り方で2回やり直したけど、最後まで自分でできたのがうれしいです。',
      replies: [rp('m1', 30, 'おめでとうございます。私もモニターから始めてみます。'), rp('staff2', 'staff', 'おつかれさまでした。次は案件の「応募した案件」から報酬の明細を見られます。')] }
  };
  P(DEMO_POSTS.my1); P(DEMO_POSTS.my2);

  /* ---------- 案件 ----------
     type: small(お小遣い案件) / work(業務委託) / refer(紹介できるサービス) / peer(会員どうしの募集)
     reward: 表示用の文字列。「（目安）」は画面で付ける。rewardType: shot(1回ごと) / stock(毎月)
     投資・FX・ローンなどの金融商品の案件は扱わない。 */
  function G(o, postedDays, closeDays) {
    o.status = 'open';
    o.postedAt = typeof postedDays === 'string' ? postedDays : D(postedDays, 10, 0);
    o.closesAt = closeDays == null ? null : D(closeDays, 23, 59);
    o.isNew = (CLG.now() - new Date(o.postedAt)) / DAY <= 7;
    return o;
  }
  var GIGS = [
    G({ id: 'g1', type: 'small', title: '商品モニター（日用品・スマホで完結）', reward: '1件 500〜1,500円', rewardType: 'shot', level: 1,
      time: '1件 15分', remote: true, slots: '随時', by: 'staff2',
      desc: '届いた日用品を使って、スマホからアンケートに答える案件です。写真の提出がある回もあります。',
      steps: ['応募する', '運営から手順が届く', '商品が届いたら使ってアンケートに回答', '翌月末に報酬のお支払い'] }, -40, null),
    G({ id: 'g2', type: 'small', title: 'アプリのテストユーザー（新サービス）', reward: '1回 2,000円', rewardType: 'shot', level: 1,
      time: '30〜40分', remote: true, slots: '残り12名', by: 'staff3',
      desc: '開発中のアプリを触って、使いにくいところを教えてください。オンラインで画面を共有しながら行います。',
      steps: ['応募する', '運営と10分の面談（日程を選ぶ）', 'オンラインで40分', '当月末にお支払い'] }, -4, 10),
    G({ id: 'g3', type: 'small', title: '音声の文字起こし（10分の音声）', reward: '1本 800円', rewardType: 'shot', level: 1,
      time: '1本 40分目安', remote: true, slots: '随時', by: 'staff2',
      desc: '勉強会の音声を文字にします。AIで下書きしてから直す手順をお渡しします。',
      steps: ['応募する', '手順書と音声が届く', '文字起こしを提出', '翌月末にお支払い'] }, -11, null),
    G({ id: 'g4', type: 'work', title: '飲食店のInstagram投稿代行（月8投稿）', reward: '月 24,000円（8投稿）', rewardType: 'stock', level: 3,
      time: '月 6〜8時間', remote: true, slots: '2名', by: 'staff4', requires: 'instagram',
      desc: '地域の飲食店の投稿づくりを任せてもらう案件です。写真はお店から届きます。文章と画像の加工、予約投稿までを担当します。',
      steps: ['応募する', '運営と15分の面談', 'お店とオンラインで顔合わせ', '稼働開始（月末締め・翌月末払い）'] }, D(-1, 15, 20), 13),
    G({ id: 'g5', type: 'work', title: 'ショート動画の編集（1本60秒）', reward: '1本 3,000円', rewardType: 'shot', level: 3,
      time: '1本 1.5時間目安', remote: true, slots: '随時', by: 'staff3', requires: 'video',
      desc: '撮影済みの素材から、テロップと効果音を入れた60秒の縦動画を作ります。最初の3本は講師が添削します。',
      steps: ['応募する', '運営と15分の面談', '1本目を添削つきで納品', '月末締め・翌月末払い'] }, -10, null),
    G({ id: 'g6', type: 'work', title: '営業のアポイント獲得（電話・メール）', reward: '時給1,500円＋アポ1件ごと1,000円', rewardType: 'stock', level: 3,
      time: '週 10時間〜', remote: true, slots: '5名', by: 'staff5', requires: 'sales-basic',
      desc: '法人向けサービスの電話・メールでのアポイント獲得です。台本と研修（2回）があります。',
      steps: ['応募する', '運営と15分の面談', '研修（オンライン2回）', '稼働開始（月末締め・翌月末払い）'] }, -9, 20),
    G({ id: 'g7', type: 'refer', title: '法人向けホームページ制作', reward: '成約額の10%（1回）', rewardType: 'shot', level: 1,
      time: '紹介のみ', remote: true, slots: '—', by: 'staff5', requires: 'orientation',
      desc: 'ホームページを作りたい知り合いの会社・お店がいたら、担当者におつなぎください。商談と契約は担当者が行います。' }, -60, null),
    G({ id: 'g8', type: 'refer', title: 'SNS運用代行（中小企業向け）', reward: '月額の10%（契約が続くあいだ毎月）', rewardType: 'stock', level: 1,
      time: '紹介のみ', remote: true, slots: '—', by: 'staff4', requires: 'orientation',
      desc: 'SNSの運用を任せたい会社をご紹介ください。契約が続くあいだ、毎月報酬が発生します。' }, -60, null),
    G({ id: 'g9', type: 'refer', title: '営業職フリーランスの登録紹介', reward: '1名 5,000円（稼働が始まったら1回）', rewardType: 'shot', level: 1,
      time: '紹介のみ', remote: true, slots: '—', by: 'staff5', requires: 'orientation',
      desc: '業務委託で営業の仕事を探している方をご紹介ください。面談のうえ、案件が決まったら報酬が発生します。' }, -45, null),
    G({ id: 'g10', type: 'peer', title: '子ども服のネットショップの商品撮影', reward: '1回 5,000円', rewardType: 'shot', level: 2,
      time: '2時間', remote: false, place: '札幌市内', slots: '1名', by: 'm2',
      desc: '自宅で販売している子ども服の撮影を手伝ってくれる方を探しています。スマホ撮影でかまいません。' }, D(-14, 21, 0), 7),
    G({ id: 'g11', type: 'peer', title: '整体院のチラシデザイン', reward: '1点 8,000円', rewardType: 'shot', level: 3,
      time: '納期2週間', remote: true, slots: '1名', by: 'm7', requires: 'design',
      desc: 'A4片面のチラシです。写真と文章はこちらで用意します。' }, D(-12, 12, 20), 9),
    G({ id: 'g12', type: 'work', title: 'LINE公式アカウントの初期設定代行', reward: '1件 15,000円', rewardType: 'shot', level: 4,
      time: '1件 3〜4時間', remote: true, slots: '3名', by: 'staff1', requires: 'marketing',
      desc: '地域のお店のLINE公式アカウントを作り、あいさつの文・リッチメニュー・最初の配信までを用意します。',
      steps: ['応募する', '運営と15分の面談', 'お店とオンラインで打ち合わせ', '設定して納品（翌月末払い）'] }, D(-2, 10, 30), 16),
    G({ id: 'g13', type: 'work', title: '講座の収録アシスタント', reward: '1回 6,000円（3時間）', rewardType: 'shot', level: 5,
      time: '1回 3時間', remote: false, place: '札幌の収録スタジオ', slots: '2名', by: 'staff1',
      desc: '講座の収録で、カメラと照明の準備、台本のめくり、収録後のファイル整理をします。師範代講座に進む人の練習にもなります。',
      steps: ['応募する', '運営と15分の面談', '収録に同行（1回目は見学）', '月末締め・翌月末払い'] }, -5, 21),
    G({ id: 'g14', type: 'small', title: 'オンライン座談会のモニター（子育て世帯）', reward: '1回 3,000円', rewardType: 'shot', level: 1,
      time: '60分', remote: true, slots: '残り6名', by: 'staff2',
      desc: '子育て中の方に、家事と買い物のことを6人で話してもらう座談会です。顔出しなしでも参加できます。',
      steps: ['応募する', '日程を選ぶ', 'オンラインで60分', '翌月末にお支払い'] }, D(-6, 10, 20), 8),
    G({ id: 'g15', type: 'peer', title: 'ハンドメイド作品のショップ説明文', reward: '1点 3,000円（5点まで）', rewardType: 'shot', level: 2,
      time: '1点 30分目安', remote: true, slots: '1名', by: 'm6', requires: 'writing',
      desc: 'ネットショップで売っているアクセサリーの説明文を、5点分書いてくれる方を探しています。' }, -3, 11),
    G({ id: 'g16', type: 'small', title: '飲食店の覆面調査（那覇市内）', reward: '1回 2,500円＋飲食代', rewardType: 'shot', level: 1,
      time: '1回 1時間', remote: false, place: '那覇市内', slots: '4名', by: 'staff4',
      desc: '指定のお店で食事をして、接客と料理についてスマホのフォームに答えます。飲食代は後から精算します。',
      steps: ['応募する', 'お店と日にちが届く', '食事をしてフォームに回答', '翌月末にお支払い（飲食代も）'] }, -1, 14),
    G({ id: 'g17', type: 'work', title: 'ホームページの更新作業（月2回・ノーコード）', reward: '月 8,000円', rewardType: 'stock', level: 5,
      time: '月 2〜3時間', remote: true, slots: '1名', by: 'staff3', requires: 'nocode',
      desc: '工務店のホームページの施工事例を、月2回更新します。写真と文章は先方から届きます。',
      steps: ['応募する', '運営と15分の面談', '先方とオンラインで顔合わせ', '稼働開始（月末締め・翌月末払い）'] }, -8, 12)
  ];

  /* 募集を終えた案件（案件の履歴・管理画面・在籍の長い会員の記録が読む） */
  function GC(o, postedDays, closedDays, filled) {
    o.status = 'closed'; o.postedAt = D(postedDays, 10, 0); o.closesAt = D(closedDays, 23, 59); o.filled = filled; o.isNew = false;
    return o;
  }
  var GIGS_CLOSED = [
    GC({ id: 'gc1', type: 'small', title: '新商品の試食モニター（冷凍食品）', reward: '1件 1,000円', rewardType: 'shot', level: 1, time: '1件 20分', remote: true, slots: '30名', by: 'staff2',
      desc: '届いた冷凍食品を食べて、スマホからアンケートに答えました。' }, -150, -120, 30),
    GC({ id: 'gc2', type: 'work', title: '美容室のショート動画の編集（10本）', reward: '1本 3,000円', rewardType: 'shot', level: 3, time: '1本 1.5時間目安', remote: true, slots: '2名', by: 'staff3', requires: 'video',
      desc: '美容室の施術動画を、60秒の縦動画に10本編集しました。' }, -40, -26, 2),
    GC({ id: 'gc3', type: 'peer', title: '那覇のカフェのメニュー表デザイン', reward: '1点 10,000円', rewardType: 'shot', level: 3, time: '納期3週間', remote: true, slots: '1名', by: 'm3', requires: 'design',
      desc: 'A4両面のメニュー表のデザイン。' }, -35, -21, 1),
    GC({ id: 'gc4', type: 'small', title: '音声の文字起こし（30分の対談）', reward: '1本 2,400円', rewardType: 'shot', level: 1, time: '1本 2時間目安', remote: true, slots: '5名', by: 'staff2',
      desc: '講師どうしの対談の文字起こし。' }, -30, -12, 5),
    GC({ id: 'gc5', type: 'work', title: '店舗のInstagram撮影（那覇・3店舗）', reward: '1店舗 6,000円', rewardType: 'shot', level: 3, time: '1店舗 2時間', remote: false, slots: '1名', by: 'staff4', requires: 'instagram',
      desc: '那覇市内の3店舗で、投稿用の写真をまとめて撮りました。' }, -80, -66, 1),
    GC({ id: 'gc6', type: 'refer', title: 'クラウド勤怠システムの導入紹介', reward: '成約1件 10,000円（1回）', rewardType: 'shot', level: 1, time: '紹介のみ', remote: true, slots: '—', by: 'staff5',
      desc: '勤怠管理を見直したい会社の紹介。先方の都合で募集を終えました。' }, -60, -8, 3),
    GC({ id: 'gc7', type: 'small', title: 'アプリのテストユーザー（家計簿アプリ）', reward: '1回 2,000円', rewardType: 'shot', level: 1, time: '40分', remote: true, slots: '20名', by: 'staff3',
      desc: '家計簿アプリの使いにくいところを、画面共有しながら話してもらいました。' }, -24, -5, 20),
    GC({ id: 'gc8', type: 'peer', title: '子ども向け英語教室のチラシ配り（旭川）', reward: '1回 3,000円', rewardType: 'shot', level: 1, time: '2時間', remote: false, place: '旭川市内', slots: '2名', by: 'm1',
      desc: '駅前でのチラシ配り。' }, -30, -20, 2)
  ];

  var GIG_TYPES = [
    { id: 'small', name: 'お小遣い案件', desc: 'スマホや自宅でできる単発の案件' },
    { id: 'work',  name: '業務委託', desc: '継続の仕事。講座の修了が条件のものもあります' },
    { id: 'refer', name: '紹介できるサービス', desc: '知り合いを担当者に紹介する案件' },
    { id: 'peer',  name: '会員どうし', desc: '会員が出している募集。手数料はかかりません' }
  ];

  /* ---------- 紹介プログラム（仮） ----------
     打ち合わせの案：紹介した人が会員でいるあいだ、その人の月額の一部を毎月お支払いする。
     報酬の形（毎月か1回か）は、本番の前に専門家の確認を受けて決める。model で切り替えられるようにしてある。
     ここで決めていること：
       - 1段だけ（紹介した人がさらに紹介しても、あなたには報酬は発生しない）
       - 紹介人数で料率を上げない、紹介人数のランキングは作らない
       - 初回決済から holdDays 日は「保留」。返金・解約がなければ「確定」になる */
  var REFERRAL = {
    model: 'monthly',   // 'monthly'＝在籍中は毎月 rate を支払う / 'once'＝1人につき onceAmount を1回だけ
    rate: 0.30,
    onceAmount: 2000,
    holdDays: 30,
    payDay: 25,         // 月末締め・翌月25日払い
    minPayout: 1000     // これ未満は翌月に繰り越し
  };

  /* デモ会員が紹介した人（画面には頭文字だけ出す） */
  var REFERRED = [
    { id: 'r1', person: 'm1',  joinedDaysAgo: 17, status: 'active' },
    { id: 'r2', person: 'm13', joinedDaysAgo: 6,  status: 'active' }
  ];
  var REF_CLICKS = 14;    // この30日で専用URLが開かれた回数（本番は計測サーバーの値）

  /* 紹介するときの文面（#PR を最初から入れておく。収入の話は入れない） */
  var SHARE_TEMPLATE = '#PR\n私が入っているオンラインスクール「{site}」の紹介リンクです。\n副業の講座（レベルに合わせて順に開く）、案件の紹介、運営への相談があります。\n月額{price}円（税込）、入会金なし、いつでも解約できます。\n{url}';

  /* ---------- 福利厚生 ----------
     example は「最大◯%」ではなく、ふつうに使ったときの一例。提携先はまだ交渉中 */
  var PARTNER = '提携先（交渉中）', VARIES = '商品・店舗により異なります';
  var END_OF_YEAR = ymd(new Date(CLG.now().getFullYear(), 11, 31));
  var PERKS = [
    { id: 'pk1', cat: '暮らし', title: '日用品・食料品の会員価格', desc: '提携の会員制通販で、いつもの日用品や食品を会員価格で買えます。', how: '提携通販のアカウントを発行（会員ページで即日）',
      example: '例：お米5kgやティッシュの箱買いが会員価格', area: '全国（配送）', until: '' },
    { id: 'pk2', cat: '暮らし', title: '引越し・家電レンタルの割引', desc: '提携業者の基本料金が割引になります。', how: 'クーポンコード',
      example: '例：単身の引越しの基本料金から5%引き', area: '全国', until: '' },
    { id: 'pk3', cat: '子育て', title: 'ベビーシッターの割引', desc: '提携サービスの利用料が割引になります。', how: 'クーポンコード',
      example: '例：初回の利用料から2,000円引き', area: '札幌・仙台・東京23区・福岡・那覇', until: '' },
    { id: 'pk4', cat: '遊び', title: '映画館・カラオケ・漫画喫茶の割引', desc: '全国の提携施設で、会員証を見せると割引になります。', how: '会員証を提示',
      example: '例：映画の一般料金から300円引き', area: '全国の提携施設', until: '' },
    { id: 'pk5', cat: '遊び', title: 'レジャー施設・旅行の優待', desc: '宿泊・テーマパーク・温浴施設などの優待価格。', how: '提携サイトから予約',
      example: '例：温浴施設の入館料が平日100円引き', area: '全国', until: '' },
    { id: 'pk6', cat: '仕事', title: 'コワーキングスペースの割引', desc: '提携のコワーキングを、会員価格のドロップインで使えます。', how: '会員証を提示',
      example: '例：ドロップイン1日1,000円', area: '札幌・那覇・福岡の提携店', until: '' },
    { id: 'pk7', cat: '仕事', title: 'バーチャルオフィスの初期費用無料', desc: '開業届や法人化で住所が必要なときに。', how: 'クーポンコード',
      example: '初期費用（通常5,500円）が無料', area: 'オンライン', until: END_OF_YEAR },
    { id: 'pk8', cat: '学び', title: '資格講座・スクールの会員割引', desc: '簿記・FP・ITパスポートなどの提携講座が割引になります。', how: '提携サイトから申し込む',
      example: '例：簿記3級の通信講座が受講料10%引き', area: 'オンライン', until: '' },
    { id: 'pk9', cat: '子育て', title: '家事代行の初回割', desc: '掃除・料理の作り置きなど、提携の家事代行をはじめて使うときの割引です。', how: 'クーポンコード',
      example: '初回2時間を会員価格で', area: '札幌・仙台・東京23区・那覇', until: '' },
    { id: 'pk10', cat: '暮らし', title: '宅配食材のお試し', desc: '献立つきの宅配食材を、お試しの価格で頼めます。', how: 'クーポンコード',
      example: '例：お試しセット（3日分）が半額', area: '全国（一部地域を除く）', until: ymd(new Date(CLG.now().getFullYear(), CLG.now().getMonth() + 2, 0)) },
    { id: 'pk11', cat: '仕事', title: '写真スタジオ（プロフィール写真）', desc: 'SNSや名刺に使うプロフィール写真を、提携スタジオで撮れます。', how: '会員証を提示',
      example: '例：プロフィール写真の撮影が1,000円引き', area: '札幌・那覇・福岡', until: '' },
    { id: 'pk12', cat: '仕事', title: 'クラウド会計の初年度割引', desc: '個人事業主向けのクラウド会計ソフトが、初年度だけ割引になります。', how: 'クーポンコード',
      example: '例：個人事業主向けプランの初年度が20%引き', area: 'オンライン', until: END_OF_YEAR },
    { id: 'pk13', cat: '仕事', title: '名刺・チラシの印刷', desc: '提携のネット印刷で、名刺やチラシを会員価格で頼めます。', how: 'クーポンコード',
      example: '例：名刺100枚の送料が無料', area: 'オンライン', until: '' },
    { id: 'pk14', cat: '学び', title: 'ビジネス書の読み放題', desc: 'ビジネス書の読み放題サービスを、はじめの30日は無料で使えます。', how: '提携サイトから申し込む',
      example: '30日無料（その後は通常料金）', area: 'オンライン', until: '' }
  ];
  PERKS.forEach(function (p) { p.partner = PARTNER; p.note = VARIES; });

  /* 専門家の紹介（初回相談は無料・その後は各事務所の料金） */
  var EXPERTS = [
    { id: 'ex1', title: '税理士', desc: '確定申告、経費、開業届、法人化のタイミング。', note: '初回30分無料', person: 'guest1',
      office: '中村健 税理士事務所（札幌市中央区）', hours: '平日10:00〜18:00（相談はZoom・30分）', next: nextDow(4, 15, 2) },
    { id: 'ex2', title: '司法書士', desc: '会社の設立登記、役員変更、契約まわり。', note: '初回30分無料', person: 'guest3',
      office: '大野司法書士事務所（仙台市青葉区）', hours: '平日10:00〜17:00（相談はZoom・30分）', next: nextDow(2, 14, 3) },
    { id: 'ex3', title: '社会保険労務士', desc: '人を雇うとき、助成金、社会保険。', note: '初回30分無料', person: 'guest4',
      office: '西田社会保険労務士事務所（福岡市博多区）', hours: '平日10:00〜17:00（相談はZoom・30分）', next: nextDow(3, 11, 4) },
    { id: 'ex4', title: '行政書士', desc: '許認可、補助金の申請書類。', note: '初回30分無料', person: 'guest5',
      office: '上原行政書士事務所（那覇市）', hours: '平日9:30〜17:30（相談はZoom・30分）', next: nextDow(5, 15, 3) }
  ];

  /* ---------- 運営とのメッセージ（デモ会員） ----------
     入会 → 自動送信 → 翌営業日の担当のあいさつ → 質問 → 9日前の声かけ → 面談の予約 → 会社への届け出の質問 → 今日の案件の面談候補 */
  function slotText(list) { return list.map(function (x) { return '・' + mdw(x) + ' ' + hm(x); }).join('\n'); }
  /** 面談の候補3つ：after の翌日からの平日の夜2つ（別の日）と、土曜の午前。日付の順に並べる */
  function slots3(after, h1, h2) {
    var base = atH(days(after, 1), 0).toISOString();
    var a = nextWeekday(base, h1 || 21);
    var b = nextWeekday(atH(days(a, 1), 0).toISOString(), h2 || 21.5);
    var c = dowAfter(base, 6, 10);
    return [a, b, c].sort(function (x, y) { return new Date(x) - new Date(y); });
  }
  var DEMO = { joinedAt: JOINED };
  var THREAD = (function () {
    var t = [], at;
    function add(m) { t.push(m); return m.at; }
    add({ from: 'staff2', auto: true, at: plus(JOINED, 1),
      text: '入会の手続きが終わりました。会員番号とログインの案内は、登録のメールアドレスに送っています。\n分からないことは、このメッセージから運営に聞けます。' + SITE.replySla + '。' });
    // 担当のあいさつは翌営業日の朝。返事はその日の夜（子どもが寝たあと）
    at = add({ from: 'staff2', at: staffAfter(JOINED, 30),
      text: '高橋さん、はじめまして。コミュニティ運営の佐藤です。\nまずはスタートガイドを上から進めてください。オリエンテーション（4回・30分）を見ると、会員ページの使い方がひと通り分かります。' });
    at = add({ from: 'me', kind: '質問', at: atH(at, 21 + 40 / 60).toISOString(),
      text: 'ありがとうございます。子どもが寝たあとの時間しか取れないのですが、それでも進められますか？' });
    add({ from: 'staff2', at: staffAfter(at, 30),
      text: '夜に30分ずつ進めている方がいちばん多いです。講座は' + SITE.lessonLength + 'なので、1日1回のペースで足ります。\n水曜20:00のオリエンテーションは録画が残るので、あとからでも見られます。' });
    // 9日前（土日なら前の金曜）の声かけ。この時点でスタートガイドは7/10（目標・面談・成果発表会が残り）
    DEMO.checkinAt = add({ from: 'staff2', at: weekdayBack(D(-9, 11, 20)),
      text: 'スタートガイド7/10まで進んでいますね。残りは「30日後の目標」「運営との面談」「成果発表会」です。\n面談は15分で、目標の立て方をいっしょに決めます。都合のいい時間帯を送ってください。' });
    at = add({ from: 'me', kind: '面談の予約', at: atH(DEMO.checkinAt, 21.6).toISOString(),
      text: '面談をお願いします。平日は21時以降、土曜は午前なら空いています。' });
    var offerAt = staffAfter(at, 30);
    var sl = slots3(offerAt), s1 = sl[0];   // いちばん早い候補を選ぶ
    add({ from: 'staff2', at: offerAt, text: '面談の候補です。\n' + slotText(sl) + '\nどれか選んでください。15分の予定です。' });
    // 会社員なので昼休みに返事（候補が昼より後に届いたら、その90分後）
    var lunch = atH(offerAt, 12.25).toISOString();
    at = add({ from: 'me', kind: '面談の予約', at: new Date(lunch) > new Date(offerAt) ? lunch : plus(offerAt, 90),
      text: mdw(s1) + ' ' + hm(s1) + 'でお願いします。' });
    DEMO.meetBookedAt = add({ from: 'staff2', at: staffAfter(at, 25),
      text: mdw(s1) + ' ' + hm(s1) + 'で予約しました。当日はこのリンクから入ってください。\n' + SITE.zoomPlaceholder + '\nカメラはオフでもかまいません。' });
    DEMO.meetingAt = s1;
    DEMO.goalAt = plus(s1, 70);
    // 会社への届け出の質問（昼休み）→ 同じ日の午後に返事 → 夜にお礼
    DEMO.companyQAt = add({ from: 'me', kind: '質問', at: weekdayBack(D(-3, 12, 20)),
      text: '会社に副業のことを聞かれたら、どう確認すればいいですか？' });
    DEMO.companyReplyAt = add({ from: 'staff2', at: staffAfter(DEMO.companyQAt, 80),
      text: 'まず会社の就業規則で、副業が「届け出制」「許可制」「禁止」のどれになっているかを確認してください。届け出が要る会社なら、その手続きに沿って伝えるのがいちばん早いです。\n' +
        '住民税のしくみは「お金と税金の基礎」の第1回で説明しています。個別の事情は、提携の税理士（中村さん）に無料で相談できます（福利厚生・専門家 → 専門家に相談）。' });
    add({ from: 'me', kind: '質問', at: atH(DEMO.companyReplyAt, 21.1).toISOString(),
      text: 'ありがとうございます。就業規則を見たら届け出制でした。来週出してみます。' });
    // 今日の、案件 g2 の面談の候補（未読のまま）
    DEMO.g2MsgAt = add({ from: 'staff2', ref: 'gig:g2', at: T(0, 10, 15),
      text: '案件「アプリのテストユーザー」の件です。面談（オンライン10分）の候補を送ります。テストの進め方と、使うスマホの機種を確認します。\n' + slotText(slots3(D(0, 0, 0))) + '\n都合のいいものを返信してください。' });
    // 曜日の寄せ方で前後することがあるので、最後に時刻の順に並べる
    t.sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
    return t;
  })();

  /* 在籍半年の会員（木村あや）と運営のやりとり */
  var VJ = VETERAN.joinedAt;
  var THREAD_VETERAN = (function () {
    var t = [], at;
    function add(m) { t.push(m); return m.at; }
    add({ from: 'staff2', auto: true, at: plus(VJ, 1),
      text: '入会の手続きが終わりました。会員番号とログインの案内は、登録のメールアドレスに送っています。\n分からないことは、このメッセージから運営に聞けます。' + SITE.replySla + '。' });
    add({ from: 'staff2', at: staffAfter(VJ, 30), text: '木村さん、はじめまして。コミュニティ運営の佐藤です。まずはスタートガイドを上から進めてください。' });
    at = add({ from: 'me', kind: '質問', at: D(-150, 22, 10), text: '「Instagram運用」の講座はLv3で開くと書いてありました。先に見ておいたほうがいい講座はありますか？' });
    add({ from: 'staff4', at: staffAfter(at, 60), text: '講師の小林です。「SNS発信入門」の第2回と第3回が土台になります。プロフィールの1行目を先に決めておくと、Instagramの講座が進めやすいです。' });
    at = add({ from: 'me', kind: '相談したい', at: D(-45, 21, 0), text: '運用代行の案件に応募する前に、見積もりの出し方を相談したいです。月8投稿でどのくらいが普通でしょうか。' });
    add({ from: 'staff4', at: staffAfter(at, 60), text: '案件「飲食店のInstagram投稿代行」の条件が目安になります。写真を誰が撮るか、文章をどこまで書くかで変わるので、見積書には作業の範囲を1行ずつ書いてください。講座の第5回に見積書のひな形があります。' });
    at = add({ from: 'me', kind: '質問', at: D(-3, 21, 40), text: 'ショート動画の編集の案件に応募しました。面談の前に準備しておくものはありますか？' });
    add({ from: 'staff3', ref: 'gig:g5', at: T(0, 11, 30), text: '講師の青木です。編集した動画のリンクを1つ用意してください（限定公開でかまいません）。面談の候補です。\n' + slotText(slots3(D(0, 0, 0), 20.5, 21)) + '\n都合のいいものを返信してください。' });
    return t;
  })();

  var MESSAGE_KINDS = ['質問', '講座の質問', '相談したい', '面談の予約', 'その他'];

  /* 送ったあとに届く返事（試作版の再現）。1つ目はすぐ、2つ目は5秒ほどあと。{slots} は候補の日時に差し替える */
  var AUTO_REPLIES = {
    '質問': ['ありがとうございます。確認して今日中に返信します。', '確認しました。ヘルプの「よくある質問」にも同じ内容があります。足りなければ、もう少しくわしく教えてください。'],
    '講座の質問': ['ありがとうございます。講師に確認します。', '講師に聞きました。その回の資料（動画の下のPDF）の2ページ目に手順があります。うまくいかなければ、画面の写真を送ってください。'],
    '相談したい': ['ありがとうございます。今日中に返信します。', '必要なら15分くらい通話もできます。都合のいい時間帯を送ってください。'],
    '面談の予約': ['面談の件、ありがとうございます。', '候補です。\n{slots}\nどれか選んでください。15分の予定です。'],
    'その他': ['ありがとうございます。確認して今日中に返信します。', '担当に回しました。平日なら24時間以内に返信します。']
  };

  /* ---------- お知らせ（右上の鈴） ----------
     type ごとの記号。link は押したときに開く先 */
  var NOTICE_ICON = { reply: 'message', event_before: 'calendar', new_course: 'play', new_gig: 'briefcase', comment: 'comment', thanks: 'heart',
    reward_confirmed: 'gift', billing: 'receipt', referral: 'gift', gig: 'briefcase', system: 'bell' };
  function N(id, type, at, text, link) { return { id: id, type: type, icon: NOTICE_ICON[type] || 'bell', at: at, text: text, link: link, go: link }; }
  /** 「あと◯日」を、お知らせを出した時刻から数える */
  function untilText(title, eventAt, from) {
    var n = dayDiff(eventAt, from);
    if (n <= 0) return '予約中の「' + title + '」は今日' + hm(eventAt) + 'から';
    if (n === 1) return '予約中の「' + title + '」は明日' + hm(eventAt) + 'から';
    return '予約中の「' + title + '」まであと' + n + '日（' + mdw(eventAt) + '）';
  }
  var E4 = byId(EVENTS, 'e4');
  var N_EVENT_AT = T(0, 8, 0);
  var NOTICES = [
    N('n1', 'reply', DEMO.g2MsgAt, '運営から返信：案件「アプリのテストユーザー」の面談の候補', '#/messages'),
    N('n2', 'event_before', N_EVENT_AT, untilText(E4.title, E4.at, N_EVENT_AT), '#/events/e4'),
    N('n3', 'new_course', AI5_AT, '「AI活用」に第5回が追加されました', '#/courses/ai'),
    N('n4', 'thanks', D(-1, 21, 30), '比嘉 ゆいさんがあなたのコメントに「ありがとう」', '#/feed/q8?c=c-d1'),
    N('n5', 'comment', byId(FEED, 'q3').replies[1].at, '岡田 悠斗さんがあなたのコメントに返信しました', '#/feed/q3?c=' + byId(FEED, 'q3').replies[1].id),
    N('n6', 'new_gig', D(-2, 10, 30), '新着案件：LINE公式アカウントの初期設定代行（Lv4から）', '#/gigs/g12'),
    N('n7', 'reply', DEMO.companyReplyAt, '運営から返信：会社への届け出の件', '#/messages'),
    N('n8', 'thanks', D(-5, 22, 40), '石井 亮さんがあなたのコメントに「ありがとう」', '#/feed/q5?c=c-d3'),
    N('n9', 'referral', plus(D(-6, 20, 0), 5), '紹介リンクから1名が入会しました（報酬は30日後に確定）', '#/referral'),
    N('n10', 'reply', DEMO.meetBookedAt, '運営から返信：面談の予約が取れました', '#/messages'),
    N('n11', 'new_course', D(-12, 11, 0), '「動画編集」に第6回が追加されました', '#/courses/video'),
    N('n12', 'gig', D(-11, 20, 0), '案件「商品モニター」が完了しました。報酬の明細が出ています', '#/gigs/g1'),
    N('n13', 'reply', THREAD[3].at, '運営から返信が届きました', '#/messages'),
    N('n14', 'event_before', plus(PE2_AT, -30), '30分後に「SNS初心者勉強会：最初の10投稿」が始まります', '#/events'),
    N('n15', 'referral', plus(D(-17, 20, 0), 5), '紹介リンクから1名が入会しました（報酬は30日後に確定）', '#/referral'),
    N('n16', 'event_before', D(dayDiff(PE1_AT) - 1, 19, 0), '明日20:00から「新入生オリエンテーション」', '#/events'),
    N('n17', 'comment', D(-22, 23, 10), '自己紹介の投稿にコメントが届きました', '#/feed/my1'),
    N('n18', 'billing', plus(JOINED, 1), mon(JOINED) + '月分の領収書を発行しました（' + yen(SITE.price) + '）', '#/account')
  ];

  /* 在籍半年の会員のお知らせ */
  var NOTICES_VETERAN = [
    N('v1', 'reply', THREAD_VETERAN[THREAD_VETERAN.length - 1].at, '講師から返信：案件「ショート動画の編集」の面談の候補', '#/messages'),
    N('v2', 'event_before', N_EVENT_AT, untilText(byId(EVENTS, 'e6').title, byId(EVENTS, 'e6').at, N_EVENT_AT), '#/events/e6'),
    N('v3', 'reward_confirmed', ago(110), '紹介報酬が1件確定しました', '#/referral'),
    N('v4', 'thanks', D(-4, 22, 20), 'さとみ（横浜・2児ママ）さんがあなたのコメントに「ありがとう」', '#/feed/p17?c=p17-r2'),
    N('v5', 'gig', D(-5, 10, 30), mon(D(-35)) + '月分の作業報告を受け取りました（飲食店のInstagram投稿代行）', '#/gigs/g4'),
    N('v6', 'new_gig', D(-2, 10, 30), '新着案件：LINE公式アカウントの初期設定代行（Lv4から）', '#/gigs/g12'),
    N('v7', 'billing', plus(lastBill(VETERAN.joinedAt), 1), mon(lastBill(VETERAN.joinedAt)) + '月分の領収書を発行しました（' + yen(SITE.price) + '）', '#/account'),
    N('v8', 'comment', D(-6, 22, 30), '前田 えりさんがあなたの投稿にコメントしました', '#/feed/p18?c=p18-r2'),
    N('v9', 'referral', D(-12, 20, 5), '紹介リンクから1名が入会しました（報酬は30日後に確定）', '#/referral')
  ];

  /** 入会したての会員のお知らせ（入会の時刻から作る） */
  function freshNotices(joinedAt) {
    var e1 = byId(EVENTS, 'e1');
    return [
      N('f1', 'system', plus(joinedAt, 3), 'LINEと連携すると、返信やイベントの前日に通知が届きます', '#/account?focus=line'),
      N('f2', 'event_before', plus(joinedAt, 2), '新入生オリエンテーションは' + mdw(e1.at) + ' ' + hm(e1.at) + 'から（予約はイベントのページ）', '#/events/e1'),
      N('f3', 'billing', plus(joinedAt, 1), '領収書を発行しました（' + mon(joinedAt) + '月分・' + yen(SITE.price) + '）', '#/account')
    ];
  }
  /** 人ごとのお知らせの一覧（store の state を渡す） */
  function noticesFor(s) {
    if (!s) return [];
    if (s.kind === 'demo') return NOTICES.slice();
    if (s.kind === 'veteran') return NOTICES_VETERAN.slice();
    return freshNotices((s.me && s.me.joinedAt) || CLG.now().toISOString());
  }

  /* ---------- コミュニティのルール ---------- */
  var RULES_TITLE = 'コミュニティのルール';
  var RULES = [
    '人を否定しない。質問に「そんなことも知らないの」は無し。',
    '会員どうしの勧誘・営業はしない（案件ページの「会員どうし」を使う）。',
    '紹介するときは、会費・解約の条件をそのまま伝える。「必ず稼げる」とは言わない。',
    'SNSで紹介するときは、紹介報酬があることを「#PR」などで分かるようにする。',
    '講座・勉強会の録画の中身は外に出さない。'
  ];

  /* ---------- ヘルプ（よくある質問） ---------- */
  var HELP_CATS = ['使い方', '支払い', '解約', '案件', '紹介'];
  var perRef = yen(Math.round(SITE.price * REFERRAL.rate));
  var HELP = [
    { id: 'h1', cat: '使い方', q: '会員番号はどこで分かりますか？', a: '入会のときのメールに書いてあります。ログインしたあとは、会員証とアカウントの画面でも見られます。' },
    { id: 'h2', cat: '使い方', q: 'パスワードを忘れました', a: 'ログイン画面の「パスワードを忘れた方」から、登録のメールアドレスに再設定のリンクを送れます。リンクは24時間有効です。' },
    { id: 'h3', cat: '使い方', q: '講座はどの順番で見ればいいですか？', a: '入会したらオリエンテーション（4回・30分）から見てください。講座はレベルが上がると開き、講座の中は1回ずつ順に開きます。' },
    { id: 'h4', cat: '使い方', q: '動画が止まる・音が出ない', a: 'ページを読み込み直してください。直らなければ、使っている機種とブラウザを「相談・メッセージ」で教えてください。' },
    { id: 'h5', cat: '使い方', q: 'LINEやメールの通知を止めたい', a: 'アカウントの「通知」で、種類ごとにLINEとメールを切り替えられます。お支払いのメールだけは止められません。' },
    { id: 'h6', cat: '使い方', q: '運営への質問はいつ返ってきますか？', a: SITE.replySla + '。受付時間は' + SITE.contactHours + 'です。' },
    { id: 'h24', cat: '使い方', q: 'ミュートした人を元に戻したい', a: 'アカウントの「ミュート中の人」で「ミュートをやめる」を押します。その人の投稿とコメントが、またタイムラインに出ます。' },
    { id: 'h25', cat: '使い方', q: '自分の記録を書き出したい・消したい', a: 'アカウントの「記録の書き出しと削除」から申し込めます。書き出しはファイルができたら保存できます。削除は会員期間が終わったあとに行います。解約とは別の手続きです。' },
    { id: 'h7', cat: '支払い', q: '支払い方法は？', a: 'クレジットカードです（Visa・Mastercard・JCB・American Express）。決済はStripeで行います。' },
    { id: 'h8', cat: '支払い', q: '請求日はいつですか？', a: '入会した日が毎月の請求日です。31日に入会した場合、31日がない月は月末に請求します。' },
    { id: 'h9', cat: '支払い', q: '領収書はもらえますか？', a: 'アカウントの「請求と領収書」から、月ごとの領収書をダウンロードできます。' },
    { id: 'h10', cat: '支払い', q: 'カードの支払いができなかったときは？', a: 'メールでお知らせします。' + SITE.graceDays + '日以内にカードを更新してください。そのあいだも会員ページは使えます。' },
    { id: 'h11', cat: '支払い', q: '会費は経費にできますか？', a: '事業の内容によります。経費にできるかは、提携の税理士に無料で相談できます（初回30分）。' },
    { id: 'h12', cat: '解約', q: '解約の方法は？', a: 'アカウントの「解約の手続き」から、2回押せば終わります。電話や面談はいりません。' },
    { id: 'h13', cat: '解約', q: '解約したらいつまで使えますか？', a: '次の請求日の前日まで使えます。日割りの返金はありません。' },
    { id: 'h14', cat: '解約', q: '最低契約期間はありますか？', a: 'ありません。いつでも解約できます。' },
    { id: 'h15', cat: '解約', q: '解約したあと、記録は残りますか？', a: '見終えた講座や投稿の記録は、会員期間が終わってから1年間残ります。そのあいだに再入会すると、続きから使えます。' },
    { id: 'h16', cat: '案件', q: '案件の報酬はいつ受け取れますか？', a: '案件ごとに書いてあります。多くは月末締め・翌月末払いです。振込先はアカウントで登録します。' },
    { id: 'h17', cat: '案件', q: '報酬に税金はかかりますか？', a: '会社員の場合、副業の所得が年20万円を超えると確定申告が必要です。住民税の申告は金額にかかわらず必要です。「お金と税金の基礎」の第1回で説明しています。' },
    { id: 'h18', cat: '案件', q: '応募できない案件があるのはなぜ？', a: 'レベルか、講座の修了が条件になっている案件です。案件のページに、何をすれば応募できるかが書いてあります。' },
    { id: 'h19', cat: '案件', q: '会員どうしの案件で困ったときは？', a: '案件のやりとりは、運営も見られるスレッドで行います。困ったときは「相談・メッセージ」で運営に知らせてください。' },
    { id: 'h20', cat: '紹介', q: '紹介の報酬のしくみは？', a: '紹介した人が入会すると、その人が会員でいるあいだ、月額の' + Math.round(REFERRAL.rate * 100) + '%（' + perRef + '）を毎月お支払いします（試作版の仮の条件です）。初回の決済から' +
      REFERRAL.holdDays + '日は保留で、返金・解約がなければ確定します。紹介した人がさらに紹介しても、あなたへの報酬はありません。' },
    { id: 'h21', cat: '紹介', q: '紹介するときのルールは？', a: '報酬があることを最初に伝えてください。SNSでは「#PR」を入れます。「必ず稼げる」のような言い方はしません。' },
    { id: 'h22', cat: '紹介', q: '報酬はいつ振り込まれますか？', a: '月末に締めて、翌月' + REFERRAL.payDay + '日にお支払いします（土日は翌営業日）。' + yen(REFERRAL.minPayout) + '未満は翌月に繰り越します。' },
    { id: 'h23', cat: '紹介', q: '紹介した人の名前は見えますか？', a: '頭文字だけ表示します（例：S.さん）。' }
  ];
  /* 答えの下に出す「次にすること」のリンク（help.js がこれを出す。運営画面のよくある質問の編集でも見える） */
  var HELP_LINKS = {
    h1: ['#/card', '会員証を見る'], h2: ['#/account?focus=password', 'パスワードを変える'], h3: ['#/start', 'スタートガイドを見る'],
    h4: ['#/messages?kind=' + encodeURIComponent('質問'), '運営に聞く'], h5: ['#/account?focus=notify', '通知の設定を開く'],
    h6: ['#/messages', '相談・メッセージを開く'], h7: ['#/account?focus=card', 'カードを見る'], h8: ['#/account?focus=plan', '契約を見る'],
    h9: ['#/account?focus=invoices', '領収書を見る'], h10: ['#/account?focus=card', 'カードを更新する'], h11: ['#/perks?tab=experts', '専門家を見る'],
    h12: ['#/account/cancel', '解約の手続きへ'], h13: ['#/account?focus=plan', '契約を見る'], h16: ['#/account?focus=bank', '振込先を見る'],
    h17: ['#/lesson/money-tax/mt-1', '第1回を見る'], h18: ['#/gigs', '案件を見る'],
    h19: ['#/messages?kind=' + encodeURIComponent('相談したい'), '運営に相談する'], h20: ['#/referral', '紹介を見る'], h21: ['#/referral', '紹介を見る'],
    h22: ['#/account?focus=bank', '振込先を見る'], h24: ['#/account?focus=mutes', 'ミュート中の人を見る'], h25: ['#/account?focus=data', '記録の書き出しと削除へ']
  };
  HELP.forEach(function (h) { var l = HELP_LINKS[h.id]; if (l) h.link = { href: l[0], label: l[1] }; });

  /* ---------- 通知の種類（アカウントの「通知」）。line / email は最初の設定 ---------- */
  var NOTIFY_TYPES = [
    { id: 'reply',            name: '運営からの返信',             line: true,  email: true },
    { id: 'event_before',     name: '予約したイベントの前日',       line: true,  email: true },
    { id: 'event_30min',      name: '予約したイベントの30分前',     line: true,  email: false },
    { id: 'new_course',       name: '新しい講座・勉強会の録画',     line: true,  email: false },
    { id: 'new_gig',          name: '新しい案件',                 line: true,  email: false },
    { id: 'comment_thanks',   name: '自分の投稿へのコメントと「ありがとう」', line: false, email: false },
    { id: 'reward_confirmed', name: '紹介報酬の確定',              line: true,  email: true },
    { id: 'billing',          name: 'お支払い・領収書',            line: false, email: true, fixed: true }   // 止められない（法律上の通知を含むため）
  ];

  /* ---------- メールとLINEの文面（管理画面の「送る文面」と、試作版の再現に使う） ----------
     {name} 会員の名前 / {no} 会員番号 / {site} サービス名 / {url} 開く先 / {date} 日時 / {event} イベント名 / {amount} 金額 / {until} 期限 / {text} 本文 */
  var FOOT = '\n\n――\n' + SITE.name + (SITE.note ? '（' + SITE.note + '）' : '') + ' 運営事務局\n問い合わせ：会員ページの「相談・メッセージ」（' + SITE.contactHours + '）';
  var MAIL_TEMPLATES = {
    welcome: { name: '入会完了とログインの案内',
      email: { subject: '【' + SITE.name + '】入会の手続きが終わりました（会員番号 {no}）',
        body: '{name}さん\n\n' + SITE.name + 'への入会、ありがとうございます。\n会員番号：{no}\n\n下のリンクからパスワードを決めて、会員ページに入ってください（リンクは24時間有効です）。\n{url}\n\n' +
          '最初にオリエンテーション（4回・30分）を見てください。' + FOOT },
      line: { text: '{name}さん、入会ありがとうございます。会員番号は {no} です。パスワードの設定はメールのリンクからどうぞ。' } },
    set_password: { name: 'パスワード設定',
      email: { subject: '【' + SITE.name + '】パスワードを決めてください',
        body: '{name}さん\n\n会員ページのパスワードがまだ決まっていません。下のリンクから決めてください（24時間有効）。\n{url}' + FOOT },
      line: { text: 'パスワードの設定がまだです。メールのリンクから決めてください。' } },
    reset: { name: 'パスワードの再設定',
      email: { subject: '【' + SITE.name + '】パスワードの再設定',
        body: '{name}さん\n\nパスワードの再設定を受け付けました。下のリンクから新しいパスワードを決めてください（24時間有効）。\n{url}\n\n心当たりがなければ、このメールは捨ててください。パスワードは変わりません。' + FOOT },
      line: { text: 'パスワードの再設定のリンクをメールで送りました。' } },
    payment_failed: { name: '決済の失敗',
      email: { subject: '【' + SITE.name + '】お支払いができませんでした',
        body: '{name}さん\n\n{date}の月額（{amount}）のお支払いができませんでした。\n{until}までに、会員ページの「アカウント」→「契約とお支払い」からカードを更新してください。\n{url}\n\n' +
          'それまでは会員ページをいつもどおり使えます。' + FOOT },
      line: { text: 'お支払いができませんでした。{until}までにカードを更新してください。' } },
    cancel_received: { name: '解約の受付',
      email: { subject: '【' + SITE.name + '】解約を受け付けました',
        body: '{name}さん\n\n解約を受け付けました。{until}まで会員ページを使えます。その日で会員期間が終わり、以降の請求はありません。\n\n' +
          '見終えた講座や投稿の記録は1年間残ります。取り消しは{until}まで、会員ページの「アカウント」からできます。' + FOOT },
      line: { text: '解約を受け付けました。{until}まで使えます。' } },
    event_day_before: { name: 'イベントの前日',
      email: { subject: '【' + SITE.name + '】明日は「{event}」です',
        body: '{name}さん\n\n予約中の「{event}」は明日{date}からです。\n参加のしかたと会場（オフ会のとき）は、イベントのページに出ています。\n{url}' + FOOT },
      line: { text: '明日{date}から「{event}」です。くわしくはイベントのページで。' } },
    event_30min: { name: 'イベントの30分前',
      email: { subject: '【' + SITE.name + '】30分後に「{event}」が始まります',
        body: '{name}さん\n\n「{event}」は30分後に始まります。参加のリンクはイベントのページに出ています。\n{url}' + FOOT },
      line: { text: '30分後に「{event}」が始まります。参加のリンクはイベントのページです。' } },
    staff_reply: { name: '運営からの返信',
      email: { subject: '【' + SITE.name + '】運営から返信が届きました',
        body: '{name}さん\n\n運営から返信が届いています。\n\n{text}\n\n続きは会員ページの「相談・メッセージ」でどうぞ。\n{url}' + FOOT },
      line: { text: '運営から返信が届きました。会員ページの「相談・メッセージ」で見られます。' } },
    reward_confirmed: { name: '紹介報酬の確定',
      email: { subject: '【' + SITE.name + '】紹介報酬が確定しました',
        body: '{name}さん\n\n紹介報酬（{amount}）が確定しました。月末に締めて、{date}にお支払いします。\n明細は会員ページの「紹介」で見られます。\n{url}' + FOOT },
      line: { text: '紹介報酬（{amount}）が確定しました。{date}にお支払いします。' } }
  };

  CLG.DATA = {
    SITE: SITE, LEVELS: LEVELS, XP: XP, QUIZ_PASS: QUIZ_PASS, FACULTIES: FACULTIES, COURSES: COURSES, ARCHIVE: ARCHIVE,
    PEOPLE: PEOPLE, MEMBER: MEMBER, VETERAN: VETERAN, ROSTER: ROSTER, ROSTER_INDEX: ROSTER_INDEX, genRoster: genRoster,
    ONBOARDING: ONBOARDING, FEED: FEED, DEMO_POSTS: DEMO_POSTS, INTRO_TEMPLATE: INTRO_TEMPLATE,
    GIGS: GIGS, GIGS_CLOSED: GIGS_CLOSED, GIG_TYPES: GIG_TYPES, EVENTS: EVENTS, EVENT_IMG: EVENT_IMG, PAST_EVENTS: PAST_EVENTS,
    REFERRAL: REFERRAL, REFERRED: REFERRED, REF_CLICKS: REF_CLICKS, SHARE_TEMPLATE: SHARE_TEMPLATE,
    POINT_RULES: POINT_RULES, RANKING: RANKING, RANK_TOTAL: RANK_TOTAL, RANK_PRIZES: RANK_PRIZES,
    PERKS: PERKS, EXPERTS: EXPERTS, THREAD: THREAD, THREAD_VETERAN: THREAD_VETERAN, DEMO: DEMO,
    MESSAGE_KINDS: MESSAGE_KINDS, AUTO_REPLIES: AUTO_REPLIES,
    NOTICES: NOTICES, NOTICES_VETERAN: NOTICES_VETERAN, freshNotices: freshNotices, noticesFor: noticesFor,
    RULES: RULES, RULES_TITLE: RULES_TITLE, HELP: HELP, HELP_CATS: HELP_CATS, NOTIFY_TYPES: NOTIFY_TYPES, MAIL_TEMPLATES: MAIL_TEMPLATES,
    D: D, ago: ago, T: T, lastDow: lastDow, nthDow: nthDow, nextDow: nextDow, prevDow: prevDow, staffAfter: staffAfter, satBack: satBack,
    md: md, mdw: mdw, hm: hm, dayDiff: dayDiff, levelOf: levelOf, addMonths: addMonths, lastBill: lastBill, rng: rng, aiWeek: aiWeek,
    refreshContent: refreshContent,
    // 運営が直したお知らせ（store.js が state.cms から入れる。domain.js の notices() が読む）
    NOTICE_EDITS: {}, CMS_NOTICES: []
  };
})(window);
