#!/bin/sh
# 公開前に版番号を上げる（GitHub Pages は CSS と JS を10分キャッシュするため）
#   ./bump.sh          index.html・member.html・admin.html の ?v=... を、いまの日時に書き換える。
#                      data.js の SITE.version を README の1行目（「試作版 v0.3」）にも写す。
#                      あわせて、3つの HTML が読む CSS・JS に ?v= の付け忘れ・ファイルの無いものがないか、
#                      画面のファイル（screens/*・admin/*）で HTML が読み込んでいないものがないかを見る（知らせるだけ）。
#   ./bump.sh --shots  先に公開サイトのスクリーンショット（assets/img/shot-*.webp）を撮り直す（tools/lp-images.js）。
#                      http://localhost:8770 がこのフォルダを出していなければ、撮るあいだだけ空いている番号（8791〜）で
#                      サーバーを立てて、終わったら止める。
cd "$(dirname "$0")" || exit 1

PAGES="index.html member.html admin.html"

# このフォルダを出しているサーバーか（別のフォルダを出している同じ番号のサーバーで撮らないように）
same_dir() { curl -s "$1/bump.sh" | cmp -s - bump.sh; }

if [ "$1" = "--shots" ]; then
  base=http://localhost:8770 pid=
  if ! same_dir "$base"; then
    base=
    for p in 8791 8792 8793 8794 8795 8796 8797 8798; do
      curl -s -o /dev/null "http://localhost:$p/" && continue   # ほかで使っている番号は飛ばす
      python3 -m http.server "$p" --bind 127.0.0.1 >/dev/null 2>&1 &
      pid=$!
      sleep 1
      if same_dir "http://localhost:$p"; then base=http://localhost:$p; break; fi
      { kill "$pid"; wait "$pid"; } 2>/dev/null; pid=
    done
    [ -z "$base" ] && { echo "撮るためのサーバーを立てられなかった"; exit 1; }
  fi
  BASE=$base NODE_PATH=$(npm root -g) node tools/lp-images.js
  st=$?
  [ -n "$pid" ] && { kill "$pid"; wait "$pid"; } 2>/dev/null
  [ $st -ne 0 ] && { echo "撮り直しに失敗したので、版番号は上げない"; exit $st; }
fi

v=$(date +%Y%m%d%H%M%S)
for f in $PAGES; do
  if [ -f "$f" ]; then
    n=$(grep -o '?v=[0-9]*' "$f" | wc -l | tr -d ' ')
    sed -i '' -E "s/\?v=[0-9]+/?v=$v/g" "$f"
    echo "$f：$n か所"
  else
    echo "$f がない"
  fi
done
echo "v=$v"

# 読み込みの見回り（知らせるだけ。版番号はもう上げてある）
warn=$(
for f in $PAGES; do
  [ -f "$f" ] || continue
  # ?v= の付いていない CSS・JS（キャッシュが残って、直したものが届かない）
  grep -oE '(href|src)="assets/[^"?]+\.(css|js)"' "$f" | sed -E 's/^(href|src)="//; s/"$//' | while read -r a; do
    echo "$f：$a に ?v= が付いていない"
  done
  # 読み込むファイルが無い
  grep -oE '(href|src)="assets/[^"?]+\.(css|js)\?v=' "$f" | sed -E 's/^(href|src)="//; s/\?v=$//' | while read -r a; do
    [ -f "$a" ] || echo "$f：$a が見つからない"
  done
done
# 画面のファイルがあるのに HTML が読み込んでいない（画面を足したときの付け忘れ）
for a in assets/js/screens/*.js assets/css/screens/*.css; do
  [ -f "$a" ] && ! grep -q "\"$a?v=" member.html && echo "member.html：$a を読み込んでいない"
done
for a in assets/js/admin/*.js assets/css/admin/*.css; do
  [ -f "$a" ] && ! grep -q "\"$a?v=" admin.html && echo "admin.html：$a を読み込んでいない"
done
)
if [ -n "$warn" ]; then
  printf '%s\n' "$warn"
  echo "読み込みの見回り：$(printf '%s\n' "$warn" | wc -l | tr -d ' ') 件（HTML を直してから、もう一度 ./bump.sh）"
else
  echo "読み込みの見回り：問題なし"
fi

# 版の名前：data.js の SITE.version を README に写す（README のほうが新しいときは、data.js を直すよう知らせるだけ）
ver=$(sed -n "s/^[[:space:]]*version: '\([0-9.]*\)'.*/\1/p" assets/js/data.js | head -1)
cur=$(sed -n '1s/.*試作版 v\([0-9.]*\).*/\1/p' README.md)
if [ -n "$ver" ] && [ -n "$cur" ] && [ "$ver" != "$cur" ]; then
  newer=$(printf '%s\n%s\n' "$ver" "$cur" | sort -t. -k1,1n -k2,2n -k3,3n | tail -1)
  if [ "$newer" = "$ver" ]; then
    sed -i '' "1s/試作版 v[0-9.]*/試作版 v$ver/" README.md
    echo "README の版を v$ver にした"
  else
    echo "data.js の SITE.version（$ver）が README（v$cur）より古い。assets/js/data.js を直すこと"
  fi
fi
