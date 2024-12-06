import fs from "fs/promises";
import path from "path";
import { BoundingBox, ClassName, Prediction } from "../typings/types.js";

interface DefectStats {
  count: number;
  totalArea: number;
  minArea: number;
  maxArea: number;
  avgArea: number;
  minConfidence: number;
  maxConfidence: number;
  avgConfidence: number;
}

interface DefectTypeStats {
  corner?: DefectStats;
  crack?: DefectStats;
  damage?: DefectStats;
  edge?: DefectStats;
  knot?: DefectStats;
  router?: DefectStats;
  side?: DefectStats;
  tearout?: DefectStats;
}

interface PredictionStats {
  class_name: ClassName;
  confidence: number;
  bbox: BoundingBox;
  area: number;
}

export interface CycleStats {
  cycleId: string;
  timestamp: string;
  duration: number;
  analysisTime?: number;
  captureTime?: number;
  ejectionDecision?: boolean;
  ejectionReasons?: string[];
  predictions?: PredictionStats[];
  defectsFound?: number;
  totalDefectArea?: number;
  defectStats?: DefectTypeStats;
  error?: string;
}

interface TimeStats {
  min: number;
  max: number;
  avg: number;
  total: number;
}

export interface DailyStats {
  date: string;
  totalCycles: number;
  successfulCycles: number;
  failedCycles: number;
  analysisTime: TimeStats;
  captureTime: TimeStats;
  cycleTime: TimeStats;
  totalEjections: number;
  totalDefectsFound: number;
  defectsByType: DefectTypeStats;
  errors: Array<{
    timestamp: string;
    message: string;
  }>;
  ejectionRate: number;
  successRate: number;
  peakActivityHour: number;
  cyclesByHour: number[];
}

export class StatsManager {
  private currentCycle: Partial<CycleStats> | null = null;
  private statsDir: string;
  private cycleStartTime: number = 0;
  private dailyStats: DailyStats | null = null;
  private sensor1TriggerTime: number = 0;

  constructor(statsDir: string = "./stats") {
    this.statsDir = statsDir;
  }

  async init(): Promise<void> {
    await fs.mkdir(this.statsDir, { recursive: true });
    await this.loadDailyStats();
  }

  private async loadDailyStats(): Promise<void> {
    const date = new Date().toISOString().split("T")[0];
    const dailyStatsPath = path.join(this.statsDir, "daily", `${date}.json`);

    try {
      const data = await fs.readFile(dailyStatsPath, "utf-8");
      this.dailyStats = JSON.parse(data);
      this.dailyStats = {
        ...this.createNewDailyStats(date),
        ...this.dailyStats,
      };
    } catch {
      this.dailyStats = this.createNewDailyStats(date);
    }
  }

  private createNewDailyStats(date: string): DailyStats {
    return {
      date,
      totalCycles: 0,
      successfulCycles: 0,
      failedCycles: 0,
      analysisTime: { min: Infinity, max: 0, avg: 0, total: 0 },
      captureTime: { min: Infinity, max: 0, avg: 0, total: 0 },
      cycleTime: { min: Infinity, max: 0, avg: 0, total: 0 },
      totalEjections: 0,
      totalDefectsFound: 0,
      defectsByType: {},
      errors: [],
      ejectionRate: 0,
      successRate: 100,
      peakActivityHour: 0,
      cyclesByHour: new Array(24).fill(0),
    };
  }

  private createNewDefectStats(): DefectStats {
    return {
      count: 0,
      totalArea: 0,
      minArea: Infinity,
      maxArea: -Infinity,
      avgArea: 0,
      minConfidence: Infinity,
      maxConfidence: -Infinity,
      avgConfidence: 0,
    };
  }

  startCycle(): void {
    this.currentCycle = {
      cycleId: `cycle_${Date.now()}`,
      timestamp: new Date().toISOString(),
    };
  }

  startAnalysis(): void {
    if (this.currentCycle) {
      this.currentCycle.analysisTime = Date.now();
    }
  }

  recordCaptureTime(duration: number): void {
    if (this.currentCycle) {
      this.currentCycle.captureTime = duration;
    }
  }

  recordAnalysisResult(
    decision: boolean,
    predictions: Prediction[],
    totalArea: number,
    ejectionReasons?: string[]
  ): void {
    if (!this.currentCycle) return;

    if (this.currentCycle.analysisTime) {
      const analysisDuration = Date.now() - this.currentCycle.analysisTime;
      this.currentCycle.analysisTime = analysisDuration;
    }

    this.currentCycle.ejectionDecision = decision;
    this.currentCycle.ejectionReasons = ejectionReasons;
    this.currentCycle.defectsFound = predictions.length;
    this.currentCycle.totalDefectArea = totalArea;
    this.currentCycle.defectStats = this.calculateDefectStats(predictions);

    this.currentCycle.predictions = predictions.map((pred) => ({
      class_name: pred.class_name,
      confidence: pred.confidence,
      bbox: pred.bbox,
      area: this.calculateArea(pred.bbox),
    }));
  }

  private calculateDefectStats(predictions: Prediction[]): DefectTypeStats {
    const stats: DefectTypeStats = {};

    for (const pred of predictions) {
      const className = pred.class_name;
      const area = this.calculateArea(pred.bbox);

      if (!stats[className]) {
        stats[className] = this.createNewDefectStats();
      }

      const classStats = stats[className]!;
      classStats.count++;
      classStats.totalArea += area;
      classStats.minArea = Math.min(classStats.minArea, area);
      classStats.maxArea = Math.max(classStats.maxArea, area);
      classStats.avgArea = classStats.totalArea / classStats.count;
      classStats.minConfidence = Math.min(
        classStats.minConfidence,
        pred.confidence
      );
      classStats.maxConfidence = Math.max(
        classStats.maxConfidence,
        pred.confidence
      );
      classStats.avgConfidence =
        (classStats.avgConfidence * (classStats.count - 1) + pred.confidence) /
        classStats.count;
    }

    return stats;
  }

  private calculateArea(bbox: BoundingBox): number {
    const width = bbox[2] - bbox[0];
    const height = bbox[3] - bbox[1];
    return width * height * 1000000; // Convert to square pixels
  }

  recordError(error: string): void {
    if (this.currentCycle) {
      this.currentCycle.error = error;
    }
    if (this.dailyStats) {
      this.dailyStats.errors.push({
        timestamp: new Date().toISOString(),
        message: error,
      });
    }
  }

  getCurrentCycleStats(): Partial<CycleStats> | null {
    return this.currentCycle;
  }

  getDailyStats(): DailyStats | null {
    return this.dailyStats;
  }

  async endCycle(): Promise<{
    cycleStats: CycleStats;
    dailyStats: DailyStats;
  } | null> {
    if (!this.currentCycle || !this.dailyStats) return null;

    const currentTime = Date.now();
    console.log(`[Stats] Ending cycle...
      Sensor1 trigger time: ${this.sensor1TriggerTime}
      Current time: ${currentTime}
      Difference: ${currentTime - this.sensor1TriggerTime}ms
    `);

    if (this.sensor1TriggerTime > 0) {
      this.currentCycle.duration = currentTime - this.sensor1TriggerTime;
      console.log(
        `[Stats] Cycle duration calculated: ${this.currentCycle.duration}ms`
      );
    } else {
      console.warn(
        "[Stats] Warning: Cycle ended without sensor1 trigger timestamp"
      );
      this.currentCycle.duration = 0;
    }

    if (!this.currentCycle.defectsFound) {
      this.currentCycle.defectsFound = 0;
    }
    if (!this.currentCycle.totalDefectArea) {
      this.currentCycle.totalDefectArea = 0;
    }
    if (!this.currentCycle.defectStats) {
      this.currentCycle.defectStats = {};
    }
    if (!this.currentCycle.predictions) {
      this.currentCycle.predictions = [];
    }
    if (!this.currentCycle.ejectionDecision) {
      this.currentCycle.ejectionDecision = false;
    }
    if (!this.currentCycle.ejectionReasons) {
      this.currentCycle.ejectionReasons = ["Non-analysis cycle"];
    }

    await this.saveCycleStats(this.currentCycle as CycleStats);
    await this.updateDailyStats(this.currentCycle as CycleStats);

    const completedCycle = this.currentCycle;
    const currentDailyStats = this.dailyStats;

    console.log(`[Stats] Resetting cycle state`);
    this.currentCycle = null;
    this.sensor1TriggerTime = 0;

    return {
      cycleStats: completedCycle as CycleStats,
      dailyStats: currentDailyStats,
    };
  }

  private async updateDailyStats(cycleStats: CycleStats): Promise<void> {
    if (!this.dailyStats) return;

    const stats = this.dailyStats;

    if (!stats.defectsByType) {
      stats.defectsByType = {};
    }

    stats.totalCycles++;

    if (cycleStats.error) {
      stats.failedCycles++;
    } else {
      stats.successfulCycles++;
    }

    this.updateTimeStats(stats.cycleTime, cycleStats.duration);
    if (cycleStats.analysisTime) {
      this.updateTimeStats(stats.analysisTime, cycleStats.analysisTime);
    }
    if (cycleStats.captureTime) {
      this.updateTimeStats(stats.captureTime, cycleStats.captureTime);
    }

    if (cycleStats.ejectionDecision) {
      stats.totalEjections++;
    }

    if (cycleStats.defectsFound) {
      stats.totalDefectsFound += cycleStats.defectsFound;
    }

    if (cycleStats.defectStats) {
      this.updateDefectTypeStats(stats.defectsByType, cycleStats.defectStats);
    }

    stats.ejectionRate = (stats.totalEjections / stats.totalCycles) * 100;
    stats.successRate = (stats.successfulCycles / stats.totalCycles) * 100;

    const hour = new Date(cycleStats.timestamp).getHours();
    if (!stats.cyclesByHour) {
      stats.cyclesByHour = new Array(24).fill(0);
    }
    stats.cyclesByHour[hour]++;
    stats.peakActivityHour = stats.cyclesByHour.indexOf(
      Math.max(...stats.cyclesByHour)
    );

    await this.saveDailyStats();
  }

  private updateTimeStats(timeStats: TimeStats, newValue: number): void {
    if (!timeStats) return;

    timeStats.min = Math.min(timeStats.min, newValue);
    timeStats.max = Math.max(timeStats.max, newValue);
    timeStats.total += newValue;
    timeStats.avg = timeStats.total / this.dailyStats!.totalCycles;
  }

  private updateDefectTypeStats(
    current: DefectTypeStats,
    new_stats: DefectTypeStats
  ): void {
    if (!current || !new_stats) return;

    for (const className of Object.keys(new_stats) as ClassName[]) {
      const newStats = new_stats[className];
      if (!newStats) continue;

      if (!current[className]) {
        current[className] = this.createNewDefectStats();
      }

      const currentStats = current[className]!;
      currentStats.count += newStats.count;
      currentStats.totalArea += newStats.totalArea;
      currentStats.minArea = Math.min(currentStats.minArea, newStats.minArea);
      currentStats.maxArea = Math.max(currentStats.maxArea, newStats.maxArea);
      currentStats.avgArea = currentStats.totalArea / currentStats.count;
      currentStats.minConfidence = Math.min(
        currentStats.minConfidence,
        newStats.minConfidence
      );
      currentStats.maxConfidence = Math.max(
        currentStats.maxConfidence,
        newStats.maxConfidence
      );
      currentStats.avgConfidence =
        (currentStats.avgConfidence * (currentStats.count - 1) +
          newStats.avgConfidence) /
        currentStats.count;
    }
  }

  private async saveCycleStats(stats: CycleStats): Promise<void> {
    const date = new Date().toISOString().split("T")[0];
    const cyclesDir = path.join(this.statsDir, "cycles", date);
    await fs.mkdir(cyclesDir, { recursive: true });

    const filePath = path.join(cyclesDir, `${stats.cycleId}.json`);
    await fs.writeFile(filePath, JSON.stringify(stats, null, 2));
  }

  private async saveDailyStats(): Promise<void> {
    if (!this.dailyStats) return;

    const dailyStatsDir = path.join(this.statsDir, "daily");
    await fs.mkdir(dailyStatsDir, { recursive: true });

    const filePath = path.join(dailyStatsDir, `${this.dailyStats.date}.json`);
    await fs.writeFile(filePath, JSON.stringify(this.dailyStats, null, 2));
  }

  recordSensor1Trigger(): void {
    if (this.currentCycle) {
      this.sensor1TriggerTime = Date.now();
      console.log(
        `[Stats] Sensor1 trigger recorded at ${this.sensor1TriggerTime}`
      );
    } else {
      console.log("[Stats] Warning: Sensor1 triggered but no active cycle");
    }
  }
}
