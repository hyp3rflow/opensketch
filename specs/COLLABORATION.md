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

## CRDT-Based Sync (Operation-Level)

### Architecture
- **Rust engine** (`crates/engine/src/crdt.rs`): Core CRDT implementation
  - `VectorClock`: Lamport-style vector clock (site_id → counter map)
  - `CRDTDoc`: Operation log, vector clock, merge logic, pending ops queue
  - `Operation`: Timestamped, attributed ops with vector clock snapshot
  - `TombstoneSet`: Tracks deleted nodes for concurrent add/remove resolution
  - `LWWRegister`: Last-Writer-Wins register per property per node

### Operation Types (`OpKind`)
| Op | Description |
|----|-------------|
| `AddNode` | New node (JSON-serialized) with optional parent |
| `RemoveNode` | Delete (tombstoned) |
| `UpdateProperty` | LWW property change (24+ property keys) |
| `MoveNode` | Position update (LWW on x/y) |
| `ReparentNode` | Change parent + optional index |
| `ReorderChildren` | Reorder children of a parent |
| `AddPage` / `RemovePage` / `RenamePage` / `SetActivePage` | Page ops |

### Conflict Resolution
- **Properties**: LWW — higher timestamp wins; tie-break by site_id (lexicographic)
- **Deletes**: Tombstone — delete wins over concurrent property updates
- **Add + Remove concurrent**: Tombstone check prevents ghost nodes
- **Positions**: LWW on (x, y) pair atomically

### WASM Bindings
| Binding | Description |
|---------|-------------|
| `set_site_id(id)` | Set the local site identifier |
| `get_site_id()` | Get the local site identifier |
| `get_vector_clock()` | Get vector clock as JSON |
| `get_pending_operations()` | Peek at unsent ops (JSON) |
| `take_pending_operations()` | Take and clear pending ops |
| `ack_operations(ids_json)` | Acknowledge sent ops |
| `apply_remote_operations(ops_json)` | Merge remote ops → MergeResult JSON |
| `crdt_add_node(id, parent)` | Generate add op |
| `crdt_remove_node(id)` | Generate remove op |
| `crdt_update_property(id, key, val)` | Generate property update op |
| `crdt_move_node(id, x, y)` | Generate move op |
| `crdt_reparent_node(id, parent, idx)` | Generate reparent op |
| `get_crdt_state()` | Debug state summary |

### TypeScript Integration
- `sync-queue.ts`: Extended with `CRDTOperation` type and `enqueueCRDT()` / `onCRDTSync()` for operation-level offline queuing
- `collab.ts`: `sendCRDTOps()` method + `onRemoteCRDTOps` callback for WebSocket relay
- Protocol: `crdt_ops` (client→server) / `remote_crdt_ops` (server→client)

### Flow
1. Local edit → engine method → `crdt_*()` generates op → `take_pending_operations()`
2. Pending ops sent via WebSocket (`sendCRDTOps`) or queued offline (`enqueueCRDT`)
3. Remote ops arrive → `apply_remote_operations()` → merge with LWW/tombstone → scene updated
4. MergeResult tells caller which ops were applied vs rejected

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
