#include "RouterController.h"

RouterController::RouterController()
    : currentState(RouterState::IDLE),
      cycleStartTime(0),
      stateStartTime(0),
      pushTime(DEFAULT_PUSH_TIME),
      riserTime(DEFAULT_RISER_TIME),
      ejectionTime(DEFAULT_EJECTION_TIME),
      analysisMode(false),
      analysisComplete(false),
      shouldEject(false),
      pushCylinderState(false),
      riserCylinderState(false) {}

void RouterController::setup() {
  pinMode(PUSH_CYLINDER_PIN, OUTPUT);
  pinMode(RISER_CYLINDER_PIN, OUTPUT);
  pinMode(SENSOR1_PIN, INPUT);

  digitalWrite(PUSH_CYLINDER_PIN, LOW);
  digitalWrite(RISER_CYLINDER_PIN, LOW);
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
        activatePushCylinder();
        stateStartTime = currentTime;
        currentState = RouterState::PUSHING;
      }
      break;

    case RouterState::PUSHING:
      if (!isSensor1Active() && (currentTime - stateStartTime >= pushTime)) {
        deactivatePushCylinder();
        activateRiserCylinder();
        stateStartTime = currentTime;
        currentState = RouterState::RAISING;
      }
      break;

    case RouterState::RAISING:
      if (currentTime - stateStartTime >= riserTime) {
        if (analysisMode) {
          startAnalysis();
        } else {
          lowerAndWait();
        }
      }
      break;

    case RouterState::WAITING_FOR_ANALYSIS:
      if (currentTime - stateStartTime >= ANALYSIS_TIMEOUT) {
        abortAnalysis();
      }
      break;

    case RouterState::EJECTING:
      if (currentTime - stateStartTime >= ejectionTime) {
        digitalWrite(EJECTION_CYLINDER_PIN, LOW);
        lowerAndWait();
      }
      break;

    case RouterState::LOWERING:
      if (currentTime - stateStartTime >= CYCLE_DELAY) {
        currentState = RouterState::IDLE;
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
}

void RouterController::activatePushCylinder() {
  digitalWrite(PUSH_CYLINDER_PIN, HIGH);
  pushCylinderState = true;
}

void RouterController::deactivatePushCylinder() {
  digitalWrite(PUSH_CYLINDER_PIN, LOW);
  pushCylinderState = false;
}

void RouterController::activateRiserCylinder() {
  digitalWrite(RISER_CYLINDER_PIN, HIGH);
  riserCylinderState = true;
}

void RouterController::deactivateRiserCylinder() {
  digitalWrite(RISER_CYLINDER_PIN, LOW);
  riserCylinderState = false;
}

bool RouterController::isSensor1Active() {
  return digitalRead(SENSOR1_PIN) == HIGH;
}

void RouterController::startAnalysis() {
  stateStartTime = millis();
  currentState = RouterState::WAITING_FOR_ANALYSIS;
  analysisComplete = false;
  // Signal to master to start analysis
  Serial.println("STATE_REQUEST ANALYSIS_START");
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
  digitalWrite(EJECTION_CYLINDER_PIN, HIGH);
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