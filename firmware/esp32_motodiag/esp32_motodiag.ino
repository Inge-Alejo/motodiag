/**
 * MotoDiag IA - Firmware para ESP32-D
 * Telemetría en tiempo real para Yamaha YCZ 110:
 * - Temperatura del motor (DS18B20 o física térmica simulada parejo 82°C-98°C)
 * - Vibración y acelerometría (MPU6050 o modelo armónico parejo 0.85g-1.45g)
 * - Conexión WiFi al punto de acceso móvil ("iPhone Andres")
 * - Transmisión en tiempo real a Firebase Database (/dispositivo/live.json)
 */

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <math.h>

#if __has_include("config.h")
  #include "config.h"
#elif __has_include("src/config.h")
  #include "src/config.h"
#endif

// =========================================================================
// CREDENCIALES Y PARÁMETROS (Si config.h no se copia al otro equipo)
// =========================================================================
#ifndef WIFI_SSID
  #define WIFI_SSID       "iPhone Andres"
  #define WIFI_PASSWORD   "andresj123"
  #define FIREBASE_HOST   "https://motodiag-e6676-default-rtdb.firebaseio.com"
  #define FIREBASE_AUTH   ""
  #define FIRESTORE_URL   "https://firestore.googleapis.com/v1/projects/motodiag-e6676/databases/(default)/documents/dispositivo/live"
  #define TELEMETRY_INTERVAL_MS 1000
  #define READ_INTERVAL_MS      TELEMETRY_INTERVAL_MS
  #define SIMULACION_ACTIVA     true
  #define PIN_DS18B20           4
  #define ONE_WIRE_BUS_PIN      PIN_DS18B20
  #define PIN_I2C_SDA           21
  #define PIN_I2C_SCL           22
  #define I2C_SDA_PIN           PIN_I2C_SDA
  #define I2C_SCL_PIN           PIN_I2C_SCL
  #define MPU6050_ADDR          0x68
  #define MOTO_ID               "moto_yamaha_ycz110"
  #define MOTO_MARCA            "Yamaha"
  #define MOTO_MODELO           "YCZ 110"
  #define MOTO_CILINDRAJE       "110cc"
#endif

#ifndef FIRESTORE_URL
  #define FIRESTORE_URL   "https://firestore.googleapis.com/v1/projects/motodiag-e6676/databases/(default)/documents/dispositivo/live"
#endif

// Sensores físicos: solo se requieren si la simulación está desactivada y las librerías están instaladas
#if !SIMULACION_ACTIVA && __has_include(<OneWire.h>) && __has_include(<DallasTemperature.h>)
  #include <OneWire.h>
  #include <DallasTemperature.h>
  #define HARDWARE_ONEWIRE_DISPONIBLE 1
  OneWire oneWire(ONE_WIRE_BUS_PIN);
  DallasTemperature ds18b20(&oneWire);
#else
  #define HARDWARE_ONEWIRE_DISPONIBLE 0
#endif

// Banderas de estado de hardware
bool mpuAvailable = false;
bool dsAvailable = false;

// Variables de sincronización y temporización
uint32_t lastReadTime = 0;
uint32_t lastHistoryPushTime = 0;
uint32_t packetCounter = 0;

// =========================================================================
// MODELO DE SIMULACIÓN FÍSICA YCZ 110 (LÓGICA IDÉNTICA AL PANEL GENERAL)
// =========================================================================
struct FisicaMotorSimulada {
  float tempCulata = 89.2f;   // Base térmica óptima (~89.2°C)
  float vibracionG = 0.94f;   // Base armónica parejo en 110cc (~0.94g)
  uint32_t tiempoTicks = 0;
} simMotor;

// Generador de número flotante aleatorio en rango [minVal, maxVal]
float randomFloat(float minVal, float maxVal) {
  float r = (float)random(0, 10000) / 10000.0f;
  return minVal + r * (maxVal - minVal);
}

void actualizarFisicaSimulada(float& outTemp, float& outAx, float& outAy, float& outAz, float& outMag) {
  simMotor.tiempoTicks++;
  uint32_t t = simMotor.tiempoTicks;

  // 1. FÍSICA TÉRMICA (Variación dinámica entre 82.0°C y 98.0°C, centro en 89.5°C)
  float tempActual = simMotor.tempCulata;
  float tendenciaMedia = (89.5f - tempActual) * 0.12f;
  float ruidoAleatorio = randomFloat(-2.0f, 2.0f);
  float pulsoDinamico = sinf(t * 0.3f) * 1.5f;

  float deltaTemp = tendenciaMedia + ruidoAleatorio + pulsoDinamico;
  if (deltaTemp < -4.5f) deltaTemp = -4.5f;
  if (deltaTemp > 4.5f) deltaTemp = 4.5f;

  float tempCalculada = tempActual + deltaTemp;
  if (tempCalculada < 82.0f) {
    tempCalculada = 82.0f + randomFloat(0.0f, 1.5f);
  } else if (tempCalculada > 98.0f) {
    tempCalculada = 98.0f - randomFloat(0.0f, 1.5f);
  }
  simMotor.tempCulata = tempCalculada;
  outTemp = simMotor.tempCulata;

  // 2. FÍSICA DE VIBRACIÓN (Dispersa y proporcional entre 0.85g y 1.45g, centro 1.10g)
  float vibActual = simMotor.vibracionG;
  float tendenciaVib = (1.10f - vibActual) * 0.15f;
  float ruidoVib = randomFloat(-0.18f, 0.18f);
  float vibCalculada = vibActual + tendenciaVib + ruidoVib;
  if (vibCalculada < 0.85f) vibCalculada = 0.85f + randomFloat(0.0f, 0.08f);
  if (vibCalculada > 1.45f) vibCalculada = 1.45f - randomFloat(0.0f, 0.08f);
  simMotor.vibracionG = vibCalculada;
  outMag = simMotor.vibracionG;

  // 3. DESGLOSE TRIDIMENSIONAL DE EJES PARA MPU6050
  // Eje Z: movimiento alternativo del pistón/gravedad (mayor componente)
  // Ejes X e Y: vibraciones armónicas transversales del chasis
  outAx = 0.06f + sinf(t * 0.45f) * 0.03f + randomFloat(-0.015f, 0.015f);
  outAy = 0.08f + cosf(t * 0.35f) * 0.04f + randomFloat(-0.015f, 0.015f);
  float diffSq = (outMag * outMag) - (outAx * outAx) - (outAy * outAy);
  outAz = (diffSq > 0.05f) ? sqrtf(diffSq) : (outMag * 0.98f);
}

// =========================================================================
// FUNCIONES AUXILIARES PARA EL MPU6050 (I2C)
// =========================================================================
bool mpuWriteRegister(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(reg);
  Wire.write(value);
  return (Wire.endTransmission() == 0);
}

bool mpuReadBytes(uint8_t startReg, uint8_t* buffer, size_t len) {
  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(startReg);
  if (Wire.endTransmission(false) != 0) {
    return false;
  }

  size_t received = Wire.requestFrom((uint8_t)MPU6050_ADDR, (uint8_t)len);
  if (received != len) {
    return false;
  }

  for (size_t i = 0; i < len; i++) {
    buffer[i] = Wire.read();
  }
  return true;
}

bool initMPU6050() {
  Wire.beginTransmission(MPU6050_ADDR);
  if (Wire.endTransmission() != 0) {
    return false;
  }

  // Despertar el MPU6050 (limpiar bit de sleep en PWR_MGMT_1)
  if (!mpuWriteRegister(0x6B, 0x00)) {
    return false;
  }

  // Configurar rango del acelerómetro a ±2g (sensibilidad: 16384 LSB/g)
  if (!mpuWriteRegister(0x1C, 0x00)) {
    return false;
  }

  return true;
}

bool readMPUAccelG(float& ax, float& ay, float& az) {
  uint8_t data[6];
  if (!mpuReadBytes(0x3B, data, sizeof(data))) {
    return false;
  }

  int16_t rawAx = (int16_t)((data[0] << 8) | data[1]);
  int16_t rawAy = (int16_t)((data[2] << 8) | data[3]);
  int16_t rawAz = (int16_t)((data[4] << 8) | data[5]);

  // Conversión a unidades de gravedad (G)
  ax = rawAx / 16384.0f;
  ay = rawAy / 16384.0f;
  az = rawAz / 16384.0f;

  return true;
}

// =========================================================================
// CONEXIÓN WIFI AUTOMÁTICA
// =========================================================================
void conectarWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.println();
  Serial.print("[WiFi] Conectando a red: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  uint8_t intentos = 0;
  while (WiFi.status() != WL_CONNECTED && intentos < 20) {
    delay(500);
    Serial.print(".");
    intentos++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.println("[WiFi] Conexión establecida con éxito!");
    Serial.print("[WiFi] IP Asignada por iPhone: ");
    Serial.println(WiFi.localIP());
    Serial.print("[WiFi] RSSI: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
  } else {
    Serial.println();
    Serial.println("[WiFi] Advertencia: Conexión en progreso. Reintentando...");
  }
}

// =========================================================================
// TRANSMISIÓN DE DATOS A FIREBASE (REST API)
// =========================================================================
void enviarDatosAFirebase(float tempC, float ax, float ay, float az, float aMag, const char* estadoTermico, const char* estadoVibracion) {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  uint32_t currentPacket = ++packetCounter;
  WiFiClientSecure client;
  client.setInsecure(); // Conexión HTTPS directa a Google Cloud Firestore
  client.setTimeout(4); // 4 segundos timeout para no frenar el bucle

  HTTPClient http;

  // 1. TRANSMISIÓN PRINCIPAL: Cloud Firestore REST API v1
  // Escribe al documento /dispositivo/live en Google Cloud Firestore
  http.begin(client, FIRESTORE_URL);
  http.addHeader("Content-Type", "application/json");

  String firestorePayload = "{\"fields\":{";
  firestorePayload += "\"dispositivo\":{\"stringValue\":\"ESP32-D\"},";
  firestorePayload += "\"moto\":{\"stringValue\":\"" + String(MOTO_MARCA) + " " + String(MOTO_MODELO) + "\"},";
  firestorePayload += "\"temperatura\":{\"doubleValue\":" + (isnan(tempC) ? "89.5" : String(tempC, 1)) + "},";
  firestorePayload += "\"estadoTermico\":{\"stringValue\":\"" + String(estadoTermico) + "\"},";
  firestorePayload += "\"ax\":{\"doubleValue\":" + (isnan(ax) ? "0.08" : String(ax, 3)) + "},";
  firestorePayload += "\"ay\":{\"doubleValue\":" + (isnan(ay) ? "0.06" : String(ay, 3)) + "},";
  firestorePayload += "\"az\":{\"doubleValue\":" + (isnan(az) ? "0.95" : String(az, 3)) + "},";
  firestorePayload += "\"vibracion_total\":{\"doubleValue\":" + (isnan(aMag) ? "1.10" : String(aMag, 3)) + "},";
  firestorePayload += "\"estadoVibracion\":{\"stringValue\":\"" + String(estadoVibracion) + "\"},";
  firestorePayload += "\"wifi\":{\"stringValue\":\"" + String(WIFI_SSID) + "\"},";
  firestorePayload += "\"wifiRSSI\":{\"integerValue\":\"" + String(WiFi.RSSI()) + "\"},";
  firestorePayload += "\"ip\":{\"stringValue\":\"" + WiFi.localIP().toString() + "\"},";
  firestorePayload += "\"paquetes\":{\"integerValue\":\"" + String(currentPacket) + "\"},";
  firestorePayload += "\"timestamp\":{\"integerValue\":\"" + String(millis()) + "\"}";
  firestorePayload += "}}";

  int httpResponseCode = http.PATCH(firestorePayload);

  if (httpResponseCode > 0) {
    if (httpResponseCode == 200) {
      Serial.printf("[Firestore] Trama #%u enviada OK -> Temp: %.1f C, Vib: %.2f g\n", currentPacket, tempC, aMag);
    } else {
      Serial.printf("[Firestore] Codigo HTTP: %d\n", httpResponseCode);
    }
  } else {
    Serial.print("[Firestore] Error de transmision: ");
    Serial.println(http.errorToString(httpResponseCode).c_str());
  }

  http.end();

  // 2. TRANSMISIÓN SECUNDARIA / RESPALDO: Realtime Database plano (si está configurado)
  #ifdef FIREBASE_HOST
  if (strlen(FIREBASE_HOST) > 0 && String(FIREBASE_HOST).indexOf("firebaseio.com") > 0) {
    String rtdbUrl = String(FIREBASE_HOST) + "/dispositivo/live.json";
    if (strlen(FIREBASE_AUTH) > 0) {
      rtdbUrl += "?auth=" + String(FIREBASE_AUTH);
    }
    http.begin(client, rtdbUrl);
    http.addHeader("Content-Type", "application/json");

    String jsonFlat = "{";
    jsonFlat += "\"dispositivo\":\"ESP32-D\",";
    jsonFlat += "\"moto\":\"" + String(MOTO_MARCA) + " " + String(MOTO_MODELO) + "\",";
    jsonFlat += "\"temperatura\":" + (isnan(tempC) ? "89.5" : String(tempC, 1)) + ",";
    jsonFlat += "\"estadoTermico\":\"" + String(estadoTermico) + "\",";
    jsonFlat += "\"ax\":" + (isnan(ax) ? "0.08" : String(ax, 3)) + ",";
    jsonFlat += "\"ay\":" + (isnan(ay) ? "0.06" : String(ay, 3)) + ",";
    jsonFlat += "\"az\":" + (isnan(az) ? "0.95" : String(az, 3)) + ",";
    jsonFlat += "\"vibracion_total\":" + (isnan(aMag) ? "1.10" : String(aMag, 3)) + ",";
    jsonFlat += "\"estadoVibracion\":\"" + String(estadoVibracion) + "\",";
    jsonFlat += "\"wifi\":\"" + String(WIFI_SSID) + "\",";
    jsonFlat += "\"wifiRSSI\":" + String(WiFi.RSSI()) + ",";
    jsonFlat += "\"ip\":\"" + WiFi.localIP().toString() + "\",";
    jsonFlat += "\"paquetes\":" + String(currentPacket) + ",";
    jsonFlat += "\"timestamp\":" + String(millis());
    jsonFlat += "}";

    http.PATCH(jsonFlat);
    http.end();
  }
  #endif
}

// =========================================================================
// SETUP DEL MICROCONTROLADOR
// =========================================================================
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("==================================================");
  Serial.println("  MotoDiag IA - Firmware ESP32 Telemetria Activa  ");
  Serial.println("  Vehiculo: Yamaha YCZ 110 (110cc 4T)             ");
#if SIMULACION_ACTIVA
  Serial.println("  Modo: SIMULACION DINAMICA ACTIVA (Panel General)");
#else
  Serial.println("  Modo: LECTURA DE HARDWARE REAL                  ");
#endif
  Serial.println("==================================================");

  // Inicializar bus I2C para sensor MPU6050
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  mpuAvailable = initMPU6050();
  if (mpuAvailable) {
    Serial.println("[Sensor MPU6050] OK -> Conectado en I2C (SDA=21, SCL=22)");
  } else {
    Serial.println("[Sensor MPU6050] INFO -> No detectado en bus I2C (usando simulacion).");
  }

  // Inicializar sensor térmico DS18B20 si está disponible
#if HARDWARE_ONEWIRE_DISPONIBLE
  ds18b20.begin();
  ds18b20.setResolution(10);
  dsAvailable = (ds18b20.getDeviceCount() > 0);
  if (dsAvailable) {
    Serial.println("[Sensor DS18B20] OK -> Sonda detectada en GPIO 4");
  } else {
    Serial.println("[Sensor DS18B20] INFO -> Sonda no detectada en GPIO 4 (usando simulacion).");
  }
#else
  #if SIMULACION_ACTIVA
    Serial.println("[Sensor DS18B20] Modo Simulacion Activo (Sin dependencias externas).");
  #else
    Serial.println("[Sensor DS18B20] Nota: Instalar 'OneWire' y 'DallasTemperature' en Arduino IDE.");
  #endif
#endif

  // Conectar a WiFi
  conectarWiFi();

  Serial.println("--------------------------------------------------");
  Serial.println("Iniciando bucle de transmision de telemetria...");
}

// =========================================================================
// LOOP PRINCIPAL
// =========================================================================
void loop() {
  uint32_t now = millis();

  // Mantener conexión WiFi
  if (WiFi.status() != WL_CONNECTED && (now % 5000 < 50)) {
    conectarWiFi();
  }

  // Intervalo de telemetría (1 segundo)
  if (now - lastReadTime < READ_INTERVAL_MS) {
    return;
  }
  lastReadTime = now;

  float ax = NAN, ay = NAN, az = NAN, aMag = NAN;
  float tempC = NAN;
  bool mpuOk = false;
  bool dsOk = false;

#if SIMULACION_ACTIVA
  // Generar física simulada exacta del panel general
  actualizarFisicaSimulada(tempC, ax, ay, az, aMag);
  dsOk = true;
  mpuOk = true;
#else
  // 1. Lectura del Acelerómetro / IMU
  if (mpuAvailable) {
    mpuOk = readMPUAccelG(ax, ay, az);
    if (mpuOk) {
      aMag = sqrtf(ax * ax + ay * ay + az * az);
    }
  }

  // 2. Lectura del Sensor Térmico DS18B20
  #if HARDWARE_ONEWIRE_DISPONIBLE
  if (dsAvailable) {
    ds18b20.requestTemperatures();
    tempC = ds18b20.getTempCByIndex(0);
    dsOk = (tempC != DEVICE_DISCONNECTED_C && tempC > -50.0f && tempC < 150.0f);
  }
  #endif

  // Fallback: si no hay sensores físicos conectados en el banco, usar simulación parejo
  if (!dsOk || !mpuOk) {
    float sTemp, sAx, sAy, sAz, sMag;
    actualizarFisicaSimulada(sTemp, sAx, sAy, sAz, sMag);
    if (!dsOk) {
      tempC = sTemp;
      dsOk = true;
    }
    if (!mpuOk) {
      ax = sAx;
      ay = sAy;
      az = sAz;
      aMag = sMag;
      mpuOk = true;
    }
  }
#endif

  // Clasificación diagnóstica (especificación Yamaha YCZ 110)
  const char* estadoTermico = "Operación Normal";
  if (tempC > 115.0f) {
    estadoTermico = "Crítico (Sobrecalentamiento)";
  } else if (tempC > 100.0f) {
    estadoTermico = "Advertencia (Elevada)";
  } else if (tempC < 50.0f) {
    estadoTermico = "Motor Frío";
  } else {
    estadoTermico = "Operación Normal";
  }

  const char* estadoVibracion = "Normal";
  if (aMag > 2.2f) {
    estadoVibracion = "Fricción / Anomalía Alta";
  } else if (aMag > 1.6f) {
    estadoVibracion = "Vibración Moderada";
  } else {
    estadoVibracion = "Estable (Rango Óptimo)";
  }

  // Monitor Serial para depuración local
  Serial.print("[Telemetria ESP32] Temp: ");
  Serial.print(tempC, 1);
  Serial.print(" °C (");
  Serial.print(estadoTermico);
  Serial.print(") | Acel: X=");
  Serial.print(ax, 2);
  Serial.print(" Y=");
  Serial.print(ay, 2);
  Serial.print(" Z=");
  Serial.print(az, 2);
  Serial.print(" G | |A|=");
  Serial.print(aMag, 2);
  Serial.print(" G (");
  Serial.print(estadoVibracion);
  Serial.print(") | WiFi: ");
  Serial.println(WiFi.status() == WL_CONNECTED ? "Conectado" : "Buscando...");

  // Enviar a Firebase Realtime Database
  enviarDatosAFirebase(tempC, ax, ay, az, aMag, estadoTermico, estadoVibracion);
}
