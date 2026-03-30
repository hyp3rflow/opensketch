import type { Editor } from "../editor";

interface DepEdge {
  from_id: number;
  to_id: number;
  edge_type: "ComponentInstance" | "Connector" | "Interaction" | "Comment";
}

interface GraphData {
  edges: DepEdge[];
  cycles: number[][];
}

interface GraphNode {
  id: number;
  name: string;
  kind: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const NODE_COLORS: Record<string, string> = {
  Rect: "#4A90D9",
  Ellipse: "#D94A8C",
  Text: "#888",
  Frame: "#9B59B6",
  Group: "#7F8C8D",
  Instance: "#27AE60",
  Image: "#E67E22",
  Star: "#F1C40F",
  Polygon: "#1ABC9C",
  Section: "#8E44AD",
  Connector: "#E74C3C",
  StickyNote: "#F39C12",
  default: "#95A5A6",
};

const EDGE_STYLES: Record<string, { color: string; dash: number[] }> = {
  ComponentInstance: { color: "#27AE60", dash: [] },
  Connector: { color: "#E67E22", dash: [6, 4] },
  Interaction: { color: "#4A90D9", dash: [3, 3] },
  Comment: { color: "#95A5A6", dash: [2, 2] },
};

export function setupDependencyGraphPanel(container: HTMLElement, editor: Editor) {
  container.innerHTML = "";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.height = "100%";
  container.style.overflow = "hidden";

  // Filter bar
  const filterBar = document.createElement("div");
  filterBar.style.cssText = "display:flex;gap:6px;padding:6px 8px;flex-wrap:wrap;border-bottom:1px solid #333;font-size:11px;";
  const filters: Record<string, boolean> = {
    ComponentInstance: true,
    Connector: true,
    Interaction: true,
    Comment: true,
  };

  for (const type of Object.keys(filters)) {
    const label = document.createElement("label");
    label.style.cssText = "display:flex;align-items:center;gap:3px;cursor:pointer;color:#ccc;";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = true;
    cb.addEventListener("change", () => {
      filters[type] = cb.checked;
      render();
    });
    const dot = document.createElement("span");
    dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${EDGE_STYLES[type].color};display:inline-block;`;
    label.appendChild(cb);
    label.appendChild(dot);
    label.appendChild(document.createTextNode(type.replace("ComponentInstance", "Instance")));
    filterBar.appendChild(label);
  }
  container.appendChild(filterBar);

  // Cycle warning area
  const cycleWarning = document.createElement("div");
  cycleWarning.style.cssText = "padding:4px 8px;font-size:11px;color:#E74C3C;display:none;border-bottom:1px solid #333;";
  container.appendChild(cycleWarning);

  // Canvas
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "flex:1;width:100%;cursor:grab;background:#1a1a2e;";
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d")!;

  let graphNodes: GraphNode[] = [];
  let graphEdges: DepEdge[] = [];
  let cycles: number[][] = [];
  let hoveredNode: GraphNode | null = null;
  let draggedNode: GraphNode | null = null;
  let animId = 0;

  function loadData() {
    try {
      const json = editor.engine.get_dependency_graph();
      const data: GraphData = JSON.parse(json);
      graphEdges = data.edges;
      cycles = data.cycles;

      // Collect unique node IDs
      const nodeIds = new Set<number>();
      for (const e of graphEdges) {
        nodeIds.add(e.from_id);
        nodeIds.add(e.to_id);
      }

      // Build graph nodes
      const existingMap = new Map(graphNodes.map((n) => [n.id, n]));
      const newNodes: GraphNode[] = [];
      const w = canvas.width || 300;
      const h = canvas.height || 300;

      for (const id of nodeIds) {
        const existing = existingMap.get(id);
        if (existing) {
          // Update name/kind but keep position
          const info = getNodeInfo(id);
          existing.name = info.name;
          existing.kind = info.kind;
          newNodes.push(existing);
        } else {
          const info = getNodeInfo(id);
          newNodes.push({
            id,
            name: info.name,
            kind: info.kind,
            x: w / 2 + (Math.random() - 0.5) * w * 0.6,
            y: h / 2 + (Math.random() - 0.5) * h * 0.6,
            vx: 0,
            vy: 0,
          });
        }
      }
      graphNodes = newNodes;

      // Show cycle warning
      if (cycles.length > 0) {
        cycleWarning.style.display = "block";
        cycleWarning.textContent = `⚠ ${cycles.length} circular dependency cycle(s) detected`;
      } else {
        cycleWarning.style.display = "none";
      }
    } catch {
      graphNodes = [];
      graphEdges = [];
      cycles = [];
    }
  }

  function getNodeInfo(id: number): { name: string; kind: string } {
    try {
      const json = editor.engine.get_node_json(BigInt(id));
      if (json && json !== "null") {
        const node = JSON.parse(json);
        return { name: node.name || `#${id}`, kind: node.kind || "unknown" };
      }
    } catch {}
    return { name: `#${id}`, kind: "unknown" };
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * devicePixelRatio;
    canvas.height = rect.height * devicePixelRatio;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }

  function simulate() {
    const k = 0.01; // repulsion
    const springLen = 80;
    const springK = 0.005;
    const damping = 0.9;
    const centerK = 0.001;
    const w = (canvas.width || 300) / devicePixelRatio;
    const h = (canvas.height || 300) / devicePixelRatio;
    const cx = w / 2;
    const cy = h / 2;

    // Repulsion between all nodes
    for (let i = 0; i < graphNodes.length; i++) {
      for (let j = i + 1; j < graphNodes.length; j++) {
        const a = graphNodes[i];
        const b = graphNodes[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (k * 10000) / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
    }

    // Spring attraction along edges
    const filteredEdges = graphEdges.filter((e) => filters[e.edge_type]);
    const nodeMap = new Map(graphNodes.map((n) => [n.id, n]));
    for (const e of filteredEdges) {
      const a = nodeMap.get(e.from_id);
      const b = nodeMap.get(e.to_id);
      if (!a || !b) continue;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (dist - springLen) * springK;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    // Center gravity
    for (const n of graphNodes) {
      n.vx += (cx - n.x) * centerK;
      n.vy += (cy - n.y) * centerK;
    }

    // Apply velocity
    for (const n of graphNodes) {
      if (n === draggedNode) continue;
      n.vx *= damping;
      n.vy *= damping;
      n.x += n.vx;
      n.y += n.vy;
      // Clamp
      n.x = Math.max(20, Math.min(w - 20, n.x));
      n.y = Math.max(20, Math.min(h - 20, n.y));
    }
  }

  function draw() {
    const w = (canvas.width || 300) / devicePixelRatio;
    const h = (canvas.height || 300) / devicePixelRatio;
    ctx.clearRect(0, 0, w, h);

    const nodeMap = new Map(graphNodes.map((n) => [n.id, n]));
    const filteredEdges = graphEdges.filter((e) => filters[e.edge_type]);

    // Cycle node set for highlighting
    const cycleNodeSet = new Set<number>();
    for (const cycle of cycles) {
      for (const id of cycle) cycleNodeSet.add(id);
    }

    // Hovered connections
    const hoveredConnected = new Set<number>();
    if (hoveredNode) {
      hoveredConnected.add(hoveredNode.id);
      for (const e of filteredEdges) {
        if (e.from_id === hoveredNode.id) hoveredConnected.add(e.to_id);
        if (e.to_id === hoveredNode.id) hoveredConnected.add(e.from_id);
      }
    }

    // Draw edges
    for (const e of filteredEdges) {
      const a = nodeMap.get(e.from_id);
      const b = nodeMap.get(e.to_id);
      if (!a || !b) continue;

      const style = EDGE_STYLES[e.edge_type] || EDGE_STYLES.Comment;
      const isHighlighted = hoveredNode && (hoveredConnected.has(e.from_id) && hoveredConnected.has(e.to_id));
      const alpha = hoveredNode ? (isHighlighted ? 1 : 0.15) : 0.6;

      ctx.save();
      ctx.strokeStyle = style.color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = isHighlighted ? 2 : 1;
      ctx.setLineDash(style.dash);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      // Arrowhead
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const arrowLen = 8;
      const ax2 = b.x - Math.cos(angle) * 12;
      const ay2 = b.y - Math.sin(angle) * 12;
      ctx.setLineDash([]);
      ctx.fillStyle = style.color;
      ctx.beginPath();
      ctx.moveTo(ax2 + Math.cos(angle) * arrowLen, ay2 + Math.sin(angle) * arrowLen);
      ctx.lineTo(ax2 + Math.cos(angle + 2.5) * arrowLen * 0.5, ay2 + Math.sin(angle + 2.5) * arrowLen * 0.5);
      ctx.lineTo(ax2 + Math.cos(angle - 2.5) * arrowLen * 0.5, ay2 + Math.sin(angle - 2.5) * arrowLen * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Draw nodes
    for (const n of graphNodes) {
      const isHovered = n === hoveredNode;
      const isConnected = hoveredNode ? hoveredConnected.has(n.id) : true;
      const isCycle = cycleNodeSet.has(n.id);
      const color = NODE_COLORS[n.kind] || NODE_COLORS.default;
      const alpha = hoveredNode ? (isConnected ? 1 : 0.2) : 1;
      const radius = isHovered ? 8 : 6;

      ctx.save();
      ctx.globalAlpha = alpha;

      // Cycle ring
      if (isCycle) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, radius + 4, 0, Math.PI * 2);
        ctx.strokeStyle = "#E74C3C";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      if (isHovered) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Label
      ctx.fillStyle = "#ccc";
      ctx.font = "10px system-ui, sans-serif";
      ctx.textAlign = "center";
      const label = n.name.length > 16 ? n.name.slice(0, 14) + "…" : n.name;
      ctx.fillText(label, n.x, n.y + radius + 12);
      ctx.restore();
    }

    // Empty state
    if (graphNodes.length === 0) {
      ctx.fillStyle = "#666";
      ctx.font = "13px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("No dependencies found", w / 2, h / 2);
    }
  }

  function render() {
    simulate();
    draw();
    animId = requestAnimationFrame(render);
  }

  function findNodeAt(mx: number, my: number): GraphNode | null {
    for (let i = graphNodes.length - 1; i >= 0; i--) {
      const n = graphNodes[i];
      const dx = n.x - mx;
      const dy = n.y - my;
      if (dx * dx + dy * dy < 100) return n;
    }
    return null;
  }

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (draggedNode) {
      draggedNode.x = mx;
      draggedNode.y = my;
      draggedNode.vx = 0;
      draggedNode.vy = 0;
      return;
    }

    const node = findNodeAt(mx, my);
    hoveredNode = node;
    canvas.style.cursor = node ? "pointer" : "grab";
  });

  canvas.addEventListener("mousedown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const node = findNodeAt(mx, my);
    if (node) {
      draggedNode = node;
      canvas.style.cursor = "grabbing";
    }
  });

  canvas.addEventListener("mouseup", () => {
    if (draggedNode) {
      draggedNode = null;
      canvas.style.cursor = hoveredNode ? "pointer" : "grab";
    }
  });

  canvas.addEventListener("dblclick", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const node = findNodeAt(mx, my);
    if (node) {
      // Select node in canvas
      try {
        editor.engine.select(BigInt(node.id));
        editor.requestRender();
      } catch {}
    }
  });

  // Public refresh
  let active = false;

  return {
    refresh() {
      resizeCanvas();
      loadData();
      if (!active) {
        active = true;
        render();
      }
    },
    stop() {
      active = false;
      if (animId) cancelAnimationFrame(animId);
      animId = 0;
    },
    getDependencyCount(nodeId: number): number {
      try {
        const json = editor.engine.get_node_dependencies(BigInt(nodeId));
        const edges: DepEdge[] = JSON.parse(json);
        return edges.length;
      } catch {
        return 0;
      }
    },
  };
}
