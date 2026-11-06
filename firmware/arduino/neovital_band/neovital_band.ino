#include <Arduino.h>
#include <BluetoothSerial.h>
#include <SPI.h>
#include <SD.h>
#include <Preferences.h>
#include <math.h>
#include <esp_arduino_version.h>

// =====================================================
// 1. GPIO CONFIGURATION
// =====================================================

#define MOTOR1_PIN 13
#define MOTOR2_PIN 14
#define BUZZER_PIN 26

#define NTC1_PIN 35
#define NTC2_PIN 32

#define SD_CS_PIN   27
#define SD_MOSI_PIN 23
#define SD_MISO_PIN 19
#define SD_SCK_PIN  18

// Reserved for future MAX30102
#define MAX_SDA 21
#define MAX_SCL 22

// =====================================================
// 2. BLUETOOTH AND STORAGE
// =====================================================

BluetoothSerial BT;
Preferences preferences;

const char* BT_NAME = "De De Padosan Ko";

const char* PENDING_FILE = "/pending.csv";
const char* ARCHIVE_FILE = "/archive.csv";

const char* TEMP_FILE = "/pending.tmp";
const char* BACKUP_FILE = "/pending.bak";

bool sdReady = false;

// =====================================================
// 3. NTC CONFIGURATION
// =====================================================

// Divider:
// 3.3V -> 10k fixed resistor -> ADC -> NTC -> GND

const float ADC_SUPPLY = 3.3;
const float NTC_BETA = 3950.0;
const float T25_K = 298.15;

// NTC1: 10k at 25 C
const float NTC1_FIXED_R = 10000.0;
const float NTC1_R25 = 10000.0;

// NTC2: 5k at 25 C
const float NTC2_FIXED_R = 10000.0;
const float NTC2_R25 = 5000.0;

// =====================================================
// 4. TIMING
// =====================================================

const unsigned long SAMPLE_INTERVAL = 2000;

const unsigned long MOTOR_ON_MS = 200;
const unsigned long MOTOR_OFF_MS = 300;

const unsigned long SIREN_INTERVAL = 450;
const unsigned long SYNC_RETRY_MS = 10000;

// =====================================================
// 5. GLOBAL VARIABLES
// =====================================================

float heartRate = 140.0;
float spo2 = 98.0;

float temperature1 = NAN;
float temperature2 = NAN;

bool simOverride = false;

bool manualAlarm = false;
bool motorState = false;

bool syncActive = false;
bool waitingACK = false;

bool previousConnection = false;

uint32_t bootID = 0;
uint32_t nextRecordID = 1;
uint32_t waitingRecordID = 0;

unsigned long lastSample = 0;
unsigned long lastMotor = 0;
unsigned long lastSiren = 0;
unsigned long lastSync = 0;

int sirenStep = 0;

String btInput = "";

// =====================================================
// 6. BUZZER CONFIGURATION
// =====================================================

#if ESP_ARDUINO_VERSION_MAJOR >= 3

bool buzzerReady = false;

void setupBuzzer() {
  buzzerReady = ledcAttach(BUZZER_PIN, 2000, 8);
}

void buzzerTone(int frequency) {
  if (buzzerReady) {
    ledcWriteTone(BUZZER_PIN, frequency);
  }
}

void buzzerOff() {
  if (buzzerReady) {
    ledcWriteTone(BUZZER_PIN, 0);
  }
}

#else

void setupBuzzer() {
  ledcSetup(0, 2000, 8);
  ledcAttachPin(BUZZER_PIN, 0);
}

void buzzerTone(int frequency) {
  ledcWriteTone(0, frequency);
}

void buzzerOff() {
  ledcWriteTone(0, 0);
}

#endif

// =====================================================
// 7. MOTOR CONTROL
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
// 8. NTC TEMPERATURE READING
// =====================================================

float readNTC(int pin, float fixedR, float nominalR) {

  uint32_t sum = 0;

  for (int i = 0; i < 16; i++) {
    sum += analogReadMilliVolts(pin);
    delayMicroseconds(500);
  }

  float voltage = (sum / 16.0) / 1000.0;

  if (voltage <= 0.02 || voltage >= 3.28) {
    return NAN;
  }

  float resistance =
    fixedR * voltage / (ADC_SUPPLY - voltage);

  float steinhart = log(resistance / nominalR);

  steinhart /= NTC_BETA;
  steinhart += 1.0 / T25_K;
  steinhart = 1.0 / steinhart;

  float temperature = steinhart - 273.15;

  if (temperature < -40 || temperature > 125) {
    return NAN;
  }

  return temperature;
}

void readTemperatures() {

  temperature1 = readNTC(
    NTC1_PIN,
    NTC1_FIXED_R,
    NTC1_R25
  );

  temperature2 = readNTC(
    NTC2_PIN,
    NTC2_FIXED_R,
    NTC2_R25
  );
}

String temperatureString(float value) {

  if (isnan(value)) {
    return "NA";
  }

  return String(value, 2);
}

// =====================================================
// 9. SIMULATED HR AND SPO2
// =====================================================

void updateSimulation() {

  if (!simOverride) {

    heartRate = 140 + random(-3, 4);

    spo2 = 98 + random(-1, 2);
  }
}

// =====================================================
// 10. TIMESTAMP
// =====================================================

String getUptime() {
  return String(millis());
}

// =====================================================
// 11. FILE RECOVERY
// =====================================================

void recoverFiles() {

  // Previous pending file was renamed but
  // replacement was interrupted.

  if (!SD.exists(PENDING_FILE) &&
      SD.exists(BACKUP_FILE)) {

    SD.rename(BACKUP_FILE, PENDING_FILE);
  }

  // New pending file exists; old backup
  // is no longer required.

  if (SD.exists(PENDING_FILE) &&
      SD.exists(BACKUP_FILE)) {

    SD.remove(BACKUP_FILE);
  }

  if (SD.exists(TEMP_FILE)) {
    SD.remove(TEMP_FILE);
  }
}

// =====================================================
// 12. BOOT ID USING ESP32 NVS
// =====================================================

void loadBootID() {

  preferences.begin("neovital", false);

  bootID = preferences.getUInt("bootID", 0);

  bootID++;

  preferences.putUInt("bootID", bootID);

  preferences.end();

  Serial.print("BOOT ID: ");
  Serial.println(bootID);
}

// =====================================================
// 13. RECORD ID RECOVERY
// =====================================================

void scanFileIDs(const char* filename) {

  File file = SD.open(filename, FILE_READ);

  if (!file) return;

  while (file.available()) {

    String line = file.readStringUntil('\n');
    line.trim();

    if (line.startsWith("ID,")) continue;

    int comma = line.indexOf(',');

    if (comma <= 0) continue;

    uint32_t id = line.substring(0, comma).toInt();

    if (id >= nextRecordID) {
      nextRecordID = id + 1;
    }
  }

  file.close();
}

// =====================================================
// 14. STORAGE INITIALIZATION
// =====================================================

void initializeStorage() {

  recoverFiles();

  if (!SD.exists(PENDING_FILE)) {

    File file = SD.open(PENDING_FILE, FILE_WRITE);

    if (file) {

      file.println(
        "ID,BOOT_ID,UPTIME_MS,HR_BPM,SPO2,NTC1_C,NTC2_C"
      );

      file.close();
    }
  }

  if (!SD.exists(ARCHIVE_FILE)) {

    File file = SD.open(ARCHIVE_FILE, FILE_WRITE);

    if (file) {

      file.println(
        "ID,BOOT_ID,UPTIME_MS,HR_BPM,SPO2,NTC1_C,NTC2_C"
      );

      file.close();
    }
  }

  loadBootID();

  scanFileIDs(PENDING_FILE);
  scanFileIDs(ARCHIVE_FILE);

  Serial.print("NEXT RECORD ID: ");
  Serial.println(nextRecordID);
}

// =====================================================
// 15. CREATE CSV RECORD
// =====================================================

String createRecord() {

  String record = "";

  record += String(nextRecordID);
  record += ",";
  record += String(bootID);
  record += ",";
  record += getUptime();
  record += ",";
  record += String(heartRate, 0);
  record += ",";
  record += String(spo2, 0);
  record += ",";
  record += temperatureString(temperature1);
  record += ",";
  record += temperatureString(temperature2);

  return record;
}

// =====================================================
// 16. OFFLINE LOGGING
// =====================================================

void saveRecord() {

  if (!sdReady) return;

  String record = createRecord();

  File file = SD.open(PENDING_FILE, FILE_APPEND);

  if (file) {

    file.println(record);
    file.flush();
    file.close();

    nextRecordID++;

    Serial.println("SAVED: " + record);
  }
  else {

    Serial.println("SD WRITE ERROR");
  }
}

// =====================================================
// 17. FIRST PENDING RECORD
// =====================================================

String firstPendingRecord() {

  File file = SD.open(PENDING_FILE, FILE_READ);

  if (!file) return "";

  if (file.available()) {
    file.readStringUntil('\n');
  }

  String record = "";

  while (file.available()) {

    record = file.readStringUntil('\n');
    record.trim();

    if (record.length() > 0) break;
  }

  file.close();

  return record;
}

// =====================================================
// 18. CHECK ARCHIVE DUPLICATE
// =====================================================

bool archiveContains(uint32_t id) {

  File file = SD.open(ARCHIVE_FILE, FILE_READ);

  if (!file) return false;

  while (file.available()) {

    String line = file.readStringUntil('\n');

    int comma = line.indexOf(',');

    if (comma <= 0) continue;

    uint32_t currentID =
      line.substring(0, comma).toInt();

    if (currentID == id) {

      file.close();

      return true;
    }
  }

  file.close();

  return false;
}

// =====================================================
// 19. CORRECTED ACK AND ARCHIVE FUNCTION
// =====================================================

bool acknowledgeRecord(uint32_t id) {

  File source = SD.open(PENDING_FILE, FILE_READ);

  if (!source) return false;

  File temp = SD.open(TEMP_FILE, FILE_WRITE);

  if (!temp) {

    source.close();

    return false;
  }

  bool found = false;

  bool duplicate = archiveContains(id);

  File archive = SD.open(ARCHIVE_FILE, FILE_APPEND);

  if (!archive) {

    source.close();
    temp.close();

    SD.remove(TEMP_FILE);

    return false;
  }

  while (source.available()) {

    String line = source.readStringUntil('\n');
    line.trim();

    if (line.length() == 0) continue;

    if (line.startsWith("ID,")) {

      temp.println(line);

      continue;
    }

    int comma = line.indexOf(',');

    uint32_t currentID = 0;

    if (comma > 0) {
      currentID = line.substring(0, comma).toInt();
    }

    if (currentID == id && !found) {

      found = true;

      if (!duplicate) {
        archive.println(line);
      }
    }
    else {

      temp.println(line);
    }
  }

  source.close();

  archive.flush();
  archive.close();

  temp.flush();
  temp.close();

  if (!found) {

    SD.remove(TEMP_FILE);

    return false;
  }

  // Preserve original pending file during replacement.

  if (SD.exists(BACKUP_FILE)) {
    SD.remove(BACKUP_FILE);
  }

  if (!SD.rename(PENDING_FILE, BACKUP_FILE)) {

    return false;
  }

  if (!SD.rename(TEMP_FILE, PENDING_FILE)) {

    SD.rename(BACKUP_FILE, PENDING_FILE);

    return false;
  }

  SD.remove(BACKUP_FILE);

  return true;
}

// =====================================================
// 20. PENDING RECORD COUNT
// =====================================================

uint32_t getPendingCount() {

  File file = SD.open(PENDING_FILE, FILE_READ);

  if (!file) return 0;

  uint32_t count = 0;

  while (file.available()) {

    String line = file.readStringUntil('\n');
    line.trim();

    if (line.length() > 0 &&
        !line.startsWith("ID,")) {

      count++;
    }
  }

  file.close();

  return count;
}

// =====================================================
// 21. HISTORICAL SYNCHRONIZATION
// =====================================================

void sendNextRecord() {

  if (!syncActive ||
      waitingACK ||
      !BT.hasClient()) {

    return;
  }

  String record = firstPendingRecord();

  if (record.length() == 0) {

    syncActive = false;

    BT.println("SYNC_COMPLETE");

    return;
  }

  int comma = record.indexOf(',');

  if (comma <= 0) return;

  waitingRecordID =
    record.substring(0, comma).toInt();

  BT.println("DATA," + record);

  waitingACK = true;

  lastSync = millis();
}

void handleACK(String command) {

  if (!waitingACK) return;

  if (!command.startsWith("ACK,")) return;

  uint32_t id = command.substring(4).toInt();

  if (id != waitingRecordID) {

    BT.println("ACK_ID_MISMATCH");

    return;
  }

  if (acknowledgeRecord(id)) {

    BT.println("ACK_OK," + String(id));

    waitingACK = false;

    waitingRecordID = 0;
  }
  else {

    BT.println("ACK_STORAGE_ERROR");

    waitingACK = false;

    syncActive = false;
  }
}

void syncManager() {

  if (!BT.hasClient() || !syncActive) return;

  if (waitingACK) {

    if (millis() - lastSync >= SYNC_RETRY_MS) {

      String record = firstPendingRecord();

      if (record.length() > 0) {

        BT.println("DATA," + record);
      }

      lastSync = millis();
    }

    return;
  }

  sendNextRecord();
}

// =====================================================
// 22. MANUAL VIBRATION AND SIREN
// =====================================================

void updateAlarm() {

  if (!manualAlarm) {

    motorsOff();
    buzzerOff();

    motorState = false;
    sirenStep = 0;

    return;
  }

  unsigned long now = millis();

  unsigned long duration =
    motorState ? MOTOR_ON_MS : MOTOR_OFF_MS;

  if (now - lastMotor >= duration) {

    lastMotor = now;

    motorState = !motorState;

    if (motorState) {
      motorsOn();
    }
    else {
      motorsOff();
    }
  }

  if (now - lastSiren >= SIREN_INTERVAL) {

    lastSiren = now;

    if (sirenStep == 0) {

      buzzerTone(700);

      sirenStep = 1;
    }
    else {

      buzzerTone(1100);

      sirenStep = 0;
    }
  }
}

// =====================================================
// 23. LIVE TELEMETRY
// =====================================================

void sendLiveData() {

  String message = "LIVE,";

  message += String(bootID);
  message += ",";
  message += getUptime();
  message += ",";
  message += String(heartRate, 0);
  message += ",";
  message += String(spo2, 0);
  message += ",";
  message += temperatureString(temperature1);
  message += ",";
  message += temperatureString(temperature2);
  message += ",";
  message += manualAlarm ? "ALARM" : "NORMAL";

  if (BT.hasClient()) {
    BT.println(message);
  }

  Serial.println(message);
}

// =====================================================
// 24. COMMAND PROCESSING
// =====================================================

void processCommand(String command) {

  command.trim();
  command.toUpperCase();

  if (command == "STATUS") {

    sendLiveData();
  }

  else if (command == "TEST ON") {

    manualAlarm = true;

    motorState = false;
    lastMotor = millis();

    sirenStep = 0;
    lastSiren = millis();

    BT.println("ALARM_STARTED");
  }

  else if (command == "TEST OFF") {

    manualAlarm = false;

    updateAlarm();

    BT.println("ALARM_STOPPED");
  }

  else if (command.startsWith("SIM HR ")) {

    float value = command.substring(7).toFloat();

    if (value >= 30 && value <= 250) {

      heartRate = value;

      simOverride = true;

      BT.println("SIM_HR_OK");
    }
    else {

      BT.println("INVALID_HR");
    }
  }

  else if (command.startsWith("SIM SPO2 ")) {

    float value = command.substring(9).toFloat();

    if (value >= 50 && value <= 100) {

      spo2 = value;

      simOverride = true;

      BT.println("SIM_SPO2_OK");
    }
    else {

      BT.println("INVALID_SPO2");
    }
  }

  else if (command == "SIM RESET") {

    simOverride = false;

    heartRate = 140;
    spo2 = 98;

    BT.println("SIM_RESET_OK");
  }

  else if (command == "SYNC") {

    if (!waitingACK) {

      syncActive = true;

      BT.println("SYNC_STARTED");
    }
  }

  else if (command == "SYNC_STATUS") {

    BT.println(
      "PENDING_COUNT," + String(getPendingCount())
    );
  }

  else if (command.startsWith("ACK,")) {

    handleACK(command);
  }

  else if (command == "HELP") {

    BT.println("STATUS");
    BT.println("TEST ON");
    BT.println("TEST OFF");
    BT.println("SIM HR 180");
    BT.println("SIM SPO2 90");
    BT.println("SIM RESET");
    BT.println("SYNC");
    BT.println("SYNC_STATUS");
    BT.println("ACK,<ID>");
  }

  else {

    BT.println("UNKNOWN_COMMAND");
  }
}

// =====================================================
// 25. BLUETOOTH INPUT
// =====================================================

void readBluetooth() {

  while (BT.available()) {

    char c = BT.read();

    if (c == '\n' || c == '\r') {

      if (btInput.length() > 0) {

        processCommand(btInput);

        btInput = "";
      }
    }

    else if (btInput.length() < 100) {

      btInput += c;
    }
  }
}

// =====================================================
// 26. SETUP
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

  randomSeed(micros());

  Serial.println();
  Serial.println("================================");
  Serial.println("       NEOVITAL ESP32");
  Serial.println("================================");

  // Bluetooth

  BT.begin(BT_NAME);

  Serial.println("BLUETOOTH READY");

  // SD Card

  SPI.begin(
    SD_SCK_PIN,
    SD_MISO_PIN,
    SD_MOSI_PIN,
    SD_CS_PIN
  );

  if (SD.begin(SD_CS_PIN, SPI, 10000000)) {

    sdReady = true;

    initializeStorage();

    Serial.println("SD CARD READY");
  }
  else {

    Serial.println("SD CARD ERROR");
  }

  Serial.println("HR/SPO2");
  Serial.println("NTC");
  Serial.println("TIME");
  Serial.println("AUTOMATIC ALARM");
  Serial.println("MANUAL BLUETOOTH ALARM: ENABLED");

  Serial.println("================================");
}

// =====================================================
// 27. MAIN LOOP
// =====================================================

void loop() {

  readBluetooth();

  unsigned long now = millis();

  // Bluetooth connection detection

  bool connected = BT.hasClient();

  if (connected && !previousConnection) {

    BT.println("CONNECTED");
    BT.println("NEOVITAL_READY");

    if (sdReady) {

      syncActive = true;
      waitingACK = false;

      BT.println("AUTO_SYNC_STARTED");
    }
  }

  if (!connected && previousConnection) {

    syncActive = false;
    waitingACK = false;

    Serial.println("BLUETOOTH DISCONNECTED");
  }

  previousConnection = connected;

  // Continuous sensor acquisition and logging

  if (now - lastSample >= SAMPLE_INTERVAL) {

    lastSample = now;

    updateSimulation();

    readTemperatures();

    saveRecord();

    if (connected) {
      sendLiveData();
    }
  }

  // Historical synchronization

  syncManager();

  // Manual alarm only

  updateAlarm();
}
