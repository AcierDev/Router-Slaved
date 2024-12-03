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

  void processCommand(const String& command);
  void updateSettings(const JsonObject& json);
  void sendState();
  String stateToString(Status state);

 public:
  SlaveController();
  void setup();
  void loop();

  // Add any additional methods you need for your specific project
};