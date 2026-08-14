"use client"

import { useMemo, useState } from "react"
import { Check, ChevronDown, ChevronRight, Upload } from "lucide-react"

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { parsePdf, type PdfColumn, type PdfDocument } from "@/lib/pdf-import"

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
  const [result, setResult] = useState<PdfDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedColumns, setSelectedColumns] = useState<Record<string, Set<string>>>({});
  
  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setSelectedColumns({});
    try {
      const buffer = await file.arrayBuffer();
      const parsed = await parsePdf(buffer);
      setResult(parsed);
    } catch (error) {
      console.error("Failed to parse PDF:", error);
      setError(error instanceof Error ? error.message : "Failed to parse PDF.");
    } finally {
      setLoading(false);
    }
  }
  
  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setResult(null);
      setError(null);
      setLoading(false);
      setSelectedColumns({});
    }
  }
  
  function toggleColumn(tableKey: string, columnName: string) {
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
  
  function handleUpload() {
    if (!result) return;
    
    const datasets: PdfSelectedDataset[] = [];
    result.pages.forEach((page) => {
                           page.tables.forEach((table, tableIndex) => {
                                                 const tableKey = `${page.page}-${tableIndex}`;
                                                 const selectedNames = selectedColumns[tableKey];
                                                 if (!selectedNames || selectedNames.size === 0) return;
                                                 const columns = table.columns.filter((column) => selectedNames.has(column.name));
                                                 const rows = table.rows.map((row) => Object.fromEntries(columns.map((column) => [column.name, row.values[column.name] ?? ""])));
                                                 datasets.push({ page: page.page, tableIndex, title: table.title, columns, rows });
                                               });
                         });
    onUpload(datasets);
    onOpenChange(false);
  }
  
  const selectedDatasetCount = useMemo(() => Object.keys(selectedColumns).length, [selectedColumns]);
  const selectedColumnCount = useMemo(() => Object.values(selectedColumns).reduce((count, columns) => count + columns.size, 0), [selectedColumns]);
  
  return (
          <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogContent className="flex max-h-[85vh] w-full flex-col overflow-hidden sm:max-w-5xl">
          <DialogHeader className="shrink-0">
          <DialogTitle>Import PDF</DialogTitle>
          <DialogDescription>Select the columns you want to use from the imported tables.</DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
          <div className="shrink-0 rounded-lg border border-dashed p-6">
          <input type="file" accept="application/pdf,.pdf" onChange={handleFile} disabled={loading} className="block w-full text-sm" />
          <p className="mt-2 text-xs text-muted-foreground">PDF files only.</p>
          </div>
          {loading && <div className="shrink-0 rounded-md border bg-muted/50 p-4 text-sm">Parsing PDF...</div>}
          {error && <div className="shrink-0 rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}
          {result && <div className="min-h-0 min-w-0 flex-1"><PdfDocumentView result={result} selectedColumns={selectedColumns} onToggleColumn={toggleColumn} /></div>}
          </div>
          <DialogFooter className="shrink-0 border-t pt-4">
          <div className="flex w-full items-center justify-between gap-4">
          <div className="text-xs text-muted-foreground">{selectedDatasetCount} dataset{selectedDatasetCount === 1 ? "" : "s"} selected · {selectedColumnCount} column{selectedColumnCount === 1 ? "" : "s"} selected</div>
          <Button onClick={handleUpload} disabled={!result || selectedColumnCount === 0 || loading}><Upload className="mr-2 h-4 w-4" />Upload</Button>
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
};

function PdfDocumentView({ result, selectedColumns, onToggleColumn }: PdfDocumentViewProps) {
  const [expanded, setExpanded] = useState(true);
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({});
  const tableCount = result.pages.reduce((count, page) => count + page.tables.length, 0);
  
  function toggleTable(key: string) {
    setExpandedTables((current) => ({ ...current, [key]: !(current[key] ?? true) }));
  }
  
  return (
          <div className="flex max-h-[80vh] min-h-0 min-w-0 w-full flex-col overflow-hidden rounded-lg border">
          <button type="button" onClick={() => setExpanded((current) => !current)} className="shrink-0 border-b bg-background px-4 py-3 text-left hover:bg-muted/30">
          <div className="flex items-center gap-2">
          {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <div>
          <div className="text-sm font-semibold">Parse result</div>
          <div className="text-xs text-muted-foreground">{result.pages.length} pages · {tableCount} tables</div>
          </div>
          </div>
          </button>
          {expanded && (
                        <div className="min-h-0 min-w-0 flex-1 overflow-auto p-4">
                        {result.pages.map((page) => (
                                                     <div key={page.page} className="mb-8 min-w-0 last:mb-0">
                                                     <h3 className="mb-3 text-sm font-semibold">Page {page.page}</h3>
                                                     {page.tables.length === 0 && <p className="text-sm text-muted-foreground">No tables found.</p>}
                                                     <div className="min-w-0 space-y-3">
                                                     {page.tables.map((table, tableIndex) => {
                                                                        const key = `${page.page}-${tableIndex}`;
                                                                        const isExpanded = expandedTables[key] ?? true;
                                                                        const selected = selectedColumns[key] ?? new Set<string>();
                                                                        const summary = table.title || table.columns.map((column) => column.name).join(", ");
                                                                        return (
                                                                                <div key={key} className="min-w-0 overflow-hidden rounded-md border">
                                                                                <button type="button" onClick={() => toggleTable(key)} className="flex w-full items-center gap-2 bg-background px-3 py-2 text-left text-sm hover:bg-muted/30">
                                                                                {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                                                                                <span className="min-w-0 flex-1 truncate font-medium">{summary}</span>
                                                                                {selected.size > 0 && <span className="shrink-0 text-xs text-muted-foreground">{selected.size} column{selected.size === 1 ? "" : "s"} selected</span>}
                                                                                </button>
                                                                                {isExpanded && (
                                                                                                <div className="min-w-0 overflow-x-auto border-t">
                                                                                                <table className="w-full min-w-max border-collapse text-sm">
                                                                                                <thead>
                                                                                                <tr className="border-b bg-muted/50">
                                                                                                {table.columns.map((column) => {
                                                                                                                     const isSelected = selected.has(column.name);
                                                                                                                     return (
                                                                                                                             <th key={column.name} className={`max-w-xs whitespace-nowrap px-3 py-2 text-left font-medium ${isSelected ? "bg-primary/10" : ""}`}>
                                                                                                                             <div className="flex items-center gap-2">
                                                                                                                             <Button type="button" variant={isSelected ? "default" : "outline"} size="sm" onClick={() => onToggleColumn(key, column.name)} className="h-7 shrink-0 px-2 text-xs">
                                                                                                                             {isSelected && <Check className="mr-1 h-3 w-3" />}
                                                                                                                             {isSelected ? "Selected" : "Select"}
                                                                                                                             </Button>
                                                                                                                             <span>{column.name}</span>
                                                                                                                             </div>
                                                                                                                             </th>
                                                                                                                             );
                                                                                                                   })}
                                                                                                </tr>
                                                                                                </thead>
                                                                                                <tbody>
                                                                                                {table.rows.map((row, rowIndex) => (
                                                                                                                                    <tr key={rowIndex} className="border-b last:border-0">
                                                                                                                                    {table.columns.map((column) => (
                                                                                                                                                                    <td key={column.name} className={`max-w-xs break-words px-3 py-2 align-top ${selected.has(column.name) ? "bg-primary/5" : ""}`}>{row.values[column.name]}</td>
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