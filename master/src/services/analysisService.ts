import axios from "axios";
import fs from "fs";
import path from "path";
import {
  BoundingBox,
  DetectionResponse,
  Prediction,
  Region,
  ClassName,
  EjectionSettings,
} from "../typings/types.js";

export class AnalysisService {
  private apiUrl: string;

  constructor(apiUrl: string = "http://192.168.1.210:5000") {
    this.apiUrl = apiUrl;
  }

  async analyzeImage(imagePath: string): Promise<DetectionResponse> {
    const formData = new FormData();
    const imageBuffer = await fs.promises.readFile(imagePath);
    formData.append("image", new Blob([imageBuffer]), path.basename(imagePath));

    try {
      const response = await fetch(`${this.apiUrl}/detect-imperfection`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Detection API returned ${response.status}`);
      }

      const results: DetectionResponse = await response.json();

      return results;
    } catch (error) {
      throw new Error(
        `Analysis request failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  shouldEject(predictions: Prediction[], settings: EjectionSettings): boolean {
    const { globalSettings, perClassSettings, advancedSettings } = settings;

    let totalArea = 0;
    const defectCounts: Partial<Record<ClassName, number>> = {};

    for (const prediction of predictions) {
      const classSettings = perClassSettings[prediction.class_name];

      if (
        !this.isValidPrediction(prediction, classSettings, advancedSettings)
      ) {
        continue;
      }

      const area = this.calculateArea(prediction.bbox);
      totalArea += area;
      defectCounts[prediction.class_name] =
        (defectCounts[prediction.class_name] || 0) + 1;
    }

    return this.checkEjectionConditions(totalArea, defectCounts, settings);
  }

  private isValidPrediction(
    prediction: Prediction,
    classSettings: {
      enabled: boolean;
      minConfidence: number;
      minArea: number;
    },
    advancedSettings: {
      regionOfInterest?: Region;
      exclusionZones: Region[];
    }
  ): boolean {
    if (
      !classSettings.enabled ||
      prediction.confidence < classSettings.minConfidence
    ) {
      return false;
    }

    const area = this.calculateArea(prediction.bbox);
    if (area < classSettings.minArea) {
      return false;
    }

    if (
      advancedSettings.regionOfInterest &&
      !this.isInRegion(prediction.bbox, advancedSettings.regionOfInterest)
    ) {
      return false;
    }

    if (
      advancedSettings.exclusionZones.some((zone: Region) =>
        this.isInRegion(prediction.bbox, zone)
      )
    ) {
      return false;
    }

    return true;
  }

  private calculateArea(bbox: BoundingBox): number {
    return (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]);
  }

  private isInRegion(bbox: BoundingBox, region: Region): boolean {
    const centerX = (bbox[0] + bbox[2]) / 2;
    const centerY = (bbox[1] + bbox[3]) / 2;

    return (
      centerX >= region.x &&
      centerX <= region.x + region.width &&
      centerY >= region.y &&
      centerY <= region.y + region.height
    );
  }

  private checkEjectionConditions(
    totalArea: number,
    defectCounts: Partial<Record<ClassName, number>>,
    settings: EjectionSettings
  ): boolean {
    const { globalSettings, perClassSettings } = settings;

    if (totalArea < globalSettings.minTotalArea) {
      return false;
    }

    for (const className of Object.keys(defectCounts) as ClassName[]) {
      const count = defectCounts[className] || 0;
      if (count > perClassSettings[className].maxCount) {
        return true;
      }
    }

    const totalDefects = Object.values(defectCounts).reduce(
      (sum, count) => sum + (count || 0),
      0
    );
    if (totalDefects > globalSettings.maxDefectsBeforeEject) {
      return true;
    }

    return false;
  }
}
