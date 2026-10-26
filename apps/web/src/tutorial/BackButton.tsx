// A screen's back button in the top bar: a chevron and where it goes back to.
import { ChevronIcon } from '../ui/icons';

export function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-ml-2 flex h-10 min-w-0 items-center gap-0.5 rounded-full pr-3 pl-1 font-semibold hover:bg-white/10"
    >
      <ChevronIcon className="size-[18px] shrink-0 rotate-180" aria-hidden />
      <span className="truncate">{label}</span>
    </button>
  );
}
