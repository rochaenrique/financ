"use client"

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, Folder, Pencil, Trash2, Plus } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { createProject, deleteProject, getProjectIndex, renameProject, type Project } from "@/lib/projects";


export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState("");
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [projectToRename, setProjectToRename] = useState<Project | null>(null);
  const [renameValue, setRenameValue] = useState("");
  
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
    const project = createProject("Novo Projeto");
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
  
  return (
          <main className="min-h-screen bg-background">
          <div className="mx-auto w-full max-w-5xl px-6 py-10">
          <div className="mb-8 flex items-center justify-between">
          <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">Select a project to continue working.</p>
          </div>
          
          <Button onClick={handleCreateProject}>
          <Plus className="mr-2 h-4 w-4" />
          New Project
          </Button>
          </div>
          
          <div className="mb-4">
          <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search projects..." className="pl-9" />
          </div>
          </div>
          
          <div className="rounded-lg border">
          <Table>
          <TableHeader>
          <TableRow>
          <TableHead>Project</TableHead>
          <TableHead>ID</TableHead>
          <TableHead>Last modified</TableHead>
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
                                                
                                                <TableCell className="text-sm text-muted-foreground">{new Date(project.modified).toLocaleDateString()}</TableCell>
                                                
                                                <TableCell>
                                                <div className="flex items-center justify-end gap-1">
                                                <Button variant="ghost" size="icon" onClick={() => { setProjectToRename(project); setRenameValue(project.name); }}>
                                                <Pencil className="h-4 w-4" />
                                                <span className="sr-only">Rename project</span>
                                                </Button>
                                                
                                                <Button variant="ghost" size="icon" onClick={() => setProjectToDelete(project)} className="text-muted-foreground hover:text-destructive">
                                                <Trash2 className="h-4 w-4" />
                                                <span className="sr-only">Delete project</span>
                                                </Button>
                                                </div>
                                                </TableCell>
                                                </TableRow>
                                                ))
             ) : (
                  <TableRow>
                  <TableCell colSpan={4} className="h-32 text-center">
                  <p className="font-medium">No projects found</p>
                  <p className="text-sm text-muted-foreground">Try a different search.</p>
                  </TableCell>
                  </TableRow>
                  )}
          </TableBody>
          </Table>
          </div>
          
          <div className="mt-3 flex justify-between text-xs text-muted-foreground">
          <span>{filteredProjects.length} {filteredProjects.length === 1 ? "project" : "projects"}</span>
          <span>Stored locally</span>
          </div>
          </div>
          
          <AlertDialog open={projectToDelete !== null} onOpenChange={(open) => !open && setProjectToDelete(null)}>
          <AlertDialogContent>
          <AlertDialogHeader>
          <AlertDialogTitle>Delete project?</AlertDialogTitle>
          <AlertDialogDescription>
          This will permanently delete <span className="font-medium">{projectToDelete?.name}</span> and all of its locally stored data. This action cannot be undone.
          </AlertDialogDescription>
          </AlertDialogHeader>
          
          <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDeleteProject} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
          Delete
          </AlertDialogAction>
          </AlertDialogFooter>
          </AlertDialogContent>
          </AlertDialog>
          
          <Dialog open={projectToRename !== null} onOpenChange={(open) => { if (!open) { setProjectToRename(null); setRenameValue(""); } }}>
          <DialogContent className="sm:max-w-md">
          <DialogHeader>
          <DialogTitle>Rename project</DialogTitle>
          <DialogDescription>Enter a new name for this project.</DialogDescription>
          </DialogHeader>
          
          <Input value={renameValue} onChange={(event) => setRenameValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") handleRenameProject(); }} autoFocus />
          
          <DialogFooter>
          <Button variant="outline" onClick={() => { setProjectToRename(null); setRenameValue(""); }}>
          Cancel
          </Button>
          <Button onClick={handleRenameProject} disabled={!renameValue.trim()}>
          Rename
          </Button>
          </DialogFooter>
          </DialogContent>
          </Dialog>
          </main>
          );
}