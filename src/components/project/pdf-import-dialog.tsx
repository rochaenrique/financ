"use client"

import { useMemo, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { ChevronDown, ChevronRight, FileText, Link2, Upload } from "lucide-react"

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { parsePdf, type PdfColumn, type PdfDocument, type PdfTable } from "@/lib/pdf-import"
import { getItemsFromDataset, getItemsFromDatasets } from "@/lib/pdf-datasets"

export type PdfSelectedDataset = {
  page: number;
  tableIndex: number;
  title?: string;
  columns: PdfColumn[];
  rows: Record<string, string>[];
};

type PdfImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpload: (datasets: PdfSelectedDataset[]) => void;
};

export function PdfImportDialog({ open, onOpenChange, onUpload }: PdfImportDialogProps) {
  const t = useTranslations();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<PdfDocument | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedColumns, setSelectedColumns] = useState<Record<string, Set<string>>>({});
  const [joinedWithPrevious, setJoinedWithPrevious] = useState<Set<string>>(new Set());

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setLoading(true);
    setError(null);
    setUploadError(null);
    setResult(null);
    setSelectedColumns({});
    setJoinedWithPrevious(new Set());
    try {
      const buffer = await file.arrayBuffer();
      const parsed = await parsePdf(buffer);
      setResult(parsed);
    } catch (error) {
      console.error("Failed to parse PDF:", error);
      setError(error instanceof Error ? error.message : t("pdfImportDialog.parseFailed"));
    } finally {
      setLoading(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setResult(null);
      setFileName(null);
      setError(null);
      setUploadError(null);
      setLoading(false);
      setSelectedColumns({});
      setJoinedWithPrevious(new Set());
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function toggleColumn(tableKey: string, columnName: string) {
    setUploadError(null);
    setSelectedColumns((current) => {
      const next = { ...current };
      const columns = new Set(next[tableKey] ?? []);
      if (columns.has(columnName)) columns.delete(columnName);
      else columns.add(columnName);
      if (columns.size === 0) delete next[tableKey];
      else next[tableKey] = columns;
      return next;
    });
  }

  // A joined continuation's selection lives under its root table's key
  // instead (see PdfDocumentView), so any pre-existing selection made
  // under its own key while it was still standalone would otherwise
  // become orphaned -- invisible, yet still counted -- once joined.
  function toggleJoin(tableKey: string) {
    setUploadError(null);
    setJoinedWithPrevious((current) => {
      const next = new Set(current);
      if (next.has(tableKey)) next.delete(tableKey);
      else next.add(tableKey);
      return next;
    });
    setSelectedColumns((current) => {
      if (!current[tableKey]) return current;
      const next = { ...current };
      delete next[tableKey];
      return next;
    });
  }

  function handleUpload() {
    if (!result) return;

    const flat = flattenTables(result);
    const datasets: PdfSelectedDataset[] = [];

    flat.forEach((entry, index) => {
      // folded into an earlier table's dataset below instead
      if (joinedWithPrevious.has(entry.key)) return;

      const selectedNames = selectedColumns[entry.key];
      if (!selectedNames || selectedNames.size === 0) return;
      const columns = entry.table.columns.filter((column) => selectedNames.has(column.name));
      const rows = entry.table.rows.map((row) => Object.fromEntries(columns.map((column) => [column.name, row.values[column.name] ?? ""])));

      // fold in every table that continues this one across later pages,
      // remapping each by position against this (root) table's columns so
      // a multi-page chain lands correctly regardless of depth
      for (let i = index + 1; i < flat.length && joinedWithPrevious.has(flat[i].key); ++i) {
        const recovered = recoveredRowsForJoin(entry.table.columns, flat[i].table);
        rows.push(...recovered.map((values) => Object.fromEntries(columns.map((column) => [column.name, values[column.name] ?? ""]))));
      }

      datasets.push({ page: entry.page, tableIndex: entry.tableIndex, title: entry.table.title, columns, rows });
    });

    // A selection can look reasonable but still fail to produce anything
    // usable (e.g. no date column among what was picked, or a value column
    // with a non-numeric cell) -- getItemsFromDataset already reports why via
    // console.error, but the dialog used to just close silently either way,
    // leaving the user with no sign that nothing was actually imported.
    if (getItemsFromDatasets(datasets).length === 0) {
      setUploadError(t("pdfImportDialog.uploadValidationFailed"));
      return;
    }

    onUpload(datasets);
    onOpenChange(false);
  }

  const selectedDatasetCount = useMemo(() => Object.keys(selectedColumns).length, [selectedColumns]);
  const selectedColumnCount = useMemo(() => Object.values(selectedColumns).reduce((count, columns) => count + columns.size, 0), [selectedColumns]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-full flex-col overflow-hidden sm:max-w-5xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>{t("pdfImportDialog.title")}</DialogTitle>
          <DialogDescription>{t("pdfImportDialog.description")}</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
          <div className="shrink-0 rounded-lg border border-dashed p-6">
            <div className="flex items-center gap-3">
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={loading}>
                <FileText className="mr-2 h-4 w-4" />
                {t("pdfImportDialog.chooseFile")}
              </Button>
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{fileName ?? t("pdfImportDialog.noFileSelected")}</span>
            </div>
            <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" onChange={handleFile} disabled={loading} className="sr-only" />
            <p className="mt-2 text-xs text-muted-foreground">{t("pdfImportDialog.pdfOnly")}</p>
          </div>
          {loading && <div className="shrink-0 rounded-md border bg-muted/50 p-4 text-sm">{t("pdfImportDialog.parsing")}</div>}
          {error && <div className="shrink-0 rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}
          {result && (
            <div className="min-h-0 min-w-0 flex-1">
              <PdfDocumentView
                result={result}
                selectedColumns={selectedColumns}
                onToggleColumn={toggleColumn}
                joinedWithPrevious={joinedWithPrevious}
                onToggleJoin={toggleJoin}
              />
            </div>
          )}
        </div>
        <DialogFooter className="shrink-0 flex-col items-stretch gap-2 border-t pt-4 sm:flex-col sm:items-stretch">
          {uploadError && <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">{uploadError}</div>}
          <div className="flex w-full items-center justify-between gap-4">
            <div className="text-xs text-muted-foreground">{t("pdfImportDialog.selectionSummary", { datasets: selectedDatasetCount, columns: selectedColumnCount })}</div>
            <Button onClick={handleUpload} disabled={!result || selectedColumnCount === 0 || loading}><Upload className="mr-2 h-4 w-4" />{t("pdfImportDialog.upload")}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type PdfDocumentViewProps = {
  result: PdfDocument;
  selectedColumns: Record<string, Set<string>>;
  onToggleColumn: (tableKey: string, columnName: string) => void;
  joinedWithPrevious: Set<string>;
  onToggleJoin: (tableKey: string) => void;
};

function isBlankColumn(rows: Record<string, string>[], columnName: string): boolean {
  return rows.every((row) => !row[columnName]?.trim());
}

// Reuses the real import logic against just the currently-selected columns,
// so this can never drift from what Upload will actually accept. Skipped
// below 2 selected columns since a usable selection always needs at least
// one date column plus one number column.
function isSelectionUsable(tableColumns: PdfColumn[], rows: Record<string, string>[], selected: Set<string>): boolean {
  if (selected.size < 2) return false;
  const columns = tableColumns.filter((column) => selected.has(column.name));
  const selectedRows = rows.map((row) => {
    const values: Record<string, string> = {};
    for (const name of selected) values[name] = row[name] ?? "";
    return values;
  });
  return getItemsFromDataset({ page: 0, tableIndex: 0, columns, rows: selectedRows }).length > 0;
}

type FlatTableEntry = {
  key: string;
  page: number;
  tableIndex: number;
  table: PdfTable;
};

// Tables in parse order across the whole document, regardless of page --
// join eligibility below is about adjacency in this order, not about any
// one page in isolation.
function flattenTables(result: PdfDocument): FlatTableEntry[] {
  const flat: FlatTableEntry[] = [];
  result.pages.forEach((page) => {
    page.tables.forEach((table, tableIndex) => {
      flat.push({ key: `${page.page}-${tableIndex}`, page: page.page, tableIndex, table });
    });
  });
  return flat;
}

// A table can only be offered as a join target when it's the first table on
// its page and the previous table (by parse order) sits on the immediately
// preceding page -- the best available signal that it's a genuine
// continuation rather than an unrelated table. Column counts are
// deliberately not compared here: a continuation table's "header" band is
// really its first data row, whose cell grid can legitimately subdivide
// into a different number of logical columns than a real header row's does
// (confirmed against a real BNDES amortization schedule, where the header
// page has 12 logical columns to the continuation page's 8) -- see
// remapRowByPosition for how that mismatch is actually reconciled.
function canJoinWithPrevious(flat: FlatTableEntry[], index: number): boolean {
  if (index <= 0) return false;
  const current = flat[index];
  const previous = flat[index - 1];
  return current.tableIndex === 0 && current.page === previous.page + 1;
}

// Matches columns by physical x-position rather than array index or name.
// A joined continuation table's own column names are meaningless (either
// mis-detected header text, or another continuation's own mis-detected
// text further down a multi-page chain), and -- since column counts can
// differ between the two tables (see canJoinWithPrevious) -- raw index
// alignment could silently shift values into the wrong target column
// instead of just leaving a gap.
function nearestColumnIndex(column: PdfColumn, candidates: PdfColumn[]): number {
  let bestIdx = -1;
  let bestDistance = Infinity;
  candidates.forEach((candidate, i) => {
    const distance = Math.abs(candidate.x - column.x);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIdx = i;
    }
  });
  return bestIdx;
}

function remapRowByPosition(values: Record<string, string>, fromColumns: PdfColumn[], toColumns: PdfColumn[]): Record<string, string> {
  const remapped: Record<string, string> = {};
  for (const toColumn of toColumns) {
    const matchIdx = nearestColumnIndex(toColumn, fromColumns);
    const fromColumn = matchIdx >= 0 ? fromColumns[matchIdx] : undefined;
    remapped[toColumn.name] = fromColumn ? (values[fromColumn.name] ?? "") : "";
  }
  return remapped;
}

// pdf-import.ts falls back to this exact "Column N" template whenever no
// header text ever landed on a given logical column -- used below to tell
// a genuinely-recovered header value apart from an empty cell that simply
// never got a name of its own.
const GENERATED_COLUMN_NAME = /^Column \d+$/;

// A continuation table with no real header row of its own has its first
// data row mis-read as column names (see parsePdfTableFromGrid's
// header-detection fallback in pdf-import.ts) -- recover it as an ordinary
// first row and remap every row onto targetColumns before joining. A column
// whose "name" is only ever the generated placeholder had an empty cell in
// that row, not literal text reading "Column N".
function recoveredRowsForJoin(targetColumns: PdfColumn[], continuation: PdfTable): Record<string, string>[] {
  const misdetectedHeaderRow = Object.fromEntries(continuation.columns.map((column) => [column.name, GENERATED_COLUMN_NAME.test(column.name) ? "" : column.name]));
  return [misdetectedHeaderRow, ...continuation.rows.map((row) => row.values)].map((values) => remapRowByPosition(values, continuation.columns, targetColumns));
}

// Walks back through a chain of joined continuations to the true origin
// table, whose columns are the only ones in the chain with real names.
function rootEntryFor(flat: FlatTableEntry[], index: number, joined: Set<string>): FlatTableEntry {
  let i = index;
  while (i > 0 && joined.has(flat[i].key)) {
    i -= 1;
  }
  return flat[i];
}

function PdfDocumentView({ result, selectedColumns, onToggleColumn, joinedWithPrevious, onToggleJoin }: PdfDocumentViewProps) {
  const t = useTranslations();
  const [expanded, setExpanded] = useState(true);
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({});
  const [showBlankColumns, setShowBlankColumns] = useState(false);
  const tableCount = result.pages.reduce((count, page) => count + page.tables.length, 0);
  const flat = flattenTables(result);

  function toggleTable(key: string) {
    setExpandedTables((current) => ({ ...current, [key]: !(current[key] ?? true) }));
  }

  return (
    <div className="flex max-h-[80vh] min-h-0 min-w-0 w-full flex-col overflow-hidden rounded-lg border">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b bg-background px-4 py-3">
        <button type="button" onClick={() => setExpanded((current) => !current)} className="flex min-w-0 flex-1 items-center gap-2 text-left hover:opacity-80">
          {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <div>
            <div className="text-sm font-semibold">{t("pdfImportDialog.parseResult")}</div>
            <div className="text-xs text-muted-foreground">{t("pdfImportDialog.pagesTablesSummary", { pages: result.pages.length, tables: tableCount })}</div>
          </div>
        </button>
        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={showBlankColumns} onChange={(e) => setShowBlankColumns(e.target.checked)} className="h-3.5 w-3.5 cursor-pointer accent-primary" />
          {t("pdfImportDialog.showBlankColumns")}
        </label>
      </div>
      {expanded && (
        <div className="min-h-0 min-w-0 flex-1 overflow-auto p-4">
          {result.pages.map((page) => (
            <div key={page.page} className="mb-8 min-w-0 last:mb-0">
              <h3 className="mb-3 text-sm font-semibold">{t("pdfImportDialog.page", { number: page.page })}</h3>
              {page.tables.length === 0 && <p className="text-sm text-muted-foreground">{t("pdfImportDialog.noTablesFound")}</p>}
              <div className="min-w-0 space-y-3">
                {page.tables.map((table, tableIndex) => {
                  const key = `${page.page}-${tableIndex}`;
                  const flatIndex = flat.findIndex((entry) => entry.key === key);
                  const isExpanded = expandedTables[key] ?? true;
                  const isJoined = joinedWithPrevious.has(key);
                  const joinable = !isJoined && canJoinWithPrevious(flat, flatIndex);
                  const previousEntry = flatIndex > 0 ? flat[flatIndex - 1] : null;

                  const rootEntry = isJoined ? rootEntryFor(flat, flatIndex, joinedWithPrevious) : null;
                  const effectiveColumns = rootEntry ? rootEntry.table.columns : table.columns;
                  const effectiveRows = rootEntry ? recoveredRowsForJoin(rootEntry.table.columns, table) : table.rows.map((row) => row.values);
                  const selectionKey = rootEntry ? rootEntry.key : key;

                  const selected = selectedColumns[selectionKey] ?? new Set<string>();
                  const summary = table.title || effectiveColumns.map((column) => column.name).join(", ");
                  const visibleColumns = showBlankColumns ? effectiveColumns : effectiveColumns.filter((column) => !isBlankColumn(effectiveRows, column.name));
                  const hiddenBlankCount = effectiveColumns.length - visibleColumns.length;
                  const isUsable = isSelectionUsable(effectiveColumns, effectiveRows, selected);

                  return (
                    <div key={key} className="min-w-0 overflow-hidden rounded-md border">
                      <button type="button" onClick={() => toggleTable(key)} className="flex w-full items-center gap-2 bg-background px-3 py-2 text-left text-sm hover:bg-muted/30">
                        {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                        <span className="min-w-0 flex-1 truncate font-medium">{summary}</span>
                        {hiddenBlankCount > 0 && <span className="shrink-0 text-xs text-muted-foreground">{t("pdfImportDialog.blankHidden", { count: hiddenBlankCount })}</span>}
                        {selected.size > 0 && (
                          <span className={`shrink-0 text-xs font-medium ${isUsable ? "text-emerald-600" : "text-amber-600"}`}>
                            {isUsable ? t("pdfImportDialog.ready") : t("pdfImportDialog.selectedNeedsMore", { count: selected.size })}
                          </span>
                        )}
                      </button>
                      {(joinable || isJoined) && previousEntry && (
                        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 border-t bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground">
                          <input type="checkbox" checked={isJoined} onChange={() => onToggleJoin(key)} className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-primary" />
                          <Link2 className="h-3.5 w-3.5 shrink-0" />
                          {t("pdfImportDialog.continuesFromPage", { page: previousEntry.page })}
                        </label>
                      )}
                      {isExpanded && (
                        <div className="scrollbar-visible min-w-0 overflow-x-auto border-t">
                          <table className="w-full min-w-max border-collapse text-sm">
                            <thead>
                              <tr className="border-b bg-muted/50">
                                {visibleColumns.map((column) => {
                                  const isSelected = selected.has(column.name);
                                  return (
                                    <th key={column.name} className={`max-w-xs whitespace-nowrap px-3 py-2 text-left font-medium ${isSelected ? "bg-primary/10" : ""}`}>
                                      <label className="flex cursor-pointer items-center gap-1.5">
                                        <input type="checkbox" checked={isSelected} onChange={() => onToggleColumn(selectionKey, column.name)} className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-primary" />
                                        <span>{column.name}</span>
                                      </label>
                                    </th>
                                  );
                                })}
                              </tr>
                            </thead>
                            <tbody>
                              {effectiveRows.map((row, rowIndex) => (
                                <tr key={rowIndex} className="border-b last:border-0">
                                  {visibleColumns.map((column) => (
                                    <td key={column.name} className={`max-w-xs break-words px-3 py-2 align-top ${selected.has(column.name) ? "bg-primary/5" : ""}`}>{row[column.name]}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default PdfImportDialog;
