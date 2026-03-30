import type { Editor } from "../editor";

/**
 * Text Flow — linked text overflow between text nodes.
 * Renders flow connection lines and handles overflow distribution.
 */

interface FlowLink {
  fromId: number;
  toId: number;
  fromX: number; fromY: number; fromW: number; fromH: number;
  toX: number; toY: number; toW: number; toH: number;
}

export function getTextFlowLinks(editor: Editor): FlowLink[] {
  const links: FlowLink[] = [];
  const ids = editor.engine.get_all_node_ids();
  for (const id of ids) {
    const nextVal = editor.engine.get_text_flow_next(Number(id));
    if (nextVal == null) continue;
    const nextId = Number(nextVal);
    const from = JSON.parse(editor.engine.get_node_info(Number(id)));
    const to = JSON.parse(editor.engine.get_node_info(nextId));
    if (from && to) {
      links.push({
        fromId: Number(id), toId: nextId,
        fromX: from.x, fromY: from.y, fromW: from.width, fromH: from.height,
        toX: to.x, toY: to.y, toW: to.width, toH: to.height,
      });
    }
  }
  return links;
}

export function drawTextFlowLinks(ctx: CanvasRenderingContext2D, editor: Editor, zoom: number, _panX: number, _panY: number) {
  const links = getTextFlowLinks(editor);
  if (links.length === 0) return;
  
  ctx.save();
  ctx.setLineDash([6 / zoom, 4 / zoom]);
  ctx.strokeStyle = "#6366f1";
  ctx.lineWidth = 1.5 / zoom;
  
  for (const link of links) {
    const x1 = link.fromX + link.fromW;
    const y1 = link.fromY + link.fromH / 2;
    const x2 = link.toX;
    const y2 = link.toY + link.toH / 2;
    const cpOffset = Math.min(Math.abs(x2 - x1) * 0.4, 60);
    
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(x1 + cpOffset, y1, x2 - cpOffset, y2, x2, y2);
    ctx.stroke();
    
    // Arrow at end
    const arrowSize = 6 / zoom;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - arrowSize, y2 - arrowSize / 2);
    ctx.lineTo(x2 - arrowSize, y2 + arrowSize / 2);
    ctx.closePath();
    ctx.fillStyle = "#6366f1";
    ctx.fill();
    
    // Flow handle circles
    ctx.beginPath();
    ctx.arc(x1, y1, 4 / zoom, 0, Math.PI * 2);
    ctx.fillStyle = "#6366f1";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x2, y2, 4 / zoom, 0, Math.PI * 2);
    ctx.fill();
  }
  
  ctx.restore();
}

/**
 * Distribute text across a flow chain based on capacity.
 */
export function distributeTextFlow(
  editor: Editor,
  startId: number,
  measureCapacity: (nodeId: number, fullText: string) => { fitted: string; overflow: string }
): void {
  const chainJson = editor.engine.get_text_flow_chain(BigInt(startId));
  const chain: number[] = JSON.parse(chainJson);
  if (chain.length <= 1) return;
  
  // Get full text from first node
  const firstInfo = JSON.parse(editor.engine.get_node_info(chain[0]!));
  if (!firstInfo || firstInfo.kind !== "Text") return;
  let remaining = firstInfo.text_content || "";
  
  for (const nodeId of chain) {
    if (!remaining) {
      editor.engine.set_text_content(BigInt(nodeId), "");
      continue;
    }
    const { fitted, overflow } = measureCapacity(nodeId, remaining);
    editor.engine.set_text_content(BigInt(nodeId), fitted);
    remaining = overflow;
  }
}
