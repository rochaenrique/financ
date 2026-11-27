import { createFormatter } from "next-intl";
import { describe, expect, it } from "vitest";

import { countSchedule, day, fixedValue, rangeSchedule, rateIndex, source, timedValues } from "@/test/fixtures";
import { RESULT_COLUMNS, computeResults, formatResultDate, formatResultNumber, formatResultSigned, resultColumnLabel, resultColumnTitle, type ResultFormat } from "./results";

const formatterFor = (locale: string): ResultFormat => {
  const format = createFormatter({ locale });
  return { number: format.number, dateTime: format.dateTime };
};

describe("computeResults", () => {
  const cheap = source([timedValues([[day(2024, 1, 1), 100]])], "Cheap");
  const pricey = source([timedValues([[day(2024, 1, 1), 300]])], "Pricey");

  it("reports raw totals and compares each source to the lowest one", () => {
    const [a, b] = computeResults([pricey, cheap]);

    expect(a).toMatchObject({ name: "Pricey", raw: 300, comparedRaw: 200 });
    expect(b).toMatchObject({ name: "Cheap", raw: 100, comparedRaw: 0 });
  });

  it("measures the effect of index correction as VAM minus raw", () => {
    const window = rangeSchedule(day(2024, 1, 1), day(2024, 1, 11), { unit: "days" });
    const corrected = source([
      fixedValue(1000, countSchedule(day(2024, 1, 1), 1, { unit: "days" })),
      rateIndex("simple-index", 1, window),
    ]);

    const [result] = computeResults([corrected]);

    expect(result.raw).toBe(1000);
    expect(result.vam).toBeCloseTo(1100, 6);
    expect(result.correction).toBeCloseTo(100, 6);
  });

  it("compares VAM against the lowest VAM, independently of raw", () => {
    const window = rangeSchedule(day(2024, 1, 1), day(2024, 1, 11), { unit: "days" });
    const grown = source([timedValues([[day(2024, 1, 1), 100]]), rateIndex("simple-index", 10, window)], "Grown");

    const [low, high] = computeResults([cheap, grown]);

    expect(low.comparedVam).toBe(0);
    expect(high.vam).toBeCloseTo(200, 6);
    expect(high.comparedVam).toBeCloseTo(100, 6);
    expect(high.comparedRaw).toBe(0); // same raw total, different corrected total
  });

  it("counts items and exposes the source's date range", () => {
    const [result] = computeResults([source([timedValues([[day(2024, 1, 5), 1], [day(2024, 3, 9), 1]]), fixedValue(1, countSchedule(day(2024, 2, 1), 1))])]);

    expect(result.itemCount).toBe(2);
    expect(result.dateStart).toEqual(day(2024, 1, 5));
    expect(result.dateEnd).toEqual(day(2024, 3, 9));
  });

  it("returns nothing for no sources", () => {
    expect(computeResults([])).toEqual([]);
  });

  it("computes 'lowest' only across the sources it is given", () => {
    // a report that leaves the cheapest source out must compare against what it shows
    const [onlyPricey] = computeResults([pricey]);

    expect(onlyPricey.comparedRaw).toBe(0);
  });
});

describe("number and date formatting", () => {
  it("shows two decimals using the locale's separators", () => {
    expect(formatResultNumber(1234.5, formatterFor("en").number)).toBe("1,234.50");
    expect(formatResultNumber(1234.5, formatterFor("pt").number)).toBe("1.234,50");
    expect(formatResultNumber(0, formatterFor("en").number)).toBe("0.00");
  });

  it("signs differences, but not zero", () => {
    const { number } = formatterFor("en");

    expect(formatResultSigned(5, number)).toBe("+5.00");
    expect(formatResultSigned(-5, number)).toBe("-5.00");
    expect(formatResultSigned(0, number)).toBe("0.00");
  });

  it("formats dates in the selected language", () => {
    expect(formatResultDate(day(2024, 3, 5), formatterFor("en").dateTime)).toBe("Mar 05, 2024");
    expect(formatResultDate(day(2024, 3, 5), formatterFor("pt").dateTime)).toContain("2024");
  });
});

describe("result columns", () => {
  const sample = computeResults([source([timedValues([[day(2024, 1, 5), 1234.5], [day(2024, 3, 9), 1]]), fixedValue(1, countSchedule(day(2024, 2, 1), 1))])])[0];
  const format = formatterFor("en");
  const render = (key: string) => RESULT_COLUMNS.find((column) => column.key === key)!.formatValue(sample, format);

  it("renders each column from the same result", () => {
    expect(render("raw")).toBe("1,236.50");
    expect(render("vam")).toBe("1,236.50");
    expect(render("comparedVam")).toBe("0.00");
    expect(render("itemCount")).toBe("2");
    expect(render("dateRange")).toBe("Jan 05, 2024 → Mar 09, 2024");
  });

  it("shows a dash for the date range of a source with no dates", () => {
    const empty = computeResults([source([])])[0];

    expect(RESULT_COLUMNS.find((column) => column.key === "dateRange")!.formatValue(empty, format)).toBe("—");
  });

  it("marks exactly the money columns as monetary, so currency symbols are never put on counts or dates", () => {
    expect(RESULT_COLUMNS.filter((column) => column.isMonetary).map((column) => column.key)).toEqual(["raw", "comparedRaw", "vam", "comparedVam", "correction"]);
  });

  it("looks labels and tooltips up under the shared message keys", () => {
    const t = (key: string) => key;
    const raw = RESULT_COLUMNS.find((column) => column.key === "raw")!;
    const vam = RESULT_COLUMNS.find((column) => column.key === "vam")!;

    expect(resultColumnLabel(t, raw)).toBe("resultsTable.columns.raw");
    expect(resultColumnTitle(t, raw)).toBe("resultsTable.columns.rawTitle");
    expect(resultColumnTitle(t, vam)).toBeUndefined();
  });
});
