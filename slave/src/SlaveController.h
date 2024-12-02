#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>

#include "RouterController.h"

// Define your custom types here
enum class Status { IDLE, BUSY, ERROR };

struct Settings {
  unsigned long pushTime;
  unsigned long riserTime;
  unsigned long ejectionTime;
  bool analysisMode;
};

class SlaveController {
 private:
  static SlaveController* instance;
  static void staticSendState();
  Status currentStatus;
  Settings settings;
  RouterController router;

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
};
