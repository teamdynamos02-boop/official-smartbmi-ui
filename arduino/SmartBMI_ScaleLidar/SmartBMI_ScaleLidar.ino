#include <Wire.h>
#include <TFLI2C.h>
#include "HX711.h"
#include <math.h>

// ---------------- HX711 Load Cell ----------------
#define DOUT 3
#define CLK 2
HX711 scale;
float calibration_factor = 22552.7;

// Calibration notes:
// 1. Always tare with the platform empty.
// 2. If a known weight is consistently wrong, adjust calibration_factor first.
// 3. If the scale is consistently off by a small fixed amount after factor tuning,
//    use the Raspberry Pi weight_calibration.json offset for final correction.

// ---------------- TF-Luna LiDAR ----------------
TFLI2C lidar;
int16_t distance = 0;
int16_t addr = TFL_DEF_ADR;  // 0x10 default I2C address

static const unsigned long SERIAL_BAUD = 115200;
static const unsigned long HX711_BOOT_WAIT_MS = 3000;
static const unsigned long HX711_READ_WAIT_MS = 120;
static const unsigned long LOOP_DELAY_MS = 120;

static const byte WEIGHT_WINDOW = 7;
static const byte DIST_WINDOW = 5;
static const float MIN_PERSON_WEIGHT_KG = 8.0;
static const float WEIGHT_SPIKE_REJECT_KG = 1.2;
static const float WEIGHT_PENDING_MATCH_KG = 0.4;
static const byte WEIGHT_PENDING_CONFIRM_COUNT = 3;
static const int MIN_HEAD_DISTANCE_CM = 20;
static const int MAX_HEAD_DISTANCE_CM = 95;
static const byte LIDAR_RETRY_COUNT = 3;

bool hx711Ready = false;
float weightWindow[WEIGHT_WINDOW];
int distanceWindow[DIST_WINDOW];
byte weightCount = 0;
byte distanceCount = 0;
float lastFilteredWeight = 0.0;
float pendingWeight = 0.0;
byte pendingWeightCount = 0;

void printWeightUnavailable() {
  Serial.println("Local Weight: ERROR");
  Serial.println("WEIGHT_STATUS:ERROR");
}

float medianFloat(float *values, byte count) {
  float sorted[WEIGHT_WINDOW];
  for (byte i = 0; i < count; i++) sorted[i] = values[i];
  for (byte i = 0; i < count; i++) {
    for (byte j = i + 1; j < count; j++) {
      if (sorted[j] < sorted[i]) {
        float tmp = sorted[i];
        sorted[i] = sorted[j];
        sorted[j] = tmp;
      }
    }
  }
  return sorted[count / 2];
}

int medianInt(int *values, byte count) {
  int sorted[DIST_WINDOW];
  for (byte i = 0; i < count; i++) sorted[i] = values[i];
  for (byte i = 0; i < count; i++) {
    for (byte j = i + 1; j < count; j++) {
      if (sorted[j] < sorted[i]) {
        int tmp = sorted[i];
        sorted[i] = sorted[j];
        sorted[j] = tmp;
      }
    }
  }
  return sorted[count / 2];
}

void pushWeight(float value) {
  if (weightCount < WEIGHT_WINDOW) {
    weightWindow[weightCount++] = value;
    return;
  }
  for (byte i = 1; i < WEIGHT_WINDOW; i++) weightWindow[i - 1] = weightWindow[i];
  weightWindow[WEIGHT_WINDOW - 1] = value;
}

void pushDistance(int value) {
  if (distanceCount < DIST_WINDOW) {
    distanceWindow[distanceCount++] = value;
    return;
  }
  for (byte i = 1; i < DIST_WINDOW; i++) distanceWindow[i - 1] = distanceWindow[i];
  distanceWindow[DIST_WINDOW - 1] = value;
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

    weight = scale.get_units(3);
    if (weight < 0) {
      weight = 0.0;
    }

    bool acceptWeight = true;
    if (
      lastFilteredWeight >= MIN_PERSON_WEIGHT_KG &&
      weight >= MIN_PERSON_WEIGHT_KG &&
      fabs(weight - lastFilteredWeight) > WEIGHT_SPIKE_REJECT_KG
    ) {
      acceptWeight = false;
      if (pendingWeightCount == 0 || fabs(weight - pendingWeight) > WEIGHT_PENDING_MATCH_KG) {
        pendingWeight = weight;
        pendingWeightCount = 1;
      } else {
        pendingWeightCount++;
      }

      if (pendingWeightCount >= WEIGHT_PENDING_CONFIRM_COUNT) {
        acceptWeight = true;
        pendingWeightCount = 0;
      } else {
        Serial.println("WEIGHT_STATUS:SWING_IGNORED");
      }
    } else {
      pendingWeightCount = 0;
    }

    if (acceptWeight) {
      pushWeight(weight);
    }

    float filteredWeight = weightCount >= 3 ? medianFloat(weightWindow, weightCount) : weight;
    lastFilteredWeight = filteredWeight;

    Serial.print("Local Weight (kg): ");
    Serial.println(filteredWeight, 2);
    Serial.print("WEIGHT:");
    Serial.println(filteredWeight, 2);
  } else {
    hx711Ready = false;
    printWeightUnavailable();
  }

  // ---------- Read distance ----------
  bool lidar_ok = false;
  for (byte i = 0; i < LIDAR_RETRY_COUNT; i++) {
    if (lidar.getData(distance, addr) && distance >= MIN_HEAD_DISTANCE_CM && distance <= MAX_HEAD_DISTANCE_CM) {
      lidar_ok = true;
      break;
    }
    delay(10);
  }

  if (lidar_ok) {
    pushDistance(distance);
    int filteredDistance = distanceCount >= 3 ? medianInt(distanceWindow, distanceCount) : distance;
    Serial.print("Local Distance (cm): ");
    Serial.println(filteredDistance);
    Serial.print("DIST:");
    Serial.println(filteredDistance);
  } else {
    // Do not send a fake distance. The Pi will keep the last live UI value and retry.
    Serial.println("DIST_STATUS:INVALID");
  }

  delay(LOOP_DELAY_MS);
}
