"use client"

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, FileText, Plus, Table2, Trash2 } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { DateRef, FrequencyUnit, IndexDirection, ProjectItem, ProjectItemData, ProjectItemFrequency, ProjectItemSchedule, ProjectSource } from "@/lib/projects";
import { getSourceDateRange, isSourceDateRef } from "@/lib/projects";
import { getItemsFromDatasets } from "@/lib/pdf-datasets";
import { cn, toDate } from "@/lib/utils";
import type { PdfSelectedDataset } from "@/components/project/pdf-import-dialog";
import { ItemIcon } from "@/components/project/item-icon";

const PdfImportDialog = dynamic(() => import("@/components/project/pdf-import-dialog").then((module) => module.PdfImportDialog), { ssr: false });

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddItems: (items: ProjectItem[]) => void;
  onEditItem?: (item: ProjectItem) => void;
  allowEmpty?: boolean;
  source?: ProjectSource | null;
  // When set, the dialog opens straight into the manual form for this
  // item's (already-fixed) type and submits an edit instead of an add.
  editingItem?: ProjectItem | null;
};

type ManualItemType = Exclude<ProjectItemData["type"], "timed-values" | "index-series">;
type ScheduleKind = ProjectItemSchedule["kind"];
type PdfResultType = "timed-values" | "index-series";
type Step = { kind: "picker" } | { kind: "manual"; itemType: ManualItemType } | { kind: "index-series-direction" } | { kind: "pdf"; resultType: PdfResultType } | { kind: "timed-values-method" } | { kind: "table"; resultType: PdfResultType };

const TYPE_OPTIONS: { type: ProjectItemData["type"]; label: string; description: string }[] = [
                                                                                               { type: "timed-values", label: "Time Series", description: "Import from a PDF or enter values by hand, like a payment schedule." },
                                                                                               { type: "index-series", label: "Index Series", description: "Import a researched index (e.g. inflation) from a PDF, to correct other items in this source." },
                                                                                               { type: "compound-index", label: "Compound Index", description: "A single rate that compounds over a repeating schedule." },
                                                                                               { type: "simple-index", label: "Simple Index", description: "A single non-compounding rate or percentage applied on a schedule." },
                                                                                               { type: "fixed-value", label: "Fixed Value", description: "A constant value applied on a schedule." },
                                                                                               ];

const MANUAL_TYPE_LABELS: Record<ManualItemType, string> = { "compound-index": "Compound Index", "simple-index": "Simple Index", "fixed-value": "Fixed Value" };
const FREQUENCY_LABELS: Record<FrequencyUnit, string> = { days: "days", weeks: "weeks", months: "months", years: "years" };
const FREQUENCY_SINGULAR: Record<FrequencyUnit, string> = { days: "day", weeks: "week", months: "month", years: "year" };

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatPreviewDate(date: Date): string {
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

type DateMode = "custom" | "source";

function dateInputValue(date: Date): string {
  return toDate(date).toISOString().slice(0, 10);
}

function dateRefInputValue(ref: DateRef): string {
  return isSourceDateRef(ref) ? todayInputValue() : dateInputValue(ref);
}

function dateRefMode(ref: DateRef): DateMode {
  return isSourceDateRef(ref) ? "source" : "custom";
}

// One row of the manual table editor. Values are kept as the raw input
// strings (like every other field in this form) and only parsed at submit
// time -- a row with either side left blank is simply not usable yet
// rather than being an error to report.
type TableRow = { id: string; date: string; value: string };

function emptyTableRow(seedDate?: string): TableRow {
  return { id: crypto.randomUUID(), date: seedDate ?? todayInputValue(), value: "" };
}

// Adds one calendar month to a yyyy-mm-dd date-input string, clamping the
// day to the target month's last valid day instead of overflowing into the
// month after (e.g. Jan 31 -> Feb 28, not Mar 3). Built entirely from UTC
// components: a date-only string parses as UTC midnight, and mixing that
// with local-time getters/setters would silently shift the date for any
// timezone that isn't UTC itself.
function addOneMonthClamped(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return todayInputValue();
  const daysInNextMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const next = new Date(Date.UTC(year, month, Math.min(day, daysInNextMonth)));
  return next.toISOString().slice(0, 10);
}

function parseTableRow(row: TableRow): { time: Date; value: number } | null {
  if (row.date.trim() === "" || row.value.trim() === "") return null;
  const time = new Date(row.date);
  const value = Number(row.value);
  if (Number.isNaN(time.getTime()) || !Number.isFinite(value)) return null;
  return { time, value };
}

type FormState = {
  step: Step;
  value: string;
  frequencyEvery: string;
  frequencyUnit: FrequencyUnit;
  scheduleKind: ScheduleKind;
  direction: IndexDirection;
  referenceDate: string;
  referenceDateMode: DateMode;
  occurrences: string;
  rangeStart: string;
  rangeStartMode: DateMode;
  rangeEnd: string;
  rangeEndMode: DateMode;
  tableRows: TableRow[];
  autoIncrementMonth: boolean;
};

const BLANK_FORM_STATE: FormState = {
  step: { kind: "picker" },
  value: "",
  frequencyEvery: "1",
  frequencyUnit: "months",
  scheduleKind: "count",
  direction: "future",
  referenceDate: todayInputValue(),
  referenceDateMode: "custom",
  occurrences: "1",
  rangeStart: todayInputValue(),
  rangeStartMode: "custom",
  rangeEnd: todayInputValue(),
  rangeEndMode: "custom",
  tableRows: [],
  autoIncrementMonth: false,
};

// The dialog opens with either a blank "add" form or, when editing, the
// existing item's values pre-filled into the same manual form. timed-values
// and index-series share the same (times, values) shape, so both editing
// paths build the same row list for the table editor.
function initialFormState(editingItem: ProjectItem | null | undefined): FormState {
  if (!editingItem) return BLANK_FORM_STATE;

  if (editingItem.data.type === "timed-values" || editingItem.data.type === "index-series") {
    const { data } = editingItem;
    const tableRows: TableRow[] = data.times.map((time, i) => ({ id: crypto.randomUUID(), date: dateInputValue(time), value: String(data.values[i] ?? "") }));
    return { ...BLANK_FORM_STATE, step: { kind: "table", resultType: data.type }, tableRows, direction: data.type === "index-series" ? (data.direction ?? "future") : BLANK_FORM_STATE.direction };
  }

  const { data } = editingItem;
  const { schedule } = data;
  const direction = data.type !== "fixed-value" ? (data.direction ?? "future") : "future";
  const base: FormState = { ...BLANK_FORM_STATE, step: { kind: "manual", itemType: data.type }, value: String(data.value), frequencyEvery: String(data.frequency.every), frequencyUnit: data.frequency.unit, scheduleKind: schedule.kind, direction };

  if (schedule.kind === "count") {
    return { ...base, referenceDate: dateRefInputValue(schedule.referenceDate), referenceDateMode: dateRefMode(schedule.referenceDate), occurrences: String(schedule.occurrences) };
  }
  if (schedule.kind === "range") {
    return { ...base, rangeStart: dateRefInputValue(schedule.rangeStart), rangeStartMode: dateRefMode(schedule.rangeStart), rangeEnd: dateRefInputValue(schedule.rangeEnd), rangeEndMode: dateRefMode(schedule.rangeEnd) };
  }
  return { ...base, referenceDate: dateInputValue(schedule.referenceDate) };
}

// A date input that can either take a literal date or defer to the live
// start/end of the source's other items.
function DateRefField({ label, mode, onModeChange, value, onValueChange, sourceDate, sourceLabel }: {
  label: string;
  mode: DateMode;
  onModeChange: (mode: DateMode) => void;
  value: string;
  onValueChange: (value: string) => void;
  sourceDate: Date | null;
  sourceLabel: string;
}) {
  return (
          <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">{label}</label>
          {mode === "custom" ? (
                               <input type="date" value={value} onChange={(e) => onValueChange(e.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
                               ) : (
                                    <div className="flex h-[38px] w-full items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground">{sourceDate ? formatPreviewDate(sourceDate) : "—"}</div>
                                    )}
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={mode === "source"} disabled={!sourceDate && mode !== "source"} onChange={(e) => onModeChange(e.target.checked ? "source" : "custom")} />
          {sourceLabel}{!sourceDate && (mode === "source" ? " (no longer resolves — pick a date or uncheck)" : " (no dated items in this source yet)")}
          </label>
          </div>
          );
}

export function AddItemDialog({ open, onOpenChange, onAddItems, onEditItem, allowEmpty = false, source = null, editingItem = null }: Props) {
  const initial = initialFormState(editingItem);
  const [step, setStep] = useState<Step>(initial.step);
  const [value, setValue] = useState(initial.value);
  const [frequencyEvery, setFrequencyEvery] = useState(initial.frequencyEvery);
  const [frequencyUnit, setFrequencyUnit] = useState<FrequencyUnit>(initial.frequencyUnit);
  const [scheduleKind, setScheduleKind] = useState<ScheduleKind>(initial.scheduleKind);
  const [direction, setDirection] = useState<IndexDirection>(initial.direction);
  const [referenceDate, setReferenceDate] = useState(initial.referenceDate);
  const [referenceDateMode, setReferenceDateMode] = useState<DateMode>(initial.referenceDateMode);
  const [occurrences, setOccurrences] = useState(initial.occurrences);
  const [rangeStart, setRangeStart] = useState(initial.rangeStart);
  const [rangeStartMode, setRangeStartMode] = useState<DateMode>(initial.rangeStartMode);
  const [rangeEnd, setRangeEnd] = useState(initial.rangeEnd);
  const [rangeEndMode, setRangeEndMode] = useState<DateMode>(initial.rangeEndMode);
  const [tableRows, setTableRows] = useState<TableRow[]>(initial.tableRows);
  const [autoIncrementMonth, setAutoIncrementMonth] = useState(initial.autoIncrementMonth);
  const valueInputRefs = useRef(new Map<string, HTMLInputElement>());
  const pendingFocusRowId = useRef<string | null>(null);

  const sourceRange = source ? getSourceDateRange(source, editingItem?.id) : { start: null, end: null };

  // Enter in a row's value field adds the next row the same way the "Add
  // row" button does (see addTableRow), then moves focus straight into
  // that new row's value field so typing a whole schedule by hand never
  // needs the mouse: value, Enter, value, Enter, ... Focusing has to wait
  // until the new row's input actually exists in the DOM, hence the effect
  // rather than doing it inline where the row is created.
  useEffect(() => {
    const id = pendingFocusRowId.current;
    if (!id) return;
    pendingFocusRowId.current = null;
    valueInputRefs.current.get(id)?.focus();
  }, [tableRows]);

  function reset() {
    setStep(BLANK_FORM_STATE.step);
    setValue(BLANK_FORM_STATE.value);
    setFrequencyEvery(BLANK_FORM_STATE.frequencyEvery);
    setFrequencyUnit(BLANK_FORM_STATE.frequencyUnit);
    setScheduleKind(BLANK_FORM_STATE.scheduleKind);
    setDirection(BLANK_FORM_STATE.direction);
    setReferenceDate(todayInputValue());
    setReferenceDateMode(BLANK_FORM_STATE.referenceDateMode);
    setOccurrences(BLANK_FORM_STATE.occurrences);
    setRangeStart(todayInputValue());
    setRangeStartMode(BLANK_FORM_STATE.rangeStartMode);
    setRangeEnd(todayInputValue());
    setRangeEndMode(BLANK_FORM_STATE.rangeEndMode);
    setTableRows(BLANK_FORM_STATE.tableRows);
    setAutoIncrementMonth(BLANK_FORM_STATE.autoIncrementMonth);
  }

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen);
    if (!nextOpen) reset();
  }

  function handlePickType(type: ProjectItemData["type"]) {
    if (type === "timed-values") { setStep({ kind: "timed-values-method" }); return; }
    if (type === "index-series") { setStep({ kind: "index-series-direction" }); return; }
    setStep({ kind: "manual", itemType: type });
  }

  function handleStartManualTable() {
    setTableRows([emptyTableRow()]);
    setAutoIncrementMonth(true);
    setStep({ kind: "table", resultType: "timed-values" });
  }

  // Index-series has nothing to configure before importing but which end it
  // settles toward; editing goes straight to the table step instead (see
  // initialFormState), so this step is only ever reached while adding.
  function handleIndexSeriesDirectionContinue() {
    setStep({ kind: "pdf", resultType: "index-series" });
  }

  function addTableRow() {
    setTableRows((rows) => {
      const last = rows[rows.length - 1];
      const seedDate = autoIncrementMonth && last ? addOneMonthClamped(last.date) : todayInputValue();
      const newRow = emptyTableRow(seedDate);
      pendingFocusRowId.current = newRow.id;
      return [...rows, newRow];
    });
  }

  function removeTableRow(id: string) {
    setTableRows((rows) => rows.filter((row) => row.id !== id));
  }

  function updateTableRow(id: string, patch: Partial<Pick<TableRow, "date" | "value">>) {
    setTableRows((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function buildFrequency(): ProjectItemFrequency {
    return { every: Number(frequencyEvery), unit: frequencyUnit };
  }

  function buildSchedule(): ProjectItemSchedule {
    const frequency = buildFrequency();
    if (scheduleKind === "count") return { kind: "count", frequency, referenceDate: referenceDateMode === "source" ? { kind: "source-start" } : new Date(referenceDate), occurrences: Number(occurrences) };
    if (scheduleKind === "range") return { kind: "range", frequency, rangeStart: rangeStartMode === "source" ? { kind: "source-start" } : new Date(rangeStart), rangeEnd: rangeEndMode === "source" ? { kind: "source-end" } : new Date(rangeEnd) };
    return { kind: "entire", frequency, referenceDate: new Date(referenceDate) };
  }

  const resolvedReferenceDate = referenceDateMode === "source" ? sourceRange.start : (referenceDate ? new Date(referenceDate) : null);
  const resolvedRangeStart = rangeStartMode === "source" ? sourceRange.start : (rangeStart ? new Date(rangeStart) : null);
  const resolvedRangeEnd = rangeEndMode === "source" ? sourceRange.end : (rangeEnd ? new Date(rangeEnd) : null);
  const parsedTableRows = tableRows.map(parseTableRow).filter((row): row is { time: Date; value: number } => row !== null);

  function handleManualSubmit() {
    if (step.kind !== "manual") return;

    const parsedValue = Number(value);
    const every = Number(frequencyEvery);
    const count = Number(occurrences);
    if (!Number.isFinite(parsedValue) || value.trim() === "" || !Number.isInteger(every) || every < 1) return;
    if (scheduleKind === "count" && (!Number.isInteger(count) || count < 1 || !resolvedReferenceDate)) return;
    if (scheduleKind === "range" && (!resolvedRangeStart || !resolvedRangeEnd || resolvedRangeStart > resolvedRangeEnd)) return;
    if (scheduleKind === "entire" && !referenceDate) return;

    const schedule = buildSchedule();
    const data: ProjectItemData = step.itemType === "fixed-value"
      ? { type: "fixed-value", value: parsedValue, frequency: schedule.frequency, schedule }
      : { type: step.itemType, value: parsedValue, frequency: schedule.frequency, schedule, direction };
    const item: ProjectItem = { id: editingItem?.id ?? crypto.randomUUID(), data };

    if (editingItem) {
      onEditItem?.(item);
    } else {
      onAddItems([item]);
    }
    handleOpenChange(false);
  }

  function handleTableSubmit() {
    if (step.kind !== "table" || parsedTableRows.length === 0) return;

    const sorted = [...parsedTableRows].sort((a, b) => a.time.getTime() - b.time.getTime());
    const times = sorted.map((row) => row.time);
    const values = sorted.map((row) => row.value);
    const data: ProjectItemData = step.resultType === "index-series" ? { type: "index-series", times, values, direction } : { type: "timed-values", times, values };
    const item: ProjectItem = { id: editingItem?.id ?? crypto.randomUUID(), data };

    if (editingItem) {
      onEditItem?.(item);
    } else {
      onAddItems([item]);
    }
    handleOpenChange(false);
  }

  function handlePdfUpload(datasets: PdfSelectedDataset[]) {
    const items = getItemsFromDatasets(datasets);
    const resultType = step.kind === "pdf" ? step.resultType : "timed-values";
    const tagged = resultType === "index-series"
      ? items.map((item): ProjectItem => item.data.type === "timed-values" ? { ...item, data: { type: "index-series", times: item.data.times, values: item.data.values, direction } } : item)
      : items;
    if (tagged.length > 0) onAddItems(tagged);
  }

  const isManualValid = step.kind === "manual" && value.trim() !== "" && Number.isFinite(Number(value)) && Number.isInteger(Number(frequencyEvery)) && Number(frequencyEvery) > 0 && ((scheduleKind === "count" && resolvedReferenceDate !== null && Number.isInteger(Number(occurrences)) && Number(occurrences) > 0) || (scheduleKind === "range" && resolvedRangeStart !== null && resolvedRangeEnd !== null && resolvedRangeStart <= resolvedRangeEnd) || (scheduleKind === "entire" && referenceDate !== ""));
  const frequencyDescription = frequencyUnit === "days" ? "Anchored by the reference date." : frequencyUnit === "weeks" ? "Anchored by the weekday of the reference date." : frequencyUnit === "months" ? "Anchored by the day of the month of the reference date." : "Anchored by the month and day of the reference date.";

  return (
          <>
          <Dialog open={open && step.kind !== "pdf"} onOpenChange={handleOpenChange}>
          <DialogContent className={cn("sm:max-w-lg", step.kind === "table" && "flex max-h-[85vh] w-full flex-col overflow-hidden")}>
          {step.kind === "picker" && (
                                      <>
                                      <DialogHeader><DialogTitle>Add item</DialogTitle><DialogDescription>Choose what kind of data you want to add to this source.</DialogDescription></DialogHeader>
                                      <div className="grid grid-cols-2 gap-3 pt-2">
                                      {TYPE_OPTIONS.map((option) => <button key={option.type} type="button" onClick={() => handlePickType(option.type)} className="flex flex-col items-start gap-2 rounded-lg border p-4 text-left hover:border-primary hover:bg-muted/30"><ItemIcon type={option.type} /><span className="text-sm font-semibold">{option.label}</span><span className="text-xs text-muted-foreground">{option.description}</span></button>)}

                                      {allowEmpty && (
                                                      <button type="button" onClick={() => { onAddItems([]); handleOpenChange(false); }} className="col-span-2 rounded-lg border border-dashed p-4 text-left hover:border-primary hover:bg-muted/30">
                                                      <span className="text-sm font-semibold">Empty source</span>
                                                      <span className="mt-1 block text-xs text-muted-foreground">Create the source now and add items later.</span>
                                                      </button>
                                                      )}
                                      </div>
                                      </>
                                      )}

          {step.kind === "timed-values-method" && (
                                                     <>
                                                     <DialogHeader><DialogTitle>Add Time Series</DialogTitle><DialogDescription>How do you want to enter the data?</DialogDescription></DialogHeader>
                                                     <div className="grid grid-cols-2 gap-3 pt-2">
                                                     <button type="button" onClick={() => setStep({ kind: "pdf", resultType: "timed-values" })} className="flex flex-col items-start gap-2 rounded-lg border p-4 text-left hover:border-primary hover:bg-muted/30">
                                                     <FileText className="h-4 w-4" />
                                                     <span className="text-sm font-semibold">Import from PDF</span>
                                                     <span className="text-xs text-muted-foreground">Pick columns from a parsed PDF table.</span>
                                                     </button>
                                                     <button type="button" onClick={handleStartManualTable} className="flex flex-col items-start gap-2 rounded-lg border p-4 text-left hover:border-primary hover:bg-muted/30">
                                                     <Table2 className="h-4 w-4" />
                                                     <span className="text-sm font-semibold">Enter manually</span>
                                                     <span className="text-xs text-muted-foreground">Type in each date and value by hand.</span>
                                                     </button>
                                                     </div>
                                                     <DialogFooter className="pt-2"><Button type="button" variant="ghost" onClick={() => setStep({ kind: "picker" })}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button></DialogFooter>
                                                     </>
                                                     )}

          {step.kind === "table" && (
                                      <>
                                      <DialogHeader className="shrink-0">
                                      <DialogTitle>{editingItem ? "Edit" : "Add"} {step.resultType === "index-series" ? "Index Series" : "Time Series"}</DialogTitle>
                                      <DialogDescription>Enter each date and value by hand. A row needs both to count.</DialogDescription>
                                      </DialogHeader>
                                      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden pt-2">
                                      {step.resultType === "index-series" && (
                                                                             <div className="flex shrink-0 flex-col gap-2">
                                                                             <label className="text-sm font-medium">Settle to</label>
                                                                             <select value={direction} onChange={(e) => setDirection(e.target.value as IndexDirection)} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                                                                             <option value="future">Latest reading (future value)</option>
                                                                             <option value="past">Earliest reading (present value)</option>
                                                                             </select>
                                                                             </div>
                                                                             )}
                                      <div className="flex shrink-0 gap-2 px-0.5 text-xs font-medium text-muted-foreground">
                                      <span className="flex-1">Date</span>
                                      <span className="flex-1">Value</span>
                                      <span className="w-8 shrink-0" />
                                      </div>
                                      <div className="scrollbar-visible flex min-h-[180px] flex-1 flex-col gap-2 overflow-y-auto pr-1">
                                      {tableRows.map((row) => (
                                                                 <div key={row.id} className="flex items-center gap-2">
                                                                 <input type="date" value={row.date} onChange={(e) => updateTableRow(row.id, { date: e.target.value })} className="w-full flex-1 rounded-md border bg-background px-3 py-2 text-sm" />
                                                                 <input
                                                                 ref={(el) => { if (el) valueInputRefs.current.set(row.id, el); else valueInputRefs.current.delete(row.id); }}
                                                                 type="number"
                                                                 step="any"
                                                                 value={row.value}
                                                                 onChange={(e) => updateTableRow(row.id, { value: e.target.value })}
                                                                 onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTableRow(); } }}
                                                                 placeholder="0.00"
                                                                 className="w-full flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                                                                 />
                                                                 <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeTableRow(row.id)}>
                                                                 <Trash2 className="h-4 w-4" />
                                                                 <span className="sr-only">Remove row</span>
                                                                 </Button>
                                                                 </div>
                                                                 ))}
                                      {tableRows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No rows yet.</p>}
                                      </div>
                                      <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                                      <input type="checkbox" checked={autoIncrementMonth} onChange={(e) => setAutoIncrementMonth(e.target.checked)} className="h-3.5 w-3.5 cursor-pointer accent-primary" />
                                      Advance new rows by 1 month
                                      </label>
                                      <Button type="button" variant="outline" onClick={addTableRow} className="shrink-0">
                                      <Plus className="mr-2 h-4 w-4" />Add row
                                      </Button>
                                      <p className="shrink-0 text-xs text-muted-foreground">{parsedTableRows.length} of {tableRows.length} row{tableRows.length === 1 ? "" : "s"} usable.</p>
                                      </div>
                                      <DialogFooter className="shrink-0 pt-2">
                                      {editingItem ? <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>Cancel</Button> : <Button type="button" variant="ghost" onClick={() => setStep({ kind: "timed-values-method" })}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>}
                                      <Button type="button" onClick={handleTableSubmit} disabled={parsedTableRows.length === 0}>{editingItem ? "Save changes" : "Add item"}</Button>
                                      </DialogFooter>
                                      </>
                                      )}

          {step.kind === "manual" && (
                                      <>
                                      <DialogHeader><DialogTitle>{editingItem ? "Edit" : "Add"} {MANUAL_TYPE_LABELS[step.itemType]}</DialogTitle><DialogDescription>Choose the value, frequency, and when the schedule applies.</DialogDescription></DialogHeader>
                                      <div className="flex flex-col gap-5 pt-2">
                                      <div className="flex flex-col gap-1.5">
                                      <label className="text-sm font-medium">{step.itemType === "fixed-value" ? "Value" : "Rate"}</label>
                                      <div className="relative">
                                      <input type="number" step="any" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0.00" className={`w-full rounded-md border bg-background px-3 py-2 text-sm ${step.itemType === "fixed-value" ? "" : "pr-7"}`} />
                                      {step.itemType !== "fixed-value" && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>}
                                      </div>
                                      {step.itemType !== "fixed-value" && <p className="text-xs text-muted-foreground">Rate per {FREQUENCY_SINGULAR[frequencyUnit]}, e.g. 5 means 5%.</p>}
                                      </div>

                                      {step.itemType !== "fixed-value" && (
                                                                            <div className="flex flex-col gap-2">
                                                                            <label className="text-sm font-medium">Settle to</label>
                                                                            <select value={direction} onChange={(e) => setDirection(e.target.value as IndexDirection)} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                                                                            <option value="future">End of the period (future value)</option>
                                                                            <option value="past">Start of the period (present value)</option>
                                                                            </select>
                                                                            <p className="text-xs text-muted-foreground">{direction === "future" ? "Raw values grow forward to the end of the schedule below." : "Raw values discount back to the start of the schedule below — what they're worth on the first day."}</p>
                                                                            </div>
                                                                            )}

                                      <div className="rounded-lg border p-4">
                                      <div className="mb-3 text-sm font-semibold">Frequency</div>
                                      <div className="grid grid-cols-[1fr_1.4fr] gap-3">
                                      <div className="flex flex-col gap-1.5"><label className="text-xs font-medium text-muted-foreground">Every</label><input type="number" min="1" step="1" value={frequencyEvery} onChange={(e) => setFrequencyEvery(e.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm" /></div>
                                      <div className="flex flex-col gap-1.5"><label className="text-xs font-medium text-muted-foreground">Interval</label><select value={frequencyUnit} onChange={(e) => setFrequencyUnit(e.target.value as FrequencyUnit)} className="w-full rounded-md border bg-background px-3 py-2 text-sm"><option value="days">{Number(frequencyEvery) === 1 ? "day" : "days"}</option><option value="weeks">{Number(frequencyEvery) === 1 ? "week" : "weeks"}</option><option value="months">{Number(frequencyEvery) === 1 ? "month" : "months"}</option><option value="years">{Number(frequencyEvery) === 1 ? "year" : "years"}</option></select></div>
                                      </div>
                                      <p className="mt-2 text-xs text-muted-foreground">Every {Number(frequencyEvery) > 0 ? frequencyEvery : "X"} {FREQUENCY_LABELS[frequencyUnit]}. {frequencyDescription}</p>
                                      </div>

                                      <div className="flex flex-col gap-2">
                                      <label className="text-sm font-medium">Apply</label>
                                      <select value={scheduleKind} onChange={(e) => setScheduleKind(e.target.value as ScheduleKind)} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                                      <option value="count">X times starting on a reference date</option>
                                      <option value="range">On this interval over a date range</option>
                                      <option value="entire">On this interval for the entire time</option>
                                      </select>
                                      </div>

                                      {scheduleKind === "count" && (
                                                                    <div className="grid grid-cols-2 gap-3">
                                                                    <DateRefField label="Starting date" mode={referenceDateMode} onModeChange={setReferenceDateMode} value={referenceDate} onValueChange={setReferenceDate} sourceDate={sourceRange.start} sourceLabel="Start of source data" />
                                                                    <div className="flex flex-col gap-1.5"><label className="text-sm font-medium">Occurrences</label><input type="number" min="1" step="1" value={occurrences} onChange={(e) => setOccurrences(e.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm" /></div>
                                                                    </div>
                                                                    )}

                                      {scheduleKind === "range" && (
                                                                    <div className="grid grid-cols-2 gap-3">
                                                                    <DateRefField label="Range start" mode={rangeStartMode} onModeChange={setRangeStartMode} value={rangeStart} onValueChange={setRangeStart} sourceDate={sourceRange.start} sourceLabel="Start of source data" />
                                                                    <DateRefField label="Range end" mode={rangeEndMode} onModeChange={setRangeEndMode} value={rangeEnd} onValueChange={setRangeEnd} sourceDate={sourceRange.end} sourceLabel="End of source data" />
                                                                    </div>
                                                                    )}

                                      {scheduleKind === "entire" && <div className="flex flex-col gap-1.5"><label className="text-sm font-medium">Reference date</label><input type="date" value={referenceDate} onChange={(e) => setReferenceDate(e.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm" /><p className="text-xs text-muted-foreground">The relevant day is taken from this date: weekday for weeks, day-of-month for months, or month/day for years.</p></div>}
                                      </div>
                                      <DialogFooter className="pt-2">{editingItem ? <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>Cancel</Button> : <Button type="button" variant="ghost" onClick={() => setStep({ kind: "picker" })}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>}<Button type="button" onClick={handleManualSubmit} disabled={!isManualValid}>{editingItem ? "Save changes" : "Add item"}</Button></DialogFooter>
                                      </>
                                      )}

          {step.kind === "index-series-direction" && (
                                                        <>
                                                        <DialogHeader><DialogTitle>Add Index Series</DialogTitle><DialogDescription>Choose which end of the imported data raw values settle toward. You&apos;ll pick the PDF table next.</DialogDescription></DialogHeader>
                                                        <div className="flex flex-col gap-2 pt-2">
                                                        <label className="text-sm font-medium">Settle to</label>
                                                        <select value={direction} onChange={(e) => setDirection(e.target.value as IndexDirection)} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                                                        <option value="future">Latest reading (future value)</option>
                                                        <option value="past">Earliest reading (present value)</option>
                                                        </select>
                                                        <p className="text-xs text-muted-foreground">{direction === "future" ? "Raw values grow forward to the index's most recent reading — what they're worth today." : "Raw values discount back to the index's earliest reading — what they were worth on day one."}</p>
                                                        </div>
                                                        <DialogFooter className="pt-2"><Button type="button" variant="ghost" onClick={() => setStep({ kind: "picker" })}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button><Button type="button" onClick={handleIndexSeriesDirectionContinue}>Continue</Button></DialogFooter>
                                                        </>
                                                        )}
          </DialogContent>
          </Dialog>

          <PdfImportDialog open={open && step.kind === "pdf"} onOpenChange={(nextOpen: boolean) => { if (!nextOpen) handleOpenChange(false); }} onUpload={handlePdfUpload} />
          </>
          );
}
