import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { clearScheduleCache } from './lib/schedule';

// Unmount between tests (automatic only with Vitest globals on).
afterEach(cleanup);
// Each test stubs its own fetch: don't keep weeks loaded by another.
afterEach(clearScheduleCache);

// jsdom lacks a few browser APIs the UI uses (media queries, the carousel's
// observers). Minimal stand-ins are enough for behavior tests.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
globalThis.ResizeObserver ??= NoopObserver as unknown as typeof ResizeObserver;
globalThis.IntersectionObserver ??= NoopObserver as unknown as typeof IntersectionObserver;
