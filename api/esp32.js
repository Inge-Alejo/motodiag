// Endpoint serverless en Vercel para recepción y consulta de telemetría real del ESP32
let ultimaTramaHardwareReal = null;
let contadorPaquetesHardware = 0;
let timestampUltimaConexion = null;

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Consulta desde la interfaz web
    if (req.method === 'GET') {
        const ahora = Date.now();
        // Se considera en línea si envió datos en los últimos 15 segundos
        const estaEnLinea = timestampUltimaConexion && (ahora - timestampUltimaConexion < 15000);

        return res.status(200).json({
            ok: true,
            hayDatosReales: !!ultimaTramaHardwareReal,
            enLinea: estaEnLinea,
            paquetesRecibidos: contadorPaquetesHardware,
            ultimaTrama: ultimaTramaHardwareReal,
            timestamp: timestampUltimaConexion
        });
    }

    // Envío desde el ESP32 real
    if (req.method === 'POST') {
        try {
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            if (!body) {
                return res.status(400).json({ error: "Payload inválido" });
            }

            contadorPaquetesHardware++;
            timestampUltimaConexion = Date.now();

            const temp = typeof body.temperatura === 'number' ? body.temperatura : (parseFloat(body.temperatura) || 0);
            const ax = parseFloat(body.ax || 0);
            const ay = parseFloat(body.ay || 0);
            const az = parseFloat(body.az || 0);
            const vib = typeof body.vibracion_total === 'number' ? body.vibracion_total : Math.sqrt(ax*ax + ay*ay + az*az);

            ultimaTramaHardwareReal = {
                dispositivo: body.dispositivo || "ESP32_YCZ110",
                moto: body.moto || "Yamaha YCZ 110",
                temperatura: parseFloat(temp.toFixed(1)),
                ax: parseFloat(ax.toFixed(2)),
                ay: parseFloat(ay.toFixed(2)),
                az: parseFloat(az.toFixed(2)),
                vibracion_total: parseFloat(vib.toFixed(2)),
                rssi: body.rssi || -55,
                wifi: body.wifi || "iPhone Andres",
                uptime_s: body.uptime_s || Math.floor(timestampUltimaConexion / 1000),
                timestamp: timestampUltimaConexion,
                esHardwareReal: true
            };

            return res.status(200).json({
                ok: true,
                mensaje: "Telemetría recibida por Vercel",
                recibidoEn: new Date(timestampUltimaConexion).toISOString()
            });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    }

    return res.status(405).json({ error: "Método no permitido" });
}
