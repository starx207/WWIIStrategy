DEV_PORTS := "4200"

# Stop processes listening on fixed local development ports.
[group("dev")]
clean-ports:
    #!/usr/bin/env bash
    set -euo pipefail

    if ! command -v lsof >/dev/null 2>&1; then
      echo "lsof is required for this recipe."
      echo "Install it with your OS package manager, then rerun: just clean-ports"
      exit 1
    fi

    for port in {{DEV_PORTS}}; do
      pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"

      if [ -z "$pids" ]; then
        echo "Port $port is already free"
        continue
      fi

      echo "Stopping process(es) listening on port $port: $pids"
      if ! kill $pids 2>/dev/null; then
        echo "Could not stop every process on port $port. You may need to stop it manually or use sudo."
      fi
    done