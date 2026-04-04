type GPUDeviceLike = any;

type InstanceData = {
  x: number;
  y: number;
  width: number;
  height: number;
  color: [number, number, number, number];
  uv: [number, number, number, number];
  textureMix: number;
  shapeKind: number; // 0 rect, 1 ellipse
  cornerRadius: number;
};

type SceneNode = {
  id?: number;
  kind?: any;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  corner_radius?: number;
  visible?: boolean;
  opacity?: number;
  fills?: any[];
  shadows?: any[];
  children?: number[];
};

type AtlasEntry = {
  src: string;
  slot: number;
  width: number;
  height: number;
  image: HTMLImageElement;
  loaded: boolean;
};

const ATLAS_SIZE = 2048;
const ATLAS_TILE = 256;
const ATLAS_COLS = Math.floor(ATLAS_SIZE / ATLAS_TILE);
const ATLAS_CAPACITY = ATLAS_COLS * ATLAS_COLS;

function parseColor(input: unknown): [number, number, number, number] {
  if (!input) return [0.24, 0.24, 0.28, 1];

  if (typeof input === "string") {
    const css = input.trim();
    const m = css.match(/rgba?\(([^)]+)\)/i);
    if (m) {
      const parts = m[1].split(",").map((p) => p.trim());
      const r = Math.max(0, Math.min(255, Number(parts[0]) || 0)) / 255;
      const g = Math.max(0, Math.min(255, Number(parts[1]) || 0)) / 255;
      const b = Math.max(0, Math.min(255, Number(parts[2]) || 0)) / 255;
      const a = Math.max(0, Math.min(1, parts[3] != null ? Number(parts[3]) : 1));
      return [r, g, b, a];
    }

    const hex = css.replace("#", "");
    if (/^[0-9a-f]{6}$/i.test(hex)) {
      const n = Number.parseInt(hex, 16);
      return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
    }
    if (/^[0-9a-f]{8}$/i.test(hex)) {
      const n = Number.parseInt(hex, 16);
      return [((n >> 24) & 255) / 255, ((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    }
    return [0.24, 0.24, 0.28, 1];
  }

  if (typeof input === "object") {
    const c = input as any;
    if (Array.isArray(c) && c.length >= 3) {
      const r = Number(c[0] ?? 0);
      const g = Number(c[1] ?? 0);
      const b = Number(c[2] ?? 0);
      const a = Number(c[3] ?? 1);
      return [Math.max(0, Math.min(1, r)), Math.max(0, Math.min(1, g)), Math.max(0, Math.min(1, b)), Math.max(0, Math.min(1, a))];
    }
    if (typeof c.r === "number" && typeof c.g === "number" && typeof c.b === "number") {
      return [
        Math.max(0, Math.min(1, c.r)),
        Math.max(0, Math.min(1, c.g)),
        Math.max(0, Math.min(1, c.b)),
        Math.max(0, Math.min(1, typeof c.a === "number" ? c.a : 1)),
      ];
    }
  }

  return [0.24, 0.24, 0.28, 1];
}

function extractSolidColor(fill: any): [number, number, number, number] | null {
  if (!fill || fill.visible === false) return null;
  const t = fill.type;

  if (fill.color != null) return parseColor(fill.color);
  if (t?.Solid?.color != null) return parseColor(t.Solid.color);
  if (t?.solid?.color != null) return parseColor(t.solid.color);
  if (t?.color != null) return parseColor(t.color);

  return null;
}

function extractVisibleShadows(node: SceneNode): any[] {
  if (!Array.isArray(node.shadows)) return [];
  return node.shadows.filter((s) => s && s.visible !== false && s.inset !== true);
}

function applyOpacity(color: [number, number, number, number], opacity: number): [number, number, number, number] {
  return [color[0], color[1], color[2], Math.max(0, Math.min(1, color[3] * opacity))];
}

function nodeKindName(kind: any): string {
  if (!kind) return "";
  if (typeof kind === "string") return kind;
  if (typeof kind === "object") {
    const keys = Object.keys(kind);
    if (keys.length === 1) return keys[0] || "";
  }
  return "";
}

function extractImageSource(kind: any): string | null {
  if (!kind || typeof kind !== "object") return null;
  const img = kind.Image || kind.image;
  const video = kind.Video || kind.video;
  if (img && typeof img.src === "string" && img.src.trim()) return img.src;
  if (video) {
    if (typeof video.poster === "string" && video.poster.trim()) return video.poster;
    if (typeof video.src === "string" && video.src.trim()) return video.src;
  }
  return null;
}

export class WebGPURenderer {
  readonly canvas: HTMLCanvasElement;
  private _ctx: any = null;
  private _device: GPUDeviceLike = null;
  private _format = "bgra8unorm";
  private _pipeline: any = null;
  private _uniformBuffer: any = null;
  private _instanceBuffer: any = null;
  private _bindGroup: any = null;
  private _sampler: any = null;
  private _atlasTexture: any = null;
  private _atlasView: any = null;
  private _atlasCanvas: HTMLCanvasElement;
  private _atlasCtx: CanvasRenderingContext2D;
  private _atlasEntries = new Map<string, AtlasEntry>();
  private _atlasDirty = true;
  private _instanceCapacity = 0;
  private _ready = false;
  private _cachedSceneJson = "";
  private _cachedViewKey = "";
  private _cachedInstances: InstanceData[] = [];
  private _instanceRaw = new Float32Array(0);
  private _lastUploadedKey = "";
  private _uniformRaw = new Float32Array(8);
  private _lastUniformKey = "";

  constructor() {
    this.canvas = document.createElement("canvas");
    this._atlasCanvas = document.createElement("canvas");
    this._atlasCanvas.width = ATLAS_SIZE;
    this._atlasCanvas.height = ATLAS_SIZE;
    const ctx = this._atlasCanvas.getContext("2d");
    if (!ctx) throw new Error("Failed to create atlas canvas context");
    this._atlasCtx = ctx;
    this._atlasCtx.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
  }

  get ready() { return this._ready; }

  async init(): Promise<boolean> {
    const gpu = (navigator as any).gpu;
    if (!gpu) return false;
    const adapter = await gpu.requestAdapter();
    if (!adapter) return false;
    this._device = await adapter.requestDevice();
    this._ctx = this.canvas.getContext("webgpu");
    if (!this._ctx) return false;
    this._format = gpu.getPreferredCanvasFormat?.() ?? "bgra8unorm";
    this._ctx.configure({
      device: this._device,
      format: this._format,
      alphaMode: "premultiplied",
    });

    const GPUUsage = (globalThis as any).GPUBufferUsage;
    this._uniformBuffer = this._device.createBuffer({ size: 32, usage: GPUUsage.UNIFORM | GPUUsage.COPY_DST });
    this._instanceBuffer = this._device.createBuffer({ size: 4 * 15 * 1024, usage: GPUUsage.VERTEX | GPUUsage.COPY_DST });
    this._instanceCapacity = 1024;

    this._atlasTexture = this._device.createTexture({
      size: [ATLAS_SIZE, ATLAS_SIZE, 1],
      format: "rgba8unorm",
      usage: (globalThis as any).GPUTextureUsage.TEXTURE_BINDING
        | (globalThis as any).GPUTextureUsage.COPY_DST
        | (globalThis as any).GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this._atlasView = this._atlasTexture.createView();
    this._sampler = this._device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });

    const shader = this._device.createShaderModule({
      code: `
struct Uniforms {
  viewport: vec2f,
  pan: vec2f,
  zoom: f32,
  _pad: f32,
}

struct VSIn {
  @location(0) pos: vec2f,
  @location(1) size: vec2f,
  @location(2) color: vec4f,
  @location(3) uv: vec4f,
  @location(4) textureMix: f32,
  @location(5) shapeKind: f32,
  @location(6) cornerRadius: f32,
}

struct VSOut {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
  @location(1) uv: vec2f,
  @location(2) textureMix: f32,
  @location(3) local: vec2f,
  @location(4) size: vec2f,
  @location(5) shapeKind: f32,
  @location(6) cornerRadius: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var atlasSampler: sampler;
@group(0) @binding(2) var atlasTexture: texture_2d<f32>;

@vertex
fn vs_main(input: VSIn, @builtin(vertex_index) vertexIndex: u32) -> VSOut {
  var corners = array<vec2f, 6>(
    vec2f(0.0, 0.0),
    vec2f(1.0, 0.0),
    vec2f(0.0, 1.0),
    vec2f(0.0, 1.0),
    vec2f(1.0, 0.0),
    vec2f(1.0, 1.0)
  );

  let corner = corners[vertexIndex];
  let world = input.pos + corner * input.size;
  let screen = world * uniforms.zoom + uniforms.pan;
  let ndc = vec2f(
    (screen.x / uniforms.viewport.x) * 2.0 - 1.0,
    1.0 - (screen.y / uniforms.viewport.y) * 2.0
  );

  var out: VSOut;
  out.position = vec4f(ndc, 0.0, 1.0);
  out.color = input.color;
  out.uv = vec2f(
    mix(input.uv.x, input.uv.z, corner.x),
    mix(input.uv.y, input.uv.w, corner.y)
  );
  out.textureMix = input.textureMix;
  out.local = corner * input.size;
  out.size = input.size;
  out.shapeKind = input.shapeKind;
  out.cornerRadius = input.cornerRadius;
  return out;
}

@fragment
fn fs_main(input: VSOut) -> @location(0) vec4f {
  if (input.shapeKind > 0.5) {
    let center = input.size * 0.5;
    let radius = max(vec2f(1e-5), center);
    let p = (input.local - center) / radius;
    if (dot(p, p) > 1.0) {
      discard;
    }
  } else {
    let minSide = min(input.size.x, input.size.y);
    let radius = clamp(input.cornerRadius, 0.0, minSide * 0.5);
    if (radius > 0.0) {
      let innerMin = vec2f(radius);
      let innerMax = input.size - vec2f(radius);
      let q = max(max(innerMin - input.local, vec2f(0.0)), input.local - innerMax);
      if (dot(q, q) > radius * radius) {
        discard;
      }
    }
  }

  let texColor = textureSample(atlasTexture, atlasSampler, input.uv);
  return mix(input.color, texColor * input.color.a, clamp(input.textureMix, 0.0, 1.0));
}`,
    });

    this._pipeline = this._device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: shader,
        entryPoint: "vs_main",
        buffers: [{
          arrayStride: 60,
          stepMode: "instance",
          attributes: [
            { shaderLocation: 0, offset: 0, format: "float32x2" },
            { shaderLocation: 1, offset: 8, format: "float32x2" },
            { shaderLocation: 2, offset: 16, format: "float32x4" },
            { shaderLocation: 3, offset: 32, format: "float32x4" },
            { shaderLocation: 4, offset: 48, format: "float32" },
            { shaderLocation: 5, offset: 52, format: "float32" },
            { shaderLocation: 6, offset: 56, format: "float32" },
          ],
        }],
      },
      fragment: {
        module: shader,
        entryPoint: "fs_main",
        targets: [{ format: this._format }],
      },
      primitive: { topology: "triangle-list" },
    });

    this._bindGroup = this._device.createBindGroup({
      layout: this._pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this._uniformBuffer } },
        { binding: 1, resource: this._sampler },
        { binding: 2, resource: this._atlasView },
      ],
    });

    this._ready = true;
    return true;
  }

  resize(width: number, height: number) {
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    if (this._ctx && this._device) {
      this._ctx.configure({
        device: this._device,
        format: this._format,
        alphaMode: "premultiplied",
      });
    }
  }

  private ensureAtlasEntry(src: string) {
    if (!src || this._atlasEntries.has(src)) return;
    if (this._atlasEntries.size >= ATLAS_CAPACITY) return;
    const slot = this._atlasEntries.size;
    const image = new Image();
    image.decoding = "async";
    image.crossOrigin = "anonymous";
    const entry: AtlasEntry = {
      src,
      slot,
      width: 0,
      height: 0,
      image,
      loaded: false,
    };
    this._atlasEntries.set(src, entry);

    image.onload = () => {
      entry.width = image.naturalWidth || image.width || ATLAS_TILE;
      entry.height = image.naturalHeight || image.height || ATLAS_TILE;
      entry.loaded = true;
      const col = slot % ATLAS_COLS;
      const row = Math.floor(slot / ATLAS_COLS);
      const x = col * ATLAS_TILE;
      const y = row * ATLAS_TILE;

      const scale = Math.max(ATLAS_TILE / Math.max(1, entry.width), ATLAS_TILE / Math.max(1, entry.height));
      const dw = entry.width * scale;
      const dh = entry.height * scale;
      const ox = x + (ATLAS_TILE - dw) * 0.5;
      const oy = y + (ATLAS_TILE - dh) * 0.5;

      this._atlasCtx.save();
      this._atlasCtx.clearRect(x, y, ATLAS_TILE, ATLAS_TILE);
      this._atlasCtx.imageSmoothingEnabled = true;
      this._atlasCtx.drawImage(image, ox, oy, dw, dh);
      this._atlasCtx.restore();
      this._atlasDirty = true;
    };

    image.onerror = () => {
      entry.loaded = false;
    };

    image.src = src;
  }

  private atlasUV(src: string | null): [number, number, number, number] {
    if (!src) return [0, 0, 1, 1];
    const entry = this._atlasEntries.get(src);
    if (!entry || !entry.loaded) return [0, 0, 1, 1];
    const col = entry.slot % ATLAS_COLS;
    const row = Math.floor(entry.slot / ATLAS_COLS);
    const pad = 1 / ATLAS_SIZE;
    const x0 = (col * ATLAS_TILE) / ATLAS_SIZE + pad;
    const y0 = (row * ATLAS_TILE) / ATLAS_SIZE + pad;
    const x1 = ((col + 1) * ATLAS_TILE) / ATLAS_SIZE - pad;
    const y1 = ((row + 1) * ATLAS_TILE) / ATLAS_SIZE - pad;
    return [x0, y0, x1, y1];
  }

  private uploadAtlasIfNeeded() {
    if (!this._atlasDirty || !this._device || !this._atlasTexture) return;
    this._device.queue.copyExternalImageToTexture(
      { source: this._atlasCanvas },
      { texture: this._atlasTexture },
      { width: ATLAS_SIZE, height: ATLAS_SIZE },
    );
    this._atlasDirty = false;
  }

  private collectInstances(scene: any, viewportW: number, viewportH: number, zoom: number, panX: number, panY: number): InstanceData[] {
    const nodes = Array.isArray(scene?.nodes) ? scene.nodes as SceneNode[] : [];
    if (!nodes.length) return [];

    const byId = new Map<number, SceneNode>();
    const childIds = new Set<number>();
    for (const node of nodes) {
      if (typeof node?.id === "number") byId.set(node.id, node);
      if (Array.isArray(node?.children)) {
        for (const cid of node.children) {
          if (typeof cid === "number") childIds.add(cid);
        }
      }
    }

    const roots = nodes.filter((n) => typeof n?.id === "number" && !childIds.has(n.id!));
    const instances: InstanceData[] = [];

    const isVisibleInViewport = (x: number, y: number, w: number, h: number) => {
      const sx = x * zoom + panX;
      const sy = y * zoom + panY;
      const sw = w * zoom;
      const sh = h * zoom;
      return sx + sw >= 0 && sy + sh >= 0 && sx <= viewportW && sy <= viewportH;
    };

    const walk = (node: SceneNode, parentX: number, parentY: number, parentOpacity: number) => {
      if (!node || node.visible === false) return;

      const localX = Number(node.x ?? 0);
      const localY = Number(node.y ?? 0);
      const width = Number(node.width ?? 0);
      const height = Number(node.height ?? 0);
      const worldX = parentX + localX;
      const worldY = parentY + localY;
      const opacity = parentOpacity * Math.max(0, Math.min(1, Number(node.opacity ?? 1)));

      if (width > 0 && height > 0 && isVisibleInViewport(worldX, worldY, width, height)) {
        const fills = Array.isArray(node.fills) ? node.fills : [];
        const color = fills.map(extractSolidColor).find(Boolean) as [number, number, number, number] | undefined;
        const kindName = nodeKindName(node.kind);
        const imageLike = kindName === "Image" || kindName === "Video";
        const source = imageLike ? extractImageSource(node.kind) : null;
        const shapeKind = kindName === "Ellipse" ? 1 : 0;
        const cornerRadius = Math.max(0, Number(node.corner_radius ?? 0));

        const shadows = extractVisibleShadows(node);
        for (const shadow of shadows) {
          const sx = Number(shadow.offset_x ?? 0);
          const sy = Number(shadow.offset_y ?? 0);
          const blur = Math.max(0, Number(shadow.blur ?? 0));
          const spread = Number(shadow.spread ?? 0);
          const pad = Math.max(0, blur * 0.5 + spread);
          const shadowColor = applyOpacity(parseColor(shadow.color), opacity);
          shadowColor[3] *= 0.85;
          const shadowW = Math.max(1, width + pad * 2);
          const shadowH = Math.max(1, height + pad * 2);
          instances.push({
            x: worldX + sx - pad,
            y: worldY + sy - pad,
            width: shadowW,
            height: shadowH,
            color: shadowColor,
            uv: [0, 0, 1, 1],
            textureMix: 0,
            shapeKind,
            cornerRadius: cornerRadius + pad,
          });
        }

        if (source) this.ensureAtlasEntry(source);
        instances.push({
          x: worldX,
          y: worldY,
          width,
          height,
          color: applyOpacity(color ?? [0.24, 0.24, 0.28, imageLike ? 1 : 0.35], opacity),
          uv: this.atlasUV(source),
          textureMix: source ? 1 : 0,
          shapeKind,
          cornerRadius,
        });
      }

      if (Array.isArray(node.children)) {
        for (const cid of node.children) {
          const child = byId.get(Number(cid));
          if (child) walk(child, worldX, worldY, opacity);
        }
      }
    };

    for (const root of roots) walk(root, 0, 0, 1);
    return instances;
  }

  renderFromScene(sceneJson: string, viewportW: number, viewportH: number, zoom: number, panX: number, panY: number) {
    if (!this._ready || !this._device || !this._ctx || !this._pipeline) return;

    const viewKey = `${viewportW}:${viewportH}:${zoom.toFixed(3)}:${panX.toFixed(1)}:${panY.toFixed(1)}`;
    let instances = this._cachedInstances;
    const sceneOrViewChanged = sceneJson !== this._cachedSceneJson || viewKey !== this._cachedViewKey;
    if (sceneOrViewChanged) {
      let scene: any;
      try {
        scene = JSON.parse(sceneJson);
      } catch {
        return;
      }
      this._cachedSceneJson = sceneJson;
      this._cachedViewKey = viewKey;
      this._cachedInstances = this.collectInstances(scene, viewportW, viewportH, zoom, panX, panY);
      instances = this._cachedInstances;
    }
    const count = instances.length;

    this.uploadAtlasIfNeeded();

    if (count === 0) {
      const encoder = this._device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: this._ctx.getCurrentTexture().createView(),
          clearValue: { r: 0.11, g: 0.11, b: 0.16, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        }],
      });
      pass.end();
      this._device.queue.submit([encoder.finish()]);
      return;
    }

    if (count > this._instanceCapacity) {
      this._instanceCapacity = Math.ceil(count * 1.5);
      this._instanceBuffer.destroy();
      const GPUUsage = (globalThis as any).GPUBufferUsage;
      this._instanceBuffer = this._device.createBuffer({
        size: this._instanceCapacity * 60,
        usage: GPUUsage.VERTEX | GPUUsage.COPY_DST,
      });
      this._lastUploadedKey = "";
    }

    const instanceUploadKey = `${this._cachedSceneJson.length}:${viewKey}:${count}:${this._atlasEntries.size}`;
    if (sceneOrViewChanged || this._lastUploadedKey !== instanceUploadKey) {
      const needed = count * 15;
      if (this._instanceRaw.length < needed) {
        this._instanceRaw = new Float32Array(Math.ceil(needed * 1.25));
      }
      for (let i = 0; i < count; i++) {
        const base = i * 15;
        const it = instances[i];
        this._instanceRaw[base] = it.x;
        this._instanceRaw[base + 1] = it.y;
        this._instanceRaw[base + 2] = it.width;
        this._instanceRaw[base + 3] = it.height;
        this._instanceRaw[base + 4] = it.color[0];
        this._instanceRaw[base + 5] = it.color[1];
        this._instanceRaw[base + 6] = it.color[2];
        this._instanceRaw[base + 7] = it.color[3];
        this._instanceRaw[base + 8] = it.uv[0];
        this._instanceRaw[base + 9] = it.uv[1];
        this._instanceRaw[base + 10] = it.uv[2];
        this._instanceRaw[base + 11] = it.uv[3];
        this._instanceRaw[base + 12] = it.textureMix;
        this._instanceRaw[base + 13] = it.shapeKind;
        this._instanceRaw[base + 14] = it.cornerRadius;
      }

      this._device.queue.writeBuffer(this._instanceBuffer, 0, this._instanceRaw.buffer, 0, count * 15 * 4);
      this._lastUploadedKey = instanceUploadKey;
    }

    const uniformKey = `${viewKey}`;
    if (uniformKey !== this._lastUniformKey) {
      this._uniformRaw[0] = viewportW;
      this._uniformRaw[1] = viewportH;
      this._uniformRaw[2] = zoom;
      this._uniformRaw[3] = 0;
      this._uniformRaw[4] = panX;
      this._uniformRaw[5] = panY;
      this._uniformRaw[6] = 0;
      this._uniformRaw[7] = 0;
      this._device.queue.writeBuffer(this._uniformBuffer, 0, this._uniformRaw.buffer, 0, this._uniformRaw.byteLength);
      this._lastUniformKey = uniformKey;
    }

    const encoder = this._device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this._ctx.getCurrentTexture().createView(),
        clearValue: { r: 0.11, g: 0.11, b: 0.16, a: 1 },
        loadOp: "clear",
        storeOp: "store",
      }],
    });
    pass.setPipeline(this._pipeline);
    if (this._bindGroup) pass.setBindGroup(0, this._bindGroup);
    pass.setVertexBuffer(0, this._instanceBuffer);
    pass.draw(6, count, 0, 0);
    pass.end();
    this._device.queue.submit([encoder.finish()]);
  }
}
