import { useEffect } from "react";
import { onlineManager } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

/** Recomeça mutações pausadas pelo TanStack Query quando `onlineManager` volta a ligado. */
export function ResumePausedMutationsBridge() {
  useEffect(() => {
    return onlineManager.subscribe((isOnline) => {
      if (isOnline) {
        void queryClient.resumePausedMutations();
      }
    });
  }, []);
  return null;
}
