"""Servidor estático sin caché para los demos. Uso: python design-demos/serve.py [puerto]"""
import http.server
import os
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    http.server.ThreadingHTTPServer(("127.0.0.1", port), NoCache).serve_forever()
