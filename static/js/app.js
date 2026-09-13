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

function getEl(id) {
    return document.getElementById(id);
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
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
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

function handleFiles(files) {
    if (!files || !files.length) return;
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith('image/')) continue;
        const reader = new FileReader();
        reader.onload = (e) => {
            stagedImages.push(e.target.result);
            renderStagedImages();
        };
        reader.readAsDataURL(file);
    }
}

function renderStagedImages() {
    const container = getEl('imageStaging');
    if (!container) return;
    container.innerHTML = '';
    stagedImages.forEach((b64, idx) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'staged-thumb-wrapper';
        wrapper.innerHTML = `
            <img src="${b64}" class="staged-thumb" />
            <button type="button" class="remove-staged-btn" onclick="removeStaged(${idx})">&times;</button>
        `;
        container.appendChild(wrapper);
    });
}

function removeStaged(idx) {
    stagedImages.splice(idx, 1);
    renderStagedImages();
}

window.addEventListener('paste', (e) => {
    if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length) {
        handleFiles(e.clipboardData.files);
    }
});

window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        handleFiles(e.dataTransfer.files);
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

    users.forEach(u => {
        const items = allData[u] || [];
        const count = items.length;
        const item = document.createElement('div');
        item.className = `device-item ${u === activeUser ? 'active' : ''}`;
        item.onclick = () => selectUser(u);

        const customName = localStorage.getItem(`anote_devicename_${u}`) || u;
        item.innerHTML = `
            <div class="device-icon">${u === 'Global' ? '🌐' : '📱'}</div>
            <div class="device-info">
                <div class="device-name">${escapeHtml(customName)}</div>
                <div class="device-meta">${count} item${count === 1 ? '' : 's'}</div>
            </div>
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

function renderFeed() {
    const feed = getEl('feedContainer');
    if (!feed) return;
    feed.innerHTML = '';

    const items = allData[activeUser] || [];
    if (items.length === 0) {
        feed.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📋</div>
                <div class="empty-title">No Clipboard Items Yet</div>
                <div class="empty-desc">Paste text, drop images, or type above to share across your network.</div>
            </div>
        `;
        return;
    }

    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'item-card';
        const timeAgo = formatTimeAgo(item.timestamp);
        
        let imagesHtml = '';
        if (item.images && item.images.length) {
            imagesHtml = '<div class="image-grid">';
            item.images.forEach(imgUrl => {
                imagesHtml += `<img src="${imgUrl}" onclick="openLightbox('${imgUrl}')" loading="lazy" />`;
            });
            imagesHtml += '</div>';
        }

        const textHtml = item.text ? `<div class="item-text">${escapeHtml(item.text)}</div>` : '';

        card.innerHTML = `
            <div class="item-header">
                <div class="item-author">
                    <span class="author-badge">${escapeHtml(item.ip || '127.0.0.1')}</span>
                    <span class="item-time">${timeAgo}</span>
                </div>
                <div class="item-actions">
                    ${item.text ? `<button class="copy-btn" onclick="copyText('${escapeHtml(item.text).replace(/'/g, "\'")}')">📋 Copy</button>` : ''}
                    <button class="delete-btn" onclick="deleteItem('${item.id}')">&times;</button>
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
            showToast('Posted to clipboard!', 'success');
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
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard! 📋', 'success');
    }).catch(() => {
        showToast('Failed to copy', 'error');
    });
}

function openLightbox(url) {
    const lightbox = getEl('lightbox');
    const img = getEl('lightboxImg');
    if (lightbox && img) {
        img.src = url;
        lightbox.classList.add('active');
    }
}

function closeLightbox() {
    const lightbox = getEl('lightbox');
    if (lightbox) lightbox.classList.remove('active');
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
        renderBreadcrumbs(data.breadcrumbs || []);
        renderBrowseTable(data.entries || [], data.parent_path);
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
        span.className = 'crumb-item';
        span.textContent = c.name;
        span.onclick = () => loadBrowsePath(c.path);
        bar.appendChild(span);

        if (idx < crumbs.length - 1) {
            const sep = document.createElement('span');
            sep.className = 'crumb-sep';
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
        tr.className = 'folder-row';
        tr.onclick = () => loadBrowsePath(parentPath);
        tr.innerHTML = `
            <td colspan="4" style="cursor:pointer; font-weight:600; color:var(--accent);">
                📁 .. (Parent Directory)
            </td>
        `;
        body.appendChild(tr);
    }

    if (entries.length === 0) {
        body.innerHTML += `<tr><td colspan="4" class="text-center p-4">Folder is empty</td></tr>`;
        return;
    }

    entries.forEach(item => {
        const tr = document.createElement('tr');
        if (item.is_dir) {
            tr.className = 'folder-row';
            tr.onclick = () => loadBrowsePath(item.rel_path);
            tr.innerHTML = `
                <td>📁 <strong>${escapeHtml(item.name)}</strong></td>
                <td>Folder</td>
                <td>${item.item_count || 0} items</td>
                <td>${item.mtime_fmt || ''}</td>
            `;
        } else {
            tr.className = 'file-row';
            tr.innerHTML = `
                <td>📄 ${escapeHtml(item.name)}</td>
                <td>${item.size_fmt || ''}</td>
                <td>
                    <a href="${item.stream_url}" target="_blank" class="action-btn">View</a>
                    <a href="${item.download_url}" download class="action-btn">Download</a>
                </td>
                <td>${item.mtime_fmt || ''}</td>
            `;
        }
        body.appendChild(tr);
    });
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
    switchTab(currentTab);
    fetchAllClipboardData();
    setInterval(checkClipboardUpdate, 3000);
});
