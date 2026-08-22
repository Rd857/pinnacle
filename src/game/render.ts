import { EXPAND_STEP, FLOOR_H, MAX_COLS, MAX_FLOOR, MIN_FLOOR, TILE_W } from "./constants";
import { CATALOG } from "./catalog";
import { expandCost, floorLabel, isExpressStop, occupancyGrid, plotWidth, shaftKind, carsOnShaft } from "./sim";
import type { ElevatorCar, FloatText, Particle, Person, PlaceResult, Room, SimState, Tool } from "./types";

export interface Cam {
  x: number;
  y: number;
  zoom: number;
}

export interface DrawInput {
  state: SimState;
  cam: Cam;
  alpha: number;
  now: number;
  tool: Tool | null;
  ghost: PlaceResult | null;
  hoverFloor: number | null;
  selectedId: string | null;
  floats: FloatText[];
  particles: Particle[];
  reduced: boolean;
  demo: boolean;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function clamp01(t: number) {
  return Math.max(0, Math.min(1, t));
}

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgb(r: number, g: number, b: number, a = 1) {
  return a === 1 ? `rgb(${r | 0},${g | 0},${b | 0})` : `rgba(${r | 0},${g | 0},${b | 0},${a})`;
}

function mix(a: string, b: string, t: number, alpha = 1) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgb(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t), alpha);
}

function skyStops(t: number): [string, string, string] {
  const keys: { t: number; top: string; mid: string; bot: string }[] = [
    { t: 0.0, top: "#070b14", mid: "#12182a", bot: "#1b2236" },
    { t: 0.22, top: "#2a3358", mid: "#c47a62", bot: "#e8b48a" },
    { t: 0.34, top: "#6aa0c8", mid: "#a7cce0", bot: "#d7e6ef" },
    { t: 0.5, top: "#5b9bc4", mid: "#8ec4e0", bot: "#d4ebf5" },
    { t: 0.7, top: "#3d6ea0", mid: "#d9895a", bot: "#f0c9a0" },
    { t: 0.82, top: "#1a2444", mid: "#8b4a5a", bot: "#c47a62" },
    { t: 1.0, top: "#070b14", mid: "#12182a", bot: "#1b2236" },
  ];
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1]!.t < t) i++;
  const a = keys[i]!;
  const b = keys[Math.min(i + 1, keys.length - 1)]!;
  const u = (t - a.t) / Math.max(0.0001, b.t - a.t);
  return [mix(a.top, b.top, u), mix(a.mid, b.mid, u), mix(a.bot, b.bot, u)];
}

function nightAmt(t: number) {
  if (t < 0.22) return 1;
  if (t < 0.32) return 1 - (t - 0.22) / 0.1;
  if (t > 0.82) return (t - 0.82) / 0.18;
  if (t > 0.72) return ((t - 0.72) / 0.1) * 0.4;
  return 0;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function roomRect(r: Room) {
  return {
    x: r.x * TILE_W,
    y: -(r.floor + r.rows) * FLOOR_H,
    w: r.cols * TILE_W,
    h: r.rows * FLOOR_H,
  };
}

const SHIRTS = ["#3d5a73", "#6b4a3a", "#355c4c", "#4a4560", "#7a4e3a", "#2f4f5e", "#5c3d4a"];
const SKINS = ["#e6c2a8", "#c48a62", "#8d5a3c", "#f0d2b8", "#a36b48"];
const HAIRS = ["#2a211c", "#5a3a22", "#c4b08a", "#1a1a1c", "#6a2a28", "#3a3a40"];

function personXY(p: Person, alpha: number) {
  return {
    x: lerp(p.prevX, p.x, alpha) * TILE_W,
    y: -lerp(p.prevFloor, p.floor, alpha) * FLOOR_H,
  };
}

function costLabel(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `$${n}`;
}

function plotFloors(state: SimState): Set<number> {
  const floors = new Set<number>([0]);
  for (const r of state.rooms) {
    floors.add(r.floor);
    floors.add(r.floor + 1);
    floors.add(r.floor - 1);
  }
  for (const s of state.shafts) {
    floors.add(s.minFloor - 1);
    floors.add(s.maxFloor + 1);
    for (let f = s.minFloor; f <= s.maxFloor; f++) floors.add(f);
  }
  return floors;
}

function drawSky(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, now: number) {
  const [top, mid, bot] = skyStops(t);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, top);
  g.addColorStop(0.45, mid);
  g.addColorStop(1, bot);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const night = nightAmt(t);
  if (night > 0.15) {
    ctx.fillStyle = rgb(232, 236, 245, 0.35 * night);
    for (let i = 0; i < 40; i++) {
      const sx = ((i * 97 + now * 2) % (w + 40)) - 20;
      const sy = (i * 53) % (h * 0.55);
      ctx.fillRect(sx, sy, i % 7 === 0 ? 2 : 1, i % 7 === 0 ? 2 : 1);
    }
  }

  ctx.fillStyle = rgb(236, 236, 232, 0.12 + (1 - night) * 0.18);
  for (let i = 0; i < 5; i++) {
    const cxd = ((now * 6 + i * 180) % (w + 220)) - 80;
    const cy2 = 40 + i * 28;
    rr(ctx, cxd, cy2, 90 + i * 10, 16, 12);
    ctx.fill();
    rr(ctx, cxd + 30, cy2 - 10, 70, 18, 12);
    ctx.fill();
  }
}

function drawCity(ctx: CanvasRenderingContext2D, groundY: number, t: number, left: number, right: number) {
  const night = nightAmt(t);
  const x0 = left * TILE_W;
  const x1 = right * TILE_W;
  const span = Math.ceil((x1 - x0) / 70) + 10;
  ctx.fillStyle = mix("#1a1d26", "#0d1018", night);
  for (let i = -6; i < span; i++) {
    const x = x0 + i * 70 - 80;
    const h = 40 + ((i * 17) % 90);
    ctx.fillRect(x, groundY - h, 48, h);
    if (night > 0.4) {
      ctx.fillStyle = rgb(232, 220, 170, 0.35);
      for (let wy = 8; wy < h - 6; wy += 10) {
        for (let wx = 6; wx < 40; wx += 10) {
          if (((i + wy + wx) * 13) % 5 > 1) ctx.fillRect(x + wx, groundY - h + wy, 4, 5);
        }
      }
      ctx.fillStyle = mix("#1a1d26", "#0d1018", night);
    }
  }
}

function drawGround(ctx: CanvasRenderingContext2D, groundY: number, left: number, right: number) {
  const x0 = left * TILE_W;
  const x1 = right * TILE_W;
  const span = x1 - x0;
  ctx.fillStyle = "#2a2d34";
  ctx.fillRect(x0 - 1400, groundY, span + 2800, 900);
  ctx.fillStyle = "#3a3e46";
  ctx.fillRect(x0 - 1400, groundY, span + 2800, 14);
  ctx.fillStyle = "#4a4e56";
  ctx.fillRect(x0 - 1400, groundY + 14, span + 2800, 4);
  ctx.fillStyle = "#5a5044";
  ctx.fillRect(x0 - 40, groundY - 8, span + 80, 8);

  ctx.fillStyle = "#2f333a";
  ctx.fillRect(x0 - 500, groundY + 28, span + 1000, 18);
  ctx.strokeStyle = "#c4b07a";
  ctx.setLineDash([16, 18]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0 - 500, groundY + 37);
  ctx.lineTo(x1 + 500, groundY + 37);
  ctx.stroke();
  ctx.setLineDash([]);

  const trees = Math.max(6, Math.floor(span / 160) + 4);
  for (let i = 0; i < trees; i++) {
    const tx = x0 - 90 + i * 170;
    ctx.fillStyle = "#2a4a38";
    ctx.beginPath();
    ctx.moveTo(tx, groundY);
    ctx.lineTo(tx + 16, groundY - 28);
    ctx.lineTo(tx + 32, groundY);
    ctx.fill();
    ctx.fillStyle = "#3d2a1c";
    ctx.fillRect(tx + 14, groundY - 4, 4, 4);
  }
}

function wallColor(kind: Room["kind"], night: number): string {
  const map: Record<string, [string, string]> = {
    lobby: ["#e8e0d4", "#cfc4b4"],
    office: ["#d9dfe6", "#b7c0c9"],
    fastfood: ["#ead9c8", "#d2b9a2"],
    hotel: ["#e4d5d0", "#c9b4ae"],
    single: ["#e4d5d0", "#c9b4ae"],
    shop: ["#dce6df", "#b9c9c0"],
    parking: ["#c5c6c8", "#9ea0a4"],
    condo: ["#dce6d8", "#b7c6b3"],
    restaurant: ["#e4d8cc", "#c4b4a4"],
    medical: ["#e4ecec", "#c2d0d0"],
    suite: ["#e8dcc8", "#cbb89a"],
    theater: ["#3a2a32", "#241820"],
    ballroom: ["#3a2430", "#24141c"],
    stairs: ["#d0ccc6", "#b4b0aa"],
  };
  const [a, b] = map[kind] ?? ["#ddd", "#bbb"];
  return mix(a, b, night * 0.35);
}

function floorColor(kind: Room["kind"]): string {
  const map: Record<string, string> = {
    lobby: "#cfc6b8",
    office: "#8a7a68",
    fastfood: "#c4b8a4",
    hotel: "#7a4a4a",
    single: "#7a4a4a",
    shop: "#d8d0c4",
    parking: "#8a8c90",
    condo: "#c4b49a",
    restaurant: "#5a4030",
    medical: "#dfe6e6",
    suite: "#6a3a3a",
    theater: "#2a1a22",
    ballroom: "#4a3040",
    stairs: "#b8b4ae",
  };
  return map[kind] ?? "#bbb";
}

function drawWindows(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  lit: boolean,
  night: number,
  cols: number,
) {
  const n = Math.max(2, Math.min(5, cols));
  const ww = 10;
  const wh = h - 22;
  const gap = (w - 16 - n * ww) / (n + 1);
  for (let i = 0; i < n; i++) {
    const wx = x + 8 + gap * (i + 1) + i * ww;
    const wy = y + 10;
    ctx.fillStyle = lit && night > 0.25 ? rgb(255, 220, 150, 0.85) : rgb(120, 160, 190, 0.25 + (1 - night) * 0.2);
    ctx.fillRect(wx, wy, ww, wh);
    ctx.strokeStyle = rgb(255, 255, 255, 0.18);
    ctx.lineWidth = 1;
    ctx.strokeRect(wx + 0.5, wy + 0.5, ww - 1, wh - 1);
    ctx.fillStyle = rgb(40, 44, 52, 0.35);
    ctx.fillRect(wx + ww / 2 - 0.5, wy, 1, wh);
  }
}

function furnitureOffice(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, lit: boolean) {
  const desks = Math.floor((w - 16) / 42);
  for (let i = 0; i < desks; i++) {
    const dx = x + 12 + i * 42;
    ctx.fillStyle = "#6a5340";
    rr(ctx, dx, y + h - 22, 28, 8, 1);
    ctx.fill();
    ctx.fillStyle = "#2a2c34";
    ctx.fillRect(dx + 6, y + h - 30, 14, 8);
    if (lit) {
      ctx.fillStyle = rgb(140, 200, 170, 0.7);
      ctx.fillRect(dx + 8, y + h - 28, 10, 5);
    }
    ctx.fillStyle = "#3a3c44";
    ctx.fillRect(dx + 4, y + h - 16, 8, 6);
  }
}

function furnitureHotel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, suite: boolean) {
  const beds = Math.max(1, Math.round(w / 64));
  const bw = Math.min(36, (w - 16) / beds - 4);
  ctx.fillStyle = suite ? "#6a2e36" : "#7a4048";
  for (let i = 0; i < beds; i++) {
    const bx = x + 8 + i * (bw + 6);
    rr(ctx, bx, y + h - 20, bw, 10, 2);
    ctx.fill();
    ctx.fillStyle = "#e8e0d4";
    rr(ctx, bx + 3, y + h - 24, 8, 5, 1);
    ctx.fill();
    ctx.fillStyle = suite ? "#6a2e36" : "#7a4048";
  }
  ctx.fillStyle = "#d8c4a0";
  ctx.fillRect(x + w - 16, y + 12, 8, 14);
  ctx.fillStyle = rgb(255, 220, 150, 0.5);
  ctx.beginPath();
  ctx.arc(x + w - 12, y + 14, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

function furnitureCafe(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = "#6a3a2a";
  ctx.fillRect(x + 8, y + h - 26, w - 28, 8);
  ctx.fillStyle = "#c45c4a";
  ctx.fillRect(x + 8, y + h - 28, w - 28, 3);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = "#3a3c44";
    ctx.beginPath();
    ctx.arc(x + 18 + i * 22, y + h - 12, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function furnitureCondo(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = "#cfc4b0";
  rr(ctx, x + 12, y + h - 20, 36, 10, 2);
  ctx.fill();
  ctx.fillStyle = "#6a8a6e";
  rr(ctx, x + 16, y + h - 26, 14, 8, 2);
  ctx.fill();
  ctx.fillStyle = "#2a4a38";
  ctx.beginPath();
  ctx.arc(x + w - 20, y + h - 16, 8, 0, Math.PI * 2);
  ctx.fill();
}

function furnitureRestaurant(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  for (let i = 0; i < 3; i++) {
    const tx = x + 14 + i * 36;
    ctx.fillStyle = "#e8e0d4";
    rr(ctx, tx, y + h - 20, 22, 8, 2);
    ctx.fill();
    ctx.fillStyle = "#3a2a22";
    ctx.fillRect(tx + 10, y + h - 12, 2, 8);
  }
}

function furnitureShop(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = "#8a6a4a";
  ctx.fillRect(x + 10, y + 12, w - 24, 6);
  ctx.fillRect(x + 10, y + 22, w - 24, 6);
  ctx.fillStyle = "#c45c4a";
  ctx.fillRect(x + 14, y + 13, 8, 4);
  ctx.fillStyle = "#3d5a73";
  ctx.fillRect(x + 28, y + 13, 8, 4);
}

function furnitureTheater(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = "#1a1016";
  ctx.fillRect(x + 8, y + 8, w - 16, h - 16);
  ctx.fillStyle = "#8a2a32";
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 8; c++) {
      rr(ctx, x + 16 + c * 12, y + h - 22 - r * 12, 8, 6, 1);
      ctx.fill();
    }
  }
}

function furnitureBallroom(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  live: boolean,
  t: number,
) {
  ctx.fillStyle = "#2c1822";
  ctx.fillRect(x + 4, y + 4, w - 8, h - 10);
  ctx.fillStyle = "#5a3a28";
  ctx.fillRect(x + 8, y + h - 18, w - 16, 10);
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i % 2 ? "#6a4630" : "#4a3020";
    ctx.fillRect(x + 10 + i * ((w - 20) / 6), y + h - 18, (w - 20) / 6, 10);
  }
  ctx.strokeStyle = rgb(196, 163, 96, live ? 0.55 : 0.28);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h - 28, w * 0.28, 10, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#1a1016";
  rr(ctx, x + w - 70, y + h - 52, 52, 22, 3);
  ctx.fill();
  ctx.fillStyle = rgb(196, 163, 96, 0.7);
  ctx.fillRect(x + w - 68, y + h - 52, 48, 3);
  ctx.fillStyle = rgb(20, 16, 22, 0.55);
  ctx.fillRect(x + 8, y + h / 2 - 4, w - 16, 3);
  ctx.strokeStyle = rgb(196, 163, 96, 0.4);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 12, y + h / 2 - 4);
  ctx.lineTo(x + w - 12, y + h / 2 - 4);
  ctx.stroke();
  const cx = x + w / 2;
  const cy = y + 22;
  ctx.strokeStyle = rgb(212, 180, 110, live ? 0.95 : 0.55);
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + t * 0.4;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * 16, cy + Math.sin(a) * 8 + 6);
    ctx.stroke();
  }
  ctx.fillStyle = live ? rgb(255, 220, 150, 0.85) : rgb(212, 180, 110, 0.5);
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fill();
  if (live) {
    ctx.fillStyle = rgb(255, 220, 160, 0.12);
    ctx.beginPath();
    ctx.ellipse(cx, cy + 18, 48, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgb(232, 200, 120, 0.7);
    ctx.font = "8px Figtree, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("TONIGHT", cx, y + 14);
    ctx.textAlign = "left";
  }
  const nWin = Math.max(3, Math.floor(w / 48));
  for (let i = 0; i < nWin; i++) {
    const wx = x + 14 + i * 44;
    ctx.fillStyle = live ? rgb(255, 210, 140, 0.55) : rgb(80, 90, 120, 0.25);
    ctx.fillRect(wx, y + 10, 12, h / 2 - 20);
  }
}

function furnitureMedical(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = "#e8eef0";
  rr(ctx, x + 12, y + h - 22, 30, 10, 2);
  ctx.fill();
  ctx.fillStyle = "#c45c4a";
  ctx.fillRect(x + w - 28, y + 14, 10, 3);
  ctx.fillRect(x + w - 24.5, y + 10, 3, 11);
}

function furnitureParking(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, leased: number) {
  ctx.strokeStyle = "#c4a35a";
  ctx.lineWidth = 1;
  const stalls = Math.floor(w / 28);
  for (let i = 0; i < stalls; i++) {
    ctx.strokeRect(x + 6 + i * 28, y + 10, 22, h - 18);
    if (i < leased) {
      ctx.fillStyle = i % 2 ? "#3a3c44" : "#5a4030";
      rr(ctx, x + 8 + i * 28, y + h - 22, 18, 10, 2);
      ctx.fill();
    }
  }
}

function furnitureLobby(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = "#4a4038";
  rr(ctx, x + w / 2 - 22, y + h - 22, 44, 10, 2);
  ctx.fill();
  ctx.fillStyle = "#2a4a38";
  ctx.beginPath();
  ctx.arc(x + 16, y + h - 14, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgb(232, 220, 170, 0.35);
  ctx.beginPath();
  ctx.arc(x + w / 2, y + 12, 6, 0, Math.PI * 2);
  ctx.fill();
}

function furnitureStairs(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = "#9a968e";
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(x + 8, y + h - 8 - i * 8, w - 16 - i * 4, 6);
  }
}

function drawRoom(ctx: CanvasRenderingContext2D, r: Room, t: number, selected: boolean) {
  const { x, y, w, h } = roomRect(r);
  const night = nightAmt(t);
  const lit = r.leased > 0 || r.kind === "lobby" || r.kind === "stairs" || Boolean(r.eventKind);
  ctx.fillStyle = wallColor(r.kind, night);
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = floorColor(r.kind);
  ctx.fillRect(x, y + h - 6, w, 6);
  ctx.strokeStyle = selected ? "#ecece8" : rgb(20, 22, 28, 0.35);
  ctx.lineWidth = selected ? 1.5 : 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  if (r.buildT > 0) {
    ctx.fillStyle = rgb(12, 13, 16, 0.45 * r.buildT);
    ctx.fillRect(x, y, w, h);
  }

  switch (r.kind) {
    case "office":
      furnitureOffice(ctx, x, y, w, h, lit && night > 0.2);
      drawWindows(ctx, x, y, w, h, lit, night, r.cols);
      break;
    case "hotel":
    case "single":
      furnitureHotel(ctx, x, y, w, h, false);
      drawWindows(ctx, x, y, w, h, lit, night, r.cols);
      break;
    case "suite":
      furnitureHotel(ctx, x, y, w, h, true);
      drawWindows(ctx, x, y, w, h, lit, night, r.cols);
      break;
    case "fastfood":
      furnitureCafe(ctx, x, y, w, h);
      break;
    case "condo":
      furnitureCondo(ctx, x, y, w, h);
      drawWindows(ctx, x, y, w, h, lit, night, r.cols);
      break;
    case "restaurant":
      furnitureRestaurant(ctx, x, y, w, h);
      break;
    case "shop":
      furnitureShop(ctx, x, y, w, h);
      break;
    case "theater":
      furnitureTheater(ctx, x, y, w, h);
      break;
    case "ballroom":
      furnitureBallroom(ctx, x, y, w, h, Boolean(r.eventKind), t);
      break;
    case "medical":
      furnitureMedical(ctx, x, y, w, h);
      break;
    case "parking":
      furnitureParking(ctx, x, y, w, h, r.leased);
      break;
    case "lobby":
      furnitureLobby(ctx, x, y, w, h);
      break;
    case "stairs":
      furnitureStairs(ctx, x, y, w, h);
      break;
    default:
      break;
  }

  if (r.capacity > 0) {
    ctx.fillStyle = rgb(12, 13, 16, 0.45);
    ctx.fillRect(x + 4, y + 3, 22, 8);
    ctx.fillStyle = "#d6d0c4";
    ctx.font = "7px IBM Plex Mono, monospace";
    ctx.fillText(`${r.leased}/${r.capacity}`, x + 6, y + 9);
  }
}

function drawPerson(ctx: CanvasRenderingContext2D, p: Person, alpha: number, now: number, night: number) {
  const { x, y } = personXY(p, alpha);
  const bob = p.state === "walk" || p.state === "enter" || p.state === "exit" ? Math.sin(now * 10 + p.phase) * 1.2 : 0;
  const px = x;
  const py = y - 18 + bob;
  ctx.fillStyle = SKINS[Math.floor(p.skin * SKINS.length) % SKINS.length]!;
  ctx.beginPath();
  ctx.arc(px, py - 10, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = HAIRS[Math.floor(p.hair * HAIRS.length) % HAIRS.length]!;
  ctx.beginPath();
  ctx.arc(px, py - 12, 3.4, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = SHIRTS[Math.floor(p.shirt * SHIRTS.length) % SHIRTS.length]!;
  ctx.fillRect(px - 3.5, py - 7, 7, 9);
  ctx.fillStyle = "#2a2c34";
  ctx.fillRect(px - 3.2, py + 2, 2.6, 6);
  ctx.fillRect(px + 0.6, py + 2, 2.6, 6);
  if (p.anger > 4) {
    ctx.fillStyle = rgb(196, 92, 74, 0.8);
    ctx.fillRect(px - 1, py - 18, 2, 4);
  }
  if (night > 0.6 && p.state === "walk") {
    ctx.fillStyle = rgb(255, 220, 150, 0.08);
    ctx.beginPath();
    ctx.ellipse(px, py + 6, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawShaft(
  ctx: CanvasRenderingContext2D,
  s: SimState["shafts"][number],
  night: number,
  selected: boolean,
  carCount: number,
) {
  const x = s.x * TILE_W;
  const top = -(s.maxFloor + 1) * FLOOR_H;
  const bot = -s.minFloor * FLOOR_H;
  const h = bot - top;
  const express = shaftKind(s) === "express";
  ctx.fillStyle = express ? mix("#241c16", "#120e0c", night) : mix("#1a1c22", "#0e1014", night);
  ctx.fillRect(x, top, TILE_W * 2, h);
  ctx.fillStyle = express ? rgb(166, 124, 82, 0.55) : rgb(80, 84, 92, 0.4);
  ctx.fillRect(x + TILE_W - 1, top, 2, h);
  ctx.strokeStyle = selected ? "#ecece8" : rgb(255, 255, 255, 0.06);
  ctx.lineWidth = selected ? 1.5 : 1;
  ctx.strokeRect(x + 0.5, top + 0.5, TILE_W * 2 - 1, h - 1);
  ctx.lineWidth = 1;
  if (express) {
    for (let f = s.minFloor; f <= s.maxFloor; f++) {
      if (!isExpressStop(f)) continue;
      const y = -(f + 1) * FLOOR_H + FLOOR_H / 2;
      ctx.fillStyle = rgb(196, 163, 120, 0.85);
      ctx.fillRect(x + 4, y - 2, TILE_W * 2 - 8, 3);
    }
  }
  if (carCount > 1) {
    ctx.fillStyle = rgb(12, 13, 16, 0.7);
    ctx.fillRect(x + 4, top + 4, TILE_W * 2 - 8, 11);
    ctx.fillStyle = express ? "#e4d2b8" : "#c5ccd6";
    ctx.font = "8px IBM Plex Mono, monospace";
    ctx.textAlign = "center";
    ctx.fillText(`×${carCount}`, x + TILE_W, top + 13);
    ctx.textAlign = "left";
  }
}

function drawCar(ctx: CanvasRenderingContext2D, car: ElevatorCar, state: SimState, alpha: number) {
  const shaft = state.shafts.find((s) => s.id === car.shaftId);
  if (!shaft) return;
  const sibs = carsOnShaft(state, car.shaftId);
  const idx = Math.max(0, sibs.findIndex((c) => c.id === car.id));
  const spread = Math.min(6, 18 / Math.max(1, sibs.length));
  const xOff = (idx - (sibs.length - 1) / 2) * spread;
  const floor = lerp(car.prevFloor, car.floor, alpha);
  const x = shaft.x * TILE_W + 3 + xOff;
  const y = -floor * FLOOR_H - FLOOR_H + 6;
  const w = TILE_W * 2 - 6;
  const h = FLOOR_H - 10;
  const express = shaftKind(shaft) === "express";
  ctx.fillStyle = express ? "#b08968" : "#8a909a";
  rr(ctx, x, y, w, h, 2);
  ctx.fill();
  ctx.fillStyle = express ? "#e4d2b8" : "#c5ccd6";
  ctx.fillRect(x + 2, y + 2, w - 4, 5);
  const open = car.door * car.door * (3 - 2 * car.door);
  const dw = (w / 2 - 2) * (1 - open);
  ctx.fillStyle = express ? "#5c4030" : "#4a5060";
  ctx.fillRect(x + 3, y + 10, dw, h - 16);
  ctx.fillRect(x + w - 3 - dw, y + 10, dw, h - 16);
  ctx.fillStyle = "#0c0d10";
  ctx.font = "7px IBM Plex Mono, monospace";
  ctx.textAlign = "center";
  const tag = sibs.length > 1 ? `${idx + 1}` : "";
  ctx.fillText(
    express ? `E${tag} ${floorLabel(Math.round(floor))}` : `${tag ? `${tag} ` : ""}${floorLabel(Math.round(floor))}`,
    x + w / 2,
    y + 7,
  );
  ctx.textAlign = "left";
}

function drawGhost(ctx: CanvasRenderingContext2D, tool: Tool, ghost: PlaceResult, _t: number) {
  if (ghost.floor == null || ghost.x == null) return;
  if (tool === "widen" || ghost.side) return;
  const shaft = tool === "elevator" || tool === "express" || tool === "bulldoze";
  const def = shaft ? CATALOG[tool === "express" ? "express" : "elevator"] : CATALOG[tool];
  const cols = shaft ? 2 : def.cols;
  const rows = shaft ? 1 : def.rows;
  const x = ghost.x * TILE_W;
  const y = -(ghost.floor + rows) * FLOOR_H;
  const w = cols * TILE_W;
  const h = rows * FLOOR_H;
  ctx.fillStyle = ghost.ok ? rgb(125, 158, 134, 0.28) : rgb(196, 92, 74, 0.28);
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = ghost.ok ? "#7d9e86" : "#c45c4a";
  ctx.setLineDash([5, 4]);
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.setLineDash([]);
  if (ghost.reason) {
    ctx.fillStyle = rgb(12, 13, 16, 0.8);
    rr(ctx, x, y - 16, Math.max(w, 120), 14, 3);
    ctx.fill();
    ctx.fillStyle = "#ecece8";
    ctx.font = "9px Figtree, sans-serif";
    ctx.fillText(ghost.reason, x + 4, y - 6);
  }
}

function drawExpandGhost(ctx: CanvasRenderingContext2D, state: SimState, ghost: PlaceResult) {
  if (!ghost.side || ghost.x == null) return;
  const x = ghost.x * TILE_W;
  const w = EXPAND_STEP * TILE_W;
  const floors = plotFloors(state);
  for (const f of floors) {
    if (f < MIN_FLOOR || f > MAX_FLOOR) continue;
    const y = -(f + 1) * FLOOR_H;
    ctx.fillStyle = ghost.ok ? rgb(125, 158, 134, 0.16) : rgb(196, 92, 74, 0.14);
    ctx.fillRect(x, y, w, FLOOR_H);
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = ghost.ok ? rgb(125, 158, 134, 0.5) : rgb(196, 92, 74, 0.45);
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, FLOOR_H - 1);
    ctx.setLineDash([]);
  }
  const y = -FLOOR_H;
  const label = ghost.ok ? `Widen · ${costLabel(ghost.cost ?? 0)}` : (ghost.reason ?? "Cannot widen");
  const tw = Math.max(w, 128);
  ctx.fillStyle = rgb(12, 13, 16, 0.82);
  rr(ctx, x + (w - tw) / 2, y - 20, tw, 16, 3);
  ctx.fill();
  ctx.fillStyle = ghost.ok ? "#ecece8" : "#e8c8c0";
  ctx.font = "9px Figtree, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, x + w / 2, y - 9);
  ctx.textAlign = "left";
}

function drawExpandTabs(ctx: CanvasRenderingContext2D, state: SimState, hoverSide: "left" | "right" | null) {
  if (plotWidth(state) + EXPAND_STEP > MAX_COLS) return;
  const cost = expandCost(state);
  const drawTab = (side: "left" | "right") => {
    const x = side === "left" ? (state.left - EXPAND_STEP) * TILE_W : state.right * TILE_W;
    const y = -FLOOR_H;
    const w = EXPAND_STEP * TILE_W;
    const h = FLOOR_H;
    const hot = hoverSide === side;
    ctx.fillStyle = hot ? rgb(125, 158, 134, 0.2) : rgb(212, 207, 198, 0.1);
    ctx.fillRect(x, y, w, h);
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = hot ? "#7d9e86" : rgb(197, 204, 214, 0.28);
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.setLineDash([]);
    ctx.fillStyle = hot ? "#ecece8" : rgb(236, 236, 232, 0.6);
    ctx.font = "10px Figtree, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Widen", x + w / 2, y + h / 2 - 4);
    ctx.font = "9px IBM Plex Mono, monospace";
    ctx.fillStyle = hot ? "#7d9e86" : rgb(139, 141, 150, 0.9);
    ctx.fillText(costLabel(cost), x + w / 2, y + h / 2 + 10);
    ctx.textAlign = "left";
  };
  drawTab("left");
  drawTab("right");
}

function drawPlot(ctx: CanvasRenderingContext2D, state: SimState, hoverFloor: number | null) {
  const floors = plotFloors(state);
  const x0 = state.left * TILE_W;
  const w = plotWidth(state) * TILE_W;
  for (const f of floors) {
    if (f < MIN_FLOOR || f > MAX_FLOOR) continue;
    const y = -(f + 1) * FLOOR_H;
    ctx.fillStyle = f === 0 ? rgb(212, 207, 198, 0.22) : rgb(212, 207, 198, 0.08);
    ctx.fillRect(x0, y, w, FLOOR_H);
    ctx.fillStyle = rgb(90, 86, 80, 0.35);
    ctx.fillRect(x0, y + FLOOR_H - 5, w, 5);
    ctx.strokeStyle = f === hoverFloor ? rgb(197, 204, 214, 0.45) : rgb(197, 204, 214, 0.12);
    ctx.strokeRect(x0 + 0.5, y + 0.5, w - 1, FLOOR_H - 1);
    if (f === 0 && state.rooms.length === 0) {
      ctx.fillStyle = rgb(236, 236, 232, 0.55);
      ctx.font = "11px Figtree, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Ground floor  ·  place a lobby", x0 + w / 2, y + FLOOR_H / 2 + 4);
      ctx.textAlign = "left";
    }
  }
}

function drawRoof(ctx: CanvasRenderingContext2D, state: SimState, t: number) {
  let top = 0;
  let minX = state.right;
  let maxX = state.left;
  for (const r of state.rooms) {
    const hi = r.floor + r.rows - 1;
    if (hi > top) top = hi;
    minX = Math.min(minX, r.x);
    maxX = Math.max(maxX, r.x + r.cols);
  }
  for (const s of state.shafts) {
    if (s.maxFloor > top) top = s.maxFloor;
    minX = Math.min(minX, s.x);
    maxX = Math.max(maxX, s.x + 2);
  }
  if (!state.rooms.length && !state.shafts.length) return;
  const y = -(top + 1) * FLOOR_H;
  const x = minX * TILE_W - 6;
  const w = (maxX - minX) * TILE_W + 12;
  ctx.fillStyle = "#6a6660";
  ctx.fillRect(x, y - 8, w, 10);
  ctx.fillStyle = "#8a8680";
  ctx.fillRect(x + 4, y - 14, w - 8, 6);
  ctx.fillStyle = "#4a4844";
  ctx.fillRect(x + w * 0.7, y - 36, 4, 24);
  ctx.fillStyle = nightAmt(t) > 0.4 ? "#c45c4a" : "#8a4040";
  ctx.beginPath();
  ctx.arc(x + w * 0.7 + 2, y - 38, 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawFloorGuides(ctx: CanvasRenderingContext2D, state: SimState, hoverFloor: number | null) {
  const x = state.left * TILE_W;
  ctx.font = "9px IBM Plex Mono, monospace";
  ctx.textAlign = "right";
  for (let f = MIN_FLOOR; f <= MAX_FLOOR; f++) {
    const y = -f * FLOOR_H;
    ctx.fillStyle = f === 0 ? rgb(197, 204, 214, 0.35) : rgb(197, 204, 214, 0.12);
    ctx.fillRect(x - 28, y - FLOOR_H, 24, FLOOR_H);
    ctx.fillStyle = f === hoverFloor ? "#ecece8" : rgb(139, 141, 150, 0.8);
    ctx.fillText(floorLabel(f), x - 8, y - FLOOR_H / 2 + 3);
  }
  ctx.textAlign = "left";
}

export function drawWorld(ctx: CanvasRenderingContext2D, cssW: number, cssH: number, dpr: number, input: DrawInput) {
  const { state, cam, alpha, now, tool, ghost, hoverFloor, selectedId, floats, particles, demo } = input;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawSky(ctx, cssW, cssH, state.time, now);

  ctx.save();
  ctx.translate(cssW / 2, cssH / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  const groundY = 0;
  drawCity(ctx, groundY, state.time, state.left, state.right);
  drawGround(ctx, groundY, state.left, state.right);

  const cx = ((state.left + state.right) * TILE_W) / 2;
  const hw = plotWidth(state) * TILE_W * 0.52;
  ctx.fillStyle = rgb(0, 0, 0, 0.18);
  ctx.beginPath();
  ctx.ellipse(cx, 8, hw, 16, 0, 0, Math.PI * 2);
  ctx.fill();

  drawFloorGuides(ctx, state, hoverFloor);
  drawPlot(ctx, state, hoverFloor);
  if (!demo) drawExpandTabs(ctx, state, ghost?.side ?? null);

  for (const s of state.shafts) {
    drawShaft(ctx, s, nightAmt(state.time), s.id === selectedId, carsOnShaft(state, s.id).length);
  }
  const rooms = [...state.rooms].sort((a, b) => a.floor - b.floor);
  for (const r of rooms) drawRoom(ctx, r, state.time, r.id === selectedId);
  drawRoof(ctx, state, state.time);
  for (const car of state.cars) drawCar(ctx, car, state, alpha);

  const people = [...state.people].sort((a, b) => a.floor - b.floor || a.x - b.x);
  for (const p of people) drawPerson(ctx, p, alpha, now, nightAmt(state.time));

  if (!demo && ghost?.side) drawExpandGhost(ctx, state, ghost);
  else if (tool && ghost && !demo) drawGhost(ctx, tool, ghost, state.time);

  for (const p of particles) {
    ctx.globalAlpha = clamp01(p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size);
    ctx.globalAlpha = 1;
  }

  ctx.font = "11px Figtree, sans-serif";
  for (const f of floats) {
    ctx.globalAlpha = clamp01(f.life);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

export function screenToWorld(cam: Cam, cssW: number, cssH: number, sx: number, sy: number) {
  const x = (sx - cssW / 2) / cam.zoom + cam.x;
  const y = (sy - cssH / 2) / cam.zoom + cam.y;
  return { x, y };
}

export function worldToFloorTile(x: number, y: number) {
  const floor = Math.floor(-y / FLOOR_H);
  const tile = Math.floor(x / TILE_W);
  return { floor, tile };
}

export function hitRoom(state: SimState, floor: number, tile: number): Room | null {
  const g = occupancyGrid(state);
  const id = g.get(`${floor}:${tile}`);
  if (!id) return null;
  return state.rooms.find((r) => r.id === id) ?? null;
}
