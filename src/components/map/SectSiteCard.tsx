import { getScene, getSectMapTemplates, sectSceneId } from "@/data/map";
import { climateAggression, findSectMapType } from "@/data/sects";
import { sectSiteTerms } from "@/data/sectSites";
import { useAIStore } from "@/store/useAIStore";
import { useGameStore } from "@/store/useGameStore";
import type { SectSite } from "@/data/types";
import { Footprints, LogIn, X } from "lucide-react";

/**
 * 大地图上点开一处宗门时摊出来的那一张：
 * 名号、驻地、地势，四类词条连同说明，再来一副眼下的底子。
 * 词条的说明是按编号现查的，故词条表改了，这里跟着变。
 * 底下缀一处入山的去处：人在这儿才进得去，山门图没配好便进无可进。
 */
export function SectSiteCard({ site, onClose }: { site: SectSite; onClose: () => void }) {
  const mapType = findSectMapType(site.mapType);
  const template = site.templateId
    ? getSectMapTemplates().find((t) => t.id === site.templateId)
    : undefined;
  const terms = sectSiteTerms(site);

  const enterScene = useGameStore((s) => s.enterScene);
  const devMoveTo = useGameStore((s) => s.devMoveTo);
  const currentSectId = useGameStore((s) => s.currentSectId);
  const sect = useGameStore((s) => s.sect);
  const isDeveloperMode = useAIStore((s) => s.isDeveloperMode);
  // 本门的账在宗门管理里，别家各记在自己名下
  const treasury = site.mine ? sect?.management?.treasury : site.treasury;

  const sceneId = sectSceneId(site.id);
  const hasMap = !!getScene(sceneId);
  const atSect = currentSectId === site.id;

  return (
    <div
      className="w-80 max-h-[70vh] overflow-y-auto rounded-lg border border-gold-500/30 bg-ink-900 p-3 shadow-xl"
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-brush text-base text-paper-50">{site.name}</span>
            {site.mine && (
              <span className="shrink-0 rounded-sm border border-gold-400/60 bg-gold-400/15 px-1 font-serif text-[10px] leading-4 text-gold-300">
                本门
              </span>
            )}
          </div>
          <div className="mt-0.5 font-serif text-xs text-paper-400/60">
            {site.seat}
            {mapType ? ` · ${mapType.name}` : ""} · {site.culture} · 侵略倾向{" "}
            {Math.round(climateAggression(site.climate?.id) * 100)}%
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-paper-400/60 transition hover:text-paper-100"
          title="关闭"
        >
          <X size={14} />
        </button>
      </div>

      <dl className="mt-2.5 space-y-1.5 border-t border-gold-500/15 pt-2.5">
        {terms.map((term) => (
          <div key={term.label} className="flex gap-2">
            <dt className="w-20 shrink-0 font-serif text-[11px] text-gold-400/70">{term.label}</dt>
            <dd className="min-w-0 flex-1">
              <div className="font-brush text-xs text-paper-100">{term.name}</div>
              {term.note && (
                <div className="font-serif text-[11px] leading-relaxed text-paper-400/70">{term.note}</div>
              )}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-2.5 grid grid-cols-4 gap-1.5 border-t border-gold-500/15 pt-2.5">
        {[
          { label: "门中等级", value: site.level },
          { label: "声望", value: site.reputation },
          { label: "长老", value: site.elders },
          { label: "弟子", value: site.disciples },
        ].map((item) => (
          <div key={item.label} className="rounded border border-paper-400/15 bg-ink-800/60 px-1 py-1 text-center">
            <div className="font-serif text-[10px] text-paper-400/50">{item.label}</div>
            <div className="font-number text-xs text-paper-100">{item.value}</div>
          </div>
        ))}
      </div>

      {/* 门中宝库：本门那一本记在宗门管理里，别家各记在自己名下 */}
      {treasury && (
        <div className="mt-2.5 border-t border-gold-500/15 pt-2.5">
          <div className="flex items-center justify-between">
            <span className="font-serif text-[11px] text-gold-400/70">门中宝库</span>
            <span className="font-number text-xs text-gold-300">
              {(Number(treasury.spiritStones) || 0).toLocaleString()} 灵石
            </span>
          </div>
          {(Array.isArray(treasury.materials) ? treasury.materials : []).filter((m) => m.amount > 0).length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {treasury.materials
                .filter((m) => m.amount > 0)
                .slice(0, 8)
                .map((m) => (
                  <span
                    key={m.name}
                    className="rounded border border-paper-400/15 px-1.5 py-0.5 font-serif text-[10px] text-paper-300/80"
                  >
                    {m.name} {m.amount}
                  </span>
                ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-2.5 space-y-1.5 border-t border-gold-500/15 pt-2.5 font-serif text-[11px] leading-relaxed text-paper-300/80">
        {site.appearance && <p>{site.appearance}</p>}
        {site.reputationDesc && <p>{site.reputationDesc}</p>}
        {site.surroundings && <p>{site.surroundings}</p>}
      </div>

      {/* 入山的去处：人在这儿、山门图也配好了，才点得进去 */}
      <div className="mt-2.5 border-t border-gold-500/15 pt-2.5">
        {!hasMap ? (
          <p className="font-serif text-[11px] text-paper-400/50">尚未配山门图，只立在舆图上。</p>
        ) : atSect ? (
          <button
            type="button"
            onClick={() => enterScene(sceneId)}
            className="flex w-full items-center justify-center gap-1.5 rounded border border-jade-400/60 bg-jade-500/90 px-3 py-2 font-serif text-xs text-paper-50 transition hover:border-jade-400/80 hover:bg-jade-500"
          >
            <LogIn size={13} /> 进入山门
          </button>
        ) : (
          <div className="space-y-1.5">
            <p className="flex items-center gap-1.5 font-serif text-[11px] text-paper-400/60">
              <Footprints size={12} className="text-paper-400/50" />
              须亲至山门方可入内。
            </p>
            {isDeveloperMode && (
              <button
                type="button"
                onClick={() => devMoveTo(`sect:${site.id}`)}
                className="flex w-full items-center justify-center gap-1.5 rounded border border-cinnabar-500/50 px-3 py-1.5 font-serif text-xs text-cinnabar-300 transition hover:border-cinnabar-400/80"
                title="开发者模式：直接把所在之地切到这儿"
              >
                <Footprints size={12} /> 前往山门
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mt-2 font-serif text-[11px] text-paper-400/50">
        {template ? `山门依着「${template.name}」这一张地势图` : "尚未配宗门图，山门只立在舆图上"}
      </div>
    </div>
  );
}
