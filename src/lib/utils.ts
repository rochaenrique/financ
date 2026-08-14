import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function parseImportedDate(value: string): Date | null {
  const text = value.trim();
  
  const brazilian = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (brazilian) {
    const day = Number(brazilian[1]);
    const month = Number(brazilian[2]) - 1;
    const year = Number(brazilian[3].length === 2 ? `20${brazilian[3]}` : brazilian[3]);
    const date = new Date(year, month, day);
    
    if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) {
      return date;
    }
    
    return null;
  }
  
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseImportedNumber(value: string): number | null {
  let text = value.trim();
  
  if (!text) {
    return null;
  }
  
  text = text.replace(/[R$\s%]/g, "");
  
  if (text.includes(",") && text.includes(".")) {
    const lastComma = text.lastIndexOf(",");
    const lastDot = text.lastIndexOf(".");
    
    if (lastComma > lastDot) {
      text = text.replace(/\./g, "").replace(",", ".");
    } else {
      text = text.replace(/,/g, "");
    }
  } else if (text.includes(",")) {
    text = text.replace(",", ".");
  }
  
  const valueNumber = Number(text);
  return Number.isFinite(valueNumber) ? valueNumber : null;
}


export function toDate(value: unknown): Date {
  // data can arrive as real Date objects or as serialized strings/numbers
  // (e.g. after a JSON round-trip), so coerce defensively rather than
  // trusting the static type
  const date = value instanceof Date ? value : new Date(value as string | number);
  return date;
}
