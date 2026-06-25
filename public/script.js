
// ===============================================================
// MOBIL: EKRAN ZOOM VA GESTURE BLOKLASH
// ===============================================================
document.addEventListener('gesturestart',  e => e.preventDefault());
document.addEventListener('gesturechange', e => e.preventDefault());
document.addEventListener('gestureend',    e => e.preventDefault());

let lastTouchEnd = 0;
document.addEventListener('touchend', e => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
}, { passive: false });

document.addEventListener('touchmove', e => {
    if (e.touches.length > 1) e.preventDefault();
}, { passive: false });

document.addEventListener('focusin', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        e.target.style.fontSize = '16px';
    }
});

// ===============================================================
// MAFIA O'YINI — FRONTEND SCRIPT
// ===============================================================

// ===============================================================
// XAVFSIZLIK: XSS dan himoya — foydalanuvchi ma'lumotlarini
// innerHTML ga qo'yishdan oldin har doim esc() orqali o'tkazin
// ===============================================================

// ===============================================================
// DEBOUNCE — socket eventlari tez-tez kelganda flood oldini olish
// ===============================================================
function debounce(fn, delay) {
    let timer;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}
const debouncedGameLoop = debounce(() => gameLoop(), 300);

function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

// ===============================================================
// CUSTOM MODAL — alert() va confirm() o'rniga
// ===============================================================
(function injectModalStyles() {
    const style = document.createElement('style');
    style.textContent = `
        #cmodal-overlay{
            position:fixed;inset:0;background:rgba(0,0,0,0.7);
            display:flex;align-items:center;justify-content:center;
            z-index:99999;backdrop-filter:blur(4px);
        }
        .cmodal-box{
            background:#131c2e;
            border:1px solid #2d3f5e;
            border-radius:18px;
            padding:30px 26px 22px;
            max-width:300px;width:88%;
            text-align:center;
            box-shadow:0 10px 50px rgba(0,0,0,0.7);
            animation:cmodal-pop .18s cubic-bezier(.34,1.56,.64,1);
        }
        @keyframes cmodal-pop{
            from{transform:scale(.82);opacity:0}
            to{transform:scale(1);opacity:1}
        }
        .cmodal-msg{
            color:#e2e8f0;font-size:1.02rem;
            line-height:1.6;margin-bottom:24px;
            font-weight:500;
        }
        .cmodal-btns{display:flex;gap:12px;justify-content:center;}
        .cmodal-btn{
            padding:11px 0;width:110px;
            border-radius:11px;border:none;
            font-size:0.97rem;font-weight:700;
            cursor:pointer;transition:transform .1s, filter .15s;
            letter-spacing:.3px;
        }
        .cmodal-btn:active{transform:scale(.95);}
        .cmodal-ok{background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;box-shadow:0 4px 14px rgba(34,197,94,.35);}
        .cmodal-ok:hover{filter:brightness(1.1);}
        .cmodal-cancel{background:linear-gradient(135deg,#ef4444,#b91c1c);color:#fff;box-shadow:0 4px 14px rgba(239,68,68,.35);}
        .cmodal-cancel:hover{filter:brightness(1.1);}
    `;
    document.head.appendChild(style);
})();

function showAlert(msg, onOk) {
    _removeModal();
    const overlay = document.createElement('div');
    overlay.id = 'cmodal-overlay';
    const box = document.createElement('div');
    box.className = 'cmodal-box';
    box.innerHTML = `
        <div class="cmodal-msg">${msg}</div>
        <div class="cmodal-btns">
            <button class="cmodal-btn cmodal-ok" id="cmodal-ok">OK</button>
        </div>`;
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    document.getElementById('cmodal-ok').onclick = () => { _removeModal(); if (onOk) onOk(); };
}

function showConfirm(msg, onOk, onCancel) {
    _removeModal();
    const overlay = document.createElement('div');
    overlay.id = 'cmodal-overlay';
    const box = document.createElement('div');
    box.className = 'cmodal-box';
    box.innerHTML = `
        <div class="cmodal-msg">${msg}</div>
        <div class="cmodal-btns">
            <button class="cmodal-btn cmodal-cancel" id="cmodal-cancel">Bekor</button>
            <button class="cmodal-btn cmodal-ok" id="cmodal-ok">OK</button>
        </div>`;
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    document.getElementById('cmodal-ok').onclick     = () => { _removeModal(); if (onOk) onOk(); };
    document.getElementById('cmodal-cancel').onclick = () => { _removeModal(); if (onCancel) onCancel(); };
}

function _removeModal() {
    const old = document.getElementById('cmodal-overlay');
    if (old) old.remove();
}

const socket = io();

let myUsername    = '';
let myLobbyCode   = '';
let adminUsername = '';
let gamePhase     = 'waiting';
let timeLeft      = 0;
let isSwitchingPhase = false;
let gameLoopInterval = null;
let isProcessing     = false;

let hasKilled = false;
let hasHealed = false;
let gameOverShown = false;

// ===== SKIN TIZIMI =====
var SKIN_DATA = {
    fire_boss: {
        icon:     '🔥',
        gradient: 'linear-gradient(90deg,#f97316,#ef4444)',
        iconBg:   'linear-gradient(135deg,#dc2626,#f97316)',
        border:   '#f97316',
        rarity:   'Rare',
        glow:     'rgba(249,115,22,0.35)',
    },
    //     water: {
    //     icon:     '💧',
    //     gradient: 'linear-gradient(90deg,#38bdf8,#0ea5e9,#0284c7)',
    //     iconBg:   'linear-gradient(135deg,#0c4a6e,#0ea5e9)',
    //     border:   '#0ea5e9',
    //     rarity:   'Epic',
    //     glow:     'rgba(14,165,233,0.35)',
    // },
     ninja: {
        icon:     '🥷',
        gradient: 'linear-gradient(90deg,#6366f1,#8b5cf6)',
        iconBg:   'linear-gradient(135deg,#1e1b4b,#6366f1)',
        border:   '#6366f1',
        rarity:   'Epic',
        glow:     'rgba(99,102,241,0.35)',
    },
    king: {
        icon:     '👑',
        gradient: 'linear-gradient(90deg,#f59e0b,#fbbf24,#f59e0b)',
        iconBg:   'linear-gradient(135deg,#92400e,#f59e0b)',
        border:   '#f59e0b',
        rarity:   'Legendary',
        glow:     'rgba(245,158,11,0.35)',
    },
    ghost: {
        icon:     '👻',
        gradient: 'linear-gradient(90deg,#a855f7,#ec4899)',
        iconBg:   'linear-gradient(135deg,#4c1d95,#a855f7)',
        border:   '#a855f7',
        rarity:   'Epic',
        glow:     'rgba(168,85,247,0.35)',
    },
    dragon: {
        icon:     '🐉',
        gradient: 'linear-gradient(90deg,#22d3ee,#10b981,#22d3ee)',
        iconBg:   'linear-gradient(135deg,#064e3b,#10b981)',
        border:   '#10b981',
        rarity:   'Mythic',
        glow:     'rgba(16,185,129,0.35)',
    },
    lightning_storm: {
        icon:     '⚡',
        gradient: 'linear-gradient(90deg, #00d2ff, #0066ff)',
        iconBg:   'linear-gradient(135deg, #0f172a, #1d4ed8)',
        border:   '#00d2ff',
        rarity:   'Mythic',
        glow:     'rgba(0, 210, 255, 0.6)', // Moviy chiroq kuchliroq yonib turishi uchun 0.6 qildim
},
    cosmic_nebula: {
        icon:     '🌌',
        gradient: 'linear-gradient(90deg, #d946ef, #8b5cf6)',
        iconBg:   'linear-gradient(135deg, #6d28d9, #ec4899)',
        border:   '#d946ef',
        rarity:   'Legendary',
        glow:     'rgba(217, 70, 239, 0.4)',
    },
    rose_garden: {
        icon:     '🌹',
        gradient: 'linear-gradient(90deg,#f43f5e,#fb7185,#e11d48)',
        iconBg:   'linear-gradient(135deg,#881337,#f43f5e)',
        border:   '#f43f5e',
        rarity:   'Rare',
        glow:     'rgba(244,63,94,0.45)',
    },
};
// username → skin_id cache (o'yin davomida)
const playerSkinCache = {};

// O'yinchi ismini skin bilan render qilish
function renderPlayerName(username, activeSkinId) {
    const skinId = activeSkinId || playerSkinCache[username];
    if (!skinId || !SKIN_DATA[skinId]) {
        return `<span style="font-weight:600;">${esc(username)}</span>`;
    }

    // ---- Yordamchi: umumiy animatsiyali skin wrapper ----
    function skinWrap({ iconBg, iconAnim, iconShadow, icon, ringStyle1, ringStyle2, orbits, textStyle, textClass, nameHtml }) {
        return `<span class="skin-name-wrap">
            <span class="skin-icon-container">
                <span class="skin-ring" style="${ringStyle1}"></span>
                ${ringStyle2 ? `<span class="skin-ring" style="${ringStyle2}"></span>` : ''}
                <span class="skin-icon-inner" style="background:${iconBg}; box-shadow:${iconShadow}; animation:${iconAnim};">${icon}</span>
                <span class="skin-orbits">${orbits}</span>
            </span>
            <span class="${textClass}" style="${textStyle}">${nameHtml}</span>
        </span>`;
    }

    const u = esc(username);

    // ---- FIRE BOSS 🔥 ----
    if (skinId === 'fire_boss') {
        return skinWrap({
            iconBg: 'linear-gradient(135deg,#dc2626,#f97316)',
            iconShadow: '0 0 10px rgba(249,115,22,0.7), 0 0 20px rgba(239,68,68,0.5)',
            iconAnim: 'fire-icon-flicker 1.8s ease-in-out infinite',
            icon: '🔥',
            ringStyle1: 'inset:-4px; border-top-color:#f97316; border-right-color:#ef4444; animation:fire-ring-spin 1.6s linear infinite;',
            ringStyle2: 'inset:-7px; border-bottom-color:#fbbf24; border-left-color:#f97316; animation:fire-ring-spin 2.4s linear infinite reverse; opacity:0.5;',
            orbits: `
                <span class="skin-spark fire-spark" style="animation:fire-orbit  1.8s linear infinite;"></span>
                <span class="skin-spark fire-spark" style="animation:fire-orbit2 1.8s linear infinite; background:#fbbf24; box-shadow:0 0 6px #fbbf24;"></span>
                <span class="skin-spark fire-spark" style="animation:fire-orbit3 1.8s linear infinite; background:#ef4444;"></span>`,
            textClass: '',
            textStyle: 'font-weight:800; background:linear-gradient(90deg,#f97316,#ef4444,#fbbf24,#f97316); background-size:200% auto; -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; animation:fire-text-pulse 2s ease-in-out infinite;',
            nameHtml: u,
        });
    }

    // ---- NINJA 🥷 ----
    if (skinId === 'ninja') {
        return skinWrap({
            iconBg: 'linear-gradient(135deg,#1e1b4b,#6366f1)',
            iconShadow: '0 0 8px rgba(99,102,241,0.6), 0 0 18px rgba(139,92,246,0.4)',
            iconAnim: 'ninja-icon-pulse 2s ease-in-out infinite',
            icon: '🥷',
            ringStyle1: 'inset:-4px; border-top-color:#8b5cf6; border-right-color:#6366f1; animation:ninja-ring-spin 1.8s linear infinite;',
            ringStyle2: 'inset:-7px; border-bottom-color:#a78bfa; border-left-color:#8b5cf6; animation:ninja-ring-spin 2.6s linear infinite; opacity:0.55;',
            orbits: `
                <span class="skin-spark ninja-spark" style="animation:ninja-orbit  2.2s linear infinite;"></span>
                <span class="skin-spark ninja-spark" style="animation:ninja-orbit2 2.2s linear infinite; background:#a78bfa; box-shadow:0 0 5px #a78bfa;"></span>`,
            textClass: '',
            textStyle: 'font-weight:800; background:linear-gradient(90deg,#6366f1,#8b5cf6,#a78bfa,#6366f1); background-size:200% auto; -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; animation:ninja-text-pulse 2.2s ease-in-out infinite;',
            nameHtml: u,
        });
    }

    // ---- GHOST 👻 ----
    if (skinId === 'ghost') {
        return skinWrap({
            iconBg: 'linear-gradient(135deg,#4c1d95,#a855f7)',
            iconShadow: '0 0 10px rgba(168,85,247,0.6), 0 0 22px rgba(236,72,153,0.4)',
            iconAnim: 'ghost-icon-float 2.4s ease-in-out infinite',
            icon: '👻',
            ringStyle1: 'inset:-4px; border-top-color:#a855f7; border-right-color:#ec4899; animation:ghost-ring-float 3s ease-in-out infinite;',
            ringStyle2: 'inset:-7px; border-bottom-color:#c084fc; border-left-color:#a855f7; animation:ghost-ring-float 4s ease-in-out infinite reverse; opacity:0.5;',
            orbits: `
                <span class="skin-spark ghost-spark" style="animation:ghost-orbit  3s ease-in-out infinite;"></span>
                <span class="skin-spark ghost-spark" style="animation:ghost-orbit2 3s ease-in-out infinite; background:rgba(236,72,153,0.6); box-shadow:0 0 8px #ec4899;"></span>`,
            textClass: '',
            textStyle: 'font-weight:800; background:linear-gradient(90deg,#a855f7,#ec4899,#c084fc,#a855f7); background-size:200% auto; -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; animation:ghost-text-float 2.4s ease-in-out infinite;',
            nameHtml: u,
        });
    }

    // ---- KING 👑 ----
    if (skinId === 'king') {
        return skinWrap({
            iconBg: 'linear-gradient(135deg,#92400e,#f59e0b)',
            iconShadow: '0 0 10px rgba(245,158,11,0.7), 0 0 24px rgba(251,191,36,0.5)',
            iconAnim: 'king-icon-crown 2s ease-in-out infinite',
            icon: '👑',
            ringStyle1: 'inset:-4px; border-top-color:#f59e0b; border-right-color:#fbbf24; animation:king-ring-spin 1.6s linear infinite;',
            ringStyle2: 'inset:-7px; border-bottom-color:#fcd34d; border-left-color:#f59e0b; animation:king-ring-spin 2.2s linear infinite reverse; opacity:0.55;',
            orbits: `
                <span class="skin-spark king-spark" style="animation:king-orbit  2s linear infinite;"></span>
                <span class="skin-spark king-spark" style="animation:king-orbit2 2s linear infinite; background:#fcd34d; box-shadow:0 0 5px #fcd34d;"></span>
                <span class="skin-spark king-spark" style="animation:king-orbit3 2s linear infinite;"></span>
                <span class="skin-spark king-spark" style="animation:king-orbit4 2s linear infinite; background:#f59e0b;"></span>`,
            textClass: '',
            textStyle: 'font-weight:800; background:linear-gradient(90deg,#f59e0b,#fbbf24,#fcd34d,#f59e0b); background-size:200% auto; -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; animation:king-text-shine 2s ease-in-out infinite;',
            nameHtml: u,
        });
    }

    // ---- COSMIC NEBULA 🌌 ----
    if (skinId === 'cosmic_nebula') {
        return skinWrap({
            iconBg: 'linear-gradient(135deg,#6d28d9,#ec4899)',
            iconShadow: '0 0 10px rgba(217,70,239,0.6), 0 0 22px rgba(139,92,246,0.5)',
            iconAnim: 'cosmic-icon-rotate 4s linear infinite',
            icon: '🌌',
            ringStyle1: 'inset:-4px; border-top-color:#d946ef; border-right-color:#8b5cf6; animation:cosmic-ring-spin 1.8s linear infinite;',
            ringStyle2: 'inset:-7px; border-bottom-color:#a855f7; border-left-color:#d946ef; animation:cosmic-ring-spin 2.8s linear infinite reverse; opacity:0.5;',
            orbits: `
                <span class="skin-spark cosmic-spark" style="animation:cosmic-orbit  2.8s linear infinite;"></span>
                <span class="skin-spark cosmic-spark" style="animation:cosmic-orbit2 2.8s linear infinite; background:#c084fc;"></span>
                <span class="skin-spark cosmic-spark" style="animation:cosmic-orbit3 2.8s linear infinite; background:#f0abfc;"></span>
                <span class="skin-spark cosmic-spark" style="animation:cosmic-orbit4 2.8s linear infinite;"></span>
                <span class="skin-spark cosmic-spark" style="animation:cosmic-orbit5 2.8s linear infinite; background:#e879f9;"></span>`,
            textClass: '',
            textStyle: 'font-weight:800; background:linear-gradient(90deg,#d946ef,#8b5cf6,#e879f9,#d946ef); background-size:200% auto; -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; animation:cosmic-text-pulse 2.4s ease-in-out infinite;',
            nameHtml: u,
        });
    }

    // ---- DRAGON 🐉 ----
    if (skinId === 'dragon') {
        return skinWrap({
            iconBg: 'linear-gradient(135deg,#064e3b,#10b981)',
            iconShadow: '0 0 10px rgba(34,211,238,0.6), 0 0 22px rgba(16,185,129,0.5)',
            iconAnim: 'dragon-icon-roar 2.2s ease-in-out infinite',
            icon: '🐉',
            ringStyle1: 'inset:-4px; border-top-color:#22d3ee; border-right-color:#10b981; animation:dragon-ring-breathe 2s ease-in-out infinite;',
            ringStyle2: 'inset:-7px; border-bottom-color:#34d399; border-left-color:#22d3ee; animation:dragon-ring-breathe 3s ease-in-out infinite reverse; opacity:0.5;',
            orbits: `
                <span class="skin-spark dragon-spark" style="animation:dragon-orbit  2s linear infinite;"></span>
                <span class="skin-spark dragon-spark" style="animation:dragon-orbit2 2s linear infinite; background:#34d399; box-shadow:0 0 6px #34d399;"></span>
                <span class="skin-spark dragon-spark" style="animation:dragon-orbit3 2s linear infinite; background:#6ee7b7; box-shadow:0 0 6px #6ee7b7;"></span>`,
            textClass: '',
            textStyle: 'font-weight:800; background:linear-gradient(90deg,#22d3ee,#10b981,#6ee7b7,#22d3ee); background-size:200% auto; -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; animation:dragon-text-breathe 2.2s ease-in-out infinite;',
            nameHtml: u,
        });
    }

    // ---- LIGHTNING STORM ⚡ ----
    if (skinId === 'lightning_storm') {
        return `<span class="lightning-name-wrap">
            <span class="lightning-icon-container">
                <span class="lightning-ring"></span>
                <span class="lightning-ring ring2"></span>
                <span class="lightning-icon-inner">⚡</span>
                <span class="lightning-orbits">
                    <span class="lightning-spark" style="animation:lightning-orbit 2.1s linear infinite;"></span>
                    <span class="lightning-spark" style="animation:lightning-orbit2 2.1s linear infinite;"></span>
                    <span class="lightning-spark" style="animation:lightning-orbit3 2.1s linear infinite;"></span>
                </span>
            </span>
            <span class="lightning-text">${u}</span>
        </span>`;
    }

    // ---- ROSE GARDEN 🌹 ----
    if (skinId === 'rose_garden') {
        return skinWrap({
            iconBg: 'linear-gradient(135deg,#881337,#f43f5e)',
            iconShadow: '0 0 10px rgba(244,63,94,0.7), 0 0 22px rgba(225,29,72,0.5)',
            iconAnim: 'rose-icon-bloom 2s ease-in-out infinite',
            icon: '🌹',
            ringStyle1: 'inset:-4px; border-top-color:#f43f5e; border-right-color:#e11d48; animation:rose-ring-spin 1.8s linear infinite;',
            ringStyle2: 'inset:-7px; border-bottom-color:#fb7185; border-left-color:#f43f5e; animation:rose-ring-spin 2.6s linear infinite reverse; opacity:0.55;',
            orbits: `
                <span class="skin-spark rose-spark" style="animation:rose-orbit  2.2s linear infinite;"></span>
                <span class="skin-spark rose-spark" style="animation:rose-orbit2 2.2s linear infinite; background:#fb7185; box-shadow:0 0 6px #fb7185;"></span>
                <span class="skin-spark rose-spark" style="animation:rose-orbit3 2.2s linear infinite; background:#e11d48;"></span>`,
            textClass: '',
            textStyle: 'font-weight:800; background:linear-gradient(90deg,#f43f5e,#fb7185,#e11d48,#f43f5e); background-size:200% auto; -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; animation:rose-text-pulse 2s ease-in-out infinite;',
            nameHtml: u,
        });
    }

    // ---- Fallback: oddiy render ----
    const s = SKIN_DATA[skinId];
    return `<span style="display:inline-flex;align-items:center;gap:6px;">
        <span style="background:${s.iconBg};border-radius:7px;width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;font-size:0.9rem;flex-shrink:0;box-shadow:0 0 6px ${s.glow};">${s.icon}</span>
        <span style="background:${s.gradient};-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;font-weight:800;">${u}</span>
    </span>`;
}

// O'yinchi skinini serverdan olish (cache bilan)
async function fetchPlayerSkin(username) {
    if (playerSkinCache[username] !== undefined) return playerSkinCache[username];
    try {
        const url = myLobbyCode
            ? `/api/skin/${encodeURIComponent(username)}?lobby=${encodeURIComponent(myLobbyCode)}`
            : `/api/skin/${encodeURIComponent(username)}`;
        const res  = await fetch(url);
        const data = await res.json();
        playerSkinCache[username] = data.active_skin || null;
        return playerSkinCache[username];
    } catch {
        playerSkinCache[username] = null;
        return null;
    }
}

// Bir nechta o'yinchining skinini bitta batch da olish
async function fetchAllPlayerSkins(players) {
    const unknown = players
        .map(p => p.username)
        .filter(u => playerSkinCache[u] === undefined);
    await Promise.all(unknown.map(u => fetchPlayerSkin(u)));
}

// ===== MUSIQA TIZIMI =====
//
// MANTIQ:
//   night_preparing → Tun.mp3 loop boshlanadi, tong otguncha to'xtamaydi
//   night_mafia     → Tun.mp3 DAVOM ETADI + Mafia.mp3 bir marta ustiga o'ynaydi
//   night_doctor    → Tun.mp3 DAVOM ETADI + Doktir.mp3 bir marta ustiga o'ynaydi
//   discussion      → Tun.mp3 to'xtaydi + Tong.mp3 bir marta o'ynaydi
//   voting / results → jim

let lastMusicPhase    = '';
let userAudioUnlocked = false;
let pendingPhase      = null;

// Tun loopi uchun alohida Audio element (tong otguncha tirik)
let nightAudio = null;
// Ustma-ust qo'shiladigan qisqa signal uchun alohida Audio element
let layerAudio = null;

// ---------------------------------------------------------------
// Unlock — foydalanuvchi birinchi marta bosganida
// ---------------------------------------------------------------
function unlockAudio() {
    if (userAudioUnlocked) return;
    userAudioUnlocked = true;
    if (pendingPhase) {
        const p = pendingPhase;
        pendingPhase = null;
        _startSound(p);
    }
}
document.addEventListener('touchstart', unlockAudio, { passive: true });
document.addEventListener('click',      unlockAudio);

// ---------------------------------------------------------------
// Yordamchi: Audio element yaratib o'ynatish
// loop=true bo'lsa loopda, bo'lmasa bir marta
// ---------------------------------------------------------------
function createAudio(src, loop, volume) {
    const a = new Audio(src);
    a.loop   = loop;
    a.volume = volume;
    a.setAttribute('playsinline', '');
    a.setAttribute('webkit-playsinline', '');
    return a;
}

// ---------------------------------------------------------------
// Tun ovozini (loop) to'xtatish
// ---------------------------------------------------------------
function stopNightAudio() {
    if (nightAudio) {
        nightAudio.pause();
        nightAudio.currentTime = 0;
        nightAudio = null;
    }
}

// ---------------------------------------------------------------
// Ustma-ust signal ovozini to'xtatish
// ---------------------------------------------------------------
function stopLayerAudio() {
    if (layerAudio) {
        layerAudio.pause();
        layerAudio.currentTime = 0;
        layerAudio = null;
    }
}

// ---------------------------------------------------------------
// Hamma ovozni to'xtatish (tashqi chaqiruv uchun)
// ---------------------------------------------------------------
function stopMusic() {
    stopNightAudio();
    stopLayerAudio();
    pendingPhase = null;
}

// ---------------------------------------------------------------
// Asosiy faza mantiq
// ---------------------------------------------------------------
function _startSound(phase) {
    switch (phase) {

        case 'night_preparing':
            // Tun.mp3 ni loop rejimida boshlash
            stopNightAudio();
            stopLayerAudio();
            nightAudio = createAudio('/music/Tun.mp3', true, 0.5);
            nightAudio.play().catch(() => {});
            break;

        case 'night_mafia':
            // Tun davom etadi — faqat ustiga Mafia.mp3 bir marta
            stopLayerAudio();
            layerAudio = createAudio('/music/Mafia.mp3', false, 0.7);
            layerAudio.play().catch(() => {});
            // Tugagach layerAudio tozalanadi
            layerAudio.addEventListener('ended', () => { layerAudio = null; }, { once: true });
            break;

        case 'night_doctor':
            // Tun davom etadi — faqat ustiga Doktir.mp3 bir marta
            stopLayerAudio();
            layerAudio = createAudio('/music/Doktir.mp3', false, 0.7);
            layerAudio.play().catch(() => {});
            layerAudio.addEventListener('ended', () => { layerAudio = null; }, { once: true });
            break;

        case 'discussion':
            // Tun o'chadi, Tong.mp3 bir marta o'ynaydi
            stopNightAudio();
            stopLayerAudio();
            const tongAudio = createAudio('/music/Tong.mp3', false, 0.6);
            tongAudio.play().catch(() => {});
            break;

        case 'voting':
        case 'vote_results':
        default:
            // Jim — hech narsa o'zgartirmaymiz
            // (Tun loopi hali davom etishi mumkin, to'xtatmaymiz)
            break;
    }
}

// ---------------------------------------------------------------
// Asosiy kirish nuqtasi
// ---------------------------------------------------------------
function updateMusic(phase) {
    if (phase === lastMusicPhase) return;
    lastMusicPhase = phase;
    if (!userAudioUnlocked) {
        pendingPhase = phase;
        return;
    }
    _startSound(phase);
}

// ===============================================================
// TO'LIQ EKRAN
// ===============================================================
window.toggleFullscreen = function () {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
    } else {
        document.exitFullscreen().catch(() => {});
    }
};

// ===============================================================
// 1-QADAM: ISM + LOBBI TANLASH
// ===============================================================
window.goToCreate = function () {
    const name = document.getElementById('username-input').value.trim();
    if (!name) { showAlert('Avval ismingizni kiriting!'); return; }
    if (name.length < 2) { showAlert("Ism kamida 2 ta harf bo'lishi kerak!"); return; }
    myUsername = name;
    document.getElementById('name-step').style.display    = 'none';
    document.getElementById('join-step').style.display    = 'none';
    document.getElementById('rejoin-step').style.display  = 'none';
    document.getElementById('create-step').style.display  = 'block';
};

window.backToNameFromCreate = function () {
    isProcessing = false;
    document.getElementById('create-step').style.display = 'none';
    document.getElementById('name-step').style.display   = 'block';
};

window.createLobbyNow = async function () {
    if (isProcessing) return;
    isProcessing = true;
    try {
        await createLobbyAction();
    } finally {
        isProcessing = false;
    }
};

window.goToRejoin = function () {
    const name = document.getElementById('username-input').value.trim();
    if (!name) { showAlert('Avval ismingizni kiriting!'); return; }
    if (name.length < 2) { showAlert("Ism kamida 2 ta harf bo'lishi kerak!"); return; }
    myUsername = name;
    document.getElementById('name-step').style.display    = 'none';
    document.getElementById('join-step').style.display    = 'none';
    document.getElementById('create-step').style.display  = 'none';
    document.getElementById('rejoin-step').style.display  = 'block';
    document.getElementById('rejoin-code-input').value    = '';
    document.getElementById('rejoin-code-input').focus();
};

window.goToJoin = function () {
    const name = document.getElementById('username-input').value.trim();
    if (!name) { showAlert('Avval ismingizni kiriting!'); return; }
    if (name.length < 2) { showAlert("Ism kamida 2 ta harf bo'lishi kerak!"); return; }
    myUsername = name;
    document.getElementById('name-step').style.display   = 'none';
    document.getElementById('create-step').style.display = 'none';
    document.getElementById('rejoin-step').style.display = 'none';
    document.getElementById('join-step').style.display   = 'block';
    document.getElementById('lobby-code-input').value    = '';
    document.getElementById('lobby-code-input').focus();
};

window.backToName = function () {
    isProcessing = false; // qolgan flagni tozalaymiz
    document.getElementById('join-step').style.display          = 'none';
    document.getElementById('rejoin-step').style.display        = 'none';
    document.getElementById('create-step').style.display        = 'none';
    document.getElementById('online-step').style.display        = 'none';
    document.getElementById('online-create-step').style.display = 'none';
    document.getElementById('online-join-step').style.display   = 'none';
    document.getElementById('name-step').style.display          = 'block';

    const infoBtn = document.querySelector('.btn-info-open');
    if (infoBtn) infoBtn.style.display = 'block';
};

// ===============================================================
// ONLINE LOBBI — asosiy ko'rinish
// ===============================================================
let selectedRange   = '5-9';
let selectedPrivate = false;
let joinIsPrivate   = false;

function hideAllSteps() {
    ['name-step','join-step','create-step','rejoin-step',
     'online-step','online-create-step','online-join-step'
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
}

window.goToOnline = function () {
    const name = document.getElementById('username-input').value.trim();
    if (!name) { showAlert('Avval ismingizni kiriting!'); return; }
    if (name.length < 2) { showAlert("Ism kamida 3 ta harf bo'lishi kerak!"); return; }
    myUsername = name;
    hideAllSteps();
    document.getElementById('online-step').style.display = 'block';
    loadPublicLobbies();
};

window.backToOnline = function () {
    hideAllSteps();
    document.getElementById('online-step').style.display = 'block';
    loadPublicLobbies();
};

window.goToOnlineCreate = function () {
    hideAllSteps();
    // Reset tanlangan qiymatlar
    selectedRange   = '5-9';
    selectedPrivate = false;
    document.querySelectorAll('.online-range-btn').forEach(b => b.classList.remove('active'));
    const r59 = document.querySelector('[data-range="5-9"]');
    if (r59) r59.classList.add('active');
    document.querySelectorAll('.online-type-btn').forEach(b => b.classList.remove('active'));
    const openBtn = document.querySelector('[data-private="false"]');
    if (openBtn) openBtn.classList.add('active');
    document.getElementById('online-password-block').style.display = 'none';
    document.getElementById('online-create-step').style.display = 'block';
};

window.goToOnlineJoin = function () {
    hideAllSteps();
    document.getElementById('online-join-step').style.display = 'block';
    const codeInp = document.getElementById('online-join-code');
    if (codeInp) codeInp.value = '';
    const passInp = document.getElementById('online-join-password');
    if (passInp) { passInp.value = ''; passInp.type = 'password'; }
    const cb = document.getElementById('join-has-password');
    if (cb) cb.checked = false;
    const passBlock = document.getElementById('online-join-password-block');
    if (passBlock) passBlock.style.display = 'none';
    joinIsPrivate = false;
};

window.selectRange = function (btn, range) {
    selectedRange = range;
    document.querySelectorAll('.online-range-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
};

window.selectType = function (btn, isPriv) {
    selectedPrivate = isPriv;
    document.querySelectorAll('.online-type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const block = document.getElementById('online-password-block');
    if (block) block.style.display = isPriv ? 'block' : 'none';

    // Parol inputini va ko'z ikonini reset qilamiz
    const passInp = document.getElementById('online-create-password');
    const eyeBtn  = block?.querySelector('.btn-eye');
    if (passInp) { passInp.value = ''; passInp.type = 'password'; }
    if (eyeBtn)  eyeBtn.innerHTML = EYE_OPEN;
};

window.selectJoinType = function (btn, isOpen) {
    joinIsPrivate = !isOpen;
    document.querySelectorAll('#online-join-step .online-type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('online-join-password').style.display = !isOpen ? 'block' : 'none';
};

window.toggleJoinPasswordBlock = function (cb) {
    const block = document.getElementById('online-join-password-block');
    if (block) block.style.display = cb.checked ? 'block' : 'none';
    if (!cb.checked) joinIsPrivate = false;
};

// Ko'z SVG ikonlari — emoji o'rniga
const EYE_OPEN = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3" fill="currentColor" fill-opacity="0.25"/></svg>`;
const EYE_SHUT = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

window.togglePasswordVis = function (inputId, btn) {
    const inp = document.getElementById(inputId);
    if (!inp) return;
    if (inp.type === 'password') {
        // Yashirin edi → ko'rsatamiz, chizilgan ko'z chiqadi
        inp.type = 'text';
        btn.innerHTML = EYE_SHUT;
    } else {
        // Ko'rinib turgan edi → yashiramiz, ochiq ko'z chiqadi
        inp.type = 'password';
        btn.innerHTML = EYE_OPEN;
    }
};

// ===============================================================
// OCHIQ LOBBILAR RO'YXATI YUKLASH
// ===============================================================
window.loadPublicLobbies = async function () {
    const container = document.getElementById('public-lobbies-list');
    if (!container) return;
    container.innerHTML = '<p style="color:#666;font-size:0.85rem;text-align:center;">Yuklanmoqda...</p>';
    try {
        const res = await fetch('/api/lobbies');
        if (!res.ok) throw new Error();
        const lobbies = await res.json();

        if (!lobbies.length) {
            container.innerHTML = '<p style="color:#555;font-size:0.85rem;text-align:center;">Hech qanday ochiq lobbi yo\'q.</p>';
            return;
        }
        container.innerHTML = '';
        lobbies.forEach(lb => {
            const isPriv = lb.is_private;
            const item   = document.createElement('div');
            item.className = 'public-lobby-item' + (isPriv ? ' private' : '');
            item.innerHTML = `
                <div class="public-lobby-left">
                    <div class="public-lobby-code">${esc(lb.lobby_code)}</div>
                    <div class="public-lobby-host">Admin: ${esc(lb.admin_username)}</div>
                </div>
                <div class="public-lobby-right">
                    <div class="public-lobby-count">${lb.player_count} kishi</div>
                    <div class="public-lobby-max">max ${esc(String(lb.max_players))}</div>
                    <span class="public-lobby-badge ${isPriv ? 'badge-private' : 'badge-open'}">
                        ${isPriv ? '🔒 Yopiq' : '🔓 Ochiq'}
                    </span>
                </div>
            `;
            item.onclick = () => quickJoinLobby(lb);
            container.appendChild(item);
        });
    } catch (e) {
        container.innerHTML = '<p style="color:#e55;font-size:0.85rem;text-align:center;">Lobbilarni yuklab bo\'lmadi.</p>';
    }
};

// Ro'yxatdagi lobbiga tez kirish
function _toggleQuickPass() {
    const i   = document.getElementById('quick-pass-input');
    const btn = document.getElementById('quick-pass-eye');
    if (!i || !btn) return;
    if (i.type === 'password') { i.type = 'text';     btn.innerHTML = EYE_SHUT; }
    else                       { i.type = 'password'; btn.innerHTML = EYE_OPEN; }
}

async function quickJoinLobby(lb) {
    if (lb.is_private) {
        const old = document.getElementById('quick-join-overlay');
        if (old) old.remove();

        const overlay = document.createElement('div');
        overlay.id = 'quick-join-overlay';
        overlay.style.cssText = `
            position:fixed;inset:0;background:rgba(0,0,0,0.75);
            display:flex;align-items:center;justify-content:center;
            z-index:99999;backdrop-filter:blur(4px);`;
        overlay.innerHTML = `
            <div class="cmodal-box" style="max-width:320px;width:90%;">
                <div class="cmodal-msg" style="margin-bottom:6px;">🔒 Yopiq lobbi</div>
                <div style="color:#64748b;font-size:0.82rem;margin-bottom:14px;">
                    Kod: <b style="color:#f1c40f;letter-spacing:2px;">${esc(lb.lobby_code)}</b>
                    &nbsp;·&nbsp; Admin: ${esc(lb.admin_username)}
                </div>
                <div style="display:flex;align-items:center;background:#0d1f3c;border:2px solid #1e3a5f;
                            border-radius:10px;padding:0 8px 0 10px;margin-bottom:16px;">
                    <span style="font-size:0.95rem;margin-right:8px;opacity:.6;flex-shrink:0;">🔑</span>
                    <input id="quick-pass-input" type="password" placeholder="Parol kiriting..."
                           class="password-input"
                           style="flex:1;min-width:0;background:transparent;border:none;outline:none;
                                  color:#e2e8f0;font-size:14px;font-weight:400;
                                  padding:9px 0;width:auto;text-align:center;"
                           maxlength="30" autocomplete="off">
                    <button id="quick-pass-eye" onclick="_toggleQuickPass()"
                            style="background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.25);border-radius:8px;cursor:pointer;color:#818cf8;display:flex;align-items:center;padding:5px 7px;margin-left:6px;flex-shrink:0;transition:background .18s,color .18s;">
                        ${EYE_OPEN}
                    </button>
                </div>
                <div class="cmodal-btns">
                    <button class="cmodal-btn cmodal-cancel" id="qj-cancel">Bekor</button>
                    <button class="cmodal-btn cmodal-ok"     id="qj-ok">Kirish</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        const inp = overlay.querySelector('#quick-pass-input');
        inp.focus();

        const doJoin = async () => {
            const pass = inp.value.trim();
            if (!pass) { inp.style.borderColor = '#e94560'; return; }
            overlay.remove();
            await doJoinOnlineLobby(lb.lobby_code, pass);
        };

        overlay.querySelector('#qj-ok').onclick    = doJoin;
        overlay.querySelector('#qj-cancel').onclick = () => overlay.remove();
        inp.onkeydown = e => { if (e.key === 'Enter') doJoin(); };
        overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
    } else {
        await doJoinOnlineLobby(lb.lobby_code, null);
    }
}

// Parol so'rash modali
function showPrompt(msg, callback) {
    const overlay = document.createElement('div');
    overlay.id = 'cmodal-overlay';
    overlay.innerHTML = `
        <div class="cmodal-box">
            <div class="cmodal-msg">${msg}</div>
            <input type="password" id="cprompt-input" placeholder="Parol..."
                   style="width:100%;padding:10px;border-radius:8px;border:1px solid #2d3f5e;background:#0d1520;color:#e2e8f0;font-size:1rem;margin-bottom:14px;box-sizing:border-box;">
            <div class="cmodal-btns">
                <button class="cmodal-btn cmodal-ok" id="cprompt-ok">Kirish</button>
                <button class="cmodal-btn cmodal-cancel" id="cprompt-cancel">Bekor</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    const input = overlay.querySelector('#cprompt-input');
    input.focus();
    overlay.querySelector('#cprompt-ok').onclick = () => {
        document.body.removeChild(overlay);
        callback(input.value.trim());
    };
    overlay.querySelector('#cprompt-cancel').onclick = () => {
        document.body.removeChild(overlay);
        callback(null);
    };
    input.onkeydown = e => {
        if (e.key === 'Enter') {
            document.body.removeChild(overlay);
            callback(input.value.trim());
        }
    };
}

// ===============================================================
// ONLINE LOBBI YARATISH ACTION
// ===============================================================
window.createOnlineLobbyAction = async function () {
    if (isProcessing) return;
    isProcessing = true;
    try {
        const [minStr, maxStr] = selectedRange === '5-9' ? ['5','9'] : ['10','20'];
        const password = selectedPrivate
            ? (document.getElementById('online-create-password')?.value.trim() || '')
            : null;
        if (selectedPrivate && !password) {
            showAlert('Yopiq lobbi uchun parol kiriting!');
            return;
        }
        const _cToken = localStorage.getItem('mafia_token');
        const _cHeaders = { 'Content-Type': 'application/json' };
        if (_cToken) _cHeaders['Authorization'] = 'Bearer ' + _cToken;
        const res  = await fetch('/api/lobbies/create', {
            method: 'POST', headers: _cHeaders,
            body: JSON.stringify({
                username: myUsername,
                minPlayers: parseInt(minStr),
                maxPlayers: parseInt(maxStr),
                isPrivate: selectedPrivate,
                password
            })
        });
        const data = await res.json();
        if (!res.ok) { showAlert('Xatolik: ' + data.message); return; }
        myLobbyCode   = data.lobbyCode;
        adminUsername = data.adminUsername;
        socket.emit('join-lobby-room', { lobbyCode: myLobbyCode, username: myUsername });
        hideAllSteps();
        document.getElementById('lobby-screen').style.display = 'none';
        enterWaitingRoom();
    } catch (e) {
        showAlert('Server bilan ulanishda xato!');
    } finally {
        isProcessing = false;
    }
};

// ===============================================================
// ONLINE LOBBIGA KIRISH ACTION (form orqali)
// ===============================================================
window.joinOnlineLobbyAction = async function () {
    if (isProcessing) return;
    const code = document.getElementById('online-join-code').value.trim();
    if (!code || code.length !== 5) { showAlert("5 xonali kodni to'g'ri kiriting!"); return; }
    const hasPass = document.getElementById('join-has-password')?.checked;
    const password = hasPass ? (document.getElementById('online-join-password')?.value.trim() || null) : null;
    isProcessing = true;
    try {
        await doJoinOnlineLobby(code, password);
    } finally {
        isProcessing = false;
    }
};

async function doJoinOnlineLobby(code, password) {
    try {
        const _jToken = localStorage.getItem('mafia_token');
        const _jHeaders = { 'Content-Type': 'application/json' };
        if (_jToken) _jHeaders['Authorization'] = 'Bearer ' + _jToken;
        const res  = await fetch('/api/lobbies/join', {
            method: 'POST', headers: _jHeaders,
            body: JSON.stringify({ username: myUsername, lobbyCode: code, password })
        });
        const data = await res.json();
        if (!res.ok) { showAlert('Xatolik: ' + data.message); return; }
        myLobbyCode   = data.lobbyCode;
        adminUsername = data.adminUsername;
        if (data.username) myUsername = data.username; // server _2, _3 qo'shgan bo'lsa
        socket.emit('join-lobby-room', { lobbyCode: myLobbyCode, username: myUsername });
        hideAllSteps();
        document.getElementById('lobby-screen').style.display = 'none';
        enterWaitingRoom();
    } catch (e) {
        showAlert('Server bilan ulanishda xato!');
    }
}

// ===============================================================
// LOBBI OCHISH
// ===============================================================
async function createLobbyAction() {
    try {
        const res  = await fetch('/api/lobby/create', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: myUsername })
        });
        const data = await res.json();
        if (!res.ok) { showAlert('Xatolik: ' + data.message); return; }
        myLobbyCode   = data.lobbyCode;
        adminUsername = data.adminUsername;
        socket.emit('join-lobby-room', { lobbyCode: myLobbyCode, username: myUsername });
        enterWaitingRoom();
    } catch (e) {
        showAlert('Server bilan ulanishda xato!');
    }
}

// ===============================================================
// LOBBIGA QO'SHILISH
// ===============================================================
window.joinLobbyAction = async function (passwordArg) {
    if (isProcessing) return;
    const code = document.getElementById('lobby-code-input').value.trim();
    if (!code || code.length !== 5) { showAlert("5 xonali kodni to'g'ri kiriting!"); return; }
    isProcessing = true;
    try {
        const body = { username: myUsername, lobbyCode: code };
        if (passwordArg) body.password = passwordArg;

        const res  = await fetch('/api/lobby/join', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();

        // Yopiq lobbi — parol so'raymiz
        if (res.status === 403 && data.requiresPassword) {
            isProcessing = false;
            _showJoinPasswordModal(code);
            return;
        }

        if (!res.ok) { showAlert('Xatolik: ' + data.message); return; }
        myLobbyCode   = data.lobbyCode;
        adminUsername = data.adminUsername;
        if (data.username) myUsername = data.username;
        socket.emit('join-lobby-room', { lobbyCode: myLobbyCode, username: myUsername });
        enterWaitingRoom();
    } catch (e) {
        showAlert('Server bilan ulanishda xato!');
    } finally {
        isProcessing = false;
    }
};

// Asosiy menyudan kirish uchun parol modali
function _showJoinPasswordModal(code) {
    const old = document.getElementById('join-pass-overlay');
    if (old) old.remove();
    const overlay = document.createElement('div');
    overlay.id = 'join-pass-overlay';
    overlay.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,0.75);
        display:flex;align-items:center;justify-content:center;
        z-index:99999;backdrop-filter:blur(4px);`;
    overlay.innerHTML = `
        <div class="cmodal-box" style="max-width:320px;width:90%;">
            <div class="cmodal-msg" style="margin-bottom:6px;">🔒 Yopiq lobbi</div>
            <div style="color:#64748b;font-size:0.82rem;margin-bottom:14px;">
                Kod: <b style="color:#f1c40f;letter-spacing:2px;">${esc(code)}</b>
            </div>
            <div style="display:flex;align-items:center;background:#0d1f3c;border:2px solid #1e3a5f;
                        border-radius:10px;padding:0 12px;margin-bottom:16px;">
                <span style="font-size:1rem;margin-right:8px;opacity:.7;">🔑</span>
                <input id="join-pass-input" type="password" placeholder="Parol kiriting..."
                       style="flex:1;background:transparent;border:none;outline:none;
                              color:#e2e8f0;font-size:15px;padding:12px 0;width:100%;"
                       maxlength="30" autocomplete="off">
                <button onclick="const i=document.getElementById('join-pass-input');
                    const open='<svg width=18 height=18 viewBox=\"0 0 24 24\" fill=none stroke=currentColor stroke-width=2 stroke-linecap=round stroke-linejoin=round><path d=\"M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z\"/><circle cx=12 cy=12 r=3/></svg>';
                    const shut='<svg width=18 height=18 viewBox=\"0 0 24 24\" fill=none stroke=currentColor stroke-width=2 stroke-linecap=round stroke-linejoin=round><path d=\"M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24\"/><line x1=1 y1=1 x2=23 y2=23/></svg>';
                    if(i.type==='password'){i.type='text';this.innerHTML=shut;}else{i.type='password';this.innerHTML=open;}"
                    style="background:none;border:none;cursor:pointer;color:#64748b;display:flex;align-items:center;padding:0 0 0 8px;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
            </div>
            <div class="cmodal-btns">
                <button class="cmodal-btn cmodal-cancel" id="jp-cancel">Bekor</button>
                <button class="cmodal-btn cmodal-ok"     id="jp-ok">Kirish</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    const inp = overlay.querySelector('#join-pass-input');
    inp.focus();
    const doJoin = async () => {
        const pass = inp.value.trim();
        if (!pass) { inp.style.borderColor = '#e94560'; return; }
        overlay.remove();
        await window.joinLobbyAction(pass);
    };
    overlay.querySelector('#jp-ok').onclick    = doJoin;
    overlay.querySelector('#jp-cancel').onclick = () => overlay.remove();
    inp.onkeydown = e => { if (e.key === 'Enter') doJoin(); };
    overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
}

// ===============================================================
// QAYTA KIRISH (texnik uzilish bo'lganda)
// ===============================================================
window.rejoinLobbyAction = async function () {
    if (isProcessing) return;
    const code = document.getElementById('rejoin-code-input').value.trim();
    if (!code || code.length !== 5) { showAlert("5 xonali kodni to'g'ri kiriting!"); return; }
    isProcessing = true;
    try {
        const res  = await fetch('/api/lobby/rejoin', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: myUsername, lobbyCode: code })
        });
        const data = await res.json();
        if (!res.ok) { showAlert('Xatolik: ' + data.message); return; }
        myLobbyCode   = data.lobbyCode;
        adminUsername = data.adminUsername;
        socket.emit('join-lobby-room', { lobbyCode: myLobbyCode, username: myUsername });
        // Rejoin ekranini yopamiz
        document.getElementById('rejoin-step').style.display = 'none';
        document.getElementById('lobby-screen').style.display = 'none';
        enterWaitingRoom();
    } catch (e) {
        showAlert('Server bilan ulanishda xato!');
    } finally {
        isProcessing = false;
    }
};

// ===============================================================
// KUTISH XONASIGA KIRISH
// ===============================================================
function enterWaitingRoom() {
    // Lobby ga har kirganda skin cache ni tozalaymiz —
    // shunda o'zgartirilgan skinlar darhol yuklanadi
    Object.keys(playerSkinCache).forEach(k => delete playerSkinCache[k]);

    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('waiting-room').style.display = 'block';
    document.getElementById('display-lobby-code').innerText = myLobbyCode;

    if (myUsername === adminUsername) {
        document.getElementById('lobby-admin-badge').style.display = 'block';
        document.getElementById('admin-panel').style.display = 'block';
    }

    if (!gameLoopInterval) gameLoopInterval = setInterval(gameLoop, 3000);
    gameLoop();

    const infoBtn = document.querySelector('.btn-info-open');
    if (infoBtn) infoBtn.style.display = 'none';
}

// ===============================================================
// O'YINNI BOSHLASH
// ===============================================================
window.startGameAction = async function () {
    const btn = document.querySelector('.btn-start');
    if (btn) { btn.disabled = true; btn.innerText = "⏳ Yuklanmoqda..."; }
    try {
        const res  = await fetch(`/api/lobby/${myLobbyCode}/start`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: myUsername })
        });
        const data = await res.json();
        if (!res.ok) showAlert('Xatolik: ' + data.message);
        else showAlert(data.message);
    } catch (e) { showAlert('Server bilan ulanishda xato!'); }
    finally {
        if (btn) { btn.disabled = false; btn.innerText = "▶ O'yinni Boshlash"; }
    }
};

// ===============================================================
// RESET
// ===============================================================
window.resetGameAction = async function () {
    showConfirm("O'yinni rostdan ham qayta tiklaysizmi?", async () => {
        const btn = document.querySelector('.btn-reset');
        if (btn) { btn.disabled = true; }
        try {
            const res  = await fetch(`/api/lobby/${myLobbyCode}/reset`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: myUsername })
            });
            const data = await res.json();
            if (!res.ok) showAlert('Xatolik: ' + data.message);
            else showAlert(data.message);
        } catch (e) { showAlert('Server bilan ulanishda xato!'); }
        finally {
            if (btn) { btn.disabled = false; }
        }
    });
};

// ===============================================================
// ADMIN: DARHOL OVOZ BERISHGA O'TISH (faqat discussion fazasida)
// — Eski admin-only tugma: endi ishlatilmaydi (vote-ready tizimi bor)
// ===============================================================
window.startVotingNow = async function () {
    if (gamePhase !== 'discussion') return;
    if (isProcessing) return;
    const btn = document.getElementById('btn-start-voting');
    if (btn) { btn.disabled = true; btn.innerText = '⏳ Yuklanmoqda...'; }
    isProcessing = true;
    try {
        const res  = await fetch(`/api/lobby/${myLobbyCode}/update-phase`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phase: 'discussion', username: myUsername })
        });
        const data = await res.json();
        if (!res.ok) showAlert('Xatolik: ' + data.message);
    } catch (e) {
        showAlert('Server bilan ulanishda xato!');
    } finally {
        isProcessing = false;
        if (btn) { btn.disabled = false; btn.innerText = '🗳️ Ovoz Berishni Boshlash'; }
    }
};

// ===============================================================
// OVOZ BERISHGA TAYYOR — har bir o'yinchi bosadi, hammasi bossagina boshlanadi
// ===============================================================
let hasClickedVoteReady = false;

window.clickVoteReady = async function () {
    if (hasClickedVoteReady) return;
    if (gamePhase !== 'discussion') return;
    hasClickedVoteReady = true;

    const btn = document.getElementById('btn-vote-ready');
    if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; btn.innerText = '✅ Tayyor'; }

    try {
        await fetch(`/api/lobby/${myLobbyCode}/vote-ready`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: myUsername })
        });
    } catch (e) {
        // Xato bo'lsa tugmani qaytaramiz
        hasClickedVoteReady = false;
        if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.innerText = '🗳️ Ovoz Berishni Boshlash'; }
    }
};

window.leaveLobbyAction = async function () {
    showConfirm("Lobbydan chiqmoqchimisiz?", async () => {
        try {
            await fetch(`/api/lobby/${myLobbyCode}/leave`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: myUsername })
            });
        } catch (e) {}
        clearInterval(gameLoopInterval);
        gameLoopInterval = null;
        stopMusic();
        myLobbyCode  = '';
        myUsername   = '';
        adminUsername = '';
        location.reload();
    });
};

// ===============================================================
// TAYMER
// ===============================================================
setInterval(() => {
    if (timeLeft > 0) {
        timeLeft--;
        const el = document.getElementById('timer');
        if (el) el.innerText = formatTime(timeLeft);
    }
}, 1000);

// ===============================================================
// O'YIN TUGADI EKRANI
// ===============================================================
function roleDisplayInfo(role) {
    if (role === 'Mafia (DON)') return { name: 'Mafia (Don)', icon: '👑', color: '#fca5a5' };
    if (role === 'Mafia')       return { name: 'Mafia',        icon: '🔫', color: '#f87171' };
    if (role === 'Doctor')      return { name: 'Shifokor',     icon: '💉', color: '#38bdf8' };
    return { name: 'Tinch aholi', icon: '👤', color: '#4ade80' };
}

function buildPlayerRowsHtml(list) {
    return list.map(p => {
        const info = roleDisplayInfo(p.role);
        const aliveTag = p.is_alive
            ? ''
            : '<span style="font-size:0.68rem;color:#64748b;margin-left:6px;">(o\'lik)</span>';
        return `
            <div style="
                display:flex; align-items:center; gap:8px;
                padding:7px 10px;
                background:rgba(255,255,255,0.04);
                border:1px solid ${info.color}33;
                border-radius:10px;
            ">
                <span style="font-size:1rem;">${info.icon}</span>
                <span style="flex:1;text-align:left;color:#e2e8f0;font-size:0.85rem;font-weight:600;">${esc(p.username)}${aliveTag}</span>
                <span style="font-size:0.68rem;font-weight:800;color:${info.color};text-transform:uppercase;letter-spacing:0.3px;">${info.name}</span>
            </div>`;
    }).join('');
}

function showGameOver(winner, message, players) {
    clearInterval(gameLoopInterval);
    stopMusic();

    // Eski game-over panelni o'chiramiz
    const oldPanel = document.getElementById('game-over-panel');
    if (oldPanel) oldPanel.remove();

    const golibJamoa = winner === 'MAFIA' ? 'Mafiya 🥷🏼' : 'Tinch aholi 🎉';
    const bgColor    = winner === 'MAFIA' ? '#1a0a0a' : '#0a1a0a';
    const borderColor= winner === 'MAFIA' ? '#e94560' : '#27ae60';
    const titleColor = winner === 'MAFIA' ? '#e94560' : '#27ae60';

    // G'olib va mag'lub jamoa a'zolarini ajratib olamiz
    let teamsHtml = '';
    if (Array.isArray(players) && players.length) {
        const isMafiaRole = (role) => role.includes('Mafia');
        const winners = players.filter(p => winner === 'MAFIA' ? isMafiaRole(p.role) : !isMafiaRole(p.role));
        const losers  = players.filter(p => winner === 'MAFIA' ? !isMafiaRole(p.role) : isMafiaRole(p.role));

        let winnersHtml = '';
        if (winners.length) {
            winnersHtml = `
                <div style="text-align:left;margin-bottom:12px;">
                    <div style="font-size:0.72rem;color:${borderColor};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;text-align:center;font-weight:700;">
                        🏆 G'olib jamoa a'zolari
                    </div>
                    <div style="display:flex;flex-direction:column;gap:6px;">
                        ${buildPlayerRowsHtml(winners)}
                    </div>
                </div>`;
        }

        let losersHtml = '';
        if (losers.length) {
            losersHtml = `
                <div style="text-align:left;margin-bottom:16px;opacity:0.75;">
                    <div style="font-size:0.72rem;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;text-align:center;font-weight:700;">
                        💀 Mag'lub jamoa a'zolari
                    </div>
                    <div style="display:flex;flex-direction:column;gap:6px;">
                        ${buildPlayerRowsHtml(losers)}
                    </div>
                </div>`;
        }

        teamsHtml = `
            <div style="max-height:320px;overflow-y:auto;">
                ${winnersHtml}
                ${losersHtml}
            </div>`;
    }

    const panel = document.createElement('div');
    panel.id = 'game-over-panel';
    panel.style.cssText = `
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.92);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 99999;
        padding: 20px;
        overflow-y: auto;
    `;
    panel.innerHTML = `
        <div style="
            background: ${bgColor};
            border: 3px solid ${borderColor};
            border-radius: 20px;
            padding: 36px 28px;
            text-align: center;
            max-width: 360px;
            width: 100%;
            box-shadow: 0 0 40px ${borderColor}88;
        ">
            <div style="font-size: 3rem; margin-bottom: 10px;">
                ${winner === 'MAFIA' ? '😈' : '🎉'}
            </div>
            <h1 style="color: ${titleColor}; font-size: 1.6rem; margin: 0 0 12px 0;">
                O'YIN TUGADI!
            </h1>
            <div style="
                background: ${borderColor}22;
                border: 1px solid ${borderColor};
                border-radius: 12px;
                padding: 12px 16px;
                font-size: 1.1rem;
                font-weight: bold;
                color: ${titleColor};
                margin-bottom: 16px;
            ">
                🏆 G'olib: ${golibJamoa}
            </div>
            ${teamsHtml}
            <div style="
                color: #ccc;
                font-size: 0.9rem;
                margin-bottom: 24px;
                line-height: 1.5;
            ">${message || ''}</div>
            <button onclick="location.reload()" style="
                background: ${borderColor};
                color: white;
                border: none;
                border-radius: 12px;
                padding: 14px 28px;
                font-size: 1rem;
                font-weight: bold;
                cursor: pointer;
                width: 100%;
            ">🏠 Asosiy menyuga</button>
        </div>
    `;
    document.body.appendChild(panel);
}

// ===============================================================
// GAME LOOP
// ===============================================================
async function gameLoop() {
    if (!myLobbyCode) return;
    if (gameOverShown) return; // winner ko'rsatilgan — loop to'xtatilgan
    try {
        const [playersRes, lobbyRes] = await Promise.all([
            fetch(`/api/lobby/${myLobbyCode}/players?username=${encodeURIComponent(myUsername)}`),
            fetch(`/api/lobby/${myLobbyCode}`)
        ]);

        if (lobbyRes.status === 404) {
            clearInterval(gameLoopInterval);
            // Galaba oynasi ko'rsatilgan bo'lsa — reload qilmaymiz
            if (gameOverShown) return;
            showAlert('Lobbi yopildi.');
            location.reload();
            return;
        }

        const players = await playersRes.json();
        const lobby   = await lobbyRes.json();
        if (!Array.isArray(players)) return;

        // Skinlarni background da yuklab olamiz (cache bor bo'lsa tez)
        fetchAllPlayerSkins(players).catch(() => {});

        const me = players.find(p => p.username === myUsername);

        // Faza o'zgargan
        if (lobby.current_phase && gamePhase !== lobby.current_phase) {
            gamePhase        = lobby.current_phase;
            isSwitchingPhase = false;
            hasKilled        = false;
            hasHealed        = false;
            updateMusic(gamePhase);
            if (gamePhase !== 'waiting') showGameScreen();
            else showWaitingRoom();
            updateVotingBtn();
            // vote_results: faqat socket eventi orqali ko'rsatiladi (ikki marta chiqmasin)
        }

        // Taymer
        if (me && me.phase_end_time && gamePhase !== 'waiting') {
            const diff = Math.floor((new Date(me.phase_end_time).getTime() - Date.now()) / 1000);
            if (diff <= 0) {
                timeLeft = 0;
                // FIX 4: isSwitchingPhase finally blokida reset bo'ladi — bu yetarli
                if (myUsername === adminUsername && !isSwitchingPhase) {
                    await autoSwitchPhase();
                }
            } else {
                timeLeft = diff;
            }
        }

        // O'lik ekrani — to'liq ekranni qoplaydigan fixed overlay
        if (me && !me.is_alive && gamePhase !== 'waiting') {
            // game-screen ni yashiramiz — death-screen ustidan chiqmasin
            const gs = document.getElementById('game-screen');
            if (gs) gs.style.display = 'none';
            if (!document.getElementById('death-screen')) {
                const ds = document.createElement('div');
                ds.id = 'death-screen';
                ds.style.position   = 'fixed';
                ds.style.top        = '0';
                ds.style.left       = '0';
                ds.style.right      = '0';
                ds.style.bottom     = '0';
                ds.style.background = 'rgba(0,0,0,0.96)';
                ds.style.display    = 'flex';
                ds.style.flexDirection = 'column';
                ds.style.alignItems    = 'center';
                ds.style.justifyContent = 'center';
                ds.style.zIndex     = '9990';
                ds.style.textAlign  = 'center';
                ds.style.padding    = '30px';
                ds.innerHTML = [
                    '<div style="font-size:4rem;margin-bottom:16px;">💀</div>',
                    '<h2 style="font-size:1.8rem;color:#e94560;margin:0 0 14px 0;letter-spacing:1px;">SIZ O\'LDINGIZ</h2>',
                    '<p style="color:#aaa;font-size:1rem;margin:0;line-height:1.6;">O\'yin tugashini kuting...</p>'
                ].join('');
                document.body.appendChild(ds);
            }
            // O'lgan bo'lsa updateGameUI CHAQIRMAYMIZ
        } else if (gamePhase !== 'waiting') {
            // Tirik — death-screen bo'lsa olib tashlaymiz
            const ds = document.getElementById('death-screen');
            if (ds) ds.remove();
            const gs = document.getElementById('game-screen');
            if (gs) gs.style.display = 'block';
            updateGameUI(me, players);
        } else {
            updateWaitingUI(players);
        }
    } catch (e) {
        console.error('Loop xatosi:', e);
        isSwitchingPhase = false;
    }
}

function showGameScreen() {
    document.getElementById('waiting-room').style.display  = 'none';
    document.getElementById('game-screen').style.display   = 'block';
    document.getElementById('timer').style.display         = 'block';
    document.getElementById('phase-display').style.display = 'block';
    const gAdminPanel = document.getElementById('game-admin-panel');
    if (gAdminPanel) gAdminPanel.style.display = 'none';
    switchGameTab('players');
    updateVotingBtn();
}

window.switchGameTab = function(tabName) {
    var tabs    = ['players', 'chat', 'mafia-chat', 'info'];
    var btnIds  = { players: 'tab-btn-players', chat: 'tab-btn-chat', 'mafia-chat': 'tab-btn-mafia-chat', info: 'tab-btn-info' };
    var contIds = { players: 'tab-content-players', chat: 'tab-content-chat', 'mafia-chat': 'tab-content-mafia-chat', info: 'tab-content-info' };
    tabs.forEach(function(t) {
        var btn  = document.getElementById(btnIds[t]);
        var cont = document.getElementById(contIds[t]);
        if (btn)  btn.classList.toggle('active', t === tabName);
        if (cont) cont.style.display = (t === tabName) ? 'block' : 'none';
    });
    if (tabName === 'chat') {
        var badge = document.getElementById('chat-unread-badge');
        if (badge) { badge.style.display = 'none'; badge.textContent = '0'; }
        setTimeout(function() {
            var box = document.getElementById('chat-messages');
            if (box) box.scrollTop = box.scrollHeight;
        }, 50);
    }
    if (tabName === 'mafia-chat') {
        var mBadge = document.getElementById('mafia-chat-unread-badge');
        if (mBadge) { mBadge.style.display = 'none'; mBadge.textContent = '0'; }
        setTimeout(function() {
            var box = document.getElementById('mafia-chat-messages');
            if (box) box.scrollTop = box.scrollHeight;
        }, 50);
    }
};

// Ovoz berish tugmasini faqat discussion fazasida admin uchun ko'rsatish
function updateVotingBtn() {
    // Eski admin tugmasi — yashiringan holda qoladi
    const adminBtn = document.getElementById('btn-start-voting');
    if (adminBtn) adminBtn.style.display = 'none';

    // Yangi "hammaga" tugma
    updateVoteReadyBtn();
}

// Discussion fazasida hamma uchun vote-ready tugmasini ko'rsatish/yashirish
// voteReadyUsers — gameLoop har chaqirganida yo'qolmasin uchun modul darajasida saqlanadi
let voteReadyUsers = new Set();

function updateVoteReadyBtn() {
    let btn = document.getElementById('btn-vote-ready');

    if (gamePhase === 'discussion') {
        if (!btn) {
            btn = document.createElement('button');
            btn.id      = 'btn-vote-ready';
            btn.onclick = () => window.clickVoteReady();

            const gameScreen = document.getElementById('game-screen');
            if (gameScreen) {
                let vc = document.getElementById('vote-ready-container');
                if (!vc) {
                    vc = document.createElement('div');
                    vc.id = 'vote-ready-container';
                    vc.style.cssText = 'margin-top:14px;text-align:center;';
                    gameScreen.appendChild(vc);
                }
                vc.innerHTML = '';
                vc.appendChild(btn);
            }
        }

        // Stil — kichikroq va yorqin
        btn.style.cssText = [
            'display:block;width:100%;padding:10px 16px;',
            'background:linear-gradient(135deg,#00e676,#00c853);',
            'border:none;border-radius:12px;',
            'color:#000;font-weight:800;font-size:0.9rem;letter-spacing:.3px;',
            'cursor:pointer;transition:all .18s;',
            'box-shadow:0 4px 18px rgba(0,230,118,0.45);',
            hasClickedVoteReady ? 'opacity:0.55;' : 'opacity:1;'
        ].join('');

        if (!hasClickedVoteReady) {
            btn.disabled   = false;
            btn.innerText  = '🗳️ Ovoz Berishni Boshlash';
        } else {
            btn.disabled   = true;
            btn.innerText  = '✅ Tayyor';
        }
    } else {
        const vc = document.getElementById('vote-ready-container');
        if (vc) vc.innerHTML = '';
        hasClickedVoteReady = false;
        voteReadyUsers.clear();
    }
}

function showWaitingRoom() {
    document.getElementById('waiting-room').style.display = 'block';
    document.getElementById('game-screen').style.display  = 'none';
    document.getElementById('timer').style.display        = 'none';
}

// ===============================================================
// KUTISH XONASI UI
// ===============================================================

// Rang kalit → emoji va hex
const COLOR_MAP = {
    red:    { emoji: '🔴', hex: '#ef4444' },
    orange: { emoji: '🟠', hex: '#f97316' },
    yellow: { emoji: '🟡', hex: '#eab308' },
    green:  { emoji: '🟢', hex: '#22c55e' },
    blue:   { emoji: '🔵', hex: '#3b82f6' },
    purple: { emoji: '🟣', hex: '#a855f7' },
    black:  { emoji: '⚫️', hex: '#6b7280' },
    white:  { emoji: '⚪️', hex: '#e2e8f0' },
    brown:  { emoji: '🟤', hex: '#a16207' },
};

function colorEmoji(colorKey) {
    return COLOR_MAP[colorKey] ? COLOR_MAP[colorKey].emoji : '⚪️';
}
function colorHex(colorKey) {
    return COLOR_MAP[colorKey] ? COLOR_MAP[colorKey].hex : '#e2e8f0';
}

// Skin bo'lsa — skin ikonkasi, bo'lmasa — rangli doira
function playerIcon(username, colorKey) {
    const skinId = playerSkinCache[username];
    if (skinId && SKIN_DATA[skinId]) {
        return SKIN_DATA[skinId].icon;
    }
    return colorEmoji(colorKey);
}

function updateWaitingUI(players) {
    const list    = document.getElementById('player-list');
    const counter = document.getElementById('player-count');
    if (!list) return;
    counter.innerText = players.length;
    list.innerHTML = '';

    // Skinlarni olish (async, keyin qayta render)
    fetchAllPlayerSkins(players).then(() => {
        list.innerHTML = '';
        players.forEach(p => {
            const div = document.createElement('div');
            const isMe = p.username === myUsername;
            div.className = 'player-row' + (isMe ? ' player-row-me' : '');
            const crown   = p.username === adminUsername ? ' 👑' : '';
            const meBadge = isMe ? '<span class="me-badge">Sen</span>' : '';
            // Skin bo'lsa — ikonka renderPlayerName ichida chiqadi, bo'lmasa rangli doira
            const hasSkin = playerSkinCache[p.username] && SKIN_DATA[playerSkinCache[p.username]];
            const prefix  = hasSkin ? '' : `<span style="margin-right:4px;">${colorEmoji(p.player_color)}</span>`;
            div.innerHTML = `
                <span>
                    ${prefix}${renderPlayerName(p.username)}${crown} ${meBadge}
                </span>
                <span style="color:#aaa;font-size:0.8rem;">Tayyor</span>`;
            list.appendChild(div);
        });
    });

    // Darxol render (skin yuklangandan oldin — rangli doira ko'rsatamiz)
    players.forEach(p => {
        const div = document.createElement('div');
        const isMe = p.username === myUsername;
        div.className = 'player-row' + (isMe ? ' player-row-me' : '');
        const crown   = p.username === adminUsername ? ' 👑' : '';
        const meBadge = isMe ? '<span class="me-badge">Sen</span>' : '';
        const hasSkin = playerSkinCache[p.username] && SKIN_DATA[playerSkinCache[p.username]];
        const prefix  = hasSkin ? '' : `<span style="margin-right:4px;">${colorEmoji(p.player_color)}</span>`;
        div.innerHTML = `
            <span>
                ${prefix}${renderPlayerName(p.username)}${crown} ${meBadge}
            </span>
            <span style="color:#aaa;font-size:0.8rem;">Tayyor</span>`;
        list.appendChild(div);
    });
}

// ===============================================================
// O'YIN UI
// ===============================================================
function updateGameUI(me, players) {
    window._lastPlayers = players || []; // Mafia chat uchun global saqlash
    const phaseDiv = document.getElementById('phase-display');
    const timerDiv = document.getElementById('timer');

    const phaseNames = {
        introduction:    '👋 Tanishuv',
        night_preparing: '🌙 Tun boshlanmoqda...',
        night_mafia:     '🥷🏼 Mafiya harakat qilmoqda',
        night_doctor:    '🩺 Doktor davolayapti',
        discussion:      '☀️ Muhokama',
        voting:          '🗳️ Ovoz berish',
        vote_results:    '📊 Ovoz natijalari',
    };
    if (phaseDiv) phaseDiv.innerText = phaseNames[gamePhase] || gamePhase.toUpperCase();
    if (timerDiv) timerDiv.innerText = formatTime(timeLeft);
    if (typeof updateChatPanel === 'function') updateChatPanel();

    const list = document.getElementById('game-player-list');
    if (!list) return;
    list.innerHTML = '';

    players.forEach(p => {
        const div = document.createElement('div');
        div.className = 'player-row';

        // Rol badge — Mafia sheriklarini ko'radi
        let roleTag = '';
        if (me && me.role && me.role.includes('Mafia') && p.role && p.role.includes('Mafia')) {
            roleTag = ` <span class="role-badge role-mafia">${esc(p.role)}</span>`;
        }

        const deadMark = p.is_alive ? '✅' : '💀';
        const isMe    = p.username === myUsername;
        if (isMe) div.classList.add('player-row-me');
        const meBadge      = isMe ? '<span class="me-badge">Sen</span>' : '';
        const readyBadge   = (gamePhase === 'discussion' && voteReadyUsers.has(p.username))
            ? '<span style="color:#22c55e;font-size:0.75rem;font-weight:700;margin-left:6px;">✅ Tayyor</span>'
            : '';
        const hasSkin = playerSkinCache[p.username] && SKIN_DATA[playerSkinCache[p.username]];
        const prefix  = hasSkin ? '' : `<span style="margin-right:4px;">${colorEmoji(p.player_color)}</span>`;
        div.innerHTML = `<span>${prefix}${renderPlayerName(p.username)} ${deadMark}${roleTag} ${meBadge}${readyBadge}</span>`;

        // -------------------------------------------------------
        // FIX 6: TUGMALAR — barcha shartlar aniq tekshiriladi
        // -------------------------------------------------------
        if (me && me.is_alive && p.is_alive && gamePhase !== 'waiting') {

            // MAFIYA OTISH
            // Shartlar: night_mafia fazasi, men Mafiya, o'zimga emas, nishon tirik
            if (gamePhase === 'night_mafia'
                && me.role && me.role.includes('Mafia')
                && p.username !== myUsername
                && !hasKilled) {

                // isDonAlive: o'zimdan BOSHQA tirik DON bormi?
                const isDonAlive = players.some(
                    pl => pl.role === 'Mafia (DON)' && pl.is_alive && pl.username !== myUsername
                );
                const canShoot = (me.role === 'Mafia (DON)') || !isDonAlive;

                // Nishon Mafia emas (role 'hidden' bo'lsa ham otish mumkin)
                const isEnemy = !p.role || !p.role.includes('Mafia');

                if (canShoot && isEnemy) {
                    div.appendChild(createActionBtn('Otish 🔫', () => handleAction('kill', p.username)));
                }
            }

            // DOKTOR DAVOLASH
            // Shartlar: night_doctor fazasi, men Doctor, hali davolamagan
            if (gamePhase === 'night_doctor'
                && me.role && me.role.toLowerCase() === 'doctor'
                && !hasHealed) {
                div.appendChild(createActionBtn('Davolash 💉', () => handleAction('heal', p.username)));
            }

            // OVOZ BERISH
            // Shartlar: voting fazasi, o'zimga emas, hali ovoz bermagan
            if (gamePhase === 'voting'
                && p.username !== myUsername
                && !me.voted_for) {
                div.appendChild(createActionBtn('Ovoz 🗳️', () => handleAction('vote', p.username)));
            }
        }

        list.appendChild(div);
    });

    // ROL MA'LUMOTI
    const roleDiv = document.getElementById('role-display');
    if (roleDiv && me && me.role && me.role !== 'unassigned' && gamePhase !== 'waiting') {
        roleDiv.style.display = 'block';
        let roleText = `Sizning rolingiz: <b style="color:${getRoleColor(me.role)}">${getRoleTranslate(me.role)}</b>`;
        if (me.role && me.role.includes('Mafia')) {
            const sheriqs = players
                .filter(p => p.role && p.role.includes('Mafia') && p.username !== myUsername && p.is_alive)
                .map(p => p.username);
            if (sheriqs.length > 0) {
                roleText += `<br><small style="color:#ff4d4d">Sheriklaringiz: ${sheriqs.join(', ')}</small>`;
            }
        }
        if (gamePhase === 'night_mafia' && me.role && me.role.includes('Mafia') && hasKilled) {
            roleText += `<br><small style="color:#aaa">✅ Nishon belgilandi, kutilmoqda...</small>`;
        }
        if (gamePhase === 'night_doctor' && me.role && me.role.toLowerCase() === 'doctor' && hasHealed) {
            roleText += `<br><small style="color:#aaa">✅ Bemor tanlandi, kutilmoqda...</small>`;
        }
        roleDiv.innerHTML = roleText;
    } else if (roleDiv) {
        roleDiv.style.display = 'none';
    }

    // Admin panel — faqat admin uchun ko'rsatiladi
    const gAdminPanel = document.getElementById('game-admin-panel');
    if (gAdminPanel) {
        gAdminPanel.style.display = (myUsername === adminUsername) ? 'block' : 'none';
    }
}

// ===============================================================
// FAZA ALMASHTIRISH
// ===============================================================
async function autoSwitchPhase() {
    if (isSwitchingPhase) return;
    isSwitchingPhase = true;
    await triggerNextPhase();
}

// FIX 7: finally bloki — xato bo'lsa ham isSwitchingPhase reset bo'ladi
async function triggerNextPhase() {
    try {
        const res = await fetch(`/api/lobby/${myLobbyCode}/update-phase`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phase: gamePhase, username: myUsername })
        });
        const data = res.ok ? await res.json() : null;
        if (data && data.success) {
            gamePhase = data.nextPhase;
            timeLeft  = data.duration;
        }
    } catch (e) {
        console.error('Faza xato:', e);
    } finally {
        isSwitchingPhase = false; // DOIM reset — o'yin qotib qolmaydi
    }
}

// ===============================================================
// HARAKATLAR
// ===============================================================
// FIX 8: hasKilled/hasHealed server javobi kelgandan keyin o'rnatiladi
async function handleAction(action, target) {
    if (action === 'kill') hasKilled = true;
    if (action === 'heal') { hasHealed = true; stopMusic(); }
    const ok = await sendAction(action, target);
    if (!ok) {
        // Server xato qaytarsa — tugmani qaytaramiz
        if (action === 'kill') hasKilled = false;
        if (action === 'heal') hasHealed = false;
    }
}

async function sendAction(action, target) {
    try {
        const res  = await fetch(`/api/lobby/${myLobbyCode}/${action}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target, username: myUsername })
        });
        const data = await res.json();
        if (!res.ok) {
            showAlert('Xato: ' + data.message);
            return false;
        }
        showToast(data.message);
        gameLoop();
        return true;
    } catch (e) {
        showAlert('Harakatda xato!');
        return false;
    }
}

// ===============================================================
// SOCKET EVENTLARI
// ===============================================================
socket.on('update-data', () => {
    isSwitchingPhase = false;
    debouncedGameLoop();
});

socket.on('lobbies-updated', () => {
    // Faqat online-step ko'rinib tursa yangilaymiz
    const onlineStep = document.getElementById('online-step');
    if (onlineStep && onlineStep.style.display !== 'none') {
        loadPublicLobbies();
    }
});

socket.on('game-started-signal', () => {
    isSwitchingPhase = false;
    debouncedGameLoop();
});

socket.on('game-reset-signal', () => {
    clearInterval(gameLoopInterval);
    stopMusic();
    location.reload();
});

socket.on('lobby-closed', () => {
    // O'yin tugagan bo'lsa — galaba oynasini yopmaymiz
    if (gameOverShown) return;
    clearInterval(gameLoopInterval);
    stopMusic();
    showAlert('Lobbi yopildi.');
    location.reload();
});

socket.on('admin-changed', (data) => {
    adminUsername = data.newAdmin;
    if (myUsername === adminUsername) {
        showToast("👑 Siz yangi Admin bo'ldingiz!", 5000);
        const ap    = document.getElementById('admin-panel');
        const gap   = document.getElementById('game-admin-panel');
        const badge = document.getElementById('lobby-admin-badge');
        if (ap)    ap.style.display    = 'block';
        if (gap)   gap.style.display   = 'block';
        if (badge) badge.style.display = 'block';
        // O'yin discussion fazasida bo'lsa — ovoz berish tugmasini darhol ko'rsat
        if (data.currentPhase) {
            gamePhase = data.currentPhase;
        }
        updateVotingBtn();
    }
    gameLoop();
});

socket.on('night-summary-report', (data) => {
    if (data.winner) {
        showGameOver(data.winner, data.message, data.players);
        return;
    }

    // gameLoop ni 3 soniya to'xtatamiz — avval "kun bo'ldi" ko'rinsin
    clearInterval(gameLoopInterval);

    // 3 soniyadan keyin modalni ko'rsatamiz
    setTimeout(() => {
        showNightSummaryModal(data.message);
        // gameLoop ni qayta ishga tushiramiz
        gameLoopInterval = setInterval(gameLoop, 3000);
        gameLoop();
    }, 3000);
});

socket.on('vote-results', (data) => {
    showVoteResults(data.summary, data.details);
});

socket.on('game-over', (data) => {
    gameOverShown = true;
    clearInterval(gameLoopInterval);
    stopMusic();
    // Kichik kechikish — night-summary modal ko'rinib ulgurisin
    setTimeout(() => showGameOver(data.winner, data.message, data.players), 800);
});

// action-done — backend o'zi 5 soniyada o'tkazadi, frontend faqat UI yangilaydi
socket.on('action-done', () => {
    gameLoop(); // UI ni yangilaymiz (tugma yo'qolishi uchun)
});

// Ovoz berishga tayyor bo'lgan o'yinchilar ro'yxati yangilandi
socket.on('vote-ready-update', (data) => {
    // Xotiradagi Set ni yangilaymiz — gameLoop har render qilganda ishlatadi
    voteReadyUsers = new Set(data.readyUsernames || []);

    // Tugma matnini yangilaymiz (hali bosmagan bo'lsa)
    const btn = document.getElementById('btn-vote-ready');
    if (btn && !hasClickedVoteReady) {
        btn.innerText = `🗳️ Ovoz Berishni Boshlash (${data.readyCount}/${data.aliveCount})`;
    }

    // Ro'yxatni darhol qayta chizamiz (keyingi gameLoop ni kutmaymiz)
    const rows = document.querySelectorAll('#game-player-list .player-row');
    rows.forEach(row => {
        const nameEl = row.querySelector('span');
        if (!nameEl) return;
        // Faqat ism qismini olamiz (emoji va badge larni tozalaymiz)
        const rawText = nameEl.childNodes[0]?.textContent?.trim() || '';
        const username = rawText.split(' ')[0];
        if (!username) return;

        // Eski ready badge ni olib tashlaymiz
        const oldBadge = row.querySelector('.vr-badge');
        if (oldBadge) oldBadge.remove();

        if (voteReadyUsers.has(username)) {
            const badge = document.createElement('span');
            badge.className = 'vr-badge';
            badge.style.cssText = 'color:#22c55e;font-size:0.75rem;font-weight:700;margin-left:6px;';
            badge.innerText = '✅ Tayyor';
            nameEl.appendChild(badge);
        }
    });
});

// ===============================================================
// YORDAMCHI FUNKSIYALAR
// ===============================================================
function createActionBtn(text, fn) {
    const b = document.createElement('button');
    b.innerText = text;
    b.onclick   = fn;
    b.className = 'btn-action';
    return b;
}

function formatTime(s) {
    if (s < 0) s = 0;
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

function getRoleTranslate(r) {
    if (!r) return r;
    if (r === 'Citizen')      return 'Oddiy aholi';
    if (r === 'Doctor')       return 'Shifokor';
    if (r === 'Mafia')        return 'Mafia';
    if (r === 'Mafia (DON)')  return 'Mafia (DON)';
    return r;
}

function getRoleColor(r) {
    if (r && r.includes('Mafia')) return '#e94560';
    if (r === 'Doctor')           return '#00d1ff';
    return '#f8b400';
}

function showToast(msg, duration = 3000) {
    // Oldingi toastni o'chiramiz
    const old = document.getElementById('toast-msg');
    if (old) old.remove();

    const toast = document.createElement('div');
    toast.id = 'toast-msg';

    // Tur aniqlash — icon va rang
    let borderColor = '#6366f1';
    let iconHtml = '';
    if (msg.startsWith('❌')) {
        borderColor = '#ef4444';
    } else if (msg.startsWith('✅') || msg.startsWith('🎉') || msg.startsWith('✨')) {
        borderColor = '#22c55e';
    } else if (msg.startsWith('🚀')) {
        borderColor = '#0ea5e9';
    } else if (msg.startsWith('⚠️')) {
        borderColor = '#f59e0b';
    }

    toast.style.cssText = `
        position: fixed;
        bottom: 32px;
        left: 50%;
        transform: translateX(-50%) translateY(20px);
        background: #131c2e;
        color: #e2e8f0;
        padding: 13px 22px;
        border-radius: 14px;
        border: 1.5px solid ${borderColor};
        font-size: 0.9rem;
        font-weight: 600;
        z-index: 999999;
        box-shadow: 0 6px 30px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04);
        max-width: 86%;
        text-align: center;
        line-height: 1.5;
        opacity: 0;
        transition: opacity 0.25s ease, transform 0.25s ease;
        pointer-events: none;
    `;
    toast.innerHTML = msg;
    document.body.appendChild(toast);

    // Kirish animatsiyasi
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(-50%) translateY(0)';
        });
    });

    // Chiqish animatsiyasi
    toast._timer = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(10px)';
        setTimeout(() => toast.remove(), 280);
    }, duration);
}

// ===============================================================
// TUN XULOSASI MODALI — O'rtada chiqadi, 6 soniyadan keyin yopiladi
// ===============================================================
function showNightSummaryModal(msg) {
    const old = document.getElementById('night-summary-modal');
    if (old) old.remove();

    const isKilled  = msg.includes('o\'ldirildi');
    const isSaved   = msg.includes('Doktor davoladi');
    const borderC   = isKilled ? '#e94560' : (isSaved ? '#00d1ff' : '#27ae60');
    const icon      = isKilled ? '💀' : (isSaved ? '🩺' : '✨');

    const modal = document.createElement('div');
    modal.id = 'night-summary-modal';
    modal.style.cssText = `
        position: fixed;
        top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        background: #1a2744;
        border: 2px solid ${borderC};
        border-radius: 18px;
        padding: 28px 24px;
        text-align: center;
        z-index: 99998;
        min-width: 280px;
        max-width: 90vw;
        box-shadow: 0 8px 40px rgba(0,0,0,0.8);
        animation: fadeInScale 0.3s ease;
    `;
    modal.innerHTML = `
        <div style="font-size:2.5rem;margin-bottom:10px;">${icon}</div>
        <div style="font-size:1rem;line-height:1.5;color:#fff;margin-bottom:14px;">${esc(msg)}</div>
        <div id="night-modal-cd" style="color:#64748b;font-size:0.8rem;">6 soniyada yopiladi</div>
    `;
    document.body.appendChild(modal);

    let secs = 6;
    const cd = setInterval(() => {
        secs--;
        const el = document.getElementById('night-modal-cd');
        if (el) el.innerText = `${secs} soniyada yopiladi`;
        if (secs <= 0) {
            clearInterval(cd);
            if (modal.parentNode) modal.remove();
        }
    }, 1000);
}

function showVoteResults(summary, details) {
    // Eski panelni o'chiramiz (ikki marta chiqmasin)
    const old = document.getElementById('vote-results-panel');
    if (old) old.remove();

    const panel = document.createElement('div');
    panel.id = 'vote-results-panel';
    panel.style.cssText = `
        position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
        background:#1a2744; color:#fff; padding:22px 26px; border-radius:16px;
        border:2px solid #e94560; font-size:0.95rem; z-index:9999;
        box-shadow:0 8px 30px rgba(0,0,0,0.7); min-width:280px; max-width:90%;
        text-align:center;`;
    document.body.appendChild(panel);

    const detailLines = details
        ? details.split('\n').map(d => `<div style="color:#aaa;font-size:0.82rem;margin:2px 0;">${esc(d)}</div>`).join('')
        : '';

    panel.innerHTML = `
        <div style="font-size:1.1rem;font-weight:bold;margin-bottom:10px;color:#f1c40f;">🗳️ Ovoz Natijalari</div>
        <div style="margin-bottom:10px;">${esc(summary)}</div>
        <div style="border-top:1px solid #334155;padding-top:8px;">${detailLines}</div>
        <div id="vote-countdown" style="margin-top:10px;color:#64748b;font-size:0.8rem;">10 soniyada yopiladi</div>`;

    let secs = 10;
    const cd = setInterval(() => {
        secs--;
        const el = document.getElementById('vote-countdown');
        if (el) el.innerText = `${secs} soniyada yopiladi`;
        if (secs <= 0) {
            clearInterval(cd);
            if (panel.parentNode) panel.parentNode.removeChild(panel);
        }
    }, 1000);
}

function showInfoModal() {
    _removeModal();
    const overlay = document.createElement('div');
    overlay.id = 'cmodal-overlay';
    const box = document.createElement('div');
    box.className = 'cmodal-box';
    box.style.maxWidth = '360px';
    box.style.textAlign = 'left';
    box.innerHTML = `
        <h3 style="text-align:center;margin-bottom:16px;font-size:1.1rem;">📖 O'yin haqida</h3>

        <b>🎮 Lobbi ochish:</b>
        <p style="color:#94a3b8;margin:4px 0 12px;">Ismingizni kiriting → "Lobbi Ochish" tugmasini bosing. Lobbi kodi avtomatik yaratiladi.</p>

        <b>🚪 Lobbiga qo'shilish:</b>
        <p style="color:#94a3b8;margin:4px 0 12px;">Ismingizni kiriting → "Lobbiga Kirish" → 5 xonali kodni kiriting.</p>

        <b>🔄 O'yindan chiqqanda:</b>
        <p style="color:#94a3b8;margin:4px 0 12px;">Ismingiz va lobbi kodini kiriting → "Qayta Kirish" orqali qayta ulanasiz.</p>

        <b>🌙 O'yin qoidalari:</b>
        <p style="color:#94a3b8;margin:4px 0 12px;">O‘yinda kamida 5 ta oyinchi bolishi shart.
            </br> 6 ta oyinchi bolsa 1ta Mafia 1ta Doktir.
            </br> 7 tadan 9 tagacham 2ta Mafia 1ta Doktir.
            </br> 10 tadan ko‘p 3ta Mafia 1ta Doktir</p>
            <br>
        <hr><br>

        <b>👨‍💻 Dasturchi:</b>
        <p style="color:#94a3b8;margin:4px 0 4px;">Jo‘rayev Jasur</p>
        <br>
       <a href="#" target="_blank" 
   style="color:#38bdf8;display:flex;align-items:center;gap:8px;margin-bottom:10px;text-decoration:none;">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="#38bdf8"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
    Telegram
</a>
<a href="#" target="_blank"
   style="color:#f472b6;display:flex;align-items:center;gap:8px;text-decoration:none;">
    <svg width="20" height="20" viewBox="0 0 24 24"><defs><linearGradient id="ig-gradient" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" style="stop-color:#f09433"/><stop offset="25%" style="stop-color:#e6683c"/><stop offset="50%" style="stop-color:#dc2743"/><stop offset="75%" style="stop-color:#cc2366"/><stop offset="100%" style="stop-color:#bc1888"/></linearGradient></defs><path fill="url(#ig-gradient)" d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
    Instagram
</a>

        <div style="text-align:center;margin-top:20px;">
            <button class="cmodal-btn cmodal-ok" onclick="_removeModal()" 
                    style="width:120px;">Yopish</button>
        </div>
    `;
    overlay.appendChild(box);
    document.body.appendChild(overlay);
}

// ════════════════════════════════════════
// PROFIL TUGMASI
// ════════════════════════════════════════

// Sahifa yuklanganda token bo'lsa profilni ko'rsat
(function checkProfileBtn() {
    const token = localStorage.getItem('mafia_token');
    const user  = localStorage.getItem('mafia_user');
    if (token && user) {
        try {
            const u = JSON.parse(user);
            const btn = document.getElementById('btn-profile');
            if (btn) btn.style.display = 'flex';
        } catch {}
    }
})();

function goToProfile() {
    const user = localStorage.getItem('mafia_user');
    if (!user) return;
    try {
        const u = JSON.parse(user);
        window.location.href = `profile.html?u=${encodeURIComponent(u.username)}`;
    } catch {
        window.location.href = 'profile.html';
    }
}

// Token yo'q bo'lsa ham username-input dan profil ko'rsatish
document.addEventListener('DOMContentLoaded', function() {
    // Username input o'zgarsa profil tugmasini ko'rsat
    const inp = document.getElementById('username-input');
    if (inp) {
        inp.addEventListener('input', function() {
            const btn = document.getElementById('btn-profile');
            if (!btn) return;
            if (this.value.trim().length >= 2) {
                btn.style.display = 'flex';
                btn.onclick = function() {
                    const u = inp.value.trim();
                    if (u) window.location.href = `profile.html?u=${encodeURIComponent(u)}`;
                };
            } else if (!localStorage.getItem('mafia_token')) {
                btn.style.display = 'none';
            }
        });
    }
});

// ════════════════════════════════════════════════════════════════
// CHAT — Muhokama fazasi uchun real-time chat
// ════════════════════════════════════════════════════════════════

(function initChat() {

    // ─── Rol rangini CSS class ga aylantirish ────────────────────
    function roleClass(role) {
        if (!role) return 'role-hidden';
        const r = role.toLowerCase();
        if (r.includes('don'))     return 'role-don';
        if (r.includes('mafia'))   return 'role-mafia';
        if (r === 'doctor')        return 'role-doctor';
        if (r === 'citizen')       return 'role-citizen';
        return 'role-hidden';
    }

    // ─── Xabarni render qilish ───────────────────────────────────
    function renderMsg(data) {
        const box      = document.getElementById('chat-messages');
        if (!box) return;

        const isMine   = (data.username === myUsername);
        const msgEl    = document.createElement('div');
        msgEl.className = 'chat-msg ' + (isMine ? 'chat-mine' : 'chat-other');

        // Meta: faqat ism ko'rinadi (rol tagi ko'rsatilmaydi)
        msgEl.innerHTML = `
            <div class="chat-msg-meta">
                <span class="chat-msg-author">${esc(data.username)}</span>
            </div>
            <div class="chat-msg-bubble">${esc(data.text)}</div>
        `;

        box.appendChild(msgEl);
        box.scrollTop = box.scrollHeight;

        // Eski xabarlarni tozalash (max 120 ta)
        const msgs = box.querySelectorAll('.chat-msg, .chat-system-msg');
        if (msgs.length > 120) msgs[0].remove();
    }

    // ─── System xabarini render qilish ──────────────────────────
    function renderSystem(text) {
        const box = document.getElementById('chat-messages');
        if (!box) return;
        const el = document.createElement('div');
        el.className = 'chat-system-msg';
        el.textContent = text;
        box.appendChild(el);
        box.scrollTop = box.scrollHeight;
    }

    // ─── Xabar yuborish ─────────────────────────────────────────
    function sendChatMsg() {
        var input = document.getElementById('chat-input');
        if (!input) return;
        var text = input.value.trim();
        if (!text || !myLobbyCode || !myUsername) return;
        // Faqat tanishuv va muhokama fazalarida
        var allowedPhases = ['introduction', 'discussion'];
        if (!allowedPhases.includes(gamePhase)) return;
        socket.emit('chat-message', {
            lobbyCode : myLobbyCode,
            username  : myUsername,
            text      : text
        });
        input.value = '';
        input.blur();
    }

    // ─── Yuborish tugmasi ────────────────────────────────────────
    var sendBtn = document.getElementById('chat-send-btn');
    if (sendBtn) {
        sendBtn.addEventListener('click', function(e) {
            e.preventDefault();
            sendChatMsg();
        });
        sendBtn.addEventListener('touchend', function(e) {
            e.preventDefault();
            sendChatMsg();
        });
    }

    // ─── Enter tugmasi ───────────────────────────────────────────
    var chatInput = document.getElementById('chat-input');
    if (chatInput) {
        chatInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendChatMsg();
            }
        });
        // Klaviatura chiqqanda xabarlarga scroll
        chatInput.addEventListener('focus', function() {
            setTimeout(function() {
                var box = document.getElementById('chat-messages');
                if (box) box.scrollTop = box.scrollHeight;
            }, 350);
        });
    }

    // ─── Socket: chat xabari keldi ───────────────────────────────
    socket.on('chat-message', function(data) {
        renderMsg(data);
        // Chat tab ochiq emas bo'lsa — unread badge ko'rsat
        var chatTab = document.getElementById('tab-content-chat');
        if (!chatTab || chatTab.style.display === 'none') {
            var badge = document.getElementById('chat-unread-badge');
            if (badge) {
                var count = parseInt(badge.textContent) || 0;
                badge.textContent = count + 1;
                badge.style.display = 'flex';
            }
        }
    });

    // ─── Socket: chat tarixi (lobbi ochilganda) ───────────────────
    socket.on('chat-history', function(messages) {
        var box = document.getElementById('chat-messages');
        if (!box) return;
        box.innerHTML = '';
        messages.forEach(function(m) { renderMsg(m); });
    });

    // ─── Chat panelini faza bo'yicha yangilash ───────────────────
    window.updateChatPanel = function() {
        var panel = document.getElementById('chat-panel');
        var input = document.getElementById('chat-input');
        var btn   = document.getElementById('chat-send-btn');
        var badge = document.getElementById('chat-phase-badge');
        if (!panel) return;

        var allowedPhases = ['introduction', 'discussion'];
        var isChatActive  = allowedPhases.includes(gamePhase);
        panel.style.display = 'flex';

        if (input) {
            input.disabled    = !isChatActive;
            input.placeholder = isChatActive ? 'Xabar yozing...' : '🌙 Tunda chat yopiq';
        }
        if (btn)   btn.disabled = !isChatActive;
        if (badge) {
            if (gamePhase === 'introduction') badge.textContent = '👋 Tanishuv';
            else if (gamePhase === 'discussion') badge.textContent = '☀️ Muhokama';
            else badge.textContent = '🌙 Tun';
        }

        // Mafia chat tabini ko'rsatish/yashirish
        window.updateMafiaChatTab();
    };

    // Mafia chat tabini o'yinchining roliga va fazaga qarab ko'rsatish
    window.updateMafiaChatTab = function() {
        var mafiaTab = document.getElementById('tab-btn-mafia-chat');
        if (!mafiaTab) return;

        var players = window._lastPlayers || [];
        var me = players.find(function(p) { return p.username === myUsername; });
        var myRole = me ? me.role : '';

        var isMafia = myRole && (myRole.includes('Mafia') || myRole.includes('mafia'));

        // Mafia tab — o'yin boshlangandan so'ng har doim ko'rinadi (faza farqi yo'q)
        if (isMafia && me && me.is_alive && gamePhase !== 'waiting') {
            mafiaTab.style.display = 'flex';
            // Mafia xonasiga qo'shilish (har safar faza o'zgarganda ham)
            if (myLobbyCode && myUsername) {
                socket.emit('join-mafia-room', { lobbyCode: myLobbyCode, username: myUsername });
            }
        } else {
            mafiaTab.style.display = 'none';
            var mafiaContent = document.getElementById('tab-content-mafia-chat');
            if (mafiaContent && mafiaContent.style.display === 'block') {
                switchGameTab('chat');
            }
        }
    };

})();

// ════════════════════════════════════════════════════════════════
// MAFIA CHAT — Faqat mafia rollari uchun, tun fazasida
// ════════════════════════════════════════════════════════════════

(function initMafiaChat() {

    // ─── Xabarni render qilish ───────────────────────────────────
    function renderMafiaMsg(data) {
        var box = document.getElementById('mafia-chat-messages');
        if (!box) return;

        var isMine = (data.username === myUsername);
        var msgEl  = document.createElement('div');
        msgEl.className = 'chat-msg ' + (isMine ? 'chat-mine' : 'chat-other');

        msgEl.innerHTML =
            '<div class="chat-msg-meta">' +
                '<span class="chat-msg-author">🔴 ' + esc(data.username) + '</span>' +
            '</div>' +
            '<div class="chat-msg-bubble">' + esc(data.text) + '</div>';

        box.appendChild(msgEl);
        box.scrollTop = box.scrollHeight;

        // Max 80 xabar
        var msgs = box.querySelectorAll('.chat-msg');
        if (msgs.length > 80) msgs[0].remove();
    }

    // ─── Xabar yuborish ─────────────────────────────────────────
    function sendMafiaChatMsg() {
        var input = document.getElementById('mafia-chat-input');
        if (!input) return;
        var text = input.value.trim();
        if (!text || !myLobbyCode || !myUsername) return;
        if (gamePhase === 'waiting') return; // Faqat o'yin boshlanmagan payt yopiq

        socket.emit('mafia-chat-message', {
            lobbyCode : myLobbyCode,
            username  : myUsername,
            text      : text
        });
        input.value = '';
        input.blur();
    }

    // ─── Yuborish tugmasi ────────────────────────────────────────
    var sendBtn = document.getElementById('mafia-chat-send-btn');
    if (sendBtn) {
        sendBtn.addEventListener('click', function(e) {
            e.preventDefault();
            sendMafiaChatMsg();
        });
        sendBtn.addEventListener('touchend', function(e) {
            e.preventDefault();
            sendMafiaChatMsg();
        });
    }

    // ─── Enter tugmasi ───────────────────────────────────────────
    var mafiaInput = document.getElementById('mafia-chat-input');
    if (mafiaInput) {
        mafiaInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendMafiaChatMsg();
            }
        });
        mafiaInput.addEventListener('focus', function() {
            setTimeout(function() {
                var box = document.getElementById('mafia-chat-messages');
                if (box) box.scrollTop = box.scrollHeight;
            }, 350);
        });
    }

    // ─── Socket: mafia chat xabari keldi ─────────────────────────
    socket.on('mafia-chat-message', function(data) {
        renderMafiaMsg(data);

        // Mafia chat tab ochiq emas bo'lsa — unread badge
        var mafiaTab = document.getElementById('tab-content-mafia-chat');
        if (!mafiaTab || mafiaTab.style.display === 'none') {
            var badge = document.getElementById('mafia-chat-unread-badge');
            if (badge) {
                var count = parseInt(badge.textContent) || 0;
                badge.textContent = count + 1;
                badge.style.display = 'flex';
            }
        }
    });

})();
