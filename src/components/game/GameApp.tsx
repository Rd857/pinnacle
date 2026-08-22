import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowUpDown,
  ChevronsUpDown,
  BedDouble,
  BedSingle,
  Briefcase,
  Car,
  Coffee,
  Columns3,
  Film,
  HeartPulse,
  Home,
  Pause,
  Play,
  FastForward,
  ShoppingBag,
  Sparkles,
  ChevronsUp,
  Trash2,
  UnfoldHorizontal,
  UtensilsCrossed,
  Volume2,
  VolumeX,
  HelpCircle,
  Star,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CATALOG, TOOL_ORDER } from "@/game/catalog";
import { FUND_OPTIONS, START_MONEY } from "@/game/constants";
import { TowerEngine } from "@/game/engine";
import { unlockAudio } from "@/game/audio";
import { useGameUi } from "@/game/store";
import type { RoomKind, Tool } from "@/game/types";

const ICONS: Record<RoomKind | "bulldoze", typeof Columns3> = {
  lobby: Columns3,
  stairs: ChevronsUp,
  elevator: ArrowUpDown,
  express: ChevronsUpDown,
  office: Briefcase,
  fastfood: Coffee,
  hotel: BedDouble,
  single: BedSingle,
  shop: ShoppingBag,
  parking: Car,
  condo: Home,
  restaurant: UtensilsCrossed,
  medical: HeartPulse,
  theater: Film,
  suite: Sparkles,
  bulldoze: Trash2,
};

export function GameApp() {
  return (
    <main className="relative h-dvh w-full overflow-hidden bg-bg text-fg">
      <GameCanvas />
      <Hud />
      <Overlays />
    </main>
  );
}

function GameCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  const engine = useRef<TowerEngine | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const eng = new TowerEngine(canvas);
    engine.current = eng;
    (window as unknown as { __pinnacle?: TowerEngine }).__pinnacle = eng;
    return () => {
      eng.destroy();
      engine.current = null;
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className="absolute inset-0 size-full touch-none"
      style={{ touchAction: "none" }}
    />
  );
}

function engine(): TowerEngine | null {
  return (window as unknown as { __pinnacle?: TowerEngine }).__pinnacle ?? null;
}

function Hud() {
  const screen = useGameUi((s) => s.screen);
  const demo = useGameUi((s) => s.demo);
  const hud = useGameUi((s) => s.hud);
  const tool = useGameUi((s) => s.tool);
  const toast = useGameUi((s) => s.toast);
  const inspect = useGameUi((s) => s.inspect);
  const muted = useGameUi((s) => s.muted);
  if (screen !== "play") return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col">
      <div className="pointer-events-auto flex items-center gap-2 px-3 pt-3 pb-2 sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto rounded-lg border border-border bg-surface/90 px-3 py-2 shadow-sm backdrop-blur-sm">
          <span className="font-display text-base tracking-tight text-fg sm:text-lg">Pinnacle</span>
          <span className="hidden h-4 w-px bg-border sm:block" />
          <Stat label="Funds" value={money(hud.money)} tone="money" />
          <Stat label="Pop" value={String(hud.pop)} icon={<Users className="size-3.5" />} />
          <Stars n={hud.stars} />
          <Stat label="Day" value={`${hud.day}`} />
          <Stat label="Lot" value={`${hud.width}`} />
          <span className="font-mono text-xs tabular-nums text-muted">{hud.clock}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-surface/90 p-1 backdrop-blur-sm">
          <IconBtn label="Menu" onClick={() => useGameUi.setState({ screen: "pause" })}>
            <Pause className="size-4" />
          </IconBtn>
          <IconBtn label="1x" onClick={() => engine()?.setSpeed(1)} active={hud.speed === 1}>
            <Play className="size-4" />
          </IconBtn>
          <IconBtn label="4x" onClick={() => engine()?.setSpeed(hud.speed === 4 ? 2 : 4)} active={hud.speed >= 2}>
            <FastForward className="size-4" />
          </IconBtn>
          <IconBtn
            label={muted ? "Unmute" : "Mute"}
            onClick={() => engine()?.toggleMute()}
          >
            {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </IconBtn>
          <IconBtn label="Help" onClick={() => useGameUi.setState({ screen: "help" })}>
            <HelpCircle className="size-4" />
          </IconBtn>
        </div>
      </div>

      {hud.hint && screen === "play" && !demo && (
        <div className="pointer-events-none mx-auto mt-1 max-w-md rounded-md border border-border bg-surface/85 px-3 py-1.5 text-center text-xs text-muted backdrop-blur-sm">
          {hud.hint}
        </div>
      )}

      {toast && (
        <div className="pointer-events-none mx-auto mt-2 rounded-md bg-fg px-3 py-1.5 text-xs font-medium text-bg">
          {toast}
        </div>
      )}

      <div className="flex-1" />

      <div className="pointer-events-auto flex items-end gap-2 p-3 sm:p-4">
        <BuildBar tool={tool} stars={hud.stars} money={hud.money} expandCost={hud.expandCost} canExpand={hud.canExpand} />
        {inspect && <Inspector />}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone?: "money";
  icon?: ReactNode;
}) {
  return (
    <span className="flex items-baseline gap-1 whitespace-nowrap">
      {icon && <span className="text-muted">{icon}</span>}
      <span className="text-[10px] uppercase tracking-wide text-subtle">{label}</span>
      <span
        className={cn(
          "font-mono text-xs tabular-nums sm:text-sm",
          tone === "money" ? "text-money" : "text-fg",
        )}
      >
        {value}
      </span>
    </span>
  );
}

function Stars({ n }: { n: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${n} stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={cn("size-3.5", i < n ? "fill-star text-star" : "text-subtle")}
        />
      ))}
    </span>
  );
}

function IconBtn({
  children,
  onClick,
  active,
  label,
}: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "grid size-11 place-items-center rounded-md text-muted transition-colors duration-150",
        active ? "bg-accent text-accent-fg" : "hover:bg-surface-2 hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

function BuildBar({
  tool,
  stars,
  money,
  expandCost,
  canExpand,
}: {
  tool: Tool | null;
  stars: number;
  money: number;
  expandCost: number;
  canExpand: boolean;
}) {
  return (
    <div className="min-w-0 flex-1 overflow-x-auto rounded-xl border border-border bg-surface/92 p-2 shadow-sm backdrop-blur-sm">
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => engine()?.setTool(tool === "widen" ? null : "widen")}
          disabled={!canExpand && tool !== "widen"}
          title={canExpand ? `Widen lot · ${moneyFmt(expandCost)}` : "Lot is as wide as the block allows"}
          aria-label="Widen lot"
          data-tool="widen"
          className={cn(
            "flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-md border text-[10px] transition-colors duration-150 sm:h-[4.5rem] sm:w-[4.5rem] sm:text-xs",
            tool === "widen"
              ? "border-accent bg-accent text-accent-fg"
              : !canExpand
                ? "border-transparent text-subtle"
                : "border-transparent text-muted hover:border-border hover:bg-surface-2 hover:text-fg",
          )}
        >
          <UnfoldHorizontal className="size-4" />
          <span className="leading-none">Widen</span>
          <span className={cn("font-mono tabular-nums", tool === "widen" ? "text-accent-fg" : "text-subtle")}>
            {canExpand ? moneyFmt(expandCost) : "Max"}
          </span>
        </button>
        {TOOL_ORDER.map((id) => {
          const def = CATALOG[id];
          const locked = stars < def.stars;
          const Icon = ICONS[id];
          const active = tool === id;
          return (
            <button
              key={id}
              type="button"
              disabled={locked}
              onClick={() => engine()?.setTool(active ? null : id)}
              title={locked ? `Requires ${def.stars} stars` : `${def.name} · ${moneyFmt(def.cost)}`}
              aria-label={def.name}
              data-tool={id}
              className={cn(
                "flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-md border text-[10px] transition-colors duration-150 sm:h-[4.5rem] sm:w-[4.5rem] sm:text-xs",
                active
                  ? "border-accent bg-accent text-accent-fg"
                  : locked
                    ? "border-transparent text-subtle"
                    : "border-transparent text-muted hover:border-border hover:bg-surface-2 hover:text-fg",
              )}
            >
              <Icon className="size-4" />
              <span className="leading-none">{def.name}</span>
              <span className={cn("font-mono tabular-nums", active ? "text-accent-fg" : "text-subtle")}>
                {locked ? `${def.stars}★` : moneyFmt(def.cost)}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => engine()?.setTool(tool === "bulldoze" ? null : "bulldoze")}
          className={cn(
            "flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-md border text-[10px] sm:h-[4.5rem] sm:w-[4.5rem] sm:text-xs",
            tool === "bulldoze"
              ? "border-danger bg-danger text-fg"
              : "border-transparent text-muted hover:border-border hover:bg-surface-2 hover:text-fg",
          )}
        >
          <Trash2 className="size-4" />
          <span>Remove</span>
          <span className="font-mono text-subtle">40%</span>
        </button>
      </div>
      <p className="hidden px-1 pt-1 text-[10px] text-subtle sm:block">
        Drag to pan · scroll to zoom · Esc cancels · E widens the lot · {money >= 0 ? "click a floor to place" : ""}
      </p>
    </div>
  );
}

function Inspector() {
  const inspect = useGameUi((s) => s.inspect);
  if (!inspect) return null;
  return (
    <aside className="hidden w-64 shrink-0 rounded-xl border border-border bg-surface/92 p-4 shadow-sm backdrop-blur-sm sm:block">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-display text-lg leading-tight">{inspect.name}</p>
          <p className="text-xs text-muted">{inspect.floor}</p>
        </div>
        <button
          type="button"
          aria-label="Close"
          className="grid size-9 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
          onClick={() => useGameUi.setState({ inspect: null, selectedId: null })}
        >
          <X className="size-4" />
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">{inspect.blurb}</p>
      <p className="mt-3 font-mono text-xs tabular-nums text-fg">{inspect.occ}</p>
      {inspect.shaftId && (
        <Button
          className="mt-3 w-full"
          disabled={!inspect.canAddCar}
          onClick={() => engine()?.addCar(inspect.shaftId!)}
        >
          {inspect.canAddCar ? `Add car · ${moneyFmt(inspect.carCost ?? 0)}` : inspect.occ.startsWith("8") ? "Shaft full" : "Can't afford a car"}
        </Button>
      )}
    </aside>
  );
}

function Overlays() {
  const screen = useGameUi((s) => s.screen);
  const starUnlock = useGameUi((s) => s.starUnlock);
  return (
    <>
      {screen === "title" && <Title />}
      {screen === "pause" && <PauseMenu />}
      {screen === "help" && <Help />}
      {starUnlock && <StarModal n={starUnlock} />}
    </>
  );
}

function Title() {
  const canContinue = useGameUi((s) => s.canContinue);
  const [funds, setFunds] = useState(START_MONEY);
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-bg/55 px-6 backdrop-blur-[2px]">
      <div className="w-full max-w-md text-center">
        <p className="text-xs uppercase tracking-[0.28em] text-muted">A vertical city</p>
        <h1 className="mt-2 font-display text-5xl font-medium tracking-tight text-fg sm:text-6xl">
          Pinnacle
        </h1>
        <p className="mt-3 text-sm text-muted">Build. House. Rise.</p>
        <div className="mt-8 flex flex-col gap-2">
          {canContinue && (
            <Button
              size="lg"
              className="w-full"
              onClick={() => {
                unlockAudio();
                engine()?.continueSave();
              }}
            >
              Continue tower
            </Button>
          )}
          <div className="rounded-xl border border-border bg-surface/80 p-3 text-left">
            <p className="text-[10px] uppercase tracking-wide text-subtle">Starting funds</p>
            <div className="mt-2 grid grid-cols-3 gap-1">
              {FUND_OPTIONS.map((opt) => {
                const active = funds === opt.amount;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFunds(opt.amount)}
                    className={cn(
                      "flex h-11 flex-col items-center justify-center rounded-md border text-[10px] transition-colors duration-150 sm:h-12 sm:text-xs",
                      active
                        ? "border-accent bg-accent text-accent-fg"
                        : "border-transparent text-muted hover:border-border hover:bg-surface-2 hover:text-fg",
                    )}
                  >
                    <span className="leading-none">{opt.label}</span>
                    <span className={cn("font-mono tabular-nums", active ? "text-accent-fg" : "text-subtle")}>
                      {moneyFmt(opt.amount)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <Button
            size="lg"
            variant={canContinue ? "secondary" : "primary"}
            className="w-full"
            onClick={() => {
              unlockAudio();
              engine()?.startNew(funds);
            }}
          >
            New tower
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="w-full"
            onClick={() => useGameUi.setState({ screen: "help" })}
          >
            How to play
          </Button>
        </div>
      </div>
    </div>
  );
}

function PauseMenu() {
  const funds = useGameUi((s) => s.hud.money);
  return (
    <Modal onClose={() => useGameUi.setState({ screen: "play" })}>
      <h2 className="font-display text-2xl">Paused</h2>
      <p className="mt-1 text-sm text-muted">The tower waits.</p>
      <div className="mt-5 rounded-lg border border-border bg-surface-2 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[10px] uppercase tracking-wide text-subtle">Treasury</p>
          <p className="font-mono text-sm tabular-nums text-money">{money(funds)}</p>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1">
          <Button size="sm" variant="secondary" onClick={() => engine()?.addFunds(10_000)}>
            +$10k
          </Button>
          <Button size="sm" variant="secondary" onClick={() => engine()?.addFunds(25_000)}>
            +$25k
          </Button>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2">
        <Button onClick={() => useGameUi.setState({ screen: "play" })}>Resume</Button>
        <Button variant="secondary" onClick={() => useGameUi.setState({ screen: "help" })}>
          How to play
        </Button>
        <Button
          variant="ghost"
          onClick={() => engine()?.showTitle()}
        >
          Title
        </Button>
      </div>
    </Modal>
  );
}

function Help() {
  return (
    <Modal onClose={() => useGameUi.setState({ screen: useGameUi.getState().demo ? "title" : "play" })}>
      <h2 className="font-display text-2xl">How to play</h2>
      <ul className="mt-4 space-y-2 text-sm text-muted">
        <li>People ride the elevator nearest their destination, so a shaft on each wing actually gets used.</li>
        <li>Start with a lobby on the ground floor, then raise an elevator shaft.</li>
        <li>Offices pay rent when workers can reach them. Cafes keep them from walking out at lunch.</li>
        <li>The lot starts 22 bays wide. Click either end, or the Widen tool, to buy four more.</li>
        <li>A boutique and a restaurant unlock at two stars — you need both, plus crowd, for three stars.</li>
        <li>Express elevators (two stars) are faster, hold 16, and only stop every 5 floors. Keep a local shaft for the floors in between.</li>
        <li>Click a tool once, then stamp it as many times as you want. Right-click or Esc puts it down.</li>
        <li>Hotel singles are a third of an office, doubles two-thirds, suites the same width as an office.</li>
        <li>Click a shaft to add extra cars — up to 8. They share the well and pass through each other, same as the original.</li>
        <li>People wait on elevators. Long queues cost tenants — add another car, or a second shaft.</li>
        <li>Drag to pan, scroll or pinch to zoom, WASD or arrows to move the view.</li>
        <li>Space pauses. 1 / 2 / 3 set speed. E selects Widen. Esc deselects or pauses.</li>
      </ul>
      <Button className="mt-6 w-full" onClick={() => useGameUi.setState({ screen: useGameUi.getState().demo ? "title" : "play" })}>
        Close
      </Button>
    </Modal>
  );
}

function StarModal({ n }: { n: number }) {
  return (
    <Modal onClose={() => useGameUi.setState({ starUnlock: null })}>
      <div className="flex justify-center gap-1">
        {Array.from({ length: 5 }, (_, i) => (
          <Star key={i} className={cn("size-6", i < n ? "fill-star text-star" : "text-subtle")} />
        ))}
      </div>
      <h2 className="mt-3 font-display text-2xl">{n}-star tower</h2>
      <p className="mt-2 text-sm text-muted">
        {n === 2 && "Hotels, boutiques, restaurants, parking, and express elevators are open."}
        {n === 3 && "Condos and a clinic have unlocked."}
        {n === 4 && "Suites and a two-story theater can go in."}
        {n === 5 && "The city skyline belongs to you."}
      </p>
      <Button className="mt-6 w-full" onClick={() => useGameUi.setState({ starUnlock: null })}>
        Continue
      </Button>
    </Modal>
  );
}

function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-bg/60 px-4 backdrop-blur-[2px]">
      <button type="button" className="absolute inset-0" aria-label="Dismiss" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-sm">
        {children}
      </div>
    </div>
  );
}

function money(n: number) {
  return `$${Math.floor(n).toLocaleString("en-US")}`;
}

function moneyFmt(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `$${n}`;
}

