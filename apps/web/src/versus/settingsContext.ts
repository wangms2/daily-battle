import { createContext } from 'react';

/** Opens the app's Settings (sound, music, …): every versus screen's header has the gear. */
export const VersusSettingsContext = createContext<(() => void) | null>(null);
