import { useGameStore } from "@/store/useGameStore";
import { ScrollCard } from "@/components/ui/ScrollCard";
import { PanelTitle } from "@/components/ui/PanelTitle";
import { cn } from "@/lib/utils";
import { formatDateKey } from "@/lib/gameTime";
import type { NewsItem } from "@/data/types";
import { Scroll, Bell, Users, ScrollText, Clock } from "lucide-react";

const CATEGORY_CONFIG: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  "官府公告": {
    icon: <ScrollText size={14} />,
    color: "text-cinnabar-400",
    bg: "border-cinnabar-500/30 bg-cinnabar-500/10",
  },
  "宗门布告": {
    icon: <Bell size={14} />,
    color: "text-gold-400",
    bg: "border-gold-400/30 bg-gold-400/10",
  },
  "市井传言": {
    icon: <Users size={14} />,
    color: "text-jade-400",
    bg: "border-jade-500/30 bg-jade-500/10",
  },
};

const DEFAULT_CONFIG = {
  icon: <Scroll size={14} />,
  color: "text-ink-lightest",
  bg: "border-ink-lightest/40 bg-paper-old/60",
};

/**
 * 江湖快报：一册独立的快报，随日子推移自行更新。
 */
export function NewsPanel() {
  const news = useGameStore((s) => s.news);

  const newsItems = Array.isArray(news?.items) ? news.items : [];
  const groupedNews = newsItems.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, NewsItem[]>);

  const categories = Object.keys(groupedNews);

  // lastUpdate 存的是日期键「514-1-14」，展示时还原成修真历的写法
  const lastUpdateDisplay = news?.lastUpdate ? formatDateKey(news.lastUpdate) : "";

  return (
    <div className="paper-texture">
      <PanelTitle
        title="江湖快报"
        poem="天下事，尽皆知。四方风起，先到有心人耳里。"
      />

      <ScrollCard
        title="快报"
        subtitle={lastUpdateDisplay ? `上次更新 ${lastUpdateDisplay}` : "尚未有报"}
      >
        {lastUpdateDisplay && (
          <div className="flex items-center gap-2 mb-4 text-ink-light">
            <Clock size={14} />
            <span className="font-serif text-xs">{lastUpdateDisplay}</span>
          </div>
        )}
        <div className="space-y-6">
          {categories.map((category) => {
            const config = CATEGORY_CONFIG[category] || DEFAULT_CONFIG;
            return (
              <div key={category}>
                <div className={cn("flex items-center gap-2 mb-3", config.color)}>
                  {config.icon}
                  <span className="font-brush text-sm">{category}</span>
                </div>
                <div className="space-y-2">
                  {groupedNews[category].map((item) => (
                    <div key={item.id} className={cn("p-3 rounded border", config.bg)}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-brush text-base text-ink-dark">{item.title}</span>
                        <span className="font-serif text-xs text-ink-lightest">{item.date}</span>
                      </div>
                      <p className="font-serif text-xs text-ink-medium leading-relaxed">
                        {item.content}
                      </p>
                      <div className="mt-1.5 flex items-center justify-between">
                        <span className="font-serif text-xs text-ink-lightest">来源：{item.source}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {newsItems.length === 0 && (
            <div className="text-center py-8">
              <Scroll size={32} className="mx-auto text-ink-lightest/50 mb-2" />
              <p className="font-serif text-sm text-ink-light">尚无快报</p>
              <p className="font-serif text-xs text-ink-lightest mt-1">
                江湖上的消息会随日子推移自行传到这里。
              </p>
            </div>
          )}
        </div>
      </ScrollCard>
    </div>
  );
}
