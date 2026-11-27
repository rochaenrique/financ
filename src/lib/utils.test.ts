import { describe, expect, it } from "vitest";

import { cn, parseImportedDate, parseImportedNumber, toDate } from "./utils";

describe("parseImportedDate", () => {
  it("reads day-first dates with any of the usual separators", () => {
    expect(parseImportedDate("15/03/2024")).toEqual(new Date(2024, 2, 15));
    expect(parseImportedDate("15.03.2024")).toEqual(new Date(2024, 2, 15));
    expect(parseImportedDate("15-03-2024")).toEqual(new Date(2024, 2, 15));
  });

  it("treats a two-digit year as 20xx", () => {
    expect(parseImportedDate("5/1/24")).toEqual(new Date(2024, 0, 5));
  });

  it("ignores surrounding whitespace", () => {
    expect(parseImportedDate("  01/02/2023 ")).toEqual(new Date(2023, 1, 1));
  });

  it("rejects calendar dates that don't exist rather than rolling them over", () => {
    expect(parseImportedDate("31/02/2024")).toBeNull();
    expect(parseImportedDate("00/01/2024")).toBeNull();
    expect(parseImportedDate("10/13/2024")).toBeNull();
  });

  it("rejects bare numbers, so a row-number column is never mistaken for dates", () => {
    expect(parseImportedDate("51")).toBeNull();
    expect(parseImportedDate("2024")).toBeNull();
  });

  it("falls back to ISO-style dates and rejects non-dates", () => {
    expect(parseImportedDate("2024-03-15")?.getUTCFullYear()).toBe(2024);
    expect(parseImportedDate("not a date")).toBeNull();
    expect(parseImportedDate("")).toBeNull();
  });
});

describe("parseImportedNumber", () => {
  it("understands Brazilian formatting (dot thousands, comma decimals)", () => {
    expect(parseImportedNumber("1.234,56")).toBe(1234.56);
    expect(parseImportedNumber("1.234.567,89")).toBe(1234567.89);
    expect(parseImportedNumber("12,5")).toBe(12.5);
  });

  it("understands US formatting (comma thousands, dot decimals)", () => {
    expect(parseImportedNumber("1,234.56")).toBe(1234.56);
    expect(parseImportedNumber("1,234,567.89")).toBe(1234567.89);
    expect(parseImportedNumber("12.5")).toBe(12.5);
  });

  it("strips currency symbols, percent signs and spaces", () => {
    expect(parseImportedNumber("R$ 1.000,00")).toBe(1000);
    expect(parseImportedNumber("2,4 %")).toBe(2.4);
  });

  it("keeps the sign and handles plain integers", () => {
    expect(parseImportedNumber("-3,5")).toBe(-3.5);
    expect(parseImportedNumber("42")).toBe(42);
  });

  it("returns null for empty or non-numeric text", () => {
    expect(parseImportedNumber("")).toBeNull();
    expect(parseImportedNumber("   ")).toBeNull();
    expect(parseImportedNumber("abc")).toBeNull();
    expect(parseImportedNumber("12abc")).toBeNull();
  });
});

describe("toDate", () => {
  it("returns Date instances as they are", () => {
    const date = new Date(2024, 0, 1);

    expect(toDate(date)).toBe(date);
  });

  it("revives strings and timestamps (the shapes dates take after JSON round trips)", () => {
    expect(toDate("2024-01-05T00:00:00.000Z").toISOString()).toBe("2024-01-05T00:00:00.000Z");
    expect(toDate(Date.UTC(2024, 0, 5)).toISOString()).toBe("2024-01-05T00:00:00.000Z");
  });
});

describe("cn", () => {
  it("joins class names and lets later Tailwind utilities win", () => {
    expect(cn("px-2", false && "hidden", "py-1")).toBe("px-2 py-1");
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});
