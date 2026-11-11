import { abilityInfo, itemInfo } from '../lib/data';

/** What an item and an ability do, each after its name (hover cards, which can't open them). */
export function Effects({ item, ability }: { item?: string; ability?: string }) {
  const lines = [
    item && itemInfo(item) && ([item, itemInfo(item)] as const),
    ability && abilityInfo(ability) && ([ability, abilityInfo(ability)] as const),
  ].filter((l): l is readonly [string, string] => !!l);
  if (!lines.length) return null;
  return (
    <div className="mt-0.5 space-y-0.5 text-[12px] leading-snug text-muted">
      {lines.map(([name, desc]) => (
        <p key={name}>
          <span className="font-semibold text-ink">{name}:</span> {desc}
        </p>
      ))}
    </div>
  );
}
