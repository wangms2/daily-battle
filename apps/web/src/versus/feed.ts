// A battle's messages as they arrive, kept so a battle screen that mounts
// late (or remounts) starts from the beginning and then follows along.
export class Feed<T> {
  private readonly items: T[] = [];
  private readonly listeners = new Set<(item: T) => void>();

  get size(): number {
    return this.items.length;
  }

  push(item: T) {
    this.items.push(item);
    for (const l of this.listeners) l(item);
  }

  /** Replays the items from `from` on to `listener`, then each new one. Returns an unsubscribe. */
  listen(listener: (item: T) => void, from = 0): () => void {
    for (const item of this.items.slice(from)) listener(item);
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
