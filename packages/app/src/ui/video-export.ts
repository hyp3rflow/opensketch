/**
 * Video Export — WebM and GIF export from canvas recordings.
 * 
 * Renders each recorded frame to an offscreen canvas, then encodes
 * as WebM (MediaRecorder) or GIF (custom encoder).
 */

import type { Editor } from "../editor";

export interface VideoExportOptions {
  format: "webm" | "gif";
  fps: number;        // output frame rate (default 10)
  width: number;      // output width in pixels
  height: number;     // output height in pixels
  quality: number;    // 0-1, for WebM bitrate / GIF quality
}

interface ExportProgress {
  phase: "rendering" | "encoding" | "done" | "error";
  current: number;
  total: number;
  message: string;
}

type ProgressCallback = (p: ExportProgress) => void;

/**
 * Export recording as WebM video using MediaRecorder API.
 */
export async function exportWebM(
  editor: Editor,
  opts: VideoExportOptions,
  onProgress?: ProgressCallback,
): Promise<Blob> {
  const eng = editor.engine as any;
  const durationMs = Number(eng.recording_duration_ms?.() ?? 0);
  if (durationMs === 0) throw new Error("No recording data");

  // Save current state
  const savedScene = eng.export_scene?.();
  const savedZoom = eng.get_zoom();
  const savedPanX = eng.get_pan_x();
  const savedPanY = eng.get_pan_y();

  // Create offscreen canvas
  const offscreen = document.createElement("canvas");
  offscreen.width = opts.width;
  offscreen.height = opts.height;
  const ctx = offscreen.getContext("2d")!;

  // Setup viewport to fit scene bounds
  const boundsJson = eng.get_scene_bounds?.();
  let bounds = { x: 0, y: 0, width: 800, height: 600 };
  if (boundsJson) {
    try { bounds = JSON.parse(boundsJson); } catch {}
  }

  const padding = 20;
  const scaleX = (opts.width - padding * 2) / (bounds.width || 1);
  const scaleY = (opts.height - padding * 2) / (bounds.height || 1);
  const exportZoom = Math.min(scaleX, scaleY);
  const exportPanX = -bounds.x * exportZoom + (opts.width - bounds.width * exportZoom) / 2;
  const exportPanY = -bounds.y * exportZoom + (opts.height - bounds.height * exportZoom) / 2;

  const frameIntervalMs = 1000 / opts.fps;
  const totalFrames = Math.ceil(durationMs / frameIntervalMs) + 1;

  // Use captureStream + MediaRecorder
  const stream = offscreen.captureStream(0); // 0 = manual frame control
  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
    ? "video/webm;codecs=vp9"
    : "video/webm";
  
  const bitrate = Math.round(opts.quality * 5_000_000 + 500_000); // 0.5-5.5 Mbps
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
    recorder.onerror = (e) => reject(e);
  });

  recorder.start();

  try {
    for (let i = 0; i < totalFrames; i++) {
      const timeMs = Math.min(i * frameIntervalMs, durationMs);
      onProgress?.({ phase: "rendering", current: i + 1, total: totalFrames, message: `Rendering frame ${i + 1}/${totalFrames}` });

      // Seek engine to this timestamp
      eng.recording_seek?.(BigInt(Math.round(timeMs)));
      
      // Set viewport for export
      eng.set_viewport(exportZoom, exportPanX, exportPanY);

      // Clear and render
      ctx.clearRect(0, 0, opts.width, opts.height);
      ctx.fillStyle = "#1e1e2e";
      ctx.fillRect(0, 0, opts.width, opts.height);
      eng.render(ctx);

      // Request frame from captureStream
      const track = stream.getVideoTracks()[0] as any;
      if (track?.requestFrame) track.requestFrame();

      // Give the recorder time to capture
      await new Promise(r => setTimeout(r, 20));
    }
  } finally {
    // Restore original state
    if (savedScene) eng.import_scene?.(savedScene);
    eng.set_viewport(savedZoom, savedPanX, savedPanY);
    editor.requestRender();
  }

  recorder.stop();
  onProgress?.({ phase: "encoding", current: totalFrames, total: totalFrames, message: "Finalizing video..." });
  
  const blob = await done;
  onProgress?.({ phase: "done", current: totalFrames, total: totalFrames, message: "Export complete" });
  return blob;
}

/**
 * Export recording as GIF using canvas pixel data.
 * Uses a simple GIF89a encoder (no external dependencies).
 */
export async function exportGIF(
  editor: Editor,
  opts: VideoExportOptions,
  onProgress?: ProgressCallback,
): Promise<Blob> {
  const eng = editor.engine as any;
  const durationMs = Number(eng.recording_duration_ms?.() ?? 0);
  if (durationMs === 0) throw new Error("No recording data");

  const savedScene = eng.export_scene?.();
  const savedZoom = eng.get_zoom();
  const savedPanX = eng.get_pan_x();
  const savedPanY = eng.get_pan_y();

  const offscreen = document.createElement("canvas");
  offscreen.width = opts.width;
  offscreen.height = opts.height;
  const ctx = offscreen.getContext("2d")!;

  // Viewport setup
  const boundsJson = eng.get_scene_bounds?.();
  let bounds = { x: 0, y: 0, width: 800, height: 600 };
  if (boundsJson) {
    try { bounds = JSON.parse(boundsJson); } catch {}
  }

  const padding = 20;
  const scaleX = (opts.width - padding * 2) / (bounds.width || 1);
  const scaleY = (opts.height - padding * 2) / (bounds.height || 1);
  const exportZoom = Math.min(scaleX, scaleY);
  const exportPanX = -bounds.x * exportZoom + (opts.width - bounds.width * exportZoom) / 2;
  const exportPanY = -bounds.y * exportZoom + (opts.height - bounds.height * exportZoom) / 2;

  const frameIntervalMs = 1000 / opts.fps;
  const totalFrames = Math.ceil(durationMs / frameIntervalMs) + 1;
  const delayCs = Math.round(frameIntervalMs / 10); // GIF delay in centiseconds

  const frames: ImageData[] = [];

  try {
    for (let i = 0; i < totalFrames; i++) {
      const timeMs = Math.min(i * frameIntervalMs, durationMs);
      onProgress?.({ phase: "rendering", current: i + 1, total: totalFrames, message: `Capturing frame ${i + 1}/${totalFrames}` });

      eng.recording_seek?.(BigInt(Math.round(timeMs)));
      eng.set_viewport(exportZoom, exportPanX, exportPanY);

      ctx.clearRect(0, 0, opts.width, opts.height);
      ctx.fillStyle = "#1e1e2e";
      ctx.fillRect(0, 0, opts.width, opts.height);
      eng.render(ctx);

      frames.push(ctx.getImageData(0, 0, opts.width, opts.height));

      // Yield to keep UI responsive
      if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
    }
  } finally {
    if (savedScene) eng.import_scene?.(savedScene);
    eng.set_viewport(savedZoom, savedPanX, savedPanY);
    editor.requestRender();
  }

  onProgress?.({ phase: "encoding", current: 0, total: totalFrames, message: "Encoding GIF..." });

  const gifData = encodeGIF(frames, opts.width, opts.height, delayCs, onProgress);

  onProgress?.({ phase: "done", current: totalFrames, total: totalFrames, message: "Export complete" });
  return new Blob([gifData], { type: "image/gif" });
}

// ============================================================
// Minimal GIF89a Encoder (no dependencies)
// Uses median-cut color quantization to 256 colors per frame
// ============================================================

function encodeGIF(
  frames: ImageData[],
  width: number,
  height: number,
  delayCs: number,
  onProgress?: ProgressCallback,
): Uint8Array {
  const buf: number[] = [];

  // Header
  writeStr(buf, "GIF89a");
  
  // Logical Screen Descriptor
  writeU16(buf, width);
  writeU16(buf, height);
  buf.push(0x70); // No GCT, 8-bit color depth
  buf.push(0);    // bg color index
  buf.push(0);    // pixel aspect ratio

  // Netscape extension for looping
  buf.push(0x21, 0xFF, 0x0B);
  writeStr(buf, "NETSCAPE2.0");
  buf.push(0x03, 0x01);
  writeU16(buf, 0); // loop forever
  buf.push(0x00);

  for (let i = 0; i < frames.length; i++) {
    onProgress?.({
      phase: "encoding",
      current: i + 1,
      total: frames.length,
      message: `Encoding frame ${i + 1}/${frames.length}`,
    });

    const pixels = frames[i].data;
    const { palette, indices } = quantize(pixels, width * height);

    // Graphics Control Extension
    buf.push(0x21, 0xF9, 0x04);
    buf.push(0x00); // no transparency
    writeU16(buf, delayCs);
    buf.push(0x00); // transparent color index
    buf.push(0x00); // block terminator

    // Image Descriptor
    buf.push(0x2C);
    writeU16(buf, 0); // left
    writeU16(buf, 0); // top
    writeU16(buf, width);
    writeU16(buf, height);
    buf.push(0x87); // Local Color Table, 256 entries (2^(7+1))

    // Local Color Table (256 * 3 bytes)
    for (let c = 0; c < 256; c++) {
      buf.push(palette[c * 3] ?? 0, palette[c * 3 + 1] ?? 0, palette[c * 3 + 2] ?? 0);
    }

    // LZW compressed image data
    const minCodeSize = 8;
    const lzwData = lzwEncode(indices, minCodeSize);
    buf.push(minCodeSize);
    
    // Write sub-blocks (max 255 bytes each)
    let offset = 0;
    while (offset < lzwData.length) {
      const chunkSize = Math.min(255, lzwData.length - offset);
      buf.push(chunkSize);
      for (let j = 0; j < chunkSize; j++) {
        buf.push(lzwData[offset + j]);
      }
      offset += chunkSize;
    }
    buf.push(0x00); // block terminator
  }

  // Trailer
  buf.push(0x3B);
  return new Uint8Array(buf);
}

/** Median-cut color quantization to 256 colors */
function quantize(pixels: Uint8ClampedArray, pixelCount: number): { palette: Uint8Array; indices: Uint8Array } {
  // Sample pixels (for performance, sample up to 10000 pixels)
  const sampleCount = Math.min(pixelCount, 10000);
  const step = Math.max(1, Math.floor(pixelCount / sampleCount));
  const samples: number[][] = [];
  for (let i = 0; i < pixelCount; i += step) {
    const idx = i * 4;
    samples.push([pixels[idx], pixels[idx + 1], pixels[idx + 2]]);
  }

  // Median-cut into 256 buckets
  const buckets = medianCut(samples, 8); // 2^8 = 256
  
  // Build palette
  const palette = new Uint8Array(256 * 3);
  for (let i = 0; i < buckets.length && i < 256; i++) {
    const avg = bucketAverage(buckets[i]);
    palette[i * 3] = avg[0];
    palette[i * 3 + 1] = avg[1];
    palette[i * 3 + 2] = avg[2];
  }

  // Build lookup (simple nearest-color)
  const paletteCount = Math.min(buckets.length, 256);
  const indices = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    const r = pixels[idx], g = pixels[idx + 1], b = pixels[idx + 2];
    let bestDist = Infinity;
    let bestIdx = 0;
    for (let c = 0; c < paletteCount; c++) {
      const dr = r - palette[c * 3];
      const dg = g - palette[c * 3 + 1];
      const db = b - palette[c * 3 + 2];
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = c;
      }
    }
    indices[i] = bestIdx;
  }

  return { palette, indices };
}

function medianCut(colors: number[][], depth: number): number[][][] {
  if (depth === 0 || colors.length <= 1) return [colors];

  // Find channel with largest range
  let maxRange = 0, splitCh = 0;
  for (let ch = 0; ch < 3; ch++) {
    let min = 255, max = 0;
    for (const c of colors) {
      if (c[ch] < min) min = c[ch];
      if (c[ch] > max) max = c[ch];
    }
    if (max - min > maxRange) {
      maxRange = max - min;
      splitCh = ch;
    }
  }

  colors.sort((a, b) => a[splitCh] - b[splitCh]);
  const mid = Math.floor(colors.length / 2);
  return [
    ...medianCut(colors.slice(0, mid), depth - 1),
    ...medianCut(colors.slice(mid), depth - 1),
  ];
}

function bucketAverage(bucket: number[][]): [number, number, number] {
  if (bucket.length === 0) return [0, 0, 0];
  let r = 0, g = 0, b = 0;
  for (const c of bucket) { r += c[0]; g += c[1]; b += c[2]; }
  const n = bucket.length;
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

/** LZW encode for GIF */
function lzwEncode(indices: Uint8Array, minCodeSize: number): Uint8Array {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;
  const maxCode = 4096;

  // Output bit buffer
  const output: number[] = [];
  let bitBuf = 0;
  let bitCount = 0;

  function writeBits(code: number, size: number) {
    bitBuf |= code << bitCount;
    bitCount += size;
    while (bitCount >= 8) {
      output.push(bitBuf & 0xFF);
      bitBuf >>= 8;
      bitCount -= 8;
    }
  }

  // Code table (using string keys for simplicity)
  let table = new Map<string, number>();
  function resetTable() {
    table = new Map();
    for (let i = 0; i < clearCode; i++) {
      table.set(String(i), i);
    }
    codeSize = minCodeSize + 1;
    nextCode = eoiCode + 1;
  }

  resetTable();
  writeBits(clearCode, codeSize);

  if (indices.length === 0) {
    writeBits(eoiCode, codeSize);
    if (bitCount > 0) output.push(bitBuf & 0xFF);
    return new Uint8Array(output);
  }

  let current = String(indices[0]);

  for (let i = 1; i < indices.length; i++) {
    const next = current + "," + indices[i];
    if (table.has(next)) {
      current = next;
    } else {
      writeBits(table.get(current)!, codeSize);
      if (nextCode < maxCode) {
        table.set(next, nextCode++);
        if (nextCode > (1 << codeSize) && codeSize < 12) {
          codeSize++;
        }
      } else {
        writeBits(clearCode, codeSize);
        resetTable();
      }
      current = String(indices[i]);
    }
  }

  writeBits(table.get(current)!, codeSize);
  writeBits(eoiCode, codeSize);
  if (bitCount > 0) output.push(bitBuf & 0xFF);

  return new Uint8Array(output);
}

function writeU16(buf: number[], val: number) {
  buf.push(val & 0xFF, (val >> 8) & 0xFF);
}

function writeStr(buf: number[], str: string) {
  for (let i = 0; i < str.length; i++) buf.push(str.charCodeAt(i));
}
