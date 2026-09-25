/* ============================================================
   運営画面の保存とデモのデータ（CLG.admin.db / CLG.admin.data / CLG.admin.ops）
   ------------------------------------------------------------
   運営画面だけが持つもの（受信箱・支払い・紹介報酬の支払い・確認待ちの列・操作の記録）は、
   会員ページとは別のキー（terakoya-admin-v1）に保存する。会員ページの保存（CLG.store）には混ぜない。
   デモ会員（高橋さくら・木村あや・入会したての会員）の分だけは、CLG.store と CLG.rules を
   そのまま読み書きする。運営画面で R.staffReply などを呼ぶと、開いている会員ページのタブが描き直る。

   ■ 名簿の元は DATA.ROSTER（genRoster(312) で作った名簿。会員ページのランキングと同じもの）。
     名簿の行そのものは保存しない（毎回 data.js から作る）。運営が変えたところだけ db.members[会員番号] に持つ。

   ■ 日付：デモのデータは作った日の「いま」から相対で作る。別の日に開いたら、保存した日付を日数ぶん
     まとめてずらす（shift）。「3日前の未返信」は、いつ開いても3日前のまま。

   ■ db（AD.db.state）の形。足すのはよいが、名前は変えない
   { v, seedDate（YYYY-MM-DD）, seededAt, session: null|{ staffId, at },
     staff:    [{ id, name, role（代表/運営/講師/経理）, email, person（PEOPLE のid|null）, color, lastLogin, active }],
     members:  { 会員番号: { kana, email, card, cust（Stripe の顧客id）, refCode, referredBy（会員番号|null）,
                            tags[], memo, suspended, suspendedAt?, suspendedBy?, suspendReason?, status?（運営が変えたとき）, cancelReason, cancelAt?, leftAt? } },
                            （suspended と suspendedAt は会員ページの R.loginBlocked も読む）
     payments: [{ id（pi_…）, no, at, amount, status: paid/failed/refunded, card, cust, attempts, receiptNo,
                  failure: null|{ code, label, nextRetryAt }, refund: null|{ at, amount, reason, by }, recovered? }],
     liveRefunds: { 請求のid: { at, by, amount, reason, no } }   … デモ会員の返金をした運営（請求そのものは会員ページの R.invoices）
     threads:  [{ id, no, kind（MESSAGE_KINDS か '専門家'）, status: open/doing/done, assignee（staff id|null）, ref?,
                  messages: [{ from: 'member'|staff id, at, text }], notes: [{ by, at, text }] }],
     liveThread: { no（どのデモ会員の印か）, status: null|'doing'|'done', assignee, notes[], doneAt }   … デモ会員のスレッドの運営側の印。
                  会員ページの人を切り替えたら（no が違えば）印はないものとして読む（入会したての人は「完了」から）
     rewards:  [{ id, referrer（会員番号）, referred（会員番号）, initial, month（1始まり）, at（その回の決済日）, amount,
                  confirmAt, closing, payAt, confirmedAt?, confirmedBy?, closedAt?, closeId?（月末に締めた＝支払予定）, paidAt?, paidBy?,
                  voidAt?, voidReason?, flag?（'same_card'） }]
     banks:    { 会員番号: null|{ bank, branch, kind, tail, holder, at } }   … 紹介報酬の振込先（null＝未登録）
     gigApps:  [{ id, gig, no, at, note, status: applied/meeting/active/done/rewarded, updatedAt }]
     peerGigs: [{ id, no, title, desc, reward, payment, remote, place, time, slots, level, closesAt, submittedAt,
                  status: review/open/rejected/closed, reviewedAt?, reviewedBy?, rejectReason? }]
     proposals:[{ id, no, kind:'event', title, at, online, place, cap, fee, desc, sentAt, status: review/approved/rejected, reason? }]
     reports:  [{ id, postId, commentId, reason（R.REPORT_REASONS）, by（会員番号）, at, status: 受付/非表示/注意/対応不要, doneAt?, doneBy? }]
     experts:  [{ id, no, expert（DATA.EXPERTS の id）, at, status（R.EXPERT_STEPS）, text, when, history[{at,status}] }]
     interviews:[{ id, no, at（面談の日時）, bookedAt, status: pending/confirmed/done/canceled }]
     contacts: [{ id, no, at, by, template, text }]   … 新入生への声かけの記録
     meetSlots:{ min, weekly: [{ id, dow, time, staff }], off: [{ at, why }] }   … 面談の枠（会員ページの面談の候補もここから）
     pointGrants:[{ id, at, by, no, rule, pt, why, link, revoked?, revokedAt?, revokeWhy? }]
     notices:  [{ id, at, by, target, targetLabel, text, link, delivered }]   … 運営が出したお知らせ
     audit:    [{ id, at, by, action, label, target:{ type, id, name }, reason, detail }] … 新しいものが先頭 }

   ■ AD.db（保存）
     state                      上の形
     update(fn)                 fn(state) で書き換える → 保存 → 知らせる。fn の戻り値を返す
     on(fn) / off(fn)           変わったとき（別の運営画面のタブで変わったときも）
     ensure(name, make)         A1〜A3 が自分の入れ物を足すとき。無ければ make() で作って保存し、state[name] を返す
     audit({ action, label, target, reason, detail })  操作の記録を先頭に足す（by・at・id はここで付ける）→ 記録
     staff(id?) / staffName(id) いまログインしている運営（id を渡せばその人）
     uid(prefix)                'ad-xxxx' のような id
     reset()                    デモのデータを作り直す（ログインは保つ）   KEY

   ■ AD.data（読むだけ。デモ会員の分は CLG.store からその場で混ぜる。live:true が付く）
     live()                     { kind, no, name, session, row, href(hash) }  いま会員ページにいるデモ会員
     memberHref(hash?)          'member.html?demo=1#/home' のような、デモ会員として会員ページを開くリンク
     members()                  名簿の行（下の形）。 member(no) で1人
       行：{ no, name, kana, person, pref, city, area, job, joinedAt, day（入会何日目）, cohort, cohortKey（2026-09）,
             xp, level, levelName, stepsDone, currentStep（止まっている項目の名前）, lastActive, status, statusLabel,
             cancelAt, leftAt, cancelReason, refCode, referredBy, email, card, cust, tags[], memo, suspended,
             monthPoints, live, kind? }
     STATUS_LABEL               { active:'有効', canceling:'解約予定', past_due:'支払いエラー', left:'終了', paused:'休会中' }
     payments({ no, month（0＝今月・-1＝先月）, status })  新しい順。デモ会員の分は R.invoices() から
     revenue(monthOffset)       { charged, paid, failed, refunded, net, count, failedCount, refundCount }（税込）
     threads() / thread(id)     受信箱。デモ会員のスレッドは id 'live'。{ …, last, lastMember（最後の会員の発言）, waitingSince, live }
     rewards({ referrer })      紹介報酬の明細。status: hold 保留/ready 確定待ち/confirmed 確定/scheduled 支払予定/paid 支払済/void 取消
     queues()                   { gigApps, peerGigs, proposals, reports, experts, interviews }（確認待ちだけでなく全部。live を含む）
     stalled()                  スタートガイドで止まっている新入生（入会30日以内・まだ終えていない人）。重い順
                                why: 'idle'（7日以上動きがない）| 'behind'（入会日数のわりに進んでいない）
     expectedSteps(day)         入会 day 日目に済んでいてほしい項目の数
     weekEvents()               これから7日のイベント（予約数つき）
     metrics()                  ダッシュボードとメニューの数（下の metrics の中身を見る）
     monthKey(d) / inMonth(d, offset)

   ■ AD.ops（書くもの）。会員ページの会員（いま会員ページにいるデモ会員）に効くものは、ここで R.* を通す。
     画面はここを呼び、AU.act の audit には戻り値の audit をそのまま渡す（支払いと会員の詳細で操作の記録がそろうように）
     reply(threadId, text)      返信。'live' は R.staffReply（会員ページのタブに届く）。ほかは db に足す
     setThreadStatus(id, status, assignee?)
     isLive(会員番号)           いま会員ページにいるデモ会員か
     grantPoints(会員番号, ルール, 理由, リンク?) → { ok, grant, entry, audit }   R.grantPoints ＋ pointGrants（rid＝会員ページの記録のid）
     revokePoints(記録のid, 理由) → { ok, grant, audit }   pointGrants の id か、会員ページの記録の id（R.revokePoints も）
     refund(請求のid, 金額?, 理由) → { ok, amount, voided, liveVoided, audit } / { ok:false, error|errors }
                                デモ会員は R.refundInvoice（会員ページの領収書が「返金済み」になりお知らせが届く）。返した人は liveRefunds に。
                                まだ払っていない紹介報酬（この請求の分）は取り消す（voided）。紹介したのがデモ会員なら
                                R.voidReward({ no, at }) で会員ページの明細も取消にする（liveVoided：0 か 1）
     setSuspended(会員番号, on, 理由) → { ok, audit }   ログインを止める・再開する（デモ会員は R.setLoginBlocked も。開いているタブがすぐ変わる）
     dataRequests()             デモ会員の記録の書き出し・削除の申込み（R.dataRequests。新しい順。status：received 受付中・done 済み・canceled）
     completeDataRequest(id) → { ok, request, audit }   受付中の申込みを済みにする（R.completeDataRequest。会員にお知らせ）
     meetSlots(fn)              面談の枠を fn(枠) で直す → 枠。会員ページの面談の候補（R.setMeetingSlots）にも同じ枠を渡す
     cms(kind, obj) / cmsRemove(kind, id) / cmsReorder(kind, ids, group?)   R.cms*（講座・回・録画・案件・福利厚生・イベント・お知らせ。
                                会員ページにすぐ出る）。R が無い・断られたときは { ok:false, error } を返す（画面は運営の記録を残して一言で知らせる）
     cmsError(res)              断られた理由の文（errors の最初の1つ）
     resetLinks()               運営のデモを最初に戻すときに、会員ページの側に書いた運営の中身（CMS・面談の枠・ログインの停止・
                                タイムラインの通報の対応と、R.resetStaffFeed で運営の投稿・固定・隠した投稿とコメント）も戻す
   ============================================================ */
(function (global) {
  'use strict';
  var CLG = global.CLG, DATA = CLG.DATA, store = CLG.store;
  var AD = CLG.admin = CLG.admin || {};
  AD.screens = AD.screens || {};
  // VERSION を上げると、前の形で保存したデモのデータを作り直す（ログインは保つ）。2：記録の時刻を昼間に寄せ、面談を1枠1人にした
  // 3：メールを架空のドメインに・紹介の申し出を応募の列に・声かけをやりとりに・会員ページにいない方のデモ会員の紹介報酬と振込先
  var KEY = 'terakoya-admin-v1', VERSION = 3, carried = null, actCache = null;
  var MIN = 60000, HOUR = 3600000, DAY = 86400000;
  var listeners = [];
  var ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

  function Rl() { return CLG.rules; }
  function now() { return CLG.now(); }
  function nowIso() { return now().toISOString(); }
  function pad(n, w) { var s = String(n); while (s.length < (w || 2)) s = '0' + s; return s; }
  function ymd(d) { d = new Date(d); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function D(days, hh, mm) { return DATA.D(days, hh, mm); }
  function ago(min) { return DATA.ago(min); }
  function plus(x, minutes) { return new Date(new Date(x).getTime() + minutes * MIN).toISOString(); }
  /* 人が動く時間に寄せる。デモのデータは「いま」からの相対で作るので、そのままだと朝に開いたとき
     「4:56 お知らせを出した」「3:31 相談が届いた」のような夜中の記録になってしまうため。
     back：その時間の外なら前へ寄せる（夜中→前の日の夜・夕方）。fwd：後ろへ寄せる（夜→次の日の朝）。どちらも「いま」を越えない */
  var jit = 0;   // 呼んだ順に決まるずらし（「〜日前」がどれも同じ時・分にそろって見えないように）
  function inHours(x, lo, hi, fwd) {
    jit++;
    var sh = ((jit * 37) % 97) * MIN;
    var d = new Date(new Date(x).getTime() + (fwd ? sh : -sh)), h = d.getHours() + d.getMinutes() / 60;
    if (h < lo || h >= hi) {
      var mm = (jit * 23) % 60;
      if (fwd) { if (h >= hi) d.setDate(d.getDate() + 1); d.setHours(Math.ceil(lo) + (jit % 3), mm, 0, 0); }
      else { if (h < lo) d.setDate(d.getDate() - 1); d.setHours(Math.ceil(hi) - 2 - (jit % 3), mm, 0, 0); }
    }
    return new Date(Math.min(d.getTime(), now().getTime() - 5 * MIN)).toISOString();
  }
  function staffAt(x) { return inHours(x, 9.5, 19); }          // 運営の操作は昼間
  function staffFwd(x) { return inHours(x, 9.5, 19, true); }   // 会員の動きのあとの運営の操作（前へ寄せると順番が逆になるもの）
  function memberAt(x) { return inHours(x, 7, 24); }           // 会員の動きは夜中を避ける
  function addMonths(x, n) { return DATA.addMonths(x, n); }
  function byId(list, id) { for (var i = 0; list && i < list.length; i++) if (list[i] && list[i].id === id) return list[i]; return null; }
  function monthKey(d) { d = new Date(d); return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function monthStart(offset) { var n = now(); return new Date(n.getFullYear(), n.getMonth() + (offset || 0), 1); }
  function inMonth(d, offset) {
    if (!d) return false;
    var x = new Date(d), a = monthStart(offset || 0), b = monthStart((offset || 0) + 1);
    return x >= a && x < b;
  }
  /** 入会何日目か（入会日＝1日目） */
  function dayOf(joinedAt) { return DATA.dayDiff(now(), joinedAt) + 1; }
  function levelName(lv) { var l = DATA.LEVELS.filter(function (x) { return x.lv === lv; })[0]; return l ? l.name : ''; }

  /* ---------- 名前の読み（振込先の名義・メールアドレス・紹介コードを作るため） ---------- */
  var FAM_K = { 佐藤: 'サトウ', 鈴木: 'スズキ', 高橋: 'タカハシ', 田中: 'タナカ', 伊藤: 'イトウ', 渡辺: 'ワタナベ', 山本: 'ヤマモト',
    中村: 'ナカムラ', 小林: 'コバヤシ', 加藤: 'カトウ', 吉田: 'ヨシダ', 山田: 'ヤマダ', 佐々木: 'ササキ', 山口: 'ヤマグチ', 松本: 'マツモト',
    井上: 'イノウエ', 木村: 'キムラ', 林: 'ハヤシ', 斎藤: 'サイトウ', 清水: 'シミズ', 山崎: 'ヤマザキ', 森: 'モリ', 池田: 'イケダ',
    橋本: 'ハシモト', 阿部: 'アベ', 石川: 'イシカワ', 山下: 'ヤマシタ', 中島: 'ナカジマ', 石井: 'イシイ', 小川: 'オガワ', 前田: 'マエダ',
    岡田: 'オカダ', 長谷川: 'ハセガワ', 藤田: 'フジタ', 後藤: 'ゴトウ', 近藤: 'コンドウ', 村上: 'ムラカミ', 遠藤: 'エンドウ', 青木: 'アオキ',
    坂本: 'サカモト', 福田: 'フクダ', 太田: 'オオタ', 西村: 'ニシムラ', 藤井: 'フジイ', 金子: 'カネコ', 岡本: 'オカモト', 藤原: 'フジワラ',
    三浦: 'ミウラ', 中野: 'ナカノ', 原田: 'ハラダ', 松田: 'マツダ', 竹内: 'タケウチ', 小野: 'オノ', 田村: 'タムラ', 比嘉: 'ヒガ',
    金城: 'キンジョウ', 大城: 'オオシロ', 宮城: 'ミヤギ', 新垣: 'アラカキ', 玉城: 'タマキ', 島袋: 'シマブクロ', 工藤: 'クドウ',
    菅原: 'スガワラ', 千葉: 'チバ', 菊地: 'キクチ', 佐野: 'サノ', 宮本: 'ミヤモト', 大西: 'オオニシ', 新井: 'アライ', 平良: 'タイラ',
    北村: 'キタムラ', 高田: 'タカダ', 森本: 'モリモト' };
  var GIVEN_K = { さくら: 'サクラ', ゆい: 'ユイ', あかり: 'アカリ', 美咲: 'ミサキ', 葵: 'アオイ', 結衣: 'ユイ', 彩: 'アヤ', 真由美: 'マユミ',
    恵: 'メグミ', 由美: 'ユミ', 智子: 'トモコ', 裕子: 'ユウコ', 麻衣: 'マイ', かおり: 'カオリ', なつみ: 'ナツミ', ひとみ: 'ヒトミ', 愛: 'アイ',
    千尋: 'チヒロ', 舞: 'マイ', 瞳: 'ヒトミ', 沙織: 'サオリ', 理恵: 'リエ', 陽子: 'ヨウコ', 直美: 'ナオミ', 亜希: 'アキ', 早紀: 'サキ',
    みゆき: 'ミユキ', はるか: 'ハルカ', まどか: 'マドカ', 友美: 'トモミ', のぞみ: 'ノゾミ', 綾香: 'アヤカ', 健太: 'ケンタ', 大輔: 'ダイスケ',
    翔: 'ショウ', 拓也: 'タクヤ', 直樹: 'ナオキ', 亮: 'リョウ', 誠: 'マコト', 和也: 'カズヤ', 陽介: 'ヨウスケ', 達也: 'タツヤ', 隆: 'タカシ',
    大樹: 'ダイキ', 慎也: 'シンヤ', 蓮: 'レン', 颯太: 'ソウタ', 剛: 'ツヨシ', 浩二: 'コウジ', 聡: 'サトシ', 淳: 'ジュン', 修: 'オサム',
    ゆか: 'ユカ', りな: 'リナ', ひろし: 'ヒロシ', まい: 'マイ', 翔太: 'ショウタ', ともみ: 'トモミ', 康太: 'コウタ', あや: 'アヤ',
    翔平: 'ショウヘイ', けい: 'ケイ', さとみ: 'サトミ', 悠斗: 'ユウト', 春菜: 'ハルナ', まさと: 'マサト', さや: 'サヤ', えり: 'エリ',
    かな: 'カナ', ひかり: 'ヒカリ', 武: 'タケシ', はな: 'ハナ' };
  var KANA = { キャ: 'kya', キュ: 'kyu', キョ: 'kyo', シャ: 'sha', シュ: 'shu', ショ: 'sho', チャ: 'cha', チュ: 'chu', チョ: 'cho',
    ニャ: 'nya', ニュ: 'nyu', ニョ: 'nyo', ヒャ: 'hya', ヒュ: 'hyu', ヒョ: 'hyo', ミャ: 'mya', ミュ: 'myu', ミョ: 'myo',
    リャ: 'rya', リュ: 'ryu', リョ: 'ryo', ギャ: 'gya', ギュ: 'gyu', ギョ: 'gyo', ジャ: 'ja', ジュ: 'ju', ジョ: 'jo',
    ア: 'a', イ: 'i', ウ: 'u', エ: 'e', オ: 'o', カ: 'ka', キ: 'ki', ク: 'ku', ケ: 'ke', コ: 'ko', サ: 'sa', シ: 'shi', ス: 'su', セ: 'se', ソ: 'so',
    タ: 'ta', チ: 'chi', ツ: 'tsu', テ: 'te', ト: 'to', ナ: 'na', ニ: 'ni', ヌ: 'nu', ネ: 'ne', ノ: 'no', ハ: 'ha', ヒ: 'hi', フ: 'fu', ヘ: 'he', ホ: 'ho',
    マ: 'ma', ミ: 'mi', ム: 'mu', メ: 'me', モ: 'mo', ヤ: 'ya', ユ: 'yu', ヨ: 'yo', ラ: 'ra', リ: 'ri', ル: 'ru', レ: 're', ロ: 'ro', ワ: 'wa', ン: 'n',
    ガ: 'ga', ギ: 'gi', グ: 'gu', ゲ: 'ge', ゴ: 'go', ザ: 'za', ジ: 'ji', ズ: 'zu', ゼ: 'ze', ゾ: 'zo', ダ: 'da', デ: 'de', ド: 'do',
    バ: 'ba', ビ: 'bi', ブ: 'bu', ベ: 'be', ボ: 'bo', パ: 'pa', ピ: 'pi', プ: 'pu', ペ: 'pe', ポ: 'po' };
  /** カタカナ → ローマ字（メールアドレス用。長い音は1字にする：サトウ→sato、ユウコ→yuko） */
  function romaji(k) {
    var out = '', dbl = false;
    for (var i = 0; i < k.length; i++) {
      var one = k.charAt(i), r = KANA[k.substr(i, 2)];
      if (r) i++; else r = KANA[one];
      if (one === 'ッ') { dbl = true; continue; }
      if (!r) continue;
      if (dbl) { r = r.charAt(0) + r; dbl = false; }
      out += r;
    }
    return out.replace(/ou(?![aeiou])/g, 'o').replace(/oo(?![aeiou])/g, 'o').replace(/uu/g, 'u');
  }
  function hira2kata(s) { return String(s || '').replace(/[ぁ-ゖ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) + 0x60); }); }
  /** 本名（表示名が「ゆか｜旭川…」のような人は realName） */
  function realName(m) {
    if (m.person === 'demo') return DATA.MEMBER.name;
    var p = m.person && DATA.PEOPLE[m.person];
    return (p && p.realName) || m.name;
  }
  function reading(name) {
    var p = String(name || '').split(/\s+/);
    var fk = FAM_K[p[0]] || '', gk = GIVEN_K[p[1]] || '';
    return { fam: fk, given: gk, kana: fk && gk ? fk + ' ' + gk : '' };
  }

  /* ---------- 決まった順の乱数 ---------- */
  var ALNUM = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  function sid(r, n) { var s = ''; for (var i = 0; i < n; i++) s += ALNUM.charAt(Math.floor(r() * ALNUM.length)); return s; }
  function pickW(r, list) {
    var sum = list.reduce(function (a, x) { return a + x[1]; }, 0), x = r() * sum;
    for (var i = 0; i < list.length; i++) { x -= list[i][1]; if (x < 0) return list[i][0]; }
    return list[list.length - 1][0];
  }
  function pick(r, list) { return list[Math.floor(r() * list.length)]; }

  /* ---------- 運営の人（ログインできる人）。メールは架空のドメイン（example.jp の下） ---------- */
  var STAFF = [
    { id: 'staff1', person: 'staff1', role: '代表', email: 'd.mori@taisei.example.jp' },
    { id: 'staff2', person: 'staff2', role: '運営', email: 'k.sato@taisei.example.jp' },
    { id: 'staff3', person: 'staff3', role: '講師', email: 'h.aoki@taisei.example.jp' },
    { id: 'staff4', person: 'staff4', role: '講師', email: 'm.kobayashi@taisei.example.jp' },
    { id: 'staff5', person: 'staff5', role: '講師', email: 'k.ishida@taisei.example.jp' },
    // 経理は会員ページに出ない人（PEOPLE にいない）
    { id: 'acct1', person: null, name: '田村 由紀', role: '経理', color: '#5b6b7a', email: 'y.tamura@taisei.example.jp' }
  ];
  var DEMO_STAFF = 'staff2';   // ?demo=1 と「デモのスタッフで入る」で入る人（佐藤 圭・運営）
  /* 面談の毎週の枠（メッセージの「面談の枠」。会員ページの面談の候補もここから作る）。members.js の P.slotCfg の最初の形と同じ */
  var MEET_WEEKLY = [
    { id: 'ms1', dow: 1, time: '21:00', staff: 'staff2' }, { id: 'ms2', dow: 2, time: '21:30', staff: 'staff2' },
    { id: 'ms3', dow: 3, time: '12:15', staff: 'staff3' }, { id: 'ms4', dow: 4, time: '21:00', staff: 'staff2' },
    { id: 'ms5', dow: 6, time: '10:00', staff: 'staff2' }, { id: 'ms6', dow: 6, time: '10:30', staff: 'staff4' }
  ];

  /* 支払いの失敗の理由（Stripe の decline code に合わせた言い方） */
  var FAILURES = [
    { code: 'expired_card', label: 'カードの有効期限切れ' },
    { code: 'insufficient_funds', label: '利用限度額の超過' },
    { code: 'card_declined', label: 'カード会社が決済を断った' }
  ];
  var CANCEL_REASONS = [['料金', 22], ['時間がない', 38], ['内容が合わない', 14], ['目的を達成した', 9], ['その他', 17]];
  var BANKS = {
    北海道: [['北洋銀行', 4], ['北海道銀行', 3], ['ゆうちょ銀行', 2]],
    沖縄県: [['琉球銀行', 4], ['沖縄銀行', 3], ['ゆうちょ銀行', 1]],
    宮城県: [['七十七銀行', 4], ['ゆうちょ銀行', 1]],
    福岡県: [['福岡銀行', 3], ['西日本シティ銀行', 2]],
    '*': [['三菱UFJ銀行', 3], ['三井住友銀行', 3], ['みずほ銀行', 2], ['ゆうちょ銀行', 2], ['楽天銀行', 2], ['住信SBIネット銀行', 1]]
  };
  var NET_BRANCH = { 楽天銀行: ['ジャズ支店', 'サンバ支店', 'ロック支店', 'ワルツ支店'], 住信SBIネット銀行: ['法人第一支店', 'イチゴ支店', 'レモン支店'],
    ゆうちょ銀行: ['〇一八支店', '九〇八支店', '七〇八支店', '二一八支店'] };

  /* ---------- 作る ---------- */
  function build() {
    jit = 0;
    var r = DATA.rng(20260925);
    // 名簿は写しを使う（下で支払いエラーの人を選び直すとき、状態を書き換えるため）
    var roster = DATA.ROSTER.map(function (m) { return Object.assign({}, m); }), n = now(), price = DATA.SITE.price;
    var db = {
      v: VERSION, seedDate: ymd(n), seededAt: n.toISOString(), session: null,
      staff: [], members: {}, payments: [], liveRefunds: {}, threads: [], liveThread: { no: DATA.MEMBER.id, status: null, assignee: DEMO_STAFF, notes: [], doneAt: null },
      rewards: [], banks: {}, gigApps: [], peerGigs: [], proposals: [], reports: [], experts: [], interviews: [], contacts: [],
      pointGrants: [], notices: [], audit: [],
      meetSlots: { min: 15, weekly: MEET_WEEKLY.map(function (w) { return Object.assign({}, w); }), off: [] }
    };
    // デモ会員のスレッドは、いちばん新しいのが運営の「候補を送ります」なので対応中から始める
    db.liveThread.status = 'doing';
    var used = {};   // デモのスレッドなどに一度使った会員
    var PERSONA = {}; PERSONA[DATA.MEMBER.id] = 1; if (DATA.VETERAN) PERSONA[DATA.VETERAN.id] = 1;

    /* 運営の人 */
    STAFF.forEach(function (s, i) {
      var p = s.person ? DATA.PEOPLE[s.person] : null;
      db.staff.push({ id: s.id, person: s.person, name: p ? p.name : s.name, role: s.role, email: s.email, color: p ? p.color : s.color,
        lastLogin: i === 1 ? ago(12) : ago(60 * (6 + i * 9)), active: true });
    });

    /* 会員ごと：読み・メール・カード・Stripe の顧客・紹介コード */
    roster.forEach(function (m) {
      var nm = realName(m), rd = reading(nm);
      var given = romaji(rd.given) || 'member', fam = romaji(rd.fam) || 'tk';
      // 実在のドメインに作ったアドレスを置かない（だれかの本当のアドレスになりうるため）。example.jp とその下だけ
      var dom = pickW(r, [['example.jp', 55], ['mail.example.jp', 25], ['mobile.example.jp', 20]]);
      var shape = r(), num = pad(Math.floor(r() * 9000) + 100, 4);
      var local = shape < .4 ? given + '.' + fam + '.' + num : shape < .7 ? given + num : shape < .85 ? fam + '.' + given : given + '_' + fam + num.slice(-2);
      var brand = pickW(r, [['Visa', 60], ['Mastercard', 25], ['JCB', 12], ['American Express', 3]]);
      var ex = {
        kana: rd.kana, email: local + '@' + dom, card: brand + ' •••• ' + pad(Math.floor(r() * 10000), 4), cust: 'cus_' + sid(r, 14),
        refCode: given.toUpperCase().slice(0, 8) + m.no.slice(-3), referredBy: null, tags: [], memo: '', suspended: false, cancelReason: ''
      };
      if (m.person === 'demo') { ex.email = DATA.MEMBER.email; ex.card = DATA.MEMBER.card; ex.refCode = DATA.MEMBER.refCode; ex.kana = hira2kata(DATA.MEMBER.kana); }
      if (DATA.VETERAN && m.no === DATA.VETERAN.id) { ex.email = DATA.VETERAN.email; ex.card = DATA.VETERAN.card; ex.refCode = DATA.VETERAN.refCode; ex.kana = hira2kata(DATA.VETERAN.kana); }
      if (m.status === 'canceling' || m.status === 'left') ex.cancelReason = pickW(r, CANCEL_REASONS);
      if (m.status === 'canceling') {
        // 会員期間の終わりは、入会日から1か月ごとの請求日の前の日の終わり（名簿の日付が請求の周期とずれていれば、ここでそろえる）
        var k0 = 0; while (addMonths(m.joinedAt, k0 + 1) <= n) k0++;
        var nb = addMonths(m.joinedAt, k0 + 1), end = new Date(nb.getFullYear(), nb.getMonth(), nb.getDate() - 1, 23, 59);
        if (!m.cancelAt || Math.abs(new Date(m.cancelAt) - end) > HOUR) ex.cancelAt = end.toISOString();
      }
      db.members[m.no] = ex;
    });

    /* 紹介（1段だけ）。デモ会員の2人・在籍半年の会員の人は、会員ページの紹介の画面と同じ */
    function noOf(pid) { return DATA.PEOPLE[pid] && DATA.PEOPLE[pid].no; }
    (DATA.REFERRED || []).forEach(function (x) { var no = noOf(x.person); if (no) db.members[no].referredBy = DATA.MEMBER.id; });
    if (DATA.VETERAN) ['m14', 'm19', 'm25', 'm17'].forEach(function (pid) { var no = noOf(pid); if (no) db.members[no].referredBy = DATA.VETERAN.id; });
    var takenRef = {};
    Object.keys(db.members).forEach(function (no) { if (db.members[no].referredBy) takenRef[no] = 1; });
    var refCandidates = roster.filter(function (m) { return !PERSONA[m.no] && m.status === 'active' && m.joinedDaysAgo >= 60; });
    var refCounts = [2, 1, 3, 1, 2, 1, 1, 2, 1, 2, 1, 1, 2, 1, 1, 2];
    var referrers = [];
    for (var i = 0; i < refCounts.length && refCandidates.length; i++) {
      var ref = refCandidates.splice(Math.floor(r() * refCandidates.length), 1)[0];
      var pool = roster.filter(function (m) {
        return !PERSONA[m.no] && !takenRef[m.no] && m.joinedDaysAgo < ref.joinedDaysAgo - 14 && m.no !== ref.no && !referrers.some(function (x) { return x.no === m.no; });
      });
      var got = 0;
      for (var k = 0; k < refCounts[i] && pool.length; k++) {
        var to = pool.splice(Math.floor(r() * pool.length), 1)[0];
        db.members[to.no].referredBy = ref.no; takenRef[to.no] = 1; got++;
      }
      if (got) referrers.push(ref);
    }
    // 同じカードで自分を紹介しているかもしれない1件（紹介報酬の画面で目印を出す）
    var sameCard = null;
    roster.some(function (m) {
      var by = db.members[m.no].referredBy;
      if (!by || PERSONA[by] || m.status !== 'active' || m.joinedDaysAgo > 40) return false;
      db.members[m.no].card = db.members[by].card; sameCard = m.no; return true;
    });

    /* 支払いエラーの3人：入会日から1か月ごとの請求のうち、いちばん新しいものが2日前・4日前・5日前の人を選ぶ
       （猶予の7日の中に入れるため。名簿の「支払いエラー」の人は請求日が入会日とずれるので、運営画面の中では有効に戻す。
        どちらも db.members[会員番号].status に書く＝運営画面の状態。会員ページには出ない） */
    function lastBillOf(m) { var k = 0; while (addMonths(m.joinedAt, k + 1) <= n) k++; return addMonths(m.joinedAt, k); }
    var chosenPD = {};
    [2, 4, 5].forEach(function (d) {
      var m = roster.filter(function (x) {
        return (x.status === 'active' || x.status === 'past_due') && !PERSONA[x.no] && !x.person && !chosenPD[x.no] && x.joinedDaysAgo >= 33 && DATA.dayDiff(n, lastBillOf(x)) === d;
      })[0];
      if (m) chosenPD[m.no] = 1;
    });
    roster.forEach(function (m) {
      if (chosenPD[m.no]) { m.status = 'past_due'; db.members[m.no].status = 'past_due'; }
      else if (m.status === 'past_due') { m.status = 'active'; db.members[m.no].status = 'active'; }
    });

    /* 支払い（入会日から1か月ごと）。支払いエラーの3人は、直近の請求を失敗にする */
    var seq = 0, pastDue = 0;
    roster.forEach(function (m) {
      var ex = db.members[m.no], anchor = new Date(m.joinedAt), list = [];
      for (var k2 = 0; k2 < 12; k2++) {
        var at = addMonths(anchor, k2);
        if (at > n) break;
        if (m.leftAt && at >= new Date(m.leftAt)) break;
        list.push({ id: 'pi_3Q' + sid(r, 22), no: m.no, at: at.toISOString(), amount: price, status: 'paid', card: ex.card, cust: ex.cust,
          attempts: 1, receiptNo: '', failure: null, refund: null });
      }
      if (m.status === 'past_due' && list.length) {
        var last = list[list.length - 1], f = FAILURES[pastDue++ % FAILURES.length];
        // 自動のやり直しは失敗の1・3・5・7日後（Stripe のやり直しの設定）。済んだ回数と、次の日時
        var tries = [1, 3, 5, 7].map(function (d) { return plus(last.at, d * 24 * 60); });
        last.status = 'failed'; last.attempts = 1 + tries.filter(function (t) { return new Date(t) <= n; }).length;
        last.failure = { code: f.code, label: f.label, nextRetryAt: tries.filter(function (t) { return new Date(t) > n; })[0] || null };
      }
      // カードが一度通らず、やり直しで払えたもの（履歴の厚み）
      if (m.status === 'active' && list.length > 2 && r() < 0.03) { list[1].attempts = 2; list[1].recovered = true; }
      Array.prototype.push.apply(db.payments, list);
    });
    db.payments.sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
    db.payments.forEach(function (p) { if (p.status !== 'failed') { seq++; p.receiptNo = 'R' + monthKey(p.at).replace('-', '') + '-' + pad(seq, 5); } });

    /* 返金（理由つき）：二重の請求・更新日の前日の解約の申し出・入会直後の解約 */
    function lastPaid(no) { var l = db.payments.filter(function (p) { return p.no === no && p.status === 'paid'; }); return l[l.length - 1]; }
    var dupTarget = roster.filter(function (m) { return m.status === 'active' && !PERSONA[m.no] && !m.person && m.joinedDaysAgo > 40; }).filter(function (m) {
      var p = lastPaid(m.no); return p && inMonth(p.at, 0) && DATA.dayDiff(n, p.at) >= 3;
    })[0];
    var refunds = [];
    if (dupTarget) {
      var orig = lastPaid(dupTarget.no), ex2 = db.members[dupTarget.no];
      var dup = { id: 'pi_3Q' + sid(r, 22), no: dupTarget.no, at: plus(orig.at, 2), amount: price, status: 'refunded', card: ex2.card, cust: ex2.cust,
        attempts: 1, receiptNo: orig.receiptNo + '-2', failure: null,
        refund: { at: staffFwd(plus(orig.at, 60 * 26)), amount: price, reason: '二重の請求（決済のやり直しで2回引き落とされた）', by: 'acct1' } };
      db.payments.push(dup); refunds.push(dup);
    }
    var lateCancel = roster.filter(function (m) { return m.status === 'left' && !m.person && m.leftAt && DATA.dayDiff(n, m.leftAt) <= 20 && DATA.dayDiff(n, m.leftAt) >= 4; })[0];
    if (lateCancel) {
      var p2 = lastPaid(lateCancel.no);
      if (p2) { p2.status = 'refunded'; p2.refund = { at: staffFwd(plus(p2.at, 60 * 20)), amount: price, reason: '更新日の前日に解約の申し出があった（代表の判断で返金）', by: 'staff1' }; refunds.push(p2); }
    }
    var quick = roster.filter(function (m) { return m.status === 'left' && !m.person && m.joinedDaysAgo < 70 && m.leftAt && DATA.dayDiff(m.leftAt, m.joinedAt) <= 35; })[0];
    if (quick) {
      var p3 = db.payments.filter(function (p) { return p.no === quick.no; })[0];
      if (p3 && p3.status === 'paid') { p3.status = 'refunded'; p3.refund = { at: staffFwd(plus(p3.at, 60 * 30)), amount: price, reason: '入会の翌日に解約の申し出（はじめての請求だけ返金）', by: 'staff1' }; refunds.push(p3); }
    }
    db.payments.sort(function (a, b) { return new Date(b.at) - new Date(a.at); });

    /* 紹介報酬の明細（紹介された人の決済1回ごと）。月末締め・翌月25日払い */
    var RF = DATA.REFERRAL;
    function payDate(closing) {
      var d = new Date(closing.getFullYear(), closing.getMonth() + 1, RF.payDay, 10);
      if (d.getDay() === 6) d.setDate(d.getDate() + 2);
      if (d.getDay() === 0) d.setDate(d.getDate() + 1);
      return d;
    }
    // デモ会員（高橋さくら・木村あや）の紹介の明細も作っておく。会員ページにいる方の人は、読むときに会員ページの記録（R.rewardRows）に置き換える
    // （rewards() が referrer の会員番号で外す）。会員ページにいない方の人も、紹介した会員と明細が運営画面に出るように
    roster.forEach(function (m) {
      var by = db.members[m.no].referredBy;
      if (!by) return;
      var charges = db.payments.filter(function (p) { return p.no === m.no; }).sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
      charges.forEach(function (p, idx) {
        if (RF.model === 'once' && idx > 0) return;
        var confirmAt = new Date(new Date(p.at).getTime() + RF.holdDays * DAY);
        var closing = new Date(confirmAt.getFullYear(), confirmAt.getMonth() + 1, 0, 23, 59);
        var pay = payDate(closing);
        var row = { id: 'rw-' + m.no.slice(3) + '-' + (idx + 1), referrer: by, referred: m.no, initial: (romaji(reading(realName(m)).fam).charAt(0) || 'K').toUpperCase(),
          month: idx + 1, at: p.at, amount: RF.model === 'once' ? RF.onceAmount : Math.round(price * RF.rate),
          confirmAt: confirmAt.toISOString(), closing: closing.toISOString(), payAt: pay.toISOString() };
        if (p.status === 'refunded') { row.voidAt = p.refund.at; row.voidReason = '紹介した方の決済が返金された'; }
        else if (p.status === 'failed') { row.voidAt = p.at; row.voidReason = '紹介した方の決済が失敗した'; }
        else if (m.leftAt && new Date(m.leftAt) < confirmAt) { row.voidAt = m.leftAt; row.voidReason = '紹介した方が' + RF.holdDays + '日以内に退会した'; }
        else if (confirmAt <= n) {
          // 確定の記録は毎週月曜の11:00に、前の週の金曜までに確定できるようになった分をまとめて付けている。
          // まだその月曜が来ていないものは確定待ち
          var batch = new Date(confirmAt.getTime() + 3 * DAY); batch.setHours(11, 0, 0, 0);
          while (batch.getDay() !== 1) batch.setDate(batch.getDate() + 1);
          if (batch <= n) { row.confirmedAt = batch.toISOString(); row.confirmedBy = 'acct1'; }
          if (pay <= n && row.confirmedAt) { row.paidAt = pay.toISOString(); row.paidBy = 'acct1'; }
        }
        if (m.no === sameCard) row.flag = 'same_card';
        if (PERSONA[by]) row.persona = true;
        db.rewards.push(row);
      });
    });
    db.rewards.sort(function (a, b) { return new Date(b.at) - new Date(a.at); });

    /* 振込先：紹介した人。2人は未登録、1人は名義が本人と違う（デモ会員の2人は本人名義で登録済み） */
    var refNos = {}; db.rewards.forEach(function (x) { refNos[x.referrer] = 1; });
    Object.keys(refNos).forEach(function (no, i) {
      var m = DATA.ROSTER_INDEX[no], ex3 = db.members[no];
      if ((i === 3 || i === 9) && !PERSONA[no]) { db.banks[no] = null; return; }
      var bank = pickW(r, BANKS[m.pref] || BANKS['*']);
      var branch = NET_BRANCH[bank] ? pick(r, NET_BRANCH[bank]) : (m.city || m.pref).replace(/市$|区$|町$/, '') + '支店';
      var holder = ex3.kana || 'カイイン';
      if (i === 6 && ex3.kana && !PERSONA[no]) holder = ex3.kana.split(' ')[0] + ' ' + pick(r, ['ヒロシ', 'タカシ', 'マコト']);   // 家族の名義（本人と違う）
      db.banks[no] = { bank: bank, branch: branch, kind: '普通', tail: pad(Math.floor(r() * 10000), 4), holder: holder, at: ago(60 * 24 * (20 + Math.floor(r() * 90))) };
    });

    // 振込先がない人の報酬は払えない（支払日を過ぎていれば、支払予定のまま次の支払いに繰り越している）
    db.rewards.forEach(function (x) { if (x.paidAt && !db.banks[x.referrer]) { delete x.paidAt; delete x.paidBy; } });

    /* 名簿の印とメモ（運営が付けたもの） */
    var TAGS = ['オフ会の世話役', '発表したい', '面談済み', '要フォロー', '講師候補', '紹介の確認中'];
    [['m2', 0, '札幌オフ会の会場（子連れOKのカフェ）を毎回押さえてくれている。'], ['m3', 0, '那覇オフ会の主催。受付は奥さんが手伝っている。'],
     ['m5', 4, 'ノーコードの質問に答えてくれる。講師の打診をするか、10月の打ち合わせで決める。'], ['m12', 1, ''], ['m7', 0, '仙台もくもく会を月1で始めた。'],
     ['m26', 1, ''], ['m21', 4, '']].forEach(function (x) {
      var no = noOf(x[0]); if (!no) return;
      var ex4 = db.members[no]; ex4.tags.push(TAGS[x[1]]); if (x[2]) ex4.memo = x[2];
    });
    if (sameCard) { db.members[sameCard].tags.push(TAGS[5]); db.members[sameCard].memo = '紹介した人とカードの下4桁と地域が同じ。本人の確認を待っている。'; }

    /* ---------- 受信箱（会員から運営へのメッセージ） ---------- */
    function pickMember(test) {
      var list = roster.filter(function (x) { return !used[x.no] && !PERSONA[x.no] && !x.person && test(x); });
      var m = list[Math.floor(r() * list.length)];
      if (m) used[m.no] = 1;
      return m;
    }
    var ACTIVE = function (x) { return x.status === 'active'; };
    var NEW = function (x) { return ACTIVE(x) && x.joinedDaysAgo <= 21 && x.joinedDaysAgo >= 4; };
    var video = byId(DATA.COURSES, 'video'), insta = byId(DATA.COURSES, 'instagram');
    var ori = DATA.EVENTS.filter(function (e) { return e.series === 'orientation'; })[0];
    function slotsText() {
      var a = DATA.nextDow(1, 21, 2), b = DATA.nextDow(2, 21.5, 2), c = DATA.nextDow(6, 10, 2);
      return [a, b, c].sort(function (x, y) { return new Date(x) - new Date(y); }).map(function (x) { return '・' + DATA.mdw(x) + ' ' + DATA.hm(x); }).join('\n');
    }
    var cancelOne = roster.filter(function (x) { return x.status === 'canceling' && !x.person; })[0];
    var TH = [
      // 未返信
      { test: function (x) { return ACTIVE(x) && x.level >= 3; }, kind: '講座の質問', status: 'open', ref: video ? 'lesson:video/' + video.lessons[1].id : '',
        m: [['m', 31 * 60 + 12, '「動画編集」第2回のカットの練習で、タイムラインに動画が出てこなくなりました。CapCutは最新にしています。スマホはiPhone 12です。']] },
      { test: function (x) { return ACTIVE(x) && x.joinedDaysAgo > 60; }, kind: '質問', status: 'open',
        m: [['m', 27 * 60 + 40, '紹介リンクをInstagramのプロフィールに載せてもいいですか？ #PRはどこに入れればいいでしょうか。']] },
      { test: function (x) { return ACTIVE(x) && x.pref === '北海道'; }, kind: 'その他', status: 'open',
        m: [['m', 25 * 60 + 5, '札幌オフ会の写真をタイムラインに載せたいです。写っている人には、どうやって許可を取ればいいですか？']] },
      { test: NEW, kind: '面談の予約', status: 'open',
        m: [['m', 5 * 60 + 20, 'スタートガイドの面談をお願いします。平日は20時以降なら空いています。']] },
      { test: function (x) { return ACTIVE(x) && x.level >= 3 && x.joinedDaysAgo > 90; }, kind: '相談したい', status: 'open',
        m: [['m', 2 * 60 + 10, '飲食店のInstagram投稿代行の見積もりで、写真の撮影も頼まれました。撮影の分は別に見積もっていいのでしょうか。']] },
      { test: function (x) { return ACTIVE(x) && /自営業|フリーランス/.test(x.job); }, kind: '質問', status: 'open',
        m: [['m', 38, '領収書の宛名を屋号にできますか？ 経費にできるかは税理士さんに聞いているところです。']] },
      // 対応中
      // 支払いエラーのうち「カードの有効期限切れ」の人（更新すればその場で請求をやり直すので、更新できずに困っている相談）
      { test: function (x) { return x.status === 'past_due' && db.payments.some(function (p) { return p.no === x.no && p.failure && p.failure.code === 'expired_card'; }); },
        kind: '質問', status: 'doing', assignee: 'acct1',
        m: [['m', 26 * 60, 'カードの期限が切れていました。アカウントの画面から新しいカードを入れたのですが、エラーが出て更新できません。'],
            ['acct1', 23 * 60, function (x) {
              // 猶予の終わり（失敗した請求の日から graceDays 日）を、その人の請求から書く
              var f = db.payments.filter(function (p) { return p.no === x.no && p.status === 'failed'; })[0];
              var until = f ? DATA.md(plus(f.at, (DATA.SITE.graceDays || 7) * 24 * 60)) + 'までは' : '猶予のあいだは';
              return 'お手数をおかけします。カード会社の確認画面（本人認証）で止まっていることが多いです。もう一度試して、だめならこちらからカードを更新するリンクを送ります。' + until + '会員ページをいつもどおり使えます。';
            }]],
        notes: [['acct1', 22 * 60, '明日の昼にカードが更新できたか見る。だめなら Customer Portal のリンクを送る']] },
      { test: function (x) { return ACTIVE(x) && x.joinedDaysAgo > 30; }, kind: '専門家', status: 'doing', assignee: 'staff2',
        m: [['m', 3 * 24 * 60 + 200, '開業届のことで、税理士の中村さんに相談したいです。平日の夜だと助かります。'],
            ['staff2', 2 * 24 * 60 + 80, '中村さんに日程を聞いています。候補が届いたら、ここでお送りします。']],
        notes: [['staff2', 2 * 24 * 60 + 75, '中村先生にメール済み。平日夜の枠を3つ依頼']] },
      { test: NEW, kind: '面談の予約', status: 'doing', assignee: 'staff2',
        m: [['m', 26 * 60 + 30, '面談を予約したいです。'], ['staff2', 21 * 60, '候補です。\n' + slotsText() + '\nどれか選んでください。15分の予定です。']] },
      { test: function (x) { return ACTIVE(x) && x.joinedDaysAgo > 50 && x.joinedDaysAgo < 120; }, kind: '相談したい', status: 'doing', assignee: 'staff4',
        m: [['m', 4 * 24 * 60 + 90, '8月は子どもの夏休みで、講座がほとんど進みませんでした。何から再開すればいいですか。'],
            ['staff4', 3 * 24 * 60 + 300, '続きの回から見るのがいちばん早いです。止まっていた講座は「講座」の画面のいちばん上に出ています。1日1回を目安にどうぞ。']],
        notes: [['staff4', 3 * 24 * 60 + 290, '来週の水曜にもう一度声をかける']] },
      { test: function (x) { return ACTIVE(x) && x.level >= 3; }, kind: '講座の質問', status: 'doing', assignee: 'staff4', ref: insta ? 'lesson:instagram/' + insta.lessons[3].id : '',
        m: [['m', 2 * 24 * 60 + 30, '「Instagram運用」第4回の資料のPDFが開けません。'],
            ['staff4', 2 * 24 * 60 - 200, '資料を差し替えました。もう一度開いてみてください。だめなら画面の写真を送ってください。']] },
      // 完了
      { test: NEW, kind: '質問', status: 'done', assignee: 'staff2',
        m: [['m', 6 * 24 * 60 + 100, 'オリエンテーションの録画はどこで見られますか？'],
            ['staff2', 6 * 24 * 60 - 500, '「講座」の「勉強会の録画」にあります。いちばん上です。' + (ori ? '次の回は' + DATA.mdw(ori.at) + ' ' + DATA.hm(ori.at) + 'からです。' : '')],
            ['m', 6 * 24 * 60 - 1100, '見られました。ありがとうございます。']] },
      { test: function (x) { return ACTIVE(x) && x.joinedDaysAgo > 20; }, kind: '質問', status: 'done', assignee: 'staff2',
        m: [['m', 8 * 24 * 60 + 60, 'お小遣い案件の報酬はいつ振り込まれますか？'],
            ['staff2', 8 * 24 * 60 - 400, '月末に締めて、翌月末にお振り込みします。振込先は「アカウント」から登録できます。']] },
      { test: NEW, kind: '質問', status: 'done', assignee: 'staff2',
        m: [['m', 9 * 24 * 60 + 30, 'LINEの連携で「コードが違います」と出ます。'],
            ['staff2', 9 * 24 * 60 - 600, '連携コードの有効期限は10分です。もう一度「連携を始める」からお試しください。'],
            ['m', 9 * 24 * 60 - 1300, 'できました！']] },
      { test: function (x) { return ACTIVE(x) && x.joinedDaysAgo > 90; }, kind: 'その他', status: 'done', assignee: 'staff1',
        m: [['m', 10 * 24 * 60 + 20, '成果発表会で発表してみたいです。'],
            ['staff1', 10 * 24 * 60 - 700, 'ありがとうございます。成果発表会のページの「発表に申し込む」から申し込めます。1人3分です。']] },
      { test: ACTIVE, kind: '質問', status: 'done', assignee: 'staff2',
        m: [['m', 11 * 24 * 60 + 300, 'パスワードの再設定のメールが届きません。'],
            ['staff2', 11 * 24 * 60 - 120, '迷惑メールのフォルダを見てください。なければ、こちらから送り直します。'],
            ['m', 11 * 24 * 60 - 600, '迷惑メールに入っていました。']] },
      { test: function (x) { return ACTIVE(x) && x.level >= 2; }, kind: '講座の質問', status: 'done', assignee: 'staff3',
        m: [['m', 12 * 24 * 60 + 40, 'ChatGPTの無料版でも、「AI活用」の講座の内容はできますか？'],
            ['staff3', 12 * 24 * 60 - 900, '第1回から第4回は無料版でできます。第5回の一部だけ有料版の機能を使います。']] },
      { test: function (x) { return ACTIVE(x) && x.pref === '北海道'; }, kind: '質問', status: 'done', assignee: 'staff2',
        m: [['m', 13 * 24 * 60 + 10, '札幌のオフ会に子どもを連れて行っても大丈夫ですか？'],
            ['staff2', 13 * 24 * 60 - 800, '連れて来られます。札幌は子連れOKの会場で、キッズスペースもあります。']] },
      { test: function (x) { return cancelOne ? x.no === cancelOne.no : x.status === 'canceling'; }, kind: 'その他', status: 'done', assignee: 'staff2',
        m: [['m', 3 * 24 * 60 + 500, '解約の手続きをしました。いままでありがとうございました。'],
            ['staff2', 3 * 24 * 60 - 200, 'ご連絡ありがとうございます。' + (cancelOne && cancelOne.cancelAt ? DATA.md(cancelOne.cancelAt) + 'までは' : '期間の終わりまで') + '今までどおり使えます。記録は1年残るので、また戻るときは続きからどうぞ。']] },
      { test: function (x) { return referrers.some(function (y) { return y.no === x.no; }); }, kind: '質問', status: 'done', assignee: 'staff2',
        m: [['m', 5 * 24 * 60 + 60, '紹介した友人が入会しましたが、紹介の画面にまだ出ていません。'],
            ['staff2', 5 * 24 * 60 - 300, '入会の翌日に反映されます。確認したところ、今朝反映されていました。'],
            ['m', 5 * 24 * 60 - 700, '出ていました。']] },
      { test: function (x) { return ACTIVE(x) && x.level >= 3 && x.joinedDaysAgo > 100; }, kind: '質問', status: 'done', assignee: 'staff5',
        m: [['m', 7 * 24 * 60 + 90, '業務委託の案件の請求書は、どこに出せばいいですか？'],
            ['staff5', 7 * 24 * 60 - 350, '運営が出している案件は、請求書はいりません。月末に作業報告を出してもらえれば、運営から支払いの明細を出します。']] }
    ];
    TH.forEach(function (t, i) {
      var m = pickMember(t.test) || pickMember(ACTIVE);
      if (!m) return;
      // 会員が送った時刻が入会より前にならないように（入会したての人は短くする）
      var maxAgo = Math.max(60, (DATA.dayDiff(n, m.joinedAt) + 0.5) * 24 * 60 - 60);
      var scale = t.m[0][1] > maxAgo ? maxAgo / t.m[0][1] : 1;
      // 会員は夜中を避け、運営の返信は昼間に。順番は崩さない（前の発言より3分以上あと・いまより前）
      var prevAt = 0, nowMs = n.getTime();
      var msgs = t.m.map(function (x) {
        var raw = ago(Math.round(x[1] * scale)), at = x[0] === 'm' ? memberAt(raw) : staffFwd(raw);
        var ms = Math.min(Math.max(new Date(at).getTime(), prevAt + 3 * MIN), nowMs - MIN);
        prevAt = ms;
        return { from: x[0] === 'm' ? 'member' : x[0], at: new Date(ms).toISOString(), text: typeof x[2] === 'function' ? x[2](m) : x[2] };
      });
      var lastAt = new Date(msgs[msgs.length - 1].at).getTime();
      db.threads.push({
        id: 'th' + pad(i + 1), no: m.no, kind: t.kind, status: t.status, assignee: t.assignee || null, ref: t.ref || '',
        doneAt: t.status === 'open' ? null : msgs[msgs.length - 1].at, messages: msgs,
        notes: (t.notes || []).map(function (x) {
          var at = Math.min(Math.max(new Date(staffFwd(ago(Math.round(x[1] * scale)))).getTime(), lastAt + MIN), nowMs - MIN);
          return { by: x[0], at: new Date(at).toISOString(), text: x[2] };
        })
      });
    });

    /* ---------- 確認待ちの列 ---------- */
    var gigById = function (id) { return byId(DATA.GIGS, id) || byId(DATA.GIGS_CLOSED, id); };
    var APPS = [['g1', 'applied', 1], ['g1', 'applied', 3], ['g1', 'active', 9], ['g2', 'applied', 2], ['g2', 'meeting', 4], ['g2', 'meeting', 5],
      ['g4', 'applied', 1], ['g4', 'meeting', 6], ['g4', 'active', 20], ['g5', 'applied', 2], ['g5', 'active', 16], ['g6', 'meeting', 3],
      ['g6', 'active', 30], ['g6', 'active', 41], ['g12', 'applied', 1], ['g14', 'applied', 2], ['g14', 'applied', 4], ['g16', 'applied', 1],
      // 終わった案件の応募は、募集していたあいだの日付（gc7 は5日前・gc4 は12日前・gc2 は26日前に締め切った）
      ['gc7', 'done', 14], ['gc2', 'rewarded', 38], ['gc4', 'done', 18]];
    var NOTES = ['平日の夜なら作業できます。', 'スマホだけで大丈夫でしょうか。', '前職で近い作業をしていました。', '週に5時間くらい使えます。',
      '講座の第4回まで見ました。', '初めての応募です。よろしくお願いします。'];
    APPS.forEach(function (a, i) {
      var g = gigById(a[0]); if (!g) return;
      var m = roster.filter(function (x) {
        return x.status === 'active' && !PERSONA[x.no] && x.level >= (g.level || 1) && (a[0] !== 'g16' || x.pref === '沖縄県') && !db.gigApps.some(function (y) { return y.no === x.no; });
      })[Math.floor(r() * 40)];
      if (!m) return;
      var at = memberAt(ago(a[2] * 24 * 60 - Math.floor(r() * 600)));
      db.gigApps.push({ id: 'ap' + pad(i + 1), gig: g.id, no: m.no, at: at, note: pick(r, NOTES), status: a[1], updatedAt: a[1] === 'applied' ? at : staffFwd(plus(at, 60 * 24)) });
    });
    /* 紹介できるサービスへの申し出（紹介の申し出 → 担当者に引き継ぐ → 商談中 → 成約）。応募と同じ列に入れておくと、
       メニュー・ダッシュボードの「確認待ち」の数と案件の画面の数がそろう。seedRefer の印は案件の画面（gigs.js）が見る */
    (function () {
      var rr = DATA.rng(777), pool = roster.filter(function (m) { return m.status === 'active' && !m.person && !PERSONA[m.no] && m.joinedDaysAgo > 40; });
      function pk() { return (pool.splice(Math.floor(rr() * pool.length), 1)[0] || roster[0]).no; }
      [{ id: 'ra1', gig: 'g7', no: pk(), at: memberAt(ago(24 * 60 + 90)), note: '知り合いの工務店が、ホームページを作り直したいそうです。', status: 'applied' },
       { id: 'ra2', gig: 'g8', no: pk(), at: memberAt(ago(9 * 24 * 60 + 200)), note: '前の職場の歯科医院が、Instagramを任せられる人を探しています。', status: 'meeting',
         handoff: { at: null, by: 'staff4', to: 'sns@partner.example.jp', note: '' } },
       { id: 'ra3', gig: 'g9', no: pk(), at: memberAt(ago(24 * 24 * 60 + 100)), note: '営業職の友人が、フリーランスで働きたいそうです。', status: 'done' }
      ].forEach(function (x) {
        if (!gigById(x.gig)) return;
        if (x.handoff) x.handoff.at = staffFwd(plus(x.at, 60 * 20));
        x.updatedAt = x.handoff ? x.handoff.at : x.status === 'done' ? staffFwd(plus(x.at, 60 * 24 * 12)) : x.at;
        x.seedRefer = true;
        db.gigApps.push(x);
      });
    })();
    function member(test) {
      var list = roster.filter(function (x) { return x.status === 'active' && !PERSONA[x.no] && !x.person && !used[x.no] && test(x); });
      var m = list[Math.floor(r() * list.length)];
      if (m) used[m.no] = 1;
      return m;
    }
    var PG = [
      { st: 'review', m: function (x) { return x.pref === '沖縄県'; }, h: 22 * 60, title: '手作りアクセサリーの商品写真（10点）', reward: '1点 800円', payment: '納品の翌週に振込',
        remote: false, place: '沖縄県 那覇市（受け渡し）', time: '1点 20分目安', slots: '1名', level: 2,
        desc: 'ネットショップに載せる商品写真を撮ってくれる方を探しています。白い背景で、1点につき3カット。スマホで撮れれば受けられます。' },
      { st: 'review', m: function (x) { return x.level >= 2; }, h: 5 * 60, title: 'ブログ記事の下書き（旅行・月4本）', reward: '1本 2,500円', payment: '月末締め・翌月10日払い',
        remote: true, place: '', time: '1本 2時間目安', slots: '2名', level: 2,
        desc: '北海道の旅行ブログの記事の下書きをお願いします。構成はこちらで用意します。1本2,000字くらいです。' },
      { st: 'review', m: function (x) { return x.level >= 2; }, h: 3 * 60, title: '勉強会の集客（SNSの投稿5本）', reward: '1本 1,000円', payment: '投稿の確認後に振込',
        remote: true, place: '', time: '1本 30分目安', slots: '1名', level: 2,
        desc: '投資の勉強会の告知を、InstagramとXに投稿してくれる方を探しています。文面はこちらで用意します。' },
      { st: 'open', m: function (x) { return x.level >= 3; }, h: 4 * 24 * 60, title: 'LINEスタンプのイラスト（8個）', reward: '一式 12,000円', payment: '納品の翌月末',
        remote: true, place: '', time: '全体で10時間目安', slots: '1名', level: 3,
        desc: '整体院のLINE公式アカウントで使うスタンプを8個描いてくれる方。ラフは手書きでかまいません。' },
      { st: 'rejected', m: function (x) { return x.level >= 2; }, h: 6 * 24 * 60, title: '副業の仲間募集（月10万円を目指す）', reward: '成果に応じて', payment: '',
        remote: true, place: '', time: '', slots: '5名', level: 1, reason: '「月10万円」など収入を約束・連想させる書き方は載せられません。仕事の中身と報酬（目安）を書いて出し直してください。',
        desc: '一緒に月10万円を目指す仲間を募集します。やり方はお教えします。' }
    ];
    PG.forEach(function (p, i) {
      var m = member(p.m); if (!m) return;
      var at = memberAt(ago(p.h));
      var row = { id: 'pg' + (i + 1), no: m.no, title: p.title, desc: p.desc, reward: p.reward, payment: p.payment, remote: p.remote, place: p.place,
        time: p.time, slots: p.slots, level: p.level, closesAt: D(14 + i, 23, 59), submittedAt: at, status: p.st };
      if (p.st !== 'review') { row.reviewedAt = staffFwd(plus(at, 60 * 5)); row.reviewedBy = 'staff2'; }
      if (p.reason) row.rejectReason = p.reason;
      db.peerGigs.push(row);
    });
    var hako = member(function (x) { return x.pref === '北海道'; });
    var sendai = member(function (x) { return x.pref === '宮城県' || x.pref === '福岡県'; });
    var reader = member(function (x) { return x.level >= 3; });
    if (hako) db.proposals.push({ id: 'ep1', no: hako.no, kind: 'event', title: (hako.city || '函館市').replace(/市$/, '') + 'もくもく会（カフェで2時間）', at: DATA.nextDow(6, 13, 8),
      online: false, place: hako.area, cap: 8, fee: '実費（飲み物代）', desc: '駅の近くのカフェで、それぞれの作業をします。初めての人も来られます。子連れ可です。', sentAt: memberAt(ago(2 * 24 * 60 - 90)), status: 'review' });
    if (reader) db.proposals.push({ id: 'ep2', no: reader.no, kind: 'event', title: 'オンライン読書会（ビジネス書・月1回）', at: DATA.nextDow(0, 21, 10),
      online: true, place: '', cap: 12, fee: '無料', desc: '毎月1冊を決めて、読んだところを1人3分で話します。1回目は『小さな会社の集客の本』を予定しています。', sentAt: memberAt(ago(9 * 60)), status: 'review' });
    if (sendai) db.proposals.push({ id: 'ep3', no: sendai.no, kind: 'event', title: sendai.pref.replace(/県$/, '') + 'もくもく会（第1回）', at: DATA.nextDow(6, 10, 14),
      online: false, place: sendai.area, cap: 10, fee: '実費（会議室代300円）', desc: '市内の会議室で2時間。最後の15分でやったことを話します。', sentAt: memberAt(ago(6 * 24 * 60)), status: 'approved', decidedAt: staffAt(ago(5 * 24 * 60 + 40)) });

    /* 通報（タイムライン） */
    var feedIds = (DATA.FEED || []).map(function (p) { return p.id; });
    function fid(id) { return feedIds.indexOf(id) >= 0 ? id : feedIds[0]; }
    var repBy = function () { var m = member(function () { return true; }); return m ? m.no : roster[0].no; };
    db.reports.push({ id: 'rpt1', postId: fid('p35'), commentId: null, reason: '勧誘・営業', by: repBy(), at: memberAt(ago(3 * 60 + 12)), status: '受付' });
    db.reports.push({ id: 'rpt2', postId: fid('p14'), commentId: null, reason: '収入を約束する書き方', by: repBy(), at: memberAt(ago(20 * 60)), status: '受付' });
    db.reports.push({ id: 'rpt3', postId: fid('p24'), commentId: null, reason: '個人情報が書かれている', by: repBy(), at: memberAt(ago(4 * 24 * 60)), status: '対応不要', doneAt: staffFwd(plus(memberAt(ago(4 * 24 * 60)), 120)), doneBy: 'staff2' });

    /* 専門家への相談 */
    var EXP = [['ex1', '受付', 5 * 60, '開業届と青色申告の承認申請を、いつ出せばいいか相談したいです。', '平日の20時以降'],
      ['ex1', '日程調整', 2 * 24 * 60, '副業の収入が20万円を超えそうです。確定申告の準備を聞きたいです。', '土曜の午前'],
      ['ex2', '予約確定', 6 * 24 * 60, '合同会社を作るか迷っています。費用と手続きを知りたいです。', '平日の昼休み'],
      ['ex4', '受付', 26 * 60, '民泊を始めたいので、必要な許可を相談したいです。', 'いつでも'],
      ['ex3', '相談済み', 16 * 24 * 60, 'パートさんを1人雇うときの手続きを聞きました。', '平日の夕方']];
    EXP.forEach(function (x, i) {
      var m = member(function (y) { return y.joinedDaysAgo > 30; }); if (!m) return;
      var at = memberAt(ago(x[2])), steps = ['受付', '日程調整', '予約確定', '相談済み'], k = steps.indexOf(x[1]);
      db.experts.push({ id: 'xr' + (i + 1), no: m.no, expert: x[0], at: at, status: x[1], text: x[3], when: x[4],
        history: steps.slice(0, k + 1).map(function (s, j) { return { at: j ? staffFwd(plus(at, j * 60 * 20)) : at, status: s }; }) });
    });

    /* 面談（入会したての人のスタートガイドの項目） */
    // 1つの枠に入る面談は1人だけ。これからの面談は、毎週の枠（MEET_WEEKLY）の時刻に、間を空けて1人ずつ入れる
    var slotTimes = [], base0 = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    for (var dd = 1; dd <= 28; dd++) {
      var day = new Date(base0.getFullYear(), base0.getMonth(), base0.getDate() + dd);
      MEET_WEEKLY.filter(function (w) { return w.dow === day.getDay(); }).sort(function (a, b) { return a.time < b.time ? -1 : 1; }).forEach(function (w) {
        var hm2 = w.time.split(':'); slotTimes.push(new Date(day.getFullYear(), day.getMonth(), day.getDate(), +hm2[0], +hm2[1]).toISOString());
      });
    }
    var upcoming = [];
    roster.filter(function (m) { return m.joinedDaysAgo <= 30 && m.status === 'active' && !PERSONA[m.no]; }).forEach(function (m, i) {
      var id = 'iv' + (i + 1);
      // 面談の項目（6番目）まで済んだ人は、入会の1週間ほどあとに面談を終えている
      if (m.stepsDone >= 6) {
        var past = new Date(Math.min(new Date(plus(m.joinedAt, 60 * 24 * (6 + i % 4))).getTime(), n.getTime() - DAY));
        past.setHours([21, 21, 12, 10][i % 4], [0, 30, 15, 0][i % 4], 0, 0);
        db.interviews.push({ id: id, no: m.no, at: past.toISOString(), bookedAt: memberAt(plus(past.toISOString(), -60 * 24 * 2 - 90)), status: 'done' });
        return;
      }
      // 次が面談の人は予約を出して確定待ち。少し先の項目にいる人の何人かは、先に予約して確定している
      if (m.stepsDone === 5) upcoming.push({ id: id, no: m.no, status: 'pending', bookedAt: memberAt(ago(60 * (4 + i * 3))) });
      else if (m.stepsDone >= 3 && i % 3 === 0) upcoming.push({ id: id, no: m.no, status: 'confirmed', bookedAt: memberAt(ago(60 * 24 * (1 + i % 3) + 60 * (i % 5))) });
    });
    // 確定したものを先の近い枠に、確定待ちはそのあとの枠に（1つおきに空けて、会員ページに候補が残るように）
    upcoming.sort(function (a, b) { return a.status === b.status ? 0 : a.status === 'confirmed' ? -1 : 1; }).forEach(function (x, k) {
      var at = slotTimes[Math.min(slotTimes.length - 1, 1 + Math.floor(k * 1.8))];
      db.interviews.push({ id: x.id, no: x.no, at: at, bookedAt: x.bookedAt, status: x.status });
    });

    /* 貢献ポイント（運営が手で付けたもの） */
    var pgs = [
      ['m2', 'host', 'イベントを手伝った（札幌オフ会の会場の手配）', 9, 'staff2', '#/events'],
      ['m3', 'host', 'イベントを手伝った（那覇オフ会の受付）', 12, 'staff2', '#/events'],
      ['m12', 'speak', '成果発表会で発表した（2店舗目の契約まで）', 26, 'staff1', '#/courses/archive'],
      ['m5', 'speak', '成果発表会で発表した（在庫管理の表を作った話）', 26, 'staff1', '#/courses/archive'],
      ['m4', 'speak', '成果発表会で発表した（アポ取りの1か月）', 26, 'staff1', '#/courses/archive'],
      ['m7', 'host', 'イベントを主催した（仙台もくもく会の準備）', 4, 'staff2', '#/events'],
      ['m26', 'win', '成果を報告した（はじめての見積もり）', 6, 'staff2', '#/feed/p27'],
      ['m14', 'win', '成果を報告した（病棟の勉強会でAIを使った）', 8, 'staff2', '#/feed/p13']
    ];
    pgs.forEach(function (x, i) {
      var no = noOf(x[0]), ru = byId(DATA.POINT_RULES, x[1]); if (!no || !ru) return;
      var g = { id: 'pg-' + pad(i + 1), at: staffAt(ago(x[3] * 24 * 60 - 300 - i * 37)), by: x[4], no: no, rule: ru.id, pt: ru.pt, why: x[2], link: x[5] };
      db.pointGrants.push(g);
    });
    // 1件は取り消し（同じことに2回付けていた）
    var dupG = { id: 'pg-' + pad(pgs.length + 1), at: staffAt(ago(12 * 24 * 60 - 250)), by: 'staff2', no: noOf('m3'), rule: 'host', pt: 50, why: 'イベントを手伝った（那覇オフ会の受付）', link: '#/events',
      revoked: true, revokedAt: staffAt(ago(11 * 24 * 60)), revokeWhy: '同じ会の受付に2回付けていた' };
    if (dupG.no) db.pointGrants.push(dupG);
    db.pointGrants.sort(function (a, b) { return new Date(b.at) - new Date(a.at); });

    /* 運営が出したお知らせ（右上の鈴・LINE） */
    var roster9 = roster.filter(function (m) { return m.status !== 'left'; }).length;
    var new30 = roster.filter(function (m) { return m.status !== 'left' && m.joinedDaysAgo <= 30; }).length;
    var lv3 = roster.filter(function (m) { return m.status !== 'left' && m.level >= 3; }).length;
    var cohortNow = monthKey(n), cohortN = roster.filter(function (m) { return m.status !== 'left' && monthKey(m.joinedAt) === cohortNow; }).length;
    [['all', '全員', '10月の予定を出しました。オリエンテーションと成果発表会の日にちを見てください。', '#/feed/p1', 1, 'staff2', roster9],
     ['new30', '入会30日以内', '新入生オリエンテーションは毎週水曜20:00からです。録画もあります。', ori ? '#/events/' + ori.id : '#/events', 6, 'staff2', new30],
     ['all', '全員', '税金Q&Aの質問を先に受け付けています。', '#/events/e7', 8, 'staff1', roster9],
     ['lv>=3', 'Lv3以上', 'Instagram添削会は満席になりました。キャンセル待ちができます。', '#/events/e15', 3, 'staff4', lv3],
     ['cohort:' + cohortNow, (n.getMonth() + 1) + '月入会', '面談の予約がまだの方は、メッセージから都合のいい時間を送ってください。', '#/messages?kind=' + encodeURIComponent('面談の予約'), 2, 'staff2', cohortN]
    ].forEach(function (x, i) {
      db.notices.push({ id: 'nt' + (i + 1), at: staffAt(ago(x[4] * 24 * 60 + 200 + i * 13)), by: x[5], target: x[0], targetLabel: x[1], text: x[2], link: x[3], delivered: x[6] });
    });
    db.notices.sort(function (a, b) { return new Date(b.at) - new Date(a.at); });

    /* 声かけ（新入生の30日）。送った文は、その会員とのやりとり（受信箱の「運営から」）にも入れる（声かけの画面で送ったときと同じ形） */
    roster.filter(function (m) { return m.joinedDaysAgo <= 25 && m.joinedDaysAgo >= 8 && m.status === 'active' && !PERSONA[m.no] && !m.person && !used[m.no] && m.stepsDone <= 4; }).slice(0, 3).forEach(function (m, i) {
      used[m.no] = 1;
      var at = staffAt(ago((2 + i * 2) * 24 * 60 + 100)), step = DATA.ONBOARDING[Math.min(m.stepsDone, DATA.ONBOARDING.length - 1)].title;
      var text = (realName(m).split(/\s+/)[0] || m.name) + 'さん、運営の佐藤です。スタートガイドは「' + step + '」まで来ています。分からないところや、つまずいているところがあれば、ここに送ってください。';
      db.contacts.push({ id: 'ct' + (i + 1), no: m.no, at: at, by: 'staff2', template: 'stalled', text: text });
      var msgs = [{ from: 'staff2', at: at, text: text }], st = 'doing';
      // いちばん前に声をかけた人は、返事をくれて、運営が答えて済んでいる
      if (i === 2) {
        var back = memberAt(plus(at, 60 * 20)), again = staffFwd(plus(back, 60 * 14));
        msgs.push({ from: 'member', at: back, text: 'オリエンテーションの途中で止まっていました。今週中に続きを見ます。' });
        msgs.push({ from: 'staff2', at: again, text: 'ありがとうございます。見終わったら、次は自己紹介の投稿です。分からないところがあれば、ここに送ってください。' });
        st = 'done';
      }
      db.threads.push({ id: 'tc' + pad(i + 1), no: m.no, kind: '運営から', status: st, assignee: 'staff2', ref: '',
        doneAt: msgs[msgs.length - 1].at, messages: msgs, notes: [], outbound: true });
    });

    /* ---------- 操作の記録 ---------- */
    var A = [];
    function au(at, by, action, label, target, reason, detail) { A.push({ id: 'au' + pad(A.length + 1, 3), at: at, by: by, action: action, label: label, target: target, reason: reason || '', detail: detail || '' }); }
    function mt(no) { var m = DATA.ROSTER_INDEX[no]; return { type: 'member', id: no, name: m ? m.name : no }; }
    refunds.forEach(function (p) { au(p.refund.at, p.refund.by, 'refund', '返金', { type: 'payment', id: p.id, name: (DATA.ROSTER_INDEX[p.no] || {}).name + '（' + p.no + '）' }, p.refund.reason, DATA.md(p.at) + 'の請求・' + price.toLocaleString('ja-JP') + '円'); });
    db.pointGrants.forEach(function (g) {
      au(g.at, g.by, 'points_grant', '貢献ポイントを付けた', mt(g.no), g.why, '+' + g.pt + 'pt');
      if (g.revoked) au(g.revokedAt, 'staff2', 'points_revoke', '貢献ポイントを取り消した', mt(g.no), g.revokeWhy, '-' + g.pt + 'pt');
    });
    db.notices.forEach(function (x) { au(x.at, x.by, 'notice', 'お知らせを出した', { type: 'notice', id: x.id, name: x.targetLabel }, '', x.text); });
    db.peerGigs.forEach(function (g) {
      if (g.status === 'open') au(g.reviewedAt, g.reviewedBy, 'gig_approve', '会員の募集を掲載した', { type: 'gig', id: g.id, name: g.title }, '', '');
      if (g.status === 'rejected') au(g.reviewedAt, g.reviewedBy, 'gig_reject', '会員の募集を差し戻した', { type: 'gig', id: g.id, name: g.title }, g.rejectReason, '');
    });
    db.proposals.forEach(function (p) { if (p.status === 'approved') au(p.decidedAt, 'staff2', 'event_approve', 'イベントの企画を通した', { type: 'proposal', id: p.id, name: p.title }, '', ''); });
    // 紹介報酬：確定の記録（まとめて）と、今日の支払い
    var byDay = {};
    db.rewards.forEach(function (x) { if (x.confirmedAt && DATA.dayDiff(n, x.confirmedAt) <= 14) { var k3 = ymd(x.confirmedAt) + x.confirmedBy; (byDay[k3] = byDay[k3] || { at: x.confirmedAt, by: x.confirmedBy, n: 0, sum: 0 }); byDay[k3].n++; byDay[k3].sum += x.amount; } });
    Object.keys(byDay).forEach(function (k4) { var b = byDay[k4]; au(b.at, b.by, 'reward_confirm', '紹介報酬を確定した', { type: 'rewards', id: k4, name: b.n + '件' }, '初回の決済から' + RF.holdDays + '日が過ぎ、返金・解約なし', b.sum.toLocaleString('ja-JP') + '円'); });
    var paidToday = db.rewards.filter(function (x) { return x.paidAt && DATA.dayDiff(n, x.paidAt) === 0; });
    if (paidToday.length) au(plus(paidToday[0].paidAt, 5), 'acct1', 'reward_pay', '紹介報酬を支払った', { type: 'rewards', id: 'pay-' + ymd(n), name: paidToday.length + '件' }, (n.getMonth()) + '月締めの分',
      paidToday.reduce(function (a, x) { return a + x.amount; }, 0).toLocaleString('ja-JP') + '円');
    var th15 = db.threads.filter(function (t) { return /パスワードの再設定/.test(t.messages[0].text); })[0];
    if (th15) au(plus(th15.messages[1].at, 2), 'staff2', 'password_reset', 'パスワードの再設定メールを送った', mt(th15.no), '本人から届かないと連絡', '');
    // 支払いエラーの連絡は、いちばん前に失敗した人に、失敗の翌日の昼間（まだ連絡していない2人は「まだ」のまま）
    var failed = db.payments.filter(function (p) { return p.status === 'failed'; }).sort(function (a, b) { return new Date(a.at) - new Date(b.at); })[0];
    if (failed) {
      var cd = new Date(plus(failed.at, 60 * 24)); cd.setHours(10, 20, 0, 0);
      if (cd > n) cd = new Date(n.getTime() - 60 * MIN);
      au(cd.toISOString(), 'acct1', 'payment_contact', '支払いエラーの連絡をした', mt(failed.no), failed.failure.label, 'メールとLINE');
    }
    A.forEach(function (x) { if (new Date(x.at) > n) x.at = ago(5); });
    db.audit = A.sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
    return db;
  }

  /* ---------- 保存と読み込み ---------- */
  function shift(o, ms) {
    if (!ms) return o;
    if (Array.isArray(o)) { for (var i = 0; i < o.length; i++) o[i] = shift(o[i], ms); return o; }
    if (o && typeof o === 'object') { Object.keys(o).forEach(function (k) { o[k] = shift(o[k], ms); }); return o; }
    if (typeof o === 'string' && ISO_RE.test(o)) return new Date(new Date(o).getTime() + ms).toISOString();
    return o;
  }
  function load() {
    try {
      var raw = global.localStorage.getItem(KEY);
      if (!raw) return null;
      // 運営の人のメールのドメインは taisei.example.jp（2026-09-25 に名前が決まって変えた）。前に保存した分も直す。
      // 会員番号の頭（TK- → TS-）は store.js が読み込みの前に直している
      if (raw.indexOf('@terakoya.example.jp') >= 0) raw = raw.split('@terakoya.example.jp').join('@taisei.example.jp');
      var s = JSON.parse(raw);
      if (!s || !s.seedDate) return null;
      if (s.v !== VERSION) { carried = s.session || null; return null; }
      // 別の日に開いたら、日数ぶん日付をずらす（「3日前の未返信」を3日前のままにする）
      var today = ymd(now());
      if (s.seedDate !== today) {
        var p = s.seedDate.split('-'), t = today.split('-');
        var days = Math.round((new Date(+t[0], +t[1] - 1, +t[2]) - new Date(+p[0], +p[1] - 1, +p[2])) / DAY);
        var sess = s.session;
        shift(s, days * DAY);
        s.session = sess; s.seedDate = today;
      }
      return s;
    } catch (e) { return null; }
  }
  function persist() {
    actCache = null;
    try { global.localStorage.setItem(KEY, JSON.stringify(db.state)); } catch (e) {}
  }
  function notify() { listeners.slice().forEach(function (l) { try { l(db.state); } catch (e) { console.error(e); } }); }
  function uidGen(prefix) { return (prefix || 'ad') + '-' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36); }

  var db = {
    KEY: KEY,
    state: null,
    update: function (fn) { var r = fn(db.state); persist(); notify(); return r; },
    on: function (fn) { listeners.push(fn); return function () { db.off(fn); }; },
    off: function (fn) { listeners = listeners.filter(function (l) { return l !== fn; }); },
    ensure: function (name, make) {
      if (db.state[name] === undefined) { db.state[name] = typeof make === 'function' ? make(db.state) : make; persist(); }
      return db.state[name];
    },
    audit: function (e) {
      e = e || {};
      var entry = { id: uidGen('au'), at: nowIso(), by: (db.state.session && db.state.session.staffId) || DEMO_STAFF, action: e.action || 'other',
        label: e.label || '', target: e.target || null, reason: String(e.reason || '').trim(), detail: e.detail || '' };
      db.update(function (s) { s.audit.unshift(entry); });
      return entry;
    },
    staff: function (id) {
      var sid2 = id || (db.state.session && db.state.session.staffId);
      return byId(db.state.staff, sid2) || null;
    },
    staffName: function (id) { var s = byId(db.state.staff, id); return s ? s.name : (DATA.PEOPLE[id] ? DATA.PEOPLE[id].name : '運営'); },
    uid: uidGen,
    reset: function () {
      var sess = db.state && db.state.session;
      db.state = build(); db.state.session = sess || null;
      persist(); notify();
    },
    DEMO_STAFF: DEMO_STAFF
  };
  db.state = load();
  if (!db.state) { db.state = build(); if (carried) db.state.session = carried; persist(); }
  else persist();

  /* 別の運営画面のタブで変わったら読み直す */
  if (typeof global.addEventListener === 'function') {
    global.addEventListener('storage', function (e) {
      if (!e || (e.key !== KEY && e.key !== null)) return;
      var s = load(); if (!s) return;
      db.state = s; actCache = null; notify();
    });
  }

  /* ============================================================
     読むもの（デモ会員の分は CLG.store から混ぜる）
     ============================================================ */
  var STATUS_LABEL = { active: '有効', canceling: '解約予定', past_due: '支払いエラー', left: '終了', paused: '休会中' };

  function liveNo() { return store.state && store.state.me ? store.state.me.id : null; }
  function memberHref(hash) {
    var k = store.state ? store.state.kind : 'demo';
    return 'member.html?demo=' + (k === 'veteran' ? 'veteran' : k === 'fresh' ? 'fresh' : '1') + (hash || '#/home');
  }
  function latestAt(list) {
    var t = 0, lim = now().getTime();
    list.forEach(function (x) { var v = x ? new Date(x).getTime() : 0; if (v && v <= lim && v > t) t = v; });
    return t ? new Date(t).toISOString() : null;
  }
  /* 会員が運営画面の記録に残した最後の動き（送ったメッセージ・応募・募集・企画・通報・相談・面談の予約）。会員番号 → 時刻（ms）。
     名簿の「最後の活動」がこれより前だと、38分前にメッセージを送った人が「5日前」と出てしまうため。保存のたびに作り直す */
  function activity() {
    if (actCache) return actCache;
    var s = db.state, o = {}, lim = now().getTime();
    function put(no, at) { if (!no || !at) return; var t = new Date(at).getTime(); if (!(t <= lim)) return; if (!o[no] || t > o[no]) o[no] = t; }
    (s.threads || []).forEach(function (t) { (t.messages || []).forEach(function (x) { if (x.from === 'member') put(t.no, x.at); }); });
    (s.gigApps || []).forEach(function (a) { put(a.no, a.at); });
    (s.peerGigs || []).forEach(function (g) { put(g.no, g.submittedAt); });
    (s.proposals || []).forEach(function (p) { put(p.no, p.sentAt); });
    (s.reports || []).forEach(function (x) { put(x.by, x.at); });
    (s.experts || []).forEach(function (x) { put(x.no, x.at); });
    (s.interviews || []).forEach(function (x) { put(x.no, x.bookedAt); if (x.status === 'done') put(x.no, x.at); });
    actCache = o;
    return o;
  }
  function baseRow(m) {
    var ex = db.state.members[m.no] || {}, n = now();
    // 名簿の「最後の活動」が今日のこれからの時刻になっていることがあるので、いまより前に寄せる
    var last = m.lastActive && new Date(m.lastActive) > n ? new Date(n.getTime() - ((parseInt(m.no.slice(-3), 10) % 50) + 5) * MIN).toISOString() : m.lastActive;
    // 運営画面の記録に残っている会員の動き（メッセージ・応募など）がそれより新しければ、そちらに合わせる
    var act = activity()[m.no];
    if (act && (!last || act > new Date(last).getTime())) last = new Date(act).toISOString();
    var st = ex.status || m.status;
    var step = DATA.ONBOARDING[Math.min(m.stepsDone, DATA.ONBOARDING.length - 1)];
    return {
      no: m.no, name: m.name, realName: realName(m), kana: ex.kana || '', person: m.person, pref: m.pref, city: m.city, area: m.area, job: m.job,
      joinedAt: m.joinedAt, day: dayOf(m.joinedAt), cohort: m.cohort, cohortKey: monthKey(m.joinedAt),
      xp: m.xp, level: m.level, levelName: levelName(m.level), stepsDone: m.stepsDone,
      currentStep: m.stepsDone >= DATA.ONBOARDING.length ? '' : step.title,
      lastActive: last, status: st, statusLabel: STATUS_LABEL[st] || st,
      cancelAt: ex.cancelAt !== undefined ? ex.cancelAt : m.cancelAt, leftAt: ex.leftAt !== undefined ? ex.leftAt : m.leftAt, cancelReason: ex.cancelReason || '',
      refCode: ex.refCode || '', referredBy: ex.referredBy || null, email: ex.email || '', card: ex.card || '', cust: ex.cust || '',
      tags: (ex.tags || []).slice(), memo: ex.memo || '', suspended: !!ex.suspended, monthPoints: m.monthPoints || 0, live: false
    };
  }
  function liveRow() {
    var s = store.state, me = s && s.me; if (!me) return null;
    var R = Rl(), base = DATA.ROSTER_INDEX[me.id];
    var row = base ? baseRow(base) : { tags: [], memo: '', suspended: false, person: null };
    var ex = db.state.members[me.id] || {};
    var p = R.plan(), lv = R.level(), ob = R.onboarding(), st = p.status === 'ended' ? 'left' : p.status;
    var parts = String(me.area || '').split(/\s+/);
    var acts = [me.joinedAt];
    (s.xpLog || []).forEach(function (l) { acts.push(l.at); });
    (s.thread || []).forEach(function (m) { if (m.from === 'me') acts.push(m.at); });
    (s.posts || []).forEach(function (m) { acts.push(m.at); });
    (s.sessions || []).forEach(function (m) { if (m.current) acts.push(m.lastAt); });
    var refBy = s.referredBy || null;
    if (refBy && !DATA.ROSTER_INDEX[refBy]) {
      Object.keys(db.state.members).some(function (no) { if (db.state.members[no].refCode === String(refBy).toUpperCase()) { refBy = no; return true; } return false; });
    }
    return Object.assign(row, {
      no: me.id, name: me.name, realName: me.name, kana: hira2kata(me.kana) || row.kana || '', pref: parts[0] || '', city: parts[1] || '', area: me.area || '',
      job: me.job || '', joinedAt: me.joinedAt, day: dayOf(me.joinedAt), cohort: R.cohort(me.joinedAt), cohortKey: monthKey(me.joinedAt),
      xp: lv.xp, level: lv.lv, levelName: lv.name, stepsDone: ob.done, currentStep: ob.current ? (ob.current.baseTitle || ob.current.title) : '',
      lastActive: latestAt(acts) || me.joinedAt, status: st, statusLabel: STATUS_LABEL[st] || p.label,
      // 解約の理由は会員ページで選んだもの（R.cancelPlan の reasons）。無ければ運営が書いたもの
      cancelAt: p.cancelAt, leftAt: p.endedAt, cancelReason: (p.cancelReasons || []).join('・') || ex.cancelReason || '',
      refCode: me.refCode || '', referredBy: refBy, email: me.email || '', card: me.card || '', cust: row.cust || ex.cust || '',
      // ログインの停止は会員ページが従うもの（R.loginBlocked：運営画面の保存と会員ページの保存の新しいほう）
      tags: (ex.tags || row.tags || []).slice(), memo: ex.memo || row.memo || '', suspended: R.loginBlocked ? !!R.loginBlocked() : !!ex.suspended,
      monthPoints: R.points().month, live: true, kind: s.kind, plan: p
    });
  }
  function members() {
    var ln = liveNo(), out = [], found = false;
    DATA.ROSTER.forEach(function (m) {
      if (m.no === ln) { var lr = liveRow(); if (lr) { out.push(lr); found = true; } return; }
      out.push(baseRow(m));
    });
    if (!found) { var lr2 = liveRow(); if (lr2) out.push(lr2); }
    return out;
  }
  function member(no) {
    if (!no) return null;
    if (no === liveNo()) return liveRow();
    var m = DATA.ROSTER_INDEX[no];
    return m ? baseRow(m) : null;
  }
  function live() {
    var s = store.state, row = liveRow();
    return { kind: s.kind, no: s.me.id, name: s.me.name, session: !!s.session, row: row, href: memberHref };
  }

  /* 支払い */
  function payments(opt) {
    opt = opt || {};
    var ln = liveNo(), list = db.state.payments.filter(function (p) { return p.no !== ln; });
    var R = Rl(), me = store.state.me, lr = db.state.liveRefunds || {};
    R.invoices().forEach(function (iv) {
      if (iv.status === 'upcoming') return;
      list.push({ id: iv.id, no: me.id, at: iv.at, amount: iv.amount, status: iv.status === 'failed' ? 'failed' : iv.status === 'refunded' ? 'refunded' : 'paid',
        card: me.card, cust: '', attempts: iv.status === 'failed' ? 2 : 1, receiptNo: iv.id, failure: iv.status === 'failed' ? { code: 'card_declined', label: 'カード会社が決済を断った', nextRetryAt: null } : null,
        refund: iv.refund ? Object.assign({}, iv.refund, lr[iv.id] ? { by: lr[iv.id].by } : {}) : null, live: true });
    });
    if (opt.no) list = list.filter(function (p) { return p.no === opt.no; });
    if (opt.month != null) list = list.filter(function (p) { return inMonth(p.at, opt.month) || (p.refund && inMonth(p.refund.at, opt.month)); });
    if (opt.status) list = list.filter(function (p) { return p.status === opt.status; });
    return list.sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
  }
  function revenue(offset) {
    offset = offset || 0;
    var o = { charged: 0, paid: 0, failed: 0, refunded: 0, net: 0, count: 0, failedCount: 0, refundCount: 0 };
    payments({ month: offset }).forEach(function (p) {
      if (inMonth(p.at, offset)) {
        o.charged += p.amount; o.count++;
        if (p.status === 'failed') { o.failed += p.amount; o.failedCount++; } else o.paid += p.amount;
      }
      if (p.refund && inMonth(p.refund.at, offset)) { o.refunded += p.refund.amount; o.refundCount++; }
    });
    o.net = o.paid - o.refunded;
    return o;
  }

  /* 受信箱 */
  function shapeThread(t) {
    var msgs = t.messages || [], last = msgs[msgs.length - 1] || null;
    // 自動送信（「確認して返信します」など）は返事に数えない
    var real = msgs.filter(function (m) { return !m.auto; }), lastReal = real[real.length - 1] || null;
    var lastMember = null; msgs.forEach(function (m) { if (m.from === 'member') lastMember = m; });
    // 返事を待っている：最後（自動送信を除く）が会員の発言。待ちはじめ＝そのひと続きの最初の発言
    var waitingSince = null;
    if (lastReal && lastReal.from === 'member') { for (var i = real.length - 1; i >= 0 && real[i].from === 'member'; i--) waitingSince = real[i].at; }
    // 対応中・完了にしたあとで会員が新しく送ったら、未返信に戻す
    var status = t.status;
    if (waitingSince && status !== 'open' && t.doneAt && new Date(lastReal.at) > new Date(t.doneAt)) status = 'open';
    return Object.assign({}, t, { status: status, last: last, lastMember: lastMember, waitingSince: status === 'open' ? waitingSince : null,
      updatedAt: last ? last.at : null });
  }
  /** デモ会員のスレッドの運営側の印。別の人の印（会員ページの人を切り替えた）なら、ないものとして読む */
  function liveMarkOf(lt, no) {
    if (!lt) return null;
    return (lt.no ? lt.no === no : no === DATA.MEMBER.id) ? lt : null;
  }
  /** 書くとき用：いまのデモ会員の印（別の人の印なら作り直す）。db.update の中で呼ぶ */
  function liveMark(s) {
    var no = liveNo();
    if (!liveMarkOf(s.liveThread, no)) s.liveThread = { no: no, status: null, assignee: DEMO_STAFF, notes: [], doneAt: null };
    s.liveThread.no = no;
    return s.liveThread;
  }
  function liveThread() {
    var R = Rl(), s = store.state, lt = liveMarkOf(db.state.liveThread, s.me.id) || {};
    var msgs = R.thread().map(function (m) { return { from: m.from === 'me' ? 'member' : (m.from || 'staff2'), at: m.at, text: m.text, kind: m.kind, auto: !!m.auto, card: m.card || null, attachments: m.attachments || null, ref: m.ref || '' }; });
    var lastMe = null; msgs.forEach(function (m) { if (m.from === 'member') lastMe = m; });
    var t = { id: 'live', no: s.me.id, kind: (lastMe && lastMe.kind) || '質問', status: lt.status || 'done', assignee: lt.assignee || DEMO_STAFF,
      notes: lt.notes || [], doneAt: lt.doneAt || null, messages: msgs, ref: '', live: true };
    var real = msgs.filter(function (m) { return !m.auto; }), last = real[real.length - 1];
    // 会員が新しく送ったら、印に関係なく「未返信」に戻す（自動送信は返事に数えない）
    if (last && last.from === 'member' && (!lt.doneAt || new Date(last.at) > new Date(lt.doneAt))) t.status = 'open';
    return shapeThread(t);
  }
  function threads() {
    var list = db.state.threads.map(shapeThread);
    list.push(liveThread());
    return list.sort(function (a, b) { return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0); });
  }
  function thread(id) { return id === 'live' ? liveThread() : (byId(db.state.threads, id) ? shapeThread(byId(db.state.threads, id)) : null); }

  /* 紹介報酬 */
  function rewardStatus(x) {
    var n = now();
    if (x.voidAt || x.voidReason) return 'void';
    if (n < new Date(x.confirmAt)) return 'hold';
    if (x.paidAt) return 'paid';
    // 月末に締めた（closedAt）か、締めの日を過ぎたものは支払予定
    if (x.confirmedAt) return x.closedAt || n > new Date(x.closing) ? 'scheduled' : 'confirmed';
    return 'ready';
  }
  var REWARD_LABEL = { hold: '保留', ready: '確定待ち', confirmed: '確定', scheduled: '支払予定', paid: '支払済', 'void': '取消' };
  function rewards(opt) {
    opt = opt || {};
    var ln = liveNo();
    var list = db.state.rewards.filter(function (x) { return x.referrer !== ln; }).map(function (x) {
      var st = rewardStatus(x);
      return Object.assign({}, x, { status: st, label: REWARD_LABEL[st] });
    });
    // デモ会員の紹介：会員ページの明細（R.rewardRows）。運営がまだ付けていない「確定」は確定待ち
    Rl().rewardRows().forEach(function (x) {
      var ref = (store.state.referred || []).filter(function (y) { return y.id === x.ref; })[0] || {};
      var st = x.status === 'confirmed' && !x.confirmedBy ? 'ready' : x.status;
      list.push({ id: x.id, referrer: ln, referred: ref.person && DATA.PEOPLE[ref.person] ? DATA.PEOPLE[ref.person].no : (ref.no || null), initial: ref.initial || '',
        month: parseInt(String(x.id).split('-').pop(), 10) || 1, at: x.at, amount: x.amount, confirmAt: x.confirmAt, payAt: x.payAt, paidAt: x.paidAt,
        confirmedBy: x.confirmedBy, status: st, label: REWARD_LABEL[st], who: x.who, live: true });
    });
    if (opt.referrer) list = list.filter(function (x) { return x.referrer === opt.referrer; });
    return list.sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
  }

  /* 確認待ちの列（運営の分＋デモ会員の分） */
  function queues() {
    var R = Rl(), s = store.state, ln = liveNo();
    var gigApps = db.state.gigApps.slice();
    Object.keys(s.gigs || {}).forEach(function (id) {
      var g = s.gigs[id]; if (!g) return;
      // 更新：いちばん新しい段の時刻（見送り・報酬確定・完了・稼働・面談の連絡）
      var up = latestAt([g.at, g.meetingOfferedAt, g.meetingAt, g.startedAt, g.doneAt, g.rewardedAt, g.declinedAt]) || g.at;
      gigApps.push({ id: 'live-' + id, gig: id, no: ln, at: g.at, note: g.note || '', status: g.status, updatedAt: up, reward: g.reward != null ? g.reward : null, live: true });
    });
    var peerGigs = db.state.peerGigs.slice();
    R.myGigs().forEach(function (g) {
      peerGigs.push({ id: g.id, no: ln, title: g.title, desc: g.desc, reward: g.reward, payment: g.payment, remote: g.remote, place: g.place, time: g.time,
        slots: g.slots, level: g.level, closesAt: g.closesAt, submittedAt: g.submittedAt || g.postedAt, status: g.status, rejectReason: g.rejectReason || '', live: true });
    });
    var proposals = db.state.proposals.slice();
    R.proposals().forEach(function (p) { proposals.push(Object.assign({}, p, { no: ln, live: true })); });
    var reports = db.state.reports.slice();
    (s.reports || []).forEach(function (x) { reports.push(Object.assign({}, x, { by: ln, live: true })); });
    var experts = db.state.experts.slice();
    R.expertRequests().forEach(function (x) { experts.push({ id: x.id, no: ln, expert: x.expert, at: x.at, status: x.status, text: x.text, when: x.when, history: x.history || [], live: true }); });
    var interviews = db.state.interviews.slice();
    R.meetings().forEach(function (m) { interviews.push({ id: m.id, no: ln, at: m.at, bookedAt: m.bookedAt, status: m.status, live: true }); });
    return { gigApps: gigApps, peerGigs: peerGigs, proposals: proposals, reports: reports, experts: experts, interviews: interviews };
  }

  /* 新入生の30日：入会 day 日目に済んでいてほしい数（1週目に4つ・2週目に7つ・3週目に9つ） */
  function expectedSteps(day) {
    if (day <= 7) return Math.round(day * 4 / 7);
    if (day <= 14) return 4 + Math.round((day - 7) * 3 / 7);
    if (day <= 21) return 7 + Math.round((day - 14) * 2 / 7);
    return 9;
  }
  function stalled() {
    var n = now();
    // スタートガイドを終えた人は「止まっている」に入れない（動きがないだけなら会員の一覧の「最後のログイン」で見る）
    return members().filter(function (m) { return m.day <= 30 && m.status !== 'left' && m.stepsDone < DATA.ONBOARDING.length; }).map(function (m) {
      var idle = m.lastActive ? Math.max(0, Math.floor((n - new Date(m.lastActive)) / DAY)) : m.day;
      var exp = expectedSteps(m.day), gap = exp - m.stepsDone;
      var why = idle >= 7 ? 'idle' : m.day >= 5 && gap >= 4 ? 'behind' : '';
      return Object.assign({}, m, { idleDays: idle, expected: exp, gap: gap, why: why });
    }).filter(function (m) { return m.why; }).sort(function (a, b) { return (b.idleDays >= 7) - (a.idleDays >= 7) || b.idleDays - a.idleDays || b.gap - a.gap; });
  }
  function weekEvents() {
    var n = now(), lim = n.getTime() + 7 * DAY, R = Rl();
    return DATA.EVENTS.filter(function (e) { var t = new Date(e.at).getTime() + (e.min || 60) * MIN; return t > n.getTime() && new Date(e.at).getTime() <= lim; })
      .map(function (e) { var mine = R.isReserved(e.id) ? 1 : 0; return Object.assign({}, e, { reserved: (e.count || 0) + mine, liveReserved: !!mine }); })
      .sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
  }

  /* ダッシュボードとメニューの数 */
  function metrics() {
    var ms = members(), n = now();
    var enrolled = ms.filter(function (m) { return m.status !== 'left'; });
    var th = threads(), open = th.filter(function (t) { return t.status === 'open'; });
    var over = open.filter(function (t) { return t.waitingSince && (n - new Date(t.waitingSince)) >= 24 * HOUR; });
    var q = queues();
    var canceling = ms.filter(function (m) { return m.status === 'canceling'; }).sort(function (a, b) { return new Date(a.cancelAt) - new Date(b.cancelAt); });
    var rw = rewards(), ready = rw.filter(function (x) { return x.status === 'ready'; });
    var failed = payments({ status: 'failed' });
    var we = weekEvents();
    var st = stalled();
    return {
      enrolled: enrolled.length,
      joined: ms.filter(function (m) { return inMonth(m.joinedAt, 0); }).length,
      joinedLast: ms.filter(function (m) { return inMonth(m.joinedAt, -1); }).length,
      left: ms.filter(function (m) { return m.leftAt && inMonth(m.leftAt, 0) && m.status === 'left'; }).length,
      canceling: canceling.length, nextCancel: canceling[0] || null,
      pastDue: ms.filter(function (m) { return m.status === 'past_due'; }).length,
      revenue: revenue(0), revenueLast: revenue(-1),
      failed: failed.length,
      unanswered: open.length, over24: over.length, oldestOpen: open.reduce(function (a, t) { return !a || new Date(t.waitingSince) < new Date(a.waitingSince) ? t : a; }, null),
      doing: th.filter(function (t) { return t.status === 'doing'; }).length,
      stalled: st.length, stalledList: st,
      newMembers: ms.filter(function (m) { return m.day <= 30 && m.status !== 'left'; }).length,
      gigApps: q.gigApps.filter(function (a) { return a.status === 'applied'; }).length,
      peerGigs: q.peerGigs.filter(function (g) { return g.status === 'review'; }).length,
      proposals: q.proposals.filter(function (p) { return p.status === 'review'; }).length,
      reports: q.reports.filter(function (x) { return x.status === '受付'; }).length,
      experts: q.experts.filter(function (x) { return x.status === '受付' || x.status === '日程調整'; }).length,
      interviews: q.interviews.filter(function (x) { return x.status === 'pending'; }).length,
      rewardsReady: ready.length, rewardsReadySum: ready.reduce(function (a, x) { return a + x.amount; }, 0),
      weekEvents: we, weekReserved: we.reduce(function (a, e) { return a + e.reserved; }, 0)
    };
  }

  AD.db = db;
  AD.data = {
    live: live, memberHref: memberHref, members: members, member: member, STATUS_LABEL: STATUS_LABEL,
    payments: payments, revenue: revenue, threads: threads, thread: thread, rewards: rewards, REWARD_LABEL: REWARD_LABEL,
    queues: queues, stalled: stalled, expectedSteps: expectedSteps, weekEvents: weekEvents, metrics: metrics,
    monthKey: monthKey, inMonth: inMonth, dayOf: dayOf, kana: hira2kata
  };

  /* ============================================================
     書くもの
     ============================================================ */
  function staffPerson() {
    // 会員ページに名前が出るのは PEOPLE にいる人だけ。経理など PEOPLE にいない人の返信は運営（佐藤）の名前で出す
    var st = db.staff();
    return st && st.person && DATA.PEOPLE[st.person] ? st.person : DEMO_STAFF;
  }
  function staffIdNow() { return (db.staff() || {}).id || DEMO_STAFF; }
  function yen(n) { return Number(n || 0).toLocaleString('ja-JP') + '円'; }
  function isLive(no) { return !!no && no === liveNo(); }
  /** 断られた理由の文（{ error } か { errors:{欄: 文} } の最初の1つ） */
  function cmsError(res) {
    if (!res) return 'できませんでした';
    if (res.error) return res.error;
    var k = res.errors ? Object.keys(res.errors).filter(function (x) { return res.errors[x]; })[0] : null;
    return k ? res.errors[k] : 'できませんでした';
  }
  function ruleCall(name, args) {
    var R = Rl();
    if (!R || typeof R[name] !== 'function') return { ok: false, error: '会員ページのルールがありません' };
    try { return R[name].apply(R, args) || { ok: false, error: 'できませんでした' }; } catch (e) { console.error(e); return { ok: false, error: 'できませんでした' }; }
  }
  AD.ops = {
    /** 返信する。'live' はデモ会員（R.staffReply → 会員ページのタブに届く）。{ ok, message } か { ok:false, error } */
    reply: function (threadId, text) {
      text = String(text || '').trim();
      if (!text) return { ok: false, errors: { text: '返信を入れてください' } };
      if (text.length > 2000) return { ok: false, errors: { text: '2000文字までにしてください' } };
      if (threadId === 'live') {
        var m = Rl().staffReply(text, staffPerson());
        if (!m) return { ok: false, error: '送れませんでした' };
        db.update(function (s) { var lt = liveMark(s); lt.status = 'doing'; lt.assignee = lt.assignee || staffPerson(); lt.doneAt = m.at; });
        return { ok: true, message: m };
      }
      var who = (db.staff() || {}).id || DEMO_STAFF, msg = { from: who, at: nowIso(), text: text };
      var ok = db.update(function (s) {
        var t = byId(s.threads, threadId); if (!t) return false;
        t.messages.push(msg); if (t.status === 'open') t.status = 'doing'; if (!t.assignee) t.assignee = who; t.doneAt = msg.at;
        return true;
      });
      return ok ? { ok: true, message: msg } : { ok: false, error: 'スレッドが見つかりません' };
    },
    /** 未返信 open／対応中 doing／完了 done。担当も変えられる */
    setThreadStatus: function (threadId, status, assignee) {
      if (['open', 'doing', 'done'].indexOf(status) < 0) return false;
      return db.update(function (s) {
        var t = threadId === 'live' ? liveMark(s) : byId(s.threads, threadId);
        if (!t) return false;
        t.status = status; if (assignee !== undefined) t.assignee = assignee;
        if (status !== 'open') t.doneAt = nowIso();
        return true;
      });
    },
    /** デモ会員のスレッドの印（メモを足すとき用。db.update の中で呼ぶ） */
    liveMark: liveMark,
    isLive: isLive,

    /* ---------- 貢献ポイント ---------- */
    grantPoints: function (no, ruleId, why, link) {
      var m = member(no); if (!m) return { ok: false, error: '会員が見つかりません' };
      var ru = byId(DATA.POINT_RULES, ruleId);
      if (!ru) return { ok: false, error: 'ポイントのルールを選んでください' };
      why = String(why || '').trim() || ru.name; link = String(link || '').trim();
      // 会員ページの記録へ：デモ会員は本人の記録とお知らせ、ほかの会員は会員ページのランキングの数（PEOPLE にいる人はその id で）
      var pid = m.live ? 'me' : (m.person && m.person !== 'demo' && DATA.PEOPLE[m.person] ? m.person : m.no);
      var res = ruleCall('grantPoints', [pid, ru.id, why, link]);
      if (!res.ok) return res;
      var e = res.entry || { id: null, at: nowIso(), pt: ru.pt, why: why };
      var g = { id: uidGen('pg'), rid: e.id, at: e.at, by: staffIdNow(), no: m.no, rule: ru.id, pt: e.pt, why: why, link: link };
      db.update(function (s) { s.pointGrants.unshift(g); });
      return { ok: true, grant: g, entry: e,
        audit: { action: 'points_grant', label: '貢献ポイントを付けた', target: { type: 'member', id: m.no, name: m.name }, reason: why, detail: '+' + g.pt + 'pt（' + ru.name + '）' } };
    },
    revokePoints: function (key, why) {
      why = String(why || '').trim();
      var list = db.state.pointGrants || [];
      var g = byId(list, key) || list.filter(function (x) { return (x.rid && x.rid === key) || (x.storeId && x.storeId === key); })[0] || null;
      if (g && g.revoked) return { ok: false, error: 'もう取り消しています' };
      var rid = g ? (g.rid || g.storeId || null) : key;
      // 会員ページの記録にあるものは会員ページでも取り消す（デモのデータの記録は運営画面の記録だけ）
      if (rid) { var r = ruleCall('revokePoints', [rid, why]); if (!r.ok && !g) return r; }
      if (g) db.update(function (s) { var x = byId(s.pointGrants, g.id); if (x) { x.revoked = true; x.revokedAt = nowIso(); x.revokeWhy = why; x.revokedBy = staffIdNow(); } });
      var no = g ? g.no : liveNo(), m = member(no) || { name: no };
      var pt = g ? g.pt : (((store.state.pointsLog || []).filter(function (l) { return l.id === key; })[0]) || {}).pt || 0;
      return { ok: true, grant: g,
        audit: { action: 'points_revoke', label: '貢献ポイントを取り消した', target: { type: 'member', id: no, name: m.name }, reason: why, detail: '-' + pt + 'pt' + (g ? '（' + g.why + '）' : '') } };
    },

    /* ---------- 返金 ---------- */
    refund: function (payId, amount, reason) {
      var p = payments().filter(function (x) { return x.id === payId; })[0];
      if (!p) return { ok: false, error: '請求が見つかりません' };
      if (p.status !== 'paid') return { ok: false, error: p.status === 'refunded' ? 'すでに返金しています' : '支払済の請求だけ返金できます' };
      var amt = amount == null || amount === '' ? p.amount : Math.round(Number(String(amount).replace(/[^\d.]/g, '')));
      if (!(amt >= 1 && amt <= p.amount)) return { ok: false, errors: { amount: '1〜' + Number(p.amount).toLocaleString('ja-JP') + '円で入れてください' } };
      reason = String(reason || '').trim();
      if (!reason) return { ok: false, errors: { reason: '理由を入れてください' } };
      var at = nowIso(), by = staffIdNow(), voided = 0;
      if (p.live) {
        // デモ会員：会員ページの請求を返金にする（領収書が「返金済み」になり、会員にお知らせが届く）
        var r = ruleCall('refundInvoice', [p.id, amt, reason]);
        if (!r.ok) return r;
        if (r.invoice && r.invoice.refund) at = r.invoice.refund.at;
      }
      var lno = liveNo(), VOID_WHY = '紹介した方の決済が返金された';
      db.update(function (s) {
        if (p.live) (s.liveRefunds = s.liveRefunds || {})[p.id] = { at: at, by: by, amount: amt, reason: reason, no: p.no };
        else { var x = byId(s.payments, p.id); if (x) { x.status = 'refunded'; x.refund = { at: at, amount: amt, reason: reason, by: by }; } }
        // この請求から出る紹介報酬は、まだ払っていなければ取り消す（返金された決済には報酬を出さない）。
        // 紹介したのがデモ会員なら、その明細は会員ページの記録（R.voidReward。下）で数える
        (s.rewards || []).forEach(function (w) {
          if (w.referred === p.no && w.at === p.at && !w.paidAt && !w.voidAt) { w.voidAt = at; w.voidReason = VOID_WHY; if (w.referrer !== lno) voided++; }
        });
      });
      // 紹介したのがデモ会員なら、会員ページの紹介の明細も取消にする（本人にお知らせ）。デモ会員の紹介でなければ R は { other:true } を返す
      var lv = p.live ? null : ruleCall('voidReward', [{ no: p.no, at: p.at }, VOID_WHY]);
      var liveVoided = lv && lv.ok && !lv.other ? 1 : 0, allVoided = voided + liveVoided;
      var m = member(p.no) || { name: p.no };
      return { ok: true, amount: amt, voided: voided, liveVoided: liveVoided, live: !!p.live,
        audit: { action: 'refund', label: '返金', target: { type: 'payment', id: p.id, name: m.name + '（' + p.no + '）' }, reason: reason,
          detail: DATA.md(p.at) + 'の請求・' + yen(amt) + (amt < p.amount ? '（一部）' : '') + (allVoided ? '・紹介報酬 ' + allVoided + '件を取消' : '') } };
    },

    /* ---------- ログインを止める・再開する ---------- */
    setSuspended: function (no, on, reason) {
      var m = member(no); if (!m) return { ok: false, error: '会員が見つかりません' };
      on = !!on; reason = String(reason || '').trim();
      if (on && !reason) return { ok: false, errors: { reason: '理由を入れてください' } };
      var at = nowIso(), by = staffIdNow();
      db.update(function (s) {
        var ex = s.members[no] = s.members[no] || { tags: [], memo: '' };
        ex.suspended = on;
        if (on) { ex.suspendedAt = at; ex.suspendedBy = by; ex.suspendReason = reason; }
        else { ex.suspendedAt = null; ex.suspendReason = ''; ex.resumedAt = at; ex.resumedBy = by; }
      });
      // デモ会員は会員ページの保存にも書く（開いている会員ページのタブがすぐ止まる・戻る）
      if (m.live) { var r = ruleCall('setLoginBlocked', [on, reason]); if (!r.ok) return r; }
      return { ok: true, live: !!m.live,
        audit: { action: on ? 'suspend' : 'unsuspend', label: on ? 'ログインを止めた' : 'ログインを再開した', target: { type: 'member', id: no, name: m.name }, reason: reason } };
    },

    /* ---------- 記録の書き出し・削除の申込み（デモ会員が会員ページのアカウントから出したもの） ---------- */
    dataRequests: function () { var R = Rl(); try { return R && R.dataRequests ? R.dataRequests() : []; } catch (e) { return []; } },
    /** 受付中の申込みを済みにする（R.completeDataRequest。会員にお知らせが届き、会員ページのアカウントも「済み」になる） */
    completeDataRequest: function (id) {
      var r = ruleCall('completeDataRequest', [id]);
      if (!r.ok) return r;
      var q = r.request || {}, m = member(liveNo()) || { no: liveNo(), name: liveNo() };
      return { ok: true, request: q,
        audit: { action: 'data_request_done', label: (q.label || '記録の申込み') + 'を済みにした', target: { type: 'member', id: m.no, name: m.name },
          detail: (q.at ? DATA.md(q.at) + 'の申込み' : '') } };
    },

    /* ---------- 面談の枠 ---------- */
    meetSlots: function (fn) {
      var cfg = db.update(function (s) {
        var c = s.meetSlots = s.meetSlots || { min: 15, weekly: [], off: [] };
        c.weekly = c.weekly || []; c.off = c.off || [];
        if (fn) fn(c);
        return c;
      });
      syncSlots(cfg);
      return cfg;
    },

    /* ---------- 運営が直す中身（会員ページの R.cms*） ---------- */
    cms: function (kind, obj) { return ruleCall('cmsUpsert', [kind, obj]); },
    cmsRemove: function (kind, id) { return ruleCall('cmsRemove', [kind, id]); },
    cmsReorder: function (kind, ids, group) { return ruleCall('cmsReorder', [kind, ids, group]); },
    cmsError: cmsError,

    /** 運営のデモを最初に戻すとき：会員ページの側に書いた運営の中身も戻す（会員の学び・投稿の記録には触らない）。
        CMS・面談の枠・ログインの停止と、タイムラインの見回り（通報の対応を受付に戻し、R.resetStaffFeed で
        運営の投稿・固定・隠した投稿とコメントを消す。どれも見る人を切り替えても残るので、ここで消さないと会員ページに残る） */
    resetLinks: function () {
      var R = Rl(), st = store.state || {};
      try { if (R.cmsReset) R.cmsReset(); } catch (e) { console.error(e); }
      try { if (R.setMeetingSlots && R.meetingSlotConfig && R.meetingSlotConfig()) R.setMeetingSlots(null); } catch (e) { console.error(e); }
      try { if (R.setLoginBlocked && st.loginBlock) R.setLoginBlocked(false); } catch (e) { console.error(e); }
      try {
        (st.reports || []).forEach(function (x) { if (x.status && x.status !== '受付' && R.resolveReport) R.resolveReport(x.id, 'open'); });
        if (R.resetStaffFeed) R.resetStaffFeed();
      } catch (e) { console.error(e); }
    }
  };
  /** 運営画面の面談の枠を、会員ページの面談の候補にも渡す（毎週の枠が1つもなければ、会員ページの設定を消して運営画面の保存に任せる） */
  function syncSlots(cfg) {
    var R = Rl();
    if (!R || typeof R.setMeetingSlots !== 'function' || !cfg) return;
    try {
      if ((cfg.weekly || []).length) R.setMeetingSlots({ min: cfg.min || 15, weekly: cfg.weekly, off: cfg.off || [] });
      else if (R.meetingSlotConfig && R.meetingSlotConfig()) R.setMeetingSlots(null);
    } catch (e) { console.error(e); }
  }
})(window);
