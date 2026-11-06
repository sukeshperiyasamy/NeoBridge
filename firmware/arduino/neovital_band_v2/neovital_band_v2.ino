// =====================================================
// NEOVITAL ESP32 BAND · firmware v2
// =====================================================
//
// Same hardware and pins as v1 (neovital_band.ino). Fixes:
//
//  1. SD sync no longer freezes the band. pending.csv is append-only; an ACK
//     only moves a "sent up to" pointer kept in NVS. No file rewrite, no
//     archive scan. (v1: about 7 s per ACK with 10 000 rows.)
//  2. Pending count is worked out from IDs, not by reading the file.
//  3. Boot is fast: the next record ID lives in NVS (v1 read both files).
//  4. One SD row a minute (v1: every 2 s). LIVE still goes out every 2 s.
//  5. Real time: the phone sends TIME,<unix>; rows and LIVE carry it.
//  6. Automatic alarm on the band itself when no phone is in charge:
//     very cold or too warm for 2 min sounds the siren, getting cold
//     buzzes the motors.
//  7. Separate beta per NTC (check the datasheets, see NTCx_BETA).
//  8. Skin contact flag, and battery level when a divider is fitted.
//  9. Unique Bluetooth name per band: NeoBridge-XXXX (end of the MAC).
// 10. Commands are handled before any SD work, and are all cheap now.
// 11. Status patterns from the phone: STATUS,GREEN|YELLOW|RED|GREY and
//     SILENCE (acknowledged red: stays red, no sound).
//
// Protocol (one text line each, newline-terminated). New fields are added at
// the END of v1 lines, so the v1 app still reads them.
//
// Band -> phone
//   HELLO,2,<name>,<simVitals 0|1>
//   LIVE,<boot>,<uptimeMs>,<hr|NA>,<spo2|NA>,<ntc1|NA>,<ntc2|NA>,<ALARM|NORMAL>,<unix|0>,<batt%|NA>,<contact 0|1>,<pattern>
//   DATA,<id>,<boot>,<uptimeMs>,<hr|NA>,<spo2|NA>,<ntc1|NA>,<ntc2|NA>,<unix|0>
//   ACK_OK,<id> · PENDING_COUNT,<n> · TIME_OK · STATUS_OK,<s> · SILENCE_OK · PONG
//   ALARM_STARTED · ALARM_STOPPED · SYNC_COMPLETE · CONNECTED · NEOVITAL_READY
//
// Phone -> band
//   STATUS (send a LIVE now) · STATUS,<GREEN|YELLOW|RED|GREY> · SILENCE
//   TIME,<unix> · TEST ON · TEST OFF · SYNC · SYNC_STATUS · ACK,<id> · PING
//   SIM HR <n> · SIM SPO2 <n> · SIM RESET · HELP
//
// Board: ESP32 (WROOM / WROVER, Classic Bluetooth). Arduino core 2.x or 3.x.
// Partition scheme: "Huge APP" (Bluetooth Classic needs the space).

#include <Arduino.h>
#include <BluetoothSerial.h>
#include <SPI.h>
#include <SD.h>
#include <Preferences.h>
#include <math.h>
#include <esp_arduino_version.h>

#if ESP_ARDUINO_VERSION_MAJOR >= 3
#include <esp_mac.h>
#else
#include <esp_system.h>
#endif

// =====================================================
// 1. GPIO
// =====================================================

#define MOTOR1_PIN 13
#define MOTOR2_PIN 14
#define BUZZER_PIN 26

#define NTC1_PIN 35   // skin sensor, 10k
#define NTC2_PIN 32   // second sensor, 5k

#define SD_CS_PIN   27
#define SD_MOSI_PIN 23
#define SD_MISO_PIN 19
#define SD_SCK_PIN  18

// Reserved for the MAX30102 (heart rate / SpO2)
#define MAX_SDA 21
#define MAX_SCL 22

// Battery: set to an ADC1 pin (32-39) with a divider from the battery, for
// example 100k / 100k on GPIO 34. -1 = no divider fitted (reports NA).
#define BATTERY_PIN -1
const float BATTERY_DIVIDER = 2.0;   // battery voltage / pin voltage
const float BATTERY_EMPTY_V = 3.30;
const float BATTERY_FULL_V  = 4.20;

// 1 = heart rate and SpO2 are simulated (no MAX30102 yet). 0 = send NA.
#define SIMULATE_VITALS 1

// =====================================================
// 2. NTC
// =====================================================

// Divider: 3.3V -> fixed resistor -> ADC -> NTC -> GND
const float ADC_SUPPLY = 3.3;
const float T25_K = 298.15;

const float NTC1_FIXED_R = 10000.0;
const float NTC1_R25     = 10000.0;
const float NTC1_BETA    = 3950.0;   // check the 10k part's datasheet

const float NTC2_FIXED_R = 10000.0;
const float NTC2_R25     = 5000.0;
const float NTC2_BETA    = 3950.0;   // check the 5k part's datasheet (often 3470-3977)

// Per-sensor offset after calibration against a reference thermometer, deg C
const float NTC1_OFFSET_C = 0.0;
const float NTC2_OFFSET_C = 0.0;

// =====================================================
// 3. TIMING AND RULES
// =====================================================

const unsigned long SAMPLE_INTERVAL = 2000;    // read sensors + LIVE
const unsigned long SAVE_INTERVAL   = 60000;   // one SD row a minute
const unsigned long SYNC_RETRY_MS   = 10000;   // resend a row with no ACK
const unsigned long POINTER_SAVE_MS = 5000;    // NVS write at most this often

const unsigned long MOTOR_ON_MS  = 200;
const unsigned long MOTOR_OFF_MS = 300;
const unsigned long SIREN_INTERVAL = 450;

// Yellow: one motor pulse every 15 s, no sound
const unsigned long YELLOW_PULSE_MS  = 400;
const unsigned long YELLOW_PERIOD_MS = 15000;

// Band-side rules (used only when no phone is in charge). Same lines as the app.
const float COLD_C      = 35.5;
const float VERY_COLD_C = 34.5;
const float HOT_C       = 37.8;
const unsigned long SUSTAIN_MS = 120000;   // 2 min

// Skin contact: NTC1 warm, or clearly warmer than NTC2
const float CONTACT_MIN_C  = 30.0;
const float CONTACT_DIFF_C = 1.5;

// When pending.csv is fully sent and bigger than this, it is renamed away
// (cheap) and a new one started.
const uint32_t ROLL_BYTES = 512UL * 1024UL;

// =====================================================
// 4. FILES AND NVS
// =====================================================

BluetoothSerial BT;
Preferences prefs;

char btName[24] = "NeoBridge";

const char* PENDING_FILE = "/pending.csv";
const char* HEADER = "ID,BOOT_ID,UPTIME_MS,HR_BPM,SPO2,NTC1_C,NTC2_C,UNIX";
const uint32_t STORAGE_FORMAT = 2;

bool sdReady = false;

// =====================================================
// 5. STATE
// =====================================================

float heartRate = 140.0;
float spo2 = 98.0;
bool simOverride = false;

float temperature1 = NAN;
float temperature2 = NAN;
bool contact = false;
int batteryPct = -1;

uint32_t bootID = 0;
uint32_t nextRecordID = 1;

// sync
bool syncActive = false;
bool waitingACK = false;
uint32_t waitingRecordID = 0;
uint32_t waitingNextOffset = 0;   // where the row after the one in flight starts
uint32_t sentOffset = 0;          // first byte of the first unsent row
uint32_t sentID = 0;              // newest acknowledged ID
bool pointerDirty = false;
unsigned long lastPointerSave = 0;
unsigned long lastSync = 0;

// time
bool timeKnown = false;
uint32_t unixAtBoot = 0;          // unix seconds when millis() was 0

// alarm
enum Pattern { P_OFF, P_YELLOW, P_RED, P_SILENCED, P_TEST, P_LOCAL_YELLOW, P_LOCAL_RED };
enum PhoneStatus { S_NONE, S_GREEN, S_YELLOW, S_RED, S_GREY };

bool manualAlarm = false;         // TEST ON
PhoneStatus phoneStatus = S_NONE; // what the phone last told us since connecting
bool silenced = false;            // SILENCE: red acknowledged on the phone
Pattern currentPattern = P_OFF;
Pattern previousPattern = P_OFF;

bool motorState = false;
int sirenStep = 0;
unsigned long lastMotor = 0;
unsigned long lastSiren = 0;
unsigned long patternStart = 0;

// band-side rules
float ntc1History[5];
int ntc1Count = 0;
int ntc1Next = 0;
unsigned long coldSince = 0;
unsigned long veryColdSince = 0;
unsigned long hotSince = 0;

bool previousConnection = false;
unsigned long lastSample = 0;
unsigned long lastSave = 0;

String btInput = "";
String usbInput = "";

// used before their definitions
uint32_t pendingCount();
void updateAlarm();

// =====================================================
// 6. BUZZER
// =====================================================

#if ESP_ARDUINO_VERSION_MAJOR >= 3

bool buzzerReady = false;

void setupBuzzer() { buzzerReady = ledcAttach(BUZZER_PIN, 2000, 8); }
void buzzerTone(int frequency) { if (buzzerReady) ledcWriteTone(BUZZER_PIN, frequency); }
void buzzerOff() { if (buzzerReady) ledcWriteTone(BUZZER_PIN, 0); }

#else

void setupBuzzer() {
  ledcSetup(0, 2000, 8);
  ledcAttachPin(BUZZER_PIN, 0);
}
void buzzerTone(int frequency) { ledcWriteTone(0, frequency); }
void buzzerOff() { ledcWriteTone(0, 0); }

#endif

// =====================================================
// 7. MOTORS
// =====================================================

void motorsOn() {
  digitalWrite(MOTOR1_PIN, HIGH);
  digitalWrite(MOTOR2_PIN, HIGH);
}

void motorsOff() {
  digitalWrite(MOTOR1_PIN, LOW);
  digitalWrite(MOTOR2_PIN, LOW);
}

// =====================================================
// 8. OUTPUT
// =====================================================

// Replies go to the phone and to the USB serial monitor.
void reply(const String& message) {
  if (BT.hasClient()) BT.println(message);
  Serial.println(message);
}

// =====================================================
// 9. SENSORS
// =====================================================

float readNTC(int pin, float fixedR, float nominalR, float beta, float offsetC) {
  uint32_t sum = 0;
  for (int i = 0; i < 16; i++) {
    sum += analogReadMilliVolts(pin);
    delayMicroseconds(500);
  }
  float voltage = (sum / 16.0) / 1000.0;
  if (voltage <= 0.02 || voltage >= 3.28) return NAN;

  float resistance = fixedR * voltage / (ADC_SUPPLY - voltage);
  float steinhart = log(resistance / nominalR) / beta + 1.0 / T25_K;
  float temperature = 1.0 / steinhart - 273.15 + offsetC;

  if (temperature < -40 || temperature > 125) return NAN;
  return temperature;
}

int readBattery() {
#if BATTERY_PIN >= 0
  uint32_t sum = 0;
  for (int i = 0; i < 8; i++) sum += analogReadMilliVolts(BATTERY_PIN);
  float volts = (sum / 8.0) / 1000.0 * BATTERY_DIVIDER;
  float pct = (volts - BATTERY_EMPTY_V) / (BATTERY_FULL_V - BATTERY_EMPTY_V) * 100.0;
  if (pct < 0) pct = 0;
  if (pct > 100) pct = 100;
  return (int)(pct + 0.5);
#else
  return -1;
#endif
}

void readSensors() {
  temperature1 = readNTC(NTC1_PIN, NTC1_FIXED_R, NTC1_R25, NTC1_BETA, NTC1_OFFSET_C);
  temperature2 = readNTC(NTC2_PIN, NTC2_FIXED_R, NTC2_R25, NTC2_BETA, NTC2_OFFSET_C);

  contact = !isnan(temperature1) &&
            (temperature1 >= CONTACT_MIN_C ||
             (!isnan(temperature2) && temperature1 - temperature2 >= CONTACT_DIFF_C));

  batteryPct = readBattery();

  if (!isnan(temperature1)) {
    ntc1History[ntc1Next] = temperature1;
    ntc1Next = (ntc1Next + 1) % 5;
    if (ntc1Count < 5) ntc1Count++;
  }
}

void updateSimulation() {
#if SIMULATE_VITALS
  if (!simOverride) {
    heartRate = 140 + random(-3, 4);
    spo2 = 98 + random(-1, 2);
  }
#endif
}

String numberOrNA(float value, int decimals) {
  if (isnan(value)) return "NA";
  return String(value, decimals);
}

String heartRateString() {
#if SIMULATE_VITALS
  return String(heartRate, 0);
#else
  return "NA";
#endif
}

String spo2String() {
#if SIMULATE_VITALS
  return String(spo2, 0);
#else
  return "NA";
#endif
}

// =====================================================
// 10. TIME
// =====================================================

uint32_t nowUnix() {
  if (!timeKnown) return 0;
  return unixAtBoot + millis() / 1000;
}

// =====================================================
// 11. STORAGE (append-only, pointer in NVS)
// =====================================================

void savePointer(bool force) {
  if (!pointerDirty) return;
  if (!force && millis() - lastPointerSave < POINTER_SAVE_MS) return;
  prefs.putUInt("sentOff", sentOffset);
  prefs.putUInt("sentId", sentID);
  pointerDirty = false;
  lastPointerSave = millis();
}

bool writeHeader() {
  File file = SD.open(PENDING_FILE, FILE_WRITE);
  if (!file) return false;
  file.println(HEADER);
  uint32_t size = file.size();
  file.close();
  sentOffset = size;
  return true;
}

// v1 IDs are kept going up, so the phone never sees an old ID again.
uint32_t highestIdIn(const char* filename) {
  uint32_t highest = 0;
  File file = SD.open(filename, FILE_READ);
  if (!file) return 0;
  while (file.available()) {
    String line = file.readStringUntil('\n');
    int comma = line.indexOf(',');
    if (comma <= 0 || line.startsWith("ID,")) continue;
    uint32_t id = line.substring(0, comma).toInt();
    if (id > highest) highest = id;
  }
  file.close();
  return highest;
}

// First boot of v2 on a card written by v1: keep the old files (renamed), start fresh.
void migrateFromV1() {
  Serial.println("MIGRATING SD CARD FROM V1 (one time)");
  uint32_t highest = 0;

  if (SD.exists(PENDING_FILE)) {
    highest = max(highest, highestIdIn(PENDING_FILE));
    SD.remove("/v1_pending.csv");
    SD.rename(PENDING_FILE, "/v1_pending.csv");
  }
  if (SD.exists("/archive.csv")) {
    highest = max(highest, highestIdIn("/archive.csv"));
  }
  SD.remove("/pending.tmp");
  SD.remove("/pending.bak");

  nextRecordID = highest + 1;
  sentID = highest;
  writeHeader();

  prefs.putUInt("nextId", nextRecordID);
  prefs.putUInt("sentId", sentID);
  prefs.putUInt("sentOff", sentOffset);
  prefs.putUInt("format", STORAGE_FORMAT);
}

void initializeStorage() {
  if (prefs.getUInt("format", 0) != STORAGE_FORMAT || !SD.exists(PENDING_FILE)) {
    migrateFromV1();
  } else {
    nextRecordID = prefs.getUInt("nextId", 1);
    sentID = prefs.getUInt("sentId", 0);
    sentOffset = prefs.getUInt("sentOff", 0);
  }

  File file = SD.open(PENDING_FILE, FILE_READ);
  uint32_t size = file ? file.size() : 0;
  if (file) file.close();
  if (sentOffset > size) sentOffset = size;   // card swapped or file damaged

  Serial.print("NEXT RECORD ID: ");
  Serial.println(nextRecordID);
  Serial.print("PENDING: ");
  Serial.println(pendingCount());
}

uint32_t pendingCount() {
  uint32_t newest = nextRecordID - 1;
  return newest > sentID ? newest - sentID : 0;
}

String createRecord() {
  String record = String(nextRecordID);
  record += ",";
  record += String(bootID);
  record += ",";
  record += String(millis());
  record += ",";
  record += heartRateString();
  record += ",";
  record += spo2String();
  record += ",";
  record += numberOrNA(temperature1, 2);
  record += ",";
  record += numberOrNA(temperature2, 2);
  record += ",";
  record += String(nowUnix());
  return record;
}

void saveRecord() {
  if (!sdReady) return;
  String record = createRecord();
  File file = SD.open(PENDING_FILE, FILE_APPEND);
  if (!file) {
    Serial.println("SD WRITE ERROR");
    return;
  }
  file.println(record);
  file.close();

  nextRecordID++;
  prefs.putUInt("nextId", nextRecordID);
  Serial.println("SAVED: " + record);

  // a new row while connected: offer it at once
  if (BT.hasClient()) syncActive = true;
}

// Reads the first unsent row (one seek, one line). Returns "" when none.
String readPendingRecord(uint32_t& nextOffset) {
  File file = SD.open(PENDING_FILE, FILE_READ);
  if (!file) return "";
  if (sentOffset >= file.size()) {
    file.close();
    return "";
  }
  file.seek(sentOffset);
  String record = "";
  while (file.available()) {
    record = file.readStringUntil('\n');
    record.trim();
    if (record.length() > 0 && !record.startsWith("ID,")) break;
    record = "";
  }
  nextOffset = file.position();
  file.close();
  return record;
}

// Everything sent and the file is big: rename it away (cheap) and start again.
void rollIfDone() {
  if (pendingCount() > 0) return;
  File file = SD.open(PENDING_FILE, FILE_READ);
  if (!file) return;
  uint32_t size = file.size();
  file.close();
  if (size < ROLL_BYTES) return;

  uint32_t n = prefs.getUInt("rollN", 0) + 1;
  String name = "/sent_" + String(n) + ".csv";
  if (SD.rename(PENDING_FILE, name.c_str()) && writeHeader()) {
    prefs.putUInt("rollN", n);
    pointerDirty = true;
    savePointer(true);
    Serial.println("ROLLED TO " + name);
  }
}

// =====================================================
// 12. HISTORY SYNC
// =====================================================

void sendNextRecord() {
  if (!syncActive || waitingACK || !BT.hasClient()) return;

  uint32_t nextOffset = 0;
  String record = readPendingRecord(nextOffset);
  if (record.length() == 0) {
    syncActive = false;
    savePointer(true);
    rollIfDone();
    reply("SYNC_COMPLETE");
    return;
  }
  int comma = record.indexOf(',');
  if (comma <= 0) {
    // damaged line: skip it
    sentOffset = nextOffset;
    pointerDirty = true;
    return;
  }
  waitingRecordID = record.substring(0, comma).toInt();
  waitingNextOffset = nextOffset;
  BT.println("DATA," + record);
  waitingACK = true;
  lastSync = millis();
}

void handleACK(const String& command) {
  uint32_t id = command.substring(4).toInt();
  if (!waitingACK || id != waitingRecordID) {
    reply("ACK_ID_MISMATCH");
    return;
  }
  sentOffset = waitingNextOffset;
  sentID = id;
  pointerDirty = true;
  savePointer(false);
  waitingACK = false;
  waitingRecordID = 0;
  reply("ACK_OK," + String(id));
}

void syncManager() {
  if (!BT.hasClient() || !syncActive) return;
  if (waitingACK) {
    if (millis() - lastSync >= SYNC_RETRY_MS) {
      waitingACK = false;   // offer the same row again
    } else {
      return;
    }
  }
  sendNextRecord();
}

// =====================================================
// 13. BAND-SIDE RULES (no phone in charge)
// =====================================================

float medianNtc1() {
  if (ntc1Count == 0) return NAN;
  float v[5];
  for (int i = 0; i < ntc1Count; i++) v[i] = ntc1History[i];
  for (int i = 1; i < ntc1Count; i++) {
    float key = v[i];
    int j = i - 1;
    while (j >= 0 && v[j] > key) {
      v[j + 1] = v[j];
      j--;
    }
    v[j + 1] = key;
  }
  return v[ntc1Count / 2];
}

// Runs every sample. Keeps the "since" clocks; returns the local pattern.
Pattern localRules() {
  unsigned long now = millis();
  float skin = medianNtc1();

  if (!contact || isnan(skin)) {
    coldSince = veryColdSince = hotSince = 0;
    return P_OFF;
  }
  coldSince     = skin < COLD_C      ? (coldSince     ? coldSince     : now) : 0;
  veryColdSince = skin < VERY_COLD_C ? (veryColdSince ? veryColdSince : now) : 0;
  hotSince      = skin > HOT_C       ? (hotSince      ? hotSince      : now) : 0;

  bool held = false;
  if (veryColdSince && now - veryColdSince >= SUSTAIN_MS) held = true;
  if (hotSince && now - hotSince >= SUSTAIN_MS) held = true;
  if (held) return P_LOCAL_RED;
  if (coldSince && now - coldSince >= SUSTAIN_MS) return P_LOCAL_YELLOW;
  return P_OFF;
}

Pattern localPattern = P_OFF;

// =====================================================
// 14. ALARM PATTERNS
// =====================================================

Pattern choosePattern() {
  if (manualAlarm) return P_TEST;
  bool phoneInCharge = BT.hasClient() && phoneStatus != S_NONE;
  if (phoneInCharge) {
    switch (phoneStatus) {
      case S_RED:    return silenced ? P_SILENCED : P_RED;
      case S_YELLOW: return P_YELLOW;
      default:       return P_OFF;
    }
  }
  return localPattern;
}

const char* patternName(Pattern p) {
  switch (p) {
    case P_YELLOW:       return "YELLOW";
    case P_RED:          return "RED";
    case P_SILENCED:     return "SILENCED";
    case P_TEST:         return "TEST";
    case P_LOCAL_YELLOW: return "LOCAL_YELLOW";
    case P_LOCAL_RED:    return "LOCAL_RED";
    default:             return "OFF";
  }
}

bool sirenPattern(Pattern p) { return p == P_RED || p == P_TEST || p == P_LOCAL_RED; }
bool yellowPattern(Pattern p) { return p == P_YELLOW || p == P_LOCAL_YELLOW; }

void updateAlarm() {
  unsigned long now = millis();
  currentPattern = choosePattern();

  if (currentPattern != previousPattern) {
    bool wasSounding = sirenPattern(previousPattern);
    bool sounding = sirenPattern(currentPattern);
    previousPattern = currentPattern;
    patternStart = now;
    motorState = false;
    sirenStep = 0;
    lastMotor = now;
    lastSiren = now;
    motorsOff();
    buzzerOff();
    if (sounding && !wasSounding) reply("ALARM_STARTED");
    if (!sounding && wasSounding) reply("ALARM_STOPPED");
  }

  if (sirenPattern(currentPattern)) {
    unsigned long duration = motorState ? MOTOR_ON_MS : MOTOR_OFF_MS;
    if (now - lastMotor >= duration) {
      lastMotor = now;
      motorState = !motorState;
      if (motorState) motorsOn(); else motorsOff();
    }
    if (now - lastSiren >= SIREN_INTERVAL) {
      lastSiren = now;
      buzzerTone(sirenStep == 0 ? 700 : 1100);
      sirenStep = 1 - sirenStep;
    }
    return;
  }

  if (yellowPattern(currentPattern)) {
    // a short motor pulse at the start of every period, no sound
    unsigned long inPeriod = (now - patternStart) % YELLOW_PERIOD_MS;
    if (inPeriod < YELLOW_PULSE_MS) motorsOn(); else motorsOff();
    return;
  }

  motorsOff();
  buzzerOff();
}

// =====================================================
// 15. LIVE TELEMETRY
// =====================================================

void sendLiveData() {
  String message = "LIVE,";
  message += String(bootID);
  message += ",";
  message += String(millis());
  message += ",";
  message += heartRateString();
  message += ",";
  message += spo2String();
  message += ",";
  message += numberOrNA(temperature1, 2);
  message += ",";
  message += numberOrNA(temperature2, 2);
  message += ",";
  message += sirenPattern(currentPattern) ? "ALARM" : "NORMAL";
  message += ",";
  message += String(nowUnix());
  message += ",";
  message += batteryPct < 0 ? String("NA") : String(batteryPct);
  message += ",";
  message += contact ? "1" : "0";
  message += ",";
  message += patternName(currentPattern);

  if (BT.hasClient()) BT.println(message);
  Serial.println(message);
}

// =====================================================
// 16. COMMANDS
// =====================================================

void processCommand(String command) {
  command.trim();
  command.toUpperCase();
  if (command.length() == 0) return;

  if (command == "STATUS") {
    sendLiveData();
  }
  else if (command.startsWith("STATUS,")) {
    String s = command.substring(7);
    PhoneStatus next = S_NONE;
    if (s == "GREEN") next = S_GREEN;
    else if (s == "YELLOW") next = S_YELLOW;
    else if (s == "RED") next = S_RED;
    else if (s == "GREY" || s == "GRAY") next = S_GREY;
    if (next == S_NONE) {
      reply("INVALID_STATUS");
      return;
    }
    if (next != phoneStatus) silenced = false;   // a new status clears SILENCE
    phoneStatus = next;
    updateAlarm();
    reply("STATUS_OK," + s);
  }
  else if (command == "SILENCE") {
    silenced = true;
    updateAlarm();
    reply("SILENCE_OK");
  }
  else if (command.startsWith("TIME,")) {
    uint32_t phoneTime = command.substring(5).toInt();
    if (phoneTime < 1600000000UL) {
      reply("INVALID_TIME");
      return;
    }
    unixAtBoot = phoneTime - millis() / 1000;
    timeKnown = true;
    reply("TIME_OK");
  }
  else if (command == "TEST ON") {
    manualAlarm = true;
    updateAlarm();
  }
  else if (command == "TEST OFF") {
    manualAlarm = false;
    updateAlarm();
    // v1 phones send TEST OFF to stop an alarm; always confirm it
    if (!sirenPattern(currentPattern)) reply("ALARM_STOPPED");
  }
  else if (command.startsWith("ACK,")) {
    handleACK(command);
  }
  else if (command == "SYNC") {
    syncActive = true;
    reply("SYNC_STARTED");
  }
  else if (command == "SYNC_STATUS") {
    reply("PENDING_COUNT," + String(pendingCount()));
  }
  else if (command == "PING") {
    reply("PONG");
  }
  else if (command.startsWith("SIM HR ")) {
    float value = command.substring(7).toFloat();
    if (value >= 30 && value <= 250) {
      heartRate = value;
      simOverride = true;
      reply("SIM_HR_OK");
    } else {
      reply("INVALID_HR");
    }
  }
  else if (command.startsWith("SIM SPO2 ")) {
    float value = command.substring(9).toFloat();
    if (value >= 50 && value <= 100) {
      spo2 = value;
      simOverride = true;
      reply("SIM_SPO2_OK");
    } else {
      reply("INVALID_SPO2");
    }
  }
  else if (command == "SIM RESET") {
    simOverride = false;
    heartRate = 140;
    spo2 = 98;
    reply("SIM_RESET_OK");
  }
  else if (command == "HELP") {
    reply("STATUS | STATUS,GREEN|YELLOW|RED|GREY | SILENCE | TIME,<unix>");
    reply("TEST ON | TEST OFF | SYNC | SYNC_STATUS | ACK,<ID> | PING");
    reply("SIM HR <n> | SIM SPO2 <n> | SIM RESET");
  }
  else {
    reply("UNKNOWN_COMMAND");
  }
}

// Reads whole lines; commands from the phone and from the USB serial monitor.
void readInput(Stream& in, String& buffer) {
  while (in.available()) {
    char c = in.read();
    if (c == '\n' || c == '\r') {
      if (buffer.length() > 0) {
        processCommand(buffer);
        buffer = "";
      }
    } else if (buffer.length() < 100) {
      buffer += c;
    }
  }
}

// =====================================================
// 17. SETUP
// =====================================================

void setup() {
  Serial.begin(115200);

  pinMode(MOTOR1_PIN, OUTPUT);
  pinMode(MOTOR2_PIN, OUTPUT);
  pinMode(NTC1_PIN, INPUT);
  pinMode(NTC2_PIN, INPUT);
  motorsOff();

  setupBuzzer();
  buzzerOff();

  analogReadResolution(12);
  analogSetPinAttenuation(NTC1_PIN, ADC_11db);
  analogSetPinAttenuation(NTC2_PIN, ADC_11db);
#if BATTERY_PIN >= 0
  analogSetPinAttenuation(BATTERY_PIN, ADC_11db);
#endif

  randomSeed(micros());

  Serial.println();
  Serial.println("================================");
  Serial.println("     NEOVITAL ESP32 - v2");
  Serial.println("================================");

  prefs.begin("neovital", false);
  bootID = prefs.getUInt("bootID", 0) + 1;
  prefs.putUInt("bootID", bootID);
  Serial.print("BOOT ID: ");
  Serial.println(bootID);

  // Bluetooth name from the end of the Bluetooth MAC, e.g. NeoBridge-54DA
  uint8_t mac[6] = {0};
  esp_read_mac(mac, ESP_MAC_BT);
  snprintf(btName, sizeof(btName), "NeoBridge-%02X%02X", mac[4], mac[5]);
  BT.begin(btName);
  Serial.print("BLUETOOTH READY: ");
  Serial.println(btName);

  SPI.begin(SD_SCK_PIN, SD_MISO_PIN, SD_MOSI_PIN, SD_CS_PIN);
  if (SD.begin(SD_CS_PIN, SPI, 10000000)) {
    sdReady = true;
    initializeStorage();
    Serial.println("SD CARD READY");
  } else {
    Serial.println("SD CARD ERROR");
  }

  readSensors();
  lastSample = millis();
  lastSave = millis();

  Serial.println(SIMULATE_VITALS ? "HR/SPO2: SIMULATED" : "HR/SPO2: OFF");
  Serial.println("AUTOMATIC ALARM: ON WHEN NO PHONE IS IN CHARGE");
  Serial.println("================================");
}

// =====================================================
// 18. MAIN LOOP
// =====================================================

void loop() {
  // 1 · commands first: nothing below takes long any more
  readInput(BT, btInput);
  readInput(Serial, usbInput);

  unsigned long now = millis();

  // 2 · connection changes
  bool connected = BT.hasClient();
  if (connected && !previousConnection) {
    phoneStatus = S_NONE;   // the phone takes charge once it sends a STATUS
    silenced = false;
    waitingACK = false;
    BT.println("CONNECTED");
    BT.println("NEOVITAL_READY");
    BT.println("HELLO,2," + String(btName) + "," + String(SIMULATE_VITALS));
    if (sdReady) {
      syncActive = true;
      BT.println("AUTO_SYNC_STARTED");
    }
    Serial.println("BLUETOOTH CONNECTED");
  }
  if (!connected && previousConnection) {
    syncActive = false;
    waitingACK = false;
    phoneStatus = S_NONE;   // the band's own rules take over
    silenced = false;
    savePointer(true);
    Serial.println("BLUETOOTH DISCONNECTED");
  }
  previousConnection = connected;

  // 3 · alarm patterns run every loop
  updateAlarm();

  // 4 · sensors + LIVE every 2 s
  if (now - lastSample >= SAMPLE_INTERVAL) {
    lastSample = now;
    updateSimulation();
    readSensors();
    localPattern = localRules();
    updateAlarm();
    if (connected) sendLiveData();
  }

  // 5 · one SD row a minute
  if (sdReady && now - lastSave >= SAVE_INTERVAL) {
    lastSave = now;
    saveRecord();
  }

  // 6 · history sync (cheap now) and a throttled pointer save
  syncManager();
  savePointer(false);
}
