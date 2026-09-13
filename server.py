#!/usr/bin/env python3
import http.server
import socketserver
import urllib.parse
import os
import json
import socket
from config import PORT, BASE_DIR, UPLOADS_DIR, PC_ROOT_DIR
from handlers.clipboard_handler import (
    clipboards, load_clipboards, handle_post, handle_delete_item, handle_delete_user
)
from handlers.media_handler import (
    get_all_videos, serve_file_stream, handle_api_browse, safe_path
)

def get_local_ips():
    ips = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ips.append(s.getsockname()[0])
        s.close()
    except Exception:
        pass
    try:
        hostname = socket.gethostname()
        for ip in socket.gethostbyname_ex(hostname)[2]:
            if not ip.startswith("127.") and ip not in ips:
                ips.append(ip)
    except Exception:
        pass
    return ips

class ClipboardHTTPRequestHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/" or path == "/index.html":
            template_path = os.path.join(BASE_DIR, "templates", "index.html")
            with open(template_path, "r", encoding="utf-8") as f:
                html = f.read()
            ips = get_local_ips()
            html = html.replace("{{IPS_JSON}}", json.dumps(ips))
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(html.encode("utf-8"))

        elif path.startswith("/static/"):
            rel_static = path[len("/static/"):]
            filepath = os.path.join(BASE_DIR, "static", rel_static)
            serve_file_stream(self, filepath)

        elif path.startswith("/uploads/"):
            fname = path[len("/uploads/"):]
            filepath = os.path.join(UPLOADS_DIR, fname)
            serve_file_stream(self, filepath)

        elif path == "/api/data":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(json.dumps(clipboards).encode("utf-8"))

        elif path == "/api/videos":
            query = urllib.parse.parse_qs(parsed.query)
            search_dir = query.get("dir", [None])[0]
            videos = get_all_videos(search_dir)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(json.dumps(videos).encode("utf-8"))

        elif path == "/api/browse":
            query = urllib.parse.parse_qs(parsed.query)
            rel_path = query.get("path", [""])[0]
            handle_api_browse(self, rel_path)

        elif path.startswith("/stream/"):
            rel_path = urllib.parse.unquote(path[len("/stream/"):])
            filepath = safe_path(rel_path, PC_ROOT_DIR)
            serve_file_stream(self, filepath, is_download=False)

        elif path.startswith("/dl/"):
            rel_path = urllib.parse.unquote(path[len("/dl/"):])
            filepath = safe_path(rel_path, PC_ROOT_DIR)
            serve_file_stream(self, filepath, is_download=True)

        else:
            self.send_error(404, "File not found")

    def do_POST(self):
        client_ip = self.client_address[0]
        content_length = int(self.headers.get('Content-Length', 0))
        raw_body = self.rfile.read(content_length).decode('utf-8')
        
        content_type = self.headers.get('Content-Type', '')
        if content_type.startswith('application/json'):
            try:
                data = json.loads(raw_body)
            except Exception:
                data = {}
        else:
            params = urllib.parse.parse_qs(raw_body)
            data = {k: v[0] for k, v in params.items()}

        if self.path == "/api/post" or self.path == "/":
            res_data, status_code = handle_post(data, client_ip)
        elif self.path == "/api/delete_item":
            res_data, status_code = handle_delete_item(data)
        elif self.path == "/api/delete":
            res_data, status_code = handle_delete_user(data)
        else:
            res_data, status_code = {"error": "Not found"}, 404

        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(res_data).encode("utf-8"))

def run():
    ips = get_local_ips()
    print("--------------------------------------------------")
    print("Anote LAN Clipboard Server starting on port %d..." % PORT)
    if ips:
        print("Access on your phone / network at:")
        for ip in ips:
            print("  http://%s:%d" % (ip, PORT))
    print("--------------------------------------------------")

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), ClipboardHTTPRequestHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down Anote Server...")

if __name__ == "__main__":
    run()
