import { cn } from "@/lib/utils";

/** Mesmo wordmark da sidebar: «Edu» + «kamba» com cores do tema. */
export function EdukambaWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("text-3xl font-extrabold tracking-tight", className)}>
      <span className="text-foreground">Edu</span>
      <span className="text-sidebar-ring">kamba</span>
    </span>
  );
}
