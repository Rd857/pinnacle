import {
  EXPAND_STEP,
  FIXED_DT,
  FLOOR_H,
  MAX_CARS,
  MAX_FLOOR,
  MAX_ZOOM,
  MIN_FLOOR,
  MIN_ZOOM,
  PAN_SPEED,
  TILE_W,
} from "./constants";
import { CATALOG } from "./catalog";
import { sfx, unlockAudio, setMuted as setAudioMuted } from "./audio";
import { hasSave, loadSave, writeSave, newGame } from "./save";
import {
  addCar as addCarToShaft,
  avgWaitTime,
  canWiden,
  carsOnShaft,
  clockLabel,
  currentHint,
  dailyIncome,
  emptyState,
  expandCost,
  expandPlot,
  expandSideAt,
  extraCarCost,
  floorLabel,
  hitShaft,
  occupiedFloors,
  pickElevatorShaft,
  place,
  plotCenterX,
  plotWidth,
  population,
  queryExpand,
  queryPlace,
  seedDemo,
  shaftKind,
  stepSim,
  vacantCount,
} from "./sim";
import {
  drawWorld,
  hitRoom,
  screenToWorld,
  worldToFloorTile,
  type Cam,
} from "./render";
import { useGameUi } from "./store";
import type { FloatText, Particle, PlaceResult, SimState, Tool } from "./types";

export class TowerEngine {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  state: SimState;
  cam: Cam = { x: 0, y: -FLOOR_H * 1.2, zoom: 1 };
  keys = new Set<string>();
  speed = 1;
  acc = 0;
  last = 0;
  raf = 0;
  demo = true;
  tool: Tool | null = null;
  ghost: PlaceResult | null = null;
  hoverFloor: number | null = null;
  selectedId: string | null = null;
  floats: FloatText[] = [];
  particles: Particle[] = [];
  pointers = new Map<number, { x: number; y: number }>();
  dragging = false;
  dragMoved = false;
  lastPtr = { x: 0, y: 0 };
  pinch0 = 0;
  reduced = false;
  hudT = 0;
  saveT = 0;
  time = 0;
  dead = false;
  shake = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unsupported");
    this.ctx = ctx;
    this.state = seedDemo();
    this.cam.x = plotCenterX(this.state, TILE_W);
    this.reduced =
      typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    useGameUi.setState({ canContinue: hasSave(), demo: true, screen: "title" });
    this.bind();
    this.resize();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  bind() {
    const c = this.canvas;
    c.addEventListener("pointerdown", this.onDown);
    c.addEventListener("pointermove", this.onMove);
    c.addEventListener("pointerup", this.onUp);
    c.addEventListener("pointercancel", this.onUp);
    c.addEventListener("wheel", this.onWheel, { passive: false });
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("resize", this.resize);
    document.addEventListener("visibilitychange", this.onVis);
  }

  unbind() {
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onDown);
    c.removeEventListener("pointermove", this.onMove);
    c.removeEventListener("pointerup", this.onUp);
    c.removeEventListener("pointercancel", this.onUp);
    c.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("resize", this.resize);
    document.removeEventListener("visibilitychange", this.onVis);
  }

  destroy() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    this.unbind();
  }

  resize = () => {
    const parent = this.canvas.parentElement;
    const w = parent?.clientWidth ?? window.innerWidth;
    const h = parent?.clientHeight ?? window.innerHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.floor(w * dpr));
    this.canvas.height = Math.max(1, Math.floor(h * dpr));
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  };

  cssSize() {
    return { w: this.canvas.clientWidth, h: this.canvas.clientHeight, dpr: Math.min(2, window.devicePixelRatio || 1) };
  }

  startNew(money?: number) {
    unlockAudio();
    this.state = newGame(money);
    this.demo = false;
    this.speed = 1;
    this.cam = { x: plotCenterX(this.state, TILE_W), y: -FLOOR_H * 0.55, zoom: 1.08 };
    this.tool = null;
    this.selectedId = null;
    useGameUi.setState({ screen: "play", demo: false, tool: null, selectedId: null, starUnlock: null });
    this.syncHud(true);
    sfx.click();
  }

  addFunds(amount: number) {
    if (this.demo) return;
    const n = Math.round(amount);
    if (!Number.isFinite(n) || n === 0) return;
    this.state.money = Math.max(0, this.state.money + n);
    this.handleEvents([
      {
        kind: "income",
        text: n > 0 ? `Treasury +$${n.toLocaleString("en-US")}` : `Treasury $${n.toLocaleString("en-US")}`,
        amount: n,
      },
    ]);
    this.syncHud(true);
    writeSave(this.state);
  }

  pickElevator(fromFloor: number, fromX: number, destFloor: number, destX: number) {
    const s = pickElevatorShaft(this.state, fromFloor, fromX, destFloor, destX);
    return s ? { id: s.id, x: s.x, minFloor: s.minFloor, maxFloor: s.maxFloor } : null;
  }

  continueSave() {
    unlockAudio();
    const s = loadSave();
    this.state = s ?? emptyState();
    this.demo = false;
    this.speed = 1;
    this.cam.y = -FLOOR_H * 0.55;
    this.cam.x = plotCenterX(this.state, TILE_W);
    this.cam.zoom = 1.08;
    useGameUi.setState({ screen: "play", demo: false, tool: null });
    this.syncHud(true);
    sfx.click();
  }

  showTitle() {
    this.state = seedDemo();
    this.demo = true;
    this.speed = 1;
    this.tool = null;
    this.selectedId = null;
    this.ghost = null;
    this.cam.x = plotCenterX(this.state, TILE_W);
    useGameUi.setState({
      screen: "title",
      demo: true,
      tool: null,
      selectedId: null,
      inspect: null,
      starUnlock: null,
    });
    sfx.click();
  }

  setTool(tool: Tool | null) {
    this.tool = tool;
    this.selectedId = null;
    useGameUi.setState({ tool, selectedId: null, inspect: null });
    sfx.click();
  }

  setSpeed(v: number) {
    this.speed = v;
    this.syncHud(true);
  }

  toggleMute() {
    const muted = !useGameUi.getState().muted;
    useGameUi.setState({ muted });
    setAudioMuted(muted);
  }

  widen(side: "left" | "right") {
    const events = expandPlot(this.state, side);
    this.handleEvents(events);
    if (events[0]?.kind === "place") {
      this.cam.x += (side === "right" ? 1 : -1) * EXPAND_STEP * TILE_W * 0.45;
      this.clampCam();
    }
    this.syncHud(true);
  }

  inspectShaft(shaft: ReturnType<typeof hitShaft>) {
    if (!shaft) return;
    const n = carsOnShaft(this.state, shaft.id).length;
    const express = shaftKind(shaft) === "express";
    const cost = extraCarCost(shaftKind(shaft));
    this.selectedId = shaft.id;
    useGameUi.setState({
      selectedId: shaft.id,
      inspect: {
        name: express ? "Express shaft" : "Elevator shaft",
        floor: `Floors ${floorLabel(shaft.minFloor)}–${floorLabel(shaft.maxFloor)}`,
        occ: `${n} / ${MAX_CARS} cars`,
        blurb: "Extra cars share this shaft and pass through each other — same cheat the original used.",
        kind: express ? "express" : "elevator",
        shaftId: shaft.id,
        carCost: cost,
        canAddCar: n < MAX_CARS && this.state.money >= cost,
      },
    });
  }

  addCar(shaftId: string) {
    const events = addCarToShaft(this.state, shaftId);
    this.handleEvents(events);
    this.syncHud(true);
    const shaft = this.state.shafts.find((s) => s.id === shaftId);
    if (shaft && events[0]?.kind === "place") this.inspectShaft(shaft);
  }

  loop = (now: number) => {
    if (this.dead) return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    this.tickInput(dt);

    const playing = useGameUi.getState().screen === "play" || this.demo;
    const spd = this.demo ? 0.7 : useGameUi.getState().screen === "play" ? this.speed : 0;
    if (playing && spd > 0) {
      this.acc += dt * spd;
      while (this.acc >= FIXED_DT) {
        const events = stepSim(this.state, FIXED_DT);
        this.handleEvents(events);
        this.acc -= FIXED_DT;
      }
    }

    this.hudT += dt;
    if (this.hudT > 0.18) {
      this.syncHud();
      this.hudT = 0;
    }

    this.saveT += dt;
    if (!this.demo && this.saveT > 4) {
      writeSave(this.state);
      this.saveT = 0;
    }

    this.stepFx(dt);
    if (this.demo) {
      this.cam.y = -FLOOR_H * 3.2 + Math.sin(this.time * 0.18) * FLOOR_H * 2.4;
      this.cam.x = plotCenterX(this.state, TILE_W) + Math.sin(this.time * 0.07) * 40;
      this.cam.zoom = 0.72;
    }

    const alpha = this.acc / FIXED_DT;
    this.paint(alpha);
    this.raf = requestAnimationFrame(this.loop);
  };

  tickInput(dt: number) {
    if (this.demo || useGameUi.getState().screen !== "play") return;
    let dx = 0;
    let dy = 0;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) dx -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) dx += 1;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) dy -= 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) dy += 1;
    const pan = PAN_SPEED * dt / this.cam.zoom;
    this.cam.x += dx * pan;
    this.cam.y += dy * pan;
    this.clampCam();
  }

  clampCam() {
    const minY = -(MAX_FLOOR + 3) * FLOOR_H;
    const maxY = -MIN_FLOOR * FLOOR_H + 180;
    this.cam.y = Math.max(minY, Math.min(maxY, this.cam.y));
    const lo = this.state.left * TILE_W - 80;
    const hi = this.state.right * TILE_W + 80;
    this.cam.x = Math.max(lo, Math.min(hi, this.cam.x));
    this.cam.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.cam.zoom));
  }

  handleEvents(events: ReturnType<typeof stepSim>) {
    if (this.demo) return;
    for (const e of events) {
      if (e.kind === "place") {
        sfx.place();
        this.burst(e.x ?? 0, e.floor ?? 0);
        if (e.text.startsWith("Lot widened")) {
          useGameUi.setState({ toast: e.text });
          window.setTimeout(() => {
            if (useGameUi.getState().toast === e.text) useGameUi.setState({ toast: null });
          }, 2800);
        }
      }
      if (e.kind === "income" && e.amount) {
        if (Math.abs(e.amount) >= 20) sfx.cash();
        this.floatAt(e.x ?? (this.state.left + this.state.right) / 2, e.floor ?? 0, e.text, e.amount >= 0 ? "#7d9e86" : "#c45c4a");
      }
      if (e.kind === "star" && e.stars) {
        sfx.star();
        useGameUi.setState({ starUnlock: e.stars });
      }
      if (e.kind === "complaint" || e.kind === "vacate" || e.kind === "lease" || e.kind === "info") {
        useGameUi.setState({ toast: e.text });
        window.setTimeout(() => {
          if (useGameUi.getState().toast === e.text) useGameUi.setState({ toast: null });
        }, 2800);
      }
      if (e.kind === "error") {
        sfx.error();
        this.shake = 0.25;
        useGameUi.setState({ toast: e.text });
        window.setTimeout(() => {
          if (useGameUi.getState().toast === e.text) useGameUi.setState({ toast: null });
        }, 1600);
      }
    }
  }

  floatAt(tile: number, floor: number, text: string, color: string) {
    this.floats.push({
      id: `${this.time}-${this.floats.length}`,
      x: tile * TILE_W + 8,
      y: -floor * FLOOR_H - 20,
      text,
      life: 1,
      color,
    });
    if (this.floats.length > 24) this.floats.shift();
  }

  burst(tile: number, floor: number) {
    if (this.reduced) return;
    const x = tile * TILE_W + 16;
    const y = -floor * FLOOR_H - 20;
    for (let i = 0; i < 10; i++) {
      this.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 40,
        vy: -20 - Math.random() * 30,
        life: 0.5 + Math.random() * 0.4,
        max: 0.9,
        size: 2 + Math.random() * 2,
        color: "#d6d0c4",
      });
    }
  }

  stepFx(dt: number) {
    for (const f of this.floats) {
      f.life -= dt * 0.7;
      f.y -= 18 * dt;
    }
    this.floats = this.floats.filter((f) => f.life > 0);
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 50 * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2.2);
  }

  paint(alpha: number) {
    const { w, h, dpr } = this.cssSize();
    const cam = { ...this.cam };
    if (this.shake > 0 && !this.reduced) {
      const mag = this.shake * this.shake * 10;
      cam.x += (Math.random() - 0.5) * mag;
      cam.y += (Math.random() - 0.5) * mag;
    }
    drawWorld(this.ctx, w, h, dpr, {
      state: this.state,
      cam,
      alpha,
      now: this.time,
      tool: this.demo ? null : this.tool,
      ghost: this.demo ? null : this.ghost,
      hoverFloor: this.hoverFloor,
      selectedId: this.selectedId,
      floats: this.floats,
      particles: this.particles,
      reduced: this.reduced,
      demo: this.demo,
    });
  }

  syncHud(force = false) {
    const s = this.state;
    const hint =
      !this.demo && this.tool === "widen"
        ? "Click the left or right edge of the lot to buy four more bays."
        : this.demo
          ? null
          : currentHint(s);
    const hud = {
      money: Math.floor(s.money),
      pop: population(s),
      stars: s.stars,
      day: s.day,
      clock: clockLabel(s.time),
      speed: this.speed,
      hint,
      income: dailyIncome(s),
      wait: avgWaitTime(s),
      leased: population(s),
      vacant: vacantCount(s),
      floors: occupiedFloors(s),
      width: plotWidth(s),
      expandCost: expandCost(s),
      canExpand: canWiden(s),
    };
    if (!force) {
      const prev = useGameUi.getState().hud;
      if (
        prev.money === hud.money &&
        prev.clock === hud.clock &&
        prev.pop === hud.pop &&
        prev.stars === hud.stars &&
        prev.hint === hud.hint &&
        prev.width === hud.width &&
        prev.expandCost === hud.expandCost
      ) {
        return;
      }
    }
    useGameUi.setState({ hud, canContinue: hasSave() || !this.demo });
  }

  localFromEvent(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  updateGhost(sx: number, sy: number) {
    const { w, h } = this.cssSize();
    const world = screenToWorld(this.cam, w, h, sx, sy);
    const { floor, tile } = worldToFloorTile(world.x, world.y);
    this.hoverFloor = floor;
    if (this.demo) {
      this.ghost = null;
      return;
    }
    const zone = expandSideAt(this.state, tile);
    if (zone && this.tool !== "bulldoze") {
      this.ghost = queryExpand(this.state, zone);
      return;
    }
    if (this.tool === "widen") {
      const mid = (this.state.left + this.state.right) / 2;
      this.ghost = queryExpand(this.state, tile < mid ? "left" : "right");
      return;
    }
    if (!this.tool) {
      this.ghost = null;
      return;
    }
    this.ghost = queryPlace(this.state, this.tool, floor, tile);
  }

  onDown = (e: PointerEvent) => {
    unlockAudio();
    this.canvas.setPointerCapture(e.pointerId);
    const p = this.localFromEvent(e);
    this.pointers.set(e.pointerId, p);
    this.lastPtr = p;
    this.dragMoved = false;
    if (this.pointers.size === 2) {
      const pts = [...this.pointers.values()];
      this.pinch0 = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
    } else {
      this.dragging = true;
    }
  };

  onMove = (e: PointerEvent) => {
    const p = this.localFromEvent(e);
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, p);
    if (this.demo) return;

    if (this.pointers.size === 2) {
      const pts = [...this.pointers.values()];
      const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      if (this.pinch0 > 0) {
        const scale = dist / this.pinch0;
        this.cam.zoom *= scale;
        this.pinch0 = dist;
        this.clampCam();
      }
      return;
    }

    if (this.dragging) {
      const dx = p.x - this.lastPtr.x;
      const dy = p.y - this.lastPtr.y;
      if (Math.hypot(dx, dy) > 3) this.dragMoved = true;
      if (!this.tool || this.dragMoved) {
        this.cam.x -= dx / this.cam.zoom;
        this.cam.y -= dy / this.cam.zoom;
        this.clampCam();
      }
      this.lastPtr = p;
    }
    this.updateGhost(p.x, p.y);
  };

  onUp = (e: PointerEvent) => {
    const p = this.localFromEvent(e);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch0 = 0;
    if (this.dragging && !this.dragMoved && !this.demo && useGameUi.getState().screen === "play") {
      this.clickWorld(p.x, p.y, e.button === 2);
    }
    this.dragging = false;
    this.dragMoved = false;
  };

  clickWorld(sx: number, sy: number, right: boolean) {
    const { w, h } = this.cssSize();
    const world = screenToWorld(this.cam, w, h, sx, sy);
    const { floor, tile } = worldToFloorTile(world.x, world.y);
    if (right) {
      this.setTool(null);
      return;
    }
    const zone = expandSideAt(this.state, tile);
    if (this.tool === "widen") {
      const side = zone ?? (tile < (this.state.left + this.state.right) / 2 ? "left" : "right");
      this.widen(side);
      return;
    }
    if (zone && this.tool !== "bulldoze") {
      this.widen(zone);
      return;
    }
    if (this.tool) {
      const events = place(this.state, this.tool, floor, tile);
      this.handleEvents(events);
      this.syncHud(true);
      return;
    }
    const room = hitRoom(this.state, floor, tile);
    if (room) {
      this.selectedId = room.id;
      const def = CATALOG[room.kind];
      useGameUi.setState({
        selectedId: room.id,
        inspect: {
          name: def.name,
          floor: `Floor ${floorLabel(room.floor)}`,
          occ: def.capacity ? `${room.leased} / ${room.capacity} occupied` : "Transit",
          blurb: def.blurb,
          kind: room.kind,
        },
      });
    } else {
      const shaft = hitShaft(this.state, floor, tile);
      if (shaft) this.inspectShaft(shaft);
      else {
        this.selectedId = null;
        useGameUi.setState({ selectedId: null, inspect: null });
      }
    }
  }

  onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (this.demo) return;
    const factor = Math.exp(-e.deltaY * 0.0012);
    this.cam.zoom *= factor;
    this.clampCam();
  };

  onKey = (e: KeyboardEvent) => {
    if (e.repeat && (e.code === "Space" || e.code === "Escape")) return;
    this.keys.add(e.code);
    const screen = useGameUi.getState().screen;
    if (e.code === "Space") {
      e.preventDefault();
      if (screen === "play") this.setSpeed(this.speed === 0 ? 1 : 0);
    }
    if (e.code === "Digit1") this.setSpeed(1);
    if (e.code === "Digit2") this.setSpeed(2);
    if (e.code === "Digit3") this.setSpeed(4);
    if (e.code === "Escape") {
      if (this.tool) this.setTool(null);
      else if (screen === "play") useGameUi.setState({ screen: "pause" });
      else if (screen === "pause" || screen === "help") useGameUi.setState({ screen: "play" });
    }
    if (e.code === "KeyB") this.setTool("bulldoze");
    if (e.code === "KeyE") this.setTool(this.tool === "widen" ? null : "widen");
    const GAME = new Set(["Space", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyW", "KeyA", "KeyS", "KeyD"]);
    if (GAME.has(e.code)) e.preventDefault();
  };

  onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  onBlur = () => {
    this.keys.clear();
  };

  onVis = () => {
    if (document.visibilityState === "hidden" && !this.demo) writeSave(this.state);
    if (document.visibilityState === "visible") this.last = performance.now();
  };
}
