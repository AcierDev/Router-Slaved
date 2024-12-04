#include "RouterController.h"

RouterController::RouterController()
    : currentState(RouterState::IDLE),
      cycleStartTime(0),
      stateStartTime(0),
      pushTime(DEFAULT_PUSH_TIME),
      riserTime(DEFAULT_RISER_TIME),
      ejectionTime(DEFAULT_EJECTION_TIME),
      analysisMode(true),
      analysisComplete(false),
      shouldEject(false),
      pushCylinderState(false),
      riserCylinderState(false),
      ejectionCylinderState(false) {}

void RouterController::setup() {
  pinMode(PUSH_CYLINDER_PIN, OUTPUT);
  pinMode(RISER_CYLINDER_PIN, OUTPUT);
  pinMode(SENSOR1_PIN, INPUT);

  digitalWrite(PUSH_CYLINDER_PIN, HIGH);
  digitalWrite(RISER_CYLINDER_PIN, HIGH);
  digitalWrite(EJECTION_CYLINDER_PIN, HIGH);
}

void RouterController::loop() {
  // Check sensor in IDLE state
  if (currentState == RouterState::IDLE && isSensor1Active()) {
    startCycle();
    return;
  }

  updateState();
}

void RouterController::updateState() {
  unsigned long currentTime = millis();

  switch (currentState) {
    case RouterState::WAITING_FOR_PUSH:
      if (currentTime - stateStartTime >= SENSOR_DELAY_TIME) {
        currentState = RouterState::PUSHING;
        activatePushCylinder();
        stateStartTime = currentTime;
        broadcastState();
      }
      break;

    case RouterState::PUSHING:
      if (!isSensor1Active() && (currentTime - stateStartTime >= pushTime)) {
        currentState = RouterState::RAISING;
        deactivatePushCylinder();
        activateRiserCylinder();
        stateStartTime = currentTime;
        broadcastState();
      }
      break;

    case RouterState::RAISING:
      if (currentTime - stateStartTime >= riserTime) {
        if (analysisMode) {
          startAnalysis();
        } else {
          lowerAndWait();
        }
        broadcastState();
      }
      break;

    case RouterState::WAITING_FOR_ANALYSIS:
      if (currentTime - stateStartTime >= ANALYSIS_TIMEOUT) {
        abortAnalysis();
      }
      break;

    case RouterState::EJECTING:
      if (currentTime - stateStartTime >= ejectionTime) {
        digitalWrite(EJECTION_CYLINDER_PIN, HIGH);
        ejectionCylinderState = false;
        lowerAndWait();
        broadcastState();
      }
      break;

    case RouterState::LOWERING:
      if (currentTime - stateStartTime >= CYCLE_DELAY) {
        currentState = RouterState::IDLE;
        broadcastState();
      }
      break;

    case RouterState::ERROR:
      // Handle error state if needed
      break;

    default:
      break;
  }
}

void RouterController::startCycle() {
  cycleStartTime = millis();
  stateStartTime = cycleStartTime;
  currentState = RouterState::WAITING_FOR_PUSH;
  broadcastState();
}

void RouterController::activatePushCylinder() {
  digitalWrite(PUSH_CYLINDER_PIN, LOW);
  pushCylinderState = true;
  Serial.println("DEBUG: Push cylinder activated");
}

void RouterController::deactivatePushCylinder() {
  digitalWrite(PUSH_CYLINDER_PIN, HIGH);
  pushCylinderState = false;
  Serial.println("DEBUG: Push cylinder deactivated");
  broadcastState();
}

void RouterController::activateRiserCylinder() {
  digitalWrite(RISER_CYLINDER_PIN, LOW);
  riserCylinderState = true;
  Serial.println("DEBUG: Riser cylinder activated");
  broadcastState();
}

void RouterController::deactivateRiserCylinder() {
  digitalWrite(RISER_CYLINDER_PIN, HIGH);
  riserCylinderState = false;
  Serial.println("DEBUG: Riser cylinder deactivated");
  broadcastState();
}

bool RouterController::isSensor1Active() {
  return digitalRead(SENSOR1_PIN) == LOW;
}

void RouterController::startAnalysis() {
  stateStartTime = millis();
  currentState = RouterState::WAITING_FOR_ANALYSIS;
  analysisComplete = false;
  // Signal to master to start analysis
  Serial.println("SLAVE_REQUEST ANALYSIS_START");
}

void RouterController::handleAnalysisResult(bool eject) {
  if (currentState != RouterState::WAITING_FOR_ANALYSIS) {
    return;
  }

  analysisComplete = true;
  shouldEject = eject;

  if (eject) {
    startEjection();
  } else {
    lowerAndWait();
  }
}

void RouterController::abortAnalysis() {
  if (currentState != RouterState::WAITING_FOR_ANALYSIS) {
    return;
  }
  lowerAndWait();
}

void RouterController::startEjection() {
  digitalWrite(EJECTION_CYLINDER_PIN, LOW);
  ejectionCylinderState = true;
  Serial.println("DEBUG: Ejection cylinder activated");
  stateStartTime = millis();
  currentState = RouterState::EJECTING;
}

void RouterController::lowerAndWait() {
  deactivateRiserCylinder();
  stateStartTime = millis();
  currentState = RouterState::LOWERING;
}

void RouterController::abortCurrentAnalysis() {
  if (currentState == RouterState::WAITING_FOR_ANALYSIS) {
    abortAnalysis();
  }
}

void RouterController::broadcastState() {
  // Add debug logging for state changes
  Serial.print("DEBUG: Current state: ");
  switch (currentState) {
    case RouterState::IDLE:
      Serial.println("IDLE");
      break;
    case RouterState::WAITING_FOR_PUSH:
      Serial.println("WAITING_FOR_PUSH");
      break;
    case RouterState::PUSHING:
      Serial.println("PUSHING");
      break;
    case RouterState::RAISING:
      Serial.println("RAISING");
      break;
    case RouterState::WAITING_FOR_ANALYSIS:
      Serial.println("WAITING_FOR_ANALYSIS");
      break;
    case RouterState::EJECTING:
      Serial.println("EJECTING");
      break;
    case RouterState::LOWERING:
      Serial.println("LOWERING");
      break;
    case RouterState::ERROR:
      Serial.println("ERROR");
      break;
    default:
      Serial.println("UNKNOWN");
      break;
  }

  if (onStateChange) {
    onStateChange();
  }
}