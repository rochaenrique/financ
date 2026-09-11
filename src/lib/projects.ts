import { toDate } from "./utils";

export type FrequencyUnit = "days" | "weeks" | "months" | "years";

export type ProjectItemFrequency = {
  every: number;
  unit: FrequencyUnit;
};

// A schedule date can be a literal Date, or a live reference to the
// earliest/latest date among the other items in the same source (see
// getSourceDateRange). References are resolved on demand rather than
// snapshotted, so they track the source's data as it changes.
export type DateRef = Date | { kind: "source-start" } | { kind: "source-end" };

export type ProjectItemSchedule = {
  kind: "count";
  frequency: ProjectItemFrequency;
  referenceDate: DateRef;
  occurrences: number;
} | {
  kind: "range";
  frequency: ProjectItemFrequency;
  rangeStart: DateRef;
  rangeEnd: DateRef;
} | {
  kind: "entire";
  frequency: ProjectItemFrequency;
  referenceDate: Date;
}

// Which end of an index item's window raw points settle toward: "future"
// grows them forward to the window's end (future value, the original
// behavior); "past" discounts them back to the window's start (present
// value -- what the money is worth on the first day).
export type IndexDirection = "future" | "past";

export type ProjectItemData = {
  type: "timed-values";
  values: number[];
  times: Date[];
} | {
  type: "fixed-value";
  value: number;
  frequency: ProjectItemFrequency;
  schedule: ProjectItemSchedule;
} | {
  type: "compound-index" | "simple-index";
  value: number;
  frequency: ProjectItemFrequency;
  schedule: ProjectItemSchedule;
  direction?: IndexDirection;
} | {
  // A researched index (inflation, CPI, etc.): a dated series of readings,
  // same shape as timed-values, used purely as a correction factor -- the
  // ratio between the reading at a raw point's date and the reading at the
  // settle date (direction's future/past end). Contributes no value of its
  // own to Raw, same as compound/simple-index.
  type: "index-series";
  values: number[];
  times: Date[];
  direction?: IndexDirection;
}

export type ProjectItem = {
  id: string;
  data: ProjectItemData;
  // When true, the item is excluded from every computation -- points, sums,
  // chart, index correction, and sibling source-data date resolution -- as
  // if it didn't exist, without losing its configuration.
  isDisabled?: boolean;
}

export type ProjectSource = {
  id: string;
  name: string;
  color: string;
  items: ProjectItem[];
}

export type Project = {
  id: string;
  name: string;
  modified: string;
  sources: ProjectSource[];
}

export function addFrequency(date: Date, frequency: ProjectItemFrequency, count: number): Date {
  const result = new Date(date);
  if (frequency.unit === "days") result.setDate(result.getDate() + frequency.every * count);
  else if (frequency.unit === "weeks") result.setDate(result.getDate() + frequency.every * 7 * count);
  else if (frequency.unit === "months") result.setMonth(result.getMonth() + frequency.every * count);
  else result.setFullYear(result.getFullYear() + frequency.every * count);
  return result;
}

export function isSourceDateRef(ref: DateRef): ref is { kind: "source-start" | "source-end" } {
  return typeof ref === "object" && ref !== null && !(ref instanceof Date);
}

// The concrete date range of an item, using only its own literal dates --
// null if the item is unbounded ("entire") or itself depends on a
// source-start/source-end reference. Used to aggregate a source's range
// without recursing into other referencing items.
function itemConcreteDateRange(item: ProjectItem): { start: Date; end: Date } | null {
  if (item.data.type === "timed-values" || item.data.type === "index-series") {
    const { times } = item.data;
    if (times.length === 0) return null;
    const timestamps = times.map((time) => toDate(time).getTime());
    return { start: new Date(Math.min(...timestamps)), end: new Date(Math.max(...timestamps)) };
  }

  const { schedule } = item.data;
  if (schedule.kind === "entire") return null;

  if (schedule.kind === "count") {
    if (isSourceDateRef(schedule.referenceDate)) return null;
    const start = toDate(schedule.referenceDate);
    return { start, end: addFrequency(start, schedule.frequency, schedule.occurrences - 1) };
  }

  if (isSourceDateRef(schedule.rangeStart) || isSourceDateRef(schedule.rangeEnd)) return null;
  return { start: toDate(schedule.rangeStart), end: toDate(schedule.rangeEnd) };
}

// The live time-range spanned by a source's items: the earliest start and
// latest end among items with a concrete date range. Items that are
// unbounded, or that themselves reference the source's range, are excluded
// so the result never depends on itself.
export function getSourceDateRange(source: ProjectSource, excludeItemId?: string): { start: Date | null; end: Date | null } {
  let start: Date | null = null;
  let end: Date | null = null;

  for (const item of source.items) {
    if (item.id === excludeItemId || item.isDisabled) continue;
    const range = itemConcreteDateRange(item);
    if (!range) continue;
    if (!start || range.start < start) start = range.start;
    if (!end || range.end > end) end = range.end;
  }

  return { start, end };
}

function resolveDateRef(ref: DateRef, source: ProjectSource, excludeItemId?: string): Date | null {
  if (!isSourceDateRef(ref)) return toDate(ref);
  const range = getSourceDateRange(source, excludeItemId);
  return ref.kind === "source-start" ? range.start : range.end;
}

// The effective date range of an item, resolving any source-start/source-end
// references against the current state of its source.
export function resolveItemDateRange(item: ProjectItem, source: ProjectSource): { start: Date | null; end: Date | null } {
  if (item.data.type === "timed-values" || item.data.type === "index-series") {
    return itemConcreteDateRange(item) ?? { start: null, end: null };
  }

  const { schedule } = item.data;
  if (schedule.kind === "entire") return { start: null, end: null };

  if (schedule.kind === "count") {
    const start = resolveDateRef(schedule.referenceDate, source, item.id);
    if (!start) return { start: null, end: null };
    return { start, end: addFrequency(start, schedule.frequency, schedule.occurrences - 1) };
  }

  return {
    start: resolveDateRef(schedule.rangeStart, source, item.id),
    end: resolveDateRef(schedule.rangeEnd, source, item.id),
  };
}

// Fixed saturation/lightness so every generated source color reads as a
// vibrant, legible accent -- random hue is enough variety on its own, and
// keeps colors away from the muddy/washed-out results a fully random RGB
// triple can produce.
const SOURCE_COLOR_SATURATION = 70;
const SOURCE_COLOR_LIGHTNESS = 55;

function hslToHex(h: number, s: number, l: number): string {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] :
    h < 120 ? [x, c, 0] :
    h < 180 ? [0, c, x] :
    h < 240 ? [0, x, c] :
    h < 300 ? [x, 0, c] :
    [c, 0, x];
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToHue(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return 0;

  const hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return hue < 0 ? hue * 60 + 360 : hue * 60;
}

// A random, UI-friendly source color: random hue at a fixed vibrant
// saturation/lightness so it always pops against the light backgrounds it's
// used on (chart markers, legend dots, results-table row tint).
export function randomSourceColor(): string {
  return hslToHex(Math.random() * 360, SOURCE_COLOR_SATURATION, SOURCE_COLOR_LIGHTNESS);
}

// A color for a duplicated source: the original's hue rotated well away
// (120-240 degrees, i.e. past its complement, with some jitter) so a copy
// is easy to tell apart from its original at a glance rather than risking
// a coincidental near-identical re-roll.
function differentSourceColor(originalColor: string): string {
  const hue = (hexToHue(originalColor) + 120 + Math.random() * 120) % 360;
  return hslToHex(hue, SOURCE_COLOR_SATURATION, SOURCE_COLOR_LIGHTNESS);
}

// "Name" -> "Name copy" -> "Name copy 2" -> "Name copy 3" ..., skipping
// whatever's already taken among sibling source names.
function nextCopyName(baseName: string, existingNames: string[]): string {
  const taken = new Set(existingNames);
  const base = `${baseName} copy`;
  if (!taken.has(base)) return base;

  for (let n = 2; ; n += 1) {
    const candidate = `${base} ${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

// A deep copy of a source: fresh ids for the source and every item (so
// nothing is shared by reference with the original), a name derived from
// nextCopyName, and a color shifted away from the original's so the two are
// easy to tell apart at a glance. Any item whose schedule points at
// "source-start" / "source-end" keeps pointing at whichever source it lives
// in, so it correctly re-resolves against the new source's own items.
export function duplicateSource(source: ProjectSource, existingNames: string[]): ProjectSource {
  return {
    id: crypto.randomUUID(),
    name: nextCopyName(source.name, existingNames),
    color: differentSourceColor(source.color),
    items: source.items.map((item) => ({ id: crypto.randomUUID(), data: structuredClone(item.data) })),
  };
}

const PROJECT_INDEX_KEY = "projects:index";

export function getProjectIndex(): Project[] {
  if (typeof window === "undefined") {
    return [];
  }
  
  const value = localStorage.getItem(PROJECT_INDEX_KEY);
  
  if (!value) {
    return [];
  }
  
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

export function saveProjectIndex(projects: Project[]) {
  localStorage.setItem(
                       PROJECT_INDEX_KEY,
                       JSON.stringify(projects)
                       );
}

export function getProject(id: string): Project | null {
  if (typeof window === "undefined") {
    return null;
  }
  
  const value = localStorage.getItem(id);
  
  if (!value) {
    return null;
  }
  
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function saveProject(project: Project) {
  localStorage.setItem(
                       project.id,
                       JSON.stringify(project)
                       );
  
  const projects = getProjectIndex();
  
  const index = projects.findIndex(
                                   (item) => item.id === project.id
                                   );
  
  if (index >= 0) {
    projects[index] = project;
  } else {
    projects.push(project);
  }
  
  saveProjectIndex(projects);
}

export function createProject(name: string): Project {
  const id = crypto.randomUUID();
  
  const project: Project = {
    id,
    name,
    modified: new Date().toISOString(),
    sources: [],
  }
  
  saveProject(project);
  
  return project;
}

export function deleteProject(id: string): void {
  if (typeof window === "undefined") {
    return;
  }
  
  localStorage.removeItem(id);
  
  const projects = getProjectIndex().filter((project) => project.id !== id);
  saveProjectIndex(projects);
}

export function renameProject(id: string, name: string): Project | null {
  if (typeof window === "undefined") {
    return null;
  }
  
  const project = getProject(id);
  if (!project) {
    return null;
  }
  
  const renamed: Project = {
    ...project,
    name,
    modified: new Date().toISOString(),
  };
  
  saveProject(renamed);
  return renamed;
}

// A project is fully self-contained (nothing it references lives outside
// its own sources/items), so this envelope's `project` field is the entire
// unit of transfer -- copying it into another machine's localStorage via
// saveProject reproduces the original exactly, "modified" timestamp
// included. The version number isn't used for anything yet; it's here so
// a future format change has something to branch on instead of guessing.
const PROJECT_EXPORT_VERSION = 1;

export type ProjectExport = {
  version: number;
  exportedAt: string;
  project: Project;
};

export function createProjectExport(project: Project): ProjectExport {
  return { version: PROJECT_EXPORT_VERSION, exportedAt: new Date().toISOString(), project };
}

// Deliberately light-touch: just enough to avoid writing garbage into
// localStorage (a missing id would corrupt the project index) or crashing
// on a non-JSON file, not a full schema validator.
export function parseProjectExport(json: string): Project | null {
  try {
    const parsed = JSON.parse(json);
    const project = parsed?.project;
    if (project && typeof project.id === "string" && typeof project.name === "string" && Array.isArray(project.sources)) {
      return project as Project;
    }
  } catch {
    // fall through
  }
  return null;
}