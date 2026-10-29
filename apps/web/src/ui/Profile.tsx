// The trainer card's button, next to the gear in every header (DESIGN.md §10). The
// app provides the opener, so headers don't thread it through their props.
import type { FormatId } from '@daily-battle/data/formats';
import { createContext, useContext } from 'react';
import { ProfileIcon } from './icons';

/** Opens the trainer card, scrolled to `focus`'s stats when given. */
export type OpenTrainer = (focus?: FormatId) => void;

const TrainerContext = createContext<OpenTrainer | null>(null);
export const TrainerProvider = TrainerContext.Provider;
export const useOpenTrainer = () => useContext(TrainerContext);

/** Shown only where the app provides the card (not in a header rendered on its own). */
export function ProfileButton() {
  const open = useOpenTrainer();
  if (!open) return null;
  return (
    <button
      type="button"
      onClick={() => open()}
      className="grid size-10 place-items-center rounded-full text-white/85 hover:bg-white/10"
      aria-label="Trainer card"
    >
      <ProfileIcon />
    </button>
  );
}
