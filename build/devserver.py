#!/usr/bin/env python3
"""Serve site/ locally with caching off: python3 build/devserver.py [port]

Missing paths get 404.html, the way GitHub Pages serves them.
"""
import functools
import http.server
import os
import sys

SITE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "site")


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_error(self, code, message=None, explain=None):
        page = os.path.join(SITE, "404.html")
        if code != 404 or not os.path.exists(page):
            return super().send_error(code, message, explain)
        with open(page, "rb") as f:
            body = f.read()
        self.send_response(404)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(Handler, directory=SITE))
    print(f"Serving {SITE} at http://localhost:{port}")
    server.serve_forever()
