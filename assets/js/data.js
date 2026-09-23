/* ============================================================
   初期データ（試作版）
   ------------------------------------------------------------
   - 人物・案件・数値はすべて架空。実在の企業・団体・個人とは関係ない。
   - 日付は「今日」からの相対で作る。いつ開いても新しく見えるようにするため。
   - 料金・料率・レベルの閾値は検討中の仮の値。ここを直せば全画面に反映される。
   ============================================================ */
(function (global) {
  'use strict';
  var CLG = global.CLG = global.CLG || {};

  /* いまの時刻。検証で動かしたいときはここを差し替える */
  CLG.now = function () { return new Date(); };

  /** 今日から days 日後の hh:mm（負なら過去） */
  function D(days, hh, mm) {
    var d = CLG.now();
    d.setHours(hh == null ? 10 : hh, mm || 0, 0, 0);
    d.setDate(d.getDate() + days);
    return d.toISOString();
  }
  /** いまから minutes 分前 */
  function ago(minutes) { return new Date(CLG.now().getTime() - minutes * 60000).toISOString(); }

  /* ---------- サービスの基本 ---------- */
  var SITE = {
    name: 'TERAKOYA',
    nameJa: 'テラコヤ',
    seal: '寺',
    note: '仮称',
    catchcopy: '学ぶ・稼ぐ・つながるを、ひとつの場所で。',
    lead: '月額1万円の、令和の寺子屋。副業の最初の一歩から、事業を育てるところまで。',
    price: 10000,          // 月額（税込・検討中）
    entryFee: 0,
    billing: '入会日から1ヶ月ごとの自動更新（日割りなし）',
    payment: 'クレジットカード（Stripe）',
    company: '運営会社（調整中）',
    siteUrl: 'https://example.com/',   // 紹介リンクの土台。本番のドメインに差し替える
    lineName: '公式LINE（準備中）'
  };

  /* ---------- 学びのレベル ----------
     講座・イベント参加・投稿などで「学びの経験値（XP）」がたまり、レベルが上がる。
     講座はレベルで開く。紹介の人数ではレベルは上がらない（勧誘を学びの条件にしないため）。 */
  var LEVELS = [
    { lv: 1, name: '入門',     min: 0 },
    { lv: 2, name: '手習い',   min: 120 },
    { lv: 3, name: '読み書き', min: 300 },
    { lv: 4, name: '実践',     min: 560 },
    { lv: 5, name: '一人立ち', min: 900 },
    { lv: 6, name: '師範代',   min: 1400 }
  ];

  var XP = {
    lesson: 20,        // 講座を1本見終える
    archive: 10,       // 勉強会アーカイブを1本見る
    event: 30,         // イベントに参加する
    post: 5,           // タイムラインに投稿する
    postPerDay: 3,     // 投稿でXPが付くのは1日この回数まで
    gigDone: 40        // 案件をやり終える
  };

  /* ---------- 学部と講座 ----------
     level: その講座が開くレベル
     lessons: [id, 題, 分] */
  var FACULTIES = [
    { id: 'basic', name: 'はじめの学部', desc: '副業の全体像と、お金・時間の土台をつくる' },
    { id: 'sns',   name: '発信の学部',   desc: 'SNSで見つけてもらい、信頼してもらう' },
    { id: 'skill', name: '在宅スキルの学部', desc: '家で完結する仕事の腕を身につける' },
    { id: 'sales', name: '営業の学部',   desc: '人に紹介し、仕事を取ってくる力' },
    { id: 'biz',   name: '起業の学部',   desc: '自分の事業を立ち上げ、育てる' }
  ];

  function L(prefix, rows) {
    return rows.map(function (r, i) { return { id: prefix + '-' + (i + 1), title: r[0], min: r[1] }; });
  }

  var COURSES = [
    { id: 'orientation', faculty: 'basic', level: 1, title: 'オリエンテーション', teacher: 'staff2',
      summary: 'この場所の使い方と、最初の30日の過ごし方。まずはここから。',
      lessons: L('ori', [['ようこそ。この場所でできること', 8], ['会員ページの使い方（5分で全部）', 6], ['最初の30日で目指すところ', 9], ['コミュニティのルールと、紹介のルール', 7]]) },
    { id: 'business-basic', faculty: 'basic', level: 1, title: 'ビジネスの基礎', teacher: 'staff1',
      summary: '「商売」とは何かを、会社員の目線から組み立て直す。',
      lessons: L('bb', [['お金はどこから生まれるか', 14], ['「売れる」の正体は信頼の貯金', 12], ['副業の種類と、向き不向き', 16], ['1日30分でできる副業の設計', 11], ['やらないことを決める', 9]]) },
    { id: 'okozukai', faculty: 'basic', level: 1, title: 'お小遣い案件の始め方', teacher: 'staff2',
      summary: 'スマホと家だけで完結する小さな案件で、最初の1円を得る。',
      lessons: L('ok', [['お小遣い案件って何？安全に選ぶ3つの目', 10], ['モニター・アンケート案件の進め方', 8], ['報酬の受け取りと記録のつけ方', 7]]) },
    { id: 'money-tax', faculty: 'basic', level: 1, title: 'お金と税金の基礎', teacher: 'guest1',
      summary: '副業の確定申告、経費、20万円の壁。税理士がやさしく話します。',
      lessons: L('mt', [['副業と確定申告、最初に知っておくこと', 15], ['経費になるもの・ならないもの', 13], ['帳簿は「スマホで週1」で足りる', 10], ['開業届はいつ出す？', 9]]) },
    { id: 'sns-basic', faculty: 'sns', level: 1, title: 'SNS発信入門', teacher: 'staff4',
      summary: 'フォロワー数より「誰に何を届けるか」。発信の軸を決める。',
      lessons: L('sb', [['発信で得られるもの・失うもの', 10], ['自分の「軸」を一行で言う', 12], ['プロフィールの整え方', 9], ['投稿を続けるための型', 11], ['数字の見方（週1でOK）', 8]]) },
    { id: 'ai', faculty: 'skill', level: 2, title: 'AI活用', teacher: 'staff3',
      summary: '生成AIを「相棒」にして、作業時間を半分にする。',
      lessons: L('ai', [['生成AIでできること・できないこと', 12], ['指示の出し方（プロンプト）の基本', 15], ['文章・企画・表計算をAIと作る', 18], ['画像と動画のAI', 14], ['AIで副業の作業を減らす実例', 16]]) },
    { id: 'writing', faculty: 'skill', level: 2, title: 'ライティング', teacher: 'guest2',
      summary: '読まれる文章、伝わる文章。在宅ワークの基本の腕。',
      lessons: L('wr', [['「読まれる」文章の型', 12], ['見出しと要約の作り方', 10], ['取材して書く', 14], ['納品前のチェック表', 8]]) },
    { id: 'instagram', faculty: 'sns', level: 3, title: 'Instagram運用', teacher: 'staff4',
      summary: '地域のお店や自分のサービスを、Instagramで知ってもらう。',
      lessons: L('ig', [['アカウント設計（誰に、何を）', 14], ['保存される投稿の作り方', 16], ['リールの基本', 13], ['ストーリーズで関係を深める', 11], ['運用代行として仕事にする', 15]]) },
    { id: 'video', faculty: 'skill', level: 3, title: '動画編集', teacher: 'staff3',
      summary: 'ショート動画の編集を、スマホとPCで。案件につながる実技。',
      lessons: L('vd', [['編集ソフトの準備と基本操作', 16], ['カットとテンポ', 14], ['テロップの入れ方', 15], ['音と効果音', 11], ['ポートフォリオを作る', 12], ['はじめての納品', 10]]) },
    { id: 'design', faculty: 'skill', level: 3, title: 'Webデザイン', teacher: 'staff4',
      summary: 'バナー、チラシ、かんたんなホームページ。デザインの基本と実務。',
      lessons: L('ds', [['デザインの4原則', 12], ['配色と文字の選び方', 13], ['バナーを1枚つくる', 18], ['ノーコードでホームページ', 20], ['見積もりと納品', 10]]) },
    { id: 'sales-basic', faculty: 'sales', level: 3, title: '営業・セールスの基本', teacher: 'staff5',
      summary: '売り込まない営業。聞いて、整理して、提案する。',
      lessons: L('sl', [['営業は「相手の困りごと」を聞く仕事', 12], ['最初の5分でやること', 11], ['提案書は1枚でいい', 14], ['断られたときの考え方', 9], ['紹介をお願いする作法', 10]]) },
    { id: 'marketing', faculty: 'biz', level: 4, title: 'マーケティング', teacher: 'staff1',
      summary: '誰に、何を、どう届けるか。売れる仕組みの全体図。',
      lessons: L('mk', [['市場と顧客を決める', 15], ['商品の価値を言葉にする', 14], ['集客の入口をつくる', 16], ['LINEでつながり続ける', 13], ['数字で改善する', 12]]) },
    { id: 'affiliate', faculty: 'sales', level: 4, title: '紹介・営業代行の始め方', teacher: 'staff5',
      summary: '会員限定の商材を、知人に誠実に紹介する方法とルール。',
      lessons: L('af', [['紹介と営業代行のしくみ', 11], ['法律とルール（やってはいけないこと）', 14], ['つなぐだけの「トスアップ」', 9], ['信頼を失わない紹介の仕方', 12]]) },
    { id: 'freelance', faculty: 'sales', level: 4, title: 'フリーランスで案件を取る', teacher: 'staff5',
      summary: '営業職・制作職の業務委託で、継続案件を持つ。',
      lessons: L('fl', [['フリーランスという働き方', 12], ['職務経歴を「売れる形」に書き直す', 15], ['面談で聞かれること', 11], ['単価の決め方と交渉', 13], ['継続してもらう人の共通点', 10]]) },
    { id: 'shortvideo', faculty: 'sns', level: 4, title: 'ショート動画で伸ばす', teacher: 'staff3',
      summary: 'TikTok・リール・ショートで、見つけてもらう入口をつくる。',
      lessons: L('sv', [['ショート動画の視聴のされ方', 10], ['最初の2秒', 12], ['企画の出し方', 14], ['撮影から投稿まで30分', 15]]) },
    { id: 'startup', faculty: 'biz', level: 5, title: '起業・法人化', teacher: 'staff1',
      summary: '個人事業から会社へ。数字、契約、人を雇う前に。',
      lessons: L('su', [['個人事業と法人の違い', 14], ['事業計画を1枚にする', 16], ['資金の集め方', 15], ['契約書の読み方', 13], ['人に任せる', 12]]) },
    { id: 'nocode', faculty: 'skill', level: 5, title: 'ノーコード・プログラミング', teacher: 'staff3',
      summary: 'コードを書かずに業務アプリを作る。書けるともっと広がる。',
      lessons: L('nc', [['ノーコードでできること', 12], ['予約フォームを作る', 18], ['スプレッドシートを自動化する', 17], ['AIにコードを書いてもらう', 16], ['小さなWebアプリを公開する', 20]]) },
    { id: 'coaching', faculty: 'biz', level: 5, title: 'コーチングと自分の育て方', teacher: 'staff2',
      summary: '続ける力、決める力。自分と仲間を前に進める技術。',
      lessons: L('co', [['目標は「行動」で立てる', 12], ['習慣を設計する', 11], ['人の話を聴く', 14], ['チームで進む', 12]]) },
    { id: 'teacher', faculty: 'biz', level: 6, title: '師範代講座（講座を出す側へ）', teacher: 'staff1',
      summary: '学んだことを講座にして、この場所で教える。自分の講座を出店する。',
      lessons: L('tc', [['教えることで、いちばん学べる', 10], ['講座の設計図', 16], ['収録と編集', 14], ['出店の手続きと分配のしくみ', 12]]) }
  ];

  /* 勉強会アーカイブ（ライブの録画。レベルに関係なく全員が見られる） */
  var ARCHIVE = [
    { id: 'ar-1', genre: 'AI・SNS',   title: 'AI勉強会：ChatGPTで「作業時間半分」実演会', date: D(-5, 20), min: 72, teacher: 'staff3' },
    { id: 'ar-2', genre: '在宅ワーク', title: 'ホームページ制作もくもく会（ノーコード）', date: D(-9, 20), min: 95, teacher: 'staff4' },
    { id: 'ar-3', genre: '紹介・営業', title: '紹介・営業代行 勉強会（はじめての人向け）', date: D(-12, 21), min: 64, teacher: 'staff5' },
    { id: 'ar-4', genre: 'お金',       title: '副業の確定申告 Q&A 大会', date: D(-16, 20), min: 88, teacher: 'guest1' },
    { id: 'ar-5', genre: 'AI・SNS',   title: 'SNS初心者勉強会：最初の10投稿', date: D(-19, 20), min: 58, teacher: 'staff4' },
    { id: 'ar-6', genre: 'マインド',   title: '月末の成果発表会（先月）', date: D(-26, 20), min: 110, teacher: 'staff1' },
    { id: 'ar-7', genre: '在宅ワーク', title: '動画編集 勉強会：テロップだけで30分', date: D(-30, 20), min: 61, teacher: 'staff3' },
    { id: 'ar-8', genre: 'お金',       title: '家計と副業：固定費の見直し会', date: D(-37, 20), min: 54, teacher: 'staff2' }
  ];

  /* ---------- 人（すべて架空） ---------- */
  var PEOPLE = {
    staff1: { name: '森 大輔',   role: '運営代表',             staff: true, color: '#c63f25' },
    staff2: { name: '佐藤 圭',   role: 'コミュニティ運営',     staff: true, color: '#274868' },
    staff3: { name: '青木 はると', role: '講師（AI・動画・開発）', staff: true, color: '#2c7a53' },
    staff4: { name: '小林 みお', role: '講師（デザイン・SNS）', staff: true, color: '#9a4f8a' },
    staff5: { name: '石田 けんじ', role: '講師（営業）',        staff: true, color: '#9a6512' },
    guest1: { name: '中村 税理士', role: '提携税理士',          staff: true, color: '#55514a' },
    guest2: { name: '松本 ゆう', role: '講師（ライティング）',  staff: true, color: '#3f6f8f' },
    m1:  { name: '佐々木 ゆか', area: '北海道 旭川市', lv: 3, color: '#c0694e' },
    m2:  { name: '山本 りな',   area: '北海道 札幌市', lv: 2, color: '#6a8caf' },
    m3:  { name: '伊藤 ひろし', area: '沖縄県 那覇市', lv: 5, color: '#4f8a6b' },
    m4:  { name: '渡辺 まい',   area: '福岡県 福岡市', lv: 4, color: '#b0875a' },
    m5:  { name: '中島 こうた', area: '東京都 世田谷区', lv: 6, color: '#5b6fa8' },
    m6:  { name: '小川 ともみ', area: '大阪府 堺市', lv: 3, color: '#a0617f' },
    m7:  { name: '井上 だいき', area: '宮城県 仙台市', lv: 4, color: '#7b8f4f' },
    m8:  { name: '木村 あや',   area: '沖縄県 浦添市', lv: 5, color: '#c27a3e' },
    m9:  { name: '林 しょうへい', area: '愛知県 名古屋市', lv: 3, color: '#4e7f93' },
    m10: { name: '清水 なつみ', area: '北海道 函館市', lv: 2, color: '#b8647a' },
    m11: { name: '山口 けい',   area: '広島県 広島市', lv: 4, color: '#6b7f5e' },
    m12: { name: '松田 さとみ', area: '神奈川県 横浜市', lv: 5, color: '#8f6aa8' },
    m13: { name: '岡田 ゆうと', area: '静岡県 浜松市', lv: 2, color: '#5d8a8a' },
    m14: { name: '藤井 かおり', area: '沖縄県 沖縄市', lv: 4, color: '#a57758' }
  };

  /* ---------- デモ会員（ログイン画面のボタンで入る人） ---------- */
  var MEMBER = {
    id: 'TK-000128',
    name: '高橋 さくら',
    kana: 'たかはし さくら',
    area: '北海道 旭川市',
    job: '会社員（事務）・2児の母',
    goal: '在宅で、月3万円の副収入をつくる',
    joinedDaysAgo: 23,
    color: '#c63f25',
    refCode: 'SAKURA128',
    email: 'sakura@example.com',
    card: 'Visa •••• 4242'
  };

  /* ---------- 最初の30日（スタートガイド） ----------
     week: 何週目の目安 / go: 押すと飛ぶ先 / auto: 他の画面の操作で自動で済になるもの */
  var ONBOARDING = [
    { id: 'profile',  week: 1, xp: 10, title: 'プロフィールを整える', desc: '名前・地域・いまのお仕事。仲間があなたを見つけやすくなります。', go: '#/account' },
    { id: 'orient',   week: 1, xp: 20, title: 'オリエンテーションを見る', desc: '全4本・30分。この場所の使い方がひと通り分かります。', go: '#/courses/orientation', auto: 'course:orientation' },
    { id: 'line',     week: 1, xp: 10, title: 'LINEで通知を受け取る', desc: '新しい講座・案件・イベントをLINEでお知らせします。', go: '#/account' },
    { id: 'intro',    week: 1, xp: 10, title: 'タイムラインで自己紹介する', desc: 'ひな形があるので1分で書けます。', go: '#/feed?intro=1', auto: 'post:intro' },
    { id: 'goal',     week: 2, xp: 10, title: '30日後の目標を決める', desc: '「何を」「いつまでに」。運営があなたの目標に合わせて案内します。', go: '#/start' },
    { id: 'meet',     week: 2, xp: 10, title: '運営と15分の面談を予約する', desc: '進め方の相談、何でもどうぞ。回数の制限はありません。', go: '#/messages?kind=面談の予約' },
    { id: 'lesson3',  week: 2, xp: 20, title: '講座を3本見終える', desc: 'どの講座でもかまいません。', go: '#/courses', auto: 'lessons:3' },
    { id: 'gig',      week: 3, xp: 20, title: '最初の案件に応募する', desc: 'お小遣い案件なら、スマホだけで今日から始められます。', go: '#/gigs', auto: 'gig:any' },
    { id: 'event',    week: 3, xp: 10, title: 'イベントに1回参加する', desc: 'オンラインの勉強会でも、地域のオフ会でも。', go: '#/events', auto: 'event:any' },
    { id: 'showcase', week: 4, xp: 30, title: '月末の成果発表会で、30日をふり返る', desc: '3分で「やったこと・できたこと・次」。見るだけの参加もOK。', go: '#/events', auto: 'event:showcase' }
  ];

  /* ---------- タイムライン ----------
     kind: news(運営から) / new(新着講座・アーカイブ) / gig(新着案件) / event / win(会員の成果) / post(会員の投稿) */
  var FEED = [
    { id: 'p1', kind: 'news', by: 'staff2', at: ago(42), pinned: true,
      text: '【10月の予定が出ました】\n月末の成果発表会は今月から地域の会場とオンラインの同時開催です。札幌・那覇の会場は各15名まで。イベントのページから予約できます。', likes: 31 },
    { id: 'p2', kind: 'win', by: 'm1', at: ago(95),
      text: '動画編集の講座、第3回まで終わりました！\n子どもが寝たあとの30分ずつ。テロップが入るだけで一気に「それっぽく」なって楽しいです。', likes: 18, comments: 4 },
    { id: 'p3', kind: 'new', by: 'staff3', at: ago(60 * 5), link: '#/courses/ai',
      text: '「AI活用」に新しい回を追加しました。\n第5回：AIで副業の作業を減らす実例（16分）。実際の案件でどこをAIに任せたかを全部見せています。', likes: 24 },
    { id: 'p4', kind: 'gig', by: 'staff5', at: ago(60 * 8), link: '#/gigs',
      text: '新着案件：地域の飲食店のInstagram投稿代行（月8投稿・在宅）。Instagram運用の講座を修了した方が対象です。', likes: 12 },
    { id: 'p5', kind: 'post', by: 'm3', at: ago(60 * 11),
      text: '那覇のオフ会、今月もやります。初参加の方が3名いるので、はじめての方も気軽に。子連れOKのお店です。', likes: 9, comments: 2 },
    { id: 'p6', kind: 'win', by: 'm4', at: ago(60 * 20),
      text: 'はじめての業務委託（営業のアポ取り）、今日で1ヶ月続きました。営業の学部の「最初の5分でやること」を毎朝見返してます。', likes: 27, comments: 6 },
    { id: 'p7', kind: 'event', by: 'staff2', at: ago(60 * 26), link: '#/events',
      text: '今週の新入生オリエンテーションは水曜20時から。入会したばかりの方は、ここで会員ページの使い方をひと通り説明します（録画あり）。', likes: 8 },
    { id: 'p8', kind: 'post', by: 'm10', at: ago(60 * 30),
      text: '確定申告のQ&Aアーカイブ、ありがたすぎる…。去年ぜんぶ手書きでやってたのを思い出して泣いてます。', likes: 15, comments: 3 },
    { id: 'p9', kind: 'news', by: 'staff1', at: ago(60 * 50),
      text: '会員のみなさんの声を受けて、講座の並びを「レベルで開く」形に変えました。いまの自分に必要な講座だけが上に出ます。まずはスタートガイドから進めてみてください。', likes: 44 },
    { id: 'p10', kind: 'post', by: 'm7', at: ago(60 * 72),
      text: '仙台で月1のもくもく会を始めたいです。興味ある方いたらコメントください！', likes: 11, comments: 5 }
  ];

  /* 自己紹介のひな形（スタートガイドの「自己紹介」から使う） */
  var INTRO_TEMPLATE = 'はじめまして、{name}です。\n住んでいるところ：{area}\nいまのお仕事：{job}\nここでやりたいこと：{goal}\nよろしくお願いします！';

  /* ---------- 案件 ----------
     type: small(お小遣い案件) / refer(紹介できる商材) / work(業務委託) / peer(会員どうしの募集)
     reward: 表示用の文字列（目安）。rewardType: shot(1回) / stock(毎月) */
  var GIGS = [
    { id: 'g1', type: 'small', title: '商品モニター（日用品・スマホで完結）', reward: '1件 500〜1,500円', rewardType: 'shot', level: 1,
      time: '1件 15分', remote: true, slots: '随時', by: 'staff2', isNew: true,
      desc: '届いた日用品を使って、スマホからアンケートに答える案件です。写真の提出がある回もあります。',
      steps: ['応募する', '運営から手順が届く', '商品が届いたら使ってアンケートに回答', '翌月末に報酬のお支払い'] },
    { id: 'g2', type: 'small', title: 'アプリのテストユーザー（新サービス）', reward: '1回 2,000円', rewardType: 'shot', level: 1,
      time: '30〜40分', remote: true, slots: '残り12名', by: 'staff3',
      desc: '開発中のアプリを触って、使いにくいところを教えてください。オンラインで画面を共有しながら行います。',
      steps: ['応募する', '日程を選ぶ', 'オンラインで40分', '当月末にお支払い'] },
    { id: 'g3', type: 'small', title: '音声の文字起こし（10分の音声）', reward: '1本 800円', rewardType: 'shot', level: 1,
      time: '1本 40分目安', remote: true, slots: '随時', by: 'staff2',
      desc: '勉強会の音声を文字にします。AIで下書きしてから直す手順をお渡しします。' },
    { id: 'g4', type: 'work', title: '飲食店のInstagram投稿代行（月8投稿）', reward: '月 24,000円', rewardType: 'stock', level: 3,
      time: '月 6〜8時間', remote: true, slots: '2名', by: 'staff4', requires: 'instagram', isNew: true,
      desc: '地域の飲食店の投稿づくりを任せてもらう案件です。写真はお店から届きます。文章と画像の加工、予約投稿までを担当します。',
      steps: ['応募する', '運営と15分の面談', 'お店とオンラインで顔合わせ', '稼働開始（月末締め・翌月払い）'] },
    { id: 'g5', type: 'work', title: 'ショート動画の編集（1本60秒）', reward: '1本 3,000円', rewardType: 'shot', level: 3,
      time: '1本 1.5時間目安', remote: true, slots: '随時', by: 'staff3', requires: 'video',
      desc: '撮影済みの素材から、テロップと効果音を入れた60秒の縦動画を作ります。最初の3本は講師が添削します。' },
    { id: 'g6', type: 'work', title: '営業のアポイント獲得（業務委託・リモート）', reward: '時給 1,500円＋成果', rewardType: 'stock', level: 3,
      time: '週 10時間〜', remote: true, slots: '5名', by: 'staff5', requires: 'sales-basic',
      desc: '法人向けサービスの電話・メールでのアポイント獲得です。台本と研修があります。' },
    { id: 'g7', type: 'refer', title: '法人向けホームページ制作', reward: '成約額の10%', rewardType: 'shot', level: 1,
      time: 'つなぐだけ', remote: true, slots: '—', by: 'staff5',
      desc: 'ホームページを作りたい知り合いの会社・お店がいたら、担当者におつなぎください。商談と契約は担当者が行います。' },
    { id: 'g8', type: 'refer', title: 'SNS運用代行（中小企業向け）', reward: '月額の10%（継続中は毎月）', rewardType: 'stock', level: 1,
      time: 'つなぐだけ', remote: true, slots: '—', by: 'staff4',
      desc: 'SNSの運用を任せたい会社をご紹介ください。契約が続くあいだ、毎月報酬が発生します。' },
    { id: 'g9', type: 'refer', title: '営業職フリーランスの登録紹介', reward: '1名 5,000円（稼働開始で）', rewardType: 'shot', level: 1,
      time: 'つなぐだけ', remote: true, slots: '—', by: 'staff5',
      desc: '業務委託で営業の仕事を探している方をご紹介ください。面談のうえ、案件が決まったら報酬が発生します。' },
    { id: 'g10', type: 'peer', title: '【会員募集】子ども服ネットショップの商品撮影', reward: '1回 5,000円', rewardType: 'shot', level: 2,
      time: '2時間・札幌市内', remote: false, slots: '1名', by: 'm2',
      desc: '自宅で販売している子ども服の撮影を手伝ってくれる方を探しています。スマホ撮影でOKです。' },
    { id: 'g11', type: 'peer', title: '【会員募集】整体院のチラシデザイン', reward: '1点 8,000円', rewardType: 'shot', level: 3,
      time: '納期2週間', remote: true, slots: '1名', by: 'm7', requires: 'design',
      desc: 'A4片面のチラシです。写真と文章はこちらで用意します。' }
  ];

  var GIG_TYPES = [
    { id: 'small', name: 'お小遣い案件', desc: 'スマホや家で完結する、小さな案件' },
    { id: 'work',  name: 'お仕事（業務委託）', desc: '講座で学んだ腕を使う、継続の仕事' },
    { id: 'refer', name: '紹介できる商材', desc: '知り合いを担当者につなぐだけ' },
    { id: 'peer',  name: '会員どうし', desc: '会員が出している募集（手数料なし）' }
  ];

  /* ---------- イベント ----------
     kind: online / offline / showcase(成果発表会) */
  var EVENTS = [
    { id: 'e1', kind: 'online', title: '新入生オリエンテーション', at: D(1, 20), min: 60, place: 'オンライン（Zoom）', cap: 50, count: 18, fee: '無料', host: 'staff2', recording: true,
      desc: '入会したばかりの方向け。会員ページの使い方と、最初の30日の進め方を説明します。' },
    { id: 'e2', kind: 'online', title: 'AI勉強会（ライブ）：AIで見積書と提案書', at: D(3, 20, 30), min: 75, place: 'オンライン（Zoom）', cap: 100, count: 46, fee: '無料', host: 'staff3', recording: true,
      desc: '実際の案件の見積書と提案書を、AIと一緒に作るところを見せます。' },
    { id: 'e3', kind: 'offline', title: '札幌オフ会（子連れOK）', at: D(5, 11), min: 150, place: '札幌市中央区（会場は予約後にお知らせ）', cap: 15, count: 11, fee: '実費（ランチ代）', host: 'm2',
      desc: 'ランチを食べながら近況を話す会です。はじめての方歓迎。' },
    { id: 'e4', kind: 'showcase', title: '月末の成果発表会', at: D(6, 20), min: 120, place: 'オンライン＋札幌・那覇の会場', cap: 120, count: 64, fee: '無料（会場参加は実費）', host: 'staff1', recording: true,
      desc: '1人3分で「やったこと・できたこと・次」を話します。見るだけの参加もOK。優秀発表の方は代表との個別相談へ。' },
    { id: 'e5', kind: 'online', title: 'もくもく作業会（夜）', at: D(8, 21), min: 90, place: 'オンライン（Zoom・カメラ任意）', cap: 40, count: 12, fee: '無料', host: 'm5',
      desc: 'それぞれ自分の作業をする会です。最初と最後に5分だけ宣言と報告をします。' },
    { id: 'e6', kind: 'offline', title: '那覇オフ会', at: D(12, 19), min: 120, place: '那覇市（会場は予約後にお知らせ）', cap: 20, count: 9, fee: '実費（飲食代）', host: 'm3',
      desc: '沖縄在住の会員の交流会です。' },
    { id: 'e7', kind: 'online', title: '確定申告に備える会（税理士と）', at: D(15, 20), min: 60, place: 'オンライン（Zoom）', cap: 100, count: 22, fee: '無料', host: 'guest1', recording: true,
      desc: '副業1年目の方向け。今のうちにやっておくことを税理士が話します。' },
    { id: 'e8', kind: 'offline', title: '東京オフ会', at: D(19, 19), min: 120, place: '東京都内（会場は予約後にお知らせ）', cap: 30, count: 14, fee: '実費（飲食代）', host: 'staff1',
      desc: '運営メンバーも参加します。' }
  ];

  /* デモ会員がすでに参加したイベント（XPの記録に使う） */
  var PAST_EVENTS = [
    { id: 'pe1', title: '新入生オリエンテーション', at: D(-20, 20) },
    { id: 'pe2', title: 'SNS初心者勉強会：最初の10投稿', at: D(-19, 20) }
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
  var SHARE_TEMPLATE = '#PR 紹介リンクです\n私が入っている、月額制のオンラインスクール兼コミュニティ「{site}」。副業の学び直しを、仲間と続けられる場所です。\n月額{price}円（税込）・入会金なし・会員ページからいつでも解約できます。\n{url}';

  /* ---------- 貢献ポイント（ランキング用） ----------
     学びのレベルとは別。場を良くしてくれた人に付く。お金には換えない。有効期限は付与から1年。
     紹介した人数ではポイントは付かない（紹介を競わせないため）。 */
  var POINT_RULES = [
    { id: 'answer',  name: 'タイムラインで質問に答えた', pt: 10 },
    { id: 'thanks',  name: '「ありがとう」を受け取った', pt: 2 },
    { id: 'host',    name: 'イベントを主催・手伝った', pt: 50 },
    { id: 'speak',   name: '成果発表会で発表した', pt: 30 },
    { id: 'win',     name: '成果を報告した', pt: 20 },
    { id: 'welcome', name: '新入生に声をかけた', pt: 5 }
  ];
  /* 今月のランキング（デモ会員以外） */
  var RANKING = [
    { person: 'm5',  points: 420, xp: 640 },
    { person: 'm3',  points: 360, xp: 590 },
    { person: 'm8',  points: 290, xp: 560 },
    { person: 'm12', points: 240, xp: 480 },
    { person: 'm4',  points: 210, xp: 420 },
    { person: 'm7',  points: 180, xp: 350 },
    { person: 'm14', points: 150, xp: 300 },
    { person: 'm11', points: 120, xp: 260 },
    { person: 'm6',  points: 90,  xp: 210 },
    { person: 'm9',  points: 70,  xp: 150 },
    { person: 'm2',  points: 60,  xp: 180 },
    { person: 'm13', points: 20,  xp: 90 }
  ];
  var RANK_PRIZES = [
    '1位：代表との個別相談（60分）＋会員証に金の印',
    '2〜3位：講師との個別相談（30分）',
    '10位まで：会員証に今月の印'
  ];

  /* ---------- 福利厚生 ---------- */
  var PERKS = [
    { id: 'pk1', cat: '暮らし', title: '日用品・食料品の会員価格', desc: '提携の会員制通販で、いつもの日用品や食品を会員価格で買えます。割引率は商品によって変わります。', how: 'ID発行（会員ページで即日）' },
    { id: 'pk2', cat: '暮らし', title: '引越し・家電レンタルの割引', desc: '提携業者の基本料金が割引になります。', how: 'クーポンコード' },
    { id: 'pk3', cat: '子育て', title: 'ベビーシッター・家事代行の割引', desc: '勉強会やオフ会の時間に。提携サービスの利用料が割引になります。', how: 'クーポンコード' },
    { id: 'pk4', cat: '遊び', title: '映画館・カラオケ・漫画喫茶の割引', desc: '全国の提携施設で、会員証を見せると割引になります。', how: '会員証を提示' },
    { id: 'pk5', cat: '遊び', title: 'レジャー施設・旅行の優待', desc: '宿泊・テーマパーク・温浴施設などの優待価格。', how: '提携サイトから予約' },
    { id: 'pk6', cat: '仕事', title: 'コワーキングスペースの割引', desc: '提携のコワーキングを、会員価格のドロップインで使えます。', how: '会員証を提示' },
    { id: 'pk7', cat: '仕事', title: 'バーチャルオフィスの初期費用無料', desc: '開業届・法人化のときの住所に。', how: 'クーポンコード' },
    { id: 'pk8', cat: '学び', title: '資格講座・スクールの会員割引', desc: '簿記・FP・ITパスポートなどの提携講座が割引になります。', how: '提携サイトから申込' }
  ];

  /* 専門家の紹介（初回相談は無料・その後は各事務所の料金） */
  var EXPERTS = [
    { id: 'ex1', title: '税理士', desc: '確定申告、経費、開業届、法人化のタイミング。', note: '初回30分無料' },
    { id: 'ex2', title: '司法書士', desc: '会社の設立登記、役員変更、契約まわり。', note: '初回30分無料' },
    { id: 'ex3', title: '社会保険労務士', desc: '人を雇うとき、助成金、社会保険。', note: '初回30分無料' },
    { id: 'ex4', title: '行政書士', desc: '許認可、補助金の申請書類。', note: '初回30分無料' }
  ];

  /* ---------- 運営とのメッセージ ---------- */
  var THREAD = [
    { from: 'staff2', at: D(-23, 10, 5), text: '高橋さん、ご入会ありがとうございます！コミュニティ運営の佐藤です。\nまずは「スタートガイド」を上から進めてみてください。分からないことは、このメッセージでいつでも聞いてください。' },
    { from: 'me', at: D(-22, 21, 40), text: 'ありがとうございます。子どもが寝たあとの時間しか取れないのですが、それでも大丈夫でしょうか…？' },
    { from: 'staff2', at: D(-22, 22, 2), text: '大丈夫です！夜の30分で進めている方がいちばん多いです。講座は1本10分前後にしてあるので、1日1本を目安にどうぞ。\n来週水曜の新入生オリエンテーションも、録画があるので後から見られます。' },
    { from: 'me', at: D(-3, 13, 12), text: '副業の収入って、会社にバレないようにするにはどうしたらいいですか？' },
    { from: 'staff2', at: D(-3, 14, 30), text: '住民税の納め方で対応できることが多いです。「お金と税金の基礎」の第1回で説明しているので見てみてください。\n個別の事情は提携の税理士さんに無料で相談できます（福利厚生 → 専門家に相談）。' }
  ];

  var MESSAGE_KINDS = ['質問', '壁打ち・相談', '面談の予約', 'その他'];

  /* ---------- 支払い ---------- */
  /* 請求は入会日から1ヶ月ごと。デモ会員は入会時の1回だけ支払い済み */

  /* ---------- お知らせ（右上の鈴） ---------- */
  var NOTICES = [
    { id: 'n1', icon: 'message', text: '運営からメッセージが届いています', at: D(-3, 14, 30), go: '#/messages' },
    { id: 'n2', icon: 'calendar', text: '予約中の「月末の成果発表会」まであと6日', at: ago(60 * 3), go: '#/events' },
    { id: 'n3', icon: 'gift', text: '紹介リンクから1名が入会しました（報酬は30日後に確定）', at: D(-6, 18), go: '#/referral' },
    { id: 'n4', icon: 'play', text: '「AI活用」に新しい回が追加されました', at: ago(60 * 5), go: '#/courses/ai' }
  ];

  /* ---------- コミュニティのルール ---------- */
  var RULES = [
    '人を否定しない。質問に「そんなことも知らないの」は無し。',
    '会員どうしの勧誘・営業はしない（案件ページの「会員どうし」を使う）。',
    '紹介するときは、会費・解約の条件をそのまま伝える。「必ず稼げる」とは言わない。',
    'SNSで紹介するときは、紹介報酬があることを「#PR」などで分かるようにする。',
    '講座・アーカイブの中身は外に出さない。'
  ];

  CLG.DATA = {
    SITE: SITE, LEVELS: LEVELS, XP: XP, FACULTIES: FACULTIES, COURSES: COURSES, ARCHIVE: ARCHIVE,
    PEOPLE: PEOPLE, MEMBER: MEMBER, ONBOARDING: ONBOARDING, FEED: FEED, INTRO_TEMPLATE: INTRO_TEMPLATE,
    GIGS: GIGS, GIG_TYPES: GIG_TYPES, EVENTS: EVENTS, PAST_EVENTS: PAST_EVENTS,
    REFERRAL: REFERRAL, REFERRED: REFERRED, REF_CLICKS: REF_CLICKS, SHARE_TEMPLATE: SHARE_TEMPLATE,
    POINT_RULES: POINT_RULES, RANKING: RANKING, RANK_PRIZES: RANK_PRIZES,
    PERKS: PERKS, EXPERTS: EXPERTS, THREAD: THREAD, MESSAGE_KINDS: MESSAGE_KINDS,
    NOTICES: NOTICES, RULES: RULES,
    D: D, ago: ago
  };
})(window);
