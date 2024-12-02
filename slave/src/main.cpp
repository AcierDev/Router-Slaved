#include "SlaveController.h"

SlaveController controller;

void setup() {
  Serial.begin(115200);
  Serial.println("Main setup started");
  controller.setup();
  Serial.println("Main setup completed");
}

void loop() {
  controller.loop();
}