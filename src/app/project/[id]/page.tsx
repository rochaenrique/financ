"use client"

import React from 'react';
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

import {
  getProject,
  saveProject,
  duplicateSource,
  randomSourceColor,
  type Project,
  type ProjectItem,
  type ProjectSource,
} from "@/lib/projects"

import { ProjectEditor } from "@/components/project/project-editor"
import { getSourcedFromDatasets } from "@/lib/pdf-datasets"

import dynamic from "next/dynamic"

import { type PdfSelectedDataset } from "@/components/project/pdf-import-dialog"

export default function ProjectPage() {
  
  const PdfImportDialog = dynamic(() => import("@/components/project/pdf-import-dialog")
                                  .then((module) => module.PdfImportDialog), { ssr: false });
  
  const params = useParams();
  const router = useRouter();
  
  const id = params.id as string;
  
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  
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
          </div>
          
          <ProjectEditor project={project} onAddSource={handleAddSource} onAddItem={handleAddItems} onEditItem={handleEditItem} onDeleteItem={handleDeleteItem} onToggleItemDisabled={handleToggleItemDisabled} onDuplicateSource={handleDuplicateSource} onDeleteSource={handleDeleteSource}/>
          </main>
          );
}