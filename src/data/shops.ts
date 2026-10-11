/**
 * 坊市里的铺子。
 *
 * 铺面数取该街区的建筑槽位数，种类按城市的文化背景加权掷出，
 * 名号从该地域各备一套的预设名表里挑。掷一次就写进存档，一局之内不再变。
 */

import type { Good, Market, Relation, Seat, Shop, ShopKind } from "@/data/types";
import { rollGoods } from "@/data/goods";
import { hasStockSpec, maybeHideMystery, rollMysteries, rollStock } from "@/data/shopStock";
import { brokerTargetsFor, rollBrokerJobs } from "@/data/broker";
import { isPinnedInCity, rollDistrictNpc, rollShopkeeper } from "@/data/npcGen";

/**
 * 界面与权重的取用顺序；每类都要在下面的权重表与名表里露面。
 * 酒肆已并入客栈，不再单列。
 */
export const SHOP_KINDS: ShopKind[] = [
  "茶棚",
  "客栈",
  "浴堂",
  "丹药铺/医馆",
  "瓦舍",
  "灵兽栏",
  "符箓铺",
  "炼器坊",
  "宝物阁",
  "旧货铺",
  "当铺",
  // "钱庄",   // 暂不开张：要恢复的话把这一处与下面权重表、名号表里的钱庄一并放开
  "镖局",
  "牙行",
  "书铺",
  "乐器坊",
  "武馆",
  "杂货铺",
];

/**
 * 六种文化背景下各类铺子的权重，数大者常见。
 * 中原重镖局牙行，江南重书铺乐器坊，苗疆出灵兽与草药，
 * 西域多客栈牙行，漠北苦寒少见文墨，日韩则汤池符箓为盛。
 * 客栈的份量里含了先前单列的酒肆。
 */
export const CULTURE_SHOP_WEIGHTS: Record<string, Record<ShopKind, number>> = {
  中原: {
    茶棚: 8, 客栈: 16, 浴堂: 5, "丹药铺/医馆": 7, 瓦舍: 7,
    灵兽栏: 3, 符箓铺: 6, 炼器坊: 5, 宝物阁: 5, 旧货铺: 5, 当铺: 6,
    // 钱庄: 8,
    镖局: 7, 牙行: 6, 书铺: 7, 乐器坊: 4, 武馆: 6, 杂货铺: 8,
  },
  江南: {
    茶棚: 9, 客栈: 16, 浴堂: 6, "丹药铺/医馆": 6, 瓦舍: 6,
    灵兽栏: 2, 符箓铺: 6, 炼器坊: 4, 宝物阁: 6, 旧货铺: 6, 当铺: 6,
    // 钱庄: 9,
    镖局: 5, 牙行: 7, 书铺: 8, 乐器坊: 7, 武馆: 5, 杂货铺: 8,
  },
  苗疆: {
    茶棚: 8, 客栈: 14, 浴堂: 3, "丹药铺/医馆": 8, 瓦舍: 4,
    灵兽栏: 9, 符箓铺: 7, 炼器坊: 5, 宝物阁: 3, 旧货铺: 5, 当铺: 3,
    // 钱庄: 3,
    镖局: 3, 牙行: 5, 书铺: 3, 乐器坊: 6, 武馆: 6, 杂货铺: 6,
  },
  西域: {
    茶棚: 9, 客栈: 17, 浴堂: 7, "丹药铺/医馆": 6, 瓦舍: 6,
    灵兽栏: 6, 符箓铺: 4, 炼器坊: 6, 宝物阁: 6, 旧货铺: 7, 当铺: 5,
    // 钱庄: 6,
    镖局: 8, 牙行: 8, 书铺: 3, 乐器坊: 6, 武馆: 5, 杂货铺: 7,
  },
  漠北: {
    茶棚: 7, 客栈: 16, 浴堂: 4, "丹药铺/医馆": 5, 瓦舍: 4,
    灵兽栏: 7, 符箓铺: 2, 炼器坊: 7, 宝物阁: 2, 旧货铺: 5, 当铺: 3,
    // 钱庄: 3,
    镖局: 6, 牙行: 6, 书铺: 1, 乐器坊: 4, 武馆: 5, 杂货铺: 7,
  },
  日韩: {
    茶棚: 8, 客栈: 15, 浴堂: 8, "丹药铺/医馆": 6, 瓦舍: 6,
    灵兽栏: 4, 符箓铺: 7, 炼器坊: 6, 宝物阁: 4, 旧货铺: 5, 当铺: 4,
    // 钱庄: 5,
    镖局: 4, 牙行: 5, 书铺: 6, 乐器坊: 5, 武馆: 5, 杂货铺: 7,
  },
};

/**
 * 每类铺子的预设名号，按地域各备一套；同一处坊市里不重号。
 * 中原那套是底子，其余五地各按自己的风物取名。
 * 酒肆的名号一并归到客栈名下。
 */
export const CULTURE_SHOP_NAMES: Record<string, Record<ShopKind, string[]>> = {
  中原: {
    茶棚: ["一碗春茶棚", "老槐树茶棚", "半日闲茶棚", "听雨茶棚", "三岔口茶棚"],
    客栈: ["悦来客栈", "同福客栈", "云来客栈", "四方客栈", "高升客栈", "醉仙楼", "十里香酒肆", "太白居", "一壶春", "望江酒楼"],
    浴堂: ["清华池", "温汤浴堂", "净尘堂", "一池春", "石泉汤"],
    "丹药铺/医馆": ["回春堂", "济世堂", "百草堂", "仁和堂", "杏林馆"],
    瓦舍: ["百戏瓦舍", "鸣鼓瓦舍", "勾栏瓦舍", "春台瓦舍", "众乐瓦舍"],
    灵兽栏: ["驯兽栏", "百兽坊", "灵驹栏", "苍鹰栏", "走兽栏"],
    符箓铺: ["朱砂铺", "灵符斋", "一笔符铺", "黄纸斋", "五雷符铺"],
    炼器坊: ["炉火坊", "千锤坊", "精铁坊", "藏锋坊", "百炼坊"],
    宝物阁: ["珍珑阁", "万宝阁", "藏珍阁", "琳琅阁", "拾宝阁"],
    旧货铺: ["半旧铺", "故物斋", "拾遗铺", "破落户", "旧物集"],
    当铺: ["通宝当铺", "急当铺", "仁义当铺", "长生当铺", "一分利当铺"],
    // 钱庄: ["四海钱庄", "通汇钱庄", "宝昌钱庄", "金满堂", "天下通钱庄"],
    镖局: ["威远镖局", "振远镖局", "四海镖局", "通臂镖局", "铁旗镖局"],
    牙行: ["顺风牙行", "中人行", "货栈牙行", "千里牙行", "铺面牙行"],
    书铺: ["墨香书铺", "文渊书铺", "半卷书铺", "藏书斋", "万卷书铺"],
    乐器坊: ["鸣弦坊", "焦尾坊", "玉笛坊", "五音坊", "断弦坊"],
    武馆: ["镇远武馆", "通臂武馆", "六合武馆", "长拳武馆", "铁掌武馆"],
    杂货铺: ["百样杂货铺", "油盐杂货铺", "针头线脑铺", "巷口杂货铺", "万全杂货铺"],
  },
  江南: {
    茶棚: ["曲水茶棚", "竹帘茶棚", "乌篷茶棚", "烟雨茶棚", "菱歌茶棚"],
    客栈: ["临水客栈", "画舫客栈", "枕河客栈", "乌衣客栈", "潮生客栈", "烟雨酒楼", "画船酒肆", "花雕酒家", "曲水酒坊", "半醉居"],
    浴堂: ["玉汤池", "香溪浴堂", "莲汤馆", "石湖汤", "漱玉池"],
    "丹药铺/医馆": ["杏雨堂", "橘井堂", "存仁堂", "草香斋", "苏氏药铺"],
    瓦舍: ["画舫瓦舍", "水台瓦舍", "听曲瓦舍", "灯船瓦舍", "梨园瓦舍"],
    灵兽栏: ["水兽栏", "白鹭栏", "灵鲤池", "锦鳞坊", "鹤苑"],
    符箓铺: ["云篆斋", "桃符铺", "砚山符斋", "白鹤符铺", "水墨符庄"],
    炼器坊: ["剑池坊", "越工坊", "寒泉坊", "水磨坊", "淬玉坊"],
    宝物阁: ["玲珑阁", "画锦阁", "烟水阁", "藏画阁", "玉玲珑"],
    旧货铺: ["旧画铺", "断简斋", "故纸铺", "吴门旧货", "拾旧轩"],
    当铺: ["解当铺", "水记当铺", "顺当铺", "吴门典当", "半价当铺"],
    // 钱庄: ["汇通钱庄", "同源银号", "水码头钱庄", "吴银庄", "聚丰钱庄"],
    镖局: ["漕运镖局", "沿江镖局", "吴门镖行", "快船镖局", "水记镖局"],
    牙行: ["绸牙行", "米行牙人", "水货牙行", "茶牙行", "船牙行"],
    书铺: ["青竹书斋", "阅江书铺", "兰亭书坊", "刻本斋", "画禅书室"],
    乐器坊: ["丝竹坊", "水调坊", "琵琶坊", "画舫琴坊", "玉筝坊"],
    武馆: ["吴门武馆", "水寨武馆", "剑池武馆", "柔云武馆", "听涛武馆"],
    杂货铺: ["米油杂货铺", "柴炭杂货铺", "桥头杂货铺", "布头杂货铺", "酱园杂货铺"],
  },
  苗疆: {
    茶棚: ["山脚茶棚", "藤桥茶棚", "苦叶茶棚", "铜鼓茶棚", "云雾茶棚"],
    客栈: ["吊脚客栈", "山鬼客栈", "铜鼓客栈", "藤楼客栈", "溪寨客栈", "米酒寨", "竹筒酒肆", "山歌酒坊", "蜂酒棚", "铜鼓酒家"],
    浴堂: ["药汤堂", "山泉浴堂", "百草汤", "硫泉池", "藤汤馆"],
    "丹药铺/医馆": ["蛊草堂", "百虫药铺", "巫医堂", "山草药庐", "蛇骨堂"],
    瓦舍: ["铜鼓瓦舍", "跳月台", "芦笙场", "山歌台", "月寨瓦舍"],
    灵兽栏: ["蛊兽栏", "五毒栏", "蛇窟", "蛊虫坊", "灵蚕房"],
    符箓铺: ["巫符铺", "骨符斋", "蛊纹符庄", "血符铺", "山鬼符斋"],
    炼器坊: ["骨器坊", "铜鼓坊", "蛊刃坊", "藤甲坊", "毒淬坊"],
    宝物阁: ["银饰阁", "蛊宝阁", "铜鼓阁", "山货阁", "蜡染阁"],
    旧货铺: ["旧银铺", "断鼓铺", "山货旧铺", "拾荒寨", "破藤摊"],
    当铺: ["银饰当铺", "山货典当", "铜鼓当铺", "山寨当铺", "蛊珠当铺"],
    // 钱庄: ["山寨钱庄", "银作坊", "铜鼓银庄", "苗银庄", "蛊珠银庄"],
    镖局: ["山镖局", "藤桥镖行", "银镖局", "苗刀镖行", "铜鼓镖局"],
    牙行: ["山货牙行", "药材牙行", "牲口牙行", "蜡染牙行", "银饰牙行"],
    书铺: ["巫书铺", "山经斋", "蛊篆书坊", "竹简寨", "草医书铺"],
    乐器坊: ["芦笙坊", "铜鼓坊", "竹笛坊", "木叶坊", "银铃坊"],
    武馆: ["铜鼓武馆", "藤桥武馆", "毒掌武馆", "山刀武馆", "银铃武馆"],
    杂货铺: ["山货杂货铺", "盐巴杂货铺", "靛蓝杂货铺", "竹器杂货铺", "藤篓杂货铺"],
  },
  西域: {
    茶棚: ["驼铃茶棚", "沙柳茶棚", "胡杨茶棚", "井台茶棚", "高棚茶摊"],
    客栈: ["驼队客栈", "沙洲客栈", "高昌客栈", "胡杨客栈", "月牙客栈", "葡萄酒坊", "驼铃酒肆", "胡姬酒家", "沙枣酒棚", "夜光杯"],
    浴堂: ["沙汤池", "香料浴堂", "玫瑰汤", "圆顶浴堂", "温沙池"],
    "丹药铺/医馆": ["香料药坊", "胡药铺", "驼铃医馆", "沙棘堂", "乳香药庐"],
    瓦舍: ["胡旋台", "沙洲戏台", "驼鼓瓦舍", "胡琴棚", "灯轮瓦舍"],
    灵兽栏: ["骆驼栏", "沙狐栏", "鹰隼坊", "狮笼", "蝎尾栏"],
    符箓铺: ["沙符铺", "胡咒斋", "火印符铺", "星图符庄", "驼铃符斋"],
    炼器坊: ["镔铁坊", "沙炉坊", "弯刀坊", "星铁坊", "火砖坊"],
    宝物阁: ["琉璃阁", "香料阁", "宝石阁", "驼铃宝肆", "夜光阁"],
    旧货铺: ["旧毡铺", "断剑摊", "胡货旧铺", "沙里淘", "破铜摊"],
    当铺: ["驼铃当铺", "宝石典当", "胡货当铺", "沙记当铺", "琉璃当铺"],
    // 钱庄: ["胡商钱庄", "驼队银号", "沙洲钱庄", "西域银庄", "宝石银号"],
    镖局: ["驼队镖局", "沙道镖行", "胡刀镖局", "沙洲镖局", "高昌镖行"],
    牙行: ["驼货牙行", "香料牙行", "宝石牙行", "沙洲牙行", "马帮牙行"],
    书铺: ["胡经铺", "星历书坊", "沙州书肆", "贝叶斋", "译经铺"],
    乐器坊: ["胡琴坊", "琵琶坊", "沙鼓坊", "铜铃坊", "驼铃坊"],
    武馆: ["驼队武馆", "沙刀武馆", "弯刀武馆", "胡旋武馆", "星铁武馆"],
    杂货铺: ["香料杂货铺", "干果杂货铺", "皮囊杂货铺", "沙货杂货铺", "铜器杂货铺"],
  },
  漠北: {
    茶棚: ["毡帐茶摊", "走马茶棚", "风口茶棚", "热汤茶棚", "雪原茶棚"],
    客栈: ["毡房客栈", "走马客栈", "风陵客栈", "冻土客栈", "狼山口客栈", "马奶酒棚", "烈酒毡房", "走马酒肆", "风雪酒家", "烧刀子棚"],
    浴堂: ["热泉浴堂", "火塘汤", "皮帐浴堂", "雪汤池", "温泉毡房"],
    "丹药铺/医馆": ["雪参药铺", "苦寒堂", "骨药庐", "皮囊药铺", "鹿血堂"],
    瓦舍: ["篝火场", "马术棚", "摔跤场", "长调台", "风沙戏棚"],
    灵兽栏: ["骏马栏", "狼苑", "雪狐栏", "苍狼坊", "驯鹰栏"],
    符箓铺: ["狼骨符铺", "风寒符斋", "火塘符铺", "雪咒庄", "萨满符斋"],
    炼器坊: ["寒铁坊", "狼牙坊", "风炉坊", "弯月刀坊", "雪锻坊"],
    宝物阁: ["兽骨阁", "皮毛宝肆", "雪玉阁", "狼牙阁", "冻原宝铺"],
    旧货铺: ["旧皮铺", "断弓铺", "风雪旧货", "破毡摊", "拾骨铺"],
    当铺: ["皮货当铺", "兽骨典当", "风雪当铺", "马记当铺", "冻原当铺"],
    // 钱庄: ["马市钱庄", "皮毛银号", "风雪银庄", "冻原钱庄", "驼马银号"],
    镖局: ["马队镖局", "狼旗镖行", "风雪镖局", "走北口镖行", "铁蹄镖局"],
    牙行: ["马市牙行", "皮毛牙行", "牲口牙人", "冻货牙行", "盐茶牙行"],
    书铺: ["皮卷铺", "狼皮书斋", "马背书囊", "萨满经铺", "风沙书肆"],
    乐器坊: ["马头琴坊", "骨笛坊", "角号坊", "皮鼓坊", "风雪琴坊"],
    武馆: ["走马武馆", "狼旗武馆", "风雪武馆", "摔跤武馆", "寒刀武馆"],
    杂货铺: ["皮毛杂货铺", "盐茶杂货铺", "冻货杂货铺", "毡货杂货铺", "刀剪杂货铺"],
  },
  日韩: {
    茶棚: ["鹤檐茶屋", "松风茶屋", "樱下茶棚", "町口茶屋", "石灯茶屋"],
    客栈: ["鹤见宿", "汤町宿", "樱枝宿", "松ケ宿", "白鹿宿", "清酒屋", "鹤鸣酒肆", "樱酿屋", "松风酒家", "町屋酒坊"],
    浴堂: ["汤华池", "白鹤汤", "石风吕", "樱汤屋", "松雪汤"],
    "丹药铺/医馆": ["汉方药堂", "鹤寿堂", "松叶药屋", "白鹿药铺", "草根堂"],
    瓦舍: ["鹤舞台", "町屋戏舍", "樱吹雪台", "太鼓座", "松风戏屋"],
    灵兽栏: ["白狐栏", "鹤苑", "灵犬屋", "锦鲤池", "鹿苑"],
    符箓铺: ["御札所", "白纸符屋", "鹤纹札铺", "神乐符斋", "松叶御符"],
    炼器坊: ["玉钢坊", "鹤纹锻所", "松风刀屋", "白刃坊", "樱铁坊"],
    宝物阁: ["锦绘阁", "鹤羽宝肆", "樱贝阁", "松皮宝铺", "白瓷阁"],
    旧货铺: ["古布屋", "断刀屋", "旧具屋", "拾遗屋", "破瓷铺"],
    当铺: ["质屋", "鹤屋质铺", "松风质屋", "樱枝典当", "白瓷质屋"],
    // 钱庄: ["鹤屋银号", "町屋钱庄", "松风银庄", "樱枝银号", "白鹿两替屋"],
    镖局: ["鹤羽镖行", "松风镖局", "樱道镖局", "町屋护卫", "白刃镖行"],
    牙行: ["町屋问屋", "米问屋", "鱼问屋", "木问屋", "布问屋"],
    书铺: ["鹤文堂", "和纸书屋", "松风书院", "樱卷屋", "白鹿书肆"],
    乐器坊: ["三弦屋", "鹤鸣琴坊", "太鼓屋", "竹笛坊", "樱筝屋"],
    武馆: ["白鹿道场", "松风道场", "鹤羽武馆", "樱刀道场", "太鼓武馆"],
    杂货铺: ["丁字屋", "杂物屋", "町屋杂货", "油盐屋", "纸烛屋"],
  },
};

/** 按城池的文化背景取铺号名表；认不出的文化背景按中原来 */
export function shopNamePool(culture: string | undefined, kind: ShopKind): string[] {
  const byCulture = (culture && CULTURE_SHOP_NAMES[culture]) || CULTURE_SHOP_NAMES.中原;
  return byCulture[kind];
}

const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

/**
 * 按权重掷一类铺子。
 * budget 给的是「这一城里每类还余几家可开」的额度，额度为 0 的类目不再掷中；
 * 每掷中一次便扣掉一家的额度，使同城同类铺子不至于泛滥。
 */
function pickKind(weights: Record<ShopKind, number>, budget?: Record<ShopKind, number>): ShopKind {
  const allowed = budget ? SHOP_KINDS.filter((k) => (budget[k] ?? Infinity) > 0) : SHOP_KINDS;
  const poolKinds = allowed.length > 0 ? allowed : SHOP_KINDS;
  const spend = (kind: ShopKind): ShopKind => {
    if (budget) budget[kind] = (budget[kind] ?? 0) - 1;
    return kind;
  };

  const total = poolKinds.reduce((sum, kind) => sum + (weights[kind] || 0), 0);
  if (total <= 0) return spend(pick(poolKinds));

  let roll = Math.random() * total;
  for (const kind of poolKinds) {
    roll -= weights[kind] || 0;
    if (roll < 0) return spend(kind);
  }
  return spend(poolKinds[0]);
}

/**
 * 这一类铺子该备的货；不做买卖的营生没有货架。
 * 杂货铺进的是什货，符箓丹药这七类按词条现拼，都留一点概率压件旧物。
 * count 给了就照这个数备，用来把货架补回上回的规模。
 */
function stockFor(kind: ShopKind, culture?: string, count?: number): Good[] | null {
  if (kind === "杂货铺") {
    // 什货按当地供需进，八到十二样
    return maybeHideMystery(rollGoods(culture, count ?? 8 + Math.floor(Math.random() * 5)), kind);
  }
  if (kind === "旧货铺") {
    // 旧货铺柜上清一色是没人认得出的旧物，价也压得低，三到五件
    return rollMysteries(kind, count ?? 3 + Math.floor(Math.random() * 3));
  }
  if (hasStockSpec(kind)) {
    // 六到九样
    return maybeHideMystery(rollStock(kind, count ?? 6 + Math.floor(Math.random() * 4)), kind);
  }
  return null;
}

/** 这家铺子做不做买卖；不做买卖的没有货架，也不补货 */
function sellsGoods(kind: ShopKind): boolean {
  return kind === "杂货铺" || kind === "旧货铺" || hasStockSpec(kind);
}

/** 客栈与茶棚：堂里有座头，可以坐下来吃口东西 */
export function hasSeats(kind: ShopKind): boolean {
  return kind === "客栈" || kind === "茶棚";
}

/** 牙行：柜上常年挂着几桩差事等人来领 */
export function hasJobs(kind: ShopKind): boolean {
  return kind === "牙行";
}

const TABLES_PER_HALL = 3;
const SEATS_PER_TABLE = 4;

/**
 * 摆一堂座头：客栈四桌、茶棚三桌，每桌四位。
 * 有的位子上坐着人——先紧着这座城里已经认下的人挑，剩下的才是生面孔。
 * known 传的是玩家尘缘里与本城有关的那些人。
 */
export function rollSeats(
  kind: ShopKind,
  cityId: string,
  districtId: number,
  culture: string | undefined,
  shopName: string,
  known: Relation[] = [],
  today = 0,
): Seat[] {
  const tables = kind === "客栈" ? TABLES_PER_HALL + 1 : TABLES_PER_HALL;
  // 这一阵子被叙事钉在某处的人，不会凭空出现在堂里；期限一过就随缘了
  const pool = known.filter((r) => r.cityId === cityId && !isPinnedInCity(r, cityId, today));
  const used = new Set<string>();
  const seats: Seat[] = [];

  const takeKnown = (): Relation | undefined => {
    for (let i = 0; i < 6; i++) {
      const cand = pool[Math.floor(Math.random() * pool.length)];
      if (cand && !used.has(cand.name)) return cand;
      if (pool.length === 0) return undefined;
    }
    return undefined;
  };

  for (let table = 1; table <= tables; table++) {
    for (let index = 1; index <= SEATS_PER_TABLE; index++) {
      const seat: Seat = { id: `seat-${table}-${index}`, table, index };
      // 约三分之一的位置上有人；熟脸的份额少些，多是偶然同席的生人
      if (Math.random() < 0.34) {
        let guest: Relation | undefined;
        if (pool.length > 0 && Math.random() < 0.4) guest = takeKnown();
        if (!guest) {
          guest = rollDistrictNpc(`${shopName}堂内`, cityId, districtId, culture);
          // 同堂不重名，撞上就再掷一回
          for (let k = 0; k < 8 && used.has(guest.name); k++) {
            guest = rollDistrictNpc(`${shopName}堂内`, cityId, districtId, culture);
          }
        }
        if (!used.has(guest.name)) {
          used.add(guest.name);
          seat.guest = guest;
        }
      }
      seats.push(seat);
    }
  }

  return seats;
}

/** 记下这一趟的日序与铺面规模，供次日照着补货 */
function stamp(market: Market, day: number, shops: Shop[]): Market {
  return {
    day,
    shops: shops.map((s) => (s.goods ? { ...s, stockScale: s.goods.length } : s)),
  };
}

/**
 * 开一处坊市：铺面数与街区的建筑槽位数相同，每格一类铺子、一个新号。
 * 有货可卖的铺子开市时一并备好货架与掌柜；认不出的文化背景按中原的轻重来。
 * day 是今日日序，known 是玩家在本城认下的人，用来决定谁在堂里坐着。
 */
export function rollMarket(
  cityId: string,
  districtId: number,
  culture: string | undefined,
  slots: number,
  day = 0,
  known: Relation[] = [],
  districtNames?: Record<string, string>,
  /** 本城每类铺子还余几家可开；传了便照它限制同类开张的家数 */
  kindBudget?: Record<ShopKind, number>,
): Market {
  const weights = (culture && CULTURE_SHOP_WEIGHTS[culture]) || CULTURE_SHOP_WEIGHTS.中原;
  const count = Math.max(0, Math.min(Math.trunc(slots) || 0, 8));
  const usedNames = new Set<string>();
  const shops: Shop[] = [];

  for (let i = 0; i < count; i++) {
    const kind = pickKind(weights, kindBudget);
    const pool = shopNamePool(culture, kind);
    let name = pick(pool);
    // 一处坊市里不重号，实在撞满了就由它重
    for (let k = 0; k < 12 && usedNames.has(name); k++) name = pick(pool);
    usedNames.add(name);

    const shop: Shop = { id: `shop-${cityId}-${districtId}-${i + 1}`, kind, name };
    const goods = stockFor(kind, culture);
    if (goods) {
      shop.goods = goods;
      shop.keeper = rollShopkeeper(cityId, districtId, name, culture);
    }
    if (hasSeats(kind)) {
      shop.seats = rollSeats(kind, cityId, districtId, culture, name, known, day);
      shop.keeper = rollShopkeeper(cityId, districtId, name, culture);
    }
    if (hasJobs(kind)) {
      // 差事的去处只从本城真有的街区与认得的人里挑
      shop.jobs = rollBrokerJobs(brokerTargetsFor(cityId, districtNames, known));
      shop.keeper = rollShopkeeper(cityId, districtId, name, culture);
    }
    // 武馆自有坐馆的武师，进门先见着人
    if (kind === "武馆") {
      shop.keeper = rollShopkeeper(cityId, districtId, name, culture);
    }
    shops.push(shop);
  }

  return stamp({ shops }, day, shops);
}

/**
 * 再进坊市时把铺面理一遍，两件事：
 * 一是补货——早先开市时只有杂货铺带着货架，书铺符箓铺这些还空着，补上免得挂着招牌进不去；
 * 二是换日——同一天里货架原样不动，只少了卖掉的；隔了日子就按上回的规模重新上货，坐堂的客人也换一拨。
 * 什么都不必动的就返回 null，让调用方原样用旧的那份。
 */
export function syncMarket(
  market: Market,
  cityId: string,
  districtId: number,
  culture: string | undefined,
  day: number,
  known: Relation[] = [],
  districtNames?: Record<string, string>,
): Market | null {
  const sameDay = market.day === day;
  let touched = false;

  const shops = market.shops.map((shop) => {
    const wantsGoods = sellsGoods(shop.kind);
    const wantsSeats = hasSeats(shop.kind);
    const wantsJobs = hasJobs(shop.kind);
    if (!wantsGoods && !wantsSeats && !wantsJobs) return shop;

    // 早先的存档里这一类还没备货：按常例补上，就当作今日的货。
    // 座头也照此办理——早先的酒肆并进客栈之后，堂里还没有桌子
    const bare =
      (wantsGoods && (!shop.goods || shop.goods.length === 0)) ||
      (wantsJobs && (!shop.jobs || shop.jobs.length === 0)) ||
      (wantsSeats && (!shop.seats || shop.seats.length === 0));
    if (!bare && sameDay) return shop;

    touched = true;
    const next: Shop = { ...shop };
    if (wantsGoods) {
      const count = bare ? undefined : shop.stockScale ?? shop.goods?.length;
      next.goods = stockFor(shop.kind, culture, count) ?? shop.goods;
      if (!next.keeper) next.keeper = rollShopkeeper(cityId, districtId, shop.name, culture);
    }
    if (wantsSeats) {
      next.seats = rollSeats(shop.kind, cityId, districtId, culture, shop.name, known, day);
      if (!next.keeper) next.keeper = rollShopkeeper(cityId, districtId, shop.name, culture);
    }
    if (wantsJobs) {
      // 隔日换一拨差事；同一日里柜上挂着的原样不动，免得刚接下的转眼就换了名目
      next.jobs = rollBrokerJobs(brokerTargetsFor(cityId, districtNames, known));
      if (!next.keeper) next.keeper = rollShopkeeper(cityId, districtId, shop.name, culture);
    }
    return next;
  });

  if (!touched) return market.day === day ? null : stamp(market, day, market.shops);
  return stamp(market, day, shops);
}
