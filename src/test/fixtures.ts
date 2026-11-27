import type { DateRef, FrequencyUnit, IndexDirection, ProjectItem, ProjectItemSchedule, ProjectSource } from "@/lib/projects";

// Small builders so each test reads as "what the user configured" rather
// than as a wall of object literals. Dates are plain local-time Dates; the
// suite pins TZ=UTC (see vitest.config.ts), so they are deterministic.

let nextId = 0;
const id = (prefix: string) => `${prefix}-${(nextId += 1)}`;

export const day = (year: number, month: number, date: number) => new Date(year, month - 1, date);

type Frequency = { every?: number; unit?: FrequencyUnit };
const frequency = ({ every = 1, unit = "months" }: Frequency = {}) => ({ every, unit });

export function countSchedule(referenceDate: DateRef, occurrences: number, freq?: Frequency): ProjectItemSchedule {
  return { kind: "count", frequency: frequency(freq), referenceDate, occurrences };
}

export function rangeSchedule(rangeStart: DateRef, rangeEnd: DateRef, freq?: Frequency): ProjectItemSchedule {
  return { kind: "range", frequency: frequency(freq), rangeStart, rangeEnd };
}

export function entireSchedule(freq?: Frequency): ProjectItemSchedule {
  return { kind: "entire", frequency: frequency(freq), referenceDate: day(2024, 1, 1) };
}

export function fixedValue(value: number, schedule: ProjectItemSchedule, extra: Partial<ProjectItem> = {}): ProjectItem {
  return { id: id("fixed"), data: { type: "fixed-value", value, frequency: schedule.frequency, schedule }, ...extra };
}

export function timedValues(points: [Date, number][], extra: Partial<ProjectItem> = {}): ProjectItem {
  return { id: id("timed"), data: { type: "timed-values", times: points.map(([time]) => time), values: points.map(([, value]) => value) }, ...extra };
}

export function rateIndex(kind: "compound-index" | "simple-index", ratePercent: number, schedule: ProjectItemSchedule, direction: IndexDirection = "future", extra: Partial<ProjectItem> = {}): ProjectItem {
  return { id: id(kind), data: { type: kind, value: ratePercent, frequency: schedule.frequency, schedule, direction }, ...extra };
}

export function indexSeries(readings: [Date, number][], direction: IndexDirection = "future", extra: Partial<ProjectItem> = {}): ProjectItem {
  return { id: id("series"), data: { type: "index-series", times: readings.map(([time]) => time), values: readings.map(([, value]) => value), direction }, ...extra };
}

export function source(items: ProjectItem[], name = "Source"): ProjectSource {
  return { id: id("source"), name, color: "#3366cc", items };
}
