"""Serve the local Taro H5 build under its production public path for smoke tests."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        if path.startswith('/mobile-preview/'):
            path = path[len('/mobile-preview/'):]
        elif path == '/mobile-preview':
            path = ''
        return super().translate_path('/' + path)


if __name__ == '__main__':
    directory = Path(__file__).resolve().parents[1] / 'miniprogram' / 'dist'
    ThreadingHTTPServer(('127.0.0.1', 8765), partial(Handler, directory=str(directory))).serve_forever()
