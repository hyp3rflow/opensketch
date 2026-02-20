export async function loadEngine() {
  const wasm = await import("./wasm/opensketch_engine.js");
  // @ts-ignore
  const wasmUrl = new URL("./wasm/opensketch_engine_bg.wasm", import.meta.url);
  await wasm.default(wasmUrl);
  return wasm;
}
