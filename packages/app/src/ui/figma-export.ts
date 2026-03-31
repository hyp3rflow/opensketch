/**
 * OpenSketch → Figma JSON Export
 * Converts OpenSketch scene data to Figma-compatible JSON format.
 * Supports: Rect, Ellipse, Text, Frame, Group, Image, Star, Polygon, Path, Section
 * Output is Figma REST API Node format (.fig compatible)
 */

// ── Figma output types ───────────────────────────────────────────

interface FigmaColor {
  r: number; g: number; b: number; a: number;
}

interface FigmaPaint {
  type: string;
  color?: FigmaColor;
  opacity?: number;
  visible?: boolean;
  gradientStops?: Array<{ position: number; color: FigmaColor }>;
  gradientHandlePositions?: Array<{ x: number; y: number }>;
}

interface FigmaEffect {
  type: string;
  visible: boolean;
  color?: FigmaColor;
  offset?: { x: number; y: number };
  radius?: number;
  spread?: number;
}

interface FigmaStroke {
  type: string;
  color?: FigmaColor;
  opacity?: number;
  visible?: boolean;
}

interface FigmaNode {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  rotation?: number;
  fills?: FigmaPaint[];
  strokes?: FigmaStroke[];
  strokeWeight?: number;
  strokeAlign?: string;
  strokeCap?: string;
  strokeJoin?: string;
  strokeDashes?: number[];
  cornerRadius?: number;
  rectangleCornerRadii?: number[];
  effects?: FigmaEffect[];
  blendMode?: string;
  children?: FigmaNode[];
  characters?: string;
  style?: Record<string, unknown>;
  constraints?: { horizontal: string; vertical: string };
  layoutMode?: string;
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  itemSpacing?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  clipsContent?: boolean;
  // Star/Polygon specific
  starInnerRadius?: number;
  pointCount?: number;
  // Path specific
  fillGeometry?: Array<{ path: string; windingRule: string }>;
}

// ── Helpers ──────────────────────────────────────────────────────

function parseHexColor(hex: string): FigmaColor {
  const h = hex.replace("#", "");
  if (h.length === 8) {
    return {
      r: parseInt(h.slice(0, 2), 16) / 255,
      g: parseInt(h.slice(2, 4), 16) / 255,
      b: parseInt(h.slice(4, 6), 16) / 255,
      a: parseInt(h.slice(6, 8), 16) / 255,
    };
  }
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
    a: 1,
  };
}

function convertFill(fill: any): FigmaPaint | null {
  if (!fill) return null;
  const visible = fill.visible !== false;

  if (fill.fill_type === "LinearGradient" && fill.gradient_stops) {
    return {
      type: "GRADIENT_LINEAR",
      visible,
      gradientStops: fill.gradient_stops.map((s: any) => ({
        position: s.offset,
        color: parseHexColor(s.color),
      })),
      gradientHandlePositions: [
        { x: fill.start_x ?? 0, y: fill.start_y ?? 0 },
        { x: fill.end_x ?? 1, y: fill.end_y ?? 0 },
      ],
    };
  }
  if (fill.fill_type === "RadialGradient" && fill.gradient_stops) {
    return {
      type: "GRADIENT_RADIAL",
      visible,
      gradientStops: fill.gradient_stops.map((s: any) => ({
        position: s.offset,
        color: parseHexColor(s.color),
      })),
      gradientHandlePositions: [
        { x: fill.center_x ?? 0.5, y: fill.center_y ?? 0.5 },
        { x: (fill.center_x ?? 0.5) + (fill.radius_x ?? 0.5), y: fill.center_y ?? 0.5 },
      ],
    };
  }
  // Solid color
  const color = fill.color || fill;
  if (typeof color === "string") {
    return { type: "SOLID", color: parseHexColor(color), visible };
  }
  if (color.r !== undefined) {
    return { type: "SOLID", color: { r: color.r, g: color.g, b: color.b, a: color.a ?? 1 }, visible };
  }
  return null;
}

function convertFills(node: any): FigmaPaint[] {
  const fills: FigmaPaint[] = [];
  if (node.fills && Array.isArray(node.fills)) {
    for (const f of node.fills) {
      const paint = convertFill(f);
      if (paint) fills.push(paint);
    }
  } else if (node.fill) {
    const paint = convertFill(node.fill);
    if (paint) fills.push(paint);
  }
  return fills;
}

function convertStroke(stroke: any): { paint: FigmaStroke; weight: number; align: string; cap: string; join: string; dashes: number[] } | null {
  if (!stroke) return null;
  const paint: FigmaStroke = {
    type: "SOLID",
    color: stroke.color ? parseHexColor(stroke.color) : { r: 0, g: 0, b: 0, a: 1 },
    visible: stroke.visible !== false,
  };
  return {
    paint,
    weight: stroke.width ?? 1,
    align: (stroke.align ?? "CENTER").toUpperCase(),
    cap: (stroke.line_cap ?? "NONE").toUpperCase(),
    join: (stroke.line_join ?? "MITER").toUpperCase(),
    dashes: stroke.dash_array ?? [],
  };
}

function convertShadows(shadows: any[]): FigmaEffect[] {
  if (!shadows?.length) return [];
  return shadows.map((s) => ({
    type: "DROP_SHADOW",
    visible: s.visible !== false,
    color: s.color ? parseHexColor(s.color) : { r: 0, g: 0, b: 0, a: 0.25 },
    offset: { x: s.offset_x ?? 0, y: s.offset_y ?? 4 },
    radius: s.blur ?? 4,
    spread: s.spread ?? 0,
  }));
}

function mapBlendMode(mode: string | undefined): string {
  if (!mode) return "NORMAL";
  const map: Record<string, string> = {
    Normal: "NORMAL", Multiply: "MULTIPLY", Screen: "SCREEN",
    Overlay: "OVERLAY", Darken: "DARKEN", Lighten: "LIGHTEN",
    ColorDodge: "COLOR_DODGE", ColorBurn: "COLOR_BURN",
    HardLight: "HARD_LIGHT", SoftLight: "SOFT_LIGHT",
    Difference: "DIFFERENCE", Exclusion: "EXCLUSION",
    Hue: "HUE", Saturation: "SATURATION", Color: "COLOR", Luminosity: "LUMINOSITY",
  };
  return map[mode] || "NORMAL";
}

function mapConstraintH(c: string | undefined): string {
  const map: Record<string, string> = {
    Left: "MIN", Right: "MAX", LeftAndRight: "STRETCH",
    Center: "CENTER", Scale: "SCALE",
  };
  return map[c ?? "Left"] || "MIN";
}

function mapConstraintV(c: string | undefined): string {
  const map: Record<string, string> = {
    Top: "MIN", Bottom: "MAX", TopAndBottom: "STRETCH",
    Center: "CENTER", Scale: "SCALE",
  };
  return map[c ?? "Top"] || "MIN";
}

function mapLayoutMode(layout: any): Partial<FigmaNode> {
  if (!layout || layout.mode === "None") return {};
  const result: Partial<FigmaNode> = {};
  if (layout.mode === "Flex") {
    result.layoutMode = layout.direction === "Row" ? "HORIZONTAL" : "VERTICAL";
    result.primaryAxisAlignItems = mapAxisAlign(layout.justify_content);
    result.counterAxisAlignItems = mapCounterAlign(layout.align_items);
    result.itemSpacing = layout.gap ?? 0;
    result.paddingTop = layout.padding?.top ?? 0;
    result.paddingRight = layout.padding?.right ?? 0;
    result.paddingBottom = layout.padding?.bottom ?? 0;
    result.paddingLeft = layout.padding?.left ?? 0;
  }
  return result;
}

function mapAxisAlign(v: string | undefined): string {
  const map: Record<string, string> = {
    Start: "MIN", End: "MAX", Center: "CENTER",
    SpaceBetween: "SPACE_BETWEEN",
  };
  return map[v ?? "Start"] || "MIN";
}

function mapCounterAlign(v: string | undefined): string {
  const map: Record<string, string> = {
    Start: "MIN", End: "MAX", Center: "CENTER", Stretch: "STRETCH",
  };
  return map[v ?? "Start"] || "MIN";
}

// ── Node conversion ─────────────────────────────────────────────

function convertNode(node: any): FigmaNode {
  const kind: string = typeof node.kind === "string" ? node.kind : node.kind?.type ?? "Rect";

  const figma: FigmaNode = {
    id: String(node.id ?? "0:0"),
    name: node.name ?? "Node",
    type: mapNodeType(kind),
    visible: node.visible !== false,
    locked: node.locked === true,
    opacity: node.opacity ?? 1,
    absoluteBoundingBox: {
      x: node.x ?? 0,
      y: node.y ?? 0,
      width: node.width ?? 100,
      height: node.height ?? 100,
    },
    fills: convertFills(node),
    blendMode: mapBlendMode(node.blend_mode),
  };

  // Rotation
  if (node.rotation) figma.rotation = node.rotation;

  // Strokes
  if (node.strokes?.length) {
    figma.strokes = [];
    for (const s of node.strokes) {
      const info = convertStroke(s);
      if (info) {
        figma.strokes.push(info.paint);
        figma.strokeWeight = info.weight;
        figma.strokeAlign = info.align;
        figma.strokeCap = info.cap;
        figma.strokeJoin = info.join;
        if (info.dashes.length) figma.strokeDashes = info.dashes;
      }
    }
  } else if (node.stroke) {
    const info = convertStroke(node.stroke);
    if (info) {
      figma.strokes = [info.paint];
      figma.strokeWeight = info.weight;
      figma.strokeAlign = info.align;
    }
  }

  // Corner radius
  if (node.corner_radius != null) {
    if (typeof node.corner_radius === "object") {
      figma.rectangleCornerRadii = [
        node.corner_radius.top_left ?? 0,
        node.corner_radius.top_right ?? 0,
        node.corner_radius.bottom_right ?? 0,
        node.corner_radius.bottom_left ?? 0,
      ];
      figma.cornerRadius = figma.rectangleCornerRadii[0];
    } else {
      figma.cornerRadius = node.corner_radius;
    }
  }

  // Effects (shadows + blur)
  const effects: FigmaEffect[] = convertShadows(node.shadows);
  if (node.blur) {
    effects.push({ type: "LAYER_BLUR", visible: true, radius: node.blur });
  }
  if (effects.length) figma.effects = effects;

  // Constraints
  if (node.constraint_h || node.constraint_v) {
    figma.constraints = {
      horizontal: mapConstraintH(node.constraint_h),
      vertical: mapConstraintV(node.constraint_v),
    };
  }

  // Layout (auto-layout)
  if (node.layout) {
    Object.assign(figma, mapLayoutMode(node.layout));
  }

  // Type-specific
  if (kind === "Text" || node.kind?.Text) {
    const textData = node.kind?.Text ?? node.kind;
    figma.characters = textData?.content ?? node.text ?? "";
    figma.style = {
      fontFamily: textData?.font_family ?? node.font_family ?? "Inter",
      fontSize: textData?.font_size ?? node.font_size ?? 14,
      fontWeight: textData?.font_weight ?? node.font_weight ?? 400,
      textAlignHorizontal: (textData?.text_align ?? "LEFT").toUpperCase(),
      lineHeightPx: textData?.line_height ?? node.line_height,
    };
  }

  if (kind === "Frame" || kind === "Group" || kind === "Section") {
    figma.clipsContent = kind === "Frame";
    if (node.children?.length) {
      figma.children = node.children.map(convertNode);
    }
  }

  if (kind === "Star") {
    figma.type = "STAR";
    const starData = node.kind?.Star ?? node.kind;
    figma.pointCount = starData?.points ?? 5;
    figma.starInnerRadius = starData?.inner_radius ?? 0.382;
  }

  if (kind === "Polygon") {
    figma.type = "REGULAR_POLYGON";
    const polyData = node.kind?.Polygon ?? node.kind;
    figma.pointCount = polyData?.sides ?? 3;
  }

  if (kind === "Path" || kind === "VectorNetwork") {
    figma.type = "VECTOR";
    // Include path data as fillGeometry
    const pathData = node.kind?.Path ?? node.kind;
    if (pathData?.points) {
      const d = buildSvgPath(pathData.points, pathData.closed);
      figma.fillGeometry = [{ path: d, windingRule: "NONZERO" }];
    }
  }

  if (kind === "Image") {
    figma.type = "RECTANGLE";
    const imgData = node.kind?.Image ?? node.kind;
    if (imgData?.src) {
      figma.fills = [{ type: "IMAGE", visible: true }];
    }
  }

  return figma;
}

function mapNodeType(kind: string): string {
  const map: Record<string, string> = {
    Rect: "RECTANGLE", Ellipse: "ELLIPSE", Text: "TEXT",
    Frame: "FRAME", Group: "GROUP", Section: "SECTION",
    Star: "STAR", Polygon: "REGULAR_POLYGON",
    Path: "VECTOR", VectorNetwork: "VECTOR",
    Image: "RECTANGLE", Instance: "INSTANCE",
    Slice: "SLICE", Connector: "CONNECTOR",
    StickyNote: "STICKY", Callout: "SHAPE_WITH_TEXT",
    Slot: "FRAME", Table: "TABLE",
  };
  return map[kind] || "RECTANGLE";
}

function buildSvgPath(points: any[], closed: boolean): string {
  if (!points?.length) return "";
  let d = "";
  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    const ax = pt.anchor?.x ?? pt.x ?? 0;
    const ay = pt.anchor?.y ?? pt.y ?? 0;
    if (i === 0) {
      d += `M ${ax} ${ay}`;
    } else {
      const prev = points[i - 1];
      const ho = prev.handle_out;
      const hi = pt.handle_in;
      if (ho || hi) {
        const hox = ho?.x ?? (prev.anchor?.x ?? prev.x ?? 0);
        const hoy = ho?.y ?? (prev.anchor?.y ?? prev.y ?? 0);
        const hix = hi?.x ?? ax;
        const hiy = hi?.y ?? ay;
        d += ` C ${hox} ${hoy} ${hix} ${hiy} ${ax} ${ay}`;
      } else {
        d += ` L ${ax} ${ay}`;
      }
    }
  }
  if (closed && points.length > 1) d += " Z";
  return d;
}

// ── Main export ─────────────────────────────────────────────────

export interface FigmaExportOptions {
  selectedOnly?: boolean;
}

export function exportToFigmaJSON(engine: any, options?: FigmaExportOptions): string {
  const sceneJson = engine.export_scene();
  const scene = JSON.parse(sceneJson);

  let nodes: any[];
  if (options?.selectedOnly) {
    // Get selected node IDs and filter
    const selJson = engine.get_selection?.();
    const selectedIds = selJson ? JSON.parse(selJson) : [];
    const allNodes = scene.nodes ?? scene.pages?.[0]?.nodes ?? [];
    nodes = allNodes.filter((n: any) => selectedIds.includes(n.id));
    if (!nodes.length) nodes = allNodes;
  } else {
    nodes = scene.nodes ?? scene.pages?.[0]?.nodes ?? [];
  }

  // Build Figma document
  const figmaDoc = {
    name: scene.name ?? "OpenSketch Export",
    document: {
      id: "0:0",
      name: "Document",
      type: "DOCUMENT",
      children: [{
        id: "0:1",
        name: "Page 1",
        type: "CANVAS",
        children: nodes.map(convertNode),
        backgroundColor: { r: 0.96, g: 0.96, b: 0.96, a: 1 },
      }],
    },
    schemaVersion: 0,
    version: "OpenSketch Export",
  };

  return JSON.stringify(figmaDoc, null, 2);
}

// ── UI: Export dialog ───────────────────────────────────────────

export function createFigmaExportPanel(editor: any): HTMLElement {
  const overlay = document.createElement("div");
  overlay.className = "figma-export-overlay";
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;
    background:rgba(0,0,0,0.5);
  `;

  const panel = document.createElement("div");
  panel.style.cssText = `
    background:#2a2a2a;border-radius:12px;padding:24px;width:520px;max-height:80vh;
    display:flex;flex-direction:column;gap:16px;box-shadow:0 8px 32px rgba(0,0,0,0.4);
    color:#ccc;font-family:Inter,system-ui,sans-serif;
  `;

  // Header
  const header = document.createElement("div");
  header.style.cssText = "display:flex;justify-content:space-between;align-items:center;";
  const title = document.createElement("h3");
  title.textContent = "Export to Figma JSON";
  title.style.cssText = "margin:0;color:#fff;font-size:16px;";
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.style.cssText = "background:none;border:none;color:#888;font-size:18px;cursor:pointer;padding:4px;";
  closeBtn.onclick = () => overlay.remove();
  header.append(title, closeBtn);

  // Options
  const optionsDiv = document.createElement("div");
  optionsDiv.style.cssText = "display:flex;gap:12px;align-items:center;";
  const selLabel = document.createElement("label");
  selLabel.style.cssText = "display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;";
  const selCheck = document.createElement("input");
  selCheck.type = "checkbox";
  selLabel.append(selCheck, document.createTextNode("Selected nodes only"));
  optionsDiv.append(selLabel);

  // Preview area
  const preview = document.createElement("pre");
  preview.style.cssText = `
    background:#1a1a1a;border-radius:8px;padding:12px;font-size:11px;font-family:'SF Mono',monospace;
    color:#a0d0a0;max-height:300px;overflow:auto;white-space:pre-wrap;word-break:break-all;
    border:1px solid #333;margin:0;
  `;

  function updatePreview() {
    try {
      const json = exportToFigmaJSON(editor.engine, { selectedOnly: selCheck.checked });
      const parsed = JSON.parse(json);
      const nodeCount = parsed.document?.children?.[0]?.children?.length ?? 0;
      preview.textContent = `// ${nodeCount} node(s) exported\n` + json.slice(0, 5000) + (json.length > 5000 ? "\n..." : "");
    } catch (e) {
      preview.textContent = `Error: ${e}`;
    }
  }

  selCheck.addEventListener("change", updatePreview);
  updatePreview();

  // Actions
  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;gap:8px;justify-content:flex-end;";

  const copyBtn = document.createElement("button");
  copyBtn.textContent = "📋 Copy JSON";
  copyBtn.style.cssText = `
    padding:8px 16px;background:#4a90d9;color:#fff;border:none;border-radius:8px;
    font-size:12px;cursor:pointer;font-weight:600;
  `;
  copyBtn.onclick = () => {
    const json = exportToFigmaJSON(editor.engine, { selectedOnly: selCheck.checked });
    navigator.clipboard.writeText(json);
    copyBtn.textContent = "✓ Copied!";
    setTimeout(() => { copyBtn.textContent = "📋 Copy JSON"; }, 1500);
  };

  const dlBtn = document.createElement("button");
  dlBtn.textContent = "💾 Download .json";
  dlBtn.style.cssText = `
    padding:8px 16px;background:#2d7d46;color:#fff;border:none;border-radius:8px;
    font-size:12px;cursor:pointer;font-weight:600;
  `;
  dlBtn.onclick = () => {
    const json = exportToFigmaJSON(editor.engine, { selectedOnly: selCheck.checked });
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "opensketch-export.fig.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  actions.append(copyBtn, dlBtn);

  panel.append(header, optionsDiv, preview, actions);
  overlay.append(panel);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  document.addEventListener("keydown", function esc(e) {
    if (e.key === "Escape") { overlay.remove(); document.removeEventListener("keydown", esc); }
  });

  return overlay;
}

/**
 * Show the Figma export dialog.
 */
export function showFigmaExport(editor: any) {
  const panel = createFigmaExportPanel(editor);
  document.body.appendChild(panel);
}
