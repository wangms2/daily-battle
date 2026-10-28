import { afterEach, describe, expect, it } from 'vitest';
import { trackVisits } from './analytics';

const beacons = () => document.head.querySelectorAll('script[src*="cloudflareinsights"]');

describe('trackVisits', () => {
  afterEach(() => beacons().forEach((s) => s.remove()));

  it('adds the beacon, with its token, on the live site', () => {
    trackVisits('battle.peanutbuilds.com');
    expect(beacons()).toHaveLength(1);
    const script = beacons()[0] as HTMLScriptElement;
    expect(JSON.parse(script.dataset.cfBeacon!)).toEqual({
      token: '3fb2b172668f4cfabda54061e8f31e98',
    });
  });

  it('leaves local runs and tests out', () => {
    trackVisits('localhost');
    trackVisits('127.0.0.1');
    expect(beacons()).toHaveLength(0);
  });
});
