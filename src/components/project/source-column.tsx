"use client"

import { useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { Copy, Plus, Pencil, Trash2, Eye, EyeOff, GripVertical, CalendarDays } from "lucide-react";

import type { ProjectItem, ProjectItemFrequency, ProjectSource } from "@/lib/projects";
import { resolveItemDateRange } from "@/lib/projects";
import { toDate, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ItemIcon, TYPE_MESSAGE_KEY } from "./item-icon";
import { AddItemDialog } from "./add-item-dialog";

type Translate = ReturnType<typeof useTranslations>;
// Derived from next-intl's own formatter rather than hand-rolled against
// Intl.DateTimeFormatOptions, whose option types are narrower per-field
// than the general Intl ones (see results.ts for the full rationale).
type DateFormatter = ReturnType<typeof useFormatter>["dateTime"];

type Props = {
  source: ProjectSource;
  onAddItems: (items: ProjectItem[]) => void;
  onEditItem: (item: ProjectItem) => void;
  onDeleteItem: (itemId: string) => void;
  onToggleItemDisabled: (itemId: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
};

export function SourceColumn({ source, onAddItems, onEditItem, onDeleteItem, onToggleItemDisabled, onDuplicate, onDelete }: Props) {
  const t = useTranslations();
  const format = useFormatter();
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [itemToEdit, setItemToEdit] = useState<ProjectItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<ProjectItem | null>(null);
  const [confirmDeleteSource, setConfirmDeleteSource] = useState(false);

  function closeItemDialog(open: boolean) {
    if (open) return;
    setAddItemOpen(false);
    setItemToEdit(null);
  }

  function handleConfirmDelete() {
    if (!itemToDelete) return;
    onDeleteItem(itemToDelete.id);
    setItemToDelete(null);
  }

  function handleConfirmDeleteSource() {
    onDelete();
    setConfirmDeleteSource(false);
  }

  return (
          <div className="flex min-w-[315px] flex-[0_1_380px] flex-col overflow-hidden rounded-lg bg-background">
          <div className="h-2 shrink-0" style={{ backgroundColor: source.color }} />
          <div className="flex items-center justify-between px-4 py-3">
          <h2 className="truncate text-2xl font-semibold">{source.name}</h2>
          <div className="flex shrink-0 items-center">
          <Button variant="ghost" size="icon" onClick={onDuplicate}>
          <Copy className="h-4 w-4" />
          <span className="sr-only">{t("sourceColumn.duplicateSourceSr")}</span>
          </Button>
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => setConfirmDeleteSource(true)}>
          <Trash2 className="h-4 w-4" />
          <span className="sr-only">{t("sourceColumn.deleteSourceSr")}</span>
          </Button>
          </div>
          </div>
          <div className="flex flex-col gap-2 px-4">
          {source.items.map((item) =>
                            <div key={item.id} className={cn("flex flex-col gap-1.5 rounded-lg border border-slate-400 bg-background px-1 py-1.5", item.isDisabled && "opacity-50")}>
                            <div className="flex items-center">
                            <GripVertical className="h-5 w-5 shrink-0 text-muted-foreground" />
                            <div className="flex min-w-0 flex-1 items-center gap-2 px-2">
                            <ItemIcon type={item.data.type} />
                            <span className={cn("truncate text-sm font-semibold", item.isDisabled && "line-through")}>{t(`addItemDialog.types.${TYPE_MESSAGE_KEY[item.data.type]}.label`)}</span>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onToggleItemDisabled(item.id)}>
                            {item.isDisabled ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            <span className="sr-only">{item.isDisabled ? t("sourceColumn.enableItemSr") : t("sourceColumn.disableItemSr")}</span>
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setItemToEdit(item)}>
                            <Pencil className="h-4 w-4" />
                            <span className="sr-only">{t("sourceColumn.editItemSr")}</span>
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setItemToDelete(item)}>
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">{t("sourceColumn.deleteItemSr")}</span>
                            </Button>
                            </div>
                            </div>
                            <div className="flex h-7 items-center gap-1 truncate rounded bg-slate-200 px-2 text-xs" title={formatItemSchedule(item, source, t, format.dateTime)}>
                            <CalendarDays className="h-4 w-4 shrink-0" />{formatItemSchedule(item, source, t, format.dateTime)}
                            </div>
                            </div>)}
          <Button variant="ghost" className="h-10 w-full bg-slate-300 hover:bg-slate-400" onClick={() => setAddItemOpen(true)}>
          <Plus className="h-4 w-4" />
          <span className="sr-only">{t("sourceColumn.addItemSr")}</span>
          </Button>
          </div>
          <div className="flex-1" />
          <AddItemDialog key={itemToEdit?.id ?? "add"} open={addItemOpen || itemToEdit !== null} onOpenChange={closeItemDialog} onAddItems={onAddItems} onEditItem={onEditItem} source={source} editingItem={itemToEdit} />

          <AlertDialog open={itemToDelete !== null} onOpenChange={(open) => !open && setItemToDelete(null)}>
          <AlertDialogContent>
          <AlertDialogHeader>
          <AlertDialogTitle>{t("sourceColumn.deleteItemDialog.title")}</AlertDialogTitle>
          <AlertDialogDescription>
          {itemToDelete && t("sourceColumn.deleteItemDialog.body", { type: t(`addItemDialog.types.${TYPE_MESSAGE_KEY[itemToDelete.data.type]}.label`), sourceName: source.name })}
          </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
          {t("common.delete")}
          </AlertDialogAction>
          </AlertDialogFooter>
          </AlertDialogContent>
          </AlertDialog>

          <AlertDialog open={confirmDeleteSource} onOpenChange={setConfirmDeleteSource}>
          <AlertDialogContent>
          <AlertDialogHeader>
          <AlertDialogTitle>{t("sourceColumn.deleteSourceDialog.title")}</AlertDialogTitle>
          <AlertDialogDescription>
          {t.rich("sourceColumn.deleteSourceDialog.body", { name: source.name, count: source.items.length, b: (chunks) => <span className="font-medium">{chunks}</span> })}
          </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirmDeleteSource} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
          {t("common.delete")}
          </AlertDialogAction>
          </AlertDialogFooter>
          </AlertDialogContent>
          </AlertDialog>
          </div>
          );
}

function formatItemSchedule(item: ProjectItem, source: ProjectSource, t: Translate, formatDateFn: DateFormatter): string {
  if (item.data.type === "timed-values") {
    if (item.data.times.length === 0) return t("itemSchedule.noDates");
    const start = item.data.times[0];
    const end = item.data.times[item.data.times.length - 1];
    return t("itemSchedule.dateRange", { start: formatDate(start, formatDateFn), end: formatDate(end, formatDateFn) });
  }

  if (item.data.type === "index-series") {
    if (item.data.times.length === 0) return t("itemSchedule.noDates");
    const { start, end } = resolveItemDateRange(item, source);
    const arrow = (item.data.direction ?? "future") === "past" ? "←" : "→";
    return start && end ? t("itemSchedule.indexSeriesRange", { start: formatDate(start, formatDateFn), end: formatDate(end, formatDateFn), arrow }) : t("itemSchedule.noDates");
  }

  const schedule = item.data.schedule;
  const frequency = formatFrequency(schedule.frequency, t);

  if (schedule.kind === "count") {
    const { start } = resolveItemDateRange(item, source);
    return start
      ? t("itemSchedule.countFromDate", { occurrences: schedule.occurrences, frequency, date: formatDate(start, formatDateFn) })
      : t("itemSchedule.countUnresolved", { occurrences: schedule.occurrences, frequency });
  }
  if (schedule.kind === "range") {
    const { start, end } = resolveItemDateRange(item, source);
    return start && end
      ? t("itemSchedule.rangeResolved", { frequency, start: formatDate(start, formatDateFn), end: formatDate(end, formatDateFn) })
      : t("itemSchedule.rangeUnresolved", { frequency });
  }
  return t("itemSchedule.entire", { frequency, reference: formatReference(schedule.frequency, schedule.referenceDate, t, formatDateFn) });
}

function formatFrequency(frequency: ProjectItemFrequency, t: Translate): string {
  return `${frequency.every} ${t(`frequency.${frequency.unit}`, { count: frequency.every })}`;
}

function formatReference(frequency: ProjectItemFrequency, date: Date, t: Translate, formatDateFn: DateFormatter): string {
  const resolved = toDate(date);
  if (frequency.unit === "days") return t("itemSchedule.referenceFrom", { date: formatDate(resolved, formatDateFn) });
  if (frequency.unit === "weeks") return t("itemSchedule.referenceOnWeekday", { weekday: formatDateFn(resolved, { weekday: "short" }) });
  if (frequency.unit === "months") return t("itemSchedule.referenceOnDayOfMonth", { day: resolved.getDate() });
  return t("itemSchedule.referenceOnMonthDay", { monthDay: formatDateFn(resolved, { month: "short", day: "numeric" }) });
}

function formatDate(date: Date, formatDateFn: DateFormatter): string {
  return formatDateFn(new Date(date), { day: "2-digit", month: "short", year: "numeric" });
}