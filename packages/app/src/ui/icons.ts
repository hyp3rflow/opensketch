// Inline SVG icons (Lucide-inspired, MIT)
// Each returns an SVG string at 18x18

const s = (d: string, extra = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${extra}>${d}</svg>`;

export const icons = {
  // Toolbar
  select: s('<path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51z"/><path d="M13 13l6 6"/>'),
  hand: s('<path d="M18 11V6a2 2 0 0 0-4 0v1"/><path d="M14 10V4a2 2 0 0 0-4 0v2"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>'),
  rect: s('<rect x="3" y="3" width="18" height="18" rx="2"/>'),
  ellipse: s('<circle cx="12" cy="12" r="10"/>'),
  text: s('<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>'),
  frame: s('<rect x="2" y="2" width="20" height="20" rx="0" stroke-dasharray="4 2"/>'),

  // Properties panel
  cursor: s('<path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51z"/>'),
  rotation: s('<path d="M21 12a9 9 0 1 1-9-9"/><polyline points="21 3 21 9 15 9"/>'),
  cornerRadius: s('<path d="M12 3h6a3 3 0 0 1 3 3v6"/><path d="M3 12v-6a3 3 0 0 1 3-3h6"/>'),
  opacity: s('<circle cx="12" cy="12" r="10" stroke-width="1.5"/><path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor" stroke="none"/>'),
  strokeWidth: s('<line x1="3" y1="12" x2="21" y2="12" stroke-width="3"/>'),
  fontSize: s('<polyline points="4 7 4 4 20 4 20 7"/><line x1="12" y1="4" x2="12" y2="20"/>'),
  // Layers
  eye: s('<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: s('<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><line x1="2" y1="2" x2="22" y2="22"/>'),
  // Design system (palette icon)
  palette: s('<circle cx="13.5" cy="6.5" r="0.5" fill="currentColor"/><circle cx="17.5" cy="10.5" r="0.5" fill="currentColor"/><circle cx="8.5" cy="7.5" r="0.5" fill="currentColor"/><circle cx="6.5" cy="12" r="0.5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>'),
  // Code/dev mode
  code: s('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>'),
  // Edit/pen mode
  pen: s('<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>'),
  // Component (diamond)
  component: s('<path d="M12 2l10 10-10 10L2 12z"/>'),
  // Instance (diamond outline)
  instance: s('<path d="M12 2l10 10-10 10L2 12z" fill="none"/>'),
  // Slot (grid/plus in box)
  slot: s('<rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="4 2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>'),
  // Note (file-text)
  note: s('<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>'),
  // Robot/agent
  robot: s('<rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="11"/><line x1="8" y1="16" x2="8" y2="16" stroke-width="3" stroke-linecap="round"/><line x1="16" y1="16" x2="16" y2="16" stroke-width="3" stroke-linecap="round"/>'),
};
