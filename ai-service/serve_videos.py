"""
Robust local video server for demo clips.

Replaces `python -m http.server 8090`, which is single-threaded and does NOT
support HTTP range requests. That combination fails badly when several
consumers hit it at once (multiple pipeline camera workers + the browser),
returning truncated/partial files ("Stream ends prematurely", "partial file").

This server is:
  * multi-threaded (each request handled concurrently), and
  * range-request capable (Python 3.7+ SimpleHTTPRequestHandler supports
    the Range header, so browsers can seek and OpenCV can stream reliably),
  * CORS-open so the browser can embed the videos from the frontend origin.

Run from the folder that holds the video files (e.g. ai-service):
  python serve_videos.py            # serves on 0.0.0.0:8090
  python serve_videos.py 8095       # custom port
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class CORSRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Allow the frontend (different origin/port) to load these videos.
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Range")
        self.send_header("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length")
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8090
    handler = partial(CORSRequestHandler)
    server = ThreadingHTTPServer(("0.0.0.0", port), handler)
    print(f"[serve_videos] threaded, range-capable server on "
          f"http://localhost:{port}/  (serving current directory)")
    print("[serve_videos] Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[serve_videos] shutting down")
        server.shutdown()


if __name__ == "__main__":
    main()
