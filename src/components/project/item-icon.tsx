"use client"

import {
  Table2,
  ChartNoAxesCombined,
  Percent,
  List,
  TrendingUp,
} from "lucide-react"

import type { ProjectItemData } from "@/lib/projects"

// Suffix under the `addItemDialog.types.*` message namespace for each item
// type -- shared by every place that needs a translated display name for a
// type, alongside this file's icon-per-type mapping.
export const TYPE_MESSAGE_KEY: Record<ProjectItemData["type"], string> = {
  "timed-values": "timedValues",
  "index-series": "indexSeries",
  "compound-index": "compoundIndex",
  "simple-index": "simpleIndex",
  "fixed-value": "fixedValue",
};

export function ItemIcon({ type }: { type: ProjectItemData["type"] }) {
  switch (type) {
    case "timed-values":
    return (<Table2 className="h-4 w-4" />);

    case "compound-index":
    return (<ChartNoAxesCombined className="h-4 w-4" />);

    case "fixed-value":
    return (<List className="h-4 w-4" />);

    case "simple-index":
    return (<Percent className="h-4 w-4" />);

    case "index-series":
    return (<TrendingUp className="h-4 w-4" />);
  }
}