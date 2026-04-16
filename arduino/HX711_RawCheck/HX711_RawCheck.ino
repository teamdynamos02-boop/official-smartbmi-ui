#include "HX711.h"

#define DOUT 3
#define CLK 2

HX711 scale;

static const unsigned long SERIAL_BAUD = 115200;
static const unsigned long READY_WAIT_MS = 1000;

void setup() {
  Serial.begin(SERIAL_BAUD);
  scale.begin(DOUT, CLK);
  Serial.println("HX711 RAW CHECK");
}

void loop() {
  if (scale.wait_ready_timeout(READY_WAIT_MS)) {
    long raw = scale.read();
    long avg = scale.read_average(5);
    Serial.print("RAW:");
    Serial.print(raw);
    Serial.print(" AVG:");
    Serial.println(avg);
  } else {
    Serial.println("RAW:NOT_READY");
  }

  delay(500);
}
