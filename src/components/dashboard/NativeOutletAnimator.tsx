import { useOutlet, useLocation, useNavigationType } from "react-router-dom";
import { isNativeMobileApp } from "@/lib/nativeApp";
import { cn } from "@/lib/utils";

/**
 * Na app Capacitor: animação tipo push/pop nativo (forward = entra da direita; back = da esquerda).
 * Na web não anima — sai o outlet normal para não interferir com desktop.
 */
export function NativeOutletAnimator() {
  const outlet = useOutlet();
  const location = useLocation();
  const navigationType = useNavigationType();
  const native = isNativeMobileApp();

  if (!native) {
    return <>{outlet}</>;
  }

  const isPop = navigationType === "POP";

  return (
    <div className="relative min-h-[1px] w-full overflow-x-hidden">
      <div
        key={location.key}
        className={cn(
          "will-change-transform",
          isPop ? "animate-edu-page-enter-back" : "animate-edu-page-enter-forward",
        )}
      >
        {outlet}
      </div>
    </div>
  );
}
