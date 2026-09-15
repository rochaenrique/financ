import type { Project, ProjectSource } from "./projects";
import { computeResults, RESULT_COLUMNS, resultColumnLabel, type ColumnKey, type ResultColumn } from "./results";
import { computeChartLayout, formatAxisDate, formatAxisValue, regionLabel, type ChartMargin } from "./chart-geometry";
import type { jsPDF } from "jspdf";
import type { CellHookData } from "jspdf-autotable";
// Type-only: formatNumber/formatDate are derived from next-intl's own
// formatter rather than hand-rolled against Intl.NumberFormatOptions/
// Intl.DateTimeFormatOptions, whose option types are narrower per-field
// than the general Intl ones (see results.ts for the full rationale).
// Erased at build time, so no runtime dependency -- t stays fully
// hand-rolled below since plain string keys/values don't hit the same
// narrowing issue. The calling component (which does have hook access)
// builds a ReportI18n via thin adapter closures around
// useTranslations()/useFormatter().
import type { useFormatter } from "next-intl";

type Translate = (key: string, values?: Record<string, string | number>) => string;
type NumberFormatter = ReturnType<typeof useFormatter>["number"];
type DateFormatter = ReturnType<typeof useFormatter>["dateTime"];
export type ReportI18n = { t: Translate; formatNumber: NumberFormatter; formatDate: DateFormatter };

export type CurrencyCode = "NONE" | "USD" | "EUR" | "GBP" | "JPY" | "BRL" | "CAD" | "AUD" | "CHF" | "CNY" | "INR" | "MXN" | "ARS" | "KRW" | "SEK" | "NOK" | "NZD";

export type CurrencyOption = { code: CurrencyCode; symbol: string };

// Symbols are restricted to characters the PDF's built-in fonts can
// actually render (WinAnsi/CP1252) -- e.g. no rupee or won sign -- so a
// plain ISO-code prefix stands in wherever there's no safe single glyph.
export const CURRENCY_OPTIONS: CurrencyOption[] = [
  { code: "NONE", symbol: "" },
  { code: "USD", symbol: "$" },
  { code: "EUR", symbol: "€" },
  { code: "GBP", symbol: "£" },
  { code: "JPY", symbol: "¥" },
  { code: "BRL", symbol: "R$" },
  { code: "CAD", symbol: "C$" },
  { code: "AUD", symbol: "A$" },
  { code: "CHF", symbol: "CHF " },
  { code: "CNY", symbol: "CN¥" },
  { code: "INR", symbol: "INR " },
  { code: "MXN", symbol: "MX$" },
  { code: "ARS", symbol: "AR$" },
  { code: "KRW", symbol: "KRW " },
  { code: "SEK", symbol: "SEK " },
  { code: "NOK", symbol: "NOK " },
  { code: "NZD", symbol: "NZ$" },
];

export function currencyOptionLabel(t: Translate, option: CurrencyOption): string {
  return t(`pdfReport.currency.${option.code.toLowerCase()}`);
}

// Inserts the currency symbol right after a leading sign character (if
// any) rather than in front of it, so a signed value reads "+R$100.00"
// instead of "R$+100.00".
function applyCurrencySymbol(formatted: string, symbol: string): string {
  if (!symbol) return formatted;
  const match = formatted.match(/^([+-]?)(.*)$/);
  if (!match) return `${symbol}${formatted}`;
  const [, sign, rest] = match;
  return `${sign}${symbol}${rest}`;
}

export type ReportConfig = {
  includedSourceIds: Set<string>;
  columns: Set<ColumnKey>;
  showGraph: boolean;
  showSourceSummaries: boolean;
  currency: CurrencyCode;
  includeToc: boolean;
};

const FONT = "times";
const PAGE_MARGIN = 15; // mm
const CHART_MARGIN: ChartMargin = { top: 8, right: 10, bottom: 16, left: 20 };
const MINI_CHART_MARGIN: ChartMargin = { top: 5, right: 5, bottom: 10, left: 16 };
const REGION_LANE_HEIGHT = 4; // mm
const MINI_REGION_LANE_HEIGHT = 3; // mm
const MINI_CHART_HEIGHT = 45; // mm -- shared with the per-source page-break reservation below
const DIVIDER_COLOR: [number, number, number] = [205, 205, 205];
// The on-screen chart's arrows (->, U+2192/U+2190) render fine in a
// browser but fall outside the WinAnsi encoding jsPDF's built-in fonts
// use, silently coming out as garbage glyphs -- ASCII stand-ins here
// instead of reusing chart-geometry's REGION_DIRECTION_ARROW.
const PDF_DIRECTION_ARROW: Record<"future" | "past", string> = { future: "->", past: "<-" };

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  return [parseInt(normalized.slice(0, 2), 16), parseInt(normalized.slice(2, 4), 16), parseInt(normalized.slice(4, 6), 16)];
}

function drawDivider(doc: jsPDF, x: number, y: number, width: number) {
  doc.setDrawColor(...DIVIDER_COLOR);
  doc.setLineWidth(0.3);
  doc.line(x, y, x + width, y);
  doc.setDrawColor(0, 0, 0);
}

function drawSectionHeading(doc: jsPDF, text: string, x: number, y: number) {
  doc.setFont(FONT, "bold");
  doc.setFontSize(13);
  doc.setTextColor(0, 0, 0);
  doc.text(text, x, y);
  doc.setFont(FONT, "normal");
}

// One "label: value" bullet with the label in bold and the value in
// normal weight, since jsPDF can't mix font weights within a single
// text() call.
function drawBulletLine(doc: jsPDF, x: number, y: number, label: string, value: string) {
  doc.setFont(FONT, "bold");
  const prefix = `• ${label}: `;
  doc.text(prefix, x, y);
  const prefixWidth = doc.getTextWidth(prefix);
  doc.setFont(FONT, "normal");
  doc.text(value, x + prefixWidth, y);
}

// Draws one chart (main or per-source mini) at (originX, originY) using
// jsPDF's own vector primitives, driven by the exact same geometry the
// on-screen SVG chart uses -- so the two never disagree about where a
// point belongs, even though one renders to SVG and the other to PDF
// vector paths directly (no rasterization, so it stays crisp at any zoom
// or print size). Returns the Y position just below whatever was drawn.
function drawChart(doc: jsPDF, sources: ProjectSource[], originX: number, originY: number, width: number, height: number, margin: ChartMargin, regionLaneHeight: number, markerRadius: number, showLegend: boolean, t: Translate, formatNumber: NumberFormatter, formatDate: DateFormatter): number {
  const layout = computeChartLayout(sources, width, height, margin, regionLaneHeight);

  if (!layout) {
    doc.setFont(FONT, "italic");
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text(t("pdfReport.noData"), originX, originY + 5);
    doc.setTextColor(0, 0, 0);
    doc.setFont(FONT, "normal");
    return originY + 10;
  }

  const { points, regions, margin: grownMargin, xForTime, yForValue, baselineY, tickTimes, yTicks, legendSources } = layout;
  const X = (x: number) => originX + x;
  const Y = (y: number) => originY + y;

  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.15);
  for (const tick of yTicks) {
    const ty = yForValue(tick);
    doc.line(X(grownMargin.left), Y(ty), X(width - grownMargin.right), Y(ty));
  }

  doc.setDrawColor(156, 163, 175);
  doc.setLineWidth(0.2);
  doc.line(X(grownMargin.left), Y(baselineY), X(width - grownMargin.right), Y(baselineY));

  doc.setFont(FONT, "normal");
  doc.setFontSize(7);
  doc.setTextColor(107, 114, 128);
  for (const tick of yTicks) {
    doc.text(formatAxisValue(tick, formatNumber), X(grownMargin.left - 2), Y(yForValue(tick)), { align: "right", baseline: "middle" });
  }
  for (const tickTime of tickTimes) {
    doc.text(formatAxisDate(tickTime, formatDate), X(xForTime(tickTime)), Y(height - grownMargin.bottom + 5), { align: "center" });
  }

  doc.setFontSize(6);
  regions.forEach((region, i) => {
    // anchored to the un-grown margin, same as the on-screen chart, since
    // lanes stack downward from the top of the plot area regardless of how
    // much room they end up pushing the plot itself down by
    const laneY = margin.top - 3 + (i + 1) * regionLaneHeight - regionLaneHeight / 2;
    const x1 = region.start ? xForTime(region.start) : grownMargin.left;
    const x2 = xForTime(region.end);
    const [r, g, b] = hexToRgb(region.color);
    doc.setDrawColor(r, g, b);
    doc.setTextColor(r, g, b);
    doc.setLineWidth(0.3);
    doc.setLineDashPattern([1, 0.7], 0);
    doc.line(X(x1), Y(laneY), X(x2), Y(laneY));
    doc.setLineDashPattern([], 0);
    doc.text(`${regionLabel(t, region.kind)} ${PDF_DIRECTION_ARROW[region.direction]}`, X(x1), Y(laneY - 1));
  });

  points.forEach((point) => {
    const x = xForTime(point.time);
    const valueY = yForValue(point.value);
    const [r, g, b] = hexToRgb(point.color);
    doc.setDrawColor(r, g, b);
    doc.setFillColor(r, g, b);
    doc.setLineWidth(0.4);
    doc.line(X(x), Y(baselineY), X(x), Y(valueY));
    doc.circle(X(x), Y(valueY), markerRadius, "F");
  });

  doc.setDrawColor(156, 163, 175);
  doc.setLineWidth(0.2);
  doc.line(X(grownMargin.left), Y(grownMargin.top), X(grownMargin.left), Y(height - grownMargin.bottom));
  doc.line(X(grownMargin.left), Y(height - grownMargin.bottom), X(width - grownMargin.right), Y(height - grownMargin.bottom));

  let nextY = originY + height;

  if (showLegend && legendSources.length > 0) {
    doc.setFontSize(8);
    let lx = originX;
    const ly = nextY + 5;
    for (const source of legendSources) {
      const [r, g, b] = hexToRgb(source.color);
      doc.setFillColor(r, g, b);
      doc.circle(lx + 1, ly - 1, 1, "F");
      doc.setTextColor(80, 80, 80);
      doc.text(source.name, lx + 3.5, ly);
      lx += 3.5 + doc.getTextWidth(source.name) + 6;
    }
    nextY = ly + 3;
  }

  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
  return nextY;
}

type TocEntry = { title: string; page: number; indent?: boolean };

// jsPDF touches browser-only globals as soon as its module runs, so both
// it and its autoTable plugin are loaded on demand from inside this
// function rather than imported at the top of the file -- this page still
// gets rendered once on the server for the initial HTML, and only the
// actual PDF build (triggered by a click) needs to happen in the browser.
//
// i18n is threaded in from the calling component (which has hook access to
// next-intl) rather than called from here directly -- this module stays a
// plain function with no dependency on next-intl's types.
export async function generateProjectReportPdf(project: Project, config: ReportConfig, i18n: ReportI18n): Promise<Blob> {
  const { t, formatNumber, formatDate } = i18n;
  const { default: JsPdfCtor } = await import("jspdf");
  // The plugin's typed default export returns void, so the finalY of the
  // drawn table (needed to know where to place the next section) isn't
  // reachable through it -- __createTable/__drawTable are the same plugin's
  // own lower-level pair that hands back the Table model instead.
  const { __createTable, __drawTable } = await import("jspdf-autotable");

  const doc = new JsPdfCtor();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - PAGE_MARGIN * 2;

  const includedSources = project.sources.filter((source) => config.includedSourceIds.has(source.id));
  const columns = RESULT_COLUMNS.filter((column) => config.columns.has(column.key));
  const currencySymbol = CURRENCY_OPTIONS.find((option) => option.code === config.currency)?.symbol ?? "";

  function formatCell(column: ResultColumn, result: ReturnType<typeof computeResults>[number]): string {
    const formatted = column.formatValue(result, { number: formatNumber, dateTime: formatDate });
    return column.isMonetary ? applyCurrencySymbol(formatted, currencySymbol) : formatted;
  }

  const showTable = includedSources.length > 0 && columns.length > 0;
  const showChart = config.showGraph && includedSources.length > 0;
  const showSummaries = config.showSourceSummaries && includedSources.length > 0;

  const tocEntries: TocEntry[] = [];
  let tocPageNumber: number | null = null;
  let tocHeadingY = 0;
  let tocEntriesY = 0;

  let y = PAGE_MARGIN;

  doc.setFont(FONT, "bold");
  doc.setFontSize(22);
  doc.setTextColor(0, 0, 0);
  doc.text(project.name, PAGE_MARGIN, y + 9);
  doc.setFont(FONT, "italic");
  doc.setFontSize(10);
  doc.setTextColor(120, 120, 120);
  doc.text(t("pdfReport.generatedOn", { date: formatDate(new Date()) }), PAGE_MARGIN, y + 16);
  doc.setTextColor(0, 0, 0);
  doc.setFont(FONT, "normal");
  y += 22;
  drawDivider(doc, PAGE_MARGIN, y, contentWidth);
  y += 12;

  // The TOC shares the header page instead of getting a page of its own --
  // its entry count is known upfront from config alone, so the space it
  // needs can be reserved right here and the actual titles/page numbers
  // filled in later, once the rest of the document has been laid out.
  if (config.includeToc) {
    const rootCount = (showTable ? 1 : 0) + (showChart ? 1 : 0) + (showSummaries ? 1 : 0);
    const indentedCount = showSummaries ? includedSources.length : 0;
    if (rootCount + indentedCount > 0) {
      tocPageNumber = 1;
      tocHeadingY = y;
      y += 8;
      tocEntriesY = y;
      y += rootCount * 9 + indentedCount * 6.5;
      y += 10;
      drawDivider(doc, PAGE_MARGIN, y, contentWidth);
      y += 12;
    }
  }

  if (showTable) {
    if (y + 20 > pageHeight - PAGE_MARGIN) {
      doc.addPage();
      y = PAGE_MARGIN;
    }
    tocEntries.push({ title: t("pdfReport.summaryTable"), page: doc.getNumberOfPages() });
    drawSectionHeading(doc, t("pdfReport.summaryTable"), PAGE_MARGIN, y);
    y += 8;

    const results = computeResults(includedSources);
    const tableColumns = [
      { header: t("resultsTable.sourceColumn"), dataKey: "source" },
      ...columns.map((column) => ({ header: resultColumnLabel(t, column), dataKey: column.key })),
    ];
    const tableBody = results.map((result) => {
      const row: Record<string, string> = { source: result.name };
      for (const column of columns) row[column.key] = formatCell(column, result);
      return row;
    });

    const table = __createTable(doc, {
      startY: y,
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
      columns: tableColumns,
      body: tableBody,
      theme: "grid",
      styles: { font: FONT, fontSize: 9, cellPadding: 2.5, lineColor: [210, 210, 210], lineWidth: 0.2 },
      headStyles: { font: FONT, fontStyle: "bold", fillColor: [240, 240, 240], textColor: [0, 0, 0], halign: "left" },
      // columnStyles alone left header cells left-aligned while body cells
      // were right-aligned, so headers and values visually landed nowhere
      // near each other in the same column -- this hook forces both
      // sections to agree, regardless of section-vs-column precedence.
      didParseCell: (data: CellHookData) => {
        if (data.column.index > 0) data.cell.styles.halign = "right";
      },
    });
    __drawTable(doc, table);
    y = (table.finalY ?? y) + 10;
    drawDivider(doc, PAGE_MARGIN, y, contentWidth);
    y += 12;
  }

  if (showChart) {
    const chartHeight = 80;
    const reserved = 15 + chartHeight + 15;
    if (y + reserved > pageHeight - PAGE_MARGIN) {
      doc.addPage();
      y = PAGE_MARGIN;
    }
    tocEntries.push({ title: t("pdfReport.chart"), page: doc.getNumberOfPages() });
    drawSectionHeading(doc, t("pdfReport.chart"), PAGE_MARGIN, y);
    y += 7;
    y = drawChart(doc, includedSources, PAGE_MARGIN, y, contentWidth, chartHeight, CHART_MARGIN, REGION_LANE_HEIGHT, 1.1, true, t, formatNumber, formatDate);
    y += 8;
    drawDivider(doc, PAGE_MARGIN, y, contentWidth);
    y += 12;
  }

  if (showSummaries) {
    // Reserve room for the heading together with the first source's whole
    // block, not just the heading alone -- otherwise "Source Summaries"
    // can end up sitting by itself at the bottom of a page with every
    // actual source pushed to the next one.
    const firstSourceReserved = 10 + columns.length * 5.5 + 8 + MINI_CHART_HEIGHT + 8;
    if (y + 10 + firstSourceReserved > pageHeight - PAGE_MARGIN) {
      doc.addPage();
      y = PAGE_MARGIN;
    }
    tocEntries.push({ title: t("pdfReport.sourceSummaries"), page: doc.getNumberOfPages() });
    drawSectionHeading(doc, t("pdfReport.sourceSummaries"), PAGE_MARGIN, y);
    y += 10;

    includedSources.forEach((source, index) => {
      const [result] = computeResults([source]);
      const reserved = 10 + columns.length * 5.5 + 8 + MINI_CHART_HEIGHT + 8;
      if (y + reserved > pageHeight - PAGE_MARGIN) {
        doc.addPage();
        y = PAGE_MARGIN;
      }

      tocEntries.push({ title: source.name, page: doc.getNumberOfPages(), indent: true });

      doc.setFont(FONT, "bold");
      doc.setFontSize(13);
      doc.setTextColor(0, 0, 0);
      doc.text(`${source.name}:`, PAGE_MARGIN, y);
      doc.setFont(FONT, "normal");
      y += 7;

      doc.setFontSize(10);
      for (const column of columns) {
        drawBulletLine(doc, PAGE_MARGIN + 3, y, resultColumnLabel(t, column), formatCell(column, result));
        y += 5.5;
      }

      doc.setFont(FONT, "italic");
      doc.text(`• ${t("pdfReport.looksLike")}`, PAGE_MARGIN + 3, y);
      doc.setFont(FONT, "normal");
      y += 4;
      y = drawChart(doc, [source], PAGE_MARGIN + 5, y, contentWidth - 10, MINI_CHART_HEIGHT, MINI_CHART_MARGIN, MINI_REGION_LANE_HEIGHT, 0.7, false, t, formatNumber, formatDate);
      y += 8;

      if (index < includedSources.length - 1) {
        drawDivider(doc, PAGE_MARGIN, y, contentWidth);
        y += 10;
      }
    });
  }

  if (tocPageNumber !== null) {
    doc.setPage(tocPageNumber);
    drawSectionHeading(doc, t("pdfReport.tableOfContents"), PAGE_MARGIN, tocHeadingY);

    let tocY = tocEntriesY;
    for (const entry of tocEntries) {
      const indent = entry.indent ? 8 : 0;
      doc.setFont(FONT, entry.indent ? "italic" : "bold");
      doc.setFontSize(entry.indent ? 10.5 : 12.5);
      doc.setTextColor(entry.indent ? 90 : 0, entry.indent ? 90 : 0, entry.indent ? 90 : 0);
      doc.text(entry.title, PAGE_MARGIN + indent, tocY);
      const pageLabel = String(entry.page);
      doc.text(pageLabel, pageWidth - PAGE_MARGIN, tocY, { align: "right" });

      const titleWidth = doc.getTextWidth(entry.title);
      const pageLabelWidth = doc.getTextWidth(pageLabel);
      const dotsStartX = PAGE_MARGIN + indent + titleWidth + 3;
      const dotsEndX = pageWidth - PAGE_MARGIN - pageLabelWidth - 3;
      if (dotsEndX > dotsStartX) {
        doc.setDrawColor(190, 190, 190);
        doc.setLineWidth(0.3);
        doc.setLineDashPattern([0.6, 1.2], 0);
        doc.line(dotsStartX, tocY - 1, dotsEndX, tocY - 1);
        doc.setLineDashPattern([], 0);
      }
      tocY += entry.indent ? 6.5 : 9;
    }
    doc.setFont(FONT, "normal");
    doc.setTextColor(0, 0, 0);
    doc.setDrawColor(0, 0, 0);
  }

  return doc.output("blob");
}
