import type { ProjectSource } from "./projects";
import { expandCorrectedSourcePoints, getIndexRegions } from "./valuation";
// Type-only: derived from next-intl's own formatter rather than hand-rolled
// against Intl.NumberFormatOptions/Intl.DateTimeFormatOptions, whose option
// types are narrower per-field than the general Intl ones (see results.ts
// for the full rationale). Erased at build time, so no runtime dependency.
import type { useFormatter } from "next-intl";

export type ChartPoint = { time: Date; value: number; color: string; sourceId: string; sourceName: string };
export type ChartRegion = { kind: "simple" | "compound" | "series"; direction: "future" | "past"; start: Date | null; end: Date; color: string; sourceName: string };
export type ChartMargin = { top: number; right: number; bottom: number; left: number };

export type ChartLayout = {
  points: ChartPoint[];
  regions: ChartRegion[];
  width: number;
  height: number;
  margin: ChartMargin;
  minValue: number;
  maxValue: number;
  xForTime: (time: Date) => number;
  yForValue: (value: number) => number;
  baselineY: number;
  tickTimes: Date[];
  yTicks: number[];
  legendSources: { id: string; name: string; color: string }[];
};

const Y_TICK_COUNT = 4;

function collectChartPoints(sources: ProjectSource[]): ChartPoint[] {
  const points: ChartPoint[] = [];
  for (const source of sources) {
    for (const point of expandCorrectedSourcePoints(source)) {
      if (Number.isNaN(point.time.getTime())) continue; // skip unparsable timestamps rather than crashing
      points.push({ time: point.time, value: point.value, color: source.color, sourceId: source.id, sourceName: source.name });
    }
  }
  return points;
}

function collectChartRegions(sources: ProjectSource[]): ChartRegion[] {
  const regions: ChartRegion[] = [];
  for (const source of sources) {
    for (const region of getIndexRegions(source)) {
      regions.push({ ...region, color: source.color, sourceName: source.name });
    }
  }
  return regions;
}

// Shared chart geometry (scales, ticks, margins) for a given pixel size --
// used by both the on-screen SVG chart and the PDF report's vector-drawn
// chart, so the two can never disagree about where a point belongs. Margin
// and region-lane height are passed in rather than hardcoded since the PDF
// version draws at different absolute dimensions than the on-screen one.
export function computeChartLayout(sources: ProjectSource[], width: number, height: number, baseMargin: ChartMargin, regionLaneHeight: number): ChartLayout | null {
  const points = collectChartPoints(sources);
  const regions = collectChartRegions(sources);

  if (points.length === 0) return null;

  // Index regions can extend past the plotted points (e.g. a rate that
  // applies through next year), so the time domain has to cover them too or
  // the region line would run off the edge of the chart.
  const times = [
    ...points.map((point) => point.time.getTime()),
    ...regions.flatMap((region) => [region.start?.getTime(), region.end.getTime()].filter((t): t is number => t !== undefined)),
  ];
  const values = points.map((point) => point.value);

  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const timeSpan = maxTime - minTime || 1;

  // markers should always reach down to (or up from) a zero baseline, so the domain has to include 0 even if every value is positive or negative
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(0, ...values);
  const valueSpan = maxValue - minValue || 1;

  // Each index region gets its own horizontal lane above the plot, so the
  // top margin grows with how many there are.
  const margin = { ...baseMargin, top: baseMargin.top + regions.length * regionLaneHeight };

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  function xForTime(time: Date): number { return margin.left + ((time.getTime() - minTime) / timeSpan) * innerWidth; }
  function yForValue(value: number): number { return margin.top + innerHeight - ((value - minValue) / valueSpan) * innerHeight; }

  const baselineY = yForValue(0);

  const sortedTimes = [...new Set(points.map((point) => point.time.getTime()))].sort((a, b) => a - b);
  const tickCount = Math.min(6, sortedTimes.length);
  const tickTimes = Array.from({ length: tickCount }, (_, i) => new Date(minTime + (timeSpan * i) / Math.max(1, tickCount - 1)));
  const yTicks = Array.from({ length: Y_TICK_COUNT + 1 }, (_, i) => minValue + (valueSpan * i) / Y_TICK_COUNT);

  const legendSources = [...new Map(points.map((point) => [point.sourceId, { id: point.sourceId, name: point.sourceName, color: point.color }])).values()];

  return { points, regions, width, height, margin, minValue, maxValue, xForTime, yForValue, baselineY, tickTimes, yTicks, legendSources };
}

type NumberFormatter = ReturnType<typeof useFormatter>["number"];
type DateFormatter = ReturnType<typeof useFormatter>["dateTime"];

export function formatAxisDate(date: Date, formatDate: DateFormatter): string {
  return formatDate(date, { month: "short", day: "numeric" });
}

// Keeps the compact "1.2k" abbreviation above 1000 (axis labels have tight
// horizontal space, so a longer localized word like "mil" risks crowding) --
// only the number itself becomes locale-aware (decimal separator, rounding).
export function formatAxisValue(value: number, formatNumber: NumberFormatter): string {
  return Math.abs(value) >= 1000
    ? `${formatNumber(value / 1000, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}k`
    : formatNumber(value, { maximumFractionDigits: 0 });
}

// t is a minimal structural subset of next-intl's translator, matching the
// same pattern used in results.ts -- lets this stay a plain module with no
// next-intl dependency while still letting the caller (which does have
// hook access) supply translated copy.
type Translate = (key: string) => string;

export function regionLabel(t: Translate, kind: ChartRegion["kind"]): string {
  return t(`chart.regions.${kind}`);
}

// Points settle toward the arrow's end: forward to the future, or back to the past.
export const REGION_DIRECTION_ARROW: Record<ChartRegion["direction"], string> = { future: "→", past: "←" };
