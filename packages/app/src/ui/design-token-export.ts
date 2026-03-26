/**
 * Design Token Export Panel
 *
 * Modal panel for exporting design tokens (color styles, text styles, variables)
 * in multiple formats: W3C DTCG, Style Dictionary, Tailwind CSS, CSS Variables.
 */

import type { Editor } from '../editor';

const FORMATS = [
  { id: 'w3c', label: 'W3C DTCG', ext: 'json', desc: 'W3C Design Tokens Community Group spec' },
  { id: 'style-dictionary', label: 'Style Dictionary', ext: 'json', desc: 'Amazon Style Dictionary format' },
  { id: 'tailwind', label: 'Tailwind CSS', ext: 'js', desc: 'Tailwind theme config (module.exports)' },
  { id: 'css-variables', label: 'CSS Variables', ext: 'css', desc: 'CSS Custom Properties (:root)' },
] as const;

let panel: HTMLDivElement | null = null;
let selectedFormat = 'w3c';
let previewContent = '';

export function toggleDesignTokenExport(editor: Editor) {
  if (panel) {
    closePanel();
    return;
  }
  openPanel(editor);
}

function openPanel(editor: Editor) {
  panel = document.createElement('div');
  panel.className = 'design-token-export-overlay';
  panel.innerHTML = `
    <div class="design-token-export-modal">
      <div class="dte-header">
        <span class="dte-title">Export Design Tokens</span>
        <button class="dte-close" title="Close">✕</button>
      </div>
      <div class="dte-body">
        <div class="dte-formats">
          ${FORMATS.map(f => `
            <label class="dte-format-card${f.id === selectedFormat ? ' selected' : ''}" data-format="${f.id}">
              <input type="radio" name="dte-format" value="${f.id}" ${f.id === selectedFormat ? 'checked' : ''}>
              <div class="dte-format-info">
                <span class="dte-format-label">${f.label}</span>
                <span class="dte-format-desc">${f.desc}</span>
              </div>
              <span class="dte-format-ext">.${f.ext}</span>
            </label>
          `).join('')}
        </div>
        <div class="dte-preview-section">
          <div class="dte-preview-header">
            <span>Preview</span>
            <button class="dte-copy-btn" title="Copy to clipboard">📋 Copy</button>
          </div>
          <pre class="dte-preview-code"></pre>
        </div>
      </div>
      <div class="dte-footer">
        <button class="dte-cancel-btn">Cancel</button>
        <button class="dte-download-btn">⬇ Download</button>
      </div>
    </div>
  `;

  // Style
  const style = document.createElement('style');
  style.textContent = `
    .design-token-export-overlay {
      position: fixed; inset: 0; z-index: 10000;
      background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center;
    }
    .design-token-export-modal {
      background: #2a2a2a; border-radius: 12px; width: 600px; max-height: 80vh;
      display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.5);
      color: #e0e0e0; font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 13px;
    }
    .dte-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 16px 20px; border-bottom: 1px solid #3a3a3a;
    }
    .dte-title { font-size: 15px; font-weight: 600; }
    .dte-close { background: none; border: none; color: #888; cursor: pointer; font-size: 16px; padding: 4px 8px; border-radius: 4px; }
    .dte-close:hover { background: #3a3a3a; color: #fff; }
    .dte-body { padding: 16px 20px; overflow-y: auto; flex: 1; }
    .dte-formats { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
    .dte-format-card {
      display: flex; align-items: center; gap: 12px; padding: 10px 14px;
      background: #333; border: 2px solid transparent; border-radius: 8px; cursor: pointer;
      transition: border-color 0.15s;
    }
    .dte-format-card:hover { border-color: #555; }
    .dte-format-card.selected { border-color: #4a90d9; background: #2d3a4a; }
    .dte-format-card input { display: none; }
    .dte-format-info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
    .dte-format-label { font-weight: 600; font-size: 13px; }
    .dte-format-desc { font-size: 11px; color: #888; }
    .dte-format-ext { font-size: 11px; color: #666; background: #222; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
    .dte-preview-section { border-top: 1px solid #3a3a3a; padding-top: 12px; }
    .dte-preview-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-weight: 600; }
    .dte-copy-btn { background: #3a3a3a; border: none; color: #ccc; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; }
    .dte-copy-btn:hover { background: #4a4a4a; }
    .dte-preview-code {
      background: #1a1a1a; border-radius: 8px; padding: 12px; font-family: 'SF Mono', Menlo, monospace;
      font-size: 11px; line-height: 1.5; max-height: 250px; overflow: auto; white-space: pre-wrap;
      color: #a8d8a8; margin: 0;
    }
    .dte-footer {
      display: flex; justify-content: flex-end; gap: 8px; padding: 12px 20px; border-top: 1px solid #3a3a3a;
    }
    .dte-cancel-btn { background: #3a3a3a; border: none; color: #ccc; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; }
    .dte-cancel-btn:hover { background: #4a4a4a; }
    .dte-download-btn { background: #4a90d9; border: none; color: #fff; padding: 8px 20px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; }
    .dte-download-btn:hover { background: #5aa0e9; }
  `;
  panel.appendChild(style);
  document.body.appendChild(panel);

  // Update preview
  const updatePreview = () => {
    previewContent = editor.exportDesignTokens(selectedFormat);
    const codeEl = panel!.querySelector('.dte-preview-code') as HTMLPreElement;
    if (codeEl) {
      const truncated = previewContent.length > 3000
        ? previewContent.slice(0, 3000) + '\n\n... (truncated, download for full output)'
        : previewContent;
      codeEl.textContent = truncated || '(no tokens to export — add color/text styles or variables first)';
    }
  };
  updatePreview();

  // Event listeners
  panel.querySelector('.dte-close')!.addEventListener('click', closePanel);
  panel.querySelector('.dte-cancel-btn')!.addEventListener('click', closePanel);
  panel.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).classList.contains('design-token-export-overlay')) closePanel();
  });

  panel.querySelectorAll('.dte-format-card').forEach(card => {
    card.addEventListener('click', () => {
      selectedFormat = (card as HTMLElement).dataset.format!;
      panel!.querySelectorAll('.dte-format-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      (card.querySelector('input') as HTMLInputElement).checked = true;
      updatePreview();
    });
  });

  panel.querySelector('.dte-copy-btn')!.addEventListener('click', () => {
    navigator.clipboard.writeText(previewContent).then(() => {
      const btn = panel!.querySelector('.dte-copy-btn') as HTMLButtonElement;
      btn.textContent = '✓ Copied!';
      setTimeout(() => { btn.textContent = '📋 Copy'; }, 1500);
    });
  });

  panel.querySelector('.dte-download-btn')!.addEventListener('click', () => {
    editor.downloadDesignTokens(selectedFormat);
    closePanel();
  });

  // Escape key
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { closePanel(); e.stopPropagation(); }
  };
  document.addEventListener('keydown', onKey, true);
  (panel as any)._keyHandler = onKey;
}

function closePanel() {
  if (!panel) return;
  const handler = (panel as any)._keyHandler;
  if (handler) document.removeEventListener('keydown', handler, true);
  panel.remove();
  panel = null;
}
