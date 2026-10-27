// La API Key se gestiona de forma segura a través de Vercel en /api/chat.js
const ICON_EYE_OPEN = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;

const ICON_EYE_CLOSED = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

let intervaloSimulacion = null;
let historialSesion = [];
let lecturasTemporalesTemp = [];
let lecturasTemporalesVib = [];

let chartGeneral = null;
let chartTemp = null;
let chartMpu = null;

document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll('.toggle-password').forEach(btn => {
        btn.innerHTML = ICON_EYE_OPEN;
    });

    const savedUser = localStorage.getItem("motoDiagUser");
    if (savedUser) {
        cargarPerfilUsuario(savedUser);
    }

    inicializarGraficosVisuales();
});

function togglePasswordVisibility(inputId, buttonElement) {
    const inputField = document.getElementById(inputId);
    if (inputField.type === "password") {
        inputField.type = "text";
        buttonElement.innerHTML = ICON_EYE_CLOSED;
    } else {
        inputField.type = "password";
        buttonElement.innerHTML = ICON_EYE_OPEN;
    }
}

function switchAuthForm(formId) {
    const forms = document.querySelectorAll('.auth-form');
    forms.forEach(form => form.classList.remove('active-form'));
    document.getElementById(formId).classList.add('active-form');
}

function handleEnter(event, type) {
    if (event.key === "Enter") {
        if (type === 'login') iniciarSesion();
    }
}

async function registrarUsuario() {
    const user = document.getElementById("reg-user").value.trim();
    const pass = document.getElementById("reg-pass").value.trim();
    const marca = document.getElementById("reg-moto-marca").value.trim();
    const modelo = document.getElementById("reg-moto-modelo").value.trim();
    const cilindraje = document.getElementById("reg-moto-cilindraje").value.trim();
    const anio = document.getElementById("reg-moto-anio").value.trim();

    if (!user || !pass || !marca || !modelo) {
        alert("Por favor completa los campos obligatorios.");
        return;
    }

    localStorage.setItem("motoDiag_pass_" + user, pass);
    localStorage.setItem("motoDiag_moto_" + user, JSON.stringify({ marca, modelo, cilindraje, anio }));
    alert("¡Registro exitoso!");
    switchAuthForm('form-login');
}

async function iniciarSesion() {
    const user = document.getElementById("login-user").value.trim();
    const pass = document.getElementById("login-pass").value.trim();

    if (!user || !pass) {
        alert("Ingresa usuario y contraseña.");
        return;
    }

    const savedPass = localStorage.getItem("motoDiag_pass_" + user);
    if (savedPass && savedPass !== pass) {
        alert("Contraseña incorrecta.");
        return;
    }

    localStorage.setItem("motoDiagUser", user);
    cargarPerfilUsuario(user);
}

function cambiarContrasena() {
    const user = document.getElementById("rec-user").value.trim();
    const newPass = document.getElementById("rec-new-pass").value.trim();

    if (!user || !newPass) {
        alert("Por favor completa los campos.");
        return;
    }

    localStorage.setItem("motoDiag_pass_" + user, newPass);
    alert("Contraseña actualizada exitosamente.");
    switchAuthForm('form-login');
}

function cerrarSesion() {
    localStorage.removeItem("motoDiagUser");
    if (intervaloSimulacion) clearInterval(intervaloSimulacion);
    document.getElementById("app-container").style.display = "none";
    document.getElementById("login-screen").style.display = "flex";
    document.getElementById("login-screen").style.opacity = "1";
    document.getElementById("chatWidget").style.display = "none";
    switchAuthForm('form-login');
}

function cargarPerfilUsuario(username) {
    document.getElementById("login-screen").style.opacity = "0";
    setTimeout(() => {
        document.getElementById("login-screen").style.display = "none";
        document.getElementById("app-container").style.display = "flex";
    }, 300);

    document.getElementById("display-username").innerText = username;

    let motoData = JSON.parse(localStorage.getItem("motoDiag_moto_" + username)) || { marca: "Yamaha", modelo: "YCZ", cilindraje: "110cc" };
    let motoTexto = `${motoData.marca} ${motoData.modelo} (${motoData.cilindraje})`;
    
    document.getElementById("display-user-moto").innerText = motoTexto;
    document.getElementById("cfg-moto-marca").value = motoData.marca || "";
    document.getElementById("cfg-moto-modelo").value = motoData.modelo || "";
    document.getElementById("cfg-moto-cilindraje").value = motoData.cilindraje || "";

    document.getElementById("bot-greeting").innerText = `Hola ${username}. He cargado tu ${motoTexto}. Pregúntale a Gemini cualquier duda mecánica.`;
    renderizarHistorial();
}

function guardarDatosMoto() {
    const username = localStorage.getItem("motoDiagUser");
    const marca = document.getElementById("cfg-moto-marca").value.trim();
    const modelo = document.getElementById("cfg-moto-modelo").value.trim();
    const cilindraje = document.getElementById("cfg-moto-cilindraje").value.trim();

    const motoData = { marca, modelo, cilindraje };
    localStorage.setItem("motoDiag_moto_" + username, JSON.stringify(motoData));

    document.getElementById("display-user-moto").innerText = `${marca} ${modelo} (${cilindraje})`;
    alert("¡Datos de la moto actualizados!");
}

function inicializarGraficosVisuales() {
    const ctxGeneral = document.getElementById('graficoEvolucionGeneral').getContext('2d');
    chartGeneral = new Chart(ctxGeneral, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                { label: 'Temperatura (°C)', data: [], borderColor: '#3B82F6', backgroundColor: 'rgba(59, 130, 246, 0.1)', tension: 0.4, fill: true },
                { label: 'Vibración (G)', data: [], borderColor: '#EF4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', tension: 0.4, fill: true }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: false } } }
    });

    const ctxTemp = document.getElementById('graficoTempRt').getContext('2d');
    chartTemp = new Chart(ctxTemp, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{ label: 'Sensor Temperatura (°C)', data: [], borderColor: '#F59E0B', backgroundColor: 'rgba(245, 158, 11, 0.15)', tension: 0.3, fill: true }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    const ctxMpu = document.getElementById('graficoMpuRt').getContext('2d');
    chartMpu = new Chart(ctxMpu, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{ label: 'Eje Z IMU (G RMS)', data: [], borderColor: '#10B981', backgroundColor: 'rgba(16, 185, 129, 0.15)', tension: 0.3, fill: true }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function iniciarMedicionSimulada() {
    const lblEstadoConfig = document.getElementById("estado-medicion-lbl");
    lblEstadoConfig.innerText = "Estado: 🟢 Sensores activos transmitiendo datos...";
    lblEstadoConfig.style.color = "#10B981";

    lecturasTemporalesTemp = [];
    lecturasTemporalesVib = [];

    alert("¡Medición iniciada! Los gráficos interactivos comenzaron a registrar la telemetría en tiempo real.");

    if (intervaloSimulacion) clearInterval(intervaloSimulacion);

    intervaloSimulacion = setInterval(() => {
        let tempVal = Number((96 + Math.random() * 4).toFixed(1));
        let rmsVal = Number((3.5 + Math.random() * 1.5).toFixed(1));
        
        lecturasTemporalesTemp.push(tempVal);
        lecturasTemporalesVib.push(rmsVal);

        let estadoVib = rmsVal > 4.2 ? "Anormal" : "Estable";
        let estadoGlb = estadoVib === "Anormal" ? "Óptimo (Con Alertas)" : "Óptimo";
        let horaActual = new Date().toLocaleTimeString();

        document.getElementById("val-estado-global").innerText = estadoGlb;
        document.getElementById("val-estado-global").style.color = "#10B981";
        document.getElementById("val-temp-media").innerText = `${tempVal} °C`;
        document.getElementById("val-temp-media").style.color = "#0F172A";
        document.getElementById("val-vibracion").innerText = estadoVib;
        document.getElementById("val-vibracion").style.color = estadoVib === "Anormal" ? "#EF4444" : "#10B981";

        document.getElementById("val-temp-telemetria").innerText = `${tempVal} °C`;
        document.getElementById("val-temp-telemetria").style.color = "#0F172A";
        document.getElementById("val-vib-telemetria").innerText = `${rmsVal} G (RMS)`;
        document.getElementById("val-vib-telemetria").style.color = estadoVib === "Anormal" ? "#EF4444" : "#10B981";

        agregarDatoGrafico(chartGeneral, horaActual, [tempVal, rmsVal * 10]);
        agregarDatoGrafico(chartTemp, horaActual, [tempVal]);
        agregarDatoGrafico(chartMpu, horaActual, [rmsVal]);

    }, 3000);
}

function agregarDatoGrafico(chart, etiqueta, valores) {
    if (!chart) return;
    if (chart.data.labels.length > 10) {
        chart.data.labels.shift();
        chart.data.datasets.forEach(dataset => dataset.data.shift());
    }
    chart.data.labels.push(etiqueta);
    chart.data.datasets.forEach((dataset, index) => {
        dataset.data.push(valores[index]);
    });
    chart.update();
}

function detenerMedicionSimulada() {
    if (!intervaloSimulacion) {
        alert("No hay ninguna medición activa en este momento.");
        return;
    }

    clearInterval(intervaloSimulacion);
    intervaloSimulacion = null;

    const lblEstadoConfig = document.getElementById("estado-medicion-lbl");
    lblEstadoConfig.innerText = "Estado: ⏹️ Medición detenida. Resumen guardado en Historial.";
    lblEstadoConfig.style.color = "#EF4444";

    let severidadFinal = "Óptimo";
    let badgeClase = "bg-success";
    let descripcionReporte = "";

    if (lecturasTemporalesTemp.length > 0) {
        let promedioTemp = lecturasTemporalesTemp.reduce((a, b) => a + b, 0) / lecturasTemporalesTemp.length;
        let promedioVib = lecturasTemporalesVib.reduce((a, b) => a + b, 0) / lecturasTemporalesVib.length;

        if (promedioTemp > 99 || promedioVib > 4.3) {
            severidadFinal = "Crítico";
            badgeClase = "bg-danger";
            descripcionReporte = `⚠️ Alerta: Se detectó alta fricción y tendencia térmica elevada (Promedio: ${promedioTemp.toFixed(1)}°C). Se debe revisar la motocicleta de inmediato.`;
        } else if (promedioTemp > 97.5 || promedioVib > 3.9) {
            severidadFinal = "Medio";
            badgeClase = "bg-warning";
            descripcionReporte = `⚡ Advertencia: Desviación moderada en vibración o temperatura (Promedio: ${promedioTemp.toFixed(1)}°C). Se sugiere mantenimiento preventivo pronto.`;
        } else {
            severidadFinal = "Óptimo";
            badgeClase = "bg-success";
            descripcionReporte = `✅ Reporte favorable: La motocicleta se encuentra en óptimas condiciones. Parámetros estables (Promedio: ${promedioTemp.toFixed(1)}°C).`;
        }
    } else {
        descripcionReporte = "Sesión finalizada sin suficientes muestras de datos.";
    }

    let fechaHoraStr = new Date().toLocaleString();
    let nuevoRegistro = {
        fecha: fechaHoraStr,
        modulo: "Telemetría Integral (IMU & Temp)",
        descripcion: descripcionReporte,
        severidad: severidadFinal,
        estado: "Revisado",
        badge: badgeClase
    };

    historialSesion.unshift(nuevoRegistro);
    renderizarHistorial();

    alert("⏹️ Medición detenida. El mini reporte analítico se ha registrado correctamente en el Historial de Fallas.");
}

function renderizarHistorial() {
    const tbody = document.getElementById("historial-tabla-body");
    tbody.innerHTML = "";

    if (historialSesion.length === 0) {
        let tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="5" style="text-align: center; color: #64748B;">Aún no hay registros. Realiza una medición de telemetría para generar el historial.</td>`;
        tbody.appendChild(tr);
        return;
    }

    historialSesion.forEach(item => {
        let tr = document.createElement("tr");
        tr.innerHTML = `<td>${item.fecha}</td><td><strong>${item.modulo}</strong></td><td>${item.descripcion}</td><td>${item.severidad}</td><td><span class="badge ${item.badge}">${item.estado}</span></td>`;
        tbody.appendChild(tr);
    });
}

function switchView(viewId, menuItem) {
    const views = document.querySelectorAll('.view');
    views.forEach(view => view.classList.remove('active-view'));

    const menuItems = document.querySelectorAll('.menu-item:not(.ai-chat)');
    menuItems.forEach(item => item.classList.remove('active'));

    document.getElementById(viewId).classList.add('active-view');
    menuItem.classList.add('active');
}

function toggleChat() {
    const chatWidget = document.getElementById('chatWidget');
    chatWidget.style.display = (chatWidget.style.display === 'flex') ? 'none' : 'flex';
}

function handleChatEnter(event) {
    if (event.key === "Enter") enviarMensajeIA();
}

async function enviarMensajeIA() {
    const inputField = document.getElementById("chat-input-field");
    const mensaje = inputField.value.trim();
    if (!mensaje) return;

    const container = document.getElementById("chat-messages-container");

    let userDiv = document.createElement("div");
    userDiv.className = "message user";
    userDiv.innerText = mensaje;
    container.appendChild(userDiv);
    inputField.value = "";
    container.scrollTop = container.scrollHeight;

    let loadingDiv = document.createElement("div");
    loadingDiv.className = "message bot";
    loadingDiv.id = "loading-bot";
    loadingDiv.innerText = "Gemini está analizando...";
    container.appendChild(loadingDiv);
    container.scrollTop = container.scrollHeight;

    const username = localStorage.getItem("motoDiagUser");
    let motoData = JSON.parse(localStorage.getItem("motoDiag_moto_" + username)) || { marca: "Yamaha", modelo: "YCZ", cilindraje: "110cc" };

    let respuestaTexto = null;
    let ultimoError = "";

    // 1. Intentar llamar al backend serverless de Vercel (/api/chat)
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: mensaje, motoData: motoData })
        });

        if (response.ok) {
            const data = await response.json();
            if (data.reply) {
                respuestaTexto = data.reply;
            } else if (data.error) {
                ultimoError = data.error;
            }
        } else {
            const errData = await response.json().catch(() => ({}));
            ultimoError = errData.error || `Error HTTP ${response.status}`;
        }
    } catch (e) {
        ultimoError = "Servicio serverless no disponible localmente.";
    }

    // 2. Si no hubo respuesta por el backend (p. ej. en pruebas locales estáticas sin Vercel dev)
    // verificar si se configuró una clave manual en localStorage
    if (!respuestaTexto) {
        const localKey = localStorage.getItem("motoDiag_gemini_key");
        if (localKey) {
            const promptSistema = `Eres un asistente mecánico experto de la plataforma "MotoDiag IA". El usuario maneja una motocicleta ${motoData.marca} ${motoData.modelo} con cilindraje ${motoData.cilindraje}. Responde de forma técnica pero accesible y breve a cualquier duda sobre mantenimiento, telemetría, temperatura, vibración o fallas mecánicas de su vehículo. Pregunta del usuario: "${mensaje}"`;
            const modelosDisponibles = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];

            for (const modelo of modelosDisponibles) {
                try {
                    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${localKey}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: promptSistema }] }]
                        })
                    });

                    const d = await resp.json();
                    if (d.candidates && d.candidates[0].content.parts[0].text) {
                        respuestaTexto = d.candidates[0].content.parts[0].text;
                        break;
                    } else if (d.error) {
                        ultimoError = d.error.message;
                    }
                } catch (err) {
                    ultimoError = err.message || "Error de conexión con Gemini.";
                }
            }
        }
    }

    if (document.getElementById("loading-bot")) {
        document.getElementById("loading-bot").remove();
    }

    let botDiv = document.createElement("div");
    botDiv.className = "message bot";

    if (respuestaTexto) {
        botDiv.innerText = respuestaTexto;
    } else {
        botDiv.innerText = `⚠️ No fue posible consultar al asistente. ${ultimoError ? '(' + ultimoError + ')' : ''}\n\nSi estás en Vercel, asegúrate de configurar la variable de entorno GEMINI_API_KEY en los ajustes del proyecto (Project Settings > Environment Variables).`;
    }

    container.appendChild(botDiv);
    container.scrollTop = container.scrollHeight;
}