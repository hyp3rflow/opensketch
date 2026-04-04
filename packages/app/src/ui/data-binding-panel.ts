import type { Editor } from "../editor";

type DataRow = Record<string, string>;

const STORAGE_KEY = "opensketch-data-binding-source";

type TemplateTarget = { nodeId: number; path: string; template: string; field: "text_content" | "image_src" };

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

function safeNodeInfo(editor: Editor, id: number) {
  try {
    return JSON.parse(editor.engine.get_node_info(BigInt(id)));
  } catch {
    return null;
  }
}

function collectTemplateTargets(editor: Editor, rootId: number, path: string, out: TemplateTarget[]) {
  const info = safeNodeInfo(editor, rootId);
  if (!info) return;
  if (info.kind === "Text") {
    const template = String(info.text_content ?? "");
    if (template.includes("{{")) out.push({ nodeId: rootId, path, template, field: "text_content" });
  }
  if (info.kind === "Image") {
    const template = String(info.image_src ?? "");
    if (template.includes("{{")) out.push({ nodeId: rootId, path, template, field: "image_src" });
  }
  const children: number[] = Array.isArray(info.children) ? info.children : [];
  children.forEach((cid, idx) => collectTemplateTargets(editor, cid, `${path}/${idx}`, out));
}

function applyToRepeatGrid(editor: Editor, gridId: number, rows: DataRow[]): { cells: number; fields: number } {
  const params = JSON.parse(editor.engine.get_repeat_grid_params(BigInt(gridId)) || "{}");
  const columns = Math.max(1, Number(params.columns) || 1);
  const currentRows = Math.max(1, Number(params.rows) || 1);
  const nextRows = Math.max(currentRows, Math.ceil(rows.length / columns));
  if (nextRows !== currentRows) {
    editor.engine.set_repeat_grid_params(BigInt(gridId), columns, nextRows, Number(params.column_gap) || 0, Number(params.row_gap) || 0);
  }

  const gridInfo = safeNodeInfo(editor, gridId);
  const masterId: number | null = gridInfo?.children?.[0] ?? null;
  if (!masterId) return { cells: 0, fields: 0 };

  const targets: TemplateTarget[] = [];
  collectTemplateTargets(editor, masterId, "0", targets);
  if (!targets.length) return { cells: 0, fields: 0 };

  let touchedCells = 0;
  let touchedFields = 0;

  rows.forEach((row, rowIdx) => {
    const r = Math.floor(rowIdx / columns);
    const c = rowIdx % columns;
    let cellChanged = false;
    targets.forEach((target) => {
      const value = applyTemplate(target.template, row);
      editor.engine.set_repeat_grid_override(BigInt(gridId), r, c, target.path, target.field, value);
      touchedFields += 1;
      cellChanged = true;
    });
    if (cellChanged) touchedCells += 1;
  });

  editor.engine.sync_repeat_grid(BigInt(gridId));
  return { cells: touchedCells, fields: touchedFields };
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
  title.textContent = "Spreadsheet Data Binding";
  title.style.cssText = "font-weight:700;margin-bottom:8px;";
  panel.appendChild(title);

  const help = document.createElement("div");
  help.textContent = "CSV/JSON을 붙여넣고 Text/Image 템플릿 {{field}}를 바인딩하세요. Repeat Grid도 지원합니다.";
  help.style.cssText = "color:#a8b0c0;margin-bottom:8px;";
  panel.appendChild(help);

  const source = document.createElement("textarea");
  source.value = localStorage.getItem(STORAGE_KEY) ?? "name,role,avatar\nAva,Designer,https://picsum.photos/seed/ava/200/200\nNoah,Engineer,https://picsum.photos/seed/noah/200/200";
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
  applyBtn.textContent = "Apply to selected nodes";
  applyBtn.style.cssText = "flex:1;background:#0d99ff;color:white;border:none;border-radius:8px;padding:8px 10px;cursor:pointer;font-weight:600;";

  controls.appendChild(idxLabel);
  controls.appendChild(rowInput);
  controls.appendChild(applyBtn);
  panel.appendChild(controls);

  const liveRow = document.createElement("label");
  liveRow.style.cssText = "display:flex;align-items:center;gap:8px;margin-top:8px;color:#a8b0c0;";
  const liveCheckbox = document.createElement("input");
  liveCheckbox.type = "checkbox";
  liveCheckbox.checked = true;
  liveRow.appendChild(liveCheckbox);
  const liveText = document.createElement("span");
  liveText.textContent = "행 번호 변경 시 실시간 미리보기";
  liveRow.appendChild(liveText);
  panel.appendChild(liveRow);

  const gridBtn = document.createElement("button");
  gridBtn.textContent = "Apply to selected Repeat Grid";
  gridBtn.style.cssText = "margin-top:8px;width:100%;background:#6d28d9;color:#fff;border:none;border-radius:8px;padding:8px 10px;cursor:pointer;font-weight:600;";
  panel.appendChild(gridBtn);

  const status = document.createElement("div");
  status.style.cssText = "margin-top:8px;color:#9fb4d3;";
  panel.appendChild(status);

  const close = document.createElement("button");
  close.textContent = "닫기";
  close.style.cssText = "margin-top:10px;width:100%;background:#2a2f45;color:#fff;border:1px solid #3b3b54;border-radius:8px;padding:7px;cursor:pointer;";
  close.addEventListener("click", () => panel.remove());
  panel.appendChild(close);

  const parseRowsOrStatus = (): DataRow[] | null => {
    try {
      localStorage.setItem(STORAGE_KEY, source.value);
      const rows = parseData(source.value);
      if (!rows.length) {
        status.textContent = "데이터 파싱 실패: CSV(header+rows) 또는 JSON array를 확인하세요.";
        return null;
      }
      return rows;
    } catch (err: any) {
      status.textContent = `오류: ${err?.message ?? String(err)}`;
      return null;
    }
  };

  const runApply = (pushUndo = true) => {
    const rows = parseRowsOrStatus();
    if (!rows) return;
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
    if (pushUndo) editor.engine.push_undo();
    for (const id of sel) {
      const info = safeNodeInfo(editor, id);
      if (info?.kind === "Text") {
        const template = String(info?.text_content ?? "");
        if (!template.includes("{{")) continue;
        editor.engine.set_text_content(BigInt(id), applyTemplate(template, row));
        changed += 1;
      } else if (info?.kind === "Image") {
        const template = String(info?.image_src ?? "");
        if (!template.includes("{{")) continue;
        editor.engine.set_image_src(BigInt(id), applyTemplate(template, row));
        changed += 1;
      }
    }
    editor.requestRender();
    status.textContent = changed > 0
      ? `${changed}개 Text/Image 노드에 데이터를 적용했습니다.`
      : "적용할 템플릿({{field}})이 선택에 없습니다.";
  };

  const runApplyRepeatGrid = () => {
    const rows = parseRowsOrStatus();
    if (!rows) return;

    const sel = editor.getSelection();
    if (!sel.length) {
      status.textContent = "Repeat Grid 노드를 선택하세요.";
      return;
    }

    let gridCount = 0;
    let cells = 0;
    let fields = 0;

    editor.engine.push_undo();
    for (const id of sel) {
      const info = safeNodeInfo(editor, id);
      if (info?.kind !== "RepeatGrid") continue;
      const res = applyToRepeatGrid(editor, id, rows);
      if (res.fields > 0) {
        gridCount += 1;
        cells += res.cells;
        fields += res.fields;
      }
    }

    editor.requestRender();
    status.textContent = gridCount > 0
      ? `${gridCount}개 Repeat Grid에 ${cells}개 셀 / ${fields}개 필드를 바인딩했습니다.`
      : "선택한 Repeat Grid에서 {{field}} 템플릿(Text/Image)을 찾지 못했습니다.";
  };

  applyBtn.addEventListener("click", () => runApply(true));
  gridBtn.addEventListener("click", runApplyRepeatGrid);
  rowInput.addEventListener("change", () => runApply(Boolean(!liveCheckbox.checked)));
  source.addEventListener("blur", () => localStorage.setItem(STORAGE_KEY, source.value));
  source.addEventListener("input", () => {
    if (!liveCheckbox.checked) return;
    runApply(false);
  });

  document.body.appendChild(panel);
}
