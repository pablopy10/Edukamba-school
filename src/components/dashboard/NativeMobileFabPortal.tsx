import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = { children: ReactNode };

/**
 * FAB / controles fixos ao viewport na app móvel.
 * O outlet das páginas fica dentro de `NativeOutletAnimator`, que usa `transform`
 * na animação — `position: fixed` herdaria esse content box. Portal para `body`
 * restabelece o ancoramento ao ecrã.
 */
export function NativeMobileFabPortal({ children }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
