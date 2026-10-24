// A live battle against a friend, on the daily game's battle screen. Loaded
// on demand: it brings the presenter (and with it the simulator's data).
import { useEffect, useState } from 'react';
import { BattleBackendContext } from '../battle/backend';
import type { EngineStart, TurnPackage } from '../battle/frames';
import { setActiveFormat } from '../lib/data';
import { backgroundFor } from '../lib/fx';
import { Battle } from '../screens/Battle';
import type { Settings } from '../state/schema';
import { Button } from '../ui/bits';
import { Countdown } from './Countdown';
import { remoteBackend } from './remoteBackend';
import type { Feed } from './feed';
import type { LocalMatch, SideMessage } from './useRoom';

function endText(match: LocalMatch, end: NonNullable<TurnPackage['end']>, gaveUp: boolean) {
  const foe = match.opponent.name;
  const winner = match.result?.winner ?? end.winner;
  const reason = match.result?.reason;
  const title = gaveUp
    ? 'You gave up'
    : winner === 'you'
      ? 'You won'
      : winner
        ? 'You lost'
        : 'Draw';
  const detail =
    reason === 'timeout'
      ? winner === 'you'
        ? `${foe} ran out of time.`
        : 'You ran out of time.'
      : reason === 'forfeit' && !gaveUp
        ? winner === 'you'
          ? `${foe} gave up.`
          : 'You left the battle.'
        : winner === null
          ? 'Nobody won this one.'
          : winner === 'you'
            ? `${end.youLeft} of your Pokémon left standing.`
            : `${foe} had ${end.foeLeft} left.`;
  return { title, detail };
}

export default function LiveBattle({
  match,
  feed,
  choose,
  forfeit,
  settings,
  onSetting,
  onExplainerSeen,
  onBack,
}: {
  match: LocalMatch;
  feed: Feed<SideMessage>;
  choose: (choice: string) => void;
  forfeit: () => void;
  settings: Settings;
  onSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  onExplainerSeen: (id: string) => void;
  onBack: () => void;
}) {
  setActiveFormat(match.format);
  // One backend and one opening for the battle's life on screen.
  const [backend] = useState(() => remoteBackend(match, feed, { choose, forfeit }));
  useEffect(() => backend.attach(), [backend]);
  const [factory] = useState(() => () => backend);
  const [start] = useState<EngineStart>(() => ({
    format: match.format,
    playerTeam: match.team,
    opponentTeam: [],
    style: 'balance',
    battleSeed: '',
    aiSeed: '',
    choices: [],
  }));
  const foe = match.opponent.name;

  return (
    <BattleBackendContext.Provider value={factory}>
      <Battle
        start={start}
        background={backgroundFor(match.id, match.format)}
        settings={settings}
        onSetting={onSetting}
        onExplainerSeen={onExplainerSeen}
        onChoice={() => {}}
        onEnd={() => {}}
        onExit={onBack}
        topBarRight={<Countdown ms={match.timeLeftMs} at={match.receivedAt} />}
        live={{
          waiting: `Waiting for ${foe}…`,
          giveUpBody: `${foe} wins this battle.`,
          exitLabel: 'Back to the room',
          renderEnd: (end, gaveUp) => {
            const { title, detail } = endText(match, end, gaveUp);
            return (
              <>
                <p className="display text-[22px]">{title}</p>
                <p className="mt-1 text-[14px] text-muted">vs {foe}</p>
                <p className="mt-3 text-[15px]">{detail}</p>
                <Button className="mt-4 w-full" onClick={onBack}>
                  Back to the room
                </Button>
              </>
            );
          },
        }}
      />
    </BattleBackendContext.Provider>
  );
}
