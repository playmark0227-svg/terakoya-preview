# TAISEI 試作版

月額制のオンラインスクール兼コミュニティ「TAISEI」の試作です。
公開サイト（紹介・入会の申込み）、会員ページ、運営画面の動く見本です。

- 公開サイト: https://playmark0227-svg.github.io/terakoya-preview/
- 会員ページ（デモ会員で開く）: https://playmark0227-svg.github.io/terakoya-preview/member.html?demo=1
- 運営画面（デモのスタッフで開く）: https://playmark0227-svg.github.io/terakoya-preview/admin.html?demo=1

会員ページのログインの画面では「高橋さくら（24日目・Lv3）で入る」を押すとすぐ入れます。

## 注意

- 料金・内容は検討中のもので、確定したものではありません。
- 掲載している人物・案件・数値はすべて架空です。実在の企業・団体・個人とは関係ありません。
- 決済・通知・メッセージの返信は動きを再現しているだけで、外には何も送りません。カード番号を入力する欄もありません。
- 操作した内容は、見ているブラウザの localStorage にだけ保存されます。
- 検索エンジンには載らない設定（noindex・robots.txt）にしています。

## 写真について

人物の写真は、画像生成（Higgsfield）で作ったイメージ写真です。写っている人は実在しません。

## 構成

ビルドの要らない静的なサイトです。手元では次のコマンドで確かめられます。

```bash
python3 -m http.server 8770
```

```
index.html          公開サイト（紹介・入会の申込み・特商法表記などのひな形）
member.html         会員ページ
admin.html          運営画面
assets/css/         色・部品・画面ごとのスタイル
assets/js/          データ・ルール・各画面（運営画面は assets/js/admin/）
assets/img/         ロゴ・アイコン・写真・スクリーンショット
tools/render-check.js  各画面が例外なく描けるかを Node で確かめる
tools/shoot.js      全画面のスクリーンショットを撮り、見た目を見回る
tools/lp-images.js  公開サイトに載せる会員ページの画像を作る
tools/prep-images.js  生成した写真を切り抜いて Web 用にする（元画像は非公開）
bump.sh             公開前に ?v= の版番号を上げる（キャッシュ対策）
```
