import type { ProjectSource } from "./projects";
import { getSourceDateRange } from "./projects";
import { sumSourceValue, sumCorrectedSourceValue } from "./valuation";

export type SourceResult = {
  id: string;
  name: string;
  color: string;
  raw: number;
  comparedRaw: number;
  vam: number;
  comparedVam: number;
  correction: number;
  itemCount: number;
  dateStart: Date | null;
  dateEnd: Date | null;
};

// "Compared to lowest" is relative to whatever set of sources is passed in
// -- computing this over a filtered subset (e.g. a report excluding some
// sources) is deliberate: comparing against a source that isn't shown
// anywhere else in the same output would be confusing.
export function computeResults(sources: ProjectSource[]): SourceResult[] {
  const base = sources.map((source) => ({
    source,
    raw: sumSourceValue(source),
    vam: sumCorrectedSourceValue(source),
    ...getSourceDateRange(source),
  }));
  const lowestRaw = base.length > 0 ? Math.min(...base.map((b) => b.raw)) : 0;
  const lowestVam = base.length > 0 ? Math.min(...base.map((b) => b.vam)) : 0;

  return base.map(({ source, raw, vam, start, end }) => ({
    id: source.id,
    name: source.name,
    color: source.color,
    raw,
    comparedRaw: raw - lowestRaw,
    vam,
    comparedVam: vam - lowestVam,
    correction: vam - raw,
    itemCount: source.items.length,
    dateStart: start,
    dateEnd: end,
  }));
}

export function formatResultNumber(value: number): string {
  return value.toFixed(2);
}

export function formatResultSigned(value: number): string {
  if (value === 0) return "0";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

export function formatResultDate(date: Date): string {
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export type ColumnKey = "raw" | "comparedRaw" | "vam" | "comparedVam" | "correction" | "itemCount" | "dateRange";

export type ResultColumn = {
  key: ColumnKey;
  label: string;
  title?: string;
  defaultVisible: boolean;
  // Whether the on-screen table renders this column's value in muted
  // (secondary) text -- purely presentational, but kept alongside the
  // rest of the column metadata so both the table and the report can
  // agree on it without a second lookup.
  muted?: boolean;
  // Whether this column represents a money amount -- the PDF report uses
  // this to decide which columns get the chosen currency symbol; Items and
  // Date Range never do.
  isMonetary?: boolean;
  formatValue: (r: SourceResult) => string;
};

// The canonical set of per-source metrics: what the interactive results
// table lets you toggle, and what the PDF report's column picker offers.
// Keeping this in one place means the two can never drift apart.
export const RESULT_COLUMNS: ResultColumn[] = [
  { key: "raw", label: "Raw", title: "Sum of raw values, ignoring any simple/compound-index correction", defaultVisible: true, muted: true, isMonetary: true, formatValue: (r) => formatResultNumber(r.raw) },
  { key: "comparedRaw", label: "Raw Comparado", title: "Raw total compared to the lowest Raw among sources", defaultVisible: false, muted: true, isMonetary: true, formatValue: (r) => formatResultSigned(r.comparedRaw) },
  { key: "vam", label: "VAM", defaultVisible: true, isMonetary: true, formatValue: (r) => formatResultNumber(r.vam) },
  { key: "comparedVam", label: "VAM Comparado", defaultVisible: true, isMonetary: true, formatValue: (r) => formatResultSigned(r.comparedVam) },
  { key: "correction", label: "Correction", title: "VAM minus Raw — the net effect of index correction", defaultVisible: false, isMonetary: true, formatValue: (r) => formatResultSigned(r.correction) },
  { key: "itemCount", label: "Items", defaultVisible: false, formatValue: (r) => String(r.itemCount) },
  { key: "dateRange", label: "Date Range", defaultVisible: false, formatValue: (r) => r.dateStart && r.dateEnd ? `${formatResultDate(r.dateStart)} → ${formatResultDate(r.dateEnd)}` : "—" },
];
