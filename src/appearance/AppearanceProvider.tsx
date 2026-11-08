import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { applyMode, loadSetting, msUntilNextChange, resolveMode, saveSetting, type AppearanceSetting, type Mode } from './appearance';

interface Appearance {
  setting: AppearanceSetting;
  mode: Mode;
  setSetting: (setting: AppearanceSetting) => void;
}

const AppearanceContext = createContext<Appearance | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [setting, setSettingState] = useState(loadSetting);
  const [now, setNow] = useState(() => new Date());
  const mode = resolveMode(setting, now);

  useLayoutEffect(() => applyMode(mode), [mode]);

  // Automatic switches at the next boundary without a reload.
  useEffect(() => {
    if (setting !== 'auto') return;
    const timer = setTimeout(() => setNow(new Date()), msUntilNextChange(now));
    return () => clearTimeout(timer);
  }, [setting, now]);

  // Timers pause while a device sleeps, so check again when the page comes back.
  useEffect(() => {
    const refresh = () => setNow(new Date());
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  const setSetting = useCallback((next: AppearanceSetting) => {
    saveSetting(next);
    setSettingState(next);
    setNow(new Date());
  }, []);

  const value = useMemo(() => ({ setting, mode, setSetting }), [setting, mode, setSetting]);
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance(): Appearance {
  const appearance = useContext(AppearanceContext);
  if (!appearance) throw new Error('useAppearance must be used inside AppearanceProvider');
  return appearance;
}
