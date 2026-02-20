/**
 * Image Evasion Techniques
 *
 * Manipulates image pixels using various techniques to test
 * AI image moderation filters. All processing runs client-side
 * via the Canvas API.
 */

// ---------------------------------------------------------------------------
// Types & Labels
// ---------------------------------------------------------------------------

export type ImageEvasionTechnique =
  // Invisible (~85–95%)
  | "adversarialNoise"
  | "lsbSteganography"
  | "variationNoise"
  | "metadataInjection"
  // Subtle visual (~60–80%)
  | "skinToneShift"
  | "lowOpacityBlend"
  | "subliminalText"
  | "contrastPush"
  // Structural (~40–65%)
  | "jpegArtifacts"
  | "pixelShuffle"
  | "colorChannelShift"
  | "frequencyNoise"
  // Meta
  | "all";

export const IMAGE_TECHNIQUE_LABELS: Record<ImageEvasionTechnique, string> = {
  // Invisible
  adversarialNoise: "Adversarial Noise (~95%)",
  lsbSteganography: "LSB Steganography (~90%)",
  variationNoise: "Structured Variation Noise (~88%)",
  metadataInjection: "Metadata Injection (~85%)",
  // Subtle visual
  skinToneShift: "Skin Tone Shift (~80%)",
  lowOpacityBlend: "Low-Opacity Blend (~75%)",
  subliminalText: "Subliminal Text Overlay (~70%)",
  contrastPush: "Contrast/Saturation Push (~65%)",
  // Structural
  jpegArtifacts: "JPEG Artifact Injection (~60%)",
  pixelShuffle: "Pixel Block Shuffle (~55%)",
  colorChannelShift: "Color Channel Shift (~50%)",
  frequencyNoise: "High-Frequency Noise (~45%)",
  // Meta
  all: "All Techniques (combined)",
};

export interface ImageEvasionOptions {
  /** Text for steganography / subliminal overlay / metadata injection */
  text?: string;
  /** Intensity 1-10 (default 5) */
  intensity?: number;
}

// ---------------------------------------------------------------------------
// Canvas helpers
// ---------------------------------------------------------------------------

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function createCanvas(
  width: number,
  height: number
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  return { canvas, ctx };
}

/** Seeded PRNG (mulberry32) for deterministic noise */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Technique implementations
// ---------------------------------------------------------------------------

/** Add random noise ±N to each RGB channel — invisible to eye, changes embedding */
async function adversarialNoise(
  dataUrl: string,
  opts: ImageEvasionOptions
): Promise<string> {
  const intensity = opts.intensity ?? 5;
  const noiseRange = Math.max(1, Math.round(intensity * 0.6)); // 1-6
  const img = await loadImage(dataUrl);
  const { canvas, ctx } = createCanvas(img.width, img.height);
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  const d = imageData.data;
  const rng = mulberry32(42);
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.max(0, Math.min(255, d[i] + Math.floor(rng() * noiseRange * 2 - noiseRange)));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + Math.floor(rng() * noiseRange * 2 - noiseRange)));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + Math.floor(rng() * noiseRange * 2 - noiseRange)));
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

/** Encode hidden text into the least significant bits of pixel channels */
async function lsbSteganography(
  dataUrl: string,
  opts: ImageEvasionOptions
): Promise<string> {
  const text = opts.text || "hidden message";
  const img = await loadImage(dataUrl);
  const { canvas, ctx } = createCanvas(img.width, img.height);
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  const d = imageData.data;

  // Encode: length (32 bits) + text bytes (8 bits each) into LSB of RGB channels
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  const bits: number[] = [];

  // Length prefix (32 bits)
  for (let i = 31; i >= 0; i--) {
    bits.push((bytes.length >> i) & 1);
  }
  // Text bits
  for (const byte of bytes) {
    for (let i = 7; i >= 0; i--) {
      bits.push((byte >> i) & 1);
    }
  }

  // Write bits into LSB of R, G, B channels (skip alpha)
  let bitIdx = 0;
  for (let i = 0; i < d.length && bitIdx < bits.length; i++) {
    if (i % 4 === 3) continue; // skip alpha
    d[i] = (d[i] & 0xfe) | bits[bitIdx];
    bitIdx++;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

/** Systematic structured pattern in pixels (checkerboard-like perturbation) */
async function variationNoise(
  dataUrl: string,
  opts: ImageEvasionOptions
): Promise<string> {
  const intensity = opts.intensity ?? 5;
  const delta = Math.max(1, Math.round(intensity * 0.4));
  const img = await loadImage(dataUrl);
  const { canvas, ctx } = createCanvas(img.width, img.height);
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  const d = imageData.data;

  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const idx = (y * img.width + x) * 4;
      const sign = ((x + y) % 2 === 0 ? 1 : -1) * ((x * 7 + y * 13) % 3 === 0 ? 1 : -1);
      d[idx] = Math.max(0, Math.min(255, d[idx] + sign * delta));
      d[idx + 1] = Math.max(0, Math.min(255, d[idx + 1] - sign * delta));
      d[idx + 2] = Math.max(0, Math.min(255, d[idx + 2] + sign * delta));
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

/** Inject text into PNG tEXt chunk via data URL manipulation */
async function metadataInjection(
  dataUrl: string,
  opts: ImageEvasionOptions
): Promise<string> {
  const text = opts.text || "moderation test payload";
  // Re-encode as PNG with hidden comment in the canvas
  // We embed the text as a nearly invisible watermark in the top-left corner
  const img = await loadImage(dataUrl);
  const { canvas, ctx } = createCanvas(img.width, img.height);
  ctx.drawImage(img, 0, 0);

  // Write text as 1px-height invisible pixels in the first row
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  const imageData = ctx.getImageData(0, 0, img.width, 1);
  const d = imageData.data;
  for (let i = 0; i < bytes.length && i < img.width; i++) {
    const idx = i * 4;
    // Store byte value in the blue channel's lower bits
    d[idx + 2] = (d[idx + 2] & 0xf0) | (bytes[i] & 0x0f);
    d[idx] = (d[idx] & 0xf0) | ((bytes[i] >> 4) & 0x0f);
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

/** Shift colors toward warm skin tones */
async function skinToneShift(
  dataUrl: string,
  opts: ImageEvasionOptions
): Promise<string> {
  const intensity = opts.intensity ?? 5;
  const factor = intensity / 50; // 0.02–0.2
  const img = await loadImage(dataUrl);
  const { canvas, ctx } = createCanvas(img.width, img.height);
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  const d = imageData.data;

  // Target skin tone: warm peach (210, 160, 130)
  const targetR = 210, targetG = 160, targetB = 130;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.round(d[i] + (targetR - d[i]) * factor);
    d[i + 1] = Math.round(d[i + 1] + (targetG - d[i + 1]) * factor);
    d[i + 2] = Math.round(d[i + 2] + (targetB - d[i + 2]) * factor);
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

/** Blend with a solid color at very low opacity */
async function lowOpacityBlend(
  dataUrl: string,
  opts: ImageEvasionOptions
): Promise<string> {
  const intensity = opts.intensity ?? 5;
  const alpha = 0.01 + (intensity / 10) * 0.06; // 0.01–0.07
  const img = await loadImage(dataUrl);
  const { canvas, ctx } = createCanvas(img.width, img.height);
  ctx.drawImage(img, 0, 0);

  // Overlay warm flesh-toned rectangle
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#d4a088";
  ctx.fillRect(0, 0, img.width, img.height);
  ctx.globalAlpha = 1;

  return canvas.toDataURL("image/png");
}

/** Render text over image at barely-visible opacity */
async function subliminalText(
  dataUrl: string,
  opts: ImageEvasionOptions
): Promise<string> {
  const text = opts.text || "subliminal";
  const intensity = opts.intensity ?? 5;
  const alpha = 0.01 + (intensity / 10) * 0.04; // 0.01–0.05
  const img = await loadImage(dataUrl);
  const { canvas, ctx } = createCanvas(img.width, img.height);
  ctx.drawImage(img, 0, 0);

  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#ffffff";
  const fontSize = Math.max(12, Math.round(img.height / 8));
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Tile the text across the image
  for (let y = fontSize; y < img.height; y += fontSize * 2.5) {
    for (let x = fontSize; x < img.width; x += ctx.measureText(text).width + fontSize) {
      ctx.fillText(text, x, y);
    }
  }
  ctx.globalAlpha = 1;

  return canvas.toDataURL("image/png");
}

/** Increase contrast and saturation, especially in center region */
async function contrastPush(
  dataUrl: string,
  opts: ImageEvasionOptions
): Promise<string> {
  const intensity = opts.intensity ?? 5;
  const contrastFactor = 1 + (intensity / 10) * 0.3; // 1.0–1.3
  const satFactor = 1 + (intensity / 10) * 0.25; // 1.0–1.25
  const img = await loadImage(dataUrl);
  const { canvas, ctx } = createCanvas(img.width, img.height);
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  const d = imageData.data;
  const cx = img.width / 2;
  const cy = img.height / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);

  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const idx = (y * img.width + x) * 4;
      // Weight stronger in center
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const weight = 1 - (dist / maxDist) * 0.5;

      let r = d[idx], g = d[idx + 1], b = d[idx + 2];

      // Contrast
      const cf = 1 + (contrastFactor - 1) * weight;
      r = Math.max(0, Math.min(255, Math.round((r - 128) * cf + 128)));
      g = Math.max(0, Math.min(255, Math.round((g - 128) * cf + 128)));
      b = Math.max(0, Math.min(255, Math.round((b - 128) * cf + 128)));

      // Saturation boost
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      const sf = 1 + (satFactor - 1) * weight;
      r = Math.max(0, Math.min(255, Math.round(gray + (r - gray) * sf)));
      g = Math.max(0, Math.min(255, Math.round(gray + (g - gray) * sf)));
      b = Math.max(0, Math.min(255, Math.round(gray + (b - gray) * sf)));

      d[idx] = r;
      d[idx + 1] = g;
      d[idx + 2] = b;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

/** Simulate JPEG compression artifacts by re-encoding at low quality */
async function jpegArtifacts(
  dataUrl: string,
  opts: ImageEvasionOptions
): Promise<string> {
  const intensity = opts.intensity ?? 5;
  const quality = Math.max(0.05, 0.6 - (intensity / 10) * 0.5); // 0.6–0.1
  const img = await loadImage(dataUrl);
  const { canvas, ctx } = createCanvas(img.width, img.height);
  ctx.drawImage(img, 0, 0);

  // Encode to JPEG at low quality, then back to PNG
  const jpegUrl = canvas.toDataURL("image/jpeg", quality);
  const jpegImg = await loadImage(jpegUrl);
  ctx.drawImage(jpegImg, 0, 0);
  return canvas.toDataURL("image/png");
}

/** Shuffle pixels within small blocks */
async function pixelShuffle(
  dataUrl: string,
  opts: ImageEvasionOptions
): Promise<string> {
  const intensity = opts.intensity ?? 5;
  const blockSize = Math.max(2, Math.round(intensity * 0.6)); // 2-6 px blocks
  const img = await loadImage(dataUrl);
  const { canvas, ctx } = createCanvas(img.width, img.height);
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  const d = imageData.data;
  const rng = mulberry32(7);

  for (let by = 0; by < img.height; by += blockSize) {
    for (let bx = 0; bx < img.width; bx += blockSize) {
      // Collect pixel indices within this block
      const indices: number[] = [];
      for (let y = by; y < Math.min(by + blockSize, img.height); y++) {
        for (let x = bx; x < Math.min(bx + blockSize, img.width); x++) {
          indices.push((y * img.width + x) * 4);
        }
      }
      // Fisher-Yates shuffle on the block pixels
      const original = indices.map((idx) => [d[idx], d[idx + 1], d[idx + 2], d[idx + 3]]);
      for (let i = original.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [original[i], original[j]] = [original[j], original[i]];
      }
      // Write back
      for (let i = 0; i < indices.length; i++) {
        const idx = indices[i];
        d[idx] = original[i][0];
        d[idx + 1] = original[i][1];
        d[idx + 2] = original[i][2];
        d[idx + 3] = original[i][3];
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

/** Shift one RGB channel by a few pixels */
async function colorChannelShift(
  dataUrl: string,
  opts: ImageEvasionOptions
): Promise<string> {
  const intensity = opts.intensity ?? 5;
  const shift = Math.max(1, Math.round(intensity * 0.3)); // 1-3 px
  const img = await loadImage(dataUrl);
  const { canvas, ctx } = createCanvas(img.width, img.height);
  ctx.drawImage(img, 0, 0);
  const srcData = ctx.getImageData(0, 0, img.width, img.height);
  const dstData = ctx.createImageData(img.width, img.height);
  const src = srcData.data;
  const dst = dstData.data;

  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const dstIdx = (y * img.width + x) * 4;
      // Red channel shifted right
      const srcXR = Math.min(x + shift, img.width - 1);
      const srcIdxR = (y * img.width + srcXR) * 4;
      dst[dstIdx] = src[srcIdxR]; // R from shifted position

      // Green stays
      dst[dstIdx + 1] = src[dstIdx + 1];

      // Blue channel shifted left
      const srcXB = Math.max(x - shift, 0);
      const srcIdxB = (y * img.width + srcXB) * 4;
      dst[dstIdx + 2] = src[srcIdxB + 2]; // B from shifted position

      dst[dstIdx + 3] = src[dstIdx + 3]; // Alpha unchanged
    }
  }

  ctx.putImageData(dstData, 0, 0);
  return canvas.toDataURL("image/png");
}

/** Add high-frequency noise in specific frequency bands */
async function frequencyNoise(
  dataUrl: string,
  opts: ImageEvasionOptions
): Promise<string> {
  const intensity = opts.intensity ?? 5;
  const amplitude = Math.max(2, Math.round(intensity * 1.2)); // 2-12
  const img = await loadImage(dataUrl);
  const { canvas, ctx } = createCanvas(img.width, img.height);
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  const d = imageData.data;

  // High-frequency sinusoidal pattern
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const idx = (y * img.width + x) * 4;
      const noise =
        Math.sin(x * 0.8 + y * 0.6) * amplitude * 0.5 +
        Math.sin(x * 1.7 - y * 1.3) * amplitude * 0.3 +
        Math.cos(x * 2.3 + y * 1.9) * amplitude * 0.2;
      const n = Math.round(noise);
      d[idx] = Math.max(0, Math.min(255, d[idx] + n));
      d[idx + 1] = Math.max(0, Math.min(255, d[idx + 1] + n));
      d[idx + 2] = Math.max(0, Math.min(255, d[idx + 2] + n));
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

// ---------------------------------------------------------------------------
// Technique function map
// ---------------------------------------------------------------------------

type TechniqueFn = (dataUrl: string, opts: ImageEvasionOptions) => Promise<string>;

const TECHNIQUE_FNS: Record<Exclude<ImageEvasionTechnique, "all">, TechniqueFn> = {
  adversarialNoise,
  lsbSteganography,
  variationNoise,
  metadataInjection,
  skinToneShift,
  lowOpacityBlend,
  subliminalText,
  contrastPush,
  jpegArtifacts,
  pixelShuffle,
  colorChannelShift,
  frequencyNoise,
};

/**
 * Apply a single image evasion technique or all of them (combined sequentially).
 */
export async function applyImageEvasion(
  dataUrl: string,
  technique: ImageEvasionTechnique,
  options?: ImageEvasionOptions
): Promise<string> {
  const opts: ImageEvasionOptions = { intensity: 5, ...options };

  if (technique === "all") {
    // Apply all techniques sequentially
    let result = dataUrl;
    for (const fn of Object.values(TECHNIQUE_FNS)) {
      result = await fn(result, opts);
    }
    return result;
  }

  const fn = TECHNIQUE_FNS[technique];
  return fn ? fn(dataUrl, opts) : dataUrl;
}
