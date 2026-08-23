import type { FrequencyUnit, ProjectItem, ProjectSource } from "./projects";
import { addFrequency, resolveItemDateRange } from "./projects";
import { toDate } from "./utils";

export type SourcePoint = { time: Date; value: number };

// The dates a fixed-value item's schedule fires on. "entire" has no bounds
// yet, so it can't be expanded into a finite list of occurrences.
function scheduleOccurrences(item: ProjectItem, source: ProjectSource): Date[] {
  if (item.data.type === "timed-values") return [];
  if (item.data.schedule.kind === "entire") return [];

  const { schedule } = item.data;
  const { start, end } = resolveItemDateRange(item, source);
  if (!start) return [];

  if (schedule.kind === "count") {
    return Array.from({ length: schedule.occurrences }, (_, i) => addFrequency(start, schedule.frequency, i));
  }

  if (!end || start > end) return [];
  const dates: Date[] = [];
  for (let i = 0, current = start; current <= end; i += 1, current = addFrequency(start, schedule.frequency, i)) {
    dates.push(current);
  }
  return dates;
}

// The individual (time, value) points an item contributes to its source,
// before any simple/compound-index correction. Only "timed-values" and
// "fixed-value" produce points directly -- indices don't add data of their
// own, they modify these raw points (see expandCorrectedSourcePoints).
export function expandItemPoints(item: ProjectItem, source: ProjectSource): SourcePoint[] {
  if (item.isDisabled) return [];

  if (item.data.type === "timed-values") {
    const { times, values } = item.data;
    const count = Math.min(times.length, values.length);
    return Array.from({ length: count }, (_, i) => ({ time: toDate(times[i]), value: values[i] }));
  }

  if (item.data.type !== "fixed-value") return [];

  const { value } = item.data;
  return scheduleOccurrences(item, source).map((time) => ({ time, value }));
}

// The source's raw points -- what the data says before any index
// correction, exactly as entered.
export function expandSourcePoints(source: ProjectSource): SourcePoint[] {
  return source.items.flatMap((item) => expandItemPoints(item, source));
}

export function sumSourceValue(source: ProjectSource): number {
  let total = 0;
  for (const point of expandSourcePoints(source)) total += point.value;
  return total;
}

// Average calendar length of one frequency unit, in days. Used to convert
// an elapsed calendar span into a (possibly fractional) number of
// compounding periods, so correction grows smoothly instead of jumping only
// on exact frequency boundaries.
const AVG_UNIT_DAYS: Record<FrequencyUnit, number> = {
  days: 1,
  weeks: 7,
  months: 365.2425 / 12,
  years: 365.2425,
};
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function periodsBetween(from: Date, to: Date, every: number, unit: FrequencyUnit): number {
  const elapsedDays = (to.getTime() - from.getTime()) / MS_PER_DAY;
  const periodDays = AVG_UNIT_DAYS[unit] * every;
  return elapsedDays / periodDays;
}

// A resolved simple/compound-index item: the window of dates it corrects
// (start is null for "entire", meaning unbounded below), the date raw
// points are grown/discounted toward, and the rate to apply per period.
type IndexModifier = {
  kind: "simple" | "compound";
  rate: number;
  frequency: { every: number; unit: FrequencyUnit };
  windowStart: Date | null;
  settleDate: Date;
};

// The latest date among the source's own raw points -- the settle date an
// "entire" index falls back to, since it has no schedule end of its own.
function latestRawPointDate(source: ProjectSource): Date | null {
  let latest: Date | null = null;
  for (const point of expandSourcePoints(source)) {
    if (!latest || point.time > latest) latest = point.time;
  }
  return latest;
}

function resolveIndexModifiers(source: ProjectSource): IndexModifier[] {
  const modifiers: IndexModifier[] = [];

  for (const item of source.items) {
    if (item.isDisabled) continue;
    if (item.data.type !== "compound-index" && item.data.type !== "simple-index") continue;

    const { value, frequency, schedule } = item.data;
    const kind = item.data.type === "compound-index" ? "compound" : "simple";

    let windowStart: Date | null;
    let settleDate: Date | null;
    if (schedule.kind === "entire") {
      windowStart = null;
      settleDate = latestRawPointDate(source);
    } else {
      const range = resolveItemDateRange(item, source);
      windowStart = range.start;
      settleDate = range.end;
    }
    if (!settleDate) continue;

    modifiers.push({ kind, rate: value / 100, frequency, windowStart, settleDate });
  }

  return modifiers;
}

// The window each active simple/compound-index item in a source corrects,
// for drawing on the chart. start is null for an unbounded ("entire")
// window.
export type IndexRegion = { kind: "simple" | "compound"; start: Date | null; end: Date };

export function getIndexRegions(source: ProjectSource): IndexRegion[] {
  return resolveIndexModifiers(source).map(({ kind, windowStart, settleDate }) => ({ kind, start: windowStart, end: settleDate }));
}

function inWindow(modifier: IndexModifier, time: Date): boolean {
  if (modifier.windowStart && time < modifier.windowStart) return false;
  return time <= modifier.settleDate;
}

function modifierFactor(modifier: IndexModifier, time: Date): number {
  const n = periodsBetween(time, modifier.settleDate, modifier.frequency.every, modifier.frequency.unit);
  return modifier.kind === "compound" ? Math.pow(1 + modifier.rate, n) : 1 + modifier.rate * n;
}

// The source's points after applying every simple/compound-index item that
// covers them: each raw point is grown/discounted from its own date to the
// covering index's settle date. Indices that don't cover a given point
// leave it untouched. Multiple covering indices compose multiplicatively.
// This never mutates the underlying items -- it's a read-time projection.
export function expandCorrectedSourcePoints(source: ProjectSource): SourcePoint[] {
  const modifiers = resolveIndexModifiers(source);
  if (modifiers.length === 0) return expandSourcePoints(source);

  return expandSourcePoints(source).map((point) => {
    let value = point.value;
    for (const modifier of modifiers) {
      if (inWindow(modifier, point.time)) value *= modifierFactor(modifier, point.time);
    }
    return { time: point.time, value };
  });
}

export function sumCorrectedSourceValue(source: ProjectSource): number {
  let total = 0;
  for (const point of expandCorrectedSourcePoints(source)) total += point.value;
  return total;
}
