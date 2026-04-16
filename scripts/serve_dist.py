#!/usr/bin/env python3
import argparse
import http.server
import os
from pathlib import Path
from socketserver import TCPServer


class SpaHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, directory=None, **kwargs):
        self._spa_directory = Path(directory or os.getcwd()).resolve()
        super().__init__(*args, directory=str(self._spa_directory), **kwargs)

    def do_GET(self):
        request_path = self.path.split("?", 1)[0].split("#", 1)[0]
        normalized = request_path.lstrip("/")
        candidate = (self._spa_directory / normalized).resolve()

        if normalized and candidate.exists() and candidate.is_file() and str(candidate).startswith(str(self._spa_directory)):
            return super().do_GET()

        self.path = "/index.html"
        return super().do_GET()

    def log_message(self, format, *args):
        super().log_message(format, *args)


def main():
    parser = argparse.ArgumentParser(description="Serve a built SPA directory with index fallback.")
    parser.add_argument("--dir", default="dist", help="Directory to serve")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind")
    parser.add_argument("--port", type=int, default=4173, help="Port to bind")
    args = parser.parse_args()

    dist_dir = Path(args.dir).resolve()
    if not dist_dir.exists():
        raise SystemExit(f"Directory not found: {dist_dir}")

    class ReusableTCPServer(TCPServer):
        allow_reuse_address = True

    with ReusableTCPServer((args.host, args.port), lambda *a, **k: SpaHandler(*a, directory=dist_dir, **k)) as httpd:
        print(f"Serving {dist_dir} on http://{args.host}:{args.port}")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
