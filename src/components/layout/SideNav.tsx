import { useGameStore } from "@/store/useGameStore";
import { useAIStore } from "@/store/useAIStore";
import { REALMS } from "@/data/mockData";
import { aliveRumors } from "@/data/rumors";
import { aliveBuffs } from "@/lib/buffTime";
import type { PanelId } from "@/data/types";
import { cn } from "@/lib/utils";
import {
  User,
  BookOpen,
  Gem,
  Landmark,
  Users,
  Sparkles,
  Activity,
  Scroll,
  ScrollText,
  Wrench,
  Receipt,
  Home,
} from "lucide-react";
import { AI_BACKEND_READY } from "@/data/backend";

/** 导航里的侧拉面板入口；问道与百艺各自走独立窗口，不在导航面板内 */
type NavId = PanelId;

interface NavItem {
  id: NavId;
  label: string;
  icon: typeof User;
}

const NAV_ITEMS: NavItem[] = [
  { id: "profile", label: "本命", icon: User },
  { id: "technique", label: "功法", icon: BookOpen },
  { id: "treasure", label: "财宝", icon: Gem },
  { id: "sect", label: "宗门", icon: Landmark },
  { id: "social", label: "尘缘", icon: Users },
  { id: "skill", label: "本事", icon: Wrench },
  { id: "fate", label: "机缘", icon: ScrollText },
  { id: "news", label: "快报", icon: Scroll },
  { id: "estate", label: "地产", icon: Home },
  { id: "status", label: "状态", icon: Activity },
  { id: "tokens", label: "推演账", icon: Receipt },
];

interface SideNavProps {
  storyOpen: boolean;
  onOpenStory: () => void;
}

export function SideNav({ storyOpen, onOpenStory }: SideNavProps) {
  const currentPanel = useGameStore((s) => s.currentPanel);
  const setPanel = useGameStore((s) => s.setPanel);
  const player = useGameStore((s) => s.player);
  const techniques = useGameStore((s) => s.techniques);
  const inventory = useGameStore((s) => s.inventory);
  const sect = useGameStore((s) => s.sect);
  const relations = useGameStore((s) => s.relations);
  const skills = useGameStore((s) => s.skills);
  const rumors = useGameStore((s) => s.rumors);
  const quests = useGameStore((s) => s.quests);
  const currentTime = useGameStore((s) => s.currentTime);
  const newsCount = useGameStore((s) => (Array.isArray(s.news?.items) ? s.news.items.length : 0));
  const estateCount = useGameStore((s) => (s.estates ?? []).length);

  const aiStage = useAIStore((s) => s.conversation.stage);
  const hasApiKey = AI_BACKEND_READY;
  const turnCount = useAIStore((s) => s.conversation.turns.length);

  const aiBusy = aiStage === "flash" || aiStage === "pro";

  const realm = REALMS[player.realmIndex];
  const activeHeart = techniques.find((t) => t.id === player.activeHeartTechnique);
  const buffCount =
    aliveBuffs(player.buffs, currentTime).filter((b) => b.durationType !== "instant").length +
    (Array.isArray(player.shields) ? player.shields : []).filter((s) => s.value > 0).length;

  const rumorCount = aliveRumors(rumors, currentTime).length;
  const openQuestCount = quests.filter((q) => q.status === "open").length;

  // 每项直接显示当前状态，取代原先与主标题语义重复的副标题
  const hints: Record<NavId, string> = {
    profile: realm ? `${realm.name}${realm.stage}` : "境界未定",
    technique: activeHeart ? `心法 · ${activeHeart.name}` : "未定心法",
    treasure: `${inventory.length} 件物品`,
    sect: `贡献 ${(sect.contribution ?? 0).toLocaleString()}`,
    social: `${relations.length} 位相识`,
    skill: skills.length > 0 ? `${skills.length} 门本事` : "未立一技",
    fate:
      openQuestCount > 0
        ? `${openQuestCount} 桩在办`
        : rumorCount > 0
          ? `${rumorCount} 条传闻`
          : "无甚可听",
    status: buffCount > 0 ? `${buffCount} 项生效` : "无生效效果",
    news: newsCount > 0 ? `${newsCount} 条快报` : "尚无快报",
    estate: estateCount > 0 ? `${estateCount} 处房产` : "名下无房产",
    tokens: "查看推演消耗",
  };

  const storyHint = turnCount > 0 ? `第 ${turnCount} 回` : "尚未演算";

  return (
    <nav className="mainui-black w-20 shrink-0 spine-texture flex flex-col py-4 relative shadow-spine-depth">
      {/* 书脊装饰线 */}
      <div className="absolute inset-y-0 left-0 w-px bg-gold-light" />
      <div className="absolute inset-y-0 right-0 w-px bg-ink-darkest" />

      {/* 标签区可滚动：个子矮的屏上，标签不至于把「问道」挤出视野 */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1 px-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = currentPanel === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setPanel(currentPanel === item.id ? null : item.id)}
              title={`${item.label} - ${hints[item.id]}`}
              className={cn(
                "spine-tab text-vertical group shrink-0",
                active && "active",
              )}
            >
              <div className="flex flex-col items-center gap-1">
                <Icon size={14} strokeWidth={2} />
                <span className="text-xs">{item.label}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* 问道按钮 - 使用朱砂色突出显示，固定在书脊底部，始终可见 */}
      <div className="px-1 mt-3 shrink-0">
        <div className="h-px bg-gold mb-3" />
        <button
          onClick={onOpenStory}
          title={`问道 - ${storyHint}`}
          className={cn(
            "spine-tab text-vertical group shrink-0",
            storyOpen && "active",
            !storyOpen && "bg-gradient-to-r from-cinnabar-dark via-cinnabar to-cinnabar-dark",
            aiBusy && "animate-pulse",
          )}
        >
          <div className="flex flex-col items-center gap-1">
            <Sparkles 
              size={14} 
              strokeWidth={2} 
              className={aiBusy ? "animate-spin" : ""} 
            />
            <span className="text-xs">问道</span>
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full",
                aiBusy ? "bg-gold animate-shimmer" : hasApiKey ? "bg-jade-400" : "bg-cinnabar",
              )}
            />
          </div>
        </button>
      </div>
    </nav>
  );
}
