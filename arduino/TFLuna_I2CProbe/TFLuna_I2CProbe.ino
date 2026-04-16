#include <Wire.h>
#include <TFLI2C.h>

TFLI2C lidar;
int16_t distance = 0;
int16_t addr = TFL_DEF_ADR; // usually 0x10

void scanI2C() {
  Serial.println("I2C SCAN START");
  byte count = 0;
  for (byte address = 1; address < 127; address += 1) {
    Wire.beginTransmission(address);
    byte error = Wire.endTransmission();
    if (error == 0) {
      Serial.print("I2C DEVICE 0x");
      if (address < 16) Serial.print('0');
      Serial.println(address, HEX);
      count += 1;
    }
  }
  Serial.print("I2C DEVICE COUNT=");
  Serial.println(count);
}

void setup() {
  Serial.begin(115200);
  Wire.begin();
  delay(300);
  Serial.println("TFLUNA I2C PROBE");
  scanI2C();
}

void loop() {
  bool ok = lidar.getData(distance, addr);
  Serial.print("GETDATA 0x");
  Serial.print(addr, HEX);
  Serial.print(" -> ");
  if (ok) {
    Serial.print("OK DIST=");
    Serial.println(distance);
  } else {
    Serial.println("ERR");
  }
  delay(500);
}
