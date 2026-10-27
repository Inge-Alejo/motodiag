# 🏍️ MotoDiag IA - Diagnóstico Predictivo & Telemetría para Motocicletas

Plataforma web moderna e interactiva para el monitoreo en tiempo real, análisis de vibración/temperatura y diagnóstico predictivo asistido por Inteligencia Artificial (Google Gemini) para motocicletas.

![MotoDiag Banner](https://img.shields.io/badge/MotoDiag-IA%20Predictiva-blue?style=for-the-badge&logo=motorcycle)
![Vercel Ready](https://img.shields.io/badge/Vercel-Deployment%20Ready-black?style=for-the-badge&logo=vercel)
![Gemini AI](https://img.shields.io/badge/Google%20Gemini-Powered-orange?style=for-the-badge&logo=google)

---

## 🚀 Características Principales

- **📊 Panel General Dinámico**: Métricas de estado global, temperatura media y nivel de vibración en tiempo real.
- **📈 Telemetría en Vivo con Chart.js**: Gráficos interactivos de temperatura y acelerometría/vibración eje Z (sensor MPU6050 / IMU).
- **⚠️ Sistema Predictivo de Alertas**: Clasificación automática de severidad (Crítica, Media, Óptima) con detección de fricción y anomalías térmicas.
- **📝 Historial y Registro de Fallas**: Bitácora de mediciones con resúmenes analíticos automáticos.
- **🤖 Asistente Mecánico IA (Google Gemini)**: Chat contextualizado con los datos de tu moto (marca, modelo, cilindraje) capaz de resolver dudas de mantenimiento y análisis de fallas.
- **🔒 Arquitectura Serverless Segura para Vercel**: La clave de API de Gemini (`GEMINI_API_KEY`) se procesa de forma segura a través de una función serverless (`/api/chat`), sin exponer credenciales en el cliente web ni en el repositorio.

---

## 📁 Estructura del Proyecto

```plaintext
Motodiag/
├── api/
│   └── chat.js          # Función Serverless para procesar consultas con Gemini AI en Vercel
├── css/
│   └── styles.css       # Estilos visuales modernos, responsivos y tema dashboard
├── js/
│   └── app.js           # Lógica de telemetría, gráficos dinámicos y cliente del chat
├── .env.example         # Ejemplo de variable de entorno para la API de Gemini
├── .gitignore           # Exclusión de archivos de log, variables de entorno y temporales
├── index.html           # Interfaz principal de la plataforma
├── package.json         # Metadatos del proyecto y configuración de módulos ES
├── vercel.json          # Configuración de despliegue y cabeceras de seguridad para Vercel
└── README.md            # Documentación general
```

---

## ⚡ Despliegue en Vercel

1. **Importar Repositorio en Vercel**:
   - Ingresa a [Vercel](https://vercel.com/) y haz clic en **"Add New" > "Project"**.
   - Conecta tu cuenta de GitHub y selecciona el repositorio `Inge-Alejo/motodiag`.
2. **Configurar Variable de Entorno**:
   - En la sección **Environment Variables**, agrega:
     - **Key**: `GEMINI_API_KEY`
     - **Value**: Tu clave de API de Google Gemini (puedes obtenerla gratuitamente en [Google AI Studio](https://aistudio.google.com/)).
3. **Desplegar**:
   - Presiona **"Deploy"**. Vercel publicará la aplicación estática y configurará automáticamente la ruta `/api/chat`.

---

## 💻 Ejecución Local

Para probar la plataforma en tu máquina local:

```bash
# Opción 1: Con Vercel CLI (soporta las serverless functions localmente)
npm i -g vercel
vercel dev

# Opción 2: Con cualquier servidor web estático (ej. live-server, http-server o npx serve)
npx serve .
```

> **Nota para modo puramente estático**: Si abres `index.html` sin el CLI de Vercel, puedes guardar temporalmente tu clave en el almacenamiento local del navegador para pruebas directas.

---

## 🛠️ Tecnologías

- **HTML5 & CSS3 Vanilla**: Diseño modular sin dependencias pesadas.
- **JavaScript (ES Modules)**: Manipulación de DOM y gestión reactiva de estado.
- **Chart.js**: Renderizado de telemetría en tiempo real.
- **Vercel Serverless Functions**: Backend ligero y seguro en Node.js.
- **Google Generative AI (Gemini 2.5 / 2.0 / 1.5 Flash)**: Inferencia de lenguaje natural para asistencia mecánica predictiva.

---

Desarrollado para diagnóstico automotriz y optimización de rendimiento en motocicletas.
