// ================================================================
// EDGE NATURAL TTS MODULE - PROFESSIONAL DIGITAL READER
// Version: 2.1 - Enhanced Performance & Strict HTML Overrides
// ================================================================

// വിശ്വസനീയമായ പബ്ലിക് എഡ്ജ് TTS പ്രോക്സി എൻഡ്പോയിന്റ് 
const EDGE_PROXY_URL = window.ENV_EDGE_TTS_API || "https://edge-tts-proxy.vercel.app/api/tts";

// വോയിസ് ഡാറ്റാബേസ് (മലയാളം, അറബിക്, ഇംഗ്ലീഷ്)
const EDGE_VOICES_DATA = [
    { name: "🎤 Midhun (Natural) - മലയാളം", shortName: "ml-IN-MidhunNeural", lang: "ml-IN", gender: "Male" },
    { name: "🎤 Sobhana (Natural) - മലയാളം", shortName: "ml-IN-SobhanaNeural", lang: "ml-IN", gender: "Female" },
    { name: "🎤 Shakir (Natural) - العربية", shortName: "ar-EG-ShakirNeural", lang: "ar-EG", gender: "Male" },
    { name: "🎤 Salma (Natural) - العربية", shortName: "ar-EG-SalmaNeural", lang: "ar-EG", gender: "Female" },
    { name: "🎤 Zariyah (Natural) - العربية", shortName: "ar-SA-ZariyahNeural", lang: "ar-SA", gender: "Female" },
    { name: "🎤 Hamed (Natural) - العربية", shortName: "ar-SA-HamedNeural", lang: "ar-SA", gender: "Male" },
    { name: "🎤 Jenny (Natural) - English", shortName: "en-US-JennyNeural", lang: "en-US", gender: "Female" },
    { name: "🎤 Andrew (Natural) - English", shortName: "en-US-AndrewNeural", lang: "en-US", gender: "Male" }
];

let edgeAudioNode = null;
let edgeProgressInterval = null;
let edgeIsPlaying = false;

// ================================================================
// OVERRIDE: setupVoices - Dropdown എഡ്ജ് വോയിസുകൾ കൊണ്ട് നിറയ്ക്കുന്നു
// ================================================================
window.setupVoices = function() {
    const select = document.getElementById('optVoice');
    if (!select) return;

    const lang = document.getElementById('optAudioLang')?.value || 'ml-IN';
    const langPrefix = lang.split('-')[0];
    const filtered = EDGE_VOICES_DATA.filter(v => v.lang.startsWith(langPrefix));

    select.innerHTML = '';

    if (filtered.length > 0) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = '⭐ Edge Natural Voices';
        filtered.forEach(v => {
            const option = document.createElement('option');
            option.value = v.shortName;
            option.textContent = `${v.name} (${v.gender})`;
            optgroup.appendChild(option);
        });
        select.appendChild(optgroup);

        if (!select.value || !filtered.find(v => v.shortName === select.value)) {
            select.value = filtered[0].shortName;
        }
    }
};

// ================================================================
// OVERRIDE: togglePlay
// ================================================================
window.togglePlay = function() {
    initAudioContext();
    if (edgeIsPlaying) {
        if (edgeAudioNode) edgeAudioNode.pause();
        edgeIsPlaying = false;
        isPlaying = false;
        if (window.updatePlayIcon) window.updatePlayIcon();
        document.getElementById('silentAudio')?.pause();
    } else {
        edgeIsPlaying = true;
        isPlaying = true;
        if (window.updatePlayIcon) window.updatePlayIcon();
        window.playAudio();
        if (window.requestWakeLock) window.requestWakeLock();
    }
};

// ================================================================
// OVERRIDE: playAudio - Edge API ലേക്ക് ഓഡിയോ സ്ട്രീം കണക്ട് ചെയ്യുന്നു
// ================================================================
window.playAudio = function() {
    if (edgeAudioNode) {
        edgeAudioNode.pause();
        edgeAudioNode.src = '';
        edgeAudioNode = null;
    }
    if (edgeProgressInterval) clearInterval(edgeProgressInterval);

    const page = window.currentPages?.[window.currentPageIndex];
    if (!page) {
        if (window.nextPage) window.nextPage();
        return;
    }

    const lang = document.getElementById('optAudioLang')?.value || 'ml-IN';
    let text = '';
    let langKey = 'ml';

    if (lang === 'ar-EG') {
        text = page.Arabic || '';
        langKey = 'ar';
    } else if (lang === 'en-US') {
        text = page.English || '';
        langKey = 'en';
    } else {
        text = page.Malayalam || '';
        langKey = 'ml';
    }

    text = text.replace(/<[^>]+>/g, '').trim();
    if (!text) {
        if (window.currentPageIndex < window.totalPages - 1) window.nextPage();
        else window.stopAudio();
        return;
    }

    window.spokenLang = langKey;
    document.querySelectorAll('.lang-btn').forEach(el => el.classList.remove('active'));
    document.getElementById('lang-' + langKey)?.classList.add('active');

    const voice = document.getElementById('optVoice')?.value || 'ml-IN-MidhunNeural';
    const speed = parseFloat(document.getElementById('optSpeed')?.value) || 1.0;
    const ratePercent = Math.round((speed - 1.0) * 100);
    const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;

    const audioUrl = `${EDGE_PROXY_URL}?text=${encodeURIComponent(text)}&voice=${voice}&rate=${rateStr}&pitch=+0Hz`;

    if (window.showLoading) window.showLoading('🎙️ Edge Natural Voice ലോഡ് ചെയ്യുന്നു...');

    edgeAudioNode = new Audio(audioUrl);
    edgeAudioNode.preload = 'auto';

    // Word Highlighting അൽഗോരിതം (TimeUpdate എമുലേഷൻ)
    const words = text.split(/\s+/);
    let lastWordIdx = -1;

    edgeAudioNode.ontimeupdate = function() {
        if (edgeAudioNode && edgeAudioNode.duration && !isNaN(edgeAudioNode.duration)) {
            const ratio = Math.min(edgeAudioNode.currentTime / edgeAudioNode.duration, 0.99);
            let wordIndex = Math.floor(words.length * ratio);
            
            if (wordIndex >= words.length) wordIndex = words.length - 1;

            if (wordIndex !== lastWordIdx) {
                lastWordIdx = wordIndex;
                let offset = words.slice(0, wordIndex).join(' ').length + (wordIndex > 0 ? 1 : 0);
                window.currentWordOffset = offset;

                if (window.isVisualMode && window.updateVisualChunk) window.updateVisualChunk();
                else if (window.highlightCurrentWord) window.highlightCurrentWord();
                if (window.saveProgress) window.saveProgress();
            }
        }
    };

    edgeProgressInterval = setInterval(() => {
        if (edgeAudioNode && !edgeAudioNode.paused && edgeAudioNode.duration) {
            const progress = (edgeAudioNode.currentTime / edgeAudioNode.duration) * 100;
            if (window.STATE?.mode === 'audio') {
                const pBar = document.getElementById('audioProgressBar');
                if (pBar) pBar.style.width = progress + '%';
            }
            const vBar = document.getElementById('visProgressBar');
            if (vBar) vBar.style.width = progress + '%';
        }
    }, 150);

    edgeAudioNode.onplay = function() {
        edgeIsPlaying = true;
        isPlaying = true;
        if (window.hideLoading) window.hideLoading();
        document.getElementById('silentAudio')?.play().catch(() => {});
    };

    edgeAudioNode.onended = function() {
        edgeIsPlaying = false;
        isPlaying = false;
        if (window.updatePlayIcon) window.updatePlayIcon();
        if (document.getElementById('optAutoNext')?.checked !== false && window.currentPageIndex < window.totalPages - 1) {
            window.currentWordOffset = 0;
            window.nextPage();
        } else {
            window.stopAudio();
        }
    };

    edgeAudioNode.onerror = () => {
        if (window.hideLoading) window.hideLoading();
        fallbackSystemTTS(text, lang);
    };

    edgeAudioNode.play().catch(() => {
        if (window.hideLoading) window.hideLoading();
        fallbackSystemTTS(text, lang);
    });
};

// ================================================================
// OVERRIDE: stopAudio
// ================================================================
window.stopAudio = function() {
    if (edgeAudioNode) {
        edgeAudioNode.pause();
        edgeAudioNode = null;
    }
    edgeIsPlaying = false;
    isPlaying = false;
    if (window.updatePlayIcon) window.updatePlayIcon();
    if (edgeProgressInterval) clearInterval(edgeProgressInterval);

    const aBar = document.getElementById('audioProgressBar');
    if (aBar) aBar.style.width = '0%';
    const vBar = document.getElementById('visProgressBar');
    if (vBar) vBar.style.width = '0%';
    
    document.getElementById('silentAudio')?.pause();
    document.querySelectorAll('.word-hl, .word-hl-ar, .word-hl-ml, .word-hl-en').forEach(el => el.classList.remove('word-hl', 'word-hl-ar', 'word-hl-ml', 'word-hl-en'));
};

function fallbackSystemTTS(text, lang) {
    if (!window.synth) return;
    window.synth.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lang;
    utter.onend = () => { if (edgeIsPlaying && window.currentPageIndex < window.totalPages - 1) window.nextPage(); else window.stopAudio(); };
    window.synth.speak(utter);
}

function initEdgeTTS() {
    let retries = 0;
    const check = setInterval(() => {
        if (document.getElementById('optVoice') && document.getElementById('optAudioLang')) {
            window.setupVoices();
            clearInterval(check);
        }
        if (++retries > 15) clearInterval(check);
    }, 300);
}
document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', initEdgeTTS) : initEdgeTTS();
