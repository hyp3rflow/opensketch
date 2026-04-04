type GPUDeviceLike = any;

type InstanceData = {
  x: number;
  y: number;
  width: number;
  height: number;
  color: [number, number, number, number];
};

function parseColor(css: string | undefined): [number, number, number, number] {
  if (!css) return [0.24, 0.24, 0.28, 1];
  const m = css.match(/rgba?\(([^)]+)\)/i);
  if (!m) return [0.24, 0.24, 0.28, 1];
  const parts = m[1].split(",").map((p) => p.trim());
  const r = Math.max(0, Math.min(255, Number(parts[0]) || 0)) / 255;
  const g = Math.max(0, Math.min(255, Number(parts[1]) || 0)) / 255;
  const b = Math.max(0, Math.min(255, Number(parts[2]) || 0)) / 255;
  const a = Math.max(0, Math.min(1, parts[3] != null ? Number(parts[3]) : 1));
  return [r, g, b, a];
}

export class WebGPURenderer {
  readonly canvas: HTMLCanvasElement;
  private _ctx: any = null;
  private _device: GPUDeviceLike = null;
  private _format = "bgra8unorm";
  private _pipeline: any = null;
  private _uniformBuffer: any = null;
  private _instanceBuffer: any = null;
  private _instanceCapacity = 0;
  private _ready = false;

  constructor() {
    this.canvas = document.createElement("canvas");
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
    this._instanceBuffer = this._device.createBuffer({ size: 4 * 8 * 1024, usage: GPUUsage.VERTEX | GPUUsage.COPY_DST });
    this._instanceCapacity = 1024;

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
}

struct VSOut {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

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
  return out;
}

@fragment
fn fs_main(input: VSOut) -> @location(0) vec4f {
  return input.color;
}`,
    });

    this._pipeline = this._device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: shader,
        entryPoint: "vs_main",
        buffers: [{
          arrayStride: 32,
          stepMode: "instance",
          attributes: [
            { shaderLocation: 0, offset: 0, format: "float32x2" },
            { shaderLocation: 1, offset: 8, format: "float32x2" },
            { shaderLocation: 2, offset: 16, format: "float32x4" },
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

  renderFromScene(sceneJson: string, viewportW: number, viewportH: number, zoom: number, panX: number, panY: number) {
    if (!this._ready || !this._device || !this._ctx || !this._pipeline) return;

    let scene: any;
    try {
      scene = JSON.parse(sceneJson);
    } catch {
      return;
    }

    const instances: InstanceData[] = [];
    const nodes = Array.isArray(scene?.nodes) ? scene.nodes : [];
    for (const node of nodes) {
      if (!node || node.visible === false) continue;
      const width = Number(node.width ?? 0);
      const height = Number(node.height ?? 0);
      if (width <= 0 || height <= 0) continue;
      const fills = Array.isArray(node.fills) ? node.fills : [];
      const solid = fills.find((f: any) => f?.visible !== false && f?.type?.Solid?.color != null) || fills.find((f: any) => f?.visible !== false);
      let color: [number, number, number, number] = [0.24, 0.24, 0.28, 0.35];
      if (solid?.type?.Solid?.color) color = parseColor(solid.type.Solid.color);
      instances.push({
        x: Number(node.x ?? 0),
        y: Number(node.y ?? 0),
        width,
        height,
        color,
      });
    }

    const count = instances.length;
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
        size: this._instanceCapacity * 32,
        usage: GPUUsage.VERTEX | GPUUsage.COPY_DST,
      });
    }

    const raw = new Float32Array(count * 8);
    for (let i = 0; i < count; i++) {
      const base = i * 8;
      const it = instances[i];
      raw[base] = it.x;
      raw[base + 1] = it.y;
      raw[base + 2] = it.width;
      raw[base + 3] = it.height;
      raw[base + 4] = it.color[0];
      raw[base + 5] = it.color[1];
      raw[base + 6] = it.color[2];
      raw[base + 7] = it.color[3];
    }

    this._device.queue.writeBuffer(this._instanceBuffer, 0, raw.buffer, raw.byteOffset, raw.byteLength);
    this._device.queue.writeBuffer(this._uniformBuffer, 0, new Float32Array([viewportW, viewportH, zoom, 0, panX, panY, 0, 0]));

    const bindGroup = this._device.createBindGroup({
      layout: this._pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this._uniformBuffer } }],
    });

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
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, this._instanceBuffer);
    pass.draw(6, count, 0, 0);
    pass.end();
    this._device.queue.submit([encoder.finish()]);
  }
}
