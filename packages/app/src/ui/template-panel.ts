/**
 * Smart Layout Templates — pre-defined and custom layout templates
 * One-click insertion of Card, Navigation, Hero, Form, etc.
 * Custom template save (selection → template) / load
 */

import type { Editor } from "../editor";

// ============================================================
// Types
// ============================================================

export interface TemplateNode {
  kind: "rect" | "ellipse" | "text" | "frame" | "image" | "star" | "polygon";
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string; // hex
  opacity?: number;
  cornerRadius?: number;
  text?: string;
  fontSize?: number;
  fontWeight?: number;
  fontFamily?: string;
  textAlign?: "Left" | "Center" | "Right";
  fillColor?: { r: number; g: number; b: number; a: number };
  stroke?: { r: number; g: number; b: number; a: number; width: number };
  children?: TemplateNode[];
  layout?: {
    mode: "Flex" | "Grid";
    direction?: "Row" | "Column";
    gap?: number;
    padding?: [number, number, number, number];
    alignItems?: string;
    justifyContent?: string;
    wrap?: boolean;
    gridColumns?: number;
  };
}

export interface LayoutTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
  icon: string; // SVG path or emoji
  nodes: TemplateNode[];
  builtIn: boolean;
  createdAt?: number;
}

export type TemplateCategory =
  | "Cards"
  | "Navigation"
  | "Hero"
  | "Forms"
  | "Lists"
  | "Footers"
  | "Modals"
  | "Custom";

// ============================================================
// Color helpers
// ============================================================

function hexToRGBA(hex: string, a = 1.0): { r: number; g: number; b: number; a: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
    a,
  };
}

const C = {
  white: hexToRGBA("#ffffff"),
  bg: hexToRGBA("#1a1a2e"),
  bgLight: hexToRGBA("#2d2d44"),
  accent: hexToRGBA("#6366f1"),
  accentLight: hexToRGBA("#818cf8"),
  text: hexToRGBA("#e2e8f0"),
  textMuted: hexToRGBA("#94a3b8"),
  border: hexToRGBA("#3d3d5c"),
  success: hexToRGBA("#22c55e"),
  danger: hexToRGBA("#ef4444"),
  warning: hexToRGBA("#f59e0b"),
  transparent: hexToRGBA("#000000", 0),
  cardBg: hexToRGBA("#252540"),
  inputBg: hexToRGBA("#1e1e36"),
};

// ============================================================
// Built-in Templates
// ============================================================

const BUILTIN_TEMPLATES: LayoutTemplate[] = [
  // --- Cards ---
  {
    id: "card-basic",
    name: "Basic Card",
    category: "Cards",
    description: "Simple card with image, title, and description",
    icon: "📋",
    builtIn: true,
    nodes: [
      {
        kind: "frame",
        name: "Card",
        x: 0, y: 0, w: 320, h: 360,
        fillColor: C.cardBg,
        cornerRadius: 12,
        layout: { mode: "Flex", direction: "Column", gap: 0, padding: [0, 0, 0, 0] },
        children: [
          { kind: "rect", name: "Card Image", x: 0, y: 0, w: 320, h: 180, fillColor: C.bgLight, cornerRadius: 0 },
          {
            kind: "frame", name: "Card Content", x: 0, y: 0, w: 320, h: 180,
            fillColor: C.transparent,
            layout: { mode: "Flex", direction: "Column", gap: 8, padding: [16, 16, 16, 16] },
            children: [
              { kind: "text", name: "Card Title", x: 0, y: 0, w: 288, h: 28, text: "Card Title", fontSize: 20, fontWeight: 700, fillColor: C.text },
              { kind: "text", name: "Card Description", x: 0, y: 0, w: 288, h: 40, text: "This is a short description for the card component.", fontSize: 14, fontWeight: 400, fillColor: C.textMuted },
              {
                kind: "frame", name: "Card Button", x: 0, y: 0, w: 120, h: 36,
                fillColor: C.accent, cornerRadius: 8,
                layout: { mode: "Flex", direction: "Row", gap: 0, padding: [8, 16, 8, 16], alignItems: "center", justifyContent: "center" },
                children: [
                  { kind: "text", name: "Button Label", x: 0, y: 0, w: 80, h: 20, text: "Learn More", fontSize: 14, fontWeight: 600, fillColor: C.white },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "card-profile",
    name: "Profile Card",
    category: "Cards",
    description: "User profile card with avatar and stats",
    icon: "👤",
    builtIn: true,
    nodes: [
      {
        kind: "frame", name: "Profile Card", x: 0, y: 0, w: 300, h: 320,
        fillColor: C.cardBg, cornerRadius: 16,
        layout: { mode: "Flex", direction: "Column", gap: 16, padding: [24, 24, 24, 24], alignItems: "center" },
        children: [
          { kind: "ellipse", name: "Avatar", x: 0, y: 0, w: 80, h: 80, fillColor: C.accent },
          { kind: "text", name: "User Name", x: 0, y: 0, w: 200, h: 24, text: "Jane Cooper", fontSize: 18, fontWeight: 700, fillColor: C.text, textAlign: "Center" },
          { kind: "text", name: "User Role", x: 0, y: 0, w: 200, h: 20, text: "Product Designer", fontSize: 14, fontWeight: 400, fillColor: C.textMuted, textAlign: "Center" },
          {
            kind: "frame", name: "Stats Row", x: 0, y: 0, w: 252, h: 60,
            fillColor: C.transparent,
            layout: { mode: "Flex", direction: "Row", gap: 24, padding: [12, 0, 0, 0], justifyContent: "center" },
            children: [
              {
                kind: "frame", name: "Stat", x: 0, y: 0, w: 60, h: 48, fillColor: C.transparent,
                layout: { mode: "Flex", direction: "Column", gap: 4, alignItems: "center" },
                children: [
                  { kind: "text", name: "Stat Value", x: 0, y: 0, w: 60, h: 24, text: "128", fontSize: 18, fontWeight: 700, fillColor: C.text, textAlign: "Center" },
                  { kind: "text", name: "Stat Label", x: 0, y: 0, w: 60, h: 16, text: "Projects", fontSize: 12, fontWeight: 400, fillColor: C.textMuted, textAlign: "Center" },
                ],
              },
              {
                kind: "frame", name: "Stat", x: 0, y: 0, w: 60, h: 48, fillColor: C.transparent,
                layout: { mode: "Flex", direction: "Column", gap: 4, alignItems: "center" },
                children: [
                  { kind: "text", name: "Stat Value", x: 0, y: 0, w: 60, h: 24, text: "1.2k", fontSize: 18, fontWeight: 700, fillColor: C.text, textAlign: "Center" },
                  { kind: "text", name: "Stat Label", x: 0, y: 0, w: 60, h: 16, text: "Followers", fontSize: 12, fontWeight: 400, fillColor: C.textMuted, textAlign: "Center" },
                ],
              },
              {
                kind: "frame", name: "Stat", x: 0, y: 0, w: 60, h: 48, fillColor: C.transparent,
                layout: { mode: "Flex", direction: "Column", gap: 4, alignItems: "center" },
                children: [
                  { kind: "text", name: "Stat Value", x: 0, y: 0, w: 60, h: 24, text: "56", fontSize: 18, fontWeight: 700, fillColor: C.text, textAlign: "Center" },
                  { kind: "text", name: "Stat Label", x: 0, y: 0, w: 60, h: 16, text: "Reviews", fontSize: 12, fontWeight: 400, fillColor: C.textMuted, textAlign: "Center" },
                ],
              },
            ],
          },
        ],
      },
    ],
  },

  // --- Navigation ---
  {
    id: "nav-topbar",
    name: "Top Navigation",
    category: "Navigation",
    description: "Horizontal top navigation bar with logo and links",
    icon: "🧭",
    builtIn: true,
    nodes: [
      {
        kind: "frame", name: "Top Nav", x: 0, y: 0, w: 1280, h: 64,
        fillColor: C.bg, cornerRadius: 0,
        layout: { mode: "Flex", direction: "Row", gap: 0, padding: [0, 24, 0, 24], alignItems: "center", justifyContent: "between" },
        children: [
          {
            kind: "frame", name: "Nav Left", x: 0, y: 0, w: 200, h: 40,
            fillColor: C.transparent,
            layout: { mode: "Flex", direction: "Row", gap: 12, alignItems: "center" },
            children: [
              { kind: "rect", name: "Logo", x: 0, y: 0, w: 32, h: 32, fillColor: C.accent, cornerRadius: 8 },
              { kind: "text", name: "Brand", x: 0, y: 0, w: 120, h: 24, text: "OpenSketch", fontSize: 18, fontWeight: 700, fillColor: C.text },
            ],
          },
          {
            kind: "frame", name: "Nav Links", x: 0, y: 0, w: 400, h: 40,
            fillColor: C.transparent,
            layout: { mode: "Flex", direction: "Row", gap: 32, alignItems: "center", justifyContent: "center" },
            children: [
              { kind: "text", name: "Link 1", x: 0, y: 0, w: 60, h: 20, text: "Home", fontSize: 14, fontWeight: 500, fillColor: C.text },
              { kind: "text", name: "Link 2", x: 0, y: 0, w: 70, h: 20, text: "Features", fontSize: 14, fontWeight: 500, fillColor: C.textMuted },
              { kind: "text", name: "Link 3", x: 0, y: 0, w: 60, h: 20, text: "Pricing", fontSize: 14, fontWeight: 500, fillColor: C.textMuted },
              { kind: "text", name: "Link 4", x: 0, y: 0, w: 60, h: 20, text: "About", fontSize: 14, fontWeight: 500, fillColor: C.textMuted },
            ],
          },
          {
            kind: "frame", name: "Nav CTA", x: 0, y: 0, w: 120, h: 36,
            fillColor: C.accent, cornerRadius: 8,
            layout: { mode: "Flex", direction: "Row", gap: 0, padding: [8, 16, 8, 16], alignItems: "center", justifyContent: "center" },
            children: [
              { kind: "text", name: "CTA Label", x: 0, y: 0, w: 80, h: 20, text: "Sign Up", fontSize: 14, fontWeight: 600, fillColor: C.white },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "nav-sidebar",
    name: "Sidebar Navigation",
    category: "Navigation",
    description: "Vertical sidebar navigation with icons",
    icon: "📑",
    builtIn: true,
    nodes: [
      {
        kind: "frame", name: "Sidebar", x: 0, y: 0, w: 240, h: 600,
        fillColor: C.bg, cornerRadius: 0,
        layout: { mode: "Flex", direction: "Column", gap: 4, padding: [16, 12, 16, 12] },
        children: [
          { kind: "text", name: "Brand", x: 0, y: 0, w: 216, h: 32, text: "Dashboard", fontSize: 20, fontWeight: 700, fillColor: C.text },
          { kind: "rect", name: "Divider", x: 0, y: 0, w: 216, h: 1, fillColor: C.border },
          ...(["Home", "Analytics", "Projects", "Team", "Settings"].map((label, i) => ({
            kind: "frame" as const, name: `Nav Item ${i + 1}`, x: 0, y: 0, w: 216, h: 40,
            fillColor: i === 0 ? hexToRGBA("#6366f1", 0.15) : C.transparent, cornerRadius: 8,
            layout: { mode: "Flex" as const, direction: "Row" as const, gap: 12, padding: [8, 12, 8, 12] as [number, number, number, number], alignItems: "center" },
            children: [
              { kind: "rect" as const, name: "Icon", x: 0, y: 0, w: 20, h: 20, fillColor: i === 0 ? C.accent : C.textMuted, cornerRadius: 4 },
              { kind: "text" as const, name: label, x: 0, y: 0, w: 160, h: 20, text: label, fontSize: 14, fontWeight: i === 0 ? 600 : 400, fillColor: i === 0 ? C.text : C.textMuted },
            ],
          }))),
        ],
      },
    ],
  },

  // --- Hero ---
  {
    id: "hero-centered",
    name: "Centered Hero",
    category: "Hero",
    description: "Full-width hero with centered heading and CTA",
    icon: "🌟",
    builtIn: true,
    nodes: [
      {
        kind: "frame", name: "Hero Section", x: 0, y: 0, w: 1280, h: 560,
        fillColor: C.bg, cornerRadius: 0,
        layout: { mode: "Flex", direction: "Column", gap: 24, padding: [80, 120, 80, 120], alignItems: "center", justifyContent: "center" },
        children: [
          { kind: "text", name: "Hero Badge", x: 0, y: 0, w: 200, h: 24, text: "✨ New Release v2.0", fontSize: 14, fontWeight: 500, fillColor: C.accentLight, textAlign: "Center" },
          { kind: "text", name: "Hero Title", x: 0, y: 0, w: 800, h: 96, text: "Design at the speed\nof thought", fontSize: 56, fontWeight: 800, fillColor: C.text, textAlign: "Center" },
          { kind: "text", name: "Hero Subtitle", x: 0, y: 0, w: 600, h: 48, text: "The modern design tool that helps you create beautiful interfaces faster than ever before.", fontSize: 18, fontWeight: 400, fillColor: C.textMuted, textAlign: "Center" },
          {
            kind: "frame", name: "CTA Row", x: 0, y: 0, w: 320, h: 48,
            fillColor: C.transparent,
            layout: { mode: "Flex", direction: "Row", gap: 16, alignItems: "center", justifyContent: "center" },
            children: [
              {
                kind: "frame", name: "Primary CTA", x: 0, y: 0, w: 140, h: 48,
                fillColor: C.accent, cornerRadius: 10,
                layout: { mode: "Flex", direction: "Row", gap: 0, padding: [12, 24, 12, 24], alignItems: "center", justifyContent: "center" },
                children: [
                  { kind: "text", name: "CTA Label", x: 0, y: 0, w: 100, h: 20, text: "Get Started", fontSize: 16, fontWeight: 600, fillColor: C.white },
                ],
              },
              {
                kind: "frame", name: "Secondary CTA", x: 0, y: 0, w: 140, h: 48,
                fillColor: C.transparent, cornerRadius: 10,
                stroke: { ...C.border, width: 1.5 },
                layout: { mode: "Flex", direction: "Row", gap: 0, padding: [12, 24, 12, 24], alignItems: "center", justifyContent: "center" },
                children: [
                  { kind: "text", name: "CTA Label", x: 0, y: 0, w: 100, h: 20, text: "Learn More", fontSize: 16, fontWeight: 500, fillColor: C.text },
                ],
              },
            ],
          },
        ],
      },
    ],
  },

  // --- Forms ---
  {
    id: "form-login",
    name: "Login Form",
    category: "Forms",
    description: "Sign-in form with email, password, and button",
    icon: "🔐",
    builtIn: true,
    nodes: [
      {
        kind: "frame", name: "Login Form", x: 0, y: 0, w: 400, h: 440,
        fillColor: C.cardBg, cornerRadius: 16,
        layout: { mode: "Flex", direction: "Column", gap: 20, padding: [32, 32, 32, 32] },
        children: [
          { kind: "text", name: "Form Title", x: 0, y: 0, w: 336, h: 32, text: "Welcome back", fontSize: 24, fontWeight: 700, fillColor: C.text },
          { kind: "text", name: "Form Subtitle", x: 0, y: 0, w: 336, h: 20, text: "Sign in to your account", fontSize: 14, fontWeight: 400, fillColor: C.textMuted },
          ...(["Email", "Password"].map((label) => ({
            kind: "frame" as const, name: `${label} Field`, x: 0, y: 0, w: 336, h: 68,
            fillColor: C.transparent,
            layout: { mode: "Flex" as const, direction: "Column" as const, gap: 6, padding: [0, 0, 0, 0] as [number, number, number, number] },
            children: [
              { kind: "text" as const, name: `${label} Label`, x: 0, y: 0, w: 336, h: 18, text: label, fontSize: 13, fontWeight: 500, fillColor: C.textMuted },
              {
                kind: "frame" as const, name: `${label} Input`, x: 0, y: 0, w: 336, h: 44,
                fillColor: C.inputBg, cornerRadius: 8,
                stroke: { ...C.border, width: 1 },
                layout: { mode: "Flex" as const, direction: "Row" as const, gap: 0, padding: [12, 14, 12, 14] as [number, number, number, number], alignItems: "center" },
                children: [
                  { kind: "text" as const, name: "Placeholder", x: 0, y: 0, w: 280, h: 18, text: label === "Email" ? "you@example.com" : "••••••••", fontSize: 14, fontWeight: 400, fillColor: hexToRGBA("#64748b") },
                ],
              },
            ],
          }))),
          {
            kind: "frame", name: "Sign In Button", x: 0, y: 0, w: 336, h: 44,
            fillColor: C.accent, cornerRadius: 8,
            layout: { mode: "Flex", direction: "Row", gap: 0, padding: [12, 24, 12, 24], alignItems: "center", justifyContent: "center" },
            children: [
              { kind: "text", name: "Button Label", x: 0, y: 0, w: 100, h: 20, text: "Sign In", fontSize: 15, fontWeight: 600, fillColor: C.white },
            ],
          },
          { kind: "text", name: "Forgot Link", x: 0, y: 0, w: 336, h: 18, text: "Forgot your password?", fontSize: 13, fontWeight: 400, fillColor: C.accentLight, textAlign: "Center" },
        ],
      },
    ],
  },
  {
    id: "form-contact",
    name: "Contact Form",
    category: "Forms",
    description: "Contact form with name, email, message, and submit",
    icon: "✉️",
    builtIn: true,
    nodes: [
      {
        kind: "frame", name: "Contact Form", x: 0, y: 0, w: 480, h: 520,
        fillColor: C.cardBg, cornerRadius: 16,
        layout: { mode: "Flex", direction: "Column", gap: 16, padding: [32, 32, 32, 32] },
        children: [
          { kind: "text", name: "Title", x: 0, y: 0, w: 416, h: 28, text: "Get in Touch", fontSize: 22, fontWeight: 700, fillColor: C.text },
          ...(["Full Name", "Email Address"].map((label) => ({
            kind: "frame" as const, name: `${label} Field`, x: 0, y: 0, w: 416, h: 68,
            fillColor: C.transparent,
            layout: { mode: "Flex" as const, direction: "Column" as const, gap: 6, padding: [0, 0, 0, 0] as [number, number, number, number] },
            children: [
              { kind: "text" as const, name: `${label} Label`, x: 0, y: 0, w: 416, h: 18, text: label, fontSize: 13, fontWeight: 500, fillColor: C.textMuted },
              {
                kind: "frame" as const, name: `${label} Input`, x: 0, y: 0, w: 416, h: 44,
                fillColor: C.inputBg, cornerRadius: 8, stroke: { ...C.border, width: 1 },
                layout: { mode: "Flex" as const, direction: "Row" as const, gap: 0, padding: [12, 14, 12, 14] as [number, number, number, number], alignItems: "center" },
                children: [
                  { kind: "text" as const, name: "Placeholder", x: 0, y: 0, w: 380, h: 18, text: `Enter ${label.toLowerCase()}`, fontSize: 14, fontWeight: 400, fillColor: hexToRGBA("#64748b") },
                ],
              },
            ],
          }))),
          {
            kind: "frame", name: "Message Field", x: 0, y: 0, w: 416, h: 130,
            fillColor: C.transparent,
            layout: { mode: "Flex", direction: "Column", gap: 6, padding: [0, 0, 0, 0] },
            children: [
              { kind: "text", name: "Message Label", x: 0, y: 0, w: 416, h: 18, text: "Message", fontSize: 13, fontWeight: 500, fillColor: C.textMuted },
              {
                kind: "frame", name: "Message Input", x: 0, y: 0, w: 416, h: 100,
                fillColor: C.inputBg, cornerRadius: 8, stroke: { ...C.border, width: 1 },
                layout: { mode: "Flex", direction: "Row", gap: 0, padding: [12, 14, 12, 14] },
                children: [
                  { kind: "text", name: "Placeholder", x: 0, y: 0, w: 380, h: 18, text: "Write your message…", fontSize: 14, fontWeight: 400, fillColor: hexToRGBA("#64748b") },
                ],
              },
            ],
          },
          {
            kind: "frame", name: "Send Button", x: 0, y: 0, w: 416, h: 44,
            fillColor: C.accent, cornerRadius: 8,
            layout: { mode: "Flex", direction: "Row", gap: 0, padding: [12, 24, 12, 24], alignItems: "center", justifyContent: "center" },
            children: [
              { kind: "text", name: "Button Label", x: 0, y: 0, w: 120, h: 20, text: "Send Message", fontSize: 15, fontWeight: 600, fillColor: C.white },
            ],
          },
        ],
      },
    ],
  },

  // --- Lists ---
  {
    id: "list-settings",
    name: "Settings List",
    category: "Lists",
    description: "Settings-style list with toggle rows",
    icon: "⚙️",
    builtIn: true,
    nodes: [
      {
        kind: "frame", name: "Settings List", x: 0, y: 0, w: 360, h: 300,
        fillColor: C.cardBg, cornerRadius: 12,
        layout: { mode: "Flex", direction: "Column", gap: 0, padding: [8, 0, 8, 0] },
        children: [
          ...(["Notifications", "Dark Mode", "Auto-save", "Sound Effects", "Analytics"].map((label, i) => ({
            kind: "frame" as const, name: `Row ${label}`, x: 0, y: 0, w: 360, h: 52,
            fillColor: C.transparent,
            layout: { mode: "Flex" as const, direction: "Row" as const, gap: 0, padding: [12, 16, 12, 16] as [number, number, number, number], alignItems: "center", justifyContent: "between" as string },
            children: [
              { kind: "text" as const, name: label, x: 0, y: 0, w: 200, h: 20, text: label, fontSize: 14, fontWeight: 500, fillColor: C.text },
              {
                kind: "rect" as const, name: "Toggle BG", x: 0, y: 0, w: 44, h: 24,
                fillColor: i < 2 ? C.accent : C.border, cornerRadius: 12,
              },
            ],
          }))),
        ],
      },
    ],
  },

  // --- Footers ---
  {
    id: "footer-simple",
    name: "Simple Footer",
    category: "Footers",
    description: "Minimal footer with links and copyright",
    icon: "📎",
    builtIn: true,
    nodes: [
      {
        kind: "frame", name: "Footer", x: 0, y: 0, w: 1280, h: 80,
        fillColor: C.bg, cornerRadius: 0,
        layout: { mode: "Flex", direction: "Row", gap: 0, padding: [0, 32, 0, 32], alignItems: "center", justifyContent: "between" },
        children: [
          { kind: "text", name: "Copyright", x: 0, y: 0, w: 300, h: 18, text: "© 2026 OpenSketch. All rights reserved.", fontSize: 13, fontWeight: 400, fillColor: C.textMuted },
          {
            kind: "frame", name: "Footer Links", x: 0, y: 0, w: 300, h: 18,
            fillColor: C.transparent,
            layout: { mode: "Flex", direction: "Row", gap: 24, justifyContent: "end" },
            children: [
              { kind: "text", name: "Link", x: 0, y: 0, w: 50, h: 18, text: "Privacy", fontSize: 13, fontWeight: 400, fillColor: C.textMuted },
              { kind: "text", name: "Link", x: 0, y: 0, w: 40, h: 18, text: "Terms", fontSize: 13, fontWeight: 400, fillColor: C.textMuted },
              { kind: "text", name: "Link", x: 0, y: 0, w: 50, h: 18, text: "Contact", fontSize: 13, fontWeight: 400, fillColor: C.textMuted },
            ],
          },
        ],
      },
    ],
  },

  // --- Modals ---
  {
    id: "modal-confirm",
    name: "Confirm Dialog",
    category: "Modals",
    description: "Confirmation dialog with title, message, and two buttons",
    icon: "💬",
    builtIn: true,
    nodes: [
      {
        kind: "frame", name: "Dialog", x: 0, y: 0, w: 400, h: 220,
        fillColor: C.cardBg, cornerRadius: 16,
        layout: { mode: "Flex", direction: "Column", gap: 16, padding: [24, 24, 24, 24] },
        children: [
          { kind: "text", name: "Dialog Title", x: 0, y: 0, w: 352, h: 24, text: "Delete item?", fontSize: 18, fontWeight: 700, fillColor: C.text },
          { kind: "text", name: "Dialog Message", x: 0, y: 0, w: 352, h: 40, text: "This action cannot be undone. Are you sure you want to proceed?", fontSize: 14, fontWeight: 400, fillColor: C.textMuted },
          {
            kind: "frame", name: "Button Row", x: 0, y: 0, w: 352, h: 44,
            fillColor: C.transparent,
            layout: { mode: "Flex", direction: "Row", gap: 12, justifyContent: "end" },
            children: [
              {
                kind: "frame", name: "Cancel Btn", x: 0, y: 0, w: 100, h: 40,
                fillColor: C.transparent, cornerRadius: 8, stroke: { ...C.border, width: 1 },
                layout: { mode: "Flex", direction: "Row", gap: 0, padding: [10, 20, 10, 20], alignItems: "center", justifyContent: "center" },
                children: [
                  { kind: "text", name: "Label", x: 0, y: 0, w: 60, h: 18, text: "Cancel", fontSize: 14, fontWeight: 500, fillColor: C.text },
                ],
              },
              {
                kind: "frame", name: "Delete Btn", x: 0, y: 0, w: 100, h: 40,
                fillColor: C.danger, cornerRadius: 8,
                layout: { mode: "Flex", direction: "Row", gap: 0, padding: [10, 20, 10, 20], alignItems: "center", justifyContent: "center" },
                children: [
                  { kind: "text", name: "Label", x: 0, y: 0, w: 60, h: 18, text: "Delete", fontSize: 14, fontWeight: 600, fillColor: C.white },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
];

// ============================================================
// Custom template storage (localStorage)
// ============================================================

const STORAGE_KEY = "opensketch-custom-templates";

function loadCustomTemplates(): LayoutTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as LayoutTemplate[];
  } catch {
    return [];
  }
}

function saveCustomTemplates(templates: LayoutTemplate[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

// ============================================================
// Template instantiation — creates nodes via Engine WASM API
// ============================================================

function instantiateNode(
  editor: Editor,
  tpl: TemplateNode,
  offsetX: number,
  offsetY: number,
  parentId?: number,
): number {
  const eng = editor.engine;
  const x = tpl.x + offsetX;
  const y = tpl.y + offsetY;
  let id: number;

  switch (tpl.kind) {
    case "rect":
      id = Number(eng.add_rect(x, y, tpl.w, tpl.h));
      break;
    case "ellipse":
      id = Number(eng.add_ellipse(x, y, tpl.w, tpl.h));
      break;
    case "text":
      id = Number(eng.add_text(x, y, tpl.text || "Text", tpl.fontSize || 14));
      break;
    case "frame":
      id = Number(eng.add_frame(x, y, tpl.w, tpl.h));
      break;
    case "image":
      id = Number(eng.add_image(x, y, tpl.w, tpl.h, ""));
      break;
    case "star":
      id = Number(eng.add_star(x, y, tpl.w, tpl.h, 5, 0.4));
      break;
    case "polygon":
      id = Number(eng.add_polygon(x, y, tpl.w, tpl.h, 6));
      break;
    default:
      id = Number(eng.add_rect(x, y, tpl.w, tpl.h));
  }

  // Set name
  eng.set_node_name(BigInt(id), tpl.name);

  // Fill color
  if (tpl.fillColor) {
    eng.set_fill_color(BigInt(id), tpl.fillColor.r, tpl.fillColor.g, tpl.fillColor.b, tpl.fillColor.a);
  }

  // Corner radius
  if (tpl.cornerRadius !== undefined) {
    eng.set_corner_radius(BigInt(id), tpl.cornerRadius);
  }

  // Stroke
  if (tpl.stroke) {
    eng.set_stroke(BigInt(id), tpl.stroke.r, tpl.stroke.g, tpl.stroke.b, tpl.stroke.a, tpl.stroke.width);
  }

  // Opacity
  if (tpl.opacity !== undefined) {
    eng.set_opacity(BigInt(id), tpl.opacity);
  }

  // Text properties
  if (tpl.kind === "text") {
    if (tpl.fontWeight) eng.set_font_weight(BigInt(id), tpl.fontWeight);
    if (tpl.fontFamily) eng.set_font_family(BigInt(id), tpl.fontFamily);
    if (tpl.textAlign) eng.set_text_align(BigInt(id), tpl.textAlign.toLowerCase());
  }

  // Layout
  if (tpl.layout) {
    const l = tpl.layout;
    eng.set_layout_mode(BigInt(id), l.mode === "Flex" ? "flex" : "grid");
    if (l.direction) eng.set_flex_direction(BigInt(id), l.direction === "Row" ? "row" : "column");
    if (l.gap !== undefined) eng.set_layout_gap(BigInt(id), l.gap);
    if (l.padding) eng.set_layout_padding(BigInt(id), l.padding[0], l.padding[1], l.padding[2], l.padding[3]);
    if (l.alignItems) eng.set_align_items(BigInt(id), l.alignItems);
    if (l.justifyContent) eng.set_justify_content(BigInt(id), l.justifyContent);
    if (l.wrap) eng.set_flex_wrap(BigInt(id), "wrap");
    if (l.gridColumns) eng.set_grid_columns(BigInt(id), l.gridColumns);
  }

  // Parent (reparent)
  if (parentId !== undefined) {
    eng.reparent_node(BigInt(id), BigInt(parentId));
  }

  // Children (recursive)
  if (tpl.children) {
    for (const child of tpl.children) {
      instantiateNode(editor, child, 0, 0, id);
    }
  }

  return id;
}

export function insertTemplate(editor: Editor, template: LayoutTemplate) {
  editor.engine.push_undo();
  const zoom = (editor as any).zoom || 1;
  const panX = (editor as any).panX || 0;
  const panY = (editor as any).panY || 0;
  const canvas = editor.canvas;
  // Insert at center of viewport
  const cx = (-panX + canvas.width / 2) / zoom;
  const cy = (-panY + canvas.height / 2) / zoom;
  // Compute template bounding box
  let tw = 0, th = 0;
  for (const n of template.nodes) {
    tw = Math.max(tw, n.x + n.w);
    th = Math.max(th, n.y + n.h);
  }
  const ox = cx - tw / 2;
  const oy = cy - th / 2;

  const ids: number[] = [];
  for (const n of template.nodes) {
    ids.push(instantiateNode(editor, n, ox, oy));
  }

  // Select all top-level nodes
  editor.engine.deselect_all();
  for (const id of ids) {
    editor.engine.add_to_selection(BigInt(id));
  }
  editor.requestRender();
}

// ============================================================
// Save selection as custom template
// ============================================================

function nodeToTemplate(editor: Editor, nodeId: number): TemplateNode | null {
  const eng = editor.engine;
  const info = eng.get_node_json(BigInt(nodeId));
  if (!info) return null;
  let data: any;
  try { data = JSON.parse(info); } catch { return null; }

  const tpl: TemplateNode = {
    kind: mapKind(data.kind),
    name: data.name || "Node",
    x: data.x || 0,
    y: data.y || 0,
    w: data.width || 100,
    h: data.height || 100,
  };

  if (data.corner_radius) tpl.cornerRadius = data.corner_radius;
  if (data.opacity !== undefined && data.opacity < 1) tpl.opacity = data.opacity;

  // Fill
  if (data.fills && data.fills.length > 0) {
    const f = data.fills[0];
    if (f.fill_type?.Solid?.color) {
      const c = f.fill_type.Solid.color;
      tpl.fillColor = { r: c.r, g: c.g, b: c.b, a: c.a };
    }
  }

  // Stroke
  if (data.strokes && data.strokes.length > 0) {
    const s = data.strokes[0];
    if (s.color) {
      tpl.stroke = { r: s.color.r, g: s.color.g, b: s.color.b, a: s.color.a, width: s.width || 1 };
    }
  }

  // Text content
  if (data.kind?.Text) {
    tpl.text = data.kind.Text.content;
    tpl.fontSize = data.kind.Text.font_size;
    tpl.fontWeight = data.kind.Text.font_weight;
    tpl.fontFamily = data.kind.Text.font_family;
  }

  // Layout
  if (data.layout && data.layout.mode !== "None") {
    tpl.layout = {
      mode: data.layout.mode as "Flex" | "Grid",
      direction: data.layout.direction,
      gap: data.layout.gap,
      padding: [data.layout.padding_top, data.layout.padding_right, data.layout.padding_bottom, data.layout.padding_left],
      alignItems: data.layout.align_items,
      justifyContent: data.layout.justify_content,
    };
    if (data.layout.wrap === "Wrap") tpl.layout.wrap = true;
    if (data.layout.grid_columns) tpl.layout.gridColumns = data.layout.grid_columns;
  }

  // Children
  if (data.children && data.children.length > 0) {
    tpl.children = [];
    for (const childId of data.children) {
      const childTpl = nodeToTemplate(editor, Number(childId));
      if (childTpl) tpl.children.push(childTpl);
    }
    // Make positions relative to parent
    if (tpl.children.length > 0) {
      for (const c of tpl.children) {
        c.x -= tpl.x;
        c.y -= tpl.y;
      }
    }
  }

  return tpl;
}

function mapKind(kind: any): TemplateNode["kind"] {
  if (typeof kind === "string") {
    const k = kind.toLowerCase();
    if (k === "rect") return "rect";
    if (k === "ellipse") return "ellipse";
    if (k === "frame") return "frame";
    if (k === "image") return "image";
    if (k === "star") return "star";
    if (k === "polygon") return "polygon";
    return "rect";
  }
  if (kind?.Text) return "text";
  if (kind?.Image) return "image";
  if (kind?.Star) return "star";
  if (kind?.Polygon) return "polygon";
  return "frame";
}

export function saveSelectionAsTemplate(editor: Editor, name: string): LayoutTemplate | null {
  const sel = Array.from(editor.engine.get_selection()).map(Number);
  if (sel.length === 0) return null;

  const nodes: TemplateNode[] = [];
  // Compute origin offset
  let minX = Infinity, minY = Infinity;
  for (const id of sel) {
    const tpl = nodeToTemplate(editor, id);
    if (tpl) {
      minX = Math.min(minX, tpl.x);
      minY = Math.min(minY, tpl.y);
      nodes.push(tpl);
    }
  }
  // Normalize positions
  for (const n of nodes) {
    n.x -= minX;
    n.y -= minY;
  }

  const template: LayoutTemplate = {
    id: `custom-${Date.now()}`,
    name,
    category: "Custom",
    description: `Custom template (${nodes.length} element${nodes.length > 1 ? "s" : ""})`,
    icon: "📐",
    builtIn: false,
    createdAt: Date.now(),
    nodes,
  };

  const customs = loadCustomTemplates();
  customs.push(template);
  saveCustomTemplates(customs);
  return template;
}

export function deleteCustomTemplate(id: string) {
  const customs = loadCustomTemplates().filter((t) => t.id !== id);
  saveCustomTemplates(customs);
}

export function exportCustomTemplates(): string {
  return JSON.stringify(loadCustomTemplates(), null, 2);
}

export function importCustomTemplates(json: string): number {
  try {
    const imported = JSON.parse(json) as LayoutTemplate[];
    if (!Array.isArray(imported)) return 0;
    const customs = loadCustomTemplates();
    let count = 0;
    for (const t of imported) {
      if (t.id && t.name && t.nodes) {
        t.builtIn = false;
        t.category = "Custom";
        t.id = `custom-${Date.now()}-${count}`;
        customs.push(t);
        count++;
      }
    }
    saveCustomTemplates(customs);
    return count;
  } catch {
    return 0;
  }
}

// ============================================================
// All templates (built-in + custom)
// ============================================================

export function getAllTemplates(): LayoutTemplate[] {
  return [...BUILTIN_TEMPLATES, ...loadCustomTemplates()];
}

export function getCategories(): TemplateCategory[] {
  const cats = new Set<TemplateCategory>();
  for (const t of getAllTemplates()) cats.add(t.category);
  return Array.from(cats);
}

// ============================================================
// UI Panel
// ============================================================

export function setupTemplatePanel(container: HTMLElement, editor: Editor) {
  let filter = "";
  let activeCategory: TemplateCategory | "All" = "All";

  function render() {
    const templates = getAllTemplates();
    const categories: (TemplateCategory | "All")[] = ["All", ...getCategories()];
    const filtered = templates.filter((t) => {
      if (activeCategory !== "All" && t.category !== activeCategory) return false;
      if (filter && !t.name.toLowerCase().includes(filter.toLowerCase())) return false;
      return true;
    });

    container.innerHTML = `
      <div style="padding:12px;display:flex;flex-direction:column;gap:10px;height:100%;overflow:hidden;">
        <div style="font-size:13px;font-weight:600;color:#e2e8f0;">Layout Templates</div>
        <input id="tpl-search" type="text" placeholder="Search templates…"
          value="${filter}"
          style="width:100%;padding:6px 10px;border-radius:6px;border:1px solid #3d3d5c;background:#1e1e36;color:#e2e8f0;font-size:12px;outline:none;box-sizing:border-box;" />
        <div style="display:flex;gap:4px;flex-wrap:wrap;">
          ${categories.map((c) => `<button class="tpl-cat-btn" data-cat="${c}" style="padding:3px 8px;border-radius:4px;border:none;font-size:11px;cursor:pointer;background:${c === activeCategory ? "#6366f1" : "#2d2d44"};color:${c === activeCategory ? "#fff" : "#94a3b8"};">${c}</button>`).join("")}
        </div>
        <div style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:6px;padding-right:4px;" id="tpl-list">
          ${filtered.map((t) => `
            <div class="tpl-card" data-id="${t.id}" style="padding:10px 12px;background:#252540;border-radius:8px;cursor:pointer;border:1px solid transparent;transition:border-color .15s;" onmouseenter="this.style.borderColor='#6366f1'" onmouseleave="this.style.borderColor='transparent'">
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:18px;">${t.icon}</span>
                <div>
                  <div style="font-size:12px;font-weight:600;color:#e2e8f0;">${t.name}</div>
                  <div style="font-size:10px;color:#94a3b8;">${t.description}</div>
                </div>
                ${!t.builtIn ? `<button class="tpl-delete-btn" data-id="${t.id}" style="margin-left:auto;background:none;border:none;color:#ef4444;cursor:pointer;font-size:14px;padding:2px 4px;" title="Delete">✕</button>` : ""}
              </div>
            </div>
          `).join("")}
          ${filtered.length === 0 ? '<div style="color:#64748b;font-size:12px;text-align:center;padding:20px;">No templates found</div>' : ""}
        </div>
        <div style="border-top:1px solid #3d3d5c;padding-top:10px;display:flex;flex-direction:column;gap:6px;">
          <button id="tpl-save-btn" style="width:100%;padding:7px;border-radius:6px;border:none;background:#6366f1;color:#fff;font-size:12px;font-weight:600;cursor:pointer;">💾 Save Selection as Template</button>
          <div style="display:flex;gap:6px;">
            <button id="tpl-export-btn" style="flex:1;padding:5px;border-radius:6px;border:1px solid #3d3d5c;background:transparent;color:#94a3b8;font-size:11px;cursor:pointer;">Export</button>
            <button id="tpl-import-btn" style="flex:1;padding:5px;border-radius:6px;border:1px solid #3d3d5c;background:transparent;color:#94a3b8;font-size:11px;cursor:pointer;">Import</button>
          </div>
        </div>
      </div>
    `;

    // Event listeners
    container.querySelector("#tpl-search")?.addEventListener("input", (e) => {
      filter = (e.target as HTMLInputElement).value;
      render();
    });

    container.querySelectorAll(".tpl-cat-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeCategory = (btn as HTMLElement).dataset.cat as any;
        render();
      });
    });

    container.querySelectorAll(".tpl-card").forEach((card) => {
      card.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).classList.contains("tpl-delete-btn")) return;
        const id = (card as HTMLElement).dataset.id!;
        const tpl = getAllTemplates().find((t) => t.id === id);
        if (tpl) insertTemplate(editor, tpl);
      });
    });

    container.querySelectorAll(".tpl-delete-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = (btn as HTMLElement).dataset.id!;
        if (confirm("Delete this custom template?")) {
          deleteCustomTemplate(id);
          render();
        }
      });
    });

    container.querySelector("#tpl-save-btn")?.addEventListener("click", () => {
      const sel = Array.from(editor.engine.get_selection()).map(Number);
      if (sel.length === 0) {
        alert("Select one or more nodes first.");
        return;
      }
      const name = prompt("Template name:", "My Template");
      if (!name) return;
      const saved = saveSelectionAsTemplate(editor, name);
      if (saved) {
        render();
      }
    });

    container.querySelector("#tpl-export-btn")?.addEventListener("click", () => {
      const json = exportCustomTemplates();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "opensketch-templates.json";
      a.click();
      URL.revokeObjectURL(url);
    });

    container.querySelector("#tpl-import-btn")?.addEventListener("click", () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json";
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const count = importCustomTemplates(reader.result as string);
          alert(`Imported ${count} template(s).`);
          render();
        };
        reader.readAsText(file);
      };
      input.click();
    });
  }

  render();
}
