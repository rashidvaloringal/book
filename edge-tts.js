// ================================================================
// EDGE NATURAL TTS ENGINE - ALL BROWSERS
// ================================================================

// പബ്ലിക് API ലിങ്ക് (ഇത് വഴിയാണ് Edge Voice വരുന്നത്)
const EDGE_PROXY_URL = window.ENV_EDGE_TTS_API || "https://edge-tts-proxy.vercel.app/api/tts";

// പുതിയ വോയിസുകളുടെ ലിസ്റ്റ് (മലയാളം, അറബിക്, ഇംഗ്ലീഷ്)
const EDGE_VOICES = [
    { name: "🎤 Midhun (Natural) - മലയാളം", id: "ml-IN-MidhunNeural", lang: "ml-IN" },
    { name: "🎤 Sobhana (Natural) - മലയാളം", id: "ml-IN-SobhanaNeural", lang: "ml-IN" },
    { name: "🎤 Shakir (Natural) - العربية", id: "ar-EG-ShakirNeural", lang: "ar-EG" },
    { name: "🎤 Salma (Natural) - العربية", id: "ar-EG-SalmaNeural", lang: "ar-EG" },
    { name: "🎤 Jenny (Natural) - English", id: "en-US-JennyNeural", lang: "en-US" },
    { name: "🎤 Guy (Natural) - English", id: "en-US-GuyNeural", lang: "en-US" }
];

let edgeAudio = null;

// 1. ഡ്രോപ്പ്ഡൗൺ മെനുവിൽ പുതിയ വോയിസുകൾ കൊണ്ടുവരാൻ
function setupVoices() {
    const select = document.getElementById('optVoice');
    if (!select) return;
    const lang = document.getElementById('optAudioLang').value.split('-')[0];
    
    select.innerHTML = '';
    const filtered = EDGE_VOICES.filter(v => v.lang.startsWith(lang));
    
    filtered.forEach(v => {
        select.appendChild(new Option(v.name, v.id));
    });
}

// 2. പ്ലേ / പോസ് ബട്ടൺ കൺട്രോൾ
function togglePlay() {
    initAudioContext();
    if (isPlaying) {
        if (edgeAudio) edgeAudio.pause();
        isPlaying = false;
        updatePlayIcon();
        document.getElementById('silentAudio').pause();
    } else {
        isPlaying = true;
        updatePlayIcon();
        playAudio();
        requestWakeLock();
    }
}

// 3. ഓഡിയോ പ്ലേ ചെയ്യുന്ന പ്രധാന ഭാഗം
function playAudio() {
    if (edgeAudio) {
        edgeAudio.pause();
        edgeAudio = null;
    }

    const page = currentPages[currentPageIndex];
    if (!page) return;

    const langSet = document.getElementById('optAudioLang').value;
    let text = '', langKey = 'ml';
    
    if (langSet.startsWith('ar')) { text = page.Arabic || ''; langKey = 'ar'; }
    else if (langSet.startsWith('en')) { text = page.English || ''; langKey = 'en'; }
    else { text = page.Malayalam || ''; langKey = 'ml'; }

    text = text.replace(/<[^>]+>/g, '').trim();
    
    if (!text) {
        if (currentPageIndex < totalPages - 1) nextPage();
        else stopAudio();
        return;
    }

    spokenLang = langKey;
    document.querySelectorAll('.lang-btn').forEach(el => el.classList.remove('active'));
    document.getElementById('lang-' + langKey)?.classList.add('active');

    // സ്പീഡും വോയിസും സെറ്റ് ചെയ്യുന്നു
    const voiceId = document.getElementById('optVoice').value || 'ml-IN-MidhunNeural';
    const speed = parseFloat(document.getElementById('optSpeed').value) || 1.0;
    const ratePercent = Math.round((speed - 1.0) * 100);
    const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;

    // API ലേക്ക് കണക്ട് ചെയ്യുന്നു
    const url = `${EDGE_PROXY_URL}?text=${encodeURIComponent(text)}&voice=${voiceId}&rate=${rateStr}`;

    showLoading('🎙️ Natural Voice ലോഡ് ചെയ്യുന്നു...');
    
    edgeAudio = new Audio(url);
    
    // പാട്ട് ഓടുന്നതിനനുസരിച്ച് വാക്കുകൾ ഹൈലൈറ്റ് ചെയ്യാൻ
    edgeAudio.ontimeupdate = () => {
        if (edgeAudio.duration) {
            const progress = edgeAudio.currentTime / edgeAudio.duration;
            currentWordOffset = Math.floor(text.length * progress);
            
            if (isVisualMode) updateVisualChunk();
            else highlightCurrentWord();
            
            // പ്രോഗ്രസ് ബാർ അപ്ഡേറ്റ്
            const percent = progress * 100;
            if (STATE.mode === 'audio') document.getElementById('audioProgressBar').style.width = percent + '%';
            document.getElementById('visProgressBar').style.width = percent + '%';
        }
    };

    edgeAudio.onplay = () => {
        hideLoading();
        document.getElementById('silentAudio').play().catch(()=>{});
    };

    edgeAudio.onended = () => {
        if (isPlaying) {
            const autoNext = document.getElementById('optAutoNext')?.checked !== false;
            if (autoNext && currentPageIndex < totalPages - 1) {
                currentWordOffset = 0;
                nextPage();
            } else stopAudio();
        }
    };

    edgeAudio.onerror = () => {
        hideLoading();
        alert("ഓഡിയോ പ്ലേ ചെയ്യാൻ കഴിഞ്ഞില്ല. ഇന്റർനെറ്റ് പരിശോധിക്കുക.");
        stopAudio();
    };

    edgeAudio.play().catch(e => {
        hideLoading();
        stopAudio();
    });
}

// 4. ഓഡിയോ നിർത്താൻ
function stopAudio() {
    if (edgeAudio) {
        edgeAudio.pause();
        edgeAudio = null;
    }
    isPlaying = false;
    updatePlayIcon();
    document.getElementById('audioProgressBar').style.width = '0%';
    document.getElementById('visProgressBar').style.width = '0%';
    document.getElementById('silentAudio').pause();
    document.querySelectorAll('.word-hl, .word-hl-ar, .word-hl-ml, .word-hl-en').forEach(el => el.classList.remove('word-hl', 'word-hl-ar', 'word-hl-ml', 'word-hl-en'));
}
