import fs from "fs/promises";
import { Settings, SlaveSettings, EjectionSettings } from "../typings/types";

export class SettingsManager {
  private settingsPath: string;
  private settings: Settings;

  constructor(settingsPath: string) {
    this.settingsPath = settingsPath;
    this.settings = {
      slave: {
        pushTime: 0,
        riserTime: 0,
        ejectionTime: 0,
        analysisMode: false,
      },
      ejection: {
        globalSettings: {
          requireMultipleDefects: true,
          minTotalArea: 1000,
          maxDefectsBeforeEject: 3,
        },
        perClassSettings: {
          knot: {
            enabled: true,
            minConfidence: 0.5,
            minArea: 100,
            maxCount: 2,
          },
          corner: {
            enabled: false,
            minConfidence: 0.5,
            minArea: 100,
            maxCount: 2,
          },
          crack: {
            enabled: false,
            minConfidence: 0.5,
            minArea: 100,
            maxCount: 2,
          },
          damage: {
            enabled: false,
            minConfidence: 0.5,
            minArea: 100,
            maxCount: 2,
          },
          edge: {
            enabled: false,
            minConfidence: 0.5,
            minArea: 100,
            maxCount: 2,
          },
          router: {
            enabled: false,
            minConfidence: 0.5,
            minArea: 100,
            maxCount: 2,
          },
          side: {
            enabled: false,
            minConfidence: 0.5,
            minArea: 100,
            maxCount: 2,
          },
          tearout: {
            enabled: false,
            minConfidence: 0.5,
            minArea: 100,
            maxCount: 2,
          },
        },
        advancedSettings: {
          considerOverlap: true,
          regionOfInterest: {
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
          },
          exclusionZones: [],
        },
      },
    };
  }

  async loadSettings(): Promise<void> {
    try {
      const data = await fs.readFile(this.settingsPath, "utf-8");
      const loadedSettings = JSON.parse(data);

      // Merge with defaults to ensure all fields exist
      this.settings = {
        slave: { ...this.settings.slave, ...loadedSettings.slave },
        ejection: { ...this.settings.ejection, ...loadedSettings.ejection },
      };
    } catch (error) {
      console.error("Error loading settings:", error);
      await this.saveSettings();
    }
  }

  async saveSettings(): Promise<void> {
    try {
      await fs.writeFile(
        this.settingsPath,
        JSON.stringify(this.settings, null, 2)
      );
    } catch (error) {
      console.error("Error saving settings:", error);
    }
  }

  getSettings(): Settings {
    return this.settings;
  }

  getSlaveSettings(): SlaveSettings {
    return this.settings.slave;
  }

  getEjectionSettings(): EjectionSettings {
    return this.settings.ejection;
  }

  updateSettings(newSettings: Partial<Settings>): void {
    if (newSettings.slave) {
      this.settings.slave = { ...this.settings.slave, ...newSettings.slave };
    }
    if (newSettings.ejection) {
      this.settings.ejection = {
        ...this.settings.ejection,
        ...newSettings.ejection,
      };
    }
    this.saveSettings();
  }

  updateSlaveSettings(newSettings: Partial<SlaveSettings>): void {
    this.settings.slave = { ...this.settings.slave, ...newSettings };
    this.saveSettings();
  }

  updateEjectionSettings(newSettings: Partial<EjectionSettings>): void {
    this.settings.ejection = { ...this.settings.ejection, ...newSettings };
    this.saveSettings();
  }
}
