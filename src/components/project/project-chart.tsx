"use client"

import type { ProjectSource } from "@/lib/projects"
import { expandCorrectedSourcePoints, getIndexRegions } from "@/lib/valuation"

type Props = { sources: ProjectSource[] };

type ChartPoint = { time: Date, value: number, color: string, sourceId: string, sourceName: string };
type ChartRegion = { kind: "simple" | "compound" | "series", direction: "future" | "past", start: Date | null, end: Date, color: string, sourceName: string };

const VIEWBOX_WIDTH = 800;
const VIEWBOX_HEIGHT = 400;
const BASE_MARGIN = { top: 24, right: 24, bottom: 36, left: 56 };
const Y_TICK_COUNT = 4;
const MARKER_RADIUS = 4;
const REGION_LANE_HEIGHT = 16;
const REGION_LABEL: Record<ChartRegion["kind"], string> = { simple: "Simple", compound: "Compound", series: "Index" };
// Points settle toward the arrow's end: forward to the future, or back to the past.
const REGION_DIRECTION_ARROW: Record<ChartRegion["direction"], string> = { future: "→", past: "←" };

function collectPoints(sources: ProjectSource[]): ChartPoint[] {
  const points: ChartPoint[] = [];
  for (const source of sources) {
    for (const point of expandCorrectedSourcePoints(source)) {
      if (Number.isNaN(point.time.getTime())) { continue; } // skip unparsable timestamps rather than crashing
      points.push({ time: point.time, value: point.value, color: source.color, sourceId: source.id, sourceName: source.name });
    }
  }
  return points;
}

function collectRegions(sources: ProjectSource[]): ChartRegion[] {
  const regions: ChartRegion[] = [];
  for (const source of sources) {
    for (const region of getIndexRegions(source)) {
      regions.push({ ...region, color: source.color, sourceName: source.name });
    }
  }
  return regions;
}

function formatAxisDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatAxisValue(value: number): string {
  return Math.abs(value) >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toFixed(0);
}

export function ProjectChart({ sources }: Props) {
  const points = collectPoints(sources);
  const regions = collectRegions(sources);

  if (points.length === 0) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No data to display yet.</div>;
  }

  // Index regions can extend past the plotted points (e.g. a rate that
  // applies through next year), so the time domain has to cover them too or
  // the region line would run off the edge of the chart.
  const times = [
    ...points.map((point) => point.time.getTime()),
    ...regions.flatMap((region) => [region.start?.getTime(), region.end.getTime()].filter((t): t is number => t !== undefined)),
  ];
  const values = points.map((point) => point.value);

  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const timeSpan = maxTime - minTime || 1;

  // markers should always reach down to (or up from) a zero baseline, so the domain has to include 0 even if every value is positive or negative
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(0, ...values);
  const valueSpan = maxValue - minValue || 1;

  // Each index region gets its own horizontal lane above the plot, so the
  // top margin grows with how many there are.
  const margin = { ...BASE_MARGIN, top: BASE_MARGIN.top + regions.length * REGION_LANE_HEIGHT };

  const innerWidth = VIEWBOX_WIDTH - margin.left - margin.right;
  const innerHeight = VIEWBOX_HEIGHT - margin.top - margin.bottom;

  function xForTime(time: Date): number { return margin.left + ((time.getTime() - minTime) / timeSpan) * innerWidth; }
  function yForValue(value: number): number { return margin.top + innerHeight - ((value - minValue) / valueSpan) * innerHeight; }

  const baselineY = yForValue(0);

  const sortedTimes = [...new Set(points.map((point) => point.time.getTime()))].sort((a, b) => a - b);
  const tickCount = Math.min(6, sortedTimes.length);
  const tickTimes = Array.from({ length: tickCount }, (_, i) => new Date(minTime + (timeSpan * i) / Math.max(1, tickCount - 1)));
  const yTicks = Array.from({ length: Y_TICK_COUNT + 1 }, (_, i) => minValue + (valueSpan * i) / Y_TICK_COUNT);

  const legendSources = [...new Map(points.map((point) => [point.sourceId, { id: point.sourceId, name: point.sourceName, color: point.color }])).values()];
  
  return (
          <div className="flex h-full flex-col gap-2">
          <div className="relative min-h-0 flex-1">
          <svg viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} preserveAspectRatio="none" className="h-full w-full">
          {/* horizontal grid lines at each y tick */}
          {yTicks.map((tick, i) => <line key={`grid-${i}`} x1={margin.left} x2={VIEWBOX_WIDTH - margin.right} y1={yForValue(tick)} y2={yForValue(tick)} stroke="#e5e7eb" strokeWidth={1} />)}

          {/* zero baseline, drawn a touch darker than the grid */}
          <line x1={margin.left} x2={VIEWBOX_WIDTH - margin.right} y1={baselineY} y2={baselineY} stroke="#9ca3af" strokeWidth={1} />

          {/* y axis labels */}
          {yTicks.map((tick, i) => <text key={`ytick-${i}`} x={margin.left - 8} y={yForValue(tick)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="#6b7280">{formatAxisValue(tick)}</text>)}

          {/* x axis labels */}
          {tickTimes.map((t, i) => <text key={`xtick-${i}`} x={xForTime(t)} y={VIEWBOX_HEIGHT - margin.bottom + 20} textAnchor="middle" fontSize={11} fill="#6b7280">{formatAxisDate(t)}</text>)}

          {/* index-region lanes: one horizontal line per active simple/compound-index item, showing the span it corrects and which end (future/past) points settle toward */}
          {regions.map((region, i) => {
                        const laneY = BASE_MARGIN.top - 8 + (i + 1) * REGION_LANE_HEIGHT - REGION_LANE_HEIGHT / 2;
                        const x1 = xForTime(region.start ?? new Date(minTime));
                        const x2 = xForTime(region.end);
                        const settleLabel = region.direction === "future" ? "end (future value)" : "start (present value)";
                        return (
                                <g key={`region-${region.sourceName}-${i}`}>
                                <line x1={x1} x2={x2} y1={laneY} y2={laneY} stroke={region.color} strokeWidth={2} strokeDasharray="4 2">
                                <title>{`${region.sourceName} · ${REGION_LABEL[region.kind]} index, ${region.start ? region.start.toLocaleDateString() : "…"} → ${region.end.toLocaleDateString()}. Settles to the window's ${settleLabel}.`}</title>
                                </line>
                                <text x={x1} y={laneY - 3} fontSize={9} fill={region.color}>{REGION_LABEL[region.kind]} {REGION_DIRECTION_ARROW[region.direction]}</text>
                                </g>
                                );
                      })}

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
          <line x1={margin.left} x2={margin.left} y1={margin.top} y2={VIEWBOX_HEIGHT - margin.bottom} stroke="#9ca3af" strokeWidth={1} />
          <line x1={margin.left} x2={VIEWBOX_WIDTH - margin.right} y1={VIEWBOX_HEIGHT - margin.bottom} y2={VIEWBOX_HEIGHT - margin.bottom} stroke="#9ca3af" strokeWidth={1} />
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