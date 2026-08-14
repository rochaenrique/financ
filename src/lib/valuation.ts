import type { ProjectItem, ProjectSource } from "./projects";
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

// The individual (time, value) points an item contributes to its source.
// Only "timed-values" and "fixed-value" are modeled today -- compound and
// simple indices need rate-accumulation logic that isn't implemented yet,
// so they contribute no points for now.
export function expandItemPoints(item: ProjectItem, source: ProjectSource): SourcePoint[] {
  if (item.data.type === "timed-values") {
    const { times, values } = item.data;
    const count = Math.min(times.length, values.length);
    return Array.from({ length: count }, (_, i) => ({ time: toDate(times[i]), value: values[i] }));
  }

  if (item.data.type !== "fixed-value") return [];

  const { value } = item.data;
  return scheduleOccurrences(item, source).map((time) => ({ time, value }));
}

export function expandSourcePoints(source: ProjectSource): SourcePoint[] {
  return source.items.flatMap((item) => expandItemPoints(item, source));
}

export function sumSourceValue(source: ProjectSource): number {
  let total = 0;
  for (const point of expandSourcePoints(source)) total += point.value;
  return total;
}
