import { useMemo } from "react";
import type { BattleMap as BattleMapType, BattleEntity } from "@/data/types";
import { cn } from "@/lib/utils";

interface BattleMapProps {
  map: BattleMapType;
}

export function BattleMap({ map }: BattleMapProps) {
  const grid = useMemo(() => {
    const result: BattleEntity[][] = [];
    for (let y = 0; y < map.height; y++) {
      const row: BattleEntity[] = [];
      for (let x = 0; x < map.width; x++) {
        const entity = map.entities.find(
          (e) => e.position.x === x && e.position.y === y && !e.isDead
        );
        row.push(entity || null as unknown as BattleEntity);
      }
      result.push(row);
    }
    return result;
  }, [map]);

  const getEntityClass = (entity: BattleEntity | null) => {
    if (!entity) return "bg-ink-800/30";
    switch (entity.type) {
      case "player":
        return "bg-gold-500/40 border-gold-400/60";
      case "ally":
        return "bg-jade-500/40 border-jade-400/60";
      case "enemy":
        return "bg-cinnabar-500/40 border-cinnabar-400/60";
      case "obstacle":
        return "bg-purple-500/40 border-purple-400/60";
      default:
        return "bg-ink-800/30";
    }
  };

  const getEntityIcon = (entity: BattleEntity | null) => {
    if (!entity) return null;
    switch (entity.type) {
      case "player":
        return "☯";
      case "ally":
        return "◎";
      case "enemy":
        return "⚔";
      case "obstacle":
        return "◉";
      default:
        return "?";
    }
  };

  const getEntityName = (entity: BattleEntity | null) => {
    if (!entity) return "";
    return entity.name;
  };

  const getHpBar = (entity: BattleEntity | null) => {
    if (!entity || !entity.hp || !entity.maxHp) return null;
    const percent = (entity.hp / entity.maxHp) * 100;
    return (
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-ink-900/50">
        <div
          className={cn(
            "h-full transition-all",
            percent > 50 ? "bg-jade-400" :
              percent > 25 ? "bg-gold-400" : "bg-cinnabar-400"
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    );
  };

  return (
    <div className="relative">
      {/* 阵图格子定死 64×64：比从前大出一倍，宽了便横向滚动，不至于挤成一团 */}
      <div className="w-full overflow-x-auto">
        <div
          className="mx-auto grid w-max gap-0.5 rounded-lg border border-paper-400/20 bg-ink-900/60 p-2"
          style={{ gridTemplateColumns: `repeat(${map.width}, 64px)` }}
        >
          {grid.map((row, y) =>
            row.map((entity, x) => (
              <div
                key={`${x}-${y}`}
                className={cn(
                  "relative flex h-16 w-16 items-center justify-center border border-paper-400/10 rounded-sm transition-all",
                  getEntityClass(entity)
                )}
              >
                {getEntityIcon(entity) && (
                  <span className="text-lg font-bold sm:text-xl">
                    {getEntityIcon(entity)}
                  </span>
                )}
                {getEntityName(entity) && (
                  <span
                    title={`${entity.name}${entity.realm ? `｜${entity.realm}` : ""}${entity.style ? `｜${entity.style}` : ""}${entity.facing ? `｜朝${entity.facing}` : ""}`}
                    className="absolute -top-1 -left-1 rounded bg-ink-900/80 px-0.5 font-serif text-[10px] leading-tight text-paper-300/80"
                  >
                    {getEntityName(entity).slice(0, 2)}
                  </span>
                )}
                {getHpBar(entity)}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 font-serif text-xs">
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded bg-gold-500/40 border border-gold-400/60 flex items-center justify-center text-xs">☯</span>
          <span className="text-paper-300/80">玩家</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded bg-jade-500/40 border border-jade-400/60 flex items-center justify-center text-xs">◎</span>
          <span className="text-paper-300/80">队友</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded bg-cinnabar-500/40 border border-cinnabar-400/60 flex items-center justify-center text-xs">⚔</span>
          <span className="text-paper-300/80">敌人</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded bg-purple-500/40 border border-purple-400/60 flex items-center justify-center text-xs">◉</span>
          <span className="text-paper-300/80">障碍物</span>
        </div>
      </div>
    </div>
  );
}