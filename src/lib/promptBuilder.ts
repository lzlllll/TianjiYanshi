import type { DataOp, GameState, LocationType, CraftingResult } from "@/data/types";
import type { ChatMessage } from "@/lib/aiClient";
import { parseJsonPayload } from "@/lib/dataOps";
import { REALMS, REALM_NAMES } from "@/data/mockData";
import { CULTIVATION_PER_HOUR, localCultivationFrom } from "@/data/cultivation";
import { reputationBrief } from "@/data/reputation";
import { beastBrief } from "@/data/beast";
import { getCityMarkers, getDistricts, getMarker, getMarkers, getScene, sectSceneId } from "@/data/map";
import { sectBuildingRoster } from "@/data/map/sectBuildings";
import { LOCATIONS, LOCATION_NAMES } from "@/data/locations";
import { ALL_GOOD_NAMES } from "@/data/goods";
import { aliveRumors } from "@/data/rumors";
import { isRewardHeld } from "@/data/quests";
import { DC_HINT, SKILL_LEVEL_MAX } from "@/data/skills";
import { BUFF_TARGET_STATS, buffCatalogBrief } from "@/data/buffs";
import { sectModifierBrief } from "@/data/sectModifiers";
import { PLAYER_SHOP_KINDS } from "@/data/playerShops";
import {
  OPENING_GAME_TIME,
  SHICHEN_NAMES,
  daySerial,
  formatGameTime,
  shichenName,
} from "@/lib/gameTime";

/** 世界地图上可供往来的城池名；叙事只许在这些地方之间移动 */
function getCityNames(): string[] {
  return getCityMarkers().map((m) => m.name);
}

/** 舆图上的地标名（非城池）；开局择地时给模型作备选 */
function getLandmarkNames(): string[] {
  return getMarkers()
    .filter((m) => m.kind !== "city")
    .map((m) => m.name);
}

/** 城池按文化圈归类，开局择地时好照角色的来历就近挑一座 */
function cityBriefByCulture(): string {
  const byCulture = new Map<string, string[]>();
  for (const m of getCityMarkers()) {
    const culture = (m.culture || "他乡").trim();
    const list = byCulture.get(culture) ?? [];
    list.push(m.name);
    byCulture.set(culture, list);
  }
  return [...byCulture.entries()].map(([culture, names]) => `${culture}一带：${names.join("、")}`).join("；");
}

/**
 * 开局择地：从开篇叙事里认出玩家落脚在哪一处、又在城中哪一处场所。
 * 认不出就交白卷；地点照旧由叙事引擎定，这里只负责把它读回来。
 */
export function buildOpeningPlacePrompt(narrative: string): ChatMessage[] {
  const cities = getCityNames();
  const landmarks = getLandmarkNames();
  const system = `你是修仙文字游戏的数据助手。请从下面这段开篇叙事里，认出玩家落脚在何处——可能是一座城，也可能是舆图上的一处地标；若在城中，再认出他眼下在城中哪一处。

【只输出一个 JSON 对象】{"place": "地名", "location": "场所"}
- place 须是下列名字之一，原样照抄，不要加「城」「府」之类的后缀
- 城池：${cities.join("、")}
${landmarks.length ? `- 地标：${landmarks.join("、")}\n` : ""}- location 只有在玩家确在城中时才写，且须是下列名字之一：${LOCATION_NAMES.join(
    "、",
  )}；他若在野外、山门外或别的不在此列的地方，location 写空字符串 ""
- 正文里若看不出玩家落在哪儿，或落在的地方不在上面两列里，place 写空字符串 ""，不要猜、不要自造`;

  const user = `【开篇叙事正文】
${narrative.slice(0, 6000)}

请输出 JSON：`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

const LOCATION_INFO: Record<LocationType, { name: string; allowed: string; forbidden: string }> = {
  home: {
    name: "住所",
    allowed: "休息、冥想、与来访客人交谈、整理物品",
    forbidden: "炼丹、炼器、修炼突破、大规模战斗",
  },
  alchemy_room: {
    name: "炼丹房",
    allowed: "炼丹、配药、研究丹方、与其他炼丹师交流",
    forbidden: "炼器、修炼突破、大规模战斗、摆摊交易",
  },
  forge_room: {
    name: "炼器室",
    allowed: "炼器、锻造、修复法宝、与其他炼器师交流",
    forbidden: "炼丹、修炼突破、大规模战斗、摆摊交易",
  },
  meditation_room: {
    name: "闭关室",
    allowed: "修炼、突破、参悟功法、静心悟道",
    forbidden: "炼丹、炼器、摆摊交易、大规模社交活动",
  },
  market: {
    name: "集市",
    allowed: "购物、出售物品、打探消息、与人交易、结识散修",
    forbidden: "炼丹、炼器、修炼突破、大规模战斗",
  },
  library: {
    name: "藏经阁",
    allowed: "研读典籍、参悟功法、借阅秘籍、与长老请教",
    forbidden: "炼丹、炼器、大声喧哗、战斗",
  },
  training_ground: {
    name: "演武场",
    allowed: "修炼武技、切磋比武、演练功法、与同门交流",
    forbidden: "炼丹、炼器、摆摊交易",
  },
  outdoor: {
    name: "野外",
    allowed: "探索、狩猎妖兽、采集药材、寻找机缘、野外修炼",
    forbidden: "炼丹、炼器、摆摊交易、大规模社交活动",
  },
};

/** 生成全量数据路径摘要，供 flash 模型判断相关性 */
export function buildDataSchema(state: GameState): string {
  const p = state.player;
  const lines: string[] = [];
  lines.push(`player.name = ${p.name || ""}`);
  lines.push(`player.title = ${p.title || ""}`);
  lines.push(`player.realm = ${REALM_NAMES[p.realmIndex] ?? "未知"} (realmIndex=${p.realmIndex}, stage=${p.realmStage})`);
  // 修炼的算法摆在这儿：每时辰多少、离下一境还差多少
  const realmIdx = Math.max(0, Number(p.realmIndex) || 0);
  const nextRealm = REALMS[realmIdx + 1];
  const eff = localCultivationFrom({
    facilities: state.sect?.facilities,
    location: state.currentLocation,
  });
  lines.push(
    `player.cultivation = ${p.cultivation}${
      nextRealm && nextRealm.cultivationNeeded > 0
        ? `（离${REALM_NAMES[realmIdx + 1] ?? `${nextRealm.name}${nextRealm.stage}`}还需 ${nextRealm.cultivationNeeded} 点）`
        : ""
    }`,
  );
  lines.push(`修炼效率 = 每时辰 ${CULTIVATION_PER_HOUR * eff.mul} 点进度（倍数 ×${eff.mul}，${eff.note}）`);
  lines.push(`player.hp = ${p.hp}/${p.hpMax}`);
  lines.push(`player.mp = ${p.mp}/${p.mpMax}`);
  lines.push(`player.spirit = ${p.spirit}/${p.spiritMax}`);
  lines.push(`player.lifespan = ${p.lifespanCurrent}/${p.lifespanMax}`);
  lines.push(`player.body = ${p.body || ""}`);
  lines.push(`player.fortune = ${p.fortune || ""}`);
  lines.push(`player.karma = ${p.karma}`);
  lines.push(`reputation = ${reputationBrief(state.reputation)}`);
  // 随身的灵兽也报一声，叙事里好叫它有戏
  if (state.beast) lines.push(`beast = ${beastBrief(state.beast)}`);
  lines.push(`player.sectName = ${p.sectName || ""}`);
  lines.push(`player.position = ${p.position || ""}`);
  // 门中眼下生效的修正（政策、态势一类的时效），写到成效时照此落笔
  const sectMods = Array.isArray(state.sect?.modifiers) ? state.sect!.modifiers! : [];
  if (sectMods.length > 0) {
    lines.push(`sect.modifiers = ${sectMods.map((m) => `${m.name}（至第${m.until}日）`).join(" ")}`);
  }
  lines.push(`player.background = ${p.background || ""}`);
  lines.push(`player.personality = ${p.personality || ""}`);
  lines.push(`player.description = ${p.description || ""}`);

  // 所在地点：玩家在大地图上的位置，叙事与结算都可能改动它
  const place = getMarker(state.currentPlaceId);
  lines.push(`currentPlaceId = ${place ? `${place.id}（${place.name}）` : "未知之地"}`);
  lines.push(`currentPlaceId 可选值 = ${getCityNames().join(" ")}`);

  // 城中场所：同样只能由叙事回写，玩家没有手动切换的入口
  const here = LOCATIONS.find((l) => l.id === state.currentLocation);
  lines.push(`currentLocation = ${here ? `${here.id}（${here.name}）` : "未知场所"}`);
  lines.push(`currentLocation 可选值 = ${LOCATION_NAMES.join(" ")}`);

  // 城内街区：叙事可以把某一处写成独有的名字，这里列出当前城池的街区编号与性质
  const districts = place ? getDistricts(place.id) : [];
  if (districts.length > 0) {
    const named = state.districtNames ?? {};
    lines.push(
      `district 可选值 = ${districts
        .map((d) => {
          const name = named[`${place!.id}:${d.id}`];
          return `${d.id}（${name ? `${name}·${d.nature}` : d.nature}）`;
        })
        .join(" ")}`,
    );
  }

  // 野外村庄：散在舆图上的预设点位里，未前往的平日与玩家无涉；列出村名供叙事落笔
  const villages = Object.values(state.villages ?? {});
  if (villages.length > 0) {
    lines.push(
      `village 可选值 = ${villages
        .map((v) => `${v.name}（${v.culture ? `${v.culture}一带，` : ""}${v.visited ? "已前往" : "未往"}）`)
        .join(" ")}`,
    );
  }

  // 名下产业：可供叙事处置（出租等）；列出名号与所在地，租出去的报一声租客
  const estates = Array.isArray(state.estates) ? state.estates : [];
  const manorPlots = Array.isArray(state.manorPlots) ? state.manorPlots : [];
  if (estates.length > 0 || manorPlots.length > 0) {
    const parts = [
      ...estates.map((e) => `${e.name}（${e.place}${e.rent ? `·已租与${e.rent.tenant}` : ""}）`),
      ...manorPlots.map((p) => `${p.place}·宅邸${p.rent ? `（已租与${p.rent.tenant}）` : ""}`),
    ];
    lines.push(`产业 = ${parts.join(" ")}`);
  }

  const t = state.currentTime || OPENING_GAME_TIME;
  lines.push(`currentTime = ${formatGameTime(t)}`);
  lines.push(`currentTime.year = ${t.year}`);
  lines.push(`currentTime.month = ${t.month}`);
  lines.push(`currentTime.day = ${t.day}`);
  lines.push(`currentTime.hour = ${shichenName(t.hour)}（十二时辰序号 ${t.hour}）`);
  lines.push(`currentTime.hour 可选值 = ${SHICHEN_NAMES.join(" ")}`);

  const spiritRoots = Array.isArray(p.spiritRoots) ? p.spiritRoots : [];
  lines.push(`player.spiritRoots = ${spiritRoots.map((r) => `${r.element}${r.value}`).join(" ") || "(空)"}`);

  const heartScores = Array.isArray(p.stats?.heartScores) ? p.stats.heartScores : [];
  lines.push(
    `player.stats = 体力${p.stats?.vitality ?? 0} 神魂${p.stats?.soul ?? 0} 悟性${p.stats?.wisdom ?? 0} 身法${p.stats?.agility ?? 0} 心性[${heartScores.map((hs) => `${hs.trait}${hs.score}`).join(",") || "空"}]`,
  );

  const meridians = Array.isArray(p.meridians) ? p.meridians : [];
  lines.push(`player.meridians = ${meridians.map((m) => `${m.name}${m.clarity}/${m.maxClarity}${m.damage ? "[伤]" : ""}`).join(" ") || "(空)"}`);

  const timeline = Array.isArray(p.timeline) ? p.timeline : [];
  lines.push(`player.timeline = ${timeline.map((e) => `${e.year}｜${e.title}`).join("  ") || "(空)"}`);

  lines.push(`spiritStones.low = ${state.spiritStones?.low ?? 0}`);
  lines.push(`spiritStones.mid = ${state.spiritStones?.mid ?? 0}`);
  lines.push(`spiritStones.high = ${state.spiritStones?.high ?? 0}`);
  lines.push(`spiritStones.supreme = ${state.spiritStones?.supreme ?? 0}`);

  const adjusts = Array.isArray(state.priceAdjusts) ? state.priceAdjusts : [];
  lines.push(
    adjusts.length
      ? `货物行情 = ${adjusts.map((a) => `${a.good}×${a.factor}（至第${a.untilDay}日）`).join("  ")}`
      : "货物行情 = (无涨跌)",
  );

  const rumors = aliveRumors(state.rumors, t);
  lines.push(
    rumors.length
      ? `rumors（最近一个月听来的流言，括号里是听来的城池与地方） = ${rumors.slice(0, 6).map((r) => `${r.text}（闻于${r.city ? `${r.city}·` : ""}${r.source}）`).join("  ")}`
      : "rumors（最近一个月听来的流言） = (无)",
  );

  const skills = Array.isArray(state.skills) ? state.skills : [];
  skills.forEach((s) => {
    lines.push(`skills[${s.id}] = ${s.name} ${s.kind} Lv.${s.level}/${SKILL_LEVEL_MAX} 进度${s.progress}/${s.progressMax} ${s.desc}`);
  });

  const checks = Array.isArray(state.checks) ? state.checks : [];
  lines.push(
    checks.length
      ? `最近判定 = ${checks
          .slice(-4)
          .map(
            (c) =>
              `${c.skill}(难度${c.dc} 掷${c.roll}+Lv.${c.level}=${c.total}) ${c.success ? "成" : c.pending ? "未成·还悬着，可争可认" : c.admitted ? "已认栽" : "不成"}`,
          )
          .join("  ")}`
      : "最近判定 = (无)",
  );

  // 机缘：托付下来的事，写明哪儿办、什么期限、还差几日
  const today = daySerial(t);
  const quests = Array.isArray(state.quests) ? state.quests : [];
  quests.forEach((q) => {
    const left =
      q.dueDay === undefined
        ? "不限时"
        : q.status !== "open"
          ? `第${q.dueDay}日止`
          : q.dueDay - today < 0
            ? `已误期${today - q.dueDay}日`
            : `还剩${q.dueDay - today}日`;
    const reward = q.rewardKind && q.rewardAmount ? `${q.rewardKind}${q.rewardAmount}` : q.reward || "无";
    const penalty = q.penaltyKind && q.penaltyAmount ? `${q.penaltyKind}${q.penaltyAmount}` : q.penalty || "无";
    lines.push(
      `quests[${q.id}] = ${q.name}【${q.kind ?? "事件"}】（${q.status === "open" ? "在办" : q.status === "done" ? "已了" : "已误"}） ${q.place || "去处未定"} ${left} 托自${q.giver || "无名"} 交差：${q.condition || "未写明"} 酬：${reward} 罚：${penalty}${q.outcome ? ` 结果：${q.outcome}` : ""}`,
    );
  });
  if (quests.length === 0) lines.push("quests = (无)");

  // 奇遇：舆图预设点位里开出来的野外去处，人到了它所在的那一带才进得去
  const adventures = Array.isArray(state.adventures) ? state.adventures : [];
  const openAdvs = adventures.filter((a) => a?.status === "open");
  openAdvs.forEach((a) => {
    const city = a.cityId ? getMarker(a.cityId)?.name ?? "" : "";
    const reward = a.rewardKind && a.rewardAmount ? `${a.rewardKind}${a.rewardAmount}` : a.reward || "无";
    lines.push(
      `adventures[${a.id}] = ${a.name}（${a.kind}·凶险${a.danger}）在${city ? `${city}一带` : "舆图某处"} ${a.summary || ""}${a.persistent ? " 常设" : ""} 可图：${reward}`,
    );
  });
  if (openAdvs.length === 0) lines.push("adventures = (无)");

  const techniques = Array.isArray(state.techniques) ? state.techniques : [];
  techniques.forEach((t) => {
    lines.push(
      `techniques[${t.id}] = ${t.name} ${t.category} ${t.grade} ${t.daoPath} ${t.element}系 ${t.nature}性 熟练${t.proficiency}/${t.proficiencyMax} 心性匹配[${t.heartMatch?.join(",") || ""}]`,
    );
  });

  const inventory = Array.isArray(state.inventory) ? state.inventory : [];
  inventory.forEach((i) => {
    const eq = i.equipped ? ` 已装备${i.slot}` : "";
    lines.push(
      `inventory[${i.id}] = ${i.name} ${i.type} ${i.grade} ×${i.count}${eq}`,
    );
  });

  const s = state.sect || { name: "", level: 1, contribution: 0, leader: "", territory: "", appearance: "", reputationDesc: "", surroundings: "", positions: [], tasks: [], heritage: [], resources: [] };
  lines.push(`sect.name = ${s.name || ""}`);
  lines.push(`sect.level = ${s.level}`);
  lines.push(`sect.contribution = ${s.contribution}`);
  lines.push(`sect.leader = ${s.leader || ""}`);
  lines.push(`sect.territory = ${s.territory || ""}`);
  lines.push(`sect.appearance = ${s.appearance || ""}`);
  lines.push(`sect.reputationDesc = ${s.reputationDesc || ""}`);
  lines.push(`sect.surroundings = ${s.surroundings || ""}`);

  // 本门山门里立着哪几座建筑：叙事要点名拆毁时，须挑这里报得出的名目（主殿不在此列，拆不得）
  const mineSite = Array.isArray(state.sectSites) ? state.sectSites.find((x) => x?.mine) : undefined;
  if (mineSite) {
    const scene = getScene(sectSceneId(mineSite.id));
    const rosterNames = scene ? sectBuildingRoster(scene).map((b) => b.name) : [];
    const names = Array.from(new Set([...rosterNames, ...Object.values(mineSite.built ?? {})]));
    lines.push(`本门建筑（可点名拆毁者，主殿不在其列）= ${names.length ? names.join("、") : "(无)"}`);
    if (Array.isArray(mineSite.destroyed) && mineSite.destroyed.length > 0) {
      lines.push(`本门已毁建筑 = ${mineSite.destroyed.join("、")}`);
    }
  }

  // 本门的四类词条。叙事里提到本门时，上下相处、门人言行都要合这一股风气与性子，
  // 别把「严整如军」的门写成清谈散漫的模样。
  // 这几条只作叙述的底子，不写成 sect.xxx 那样的路径，免得被当成可改的数据。
  const mine = state.sect;
  const termText = (label: string, term?: { name?: string; note?: string }) =>
    term?.name ? `${label}：${term.name}${term.note ? `（${term.note}）` : ""}` : "";
  const terms = [
    termText("性质", mine?.nature),
    termText("风气", mine?.climate),
    termText("特色", mine?.feature),
    termText("开局", mine?.start),
  ].filter(Boolean);
  if (terms.length > 0) {
    lines.push(`本门词条（提到本门时照这几条落笔，上下相处与门人言行都要合得上）＝ ${terms.join("；")}`);
  }

  // 江湖上已有的门派。叙事里凡涉门派，先照这些写，别另造名号、也别把它们挪地方；
  // 确需一处本局没有的，见 ops 规则第 29 条，现立一处
  const otherSites = (Array.isArray(state.sectSites) ? state.sectSites : []).filter(
    (x) => x?.name && !x.mine,
  );
  if (otherSites.length > 0) {
    // 各家门里立着哪几座建筑也一并报出来：地点类机缘要指某座山门的某座建筑时，好照真名写
    const entryOf = (x: (typeof otherSites)[number]) => {
      const scene = getScene(sectSceneId(x.id));
      const roster = scene ? sectBuildingRoster(scene).map((b) => b.name) : [];
      const names = Array.from(new Set([...roster, ...Object.values(x.built ?? {})])).slice(0, 16);
      const buildings = names.length ? `；建筑：${names.join("、")}` : "";
      return `${x.name}（${x.culture}·${x.seat}·${x.nature?.name ?? "门派"}·${x.level} 级${buildings}）`;
    };
    lines.push(
      `江湖上的门派（叙事里凡涉门派先照这些，用它们的名号、驻地与性质；写某座山门的某座建筑时照「建筑」那一列的真名写）＝ ${otherSites
        .map(entryOf)
        .join("；")}`,
    );
  }

  // 宗门之间的交情：起初一张白纸，由叙事与新闻照这一份添改
  const sectRels = Array.isArray(state.sectRelations) ? state.sectRelations : [];
  if (sectRels.length > 0) {
    const allSites = Array.isArray(state.sectSites) ? state.sectSites : [];
    const nameOf = (id: string) => allSites.find((s) => s.id === id)?.name ?? id;
    lines.push(
      `宗门关系 = ${sectRels
        .map(
          (r) =>
            `${nameOf(r.a)}与${nameOf(r.b)}${r.stance}（${r.relation > 0 ? "+" : ""}${r.relation}${
              r.note ? `，${r.note}` : ""
            }）`,
        )
        .join("；")}`,
    );
    const vassals = otherSites.filter((x) => x.vassalOf);
    if (vassals.length > 0) {
      const mineName = state.sect?.name || allSites.find((s) => s.mine)?.name || "本门";
      lines.push(
        `已臣服的门派 = ${vassals.map((x) => `${x.name}（附庸于${mineName}，按日纳贡）`).join("；")}`,
      );
    }
  }

  // 城村的归属：谁占着哪一处，由叙事与新闻照这一份添改
  const occs = Array.isArray(state.occupations) ? state.occupations : [];
  if (occs.length > 0) {
    lines.push(
      `城村归属（谁家占着哪座城、哪个村）＝ ${occs
        .map((o) => `${o.targetName}（${o.kind === "city" ? "城" : "村"}，属${o.ownerName}）`)
        .join("；")}`,
    );
  }

  // 眼下这座城的铺面：叙事要写「到某家铺子买卖」时，照这里的真名写，界面才认得
  const cityForShops = String(state.currentPlaceId ?? "");
  const cityShopNames = Object.entries(state.markets ?? {})
    .filter(([k]) => k.startsWith(`${cityForShops}:`))
    .flatMap(([, m]) => (m.shops ?? []).map((s) => `${s.name}（${s.kind}）`));
  if (cityShopNames.length > 0) {
    lines.push(`本城铺面（叙事要写「到某家铺子买卖」时照这些真名写）＝ ${cityShopNames.join("；")}`);
  }

  const positions = Array.isArray(s.positions) ? s.positions : [];
  positions.forEach((pos) => {
    const mark = pos.isCurrent ? "【现任】" : pos.unlocked ? "已达" : "未达";
    lines.push(`sect.positions[${pos.id}] = ${pos.name} Lv${pos.level} ${mark} 需贡献${pos.contributionNeeded}`);
  });

  const tasks = Array.isArray(s.tasks) ? s.tasks : [];
  tasks.forEach((t) => {
    lines.push(
      `sect.tasks[${t.id}] = ${t.title} 难度${t.difficulty} 贡献${t.contribution} 灵石${t.spiritStone}${t.accepted ? " 已接" : ""}`,
    );
  });

  const heritage = Array.isArray(s.heritage) ? s.heritage : [];
  heritage.forEach((h, idx) => {
    lines.push(`sect.heritage[${idx}] = ${h.name} ${h.type} ${h.grade} ${h.status}`);
  });

  const resources = Array.isArray(s.resources) ? s.resources : [];
  resources.forEach((r, idx) => {
    lines.push(`sect.resources[${idx}] = ${r.name} ${r.amount}${r.unit}`);
  });

  const relations = Array.isArray(state.relations) ? state.relations : [];
  relations.forEach((r) => {
    const statsStr = r.stats
      ? ` HP${r.stats.hp}/${r.stats.hpMax} 攻${r.stats.attack} 防${r.stats.defense} 速${r.stats.speed}`
      : "";
    const techStr = r.techniqueIds?.length ? ` 功法[${r.techniqueIds.join(",")}]` : "";
    // 行踪写清他这会儿在哪儿：路径 relations[<id>].place 可以改它，街区对不上便只记到城池
    const stayStr = ` 现在在${whereaboutsOf(r, state.districtNames)}${
      r.fixedUntilDay !== undefined ? `（守到第${r.fixedUntilDay}日）` : ""
    }${r.traveling ? " 与你同行" : ""}`;
    lines.push(
      `relations[${r.id}] = ${r.name} ${r.title} ${relationTypeLabel(r.type)} 境界${r.realm} ${bondLabel(r)}${statsStr}${techStr}${stayStr}`,
    );
    // 叙事当初给这人写定的人设与攒下的旧事，一并带上，好让往后的言语前后对得上
    if (r.persona) lines.push(`relations[${r.id}].persona = ${r.persona}`);
    if (r.memory) lines.push(`relations[${r.id}].memory = ${r.memory}`);
  });

  return lines.join("\n");
}

/** 这人眼下在哪儿，写到提示词里给人看 */
function whereaboutsOf(
  r: { cityId?: string; districtId?: number },
  districtNames?: Record<string, string>,
): string {
  const city = r.cityId ? getMarker(r.cityId) : undefined;
  if (!city) return "行踪不定";
  if (typeof r.districtId !== "number") return `${city.name}一带`;
  const named = districtNames?.[`${city.id}:${r.districtId}`];
  const nature = getDistricts(city.id).find((d) => d.id === r.districtId)?.nature;
  return `${city.name}·${named || nature || r.districtId}`;
}

function relationTypeLabel(t: string): string {
  return (
    {
      dao_companion: "道侣",
      master: "师父",
      disciple: "徒弟",
      friend: "好友",
      enemy: "仇敌",
    } as Record<string, string>
  )[t] ?? t;
}

/** flash 提示：判断决策涉及的数据路径 + 是否涉及炼丹/画符，要求 JSON 输出 */
export function buildFlashPrompt(decision: string, schema: string): ChatMessage[] {
  return [
    {
      role: "system",
      content: `你是修仙文字游戏的数据判断助手。给定玩家决策与全部数据路径摘要，判断此次决策涉及的数据。

必须只输出一个 JSON 对象，不要输出解释、注释或代码围栏：
{
  "crafting": "none",
  "paths": ["player.cultivation", "inventory"]
}

【crafting 规则】
- 仅当决策明确包含"开炉炼丹""炼制丹药""画符""绘制符箓"等百艺制作行为时，填 "alchemy" 或 "talisman"
- 玩家只是"服用丹药""使用符箓""查看丹药"等使用或查看行为，一律填 "none"

【paths 规则】
- 从数据路径摘要中原样复制本次决策会读取或修改的路径，每项一个字符串
- 路径可以是字段（如 player.cultivation）、数组元素（如 techniques[t1].proficiency）或集合名（如 inventory、relations、sect.tasks）
- 不得编造摘要中不存在的路径；无涉及时输出空数组`,
    },
    {
      role: "user",
      content: `【玩家决策】\n${decision}\n\n【全部数据路径摘要】\n${schema}\n\n请输出 JSON：`,
    },
  ];
}

/** 解析 flash 判断结果 */
export interface FlashDecision {
  crafting: "alchemy" | "talisman" | null;
  paths: string[];
}

/** 解析 flash 输出的 JSON 判断结果，兼容旧的纯文本格式 */
export function parseFlashDecision(raw: string): FlashDecision {
  const parsed = parseJsonPayload(raw);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const rawCrafting = String((parsed as any).crafting ?? "").trim().toLowerCase();
    const crafting =
      rawCrafting === "alchemy" || rawCrafting === "talisman" ? (rawCrafting as "alchemy" | "talisman") : null;

    const rawPaths = (parsed as any).paths;
    const paths = Array.isArray(rawPaths)
      ? rawPaths.map((p: any) => String(p).trim()).filter(Boolean).slice(0, 60)
      : [];

    return { crafting, paths };
  }

  // 回退：兼容旧的分行文本格式
  return { crafting: parseFlashCraftingText(raw), paths: parseFlashPathsText(raw) };
}

/** 解析旧文本格式的 CRAFTING 标记 */
function parseFlashCraftingText(raw: string): "alchemy" | "talisman" | null {
  const match = raw.match(/CRAFTING:\s*(alchemy|talisman)/i);
  if (!match) return null;
  return match[1].toLowerCase() as "alchemy" | "talisman";
}

function parseFlashPathsText(raw: string): string[] {
  const paths: string[] = [];
  for (const rawLine of raw.split("\n")) {
    const line = rawLine
      .trim()
      .replace(/^[-*•\d.、\s]+/, "")
      .replace(/[。，,；;]$/, "")
      .replace(/^["']|["']$/g, "")
      .trim();
    if (!line) continue;
    if (/^CRAFTING:/i.test(line)) continue;
    if (/^(crafting|paths)\b/i.test(line)) continue;
    if (/[{}[\]]/.test(line)) continue;
    if (/(?:^|\s)(?:路径|数据|涉及|输出|注意|请)/.test(line)) continue;
    paths.push(line);
  }
  return paths.slice(0, 60);
}

/** 根据路径从状态中解析出相关数据片段 */
export function resolveRelevantData(state: GameState, paths: string[]): string {
  if (paths.length === 0) {
    return buildDataSchema(state);
  }
  const lines: string[] = [];
  const MAX_LINES = 200;
  const MAX_TOTAL_LENGTH = 150000;
  let totalLength = 0;

  for (const path of paths) {
    if (lines.length >= MAX_LINES) {
      lines.push("... (数据过多，已截断)");
      break;
    }
    const result = describePath(state, path);
    if (result && result.length < 5000) {
      if (totalLength + result.length > MAX_TOTAL_LENGTH) {
        lines.push("... (数据过多，已截断)");
        break;
      }
      lines.push(result);
      totalLength += result.length;
    }
  }

  const finalResult = lines.filter(Boolean).join("\n");
  console.debug(`[promptBuilder] resolveRelevantData: ${paths.length} paths, ${finalResult.length} chars`);
  return finalResult;
}

function describePath(state: GameState, path: string): string {
  if (!path || path.length > 100) {
    return "";
  }

  // 集合名
  if (path === "inventory") {
    const inventory = Array.isArray(state.inventory) ? state.inventory : [];
    if (inventory.length === 0) return "inventory: (空)";
    return "inventory:\n" + inventory.slice(0, 30).map((i) => `  [${i.id}] ${i.name} ${i.type} ${i.grade} ×${i.count}${i.equipped ? ` 已装备${i.slot}` : ""}`).join("\n");
  }
  if (path === "techniques") {
    const techniques = Array.isArray(state.techniques) ? state.techniques : [];
    if (techniques.length === 0) return "techniques: (空)";
    return "techniques:\n" + techniques.slice(0, 30).map((t) => `  [${t.id}] ${t.name} ${t.category} ${t.grade} 熟练${t.proficiency}/${t.proficiencyMax}`).join("\n");
  }
  if (path === "relations") {
    const relations = Array.isArray(state.relations) ? state.relations : [];
    if (relations.length === 0) return "relations: (空)";
    return (
      "relations:\n" +
      relations
        .slice(0, 30)
        .map((r) => {
          const stay = ` 现在在${whereaboutsOf(r, state.districtNames)}${
            r.fixedUntilDay !== undefined ? `（守到第${r.fixedUntilDay}日）` : ""
          }${r.traveling ? "（与你同行）" : ""}`;
          const extra = `${r.persona ? `\n    人设：${r.persona}` : ""}${r.memory ? `\n    记着：${r.memory}` : ""}`;
          return `  [${r.id}] ${r.name} ${relationTypeLabel(r.type)} ${bondLabel(r)} ${r.realm}${stay}${extra}`;
        })
        .join("\n")
    );
  }
  if (path === "log") {
    const log = Array.isArray(state.log) ? state.log : [];
    return "log(最近5条):\n" + log.slice(0, 5).map((l) => `  - ${l}`).join("\n");
  }
  if (path === "rumors") {
    const rumors = aliveRumors(state.rumors, state.currentTime || OPENING_GAME_TIME);
    if (rumors.length === 0) return "rumors: (无)";
    return (
      "rumors(最近一个月听来的，括号里是听来的城池与地方):\n" +
      rumors.slice(0, 12).map((r) => `  - ${r.text}（闻于${r.city ? `${r.city}·` : ""}${r.source}）`).join("\n")
    );
  }
  if (path === "skills") {
    const skills = Array.isArray(state.skills) ? state.skills : [];
    if (skills.length === 0) return "skills: (无)";
    return (
      "skills:\n" +
      skills.map((s) => `  [${s.id}] ${s.name} ${s.kind} Lv.${s.level}/${SKILL_LEVEL_MAX} 进度${s.progress}/${s.progressMax} ${s.desc}`).join("\n")
    );
  }
  if (path === "checks") {
    const checks = Array.isArray(state.checks) ? state.checks : [];
    if (checks.length === 0) return "checks: (无)";
    return (
      "checks(最近几次判定):\n" +
      checks
        .slice(-6)
        .map(
          (c) =>
            `  [${c.id}] ${c.skill} 难度${c.dc} 掷${c.roll}+Lv.${c.level}=${c.total} ${c.success ? "成" : c.pending ? "不成·还悬着" : c.admitted ? "不成·已认栽" : "不成"}${c.context ? `（${c.context}）` : ""}`,
        )
        .join("\n")
    );
  }
  if (path === "quests") {
    const quests = Array.isArray(state.quests) ? state.quests : [];
    if (quests.length === 0) return "quests: (无)";
    const today = daySerial(state.currentTime || OPENING_GAME_TIME);
    return (
      "quests(托付下来的事):\n" +
      quests
        .map((q) => {
          const left =
            q.dueDay === undefined
              ? "不限时"
              : q.status === "open"
                ? q.dueDay - today < 0
                  ? `已误期${today - q.dueDay}日`
                  : `还剩${q.dueDay - today}日（第${q.dueDay}日止）`
                : `第${q.dueDay}日止`;
          const reward = q.rewardKind && q.rewardAmount ? `${q.rewardKind}${q.rewardAmount}` : q.reward || "无";
          const penalty = q.penaltyKind && q.penaltyAmount ? `${q.penaltyKind}${q.penaltyAmount}` : q.penalty || "无";
          const held = isRewardHeld(q);
          const state = q.status === "open" ? "在办" : held ? "已办成·赏押牙行待领" : q.status === "done" ? "已了" : "已误";
          // 押在牙行的差事把领赏处一并交代，叙事里才好提一句「回牙行领」
          const where = q.broker ? `（赏押在${q.broker.shopName}）` : "";
          return `  [${q.id}] ${q.name}【${q.kind ?? "事件"}】（${state}）${where} ${q.place || "去处未定"} ${left} 托自${q.giver || "无名"}\n    交差：${q.condition || "未写明"}\n    酬：${reward}；罚：${penalty}${q.outcome ? `\n    结果：${q.outcome}` : ""}`;
        })
        .join("\n")
    );
  }
  if (path === "sect.tasks") {
    const tasks = Array.isArray(state.sect?.tasks) ? state.sect.tasks : [];
    if (tasks.length === 0) return "sect.tasks: (空)";
    return "sect.tasks:\n" + tasks.slice(0, 30).map((t) => `  [${t.id}] ${t.title} ${t.difficulty} 贡献${t.contribution}${t.accepted ? " 已接" : ""}`).join("\n");
  }
  if (path === "sect.shop") {
    const shop = Array.isArray(state.sect?.shop) ? state.sect.shop : [];
    if (shop.length === 0) return "sect.shop: (空)";
    return "sect.shop:\n" + shop.slice(0, 30).map((s) => `  [${s.id}] ${s.name} ${s.type} 花费${s.cost}灵石`).join("\n");
  }
  if (path === "sect.resources") {
    const resources = Array.isArray(state.sect?.resources) ? state.sect.resources : [];
    if (resources.length === 0) return "sect.resources: (空)";
    return "sect.resources:\n" + resources.slice(0, 30).map((r) => `  ${r.name} ${r.amount}${r.unit}`).join("\n");
  }
  if (path === "sect.positions") {
    const positions = Array.isArray(state.sect?.positions) ? state.sect.positions : [];
    if (positions.length === 0) return "sect.positions: (空)";
    return "sect.positions:\n" + positions.slice(0, 30).map((p) => `  [${p.id}] ${p.name} Lv${p.level} 需贡献${p.contributionNeeded}${p.isCurrent ? " 当前" : ""}`).join("\n");
  }
  if (path === "sect.heritage") {
    const heritage = Array.isArray(state.sect?.heritage) ? state.sect.heritage : [];
    if (heritage.length === 0) return "sect.heritage: (空)";
    return "sect.heritage:\n" + heritage.slice(0, 30).map((h) => `  ${h.name} ${h.type} ${h.grade} ${h.status}`).join("\n");
  }

  // 路径解析
  const segMatch = path.match(/^([a-zA-Z_]+)\[([^\]]+)\](?:\.(.+))?$/);
  if (segMatch) {
    const coll = segMatch[1];
    const id = segMatch[2];
    const sub = segMatch[3];
    if (coll === "sect") {
      const subMatch = path.match(/^sect\.([a-zA-Z_]+)\[([^\]]+)\](?:\.(.+))?$/);
      if (subMatch) {
        const subColl = subMatch[1];
        const subId = subMatch[2];
        const subField = subMatch[3];
        const list = Array.isArray((state.sect as any)?.[subColl]) ? (state.sect as any)[subColl] : [];
        const item = list.find((x: any) => String(x?.id) === subId || String(x?.name) === subId);
        if (item) {
          try {
            const value = subField ? (item as any)[subField] : item;
            const jsonStr = typeof value === "object" ? JSON.stringify(value) : String(value);
            return `${path} = ${jsonStr.slice(0, 500)}`;
          } catch {
            return `${path} = (序列化失败)`;
          }
        }
      }
      return `${path} = (未找到)`;
    }
    const arr = (state as any)[coll];
    if (Array.isArray(arr)) {
      const item = arr.find((x: any) => String(x?.id) === id);
      if (item) {
        try {
          const value = sub ? (item as any)[sub] : item;
          const jsonStr = typeof value === "object" ? JSON.stringify(value) : String(value);
          return `${path} = ${jsonStr.slice(0, 500)}`;
        } catch {
          return `${path} = (序列化失败)`;
        }
      }
    }
    return `${path} = (未找到)`;
  }

  // 普通字段
  const parts = path.split(".");
  let cur: any = state;
  for (const p of parts) {
    if (cur == null) return `${path} = (未找到)`;
    cur = cur[p];
  }
  if (cur === undefined) return `${path} = (未找到)`;
  if (typeof cur === "object" && cur !== null) {
    try {
      const jsonStr = JSON.stringify(cur);
      return `${path} = ${jsonStr.slice(0, 500)}`;
    } catch {
      return `${path} = (序列化失败)`;
    }
  }
  return `${path} = ${cur}`;
}

/** pro 提示：只生成叙事正文，不产出任何数据操作 */
/**
 * 文风准则：自《修仙文风优化提示词系统》里提炼的一小块，供各处叙事共引。
 * 只留最能落笔的几条，不搬原文，免得每一处提示词都长出一大截。
 */
export const PROSE_STYLE = `【文风准则】
一、古韵今用：文言句法与修仙语汇，但须一读就懂。忌网络语、洋文与现代化的譬喻（「导弹」「秒杀」这类字眼一概不许）。
二、意象取天地山河、星辰云雾、雷火风霜，不作琐碎比方。
三、描写分层：先粗笔铺气氛与大景，再细笔点器物、神态与术法；顿悟、致命一击、情动之际收作特写。
四、五感齐到：目见色彩形态，耳听轰鸣剑鸣，身感灵气冲刷与法宝反噬，鼻闻丹香血腥，另有神识扫视一路。
五、节奏：修炼感悟用慢笔铺陈，战斗追逃用短句快推。
六、交手须写出施法的过程（掐诀、灵力运转、元气汇聚）与术法形态色彩相撞，更要写出克制、虚实与后手的博弈；境界之差落在灵压、神识与法则领悟上，不可只喊一句高低。
七、气质随境界而变：炼气筑基仍有七情六欲，金丹元婴渐生超然而执念未消，化神以上淡漠如仙却非无情。对话须见身份——前辈言简意赅、话里带机锋，同辈有试探有交心，小辈恭敬虚心；术语入话要自然，不可堆砌。
八、心境不直说，借动作、眼神、旁人反应与景物流转带出。
九、因果先铺后收：机缘不凭空掉落，突破要有积累，反派自有算计，机缘与情缘都不轻予。
【内容边界】三条硬规矩，凡落笔皆不可犯：
1. 不作色情描写：男女情事略过不表，不写床笫、裸身与私密之处的细节，不以挑逗情欲为笔墨；情之所至，点到即止。
2. 不涉现实政治：不得出现现实世界中的国家、政党、政要、近现代史事与政治主张，纵是比方、影射、戏说也不许——本作另立九州，名物制度皆属虚构。
3. 血腥点到即止：交手、杀伐与伤亡只写其势与意，不细描血肉横飞、断肢开膛、虐杀伤残这类景象。`;

export function buildProPrompt(params: {
  state: GameState;
  summary: string;
  recentTurns: { input: string; narrative: string }[];
  decision: string;
  relevantData: string;
  chatSummary?: string;
  craftingResult?: CraftingResult;
  customPrompt?: string;
  /** 是否开局头一段：地点尚未定下，可由叙事择一地落脚 */
  opening?: boolean;
}): ChatMessage[] {
  const { state, summary, recentTurns, decision, relevantData, chatSummary, craftingResult, customPrompt, opening } = params;
  const realm = REALM_NAMES[state.player.realmIndex] ?? "未知";
  const location = LOCATION_INFO[state.currentLocation] || { name: "未知场所", allowed: "所有行为", forbidden: "无" };
  const place = getMarker(state.currentPlaceId);
  const placeName = place?.name ?? "未知之地";

  // 玩家没有填写、后续也没被补全的档案，交给叙事引擎在行文中确立，而不是一直空着
  const blankFields: string[] = [];
  if (!state.player.background?.trim()) blankFields.push("身世背景");
  if (!state.player.personality?.trim()) blankFields.push("心性");
  if (!state.player.description?.trim()) blankFields.push("外貌");

  const profileRule = blankFields.length
    ? `\n\n【档案补全】该角色的${blankFields.join("、")}尚未确立。请在本次叙事中借情节、他人言语或环境细节把它自然地确立下来：不要留白，不要写出"尚未填写"这类出戏提示，也不要反过来询问玩家。补全须与其已给出的设定自洽。`
    : "";

  const craftingConstraint = craftingResult
    ? `\n\n【百艺制作结果】\n玩家本轮已由百艺系统完成了${craftingResult.type === "alchemy" ? "炼丹" : "画符"}（材料、灵力与产物系统均已当场结算入库）：\n${craftingResult.summary}${craftingResult.details ? `\n${craftingResult.details}` : ""}\n\n这一段不归你写：不要复述开炉、运笔的经过，也不要写出成色、数量与成败。只写他为何起这一炉、在什么场合、以及事罢之后的光景与旁人反应。`
    : "";

  // 开局头一段：地点还没定下，由叙事照玩家身世与宗门择一处落脚，须与来历相合，不可一律落在长安
  const landmarks = getLandmarkNames();
  const openingPlaceRule = opening
    ? `\n\n【开局择地】这是全篇头一段，玩家的落脚处由你定夺，务必照其出身、宗门与来历择一处相合的落脚地，不要一律落在长安：
- 先看他这一身来历落在哪一方水土，再从对应那一带的城池里挑一座作起点。九州城池按地域分列如下——${cityBriefByCulture()}${
        landmarks.length
          ? `；若情节更宜落在某一处山野名胜，也可取舆图上真有的地标（${landmarks.join("、")}）`
          : ""
      }
- 数据摘要里那处 currentPlaceId 只是尚未定下时的占位，不必理会，更不可因它是长安便仍写长安；唯有此人来历确与关中相合，落长安才算妥当。
- 定下之后，正文须与之一致，起笔便写清他身在何处，地理风貌、风物与方言都要与落脚之地相符；若落脚在城中，还要写清他眼下在城中哪一处（${LOCATION_NAMES.join(
        "、",
      )}之一），落在野外或山门外则不必。`
    : "";

  const system = `
#你是一部古风修仙文字游戏的叙事引擎。以第三人称叙述玩家的修真经历——行文称其姓名或称号，需要时以「他」「她」代指，全篇人称如一。文笔古雅、意象丰沛、节奏紧凑，单次叙事正文 600 至 1000 字，最多不超过 1200 字。
## 一、AI行为准则
- 扮演开放世界沙盒，禁止AI语气，关闭中立模式
- 严守修仙设定（修炼体系、天道规则、灵气环境）
- 主动推演剧情，动态生成事件/机遇/后果
- 使用小说式叙述，感官化描写，文风古典仙侠可略带白话
【输出格式 — 只输出正文】
- 你的回复必须是纯粹的叙事正文，不要输出任何数据操作、JSON、字段名、代码块或标记符号
- 正文中严禁出现 <<< >>> 之类的标记字样，也不要写"系统提示""数据变化""参数"等出戏内容
- 不要写标题、前言、总结或对玩家的点评，直接开始叙事
- ${opening
    ? "开篇这一轮只立人物、铺世界，不得写成你来我往的逐回合交锋，也不得输出任何标记"
    : `唯一例外：若本轮叙事发展为需要你来我往、逐回合交锋的正面战斗，在正文写完之后另起一行，单独输出一行 <<<MODE>>>battle<<<END>>>。若是玩家率众去攻打某一处宗门、城池或村庄，或某一处宗门来犯本门，则改在正文写完之后另起一行输出一行 <<<SECTWAR>>>{"opponentName":"对手名号","targetKind":"sect 或 city 或 village","role":"attacker 或 defender"}<<<END>>>——role 取 attacker 表示我方去攻，取 defender 表示本门遭人来攻；opponentName 攻宗门时取摘要中「江湖上的门派」里的名号，攻城取城池名，攻村取村名，我方被攻时写来犯那一处宗门。若本轮叙事发展为一场当场讨价还价、值得玩家亲自出面还价的买卖（与市井摊贩、铺面掌柜或行商就某样货物、某件物什讲价），则在正文写完之后另起一行输出一行 <<<HAGGLE>>>{"mode":"buy 或 sell","subject":"货名或物名","count":件数,"basePrice":原价整数,"keeper":"对方姓名","shop":"铺子或去处名"}<<<END>>>——mode 取 buy 表示玩家要买、取 sell 表示玩家要卖；subject 买时写那件货的名目、卖时写行囊里那一样的名目；basePrice 买时写铺面标价、卖时写对方起初的出价；keeper 须与摘要中 relations 里的人名一致，认不出人来就不要写这一行；一场寻常的买卖、或是玩家没打算还价的，不必写。若本轮叙事发展为玩家动身前往某家铺面买或卖（走进铺子去挑货、出货），则在正文写完之后另起一行输出一行 <<<SHOP>>>{"shop":"铺子名"}<<<END>>>——shop 须与摘要中「本城铺面」那一行里的名号一字不差；正文写到踏进门内即可，买卖的经过、价钱与得失都交给铺面界面由玩家自己经手，不要写。战斗标记（battle／SECTWAR 二择其一）、讲价标记与铺面标记不可同时出现；除这几行之外不得出现任何标记`}

${PROSE_STYLE}
【笔法】不做大段的解释与直接的心理独白，心境借行为与环境暗示；对话高度生活化，用来推动剧情、显露人情；环境描写要有用处，能带出时间与变化。

【叙事要求】以小说笔法行文，本轮必须有明确的剧情推进：写清发生了什么、谁做了什么、事情怎么收束或又起了什么新的头绪，情节要有起承转合。不可只铺陈氛围、原地打转，也不可写成梗概、提纲或流水账。

【禁止罗列数据】正文严禁以条目、清单、分点、编号、表格或数值的形式罗列任何设定与数据：不得出现「灵根：金木」「修为 +10」「气血 80/100」「获得×××」这类写法，也不得逐条列举灵根、经脉、功法、物品、灵石与各项属性。凡涉及增减、得失、状态与名目，一律化作情节，由动作、对话、他人反应或环境变化自然带出，让读者从叙事里读出变化，而不是读到数字。

【固定机制交由本地系统】战斗、炼丹、画符、铺面买卖这类自有定规的事，不由你替它定夺：
- 交手：正文只写势成与两下照面，点到即止；不要写招式往来、胜负与伤亡，也不要写气血、灵力、伤害的数字。
- 炼丹、画符：不要复述开炉、运笔的经过，也不要写丹药符箓的成色、数量与成败；这些由百艺界面当场定夺。
- 铺面买卖：只写他寻到铺子、有意买或卖；不要写议价、成交的经过，也不要写价钱与得失，那些交给铺面界面由玩家自己经手。

【世界观】灵根九系（金、木、水、火、土、风、雷、冰、暗）决定修炼速度。功法分五品（凡、灵、玄、地、天）五类（心法、炼体、神通、身法、秘术）。心性任意中文词汇，0-100分影响修炼与奇遇。经脉通畅度0-100影响气血运行。

【场所约束】${
    opening
      ? `开局这一段的城池与场所都尚未定下，由你一并定夺；城中可往来的去处只有：${LOCATION_NAMES.join(
          "、",
        )}；场地未定之前，以${location.allowed}为常，野外、山门外这类不在此列的地方也写得`
      : `玩家身在${placeName}的${location.name}。此处允许：${location.allowed}；禁止：${location.forbidden}。城中可往来的去处只有：${LOCATION_NAMES.join("、")}`
  }。地理风貌、风物与方言须与落脚之地相符；冲突时在叙事中体现限制，不要描写被禁止的行为。

【地理】九州城池可往来者：${getCityNames().join("、")}。${
    opening ? "开局落脚之处由你定" : `玩家此刻在${placeName}`
  }，写到启程或抵达时，目的地只能从这一列里取，并写出路途远近与耗时，不要杜撰此列之外的城池。${openingPlaceRule}

【时间推进】时间不自行流逝，全由剧情决定：跨州远行、闭关数日该写足跨度，一时半刻的对话就停在同一时辰，不要为了推进而硬凑。无论跨度大小，正文都要让读者感到时序在走。

【重要约束】1.当前境界：${realm}；2.叙事中出现的修为、气血、灵力、物品等变化必须自然可信，与铺垫相符；3.遵循修炼效率规则，境界提升需有足够铺垫；4.已故之人不再登场：尘缘里已死、已故、或已被抹去的人，不得让他复生、开口或重新出场，要提也只能由生者追述；也不要凭空编造一个已死之人当作眼下在场的人。${profileRule}${customPrompt ? `\n\n【玩家自定义指令】\n${customPrompt}` : ""}`;

  // 近况只留最近一轮的全文：更早的几轮本已进了上面的压缩摘要，
  // 这里留个开头点明场景即可，免得每轮都把三段长叙事原样重发一遍，白吃 token
  const RECENT_SOFT_LIMIT = 300;
  const recentText =
    recentTurns.length > 0
      ? recentTurns
        .map((t, i) => {
          const isLast = i === recentTurns.length - 1;
          const body = t.narrative || "";
          const shown =
            isLast || body.length <= RECENT_SOFT_LIMIT
              ? body
              : `${body.slice(0, RECENT_SOFT_LIMIT)}……`;
          return `【第${i + 1}回合】\n玩家决策：${t.input}\n叙事：${shown}`;
        })
        .join("\n\n")
      : "（尚无近况）";

  const user = `【当前时间】${formatGameTime(state.currentTime || OPENING_GAME_TIME)}

【玩家身世背景】
${state.player.background || "（暂无记载）"}

${state.player.personality ? `【玩家心性】\n${state.player.personality}\n\n` : ""}${state.player.description ? `【玩家外貌】\n${state.player.description}\n\n` : ""}【前情提要（已压缩）】
${summary || "（开端）"}

【最近经历】
${recentText}

${chatSummary ? `【近期交谈记录】\n${chatSummary}\n\n` : ""}【玩家本轮决策】
${decision}

【相关数据（仅本轮可能涉及）】
${relevantData}
${craftingConstraint}
请基于以上信息，续写本轮叙事正文。`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** 后处理提示：读取叙事正文，识别本轮 JSON 数据变动与快捷决断 */
export function buildOpsExtractionPrompt(params: {
  narrative: string;
  state: GameState;
  craftingType?: "alchemy" | "talisman";
  craftingSummary?: string;
}): ChatMessage[] {
  const { narrative, state, craftingType, craftingSummary } = params;
  const now = state.currentTime;
  // 机缘的期限、人物的固定出没都以日序记，模型得知道今天是第几日
  const todaySerial = daySerial(now || OPENING_GAME_TIME);
  const craftingRule = craftingType
    ? `\n【百艺制作豁免】本轮玩家通过百艺系统完成了${craftingType === "alchemy" ? "炼丹" : "画符"}：材料消耗、灵力消耗与产物「${craftingSummary || "丹药/符箓"}」都已由制作系统当场结算入库。禁止在 ops 中重复记这笔账——不要 add 该产物，也不要 modify player.mp、inventory、spiritStones；只照常记时间推进与去向。`
    : "";

  // 奇遇：只落在预设点位上；正文里牵出一处值得一去的野外去处才立
  const adventureRule = `\n23. 奇遇：正文或交谈里若牵出一处值得一去的野外去处（荒废的洞府、埋着旧物的遗迹、忽现的异象、藏货的山寨……），可用 add adventures 立一处，每条写 {"name","summary","kind","danger","reward","rewardKind","rewardAmount","penalty","penaltyKind","penaltyAmount","persistent"}。name 不超过 12 字，点明这是什么去处；summary 不超过 60 字，说清有什么可图、有什么凶险；kind 只取 秘境、遗迹、机缘、凶险、异象 之一；danger 取 1 至 5；rewardKind 只取 灵石、修为、物品、人情、正道名声、魔道名声、平民名声、官府名声 之一，penaltyKind 只取 灵石、修为、业力、正道名声、魔道名声、平民名声、官府名声 之一，amount 为 1 到 3000 的整数且与 kind 同时给出；集市、洞天这类常设的去处 persistent 写 true，一次性的不必写。去处由系统从舆图预设点位里挑一处空位钉上，就在你眼下这一带，正文里不必写死坐标。同一处只立一次，已有的不要重复立；玩家须亲至那一带才进得去，故不要写他已经到过。`;

  // 开局建档由 buildOpeningDomainPrompt 按领域并发处理，这里只负责回合内的增量结算。
  // 若开局建档有领域失败、档案仍然空白，则在本回合就地补上。
  const blankProfile: string[] = [];
  if (!state.player.background?.trim()) blankProfile.push("身世背景（modify player.background）");
  if (!state.player.personality?.trim()) blankProfile.push("心性（modify player.personality）");
  if (!state.player.description?.trim()) blankProfile.push("外貌（modify player.description）");
  if (!Array.isArray(state.player.stats?.heartScores) || state.player.stats.heartScores.length === 0) {
    blankProfile.push("心性评分（add player.stats.heartScores）");
  }
  if (!Array.isArray(state.player.timeline) || state.player.timeline.length === 0) {
    blankProfile.push("修炼历程（add player.timeline）");
  }
  const fillRule =
    blankProfile.length > 0
      ? `\n\n【档案补全】该角色以下档案仍为空白：${blankProfile.join("、")}。请在结算本轮变化的同时，依据已有设定把它们一并补上，不要留空。`
      : "";

  // 开局建档可能失败、或起手就是空白：这几样若还空着，本轮就地补齐，
  // 不必等玩家提起——功法、随身之物、尘缘、本事本就是一个人该有的底子。
  const missing: OpeningDomainId[] = [];
  if (!(Array.isArray(state.techniques) && state.techniques.length > 0)) missing.push("technique");
  if (!(Array.isArray(state.inventory) && state.inventory.length > 0)) missing.push("treasure");
  if (!(Array.isArray(state.relations) && state.relations.length > 0)) missing.push("bond");
  if (!(Array.isArray(state.skills) && state.skills.length > 0)) missing.push("skill");
  const missingRule =
    missing.length > 0
      ? `\n\n【身外补全】该角色以下数据仍为空白：${missing
        .map((id) => OPENING_DOMAINS.find((d) => d.id === id)?.label)
        .join("、")}。即便玩家本轮没有提起，也要依据已有设定与当下剧情把它们补齐，不要留空；补全须与身份、境界、处境自洽，按下列要求产出：\n` +
        missing
          .map((id) => {
            const def = OPENING_DOMAINS.find((d) => d.id === id)!;
            return `【${def.label}】${def.spec}`;
          })
          .join("\n")
      : "";

  const system = `你是修仙文字游戏的数据结算助手。请阅读一段叙事正文，对照当前游戏数据，输出本轮实际发生的数据变动。

必须只输出一个 JSON 对象，不要输出解释、注释或代码围栏：
{
  "ops": [
    { "kind": "modify", "path": "player.cultivation", "op": "+", "value": 50 },
    { "kind": "modify", "path": "currentTime.hour", "op": "=", "value": "午时" },
    { "kind": "add", "collection": "inventory", "payload": { "id": "i20", "name": "凝气丹", "type": "丹药", "grade": "凡品", "count": 1, "icon": "丹", "desc": "服之可凝练灵力" } },
    { "kind": "delete", "collection": "inventory", "id": "i10" }
  ],
  "quickDecisions": ["前往坊市采买药材", "闭关参悟新得功法", "拜访师父请教疑难"]
}

【ops 规则】
- modify：path 必须是下方数据摘要中真实存在的路径；op 只能取 "="、"+"、"-" 之一；value 为数字或字符串，字符串直接写内容不要加引号。
- add：collection 只能取 inventory、log、techniques、relations、sect.tasks、sect.heritage、sect.shop、sect.resources、sect.positions、sect.modifiers、sectSites、news.items、player.meridians、player.stats.heartScores、player.timeline、player.buffs、player.shields、skills、checks、quests、adventures、manorPlots、shop.goods 之一；payload 为该条目的完整字段对象。集合名照这张单子照抄，不要自作主张加 player. 前缀——写成 player.relations、player.inventory 这类会被当作越界丢掉；只有 player.meridians、player.stats.heartScores、player.timeline 这几项本就带 player. 前缀。
- 宅地：叙事中若确有一处产业落到玩家名下（受赠、置办、承继），可用 add manorPlots 给他一处宅地，payload 只需写 {"place":"地名"}；地块一律由空地起，屋里盖什么由玩家自己张罗。寻常的落脚、借宿不要立宅地。
- 铺面添货：叙事里若给某家铺子调来了货、补了存货（新到一批药材、庄上送来新酒、行商送来紧俏物事），用 add shop.goods，payload 写 {"shop":"铺子名","goods":[{"name":"货名","price":单价下品灵石,"stock":存货数,"desc":"一句说明"}]}；铺子名须与摘要中「本城铺面」那一行的名号一字不差，已有的货便添存量，没有的便新上一样。玩家自己去铺子挑货、出货那一类买卖不要写这一条，那由铺面界面结算。
- delete：用 collection 与 id 两个字段，id 必须是摘要中已存在的条目 id。
- 删人：正文里某人若当场殒命、身死、被杀、坐化、寿终，务必用 delete relations 把他从尘缘里抹去，id 从摘要中取——此条为硬规矩，纵是师长旧友也不得把已死之人留在尘缘；远走不归、恩断义绝的同样可删；只是一时不快、暂别几日的，不要删。

【内容规则】
1. 只输出叙事中确实发生的变化，没有发生就不要编造；本轮若无任何变化，ops 输出空数组。
2. 数值幅度必须与叙事相符，不要夸大，也不要凭空赠送珍稀物品。
3. 时间：每轮都要回传最新日期。正文里时间若确实走动，用 modify currentTime.year / currentTime.month / currentTime.day / currentTime.hour 把它写足；时辰字段只写十二时辰的名字，取 ${SHICHEN_NAMES.join("、")} 之一；时间没动就照原值再写一遍。当前时间：${formatGameTime(now)}。
4. 新增物品、功法、人物必须给出完整字段，id 不得与摘要中已有 id 重复；新增 材料 或 丹药 时必须给出 elements，形如 {"木":80,"土":20}，取值 -100 到 100；新增人物时一并补上 gender（男／女）、age、origin（出身来历）、personality（性情）、appearance（形貌）、affiliation（所属门派帮口，散修写「无」）这几项人设，使尘缘里的人物立得住。新增人物须是活人：已经身死、已故的人不得列为 relations，也不得替他新立一条。
5. 可修改的玩家字段：player.name、player.title、player.realmIndex、player.cultivation、player.hp、player.hpMax、player.mp、player.mpMax、player.spirit、player.spiritMax、player.lifespanCurrent、player.lifespanMax、player.body、player.fortune、player.karma、player.personality、player.description、player.background、player.spiritRoots.<元素>、player.stats.vitality、player.stats.soul、player.stats.wisdom、player.stats.agility。若叙事中突破了大境界，必须同时调整 player.realmIndex 与 player.cultivation，使修为与新境界相称，不要只改境界而让修为悬空。
6. 新闻 news.items 仅在跨天时新增，同一天内不要重复生成；每条需含 category（官府公告/宗门布告/市井传言）、title、content、source 四个字段。
7. 功法条目需含 id、name、category（心法/炼体/神通/身法/秘术）、grade（凡品/灵品/玄品/天品/仙品）、proficiency、proficiencyMax、element、description。
8. "服用丹药""使用符箓"只是消耗已有物品，如叙事中确有消耗，用 modify 扣减对应 inventory 条目的 count，不要用 add。
9. quickDecisions：给出 3-4 条玩家下一轮可以采取的具体行动建议，每条 8-20 字，紧扣当前剧情与处境。
10. player.timeline 是修炼历程，只记录足以载入生平的重大节点（如拜师、突破、结丹、结仇、得宝），寻常时日不要新增条目，以免流水账化。
11. 持续性的增益与减益用 add player.buffs，但名目只能从下面这张名录里挑，不许自编：payload 写 {"id":"名录里的id","stacks":层数,"until":"顶到什么时候"}，其余字段由名录定，你写了也不算。顶多久按游戏时辰说：「三个时辰后」「一日后」「514-2-18 午时」；不写就照名录上的常例。平日的状态一律按时辰算，不要按回合写——回合只在正面交锋里用香来计，那是战斗界面另算的。
【状态名录】
${buffCatalogBrief()}
护体类效果另用 add player.shields，每条需含 id、name、value、maxValue。两者只在叙事确实留下持续状态时才写，一闪而过的瞬时效果不要写。
12. 地点迁移：正文中若出现启程远行、抵达、离开某地这类实际移动，必须用 modify currentPlaceId 把玩家所在地改到新地点，value 写成地名，且必须是摘要中 currentPlaceId 可选值里的一个；地名照抄，不要加「城」「府」之类的后缀。在城内往来、同城内的短途走动不改动它。若正文中的目的地不在可选值内，就近改到最接近的一座，不要自造地名。
13. 城中场所：正文中若玩家在同一城内换了去处（入炼丹房开炉、进藏经阁翻书、到集市采买、回住所歇息），用 modify currentLocation 记下新场所，value 写成场所名，必须是摘要中 currentLocation 可选值里的一个，只写场所名，不要加「里」「中」之类的字。换了城池时也要一并把 currentLocation 改成抵达后所在之处。玩家只是在原地议论、提及某个场所，不算换地方。
14. 街区起名：正文中若在城内某处展开了一段值得记住的际遇（酒楼、当铺、衙门、寺院、某户人家……），可以用 modify district.<街区编号> 给那一处起个独有的名字，编号必须是摘要中 district 可选值里的一个，value 直接写名字，不超过 6 个字，不要带「街」「区」之类的地图术语。已有名字的街区除非剧情里明确改了名，否则不要重复写。没写到具体街区的寻常经过不必起名。
15. 货物行情：正文中若出现某样货物因时局一时涨跌（漕路不通、战事吃紧、丰年跌价、瘟疫抢药），用 modify price.<货名> 记下，value 写成「幅度 天数」，如 "+30% 3天"、"-两成 五日"。货名只能是这些：${ALL_GOOD_NAMES.join("、")}；天数 1 到 30，幅度在 -80% 到 +200% 之间。同一样货再写一次即覆盖上一次的行情。寻常的讨价还价、铺面标价不必写这一条。
16. 判定（硬规矩）：正文中凡涉及考校玩家见识与本事之处——知识问答、辨识真伪、鉴定旧物、辨药材、看品相、认路、看天时、听口音、解典籍掌故、修器物之类——一律用 add checks 掷一次骰子，每条 {"skill":"技能名","dc":难度,"context":"为什么考这一门"}，不得跳过，也不得由你自己判定成败。skill 优先取摘要中 skills 里最贴近的那一门；确无对应的，就照实写一门最贴切的（系统按零级算，成不成全看玩家的本事）。dc 取 ${DC_HINT}：寻常事取易，需些眼力取中，险要或精微处取难、极难。骰子与成败由系统掷定，你不要写 roll 与 success，正文里也不得替它宣布成败、把结果写死（莫写「他一眼认出」「他没看出什么」这类定论），只把该铺的场面铺开，成败留待下回照判定结果续写。口才、说服、谈判、寒暄一类不掷骰子，用正文直接写。同一件事只掷一次，不要反复掷。
17. 判定改口：若正文中玩家把先前没看准的事掰了回来（翻书查证、找来行家印证、反复端详终于看出门道），用 modify check.<技能名> 记下，value 写「成」；若他撂开手认了栽，value 写「败」。只改最近一次还悬着的那条判定，没悬着的不要写。
18. 机缘：正文或交谈里若有人托付、立约、许下报酬要办一件事，用 add quests 立一桩，每条 {"id","name","kind","desc","place","dueDay","giver","condition","reward","rewardKind","rewardAmount","rewardBuff","penalty","penaltyKind","penaltyAmount","penaltyBuff"}。kind 必写，只取 事件、地点、人物 之一：事件是当场起落、未必有固定去处的一桩事，place 可省；地点是奔着某一处地方去的，place 须是本城或别城真有的去处，事就在那一处办、不必有固定的人；人物是奔着某个人去的，place 写那人的落脚处、也须是真有的去处，且定有那个人。name 不超过 10 字，说清是什么事；desc 写清来龙去脉；place 写去哪儿办，事件类不限定地点可省；地点类与人物类的去处须是眼下真有的地方，可以是城内某条街区（如「长安·西市」）、某座山门里的某座建筑（写作「山门名·建筑名」，如「青云宗·炼丹房」）、舆图上某处奇遇的名目、或某座村庄的名目，这四样皆可；dueDay 写第几日截止，今日为第 ${todaySerial} 日，「三日后」就写 ${todaySerial + 3}，不限时则省略；giver 是托付人的名字，须与 relations 中的人名一致；condition 写玩家做到什么才算办成。
   - rewardKind 只取 灵石、修为、物品、人情、状态、正道名声、魔道名声、平民名声、官府名声 之一，penaltyKind 只取 灵石、修为、业力、状态、正道名声、魔道名声、平民名声、官府名声 之一；amount 为 1 到 5000 的整数，且必须与对应的 rewardKind／penaltyKind 同时给出，只写其中一个就当没写。名目不在表内的不要写，写了也作废，赏罚只认这几样。名声那几条数额宜小，三五点到十点上下，那是世人议论攒出来的，不是一夜之间的事。名目写「状态」的那一条不要给 amount。
   - 赏的是一条状态，就把说明写进 rewardBuff；罚的是一条状态，写进 penaltyBuff。先照上面那份状态名录挑，写 {"template":"名录里的 id 或名目","hours":顶几个时辰}；名录里确没有合用的，才自编一条，写 {"name":"名目不超过10字","icon":"一个汉字","isDebuff":true或false,"stat":"效力落在哪一项","value":数值,"hours":顶几个时辰,"desc":"一句说明"}。自编时效力只许从 ${BUFF_TARGET_STATS.join("、")} 里挑一项，正数助益、负数负累；顶的时辰取 1 到 720。挑不出也编不出的就别写，宁可按字面给句话。
   - reward 与 penalty 是写给人看的字面话，与名目/amount 不冲突时可一并写；赏罚是一条状态时，这两句话要与会落到身上的那条状态对得上。
   - 同一件事只立一次；已有在办的机缘不要重复立。
19. 机缘了结：只有叙事里明说了成与不成——那人点了头，或是事在那一处办到了头——才用 modify quest.<机缘名> 记下，value 写「了」或「误」。办妥写「了」，黄了写「误」；酬谢与责罚由系统照单落账，你不要另写 add player.buffs 之类去兑现。拿不准就先留着，不要替人点头。
20. 固定出没的人物：正文里若冒出一个有头有脸、往后还会再遇上的人物，在 add relations 时用 persona 写定他的人设（一段话，交代脾气、口风、来历、与玩家的干系，往后每回都照它演），并可用 cityId 写他所在的城池名、metAt 写具体去处、fixedUntilDay 写他钉在此处的截止日（今日为第 ${todaySerial} 日，如「这一阵子都在」就写 ${todaySerial + 7}）。期限一过他便不再守在原处，往后随缘在别处露面。只在城中一面之缘的路人不必写这几项。
21. 人物行踪：尘缘里的人各有各的去处，摘要里写作「现在在某某城·某某处」。正文里若有人说要走了、动身去了别处、或是打听到谁如今在哪儿，用 modify relations[<id>].place 改写他的行踪，value 写成「城名」或「城名·去处」，城池必须是摘要中 currentPlaceId 可选值里的一个，去处写城中具体的地方（如「西市」「城南山货铺」）；只改到城池也认，那时他在那一带出没。没提到谁挪了地方就不要改；与你同行的人（摘要中标着「与你同行」）一路都跟着你，他的行踪不必另写。
22. 修炼：正文里若写到打坐、静修、闭关、参悟功法，照摘要里「修炼效率」那一行算——打坐几个时辰就给几点进度，用 modify techniques[<id>].proficiency 加到对应功法上。千万不要另给 player.cultivation：这门功法进度长了多少，境界进度会照数自动补上，写了便是重复记账。修炼多则进度多、少则进度少，闭门一日不过几点到十几点，闭关一月也不过百余点，别把大数随手给出；叙事里根本没有修炼之事，就不要动 proficiency。${fillRule}${missingRule}${craftingRule}${adventureRule}
23. 村庄：野外的村庄散在舆图上（见摘要中 village 可选值），未去过的平日与玩家无涉。正文里若玩家动身前往其中某一村、写到抵达，用 modify village 记下，value 写成村名，须与摘要中的村名一字不差；系统据此把这一村解锁，往后玩家才能向村人打听、与村里的营生和人来往。只在城中议论、提起某个村名，不算前往。
24. 出租：玩家名下若有一处产业（见摘要中产业一行），正文里若把某处租了出去、又说定了租客与月租，用 modify rent.<产业名> 记下，value 写成「租客 月租」，如「王二 80」；产业名须与摘要中对得上，月租为整数下品灵石，且与正文说定的数目相符。租客照正文里真定下的人写，不要另编。只是商议、尚未谈妥的不写这一条。
25. 宗门修正：本门若有政策、态势一类的时效（广开山门纳新、全门闭关、大兴土木、论道大典、内斗不断……），用 add sect.modifiers 立上一条，payload 写 {"id":"名录里的id","days":持续天数}；id 只能从下面这张名录里挑，自造的名目一律作废，days 可省，省了照名录上的常例。正文里确有这样的门中举措才写，寻常的来往、议论不写。这些修正会牵动宗门产出、声望与门中修炼，写到成效时须与名录上写的相称。
26. NPC 资料：正文里若某人的名号、身份、性情、形貌、出身、所属、境界，或他与玩家的关系／信任、所在有确实变化，用 modify relations[<id>].<字段> 记下。可改的字段：文本类 name、title、note、persona、memory、gender、origin、personality、appearance、affiliation、realm；数值类 age、relation（-100 到 100）、trust（1 到 5）；枚举类 type（道侣／师父／弟子／好友／仇敌）；地点类 cityId、location、metAt（城池须是 currentPlaceId 可选值里的）。id 须是摘要中已有的人物。memory 是记在他心里的旧事，照写的新话往后添，不覆盖先前的。只改确实变了的，没变的不要重写一遍。
27. 宗门信息：正文里若本门的名号、驻地、掌事者、规模、声望、山门景象、风物有变（扩建、更名、掌门易位、遭劫等），用 modify sect.<字段> 记下。字段取 sect.name、sect.leader、sect.territory、sect.appearance、sect.surroundings、sect.reputationDesc（文本）；sect.level（0 到 8）、sect.reputation、sect.elders、sect.disciples（数值）。只改确实变了的，逐项写。
28. 摧毁建筑：正文里若本门某座建筑确已倾毁（战火、天灾、掌门下令拆毁等），用 modify demolish.<建筑名> 记下，建筑名取自摘要中「本门建筑」那一行。主殿不可毁——主殿有损只写景况（sect.appearance／sect.surroundings），不要写这一条。
29. 门派：叙事里凡涉门派，先照摘要中「江湖上的门派」那一份写，用它们的名号、驻地与性质，别另造名号，也别把已有的门派挪地方。确需一处本局没有的门派（玩家自述的出身、师承、旧仇，或叙事非提不可的一处），才用 add sectSites 现立一处，payload 写 {"name":"门派名号","culture":"文化圈","seat":"驻地写法，如「朔方以北的荒谷」","nature":"性质，2 到 6 字","level":1 到 8,"reputation":门派声望,"elders":长老人数,"disciples":门人数,"appearance":"山门气象一句","reputationDesc":"江湖风评一句","surroundings":"眼下境况一句"}。name 必写，其余给多少算多少，没给的照那一带的风物自去补；culture 只取 中原、江南、苗疆、西域、漠北、日韩 之一，不写就按玩家眼下的文化圈落点。同一处只立一次，摘要里已有的名号不要再立——立了也会被丢掉。
30. 宗门关系：正文里若两处宗门结盟、交好、反目、开战，或一家为另一家所并、所臣服，用 add sectRelations 记下，payload 写 {"a":"一方门派名号","b":"另一方门派名号","stance":"附庸／结盟／友好／中立／敌对 之一","relation":-100 到 100,"note":"一句说明"}。a 与 b 只能取自摘要中「江湖上的门派」那一行，须两处都认得出、且不相同；同一对宗门再去一笔便改旧的，不另添。别家宗门之间打起来、或一家为另一家所破，也照这一条记关系，另在 news 里带一句。本门与他门的恩怨同样写在这里；但本门要不要趁势收别家做附庸、还是毁其门户，留待战后由玩家发落，叙事里不要替玩家定。
31. 城村易主：正文里若有宗门攻下了一座城或一个村（城名取自摘要中「九州城池可往来者」那一行，村名取自摘要中的村庄），用 add occupations 记下，payload 写 {"kind":"city 或 village","targetName":"城名或村名","ownerName":"占家宗门的名号"}。ownerName 须是摘要中「江湖上的门派」里认得出的一处，本门也照它的名号写。同一处再去一笔便是易主，改旧的即可。占了便按月收贡金，正文里可顺带提一句纳贡之事。别家占的城村也照这一条记；本门要不要去夺，留待玩家自己动手。
32. 驻城执事：正文里若某家宗门占了城、或派了人坐镇某城理事，可 add relations 添一位「执事」或「总督」，写全字段：name、title 写「执事」或「总督」、affiliation 写那家宗门的名号、cityId 写该城标点编号（见摘要中 currentPlaceId 可选值）、metAt 写「城名·官署」一类去处、persona 一段话交代其脾性与职守、fixedUntilDay 写一个较远的日序（如今日为第 ${todaySerial} 日，常驻写 ${todaySerial + 360}）。只在正文确实点到这么一个人时才添，不要凭空派官。
33. 交付界面的事不由你记账：正文里若写到玩家动身去某家铺子买卖、与人交手、或开炉炼丹／画符，这几桩的经过与得失——钱财、货物、丹符的成色与数量、胜负与伤亡、气血与灵力——都由对应的界面或系统当场结算，你不要在 ops 里重复记这一笔（不要 modify spiritStones、inventory、player.hp、player.mp，也不要 add 产物）；只照常记时间推进与玩家去向。
【宗门修正名录】
${sectModifierBrief()}`;

  const user = `【当前游戏数据】
${buildDataSchema(state)}

【本轮叙事正文】
${narrative}

请输出 JSON：`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/**
 * 开局建档按领域拆分。
 * 单次调用要同时产出灵根、经脉、功法、物品、宗门、人脉等全部档案，
 * 输出很容易被 token 上限截断而变得笼统；拆成并行的小领域后，每次只写一块，可以写得更细。
 * 各领域的集合互不重叠，因此并发写回不会冲突。
 */
export type OpeningDomainId = "origin" | "technique" | "treasure" | "sect" | "bond" | "skill" | "quest" | "news";

export const OPENING_DOMAINS: { id: OpeningDomainId; label: string; spec: string }[] = [
  {
    id: "origin",
    label: "本命",
    spec: `逐项产出，一项都不要漏：
- 灵根：modify player.spiritRoots，值为数组，形如 [{"element":"金","value":70},{"element":"水","value":30}]；元素只取 金木水火土风雷冰暗，value 为 0-100，2 至 4 种
- 经脉：逐条 add player.meridians，每条 {"id","name","clarity","maxClarity","damage","zone"}；zone 只取 head、chest、abdomen、arm_left、arm_right、leg_left、leg_right；clarity 与 maxClarity 为 0-100；至少 6 条，需覆盖头胸腹与四肢
- 体魄：modify player.body，一句中文描述
- 气运：modify player.fortune，一句中文描述
- 业力：modify player.karma，整数，可正可负
- 年岁：modify player.age，整数，取自述里报的那个岁数；自述里若写作「寿元」「年龄」，一律当岁数算，照实落在这里
- 寿元上限：modify player.lifespanMax，整数，取与境界、年岁相称的常例，如引气炼气约 80 至 120、筑基约 150、金丹约 300
- 余寿：不必写 player.lifespanCurrent，由代码照「上限减年岁」算出来；年岁没报的，代码自会取一个留有余量的常例
- 气血上限：modify player.hpMax 与 player.hp，两者设为同值
- 灵力上限：modify player.mpMax 与 player.mp，两者设为同值
- 神识上限：modify player.spiritMax 与 player.spirit，两者设为同值
- 修为：modify player.cultivation，整数，数额须与摘要里既有的境界相称；境界已在摘要中写明，不要产出更低的 realmIndex，也不得编出「境界下跌」「修为倒退」这类设定
- 四维：modify player.stats.vitality、player.stats.soul、player.stats.wisdom、player.stats.agility
- 身世背景：modify player.background，200 字以上的出身来历
- 心性：modify player.personality，简短中文描述其性情
- 外貌：modify player.description，简短的外貌特征
- 心性评分：add player.stats.heartScores，3 至 5 条，每条 {"trait","score","modifiers"}；trait 为 2 至 4 字中文性格词，score 为 0-100 整数，modifiers 固定输出空数组 []
- 修炼历程：add player.timeline，3 至 5 条，每条 {"year","title","detail"}；year 为时间描述（如 幼年、三年前），detail 不少于 20 字
- 称号：以叙事或玩家自述里已写明的称号为准，照抄那一个；叙事里没提，且 player.title 为空或为「无名之辈」时，才由你拟一个贴切的 modify player.title
- 姓名：若 player.name 为空，照叙事里对这一位的称呼，拟一个像样的 modify player.name；叙事里已有名有姓的，照抄那一个
- 境界：叙事若已写明这一位的具体境界（如「炼气后期」），用 modify player.realm 照实写那一境界的全称；仅当它高于摘要里当前的境界时才产出。绝不可写成更低的境界，也不得编出「境界下跌」「修为倒退」这类由头
- 时辰：modify currentTime.hour，写十二时辰的名字，取 ${SHICHEN_NAMES.join("、")} 之一

除 ops 外，你还必须额外返回 quickDecisions：3 至 4 条玩家下一轮可以采取的具体行动，每条 8-20 字，紧扣开篇处境。`,
  },
  {
    id: "technique",
    label: "功法",
    spec: `只产出功法，逐门 add techniques，每条 {"id","name","category","grade","proficiency","proficiencyMax","element","description","skills"}：
- category 只取 心法、炼体、神通、身法、秘术
- grade 只取 凡品、灵品、玄品、天品、仙品
- element 只取 金木水火土风雷冰暗
- proficiency 为 0 到 proficiencyMax 之间的整数，proficiencyMax 通常为 100
- description 不少于 40 字，写明来历、运功方式、施展时的形态与威力
- 按角色的境界与宗门身份，产出 3 至 5 门；其中恰有一门 category 为 心法，作为其主修功法
- 门下弟子不该持有天品以上功法，除非叙事中有明确交代
- 每门功法须附 skills，产出 2 至 4 招，依次在熟练度提升时解锁；每招 {"id","name","description","levelRequired","mpCost","damage","cooldown","effects","debuffDuration"}
- levelRequired 为 1 到 10 的整数，随招式列序递增（如第 1 招 1 级、第 2 招 3 级、第 3 招 6 级、第 4 招 9 级）
- mpCost 为 0 到 60 的整数，威力越大越贵
- damage 为 0 到 120 的整数基本伤害；纯辅助招式可给 0
- cooldown 为 0 到 6 的整数
- debuffDuration 为 1 到 12 的整数，表示命中后负面效果维持几柱香
- effects 为数组，写这一招打在对手身上的负面效果，每条 {"stat","valueType","value","description"}；stat 只取 defense、dodge、speed、attack、damage、vitality、soul、agility、hp 之一；valueType 只取 percentage、fixed、multiplier；value 为数字；description 一句中文说明。伤其性命的写法：stat 取 hp、valueType 取 fixed、value 为正整数，表示每柱香额外损这么多气血。纯增益、无负面效果的招式，effects 给空数组`,
  },
  {
    id: "treasure",
    label: "财宝",
    spec: `只产出随身物品与灵石：
- 逐件 add inventory，每件 {"id","name","type","grade","count","icon","desc"}；type 只取 材料、丹药、符箓、法宝、杂物；grade 只取 凡品、灵品、玄品、天品、仙品；icon 为一个汉字；count 为整数；desc 不少于 20 字，写明外观或用途
- type 为 材料 或 丹药 的，必须额外给出 elements：由 金木水火土风雷冰暗 中的 1 至 3 种构成，形如 {"木":80,"土":20}，取值为 -100 到 100。这是炼丹火候与元素判定的依据，不可省略
- 产出 5 至 8 件，其中至少一件是有来历的私人物件（如残玉、旧剑、母亲留下的香囊），并在 desc 中交代来历
- 灵石：modify spiritStones.low、spiritStones.mid、spiritStones.high、spiritStones.supreme，均为整数；数量要与角色身份相称，底层弟子不应持有上品以上灵石`,
  },
  {
    id: "sect",
    label: "宗门",
    spec: `只产出宗门本身的信息，全部用 modify：
- sect.name：宗门名号；若叙事或玩家自述里已写明本门名号，照抄那一个，不得另取名号
- sect.leader：掌事者姓名与称号
- sect.territory：驻地，如「云栖山脉」
- sect.level：宗门等级，整数
- sect.disciples：门下弟子人数，整数
- sect.elders：长老人数，整数
- sect.reputation：门派声望，整数
- sect.appearance：山门景象，不少于 50 字
- sect.surroundings：周边环境，不少于 50 字
- sect.reputationDesc：江湖风评，不少于 30 字
- sect.nature：宗门性质，用 2 至 6 字的名目，如「剑道为尊」
- sect.climate：宗门风气，同上
- sect.feature：特殊资源·特色，同上
- sect.start：开局状态，同上
- 职位晋升：逐条 add sect.positions，每条 {"id","name","level","contributionNeeded","privilege"}；level 从 1 起递增，至少 4 条，自外门弟子一路排到长老
- 门派任务榜：逐条 add sect.tasks，每条 {"id","title","difficulty","contribution","spiritStone","desc"}；difficulty 只取 易、中、难、险；产出 4 至 6 条
- 贡献商店：逐条 add sect.shop，每条 {"id","name","cost","type","desc"}；type 用一个中文词，如 丹药、符箓、法宝、材料；产出 4 至 6 件
- 门派底蕴：逐条 add sect.heritage，每条 {"name","type","grade","status"}；type 只取 功法、秘术、阵法、丹方、符箓；status 只取 已习、可习、未达
- 门派仓库：逐条 add sect.resources，每条 {"name","amount","unit"}；产出 3 至 5 项
- 别的门派：开篇若提到本门之外的某一处门派（旧仇、师承、比邻而居、听人说起的），而摘要的「江湖上的门派」里没有这一处，用 add sectSites 现立一处，每条 {"name","culture","seat","nature","level","disciples","elders","reputation","appearance","reputationDesc","surroundings"}；name 必写，culture 只取 中原、江南、苗疆、西域、漠北、日韩 之一，其余给多少算多少，没给的照那一带的风物自去补。摘要里已有的名号不要再立。本门不必另立——本门由舆图上就近的一处认领。
若角色是散修、并无宗门归属，则只产出 sect.name 为「散修」并跳过其余项，性质、风气、特色、开局状态这四条也不写。`,
  },
  {
    id: "bond",
    label: "尘缘",
    spec: `只产出人物关系，逐位 add relations，每位 {"id","name","title","type","relation","trust","realm","note","gender","age","origin","personality","appearance","affiliation","location","persona"}：
- type 只取 dao_companion、master、disciple、friend、enemy
- relation 为「关系」，-100 到 100 的整数：0 为平交，正为亲近，负为交恶；陌生人约在 0 上下
- trust 为「信任」，1 到 5 的整数：1 不可信任、2 尚存嫌隙、3 相交莫逆、4 推心置腹、5 同生共死；新结识的人给 2
- realm 为该人物的修为境界
- note 不少于 30 字，写明此人与主角的渊源、当前态度与相处方式
- 人设细目：gender 取「男」或「女」；age 为整数；origin 为出身来历（不超过 20 字）；personality 为性情（不超过 20 字）；appearance 为形貌（不超过 20 字）；affiliation 为所属门派、帮口或家族（散修写「无」）；location 为眼下所在地，写地名或山门名（如「扬州」「云栖山脉」），须与他的身份相合，不在近前的照实写远，同门师长便写玩家所在的那处山门
- persona 不少于 40 字，一段话写定这人的脾性、口风、做派与待主角的分寸，往后每次交谈都要照它演，不可前后两样
- 人设细目要与 note、title、realm 彼此相合，不要自相矛盾
- 产出 4 至 6 位，其中需包含一位师长、一位同门或友人，以及一位对主角怀有敌意或心存芥蒂的人
- 姓名、称号与境界要彼此区分，不要写成同类模板
- 只写活人：已经身死、已故、或叙事里已交代不在人世的人，不得列进尘缘；确需交代某位已故者，由与其相关的生者在 note 里带出，不要为已故者单立一条`,
  },
  {
    id: "skill",
    label: "本事",
    spec: `只产出这个人身上几门讨生活的本事，逐门 add skills，每门 {"id","name","kind","level","progress","progressMax","desc"}：
- kind 只取 学识、手艺、阅历 三种
- name 为 2 至 4 字，像一门实实在在的技业，如「辨药」「相玉」「木工」「算账」「认路」「看天时」「修器物」
- level 为 0 至 10 的整数，progress 为 0 至 progressMax-1 的整数，progressMax 一律写 100
- desc 不超过 30 字，写明这门本事的门道与他打哪儿学来的
- 产出 4 至 6 门，三类的比例随他的身世来：读过书的偏 学识，匠户出身的偏 手艺，走南闯北的偏 阅历

【务必避开的】这门本事不可以是拳脚、兵器、功法、法术、符箓、炼丹、御剑这类武艺与修真本事，也不可以是口才、说服、谈判、交际这类靠嘴皮子吃饭的本事。写的是市井里讨生活的手艺与见识，如辨别物产、修缮器物、算账记账、认路看天、掌故旧闻。`,
  },
  {
    id: "quest",
    label: "任务",
    spec: `只产出开篇时已经落在玩家肩上的几桩事，逐桩 add quests，每桩 {"id","name","kind","desc","place","giver","condition","reward","rewardKind","rewardAmount","rewardBuff","penalty","penaltyKind","penaltyAmount","penaltyBuff","dueDay","status"}：
- name 不超过 20 字，写明这桩事的名目，如「替师父送一封信」「寻访失踪的同门」
- kind 必写，只取 事件、地点、人物 之一：事件是当场起落、未必有固定去处的一桩事；地点是奔着某一处地方去的，place 必须写具体去处，事在那一处办、不必有固定的人；人物是奔着某个人去的，place 必须是那人的落脚处，且必有那个人。事件类可以没有 place
- desc 不超过 200 字，交代来龙去脉：谁交办的、为什么落在你头上、眼下办到什么地步
- place 写去处，须是玩家眼下这一带真有的地方：可以是城内某条街区（如「扬州·旧书巷」）、某座山门里的某座建筑（写作「山门名·建筑名」）、舆图上某处奇遇的名目、或某座村庄的名目；就在本城的事便写城内的去处；事件类不限地点可省
- giver 写交办之人的姓名或身份；尘缘里已经有的人，优先用其中的人来交办
- condition 不超过 120 字，写清怎样才算办成，须是玩家眼下真做得到的事
- reward 写在字面上，如「下品灵石三十枚」；rewardKind 只取 灵石、修为、物品、人情、状态、正道名声、魔道名声、平民名声、官府名声；rewardAmount 为整数，物品、人情与状态那三类不必给数额
- penalty 与 penaltyKind 同上，penaltyKind 只取 灵石、修为、业力、状态、正道名声、魔道名声、平民名声、官府名声；不涉罚的这两项可以不写
- 赏罚是一条状态时，rewardBuff／penaltyBuff 另写：先照 {"template":"状态名录里的id或名目","hours":顶几个时辰}；名录里确没有合用的，才自编 {"name":"名目不超过10字","icon":"一个汉字","isDebuff":true或false,"stat":"效力落在哪一项","value":数值,"hours":顶几个时辰,"desc":"一句说明"}。自编的效力只许从 ${BUFF_TARGET_STATS.join("、")} 里挑一项，顶的时辰取 1 到 720
- dueDay 写限几日之内，如 3、7、15；不限时的可以不写
- status 一律写 open
- 产出 2 至 4 桩，轻重缓急要有分别，且与玩家的身份、境界、宗门处境相合：散修写江湖上的私事，门中弟子可写门里派下的差事
- 不要产出已经办完的事，也不要写玩家当下办不到的事`,
  },
  {
    id: "news",
    label: "见闻",
    spec: `只产出一则则江湖见闻，add news.items：
- 官府公告、宗门布告、市井传言各一条，共 3 条
- 每条 {"category","title","content","source"}；category 取上述三种
- title 不超过 14 字；content 不少于 40 字，要有具体的人名、地名或数字，不要写成空泛口号
- source 为发布方或出处，如「青云宗执事堂」「城南茶肆」
- 三条内容应彼此独立，分别对应朝堂、宗门、市井三个面向`,
  },
];

/**
 * 判断一条 op 是否属于指定开局领域。
 * 各领域允许写入的集合互不重叠，并发写回才不会互相覆盖；
 * 模型偶尔会越界输出，写回前按此再过滤一次。
 */
/**
 * 各领域该写进哪个集合，另附模型常写的几种别称。
 * 写了别称的照样认，收下之前归一到正名——否则这一领域看着就像「没写出来」。
 */
const DOMAIN_COLLECTIONS: Partial<Record<OpeningDomainId, Record<string, string>>> = {
  origin: {
    "player.meridians": "player.meridians",
    meridians: "player.meridians",
    经脉: "player.meridians",
    "player.stats.heartScores": "player.stats.heartScores",
    heartScores: "player.stats.heartScores",
    心性评分: "player.stats.heartScores",
    "player.timeline": "player.timeline",
    timeline: "player.timeline",
    修炼历程: "player.timeline",
  },
  technique: { techniques: "techniques", technique: "techniques", 功法: "techniques" },
  treasure: { inventory: "inventory", items: "inventory", item: "inventory", treasures: "inventory", treasure: "inventory", 物品: "inventory", 道具: "inventory", 财宝: "inventory", 背包: "inventory", 行囊: "inventory", 储物袋: "inventory" },
  bond: { relations: "relations", relation: "relations", npcs: "relations", 尘缘: "relations" },
  skill: { skills: "skills", skill: "skills", 本事: "skills" },
  quest: { quests: "quests", quest: "quests", 任务: "quests" },
};

/** 把模型写的集合名归一到正名；认不出返回 null */
export function canonicalCollection(domain: OpeningDomainId, collection: string): string | null {
  const map = DOMAIN_COLLECTIONS[domain];
  if (!map) return null;
  const key = String(collection || "").trim();
  if (map[key]) return map[key];
  // 模型偶尔把集合写成 player.relations、player.techniques 这类带前缀的样子，
  // 去了前缀再认一次，免得整条被当越界丢掉
  const stripped = key.replace(/^player\./, "");
  return stripped !== key ? map[stripped] ?? null : null;
}

export function opBelongsToDomain(op: DataOp, domain: OpeningDomainId): boolean {
  switch (domain) {
    case "origin":
      if (op.kind === "modify") {
        return op.path.startsWith("player.") || op.path.startsWith("currentTime.");
      }
      // 模型偶尔把集合名写成短叫法（如 meridians、heartScores），认出来便归一，免得整条被当越界丢掉
      return op.kind === "add" && canonicalCollection("origin", op.collection) !== null;
    case "technique":
    case "treasure":
    case "bond":
    case "skill": {
      if (op.kind === "add") return canonicalCollection(domain, op.collection) !== null;
      // 财宝那一门还要管灵石
      return domain === "treasure" && op.kind === "modify" && op.path.startsWith("spiritStones.");
    }
    case "sect":
      // 宗门领域除 modify 之外还要允许写入这些集合，否则职位树、任务榜、贡献商店、藏经阁与仓库永远是空的；
      // sectSites 另算：开篇提到本局舆图上还没有的门派时，现立一处
      if (op.kind === "modify") return op.path.startsWith("sect.");
      if (op.kind === "add" && op.collection === "sectSites") return true;
      return (
        op.kind === "add" &&
        ["sect.positions", "sect.tasks", "sect.shop", "sect.heritage", "sect.resources"].includes(op.collection)
      );
    case "quest":
      // 开局便落在肩上的几桩事，只有新增，不替玩家改已接下的活
      return op.kind === "add" && canonicalCollection("quest", op.collection) !== null;
    case "news":
      return op.kind === "add" && op.collection === "news.items";
    default:
      return false;
  }
}

export function buildOpeningDomainPrompt(params: {
  domain: OpeningDomainId;
  narrative: string;
  state: GameState;
  /**
   * 减负模式：条目取最少、描述从简、不附全量数据摘要。
   * 前两遍都没写出来的领域，多半是输出过长被截断，这时改用这一版再试。
   */
  terse?: boolean;
}): ChatMessage[] {
  const { domain, narrative, state, terse } = params;
  const def = OPENING_DOMAINS.find((d) => d.id === domain)!;

  if (terse) {
    // 只求一份完整闭合的 JSON：条目压到最少，描述一笔带过。
    // 示例按这一领域该写的集合现取，免得模型照抄一个不属于本领域的名字
    const canon =
      Object.values(DOMAIN_COLLECTIONS[domain] ?? {})[0] ||
      (domain === "news" ? "news.items" : "sect.positions");
    const example =
      domain === "origin"
        ? `{"ops": [ {"kind": "modify", "path": "player.cultivation", "op": "=", "value": 100} ]}`
        : `{"ops": [ {"kind": "add", "collection": "${canon}", "payload": {}} ]}`;

    const system = `你是修仙文字游戏的数据建档助手。现在只补一件小事：把「${def.label}」这一领域的最少内容落成 JSON。

【只是抄录】照抄即可，不要分析、不要推演、不要解释。

【只要交足下限】
${def.spec}
【减负要求】条目取规定数量的下限，描述一笔带过即可，不求详尽；宁可少写几句，也务必保证 JSON 完整闭合，不要写到一半断掉。

【输出格式】只输出一个 JSON 对象，不要解释、注释或代码围栏：
${example}
注意：每条 op 都要带完整的 payload 字段对象；这一门只许写上面示例里的那个集合${canon ? `（collection 一律写 "${canon}"）` : ""}，别的集合一概不要写。`;

    const user = `【开篇叙事正文】
${narrative.slice(0, 12000)}

请输出 JSON：`;

    return [
      { role: "system", content: system },
      { role: "user", content: user },
    ];
  }

  const system = `你是修仙文字游戏的数据建档助手。当前处理的是【开局建档】，而不是回合结算。

玩家在开局时只填写了少量信息，其余设定已由叙事引擎在开篇中确立。你的任务是从开篇叙事中，把属于「${def.label}」这一领域的设定完整地落成初始数据。

【只是抄录】这一步是照抄，不是创作：正文里写了的照抄，本领域该有而正文没写的，按下面职责补齐即可。不要分析、不要推演、不要解释，直接输出 JSON。

【本领域职责】只处理下面列出的内容，绝对不要输出其他领域的任何操作。
${def.spec}

【输出格式】只输出一个 JSON 对象，不要输出解释、注释或代码围栏：
{
  "ops": [
    { "kind": "modify", "path": "player.cultivation", "op": "=", "value": 100 },
    { "kind": "add", "collection": "player.timeline", "payload": { "year": "幼年", "title": "入宗", "detail": "……" } }
  ]${domain === "origin" ? `,
  "quickDecisions": ["前往坊市采买药材", "闭关参悟新得功法", "拜访师父请教疑难"]` : ""}
}

【ops 规则】
- modify：path 必须是下方数据摘要中真实存在的路径；op 只能取 "="、"+"、"-" 之一；value 为数字或字符串，字符串直接写内容不要加引号
- add：payload 为该条目的完整字段对象，id 不得与摘要中已有的 id 重复
- 集合名照本领域职责里写的正名照抄：该写 relations、inventory、techniques、skills、quests 的就照写，不要自作主张加上 player. 前缀——只有本命那一门的 meridians、heartScores、timeline 才带 player. 前缀
- 路径与字段名必须与下方摘要中的数据一一对应，不要自造路径

【建档规则】
1. 这是建档而非结算，凡是叙事中已确立的设定都要产出对应 op；叙事中没有交代但属于本领域、且能依据已有信息合理推断的，由你补全后一并写入，不要留空。
2. 补全内容必须与玩家已给出的设定自洽，数值幅度与角色的境界、身份相称，不要凭空赠送珍稀之物。
3. 输出要详尽，宁可长一些，也不要笼统带过；描述类字段请写足字数。`;

  const user = `【当前游戏数据】
${buildDataSchema(state)}

【开篇叙事正文】
${narrative}

请输出 JSON：`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** 江湖快报的辑录范围与侧重，由玩家在快报面板选定 */
export interface NewsReportParams {
  /** 消息波及的范围 */
  scope: "本城" | "州郡" | "天下";
  /** 一期的侧重 */
  focus: "官府公告" | "宗门布告" | "市井传言" | "综合";
  /** 本期条数 */
  count: number;
}

/**
 * 辑录一期江湖快报：既产出快报条目，也产出这则消息背后的天下变动。
 * 变动经解析后由代码确定性写回世界数据，使江湖自行演变。
 */
export function buildNewsReportPrompt(params: { state: GameState; params: NewsReportParams }): ChatMessage[] {
  const { state, params: p } = params;
  const focusLine =
    p.focus === "综合"
      ? "官府公告、宗门布告、市井传言三类各占约三分之一"
      : `以「${p.focus}」为主`;

  const system = `你是修仙文字游戏里「江湖快报」的辑录者。你这一期的产出分作两部分：刊行的快报条目，以及这则消息背后确实发生的天下变动——后者会被如实写回世界数据，江湖因此自行演变。

【快报条目】add news.items，每条 { "category", "title", "content", "source" }：
- category 只能取 官府公告 / 宗门布告 / 市井传言 之一
- title 不超过 14 字；content 不少于 40 字，要有具体的人名、地名或数字，不要写成空泛口号
- source 为发布方或出处，如「县衙」「青云宗执事堂」「城南茶肆」
- 本期范围：${p.scope}；侧重：${p.focus}（${focusLine}）；共 ${p.count} 条
- 只写与玩家当前所在、已有的人物与势力相干的事，读来像是这方天地里真在发生

【天下变动】除快报外，再产出若干 ops，把「这则消息背后确实发生的变化」落进世界数据：
- 人物：改 relations 中已有之人的好感、态度、身份等；或 add relations 新增一个因这则消息登场的人物（须给全字段人设；新增之人须是活人，已故、已身死的人不得写入 relations）
- 宗门：add sect.tasks / sect.heritage / sect.shop / sect.resources / sect.positions，或 modify sect.reputation 等
- 宗门关系：两处宗门之间结盟、交好、反目、开战、或一家为另一家所并所臣服，用 add sectRelations 记下，payload 写 {"a":"一方门派名号","b":"另一方门派名号","stance":"附庸／结盟／友好／中立／敌对","relation":-100 到 100,"note":"一句说明"}；a 与 b 须是摘要中「江湖上的门派」里认得出的两处、且不相同
- 城村易主：某家宗门攻下一座城或一个村，用 add occupations 记下，payload 写 {"kind":"city 或 village","targetName":"城名或村名","ownerName":"占家宗门的名号"}；城名与村名须与摘要中对得上，ownerName 须是摘要中「江湖上的门派」里认得出的一处
- 世界：add quests（新的委托或线索）、add adventures（新的野外去处）
- 玩家：因世界事件波及，可 add player.buffs（须给全字段）
- 只写这则消息确实会带来的变化，幅度与叙事相称，不要凭空赠送珍稀之物；没有就不写
- 不要改动玩家的修为、寿元、灵石等属于自身努力所得的字段

【输出格式】只输出一个 JSON 对象，不要输出解释、注释或代码围栏：
{
  "narrative": "一段百字上下的叙事，以说书人的口吻交代这期快报背后的世情动向",
  "ops": [ { "kind": "add", "collection": "news.items", "payload": { "category": "市井传言", "title": "……", "content": "……", "source": "……" } } ]
}

【ops 规则】
- modify：path 必须是下方数据摘要中真实存在的路径；op 只能取 "="、"+"、"-" 之一；value 为数字或字符串，字符串直接写内容不要加引号
- add：collection 只能取 news.items、relations、quests、adventures、sect.tasks、sect.heritage、sect.shop、sect.resources、sect.positions、sectRelations、occupations、player.buffs 之一；payload 为该条目的完整字段对象，id 不得与摘要中已有 id 重复
- delete 不用；路径与字段名必须与下方摘要中的数据一一对应，不要自造路径`;

  const user = `【当前游戏数据】
${buildDataSchema(state)}

请据此辑录一期江湖快报，输出 JSON：`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/**
 * 武馆挂出的低阶武学名录。
 * 只出凡品、灵品这类低阶武学，供来客花钱拜师学艺，不涉天品仙品。
 */
export function buildMartialArtsPrompt(params: { state: GameState; culture?: string }): ChatMessage[] {
  const { state, culture } = params;
  const system = `你是修仙文字游戏里武馆的教习。此地武馆要挂出一份「低阶武学名录」，供来客花钱拜师学艺。

【名录要求】产出 3 至 4 门，只出低阶、好上手的武学：
- 每门须含：name、category、grade、element、proficiency、proficiencyMax、description、insight、skills
- category 只取 心法、炼体、神通、身法、秘术
- grade 只取 凡品 或 灵品，不得出玄品及以上
- element 只取 金木水火土风雷冰暗
- proficiency 一律为 0；proficiencyMax 取 60 到 120 的整数
- description 不少于 40 字，写明招式路数与练成之后长于何处
- insight 为一句要言，八字上下
- 名号与招式要有${culture ? culture + "一带的" : ""}江湖气，彼此不重样
- 每门须附 skills，产出 2 至 3 招，依次在熟练度提升时解锁；每招 {"id","name","description","levelRequired","mpCost","damage","cooldown","effects","debuffDuration"}
- levelRequired 为 1 到 10 的整数，随招式列序递增
- mpCost 为 0 到 40 的整数，威力越大越贵
- damage 为 0 到 60 的整数基本伤害；纯辅助招式可给 0
- cooldown 为 0 到 6 的整数
- debuffDuration 为 1 到 12 的整数，表示命中后负面效果维持几柱香
- effects 为数组，写这一招打在对手身上的负面效果，每条 {"stat","valueType","value","description"}；stat 只取 defense、dodge、speed、attack、damage、vitality、soul、agility、hp 之一；valueType 只取 percentage、fixed、multiplier；value 为数字；description 一句中文说明。伤其性命的写法：stat 取 hp、valueType 取 fixed、value 为正整数，表示每柱香额外损这么多气血。纯增益、无负面效果的招式，effects 给空数组

【输出格式】只输出一个 JSON 对象，不要解释、注释或代码围栏：
{ "techniques": [ { "name": "……", "category": "身法", "grade": "凡品", "element": "风", "proficiency": 0, "proficiencyMax": 80, "description": "……", "insight": "……", "skills": [ { "id": "sk_1", "name": "……", "description": "……", "levelRequired": 1, "mpCost": 8, "damage": 30, "cooldown": 0, "effects": [], "debuffDuration": 3 } ] } ] }`;

  const user = `【当前游戏数据】
${buildDataSchema(state)}

请列出这份低阶武学名录，输出 JSON：`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** 每月初一、十五，为重要人物推演「自主行动」与「数据概要」的名册条目 */
export interface NpcTickBrief {
  id: string;
  name: string;
  title: string;
  realm: string;
  note: string;
  memory?: string;
}

/**
 * 每逢初一、十五，天道为重要人物各推演一段这半月的自主行动，
 * 并为其更新一份数据概要，作为他的记忆与自主行动的结果。
 */
export function buildNpcTickPrompt(params: { state: GameState; day: string; npcs: NpcTickBrief[] }): ChatMessage[] {
  const { state, day, npcs } = params;
  const roster = npcs
    .map((n) => `- id=${n.id}｜${n.name}（${n.title}）｜境界 ${n.realm}｜旧事：${n.note}`)
    .join("\n");

  const system = `你是修仙世界的天道推演者。逢每月初一、十五，为下列重要人物各推演这半月的作为，并替他们更新一份数据概要。这些推演会写进他们的记忆，作为他们自行行动的结果。

【推演要求】逐位产出，不可遗漏名册中的任何一人：
- action：这人这半月在忙些什么。须与他的身份、境界、旧事相合，写到具体的人名、地名或事由，60 至 120 字，读来像真有其事
- summary：一份简略的数据概要，依次记其境界与进度、所修功法、眼下钱财与要紧财宝、与他人的关系，80 至 150 字
- 各人行动彼此可以有关联（如相约同行、生出嫌隙），也可各安其位，但都要自洽
- 只作推演，不改动玩家的任何数据

【输出格式】只输出一个 JSON 对象，不要解释、注释或代码围栏：
{ "npcs": [ { "id": "……", "action": "……", "summary": "……" } ] }`;

  const user = `【当前时间】${day}

【重要人物名册】
${roster}

【世界概况】
${buildDataSchema(state)}

请据此逐位推演，输出 JSON：`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** 街头卖艺的素材：选定本事、五场考教的成败、所得与名声折损 */
export interface BuskBrief {
  skill: string;
  place: string;
  passed: number;
  reward: number;
  folkDelta: number;
  rounds: { index: number; success: boolean; reward: number }[];
}

/** 一场街头卖艺的叙事；成败已由代码定下，这里只把经过写成文字 */
export function buildBuskingPrompt(brief: BuskBrief): ChatMessage[] {
  const lines = brief.rounds
    .map((r) => `第${r.index}场：${r.success ? `成了，得 ${r.reward} 下品灵石` : "失了手"}`)
    .join("\n");

  const system = `你是修仙文字游戏里的说书人。玩家刚在坊市街头卖艺，请就着这一场的经过写一段叙事。

【写作要求】
- 以第三人称写「你」，120 至 200 字，写出围观的看客、场面的起落与收场的气氛
- 五场考教的结果已经定下，不可更改；写成文字时要让每一场的成败都看得出来
- 过了几场、得钱多少、名声折损，都要与下面所报相符，不可夸大
- 只输出这段叙事文本，不要标题、不要解释、不要代码围栏`;

  const user = `【所处】${brief.place}
【所卖之艺】${brief.skill}
【五场考教】
${lines}
【合计】过 ${brief.passed}/5 场，得 ${brief.reward} 下品灵石；平民名声 ${brief.folkDelta >= 0 ? "+" : ""}${brief.folkDelta}

请写这段叙事：`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** 一处屋舍经手的素材：刚打听到，或已成交 */
export interface EstateDealBrief {
  /** offer 是刚打听到待售，deal 是成交 */
  kind: "offer" | "deal";
  name: string;
  place: string;
  baseEfficiency: number;
  price: number;
  agentName?: string;
  agentTitle?: string;
}

/** 屋舍买卖的叙事；名号与价钱已由代码定下，这里只把经过写成文字 */
export function buildEstateDealPrompt(brief: EstateDealBrief): ChatMessage[] {
  const system = `你是修仙文字游戏里的说书人。玩家正在城中或村中经手一处屋舍，请就着下面所报写一段短短的叙事。

【写作要求】
- 以第三人称写「你」，80 至 140 字
- 若是初次打听（offer）：写出街坊引路、屋舍的模样与经手人的做派，末尾点出开价
- 若是成交（deal）：写出付钱的经过与得屋之后的心境，并说明这处院子可免费歇息、修炼、演武、储物
- 所报的名号、所在、效率与价钱都要与下面相符，不可夸大
- 只输出这段叙事文本，不要标题、不要解释、不要代码围栏`;

  const user = `【情形】${brief.kind === "offer" ? "刚打听到一处待售屋舍" : "买下了一处屋舍"}
【屋舍】${brief.name}
【所在】${brief.place}
【基础效率】${brief.baseEfficiency.toFixed(2)}
【价钱】${brief.price} 下品灵石
${brief.agentName ? `【经手人】${brief.agentName}（${brief.agentTitle ?? ""}）` : ""}

请写这段叙事：`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** 尘缘的「关系」「信任」怎么念给模型听；旧档只有情谊时按同一口径折算 */
export function bondLabel(r: { relation?: number; trust?: number; affinity?: number; affinityMax?: number }): string {
  if (typeof r.relation === "number" && typeof r.trust === "number") {
    return `关系${r.relation} 信任第${r.trust}档`;
  }
  const a = Number(r.affinity) || 0;
  const trust = a >= 90 ? 5 : a >= 70 ? 4 : a >= 45 ? 3 : a >= 20 ? 2 : 1;
  return `关系${Math.round(a * 2 - 100)} 信任第${trust}档`;
}

/** 灵田要种什么：请天道推演这物产在此地成不成 */
export function buildCropPrompt(params: { crop: string; culture?: string }): ChatMessage[] {
  const { crop, culture } = params;
  const system = `你是修仙世界里的老农。玩家想在自家灵田里种「${crop}」${
    culture ? `，此地属${culture}一带` : ""
  }。请推演这物产在此地是否相宜、种不种得活。

【裁断要求】
- 只输出一个 JSON 对象：{"feasible": true 或 false, "reason": "一句话说明"}
- 水土相宜、当地能种得活的，feasible 为 true；水土不服、此地根本不产此物的，为 false
- reason 不超过 40 字，说清缘由（气候、水土、风物）
- 不要输出解释、注释或代码围栏`;

  const user = `我要种的是「${crop}」。请裁断可否：`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** 出租一处产业的素材：租客与月租由说书人议定 */
export interface RentOutBrief {
  name: string;
  place: string;
  /** 这是屋舍还是整座宅邸 */
  kind: "estate" | "manor";
  baseEfficiency?: number;
  condition?: number;
  /** 玩家想租给什么样的人 */
  tenantKind: string;
}

/** 出租的叙事；租客与月租由这一段议定，系统照此按月入账 */
export function buildRentOutPrompt(brief: RentOutBrief): ChatMessage[] {
  const system = `你是修仙文字游戏里的说书人。玩家要把名下的一处${
    brief.kind === "manor" ? "宅邸" : "屋舍"
  }租出去，想租给「${brief.tenantKind}」。请就着下面所报写一段短短的叙事，并议定租客与月租。

【要求】
- 只输出一个 JSON 对象：{"tenant": "租客名号", "monthly": 月租数字, "text": "叙事正文"}
- tenant 是当面定下的租客其人，给个像样的名号（可带身份，如「货郎张五」）
- monthly 是每月下品灵石，取整数；按成色与地段斟酌，寻常小院月租约 30 到 120，宅邸可到 200 上下，不要离谱
- text 以第三人称写「你」，60 至 120 字，写出与租客说定租金的经过，末尾点明月租数目
- 不要输出解释、注释或代码围栏`;

  const user = `【产业】${brief.name}
【所在】${brief.place}
${brief.condition !== undefined ? `【成色】完好 ${Math.round(brief.condition)}/100\n` : ""}${
    brief.baseEfficiency !== undefined ? `【基础效率】${brief.baseEfficiency.toFixed(2)}\n` : ""
  }【拟租给】${brief.tenantKind}

请议定租客与月租，并写这段叙事：`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** 终局评说：把这一世的叙事交给说书人，为玩家写一段盖棺定论 */
export function buildEndingAppraisalPrompt(narrative: string): ChatMessage[] {
  const system = `你是修仙文字游戏里的说书人。玩家这一世已经走到尽头，请你通读他一生的行事，写一段盖棺定论。

【要求】
- 以第三人称写「他」，200 至 350 字
- 先总说这一生走到了哪一步（境界、身份、寿数），再挑二三桩要紧的事点评
- 有褒有贬，就事论事：行侠仗义、广结善缘的该褒，杀伐过甚、背信弃义的该贬，不必一味逢迎
- 末尾给一句总评，如「这一世，……」，并可附一句谶语式的断语
- 只输出这段评语，不要标题、不要分点、不要代码围栏`;

  const user = `【这一世的叙事】
${narrative}

请写这段评语：`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** 开张一间铺面的素材：玩家给一句话说法，具体数据由模型推演 */
export interface ShopSetupBrief {
  /** 玩家写的营生名目，如「酒楼」「药铺」 */
  typeText: string;
  place: string;
  culture?: string;
  /** 投入的本钱 */
  capital: number;
}

/** 开张一户：模型照玩家的说法推出营生、货物、设施与月收支，并定要不要记库存 */
export function buildShopSetupPrompt(brief: ShopSetupBrief): ChatMessage[] {
  const system = `你是修仙文字游戏里的开铺掌柜。玩家要在${brief.place}盘下一间铺面，营生照他自己说的：「${brief.typeText}」${
    brief.culture ? `，地属${brief.culture}一带` : ""
  }。请就着他的说法推出这门铺面的底子。

【要求】
- 只输出一个 JSON 对象：{"kind": "营生", "useStock": true 或 false, "goods": [...], "facilities": [...], "monthlyIncome": 数字, "monthlyExpense": 数字, "text": "叙事正文"}
- kind 只能取这些：${PLAYER_SHOP_KINDS.join("、")}；玩家说的名目对上哪一类就写哪一类，实在不类就挑最接近的一类
- useStock：这门营生要不要按件记存货——有货架可卖的写 true，瓦舍、浴堂、客栈这类不按件卖的写 false
- goods 每项含 name、price（每件下品灵石）、stock（存货数）、desc；按营生给三到八样
- facilities 每项含 name、upkeep（每月要花的银子）、effect（管什么用）；给一到四处
- monthlyIncome 与 monthlyExpense 要与这门营生、所在与置办的设施相称；月开支只算铺面自身的房租人工，各处设施的 upkeep 另计。寻常小铺月进项几十到几百，别动不动上千
- text 以第三人称写「你」，60 至 120 字，写开张这一日的张罗与所见，末尾落到账面（进项与开支各是多少）
- 不要输出解释、注释或代码围栏`;

  const user = `【营生】${brief.typeText}
【所在】${brief.place}
【本钱】${brief.capital} 下品灵石

请推出这门铺面的底子：`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** 经营铺面时摆给模型的账目 */
export interface ShopManageBrief {
  name: string;
  kind: string;
  place: string;
  culture?: string;
  /** 资金池现有 */
  cash: number;
  monthlyIncome: number;
  /** 月开支合计（铺面自身 + 各处设施的维持） */
  monthlyExpenseTotal: number;
  goods: { name: string; price: number; stock: number; desc?: string }[];
  facilities: { name: string; upkeep: number; effect?: string }[];
  /** 玩家这一回要办的事 */
  instruction: string;
}

/**
 * 经营铺面：玩家说一句话，模型把货物、设施与月收支改一改，并写一段叙事。
 * 改动由代码夹在合理区间，这里只把账目与要求交代清楚。
 */
export function buildShopManagePrompt(brief: ShopManageBrief): ChatMessage[] {
  const system = `你是修仙文字游戏里替玩家打理铺面的掌柜。玩家自设的铺面「${brief.name}」在${brief.place}，营生是${brief.kind}${
    brief.culture ? `，地属${brief.culture}一带` : ""
  }。玩家吩咐了一件事，请照着把铺子改一改，再写一段短短的叙事。

【现有账目】
资金池 ${brief.cash} 下品灵石
月进项 ${brief.monthlyIncome} · 月开支合计 ${brief.monthlyExpenseTotal}（含各处设施的维持）
货物：${brief.goods.length ? brief.goods.map((g) => `${g.name}${g.price}文×${g.stock}`).join("，") : "暂无"}
设施：${brief.facilities.length ? brief.facilities.map((f) => `${f.name}（月耗${f.upkeep}）`).join("，") : "暂无"}

【要求】
- 只输出一个 JSON 对象：{"text": "叙事正文", "goods": [...], "facilities": [...], "monthlyIncome": 数字, "monthlyExpense": 数字}
- goods 与 facilities 要写【改动之后的完整清单】，不是只写新增的那几样；照玩家这一回的吩咐增减，没提到的照旧留着
- goods 每项含 name、price（每件下品灵石）、stock（存货数）、desc；facilities 每项含 name、upkeep（每月要花的银子）、effect（管什么用）
- monthlyExpense 只算铺面自身的开销（房租、人工等）；各处设施的 upkeep 另计，不要重复算进去
- monthlyIncome 与 monthlyExpense 要跟铺子卖什么、置了什么设施相称；寻常小铺月进项几十到几百，别动不动上千
- text 以第三人称写「你」，60 至 120 字，写出依着吩咐张罗的经过，末尾落到账面上（进项与开支各是多少）
- 不要输出解释、注释或代码围栏`;

  const user = `【我的吩咐】${brief.instruction}

请照办，并写这段叙事：`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** 宗门里自拟一座建筑的素材：玩家口述这一座叫什么、做什么用 */
export interface SectBuildBrief {
  /** 建筑叫什么 */
  name: string;
  /** 玩家的说法：这一座是什么样、做什么用 */
  brief: string;
  /** 山门所在的文化圈 */
  culture?: string;
  /** 宗门性质（剑修、丹道……），据以偏向产出 */
  nature?: string;
  /** 现下的宗门品级 */
  sectLevel?: number;
}

/**
 * 宗门自拟建筑：照玩家的口述，推出这一座的营造耗费、日常进项与好处。
 * 效力仍落在程序认得的几项（类别、消耗、日产、维护）上，故能照常入账、照常铺图。
 */
export function buildSectBuildPrompt(brief: SectBuildBrief): ChatMessage[] {
  const system = `你是修仙文字游戏里替宗门拟建筑账目的执笔。玩家是本门长老，要在山门里新起一座建筑，名叫「${brief.name}」，照他自己说的：「${brief.brief}」${
    brief.nature ? `。本门以${brief.nature}立宗` : ""
  }${brief.culture ? `，地属${brief.culture}一带` : ""}${brief.sectLevel ? `，眼下宗门 ${brief.sectLevel} 级` : ""}。请就着他的说法，把这一座的营造耗费、日常进项与好处一并拟出来。

【可归的类别】主殿 hall（法坛、议事、典礼）／经阁 scripture（藏经、符箓、碑刻）／演武 martial（演武场、练功、较艺）／丹房 alchemy（炼丹、药理、百草）／锻器 forge（锻造、铸剑、炼器）／灵脉 spirit（引灵、灵泉、聚灵）／灵田 farm（耕种、药圃、谷蔬）／灵苑 beast（豢养灵兽、禽苑）／阵法 array（护山大阵、禁制、星象）／居所 housing（弟子居舍、客舍、庖厨）

【要求】
- 只输出一个 JSON 对象：{"kindId": "类别", "effect": "给门中添的好处，一句", "cost": {"stones": 数字, "materials": [{"name": "材料名", "amount": 数字}]}, "info": {"note": "门里的说法一句", "scene": "这一处是什么样子", "produce": [{"name": "产物名", "base": 数字}], "stone": 数字, "reputation": 数字, "upkeep": 数字}, "text": "叙事正文"}
- kindId 只能取上面那十个之一，且须对得上这一座的用场；实在不类就挑最接近的一类
- cost.stones 是营造要花的灵石，寻常一座几十到几百；materials 给零到四样，每样含 name、amount
- info.produce 是这一处的日产，零到六样，base 是 Lv.1 每日产出的数目，别离谱
- info.stone 是日产灵石、info.reputation 是日产声望、info.upkeep 是每日维护灵石；都要与这一座相称，寻常小处 upkeep 个位数到几十
- info.scene 写这一处的样子、物什、气味声响，供叙事落笔，40 至 80 字
- effect 一句说清这一处给门中添了什么好处
- text 以第三人称写「你」，60 至 120 字，写这一座落成的经过，末尾点到花费
- 不要输出解释、注释或代码围栏`;

  const user = `【建筑名】${brief.name}
【我的说法】${brief.brief}

请拟出这一座的耗费、进项与好处：`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** 战斗收尾之逃跑阶段的素材：两条进度条与玩家这一句行动 */
export interface EscapeBrief {
  /** chase 为我方胜、提气追敌；flee 为我方败、且战且退 */
  role: "chase" | "flee";
  pursuit: number;
  retreat: number;
  place: string;
  text: string;
}

/** 战斗解析的素材：玩家这一句行动、他能使的招式、场上各人的位置与气血 */
export interface BattleIntentBrief {
  action: string;
  /** 已解锁的招式，逐一写明耗灵与威力，供模型认招 */
  skills: {
    techniqueName: string;
    skillName: string;
    mpCost: number;
    damage: number;
    cooldown: number;
    effect: string;
  }[];
  player: {
    name: string;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    mp: number;
    maxMp: number;
  };
  entities: {
    id: string;
    name: string;
    type: string;
    x: number;
    y: number;
    hp?: number;
    maxHp?: number;
    isDead?: boolean;
  }[];
  width: number;
  height: number;
  recent?: string[];
}

/**
 * 战斗第一步：读懂玩家这一句行动，认准他使的是哪一招、冲着谁、往哪儿挪。
 * 这一步只做解析，数值一概不碰——伤害与耗灵随后由代码照招式与自身根基算定。
 */
export function buildBattleIntentPrompt(brief: BattleIntentBrief): ChatMessage[] {
  const skillLines =
    brief.skills.length > 0
      ? brief.skills
          .map(
            (s) =>
              `- ${s.techniqueName}·${s.skillName}（耗灵 ${s.mpCost}，威力 ${s.damage}${
                s.cooldown ? `，冷却 ${s.cooldown}` : ""
              }${s.effect ? `，效果：${s.effect}` : ""}）`,
          )
          .join("\n")
      : "（此刻没有可使的招式）";

  const entityLines = brief.entities
    .map((e) => {
      const kind = e.type === "player" ? "你" : e.type === "enemy" ? "敌" : "同伙";
      const hp =
        typeof e.hp === "number"
          ? `，气血 ${e.hp}${typeof e.maxHp === "number" ? `/${e.maxHp}` : ""}`
          : "";
      return `- ${e.id}｜${e.name}（${kind}）位于 (${e.x}, ${e.y})${hp}${e.isDead ? "，已倒下" : ""}`;
    })
    .join("\n");

  const system = `你是修仙战斗里的判定助手。玩家写下这一回合的行动，你只负责把话读懂，认清他要使哪一招、冲着谁、挪到哪一格。
数值一概不用你算，也绝不要编造伤害、气血或灵力的增减。

【玩家】${brief.player.name} 在 (${brief.player.x}, ${brief.player.y})，气血 ${brief.player.hp}/${brief.player.maxHp}，灵力 ${brief.player.mp}/${brief.player.maxMp}

【他可以用的招式】
${skillLines}

【场上的人】（战场 ${brief.width}×${brief.height} 格，坐标从 0 起算）
${entityLines}
${brief.recent && brief.recent.length > 0 ? `\n【近几回的经过】\n${brief.recent.join("\n")}\n` : ""}
玩家这一回合的行动：${brief.action}

【要求】
- 只输出一个 JSON 对象，不要解释、注释或代码围栏：
{"skill": "招式名", "technique": "所属功法名", "target": "台上某人的 id", "move": {"x": 数字, "y": 数字}, "item": "所用的丹药或符箓名", "note": "这一手的其余要点，20 字以内"}
- skill 必须原样照抄【他可以用的招式】里的招式名；若这一手不是出招（只是走位、防守、用物、喊话、拖延），skill 写空字符串
- technique 写该招式所属功法名；skill 为空时也写空字符串
- target 必须照抄【场上的人】里的 id，且只能挑敌人；认不准是谁便写空字符串
- move 只在确实要挪窝时给，写出要去的那一格；不挪窝写 null。格子须在战场之内，并且不要写别人正占着的格
- item 只在明确要用丹药或符箓时写名目，否则写空字符串
- note 用一句话点出这一手的用意（如「侧身绕到敌后」「护住伤处」），没有便写空字符串`;

  const user = `请解析这一回合的行动：${brief.action}`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/**
 * 逃跑阶段：敌我各有一条进度，玩家以言语行动增减。
 * 进度由代码结账，这里只把态势报清、请模型写一段叙事并给出两个增减量。
 */
export function buildEscapePrompt(brief: EscapeBrief): ChatMessage[] {
  const chase = brief.role === "chase";
  const system = `你是修仙文字游戏里的说书人。一场厮杀已分胜负，眼下是收尾的追逃：${
    chase ? "你胜了，敌人转身要逃，你提气追了上去" : "你败了，伤重难支，只得且战且退"
  }，此地在${brief.place}。

【当前态势】
${chase ? "追击" : "撤退"}进度 ${chase ? brief.pursuit : brief.retreat}/100（${
    chase ? "你追赶敌人之势" : "你挣脱追兵之势"
  }）
${chase ? "撤退" : "追击"}进度 ${chase ? brief.retreat : brief.pursuit}/100（${
    chase ? "敌人脱身之势" : "追兵迫近之势"
  }）
玩家这一手：${brief.text}

【要求】
- 只输出一个 JSON 对象：{"narrative": "叙事正文", "pursuitDelta": 数字, "retreatDelta": 数字}
- pursuitDelta 是追击进度这一回的增减，retreatDelta 是撤退进度这一回的增减，各取 -30 到 30 的整数
- ${chase ? "你追得急、抄得巧，pursuitDelta 取正；敌人藏得深、断路毁桥，retreatDelta 取大些" : "你逃得妙、借地势脱身，retreatDelta 取正；追兵咬得紧、包抄合围，pursuitDelta 取大些"}
- 数值要与叙事相称：写得漂亮就给正数，写得拙劣、空喊口号就几乎不动或给负数
- narrative 以第三人称写「你」，60 至 120 字，写这一回合的追与逃
- 不要输出解释、注释或代码围栏`;

  const user = `请就这一手写出追逃的叙事与两个增减量：`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** 处置落败之敌的素材 */
export interface FateBrief {
  enemies: string[];
  text: string;
}

/** 处置敌人：玩家说了如何发落这败者，请说书人写一段了结的叙事 */
export function buildFatePrompt(brief: FateBrief): ChatMessage[] {
  const system = `你是修仙文字游戏里的说书人。一场厮杀已分胜负，敌人落败，落在你手里。${
    brief.enemies.length ? `落败的是：${brief.enemies.join("、")}。` : ""
  }
玩家说了要如何发落，请就着这一句话写一段了结的叙事。

【要求】
- 只输出一个 JSON 对象：{"narrative": "叙事正文"}
- narrative 以第三人称写「你」，60 至 120 字，写你处置这败者的经过与对方的反应
- 杀、放、收为奴仆、逼其立誓、索其身份来历，都照玩家所说写；玩家说得含糊，就替他把这桩收干净
- 不要输出解释、注释或代码围栏`;

  const user = `【如何发落】${brief.text}

请写这段叙事：`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** 落败被擒、开口求饶的素材 */
export interface SurrenderBrief {
  patience: number;
  text: string;
}

/** 败者对话：玩家说一句求饶或交涉的话，请模型按话术的得体程度增减敌方耐心 */
export function buildSurrenderPrompt(brief: SurrenderBrief): ChatMessage[] {
  const system = `你是修仙文字游戏里的说书人。你在一场厮杀中落败被擒，落在敌手，眼下开口求饶或交涉。
敌方的耐心 ${brief.patience}/100（越低越要动杀心，耐心归零便是死）。

玩家这一句：${brief.text}

【要求】
- 只输出一个 JSON 对象：{"narrative": "叙事正文", "patienceDelta": 数字}
- patienceDelta 是敌方耐心这一回的增减，取 -30 到 30 的整数
- 话术得体、能给对方好处的该加：许诺财物、抬出师门身份、软硬兼施、说中对方所图；嘴硬、辱骂、空口白话、要挟反遭忌的该减
- 加多少与减多少都要与叙事相称，不要一律给同一个数
- narrative 以第三人称写「你」，60 至 120 字，写你说出这番话后对方的反应
- 不要输出解释、注释或代码围栏`;

  const user = `请就这一句话写出对方的反应与耐心增减：`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/**
 * 路上变故的收场记号。
 * 模型认了这一桩已经了结，才在正文之后另起一行写它；
 * 见了它那扇窗才准关，否则玩家只能就着眼前这一桩应付下去。
 */
export const EVENT_END_MARK = "<<<EVENT_END>>>";

/**
 * 变故里给出的几条应对选项。
 * 模型在正文之后另起这一块，一行一条，玩家可一键取用，也可自己另写。
 */
export const EVENT_QUICK_MARK = "<<<QUICK>>>";

/** 玩家简要状况：变故的分量以此为尺，写提示词与收场都用得着 */
export interface EventPlayerBrief {
  name: string;
  title: string;
  realm: string;
  position?: string;
  sect?: string;
  /** 身上的要紧物事、伤病、状态 */
  condition: string;
  /** 同行的人 */
  companions: string;
  /** 眼下所在 */
  place: string;
  /** 眼下的时辰 */
  time: string;
}

function briefLines(brief: EventPlayerBrief): string {
  return [
    `【此时】${brief.time}`,
    `【所在】${brief.place}`,
    `【玩家】${brief.name}${brief.title ? `（${brief.title}）` : ""}，修为${brief.realm}${
      brief.position ? `，门中${brief.position}` : ""
    }${brief.sect ? `，属${brief.sect}` : ""}`,
    `【身上】${brief.condition}`,
    `【同行】${brief.companions}`,
  ].join("\n");
}

/** 一桩变故的开头 */
export function buildRandomEventPrompt(args: {
  /** 事由：玩家眼下在做什么 */
  reason: string;
  brief: EventPlayerBrief;
}): ChatMessage[] {
  const system = `你是这个修真世界的叙事者。玩家在途中往前走了一段，这一段路上出了一桩变故。

${PROSE_STYLE}

【事由】${args.reason}
${briefLines(args.brief)}

请写这一桩变故的开头，一百五十到三百字。规矩如下：
1. 分量必须与玩家的修为和手段相称：以他眼下的境界，这件事要有解、有回旋的余地。绝不可出现远超他实力与解决能力的天灾、大妖、绝境、必死之局，也不可写他无从下手的死结。
2. 事由要落在眼前的路上、天色、路人、鸟兽、物什上，写得具体可感，不要写成抽象的天意或宿命。
3. 用第三人称古风白话，只写这一段情景，不要列条目清单，不要复述数值与规则，不要出现「系统」「数据」「玩家」这类出戏的字眼。
4. 收在需要他拿主意或动手的当口，把选择留给他。
5. 正文之后另起一块，只列三到四条他眼下可以采取的应对，每条八到十八字，一条一行，写清要做什么、不必写成败，形如：
${EVENT_QUICK_MARK}
<三到四条应对，一行一条>
<<<END>>>
除这一块之外，不要输出任何标记、说明或数据操作。`;

  return [
    { role: "system", content: system },
    { role: "user", content: "请写这一段。" },
  ];
}

/** 变故里玩家应对之后，接着往下写 */
export function buildRandomEventReplyPrompt(args: {
  reason: string;
  brief: EventPlayerBrief;
  /** 这一桩的开头那一段 */
  opening: string;
  /** 此前的往来，一行一句 */
  history: string;
  /** 玩家这一回怎么应付的 */
  playerInput: string;
}): ChatMessage[] {
  const system = `你是这个修真世界的叙事者。接着下面这一桩变故往下写。

${PROSE_STYLE}

【事由】${args.reason}
${briefLines(args.brief)}

【这一桩的开头】
${args.opening}

【此前的往来】
${args.history || "（还没交手）"}

【玩家这一回】${args.playerInput}

请接着写一百五十到三百字，用第三人称古风白话：
1. 照玩家这一回的作为写出后果：办成了便写出办成的样子，失手了便写失手的代价，不要含糊过去，也不要一味顺着他。
2. 分量仍要与他的修为相称，不可忽然抬到远超他的境地，也不可凭空送他一场大机缘。
3. 正文之后另起一块，只列三到四条他眼下可以采取的应对，每条八到十八字，一条一行，写清要做什么、不必写成败，形如：
${EVENT_QUICK_MARK}
<三到四条应对，一行一条>
<<<END>>>
4. 若这一桩到此了结（人走了、事过了、险解了、谈定了），就在全篇最末另起一行只写 ${EVENT_END_MARK}；还没有了结就不要写这一行。
5. 只写正文与上面这两样；除它们之外，不要输出任何标记、说明或数据操作。`;

  return [
    { role: "system", content: system },
    { role: "user", content: args.playerInput },
  ];
}

// ---------------- 林地探索 ----------------

/**
 * 林地里探过一趟之后，模型若觉得这一趟探出了需要玩家当场拿主意的动静，
 * 便在正文之后另起这一块点出由头；store 见状另开那扇变故窗。
 */
export const FOREST_EVENT_MARK = "<<<FOREST_EVENT>>>";

/** 一次林地探索的素材：地点、时长，外加玩家简要状况 */
export interface ForestExploreBrief {
  /** 在哪一处，如「长安·林地」 */
  place: string;
  /** 该城文化背景 */
  culture?: string;
  /** 探了几个时辰 */
  hours: number;
  brief: EventPlayerBrief;
}

/**
 * 林地探索的叙事。
 * 得失不预先定死，交给模型按玩家修为、手段与所耗时辰权衡裁定；
 * 落账照旧另走一道结算，模型只需把得着的东西写具体。
 */
export function buildForestExplorePrompt(args: ForestExploreBrief): ChatMessage[] {
  const system = `你是这个修真世界的叙事者。玩家正在城中一处林地里走动察探，请就着这一趟写一段叙事。

${PROSE_STYLE}

【事由】在${args.place}的林地中探索，前后约 ${args.hours} 个时辰${args.culture ? `（此地属${args.culture}一带）` : ""}
${briefLines(args.brief)}

请写这一趟探索，一百二十到二百五十字。规矩如下：
1. 这一趟的得失由你裁定，但分量须与玩家的修为、手段和所耗的时辰相称：探得久了，得着的可能大些，遇上事的可能也大些。切不可凭空送他一场大机缘，也不可无端写下远超其实力的凶险。
2. 若有所获，务必写得具体：是何种草木药材、兽皮骨料、矿石器物，还是灵石钱财，都要落在实处，莫写空话。
3. 用第三人称古风白话，只写这一趟的情景，不要列条目清单，不要复述数值与规则，不要出现「系统」「数据」「玩家」这类出戏的字眼。
4. 若这一趟探出了需要他当场拿主意的动静（撞见人、兽、异象，或另有去处可探），就在正文之后另起一行写：
${FOREST_EVENT_MARK}<一句由头，十到二十字><<<END>>>
若只是平顺的一趟，便不必写这一行。
5. 除正文与上面那行标记外，不要输出任何别的标记、说明或数据操作。`;

  return [
    { role: "system", content: system },
    { role: "user", content: "请写这一趟探索。" },
  ];
}

// ---------------- 奇遇 ----------------

/** 了结后撤去的记号 */
export const ADVENTURE_DONE_MARK = "<<<ADVENTURE_DONE>>>";
/** 了结后仍留在原处、日后再来的记号 */
export const ADVENTURE_KEEP_MARK = "<<<ADVENTURE_KEEP>>>";

/** 一处奇遇的写照，供提示词引用 */
export interface AdventureBrief {
  name: string;
  kind: string;
  danger: number;
  summary: string;
  /** 归处写给人看，如「长安一带」 */
  where: string;
  reward?: string;
  penalty?: string;
  persistent?: boolean;
}

function adventureLines(a: AdventureBrief): string {
  return [
    `【奇遇】${a.name}（${a.kind}·凶险${a.danger}）`,
    `【所在】${a.where}`,
    `【概况】${a.summary || "（未详）"}`,
    a.reward ? `【可图】${a.reward}` : "",
    a.penalty ? `【凶险】${a.penalty}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** 踏进一处奇遇时的开场 */
export function buildAdventureOpeningPrompt(args: {
  adventure: AdventureBrief;
  brief: EventPlayerBrief;
  /** 打哪儿来的由头：循闻、误入、奉命…… */
  approach?: string;
}): ChatMessage[] {
  const { adventure, brief, approach } = args;
  const system = `你是这个修真世界的叙事者。玩家来到了一处野外的奇遇之地，正要踏进去。

${PROSE_STYLE}

${adventureLines(adventure)}
${briefLines(brief)}
${approach ? `【来由】${approach}` : ""}

请写他踏进这一处的开头，一百五十到三百字：
1. 先写这地方的光景——地势、气象、声息、物什，写得具体可感；再写他心里起了什么念头。
2. 分量要与他的修为和手段相称，纵是凶险之地，也要有可图之处、有回旋的余地；绝不可写他无从下手的死结，也不必立即送他机缘。
3. 用第三人称古风白话，只写这一段情景，不要列条目清单，不要复述数值与规则，不要出现「系统」「数据」「玩家」「奇遇」这类出戏的字眼。
4. 收在需要他拿主意或动手的当口，把选择留给他。`;

  return [
    { role: "system", content: system },
    { role: "user", content: "请写这一段。" },
  ];
}

/** 玩家在奇遇里应对之后，接着往下写 */
export function buildAdventureReplyPrompt(args: {
  adventure: AdventureBrief;
  brief: EventPlayerBrief;
  opening: string;
  history: string;
  playerInput: string;
}): ChatMessage[] {
  const { adventure, brief, opening, history, playerInput } = args;
  const system = `你是这个修真世界的叙事者。玩家正身处下面这一处奇遇之中，接着往下写。

${PROSE_STYLE}

${adventureLines(adventure)}
${briefLines(brief)}

【这一处的开头】
${opening}

【此前的往来】
${history || "（还没动手）"}

【玩家这一回】${playerInput}

请接着写一百五十到三百字，用第三人称古风白话：
1. 照玩家这一回的作为写出后果：得手了便写得手的样子与所得，失手了便写失手的代价，不要含糊过去，也不要一味顺着他。
2. 分量仍要与他的修为相称，不可忽然抬到远超他的境地，也不可凭空送他一场大机缘；该给的赏、该受的罚都要落到实处，写清是得了什么、还是折了什么。
3. 若这一处到此了结（取到了东西、平了凶险、探空了秘境、见势不妙退了出来），在正文之后另起一行只写一个记号：一次性的、往后不再来的写 ${ADVENTURE_DONE_MARK}；常设的、日后再来仍有戏的（集市、洞天之类）写 ${ADVENTURE_KEEP_MARK}。还没有了结就一个记号都不要写。
4. 只写这一段情景；除上面点明的记号外，不要输出任何标记、说明或数据操作。`;

  return [
    { role: "system", content: system },
    { role: "user", content: playerInput },
  ];
}

/** 请模型现掷一处奇遇，落在指定的一带 */
export function buildAdventureSpawnPrompt(args: {
  brief: EventPlayerBrief;
  where: string;
  culture?: string;
}): ChatMessage[] {
  const { brief, where, culture } = args;
  const system = `你是这个修真世界的叙事者。天意要在「${where}」一带${culture ? `（${culture}风物）` : ""}生出一处奇遇，作为玩家日后可能踏足的野外去处。

${briefLines(brief)}

请编一处与这一带风物、与玩家眼下的境界和处境相称的去处。必须只输出一个 JSON 对象，不要解释、注释或代码围栏：
{
  "name": "如 荒废的丹庐",
  "summary": "不超过 60 字，说清有什么可图、有什么凶险",
  "kind": "秘境、遗迹、机缘、凶险、异象 之一",
  "danger": 1 到 5 的整数,
  "reward": "写成字面话，如 下品灵石三十枚、一炉旧丹；也可省",
  "rewardKind": "灵石、修为、物品、人情、正道名声、魔道名声、平民名声、官府名声 之一，须与 rewardAmount 同时给出；也可省",
  "rewardAmount": "1 到 3000 的整数；也可省",
  "penalty": "写成字面话；也可省",
  "penaltyKind": "灵石、修为、业力、正道名声、魔道名声、平民名声、官府名声 之一，须与 penaltyAmount 同时给出；也可省",
  "penaltyAmount": "1 到 3000 的整数；也可省",
  "persistent": false
}
名字与世界要自成一体，不要用「系统」「任务」这类字眼；不要写成玩家已经到过，他是日后才可能踏足的。`;

  return [
    { role: "system", content: system },
    { role: "user", content: "请编这一处。" },
  ];
}

/**
 * 差事里的人物立传：照这一桩事与那几位的称谓、人设，替他配齐身份细节。
 * 姓名、性别、年岁、出身、性情、形貌、修为都由模型拟定，
 * 不再从姓名与形貌的池子里现拼——如此才不会出现与身份对不上的接头人。
 */
export function buildTaskNpcPrompt(args: {
  questName: string;
  questDesc?: string;
  npcs: { title: string; gender?: string; persona?: string }[];
  /** 已有的人名，重名要避开 */
  avoid?: string[];
}): ChatMessage[] {
  const list = args.npcs
    .map((n, i) => {
      const who = `${i + 1}. 称谓「${n.title}」${n.gender ? `（须为${n.gender}）` : ""}`;
      return n.persona ? `${who}。这份人设：${n.persona}` : who;
    })
    .join("\n");
  const avoid = (args.avoid ?? []).filter(Boolean).slice(0, 40);
  const system = `你是这个修真世界的叙事者，正在给一桩差事里牵涉的人物各立一份小传。

【这一桩事】${args.questName}${args.questDesc ? `\n${args.questDesc}` : ""}

【要立传的几位】
${list}

请给上面每一位配齐身份细节，务求与他的称谓、这份人设、以及这桩事彼此相合，切不可出现身份与言行对不上的情形。必须只输出一个 JSON 对象，不要解释、注释或代码围栏：
{
  "npcs": [
    { "name": "姓名", "gender": "男或女", "age": 整数, "origin": "出身来历", "personality": "性情", "appearance": "形貌", "realm": "修为" }
  ]
}
规矩：
1. 顺序与上面的人一一对应，人数不多不少。
2. name 一律 2 到 3 个汉字，只写姓与名，不要称号，也不要带「先生」「掌柜」「大人」这类尾字；不要与这些已有的人重名：${avoid.length > 0 ? avoid.join("、") : "（暂无）"}。
3. gender 只取「男」或「女」；上面已给定性别的，须照给定的写。
4. age 与称谓相称：管事、东家、掌柜一类多在三十至六十之间，伙计、小厮、丫鬟年轻些。
5. origin 为出身来历、personality 为性情、appearance 为形貌，各不超过 20 字，三者彼此不矛盾，且与他的营生（如药行东家、山匪头目、衙门书吏）相合。
6. realm 只取 凡人、炼气初期、炼气中期、炼气后期、筑基初期 之一：市井百姓多为凡人；有功夫在身或占山为王的一类可高些，但不要超出这一桩事该有的分量。`;

  return [
    { role: "system", content: system },
    { role: "user", content: "请立传。" },
  ];
}

/** 压缩提示：把旧回合压缩为 ≤1000 字前情提要 */
export function buildCompressionPrompt(
  oldSummary: string,
  oldTurns: { input: string; narrative: string }[],
): ChatMessage[] {
  const turnsText = oldTurns
    .map((t, i) => `回合${i + 1} 决策：${t.input}\n叙事：${t.narrative}`)
    .join("\n\n");
  return [
    {
      role: "system",
      content:
        "你是修仙文字游戏的剧情压缩助手。将历史回合压缩为不超过 1000 字的前情提要，保留：关键剧情转折、人物关系变化、重大数值变化（境界突破、得失宝物、生死仇怨）、未解悬念。舍弃细节描写与重复内容。直接输出提要正文，不要标题、不要解释。",
    },
    {
      role: "user",
      content: `旧提要：\n${oldSummary || "（无）"}\n\n需要压缩的历史回合：\n${turnsText}\n\n请输出不超过1000字的压缩提要：`,
    },
  ];
}
