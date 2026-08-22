import {
  CAR_COST,
  DAY_LENGTH,
  DOOR_TIME,
  DWELL_TIME,
  ELEVATOR_ACCEL,
  ELEVATOR_CAP,
  ELEVATOR_EXTEND,
  ELEVATOR_SPEED,
  EXPAND_COST_BASE,
  EXPAND_COST_STEP,
  EXPAND_STEP,
  EXPRESS_ACCEL,
  EXPRESS_CAP,
  EXPRESS_CAR_COST,
  EXPRESS_EXTEND,
  EXPRESS_SPEED,
  EXPRESS_STEP,
  LOBBY_FLOOR,
  MAX_CARS,
  MAX_COLS,
  MAX_FLOOR,
  MAX_PEOPLE,
  MIN_FLOOR,
  START_COLS,
  START_MONEY,
  STAR_POP,
  WALK_SPEED,
} from "./constants";
import { CATALOG } from "./catalog";
import { personName } from "./names";
import type {
  BallEvent,
  ElevatorCar,
  ElevatorKind,
  ElevatorShaft,
  ExpandSide,
  Person,
  PlaceResult,
  Room,
  RoomKind,
  SimEvent,
  SimState,
  Tool,
} from "./types";

function rng(state: SimState): number {
  state.seed = (state.seed * 1664525 + 1013904223) >>> 0;
  return state.seed / 0x100000000;
}

function nid(state: SimState, p = "n"): string {
  state.idSeq += 1;
  return `${p}${state.idSeq}`;
}

function key(floor: number, x: number): string {
  return `${floor}:${x}`;
}

export function emptyState(): SimState {
  return {
    money: START_MONEY,
    day: 1,
    time: 0.32,
    stars: 1,
    rooms: [],
    shafts: [],
    cars: [],
    people: [],
    idSeq: 1,
    seed: 0x9e3779b9,
    left: 0,
    right: START_COLS,
  };
}

export function plotWidth(state: SimState): number {
  return state.right - state.left;
}

export function plotCenterX(state: SimState, tileW: number): number {
  return ((state.left + state.right) * tileW) / 2;
}

export function expandCost(state: SimState): number {
  const extra = Math.max(0, plotWidth(state) - START_COLS);
  const n = extra / EXPAND_STEP;
  return Math.round(EXPAND_COST_BASE + n * EXPAND_COST_STEP);
}

export function canWiden(state: SimState): boolean {
  return plotWidth(state) + EXPAND_STEP <= MAX_COLS;
}

export function expandSideAt(state: SimState, tile: number): ExpandSide | null {
  if (tile >= state.left - EXPAND_STEP && tile < state.left) return "left";
  if (tile >= state.right && tile < state.right + EXPAND_STEP) return "right";
  return null;
}

export function queryExpand(state: SimState, side: ExpandSide): PlaceResult {
  const x = side === "left" ? state.left - EXPAND_STEP : state.right;
  if (!canWiden(state)) {
    return { ok: false, reason: "The block is as wide as it goes", floor: 0, x, side };
  }
  const cost = expandCost(state);
  if (state.money < cost) {
    return { ok: false, reason: "Not enough funds", cost, floor: 0, x, side };
  }
  return { ok: true, cost, floor: 0, x, side };
}

export function expandPlot(state: SimState, side: ExpandSide): SimEvent[] {
  const q = queryExpand(state, side);
  if (!q.ok) {
    return [{ kind: "error", text: q.reason ?? "Cannot widen" }];
  }
  const cost = q.cost ?? 0;
  state.money -= cost;
  if (side === "left") state.left -= EXPAND_STEP;
  else state.right += EXPAND_STEP;
  return [
    {
      kind: "place",
      text: `Lot widened ${side} — ${EXPAND_STEP} more bays`,
      amount: -cost,
      floor: 0,
      x: q.x,
    },
  ];
}

export function occupancyGrid(state: SimState): Map<string, string> {
  const g = new Map<string, string>();
  for (const r of state.rooms) {
    for (let f = r.floor; f < r.floor + r.rows; f++) {
      for (let x = r.x; x < r.x + r.cols; x++) g.set(key(f, x), r.id);
    }
  }
  for (const s of state.shafts) {
    for (let f = s.minFloor; f <= s.maxFloor; f++) {
      g.set(key(f, s.x), s.id);
      g.set(key(f, s.x + 1), s.id);
    }
  }
  return g;
}

export function isShaftTool(tool: Tool): tool is "elevator" | "express" {
  return tool === "elevator" || tool === "express";
}

export function shaftKind(s: ElevatorShaft): ElevatorKind {
  return s.kind === "express" ? "express" : "standard";
}

export function isExpressStop(floor: number): boolean {
  return ((floor % EXPRESS_STEP) + EXPRESS_STEP) % EXPRESS_STEP === 0;
}

export function servedFloors(s: ElevatorShaft): number[] {
  const out: number[] = [];
  const express = shaftKind(s) === "express";
  for (let f = s.minFloor; f <= s.maxFloor; f++) {
    if (!express || isExpressStop(f)) out.push(f);
  }
  return out;
}

export function nearestExpressStop(s: ElevatorShaft, destFloor: number): number | null {
  const stops = servedFloors(s);
  if (!stops.length) return null;
  let best = stops[0]!;
  let bestD = Math.abs(best - destFloor);
  for (const f of stops) {
    const d = Math.abs(f - destFloor);
    if (d < bestD) {
      bestD = d;
      best = f;
    }
  }
  return best;
}

function alightFloor(shaft: ElevatorShaft, destFloor: number): number {
  if (shaftKind(shaft) !== "express") return destFloor;
  return nearestExpressStop(shaft, destFloor) ?? destFloor;
}

function carSpeed(shaft: ElevatorShaft): number {
  return shaftKind(shaft) === "express" ? EXPRESS_SPEED : ELEVATOR_SPEED;
}

function carCap(shaft: ElevatorShaft): number {
  return shaftKind(shaft) === "express" ? EXPRESS_CAP : ELEVATOR_CAP;
}

export function carsOnShaft(state: SimState, shaftId: string): ElevatorCar[] {
  return state.cars.filter((c) => c.shaftId === shaftId);
}

export function extraCarCost(kind: ElevatorKind): number {
  return kind === "express" ? EXPRESS_CAR_COST : CAR_COST;
}

function spawnCar(state: SimState, shaft: ElevatorShaft): ElevatorCar {
  const existing = carsOnShaft(state, shaft.id);
  let floor = shaft.minFloor;
  if (existing.length) {
    const avg = existing.reduce((n, c) => n + c.floor, 0) / existing.length;
    const mid = (shaft.minFloor + shaft.maxFloor) / 2;
    floor = avg < mid ? shaft.maxFloor : shaft.minFloor;
  }
  if (shaftKind(shaft) === "express" && !isExpressStop(floor)) {
    floor = nearestExpressStop(shaft, floor) ?? shaft.minFloor;
  }
  return {
    id: nid(state, "car"),
    shaftId: shaft.id,
    floor,
    prevFloor: floor,
    dest: floor,
    dir: 0,
    vel: 0,
    state: "idle",
    door: 0,
    doorTarget: 0,
    dwell: 0,
    passengers: [],
    stops: [],
  };
}

export function addCar(state: SimState, shaftId: string): SimEvent[] {
  const shaft = state.shafts.find((s) => s.id === shaftId);
  if (!shaft) return [{ kind: "error", text: "No shaft there" }];
  const n = carsOnShaft(state, shaft.id).length;
  if (n >= MAX_CARS) return [{ kind: "error", text: "Shaft is full (8 cars)" }];
  const cost = extraCarCost(shaftKind(shaft));
  if (state.money < cost) return [{ kind: "error", text: "Not enough funds" }];
  state.money -= cost;
  state.cars.push(spawnCar(state, shaft));
  return [
    {
      kind: "place",
      text: `Car ${n + 1} added — they pass through each other`,
      floor: Math.round(state.cars[state.cars.length - 1]!.floor),
      x: shaft.x,
      amount: -cost,
    },
  ];
}

export function hitShaft(state: SimState, floor: number, tile: number): ElevatorShaft | null {
  return (
    state.shafts.find(
      (s) => tile >= s.x && tile <= s.x + 1 && floor >= s.minFloor && floor <= s.maxFloor,
    ) ?? null
  );
}

export function accessSet(state: SimState): Set<number> {
  const reach = new Set<number>([LOBBY_FLOOR]);
  const stairs = state.rooms.filter((r) => r.kind === "stairs");
  let changed = true;
  while (changed) {
    changed = false;
    for (const s of state.shafts) {
      const served = servedFloors(s);
      const hits = served.some((f) => reach.has(f));
      if (!hits) continue;
      for (const f of served) {
        if (!reach.has(f)) {
          reach.add(f);
          changed = true;
        }
      }
    }
    for (const st of stairs) {
      if (reach.has(st.floor) && !reach.has(st.floor + 1)) {
        reach.add(st.floor + 1);
        changed = true;
      }
      if (reach.has(st.floor + 1) && !reach.has(st.floor)) {
        reach.add(st.floor);
        changed = true;
      }
    }
  }
  return reach;
}

export function population(state: SimState): number {
  let n = 0;
  for (const r of state.rooms) {
    if (
      r.kind === "office" ||
      r.kind === "condo" ||
      r.kind === "hotel" ||
      r.kind === "single" ||
      r.kind === "suite" ||
      r.kind === "parking"
    ) {
      n += r.leased;
    }
  }
  return n;
}

function hasKind(state: SimState, kind: RoomKind): boolean {
  return state.rooms.some((r) => r.kind === kind);
}

function isHotelRoom(kind: RoomKind): boolean {
  return kind === "hotel" || kind === "single" || kind === "suite";
}

export function evalStars(state: SimState): number {
  const pop = population(state);
  let s = 1;
  if (pop >= STAR_POP[2] && hasKind(state, "office")) s = 2;
  if (pop >= STAR_POP[3] && hasKind(state, "shop") && hasKind(state, "restaurant")) s = 3;
  if (pop >= STAR_POP[4] && hasKind(state, "condo")) s = 4;
  if (pop >= STAR_POP[5] && hasKind(state, "medical") && (hasKind(state, "theater") || hasKind(state, "ballroom"))) s = 5;
  return s;
}

export function clockLabel(t: number): string {
  const m = Math.floor(t * 24 * 60) % (24 * 60);
  const h24 = Math.floor(m / 60);
  const min = m % 60;
  const h = h24 % 12 || 12;
  const ap = h24 >= 12 ? "PM" : "AM";
  return `${h}:${min.toString().padStart(2, "0")} ${ap}`;
}

export function worldFloorY(floor: number): number {
  return -floor * 56;
}

function inOpenHours(kind: RoomKind, t: number): boolean {
  if (kind === "office") return t >= 0.33 && t < 0.75;
  if (kind === "fastfood") return t >= 0.3 && t < 0.78;
  if (kind === "shop") return t >= 0.38 && t < 0.8;
  if (kind === "restaurant") return t >= 0.46 && t < 0.92;
  if (kind === "theater" || kind === "ballroom") return t >= 0.62 && t < 0.95;
  if (kind === "medical") return t >= 0.34 && t < 0.82;
  return true;
}

export type { PlaceResult };

function clampTile(state: SimState, tile: number, cols: number): number {
  return Math.max(state.left, Math.min(state.right - cols, tile));
}

export function queryPlace(state: SimState, tool: Tool, floor: number, tile: number): PlaceResult {
  if (tool === "widen") {
    const mid = (state.left + state.right) / 2;
    return queryExpand(state, tile < mid ? "left" : "right");
  }

  if (floor < MIN_FLOOR || floor > MAX_FLOOR) return { ok: false, reason: "Out of range" };

  if (tool === "bulldoze") {
    const g = occupancyGrid(state);
    const id = g.get(key(floor, tile));
    if (!id) return { ok: false, reason: "Nothing to remove" };
    return { ok: true, floor, x: tile };
  }

  if (tool === "elevator" || tool === "express") {
    const want: ElevatorKind = tool === "express" ? "express" : "standard";
    if (state.stars < CATALOG[tool].stars && !state.shafts.some((s) => s.x <= tile && tile <= s.x + 1 && shaftKind(s) === want)) {
      return { ok: false, reason: `${CATALOG[tool].stars}-star tower required` };
    }
    const shaft = state.shafts.find((s) => tile >= s.x && tile <= s.x + 1);
    if (shaft) {
      if (shaftKind(shaft) !== want) {
        return { ok: false, reason: "That shaft is a different type" };
      }
      if (floor >= shaft.minFloor && floor <= shaft.maxFloor) {
        const n = carsOnShaft(state, shaft.id).length;
        if (n >= MAX_CARS) return { ok: false, reason: "Shaft is full (8 cars)" };
        const cost = extraCarCost(want);
        if (state.money < cost) return { ok: false, reason: "Not enough funds", cost, floor, x: shaft.x };
        return { ok: true, cost, floor, x: shaft.x, addCar: shaft, reason: `Add car · ${n + 1}/${MAX_CARS}` };
      }
      if (floor === shaft.maxFloor + 1 || floor === shaft.minFloor - 1) {
        const cost = want === "express" ? EXPRESS_EXTEND : ELEVATOR_EXTEND;
        if (state.money < cost) return { ok: false, reason: "Not enough funds", cost, floor, x: shaft.x };
        return { ok: true, cost, floor, x: shaft.x, extend: shaft };
      }
      return { ok: false, reason: "Click the floor just above or below the shaft" };
    }
    const x = clampTile(state, tile, 2);
    const g = occupancyGrid(state);
    if (g.has(key(floor, x)) || g.has(key(floor, x + 1))) {
      return { ok: false, reason: "Blocked" };
    }
    let minF = floor;
    let maxF = floor;
    let extra = 0;
    const step = want === "express" ? EXPRESS_EXTEND : ELEVATOR_EXTEND;
    if (floor !== LOBBY_FLOOR) {
      const lo = Math.min(LOBBY_FLOOR, floor);
      const hi = Math.max(LOBBY_FLOOR, floor);
      let clear = true;
      for (let f = lo; f <= hi; f++) {
        if (f === floor) continue;
        if (g.has(key(f, x)) || g.has(key(f, x + 1))) {
          clear = false;
          break;
        }
      }
      if (clear) {
        minF = lo;
        maxF = hi;
        extra = step * Math.abs(floor - LOBBY_FLOOR);
      }
    }
    const cost = CATALOG[tool].cost + extra;
    if (state.money < cost) return { ok: false, reason: "Not enough funds" };
    return { ok: true, cost, floor, x, extend: null, minF, maxF };
  }

  const def = CATALOG[tool];
  if (state.stars < def.stars) return { ok: false, reason: `${def.stars}-star tower required` };
  if (def.zone === "ground" && floor !== LOBBY_FLOOR) {
    return { ok: false, reason: "Lobby sits on the ground floor" };
  }
  if (def.zone === "above" && floor < 1) return { ok: false, reason: "Build this above ground" };
  if (def.zone === "below" && floor >= 0) return { ok: false, reason: "Basement only" };
  if (floor + def.rows - 1 > MAX_FLOOR || floor < MIN_FLOOR) return { ok: false, reason: "Out of range" };
  if (def.cols > plotWidth(state)) return { ok: false, reason: "Widen the lot first" };

  const x = clampTile(state, tile, def.cols);
  const g = occupancyGrid(state);
  for (let f = floor; f < floor + def.rows; f++) {
    for (let c = x; c < x + def.cols; c++) {
      if (g.has(key(f, c))) return { ok: false, reason: "Blocked" };
    }
  }
  if (state.money < def.cost) return { ok: false, reason: "Not enough funds" };
  return { ok: true, cost: def.cost, floor, x };
}

export function place(state: SimState, tool: Tool, floor: number, tile: number): SimEvent[] {
  const events: SimEvent[] = [];
  if (tool === "widen") {
    const mid = (state.left + state.right) / 2;
    return expandPlot(state, tile < mid ? "left" : "right");
  }

  const q = queryPlace(state, tool, floor, tile);
  if (!q.ok) {
    events.push({ kind: "error", text: q.reason ?? "Cannot build" });
    return events;
  }

  if (tool === "bulldoze") {
    const g = occupancyGrid(state);
    const id = g.get(key(floor, tile));
    if (!id) return events;
    const room = state.rooms.find((r) => r.id === id);
    const shaft = state.shafts.find((s) => s.id === id);
    if (room) {
      const refund = Math.floor(CATALOG[room.kind].cost * 0.4);
      state.money += refund;
      state.rooms = state.rooms.filter((r) => r.id !== id);
      state.people = state.people.filter((p) => p.roomId !== id);
      events.push({
        kind: "info",
        text: `Removed ${CATALOG[room.kind].name}`,
        amount: refund,
        floor: room.floor,
        x: room.x,
      });
    }
    if (shaft) {
      state.shafts = state.shafts.filter((s) => s.id !== id);
      state.cars = state.cars.filter((c) => c.shaftId !== id);
      events.push({ kind: "info", text: "Elevator shaft removed", floor });
    }
    return events;
  }

  if (tool === "elevator" || tool === "express") {
    const cost = q.cost ?? 0;
    if (state.money < cost) {
      events.push({ kind: "error", text: "Not enough funds" });
      return events;
    }
    state.money -= cost;
    const kind: ElevatorKind = tool === "express" ? "express" : "standard";
    if (q.addCar) {
      state.cars.push(spawnCar(state, q.addCar));
      const n = carsOnShaft(state, q.addCar.id).length;
      events.push({
        kind: "place",
        text: `Car ${n} added to the shaft`,
        floor,
        x: q.addCar.x,
      });
    } else if (q.extend) {
      if (floor > q.extend.maxFloor) q.extend.maxFloor = floor;
      if (floor < q.extend.minFloor) q.extend.minFloor = floor;
      events.push({
        kind: "place",
        text: `${kind === "express" ? "Express" : "Shaft"} extended to floor ${floorLabel(floor)}`,
        floor,
        x: q.extend.x,
      });
    } else {
      const x = q.x ?? tile;
      const id = nid(state, "el");
      const minFloor = q.minF ?? floor;
      const maxFloor = q.maxF ?? floor;
      state.shafts.push({ id, x, minFloor, maxFloor, kind });
      state.cars.push(spawnCar(state, { id, x, minFloor, maxFloor, kind }));
      events.push({
        kind: "place",
        text: kind === "express" ? "Express elevator installed" : "Elevator installed",
        floor,
        x,
      });
    }
    return events;
  }

  const def = CATALOG[tool];
  const x = q.x ?? tile;
  const room: Room = {
    id: nid(state, "r"),
    kind: tool,
    floor,
    x,
    cols: def.cols,
    rows: def.rows,
    leased: 0,
    capacity: def.capacity,
    dirt: 0,
    buildT: 0.35,
  };
  state.money -= def.cost;
  state.rooms.push(room);
  events.push({ kind: "place", text: `${def.name} built`, floor, x, amount: -def.cost });
  return events;
}

export function floorLabel(floor: number): string {
  if (floor === 0) return "L";
  if (floor > 0) return String(floor);
  return `B${-floor}`;
}

function nearestShaft(state: SimState, floor: number, x: number): ElevatorShaft | null {
  let best: ElevatorShaft | null = null;
  let bestD = 1e9;
  for (const s of state.shafts) {
    if (!servedFloors(s).includes(floor)) continue;
    const d = Math.abs(s.x + 1 - x);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

function waitersAt(state: SimState, shaft: ElevatorShaft, floor: number): number {
  const sx = shaft.x + 1;
  let n = 0;
  for (const p of state.people) {
    if (p.state !== "wait") continue;
    if (Math.abs(p.floor - floor) > 0.25) continue;
    if (Math.abs(p.x - sx) > 1.8) continue;
    n++;
  }
  return n;
}

export function pickElevatorShaft(
  state: SimState,
  fromFloor: number,
  fromX: number,
  destFloor: number,
  destX: number,
): ElevatorShaft | null {
  const inLobby = fromFloor === LOBBY_FLOOR;
  let best: ElevatorShaft | null = null;
  let bestScore = 1e9;

  for (const s of state.shafts) {
    if (fromFloor < s.minFloor || fromFloor > s.maxFloor) continue;
    if (shaftKind(s) === "express" && !isExpressStop(fromFloor)) continue;
    const sx = s.x + 1;
    const walkTo = Math.abs(sx - fromX);
    const express = shaftKind(s) === "express";
    let remaining = 0;
    let dropFloor = destFloor;
    if (express) {
      const drop = nearestExpressStop(s, destFloor);
      if (drop == null) continue;
      dropFloor = drop;
      remaining = Math.abs(destFloor - drop);
      if (remaining >= Math.abs(destFloor - fromFloor) - 0.1) continue;
    } else if (destFloor < s.minFloor || destFloor > s.maxFloor) {
      continue;
    }

    const cars = carsOnShaft(state, s.id);
    const load = cars.reduce((n, c) => n + c.passengers.length, 0);
    const carN = Math.max(1, cars.length);
    const queued = waitersAt(state, s, fromFloor);
    const walkFrom = Math.abs(sx - destX);
    const floors = Math.abs(dropFloor - fromFloor);
    const towardDest = inLobby ? walkFrom + walkTo * 0.35 : walkTo + walkFrom * 0.4;
    let score = towardDest + queued * 2.4 + (load / carN) * 0.9 + remaining * 1.6 - (carN - 1) * 1.4;
    if (express) {
      if (floors < EXPRESS_STEP) score += 8;
      else score -= floors * 0.55;
    }
    if (score < bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

function beginTrip(p: Person, floor: number, x: number) {
  p.destFloor = floor;
  p.goalX = x;
  p.destX = x;
  p.board = false;
  p.stairs = false;
}

function stairsAt(state: SimState, floor: number, toward: number): Room | null {
  const lo = Math.min(floor, toward);
  return state.rooms.find((r) => r.kind === "stairs" && r.floor === lo) ?? null;
}

function streetX(state: SimState): number {
  return state.left - 1.5;
}

function roomCenter(r: Room): number {
  return r.x + r.cols / 2;
}

function callCar(car: ElevatorCar, floor: number) {
  if (!car.stops.includes(floor)) car.stops.push(floor);
}

function callShaft(state: SimState, shaft: ElevatorShaft, floor: number) {
  const cars = carsOnShaft(state, shaft.id);
  if (!cars.length) return;
  const already = cars.find(
    (c) =>
      c.stops.includes(floor) ||
      (Math.abs(c.floor - floor) < 0.35 && (c.state === "door" || c.state === "idle")),
  );
  if (already) {
    callCar(already, floor);
    return;
  }
  let best = cars[0]!;
  let bestScore = 1e9;
  for (const car of cars) {
    const dist = Math.abs(car.floor - floor);
    let score = dist + car.passengers.length * 0.7 + car.stops.length * 1.1;
    if (car.state === "idle") score -= 2.5;
    if (car.dir > 0 && floor >= car.floor - 0.05) score -= 2;
    if (car.dir < 0 && floor <= car.floor + 0.05) score -= 2;
    if (score < bestScore) {
      bestScore = score;
      best = car;
    }
  }
  callCar(best, floor);
}

function pickDest(car: ElevatorCar, shaft: ElevatorShaft): number | null {
  let stops = car.stops;
  if (shaftKind(shaft) === "express") stops = stops.filter((f) => isExpressStop(f));
  if (!stops.length) return null;
  const inDir = stops.filter((f) => (car.dir >= 0 ? f >= car.floor - 0.05 : f <= car.floor + 0.05));
  const pool = inDir.length ? inDir : stops;
  pool.sort((a, b) => (car.dir >= 0 ? a - b : b - a));
  const next = pool[0]!;
  return Math.max(shaft.minFloor, Math.min(shaft.maxFloor, next));
}

function carAccel(shaft: ElevatorShaft): number {
  return shaftKind(shaft) === "express" ? EXPRESS_ACCEL : ELEVATOR_ACCEL;
}

function stepCars(state: SimState, dt: number, events: SimEvent[]) {
  for (const car of state.cars) {
    car.prevFloor = car.floor;
    const shaft = state.shafts.find((s) => s.id === car.shaftId);
    if (!shaft) continue;

    if (car.state === "idle") {
      const dest = pickDest(car, shaft);
      if (dest == null) {
        car.dir = 0;
        car.vel = 0;
        continue;
      }
      if (Math.abs(dest - car.floor) < 0.04) {
        car.floor = dest;
        car.vel = 0;
        car.state = "door";
        car.doorTarget = 1;
        car.dwell = 0;
        car.stops = car.stops.filter((f) => Math.abs(f - dest) > 0.2);
        continue;
      }
      if (car.door > 0.04) {
        car.doorTarget = 0;
        car.door = Math.max(0, car.door - dt / DOOR_TIME);
        continue;
      }
      car.dest = dest;
      car.dir = dest > car.floor ? 1 : -1;
      car.vel = 0;
      car.state = "move";
      car.door = 0;
      car.doorTarget = 0;
    }

    if (car.state === "move") {
      const maxV = carSpeed(shaft);
      const acc = carAccel(shaft);
      const remaining = (car.dest - car.floor) * (car.dir || Math.sign(car.dest - car.floor) || 1);
      if (remaining <= 0.02 || car.dir === 0) {
        car.floor = car.dest;
        car.vel = 0;
        car.state = "door";
        car.doorTarget = 1;
        car.dwell = 0;
        car.stops = car.stops.filter((f) => Math.abs(f - car.dest) > 0.2);
      } else {
        const stopDist = (car.vel * car.vel) / (2 * Math.max(0.1, acc));
        if (remaining <= stopDist) {
          car.vel = Math.max(0, car.vel - acc * dt);
        } else {
          car.vel = Math.min(maxV, car.vel + acc * dt);
        }
        const step = Math.min(remaining, Math.max(car.vel, 0.12) * dt);
        car.floor += car.dir * step;
        if ((car.dir > 0 && car.floor >= car.dest) || (car.dir < 0 && car.floor <= car.dest)) {
          car.floor = car.dest;
          car.vel = 0;
          car.state = "door";
          car.doorTarget = 1;
          car.dwell = 0;
          car.stops = car.stops.filter((f) => Math.abs(f - car.dest) > 0.2);
        }
      }
    }

    if (car.state === "door") {
      const spd = 1 / DOOR_TIME;
      if (car.door < car.doorTarget) car.door = Math.min(car.doorTarget, car.door + dt * spd);
      else car.door = Math.max(car.doorTarget, car.door - dt * spd);

      if (car.doorTarget === 1 && car.door > 0.92) {
        const fl = Math.round(car.floor);
        const before = car.passengers.length;
        for (let i = car.passengers.length - 1; i >= 0; i--) {
          const pid = car.passengers[i]!;
          const p = state.people.find((x) => x.id === pid);
          if (!p) {
            car.passengers.splice(i, 1);
            continue;
          }
          if (Math.abs(p.destFloor - fl) < 0.2 || Math.abs(alightFloor(shaft, p.destFloor) - fl) < 0.2) {
            p.floor = fl;
            p.prevFloor = fl;
            p.x = shaft.x + 1;
            p.prevX = p.x;
            p.destX = p.goalX ?? p.destX;
            p.state = "walk";
            p.carId = null;
            p.board = false;
            p.stairs = false;
            car.passengers.splice(i, 1);
          }
        }
        const waiting = state.people.filter(
          (p) => p.state === "wait" && Math.abs(p.floor - fl) < 0.2 && Math.abs(p.x - (shaft.x + 1)) < 1.6,
        );
        for (const p of waiting) {
          if (car.passengers.length >= carCap(shaft)) break;
          p.state = "ride";
          p.carId = car.id;
          p.wait = 0;
          car.passengers.push(p.id);
          callCar(car, alightFloor(shaft, p.destFloor));
        }
        const used = before !== car.passengers.length;
        if (car.dwell <= 0) {
          car.dwell = DWELL_TIME;
          if (used) events.push({ kind: "ding", text: "", floor: fl, x: shaft.x });
        } else {
          car.dwell -= dt;
          if (car.dwell <= 0) {
            car.dwell = 0;
            car.doorTarget = 0;
          }
        }
      }

      if (car.doorTarget === 0 && car.door < 0.04) {
        car.door = 0;
        const dest = pickDest(car, shaft);
        if (dest == null) {
          car.state = "idle";
          car.dir = 0;
          car.vel = 0;
        } else if (Math.abs(dest - car.floor) < 0.04) {
          car.floor = dest;
          car.state = "door";
          car.doorTarget = 1;
          car.dwell = 0;
          car.stops = car.stops.filter((f) => Math.abs(f - dest) > 0.2);
        } else {
          car.dest = dest;
          car.dir = dest > car.floor ? 1 : dest < car.floor ? -1 : 0;
          car.vel = 0;
          car.state = car.dir === 0 ? "idle" : "move";
        }
      }
    }

    for (const pid of car.passengers) {
      const p = state.people.find((x) => x.id === pid);
      if (p) {
        p.prevFloor = p.floor;
        p.prevX = p.x;
        p.floor = car.floor;
        p.x = shaft.x + 1;
      }
    }
  }
}

function routePerson(state: SimState, p: Person) {
  if (p.goalX == null) p.goalX = p.destX;
  if (Math.abs(p.floor - p.destFloor) < 0.15) {
    p.destX = p.goalX;
    p.state = p.state === "enter" ? "enter" : "walk";
    p.board = false;
    p.stairs = false;
    return;
  }
  const shaft = pickElevatorShaft(
    state,
    Math.round(p.floor),
    p.x,
    p.destFloor,
    p.goalX,
  );
  if (shaft && p.destFloor >= shaft.minFloor && p.destFloor <= shaft.maxFloor) {
    p.destX = shaft.x + 1;
    p.state = p.state === "enter" ? "enter" : "walk";
    p.board = true;
    p.stairs = false;
    return;
  }
  const st = stairsAt(state, Math.round(p.floor), p.destFloor);
  if (st) {
    p.destX = roomCenter(st);
    p.stairs = true;
    p.board = false;
    p.state = p.state === "enter" ? "enter" : "walk";
    return;
  }
  if (shaft) {
    p.board = true;
    p.stairs = false;
    p.destX = shaft.x + 1;
    p.state = p.state === "enter" ? "enter" : "walk";
  }
}

function nearestOpen(state: SimState, kind: RoomKind, fromFloor: number): Room | null {
  const t = state.time;
  let best: Room | null = null;
  let bestD = 1e9;
  for (const r of state.rooms) {
    if (r.kind !== kind || r.buildT > 0) continue;
    if (!inOpenHours(kind, t)) continue;
    const d = Math.abs(r.floor - fromFloor);
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best;
}

function stepPeople(state: SimState, dt: number, events: SimEvent[]) {
  const reach = accessSet(state);
  const exitX = streetX(state);
  for (const p of state.people) {
    if (p.state === "ride") continue;
    p.prevX = p.x;
    p.prevFloor = p.floor;

    if (p.state === "occupy") {
      const crossed = state.time >= p.occupyUntil && !(p.occupyUntil < 0.2 && state.time > 0.25 && p.occupyUntil > 0);
      if (!crossed) continue;
      const room = state.rooms.find((r) => r.id === p.roomId);
      if (p.role === "worker") {
        const h = state.time;
        if (h >= 0.48 && h < 0.56) {
          const food = nearestOpen(state, "fastfood", p.floor) ?? nearestOpen(state, "restaurant", p.floor);
          if (food) {
            beginTrip(p, food.floor, roomCenter(food));
            p.state = "walk";
            routePerson(state, p);
            p.occupyUntil = 0.6;
            continue;
          }
        }
        if (h >= 0.72) {
          beginTrip(p, LOBBY_FLOOR, exitX);
          p.state = "walk";
          routePerson(state, p);
          p.occupyUntil = 1;
        }
      } else if (p.role === "guest" && room && state.time >= 0.28 && state.time < 0.7) {
        beginTrip(p, room.floor, roomCenter(room));
        p.state = "walk";
        routePerson(state, p);
        p.occupyUntil = 0.92;
      } else if (p.role === "resident" && room) {
        if (state.time >= 0.34 && state.time < 0.7) {
          const shop = nearestOpen(state, "shop", p.floor) ?? nearestOpen(state, "fastfood", p.floor);
          if (shop && rng(state) < 0.4) {
            beginTrip(p, shop.floor, roomCenter(shop));
            p.state = "walk";
            routePerson(state, p);
            p.occupyUntil = Math.min(0.78, state.time + 0.08);
          }
        } else if (state.time >= 0.78) {
          beginTrip(p, room.floor, roomCenter(room));
          p.state = "walk";
          routePerson(state, p);
          p.occupyUntil = 1.05;
        }
      } else if (p.role === "customer") {
        beginTrip(p, LOBBY_FLOOR, exitX);
        p.state = "walk";
        routePerson(state, p);
      }
      continue;
    }

    if (p.state === "wait") {
      p.wait += dt;
      p.anger += dt * 0.35;
      const shaft = nearestShaft(state, Math.round(p.floor), p.x);
      if (shaft) callShaft(state, shaft, Math.round(p.floor));
      if (p.wait > 22) {
        events.push({ kind: "complaint", text: `${p.name} gave up on the elevator`, floor: Math.round(p.floor) });
        beginTrip(p, LOBBY_FLOOR, exitX);
        p.state = "walk";
        p.wait = 0;
        const room = state.rooms.find((r) => r.id === p.roomId);
        if (room && (p.role === "worker" || p.role === "guest" || p.role === "resident") && rng(state) < 0.35) {
          room.leased = Math.max(0, room.leased - 1);
          events.push({
            kind: "vacate",
            text: `${CATALOG[room.kind].name} lost a tenant`,
            floor: room.floor,
            x: room.x,
          });
          p.roomId = "";
        }
      }
      continue;
    }

    if (p.state === "walk" || p.state === "enter" || p.state === "exit") {
      if (Math.abs(p.floor - p.destFloor) > 0.2 && !p.board && !p.stairs) {
        routePerson(state, p);
      }
      const dx = p.destX - p.x;
      p.dir = dx >= 0 ? 1 : -1;
      const step = Math.sign(dx) * WALK_SPEED * dt;
      if (Math.abs(dx) <= Math.abs(step) + 0.05) {
        p.x = p.destX;
        if (p.stairs && Math.abs(p.floor - p.destFloor) > 0.2) {
          const toward = p.destFloor > p.floor ? 1 : -1;
          p.floor += toward * Math.min(1, 1.6 * dt);
          if (Math.abs(p.floor - Math.round(p.floor)) < 0.08) p.floor = Math.round(p.floor);
          if (Math.abs(p.floor - p.destFloor) < 0.15) {
            p.floor = p.destFloor;
            p.stairs = false;
            p.board = false;
            routePerson(state, p);
          }
        } else if (p.board && Math.abs(p.floor - p.destFloor) > 0.2) {
          p.state = "wait";
          p.board = false;
          const shaft = nearestShaft(state, Math.round(p.floor), p.x);
          if (shaft) callShaft(state, shaft, Math.round(p.floor));
        } else if (p.destX < state.left && (p.state === "exit" || (p.destFloor === LOBBY_FLOOR && p.destX < state.left + 0.5))) {
          p.state = "exit";
        } else {
          const room = state.rooms.find((r) => r.id === p.roomId);
          if (room && Math.abs(p.floor - room.floor) < 0.3 && p.x >= room.x && p.x <= room.x + room.cols) {
            p.state = "occupy";
            if (p.role === "worker") p.occupyUntil = state.time < 0.5 ? 0.5 : 0.74;
            else if (p.role === "customer") {
              const hall = state.rooms.find((r) => r.id === p.roomId);
              p.occupyUntil =
                hall?.kind === "ballroom" && hall.eventEnd
                  ? Math.max(state.time + 0.04, (hall.eventEnd % 1) || 0.9)
                  : Math.min(0.98, state.time + 0.06);
            }
            else if (p.role === "guest") p.occupyUntil = 0.28;
            else p.occupyUntil = 0.34;
            if (p.role === "customer") {
              const pay = CATALOG[room.kind].visitPay;
              if (pay) {
                state.money += pay;
                events.push({ kind: "income", text: `+$${pay}`, amount: pay, floor: room.floor, x: room.x });
              }
            }
          } else if (p.role === "customer") {
            const visit = state.rooms.find(
              (r) => Math.abs(r.floor - p.destFloor) < 0.3 && p.destX >= r.x && p.destX <= r.x + r.cols,
            );
            if (visit) {
              p.roomId = visit.id;
              p.state = "occupy";
              p.occupyUntil = Math.min(0.98, state.time + 0.05);
              const pay = CATALOG[visit.kind].visitPay;
              if (pay) {
                state.money += pay;
                events.push({ kind: "income", text: `+$${pay}`, amount: pay, floor: visit.floor, x: visit.x });
              }
            }
          } else {
            p.board = false;
            p.stairs = false;
            routePerson(state, p);
          }
        }
      } else {
        p.x += step;
      }
    }

    if (!reach.has(Math.round(p.destFloor)) && p.state !== "exit") {
      p.anger += dt * 0.1;
    }
  }

  state.people = state.people.filter((p) => {
    if (p.state === "exit" && p.x < state.left - 0.2 && Math.round(p.floor) === LOBBY_FLOOR) return false;
    return true;
  });
}

function spawnWorker(state: SimState, room: Room): Person {
  const p: Person = {
    id: nid(state, "p"),
    name: personName(state.idSeq * 17 + state.day),
    role: "worker",
    roomId: room.id,
    floor: LOBBY_FLOOR,
    x: streetX(state),
    prevFloor: LOBBY_FLOOR,
    prevX: streetX(state),
    destFloor: room.floor,
    destX: roomCenter(room),
    goalX: roomCenter(room),
    state: "enter",
    wait: 0,
    occupyUntil: 0.74,
    dir: 1,
    shirt: rng(state),
    skin: rng(state),
    hair: rng(state),
    phase: rng(state) * Math.PI * 2,
    anger: 0,
    carId: null,
  };
  routePerson(state, p);
  return p;
}

function tryLeases(state: SimState, events: SimEvent[]) {
  const reach = accessSet(state);
  const hasFood = hasKind(state, "fastfood") || hasKind(state, "restaurant");
  const t = state.time;

  for (const room of state.rooms) {
    if (room.buildT > 0) continue;
    const def = CATALOG[room.kind];
    if (!def.capacity) continue;
    if (!reach.has(room.floor) && room.kind !== "lobby" && room.kind !== "parking") continue;

    if (room.kind === "office" && t >= 0.32 && t < 0.45 && room.leased < room.capacity) {
      if (!hasFood && room.leased >= 1) continue;
      if (state.people.length >= MAX_PEOPLE) continue;
      const already = state.people.filter((p) => p.roomId === room.id && p.role === "worker").length;
      if (already >= room.leased && room.leased < room.capacity && rng(state) < 0.04) {
        room.leased += 1;
        events.push({
          kind: "lease",
          text: `${personName(state.idSeq).split(" ")[0]} leased an office`,
          floor: room.floor,
          x: room.x,
        });
      }
      if (already < room.leased && rng(state) < 0.22) {
        state.people.push(spawnWorker(state, room));
      }
    }

    if (isHotelRoom(room.kind) && (t >= 0.7 || t < 0.12) && room.leased < room.capacity) {
      if (rng(state) < 0.03 && state.people.length < MAX_PEOPLE) {
        room.leased += 1;
        const p: Person = {
          id: nid(state, "p"),
          name: personName(state.idSeq * 13 + 3),
          role: "guest",
          roomId: room.id,
          floor: LOBBY_FLOOR,
          x: streetX(state),
          prevFloor: LOBBY_FLOOR,
          prevX: streetX(state),
          destFloor: room.floor,
          destX: roomCenter(room),
          goalX: roomCenter(room),
          state: "enter",
          wait: 0,
          occupyUntil: 0.28,
          dir: 1,
          shirt: rng(state),
          skin: rng(state),
          hair: rng(state),
          phase: rng(state) * 6.2,
          anger: 0,
          carId: null,
        };
        routePerson(state, p);
        state.people.push(p);
        events.push({ kind: "lease", text: `${p.name.split(" ")[0]} checked in`, floor: room.floor, x: room.x });
      }
    }

    if (room.kind === "condo" && room.leased < room.capacity && t >= 0.4 && t < 0.7 && rng(state) < 0.012) {
      room.leased += 1;
      events.push({ kind: "lease", text: `Condo leased on ${floorLabel(room.floor)}`, floor: room.floor, x: room.x });
    }

    if (room.kind === "parking" && room.leased < room.capacity && rng(state) < 0.01) {
      room.leased += 1;
    }
  }

  if (t >= 0.33 && t < 0.42) {
    for (const room of state.rooms) {
      if (room.kind !== "office" || room.leased === 0 || room.buildT > 0) continue;
      const here = state.people.filter((p) => p.roomId === room.id && p.role === "worker").length;
      if (here < room.leased && state.people.length < MAX_PEOPLE && rng(state) < 0.25) {
        state.people.push(spawnWorker(state, room));
      }
    }
    for (const room of state.rooms) {
      if (room.kind !== "condo" || room.leased === 0) continue;
      const here = state.people.filter((p) => p.roomId === room.id && p.role === "resident").length;
      if (here < room.leased && t < 0.36 && rng(state) < 0.3 && state.people.length < MAX_PEOPLE) {
        state.people.push({
          id: nid(state, "p"),
          name: personName(state.idSeq * 9),
          role: "resident",
          roomId: room.id,
          floor: room.floor,
          x: roomCenter(room),
          prevFloor: room.floor,
          prevX: roomCenter(room),
          destFloor: room.floor,
          destX: roomCenter(room),
          goalX: roomCenter(room),
          state: "occupy",
          wait: 0,
          occupyUntil: 0.36,
          dir: 1,
          shirt: rng(state),
          skin: rng(state),
          hair: rng(state),
          phase: rng(state) * 6.2,
          anger: 0,
          carId: null,
        });
      }
    }
  }

  if (((t >= 0.48 && t < 0.58) || (t >= 0.72 && t < 0.85)) && state.people.length < MAX_PEOPLE && rng(state) < 0.12) {
    const kinds: RoomKind[] = ["fastfood", "shop", "restaurant", "theater", "medical", "ballroom"];
    const open = state.rooms.filter(
      (r) =>
        kinds.includes(r.kind) &&
        r.buildT <= 0 &&
        inOpenHours(r.kind, t) &&
        (r.kind !== "ballroom" || Boolean(r.eventKind)),
    );
    if (open.length) {
      const room = open[Math.floor(rng(state) * open.length)]!;
      const p: Person = {
        id: nid(state, "p"),
        name: personName(state.idSeq * 5 + 1),
        role: "customer",
        roomId: room.id,
        floor: LOBBY_FLOOR,
        x: streetX(state),
        prevFloor: LOBBY_FLOOR,
        prevX: streetX(state),
        destFloor: room.floor,
        destX: roomCenter(room),
        goalX: roomCenter(room),
        state: "enter",
        wait: 0,
        occupyUntil: Math.min(0.95, t + 0.06),
        dir: 1,
        shirt: rng(state),
        skin: rng(state),
        hair: rng(state),
        phase: rng(state) * 6.2,
        anger: 0,
        carId: null,
      };
      routePerson(state, p);
      state.people.push(p);
    }
  }
}

export const BALL_EVENTS: Record<BallEvent, { label: string; base: number; guestPay: number }> = {
  gala: { label: "Gala", base: 2_200, guestPay: 95 },
  wedding: { label: "Wedding", base: 3_600, guestPay: 120 },
  recital: { label: "Recital", base: 1_500, guestPay: 70 },
};

const BALL_KIND_LIST: BallEvent[] = ["gala", "wedding", "recital"];

function nowAbs(state: SimState): number {
  return state.day + state.time;
}

function spawnBallGuest(state: SimState, room: Room) {
  const p: Person = {
    id: nid(state, "p"),
    name: personName(state.idSeq * 5 + 3),
    role: "customer",
    roomId: room.id,
    floor: LOBBY_FLOOR,
    x: streetX(state),
    prevFloor: LOBBY_FLOOR,
    prevX: streetX(state),
    destFloor: room.floor,
    destX: roomCenter(room),
    goalX: roomCenter(room),
    state: "enter",
    wait: 0,
    occupyUntil: Math.min(0.96, (room.eventEnd ?? nowAbs(state) + 0.12) % 1 || 0.9),
    dir: 1,
    shirt: rng(state),
    skin: rng(state),
    hair: rng(state),
    phase: rng(state) * 6.2,
    anger: 0,
    carId: null,
  };
  routePerson(state, p);
  state.people.push(p);
}

function stepBallroomEvents(state: SimState, events: SimEvent[]) {
  const now = nowAbs(state);
  for (const room of state.rooms) {
    if (room.kind !== "ballroom" || room.buildT > 0) continue;

    if (room.eventKind && now >= (room.eventEnd ?? 0)) {
      const guests = state.people.filter(
        (p) => p.roomId === room.id && (p.state === "occupy" || p.state === "ride" || p.state === "wait"),
      ).length;
      const def = BALL_EVENTS[room.eventKind];
      const starMul = 1 + (state.stars - 1) * 0.14;
      const catering = hasKind(state, "restaurant") ? 1.18 : 1;
      const payout = Math.round((def.base + guests * def.guestPay) * starMul * catering);
      state.money += payout;
      events.push({
        kind: "income",
        text: `${def.label} · +$${payout.toLocaleString("en-US")}`,
        amount: payout,
        floor: room.floor,
        x: room.x + room.cols / 2,
      });
      room.eventKind = null;
      room.eventEnd = 0;
      room.leased = 0;
      continue;
    }

    if (room.eventKind) {
      const heading = state.people.filter((p) => p.roomId === room.id).length;
      room.leased = Math.min(room.capacity, heading);
      if (heading < Math.min(room.capacity, 10 + state.stars * 2) && state.people.length < MAX_PEOPLE && rng(state) < 0.18) {
        spawnBallGuest(state, room);
      }
      continue;
    }

    const evening = state.time >= 0.66 && state.time < 0.78;
    if (!evening) continue;
    if ((room.lastEventDay ?? -1) === state.day) continue;
    if (rng(state) > 0.045) continue;

    const kind = BALL_KIND_LIST[Math.floor(rng(state) * BALL_KIND_LIST.length)]!;
    room.eventKind = kind;
    room.eventEnd = now + 0.15;
    room.lastEventDay = state.day;
    const wave = 6 + state.stars;
    for (let i = 0; i < wave && state.people.length < MAX_PEOPLE; i++) {
      spawnBallGuest(state, room);
    }
    room.leased = Math.min(room.capacity, wave);
    events.push({
      kind: "info",
      text: `${BALL_EVENTS[kind].label} in the ballroom tonight`,
      floor: room.floor,
      x: room.x,
    });
  }
}

function collectRent(state: SimState, events: SimEvent[]) {
  let income = 0;
  let upkeep = 0;
  for (const r of state.rooms) {
    const def = CATALOG[r.kind];
    income += def.rent * r.leased;
    upkeep += r.cols * r.rows * 6;
    if (isHotelRoom(r.kind)) {
      r.leased = Math.min(
        r.leased,
        state.people.filter((p) => p.roomId === r.id && p.role === "guest").length,
      );
    }
  }
  const net = income - upkeep;
  state.money += net;
  events.push({
    kind: "income",
    text: net >= 0 ? `Morning books +$${net}` : `Upkeep ${net}`,
    amount: net,
  });
}

export function avgWaitTime(state: SimState): number {
  const waiters = state.people.filter((p) => p.state === "wait");
  if (!waiters.length) return 0;
  return waiters.reduce((a, p) => a + p.wait, 0) / waiters.length;
}

function floorCrowded(state: SimState): boolean {
  const w = plotWidth(state);
  const used = new Map<number, number>();
  for (const r of state.rooms) {
    for (let f = r.floor; f < r.floor + r.rows; f++) {
      used.set(f, (used.get(f) ?? 0) + r.cols);
    }
  }
  for (const s of state.shafts) {
    for (let f = s.minFloor; f <= s.maxFloor; f++) {
      used.set(f, (used.get(f) ?? 0) + 2);
    }
  }
  for (const n of used.values()) {
    if (w - n < 6) return true;
  }
  return false;
}

export function currentHint(state: SimState): string | null {
  const hasLobby = hasKind(state, "lobby");
  if (!hasLobby) return "Place a lobby on the ground floor to open the tower.";
  if (!state.shafts.length && !state.rooms.some((r) => r.kind === "stairs")) {
    return "Add an elevator so tenants can reach the upper floors.";
  }
  if (!hasKind(state, "office")) return "Build an office above the lobby to start collecting rent.";
  if (hasKind(state, "office") && !hasKind(state, "fastfood") && !hasKind(state, "restaurant")) {
    return "Workers need a cafe or they will walk out at lunch.";
  }
  if (canWiden(state) && floorCrowded(state)) {
    return "Floors are packing tight. Click either end of the lot to buy more bays.";
  }
  if (state.stars === 1 && population(state) >= 10) return "Grow your population. Hotels, shops, and restaurants unlock at two stars.";
  if (state.stars === 2) {
    if (!hasKind(state, "shop") || !hasKind(state, "restaurant")) {
      return "A boutique and a restaurant — both unlocked now — will push you to three stars.";
    }
    return "Fill the boutique and restaurant, then grow the crowd for three stars.";
  }
  if (state.stars === 3) return "Condos and a clinic climb toward four stars. Express elevators skip every fifth floor.";
  if (state.stars === 4) return "A theater or a ballroom, plus a clinic, seal five stars. Galas pay when the night ends.";
  if (avgWaitTime(state) > 8) return "Elevators are backing up. Click a shaft to add another car — they pass through each other.";
  return null;
}

export function dailyIncome(state: SimState): number {
  let n = 0;
  for (const r of state.rooms) n += CATALOG[r.kind].rent * r.leased;
  return n;
}

export function vacantCount(state: SimState): number {
  let n = 0;
  for (const r of state.rooms) {
    if (r.capacity > 0) n += Math.max(0, r.capacity - r.leased);
  }
  return n;
}

export function occupiedFloors(state: SimState): number {
  const set = new Set<number>();
  for (const r of state.rooms) set.add(r.floor);
  for (const s of state.shafts) {
    for (let f = s.minFloor; f <= s.maxFloor; f++) set.add(f);
  }
  return set.size;
}

export function stepSim(state: SimState, dt: number): SimEvent[] {
  const events: SimEvent[] = [];
  const prevStars = state.stars;

  for (const r of state.rooms) {
    if (r.buildT > 0) r.buildT = Math.max(0, r.buildT - dt / 8);
  }

  state.time += dt / DAY_LENGTH;
  if (state.time >= 1) {
    state.time -= 1;
    state.day += 1;
    collectRent(state, events);
  }

  stepCars(state, dt, events);
  stepPeople(state, dt, events);
  tryLeases(state, events);
  stepBallroomEvents(state, events);

  const stars = evalStars(state);
  if (stars > prevStars) {
    state.stars = stars;
    events.push({ kind: "star", text: `${stars}-star tower`, stars });
  } else {
    state.stars = Math.max(state.stars, stars);
  }

  if (state.money < 0) state.money = 0;
  return events;
}

export function seedDemo(): SimState {
  const s = emptyState();
  s.money = 80_000;
  s.stars = 3;
  s.time = 0.42;
  s.day = 18;

  const put = (kind: RoomKind, floor: number, x: number, leased = 0) => {
    const def = CATALOG[kind];
    s.rooms.push({
      id: nid(s, "r"),
      kind,
      floor,
      x,
      cols: def.cols,
      rows: def.rows,
      leased: Math.min(def.capacity, leased),
      capacity: def.capacity,
      dirt: 0,
      buildT: 0,
    });
  };

  put("lobby", 0, 0);
  put("lobby", 0, 6);
  put("fastfood", 0, 16);
  put("office", 1, 0, 4);
  put("office", 1, 6, 3);
  put("office", 2, 0, 4);
  put("office", 2, 6, 4);
  put("shop", 2, 16, 0);
  put("office", 3, 0, 3);
  put("hotel", 3, 6, 2);
  put("single", 3, 10, 1);
  put("single", 3, 12, 1);
  put("restaurant", 4, 0, 0);
  put("condo", 5, 0, 3);
  put("condo", 5, 8, 2);
  put("hotel", 6, 0, 2);
  put("single", 6, 4, 1);
  put("single", 6, 6, 0);
  put("suite", 7, 0, 2);
  put("parking", -1, 0, 4);
  put("parking", -1, 8, 3);

  s.rooms.push({
    id: nid(s, "r"),
    kind: "stairs",
    floor: 0,
    x: 20,
    cols: 2,
    rows: 1,
    leased: 0,
    capacity: 0,
    dirt: 0,
    buildT: 0,
  });

  const id = nid(s, "el");
  s.shafts.push({ id, x: 14, minFloor: -1, maxFloor: 7, kind: "standard" });
  s.cars.push({
    id: nid(s, "car"),
    shaftId: id,
    floor: 1,
    prevFloor: 1,
    dest: 3,
    dir: 1,
    vel: 1.6,
    state: "move",
    door: 0,
    doorTarget: 0,
    dwell: 0,
    passengers: [],
    stops: [0, 2, 5],
  });
  s.cars.push({
    id: nid(s, "car"),
    shaftId: id,
    floor: 6,
    prevFloor: 6,
    dest: 2,
    dir: -1,
    vel: 1.4,
    state: "move",
    door: 0,
    doorTarget: 0,
    dwell: 0,
    passengers: [],
    stops: [0, 4],
  });

  for (const room of s.rooms) {
    if (room.kind !== "office" && room.kind !== "condo" && !isHotelRoom(room.kind)) continue;
    const role = room.kind === "office" ? "worker" : room.kind === "condo" ? "resident" : "guest";
    for (let i = 0; i < room.leased; i++) {
      s.people.push({
        id: nid(s, "p"),
        name: personName(s.idSeq * 11),
        role,
        roomId: room.id,
        floor: room.floor,
        x: room.x + 1.2 + i * 1.4,
        prevFloor: room.floor,
        prevX: room.x + 1.2 + i * 1.4,
        destFloor: room.floor,
        destX: roomCenter(room),
        goalX: roomCenter(room),
        state: "occupy",
        wait: 0,
        occupyUntil: role === "worker" ? 0.5 : 0.85,
        dir: 1,
        shirt: rng(s),
        skin: rng(s),
        hair: rng(s),
        phase: rng(s) * 6.2,
        anger: 0,
        carId: null,
      });
    }
  }
  return s;
}

export function serialize(state: SimState): string {
  return JSON.stringify({ version: 1, state });
}

export function deserialize(raw: string): SimState | null {
  try {
    const data = JSON.parse(raw) as { version?: number; state?: SimState };
    if (!data?.state) return null;
    const s = emptyState();
    Object.assign(s, data.state);
    s.rooms = s.rooms ?? [];
    s.shafts = s.shafts ?? [];
    s.cars = s.cars ?? [];
    s.people = s.people ?? [];
    if (typeof s.left !== "number" || Number.isNaN(s.left)) s.left = 0;
    if (typeof s.right !== "number" || Number.isNaN(s.right) || s.right <= s.left) {
      s.right = s.left + START_COLS;
    }
    s.left = Math.round(s.left);
    s.right = Math.round(s.right);
    for (const p of s.people) {
      if (typeof p.goalX !== "number" || Number.isNaN(p.goalX)) p.goalX = p.destX;
    }
    for (const sh of s.shafts) {
      if (sh.kind !== "express") sh.kind = "standard";
    }
    for (const c of s.cars) {
      if (typeof c.vel !== "number" || Number.isNaN(c.vel)) c.vel = 0;
      if (typeof c.dwell !== "number" || Number.isNaN(c.dwell)) c.dwell = 0;
    }
    return s;
  } catch {
    return null;
  }
}
