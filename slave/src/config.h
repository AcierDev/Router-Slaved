#ifndef CONFIG_H
#define CONFIG_H

// Pin Definitions
#define LED_PIN 13
#define PUSH_CYLINDER_PIN 18
#define EJECTION_CYLINDER_PIN 5
#define RISER_CYLINDER_PIN 19
#define SENSOR1_PIN 25

// Constants
#define BAUD_RATE 115200
#define BUTTON_DEBOUNCE_MS 50

// Default timing values (in milliseconds)
#define DEFAULT_PUSH_TIME 3000
#define DEFAULT_RISER_TIME 3000
#define DEFAULT_EJECTION_TIME 1000
#define ANALYSIS_TIMEOUT 5000
#define CYCLE_DELAY 1000
#define SENSOR_DELAY_TIME 300
#define SENSOR_DEBOUNCE_TIME 100  // 50ms debounce time

#endif  // CONFIG_H
