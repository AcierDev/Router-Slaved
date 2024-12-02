#include "RouterController.h"

RouterController::RouterController()
    : currentState(RouterState::IDLE),
      cycleStartTime(0),
      stateStartTime(0),
      pushTime(DEFAULT_PUSH_TIME),
      riserTime(DEFAULT_RISER_TIME),
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
        deactivateRiserCylinder();
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