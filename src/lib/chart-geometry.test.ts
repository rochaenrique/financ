import { createFormatter } from "next-intl";
import { describe, expect, it } from "vitest";

import { countSchedule, day, entireSchedule, fixedValue, rateIndex, source, timedValues } from "@/test/fixtures";
import { computeChartLayout, formatAxisDate, formatAxisValue, regionLabel } from "./chart-geometry";

const MARGIN = { top: 10, right: 20, bottom: 30, left: 40 };

describe("computeChartLayout", () => {
  it("has nothing to draw for sources without points", () => {
    expect(computeChartLayout([], 800, 400, MARGIN, 10)).toBeNull();
    expect(computeChartLayout([source([])], 800, 400, MARGIN, 10)).toBeNull();
  });

  it("maps the first and last dates to the left and right edges of the plot area", () => {
    const layout = computeChartLayout([source([timedValues([[day(2024, 1, 1), 5], [day(2024, 1, 11), 9]])])], 800, 400, MARGIN, 10)!;

    expect(layout.xForTime(day(2024, 1, 1))).toBeCloseTo(40);
    expect(layout.xForTime(day(2024, 1, 11))).toBeCloseTo(800 - 20);
    expect(layout.xForTime(day(2024, 1, 6))).toBeCloseTo((40 + 780) / 2);
  });

  it("always includes zero in the value axis, so bars grow from a baseline", () => {
    const layout = computeChartLayout([source([timedValues([[day(2024, 1, 1), 50], [day(2024, 1, 2), 80]])])], 800, 400, MARGIN, 10)!;

    expect(layout.minValue).toBe(0);
    expect(layout.maxValue).toBe(80);
    expect(layout.yForValue(0)).toBe(layout.baselineY);
    expect(layout.yForValue(80)).toBeCloseTo(MARGIN.top);
    expect(layout.baselineY).toBeCloseTo(400 - MARGIN.bottom);
  });

  it("extends the axis below zero for negative values", () => {
    const layout = computeChartLayout([source([timedValues([[day(2024, 1, 1), -20], [day(2024, 1, 2), 30]])])], 800, 400, MARGIN, 10)!;

    expect(layout.minValue).toBe(-20);
    expect(layout.baselineY).toBeLessThan(400 - MARGIN.bottom);
  });

  it("reserves one lane above the plot for each index region", () => {
    const s = source([
      fixedValue(100, countSchedule(day(2024, 1, 1), 3)),
      rateIndex("compound-index", 1, entireSchedule()),
      rateIndex("simple-index", 1, entireSchedule()),
    ]);

    const layout = computeChartLayout([s], 800, 400, MARGIN, 10)!;

    expect(layout.regions).toHaveLength(2);
    expect(layout.margin.top).toBe(MARGIN.top + 2 * 10);
  });

  it("widens the time domain to cover index regions that extend past the data", () => {
    const s = source([timedValues([[day(2024, 1, 1), 5]]), rateIndex("compound-index", 1, { kind: "range", frequency: { every: 1, unit: "months" }, rangeStart: day(2024, 1, 1), rangeEnd: day(2024, 12, 31) })]);

    const layout = computeChartLayout([s], 800, 400, MARGIN, 10)!;

    expect(layout.xForTime(day(2024, 12, 31))).toBeCloseTo(800 - 20);
  });

  it("lists each source once in the legend, in order", () => {
    const a = source([timedValues([[day(2024, 1, 1), 1], [day(2024, 1, 2), 2]])], "A");
    const b = source([timedValues([[day(2024, 1, 1), 3]])], "B");

    const layout = computeChartLayout([a, b], 800, 400, MARGIN, 10)!;

    expect(layout.legendSources.map((entry) => entry.name)).toEqual(["A", "B"]);
  });

  it("uses at most six date ticks", () => {
    const points = Array.from({ length: 30 }, (_, i): [Date, number] => [day(2024, 1, i + 1), i + 1]);

    const layout = computeChartLayout([source([timedValues(points)])], 800, 400, MARGIN, 10)!;

    expect(layout.tickTimes).toHaveLength(6);
  });
});

describe("axis labels", () => {
  const en = createFormatter({ locale: "en" });
  const pt = createFormatter({ locale: "pt" });

  it("abbreviates thousands to one decimal and leaves small values whole", () => {
    expect(formatAxisValue(1500, en.number)).toBe("1.5k");
    expect(formatAxisValue(-2500, en.number)).toBe("-2.5k");
    expect(formatAxisValue(999, en.number)).toBe("999");
    expect(formatAxisValue(0, en.number)).toBe("0");
  });

  it("uses the locale's decimal separator inside the abbreviation", () => {
    expect(formatAxisValue(1500, pt.number)).toBe("1,5k");
  });

  it("formats dates as a short month and day", () => {
    expect(formatAxisDate(day(2024, 3, 5), en.dateTime)).toBe("Mar 5");
  });
});

describe("regionLabel", () => {
  it("looks the label up under the chart.regions message keys", () => {
    expect(regionLabel((key) => key, "compound")).toBe("chart.regions.compound");
    expect(regionLabel((key) => key, "series")).toBe("chart.regions.series");
  });
});
