// OCR Image Preprocessing Pipeline
// Applies a series of image transformations to maximize OCR accuracy
// for skill name recognition in Uma Musume screenshots.
//
// Pipeline steps:
//   1. Upscale (2x-3x with bilinear interpolation)
//   2. Grayscale conversion
//   3. CLAHE-style adaptive contrast enhancement
//   4. Lightweight denoise (median filter)
//   5. Adaptive threshold (Sauvola-style) with bright/dark guard
//   6. Morphological close (fill thin glyph gaps)
//   7. Optional edge sharpening
//   8. Optional deskew (for tilted captures)
//   9. Video: best-frame selection via Laplacian sharpness

(function () {
  'use strict';

  // ─── Configuration ───────────────────────────────────────────────

  const DEFAULT_CONFIG = {
    targetScale: 2, // upscale factor (2x or 3x)
    enableCLAHE: true, // adaptive contrast
    claheClipLimit: 2.5, // CLAHE clip limit
    claheTileSize: 8, // CLAHE tile grid size
    enableDenoise: true, // median filter
    denoiseKernel: 3, // 3x3 median
    enableThreshold: true, // adaptive binarization
    thresholdBlockSize: 15, // local block radius
    thresholdC: 10, // constant subtracted from mean
    enableMorphClose: true, // fill glyph gaps
    morphCloseRadius: 1, // structuring element radius
    enableSharpen: false, // edge sharpening
    enableDeskew: false, // rotation correction
    generateDebug: false, // produce debug artifact images
    multiVariant: true, // run multiple preprocessing variants
  };

  // ─── Utility: Canvas helpers ────────────────────────────────────

  function createCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function getPixels(canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  function putPixels(canvas, imageData) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.putImageData(imageData, 0, 0);
  }

  // ─── Step 1: Upscale ────────────────────────────────────────────

  function upscale(srcCanvas, scale) {
    if (scale <= 1) return srcCanvas;
    const w = Math.round(srcCanvas.width * scale);
    const h = Math.round(srcCanvas.height * scale);
    const dst = createCanvas(w, h);
    const ctx = dst.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(srcCanvas, 0, 0, w, h);
    return dst;
  }

  // ─── Step 2: Grayscale ──────────────────────────────────────────

  function toGrayscale(imageData) {
    const { data, width, height } = imageData;
    const gray = new Uint8ClampedArray(width * height);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      gray[j] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
    }
    return { gray, width, height };
  }

  function grayToImageData(grayObj) {
    const { gray, width, height } = grayObj;
    const id = new ImageData(width, height);
    for (let i = 0, j = 0; i < id.data.length; i += 4, j++) {
      id.data[i] = id.data[i + 1] = id.data[i + 2] = gray[j];
      id.data[i + 3] = 255;
    }
    return id;
  }

  // ─── Step 3: CLAHE (Contrast Limited Adaptive Histogram Equalization) ──

  function applyCLAHE(grayObj, clipLimit, tileSize) {
    const { gray, width, height } = grayObj;
    const out = new Uint8ClampedArray(gray.length);

    const tilesX = Math.max(1, Math.ceil(width / tileSize));
    const tilesY = Math.max(1, Math.ceil(height / tileSize));

    // Build per-tile histograms
    const tileHists = [];
    for (let ty = 0; ty < tilesY; ty++) {
      for (let tx = 0; tx < tilesX; tx++) {
        const x0 = Math.floor((tx * width) / tilesX);
        const y0 = Math.floor((ty * height) / tilesY);
        const x1 = Math.floor(((tx + 1) * width) / tilesX);
        const y1 = Math.floor(((ty + 1) * height) / tilesY);

        const hist = new Uint32Array(256);
        let count = 0;
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            hist[gray[y * width + x]]++;
            count++;
          }
        }

        // Clip histogram
        const limit = Math.max(1, Math.round((clipLimit * count) / 256));
        let excess = 0;
        for (let i = 0; i < 256; i++) {
          if (hist[i] > limit) {
            excess += hist[i] - limit;
            hist[i] = limit;
          }
        }

        // Redistribute excess
        const increment = Math.floor(excess / 256);
        const remainder = excess - increment * 256;
        for (let i = 0; i < 256; i++) {
          hist[i] += increment + (i < remainder ? 1 : 0);
        }

        // Build CDF (lookup table)
        const lut = new Uint8ClampedArray(256);
        let cumSum = 0;
        for (let i = 0; i < 256; i++) {
          cumSum += hist[i];
          lut[i] = Math.round(((cumSum - 1) * 255) / Math.max(1, count - 1));
        }

        tileHists.push({ x0, y0, x1, y1, lut, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 });
      }
    }

    // Apply with bilinear interpolation between tile LUTs
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const px = gray[y * width + x];

        // Find surrounding tile centers
        const txf = (x / width) * tilesX - 0.5;
        const tyf = (y / height) * tilesY - 0.5;
        const tx0 = Math.max(0, Math.floor(txf));
        const ty0 = Math.max(0, Math.floor(tyf));
        const tx1 = Math.min(tilesX - 1, tx0 + 1);
        const ty1 = Math.min(tilesY - 1, ty0 + 1);

        const fx = txf - tx0;
        const fy = tyf - ty0;

        const tl = tileHists[ty0 * tilesX + tx0].lut[px];
        const tr = tileHists[ty0 * tilesX + tx1].lut[px];
        const bl = tileHists[ty1 * tilesX + tx0].lut[px];
        const br = tileHists[ty1 * tilesX + tx1].lut[px];

        const top = tl + (tr - tl) * fx;
        const bot = bl + (br - bl) * fx;
        out[y * width + x] = Math.round(top + (bot - top) * fy);
      }
    }

    return { gray: out, width, height };
  }

  // ─── Step 4: Median filter (denoise) ───────────────────────────

  function medianFilter(grayObj, kernelSize) {
    const { gray, width, height } = grayObj;
    const out = new Uint8ClampedArray(gray.length);
    const half = (kernelSize - 1) >> 1;
    const buf = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        buf.length = 0;
        for (let ky = -half; ky <= half; ky++) {
          const yy = Math.min(height - 1, Math.max(0, y + ky));
          for (let kx = -half; kx <= half; kx++) {
            const xx = Math.min(width - 1, Math.max(0, x + kx));
            buf.push(gray[yy * width + xx]);
          }
        }
        buf.sort((a, b) => a - b);
        out[y * width + x] = buf[buf.length >> 1];
      }
    }

    return { gray: out, width, height };
  }

  // ─── Step 5: Adaptive threshold (Sauvola-inspired) ─────────────

  function adaptiveThreshold(grayObj, blockRadius, C) {
    const { gray, width, height } = grayObj;
    const out = new Uint8ClampedArray(gray.length);

    // Build integral image for fast local mean computation
    const integral = new Float64Array((width + 1) * (height + 1));
    const integralSq = new Float64Array((width + 1) * (height + 1));
    const iw = width + 1;

    for (let y = 0; y < height; y++) {
      let rowSum = 0,
        rowSumSq = 0;
      for (let x = 0; x < width; x++) {
        const v = gray[y * width + x];
        rowSum += v;
        rowSumSq += v * v;
        integral[(y + 1) * iw + (x + 1)] = integral[y * iw + (x + 1)] + rowSum;
        integralSq[(y + 1) * iw + (x + 1)] = integralSq[y * iw + (x + 1)] + rowSumSq;
      }
    }

    const k = 0.2; // Sauvola sensitivity parameter
    const R = 128; // dynamic range of standard deviation

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const x0 = Math.max(0, x - blockRadius);
        const y0 = Math.max(0, y - blockRadius);
        const x1 = Math.min(width - 1, x + blockRadius);
        const y1 = Math.min(height - 1, y + blockRadius);

        const area = (x1 - x0 + 1) * (y1 - y0 + 1);
        const sum =
          integral[(y1 + 1) * iw + (x1 + 1)] -
          integral[y0 * iw + (x1 + 1)] -
          integral[(y1 + 1) * iw + x0] +
          integral[y0 * iw + x0];
        const sumSq =
          integralSq[(y1 + 1) * iw + (x1 + 1)] -
          integralSq[y0 * iw + (x1 + 1)] -
          integralSq[(y1 + 1) * iw + x0] +
          integralSq[y0 * iw + x0];

        const mean = sum / area;
        const variance = Math.max(0, sumSq / area - mean * mean);
        const stdDev = Math.sqrt(variance);

        // Sauvola threshold: T = mean * (1 + k * (stdDev / R - 1))
        const threshold = mean * (1 + k * (stdDev / R - 1)) - C;

        out[y * width + x] = gray[y * width + x] > threshold ? 255 : 0;
      }
    }

    return { gray: out, width, height };
  }

  // Otsu's method for global thresholding (fallback/variant)
  function otsuThreshold(grayObj) {
    const { gray, width, height } = grayObj;
    const hist = new Uint32Array(256);
    const total = gray.length;

    for (let i = 0; i < total; i++) hist[gray[i]]++;

    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];

    let sumB = 0,
      wB = 0,
      maxVariance = 0,
      threshold = 0;

    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (wB === 0) continue;
      const wF = total - wB;
      if (wF === 0) break;

      sumB += t * hist[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);

      if (between > maxVariance) {
        maxVariance = between;
        threshold = t;
      }
    }

    const out = new Uint8ClampedArray(total);
    for (let i = 0; i < total; i++) {
      out[i] = gray[i] > threshold ? 255 : 0;
    }

    return { gray: out, width, height };
  }

  // ─── Step 6: Morphological close (dilate then erode) ───────────

  function morphClose(grayObj, radius) {
    return erode(dilate(grayObj, radius), radius);
  }

  function dilate(grayObj, radius) {
    const { gray, width, height } = grayObj;
    const out = new Uint8ClampedArray(gray.length);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let maxVal = 0;
        for (let ky = -radius; ky <= radius; ky++) {
          const yy = Math.min(height - 1, Math.max(0, y + ky));
          for (let kx = -radius; kx <= radius; kx++) {
            const xx = Math.min(width - 1, Math.max(0, x + kx));
            const v = gray[yy * width + xx];
            if (v > maxVal) maxVal = v;
          }
        }
        out[y * width + x] = maxVal;
      }
    }

    return { gray: out, width, height };
  }

  function erode(grayObj, radius) {
    const { gray, width, height } = grayObj;
    const out = new Uint8ClampedArray(gray.length);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let minVal = 255;
        for (let ky = -radius; ky <= radius; ky++) {
          const yy = Math.min(height - 1, Math.max(0, y + ky));
          for (let kx = -radius; kx <= radius; kx++) {
            const xx = Math.min(width - 1, Math.max(0, x + kx));
            const v = gray[yy * width + xx];
            if (v < minVal) minVal = v;
          }
        }
        out[y * width + x] = minVal;
      }
    }

    return { gray: out, width, height };
  }

  // ─── Step 7: Edge sharpening (unsharp mask) ────────────────────

  function sharpen(grayObj) {
    const { gray, width, height } = grayObj;
    const out = new Uint8ClampedArray(gray.length);
    const amount = 0.5;

    // Simple 3x3 Gaussian blur
    const blurred = new Float32Array(gray.length);
    const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1];
    const kSum = 16;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let ki = 0;
        for (let ky = -1; ky <= 1; ky++) {
          const yy = Math.min(height - 1, Math.max(0, y + ky));
          for (let kx = -1; kx <= 1; kx++) {
            const xx = Math.min(width - 1, Math.max(0, x + kx));
            sum += gray[yy * width + xx] * kernel[ki++];
          }
        }
        blurred[y * width + x] = sum / kSum;
      }
    }

    // Unsharp mask: original + amount * (original - blurred)
    for (let i = 0; i < gray.length; i++) {
      const v = gray[i] + amount * (gray[i] - blurred[i]);
      out[i] = Math.max(0, Math.min(255, Math.round(v)));
    }

    return { gray: out, width, height };
  }

  // ─── Sharpness metric (Laplacian variance) ────────────────────

  function laplacianVariance(grayObj) {
    const { gray, width, height } = grayObj;
    // Laplacian kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0]
    let sum = 0,
      sumSq = 0,
      count = 0;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const lap =
          -4 * gray[y * width + x] +
          gray[(y - 1) * width + x] +
          gray[(y + 1) * width + x] +
          gray[y * width + (x - 1)] +
          gray[y * width + (x + 1)];
        sum += lap;
        sumSq += lap * lap;
        count++;
      }
    }

    const mean = sum / count;
    return sumSq / count - mean * mean;
  }

  // ─── Detect if image is dark or light background ───────────────

  function detectBackground(grayObj) {
    const { gray } = grayObj;
    let sum = 0;
    // Sample corners and edges to detect background type
    const n = gray.length;
    for (let i = 0; i < n; i++) sum += gray[i];
    const mean = sum / n;
    return mean < 128 ? 'dark' : 'light';
  }

  // ─── Invert image (for dark backgrounds) ──────────────────────

  function invertGray(grayObj) {
    const { gray, width, height } = grayObj;
    const out = new Uint8ClampedArray(gray.length);
    for (let i = 0; i < gray.length; i++) {
      out[i] = 255 - gray[i];
    }
    return { gray: out, width, height };
  }

  // ─── Main preprocessing pipeline ──────────────────────────────

  function preprocessImage(sourceCanvas, config) {
    const cfg = Object.assign({}, DEFAULT_CONFIG, config || {});
    const debugArtifacts = [];
    const startTime = performance.now();

    // 1. Upscale
    let canvas = upscale(sourceCanvas, cfg.targetScale);

    // 2. Grayscale
    let grayObj = toGrayscale(getPixels(canvas));

    if (cfg.generateDebug) {
      const dbg = createCanvas(grayObj.width, grayObj.height);
      putPixels(dbg, grayToImageData(grayObj));
      debugArtifacts.push({ label: 'Grayscale', canvas: dbg });
    }

    // Detect background type
    const bgType = detectBackground(grayObj);

    // For dark backgrounds, invert before processing
    let inverted = false;
    if (bgType === 'dark') {
      grayObj = invertGray(grayObj);
      inverted = true;
    }

    // 3. CLAHE
    if (cfg.enableCLAHE) {
      grayObj = applyCLAHE(grayObj, cfg.claheClipLimit, cfg.claheTileSize);
      if (cfg.generateDebug) {
        const dbg = createCanvas(grayObj.width, grayObj.height);
        putPixels(dbg, grayToImageData(grayObj));
        debugArtifacts.push({ label: 'CLAHE', canvas: dbg });
      }
    }

    // 4. Denoise
    if (cfg.enableDenoise) {
      grayObj = medianFilter(grayObj, cfg.denoiseKernel);
    }

    // 5. Optional sharpen
    if (cfg.enableSharpen) {
      grayObj = sharpen(grayObj);
    }

    // Measure sharpness before thresholding
    const sharpnessScore = laplacianVariance(grayObj);

    // 6. Adaptive threshold
    let thresholdedObj = null;
    if (cfg.enableThreshold) {
      thresholdedObj = adaptiveThreshold(grayObj, cfg.thresholdBlockSize, cfg.thresholdC);
      if (cfg.generateDebug) {
        const dbg = createCanvas(thresholdedObj.width, thresholdedObj.height);
        putPixels(dbg, grayToImageData(thresholdedObj));
        debugArtifacts.push({ label: 'Threshold', canvas: dbg });
      }
    }

    // 7. Morphological close
    if (cfg.enableMorphClose && thresholdedObj) {
      thresholdedObj = morphClose(thresholdedObj, cfg.morphCloseRadius);
      if (cfg.generateDebug) {
        const dbg = createCanvas(thresholdedObj.width, thresholdedObj.height);
        putPixels(dbg, grayToImageData(thresholdedObj));
        debugArtifacts.push({ label: 'Morph Close', canvas: dbg });
      }
    }

    // Build final output canvas (thresholded version)
    const finalGray = thresholdedObj || grayObj;
    const resultCanvas = createCanvas(finalGray.width, finalGray.height);
    putPixels(resultCanvas, grayToImageData(finalGray));

    // Also build a "grayscale enhanced" variant (no thresholding, for OCR engines
    // that handle their own binarization better)
    const enhancedCanvas = createCanvas(grayObj.width, grayObj.height);
    putPixels(enhancedCanvas, grayToImageData(grayObj));

    const elapsed = performance.now() - startTime;

    return {
      primary: resultCanvas, // thresholded, best for Tesseract
      enhanced: enhancedCanvas, // grayscale enhanced, alternate for OCR
      sharpness: sharpnessScore,
      background: bgType,
      inverted,
      debugArtifacts,
      elapsedMs: elapsed,
    };
  }

  // ─── Multi-variant pipeline ────────────────────────────────────
  // Runs several preprocessing configs and returns all variants
  // so the OCR engine can pick the best result.

  function preprocessMultiVariant(sourceCanvas, baseConfig) {
    const variants = [];

    // Variant 1: Standard pipeline (adaptive threshold)
    variants.push({
      label: 'standard',
      ...preprocessImage(sourceCanvas, {
        ...baseConfig,
        targetScale: 2,
        enableThreshold: true,
        enableSharpen: false,
      }),
    });

    // Variant 2: Higher scale with sharpen (for low-res captures)
    variants.push({
      label: 'highres',
      ...preprocessImage(sourceCanvas, {
        ...baseConfig,
        targetScale: 3,
        enableThreshold: true,
        enableSharpen: true,
      }),
    });

    // Variant 3: Enhanced grayscale only (let Tesseract handle binarization)
    variants.push({
      label: 'grayscale',
      ...preprocessImage(sourceCanvas, {
        ...baseConfig,
        targetScale: 2,
        enableThreshold: false,
        enableMorphClose: false,
        enableSharpen: false,
      }),
    });

    // Variant 4: Otsu global threshold (handles uniform backgrounds better)
    const grayOnly = preprocessImage(sourceCanvas, {
      ...baseConfig,
      targetScale: 2,
      enableThreshold: false,
      enableMorphClose: false,
    });
    const grayObj = toGrayscale(getPixels(grayOnly.enhanced));
    const otsuResult = otsuThreshold(grayObj);
    const otsuCanvas = createCanvas(otsuResult.width, otsuResult.height);
    putPixels(otsuCanvas, grayToImageData(otsuResult));
    variants.push({
      label: 'otsu',
      primary: otsuCanvas,
      enhanced: grayOnly.enhanced,
      sharpness: grayOnly.sharpness,
      background: grayOnly.background,
      inverted: grayOnly.inverted,
      debugArtifacts: [],
      elapsedMs: grayOnly.elapsedMs,
    });

    return variants;
  }

  // ─── Video: Best frame selection ───────────────────────────────

  function selectBestFrame(frames) {
    if (!frames || frames.length === 0) return null;
    if (frames.length === 1) return { canvas: frames[0], index: 0, sharpness: 0 };

    let bestIdx = 0;
    let bestSharpness = -Infinity;

    for (let i = 0; i < frames.length; i++) {
      const grayObj = toGrayscale(getPixels(frames[i]));
      const s = laplacianVariance(grayObj);
      if (s > bestSharpness) {
        bestSharpness = s;
        bestIdx = i;
      }
    }

    return {
      canvas: frames[bestIdx],
      index: bestIdx,
      sharpness: bestSharpness,
    };
  }

  // ─── Convert blob/file to canvas ──────────────────────────────

  async function blobToCanvas(blob) {
    const bmp = await createImageBitmap(blob);
    const c = createCanvas(bmp.width, bmp.height);
    c.getContext('2d', { willReadFrequently: true }).drawImage(bmp, 0, 0);
    bmp.close();
    return c;
  }

  // ─── Canvas to blob for OCR ───────────────────────────────────

  function canvasToBlob(canvas, type) {
    return new Promise((resolve) => canvas.toBlob(resolve, type || 'image/png'));
  }

  // ─── Region of Interest: Skill Panel Cropping ──────────────

  // The Uma Musume skill selection screen has a specific layout:
  //   PC (landscape):  Skills appear in a left panel (~2-38% x, ~32-85% y)
  //   Mobile (portrait): Skills appear in the middle (~0-85% x, ~22-80% y)
  //
  // We detect aspect ratio to choose the right region, then crop before OCR
  // to avoid reading menu text, log entries, scheduled races, etc.

  const SKILL_REGIONS = {
    pc: { x: 0.01, y: 0.27, w: 0.4, h: 0.58 },
    mobile: { x: 0.0, y: 0.17, w: 0.98, h: 0.7 },
  };

  function detectLayout(canvas) {
    const ratio = canvas.width / canvas.height;
    if (ratio >= 1.1) return 'pc';
    return 'mobile';
  }

  function cropSkillRegion(sourceCanvas, forceRegion) {
    const layout = detectLayout(sourceCanvas);
    const region = forceRegion || SKILL_REGIONS[layout];
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;

    const cropX = Math.round(region.x * w);
    const cropY = Math.round(region.y * h);
    const cropW = Math.round(region.w * w);
    const cropH = Math.round(region.h * h);

    const cropped = createCanvas(cropW, cropH);
    const cctx = cropped.getContext('2d', { willReadFrequently: true });
    cctx.drawImage(sourceCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    return {
      canvas: cropped,
      layout,
      region: { x: cropX, y: cropY, w: cropW, h: cropH },
      regionPct: region,
    };
  }

  function drawDebugOverlay(sourceCanvas, cropInfo) {
    const overlay = createCanvas(sourceCanvas.width, sourceCanvas.height);
    const octx = overlay.getContext('2d', { willReadFrequently: true });

    // Draw original image
    octx.drawImage(sourceCanvas, 0, 0);

    // Dim the non-crop area
    octx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    octx.fillRect(0, 0, overlay.width, overlay.height);

    // Draw the crop region bright (clear the dimming)
    const r = cropInfo.region;
    octx.drawImage(sourceCanvas, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);

    // Draw a green border around the crop region
    octx.strokeStyle = '#00ff00';
    octx.lineWidth = 3;
    octx.strokeRect(r.x, r.y, r.w, r.h);

    // Label
    octx.fillStyle = '#00ff00';
    octx.font = 'bold 16px monospace';
    octx.fillText(`OCR Region: ${cropInfo.layout.toUpperCase()} layout`, r.x + 5, r.y - 8);

    return overlay;
  }

  // ─── Skill Card Segmentation ──────────────────────────────────
  // Uses a combined "content score" per row (brightness + horizontal edge
  // density) to find card boundaries.  Card rows have text/icons → high
  // edge density.  Gaps between cards have uniform background → near-zero
  // edge density.  We find valleys (local minima) in the combined score
  // and use the deepest ones as card separators.

  function segmentSkillCards(croppedCanvas) {
    const grayObj = toGrayscale(getPixels(croppedCanvas));
    const { gray, width, height } = grayObj;

    // Analyze center strip (skip icon column on left, badge area on right)
    const x1 = Math.round(width * 0.15);
    const x2 = Math.round(width * 0.85);
    const sw = x2 - x1;

    // ── Signal 1: Row brightness ──
    const rowBright = new Float32Array(height);
    for (let y = 0; y < height; y++) {
      let sum = 0;
      for (let x = x1; x < x2; x++) sum += gray[y * width + x];
      rowBright[y] = sum / sw;
    }

    // ── Signal 2: Horizontal edge density ──
    // Counts sharp brightness transitions within each row.
    // Card rows (text, icons) → many edges;  gaps → few/none.
    const EDGE_THRESH = 20;
    const edgeDensity = new Float32Array(height);
    for (let y = 0; y < height; y++) {
      let edges = 0;
      for (let x = x1 + 1; x < x2; x++) {
        if (Math.abs(gray[y * width + x] - gray[y * width + (x - 1)]) >= EDGE_THRESH) {
          edges++;
        }
      }
      edgeDensity[y] = edges;
    }

    // ── Normalize both signals to [0, 1] ──
    let bMin = Infinity,
      bMax = -Infinity;
    let eMin = Infinity,
      eMax = -Infinity;
    for (let y = 0; y < height; y++) {
      if (rowBright[y] < bMin) bMin = rowBright[y];
      if (rowBright[y] > bMax) bMax = rowBright[y];
      if (edgeDensity[y] < eMin) eMin = edgeDensity[y];
      if (edgeDensity[y] > eMax) eMax = edgeDensity[y];
    }
    const bRange = Math.max(1, bMax - bMin);
    const eRange = Math.max(1, eMax - eMin);

    // ── Combined content score (brightness-gated) ──
    // nb² ensures dark rows (game scene, character art) are strongly
    // suppressed even if they have high edge density.  Only bright
    // rows with high edge density (= skill card text) score high.
    const raw = new Float32Array(height);
    for (let y = 0; y < height; y++) {
      const nb = (rowBright[y] - bMin) / bRange;
      const ne = (edgeDensity[y] - eMin) / eRange;
      raw[y] = nb * nb * (0.15 + 0.85 * ne);
    }

    // ── Smooth (±3 rows) to reduce single-row noise ──
    const score = new Float32Array(height);
    for (let y = 0; y < height; y++) {
      let s = 0,
        c = 0;
      for (let dy = -3; dy <= 3; dy++) {
        const yy = y + dy;
        if (yy >= 0 && yy < height) {
          s += raw[yy];
          c++;
        }
      }
      score[y] = s / c;
    }

    // ── Find valleys (local minima) across the full profile ──
    const MIN_CARD_H = 50;
    const CONTEXT = 30; // rows to examine on each side

    const valleys = [];
    for (let y = MIN_CARD_H; y < height - MIN_CARD_H; y++) {
      let leftMax = -Infinity;
      for (let dy = -CONTEXT; dy <= -3; dy++) {
        const yy = y + dy;
        if (yy >= 0) leftMax = Math.max(leftMax, score[yy]);
      }
      let rightMax = -Infinity;
      for (let dy = 3; dy <= CONTEXT; dy++) {
        const yy = y + dy;
        if (yy < height) rightMax = Math.max(rightMax, score[yy]);
      }
      if (leftMax <= 0 || rightMax <= 0) continue;

      const depth = Math.min(leftMax, rightMax) - score[y];
      if (depth > 0) {
        valleys.push({ y, depth, val: score[y] });
      }
    }

    if (typeof OCRPreprocess !== 'undefined' && OCRPreprocess._debug)
      console.log(`[segment] ${valleys.length} raw valleys (height=${height})`);

    if (valleys.length === 0) {
      const avg = score.reduce((a, b) => a + b, 0) / height;
      if (avg > 0.15) return [{ y: 0, h: height }];
      return [];
    }

    // ── Cluster nearby valleys (within 20px), keep deepest per cluster ──
    valleys.sort((a, b) => a.y - b.y);
    const clusters = [[valleys[0]]];
    for (let i = 1; i < valleys.length; i++) {
      const last = clusters[clusters.length - 1];
      if (valleys[i].y - last[last.length - 1].y <= 20) {
        last.push(valleys[i]);
      } else {
        clusters.push([valleys[i]]);
      }
    }
    const candidates = clusters.map((cl) =>
      cl.reduce((best, v) => (v.depth > best.depth ? v : best))
    );

    if (typeof OCRPreprocess !== 'undefined' && OCRPreprocess._debug)
      console.log(
        `[segment] ${candidates.length} valley clusters, depths: [${candidates.map((c) => c.depth.toFixed(3)).join(', ')}]`
      );

    // ── Select significant separators ──
    // Keep all valleys whose depth is at least 15% of the deepest.
    const MAX_SEPS = 5; // at most 6 cards
    const byDepth = candidates.slice().sort((a, b) => b.depth - a.depth);
    const cutoff = byDepth[0].depth * 0.15;

    const separators = byDepth
      .filter((s) => s.depth >= cutoff)
      .slice(0, MAX_SEPS)
      .sort((a, b) => a.y - b.y);

    if (typeof OCRPreprocess !== 'undefined' && OCRPreprocess._debug)
      console.log(
        `[segment] ${separators.length} separators (cutoff=${cutoff.toFixed(3)}): y=[${separators.map((s) => s.y).join(', ')}]`
      );

    if (separators.length === 0) {
      return [{ y: 0, h: height }];
    }

    // ── Build card list ──
    // Find band start/end (first/last row with score > 0.12)
    let bandStart = 0,
      bandEnd = height - 1;
    for (let y = 0; y < height; y++) {
      if (score[y] > 0.12) {
        bandStart = y;
        break;
      }
    }
    for (let y = height - 1; y >= 0; y--) {
      if (score[y] > 0.12) {
        bandEnd = y;
        break;
      }
    }

    const bounds = [bandStart, ...separators.map((s) => s.y), bandEnd + 1];
    const cards = [];
    for (let i = 0; i < bounds.length - 1; i++) {
      const cy = bounds[i];
      const ch = bounds[i + 1] - cy;
      if (ch >= MIN_CARD_H) {
        cards.push({ y: cy, h: ch });
      }
    }

    // Sanity: more than 6 cards is suspicious — keep only the deepest separators
    if (cards.length > 6) {
      const topSeps = byDepth.slice(0, 4).sort((a, b) => a.y - b.y);
      const b2 = [bandStart, ...topSeps.map((s) => s.y), bandEnd + 1];
      const c2 = [];
      for (let i = 0; i < b2.length - 1; i++) {
        const cy = b2[i];
        const ch = b2[i + 1] - cy;
        if (ch >= MIN_CARD_H) c2.push({ y: cy, h: ch });
      }
      return c2;
    }

    return cards;
  }

  // Extract the name row from each card (top ~35% where the skill name appears)
  // and the full card (for hint badge extraction)
  function extractCardRegions(croppedCanvas, cards) {
    const regions = [];
    const w = croppedCanvas.width;

    for (const card of cards) {
      // Name region: top ~35% of card, full width (catches name + hint badge)
      const nameH = Math.round(card.h * 0.35);
      const nameCanvas = createCanvas(w, nameH);
      const nctx = nameCanvas.getContext('2d', { willReadFrequently: true });
      nctx.drawImage(croppedCanvas, 0, card.y, w, nameH, 0, 0, w, nameH);

      // Full card region (for hint extraction)
      const fullCanvas = createCanvas(w, card.h);
      const fctx = fullCanvas.getContext('2d', { willReadFrequently: true });
      fctx.drawImage(croppedCanvas, 0, card.y, w, card.h, 0, 0, w, card.h);

      regions.push({
        nameCanvas,
        fullCanvas,
        cardY: card.y,
        cardH: card.h,
        nameH,
      });
    }

    return regions;
  }

  // Draw debug overlay with card segmentation lines
  function drawSegmentedDebugOverlay(sourceCanvas, cropInfo, cards) {
    const overlay = drawDebugOverlay(sourceCanvas, cropInfo);
    const octx = overlay.getContext('2d', { willReadFrequently: true });

    const r = cropInfo.region;

    // Draw card boundaries
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const absY = r.y + card.y;

      // Yellow border for each detected card
      octx.strokeStyle = '#ffff00';
      octx.lineWidth = 2;
      octx.strokeRect(r.x + 2, absY, r.w - 4, card.h);

      // Blue line showing name region cutoff (top 35%)
      const nameH = Math.round(card.h * 0.35);
      octx.strokeStyle = '#00aaff';
      octx.lineWidth = 1;
      octx.setLineDash([4, 4]);
      octx.beginPath();
      octx.moveTo(r.x + 2, absY + nameH);
      octx.lineTo(r.x + r.w - 2, absY + nameH);
      octx.stroke();
      octx.setLineDash([]);

      // Card label
      octx.fillStyle = '#ffff00';
      octx.font = 'bold 12px monospace';
      octx.fillText(`Card ${i + 1}`, r.x + 6, absY + 14);
    }

    return overlay;
  }

  // ─── Export ────────────────────────────────────────────────────

  window.OCRPreprocess = {
    DEFAULT_CONFIG,
    SKILL_REGIONS,
    preprocessImage,
    preprocessMultiVariant,
    selectBestFrame,
    blobToCanvas,
    canvasToBlob,
    laplacianVariance,
    toGrayscale,
    getPixels,
    cropSkillRegion,
    detectLayout,
    drawDebugOverlay,
    segmentSkillCards,
    extractCardRegions,
    drawSegmentedDebugOverlay,
  };
})();
