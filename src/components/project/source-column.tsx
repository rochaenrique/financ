"use client"

import { useState } from "react";
import { Copy, Plus, Pencil, Trash2, Eye, EyeOff, GripVertical, CalendarDays } from "lucide-react";

import type { ProjectItem, ProjectItemFrequency, ProjectSource } from "@/lib/projects";
import { resolveItemDateRange } from "@/lib/projects";
import { toDate, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ItemIcon } from "./item-icon";
import { AddItemDialog } from "./add-item-dialog";

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
          <span className="sr-only">Duplicate source</span>
          </Button>
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => setConfirmDeleteSource(true)}>
          <Trash2 className="h-4 w-4" />
          <span className="sr-only">Delete source</span>
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
                            <span className={cn("truncate text-sm font-semibold", item.isDisabled && "line-through")}>{item.data.type}</span>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onToggleItemDisabled(item.id)}>
                            {item.isDisabled ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            <span className="sr-only">{item.isDisabled ? "Enable item" : "Disable item"}</span>
                            </Button>
                            {item.data.type !== "timed-values" && (
                                                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setItemToEdit(item)}>
                                                                    <Pencil className="h-4 w-4" />
                                                                    <span className="sr-only">Edit item</span>
                                                                    </Button>
                                                                    )}
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setItemToDelete(item)}>
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Delete item</span>
                            </Button>
                            </div>
                            </div>
                            <div className="flex h-7 items-center gap-1 truncate rounded bg-slate-200 px-2 text-xs" title={formatItemSchedule(item, source)}>
                            <CalendarDays className="h-4 w-4 shrink-0" />{formatItemSchedule(item, source)}
                            </div>
                            </div>)}
          <Button variant="ghost" className="h-10 w-full bg-slate-300 hover:bg-slate-400" onClick={() => setAddItemOpen(true)}>
          <Plus className="h-4 w-4" />
          </Button>
          </div>
          <div className="flex-1" />
          <AddItemDialog key={itemToEdit?.id ?? "add"} open={addItemOpen || itemToEdit !== null} onOpenChange={closeItemDialog} onAddItems={onAddItems} onEditItem={onEditItem} source={source} editingItem={itemToEdit} />

          <AlertDialog open={itemToDelete !== null} onOpenChange={(open) => !open && setItemToDelete(null)}>
          <AlertDialogContent>
          <AlertDialogHeader>
          <AlertDialogTitle>Delete item?</AlertDialogTitle>
          <AlertDialogDescription>
          This will remove this {itemToDelete?.data.type.replace("-", " ")} item from {source.name}. This action cannot be undone.
          </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
          Delete
          </AlertDialogAction>
          </AlertDialogFooter>
          </AlertDialogContent>
          </AlertDialog>

          <AlertDialog open={confirmDeleteSource} onOpenChange={setConfirmDeleteSource}>
          <AlertDialogContent>
          <AlertDialogHeader>
          <AlertDialogTitle>Delete source?</AlertDialogTitle>
          <AlertDialogDescription>
          This will permanently delete <span className="font-medium">{source.name}</span> and all {source.items.length} item{source.items.length === 1 ? "" : "s"} in it. This action cannot be undone.
          </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirmDeleteSource} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
          Delete
          </AlertDialogAction>
          </AlertDialogFooter>
          </AlertDialogContent>
          </AlertDialog>
          </div>
          );
}

function formatItemSchedule(item: ProjectItem, source: ProjectSource): string {
  if (item.data.type === "timed-values") {
    if (item.data.times.length === 0) return "No dates";
    const start = item.data.times[0];
    const end = item.data.times[item.data.times.length - 1];
    return `${formatDate(start)} → ${formatDate(end)}`;
  }

  if (item.data.type === "index-series") {
    if (item.data.times.length === 0) return "No dates";
    const { start, end } = resolveItemDateRange(item, source);
    const arrow = (item.data.direction ?? "future") === "past" ? "←" : "→";
    return start && end ? `${formatDate(start)} → ${formatDate(end)} · settles ${arrow}` : "No dates";
  }

  const schedule = item.data.schedule;
  const frequency = formatFrequency(schedule.frequency);

  if (schedule.kind === "count") {
    const { start } = resolveItemDateRange(item, source);
    return start ? `${schedule.occurrences}× every ${frequency} from ${formatDate(start)}` : `${schedule.occurrences}× every ${frequency} from source start (unresolved)`;
  }
  if (schedule.kind === "range") {
    const { start, end } = resolveItemDateRange(item, source);
    return start && end ? `every ${frequency} · ${formatDate(start)} → ${formatDate(end)}` : `every ${frequency} · source range unresolved`;
  }
  return `every ${frequency} · ${formatReference(schedule.frequency, schedule.referenceDate)}`;
}

function formatFrequency(frequency: ProjectItemFrequency): string {
  const unit = frequency.unit.slice(0, -1);
  return `${frequency.every} ${frequency.every === 1 ? unit : frequency.unit}`;
}

function formatReference(frequency: ProjectItemFrequency, date: Date): string {
  if (frequency.unit === "days") return `from ${formatDate(date)}`;
  if (frequency.unit === "weeks") return `on ${date.toLocaleDateString(undefined, { weekday: "short" })}`;
  if (frequency.unit === "months") return `on day ${toDate(date).getDate()}`;
  return `on ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}