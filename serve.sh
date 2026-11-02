#!/bin/sh
# Local dev server. Open the printed localhost URL (NOT 0.0.0.0, browsers block that, and NOT file://).
PORT="${1:-8000}"
echo "→ open  http://localhost:$PORT/"
exec python3 -m http.server "$PORT" --bind 127.0.0.1
