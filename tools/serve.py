# Local preview server: python tools/serve.py [port]
# Same as `python -m http.server`, but tells the browser not to cache anything,
# so an edit shows up on the next reload instead of an hour later.
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class NoStore(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
root = Path(__file__).resolve().parent.parent
NoStore.extensions_map['.js'] = 'text/javascript'
server = ThreadingHTTPServer(('127.0.0.1', port), partial(NoStore, directory=str(root)))
print(f'Serving {root} at http://127.0.0.1:{port}/', flush=True)
server.serve_forever()
