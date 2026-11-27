import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";
import { describe, expect, it } from "vitest";

import { TYPE_MESSAGE_KEY } from "@/components/project/item-icon";
import { CURRENCY_OPTIONS } from "@/lib/pdf-report";
import { RESULT_COLUMNS } from "@/lib/results";
import { routing } from "./routing";

const root = fileURLToPath(new URL("../../", import.meta.url));

type Messages = { [key: string]: string | Messages };

const load = (locale: string): Messages => JSON.parse(fs.readFileSync(path.join(root, "messages", `${locale}.json`), "utf8"));

function flatten(messages: Messages, prefix = ""): Map<string, string> {
  const flat = new Map<string, string>();
  for (const [key, value] of Object.entries(messages)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") flat.set(full, value);
    else for (const [nested, text] of flatten(value, full)) flat.set(nested, text);
  }
  return flat;
}

// Every argument name and rich-text tag a message uses, including those
// inside plural/select branches.
function placeholders(elements: MessageFormatElement[], found = new Set<string>()): Set<string> {
  for (const element of elements) {
    switch (element.type) {
      case TYPE.argument:
      case TYPE.number:
      case TYPE.date:
      case TYPE.time:
        found.add(element.value);
        break;
      case TYPE.select:
      case TYPE.plural:
        found.add(element.value);
        for (const option of Object.values(element.options)) placeholders(option.value, found);
        break;
      case TYPE.tag:
        found.add(`<${element.value}>`);
        placeholders(element.children, found);
        break;
    }
  }
  return found;
}

const sorted = (values: Iterable<string>) => [...values].sort();

const locales = routing.locales;
const source = flatten(load(routing.defaultLocale));

describe("message files", () => {
  it("exist for every locale the router supports", () => {
    for (const locale of locales) expect(fs.existsSync(path.join(root, "messages", `${locale}.json`)), `messages/${locale}.json`).toBe(true);
  });

  describe.each(locales.filter((locale) => locale !== routing.defaultLocale))("%s", (locale) => {
    const translated = flatten(load(locale));

    it("has exactly the same keys as the default language", () => {
      expect(sorted(source.keys()).filter((key) => !translated.has(key)), "keys missing from this locale").toEqual([]);
      expect(sorted(translated.keys()).filter((key) => !source.has(key)), "keys not in the default locale").toEqual([]);
    });

    it("uses the same placeholders and tags as the default language in every message", () => {
      const mismatches: string[] = [];
      for (const [key, text] of source) {
        const other = translated.get(key);
        if (other === undefined) continue;
        const expected = sorted(placeholders(parse(text)));
        const actual = sorted(placeholders(parse(other)));
        if (expected.join() !== actual.join()) mismatches.push(`${key}: expected {${expected}} but found {${actual}}`);
      }
      expect(mismatches).toEqual([]);
    });
  });

  describe.each(locales)("%s", (locale) => {
    const messages = flatten(load(locale));

    it("has no empty messages", () => {
      expect([...messages].filter(([, text]) => text.trim() === "").map(([key]) => key)).toEqual([]);
    });

    it("contains only valid ICU message syntax", () => {
      const invalid: string[] = [];
      for (const [key, text] of messages) {
        try {
          parse(text);
        } catch (error) {
          invalid.push(`${key}: ${(error as Error).message}`);
        }
      }
      expect(invalid).toEqual([]);
    });
  });
});

describe("message keys used by the code", () => {
  const listSourceFiles = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === "test" ? [] : listSourceFiles(full);
      return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
    });

  it("all exist in the default language", () => {
    // any quoted string that starts with one of the top-level message
    // namespaces is a message key (template strings with ${} are skipped)
    const namespaces = [...new Set([...source.keys()].map((key) => key.split(".")[0]))];
    const keyPattern = new RegExp(`["'\`]((?:${namespaces.join("|")})\\.[A-Za-z][\\w.]*)["'\`]`, "g");

    const missing: string[] = [];
    for (const file of listSourceFiles(path.join(root, "src"))) {
      for (const match of fs.readFileSync(file, "utf8").matchAll(keyPattern)) {
        if (!source.has(match[1])) missing.push(`${path.relative(root, file)}: ${match[1]}`);
      }
    }

    expect(missing).toEqual([]);
  });

  // Some keys are assembled at runtime (`frequency.${unit}`), which the scan
  // above can't see, so each family is checked against the real list it's
  // built from instead.
  it("cover every result column, currency, item type, frequency unit and chart region", () => {
    const expected = [
      ...RESULT_COLUMNS.flatMap((column) => [`resultsTable.columns.${column.key}`, ...(column.titleKey ? [`resultsTable.columns.${column.titleKey}`] : [])]),
      ...CURRENCY_OPTIONS.map((option) => `pdfReport.currency.${option.code.toLowerCase()}`),
      ...Object.values(TYPE_MESSAGE_KEY).flatMap((type) => [`addItemDialog.types.${type}.label`, `addItemDialog.types.${type}.description`]),
      ...["days", "weeks", "months", "years"].flatMap((unit) => [`frequency.${unit}`, `addItemDialog.manual.frequencyAnchor.${unit}`]),
      ...["simple", "compound", "series"].map((kind) => `chart.regions.${kind}`),
    ];

    expect(expected.filter((key) => !source.has(key))).toEqual([]);
  });
});
