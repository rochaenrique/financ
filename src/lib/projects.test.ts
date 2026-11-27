import { beforeEach, describe, expect, it, vi } from "vitest";

import { installBrowserStorage } from "@/test/browser-storage";
import { countSchedule, day, entireSchedule, fixedValue, rangeSchedule, source, timedValues } from "@/test/fixtures";
import {
  addFrequency,
  createProject,
  createProjectExport,
  deleteProject,
  duplicateSource,
  getProject,
  getProjectIndex,
  getSourceDateRange,
  parseProjectExport,
  randomSourceColor,
  renameProject,
  resolveItemDateRange,
  saveProject,
  subscribeToStorage,
} from "./projects";

describe("addFrequency", () => {
  const start = day(2024, 1, 15);

  it("steps by days, weeks, months and years", () => {
    expect(addFrequency(start, { every: 10, unit: "days" }, 1)).toEqual(day(2024, 1, 25));
    expect(addFrequency(start, { every: 2, unit: "weeks" }, 1)).toEqual(day(2024, 1, 29));
    expect(addFrequency(start, { every: 1, unit: "months" }, 2)).toEqual(day(2024, 3, 15));
    expect(addFrequency(start, { every: 1, unit: "years" }, 3)).toEqual(day(2027, 1, 15));
  });

  it("multiplies the interval by the step count", () => {
    expect(addFrequency(start, { every: 3, unit: "months" }, 2)).toEqual(day(2024, 7, 15));
  });

  it("returns an equal date for zero steps, without mutating its input", () => {
    const result = addFrequency(start, { every: 1, unit: "months" }, 0);

    expect(result).toEqual(start);
    expect(result).not.toBe(start);
    expect(start).toEqual(day(2024, 1, 15));
  });
});

describe("date ranges", () => {
  it("spans the earliest start to the latest end of the items with concrete dates", () => {
    const s = source([
      timedValues([[day(2024, 3, 1), 1], [day(2024, 5, 1), 1]]),
      fixedValue(1, countSchedule(day(2024, 1, 10), 3)), // Jan 10 .. Mar 10
    ]);

    expect(getSourceDateRange(s)).toEqual({ start: day(2024, 1, 10), end: day(2024, 5, 1) });
  });

  it("leaves unbounded items, disabled items and an excluded item out of the range", () => {
    const included = timedValues([[day(2024, 2, 1), 1]]);
    const s = source([
      included,
      fixedValue(1, entireSchedule()),
      timedValues([[day(2020, 1, 1), 1]], { isDisabled: true }),
      timedValues([[day(2030, 1, 1), 1]]),
    ]);
    const excluded = s.items[3];

    expect(getSourceDateRange(s, excluded.id)).toEqual({ start: day(2024, 2, 1), end: day(2024, 2, 1) });
  });

  it("is empty for a source with no dated items", () => {
    expect(getSourceDateRange(source([]))).toEqual({ start: null, end: null });
  });

  it("resolves 'source start' and 'source end' against the other items, live", () => {
    const anchored = fixedValue(1, rangeSchedule({ kind: "source-start" }, { kind: "source-end" }));
    const s = source([timedValues([[day(2024, 1, 1), 1], [day(2024, 6, 1), 1]]), anchored]);

    expect(resolveItemDateRange(anchored, s)).toEqual({ start: day(2024, 1, 1), end: day(2024, 6, 1) });

    // moving the source's data moves what the reference resolves to
    s.items[0] = timedValues([[day(2025, 1, 1), 1], [day(2025, 6, 1), 1]]);
    expect(resolveItemDateRange(anchored, s)).toEqual({ start: day(2025, 1, 1), end: day(2025, 6, 1) });
  });

  it("cannot resolve a reference when the source has nothing to anchor to", () => {
    const anchored = fixedValue(1, countSchedule({ kind: "source-start" }, 3));

    expect(resolveItemDateRange(anchored, source([anchored]))).toEqual({ start: null, end: null });
  });

  it("derives the end of a count schedule from its last occurrence", () => {
    const item = fixedValue(1, countSchedule(day(2024, 1, 31), 3, { unit: "days" }));

    expect(resolveItemDateRange(item, source([item]))).toEqual({ start: day(2024, 1, 31), end: day(2024, 2, 2) });
  });
});

describe("duplicateSource", () => {
  const translate = (key: string, values?: Record<string, string | number>) =>
    key === "projectEditor.copyName" ? `${values?.name} copy` : `${values?.name} copy ${values?.number}`;

  const original = source(
    [timedValues([[day(2024, 1, 1), 10]]), fixedValue(5, countSchedule({ kind: "source-start" }, 2))],
    "Bank A",
  );

  it("copies the items under new ids, without sharing any data with the original", () => {
    const copy = duplicateSource(original, ["Bank A"], translate);

    expect(copy.id).not.toBe(original.id);
    expect(copy.items.map((item) => item.id)).not.toEqual(expect.arrayContaining(original.items.map((item) => item.id)));
    expect(copy.items.map((item) => item.data)).toEqual(original.items.map((item) => item.data));

    if (copy.items[0].data.type !== "timed-values") throw new Error("fixture");
    copy.items[0].data.values[0] = 999;
    if (original.items[0].data.type !== "timed-values") throw new Error("fixture");
    expect(original.items[0].data.values[0]).toBe(10);
  });

  it("names the copy after the original, skipping names that are already taken", () => {
    expect(duplicateSource(original, ["Bank A"], translate).name).toBe("Bank A copy");
    expect(duplicateSource(original, ["Bank A", "Bank A copy"], translate).name).toBe("Bank A copy 2");
    expect(duplicateSource(original, ["Bank A", "Bank A copy", "Bank A copy 2"], translate).name).toBe("Bank A copy 3");
  });

  it("gives the copy a valid color that differs from the original's", () => {
    const copy = duplicateSource(original, [], translate);

    expect(copy.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(copy.color).not.toBe(original.color);
  });
});

describe("randomSourceColor", () => {
  it("always produces a 6-digit hex color", () => {
    for (let i = 0; i < 50; i += 1) expect(randomSourceColor()).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("project storage", () => {
  let storage: ReturnType<typeof installBrowserStorage>;

  beforeEach(() => {
    storage = installBrowserStorage();
  });

  it("starts empty", () => {
    expect(getProjectIndex()).toEqual([]);
    expect(getProject("missing")).toBeNull();
  });

  it("saves a new project and lists it in the index", () => {
    const project = createProject("Retirement Plan");

    expect(project.sources).toEqual([]);
    expect(getProject(project.id)).toEqual(project);
    expect(getProjectIndex().map((p) => p.id)).toEqual([project.id]);
  });

  it("updates a project in place instead of adding a second index entry", () => {
    const first = createProject("First");
    const second = createProject("Second");

    saveProject({ ...first, name: "First (edited)" });

    expect(getProjectIndex().map((p) => p.name)).toEqual(["First (edited)", "Second"]);
    expect(getProject(second.id)?.name).toBe("Second");
  });

  it("deletes a project and its index entry, leaving the others alone", () => {
    const keep = createProject("Keep");
    const remove = createProject("Remove");

    deleteProject(remove.id);

    expect(getProject(remove.id)).toBeNull();
    expect(getProjectIndex().map((p) => p.id)).toEqual([keep.id]);
  });

  it("renames a project and bumps its modified time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
    const project = createProject("Old");

    vi.setSystemTime(new Date("2024-06-01T00:00:00Z"));
    const renamed = renameProject(project.id, "New");
    vi.useRealTimers();

    expect(renamed?.name).toBe("New");
    expect(renamed?.modified).toBe("2024-06-01T00:00:00.000Z");
    expect(getProject(project.id)?.name).toBe("New");
    expect(getProjectIndex()[0].name).toBe("New");
  });

  it("returns null when renaming a project that doesn't exist", () => {
    expect(renameProject("missing", "Name")).toBeNull();
  });

  it("survives corrupted storage instead of throwing", () => {
    storage.data.set("projects:index", "{not json");
    storage.data.set("broken", "{not json");

    expect(getProjectIndex()).toEqual([]);
    expect(getProject("broken")).toBeNull();
  });

  it("notifies subscribers on every write, and stops after unsubscribing", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToStorage(listener);

    const project = createProject("A");
    expect(listener).toHaveBeenCalledTimes(1);

    renameProject(project.id, "B");
    deleteProject(project.id);
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
    createProject("C");
    expect(listener).toHaveBeenCalledTimes(3);
    expect(storage.listenerCount("storage")).toBe(0);
  });

  it("also notifies when another tab writes to storage", () => {
    const listener = vi.fn();
    subscribeToStorage(listener);

    storage.fireStorageEvent();

    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("project export and import", () => {
  const project = {
    id: "p1",
    name: "Plan",
    modified: "2024-01-01T00:00:00.000Z",
    sources: [source([timedValues([[day(2024, 1, 1), 10]])], "Bank A")],
  };

  it("round-trips a project through its JSON export", () => {
    const json = JSON.stringify(createProjectExport(project));
    const restored = parseProjectExport(json);

    expect(restored?.id).toBe("p1");
    expect(restored?.name).toBe("Plan");
    expect(restored?.sources).toHaveLength(1);
    expect(restored?.sources[0].name).toBe("Bank A");
  });

  it("stamps the export with a format version", () => {
    expect(createProjectExport(project).version).toBe(1);
  });

  it("rejects input that isn't a project export", () => {
    expect(parseProjectExport("not json at all")).toBeNull();
    expect(parseProjectExport("{}")).toBeNull();
    expect(parseProjectExport(JSON.stringify({ project: { name: "no id", sources: [] } }))).toBeNull();
    expect(parseProjectExport(JSON.stringify({ project: { id: "x", name: "n" } }))).toBeNull();
    expect(parseProjectExport(JSON.stringify({ project: { id: 1, name: "n", sources: [] } }))).toBeNull();
  });
});
