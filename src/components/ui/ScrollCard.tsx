import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ScrollCardProps {
  children: ReactNode;
  className?: string;
  /** 作用在包裹 children 的内层容器上，用于传递 flex/overflow 等布局类 */
  contentClassName?: string;
  title?: string;
  subtitle?: string;
  ornament?: ReactNode;
  /** 是否使用古籍书页风格 */
  bookStyle?: boolean;
  /** 是否显示纸张纹理 */
  paperTexture?: boolean;
  /** 是否显示泛黄效果 */
  aged?: boolean;
  /** 是否显示虫蛀斑点 */
  foxing?: boolean;
  /** 新手引导的锚点，写在根节点上供教程按 data-tutorial 认出来 */
  anchor?: string;
}

export function ScrollCard({ 
  children, 
  className, 
  contentClassName,
  title, 
  subtitle, 
  ornament,
  bookStyle = true,
  paperTexture = true,
  aged = false,
  foxing = false,
  anchor,
}: ScrollCardProps) {
  if (bookStyle) {
    return (
      <div 
        data-tutorial={anchor}
        className={cn(
          "book-card relative overflow-hidden",
          paperTexture && "paper-texture",
          aged && "paper-aged",
          foxing && "paper-foxing",
          "book-scrollbar",
          className
        )}
      >
        {(title || ornament) && (
          <div className="flex items-center justify-between mb-4 pb-3 border-b-2 border-ink-lightest">
            <div>
              {title && (
                <h3 className="text-title title-ornament">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="text-caption mt-1 text-ink-light">{subtitle}</p>
              )}
            </div>
            {ornament}
          </div>
        )}
        <div className={cn("ink-diffuse-enter", contentClassName)}>
          {children}
        </div>
      </div>
    );
  }

  // 保留旧版样式作为回退
  return (
    <div className={cn("scroll-card rounded-lg p-5 relative", className)}>
      {(title || ornament) && (
        <div className="flex items-center justify-between mb-3">
          <div>
            {title && (
              <h3 className="font-brush text-xl text-paper-100 text-shadow-ink tracking-wider">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-xs text-paper-400/70 mt-0.5">{subtitle}</p>
            )}
          </div>
          {ornament}
        </div>
      )}
      {children}
    </div>
  );
}
