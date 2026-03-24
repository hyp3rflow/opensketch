# Collaboration — Real-time Multi-user Editing

## Architecture

### Server (`packages/collab-server/`)
- Lightweight WebSocket server (Node.js + `ws`)
- Room-based: clients join a document room by ID
- In-memory state only (no database)
- Port 3100 (configurable via `PORT` env)
- Message protocol: JSON over WebSocket

### Client (`packages/app/src/collab.ts`)
- `CollabClient` class with auto-reconnection (exponential backoff)
- Cursor position throttled at 50ms
- Operation-based sync: scene mutations sent as ops
- Full sync on initial join

### UI (`packages/app/src/ui/collab-ui.ts`)
- Top-right floating panel
- "Share" button → connect dialog (room ID + user name)
- Connected users shown as colored avatar circles
- Connection status indicator (green/yellow/gray dot)
- Copy room link button

## Protocol Messages

### Client → Server
| Type | Fields | Description |
|------|--------|-------------|
| `join` | roomId, userId, userName | Join a room |
| `leave` | — | Leave current room |
| `cursor_move` | x, y, tool? | Local cursor position (world coords) |
| `selection_change` | selectedIds[] | Selected node IDs |
| `scene_op` | op: SceneOperation | Scene mutation |
| `full_sync` | sceneData (JSON) | Full scene state |

### Server → Client
| Type | Fields | Description |
|------|--------|-------------|
| `user_joined` | userId, userName, color, users[] | New user joined |
| `user_left` | userId, users[] | User disconnected |
| `remote_cursor` | userId, userName, color, x, y, tool? | Remote cursor update |
| `remote_selection` | userId, selectedIds[] | Remote selection change |
| `remote_scene_op` | userId, op | Remote scene operation |
| `full_sync` | sceneData | Full scene state (initial sync) |

## Integration Points
- `editor.ts`: CursorPresence renders remote cursors on canvas
- `main.ts`: Wires collab callbacks to engine import/export
- Selection changes broadcast via `onSelection` callback
- Scene changes broadcast via `onSave` callback
- URL param `?room=<id>` auto-joins on load

## Running
```bash
# Start collab server
cd packages/collab-server && pnpm start

# App connects to ws://localhost:3100 by default
cd packages/app && pnpm dev
```
