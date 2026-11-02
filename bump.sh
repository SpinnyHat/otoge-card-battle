#!/bin/sh
# Usage: ./bump.sh 2026-11-04a   -> new cache-busting id in index.html (css, import map, ui.js) and js/version.js
[ -z "$1" ] && { echo "usage: ./bump.sh <build-id>"; exit 1; }
OLD=$(sed -n "s/.*BUILD = '\([^']*\)'.*/\1/p" js/version.js)
sed -i "s/?v=$OLD/?v=$1/g" index.html
sed -i "s/BUILD = '$OLD'/BUILD = '$1'/" js/version.js
echo "build $OLD -> $1"
