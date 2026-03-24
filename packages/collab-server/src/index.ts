/**
 * OpenSketch Collaboration Server
 * Lightweight WebSocket server for real-time multi-user editing.
 * In-memory only, no database. Room-based architecture.
 */

import { WebSocketServer, WebSocket } from "ws";

// ── Protocol Types ──────────────────────────────────────────────

interface JoinMsg {
  type: "join";
  roomId: string;
  userId: string;
  userName: string;
  color?: string;
}

interface LeaveMsg {
  type: "leave";
}

interface CursorMoveMsg {
  type: "cursor_move";
  x: number;
  y: number;
  tool?: string;
}

interface SelectionChangeMsg {
  type: "selection_change";
  selectedIds: number[];
}

interface SceneOpMsg {
  type: "scene_op";
  op: SceneOperation;
}

interface FullSyncMsg {
  type: "full_sync";
  sceneData: string;
}

interface SceneOperation {
  kind: string; // "add_node" | "remove_node" | "update_node" | "reorder" | "reparent" | "full_replace"
  nodeId?: number;
  parentId?: number;
  props?: Record<string, unknown>;
  sceneData?: string; // for full_replace
  index?: number;
}

type IncomingMessage = JoinMsg | LeaveMsg | CursorMoveMsg | SelectionChangeMsg | SceneOpMsg | FullSyncMsg;

// ── Server-to-client messages ───────────────────────────────────

interface UserJoinedMsg {
  type: "user_joined";
  userId: string;
  userName: string;
  color: string;
  users: { userId: string; userName: string; color: string }[];
}

interface UserLeftMsg {
  type: "user_left";
  userId: string;
  users: { userId: string; userName: string; color: string }[];
}

interface RemoteCursorMsg {
  type: "remote_cursor";
  userId: string;
  userName: string;
  color: string;
  x: number;
  y: number;
  tool?: string;
}

interface RemoteSelectionMsg {
  type: "remote_selection";
  userId: string;
  selectedIds: number[];
}

interface RemoteSceneOpMsg {
  type: "remote_scene_op";
  userId: string;
  op: SceneOperation;
}

interface FullSyncResponseMsg {
  type: "full_sync";
  sceneData: string;
}

// ── Data Structures ─────────────────────────────────────────────

const CURSOR_COLORS = [
  "#ff6b6b", "#4ecdc4", "#45b7d1", "#f9ca24", "#6c5ce7",
  "#fd79a8", "#00b894", "#e17055", "#0984e3", "#a29bfe",
];

interface ClientInfo {
  ws: WebSocket;
  userId: string;
  userName: string;
  color: string;
  roomId: string;
}

interface Room {
  id: string;
  clients: Map<WebSocket, ClientInfo>;
  lastScene: string | null; // last known full scene JSON
  colorIndex: number;
}

const rooms = new Map<string, Room>();

function getOrCreateRoom(roomId: string): Room {
  let room = rooms.get(roomId);
  if (!room) {
    room = { id: roomId, clients: new Map(), lastScene: null, colorIndex: 0 };
    rooms.set(roomId, room);
  }
  return room;
}

function getUserList(room: Room): { userId: string; userName: string; color: string }[] {
  const users: { userId: string; userName: string; color: string }[] = [];
  for (const info of room.clients.values()) {
    users.push({ userId: info.userId, userName: info.userName, color: info.color });
  }
  return users;
}

function broadcast(room: Room, msg: unknown, exclude?: WebSocket) {
  const data = JSON.stringify(msg);
  for (const [ws] of room.clients) {
    if (ws !== exclude && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

function send(ws: WebSocket, msg: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

// ── Server ──────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || "3100", 10);

const wss = new WebSocketServer({ port: PORT });

console.log(`🎨 OpenSketch Collab Server running on ws://localhost:${PORT}`);

wss.on("connection", (ws: WebSocket) => {
  let clientInfo: ClientInfo | null = null;

  ws.on("message", (raw: Buffer) => {
    let msg: IncomingMessage;
    try {
      msg = JSON.parse(raw.toString()) as IncomingMessage;
    } catch {
      return;
    }

    switch (msg.type) {
      case "join": {
        const room = getOrCreateRoom(msg.roomId);
        const color = msg.color || CURSOR_COLORS[room.colorIndex++ % CURSOR_COLORS.length];
        clientInfo = {
          ws,
          userId: msg.userId,
          userName: msg.userName,
          color,
          roomId: msg.roomId,
        };
        room.clients.set(ws, clientInfo);

        // Send full sync if room has scene data
        if (room.lastScene) {
          send(ws, { type: "full_sync", sceneData: room.lastScene } as FullSyncResponseMsg);
        }

        // Notify all clients about new user
        const users = getUserList(room);
        broadcast(room, {
          type: "user_joined",
          userId: clientInfo.userId,
          userName: clientInfo.userName,
          color: clientInfo.color,
          users,
        } as UserJoinedMsg);

        console.log(`[${msg.roomId}] ${msg.userName} joined (${room.clients.size} users)`);
        break;
      }

      case "leave": {
        if (clientInfo) {
          handleDisconnect(clientInfo);
          clientInfo = null;
        }
        break;
      }

      case "cursor_move": {
        if (!clientInfo) return;
        const room = rooms.get(clientInfo.roomId);
        if (!room) return;
        broadcast(room, {
          type: "remote_cursor",
          userId: clientInfo.userId,
          userName: clientInfo.userName,
          color: clientInfo.color,
          x: msg.x,
          y: msg.y,
          tool: msg.tool,
        } as RemoteCursorMsg, ws);
        break;
      }

      case "selection_change": {
        if (!clientInfo) return;
        const room = rooms.get(clientInfo.roomId);
        if (!room) return;
        broadcast(room, {
          type: "remote_selection",
          userId: clientInfo.userId,
          selectedIds: msg.selectedIds,
        } as RemoteSelectionMsg, ws);
        break;
      }

      case "scene_op": {
        if (!clientInfo) return;
        const room = rooms.get(clientInfo.roomId);
        if (!room) return;
        broadcast(room, {
          type: "remote_scene_op",
          userId: clientInfo.userId,
          op: msg.op,
        } as RemoteSceneOpMsg, ws);
        break;
      }

      case "full_sync": {
        if (!clientInfo) return;
        const room = rooms.get(clientInfo.roomId);
        if (!room) return;
        // Store as latest scene state
        room.lastScene = msg.sceneData;
        // Broadcast to others so they can sync
        broadcast(room, {
          type: "full_sync",
          sceneData: msg.sceneData,
        } as FullSyncResponseMsg, ws);
        break;
      }
    }
  });

  ws.on("close", () => {
    if (clientInfo) {
      handleDisconnect(clientInfo);
    }
  });

  ws.on("error", () => {
    if (clientInfo) {
      handleDisconnect(clientInfo);
    }
  });
});

function handleDisconnect(info: ClientInfo) {
  const room = rooms.get(info.roomId);
  if (!room) return;
  room.clients.delete(info.ws);

  const users = getUserList(room);
  broadcast(room, {
    type: "user_left",
    userId: info.userId,
    users,
  } as UserLeftMsg);

  console.log(`[${info.roomId}] ${info.userName} left (${room.clients.size} users)`);

  // Clean up empty rooms
  if (room.clients.size === 0) {
    // Keep scene data for a while (in case someone rejoins)
    setTimeout(() => {
      const r = rooms.get(info.roomId);
      if (r && r.clients.size === 0) {
        rooms.delete(info.roomId);
        console.log(`[${info.roomId}] Room cleaned up`);
      }
    }, 60_000); // 1 minute
  }
}
