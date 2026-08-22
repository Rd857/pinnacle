export const TILE_W = 32;
export const FLOOR_H = 56;
export const START_COLS = 22;
export const MAX_COLS = 70;
export const EXPAND_STEP = 4;
export const EXPAND_COST_BASE = 4_200;
export const EXPAND_COST_STEP = 2_800;
export const MAX_FLOOR = 42;
export const MIN_FLOOR = -6;
export const LOBBY_FLOOR = 0;
export const DAY_LENGTH = 64;
export const FIXED_DT = 1 / 30;
export const MAX_PEOPLE = 240;
export const ELEVATOR_SPEED = 2.15;
export const EXPRESS_SPEED = 4.55;
export const WALK_SPEED = 3.4;
export const ELEVATOR_CAP = 8;
export const EXPRESS_CAP = 16;
export const EXPRESS_STEP = 5;
export const ELEVATOR_EXTEND = 520;
export const EXPRESS_EXTEND = 740;
export const MAX_CARS = 8;
export const CAR_COST = 1_800;
export const EXPRESS_CAR_COST = 3_200;
export const DOOR_TIME = 0.55;
export const START_MONEY = 40_000;
export const FUND_OPTIONS = [
  { id: "tight", label: "Tight", amount: 24_000 },
  { id: "standard", label: "Standard", amount: 40_000 },
  { id: "loaded", label: "Loaded", amount: 80_000 },
] as const;
export const SAVE_KEY = "pinnacle-save";
export const SAVE_VERSION = 1;
export const PAN_SPEED = 420;
export const MIN_ZOOM = 0.42;
export const MAX_ZOOM = 1.85;

export const STAR_POP = [0, 0, 22, 55, 110, 200] as const;
