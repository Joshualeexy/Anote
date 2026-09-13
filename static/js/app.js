// Anote - Personal LAN Clipboard & File Explorer SPA Logic

const ips = window.ANOTE_IPS || [];
const port = window.location.port || 5000;
const clientIp = window.location.hostname || "127.0.0.1";

let soundEnabled = localStorage.getItem('anote_sound_enabled') !== 'false';
let currentTab = localStorage.getItem('anote_active_tab') || 'clipboard';
if (currentTab === 'videos') currentTab = 'clipboard';

let activeUser = 'Global';
let stagedImages = [];
let allData = {};
let userTimestamps = {};
let currentBrowsePath = '';
let browseEntries = [];

// Device identity management
let userName = localStorage.getItem('anote_user_name');
if (!userName) {
    userName = 'Device-' + (clientIp.split('.').pop() || '1');
    localStorage.setItem('anote_user_name', userName);
}

function getEl(id) {
    return document.getElementById(id);
}

function updateProfileUI() {
    const el = getEl('profileName');
    if (el) el.textContent = userName;
}

function playChime() {
    if (!soundEnabled) return;
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const now = ctx.currentTime;
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(587.33, now);
        osc1.frequency.exponentialRampToValueAtTime(880, now + 0.15);
        gain1.gain.setValueAtTime(0.2, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.5);
    } catch (e) {}
}

function toggleSound() {
    soundEnabled = !soundEnabled;
    localStorage.setItem('anote_sound_enabled', soundEnabled);
    const btn = getEl('soundToggleBtn');
    if (btn) btn.textContent = soundEnabled ? '🔔 Sound: ON' : '🔕 Sound: OFF';
    if (soundEnabled) playChime();
    showToast(soundEnabled ? 'Audio alerts enabled' : 'Audio alerts muted', 'info');
}

function switchTab(tabName) {
    if (!tabName || tabName === 'videos') tabName = 'clipboard';
    currentTab = tabName;
    try { localStorage.setItem('anote_active_tab', tabName); } catch (e) {}

    const btnClipboard = getEl('tabBtnClipboard');
    const btnBrowser = getEl('tabBtnBrowser');
    const viewClipboard = getEl('tabViewClipboard');
    const viewBrowser = getEl('tabViewBrowser');

    if (btnClipboard) btnClipboard.classList.toggle('active', tabName === 'clipboard');
    if (btnBrowser) btnBrowser.classList.toggle('active', tabName === 'browser');

    if (viewClipboard) viewClipboard.classList.toggle('active', tabName === 'clipboard');
    if (viewBrowser) viewBrowser.classList.toggle('active', tabName === 'browser');

    if (tabName === 'browser') {
        loadBrowsePath(currentBrowsePath || '');
    }
}

function showToast(message, type = 'info') {
    const container = getEl('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type} show`;
    toast.textContent = message;
    toast.onclick = () => toast.remove();
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.remove('show');
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function renderIpBadges() {
    const ipList = getEl('ipList');
    if (!ipList) return;
    ipList.innerHTML = '';
    
    const displayIps = ips.length > 0 ? ips : [clientIp];
    displayIps.forEach(ip => {
        const badge = document.createElement('span');
        badge.className = 'ip-badge';
        badge.textContent = `http://${ip}:${port}`;
        badge.title = 'Click to copy URL';
        badge.onclick = () => {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(badge.textContent).then(() => {
                    showToast('URL copied to clipboard!', 'success');
                }).catch(() => {
                    showToast('Copied: ' + badge.textContent, 'info');
                });
            } else {
                showToast('URL: ' + badge.textContent, 'info');
            }
        };
        ipList.appendChild(badge);
    });
}

// File and Image Handling Logic
function handleFiles(files) {
    if (!files || !files.length) return;
    const fileArray = Array.from(files);
    let imageCount = 0;

    fileArray.forEach(file => {
        if (!file || !file.type || !file.type.startsWith('image/')) return;
        imageCount++;
        const reader = new FileReader();
        reader.onload = (e) => {
            if (e.target && e.target.result) {
                stagedImages.push(e.target.result);
                renderStagedImages();
            }
        };
        reader.readAsDataURL(file);
    });

    if (imageCount > 0) {
        showToast(`Attached ${imageCount} image${imageCount > 1 ? 's' : ''}! 🖼️`, 'success');
    }
}

function renderStagedImages() {
    const container = getEl('imageStaging');
    if (!container) return;
    container.innerHTML = '';
    stagedImages.forEach((b64, idx) => {
        const card = document.createElement('div');
        card.className = 'staged-img-card';
        card.innerHTML = `
            <img src="${b64}" alt="Staged image" />
            <button type="button" class="remove-staged-btn" onclick="removeStaged(${idx})" title="Remove image">&times;</button>
        `;
        container.appendChild(card);
    });
}

function removeStaged(idx) {
    stagedImages.splice(idx, 1);
    renderStagedImages();
}

// Clipboard Paste Handler (handles screenshots, copied web images, & dataTransfer items)
window.addEventListener('paste', (e) => {
    const clipboardData = e.clipboardData || (e.originalEvent && e.originalEvent.clipboardData);
    if (!clipboardData) return;

    const filesToHandle = [];

    // 1. Inspect items (covers clipboard screenshots, Snipping Tool, and copied images)
    if (clipboardData.items && clipboardData.items.length) {
        for (let i = 0; i < clipboardData.items.length; i++) {
            const item = clipboardData.items[i];
            if (item.type && item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) filesToHandle.push(file);
            }
        }
    }

    // 2. Fallback to clipboardData.files if items array yielded no images
    if (filesToHandle.length === 0 && clipboardData.files && clipboardData.files.length) {
        for (let i = 0; i < clipboardData.files.length; i++) {
            const file = clipboardData.files[i];
            if (file.type && file.type.startsWith('image/')) {
                filesToHandle.push(file);
            }
        }
    }

    if (filesToHandle.length > 0) {
        e.preventDefault();
        handleFiles(filesToHandle);
    }
});

// Drag and drop image handling
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
    e.preventDefault();
    const dataTransfer = e.dataTransfer;
    if (!dataTransfer) return;

    const filesToHandle = [];
    if (dataTransfer.files && dataTransfer.files.length) {
        for (let i = 0; i < dataTransfer.files.length; i++) {
            if (dataTransfer.files[i].type && dataTransfer.files[i].type.startsWith('image/')) {
                filesToHandle.push(dataTransfer.files[i]);
            }
        }
    }
    if (filesToHandle.length > 0) {
        handleFiles(filesToHandle);
    }
});

// Keyboard shortcut (Ctrl+S / Cmd+S to submit snippet)
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        const composerInput = getEl('composerInput');
        if (document.activeElement === composerInput || stagedImages.length > 0) {
            e.preventDefault();
            sendPost();
        }
    }
});

async function fetchAllClipboardData() {
    try {
        const res = await fetch('/api/data');
        if (!res.ok) return;
        allData = await res.json();
        renderDeviceList();
        renderFeed();
    } catch (e) {}
}

function formatTimeAgo(ts) {
    if (!ts) return '';
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 10) return 'just now';
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

function renderDeviceList() {
    const listEl = getEl('deviceList');
    if (!listEl) return;
    listEl.innerHTML = '';

    const users = Object.keys(allData);
    if (!users.includes('Global')) users.unshift('Global');
    if (!users.includes(userName)) users.push(userName);

    users.forEach(u => {
        const items = allData[u] || [];
        const count = items.length;
        const item = document.createElement('div');
        item.className = `device-item ${u === activeUser ? 'active' : ''}`;
        item.onclick = () => selectUser(u);

        const isMe = (u === userName);
        const deleteBtnHtml = (u !== 'Global') 
            ? `<button type="button" class="delete-device-btn" onclick="event.stopPropagation(); deleteDeviceUser('${escapeHtml(u)}')" title="Delete device box">&times;</button>` 
            : '';

        item.innerHTML = `
            <div class="device-header-row">
                <div class="device-name-container">
                    <span class="device-icon">${u === 'Global' ? '🌐' : '📱'}</span>
                    <span class="device-name">${escapeHtml(u)}</span>
                    ${isMe ? '<span class="me-badge">You</span>' : ''}
                </div>
            </div>
            <div class="device-meta">
                <span>${count} item${count === 1 ? '' : 's'}</span>
            </div>
            ${deleteBtnHtml}
        `;
        listEl.appendChild(item);
    });
}

function selectUser(u) {
    activeUser = u;
    const targetLabel = getEl('postingTarget');
    if (targetLabel) targetLabel.textContent = u;
    renderDeviceList();
    renderFeed();
}

async function deleteDeviceUser(u) {
    if (u === 'Global') return;
    if (!confirm(`Delete device box "${u}" and all its items?`)) return;
    try {
        const res = await fetch('/api/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user: u })
        });
        if (res.ok) {
            showToast(`Deleted device box "${u}"`, 'info');
            if (activeUser === u) {
                selectUser('Global');
            }
            fetchAllClipboardData();
        }
    } catch (e) {}
}

function renderFeed() {
    const feed = getEl('feedContainer');
    if (!feed) return;
    feed.innerHTML = '';

    const items = allData[activeUser] || [];
    if (items.length === 0) {
        feed.innerHTML = `
            <div class="empty-feed">
                <div style="font-size: 32px; margin-bottom: 8px;">📋</div>
                <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">No Clipboard Items Yet</div>
                <div>Paste text, attach photos/files, or type above to share across your network.</div>
            </div>
        `;
        return;
    }

    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'feed-card';
        const timeAgo = formatTimeAgo(item.timestamp);
        
        let imagesHtml = '';
        if (item.images && item.images.length) {
            imagesHtml = '<div class="feed-gallery">';
            item.images.forEach(imgUrl => {
                imagesHtml += `
                    <div class="gallery-item" onclick="openLightbox('${imgUrl}')">
                        <img src="${imgUrl}" loading="lazy" alt="Clipboard attachment" />
                    </div>
                `;
            });
            imagesHtml += '</div>';
        }

        const textHtml = item.text ? `<div class="feed-text">${escapeHtml(item.text)}</div>` : '';

        card.innerHTML = `
            <div class="feed-card-header">
                <div class="feed-card-user">
                    <span>${escapeHtml(item.ip || '127.0.0.1')}</span>
                    <span style="font-weight: normal; color: var(--text-secondary);">${timeAgo}</span>
                </div>
                <div class="feed-card-actions">
                    ${item.text ? `<button type="button" class="btn-secondary btn-sm" onclick="copyText(${JSON.stringify(item.text)})">📋 Copy</button>` : ''}
                    <button type="button" class="delete-item-btn" onclick="deleteItem('${item.id}')" title="Delete item">&times;</button>
                </div>
            </div>
            ${textHtml}
            ${imagesHtml}
        `;
        feed.appendChild(card);
    });
}

async function sendPost() {
    const textEl = getEl('composerInput');
    const text = textEl ? textEl.value.trim() : '';

    if (!text && stagedImages.length === 0) {
        showToast('Please enter text or attach an image', 'warning');
        return;
    }

    const payload = {
        user: activeUser,
        text: text,
        images: stagedImages
    };

    try {
        const res = await fetch('/api/post', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            if (textEl) textEl.value = '';
            stagedImages = [];
            renderStagedImages();
            showToast('Posted to shared clipboard!', 'success');
            playChime();
            fetchAllClipboardData();
        } else {
            showToast('Failed to post item', 'error');
        }
    } catch (e) {
        showToast('Network error posting item', 'error');
    }
}

async function deleteItem(itemId) {
    try {
        const res = await fetch('/api/delete_item', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user: activeUser, item_id: itemId })
        });
        if (res.ok) {
            showToast('Item deleted', 'info');
            fetchAllClipboardData();
        }
    } catch (e) {}
}

function copyText(text) {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            showToast('Copied to clipboard! 📋', 'success');
        }).catch(() => {
            showToast('Failed to copy text', 'error');
        });
    } else {
        showToast('Clipboard API unavailable', 'error');
    }
}

function openLightbox(url) {
    const lightbox = getEl('lightbox');
    const img = getEl('lightboxImg');
    if (lightbox && img) {
        img.src = url;
        lightbox.style.display = 'flex';
    }
}

function closeLightbox() {
    const lightbox = getEl('lightbox');
    if (lightbox) lightbox.style.display = 'none';
}

function openRenameModal() {
    const modal = getEl('renameModal');
    const input = getEl('deviceNameInput');
    if (modal && input) {
        input.value = userName;
        modal.style.display = 'flex';
        input.focus();
    }
}

function closeRenameModal() {
    const modal = getEl('renameModal');
    if (modal) modal.style.display = 'none';
}

function saveDeviceName() {
    const input = getEl('deviceNameInput');
    if (input) {
        const val = input.value.trim();
        if (val) {
            userName = val;
            localStorage.setItem('anote_user_name', userName);
            updateProfileUI();
            renderDeviceList();
            showToast('Device name saved', 'success');
        }
    }
    closeRenameModal();
}

async function loadBrowsePath(path = '') {
    currentBrowsePath = path;
    const body = getEl('fileTableBody');
    if (!body) return;

    try {
        const res = await fetch(`/api/browse?path=${encodeURIComponent(path)}`);
        if (!res.ok) {
            body.innerHTML = `<tr><td colspan="4" class="text-center p-4">Unable to browse directory</td></tr>`;
            return;
        }
        const data = await res.json();
        browseEntries = data.entries || [];
        renderBreadcrumbs(data.breadcrumbs || []);
        renderBrowseTable(browseEntries, data.parent_path);
    } catch (e) {
        body.innerHTML = `<tr><td colspan="4" class="text-center p-4">Network error loading directory</td></tr>`;
    }
}

function renderBreadcrumbs(crumbs) {
    const bar = getEl('breadcrumbsBar');
    if (!bar) return;
    bar.innerHTML = '';
    crumbs.forEach((c, idx) => {
        const span = document.createElement('span');
        span.className = 'breadcrumb-item';
        span.textContent = c.name;
        span.onclick = () => loadBrowsePath(c.path);
        bar.appendChild(span);

        if (idx < crumbs.length - 1) {
            const sep = document.createElement('span');
            sep.className = 'breadcrumb-sep';
            sep.textContent = '/';
            bar.appendChild(sep);
        }
    });
}

function renderBrowseTable(entries, parentPath) {
    const body = getEl('fileTableBody');
    if (!body) return;
    body.innerHTML = '';

    if (parentPath !== null && parentPath !== undefined) {
        const tr = document.createElement('tr');
        tr.className = 'file-row is-folder';
        tr.onclick = () => loadBrowsePath(parentPath);
        tr.innerHTML = `
            <td colspan="4" style="cursor:pointer; font-weight:600; color:var(--accent);">
                📁 .. (Parent Directory)
            </td>
        `;
        body.appendChild(tr);
    }

    if (entries.length === 0) {
        body.innerHTML += `<tr><td colspan="4" style="text-align: center; padding: 25px; color: var(--text-secondary);">Folder is empty</td></tr>`;
        return;
    }

    entries.forEach(item => {
        const tr = document.createElement('tr');
        if (item.is_dir) {
            tr.className = 'file-row is-folder';
            tr.onclick = () => loadBrowsePath(item.rel_path);
            tr.innerHTML = `
                <td class="file-name-cell">📁 <strong>${escapeHtml(item.name)}</strong></td>
                <td>Folder</td>
                <td>${item.mtime_fmt || ''}</td>
                <td class="file-actions-cell">
                    <button type="button" class="btn-secondary btn-sm" onclick="event.stopPropagation(); loadBrowsePath('${escapeHtml(item.rel_path)}')">Open</button>
                </td>
            `;
        } else {
            tr.className = 'file-row';
            tr.innerHTML = `
                <td class="file-name-cell">📄 ${escapeHtml(item.name)}</td>
                <td>${item.size_fmt || ''}</td>
                <td>${item.mtime_fmt || ''}</td>
                <td class="file-actions-cell">
                    <a href="${item.stream_url}" target="_blank" class="btn-secondary btn-sm" style="text-decoration:none;">View</a>
                    <a href="${item.download_url}" download class="btn-success btn-sm" style="text-decoration:none;">Download</a>
                </td>
            `;
        }
        body.appendChild(tr);
    });
}

function filterBrowseTable() {
    const input = getEl('fileSearchInput');
    if (!input) return;
    const query = input.value.toLowerCase().trim();
    if (!query) {
        renderBrowseTable(browseEntries, currentBrowsePath ? (currentBrowsePath.includes('/') ? currentBrowsePath.substring(0, currentBrowsePath.lastIndexOf('/')) : '') : null);
        return;
    }
    const filtered = browseEntries.filter(e => e.name && e.name.toLowerCase().includes(query));
    renderBrowseTable(filtered, null);
}

async function checkClipboardUpdate() {
    try {
        const res = await fetch('/api/status');
        if (!res.ok) return;
        const status = await res.json();
        const serverUsers = status.users || {};
        let needsFetch = false;

        for (const u in serverUsers) {
            if (!userTimestamps[u] || userTimestamps[u] < serverUsers[u].timestamp || userTimestamps[u + '_count'] !== serverUsers[u].count) {
                needsFetch = true;
                break;
            }
        }

        if (needsFetch) {
            userTimestamps = {};
            for (const u in serverUsers) {
                userTimestamps[u] = serverUsers[u].timestamp;
                userTimestamps[u + '_count'] = serverUsers[u].count;
            }
            await fetchAllClipboardData();
        }
    } catch (e) {}
}

document.addEventListener('DOMContentLoaded', () => {
    updateProfileUI();
    renderIpBadges();

    // Attach listener for photos/files selection button
    const fileInput = getEl('fileInput');
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length) {
                handleFiles(e.target.files);
                fileInput.value = '';
            }
        });
    }

    switchTab(currentTab);
    fetchAllClipboardData();
    setInterval(checkClipboardUpdate, 3000);
});
