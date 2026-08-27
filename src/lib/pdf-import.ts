import * as pdfjsLib from "pdfjs-dist"
import { OPS } from "pdfjs-dist"

export type PdfTableOptions = {
  yTolerance?: number;
  xTolerance?: number;
}

export type PdfTextItem = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PdfTextLine = {
  y: number;
  items: PdfTextItem[];
}

export type PdfColumn = {
  name: string;
  x: number;
  width: number;
}

export type PdfRow = {
  values: Record<string, string>;
}

export type PdfTable = {
  page: number;
  // A caption/label that sits above the table body (e.g. a section
  // heading like "III - Fluxo de Pagamento") rather than a header or
  // data row. Omitted when no such line was detected.
  title?: string;
  columns: PdfColumn[];
  rows: PdfRow[];
}

export type PdfPage = {
  page: number;
  tables: PdfTable[]
}

export type PdfDocument = {
  pages: PdfPage[];
}

// ---------------------------------------------------------------------------
// Ruling-line extraction
//
// Visible table borders/gridlines are the strongest signal we can get for
// where columns and rows actually are, since they're ground truth drawn by
// whatever produced the PDF rather than something we're inferring from text
// position. We walk the page's raw drawing operations, track the current
// transform matrix (PDF content streams can nest `q`/`cm`/`Q` around any
// path), and record straight horizontal/vertical segments that are actually
// painted (stroked or filled), not just used for clipping.
// ---------------------------------------------------------------------------

type PdfMatrix = [number, number, number, number, number, number];
const IDENTITY_MATRIX: PdfMatrix = [1, 0, 0, 1, 0, 0];

function multiplyPdfMatrix(a: PdfMatrix, b: PdfMatrix): PdfMatrix {
  return [
          a[0] * b[0] + a[1] * b[2],
          a[0] * b[1] + a[1] * b[3],
          a[2] * b[0] + a[3] * b[2],
          a[2] * b[1] + a[3] * b[3],
          a[4] * b[0] + a[5] * b[2] + b[4],
          a[4] * b[1] + a[5] * b[3] + b[5],
          ];
}

function applyPdfMatrix(m: PdfMatrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

export type PdfRuling = {
  orientation: "h" | "v";
  // fixed coordinate: y for a horizontal ruling, x for a vertical one
  pos: number;
  // extent of the ruling along its axis
  start: number;
  end: number;
}

// Operators that actually paint the current path. A path built purely for
// clipping (`W n`) should never be treated as a visible gridline.
const PDF_PAINT_OPS = new Set<number>([
                                       OPS.stroke,
                                       OPS.closeStroke,
                                       OPS.fill,
                                       OPS.eoFill,
                                       OPS.fillStroke,
                                       OPS.eoFillStroke,
                                       OPS.closeFillStroke,
                                       OPS.closeEOFillStroke,
                                       ]);

// How close to perfectly horizontal/vertical (in points) a segment must be
// to count as a ruling line, rather than a diagonal/decorative stroke.
const PDF_AXIS_TOLERANCE = 0.75;

function pushPdfRulingSegment(rulings: PdfRuling[], x0: number, y0: number, x1: number, y1: number) {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  
  if (dx < PDF_AXIS_TOLERANCE && dy < PDF_AXIS_TOLERANCE) {
    return; // degenerate/zero-length
  }
  
  if (dy <= PDF_AXIS_TOLERANCE) {
    rulings.push({ orientation: "h", pos: (y0 + y1) / 2, start: Math.min(x0, x1), end: Math.max(x0, x1) });
  } else if (dx <= PDF_AXIS_TOLERANCE) {
    rulings.push({ orientation: "v", pos: (x0 + x1) / 2, start: Math.min(y0, y1), end: Math.max(y0, y1) });
  }
  // diagonal segments are never part of a table grid; ignore them
}

// NOTE: `page` is loosely typed (rather than pdfjsLib.PDFPageProxy) because
// getOperatorList()'s exact result shape varies across pdfjs-dist versions.
async function extractPdfRulings(page: any): Promise<PdfRuling[]> {
  let opList: { fnArray: number[]; argsArray: any[] };
  try {
    opList = await page.getOperatorList();
  } catch {
    return [];
  }
  
  const rulings: PdfRuling[] = [];
  const ctmStack: PdfMatrix[] = [];
  let ctm: PdfMatrix = IDENTITY_MATRIX;
  
  const { fnArray, argsArray } = opList;
  
  for (let i = 0; i < fnArray.length; ++i) {
    const fn = fnArray[i];
    
    if (fn === OPS.save) {
      ctmStack.push(ctm);
    } else if (fn === OPS.restore) {
      ctm = ctmStack.pop() ?? IDENTITY_MATRIX;
    } else if (fn === OPS.transform) {
      const [a, b, c, d, e, f] = argsArray[i] as number[];
      ctm = multiplyPdfMatrix([a, b, c, d, e, f], ctm);
    } else if (fn === OPS.constructPath) {
      const [subOps, coords] = argsArray[i] as [number[], number[]];
      
      // only treat this path as a ruling candidate if it's actually
      // painted; pdf.js emits the paint operator immediately after
      // constructPath for the same path
      const nextFn = fnArray[i + 1];
      if (!PDF_PAINT_OPS.has(nextFn)) {
        continue;
      }
      
      let coordIdx = 0;
      let startX = 0, startY = 0;
      let curX = 0, curY = 0;
      
      for (const subOp of subOps) {
        if (subOp === OPS.moveTo) {
          const [x, y] = applyPdfMatrix(ctm, coords[coordIdx], coords[coordIdx + 1]);
          coordIdx += 2;
          startX = curX = x;
          startY = curY = y;
        } else if (subOp === OPS.lineTo) {
          const [x, y] = applyPdfMatrix(ctm, coords[coordIdx], coords[coordIdx + 1]);
          coordIdx += 2;
          pushPdfRulingSegment(rulings, curX, curY, x, y);
          curX = x;
          curY = y;
        } else if (subOp === OPS.curveTo) {
          coordIdx += 4; // skip the two bezier control points, unused here
          const [x, y] = applyPdfMatrix(ctm, coords[coordIdx], coords[coordIdx + 1]);
          coordIdx += 2;
          // table grids don't use curves; just keep the pen position in
          // sync rather than emitting a (misleading) straight segment
          curX = x;
          curY = y;
        } else if (subOp === OPS.rectangle) {
          const [x, y, w, h] = coords.slice(coordIdx, coordIdx + 4);
          coordIdx += 4;
          const p0 = applyPdfMatrix(ctm, x, y);
          const p1 = applyPdfMatrix(ctm, x + w, y);
          const p2 = applyPdfMatrix(ctm, x + w, y + h);
          const p3 = applyPdfMatrix(ctm, x, y + h);
          pushPdfRulingSegment(rulings, p0[0], p0[1], p1[0], p1[1]);
          pushPdfRulingSegment(rulings, p1[0], p1[1], p2[0], p2[1]);
          pushPdfRulingSegment(rulings, p2[0], p2[1], p3[0], p3[1]);
          pushPdfRulingSegment(rulings, p3[0], p3[1], p0[0], p0[1]);
          curX = startX = p0[0];
          curY = startY = p0[1];
        } else if (subOp === OPS.closePath) {
          pushPdfRulingSegment(rulings, curX, curY, startX, startY);
          curX = startX;
          curY = startY;
        }
      }
    }
  }
  
  return rulings;
}

type PdfPageContent = {
  items: PdfTextItem[];
  width: number;
  height: number;
  rulings: PdfRuling[];
}

// Safari added `Promise.withResolvers` only in 17.4 (March 2024); pdf.js 6.x
// calls it ~30 times, including in its own worker-startup path, so on an
// older Safari this throws "undefined is not a function" the instant a PDF
// is opened. Cheap and safe to polyfill unconditionally.
function ensurePromiseWithResolversPolyfill() {
  if (typeof Promise.withResolvers === "function") {
    return;
  }

  Promise.withResolvers = function withResolvers<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

// pdf.js's real-worker path (`new Worker(url, { type: "module" })`) is a
// separate JS realm with its own recurring Safari module-worker bugs beyond
// just the Promise.withResolvers gap above -- and the polyfill above can't
// reach into that realm anyway. Pre-loading the worker module on the main
// thread and exposing it via `globalThis.pdfjsWorker` is pdf.js's own
// documented signal (normally meant for a plain <script> tag) that a worker
// build is already available, so it skips real-Worker creation entirely and
// runs everything inline instead. Parsing a one-off, user-selected PDF in a
// modal dialog is small enough that losing the background thread is not
// noticeable, and it's a small price for sidestepping an entire class of
// worker-specific browser bugs.
let pdfWorkerReadyPromise: Promise<void> | null = null;

function ensurePdfWorkerReady(): Promise<void> {
  pdfWorkerReadyPromise ??= (async () => {
    const workerModule = await import("pdfjs-dist/build/pdf.worker.min.mjs");
    (globalThis as typeof globalThis & { pdfjsWorker?: unknown }).pdfjsWorker = workerModule;
  })();
  return pdfWorkerReadyPromise;
}

async function extractPdfText(buffer: ArrayBuffer): Promise<PdfPageContent[]> {
  ensurePromiseWithResolversPolyfill();
  await ensurePdfWorkerReady();
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages: PdfPageContent[] = [];
  
  for(let pageNumber = 1; pageNumber <= pdf.numPages; ++pageNumber) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });
    const items: PdfTextItem[] = [];
    
    for(const item of content.items) {
      // NOTE(erb): text content can contain more than just nomral text items
      if (!("str" in item)) {
        continue;
      }
      
      const transform = item.transform;
      items.push({
                   text: item.str,
                   x: transform[4],
                   y: transform[5],
                   width: item.width,
                   height: item.height,
                 });
    }
    
    const rulings = await extractPdfRulings(page);
    pages.push({ items, width: viewport.width, height: viewport.height, rulings });
  }
  return pages;
}

function findPdfMatchingLine(lines: PdfTextLine[], y: number, tolerance: number): PdfTextLine | null {
  let result: PdfTextLine | null = null;
  for (const testLine of lines) {
    if (Math.abs(testLine.y - y) <= tolerance) {
      result = testLine;
      break;
    }
  }
  return result;
}

function groupPdfTextIntoLines(items: PdfTextItem[], yTolerance = 3): PdfTextLine[] {
  const sorted = [...items].sort((a, b) => b.y - a.y);
  const lines: PdfTextLine[] = [];
  for(const item of sorted) {
    let testLine = findPdfMatchingLine(lines, item.y, yTolerance);
    if (!testLine) {
      testLine = { y : item.y, items: [], };
      lines.push(testLine);
    }
    testLine.items.push(item);
  }
  for(const testLine of lines) {
    testLine.items.sort((a, b) => a.x - b.x);
  }
  // NOTE: keep lines ordered top-to-bottom regardless of insertion order,
  // since downstream segmentation relies on this ordering.
  lines.sort((a, b) => b.y - a.y);
  return lines;
}

// ---------------------------------------------------------------------------
// #4: Table region segmentation
//
// A page can contain zero, one, or several tables interleaved with prose.
// We split the page's lines into candidate table regions by (a) dropping
// lines that look like prose rather than tabular data, then (b) breaking
// the remaining lines into groups wherever there's an unusually large
// vertical gap between consecutive lines.
// ---------------------------------------------------------------------------

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function isPdfProseLine(line: PdfTextLine, pageWidth: number): boolean {
  const nonEmptyItems = line.items.filter((item) => item.text.trim().length > 0);
  if (nonEmptyItems.length === 0) {
    return false;
  }
  // Lines with several distinct text runs are very likely table rows
  // (a sentence is usually one continuous run per line from pdf.js).
  if (nonEmptyItems.length > 2) {
    return false;
  }
  
  const minX = Math.min(...nonEmptyItems.map((item) => item.x));
  const maxX = Math.max(...nonEmptyItems.map((item) => item.x + item.width));
  const span = maxX - minX;
  
  const isWide = pageWidth > 0 && span > pageWidth * 0.75;
  return isWide;
}

function segmentPdfTableRegions(lines: PdfTextLine[], pageWidth: number): PdfTextLine[][] {
  const candidateLines = lines.filter((line) => !isPdfProseLine(line, pageWidth));
  
  if (candidateLines.length === 0) {
    return [];
  }
  
  const gaps: number[] = [];
  for (let i = 1; i < candidateLines.length; ++i) {
    gaps.push(candidateLines[i - 1].y - candidateLines[i].y);
  }
  const typicalGap = median(gaps.filter((gap) => gap > 0));
  // Anything notably larger than the typical line-to-line spacing signals
  // a break between blocks (e.g. a table ending and a paragraph starting).
  const gapThreshold = typicalGap > 0 ? typicalGap * 2.5 : 20;
  
  const regions: PdfTextLine[][] = [];
  let current: PdfTextLine[] = [candidateLines[0]];
  
  for (let i = 1; i < candidateLines.length; ++i) {
    const gap = candidateLines[i - 1].y - candidateLines[i].y;
    if (gap > gapThreshold) {
      regions.push(current);
      current = [];
    }
    current.push(candidateLines[i]);
  }
  if (current.length > 0) {
    regions.push(current);
  }
  
  return regions;
}

// ---------------------------------------------------------------------------
// #1: Column detection from clustered x-positions across all rows
//
// Used as a fallback when a region doesn't have a usable ruling-line grid
// (see below). Gather the x-position of every text item in the region and
// cluster nearby values together, rather than trusting a single header line.
// ---------------------------------------------------------------------------

function looksLikePdfLabelText(text: string): boolean {
  return !/\d/.test(text);
}

function looksLikePdfRightAlignedText(text: string): boolean {
  const trimmed = text.trim();
  return /^(?:[+-]?\s*)?(?:R\$\s*)?[\d.,]+%?$/.test(trimmed) || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(trimmed);
}

function pdfColumnAnchor(item: PdfTextItem): number {
  return looksLikePdfRightAlignedText(item.text) ? item.x + item.width : item.x;
}

function clusterPdfColumns(lines: PdfTextLine[], xTolerance = 8): number[] {
  const xs = lines.flatMap((line) => line.items).filter((item) => item.text.trim().length > 0).map(pdfColumnAnchor).sort((a, b) => a - b);
  const centers: number[] = [];
  const counts: number[] = [];
  for (const x of xs) {
    const lastIdx = centers.length - 1;
    if (lastIdx < 0 || x - centers[lastIdx] > xTolerance) {
      centers.push(x);
      counts.push(1);
    } else {
      const n = counts[lastIdx];
      centers[lastIdx] = (centers[lastIdx] * n + x) / (n + 1);
      counts[lastIdx] = n + 1;
    }
  }
  return centers;
}

function findNearestPdfColumn(item: PdfTextItem, columns: PdfColumn[]): { columnIdx: number, ok: boolean } {
  const x = pdfColumnAnchor(item);
  let bestIdx = -1;
  let bestDistance = Infinity;
  for (let i = 0; i < columns.length; ++i) {
    const dist = Math.abs(x - columns[i].x);
    if (dist < bestDistance) {
      bestDistance = dist;
      bestIdx = i;
    }
  }
  return { columnIdx: bestIdx, ok: bestIdx !== -1 };
}

function pickPdfHeaderLine(lines: PdfTextLine[], columnXs: number[]): PdfTextLine {
  const dummyColumns: PdfColumn[] = columnXs.map((x) => ({ name: "", x, width: 0 }));
  
  type PdfHeaderCandidate = { line: PdfTextLine, coverage: number, looksLikeLabels: boolean };
  const candidates: PdfHeaderCandidate[] = [];
  
  for (const line of lines) {
    const matched = new Set<number>();
    let hasNumericCell = false;
    
    for (const item of line.items) {
      const text = item.text.trim();
      if (!text) {
        continue;
      }
      const { columnIdx, ok } = findNearestPdfColumn(item, dummyColumns);
      if (ok) {
        matched.add(columnIdx);
      }
      if (!looksLikePdfLabelText(text)) {
        hasNumericCell = true;
      }
    }
    
    candidates.push({ line, coverage: matched.size, looksLikeLabels: !hasNumericCell });
  }
  
  const maxCoverage = Math.max(...candidates.map((c) => c.coverage));
  
  // prefer a label-looking line whose coverage is at or near the best
  // score, since the actual header row's coverage can legitimately fall
  // a little short of a data row's (merged header cells touch fewer
  // distinct column positions than the values beneath them)
  const labelCandidate = candidates.find((c) => c.looksLikeLabels && c.coverage >= maxCoverage - 1);
  if (labelCandidate) {
    return labelCandidate.line;
  }
  
  const bestCandidate = candidates.find((c) => c.coverage === maxCoverage);
  return bestCandidate ? bestCandidate.line : lines[0];
}

function createPdfTableColumnsFromClusters(columnXs: number[], headerLine: PdfTextLine): PdfColumn[] {
  const defaultNames = columnXs.map((_, i) => `Column ${i + 1}`);
  const names = [...defaultNames];
  const dummyColumns: PdfColumn[] = columnXs.map((x, i) => ({ name: defaultNames[i], x, width: 0 }));
  
  for (const item of headerLine.items) {
    const text = item.text.trim();
    if (!text) {
      continue;
    }
    const { columnIdx, ok } = findNearestPdfColumn(item, dummyColumns);
    if (!ok) {
      continue;
    }
    names[columnIdx] = names[columnIdx] === defaultNames[columnIdx]
      ? text
      : `${names[columnIdx]} ${text}`;
  }
  
  return columnXs.map((x, i) => ({ name: names[i], x, width: 0 }));
}

function assignPdfLineToColumns(line: PdfTextLine, columns: PdfColumn[]): Record<string, string> {
  const values: Record<string, string> = {};
  
  for(const col of columns) {
    values[col.name] = "";
  }
  
  for(const item of line.items) { 
    const text = item.text.trim();
    if (!text) { 
      continue;
    }
    const { columnIdx, ok } = findNearestPdfColumn(item, columns);
    if (!ok) {
      return {};
    }
    
    const col = columns[columnIdx];
    const existing = values[col.name];
    
    // NOTE(erb): a single text can contain multiple pdf text items
    values[col.name] = (existing.length > 0 ? `${existing} ${text}` : text);
  }
  return values;
}

// ---------------------------------------------------------------------------
// Table title / caption detection
//
// A line like "III - Fluxo de Pagamento" sitting directly above a table is
// a section caption, not a header or data row. It's identifiable because it
// only ever touches a single column position instead of lining up across
// several — a real header/data row is expected to span multiple columns.
// ---------------------------------------------------------------------------

function extractPdfLeadingTitle(lines: PdfTextLine[], columnXs: number[]): { title: string | null, rest: PdfTextLine[] } {
  if (lines.length < 3 || columnXs.length <= 2) {
    return { title: null, rest: lines };
  }
  
  const dummyColumns: PdfColumn[] = columnXs.map((x) => ({ name: "", x, width: 0 }));
  const titleParts: string[] = [];
  let consumed = 0;
  
  for (const line of lines) {
    // never consume so many leading lines that nothing is left to serve
    // as a header/row; a real table needs at least those two
    if (lines.length - consumed <= 2) {
      break;
    }
    
    const nonEmpty = line.items.filter((item) => item.text.trim().length > 0);
    if (nonEmpty.length === 0 || nonEmpty.length > 2) {
      break;
    }
    
    const matched = new Set<number>();
    for (const item of nonEmpty) {
      const { columnIdx, ok } = findNearestPdfColumn(item, dummyColumns);
      if (ok) {
        matched.add(columnIdx);
      }
    }
    
    if (matched.size > 1) {
      break;
    }
    
    titleParts.push(nonEmpty.map((item) => item.text.trim()).join(" "));
    consumed += 1;
  }
  
  if (consumed === 0) {
    return { title: null, rest: lines };
  }
  
  return { title: titleParts.join(" "), rest: lines.slice(consumed) };
}

function parsePdfTableFromTextClustering(lines: PdfTextLine[], page: number, xTolerance: number): PdfTable | null {
  const initialColumnXs = clusterPdfColumns(lines, xTolerance);
  if (initialColumnXs.length === 0) {
    return null;
  }
  
  const { title, rest } = extractPdfLeadingTitle(lines, initialColumnXs);
  const workingLines = title ? rest : lines;
  
  if (workingLines.length < 2) {
    return null;
  }
  
  // recluster after stripping the title, since its lone item can otherwise
  // skew where a nearby cluster center lands
  const columnXs = title ? clusterPdfColumns(workingLines, xTolerance) : initialColumnXs;
  if (columnXs.length === 0) {
    return null;
  }
  
  const headerLine = pickPdfHeaderLine(workingLines, columnXs);
  const columns = createPdfTableColumnsFromClusters(columnXs, headerLine);
  
  const rows: PdfRow[] = [];
  for(const line of workingLines) {
    if (line === headerLine) {
      continue;
    }
    const values = assignPdfLineToColumns(line, columns);
    
    const isEmpty = Object.values(values).every(value => (value === ""));
    if(isEmpty) {
      continue;
    }
    
    rows.push({ values });
  }
  
  if (rows.length === 0) {
    return null;
  }
  
  const table: PdfTable = { page, columns, rows };
  return title ? { ...table, title } : table;
}

// ---------------------------------------------------------------------------
// #3: Ruling-line / grid-based table parsing
//
// When the PDF actually draws a grid (borders around cells, or shaded row
// rectangles), that grid is a much more reliable source of column/row
// boundaries than inferring them from where text happens to sit. We look
// for enough vertical and horizontal rulings overlapping a region to form a
// real grid; if we don't find one, callers fall back to the text-position
// heuristic above.
// ---------------------------------------------------------------------------

export type PdfGrid = {
  // x positions of column boundaries, ascending
  vertical: number[];
  // y positions of row boundaries, descending (top to bottom)
  horizontal: number[];
}

function mergeClosePositions(values: number[], tolerance = 3): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const merged: number[] = [];
  for (const v of sorted) {
    const last = merged[merged.length - 1];
    if (last === undefined || v - last > tolerance) {
      merged.push(v);
    }
  }
  return merged;
}

function findPdfGridForRegion(lines: PdfTextLine[], rulings: PdfRuling[]): PdfGrid | null {
  if (lines.length === 0 || rulings.length === 0) {
    return null;
  }
  
  const ys = lines.map((line) => line.y);
  const top = Math.max(...ys) + 6; // small margin above the topmost text line
  const bottom = Math.min(...ys) - 6;
  const bandHeight = top - bottom;
  
  const xs = lines.flatMap((line) => line.items.map((item) => item.x));
  const rights = lines.flatMap((line) => line.items.map((item) => item.x + item.width));
  const left = xs.length ? Math.min(...xs) - 6 : 0;
  const right = rights.length ? Math.max(...rights) + 6 : 0;
  const rowSpan = right - left;
  
  if (bandHeight <= 0 || rowSpan <= 0) {
    return null;
  }
  
  // vertical rulings that run through a meaningful chunk of this region's
  // row band (not just a stray short tick mark)
  const vCandidates = rulings.filter((r) => {
                                       if (r.orientation !== "v") {
                                         return false;
                                       }
                                       const overlap = Math.min(r.end, top) - Math.max(r.start, bottom);
                                       return overlap > bandHeight * 0.4;
                                     });
  
  // horizontal rulings that cross a meaningful chunk of the region's
  // column span, and actually fall within the region vertically
  const hCandidates = rulings.filter((r) => {
                                       if (r.orientation !== "h") {
                                         return false;
                                       }
                                       if (r.pos > top + 4 || r.pos < bottom - 4) {
                                         return false;
                                       }
                                       const overlap = Math.min(r.end, right) - Math.max(r.start, left);
                                       return overlap > rowSpan * 0.4;
                                     });
  
  if (vCandidates.length < 2 || hCandidates.length < 2) {
    return null;
  }
  
  const vertical = mergeClosePositions(vCandidates.map((r) => r.pos));
  const horizontal = mergeClosePositions(hCandidates.map((r) => r.pos)).sort((a, b) => b - a);
  
  if (vertical.length < 2 || horizontal.length < 2) {
    return null;
  }
  
  return { vertical, horizontal };
}

type PdfGridColumnGroup = { start: number; end: number; name: string; x: number; width: number; };

function buildPdfColumnsFromGrid(vertical: number[]): PdfColumn[] {
  const columns: PdfColumn[] = [];
  for (let i = 0; i < vertical.length - 1; ++i) {
    const x0 = vertical[i];
    const x1 = vertical[i + 1];
    columns.push({ name: `Column ${i + 1}`, x: (x0 + x1) / 2, width: x1 - x0 });
  }
  return columns;
}

function assignPdfItemToGridColumn(x: number, vertical: number[]): number {
  for (let i = 0; i < vertical.length - 1; ++i) {
    if (x >= vertical[i] - 2 && x < vertical[i + 1] + 2) return i;
  }
  return -1;
}

function pdfVerticalRulingCrossesBand(rulings: PdfRuling[], x: number, top: number, bottom: number): boolean {
  const bandHeight = Math.max(0, top - bottom);
  return rulings.some((r) => r.orientation === "v" && Math.abs(r.pos - x) <= 3 && Math.min(r.end, top) - Math.max(r.start, bottom) > bandHeight * 0.5);
}

function buildPdfLogicalGridColumns(vertical: number[], rulings: PdfRuling[], headerTop: number, headerBottom: number, headerLines: PdfTextLine[]): { columns: PdfColumn[]; physicalToLogical: number[]; } {
  const physical = buildPdfColumnsFromGrid(vertical);
  const groups: PdfGridColumnGroup[] = [];
  const physicalToLogical = new Array<number>(physical.length).fill(-1);
  let groupStart = 0;
  
  for (let i = 0; i < physical.length; ++i) {
    const last = i === physical.length - 1;
    const splitHere = last || pdfVerticalRulingCrossesBand(rulings, vertical[i + 1], headerTop, headerBottom);
    if (!splitHere) continue;
    const groupIndex = groups.length;
    groups.push({ start: groupStart, end: i, name: `Column ${groupIndex + 1}`, x: (vertical[groupStart] + vertical[i + 1]) / 2, width: vertical[i + 1] - vertical[groupStart] });
    for (let c = groupStart; c <= i; ++c) physicalToLogical[c] = groupIndex;
    groupStart = i + 1;
  }
  
  for (const line of headerLines) {
    for (const item of line.items) {
      const text = item.text.trim();
      if (!text) continue;
      const physicalIdx = assignPdfItemToGridColumn(item.x, vertical);
      if (physicalIdx === -1) continue;
      const logicalIdx = physicalToLogical[physicalIdx];
      if (logicalIdx === undefined || logicalIdx < 0) continue;
      const group = groups[logicalIdx];
      group.name = group.name.startsWith("Column ") ? text : `${group.name} ${text}`;
    }
  }
  
  return { columns: groups.map((group) => ({ name: group.name, x: group.x, width: group.width })), physicalToLogical };
}

function parsePdfTableFromGrid(lines: PdfTextLine[], grid: PdfGrid, rulings: PdfRuling[], page: number): PdfTable | null {
  const { vertical, horizontal } = grid;
  const physicalColumns = buildPdfColumnsFromGrid(vertical);
  if (physicalColumns.length === 0) return null;
  
  const bands: PdfTextLine[][] = horizontal.slice(0, -1).map(() => []);
  for (const line of lines) {
    for (let i = 0; i < horizontal.length - 1; ++i) {
      const bandTop = horizontal[i];
      const bandBottom = horizontal[i + 1];
      if (line.y <= bandTop + 2 && line.y >= bandBottom - 2) { bands[i].push(line); break; }
    }
  }
  
  const bandValues: Record<string, string>[] = bands.map((bandLines) => {
                                                           const values: Record<string, string> = {};
                                                           for (const col of physicalColumns) values[col.name] = "";
                                                           for (const line of [...bandLines].sort((a, b) => b.y - a.y)) {
                                                             for (const item of line.items) {
                                                               const text = item.text.trim();
                                                               if (!text) continue;
                                                               const colIdx = assignPdfItemToGridColumn(item.x, vertical);
                                                               if (colIdx === -1) continue;
                                                               const col = physicalColumns[colIdx];
                                                               values[col.name] = values[col.name] ? `${values[col.name]} ${text}` : text;
                                                             }
                                                           }
                                                           return values;
                                                         });
  
  const nonEmptyBandIndices = bandValues.map((values, idx) => ({ idx, hasContent: Object.values(values).some((v) => v !== "") })).filter((entry) => entry.hasContent).map((entry) => entry.idx);
  if (nonEmptyBandIndices.length === 0) return null;
  
  const searchWindow = nonEmptyBandIndices.slice(0, 3);
  const labelBandIdx = searchWindow.find((idx) => {
                                           const values = Object.values(bandValues[idx]).filter((v) => v !== "");
                                           return values.length > 0 && values.every((v) => looksLikePdfLabelText(v));
                                         });
  const headerIdx = labelBandIdx !== undefined ? labelBandIdx : nonEmptyBandIndices[0];
  
  const { columns, physicalToLogical } = buildPdfLogicalGridColumns(vertical, rulings, horizontal[headerIdx], horizontal[headerIdx + 1], bands[headerIdx]);
  if (columns.length === 0) return null;
  
  const finalBandValues: Record<string, string>[] = bands.map((bandLines) => {
                                                                const values: Record<string, string> = {};
                                                                for (const col of columns) values[col.name] = "";
                                                                for (const line of bandLines) {
                                                                  for (const item of line.items) {
                                                                    const text = item.text.trim();
                                                                    if (!text) continue;
                                                                    const physicalIdx = assignPdfItemToGridColumn(item.x, vertical);
                                                                    if (physicalIdx === -1) continue;
                                                                    const logicalIdx = physicalToLogical[physicalIdx];
                                                                    if (logicalIdx === undefined || logicalIdx < 0 || logicalIdx >= columns.length) continue;
                                                                    const col = columns[logicalIdx];
                                                                    values[col.name] = values[col.name] ? `${values[col.name]} ${text}` : text;
                                                                  }
                                                                }
                                                                return values;
                                                              });
  
  const rows: PdfRow[] = [];
  for (let i = 0; i < finalBandValues.length; ++i) {
    if (i === headerIdx) continue;
    const values = finalBandValues[i];
    if (Object.values(values).every((value) => value === "")) continue;
    rows.push({ values });
  }
  if (rows.length === 0) return null;
  return { page, columns, rows };
}

function extractPdfGridTitle(lines: PdfTextLine[], grid: PdfGrid): string | null {
  // any text line sitting above the grid's topmost ruling is, by
  // construction, outside every row band and reads as a caption
  const top = grid.horizontal[0];
  const aboveLines = lines.filter((line) => line.y > top + 2);
  if (aboveLines.length === 0) {
    return null;
  }
  
  const sorted = [...aboveLines].sort((a, b) => b.y - a.y);
  const text = sorted
    .map((line) => line.items.map((item) => item.text.trim()).filter(Boolean).join(" "))
    .filter(Boolean)
    .join(" ");
  
  return text.length > 0 ? text : null;
}

function parsePdfTable(lines: PdfTextLine[], page: number, rulings: PdfRuling[], options: PdfTableOptions = {}): PdfTable | null {
  const { xTolerance = 8 } = options;
  
  if(lines.length < 2) {
    return null;
  }
  
  const grid = findPdfGridForRegion(lines, rulings);
  if (grid) {
    const table = parsePdfTableFromGrid(lines, grid, rulings, page);
    if (table) {
      const title = extractPdfGridTitle(lines, grid);
      return title ? { ...table, title } : table;
    }
    // a grid was detected but didn't produce a usable table (e.g. rulings
    // that don't actually correspond to a text-bearing table); fall back
    // to the text-position heuristic rather than dropping the region
  }
  
  return parsePdfTableFromTextClustering(lines, page, xTolerance);
}

export async function parsePdf(buffer: ArrayBuffer, options: PdfTableOptions = {}): Promise<PdfDocument> {
  const { yTolerance = 3, xTolerance = 8 } = options;
  const rawPages = await extractPdfText(buffer);
  
  const parsedPages: PdfPage[] = [];
  
  for(let i = 0; i < rawPages.length; ++i) {
    const pageNumber = (i+1);
    const { items, width, rulings } = rawPages[i];
    
    const lines = groupPdfTextIntoLines(items, yTolerance);
    const regions = segmentPdfTableRegions(lines, width);
    
    const tables: PdfTable[] = [];
    for (const region of regions) {
      const table = parsePdfTable(region, pageNumber, rulings, { xTolerance });
      if (table) {
        tables.push(table);
      }
    }
    parsedPages.push({ page: pageNumber, tables });
  }
  
  return { pages: parsedPages, };
}