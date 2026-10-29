// FurSight Tray: the litter tray's scale and climate sensor, on an ESP32.
//
// Four load cells under the tray feed an HX711; an SHT31 reads the air by his tray. The ESP32 shares both over
// Bluetooth LE, and the FurSight Tray page (Chrome on the pet cam computer) connects to it, spots visits, and logs
// them to his diary. The page does the thinking; this just measures, honestly and steadily.
//
// Bluetooth service (UUIDs below):
//   weight   notify, read  {"g":4521.3,"s":1}   grams on the tray (after zeroing), s = 1 when the reading is steady
//   climate  notify, read  {"t":22.4,"h":48.1}  °C and % humidity, every 10 s
//   command  write         "tare"               zero the scale (with the empty tray and litter on it)
//                          "cal:1000"           a known 1000 g weight is on the tray: work out the scale factor
// The scale factor and zero are kept in flash, so it remembers after a power cut.
//
// Wiring: HX711 DT -> GPIO 16, SCK -> GPIO 4, VCC -> 3V3, GND -> GND.
//         SHT31  SDA -> GPIO 21, SCL -> GPIO 22, VIN -> 3V3, GND -> GND.
// Libraries (Arduino Library Manager): "HX711" by Bogdan Necula, "Adafruit SHT31 Library".

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLE2902.h>
#include <Preferences.h>
#include <Wire.h>
#include <HX711.h>
#include <Adafruit_SHT31.h>

#define SERVICE_UUID "6f75a000-7e1c-4e2b-9b7a-46757253f001"
#define WEIGHT_UUID  "6f75a001-7e1c-4e2b-9b7a-46757253f001"
#define CLIMATE_UUID "6f75a002-7e1c-4e2b-9b7a-46757253f001"
#define COMMAND_UUID "6f75a003-7e1c-4e2b-9b7a-46757253f001"

const int HX_DT = 16, HX_SCK = 4;

HX711 scale;
Adafruit_SHT31 sht = Adafruit_SHT31();
Preferences prefs;
BLECharacteristic *weightChar, *climateChar;
bool connected = false, hasSht = false;
float factor = 420.0;   // raw units per gram: replaced by calibration
long zero = 0;

// the last few readings, to know when it has settled
const int N = 8;
float recent[N];
int filled = 0, pos = 0;

class Link : public BLEServerCallbacks {
  void onConnect(BLEServer *) override { connected = true; }
  void onDisconnect(BLEServer *s) override { connected = false; s->startAdvertising(); }   // let the page reconnect
};

class Commands : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *c) override {
    String cmd = String(c->getValue().c_str());
    cmd.trim();
    if (cmd == "tare") {
      zero = scale.read_average(20);
      prefs.putLong("zero", zero);
    } else if (cmd.startsWith("cal:")) {
      float grams = cmd.substring(4).toFloat();
      if (grams > 50) {
        long raw = scale.read_average(20);
        factor = (raw - zero) / grams;
        prefs.putFloat("factor", factor);
      }
    }
    filled = 0;   // the next reading starts a fresh steady check
  }
};

void setup() {
  Serial.begin(115200);
  prefs.begin("fursight", false);
  factor = prefs.getFloat("factor", factor);
  scale.begin(HX_DT, HX_SCK);
  zero = prefs.getLong("zero", 0);
  if (zero == 0) { delay(500); zero = scale.read_average(20); prefs.putLong("zero", zero); }

  Wire.begin(21, 22);
  hasSht = sht.begin(0x44);
  Serial.println(hasSht ? "SHT31 found" : "No SHT31: climate will be skipped");

  BLEDevice::init("FurSight Tray");
  BLEServer *server = BLEDevice::createServer();
  server->setCallbacks(new Link());
  BLEService *svc = server->createService(SERVICE_UUID);
  weightChar = svc->createCharacteristic(WEIGHT_UUID, BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  weightChar->addDescriptor(new BLE2902());
  climateChar = svc->createCharacteristic(CLIMATE_UUID, BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  climateChar->addDescriptor(new BLE2902());
  BLECharacteristic *cmd = svc->createCharacteristic(COMMAND_UUID, BLECharacteristic::PROPERTY_WRITE);
  cmd->setCallbacks(new Commands());
  svc->start();
  BLEAdvertising *adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(SERVICE_UUID);
  adv->setScanResponse(true);
  BLEDevice::startAdvertising();
  Serial.println("FurSight Tray ready");
}

unsigned long lastWeight = 0, lastClimate = 0;

void loop() {
  unsigned long now = millis();

  // weight, four times a second
  if (now - lastWeight >= 250 && scale.is_ready()) {
    lastWeight = now;
    float g = (scale.read_average(2) - zero) / factor;
    recent[pos] = g; pos = (pos + 1) % N; if (filled < N) filled++;
    float lo = recent[0], hi = recent[0];
    for (int i = 1; i < filled; i++) { lo = min(lo, recent[i]); hi = max(hi, recent[i]); }
    bool steady = filled == N && (hi - lo) < 8;   // within 8 g over the last 2 seconds
    char msg[48];
    snprintf(msg, sizeof msg, "{\"g\":%.1f,\"s\":%d}", g, steady ? 1 : 0);
    weightChar->setValue(msg);
    if (connected) weightChar->notify();
    Serial.println(msg);
  }

  // climate, every 10 seconds
  if (hasSht && now - lastClimate >= 10000) {
    lastClimate = now;
    float t = sht.readTemperature(), h = sht.readHumidity();
    if (!isnan(t) && !isnan(h)) {
      char msg[48];
      snprintf(msg, sizeof msg, "{\"t\":%.1f,\"h\":%.1f}", t, h);
      climateChar->setValue(msg);
      if (connected) climateChar->notify();
      Serial.println(msg);
    }
  }
}
