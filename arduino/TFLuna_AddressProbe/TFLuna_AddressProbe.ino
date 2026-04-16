#include <Wire.h>

static const byte CANDIDATE_ADDRS[] = {
  0x08, 0x09, 0x0A, 0x0C, 0x10, 0x18, 0x1A, 0x20, 0x21, 0x22, 0x23,
  0x30, 0x31, 0x32, 0x40, 0x41, 0x42, 0x50, 0x60, 0x62
};

bool pingAddress(byte address) {
  Wire.beginTransmission(address);
  return Wire.endTransmission() == 0;
}

void fullScan() {
  Serial.println("FULL I2C SCAN START");
  byte found = 0;
  for (byte address = 1; address < 127; address += 1) {
    if (pingAddress(address)) {
      Serial.print("FOUND 0x");
      if (address < 16) Serial.print('0');
      Serial.println(address, HEX);
      found += 1;
    }
  }
  Serial.print("FULL I2C DEVICE COUNT=");
  Serial.println(found);
}

void candidateScan() {
  Serial.println("CANDIDATE SCAN START");
  for (byte i = 0; i < sizeof(CANDIDATE_ADDRS); i += 1) {
    byte addr = CANDIDATE_ADDRS[i];
    Serial.print("PING 0x");
    if (addr < 16) Serial.print('0');
    Serial.print(addr, HEX);
    Serial.print(" -> ");
    Serial.println(pingAddress(addr) ? "ACK" : "NOACK");
    delay(40);
  }
}

void setup() {
  Serial.begin(115200);
  Wire.begin();
  delay(500);
  Serial.println("TFLUNA ADDRESS PROBE");
  fullScan();
  candidateScan();
}

void loop() {
  delay(1000);
}
