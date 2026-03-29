/**
 * Collaboration UI — floating panel showing connected users + status
 * Top-right corner, minimal Figma-style design.
 */

import type { CollabClient, CollabUser, ConnectionStatus } from "../collab";

let container: HTMLDivElement | null = null;
let collabClient: CollabClient | null = null;
let onConnectCb: ((roomId: string, userName: string) => void) | null = null;
let onDisconnectCb: (() => void) | null = null;
let onFollowCb: ((userId: string) => void) | null = null;
let onSpatialAudioCb: (() => void) | null = null;
let followingUserId: string | null = null;

export function initCollabUI(
  client: CollabClient,
  opts: {
    onConnect: (roomId: string, userName: string) => void;
    onDisconnect: () => void;
    onFollow?: (userId: string) => void;
    onSpatialAudio?: () => void;
  }
) {
  collabClient = client;
  onConnectCb = opts.onConnect;
  onDisconnectCb = opts.onDisconnect;
  onFollowCb = opts.onFollow || null;
  onSpatialAudioCb = opts.onSpatialAudio || null;

  if (container) container.remove();
  container = document.createElement("div");
  container.id = "collab-panel";
  container.innerHTML = buildDisconnectedHTML();
  document.body.appendChild(container);

  applyStyles();
  bindEvents();
}

export function setFollowingUser(userId: string | null) {
  followingUserId = userId;
  // Re-render if connected
  if (container && collabClient && collabClient.connectionStatus !== "disconnected") {
    updateCollabUI(collabClient.connectionStatus, collabClient.connectedUsers);
  }
}

export function updateCollabUI(status: ConnectionStatus, users: CollabUser[]) {
  if (!container) return;

  if (status === "disconnected") {
    container.innerHTML = buildDisconnectedHTML();
    bindEvents();
  } else {
    container.innerHTML = buildConnectedHTML(status, users);
    bindEvents();
  }
}

function buildDisconnectedHTML(): string {
  return `
    <button class="collab-share-btn" id="collab-connect-btn">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
        <polyline points="16 6 12 2 8 6"/>
        <line x1="12" y1="2" x2="12" y2="15"/>
      </svg>
      Share
    </button>
  `;
}

function buildConnectedHTML(status: ConnectionStatus, users: CollabUser[]): string {
  const statusColor = status === "connected" ? "#00b894" : status === "reconnecting" ? "#f9ca24" : "#b2bec3";
  const statusLabel = status === "connected" ? "Connected" : status === "reconnecting" ? "Reconnecting…" : "Connecting…";

  const avatars = users.map(u => {
    const isFollowed = followingUserId === u.userId;
    return `
    <div class="collab-avatar${isFollowed ? ' collab-avatar-followed' : ''}" style="background:${u.color}" title="${u.userName}${isFollowed ? ' (following)' : ' (⌘+click to follow)'}" data-user-id="${u.userId}">
      ${u.userName.charAt(0).toUpperCase()}
    </div>
  `;
  }).join("");

  return `
    <div class="collab-status">
      <span class="collab-dot" style="background:${statusColor}"></span>
      <span class="collab-status-text">${statusLabel}</span>
    </div>
    <div class="collab-avatars">${avatars}</div>
    <div class="collab-actions">
      <button class="collab-copy-btn" id="collab-copy-link" title="Copy room link">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
      </button>
      <button class="collab-copy-btn" id="collab-spatial-audio" title="Spatial Audio settings">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
        </svg>
      </button>
      <button class="collab-disconnect-btn" id="collab-disconnect-btn" title="Disconnect">✕</button>
    </div>
  `;
}

function bindEvents() {
  const connectBtn = document.getElementById("collab-connect-btn");
  if (connectBtn) {
    connectBtn.onclick = () => showConnectDialog();
  }

  const copyBtn = document.getElementById("collab-copy-link");
  if (copyBtn && collabClient) {
    copyBtn.onclick = () => {
      const url = `${location.origin}${location.pathname}?room=${collabClient!.currentRoomId}`;
      navigator.clipboard.writeText(url).then(() => {
        copyBtn.textContent = "✓";
        setTimeout(() => { if (container) updateCollabUI(collabClient!.connectionStatus, collabClient!.connectedUsers); }, 1500);
      });
    };
  }

  const disconnectBtn = document.getElementById("collab-disconnect-btn");
  if (disconnectBtn) {
    disconnectBtn.onclick = () => onDisconnectCb?.();
  }

  const spatialBtn = document.getElementById("collab-spatial-audio");
  if (spatialBtn) {
    spatialBtn.onclick = () => onSpatialAudioCb?.();
  }

  // Follow mode: Cmd+click (or just click) on avatar
  if (container) {
    const avatars = container.querySelectorAll('.collab-avatar[data-user-id]');
    avatars.forEach(el => {
      (el as HTMLElement).style.cursor = 'pointer';
      (el as HTMLElement).onclick = (ev) => {
        const userId = (el as HTMLElement).dataset.userId;
        if (userId && onFollowCb) {
          onFollowCb(userId);
        }
      };
    });
  }
}

function showConnectDialog() {
  const roomId = prompt("Room ID:", `room-${Math.random().toString(36).slice(2, 8)}`);
  if (!roomId) return;
  const userName = prompt("Your name:", `User ${Math.floor(Math.random() * 1000)}`);
  if (!userName) return;
  onConnectCb?.(roomId, userName);
}

function applyStyles() {
  if (document.getElementById("collab-ui-styles")) return;
  const style = document.createElement("style");
  style.id = "collab-ui-styles";
  style.textContent = `
    #collab-panel {
      position: fixed;
      top: 12px;
      right: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      background: #2d2d2d;
      border: 1px solid #3d3d3d;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      z-index: 9000;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 12px;
      color: #ccc;
    }
    .collab-share-btn {
      display: flex; align-items: center; gap: 6px;
      background: #4a90d9; color: #fff;
      border: none; border-radius: 6px;
      padding: 5px 12px; cursor: pointer;
      font-size: 12px; font-weight: 500;
    }
    .collab-share-btn:hover { background: #357abd; }
    .collab-status { display: flex; align-items: center; gap: 5px; }
    .collab-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
    .collab-status-text { font-size: 11px; opacity: 0.8; }
    .collab-avatars { display: flex; gap: -4px; }
    .collab-avatar {
      width: 24px; height: 24px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 600; color: #fff;
      border: 2px solid #2d2d2d;
      margin-left: -4px;
    }
    .collab-avatar:first-child { margin-left: 0; }
    .collab-avatar:hover { transform: scale(1.15); transition: transform 0.1s; }
    .collab-avatar-followed {
      border-color: #fff !important;
      box-shadow: 0 0 0 2px rgba(74,144,217,0.7);
    }
    .collab-actions { display: flex; gap: 4px; }
    .collab-copy-btn, .collab-disconnect-btn {
      background: transparent; border: 1px solid #555;
      border-radius: 4px; color: #aaa; cursor: pointer;
      padding: 3px 6px; font-size: 11px;
    }
    .collab-copy-btn:hover, .collab-disconnect-btn:hover { background: #444; color: #fff; }
  `;
  document.head.appendChild(style);
}

export function destroyCollabUI() {
  container?.remove();
  container = null;
}
