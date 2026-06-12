// Constants for presets
const PRESETS = {
    youtube: 10000,
    discord: 2000,
    twitter: 280,
    instagram: 2200,
    reddit: 40000,
    custom: 500
};

// Storage keys
const STORAGE_KEYS = {
    TEXT: 'textsplit_text',
    PRESET: 'textsplit_preset',
    LIMIT: 'textsplit_limit',
    SUFFIX_FORMAT: 'textsplit_suffix_format',
    SUFFIX_POSITION: 'textsplit_suffix_position',
    SMART_SPLIT: 'textsplit_smart_split',
    TRIM: 'textsplit_trim',
    THEME: 'textsplit_theme'
};

// DOM Elements
const elements = {
    themeToggle: document.getElementById('themeToggle'),
    clearInput: document.getElementById('clearInput'),
    textInput: document.getElementById('textInput'),
    charCount: document.getElementById('charCount'),
    wordCount: document.getElementById('wordCount'),
    presetSelect: document.getElementById('presetSelect'),
    customLimitContainer: document.getElementById('customLimitContainer'),
    customLimit: document.getElementById('customLimit'),
    suffixFormat: document.getElementById('suffixFormat'),
    suffixPosition: document.getElementById('suffixPosition'),
    smartSplit: document.getElementById('smartSplit'),
    trimSegments: document.getElementById('trimSegments'),
    copyNextBtn: document.getElementById('copyNextBtn'),
    copyAllBtn: document.getElementById('copyAllBtn'),
    outputStats: document.getElementById('outputStats'),
    statSegments: document.getElementById('statSegments'),
    statChars: document.getElementById('statChars'),
    statNextCopy: document.getElementById('statNextCopy'),
    emptyState: document.getElementById('emptyState'),
    segmentsList: document.getElementById('segmentsList')
};

// Application State
let state = {
    text: '',
    preset: 'custom',
    limit: 500,
    suffixFormat: 'parentheses',
    suffixPosition: 'end',
    smartSplit: true,
    trimSegments: true,
    theme: 'dark',
    segments: [],
    copiedStates: [], // Tracks boolean copy states per segment index
    activeCopyIndex: 0 // Index of the next segment to copy
};

// Initialize App
function init() {
    loadSettings();
    setupEventListeners();
    applyTheme();
    updateUIForPreset();
    processText();
}

// Load configurations from LocalStorage
function loadSettings() {
    state.text = localStorage.getItem(STORAGE_KEYS.TEXT) || '';
    state.preset = localStorage.getItem(STORAGE_KEYS.PRESET) || 'custom';
    state.limit = parseInt(localStorage.getItem(STORAGE_KEYS.LIMIT), 10) || 500;
    state.suffixFormat = localStorage.getItem(STORAGE_KEYS.SUFFIX_FORMAT) || 'parentheses';
    state.suffixPosition = localStorage.getItem(STORAGE_KEYS.SUFFIX_POSITION) || 'end';
    
    // Checkbox parsing
    const storedSmartSplit = localStorage.getItem(STORAGE_KEYS.SMART_SPLIT);
    state.smartSplit = storedSmartSplit !== null ? storedSmartSplit === 'true' : true;
    
    const storedTrim = localStorage.getItem(STORAGE_KEYS.TRIM);
    state.trimSegments = storedTrim !== null ? storedTrim === 'true' : true;
    
    // Theme loading (default dark, respect system if no local storage)
    const storedTheme = localStorage.getItem(STORAGE_KEYS.THEME);
    if (storedTheme) {
        state.theme = storedTheme;
    } else {
        const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
        state.theme = prefersLight ? 'light' : 'dark';
    }

    // Populate inputs with state
    elements.textInput.value = state.text;
    elements.presetSelect.value = state.preset;
    elements.customLimit.value = state.limit;
    elements.suffixFormat.value = state.suffixFormat;
    elements.suffixPosition.value = state.suffixPosition;
    elements.smartSplit.checked = state.smartSplit;
    elements.trimSegments.checked = state.trimSegments;
}

// Save options to LocalStorage
function saveSetting(key, value) {
    localStorage.setItem(key, value);
}

// Apply theme to HTML tag
function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    saveSetting(STORAGE_KEYS.THEME, state.theme);
}

// Toggle theme
function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme();
}

// Adjust UI fields depending on preset selection
function updateUIForPreset() {
    const selectedPreset = elements.presetSelect.value;
    state.preset = selectedPreset;
    saveSetting(STORAGE_KEYS.PRESET, selectedPreset);

    if (selectedPreset !== 'custom') {
        state.limit = PRESETS[selectedPreset];
        elements.customLimit.value = state.limit;
    } else {
        state.limit = parseInt(elements.customLimit.value, 10) || 500;
    }
    saveSetting(STORAGE_KEYS.LIMIT, state.limit);
}

// Get the formatting suffix
function getSuffix(index, total, format, position) {
    if (format === 'none') return '';
    let suffix = '';
    switch (format) {
        case 'parentheses':
            suffix = `(${index}/${total})`;
            break;
        case 'brackets':
            suffix = `[${index}/${total}]`;
            break;
        case 'slash':
            suffix = `${index}/${total}`;
            break;
        case 'text':
            suffix = `Part ${index} of ${total}`;
            break;
        default:
            return '';
    }
    return position === 'start' ? suffix + ' ' : ' ' + suffix;
}

// Main splitting logic
function splitTextIntoSegments(text, limit, options) {
    const { smartSplit, trim, suffixFormat, suffixPosition } = options;
    if (!text || text.trim() === '') return [];

    // N is our estimate of total pages
    let N = Math.ceil(text.length / limit) || 1;
    let segments = [];
    let iterations = 0;
    const maxIterations = 8; // Prevent infinite loops

    while (iterations < maxIterations) {
        segments = [];
        let index = 0;
        let segmentIndex = 1;

        while (index < text.length) {
            // Find suffix size for this segment
            const dummySuffix = getSuffix(segmentIndex, N, suffixFormat, suffixPosition);
            const suffixLen = dummySuffix.length;
            const budget = limit - suffixLen;

            // Edge case: if limit is too small, print warning or fallback
            if (budget <= 5) {
                // Fallback: split by character limit without suffix
                let fallbackSegments = [];
                let i = 0;
                while (i < text.length) {
                    fallbackSegments.push(text.substring(i, i + limit));
                    i += limit;
                }
                return fallbackSegments;
            }

            let endIdx = index + budget;
            if (endIdx >= text.length) {
                segments.push(text.substring(index));
                break;
            }

            let candidate = text.substring(index, endIdx);

            if (smartSplit) {
                // Determine if we can split at a word boundary
                const nextChar = text.charAt(endIdx);
                const isNextWhitespace = /\s/.test(nextChar);

                // If next character is whitespace, we split perfectly here
                if (!isNextWhitespace) {
                    // Search backwards in candidate for a whitespace character
                    let lastSpace = -1;
                    for (let i = candidate.length - 1; i >= 0; i--) {
                        if (/\s/.test(candidate.charAt(i))) {
                            lastSpace = i;
                            break;
                        }
                    }

                    // Only split if the space isn't too far back (limit boundary shrink)
                    // We only back-track up to 35% of the segment budget to avoid overly tiny slices
                    if (lastSpace > budget * 0.65) {
                        endIdx = index + lastSpace;
                    } else {
                        // If no space, look for punctuation (. , ! ? ; -)
                        let lastPunct = -1;
                        const punctRegex = /[.,!?;-]/;
                        for (let i = candidate.length - 1; i >= 0; i--) {
                            if (punctRegex.test(candidate.charAt(i))) {
                                lastPunct = i;
                                break;
                            }
                        }
                        if (lastPunct > budget * 0.7) {
                            endIdx = index + lastPunct + 1; // Split after the punctuation mark
                        }
                        // Fall back to cutting mid-word if no space or punctuation fits the boundary window
                    }
                }
            }

            let segmentText = text.substring(index, endIdx);
            segments.push(segmentText);
            index = endIdx;
            segmentIndex++;
        }

        // If the number of segments matches our N assumption, we've stabilized
        if (segments.length === N) {
            break;
        } else {
            N = segments.length;
            iterations++;
        }
    }

    // Apply suffixes and optionally trim spaces from final slices
    return segments.map((seg, idx) => {
        let cleanSeg = trim ? seg.trim() : seg;
        const suffix = getSuffix(idx + 1, segments.length, suffixFormat, suffixPosition);
        
        if (suffixPosition === 'start') {
            return suffix + cleanSeg;
        } else {
            return cleanSeg + suffix;
        }
    });
}

// Live process input text
function processText() {
    state.text = elements.textInput.value;
    saveSetting(STORAGE_KEYS.TEXT, state.text);

    // Update character and word count indicators
    const totalChars = state.text.length;
    const totalWords = state.text.trim() === '' ? 0 : state.text.trim().split(/\s+/).length;
    elements.charCount.textContent = `${totalChars.toLocaleString()} character${totalChars === 1 ? '' : 's'}`;
    elements.wordCount.textContent = `${totalWords.toLocaleString()} word${totalWords === 1 ? '' : 's'}`;

    if (state.text.trim() === '') {
        // Show empty state
        elements.emptyState.classList.remove('hidden');
        elements.outputStats.classList.add('hidden');
        elements.segmentsList.innerHTML = '';
        
        elements.copyAllBtn.classList.add('disabled');
        elements.copyNextBtn.classList.add('disabled');
        state.segments = [];
        state.copiedStates = [];
        state.activeCopyIndex = 0;
        return;
    }

    elements.emptyState.classList.add('hidden');
    elements.outputStats.classList.remove('hidden');
    elements.copyAllBtn.classList.remove('disabled');
    elements.copyNextBtn.classList.remove('disabled');

    // Run splitting
    const splitOptions = {
        smartSplit: state.smartSplit,
        trim: state.trimSegments,
        suffixFormat: state.suffixFormat,
        suffixPosition: state.suffixPosition
    };

    const newSegments = splitTextIntoSegments(state.text, state.limit, splitOptions);
    
    // Check if segment structure changed (to avoid wiping copy states if same length)
    if (newSegments.length !== state.segments.length) {
        state.copiedStates = new Array(newSegments.length).fill(false);
        state.activeCopyIndex = 0;
    }
    
    state.segments = newSegments;
    renderSegments();
    updateStats();
}

// Redraw segments UI list
function renderSegments() {
    elements.segmentsList.innerHTML = '';
    
    state.segments.forEach((segment, index) => {
        const isCopied = state.copiedStates[index];
        const isActive = index === state.activeCopyIndex && !isCopied && state.copiedStates.includes(false);

        const card = document.createElement('div');
        card.className = `segment-card${isCopied ? ' copied' : ''}${isActive ? ' active-copy' : ''}`;
        card.setAttribute('data-index', index);

        // Calculate visual preview metrics
        const cardHeader = document.createElement('div');
        cardHeader.className = 'segment-card-header';
        
        const badge = document.createElement('span');
        badge.className = 'segment-badge';
        badge.textContent = `Segment ${index + 1} of ${state.segments.length}`;
        
        const meta = document.createElement('span');
        meta.className = 'segment-meta';
        meta.textContent = `${segment.length} Chars`;

        cardHeader.appendChild(badge);
        cardHeader.appendChild(meta);

        const textDiv = document.createElement('div');
        textDiv.className = 'segment-text';
        textDiv.textContent = segment;

        const copyBtn = document.createElement('button');
        copyBtn.className = 'segment-btn-copy';
        copyBtn.setAttribute('aria-label', `Copy segment ${index + 1}`);
        
        const copyIcon = isCopied 
            ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon-sm"><polyline points="20 6 9 17 4 12"></polyline></svg>` 
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon-sm"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;

        copyBtn.innerHTML = `${copyIcon} ${isCopied ? 'Copied' : 'Copy'}`;
        copyBtn.addEventListener('click', () => copySegment(index, copyBtn));

        card.appendChild(cardHeader);
        card.appendChild(textDiv);
        card.appendChild(copyBtn);
        elements.segmentsList.appendChild(card);
    });
}

// Update the output header metrics
function updateStats() {
    elements.statSegments.textContent = state.segments.length;
    
    let totalLength = state.segments.reduce((acc, seg) => acc + seg.length, 0);
    elements.statChars.textContent = totalLength.toLocaleString();

    // Determine what is next in sequential copying queue
    const nextUncopied = state.copiedStates.indexOf(false);
    if (nextUncopied !== -1) {
        state.activeCopyIndex = nextUncopied;
        elements.statNextCopy.textContent = `Part ${nextUncopied + 1}`;
        elements.copyNextBtn.classList.remove('disabled');
    } else {
        state.activeCopyIndex = -1;
        elements.statNextCopy.textContent = 'Done!';
        elements.copyNextBtn.classList.add('disabled');
    }
}

// Single Segment Copy Handler
function copySegment(index, buttonElement = null) {
    if (index < 0 || index >= state.segments.length) return;
    const textToCopy = state.segments[index];

    copyToClipboard(textToCopy).then(() => {
        state.copiedStates[index] = true;
        
        // Find next copy item
        const nextUncopied = state.copiedStates.indexOf(false);
        state.activeCopyIndex = nextUncopied;

        // Perform temporary UI feedback on clicked button if provided
        if (buttonElement) {
            const originalHTML = buttonElement.innerHTML;
            buttonElement.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon-sm"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!`;
            buttonElement.style.borderColor = 'var(--success-solid)';
            buttonElement.style.color = 'var(--success-solid)';
            buttonElement.style.background = 'var(--success-glow)';

            setTimeout(() => {
                renderSegments();
                updateStats();
            }, 1000);
        } else {
            renderSegments();
            updateStats();
        }
    }).catch(err => {
        console.error('Clipboard copy failed: ', err);
    });
}

// Copy Next Segment queue runner
function copyNext() {
    if (state.activeCopyIndex !== -1) {
        // Find the button inside the segments-list and click/animate it
        const card = elements.segmentsList.querySelector(`.segment-card[data-index="${state.activeCopyIndex}"]`);
        if (card) {
            const btn = card.querySelector('.segment-btn-copy');
            copySegment(state.activeCopyIndex, btn);
            
            // Scroll to the active card
            card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
}

// Copy all segments separated by double newlines
function copyAll() {
    if (state.segments.length === 0) return;
    const allText = state.segments.join('\n\n');

    copyToClipboard(allText).then(() => {
        // Mark all as copied
        state.copiedStates.fill(true);
        state.activeCopyIndex = -1;
        renderSegments();
        updateStats();

        // Animate Button state
        const originalHTML = elements.copyAllBtn.innerHTML;
        elements.copyAllBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon-sm"><polyline points="20 6 9 17 4 12"></polyline></svg> All Copied!`;
        elements.copyAllBtn.classList.add('btn-success');
        
        setTimeout(() => {
            elements.copyAllBtn.innerHTML = originalHTML;
            elements.copyAllBtn.classList.remove('btn-success');
        }, 1500);
    }).catch(err => {
        console.error('Failed copying all: ', err);
    });
}

// Cross-browser Clipboard Copy implementation
function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text);
    } else {
        // Fallback for older browsers or non-HTTPS locales
        return new Promise((resolve, reject) => {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                const successful = document.execCommand('copy');
                document.body.removeChild(textarea);
                if (successful) {
                    resolve();
                } else {
                    reject(new Error('execCommand failed'));
                }
            } catch (err) {
                document.body.removeChild(textarea);
                reject(err);
            }
        });
    }
}

// Auto-apply browser language to a modal
// If browser language is German, show DE section; otherwise show EN
function autoApplyBrowserLang(modal) {
    const isGerman = navigator.language && navigator.language.toLowerCase().startsWith('de');
    const enBlock = modal.querySelector('.lang-en');
    const deBlock = modal.querySelector('.lang-de');
    const toggleBtn = modal.querySelector('.lang-modal-toggle');

    if (isGerman) {
        enBlock.style.setProperty('display', 'none', 'important');
        deBlock.style.setProperty('display', 'flex', 'important');
        toggleBtn.classList.add('de-active');
        toggleBtn.textContent = 'EN';
    } else {
        enBlock.style.setProperty('display', 'flex', 'important');
        deBlock.style.setProperty('display', 'none', 'important');
        toggleBtn.classList.remove('de-active');
        toggleBtn.textContent = 'DE';
    }
}

// Setup Event Listeners
function setupEventListeners() {
    // Theme toggle
    elements.themeToggle.addEventListener('click', toggleTheme);

    // Text inputs
    elements.textInput.addEventListener('input', processText);
    
    // Clear Input
    elements.clearInput.addEventListener('click', () => {
        elements.textInput.value = '';
        processText();
        elements.textInput.focus();
    });

    // Preset changes
    elements.presetSelect.addEventListener('change', () => {
        updateUIForPreset();
        processText();
    });

    // Custom limit manual adjusts
    elements.customLimit.addEventListener('input', () => {
        state.limit = parseInt(elements.customLimit.value, 10) || 500;
        saveSetting(STORAGE_KEYS.LIMIT, state.limit);
        
        // If the number matches a preset, we select that preset, otherwise select custom
        let matchedPreset = 'custom';
        for (const [key, val] of Object.entries(PRESETS)) {
            if (key !== 'custom' && val === state.limit) {
                matchedPreset = key;
                break;
            }
        }
        
        if (elements.presetSelect.value !== matchedPreset) {
            elements.presetSelect.value = matchedPreset;
            state.preset = matchedPreset;
            saveSetting(STORAGE_KEYS.PRESET, matchedPreset);
        }
        
        processText();
    });

    // Suffix format updates
    elements.suffixFormat.addEventListener('change', () => {
        state.suffixFormat = elements.suffixFormat.value;
        saveSetting(STORAGE_KEYS.SUFFIX_FORMAT, state.suffixFormat);
        processText();
    });

    // Suffix position updates
    elements.suffixPosition.addEventListener('change', () => {
        state.suffixPosition = elements.suffixPosition.value;
        saveSetting(STORAGE_KEYS.SUFFIX_POSITION, state.suffixPosition);
        processText();
    });

    // Smart split toggles
    elements.smartSplit.addEventListener('change', () => {
        state.smartSplit = elements.smartSplit.checked;
        saveSetting(STORAGE_KEYS.SMART_SPLIT, state.smartSplit);
        processText();
    });

    // Trim whitespace toggles
    elements.trimSegments.addEventListener('change', () => {
        state.trimSegments = elements.trimSegments.checked;
        saveSetting(STORAGE_KEYS.TRIM, state.trimSegments);
        processText();
    });

    // Button actions
    elements.copyNextBtn.addEventListener('click', copyNext);
    elements.copyAllBtn.addEventListener('click', copyAll);

    // Legal notice modals
    const impressumModal = document.getElementById('impressumModal');
    const datenschutzModal = document.getElementById('datenschutzModal');
    const impressumLink = document.getElementById('impressumLink');
    const datenschutzLink = document.getElementById('datenschutzLink');

    if (impressumLink && impressumModal) {
        impressumLink.addEventListener('click', (e) => {
            e.preventDefault();
            impressumModal.showModal();
            autoApplyBrowserLang(impressumModal);
        });
    }

    if (datenschutzLink && datenschutzModal) {
        datenschutzLink.addEventListener('click', (e) => {
            e.preventDefault();
            datenschutzModal.showModal();
            autoApplyBrowserLang(datenschutzModal);
        });
    }

    // Close buttons on dialogs
    document.querySelectorAll('dialog .close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('dialog').close();
        });
    });

    // DE / EN language toggles inside modals
    // Read actual DOM display state so auto-applied language and manual clicks stay in sync
    document.querySelectorAll('dialog .lang-modal-toggle').forEach(toggleBtn => {
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const modal = toggleBtn.closest('dialog');
            const enBlock = modal.querySelector('.lang-en');
            const deBlock = modal.querySelector('.lang-de');

            // Check if German is currently visible
            const isCurrentlyDE = window.getComputedStyle(deBlock).display !== 'none';

            if (isCurrentlyDE) {
                // Switch to English
                enBlock.style.setProperty('display', 'flex', 'important');
                deBlock.style.setProperty('display', 'none', 'important');
                toggleBtn.classList.remove('de-active');
                toggleBtn.textContent = 'DE';
            } else {
                // Switch to German
                enBlock.style.setProperty('display', 'none', 'important');
                deBlock.style.setProperty('display', 'flex', 'important');
                toggleBtn.classList.add('de-active');
                toggleBtn.textContent = 'EN';
            }
        });
    });

    // Close on backdrop click (native dialog target is the backdrop itself)
    [impressumModal, datenschutzModal].forEach(modal => {
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.close();
                }
            });
        }
    });
}

// Bootstrapping the app
document.addEventListener('DOMContentLoaded', init);
