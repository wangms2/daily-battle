/**
 * Bump when the AI's choices could change for the same inputs. An in-progress
 * battle saved under another version can't be replayed faithfully, so it's
 * recorded as a forfeit instead of resumed (DESIGN.md §15).
 */
export const AI_VERSION = 1;
