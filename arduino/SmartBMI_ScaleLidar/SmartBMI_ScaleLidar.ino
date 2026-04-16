#include <Wire.h>
#include <TFLI2C.h>
#include "HX711.h"

// ---------------- HX711 Load Cell ----------------
#define DOUT 3
#define CLK 2
HX711 scale;
float calibration_factor = 22513.7; // tuned from 64.0 avg to 64.5 manual

// ---------------- TF-Luna LiDAR ----------------
TFLI2C lidar;
int16_t distance = 0;
int16_t addr = TFL_DEF_ADR;  // 0x10 default I2C address

static const unsigned long SERIAL_BAUD = 115200;
static const unsigned long HX711_BOOT_WAIT_MS = 3000;
static const unsigned long HX711_READ_WAIT_MS = 250;
static const unsigned long LOOP_DELAY_MS = 300;

bool hx711Ready = false;

void printWeightUnavailable() {
  Serial.println("Local Weight: ERROR");
  // Keep the Pi-side parser alive instead of going silent.
  Serial.println("WEIGHT:0.00");
}

void setup() {
  Serial.begin(SERIAL_BAUD);
  Wire.begin();

  Serial.println("SMARTBMI BOOT");

  scale.begin(DOUT, CLK);

  if (scale.wait_ready_timeout(HX711_BOOT_WAIT_MS)) {
    scale.set_scale(calibration_factor);
    scale.tare();
    hx711Ready = true;
    Serial.println("HX711 READY");
  } else {
    hx711Ready = false;
    Serial.println("HX711 NOT READY");
  }

  Serial.println("SCALE+LIDAR READY");
}

void loop() {
  float weight = 0.0;

  // ---------- Read weight without blocking forever ----------
  if (scale.wait_ready_timeout(HX711_READ_WAIT_MS)) {
    if (!hx711Ready) {
      scale.set_scale(calibration_factor);
      scale.tare();
      hx711Ready = true;
      Serial.println("HX711 RECOVERED");
    }

    weight = scale.get_units(8);
    if (weight < 0) {
      weight = 0.0;
    }

    Serial.print("Local Weight (kg): ");
    Serial.println(weight, 2);
    Serial.print("WEIGHT:");
    Serial.println(weight, 2);
  } else {
    hx711Ready = false;
    printWeightUnavailable();
  }

  // ---------- Read distance ----------
  bool lidar_ok = lidar.getData(distance, addr);
  if (lidar_ok) {
    Serial.print("Local Distance (cm): ");
    Serial.println(distance);
    Serial.print("DIST:");
    Serial.println(distance);
  } else {
    Serial.println("Local Distance: ERROR");
    Serial.println("DIST:ERR");
  }

  delay(LOOP_DELAY_MS);
}
