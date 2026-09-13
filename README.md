# Anote — Personal LAN Clipboard & Media Hub

> A lightweight, ultra-fast, local area network (LAN) clipboard and media sharing suite designed for seamless text, image, and video transfer between your PC and phone.

[![Python](https://img.shields.io/badge/Python-3.8%2B-blue.svg)](https://www.python.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![UI](https://img.shields.io/badge/UI-Mobile%20Responsive-purple.svg)](#-mobile-responsive-ui)

---

## ✨ Features

- 📋 **Shared LAN Clipboard:**
  - Instantly sync text snippets, code, URLs, and notes across all devices on your local Wi-Fi.
  - Separate device spaces (Global shared clipboard + individual device clipboards).
  - One-tap copy buttons with visual toast confirmation.

- 🖼️ **Image Clipboard & Camera Snap:**
  - Direct clipboard image pasting (`Ctrl+V` / `Cmd+V` screenshots).
  - Drag-and-drop image uploads directly into the browser.
  - Native mobile camera integration (`accept="image/*"`) for 1-tap phone photos.
  - Glassmorphic full-screen Image Lightbox viewer.

- 🎥 **Media Library & Streamer:**
  - Scan and stream local video files (`.mp4`, `.webm`, `.mkv`, etc.).
  - **HTTP 206 Partial Content Support:** Enables fast, smooth video scrubbing on mobile devices.
  - Metadata and thumbnail extraction.

- 📁 **File Explorer:**
  - Browse local directory trees directly over LAN.
  - One-click file downloads and inline image/video streaming.

- 📱 **100% Mobile Responsive:**
  - Designed mobile-first for touch screens (iPhone, Android, tablets, and desktop).
  - Fixes automatic iOS input zoom (`16px` font inputs) and supports safe area insets.

- ⚡ **Lightweight & Zero Third-Party Dependencies:**
  - Powered by Python's built-in `http.server` with zero external pip package overhead.

---

## 🏗️ Project Architecture

Refactored into a clean, modular structure:

```
~/Anote/
├── server.py              # Lightweight HTTP server entry point (< 120 lines)
├── config.py              # Port, directory paths, and extension settings
├── handlers/              # Backend business logic handlers
│   ├── clipboard_handler.py  # Clipboard storage, base64 image decoding & CRUD
│   └── media_handler.py      # Video library scanner, Range streaming & file browser
├── templates/
│   └── index.html         # Clean, semantic HTML5 application shell
├── static/
│   ├── css/
│   │   └── main.css       # Responsive CSS design system & dark theme
│   └── js/
│       └── app.js         # Frontend SPA logic, polling & clipboard handlers
├── clipboards.json        # Persistent JSON clipboard data store
└── uploads/               # Stored image & file attachments
```

---

## 🚀 Quick Start

### 1. Manual Run
To start the server manually:

```bash
python3 /home/kodar/Anote/server.py
```

The server will display your local IP addresses:
```text
--------------------------------------------------
Anote LAN Clipboard Server starting on port 5000...
Access on your phone / network at:
  http://192.168.1.50:5000
--------------------------------------------------
```

Open `http://<your-pc-ip>:5000` on your phone browser!

---

### 2. Systemd Service (Auto-Start on Boot)

Anote includes a systemd service unit to run silently in the background.

To enable and start the service:

```bash
# Copy service file to user systemd directory
mkdir -p ~/.config/systemd/user/
cp /home/kodar/Anote/anote.service ~/.config/systemd/user/

# Enable & start
systemctl --user daemon-reload
systemctl --user enable anote.service
systemctl --user start anote.service
```

Check service status:
```bash
systemctl --user status anote.service
```

---

## 📡 API Reference

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/` | `GET` | Serves main web application HTML. |
| `/api/data` | `GET` | Returns JSON of all active clipboard items. |
| `/api/post` | `POST` | Posts a new snippet or base64 image attachment. |
| `/api/delete_item` | `POST` | Deletes a single clipboard item and associated uploads. |
| `/api/delete` | `POST` | Clears all items for a specific device. |
| `/api/videos` | `GET` | Returns list of scanned videos and metadata. |
| `/api/browse?path=` | `GET` | Returns directory listings for local file exploration. |
| `/stream/<path>` | `GET` | Streams a video or media file (supports Range requests). |
| `/dl/<path>` | `GET` | Forces attachment download for a file. |

---

## 📝 License

Distributed under the MIT License. Built for personal LAN productivity.
