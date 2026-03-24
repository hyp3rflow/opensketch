/**
 * PDF Export — zero-dependency PDF builder
 * Renders each page as a JPEG image embedded in a valid PDF document.
 */
import type { Editor } from '../editor';

export interface PDFExportOptions {
  allPages?: boolean;
  scale?: number;
  filename?: string;
  quality?: number; // JPEG quality 0-1, default 0.92
}

/**
 * Export all pages (or current page) as a PDF file and trigger download.
 */
export async function exportPDF(editor: Editor, options: PDFExportOptions = {}) {
  const {
    allPages = true,
    scale = 2,
    filename = 'opensketch-export.pdf',
    quality = 0.92,
  } = options;

  const captures: PageCapture[] = [];

  if (allPages) {
    const currentPageId = Number(editor.engine.get_active_page_id());
    const pagesJson: { id: number; name: string }[] = JSON.parse(editor.engine.get_pages());

    for (const page of pagesJson) {
      editor.engine.set_active_page(BigInt(page.id));
      const cap = captureCurrentPage(editor, scale, quality);
      if (cap) captures.push(cap);
    }

    editor.engine.set_active_page(BigInt(currentPageId));
    editor.requestRender();
  } else {
    const cap = captureCurrentPage(editor, scale, quality);
    if (cap) captures.push(cap);
  }

  if (captures.length === 0) {
    alert('Nothing to export — canvas is empty.');
    return;
  }

  const pdfBytes = buildPDF(captures);
  downloadBlob(pdfBytes, filename, 'application/pdf');
}

interface PageCapture {
  /** Page dimensions in CSS pixels (unscaled) */
  pageWidth: number;
  pageHeight: number;
  /** Image dimensions in actual pixels */
  imgWidth: number;
  imgHeight: number;
  /** Raw JPEG bytes */
  jpegBytes: Uint8Array;
}

function captureCurrentPage(editor: Editor, scale: number, quality: number): PageCapture | null {
  const layers = JSON.parse(editor.engine.get_layer_list());
  if (layers.length === 0) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const l of layers) {
    const nj = editor.engine.get_node_json(BigInt(l.id));
    if (!nj) continue;
    const n = JSON.parse(nj);
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  }

  if (!isFinite(minX)) return null;

  const padding = 20;
  const w = maxX - minX + padding * 2;
  const h = maxY - minY + padding * 2;
  const x = minX - padding;
  const y = minY - padding;

  // Create offscreen canvas
  const offCanvas = document.createElement('canvas');
  offCanvas.width = w * scale;
  offCanvas.height = h * scale;
  const ctx = offCanvas.getContext('2d')!;

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, offCanvas.width, offCanvas.height);
  ctx.scale(scale, scale);
  ctx.translate(-x, -y);

  // Render nodes
  const order = JSON.parse(editor.engine.get_layer_list());
  for (const item of order) {
    if (!item.visible) continue;
    const nj = editor.engine.get_node_json(BigInt(item.id));
    if (!nj) continue;
    const node = JSON.parse(nj);
    ctx.save();
    ctx.globalAlpha = node.opacity ?? 1;
    if (node.blend_mode && node.blend_mode !== 'normal') {
      ctx.globalCompositeOperation = node.blend_mode;
    }
    if (node.rotation && node.rotation !== 0) {
      ctx.translate(node.x + node.width / 2, node.y + node.height / 2);
      ctx.rotate(node.rotation);
      (editor as any).renderNodeToCtx(ctx, node, -node.width / 2, -node.height / 2);
    } else {
      (editor as any).renderNodeToCtx(ctx, node, node.x, node.y);
    }
    ctx.restore();
  }

  // Get JPEG bytes from canvas
  const dataUrl = offCanvas.toDataURL('image/jpeg', quality);
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  return {
    pageWidth: w,
    pageHeight: h,
    imgWidth: offCanvas.width,
    imgHeight: offCanvas.height,
    jpegBytes: bytes,
  };
}

/**
 * Build a valid PDF 1.4 from JPEG page images.
 * Page size matches content dimensions in points (1 CSS px ≈ 0.75 pt, but we use 1:1 for simplicity).
 */
function buildPDF(pages: PageCapture[]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let pos = 0;
  const objOffsets: number[] = [];
  let nextObj = 1;

  function write(s: string) {
    const b = enc.encode(s);
    chunks.push(b);
    pos += b.length;
  }

  function writeBin(b: Uint8Array) {
    chunks.push(b);
    pos += b.length;
  }

  function startObj(): number {
    const num = nextObj++;
    objOffsets[num] = pos;
    write(`${num} 0 obj\n`);
    return num;
  }

  function endObj() {
    write('endobj\n');
  }

  // Header
  write('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  // Obj 1: Catalog (forward ref to Pages)
  const catalogNum = startObj();
  write('<< /Type /Catalog /Pages 2 0 R >>\n');
  endObj();

  // Obj 2: Pages (placeholder — we'll write kids after)
  const pagesNum = startObj();
  // We know page objects will be at objNums 3, 3+3, 3+6, ... (image, content, page per page)
  const pageObjNums: number[] = [];
  // Reserve space — we'll overwrite. Actually, let's collect all first.
  // Better approach: compute object numbers ahead of time.
  // Per page: 3 objects (image stream, content stream, page dict)
  // So page i: image = 3 + i*3, content = 4 + i*3, page = 5 + i*3
  for (let i = 0; i < pages.length; i++) {
    pageObjNums.push(5 + i * 3);
  }
  const kids = pageObjNums.map(n => `${n} 0 R`).join(' ');
  write(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>\n`);
  endObj();

  // Per page objects
  for (let i = 0; i < pages.length; i++) {
    const pg = pages[i];
    const imgNum = 3 + i * 3;
    const contentNum = 4 + i * 3;
    const pageNum = 5 + i * 3;

    // Image XObject (JPEG stream)
    if (nextObj !== imgNum) throw new Error(`PDF obj numbering mismatch: expected ${imgNum}, got ${nextObj}`);
    startObj();
    write(`<< /Type /XObject /Subtype /Image /Width ${pg.imgWidth} /Height ${pg.imgHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.jpegBytes.length} >>\n`);
    write('stream\n');
    writeBin(pg.jpegBytes);
    write('\nendstream\n');
    endObj();

    // Content stream
    const content = `q\n${pg.pageWidth} 0 0 ${pg.pageHeight} 0 0 cm\n/Img0 Do\nQ\n`;
    startObj();
    write(`<< /Length ${content.length} >>\n`);
    write('stream\n');
    write(content);
    write('endstream\n');
    endObj();

    // Page dict
    startObj();
    write(`<< /Type /Page /Parent ${pagesNum} 0 R /MediaBox [0 0 ${pg.pageWidth} ${pg.pageHeight}] /Contents ${contentNum} 0 R /Resources << /XObject << /Img0 ${imgNum} 0 R >> >> >>\n`);
    endObj();
  }

  // Xref
  const xrefPos = pos;
  const totalObjs = nextObj; // nextObj is 1-based, so totalObjs = nextObj
  write(`xref\n0 ${totalObjs}\n`);
  write('0000000000 65535 f \n');
  for (let i = 1; i < totalObjs; i++) {
    write(String(objOffsets[i]).padStart(10, '0') + ' 00000 n \n');
  }

  write(`trailer\n<< /Size ${totalObjs} /Root ${catalogNum} 0 R >>\n`);
  write(`startxref\n${xrefPos}\n%%EOF\n`);

  // Concatenate all chunks
  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function downloadBlob(data: Uint8Array, filename: string, mimeType: string) {
  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}
