// The order and wording of the standings, shared by the game screens.
import type { RoomView } from '@daily-battle/versus';

type RoomPlayer = RoomView['players'][number];

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

export const placeText = (place: number) => (place === 1 ? 'Winner' : `${ordinal(place)} place`);

/** Players still in first (most lives, then most wins), then everyone out, by placement. */
export function standings(players: RoomPlayer[]): RoomPlayer[] {
  return [...players].sort((a, b) => {
    const aIn = a.place === null;
    const bIn = b.place === null;
    if (aIn !== bIn) return aIn ? -1 : 1;
    if (aIn) return b.lives - a.lives || b.wins - a.wins;
    return a.place! - b.place! || b.wins - a.wins;
  });
}

/** A player's name by id, or the AI's. */
export const nameIn = (room: RoomView, id: string) =>
  id === 'ai' ? 'Rival (AI)' : (room.players.find((p) => p.id === id)?.name ?? 'Someone');
