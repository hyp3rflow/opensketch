import { loadEngine } from "./wasm";
import { Editor } from "./editor";
import { setupToolbar } from "./ui/toolbar";
import { setupLayersPanel } from "./ui/layers-panel";
import { setupPropertiesPanel } from "./ui/properties-panel";
import { setupDesignSystemPanel } from "./ui/design-system";
import { setupAgentPanel } from "./ui/agent-panel";
import { setupNoteOverlay } from "./ui/note-overlay";

async function main() {
  const wasm = await loadEngine();
  const canvas = document.getElementById("canvas") as HTMLCanvasElement;
  const rect = canvas.getBoundingClientRect();
  const engine = new wasm.Engine(rect.width, rect.height);

  const editor = new Editor(engine, canvas);

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
    if (mode === "dev") editor.setTool("select");
    // Toggle note overlay
    noteOverlay.setEnabled(mode === "dev");
  });

  // Left panel = layers only
  setupLayersPanel(document.getElementById("layers-panel")!, editor);

  // Right panel = properties
  setupPropertiesPanel(document.getElementById("properties-panel")!, editor);

  // Note overlay (positioned over canvas)
  const noteOverlay = setupNoteOverlay(document.getElementById("workspace")!, editor);

  // Design system inside modal
  setupDesignSystemPanel(document.getElementById("design-system-panel")!, editor);

  // Agent panel
  const agentPanel = document.getElementById("agent-panel")!;
  const agentToggle = document.getElementById("agent-toggle")!;
  setupAgentPanel(agentPanel, editor);

  agentToggle.addEventListener("click", () => {
    const isOpen = agentPanel.classList.toggle("open");
    agentToggle.classList.toggle("active", isOpen);
    if (isOpen) {
      agentPanel.querySelector<HTMLInputElement>(".agent-input")?.focus();
    }
  });

  // Keyboard shortcut: D to toggle design system
  window.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === "d" || e.key === "D") toggleDesignSystem();
  });

  // ==========================================
  // Demo Scene — Component Examples
  // ==========================================

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

  // Box
  const cbBox = engine.add_rect(68, 324, 24, 24);
  engine.set_fill_color(cbBox, 51, 51, 51, 1.0);
  engine.set_corner_radius(cbBox, 6);
  engine.set_stroke(cbBox, 100, 100, 100, 1.0, 1.5);
  engine.reparent_node(cbBox, cbFrame);

  // Label
  const cbLabel = engine.add_text(100, 326, "Remember me", 14);
  engine.set_fill_color(cbLabel, 200, 200, 200, 1.0);
  engine.reparent_node(cbLabel, cbFrame);

  const cbCompId = engine.create_component(cbFrame, "Checkbox");
  engine.add_variant_prop(cbCompId, "checked", '{"type":"boolean","default":false}');

  engine.add_note(cbFrame, "# Checkbox\n\nToggleable checkbox with label.\n\n## States\n- **unchecked**: empty box, gray border\n- **checked**: indigo bg, white checkmark\n\n## Usage\n```\n<Checkbox checked={true} label=\"Accept terms\" />\n```", '["component","form"]');

  // Checked variant
  const cbCheckedFrame = engine.add_frame(60, 380, 180, 32);
  engine.set_node_name(cbCheckedFrame, "Checkbox / checked");
  engine.set_fill_color(cbCheckedFrame, 0, 0, 0, 0.0);

  const cbCheckedBox = engine.add_rect(68, 384, 24, 24);
  engine.set_fill_color(cbCheckedBox, 79, 70, 229, 1.0); // indigo = checked
  engine.set_corner_radius(cbCheckedBox, 6);
  engine.reparent_node(cbCheckedBox, cbCheckedFrame);

  const cbCheckmark = engine.add_text(72, 384, "✓", 16);
  engine.set_fill_color(cbCheckmark, 255, 255, 255, 1.0);
  engine.reparent_node(cbCheckmark, cbCheckedFrame);

  const cbCheckedLabel = engine.add_text(100, 386, "Remember me", 14);
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

  // Title
  const modalTitle = engine.add_text(540, 80, "Dialog Title", 18);
  engine.set_fill_color(modalTitle, 230, 230, 230, 1.0);
  engine.reparent_node(modalTitle, modalFrame);

  // Divider
  const modalDiv = engine.add_rect(520, 112, 360, 1);
  engine.set_fill_color(modalDiv, 60, 60, 60, 1.0);
  engine.reparent_node(modalDiv, modalFrame);

  // Content slot placeholder
  const modalSlot = engine.add_frame(540, 124, 320, 100);
  engine.set_node_name(modalSlot, "content");
  engine.set_fill_color(modalSlot, 0, 0, 0, 0.0);
  engine.reparent_node(modalSlot, modalFrame);

  // Footer buttons area
  const modalFooter = engine.add_frame(540, 248, 320, 40);
  engine.set_node_name(modalFooter, "footer");
  engine.set_fill_color(modalFooter, 0, 0, 0, 0.0);
  engine.reparent_node(modalFooter, modalFrame);

  // Cancel button in footer
  const cancelBtn = engine.add_rect(640, 252, 80, 32);
  engine.set_fill_color(cancelBtn, 75, 85, 99, 1.0);
  engine.set_corner_radius(cancelBtn, 8);
  engine.reparent_node(cancelBtn, modalFooter);
  const cancelLbl = engine.add_text(655, 258, "Cancel", 13);
  engine.set_fill_color(cancelLbl, 200, 200, 200, 1.0);
  engine.reparent_node(cancelLbl, modalFooter);

  // Confirm button in footer
  const confirmBtn = engine.add_rect(740, 252, 100, 32);
  engine.set_fill_color(confirmBtn, 79, 70, 229, 1.0);
  engine.set_corner_radius(confirmBtn, 8);
  engine.reparent_node(confirmBtn, modalFooter);
  const confirmLbl = engine.add_text(755, 258, "Confirm", 13);
  engine.set_fill_color(confirmLbl, 255, 255, 255, 1.0);
  engine.reparent_node(confirmLbl, modalFooter);

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
}

main().catch(console.error);
