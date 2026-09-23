#!/bin/sh
# 公開前に版番号を上げる（GitHub Pages は CSS と JS を10分キャッシュするため）
# index.html と member.html の ?v=... を、いまの日時に書き換えるだけ。
v=$(date +%Y%m%d%H%M%S)
for f in index.html member.html; do
  sed -i '' -E "s/\?v=[0-9]+/?v=$v/g" "$f"
done
echo "v=$v"
