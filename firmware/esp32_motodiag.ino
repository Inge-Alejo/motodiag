/**
 * MotoDiag IA - Firmware para ESP32-D
 * Lectura de telemetría en tiempo real para Yamaha YCZ 110:
 * - Temperatura del motor con sensor DS18B20 (GPIO 4)
 * - Vibración y acelerometría con sensor MPU6050 (I2C SDA=21, SCL=22)
 * - Conexión WiFi al punto de acceso móvil ("iPhone Andres")
 * - Transmisión en tiempo real a Firebase Database
 */

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <math.h>
#include "config.h"

// Instancias de sensores
OneWire oneWire(ONE_WIRE_BUS_PIN);
DallasTemperature ds18b20(&oneWire);

// Banderas de estado de hardware
bool mpuAvailable = false;
bool dsAvailable = false;

// Variables de sincronización y temporización
uint32_t lastReadTime = 0;
uint32_t lastHistoryPushTime = 0;
uint32_t packetCounter = 0;

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
    Serial.println("[WiFi] ¡Conexión establecida con éxito!");
    Serial.print("[WiFi] IP Asignada por iPhone: ");
    Serial.println(WiFi.localIP());
    Serial.print("[WiFi] RSSI (Calidad de señal): ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
  } else {
    Serial.println();
    Serial.println("[WiFi] Advertencia: No se pudo conectar al punto de acceso. Reintentando en segundo plano...");
  }
}

// =========================================================================
// TRANSMISIÓN DE DATOS A FIREBASE (REST API)
// =========================================================================
void enviarDatosAFirebase(float tempC, float ax, float ay, float az, float aMag, const char* estadoTermico, const char* estadoVibracion) {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  WiFiClientSecure client;
  client.setInsecure(); // Para conexiones HTTPS sin cargar certificados CA completos

  HTTPClient http;

  // Construir URL del nodo en tiempo real
  String url = String(FIREBASE_HOST) + "/dispositivo/live.json";
  if (strlen(FIREBASE_AUTH) > 0) {
    url += "?auth=" + String(FIREBASE_AUTH);
  }

  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");

  // Construir cuerpo JSON ligero
  String jsonPayload = "{";
  jsonPayload += "\"dispositivo\":\"ESP32-D\",";
  jsonPayload += "\"moto\":{";
  jsonPayload += "\"marca\":\"" + String(MOTO_MARCA) + "\",";
  jsonPayload += "\"modelo\":\"" + String(MOTO_MODELO) + "\",";
  jsonPayload += "\"cilindraje\":\"" + String(MOTO_CILINDRAJE) + "\"";
  jsonPayload += "},";
  jsonPayload += "\"temperatura\":" + (isnan(tempC) ? "null" : String(tempC, 2)) + ",";
  jsonPayload += "\"estadoTermico\":\"" + String(estadoTermico) + "\",";
  jsonPayload += "\"vibracion\":{";
  jsonPayload += "\"ax\":" + (isnan(ax) ? "null" : String(ax, 3)) + ",";
  jsonPayload += "\"ay\":" + (isnan(ay) ? "null" : String(ay, 3)) + ",";
  jsonPayload += "\"az\":" + (isnan(az) ? "null" : String(az, 3)) + ",";
  jsonPayload += "\"magnitud\":" + (isnan(aMag) ? "null" : String(aMag, 3)) + ",";
  jsonPayload += "\"estado\":\"" + String(estadoVibracion) + "\"";
  jsonPayload += "},";
  jsonPayload += "\"paquete\":" + String(packetCounter++) + ",";
  jsonPayload += "\"wifiRSSI\":" + String(WiFi.RSSI()) + ",";
  jsonPayload += "\"ip\":\"" + WiFi.localIP().toString() + "\",";
  jsonPayload += "\"timestamp\":" + String(millis());
  jsonPayload += "}";

  // Usar PATCH para actualizar los datos en tiempo real
  int httpResponseCode = http.PATCH(jsonPayload);

  if (httpResponseCode > 0) {
    // Éxito al actualizar
    if (httpResponseCode == 200) {
      // Opcional: Serial.println("[Firebase] Datos enviados.");
    }
  } else {
    Serial.print("[Firebase] Error en envío HTTP: ");
    Serial.println(http.errorToString(httpResponseCode).c_str());
  }

  http.end();

  // Cada 5 segundos guardar un registro histórico en /dispositivo/historial
  if (millis() - lastHistoryPushTime > 5000) {
    lastHistoryPushTime = millis();
    String historyUrl = String(FIREBASE_HOST) + "/dispositivo/historial.json";
    if (strlen(FIREBASE_AUTH) > 0) {
      historyUrl += "?auth=" + String(FIREBASE_AUTH);
    }
    http.begin(client, historyUrl);
    http.addHeader("Content-Type", "application/json");
    http.POST(jsonPayload);
    http.end();
  }
}

// =========================================================================
// SETUP DEL MICROCONTROLADOR
// =========================================================================
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("==================================================");
  Serial.println("  MotoDiag IA - Firmware ESP32 Telemetria Activa  ");
  Serial.println("  Motocicleta Objetivo: Yamaha YCZ 110            ");
  Serial.println("==================================================");

  // 1. Inicializar I2C para MPU6050
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  mpuAvailable = initMPU6050();
  if (mpuAvailable) {
    Serial.println("[Sensor MPU6050] OK -> Conectado en I2C (SDA=21, SCL=22, Addr=0x68)");
  } else {
    Serial.println("[Sensor MPU6050] ERROR -> No responde en bus I2C.");
  }

  // 2. Inicializar DS18B20
  ds18b20.begin();
  ds18b20.setResolution(10); // Resolución de 10 bits (~187 ms de conversión, ideal para 500 ms)
  dsAvailable = (ds18b20.getDeviceCount() > 0);
  if (dsAvailable) {
    Serial.println("[Sensor DS18B20] OK -> Detectado en GPIO 4 con pull-up 4.7k");
  } else {
    Serial.println("[Sensor DS18B20] ERROR -> No se detectó sonda térmica en GPIO 4.");
  }

  // 3. Conectar a WiFi
  conectarWiFi();

  Serial.println("--------------------------------------------------");
  Serial.println("Iniciando bucle de lectura y telemetria...");
}

// =========================================================================
// LOOP PRINCIPAL
// =========================================================================
void loop() {
  uint32_t now = millis();

  // Mantener WiFi activo
  if (WiFi.status() != WL_CONNECTED && (now % 5000 < 50)) {
    conectarWiFi();
  }

  // Control de intervalo de muestreo (500 ms)
  if (now - lastReadTime < READ_INTERVAL_MS) {
    return;
  }
  lastReadTime = now;

  float ax = NAN, ay = NAN, az = NAN, aMag = NAN;
  float tempC = NAN;
  bool mpuOk = false;
  bool dsOk = false;

  // 1. Lectura del Acelerómetro / IMU
  if (mpuAvailable) {
    mpuOk = readMPUAccelG(ax, ay, az);
    if (mpuOk) {
      aMag = sqrtf(ax * ax + ay * ay + az * az);
    }
  }

  // 2. Lectura del Sensor de Temperatura DS18B20
  if (dsAvailable) {
    ds18b20.requestTemperatures();
    tempC = ds18b20.getTempCByIndex(0);
    dsOk = (tempC != DEVICE_DISCONNECTED_C && tempC > -50.0f && tempC < 150.0f);
  }

  // 3. Clasificación y Diagnóstico para Yamaha YCZ 110
  // La Yamaha YCZ 110 es refrigerada por aire. Temperaturas normales del cilindro: 85°C - 105°C
  const char* estadoTermico = "Óptimo";
  if (dsOk) {
    if (tempC > 115.0f) {
      estadoTermico = "Crítico (Sobrecalentamiento)";
    } else if (tempC > 100.0f) {
      estadoTermico = "Advertencia (Elevada)";
    } else if (tempC < 40.0f) {
      estadoTermico = "Motor Frío";
    } else {
      estadoTermico = "Operación Normal";
    }
  } else {
    estadoTermico = "Sin Lectura";
  }

  // Evaluación de vibración en el chasis/motor
  const char* estadoVibracion = "Normal";
  if (mpuOk) {
    if (aMag > 2.5f) {
      estadoVibracion = "Fricción / Anomalía Alta";
    } else if (aMag > 1.8f) {
      estadoVibracion = "Vibración Moderada";
    } else {
      estadoVibracion = "Estable";
    }
  } else {
    estadoVibracion = "Sin Datos";
  }

  // 4. Imprimir en Monitor Serie para depuración
  Serial.print("[Telemetria] Temp: ");
  if (dsOk) {
    Serial.print(tempC, 2);
    Serial.print(" °C (");
    Serial.print(estadoTermico);
    Serial.print(")");
  } else {
    Serial.print("ERR");
  }

  Serial.print(" | Acel: X=");
  if (mpuOk) {
    Serial.print(ax, 2);
    Serial.print(" Y=");
    Serial.print(ay, 2);
    Serial.print(" Z=");
    Serial.print(az, 2);
    Serial.print(" G | |A|=");
    Serial.print(aMag, 2);
    Serial.print(" G (");
    Serial.print(estadoVibracion);
    Serial.print(")");
  } else {
    Serial.print("ERR");
  }

  Serial.print(" | WiFi: ");
  Serial.println(WiFi.status() == WL_CONNECTED ? "Conectado" : "Buscando...");

  // 5. Enviar a Firebase Realtime Database
  enviarDatosAFirebase(tempC, ax, ay, az, aMag, estadoTermico, estadoVibracion);
}