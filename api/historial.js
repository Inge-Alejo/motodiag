// Almacén en memoria persistente en el contenedor serverless de Vercel
let historialGlobalEnMemoria = [
    {
        id: "reg_init_1",
        fecha: "26/10/2026, 08:30 PM",
        modulo: "Configuración & Moto",
        descripcion: "Actualización técnica de la motocicleta: Yamaha YCZ 110cc registrada",
        severidad: "Normal",
        badgeClass: "bg-success",
        estado: "Al día",
        timestamp: Date.now() - 3600000
    },
    {
        id: "reg_init_2",
        fecha: "26/10/2026, 07:15 PM",
        modulo: "Telemetría en Vivo",
        descripcion: "Medición en régimen parejo y continuo: Temp Media 89.4°C | Vibración Media 0.94g",
        severidad: "Normal",
        badgeClass: "bg-success",
        estado: "Completado",
        timestamp: Date.now() - 7200000
    },
    {
        id: "reg_init_3",
        fecha: "25/10/2026, 04:10 PM",
        modulo: "Dispositivo ESP32",
        descripcion: "Sonda DS18B20 culata 88.7°C | IMU MPU6050 0.94g sincronizado por WiFi iPhone Andres",
        severidad: "Normal",
        badgeClass: "bg-success",
        estado: "Completado",
        timestamp: Date.now() - 86400000
    }
];

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method === 'GET') {
        return res.status(200).json({
            ok: true,
            total: historialGlobalEnMemoria.length,
            historial: historialGlobalEnMemoria
        });
    }

    if (req.method === 'POST') {
        try {
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            if (!body || !body.modulo) {
                return res.status(400).json({ error: "Faltan campos obligatorios" });
            }

            const nuevoRegistro = {
                id: body.id || "reg_" + Date.now(),
                fecha: body.fecha || new Date().toLocaleString(),
                modulo: body.modulo,
                descripcion: body.descripcion || "Sin descripción",
                severidad: body.severidad || "Normal",
                badgeClass: body.badgeClass || (body.severidad === "Advertencia" ? "bg-warning" : "bg-success"),
                estado: body.estado || "Completado",
                timestamp: body.timestamp || Date.now()
            };

            historialGlobalEnMemoria.unshift(nuevoRegistro);
            if (historialGlobalEnMemoria.length > 50) {
                historialGlobalEnMemoria.pop();
            }

            return res.status(200).json({
                ok: true,
                mensaje: "Registro guardado en base de datos de Vercel con éxito",
                registro: nuevoRegistro,
                historial: historialGlobalEnMemoria
            });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    }

    if (req.method === 'DELETE') {
        historialGlobalEnMemoria = [];
        return res.status(200).json({ ok: true, mensaje: "Historial vaciado" });
    }

    return res.status(405).json({ error: "Método no permitido" });
}
