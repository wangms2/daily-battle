// Pokédex entries (scripts/flavor.ts), for wide screens only: loaded on first
// use, so phones never download them.
import { useEffect, useState } from 'react';

type Flavor = Record<string, string>;
let loaded: Flavor | null = null;
let loading: Promise<Flavor> | null = null;

const load = () =>
  (loading ??= import('./flavor.json').then((m) => (loaded = m.default as Flavor)));

/** A species' Pokédex entry, once loaded (undefined until then, or if it has none). */
export function useFlavor(species: string | null): string | undefined {
  const [flavor, setFlavor] = useState<Flavor | null>(loaded);
  useEffect(() => {
    if (!flavor) void load().then(setFlavor, () => {});
  }, [flavor]);
  return species ? flavor?.[species] : undefined;
}
