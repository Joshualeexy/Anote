const clientIp = "{{CLIENT_IP}}";
        const ips = {{IPS_JSON}};
        const port = {{PORT}};

        // Sound alert setting
        let soundEnabled = localStorage.getItem('anote_sound_enabled') !== 'false';

        // Web Audio API Chime Synth
        function playChime() {
            if (!soundEnabled) return;
            try {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                const now = ctx.currentTime;

                const osc1 = ctx.createOscillator();
                const gain1 = ctx.createGain();
                osc1.type = 'sine';
                osc1.frequency.setValueAtTime(587.33, now); // D5
                osc1.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5
                gain1.gain.setValueAtTime(0.2, now);
                gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
                osc1.connect(gain1);
                gain1.connect(ctx.destination);
                osc1.start(now);
                osc1.stop(now + 0.5);

                const osc2 = ctx.createOscillator();
                const gain2 = ctx.createGain();
                osc2.type = 'triangle';
                osc2.frequency.setValueAtTime(880, now + 0.12);
                osc2.frequency.exponentialRampToValueAtTime(1174.66, now + 0.35); // D6
                gain2.gain.setValueAtTime(0.25, now + 0.12);
                gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
                osc2.connect(gain2);
                gain2.connect(ctx.destination);
                osc2.start(now + 0.12);
                osc2.stop(now + 0.7);
            } catch (e) {
                // AudioContext not allowed before user gesture
            }
        }

        function toggleSound() {
            soundEnabled = !soundEnabled;
            localStorage.setItem('anote_sound_enabled', soundEnabled);
            const btn = document.getElementById('soundToggleBtn');
            btn.textContent = soundEnabled ? '🔔 Sound: ON' : '🔕 Sound: OFF';
            if (soundEnabled) playChime();
            showToast(soundEnabled ? 'Audio alerts enabled' : 'Audio alerts muted', 'info');
        }

        // Tab Switching
        let currentTab = localStorage.getItem('anote_active_tab') || 'clipboard';

        function switchTab(tabName) {
            currentTab = tabName;
            localStorage.setItem('anote_active_tab', tabName);

            document.getElementById('tabBtnClipboard').classList.toggle('active', tabName === 'clipboard');
            document.getElementById('tabBtnVideos').classList.toggle('active', tabName === 'videos');
            document.getElementById('tabBtnBrowser').classList.toggle('active', tabName === 'browser');

            document.getElementById('tabViewClipboard').classList.toggle('active', tabName === 'clipboard');
            document.getElementById('tabViewVideos').classList.toggle('active', tabName === 'videos');
            document.getElementById('tabViewBrowser').classList.toggle('active', tabName === 'browser');

            if (tabName === 'videos') {
                loadVideos();
            } else if (tabName === 'browser') {
                if (!currentBrowsePathLoaded) {
                    loadBrowsePath('');
                }
            }
        }

        // ================= CLIPBOARD LOGIC =================
        const composerInput = document.getElementById('composerInput');
        const imageStaging = document.getElementById('imageStaging');
        const fileInput = document.getElementById('fileInput');
        const ipList = document.getElementById('ipList');
        const deviceListEl = document.getElementById('deviceList');
        const feedContainer = document.getElementById('feedContainer');
        const profileName = document.getElementById('profileName');
        const postingTarget = document.getElementById('postingTarget');
        const renameModal = document.getElementById('renameModal');
        const deviceNameInput = document.getElementById('deviceNameInput');

        let userName = localStorage.getItem('anote_user_name');
        if (!userName) {
            userName = 'Device-' + clientIp.split('.').pop();
            localStorage.setItem('anote_user_name', userName);
        }
        profileName.textContent = userName;

        let selectedUser = 'Global';
        let clipboardsData = {};
        let userTimestamps = {};
        let stagedImages = [];

        function escapeHtml(str) {
            if (!str) return '';
            return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
        }

        // Render network IPs
        if (ips && ips.length > 0) {
            ips.forEach(ip => {
                const badge = document.createElement('span');
                badge.className = 'ip-badge';
                badge.textContent = `http://${ip}:${port}`;
                badge.title = 'Click to copy URL';
                badge.onclick = () => {
                    navigator.clipboard.writeText(badge.textContent);
                    showToast('Access URL copied!', 'success');
                };
                ipList.appendChild(badge);
            });
        } else {
            const badge = document.createElement('span');
            badge.className = 'ip-badge';
            badge.textContent = `http://localhost:${port}`;
            ipList.appendChild(badge);
        }

        fileInput.addEventListener('change', (e) => {
            handleFiles(e.target.files);
            fileInput.value = '';
        });

        window.addEventListener('paste', (e) => {
            if (currentTab !== 'clipboard') return;
            const items = (e.clipboardData || e.originalEvent.clipboardData).items;
            let foundImage = false;
            for (let item of items) {
                if (item.type.indexOf('image') === 0) {
                    const file = item.getAsFile();
                    if (file) {
                        handleFiles([file]);
                        foundImage = true;
                    }
                }
            }
            if (foundImage) showToast('Image pasted from clipboard!', 'success');
        });

        function handleFiles(files) {
            for (let file of files) {
                if (!file.type.startsWith('image/')) continue;
                const reader = new FileReader();
                reader.onload = (evt) => {
                    stagedImages.push(evt.target.result);
                    renderStagedImages();
                };
                reader.readAsDataURL(file);
            }
        }

        function renderStagedImages() {
            imageStaging.innerHTML = '';
            stagedImages.forEach((b64, idx) => {
                const card = document.createElement('div');
                card.className = 'staged-img-card';
                card.innerHTML = `<img src="${b64}"><button type="button" class="remove-staged-btn" onclick="removeStaged(${idx})">&times;</button>`;
                imageStaging.appendChild(card);
            });
        }

        function removeStaged(idx) {
            stagedImages.splice(idx, 1);
            renderStagedImages();
        }

        async function fetchAllClipboardData() {
            try {
                const res = await fetch('/api/data');
                if (res.ok) {
                    clipboardsData = await res.json();
                    renderDeviceList();
                    renderFeed();
                }
            } catch (err) {}
        }

        function formatTimeAgo(timestamp) {
            if (!timestamp) return 'Never';
            const seconds = Math.floor((Date.now() - timestamp) / 1000);
            if (seconds < 5) return 'just now';
            if (seconds < 60) return `${seconds}s ago`;
            const minutes = Math.floor(seconds / 60);
            if (minutes < 60) return `${minutes}m ago`;
            const hours = Math.floor(minutes / 60);
            return `${hours}h ago`;
        }

        function renderDeviceList() {
            deviceListEl.innerHTML = '';
            const keys = Object.keys(clipboardsData).sort((a, b) => {
                if (a === 'Global') return -1;
                if (b === 'Global') return 1;
                if (a === userName) return -1;
                if (b === userName) return 1;
                return a.localeCompare(b);
            });

            keys.forEach(user => {
                const items = clipboardsData[user] || [];
                const item = document.createElement('div');
                item.className = `device-item ${user === selectedUser ? 'active' : ''}`;
                item.onclick = () => selectUser(user);

                const isMe = user === userName;
                const latestTs = items.length > 0 ? items[0].timestamp : 0;
                const timeAgo = formatTimeAgo(latestTs);
                const count = items.length;

                item.innerHTML = `
                    <div class="device-header-row">
                        <div class="device-name-container">
                            ${escapeHtml(user)} ${isMe ? '<span class="me-badge">Me</span>' : ''}
                        </div>
                    </div>
                    <div class="device-meta">
                        <span>${count} post${count === 1 ? '' : 's'}</span>
                        <span>${timeAgo}</span>
                    </div>
                `;

                if (user !== 'Global' && !isMe) {
                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'delete-device-btn';
                    deleteBtn.innerHTML = '&times;';
                    deleteBtn.title = 'Remove device box';
                    deleteBtn.onclick = (e) => {
                        e.stopPropagation();
                        deleteDeviceBox(user);
                    };
                    item.appendChild(deleteBtn);
                }

                deviceListEl.appendChild(item);
            });
        }

        function selectUser(user) {
            selectedUser = user;
            postingTarget.textContent = selectedUser;
            renderDeviceList();
            renderFeed();
        }

        function renderFeed() {
            feedContainer.innerHTML = '';
            const items = clipboardsData[selectedUser] || [];

            if (items.length === 0) {
                feedContainer.innerHTML = `
                    <div class="empty-feed">
                        No posts found under <strong>${escapeHtml(selectedUser)}</strong>.<br>
                        Paste text or attach images above to post here!
                    </div>
                `;
                return;
            }

            items.forEach(item => {
                const card = document.createElement('div');
                card.className = 'feed-card';

                const timeAgo = formatTimeAgo(item.timestamp);
                const senderName = item.ip ? `${escapeHtml(selectedUser)} (${item.ip})` : escapeHtml(selectedUser);

                let cardHeader = `
                    <div class="feed-card-header">
                        <span class="feed-card-user">${senderName}</span>
                        <div class="feed-card-actions">
                            <span>${timeAgo}</span>
                            <button class="delete-item-btn" title="Delete snippet" onclick="deleteItem('${item.id}')">&times;</button>
                        </div>
                    </div>
                `;

                let textHtml = '';
                if (item.text) {
                    textHtml = `<div class="feed-text">${escapeHtml(item.text)}</div>`;
                }

                let galleryHtml = '';
                if (item.images && item.images.length > 0) {
                    galleryHtml = `<div class="feed-gallery">`;
                    item.images.forEach(imgUrl => {
                        galleryHtml += `
                            <div class="gallery-item" onclick="openLightbox('${imgUrl}')">
                                <img src="${imgUrl}" alt="Attached image">
                                <button class="gallery-overlay-btn" onclick="event.stopPropagation(); copyImage('${imgUrl}')">Copy Img</button>
                            </div>
                        `;
                    });
                    galleryHtml += `</div>`;
                }

                let actionsHtml = `
                    <div style="display:flex; gap:8px; justify-content:flex-end;">
                        ${item.text ? `<button class="btn-secondary" style="font-size:12px; padding:4px 10px;" data-text="${escapeHtml(item.text)}" onclick="copyText(this.getAttribute('data-text'))">📋 Copy Text</button>` : ''}
                    </div>
                `;

                card.innerHTML = cardHeader + textHtml + galleryHtml + actionsHtml;
                feedContainer.appendChild(card);
            });
        }

        async function sendPost() {
            const text = composerInput.value.trim();
            if (!text && stagedImages.length === 0) {
                showToast('Please enter text or attach an image to post', 'error');
                return;
            }

            try {
                const targetUser = selectedUser === 'Global' ? 'Global' : userName;
                const res = await fetch('/api/post', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user: targetUser,
                        text: text,
                        images: stagedImages
                    })
                });

                if (res.ok) {
                    composerInput.value = '';
                    stagedImages = [];
                    renderStagedImages();
                    showToast('Posted successfully!', 'success');
                    await fetchAllClipboardData();
                } else {
                    showToast('Failed to post to server', 'error');
                }
            } catch (err) {
                showToast('Network error posting to server', 'error');
            }
        }

        async function deleteItem(itemId) {
            try {
                const res = await fetch('/api/delete_item', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user: selectedUser, item_id: itemId })
                });
                if (res.ok) {
                    showToast('Deleted item', 'success');
                    await fetchAllClipboardData();
                }
            } catch (err) {
                showToast('Failed to delete item', 'error');
            }
        }

        async function deleteDeviceBox(user) {
            if (!confirm(`Remove entire device box for "${user}"?`)) return;
            try {
                const res = await fetch('/api/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user })
                });
                if (res.ok) {
                    showToast(`Removed device box ${user}`, 'success');
                    if (selectedUser === user) selectUser('Global');
                    await fetchAllClipboardData();
                }
            } catch (err) {
                showToast('Failed to remove device box', 'error');
            }
        }

        function copyText(text) {
            navigator.clipboard.writeText(text).then(() => {
                showToast('Text copied to clipboard!', 'success');
            }).catch(() => {
                showToast('Failed to copy text', 'error');
            });
        }

        async function copyImage(imgUrl) {
            try {
                const res = await fetch(imgUrl);
                const blob = await res.blob();
                if (navigator.clipboard && navigator.clipboard.write) {
                    await navigator.clipboard.write([
                        new ClipboardItem({ [blob.type]: blob })
                    ]);
                    showToast('Image copied to clipboard!', 'success');
                } else {
                    window.open(imgUrl, '_blank');
                    showToast('Opened image in new tab', 'info');
                }
            } catch (err) {
                showToast('Failed to copy image', 'error');
            }
        }

        function openLightbox(url) {
            document.getElementById('lightboxImg').src = url;
            document.getElementById('lightbox').style.display = 'flex';
        }

        function closeLightbox() {
            document.getElementById('lightbox').style.display = 'none';
        }

        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                if (currentTab === 'clipboard') sendPost();
            }
        });

        function openRenameModal() {
            deviceNameInput.value = userName;
            renameModal.style.display = 'flex';
            deviceNameInput.focus();
        }

        function closeRenameModal() {
            renameModal.style.display = 'none';
        }

        function saveDeviceName() {
            const inputName = deviceNameInput.value.trim();
            if (!inputName) {
                showToast('Name cannot be empty', 'error');
                return;
            }
            if (inputName === 'Global') {
                showToast('Name "Global" is reserved', 'error');
                return;
            }
            
            const oldName = userName;
            userName = inputName;
            localStorage.setItem('anote_user_name', userName);
            profileName.textContent = userName;
            
            if (selectedUser === oldName) {
                selectedUser = userName;
            }
            
            closeRenameModal();
            showToast(`Device renamed to "${userName}"`, 'success');
            fetchAllClipboardData();
        }

        function showToast(message, type = 'info', onClick = null) {
            const toast = document.createElement('div');
            toast.className = `toast ${type === 'success' ? 'success' : type === 'error' ? 'error' : type === 'video-alert' ? 'video-alert' : ''}`;
            toast.textContent = message;
            if (onClick) {
                toast.style.cursor = 'pointer';
                toast.onclick = onClick;
            }
            document.getElementById('toastContainer').appendChild(toast);
            
            setTimeout(() => toast.classList.add('show'), 10);
            
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }, 4500);
        }

        // ================= AI VIDEO HUB LOGIC =================
        let loadedVideos = [];
        let lastSeenVideoMtime = 0;
        let lastSeenVideoName = '';
        let isInitialVideoLoad = true;

        async function loadVideos(showFeedback = false) {
            try {
                const res = await fetch('/api/videos');
                if (!res.ok) return;
                const data = await res.json();
                loadedVideos = data.videos || [];
                document.getElementById('watcherLastChecked').textContent = 'Checked ' + new Date().toLocaleTimeString();
                document.getElementById('videoTotalCount').textContent = `(${loadedVideos.length} videos)`;
                document.getElementById('videoCountBadge').textContent = `${loadedVideos.length}`;

                if (loadedVideos.length > 0) {
                    const latest = loadedVideos[0];
                    renderHeroVideo(latest);
                    renderVideoGrid(loadedVideos.slice(1));

                    if (isInitialVideoLoad) {
                        lastSeenVideoMtime = latest.mtime;
                        lastSeenVideoName = latest.filename;
                        isInitialVideoLoad = false;
                    }
                } else {
                    document.getElementById('heroVideoCard').style.display = 'none';
                    document.getElementById('videoGrid').innerHTML = `
                        <div class="empty-feed" style="grid-column: 1/-1;">
                            No generated videos found yet.<br>
                            Ensure your AI video generator outputs to <code>~/face/output</code>.
                        </div>
                    `;
                }

                if (showFeedback) showToast('Video list refreshed', 'success');
            } catch (err) {
                if (showFeedback) showToast('Failed to load videos', 'error');
            }
        }

        function renderHeroVideo(video) {
            const card = document.getElementById('heroVideoCard');
            card.style.display = 'flex';

            document.getElementById('heroNiche').textContent = video.niche || 'AI VIDEO';
            document.getElementById('heroCompletedTime').textContent = video.mtime_fmt;
            document.getElementById('heroTitle').textContent = video.title;
            document.getElementById('heroTopic').textContent = video.topic ? video.topic : '';
            document.getElementById('heroDuration').textContent = video.duration_seconds ? `${video.duration_seconds}s` : 'Video';
            document.getElementById('heroSize').textContent = video.size_fmt;
            document.getElementById('heroFolder').textContent = video.parent_folder;

            const player = document.getElementById('heroVideoPlayer');
            if (player.src !== window.location.origin + video.stream_url) {
                player.src = video.stream_url;
                if (video.thumbnail_url) player.poster = video.thumbnail_url;
            }

            const dlBtn = document.getElementById('heroDownloadBtn');
            dlBtn.href = video.download_url;

            const scriptToggleBtn = document.getElementById('heroScriptToggleBtn');
            const scriptDrawer = document.getElementById('heroScriptDrawer');
            if (video.script) {
                scriptToggleBtn.style.display = 'inline-flex';
                scriptDrawer.textContent = video.script;
            } else {
                scriptToggleBtn.style.display = 'none';
                scriptDrawer.style.display = 'none';
            }
        }

        function toggleHeroScript() {
            const drawer = document.getElementById('heroScriptDrawer');
            drawer.style.display = drawer.style.display === 'block' ? 'none' : 'block';
        }

        function setPlayerSpeed(speed, btn) {
            const player = document.getElementById('heroVideoPlayer');
            player.playbackRate = speed;
            document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            showToast(`Playback speed set to ${speed}x`, 'info');
        }

        function renderVideoGrid(videos) {
            const grid = document.getElementById('videoGrid');
            grid.innerHTML = '';

            if (videos.length === 0) {
                return;
            }

            videos.forEach(v => {
                const card = document.createElement('div');
                card.className = 'video-card';

                const thumbSrc = v.thumbnail_url || '';
                const thumbHtml = thumbSrc 
                    ? `<img src="${thumbSrc}" class="video-thumb" alt="${escapeHtml(v.title)}" loading="lazy">`
                    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#18122B;color:#c084fc;font-size:32px;">🎬</div>`;

                card.innerHTML = `
                    <div class="video-thumb-container" onclick="playVideoInHero('${escapeHtml(v.filename)}')">
                        ${thumbHtml}
                        <div class="thumb-play-overlay">
                            <div class="play-circle">▶</div>
                        </div>
                        <span class="video-duration-badge">${v.duration_seconds ? v.duration_seconds + 's' : v.size_fmt}</span>
                    </div>
                    <div class="video-card-body">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span class="niche-tag">${escapeHtml(v.niche)}</span>
                            <span style="font-size:11px; color:var(--text-secondary);">${v.mtime_fmt}</span>
                        </div>
                        <div class="video-card-title" title="${escapeHtml(v.title)}">${escapeHtml(v.title)}</div>
                        <div class="video-card-meta">
                            <span>${v.size_fmt}</span>
                            <span>${escapeHtml(v.parent_folder)}</span>
                        </div>
                        <div class="video-card-actions">
                            <button type="button" class="btn-secondary btn-sm" style="flex:1;" onclick="playVideoInHero('${escapeHtml(v.filename)}')">
                                ▶ Watch
                            </button>
                            <a href="${v.download_url}" download style="text-decoration:none;">
                                <button type="button" class="btn-success btn-sm">
                                    ⬇️ Download
                                </button>
                            </a>
                        </div>
                    </div>
                `;
                grid.appendChild(card);
            });
        }

        function playVideoInHero(filename) {
            const video = loadedVideos.find(v => v.filename === filename);
            if (!video) return;
            renderHeroVideo(video);
            window.scrollTo({ top: 0, behavior: 'smooth' });
            const player = document.getElementById('heroVideoPlayer');
            player.play().catch(() => {});
        }

        // Live Polling for newly generated videos
        async function checkLatestVideo() {
            try {
                const res = await fetch('/api/videos/latest');
                if (!res.ok) return;
                const data = await res.json();
                const latest = data.latest;
                if (!latest) return;

                if (lastSeenVideoMtime > 0 && latest.mtime > lastSeenVideoMtime && latest.filename !== lastSeenVideoName) {
                    // NEW VIDEO GENERATED!
                    lastSeenVideoMtime = latest.mtime;
                    lastSeenVideoName = latest.filename;

                    playChime();
                    showToast(`🎬 New AI Video Generated: "${latest.title}"! Tap to watch`, 'video-alert', () => {
                        switchTab('videos');
                        playVideoInHero(latest.filename);
                    });

                    // Update UI if in videos tab
                    loadVideos();
                } else if (lastSeenVideoMtime === 0) {
                    lastSeenVideoMtime = latest.mtime;
                    lastSeenVideoName = latest.filename;
                }
            } catch (err) {}
        }

        // ================= FILE BROWSER LOGIC =================
        let currentBrowsePath = '';
        let currentBrowsePathLoaded = false;
        let browseEntries = [];

        async function loadBrowsePath(path) {
            try {
                const res = await fetch(`/api/browse?path=${encodeURIComponent(path)}`);
                if (!res.ok) {
                    showToast('Failed to load directory', 'error');
                    return;
                }
                const data = await res.json();
                currentBrowsePath = data.current_path || '';
                currentBrowsePathLoaded = true;
                browseEntries = data.entries || [];

                renderBreadcrumbs(data.breadcrumbs || []);
                renderBrowseTable(browseEntries, data.parent_path);
            } catch (err) {
                showToast('Error connecting to server', 'error');
            }
        }

        function renderBreadcrumbs(crumbs) {
            const bar = document.getElementById('breadcrumbsBar');
            bar.innerHTML = '';
            crumbs.forEach((c, idx) => {
                const item = document.createElement('span');
                item.className = 'breadcrumb-item';
                item.textContent = c.name;
                item.onclick = () => loadBrowsePath(c.path);
                bar.appendChild(item);

                if (idx < crumbs.length - 1) {
                    const sep = document.createElement('span');
                    sep.className = 'breadcrumb-sep';
                    sep.textContent = '/';
                    bar.appendChild(sep);
                }
            });
        }

        function renderBrowseTable(entries, parentPath) {
            const tbody = document.getElementById('fileTableBody');
            tbody.innerHTML = '';

            if (parentPath !== null && parentPath !== undefined) {
                const upRow = document.createElement('tr');
                upRow.className = 'file-row is-folder';
                upRow.onclick = () => loadBrowsePath(parentPath);
                upRow.innerHTML = `
                    <td class="file-name-cell">📁 .. (up one level)</td>
                    <td>-</td>
                    <td>-</td>
                    <td class="file-actions-cell">
                        <button type="button" class="btn-secondary btn-sm" onclick="event.stopPropagation(); loadBrowsePath('${escapeHtml(parentPath)}')">Open</button>
                    </td>
                `;
                tbody.appendChild(upRow);
            }

            if (entries.length === 0) {
                const emptyRow = document.createElement('tr');
                emptyRow.innerHTML = `<td colspan="4" style="text-align: center; padding: 25px; color: var(--text-secondary);">This directory is empty</td>`;
                tbody.appendChild(emptyRow);
                return;
            }

            entries.forEach(e => {
                const row = document.createElement('tr');
                row.className = `file-row ${e.is_dir ? 'is-folder' : ''}`;

                let icon = '📄';
                if (e.is_dir) icon = '📁';
                else if (e.is_video) icon = '🎬';
                else if (e.is_image) icon = '🖼️';

                let actionHtml = '';
                if (e.is_dir) {
                    row.onclick = () => loadBrowsePath(e.rel_path);
                    actionHtml = `<button type="button" class="btn-secondary btn-sm" onclick="event.stopPropagation(); loadBrowsePath('${escapeHtml(e.rel_path)}')">Open</button>`;
                } else {
                    actionHtml = `
                        <div style="display:flex; gap:6px;">
                            ${e.is_video ? `<button type="button" class="btn-secondary btn-sm" onclick="event.stopPropagation(); openVideoModal('${escapeHtml(e.name)}', '${e.stream_url}', '${e.download_url}')">▶</button>` : ''}
                            ${e.is_image ? `<button type="button" class="btn-secondary btn-sm" onclick="event.stopPropagation(); openLightbox('${e.stream_url}')">👁</button>` : ''}
                            <a href="${e.download_url}" download style="text-decoration:none;">
                                <button type="button" class="btn-success btn-sm">⬇️</button>
                            </a>
                        </div>
                    `;
                }

                row.innerHTML = `
                    <td class="file-name-cell">
                        <span>${icon}</span>
                        <span style="word-break: break-word;">${escapeHtml(e.name)}</span>
                    </td>
                    <td style="color: var(--text-secondary); font-family: ui-monospace, monospace;">${e.is_dir ? (e.item_count + ' items') : e.size_fmt}</td>
                    <td style="color: var(--text-secondary);">${e.mtime_fmt}</td>
                    <td class="file-actions-cell">${actionHtml}</td>
                `;
                tbody.appendChild(row);
            });
        }

        function filterBrowseTable() {
            const query = document.getElementById('fileSearchInput').value.toLowerCase().trim();
            if (!query) {
                renderBrowseTable(browseEntries, currentBrowsePath ? (currentBrowsePath.includes('/') ? currentBrowsePath.substring(0, currentBrowsePath.lastIndexOf('/')) : '') : null);
                return;
            }
            const filtered = browseEntries.filter(e => e.name.toLowerCase().includes(query));
            renderBrowseTable(filtered, null);
        }

        function openVideoModal(title, streamUrl, downloadUrl) {
            document.getElementById('videoModalTitle').textContent = title;
            const player = document.getElementById('modalVideoPlayer');
            player.src = streamUrl;
            document.getElementById('modalDownloadBtn').href = downloadUrl;
            document.getElementById('videoModal').style.display = 'flex';
            player.play().catch(() => {});
        }

        function closeVideoModal() {
            const player = document.getElementById('modalVideoPlayer');
            player.pause();
            player.src = '';
            document.getElementById('videoModal').style.display = 'none';
        }

        // ================= BACKGROUND SYNC LOOPS =================
        async function checkClipboardUpdate() {
            try {
                const res = await fetch('/api/status');
                if (res.ok) {
                    const status = await res.json();
                    let needsFetch = false;
                    const serverUsers = status.users || {};
                    const serverUserKeys = Object.keys(serverUsers);
                    const localUserKeys = Object.keys(userTimestamps);
                    
                    if (serverUserKeys.length !== localUserKeys.length) {
                        needsFetch = true;
                    } else {
                        for (const u of serverUserKeys) {
                            if (!userTimestamps[u] || serverUsers[u].timestamp > userTimestamps[u] || serverUsers[u].count !== (userTimestamps[u + '_count'] || 0)) {
                                needsFetch = true;
                                break;
                            }
                        }
                    }
                    
                    if (needsFetch) {
                        userTimestamps = {};
                        for (const u of serverUserKeys) {
                            userTimestamps[u] = serverUsers[u].timestamp;
                            userTimestamps[u + '_count'] = serverUsers[u].count;
                        }
                        await fetchAllClipboardData();
                    } else {
                        renderDeviceList();
                    }
                }
            } catch (err) {}
        }

        // Initialization
        const initialSoundBtn = document.getElementById('soundToggleBtn');
        initialSoundBtn.textContent = soundEnabled ? '🔔 Sound: ON' : '🔕 Sound: OFF';

        fetchAllClipboardData().then(() => {
            fetch('/api/status')
                .then(res => res.json())
                .then(status => {
                    const serverUsers = status.users || {};
                    userTimestamps = {};
                    for (const u in serverUsers) {
                        userTimestamps[u] = serverUsers[u].timestamp;
                        userTimestamps[u + '_count'] = serverUsers[u].count;
                    }
                });
        });

        // Initialize active tab from storage
        switchTab(currentTab);

        // Background polling:
        // Clipboard every 3s
        setInterval(checkClipboardUpdate, 3000);
        // Video monitor every 5s
        setInterval(checkLatestVideo, 5000);