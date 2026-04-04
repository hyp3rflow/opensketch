export interface ARQuickLookOptions {
  src: string;
  title?: string;
}

export function getARSourceFromUrl(url: string = window.location.href): string | null {
  try {
    const parsed = new URL(url, window.location.origin);
    const value = (parsed.searchParams.get("ar_src") || "").trim();
    return value || null;
  } catch {
    return null;
  }
}

function isUsd(src: string): boolean {
  return /\.(usdz?|reality)$/i.test(src);
}

function isModel(src: string): boolean {
  return /\.(glb|gltf)$/i.test(src);
}

function makeQrUrl(targetUrl: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(targetUrl)}`;
}

export function openARQuickLook(opts: ARQuickLookOptions) {
  const src = (opts.src || "").trim();
  if (!src) {
    alert("먼저 3D/AR 파일 URL(.usdz/.glb/.gltf)을 입력해주세요.");
    return;
  }

  if (!isUsd(src) && !isModel(src)) {
    alert("AR Preview는 .usdz, .glb, .gltf 파일 URL을 권장합니다.");
  }

  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:20000;";

  const card = document.createElement("div");
  card.style.cssText = "width:min(920px,92vw);height:min(700px,88vh);background:#1f1f2e;border:1px solid #3a3a4a;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.45);display:flex;overflow:hidden;";

  const left = document.createElement("div");
  left.style.cssText = "flex:1;display:flex;flex-direction:column;min-width:0;";

  const head = document.createElement("div");
  head.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid #303043;color:#f1f1f5;";
  head.innerHTML = `<div style=\"font-size:13px;font-weight:600;\">AR Quick Look Preview${opts.title ? ` · ${opts.title}` : ""}</div>`;

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.style.cssText = "background:transparent;border:none;color:#9ca3af;cursor:pointer;font-size:16px;";
  closeBtn.onclick = () => overlay.remove();
  head.appendChild(closeBtn);

  const body = document.createElement("div");
  body.style.cssText = "flex:1;padding:12px;display:flex;align-items:center;justify-content:center;background:#141420;";

  if (isUsd(src)) {
    const tip = document.createElement("div");
    tip.style.cssText = "text-align:center;color:#d6d6e0;max-width:520px;line-height:1.6;";
    tip.innerHTML = `
      <div style=\"font-size:14px;font-weight:600;margin-bottom:8px;\">USDZ Quick Look</div>
      <div style=\"font-size:12px;color:#a8a8b6;margin-bottom:14px;\">iPhone/iPad Safari에서 링크를 열면 AR Quick Look으로 바로 확인할 수 있어요.</div>
      <a href=\"${src}\" rel=\"noopener\" target=\"_blank\" style=\"display:inline-block;background:#2563eb;color:#fff;padding:9px 12px;border-radius:8px;text-decoration:none;font-size:12px;font-weight:600;\">Open USDZ</a>
    `;
    body.appendChild(tip);
  } else {
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "width:100%;height:100%;border:none;border-radius:8px;background:#0f0f18;";
    iframe.srcdoc = `<!doctype html>
<html>
  <head>
    <meta charset=\"utf-8\" />
    <script type=\"module\" src=\"https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js\"></script>
    <style>
      html,body { margin:0; width:100%; height:100%; background:#0f0f18; }
      model-viewer { width:100%; height:100%; --poster-color: transparent; }
    </style>
  </head>
  <body>
    <model-viewer src=\"${src.replace(/"/g, "&quot;")}\" ar camera-controls auto-rotate shadow-intensity=\"1\"></model-viewer>
  </body>
</html>`;
    body.appendChild(iframe);
  }

  left.append(head, body);

  const right = document.createElement("div");
  right.style.cssText = "width:280px;border-left:1px solid #303043;padding:14px;color:#d6d6e0;display:flex;flex-direction:column;gap:10px;background:#191926;";

  const pageUrl = `${window.location.origin}${window.location.pathname}?ar_src=${encodeURIComponent(src)}`;

  const qr = document.createElement("img");
  qr.src = makeQrUrl(pageUrl);
  qr.alt = "AR Preview QR";
  qr.style.cssText = "width:220px;height:220px;align-self:center;border-radius:8px;background:#fff;padding:6px;";

  const hint = document.createElement("div");
  hint.style.cssText = "font-size:12px;color:#a8a8b6;line-height:1.5;";
  hint.textContent = "모바일 카메라로 QR을 스캔해 AR 미리보기를 열 수 있습니다. iOS는 USDZ Quick Look, 그 외는 model-viewer AR 모드를 사용합니다.";

  const link = document.createElement("input");
  link.value = src;
  link.readOnly = true;
  link.style.cssText = "width:100%;background:#10101a;border:1px solid #3a3a4a;color:#e5e7eb;border-radius:8px;padding:8px;font-size:11px;";

  const copyBtn = document.createElement("button");
  copyBtn.textContent = "Copy Source URL";
  copyBtn.style.cssText = "height:32px;border:none;border-radius:8px;background:#2f6fed;color:white;font-size:12px;font-weight:600;cursor:pointer;";
  copyBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(src);
      copyBtn.textContent = "Copied";
      setTimeout(() => copyBtn.textContent = "Copy Source URL", 1000);
    } catch {
      // no-op
    }
  };

  right.append(qr, hint, link, copyBtn);
  card.append(left, right);
  overlay.appendChild(card);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.body.appendChild(overlay);
}

export function openARQuickLookFromQuery(): boolean {
  const src = getARSourceFromUrl();
  if (!src) return false;

  openARQuickLook({
    src,
    title: "Shared AR Preview",
  });

  try {
    const url = new URL(window.location.href);
    url.searchParams.delete("ar_src");
    window.history.replaceState({}, "", url.toString());
  } catch {
    // no-op
  }

  return true;
}
