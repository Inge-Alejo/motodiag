# 🔌 Firmware ESP32-D - MotoDiag Telemetría en Vivo (Yamaha YCZ 110)

Código fuente para el microcontrolador **ESP32 DevKit V1** configurado para capturar y transmitir telemetría en tiempo real desde los sensores de la motocicleta a través de la red WiFi compartida por tu iPhone hacia Firebase y la plataforma web MotoDiag.

---

## 🧰 Diagrama de Conexiones Físicas (Basado en Tinkered.ai)

| Componente | Terminal Sensor | Pin ESP32-D | Notas de Cableado |
| :--- | :--- | :--- | :--- |
| **DS18B20 (Temperatura)** | VCC (Rojo) | **3V3** (Pin 2) | Alimentación 3.3V |
| | GND (Negro) | **GND** (Pin 15) | Tierra común |
| | DATA (Amarillo) | **GPIO 4** (Pin 14) | **Importante:** Conectar resistencia de 4.7kΩ entre DATA y 3.3V |
| **MPU6050 (Acelerómetro/Giro)**| VCC | **3V3** | Alimentación 3.3V |
| | GND | **GND** | Tierra común |
| | SDA | **GPIO 21** (Pin 7) | Bus I2C de datos |
| | SCL | **GPIO 22** (Pin 4) | Bus I2C de reloj |

---

## 📶 Configuración de Conexión WiFi
El firmware viene configurado por defecto con las credenciales solicitadas:
- **Red WiFi (Punto de acceso móvil):** `iPhone Andres`
- **Contraseña:** `andresj123`

Si necesitas cambiar la red o la URL de tu base de datos de Firebase, solo edita el archivo `src/config.h`.

---

## 🚀 Cómo Programar el ESP32

### Opción A: Usando Arduino IDE
1. Abre **Arduino IDE** (v2.x recomendado).
2. Ve a **Archivo > Abrir** y selecciona `esp32_motodiag.ino`.
3. Ve a **Herramientas > Administrador de Bibliotecas** e instala:
   - `OneWire` de Paul Stoffregen
   - `DallasTemperature` de Miles Burton
4. Selecciona tu placa: **Herramientas > Placa > esp32 > ESP32 Dev Module**.
5. Conecta el ESP32 por USB y selecciona el puerto COM correspondiente.
6. Pulsa **Subir** (Upload). Abre el Monitor Serie a **115200 baudios** para ver el estado de los sensores y la conexión WiFi.

### Opción B: Usando PlatformIO (VS Code)
1. Abre la carpeta `firmware` en Visual Studio Code con la extensión PlatformIO instalada.
2. PlatformIO descargará automáticamente las bibliotecas especificadas en `platformio.ini`.
3. Haz clic en el icono de **Upload** en la barra inferior de PlatformIO.