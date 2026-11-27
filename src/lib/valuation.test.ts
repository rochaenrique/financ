import { describe, expect, it } from "vitest";

import { countSchedule, day, entireSchedule, fixedValue, indexSeries, rangeSchedule, rateIndex, source, timedValues } from "@/test/fixtures";
import { expandCorrectedSourcePoints, expandItemPoints, expandSourcePoints, getIndexRegions, sumCorrectedSourceValue, sumSourceValue } from "./valuation";

const isoDates = (points: { time: Date }[]) => points.map((point) => point.time.toISOString().slice(0, 10));

describe("raw points (before any index correction)", () => {
  it("expands a count schedule into that many evenly spaced points", () => {
    const s = source([fixedValue(100, countSchedule(day(2024, 1, 15), 3))]);

    expect(isoDates(expandSourcePoints(s))).toEqual(["2024-01-15", "2024-02-15", "2024-03-15"]);
    expect(sumSourceValue(s)).toBe(300);
  });

  it("includes the end date of a range schedule when it lands exactly on an occurrence", () => {
    const s = source([fixedValue(10, rangeSchedule(day(2024, 1, 1), day(2024, 1, 29), { unit: "weeks" }))]);

    expect(isoDates(expandSourcePoints(s))).toEqual(["2024-01-01", "2024-01-08", "2024-01-15", "2024-01-22", "2024-01-29"]);
  });

  it("produces nothing for a range that ends before it starts", () => {
    const s = source([fixedValue(10, rangeSchedule(day(2024, 2, 1), day(2024, 1, 1)))]);

    expect(expandSourcePoints(s)).toEqual([]);
  });

  it("produces nothing for an unbounded ('entire') schedule, which has no finite occurrences", () => {
    expect(sumSourceValue(source([fixedValue(10, entireSchedule())]))).toBe(0);
  });

  it("resolves a schedule that starts at 'source start' from the other items' dates", () => {
    const s = source([
      timedValues([[day(2024, 1, 10), 1], [day(2024, 3, 10), 1]]),
      fixedValue(50, countSchedule({ kind: "source-start" }, 2)),
    ]);

    expect(isoDates(expandSourcePoints(s)).slice(2)).toEqual(["2024-01-10", "2024-02-10"]);
  });

  it("ignores disabled items entirely", () => {
    const s = source([
      fixedValue(100, countSchedule(day(2024, 1, 1), 3), { isDisabled: true }),
      timedValues([[day(2024, 1, 1), 7]]),
    ]);

    expect(sumSourceValue(s)).toBe(7);
  });

  it("pairs times and values for timed series, truncating to the shorter list", () => {
    const item = timedValues([[day(2024, 1, 1), 1], [day(2024, 1, 2), 2], [day(2024, 1, 3), 3]]);
    if (item.data.type !== "timed-values") throw new Error("fixture");
    item.data.values.pop();

    expect(expandItemPoints(item, source([item])).map((point) => point.value)).toEqual([1, 2]);
  });

  it("accepts dates that arrived as strings (the shape they have after a localStorage round trip)", () => {
    const item = timedValues([[day(2024, 1, 5), 9]]);
    if (item.data.type !== "timed-values") throw new Error("fixture");
    item.data.times = ["2024-01-05T00:00:00.000Z"] as unknown as Date[];

    expect(isoDates(expandItemPoints(item, source([item])))).toEqual(["2024-01-05"]);
  });

  it("does not turn index items into points of their own", () => {
    const index = rateIndex("compound-index", 1, rangeSchedule(day(2024, 1, 1), day(2024, 1, 11), { unit: "days" }));

    expect(expandItemPoints(index, source([index]))).toEqual([]);
  });
});

describe("compound and simple index correction", () => {
  const window = rangeSchedule(day(2024, 1, 1), day(2024, 1, 11), { unit: "days" });
  const point = (date: Date) => fixedValue(1000, countSchedule(date, 1, { unit: "days" }));

  it("grows a point forward to the end of the window at the compound rate", () => {
    const s = source([point(day(2024, 1, 1)), rateIndex("compound-index", 1, window)]);

    expect(sumSourceValue(s)).toBe(1000);
    expect(sumCorrectedSourceValue(s)).toBeCloseTo(1000 * 1.01 ** 10, 6);
  });

  it("grows a point forward at the simple rate (linear, not compounding)", () => {
    const s = source([point(day(2024, 1, 1)), rateIndex("simple-index", 1, window)]);

    expect(sumCorrectedSourceValue(s)).toBeCloseTo(1000 * (1 + 0.01 * 10), 6);
  });

  it("discounts a point back to the start of the window when settling to the past", () => {
    const s = source([point(day(2024, 1, 11)), rateIndex("compound-index", 1, window, "past")]);

    expect(sumCorrectedSourceValue(s)).toBeCloseTo(1000 / 1.01 ** 10, 6);
  });

  it("discounts simple interest by dividing, not by negating the period count", () => {
    const s = source([point(day(2024, 1, 11)), rateIndex("simple-index", 1, window, "past")]);

    expect(sumCorrectedSourceValue(s)).toBeCloseTo(1000 / (1 + 0.01 * 10), 6);
  });

  it("leaves points outside the index window untouched", () => {
    const s = source([point(day(2023, 12, 31)), point(day(2024, 1, 20)), rateIndex("compound-index", 1, window)]);

    expect(sumCorrectedSourceValue(s)).toBe(2000);
  });

  it("composes several covering indices multiplicatively", () => {
    const s = source([point(day(2024, 1, 1)), rateIndex("compound-index", 1, window), rateIndex("compound-index", 1, window)]);

    expect(sumCorrectedSourceValue(s)).toBeCloseTo(1000 * 1.01 ** 20, 6);
  });

  it("ignores a disabled index", () => {
    const s = source([point(day(2024, 1, 1)), rateIndex("compound-index", 1, window, "future", { isDisabled: true })]);

    expect(sumCorrectedSourceValue(s)).toBe(1000);
  });

  it("settles an unbounded ('entire') index at the source's latest point", () => {
    const s = source([
      timedValues([[day(2024, 1, 1), 1000], [day(2024, 1, 11), 500]]),
      rateIndex("compound-index", 1, entireSchedule({ unit: "days" })),
    ]);

    expect(sumCorrectedSourceValue(s)).toBeCloseTo(1000 * 1.01 ** 10 + 500, 6);
  });

  it("equals the raw total when the source has no indices", () => {
    const s = source([timedValues([[day(2024, 1, 1), 12], [day(2024, 2, 1), 30]])]);

    expect(sumCorrectedSourceValue(s)).toBe(sumSourceValue(s));
    expect(expandCorrectedSourcePoints(s)).toEqual(expandSourcePoints(s));
  });
});

describe("index series correction", () => {
  const readings: [Date, number][] = [[day(2024, 1, 1), 100], [day(2024, 1, 11), 110]];

  it("scales a point by the ratio of the settle reading to the reading at the point's date", () => {
    const s = source([timedValues([[day(2024, 1, 1), 1000]]), indexSeries(readings)]);

    expect(sumCorrectedSourceValue(s)).toBeCloseTo(1000 * (110 / 100), 6);
  });

  it("interpolates linearly between readings", () => {
    // halfway between 100 and 110 the index reads 105
    const s = source([timedValues([[day(2024, 1, 6), 210]]), indexSeries(readings)]);

    expect(sumCorrectedSourceValue(s)).toBeCloseTo(210 * (110 / 105), 6);
  });

  it("settles to the earliest reading when the direction is 'past'", () => {
    const s = source([timedValues([[day(2024, 1, 11), 110]]), indexSeries(readings, "past")]);

    expect(sumCorrectedSourceValue(s)).toBeCloseTo(110 * (100 / 110), 6);
  });

  it("does not depend on the order the readings were entered in", () => {
    const shuffled = [...readings].reverse();
    const forward = source([timedValues([[day(2024, 1, 6), 210]]), indexSeries(readings)]);
    const reversed = source([timedValues([[day(2024, 1, 6), 210]]), indexSeries(shuffled)]);

    expect(sumCorrectedSourceValue(reversed)).toBeCloseTo(sumCorrectedSourceValue(forward), 9);
  });

  it("leaves points outside the span of the readings untouched", () => {
    const s = source([timedValues([[day(2024, 1, 20), 50]]), indexSeries(readings)]);

    expect(sumCorrectedSourceValue(s)).toBe(50);
  });
});

describe("index regions (what the chart draws)", () => {
  it("reports each active index with its window and settle direction", () => {
    const s = source([rateIndex("compound-index", 1, rangeSchedule(day(2024, 1, 1), day(2024, 1, 11), { unit: "days" }), "past")]);

    expect(getIndexRegions(s)).toEqual([{ kind: "compound", direction: "past", start: day(2024, 1, 1), end: day(2024, 1, 11) }]);
  });

  it("leaves the start open for an unbounded index and ends it at the latest point", () => {
    const s = source([timedValues([[day(2024, 3, 1), 1]]), rateIndex("simple-index", 1, entireSchedule())]);

    expect(getIndexRegions(s)).toEqual([{ kind: "simple", direction: "future", start: null, end: day(2024, 3, 1) }]);
  });

  it("spans the first to last reading for an index series", () => {
    const s = source([indexSeries([[day(2024, 1, 11), 110], [day(2024, 1, 1), 100]])]);

    expect(getIndexRegions(s)).toEqual([{ kind: "series", direction: "future", start: day(2024, 1, 1), end: day(2024, 1, 11) }]);
  });

  it("skips disabled indices", () => {
    const s = source([rateIndex("compound-index", 1, rangeSchedule(day(2024, 1, 1), day(2024, 1, 11)), "future", { isDisabled: true })]);

    expect(getIndexRegions(s)).toEqual([]);
  });
});
