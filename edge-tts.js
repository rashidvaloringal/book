// ================================================================
// EDGE NATURAL TTS - WITH POST REQUEST (Fixes 414 Error)
// ================================================================

const EDGE_VOICES = [
    { name: "🎤 Midhun - മലയാളം", id: "ml-IN-MidhunNeural", lang: "ml-IN" },
    { name: "🎤 Sobhana - മലയാളം", id: "ml-IN-SobhanaNeural", lang: "ml-IN" },
    { name: "🎤 Shakir - العربية", id: "ar-EG-ShakirNeural", lang: "ar-EG" },
    { name: "🎤 Salma - العربية", id: "ar-EG-SalmaNeural", lang: "ar-EG" },
    { name: "🎤 Zariyah - العربية", id: "ar-SA-ZariyahNeural", lang: "ar-SA" },
    { name: "🎤 Hamed - العربية", id: "ar-SA-HamedNeural", lang: "ar-SA" },
    { name: "🎤 Jenny - English (US)", id: "en-US-JennyNeural", lang: "en-US" },
    { name: "🎤 Andrew - English (US)", id: "en-US-AndrewNeural", lang: "en-US" },
    { name: "🎤 Neerja - Indian English", id: "en-IN-NeerjaNeural", lang: "en-IN" },
    { name: "🎤 Prabhat - Indian English", id: "en-IN-PrabhatNeural", lang: "en-IN" }
];

const EDGE_API = "https://edge-tts-proxy.vercel.app/api/tts";
let edgeAudio = null;

// ================================================================
// OVERRIDE: setupVoices
// ================================================================
const _origSetup = window.setupVoices || function(){};

window.setupVoices = function() {
    const select = document.getElementById('optVoice');
    if (!select) return;
    
    const lang = document.getElementById('optAudioLang')?.value || 'ml-IN';
    const prefix = lang.split('-')[0];
    
    select.innerHTML = '';
    const filtered = EDGE_VOICES.filter(v => v.lang.startsWith(prefix));
    
    if (filtered.length > 0) {
        const group = document.createElement('optgroup');
        group.label = '⭐ Edge Natural Voices';
        filtered.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v.id;
            opt.textContent = v.name;
            group.appendChild(opt);
        });
        select.appendChild(group);
        if (!select.value) select.value = filtered[0].id;
    }
    if (_origSetup) _origSetup();
};

// ================================================================
// OVERRIDE: togglePlay
// ================================================================
const _origToggle = window.togglePlay || function(){};

window.togglePlay = function() {
    if (typeof initAudioContext === 'function') initAudioContext();
    
    if (window.isPlaying) {
        if (edgeAudio) edgeAudio.pause();
        window.isPlaying = false;
        if (window.updatePlayIcon) window.updatePlayIcon();
        document.getElementById('silentAudio')?.pause();
        if (window.audioProgressInterval) {
            clearInterval(window.audioProgressInterval);
            window.audioProgressInterval = null;
        }
    } else {
        window.isPlaying = true;
        if (window.updatePlayIcon) window.updatePlayIcon();
        if (window.playAudio) window.playAudio();
        if (window.requestWakeLock) window.requestWakeLock();
    }
};

// ================================================================
// OVERRIDE: playAudio - WITH POST
// ================================================================
const _origPlay = window.playAudio || function(){};

window.playAudio = function() {
    if (edgeAudio) {
        edgeAudio.pause();
        edgeAudio = null;
    }
    
    const page = window.currentPages?.[window.currentPageIndex];
    if (!page) {
        if (window.nextPage) window.nextPage();
        return;
    }
    
    const lang = document.getElementById('optAudioLang')?.value || 'ml-IN';
    let text = '', langKey = 'ml';
    
    if (lang.startsWith('ar')) { 
        text = page.Arabic || ''; 
        langKey = 'ar'; 
    } else if (lang.startsWith('en')) { 
        text = page.English || ''; 
        langKey = 'en'; 
    } else { 
        text = page.Malayalam || ''; 
        langKey = 'ml'; 
    }
    
    text = text.replace(/<[^>]+>/g, '').trim();
    
    if (!text) {
        if (window.currentPageIndex < window.totalPages - 1) {
            if (window.nextPage) window.nextPage();
        } else {
            if (window.stopAudio) window.stopAudio();
        }
        return;
    }
    
    window.spokenLang = langKey;
    document.querySelectorAll('.lang-btn').forEach(el => el.classList.remove('active'));
    document.getElementById('lang-' + langKey)?.classList.add('active');
    
    const voice = document.getElementById('optVoice')?.value || 'ml-IN-MidhunNeural';
    const speed = parseFloat(document.getElementById('optSpeed')?.value) || 1.0;
    const rate = Math.round((speed - 1) * 100);
    const rateStr = rate >= 0 ? `+${rate}%` : `${rate}%`;
    
    if (window.showLoading) window.showLoading('🎙️ Edge Natural Voice ലോഡ് ചെയ്യുന്നു...');
    
    // POST request to avoid 414 error
    fetch(EDGE_API, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            text: text,
            voice: voice,
            rate: rateStr,
            pitch: '+0%'
        })
    })
    .then(response => {
        if (!response.ok) throw new Error('Network response was not ok: ' + response.status);
        return response.blob();
    })
    .then(blob => {
        if (window.hideLoading) window.hideLoading();
        const audioUrl = URL.createObjectURL(blob);
        edgeAudio = new Audio(audioUrl);
        
        edgeAudio.ontimeupdate = function() {
            if (edgeAudio?.duration) {
                const progress = edgeAudio.currentTime / edgeAudio.duration;
                window.currentWordOffset = Math.floor(text.length * progress);
                
                if (window.isVisualMode) {
                    if (window.updateVisualChunk) window.updateVisualChunk();
                } else {
                    if (window.highlightCurrentWord) window.highlightCurrentWord();
                }
                
                const pct = progress * 100;
                const bar1 = document.getElementById('audioProgressBar');
                const bar2 = document.getElementById('visProgressBar');
                if (bar1) bar1.style.width = pct + '%';
                if (bar2) bar2.style.width = pct + '%';
            }
        };
        
        edgeAudio.onplay = function() {
            document.getElementById('silentAudio')?.play().catch(() => {});
            localStorage.setItem('last_played_book_id', window.currentBookId);
            const book = window.allBooks?.find(b => b.id === window.currentBookId);
            if (book) {
                localStorage.setItem('last_played_book_title', book.title_ml || book.title_ar || 'Book');
            }
        };
        
        edgeAudio.onended = function() {
            if (window.isPlaying) {
                const autoNext = document.getElementById('optAutoNext')?.checked !== false;
                if (autoNext && window.currentPageIndex < window.totalPages - 1) {
                    window.currentWordOffset = 0;
                    if (window.nextPage) window.nextPage();
                } else {
                    if (window.stopAudio) window.stopAudio();
                }
            }
        };
        
        edgeAudio.onerror = function() {
            if (window.hideLoading) window.hideLoading();
            if (_origPlay) _origPlay();
        };
        
        edgeAudio.play().catch(() => {
            if (window.hideLoading) window.hideLoading();
            if (_origPlay) _origPlay();
        });
    })
    .catch(error => {
        console.error('Edge TTS Error:', error);
        if (window.hideLoading) window.hideLoading();
        if (_origPlay) _origPlay();
    });
};

// ================================================================
// OVERRIDE: stopAudio
// ================================================================
const _origStop = window.stopAudio || function(){};

window.stopAudio = function() {
    if (edgeAudio) {
        edgeAudio.pause();
        edgeAudio = null;
    }
    window.isPlaying = false;
    if (window.updatePlayIcon) window.updatePlayIcon();
    
    if (window.audioProgressInterval) {
        clearInterval(window.audioProgressInterval);
        window.audioProgressInterval = null;
    }
    
    const bar1 = document.getElementById('audioProgressBar');
    const bar2 = document.getElementById('visProgressBar');
    if (bar1) bar1.style.width = '0%';
    if (bar2) bar2.style.width = '0%';
    
    document.getElementById('silentAudio')?.pause();
    
    if (window.wakeLock) {
        window.wakeLock.release().catch(() => {});
        window.wakeLock = null;
    }
    
    document.querySelectorAll('.word-hl, .word-hl-ar, .word-hl-ml, .word-hl-en').forEach(el => {
        el.classList.remove('word-hl', 'word-hl-ar', 'word-hl-ml', 'word-hl-en');
    });
    
    if (_origStop) _origStop();
};

// ================================================================
// OVERRIDE: setSpokenLang
// ================================================================
const _origSetLang = window.setSpokenLang || function(){};

window.setSpokenLang = function(lang) {
    if (_origSetLang) _origSetLang(lang);
    setTimeout(() => {
        if (window.setupVoices) window.setupVoices();
    }, 100);
};

// ================================================================
// OVERRIDE: applyAudioSettings
// ================================================================
const _origApply = window.applyAudioSettings || function(){};

window.applyAudioSettings = function(restart) {
    if (_origApply) _origApply(restart);
    if (restart) {
        if (window.setupVoices) window.setupVoices();
        if (window.isPlaying) {
            if (window.playAudio) window.playAudio();
        }
    }
};

// Initialize
setTimeout(() => {
    if (window.setupVoices) window.setupVoices();
    console.log('✅ Edge Natural TTS Loaded!');
    console.log('🔊 Available Voices:', EDGE_VOICES.length);
}, 500);

console.log('🎤 Edge TTS with POST - Ready!');