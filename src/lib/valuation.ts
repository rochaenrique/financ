import type { FrequencyUnit, IndexDirection, ProjectItem, ProjectSource } from "./projects";
import { addFrequency, resolveItemDateRange } from "./projects";
import { toDate } from "./utils";

export type SourcePoint = { time: Date; value: number };

// The dates a fixed-value item's schedule fires on. "entire" has no bounds
// yet, so it can't be expanded into a finite list of occurrences.
function scheduleOccurrences(item: ProjectItem, source: ProjectSource): Date[] {
  if (item.data.type === "timed-values" || item.data.type === "index-series") return [];
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

// A resolved simple/compound-index item: the window of dates it covers
// (windowStart null means unbounded below), the rate to apply per period,
// and which end of the window points settle toward. "future" grows points
// forward to windowEnd; "past" discounts them back to windowStart (falling
// back to the source's earliest raw point if the window itself has no
// start, mirroring how an unbounded window's end falls back to the latest).
type RateModifier = {
  kind: "simple" | "compound";
  direction: IndexDirection;
  rate: number;
  frequency: { every: number; unit: FrequencyUnit };
  windowStart: Date | null;
  windowEnd: Date;
  settleDate: Date;
};

// A resolved index-series item: a researched index (inflation, CPI, ...)
// entered as dated readings. Its window is exactly the span of the
// imported data (both ends always concrete, unlike a rate index), and its
// factor is a ratio between two readings rather than a per-period rate.
type SeriesModifier = {
  kind: "series";
  direction: IndexDirection;
  times: Date[]; // sorted ascending
  values: number[]; // values[i] corresponds to times[i]
  windowStart: Date;
  windowEnd: Date;
  settleDate: Date;
};

type IndexModifier = RateModifier | SeriesModifier;

// The latest/earliest dates among the source's own raw points -- the
// fallback settle dates an "entire" (or otherwise unbounded) index uses,
// since it has no schedule bound of its own on that side.
function latestRawPointDate(source: ProjectSource): Date | null {
  let latest: Date | null = null;
  for (const point of expandSourcePoints(source)) {
    if (!latest || point.time > latest) latest = point.time;
  }
  return latest;
}

function earliestRawPointDate(source: ProjectSource): Date | null {
  let earliest: Date | null = null;
  for (const point of expandSourcePoints(source)) {
    if (!earliest || point.time < earliest) earliest = point.time;
  }
  return earliest;
}

function resolveIndexModifiers(source: ProjectSource): IndexModifier[] {
  const modifiers: IndexModifier[] = [];

  for (const item of source.items) {
    if (item.isDisabled) continue;

    if (item.data.type === "compound-index" || item.data.type === "simple-index") {
      const { value, frequency, schedule, direction = "future" } = item.data;
      const kind = item.data.type === "compound-index" ? "compound" : "simple";

      let windowStart: Date | null;
      let windowEnd: Date | null;
      if (schedule.kind === "entire") {
        windowStart = null;
        windowEnd = latestRawPointDate(source);
      } else {
        const range = resolveItemDateRange(item, source);
        windowStart = range.start;
        windowEnd = range.end;
      }
      if (!windowEnd) continue;

      const settleDate = direction === "future" ? windowEnd : (windowStart ?? earliestRawPointDate(source));
      if (!settleDate) continue;

      modifiers.push({ kind, direction, rate: value / 100, frequency, windowStart, windowEnd, settleDate });
      continue;
    }

    if (item.data.type === "index-series") {
      const { times: rawTimes, values, direction = "future" } = item.data;
      const count = Math.min(rawTimes.length, values.length);
      if (count === 0) continue;

      const readings = Array.from({ length: count }, (_, i) => ({ time: toDate(rawTimes[i]), value: values[i] })).sort((a, b) => a.time.getTime() - b.time.getTime());
      const windowStart = readings[0].time;
      const windowEnd = readings[readings.length - 1].time;
      const settleDate = direction === "future" ? windowEnd : windowStart;

      modifiers.push({ kind: "series", direction, times: readings.map((r) => r.time), values: readings.map((r) => r.value), windowStart, windowEnd, settleDate });
    }
  }

  return modifiers;
}

// Linear interpolation of a series' value at an arbitrary date, between the
// two readings surrounding it. Assumes times is sorted ascending. Returns
// null outside the series' own range -- callers only reach dates inside the
// window anyway (see inWindow), so this is a defensive fallback.
function seriesLevelAt(times: Date[], values: number[], date: Date): number | null {
  const t = date.getTime();
  const first = times[0]?.getTime();
  const last = times[times.length - 1]?.getTime();
  if (first === undefined || last === undefined || t < first || t > last) return null;

  for (let i = 0; i < times.length - 1; i += 1) {
    const t0 = times[i].getTime();
    const t1 = times[i + 1].getTime();
    if (t >= t0 && t <= t1) {
      if (t1 === t0) return values[i];
      const frac = (t - t0) / (t1 - t0);
      return values[i] + (values[i + 1] - values[i]) * frac;
    }
  }
  return values[values.length - 1];
}

// The window each active index item in a source corrects, for drawing on
// the chart. start is null only for an unbounded ("entire") rate index;
// index-series windows are always concrete (the span of the imported data).
export type IndexRegion = { kind: "simple" | "compound" | "series"; direction: IndexDirection; start: Date | null; end: Date };

export function getIndexRegions(source: ProjectSource): IndexRegion[] {
  return resolveIndexModifiers(source).map(({ kind, direction, windowStart, windowEnd }) => ({ kind, direction, start: windowStart, end: windowEnd }));
}

function inWindow(modifier: IndexModifier, time: Date): boolean {
  if (modifier.windowStart && time < modifier.windowStart) return false;
  return time <= modifier.windowEnd;
}

// Simple interest isn't reciprocal like compound is -- discounting back to
// the start is division by the forward growth factor, not the same formula
// run with a negated period count (that goes negative over long spans).
function modifierFactor(modifier: IndexModifier, time: Date): number {
  if (modifier.kind === "series") {
    const pointLevel = seriesLevelAt(modifier.times, modifier.values, time);
    const settleLevel = seriesLevelAt(modifier.times, modifier.values, modifier.settleDate);
    if (pointLevel === null || settleLevel === null || pointLevel === 0) return 1; // defensive: shouldn't happen given inWindow already bounds `time`
    return settleLevel / pointLevel;
  }

  if (modifier.direction === "future") {
    const n = periodsBetween(time, modifier.settleDate, modifier.frequency.every, modifier.frequency.unit);
    return modifier.kind === "compound" ? Math.pow(1 + modifier.rate, n) : 1 + modifier.rate * n;
  }

  const n = periodsBetween(modifier.settleDate, time, modifier.frequency.every, modifier.frequency.unit);
  return modifier.kind === "compound" ? Math.pow(1 + modifier.rate, -n) : 1 / (1 + modifier.rate * n);
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
