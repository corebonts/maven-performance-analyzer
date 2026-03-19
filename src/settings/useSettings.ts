import { useState, useCallback } from "react";
import { getSettings, saveSettings, Settings } from "./settingsService";

export const useSettings = () => {
  const [settings, setSettingsState] = useState<Settings>(getSettings());

  const setSettings = useCallback((newSettings: Partial<Settings>) => {
    setSettingsState((prev) => {
      const updated = { ...prev, ...newSettings };
      saveSettings(updated);
      return updated;
    });
  }, []);

  return { settings, setSettings };
};
