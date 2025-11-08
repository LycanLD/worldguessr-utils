// ==UserScript==
// @name         Lyc4n's WorldGuessr Utils
// @namespace    http://tampermonkey.net/
// @version      4.1.2
// @description  A modern, updated and undetected WorldGuessr cheat!
// @author       Lyc4nLĐ
// @match        https://www.worldguessr.com/*
// @icon         https://raw.githubusercontent.com/LycanLD/lycanld.github.io/refs/heads/main/icon.png
// @grant        none
// @downloadURL https://github.com/LycanLD/worldguessr-utils/raw/refs/heads/main/worldguessr_utils.user.js
// @updateURL https://github.com/LycanLD/worldguessr-utils/raw/refs/heads/main/worldguessr_utils.user.js
// ==/UserScript==

(function() {
    'use strict';

    // --- CONFIGURATION & STATE ---
    const THEMES = {
        ocean: { primary: '#6750A4', secondary: '#CCC2DC', surface: '#FFFBFE', onSurface: '#1C1B1F', background: 'rgba(255, 251, 254, 0.8)' },
        forest: { primary: '#4F7351', secondary: '#A9C6A9', surface: '#F7F3F0', onSurface: '#1D1C1A', background: 'rgba(247, 243, 240, 0.8)' },
        sunset: { primary: '#B54708', secondary: '#FFD8C4', surface: '#FFF8F3', onSurface: '#1E1B15', background: 'rgba(255, 248, 243, 0.8)' },
        dark: { primary: '#A8C7FA', secondary: '#CBD5E1', surface: '#1C1B1F', onSurface: '#E6E1E5', background: '#2B2930' }
    };

    let currentTheme = THEMES.ocean;
    let settings = {
        blockAds: true,
        autoOpenGUI: true,
        theme: 'ocean'
    };
    let sessionHistory = [];

    let guiContainer = null;
    let toggleButton = null;
    let locationObserver = null;
    let isDragging = false;
    let currentX, currentY, initialX, initialY, xOffset = 20, yOffset = 20;
    let lastLocationSrc = null; // Track the last iframe src to detect new rounds

    // --- SETTINGS STORAGE ---
    function loadSettings() {
        try {
            const saved = JSON.parse(localStorage.getItem('worldGuessrHelperSettings'));
            if (saved) {
                settings = { ...settings, ...saved };
                currentTheme = THEMES[settings.theme] || THEMES.ocean;
            }
        } catch (e) { console.error("Failed to load settings:", e); }
    }

    function saveSettings() {
        localStorage.setItem('worldGuessrHelperSettings', JSON.stringify(settings));
    }

    // --- BANNED PAGE HANDLER (Unchanged behavior) ---
    if (window.location.pathname === '/banned' || window.location.pathname === '/banned2') {
        const handleBannedPage = () => {
            const backdrop = document.createElement('div'); backdrop.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10000;';
            const modal = document.createElement('div'); modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#1f2937;padding:20px;border-radius:8px;color:white;z-index:10001;';
            const message = document.createElement('p'); message.textContent = 'The Cheat has been detected!\nPlease Enter 10-20 random characters to bypass the anti-cheat.\n\nExample (do not use the example):\ndf89aj3n4r98nd9'; message.style.margin='0 0 15px 0';
            const input = document.createElement('input'); input.type='text'; input.style.cssText='width:100%;margin-bottom:15px;padding:8px;border-radius:4px;border:1px solid #4b5563;background:#374151;color:white;';
            const submitButton = document.createElement('button'); submitButton.textContent='Submit'; submitButton.style.cssText='padding:8px 16px;background:#3b82f6;color:white;border:none;border-radius:4px;cursor:pointer;';
            submitButton.onclick = () => {
                const chars = input.value.trim();
                if (chars && chars !== 'df89aj3n4r98nd9') {
                    const history = JSON.parse(localStorage.getItem('mapDivClassHistory') || '[]');
                    if (!history.includes(chars)) { localStorage.removeItem('banned'); localStorage.setItem('mapDivClass', chars); history.push(chars); localStorage.setItem('mapDivClassHistory', JSON.stringify(history)); window.location.href = 'https://www.worldguessr.com/'; }
                    else { alert('You cannot reuse a previous map div name!'); }
                } else { alert('Invalid input or you used the example!'); }
            };
            modal.appendChild(message); modal.appendChild(input); modal.appendChild(submitButton);
            document.body.appendChild(backdrop); document.body.appendChild(modal);
        };
        handleBannedPage(); return;
    }

    // --- CORE: Extract location robustly from svEmbed iframe ---
    function extractLocationFromIframe() {
        const iframe = document.querySelector('iframe[src*="svEmbed"]');
        if (!iframe) return null;
        try {
            const url = new URL(iframe.src, window.location.origin);
            const lat = parseFloat(url.searchParams.get('lat'));
            const lon = parseFloat(url.searchParams.get('long') || url.searchParams.get('lng') || url.searchParams.get('lon'));
            if (!isNaN(lat) && !isNaN(lon)) return { lat, long: lon };
        } catch (e) { console.error("Error parsing iframe src:", e); }
        return null;
    }

    async function getLocationDetails(lat, lon) {
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`, { headers: { 'User-Agent': 'WorldGuessrCheatGUI/4.1.2' } });
            if (!response.ok) throw new Error(`API error: ${response.statusText}`);
            const data = await response.json();
            const address = data.display_name || "Address not found.";
            const country = data.address?.country || "Unknown Country";
            const countryCode = (data.address?.country_code || "XX").toUpperCase();
            return { address, country, countryCode };
        } catch (error) {
            console.error("Error fetching details:", error);
            return { address: "Could not fetch address.", country: "Unknown", countryCode: "XX" };
        }
    }

    function getCountryFlag(countryCode) {
        if (!countryCode || countryCode.length !== 2) return '';
        return countryCode.split('').map(char => String.fromCodePoint(char.charCodeAt(0) + 127397)).join('');
    }

    function addToHistory(loc, details) {
        const historyItem = { lat: loc.lat, long: loc.long, ...details, timestamp: new Date().toLocaleTimeString() };
        sessionHistory.unshift(historyItem);
        if (sessionHistory.length > 10) sessionHistory.pop();
        renderHistory();
    }

    function renderHistory() {
        const historyContainer = guiContainer.querySelector('#history-content');
        if (!historyContainer) return;
        if (sessionHistory.length === 0) {
            historyContainer.innerHTML = '<p style="color: #888;">No history yet.</p>';
            return;
        }
        historyContainer.innerHTML = sessionHistory.map(item => `
            <div class="history-item">
                <div class="history-item-header">
                    <span class="history-item-time">${item.timestamp}</span>
                    <span class="history-item-country">${getCountryFlag(item.countryCode)} ${item.country}</span>
                </div>
                <div class="history-item-address">${item.address}</div>
                <a href="https://www.google.com/maps?q=${item.lat},${item.long}" target="_blank" class="history-item-link">View on Google Maps</a>
            </div>
        `).join('');
    }

    async function updateLocationInGUI(isAutoRefresh = false) {
        const loc = extractLocationFromIframe();
        if (!loc) { showStatus("Could not determine location. Start a round first.", "error"); return; }

        showStatus("Fetching location details...", "loading");
        const details = await getLocationDetails(loc.lat, loc.long);

        const coordsEl = guiContainer.querySelector('#coords-display');
        const countryEl = guiContainer.querySelector('#country-display');
        const addressEl = guiContainer.querySelector('#address-display');
        const mapEmbed = guiContainer.querySelector('#map-embed');

        if (coordsEl) coordsEl.textContent = `${loc.lat.toFixed(6)}, ${loc.long.toFixed(6)}`;
        if (countryEl) countryEl.innerHTML = `${getCountryFlag(details.countryCode)} ${details.country}`;
        if (addressEl) addressEl.textContent = details.address;
        if (mapEmbed) mapEmbed.src = `https://www.google.com/maps?q=${loc.lat},${loc.long}&z=18&output=embed`;

        addToHistory(loc, details);

        showStatus(isAutoRefresh ? "New round location found!" : "Location found!", "success");

        if (isAutoRefresh && settings.autoOpenGUI && guiContainer.classList.contains('hidden')) {
            toggleGUI();
        }
    }

    function showStatus(message, type = 'info') {
        const statusEl = guiContainer.querySelector('#status-message');
        if (!statusEl) return;
        statusEl.textContent = message;
        statusEl.className = `status-message ${type}`;
    }

    // --- GUI STYLES (use id for style tag so we can safely replace it) ---
    function applyStyles() {
        const existing = document.getElementById('wg-cheat-styles');
        if (existing) existing.remove();

        const style = document.createElement('style');
        style.id = 'wg-cheat-styles';
        style.textContent = `
            @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200');

            :root {
                --md-sys-color-primary: ${currentTheme.primary};
                --md-sys-color-secondary: ${currentTheme.secondary};
                --md-sys-color-surface: ${currentTheme.surface};
                --md-sys-color-on-surface: ${currentTheme.onSurface};
                --md-sys-color-background: ${currentTheme.background};
                --current-theme: ${settings.theme};
            }

            body { font-family: 'Roboto', sans-serif; }

            #wg-cheat-toggle-btn {
                position: fixed; bottom: 24px; left: 24px; z-index: 10003;
                width: 56px; height: 56px; background: var(--md-sys-color-primary); color: white;
                border: none; border-radius: 16px; cursor: pointer; font-size: 24px;
                box-shadow: 0 3px 6px rgba(0,0,0,0.16), 0 3px 6px rgba(0,0,0,0.23);
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                display: flex; align-items: center; justify-content: center;
            }
            #wg-cheat-toggle-btn:hover { transform: scale(1.1); box-shadow: 0 6px 12px rgba(0,0,0,0.2); }

            #wg-cheat-gui {
                position: fixed; top: 20px; left: 20px; z-index: 10004;
                width: 450px; max-width: 90vw; height: 900px; max-height: 90vh;
                background: var(--md-sys-color-surface); color: var(--md-sys-color-on-surface);
                border-radius: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
                display: none; flex-direction: column; overflow: hidden;
                transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                transform: scale(0.9) translateY(20px); opacity: 0;
            }
            #wg-cheat-gui.visible { display: flex; transform: scale(1) translateY(0); opacity: 1; }
            #wg-cheat-gui.hidden { display: none; }

            .gui-header {
                background: var(--md-sys-color-primary); color: white; padding: 16px 20px;
                display: flex; justify-content: space-between; align-items: center;
                cursor: move;
            }
            .gui-header h3 { margin: 0; font-size: 20px; font-weight: 500; }
            .gui-close-btn { background: none; border: none; color: white; font-size: 24px; cursor: pointer; padding: 0; line-height: 1; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; transition: background 0.2s; }
            .gui-close-btn:hover { background: rgba(255,255,255,0.2); }

            .tab-bar {
                display: flex; background: var(--md-sys-color-surface); border-bottom: 1px solid rgba(0,0,0,0.1);
            }
            .tab-button {
                flex: 1; padding: 12px; background: none; border: none; color: var(--md-sys-color-on-surface);
                font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.3s;
                position: relative;
            }
            .tab-button:hover { background: color-mix(in srgb, var(--md-sys-color-primary) 10%, transparent); }
            .tab-button.active { color: var(--md-sys-color-primary); }
            .tab-button.active::after {
                content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 3px;
                background: var(--md-sys-color-primary); border-radius: 3px 3px 0 0;
                animation: slideIn 0.3s ease-out;
            }
            @keyframes slideIn { from { transform: scaleX(0); } to { transform: scaleX(1); } }

            .tab-content {
                flex-grow: 1; padding: 20px; overflow-y: auto; display: none;
            }
            .tab-content.active { display: block; animation: fadeIn 0.3s ease-out; }
            @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

            .info-card {
                background: var(--md-sys-color-background); border-radius: 12px; padding: 16px; margin-bottom: 16px;
            }
            .info-card h4 { margin: 0 0 12px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; color: #999; }
            .info-card p { margin: 8px 0; font-size: 16px; word-wrap: break-word; }
            #country-display { font-size: 18px; font-weight: 500; }
            #map-embed-container { width: 100%; height: 200px; border-radius: 12px; overflow: hidden; margin-top: 16px; }
            #map-embed-container iframe { width: 100%; height: 100%; border: none; }

            .gui-button {
                background: var(--md-sys-color-primary); color: white; border: none; padding: 12px 24px;
                border-radius: 20px; cursor: pointer; font-size: 14px; font-weight: 500;
                transition: all 0.2s; margin-right: 8px; margin-top: 8px;
            }
            .gui-button:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.15); transform: translateY(-2px); }
            .gui-button.secondary { background: var(--md-sys-color-secondary); color: var(--md-sys-color-on-surface); }

            .status-message { font-style: italic; font-size: 13px; margin-top: 12px; }
            .status-message.success { color: #388E3C; }
            .status-message.error { color: #D32F2F; }
            .status-message.loading { color: #1976D2; }

            .history-item { background: var(--md-sys-color-background); border-radius: 12px; padding: 16px; margin-bottom: 12px; }
            .history-item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
            .history-item-time { font-size: 12px; color: #BBB; }
            .history-item-country { font-weight: 500; }
            .history-item-address { font-size: 13px; color: #BBB; margin-bottom: 8px; }
            .history-item-link { color: var(--md-sys-color-primary); text-decoration: none; font-size: 13px; font-weight: 500; }
            .history-item-link:hover { text-decoration: underline; }

            .setting-item { display: flex; justify-content: space-between; align-items: center; padding: 16px 0; border-bottom: 1px solid rgba(0,0,0,0.1); }
            .setting-item:last-child { border-bottom: none; }
            .setting-item label { font-size: 16px; cursor: pointer; color: var(--md-sys-color-on-surface); }
            .setting-item select { padding: 8px 12px; border-radius: 8px; border: 1px solid #ccc; background: white; font-size: 14px; }
            .switch { position: relative; display: inline-block; width: 48px; height: 26px; }
            .switch input { opacity: 0; width: 0; height: 0; }
            .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .4s; border-radius: 26px; }
            .slider:before { position: absolute; content: ""; height: 20px; width: 20px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; }
            input:checked + .slider { background-color: var(--md-sys-color-primary); }
            input:checked + .slider:before { transform: translateX(22px); }

            .gui-footer {
                padding: 12px 20px;
                text-align: center;
                font-size: 11px;
                color: var(--md-sys-color-on-surface);
                background: var(--md-sys-color-background);
                opacity: 0.7;
                border-top: 1px solid rgba(0,0,0,0.05);
            }

            /* Info Tab Styles */
            #infoBanner {
                transition: filter 0.3s ease;
                ${settings.theme !== 'dark' ? 'filter: invert(1);' : ''}
            }
            .info-group {
                background: var(--md-sys-color-background); border-radius: 12px; padding: 16px; margin-bottom: 16px;
            }
            .info-group h4 {
                margin: 0 0 12px 0; font-size: 16px; text-align: center;
            }
            .info-group p {
                margin: 8px 0; font-size: 14px; line-height: 1.5;
            }
            .info-group ul {
                margin: 8px 0; padding-left: 20px;
            }
            .info-group li {
                margin: 4px 0; font-size: 14px;
            }

            /* Material Symbols Styles */
            .material-symbols-outlined {
                font-variation-settings:
                'FILL' 0,
                'wght' 400,
                'GRAD' 0,
                'opsz' 24;
                vertical-align: middle;
                margin-right: 4px;
            }

            /* Make icons black in light themes */
            :root:not([data-theme="dark"]) .material-symbols-outlined {
                color: #000000;
            }

            /* Keep icons white in dark theme */
            :root[data-theme="dark"] .material-symbols-outlined {
                color: #E6E1E5;
            }

            /* Special handling for toggle button icon (always white and centered) */
            #wg-cheat-toggle-btn .material-symbols-outlined {
                color: white !important;
                margin: 0; /* Remove margin to center properly */
            }
        `;
        document.head.appendChild(style);

        // Set theme attribute on root for CSS targeting
        document.documentElement.setAttribute('data-theme', settings.theme);
    }

    // --- GUI CREATION ---
    function createGUI() {
        toggleButton = document.createElement('div'); toggleButton.id = 'wg-cheat-toggle-btn'; toggleButton.innerHTML = '<span class="material-symbols-outlined">location_on</span>'; toggleButton.title = "Toggle WorldGuessr Cheat GUI"; document.body.appendChild(toggleButton);

        guiContainer = document.createElement('div'); guiContainer.id = 'wg-cheat-gui';
        guiContainer.classList.add('hidden'); // start hidden for consistent toggle behavior
        guiContainer.innerHTML = `
            <div class="gui-header"><h3>Lyc4n's WorldGuessr Utils</h3><button class="gui-close-btn" title="Close">&times;</button></div>
            <div class="tab-bar">
                <button class="tab-button active" data-tab="location">Location</button>
                <button class="tab-button" data-tab="history">History</button>
                <button class="tab-button" data-tab="settings">Settings</button>
                <button class="tab-button" data-tab="info">Info</button>
            </div>
            <div class="tab-content active" id="location-tab">
                <div class="info-card"><h4>Country</h4><p id="country-display">N/A</p></div>
                <div class="info-card"><h4>Address</h4><p id="address-display">N/A</p></div>
                <div class="info-card"><h4>Coordinates</h4><p id="coords-display">Lat: N/A, Lng: N/A</p></div>
                <button class="gui-button" id="see-location-btn">See Location</button>
                <button class="gui-button secondary" id="copy-coords-btn">Copy Coords</button>
                <div id="map-embed-container"><iframe id="map-embed" src=""></iframe></div>
                <div id="status-message" class="status-message">Click "See Location" to begin.</div>
            </div>
            <div class="tab-content" id="history-tab">
                <div id="history-content"><p style="color: #888;">No history yet.</p></div>
            </div>
            <div class="tab-content" id="settings-tab">
                <div class="setting-item"><label for="auto-open-gui">Auto-open GUI on new round</label><label class="switch"><input type="checkbox" id="auto-open-gui"><span class="slider"></span></label></div>
                <div class="setting-item"><label for="block-ads">Block Ads</label><label class="switch"><input type="checkbox" id="block-ads"><span class="slider"></span></label></div>
                <div class="setting-item"><label for="theme-select">Theme</label><select id="theme-select"><option value="ocean">Ocean</option><option value="forest">Forest</option><option value="sunset">Sunset</option><option value="dark">Dark</option></select></div>
            </div>
            <div class="tab-content" id="info-tab">
                <div class="info-group">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <img id="infoBanner" src="https://raw.githubusercontent.com/LycanLD/lycanld.github.io/refs/heads/main/dawg-banner.png"
                             alt="WorldGuessr Utils Banner" style="width: 100%; max-width: 300px; height: auto; border-radius: 12px;">
                    </div>
                    <h4 style="text-align: center; margin-bottom: 16px;"><span class="material-symbols-outlined">info</span> About Lyc4n's WorldGuessr Utils</h4>
                    <div style="line-height: 1.6; font-size: 14px;">
                        <p><strong>Version:</strong> 4.1.2</p>
                        <p><strong>Author:</strong> LycanLD (Lycan Đỗ)</p>
                        <p><strong>Description:</strong> A modern, updated and undetected WorldGuessr cheat ^w^!</p>
                        <p><strong>Features:</strong></p>
                        <ul style="margin: 8px 0; padding-left: 20px;">
                            <li><span class="material-symbols-outlined">location_on</span> Accurate location detection</li>
                            <li><span class="material-symbols-outlined">map</span> Built-in map view</li>
                            <li><span class="material-symbols-outlined">history</span> Session history</li>
                            <li><span class="material-symbols-outlined">palette</span> Colour themes</li>
                            <li><span class="material-symbols-outlined">settings</span> Utility settings</li>
                            <li><span class="material-symbols-outlined">block</span> Ad blocking</li>
                        </ul>
                        <p><strong>Usage Tips:</strong></p>
                        <ul style="margin: 8px 0; padding-left: 20px;">
                            <li>Click "See Location" to see your current location</li>
                            <li>Use the History tab to review previous locations</li>
                            <li>Customize the appearance in Settings tab</li>
                        </ul>
                    </div>
                </div>
            </div>
            <div class="gui-footer">Made by LycanLD | v4.1.2 | Made in Vietnam</div>
        `;
        document.body.appendChild(guiContainer);

        // Event Listeners
        toggleButton.addEventListener('click', toggleGUI);
        guiContainer.querySelector('.gui-close-btn').addEventListener('click', toggleGUI);
        guiContainer.querySelector('#see-location-btn').addEventListener('click', () => updateLocationInGUI(false));
        guiContainer.querySelector('#copy-coords-btn').addEventListener('click', copyCoordinatesToClipboard);

        // Tab switching
        guiContainer.querySelectorAll('.tab-button').forEach(button => {
            button.addEventListener('click', () => {
                const tabName = button.dataset.tab;
                guiContainer.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
                guiContainer.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                button.classList.add('active');
                const content = guiContainer.querySelector(`#${tabName}-tab`);
                if (content) content.classList.add('active');
            });
        });

        // Settings
        const autoOpenCheckbox = guiContainer.querySelector('#auto-open-gui');
        const blockAdsCheckbox = guiContainer.querySelector('#block-ads');
        const themeSelect = guiContainer.querySelector('#theme-select');

        if (autoOpenCheckbox) autoOpenCheckbox.checked = settings.autoOpenGUI;
        if (blockAdsCheckbox) blockAdsCheckbox.checked = settings.blockAds;
        if (themeSelect) themeSelect.value = settings.theme;

        if (autoOpenCheckbox) autoOpenCheckbox.addEventListener('change', (e) => { settings.autoOpenGUI = e.target.checked; saveSettings(); });
        if (blockAdsCheckbox) blockAdsCheckbox.addEventListener('change', (e) => { settings.blockAds = e.target.checked; saveSettings(); if(settings.blockAds) blockAdsIfEnabled(); });
        if (themeSelect) themeSelect.addEventListener('change', (e) => {
            settings.theme = e.target.value;
            saveSettings();
            currentTheme = THEMES[settings.theme];
            document.documentElement.setAttribute('data-theme', settings.theme);
            applyStyles();
        });

        // Dragging - Improved for no delay
        const dragHeader = guiContainer.querySelector('.gui-header');
        if (dragHeader) {
            dragHeader.addEventListener('mousedown', dragStart);
            document.addEventListener('mousemove', drag);
            document.addEventListener('mouseup', dragEnd);
        }
    }

    // --- Toggle GUI (fixed logic) ---
    function toggleGUI() {
        if (!guiContainer) return;
        if (guiContainer.classList.contains('visible')) {
            guiContainer.classList.remove('visible');
            setTimeout(() => guiContainer.classList.add('hidden'), 400);
        } else {
            guiContainer.classList.remove('hidden');
            setTimeout(() => guiContainer.classList.add('visible'), 10);
        }
    }

    function copyCoordinatesToClipboard() {
        const loc = extractLocationFromIframe();
        if (loc) {
            const text = `${loc.lat.toFixed(6)}, ${loc.long.toFixed(6)}`;
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(() => showStatus("Coordinates copied!", "success"))
                .catch(err => { console.error('Failed to copy: ', err); showStatus("Failed to copy.", "error"); });
            } else {
                try { document.execCommand('copy'); showStatus("Coordinates copied!", "success"); }
                catch (err) { showStatus("Failed to copy.", "error"); }
            }
        } else { showStatus("No location to copy.", "error"); }
    }

    // Dragging logic
    function dragStart(e) {
        if (e.target.closest('.gui-header')) {
            isDragging = true;
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
            guiContainer.style.transition = 'none'; // Disable transition during drag
        }
    }

    function drag(e) {
        if (isDragging) {
            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
            xOffset = currentX;
            yOffset = currentY;
            guiContainer.style.transform = `translate(${currentX}px, ${currentY}px)`;
        }
    }

    function dragEnd() {
        if (isDragging) {
            isDragging = false;
            guiContainer.style.transition = ''; // Re-enable transition after drag
        }
    }

    // --- AUTO-REFRESH OBSERVER ---
    function setupLocationObserver() {
        const gameIframe = document.querySelector('iframe[src*="svEmbed"]');
        if (!gameIframe) return;

        // Store the initial src
        lastLocationSrc = gameIframe.src;

        if (locationObserver) locationObserver.disconnect();
        locationObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
                    // Check if the src has actually changed (new round)
                    if (gameIframe.src !== lastLocationSrc) {
                        lastLocationSrc = gameIframe.src;
                        updateLocationInGUI(true);
                    }
                }
            }
        });
        locationObserver.observe(gameIframe, { attributes: true, attributeFilter: ['src'] });
    }

    function waitForIframeAndSetupObserver() {
        const gameIframe = document.querySelector('iframe[src*="svEmbed"]');
        if (gameIframe) {
            setupLocationObserver();
            if (window.location.pathname.startsWith('/game/')) updateLocationInGUI();
        }
        else {
            const bodyObserver = new MutationObserver((mutations, obs) => {
                if (document.querySelector('iframe[src*="svEmbed"]')) {
                    setupLocationObserver();
                    obs.disconnect();
                }
            });
            bodyObserver.observe(document.body, { childList: true, subtree: true });
        }
    }

    function blockAdsIfEnabled() {
        if (!settings.blockAds) return;
        const adSelectors = ['[id^="google_ads_iframe"]', '[id^="worldguessr-com_"]', '.video-ad'];
        const removeAds = () => adSelectors.forEach(s => document.querySelectorAll(s).forEach(a => a.remove()));
        removeAds();
        new MutationObserver(removeAds).observe(document.body, { childList: true, subtree: true });
    }

    // --- INITIALIZATION ---
    function initialize() {
        loadSettings();
        document.documentElement.setAttribute('data-theme', settings.theme);
        applyStyles();
        createGUI();
        blockAdsIfEnabled();
        waitForIframeAndSetupObserver();
        console.log("Lyc4n's WorldGuessrCheatGUI Loaded (v4.1.2)");
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize);
    else initialize();

})();

