import { useMemo, useState } from "react";
import { useAIStore } from "@/store/useAIStore";
import { useGameStore } from "@/store/useGameStore";
import { lowStonesWorth } from "@/data/spiritStones";
import { ScrollCard } from "@/components/ui/ScrollCard";
import { SealButton } from "@/components/ui/SealButton";
import { manorKey } from "@/data/npcGen";
import { dishBuff, dishesFor } from "@/data/dishes";
import { HOURS_PER_DAY, MAX_LODGE_HOURS, ROOMS, lodgeCost, lodgeDurationLabel, recoverAmount, roomById } from "@/data/rooms";
import { cultivationGain, cultivationRecovery, localCultivationFrom } from "@/data/cultivation";
import { cn } from "@/lib/utils";
import { formatGameTime, formatTimeShort, shiftGameTime } from "@/lib/gameTime";
import { effectiveHpMax } from "@/lib/buffUtils";
import type { Dish } from "@/data/dishes";
import type { DineResult, Relation, Seat, Shop } from "@/data/types";
import { BedDouble, Coins, Loader2, MessageCircle, UserRound, UtensilsCrossed, X } from "lucide-react";

/** 在气血未过八成之前，客栈里怎么歇也补不回来 */
const HP_REST_THRESHOLD = 0.8;

/**
 * 客栈茶棚的堂内：一副副座头摆着，拣个空位坐下，叫一道当地的吃食。
 * 位子上坐着的可能是城里认得的人，也可能是头回见的面孔，都能攀谈两句。
 */
export function DiningModal({
  cityId,
  districtId,
  label,
  culture,
  shop,
  onClose,
}: {
  cityId: string;
  districtId: number;
  label: string;
  culture?: string;
  shop: Shop;
  onClose: () => void;
}) {
  const key = manorKey(cityId, districtId);
  const live = useGameStore((s) => s.markets[key]?.shops.find((x) => x.id === shop.id)) ?? shop;
  const stones = useGameStore((s) => lowStonesWorth(s.spiritStones));
  const player = useGameStore((s) => s.player);
  // 内伤一类状态压低了此刻的气血上限，界面上照实时的上限报
  const maxHp = effectiveHpMax(player);
  const sect = useGameStore((s) => s.sect);
  const currentTime = useGameStore((s) => s.currentTime);
  const meetNpc = useGameStore((s) => s.meetNpc);
  const payStones = useGameStore((s) => s.payStones);
  const addBuff = useGameStore((s) => s.addBuff);
  const removeBuff = useGameStore((s) => s.removeBuff);
  const addLog = useGameStore((s) => s.addLog);
  const addRumors = useGameStore((s) => s.addRumors);
  const advanceTime = useGameStore((s) => s.advanceTime);
  const setPlayer = useGameStore((s) => s.setPlayer);
  const openNPCChat = useAIStore((s) => s.openNPCChat);
  const dineAt = useAIStore((s) => s.dineAt);
  const lodgeAt = useAIStore((s) => s.lodgeAt);
  const shopStream = useAIStore((s) => s.shopStream);
  // 这两处正写着的那一段：边写边给玩家看
  const streamDine = shopStream.key === "dine" ? shopStream.text : "";
  const streamLodge = shopStream.key === "lodge" ? shopStream.text : "";

  /** 是打尖还是住店；茶棚不留宿，只有客栈给这个 */
  const canLodge = live.kind === "客栈";
  const [view, setView] = useState<"eat" | "lodge">("eat");
  const [seated, setSeated] = useState<string | null>(null);
  const [pickedDish, setPickedDish] = useState<string>("");
  const [telling, setTelling] = useState<DineResult | null>(null);
  const [lodged, setLodged] = useState<{ room: string; hours: number } | null>(null);
  /** 住几个时辰：一时辰起，最多三十日 */
  const [hours, setHours] = useState(HOURS_PER_DAY);
  const [resting, setResting] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const seats: Seat[] = useMemo(() => live.seats ?? [], [live.seats]);
  const menu = useMemo(() => dishesFor(culture), [culture]);
  const tables = useMemo(() => {
    const grouped = new Map<number, Seat[]>();
    for (const seat of seats) {
      const list = grouped.get(seat.table) ?? [];
      list.push(seat);
      grouped.set(seat.table, list);
    }
    return [...grouped.entries()].sort((a, b) => a[0] - b[0]);
  }, [seats]);

  const dish: Dish | undefined = menu.find((d) => d.name === pickedDish);

  /** 在桌边跟人搭话：先认下人，再开口；把这一席的场面一并交代过去 */
  const talkTo = (guest: Relation) => {
    meetNpc(guest);
    openNPCChat(guest.id, { shop: live.name, kind: live.kind, culture });
  };

  const order = async () => {
    if (!dish || busy) return;
    if (!payStones(dish.price)) {
      setError(`下品灵石不够，还差 ${dish.price - stones}。`);
      return;
    }
    // 同一道菜重吃一回，时辰从头算起
    removeBuff(`dish-${dish.name}`);
    addBuff(dishBuff(dish, `${live.name}的一席`, currentTime));
    addLog(`在「${live.name}」叫了${dish.name}。${dish.desc}`);
    advanceTime(1);

    setBusy(true);
    setError("");
    try {
      const res = await dineAt({
        shop: live.name,
        kind: live.kind,
        market: label,
        culture,
        dish: dish.name,
        dishDesc: dish.desc,
        guests: seats.filter((s) => s.guest).map((s) => `${s.guest!.name}（${s.guest!.title}）`),
      });
      addRumors(res.rumors);
      setTelling(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** 租下房间：先付房钱，钱不够便租不成 */
  const rent = (roomId: string) => {
    const room = roomById(roomId);
    if (!room) return;
    const n = Math.max(1, Math.min(MAX_LODGE_HOURS, Math.trunc(hours) || 1));
    const total = lodgeCost(room, n);
    if (!payStones(total)) {
      setError(`下品灵石不够，房钱要 ${total}。`);
      return;
    }
    setError("");
    setLodged({ room: roomId, hours: n });
    addLog(`你在「${live.name}」租下${room.name}，一住 ${lodgeDurationLabel(n)}，付了 ${total} 下品灵石。`);
  };

  /** 店中打听到的事，缀在叙事末尾一并说明 */
  const withScuttleNote = (res: { text: string; questName?: string; adventureName?: string }) =>
    res.text +
    (res.questName ? `\n\n店中应下一桩事：${res.questName}，已记在「福缘」。` : "") +
    (res.adventureName ? `\n\n听人说起一处去处：${res.adventureName}，已在舆图上落了一处。` : "");

  /** 歇下：时辰往前走，灵力与气血按房钱与天数补回来 */
  const rest = async () => {
    if (!lodged || busy) return;
    const room = roomById(lodged.room);
    if (!room) return;

    setBusy(true);
    setError("");
    // 气血未过八成便是伤着，客栈里歇不出伤来，只能回灵力；
    // 上限照临时状态压过的那一道算，内伤未愈便补不到满
    const mayRestHp = maxHp > 0 && Math.min(player.hp, maxHp) / maxHp >= HP_REST_THRESHOLD;
    const gainMp = recoverAmount(player.mpMax, room, lodged.hours);
    const gainHp = mayRestHp ? recoverAmount(maxHp, room, lodged.hours) : 0;

    setPlayer({
      ...player,
      mp: Math.min(player.mpMax, player.mp + gainMp),
      hp: Math.min(maxHp, player.hp + gainHp),
    });
    advanceTime(lodged.hours);
    addLog(
      `你在${live.name}的${room.name}歇了 ${lodgeDurationLabel(lodged.hours)}，灵力回了 ${gainMp}，气血回了 ${gainHp}。` +
        (mayRestHp ? "" : "伤还没养到八分，这一觉补不回气血。"),
    );

    try {
      const res = await lodgeAt({
        shop: live.name,
        market: label,
        culture,
        room: room.name,
        roomDesc: room.desc,
        hours: lodged.hours,
      });
      setResting(withScuttleNote(res));
      setLodged(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /**
   * 打坐修炼：把租下的日子用来练功。
   * 客房到底不如山门，进益只有在宗门建筑修炼的一半，且只长修为进度。
   */
  const train = async () => {
    if (!lodged || busy) return;
    const room = roomById(lodged.room);
    if (!room) return;

    setBusy(true);
    setError("");
    const spent = lodged.hours;
    const mul = localCultivationFrom({ facilities: sect?.facilities }).mul;
    const gain = Math.max(0, Math.round(cultivationGain(spent, mul) * 0.5));
    // 静坐也是吐纳，气血、灵力、神识照样慢慢回上来
    const rest = cultivationRecovery({
      hours: spent,
      hp: player.hp,
      hpMax: maxHp,
      mp: player.mp,
      mpMax: player.mpMax,
      spirit: player.spirit,
      spiritMax: player.spiritMax,
    });

    setPlayer({
      ...player,
      cultivation: (Number(player.cultivation) || 0) + gain,
      hp: rest.hp,
      mp: rest.mp,
      spirit: rest.spirit,
    });
    advanceTime(spent);
    const restNote =
      rest.hpGain + rest.mpGain + rest.spiritGain > 0
        ? `气血回 ${rest.hpGain}、灵力回 ${rest.mpGain}、神识回 ${rest.spiritGain}；`
        : "";
    addLog(
      `你在${live.name}的${room.name}静坐 ${lodgeDurationLabel(spent)}，参悟不辍，修为 +${gain}；${restNote}` +
        `客房清静到底不及山门，进益只有在宗门修炼之半。`,
    );

    try {
      const res = await lodgeAt({
        shop: live.name,
        market: label,
        culture,
        room: room.name,
        roomDesc: `${room.desc}；这一回是闭门静坐，不是安睡`,
        hours: spent,
      });
      setResting(withScuttleNote(res));
      setLodged(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const room = lodged ? roomById(lodged.room) : undefined;

  return (
    <div className="mainui-black fixed inset-0 z-[55] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-darkest/60 backdrop-blur-sm animate-inkSpread" onClick={onClose} />

      <div
        className="relative scroll-card rounded-lg w-full max-w-4xl max-h-[86vh] flex flex-col"
        style={{ animation: "inkSpread 0.4s ease-out" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-gold-500/20 bg-ink-800/95 backdrop-blur">
          <div className="flex items-center gap-3 min-w-0">
            <UtensilsCrossed size={18} className="text-gold-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="font-brush text-xl text-gold-400 tracking-widest truncate">{live.name}</h2>
              <p className="font-serif text-xs text-paper-400/60 mt-0.5 truncate">
                {label} · {live.kind}
                {live.keeper ? ` · ${live.keeper.name}（${live.keeper.title}）` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="flex items-center gap-1 font-serif text-xs text-paper-200">
              <Coins size={13} className="text-gold-400" />
              折合下品灵石 {stones}
            </span>
            {canLodge && (
              <div className="flex rounded border border-gold-500/25 overflow-hidden">
                {([
                  { id: "eat" as const, label: "打尖" },
                  { id: "lodge" as const, label: "住店" },
                ]).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setView(item.id);
                      setError("");
                    }}
                    className={
                      "px-3 py-1 font-serif text-xs transition " +
                      (view === item.id
                        ? "bg-gold-400/15 text-gold-400"
                        : "text-paper-400/60 hover:text-paper-200")
                    }
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded flex items-center justify-center text-paper-400/60 hover:text-paper-100 hover:bg-paper-400/10 transition"
              aria-label="关闭"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {view === "lodge" ? (
            <>
              {/* 选房：房钱按日算，房越好歇得越快 */}
              <h3 className="font-brush text-sm text-pine-400 tracking-widest mb-2">客房</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ROOMS.map((r) => {
                  const taken = lodged?.room === r.id;
                  return (
                    <ScrollCard key={r.id} className="!p-3">
                      <div className="flex items-baseline gap-2">
                        <span className="font-brush text-base text-paper-50">{r.name}</span>
                        <span className="font-number text-xs text-gold-400 ml-auto shrink-0">
                          {r.price} 灵石 / 日
                        </span>
                      </div>
                      <p className="font-serif text-[11px] text-paper-400/60 mt-1 leading-relaxed">{r.desc}</p>
                      <p className="font-serif text-[11px] text-jade-400/80 mt-1">
                        每日可补灵力与气血各 {Math.round(r.rate * 100)}%
                      </p>
                      <SealButton
                        variant={taken ? "seal" : "ghost"}
                        onClick={() => rent(r.id)}
                        className="w-full py-1.5 text-xs mt-3"
                      >
                        {taken && lodged ? `已租下 ${lodgeDurationLabel(lodged.hours)}` : "租下"}
                      </SealButton>
                    </ScrollCard>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <span className="font-serif text-xs text-paper-400/60">租几时辰</span>
                <input
                  type="number"
                  min={1}
                  max={MAX_LODGE_HOURS}
                  value={hours}
                  onChange={(e) =>
                    setHours(Math.max(1, Math.min(MAX_LODGE_HOURS, Math.trunc(Number(e.target.value)) || 1)))
                  }
                  className="w-20 input-ink text-sm text-center"
                />
                <span className="font-serif text-[11px] text-paper-400/45">
                  {lodgeDurationLabel(hours)}；一时辰起，最多三十日
                </span>
                <div className="flex items-center gap-1.5">
                  {[
                    { h: 1, label: "一时辰" },
                    { h: 6, label: "半日" },
                    { h: HOURS_PER_DAY, label: "一日" },
                    { h: HOURS_PER_DAY * 3, label: "三日" },
                  ].map((q) => (
                    <button
                      key={q.h}
                      type="button"
                      onClick={() => setHours(q.h)}
                      className={cn(
                        "rounded border px-2 py-0.5 font-serif text-[11px] transition",
                        hours === q.h
                          ? "border-gold-500 text-gold-400"
                          : "border-gold-500/25 text-paper-400/60 hover:text-paper-200",
                      )}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
                {lodged && room && (
                  <span className="font-serif text-xs text-gold-400/80 ml-auto">
                    已租「{room.name}」{lodgeDurationLabel(lodged.hours)}，共 {lodgeCost(room, lodged.hours)} 灵石
                  </span>
                )}
              </div>

              <div className="mt-3">
                <p className="font-serif text-[11px] text-paper-400/55 leading-relaxed">
                  眼下气血 {Math.min(player.hp, maxHp)}/{maxHp}、灵力 {player.mp}/{player.mpMax}。
                  {maxHp > 0 && Math.min(player.hp, maxHp) / maxHp >= HP_REST_THRESHOLD
                    ? "气血还足，歇息能把两样都补回来。"
                    : "气血已跌破八成，伤了根本，客栈里只能补回灵力——气血得另想办法。"}
                </p>
                {busy && streamLodge && (
                  <ScrollCard className="!p-4 mt-3">
                    <h3 className="font-brush text-sm text-gold-400 tracking-widest mb-2">这一觉</h3>
                    <p className="font-serif text-sm leading-relaxed text-paper-100 whitespace-pre-wrap">
                      {streamLodge}
                    </p>
                  </ScrollCard>
                )}
                {resting && (
                  <ScrollCard className="!p-4 mt-3">
                    <h3 className="font-brush text-sm text-gold-400 tracking-widest mb-2">这一觉</h3>
                    <p className="font-serif text-sm leading-relaxed text-paper-100 whitespace-pre-wrap">
                      {resting}
                    </p>
                  </ScrollCard>
                )}
              </div>
            </>
          ) : (
            <>
              {/* 堂内的座头：一张桌子一块，位子上有人就能攀谈 */}
              <h3 className="font-brush text-sm text-pine-400 tracking-widest mb-2">堂内座头</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {tables.map(([table, list]) => (
              <ScrollCard key={table} className="!p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-brush text-sm text-paper-200">第 {table} 桌</span>
                  <span className="font-serif text-[11px] text-paper-400/50">
                    {list.filter((s) => s.guest).length} 位有人
                  </span>
                </div>
                <div className="rounded bg-ink-900/50 border border-gold-500/15 p-2">
                  <div className="grid grid-cols-2 gap-2">
                    {list.map((seat) => {
                      const mine = seated === seat.id;
                      const guest = seat.guest;
                      if (guest) {
                        return (
                          <button
                            key={seat.id}
                            onClick={() => talkTo(guest)}
                            title={`与${guest.name}攀谈`}
                            className="text-left rounded border border-gold-500/25 bg-ink-800/60 px-2 py-1.5 transition hover:border-gold-400/50"
                          >
                            <div className="flex items-center gap-1.5">
                              <UserRound size={11} className="text-gold-400/70 shrink-0" />
                              <span className="font-brush text-xs text-paper-100 truncate">{guest.name}</span>
                            </div>
                            <div className="font-serif text-[10px] text-paper-400/50 truncate">「{guest.title}」</div>
                          </button>
                        );
                      }
                      return (
                        <button
                          key={seat.id}
                          onClick={() => {
                            setSeated(seat.id);
                            setError("");
                          }}
                          className={
                            "rounded border px-2 py-1.5 font-serif text-xs transition " +
                            (mine
                              ? "border-jade-500/60 bg-jade-500/10 text-jade-400"
                              : "border-dashed border-paper-400/20 text-paper-400/50 hover:border-gold-400/40 hover:text-paper-200")
                          }
                        >
                          {mine ? "你在此落座" : "空位"}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </ScrollCard>
            ))}
          </div>

          {/* 坐下之后才递菜单 */}
          {seated ? (
            <>
              <h3 className="font-brush text-sm text-pine-400 tracking-widest mt-5 mb-2">菜牌</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {menu.map((d) => {
                  const picked = pickedDish === d.name;
                  return (
                    <button
                      key={d.name}
                      onClick={() => {
                        setPickedDish(d.name);
                        setError("");
                      }}
                      className={
                        "text-left rounded border px-3 py-2 transition " +
                        (picked
                          ? "border-gold-400/70 bg-gold-400/10"
                          : "border-gold-500/20 bg-ink-800/50 hover:border-gold-400/40")
                      }
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="font-brush text-sm text-paper-50 truncate">{d.name}</span>
                        <span className="font-number text-xs text-gold-400 shrink-0 ml-auto">{d.price}</span>
                      </div>
                      <p className="font-serif text-[11px] text-paper-400/60 mt-0.5 leading-relaxed">{d.desc}</p>
                      <p className="font-serif text-[11px] text-jade-400/80 mt-1">
                        {d.buffName} · 顶 {d.hours} 个时辰
                      </p>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="font-serif text-xs text-paper-400/50 mt-5">先拣个空位坐下，再叫吃的。</p>
          )}

          {busy && streamDine && (
            <ScrollCard className="!p-4 mt-5">
              <h3 className="font-brush text-sm text-gold-400 tracking-widest mb-2">这一顿</h3>
              <p className="font-serif text-sm leading-relaxed text-paper-100 whitespace-pre-wrap">{streamDine}</p>
            </ScrollCard>
          )}

          {telling && (
            <ScrollCard className="!p-4 mt-5">
              <h3 className="font-brush text-sm text-gold-400 tracking-widest mb-2">这一顿</h3>
              <p className="font-serif text-sm leading-relaxed text-paper-100 whitespace-pre-wrap">
                {telling.narration}
              </p>
              {telling.rumors.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gold-500/15">
                  <div className="font-brush text-xs text-pine-400 tracking-widest mb-1.5">听来的话</div>
                  <ul className="space-y-1">
                    {telling.rumors.map((r, i) => (
                      <li key={i} className="font-serif text-[12px] text-paper-200 leading-relaxed">
                        「{r.text}」
                        <span className="text-paper-400/45 ml-1.5">——{r.source}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(telling.questName || telling.adventureName) && (
                <div className="mt-3 pt-3 border-t border-gold-500/15 space-y-1">
                  {telling.questName && (
                    <p className="font-serif text-[12px] leading-relaxed text-gold-300/90">
                      席间应下一桩事：{telling.questName}，已记在「福缘」。
                    </p>
                  )}
                  {telling.adventureName && (
                    <p className="font-serif text-[12px] leading-relaxed text-jade-300/90">
                      听人说起一处去处：{telling.adventureName}，已在舆图上落了一处。
                    </p>
                  )}
                </div>
              )}
            </ScrollCard>
          )}

            </>
          )}

          {error && <p className="font-serif text-xs text-cinnabar-400 leading-relaxed pt-3">{error}</p>}

          <p className="font-serif text-[11px] text-paper-400/40 leading-relaxed pt-4">
            {view === "lodge"
              ? `住店按时辰算，一时辰也住得，最多三十日；房钱照日价折成时辰价，租下之后点歇息才动身。`
              : "坐下点菜费一个时辰；位子上有人，点一下就能攀谈。"}
          </p>
        </div>

        <div className="sticky bottom-0 px-6 py-4 border-t border-gold-500/20 bg-ink-800/95 backdrop-blur">
          <div className="flex items-center gap-3">
            {view === "lodge" ? (
              <>
                <SealButton disabled={!lodged || busy} onClick={rest} className="px-4 py-2 text-sm">
                  {busy && <Loader2 size={13} className="mr-1 animate-spin" />}
                  {lodged && room
                    ? `歇息 ${lodgeDurationLabel(lodged.hours)}（至 ${formatTimeShort(shiftGameTime(currentTime, lodged.hours))}）`
                    : "先租一间房"}
                </SealButton>
                <SealButton
                  variant="ghost"
                  disabled={!lodged || busy}
                  onClick={train}
                  className="px-4 py-2 text-sm"
                >
                  {lodged ? `打坐修炼 ${lodgeDurationLabel(lodged.hours)}` : "打坐修炼"}
                </SealButton>
                <span className="flex items-center gap-1 font-serif text-[11px] text-paper-400/45">
                  <BedDouble size={11} />
                  歇息或修炼，时辰与外头的世事都照走；客房修炼只得宗门之半
                </span>
              </>
            ) : (
              <>
                <SealButton
                  disabled={!seated || !dish || busy}
                  onClick={order}
                  className="px-4 py-2 text-sm"
                >
                  {busy && <Loader2 size={13} className="mr-1 animate-spin" />}
                  {dish ? `叫这道 ${dish.name}（${dish.price}）` : "叫一道吃的"}
                </SealButton>
                {seated && (
                  <SealButton
                    variant="ghost"
                    onClick={() => {
                      setSeated(null);
                      setPickedDish("");
                    }}
                    className="px-4 py-2 text-sm"
                  >
                    起身
                  </SealButton>
                )}
                {seats.some((s) => s.guest) && (
                  <span className="flex items-center gap-1 font-serif text-[11px] text-paper-400/45">
                    <MessageCircle size={11} />
                    有人的位子可直接攀谈
                  </span>
                )}
              </>
            )}
            <span className="font-serif text-[11px] text-paper-400/45 ml-auto">
              {formatGameTime(currentTime)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
