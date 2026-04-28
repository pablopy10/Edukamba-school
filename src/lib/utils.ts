import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Natural ascending comparator for strings containing numbers
// (e.g. "2ºA" before "10ºA"). Falls back to locale compare.
const naturalCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
export const compareNatural = (a: string, b: string) => naturalCollator.compare(a ?? "", b ?? "");

export const sortByName = <T extends { name?: string | null }>(arr: T[]): T[] =>
  [...(arr ?? [])].sort((a, b) => compareNatural(a?.name ?? "", b?.name ?? ""));
