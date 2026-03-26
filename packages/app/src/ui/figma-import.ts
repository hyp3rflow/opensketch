/**
 * Figma → OpenSketch Import
 * Fetches a Figma file via REST API and converts nodes to OpenSketch format.
 */
import type { Engine } from "../wasm/opensketch_engine";

// ── Figma API types ──────────────────────────────────────────────

interface FigmaColor {
  r: number; g: number; b: number; a: number;
}

interface FigmaGradientStop {
  position: number;
  color: FigmaColor;
}

interface FigmaPaint {
  type: string; // SOLID, GRADIENT_LINEAR, GRADIENT_RADIAL, IMAGE
  color?: FigmaColor;
  opacity?: number;
  visible?: boolean;
  gradientStops?: FigmaGradientStop[];
  gradientHandlePositions?: { x: number; y: number }[];
  imageRef?: string;
}

interface FigmaEffect {
  type: string; // DROP_SHADOW, LAYER_BLUR, etc.
  visible?: boolean;
  color?: FigmaColor;
  offset?: { x: number; y: number };
  radius: number;
  spread?: number;
}

interface FigmaLayoutConstraint {
  horizontal: string; // LEFT, RIGHT, LEFT_RIGHT, CENTER, SCALE
  vertical: string;   // TOP, BOTTOM, TOP_BOTTOM, CENTER, SCALE
}

interface FigmaNode {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  locked?: boolean;
  opacity?: number;
  rotation?: number;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  relativeTransform?: number[][];
  children?: FigmaNode[];
  fills?: FigmaPaint[];
  strokes?: FigmaPaint[];
  strokeWeight?: number;
  strokeAlign?: string;
  cornerRadius?: number;
  rectangleCornerRadii?: number[];
  characters?: string;
  style?: {
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: number;
    italic?: boolean;
    textAlignHorizontal?: string;
    lineHeightPx?: number;
  };
  effects?: FigmaEffect[];
  blendMode?: string;
  constraints?: FigmaLayoutConstraint;
  layoutMode?: string;        // HORIZONTAL, VERTICAL
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  itemSpacing?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  layoutWrap?: string;
  clipsContent?: boolean;
  // Star/Polygon specifics not in Figma API directly,
  // but we'll handle regular polygon & star as REGULAR_POLYGON type
  starInnerRadius?: number;
  pointCount?: number;
  // Vector geometry (when geometry=paths is requested)
  fillGeometry?: { path: string; windingRule: string }[];
  strokeGeometry?: { path: string; windingRule: string }[];
  // Component info
  componentId?: string;
  // Interaction / prototype
  transitionNodeID?: string;
  transitionDuration?: number;
  reactions?: { trigger: { type: string }; action: { type: string; destinationId?: string; navigation?: string; transition?: { type: string; duration: number } } }[];
}

interface FigmaFileResponse {
  name: string;
  document: FigmaNode;
  components: Record<string, unknown>;
  schemaVersion: number;
}

// ── Conversion ───────────────────────────────────────────────────

interface ImportStats {
  total: number;
  converted: number;
  skipped: number;
  errors: string[];
}

function figmaColorToRGBA(c: FigmaColor): { r: number; g: number; b: number; a: number } {
  return {
    r: Math.round(c.r * 255),
    g: Math.round(c.g * 255),
    b: Math.round(c.b * 255),
    a: c.a,
  };
}

function mapBlendMode(bm?: string): string {
  if (!bm) return "Normal";
  const map: Record<string, string> = {
    NORMAL: "Normal", MULTIPLY: "Multiply", SCREEN: "Screen",
    OVERLAY: "Overlay", DARKEN: "Darken", LIGHTEN: "Lighten",
    COLOR_DODGE: "ColorDodge", COLOR_BURN: "ColorBurn",
    HARD_LIGHT: "HardLight", SOFT_LIGHT: "SoftLight",
    DIFFERENCE: "Difference", EXCLUSION: "Exclusion",
    HUE: "Hue", SATURATION: "Saturation", COLOR: "Color", LUMINOSITY: "Luminosity",
  };
  return map[bm] || "Normal";
}

function mapConstraintH(c?: string): string {
  const map: Record<string, string> = {
    LEFT: "Left", RIGHT: "Right", LEFT_RIGHT: "LeftAndRight",
    CENTER: "Center", SCALE: "Scale",
  };
  return map[c || "LEFT"] || "Left";
}

function mapConstraintV(c?: string): string {
  const map: Record<string, string> = {
    TOP: "Top", BOTTOM: "Bottom", TOP_BOTTOM: "TopAndBottom",
    CENTER: "Center", SCALE: "Scale",
  };
  return map[c || "TOP"] || "Top";
}

function applyFills(engine: Engine, nodeId: number, fills?: FigmaPaint[]) {
  if (!fills || fills.length === 0) return;
  const visibleFills = fills.filter(f => f.visible !== false);
  for (let i = 0; i < visibleFills.length; i++) {
    const fill = visibleFills[i];
    if (fill.type === "SOLID" && fill.color) {
      const c = figmaColorToRGBA(fill.color);
      const a = c.a * (fill.opacity ?? 1);
      if (i === 0) {
        engine.set_fill_color(BigInt(nodeId), c.r, c.g, c.b, a);
      } else {
        engine.add_fill(BigInt(nodeId), c.r, c.g, c.b, a);
      }
    } else if (fill.type === "GRADIENT_LINEAR" && fill.gradientStops && fill.gradientHandlePositions) {
      const h = fill.gradientHandlePositions;
      const stops = JSON.stringify(fill.gradientStops.map(s => ({
        offset: s.position,
        color: `rgba(${Math.round(s.color.r * 255)},${Math.round(s.color.g * 255)},${Math.round(s.color.b * 255)},${s.color.a})`,
      })));
      if (i === 0) {
        engine.set_fill_linear_gradient(BigInt(nodeId), h[0].x, h[0].y, h[1].x, h[1].y, stops);
      } else {
        engine.set_fill_linear_gradient_at(BigInt(nodeId), i, h[0].x, h[0].y, h[1].x, h[1].y, stops);
      }
    } else if (fill.type === "GRADIENT_RADIAL" && fill.gradientStops && fill.gradientHandlePositions) {
      const h = fill.gradientHandlePositions;
      const stops = JSON.stringify(fill.gradientStops.map(s => ({
        offset: s.position,
        color: `rgba(${Math.round(s.color.r * 255)},${Math.round(s.color.g * 255)},${Math.round(s.color.b * 255)},${s.color.a})`,
      })));
      if (i === 0) {
        engine.set_fill_radial_gradient(BigInt(nodeId), h[0].x, h[0].y, 0.5, stops);
      } else {
        engine.set_fill_radial_gradient_at(BigInt(nodeId), i, h[0].x, h[0].y, 0.5, stops);
      }
    }
  }
}

function applyStrokes(engine: Engine, nodeId: number, strokes?: FigmaPaint[], strokeWeight?: number, strokeAlign?: string) {
  if (!strokes || strokes.length === 0) return;
  const w = strokeWeight ?? 1;
  for (let i = 0; i < strokes.length; i++) {
    const s = strokes[i];
    if (s.visible === false) continue;
    if (s.type === "SOLID" && s.color) {
      const c = figmaColorToRGBA(s.color);
      const a = c.a * (s.opacity ?? 1);
      if (i === 0) {
        engine.set_stroke(BigInt(nodeId), c.r, c.g, c.b, a, w);
        if (strokeAlign) {
          const alignMap: Record<string, string> = { INSIDE: "Inside", OUTSIDE: "Outside", CENTER: "Center" };
          engine.set_stroke_align(BigInt(nodeId), alignMap[strokeAlign] || "Center");
        }
      } else {
        engine.add_stroke(BigInt(nodeId), c.r, c.g, c.b, a, w);
      }
    }
  }
}

function applyEffects(engine: Engine, nodeId: number, effects?: FigmaEffect[]) {
  if (!effects) return;
  for (const eff of effects) {
    if (eff.visible === false) continue;
    if (eff.type === "DROP_SHADOW" && eff.color) {
      const c = figmaColorToRGBA(eff.color);
      engine.add_shadow(
        BigInt(nodeId), c.r, c.g, c.b, c.a,
        eff.offset?.x ?? 0, eff.offset?.y ?? 4,
        eff.radius, eff.spread ?? 0,
      );
    } else if (eff.type === "LAYER_BLUR") {
      engine.set_blur(BigInt(nodeId), eff.radius);
    }
  }
}

function applyCommonProps(engine: Engine, nodeId: number, figmaNode: FigmaNode) {
  // Name
  engine.set_node_name(BigInt(nodeId), figmaNode.name);

  // Opacity
  if (figmaNode.opacity !== undefined && figmaNode.opacity !== 1) {
    engine.set_opacity(BigInt(nodeId), figmaNode.opacity);
  }

  // Visibility
  if (figmaNode.visible === false) {
    engine.set_visible(BigInt(nodeId), false);
  }

  // Locked
  if (figmaNode.locked) {
    engine.set_locked(BigInt(nodeId), true);
  }

  // Corner radius
  if (figmaNode.cornerRadius && figmaNode.cornerRadius > 0) {
    engine.set_corner_radius(BigInt(nodeId), figmaNode.cornerRadius);
  }

  // Blend mode
  const bm = mapBlendMode(figmaNode.blendMode);
  if (bm !== "Normal") {
    engine.set_blend_mode(BigInt(nodeId), bm);
  }

  // Constraints
  if (figmaNode.constraints) {
    const ch = mapConstraintH(figmaNode.constraints.horizontal);
    const cv = mapConstraintV(figmaNode.constraints.vertical);
    if (ch !== "Left" || cv !== "Top") {
      engine.set_constraints(BigInt(nodeId), ch, cv);
    }
  }

  // Rotation
  if (figmaNode.rotation && figmaNode.rotation !== 0) {
    engine.set_rotation(BigInt(nodeId), figmaNode.rotation * Math.PI / 180);
  }

  // Fills, strokes, effects
  applyFills(engine, nodeId, figmaNode.fills);
  applyStrokes(engine, nodeId, figmaNode.strokes, figmaNode.strokeWeight, figmaNode.strokeAlign);
  applyEffects(engine, nodeId, figmaNode.effects);
}

// ── SVG path → OpenSketch path points (simplified parser) ────────

interface ParsedPathPoint {
  x: number;
  y: number;
  handleIn?: { x: number; y: number };
  handleOut?: { x: number; y: number };
}

/**
 * Parse a simplified SVG path string into path points.
 * Supports M, L, C, Z commands (absolute only — Figma geometry uses absolute).
 */
function parseSVGPathToPoints(d: string, _offsetX: number = 0, _offsetY: number = 0): ParsedPathPoint[] {
  const points: ParsedPathPoint[] = [];
  // Tokenize: split into commands
  const cmds = d.match(/[MLCZmlcz][^MLCZmlcz]*/g);
  if (!cmds) return points;

  let cx = 0, cy = 0;

  for (const cmd of cmds) {
    const type = cmd[0];
    const nums = cmd.slice(1).trim().split(/[\s,]+/).map(Number).filter(n => !isNaN(n));

    switch (type) {
      case 'M':
        if (nums.length >= 2) {
          cx = nums[0]; cy = nums[1];
          points.push({ x: cx, y: cy });
        }
        break;
      case 'L':
        for (let i = 0; i + 1 < nums.length; i += 2) {
          cx = nums[i]; cy = nums[i + 1];
          points.push({ x: cx, y: cy });
        }
        break;
      case 'C':
        for (let i = 0; i + 5 < nums.length; i += 6) {
          const cp1x = nums[i], cp1y = nums[i + 1];
          const cp2x = nums[i + 2], cp2y = nums[i + 3];
          const ex = nums[i + 4], ey = nums[i + 5];
          // Set handle_out on previous point
          if (points.length > 0) {
            points[points.length - 1].handleOut = { x: cp1x, y: cp1y };
          }
          points.push({ x: ex, y: ey, handleIn: { x: cp2x, y: cp2y } });
          cx = ex; cy = ey;
        }
        break;
      case 'Z':
      case 'z':
        // Close path — handled by caller
        break;
      // Relative commands (lowercase) — basic support
      case 'm':
        if (nums.length >= 2) {
          cx += nums[0]; cy += nums[1];
          points.push({ x: cx, y: cy });
        }
        break;
      case 'l':
        for (let i = 0; i + 1 < nums.length; i += 2) {
          cx += nums[i]; cy += nums[i + 1];
          points.push({ x: cx, y: cy });
        }
        break;
      case 'c':
        for (let i = 0; i + 5 < nums.length; i += 6) {
          const cp1x = cx + nums[i], cp1y = cy + nums[i + 1];
          const cp2x = cx + nums[i + 2], cp2y = cy + nums[i + 3];
          const ex = cx + nums[i + 4], ey = cy + nums[i + 5];
          if (points.length > 0) {
            points[points.length - 1].handleOut = { x: cp1x, y: cp1y };
          }
          points.push({ x: ex, y: ey, handleIn: { x: cp2x, y: cp2y } });
          cx = ex; cy = ey;
        }
        break;
    }
  }
  return points;
}

// ── Prototype / interaction import ───────────────────────────────

function applyInteractions(engine: Engine, nodeId: number, figmaNode: FigmaNode, _idMap: Map<string, number>) {
  if (!figmaNode.reactions || figmaNode.reactions.length === 0) return;
  for (const reaction of figmaNode.reactions) {
    const trigger = reaction.trigger?.type || "ON_CLICK";
    const action = reaction.action;
    if (!action) continue;
    // Map Figma trigger types
    const triggerMap: Record<string, string> = {
      ON_CLICK: "OnClick", ON_HOVER: "OnHover", ON_PRESS: "OnPress", ON_DRAG: "OnDrag",
    };
    const osTrigger = triggerMap[trigger] || "OnClick";
    // Map action types
    if (action.type === "NODE" && action.destinationId) {
      const targetId = _idMap.get(action.destinationId);
      if (targetId !== undefined) {
        const transType = action.transition?.type || "INSTANT_TRANSITION";
        const transMap: Record<string, string> = {
          INSTANT_TRANSITION: "Instant", DISSOLVE: "Dissolve",
          SMART_ANIMATE: "SmartAnimate", SLIDE_IN: "SlideIn",
          SLIDE_OUT: "SlideOut", PUSH: "Push",
        };
        const osTrans = transMap[transType] || "Instant";
        const duration = action.transition?.duration ?? 300;
        engine.add_interaction(BigInt(nodeId), osTrigger, "NavigateTo", BigInt(targetId), osTrans, duration);
      }
    } else if (action.navigation === "BACK") {
      engine.add_interaction(BigInt(nodeId), osTrigger, "Back", BigInt(0), "Instant", 0);
    }
  }
}

/** Recursively convert Figma nodes. Returns created OpenSketch node ID or null. */
function convertNode(
  engine: Engine,
  figmaNode: FigmaNode,
  parentId: number | null,
  offsetX: number,
  offsetY: number,
  stats: ImportStats,
  idMap: Map<string, number> = new Map(),
): number | null {
  stats.total++;

  const bb = figmaNode.absoluteBoundingBox;
  if (!bb && !["DOCUMENT", "CANVAS"].includes(figmaNode.type)) {
    stats.skipped++;
    return null;
  }

  const x = bb ? bb.x - offsetX : 0;
  const y = bb ? bb.y - offsetY : 0;
  const w = bb?.width ?? 100;
  const h = bb?.height ?? 100;

  let nodeId: number | null = null;

  try {
    switch (figmaNode.type) {
      case "DOCUMENT":
        // Process first page (canvas)
        if (figmaNode.children && figmaNode.children.length > 0) {
          for (const page of figmaNode.children) {
            convertNode(engine, page, null, 0, 0, stats, idMap);
          }
        }
        return null;

      case "CANVAS":
        // Process all top-level children of the page
        if (figmaNode.children) {
          for (const child of figmaNode.children) {
            convertNode(engine, child, null, 0, 0, stats, idMap);
          }
        }
        return null;

      case "FRAME":
      case "COMPONENT":
      case "COMPONENT_SET":
      case "INSTANCE": {
        nodeId = Number(engine.add_frame(x, y, w, h));
        applyCommonProps(engine, nodeId, figmaNode);

        // Auto layout
        if (figmaNode.layoutMode) {
          const dir = figmaNode.layoutMode === "HORIZONTAL" ? "Row" : "Column";
          engine.set_layout_mode(BigInt(nodeId), "Flex");
          // Set direction via gap/padding which implies direction
          // Actually need to check if there's a set_layout_direction
          if (figmaNode.itemSpacing !== undefined) {
            engine.set_layout_gap(BigInt(nodeId), figmaNode.itemSpacing);
          }
          if (figmaNode.paddingTop !== undefined || figmaNode.paddingLeft !== undefined) {
            engine.set_layout_padding(
              BigInt(nodeId),
              figmaNode.paddingTop ?? 0,
              figmaNode.paddingRight ?? 0,
              figmaNode.paddingBottom ?? 0,
              figmaNode.paddingLeft ?? 0,
            );
          }
        }

        // Recurse children
        if (figmaNode.children) {
          for (const child of figmaNode.children) {
            const childId = convertNode(engine, child, nodeId, 0, 0, stats, idMap);
            if (childId !== null) {
              engine.reparent_node(BigInt(childId), BigInt(nodeId));
              // Adjust position relative to frame
              if (child.absoluteBoundingBox && bb) {
                engine.set_node_position(
                  BigInt(childId),
                  child.absoluteBoundingBox.x - bb.x,
                  child.absoluteBoundingBox.y - bb.y,
                );
              }
            }
          }
        }
        break;
      }

      case "GROUP": {
        // Create as frame (OpenSketch doesn't have a separate add_group)
        nodeId = Number(engine.add_frame(x, y, w, h));
        applyCommonProps(engine, nodeId, figmaNode);

        if (figmaNode.children) {
          for (const child of figmaNode.children) {
            const childId = convertNode(engine, child, nodeId, 0, 0, stats, idMap);
            if (childId !== null) {
              engine.reparent_node(BigInt(childId), BigInt(nodeId));
              if (child.absoluteBoundingBox && bb) {
                engine.set_node_position(
                  BigInt(childId),
                  child.absoluteBoundingBox.x - bb.x,
                  child.absoluteBoundingBox.y - bb.y,
                );
              }
            }
          }
        }
        break;
      }

      case "RECTANGLE":
      case "ROUNDED_RECTANGLE": {
        nodeId = Number(engine.add_rect(x, y, w, h));
        applyCommonProps(engine, nodeId, figmaNode);
        break;
      }

      case "ELLIPSE": {
        nodeId = Number(engine.add_ellipse(x, y, w, h));
        applyCommonProps(engine, nodeId, figmaNode);
        break;
      }

      case "TEXT": {
        const content = figmaNode.characters || figmaNode.name || "Text";
        const fontSize = figmaNode.style?.fontSize ?? 16;
        nodeId = Number(engine.add_text(x, y, content, fontSize));
        applyCommonProps(engine, nodeId, figmaNode);

        // Text-specific properties
        const st = figmaNode.style;
        if (st) {
          if (st.fontFamily) {
            engine.set_font_family(BigInt(nodeId), st.fontFamily);
          }
          if (st.fontWeight) {
            engine.set_font_weight(BigInt(nodeId), st.fontWeight);
          }
          if (st.italic) {
            engine.set_font_style(BigInt(nodeId), "italic");
          }
          if (st.textAlignHorizontal) {
            const alignMap: Record<string, string> = {
              LEFT: "left", CENTER: "center", RIGHT: "right", JUSTIFIED: "left",
            };
            engine.set_text_align(BigInt(nodeId), alignMap[st.textAlignHorizontal] || "left");
          }
          if (st.lineHeightPx && st.lineHeightPx > 0) {
            engine.set_line_height(BigInt(nodeId), st.lineHeightPx);
          }
        }
        break;
      }

      case "REGULAR_POLYGON": {
        // Figma regular polygon
        const sides = figmaNode.pointCount ?? 3;
        nodeId = Number(engine.add_polygon(x, y, w, h, sides));
        applyCommonProps(engine, nodeId, figmaNode);
        break;
      }

      case "STAR": {
        const points = figmaNode.pointCount ?? 5;
        const inner = figmaNode.starInnerRadius ?? 0.382;
        nodeId = Number(engine.add_star(x, y, w, h, points, inner));
        applyCommonProps(engine, nodeId, figmaNode);
        break;
      }

      case "LINE": {
        // Render as a thin rectangle
        nodeId = Number(engine.add_rect(x, y, Math.max(w, 1), Math.max(h, 1)));
        applyCommonProps(engine, nodeId, figmaNode);
        break;
      }

      case "VECTOR": {
        // Try to import vector geometry as Path node
        const geom = figmaNode.fillGeometry?.[0] || figmaNode.strokeGeometry?.[0];
        if (geom && geom.path) {
          const pathPoints = parseSVGPathToPoints(geom.path, bb ? bb.x : 0, bb ? bb.y : 0);
          if (pathPoints.length > 0) {
            nodeId = Number(engine.add_path(pathPoints[0].x, pathPoints[0].y));
            // Add remaining points
            for (let pi = 1; pi < pathPoints.length; pi++) {
              const pp = pathPoints[pi];
              if (pp.handleIn || pp.handleOut) {
                engine.path_add_curve_point(BigInt(nodeId), pp.x, pp.y,
                  pp.handleIn?.x ?? pp.x, pp.handleIn?.y ?? pp.y,
                  pp.handleOut?.x ?? pp.x, pp.handleOut?.y ?? pp.y);
              } else {
                engine.path_add_point(BigInt(nodeId), pp.x, pp.y);
              }
            }
            if (pathPoints.length > 2) {
              engine.path_set_closed(BigInt(nodeId), true);
            }
            applyCommonProps(engine, nodeId, figmaNode);
            break;
          }
        }
        // Fallback: render as rectangle with the vector's bounding box
        nodeId = Number(engine.add_rect(x, y, w, h));
        applyCommonProps(engine, nodeId, figmaNode);
        break;
      }

      case "BOOLEAN_OPERATION": {
        // Flatten to bounding box rectangle
        nodeId = Number(engine.add_rect(x, y, w, h));
        applyCommonProps(engine, nodeId, figmaNode);
        break;
      }

      case "SECTION": {
        nodeId = Number(engine.add_section(figmaNode.name, x, y, w, h));
        if (figmaNode.children) {
          for (const child of figmaNode.children) {
            const childId = convertNode(engine, child, nodeId, 0, 0, stats, idMap);
            if (childId !== null) {
              engine.reparent_node(BigInt(childId), BigInt(nodeId));
              if (child.absoluteBoundingBox && bb) {
                engine.set_node_position(
                  BigInt(childId),
                  child.absoluteBoundingBox.x - bb.x,
                  child.absoluteBoundingBox.y - bb.y,
                );
              }
            }
          }
        }
        break;
      }

      case "SLICE": {
        nodeId = Number(engine.add_slice(figmaNode.name, x, y, w, h));
        break;
      }

      default:
        stats.skipped++;
        stats.errors.push(`Unsupported type: ${figmaNode.type} (${figmaNode.name})`);
        return null;
    }

    if (nodeId !== null) {
      stats.converted++;
      // Track Figma ID → OpenSketch ID for interaction linking
      idMap.set(figmaNode.id, nodeId);
      // Import prototype interactions
      applyInteractions(engine, nodeId, figmaNode, idMap);
    }
  } catch (err) {
    stats.errors.push(`Error converting "${figmaNode.name}": ${err}`);
    stats.skipped++;
    return null;
  }

  return nodeId;
}

// ── API fetch ────────────────────────────────────────────────────

async function fetchFigmaFile(fileKey: string, token: string): Promise<FigmaFileResponse> {
  const url = `https://api.figma.com/v1/files/${fileKey}?geometry=paths`;
  const resp = await fetch(url, {
    headers: { "X-FIGMA-TOKEN": token },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Figma API error ${resp.status}: ${text}`);
  }
  return resp.json();
}

function extractFileKey(input: string): string {
  // Accept full URL or just file key
  // https://www.figma.com/file/FILEKEY/... or https://www.figma.com/design/FILEKEY/...
  const urlMatch = input.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/);
  if (urlMatch) return urlMatch[1];
  // Bare key
  return input.trim();
}

// ── Import execution ─────────────────────────────────────────────

export async function importFigmaFile(
  engine: Engine,
  fileKeyOrUrl: string,
  token: string,
  onProgress?: (msg: string) => void,
): Promise<ImportStats> {
  const fileKey = extractFileKey(fileKeyOrUrl);
  const stats: ImportStats = { total: 0, converted: 0, skipped: 0, errors: [] };

  onProgress?.("Fetching Figma file...");
  const file = await fetchFigmaFile(fileKey, token);
  onProgress?.(`Loaded "${file.name}" — converting nodes...`);

  // Push undo before import
  engine.push_undo();

  const idMap = new Map<string, number>();
  convertNode(engine, file.document, null, 0, 0, stats, idMap);

  onProgress?.(`Done: ${stats.converted} nodes imported, ${stats.skipped} skipped`);
  return stats;
}

// ── UI Modal ─────────────────────────────────────────────────────

let modalEl: HTMLElement | null = null;

export function openFigmaImportModal(engine: Engine, onDone?: () => void) {
  if (modalEl) return;

  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;
    display:flex;align-items:center;justify-content:center;
  `;

  const modal = document.createElement("div");
  modal.style.cssText = `
    background:#2c2c2c;border-radius:12px;padding:24px;width:480px;max-width:90vw;
    color:#eee;font-family:-apple-system,BlinkMacSystemFont,sans-serif;
    box-shadow:0 20px 60px rgba(0,0,0,0.5);
  `;

  modal.innerHTML = `
    <h2 style="margin:0 0 16px;font-size:18px;font-weight:600;">Import from Figma</h2>
    <label style="display:block;margin-bottom:12px;">
      <span style="font-size:13px;color:#aaa;display:block;margin-bottom:4px;">Figma File URL or Key</span>
      <input id="figma-url" type="text" placeholder="https://www.figma.com/design/ABC123/..."
        style="width:100%;box-sizing:border-box;padding:8px 12px;border-radius:8px;border:1px solid #444;background:#1e1e1e;color:#eee;font-size:14px;outline:none;" />
    </label>
    <label style="display:block;margin-bottom:16px;">
      <span style="font-size:13px;color:#aaa;display:block;margin-bottom:4px;">Personal Access Token</span>
      <input id="figma-token" type="password" placeholder="figd_..."
        style="width:100%;box-sizing:border-box;padding:8px 12px;border-radius:8px;border:1px solid #444;background:#1e1e1e;color:#eee;font-size:14px;outline:none;" />
    </label>
    <div id="figma-status" style="font-size:13px;color:#888;margin-bottom:16px;min-height:20px;"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;">
      <button id="figma-cancel" style="padding:8px 16px;border-radius:8px;border:1px solid #555;background:transparent;color:#ccc;cursor:pointer;font-size:14px;">Cancel</button>
      <button id="figma-import" style="padding:8px 16px;border-radius:8px;border:none;background:#4a90d9;color:#fff;cursor:pointer;font-size:14px;font-weight:500;">Import</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  modalEl = overlay;

  const urlInput = modal.querySelector("#figma-url") as HTMLInputElement;
  const tokenInput = modal.querySelector("#figma-token") as HTMLInputElement;
  const statusDiv = modal.querySelector("#figma-status") as HTMLElement;
  const cancelBtn = modal.querySelector("#figma-cancel") as HTMLButtonElement;
  const importBtn = modal.querySelector("#figma-import") as HTMLButtonElement;

  // Restore saved token
  const savedToken = localStorage.getItem("opensketch_figma_token");
  if (savedToken) tokenInput.value = savedToken;

  function close() {
    overlay.remove();
    modalEl = null;
  }

  cancelBtn.onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  importBtn.onclick = async () => {
    const url = urlInput.value.trim();
    const token = tokenInput.value.trim();
    if (!url) { statusDiv.textContent = "Please enter a Figma file URL"; return; }
    if (!token) { statusDiv.textContent = "Please enter your Personal Access Token"; return; }

    // Save token for convenience
    localStorage.setItem("opensketch_figma_token", token);

    importBtn.disabled = true;
    importBtn.textContent = "Importing...";

    try {
      const stats = await importFigmaFile(engine, url, token, (msg) => {
        statusDiv.textContent = msg;
      });

      let summary = `✅ ${stats.converted} nodes imported`;
      if (stats.skipped > 0) summary += `, ${stats.skipped} skipped`;
      if (stats.errors.length > 0) {
        summary += `\n⚠️ ${stats.errors.length} warnings`;
      }
      statusDiv.textContent = summary;
      statusDiv.style.color = "#4ade80";

      setTimeout(() => {
        close();
        onDone?.();
      }, 1500);
    } catch (err) {
      statusDiv.textContent = `❌ ${err}`;
      statusDiv.style.color = "#f87171";
      importBtn.disabled = false;
      importBtn.textContent = "Import";
    }
  };

  // Focus URL input
  setTimeout(() => urlInput.focus(), 50);

  // Escape to close
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") { close(); document.removeEventListener("keydown", onKey); }
  };
  document.addEventListener("keydown", onKey);
}

export function isFigmaImportOpen(): boolean {
  return modalEl !== null;
}
