"use client"

import type { ProjectSource } from "@/lib/projects"
import { expandSourcePoints } from "@/lib/valuation"

type Props = { sources: ProjectSource[] };

type ChartPoint = { time: Date, value: number, color: string, sourceId: string, sourceName: string };

const VIEWBOX_WIDTH = 800;
const VIEWBOX_HEIGHT = 400;
const MARGIN = { top: 24, right: 24, bottom: 36, left: 56 };
const Y_TICK_COUNT = 4;
const MARKER_RADIUS = 4;

function collectPoints(sources: ProjectSource[]): ChartPoint[] {
  const points: ChartPoint[] = [];
  for (const source of sources) {
    for (const point of expandSourcePoints(source)) {
      if (Number.isNaN(point.time.getTime())) { continue; } // skip unparsable timestamps rather than crashing
      points.push({ time: point.time, value: point.value, color: source.color, sourceId: source.id, sourceName: source.name });
    }
  }
  return points;
}

function formatAxisDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatAxisValue(value: number): string {
  return Math.abs(value) >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toFixed(0);
}

export function ProjectChart({ sources }: Props) {
  const points = collectPoints(sources);

  if (points.length === 0) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No data to display yet.</div>;
  }
  
  const times = points.map((point) => point.time.getTime());
  const values = points.map((point) => point.value);
  
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const timeSpan = maxTime - minTime || 1;
  
  // markers should always reach down to (or up from) a zero baseline, so the domain has to include 0 even if every value is positive or negative
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(0, ...values);
  const valueSpan = maxValue - minValue || 1;
  
  const innerWidth = VIEWBOX_WIDTH - MARGIN.left - MARGIN.right;
  const innerHeight = VIEWBOX_HEIGHT - MARGIN.top - MARGIN.bottom;
  
  function xForTime(time: Date): number { return MARGIN.left + ((time.getTime() - minTime) / timeSpan) * innerWidth; }
  function yForValue(value: number): number { return MARGIN.top + innerHeight - ((value - minValue) / valueSpan) * innerHeight; }
  
  const baselineY = yForValue(0);
  
  const sortedTimes = [...new Set(times)].sort((a, b) => a - b);
  const tickCount = Math.min(6, sortedTimes.length);
  const tickTimes = Array.from({ length: tickCount }, (_, i) => new Date(minTime + (timeSpan * i) / Math.max(1, tickCount - 1)));
  const yTicks = Array.from({ length: Y_TICK_COUNT + 1 }, (_, i) => minValue + (valueSpan * i) / Y_TICK_COUNT);
  
  const legendSources = [...new Map(points.map((point) => [point.sourceId, { id: point.sourceId, name: point.sourceName, color: point.color }])).values()];
  
  return (
          <div className="flex h-full flex-col gap-2">
          <div className="relative min-h-0 flex-1">
          <svg viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} preserveAspectRatio="none" className="h-full w-full">
          {/* horizontal grid lines at each y tick */}
          {yTicks.map((tick, i) => <line key={`grid-${i}`} x1={MARGIN.left} x2={VIEWBOX_WIDTH - MARGIN.right} y1={yForValue(tick)} y2={yForValue(tick)} stroke="#e5e7eb" strokeWidth={1} />)}
          
          {/* zero baseline, drawn a touch darker than the grid */}
          <line x1={MARGIN.left} x2={VIEWBOX_WIDTH - MARGIN.right} y1={baselineY} y2={baselineY} stroke="#9ca3af" strokeWidth={1} />
          
          {/* y axis labels */}
          {yTicks.map((tick, i) => <text key={`ytick-${i}`} x={MARGIN.left - 8} y={yForValue(tick)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="#6b7280">{formatAxisValue(tick)}</text>)}
          
          {/* x axis labels */}
          {tickTimes.map((t, i) => <text key={`xtick-${i}`} x={xForTime(t)} y={VIEWBOX_HEIGHT - MARGIN.bottom + 20} textAnchor="middle" fontSize={11} fill="#6b7280">{formatAxisDate(t)}</text>)}
          
          {/* markers, one per timed-value point: a stem from the baseline up to the value, capped with a dot */}
          {points.map((point, i) => {
                        const x = xForTime(point.time);
                        const valueY = yForValue(point.value);
                        return (
                                <g key={`marker-${point.sourceId}-${i}`}>
                                <line x1={x} x2={x} y1={baselineY} y2={valueY} stroke={point.color} strokeWidth={2} />
                                <circle cx={x} cy={valueY} r={MARKER_RADIUS} fill={point.color}>
                                <title>{`${point.sourceName}: ${point.value} (${point.time.toLocaleDateString()})`}</title>
                                </circle>
                                </g>
                                );
                      })}
          
          {/* axis lines */}
          <line x1={MARGIN.left} x2={MARGIN.left} y1={MARGIN.top} y2={VIEWBOX_HEIGHT - MARGIN.bottom} stroke="#9ca3af" strokeWidth={1} />
          <line x1={MARGIN.left} x2={VIEWBOX_WIDTH - MARGIN.right} y1={VIEWBOX_HEIGHT - MARGIN.bottom} y2={VIEWBOX_HEIGHT - MARGIN.bottom} stroke="#9ca3af" strokeWidth={1} />
          </svg>
          </div>
          
          {legendSources.length > 0 && (
                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 text-xs text-muted-foreground">
                                        {legendSources.map((source) => (
                                                                        <div key={source.id} className="flex items-center gap-1.5">
                                                                        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: source.color }} />
                                                                        {source.name}
                                                                        </div>
                                                                        ))}
                                        </div>
                                        )}
          </div>
          );
}