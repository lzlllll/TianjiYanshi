import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  GameState,
  PanelId,
  CraftingTab,
  DataOp,
  GameSnapshot,
  TalismanRecipe,
  Player,
  BrewResult,
  Buff,
  ShieldData,
  InventoryItem,
  Relation,
  Manor,
  Market,
  SkillCheck,
  Skill,
  PawnTicket,
  Quest,
  JobTarget,
  Adventure,
  EscortOffer,
  CraftOffer,
  Pact,
  Workshop,
  FacilityKindId,
  CustomFacility,
  GameTime,
  SectSite,
  SectRelation,
  SectStance,
  Occupation,
  ManorActArgs,
  ManorActResult,
} from "@/data/types";
import { applyOpsToState, normalizeAppraisal, normalizeItemElements } from "@/lib/dataOps";
import { WORLD_SCENE_ID, assignManorCell, getCityMarkers, getDefaultPlaceId, getDistricts, getMarker, getScene, getScenePresetPoints, registerManorScenes, registerSectScenes, sectSceneId } from "@/data/map";
import { presetKey } from "@/data/map/presets";
import { makeVillageShop, rollVillageBuildings, rollVillageName, rollVillageNpcs, villageBuildingName } from "@/data/villages";
import { ESTATE_DECAY_PER_DAY, REBUILD_CONDITION, REBUILD_DAYS, maintainCost, rebuildCost, rollEstateOffer, sellRefund } from "@/data/estates";
import {
  MANOR_PLOT_PRICE,
  SHAPE_COST,
  convertCost,
  demolishRefund,
  cropBlockedByWinter,
  cropYield,
  emptyPlot,
  manorBonusOf,
  quarterKey,
  salvageValue,
  upgradeCost as manorUpgradeCost,
} from "@/data/manors";
import { migrateRelation } from "@/data/npcGen";
import { clampShopFacilities, clampShopGoods, shopLeaseCost, shopMonthlyExpense, SHOP_ARREARS_LIMIT, SHOP_MONEY_MAX } from "@/data/playerShops";
import { activeModifierEffects } from "@/data/sectModifiers";
import type {
  Estate,
  EstateOffer,
  ManorFunction,
  ManorPlot,
  ManorShape,
  PlayerShop,
  ShopFacility,
  ShopGood,
  ShopKind,
  Village,
} from "@/data/types";
import { resolveLocation } from "@/data/locations";
import { normalizeAdventure, pickOrNudgeSpotNear } from "@/data/adventures";
import { OPENING_GAME_TIME, OPENING_DAY_SERIAL, LEGACY_DAY_OFFSET, ERA_YEAR_OFFSET, daySerial, gameDateKey, gameMonthKey, normalizeGameTime, shiftGameTime, shichenName } from "@/lib/gameTime";
import { MAX_TRAVEL_COMPANIONS, isNpcAround, manorKey, rollManor, rollQuestNpc, travelingCount } from "@/data/npcGen";
import { cultivationGain, localCultivationFrom } from "@/data/cultivation";
import { brokerTargetsFor } from "@/data/broker";
import {
  LECTURE_ABSENT_DAYS,
  LECTURE_ABSENT_PENALTY,
  STONES_PER_CONTRIBUTION_IN,
  STONES_PER_CONTRIBUTION_OUT,
  contributionForItem,
  heritageCost,
  heritageRequirement,
  isElderOrAbove,
  isInnerDiscipleOrAbove,
  leaderRealmIndex,
  lectureGain,
  lectureHour,
  nearestCityIdFor,
  positionLevel,
  preachReward,
  rollSectTasks,
  type SectTaskBuilding,
} from "@/data/sectLife";
import {
  FACILITY_LEVEL_CAP,
  MATERIAL_SURPLUS_KEEP,
  buildOptions,
  facilityActions,
  facilityDecision,
  facilityRoster,
  facilityStateOf,
  facilitySteward,
  facilityUpkeep,
  facilityYield,
  initialEndowment,
  materialPrice,
  clampCustomFacility,
  upgradeCost,
} from "@/data/sectFacilities";
import { SECT_EMPTY_TILE, SECT_TILE_COUNT, getSectTileKind, sectTileCode } from "@/data/map/sectTiles";
import { applySectFeatureBias, sectBuildingRoster, sectBuildingSpec } from "@/data/map/sectBuildings";
import { SHOP_KINDS, rollMarket, syncMarket } from "@/data/shops";
import { aliveRumors } from "@/data/rumors";
import { findSkill, rollSkillCheck, trainOnceADay, trainSkill } from "@/data/skills";
import { applyQuestLedger, holdRewardOutcome, isQuestOverdue, isRewardHeld, pickOpenQuest, questAssetGoalMet, questRealmGoalMet, takeItemsByName } from "@/data/quests";
import { EMPTY_REPUTATION, normalizeReputation, reputationFirstImpression, shiftReputation } from "@/data/reputation";
import { spendLowStones } from "@/data/spiritStones";
import type { BuskResult } from "@/data/types";
import { beastFromItem, normalizeBeast, raiseBond } from "@/data/beast";
import {
  SECT_FOUND_STONE_COST,
  buildFoundingSite,
  claimPlayerSect,
  foundingPositions,
  playerSectName,
  presetCulture,
  rollSectSites,
  type FoundingSectInput,
} from "@/data/sectSites";
import { PAWN_DAYS, isPawnOverdue, pawnPrice } from "@/data/pawn";
import { escortToRelation, isEscortExpired } from "@/data/escort";
import { normalizeSectRelation, upsertSectRelation, findSectRelation, vassalTribute, type SectWarChoice } from "@/data/sectRelations";
import { climateAggression } from "@/data/sects";
import { occupationTribute, ownerOf, upsertOccupation } from "@/data/occupations";
import { rollWorkshop } from "@/data/craftsmen";
import { PACT_KEPT_AFFINITY, PACT_OVERDUE_AFFINITY, pactLapsed, pactReady } from "@/data/pacts";
import { showsToday } from "@/data/theatre";
import { pruneBuffs, shortenDebuffs } from "@/lib/buffTime";
import { effectiveHpMax } from "@/lib/buffUtils";
import { BUFF_TEMPLATES, buffFromTemplate } from "@/data/buffs";
import { BATH_RELIEF_PER_HOUR, bathCost, clampHours } from "@/data/bath";
import { goodDesc } from "@/data/goods";
import { gradeForPrice, itemTypeFor } from "@/data/shopStock";
import {
  REALMS,
  initialPlayer,
} from "@/data/mockData";
import { AI_BACKEND_READY } from "@/data/backend";

interface GameStore extends GameState {
  setPanel: (panel: PanelId | null) => void;
  setCraftingTab: (tab: CraftingTab) => void;
  /** 终局：气血耗尽或寿元用尽时立起，弹出结局页；null 为未终局 */
  ending: { reason: string } | null;
  /** 立终局 */
  raiseEnding: (reason: string) => void;
  /** 时辰推进后的生死结算：重伤掉气血，气血/寿元见底则立终局 */
  tickMortality: (hours: number) => void;
  /** 开局兜底：余寿照「上限减年岁」算出来；没报年岁的仍须为正、留有余量，不可为 0 或与上限相等 */
  sanitizeOpeningLifespan: () => void;
  /** 进入某张地图场景；场景不存在则忽略 */
  enterScene: (sceneId: string) => void;
  /** 返回当前场景的上位地图 */
  exitScene: () => void;
  /** 眼下所在之地的名目：人在山门里便是那一处山门，否则是所在地点的名号 */
  hereLabel: () => string;
  /** 开发者模式：直接把所在之地切到某座城，跳过叙事推动 */
  devMoveTo: (placeId: string) => void;
  /** 在街区上结识一个人：首次交谈即把他固定进尘缘，此后这块地上一直有他 */
  meetNpc: (npc: Relation) => void;
  /** 把一段记事写进某个相识之人的记忆 */
  appendRelationMemory: (id: string, text: string) => void;
  /** 从尘缘里删去若干人（如情谊太浅的） */
  removeRelations: (ids: string[]) => void;
  /** 在别处按倍数练一门指定功法：进度记在功法上，修为随之长；返回实际所得 */
  trainAt: (techniqueId: string, hours: number, mul: number) => number;
  /** 掷出一户大户人家并固定进存档；已有则原样取出，绝不重掷 */
  ensureManor: (cityId: string, districtId: number, cityName: string, culture?: string) => Manor;
  /** 在本图空着的预设点位上，随机圈出若干村庄；已开过的不再变 */
  ensureVillages: () => void;
  /** 打听一处村庄：掷定村里的营生与人物，此后固定 */
  inquireVillage: (key: string) => void;
  /** 买下村里的屋舍后，把待售的牌子撤下 */
  clearVillageEstateOffer: (key: string) => void;
  /** 名下房产 */
  estates: Estate[];
  /** 买下一处屋舍；paid 是讲价后的实付 */
  buyEstate: (offer: EstateOffer, paid: number) => Estate;
  /** 出售一处房产，退回灵石 */
  sellEstate: (id: string) => number;
  /** 维护一处房产：花灵石把完好度补满 */
  maintainEstate: (id: string) => boolean;
  /** 重建一处房产：花灵石与数日，复原到可用 */
  rebuildEstate: (id: string) => boolean;
  /** 把行囊里的东西存进屋里 */
  storeInEstate: (id: string, itemName: string, count: number) => boolean;
  /** 从屋里取回行囊 */
  takeFromEstate: (id: string, itemName: string, count: number) => boolean;
  /** 把一处屋舍租出去；租客与月租由叙事议定 */
  rentOutEstate: (id: string, rent: { tenant: string; monthly: number }) => void;
  /** 收回一处屋舍自住 */
  reclaimEstate: (id: string) => void;
  /** 把整个宅邸租出去；租客与月租由叙事议定 */
  rentOutPlot: (plotId: string, rent: { tenant: string; monthly: number }) => void;
  /** 收回宅邸自住 */
  reclaimPlot: (plotId: string) => void;
  /** 单独把宅邸里的某一间屋子租出去；租客与月租由叙事议定 */
  rentOutRoom: (plotId: string, index: number, rent: { tenant: string; monthly: number }) => void;
  /** 收回某一间出租的屋子 */
  reclaimRoom: (plotId: string, index: number) => void;
  /** 在宅邸里做一件实事：打坐、参悟、演练、研读、会客、驯兽、熔炼、存取 */
  manorAct: (args: ManorActArgs) => ManorActResult;
  /** 把各处房产的完好度按日子结算到今日 */
  settleEstates: () => void;
  /** 坊市里自设的铺面 */
  playerShops: PlayerShop[];
  /** 在坊市盘下一间铺面：付盘店费，另投一笔作启动资金池 */
  openShop: (input: {
    name: string;
    kind: ShopKind;
    typeLabel?: string;
    cityId: string;
    districtId: number;
    place: string;
    culture?: string;
    capital: number;
    /** 开张时由 AI 推演出的底子；缺则空着起步 */
    goods?: ShopGood[];
    facilities?: ShopFacility[];
    monthlyIncome?: number;
    monthlyExpense?: number;
    useStock?: boolean;
  }) => PlayerShop | null;
  /** 从铺子资金池里取钱出来；返回实取到的数 */
  withdrawShopCash: (id: string, amount: number) => number;
  /** 往铺子资金池里注钱；返回实注入的数 */
  depositShopCash: (id: string, amount: number) => number;
  /** 把「经营」面板里议定的改动落库：货物、设施与月收支 */
  applyShopPatch: (
    id: string,
    patch: {
      name?: string;
      goods?: ShopGood[];
      facilities?: ShopFacility[];
      monthlyIncome?: number;
      monthlyExpense?: number;
    },
  ) => void;
  /** 名下铺面按月结算：进项入池、开销从池里扣；连欠三月便被债主收走 */
  settlePlayerShops: () => void;
  /** 名下宅邸地块 */
  manorPlots: ManorPlot[];
  /** 买下一处宅地（7×7 空地） */
  buyPlot: (input: { place: string; cityId?: string; districtId?: number }) => ManorPlot | null;
  /** 名下宅地若还没落到城图上，挑一格空地落下 */
  ensureManorCells: () => void;
  /** 在空地上盖一处建筑形体，可指定摆放朝向 */
  buildShape: (plotId: string, index: number, shape: ManorShape, facing?: 0 | 1) => boolean;
  /** 把一处建筑调转朝向 */
  flipManorCell: (plotId: string, index: number) => boolean;
  /** 给一处建筑分配功能 */
  assignManorFunction: (plotId: string, index: number, fn: ManorFunction | undefined) => boolean;
  /** 升级一处建筑 */
  upgradeManorCell: (plotId: string, index: number) => boolean;
  /** 拆除一处建筑，退回部分灵石 */
  demolishManorCell: (plotId: string, index: number) => boolean;
  /** 改建：把一处建筑换成另一形体 */
  convertManorCell: (plotId: string, index: number, shape: ManorShape) => boolean;
  /** 名下宅邸某一项功能的加成合计 */
  manorBonus: (fn: ManorFunction) => number;
  /** 给灵田记下要种的作物（过了 AI 那一关才落） */
  setManorCrop: (plotId: string, index: number, crop: string) => boolean;
  /** 按季度结算灵田的收获 */
  settleManorFields: () => void;
  /** 记下向街坊打听来的家世 */
  setManorBackground: (key: string, background: string) => void;
  /** 主家允准进门，此后可直接入内拜会 */
  admitManor: (key: string) => void;
  /** 开一处坊市并固定进存档；已开过则原样取出，绝不重掷 */
  ensureMarket: (cityId: string, districtId: number, culture: string | undefined, slots: number) => Market;
  /** 开一处匠人区并固定进存档；工匠一局之内不再换人 */
  ensureWorkshop: (cityId: string, districtId: number, cityName: string, culture?: string) => Workshop;
  /** 在作坊里说定一件事：付清料钱工钱，记下一桩取货的约定 */
  placeCustomOrder: (args: {
    offer: CraftOffer;
    npcId: string;
    giver: string;
    place: string;
    cityId: string;
    districtId: number;
  }) => boolean;
  /** 主动去了结一桩约定：取货要等日子到，口头的随时可以去 */
  settlePact: (pactId: string) => boolean;
  /** 误过宽限的口头之约，情谊上落一点亏 */
  expirePacts: () => void;
  /** 记下在某家铺子门前驻足所见 */
  setShopInfo: (key: string, shopId: string, info: string) => void;
  /** 买下一件货：扣下品灵石、入行囊、铺面减存；灵石或存货不够则不成 */
  buyGood: (args: { key: string; shopId: string; goodName: string; price: number }) => boolean;
  /**
   * 不限商铺的一笔买入：叙事里讲定的一桩买卖，照价扣下品灵石、把物收入行囊。
   * 行囊里已有同名同类的摞上去；灵石不够则不成。
   */
  buyFromNarrative: (args: {
    name: string;
    price: number;
    count?: number;
    type?: InventoryItem["type"];
    desc?: string;
  }) => boolean;
  /** 卖出一样东西：行囊里减掉、灵石入袋；totalPrice 是整笔的价钱 */
  sellItem: (args: { itemId: string; totalPrice: number; count: number }) => boolean;
  /** 把行囊里的东西递出去：从行囊里扣下，记一笔流水 */
  giveItemAway: (args: { itemId: string; count?: number; toName?: string }) => boolean;
  /** 花掉几枚下品灵石，如打尖叫菜；不够则不成 */
  payStones: (amount: number) => boolean;
  /** 街头卖艺：对选定本事连考五回，过则得钱，失手折平民名声并压低后续判定 */
  busk: (skillName: string) => BuskResult;
  /** 城里花掉的时辰：打听、等候都算在内，只往前推 */
  advanceTime: (hours?: number) => void;
  setActiveHeartTechnique: (id: string | null) => void;
  setPlayer: (player: Player) => void;
  breakthrough: () => void;
  drawTalisman: (recipe: TalismanRecipe) => { success: boolean; message: string };
  brewAlchemy: (selectedHerbs: { name: string; count: number }[], fire: number, duration: number) => Promise<BrewResult>;
  acceptTask: (id: string) => void;
  /** 照本门附近真有的城池现掷一批门派任务；手头还有在办的便不换，除非 force */
  refreshSectTasks: (force?: boolean) => void;
  /**
   * 在山门里听掌门开讲，或自己登坛：记考勤、涨修为，另给一句交给叙事去写。
   * topic 是这一场讲什么，由玩家先挑定。
   */
  attendLecture: (topic?: string) => { ok: boolean; message?: string; decision?: string };
  /** 过了开讲时辰仍不见人来，按半月缺勤的规矩扣一笔贡献；进山门与过时辰时各算一次 */
  settleLecture: () => void;
  /** 以贡献换一门功法：身份等级不到的换不得。只落账，叙事由调用方接着送 */
  learnHeritage: (name: string) => boolean;
  /** 在讲经堂登座讲一场经，换一笔贡献；一日一场。topic 是这一场讲什么 */
  preachScripture: (topic?: string) => { ok: boolean; message?: string; decision?: string };
  /** 建筑的日常结算：各处产出入宝库、扣维护、弟子耗灵谷与蔬菜；进山门与过日时各算一次 */
  settleFacilities: () => void;
  /** 开局给宗门备一笔家底：灵石与几样过日子的料；只给一回 */
  ensureSectEndowment: () => void;
  /** 各处山门的日结：进项、支用与余料发卖；本门另有 management.treasury 那一本 */
  settleSectSites: () => void;
  /** 拿宝库的灵石与材料把一座建筑升一级 */
  upgradeFacility: (name: string, kindId: FacilityKindId) => boolean;
  /** 在荒地上一手新立一座建筑：身份与门户品级都要够，耗费从宝库出 */
  buildSectFacility: (
    cellIndex: number,
    name: string,
    /** 玩家自拟的那一座：给了便不照名录挑，耗费与账目都照它自己的 */
    custom?: CustomFacility,
  ) => { ok: boolean; message: string };
  /**
   * 在一座建筑里做一件事：参数先挑定，由这里按规则落账，
   * 再回一句交给叙事去写的行止。凡是一按即成的勾当，这里一概不做。
   */
  performFacilityAction: (
    name: string,
    kindId: FacilityKindId,
    actionId: string,
    option: string,
  ) => { ok: boolean; message?: string; decision?: string };
  promote: (id: string) => void;
  buyShop: (id: string) => void;
  /** 上交灵石换贡献：每 10 下品灵石折 1 点；返回实得贡献 */
  donateStonesToSect: (stones: number) => number;
  /** 上交行囊里的物品换贡献：按品阶折价；返回实得贡献 */
  donateItemToSect: (itemName: string, count?: number) => number;
  /** 内门弟子以上，以贡献兑换灵石：1 点贡献折 8 下品灵石；返回实得灵石 */
  redeemContributionForStones: (contribution: number) => number;
  /** 定下谁与你同行：同行的人遇上打斗会站到你这一边 */
  setTraveling: (relationId: string, traveling: boolean) => boolean;
  addLog: (msg: string) => void;
  resetGame: () => void;
  applyOps: (ops: DataOp[], opts?: { writable?: string[] }) => string[];
  getSnapshot: () => GameSnapshot;
  restoreSnapshot: (snap: GameSnapshot) => void;
  updateNews: (newItems: { category: string; title: string; content: string; source: string }[]) => void;
  /** 记下刚从别处听来的零碎消息；过了月的自行清掉 */
  addRumors: (items: { text: string; source: string }[]) => void;
  /** 承认某一次判定输了；此前悬着的余地就此了结 */
  settleCheck: (id: string, success: boolean) => void;
  /** 掷一次判定：点数加技能等级过难度；没这门本事就按零级算 */
  checkSkill: (args: { skill: string; dc: number; context: string }) => SkillCheck | null;
  /** 了结一桩机缘：交差或作罢；成不成由叙事里那人点头，这里只管落账 */
  settleQuest: (args: { name: string; status: "done" | "failed" }) => boolean;
  /** 修到修为类机缘指的那一层，便自行办成 */
  settleRealmQuests: () => void;
  /** 物品、灵石两类机缘攒够了目标，便自行办成 */
  settleAssetQuests: () => void;
  /** 误了期的机缘，到日子一并罚了 */
  expireQuests: () => void;
  /** 立一处奇遇；只落在空闲的预设点位上 */
  addAdventure: (adventure: Adventure) => void;
  /** 了结一处奇遇：keep 为真则了结后仍留在此处，否则撤去 */
  settleAdventure: (id: string, keep: boolean) => void;
  /** 玩家行至某处奇遇的点位：把位置钉到那一处，供入内交互 */
  arriveAtAdventure: (id: string) => void;
  /** 给一处奇遇打补丁：把说过的话记成一卷、把备下的选择记下 */
  patchAdventure: (id: string, patch: Partial<Adventure>) => void;
  /** 把一处奇遇从舆图上抹去；了结之后玩家自己动的手 */
  removeAdventure: (id: string) => void;
  /** 替任务人物立传改名：照 id 打补丁（名、性别、年岁、出身、性情、形貌、修为），
   *  并把机缘里指向旧名的接头人一并改过来 */
  patchRelations: (
    updates: {
      id: string;
      patch: Partial<Pick<Relation, "name" | "gender" | "age" | "origin" | "personality" | "appearance" | "realm">>;
    }[],
  ) => void;
  /** 在瓦舍听完一场戏：把那点门道记到本事上，并把今日的场次记上一笔 */
  recordPlay: (args: { skillId?: string; gain: number; newSkill?: Skill }) => void;
  /** 把行囊里的一头灵兽收作随身；一身只带一头，换兽时旧的那头自行归山 */
  tameBeast: (itemId: string) => boolean;
  /** 放归随身的灵兽 */
  releaseBeast: () => void;
  /** 开局照六处文化圈各掷三到五处宗门，落在九州舆图上 */
  rollSectSites: () => void;
  /** 该有的宗门补齐：一处都没有就先掷，玩家报过宗门名号的再认领一处作本门 */
  ensureSectSites: () => void;
  /**
   * 开宗立派：散修自选一处空地点位，照自己填的信息立起门户。
   * 花一笔灵石，落成后只有一座主殿、门下无人，玩家自此为掌门。
   */
  foundSect: (input: FoundingSectInput) => { ok: boolean; message: string };
  /**
   * 宗门战收场：攻破的一处宗门，照玩家所择发落——掠夺、纳附庸，或一举摧毁。
   */
  resolveSectWar: (args: {
    targetId: string;
    /** 打的是宗门、城还是村；缺省按宗门算 */
    targetKind?: "sect" | "city" | "village";
    choice: SectWarChoice;
  }) => { ok: boolean; message: string };
  /** 月度结算：各属城村来贡，本门占的入本门宝库，别家占的入那一处自己的账 */
  settleOccupations: () => void;
  /**
   * 别家宗门主动启衅：照各自风气里的侵略倾向一日一掷，掷中的便向近邻兴兵；
   * 胜者从败者手里夺一处城村，两家结仇，并记入快报与传闻。
   */
  settleAiSectWars: () => void;
  /**
   * 把玩家的身份对上本门的职位树。
   * 开局报的身份是玩家随手写的，门中职位是模型另拟的，两边名目常对不上，
   * 对不上便落在最低一级，免得判身份时卡在「低于外门弟子」。
   */
  alignPlayerPosition: () => void;
  /** 鉴宝有了结果：把行囊里那件旧物换成看明白的样子；看不明白就原样留着 */
  identifyItem: (args: { itemId: string; reading: unknown }) => boolean;
  /** 把一件东西押在当铺，换回七成价钱的灵石 */
  pawnItem: (args: {
    itemId: string;
    shopId: string;
    shopName: string;
    cityId: string;
    districtId: number;
    count?: number;
  }) => PawnTicket | null;
  /** 回原来那家当铺赎东西 */
  redeemPawn: (ticketId: string) => boolean;
  /** 过了期限还不来赎的，一并成了死当 */
  expirePawns: () => void;
  /** 从牙行柜上接下一桩差事：写成自己的机缘，赏押在那家柜上 */
  takeBrokerJob: (args: {
    key: string;
    shopId: string;
    jobId: string;
    cityId: string;
    districtId: number;
  }) => boolean;
  /** 回牙行领押在柜上的赏；没办成或是领过了都不成 */
  claimQuest: (questId: string) => boolean;
  /** 在镖局雇下一位镖师：付清佣金，他自此与你同行，雇期一到自行告辞 */
  hireEscort: (args: {
    offer: EscortOffer;
    cityId: string;
    districtId: number;
    metAt: string;
  }) => boolean;
  /** 雇期到了的镖师各自上路 */
  expireEscorts: () => void;
  addBuff: (buff: Buff) => void;
  removeBuff: (buffId: string) => void;
  addShield: (shield: ShieldData) => void;
  consumeShield: (amount: number) => void;
  updateBuffDuration: () => void;
  /** 下汤池泡几个时辰：先付汤钱，负面状态随之缩短，挪过此刻的就此养好 */
  takeBath: (hours: number) => { ok: boolean; cost: number; washed: string[]; reason?: string };
  /** 战斗里香烧过了几柱：按柱香计的临时状态照数递减，烧完的自行散去 */
  burnIncense: (sticks: number) => void;
  equipItem: (itemId: string, slot: "命" | "护" | "辅") => void;
  unequipSlot: (slot: "命" | "护" | "辅") => void;
}

function validateAndFixPlayer(player: any): Player {
  if (!player || typeof player !== "object") {
    return {
      ...initialPlayer,
      spiritRoots: [],
      stats: { vitality: 50, soul: 50, wisdom: 50, agility: 50, heartScores: [] },
      meridians: [],
      timeline: [],
      buffs: [],
      shields: [],
      activeHeartTechnique: null,
    };
  }

  const stats = typeof player.stats === "object" && player.stats !== null ? player.stats : {};

  return {
    ...player,
    name: typeof player.name === "string" && player.name ? player.name : "玩家",
    title: typeof player.title === "string" ? player.title : "无名之辈",
    realm: typeof player.realm === "string" ? player.realm : "引气初期",
    realmIndex: typeof player.realmIndex === "number" ? player.realmIndex : 0,
    cultivation: typeof player.cultivation === "number" ? player.cultivation : 0,
    hp: typeof player.hp === "number" ? player.hp : 100,
    hpMax: typeof player.hpMax === "number" ? player.hpMax : 100,
    mp: typeof player.mp === "number" ? player.mp : 50,
    mpMax: typeof player.mpMax === "number" ? player.mpMax : 50,
    spirit: typeof player.spirit === "number" ? player.spirit : 0,
    spiritMax: typeof player.spiritMax === "number" ? player.spiritMax : 100,
    lifespanCurrent: typeof player.lifespanCurrent === "number" ? player.lifespanCurrent : 100,
    lifespanMax: typeof player.lifespanMax === "number" ? player.lifespanMax : 100,
    body: typeof player.body === "string" ? player.body : "凡人之躯",
    fortune: typeof player.fortune === "string" ? player.fortune : "平庸",
    karma: typeof player.karma === "number" ? player.karma : 50,
    position: typeof player.position === "string" ? player.position : "",
    sectName: typeof player.sectName === "string" ? player.sectName : "",
    description: typeof player.description === "string" ? player.description : "",
    personality: typeof player.personality === "string" ? player.personality : "",
    background: typeof player.background === "string" ? player.background : "",
    stats: {
      vitality: typeof stats.vitality === "number" ? stats.vitality : 50,
      soul: typeof stats.soul === "number" ? stats.soul : 50,
      wisdom: typeof stats.wisdom === "number" ? stats.wisdom : 50,
      agility: typeof stats.agility === "number" ? stats.agility : 50,
      heartScores: Array.isArray(stats.heartScores) ? stats.heartScores : [],
    },
    spiritRoots: Array.isArray(player.spiritRoots) ? player.spiritRoots : [],
    meridians: Array.isArray(player.meridians) ? player.meridians : [],
    timeline: Array.isArray(player.timeline) ? player.timeline : [],
    buffs: Array.isArray(player.buffs) ? player.buffs : [],
    shields: Array.isArray(player.shields) ? player.shields : [],
    activeHeartTechnique: player.activeHeartTechnique || null,
  };
}

/**
 * 宗门那一摊子数组里常有半截条目：模型落账时写进一条 null、或漏了名目，
 * 概览一读 h.status 便整页崩掉。载入存档、回放快照时一律清一遍：
 * 只留得下对象的条目，名目也没有的便舍了。
 */
function normalizeSectData(raw: any): GameState["sect"] {
  const base = (raw && typeof raw === "object" ? raw : {}) as any;
  const entries = (value: any) =>
    Array.isArray(value)
      ? value.filter((item: any) => item && typeof item === "object" && !Array.isArray(item))
      : [];
  return {
    ...initialState.sect,
    ...base,
    positions: entries(base.positions),
    tasks: entries(base.tasks),
    shop: entries(base.shop),
    heritage: entries(base.heritage).filter((h: any) => h.name),
    resources: entries(base.resources).filter((r: any) => r.name),
  };
}

function validateAndFixState(state: any): GameState {
  return {
    ...initialState,
    ...state,
    player: validateAndFixPlayer(state?.player),
    techniques: Array.isArray(state?.techniques) ? state.techniques : [],
    inventory: Array.isArray(state?.inventory) ? state.inventory : [],
    spiritStones: typeof state?.spiritStones === "object" && state.spiritStones !== null
      ? {
        low: typeof state.spiritStones.low === "number" ? state.spiritStones.low : 0,
        mid: typeof state.spiritStones.mid === "number" ? state.spiritStones.mid : 0,
        high: typeof state.spiritStones.high === "number" ? state.spiritStones.high : 0,
        supreme: typeof state.spiritStones.supreme === "number" ? state.spiritStones.supreme : 0,
      }
      : { low: 0, mid: 0, high: 0, supreme: 0 },
    reputation: normalizeReputation(state?.reputation),
    beast: normalizeBeast(state?.beast),
    sect: normalizeSectData(state?.sect),
    // 旧档只有情谊，载入时折成关系与信任
    relations: Array.isArray(state?.relations) ? state.relations.map(migrateRelation) : [],
    log: Array.isArray(state?.log) ? state.log : [],
    pillCache: typeof state?.pillCache === "object" && state.pillCache !== null ? state.pillCache : {},
    districtNames: typeof state?.districtNames === "object" && state.districtNames !== null ? state.districtNames : {},
    manors: typeof state?.manors === "object" && state.manors !== null ? state.manors : {},
    markets: typeof state?.markets === "object" && state.markets !== null ? state.markets : {},
    priceAdjusts: Array.isArray(state?.priceAdjusts) ? state.priceAdjusts : [],
    rumors: Array.isArray(state?.rumors) ? state.rumors : [],
    skills: Array.isArray(state?.skills) ? state.skills : [],
    checks: Array.isArray(state?.checks) ? state.checks : [],
    quests: Array.isArray(state?.quests) ? state.quests : [],
    waseShows:
      state?.waseShows && Number.isFinite(Number(state.waseShows.day))
        ? { day: Math.trunc(Number(state.waseShows.day)), count: Math.max(0, Math.trunc(Number(state.waseShows.count) || 0)) }
        : { day: 0, count: 0 },
    pawns: Array.isArray(state?.pawns) ? state.pawns.filter((t) => t && t.item && t.shopId) : [],
    workshops: typeof state?.workshops === "object" && state.workshops !== null ? state.workshops : {},
    villages:
      typeof state?.villages === "object" && state.villages !== null
        ? Object.fromEntries(
            Object.entries(state.villages as Record<string, Village>).map(([k, v]) => [
              k,
              // 旧档没有「已前往」这一项：打听过的，自然是去过的
              { ...v, visited: !!(v?.visited || v?.inquired) },
            ]),
          )
        : {},
    estates: Array.isArray(state?.estates) ? state.estates : [],
    manorPlots: Array.isArray(state?.manorPlots) ? state.manorPlots : [],
    playerShops: Array.isArray(state?.playerShops) ? state.playerShops : [],
    // 宗门之间的交情起初一张白纸，由叙事与新闻添改；旧档没有便空着
    sectRelations: Array.isArray(state?.sectRelations)
      ? state.sectRelations.filter((r) => r && r.id && r.a && r.b)
      : [],
    // 城村的归属同样是后加的；旧档里一处未占
    occupations: Array.isArray(state?.occupations)
      ? state.occupations.filter((o) => o && o.targetId && o.ownerSectId)
      : [],
    lastSectWarDay: Number.isFinite(Number(state?.lastSectWarDay))
      ? Math.max(0, Math.trunc(Number(state.lastSectWarDay)))
      : 0,
    pacts: Array.isArray(state?.pacts) ? state.pacts.filter((p) => p && p.id && p.name) : [],
    // 宗门点位是开局现掷的，旧档里没有这一项便空着，进主界面时再补
    sectSites: Array.isArray(state?.sectSites) ? state.sectSites : [],
    adventures: Array.isArray(state?.adventures) ? state.adventures.filter((a: any) => a && a.id && a.name) : [],
    currentPlaceId: getMarker(state?.currentPlaceId) ? state.currentPlaceId : getDefaultPlaceId(),
    currentSectId: typeof state?.currentSectId === "string" ? state.currentSectId : undefined,
    currentAdventureId: typeof state?.currentAdventureId === "string" ? state.currentAdventureId : undefined,
    mapSceneId: getScene(state?.mapSceneId) ? state.mapSceneId : WORLD_SCENE_ID,
    currentLocation: resolveLocation(state?.currentLocation) ?? "home",
    currentTime: normalizeGameTime(state?.currentTime, OPENING_GAME_TIME),
  };
}

const initialState: GameState = {
  player: {
    ...initialPlayer,
    spiritRoots: [],
    stats: {
      vitality: 50,
      soul: 50,
      wisdom: 50,
      agility: 50,
      heartScores: [],
    },
    meridians: [],
    timeline: [],
    buffs: [],
    shields: [],
    activeHeartTechnique: null,
  },
  techniques: [],
  inventory: [],
  spiritStones: { low: 0, mid: 0, high: 0, supreme: 0 },
  reputation: { ...EMPTY_REPUTATION },
  beast: null,
  talismanRecipes: [],
  alchemyRecipes: [],
  sect: {
    name: "",
    level: 1,
    reputation: 0,
    leader: "",
    elders: 0,
    disciples: 0,
    territory: "",
    contribution: 0,
    appearance: "",
    reputationDesc: "",
    surroundings: "",
    positions: [],
    tasks: [],
    shop: [],
    heritage: [],
    resources: [],
    management: {
      industries: [],
      activities: [],
      halls: [],
      treasury: {
        spiritStones: 0,
        materials: [],
      },
      consumption: {
        dailyCost: 0,
        recentConsumption: [],
      },
    },
  },
  relations: [],
  currentPanel: null,
  craftingTab: "talisman",
  currentPlaceId: getDefaultPlaceId(),
  mapSceneId: WORLD_SCENE_ID,
  currentLocation: "home",
  log: [],
  pillCache: {},
  news: {
    items: [],
    lastUpdate: "",
  },
  currentTime: { ...OPENING_GAME_TIME },
  districtNames: {},
  manors: {},
  markets: {},
  priceAdjusts: [],
  rumors: [],
  skills: [],
  checks: [],
  quests: [],
  waseShows: { day: 0, count: 0 },
  pawns: [],
  workshops: {},
  villages: {},
  estates: [],
  manorPlots: [],
  playerShops: [],
  sectRelations: [],
  occupations: [],
  lastSectWarDay: 0,
  pacts: [],
  sectSites: [],
  adventures: [],
};

/** 门中光景不好时落在弟子头上的那几条，由此标记，好转了便自行撤下 */
const SECT_HARDSHIP_SOURCE = "宗门日结";

/** 门中艰难落下的状态顶多久：三日 */
const SECT_HARDSHIP_HOURS = 36;

/**
 * 给玩家添一条宗门艰难所致的状态；已经有了就续上日子。
 * 只认自己加的那一条，旁处（叙事）落下的同名状态不动。
 */
function withSectDebuff(buffs: Buff[], templateId: string, until: GameTime): Buff[] {
  const tpl = BUFF_TEMPLATES.find((x) => x.id === templateId);
  if (!tpl) return buffs;
  const at = buffs.findIndex((b) => b.id === tpl.id);
  if (at >= 0) {
    const next = buffs.slice();
    next[at] = { ...next[at], durationType: "until", duration: undefined, until, source: SECT_HARDSHIP_SOURCE };
    return next;
  }
  return [...buffs, buffFromTemplate(tpl, { until, source: SECT_HARDSHIP_SOURCE })];
}

/** 把宗门日结加的那一条撤下来；旁处来的同名状态留着 */
function withoutSectDebuff(buffs: Buff[], templateId: string): Buff[] {
  return buffs.filter((b) => !(b.id === templateId && b.source === SECT_HARDSHIP_SOURCE));
}

/**
 * 这一处山门是不是别家的。
 * 本门点位记着 mine；没记着（旧档或开发者到处看）便当是自己的，不作拦阻。
 */
function isForeignSect(state: GameState, sceneId: string): boolean {
  const mine = (state.sectSites ?? []).find((s) => s?.mine);
  if (!mine) return false;
  return sectSceneId(mine.id) !== sceneId;
}

/** 把两份材料单并成一份，同名相加 */
function mergeMaterials(
  base: { name: string; amount: number }[] | undefined,
  add: { name: string; amount: number }[] | undefined,
): { name: string; amount: number }[] {
  const map = new Map<string, number>();
  [...(base ?? []), ...(add ?? [])].forEach((m) => {
    if (!m?.name) return;
    map.set(m.name, (map.get(m.name) ?? 0) + (Number(m.amount) || 0));
  });
  return [...map.entries()].map(([name, amount]) => ({ name, amount }));
}

/** 本门与他门之间记一笔交情；本门还没立起来便不记 */
function makeSectRelation(
  mine: SectSite | undefined,
  other: SectSite,
  stance: SectStance,
  relation: number,
  note: string,
  day: number,
): SectRelation | null {
  if (!mine) return null;
  return normalizeSectRelation({ a: mine.id, b: other.id, stance, relation, note, sinceDay: day }, day);
}

/**
 * 一处宗门被踏破：门下之人在名册上一律成了散修，并各自记下这一桩。
 * 只认名册上「所属」一栏写着这一门名号的；余人不动。
 */
function shatterSectNpcs(
  relations: Relation[],
  sectName: string,
  byName: string,
): { relations: Relation[]; changed: number } {
  const name = String(sectName ?? "").trim();
  if (!name) return { relations, changed: 0 };
  const note = `「${name}」已为${byName}所破，门墙不存，我自此成了一个散修。`;
  let changed = 0;
  const next = (Array.isArray(relations) ? relations : []).map((r) => {
    const aff = String(r?.affiliation ?? "").trim();
    if (!aff || aff === "无" || !aff.includes(name)) return r;
    changed += 1;
    return {
      ...r,
      affiliation: "无",
      memory: `${r.memory ? `${r.memory} ` : ""}${note}`.slice(-400),
    };
  });
  return { relations: changed > 0 ? next : relations, changed };
}

/**
 * 本门山门里能当任务去处的建筑清单。
 * 建筑是照着山门图现排的，故按同一套排布现算一份；同一座只记一条。
 * 去处写成本门名号加建筑名，如「青云宗·炼丹房」，与建筑面板上的写法一致。
 */
function sectTaskBuildings(state: GameState, site: SectSite | undefined): SectTaskBuilding[] {
  if (!site) return [];
  const scene = getScene(sectSceneId(site.id));
  if (!scene) return [];
  const label = state.sect?.name || "本门";
  return sectBuildingRoster(scene).map((b) => ({
    name: b.name,
    kindId: b.kindId,
    sectId: site.id,
    label: `${label}·${b.name}`,
  }));
}

/**
 * 请模型照这一桩差事给钉下的人物各立一份小传（异步一笔）。
 * 姓名、性别、年岁、出身、性情、形貌、修为都交给它，免得出现身份对不上的接头人；
 * 接不上接口、或这一回没识出，便沿用先前现拼的样子，不碍事。
 */
function generateQuestNpcs(questName: string, questDesc: string | undefined, npcs: Relation[]): void {
  const list = (Array.isArray(npcs) ? npcs : []).filter((n) => n?.id && n?.title);
  if (list.length === 0) return;
  void import("@/store/useAIStore")
    .then(({ useAIStore }) =>
      useAIStore.getState().generateTaskNpcs({
        questName,
        questDesc,
        npcs: list.map((n) => ({ id: n.id, title: n.title, gender: n.gender, persona: n.persona })),
      }),
    )
    .catch(() => {});
}

/** 编号化之前用的拼音 slug，只为 v18 迁移而留：把老存档里的所在地平移成编号 */
const LEGACY_PLACE_IDS: Record<string, string> = {
  youji: "1", changan: "2", liangzhou: "3", shuofang: "4", xuzhou: "5",
  jinling: "6", linan: "7", jiangling: "8", chengdu: "9", bianliang: "10",
  fuzhou: "11", panyu: "12", dali: "13", huanglong: "14", liujing: "15",
  kaicheng: "16", liuqiu: "17", pinghu: "18", pinganjing: "19", kangcang: "20",
  shenglong: "21",
};

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      ending: null,
      raiseEnding: (reason) => {
        if (get().ending) return;
        set({ ending: { reason } });
      },

      tickMortality: (hours) => {
        const st = get();
        if (st.ending) return;
        const hp0 = Number(st.player.hp) || 0;
        // 重伤：气血低于两成，时间每推进一个时辰再掉一点
        if (hp0 > 0 && hp0 < 20 && hours > 0) {
          const hp = Math.max(0, hp0 - hours);
          set((s) => ({
            player: { ...s.player, hp },
            log: [`伤重未愈，气血又损 ${hours} 点，只剩 ${hp} 点。`, ...s.log].slice(0, 30),
          }));
        }
        const p = get().player;
        if ((Number(p.hp) || 0) <= 0) {
          get().raiseEnding("气血耗尽，伤重不治，就此殒身。");
        } else if ((Number(p.lifespanCurrent) || 0) <= 0) {
          get().raiseEnding("寿元已尽，灯枯油尽，溘然长逝。");
        }
      },

      sanitizeOpeningLifespan: () =>
        set((st) => {
          const p = st.player;
          const rawMax = Math.trunc(Number(p.lifespanMax));
          // 上限得是个与凡人相称的正常数，认不出或过于离谱就取常例
          const max = Number.isFinite(rawMax) && rawMax >= 10 ? Math.min(rawMax, 5000) : 120;

          const rawAge = Math.trunc(Number(p.age));
          // 年岁报到逼近上限的，也留一成余寿，免得开篇便油尽灯枯
          const ageCap = Math.max(1, max - Math.max(1, Math.round(max * 0.1)));
          const age = Number.isFinite(rawAge) && rawAge > 0 ? Math.min(rawAge, ageCap) : undefined;

          // 报了年岁的，余寿照「上限减年岁」算出来，年岁加余寿正好是上限；
          // 没报年岁的取上限的七成——余寿不再沿用开局那两个 100 的旧值
          const cur = age ? max - age : Math.max(1, Math.round(max * 0.7));

          if (cur === Math.trunc(Number(p.lifespanCurrent)) && max === rawMax && age === p.age) return st;
          return { player: { ...p, age, lifespanMax: max, lifespanCurrent: cur } };
        }),

      setPanel: (panel) => set({ currentPanel: panel }),
      setCraftingTab: (tab) => set({ craftingTab: tab }),

      enterScene: (sceneId) => {
        const scene = getScene(sceneId);
        if (!scene) return;
        const st = get();
        // 已经在这张地图上就不重复记日志
        if (scene.id === st.mapSceneId) return;
        set({
          mapSceneId: scene.id,
          log: [`你踏入了「${scene.name}」。`, ...st.log].slice(0, 30),
        });
        // 进了山门：把搁着的门派事务张出来，开讲的缺勤也一并算过
        if (scene.kind === "sect") {
          get().refreshSectTasks();
          get().settleLecture();
        }
      },

      exitScene: () =>
        set((st) => {
          const parentId = getScene(st.mapSceneId)?.parentId;
          if (!parentId) return st;
          return { mapSceneId: parentId };
        }),

      hereLabel: () => {
        const st = get();
        // 人在山门里，便以那一处山门的名号为准
        const scene = getScene(st.mapSceneId);
        if (scene?.kind === "sect") return scene.name;
        if (scene?.kind === "manor") return scene.name;
        if (st.currentSectId) {
          const site = (st.sectSites || []).find((x) => x.id === st.currentSectId);
          if (site?.name) return site.name;
        }
        // 人正驻在某一处奇遇点位上，便以那一处奇遇的名号为准
        if (st.currentAdventureId) {
          const adv = (st.adventures || []).find((x) => x.id === st.currentAdventureId);
          if (adv?.name) return adv.name;
        }
        return getMarker(st.currentPlaceId)?.name || "";
      },

      devMoveTo: (placeId) => {
        if (placeId.startsWith("sect:")) {
          const sectId = placeId.substring(5);
          const st = get();
          const sectSite = st.sectSites.find((s) => s.id === sectId);
          if (!sectSite) return;
          // 进宗门先把它的山门图注册上，才好点进去看
          registerSectScenes(st.sectSites);
          set({
            currentSectId: sectId,
            mapSceneId: WORLD_SCENE_ID,
            log: [`【开发者】你来到了「${sectSite.name}」。`, ...st.log].slice(0, 30),
          });
          return;
        }
        set((st) => {
          const marker = getMarker(placeId);
          if (!marker) return st;
          if (marker.id === st.currentPlaceId && !st.currentSectId) return { mapSceneId: WORLD_SCENE_ID };
          return {
            currentPlaceId: marker.id,
            currentSectId: undefined,
            currentLocation: "home",
            mapSceneId: WORLD_SCENE_ID,
            log: [`【开发者】你来到了「${marker.name}」。`, ...st.log].slice(0, 30),
          };
        });
      },

      setActiveHeartTechnique: (id) =>
        set((st) => ({
          player: { ...st.player, activeHeartTechnique: id },
          log: [`切换心法为「${st.techniques.find((t) => t.id === id)?.name || "无"}」。`, ...st.log].slice(0, 30),
        })),

      setPlayer: (player) => set({ player }),

      addLog: (msg) =>
        set((s) => ({ log: [msg, ...s.log].slice(0, 30) })),

      updateNews: (newItems) =>
        set((s) => {
          // 每类留最新的几条：主动辑录一期最多 6 条且可能集中于某一侧重，故上限放到 6
          const categoryLimits: Record<string, number> = {
            "官府公告": 6,
            "宗门布告": 6,
            "市井传言": 6,
          };

          let newNews = Array.isArray(s.news.items) ? [...s.news.items] : [];

          newItems.forEach((item) => {
            const newItem = {
              id: `news-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              category: item.category as import("@/data/types").NewsCategory,
              title: item.title,
              content: item.content,
              date: "今日",
              source: item.source,
            };
            newNews = [newItem, ...newNews];
          });

          const grouped = newNews.reduce((acc, item) => {
            if (!acc[item.category]) acc[item.category] = [];
            if (acc[item.category].length < (categoryLimits[item.category] || 3)) {
              acc[item.category].push(item);
            }
            return acc;
          }, {} as Record<string, typeof newNews>);

          // lastUpdate 必须是日期键，runTurn 用它判断当天是否已经生成过新闻；
          // 之前写成「今日」会与日期键永不相等，导致每回合都重刷一份默认新闻。
          const ct = normalizeGameTime(s.currentTime, OPENING_GAME_TIME);

          return {
            news: {
              items: Object.values(grouped).flat(),
              lastUpdate: gameDateKey(ct),
            },
          };
        }),

      addRumors: (items) =>
        set((st) => {
          const day = daySerial(st.currentTime);
          // 话是在哪座城听来的，一并记下；往后叙事也好知道这是哪儿的口风
          const city = getMarker(st.currentPlaceId)?.name ?? "";
          const trimmed = items
            .map((r) => ({
              id: `rumor-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`,
              text: String(r.text ?? "").trim().slice(0, 120),
              source: String(r.source ?? "").trim().slice(0, 40) || "道听途说",
              city: city || undefined,
              day,
            }))
            .filter((r) => r.text);
          if (trimmed.length === 0) return st;
          // 同一天里同一句话不记第二遍；新听来的排在前头，过月的顺手丢掉
          const seen = new Set(aliveRumors(st.rumors, st.currentTime).map((r) => r.text));
          const fresh = trimmed.filter((r) => !seen.has(r.text));
          return {
            rumors: [...fresh, ...aliveRumors(st.rumors, st.currentTime)].slice(0, 60),
          };
        }),

      settleCheck: (id, success) =>
        set((st) => {
          const target = st.checks.find((c) => c.id === id);
          if (!target) return st;
          return {
            checks: st.checks.map((c) =>
              c.id === id ? { ...c, success, pending: undefined, admitted: !success } : c,
            ),
            // 判定过了，这门本事跟着长一截；同一日已经长过的就不再添
            skills: trainOnceADay(st.skills, target.skill, success, target.day, st.checks),
            log: [
              success
                ? `「${target.skill}」这一关，终究还是过了。`
                : `你认下这一回：「${target.skill}」没看出门道。`,
              ...st.log,
            ].slice(0, 30),
          };
        }),

      breakthrough: () => {
        const s = get();
        const nextRealm = REALMS[s.player.realmIndex + 1];
        if (!nextRealm) {
          set((st) => ({ log: ["已臻化境，无可突破。", ...st.log].slice(0, 30) }));
          return;
        }
        if (s.player.cultivation < nextRealm.cultivationNeeded) {
          set((st) => ({
            log: [
              `修为不足，尚需 ${nextRealm.cultivationNeeded - s.player.cultivation} 点方可尝试突破。`,
              ...st.log,
            ].slice(0, 30),
          }));
          return;
        }

        let baseSuccess = 0.5;
        baseSuccess += (s.player.stats.wisdom - 50) * 0.003;

        const meridians = Array.isArray(s.player.meridians) ? s.player.meridians : [];
        const avgMeridianClarity =
          meridians.length > 0 ? meridians.reduce((sum, m) => sum + m.clarity, 0) / meridians.length : 0;
        if (meridians.length > 0) {
          baseSuccess += (avgMeridianClarity - 50) * 0.002;
        }

        const damageCount = meridians.filter((m) => m.damage).length;
        baseSuccess -= damageCount * 0.1;

        const success = Math.random() < Math.min(0.95, Math.max(0.1, baseSuccess));

        if (success) {
          const realmBonus = 100 + s.player.realmIndex * 50;
          set((st) => ({
            player: {
              ...st.player,
              realmIndex: st.player.realmIndex + 1,
              // 冲关要耗去积攒的修为，修为才不会变成一个只看不用的数字
              cultivation: Math.max(0, st.player.cultivation - nextRealm.cultivationNeeded),
              lifespanMax: st.player.lifespanMax + 80,
              hpMax: st.player.hpMax + 150 + realmBonus,
              mpMax: st.player.mpMax + 100 + realmBonus,
              spiritMax: st.player.spiritMax + 50 + realmBonus,
              hp: st.player.hpMax + 150 + realmBonus,
              mp: st.player.mpMax + 100 + realmBonus,
              spirit: st.player.spiritMax + 50 + realmBonus,
            },
            log: [
              `天降甘霖，灵台清明，破入 ${nextRealm.name}${nextRealm.stage}！`,
              ...st.log,
            ].slice(0, 30),
          }));
          // 修为类机缘若正指着这一层，破关之后便算办到
          get().settleRealmQuests();
        } else {
          const damage = 50 + Math.floor(Math.random() * 100);
          set((st) => ({
            player: {
              ...st.player,
              hp: Math.max(1, st.player.hp - damage),
              mp: 0,
              meridians: (Array.isArray(st.player.meridians) ? st.player.meridians : []).map((m) =>
                Math.random() < 0.3 ? { ...m, damage: true, clarity: Math.max(20, m.clarity - 20) } : m,
              ),
            },
            log: ["心魔骤起，突破失败，灵力尽失，气血受创。", ...st.log].slice(0, 30),
          }));
        }
      },

      drawTalisman: (recipe) => {
        const s = get();
        const paper = s.inventory.find((i) => i.name === "黄表符纸");
        const cinnabar = s.inventory.find((i) => i.name === "朱砂");
        if (!paper || paper.count < recipe.paperCost || !cinnabar || cinnabar.count < recipe.cinnabarCost) {
          set((st) => ({ log: ["符纸或朱砂不足，无法画符。", ...st.log].slice(0, 30) }));
          return { success: false, message: "符纸或朱砂不足，无法画符。" };
        }
        if (s.player.mp < recipe.mpCost) {
          set((st) => ({ log: ["灵力不足，难以运笔。", ...st.log].slice(0, 30) }));
          return { success: false, message: "灵力不足，难以运笔。" };
        }
        const success = Math.random() * 100 < recipe.successRate;
        set((st) => {
          const newInventory = (Array.isArray(st.inventory) ? st.inventory : []).map((i) => {
            if (i.name === "黄表符纸") return { ...i, count: i.count - recipe.paperCost };
            if (i.name === "朱砂") return { ...i, count: i.count - recipe.cinnabarCost };
            return i;
          });
          if (success) {
            const existing = newInventory.find((i) => i.name === recipe.name);
            if (existing) {
              return {
                inventory: newInventory.map((i) =>
                  i.name === recipe.name
                    ? { ...i, count: i.count + 1 + (Math.random() < manorBonusOf(s.manorPlots, "锻坊") ? 1 : 0) }
                    : i,
                ),
                player: { ...st.player, mp: Math.max(0, st.player.mp - recipe.mpCost) },
                log: [`笔走龙蛇，灵光乍现，得《${recipe.name}》一道！`, ...st.log].slice(0, 30),
              };
            }
            return {
              inventory: [
                ...newInventory,
                {
                  id: `talisman-${Date.now()}`,
                  name: recipe.name,
                  type: "符箓" as const,
                  grade: recipe.grade,
                  count: 1 + (Math.random() < manorBonusOf(s.manorPlots, "锻坊") ? 1 : 0),
                  icon: "符",
                  desc: recipe.desc,
                },
              ],
              player: { ...st.player, mp: Math.max(0, st.player.mp - recipe.mpCost) },
              log: [`笔走龙蛇，灵光乍现，得《${recipe.name}》一道！`, ...st.log].slice(0, 30),
            };
          }
          return {
            inventory: newInventory,
            player: { ...st.player, mp: Math.max(0, st.player.mp - recipe.mpCost) },
            log: ["画符失败，符纸焦黑，灵力反噬。", ...st.log].slice(0, 30),
          };
        });
        return success
          ? { success: true, message: `画符成功！得《${recipe.name}》一道` }
          : { success: false, message: "画符失败，符纸焦黑，灵力反噬。" };
      },

      brewAlchemy: async (selectedHerbs, fire, duration) => {
        const s = get();
        if (selectedHerbs.length === 0) {
          set((st) => ({ log: ["请先选择药材。", ...st.log].slice(0, 30) }));
          return { success: false, message: "请先选择药材。" };
        }

        const mpCost = 30 + selectedHerbs.reduce((sum, h) => sum + h.count * 10, 0);
        if (s.player.mp < mpCost) {
          set((st) => ({ log: ["灵力不足，难控丹火。", ...st.log].slice(0, 30) }));
          return { success: false, message: "灵力不足，难控丹火。" };
        }

        for (const herb of selectedHerbs) {
          const item = s.inventory.find((i) => i.name === herb.name);
          if (!item || item.count < herb.count) {
            set((st) => ({
              log: [`药引「${herb.name}」不足，无法开炉。`, ...st.log].slice(0, 30),
            }));
            return { success: false, message: `药引「${herb.name}」不足，无法开炉。` };
          }
        }

        const ELEMENTS = ["金", "木", "水", "火", "土", "风", "雷", "冰", "暗"] as const;

        const herbElements: Record<string, number> = {};
        let totalHerbValue = 0;
        for (const herb of selectedHerbs) {
          const item = s.inventory.find((i) => i.name === herb.name);
          if (item?.elements) {
            for (const [elem, val] of Object.entries(item.elements)) {
              herbElements[elem] = (herbElements[elem] || 0) + val * herb.count;
              totalHerbValue += Math.abs(val * herb.count);
            }
          }
        }

        const fireFactor = fire / 100;
        const durFactor = duration / 100;

        const FIRE_BOOST_ELEMS = ["火", "雷"];
        const ICE_BOOST_ELEMS = ["冰", "水"];
        const fireBoost = Math.max(0, (fire - 50) / 50);
        const iceBoost = Math.max(0, (50 - fire) / 50);

        const finalElements: Record<string, number> = {};
        for (const elem of ELEMENTS) {
          const herbVal = herbElements[elem] ?? 0;
          let fireMod = 1;
          if (FIRE_BOOST_ELEMS.includes(elem)) {
            fireMod += fireBoost * 0.5;
          }
          if (ICE_BOOST_ELEMS.includes(elem)) {
            fireMod += iceBoost * 0.5;
            fireMod -= fireBoost * 0.3;
          }
          const rawVal = (herbVal * fireFactor + herbVal * durFactor) * fireMod;
          finalElements[elem] = Math.round(Math.max(-100, Math.min(100, rawVal)));
        }

        let baseSuccessRate = Math.min(95, 40 + totalHerbValue / 5);
        if (fire < 20 || fire > 80) baseSuccessRate *= 0.6;
        if (duration < 10 || duration > 90) baseSuccessRate *= 0.7;
        const success = Math.random() * 100 < baseSuccessRate;

        const sortedHerbs = [...selectedHerbs].sort((a, b) => a.name.localeCompare(b.name));
        const cacheKey = `herbs:${sortedHerbs.map((h) => `${h.name}×${h.count}`).join(",")}|fire:${fire}|dur:${duration}`;
        const cached = s.pillCache[cacheKey];

        let pillName = "无名丹药";
        let pillGrade: import("@/data/types").ItemGrade = "凡品";
        let pillDesc = "一枚不知功效的丹药。";
        let outputCount = 1;
        let shouldCache = false;

        if (success) {
          if (cached) {
            pillName = cached.name;
            pillGrade = cached.grade;
            pillDesc = cached.desc;
            outputCount = cached.outputCount;
          } else {
            shouldCache = true;
            try {
              const { chatWithModel } = await import("@/lib/aiClient");
              const { useAIStore } = await import("@/store/useAIStore");
              const aiSettings = useAIStore.getState().settings;

              if (AI_BACKEND_READY) {
                const herbsText = selectedHerbs.map((h) => `${h.name}×${h.count}`).join(",");
                const elementsText = ELEMENTS.map((e) => `${e}:${finalElements[e]}`).join(",");

                let fireType = "中火";
                if (fire <= 30) fireType = "文火";
                else if (fire >= 70) fireType = "武火";

                const prompt = [
                  {
                    role: "system" as const,
                    content: `你是一位修真界的炼丹大师。根据以下炼丹结果，推演丹药的名称和效果。

输入参数：
- 放入药材：${herbsText}
- 火候：${fire}（${fireType}）
- 时长：${duration}息
- 元素属性值（-100~100）：${elementsText}

火候对丹药效果的影响规则：
- 文火（0-30）：温和、缓慢、调理类效果，适合治疗、恢复、持久增益类丹药
- 中火（30-70）：平衡、标准效果，适合通用增益类丹药
- 武火（70-100）：猛烈、爆发、攻伐类效果，适合伤害、爆发、控制类丹药

元素说明：
金：锐利、坚韧、金属性，适合攻击类丹药
木：生机、恢复、木属性，适合治疗类丹药
水：柔和、流动、水属性，适合灵力恢复类丹药
火：灼热、爆发、火属性，适合伤害类丹药
土：稳固、防御、土属性，适合防御类丹药
风：迅捷、灵动、风属性，适合身法速度类丹药
雷：迅猛、破敌、雷属性，适合爆发攻击类丹药
冰：寒冷、迟缓、冰属性，适合控制类丹药
暗：诡异、隐匿、暗属性，适合特殊效果类丹药

请根据火候类型和元素属性生成：
1. 丹药名称（2-4个字，古风韵味，符合元素特性和火候类型）
2. 丹药效果描述（50-100字，描述服用后的效果，与元素属性和火候类型相符）
3. 丹药品级（从凡品/灵品/玄品/天品/仙品中选择，根据药材品质和元素纯度决定）

格式要求：
NAME: [丹药名称]
GRADE: [品级]
EFFECT: [效果描述]`,
                  },
                ];

                const raw = await chatWithModel(aiSettings, aiSettings.proModel, prompt, {
                  timeoutMs: 30000,
                });

                const nameMatch = raw.match(/NAME:\s*(.+)/);
                const gradeMatch = raw.match(/GRADE:\s*(.+)/);
                const effectMatch = raw.match(/EFFECT:\s*(.+)/);

                if (nameMatch) pillName = nameMatch[1].trim();
                if (gradeMatch) pillGrade = gradeMatch[1].trim() as any;
                if (effectMatch) pillDesc = effectMatch[1].trim();

                const maxElement = Math.max(...Object.values(finalElements).map(Math.abs));
                if (maxElement > 60) outputCount = 1;
                else if (maxElement > 30) outputCount = 2;
                else outputCount = Math.min(3, selectedHerbs.length);
              } else {
                const maxElement = Math.max(...Object.values(finalElements).map(Math.abs));
                if (maxElement > 70) {
                  pillName = "极品灵丹";
                  pillGrade = "灵品";
                  pillDesc = "药力精纯，服之可大幅提升修为。";
                } else if (maxElement > 40) {
                  pillName = "上乘丹药";
                  pillGrade = "凡品";
                  pillDesc = "品质尚佳，略有补益之效。";
                }
                outputCount = Math.min(2, selectedHerbs.length);
              }
            } catch (e) {
              console.error("AI生成丹药失败:", e);
              shouldCache = false;
            }
          }
        }

        // 宅邸里的「丹房」，成丹时或多出一枚
        if (Math.random() < manorBonusOf(get().manorPlots, "丹房")) outputCount += 1;

        let result: BrewResult = { success: false, message: "丹炉轰鸣，丹药化为飞灰，功亏一篑。" };

        set((st) => {
          let newInventory = (Array.isArray(st.inventory) ? st.inventory : []).map((i) => {
            const herb = selectedHerbs.find((h) => h.name === i.name);
            if (herb) return { ...i, count: Math.max(0, i.count - herb.count) };
            return i;
          });

          const newPillCache = { ...st.pillCache };
          if (success && shouldCache) {
            newPillCache[cacheKey] = {
              name: pillName,
              grade: pillGrade,
              desc: pillDesc,
              elements: finalElements,
              outputCount,
            };
          }

          if (success) {
            const existing = newInventory.find((i) => i.name === pillName);
            if (existing) {
              newInventory = newInventory.map((i) =>
                i.name === pillName ? { ...i, count: i.count + outputCount } : i,
              );
            } else {
              newInventory = [
                ...newInventory,
                {
                  id: `pill-${Date.now()}`,
                  name: pillName,
                  type: "丹药" as const,
                  grade: pillGrade,
                  count: outputCount,
                  icon: "丹",
                  desc: pillDesc,
                  elements: finalElements,
                },
              ];
            }
            result = {
              success: true,
              message: `丹成！得「${pillName}」×${outputCount}`,
              pillName,
              pillGrade,
              pillDesc,
              pillElements: finalElements,
              outputCount,
            };
            return {
              inventory: newInventory,
              player: { ...st.player, mp: Math.max(0, st.player.mp - mpCost) },
              log: [`丹成！得「${pillName}」×${outputCount}，${pillDesc.slice(0, 20)}...`, ...st.log].slice(0, 30),
              pillCache: newPillCache,
            };
          }

          return {
            inventory: newInventory,
            player: { ...st.player, mp: Math.max(0, st.player.mp - mpCost) },
            log: ["丹炉轰鸣，丹药化为飞灰，功亏一篑。", ...st.log].slice(0, 30),
          };
        });

        return result;
      },

      acceptTask: (id) => {
        const s = get();
        const task = s.sect.tasks.find((t) => t.id === id);
        if (!task || task.accepted) return;

        const today = daySerial(s.currentTime);
        const days = Math.max(1, Math.trunc(task.days ?? 5));
        const dueDay = today + days;
        const cityId = task.target?.cityId ?? "";
        const districtId = typeof task.target?.districtId === "number" ? task.target.districtId : undefined;
        let label = task.place || task.target?.label || "门中";
        const culture = cityId ? getMarker(cityId)?.culture : undefined;

        // 这一桩的去处舆图上本没有：在本门就近处现开一处奇遇，星标钉在那一处。
        // 开不出来（那一带的点位都被人占满了）便照旧落在街区上，好歹有处可去
        const questId = `quest-${task.id}`;
        let born: Adventure | undefined;
        if (task.spawnAdventure && !task.target?.adventureId) {
          const nearby = pickOrNudgeSpotNear(
            { sectSites: s.sectSites, adventures: s.adventures },
            cityId,
          );
          if (nearby) {
            born =
              normalizeAdventure(
                {
                  name: task.spawnAdventure.name,
                  kind: task.spawnAdventure.kind,
                  summary: task.spawnAdventure.summary,
                  danger: task.spawnAdventure.danger,
                  // 事一了，这一处便随那桩机缘一并撤去
                  questId,
                },
                {
                  state: { sectSites: s.sectSites, adventures: s.adventures },
                  spot: nearby,
                  cityId,
                  day: today,
                  origin: "story",
                },
              ) ?? undefined;
            if (born) label = `${born.name}（${born.kind}）`;
          }
        }

        // 接取时把托付要用的人钉到目标地块上：办到那儿，才寻得着人、交得了差
        const relations = s.relations.map((r) => ({ ...r }));
        const added: Relation[] = [];
        let contact = task.target?.person;
        const cast = Array.isArray(task.cast) ? task.cast : [];
        if (task.target?.building) {
          // 去处是本门某座建筑：人便钉在那座建筑里，进山门到那处才寻得着
          for (const role of cast) {
            added.push({
              ...rollQuestNpc(role, label, cityId, undefined, culture, label),
              fixedUntilDay: dueDay,
            });
          }
          if (added.length > 0) contact = added[0].name;
        } else if (cityId && cast.length > 0) {
          // 去处是城内街区、坊市铺面，或就地现开的奇遇：人照这一处钉下，到了才寻得着
          for (const role of cast) {
            added.push({ ...rollQuestNpc(role, label, cityId, districtId, culture), fixedUntilDay: dueDay });
          }
          contact = added[0].name;
        }

        const target: JobTarget = {
          cityId,
          ...(districtId !== undefined ? { districtId } : {}),
          label,
          person: contact,
          ...(task.target?.sectId ? { sectId: task.target.sectId } : {}),
          ...(task.target?.building ? { building: task.target.building } : {}),
          // 去处是舆图上的一处奇遇：现开的那一处优先，其次是任务原本点名的
          ...(born
            ? { adventureId: born.id }
            : task.target?.adventureId
              ? { adventureId: task.target.adventureId }
              : {}),
          // 去处是坊市里现开的一间铺子：集市面板照这一项临时摆出摊面
          ...(task.target?.shop ? { shop: task.target.shop } : {}),
          ...(task.target?.shopKind ? { shopKind: task.target.shopKind } : {}),
          ...(task.target?.shopDesc ? { shopDesc: task.target.shopDesc } : {}),
        };
        const quest: Quest = {
          id: questId,
          name: task.title,
          desc: task.desc,
          place: label,
          // 宗门派下的差事都是奔着门中某一处去的，算地点类，去处与人已一并钉下
          kind: "地点",
          dueDay,
          giver: s.sect.name || "宗门",
          condition: task.condition || "照宗门所托办妥",
          reward: `记宗门贡献 ${task.contribution}，另赏下品灵石 ${task.spiritStone}`,
          penalty: `误了期，倒扣宗门贡献 ${Math.max(1, Math.round(task.contribution / 2))}`,
          status: "open",
          day: today,
          target,
          sectTask: { taskId: task.id, contribution: task.contribution, spiritStone: task.spiritStone },
        };

        set({
          quests: [...s.quests, quest],
          // 现开的那一处去处一并落在舆图上，星标才点得着
          ...(born
            ? { adventures: [...(Array.isArray(s.adventures) ? s.adventures : []), born] }
            : {}),
          relations: [...relations, ...added],
          sect: {
            ...s.sect,
            tasks: (Array.isArray(s.sect?.tasks) ? s.sect.tasks : []).map((t) =>
              t.id === id ? { ...t, accepted: true, questId: quest.id, dueDay } : t,
            ),
          },
          log: [
            `接下门派任务「${task.title}」，限期 ${days} 日，须往${label}走一趟，交付了才算完。`,
            ...(born ? [`舆图上多了一处去处：${born.name}。`] : []),
            ...s.log,
          ].slice(0, 30),
        });
        // 钉下的人由模型照这桩事立传，替掉先前现拼的名字与出身
        generateQuestNpcs(task.title, task.desc, added);
      },

      refreshSectTasks: (force) => {
        const st = get();
        const tasks = Array.isArray(st.sect?.tasks) ? st.sect.tasks : [];
        // 手头还有未了结的门派事务就不换，除非明说要重掷
        if (!force && tasks.some((t) => t.target && !t.settled)) return;

        const site = st.sectSites.find((s) => s.mine);
        const cityId = nearestCityIdFor(site?.x, site?.y) ?? getCityMarkers()[0]?.id;
        if (!cityId) return;

        const targets = brokerTargetsFor(cityId, st.districtNames, st.relations);
        const buildings = sectTaskBuildings(st, site);
        const next = rollSectTasks(
          targets,
          buildings,
          4,
          // 舆图上现开着的奇遇也能当去处：门中派一桩事，往那处去探个究竟
          (Array.isArray(st.adventures) ? st.adventures : [])
            .filter((a) => a && a.id && a.name)
            .map((a) => ({ id: a.id, name: a.name, kind: a.kind, cityId: a.cityId })),
        );
        if (next.length === 0) return;

        set({
          sect: { ...st.sect, tasks: next },
          log: [`宗门新张出一批事务，共 ${next.length} 桩。`, ...st.log].slice(0, 30),
        });
      },

      attendLecture: (topic) => {
        const st = get();
        if (getScene(st.mapSceneId)?.kind !== "sect") {
          const message = "你不在山门之内，听不着这一场开讲。";
          set({ log: [message, ...st.log].slice(0, 30) });
          return { ok: false, message };
        }
        const today = daySerial(st.currentTime);
        const hour = lectureHour(st.sect);
        if (st.currentTime.hour < hour) {
          const message = `今日开讲在${shichenName(hour)}，时候未到。`;
          set({ log: [message, ...st.log].slice(0, 30) });
          return { ok: false, message };
        }
        if ((st.sect.lastLectureDay ?? 0) === today) {
          const message = "今日已听过一场开讲，再听无益。";
          set({ log: [message, ...st.log].slice(0, 30) });
          return { ok: false, message };
        }

        const subject = topic || "本门心法";
        const isLeader = /掌门/.test(st.player.position || "");
        // 掌门登坛不耗自家修为，讲的是自家体悟；弟子听讲才涨自家那一份
        const realmIdx = leaderRealmIndex({
          sect: st.sect,
          playerName: st.player.name,
          playerPosition: st.player.position,
          playerRealmIndex: st.player.realmIndex,
          relations: st.relations,
        });
        const gain = isLeader ? 0 : lectureGain(realmIdx, st.sect.level);
        const line = isLeader
          ? `你以「${subject}」为题登坛开讲一场，一堂弟子各有心得。`
          : `你听掌门就「${subject}」讲了一场，于道上一通百通，修为 +${gain}。`;
        set({
          player: gain > 0
            ? { ...st.player, cultivation: (Number(st.player.cultivation) || 0) + gain }
            : st.player,
          sect: { ...st.sect, lastLectureDay: today, lectureCheckedDay: today },
          log: [line, ...st.log].slice(0, 30),
        });

        const decision = isLeader
          ? `我以掌门之身登上传法大殿的法坛，以「${subject}」为题开讲一场，座下弟子环坐而听。`
          : `我在传法大殿听掌门以「${subject}」为题讲了一场法，听至会心处，于道上有几分领悟。`;
        return { ok: true, message: line, decision };
      },

      settleLecture: () => {
        const st = get();
        if (getScene(st.mapSceneId)?.kind !== "sect") return;

        const today = daySerial(st.currentTime);
        const hour = lectureHour(st.sect);
        // 今日开讲还没开始，或是今日这一笔账已经算过，都不动
        if (st.currentTime.hour < hour) return;
        if ((st.sect.lectureCheckedDay ?? 0) >= today) return;

        const last = st.sect.lastLectureDay ?? 0;
        // 入门以来头一回进山门，先把日子记上，算是入了门，不算缺勤
        if (last === 0 || last >= today) {
          set({ sect: { ...st.sect, lastLectureDay: last === 0 ? today : last, lectureCheckedDay: today } });
          return;
        }

        const absentDays = today - last;
        if (absentDays > LECTURE_ABSENT_DAYS) {
          const before = Number(st.sect.contribution) || 0;
          const after = Math.max(0, before - LECTURE_ABSENT_PENALTY);
          set({
            sect: { ...st.sect, contribution: after, lectureCheckedDay: today },
            log: [
              `你已 ${absentDays} 日不曾听讲，宗门记你一过，扣贡献 ${before - after}。`,
              ...st.log,
            ].slice(0, 30),
          });
          return;
        }

        set({ sect: { ...st.sect, lectureCheckedDay: today } });
      },

      learnHeritage: (name) => {
        const st = get();
        const heritage = Array.isArray(st.sect?.heritage) ? st.sect.heritage : [];
        const item = heritage.find((h) => h.name === name);
        if (!item || item.status === "已习") return false;

        const lv = positionLevel(st.sect.positions);
        const need = heritageRequirement(item.grade);
        if (lv < need) {
          set({ log: [`身份未到，参悟不了「${name}」这一门。`, ...st.log].slice(0, 30) });
          return false;
        }
        const cost = heritageCost(item.grade);
        const have = Number(st.sect.contribution) || 0;
        if (have < cost) {
          set({ log: [`贡献不足，换不得「${name}」，尚需 ${cost - have} 点。`, ...st.log].slice(0, 30) });
          return false;
        }

        set({
          sect: {
            ...st.sect,
            contribution: have - cost,
            heritage: heritage.map((h) => (h.name === name ? { ...h, status: "已习" as const } : h)),
          },
          log: [`以 ${cost} 贡献参得「${name}」，自此门中又多一门本事。`, ...st.log].slice(0, 30),
        });
        return true;
      },

      preachScripture: (topic) => {
        const st = get();
        if (getScene(st.mapSceneId)?.kind !== "sect") {
          const message = "讲经须在讲经堂前，先回山门再说。";
          set({ log: [message, ...st.log].slice(0, 30) });
          return { ok: false, message };
        }
        const today = daySerial(st.currentTime);
        if ((st.sect.lastPreachDay ?? 0) === today) {
          const message = "今日已讲得一场，再多便絮烦了。";
          set({ log: [message, ...st.log].slice(0, 30) });
          return { ok: false, message };
        }

        const subject = topic || "本门经义";
        const gain = preachReward(positionLevel(st.sect.positions), st.sect.level);
        const line = `你在讲经堂以「${subject}」为题登座讲了一场，门人听得入神，得贡献 ${gain}。`;
        set({
          sect: { ...st.sect, contribution: (Number(st.sect.contribution) || 0) + gain, lastPreachDay: today },
          log: [line, ...st.log].slice(0, 30),
        });

        const decision = `我在讲经堂登座，就「${subject}」讲了一场经，座下门人屏息而听。`;
        return { ok: true, message: line, decision };
      },

      ensureSectEndowment: () => {
        const st = get();
        // 只给一回；门号还没立起来便再等等
        if (st.sect?.endowed) return;
        const bare =
          !st.sect?.name &&
          !st.sect?.leader &&
          !(Number(st.sect?.disciples) || 0) &&
          !(Number(st.sect?.elders) || 0) &&
          (Number(st.sect?.level) || 1) <= 1;
        if (bare) return;

        const grant = initialEndowment({
          level: st.sect.level,
          disciples: st.sect.disciples,
          elders: st.sect.elders,
        });
        const materials = Array.isArray(st.sect.management?.treasury?.materials)
          ? st.sect.management.treasury.materials.map((m) => ({ ...m }))
          : [];
        grant.materials.forEach((g) => {
          const at = materials.findIndex((m) => m.name === g.name);
          if (at >= 0) materials[at] = { ...materials[at], amount: materials[at].amount + g.amount };
          else materials.push({ ...g });
        });

        set({
          sect: {
            ...st.sect,
            endowed: true,
            management: {
              ...st.sect.management,
              treasury: {
                spiritStones: (Number(st.sect.management?.treasury?.spiritStones) || 0) + grant.stones,
                materials,
              },
            },
          },
          log: [`门中清点家底，宝库入账 ${grant.stones} 枚灵石，另有若干日用之物。`, ...st.log].slice(0, 30),
        });
      },

      settleSectSites: () => {
        const st = get();
        const sites = Array.isArray(st.sectSites) ? st.sectSites : [];
        if (sites.length === 0) return;
        const today = daySerial(st.currentTime);
        let changed = false;

        const next = sites.map((site) => {
          // 本门那一本账记在 management.treasury 里，这儿不另开一本
          if (site.mine) return site;

          const book = site.treasury;
          if (!book) {
            // 头一回翻到这一处：先把家底备上，往后照日算
            const grant = initialEndowment({
              level: site.level,
              disciples: site.disciples,
              elders: site.elders,
            });
            changed = true;
            return {
              ...site,
              treasury: { spiritStones: grant.stones, materials: grant.materials, settledDay: today },
            };
          }

          const settled = Number(book.settledDay) || 0;
          if (settled >= today) return site;

          // 隔得久了也只按三十日算，免得一觉醒来凭空涨出一座金山
          const days = Math.max(1, Math.min(30, today - settled));
          const materials = new Map<string, number>();
          (Array.isArray(book.materials) ? book.materials : []).forEach((m) => {
            if (!m?.name) return;
            materials.set(m.name, (materials.get(m.name) ?? 0) + (Number(m.amount) || 0));
          });

          // 一日的进项与支用，都照门中品级与人数估
          const income = site.level * 90 + site.disciples * 5;
          const upkeep = site.level * 50 + site.disciples * 3;
          let stones = (Number(book.spiritStones) || 0) + (income - upkeep) * days;

          const addMaterial = (matName: string, amount: number) => {
            materials.set(matName, Math.max(0, (materials.get(matName) ?? 0) + amount));
          };
          // 自家田里的出产，减去门中吃用
          addMaterial("灵谷", (Math.ceil(site.disciples * 0.3) - Math.ceil(site.disciples * 0.2)) * days);
          addMaterial("蔬菜", (Math.ceil(site.disciples * 0.15) - Math.ceil(site.disciples * 0.1)) * days);
          addMaterial("药材", Math.ceil(site.level * 1.5) * days);

          // 囤着用不上的，照旧发卖换现钱
          materials.forEach((amount, matName) => {
            if (amount <= MATERIAL_SURPLUS_KEEP) return;
            stones += (amount - MATERIAL_SURPLUS_KEEP) * materialPrice(matName);
            materials.set(matName, MATERIAL_SURPLUS_KEEP);
          });

          changed = true;
          return {
            ...site,
            treasury: {
              spiritStones: Math.max(0, Math.round(stones)),
              materials: [...materials.entries()].map(([name, amount]) => ({ name, amount })),
              settledDay: today,
            },
          };
        });

        if (changed) set({ sectSites: next });

        // 附庸按日纳贡，入本门宝库
        const mineSite = sites.find((s) => s.mine);
        const cur = get();
        if (mineSite && (Number(cur.sect.tributeSettledDay) || 0) < today) {
          const tributeSum = next
            .filter((s) => s.vassalOf === mineSite.id)
            .reduce((sum, s) => sum + vassalTribute(s), 0);
          const treasury = cur.sect.management?.treasury ?? { spiritStones: 0, materials: [] };
          set({
            sect: {
              ...cur.sect,
              tributeSettledDay: today,
              management: {
                ...cur.sect.management,
                treasury: {
                  spiritStones: (Number(treasury.spiritStones) || 0) + tributeSum,
                  materials: Array.isArray(treasury.materials) ? treasury.materials : [],
                },
              },
            },
            ...(tributeSum > 0
              ? { log: [`附庸来贡，共入灵石 ${tributeSum}。`, ...cur.log].slice(0, 30) }
              : {}),
          });
        }
      },

      settleAiSectWars: () => {
        const st = get();
        const sites = (Array.isArray(st.sectSites) ? st.sectSites : []).filter((s) => s?.name && !s.mine);
        if (sites.length < 2) return;

        const today = daySerial(st.currentTime);
        // 开局头两日先让人认一认江湖，不急着动兵
        if (today < 2) return;
        // 一日只掷一回；掷不中也算这一日已掷过
        if ((Number(st.lastSectWarDay) || 0) >= today) return;
        set({ lastSectWarDay: today });

        // 各门照自己的风气掷：侵略倾向越高，越容易在这一日启衅
        const aggressor = sites.find(
          (site) =>
            !site.vassalOf &&
            Math.random() < 0.001 + climateAggression(site.climate?.id) * 0.004,
        );
        if (!aggressor) return;

        // 打近处的；同盟、附庸与交情尚好的不动
        const targets = sites.filter((other) => {
          if (other.id === aggressor.id) return false;
          if (other.vassalOf === aggressor.id) return false;
          const rel = findSectRelation(st.sectRelations, aggressor.id, other.id);
          if (rel && (rel.stance === "附庸" || rel.stance === "结盟")) return false;
          if (rel && rel.relation >= 50) return false;
          return true;
        });
        if (targets.length === 0) return;

        const distance = (a: SectSite, b: SectSite) => Math.hypot(a.x - b.x, a.y - b.y);
        targets.sort((a, b) => distance(aggressor, a) - distance(aggressor, b));
        const target = targets[Math.floor(Math.random() * Math.min(3, targets.length))];

        // 强弱照品级、长老、弟子、声望与宝库估，再各带一点战场上的运气
        const power = (site: SectSite) =>
          site.level * 100 +
          (Number(site.elders) || 0) * 40 +
          Math.min(300, Number(site.disciples) || 0) * 2 +
          (Number(site.reputation) || 0) * 3 +
          Math.min(5000, Number(site.treasury?.spiritStones) || 0) / 20;
        const attackerWins =
          power(aggressor) * (0.9 + Math.random() * 0.25) >
          power(target) * (0.9 + Math.random() * 0.2);

        // 两家就此结仇
        const oldRel = findSectRelation(st.sectRelations, aggressor.id, target.id);
        const relation = normalizeSectRelation({
          a: aggressor.id,
          b: target.id,
          stance: "敌对",
          relation: Math.min(Number(oldRel?.relation) || 0, -60),
          note: `${aggressor.name}于第${today}日兴兵来犯${target.name}`,
          sinceDay: oldRel?.sinceDay ?? today,
        });
        const sectRelations = relation
          ? upsertSectRelation(st.sectRelations, relation)
          : st.sectRelations;

        // 胜者从败者手里夺一处城村；败者名下没有，便只记一笔战事
        let occupations = Array.isArray(st.occupations) ? st.occupations : [];
        let seized: Occupation | null = null;
        if (attackerWins) {
          const held = occupations.filter((o) => o.ownerSectId === target.id);
          if (held.length > 0) {
            const taken = held[Math.floor(Math.random() * held.length)];
            seized = {
              ...taken,
              ownerSectId: aggressor.id,
              ownerName: aggressor.name,
              sinceDay: today,
              settledMonth: undefined,
            };
            occupations = occupations.map((o) => (o === taken ? seized! : o));
          }
        }

        const dateLabel = `${st.currentTime.year}年${st.currentTime.month}月${st.currentTime.day}日`;
        const title = attackerWins
          ? `${aggressor.name}兴兵，${target.name}败退`
          : `${aggressor.name}来犯，${target.name}却之`;
        const content = attackerWins
          ? `${dateLabel}，${aggressor.name}以「${aggressor.climate?.name ?? "门户之争"}」为号兴兵犯${target.name}。两家战于山门外，${target.name}不敌${
              seized ? `，${seized.targetName}遂归${aggressor.name}治下` : "，门户受挫"
            }。`
          : `${dateLabel}，${aggressor.name}兴兵犯${target.name}。${target.name}闭门固守，鏖战数日，来犯者无功而返。`;
        const rumorText = `${aggressor.name}${attackerWins ? "攻破" : "来犯未克"}${target.name}${
          seized ? `，夺了${seized.targetName}` : ""
        }。`;

        set({ sectRelations, occupations });
        get().updateNews([{ category: "宗门布告", title, content, source: "江湖快报" }]);
        get().addRumors([{ text: rumorText, source: "江湖传闻" }]);
      },

      settleOccupations: () => {
        const st = get();
        const occs = Array.isArray(st.occupations) ? st.occupations : [];
        if (occs.length === 0) return;
        const monthKey = gameMonthKey(st.currentTime);
        const mineSite = st.sectSites.find((s) => s.mine);

        let playerGain = 0;
        const siteGain = new Map<string, number>();
        let changed = false;
        const next = occs.map((o) => {
          if (!o || o.settledMonth === monthKey) return o;
          changed = true;
          const tribute = occupationTribute(o.kind, o.targetId);
          if (mineSite && o.ownerSectId === mineSite.id) playerGain += tribute;
          else siteGain.set(o.ownerSectId, (siteGain.get(o.ownerSectId) ?? 0) + tribute);
          return { ...o, settledMonth: monthKey };
        });
        if (!changed) return;

        const sectSites = st.sectSites.map((s) => {
          const add = siteGain.get(s.id);
          if (!add) return s;
          const book = s.treasury ?? { spiritStones: 0, materials: [] };
          return { ...s, treasury: { ...book, spiritStones: (Number(book.spiritStones) || 0) + add } };
        });
        const treasury = st.sect.management?.treasury;
        set({
          occupations: next,
          sectSites,
          ...(playerGain > 0 && treasury
            ? {
                sect: {
                  ...st.sect,
                  management: {
                    ...st.sect.management,
                    treasury: {
                      ...treasury,
                      spiritStones: (Number(treasury.spiritStones) || 0) + playerGain,
                    },
                  },
                },
              }
            : {}),
          ...(playerGain > 0
            ? { log: [`各属城村来贡，本门入灵石 ${playerGain}。`, ...st.log].slice(0, 30) }
            : {}),
        });
      },

      settleFacilities: () => {
        // 家底还没给过的先把这一笔补上，免得头一天便无钱可支
        get().ensureSectEndowment();
        const st = get();
        const scene = getScene(st.mapSceneId);
        if (scene?.kind !== "sect") return;
        // 别家的山门不来替你入账，只算本门的
        if (isForeignSect(st, scene.id)) return;

        const today = daySerial(st.currentTime);
        if ((st.sect.facilitySettledDay ?? 0) >= today) return;

        const roster = facilityRoster(scene);
        // 本门自己营造的那几座也一并入账：自拟的照它自己的账，辨认时借同类的贴图
        const mineSite = st.sectSites.find((s) => s.mine);
        const customBook = mineSite?.custom ?? {};
        Object.entries(mineSite?.built ?? {}).forEach(([key, name]) => {
          const spec = sectBuildingSpec(name, customBook[name]?.kindId);
          const cellIndex = Number(key);
          if (!spec || !Number.isInteger(cellIndex)) return;
          roster.push({
            cellIndex,
            kindId: spec.kind,
            kindName: getSectTileKind(sectTileCode(spec.kind)).name,
            name,
          });
        });
        if (roster.length === 0) return;

        const halls = st.sect.management?.halls;
        const treasury = st.sect.management?.treasury;
        // 宝库里现有的东西，按名目归拢
        const materials = new Map<string, number>();
        (Array.isArray(treasury?.materials) ? treasury!.materials : []).forEach((m) => {
          if (!m?.name) return;
          materials.set(m.name, (materials.get(m.name) ?? 0) + (Number(m.amount) || 0));
        });

        let stones = Number(treasury?.spiritStones) || 0;
        let reputation = Number(st.sect.reputation) || 0;
        let upkeepTotal = 0;

        // 门中眼下生效的修正（政策、态势一类的时效）：产出按倍率折算，到期的顺手抹去
        const liveMods = (st.sect.modifiers ?? []).filter((m) => Number(m.until) >= today);
        const expiredMods = (st.sect.modifiers ?? []).filter((m) => Number(m.until) < today);
        const modEff = activeModifierEffects(liveMods);

        for (const item of roster) {
          const state = facilityStateOf(st.sect.facilities, item.name);
          const custom = customBook[item.name];
          const y = facilityYield({
            name: item.name,
            kindId: item.kindId,
            level: state.level,
            status: state.status,
            hasSteward: !!facilitySteward(halls, item.kindId),
            nature: scene.sectNature,
            isFeature: scene.sectFeature === item.name,
            custom,
          });
          y.materials.forEach((m) =>
            materials.set(m.name, (materials.get(m.name) ?? 0) + Math.round(m.amount * modEff.resourceMul)),
          );
          stones += Math.round(y.stone * modEff.resourceMul);
          reputation += y.reputation;
          upkeepTotal += facilityUpkeep(item.name, item.kindId, state.level, custom);
        }
        // 修正带来的声望增减，按这一日算一笔
        reputation += modEff.reputationPerDay;

        stones = Math.max(0, stones - upkeepTotal);

        // 门中弟子每日耗灵谷与蔬菜；不够吃，人心就要散
        const disciples = Math.max(0, Number(st.sect.disciples) || 0);
        const grainNeed = Math.ceil(disciples * 0.2);
        const vegNeed = Math.ceil(disciples * 0.1);
        const grain = materials.get("灵谷") ?? 0;
        const veg = materials.get("蔬菜") ?? 0;
        const hungry = grain < grainNeed || veg < vegNeed;
        materials.set("灵谷", Math.max(0, grain - grainNeed));
        materials.set("蔬菜", Math.max(0, veg - vegNeed));

        // 囤着用不上的料，趁日结发卖换现钱；各料留够底数，余下的才卖
        let sold = 0;
        materials.forEach((amount, matName) => {
          if (amount <= MATERIAL_SURPLUS_KEEP) return;
          const extra = amount - MATERIAL_SURPLUS_KEEP;
          materials.set(matName, MATERIAL_SURPLUS_KEEP);
          sold += extra * materialPrice(matName);
        });
        stones += sold;

        // 门中光景不好，落在弟子头上的两条：银钱不继、庖厨断绝
        const broke = stones < upkeepTotal * 3;
        const until = shiftGameTime(st.currentTime, SECT_HARDSHIP_HOURS);
        let buffs = Array.isArray(st.player.buffs) ? st.player.buffs : [];
        buffs = broke ? withSectDebuff(buffs, "debuff-sect-broke", until) : withoutSectDebuff(buffs, "debuff-sect-broke");
        buffs = hungry ? withSectDebuff(buffs, "debuff-hunger", until) : withoutSectDebuff(buffs, "debuff-hunger");

        // 年久失修：旧的一处或自行修好，或又添一处待修
        const facilities = { ...(st.sect.facilities ?? {}) };
        for (const item of roster) {
          const state = facilityStateOf(facilities, item.name);
          if (state.status === "修缮中" && Math.random() < 0.6) {
            facilities[item.name] = { ...state, status: "正常" };
          } else if (state.status === "正常" && Math.random() < 0.05) {
            facilities[item.name] = { ...state, status: "修缮中" };
          }
        }

        const nextMaterials = [...materials.entries()].map(([name, amount]) => ({ name, amount }));
        const recent = [
          ...(Array.isArray(st.sect.management?.consumption?.recentConsumption)
            ? st.sect.management!.consumption.recentConsumption
            : []),
          { date: `${st.currentTime.month}/${st.currentTime.day}`, cost: upkeepTotal },
        ].slice(-7);

        const settleLines = [
          `宗门日结：各处进项入宝库，维护与伙食共耗 ${upkeepTotal} 灵石。`,
        ];
        if (sold > 0) settleLines.push(`余料发卖，得灵石 ${sold}。`);
        if (hungry) settleLines.push("灵谷与蔬菜不足，弟子面有饥色，一个个提不起劲。");
        if (broke) settleLines.push("宝库见底，门中银钱不继，人心浮动。");
        if (liveMods.length > 0) settleLines.push(`门中正行：${liveMods.map((m) => m.name).join("、")}。`);
        if (expiredMods.length > 0) settleLines.push(`「${expiredMods.map((m) => m.name).join("、")}」的势已过。`);

        set({
          player: buffs === st.player.buffs ? st.player : { ...st.player, buffs },
          sect: {
            ...st.sect,
            reputation,
            facilities,
            modifiers: liveMods,
            facilitySettledDay: today,
            management: {
              ...st.sect.management,
              treasury: { spiritStones: stones, materials: nextMaterials },
              consumption: { dailyCost: upkeepTotal, recentConsumption: recent },
            },
          },
          log: [...settleLines, ...st.log].slice(0, 30),
        });
      },

      upgradeFacility: (name, kindId) => {
        const st = get();
        const scene = getScene(st.mapSceneId);
        if (scene?.kind !== "sect") {
          set({ log: ["修缮之门不在眼前，先回山门再说。", ...st.log].slice(0, 30) });
          return false;
        }
        if (isForeignSect(st, scene.id)) {
          set({ log: ["这是别家的山门，轮不到你来做主。", ...st.log].slice(0, 30) });
          return false;
        }
        // 权限：执事以上才动得了土木，且宗门等级要撑得住这一级
        if (positionLevel(st.sect.positions) < 2) {
          set({ log: ["此事须由执事以上的人做主，你的身份还差着一层。", ...st.log].slice(0, 30) });
          return false;
        }
        const state = facilityStateOf(st.sect.facilities, name);
        if (state.level >= FACILITY_LEVEL_CAP) {
          set({ log: [`「${name}」已到顶，再无可升。`, ...st.log].slice(0, 30) });
          return false;
        }
        if (state.level + 1 > (Number(st.sect.level) || 1)) {
          set({ log: ["宗门品级不足，撑不起这一处更大的场面，先壮大宗门再说。", ...st.log].slice(0, 30) });
          return false;
        }

        const cost = upgradeCost({
          name,
          kindId,
          level: state.level,
          nature: scene.sectNature,
          custom: st.sectSites.find((s) => s.mine)?.custom?.[name],
        });
        const treasury = st.sect.management?.treasury;
        const stones = Number(treasury?.spiritStones) || 0;
        const stock = Array.isArray(treasury?.materials) ? treasury!.materials : [];
        const lack = cost.materials.find((m) => (stock.find((x) => x.name === m.name)?.amount ?? 0) < m.amount);
        if (stones < cost.stones || lack) {
          set({
            log: [
              lack
                ? `宝库里「${lack.name}」不足，修缮不得。`
                : `宝库灵石不足，尚需 ${Math.max(0, cost.stones - stones)} 枚。`,
              ...st.log,
            ].slice(0, 30),
          });
          return false;
        }

        const nextMaterials = stock.map((m) => {
          const need = cost.materials.find((c) => c.name === m.name);
          return need ? { ...m, amount: Math.max(0, m.amount - need.amount) } : m;
        });

        set({
          sect: {
            ...st.sect,
            facilities: { ...(st.sect.facilities ?? {}), [name]: { ...state, level: state.level + 1 } },
            management: {
              ...st.sect.management,
              treasury: { spiritStones: stones - cost.stones, materials: nextMaterials },
            },
          },
          log: [
            `你调集灵石与材料，把「${name}」修葺扩建成 Lv.${state.level + 1}。`,
            ...st.log,
          ].slice(0, 30),
        });
        return true;
      },

      buildSectFacility: (cellIndex, name, custom) => {
        const st = get();
        const scene = getScene(st.mapSceneId);
        if (scene?.kind !== "sect") return { ok: false, message: "你不在山门之内，动不了这里的土木。" };
        if (isForeignSect(st, scene.id)) return { ok: false, message: "这是别家的山门，轮不到你来做主。" };
        // 权限：长老以上才起得了楼
        if (!isElderOrAbove(st.sect.positions)) {
          return { ok: false, message: "营造之事须由长老以上的人主持，你的身份还差着一层。" };
        }

        const idx = Math.trunc(Number(cellIndex));
        if (!Number.isInteger(idx) || idx < 0 || idx >= SECT_TILE_COUNT) {
          return { ok: false, message: "这一处不在地界之内。" };
        }
        // 只能在荒地上起楼：水域、山地与已有建筑的格子一概不动
        const layout = applySectFeatureBias(scene.tiles ?? [], scene.sectNature, scene.sectFeature);
        if (layout[idx] !== SECT_EMPTY_TILE) {
          return { ok: false, message: "此处或临水、或依山、或已立着屋舍，起不得楼。" };
        }

        const site = st.sectSites.find((s) => s.mine);
        if (!site) return { ok: false, message: "你还没有本门的山门。" };
        const built = { ...(site.built ?? {}) };
        if (built[String(idx)]) return { ok: false, message: "这一处已经起过楼了。" };

        // 玩家口述的那一座：照它自己的账；名录里的：按名录挑
        const own = custom ? clampCustomFacility(custom, name) : null;
        if (custom && !own) return { ok: false, message: "这一座的账目立不起来，且先改一改再说。" };

        let cost: { stones: number; materials: { name: string; amount: number }[] };
        if (own) {
          cost = own.cost;
        } else {
          const option = buildOptions({ sectLevel: st.sect.level, nature: scene.sectNature }).find(
            (o) => o.name === name,
          );
          if (!option) return { ok: false, message: "名录里没有这一座建筑。" };
          if (!option.unlocked) {
            return { ok: false, message: `营造「${name}」须宗门至少 ${option.minSectLevel} 级，眼下还撑不起。` };
          }
          cost = option.cost;
        }

        const treasury = st.sect.management?.treasury;
        const stones = Number(treasury?.spiritStones) || 0;
        const stock = Array.isArray(treasury?.materials) ? treasury!.materials : [];
        const lack = cost.materials.find(
          (m) => (stock.find((x) => x.name === m.name)?.amount ?? 0) < m.amount,
        );
        if (stones < cost.stones || lack) {
          return {
            ok: false,
            message: lack
              ? `宝库里「${lack.name}」不足，营造不得。`
              : `宝库灵石不足，尚需 ${Math.max(0, cost.stones - stones)} 枚。`,
          };
        }

        const nextMaterials = stock.map((m) => {
          const need = cost.materials.find((c) => c.name === m.name);
          return need ? { ...m, amount: Math.max(0, m.amount - need.amount) } : m;
        });
        built[String(idx)] = name;
        // 自拟的那一座，连同它那一份账一并记在山门名下，日后入账、铺图都认得出
        const nextSite = own
          ? { ...site, built, custom: { ...(site.custom ?? {}), [name]: own } }
          : { ...site, built };

        set({
          sectSites: st.sectSites.map((s) => (s.id === site.id ? nextSite : s)),
          sect: {
            ...st.sect,
            management: {
              ...st.sect.management,
              treasury: { spiritStones: stones - cost.stones, materials: nextMaterials },
            },
          },
          log: [`你调集灵石与材料，在山门空地上新起了「${name}」。`, ...st.log].slice(0, 30),
        });
        return { ok: true, message: `「${name}」已立在山门里。` };
      },

      performFacilityAction: (name, kindId, actionId, option) => {
        const st = get();
        const scene = getScene(st.mapSceneId);
        if (scene?.kind !== "sect") return { ok: false, message: "你不在山门之内，做不得这一桩。" };
        if (isForeignSect(st, scene.id)) return { ok: false, message: "这是别家的山门，你在这里做不得主。" };

        const custom = st.sectSites.find((s) => s.mine)?.custom?.[name];
        const action = facilityActions(name, kindId, custom).find((a) => a.id === actionId);
        if (!action) return { ok: false, message: "门中没有这一桩。" };

        const lv = positionLevel(st.sect.positions);
        if ((action.need ?? 1) > lv) {
          const message = `身份未到，做不得「${action.name}」。`;
          set({ log: [message, ...st.log].slice(0, 30) });
          return { ok: false, message };
        }

        const today = daySerial(st.currentTime);
        const key = `${name}:${actionId}`;
        const daily = st.sect.facilityDaily ?? {};
        if (action.daily && daily[key] === today) {
          const message = `今日已在「${name}」做过这一桩，明日再来。`;
          set({ log: [message, ...st.log].slice(0, 30) });
          return { ok: false, message };
        }

        // 一桩事总要先说清做什么：参数没挑就不动手，免得又成一按即成的勾当
        if (!option) return { ok: false, message: `先定下「${action.optionLabel}」再说。` };
        const optionLabel = action.options?.find((o) => o.value === option)?.label ?? option;
        const markDone = { ...daily, [key]: today };

        // 主殿开讲与讲经堂讲经另有一套账，借既有的那两处走
        if (actionId === "lecture") {
          const r = get().attendLecture(optionLabel);
          if (r.ok) set((s) => ({ sect: { ...s.sect, facilityDaily: { ...(s.sect.facilityDaily ?? {}), [key]: today } } }));
          return { ok: r.ok, message: r.message, decision: r.decision };
        }
        if (actionId === "preach") {
          const r = get().preachScripture(optionLabel);
          if (r.ok) set((s) => ({ sect: { ...s.sect, facilityDaily: { ...(s.sect.facilityDaily ?? {}), [key]: today } } }));
          return { ok: r.ok, message: r.message, decision: r.decision };
        }

        // 炼丹、画符与比试交给各自的模块去办，这里只记下今日已做过
        if (action.mode === "craft" || action.mode === "battle") {
          set({
            sect: { ...st.sect, facilityDaily: markDone },
            log: [`你在「${name}」${action.name}。`, ...st.log].slice(0, 30),
          });
          return { ok: true, message: `你去${name}${action.name}。` };
        }

        const state = facilityStateOf(st.sect.facilities, name);
        const treasury = st.sect.management?.treasury;
        const stock = Array.isArray(treasury?.materials) ? treasury!.materials.map((m) => ({ ...m })) : [];
        const stones = Number(treasury?.spiritStones) || 0;
        const addMaterial = (matName: string, amount: number) => {
          const at = stock.findIndex((m) => m.name === matName);
          if (at >= 0) stock[at] = { ...stock[at], amount: stock[at].amount + amount };
          else stock.push({ name: matName, amount });
        };
        // 时长类的选项，值就是时辰数
        const hours = /^\d+$/.test(option) ? Math.max(0, Number(option)) : 0;
        // 门中这一处按等级与管事折出来的日产，劳作多照它算
        const baseY = facilityYield({
          name,
          kindId,
          level: state.level,
          status: state.status,
          hasSteward: !!facilitySteward(st.sect.management?.halls, kindId),
          nature: scene.sectNature,
          isFeature: scene.sectFeature === name,
        });

        let player = st.player;
        let beast = st.beast;
        let techniques = Array.isArray(st.techniques) ? st.techniques : [];
        let heritage = Array.isArray(st.sect.heritage) ? st.sect.heritage : [];
        let contribution = Number(st.sect.contribution) || 0;
        let reputation = Number(st.sect.reputation) || 0;
        let spent = 0;
        let line = "";
        /** 这一桩做不成时的说法；有它便不落账 */
        let denied: string | undefined;

        const gainCultivation = (n: number) => {
          player = { ...player, cultivation: (Number(player.cultivation) || 0) + n };
        };
        /**
         * 修炼一段时辰：进度记在功法上，境界进度随功法进度一同长。
         * 这是「练功即长修为」那条规矩，本地与叙事两头都照它办。
         */
        const trainTechnique = (hours: number): { gain: number; name: string; eff: { mul: number; note: string } } => {
          const eff = localCultivationFrom({
            facilities: st.sect?.facilities,
            location: st.currentLocation,
          });
          // 自家宅邸里的「聚灵」之屋，把这一处的修炼效率再抬一抬
          const manorSpirit = manorBonusOf(st.manorPlots, "聚灵");
          const gain = cultivationGain(hours, eff.mul * (1 + manorSpirit));
          if (gain <= 0) return { gain: 0, name: "", eff };
          // 有主修心法便修心法，没有就修最先习得的那一门
          const list = Array.isArray(techniques) ? techniques : [];
          const idx = list.findIndex((t) => t.id === player.activeHeartTechnique);
          const at = idx >= 0 ? idx : list.length > 0 ? 0 : -1;
          if (at < 0) {
            // 手里一门功法也没有，进益便直接记在境界上
            gainCultivation(gain);
            return { gain, name: "", eff };
          }
          const target = list[at];
          const max = Number(target.proficiencyMax) || 100;
          const before = Number(target.proficiency) || 0;
          const after = Math.min(max, before + gain);
          const real = after - before;
          techniques = list.map((t, i) => (i === at ? { ...t, proficiency: after } : t));
          gainCultivation(real);
          return { gain: real, name: target.name || "", eff };
        };
        /** 疗伤：泡得够久便全复，短的只回几成；上限照临时状态压过的那一道算 */
        const mend = (full: boolean) => {
          const maxHp = effectiveHpMax(player);
          player = {
            ...player,
            hp: full ? maxHp : Math.min(maxHp, Math.round(player.hp + maxHp * 0.3)),
            mp: full ? player.mpMax : Math.min(player.mpMax, Math.round(player.mp + player.mpMax * 0.3)),
          };
        };

        switch (actionId) {
          // —— 主殿：议一议事 ——
          case "council": {
            gainCultivation(3);
            spent = 3;
            line = `你与长老执事就「${optionLabel}」议了半日，事情理出眉目，自己也有所得，修为 +3。`;
            break;
          }

          // —— 经阁：参传承、抄书 ——
          case "study": {
            const item = heritage.find((h) => h.name === option);
            if (!item) {
              denied = "阁中并无这一门。";
              break;
            }
            if (item.status === "已习") {
              denied = `「${item.name}」你已经参过了。`;
              break;
            }
            const need = heritageRequirement(item.grade);
            if (lv < need) {
              denied = `参「${item.name}」须身份 ${need} 级，你还差着一层。`;
              break;
            }
            const cost = heritageCost(item.grade);
            if (contribution < cost) {
              denied = `参「${item.name}」要 ${cost} 点贡献，尚缺 ${cost - contribution} 点。`;
              break;
            }
            contribution -= cost;
            heritage = heritage.map((h) => (h.name === item.name ? { ...h, status: "已习" as const } : h));
            spent = 2;
            line = `你以 ${cost} 贡献参得「${item.name}」，自此门中又多一门本事。`;
            break;
          }
          case "copy": {
            const isPaper = option === "符纸";
            addMaterial(isPaper ? "符纸" : "书卷", 3);
            spent = 2;
            line = isPaper ? "你在案前裁纸抄录，得符纸 3。" : "你伏案抄了三卷，收进经阁。";
            break;
          }

          // —— 演武：操练 ——
          case "drill": {
            // 操练一场三个时辰，约合三点修为；兵器上手难些，多给一点
            const gain = option === "兵刃" ? 4 : 3;
            gainCultivation(gain);
            spent = 3;
            line = `你在${name}练了一场${optionLabel}，筋骨与手法都熟了几分，修为 +${gain}。`;
            break;
          }

          // —— 锻器：打铁、挖矿 ——
          case "forgework": {
            if (option === "兵刃") {
              addMaterial("兵器", 1);
              addMaterial("熟铁", 2);
            } else if (option === "器物") {
              addMaterial("矿石", 2);
              addMaterial("熟铁", 1);
            } else {
              addMaterial("熟铁", 3);
            }
            spent = 4;
            line = `你在${name}生火打了一场${optionLabel}，出一件实打实的东西，送进宝库。`;
            break;
          }
          case "mine": {
            const ore = baseY.materials[0]?.name ?? "矿石";
            const amount = Math.max(1, hours * 2);
            addMaterial(ore, amount);
            contribution += 2 * hours;
            spent = hours;
            line = `你在${name}挖了${optionLabel}，得${ore} ${amount}，宗门记你贡献 +${2 * hours}。`;
            break;
          }

          // —— 灵脉与灵田：修炼或劳作，做多久算多久 ——
          case "meditate": {
            // 照本处的修炼效率算：每时辰一点，灵脉与洞府各有加成
            const r = trainTechnique(hours);
            spent = hours;
            line = r.gain > 0
              ? `你在${name}静坐了${optionLabel}，${r.name ? `「${r.name}」` : ""}进度 +${r.gain}（此地修炼效率 ×${r.eff.mul}，${r.eff.note}），境界进度随之同涨。`
              : `你在${name}静坐了${optionLabel}，只是这一门已修到尽头，进益有限。`;
            break;
          }
          case "labor": {
            const mat = baseY.materials[0]?.name ?? "灵谷";
            const amount = Math.max(1, hours);
            addMaterial(mat, amount);
            contribution += 2 * hours;
            spent = hours;
            line = `你在${name}劳作${optionLabel}，得${mat} ${amount}，宗门记你贡献 +${2 * hours}。`;
            break;
          }
          // —— 丹房：浸体、养蛊、配给 ——
          case "soak": {
            // 药力浸体也算修炼，照本处的效率走
            const eff = localCultivationFrom({
              facilities: st.sect?.facilities,
              location: st.currentLocation,
            });
            const gain = cultivationGain(hours, eff.mul);
            gainCultivation(gain);
            if (hours >= 3) mend(true);
            spent = hours;
            line = `你以药力浸体${optionLabel}，血气翻涌一场，修为 +${gain}。`;
            break;
          }
          case "raise": {
            addMaterial("蛊虫", 1);
            spent = 3;
            line = `你以${optionLabel}照看窟里的蛊虫，养得一头合用，蛊虫 +1。`;
            break;
          }
          case "ration": {
            contribution += 2;
            spent = 2;
            line = `你把库中的丹药清点了一遍，${optionLabel}，众人称便，贡献 +2。`;
            break;
          }

          // —— 灵苑：喂兽、牵兽 ——
          case "feed": {
            if (beast) {
              beast = { ...beast, bond: Math.min(100, beast.bond + 4) };
              line = `你亲手喂了一回，${optionLabel}，「${beast.name}」凑过来蹭你，亲疏 +4。`;
            } else {
              line = `你到栏前看了一回，${optionLabel}，只是身上并无随身的灵兽，喂了也无处交托。`;
            }
            spent = 1;
            break;
          }
          case "tame": {
            addMaterial("兽材", 1);
            gainCultivation(2);
            spent = 2;
            line = `你牵一头${optionLabel}出来试脚力，跑得尽兴，得兽材一件，修为 +2。`;
            break;
          }

          // —— 阵法：巡阵、占卜、祭祀、传功 ——
          case "ward": {
            contribution += 2;
            reputation += 1;
            spent = 2;
            line = `你把${optionLabel}的阵眼逐一理过，护山之势更稳，贡献 +2、声望 +1。`;
            break;
          }
          case "divine": {
            contribution += 3;
            spent = 1;
            line = `你就着阵势问了${optionLabel}一卦，得些启示，贡献 +3。`;
            break;
          }
          case "rite": {
            contribution += 2;
            reputation += 2;
            spent = 3;
            line = `你在${name}击鼓${optionLabel}，鼓声传出十里，门人齐聚，贡献 +2、声望 +2。`;
            break;
          }
          case "transmit": {
            gainCultivation(3);
            spent = 2;
            line = `你在${name}就「${optionLabel}」点了门下弟子一回，自己于道上也更清楚，修为 +3。`;
            break;
          }

          // —— 居所：歇息、用饭、待客、走访 ——
          case "rest": {
            spent = hours;
            mend(hours >= 6);
            line = `你回房睡了过去，一觉${optionLabel}，醒来日子已往前走了。`;
            break;
          }
          case "feast": {
            const grain = stock.find((m) => m.name === "灵谷");
            if (grain) grain.amount = Math.max(0, grain.amount - 2);
            reputation += 2;
            spent = 2;
            line = `你在${name}与门人同席，${optionLabel}，宾主尽欢，声望 +2。`;
            break;
          }
          case "receive": {
            reputation += 1;
            spent = 2;
            line = `你在${name}${optionLabel}，来客受了礼数，门中的名声又厚一分，声望 +1。`;
            break;
          }
          case "visit": {
            contribution += 2;
            spent = 2;
            line = `你各处走了一走，${optionLabel}的闲话听了满耳，心里有数，贡献 +2。`;
            break;
          }

          // —— 零星几桩 ——
          case "rubbing": {
            addMaterial("书卷", 2);
            contribution += 1;
            spent = 2;
            line = `你拓下${optionLabel}，得书卷 2，贡献 +1。`;
            break;
          }
          case "repair": {
            addMaterial("兵器", 1);
            spent = 2;
            line = "你把门中的旧兵器收拾一番，修出可用的一件。";
            break;
          }
          default: {
            denied = "这一桩还没个做法。";
          }
        }

        if (denied) {
          set({ log: [denied, ...st.log].slice(0, 30) });
          return { ok: false, message: denied };
        }

        set({
          player,
          beast,
          techniques,
          sect: {
            ...st.sect,
            contribution,
            reputation,
            heritage,
            facilityDaily: markDone,
            management: {
              ...st.sect.management,
              treasury: { spiritStones: stones, materials: stock },
            },
          },
          log: [line, ...st.log].slice(0, 30),
        });
        // 这一桩花去或跳过的时辰，照实往前推
        if (spent > 0) get().advanceTime(spent);

        const decision = facilityDecision({
          building: name,
          kindName: getSectTileKind(sectTileCode(kindId)).name,
          action,
          optionLabel,
          playerName: st.player.name,
          playerPosition: st.player.position,
          sectName: st.sect.name,
        });
        return { ok: true, message: line, decision };
      },

      promote: (id) => {
        const s = get();
        const pos = s.sect.positions.find((p) => p.id === id);
        if (!pos || pos.unlocked) return;
        // 只能往上领职，不能主动降级：已是此一档或更高，便不再往下走
        const lv = positionLevel(s.sect.positions);
        if ((Number(pos.level) || 1) <= lv) {
          const seat = (Array.isArray(s.sect?.positions) ? s.sect.positions : []).find((p) => p.isCurrent);
          const held = seat?.name || s.player?.position || "现任";
          set((st) => ({
            log: [`你已位列「${held}」，不必再领「${pos.name}」这一职。`, ...st.log].slice(0, 30),
          }));
          return;
        }
        if (s.sect.contribution < pos.contributionNeeded) {
          set((st) => ({
            log: [
              `贡献不足，尚需 ${pos.contributionNeeded - s.sect.contribution} 点方可晋升「${pos.name}」。`,
              ...st.log,
            ].slice(0, 30),
          }));
          return;
        }
        set((st) => ({
          sect: {
            ...st.sect,
            contribution: (st.sect?.contribution || 0) - pos.contributionNeeded,
            positions: (Array.isArray(st.sect?.positions) ? st.sect.positions : []).map((p) => ({
              ...p,
              unlocked: p.level <= pos.level ? true : p.unlocked,
              isCurrent: p.id === id ? true : p.isCurrent ? false : p.isCurrent,
            })),
          },
          player: { ...st.player, position: pos.name },
          log: [`功德圆满，晋升为「${pos.name}」！`, ...st.log].slice(0, 30),
        }));
      },

      buyShop: (id) => {
        const s = get();
        const item = s.sect.shop.find((i) => i.id === id);
        if (!item) return;
        if (s.sect.contribution < item.cost) {
          set((st) => ({
            log: [`贡献不足，无法兑换「${item.name}」。`, ...st.log].slice(0, 30),
          }));
          return;
        }

        // 商店条目只有名称与类型，入库时补足物品系统需要的字段
        const name = item.name || "无名之物";
        const typeText = `${item.type || ""}${name}`;
        const invType: InventoryItem["type"] =
          /内丹|药引|药材|灵草|朱砂|符纸/.test(typeText) ? "材料"
            : /丹/.test(typeText) ? "丹药"
              : /符|箓/.test(typeText) ? "符箓"
                : /剑|刀|盾|甲|珠|镜|器|宝|佩/.test(typeText) ? "法宝"
                  : /草|芝|花|叶|石|砂|精|矿|木/.test(typeText) ? "材料"
                    : "杂物";

        set((st) => {
          const inventory = Array.isArray(st.inventory) ? st.inventory : [];
          const existing = inventory.find((i) => i.name === name);
          const nextInventory = existing
            ? inventory.map((i) => (i.name === name ? { ...i, count: i.count + 1 } : i))
            : [
              ...inventory,
              normalizeItemElements({
                id: `shop-${Date.now()}`,
                name,
                type: invType,
                grade: "凡品" as const,
                count: 1,
                icon: name.charAt(0) || "宝",
                desc: item.desc || `以 ${item.cost} 贡献自宗门兑换所得。`,
              }),
            ];
          return {
            sect: { ...st.sect, contribution: st.sect.contribution - item.cost },
            inventory: nextInventory,
            log: [`以 ${item.cost} 贡献兑换得「${name}」×1。`, ...st.log].slice(0, 30),
          };
        });
      },

      donateStonesToSect: (stones) => {
        const st = get();
        const want = Math.max(0, Math.trunc(Number(stones) || 0));
        // 只收整份，零头留着
        const gain = Math.floor(want / STONES_PER_CONTRIBUTION_IN);
        const spend = gain * STONES_PER_CONTRIBUTION_IN;
        // 下品不够时，自动从中品往上兑下来
        const paid = spendLowStones(st.spiritStones, spend);
        if (gain <= 0 || !paid) return 0;
        set((s) => ({
          spiritStones: paid,
          sect: { ...s.sect, contribution: (Number(s.sect.contribution) || 0) + gain },
          log: [`你向门中上交 ${spend} 下品灵石，记贡献 ${gain} 点。`, ...s.log].slice(0, 30),
        }));
        return gain;
      },

      donateItemToSect: (itemName, count = 1) => {
        const st = get();
        const item = (st.inventory ?? []).find((i) => i.name === itemName);
        if (!item) return 0;
        const n = Math.max(1, Math.min(Math.trunc(Number(count) || 1), Math.trunc(Number(item.count) || 0)));
        if (n <= 0) return 0;
        const gain = contributionForItem(item.grade) * n;
        set((s) => ({
          inventory: (s.inventory ?? [])
            .map((i) => (i.name === itemName ? { ...i, count: (Number(i.count) || 0) - n } : i))
            .filter((i) => (Number(i.count) || 0) > 0),
          sect: { ...s.sect, contribution: (Number(s.sect.contribution) || 0) + gain },
          log: [`你向门中上交「${itemName}」×${n}，记贡献 ${gain} 点。`, ...s.log].slice(0, 30),
        }));
        return gain;
      },

      redeemContributionForStones: (contribution) => {
        const st = get();
        if (!isInnerDiscipleOrAbove(st.player.position, st.sect.positions)) return 0;
        const want = Math.max(0, Math.trunc(Number(contribution) || 0));
        const use = Math.min(want, Math.max(0, Math.trunc(Number(st.sect.contribution) || 0)));
        if (use <= 0) return 0;
        const stones = use * STONES_PER_CONTRIBUTION_OUT;
        set((s) => ({
          sect: { ...s.sect, contribution: (Number(s.sect.contribution) || 0) - use },
          spiritStones: { ...s.spiritStones, low: (Number(s.spiritStones.low) || 0) + stones },
          log: [`你以 ${use} 点贡献，自门中领了 ${stones} 下品灵石。`, ...s.log].slice(0, 30),
        }));
        return stones;
      },

      setTraveling: (relationId, traveling) => {
        const st = get();
        const rel = st.relations.find((r) => r.id === relationId);
        if (!rel) return false;
        // 人不在近前便邀不动：同行得先与他在一处，隔着两地没法一道走
        if (traveling && !isNpcAround(rel, { placeId: st.currentPlaceId, placeName: st.hereLabel() })) {
          set((s2) => ({
            log: [`「${rel.name}」不在近前，须先与他在一处，才好邀他同行。`, ...s2.log].slice(0, 30),
          }));
          return false;
        }
        // 仇敌不与之同行；人数也有个数，太多人一路走不像话
        if (traveling && (rel.type === "enemy" || travelingCount(st.relations) >= MAX_TRAVEL_COMPANIONS)) {
          return false;
        }
        if (rel.traveling === traveling) return false;

        set({
          relations: st.relations.map((r) => (r.id === relationId ? { ...r, traveling } : r)),
          log: [
            traveling ? `「${rel.name}」与你结伴同行。` : `「${rel.name}」与你作别，各走各的路。`,
            ...st.log,
          ].slice(0, 30),
        });
        return true;
      },

      checkSkill: ({ skill, dc, context }) => {
        const st = get();
        const named = String(skill ?? "").trim().slice(0, 8);
        if (!named) return null;

        const matched = findSkill(st.skills, named);
        const name = matched?.name ?? named;
        const check = rollSkillCheck({
          asked: named,
          skill: matched,
          dc,
          context,
          day: daySerial(st.currentTime),
          failedBefore: st.checks.some((c) => c.skill === name && !c.success),
        });

        set({
          checks: [...st.checks, check].slice(-20),
          // 同一日内同一门只长一次，反复考同一门磨不出长进
          skills: trainOnceADay(st.skills, name, check.success, check.day, st.checks),
          log: [
            `考较「${name}」：掷 ${check.roll} + Lv.${check.level} = ${check.total}，难度 ${check.dc}，${
              check.success ? "过了" : "没过"
            }。`,
            ...st.log,
          ].slice(0, 30),
        });
        return check;
      },

      settleQuest: ({ name, status }) => {
        const st = get();
        // 名字照最贴近的那一桩认：先认全同，再认包含，取名字最长的，免得认错邻家的事
        const target = pickOpenQuest(st.quests, name);
        if (!target) return false;

        // 成与不成由 AI 判，本地只照单落账；日子过没过只是到期结算另算

        // 人物物品型：交差时行囊里真得有那件东西，取走才算交到人手上；
        // 东西不在，这桩交付便不算数，机缘照旧开着
        let inventory = Array.isArray(st.inventory) ? st.inventory : [];
        if (status === "done" && target.kind === "人物物品" && target.itemGoal) {
          const left = takeItemsByName(inventory, target.itemGoal.name, target.itemGoal.count);
          if (!left) return false;
          inventory = left;
        }
        // 捎信捎物一类的事了结，手里那件东西一并销去
        if (target.carryItemId) inventory = inventory.filter((i) => i.id !== target.carryItemId);

        // 为这桩事现开的那一处去处，事一了便撤去；原本就在舆图上的去处不归它管
        const questAdventure = (Array.isArray(st.adventures) ? st.adventures : []).find(
          (a) => a.questId === target.id,
        );
        const adventures = questAdventure
          ? st.adventures.filter((a) => a.id !== questAdventure.id)
          : st.adventures;
        const currentAdventureId =
          questAdventure && st.currentAdventureId === questAdventure.id ? undefined : st.currentAdventureId;

        // 牙行揽下的差事：交上了也只算办成，赏还押在柜上，得他自己回去领
        if (status === "done" && target.broker) {
          const held = holdRewardOutcome(target);
          set({
            adventures,
            currentAdventureId,
            // 交出去的那件东西已从行囊里销去
            inventory,
            quests: st.quests.map((q) =>
              q.id === target.id
                ? { ...q, status: "done", settledDay: daySerial(st.currentTime), claimed: false, outcome: held }
                : q,
            ),
            log: [`「${target.name}」${held}`, ...st.log].slice(0, 30),
          });
          return true;
        }

        // 照单落账：酬谢或责罚都兑成实数，不留作一时的状态
        const player = { ...st.player };
        const spiritStones = { ...st.spiritStones };
        const reputation = { ...st.reputation };
        const sect = { ...st.sect };
        const relations = st.relations.map((r) => ({ ...r }));
        const outcome = applyQuestLedger({ player, spiritStones, reputation, sect, relations, now: st.currentTime }, target, status);

        // 门派任务的去向也在任务板上更新：办成的标作已了，误期的只算翻过这一页
        if (target.sectTask) {
          const taskId = target.sectTask.taskId;
          // 交差或误期都算翻过这一页；成败由机缘留下的状态区分
          sect.tasks = (Array.isArray(sect.tasks) ? sect.tasks : []).map((t) =>
            t.id === taskId ? { ...t, settled: true } : t,
          );
        }

        set({
          player,
          spiritStones,
          reputation,
          sect,
          relations,
          adventures,
          currentAdventureId,
          // 捎信捎物一类的事了结，手里那件东西一并销去
          inventory,
          quests: st.quests.map((q) =>
            q.id === target.id
              ? { ...q, status, settledDay: daySerial(st.currentTime), outcome }
              : q,
          ),
          log: [`「${target.name}」${outcome}`, ...st.log].slice(0, 30),
        });
        return true;
      },

      settleRealmQuests: () => {
        const st = get();
        // 修到了那一层，事便算办到；照常走 settleQuest 落账，赏罚一并结清
        const reached = (Array.isArray(st.quests) ? st.quests : []).filter((q) =>
          questRealmGoalMet(q, st.player.realmIndex),
        );
        for (const quest of reached) {
          get().settleQuest({ name: quest.id, status: "done" });
        }
      },

      settleAssetQuests: () => {
        const st = get();
        // 行囊里凑齐了那一样东西、或折合下品灵石够了数，这桩事便算办到
        const reached = (Array.isArray(st.quests) ? st.quests : []).filter((q) =>
          questAssetGoalMet(q, { inventory: st.inventory, spiritStones: st.spiritStones }),
        );
        for (const quest of reached) {
          get().settleQuest({ name: quest.id, status: "done" });
        }
      },

      expireQuests: () => {
        const st = get();
        const today = daySerial(st.currentTime);
        const overdue = st.quests.filter((q) => isQuestOverdue(q, today));
        if (overdue.length === 0) return;

        // 一次把到期的都算清：各罚各的，最后只写一次档
        const player = { ...st.player };
        const spiritStones = { ...st.spiritStones };
        const reputation = { ...st.reputation };
        const sect = { ...st.sect };
        const relations = st.relations.map((r) => ({ ...r }));
        const ledger = { player, spiritStones, reputation, sect, relations, now: st.currentTime };

        const outcomes = new Map<string, string>();
        const failedTaskIds = new Set<string>();
        for (const quest of overdue) {
          outcomes.set(quest.id, applyQuestLedger(ledger, quest, "failed"));
          if (quest.sectTask) failedTaskIds.add(quest.sectTask.taskId);
        }
        // 误了期的门派事务，任务板上也翻过这一页
        if (failedTaskIds.size > 0) {
          sect.tasks = (Array.isArray(sect.tasks) ? sect.tasks : []).map((t) =>
            failedTaskIds.has(t.id) ? { ...t, settled: true } : t,
          );
        }

        // 这些事一了，替它们现开的去处也一并撤去
        const failedIds = new Set(overdue.map((q) => q.id));
        // 捎信捎物一类的事误了期，手里那件东西也一并销去
        const carryIds = new Set(
          overdue.map((q) => q.carryItemId).filter((id): id is string => !!id),
        );
        const inventory =
          carryIds.size > 0 ? st.inventory.filter((i) => !carryIds.has(i.id)) : st.inventory;
        const goneAdventures = new Set(
          (Array.isArray(st.adventures) ? st.adventures : [])
            .filter((a) => a.questId && failedIds.has(a.questId))
            .map((a) => a.id),
        );
        const adventures = (Array.isArray(st.adventures) ? st.adventures : []).filter(
          (a) => !goneAdventures.has(a.id),
        );
        const currentAdventureId =
          st.currentAdventureId && goneAdventures.has(st.currentAdventureId) ? undefined : st.currentAdventureId;

        set({
          player,
          spiritStones,
          reputation,
          sect,
          relations,
          adventures,
          currentAdventureId,
          inventory,
          quests: st.quests.map((q) =>
            outcomes.has(q.id) ? { ...q, status: "failed", settledDay: today, outcome: outcomes.get(q.id)! } : q,
          ),
          log: [...overdue.map((q) => `「${q.name}」误了期。${outcomes.get(q.id)}`), ...st.log].slice(0, 30),
        });
      },

      addAdventure: (adventure) => {
        const st = get();
        const list = Array.isArray(st.adventures) ? st.adventures : [];
        if (!adventure || list.some((a) => a.id === adventure.id)) return;
        set({
          adventures: [...list, adventure],
          log: [`舆图上多了一处去处：${adventure.name}。`, ...st.log].slice(0, 30),
        });
      },

      settleAdventure: (id, keep) => {
        const st = get();
        const list = Array.isArray(st.adventures) ? st.adventures : [];
        const target = list.find((a) => a.id === id);
        if (!target) return;
        const next = keep
          ? list.map((a) => (a.id === id ? { ...a, status: "done" as const, persistent: true } : a))
          : list.filter((a) => a.id !== id);
        set({
          adventures: next,
          // 人还站在原地，但那处已经没了，便不再算驻在奇遇点位上
          currentAdventureId: !keep && st.currentAdventureId === id ? undefined : st.currentAdventureId,
          log: [`「${target.name}」这一处${keep ? "暂且搁下，日后再来" : "就此了结，不复再提"}。`, ...st.log].slice(0, 30),
        });
      },

      arriveAtAdventure: (id) => {
        const st = get();
        const adv = (Array.isArray(st.adventures) ? st.adventures : []).find((a) => a.id === id);
        if (!adv) return;
        // 该奇遇归在哪一城，就把脚下钉到那一城的标点；认不出便沿用原处
        const point = getMarker(adv.cityId);
        set({
          currentAdventureId: id,
          currentSectId: undefined,
          currentPlaceId: point ? adv.cityId : st.currentPlaceId,
          currentLocation: "outdoor",
          mapSceneId: WORLD_SCENE_ID,
          log: [`你行至「${adv.name}」所在的那一处地头。`, ...st.log].slice(0, 30),
        });
      },

      patchAdventure: (id, patch) => {
        const st = get();
        const list = Array.isArray(st.adventures) ? st.adventures : [];
        if (!list.some((a) => a.id === id)) return;
        set({ adventures: list.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
      },

      removeAdventure: (id) => {
        const st = get();
        const list = Array.isArray(st.adventures) ? st.adventures : [];
        const target = list.find((a) => a.id === id);
        if (!target) return;
        set({
          adventures: list.filter((a) => a.id !== id),
          currentAdventureId: st.currentAdventureId === id ? undefined : st.currentAdventureId,
          log: [`「${target.name}」这一处已从舆图上抹去。`, ...st.log].slice(0, 30),
        });
      },

      patchRelations: (updates) => {
        const st = get();
        const list = (Array.isArray(updates) ? updates : []).filter(
          (u) => u?.id && u?.patch && Object.keys(u.patch).length > 0,
        );
        if (list.length === 0) return;
        const byId = new Map(list.map((u) => [u.id, u.patch]));
        // 旧名 → 新名，供机缘里指向接头人的那一栏一并改过来
        const oldNames = new Map<string, string>();
        const relations = st.relations.map((r) => {
          const patch = byId.get(r.id);
          if (!patch) return r;
          const nextName = typeof patch.name === "string" && patch.name ? patch.name : r.name;
          if (nextName !== r.name && r.name) oldNames.set(r.name, nextName);
          const merged = { ...r, ...patch, name: nextName } as Relation;
          // 出身、性情、形貌换过了，那句「某某的某职。形貌，性情，出身。」也要跟着重写
          if (patch.appearance || patch.personality || patch.origin) {
            const where = merged.metAt ? `${merged.metAt}的` : "";
            const bits = [merged.appearance, merged.personality, merged.origin].filter(Boolean).join("，");
            if (bits) merged.note = `${where}${merged.title}。${bits}。`;
          }
          return merged;
        });
        const quests =
          oldNames.size === 0
            ? st.quests
            : st.quests.map((q) => {
                const person = q.target?.person;
                if (!person || !oldNames.has(person)) return q;
                return { ...q, target: { ...q.target!, person: oldNames.get(person)! } };
              });
        set({ relations, quests });
      },

      recordPlay: ({ skillId, gain, newSkill }) => {
        const st = get();
        const today = daySerial(st.currentTime);
        // 隔了日子就把场次从头算，今日这算是第一场
        const shown = showsToday(st.waseShows, today);
        let skills = skillId
          ? st.skills.map((s) => (s.id === skillId ? trainSkill(s, gain) : s))
          : st.skills;
        // 偶尔听出一门新本事来；同名的已经有了就不再添
        if (newSkill && !skills.some((s) => s.name === newSkill.name)) {
          skills = [...skills, newSkill];
        }
        set({
          waseShows: { day: today, count: shown + 1 },
          skills,
        });
      },

      tameBeast: (itemId) => {
        const st = get();
        const item = st.inventory.find((i) => i.id === itemId);
        if (!item) return false;
        const beast = beastFromItem(item);
        // 收作随身之后就不再算行囊里的一件东西了；
        // 同一格摞着几头的，只牵走一头，余下的仍留在行囊里
        const inventory =
          item.count > 1
            ? st.inventory.map((i) => (i.id === itemId ? { ...i, count: i.count - 1 } : i))
            : st.inventory.filter((i) => i.id !== itemId);
        set({
          beast,
          inventory,
          log: [
            st.beast
              ? `你放走了「${st.beast.name}」，转而把「${beast.name}」带在身边。`
              : `你把「${beast.name}」带在了身边，它${beast.temper}。`,
            ...st.log,
          ].slice(0, 30),
        });
        return true;
      },

      releaseBeast: () => {
        const st = get();
        if (!st.beast) return;
        set({
          beast: null,
          log: [`你放「${st.beast.name}」归山去了。`, ...st.log].slice(0, 30),
        });
      },

      rollSectSites: () => {
        const sites = rollSectSites();
        registerSectScenes(sites);
        set({ sectSites: sites });
      },

      ensureSectSites: () => {
        // 一处都没有（旧档，或那会儿地图还没读进来）就先掷一遍
        if (get().sectSites.length === 0) {
          const sites = rollSectSites();
          registerSectScenes(sites);
          set({ sectSites: sites });
        }

        let st = get();
        // 逐处把山门图注册上，进主界面时补齐，点得进每一处宗门
        registerSectScenes(st.sectSites);

        // 玩家报过宗门名号的以那条为准；「整段开局」这类没有填表的路子，
        // 宗门是开篇由 AI 写进 sect.name 的，玩家身上那一栏还空着，这里补认一手，
        // 否则本门在地图上无从认领，看着就像「入了宗门却不见山门」
        const declared = playerSectName(st.player.sectName);
        const name = declared || playerSectName(st.sect?.name);
        if (name) {
          if (!declared) {
            // 把开篇定下的宗门口径记回玩家身上，顶栏等处才显示得对
            set((s) => ({ player: { ...s.player, sectName: name } }));
            st = get();
          }
          // 玩家在哪一带，就在哪一带认下一处作本门；本门的底子取自开局 AI 生成的宗门信息
          const claimed = claimPlayerSect(
            st.sectSites,
            name,
            st.sect,
            getMarker(st.currentPlaceId)?.culture,
          );
          if (claimed !== st.sectSites) {
            set({
              sectSites: claimed,
              log: [`「${name}」在舆图上有了落点。`, ...st.log].slice(0, 30),
            });
            st = get();
          }
        }

        // 认下的那一处，把它的底子交给本门：开局状态给的那几个数、山门气象与四类词条。
        // 叙事里已写下数目的便不再改，只把缺的词条补上。
        const mine = st.sectSites.find((s) => s.mine);
        if (!mine) return;
        const s = st.sect;
        const lacksNumbers =
          (Number(s.level) || 1) <= 1 &&
          !(Number(s.reputation) || 0) &&
          !(Number(s.elders) || 0) &&
          !(Number(s.disciples) || 0);
        const patch: Partial<typeof s> = {};
        if (!s.name) patch.name = mine.name;
        if (!s.territory) patch.territory = mine.seat;
        if (!s.nature) patch.nature = { ...mine.nature };
        if (!s.climate) patch.climate = { ...mine.climate };
        if (!s.feature) patch.feature = { ...mine.feature };
        if (!s.start) patch.start = { ...mine.start };
        if (lacksNumbers) {
          patch.level = mine.level;
          patch.reputation = mine.reputation;
          patch.elders = mine.elders;
          patch.disciples = mine.disciples;
          patch.appearance = s.appearance || mine.appearance;
          patch.reputationDesc = s.reputationDesc || mine.reputationDesc;
          patch.surroundings = s.surroundings || mine.surroundings;
        }
        if (Object.keys(patch).length > 0) set({ sect: { ...s, ...patch } });
        // 门中立住了，顺带把玩家的身份对上职位树
        get().alignPlayerPosition();
      },

      foundSect: (input) => {
        const st = get();
        // 已是一派之主便不必再立门户
        if (st.sectSites.some((s) => s.mine) || playerSectName(st.sect?.name || st.player.sectName)) {
          return { ok: false, message: "你已是一派之主，不必再立门户。" };
        }
        const cost = SECT_FOUND_STONE_COST;
        // 下品不够时，自动从中品往上兑下来
        const paid = spendLowStones(st.spiritStones, cost);
        if (!paid) {
          return { ok: false, message: `开山立派须下品灵石 ${cost}，眼下的灵石兑尽了也不够。` };
        }
        const site = buildFoundingSite(input, st.sectSites);
        if (!site) {
          return { ok: false, message: "这一处立不得：名号已有人用，或这一处不是空地。" };
        }

        const sites = [...st.sectSites, site];
        // 山门图当场注册，立完便进得去
        registerSectScenes(sites);
        set({
          spiritStones: paid,
          sectSites: sites,
          sect: {
            ...st.sect,
            name: site.name,
            level: site.level,
            reputation: site.reputation,
            leader: st.player.name || "你",
            elders: site.elders,
            disciples: site.disciples,
            territory: site.seat,
            contribution: 0,
            appearance: site.appearance,
            reputationDesc: site.reputationDesc,
            surroundings: site.surroundings,
            nature: { ...site.nature },
            climate: { ...site.climate },
            feature: { ...site.feature },
            start: { ...site.start },
            positions: foundingPositions(),
            tasks: [],
            shop: [],
            heritage: [],
            resources: [],
            management: {
              ...st.sect.management,
              treasury: { spiritStones: 0, materials: [] },
              consumption: { dailyCost: 0, recentConsumption: [] },
            },
            // 新立之门只有主殿一处，尚未动土兴建，日结也还没算过
            facilities: {},
            facilityDaily: {},
            facilitySettledDay: 0,
            modifiers: [],
          },
          player: { ...st.player, sectName: site.name, position: "掌门" },
          log: [`你在${site.seat}立起「${site.name}」，自此自成一派。`, ...st.log].slice(0, 30),
        });
        get().alignPlayerPosition();
        return { ok: true, message: `「${site.name}」已在${site.seat}立起，你便是开山掌门。` };
      },

      resolveSectWar: ({ targetId, targetKind = "sect", choice }) => {
        const st = get();
        const day = daySerial(st.currentTime);
        const monthKey = gameMonthKey(st.currentTime);
        const logLine = (line: string) => [line, ...st.log].slice(0, 30);
        const mineSite = st.sectSites.find((s) => s.mine);

        // ---- 打的是城或村：只有掠夺与占领两路 ----
        if (targetKind === "city" || targetKind === "village") {
          if (!targetId) return { ok: false, message: "对不上这一处的所在。" };
          const targetName =
            targetKind === "city"
              ? getMarker(targetId)?.name ?? targetId
              : st.villages?.[targetId]?.name ?? targetId;
          const book = ownerOf(st.occupations, targetKind, targetId);
          if (choice === "占领") {
            if (!mineSite) return { ok: false, message: "你还没有本门，占不得地方。" };
            if (book?.ownerSectId === mineSite.id) {
              return { ok: false, message: `「${targetName}」已在你的名下。` };
            }
            const occ: Occupation = {
              kind: targetKind,
              targetId,
              targetName,
              ownerSectId: mineSite.id,
              ownerName: mineSite.name,
              sinceDay: day,
              // 占下的这一月不另收，自下月起算
              settledMonth: monthKey,
            };
            set({
              occupations: upsertOccupation(st.occupations, occ),
              // 夺人所占，两家的交情便结了梁子
              sectRelations: book
                ? (() => {
                    const r = makeSectRelation(
                      mineSite,
                      { id: book.ownerSectId, name: book.ownerName } as SectSite,
                      "敌对",
                      -60,
                      `${targetName}易主，两家自此交恶。`,
                      day,
                    );
                    return r ? upsertSectRelation(st.sectRelations, r) : st.sectRelations;
                  })()
                : st.sectRelations,
              log: logLine(
                `你占了${targetKind === "city" ? "城" : "村"}「${targetName}」，自此按月纳贡。`,
              ),
            });
            return { ok: true, message: `「${targetName}」已归本门治下。` };
          }
          if (choice === "掠夺") {
            const takeStones = occupationTribute(targetKind, targetId) * 3;
            const treasury = st.sect.management?.treasury;
            // 有本门便入本门宝库，没有便记在自家身上
            if (mineSite && treasury) {
              set({
                sect: {
                  ...st.sect,
                  management: {
                    ...st.sect.management,
                    treasury: {
                      spiritStones: (Number(treasury.spiritStones) || 0) + takeStones,
                      materials: Array.isArray(treasury.materials) ? treasury.materials : [],
                    },
                  },
                },
                log: logLine(`你纵兵劫掠「${targetName}」，得灵石 ${takeStones}。`),
              });
            } else {
              set({
                spiritStones: { ...st.spiritStones, low: (Number(st.spiritStones.low) || 0) + takeStones },
                log: logLine(`你劫掠「${targetName}」，得灵石 ${takeStones}。`),
              });
            }
            return { ok: true, message: `掠得「${targetName}」，灵石 ${takeStones} 入袋。` };
          }
          return { ok: false, message: "这一处只能掠夺或占领。" };
        }

        const target = st.sectSites.find((s) => s.id === targetId);
        if (!target) return { ok: false, message: "这一处宗门已不在舆图上。" };
        if (target.mine) return { ok: false, message: "本门之事，另有处置。" };
        const mine = mineSite;

        if (choice === "掠夺") {
          // 尽夺其府库：灵石并入本门宝库，余料也一并卷走
          const book = target.treasury;
          const heldStones = Math.max(0, Number(book?.spiritStones) || 0);
          const heldMaterials = Array.isArray(book?.materials)
            ? book!.materials.map((m) => ({ ...m }))
            : [];
          // 库里空着便照其实力估一笔，免得白打一场
          const takeStones = heldStones > 0
            ? heldStones
            : Math.round((Number(target.level) || 1) * 120 + (Number(target.disciples) || 0) * 6 + 80);
          const treasury = st.sect.management?.treasury ?? { spiritStones: 0, materials: [] };
          const rel = makeSectRelation(mine, target, "敌对", -80, "一场恶战，本门破其山门，尽掠府库。", day);
          set({
            sect: {
              ...st.sect,
              management: {
                ...st.sect.management,
                treasury: {
                  spiritStones: (Number(treasury.spiritStones) || 0) + takeStones,
                  materials: mergeMaterials(treasury.materials, heldMaterials),
                },
              },
            },
            sectSites: st.sectSites.map((s) =>
              s.id === target.id
                ? {
                    ...s,
                    reputation: Math.max(0, (Number(s.reputation) || 0) - 30),
                    treasury: { spiritStones: 0, materials: [] },
                  }
                : s,
            ),
            sectRelations: rel ? upsertSectRelation(st.sectRelations, rel) : st.sectRelations,
            log: logLine(`你破了「${target.name}」的山门，尽掠其宝库，得灵石 ${takeStones}。`),
          });
          return { ok: true, message: `掠得「${target.name}」府库，灵石 ${takeStones} 入本门。` };
        }

        if (choice === "附庸") {
          if (!mine) return { ok: false, message: "你还没有本门，纳不得附庸。" };
          const rel = makeSectRelation(mine, target, "附庸", 40, `${target.name}俯首称臣，岁岁来贡。`, day);
          set({
            sectSites: st.sectSites.map((s) =>
              s.id === target.id
                ? { ...s, vassalOf: mine.id, reputation: Math.max(0, (Number(s.reputation) || 0) - 15) }
                : s,
            ),
            sectRelations: rel ? upsertSectRelation(st.sectRelations, rel) : st.sectRelations,
            log: logLine(`「${target.name}」俯首称臣，自今而后为本门附庸，按日纳贡。`),
          });
          return { ok: true, message: `「${target.name}」已为本门附庸。` };
        }

        // 摧毁：删去这一处宗门，门下之人流落为散修，各自记下这一桩
        const shattered = shatterSectNpcs(st.relations, target.name, st.sect.name || "本门");
        set({
          sectSites: st.sectSites.filter((s) => s.id !== target.id),
          sectRelations: st.sectRelations.filter((r) => r.a !== target.id && r.b !== target.id),
          // 门墙既倒，它名下的城村也一并脱籍
          occupations: (st.occupations ?? []).filter((o) => o?.ownerSectId !== target.id),
          relations: shattered.relations,
          log: logLine(
            `你踏破「${target.name}」，门墙自此不存；其门下${shattered.changed > 0 ? ` ${shattered.changed} 人` : "之人"}流落江湖，成了散修。`,
          ),
        });
        return { ok: true, message: `「${target.name}」已自舆图上抹去。` };
      },

      alignPlayerPosition: () => {
        const st = get();
        const positions = Array.isArray(st.sect?.positions) ? st.sect.positions : [];
        if (positions.length === 0) return;

        const current = String(st.player?.position || "").trim();
        const playerName = String(st.player?.name || "").trim();
        const leaderName = String(st.sect?.leader || "").trim();
        // 一门之主是谁，只认这一条：宗门数据里的掌门之名与玩家自己对得上。
        // 立宗、开篇自述、禅位都写在这个字段里，故它是唯一凭据；
        // 对得上便是掌门，职位树里没这一格也得补上——领头的身份不该被职位表吞掉
        const ownsSect =
          !!leaderName && (leaderName === "你" || (!!playerName && leaderName === playerName));
        if (ownsSect) {
          const seat = positions.find((p) => p?.name === "掌门");
          if (current === "掌门" && seat?.isCurrent && leaderName !== "你") return;
          const next = seat
            ? positions.map((p) => ({ ...p, isCurrent: p.name === "掌门" }))
            : [
                {
                  id: "leader",
                  name: "掌门",
                  level: positions.reduce((max, p) => Math.max(max, Number(p.level) || 1), 4) + 1,
                  contributionNeeded: 0,
                  privilege: "执掌本门，总理诸事。",
                  isCurrent: true,
                  unlocked: true,
                },
                ...positions.map((p) => ({ ...p, isCurrent: false })),
              ];
          set({
            player: { ...st.player, position: "掌门" },
            sect: { ...st.sect, leader: leaderName === "你" ? st.player.name || "你" : leaderName, positions: next },
          });
          return;
        }

        const match = current
          ? positions.find(
              (p) => p?.name && (p.name === current || p.name.includes(current) || current.includes(p.name)),
            )
          : undefined;
        // 对不上名目便落在最低一级，总好过卡在门外
        const lowest = positions.reduce(
          (min, p) => ((Number(p.level) || 1) < (Number(min.level) || 1) ? p : min),
          positions[0],
        );
        const target = match ?? lowest;

        const seat = positions.find((p) => p.isCurrent);
        if (seat?.name === target.name && current === target.name) return;

        set({
          player: { ...st.player, position: target.name },
          sect: {
            ...st.sect,
            positions: positions.map((p) => ({ ...p, isCurrent: p.name === target.name })),
          },
          log: [`门中叙职，你位列「${target.name}」。`, ...st.log].slice(0, 30),
        });
      },

      identifyItem: ({ itemId, reading }) => {
        const st = get();
        const item = st.inventory.find((i) => i.id === itemId);
        if (!item || !item.mystery) return false;

        const identified = normalizeAppraisal(reading, item);
        if (!identified) return false;

        set({
          inventory: st.inventory.map((i) => (i.id === itemId ? identified : i)),
          log: [`「${item.name}」请人看过，原来是${identified.name}。`, ...st.log].slice(0, 30),
        });
        return true;
      },

      pawnItem: ({ itemId, shopId, shopName, cityId, districtId, count }) => {
        const st = get();
        const item = st.inventory.find((i) => i.id === itemId);
        if (!item) return null;

        const take = Math.max(1, Math.min(Math.trunc(count) || 1, Math.max(1, item.count)));
        const price = pawnPrice(item, take);
        const today = daySerial(st.currentTime);
        const rest = item.count - take;

        const ticket: PawnTicket = {
          id: `pawn-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`,
          // 押出去的这一份单独存下来，赎回来还是原样
          item: { ...item, id: `pawned-${item.id}-${Date.now().toString(36)}`, count: take },
          shopId,
          shopName,
          cityId,
          districtId,
          price,
          day: today,
          dueDay: today + PAWN_DAYS,
        };

        set({
          spiritStones: { ...st.spiritStones, low: st.spiritStones.low + price },
          inventory:
            rest > 0
              ? st.inventory.map((i) => (i.id === itemId ? { ...i, count: rest } : i))
              : st.inventory.filter((i) => i.id !== itemId),
          pawns: [...st.pawns, ticket],
          log: [
            `你把「${item.name}」押在「${shopName}」，当得 ${price} 下品灵石，第 ${ticket.dueDay} 日前可赎。`,
            ...st.log,
          ].slice(0, 30),
        });
        return ticket;
      },

      redeemPawn: (ticketId) => {
        const st = get();
        const ticket = st.pawns.find((t) => t.id === ticketId);
        if (!ticket) return false;
        const paid = spendLowStones(st.spiritStones, ticket.price);
        if (!paid) return false;

        set({
          spiritStones: paid,
          inventory: [...st.inventory, { ...ticket.item, id: `i-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}` }],
          pawns: st.pawns.filter((t) => t.id !== ticketId),
          log: [
            `你回到「${ticket.shopName}」，花了 ${ticket.price} 下品灵石赎回「${ticket.item.name}」。`,
            ...st.log,
          ].slice(0, 30),
        });
        return true;
      },

      expirePawns: () => {
        const st = get();
        const today = daySerial(st.currentTime);
        const dead = st.pawns.filter((t) => isPawnOverdue(t, today));
        if (dead.length === 0) return;

        // 过了期的就是死当：东西归当铺，当票从此作废
        set({
          pawns: st.pawns.filter((t) => !isPawnOverdue(t, today)),
          log: [
            ...dead.map((t) => `「${t.shopName}」的当票过了期，「${t.item.name}」成了死当，再赎不回来了。`),
            ...st.log,
          ].slice(0, 30),
        });
      },

      takeBrokerJob: ({ key, shopId, jobId, cityId, districtId }) => {
        const st = get();
        const market = st.markets[key];
        const shop = market?.shops.find((s) => s.id === shopId);
        const job = shop?.jobs?.find((j) => j.id === jobId);
        if (!market || !shop || !job || job.taken) return false;

        const today = daySerial(st.currentTime);
        const days = Math.max(1, Math.trunc(job.days) || 1);
        const dueDay = today + days;
        const questId = `quest-${job.id}`;

        const cityName = getMarker(cityId)?.name ?? "此城";
        // 去处落在本城平民住宅上；柜上没有明写街区的，从平民住宅里现挑一处
        let targetDistrictId =
          typeof job.target?.districtId === "number"
            ? job.target.districtId
            : getDistricts(cityId).find((d) => d.nature === "平民住宅")?.id;
        const spot = st.districtNames?.[`${cityId}:${targetDistrictId}`] || "平民住宅";
        let label = job.target?.label || `${cityName}·${spot}`;

        // 这桩落在城外一处本地预置的野地上：照那份名目就近现开一处奇遇，
        // 事一了便随这桩机缘一并撤去。开不出来（那一带占满了）就仍退到城里街区
        let born: Adventure | undefined;
        if (job.spawnAdventure) {
          const nearby = pickOrNudgeSpotNear(
            { sectSites: st.sectSites, adventures: st.adventures },
            cityId,
          );
          if (nearby) {
            born =
              normalizeAdventure(
                { ...job.spawnAdventure, questId },
                {
                  state: { sectSites: st.sectSites, adventures: st.adventures },
                  spot: nearby,
                  cityId,
                  day: today,
                  origin: "story",
                },
              ) ?? undefined;
            if (born) {
              targetDistrictId = undefined;
              label = `${born.name}（${born.kind}）`;
            }
          }
        }

        // 到了地头总得有人交接：柜上点了名的，翻尘缘找那一位钉过去；
        // 没点名的（押货、看守、上香这类），本地照这桩事的角色现掷一个交付目标
        const relations = st.relations.map((r) => ({ ...r }));
        const added: Relation[] = [];
        let contact = job.target?.person;
        let sealed = false;
        if (contact) {
          const at = relations.findIndex((r) => r.name === contact && r.cityId === cityId);
          if (at >= 0) {
            relations[at] = { ...relations[at], cityId, districtId: targetDistrictId, fixedUntilDay: dueDay };
            sealed = true;
          }
        }
        if (!sealed) {
          const role = job.cast?.[0] ?? {
            title: "接头的人",
            persona: `「${job.name}」这桩事上要接头的人，在${label}等着，验过凭据才肯办事。`,
          };
          const hired = {
            ...rollQuestNpc(
              role,
              label,
              cityId,
              targetDistrictId,
              getMarker(cityId)?.culture,
              targetDistrictId === undefined ? label : undefined,
            ),
            fixedUntilDay: dueDay,
          };
          // 差事字面里点的是谁，便立谁：尘缘里已找不到那一位时，名字仍照字面来
          if (contact) hired.name = contact;
          added.push(hired);
          contact = hired.name;
        }

        const target: JobTarget = {
          cityId: born?.cityId ?? cityId,
          ...(targetDistrictId !== undefined ? { districtId: targetDistrictId } : {}),
          label,
          person: contact,
          ...(born ? { adventureId: born.id } : {}),
        };

        const quest: Quest = {
          id: questId,
          name: job.name,
          desc: job.desc,
          place: label,
          // 柜上的差事到了地头都有人交接，故一律算人物类：去处与人一并钉下
          kind: "人物",
          dueDay,
          giver: shop.keeper?.name || shop.name,
          condition: job.condition,
          reward: job.reward,
          rewardKind: job.rewardKind,
          rewardAmount: job.rewardAmount,
          penalty: job.penalty,
          penaltyKind: job.penaltyKind,
          penaltyAmount: job.penaltyAmount,
          status: "open",
          day: today,
          // 赏钱先押在这家柜上，办成之后回来领
          broker: { cityId, districtId, shopId, shopName: shop.name },
          // 去处连同要找的人一并记下，好在地图上星标、到地块上寻得着
          target,
        };

        set({
          quests: [...st.quests, quest],
          // 城外现开的那一处去处一并落在舆图上，星标才点得着
          ...(born
            ? { adventures: [...(Array.isArray(st.adventures) ? st.adventures : []), born] }
            : {}),
          relations: [...relations, ...added],
          markets: {
            ...st.markets,
            [key]: {
              ...market,
              shops: market.shops.map((s) =>
                s.id === shopId && s.jobs
                  ? { ...s, jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, taken: true } : j)) }
                  : s,
              ),
            },
          },
          log: [
            `你在「${shop.name}」接下「${job.name}」，限期 ${days} 日，赏钱押在柜上，办成回来领。`,
            ...(born ? [`舆图上多了一处去处：${born.name}。`] : []),
            ...st.log,
          ].slice(0, 30),
        });
        // 钉下的人由模型照这桩差事立传，替掉先前现拼的名字与出身
        generateQuestNpcs(job.name, job.desc, added);
        return true;
      },

      claimQuest: (questId) => {
        const st = get();
        const target = st.quests.find((q) => q.id === questId);
        const broker = target?.broker;
        if (!target || !broker || !isRewardHeld(target)) return false;

        // 到这一步才照单落账：此前赏一直押在柜上，谁也没动
        const player = { ...st.player };
        const spiritStones = { ...st.spiritStones };
        const reputation = { ...st.reputation };
        const sect = { ...st.sect };
        const relations = st.relations.map((r) => ({ ...r }));
        const outcome = applyQuestLedger({ player, spiritStones, reputation, sect, relations, now: st.currentTime }, target, "done");

        set({
          player,
          spiritStones,
          reputation,
          sect,
          relations,
          quests: st.quests.map((q) => (q.id === questId ? { ...q, claimed: true, outcome } : q)),
          log: [`你回「${broker.shopName}」领了「${target.name}」的赏。${outcome}`, ...st.log].slice(0, 30),
        });
        return true;
      },

      hireEscort: ({ offer, cityId, districtId, metAt }) => {
        const st = get();
        // 身边带不了那么多人，佣金也得当场付清
        if (travelingCount(st.relations) >= MAX_TRAVEL_COMPANIONS) return false;
        const paid = spendLowStones(st.spiritStones, offer.fee);
        if (!paid) return false;

        const npc = escortToRelation(offer, daySerial(st.currentTime), { cityId, districtId, metAt });
        set({
          spiritStones: paid,
          relations: [...st.relations, npc],
          log: [
            `在「${metAt}」雇下镖师「${npc.name}」，付佣金 ${offer.fee} 下品灵石，雇到第 ${npc.hireUntilDay} 日。`,
            ...st.log,
          ].slice(0, 30),
        });
        return true;
      },

      expireEscorts: () => {
        const st = get();
        const today = daySerial(st.currentTime);
        const gone = st.relations.filter((r) => r.traveling && isEscortExpired(r, today));
        if (gone.length === 0) return;

        set({
          relations: st.relations.map((r) =>
            gone.includes(r) ? { ...r, traveling: false, hireUntilDay: undefined, hireFee: undefined } : r,
          ),
          log: [...gone.map((r) => `镖师「${r.name}」的雇期到了，就此告辞。`), ...st.log].slice(0, 30),
        });
      },

      addBuff: (buff) => {
        set((st) => {
          const existing = (Array.isArray(st.player.buffs) ? st.player.buffs : []).find((b) => b.id === buff.id);
          if (existing) {
            const newStacks = Math.min(existing.stacks + buff.stacks, existing.maxStacks);
            return {
              player: {
                ...st.player,
                buffs: (Array.isArray(st.player.buffs) ? st.player.buffs : []).map((b) =>
                  b.id === buff.id ? { ...b, stacks: newStacks } : b,
                ),
              },
            };
          }
          return {
            player: {
              ...st.player,
              buffs: [...(Array.isArray(st.player.buffs) ? st.player.buffs : []), { ...buff, stacks: Math.min(buff.stacks, buff.maxStacks) }],
            },
          };
        });
      },

      removeBuff: (buffId) => {
        set((st) => ({
          player: {
            ...st.player,
            buffs: (Array.isArray(st.player.buffs) ? st.player.buffs : []).filter((b) => b.id !== buffId),
          },
        }));
      },

      addShield: (shield) => {
        set((st) => {
          const existing = (Array.isArray(st.player.shields) ? st.player.shields : []).find((s) => s.id === shield.id);
          if (existing) {
            const newValue = Math.min(existing.value + shield.value, existing.maxValue);
            return {
              player: {
                ...st.player,
                shields: (Array.isArray(st.player.shields) ? st.player.shields : []).map((s) =>
                  s.id === shield.id ? { ...s, value: newValue } : s,
                ),
              },
            };
          }
          return {
            player: {
              ...st.player,
              shields: [...(Array.isArray(st.player.shields) ? st.player.shields : []), { ...shield }],
            },
          };
        });
      },

      consumeShield: (amount) => {
        set((st) => {
          let remaining = amount;
          const newShields = [...st.player.shields];

          for (let i = 0; i < newShields.length && remaining > 0; i++) {
            const consumeAmount = Math.min(remaining, newShields[i].value);
            remaining -= consumeAmount;
            newShields[i].value -= consumeAmount;

            if (newShields[i].value <= 0) {
              newShields.splice(i, 1);
              i--;
            }
          }

          return {
            player: { ...st.player, shields: newShields },
          };
        });
      },

      updateBuffDuration: () => {
        set((st) => ({
          player: {
            ...st.player,
            // 非战斗的状态一律按时辰算，时辰走到了就自行散去
            buffs: pruneBuffs(st.player.buffs, st.currentTime),
          },
        }));
      },

      takeBath: (hours) => {
        const st = get();
        const count = clampHours(hours);
        const cost = bathCost(count);

        const paid = spendLowStones(st.spiritStones, cost);
        if (!paid) {
          return { ok: false, cost, washed: [] as string[], reason: "灵石不够：下品兑尽了，中品、上品与极品也一并兑尽仍不够。" };
        }

        // 每泡一个时辰，身上的负面状态便往前挪八个时辰；挪过此刻的就算养好了
        const { buffs, washed } = shortenDebuffs(
          st.player.buffs,
          st.currentTime,
          count * BATH_RELIEF_PER_HOUR,
        );

        set({
          spiritStones: paid,
          player: { ...st.player, buffs },
          log: [
            `在汤池里泡了 ${count} 个时辰，${washed.length > 0 ? `${washed.join("、")}就此养好了。` : "周身的滞涩松快了些。"}`,
            ...st.log,
          ].slice(0, 30),
        });
        // 泡澡本身也费时辰
        get().advanceTime(count);

        return { ok: true, cost, washed };
      },

      burnIncense: (sticks) => {
        const burned = Math.trunc(sticks);
        if (!Number.isFinite(burned) || burned <= 0) return;
        set((st) => ({
          player: {
            ...st.player,
            buffs: (Array.isArray(st.player.buffs) ? st.player.buffs : [])
              .filter(
                (b) =>
                  b.durationType !== "incense" || b.duration === undefined || b.duration - burned > 0,
              )
              .map((b) =>
                b.durationType === "incense" && b.duration !== undefined
                  ? { ...b, duration: b.duration - burned }
                  : b,
              ),
          },
        }));
      },

      equipItem: (itemId, slot) => {
        set((st) => {
          const inventory = Array.isArray(st.inventory) ? st.inventory : [];
          const item = inventory.find((i) => i.id === itemId);
          if (!item || item.type !== "法宝") return st;
          return {
            inventory: inventory.map((i) => {
              if (i.id === itemId) return { ...i, equipped: true, slot };
              if (i.equipped && i.slot === slot) return { ...i, equipped: false, slot: undefined };
              return i;
            }),
          };
        });
      },

      unequipSlot: (slot) => {
        set((st) => ({
          inventory: (Array.isArray(st.inventory) ? st.inventory : []).map((i) =>
            i.equipped && i.slot === slot ? { ...i, equipped: false, slot: undefined } : i,
          ),
        }));
      },

      resetGame: () => {
        localStorage.removeItem("xiuxian-save");
        try {
          const aiRaw = localStorage.getItem("xiuxian-ai");
          if (aiRaw) {
            const aiData = JSON.parse(aiRaw);
            delete aiData.state?.conversation;
            delete aiData.state?.npcChat;
            delete aiData.state?.battle;
            delete aiData.state?.crafting;
            localStorage.setItem("xiuxian-ai", JSON.stringify(aiData));
          }
        } catch { /* ignore */ }
        // 重入轮回：宗门也照新的一局重掷一遍
        set({ ...initialState, sectSites: rollSectSites(), log: ["重入轮回，再启修真。"], ending: null });
      },

      applyOps: (ops, opts) => {
        // 结算里没能做成的买卖，回一句给叙事收尾
        const settleNotes: string[] = [];
        if (ops.length === 0) return settleNotes;
        const placeBefore = get().currentPlaceId;
        const relationIdsBefore = new Set(get().relations.map((r) => r.id));
        const sectSitesBefore = get().sectSites;
        set((st) => {
          const dataView: GameState = {
            villages: st.villages ?? {},
            estates: st.estates ?? [],
            manorPlots: st.manorPlots ?? [],
            playerShops: st.playerShops ?? [],
            sectRelations: st.sectRelations ?? [],
            occupations: st.occupations ?? [],
            player: st.player,
            techniques: st.techniques,
            inventory: st.inventory,
            spiritStones: st.spiritStones,
            reputation: st.reputation,
            beast: st.beast,
            talismanRecipes: st.talismanRecipes,
            alchemyRecipes: st.alchemyRecipes,
            sect: st.sect,
            relations: st.relations,
            currentPanel: st.currentPanel,
            craftingTab: st.craftingTab,
            currentPlaceId: st.currentPlaceId,
            mapSceneId: st.mapSceneId,
            currentLocation: st.currentLocation,
            log: st.log,
            pillCache: st.pillCache,
            news: st.news,
            currentTime: st.currentTime,
            districtNames: st.districtNames,
            manors: st.manors,
            markets: st.markets,
            priceAdjusts: st.priceAdjusts,
            rumors: st.rumors,
            skills: st.skills,
            checks: st.checks,
            quests: st.quests,
            waseShows: st.waseShows,
            pawns: st.pawns,
            workshops: st.workshops,
            pacts: st.pacts,
            sectSites: st.sectSites,
            adventures: st.adventures,
          };
          const next = applyOpsToState(dataView, ops, {
            onNote: (text) => settleNotes.push(text),
            writable: opts?.writable,
          });
          // 首次获得心法时自动生效，否则玩家不打开功法面板手动切换就一直是「未定心法」
          const nextPlayer = { ...next.player };
          // 叙事若把时辰推过去了，到点的状态同一笔账里就散去，别等到下一轮
          nextPlayer.buffs = pruneBuffs(nextPlayer.buffs, next.currentTime ?? st.currentTime);
          if (!nextPlayer.activeHeartTechnique) {
            const heart = (Array.isArray(next.techniques) ? next.techniques : []).find((t) => t.category === "心法");
            if (heart) nextPlayer.activeHeartTechnique = heart.id;
          }
          // 修炼任何一门功法，境界进度都跟着长：功法进度长多少，修为便长多少。
          // 叙事里写到打坐闭关，只给功法进度即可，修为由这一笔自动补上。
          // 新参得的功法不算——那是白捡的，不是修出来的。
          const beforeProf = new Map(
            (Array.isArray(st.techniques) ? st.techniques : []).map((t) => [t.id, Number(t.proficiency) || 0]),
          );
          let profGain = 0;
          for (const t of Array.isArray(next.techniques) ? next.techniques : []) {
            const prev = beforeProf.get(t.id);
            if (prev === undefined) continue;
            const gain = (Number(t.proficiency) || 0) - prev;
            if (gain > 0) profGain += gain;
          }
          if (profGain > 0) {
            nextPlayer.cultivation = (Number(nextPlayer.cultivation) || 0) + profGain;
          }
          // 叙事可以写"你启程去了金陵"，但只有落在标点表里的 id 才认，免得光标飘到地图外
          const nextPlace = getMarker(next.currentPlaceId) ? next.currentPlaceId : st.currentPlaceId;
          const moved = nextPlace !== st.currentPlaceId;
          // 场所同样只认表里的值，认不出就沿用原处
          const nextLocation = resolveLocation(next.currentLocation) ?? st.currentLocation;
          // 人没挪窝、场所也照旧，才算仍驻在原先那处奇遇点位上；否则奇遇点位自然作废
          const stillAtPoint = !moved && nextLocation === st.currentLocation;
          // 叙事里那桩事了结、替它现开的去处已撤，脚下这处便也算没了
          const nextAdventures = next.adventures ?? st.adventures;
          const currentStillThere =
            !st.currentAdventureId ||
            (Array.isArray(nextAdventures) ? nextAdventures : []).some(
              (a) => a.id === st.currentAdventureId,
            );
          return {
            player: nextPlayer,
            techniques: next.techniques,
            inventory: next.inventory,
            spiritStones: next.spiritStones,
            // 名声也是叙事能改的一笔：牙行差事、做下的事都记在这上头
            reputation: next.reputation,
            sect: next.sect,
            relations: next.relations,
            currentPlaceId: nextPlace,
            // 换了地方就退回世界地图，免得停在上一个地点的内部地图里
            mapSceneId: moved ? WORLD_SCENE_ID : st.mapSceneId,
            currentLocation: nextLocation,
            currentAdventureId: stillAtPoint && currentStillThere ? st.currentAdventureId : undefined,
            log: next.log,
            pillCache: next.pillCache,
            news: next.news,
            currentTime: next.currentTime,
            districtNames: next.districtNames,
            priceAdjusts: next.priceAdjusts,
            // 判定的掷骰与改口都在结算里做完，这里把结果收回来
            skills: next.skills ?? st.skills,
            checks: next.checks ?? st.checks,
            // 机缘的立与了也在结算里做完
            quests: next.quests ?? st.quests,
            // 叙事牵出的奇遇也落在舆图上
            adventures: next.adventures ?? st.adventures,
            // 当票只在当铺与到期时动，叙事结算不会碰它
            pawns: st.pawns,
            // 作坊里的工匠不受叙事影响；约定可由叙事说定，照这一笔一并收回
            workshops: st.workshops,
            pacts: next.pacts ?? st.pacts,
            // 叙事里动身去了某一村，便把这一村的「已前往」收回来，往后才能打听人事
            villages: next.villages ?? st.villages,
            // 叙事里新置的宅地、谈定的出租，也照这一笔落库
            manorPlots: next.manorPlots ?? st.manorPlots,
            estates: next.estates ?? st.estates,
            // 本门山门若被叙事毁了某座建筑（或掌事有变），也照这一笔落库
            sectSites: next.sectSites ?? st.sectSites,
            // 叙事与新闻添改的宗门交情，一并收进来
            sectRelations: next.sectRelations ?? st.sectRelations,
            // 城村的归属也照这一笔落库
            occupations: next.occupations ?? st.occupations,
          };
        });
        // 山门有变（拆了某座建筑）就重注册一遍宗门场景，地图上即刻见废墟；山门图不是每回合都动，故先比对再注册
        if (get().sectSites !== sectSitesBefore) registerSectScenes(get().sectSites);
        // 叙事新立、且钉下了接头人的机缘：那几位由模型照这桩事取名，替掉现拼的名字
        const questLabels = new Set(
          get()
            .quests.filter((q) => q.status === "open" && q.target)
            .map((q) => q.target!.label),
        );
        const freshCast = get().relations.filter(
          (r) => !relationIdsBefore.has(r.id) && r.persona && r.metAt && questLabels.has(r.metAt),
        );
        if (freshCast.length > 0) {
          const ctx = get().quests.find(
            (q) => q.status === "open" && q.target && freshCast.some((n) => n.metAt === q.target!.label),
          );
          generateQuestNpcs(ctx?.name || "这桩事", ctx?.desc, freshCast);
        }
        // 叙事若把日子推过了头，误期的机缘该罚的罚，口头的约定也该落账了
        get().expireQuests();
        get().expirePacts();
        // 日子推进了，名下房产的完好度与月租也在此一并结清
        get().settleEstates();
        // 铺面同样按月结账
        get().settlePlayerShops();
        // 城村的贡金也按月结
        get().settleOccupations();
        // 门中职位或玩家的身份若在这一笔里动过，重新对上号
        get().alignPlayerPosition();
        // 叙事把气血或寿元算到了头，就地立终局
        get().tickMortality(0);
        // 叙事若把境界推上了某一桩修为类机缘所指的那一层，就地认下
        get().settleRealmQuests();
        // 叙事里凑齐了某样东西或攒够了灵石，物品、灵石两类机缘也就地认下
        get().settleAssetQuests();
        // 叙事里新置的宅地也要有一张能走进去的宅邸图，并在城图上落到一格空地
        get().ensureManorCells();
        // 叙事里启程去了别处，这一路也算走过一段，路上同样可能生变
        if (placeBefore !== get().currentPlaceId) {
          void import("@/store/useAIStore")
            .then(({ useAIStore }) => useAIStore.getState().maybeTriggerRandomEvent(12))
            .catch(() => {});
        }
        return settleNotes;
      },

      meetNpc: (npc) =>
        set((st) => {
          if (st.relations.some((r) => r.id === npc.id)) return st;
          // 名声在外，初见时人家心里先有个底；往后的交情仍旧靠处
          const firstImpression = reputationFirstImpression(st.reputation);
          const base = migrateRelation(npc);
          const met: Relation = {
            ...base,
            relation: Math.max(-100, Math.min(100, base.relation + firstImpression * 2)),
            note: firstImpression
              ? `${npc.note}${firstImpression > 0 ? " 他听过你的名，见面便客气三分。" : " 你的名头不怎么好听，他见面先存了几分戒心。"}`
              : npc.note,
          };
          return {
            relations: [...st.relations, met],
            log: [`你与「${npc.name}」攀谈了几句。`, ...st.log].slice(0, 30),
          };
        }),

      appendRelationMemory: (id, text) =>
        set((st) => ({
          relations: st.relations.map((r) =>
            r.id === id ? { ...r, memory: r.memory ? `${r.memory}\n${text}` : text } : r,
          ),
        })),

      removeRelations: (ids) =>
        set((st) => {
          const dead = new Set(ids);
          return { relations: st.relations.filter((r) => !dead.has(r.id)) };
        }),

      trainAt: (techniqueId, hours, mul) => {
        // 宅邸里的「演武」之屋，练功进益也照它加成
        const gain = cultivationGain(hours, mul * (1 + manorBonusOf(get().manorPlots, "演武")));
        if (gain <= 0) return 0;
        let real = 0;
        set((st) => {
          const list = Array.isArray(st.techniques) ? st.techniques : [];
          const at = list.findIndex((t) => t.id === techniqueId);
          const cultivation = Number(st.player.cultivation) || 0;
          if (at < 0) {
            real = gain;
            return { player: { ...st.player, cultivation: cultivation + gain } };
          }
          const target = list[at];
          const max = Number(target.proficiencyMax) || 100;
          const before = Number(target.proficiency) || 0;
          const after = Math.min(max, before + gain);
          real = after - before;
          return {
            techniques: list.map((t, i) => (i === at ? { ...t, proficiency: after } : t)),
            player: { ...st.player, cultivation: cultivation + real },
          };
        });
        return real;
      },

      ensureManor: (cityId, districtId, cityName, culture) => {
        const key = manorKey(cityId, districtId);
        const existing = get().manors[key];
        if (existing) return existing;
        const manor = rollManor(cityId, districtId, cityName, culture);
        set((st) => ({ manors: { ...st.manors, [key]: manor } }));
        return manor;
      },

      ensureVillages: () => {
        const st = get();
        const sceneId = WORLD_SCENE_ID;
        const all = getScenePresetPoints(sceneId);
        if (all.length === 0) return;
        const used = new Set<string>();
        for (const s of st.sectSites ?? []) if (s?.sceneId) used.add(presetKey(s));
        for (const a of st.adventures ?? []) if (a?.sceneId && a.status !== "done") used.add(presetKey(a));
        for (const k of Object.keys(st.villages ?? {})) used.add(k);

        // 至少留四成点位给奇遇（连同宗门、其它机缘一并算在占用里）：
        // 村庄最多占到这个上限，占满了就不再新立，免得野外的奇遇无处落脚。
        const reserve = Math.ceil(all.length * 0.4);
        const occupiedByOthers = used.size - Object.keys(st.villages ?? {}).length;
        const maxVillages = Math.max(0, all.length - reserve - occupiedByOthers);
        let room = maxVillages - Object.keys(st.villages ?? {}).length;
        if (room <= 0) return;

        const free = all.filter((p) => !used.has(presetKey(p)));
        if (free.length === 0) return;

        const cities = getCityMarkers();
        const next: Record<string, Village> = { ...(st.villages ?? {}) };
        // 本局已经用过的村名：新立的照它剔除，一局之内不重号
        const usedNames = new Set<string>();
        for (const v of Object.values(st.villages ?? {})) if (v?.name) usedNames.add(v.name);
        let added = 0;
        for (const p of free) {
          if (room <= 0) break;
          // 只占一部分空位，其余留给宗门与奇遇
          if (Math.random() > 0.4) continue;
          const key = presetKey(p);
          if (next[key]) continue;
          // 村庄属哪个文化圈，照离它最近的那座城来定：村名与村里人的姓名都随这一圈取，
          // 各圈各异，不至于天下村庄同一个名、同一个姓。
          const culture = presetCulture(p, cities);
          const name = rollVillageName(culture, usedNames);
          usedNames.add(name);
          next[key] = {
            key,
            sceneId,
            x: p.x,
            y: p.y,
            name,
            culture,
            buildings: [],
            npcs: [],
            inquired: false,
          };
          added += 1;
          room -= 1;
        }
        if (added > 0) set({ villages: next });
      },

      inquireVillage: (key) => {
        const st = get();
        const v = st.villages?.[key];
        // 须先在问道中动身到过这一村，才谈得上向村人打听
        if (!v || v.inquired || !v.visited) return;
        // 村不在城内，用点位坐标折算一个稳定的编号，交给合成出的铺子用
        const spot = Math.abs(Math.round(v.x) * 1000 + Math.round(v.y));
        const buildings = rollVillageBuildings().map((kind, i) => ({
          kind,
          name: villageBuildingName(kind, v.culture),
          shop: makeVillageShop(kind, v.culture, v.sceneId, spot, i),
        }));
        const npcs = rollVillageNpcs(v.sceneId, spot, v.name, v.culture);
        // 有的村正巧有人要出手屋舍
        const estateOffer =
          Math.random() < 0.35
            ? rollEstateOffer({ place: v.name, culture: v.culture, villageKey: v.key })
            : undefined;
        set((s) => ({
          villages: { ...s.villages, [key]: { ...v, buildings, npcs, estateOffer, inquired: true } },
        }));
      },

      clearVillageEstateOffer: (key) => {
        set((s) => {
          const v = s.villages?.[key];
          if (!v) return s;
          return { villages: { ...s.villages, [key]: { ...v, estateOffer: undefined } } };
        });
      },

      buyEstate: (offer, paid) => {
        const today = daySerial(get().currentTime);
        const estate: Estate = {
          id: `estate-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`,
          name: offer.name,
          place: offer.place,
          cityId: offer.cityId,
          districtId: offer.districtId,
          villageKey: offer.villageKey,
          baseEfficiency: offer.baseEfficiency,
          condition: 100,
          price: Math.max(0, Math.round(paid)),
          settledDay: today,
          storage: [],
        };
        set((st) => ({
          estates: [...(st.estates ?? []), estate],
          log: [`你买下了「${estate.name}」（${estate.place}），花 ${estate.price} 下品灵石。`, ...st.log].slice(0, 30),
        }));
        return estate;
      },

      sellEstate: (id) => {
        const st = get();
        const e = (st.estates ?? []).find((x) => x.id === id);
        if (!e) return 0;
        const refund = sellRefund(e);
        set((s) => ({
          estates: (s.estates ?? []).filter((x) => x.id !== id),
          spiritStones: { ...s.spiritStones, low: (Number(s.spiritStones.low) || 0) + refund },
          log: [`你把「${e.name}」出手，收回 ${refund} 下品灵石。`, ...s.log].slice(0, 30),
        }));
        return refund;
      },

      maintainEstate: (id) => {
        const st = get();
        const e = (st.estates ?? []).find((x) => x.id === id);
        if (!e || e.condition >= 100) return false;
        const cost = maintainCost(e.condition);
        const paid = spendLowStones(st.spiritStones, cost);
        if (!paid) return false;
        set((s) => ({
          spiritStones: paid,
          estates: (s.estates ?? []).map((x) => (x.id === id ? { ...x, condition: 100 } : x)),
          log: [`你花 ${cost} 下品灵石把「${e.name}」修葺一新。`, ...s.log].slice(0, 30),
        }));
        return true;
      },

      rebuildEstate: (id) => {
        const st = get();
        const e = (st.estates ?? []).find((x) => x.id === id);
        if (!e || e.condition > 0) return false;
        const cost = rebuildCost(e);
        const paid = spendLowStones(st.spiritStones, cost);
        if (!paid) return false;
        set((s) => ({
          spiritStones: paid,
          estates: (s.estates ?? []).map((x) => (x.id === id ? { ...x, condition: REBUILD_CONDITION } : x)),
          log: [`你雇人重建「${e.name}」，耗时 ${REBUILD_DAYS} 日，花 ${cost} 下品灵石。`, ...s.log].slice(0, 30),
        }));
        get().advanceTime(REBUILD_DAYS * 24);
        return true;
      },

      storeInEstate: (id, itemName, count) => {
        const st = get();
        const e = (st.estates ?? []).find((x) => x.id === id);
        if (!e) return false;
        const have = (st.inventory ?? []).find((i) => i.name === itemName);
        const n = Math.min(Math.max(1, Math.trunc(count) || 1), Number(have?.count) || 0);
        if (!have || n <= 0) return false;
        // 存得下多少，看宅邸里「仓廪」有几处：底子二十格，仓廪每级再添一格
        const cap = 20 + Math.floor(manorBonusOf(st.manorPlots, "仓廪"));
        const used = (e.storage ?? []).reduce((sum, i) => sum + (Number(i.count) || 0), 0);
        if (used + n > cap) return false;
        set((s) => {
          const inventory = (s.inventory ?? [])
            .map((i) => (i.name === itemName ? { ...i, count: Number(i.count) - n } : i))
            .filter((i) => Number(i.count) > 0);
          const estates = (s.estates ?? []).map((x) => {
            if (x.id !== id) return x;
            const storage = [...(x.storage ?? [])];
            const at = storage.findIndex((i) => i.name === itemName);
            if (at >= 0) storage[at] = { ...storage[at], count: Number(storage[at].count) + n };
            else storage.push({ ...have, count: n });
            return { ...x, storage };
          });
          return { inventory, estates };
        });
        return true;
      },

      takeFromEstate: (id, itemName, count) => {
        const st = get();
        const e = (st.estates ?? []).find((x) => x.id === id);
        if (!e) return false;
        const have = (e.storage ?? []).find((i) => i.name === itemName);
        const n = Math.min(Math.max(1, Math.trunc(count) || 1), Number(have?.count) || 0);
        if (!have || n <= 0) return false;
        set((s) => {
          const estates = (s.estates ?? []).map((x) => {
            if (x.id !== id) return x;
            const storage = (x.storage ?? [])
              .map((i) => (i.name === itemName ? { ...i, count: Number(i.count) - n } : i))
              .filter((i) => Number(i.count) > 0);
            return { ...x, storage };
          });
          const inventory = [...(s.inventory ?? [])];
          const at = inventory.findIndex((i) => i.name === itemName);
          if (at >= 0) inventory[at] = { ...inventory[at], count: Number(inventory[at].count) + n };
          else inventory.push({ ...have, count: n });
          return { estates, inventory };
        });
        return true;
      },

      rentOutEstate: (id, rent) =>
        set((st) => ({
          estates: (st.estates ?? []).map((e) =>
            e.id === id
              ? {
                  ...e,
                  rent: {
                    tenant: rent.tenant.trim() || "租客",
                    monthly: Math.max(0, Math.round(Number(rent.monthly) || 0)),
                    // 挂租当月便算已收，自次月起逐月入账
                    lastPaidMonth: gameMonthKey(st.currentTime),
                  },
                }
              : e,
          ),
        })),

      reclaimEstate: (id) =>
        set((st) => ({ estates: (st.estates ?? []).map((e) => (e.id === id ? { ...e, rent: undefined } : e)) })),

      rentOutPlot: (plotId, rent) =>
        set((st) => ({
          manorPlots: (st.manorPlots ?? []).map((p) =>
            // 空院子租不出去：院里至少得有一间屋
            p.id === plotId && (p.cells ?? []).some((c) => !!c) && !(p.cells ?? []).some((c) => !!c?.rent)
              ? {
                  ...p,
                  rent: {
                    tenant: rent.tenant.trim() || "租客",
                    monthly: Math.max(0, Math.round(Number(rent.monthly) || 0)),
                    lastPaidMonth: gameMonthKey(st.currentTime),
                  },
                }
              : p,
          ),
        })),

      reclaimPlot: (plotId) =>
        set((st) => ({ manorPlots: (st.manorPlots ?? []).map((p) => (p.id === plotId ? { ...p, rent: undefined } : p)) })),

      rentOutRoom: (plotId, index, rent) =>
        set((st) => ({
          manorPlots: (st.manorPlots ?? []).map((p) => {
            if (p.id !== plotId || p.rent) return p;
            const cell = p.cells[index];
            if (!cell || cell.rent) return p;
            return {
              ...p,
              cells: p.cells.map((c, i) =>
                i === index && c
                  ? {
                      ...c,
                      rent: {
                        tenant: rent.tenant.trim() || "租客",
                        monthly: Math.max(0, Math.round(Number(rent.monthly) || 0)),
                        lastPaidMonth: gameMonthKey(st.currentTime),
                      },
                    }
                  : c,
              ),
            };
          }),
        })),

      reclaimRoom: (plotId, index) =>
        set((st) => ({
          manorPlots: (st.manorPlots ?? []).map((p) =>
            p.id === plotId
              ? {
                  ...p,
                  cells: p.cells.map((c, i) => (i === index && c ? { ...c, rent: undefined } : c)),
                }
              : p,
          ),
        })),

      manorAct: ({ plotId, index, action, hours, techniqueId, skillName, relationId, itemId, count = 1 }) => {
        const st = get();
        const plot = (st.manorPlots ?? []).find((p) => p.id === plotId);
        const cell = plot?.cells[index] ?? null;
        if (!plot || !cell) return { ok: false, text: "这一处还没有屋子。" };
        if (plot.rent) return { ok: false, text: "整座宅邸已租出去了，自家人用不得。" };
        if (cell.rent) return { ok: false, text: "这一间已租出去了，自家人用不得。" };

        const need: Record<string, ManorFunction> = {
          打坐: "聚灵",
          参悟: "经阁",
          演练: "演武",
          研读: "书房",
          会客: "茶室",
          驯兽: "兽栏",
          熔炼: "锻坊",
          存物: "仓廪",
          取物: "仓廪",
        };
        if (cell.fn !== need[action]) {
          return { ok: false, text: `这一间是「${cell.fn ?? "未配功能"}」，做不得「${action}」。` };
        }

        // —— 打坐、参悟、演练：挑一门功法，按时辰长进度 ——
        if (action === "打坐" || action === "参悟" || action === "演练") {
          const h = Math.min(12, Math.max(1, Math.trunc(Number(hours) || 1)));
          const bonus = manorBonusOf(st.manorPlots, need[action]);
          const gain = cultivationGain(h, 1 + bonus);
          const list = Array.isArray(st.techniques) ? st.techniques : [];
          const target =
            list.find((t) => t.id === techniqueId) ??
            list.find((t) => t.id === st.player.activeHeartTechnique) ??
            list[0];
          const player = { ...st.player };
          let techniques = list;
          let real = gain;
          let label = "修为";
          if (target) {
            const max = Math.max(1, Number(target.proficiencyMax) || 100);
            const before = Number(target.proficiency) || 0;
            const after = Math.min(max, before + gain);
            real = after - before;
            techniques = list.map((t) => (t.id === target.id ? { ...t, proficiency: after } : t));
            label = `「${target.name}」`;
          }
          player.cultivation = (Number(player.cultivation) || 0) + real;
          set({ techniques, player, log: [`你在「${cell.shape}」中${action} ${h} 个时辰，${label}长了 ${real} 点。`, ...st.log].slice(0, 30) });
          get().advanceTime(h);
          return {
            ok: true,
            gain: real,
            text: `在「${cell.shape}」里${action}了 ${h} 个时辰，${label}长了 ${real} 点${bonus > 0 ? `（此处加成 +${Math.round(bonus * 100)}%）` : ""}。`,
          };
        }

        // —— 研读：挑一门本事，按时辰长进 ——
        if (action === "研读") {
          const h = Math.min(12, Math.max(1, Math.trunc(Number(hours) || 1)));
          const skill = findSkill(st.skills, String(skillName ?? "").trim());
          if (!skill) return { ok: false, text: "先挑一门要读的本事。" };
          const gain = Math.max(1, Math.round(h * (1 + manorBonusOf(st.manorPlots, "书房"))));
          set({
            skills: st.skills.map((s) => (s.id === skill.id ? trainSkill(s, gain) : s)),
            log: [`你在书房里研读 ${h} 个时辰，「${skill.name}」长了 ${gain} 点。`, ...st.log].slice(0, 30),
          });
          get().advanceTime(h);
          return { ok: true, gain, text: `在书房里研读 ${h} 个时辰，「${skill.name}」长了 ${gain} 点。` };
        }

        // —— 会客：请一位相熟的人来喝茶，叙一叙交情 ——
        if (action === "会客") {
          const rel = (st.relations ?? []).find((r) => r.id === relationId);
          if (!rel) return { ok: false, text: "先挑一位要请的人。" };
          const up = 1 + Math.floor(manorBonusOf(st.manorPlots, "茶室") * 10);
          set({
            relations: st.relations.map((r) =>
              r.id === rel.id ? { ...r, relation: Math.max(-100, Math.min(100, (Number(r.relation) || 0) + up)) } : r,
            ),
            log: [`你请「${rel.name}」到茶室坐了一回，交情 +${up}。`, ...st.log].slice(0, 30),
          });
          get().advanceTime(1);
          return { ok: true, gain: up, text: `你请「${rel.name}」到茶室坐了一回，一盏茶后交情 +${up}。` };
        }

        // —— 驯兽：陪着随身的灵兽，养一养亲疏 ——
        if (action === "驯兽") {
          if (!st.beast) return { ok: false, text: "身边没有带灵兽。" };
          set({
            beast: raiseBond(st.beast, 1),
            log: [`你在兽栏边陪「${st.beast.name}」待了半日，亲疏近了一层。`, ...st.log].slice(0, 30),
          });
          get().advanceTime(3);
          return { ok: true, gain: 1, text: `你在兽栏边陪「${st.beast.name}」待了半日，它与你又亲近了一层。` };
        }

        // —— 熔炼：把旧物投进炉里，按品阶折成灵石 ——
        if (action === "熔炼") {
          const item = (st.inventory ?? []).find((i) => i.id === itemId);
          if (!item) return { ok: false, text: "行囊里没有这一件。" };
          const take = Math.max(1, Math.min(Math.trunc(Number(count) || 1), item.count));
          const unit = salvageValue(item.grade, manorBonusOf(st.manorPlots, "锻坊"));
          const earned = unit * take;
          set({
            inventory:
              item.count > take
                ? st.inventory.map((i) => (i.id === item.id ? { ...i, count: i.count - take } : i))
                : st.inventory.filter((i) => i.id !== item.id),
            spiritStones: { ...st.spiritStones, low: (Number(st.spiritStones.low) || 0) + earned },
            log: [`你把「${item.name}」${take > 1 ? ` ${take} 件` : ""}投进锻坊熔了，得 ${earned} 下品灵石。`, ...st.log].slice(0, 30),
          });
          get().advanceTime(1);
          return { ok: true, gain: earned, text: `你把「${item.name}」${take > 1 ? ` ${take} 件` : ""}投进炉里熔了，得 ${earned} 下品灵石。` };
        }

        // —— 仓廪：把东西存进去，或取回来 ——
        if (action === "存物" || action === "取物") {
          const storage = Array.isArray(plot.storage) ? plot.storage : [];
          if (action === "存物") {
            const item = (st.inventory ?? []).find((i) => i.id === itemId);
            if (!item) return { ok: false, text: "行囊里没有这一件。" };
            const take = Math.max(1, Math.min(Math.trunc(Number(count) || 1), item.count));
            const nextStorage = [...storage];
            const at = nextStorage.findIndex((s) => s.name === item.name && s.type === item.type);
            if (at >= 0) nextStorage[at] = { ...nextStorage[at], count: nextStorage[at].count + take };
            else nextStorage.push({ ...item, count: take });
            set({
              inventory:
                item.count > take
                  ? st.inventory.map((i) => (i.id === item.id ? { ...i, count: i.count - take } : i))
                  : st.inventory.filter((i) => i.id !== item.id),
              manorPlots: (st.manorPlots ?? []).map((p) => (p.id === plotId ? { ...p, storage: nextStorage } : p)),
              log: [`你把「${item.name}」${take > 1 ? ` ${take} 件` : ""}存进了仓廪。`, ...st.log].slice(0, 30),
            });
            return { ok: true, text: `「${item.name}」${take > 1 ? ` ${take} 件` : ""}已存进仓廪。` };
          }
          const stored = storage.find((s) => s.id === itemId) ?? storage.find((s) => s.name === itemId);
          if (!stored) return { ok: false, text: "仓廪里没有这一件。" };
          const take = Math.max(1, Math.min(Math.trunc(Number(count) || 1), stored.count));
          const nextStorage =
            stored.count > take
              ? storage.map((s) => (s.id === stored.id ? { ...s, count: s.count - take } : s))
              : storage.filter((s) => s.id !== stored.id);
          const inv = [...(st.inventory ?? [])];
          const at = inv.findIndex((i) => i.name === stored.name && i.type === stored.type);
          if (at >= 0) inv[at] = { ...inv[at], count: inv[at].count + take };
          else inv.push({ ...stored, count: take });
          set({
            inventory: inv,
            manorPlots: (st.manorPlots ?? []).map((p) => (p.id === plotId ? { ...p, storage: nextStorage } : p)),
            log: [`你从仓廪里取出「${stored.name}」${take > 1 ? ` ${take} 件` : ""}。`, ...st.log].slice(0, 30),
          });
          return { ok: true, text: `从仓廪里取出了「${stored.name}」${take > 1 ? ` ${take} 件` : ""}。` };
        }

        return { ok: false, text: "这一桩做不得。" };
      },

      settleEstates: () => {
        const st = get();
        const today = daySerial(st.currentTime);
        const monthKey = gameMonthKey(st.currentTime);
        let earned = 0;
        const earnedLines: string[] = [];

        let estatesChanged = false;
        const nextEstates = (st.estates ?? []).map((e) => {
          let out = e;
          // 完好度随日子往下掉
          const days = Math.max(0, today - (Number(out.settledDay) || today));
          if (days > 0) {
            out = {
              ...out,
              condition: Math.max(0, Math.round((Number(out.condition) || 0) - days * ESTATE_DECAY_PER_DAY)),
              settledDay: today,
            };
          }
          // 租出去的，到了新月便收一回租
          const rent = out.rent;
          if (rent && Number(rent.monthly) > 0 && rent.lastPaidMonth !== monthKey) {
            earned += Math.round(Number(rent.monthly) || 0);
            earnedLines.push(`「${out.name}」${rent.tenant}送来 ${Math.round(Number(rent.monthly) || 0)} 灵石`);
            out = { ...out, rent: { ...rent, lastPaidMonth: monthKey } };
          }
          if (out !== e) estatesChanged = true;
          return out;
        });

        let plotsChanged = false;
        const nextPlots = (st.manorPlots ?? []).map((p) => {
          // 整座租出去的按整座收租，单间的不再另算
          const rent = p.rent;
          if (rent && Number(rent.monthly) > 0 && rent.lastPaidMonth !== monthKey) {
            earned += Math.round(Number(rent.monthly) || 0);
            earnedLines.push(`「${p.place}·宅邸」${rent.tenant}送来 ${Math.round(Number(rent.monthly) || 0)} 灵石`);
            plotsChanged = true;
            return { ...p, rent: { ...rent, lastPaidMonth: monthKey } };
          }
          if (rent) return p;
          // 单间出租的，逐间收租
          let roomsChanged = false;
          const cells = (p.cells ?? []).map((c) => {
            const roomRent = c?.rent;
            if (!c || !roomRent || Number(roomRent.monthly) <= 0 || roomRent.lastPaidMonth === monthKey) {
              return c;
            }
            earned += Math.round(Number(roomRent.monthly) || 0);
            earnedLines.push(
              `「${p.place}·${c.shape}」${roomRent.tenant}送来 ${Math.round(Number(roomRent.monthly) || 0)} 灵石`,
            );
            roomsChanged = true;
            return { ...c, rent: { ...roomRent, lastPaidMonth: monthKey } };
          });
          if (!roomsChanged) return p;
          plotsChanged = true;
          return { ...p, cells };
        });

        if (!estatesChanged && !plotsChanged) return;
        set((s) => ({
          estates: nextEstates,
          manorPlots: nextPlots,
          spiritStones:
            earned > 0 ? { ...s.spiritStones, low: (Number(s.spiritStones.low) || 0) + earned } : s.spiritStones,
          log: earned > 0 ? [`月租入账：${earnedLines.join("；")}。`, ...s.log].slice(0, 30) : s.log,
        }));
      },

      openShop: (input) => {
        const st = get();
        const lease = shopLeaseCost(input.culture);
        const capital = Math.max(0, Math.round(Number(input.capital) || 0));
        const paid = spendLowStones(st.spiritStones, lease + capital);
        if (!paid) return null;
        const shop: PlayerShop = {
          id: `shop-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`,
          name: input.name.trim() || "无名铺子",
          kind: input.kind,
          typeLabel: input.typeLabel?.trim() || undefined,
          cityId: input.cityId,
          districtId: input.districtId,
          place: input.place,
          culture: input.culture,
          cash: capital,
          goods: clampShopGoods(input.goods ?? []),
          facilities: clampShopFacilities(input.facilities ?? []),
          monthlyIncome: Math.max(0, Math.min(SHOP_MONEY_MAX, Math.round(Number(input.monthlyIncome) || 0))),
          monthlyExpense: Math.max(0, Math.min(SHOP_MONEY_MAX, Math.round(Number(input.monthlyExpense) || 0))),
          useStock: input.useStock !== false,
          // 开张当月便算已结，自次月起逐月入账
          lastSettledMonth: gameMonthKey(st.currentTime),
          arrears: 0,
        };
        set((s) => ({
          spiritStones: paid,
          playerShops: [...(s.playerShops ?? []), shop],
          log: [
            `你在${input.place}盘下一间铺面「${shop.name}」，盘店花 ${lease} 下品灵石，另投 ${capital} 作本钱。`,
            ...s.log,
          ].slice(0, 30),
        }));
        return shop;
      },

      withdrawShopCash: (id, amount) => {
        const st = get();
        const shop = (st.playerShops ?? []).find((s) => s.id === id);
        if (!shop) return 0;
        const take = Math.max(0, Math.min(Math.round(Number(amount) || 0), Math.round(Number(shop.cash) || 0)));
        if (take <= 0) return 0;
        set((s) => ({
          playerShops: (s.playerShops ?? []).map((x) =>
            x.id === id ? { ...x, cash: Math.round(Number(x.cash) || 0) - take } : x,
          ),
          spiritStones: { ...s.spiritStones, low: (Number(s.spiritStones.low) || 0) + take },
          log: [`你从「${shop.name}」的账上取出 ${take} 下品灵石。`, ...s.log].slice(0, 30),
        }));
        return take;
      },

      depositShopCash: (id, amount) => {
        const st = get();
        const shop = (st.playerShops ?? []).find((s) => s.id === id);
        if (!shop) return 0;
        const want = Math.max(0, Math.round(Number(amount) || 0));
        const put = Math.min(want, Math.max(0, Math.round(Number(st.spiritStones.low) || 0)));
        if (put <= 0) return 0;
        set((s) => ({
          playerShops: (s.playerShops ?? []).map((x) =>
            x.id === id ? { ...x, cash: Math.round(Number(x.cash) || 0) + put } : x,
          ),
          spiritStones: { ...s.spiritStones, low: (Number(s.spiritStones.low) || 0) - put },
          log: [`你往「${shop.name}」的账上注入 ${put} 下品灵石作本钱。`, ...s.log].slice(0, 30),
        }));
        return put;
      },

      applyShopPatch: (id, patch) =>
        set((s) => ({
          playerShops: (s.playerShops ?? []).map((x) =>
            x.id === id
              ? {
                  ...x,
                  name: patch.name?.trim() || x.name,
                  goods: patch.goods ? clampShopGoods(patch.goods) : x.goods,
                  facilities: patch.facilities ? clampShopFacilities(patch.facilities) : x.facilities,
                  monthlyIncome:
                    patch.monthlyIncome !== undefined
                      ? Math.max(0, Math.min(SHOP_MONEY_MAX, Math.round(Number(patch.monthlyIncome) || 0)))
                      : x.monthlyIncome,
                  monthlyExpense:
                    patch.monthlyExpense !== undefined
                      ? Math.max(0, Math.min(SHOP_MONEY_MAX, Math.round(Number(patch.monthlyExpense) || 0)))
                      : x.monthlyExpense,
                }
              : x,
          ),
        })),

      settlePlayerShops: () => {
        const st = get();
        const list = st.playerShops ?? [];
        if (list.length === 0) return;
        const monthKey = gameMonthKey(st.currentTime);
        let changed = false;
        const notes: string[] = [];
        const next: PlayerShop[] = [];
        for (const shop of list) {
          if (shop.lastSettledMonth === monthKey) {
            next.push(shop);
            continue;
          }
          changed = true;
          const income = Math.max(0, Math.round(Number(shop.monthlyIncome) || 0));
          const expense = shopMonthlyExpense(shop);
          let cash = Math.round(Number(shop.cash) || 0) + income - expense;
          let arrears = Math.max(0, Number(shop.arrears) || 0);
          if (cash < 0) {
            // 池子垫不上这个月的开销，先记账；连欠三月便被债主收走
            cash = 0;
            arrears += 1;
          } else {
            arrears = 0;
          }
          if (arrears >= SHOP_ARREARS_LIMIT) {
            notes.push(`「${shop.name}」连欠三月，被债主收走，铺面另易其主。`);
            continue;
          }
          if (arrears > 0) {
            notes.push(`「${shop.name}」这个月没挣够开销，已欠 ${arrears} 月。`);
          } else if (expense > income) {
            // 池子里还有钱，便自动支取差额把这一月撑过去
            notes.push(`「${shop.name}」进项不敷，自动从资金池支出 ${expense - income} 维持经营。`);
          }
          next.push({ ...shop, cash, arrears, lastSettledMonth: monthKey });
        }
        if (!changed) return;
        set((s) => ({
          playerShops: next,
          log: notes.length ? [...notes, ...s.log].slice(0, 30) : s.log,
        }));
      },

      buyPlot: (input) => {
        const st = get();
        const paid = spendLowStones(st.spiritStones, MANOR_PLOT_PRICE);
        if (!paid) return null;
        const plot = emptyPlot(input);
        set((s) => ({
          spiritStones: paid,
          manorPlots: [...(s.manorPlots ?? []), plot],
          log: [`你在${input.place}买下一块宅地，花 ${MANOR_PLOT_PRICE} 下品灵石。`, ...s.log].slice(0, 30),
        }));
        // 新宅地要有一张能走进去的宅邸图
        registerManorScenes(get().manorPlots);
        return plot;
      },

      ensureManorCells: () => {
        const plots = get().manorPlots ?? [];
        if (plots.length === 0) return;
        // 已经落过格的先占住，后面几处不再抢同一格
        const progress: ManorPlot[] = [];
        let changed = false;
        for (const p of plots) {
          if (typeof p.districtId === "number") {
            progress.push(p);
            continue;
          }
          const cell = assignManorCell({ place: p.place, cityId: p.cityId }, progress);
          if (typeof cell.districtId !== "number") {
            progress.push(p);
            continue;
          }
          changed = true;
          progress.push({ ...p, cityId: cell.cityId ?? p.cityId, districtId: cell.districtId });
        }
        if (changed) set({ manorPlots: progress });
        registerManorScenes(progress);
      },

      buildShape: (plotId, index, shape, facing) => {
        const st = get();
        const plot = (st.manorPlots ?? []).find((p) => p.id === plotId);
        if (!plot || plot.cells[index]) return false;
        const cost = SHAPE_COST[shape];
        const paid = spendLowStones(st.spiritStones, cost);
        if (!paid) return false;
        set((s) => ({
          spiritStones: paid,
          manorPlots: (s.manorPlots ?? []).map((p) =>
            p.id === plotId
              ? { ...p, cells: p.cells.map((c, i) => (i === index ? { shape, level: 1, facing: facing ?? 0 } : c)) }
              : p,
          ),
          log: [`你在宅邸里盖起一座「${shape}」，花 ${cost} 下品灵石。`, ...s.log].slice(0, 30),
        }));
        registerManorScenes(get().manorPlots);
        return true;
      },

      flipManorCell: (plotId, index) => {
        const st = get();
        const plot = (st.manorPlots ?? []).find((p) => p.id === plotId);
        if (!plot?.cells[index]) return false;
        set((s) => ({
          manorPlots: (s.manorPlots ?? []).map((p) =>
            p.id === plotId
              ? {
                  ...p,
                  cells: p.cells.map((c, i) =>
                    i === index && c ? { ...c, facing: c.facing === 1 ? 0 : 1 } : c,
                  ),
                }
              : p,
          ),
        }));
        return true;
      },

      assignManorFunction: (plotId, index, fn) => {
        const st = get();
        const plot = (st.manorPlots ?? []).find((p) => p.id === plotId);
        if (!plot?.cells[index] || plot.cells[index]?.rent) return false;
        set((s) => ({
          manorPlots: (s.manorPlots ?? []).map((p) =>
            p.id === plotId ? { ...p, cells: p.cells.map((c, i) => (i === index && c ? { ...c, fn } : c)) } : p,
          ),
        }));
        // 功能变了，贴图归类也跟着变
        registerManorScenes(get().manorPlots);
        return true;
      },

      upgradeManorCell: (plotId, index) => {
        const st = get();
        const plot = (st.manorPlots ?? []).find((p) => p.id === plotId);
        const cell = plot?.cells[index];
        if (!plot || !cell) return false;
        const cost = manorUpgradeCost(cell.shape, cell.level);
        const paid = spendLowStones(st.spiritStones, cost);
        if (!paid) return false;
        set((s) => ({
          spiritStones: paid,
          manorPlots: (s.manorPlots ?? []).map((p) =>
            p.id === plotId
              ? { ...p, cells: p.cells.map((c, i) => (i === index && c ? { ...c, level: c.level + 1 } : c)) }
              : p,
          ),
        }));
        return true;
      },

      demolishManorCell: (plotId, index) => {
        const st = get();
        const plot = (st.manorPlots ?? []).find((p) => p.id === plotId);
        const cell = plot?.cells[index];
        if (!plot || !cell) return false;
        const refund = demolishRefund(cell.shape, cell.level);
        set((s) => ({
          spiritStones: { ...s.spiritStones, low: (Number(s.spiritStones.low) || 0) + refund },
          manorPlots: (s.manorPlots ?? []).map((p) =>
            p.id === plotId ? { ...p, cells: p.cells.map((c, i) => (i === index ? null : c)) } : p,
          ),
          log: [`你拆了宅邸里的「${cell.shape}」，收回 ${refund} 下品灵石。`, ...s.log].slice(0, 30),
        }));
        registerManorScenes(get().manorPlots);
        return true;
      },

      convertManorCell: (plotId, index, shape) => {
        const st = get();
        const plot = (st.manorPlots ?? []).find((p) => p.id === plotId);
        const cell = plot?.cells[index];
        if (!plot || !cell) return false;
        const cost = convertCost(cell.shape, shape, cell.level);
        const paid = spendLowStones(st.spiritStones, cost);
        if (!paid) return false;
        set((s) => ({
          spiritStones: paid,
          manorPlots: (s.manorPlots ?? []).map((p) =>
            p.id === plotId ? { ...p, cells: p.cells.map((c, i) => (i === index && c ? { ...c, shape } : c)) } : p,
          ),
        }));
        registerManorScenes(get().manorPlots);
        return true;
      },

      manorBonus: (fn) => manorBonusOf(get().manorPlots, fn),

      setManorCrop: (plotId, index, crop) => {
        const st = get();
        const plot = (st.manorPlots ?? []).find((p) => p.id === plotId);
        const cell = plot?.cells[index];
        if (!plot || !cell || cell.fn !== "园圃") return false;
        set((s) => ({
          manorPlots: (s.manorPlots ?? []).map((p) =>
            p.id === plotId
              ? { ...p, cells: p.cells.map((c, i) => (i === index && c ? { ...c, crop, lastHarvest: undefined } : c)) }
              : p,
          ),
        }));
        return true;
      },

      settleManorFields: () => {
        const st = get();
        const plots = st.manorPlots ?? [];
        if (plots.length === 0) return;
        const qk = quarterKey(st.currentTime);
        const month = st.currentTime?.month ?? 1;
        const yieldPer = cropYield(manorBonusOf(plots, "园圃"));
        const harvested: { name: string; count: number }[] = [];
        let changed = false;

        const next = plots.map((p) => {
          const culture = p.cityId ? getMarker(p.cityId)?.culture : undefined;
          const cells = p.cells.map((c) => {
            if (!c || c.fn !== "园圃" || !c.crop || c.lastHarvest === qk || c.rent) return c;
            changed = true;
            // 中原、漠北、西域入冬便不收，但仍记下这一季已过
            if (!cropBlockedByWinter(culture, month)) harvested.push({ name: c.crop, count: yieldPer });
            return { ...c, lastHarvest: qk };
          });
          return changed ? { ...p, cells } : p;
        });
        if (!changed) return;

        set((s) => {
          const inventory = [...(s.inventory ?? [])];
          for (const h of harvested) {
            const at = inventory.findIndex((i) => i.name === h.name);
            if (at >= 0) inventory[at] = { ...inventory[at], count: Number(inventory[at].count) + h.count };
            else
              inventory.push({
                id: `crop-${h.name}-${Date.now()}`,
                name: h.name,
                type: "材料",
                grade: "凡品",
                count: h.count,
                icon: "草",
                desc: `${h.name}，自家灵田里收的。`,
              });
          }
          return {
            manorPlots: next,
            inventory,
            log:
              harvested.length > 0
                ? [`灵田收了：${harvested.map((h) => `${h.name}×${h.count}`).join("、")}。`, ...s.log].slice(0, 30)
                : s.log,
          };
        });
      },

      ensureMarket: (cityId, districtId, culture, slots) => {
        const key = manorKey(cityId, districtId);
        const day = daySerial(get().currentTime);
        const known = get().relations;
        const existing = get().markets[key];
        if (existing) {
          // 同一日里货架原样不动，只少了卖掉的；隔了日子才按旧规模重新上货，
          // 顺带把早先没备货的铺子补上，免得门口挂着招牌却进不去
          const synced = syncMarket(existing, cityId, districtId, culture, day, known, get().districtNames);
          if (synced) {
            set((st) => ({ markets: { ...st.markets, [key]: synced } }));
            return synced;
          }
          return existing;
        }
        // 同城同类铺子最多两家：先数一数本城已开的铺面，再定各类还余几家可开
        const used: Record<string, number> = {};
        for (const [k, m] of Object.entries(get().markets)) {
          if (!k.startsWith(`${cityId}:`)) continue;
          for (const s of m.shops ?? []) used[s.kind] = (used[s.kind] ?? 0) + 1;
        }
        const kindBudget: Record<string, number> = {};
        for (const kind of SHOP_KINDS) kindBudget[kind] = Math.max(0, 2 - (used[kind] ?? 0));

        const market = rollMarket(cityId, districtId, culture, slots, day, known, get().districtNames, kindBudget);
        set((st) => ({ markets: { ...st.markets, [key]: market } }));
        return market;
      },

      ensureWorkshop: (cityId, districtId, cityName, culture) => {
        const key = manorKey(cityId, districtId);
        const existing = get().workshops[key];
        if (existing) return existing;
        const workshop = rollWorkshop(`${cityName}·匠人区`, cityId, districtId, culture);
        set((st) => ({ workshops: { ...st.workshops, [key]: workshop } }));
        return workshop;
      },

      placeCustomOrder: ({ offer, npcId, giver, place, cityId, districtId }) => {
        const st = get();
        // 料钱工钱得当面付清；下品不够时自动从上级兑下来
        const paid = spendLowStones(st.spiritStones, offer.price);
        if (!paid) return false;

        const today = daySerial(st.currentTime);
        const item = normalizeItemElements({
          id: `craft-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`,
          name: offer.name,
          type: offer.type,
          grade: offer.grade,
          count: 1,
          icon: offer.icon || offer.name.charAt(0) || "宝",
          desc: offer.desc,
          elements: offer.elements,
        }) as InventoryItem;

        const pact: Pact = {
          id: `pact-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`,
          kind: "pickup",
          name: `定制 · ${item.name}`,
          desc: item.desc,
          giver,
          giverId: npcId,
          place,
          cityId,
          districtId,
          madeDay: today,
          dueDay: today + Math.max(1, Math.trunc(offer.days) || 1),
          item,
          status: "open",
        };

        set({
          spiritStones: paid,
          pacts: [...st.pacts, pact],
          log: [
            `在「${place}」与${giver}说定，付 ${offer.price} 下品灵石定做「${item.name}」，第 ${pact.dueDay} 日来取。`,
            ...st.log,
          ].slice(0, 30),
        });
        return true;
      },

      settlePact: (pactId) => {
        const st = get();
        const pact = st.pacts.find((p) => p.id === pactId);
        // 取货的约定得等日子到，东西还没做成便取不走
        if (!pact || pact.status !== "open" || !pactReady(pact, daySerial(st.currentTime))) return false;

        const today = daySerial(st.currentTime);

        if (pact.kind === "pickup") {
          const item = pact.item
            ? { ...pact.item, id: `i-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}` }
            : undefined;
          set({
            inventory: item ? [...st.inventory, item] : st.inventory,
            pacts: st.pacts.map((p) =>
              p.id === pactId
                ? { ...p, status: "done", settledDay: today, outcome: item ? `取回「${item.name}」。` : "事了了。" }
                : p,
            ),
            log: [`你到「${pact.place}」取回「${pact.item?.name ?? pact.name}」。`, ...st.log].slice(0, 30),
          });
          return true;
        }

        // 口头约定：话说了算，事也办了，情谊上添一点
        set({
          relations: st.relations.map((r) =>
            r.id === pact.giverId ? { ...r, relation: Math.min(100, migrateRelation(r).relation + PACT_KEPT_AFFINITY * 2) } : r,
          ),
          pacts: st.pacts.map((p) =>
            p.id === pactId ? { ...p, status: "done", settledDay: today, outcome: "话说了算，事也办了。" } : p,
          ),
          log: [`你与「${pact.giver}」说定的事践了。`, ...st.log].slice(0, 30),
        });
        return true;
      },

      /** 口头之约误过宽限的日子：情谊上折一点，这桩事也就黄了 */
      expirePacts: () => {
        const st = get();
        const today = daySerial(st.currentTime);
        const lapsed = st.pacts.filter((p) => pactLapsed(p, today));
        if (lapsed.length === 0) return;

        set({
          relations: st.relations.map((r) =>
            lapsed.some((p) => p.giverId === r.id)
              ? { ...r, relation: Math.max(-100, migrateRelation(r).relation - PACT_OVERDUE_AFFINITY * 2) }
              : r,
          ),
          pacts: st.pacts.map((p) =>
            lapsed.includes(p)
              ? { ...p, status: "failed", settledDay: today, outcome: `说定的事误了，「${p.giver}」心里记下这笔。` }
              : p,
          ),
          log: [...lapsed.map((p) => `与「${p.giver}」说定的「${p.name}」误了日子，情谊上折了些。`), ...st.log].slice(0, 30),
        });
      },

      setShopInfo: (key, shopId, info) =>
        set((st) => {
          const market = st.markets[key];
          if (!market) return st;
          return {
            markets: {
              ...st.markets,
              [key]: {
                ...market,
                shops: market.shops.map((shop) => (shop.id === shopId ? { ...shop, info } : shop)),
              },
            },
          };
        }),

      buyGood: ({ key, shopId, goodName, price }) => {
        const st = get();
        const market = st.markets[key];
        const shop = market?.shops.find((s) => s.id === shopId);
        const good = shop?.goods?.find((g) => g.name === goodName);
        if (!market || !shop || !good || good.stock <= 0) return false;
        const taken = Math.max(0, Math.trunc(price));
        const paid = spendLowStones(st.spiritStones, taken);
        if (!paid) return false;

        const patchShop = (s: typeof shop) =>
          s.id === shopId && s.goods
            ? { ...s, goods: s.goods.map((g) => (g.name === goodName ? { ...g, stock: g.stock - 1 } : g)) }
            : s;

        // 行囊里已有同名同类的东西就摞上去，免得买几回就多出几行
        const type = itemTypeFor(shop.kind);
        const stacked = st.inventory.find((i) => i.name === good.name && i.type === type);

        set({
          spiritStones: paid,
          inventory: stacked
            ? st.inventory.map((i) => (i.id === stacked.id ? { ...i, count: i.count + 1 } : i))
            : [
                ...st.inventory,
                {
                  id: `i-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`,
                  name: good.name,
                  type,
                  // 品阶看底价定，讲价讲下来的便宜不该把东西的品阶也压下去
                  grade: gradeForPrice(good.base),
                  count: 1,
                  icon: good.name.charAt(0),
                  desc: good.desc || goodDesc(good.name) || `在「${shop.name}」买的。`,
                  // 收来的旧物：留着这一笔，往后有了鉴宝的门道再细看
                  ...(good.mystery ? { mystery: true } : {}),
                },
              ],
          markets: { ...st.markets, [key]: { ...market, shops: market.shops.map(patchShop) } },
          log: [`你在「${shop.name}」花了 ${taken} 下品灵石，买下${good.name}。`, ...st.log].slice(0, 30),
        });
        return true;
      },

      buyFromNarrative: ({ name, price, count = 1, type, desc }) => {
        const st = get();
        const itemName = String(name ?? "").trim();
        if (!itemName) return false;
        const take = Math.max(1, Math.min(99, Math.trunc(count) || 1));
        const unit = Math.max(0, Math.round(price));
        const cost = unit * take;
        const paid = spendLowStones(st.spiritStones, cost);
        if (!paid) return false;

        const kind = type ?? "杂物";
        // 品阶看单价定，讲价讲下来的便宜不该把东西的品阶也压下去
        const grade = gradeForPrice(unit);
        // 行囊里已有同名同类的东西就摞上去，免得买几回就多出几行
        const stacked = st.inventory.find((i) => i.name === itemName && i.type === kind);

        set({
          spiritStones: paid,
          inventory: stacked
            ? st.inventory.map((i) => (i.id === stacked.id ? { ...i, count: i.count + take } : i))
            : [
                ...st.inventory,
                {
                  id: `i-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`,
                  name: itemName,
                  type: kind,
                  grade,
                  count: take,
                  icon: itemName.charAt(0),
                  desc: desc || "经一番讲价买下的。",
                },
              ],
          log: [`你花了 ${cost} 下品灵石，买下${itemName}${take > 1 ? ` ${take} 件` : ""}。`, ...st.log].slice(0, 30),
        });
        return true;
      },

      sellItem: ({ itemId, totalPrice, count }) => {
        const st = get();
        const item = st.inventory.find((i) => i.id === itemId);
        if (!item) return false;

        const take = Math.max(1, Math.min(Math.trunc(count) || 1, item.count));
        const gain = Math.max(1, Math.round(Math.max(0, totalPrice)));
        const rest = item.count - take;

        set({
          spiritStones: { ...st.spiritStones, low: st.spiritStones.low + gain },
          inventory:
            rest > 0
              ? st.inventory.map((i) => (i.id === itemId ? { ...i, count: rest } : i))
              : st.inventory.filter((i) => i.id !== itemId),
          log: [`你卖掉「${item.name}」${take} 件，得 ${gain} 下品灵石。`, ...st.log].slice(0, 30),
        });
        return true;
      },

      giveItemAway: ({ itemId, count = 1, toName }) => {
        const st = get();
        const item = st.inventory.find((i) => i.id === itemId);
        if (!item) return false;

        const take = Math.max(1, Math.min(Math.trunc(count) || 1, item.count));
        const rest = item.count - take;
        set({
          inventory:
            rest > 0
              ? st.inventory.map((i) => (i.id === itemId ? { ...i, count: rest } : i))
              : st.inventory.filter((i) => i.id !== itemId),
          log: [
            `你把「${item.name}」${take > 1 ? `${take}件` : ""}递与${toName || "人"}。`,
            ...st.log,
          ].slice(0, 30),
        });
        return true;
      },

      setManorBackground: (key, background) =>
        set((st) => {
          const manor = st.manors[key];
          if (!manor) return st;
          return { manors: { ...st.manors, [key]: { ...manor, background } } };
        }),

      admitManor: (key) =>
        set((st) => {
          const manor = st.manors[key];
          if (!manor || manor.admitted) return st;
          return {
            manors: { ...st.manors, [key]: { ...manor, admitted: true } },
            log: [`你得了「${manor.surname}府」允准，往后可以进门拜会。`, ...st.log].slice(0, 30),
          };
        }),

      advanceTime: (hours = 1) => {
        set((st) => {
          const currentTime = shiftGameTime(st.currentTime, hours);
          // 按时辰算的增益，走到点上就自行消了
          const buffs = pruneBuffs(st.player.buffs, currentTime);
          // 又处了一日，随身的灵兽跟你更近一层；只按日算，不按时辰算
          const turnedDay = gameDateKey(st.currentTime) !== gameDateKey(currentTime);
          const beast = st.beast && turnedDay ? raiseBond(st.beast, 1) : st.beast;
          if (buffs === st.player.buffs && beast === st.beast) return { currentTime };
          return { currentTime, player: { ...st.player, buffs }, beast };
        });
        // 日子往前走了，误期的机缘该罚的罚，过了期的当票该作废，雇来的镖师也该告辞了
        get().expireQuests();
        // 手上若已攒够某样东西或某数灵石，物品、灵石两类机缘就地了结
        get().settleAssetQuests();
        get().expirePawns();
        get().expireEscorts();
        // 名下房产的完好度也随日子往下掉
        get().settleEstates();
        // 坊市里的铺面按月结一次账
        get().settlePlayerShops();
        // 名下城村按月来贡
        get().settleOccupations();
        // 灵田按季度结一次收获
        get().settleManorFields();
        get().expirePacts();
        // 人还在山门里，今日开讲的时辰若已过，缺勤的账顺手算一算
        get().settleLecture();
        // 日子翻过一篇，宗门各处建筑的产出与维护也该入账
        get().settleFacilities();
        // 别家山门的账也照日往前推，各有各的进项
        get().settleSectSites();
        // 好战的门派或在这一日启衅，夺城结仇
        get().settleAiSectWars();
        // 走过这一段路，兴许路上生变；掷中的便开一扇关不上的窗
        void import("@/store/useAIStore")
          .then(({ useAIStore }) => useAIStore.getState().maybeTriggerRandomEvent(hours))
          .catch(() => {});
        // 舆图上兴许又生出一处奇遇，落在眼前这一带
        void import("@/store/useAIStore")
          .then(({ useAIStore }) => useAIStore.getState().maybeSpawnAdventure(hours))
          .catch(() => {});
        // 每月至少开一处非任务奇遇：当月还空着，便在走过这一段时补上
        void import("@/store/useAIStore")
          .then(({ useAIStore }) => useAIStore.getState().ensureMonthlyAdventure())
          .catch(() => {});
        // 重伤不愈：气血不满两成，每过一个时辰再掉一点；油尽灯枯、寿元耗尽都是终局
        get().tickMortality(Math.max(0, Math.trunc(hours)));
      },

      payStones: (amount) => {
        const st = get();
        const cost = Math.max(0, Math.trunc(amount));
        // 下品不够时，自动从中品往上按一比一百兑下来
        const paid = spendLowStones(st.spiritStones, cost);
        if (!paid) return false;
        set({ spiritStones: paid });
        return true;
      },

      busk: (skillName) => {
        const st = get();
        const skill = findSkill(st.skills, skillName);
        const level = skill?.level ?? 0;
        let penalty = 0;
        let reward = 0;
        let folk = 0;
        let passed = 0;
        const rounds: BuskResult["rounds"] = [];

        // 连考五回：摊子越往后越难招呼，失手一次，往后的场子便难做几分
        for (let i = 1; i <= 5; i++) {
          const dc = 10 + i;
          const roll = 1 + Math.floor(Math.random() * 20);
          const total = roll + level - penalty;
          const success = total >= dc;
          const base = 6 + i * 2;
          const gain = success ? Math.max(1, base - penalty) : 0;
          if (success) {
            reward += gain;
            passed += 1;
          } else {
            penalty += 3;
            folk -= 2;
          }
          rounds.push({ index: i, dc, roll, level, total, success, reward: gain, penalty });
        }

        set((s) => ({
          spiritStones: { ...s.spiritStones, low: (Number(s.spiritStones.low) || 0) + reward },
          reputation: shiftReputation(s.reputation, "folk", folk),
          log: [
            `你在街头卖艺（${skill?.name ?? skillName}），过 ${passed}/5 关，得 ${reward} 下品灵石。`,
            ...s.log,
          ].slice(0, 30),
        }));

        return { skill: skill?.name ?? skillName, rounds, passed, reward, folkDelta: folk, penalty };
      },

      getSnapshot: () => {
        const st = get();
        try {
          return JSON.parse(JSON.stringify({
            player: st.player,
            techniques: st.techniques,
            inventory: st.inventory,
            spiritStones: st.spiritStones,
            reputation: st.reputation,
            beast: st.beast,
            sect: st.sect,
            relations: st.relations,
            villages: st.villages,
            estates: st.estates,
            manorPlots: st.manorPlots,
            playerShops: st.playerShops,
            sectRelations: st.sectRelations,
            occupations: st.occupations,
            lastSectWarDay: st.lastSectWarDay,
            talismanRecipes: st.talismanRecipes,
            alchemyRecipes: st.alchemyRecipes,
            manors: st.manors,
            markets: st.markets,
            sectSites: st.sectSites,
            log: st.log,
            currentPlaceId: st.currentPlaceId,
            currentSectId: st.currentSectId,
            currentAdventureId: st.currentAdventureId,
            currentLocation: st.currentLocation,
            pillCache: st.pillCache,
            currentTime: st.currentTime,
            news: st.news,
            districtNames: st.districtNames,
            priceAdjusts: st.priceAdjusts,
            rumors: st.rumors,
            skills: st.skills,
            checks: st.checks,
            quests: st.quests,
            waseShows: st.waseShows,
            pawns: st.pawns,
            workshops: st.workshops,
            pacts: st.pacts,
            adventures: st.adventures,
          }));
        } catch (e) {
          console.warn("[getSnapshot] Failed to snapshot:", e);
          return {
            player: st.player,
            techniques: st.techniques,
            inventory: st.inventory,
            spiritStones: st.spiritStones,
            reputation: st.reputation,
            beast: st.beast,
            sect: st.sect,
            relations: st.relations,
            log: st.log,
            currentPlaceId: st.currentPlaceId,
            currentSectId: st.currentSectId,
            currentAdventureId: st.currentAdventureId,
            currentLocation: st.currentLocation,
            pillCache: st.pillCache,
            currentTime: st.currentTime,
            news: st.news,
            districtNames: st.districtNames,
            priceAdjusts: st.priceAdjusts,
            rumors: st.rumors,
            skills: st.skills,
            checks: st.checks,
            quests: st.quests,
            waseShows: st.waseShows,
            pawns: st.pawns,
            workshops: st.workshops,
            pacts: st.pacts,
            adventures: st.adventures,
            talismanRecipes: st.talismanRecipes,
            alchemyRecipes: st.alchemyRecipes,
            manors: st.manors,
            markets: st.markets,
            sectSites: st.sectSites,
          };
        }
      },

      restoreSnapshot: (snap) => {
        const clone = (obj: any) => {
          if (obj == null) return obj;
          try {
            return JSON.parse(JSON.stringify(obj));
          } catch {
            return obj;
          }
        };
        set({
          player: clone(snap.player),
          techniques: Array.isArray(snap.techniques) ? clone(snap.techniques) : [],
          inventory: Array.isArray(snap.inventory) ? clone(snap.inventory) : [],
          spiritStones: clone(snap.spiritStones),
          reputation: normalizeReputation(snap.reputation),
          beast: normalizeBeast(snap.beast),
          ending: null,
          talismanRecipes: Array.isArray(snap.talismanRecipes) ? clone(snap.talismanRecipes) : [],
          alchemyRecipes: Array.isArray(snap.alchemyRecipes) ? clone(snap.alchemyRecipes) : [],
          manors: snap.manors ? clone(snap.manors) : {},
          markets: snap.markets ? clone(snap.markets) : {},
          // 旧存档没有这一项：只好留用眼前这一套，免得名号换了、与已占的城村对不上
          sectSites: Array.isArray(snap.sectSites) ? clone(snap.sectSites) : get().sectSites,
          sect: normalizeSectData(clone(snap.sect)),
          relations: Array.isArray(snap.relations) ? clone(snap.relations) : [],
          currentPanel: null,
          craftingTab: "talisman",
          currentPlaceId: getMarker(snap.currentPlaceId ?? "") ? (snap.currentPlaceId as string) : getDefaultPlaceId(),
          currentSectId: typeof snap.currentSectId === "string" ? snap.currentSectId : undefined,
          currentAdventureId: typeof snap.currentAdventureId === "string" ? snap.currentAdventureId : undefined,
          mapSceneId: WORLD_SCENE_ID,
          currentLocation: resolveLocation(snap.currentLocation) ?? "home",
          log: Array.isArray(snap.log) ? clone(snap.log) : [],
          pillCache: clone(snap.pillCache || {}),
          news: snap.news ? clone(snap.news) : { items: [], lastUpdate: "" },
          villages: snap.villages ? clone(snap.villages) : {},
          estates: Array.isArray(snap.estates) ? clone(snap.estates) : [],
          manorPlots: Array.isArray(snap.manorPlots) ? clone(snap.manorPlots) : [],
          playerShops: Array.isArray(snap.playerShops) ? clone(snap.playerShops) : [],
          sectRelations: Array.isArray(snap.sectRelations) ? clone(snap.sectRelations) : [],
          occupations: Array.isArray(snap.occupations) ? clone(snap.occupations) : [],
          lastSectWarDay: Number.isFinite(Number(snap.lastSectWarDay))
            ? Math.max(0, Math.trunc(Number(snap.lastSectWarDay)))
            : 0,
          currentTime: normalizeGameTime(snap.currentTime, OPENING_GAME_TIME),
          districtNames: snap.districtNames ? clone(snap.districtNames) : {},
          priceAdjusts: Array.isArray(snap.priceAdjusts) ? clone(snap.priceAdjusts) : [],
          rumors: Array.isArray(snap.rumors) ? clone(snap.rumors) : [],
          skills: Array.isArray(snap.skills) ? clone(snap.skills) : [],
          checks: Array.isArray(snap.checks) ? clone(snap.checks) : [],
          quests: Array.isArray(snap.quests) ? clone(snap.quests) : [],
          waseShows: snap.waseShows ? clone(snap.waseShows) : { day: 0, count: 0 },
          pawns: Array.isArray(snap.pawns) ? clone(snap.pawns) : [],
          workshops: snap.workshops ? clone(snap.workshops) : {},
          pacts: Array.isArray(snap.pacts) ? clone(snap.pacts) : [],
          adventures: Array.isArray(snap.adventures) ? clone(snap.adventures) : get().adventures,
        });
      },
    }),
    {
      name: "xiuxian-save",
      version: 31,
      migrate: (state: any, version: number) => {
        if (version < 2) {
          if (state.techniques && Array.isArray(state.techniques)) {
            state.techniques = state.techniques.map((t: any) => {
              if (t.category === "主修") {
                return { ...t, category: "心法" };
              }
              if (t.category === "辅修") {
                if (t.name.includes("身法") || t.name.includes("遁") || t.name.includes("步")) {
                  return { ...t, category: "身法" };
                }
                if (t.name.includes("诀") && !t.name.includes("心") && !t.name.includes("法")) {
                  return { ...t, category: "炼体" };
                }
                if (t.name.includes("指") || t.name.includes("掌") || t.name.includes("剑") || t.name.includes("雷") || t.name.includes("冰") || t.name.includes("火")) {
                  return { ...t, category: "神通" };
                }
                return { ...t, category: "心法" };
              }
              return t;
            });
          }

          const hasSecretTechnique = state.techniques?.some((t: any) => t.category === "秘术");
          if (!hasSecretTechnique) {
            state.techniques = state.techniques || [];
            state.techniques.push({
              id: "t6",
              name: "龟息诀",
              grade: "灵品",
              category: "秘术",
              daoPath: "elemental",
              element: "土",
              nature: "稳",
              proficiency: 1500,
              proficiencyMax: 6000,
              insight: "龟息潜藏，隐于天地，呼吸之间，生机不绝。",
              description: "保命秘术，可假死遁逃，封印自身气息，推演周围环境变化。",
              heartMatch: ["谨慎", "仁厚"],
              heartCompatibility: [
                { trait: "谨慎", bonus: 30 },
                { trait: "仁厚", bonus: 15 },
                { trait: "执着", bonus: 10 },
                { trait: "勇猛", bonus: -20 },
                { trait: "狡黠", bonus: -15 },
              ],
              attributes: { earth: 70, vitality: 20, stealth: 50 },
              prerequisites: [{ type: "realm", value: "炼气" }, { type: "heartTrait", value: "谨慎" }],
              basePracticeSpeed: 75,
              levels: [],
              skills: [],
            });
          }
        }

        if (version < 3) {
          if (state.player?.stats) {
            const oldTraits = state.player.stats.heartTraits || [];
            state.player.stats.heartScores = [
              { trait: "刚毅", score: oldTraits.includes("刚毅") ? 70 : 30 + Math.floor(Math.random() * 30) },
              { trait: "狡黠", score: oldTraits.includes("狡黠") ? 70 : 30 + Math.floor(Math.random() * 30) },
              { trait: "仁厚", score: oldTraits.includes("仁厚") ? 70 : 30 + Math.floor(Math.random() * 30) },
              { trait: "无情", score: oldTraits.includes("无情") ? 70 : 30 + Math.floor(Math.random() * 30) },
              { trait: "谨慎", score: oldTraits.includes("谨慎") ? 70 : 30 + Math.floor(Math.random() * 30) },
              { trait: "勇猛", score: oldTraits.includes("勇猛") ? 70 : 30 + Math.floor(Math.random() * 30) },
              { trait: "聪慧", score: oldTraits.includes("聪慧") ? 70 : 30 + Math.floor(Math.random() * 30) },
              { trait: "执着", score: oldTraits.includes("执着") ? 70 : 30 + Math.floor(Math.random() * 30) },
            ];
            delete state.player.stats.heartTraits;
          }

          if (state.player?.meridians) {
            const ZONE_MAP: Record<string, string> = {
              "神魂脉": "head",
              "督脉": "head",
              "任脉": "chest",
              "丹田气脉": "abdomen",
              "冲脉": "abdomen",
              "带脉": "abdomen",
              "双臂脉": "arm_right",
              "手太阴肺经": "arm_right",
              "手阳明大肠经": "arm_left",
              "阴维脉": "arm_left",
              "阳维脉": "arm_right",
              "双腿脉": "leg_right",
              "足太阴脾经": "leg_right",
              "足阳明胃经": "leg_left",
              "阴跷脉": "leg_left",
              "阳跷脉": "leg_right",
            };
            state.player.meridians = (Array.isArray(state.player.meridians) ? state.player.meridians : []).map((m: any) => ({
              ...m,
              zone: ZONE_MAP[m.name] || "chest",
            }));
          }
        }

        if (version < 4) {
          if (state.player && !state.player.buffs) {
            state.player.buffs = [];
          }
          if (state.player && !state.player.shields) {
            state.player.shields = [];
          }
        }

        if (version < 5) {
          if (state.player && state.player.activeHeartTechnique === undefined) {
            state.player.activeHeartTechnique = null;
          }
        }

        if (version < 6) {
          if (state.techniques && Array.isArray(state.techniques)) {
            state.techniques = state.techniques.map((t: any) => {
              if (!t.heartCompatibility) {
                const defaultCompat: Record<string, { trait: string; bonus: number }[]> = {
                  "太上引气篇": [{ trait: "谨慎", bonus: 25 }, { trait: "聪慧", bonus: 20 }, { trait: "执着", bonus: 15 }, { trait: "勇猛", bonus: -10 }, { trait: "无情", bonus: -15 }],
                  "玄水诀": [{ trait: "谨慎", bonus: 20 }, { trait: "仁厚", bonus: 15 }, { trait: "执着", bonus: 10 }, { trait: "勇猛", bonus: -15 }, { trait: "无情", bonus: -10 }],
                  "青木长生功": [{ trait: "仁厚", bonus: 25 }, { trait: "执着", bonus: 20 }, { trait: "谨慎", bonus: 15 }, { trait: "无情", bonus: -15 }, { trait: "狡黠", bonus: -10 }],
                  "流云身法": [{ trait: "勇猛", bonus: 20 }, { trait: "狡黠", bonus: 25 }, { trait: "敏捷", bonus: 15 }, { trait: "谨慎", bonus: -15 }, { trait: "执着", bonus: -10 }],
                  "寒霜指": [{ trait: "刚毅", bonus: 25 }, { trait: "无情", bonus: 20 }, { trait: "勇猛", bonus: 15 }, { trait: "仁厚", bonus: -20 }, { trait: "谨慎", bonus: -10 }],
                  "龟息诀": [{ trait: "谨慎", bonus: 30 }, { trait: "仁厚", bonus: 15 }, { trait: "执着", bonus: 10 }, { trait: "勇猛", bonus: -20 }, { trait: "狡黠", bonus: -15 }],
                };
                return {
                  ...t,
                  heartCompatibility: defaultCompat[t.name] || [],
                  basePracticeSpeed: t.basePracticeSpeed || 100,
                  attributes: t.attributes || {},
                  prerequisites: t.prerequisites || [],
                };
              }
              return t;
            });
          }
        }

        if (version < 7) {
          if (state.inventory && Array.isArray(state.inventory)) {
            state.inventory = state.inventory.map((item: any) => normalizeItemElements(item));
          }
          if (!state.pillCache) {
            state.pillCache = {};
          }
        }

        if (version < 8) {
          if (!Array.isArray(state.techniques)) state.techniques = [];
          if (!Array.isArray(state.inventory)) state.inventory = [];
          if (!Array.isArray(state.relations)) state.relations = [];
          if (!Array.isArray(state.log)) state.log = [];
          if (state.player) {
            if (!Array.isArray(state.player.spiritRoots)) state.player.spiritRoots = [];
            if (!Array.isArray(state.player.meridians)) state.player.meridians = [];
            if (!Array.isArray(state.player.buffs)) state.player.buffs = [];
            if (!Array.isArray(state.player.shields)) state.player.shields = [];
            if (!Array.isArray(state.player.timeline)) state.player.timeline = [];
            if (state.player.stats) {
              if (!Array.isArray(state.player.stats.heartScores)) state.player.stats.heartScores = [];
              if (!Array.isArray(state.player.stats.heartTraits)) state.player.stats.heartTraits = [];
            }
          }
          if (state.sect) {
            if (!Array.isArray(state.sect.tasks)) state.sect.tasks = [];
            if (!Array.isArray(state.sect.positions)) state.sect.positions = [];
            if (!Array.isArray(state.sect.shop)) state.sect.shop = [];
            if (!Array.isArray(state.sect.heritage)) state.sect.heritage = [];
            if (!Array.isArray(state.sect.resources)) state.sect.resources = [];
            if (state.sect.management) {
              if (!Array.isArray(state.sect.management.industries)) state.sect.management.industries = [];
              if (!Array.isArray(state.sect.management.activities)) state.sect.management.activities = [];
              if (!Array.isArray(state.sect.management.halls)) state.sect.management.halls = [];
              if (state.sect.management.treasury && !Array.isArray(state.sect.management.treasury.materials)) {
                state.sect.management.treasury.materials = [];
              }
              if (state.sect.management.consumption && !Array.isArray(state.sect.management.consumption.recentConsumption)) {
                state.sect.management.consumption.recentConsumption = [];
              }
            }
          }
          if (state.news && !Array.isArray(state.news.items)) {
            state.news.items = [];
          }
        }
        if (version < 9) {
          const MAX_ARRAY = 200;
          if (Array.isArray(state.techniques)) state.techniques = state.techniques.slice(0, MAX_ARRAY);
          if (Array.isArray(state.inventory)) state.inventory = state.inventory.slice(0, MAX_ARRAY);
          if (Array.isArray(state.relations)) state.relations = state.relations.slice(0, MAX_ARRAY);
          if (Array.isArray(state.log)) state.log = state.log.slice(0, 30);
          if (state.player) {
            if (Array.isArray(state.player.meridians)) state.player.meridians = state.player.meridians.slice(0, 30);
            if (Array.isArray(state.player.timeline)) state.player.timeline = state.player.timeline.slice(0, 50);
            if (Array.isArray(state.player.buffs)) state.player.buffs = state.player.buffs.slice(0, 50);
            if (Array.isArray(state.player.shields)) state.player.shields = state.player.shields.slice(0, 50);
            if (state.player.stats && Array.isArray(state.player.stats.heartScores)) {
              state.player.stats.heartScores = state.player.stats.heartScores.slice(0, 20);
            }
          }
          if (state.sect) {
            if (Array.isArray(state.sect.tasks)) state.sect.tasks = state.sect.tasks.slice(0, 50);
            if (Array.isArray(state.sect.positions)) state.sect.positions = state.sect.positions.slice(0, 30);
            if (Array.isArray(state.sect.shop)) state.sect.shop = state.sect.shop.slice(0, 50);
            if (Array.isArray(state.sect.heritage)) state.sect.heritage = state.sect.heritage.slice(0, 50);
            if (Array.isArray(state.sect.resources)) state.sect.resources = state.sect.resources.slice(0, 50);
          }
          if (state.pillCache && typeof state.pillCache === "object") {
            const keys = Object.keys(state.pillCache);
            if (keys.length > 100) {
              const newCache: Record<string, any> = {};
              for (const k of keys.slice(0, 100)) {
                newCache[k] = state.pillCache[k];
              }
              state.pillCache = newCache;
            }
          }
        }

        if (version < 10) {
          if (state.player) {
            if (typeof state.player.stats !== "object" || state.player.stats === null) {
              state.player.stats = {
                vitality: 0,
                soul: 0,
                wisdom: 0,
                agility: 0,
                heartScores: [],
              };
            } else {
              if (typeof state.player.stats.vitality !== "number") state.player.stats.vitality = 0;
              if (typeof state.player.stats.soul !== "number") state.player.stats.soul = 0;
              if (typeof state.player.stats.wisdom !== "number") state.player.stats.wisdom = 0;
              if (typeof state.player.stats.agility !== "number") state.player.stats.agility = 0;
              if (!Array.isArray(state.player.stats.heartScores)) state.player.stats.heartScores = [];
            }
            if (!Array.isArray(state.player.meridians)) state.player.meridians = [];
            if (!Array.isArray(state.player.spiritRoots)) state.player.spiritRoots = [];
            if (!Array.isArray(state.player.buffs)) state.player.buffs = [];
            if (!Array.isArray(state.player.shields)) state.player.shields = [];
            if (!Array.isArray(state.player.timeline)) state.player.timeline = [];
          }
          if (!Array.isArray(state.techniques)) state.techniques = [];
          if (!Array.isArray(state.inventory)) state.inventory = [];
          if (!Array.isArray(state.relations)) state.relations = [];
          if (!Array.isArray(state.log)) state.log = [];
          if (state.sect) {
            if (!Array.isArray(state.sect.positions)) state.sect.positions = [];
            if (!Array.isArray(state.sect.tasks)) state.sect.tasks = [];
          }
        }

        if (version < 11) {
          if (!state.player) {
            state.player = { ...initialPlayer, stats: { vitality: 50, soul: 50, wisdom: 50, agility: 50, heartScores: [] }, spiritRoots: [], meridians: [], timeline: [], buffs: [], shields: [], activeHeartTechnique: null };
          } else {
            if (!state.player.name || typeof state.player.name !== "string") state.player.name = "玩家";
            if (!state.player.title || typeof state.player.title !== "string") state.player.title = "无名之辈";
            if (!state.player.realm || typeof state.player.realm !== "string") state.player.realm = "引气初期";
            if (typeof state.player.realmIndex !== "number") state.player.realmIndex = 0;
            if (typeof state.player.cultivation !== "number") state.player.cultivation = 0;
            if (typeof state.player.hp !== "number") state.player.hp = 100;
            if (typeof state.player.hpMax !== "number") state.player.hpMax = 100;
            if (typeof state.player.mp !== "number") state.player.mp = 50;
            if (typeof state.player.mpMax !== "number") state.player.mpMax = 50;
            if (typeof state.player.spirit !== "number") state.player.spirit = 0;
            if (typeof state.player.spiritMax !== "number") state.player.spiritMax = 100;
            if (typeof state.player.lifespanCurrent !== "number") state.player.lifespanCurrent = 100;
            if (typeof state.player.lifespanMax !== "number") state.player.lifespanMax = 100;
            if (!state.player.body || typeof state.player.body !== "string") state.player.body = "凡人之躯";
            if (!state.player.fortune || typeof state.player.fortune !== "string") state.player.fortune = "平庸";
            if (typeof state.player.karma !== "number") state.player.karma = 50;
            if (!state.player.position || typeof state.player.position !== "string") state.player.position = "";
            if (!state.player.sectName || typeof state.player.sectName !== "string") state.player.sectName = "";
            if (!state.player.description || typeof state.player.description !== "string") state.player.description = "";
            if (!state.player.personality || typeof state.player.personality !== "string") state.player.personality = "";
            if (!state.player.background || typeof state.player.background !== "string") state.player.background = "";

            if (typeof state.player.stats !== "object" || state.player.stats === null) {
              state.player.stats = { vitality: 50, soul: 50, wisdom: 50, agility: 50, heartScores: [] };
            } else {
              if (typeof state.player.stats.vitality !== "number") state.player.stats.vitality = 50;
              if (typeof state.player.stats.soul !== "number") state.player.stats.soul = 50;
              if (typeof state.player.stats.wisdom !== "number") state.player.stats.wisdom = 50;
              if (typeof state.player.stats.agility !== "number") state.player.stats.agility = 50;
              if (!Array.isArray(state.player.stats.heartScores)) state.player.stats.heartScores = [];
            }

            if (!Array.isArray(state.player.spiritRoots)) state.player.spiritRoots = [];
            if (!Array.isArray(state.player.meridians)) state.player.meridians = [];
            if (!Array.isArray(state.player.timeline)) state.player.timeline = [];
            if (!Array.isArray(state.player.buffs)) state.player.buffs = [];
            if (!Array.isArray(state.player.shields)) state.player.shields = [];
          }

          if (!Array.isArray(state.techniques)) state.techniques = [];
          if (!Array.isArray(state.inventory)) state.inventory = [];
          if (!Array.isArray(state.relations)) state.relations = [];
          if (!Array.isArray(state.log)) state.log = [];

          if (!state.spiritStones || typeof state.spiritStones !== "object") {
            state.spiritStones = { low: 0, mid: 0, high: 0, supreme: 0 };
          } else {
            if (typeof state.spiritStones.low !== "number") state.spiritStones.low = 0;
            if (typeof state.spiritStones.mid !== "number") state.spiritStones.mid = 0;
            if (typeof state.spiritStones.high !== "number") state.spiritStones.high = 0;
            if (typeof state.spiritStones.supreme !== "number") state.spiritStones.supreme = 0;
          }

          if (state.sect) {
            if (!state.sect.name || typeof state.sect.name !== "string") state.sect.name = "";
            if (typeof state.sect.level !== "number") state.sect.level = 1;
            if (!state.sect.leader || typeof state.sect.leader !== "string") state.sect.leader = "";
            if (typeof state.sect.contribution !== "number") state.sect.contribution = 0;
            if (!Array.isArray(state.sect.positions)) state.sect.positions = [];
            if (!Array.isArray(state.sect.tasks)) state.sect.tasks = [];
          }
        }
        if (version < 12) {
          state.currentTime = normalizeGameTime(state.currentTime, OPENING_GAME_TIME);
        }
        if (version < 13) {
          if (state.sect && typeof state.sect === "object") {
            if (typeof state.sect.appearance !== "string") state.sect.appearance = "";
            if (typeof state.sect.reputationDesc !== "string") state.sect.reputationDesc = "";
            if (typeof state.sect.surroundings !== "string") state.sect.surroundings = "";
          }
        }
        if (version < 14) {
          // 早期 dataOps 把 basePracticeSpeed 按 1~3 的比例写入，使修炼增益被压到千分之一；这里统一到 100 基准
          if (Array.isArray(state.techniques)) {
            state.techniques = state.techniques.map((t: any) => {
              if (!t || typeof t !== "object") return t;
              const speed = Number(t.basePracticeSpeed);
              if (!Number.isFinite(speed) || speed <= 0) return { ...t, basePracticeSpeed: 100 };
              if (speed < 10) return { ...t, basePracticeSpeed: Math.round(speed * 100) };
              return t;
            });
          }
          // 补齐材料与丹药的 elements，让炼丹炉的元素与火候判定重新可用
          if (Array.isArray(state.inventory)) {
            state.inventory = state.inventory.map((item: any) => normalizeItemElements(item));
          }
        }
        if (version < 15) {
          // 旧存档没有地点概念，统一落在默认城池，避免光标无处安放
          if (!getMarker(state.currentPlaceId)) state.currentPlaceId = getDefaultPlaceId();
          state.mapSceneId = WORLD_SCENE_ID;
        }
        if (version < 16) {
          // 纪年改为修真历：开局是 514 年，旧存档的年份从 1 起算，整体平移保留已流逝的岁月
          state.currentTime = normalizeGameTime(state.currentTime, OPENING_GAME_TIME);
          state.currentTime.year += ERA_YEAR_OFFSET;
        }
        if (version < 17) {
          // 开局时辰由子时改为卯时。只动还停在开局那一刻的存档，已经走过的日子不碰
          const t = normalizeGameTime(state.currentTime, OPENING_GAME_TIME);
          const atOpening = t.year === OPENING_GAME_TIME.year
            && t.month === OPENING_GAME_TIME.month
            && t.day === OPENING_GAME_TIME.day
            && t.hour === 0;
          if (atOpening) state.currentTime = { ...t, hour: OPENING_GAME_TIME.hour };
        }
        if (version < 18) {
          // 城市改用编号后，旧存档里存的是拼音 slug，按编号表平移过来，保住所在地
          if (!getMarker(state.currentPlaceId)) {
            const migrated = LEGACY_PLACE_IDS[state.currentPlaceId];
            if (migrated) state.currentPlaceId = migrated;
          }
        }
        if (version < 19) {
          // 街区名字是叙事后来才写得上的，旧存档没有这一项
          if (!state.districtNames || typeof state.districtNames !== "object") {
            state.districtNames = {};
          }
        }
        if (version < 20) {
          // 大户人家是后来才做的一层，旧存档里没有宅子，头一回推门时再掷
          if (!state.manors || typeof state.manors !== "object") {
            state.manors = {};
          }
        }
        if (version < 21) {
          // 坊市铺面同样是后加的，旧存档里没有，头一回进坊市时再开市
          if (!state.markets || typeof state.markets !== "object") {
            state.markets = {};
          }
        }
        if (version < 22) {
          // 货物的时效价格修正是随杂货铺一起加的，旧存档里没有这一项
          if (!Array.isArray(state.priceAdjusts)) {
            state.priceAdjusts = [];
          }
        }
        if (version < 23) {
          // 流言是随打尖一起加的，旧存档里没有这一项
          if (!Array.isArray(state.rumors)) {
            state.rumors = [];
          }
        }
        if (version < 24) {
          // 市井本事与判定是后加的，旧存档里没有这两项
          if (!Array.isArray(state.skills)) {
            state.skills = [];
          }
          if (!Array.isArray(state.checks)) {
            state.checks = [];
          }
        }
        if (version < 25) {
          // 机缘是随任务系统一起加的，旧存档里没有这一项
          if (!Array.isArray(state.quests)) {
            state.quests = [];
          }
        }
        if (version < 26) {
          // 状态一律改按时辰算：旧档里按回合计的，折成还能顶几个时辰
          if (state.player && Array.isArray(state.player.buffs)) {
            const now = normalizeGameTime(state.currentTime, OPENING_GAME_TIME);
            state.player.buffs = state.player.buffs.map((b: any) => {
              if (!b || b.durationType !== "round") return b;
              const hours = Math.max(1, Math.trunc(Number(b.duration) || 1));
              return { ...b, durationType: "until", duration: undefined, until: shiftGameTime(now, hours) };
            });
          }
        }
        if (version < 27) {
          // 瓦舍听戏与当铺押物都是后加的，旧存档里没有这两项
          if (!state.waseShows || typeof state.waseShows !== "object") {
            state.waseShows = { day: 0, count: 0 };
          }
          if (!Array.isArray(state.pawns)) {
            state.pawns = [];
          }
        }
        if (version < 28) {
          // 日序改用开局那天作第一日：旧档里记的是真实历法上的绝对日，一并折过来
          const shiftDay = (value: unknown): number | undefined => {
            if (!Number.isFinite(Number(value))) return undefined;
            return Math.max(OPENING_DAY_SERIAL, Math.trunc(Number(value)) - LEGACY_DAY_OFFSET);
          };
          const shiftDayFields = (obj: any, fields: string[]) => {
            if (!obj || typeof obj !== "object") return;
            for (const field of fields) {
              if (obj[field] === undefined) continue;
              const next = shiftDay(obj[field]);
              if (next === undefined) delete obj[field];
              else obj[field] = next;
            }
          };

          if (Array.isArray(state.rumors)) state.rumors.forEach((r: any) => shiftDayFields(r, ["day"]));
          if (Array.isArray(state.checks)) state.checks.forEach((c: any) => shiftDayFields(c, ["day"]));
          if (Array.isArray(state.quests)) {
            state.quests.forEach((q: any) => shiftDayFields(q, ["day", "dueDay", "settledDay"]));
          }
          if (Array.isArray(state.pacts)) {
            state.pacts.forEach((p: any) => shiftDayFields(p, ["madeDay", "dueDay", "settledDay"]));
          }
          if (Array.isArray(state.pawns)) state.pawns.forEach((p: any) => shiftDayFields(p, ["day", "dueDay"]));
          if (Array.isArray(state.priceAdjusts)) {
            state.priceAdjusts.forEach((a: any) => shiftDayFields(a, ["untilDay"]));
          }
          if (Array.isArray(state.relations)) {
            state.relations.forEach((r: any) => shiftDayFields(r, ["fixedUntilDay", "hireUntilDay"]));
          }
          shiftDayFields(state.waseShows, ["day"]);

          if (state.markets && typeof state.markets === "object") {
            for (const market of Object.values(state.markets) as any[]) {
              if (!market || typeof market !== "object") continue;
              shiftDayFields(market, ["day"]);
              // 酒肆并入客栈：旧档里的酒肆一并改作客栈，座头等进门时再补
              if (Array.isArray(market.shops)) {
                market.shops = market.shops.map((s: any) =>
                  s && s.kind === "酒肆" ? { ...s, kind: "客栈" } : s,
                );
              }
            }
          }

          // 随身灵兽是后加的，旧档里空着
          if (state.beast === undefined) state.beast = null;
        }
        if (version < 29) {
          // 地图上的宗门是后加的：旧档里没有这一项，先留空，进主界面时现掷一遍
          if (!Array.isArray(state.sectSites)) {
            state.sectSites = [];
          }
        }
        if (version < 30) {
          // 宗门之间的交情是后加的：旧档里一张白纸
          if (!Array.isArray(state.sectRelations)) {
            state.sectRelations = [];
          }
        }
        if (version < 31) {
          // 城村的归属是后加的：旧档里一处未占
          if (!Array.isArray(state.occupations)) {
            state.occupations = [];
          }
        }
        return state;
      },
      partialize: (s) => ({
        player: s.player,
        techniques: s.techniques,
        inventory: s.inventory,
        // 自设铺面与已学的丹方、符方也留在本机：退出重开要接着用
        playerShops: s.playerShops,
        talismanRecipes: s.talismanRecipes,
        alchemyRecipes: s.alchemyRecipes,
        spiritStones: s.spiritStones,
        reputation: s.reputation,
        beast: s.beast,
        sect: s.sect,
        relations: s.relations,
        log: s.log,
        currentPlaceId: s.currentPlaceId,
        currentSectId: s.currentSectId,
        currentAdventureId: s.currentAdventureId,
        currentLocation: s.currentLocation,
        pillCache: s.pillCache,
        currentTime: s.currentTime,
        news: s.news,
        districtNames: s.districtNames,
        manors: s.manors,
        markets: s.markets,
        priceAdjusts: s.priceAdjusts,
        rumors: s.rumors,
        skills: s.skills,
        checks: s.checks,
        quests: s.quests,
        waseShows: s.waseShows,
        pawns: s.pawns,
        workshops: s.workshops,
        villages: s.villages,
        estates: s.estates,
        manorPlots: s.manorPlots,
        pacts: s.pacts,
        sectSites: s.sectSites,
        sectRelations: s.sectRelations,
        occupations: s.occupations,
        lastSectWarDay: s.lastSectWarDay,
        adventures: s.adventures,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return state;
        console.warn("[useGameStore] Validating and fixing rehydrated state");
        return validateAndFixState(state);
      },
    },
  ),
);
