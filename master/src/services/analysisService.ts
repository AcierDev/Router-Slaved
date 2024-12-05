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
  private debug: boolean;

  constructor(
    apiUrl: string = "http://192.168.1.210:5000",
    debug: boolean = false
  ) {
    this.apiUrl = apiUrl;
    this.debug = debug;
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

  shouldEject(
    predictions: Prediction[],
    settings: EjectionSettings
  ): { decision: boolean; reasons: string[] } {
    console.log("\n[Ejection Decision] Starting ejection decision process");
    console.log(
      `[Ejection Decision] Received ${predictions.length} predictions`
    );

    const reasons: string[] = [];

    if (predictions.length === 0) {
      reasons.push("[Ejection Decision] No defects detected");
      return { decision: false, reasons };
    }

    // Filter predictions based on enabled classes and ROI
    console.log(
      "[Ejection Decision] Filtering predictions based on basic criteria"
    );
    const validPredictions = predictions.filter((pred) => {
      const className = pred.class_name;
      const classConfig = settings.perClassSettings[className];

      if (!classConfig?.enabled) {
        console.log(
          `[Filter] ${className}: Rejected - Class disabled or not configured`
        );
        return false;
      }

      const meetsROI = this.isInRegionOfInterest(
        pred.bbox,
        settings.advancedSettings.regionOfInterest
      );
      console.log(
        `[Filter] ${className} ROI check: ${meetsROI ? "PASS" : "FAIL"}`
      );

      return meetsROI;
    });

    if (validPredictions.length === 0) {
      reasons.push("No defects in valid regions");
      return { decision: false, reasons };
    }

    // Check global criteria
    const globalCheck = this.checkGlobalCriteria(validPredictions, settings);
    if (globalCheck.shouldEject) {
      reasons.push(globalCheck.reason || "");
      return { decision: true, reasons };
    }

    // Check per-class criteria
    const perClassCheck = this.checkPerClassCriteria(
      validPredictions,
      settings
    );
    if (perClassCheck.shouldEject) {
      reasons.push(perClassCheck.reason || "");
      return { decision: true, reasons };
    }

    reasons.push("No ejection criteria met");
    return { decision: false, reasons };
  }

  private checkGlobalCriteria(
    validPredictions: Prediction[],
    settings: EjectionSettings
  ): { shouldEject: boolean; reason?: string } {
    console.log("[Global Criteria] Checking global ejection criteria");
    const { globalSettings } = settings;

    // Check maximum defects limit
    if (validPredictions.length >= globalSettings.maxDefectsBeforeEject) {
      return {
        shouldEject: true,
        reason: `Maximum defect count exceeded (${validPredictions.length} >= ${globalSettings.maxDefectsBeforeEject})`,
      };
    }

    // Check multiple defects requirement
    if (globalSettings.requireMultipleDefects && validPredictions.length >= 2) {
      return {
        shouldEject: true,
        reason: `Multiple defects detected (${validPredictions.length})`,
      };
    }

    // Check total area
    const totalArea = validPredictions.reduce(
      (sum, pred) => sum + this.calculateArea(pred.bbox),
      0
    );
    if (totalArea >= globalSettings.minTotalArea) {
      return {
        shouldEject: true,
        reason: `Total area threshold exceeded (${totalArea.toFixed(2)} >= ${
          globalSettings.minTotalArea
        })`,
      };
    }

    // Check overlap if enabled
    if (settings.advancedSettings.considerOverlap) {
      const overlapArea = this.calculateOverlap(validPredictions);
      if (overlapArea > 0) {
        return {
          shouldEject: true,
          reason: `Overlapping defects detected (${overlapArea.toFixed(
            2
          )} sq px)`,
        };
      }
    }

    return { shouldEject: false };
  }

  private checkPerClassCriteria(
    predictions: Prediction[],
    settings: EjectionSettings
  ): { shouldEject: boolean; reason?: string } {
    console.log("[Per-Class Criteria] Checking per-class ejection criteria");

    // Check individual predictions against class-specific criteria
    for (const pred of predictions) {
      const className = pred.class_name;
      const classConfig = settings.perClassSettings[className];
      const area = this.calculateArea(pred.bbox);

      console.log(`[Per-Class] Evaluating ${className}:`);
      console.log(
        `  Confidence: ${pred.confidence} (min: ${classConfig.minConfidence})`
      );
      console.log(`  Area: ${area} (min: ${classConfig.minArea || "none"})`);

      if (
        pred.confidence >= classConfig.minConfidence &&
        area >= classConfig.minArea
      ) {
        return {
          shouldEject: true,
          reason: `Class-specific criteria met for ${className} (confidence: ${pred.confidence.toFixed(
            2
          )}, area: ${area.toFixed(2)})`,
        };
      }
    }

    // Check class count limits
    const countByClass: Record<string, number> = {};
    for (const pred of predictions) {
      countByClass[pred.class_name] = (countByClass[pred.class_name] || 0) + 1;
      const classConfig = settings.perClassSettings[pred.class_name];

      if (countByClass[pred.class_name] > classConfig.maxCount) {
        return {
          shouldEject: true,
          reason: `Maximum count exceeded for class ${pred.class_name} (${
            countByClass[pred.class_name]
          } > ${classConfig.maxCount})`,
        };
      }
    }

    return { shouldEject: false };
  }

  private isInRegionOfInterest(bbox: BoundingBox, roi?: Region): boolean {
    if (!roi) {
      console.log("[ROI Check] No ROI configured, allowing all regions");
      return true;
    }

    const [x1, y1, x2, y2] = Object.values(bbox);
    const isInside = !(
      x1 > roi.x + roi.width ||
      x2 < roi.x ||
      y1 > roi.y + roi.height ||
      y2 < roi.y
    );

    console.log(`[ROI Check] BBox ${JSON.stringify(bbox)}`);
    console.log(`[ROI Check] ROI: ${JSON.stringify(roi)}`);
    console.log(`[ROI Check] Is inside ROI: ${isInside}`);
    return isInside;
  }

  private calculateOverlap(predictions: Prediction[]): number {
    if (predictions.length < 2) {
      return 0;
    }

    let totalOverlap = 0;

    for (let i = 0; i < predictions.length; i++) {
      for (let j = i + 1; j < predictions.length; j++) {
        const box1 = predictions[i].bbox;
        const box2 = predictions[j].bbox;

        const xOverlap = Math.max(
          0,
          Math.min(box1[2], box2[2]) - Math.max(box1[0], box2[0])
        );
        const yOverlap = Math.max(
          0,
          Math.min(box1[3], box2[3]) - Math.max(box1[1], box2[1])
        );

        const overlap = xOverlap * yOverlap;
        totalOverlap += overlap;

        if (this.debug) {
          console.log(
            `Overlap between prediction ${i} and ${j}: ${overlap.toFixed(2)}`
          );
        }
      }
    }

    return totalOverlap;
  }

  public calculateArea(bbox: BoundingBox): number {
    // Convert relative coordinates to absolute area (assuming image dimensions of 1.0 x 1.0)
    const width = bbox[2] - bbox[0];
    const height = bbox[3] - bbox[1];
    // Convert to square pixels (assuming standard 1000x1000 reference)
    const area = width * height * 1000000;

    if (this.debug) {
      console.log(`Area calculation:
        Width: ${width.toFixed(4)} (${bbox[2].toFixed(4)} - ${bbox[0].toFixed(
        4
      )})
        Height: ${height.toFixed(4)} (${bbox[3].toFixed(4)} - ${bbox[1].toFixed(
        4
      )})
        Area: ${area.toFixed(2)} sq px`);
    }

    return area;
  }

  // Helper method to get center point of a bounding box
  private getBBoxCenter(bbox: BoundingBox): { x: number; y: number } {
    return {
      x: (bbox[0] + bbox[2]) / 2,
      y: (bbox[1] + bbox[3]) / 2,
    };
  }

  // Helper method to get dimensions of a bounding box
  private getBBoxDimensions(bbox: BoundingBox): {
    width: number;
    height: number;
  } {
    return {
      width: bbox[2] - bbox[0],
      height: bbox[3] - bbox[1],
    };
  }
}
