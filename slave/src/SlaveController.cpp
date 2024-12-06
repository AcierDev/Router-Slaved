#include "SlaveController.h"

#include <EEPROM.h>
#define BOOT_COUNT_ADDR 0
#define HEARTBEAT_INTERVAL 1000  // Send heartbeat every 1 second

#include <esp_task_wdt.h>

SlaveController* SlaveController::instance = nullptr;

String routerStateToString(RouterState state) {
  switch (state) {
    case RouterState::IDLE:
      return "IDLE";
    case RouterState::WAITING_FOR_PUSH:
      return "WAITING_FOR_PUSH";
    case RouterState::PUSHING:
      return "PUSHING";
    case RouterState::RAISING:
      return "RAISING";
    case RouterState::WAITING_FOR_ANALYSIS:
      return "WAITING_FOR_ANALYSIS";
    case RouterState::EJECTING:
      return "EJECTING";
    case RouterState::LOWERING:
      return "LOWERING";
    case RouterState::ERROR:
      return "ERROR";
    default:
      return "UNKNOWN";
  }
}

void SlaveController::staticSendState() { instance->sendState(); }

SlaveController::SlaveController() : currentStatus(Status::IDLE) {
  instance = this;
  settings.pushTime = DEFAULT_PUSH_TIME;
  settings.riserTime = DEFAULT_RISER_TIME;
  lastHeartbeatTime = 0;

  // Read and increment boot count
  EEPROM.begin(4);
  bootCount = EEPROM.read(BOOT_COUNT_ADDR);
  bootCount++;
  EEPROM.write(BOOT_COUNT_ADDR, bootCount);
  EEPROM.commit();

  // Log boot count
  Serial.print("DEBUG: Boot count: ");
  Serial.println(bootCount);

  router.setStateChangeCallback(&SlaveController::staticSendState);
}

void SlaveController::setup() {
  Serial.begin(BAUD_RATE);
  router.setup();

  // Configure watchdog
  esp_task_wdt_init(5, true);  // 5 second timeout
  esp_task_wdt_add(NULL);
}

void SlaveController::loop() {
  unsigned long currentTime = millis();

  // Send heartbeat
  if (currentTime - lastHeartbeatTime >= HEARTBEAT_INTERVAL) {
    sendHeartbeat();
    lastHeartbeatTime = currentTime;
  }

  // Pat the watchdog
  esp_task_wdt_reset();

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
}

void SlaveController::processCommand(const String& command) {
  if (command == "STATUS") {
    sendState();
  } else if (command == "ABORT_ANALYSIS") {
    router.abortCurrentAnalysis();
  } else if (command.startsWith("ANALYSIS_RESULT ")) {
    String result = command.substring(15);
    result.trim();
    bool shouldEject = (result == "TRUE");

    Serial.print("DEBUG: Analysis result received. Raw value: '");
    Serial.print(result);
    Serial.println("'");
    Serial.println(shouldEject ? "Decision: EJECT" : "Decision: PASS");

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
  doc["router_state"] = routerStateToString(router.getState());
  doc["push_cylinder"] = router.isPushCylinderActive() ? "ON" : "OFF";
  doc["riser_cylinder"] = router.isRiserCylinderActive() ? "ON" : "OFF";
  doc["ejection_cylinder"] = router.isEjectionCylinderActive() ? "ON" : "OFF";
  doc["sensor1"] = router.isSensor1Active() ? "ON" : "OFF";

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

void SlaveController::sendHeartbeat() {
  StaticJsonDocument<100> doc;
  doc["type"] = "heartbeat";
  doc["uptime"] = millis();
  doc["boot_count"] = bootCount;

  String output;
  serializeJson(doc, output);
  Serial.println("HEARTBEAT " + output);
}