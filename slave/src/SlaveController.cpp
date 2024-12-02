#include "SlaveController.h"

SlaveController::SlaveController() : currentState(State::IDLE) {
  // Initialize your hardware here
}

void SlaveController::setup() {
  Serial.begin(115200);
  // Set up your hardware pins here
  // Example: pinMode(LED_PIN, OUTPUT);
}

void SlaveController::loop() {
  if (Serial.available()) {
    String input = Serial.readStringUntil('\n');
    input.trim();

    if (input.startsWith("SETTINGS ")) {
      StaticJsonDocument<200> doc;
      DeserializationError error = deserializeJson(doc, input.substring(9));

      if (error) {
        Serial.println("Failed to parse settings");
      } else {
        updateSettings(doc.as<JsonObject>());
      }
    } else {
      processCommand(input);
    }
  }

  // Perform your main logic here
  // Example: readSensors();
  //          controlActuators();

  // Send state updates periodically
  static unsigned long lastUpdate = 0;
  if (millis() - lastUpdate > 1000) {  // Send update every second
    sendState();
    lastUpdate = millis();
  }
}

void SlaveController::processCommand(const String& command) {
  // Process incoming commands
  // Example: if (command == "START") { ... }
}

void SlaveController::updateSettings(const JsonObject& json) {
  // Update settings from JSON
  // Example: if (json.containsKey("motorSpeed")) { settings.motorSpeed =
  // json["motorSpeed"]; }
}

void SlaveController::sendState() {
  StaticJsonDocument<200> doc;
  doc["status"] = stateToString(currentState);

  // Add sensor readings or other state information
  // Example: doc["sensors"]["limit1"] = digitalRead(LIMIT_SWITCH_1_PIN);

  String output;
  serializeJson(doc, output);
  Serial.println("STATE " + output);
}

String SlaveController::stateToString(State state) {
  switch (state) {
    case State::IDLE:
      return "IDLE";
    case State::BUSY:
      return "BUSY";
    case State::ERROR:
      return "ERROR";
    default:
      return "UNKNOWN";
  }
}