#ifndef CONFIG_H
#define CONFIG_H

// Pin Definitions

#define LED_PIN 13  // Built-in LED pin for many Arduino boards
#define PUSH_CYLINDER_PIN 18
#define EJECTION_CYLINDER_PIN 19
#define SENSOR1_PIN 17

// Constants
#define BAUD_RATE 115200
#define BUTTON_DEBOUNCE_MS 50

// Macros for easier pin operations
#define TURN_ON(pin) digitalWrite(pin, HIGH)
#define TURN_OFF(pin) digitalWrite(pin, LOW)
#define READ_PIN(pin) digitalRead(pin)

#endif  // CONFIG_H
