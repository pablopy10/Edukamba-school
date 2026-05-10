import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Scrolls the page back to the top whenever the route changes.
 * Works for both the browser scrolling element and any fixed
 * inner scroll containers (e.g. Capacitor WKWebView / Android WebView).
 */
export const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    // Primary: standard browser scroll
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });

    // Fallback: some mobile WebViews scroll via documentElement / body
    try {
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    } catch {
      // ignore
    }
  }, [pathname]);

  return null;
};
