"use client"

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Search, Folder, Pencil, Trash2, Plus, Upload } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { createProject, deleteProject, getProject, getProjectIndex, parseProjectExport, renameProject, saveProject, type Project } from "@/lib/projects";
import { LanguageSwitcher } from "@/components/project/language-switcher";

type ImportState = { kind: "collision"; incoming: Project; existing: Project } | { kind: "error"; message: string };


export default function Home() {
  const t = useTranslations();
  const format = useFormatter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState("");
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [projectToRename, setProjectToRename] = useState<Project | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [importState, setImportState] = useState<ImportState | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
              setProjects(getProjectIndex());
            }, []);
  
  const filteredProjects = useMemo(() => {
                                     const query = search.trim().toLowerCase();
                                     
                                     if (!query) {
                                       return projects;
                                     }
                                     
                                     return projects.filter((project) => project.name.toLowerCase().includes(query));
                                   }, [projects, search]);
  
  function handleCreateProject() {
    const project = createProject(t("projectList.defaultProjectName"));
    setProjects((current) => [...current, project]);
  }
  
  function handleDeleteProject() {
    if (!projectToDelete) {
      return;
    }
    
    deleteProject(projectToDelete.id);
    setProjects((current) => current.filter((project) => project.id !== projectToDelete.id));
    setProjectToDelete(null);
  }
  
  function handleRenameProject() {
    if (!projectToRename) return;
    
    const name = renameValue.trim();
    if (!name) return;
    
    const renamed = renameProject(projectToRename.id, name);
    if (renamed) {
      setProjects((current) => current.map((project) => project.id === renamed.id ? renamed : project));
    }
    
    setProjectToRename(null);
    setRenameValue("");
  }

  function finishImport(project: Project) {
    saveProject(project);
    setProjects(getProjectIndex());
    setImportState(null);
  }

  async function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const imported = parseProjectExport(await file.text());
      if (!imported) {
        setImportState({ kind: "error", message: t("projectList.importDialog.notAProjectFile") });
        return;
      }
      const existing = getProject(imported.id);
      if (existing) {
        setImportState({ kind: "collision", incoming: imported, existing });
        return;
      }
      finishImport(imported);
    } catch {
      setImportState({ kind: "error", message: t("projectList.importDialog.readFailed") });
    }
  }

  return (
          <main className="min-h-screen bg-background">
          <div className="mx-auto w-full max-w-5xl px-6 py-10">
          <div className="mb-8 flex items-center justify-between">
          <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("projectList.heading")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("projectList.subtitle")}</p>
          </div>

          <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => importInputRef.current?.click()}>
          <Upload className="mr-2 h-4 w-4" />
          {t("projectList.import")}
          </Button>
          <input ref={importInputRef} type="file" accept="application/json,.json" onChange={handleImportFile} className="sr-only" />
          <Button onClick={handleCreateProject}>
          <Plus className="mr-2 h-4 w-4" />
          {t("projectList.newProject")}
          </Button>
          <div className="mx-1 h-5 w-px bg-border" />
          <LanguageSwitcher />
          </div>
          </div>

          <div className="mb-4">
          <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("projectList.searchPlaceholder")} className="pl-9" />
          </div>
          </div>

          <div className="rounded-lg border">
          <Table>
          <TableHeader>
          <TableRow>
          <TableHead>{t("projectList.table.project")}</TableHead>
          <TableHead>{t("projectList.table.id")}</TableHead>
          <TableHead>{t("projectList.table.lastModified")}</TableHead>
          <TableHead className="w-12" />
          </TableRow>
          </TableHeader>
          
          <TableBody>
          {filteredProjects.length > 0 ? 
            (
             filteredProjects.map((project) => (
                                                <TableRow key={project.id}>
                                                <TableCell>
                                                <Link href={`/project/${project.id}`} className="block">
                                                <div className="flex items-center gap-3">
                                                <div className="flex h-8 w-8 items-center justify-center rounded-md border bg-muted/50">
                                                <Folder className="h-4 w-4 text-muted-foreground" />
                                                </div>
                                                <span className="font-medium">{project.name}</span>
                                                </div>
                                                </Link>
                                                </TableCell>
                                                
                                                <TableCell className="font-mono text-xs text-muted-foreground">{project.id}</TableCell>
                                                
                                                <TableCell className="text-sm text-muted-foreground">{format.dateTime(new Date(project.modified))}</TableCell>
                                                
                                                <TableCell>
                                                <div className="flex items-center justify-end gap-1">
                                                <Button variant="ghost" size="icon" onClick={() => { setProjectToRename(project); setRenameValue(project.name); }}>
                                                <Pencil className="h-4 w-4" />
                                                <span className="sr-only">{t("projectList.renameProjectSr")}</span>
                                                </Button>

                                                <Button variant="ghost" size="icon" onClick={() => setProjectToDelete(project)} className="text-muted-foreground hover:text-destructive">
                                                <Trash2 className="h-4 w-4" />
                                                <span className="sr-only">{t("projectList.deleteProjectSr")}</span>
                                                </Button>
                                                </div>
                                                </TableCell>
                                                </TableRow>
                                                ))
             ) : (
                  <TableRow>
                  <TableCell colSpan={4} className="h-32 text-center">
                  <p className="font-medium">{t("projectList.emptyState.title")}</p>
                  <p className="text-sm text-muted-foreground">{t("projectList.emptyState.hint")}</p>
                  </TableCell>
                  </TableRow>
                  )}
          </TableBody>
          </Table>
          </div>
          
          <div className="mt-3 flex justify-between text-xs text-muted-foreground">
          <span>{t("projectList.count", { count: filteredProjects.length })}</span>
          <span>{t("projectList.storedLocally")}</span>
          </div>
          </div>
          
          <AlertDialog open={projectToDelete !== null} onOpenChange={(open) => !open && setProjectToDelete(null)}>
          <AlertDialogContent>
          <AlertDialogHeader>
          <AlertDialogTitle>{t("projectList.deleteDialog.title")}</AlertDialogTitle>
          <AlertDialogDescription>
          {t.rich("projectList.deleteDialog.body", { name: projectToDelete?.name ?? "", b: (chunks) => <span className="font-medium">{chunks}</span> })}
          </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={handleDeleteProject} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
          {t("common.delete")}
          </AlertDialogAction>
          </AlertDialogFooter>
          </AlertDialogContent>
          </AlertDialog>

          <Dialog open={projectToRename !== null} onOpenChange={(open) => { if (!open) { setProjectToRename(null); setRenameValue(""); } }}>
          <DialogContent className="sm:max-w-md">
          <DialogHeader>
          <DialogTitle>{t("projectList.renameDialog.title")}</DialogTitle>
          <DialogDescription>{t("projectList.renameDialog.body")}</DialogDescription>
          </DialogHeader>

          <Input value={renameValue} onChange={(event) => setRenameValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") handleRenameProject(); }} autoFocus />

          <DialogFooter>
          <Button variant="outline" onClick={() => { setProjectToRename(null); setRenameValue(""); }}>
          {t("common.cancel")}
          </Button>
          <Button onClick={handleRenameProject} disabled={!renameValue.trim()}>
          {t("projectList.renameDialog.confirm")}
          </Button>
          </DialogFooter>
          </DialogContent>
          </Dialog>

          <AlertDialog open={importState !== null} onOpenChange={(open) => !open && setImportState(null)}>
          <AlertDialogContent>
          <AlertDialogHeader>
          <AlertDialogTitle>{importState?.kind === "collision" ? t("projectList.importDialog.collisionTitle") : t("projectList.importDialog.errorTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
          {importState?.kind === "collision"
            ? t.rich("projectList.importDialog.collisionBody", {
                existingName: importState.existing.name,
                incomingName: importState.incoming.name,
                b: (chunks) => <span className="font-medium">{chunks}</span>,
              })
            : importState?.message}
          </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
          <AlertDialogCancel>{importState?.kind === "collision" ? t("common.cancel") : t("projectList.importDialog.ok")}</AlertDialogCancel>
          {importState?.kind === "collision" && (
                                                  <AlertDialogAction onClick={() => finishImport(importState.incoming)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                                  {t("projectList.importDialog.overwrite")}
                                                  </AlertDialogAction>
                                                  )}
          </AlertDialogFooter>
          </AlertDialogContent>
          </AlertDialog>
          </main>
          );
}