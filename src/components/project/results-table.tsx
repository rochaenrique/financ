"use client"

import { useState } from "react"
import { ArrowUp, ArrowDown } from "lucide-react"

import type { ProjectSource } from "@/lib/projects"
import { getSourceDateRange } from "@/lib/projects"
import { sumSourceValue, sumCorrectedSourceValue } from "@/lib/valuation"
import { cn } from "@/lib/utils"

type Props = { sources: ProjectSource[] };

type SourceResult = {
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

function computeResults(sources: ProjectSource[]): SourceResult[] {
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

function formatNumber(value: number): string {
  return value.toFixed(2);
}

function formatSigned(value: number): string {
  if (value === 0) return "0";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

// null sorts to the end regardless of direction; strings compare
// locale-aware, everything else falls back to numeric comparison.
type SortValue = number | string | null;

function compareSortValues(a: SortValue, b: SortValue): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "string" && typeof b === "string") return a.localeCompare(b);
  return (a as number) - (b as number);
}

type ColumnKey = "raw" | "comparedRaw" | "vam" | "comparedVam" | "correction" | "itemCount" | "dateRange";
type SortKey = "name" | ColumnKey;
type Sort = { key: SortKey; direction: "asc" | "desc" };

type Column = {
  key: ColumnKey;
  label: string;
  title?: string;
  defaultVisible: boolean;
  sortValue: (r: SourceResult) => SortValue;
  render: (r: SourceResult) => React.ReactNode;
};

const COLUMNS: Column[] = [
  { key: "raw", label: "Raw", title: "Sum of raw values, ignoring any simple/compound-index correction", defaultVisible: true, sortValue: (r) => r.raw, render: (r) => <span className="text-muted-foreground">{formatNumber(r.raw)}</span> },
  { key: "comparedRaw", label: "Raw Comparado", title: "Raw total compared to the lowest Raw among sources", defaultVisible: false, sortValue: (r) => r.comparedRaw, render: (r) => <span className="text-muted-foreground">{formatSigned(r.comparedRaw)}</span> },
  { key: "vam", label: "VAM", defaultVisible: true, sortValue: (r) => r.vam, render: (r) => formatNumber(r.vam) },
  { key: "comparedVam", label: "VAM Comparado", defaultVisible: true, sortValue: (r) => r.comparedVam, render: (r) => formatSigned(r.comparedVam) },
  { key: "correction", label: "Correction", title: "VAM minus Raw — the net effect of index correction", defaultVisible: false, sortValue: (r) => r.correction, render: (r) => formatSigned(r.correction) },
  { key: "itemCount", label: "Items", defaultVisible: false, sortValue: (r) => r.itemCount, render: (r) => String(r.itemCount) },
  { key: "dateRange", label: "Date Range", defaultVisible: false, sortValue: (r) => r.dateStart?.getTime() ?? null, render: (r) => r.dateStart && r.dateEnd ? `${formatDate(r.dateStart)} → ${formatDate(r.dateEnd)}` : "—" },
];

function SortableHeader({ label, sortKey, sort, onSort, title, align = "right" }: {
  label: string;
  sortKey: SortKey;
  sort: Sort | null;
  onSort: (key: SortKey) => void;
  title?: string;
  align?: "left" | "right";
}) {
  const active = sort?.key === sortKey;
  return (
          <th className={cn("px-2 py-1 font-semibold", align === "right" ? "text-right" : "text-left")} title={title}>
          <button type="button" onClick={() => onSort(sortKey)} className={cn("inline-flex items-center gap-1 hover:text-foreground", align === "right" && "flex-row-reverse", !active && "text-muted-foreground")}>
          {label}
          {active && (sort.direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
          </button>
          </th>
          );
}

export function ResultsTable({ sources }: Props) {
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(() => new Set(COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key)));
  const [sort, setSort] = useState<Sort | null>(null);

  const results = computeResults(sources);

  // A column can only be the active sort target while visible, so hiding
  // the currently-sorted column is the only case that needs to clear sort.
  function toggleColumn(key: ColumnKey) {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
    setSort((prev) => (prev && prev.key === key ? null : prev));
  }

  function handleSort(key: SortKey) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, direction: "asc" };
      if (prev.direction === "asc") return { key, direction: "desc" };
      return null;
    });
  }

  const shownColumns = COLUMNS.filter((c) => visibleColumns.has(c.key));

  const sortedResults = (() => {
    if (!sort) return results;
    const column = sort.key === "name" ? null : COLUMNS.find((c) => c.key === sort.key);
    const getValue = (r: SourceResult): SortValue => sort.key === "name" ? r.name : (column?.sortValue(r) ?? null);
    const sorted = [...results].sort((a, b) => compareSortValues(getValue(a), getValue(b)));
    return sort.direction === "desc" ? sorted.reverse() : sorted;
  })();

  return (
          <div className="flex h-full flex-col">
          <h2 className="mb-2 text-center text-2xl font-semibold">Resultados</h2>

          {results.length === 0 ? (
                                   <div className="min-h-0 flex-1 overflow-auto rounded-sm border bg-background">
                                   <p className="p-4 text-center text-sm text-muted-foreground">No sources to compare yet.</p>
                                   </div>
                                   ) : (
                                        <>
                                        <div className="mb-2 flex flex-wrap gap-1.5 px-1">
                                        {COLUMNS.map((column) => (
                                                                    <button
                                                                    key={column.key}
                                                                    type="button"
                                                                    onClick={() => toggleColumn(column.key)}
                                                                    title={column.title}
                                                                    className={cn(
                                                                                  "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                                                                                  visibleColumns.has(column.key)
                                                                                  ? "border-primary bg-primary/10 text-primary"
                                                                                  : "border-border bg-background text-muted-foreground hover:bg-muted"
                                                                                  )}
                                                                    >
                                                                    {column.label}
                                                                    </button>
                                                                    ))}
                                        </div>

                                        <div className="min-h-0 flex-1 overflow-auto rounded-sm border bg-background">
                                        <table className="w-full border-collapse text-sm">
                                        <thead>
                                        <tr className="border-b">
                                        <SortableHeader label="Fonte" sortKey="name" sort={sort} onSort={handleSort} align="left" />
                                        {shownColumns.map((column) => (
                                                                       <SortableHeader key={column.key} label={column.label} sortKey={column.key} sort={sort} onSort={handleSort} title={column.title} />
                                                                       ))}
                                        </tr>
                                        </thead>
                                        <tbody>
                                        {sortedResults.map((result) => (
                                                                       // NOTE: assumes source.color is a 6-digit hex string; the trailing "33" appends ~20% alpha for the row tint
                                                                       <tr key={result.id} style={{ backgroundColor: `${result.color}33` }}>
                                                                       <td className="px-4 py-2 font-semibold">{result.name}</td>
                                                                       {shownColumns.map((column) => (
                                                                                                      <td key={column.key} className="px-2 py-2 text-right">{column.render(result)}</td>
                                                                                                      ))}
                                                                       </tr>
                                                                       ))}
                                        </tbody>
                                        </table>
                                        </div>
                                        </>
                                        )}
          </div>
          );
}
