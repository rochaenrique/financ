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

// Derived (type-only) from next-intl's own formatter rather than hand-rolled
// against Intl.NumberFormatOptions/Intl.DateTimeFormatOptions -- next-intl's
// option types are narrower than the general Intl ones (e.g. stricter
// per-field literal unions), so a hand-rolled structural type accepted
// option values the real formatter would reject. This import is type-only
// (erased at build time), so it doesn't add a runtime/bundle dependency on
// next-intl -- only Translate below stays fully hand-rolled, since plain
// string keys/values don't hit the same narrowing issue.
import type { useFormatter } from "next-intl";
type NumberFormatter = ReturnType<typeof useFormatter>["number"];
type DateFormatter = ReturnType<typeof useFormatter>["dateTime"];
export type ResultFormat = { number: NumberFormatter; dateTime: DateFormatter };

export function formatResultNumber(value: number, formatNumber: NumberFormatter): string {
  return formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatResultSigned(value: number, formatNumber: NumberFormatter): string {
  return formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" });
}

export function formatResultDate(date: Date, formatDate: DateFormatter): string {
  return formatDate(date, { day: "2-digit", month: "short", year: "numeric" });
}

export type ColumnKey = "raw" | "comparedRaw" | "vam" | "comparedVam" | "correction" | "itemCount" | "dateRange";

export type ResultColumn = {
  key: ColumnKey;
  // Suffix under the `resultsTable.columns.*` message namespace for this
  // column's tooltip text -- only set for columns that have one. The
  // column's own label always lives at `resultsTable.columns.<key>`, so no
  // separate labelKey field is needed.
  titleKey?: string;
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
  formatValue: (r: SourceResult, format: ResultFormat) => string;
};

// The canonical set of per-source metrics: what the interactive results
// table lets you toggle, and what the PDF report's column picker offers.
// Keeping this in one place means the two can never drift apart.
export const RESULT_COLUMNS: ResultColumn[] = [
  { key: "raw", titleKey: "rawTitle", defaultVisible: true, muted: true, isMonetary: true, formatValue: (r, f) => formatResultNumber(r.raw, f.number) },
  { key: "comparedRaw", titleKey: "comparedRawTitle", defaultVisible: false, muted: true, isMonetary: true, formatValue: (r, f) => formatResultSigned(r.comparedRaw, f.number) },
  { key: "vam", defaultVisible: true, isMonetary: true, formatValue: (r, f) => formatResultNumber(r.vam, f.number) },
  { key: "comparedVam", defaultVisible: true, isMonetary: true, formatValue: (r, f) => formatResultSigned(r.comparedVam, f.number) },
  { key: "correction", titleKey: "correctionTitle", defaultVisible: false, isMonetary: true, formatValue: (r, f) => formatResultSigned(r.correction, f.number) },
  { key: "itemCount", defaultVisible: false, formatValue: (r) => String(r.itemCount) },
  { key: "dateRange", defaultVisible: false, formatValue: (r, f) => r.dateStart && r.dateEnd ? `${formatResultDate(r.dateStart, f.dateTime)} → ${formatResultDate(r.dateEnd, f.dateTime)}` : "—" },
];

// t is a minimal structural subset of next-intl's translator (just the
// plain callable form) so this module doesn't need to depend on next-intl's
// types -- any translator-shaped function works, including the thin
// adapters passed into the PDF report generator.
type Translate = (key: string) => string;

export function resultColumnLabel(t: Translate, column: ResultColumn): string {
  return t(`resultsTable.columns.${column.key}`);
}

export function resultColumnTitle(t: Translate, column: ResultColumn): string | undefined {
  return column.titleKey ? t(`resultsTable.columns.${column.titleKey}`) : undefined;
}
