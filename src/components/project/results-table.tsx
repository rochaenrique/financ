"use client"

import type { ProjectSource } from "@/lib/projects"
import { sumSourceValue } from "@/lib/valuation"

type Props = { sources: ProjectSource[] };

type SourceResult = { id: string, name: string, color: string, vam: number, comparedVam: number };

function computeResults(sources: ProjectSource[]): SourceResult[] {
  const vams = sources.map((source) => ({ source, vam: sumSourceValue(source) }));
  const lowestVam = vams.length > 0 ? Math.min(...vams.map((v) => v.vam)) : 0;
  return vams.map(({ source, vam }) => ({ id: source.id, name: source.name, color: source.color, vam, comparedVam: vam - lowestVam }));
}

function formatVam(value: number): string {
  return value.toFixed(2);
}

function formatComparedVam(value: number): string {
  if (value === 0) { return "0"; }
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

export function ResultsTable({ sources }: Props) {
  const results = computeResults(sources);
  
  return (
          <div className="flex h-full flex-col">
          <h2 className="mb-2 text-center text-2xl font-semibold">Resultados</h2>
          
          <div className="min-h-0 flex-1 overflow-auto rounded-sm border bg-background">
          {results.length === 0 ? (
                                   <p className="p-4 text-center text-sm text-muted-foreground">No sources to compare yet.</p>
                                   ) : (
                                        <table className="w-full border-collapse text-sm">
                                        <thead>
                                        <tr className="border-b">
                                        <th className="px-2 py-1 text-left font-semibold">Fonte</th>
                                        <th className="px-2 py-1 text-right font-semibold">VAM</th>
                                        <th className="px-2 py-1 text-right font-semibold">VAM Comparado</th>
                                        </tr>
                                        </thead>
                                        <tbody>
                                        {results.map((result) => (
                                                                  // NOTE: assumes source.color is a 6-digit hex string; the trailing "33" appends ~20% alpha for the row tint
                                                                  <tr key={result.id} style={{ backgroundColor: `${result.color}33` }}>
                                                                  <td className="px-4 py-2 font-semibold">{result.name}</td>
                                                                  <td className="px-2 py-2 text-right">{formatVam(result.vam)}</td>
                                                                  <td className="px-2 py-2 text-right">{formatComparedVam(result.comparedVam)}</td>
                                                                  </tr>
                                                                  ))}
                                        </tbody>
                                        </table>
                                        )}
          </div>
          </div>
          );
}