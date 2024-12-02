#include "SlaveController.h"

#include "config.h"

SlaveController::SlaveController() : currentStatus(Status::IDLE) {
  // Initialize your hardware here
}

void SlaveController::setup() {
  Serial.begin(BAUD_RATE);
  pinMode(PUSH_CYLINDER_PIN, OUTPUT);
  pinMode(EJECTION_CYLINDER_PIN, OUTPUT);
  digitalWrite(PUSH_CYLINDER_PIN, LOW);
  digitalWrite(EJECTION_CYLINDER_PIN, LOW);
  // pinMode(LED_PIN, OUTPUT);
}

void SlaveController::loop() {
  static unsigned long lastLoopTime = 0;
  unsigned long currentTime = millis();


  if (Serial.available()) {
    String input = Serial.readStringUntil('\n');
    input.trim();

    Serial.println("Received input: " + input);

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

  // Send state updates periodically
  static unsigned long lastUpdate = 0;
  if (currentTime - lastUpdate > 5000) {  // Send update every second
    sendState();
    lastUpdate = currentTime;
  }

  delay(10);
}

void SlaveController::processCommand(const String& command) {
  Serial.println("Processing command: " + command);
  if (command == "PUSH_ON") {
    if (ejectionCylinderState) {
      sendWarning("Attempting to push while ejection is active");
    }
    turnOnPushCylinder();
  } else if (command == "PUSH_OFF") {
    turnOffPushCylinder();
  } else if (command == "EJECT_ON") {
    if (pushCylinderState) {
      sendWarning("Attempting to eject while push is active");
    }
    turnOnEjectionCylinder();
  } else if (command == "EJECT_OFF") {
    turnOffEjectionCylinder();
  } else {
    sendError("Unknown command: " + command);
  }
}

void SlaveController::updateSettings(const JsonObject& json) {
  Serial.println("Updating settings");
  // Add more settings as needed
}

void SlaveController::sendState() {
  StaticJsonDocument<200> doc;
  doc["status"] = stateToString(currentStatus);
  doc["push_cylinder"] = pushCylinderState ? "ON" : "OFF";
  doc["ejection_cylinder"] = ejectionCylinderState ? "ON" : "OFF";
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

void SlaveController::turnOnPushCylinder() {
  digitalWrite(PUSH_CYLINDER_PIN, HIGH);
  pushCylinderState = true;
  currentStatus = Status::BUSY;
}

void SlaveController::turnOffPushCylinder() {
  digitalWrite(PUSH_CYLINDER_PIN, LOW);
  pushCylinderState = false;
  if (!ejectionCylinderState) {
    currentStatus = Status::IDLE;
  }
}

void SlaveController::turnOnEjectionCylinder() {
  digitalWrite(EJECTION_CYLINDER_PIN, HIGH);
  ejectionCylinderState = true;
  currentStatus = Status::BUSY;
}

void SlaveController::turnOffEjectionCylinder() {
  digitalWrite(EJECTION_CYLINDER_PIN, LOW);
  ejectionCylinderState = false;
  if (!pushCylinderState) {
    currentStatus = Status::IDLE;
  }
}

void SlaveController::sendWarning(const String& message) {
  Serial.println("WARNING " + message);
}

void SlaveController::sendError(const String& message) {
  Serial.println("ERROR " + message);
  currentStatus = Status::ERROR;
}