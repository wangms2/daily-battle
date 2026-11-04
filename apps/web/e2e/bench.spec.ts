// Time per decision in a real browser (BENCH=1 only; not part of the suite):
// Master's choice (the worker's `choose` round trip) and the coach's check
// before a pick (`check`), at full speed and with the CPU throttled like a phone.
//   BENCH=1 pnpm exec playwright test e2e/bench.spec.ts --project=desktop-1280x800
// With BENCH_SPEED=normal (or another battle speed), it plays with animations on.
import { test, type Page } from '@playwright/test';
import schedule from '../public/schedule/2026-10-19.json' with { type: 'json' };

const TODAY = new Date('2026-10-21T10:00:00-04:00');
const MOVES = 'main button[aria-label*=" PP"]:enabled';
const SWITCHES = 'main button[aria-label^="Switch to"]:not([aria-disabled="true"])';
const TEAM = schedule.suggestedTeams[0]!.team;

test.skip(!process.env.BENCH, 'benchmark: BENCH=1');
test.setTimeout(15 * 60_000);

/** Wraps the page's Worker to time `choose` and `check` round trips. */
function timeWorker() {
  const w = window as unknown as { __times: Record<string, number[]> };
  w.__times = { choose: [], check: [] };
  const Base = window.Worker;
  window.Worker = class extends Base {
    private sent: { type: string; t: number } | undefined;
    constructor(url: string | URL, opts?: WorkerOptions) {
      super(url, opts);
      this.addEventListener('message', (e: MessageEvent) => {
        const type = (e.data as { type?: string })?.type;
        const s = this.sent;
        if (!s) return;
        if (
          (s.type === 'choose' && type === 'package') ||
          (s.type === 'check' && type === 'check')
        ) {
          w.__times[s.type]!.push(performance.now() - s.t);
          this.sent = undefined;
        }
      });
    }
    override postMessage(msg: unknown, ...rest: [Transferable[]?]) {
      const type = (msg as { type?: string })?.type;
      if (type === 'choose' || type === 'check') this.sent = { type, t: performance.now() };
      super.postMessage(msg, ...(rest as [Transferable[]]));
    }
  } as typeof Worker;
}

async function open(page: Page, difficulty: string, coach: boolean) {
  const state = {
    version: 3,
    weeks: {
      '2026-10-19': {
        team: TEAM,
        poolId: `${schedule.week}:g${schedule.generatorVersion}:c${schedule.pool.candidate}`,
      },
    },
    days: {},
    settings: {
      beginnerHints: false,
      // BENCH_SPEED=normal: as played, so the search overlaps the turn's animations.
      battleSpeed: process.env.BENCH_SPEED ?? 'instant',
      animations: !!process.env.BENCH_SPEED,
      coachOffered: { gen3ou: true, gen4ou: true, gen5ou: true, gen6ou: true },
      coach: { gen4ou: coach },
      difficulty: { gen4ou: difficulty },
      shownExplainers: ['welcome', 'cores', 'gen5-news', 'gen6-news', 'gen3-news', 'tour'],
    },
  };
  await page.addInitScript(timeWorker);
  await page.addInitScript(
    (s) => localStorage.setItem('daily-battle:state', s),
    JSON.stringify(state),
  );
  await page.clock.setFixedTime(TODAY);
  await page.goto('/#play');
}

/** Plays the first usable move (or switch) each turn; "Do it anyway" past any warning. */
async function play(page: Page) {
  for (let i = 0; i < 600; i++) {
    const state = await page
      .waitForFunction(
        ([moves, switches]) => {
          if (document.querySelector('[role="dialog"][aria-label="Battle over"]')) return 'end';
          const anyway = [...document.querySelectorAll('button')].find((b) =>
            /Do it anyway/.test(b.textContent ?? ''),
          );
          if (anyway) return 'anyway';
          if (document.querySelector(moves!)) return 'moves';
          if (document.querySelector(switches!)) return 'switch';
          (document.querySelector('.battle-field') as HTMLElement | null)?.click();
          return false;
        },
        [MOVES, SWITCHES],
        { timeout: 120_000, polling: 100 },
      )
      .then((h) => h.jsonValue());
    if (state === 'end') return;
    if (state === 'anyway') {
      await page
        .getByRole('button', { name: /Do it anyway/ })
        .click({ timeout: 2_000 })
        .catch(() => {});
      continue;
    }
    await page
      .locator(state === 'moves' ? MOVES : SWITCHES)
      .first()
      .click({ timeout: 2_000 })
      .catch(() => {});
  }
}

const stats = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? NaN;
  const r = (x: number) => Math.round(x);
  return `n=${s.length} median=${r(q(0.5))}ms p90=${r(q(0.9))}ms max=${r(s.at(-1) ?? NaN)}ms`;
};

for (const throttle of [1, 4])
  for (const [difficulty, coach] of [
    ['master', false],
    ['normal', true],
    ['hard', true],
  ] as const)
    test(`${difficulty}${coach ? ' coached' : ''} at ${throttle}× CPU`, async ({ page }) => {
      if (throttle > 1) {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
      }
      await open(page, difficulty, coach);
      await page.getByRole('button', { name: /^Start · / }).click();
      await play(page);
      const times = await page.evaluate(
        () => (window as unknown as { __times: Record<string, number[]> }).__times,
      );
      console.log(
        `BENCH ${difficulty}${coach ? '+coach' : ''} ${throttle}x choose ${stats(times.choose!)} | check ${stats(times.check!)}`,
      );
    });
