import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Joins class names and resolves Tailwind conflicts (later classes win), e.g. a variant's border colour over the base one. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
