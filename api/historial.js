// Endpoint serverless en Vercel para respaldo de historial
let historialGlobalEnMemoria = [];

export default async function handler(req, res) {
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
            if (historialGlobalEnMemoria.length > 100) {
                historialGlobalEnMemoria.pop();
            }

            return res.status(200).json({
                ok: true,
                mensaje: "Registro guardado en respaldo de Vercel",
                registro: nuevoRegistro
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
