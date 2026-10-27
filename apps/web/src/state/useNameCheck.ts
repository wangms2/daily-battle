// Whether a name someone is picking is already protected (DESIGN.md §10.1), asked
// a moment after they stop typing. Offline, the name is allowed: nothing blocks
// play, and protecting it later checks again.
import { useEffect, useState } from 'react';
import { nameTaken } from './account';

const WAIT_MS = 350;

/** 'taken' once the server says so for `name`; 'ok' otherwise (and while checking). */
export function useNameCheck(name: string | null, own?: string | null): 'ok' | 'taken' {
  const [taken, setTaken] = useState<string | null>(null);
  useEffect(() => {
    if (!name) return;
    let live = true;
    const t = setTimeout(() => {
      void nameTaken(name).then((v) => {
        if (live && v) setTaken(name);
      });
    }, WAIT_MS);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [name]);
  const same = (a?: string | null, b?: string | null) =>
    !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
  // Your own protected name isn't taken from you.
  return name && same(taken, name) && !same(name, own) ? 'taken' : 'ok';
}
