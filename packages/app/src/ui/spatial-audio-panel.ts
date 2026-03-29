/**
 * Spatial Audio Panel UI
 * Floating panel for controlling distance-based audio in collaboration.
 * Shows volume indicators per user and audio settings.
 */

import type { SpatialAudio } from "../spatial-audio";

let panel: HTMLDivElement | null = null;
let audioInstance: SpatialAudio | null = null;
let updateInterval: number | null = null;

export function initSpatialAudioPanel(audio: SpatialAudio) {
  audioInstance = audio;
}

export function toggleSpatialAudioPanel() {
  if (panel) { closeSpatialAudioPanel(); return; }
  if (!audioInstance) return;
  openSpatialAudioPanel();
}

export function openSpatialAudioPanel() {
  if (panel || !audioInstance) return;

  panel = document.createElement("div");
  panel.id = "spatial-audio-panel";
  panel.innerHTML = buildHTML();
  document.body.appendChild(panel);
  applyStyles();
  bindEvents();

  // Auto-update proximity display
  updateInterval = window.setInterval(() => updateProximityDisplay(), 500);
}

export function closeSpatialAudioPanel() {
  if (updateInterval) { clearInterval(updateInterval); updateInterval = null; }
  if (panel) { panel.remove(); panel = null; }
}

export function isSpatialAudioPanelOpen(): boolean { return !!panel; }

function buildHTML(): string {
  if (!audioInstance) return "";
  const cfg = audioInstance.getConfig();
  const enabled = audioInstance.enabled;
  const muted = audioInstance.muted;

  return `
    <div class="sa-header">
      <span class="sa-title">🔊 Spatial Audio</span>
      <button class="sa-close" id="sa-close">✕</button>
    </div>
    <div class="sa-body">
      <div class="sa-toggle-row">
        <label>Enabled</label>
        <button class="sa-toggle ${enabled ? 'sa-on' : ''}" id="sa-toggle-enable">${enabled ? 'ON' : 'OFF'}</button>
      </div>
      <div class="sa-toggle-row">
        <label>Mute</label>
        <button class="sa-toggle ${muted ? 'sa-on' : ''}" id="sa-toggle-mute">${muted ? 'MUTED' : 'UNMUTED'}</button>
      </div>
      <div class="sa-slider-row">
        <label>Volume</label>
        <input type="range" min="0" max="100" value="${Math.round(cfg.masterVolume * 100)}" id="sa-volume" class="sa-slider"/>
        <span id="sa-volume-val">${Math.round(cfg.masterVolume * 100)}%</span>
      </div>
      <div class="sa-slider-row">
        <label>Range</label>
        <input type="range" min="500" max="5000" step="100" value="${cfg.maxDistance}" id="sa-range" class="sa-slider"/>
        <span id="sa-range-val">${cfg.maxDistance}px</span>
      </div>
      <div class="sa-toggle-row">
        <label>Ambient Hum</label>
        <button class="sa-toggle ${cfg.ambientEnabled ? 'sa-on' : ''}" id="sa-toggle-ambient">${cfg.ambientEnabled ? 'ON' : 'OFF'}</button>
      </div>
      <div class="sa-toggle-row">
        <label>Proximity Chime</label>
        <button class="sa-toggle ${cfg.proximityChime ? 'sa-on' : ''}" id="sa-toggle-chime">${cfg.proximityChime ? 'ON' : 'OFF'}</button>
      </div>
      <div class="sa-section">
        <div class="sa-section-title">Nearby Users</div>
        <div id="sa-users-list" class="sa-users-list"></div>
      </div>
    </div>
  `;
}

function updateProximityDisplay() {
  if (!panel || !audioInstance) return;
  const list = panel.querySelector("#sa-users-list");
  if (!list) return;

  if (!audioInstance.enabled) {
    list.innerHTML = '<div class="sa-empty">Audio disabled</div>';
    return;
  }

  const info = audioInstance.getProximityInfo();
  if (info.length === 0) {
    list.innerHTML = '<div class="sa-empty">No users nearby</div>';
    return;
  }

  info.sort((a, b) => a.distance - b.distance);
  list.innerHTML = info.map(u => {
    const pct = Math.round(u.volume * 100);
    const barW = Math.max(2, pct);
    const dist = Math.round(u.distance);
    return `
      <div class="sa-user-row">
        <span class="sa-user-id">${u.userId.slice(0, 8)}</span>
        <div class="sa-vol-bar-bg"><div class="sa-vol-bar" style="width:${barW}%"></div></div>
        <span class="sa-user-dist">${dist}px</span>
      </div>
    `;
  }).join("");
}

function bindEvents() {
  if (!panel || !audioInstance) return;

  panel.querySelector("#sa-close")?.addEventListener("click", closeSpatialAudioPanel);

  panel.querySelector("#sa-toggle-enable")?.addEventListener("click", () => {
    if (!audioInstance) return;
    if (audioInstance.enabled) audioInstance.disable(); else audioInstance.enable();
    refreshPanel();
  });

  panel.querySelector("#sa-toggle-mute")?.addEventListener("click", () => {
    if (!audioInstance) return;
    audioInstance.toggleMute();
    refreshPanel();
  });

  const volSlider = panel.querySelector("#sa-volume") as HTMLInputElement | null;
  volSlider?.addEventListener("input", () => {
    if (!audioInstance) return;
    const v = parseInt(volSlider.value) / 100;
    audioInstance.setMasterVolume(v);
    const lbl = panel?.querySelector("#sa-volume-val");
    if (lbl) lbl.textContent = `${Math.round(v * 100)}%`;
  });

  const rangeSlider = panel.querySelector("#sa-range") as HTMLInputElement | null;
  rangeSlider?.addEventListener("input", () => {
    if (!audioInstance) return;
    const d = parseInt(rangeSlider.value);
    audioInstance.updateConfig({ maxDistance: d });
    const lbl = panel?.querySelector("#sa-range-val");
    if (lbl) lbl.textContent = `${d}px`;
  });

  panel.querySelector("#sa-toggle-ambient")?.addEventListener("click", () => {
    if (!audioInstance) return;
    const cfg = audioInstance.getConfig();
    audioInstance.updateConfig({ ambientEnabled: !cfg.ambientEnabled });
    refreshPanel();
  });

  panel.querySelector("#sa-toggle-chime")?.addEventListener("click", () => {
    if (!audioInstance) return;
    const cfg = audioInstance.getConfig();
    audioInstance.updateConfig({ proximityChime: !cfg.proximityChime });
    refreshPanel();
  });
}

function refreshPanel() {
  if (!panel || !audioInstance) return;
  panel.innerHTML = buildHTML();
  bindEvents();
  updateProximityDisplay();
}

function applyStyles() {
  if (document.getElementById("spatial-audio-styles")) return;
  const style = document.createElement("style");
  style.id = "spatial-audio-styles";
  style.textContent = `
    #spatial-audio-panel {
      position: fixed;
      top: 60px;
      right: 16px;
      width: 260px;
      background: #2d2d2d;
      border: 1px solid #444;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      z-index: 9500;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 12px;
      color: #e0e0e0;
      overflow: hidden;
    }
    .sa-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 12px;
      border-bottom: 1px solid #444;
    }
    .sa-title { font-weight: 600; font-size: 13px; }
    .sa-close {
      background: none; border: none; color: #999; cursor: pointer; font-size: 14px;
      width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;
      border-radius: 4px;
    }
    .sa-close:hover { background: #444; color: #fff; }
    .sa-body { padding: 8px 12px 12px; }
    .sa-toggle-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 4px 0;
    }
    .sa-toggle-row label { color: #aaa; font-size: 11px; }
    .sa-toggle {
      background: #555; border: none; color: #999; padding: 2px 10px;
      border-radius: 4px; cursor: pointer; font-size: 10px; font-weight: 600;
    }
    .sa-toggle.sa-on { background: #4ecdc4; color: #1a1a2e; }
    .sa-slider-row {
      display: flex; align-items: center; gap: 6px; padding: 4px 0;
    }
    .sa-slider-row label { color: #aaa; font-size: 11px; min-width: 44px; }
    .sa-slider { flex: 1; height: 4px; -webkit-appearance: none; background: #555; border-radius: 2px; outline: none; }
    .sa-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; border-radius: 50%; background: #4ecdc4; cursor: pointer; }
    .sa-slider-row span { font-size: 10px; color: #888; min-width: 36px; text-align: right; }
    .sa-section { margin-top: 8px; }
    .sa-section-title { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
    .sa-users-list { max-height: 120px; overflow-y: auto; }
    .sa-user-row { display: flex; align-items: center; gap: 6px; padding: 3px 0; }
    .sa-user-id { font-size: 10px; color: #aaa; min-width: 50px; font-family: monospace; }
    .sa-vol-bar-bg { flex: 1; height: 4px; background: #444; border-radius: 2px; overflow: hidden; }
    .sa-vol-bar { height: 100%; background: linear-gradient(90deg, #4ecdc4, #45b7d1); border-radius: 2px; transition: width 0.3s ease; }
    .sa-user-dist { font-size: 10px; color: #666; min-width: 36px; text-align: right; }
    .sa-empty { color: #666; font-size: 11px; text-align: center; padding: 8px 0; font-style: italic; }
  `;
  document.head.appendChild(style);
}
