/**
 * Code-to-Design Modal: Convert HTML/CSS code into OpenSketch design nodes.
 */

let modal: HTMLDivElement | null = null;

export function openCodeToDesignModal(engine: any, onDone?: () => void) {
  if (modal) { closeModal(); return; }

  modal = document.createElement('div');
  modal.id = 'code-to-design-modal';
  modal.style.cssText = `
    position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;
    background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);
  `;

  const card = document.createElement('div');
  card.style.cssText = `
    background:#1e1e2e;border-radius:12px;padding:24px;width:680px;max-height:85vh;
    display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.5);
    color:#cdd6f4;font-family:Inter,system-ui,sans-serif;
  `;

  // Header
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;';
  const title = document.createElement('h2');
  title.textContent = '🧩 Code to Design';
  title.style.cssText = 'margin:0;font-size:18px;font-weight:600;color:#cdd6f4;';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = 'background:none;border:none;color:#6c7086;font-size:18px;cursor:pointer;padding:4px 8px;border-radius:4px;';
  closeBtn.onmouseenter = () => closeBtn.style.color = '#cdd6f4';
  closeBtn.onmouseleave = () => closeBtn.style.color = '#6c7086';
  closeBtn.onclick = closeModal;
  header.append(title, closeBtn);

  // Description
  const desc = document.createElement('p');
  desc.textContent = 'Paste HTML/CSS code to convert into design nodes. Supports inline styles, <style> blocks, flex/grid layouts, colors, borders, shadows, and typography.';
  desc.style.cssText = 'margin:0 0 12px;font-size:12px;color:#6c7086;line-height:1.5;';

  // Textarea
  const textarea = document.createElement('textarea');
  textarea.placeholder = `<div style="display:flex; gap:16px; padding:24px; background:#1a1a2e; border-radius:12px;">
  <div style="width:48px; height:48px; background:#4f46e5; border-radius:50%;"></div>
  <div style="display:flex; flex-direction:column; gap:4px;">
    <h3 style="color:white; font-size:16px;">Hello World</h3>
    <p style="color:#888; font-size:14px;">A card component</p>
  </div>
</div>`;
  textarea.style.cssText = `
    width:100%;height:320px;background:#11111b;border:1px solid #313244;
    border-radius:8px;padding:12px;color:#a6e3a1;font-family:'JetBrains Mono',monospace;
    font-size:13px;resize:vertical;outline:none;box-sizing:border-box;line-height:1.5;tab-size:2;
  `;
  textarea.onfocus = () => textarea.style.borderColor = '#4f46e5';
  textarea.onblur = () => textarea.style.borderColor = '#313244';
  textarea.onkeydown = (e: KeyboardEvent) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = textarea.selectionStart, end = textarea.selectionEnd;
      textarea.value = textarea.value.substring(0, s) + '  ' + textarea.value.substring(end);
      textarea.selectionStart = textarea.selectionEnd = s + 2;
    }
    if (e.key === 'Escape') closeModal();
  };

  // Status
  const status = document.createElement('div');
  status.style.cssText = 'margin-top:8px;font-size:12px;color:#6c7086;min-height:20px;';

  // Buttons
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:16px;';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = 'padding:8px 16px;border-radius:6px;border:1px solid #313244;background:transparent;color:#cdd6f4;cursor:pointer;font-size:13px;';
  cancelBtn.onclick = closeModal;

  const convertBtn = document.createElement('button');
  convertBtn.textContent = '✨ Convert to Design';
  convertBtn.style.cssText = 'padding:8px 20px;border-radius:6px;border:none;background:#4f46e5;color:white;cursor:pointer;font-size:13px;font-weight:500;';
  convertBtn.onmouseenter = () => convertBtn.style.background = '#6366f1';
  convertBtn.onmouseleave = () => convertBtn.style.background = '#4f46e5';

  convertBtn.onclick = () => {
    const code = textarea.value.trim();
    if (!code) {
      status.textContent = '⚠️ Please paste some HTML/CSS code.';
      status.style.color = '#fab387';
      return;
    }

    try {
      if (!engine || !engine.code_to_design) {
        status.textContent = '❌ Engine not available.';
        status.style.color = '#f38ba8';
        return;
      }

      // Place at center of canvas (rough estimate)
      const offsetX = 100;
      const offsetY = 100;

      const resultJson = engine.code_to_design(code, offsetX, offsetY);
      const result = JSON.parse(resultJson);

      if (result.root_id && result.node_count > 0) {
        status.textContent = `✅ Created ${result.node_count} node${result.node_count > 1 ? 's' : ''}`;
        status.style.color = '#a6e3a1';
        if (onDone) onDone();
        setTimeout(closeModal, 600);
      } else {
        status.textContent = '⚠️ No nodes created. Check your HTML.';
        status.style.color = '#fab387';
      }
    } catch (err: any) {
      status.textContent = `❌ Error: ${err.message || err}`;
      status.style.color = '#f38ba8';
    }
  };

  btnRow.append(cancelBtn, convertBtn);
  card.append(header, desc, textarea, status, btnRow);
  modal.appendChild(card);
  modal.onclick = (e) => { if (e.target === modal) closeModal(); };
  document.body.appendChild(modal);
  textarea.focus();
}

function closeModal() {
  if (modal) { modal.remove(); modal = null; }
}
