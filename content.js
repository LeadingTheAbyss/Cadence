(function () {
    const SITE_META = {
        leetcode: { label: 'LeetCode', url: 'https://leetcode.com/', icon: 'LC' },
        github: { label: 'GitHub', url: 'https://github.com/', icon: 'GH' },
        codeforces: { label: 'Codeforces', url: 'https://codeforces.com/problemset', icon: 'CF' }
    };

    const STORAGE_KEYS = ['isDailyDone', 'isGithubDone', 'isCodeforcesDone', 'snoozeUntil'];

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

    function updateBanner(state) {
        const isSnoozed = state.snoozeUntil && Date.now() < state.snoozeUntil;
        const pending = [];
        if (state.isDailyDone !== true) pending.push('leetcode');
        if (state.isGithubDone !== true) pending.push('github');
        if (state.isCodeforcesDone !== true) pending.push('codeforces');

        if (isSnoozed || pending.length === 0) {
            removeBanner();
            return;
        }

        renderBanner(pending);
    }

    function renderBanner(pending) {
        if (!document.body) return;
        let card = document.getElementById('lc-reminder-card');
        if (!card) {
            card = document.createElement('div');
            card.id = 'lc-reminder-card';
            document.documentElement.appendChild(card);
        }

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

        card.innerHTML = `
            <div class="lc-header">
                <span class="lc-pulse-dot"></span>
                <span class="lc-title">Dailies pending</span>
                <button class="lc-close" id="lc-close-btn" title="Snooze 2 hours" aria-label="Snooze">&times;</button>
            </div>
            <div class="lc-list">${itemsHtml}</div>
            <div class="lc-footer">
                <button class="lc-btn lc-btn-primary" id="lc-verify-btn">Verify now</button>
                <div class="lc-snooze-group">
                    <button class="lc-btn lc-btn-ghost" id="lc-snooze-2h">+2h</button>
                    <button class="lc-btn lc-btn-ghost" id="lc-snooze-6h">+6h</button>
                </div>
            </div>
        `;

        // Trigger entrance animation on next frame
        requestAnimationFrame(() => card.classList.add('lc-visible'));

        const verifyBtn = document.getElementById('lc-verify-btn');
        verifyBtn.addEventListener('click', () => {
            verifyBtn.disabled = true;
            verifyBtn.textContent = 'Checking...';
            chrome.runtime.sendMessage({ action: 'forceCheck' });
        });

        document.getElementById('lc-snooze-2h').addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: 'snooze', hours: 2 });
        });

        document.getElementById('lc-snooze-6h').addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: 'snooze', hours: 6 });
        });

        document.getElementById('lc-close-btn').addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: 'snooze', hours: 2 });
        });
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
            #lc-reminder-card {
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 300px;
                z-index: 2147483647;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                background: linear-gradient(155deg, #d61f1f 0%, #a10f0f 100%);
                color: #ffffff;
                border-radius: 14px;
                box-shadow: 0 20px 40px -10px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.08) inset;
                overflow: hidden;
                opacity: 0;
                transform: translateY(16px) scale(0.97);
                transition: opacity 0.22s ease, transform 0.22s ease;
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
            #lc-reminder-card .lc-close {
                background: transparent;
                border: none;
                color: rgba(255,255,255,0.75);
                font-size: 20px;
                line-height: 1;
                cursor: pointer;
                padding: 0 4px;
                border-radius: 6px;
                transition: background 0.15s, color 0.15s;
            }
            #lc-reminder-card .lc-close:hover {
                background: rgba(255,255,255,0.15);
                color: #ffffff;
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
        `;
        document.head.appendChild(style);
    }
})();
