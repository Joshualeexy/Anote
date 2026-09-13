import os
import json
import re
import urllib.parse
import mimetypes
from datetime import datetime
from config import PC_ROOT_DIR, DEFAULT_VIDEO_DIR, VIDEO_EXTS, IMAGE_EXTS

def safe_path(rel_path, base_root=PC_ROOT_DIR):
    if rel_path is None:
        rel_path = ""
    clean_rel = rel_path.lstrip("/").lstrip(chr(92))
    full_path = os.path.abspath(os.path.join(base_root, clean_rel))
    
    real_base = os.path.realpath(base_root)
    real_full = os.path.realpath(full_path)
    
    if real_full == real_base or real_full.startswith(real_base + os.sep):
        return real_full
    return None

def format_size(num_bytes):
    if not isinstance(num_bytes, (int, float)) or num_bytes < 0:
        return "0 B"
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if num_bytes < 1024.0:
            return f"{num_bytes:.1f} {unit}" if unit != 'B' else f"{int(num_bytes)} B"
        num_bytes /= 1024.0
    return f"{num_bytes:.1f} PB"

def format_time(timestamp):
    try:
        dt = datetime.fromtimestamp(timestamp)
        return dt.strftime("%b %d, %H:%M")
    except Exception:
        return ""

def get_all_videos(search_dir=None, max_results=200):
    if not search_dir:
        search_dir = DEFAULT_VIDEO_DIR
    else:
        resolved = safe_path(search_dir, PC_ROOT_DIR)
        if resolved and os.path.isdir(resolved):
            search_dir = resolved
        else:
            search_dir = DEFAULT_VIDEO_DIR

    videos = []
    if not os.path.exists(search_dir):
        return videos

    for root, dirs, files in os.walk(search_dir):
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        for f in files:
            lower_f = f.lower()
            if lower_f.endswith(VIDEO_EXTS):
                full_video_path = os.path.join(root, f)
                try:
                    st = os.stat(full_video_path)
                except OSError:
                    continue

                rel_pc = os.path.relpath(full_video_path, PC_ROOT_DIR)
                parent_dir = root
                parent_folder_name = os.path.basename(parent_dir)

                meta = {}
                meta_file = os.path.join(parent_dir, "metadata.json")
                if os.path.isfile(meta_file):
                    try:
                        with open(meta_file, "r", encoding="utf-8") as mf:
                            meta = json.load(mf)
                    except Exception:
                        pass

                thumb_url = None
                for thumb_candidate in ["thumbnail.jpg", "thumbnail.png", "thumb.jpg", f"{os.path.splitext(f)[0]}.jpg"]:
                    tf = os.path.join(parent_dir, thumb_candidate)
                    if os.path.isfile(tf):
                        thumb_rel = os.path.relpath(tf, PC_ROOT_DIR)
                        thumb_url = f"/stream/{urllib.parse.quote(thumb_rel)}"
                        break

                title = meta.get("title") or meta.get("topic")
                if not title:
                    base_no_ext = os.path.splitext(f)[0]
                    title = re.sub(r'^\d+[\s_-]*', '', base_no_ext).replace('_', ' ').replace('-', ' ').title()
                    if not title:
                        title = f

                niche = meta.get("niche")
                if not niche or niche == "null":
                    parts = os.path.relpath(full_video_path, search_dir).split(os.sep)
                    niche = parts[0] if len(parts) > 1 else "video"

                videos.append({
                    "filename": f,
                    "title": title,
                    "niche": niche,
                    "topic": meta.get("topic", ""),
                    "duration_seconds": meta.get("duration_seconds", 0),
                    "script": meta.get("script", ""),
                    "size": st.st_size,
                    "size_fmt": format_size(st.st_size),
                    "mtime": st.st_mtime,
                    "mtime_fmt": format_time(st.st_mtime),
                    "rel_path": rel_pc,
                    "parent_folder": parent_folder_name,
                    "thumbnail_url": thumb_url,
                    "stream_url": f"/stream/{urllib.parse.quote(rel_pc)}",
                    "download_url": f"/dl/{urllib.parse.quote(rel_pc)}"
                })

    videos.sort(key=lambda x: x["mtime"], reverse=True)
    return videos[:max_results]

def serve_file_stream(handler, filepath, is_download=False, custom_filename=None):
    if not filepath or not os.path.isfile(filepath):
        handler.send_error(404, "File not found")
        return
    
    try:
        file_size = os.path.getsize(filepath)
    except OSError:
        handler.send_error(404, "Unable to read file")
        return

    filename = custom_filename or os.path.basename(filepath)
    mime_type, _ = mimetypes.guess_type(filepath)
    if not mime_type:
        mime_type = "application/octet-stream"
        
    range_header = handler.headers.get("Range")
    
    if range_header and range_header.startswith("bytes="):
        match = re.search(r"bytes=(\d*)-(\d*)", range_header)
        if match:
            start_str, end_str = match.groups()
            start = int(start_str) if start_str else 0
            end = int(end_str) if end_str else file_size - 1
            if end >= file_size:
                end = file_size - 1
            if start > end or start >= file_size:
                handler.send_response(416)
                handler.send_header("Content-Range", f"bytes */{file_size}")
                handler.end_headers()
                return

            content_length = end - start + 1
            handler.send_response(206)
            handler.send_header("Content-Type", mime_type)
            handler.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
            handler.send_header("Content-Length", str(content_length))
            handler.send_header("Accept-Ranges", "bytes")
            if is_download:
                handler.send_header("Content-Disposition", f'attachment; filename="{filename}"')
            handler.end_headers()

            with open(filepath, "rb") as f:
                f.seek(start)
                remaining = content_length
                chunk_size = 65536
                while remaining > 0:
                    read_len = min(chunk_size, remaining)
                    chunk = f.read(read_len)
                    if not chunk:
                        break
                    try:
                        handler.wfile.write(chunk)
                    except (BrokenPipeError, ConnectionResetError):
                        break
                    remaining -= len(chunk)
            return

    handler.send_response(200)
    handler.send_header("Content-Type", mime_type)
    handler.send_header("Content-Length", str(file_size))
    handler.send_header("Accept-Ranges", "bytes")
    if is_download:
        handler.send_header("Content-Disposition", f'attachment; filename="{filename}"')
    else:
        if mime_type.startswith("image/"):
            handler.send_header("Cache-Control", "public, max-age=3600")
    handler.end_headers()

    with open(filepath, "rb") as f:
        chunk_size = 65536
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            try:
                handler.wfile.write(chunk)
            except (BrokenPipeError, ConnectionResetError):
                break

def handle_api_browse(handler, rel_path):
    full_path = safe_path(rel_path, PC_ROOT_DIR)
    if full_path is None or not os.path.exists(full_path):
        handler.send_response(404)
        handler.send_header("Content-Type", "application/json")
        handler.end_headers()
        handler.wfile.write(json.dumps({"error": "Path not found or access forbidden"}).encode("utf-8"))
        return

    if os.path.isfile(full_path):
        handler.send_response(200)
        handler.send_header("Content-Type", "application/json")
        handler.end_headers()
        handler.wfile.write(json.dumps({
            "is_file": True,
            "path": rel_path,
            "stream_url": f"/stream/{urllib.parse.quote(rel_path)}",
            "download_url": f"/dl/{urllib.parse.quote(rel_path)}"
        }).encode("utf-8"))
        return

    try:
        raw_entries = sorted(os.listdir(full_path), key=lambda x: x.lower())
    except PermissionError:
        handler.send_response(403)
        handler.send_header("Content-Type", "application/json")
        handler.end_headers()
        handler.wfile.write(json.dumps({"error": "Permission denied"}).encode("utf-8"))
        return
    except Exception as e:
        handler.send_response(500)
        handler.send_header("Content-Type", "application/json")
        handler.end_headers()
        handler.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
        return

    current_rel = os.path.relpath(full_path, PC_ROOT_DIR)
    if current_rel == ".":
        current_rel = ""
        parent_rel = None
    else:
        parent_rel = os.path.dirname(current_rel)
        if parent_rel == current_rel or parent_rel == ".":
            parent_rel = ""

    breadcrumbs = [{"name": "~", "path": ""}]
    if current_rel:
        parts = current_rel.split(os.sep)
        accum = []
        for p in parts:
            accum.append(p)
            breadcrumbs.append({"name": p, "path": "/".join(accum)})

    entries = []
    for name in raw_entries:
        if name.startswith(".") and name not in [".config", ".local", "face"]:
            continue
        child_full = os.path.join(full_path, name)
        is_dir = os.path.isdir(child_full)
        child_rel = os.path.relpath(child_full, PC_ROOT_DIR)
        
        entry = {
            "name": name,
            "is_dir": is_dir,
            "rel_path": child_rel,
            "mtime": 0,
            "mtime_fmt": "",
            "size": 0,
            "size_fmt": "",
            "type": "dir" if is_dir else "file",
            "is_video": False,
            "is_image": False,
            "stream_url": f"/stream/{urllib.parse.quote(child_rel)}",
            "download_url": f"/dl/{urllib.parse.quote(child_rel)}"
        }
        
        try:
            st = os.stat(child_full)
            entry["mtime"] = st.st_mtime
            entry["mtime_fmt"] = format_time(st.st_mtime)
            if not is_dir:
                entry["size"] = st.st_size
                entry["size_fmt"] = format_size(st.st_size)
                lower_name = name.lower()
                entry["is_video"] = lower_name.endswith(VIDEO_EXTS)
                entry["is_image"] = lower_name.endswith(IMAGE_EXTS)
                if entry["is_video"]:
                    entry["type"] = "video"
                elif entry["is_image"]:
                    entry["type"] = "image"
            else:
                try:
                    entry["item_count"] = len(os.listdir(child_full))
                except Exception:
                    entry["item_count"] = 0
        except OSError:
            pass

        entries.append(entry)

    entries.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))

    res_data = {
        "current_path": current_rel,
        "parent_path": parent_rel,
        "breadcrumbs": breadcrumbs,
        "entries": entries,
        "total_count": len(entries)
    }

    handler.send_response(200)
    handler.send_header("Content-Type", "application/json")
    handler.end_headers()
    handler.wfile.write(json.dumps(res_data).encode("utf-8"))
