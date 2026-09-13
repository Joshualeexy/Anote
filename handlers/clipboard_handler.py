import os
import json
import time
import base64
import uuid
from config import DATA_FILE, UPLOADS_DIR

clipboards = {}

def migrate_and_format(data):
    formatted = {}
    if not isinstance(data, dict):
        return formatted
    for key, val in data.items():
        if isinstance(val, list):
            formatted[key] = val
        elif isinstance(val, dict):
            text = val.get("text", "")
            timestamp = val.get("timestamp", int(time.time() * 1000))
            ip = val.get("ip", "127.0.0.1")
            item_id = f"item_{timestamp}_0"
            formatted[key] = [{
                "id": item_id,
                "text": text,
                "images": [],
                "timestamp": timestamp,
                "ip": ip
            }]
    return formatted

def load_clipboards():
    global clipboards
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                raw_data = json.load(f)
                clipboards = migrate_and_format(raw_data)
        except Exception as e:
            print(f"Error loading {DATA_FILE}: {e}")
            clipboards = {}
            
    if not clipboards or "Global" not in clipboards or not clipboards["Global"]:
        clipboards["Global"] = [{
            "id": f"item_{int(time.time() * 1000)}_init",
            "text": "Welcome to Anote! This is your local shared clipboard.",
            "images": [],
            "timestamp": int(time.time() * 1000),
            "ip": "127.0.0.1"
        }]
    return clipboards

load_clipboards()

def save_clipboards():
    try:
        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(clipboards, f, indent=4)
    except Exception as e:
        print(f"Error saving {DATA_FILE}: {e}")

def save_base64_image(b64_str):
    try:
        if "," in b64_str:
            header, data = b64_str.split(",", 1)
        else:
            header, data = "", b64_str
            
        ext = ".png"
        header_lower = header.lower()
        if "image/jpeg" in header_lower or "image/jpg" in header_lower:
            ext = ".jpg"
        elif "image/gif" in header_lower:
            ext = ".gif"
        elif "image/webp" in header_lower:
            ext = ".webp"
        elif "image/svg+xml" in header_lower:
            ext = ".svg"
            
        img_bytes = base64.b64decode(data)
        filename = f"img_{int(time.time() * 1000)}_{uuid.uuid4().hex[:6]}{ext}"
        filepath = os.path.join(UPLOADS_DIR, filename)
        with open(filepath, "wb") as f:
            f.write(img_bytes)
        return f"/uploads/{filename}"
    except Exception as e:
        print(f"Error saving image: {e}")
        return None

def handle_post(data, client_ip):
    user = data.get('user', '').strip() or client_ip
    text = data.get('text', '')
    images_b64 = data.get('images', [])
    
    if isinstance(images_b64, str):
        images_b64 = [images_b64] if images_b64 else []
        
    image_urls = []
    for b64 in images_b64:
        url = save_base64_image(b64)
        if url:
            image_urls.append(url)
            
    if not text and not image_urls:
        return {"error": "Cannot post empty snippet"}, 400

    item_id = f"item_{int(time.time() * 1000)}_{uuid.uuid4().hex[:4]}"
    item = {
        "id": item_id,
        "text": text,
        "images": image_urls,
        "timestamp": int(time.time() * 1000),
        "ip": client_ip
    }
    
    if user not in clipboards:
        clipboards[user] = []
        
    clipboards[user].insert(0, item)
    save_clipboards()
    return {"status": "success", "item": item}, 200

def handle_delete_item(data):
    item_id = data.get("item_id", "")
    user = data.get("user", "")
    if user and user in clipboards:
        new_items = []
        for item in clipboards[user]:
            if item.get("id") == item_id:
                for img_url in item.get("images", []):
                    fname = os.path.basename(img_url)
                    fpath = os.path.join(UPLOADS_DIR, fname)
                    if os.path.exists(fpath):
                        try:
                            os.remove(fpath)
                        except Exception:
                            pass
            else:
                new_items.append(item)
        clipboards[user] = new_items
        save_clipboards()
    return {"status": "success"}, 200

def handle_delete_user(data):
    user = data.get('user', '')
    if user and user in clipboards and user != "Global":
        for item in clipboards[user]:
            for img_url in item.get("images", []):
                fname = os.path.basename(img_url)
                fpath = os.path.join(UPLOADS_DIR, fname)
                if os.path.exists(fpath):
                    try:
                        os.remove(fpath)
                    except Exception:
                        pass
        del clipboards[user]
        save_clipboards()
    return {"status": "success"}, 200
