import { initI18n } from "./ui/i18n";
import { loadEngine } from "./wasm";
import { Editor } from "./editor";
import { setupToolbar } from "./ui/toolbar";
import { setupLayersPanel } from "./ui/layers-panel";
import { setupPropertiesPanel } from "./ui/properties-panel";
import { setupDesignSystemPanel } from "./ui/design-system";
import { setupAgentPanel } from "./ui/agent-panel";
import { setupQuizPanel } from "./ui/quiz-panel";
import { setupNoteOverlay } from "./ui/note-overlay";
import { setupZoomControls } from "./ui/zoom-controls";
import { setupMinimap } from "./ui/minimap";
import { setupRulers } from "./ui/rulers";
import { setupPageTabs } from "./ui/page-tabs";
import { AutoSave, setupHistoryPanel } from "./autosave";
import { FileManager, setupFileMenu } from "./ui/file-manager";
import { setupSyncStatus } from "./ui/sync-status";
import { setupHandoffPanel } from "./ui/handoff-panel";
import { setupColorPalettePanel } from "./ui/color-palette-panel";
import { setupBranchPanel } from "./ui/branch-panel";
import { setupReviewPanel } from "./ui/review-panel";
import { createPrototypeViewer } from "./ui/prototype-viewer";
import { showExportAllModal } from "./ui/code-mapping-panel";
import { CommentOverlay, setupCommentsPanel, updateCommentsBadge } from "./ui/comments";
import { setupVariablesPanel } from "./ui/variables-panel";
import { setupAssetPanel } from "./ui/asset-panel";
import { setupBookmarksPanel } from "./ui/bookmarks-panel";
import { setupAccessibilityPanel } from "./ui/accessibility-panel";
import { createMigrationPanel } from "./ui/migration-panel";
import { createIconSearchPanel } from "./ui/icon-search-panel";
import { initComponentLibrary, renderComponentLibraryPanel } from "./ui/component-library";
import { PluginManager, loremIpsumPlugin, colorPalettePlugin, GridGeneratorPlugin, AutoRenamePlugin, AccessibilityCheckerPlugin } from "./plugins";
import { setupProfilerPanel } from "./ui/profiler-panel";
import { setupMarketplacePanel } from "./ui/plugin-marketplace";
import { createAnimationTimeline } from "./ui/animation-timeline";
import { createComponentDocsPanel } from "./ui/component-docs-panel";
import { CollabClient } from "./collab";
import { initCollabUI, updateCollabUI } from "./ui/collab-ui";
import { renderPermissionsPanel } from "./ui/permissions-panel";
import { setupCanvasRecorder, toggleRecorderBar } from "./ui/canvas-recorder";
import { setupContextualToolbar } from "./ui/contextual-toolbar";
import { setupTemplatePanel } from "./ui/template-panel";
import { setupDependencyGraphPanel } from "./ui/dependency-graph-panel";
import { setupArtboardPresetsPanel } from "./ui/artboard-presets";
import { setupPanelSync, addPopOutButton } from "./ui/panel-detach";

async function main() {
  await initI18n();
  const wasm = await loadEngine();
  const canvas = document.getElementById("canvas") as HTMLCanvasElement;
  const rect = canvas.getBoundingClientRect();
  const engine = new wasm.Engine(rect.width, rect.height);

  const editor = new Editor(engine, canvas);

  // Auto-save: restore previous session & start periodic saves
  const autoSave = new AutoSave(editor);
  const hadSavedSession = await autoSave.restore();
  autoSave.start();
  editor.onSave(() => autoSave.save("manual"));

  // File System Access API (native file save/open)
  const fileManager = new FileManager(editor);
  setupFileMenu(document.body, fileManager);

  // Wire Cmd+S to file save (if file handle exists) + auto-save
  editor.onSave(() => fileManager.save());

  // Cmd+O: open file
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key === "o") {
      e.preventDefault();
      fileManager.open();
    }
    // Cmd+Shift+S: save as
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && (e.key === "s" || e.key === "S")) {
      e.preventDefault();
      fileManager.saveAs();
    }
  });

  // Save before unload
  window.addEventListener("beforeunload", () => autoSave.save("auto"));

  // Service Worker registration
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }

  // Sync status indicator
  const syncStatus = setupSyncStatus(document.body);

  // Design system modal
  const dsBackdrop = document.getElementById("ds-modal-backdrop")!;
  const dsClose = document.getElementById("ds-modal-close")!;

  function toggleDesignSystem() {
    dsBackdrop.classList.toggle("open");
  }

  dsClose.addEventListener("click", toggleDesignSystem);
  dsBackdrop.addEventListener("click", (e) => {
    if (e.target === dsBackdrop) toggleDesignSystem();
  });

  // Prototype viewer
  const prototypeViewer = createPrototypeViewer(editor);

  // Animation timeline (bottom panel)
  const animTimeline = createAnimationTimeline(editor);
  document.body.appendChild(animTimeline.getContainer());

  // Canvas recorder (floating bar)
  setupCanvasRecorder(editor);

  // Contextual toolbar (floating quick-edit bar above selection)
  setupContextualToolbar(editor);

  // Whiteboard mode — already setup via editor.whiteboardMode
  (window as any).__toggleWhiteboard = () => editor.whiteboardMode.toggle();
  (window as any).__toggleTimer = () => { /* timer is part of whiteboard mode */ };

  // Bottom toolbar (with design system button + mode toggle)
  setupToolbar(document.getElementById("bottom-toolbar")!, editor, toggleDesignSystem, (mode) => {
    document.body.setAttribute("data-mode", mode);
    // In dev mode: disable drawing tools, show only select/hand
    document.querySelectorAll<HTMLElement>("#bottom-toolbar .tool-btn").forEach((btn) => {
      const tool = btn.dataset.tool;
      if (tool && tool !== "select" && tool !== "hand") {
        btn.style.display = mode === "dev" ? "none" : "";
      }
      // Design system button (no data-tool, has palette title)
      if (!tool && btn.title?.includes("Design")) {
        btn.style.display = mode === "dev" ? "none" : "";
      }
    });
    // Switch to select tool when entering dev mode
    editor.setDevMode(mode === "dev");
    if (mode === "dev") editor.setTool("select");
    // Toggle note overlay
    noteOverlay.setEnabled(mode === "dev");
  }, () => prototypeViewer.show());

  // Left panel = layers only
  setupLayersPanel(document.getElementById("layers-panel")!, editor);

  // Right panel = properties
  setupPropertiesPanel(document.getElementById("properties-panel")!, editor);

  // Multi-window panel sync
  setupPanelSync(editor);

  // Add pop-out buttons to right-pane tab headers
  {
    const rightPaneTabs = document.getElementById("right-pane-tabs");
    if (rightPaneTabs) {
      const popOutBar = document.createElement("div");
      popOutBar.style.cssText = "display:flex;align-items:center;gap:2px;margin-left:auto;padding-right:4px;";

      const detachableTabs: Array<{ id: "layers"|"properties"|"agent"|"comments"|"variables"|"assets"|"bookmarks"; label: string }> = [
        { id: "properties", label: "Properties" },
        { id: "agent", label: "Agent" },
        { id: "comments", label: "Comments" },
        { id: "variables", label: "Variables" },
        { id: "assets", label: "Assets" },
        { id: "bookmarks", label: "Bookmarks" },
      ];

      for (const { id, label } of detachableTabs) {
        const btn = document.createElement("button");
        btn.title = `Pop out ${label} to separate window`;
        btn.dataset.detachTarget = id;
        btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>`;
        btn.style.cssText = "background:none;border:none;cursor:pointer;padding:2px;border-radius:3px;opacity:0;display:none;align-items:center;color:currentColor;transition:opacity 0.15s;";
        btn.addEventListener("mouseenter", () => { btn.style.opacity = "0.8"; });
        btn.addEventListener("mouseleave", () => { btn.style.opacity = "0.3"; });
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          import("./ui/panel-detach").then(({ detachPanel }) => detachPanel(id, editor));
        });
        popOutBar.appendChild(btn);
      }
      rightPaneTabs.appendChild(popOutBar);

      // Show only the pop-out button for the active tab
      function updatePopOutButtons() {
        const activeTab = document.querySelector(".right-pane-tab.active") as HTMLElement | null;
        const activeId = activeTab?.dataset.tab;
        popOutBar.querySelectorAll("button").forEach((b) => {
          const show = (b as HTMLElement).dataset.detachTarget === activeId;
          (b as HTMLElement).style.display = show ? "flex" : "none";
          if (show) (b as HTMLElement).style.opacity = "0.3";
        });
      }
      updatePopOutButtons();
      // Observe tab clicks
      rightPaneTabs.addEventListener("click", () => setTimeout(updatePopOutButtons, 10));
    }
  }

  // Zoom controls (bottom-left, next to layers panel)
  setupZoomControls(document.getElementById("workspace")!, editor);

  // Minimap navigator (bottom-right)
  const minimap = setupMinimap(document.getElementById("workspace")!, editor);

  // Rulers & guides
  const rulers = setupRulers(document.getElementById("workspace")!, editor);
  editor.setRulers(rulers);

  // Page tabs (bottom center, above toolbar)
  const pageTabs = setupPageTabs(document.getElementById("workspace")!, editor);
  const branchPanel = setupBranchPanel(document.getElementById("workspace")!, editor);
  const reviewPanel = setupReviewPanel(document.getElementById("workspace")!, editor);
  (editor as any).reviewPanel = reviewPanel;

  // Note overlay (positioned over canvas)
  const noteOverlay = setupNoteOverlay(document.getElementById("workspace")!, editor);

  // Design system inside modal
  setupDesignSystemPanel(document.getElementById("design-system-panel")!, editor);

  // Agent panel (inside right pane)
  const agentPanel = document.getElementById("agent-panel")!;
  setupAgentPanel(agentPanel, editor);

  // Quiz panel (inside right pane)
  const quizPanel = document.getElementById("quiz-panel")!;
  setupQuizPanel(quizPanel, editor);

  // Handoff panel (inside right pane) — design specs, code gen, asset export
  setupHandoffPanel(document.getElementById("handoff-panel")!, editor);

  // Profiler panel (inside right pane)
  setupProfilerPanel(document.getElementById("profiler-panel")!, editor);

  // Color palette panel
  const palettePanel = setupColorPalettePanel(document.getElementById("palette-panel")!, editor);
  palettePanel.refresh();

  // Comments overlay + panel
  const commentOverlay = new CommentOverlay(document.getElementById("canvas-container") || editor.canvas.parentElement!, editor);
  setupCommentsPanel(document.getElementById("comments-panel")!, editor, commentOverlay);
  updateCommentsBadge(editor);
  window.addEventListener("comments-changed", () => updateCommentsBadge(editor));
  setupVariablesPanel(document.getElementById("variables-panel")!, editor);
  setupAssetPanel(document.getElementById("assets-panel")!, editor);
  setupBookmarksPanel(document.getElementById("bookmarks-panel")!, editor);
  setupAccessibilityPanel(document.getElementById("accessibility-panel")!, editor);

  // Migration assistant panel
  const migrationContainer = document.getElementById("migration-panel")!;
  const migrationPanel = createMigrationPanel((editor as any).engine, editor);
  migrationContainer.appendChild(migrationPanel.container);

  // Icon search panel
  const iconsContainer = document.getElementById("icons-panel")!;
  iconsContainer.appendChild(createIconSearchPanel(editor));

  // Templates panel
  const templatesContainer = document.getElementById("templates-panel")!;
  setupTemplatePanel(templatesContainer, editor);

  const artboardContainer = document.getElementById("artboards-panel")!;
  setupArtboardPresetsPanel(artboardContainer, editor);

  // Dependency graph panel
  const depGraphPanel = setupDependencyGraphPanel(document.getElementById("dependencies-panel")!, editor);

  // Permissions panel — init default owner user
  (editor as any).engine.perm_add_user("local", "Local User", "owner");
  const permPanel = document.getElementById("permissions-panel")!;
  renderPermissionsPanel(permPanel, editor);

  // Re-render permissions panel on selection change
  editor.onSelection(() => renderPermissionsPanel(permPanel, editor));

  // Component libraries panel
  initComponentLibrary(editor.engine, () => {
    renderComponentLibraryPanel(document.getElementById("libraries-panel")!);
  });
  renderComponentLibraryPanel(document.getElementById("libraries-panel")!);

  // Component docs panel
  const componentDocsPanel = createComponentDocsPanel(editor);
  document.getElementById("docs-panel")!.appendChild(componentDocsPanel.el);

  // Plugin system
  const pluginManager = new PluginManager(editor);
  (window as any).__pluginManager = pluginManager; // expose for external plugins
  setupMarketplacePanel(document.getElementById("plugins-panel")!, pluginManager, editor);
  // Register built-in plugins
  pluginManager.register(loremIpsumPlugin);
  pluginManager.register(colorPalettePlugin);
  pluginManager.register(GridGeneratorPlugin);
  pluginManager.register(AutoRenamePlugin);
  pluginManager.register(AccessibilityCheckerPlugin);
  // Auto-activate defaults
  pluginManager.activate("lorem-ipsum");
  pluginManager.activate("color-palette");

  // ── Collaboration ──────────────────────────────────────────────
  const collabClient = new CollabClient();
  collabClient.setCursorPresence(editor.cursorPresence);

  // Handle remote scene ops
  collabClient.setCallbacks({
    onRemoteSceneOp: (_userId, op) => {
      if (op.kind === "full_replace" && op.sceneData) {
        engine.import_scene(op.sceneData);
        editor.requestRender();
        editor.notifyLayersChanged();
      }
    },
    onFullSync: (sceneData) => {
      engine.import_scene(sceneData);
      editor.requestRender();
      editor.notifyLayersChanged();
    },
    onStatusChange: (status) => {
      updateCollabUI(status, collabClient.connectedUsers);
      if (status === "connected") {
        const data = engine.export_scene();
        if (data && data !== "{}") {
          collabClient.sendFullSync(data);
        }
      }
    },
    onUsersChange: (users) => {
      updateCollabUI(collabClient.connectionStatus, users);
    },
    onChat: (msg) => {
      editor.handleRemoteChat(msg.userId, msg.userName, msg.text, msg.x, msg.y);
    },
    onTyping: (userId, isTyping) => {
      editor.handleRemoteTyping(userId, isTyping);
    },
  });

  // Send cursor position on pointer move over canvas
  canvas.addEventListener("pointermove", (e) => {
    if (collabClient.connectionStatus === "connected") {
      const sx = engine.screen_to_scene_x(e.offsetX, e.offsetY);
      const sy = engine.screen_to_scene_y(e.offsetX, e.offsetY);
      collabClient.sendCursorMove(sx, sy, editor.currentTool);
    }
  });

  // Send selection changes
  editor.onSelection((ids) => {
    if (collabClient.connectionStatus === "connected") {
      collabClient.sendSelectionChange(ids);
    }
    componentDocsPanel.update();
  });

  // Broadcast scene changes on save
  editor.onSave(() => {
    if (collabClient.connectionStatus === "connected") {
      const data = engine.export_scene();
      if (data && data !== "{}") {
        collabClient.sendSceneOp({ kind: "full_replace", sceneData: data });
      }
    }
  });

  // Init collab UI
  initCollabUI(collabClient, {
    onConnect: (roomId, userName) => {
      collabClient.connect(roomId, userName);
    },
    onDisconnect: () => {
      collabClient.disconnect();
      updateCollabUI("disconnected", []);
    },
    onSpatialAudio: async () => {
      await editor.enableSpatialAudio();
      editor.toggleSpatialAudioPanel();
    },
  });

  // Right pane tab switching
  const rightPaneTabs = document.querySelectorAll(".right-pane-tab");
  const rightPaneContents = document.querySelectorAll(".right-pane-content");
  rightPaneTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = (tab as HTMLElement).dataset.tab!;
      rightPaneTabs.forEach((t) => t.classList.toggle("active", (t as HTMLElement).dataset.tab === target));
      const tabContentMap: Record<string, string> = { agent: "agent-panel", properties: "properties-panel", history: "history-panel", handoff: "handoff-panel", comments: "comments-panel", variables: "variables-panel", assets: "assets-panel", bookmarks: "bookmarks-panel", accessibility: "accessibility-panel", plugins: "plugins-panel", palette: "palette-panel", docs: "docs-panel", permissions: "permissions-panel", quiz: "quiz-panel", migration: "migration-panel", icons: "icons-panel", templates: "templates-panel", artboards: "artboards-panel", dependencies: "dependencies-panel", profiler: "profiler-panel" };
      rightPaneContents.forEach((c) => c.classList.toggle("active", c.id === tabContentMap[target]));
      if (target === "agent") {
        agentPanel.querySelector<HTMLInputElement>(".agent-input")?.focus();
      }
      if (target === "permissions") {
        renderPermissionsPanel(permPanel, editor);
      }
      if (target === "dependencies") {
        depGraphPanel.refresh();
      }
    });
  });

  // Keyboard shortcut: D to toggle design system
  window.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === "d" || e.key === "D") toggleDesignSystem();
    // Cmd+Shift+A → open Accessibility panel tab
    if ((e.key === "A" || e.key === "a") && (e.metaKey || e.ctrlKey) && e.shiftKey) {
      e.preventDefault();
      const accTab = document.querySelector('.right-pane-tab[data-tab="accessibility"]') as HTMLElement | null;
      if (accTab) accTab.click();
      return;
    }
    // Alt+T → toggle animation timeline
    if (e.key === "t" && e.altKey) { e.preventDefault(); animTimeline.toggle(); }
    // Cmd+Shift+Enter → presentation mode
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && e.shiftKey) {
      e.preventDefault();
      editor.openPresentationMode();
      return;
    }
    // Cmd+Alt+C → canvas comparison
    if (e.key === "c" && (e.metaKey || e.ctrlKey) && e.altKey) {
      e.preventDefault();
      editor.openCanvasComparison();
      return;
    }
    // Cmd+Enter or Ctrl+Enter → prototype mode
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      prototypeViewer.show();
    }
    // L → toggle node link arrows
    if (e.key === "l" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      editor.toggleNodeLinks();
    }
    // Cmd+Shift+E → export all mapped components
    if (e.key === "E" && (e.metaKey || e.ctrlKey) && e.shiftKey) {
      e.preventDefault();
      showExportAllModal(editor);
    }
    // Cmd+Shift+D → dependency graph tab
    if (e.key === "D" && (e.metaKey || e.ctrlKey) && e.shiftKey) {
      e.preventDefault();
      // Switch to dependencies tab
      rightPaneTabs.forEach((t) => t.classList.toggle("active", (t as HTMLElement).dataset.tab === "dependencies"));
      rightPaneContents.forEach((c) => c.classList.toggle("active", c.id === "dependencies-panel"));
      depGraphPanel.refresh();
    }
  });

  // ==========================================
  // Demo Scene — Component Examples (only if no saved session)
  // ==========================================
  if (!hadSavedSession) {

  // --- 1. Button Component ---
  const btnFrame = engine.add_frame(60, 60, 160, 48);
  engine.set_node_name(btnFrame, "Button");
  engine.set_fill_color(btnFrame, 79, 70, 229, 1.0); // indigo
  engine.set_corner_radius(btnFrame, 10);
  // Flex center layout
  engine.set_layout_mode(btnFrame, "flex");
  engine.set_align_items(btnFrame, "center");
  engine.set_justify_content(btnFrame, "center");
  const btnLabel = engine.add_text(0, 0, "Click Me", 16);
  engine.set_fill_color(btnLabel, 255, 255, 255, 1.0);
  engine.resize_node(btnLabel, 80, 20);
  engine.reparent_node(btnLabel, btnFrame);

  const btnCompId = engine.create_component(btnFrame, "Button");
  engine.add_variant_prop(btnCompId, "variant", '{"type":"string","options":["primary","secondary","danger"],"default":"primary"}');
  engine.add_variant_prop(btnCompId, "disabled", '{"type":"boolean","default":false}');

  // Button note
  engine.add_note(btnFrame, "# Button\n\nPrimary action button.\n\n## Variants\n- **primary**: indigo bg\n- **secondary**: gray bg\n- **danger**: red bg\n\n## Props\n- `disabled`: dims opacity to 50%\n- `variant`: changes color scheme", '["component","interactive"]');

  // Secondary variant frame
  const btn2Frame = engine.add_frame(60, 140, 160, 48);
  engine.set_node_name(btn2Frame, "Button / secondary");
  engine.set_fill_color(btn2Frame, 75, 85, 99, 1.0); // gray
  engine.set_corner_radius(btn2Frame, 10);
  engine.set_layout_mode(btn2Frame, "flex");
  engine.set_align_items(btn2Frame, "center");
  engine.set_justify_content(btn2Frame, "center");
  const btn2Label = engine.add_text(0, 0, "Secondary", 16);
  engine.set_fill_color(btn2Label, 255, 255, 255, 1.0);
  engine.resize_node(btn2Label, 90, 20);
  engine.reparent_node(btn2Label, btn2Frame);
  engine.add_variant(btnCompId, '{"variant":{"String":"secondary"},"disabled":{"Boolean":false}}', btn2Frame);

  // Danger variant frame
  const btn3Frame = engine.add_frame(60, 220, 160, 48);
  engine.set_node_name(btn3Frame, "Button / danger");
  engine.set_fill_color(btn3Frame, 220, 38, 38, 1.0); // red
  engine.set_corner_radius(btn3Frame, 10);
  engine.set_layout_mode(btn3Frame, "flex");
  engine.set_align_items(btn3Frame, "center");
  engine.set_justify_content(btn3Frame, "center");
  const btn3Label = engine.add_text(0, 0, "Delete", 16);
  engine.set_fill_color(btn3Label, 255, 255, 255, 1.0);
  engine.resize_node(btn3Label, 60, 20);
  engine.reparent_node(btn3Label, btn3Frame);
  engine.add_variant(btnCompId, '{"variant":{"String":"danger"},"disabled":{"Boolean":false}}', btn3Frame);

  // Button instances
  const btnInst1 = engine.create_instance(btnCompId, 300, 60);
  const btnInst2 = engine.create_instance(btnCompId, 300, 140);
  engine.set_instance_variant(btnInst2, '{"variant":{"String":"secondary"},"disabled":{"Boolean":false}}');
  const btnInst3 = engine.create_instance(btnCompId, 300, 220);
  engine.set_instance_variant(btnInst3, '{"variant":{"String":"danger"},"disabled":{"Boolean":false}}');

  // --- 2. Checkbox Component ---
  const cbFrame = engine.add_frame(60, 320, 180, 32);
  engine.set_node_name(cbFrame, "Checkbox");
  engine.set_fill_color(cbFrame, 0, 0, 0, 0.0); // transparent
  // Row layout with gap
  engine.set_layout_mode(cbFrame, "flex");
  engine.set_flex_direction(cbFrame, "row");
  engine.set_align_items(cbFrame, "center");
  engine.set_layout_gap(cbFrame, 8);

  // Box
  const cbBox = engine.add_rect(0, 0, 24, 24);
  engine.set_fill_color(cbBox, 51, 51, 51, 1.0);
  engine.set_corner_radius(cbBox, 6);
  engine.set_stroke(cbBox, 100, 100, 100, 1.0, 1.5);
  engine.reparent_node(cbBox, cbFrame);

  // Label
  const cbLabel = engine.add_text(0, 0, "Remember me", 14);
  engine.set_fill_color(cbLabel, 200, 200, 200, 1.0);
  engine.reparent_node(cbLabel, cbFrame);

  const cbCompId = engine.create_component(cbFrame, "Checkbox");
  engine.add_variant_prop(cbCompId, "checked", '{"type":"boolean","default":false}');

  engine.add_note(cbFrame, "# Checkbox\n\nToggleable checkbox with label.\n\n## States\n- **unchecked**: empty box, gray border\n- **checked**: indigo bg, white checkmark\n\n## Usage\n```\n<Checkbox checked={true} label=\"Accept terms\" />\n```", '["component","form"]');

  // Checked variant
  const cbCheckedFrame = engine.add_frame(60, 380, 180, 32);
  engine.set_node_name(cbCheckedFrame, "Checkbox / checked");
  engine.set_fill_color(cbCheckedFrame, 0, 0, 0, 0.0);
  engine.set_layout_mode(cbCheckedFrame, "flex");
  engine.set_flex_direction(cbCheckedFrame, "row");
  engine.set_align_items(cbCheckedFrame, "center");
  engine.set_layout_gap(cbCheckedFrame, 8);

  // Checked box (acts as container for checkmark)
  const cbCheckedBox = engine.add_frame(0, 0, 24, 24);
  engine.set_fill_color(cbCheckedBox, 79, 70, 229, 1.0); // indigo = checked
  engine.set_corner_radius(cbCheckedBox, 6);
  engine.set_layout_mode(cbCheckedBox, "flex");
  engine.set_align_items(cbCheckedBox, "center");
  engine.set_justify_content(cbCheckedBox, "center");
  engine.reparent_node(cbCheckedBox, cbCheckedFrame);

  const cbCheckmark = engine.add_text(0, 0, "✓", 16);
  engine.set_fill_color(cbCheckmark, 255, 255, 255, 1.0);
  engine.reparent_node(cbCheckmark, cbCheckedBox);

  const cbCheckedLabel = engine.add_text(0, 0, "Remember me", 14);
  engine.set_fill_color(cbCheckedLabel, 200, 200, 200, 1.0);
  engine.reparent_node(cbCheckedLabel, cbCheckedFrame);

  engine.add_variant(cbCompId, '{"checked":{"Boolean":true}}', cbCheckedFrame);

  // Checkbox instances
  const cbInst1 = engine.create_instance(cbCompId, 300, 320);
  const cbInst2 = engine.create_instance(cbCompId, 300, 380);
  engine.set_instance_variant(cbInst2, '{"checked":{"Boolean":true}}');

  // --- 3. Modal Component (with slot) ---
  const modalFrame = engine.add_frame(520, 60, 360, 240);
  engine.set_node_name(modalFrame, "Modal");
  engine.set_fill_color(modalFrame, 37, 37, 37, 1.0);
  engine.set_corner_radius(modalFrame, 16);
  engine.set_stroke(modalFrame, 60, 60, 60, 1.0, 1.0);
  // Column layout with padding
  engine.set_layout_mode(modalFrame, "flex");
  engine.set_flex_direction(modalFrame, "column");
  engine.set_layout_padding(modalFrame, 16, 20, 16, 20);
  engine.set_layout_gap(modalFrame, 12);

  // Title
  const modalTitle = engine.add_text(0, 0, "Dialog Title", 18);
  engine.set_fill_color(modalTitle, 230, 230, 230, 1.0);
  engine.reparent_node(modalTitle, modalFrame);

  // Divider
  const modalDiv = engine.add_rect(0, 0, 320, 1);
  engine.set_fill_color(modalDiv, 60, 60, 60, 1.0);
  engine.reparent_node(modalDiv, modalFrame);

  // Content slot placeholder
  const modalSlot = engine.add_frame(0, 0, 320, 100);
  engine.set_node_name(modalSlot, "content");
  engine.set_fill_color(modalSlot, 0, 0, 0, 0.0);
  engine.reparent_node(modalSlot, modalFrame);

  // Footer buttons area — flex row, end-aligned
  const modalFooter = engine.add_frame(540, 248, 320, 40);
  engine.set_node_name(modalFooter, "footer");
  engine.set_fill_color(modalFooter, 0, 0, 0, 0.0);
  engine.set_layout_mode(modalFooter, "flex");
  engine.set_flex_direction(modalFooter, "row");
  engine.set_justify_content(modalFooter, "end");
  engine.set_align_items(modalFooter, "center");
  engine.set_layout_gap(modalFooter, 12);
  engine.reparent_node(modalFooter, modalFrame);

  // Cancel button in footer — flex centered
  const cancelBtn = engine.add_frame(0, 0, 80, 32);
  engine.set_node_name(cancelBtn, "Cancel Btn");
  engine.set_fill_color(cancelBtn, 75, 85, 99, 1.0);
  engine.set_corner_radius(cancelBtn, 8);
  engine.set_layout_mode(cancelBtn, "flex");
  engine.set_align_items(cancelBtn, "center");
  engine.set_justify_content(cancelBtn, "center");
  engine.reparent_node(cancelBtn, modalFooter);
  const cancelLbl = engine.add_text(0, 0, "Cancel", 13);
  engine.set_fill_color(cancelLbl, 200, 200, 200, 1.0);
  engine.reparent_node(cancelLbl, cancelBtn);

  // Confirm button in footer — flex centered
  const confirmBtn = engine.add_frame(0, 0, 100, 32);
  engine.set_node_name(confirmBtn, "Confirm Btn");
  engine.set_fill_color(confirmBtn, 79, 70, 229, 1.0);
  engine.set_corner_radius(confirmBtn, 8);
  engine.set_layout_mode(confirmBtn, "flex");
  engine.set_align_items(confirmBtn, "center");
  engine.set_justify_content(confirmBtn, "center");
  engine.reparent_node(confirmBtn, modalFooter);
  const confirmLbl = engine.add_text(0, 0, "Confirm", 13);
  engine.set_fill_color(confirmLbl, 255, 255, 255, 1.0);
  engine.reparent_node(confirmLbl, confirmBtn);

  const modalCompId = engine.create_component(modalFrame, "Modal");
  engine.add_slot(modalCompId, "content", modalSlot);
  engine.add_slot(modalCompId, "footer", modalFooter);

  engine.add_note(modalFrame, "# Modal\n\nCentered dialog with customizable content.\n\n## Slots\n- **content**: main body area (320×100)\n- **footer**: action buttons area\n\n## Usage\n```\n<Modal title=\"Confirm\">\n  <slot name=\"content\">\n    <p>Are you sure?</p>\n  </slot>\n  <slot name=\"footer\">\n    <Button variant=\"secondary\">Cancel</Button>\n    <Button>Confirm</Button>\n  </slot>\n</Modal>\n```\n\n## Behavior\n- Escape key closes\n- Click backdrop closes\n- Focus trapped inside", '["component","overlay","slots"]');

  // Modal instance with custom content
  const modalInst = engine.create_instance(modalCompId, 520, 360);

  // Create content to fill into the slot
  const slotContent = engine.add_text(560, 490, "Are you sure you want to delete?", 14);
  engine.set_fill_color(slotContent, 170, 170, 170, 1.0);

  // Fill the content slot
  // Find the slot node in the instance and fill it
  // (The slot is a child of the instance)

  editor.requestRender();
  } // end if (!hadSavedSession)

  // Setup version history panel
  const historyContainer = document.getElementById("history-panel");
  if (historyContainer) {
    setupHistoryPanel(historyContainer, autoSave);
  }
}

main().catch(console.error);
