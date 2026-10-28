#pragma once

// =========================================================================
// CONFIGURACIÓN DE RED WIFI (Punto de acceso móvil)
// =========================================================================
#define WIFI_SSID       "iPhone Andres"
#define WIFI_PASSWORD   "andresj123"

// =========================================================================
// CONFIGURACIÓN DE FIREBASE REALTIME DATABASE (PROYECTO: motodiag-e6676)
// =========================================================================
#define FIREBASE_HOST   "https://motodiag-e6676-default-rtdb.firebaseio.com"
#define FIREBASE_AUTH   ""
#define FIRESTORE_URL   "https://firestore.googleapis.com/v1/projects/motodiag-e6676/databases/(default)/documents/dispositivo/live"

// Intervalo de transmisión en milisegundos (1 segundo)
#define TELEMETRY_INTERVAL_MS 1000
#define READ_INTERVAL_MS      TELEMETRY_INTERVAL_MS

// =========================================================================
// MODO DE SIMULACIÓN (Misma física dinámica del Panel General para pruebas)
// =========================================================================
#define SIMULACION_ACTIVA true

// =========================================================================
// ASIGNACIÓN DE PINES HARDWARE (Tinkered.ai Circuit)
// =========================================================================
// Sensor DS18B20 (Temperatura motor/culata OneWire)
// Requiere resistencia de pull-up de 4.7kΩ entre DATA y 3.3V
#define PIN_DS18B20      4
#define ONE_WIRE_BUS_PIN PIN_DS18B20

// Sensor MPU6050 (Acelerómetro/Giroscopio I2C para vibraciones)
#define PIN_I2C_SDA      21
#define PIN_I2C_SCL      22
#define I2C_SDA_PIN      PIN_I2C_SDA
#define I2C_SCL_PIN      PIN_I2C_SCL
#define MPU6050_ADDR     0x68

// =========================================================================
// DATOS DE LA MOTOCICLETA
// =========================================================================
#define MOTO_ID         "moto_yamaha_ycz110"
#define MOTO_MARCA      "Yamaha"
#define MOTO_MODELO     "YCZ 110"
#define MOTO_CILINDRAJE "110cc"

// Umbrales térmicos para motor 110cc 4T refrigerado por aire
#define TEMP_OPTIMA_MIN 70.0
#define TEMP_OPTIMA_MAX 105.0
#define TEMP_ALERTA     115.0
#define TEMP_CRITICA    125.0
