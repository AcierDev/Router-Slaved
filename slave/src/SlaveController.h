#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>

// Define your custom types here
enum class Status { IDLE, BUSY, ERROR };

struct Settings {
  // Define your settings here
  // Example: int motorSpeed;
};

class SlaveController {
 private:
  Status currentStatus;
  Settings settings;
  bool pushCylinderState;
  bool ejectionCylinderState;

  void processCommand(const String& command);
  void updateSettings(const JsonObject& json);
  void sendState();
  String stateToString(Status state);
  void sendWarning(const String& message);
  void sendError(const String& message);

 public:
  SlaveController();
  void setup();
  void loop();

  void turnOnPushCylinder();
  void turnOffPushCylinder();
  void turnOnEjectionCylinder();
  void turnOffEjectionCylinder();
};
