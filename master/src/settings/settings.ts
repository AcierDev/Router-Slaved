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
      },
      ejection: {
        confidenceThreshold: 0.5,
        maxDefects: 3,
        minArea: 100,
        maxArea: 10000,
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
