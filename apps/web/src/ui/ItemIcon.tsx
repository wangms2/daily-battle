// A held item's icon, in front of its name. Self-hosted (scripts/items.ts); an
// item without one just shows its name.
import { itemIcon } from '../lib/items';

export function ItemIcon({ name, className = 'size-5' }: { name: string; className?: string }) {
  return (
    <img
      src={itemIcon(name)}
      alt=""
      aria-hidden
      draggable={false}
      onError={(e) => (e.currentTarget.style.display = 'none')}
      className={`pixelated mr-0.5 inline-block shrink-0 align-middle ${className}`}
    />
  );
}
