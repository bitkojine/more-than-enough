#!/bin/sh
# Serve MORE THAN ENOUGH on your local network so you can play on your phone.
# Usage: ./serve.sh [port]   (default port 8000)
cd "$(dirname "$0")"
PORT="${1:-8000}"

IP=$(ipconfig getifaddr en0)
[ -z "$IP" ] && IP=$(ipconfig getifaddr en1)
[ -z "$IP" ] && IP=$(ipconfig getifaddr en2)

if [ -z "$IP" ]; then
  echo "Could not find your LAN IP automatically."
  echo "Find it in System Settings > Wi-Fi, then run:"
  echo "  python3 -m http.server $PORT --bind 0.0.0.0"
  exit 1
fi

echo ""
echo "MORE THAN ENOUGH is live on your network:"
echo "  http://$IP:$PORT"
echo ""
echo "Open that URL on your phone (same Wi-Fi) in Safari."
echo "Press Ctrl-C here to stop the server."
echo ""
exec python3 -m http.server "$PORT" --bind 0.0.0.0