import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PdfSelectedDataset } from "@/components/project/pdf-import-dialog";
import { getItemsFromDataset, getItemsFromDatasets, getSourcedFromDatasets } from "./pdf-datasets";

const dataset = (columnNames: string[], rows: Record<string, string>[], title?: string): PdfSelectedDataset => ({
  page: 1,
  tableIndex: 0,
  title,
  columns: columnNames.map((name, i) => ({ name, x: i * 100, width: 100 })),
  rows,
});

// The converter reports why it rejected a table via console.error; silence
// it so expected failures don't clutter the test output.
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("getItemsFromDataset", () => {
  it("turns a date column and a value column into one timed series", () => {
    const items = getItemsFromDataset(
      dataset(["Data", "Parcela"], [
        { Data: "15/01/2024", Parcela: "1.000,00" },
        { Data: "15/02/2024", Parcela: "2.000,50" },
      ]),
    );

    expect(items).toHaveLength(1);
    expect(items[0].data).toEqual({
      type: "timed-values",
      times: [new Date(2024, 0, 15), new Date(2024, 1, 15)],
      values: [1000, 2000.5],
    });
  });

  it("creates one series per numeric column", () => {
    const items = getItemsFromDataset(
      dataset(["Data", "Principal", "Juros"], [
        { Data: "15/01/2024", Principal: "100,00", Juros: "5,00" },
        { Data: "15/02/2024", Principal: "100,00", Juros: "4,50" },
      ]),
    );

    expect(items.map((item) => (item.data.type === "timed-values" ? item.data.values : null))).toEqual([
      [100, 100],
      [5, 4.5],
    ]);
  });

  it("gives every item its own id", () => {
    const items = getItemsFromDataset(dataset(["Data", "A", "B"], [{ Data: "01/01/2024", A: "1", B: "2" }]));

    expect(new Set(items.map((item) => item.id)).size).toBe(2);
  });

  it("drops a trailing row that is blank (a table footer or page break)", () => {
    const items = getItemsFromDataset(
      dataset(["Data", "Valor"], [
        { Data: "01/01/2024", Valor: "10,00" },
        { Data: "01/02/2024", Valor: "20,00" },
        { Data: "", Valor: "" },
      ]),
    );

    expect(items[0].data).toMatchObject({ values: [10, 20] });
  });

  it("skips a column with text in it but keeps the numeric ones", () => {
    const items = getItemsFromDataset(
      dataset(["Data", "Valor", "Observação"], [
        { Data: "01/01/2024", Valor: "10,00", Observação: "quitado" },
        { Data: "01/02/2024", Valor: "20,00", Observação: "em aberto" },
      ]),
    );

    expect(items).toHaveLength(1);
    expect(items[0].data).toMatchObject({ values: [10, 20] });
  });

  it("rejects a table with no date column", () => {
    expect(getItemsFromDataset(dataset(["A", "B"], [{ A: "1,00", B: "2,00" }]))).toEqual([]);
  });

  it("rejects a table with more than one date column, since it can't tell which is the timeline", () => {
    const rows = [{ Inicio: "01/01/2024", Fim: "01/02/2024", Valor: "5,00" }];

    expect(getItemsFromDataset(dataset(["Inicio", "Fim", "Valor"], rows))).toEqual([]);
  });

  it("rejects tables that are too small to hold a series", () => {
    expect(getItemsFromDataset(dataset(["Data"], [{ Data: "01/01/2024" }]))).toEqual([]);
    expect(getItemsFromDataset(dataset(["Data", "Valor"], []))).toEqual([]);
  });

  it("rejects a table when none of its other columns is numeric", () => {
    expect(getItemsFromDataset(dataset(["Data", "Nota"], [{ Data: "01/01/2024", Nota: "ok" }]))).toEqual([]);
  });
});

describe("getItemsFromDatasets", () => {
  it("flattens the items of every dataset, ignoring the unusable ones", () => {
    const good = dataset(["Data", "Valor"], [{ Data: "01/01/2024", Valor: "1,00" }]);
    const bad = dataset(["A", "B"], [{ A: "x", B: "y" }]);

    expect(getItemsFromDatasets([good, bad, good])).toHaveLength(2);
  });
});

describe("getSourcedFromDatasets", () => {
  it("creates one source per usable dataset, named after its table", () => {
    const sources = getSourcedFromDatasets([
      dataset(["Data", "Valor"], [{ Data: "01/01/2024", Valor: "1,00" }], "Amortização"),
      dataset(["Data", "Valor"], [{ Data: "01/01/2024", Valor: "2,00" }]),
    ]);

    expect(sources.map((s) => s.name)).toEqual(["Amortização", "Imported Data"]);
    expect(sources[0].color).toMatch(/^#[0-9a-f]{6}$/);
    expect(sources[0].items).toHaveLength(1);
  });

  it("skips datasets that produce no items", () => {
    expect(getSourcedFromDatasets([dataset(["A", "B"], [{ A: "x", B: "y" }])])).toEqual([]);
  });
});
