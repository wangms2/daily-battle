import type { MatchView } from '@daily-battle/versus';
import { describe, expect, it, vi } from 'vitest';
import type { TurnPackage } from '../battle/frames';
import { Feed } from './feed';
import { remoteBackend } from './remoteBackend';
import type { SideMessage } from './useRoom';

// Each update becomes a package whose frames are its lines.
vi.mock('../battle/presenter', () => ({
  SidePresenter: class {
    present(u: { lines: string[]; request: unknown; ended: boolean }, resumed: boolean) {
      return {
        frames: u.lines,
        team: [],
        controls: u.request ? {} : null,
        explainers: [],
        end: u.ended ? { winner: 'you', youLeft: 1, foeLeft: 0 } : null,
        resumed,
      };
    }
  },
}));

const view = { id: 'm1', side: 'p1', team: [], format: 'gen9' } as unknown as MatchView;

let sent = 0;
function msg(lines: string[], ended = false): SideMessage {
  const from = sent;
  sent += lines.length;
  return {
    type: 'side',
    match: 'm1',
    from,
    update: { lines, request: ended ? null : { side: {} }, ended, winner: ended ? 'p1' : null },
  };
}

function setup() {
  sent = 0;
  const feed = new Feed<SideMessage>();
  const backend = remoteBackend(view, feed, { choose: vi.fn(), forfeit: vi.fn() });
  return { feed, backend };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('remoteBackend', () => {
  it('opens on where the battle stands when the feed has news already', async () => {
    const { feed, backend } = setup();
    feed.push(msg(['a']));
    feed.push(msg(['b']));
    feed.push(msg(['c']));
    // LiveBattle attaches before the battle screen starts and subscribes.
    const detach = backend.attach();
    const opening = await backend.start!({} as never);
    const later = vi.fn();
    backend.subscribe!(later);
    expect(opening.frames).toEqual(['a', 'b', 'c']);
    expect(opening.resumed).toBe(true);
    expect(opening.controls).not.toBeNull();
    expect(later).not.toHaveBeenCalled();
    detach();
  });

  it('gives up on the battle’s end, not on news that comes first', async () => {
    const { feed, backend } = setup();
    backend.attach();
    feed.push(msg(['start']));
    await backend.start!({} as never);
    const news = vi.fn();
    backend.subscribe!(news);

    let gaveUp: TurnPackage | null = null;
    void backend.forfeit().then((p) => (gaveUp = p));
    feed.push(msg(['foe moved']));
    await flush();
    expect(gaveUp).toBeNull();
    expect(news).toHaveBeenCalledWith(expect.objectContaining({ frames: ['foe moved'] }));

    feed.push(msg(['forfeit'], true));
    await flush();
    expect(gaveUp).toMatchObject({ frames: ['forfeit'], end: { winner: 'you' } });
    expect(news).toHaveBeenCalledTimes(1);
  });
});
