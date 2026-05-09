import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { isNativeMobileApp } from "@/lib/nativeApp";

const PULL_THRESHOLD = 72;  // px to pull before triggering refresh
const MAX_PULL = 110;        // max visual pull distance

export const PullToRefresh = () => {
  const native = isNativeMobileApp();
  const [pullY, setPullY] = useState(0);       // visual pull distance
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef<number | null>(null);
  const pullingRef = useRef(false);

  useEffect(() => {
    if (!native) return;

    const isAtTop = () => {
      const el = document.scrollingElement ?? document.documentElement;
      return el.scrollTop <= 0;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (!isAtTop()) return;
      startYRef.current = e.touches[0].clientY;
      pullingRef.current = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startYRef.current === null || refreshing) return;
      const dy = e.touches[0].clientY - startYRef.current;
      if (dy <= 0) { startYRef.current = null; return; }
      if (!isAtTop()) return;

      pullingRef.current = true;
      // Resistance curve: feels heavier as you pull more
      const visual = Math.min(MAX_PULL, dy * 0.45);
      setPullY(visual);
      if (dy > 10) e.preventDefault();
    };

    const onTouchEnd = async () => {
      if (!pullingRef.current) return;
      pullingRef.current = false;
      startYRef.current = null;

      if (pullY >= PULL_THRESHOLD) {
        setRefreshing(true);
        setPullY(PULL_THRESHOLD); // lock at threshold while refreshing
        window.location.reload();
      } else {
        setPullY(0);
      }
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [native, pullY, refreshing]);

  if (!native || (pullY === 0 && !refreshing)) return null;

  const progress = Math.min(1, pullY / PULL_THRESHOLD);
  const ready = progress >= 1;

  return (
    <div
      className="pointer-events-none fixed left-0 right-0 top-0 z-[300] flex items-start justify-center"
      style={{
        transform: `translateY(calc(env(safe-area-inset-top, 0px) + ${pullY}px - 48px))`,
        transition: refreshing ? "none" : pullY === 0 ? "transform 0.25s ease" : "none",
      }}
    >
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full shadow-md transition-colors",
          ready || refreshing ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground",
        )}
        style={{ opacity: Math.max(0, progress) }}
      >
        <Loader2
          className={cn("h-5 w-5", (ready || refreshing) && "animate-spin")}
          style={!refreshing ? { transform: `rotate(${progress * 540}deg)` } : undefined}
          strokeWidth={2.5}
        />
      </div>
    </div>
  );
};
