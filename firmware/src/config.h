#pragma once

// =========================================================================
// CONFIGURACIÓN DE RED WIFI (Punto de acceso móvil)
// =========================================================================
#define WIFI_SSID       "iPhone Andres"
#define WIFI_PASSWORD   "andresj123"

// =========================================================================
// CONFIGURACIÓN DE FIREBASE REALTIME DATABASE
// =========================================================================
// Ejemplo: "https://motodiag-default-rtdb.firebaseio.com" (sin barra final)
#define FIREBASE_HOST   "https://motodiag-tu-proyecto-default-rtdb.firebaseio.com"
// Clave secreta de la base de datos (Database Secret) o Auth Token (opcional si las reglas son públicas o de prueba)
#define FIREBASE_AUTH   ""

// =========================================================================
// PINES DE HARDWARE (Configuración extraída de Tinkered.ai)
// =========================================================================
// Sensor Inercial MPU6050 (I2C)
#define I2C_SDA_PIN     21
#define I2C_SCL_PIN     22
#define MPU6050_ADDR    0x68

// Sensor Térmico DS18B20 (OneWire)
// Requiere resistencia pull-up de 4.7kΩ conectada entre GPIO4 y 3.3V
#define ONE_WIRE_BUS_PIN 4

// =========================================================================
// PARÁMETROS DEL VEHÍCULO Y TIEMPO DE TRANSMISIÓN
// =========================================================================
#define MOTO_MARCA      "Yamaha"
#define MOTO_MODELO     "YCZ"
#define MOTO_CILINDRAJE "110cc"

// Intervalo de muestreo y envío en milisegundos (500 ms)
#define READ_INTERVAL_MS 500