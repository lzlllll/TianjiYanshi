import { useEffect, useState } from "react";

/**
 * 计时用的小钩子：active 为真时每秒加一，转假便归零。
 *
 * 铺子里等一段叙事写出来，光转个圈看不出进益，缀一句「已候几秒」，
 * 人在等的时候心里便有个着落。
 */
export function useElapsedSeconds(active: boolean): number {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 500);
    return () => window.clearInterval(timer);
  }, [active]);

  return seconds;
}
