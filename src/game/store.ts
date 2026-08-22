import { create } from "zustand";
import type { HudSnap, RoomKind, Tool } from "./types";

export type Screen = "title" | "play" | "pause" | "help";

export interface GameUi {
  screen: Screen;
  tool: Tool | null;
  selectedId: string | null;
  hud: HudSnap;
  toast: string | null;
  starUnlock: number | null;
  muted: boolean;
  canContinue: boolean;
  demo: boolean;
  inspect: {
    name: string;
    floor: string;
    occ: string;
    blurb: string;
    kind: RoomKind | null;
    shaftId?: string;
    carCost?: number;
    canAddCar?: boolean;
  } | null;
  setScreen: (s: Screen) => void;
  setTool: (t: Tool | null) => void;
  setMuted: (v: boolean) => void;
}

const emptyHud: HudSnap = {
  money: 0,
  pop: 0,
  stars: 1,
  day: 1,
  clock: "8:00 AM",
  speed: 1,
  hint: null,
  income: 0,
  wait: 0,
  leased: 0,
  vacant: 0,
  floors: 0,
  width: 22,
  expandCost: 0,
  canExpand: true,
};

export const useGameUi = create<GameUi>((set) => ({
  screen: "title",
  tool: null,
  selectedId: null,
  hud: emptyHud,
  toast: null,
  starUnlock: null,
  muted: false,
  canContinue: false,
  demo: true,
  inspect: null,
  setScreen: (screen) => set({ screen }),
  setTool: (tool) => set({ tool, selectedId: null, inspect: null }),
  setMuted: (muted) => set({ muted }),
}));

export { emptyHud };
