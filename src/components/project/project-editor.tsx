"use client"

import type { Project, ProjectItem } from "@/lib/projects"

import { ProjectChart } from "./project-chart"
import { ResultsTable } from "./results-table"
import { SourceColumn } from "./source-column"
import { AddItemDialog } from "./add-item-dialog"

import { useState } from "react"

type Props = {
  project: Project;
  onAddSource: (items: ProjectItem[]) => void;
  onAddItem: (sourceId: string, items: ProjectItem[]) => void;
  onEditItem: (sourceId: string, item: ProjectItem) => void;
  onDeleteItem: (sourceId: string, itemId: string) => void;
}
export function ProjectEditor({ project, onAddSource, onAddItem, onEditItem, onDeleteItem }: Props) {
  const [addSourceOpen, setAddSourceOpen] = useState(false);
  
  return (
          <div className="flex min-h-0 flex-1 flex-col gap-2 bg-muted p-2">
          <section className="grid min-h-0 flex-1 grid-cols-2 gap-2">
          <div className="min-h-0 overflow-hidden rounded-sm border-2 border-dashed border-blue-500 bg-background p-5">
          <ProjectChart sources={project.sources} />
          </div>
          
          <div className="min-h-0 overflow-hidden rounded-sm border-2 border-dashed border-blue-500 bg-background p-5">
          <ResultsTable sources={project.sources} />
          </div>
          </section>
          
          <section className="flex min-h-0 flex-1 gap-4 overflow-x-auto p-2">
          {project.sources.map((source) => (
                                            <SourceColumn key={source.id} source={source} onAddItems={(items) => onAddItem(source.id, items)} onEditItem={(item) => onEditItem(source.id, item)} onDeleteItem={(itemId) => onDeleteItem(source.id, itemId)} />
                                            ))}
          
          <button type="button" onClick={() => setAddSourceOpen(true)} className="flex min-w-[315px] flex-1 items-center justify-center rounded-lg border-2 border-dashed border-emerald-400 bg-emerald-100/40 text-emerald-500 transition hover:bg-emerald-100/70">
          <div className="relative h-32 w-32">
          <div className="absolute left-1/2 top-1/2 h-32 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-emerald-400" />
          <div className="absolute left-1/2 top-1/2 h-0.5 w-32 -translate-x-1/2 -translate-y-1/2 bg-emerald-400" />
          </div>
          </button>
          </section>
          
          <AddItemDialog open={addSourceOpen} onOpenChange={setAddSourceOpen} onAddItems={onAddSource} allowEmpty />
          </div>
          );
}