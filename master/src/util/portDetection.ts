import { SerialPort } from "serialport";

export async function detectMicrocontrollerPort(): Promise<string | null> {
  try {
    const ports = await SerialPort.list();
    const microcontrollerPort = ports.find(
      (port) =>
        port.manufacturer?.toLowerCase().includes("silicon labs") || // ESP32
        port.manufacturer?.toLowerCase().includes("espressif") || // ESP32
        port.manufacturer?.toLowerCase().includes("arduino") || // Arduino
        port.manufacturer?.toLowerCase().includes("wch.cn") || // CH340 chip often used with Arduino clones
        port.manufacturer?.toLowerCase().includes("ftdi") // FTDI chip often used with Arduino
    );

    return microcontrollerPort ? microcontrollerPort.path : null;
  } catch (error) {
    console.error("Error detecting microcontroller port:", error);
    return null;
  }
}
