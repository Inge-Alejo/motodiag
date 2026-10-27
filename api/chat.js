export default async function handler(req, res) {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
        res.setHeader(
            'Access-Control-Allow-Headers',
            'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
        );
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido. Solo se acepta POST.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({
            error: 'La variable de entorno GEMINI_API_KEY no está configurada en Vercel. Por favor agrégala en los ajustes del proyecto.'
        });
    }

    try {
        const { message, motoData } = req.body || {};
        if (!message || typeof message !== 'string') {
            return res.status(400).json({ error: 'El mensaje del usuario es obligatorio.' });
        }

        const marca = motoData?.marca || 'Yamaha';
        const modelo = motoData?.modelo || 'YCZ';
        const cilindraje = motoData?.cilindraje || '110cc';

        const promptSistema = `Eres el asistente mecánico experto y oficial de la plataforma "MotoDiag IA". 
El usuario conduce una motocicleta ${marca} ${modelo} (cilindraje: ${cilindraje}, motor 4 tiempos refrigerado por aire).
Responde de forma técnica pero accesible, profesional, clara y concisa a cualquier consulta sobre mecánica, telemetría, mantenimiento, bujías, lubricación o fallas.

INSTRUCCIONES DE FORMATO:
- Escribe en un estilo directo, limpio y conversacional de chat.
- Puedes usar negritas normales para resaltar piezas o pasos clave (ejemplo: bujía NGK CR6HSA, aceite Yamalube 20W-50).
- Usa viñetas con guiones (-) o números (1., 2., 3.) para listas de pasos ordenados.
- Evita párrafos gigantescos; sé amigable, claro y didáctico.

Pregunta del usuario: "${message}"`;

        const modelos = [
            "gemini-flash-lite-latest",
            "gemini-3.8-flash",
            "gemini-flash-latest",
            "gemini-3.8-pro"
        ];

        let respuestaTexto = null;
        let ultimoError = '';

        for (const modeloItem of modelos) {
            try {
                const response = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${modeloItem}:generateContent?key=${apiKey}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{
                                parts: [{ text: promptSistema }]
                            }]
                        })
                    }
                );

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    ultimoError = errData?.error?.message || `HTTP ${response.status}`;
                    continue;
                }

                const data = await response.json();
                const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (texto) {
                    respuestaTexto = texto;
                    break;
                }
            } catch (err) {
                ultimoError = err.message || 'Error de conexión con Gemini';
            }
        }

        if (!respuestaTexto) {
            return res.status(502).json({
                error: `No se pudo obtener respuesta de la IA: ${ultimoError}`
            });
        }

        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.status(200).json({ reply: respuestaTexto });
    } catch (error) {
        console.error('Error en /api/chat:', error);
        return res.status(500).json({ error: 'Error interno del servidor procesando la solicitud.' });
    }
}
