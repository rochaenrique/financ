import type { PdfSelectedDataset } from "@/components/project/pdf-import-dialog"
import type { ProjectItem, ProjectSource } from "@/lib/projects"
import { parseImportedDate, parseImportedNumber } from "@/lib/utils"

export function getItemsFromDataset(data: PdfSelectedDataset): ProjectItem[] {
  if (data.rows.length === 0 || data.columns.length < 2) {
    console.error("Imported dataset does not contain enough data.");
    return [];
  }
  
  const dateColumns: string[] = [];
  
  for (const column of data.columns) {
    let validDateCount = 0;
    let nonEmptyCount = 0;
    
    for (const row of data.rows) {
      const rawValue = row[column.name]?.trim();
      if (!rawValue) continue;
      
      nonEmptyCount++;
      
      if (parseImportedDate(rawValue) !== null) {
        validDateCount++;
      }
    }
    
    if (nonEmptyCount > 0 && validDateCount === nonEmptyCount) {
      dateColumns.push(column.name);
    }
  }
  
  if (dateColumns.length !== 1) {
    console.error(`Expected exactly one date column, found ${dateColumns.length}:`, dateColumns);
    return [];
  }
  
  const timeColumnKey = dateColumns[0];
  const times: Date[] = [];
  
  let isLastRowValid = true;
  if(data.rows.length > 0) {
    const lastRow = data.rows[data.rows.length-1];
    for (const column of data.columns) {
      const v = lastRow[column.name];
      if (v.length === 0) {
        isLastRowValid = false;
        break;
      }
    }
  }
  
  const validRowsCount = isLastRowValid ? data.rows.length : data.rows.length-1;
  
  for (let rowIdx = 0; rowIdx < validRowsCount; rowIdx++) {
    const row = data.rows[rowIdx];
    if(rowIdx < data.rows.length-1 || isLastRowValid) {
      const date = parseImportedDate(row[timeColumnKey] ?? "");
      if (date === null) {
        console.error(`Invalid date "${row[timeColumnKey]}" in column "${timeColumnKey}".`);
        times.length = 0;
        break;
      }
      times.push(date);
    }
  }
  
  if (times.length !== validRowsCount) {
    return [];
  }
  
  const newItems: ProjectItem[] = [];
  
  for (const column of data.columns) {
    if (column.name === timeColumnKey) {
      continue;
    }
    
    const values: number[] = [];
    let valid = true;
    
    for (let rowIdx = 0; rowIdx < validRowsCount; rowIdx++) {
      const row = data.rows[rowIdx];
      const rawValue = row[column.name] ?? "";
      const value = parseImportedNumber(rawValue);
      
      if (value === null) {
        valid = false;
        console.error(`Column "${column.name}" contains a non-numeric value: "${rawValue}".`);
        break;
      }
      
      values.push(value);
    }
    
    if (!valid) {
      continue;
    }
    
    newItems.push({
                    id: crypto.randomUUID(),
                    data: {
                      type: "timed-values",
                      times: [...times],
                      values,
                    },
                  });
  }
  
  if (newItems.length === 0) {
    console.error(`Dataset "${data.title ?? "Unnamed table"}" did not contain any usable numeric columns.`);
    return [];
  }
  
  return newItems;
}

// Flattens every selected PDF table into a single list of ProjectItems --
// e.g. for adding several new timed-values items onto one existing source,
// as opposed to getSourcedFromDatasets below, which creates a new source
// per dataset.
export function getItemsFromDatasets(datasets: PdfSelectedDataset[]): ProjectItem[] {
  return datasets.flatMap(getItemsFromDataset);
}

export function getSourcedFromDatasets(datasets: PdfSelectedDataset[]): ProjectSource[] {
  const newSources: ProjectSource[] = [];
  
  for (const data of datasets) {
    const newItems = getItemsFromDataset(data);
    if(newItems.length === 0) { 
      console.error("Empty items from dataset");
      continue; 
    }
    
    const color = `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0")}`;
    
    newSources.push({
                      id: crypto.randomUUID(),
                      name: data.title ?? "Imported Data",
                      color,
                      items: newItems,
                    });
  }
  
  if (newSources.length === 0) {
    console.error("No usable datasets were imported.");
  }
  
  return newSources;
}