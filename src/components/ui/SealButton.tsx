import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SealButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 
   * 按钮变体：
   * - seal: 朱文印（红底白字）
   * - inverse: 白文印（白底红字）
   * - outline: 墨线描边印（透明底墨色边框）
   * - ghost: 旧版幽灵样式（保留兼容）
   */
  variant?: "seal" | "inverse" | "outline" | "ghost";
  children: ReactNode;
}

export function SealButton({
  variant = "seal",
  className,
  children,
  disabled,
  ...props
}: SealButtonProps) {
  // 古籍印章样式
  if (variant === "seal") {
    return (
      <button
        className={cn(
          "seal-button transition-smooth",
          disabled && "cursor-not-allowed filter grayscale",
          className,
        )}
        disabled={disabled}
        {...props}
      >
        {children}
      </button>
    );
  }

  if (variant === "inverse") {
    return (
      <button
        className={cn(
          "seal-button-inverse transition-smooth",
          disabled && "cursor-not-allowed filter grayscale",
          className,
        )}
        disabled={disabled}
        {...props}
      >
        {children}
      </button>
    );
  }

  if (variant === "outline") {
    return (
      <button
        className={cn(
          "seal-button-outline transition-smooth",
          disabled && "cursor-not-allowed filter grayscale",
          className,
        )}
        disabled={disabled}
        {...props}
      >
        {children}
      </button>
    );
  }

  // 保留旧版 ghost 样式作为回退
  return (
    <button
      className={cn(
        "px-5 py-2.5 rounded text-sm transition-all duration-200 select-none",
        "ghost-btn",
        className,
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
