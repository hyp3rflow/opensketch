/**
 * Spatial Audio for Collaboration
 * Distance-based audio in multiplayer canvas — nearby users sound louder.
 * Uses Web Audio API with PannerNodes for 3D spatialization.
 */

export interface SpatialAudioConfig {
  /** Maximum audible distance in canvas units (default 2000) */
  maxDistance: number;
  /** Reference distance where volume is 1.0 (default 200) */
  refDistance: number;
  /** Rolloff factor — higher = faster falloff (default 1.5) */
  rolloff: number;
  /** Master volume 0-1 (default 0.8) */
  masterVolume: number;
  /** Enable ambient hum when users are present (default true) */
  ambientEnabled: boolean;
  /** Enable proximity chime on user approach (default true) */
  proximityChime: boolean;
  /** Distance threshold for proximity chime (default 400) */
  proximityThreshold: number;
}

const DEFAULT_CONFIG: SpatialAudioConfig = {
  maxDistance: 2000,
  refDistance: 200,
  rolloff: 1.5,
  masterVolume: 0.8,
  ambientEnabled: true,
  proximityChime: true,
  proximityThreshold: 400,
};

interface UserAudioState {
  panner: PannerNode;
  gain: GainNode;
  /** MediaStream source if voice chat connected */
  source: MediaStreamAudioSourceNode | null;
  /** Last known canvas position */
  x: number;
  y: number;
  /** Previous distance (for proximity detection) */
  prevDistance: number;
  /** Whether user was within proximity last tick */
  wasNear: boolean;
}

/**
 * SpatialAudio manages distance-based audio for collaboration.
 * Each remote user gets a PannerNode positioned in 2D audio space.
 */
export class SpatialAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private users = new Map<string, UserAudioState>();
  private config: SpatialAudioConfig;
  private _enabled = false;
  private _muted = false;
  private listenerX = 0;
  private listenerY = 0;

  // Ambient oscillator
  private ambientOsc: OscillatorNode | null = null;
  private ambientGain: GainNode | null = null;
  private ambientFilter: BiquadFilterNode | null = null;

  // Proximity chime oscillator pool
  private chimeTimeout: number | null = null;

  constructor(config?: Partial<SpatialAudioConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ── Lifecycle ──────────────────────────────────────────────

  get enabled() { return this._enabled; }
  get muted() { return this._muted; }

  /** Initialize Web Audio context (must be called from user gesture) */
  async enable(): Promise<boolean> {
    if (this._enabled) return true;
    try {
      this.ctx = new AudioContext();
      if (this.ctx.state === "suspended") {
        await this.ctx.resume();
      }
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.config.masterVolume;
      this.masterGain.connect(this.ctx.destination);

      // Set listener position (2D → use X/Z plane, Y=0)
      const listener = this.ctx.listener;
      if (listener.positionX) {
        listener.positionX.value = 0;
        listener.positionY.value = 0;
        listener.positionZ.value = 0;
      } else {
        listener.setPosition(0, 0, 0);
      }

      this._enabled = true;
      if (this.config.ambientEnabled) this.startAmbient();
      return true;
    } catch {
      return false;
    }
  }

  disable() {
    this.stopAmbient();
    for (const [id] of this.users) {
      this.removeUser(id);
    }
    this.users.clear();
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.masterGain = null;
    this._enabled = false;
  }

  toggle(): boolean {
    if (this._enabled) { this.disable(); return false; }
    this.enable();
    return this._enabled;
  }

  mute() { this._muted = true; if (this.masterGain) this.masterGain.gain.value = 0; }
  unmute() { this._muted = false; if (this.masterGain) this.masterGain.gain.value = this.config.masterVolume; }
  toggleMute(): boolean { if (this._muted) this.unmute(); else this.mute(); return this._muted; }

  setMasterVolume(v: number) {
    this.config.masterVolume = Math.max(0, Math.min(1, v));
    if (this.masterGain && !this._muted) this.masterGain.gain.value = this.config.masterVolume;
  }

  // ── User management ────────────────────────────────────────

  /** Add or update a remote user's audio node */
  addUser(userId: string): UserAudioState | null {
    if (!this.ctx || !this.masterGain) return null;
    if (this.users.has(userId)) return this.users.get(userId)!;

    const panner = this.ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = this.config.refDistance;
    panner.maxDistance = this.config.maxDistance;
    panner.rolloffFactor = this.config.rolloff;
    panner.coneInnerAngle = 360;
    panner.coneOuterAngle = 360;
    panner.coneOuterGain = 1;

    const gain = this.ctx.createGain();
    gain.gain.value = 1.0;
    panner.connect(gain);
    gain.connect(this.masterGain);

    const state: UserAudioState = { panner, gain, source: null, x: 0, y: 0, prevDistance: Infinity, wasNear: false };
    this.users.set(userId, state);

    this.updateAmbientVolume();
    return state;
  }

  removeUser(userId: string) {
    const state = this.users.get(userId);
    if (!state) return;
    if (state.source) { state.source.disconnect(); state.source = null; }
    state.panner.disconnect();
    state.gain.disconnect();
    this.users.delete(userId);
    this.updateAmbientVolume();
  }

  /** Connect a user's microphone MediaStream for voice chat */
  connectUserStream(userId: string, stream: MediaStream) {
    if (!this.ctx) return;
    let state = this.users.get(userId);
    if (!state) state = this.addUser(userId);
    if (!state) return;

    if (state.source) { state.source.disconnect(); }
    state.source = this.ctx.createMediaStreamSource(stream);
    state.source.connect(state.panner);
  }

  disconnectUserStream(userId: string) {
    const state = this.users.get(userId);
    if (!state || !state.source) return;
    state.source.disconnect();
    state.source = null;
  }

  // ── Position updates ───────────────────────────────────────

  /** Update local user's (listener) position on canvas */
  updateListenerPosition(x: number, y: number) {
    this.listenerX = x;
    this.listenerY = y;
    if (!this.ctx) return;

    // Map canvas coords to audio space: X=horizontal, Z=depth (canvas Y)
    const scale = 1 / this.config.refDistance;
    const listener = this.ctx.listener;
    if (listener.positionX) {
      listener.positionX.value = x * scale;
      listener.positionZ.value = y * scale;
    } else {
      listener.setPosition(x * scale, 0, y * scale);
    }
  }

  /** Update a remote user's position on canvas */
  updateUserPosition(userId: string, x: number, y: number) {
    let state = this.users.get(userId);
    if (!state) state = this.addUser(userId);
    if (!state) return;

    state.x = x;
    state.y = y;

    const scale = 1 / this.config.refDistance;
    if (state.panner.positionX) {
      state.panner.positionX.value = x * scale;
      state.panner.positionZ.value = y * scale;
    } else {
      state.panner.setPosition(x * scale, 0, y * scale);
    }

    // Proximity detection
    const dist = this.distance(x, y);
    if (this.config.proximityChime && !state.wasNear && dist < this.config.proximityThreshold && state.prevDistance >= this.config.proximityThreshold) {
      this.playProximityChime(dist);
    }
    state.wasNear = dist < this.config.proximityThreshold;
    state.prevDistance = dist;
  }

  // ── Sound effects ──────────────────────────────────────────

  /** Play a spatial click/tap sound at a user's location */
  playUserAction(userId: string, type: "click" | "select" | "drop" | "type" = "click") {
    if (!this.ctx || !this._enabled || this._muted) return;
    const state = this.users.get(userId);
    if (!state) return;

    const dist = this.distance(state.x, state.y);
    if (dist > this.config.maxDistance) return;

    const vol = Math.max(0, 1 - dist / this.config.maxDistance) * 0.3;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const envGain = this.ctx.createGain();
    osc.connect(envGain);
    envGain.connect(state.panner);

    switch (type) {
      case "click":
        osc.frequency.value = 800;
        osc.type = "sine";
        envGain.gain.setValueAtTime(vol, t);
        envGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        osc.start(t); osc.stop(t + 0.08);
        break;
      case "select":
        osc.frequency.value = 600;
        osc.type = "triangle";
        envGain.gain.setValueAtTime(vol * 0.5, t);
        envGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        osc.start(t); osc.stop(t + 0.15);
        break;
      case "drop":
        osc.frequency.setValueAtTime(400, t);
        osc.frequency.exponentialRampToValueAtTime(200, t + 0.2);
        osc.type = "sine";
        envGain.gain.setValueAtTime(vol * 0.7, t);
        envGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        osc.start(t); osc.stop(t + 0.25);
        break;
      case "type":
        osc.frequency.value = 1200 + Math.random() * 200;
        osc.type = "square";
        envGain.gain.setValueAtTime(vol * 0.1, t);
        envGain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
        osc.start(t); osc.stop(t + 0.03);
        break;
    }
  }

  /** Play a chat message notification sound spatialized to the sender */
  playChatSound(userId: string) {
    if (!this.ctx || !this._enabled || this._muted) return;
    const state = this.users.get(userId);
    if (!state) return;

    const dist = this.distance(state.x, state.y);
    if (dist > this.config.maxDistance) return;

    const vol = Math.max(0, 1 - dist / this.config.maxDistance) * 0.25;
    const t = this.ctx.currentTime;

    // Two-tone notification
    const osc = this.ctx.createOscillator();
    const envGain = this.ctx.createGain();
    osc.connect(envGain);
    envGain.connect(state.panner);
    osc.type = "sine";
    osc.frequency.setValueAtTime(523, t);       // C5
    osc.frequency.setValueAtTime(659, t + 0.1); // E5
    envGain.gain.setValueAtTime(vol, t);
    envGain.gain.setValueAtTime(vol, t + 0.1);
    envGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  // ── Ambient sound ──────────────────────────────────────────

  private startAmbient() {
    if (!this.ctx || !this.masterGain || this.ambientOsc) return;

    // Soft low-frequency ambient drone — presence indicator
    this.ambientOsc = this.ctx.createOscillator();
    this.ambientOsc.type = "sine";
    this.ambientOsc.frequency.value = 60; // Low hum

    this.ambientFilter = this.ctx.createBiquadFilter();
    this.ambientFilter.type = "lowpass";
    this.ambientFilter.frequency.value = 120;

    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.value = 0; // starts silent

    this.ambientOsc.connect(this.ambientFilter);
    this.ambientFilter.connect(this.ambientGain);
    this.ambientGain.connect(this.masterGain);
    this.ambientOsc.start();
  }

  private stopAmbient() {
    if (this.ambientOsc) { this.ambientOsc.stop(); this.ambientOsc.disconnect(); this.ambientOsc = null; }
    if (this.ambientFilter) { this.ambientFilter.disconnect(); this.ambientFilter = null; }
    if (this.ambientGain) { this.ambientGain.disconnect(); this.ambientGain = null; }
  }

  /** Adjust ambient volume based on number of nearby users */
  private updateAmbientVolume() {
    if (!this.ambientGain || !this.ctx) return;
    const nearCount = Array.from(this.users.values()).filter(u => this.distance(u.x, u.y) < this.config.maxDistance).length;
    const targetVol = Math.min(nearCount * 0.01, 0.04); // very subtle
    this.ambientGain.gain.linearRampToValueAtTime(targetVol, this.ctx.currentTime + 0.5);
  }

  // ── Proximity chime ────────────────────────────────────────

  private playProximityChime(dist: number) {
    if (!this.ctx || !this.masterGain) return;
    // Debounce
    if (this.chimeTimeout) return;
    this.chimeTimeout = window.setTimeout(() => { this.chimeTimeout = null; }, 2000);

    const vol = Math.max(0.05, 0.2 * (1 - dist / this.config.proximityThreshold));
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const envGain = this.ctx.createGain();
    osc.connect(envGain);
    envGain.connect(this.masterGain);
    osc.type = "sine";
    // Ascending two-note chime
    osc.frequency.setValueAtTime(440, t);        // A4
    osc.frequency.setValueAtTime(554.37, t + 0.12); // C#5
    envGain.gain.setValueAtTime(vol, t);
    envGain.gain.setValueAtTime(vol * 0.8, t + 0.12);
    envGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  // ── Helpers ────────────────────────────────────────────────

  private distance(x: number, y: number): number {
    const dx = x - this.listenerX;
    const dy = y - this.listenerY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** Get proximity info for all users (for UI visualization) */
  getProximityInfo(): Array<{ userId: string; distance: number; volume: number }> {
    const result: Array<{ userId: string; distance: number; volume: number }> = [];
    for (const [userId, state] of this.users) {
      const dist = this.distance(state.x, state.y);
      const vol = dist > this.config.maxDistance ? 0 : 1 - dist / this.config.maxDistance;
      result.push({ userId, distance: dist, volume: Math.max(0, vol) });
    }
    return result;
  }

  /** Get current config */
  getConfig(): Readonly<SpatialAudioConfig> { return { ...this.config }; }

  /** Update config at runtime */
  updateConfig(patch: Partial<SpatialAudioConfig>) {
    Object.assign(this.config, patch);
    if (this.masterGain && !this._muted) this.masterGain.gain.value = this.config.masterVolume;
    // Update panner nodes
    for (const state of this.users.values()) {
      state.panner.refDistance = this.config.refDistance;
      state.panner.maxDistance = this.config.maxDistance;
      state.panner.rolloffFactor = this.config.rolloff;
    }
  }

  getUserCount(): number { return this.users.size; }
}
