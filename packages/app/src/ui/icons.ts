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
  penTool: s('<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/>'),
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
  // Layout
  arrowRight: s('<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>'),
  arrowDown: s('<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>'),
  wrap: s('<path d="M3 6h18"/><path d="M3 12h15a3 3 0 1 1 0 6H9"/><polyline points="12 15 9 18 12 21"/>'),
  spaceBetween: s('<rect x="3" y="5" width="4" height="14" rx="1"/><rect x="17" y="5" width="4" height="14" rx="1"/>'),
  packed: s('<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>'),
  // Alignment
  alignLeft: s('<line x1="4" y1="3" x2="4" y2="21"/><rect x="4" y="5" width="12" height="4" rx="1"/><rect x="4" y="13" width="8" height="4" rx="1"/>'),
  alignCenterH: s('<line x1="12" y1="3" x2="12" y2="21"/><rect x="6" y="5" width="12" height="4" rx="1"/><rect x="8" y="13" width="8" height="4" rx="1"/>'),
  alignRight: s('<line x1="20" y1="3" x2="20" y2="21"/><rect x="8" y="5" width="12" height="4" rx="1"/><rect x="12" y="13" width="8" height="4" rx="1"/>'),
  alignTop: s('<line x1="3" y1="4" x2="21" y2="4"/><rect x="5" y="4" width="4" height="12" rx="1"/><rect x="13" y="4" width="4" height="8" rx="1"/>'),
  alignCenterV: s('<line x1="3" y1="12" x2="21" y2="12"/><rect x="5" y="6" width="4" height="12" rx="1"/><rect x="13" y="8" width="4" height="8" rx="1"/>'),
  alignBottom: s('<line x1="3" y1="20" x2="21" y2="20"/><rect x="5" y="8" width="4" height="12" rx="1"/><rect x="13" y="12" width="4" height="8" rx="1"/>'),
  distributeH: s('<line x1="4" y1="3" x2="4" y2="21"/><line x1="20" y1="3" x2="20" y2="21"/><rect x="8" y="6" width="8" height="12" rx="1"/>'),
  distributeV: s('<line x1="3" y1="4" x2="21" y2="4"/><line x1="3" y1="20" x2="21" y2="20"/><rect x="6" y="8" width="12" height="8" rx="1"/>'),
  plus: s('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'),
  minus: s('<line x1="5" y1="12" x2="19" y2="12"/>'),
  paddingAll: s('<rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="3 2"/><rect x="7" y="7" width="10" height="10" rx="1"/>'),
  gapIcon: s('<rect x="3" y="4" width="7" height="16" rx="1"/><rect x="14" y="4" width="7" height="16" rx="1"/>'),
  star: s('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'),
  polygon: s('<path d="M12 2l9.5 7-3.6 11H6.1L2.5 9z"/>'),
  download: s('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
  image: s('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>'),
  // Boolean operations
  boolUnion: s('<rect x="3" y="5" width="10" height="10" rx="1" fill="currentColor" stroke="none"/><rect x="9" y="9" width="10" height="10" rx="1" fill="currentColor" stroke="none"/><rect x="3" y="5" width="10" height="10" rx="1" fill="none"/><rect x="9" y="9" width="10" height="10" rx="1" fill="none"/>'),
  boolSubtract: s('<rect x="3" y="5" width="10" height="10" rx="1" fill="currentColor" stroke="none"/><rect x="9" y="9" width="10" height="10" rx="1" fill="none" stroke="currentColor" stroke-dasharray="2 1"/>'),
  boolIntersect: s('<rect x="3" y="5" width="10" height="10" rx="1" fill="none"/><rect x="9" y="9" width="10" height="10" rx="1" fill="none"/><rect x="9" y="9" width="4" height="6" rx="0" fill="currentColor" stroke="none"/>'),
  boolExclude: s('<rect x="3" y="5" width="10" height="10" rx="1" fill="currentColor" stroke="none"/><rect x="9" y="9" width="10" height="10" rx="1" fill="currentColor" stroke="none"/><rect x="9" y="9" width="4" height="6" rx="0" fill="var(--bg-primary, #1e1e2e)" stroke="none"/>'),
  flatten: s('<path d="M4 4h6v6H4z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="15" cy="15" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M12 19l-2 2M19 12l2-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M7 17L4 20" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'),
  play: s('<polygon points="5,3 19,12 5,21" fill="currentColor" stroke="none"/>'),
  section: s('<rect x="3" y="6" width="18" height="15" rx="3" stroke-dasharray="0"/><line x1="3" y1="3" x2="14" y2="3" stroke-width="2.5" stroke-linecap="round"/>'),
  responsive: s('<rect x="2" y="4" width="8" height="14" rx="1" fill="none"/><rect x="12" y="6" width="10" height="12" rx="1" fill="none"/><line x1="4" y1="16" x2="8" y2="16" stroke-linecap="round"/><line x1="15" y1="16" x2="19" y2="16" stroke-linecap="round"/>'),
  slice: s('<rect x="4" y="4" width="16" height="16" rx="1" stroke-dasharray="3 2" fill="none"/><path d="M2 8 L4 8 M2 12 L4 12 M2 16 L4 16 M20 8 L22 8 M20 12 L22 12 M20 16 L22 16 M8 2 L8 4 M12 2 L12 4 M16 2 L16 4 M8 20 L8 22 M12 20 L12 22 M16 20 L16 22" stroke-linecap="round"/>'),
  connector: s('<circle cx="5" cy="5" r="2" fill="currentColor" stroke="none"/><circle cx="19" cy="19" r="2" fill="currentColor" stroke="none"/><path d="M7 7 L17 17"/><path d="M14 17 L17 17 L17 14"/>'),
  table: s('<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>'),
  stickyNote: s('<rect x="3" y="3" width="18" height="18" rx="2" fill="none"/><path d="M15 3v6h6" fill="none"/><line x1="7" y1="9" x2="13" y2="9"/><line x1="7" y1="13" x2="11" y2="13"/>'),
  users: s('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
  tokens: s('<circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/><path d="M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" opacity="0.5"/>'),
  freehand: s('<path d="M3 17c1-2 3-6 5-6s3 4 5 4 3-5 5-5 3 3 3 3"/>'),
  whiteboard: s('<rect x="2" y="3" width="20" height="18" rx="2"/><circle cx="7" cy="8" r="1.5" fill="currentColor" stroke="none"/><path d="M5 14c1-1 2-2 3-2s2 1 3 1 2-2 3-2" stroke-width="1.5"/><rect x="14" y="7" width="6" height="5" rx="1" fill="none"/>'),
  timer: s('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M10 2h4"/><path d="M12 2v2"/>'),
  vote: s('<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="8"/>'),
  mic: s('<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/>'),
};
