#include "HX711.h"

struct PinPair {
  byte dout;
  byte sck;
};

// Probe the most common Arduino Uno digital pin pairings used for HX711 boards.
PinPair candidates[] = {
  {3, 2},
  {2, 3},
  {4, 5},
  {5, 4},
  {6, 7},
  {7, 6},
  {8, 9},
  {9, 8},
  {10, 11},
  {11, 10},
  {12, 13},
  {13, 12},
};

static const unsigned long SERIAL_BAUD = 115200;
static const unsigned long READY_WAIT_MS = 1200;
static const unsigned long LOOP_DELAY_MS = 2500;

HX711 scale;

void printDivider() {
  Serial.println("----------------------------------------");
}

void setup() {
  Serial.begin(SERIAL_BAUD);
  while (!Serial) {
    delay(10);
  }

  Serial.println("HX711 PIN PROBE START");
  Serial.println("Checking common DOUT/SCK pairs...");
  printDivider();
}

void loop() {
  bool foundAny = false;

  for (unsigned int i = 0; i < (sizeof(candidates) / sizeof(candidates[0])); i += 1) {
    const byte dout = candidates[i].dout;
    const byte sck = candidates[i].sck;

    scale.begin(dout, sck);
    delay(20);

    const bool ready = scale.wait_ready_timeout(READY_WAIT_MS);
    Serial.print("PAIR DOUT=");
    Serial.print(dout);
    Serial.print(" SCK=");
    Serial.print(sck);

    if (!ready) {
      Serial.println(" -> NOT READY");
      continue;
    }

    foundAny = true;
    const long raw = scale.read();
    const long average = scale.read_average(3);

    Serial.print(" -> READY raw=");
    Serial.print(raw);
    Serial.print(" avg=");
    Serial.println(average);
  }

  if (!foundAny) {
    Serial.println("RESULT: no tested pin pair responded.");
  } else {
    Serial.println("RESULT: use the READY pair above as the likely HX711 wiring.");
  }

  printDivider();
  delay(LOOP_DELAY_MS);
}
