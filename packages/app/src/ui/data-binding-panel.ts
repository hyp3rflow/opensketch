import type { Editor } from "../editor";

type DataRow = Record<string, string>;

const STORAGE_KEY = "opensketch-data-binding-source";

function parseCsv(text: string): DataRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0]!.split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    const row: DataRow = {};
    headers.forEach((h, i) => { row[h] = (cols[i] ?? "").trim(); });
    return row;
  });
}

function parseData(input: string): DataRow[] {
  const text = input.trim();
  if (!text) return [];
  if (text.startsWith("[") || text.startsWith("{")) {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed as DataRow[];
    if (Array.isArray((parsed as any).data)) return (parsed as any).data as DataRow[];
    return [];
  }
  return parseCsv(text);
}

function applyTemplate(template: string, row: DataRow): string {
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key) => row[key] ?? "");
}

export function openDataBindingPanel(editor: Editor) {
  const existing = document.getElementById("data-binding-panel");
  if (existing) {
    existing.remove();
    return;
  }

  const panel = document.createElement("div");
  panel.id = "data-binding-panel";
  panel.style.cssText = "position:fixed;right:16px;top:80px;width:360px;max-height:70vh;overflow:auto;background:#1f1f2b;color:#fff;border:1px solid #3a3a4a;border-radius:10px;z-index:2000;padding:12px;box-shadow:0 8px 32px rgba(0,0,0,0.35);font:12px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;";

  const title = document.createElement("div");
  title.textContent = "Spreadsheet Data Binding (MVP)";
  title.style.cssText = "font-weight:700;margin-bottom:8px;";
  panel.appendChild(title);

  const help = document.createElement("div");
  help.textContent = "CSV/JSON을 붙여넣고, Text 노드에 {{field}} 템플릿을 사용하세요. 선택된 Text 노드만 적용됩니다.";
  help.style.cssText = "color:#a8b0c0;margin-bottom:8px;";
  panel.appendChild(help);

  const source = document.createElement("textarea");
  source.value = localStorage.getItem(STORAGE_KEY) ?? "name,role\nAva,Designer\nNoah,Engineer";
  source.style.cssText = "width:100%;height:140px;background:#151521;color:#dbe2ff;border:1px solid #3b3b54;border-radius:8px;padding:8px;resize:vertical;";
  panel.appendChild(source);

  const controls = document.createElement("div");
  controls.style.cssText = "display:flex;gap:8px;align-items:center;margin-top:10px;";

  const idxLabel = document.createElement("span");
  idxLabel.textContent = "Row 0";
  idxLabel.style.color = "#a8b0c0";

  const rowInput = document.createElement("input");
  rowInput.type = "number";
  rowInput.min = "0";
  rowInput.value = "0";
  rowInput.style.cssText = "width:72px;background:#151521;color:#fff;border:1px solid #3b3b54;border-radius:6px;padding:4px 6px;";

  const applyBtn = document.createElement("button");
  applyBtn.textContent = "Apply to selected text";
  applyBtn.style.cssText = "flex:1;background:#0d99ff;color:white;border:none;border-radius:8px;padding:8px 10px;cursor:pointer;font-weight:600;";

  controls.appendChild(idxLabel);
  controls.appendChild(rowInput);
  controls.appendChild(applyBtn);
  panel.appendChild(controls);

  const status = document.createElement("div");
  status.style.cssText = "margin-top:8px;color:#9fb4d3;";
  panel.appendChild(status);

  const close = document.createElement("button");
  close.textContent = "닫기";
  close.style.cssText = "margin-top:10px;width:100%;background:#2a2f45;color:#fff;border:1px solid #3b3b54;border-radius:8px;padding:7px;cursor:pointer;";
  close.addEventListener("click", () => panel.remove());
  panel.appendChild(close);

  const runApply = () => {
    try {
      localStorage.setItem(STORAGE_KEY, source.value);
      const rows = parseData(source.value);
      if (!rows.length) {
        status.textContent = "데이터 파싱 실패: CSV(header+rows) 또는 JSON array를 확인하세요.";
        return;
      }
      const idx = Math.max(0, Math.min(rows.length - 1, Number(rowInput.value) || 0));
      rowInput.value = String(idx);
      idxLabel.textContent = `Row ${idx} / ${rows.length - 1}`;
      const row = rows[idx]!;
      const sel = editor.getSelection();
      if (!sel.length) {
        status.textContent = "선택된 노드가 없습니다.";
        return;
      }

      let changed = 0;
      editor.engine.push_undo();
      for (const id of sel) {
        const info = JSON.parse(editor.engine.get_node_info(BigInt(id)));
        if (info?.kind !== "Text") continue;
        const template = String(info?.text_content ?? "");
        if (!template.includes("{{")) continue;
        editor.engine.set_text_content(BigInt(id), applyTemplate(template, row));
        changed += 1;
      }
      editor.requestRender();
      status.textContent = changed > 0
        ? `${changed}개 Text 노드에 데이터를 적용했습니다.`
        : "적용할 Text 템플릿({{field}})이 선택에 없습니다.";
    } catch (err: any) {
      status.textContent = `오류: ${err?.message ?? String(err)}`;
    }
  };

  applyBtn.addEventListener("click", runApply);
  rowInput.addEventListener("change", runApply);
  source.addEventListener("blur", () => localStorage.setItem(STORAGE_KEY, source.value));

  document.body.appendChild(panel);
}
