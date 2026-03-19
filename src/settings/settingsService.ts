export interface Settings {
  timelineInferThreads: boolean;
  timelineShowLabels: boolean;
}

const defaultSettings: Settings = {
  timelineInferThreads: true,
  timelineShowLabels: true,
};

const SETTINGS_KEY = "maven-performance-analyzer-settings";

export const getSettings = (): Settings => {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
      return { ...defaultSettings, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.warn("Failed to load settings from local storage", e);
  }
  return defaultSettings;
};

export const saveSettings = (settings: Settings) => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn("Failed to save settings to local storage", e);
  }
};
