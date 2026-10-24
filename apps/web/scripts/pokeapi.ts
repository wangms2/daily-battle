// Species name → PokeAPI pokemon id, shared by the asset scripts (sprites, cries).

const slug = (s: string) => s.toLowerCase().replace(/[.']/g, '').replace(/\s+/g, '-');
const CSV = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv';
let ids: Map<string, number> | undefined;

/** Identifier → id from one of PokeAPI's CSV tables (`id,identifier,...`). */
async function csvIds(table: string): Promise<[string, number][]> {
  const res = await fetch(`${CSV}/${table}.csv`);
  if (!res.ok) throw new Error(`Could not fetch PokeAPI ${table}.csv`);
  return (await res.text())
    .split('\n')
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const [id, identifier] = line.split(',');
      return [identifier!, Number(id)];
    });
}

/**
 * PokeAPI pokemon id for a species name, e.g. Rotom-Wash → 10009. Species whose
 * default form has its own name (Thundurus → thundurus-incarnate) use the
 * species id, which is also its default form's id.
 */
export async function pokeapiId(species: string): Promise<number> {
  if (!ids) {
    ids = new Map([...(await csvIds('pokemon_species')), ...(await csvIds('pokemon'))]);
  }
  const id = ids.get(slug(species));
  if (!id) throw new Error(`No PokeAPI entry for ${species}`);
  return id;
}
