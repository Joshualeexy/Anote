# Anote — Universal LAN Clipboard Suite

> A lightweight, ultra-fast local area network (LAN) clipboard suite designed for seamless text, image, and media transfer across **any devices on your local network** (e.g., PC, phone, laptop, tablet, Mac, Linux, Windows).

[![Python](https://img.shields.io/badge/Python-3.8%2B-blue.svg)](https://www.python.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![UI](https://img.shields.io/badge/UI-Mobile%20%26%20Desktop%20Responsive-purple.svg)](#-universal-responsive-ui)

---

## ✨ Features

- 🌐 **Universal LAN Clipboard:**
  - Instantly sync text snippets, code, URLs, and notes across **any device connected to your local network Wi-Fi** (e.g., laptops, smartphones, desktops, tablets).
  - Multi-device spaces: Shared Global clipboard + individual device clipboards.
  - One-tap copy buttons with visual toast confirmation.

- 🖼️ **Image Sharing & Mobile Camera Snap:**
  - Direct clipboard image pasting (`Ctrl+V` / `Cmd+V` screenshots).
  - Drag-and-drop image uploads directly into the browser.
  - Native mobile camera integration (`accept="image/*"`) for 1-tap photo sharing from mobile devices.
  - Glassmorphic full-screen Image Lightbox viewer.

- 📁 **File Explorer:**
  - Browse local directory trees directly over your local network.
  - One-click file downloads and inline document/image viewing across devices.

- 📱 **100% Mobile & Desktop Responsive:**
  - Designed for touch screens and desktop displays alike (iOS, Android, macOS, Windows, Linux).
  - Fixes automatic mobile input zoom (`16px` font inputs) and supports safe area insets.

- ⚡ **Lightweight & Zero Third-Party Dependencies:**
  - Powered by Python's built-in `http.server` with zero external pip package overhead.

---

## 🏗️ Project Architecture

```
~/Anote/
├── server.py              # Lightweight HTTP server entry point (< 120 lines)
├── config.py              # Port, directory paths, and extension settings
├── handlers/              # Backend business logic handlers
│   ├── clipboard_handler.py  # Clipboard storage, base64 image decoding & CRUD
│   └── media_handler.py      # File browser & streaming logic
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
To start the server:

```bash
cd ~/Anote
python3 server.py
```

The server will display your local IP addresses:
```text
--------------------------------------------------
Anote LAN Clipboard Server starting on port 5000...
Access on your local network at:
  http://192.168.1.50:5000
--------------------------------------------------
```

Open `http://<your-local-ip>:5000` on any device (phone, laptop, tablet, PC) connected to the same local Wi-Fi network!

---

### 2. Systemd Service (Auto-Start on Boot - Linux)

```bash
mkdir -p ~/.config/systemd/user/
cp anote.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now anote.service
```

---

## 📡 API Reference

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/` | `GET` | Serves main web application HTML. |
| `/api/data` | `GET` | Returns JSON of all active clipboard items. |
| `/api/status` | `GET` | Returns live status and active device timestamps. |
| `/api/post` | `POST` | Posts a new snippet or base64 image attachment. |
| `/api/delete_item` | `POST` | Deletes a single clipboard item and associated uploads. |
| `/api/delete` | `POST` | Clears all items for a specific device. |
| `/api/browse?path=` | `GET` | Returns directory listings for local file exploration. |
| `/stream/<path>` | `GET` | Streams a file or image asset. |
| `/dl/<path>` | `GET` | Forces attachment download for a file. |

---

## 📝 License

Distributed under the MIT License. Built for universal local network productivity.
