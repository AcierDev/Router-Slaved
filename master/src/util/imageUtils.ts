import fs from "fs/promises";

export async function imageToBase64(imagePath: string): Promise<string> {
  try {
    console.log(`Debug: Converting image to base64: ${imagePath}`);

    // Verify file exists and has size
    const stats = await fs.stat(imagePath);
    console.log(`Debug: Image file size: ${stats.size} bytes`);

    // Read the file
    const imageBuffer = await fs.readFile(imagePath);
    console.log(`Debug: Read image buffer size: ${imageBuffer.length} bytes`);

    // Convert to base64
    const base64String = imageBuffer.toString("base64");
    console.log(`Debug: Base64 string length: ${base64String.length}`);

    return base64String;
  } catch (error) {
    console.error("Debug: Error converting image to base64:", error);
    throw error;
  }
}
