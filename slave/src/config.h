#ifndef CONFIG_H
#define CONFIG_H

// Pin Definitions
#define LED_PIN 13
#define PUSH_CYLINDER_PIN 18
#define EJECTION_CYLINDER_PIN 19
#define RISER_CYLINDER_PIN 16
#define SENSOR1_PIN 17

// Constants
#define BAUD_RATE 115200
#define BUTTON_DEBOUNCE_MS 50

// Default timing values (in milliseconds)
#define DEFAULT_PUSH_TIME 3000
#define DEFAULT_RISER_TIME 3000
#define SENSOR_DELAY_TIME 300

#endif  // CONFIG_H
