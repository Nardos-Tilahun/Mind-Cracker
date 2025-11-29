import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}


export function cleanGoalTitle(text: string): string {
  if (!text) return "";
  
  let clean = text;

  clean = clean.replace(/^(Break\s+down\s+)?(Step\s+)?\d+(\.\d+)*[:\.]?\s*/i, "");
  
  clean = clean.replace(/^\d+(\.\d+)*\s+/, "");

  clean = clean.replace(/^"|"$/g, "");

  clean = clean.replace(/Context for this step:\s*/i, "");

  return clean.trim();
}