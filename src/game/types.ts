export type RoomKind =
  | "lobby"
  | "stairs"
  | "elevator"
  | "express"
  | "office"
  | "fastfood"
  | "hotel"
  | "single"
  | "shop"
  | "parking"
  | "condo"
  | "restaurant"
  | "medical"
  | "theater"
  | "suite";

export type ExpandSide = "left" | "right";

export type Tool = RoomKind | "bulldoze" | "widen";

export type RoomGroup = "transit" | "work" | "stay" | "food" | "retail" | "service";

export type Zone = "any" | "ground" | "above" | "below";

export type PersonRole = "worker" | "guest" | "resident" | "customer";

export type PersonState = "enter" | "walk" | "wait" | "ride" | "occupy" | "exit";

export type CarState = "idle" | "move" | "door";

export interface RoomDef {
  id: RoomKind;
  name: string;
  blurb: string;
  cols: number;
  rows: number;
  cost: number;
  stars: number;
  capacity: number;
  rent: number;
  visitPay: number;
  zone: Zone;
  group: RoomGroup;
  icon: string;
}

export interface Room {
  id: string;
  kind: RoomKind;
  floor: number;
  x: number;
  cols: number;
  rows: number;
  leased: number;
  capacity: number;
  dirt: number;
  buildT: number;
}

export type ElevatorKind = "standard" | "express";

export interface ElevatorShaft {
  id: string;
  x: number;
  minFloor: number;
  maxFloor: number;
  kind: ElevatorKind;
}

export interface ElevatorCar {
  id: string;
  shaftId: string;
  floor: number;
  prevFloor: number;
  dest: number;
  dir: -1 | 0 | 1;
  state: CarState;
  door: number;
  doorTarget: number;
  passengers: string[];
  stops: number[];
}

export interface Person {
  id: string;
  name: string;
  role: PersonRole;
  roomId: string;
  floor: number;
  x: number;
  prevFloor: number;
  prevX: number;
  destFloor: number;
  destX: number;
  goalX: number;
  state: PersonState;
  wait: number;
  occupyUntil: number;
  dir: 1 | -1;
  shirt: number;
  skin: number;
  hair: number;
  phase: number;
  anger: number;
  carId: string | null;
  board?: boolean;
  stairs?: boolean;
}

export interface FloatText {
  id: string;
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
}

export interface SimEvent {
  kind: "lease" | "vacate" | "income" | "star" | "complaint" | "info" | "place" | "error";
  text: string;
  amount?: number;
  floor?: number;
  x?: number;
  stars?: number;
}

export interface SimState {
  money: number;
  day: number;
  time: number;
  stars: number;
  rooms: Room[];
  shafts: ElevatorShaft[];
  cars: ElevatorCar[];
  people: Person[];
  idSeq: number;
  seed: number;
  left: number;
  right: number;
}

export interface HudSnap {
  money: number;
  pop: number;
  stars: number;
  day: number;
  clock: string;
  speed: number;
  hint: string | null;
  income: number;
  wait: number;
  leased: number;
  vacant: number;
  floors: number;
  width: number;
  expandCost: number;
  canExpand: boolean;
}

export interface PlaceResult {
  ok: boolean;
  reason?: string;
  cost?: number;
  floor?: number;
  x?: number;
  extend?: ElevatorShaft | null;
  addCar?: ElevatorShaft | null;
  minF?: number;
  maxF?: number;
  side?: ExpandSide;
}
