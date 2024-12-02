import { SerialPort } from "serialport";

export async function detectMicrocontrollerPort(): Promise<string | null> {
  try {
    const ports = await SerialPort.list();
    console.log("Available ports:", ports);

    // Known USB-to-Serial converter IDs
    const knownVendorIds = [
      "1a86", // CH340
      "0403", // FTDI
      "10c4", // Silicon Labs CP210x
      "1781", // Multiple Arduino vendors
    ];

    // First try to find a port by vendor ID
    const microcontrollerPort = ports.find((port) => {
      // Convert vendorId to lowercase if it exists
      const vendorId = port.vendorId?.toLowerCase();
      return vendorId && knownVendorIds.includes(vendorId);
    });

    if (microcontrollerPort) {
      return microcontrollerPort.path;
    }

    // Fallback: look for common USB serial port patterns
    const serialPort = ports.find((port) => {
      const path = port.path.toLowerCase();
      return (
        path.includes("usbserial") ||
        path.includes("cu.wchusbserial") ||
        path.includes("ttyusb") ||
        path.includes("ttyacm")
      );
    });

    return serialPort ? serialPort.path : null;
  } catch (error) {
    console.error("Error detecting microcontroller port:", error);
    return null;
  }
}
