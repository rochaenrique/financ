import { useMemo, useSyncExternalStore } from "react";

import { getProjectIndexSnapshot, getProjectSnapshot, parseProjectIndex, parseStoredProject, subscribeToStorage, type Project } from "./projects";

// During server rendering (and the hydration pass that must match it) there
// is no localStorage to read. `undefined` means "not loaded yet", which is
// distinct from `null` / `[]` ("loaded, and nothing is there").
const loadingSnapshot = (): undefined => undefined;

export function useProjectIndex(): Project[] | undefined {
  const raw = useSyncExternalStore<string | null | undefined>(subscribeToStorage, getProjectIndexSnapshot, loadingSnapshot);
  return useMemo(() => (raw === undefined ? undefined : parseProjectIndex(raw)), [raw]);
}

export function useProject(id: string): Project | null | undefined {
  const raw = useSyncExternalStore<string | null | undefined>(subscribeToStorage, () => getProjectSnapshot(id), loadingSnapshot);
  return useMemo(() => (raw === undefined ? undefined : parseStoredProject(raw)), [raw]);
}
