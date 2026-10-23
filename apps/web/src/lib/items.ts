// Item icons: self-hosted under /items, named by a slug of the item's name.

/** "King's Rock" → "kings-rock", "Choice Scarf" → "choice-scarf". */
export const itemSlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Where an item's icon is served from. */
export const itemIcon = (name: string) => `${import.meta.env.BASE_URL}items/${itemSlug(name)}.png`;
