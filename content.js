(function () {
    const SITE_META = {
        leetcode: { label: 'LeetCode', url: 'https://leetcode.com/', icon: 'LC' },
        github: { label: 'GitHub', url: 'https://github.com/', icon: 'GH' },
        codeforces: { label: 'Codeforces', url: 'https://codeforces.com/problemset', icon: 'CF' }
    };

    const STORAGE_KEYS = ['isDailyDone', 'isGithubDone', 'isCodeforcesDone', 'snoozeUntil', 'enabledPlatforms'];

    function init() {
        injectStyles();
        chrome.storage.local.get(STORAGE_KEYS, updateBanner);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    chrome.storage.onChanged.addListener(function () {
        chrome.storage.local.get(STORAGE_KEYS, updateBanner);
    });

    // Keep the urgency gradient current even if nothing else changes.
    setInterval(function () {
        chrome.storage.local.get(STORAGE_KEYS, updateBanner);
    }, 5 * 60 * 1000);

    function updateBanner(state) {
        const isSnoozed = state.snoozeUntil && Date.now() < state.snoozeUntil;
        const enabled = Object.assign({ leetcode: true, github: true, codeforces: true }, state.enabledPlatforms);

        const pending = [];
        if (enabled.leetcode && state.isDailyDone !== true) pending.push('leetcode');
        if (enabled.github && state.isGithubDone !== true) pending.push('github');
        if (enabled.codeforces && state.isCodeforcesDone !== true) pending.push('codeforces');

        if (isSnoozed || pending.length === 0) {
            removeBanner();
            return;
        }

        renderBanner(pending, enabled);
    }

    // Returns a 0-1 fraction of how far through the current IST day we are.
    // 0 = 12:00 AM IST, approaching 1 = just before midnight IST.
    function getISTDayProgress() {
        const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
        const istNowMs = Date.now() + IST_OFFSET_MS;
        const msIntoDay = istNowMs % 86400000;
        return msIntoDay / 86400000;
    }

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    function hexToRgb(hex) {
        const clean = hex.replace('#', '');
        return {
            r: parseInt(clean.substring(0, 2), 16),
            g: parseInt(clean.substring(2, 4), 16),
            b: parseInt(clean.substring(4, 6), 16)
        };
    }

    function rgbToHex({ r, g, b }) {
        const toHex = (v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    function lerpColor(hexA, hexB, t) {
        const a = hexToRgb(hexA);
        const b = hexToRgb(hexB);
        return rgbToHex({
            r: lerp(a.r, b.r, t),
            g: lerp(a.g, b.g, t),
            b: lerp(a.b, b.b, t)
        });
    }

    function darken(hex, amount) {
        const { r, g, b } = hexToRgb(hex);
        const factor = 1 - amount;
        return rgbToHex({ r: r * factor, g: g * factor, b: b * factor });
    }

    // Interpolates across an arbitrary array of hex color stops, splitting
    // t (0-1) into stops.length - 1 even segments.
    function lerpMultiStop(stops, t) {
        const segments = stops.length - 1;
        const clamped = Math.min(1, Math.max(0, t));
        const segmentSize = 1 / segments;
        const segmentIndex = Math.min(segments - 1, Math.floor(clamped / segmentSize));
        const segmentT = (clamped - segmentIndex * segmentSize) / segmentSize;
        return lerpColor(stops[segmentIndex], stops[segmentIndex + 1], segmentT);
    }

    const URGENCY_STOPS = ['#0b3d63', '#4fa8e0', '#ff8080', '#7a0f0f'];
    const URGENCY_STOPS_DARK = URGENCY_STOPS.map((hex) => darken(hex, 0.35));

    function getUrgencyGradient() {
        const t = getISTDayProgress();
        const top = lerpMultiStop(URGENCY_STOPS, t);
        const bottom = lerpMultiStop(URGENCY_STOPS_DARK, t);
        return `linear-gradient(155deg, ${top} 0%, ${bottom} 100%)`;
    }

    function renderBanner(pending, enabled) {
        if (!document.body) return;
        let card = document.getElementById('lc-reminder-card');
        const wasSettingsOpen = card && card.classList.contains('lc-settings-open');
        if (!card) {
            card = document.createElement('div');
            card.id = 'lc-reminder-card';
            document.body.appendChild(card);
        }

        card.style.background = getUrgencyGradient();

        const itemsHtml = pending.map((key) => {
            const meta = SITE_META[key];
            return `
                <a class="lc-item" href="${meta.url}" target="_blank" rel="noopener noreferrer">
                    <span class="lc-item-badge">${meta.icon}</span>
                    <span class="lc-item-label">${meta.label}</span>
                    <span class="lc-item-arrow">&rarr;</span>
                </a>
            `;
        }).join('');

        const toggleHtml = Object.keys(SITE_META).map((key) => {
            const meta = SITE_META[key];
            const checked = enabled[key] ? 'checked' : '';
            return `
                <label class="lc-toggle">
                    <input type="checkbox" data-platform="${key}" ${checked}>
                    <span>Track ${meta.label}</span>
                </label>
            `;
        }).join('');

        card.innerHTML = `
            <div class="lc-header">
                <span class="lc-pulse-dot"></span>
                <span class="lc-title">Dailies pending</span>
                <button class="lc-gear-btn" id="lc-gear-btn" title="Settings" aria-label="Settings">&#9881;</button>
            </div>
            <div class="lc-list">${itemsHtml}</div>
            <div class="lc-settings-panel" id="lc-settings-panel">
                <div class="lc-settings-inner">
                    ${toggleHtml}
                    <button class="lc-btn lc-btn-ghost lc-btn-full" id="lc-open-options-btn">Edit usernames &amp; token &rarr;</button>
                </div>
            </div>
            <div class="lc-footer">
                <button class="lc-btn lc-btn-primary" id="lc-verify-btn">Verify now</button>
                <div class="lc-snooze-group">
                    <button class="lc-btn lc-btn-ghost" id="lc-snooze-2h">+2h</button>
                    <button class="lc-btn lc-btn-ghost" id="lc-snooze-6h">+6h</button>
                </div>
            </div>
        `;

        if (wasSettingsOpen) card.classList.add('lc-settings-open');

        // Trigger entrance animation on next frame
        requestAnimationFrame(() => card.classList.add('lc-visible'));

        const verifyBtn = document.getElementById('lc-verify-btn');
        verifyBtn.addEventListener('click', () => {
            chrome.storage.local.get(['leetcodeUsername', 'githubUsername', 'githubToken', 'codeforcesHandle'], (ids) => {
                const isUnconfigured = pending.some((key) => {
                    if (key === 'leetcode') return !ids.leetcodeUsername;
                    if (key === 'github') return !ids.githubUsername || !ids.githubToken;
                    if (key === 'codeforces') return !ids.codeforcesHandle;
                    return false;
                });

                if (isUnconfigured) {
                    showToast(card, 'Profile not set up. Tap the gear icon above and add your username.');
                    return;
                }

                verifyBtn.disabled = true;
                verifyBtn.textContent = 'Checking...';

                const resetBtn = () => {
                    if (!verifyBtn.isConnected) return;
                    verifyBtn.disabled = false;
                    verifyBtn.textContent = 'Verify now';
                };

                const fallbackTimer = setTimeout(resetBtn, 10000);

                chrome.runtime.sendMessage({ action: 'forceCheck' }, () => {
                    clearTimeout(fallbackTimer);
                    resetBtn();
                });
            });
        });

        document.getElementById('lc-snooze-2h').addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: 'snooze', hours: 2 });
        });

        document.getElementById('lc-snooze-6h').addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: 'snooze', hours: 6 });
        });

        document.getElementById('lc-gear-btn').addEventListener('click', () => {
            card.classList.toggle('lc-settings-open');
        });

        document.getElementById('lc-open-options-btn').addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: 'openOptions' });
        });

        card.querySelectorAll('.lc-toggle input[data-platform]').forEach((input) => {
            input.addEventListener('change', () => {
                chrome.storage.local.get(['enabledPlatforms'], (result) => {
                    const next = Object.assign({ leetcode: true, github: true, codeforces: true }, result.enabledPlatforms);
                    next[input.dataset.platform] = input.checked;
                    chrome.storage.local.set({ enabledPlatforms: next });
                });
            });
        });
    }

    function showToast(card, message) {
        const existing = card.querySelector('.lc-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'lc-toast';
        toast.textContent = message;
        card.appendChild(toast);

        requestAnimationFrame(() => toast.classList.add('lc-toast-visible'));

        setTimeout(() => {
            toast.classList.remove('lc-toast-visible');
            setTimeout(() => toast.remove(), 200);
        }, 3200);
    }

    function removeBanner() {
        const card = document.getElementById('lc-reminder-card');
        if (!card) return;
        card.classList.remove('lc-visible');
        setTimeout(() => card.remove(), 200);
    }

    function injectStyles() {
        if (document.getElementById('lc-reminder-style')) return;
        const style = document.createElement('style');
        style.id = 'lc-reminder-style';
        style.textContent = `
            #lc-reminder-card, #lc-reminder-card * {
                font-style: normal;
                text-transform: none;
                letter-spacing: normal;
                box-sizing: border-box;
            }
            #lc-reminder-card {
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 300px;
                z-index: 2147483647;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                background: #0b3d63;
                color: #ffffff;
                border-radius: 14px;
                box-shadow: 0 20px 40px -10px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.08) inset;
                overflow: hidden;
                opacity: 0;
                transform: translateY(16px) scale(0.97);
                transition: background 1s ease, opacity 0.22s ease, transform 0.22s ease;
                pointer-events: none;
            }
            #lc-reminder-card.lc-visible {
                opacity: 1;
                transform: translateY(0) scale(1);
                pointer-events: auto;
            }
            #lc-reminder-card .lc-header {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 14px 12px 12px 16px;
                border-bottom: 1px solid rgba(255,255,255,0.14);
            }
            #lc-reminder-card .lc-pulse-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #ffe066;
                box-shadow: 0 0 0 rgba(255,224,102,0.6);
                animation: lc-pulse 1.8s infinite;
                flex-shrink: 0;
            }
            @keyframes lc-pulse {
                0% { box-shadow: 0 0 0 0 rgba(255,224,102,0.55); }
                70% { box-shadow: 0 0 0 7px rgba(255,224,102,0); }
                100% { box-shadow: 0 0 0 0 rgba(255,224,102,0); }
            }
            #lc-reminder-card .lc-title {
                font-size: 13.5px;
                font-weight: 700;
                letter-spacing: 0.3px;
                flex: 1;
                text-transform: uppercase;
                opacity: 0.95;
            }
            #lc-reminder-card .lc-gear-btn {
                background: transparent;
                border: none;
                color: #ffffff;
                opacity: 0.75;
                font-size: 15px;
                line-height: 1;
                cursor: pointer;
                padding: 2px 4px;
                border-radius: 6px;
                transition: opacity 0.15s, background 0.15s;
            }
            #lc-reminder-card .lc-gear-btn:hover {
                opacity: 1;
                background: rgba(255,255,255,0.12);
            }
            #lc-reminder-card .lc-settings-panel {
                max-height: 0;
                overflow: hidden;
                transition: max-height 0.25s ease;
            }
            #lc-reminder-card.lc-settings-open .lc-settings-panel {
                max-height: 220px;
            }
            #lc-reminder-card .lc-settings-inner {
                display: flex;
                flex-direction: column;
                gap: 8px;
                padding: 4px 12px 12px 12px;
            }
            #lc-reminder-card .lc-toggle {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 12.5px;
                cursor: pointer;
            }
            #lc-reminder-card .lc-toggle input {
                cursor: pointer;
            }
            #lc-reminder-card .lc-list {
                display: flex;
                flex-direction: column;
                gap: 6px;
                padding: 12px;
            }
            #lc-reminder-card .lc-item {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 8px 10px;
                background: rgba(255,255,255,0.08);
                border-radius: 9px;
                text-decoration: none;
                color: #ffffff;
                transition: background 0.15s, transform 0.1s;
            }
            #lc-reminder-card .lc-item:hover {
                background: rgba(255,255,255,0.18);
                transform: translateX(2px);
            }
            #lc-reminder-card .lc-item-badge {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 28px;
                height: 28px;
                flex-shrink: 0;
                border-radius: 7px;
                background: rgba(0,0,0,0.28);
                font-size: 10.5px;
                font-weight: 800;
                letter-spacing: 0.2px;
            }
            #lc-reminder-card .lc-item-label {
                font-size: 13.5px;
                font-weight: 600;
                flex: 1;
            }
            #lc-reminder-card .lc-item-arrow {
                opacity: 0.6;
                font-size: 13px;
                transition: transform 0.15s;
            }
            #lc-reminder-card .lc-item:hover .lc-item-arrow {
                transform: translateX(2px);
                opacity: 1;
            }
            #lc-reminder-card .lc-footer {
                display: flex;
                flex-direction: column;
                gap: 8px;
                padding: 4px 12px 14px 12px;
            }
            #lc-reminder-card .lc-btn {
                border: none;
                border-radius: 8px;
                font-weight: 700;
                cursor: pointer;
                font-family: inherit;
                transition: filter 0.15s, background 0.15s, opacity 0.15s;
            }
            #lc-reminder-card .lc-btn:active {
                filter: brightness(0.9);
            }
            #lc-reminder-card .lc-btn-primary {
                background: #ffffff;
                color: #a10f0f;
                font-size: 13.5px;
                padding: 9px 0;
                width: 100%;
            }
            #lc-reminder-card .lc-btn-primary:hover {
                background: #ffe9e9;
            }
            #lc-reminder-card .lc-btn-primary:disabled {
                opacity: 0.7;
                cursor: default;
            }
            #lc-reminder-card .lc-snooze-group {
                display: flex;
                gap: 8px;
            }
            #lc-reminder-card .lc-btn-ghost {
                flex: 1;
                background: rgba(255,255,255,0.1);
                color: #ffffff;
                font-size: 12px;
                padding: 7px 0;
                border: 1px solid rgba(255,255,255,0.25);
            }
            #lc-reminder-card .lc-btn-ghost:hover {
                background: rgba(255,255,255,0.2);
            }
            #lc-reminder-card .lc-btn-full {
                width: 100%;
                font-size: 12px;
                padding: 8px 0;
            }
            #lc-reminder-card .lc-toast {
                position: absolute;
                left: 12px;
                right: 12px;
                bottom: 100%;
                margin-bottom: 8px;
                background: rgba(0,0,0,0.88);
                color: #ffffff;
                font-size: 12px;
                font-weight: 600;
                line-height: 1.4;
                padding: 9px 11px;
                border-radius: 8px;
                opacity: 0;
                transform: translateY(4px);
                transition: opacity 0.2s ease, transform 0.2s ease;
                pointer-events: none;
                box-shadow: 0 8px 20px -6px rgba(0,0,0,0.5);
            }
            #lc-reminder-card .lc-toast.lc-toast-visible {
                opacity: 1;
                transform: translateY(0);
            }
        `;
        document.head.appendChild(style);
    }
})();
