/**
 * OpenSketch Collaboration Client
 * Connects to the collab WebSocket server for real-time multi-user editing.
 * Opt-in: app works fine without the server running.
 */

import type { CursorPresence } from "./ui/cursor-presence";

// ── Protocol Types ──────────────────────────────────────────────

export interface SceneOperation {
  kind: "add_node" | "remove_node" | "update_node" | "reorder" | "reparent" | "full_replace";
  nodeId?: number;
  parentId?: number;
  props?: Record<string, unknown>;
  sceneData?: string;
  index?: number;
}

export interface CollabUser {
  userId: string;
  userName: string;
  color: string;
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "reconnecting";

export interface CollabCallbacks {
  /** Called when remote scene operation received */
  onRemoteSceneOp?: (userId: string, op: SceneOperation) => void;
  /** Called when full scene sync received (initial join) */
  onFullSync?: (sceneData: string) => void;
  /** Called when connection status changes */
  onStatusChange?: (status: ConnectionStatus) => void;
  /** Called when user list changes */
  onUsersChange?: (users: CollabUser[]) => void;
}

// ── Collab Client ───────────────────────────────────────────────

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 15000]; // exponential backoff
const CURSOR_THROTTLE_MS = 50;

export class CollabClient {
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = "disconnected";
  private roomId = "";
  private userId: string;
  private userName = "";
  private serverUrl = "";
  private cursorPresence: CursorPresence | null = null;
  private callbacks: CollabCallbacks = {};
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private users: CollabUser[] = [];
  private intentionalClose = false;

  // Cursor throttle
  private lastCursorSend = 0;
  private pendingCursor: { x: number; y: number; tool?: string } | null = null;
  private cursorRafId = 0;

  constructor(userId?: string) {
    this.userId = userId || `user-${Math.random().toString(36).slice(2, 8)}`;
  }

  get connectionStatus(): ConnectionStatus { return this.status; }
  get connectedUsers(): CollabUser[] { return this.users; }
  get currentRoomId(): string { return this.roomId; }
  get currentUserId(): string { return this.userId; }

  /** Set the CursorPresence instance to feed remote cursors into */
  setCursorPresence(cp: CursorPresence) {
    this.cursorPresence = cp;
  }

  /** Set callbacks for collab events */
  setCallbacks(cb: CollabCallbacks) {
    this.callbacks = cb;
  }

  /** Connect to a collab room */
  connect(roomId: string, userName: string, serverUrl = "ws://localhost:3100") {
    this.disconnect();
    this.roomId = roomId;
    this.userName = userName;
    this.serverUrl = serverUrl;
    this.intentionalClose = false;
    this.reconnectAttempt = 0;
    this.doConnect();
  }

  /** Disconnect from the collab server */
  disconnect() {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.cursorRafId) {
      cancelAnimationFrame(this.cursorRafId);
      this.cursorRafId = 0;
    }
    if (this.ws) {
      try {
        this.send({ type: "leave" });
        this.ws.close();
      } catch { /* ignore */ }
      this.ws = null;
    }
    this.users = [];
    this.setStatus("disconnected");
    this.callbacks.onUsersChange?.(this.users);
  }

  /** Send local cursor position (throttled) */
  sendCursorMove(x: number, y: number, tool?: string) {
    if (this.status !== "connected") return;
    const now = Date.now();
    if (now - this.lastCursorSend >= CURSOR_THROTTLE_MS) {
      this.send({ type: "cursor_move", x, y, tool });
      this.lastCursorSend = now;
      this.pendingCursor = null;
    } else {
      this.pendingCursor = { x, y, tool };
      if (!this.cursorRafId) {
        this.cursorRafId = requestAnimationFrame(() => {
          this.cursorRafId = 0;
          if (this.pendingCursor && this.status === "connected") {
            this.send({ type: "cursor_move", ...this.pendingCursor });
            this.lastCursorSend = Date.now();
            this.pendingCursor = null;
          }
        });
      }
    }
  }

  /** Send selection change */
  sendSelectionChange(selectedIds: number[]) {
    if (this.status !== "connected") return;
    this.send({ type: "selection_change", selectedIds });
  }

  /** Send a scene operation */
  sendSceneOp(op: SceneOperation) {
    if (this.status !== "connected") return;
    this.send({ type: "scene_op", op });
  }

  /** Send full scene sync (e.g., on initial join or major change) */
  sendFullSync(sceneData: string) {
    if (this.status !== "connected") return;
    this.send({ type: "full_sync", sceneData });
  }

  // ── Internal ────────────────────────────────────────────────

  private doConnect() {
    this.setStatus(this.reconnectAttempt > 0 ? "reconnecting" : "connecting");

    try {
      this.ws = new WebSocket(this.serverUrl);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.setStatus("connected");
      // Join the room
      this.send({
        type: "join",
        roomId: this.roomId,
        userId: this.userId,
        userName: this.userName,
      });
    };

    this.ws.onmessage = (event) => {
      let msg: any;
      try {
        msg = JSON.parse(event.data as string);
      } catch { return; }
      this.handleMessage(msg);
    };

    this.ws.onclose = () => {
      this.ws = null;
      if (!this.intentionalClose) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror
    };
  }

  private handleMessage(msg: any) {
    switch (msg.type) {
      case "user_joined":
        this.users = msg.users || [];
        this.callbacks.onUsersChange?.(this.users);
        break;

      case "user_left":
        // Remove cursor for departed user
        if (this.cursorPresence && msg.userId) {
          this.cursorPresence.removeCursor(msg.userId);
        }
        this.users = msg.users || [];
        this.callbacks.onUsersChange?.(this.users);
        break;

      case "remote_cursor":
        if (this.cursorPresence) {
          this.cursorPresence.updateCursor(
            msg.userId,
            msg.userName,
            msg.x,
            msg.y,
            { tool: msg.tool }
          );
        }
        break;

      case "remote_selection":
        if (this.cursorPresence) {
          this.cursorPresence.updateCursor(
            msg.userId,
            msg.userId, // name not in this msg, cursor already has it
            0, 0, // position not changed
            { selectedIds: msg.selectedIds }
          );
        }
        break;

      case "remote_scene_op":
        this.callbacks.onRemoteSceneOp?.(msg.userId, msg.op);
        break;

      case "full_sync":
        this.callbacks.onFullSync?.(msg.sceneData);
        break;
    }
  }

  private send(msg: unknown) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private setStatus(s: ConnectionStatus) {
    if (this.status !== s) {
      this.status = s;
      this.callbacks.onStatusChange?.(s);
    }
  }

  private scheduleReconnect() {
    if (this.intentionalClose) return;
    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)];
    this.reconnectAttempt++;
    this.setStatus("reconnecting");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.doConnect();
    }, delay);
  }
}
