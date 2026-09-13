"use client"

import React from 'react';
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import {
  getProject,
  saveProject,
  duplicateSource,
  randomSourceColor,
  createProjectExport,
  type Project,
  type ProjectItem,
  type ProjectSource,
} from "@/lib/projects"

import { RESULT_COLUMNS, type ColumnKey } from "@/lib/results"
import { generateProjectReportPdf, CURRENCY_OPTIONS, type CurrencyCode } from "@/lib/pdf-report"
import { ProjectEditor } from "@/components/project/project-editor"
import { getSourcedFromDatasets } from "@/lib/pdf-datasets"

import dynamic from "next/dynamic"

import { type PdfSelectedDataset } from "@/components/project/pdf-import-dialog"

function sanitizeFilename(name: string): string {
  return name.trim().replace(/[^a-z0-9 _-]/gi, "_") || "project";
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function defaultReportFilename(project: Project): string {
  return `${project.name}-Report.pdf`;
}

// Strips a trailing ".pdf" (if the user left it from the default value)
// before sanitizing, then adds it back -- sanitizeFilename doesn't allow
// "." so running it over the whole string would mangle the extension.
function toPdfFilename(input: string, project: Project): string {
  const trimmed = input.trim();
  const withoutExt = trimmed.toLowerCase().endsWith(".pdf") ? trimmed.slice(0, -4) : trimmed;
  const base = sanitizeFilename(withoutExt || `${project.name}-Report`);
  return `${base}.pdf`;
}

export default function ProjectPage() {
  
  const PdfImportDialog = dynamic(() => import("@/components/project/pdf-import-dialog")
                                  .then((module) => module.PdfImportDialog), { ssr: false });
  
  const params = useParams();
  const router = useRouter();
  
  const id = params.id as string;
  
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportFilename, setReportFilename] = useState("");
  const [includedSourceIds, setIncludedSourceIds] = useState<Set<string>>(new Set());
  const [reportColumns, setReportColumns] = useState<Set<ColumnKey>>(new Set());
  const [showGraph, setShowGraph] = useState(true);
  const [showSourceSummaries, setShowSourceSummaries] = useState(true);
  const [reportCurrency, setReportCurrency] = useState<CurrencyCode>("NONE");
  const [includeToc, setIncludeToc] = useState(false);

  useEffect(() => {
              const loaded = getProject(id);
              setProject(loaded);
              setLoading(false);
            }, [id]);
  
  if (loading) {
    return (
            <main className="flex min-h-screen items-center justify-center">
            <p className="text-sm text-muted-foreground">
            Loading project...
            </p>
            </main>
            );
  }
  
  if (!project) {
    return (
            <main className=" flex min-h-screen flex-col items-center justify-center gap-4 ">
            <div className="text-center">
            <h1 className="text-xl font-semibold">Project not found</h1>
            <p className=" mt-1 text-sm text-muted-foreground "> This project does not exist in local storage. </p>
            </div>
            
            <Button variant="outline" onClick={() => router.push("/")} >
            <ArrowLeft className="mr-2 h-4 w-4" />Back to projects
            </Button>
            </main>
            );
  }
  
  /*
  const handlePdfUpload = (datasets: PdfSelectedDataset[]) => {
    if (!project) return;
    
    const newSources = getSourcedFromDatasets(datasets);
    
    const updatedProject: Project = {
      ...project,
      modified: new Date().toISOString(),
      sources: [...project.sources, ...newSources],
    };
    
    saveProject(updatedProject);
    setProject(updatedProject);
  };
*/
  
  const handleAddSource = (items: ProjectItem[]) => {
    if (!project) return;
    
    const source: ProjectSource = {
      id: crypto.randomUUID(),
      name: "New Source",
      color: randomSourceColor(),
      items,
    };
    
    const updatedProject: Project = {
      ...project,
      modified: new Date().toISOString(),
      sources: [...project.sources, source],
    };
    
    saveProject(updatedProject);
    setProject(updatedProject);
  };
  
  const handleAddItems = (sourceId: string, items: ProjectItem[]) => {
    if (!project || items.length === 0) return;

    const updatedProject: Project = {
      ...project,
      modified: new Date().toISOString(),
      sources: project.sources.map((source) =>
                                   source.id === sourceId
                                   ? { ...source, items: [...source.items, ...items] }
                                   : source
                                   ),
    };

    saveProject(updatedProject);
    setProject(updatedProject);
  };

  const handleEditItem = (sourceId: string, item: ProjectItem) => {
    if (!project) return;

    const updatedProject: Project = {
      ...project,
      modified: new Date().toISOString(),
      sources: project.sources.map((source) =>
                                   source.id === sourceId
                                   ? { ...source, items: source.items.map((existing) => existing.id === item.id ? item : existing) }
                                   : source
                                   ),
    };

    saveProject(updatedProject);
    setProject(updatedProject);
  };

  const handleDeleteItem = (sourceId: string, itemId: string) => {
    if (!project) return;

    const updatedProject: Project = {
      ...project,
      modified: new Date().toISOString(),
      sources: project.sources.map((source) =>
                                   source.id === sourceId
                                   ? { ...source, items: source.items.filter((item) => item.id !== itemId) }
                                   : source
                                   ),
    };

    saveProject(updatedProject);
    setProject(updatedProject);
  };

  const handleToggleItemDisabled = (sourceId: string, itemId: string) => {
    if (!project) return;

    const updatedProject: Project = {
      ...project,
      modified: new Date().toISOString(),
      sources: project.sources.map((source) =>
                                   source.id === sourceId
                                   ? { ...source, items: source.items.map((item) => item.id === itemId ? { ...item, isDisabled: !item.isDisabled } : item) }
                                   : source
                                   ),
    };

    saveProject(updatedProject);
    setProject(updatedProject);
  };

  const handleDeleteSource = (sourceId: string) => {
    if (!project) return;

    const updatedProject: Project = {
      ...project,
      modified: new Date().toISOString(),
      sources: project.sources.filter((source) => source.id !== sourceId),
    };

    saveProject(updatedProject);
    setProject(updatedProject);
  };

  const handleExport = () => {
    if (!project) return;

    const payload = createProjectExport(project);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    downloadBlob(`${sanitizeFilename(project.name)}-${new Date().toISOString().slice(0, 10)}.json`, blob);
  };

  const handleOpenReportDialog = () => {
    if (!project) return;
    setReportFilename(defaultReportFilename(project));
    setIncludedSourceIds(new Set(project.sources.map((source) => source.id)));
    setReportColumns(new Set(RESULT_COLUMNS.filter((column) => column.defaultVisible).map((column) => column.key)));
    setShowGraph(true);
    setShowSourceSummaries(true);
    setReportCurrency("NONE");
    setIncludeToc(false);
    setReportDialogOpen(true);
  };

  const toggleIncludedSource = (id: string) => {
    setIncludedSourceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleReportColumn = (key: ColumnKey) => {
    setReportColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const setAllSourcesIncluded = (include: boolean) => {
    if (!project) return;
    setIncludedSourceIds(include ? new Set(project.sources.map((source) => source.id)) : new Set());
  };

  const handleConfirmExportReport = async () => {
    if (!project) return;
    const blob = await generateProjectReportPdf(project, {
      includedSourceIds,
      columns: reportColumns,
      showGraph,
      showSourceSummaries,
      currency: reportCurrency,
      includeToc,
    });
    downloadBlob(toPdfFilename(reportFilename, project), blob);
    setReportDialogOpen(false);
  };

  const handleDuplicateSource = (sourceId: string) => {
    if (!project) return;

    const source = project.sources.find((s) => s.id === sourceId);
    if (!source) return;

    const duplicate = duplicateSource(source, project.sources.map((s) => s.name));

    const updatedProject: Project = {
      ...project,
      modified: new Date().toISOString(),
      sources: [...project.sources, duplicate],
    };

    saveProject(updatedProject);
    setProject(updatedProject);
  };

  return (
          <main className="flex h-screen flex-col overflow-hidden bg-background">
          <div className=" flex h-12 shrink-0 items-center border-b px-4">
          <Button variant="ghost" size="sm" onClick={() => router.push("/")} >
          <ArrowLeft className="mr-2 h-4 w-4" />Projects
          </Button>
          <div className="mx-3 h-5 w-px bg-border" />
          <span className="text-sm font-medium">{project.name}</span>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={handleOpenReportDialog}>
          <FileText className="mr-2 h-4 w-4" />Export Report
          </Button>
          <Button variant="ghost" size="sm" onClick={handleExport}>
          <Download className="mr-2 h-4 w-4" />Export
          </Button>
          </div>

          <ProjectEditor project={project} onAddSource={handleAddSource} onAddItem={handleAddItems} onEditItem={handleEditItem} onDeleteItem={handleDeleteItem} onToggleItemDisabled={handleToggleItemDisabled} onDuplicateSource={handleDuplicateSource} onDeleteSource={handleDeleteSource}/>

          <Dialog open={reportDialogOpen} onOpenChange={(open) => { setReportDialogOpen(open); if (!open) setReportFilename(""); }}>
          <DialogContent className="flex max-h-[85vh] w-full flex-col overflow-hidden sm:max-w-lg">
          <DialogHeader className="shrink-0">
          <DialogTitle>Export report</DialogTitle>
          <DialogDescription>Choose what to include and a file name for the PDF.</DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
          <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">File name</label>
          <Input value={reportFilename} onChange={(event) => setReportFilename(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") handleConfirmExportReport(); }} autoFocus />
          </div>

          <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Sources</label>
          <div className="flex gap-2 text-xs text-muted-foreground">
          <button type="button" onClick={() => setAllSourcesIncluded(true)} className="hover:text-foreground hover:underline">All</button>
          <button type="button" onClick={() => setAllSourcesIncluded(false)} className="hover:text-foreground hover:underline">None</button>
          </div>
          </div>
          <div className="flex flex-col gap-0.5 rounded-lg border p-1.5">
          {project.sources.length === 0 && <p className="px-2 py-1.5 text-sm text-muted-foreground">No sources yet.</p>}
          {project.sources.map((source) => (
                                             <label key={source.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/50">
                                             <input type="checkbox" checked={includedSourceIds.has(source.id)} onChange={() => toggleIncludedSource(source.id)} className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-primary" />
                                             <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: source.color }} />
                                             <span className="truncate">{source.name}</span>
                                             </label>
                                             ))}
          </div>
          </div>

          <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">Table columns</label>
          <div className="flex flex-wrap gap-1.5">
          {RESULT_COLUMNS.map((column) => (
                                            <button
                                            key={column.key}
                                            type="button"
                                            onClick={() => toggleReportColumn(column.key)}
                                            title={column.title}
                                            className={cn(
                                                          "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                                                          reportColumns.has(column.key)
                                                          ? "border-primary bg-primary/10 text-primary"
                                                          : "border-border bg-background text-muted-foreground hover:bg-muted"
                                                          )}
                                            >
                                            {column.label}
                                            </button>
                                            ))}
          </div>
          </div>

          <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Currency</label>
          <select value={reportCurrency} onChange={(event) => setReportCurrency(event.target.value as CurrencyCode)} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
          {CURRENCY_OPTIONS.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
          </select>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={showGraph} onChange={(event) => setShowGraph(event.target.checked)} className="h-3.5 w-3.5 cursor-pointer accent-primary" />
          Include chart
          </label>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={showSourceSummaries} onChange={(event) => setShowSourceSummaries(event.target.checked)} className="h-3.5 w-3.5 cursor-pointer accent-primary" />
          Include per-source summary (with a small chart for each source)
          </label>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={includeToc} onChange={(event) => setIncludeToc(event.target.checked)} className="h-3.5 w-3.5 cursor-pointer accent-primary" />
          Include table of contents
          </label>
          </div>

          <DialogFooter className="shrink-0 pt-2">
          <Button variant="outline" onClick={() => setReportDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleConfirmExportReport} disabled={!reportFilename.trim()}>Export</Button>
          </DialogFooter>
          </DialogContent>
          </Dialog>
          </main>
          );
}