/**
 * OCR Scanner Module for Uma Musume Skill Optimizer
 * Scans screenshots to extract skill names and hint levels from the game UI.
 * Uses Tesseract.js for browser-based OCR and fuzzy matching for skill name recognition.
 */

(function () {
  'use strict';

  // Module state
  let tesseractWorker = null;
  let isWorkerReady = false;
  let skillNameIndex = null;
  let onStatusUpdate = null;
  let debugMode = false;
  let lastDebugCanvas = null;

  // Configuration
  const CONFIG = {
    tesseractLang: 'eng',

    // Minimum characters for a valid skill name candidate
    minTextLength: 4,

    // Fuzzy matching threshold
    minMatchScore: 0.55,

    // UI elements to filter out (exact or partial matches)
    uiFilterExact: new Set([
      'confirm', 'reset', 'back', 'skip', 'quick', 'log', 'menu', 'learn',
      'full', 'stats', 'jukebox', 'sparks', 'career', 'profile', 'agenda',
      'item', 'request', 'new', 'skill', 'points', 'slightly', 'increase',
      'velocity', 'acceleration', 'when', 'passing', 'another', 'runner',
      'toward', 'front', 'corner', 'back', 'instead', 'straight', 'final'
    ]),

    // Patterns that indicate UI text or skill descriptions, not skill names
    uiFilterPatterns: [
      /^[\d\s%+\-]+$/,           // Just numbers/symbols
      /^\d+$/,                    // Pure numbers
      /skill\s*points?/i,
      /full\s*stats?/i,
      /hint\s*lv/i,               // Hint badge text (handle separately)
      /^\s*off\s*$/i,
      /^\d+%\s*off/i,
      /slightly\s+increase/i,     // Skill descriptions
      /when\s+passing/i,
      /in\s+the\s+lead/i,
      /on\s+a\s+straight/i,
      /late[\s-]?race/i,
    ],

    // Hint level detection patterns
    hintPatterns: [
      { regex: /Hint\s*Lv(?:l)?\s*(\d)/i, type: 'level' },
      { regex: /(\d+)\s*%\s*OFF/i, type: 'percent' },
      { regex: /Lv(?:l)?\s*(\d)\s*\d+%/i, type: 'level' },
      { regex: /\(H(\d)\)/i, type: 'level' }, // Format like (H0), (H1), (H2) in header labels
    ],

    // Discount percentage to hint level mapping
    discountToHint: { 10: 1, 20: 2, 30: 3, 35: 4, 40: 5 },

    // Vertical grouping tolerance (fraction of image height) - keep tight to avoid grouping description
    rowGroupTolerance: 0.015,

    // Skill card region estimation (fraction of image width from left edge)
    skillNameRegionStart: 0.05,
    skillNameRegionEnd: 0.55,    // Skill names are typically in left half
    hintBadgeRegionStart: 0.40,
    hintBadgeRegionEnd: 0.85,

    // Row height tolerance to detect skill card title vs description
    // Skill names are typically on larger font, descriptions smaller
    minSkillNameHeight: 0.015,  // Minimum height as fraction of image height
  };

  /**
   * Normalize string for comparison
   */
  function normalize(str) {
    return (str || '').toString().trim().toLowerCase();
  }

  /**
   * Clean OCR text - remove common OCR artifacts
   */
  function cleanOcrText(text) {
    return (text || '')
      .replace(/[|\\\/\[\]{}()<>]/g, '') // Remove brackets and slashes
      .replace(/[^\w\s\-'☆★:]/g, '')     // Keep only word chars, spaces, hyphens, apostrophes, stars
      .replace(/\s+/g, ' ')               // Normalize whitespace
      .trim();
  }

  /**
   * Check if text is likely a UI element, not a skill name
   */
  function isUiText(text) {
    const cleaned = normalize(text);
    if (cleaned.length < CONFIG.minTextLength) return true;
    if (CONFIG.uiFilterExact.has(cleaned)) return true;
    for (const pattern of CONFIG.uiFilterPatterns) {
      if (pattern.test(text)) return true;
    }
    return false;
  }

  /**
   * Check if a row looks like a skill description (smaller text, common description words)
   */
  function isDescriptionRow(rowText) {
    const lower = rowText.toLowerCase();
    const descriptionIndicators = [
      'slightly', 'increase', 'velocity', 'acceleration', 'when',
      'passing', 'runner', 'corner', 'lead', 'straight', 'front',
      'back', 'instead', 'final', 'toward', 'late-race', 'late race'
    ];
    let matches = 0;
    for (const word of descriptionIndicators) {
      if (lower.includes(word)) matches++;
    }
    return matches >= 2; // If 2+ description words found, it's likely a description
  }

  /**
   * Calculate Levenshtein distance
   */
  function levenshteinDistance(a, b) {
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
    for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
    for (let j = 1; j <= b.length; j++) {
      for (let i = 1; i <= a.length; i++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + cost
        );
      }
    }
    return matrix[b.length][a.length];
  }

  /**
   * Calculate similarity score (0-1)
   */
  function similarityScore(a, b) {
    const normA = normalize(a);
    const normB = normalize(b);
    if (normA === normB) return 1;
    if (!normA.length || !normB.length) return 0;

    // Check for substring containment (boost score)
    if (normA.includes(normB) || normB.includes(normA)) {
      const shorter = Math.min(normA.length, normB.length);
      const longer = Math.max(normA.length, normB.length);
      return 0.7 + (0.3 * shorter / longer);
    }

    const maxLen = Math.max(normA.length, normB.length);
    const distance = levenshteinDistance(normA, normB);
    return 1 - (distance / maxLen);
  }

  /**
   * Find best matching skill name from database
   */
  function findBestSkillMatch(ocrText, skillNames) {
    if (!ocrText || !skillNames?.length) return null;

    const cleaned = cleanOcrText(ocrText);
    if (cleaned.length < CONFIG.minTextLength) return null;

    let bestMatch = null;
    let bestScore = 0;

    for (const skillName of skillNames) {
      const score = similarityScore(cleaned, skillName);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = skillName;
      }
    }

    if (bestScore >= CONFIG.minMatchScore) {
      return { name: bestMatch, score: bestScore };
    }
    return null;
  }

  /**
   * Extract hint level from text
   */
  function extractHintLevel(text) {
    if (!text) return 0;

    for (const { regex, type } of CONFIG.hintPatterns) {
      const match = text.match(regex);
      if (match) {
        if (type === 'percent') {
          const pct = parseInt(match[1], 10);
          return CONFIG.discountToHint[pct] || 0;
        }
        const level = parseInt(match[1], 10);
        if (level >= 0 && level <= 5) return level;
      }
    }
    return 0;
  }

  /**
   * Group words by vertical position (same row)
   */
  function groupWordsByRow(words, imageHeight) {
    const tolerance = imageHeight * CONFIG.rowGroupTolerance;
    const rows = [];

    for (const word of words) {
      const centerY = (word.bbox.y0 + word.bbox.y1) / 2;
      let foundRow = false;

      for (const row of rows) {
        if (Math.abs(row.centerY - centerY) < tolerance) {
          row.words.push(word);
          row.centerY = (row.centerY * (row.words.length - 1) + centerY) / row.words.length;
          foundRow = true;
          break;
        }
      }

      if (!foundRow) {
        rows.push({ centerY, words: [word] });
      }
    }

    // Sort rows by Y position, words within rows by X position
    rows.sort((a, b) => a.centerY - b.centerY);
    for (const row of rows) {
      row.words.sort((a, b) => a.bbox.x0 - b.bbox.x0);
    }

    return rows;
  }

  /**
   * Process a row to extract skill name and hint level
   */
  function processSkillRow(row, imageWidth, imageHeight, skillNames) {
    const skillRegionStart = imageWidth * CONFIG.skillNameRegionStart;
    const skillRegionEnd = imageWidth * CONFIG.skillNameRegionEnd;
    const hintRegionStart = imageWidth * CONFIG.hintBadgeRegionStart;
    const hintRegionEnd = imageWidth * CONFIG.hintBadgeRegionEnd;
    const minHeight = imageHeight * CONFIG.minSkillNameHeight;

    // Collect words in skill name region
    const skillWords = [];
    const hintWords = [];

    for (const word of row.words) {
      const wordCenterX = (word.bbox.x0 + word.bbox.x1) / 2;
      const wordText = word.text.trim();
      const wordHeight = word.bbox.y1 - word.bbox.y0;

      // Check if word is in skill name region
      if (wordCenterX >= skillRegionStart && wordCenterX <= skillRegionEnd) {
        if (!isUiText(wordText)) {
          skillWords.push(word);
        }
      }

      // Check if word is in hint badge region (can overlap with skill region)
      if (wordCenterX >= hintRegionStart && wordCenterX <= hintRegionEnd) {
        hintWords.push(word);
      }
    }

    if (skillWords.length === 0) return null;

    // Combine skill words into candidate text
    const skillText = skillWords.map(w => w.text.trim()).join(' ');
    const cleanedSkillText = cleanOcrText(skillText);

    if (cleanedSkillText.length < CONFIG.minTextLength) return null;

    // Skip if this looks like a skill description row
    if (isDescriptionRow(skillText)) return null;

    // Check average word height - skill names use larger font
    const avgHeight = skillWords.reduce((sum, w) => sum + (w.bbox.y1 - w.bbox.y0), 0) / skillWords.length;
    // If text is too small, might be description text (but only filter if we have clear size data)
    // This is a soft check - don't filter too aggressively

    // Try to match against skill database
    const match = findBestSkillMatch(cleanedSkillText, skillNames);
    if (!match) return null;

    // Extract hint level from hint region AND full row text (hint badges may be detected anywhere)
    const hintText = hintWords.map(w => w.text.trim()).join(' ');
    const fullRowText = row.words.map(w => w.text.trim()).join(' ');
    let hintLevel = extractHintLevel(hintText);
    // If no hint found in hint region, check full row
    if (hintLevel === 0) {
      hintLevel = extractHintLevel(fullRowText);
    }

    // Calculate bounding box for the skill text
    const bbox = {
      x0: Math.min(...skillWords.map(w => w.bbox.x0)),
      y0: Math.min(...skillWords.map(w => w.bbox.y0)),
      x1: Math.max(...skillWords.map(w => w.bbox.x1)),
      y1: Math.max(...skillWords.map(w => w.bbox.y1)),
    };

    return {
      name: match.name,
      ocrText: cleanedSkillText,
      hintLevel,
      confidence: match.score,
      bbox,
      hintText: hintLevel > 0 ? hintText : '',
    };
  }

  /**
   * Parse OCR data using line-level bounding boxes for better accuracy
   */
  function parseOcrData(ocrData, imageWidth, imageHeight, skillNames) {
    const results = [];
    const usedSkills = new Set();

    // First try using Tesseract's line-level data (more accurate for separating text rows)
    if (ocrData.lines && ocrData.lines.length > 0) {
      for (const line of ocrData.lines) {
        if (!line.text || !line.bbox) continue;

        const lineText = line.text.trim();
        const lineCenterX = (line.bbox.x0 + line.bbox.x1) / 2;

        // Check if line is in skill name region
        const skillRegionStart = imageWidth * CONFIG.skillNameRegionStart;
        const skillRegionEnd = imageWidth * CONFIG.skillNameRegionEnd;

        if (lineCenterX < skillRegionStart || lineCenterX > skillRegionEnd) continue;

        // Skip description lines
        if (isDescriptionRow(lineText)) continue;

        const cleanedText = cleanOcrText(lineText);
        if (cleanedText.length < CONFIG.minTextLength) continue;

        // Try to match skill
        const match = findBestSkillMatch(cleanedText, skillNames);
        if (!match || usedSkills.has(normalize(match.name))) continue;

        // Extract hint from same line
        let hintLevel = extractHintLevel(lineText);

        usedSkills.add(normalize(match.name));
        results.push({
          name: match.name,
          ocrText: cleanedText,
          hintLevel,
          confidence: match.score,
          bbox: line.bbox,
          hintText: '',
        });
      }
    }

    // Fallback to word-level grouping if line-level didn't find much
    if (results.length < 2) {
      const words = [];
      if (ocrData.words) {
        for (const word of ocrData.words) {
          if (word.text && word.bbox) {
            words.push(word);
          }
        }
      }

      if (words.length > 0) {
        // Group words by row
        const rows = groupWordsByRow(words, imageHeight);

        // Process each row
        for (const row of rows) {
          const result = processSkillRow(row, imageWidth, imageHeight, skillNames);
          if (result && !usedSkills.has(normalize(result.name))) {
            usedSkills.add(normalize(result.name));
            results.push(result);
          }
        }
      }
    }

    return results;
  }

  /**
   * Draw debug overlay on canvas
   */
  function drawDebugOverlay(canvas, ocrData, results, imageWidth, imageHeight) {
    const ctx = canvas.getContext('2d');

    // Draw skill name region boundaries
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);

    const skillStart = imageWidth * CONFIG.skillNameRegionStart;
    const skillEnd = imageWidth * CONFIG.skillNameRegionEnd;
    ctx.beginPath();
    ctx.moveTo(skillStart, 0);
    ctx.lineTo(skillStart, imageHeight);
    ctx.moveTo(skillEnd, 0);
    ctx.lineTo(skillEnd, imageHeight);
    ctx.stroke();

    // Draw hint region boundaries
    ctx.strokeStyle = 'rgba(255, 165, 0, 0.5)';
    const hintStart = imageWidth * CONFIG.hintBadgeRegionStart;
    const hintEnd = imageWidth * CONFIG.hintBadgeRegionEnd;
    ctx.beginPath();
    ctx.moveTo(hintStart, 0);
    ctx.lineTo(hintStart, imageHeight);
    ctx.moveTo(hintEnd, 0);
    ctx.lineTo(hintEnd, imageHeight);
    ctx.stroke();

    ctx.setLineDash([]);

    // Draw all detected lines (blue boxes)
    if (ocrData.lines) {
      ctx.strokeStyle = 'rgba(0, 100, 255, 0.6)';
      ctx.lineWidth = 2;
      for (const line of ocrData.lines) {
        if (line.bbox) {
          const { x0, y0, x1, y1 } = line.bbox;
          ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
          // Draw line text (small)
          ctx.fillStyle = 'rgba(0, 100, 255, 0.9)';
          ctx.font = '10px sans-serif';
          const truncText = line.text.length > 30 ? line.text.slice(0, 30) + '...' : line.text;
          ctx.fillText(truncText, x0 + 2, y1 + 12);
        }
      }
    }

    // Draw all detected words (gray boxes, dimmer)
    if (ocrData.words) {
      ctx.strokeStyle = 'rgba(128, 128, 128, 0.3)';
      ctx.lineWidth = 1;
      for (const word of ocrData.words) {
        if (word.bbox) {
          const { x0, y0, x1, y1 } = word.bbox;
          ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
        }
      }
    }

    // Highlight matched skills (thicker green/yellow/red boxes)
    for (const result of results) {
      if (result.bbox) {
        const { x0, y0, x1, y1 } = result.bbox;

        // Draw bounding box
        ctx.strokeStyle = result.confidence >= 0.85 ? '#22c55e' :
                          result.confidence >= 0.7 ? '#facc15' : '#f87171';
        ctx.lineWidth = 4;
        ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);

        // Draw label with background
        const label = `${result.name} (H${result.hintLevel}) ${Math.round(result.confidence * 100)}%`;
        ctx.font = 'bold 14px sans-serif';
        const textMetrics = ctx.measureText(label);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(x0, y0 - 20, textMetrics.width + 8, 18);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fillText(label, x0 + 4, y0 - 6);
      }
    }

    return canvas;
  }

  /**
   * Initialize Tesseract worker
   */
  async function initTesseract() {
    if (isWorkerReady && tesseractWorker) {
      return tesseractWorker;
    }

    updateStatus('Loading OCR engine...');

    try {
      if (typeof Tesseract === 'undefined') {
        await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
      }

      tesseractWorker = await Tesseract.createWorker(CONFIG.tesseractLang, 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            updateStatus(`Scanning... ${Math.round(m.progress * 100)}%`);
          }
        }
      });

      await tesseractWorker.setParameters({
        preserve_interword_spaces: '1',
      });

      isWorkerReady = true;
      updateStatus('OCR engine ready');
      return tesseractWorker;
    } catch (err) {
      console.error('Failed to initialize Tesseract:', err);
      updateStatus('Failed to load OCR engine', true);
      throw err;
    }
  }

  /**
   * Load external script
   */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) { resolve(); return; }
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  /**
   * Load image from URL
   */
  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  /**
   * Preprocess image for better OCR
   */
  function preprocessImage(img) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    // Enhance contrast for text
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      const contrast = 1.4;
      const adjusted = Math.max(0, Math.min(255, ((gray / 255 - 0.5) * contrast + 0.5) * 255));
      data[i] = data[i + 1] = data[i + 2] = adjusted;
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  /**
   * Scan image for skills
   */
  async function scanImage(imageFile, skillNames, options = {}) {
    if (!imageFile) throw new Error('No image file provided');
    if (!skillNames?.length) throw new Error('Skill database not loaded');

    skillNameIndex = skillNames;
    const showDebug = options.debug ?? debugMode;

    try {
      const worker = await initTesseract();
      updateStatus('Preparing image...');

      const imageUrl = imageFile instanceof File ? URL.createObjectURL(imageFile) : imageFile;
      const img = await loadImage(imageUrl);
      const processedCanvas = preprocessImage(img);

      updateStatus('Scanning image...');

      // Run OCR with word-level data
      const { data } = await worker.recognize(processedCanvas);

      if (imageFile instanceof File) {
        URL.revokeObjectURL(imageUrl);
      }

      updateStatus('Processing results...');

      // Parse using word bounding boxes
      const skills = parseOcrData(data, img.width, img.height, skillNames);

      // Generate debug overlay if requested
      let debugCanvas = null;
      if (showDebug) {
        debugCanvas = document.createElement('canvas');
        debugCanvas.width = img.width;
        debugCanvas.height = img.height;
        const ctx = debugCanvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        drawDebugOverlay(debugCanvas, data, skills, img.width, img.height);
        lastDebugCanvas = debugCanvas;
      }

      updateStatus(`Found ${skills.length} skill${skills.length === 1 ? '' : 's'}`);

      return {
        success: true,
        skills,
        rawText: data.text,
        confidence: data.confidence,
        debugCanvas,
      };
    } catch (err) {
      console.error('OCR scan failed:', err);
      updateStatus('Scan failed: ' + err.message, true);
      throw err;
    }
  }

  /**
   * Scan multiple images
   */
  async function scanMultipleImages(imageFiles, skillNames, options = {}) {
    const allSkills = [];
    const seenSkills = new Set();
    const debugCanvases = [];

    for (let i = 0; i < imageFiles.length; i++) {
      updateStatus(`Scanning image ${i + 1} of ${imageFiles.length}...`);

      try {
        const result = await scanImage(imageFiles[i], skillNames, options);

        for (const skill of result.skills) {
          const key = normalize(skill.name);
          if (!seenSkills.has(key)) {
            seenSkills.add(key);
            allSkills.push(skill);
          }
        }

        if (result.debugCanvas) {
          debugCanvases.push(result.debugCanvas);
        }
      } catch (err) {
        console.warn(`Failed to scan image ${i + 1}:`, err);
      }
    }

    updateStatus(`Found ${allSkills.length} unique skill${allSkills.length === 1 ? '' : 's'} total`);

    return {
      success: true,
      skills: allSkills,
      debugCanvases,
    };
  }

  /**
   * Update status
   */
  function updateStatus(message, isError = false) {
    if (typeof onStatusUpdate === 'function') {
      onStatusUpdate(message, isError);
    }
    console.log('[OCR Scanner]', message);
  }

  function setStatusCallback(callback) { onStatusUpdate = callback; }
  function setDebugMode(enabled) { debugMode = enabled; }
  function getLastDebugCanvas() { return lastDebugCanvas; }

  async function terminate() {
    if (tesseractWorker) {
      await tesseractWorker.terminate();
      tesseractWorker = null;
      isWorkerReady = false;
    }
  }

  // Export public API
  window.OcrScanner = {
    scanImage,
    scanMultipleImages,
    setStatusCallback,
    setDebugMode,
    getLastDebugCanvas,
    terminate,
    initTesseract,
    findBestSkillMatch,
    extractHintLevel,
    similarityScore,
  };
})();
