"use client"

import type { ProjectSource } from "@/lib/projects"
import { computeChartLayout, formatAxisDate, formatAxisValue, REGION_LABEL, REGION_DIRECTION_ARROW } from "@/lib/chart-geometry"

type Props = { sources: ProjectSource[] };

const VIEWBOX_WIDTH = 800;
const VIEWBOX_HEIGHT = 400;
const BASE_MARGIN = { top: 24, right: 24, bottom: 36, left: 56 };
const MARKER_RADIUS = 4;
const REGION_LANE_HEIGHT = 16;

export function ProjectChart({ sources }: Props) {
  const layout = computeChartLayout(sources, VIEWBOX_WIDTH, VIEWBOX_HEIGHT, BASE_MARGIN, REGION_LANE_HEIGHT);

  if (!layout) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No data to display yet.</div>;
  }

  const { points, regions, margin, xForTime, yForValue, baselineY, tickTimes, yTicks, legendSources } = layout;

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
                        // an open-ended start has no time to convert -- xForTime(minTime) is always exactly margin.left by construction, so this is equivalent without exposing minTime itself
                        const x1 = region.start ? xForTime(region.start) : margin.left;
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
