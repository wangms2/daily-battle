import { useEffect, useRef } from 'react';
import { speciesInfo } from '../../lib/data';
import { getSprite } from '../../lib/sprites';
import { ConfirmDialog } from '../../sheets/misc';
import { Sheet } from '../../ui/Sheet';
import { Button, Switch, TypeBadge } from '../../ui/bits';
import type { MonView, Revealed, TeamMember } from '../frames';
import { boostLabels, STATUS_LABEL } from './labels';
import { BattleText } from './text';

export function LogSheet({
  open,
  onOpenChange,
  lines,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lines: string[];
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Battle log">
      <LogList lines={lines} className="h-[60dvh]" />
    </Sheet>
  );
}

/** The full log, newest at the bottom, scrolled to the end. */
export function LogList({ lines, className }: { lines: string[]; className?: string }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [lines.length]);
  return (
    <div
      className={`overflow-y-auto overscroll-contain text-[13.5px] leading-relaxed ${className ?? ''}`}
    >
      {lines.map((l, i) =>
        l.startsWith('== Turn') ? (
          <p
            key={i}
            className="display mt-3 mb-1 text-[12px] tracking-wider text-muted uppercase first:mt-0"
          >
            {l.replace(/=/g, '').trim()}
          </p>
        ) : (
          <p key={i} className={l.startsWith('(') ? 'text-muted' : undefined}>
            <BattleText text={l} />
          </p>
        ),
      )}
      <div ref={end} />
    </div>
  );
}

/** Speed range at level 100 with 31 IVs: no EVs and a hindering nature up to 252 EVs and a boosting one. */
function speedRange(base: number): [number, number] {
  return [Math.floor((2 * base + 31 + 5) * 0.9), Math.floor((2 * base + 31 + 63 + 5) * 1.1)];
}

export function MonSheet({
  open,
  onOpenChange,
  foe,
  mon,
  revealed,
  member,
  hints,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  foe: boolean;
  mon: MonView | null;
  revealed?: Revealed;
  member?: TeamMember;
  hints: boolean;
}) {
  if (!mon) return null;
  const info = speciesInfo(mon.species);
  const boosts = boostLabels(mon.boosts);
  const [lo, hi] = speedRange(info.baseStats.spe);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={mon.species}>
      <div className="flex items-center gap-4">
        <img src={getSprite(mon.species)} alt="" className="pixelated h-20 w-20 object-contain" />
        <div className="space-y-1.5">
          <div className="flex gap-1.5">
            {info.types.map((t) => (
              <TypeBadge key={t} type={t} />
            ))}
          </div>
          <p className="text-[14px] tabular-nums">
            {mon.hpExact ? `${mon.hpExact.hp}/${mon.hpExact.max} HP` : `${mon.hp}% HP`}
            {mon.status && ` · ${STATUS_LABEL[mon.status]}`}
            {boosts.length > 0 && ` · ${boosts.join(', ')}`}
          </p>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-[6rem_1fr] gap-x-3 gap-y-2 text-[14px]">
        {foe ? (
          <>
            <dt className="text-muted">Moves seen</dt>
            <dd>{revealed?.moves.length ? revealed.moves.join(', ') : 'None yet'}</dd>
            <dt className="text-muted">Item</dt>
            <dd>{revealed?.item || 'Unknown'}</dd>
            <dt className="text-muted">Ability</dt>
            <dd>{revealed?.ability || 'Unknown'}</dd>
            {hints && (
              <>
                <dt className="text-muted">Speed</dt>
                <dd className="tabular-nums">
                  {lo}–{hi} <span className="text-muted">before boosts and items</span>
                </dd>
              </>
            )}
          </>
        ) : (
          member && (
            <>
              <dt className="text-muted">Moves</dt>
              <dd>{member.moves.join(', ')}</dd>
              <dt className="text-muted">Item</dt>
              <dd>{member.item || 'None'}</dd>
              <dt className="text-muted">Ability</dt>
              <dd>{member.ability}</dd>
              <dt className="text-muted">Stats</dt>
              <dd className="tabular-nums">
                {['atk', 'def', 'spa', 'spd', 'spe']
                  .filter((k) => member.stats[k])
                  .map(
                    (k) =>
                      `${member.stats[k]} ${k === 'spa' ? 'SpA' : k === 'spd' ? 'SpD' : k[0]!.toUpperCase() + k.slice(1)}`,
                  )
                  .join(' · ')}
              </dd>
            </>
          )
        )}
      </dl>
    </Sheet>
  );
}

export function MenuSheet({
  open,
  onOpenChange,
  hints,
  animations,
  onHints,
  onAnimations,
  onLog,
  onLeave,
  onGiveUp,
  canGiveUp,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  hints: boolean;
  animations: boolean;
  onHints: (v: boolean) => void;
  onAnimations: (v: boolean) => void;
  onLog: () => void;
  onLeave: () => void;
  onGiveUp: () => void;
  canGiveUp: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Battle">
      <div className="divide-y divide-line">
        <Switch
          checked={hints}
          onCheckedChange={onHints}
          label="Beginner hints"
          hint="Effectiveness, speed, and tips"
        />
        <Switch checked={animations} onCheckedChange={onAnimations} label="Animations" />
      </div>
      <div className="mt-3 grid gap-2">
        <Button variant="secondary" onClick={onLog}>
          Battle log
        </Button>
        <Button variant="secondary" onClick={onLeave}>
          Back to today (battle is saved)
        </Button>
        {canGiveUp && (
          <Button variant="ghost" className="text-bad" onClick={onGiveUp}>
            Give up
          </Button>
        )}
      </div>
    </Sheet>
  );
}

export function GiveUpDialog({
  open,
  onOpenChange,
  onConfirm,
  firstTry,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: () => void;
  firstTry: boolean;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Give up this battle?"
      body={
        firstTry
          ? 'It counts as a loss for today’s first try, with the Pokémon you have left.'
          : 'It counts as a lost try, with the Pokémon you have left.'
      }
      confirm="Give up"
      cancel="Keep battling"
      onConfirm={onConfirm}
    />
  );
}
