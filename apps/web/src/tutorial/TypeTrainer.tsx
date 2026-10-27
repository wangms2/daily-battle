// The type trainer screen (DESIGN.md §22): a round of 10 questions, a real OU
// Pokémon and an attack type each; pick how hard it hits, see why, and move
// on. Matchups you miss come back sooner (lib/typeTrainer.ts).
import clsx from 'clsx';
import { useState } from 'react';
import { getSprite } from '../lib/sprites';
import {
  answered,
  matchupKey,
  MULTIPLIERS,
  multLabel,
  multWords,
  nextQuestion,
  type Boxes,
  type Question,
} from '../lib/typeTrainer';
import { Button, TypeBadge } from '../ui/bits';
import { TopBar } from '../ui/TopBar';
import { BackButton } from './BackButton';

const ROUND = 10;

/** A line for the round's score. */
function cheer(score: number): string {
  if (score === ROUND) return 'Perfect! A true type master.';
  if (score >= 8) return 'Great eye for types!';
  if (score >= 5) return 'Nice work. Keep it up!';
  return 'Every round sticks a little more.';
}

export function TypeTrainer({
  boxes,
  onBoxes,
  onBack,
  onChart,
  onSettings,
}: {
  boxes: Boxes;
  onBoxes: (boxes: Boxes) => void;
  onBack: () => void;
  /** Opens the type chart. */
  onChart: () => void;
  onSettings: () => void;
}) {
  const [round, setRound] = useState(0);
  const [index, setIndex] = useState(0);
  // The round so far: each question and the answer picked.
  const [results, setResults] = useState<{ q: Question; picked: number }[]>([]);
  const score = results.filter((x) => x.picked === x.q.mult).length;
  const [question, setQuestion] = useState<Question>(() => nextQuestion(boxes));
  const [picked, setPicked] = useState<number | null>(null);
  const done = index >= ROUND;

  const pick = (m: number) => {
    if (picked !== null) return;
    setPicked(m);
    setResults((rs) => [...rs, { q: question, picked: m }]);
    onBoxes(answered(boxes, question, m === question.mult));
  };
  const next = () => {
    setIndex((i) => i + 1);
    setPicked(null);
    setQuestion(nextQuestion(boxes, Math.random, matchupKey(question.attack, question.types)));
  };
  const again = () => {
    setRound((r) => r + 1);
    setIndex(0);
    setResults([]);
    setPicked(null);
    setQuestion(nextQuestion(boxes));
  };

  return (
    <div className="flex h-full flex-col">
      <TopBar
        title="Type trainer"
        left={<BackButton label="Type trainer" onClick={onBack} />}
        onSettings={onSettings}
      />
      <main
        key={round}
        className="mx-auto flex w-full max-w-[560px] flex-1 flex-col gap-4 overflow-y-auto px-4 pt-4 pb-6"
      >
        {done ? (
          <section className="grid gap-4">
            <div className="grid justify-items-center gap-1 pt-2 text-center">
              <p className="home-serif text-[44px] leading-none tabular-nums">
                {score}
                <span className="text-[24px] text-muted"> / {ROUND}</span>
              </p>
              <p className="text-[17px] font-semibold">{cheer(score)}</p>
              {score < ROUND && (
                <p className="text-[13.5px] text-muted">The ones you missed come back sooner.</p>
              )}
            </div>
            {/* The round, question by question. */}
            <ol className="card divide-y divide-line" aria-label="Your answers">
              {results.map(({ q, picked: p }, i) => {
                const right = p === q.mult;
                return (
                  <li key={i} className="flex items-center gap-2 px-3 py-1.5 text-[13.5px]">
                    <span
                      aria-label={right ? 'Right' : 'Missed'}
                      className={clsx('w-4 shrink-0 font-bold', right ? 'text-good' : 'text-bad')}
                    >
                      {right ? '✓' : '✗'}
                    </span>
                    <TypeBadge type={q.attack} size="sm" />
                    <span className="text-muted">vs</span>
                    <img
                      src={getSprite(q.species, 'icon')}
                      alt=""
                      className="pixelated h-6 w-8 shrink-0 object-contain"
                    />
                    <span className="min-w-0 flex-1 truncate">{q.species}</span>
                    <span className="shrink-0 font-semibold tabular-nums">{multLabel(q.mult)}</span>
                    {!right && (
                      <span className="shrink-0 text-[12px] text-muted tabular-nums line-through">
                        {multLabel(p)}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
            <Button onClick={again}>Another round</Button>
            <Button variant="secondary" onClick={onChart}>
              Type chart
            </Button>
          </section>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-semibold text-muted tabular-nums">
                {index + 1} of {ROUND}
              </p>
              <button
                type="button"
                onClick={onChart}
                className="text-[13px] font-semibold text-accent underline-offset-2 hover:underline"
              >
                Type chart
              </button>
            </div>
            {/* Who hits whom, as one sentence: your move's type, then the Pokémon it hits. */}
            <section className="card grid gap-0.5 px-4 pt-2 pb-1">
              <p className="flex flex-wrap items-center gap-1.5 text-[16px] font-semibold">
                Your <TypeBadge type={question.attack} /> attack hits…
              </p>
              <div className="flex items-center gap-3">
                <img
                  src={getSprite(question.species, 'front')}
                  alt=""
                  className="pixelated size-14 shrink-0 object-contain"
                />
                <div className="grid gap-1.5">
                  <p className="text-[16px] font-semibold">{question.species}</p>
                  <span className="flex gap-1">
                    {question.types.map((t) => (
                      <TypeBadge key={t} type={t} />
                    ))}
                  </span>
                </div>
              </div>
            </section>
            {/* Strongest to none, each in its colour: a ladder to pick a rung on. */}
            <div className="grid gap-1.5" role="group" aria-label="How hard it hits">
              {MULTIPLIERS.map((m) => {
                const isAnswer = m === question.mult;
                const isPick = m === picked;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => pick(m)}
                    disabled={picked !== null && !isAnswer && !isPick}
                    aria-pressed={isPick}
                    aria-label={`${multWords(m)}, ${multLabel(m)}`}
                    data-mult={m}
                    className={clsx(
                      'eff-rung flex h-[clamp(36px,5.8dvh,48px)] items-center justify-between rounded-btn border pr-1.5 pl-3 text-left text-[15px] font-semibold',
                      picked === null && 'border-line bg-surface hover:bg-surface-2',
                      picked !== null && isAnswer && 'is-answer',
                      picked !== null && isPick && !isAnswer && 'is-wrong',
                      picked !== null && !isAnswer && !isPick && 'border-line opacity-35',
                    )}
                  >
                    {multWords(m)}
                    <span className="eff-chip">{multLabel(m)}</span>
                  </button>
                );
              })}
            </div>
            {picked !== null && (
              <div
                role="note"
                className="animate-fade-in grid gap-2 rounded-card bg-accent-soft px-3 py-2 text-[14px] leading-snug"
              >
                <p className="font-semibold">
                  {picked === question.mult
                    ? `Right! ${multWords(question.mult)} (${multLabel(question.mult)}).`
                    : `It’s ${multWords(question.mult).toLowerCase()} (${multLabel(question.mult)}).`}
                </p>
                <p className="flex flex-wrap items-center gap-1">
                  <TypeBadge type={question.attack} size="sm" />
                  {question.parts.map((p, i) => (
                    <span key={p.type} className="flex items-center gap-1">
                      {i > 0 ? '·' : 'vs'} <TypeBadge type={p.type} size="sm" /> {multLabel(p.mult)}
                    </span>
                  ))}
                  {question.parts.length > 1 && <span>= {multLabel(question.mult)}</span>}
                </p>
                <Button className="h-10" onClick={next}>
                  {index + 1 < ROUND ? 'Next' : 'See your score'}
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
