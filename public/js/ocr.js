const PROBE_TEMPLATE_DATAURL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACIAAAAmCAYAAACh1knUAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAARGSURBVFhH7VfraxNZFPffsVarVdfHLosLKuJ+2Ao+UFmVZRFW8IsLfhHEj+IDUdo0fUSr1lfV1eqqSFkXn7UivkCwm0nSTPNqG9ukTZvHJHM8586dZB53kpSUZVn8DT9IJr9z7m/uPffMzTz4j+D/YiTDWTtqNJLmrB1VGMkzKniFZ97Aq88uuBvaA+f8q8DlXczY4V8MXYGV8CC6H95PdMNo9iNGaFe1qGgkr05CJD0ArdIKaPYugVYcuF1aJCT9TnQjb8ibYST7CVQo8EzlUdZIFk3clHcXB5iNkU7GRngYOcCzlYejkZSahEvyeuGAs2Gztw6uBJsgqcg8sxhCIzOFBFwMroHOwBJh8tmw2Tuf8c7wLp5dDJsRRU1Db/hnYdJa6MFlehw7giOo2kAW2IwEUn1zMhNWUs14vEshU0jykcwwGSmoOfD414BLcjbSKjVACxYssZOzBetAo3afNKLYDrz/d+wwH80Mk5FA6mmx8kWJiLRr2O6RlsOT0SMwmLwFL8dboHtoYzG23M5qRSZyQT5iCQYjKjwdO8oalCiRW6pn7PCtRt1xyBUmeRxAjl1Z+JC4iM3tO4w3xxpJhTs4dZdHllA0UlAVuD3sXKSUoN23HIan+3mECGmIpvtR7zyjlOdF/CTXl1A0klezOL1rhcFESjAwfoarnaC9e17GjwlzEClPb+gXTW5A0Qht2w6f89q6pW9gSolxdXmEZwbYgGwWLXlo93RJK7myhKqN9Mg7uLIyCpirK/BDDUYcq70BHo2Jt50IVG835T1oxF4rdM9dzgj1kJ6hJlugxrk10hv6jStLMBhR4FZoR7E5mRM0QF/0d1TRaazyGSOnZuC6vB0HXWDJoxl5ET/NlSUUjVAf6Y+fQqG4yC4Hf0QN7QqFqcshi8vs8X8rzENGBqfuc2UJBiPUWR9hM6pntCZo8zViHSVQVdnIZD6GA9Yz6vFunFViG/aiRM5+JDAZoWrvxncNVbbRBNGFXXUs8w5VlY28nTjPntxYI/r3ntBPXGWGyQgNEsBpExmhaf4zvJdpyoEV6vBOoRGXtKy6ty+BtnFnYIXJhJZoPhZxPQRTz7hSjHcTl4TvKnq4P+RtWIlVnkcIkfRrWyK9iC8MrYNY+gNXGqHCP5MPoU1aLTRyFmdjTPFxrR22pckURvAEvtWWSJ/qZu9CuBehPmD+P0MzSSZIIzJCLaEvehDtik/1tmK9Lm9hT25NpBu5geuvv9ys8OOu6wpsEBrRZ/RacCNXm2Eyoqp5+GvkEAvQT1s629HEczyvKOoMKTntmM7HoX/0BJsB46lNM1KHvcp+BCDYaoQSXQ1uwiB9KRqx4/4K4ekBrqgMKshPyduWPHXwILIffxF3ZmGx5tRpuIb/1Dz+7/E4eJzfnT0UbPX3owewia3CutrH74ohNEKgZUphh5wLjOck/skZjkb+bXw1YsVXI2YAfAGs8LSsCIEo2AAAAABJRU5ErkJggg==';

const PROBE_REGION = { x: 0.13, y: 0.45, w: 0.05, h: 0.45 }; // % of frame
const EVENT_REGION = { x: 0.12, y: 0.175, w: 0.2, h: 0.05 }; // % of frame

const MATCH_STRIDE = 2;
const MATCH_THRESHOLD = 0.85;
const MAX_MS_PER_SCAN = 60;

const OCR_OPTS = { lang: 'eng', psm: 6 }; // 6 = block of text (ribbon often has 2 lines)
const TRIGGER_COOLDOWN_MS = 1500;
const TESSERACT_SRC = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
const MAX_OCR_WORKERS = 3; // Max workers for skill OCR pool

const captureBtn = document.getElementById('captureBtn');
const videoEl = document.getElementById('captureVideo');
const suggestions = document.getElementById('suggestions');

const SCAN_TIME_KEY = 'umasearch-scantime';
function getScanDelay() {
  const v = localStorage.getItem(SCAN_TIME_KEY) || '3000';
  const n = Number(v);
  return Number.isFinite(n) && n > 200 ? n : 3000;
}

let mediaStream = null;
let captureTimer = null;
let lastTriggerTs = 0;
let tesseractReady = null;
let ocrScheduler = null; // Tesseract worker pool scheduler
let skillOCRWorker = null;
let skillOCRWorkerInit = null;

const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

let tpl = null; // {w,h,gray,mean,std}
function toGray(imgData) {
  const { data, width, height } = imgData;
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];
    gray[j] = (r * 0.299 + g * 0.587 + b * 0.114) | 0;
  }
  return { gray, width, height };
}
function stats(gray) {
  let s = 0,
    s2 = 0;
  const n = gray.length;
  for (let i = 0; i < n; i++) {
    const v = gray[i];
    s += v;
    s2 += v * v;
  }
  const mean = s / n;
  const v2 = Math.max(1e-6, s2 / n - mean * mean);
  return { mean, std: Math.sqrt(v2) };
}


async function _decodeToCanvasFromBlob(blob) {
  try {
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    c.getContext('2d', { willReadFrequently: true }).drawImage(bmp, 0, 0);
    bmp.close();
    return c;
  } catch {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.decoding = 'sync';
      img.src = url;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0);
      return c;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

async function _decodeToCanvasFromDataURL(dataUrl) {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return _decodeToCanvasFromBlob(blob);
}

async function loadTemplate(src) {
  let canvasFromImg;

  if (PROBE_TEMPLATE_DATAURL) {
    canvasFromImg = await _decodeToCanvasFromDataURL(PROBE_TEMPLATE_DATAURL);
  } else {
    // Use default caching for template images
    const res = await fetch(src);
    if (!res.ok)
      throw new Error(`Failed to fetch template ${src}: ${res.status} ${res.statusText}`);

    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!ct.startsWith('image/')) {
      const snippet = (await res.text()).slice(0, 200);
      throw new Error(`Template is not an image (content-type: "${ct}"). First bytes: ${snippet}`);
    }

    const blob = await res.blob();
    canvasFromImg = await _decodeToCanvasFromBlob(blob);
  }

  const id = canvasFromImg
    .getContext('2d', { willReadFrequently: true })
    .getImageData(0, 0, canvasFromImg.width, canvasFromImg.height);
  const g = toGray(id);
  const st = stats(g.gray);
  tpl = { w: g.width, h: g.height, gray: g.gray, mean: st.mean, std: st.std };
  console.info(`[ocr] Template loaded ${g.width}x${g.height}`);
}

function nccScore(frameGray, fW, x, y, tplObj) {
  const { w: tw, h: th, gray: tGray, mean: tMean, std: tStd } = tplObj;
  let sum = 0,
    sum2 = 0,
    sumCross = 0;
  for (let j = 0; j < th; j++) {
    const fy = (y + j) * fW;
    const tj = j * tw;
    for (let i = 0; i < tw; i++) {
      const fv = frameGray[fy + x + i];
      const tv = tGray[tj + i];
      sum += fv;
      sum2 += fv * fv;
      sumCross += fv * tv;
    }
  }
  const n = tw * th;
  const fMean = sum / n;
  const fVar = Math.max(1e-6, sum2 / n - fMean * fMean);
  const fStd = Math.sqrt(fVar);
  const num = sumCross - n * fMean * tMean;
  const den = n * fStd * tStd;
  return den > 0 ? num / den : 0;
}
function matchTemplateInRegion(frameImgData, probeRect, tplObj) {
  const { width: fW, height: fH } = frameImgData;
  const frameGray = toGray(frameImgData).gray;

  const { w: tw, h: th } = tplObj;
  const x0 = probeRect.x,
    y0 = probeRect.y;
  const x1 = x0 + Math.max(0, probeRect.w - tw);
  const y1 = y0 + Math.max(0, probeRect.h - th);

  let best = { score: -1, x: x0, y: y0 };
  const tStart = performance.now();

  for (let y = y0; y <= y1; y += MATCH_STRIDE) {
    for (let x = x0; x <= x1; x += MATCH_STRIDE) {
      const s = nccScore(frameGray, fW, x, y, tplObj);
      if (s > best.score) best = { score: s, x, y };
    }
    if (performance.now() - tStart > MAX_MS_PER_SCAN) break;
  }
  return best;
}

function setSuggestion(msg) {
  if (suggestions) suggestions.textContent = msg || '';
}
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = src;
    tag.async = true;
    tag.onload = () => resolve();
    tag.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(tag);
  });
}

async function ensureTesseract() {
  if (window.Tesseract) return window.Tesseract;
  if (!tesseractReady) {
    tesseractReady = loadScript(TESSERACT_SRC).then(() => window.Tesseract);
  }
  return tesseractReady;
}

async function getSkillOCRWorker() {
  if (skillOCRWorker) return skillOCRWorker;
  if (!skillOCRWorkerInit) {
    skillOCRWorkerInit = (async () => {
      const Tess = await ensureTesseract();
      skillOCRWorker = await Tess.createWorker('eng');
      return skillOCRWorker;
    })().catch((err) => {
      skillOCRWorkerInit = null;
      throw err;
    });
  }
  return skillOCRWorkerInit;
}

async function resetSkillOCRWorker() {
  if (skillOCRWorker) {
    try {
      await skillOCRWorker.terminate();
    } catch (err) {
      console.warn('[ocr] Failed to terminate OCR worker:', err);
    }
  }
  skillOCRWorker = null;
  skillOCRWorkerInit = null;
}

async function createScheduler() {
  if (ocrScheduler) return ocrScheduler;

  const Tess = await ensureTesseract();
  const scheduler = Tess.createScheduler();

  const numWorkers = Math.min(MAX_OCR_WORKERS, navigator.hardwareConcurrency || 2);
  const workers = [];

  for (let i = 0; i < numWorkers; i++) {
    const worker = await Tess.createWorker(OCR_OPTS.lang, 1, {
      logger: () => {},
    });
    scheduler.addWorker(worker);
    workers.push(worker);
  }

  ocrScheduler = scheduler;
  return scheduler;
}

function mayTrigger() {
  const now = performance.now();
  if (now - lastTriggerTs < TRIGGER_COOLDOWN_MS) return false;
  lastTriggerTs = now;
  return true;
}

function cleanTitle(raw) {
  if (!raw) return '';

  let t = raw
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u00A0/g, ' ');

  const lines = t
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const noRibbon = lines.filter((l) => !/support\s*card\s*event/i.test(l));

  t = noRibbon.length ? noRibbon.join(' ') : lines.join(' ');

  t = t
    .replace(/\s*\*\s*/g, ' ') // stray bullets
    .replace(/\s*\.\s*/g, '. ')
    .replace(/\s*\|\s*/g, ' I ') // pipe -> capital I (very common on this font)
    .replace(/\s{2,}/g, ' ')
    .replace(/^[^A-Za-z0-9]+/, '') // leading junk
    .trim();

  if (t && t === t.toLowerCase()) {
    t = t.replace(/\b([a-z])([a-z]*)\b/g, (_, a, b) => a.toUpperCase() + b);
  }
  t = t.replace(/[^A-Za-z0-9 '"\-\?\!\:\,\.\&\(\)]/g, '').trim();

  return t;
}

function extractHintLevel(text) {
  // Delegate to OCRMatcher if available (single source of truth)
  if (window.OCRMatcher) return window.OCRMatcher.extractHintLevel(text);

  if (!text || typeof text !== 'string') return null;

  const m = text.match(/[Hh]int\s*[Ll][vVyY][lL]?\s*\.?\s*(\d)/);
  if (m) {
    const h = parseInt(m[1], 10);
    if (h >= 1 && h <= 5) return h;
  }

  const mGarbled = text.match(/[Hh][il1][nm][t7]\s*.{0,3}?\s*(\d)/);
  if (mGarbled) {
    const h = parseInt(mGarbled[1], 10);
    if (h >= 1 && h <= 5) return h;
  }

  const mGarbled2 = text.match(/[Hh](?:in|[il1]n|n)[t7]?\s*.{0,3}?\s*(\d)/);
  if (mGarbled2) {
    const h = parseInt(mGarbled2[1], 10);
    if (h >= 1 && h <= 5) return h;
  }

  const m2 = text.match(/(\d)[0oO]%\s*[Oo0]/i);
  if (m2) {
    const h = parseInt(m2[1], 10);
    if (h >= 1 && h <= 5) return h;
  }

  const m2b = text.match(/(\d)[0oO]\s*%/);
  if (m2b) {
    const h = parseInt(m2b[1], 10);
    if (h >= 1 && h <= 5) return h;
  }

  const m3 = text.match(/[Ll][vVyY][lL]?\s*\.?\s*([1-5])\b/);
  if (m3) {
    const h = parseInt(m3[1], 10);
    if (h >= 1 && h <= 5) return h;
  }

  if (/[Oo]btain|[Bb]ought/i.test(text)) {
    return 0;
  }

  return null;
}

async function ocrEventRect(eventRectPx) {
  const sub = document.createElement('canvas');
  sub.width = eventRectPx.w;
  sub.height = eventRectPx.h;
  const sctx = sub.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(
    canvas,
    eventRectPx.x,
    eventRectPx.y,
    eventRectPx.w,
    eventRectPx.h,
    0,
    0,
    eventRectPx.w,
    eventRectPx.h
  );

  const blob = await new Promise((res) => sub.toBlob(res, 'image/png'));
  const url = URL.createObjectURL(blob);
  try {
    if (!ocrScheduler) await createScheduler();
    const r = await ocrScheduler.addJob('recognize', url);
    const raw = (r?.data?.text || '').trim();
    return cleanTitle(raw);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function scanFrame() {
  if (!tpl) return;
  const vw = videoEl.videoWidth,
    vh = videoEl.videoHeight;
  if (!vw || !vh) return;

  canvas.width = vw;
  canvas.height = vh;
  ctx.drawImage(videoEl, 0, 0, vw, vh);
  const frameData = ctx.getImageData(0, 0, vw, vh);

  const probeRectPx = {
    x: Math.round(PROBE_REGION.x * vw),
    y: Math.round(PROBE_REGION.y * vh),
    w: Math.round(PROBE_REGION.w * vw),
    h: Math.round(PROBE_REGION.h * vh),
  };
  const eventRectPx = {
    x: Math.round(EVENT_REGION.x * vw),
    y: Math.round(EVENT_REGION.y * vh),
    w: Math.round(EVENT_REGION.w * vw),
    h: Math.round(EVENT_REGION.h * vh),
  };

  const match = matchTemplateInRegion(frameData, probeRectPx, tpl);

  if (match.score >= MATCH_THRESHOLD) {
    setSuggestion(t('events.uiFoundReading', { score: Math.round(match.score * 100) }));
    if (!mayTrigger()) return;

    const title = (await ocrEventRect(eventRectPx)).trim();
    if (title) {
      setSuggestion(t('events.detectedSearching', { title: title }));
      if (typeof window.performSearch === 'function') {
        window.performSearch(title); // search.js renders the results
      } else if (typeof performSearch === 'function') {
        performSearch(title);
      } else {
        console.warn('[ocr] performSearch() not found.');
      }
    } else {
      setSuggestion(t('events.uiFoundNoText'));
    }
  } else {
    setSuggestion(t('events.waitingForUI'));
  }
}

let isCapturing = false;
let stopBtn = null;
let cameraContainer = null;

async function startScreenCapture() {
  try {
    setSuggestion(t('events.selectWindow'));

    mediaStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 5 } },
      audio: false,
    });
    videoEl.srcObject = mediaStream;

    if (!cameraContainer) {
      cameraContainer = document.getElementById('camera-capture-container');
    }
    if (cameraContainer) {
      cameraContainer.style.display = 'block';
    }

    setSuggestion(t('events.screenShared'));

    captureBtn.textContent = '⏹ ' + t('events.stopCapture');
    captureBtn.onclick = stopScreenCapture;
    isCapturing = true;

    const captureFrameBtn = document.getElementById('capture-frame-btn');
    if (captureFrameBtn) {
      captureFrameBtn.style.display = 'block';
    }

    videoEl.onloadedmetadata = () => {
      videoEl.play().catch((err) => {
        console.error('Video play error:', err);
        setSuggestion(t('events.failedVideoPreview'));
      });
    };

    mediaStream.getVideoTracks()[0].addEventListener('ended', stopScreenCapture);
  } catch (err) {
    console.error('Screen capture error:', err);
    if (err.name === 'NotAllowedError') {
      setSuggestion(t('events.captureCancelled'));
    } else {
      setSuggestion(t('events.captureFailedRetry'));
    }
    stopScreenCapture();
  }
}

async function stopScreenCapture() {
  try {
    if (captureTimer) clearInterval(captureTimer);
    captureTimer = null;
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      mediaStream = null;
    }
    videoEl.srcObject = null;

    if (cameraContainer) {
      cameraContainer.style.display = 'none';
    }

    const captureFrameBtn = document.getElementById('capture-frame-btn');
    if (captureFrameBtn) {
      captureFrameBtn.style.display = 'none';
    }

    captureBtn.textContent = '🖥 ' + t('events.screenCaptureBtn');
    captureBtn.onclick = startScreenCapture;
    isCapturing = false;
    setSuggestion('');
  } catch (err) {
    console.error('Stop capture error:', err);
  }
}

async function startCapture() {
  try {
    setSuggestion(t('events.loadingEngine'));
    await createScheduler();
    await loadTemplate(PROBE_TEMPLATE_DATAURL);

    mediaStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: false,
    });
    videoEl.srcObject = mediaStream;

    if (captureTimer) clearInterval(captureTimer);
    const delay = getScanDelay();
    setSuggestion(t('events.captureStarted'));

    captureBtn.style.display = 'none';
    if (!stopBtn) {
      stopBtn = document.createElement('button');
      stopBtn.id = 'stopCaptureBtn';
      stopBtn.className = 'capture-btn';
      stopBtn.textContent = t('events.stopCapture');
      stopBtn.onclick = stopCapture;
      captureBtn.parentNode.insertBefore(stopBtn, captureBtn.nextSibling);
    }
    stopBtn.style.display = '';

    isCapturing = true;

    videoEl.onloadedmetadata = () => {
      videoEl.play().then(() => {
        scanFrame();
        captureTimer = setInterval(scanFrame, delay);
      });
    };

    mediaStream.getVideoTracks()[0].addEventListener('ended', stopCapture);
  } catch (err) {
    console.error('capture/template error:', err);
    setSuggestion(t('events.captureFailedPerms'));
    stopCapture();
  }
}

async function stopCapture() {
  try {
    if (captureTimer) clearInterval(captureTimer);
    captureTimer = null;
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      mediaStream = null;
    }
    setSuggestion(t('events.captureStopped'));
    videoEl.srcObject = null;
  } finally {
    // Ensure scheduler is always terminated
    if (ocrScheduler) {
      try {
        await ocrScheduler.terminate();
      } catch (err) {
        console.error('[ocr] Scheduler termination error:', err);
      }
      ocrScheduler = null;
    }

    // Ensure UI is always reset
    if (stopBtn) stopBtn.style.display = 'none';
    captureBtn.style.display = '';
    isCapturing = false;
  }
}

// ─── Skill Database + Matcher Integration ──────────────────────
// Uses OCRMatcher (ocr-matcher.js) for advanced fuzzy matching
// and OCRPreprocess (ocr-preprocess.js) for image preprocessing.

let skillDatabase = null;
let skillNameIndex = new Map();
let matcherReady = false;
let preprocessingEnabled = false;
let skillCostIndexExact = new Map();
let skillCostIndexNormalized = new Map();
let skillCostIndexReady = null;

function normalize(str) {
  return (str || '').toString().trim().toLowerCase();
}

function splitCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  result.push(current);
  return result;
}

function normalizeCostKey(str) {
  return (str || '')
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

async function loadSkillCostIndex() {
  if (skillCostIndexReady) return skillCostIndexReady;

  skillCostIndexReady = (async () => {
    const candidates = ['/assets/skills_all.json', './assets/skills_all.json'];

    for (const url of candidates) {
      try {
        const res = await fetch(url, { cache: 'force-cache' });
        if (!res.ok) continue;
        const list = await res.json();
        if (!Array.isArray(list) || !list.length) continue;

        skillCostIndexExact.clear();
        skillCostIndexNormalized.clear();

        for (const entry of list) {
          const name = (entry?.name_en || entry?.enname || '').trim();
          if (!name) continue;

          let cost = null;
          if (entry?.gene_version && typeof entry.gene_version.cost === 'number') {
            cost = entry.gene_version.cost;
          } else if (typeof entry?.cost === 'number') {
            cost = entry.cost;
          }

          const meta = { cost: Number.isFinite(cost) ? cost : null };
          const exactKey = normalize(name);
          const normKey = normalizeCostKey(name);

          if (!skillCostIndexExact.has(exactKey)) {
            skillCostIndexExact.set(exactKey, meta);
          }
          if (!skillCostIndexNormalized.has(normKey)) {
            skillCostIndexNormalized.set(normKey, meta);
          }
        }

        return true;
      } catch (err) {
        console.warn('[ocr] Failed loading skill costs', url, err);
      }
    }

    return false;
  })().catch((err) => {
    skillCostIndexReady = null;
    throw err;
  });

  return skillCostIndexReady;
}

function lookupSkillCost(name) {
  const exactKey = normalize(name);
  const normKey = normalizeCostKey(name);
  const meta = skillCostIndexExact.get(exactKey) || skillCostIndexNormalized.get(normKey) || null;
  return meta && Number.isFinite(meta.cost) ? meta.cost : null;
}

// Legacy levenshtein kept for correction datalist (uses OCRMatcher internally when available)
function levenshteinDistance(a, b) {
  if (window.OCRMatcher) return window.OCRMatcher.levenshtein(a, b);
  if (!a || !b) return Math.max(a?.length || 0, b?.length || 0);
  const m = a.length,
    n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

// Legacy wrapper — used by old code paths and correction datalist
function fuzzyMatchSkill(ocrText, maxDistance) {
  if (window.OCRMatcher && matcherReady) {
    const result = window.OCRMatcher.matchSkill(ocrText);
    if (result && result.match) {
      return {
        skill: { name: result.match.name, type: result.match.type },
        confidence: result.confidence,
        distance: result.detail ? result.detail.editDist : 0,
        suggestions: result.suggestions || [],
      };
    }
    return null;
  }

  // Fallback: basic levenshtein matching
  if (!ocrText || !skillDatabase || skillNameIndex.size === 0) return null;
  const queryNorm = normalize(ocrText);
  const alphaCount = (queryNorm.match(/[a-z]/g) || []).length;
  if (alphaCount < 3) return null;
  if (skillNameIndex.has(queryNorm)) {
    return { skill: skillNameIndex.get(queryNorm), confidence: 1.0, distance: 0 };
  }
  const md = maxDistance || 2;
  let bestMatch = null,
    bestDist = md + 1;
  for (const [normName, skill] of skillNameIndex) {
    const shorter = Math.min(queryNorm.length, normName.length);
    const effectiveMax = Math.min(md, Math.max(1, Math.floor(shorter * 0.3)));
    const dist = levenshteinDistance(queryNorm, normName);
    if (dist <= effectiveMax && dist < bestDist) {
      bestDist = dist;
      bestMatch = {
        skill,
        distance: dist,
        confidence: 1.0 - dist / (Math.max(queryNorm.length, normName.length) + 1),
      };
    }
  }
  return bestMatch;
}

async function loadSkillDatabase() {
  if (skillDatabase) return skillDatabase;

  const candidates = ['/assets/uma_skills.csv', './assets/uma_skills.csv'];
  let lastErr = null;

  // Best-effort: load base costs for hint inference.
  try {
    await loadSkillCostIndex();
  } catch (err) {
    console.warn('[ocr] Skill cost index unavailable, hint cost inference disabled:', err);
  }

  for (const url of candidates) {
    try {
      const response = await fetch(url, { cache: 'force-cache' });
      if (!response.ok) continue;

      const text = await response.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) continue;

      const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
      const nameIdx = header.indexOf('name');
      const typeIdx = header.indexOf('skill_type');
      const aliasIdx = header.indexOf('alias_name');
      const localizedIdx = header.indexOf('localized_name');
      if (nameIdx === -1) continue;

      const skills = [];
      skillNameIndex.clear();

      for (let i = 1; i < lines.length; i++) {
        const cols = splitCSVLine(lines[i]);
        const name = (cols[nameIdx] || '').trim();
        if (!name || name.length < 2) continue;

        const type = typeIdx !== -1 ? (cols[typeIdx] || '').trim().toLowerCase() : '';
        const aliasRaw = aliasIdx !== -1 ? (cols[aliasIdx] || '').trim() : '';
        const localizedName = localizedIdx !== -1 ? (cols[localizedIdx] || '').trim() : '';
        const aliasNames = aliasRaw
          .split('|')
          .map((a) => a.trim())
          .filter(Boolean);

        const skill = { name, type, cost: lookupSkillCost(name), aliasNames, localizedName };
        skills.push(skill);

        const normName = normalize(name);
        if (!skillNameIndex.has(normName)) {
          skillNameIndex.set(normName, { name, type, cost: skill.cost });
        }
        // Also index aliases and localized name for quick lookup
        for (const alias of aliasNames) {
          const normAlias = normalize(alias);
          if (normAlias && !skillNameIndex.has(normAlias)) {
            skillNameIndex.set(normAlias, { name, type, cost: skill.cost });
          }
        }
        if (localizedName) {
          const normLoc = normalize(localizedName);
          if (normLoc && !skillNameIndex.has(normLoc)) {
            skillNameIndex.set(normLoc, { name, type, cost: skill.cost });
          }
        }
      }

      skillDatabase = skills;

      // Build OCRMatcher dictionary if available
      if (window.OCRMatcher) {
        window.OCRMatcher.buildSkillDictionary(skills);
        matcherReady = true;
        console.log(`[ocr] Matcher dictionary built: ${skills.length} skills`);
      }

      return skillDatabase;
    } catch (err) {
      lastErr = err;
    }
  }

  console.error('[ocr] Failed to load skill database:', lastErr);
  return null;
}

if (typeof window !== 'undefined') {
  window.fuzzyMatchSkill = fuzzyMatchSkill;
  window.loadSkillDatabase = loadSkillDatabase;

  const initDB = () => {
    loadSkillDatabase().catch((err) => {
      console.error('[ocr] Failed to initialize skill database:', err);
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDB);
  } else {
    initDB();
  }
}

if (captureBtn) captureBtn.onclick = startScreenCapture;

// Skill OCR: Screenshot upload handler
const screenshotUploadInput = document.getElementById('screenshot-upload-input');
const screenshotUploadBtn = document.getElementById('screenshot-upload-btn');

if (screenshotUploadInput) {
  screenshotUploadInput.addEventListener('change', async function (e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await processSkillOCR(file);
    } catch (err) {
      console.error('[ocr] Skill OCR failed:', err);
      alert(t('events.ocrFailed'));
    } finally {
      screenshotUploadInput.value = '';
    }
  });
}

// Skill OCR: Screen capture frame handler
let skillCaptureCanvas = null;

if (videoEl) {
  const captureFrameBtn = document.createElement('button');
  captureFrameBtn.id = 'capture-frame-btn';
  captureFrameBtn.className = 'btn';
  captureFrameBtn.textContent = '📸 ' + t('events.captureFrame');
  captureFrameBtn.style.display = 'none';

  const container =
    document.getElementById('camera-capture-container') ||
    document.querySelector('.camera-capture-container');
  if (container) {
    const sug = container.querySelector('#suggestions');
    if (sug) {
      container.insertBefore(captureFrameBtn, sug);
    } else {
      container.appendChild(captureFrameBtn);
    }
  }

  captureFrameBtn.addEventListener('click', async () => {
    if (!videoEl.videoWidth || !videoEl.videoHeight) return;

    if (!skillCaptureCanvas) {
      skillCaptureCanvas = document.createElement('canvas');
    }

    skillCaptureCanvas.width = videoEl.videoWidth;
    skillCaptureCanvas.height = videoEl.videoHeight;
    const sctx = skillCaptureCanvas.getContext('2d');
    sctx.drawImage(videoEl, 0, 0);

    skillCaptureCanvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        await processSkillOCR(blob);
      } catch (err) {
        console.error('[ocr] Skill OCR from screen capture failed:', err);
        alert(t('events.ocrCaptureFailed'));
      }
    }, 'image/png');
  });
}

// ─── Enhanced Skill OCR Pipeline ────────────────────────────────
// Uses OCRPreprocess for image enhancement and OCRMatcher for
// advanced fuzzy matching with confidence scoring and suggestions.

const MAX_SKILL_RESULTS = 5; // At most ~4-5 skills visible on screen at a time

function normalizeSkillNameKey(name) {
  if (window.OCRMatcher && typeof window.OCRMatcher.normalizeForMatch === 'function') {
    return window.OCRMatcher.normalizeForMatch(name || '');
  }
  return normalize(name || '');
}

function hasStrongNameEvidence(skillName, text) {
  if (!skillName || !text) return false;
  if (!window.OCRMatcher || typeof window.OCRMatcher.normalizeForMatch !== 'function') {
    return true;
  }

  const nameNorm = window.OCRMatcher.normalizeForMatch(skillName);
  const textNorm = window.OCRMatcher.normalizeForMatch(text);
  if (!nameNorm || !textNorm) return false;

  if (textNorm.includes(nameNorm)) return true;

  const nameTokens = nameNorm.split(/\s+/).filter((t) => t.length >= 4);
  if (nameTokens.length === 0) return false;

  let tokenHits = 0;
  for (const token of nameTokens) {
    if (textNorm.includes(token)) tokenHits++;
  }

  if (nameTokens.length === 1) return tokenHits >= 1;
  return tokenHits >= Math.min(2, nameTokens.length);
}

function mergeDetectedSkillLists(primary, supplemental) {
  const merged = Array.isArray(primary) ? primary.slice() : [];
  const byName = new Map();

  for (let i = 0; i < merged.length; i++) {
    byName.set(normalizeSkillNameKey(merged[i].name), i);
  }

  for (const extra of supplemental || []) {
    const key = normalizeSkillNameKey(extra.name);
    if (!key) continue;

    if (!byName.has(key)) {
      byName.set(key, merged.length);
      merged.push(extra);
      continue;
    }

    const idx = byName.get(key);
    const cur = merged[idx];

    // Keep stronger confidence and preserve non-zero hint if fallback found one.
    const curConf = typeof cur.confidence === 'number' ? cur.confidence : 0;
    const extraConf = typeof extra.confidence === 'number' ? extra.confidence : 0;
    if (extraConf > curConf) {
      merged[idx] = { ...cur, ...extra };
    } else if ((cur.hint || 0) === 0 && (extra.hint || 0) > 0) {
      merged[idx] = { ...cur, hint: extra.hint };
    }
  }

  return merged;
}

function createStripCanvas(sourceCanvas, region) {
  if (!sourceCanvas || !region) return null;

  const x = Math.max(0, Math.min(1, region.x || 0));
  const y = Math.max(0, Math.min(1, region.y || 0));
  const w = Math.max(0.01, Math.min(1 - x, region.w || 1));
  const h = Math.max(0.01, Math.min(1 - y, region.h || 1));

  const sx = Math.round(sourceCanvas.width * x);
  const sy = Math.round(sourceCanvas.height * y);
  const sw = Math.max(1, Math.round(sourceCanvas.width * w));
  const sh = Math.max(1, Math.round(sourceCanvas.height * h));

  const out = document.createElement('canvas');
  out.width = sw;
  out.height = sh;
  const octx = out.getContext('2d', { willReadFrequently: true });
  octx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return out;
}

async function recognizeCanvas(worker, canvas, psmMode) {
  if (!worker || !canvas) return { text: '', confidence: 0 };

  if (typeof psmMode === 'number') {
    await worker.setParameters({
      tessedit_pageseg_mode: psmMode,
    });
  }

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return { text: '', confidence: 0 };

  const url = URL.createObjectURL(blob);
  try {
    const result = await worker.recognize(url);
    return {
      text: (result?.data?.text || '').trim(),
      confidence: result?.data?.confidence || 0,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function collectFallbackSkillsFromStrips(worker, cropCanvas) {
  const Preprocess = window.OCRPreprocess;
  if (!worker || !cropCanvas || !Preprocess) return [];

  const stripConfigs = [
    // Top strip catches missed first card names (e.g., obtained/rare cards).
    { label: 'top', region: { x: 0, y: 0.0, w: 1, h: 0.4 }, preprocess: true, psm: 6 },
    // Mid strip catches names that were skipped in full-block OCR.
    { label: 'mid', region: { x: 0, y: 0.28, w: 1, h: 0.45 }, preprocess: false, psm: 6 },
    // Bottom strip catches final card names near confirm/reset buttons.
    { label: 'bottom', region: { x: 0, y: 0.58, w: 1, h: 0.42 }, preprocess: true, psm: 6 },
  ];

  const fallbackMatches = [];

  for (const cfg of stripConfigs) {
    const stripCanvas = createStripCanvas(cropCanvas, cfg.region);
    if (!stripCanvas || stripCanvas.width < 80 || stripCanvas.height < 30) continue;

    let ocrCanvas = stripCanvas;
    if (cfg.preprocess) {
      const prep = Preprocess.preprocessImage(stripCanvas, {
        targetScale: 2,
        enableCLAHE: true,
        enableDenoise: true,
        enableThreshold: true,
        thresholdBlockSize: 15,
        thresholdC: 9,
        enableMorphClose: true,
        morphCloseRadius: 1,
        enableSharpen: false,
      });
      if (prep && prep.primary) ocrCanvas = prep.primary;
    }

    const { text, confidence } = await recognizeCanvas(worker, ocrCanvas, cfg.psm);
    if (!text || text.length < 3) continue;

    const parsed = parseSkillsEnhanced(text, confidence);
    for (const candidate of parsed) {
      const evidenceText = `${candidate.rawText || ''}\n${text}`;
      if (!hasStrongNameEvidence(candidate.name, evidenceText)) continue;
      fallbackMatches.push({
        ...candidate,
        source: `${candidate.source || 'fuzzy'}+strip_${cfg.label}`,
      });
    }
  }

  return fallbackMatches;
}

// Core OCR pipeline — returns detected skills without touching the DOM.
// Used by both processSkillOCR (UI) and automated tests.
//
// Strategy: OCR the entire cropped skill region as one block, then use
// parseOCRText (line-by-line matching with description filtering) to
// extract skill names. Card segmentation is kept only for debug overlay.
async function ocrPipelineCore(imageBlob) {
  await loadSkillDatabase();

  const Tess = await ensureTesseract();
  const worker = await getSkillOCRWorker();
  const Preprocess = window.OCRPreprocess;

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: Tess.PSM ? Tess.PSM.AUTO : '3',
      tessedit_char_whitelist:
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 '-+%.",
      preserve_interword_spaces: '1',
    });

    // Step 1: Crop to skill region
    let sourceCanvas = null;
    let cropInfo = null;
    if (Preprocess) {
      sourceCanvas = await Preprocess.blobToCanvas(imageBlob);
      cropInfo = Preprocess.cropSkillRegion(sourceCanvas);
      console.log(
        `[ocr] Layout: ${cropInfo.layout} | Crop: x=${cropInfo.region.x} y=${cropInfo.region.y} w=${cropInfo.region.w} h=${cropInfo.region.h}`
      );
    }

    // Step 2: OCR the full cropped region as one block
    const ocrBlob =
      cropInfo && Preprocess ? await Preprocess.canvasToBlob(cropInfo.canvas) : imageBlob;

    const ocrResults = await runOCRWithPreprocessing(worker, ocrBlob);
    const bestResult = selectBestOCRResult(ocrResults);
    const rawOCRText = bestResult.text;
    console.log('[ocr] Best variant:', bestResult.variant, '| text:', rawOCRText.substring(0, 300));

    // Step 3: Parse skill names from the OCR text using line-by-line matching
    let detectedSkills = parseSkillsEnhanced(rawOCRText, bestResult.ocrConfidence);

    // Step 3b: Fallback OCR on focused strips when primary OCR found too few skills.
    // This recovers names that block OCR often skips (top/bottom obtained or rare cards).
    if (Preprocess && cropInfo && detectedSkills.length <= 2) {
      try {
        const recovered = await collectFallbackSkillsFromStrips(worker, cropInfo.canvas);
        if (recovered.length > 0) {
          const before = detectedSkills.length;
          detectedSkills = mergeDetectedSkillLists(detectedSkills, recovered);
          const added = detectedSkills.length - before;
          if (added > 0) {
            console.log(`[ocr] Fallback strip OCR recovered ${added} additional skill(s)`);
          }
        }
      } catch (err) {
        console.warn('[ocr] Strip fallback OCR failed:', err);
      }
    }

    if (detectedSkills.length > MAX_SKILL_RESULTS) {
      detectedSkills.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
      detectedSkills = detectedSkills.slice(0, MAX_SKILL_RESULTS);
    }

    // Step 4: Card segmentation (debug overlay only)
    let cards = [];
    let cardRegions = [];
    let debugCardTexts = [];
    if (Preprocess && cropInfo && window._ocrDebugMode) {
      cards = Preprocess.segmentSkillCards(cropInfo.canvas);
      console.log(`[ocr] Debug: ${cards.length} card regions detected`);
    }

    return {
      detectedSkills,
      cards,
      cardRegions,
      debugCardTexts,
      cropInfo,
      sourceCanvas,
      rawOCRText,
    };
  } catch (err) {
    // If the persistent worker got into a bad state, reset it for next run.
    await resetSkillOCRWorker();
    throw err;
  }
}

// Expose for automated tests
window.ocrPipelineCore = ocrPipelineCore;

async function processSkillOCR(imageBlob) {
  const resultsPanel = document.getElementById('ocr-results-panel');
  const resultsList = document.getElementById('ocr-results-list');

  if (!resultsPanel || !resultsList) {
    console.error('[ocr] OCR results panel not found');
    return;
  }

  resultsList.innerHTML =
    '<div class="loading-indicator">' + t('events.processingImage') + '</div>';
  resultsPanel.style.display = 'block';

  try {
    const result = await ocrPipelineCore(imageBlob);
    const { detectedSkills, cards, cardRegions, debugCardTexts, cropInfo, sourceCanvas } = result;
    const Preprocess = window.OCRPreprocess;

    // Store debug info
    if (window._ocrDebugMode) {
      window._ocrDebugInfo = {
        cards,
        cardRegions,
        debugCardTexts,
        detectedSkills,
        cropInfo,
        sourceCanvas,
        timestamp: Date.now(),
      };
    }

    // Show debug overlay with card segmentation
    if (window._ocrDebugMode && sourceCanvas && cropInfo && Preprocess) {
      if (cards.length > 0) {
        displaySegmentedDebugOverlay(sourceCanvas, cropInfo, cards, debugCardTexts);
      } else {
        displayDebugOverlay(sourceCanvas, cropInfo, {
          variant: 'fallback',
          ocrConfidence: 0,
          text: '',
        });
      }
    }

    displayOCRResults(detectedSkills);
    window.ocrDetectedSkills = detectedSkills;
  } catch (err) {
    console.error('[ocr] Skill OCR error:', err);
    resultsList.innerHTML = '<div class="error-message">' + t('events.ocrFailed') + '</div>';
    throw err;
  }
}

async function runOCRWithPreprocessing(worker, croppedBlob) {
  const results = [];
  const Preprocess = window.OCRPreprocess;

  // Always run the cropped image first (baseline)
  const origUrl = URL.createObjectURL(croppedBlob);
  try {
    const origResult = await worker.recognize(origUrl);
    const origText = (origResult?.data?.text || '').trim();
    const origConf = origResult?.data?.confidence || 0;
    results.push({
      variant: 'original',
      text: origText,
      ocrConfidence: origConf,
      skillCount: countPotentialSkillLines(origText),
    });
  } finally {
    URL.revokeObjectURL(origUrl);
  }

  // If preprocessing is disabled or module not loaded, return baseline
  if (!preprocessingEnabled || !Preprocess) {
    return results;
  }

  try {
    const sourceCanvas = await Preprocess.blobToCanvas(croppedBlob);
    const variants = Preprocess.preprocessMultiVariant(sourceCanvas, {
      generateDebug: !!window._ocrDebugMode,
    });

    for (const variant of variants) {
      try {
        const blob = await Preprocess.canvasToBlob(variant.primary);
        const url = URL.createObjectURL(blob);
        try {
          const result = await worker.recognize(url);
          const text = (result?.data?.text || '').trim();
          const conf = result?.data?.confidence || 0;
          results.push({
            variant: variant.label,
            text,
            ocrConfidence: conf,
            skillCount: countPotentialSkillLines(text),
            sharpness: variant.sharpness,
            debugArtifacts: variant.debugArtifacts,
          });
        } finally {
          URL.revokeObjectURL(url);
        }
      } catch (err) {
        console.warn(`[ocr] Variant ${variant.label} failed:`, err);
      }
    }
  } catch (err) {
    console.warn('[ocr] Preprocessing failed, using original:', err);
  }

  return results;
}

function countPotentialSkillLines(text) {
  if (!text) return 0;
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  let count = 0;
  for (const line of lines) {
    const alpha = (line.match(/[a-zA-Z]/g) || []).length;
    if (alpha >= 3 && line.length >= 4 && line.length <= 60) count++;
  }
  return count;
}

function selectBestOCRResult(results) {
  if (results.length === 0) {
    return { variant: 'none', text: '', ocrConfidence: 0 };
  }
  if (results.length === 1) return results[0];

  // Score each result: prefer higher OCR confidence and more potential skill lines
  let best = results[0];
  let bestScore = -1;

  for (const r of results) {
    // Composite: skill line count * confidence
    const score = r.skillCount * 0.6 + (r.ocrConfidence / 100) * 0.4;
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }

  return best;
}

// Parse skills using the new OCRMatcher if available, else fall back to legacy
function parseSkillsEnhanced(ocrText, ocrEngineConfidence) {
  if (window.OCRMatcher && matcherReady) {
    return window.OCRMatcher.parseOCRText(ocrText, {
      ocrEngineConfidence,
    });
  }

  // Legacy fallback
  return parseSkillsFromOCRLegacy(ocrText);
}

// Legacy parser kept as fallback
function parseSkillsFromOCRLegacy(ocrText) {
  const lines = ocrText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const detectedSkills = [];
  const seenSkills = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = tryMatchLineLegacy(line);
    if (!match || !match.skill) continue;
    if (match.confidence < 0.65) continue;

    const normName = normalize(match.skill.name);
    if (seenSkills.has(normName)) continue;
    seenSkills.add(normName);

    let hint = null;
    hint = extractHintLevel(lines[i]);
    if (hint === null && i > 0) hint = extractHintLevel(lines[i - 1]);
    if (hint === null && i > 1) hint = extractHintLevel(lines[i - 2]);
    if (hint === null && i + 1 < lines.length) hint = extractHintLevel(lines[i + 1]);

    detectedSkills.push({
      name: match.skill.name,
      type: match.skill.type || '',
      hint: hint !== null ? hint : 0,
      confidence: match.confidence || 0,
      suggestions: [],
      rawText: line,
    });
  }
  return detectedSkills;
}

function cleanLinePipesAsI(text) {
  return text
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u00A0/g, ' ')
    .replace(/\s*\|\s*/g, ' I ')
    .replace(/[\[\]©@*#]+/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[^A-Za-z0-9]+/, '')
    .trim();
}
function cleanLineStripNoise(text) {
  return text
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u00A0/g, ' ')
    .replace(/[|[\]©@*#]+/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[^A-Za-z0-9]+/, '')
    .trim();
}
function _tryMatchCleanedLegacy(cleaned) {
  if (cleaned.length < 3) return null;
  let match = fuzzyMatchSkill(cleaned, 2);
  if (match) return match;
  let stripped = cleaned.replace(/\s+\d{1,3}\s*[+]?\s*$/, '').trim();
  if (stripped.length >= 3 && stripped !== cleaned) {
    match = fuzzyMatchSkill(stripped, 2);
    if (match) return match;
  }
  stripped = cleaned
    .replace(/[Hh]int\s*[Ll][vV]\.?\s*\d/g, '')
    .replace(/\d+%\s*[Oo][Ff][Ff]/gi, '')
    .replace(/\s+\d{1,3}\s*[+]?\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (stripped.length >= 3 && stripped !== cleaned) {
    match = fuzzyMatchSkill(stripped, 2);
    if (match) return match;
  }
  const words = cleaned.split(/\s+/);
  for (let n = Math.min(words.length - 1, 7); n >= 1; n--) {
    const prefix = words.slice(0, n).join(' ');
    if (prefix.length >= 3) {
      match = fuzzyMatchSkill(prefix, 2);
      if (match) return match;
    }
  }
  return null;
}
function tryMatchLineLegacy(line) {
  const pipesAsI = cleanLinePipesAsI(line);
  const stripped = cleanLineStripNoise(line);
  let best = null;
  for (const cleaned of [pipesAsI, stripped]) {
    const match = _tryMatchCleanedLegacy(cleaned);
    if (!match) continue;
    if (!best || match.confidence > best.confidence) best = match;
    if (best.confidence >= 1.0) return best;
  }
  return best;
}

// ─── Display OCR Results with Confidence + Suggestions ──────────

function displayOCRResults(detectedSkills) {
  const resultsList = document.getElementById('ocr-results-list');
  if (!resultsList) return;

  // Hide debug overlay if not in debug mode
  if (!window._ocrDebugMode) {
    const debugContainer = document.getElementById('ocr-debug-overlay');
    if (debugContainer) debugContainer.style.display = 'none';
  }

  if (detectedSkills.length === 0) {
    resultsList.innerHTML = '<div class="no-results">' + t('events.noSkillsDetected') + '</div>';
    return;
  }

  // Snapshot current checkbox states before re-rendering
  const prevCheckboxes = resultsList.querySelectorAll('.ocr-skill-checkbox');
  const uncheckedSet = new Set();
  prevCheckboxes.forEach((cb, i) => {
    if (!cb.checked) uncheckedSet.add(i);
  });

  let html = '<div class="ocr-results-hint">' + t('events.clickToEdit') + '</div>';
  detectedSkills.forEach((skill, index) => {
    const confidencePct = Math.round((skill.confidence || 0) * 100);
    const level = window.OCRMatcher
      ? window.OCRMatcher.getConfidenceLevel(skill.confidence || 0)
      : confidencePct >= 85
        ? 'high'
        : confidencePct >= 70
          ? 'medium'
          : 'low';
    const typeClass = skill.type ? `cat-${skill.type}` : '';
    const suggestions = skill.suggestions || [];
    const showSuggestions = level === 'low' && suggestions.length > 0;
    const isChecked = !uncheckedSet.has(index);

    html += `
      <div class="ocr-result-item ocr-result-editable ${typeClass}" data-skill-index="${index}" title="Click to edit">
        <input type="checkbox" id="ocr-skill-${index}" class="ocr-skill-checkbox"${isChecked ? ' checked' : ''}>
        <div class="ocr-result-info">
          <div class="ocr-result-name"><span data-skill-name="${escapeHTML(skill.name)}" tabindex="0" role="button">${escapeHTML(skill.name)}</span><span class="ocr-edit-icon" aria-hidden="true">&#9998;</span></div>
          <div class="ocr-result-meta">
            <span class="ocr-result-hint">${t('events.hintLv')} ${skill.hint}</span>
            ${skill.type ? `<span class="ocr-type">${escapeHTML(skill.type)}</span>` : ''}
          </div>
        </div>
        <div class="ocr-confidence-badge ${level}">${confidencePct}%</div>
      </div>`;

    // Suggestions row (shown inline below the main item when confidence is low)
    if (showSuggestions) {
      html += `
      <div class="ocr-suggestions" data-skill-index="${index}">
        <span class="ocr-suggestions-label">${t('events.didYouMean')}</span>
        <div class="ocr-suggestions-list">`;
      suggestions.forEach((sug, si) => {
        html += `<button type="button" class="ocr-suggestion-btn" data-skill-index="${index}" data-suggestion-index="${si}" title="${escapeHTML(sug.type || '')} (${sug.score}% match)">${escapeHTML(sug.name)}<span class="sug-score">${sug.score}%</span></button>`;
      });
      html += `
        </div>
      </div>`;
    }
  });

  resultsList.innerHTML = html;

  // Click-to-edit on result items
  resultsList.querySelectorAll('.ocr-result-item').forEach((item) => {
    item.addEventListener('click', function (e) {
      if (e.target.classList.contains('ocr-skill-checkbox')) return;
      const idx = parseInt(this.dataset.skillIndex, 10);
      if (!isNaN(idx)) openCorrectionModal(idx);
    });
  });

  // Suggestion buttons — one-click replace
  resultsList.querySelectorAll('.ocr-suggestion-btn').forEach((btn) => {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      const skillIdx = parseInt(this.dataset.skillIndex, 10);
      const sugIdx = parseInt(this.dataset.suggestionIndex, 10);
      const skill = window.ocrDetectedSkills?.[skillIdx];
      const sug = skill?.suggestions?.[sugIdx];
      if (!skill || !sug) return;

      // Cache the correction so OCR doesn't re-detect wrong name
      if (window.OCRMatcher && skill.rawText) {
        window.OCRMatcher.addCorrection(skill.rawText, sug.name);
      }

      // Replace skill data
      window.ocrDetectedSkills[skillIdx] = {
        ...skill,
        name: sug.name,
        type: sug.type || skill.type,
        confidence: Math.min(1, (sug.score || 80) / 100 + 0.15),
        suggestions: [],
      };

      displayOCRResults(window.ocrDetectedSkills);
    });
  });
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// OCR Results: Add skills to calculator handlers
const ocrAddAllBtn = document.getElementById('ocr-add-all');
const ocrAddSelectedBtn = document.getElementById('ocr-add-selected');
const ocrResultsCloseBtn = document.getElementById('ocr-results-close');
const ocrResultsPanel = document.getElementById('ocr-results-panel');

if (ocrAddAllBtn) {
  ocrAddAllBtn.addEventListener('click', function () {
    if (!window.ocrDetectedSkills || window.ocrDetectedSkills.length === 0) {
      return;
    }

    if (typeof window.applyOCRSkills === 'function') {
      // Show loading state
      const originalText = ocrAddAllBtn.textContent;
      ocrAddAllBtn.classList.add('loading');
      ocrAddAllBtn.disabled = true;

      // Use setTimeout to allow UI to update
      setTimeout(() => {
        window.applyOCRSkills(window.ocrDetectedSkills);

        // Show success state
        ocrAddAllBtn.classList.remove('loading');
        ocrAddAllBtn.classList.add('success');
        ocrAddAllBtn.textContent = t('events.skillsApplied');

        // Hide panel and reset button after delay
        setTimeout(() => {
          if (ocrResultsPanel) {
            ocrResultsPanel.style.display = 'none';
          }
          ocrAddAllBtn.classList.remove('success');
          ocrAddAllBtn.textContent = originalText;
          ocrAddAllBtn.disabled = false;
        }, 1500);
      }, 50);
    } else {
      console.error('[ocr] applyOCRSkills function not found');
      alert(t('events.calcNotAvailable'));
    }
  });
}

if (ocrAddSelectedBtn) {
  ocrAddSelectedBtn.addEventListener('click', function () {
    if (!window.ocrDetectedSkills || window.ocrDetectedSkills.length === 0) {
      return;
    }

    const checkboxes = document.querySelectorAll('.ocr-skill-checkbox');
    const selectedSkills = [];

    checkboxes.forEach((checkbox, index) => {
      if (checkbox.checked && window.ocrDetectedSkills[index]) {
        selectedSkills.push(window.ocrDetectedSkills[index]);
      }
    });

    if (selectedSkills.length === 0) {
      alert(t('events.selectOneSkill'));
      return;
    }

    if (typeof window.applyOCRSkills === 'function') {
      // Show loading state
      const originalText = ocrAddSelectedBtn.textContent;
      ocrAddSelectedBtn.classList.add('loading');
      ocrAddSelectedBtn.disabled = true;

      // Use setTimeout to allow UI to update
      setTimeout(() => {
        window.applyOCRSkills(selectedSkills);

        // Show success state
        ocrAddSelectedBtn.classList.remove('loading');
        ocrAddSelectedBtn.classList.add('success');
        ocrAddSelectedBtn.textContent = t('events.skillsApplied');

        // Hide panel and reset button after delay
        setTimeout(() => {
          if (ocrResultsPanel) {
            ocrResultsPanel.style.display = 'none';
          }
          ocrAddSelectedBtn.classList.remove('success');
          ocrAddSelectedBtn.textContent = originalText;
          ocrAddSelectedBtn.disabled = false;
        }, 1500);
      }, 50);
    } else {
      console.error('[ocr] applyOCRSkills function not found');
      alert(t('events.calcNotAvailable'));
    }
  });
}

if (ocrResultsCloseBtn) {
  ocrResultsCloseBtn.addEventListener('click', function () {
    if (ocrResultsPanel) {
      ocrResultsPanel.style.display = 'none';
    }
  });
}

// Manual correction modal handling
const correctionBackdrop = document.getElementById('skill-correction-backdrop');
const correctionModal = document.getElementById('skill-correction-modal');
const correctionModalClose = document.getElementById('correction-modal-close');
const correctionModalCancel = document.getElementById('correction-modal-cancel');
const correctionModalSave = document.getElementById('correction-modal-save');
const correctionSkillName = document.getElementById('correction-skill-name');
const correctionSkillCost = document.getElementById('correction-skill-cost');
const correctionSkillHint = document.getElementById('correction-skill-hint');

let editingSkillIndex = -1;
let correctionSkillDatalist = null;

function getOrCreateCorrectionDatalist() {
  if (correctionSkillDatalist) return correctionSkillDatalist;

  correctionSkillDatalist = document.getElementById('correction-skills-datalist');
  if (!correctionSkillDatalist) {
    correctionSkillDatalist = document.createElement('datalist');
    correctionSkillDatalist.id = 'correction-skills-datalist';
    document.body.appendChild(correctionSkillDatalist);
  }

  return correctionSkillDatalist;
}

function updateCorrectionDatalist(query) {
  const datalist = getOrCreateCorrectionDatalist();
  if (!datalist) return;

  datalist.innerHTML = '';

  if (!query || !skillNameIndex || skillNameIndex.size === 0) {
    const allSkills = Array.from(skillNameIndex.values()).slice(0, 50);
    allSkills.forEach((skill) => {
      const option = document.createElement('option');
      option.value = skill.name;
      datalist.appendChild(option);
    });
    return;
  }

  const queryNorm = normalize(query);
  const matches = [];

  for (const [normName, skill] of skillNameIndex) {
    if (normName.includes(queryNorm)) {
      matches.push({ skill, distance: 0 });
    } else {
      const dist = levenshteinDistance(queryNorm, normName);
      if (dist <= 3) {
        matches.push({ skill, distance: dist });
      }
    }
  }

  matches.sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance;
    return a.skill.name.localeCompare(b.skill.name);
  });

  matches.slice(0, 20).forEach((match) => {
    const option = document.createElement('option');
    option.value = match.skill.name;
    datalist.appendChild(option);
  });
}

function openCorrectionModal(index) {
  if (!window.ocrDetectedSkills || index < 0 || index >= window.ocrDetectedSkills.length) {
    return;
  }

  const skill = window.ocrDetectedSkills[index];
  editingSkillIndex = index;

  if (correctionSkillName) {
    correctionSkillName.value = skill.name || '';
    updateCorrectionDatalist(skill.name || '');
  }
  if (correctionSkillCost) correctionSkillCost.value = skill.cost !== null ? skill.cost : '';
  if (correctionSkillHint)
    correctionSkillHint.value =
      skill.hint !== null && skill.hint !== undefined ? String(skill.hint) : '0';

  if (correctionBackdrop) {
    correctionBackdrop.classList.add('open');
  }
}

function closeCorrectionModal() {
  if (correctionBackdrop) {
    correctionBackdrop.classList.remove('open');
  }
  editingSkillIndex = -1;
}

function saveCorrectionModal() {
  if (editingSkillIndex < 0 || !window.ocrDetectedSkills) {
    return;
  }

  const name = correctionSkillName ? correctionSkillName.value.trim() : '';
  if (!name) {
    alert(t('events.skillNameRequired'));
    return;
  }

  const cost =
    correctionSkillCost && correctionSkillCost.value !== ''
      ? parseInt(correctionSkillCost.value, 10)
      : null;
  const hint =
    correctionSkillHint && correctionSkillHint.value !== ''
      ? parseInt(correctionSkillHint.value, 10)
      : 0;

  if (cost !== null && (cost < 0 || cost > 999)) {
    alert(t('events.costRange'));
    return;
  }

  if (hint < 0 || hint > 5) {
    alert(t('events.hintRange'));
    return;
  }

  const oldSkill = window.ocrDetectedSkills[editingSkillIndex];

  // Cache correction so future OCR frames won't re-match to the wrong skill
  if (window.OCRMatcher && oldSkill.rawText && name !== oldSkill.name) {
    window.OCRMatcher.addCorrection(oldSkill.rawText, name);
  }

  window.ocrDetectedSkills[editingSkillIndex] = {
    ...oldSkill,
    name: name,
    cost: cost,
    hint: hint,
    confidence: 1.0, // User-corrected = full confidence
    suggestions: [],
  };

  displayOCRResults(window.ocrDetectedSkills);
  closeCorrectionModal();
}

if (correctionModalClose) {
  correctionModalClose.addEventListener('click', closeCorrectionModal);
}

if (correctionModalCancel) {
  correctionModalCancel.addEventListener('click', closeCorrectionModal);
}

if (correctionModalSave) {
  correctionModalSave.addEventListener('click', saveCorrectionModal);
}

if (correctionBackdrop) {
  correctionBackdrop.addEventListener('click', function (e) {
    if (e.target === correctionBackdrop) {
      closeCorrectionModal();
    }
  });
}

if (correctionSkillName) {
  getOrCreateCorrectionDatalist();

  correctionSkillName.setAttribute('list', 'correction-skills-datalist');
  correctionSkillName.setAttribute('autocomplete', 'off');

  correctionSkillName.addEventListener('input', function () {
    updateCorrectionDatalist(this.value);
  });

  correctionSkillName.addEventListener('focus', function () {
    if (!this.value) {
      updateCorrectionDatalist('');
    }
  });
}

// ─── Debug Overlay Display ──────────────────────────────────────
// Shows a visual overlay on the original image indicating where OCR scanned

function displayDebugOverlay(sourceCanvas, cropInfo, bestResult) {
  const Preprocess = window.OCRPreprocess;
  if (!Preprocess) return;

  const overlay = Preprocess.drawDebugOverlay(sourceCanvas, cropInfo);

  // Find or create the debug container
  let debugContainer = document.getElementById('ocr-debug-overlay');
  if (!debugContainer) {
    debugContainer = document.createElement('div');
    debugContainer.id = 'ocr-debug-overlay';
    debugContainer.style.cssText =
      'margin:12px 0;padding:12px;background:#1a1a2e;border:2px solid #00ff00;border-radius:8px;';

    const resultsPanel = document.getElementById('ocr-results-panel');
    if (resultsPanel) {
      resultsPanel.insertBefore(debugContainer, resultsPanel.firstChild);
    }
  }

  // Scale overlay to fit in the panel (max 500px wide)
  const maxW = 500;
  const scale = Math.min(1, maxW / overlay.width);
  const displayW = Math.round(overlay.width * scale);
  const displayH = Math.round(overlay.height * scale);

  debugContainer.innerHTML = `
    <div style="color:#00ff00;font-family:monospace;font-size:13px;margin-bottom:8px;font-weight:bold;">
      OCR Debug: ${cropInfo.layout.toUpperCase()} layout detected
    </div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start;">
      <div>
        <div style="color:#aaa;font-size:11px;margin-bottom:4px;">Scan Region (green = OCR area)</div>
        <canvas id="ocr-debug-canvas-overlay" width="${displayW}" height="${displayH}" style="border:1px solid #333;border-radius:4px;max-width:100%;"></canvas>
      </div>
      <div>
        <div style="color:#aaa;font-size:11px;margin-bottom:4px;">Cropped Input (what OCR sees)</div>
        <canvas id="ocr-debug-canvas-cropped" width="${Math.round(cropInfo.region.w * scale)}" height="${Math.round(cropInfo.region.h * scale)}" style="border:1px solid #333;border-radius:4px;max-width:100%;"></canvas>
      </div>
    </div>
    <div style="color:#ccc;font-family:monospace;font-size:11px;margin-top:8px;">
      Region: x=${cropInfo.region.x} y=${cropInfo.region.y} w=${cropInfo.region.w} h=${cropInfo.region.h}<br>
      Best variant: ${bestResult.variant} | OCR conf: ${bestResult.ocrConfidence}%<br>
      Raw text (first 200 chars): ${escapeHTML(bestResult.text.substring(0, 200))}
    </div>
  `;

  // Draw the overlay canvas
  const overlayCanvas = document.getElementById('ocr-debug-canvas-overlay');
  if (overlayCanvas) {
    const ctx = overlayCanvas.getContext('2d');
    ctx.drawImage(overlay, 0, 0, displayW, displayH);
  }

  // Draw the cropped canvas
  const croppedCanvas = document.getElementById('ocr-debug-canvas-cropped');
  if (croppedCanvas) {
    const ctx = croppedCanvas.getContext('2d');
    ctx.drawImage(cropInfo.canvas, 0, 0, croppedCanvas.width, croppedCanvas.height);
  }
}

// ─── Segmented Debug Overlay ────────────────────────────────────
// Shows card boundaries + per-card OCR text in the debug panel

function displaySegmentedDebugOverlay(sourceCanvas, cropInfo, cards, debugCardTexts) {
  const Preprocess = window.OCRPreprocess;
  if (!Preprocess) return;

  const overlay = Preprocess.drawSegmentedDebugOverlay(sourceCanvas, cropInfo, cards);

  let debugContainer = document.getElementById('ocr-debug-overlay');
  if (!debugContainer) {
    debugContainer = document.createElement('div');
    debugContainer.id = 'ocr-debug-overlay';
    debugContainer.style.cssText =
      'margin:12px 0;padding:12px;background:#1a1a2e;border:2px solid #00ff00;border-radius:8px;';
    const resultsPanel = document.getElementById('ocr-results-panel');
    if (resultsPanel) {
      resultsPanel.insertBefore(debugContainer, resultsPanel.firstChild);
    }
  }
  debugContainer.style.display = '';

  const maxW = 500;
  const scale = Math.min(1, maxW / overlay.width);
  const displayW = Math.round(overlay.width * scale);
  const displayH = Math.round(overlay.height * scale);

  let cardInfoHtml = '';
  for (const ct of debugCardTexts) {
    cardInfoHtml += `<div style="margin-top:4px;padding:4px 6px;background:#222;border-radius:4px;">`;
    cardInfoHtml += `<span style="color:#ffff00;">Card ${ct.card}</span>: `;
    cardInfoHtml += `name=<span style="color:#0f0;">"${escapeHTML(ct.nameText)}"</span> `;
    cardInfoHtml += `<span style="color:#888;">| full="${escapeHTML(ct.fullText.substring(0, 80))}..."</span>`;
    cardInfoHtml += `</div>`;
  }

  debugContainer.innerHTML = `
    <div style="color:#00ff00;font-family:monospace;font-size:13px;margin-bottom:8px;font-weight:bold;">
      OCR Debug: ${cropInfo.layout.toUpperCase()} layout | ${cards.length} cards detected
    </div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start;">
      <div>
        <div style="color:#aaa;font-size:11px;margin-bottom:4px;">
          <span style="color:#0f0;">Green</span>=scan region |
          <span style="color:#ff0;">Yellow</span>=card bounds |
          <span style="color:#0af;">Blue dash</span>=name cutoff
        </div>
        <canvas id="ocr-debug-canvas-overlay" width="${displayW}" height="${displayH}" style="border:1px solid #333;border-radius:4px;max-width:100%;"></canvas>
      </div>
    </div>
    <div style="color:#ccc;font-family:monospace;font-size:11px;margin-top:8px;">
      Region: x=${cropInfo.region.x} y=${cropInfo.region.y} w=${cropInfo.region.w} h=${cropInfo.region.h}<br>
      Cards: ${cards.map((c, i) => `#${i + 1}(y=${c.y} h=${c.h})`).join(', ')}
    </div>
    <div style="font-family:monospace;font-size:11px;margin-top:6px;">
      ${cardInfoHtml}
    </div>
  `;

  const overlayCanvas = document.getElementById('ocr-debug-canvas-overlay');
  if (overlayCanvas) {
    const ctx = overlayCanvas.getContext('2d');
    ctx.drawImage(overlay, 0, 0, displayW, displayH);
  }
}

// ─── Dev Debug Mode Toggle ──────────────────────────────────────

window._ocrDebugMode = false;

window.setOCRPreprocessing = function (enabled) {
  preprocessingEnabled = !!enabled;
  console.log('[ocr] Preprocessing:', preprocessingEnabled ? 'enabled' : 'disabled');
};

window.setOCRDebugMode = function (enabled) {
  window._ocrDebugMode = !!enabled;
  console.log('[ocr] Debug mode:', window._ocrDebugMode ? 'ON' : 'OFF');
  // Show/hide the overlay container
  const debugContainer = document.getElementById('ocr-debug-overlay');
  if (debugContainer && !enabled) {
    debugContainer.style.display = 'none';
  } else if (debugContainer && enabled) {
    debugContainer.style.display = '';
  }
};

window.showOCRDebug = function () {
  if (!window._ocrDebugInfo) {
    console.log('[ocr] No debug info available. Enable debug mode and run OCR first.');
    return;
  }
  const info = window._ocrDebugInfo;
  console.group('[OCR Debug Info]');
  console.log('Layout:', info.cropInfo?.layout || 'unknown');
  console.log('Crop region:', info.cropInfo?.region || 'none');
  console.log('Cards detected:', info.cards?.length || 0);
  if (info.debugCardTexts) {
    info.debugCardTexts.forEach((ct) => {
      console.log(
        `  Card ${ct.card}: name="${ct.nameText}" | full="${ct.fullText.substring(0, 80)}..." | conf=${ct.confidence}%`
      );
    });
  }
  console.log('Detected skills:', info.detectedSkills);
  console.groupEnd();
};

// Adjust crop region via console: window.setOCRRegion('pc', {x:0.01, y:0.32, w:0.38, h:0.53})
window.setOCRRegion = function (layout, region) {
  const Preprocess = window.OCRPreprocess;
  if (!Preprocess || !Preprocess.SKILL_REGIONS) {
    console.error('[ocr] OCRPreprocess not loaded');
    return;
  }
  if (!layout || !region) {
    console.log('[ocr] Current regions:', JSON.stringify(Preprocess.SKILL_REGIONS, null, 2));
    console.log('[ocr] Usage: window.setOCRRegion("pc", {x:0.01, y:0.32, w:0.38, h:0.53})');
    return;
  }
  Preprocess.SKILL_REGIONS[layout] = region;
  console.log(`[ocr] Updated ${layout} region:`, region);
};
