#pragma once

#include <Arduino.h>

#include "config.h"

enum class RouterState { IDLE, WAITING_FOR_PUSH, PUSHING, RAISING, ERROR };

class RouterController {
 private:
  RouterState currentState;
  unsigned long cycleStartTime;
  unsigned long stateStartTime;

  // Settings
  unsigned long pushTime;
  unsigned long riserTime;

  // Cylinder states
  bool pushCylinderState;
  bool riserCylinderState;

  void updateState();
  void startCycle();
  void activatePushCylinder();
  void deactivatePushCylinder();
  void activateRiserCylinder();
  void deactivateRiserCylinder();
  bool isSensor1Active();

 public:
  RouterController();
  void setup();
  void loop();

  // Getters
  RouterState getState() const { return currentState; }
  bool isPushCylinderActive() const { return pushCylinderState; }
  bool isRiserCylinderActive() const { return riserCylinderState; }

  // Settings
  void setPushTime(unsigned long timeMs) { pushTime = timeMs; }
  void setRiserTime(unsigned long timeMs) { riserTime = timeMs; }
  unsigned long getPushTime() const { return pushTime; }
  unsigned long getRiserTime() const { return riserTime; }
};