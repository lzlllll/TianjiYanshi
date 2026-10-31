import { useMemo, useState } from "react";
import { useAIStore } from "@/store/useAIStore";
import { useGameStore } from "@/store/useGameStore";
import { ScrollCard } from "@/components/ui/ScrollCard";
import { SealButton } from "@/components/ui/SealButton";
import { GeneralStoreModal } from "@/components/map/GeneralStoreModal";
import { DiningModal } from "@/components/map/DiningModal";
import { BathModal } from "@/components/map/BathModal";
import { TheatreModal } from "@/components/map/TheatreModal";
import { PawnModal } from "@/components/map/PawnModal";
import { BrokerModal } from "@/components/map/BrokerModal";
import { EscortModal } from "@/components/map/EscortModal";
import { MartialHallModal } from "@/components/map/MartialHallModal";
import { PlayerShopModal } from "@/components/map/PlayerShopModal";
import { ShopSetupModal } from "@/components/map/ShopSetupModal";
import { isAroundHere, isPinnedAt, manorKey, relationWhereabout, rollDistrictNpcs } from "@/data/npcGen";
import { auctionAtShop, auctionWhen } from "@/data/auction";
import { daySerial } from "@/lib/gameTime";
import { useElapsedSeconds } from "@/lib/useElapsedSeconds";
import { shopLeaseCost } from "@/data/playerShops";
import type { BuskResult, Market, Quest, Shop } from "@/data/types";
import { Coins, Loader2, Music, Store, Users, X } from "lucide-react";

/** 点开一处坊市时要看的东西 */
export interface MarketTarget {
  cityId: string;
  districtId: number;
  /** 面板抬头，如「长安·坊市」 */
  label: string;
  /** 该城文化背景，驻足看铺子时一并交给模型 */
  culture?: string;
  market: Market;
}

/** 一处坊市的铺面：一家一块牌子，可以驻足看个大概 */
export function MarketPanel({
  cityId,
  districtId,
  label,
  culture,
  market,
  onClose,
}: MarketTarget & { onClose: () => void }) {
  const live = useGameStore((s) => s.markets[manorKey(cityId, districtId)]) ?? market;
  const setShopInfo = useGameStore((s) => s.setShopInfo);
  const playerShops = useGameStore((s) => s.playerShops ?? []);
  const advanceTime = useGameStore((s) => s.advanceTime);
  const skills = useGameStore((s) => s.skills);
  const busk = useGameStore((s) => s.busk);
  const meetNpc = useGameStore((s) => s.meetNpc);
  const probeShop = useAIStore((s) => s.probeShop);
  const narrateBusking = useAIStore((s) => s.narrateBusking);
  const openNPCChat = useAIStore((s) => s.openNPCChat);
  const relations = useGameStore((s) => s.relations);
  const quests = useGameStore((s) => s.quests);
  const currentTime = useGameStore((s) => s.currentTime);
  const auctions = useGameStore((s) => s.auctions);
  /** 这一家铺子眼下挂着的拍卖：只有宝物阁会有 */
  const auctionOf = (shopId: string) => auctionAtShop(auctions, shopId, today);

  const [busyId, setBusyId] = useState("");
  // 等铺子那一段写照写出来的秒数：转着圈不出声，人便不知是不是卡住了
  const probeSeconds = useElapsedSeconds(!!busyId);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  /** 进了门的铺子：有货架的买卖，或有座头的客栈茶棚 */
  const [entered, setEntered] = useState<Shop | null>(null);
  /** 卖艺：选中的本事、这一场的总账与叙事 */
  const [buskSkill, setBuskSkill] = useState("");
  const [buskBusy, setBuskBusy] = useState(false);
  // 卖艺这一场写完要些时候，缀个数免得人以为卡住
  const buskSeconds = useElapsedSeconds(buskBusy);
  const [buskResult, setBuskResult] = useState<BuskResult | null>(null);
  const [buskText, setBuskText] = useState("");
  /** 自设的铺面：这一坊市里已有的，与正在新开的 */
  const [openShopId, setOpenShopId] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);

  const myShops = useMemo(
    () => playerShops.filter((s) => s.cityId === cityId && s.districtId === districtId),
    [playerShops, cityId, districtId],
  );
  const lease = shopLeaseCost(culture);

  // 坊市街面上也有寻常人走动，与平民住宅一样，认下便可攀谈
  const streetNpcs = useMemo(
    () => rollDistrictNpcs(label, cityId, districtId, culture, 3),
    [label, cityId, districtId, culture],
  );
  const today = daySerial(currentTime);

  // 落脚在这一坊市里的人：钉在这儿的排在前面，只知道在这座城、说不准哪一处的也一并算上。
  // 与平民住宅那扇窗同一个规矩——先前漏了这一段，接了差事要寻的人落在坊市便寻不着
  const known = useMemo(() => {
    const here = relations.filter((r) => isAroundHere(r, cityId, districtId));
    return [
      ...here.filter((r) => isPinnedAt(r, cityId, districtId, today)),
      ...here.filter((r) => !isPinnedAt(r, cityId, districtId, today)),
    ];
  }, [relations, cityId, districtId, today]);

  // 这一坊市里还挂着的差事：要寻的人星标出来，免得在街上白转
  const wanted = useMemo(
    () =>
      new Set(
        quests
          .filter(
            (q) => q.status === "open" && q.target?.cityId === cityId && q.target.districtId === districtId,
          )
          .map((q) => q.target?.person)
          .filter((n): n is string => !!n),
      ),
    [quests, cityId, districtId],
  );

  // 认下过的就不再当生面孔挂一遍
  const fresh = useMemo(() => {
    const taken = new Set(known.map((r) => r.name));
    return streetNpcs.filter((s) => !taken.has(s.name));
  }, [streetNpcs, known]);

  /** 这一坊市里，差事点名要去的铺子 */
  const questByShop = useMemo(() => {
    const map = new Map<string, Quest>();
    for (const q of quests) {
      if (q.status !== "open" || q.target?.cityId !== cityId || q.target.districtId !== districtId) continue;
      if (q.target.shop) map.set(q.target.shop, q);
    }
    return map;
  }, [quests, cityId, districtId]);

  /**
   * 差事点名、街上却还没开的铺子：临时摆出一家来。
   * 掌柜就是钉在这一处的那个关系人，事一了，这一家便不再露面。
   */
  const questShops = useMemo(() => {
    const opened = new Set(live.shops.map((s) => s.name));
    return [...questByShop.entries()]
      .filter(([name]) => !opened.has(name))
      .map(([name, quest]) => ({
        name,
        quest,
        kind: quest.target?.shopKind ?? "铺子",
        keeper: relations.find((r) => r?.name === quest.target?.person),
      }));
  }, [questByShop, live.shops, relations]);

  /** 街头卖艺：选一门本事考教五场，成败与钱财由代码定下，再写一段叙事 */
  const perform = async () => {
    const skill = skills.find((s) => s.id === buskSkill) ?? skills[0];
    if (!skill) return;
    setBuskBusy(true);
    setBuskText("");
    setError("");
    const result = busk(skill.name);
    setBuskResult(result);
    try {
      const text = await narrateBusking({
        skill: result.skill,
        place: `${label}街头`,
        passed: result.passed,
        reward: result.reward,
        folkDelta: result.folkDelta,
        rounds: result.rounds.map((r) => ({ index: r.index, success: r.success, reward: r.reward })),
      });
      setBuskText(text);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBuskBusy(false);
    }
  };

  /** 这家铺子进不进得去：有货可卖，有位子可坐，或是浴堂瓦舍当铺牙行那样有营生可做 */
  const canEnter = (shop: Shop) =>
    (shop.goods?.length ?? 0) > 0 ||
    (shop.seats?.length ?? 0) > 0 ||
    isBath(shop) ||
    isTheatre(shop) ||
    isPawn(shop) ||
    isBroker(shop) ||
    isEscort(shop) ||
    isMartial(shop);
  const isDining = (shop: Shop) => (shop.seats?.length ?? 0) > 0;
  const isBath = (shop: Shop) => shop.kind === "浴堂";
  const isTheatre = (shop: Shop) => shop.kind === "瓦舍";
  const isPawn = (shop: Shop) => shop.kind === "当铺";
  const isBroker = (shop: Shop) => shop.kind === "牙行";
  const isEscort = (shop: Shop) => shop.kind === "镖局";
  const isMartial = (shop: Shop) => shop.kind === "武馆";

  /** 在门前站一站，看看这家铺子是什么光景；看过一回就不必再看 */
  const linger = async (shopId: string) => {
    if (busyId) return;
    const shop = live.shops.find((s) => s.id === shopId);
    if (!shop || shop.info) return;
    setBusyId(shopId);
    setError("");
    try {
      const text = await probeShop({ name: shop.name, kind: shop.kind, market: label, culture });
      setShopInfo(manorKey(cityId, districtId), shopId, text);
      // 站住看一会儿，一个时辰就这么过去了；时辰是这套时间的最小刻度，再分不出半个
      advanceTime(1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="mainui-black fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-darkest/60 backdrop-blur-sm animate-inkSpread" onClick={onClose} />

      <div
        className="relative scroll-card rounded-lg w-full max-w-4xl max-h-[80vh] flex flex-col"
        style={{ animation: "inkSpread 0.4s ease-out" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-gold-500/20 bg-ink-800/95 backdrop-blur">
          <div className="flex items-center gap-3 min-w-0">
            <Store size={18} className="text-gold-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="font-brush text-xl text-gold-400 tracking-widest truncate">{label}</h2>
              <p className="font-serif text-xs text-paper-400 mt-0.5">
                沿街 {live.shops.length + questShops.length} 家铺面
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 shrink-0 rounded flex items-center justify-center text-paper-400/60 hover:text-paper-100 hover:bg-paper-400/10 transition"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {live.shops.length + questShops.length === 0 ? (
            <p className="font-serif text-xs text-paper-400 py-8 text-center">
              这一片还没开市，铺面都空着。
            </p>
          ) : (
            // 一家一块牌子，铺开了看，不再一家一行
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
              {/* 差事点名、街上本没有的铺子：临时摆出来，事一了便不再露面 */}
              {questShops.map((s) => (
                <ScrollCard key={`quest-${s.name}`} className="!p-3 flex flex-col">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0 px-2 py-0.5 rounded border border-cinnabar-500/40 bg-cinnabar-500/10 font-serif text-[11px] text-cinnabar-300">
                      差事
                    </span>
                    <h4 className="flex-1 min-w-0 font-brush text-base text-paper-50 truncate">{s.name}</h4>
                  </div>

                  <p className="mt-2 font-serif text-xs text-paper-300/80 leading-relaxed">
                    {s.kind}
                    {s.keeper ? ` · 掌柜 ${s.keeper.name}` : ""}；为着「{s.quest.name}」才寻到这一家。
                  </p>

                  {s.quest.target?.shopDesc && (
                    <p className="mt-1 font-serif text-xs text-paper-200/70 leading-relaxed">
                      {s.quest.target.shopDesc}
                    </p>
                  )}

                  <div className="mt-3 flex items-center gap-2">
                    {s.keeper ? (
                      <SealButton
                        variant="ghost"
                        onClick={() => {
                          if (s.keeper) {
                            meetNpc(s.keeper);
                            openNPCChat(s.keeper.id);
                          }
                        }}
                        className="px-3 py-1.5 text-xs"
                      >
                        寻掌柜
                      </SealButton>
                    ) : (
                      <span className="font-serif text-[11px] text-paper-400/60">掌柜还未露面</span>
                    )}
                  </div>
                </ScrollCard>
              ))}

              {live.shops.map((shop) => (
                <ScrollCard key={shop.id} className="!p-3 flex flex-col">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0 px-2 py-0.5 rounded border border-gold-500/25 bg-ink-800/60 font-serif text-[11px] text-gold-400/80">
                      {shop.kind}
                    </span>
                    <h4 className="flex-1 min-w-0 font-brush text-base text-paper-50 truncate">{shop.name}</h4>
                  </div>

                  {shop.info && (
                    <p className="mt-2 font-serif text-sm leading-relaxed text-paper-100 whitespace-pre-wrap">
                      {shop.info}
                    </p>
                  )}

                  {auctionOf(shop.id) && (
                    <p className="mt-1.5 font-serif text-[11px] text-gold-400">
                      {auctionWhen(auctionOf(shop.id)!, today)} · 阁里要开一场拍卖
                    </p>
                  )}

                  <div className="mt-3 flex items-center gap-2">
                    <SealButton
                      variant="ghost"
                      onClick={() =>
                        canEnter(shop) ? setEntered(shop) : setNote(`「${shop.name}」尚未开放。`)
                      }
                      className="px-3 py-1.5 text-xs"
                    >
                      进入
                    </SealButton>
                    <SealButton
                      variant="ghost"
                      onClick={() => linger(shop.id)}
                      disabled={!!busyId || !!shop.info}
                      className="px-3 py-1.5 text-xs"
                    >
                      {busyId === shop.id && <Loader2 size={12} className="mr-1 animate-spin" />}
                      {shop.info ? "已驻足" : "驻足"}
                    </SealButton>
                    {busyId === shop.id && (
                      <span className="font-serif text-[11px] leading-relaxed text-gold-400/75">
                        正探头往里看，这一段写照在写着……已候 {probeSeconds} 秒
                      </span>
                    )}
                  </div>
                </ScrollCard>
              ))}
            </div>
          )}

          {/* 你的铺面：在这一坊市里自设的，点进去吩咐经营 */}
          {myShops.length > 0 && (
            <ScrollCard title="你的铺面" subtitle="在这儿自设的门面，点进去吩咐经营" className="mt-4">
              <div className="space-y-2">
                {myShops.map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded border-2 border-ink-lightest/40 bg-paper-old/50 px-3 py-2">
                    <div className="min-w-0">
                      <div className="font-brush text-sm text-ink-dark truncate">
                        {s.name} <span className="font-serif text-xs text-ink-light">· {s.kind}</span>
                      </div>
                      <div className="font-serif text-xs text-ink-light">
                        资金池 {s.cash}
                        {s.arrears > 0 ? ` · 已欠 ${s.arrears} 月` : ""}
                      </div>
                    </div>
                    <SealButton variant="ghost" onClick={() => setOpenShopId(s.id)} className="px-3 py-1.5 text-xs shrink-0">
                      经营
                    </SealButton>
                  </div>
                ))}
              </div>
            </ScrollCard>
          )}

          {/* 新设铺面：先开口说定要开一间什么铺子，再请 AI 推演底子 */}
          <ScrollCard title="新设铺面" subtitle="在这儿盘一间门面，先开口说定营生" className="mt-4">
            <div className="flex flex-wrap items-center gap-3">
              <SealButton onClick={() => setSetupOpen(true)} className="px-3 py-1.5 text-xs">
                <span className="flex items-center gap-1.5"><Coins size={12} /> 新设铺面</span>
              </SealButton>
              <span className="font-serif text-[11px] text-ink-lightest">
                盘店费 {lease} 下品灵石；说罢营生，自会推出货物、设施与本钱账目。
              </span>
            </div>
          </ScrollCard>

          {/* 街头卖艺：选一门本事考教五场 */}
          <ScrollCard title="街头卖艺" subtitle="寻一处空地，凭一门本事考教五场" className="mt-4">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <label className="flex items-center gap-2 font-serif text-xs text-ink-dark">
                本事
                <select
                  value={buskSkill || skills[0]?.id || ""}
                  onChange={(e) => setBuskSkill(e.target.value)}
                  disabled={skills.length === 0}
                  className="rounded border-2 border-ink-lightest/50 bg-paper-old px-2 py-1 font-serif text-xs text-ink-dark outline-none focus:border-gold-500 disabled:opacity-50"
                >
                  {skills.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}（Lv.{s.level}）
                    </option>
                  ))}
                </select>
              </label>
              <SealButton
                onClick={() => void perform()}
                disabled={buskBusy || skills.length === 0}
                className="px-3 py-1.5 text-xs"
              >
                <span className="flex items-center gap-1.5">
                  {buskBusy ? <Loader2 size={12} className="animate-spin" /> : <Music size={12} />}
                  {buskBusy ? `正在吆喝……已候 ${buskSeconds} 秒` : "开摊卖艺"}
                </span>
              </SealButton>
            </div>

            {skills.length === 0 && (
              <p className="font-serif text-xs text-ink-lightest mt-2">你还没立下一门本事，无从卖艺。</p>
            )}
            {buskBusy && (
              <p className="font-serif text-xs text-ink-light mt-2 leading-relaxed">
                五场考教与这一段的叙事一并写着，头一回多半慢些，稍等便好。
              </p>
            )}

            {buskResult && (
              <div className="mt-3 rounded border-2 border-ink-lightest/40 bg-paper-old/60 px-3 py-2">
                <div className="font-brush text-xs text-ink-dark mb-1">
                  五场考教 · 过 {buskResult.passed}/5，得 {buskResult.reward} 灵石
                  {buskResult.folkDelta < 0 ? `，平民名声 ${buskResult.folkDelta}` : ""}
                </div>
                <ul className="space-y-0.5">
                  {buskResult.rounds.map((r) => (
                    <li key={r.index} className="font-serif text-xs text-ink-medium">
                      第{r.index}场：{r.success ? `成了，得 ${r.reward}` : "失了手"}
                    </li>
                  ))}
                </ul>
                {buskText && (
                  <p className="mt-2 font-serif text-sm text-ink-dark leading-relaxed whitespace-pre-wrap">
                    {buskText}
                  </p>
                )}
              </div>
            )}
          </ScrollCard>

          {/* 这一坊市里的人：钉在这儿的、以及只知在城中的人都在这儿露面。
              接下的差事要找的人若正落在此处，星标出来 */}
          {known.length > 0 && (
            <ScrollCard title="这一坊市里的人" subtitle="认下过的旧识，攀谈两句无妨" className="mt-4">
              <div className="flex flex-wrap gap-2">
                {known.map((npc) => (
                  <button
                    key={npc.id}
                    onClick={() => {
                      meetNpc(npc);
                      openNPCChat(npc.id);
                    }}
                    title={`${npc.name}（${npc.title}）· 现在在${relationWhereabout(npc)}`}
                    className="flex items-center gap-2 px-3 py-1.5 rounded border-2 border-ink-lightest/40 bg-paper-old/50 font-serif text-xs text-ink-dark transition hover:border-gold-500"
                  >
                    <Users size={12} />
                    {npc.name} · {npc.title}
                    {wanted.has(npc.name) && <span className="text-gold-500" title="你要找的人">★</span>}
                  </button>
                ))}
              </div>
            </ScrollCard>
          )}

          {/* 街上的人：与平民住宅一样，认下便可攀谈 */}
          {fresh.length > 0 && (
            <ScrollCard title="街上的人" subtitle="坊市里走动的人，攀谈两句无妨" className="mt-4">
              <div className="flex flex-wrap gap-2">
                {fresh.map((npc) => (
                  <button
                    key={npc.id}
                    onClick={() => {
                      meetNpc(npc);
                      openNPCChat(npc.id);
                    }}
                    title={`${npc.name}（${npc.title}）`}
                    className="flex items-center gap-2 px-3 py-1.5 rounded border-2 border-ink-lightest/40 bg-paper-old/50 font-serif text-xs text-ink-dark transition hover:border-gold-500"
                  >
                    <Users size={12} />
                    {npc.name} · {npc.title}
                  </button>
                ))}
              </div>
            </ScrollCard>
          )}

          {note && <p className="font-serif text-[11px] text-gold-400/70 pt-3">{note}</p>}
          {error && <p className="font-serif text-[11px] text-cinnabar-400 pt-3 leading-relaxed">{error}</p>}

          <p className="font-serif text-[11px] text-paper-400/40 leading-relaxed pt-4">
            有货可卖的铺子能进门买卖，客栈茶棚能进去坐下打尖，浴堂能下汤池泡上一泡，瓦舍能听一场戏，当铺能押能赎，牙行能接差事也能领赏，镖局能雇一位镖师同行，武馆能租场演武、拜师学艺，宝物阁另有请人鉴宝的营生；其余各家还在门外张望。驻足一趟费一个时辰。
          </p>
        </div>
      </div>

      {openShopId && <PlayerShopModal shopId={openShopId} onClose={() => setOpenShopId(null)} />}

      {setupOpen && (
        <ShopSetupModal
          cityId={cityId}
          districtId={districtId}
          place={label}
          culture={culture}
          onClose={() => setSetupOpen(false)}
          onOpened={(id) => {
            setSetupOpen(false);
            setOpenShopId(id);
          }}
        />
      )}

      {entered &&
        (isBath(entered) ? (
          <BathModal label={label} shop={entered} onClose={() => setEntered(null)} />
        ) : isTheatre(entered) ? (
          <TheatreModal label={label} culture={culture} shop={entered} onClose={() => setEntered(null)} />
        ) : isPawn(entered) ? (
          <PawnModal
            cityId={cityId}
            districtId={districtId}
            label={label}
            shop={entered}
            onClose={() => setEntered(null)}
          />
        ) : isBroker(entered) ? (
          <BrokerModal
            cityId={cityId}
            districtId={districtId}
            label={label}
            culture={culture}
            shop={entered}
            onClose={() => setEntered(null)}
          />
        ) : isEscort(entered) ? (
          <EscortModal
            cityId={cityId}
            districtId={districtId}
            label={label}
            culture={culture}
            shop={entered}
            onClose={() => setEntered(null)}
          />
        ) : isMartial(entered) ? (
          <MartialHallModal
            cityId={cityId}
            districtId={districtId}
            label={label}
            culture={culture}
            shop={entered}
            onClose={() => setEntered(null)}
          />
        ) : isDining(entered) ? (
          <DiningModal
            cityId={cityId}
            districtId={districtId}
            label={label}
            culture={culture}
            shop={entered}
            onClose={() => setEntered(null)}
          />
        ) : (
          <GeneralStoreModal
            cityId={cityId}
            districtId={districtId}
            label={label}
            culture={culture}
            shop={entered}
            onClose={() => setEntered(null)}
          />
        ))}
    </div>
  );
}
