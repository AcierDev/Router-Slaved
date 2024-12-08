#pragma once

#include <Arduino.h>
#include <Bounce2.h>

#include "config.h"

enum class RouterState {
  IDLE,
  WAITING_FOR_PUSH,
  PUSHING,
  RAISING,
  WAITING_FOR_ANALYSIS,
  EJECTING,
  LOWERING,
  ERROR
};

class RouterController {
 private:
  RouterState currentState;
  unsigned long cycleStartTime;
  unsigned long stateStartTime;

  // Settings
  unsigned long pushTime;
  unsigned long riserTime;
  unsigned long ejectionTime;
  bool analysisMode;
  bool analysisComplete;
  bool shouldEject;

  // Cylinder states
  bool pushCylinderState;
  bool riserCylinderState;
  bool ejectionCylinderState;

  bool lastSensor1State = false;
  unsigned long lastSensor1ChangeTime = 0;

  Bounce sensor1Debouncer;

  unsigned long cycleCount = 0;
  unsigned long lastCycleTime = 0;

  void updateState();
  void startCycle();
  void activatePushCylinder();
  void deactivatePushCylinder();
  void activateRiserCylinder();
  void deactivateRiserCylinder();
  void startAnalysis();
  void handleAnalysisResponse(bool eject);
  void abortAnalysis();
  void startEjection();
  void lowerAndWait();
  void broadcastState();

 public:
  RouterController();
  void setup();
  void loop();

  // Getters
  RouterState getState() const { return currentState; }
  bool isPushCylinderActive() const { return pushCylinderState; }
  bool isRiserCylinderActive() const { return riserCylinderState; }
  bool isEjectionCylinderActive() const { return ejectionCylinderState; }
  bool isSensor1Active();

  // Settings
  void setPushTime(unsigned long timeMs) { pushTime = timeMs; }
  void setRiserTime(unsigned long timeMs) { riserTime = timeMs; }
  unsigned long getPushTime() const { return pushTime; }
  unsigned long getRiserTime() const { return riserTime; }
  void setEjectionTime(unsigned long timeMs) { ejectionTime = timeMs; }
  void setAnalysisMode(bool enabled) { analysisMode = enabled; }
  void handleAnalysisResult(bool eject);
  void abortCurrentAnalysis();
  unsigned long getEjectionTime() const { return ejectionTime; }
  bool isAnalysisModeEnabled() const { return analysisMode; }

  void (*onStateChange)() =
      nullptr;  // Function pointer for state change callback
  void setStateChangeCallback(void (*callback)()) { onStateChange = callback; }

  unsigned long getCycleCount() const { return cycleCount; }
  unsigned long getLastCycleTime() const { return lastCycleTime; }
};