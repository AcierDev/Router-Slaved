#include "SlaveController.h"

SlaveController::SlaveController() : currentStatus(Status::IDLE) {
  settings.pushTime = DEFAULT_PUSH_TIME;
  settings.riserTime = DEFAULT_RISER_TIME;
}

void SlaveController::setup() {
  Serial.begin(BAUD_RATE);
  router.setup();
}

void SlaveController::loop() {
  if (Serial.available()) {
    String input = Serial.readStringUntil('\n');
    input.trim();

    if (input.startsWith("SETTINGS ")) {
      StaticJsonDocument<200> doc;
      DeserializationError error = deserializeJson(doc, input.substring(9));

      if (error) {
        sendError("Failed to parse settings");
      } else {
        updateSettings(doc.as<JsonObject>());
      }
    } else {
      processCommand(input);
    }
  }

  // Update router state
  router.loop();

  // Send state updates periodically
  static unsigned long lastUpdate = 0;
  unsigned long currentTime = millis();
  if (currentTime - lastUpdate > 5000) {
    sendState();
    lastUpdate = currentTime;
  }
}

void SlaveController::processCommand(const String& command) {
  if (command == "STATUS") {
    sendState();
  } else if (command == "ABORT_ANALYSIS") {
    router.abortCurrentAnalysis();
  } else if (command.startsWith("ANALYSIS_RESULT ")) {
    bool shouldEject = command.substring(15) == "TRUE";
    router.handleAnalysisResult(shouldEject);
  } else {
    sendError("Unknown command: " + command);
  }
}

void SlaveController::updateSettings(const JsonObject& json) {
  if (json.containsKey("pushTime")) {
    settings.pushTime = json["pushTime"];
    router.setPushTime(settings.pushTime);
  }
  if (json.containsKey("riserTime")) {
    settings.riserTime = json["riserTime"];
    router.setRiserTime(settings.riserTime);
  }
  if (json.containsKey("ejectionTime")) {
    settings.ejectionTime = json["ejectionTime"];
    router.setEjectionTime(settings.ejectionTime);
  }
  if (json.containsKey("analysisMode")) {
    settings.analysisMode = json["analysisMode"];
    router.setAnalysisMode(settings.analysisMode);
  }
}

void SlaveController::sendState() {
  StaticJsonDocument<200> doc;
  doc["status"] = stateToString(currentStatus);
  doc["router_state"] = static_cast<int>(router.getState());
  doc["push_cylinder"] = router.isPushCylinderActive() ? "ON" : "OFF";
  doc["riser_cylinder"] = router.isRiserCylinderActive() ? "ON" : "OFF";
  doc["sensor1"] = digitalRead(SENSOR1_PIN);

  String output;
  serializeJson(doc, output);
  Serial.println("STATE " + output);
}

String SlaveController::stateToString(Status state) {
  switch (state) {
    case Status::IDLE:
      return "IDLE";
    case Status::BUSY:
      return "BUSY";
    case Status::ERROR:
      return "ERROR";
    default:
      return "UNKNOWN";
  }
}

void SlaveController::sendWarning(const String& message) {
  Serial.println("WARNING " + message);
}

void SlaveController::sendError(const String& message) {
  Serial.println("ERROR " + message);
  currentStatus = Status::ERROR;
}