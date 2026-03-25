import type { Editor } from '../editor';

interface ProjectUser {
  user_id: string;
  name: string;
  role: 'owner' | 'editor' | 'viewer';
  avatar: string;
}

interface Lock {
  user_id: string;
  locked_at: number;
  expires_at: number;
}

interface LocksInfo {
  node_locks: Record<string, Lock>;
  page_locks: Record<string, Lock>;
}

const ROLE_COLORS: Record<string, string> = {
  owner: '#ff6b6b',
  editor: '#4ecdc4',
  viewer: '#95a5a6',
};

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer',
};

export function renderPermissionsPanel(container: HTMLElement, editor: Editor): void {
  const engine = (editor as any).engine;
  if (!engine) return;

  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'padding:12px;font-size:12px;color:#ccc;';

  // Title
  const title = document.createElement('div');
  title.style.cssText = 'font-weight:600;font-size:13px;color:#fff;margin-bottom:12px;display:flex;align-items:center;gap:6px;';
  title.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> Permissions`;
  wrapper.appendChild(title);

  // Current user info
  const currentUserId = engine.get_current_user();
  const currentRole = engine.perm_get_role(currentUserId);

  const currentUserDiv = document.createElement('div');
  currentUserDiv.style.cssText = 'background:rgba(255,255,255,0.05);border-radius:6px;padding:8px 10px;margin-bottom:12px;';
  currentUserDiv.innerHTML = `
    <div style="font-size:10px;color:#888;margin-bottom:4px;">Current User</div>
    <div style="display:flex;align-items:center;gap:6px;">
      <span style="font-weight:500;color:#fff;">${currentUserId}</span>
      <span style="background:${ROLE_COLORS[currentRole]};color:#fff;padding:1px 6px;border-radius:3px;font-size:10px;">${ROLE_LABELS[currentRole] || currentRole}</span>
    </div>
  `;
  wrapper.appendChild(currentUserDiv);

  // Users list
  const usersJson = engine.perm_get_users();
  const users: ProjectUser[] = usersJson ? JSON.parse(usersJson) : [];

  const usersSection = document.createElement('div');
  usersSection.style.cssText = 'margin-bottom:12px;';

  const usersHeader = document.createElement('div');
  usersHeader.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';
  usersHeader.innerHTML = `<span style="font-weight:500;color:#fff;">Team Members (${users.length})</span>`;

  // Add user button (only for owner)
  if (currentRole === 'owner') {
    const addBtn = document.createElement('button');
    addBtn.textContent = '+ Add';
    addBtn.style.cssText = 'background:#4a90d9;color:#fff;border:none;border-radius:4px;padding:2px 8px;font-size:10px;cursor:pointer;';
    addBtn.onclick = () => {
      const userId = prompt('User ID:');
      if (!userId) return;
      const name = prompt('Display name:') || userId;
      const role = prompt('Role (owner/editor/viewer):') || 'viewer';
      engine.perm_add_user(userId, name, role);
      renderPermissionsPanel(container, editor);
    };
    usersHeader.appendChild(addBtn);
  }
  usersSection.appendChild(usersHeader);

  // User rows
  for (const user of users) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:6px 8px;background:rgba(255,255,255,0.03);border-radius:4px;margin-bottom:4px;';

    const left = document.createElement('div');
    left.style.cssText = 'display:flex;align-items:center;gap:6px;';
    left.innerHTML = `
      <div style="width:24px;height:24px;border-radius:50%;background:${ROLE_COLORS[user.role]};display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;font-weight:600;">${user.name.charAt(0).toUpperCase()}</div>
      <div>
        <div style="color:#fff;font-size:11px;">${user.name}</div>
        <div style="color:#888;font-size:9px;">${user.user_id}</div>
      </div>
    `;
    row.appendChild(left);

    const right = document.createElement('div');
    right.style.cssText = 'display:flex;align-items:center;gap:4px;';

    if (currentRole === 'owner' && user.user_id !== currentUserId) {
      const roleSelect = document.createElement('select');
      roleSelect.style.cssText = 'background:#2a2a3e;color:#ccc;border:1px solid #444;border-radius:3px;font-size:10px;padding:1px 4px;';
      for (const r of ['owner', 'editor', 'viewer']) {
        const opt = document.createElement('option');
        opt.value = r;
        opt.textContent = ROLE_LABELS[r];
        opt.selected = r === user.role;
        roleSelect.appendChild(opt);
      }
      roleSelect.onchange = () => {
        engine.perm_set_role(user.user_id, roleSelect.value);
        renderPermissionsPanel(container, editor);
      };
      right.appendChild(roleSelect);

      const removeBtn = document.createElement('button');
      removeBtn.textContent = '✕';
      removeBtn.style.cssText = 'background:none;border:none;color:#ff6b6b;cursor:pointer;font-size:12px;padding:0 2px;';
      removeBtn.onclick = () => {
        engine.perm_remove_user(user.user_id);
        renderPermissionsPanel(container, editor);
      };
      right.appendChild(removeBtn);
    } else {
      const badge = document.createElement('span');
      badge.style.cssText = `background:${ROLE_COLORS[user.role]};color:#fff;padding:1px 6px;border-radius:3px;font-size:10px;`;
      badge.textContent = ROLE_LABELS[user.role];
      right.appendChild(badge);
    }

    row.appendChild(right);
    usersSection.appendChild(row);
  }

  wrapper.appendChild(usersSection);

  // Locks section
  const locksJson = engine.perm_get_locks();
  const locks: LocksInfo = locksJson ? JSON.parse(locksJson) : { node_locks: {}, page_locks: {} };

  const nodeLockEntries = Object.entries(locks.node_locks);
  const pageLockEntries = Object.entries(locks.page_locks);
  const totalLocks = nodeLockEntries.length + pageLockEntries.length;

  const locksSection = document.createElement('div');
  locksSection.style.cssText = 'margin-bottom:12px;';

  const locksHeader = document.createElement('div');
  locksHeader.style.cssText = 'font-weight:500;color:#fff;margin-bottom:8px;';
  locksHeader.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Active Locks (${totalLocks})`;
  locksSection.appendChild(locksHeader);

  if (totalLocks === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'color:#666;font-size:11px;text-align:center;padding:8px;';
    empty.textContent = 'No active locks';
    locksSection.appendChild(empty);
  }

  for (const [nodeId, lock] of nodeLockEntries) {
    const lockRow = createLockRow('Node', nodeId, lock, currentRole === 'owner' || lock.user_id === currentUserId, () => {
      engine.perm_unlock_node(BigInt(nodeId));
      renderPermissionsPanel(container, editor);
    });
    locksSection.appendChild(lockRow);
  }

  for (const [pageId, lock] of pageLockEntries) {
    const lockRow = createLockRow('Page', pageId, lock, currentRole === 'owner' || lock.user_id === currentUserId, () => {
      engine.perm_unlock_page(BigInt(pageId));
      renderPermissionsPanel(container, editor);
    });
    locksSection.appendChild(lockRow);
  }

  wrapper.appendChild(locksSection);

  // Lock selected node button
  if (currentRole !== 'viewer') {
    const sel = (editor as any).selection as number[] | undefined;
    if (sel && sel.length > 0) {
      const lockSelBtn = document.createElement('button');
      lockSelBtn.style.cssText = 'width:100%;padding:6px;background:#4a90d9;color:#fff;border:none;border-radius:4px;font-size:11px;cursor:pointer;margin-bottom:6px;';

      const nodeId = sel[0];
      const existingLock = engine.perm_get_node_lock(BigInt(nodeId));
      const isLocked = existingLock && existingLock.length > 0;

      if (isLocked) {
        const lockInfo: Lock = JSON.parse(existingLock);
        if (lockInfo.user_id === currentUserId || currentRole === 'owner') {
          lockSelBtn.textContent = '🔓 Unlock Selected Node';
          lockSelBtn.onclick = () => {
            engine.perm_unlock_node(BigInt(nodeId));
            renderPermissionsPanel(container, editor);
          };
        } else {
          lockSelBtn.textContent = `🔒 Locked by ${lockInfo.user_id}`;
          lockSelBtn.disabled = true;
          lockSelBtn.style.opacity = '0.5';
          lockSelBtn.style.cursor = 'not-allowed';
        }
      } else {
        lockSelBtn.textContent = '🔒 Lock Selected Node';
        lockSelBtn.onclick = () => {
          engine.perm_lock_node(BigInt(nodeId), BigInt(Date.now()));
          renderPermissionsPanel(container, editor);
        };
      }
      wrapper.appendChild(lockSelBtn);
    }
  }

  container.appendChild(wrapper);
}

function createLockRow(
  type: string,
  id: string,
  lock: Lock,
  canUnlock: boolean,
  onUnlock: () => void,
): HTMLElement {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:4px 8px;background:rgba(255,200,50,0.08);border-radius:4px;margin-bottom:3px;border-left:2px solid #f0ad4e;';

  const info = document.createElement('div');
  info.style.cssText = 'font-size:11px;';
  info.innerHTML = `<span style="color:#f0ad4e;">${type} #${id}</span> <span style="color:#888;">by ${lock.user_id}</span>`;
  row.appendChild(info);

  if (canUnlock) {
    const unlockBtn = document.createElement('button');
    unlockBtn.textContent = '🔓';
    unlockBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:12px;padding:0 2px;';
    unlockBtn.title = 'Unlock';
    unlockBtn.onclick = onUnlock;
    row.appendChild(unlockBtn);
  }

  return row;
}
