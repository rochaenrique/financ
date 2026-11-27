import { createFormatter } from "next-intl";
import { describe, expect, it } from "vitest";

import { countSchedule, day, fixedValue, rateIndex, rangeSchedule, source } from "@/test/fixtures";
import type { Project } from "./projects";
import { CURRENCY_OPTIONS, currencyOptionLabel, generateProjectReportPdf, type ReportConfig, type ReportI18n } from "./pdf-report";

// Message keys stand in for translations, so assertions can look for the
// exact key a section heading is built from.
const format = createFormatter({ locale: "en" });
const i18n: ReportI18n = {
  t: (key, values) => (values ? `${key} ${JSON.stringify(values)}` : key),
  formatNumber: format.number,
  formatDate: format.dateTime,
};

const bankA = source(
  [
    fixedValue(1000, countSchedule(day(2024, 1, 1), 2)),
    rateIndex("compound-index", 1, rangeSchedule(day(2024, 1, 1), day(2024, 3, 1))),
  ],
  "Bank A",
);
const bankB = source([fixedValue(500, countSchedule(day(2024, 1, 1), 1))], "Bank B");
const project: Project = { id: "p1", name: "Home Loan", modified: "2024-01-01T00:00:00.000Z", sources: [bankA, bankB] };

const baseConfig: ReportConfig = {
  includedSourceIds: new Set([bankA.id, bankB.id]),
  columns: new Set(["raw", "vam"]),
  showGraph: true,
  showSourceSummaries: true,
  currency: "NONE",
  includeToc: false,
};

// jsPDF writes uncompressed content streams, so the drawn text is readable
// straight out of the file.
const render = async (config: Partial<ReportConfig> = {}) => {
  const blob = await generateProjectReportPdf(project, { ...baseConfig, ...config }, i18n);
  return { blob, text: await blob.text() };
};

describe("generateProjectReportPdf", () => {
  it("produces a PDF titled with the project name", async () => {
    const { blob, text } = await render();

    expect(blob.type).toBe("application/pdf");
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text).toContain("(Home Loan)");
    expect(text).toContain("pdfReport.generatedOn");
  });

  it("includes every section that was asked for", async () => {
    const { text } = await render();

    expect(text).toContain("(pdfReport.summaryTable)");
    expect(text).toContain("(pdfReport.chart)");
    expect(text).toContain("(pdfReport.sourceSummaries)");
    expect(text).toContain("(Bank A)");
    expect(text).toContain("(Bank B)");
  });

  it("leaves out the sections that were turned off", async () => {
    const { text } = await render({ showGraph: false, showSourceSummaries: false });

    expect(text).toContain("(pdfReport.summaryTable)");
    expect(text).not.toContain("(pdfReport.chart)");
    expect(text).not.toContain("(pdfReport.sourceSummaries)");
  });

  it("adds a table of contents only when requested", async () => {
    expect((await render({ includeToc: false })).text).not.toContain("(pdfReport.tableOfContents)");
    expect((await render({ includeToc: true })).text).toContain("(pdfReport.tableOfContents)");
  });

  it("shows only the selected columns, with locale-formatted values", async () => {
    const { text } = await render({ columns: new Set(["raw"]) });

    expect(text).toContain("(resultsTable.columns.raw)");
    expect(text).not.toContain("(resultsTable.columns.vam)");
    expect(text).toContain("(2,000.00)"); // Bank A: 2 x 1000
    expect(text).toContain("(500.00)");
  });

  it("only reports on the sources that were selected", async () => {
    const { text } = await render({ includedSourceIds: new Set([bankB.id]) });

    expect(text).toContain("(Bank B)");
    expect(text).not.toContain("(Bank A)");
  });

  it("prefixes money columns with the chosen currency symbol", async () => {
    const { text } = await render({ currency: "BRL", columns: new Set(["raw", "itemCount"]) });

    expect(text).toContain("(R$2,000.00)");
    expect(text).toContain("(2)"); // item count stays a plain number
    expect(text).not.toContain("R$2)");
  });

  it("puts the sign before the currency symbol on differences", async () => {
    const { text } = await render({ currency: "USD", columns: new Set(["comparedRaw"]) });

    expect(text).toContain("(+$1,500.00)");
  });

  it("still produces a valid PDF when nothing is selected", async () => {
    const { text } = await render({ includedSourceIds: new Set(), columns: new Set(), showGraph: true });

    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text).toContain("(Home Loan)");
    expect(text).not.toContain("(pdfReport.summaryTable)");
  });
});

describe("currency options", () => {
  it("offers a symbol-less 'no currency' choice first", () => {
    expect(CURRENCY_OPTIONS[0]).toEqual({ code: "NONE", symbol: "" });
  });

  it("only uses symbols the PDF's built-in fonts can draw", () => {
    // WinAnsi (CP1252) covers Latin-1 plus a few extras; anything outside it
    // would come out as garbage glyphs in the report
    for (const { symbol } of CURRENCY_OPTIONS) expect(symbol).toMatch(/^[ -~ -ÿ€]*$/);
  });

  it("labels each option under its own message key", () => {
    const eur = CURRENCY_OPTIONS.find((option) => option.code === "EUR")!;

    expect(currencyOptionLabel((key) => key, eur)).toBe("pdfReport.currency.eur");
  });
});
