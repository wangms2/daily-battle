// Versus rooms with friends (DESIGN.md §18): `#versus` creates or joins a
// room, `#versus/CODE` is the room itself.
import { cleanName, ERROR_TEXT, normalizeCode, type ErrorCode } from '@daily-battle/versus';
import { useState, type ReactNode } from 'react';
import { Button } from '../ui/bits';
import { Lobby } from './Lobby';
import { Page } from './Page';
import { savedName, saveName } from './saved';
import { createRoom, useRoom, type EndReason } from './useRoom';

/** The room code in a `versus/CODE` route, or null for the versus home. */
const roomCodeOf = (route: string): string | null =>
  route.startsWith('versus/') ? normalizeCode(route.slice('versus/'.length)) : null;

export function VersusRoute({
  route,
  go,
  onExit,
}: {
  route: string;
  go: (route: string) => void;
  /** Back to the daily game. */
  onExit: () => void;
}) {
  const code = roomCodeOf(route);
  // The name to join a room with straight away (you just created it, or typed a name first).
  const [joinAs, setJoinAs] = useState<{ code: string; name: string } | null>(null);
  if (!code) {
    return (
      <VersusHome
        onExit={onExit}
        onRoom={(c, name) => {
          setJoinAs(name ? { code: c, name } : null);
          go(`versus/${c}`);
        }}
      />
    );
  }
  return (
    <RoomScreen
      key={code}
      code={code}
      autoJoinAs={joinAs?.code === code ? joinAs.name : undefined}
      onExit={() => go('versus')}
    />
  );
}

const inputClass =
  'h-11 w-full rounded-btn border border-line bg-surface px-3 text-[16px] text-ink placeholder:text-muted';

function NameField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-[14px] font-medium">Your name</span>
      <input
        className={inputClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="nickname"
        maxLength={32}
        placeholder="What friends will see"
        aria-invalid={!!error || undefined}
      />
      {error && <span className="block text-[13px] text-bad">{error}</span>}
    </label>
  );
}

function VersusHome({
  onExit,
  onRoom,
}: {
  onExit: () => void;
  onRoom: (code: string, name: string | null) => void;
}) {
  const [name, setName] = useState(savedName);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clean = cleanName(name);
  const typed = normalizeCode(code);

  const create = async () => {
    if (!clean) return;
    setBusy(true);
    setError(null);
    try {
      const room = await createRoom();
      saveName(clean);
      onRoom(room, clean);
    } catch {
      setError('Couldn’t create a room. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title="Versus" back="Daily" onBack={onExit}>
      <p className="text-[14px] leading-relaxed text-muted">
        Live battles with friends. Everyone builds from the same 12, makes one change before each
        round, and plays until one player has lives left.
      </p>
      <section className="card space-y-3 p-4">
        <NameField value={name} onChange={setName} />
        <Button className="w-full" disabled={!clean || busy} onClick={create}>
          {busy ? 'Creating…' : 'Create a room'}
        </Button>
        {error && (
          <p role="alert" className="text-[13px] text-bad">
            {error}
          </p>
        )}
      </section>
      <section className="card space-y-3 p-4">
        <label className="block space-y-1.5">
          <span className="block text-[14px] font-medium">Join with a code</span>
          <input
            className={`${inputClass} font-semibold tracking-[0.2em] uppercase`}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && typed) onRoom(typed, clean);
            }}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={8}
            placeholder="5 letters"
          />
        </label>
        <Button
          variant="secondary"
          className="w-full"
          disabled={!typed}
          onClick={() => typed && onRoom(typed, clean)}
        >
          Join room
        </Button>
      </section>
    </Page>
  );
}

const END_TEXT: Record<EndReason, string> = {
  noRoom: ERROR_TEXT.noRoom,
  full: ERROR_TEXT.full,
  started: ERROR_TEXT.started,
  kicked: 'The host removed you from the room.',
  replaced: 'This room is open in another tab.',
  left: 'You left the room.',
};

function RoomScreen({
  code,
  autoJoinAs,
  onExit,
}: {
  code: string;
  autoJoinAs?: string;
  onExit: () => void;
}) {
  const room = useRoom(code, autoJoinAs);
  const { status } = room;
  const [name, setName] = useState(savedName);
  const clean = cleanName(name);

  if (status.kind === 'joined') {
    return (
      <Lobby
        room={status.room}
        you={status.you}
        connected={status.connected}
        notice={room.notice}
        command={room.command}
        onLeave={() => {
          room.leave();
          onExit();
        }}
        onBack={onExit}
      />
    );
  }

  let body: ReactNode;
  if (status.kind === 'connecting') {
    body = <p className="py-10 text-center text-muted">Connecting…</p>;
  } else if (status.kind === 'name') {
    const error = status.error && ERROR_TEXT[status.error as ErrorCode];
    body = (
      <form
        className="card space-y-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (clean) room.join(clean);
        }}
      >
        <NameField value={name} onChange={setName} error={error} />
        <Button type="submit" className="w-full" disabled={!clean}>
          Join room
        </Button>
      </form>
    );
  } else {
    body = (
      <section className="card space-y-3 p-4 text-center">
        <p className="text-[15px]">{END_TEXT[status.reason]}</p>
        {status.reason === 'replaced' && (
          <Button className="w-full" onClick={room.reconnect}>
            Use this tab instead
          </Button>
        )}
        <Button variant="secondary" className="w-full" onClick={onExit}>
          Back to Versus
        </Button>
      </section>
    );
  }
  return (
    <Page title={`Room ${code}`} back="Versus" onBack={onExit}>
      {body}
    </Page>
  );
}
