// Parity: the WASM forward pass (rust/src/net.rs) vs PyTorch's outputs on the
// same observations. Needs a local export (cd tools/net; python export.py),
// which isn't committed, so this skips without one.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NET_OBS, type NetInput } from './index';
import { engineBuilt, loadEngine } from './node';

const dir = fileURLToPath(new URL('../../../tools/net/data/export/', import.meta.url));
const weights = `${dir}net.dbnet`;
const fixture = `${dir}net.fix`;

function readFixture() {
  const b = readFileSync(fixture);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const { floats: nf, ids: ni, actions: na } = NET_OBS;
  const rows: { input: NetInput; policy: number[]; value: number; foeAction: number[] }[] = [];
  let at = 4;
  const f32 = (n: number) =>
    Array.from({ length: n }, () => ((at += 4), v.getFloat32(at - 4, true)));
  for (let r = v.getUint32(0, true); r > 0; r--) {
    const floats = f32(nf);
    const ids = Array.from({ length: ni }, () => ((at += 2), v.getUint16(at - 2, true)));
    const mask = Array.from({ length: na }, () => b[at++]!);
    const policy = f32(na);
    const [value = 0] = f32(1);
    rows.push({ input: { floats, ids, mask }, policy, value, foeAction: f32(na) });
  }
  return rows;
}

const argmax = (xs: number[]) => xs.indexOf(Math.max(...xs));

describe.skipIf(!engineBuilt(6) || !existsSync(weights) || !existsSync(fixture))(
  'net parity',
  () => {
    it('matches PyTorch on the exported fixture', () => {
      const engine = loadEngine(6);
      expect(engine.netLoad(readFileSync(weights)).params).toBeGreaterThan(1e6);
      const rows = readFixture();
      const out = engine.netForward(rows.map((r) => r.input));
      let worst = 0;
      rows.forEach((r, k) => {
        const o = out[k]!;
        expect(argmax(o.policy)).toBe(argmax(r.policy));
        r.policy.forEach((p, i) => {
          if (p > -1e8) worst = Math.max(worst, Math.abs(o.policy[i]! - p));
        });
        worst = Math.max(worst, Math.abs(o.value - r.value));
        r.foeAction.forEach((p, i) => (worst = Math.max(worst, Math.abs(o.foeAction[i]! - p))));
      });
      expect(worst).toBeLessThan(1e-4);
    });

    it('survives a panic and keeps the network', () => {
      const engine = loadEngine(6);
      engine.netLoad(readFileSync(weights));
      const [row] = readFixture();
      expect(engine.netForward([])).toEqual([]);
      expect(() => engine.roundtrip('not a state')).toThrow();
      expect(argmax(engine.netForward([row!.input])[0]!.policy)).toBe(argmax(row!.policy));
    });
  },
);
