// =========================================================================
// MOTODIAG IA - MOTOR DE TELEMETRÍA & GESTIÓN DE MOTOCICLETA
// Yamaha YCZ 110 - Sistema de Diagnóstico Inteligente
// =========================================================================

// Íconos SVG para mostrar / ocultar contraseña
const ICON_EYE_OPEN = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
const ICON_EYE_CLOSED = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

// Variables de simulación y física del motor (Yamaha YCZ 110)
let intervaloSimulacion = null;
let lecturasTemporalesTemp = [];
let lecturasTemporalesVib = [];

let estadoFisicaMotor = {
    tempCulata: 82.4,      // Temperatura inicial en culata (°C)
    vibracionG: 0.88,      // Nivel de aceleración (g)
    faseConduccion: 0,     // 0: Ralentí, 1: Aceleración, 2: Crucero, 3: Semáforo
    ticksEnFase: 0
};

// Gráficos Chart.js
let chartGeneral = null;
let chartTemp = null;
let chartMpu = null;
let chartEsp32Temp = null;
let chartEsp32Vib = null;

// Estado del Dispositivo ESP32
let esp32SimuladoInterval = null;
let esp32Simulando = false;
let esp32UltimaTrama = null;
let usuarioActualAuth = null;

// =========================================================================
// CONFIGURACIÓN DE FIREBASE (AUTHENTICATION & REALTIME DATABASE)
// =========================================================================
const defaultFirebaseConfig = {
    apiKey: "AIzaSyCpAyag547_IB4vZZNldfmiS9X1Z6O8kII",
    authDomain: "motodiag-e6676.firebaseapp.com",
    projectId: "motodiag-e6676",
    storageBucket: "motodiag-e6676.firebasestorage.app",
    messagingSenderId: "493156491098",
    appId: "1:493156491098:web:113961dbdfab5e24f49d63",
    databaseURL: "https://motodiag-e6676-default-rtdb.firebaseio.com"
};

let firebaseInicializado = false;
let auth = null;
let db = null;
let rtdb = null;

function inicializarFirebase() {
    if (typeof firebase === "undefined") {
        console.warn("SDK de Firebase Compat no detectado.");
        return;
    }
    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(defaultFirebaseConfig);
        }
        auth = firebase.auth();
        db = firebase.firestore();
        rtdb = firebase.database();
        firebaseInicializado = true;
        console.log("Firebase conectado exitosamente con proyecto:", defaultFirebaseConfig.projectId);

        auth.onAuthStateChanged(user => {
            if (user) {
                usuarioActualAuth = user;
                cargarPerfilUsuario(user.displayName || user.email.split("@")[0]);
            }
        });
    } catch (err) {
        console.warn("Aviso al inicializar Firebase:", err.message);
    }
}

// =========================================================================
// INICIALIZACIÓN AL CARGAR EL DOM
// =========================================================================
document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll('.toggle-password').forEach(btn => {
        btn.innerHTML = ICON_EYE_OPEN;
    });

    inicializarFirebase();

    const savedUser = localStorage.getItem("motoDiagUser");
    if (savedUser) {
        cargarPerfilUsuario(savedUser);
    }

    inicializarGraficosVisuales();
    inicializarGraficosESP32();
    cargarDatosMoto();
    cargarHistorialFallas();
});

// =========================================================================
// VISIBILIDAD DE CONTRASEÑA Y FORMULARIOS
// =========================================================================
function togglePasswordVisibility(inputId, buttonElement) {
    const inputField = document.getElementById(inputId);
    if (!inputField) return;
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
    const target = document.getElementById(formId);
    if (target) target.classList.add('active-form');
}

function handleEnter(event, type) {
    if (event.key === "Enter") {
        if (type === 'login') iniciarSesion();
    }
}

// =========================================================================
// AUTENTICACIÓN (LOGIN & REGISTRO DIRECTOS)
// =========================================================================
async function iniciarSesion() {
    const usuarioOCorreo = document.getElementById("login-user").value.trim();
    const contrasena = document.getElementById("login-pass").value.trim();

    if (!usuarioOCorreo || !contrasena) {
        alert("Por favor completa tu usuario o correo y tu contraseña.");
        return;
    }

    if (firebaseInicializado && auth) {
        try {
            let emailFinal = usuarioOCorreo;
            if (!usuarioOCorreo.includes("@")) {
                emailFinal = usuarioOCorreo.toLowerCase() + "@motodiag.app";
            }

            const cred = await auth.signInWithEmailAndPassword(emailFinal, contrasena);
            usuarioActualAuth = cred.user;
            cargarPerfilUsuario(cred.user.displayName || usuarioOCorreo);
            return;
        } catch (error) {
            console.warn("Fallo en login de Firebase:", error.code);
            if (error.code === "auth/user-not-found" || error.code === "auth/wrong-password" || error.code === "auth/invalid-credential") {
                alert("Usuario o contraseña incorrectos.");
                return;
            }
        }
    }

    const usuariosRegistrados = JSON.parse(localStorage.getItem("motoDiag_registered_users")) || {};
    if (usuariosRegistrados[usuarioOCorreo] && usuariosRegistrados[usuarioOCorreo].password === contrasena) {
        cargarPerfilUsuario(usuarioOCorreo);
    } else if (usuarioOCorreo === "admin" && contrasena === "1234") {
        cargarPerfilUsuario("admin");
    } else {
        alert("Credenciales incorrectas. Verifica tu usuario y contraseña.");
    }
}

async function registrarUsuario() {
    const regUser = document.getElementById("reg-user").value.trim();
    const regPass = document.getElementById("reg-pass").value.trim();
    const marca = document.getElementById("reg-moto-marca").value.trim() || "Yamaha";
    const modelo = document.getElementById("reg-moto-modelo").value.trim() || "YCZ";
    const cilindraje = document.getElementById("reg-moto-cilindraje").value.trim() || "110cc";
    const anio = document.getElementById("reg-moto-anio").value.trim() || "2024";

    if (!regUser || !regPass) {
        alert("Por favor ingresa un correo o nombre de usuario y una contraseña.");
        return;
    }

    if (regPass.length < 6) {
        alert("La contraseña debe tener al menos 6 caracteres.");
        return;
    }

    const motoData = { marca, modelo, cilindraje, anio };

    if (firebaseInicializado && auth) {
        try {
            let emailFinal = regUser;
            if (!regUser.includes("@")) {
                emailFinal = regUser.toLowerCase() + "@motodiag.app";
            }

            const cred = await auth.createUserWithEmailAndPassword(emailFinal, regPass);
            const user = cred.user;
            usuarioActualAuth = user;

            await user.updateProfile({ displayName: regUser.split("@")[0] });

            if (db) {
                await db.collection("users").doc(user.uid).set({
                    uid: user.uid,
                    email: user.email,
                    displayName: regUser.split("@")[0],
                    moto: motoData,
                    creadoEn: new Date().toISOString()
                }).catch(() => {});
            }

            guardarDatosMotoLocal(regUser.split("@")[0], motoData);
            alert("¡Cuenta creada exitosamente! Bienvenido a MotoDiag.");
            cargarPerfilUsuario(regUser.split("@")[0]);
            return;
        } catch (error) {
            console.error("Error en registro Firebase:", error);
            if (error.code === "auth/email-already-in-use") {
                alert("Este correo ya está registrado. Por favor inicia sesión.");
                switchAuthForm("form-login");
                return;
            }
            alert("Error en el registro: " + error.message);
            return;
        }
    }

    let usuariosRegistrados = JSON.parse(localStorage.getItem("motoDiag_registered_users")) || {};
    usuariosRegistrados[regUser] = {
        password: regPass,
        moto: motoData
    };
    localStorage.setItem("motoDiag_registered_users", JSON.stringify(usuariosRegistrados));
    guardarDatosMotoLocal(regUser, motoData);
    alert("¡Usuario registrado con éxito!");
    cargarPerfilUsuario(regUser);
}

function cambiarContrasena() {
    const userOrEmail = document.getElementById("rec-user").value.trim();
    if (!userOrEmail) {
        alert("Por favor ingresa tu correo electrónico.");
        return;
    }

    if (firebaseInicializado && auth && userOrEmail.includes("@")) {
        auth.sendPasswordResetEmail(userOrEmail).then(() => {
            alert("Se ha enviado un correo a " + userOrEmail + " para restablecer tu contraseña.");
            switchAuthForm("form-login");
        }).catch(err => {
            alert("Error al enviar correo de recuperación: " + err.message);
        });
        return;
    }

    alert("Ingresa un correo electrónico registrado.");
}

function cerrarSesion() {
    if (intervaloSimulacion) {
        clearInterval(intervaloSimulacion);
        intervaloSimulacion = null;
    }
    if (auth) {
        auth.signOut().catch(() => {});
    }

    localStorage.removeItem("motoDiagUser");
    usuarioActualAuth = null;

    const loginScreen = document.getElementById("login-screen");
    const appContainer = document.getElementById("app-container");
    const chatWidget = document.getElementById("chatWidget");

    if (appContainer) appContainer.style.display = "none";
    if (chatWidget) chatWidget.style.display = "none";

    if (loginScreen) {
        loginScreen.style.display = "flex";
        loginScreen.style.opacity = "1";
    }

    switchAuthForm('form-login');
}

function cargarPerfilUsuario(nombreUsuario) {
    localStorage.setItem("motoDiagUser", nombreUsuario);

    const loginScreen = document.getElementById("login-screen");
    const appContainer = document.getElementById("app-container");
    const chatWidget = document.getElementById("chatWidget");

    if (loginScreen) {
        loginScreen.style.opacity = "0";
        setTimeout(() => {
            loginScreen.style.display = "none";
            if (appContainer) appContainer.style.display = "flex";
            if (chatWidget) chatWidget.style.display = "flex";
        }, 300);
    } else {
        if (appContainer) appContainer.style.display = "flex";
        if (chatWidget) chatWidget.style.display = "flex";
    }

    const displayUser = document.getElementById("display-username");
    if (displayUser) displayUser.innerText = nombreUsuario;

    cargarDatosMoto(nombreUsuario);
    cargarHistorialFallas();
}

// =========================================================================
// MÓDULO: CONFIGURACIÓN & MOTO
// =========================================================================
function guardarDatosMotoLocal(username, moto) {
    const key = username ? "motoDiag_moto_" + username : "motoDiag_moto_data";
    localStorage.setItem(key, JSON.stringify(moto));
    localStorage.setItem("motoDiag_moto_data", JSON.stringify(moto));
}

function cargarDatosMoto(username) {
    const user = username || localStorage.getItem("motoDiagUser") || "default";
    const saved = localStorage.getItem("motoDiag_moto_" + user) || localStorage.getItem("motoDiag_moto_data");
    
    let motoData = {
        marca: "Yamaha",
        modelo: "YCZ",
        cilindraje: "110cc",
        anio: "2024"
    };

    if (saved) {
        try { motoData = Object.assign(motoData, JSON.parse(saved)); } catch(e){}
    }

    const inputsMarca = [document.getElementById("cfg-moto-marca"), document.getElementById("moto-marca")];
    const inputsModelo = [document.getElementById("cfg-moto-modelo"), document.getElementById("moto-modelo")];
    const inputsCil = [document.getElementById("cfg-moto-cilindraje"), document.getElementById("moto-cilindraje")];
    const inputsAnio = [document.getElementById("cfg-moto-anio"), document.getElementById("moto-anio")];

    inputsMarca.forEach(el => { if (el) el.value = motoData.marca || "Yamaha"; });
    inputsModelo.forEach(el => { if (el) el.value = motoData.modelo || "YCZ"; });
    inputsCil.forEach(el => { if (el) el.value = motoData.cilindraje || "110cc"; });
    inputsAnio.forEach(el => { if (el) el.value = motoData.anio || "2024"; });

    const displayMoto = document.getElementById("display-user-moto");
    if (displayMoto) {
        displayMoto.innerText = `${motoData.marca} ${motoData.modelo} (${motoData.cilindraje})`;
    }

    const bannerDesc = document.getElementById("moto-desc-banner");
    if (bannerDesc) {
        bannerDesc.innerText = `${motoData.marca} ${motoData.modelo} (${motoData.cilindraje} - ${motoData.anio})`;
    }
}

function guardarDatosMoto() {
    const user = localStorage.getItem("motoDiagUser") || "default";

    const getVal = (id1, id2, def) => {
        const el1 = document.getElementById(id1);
        if (el1 && el1.value.trim()) return el1.value.trim();
        const el2 = document.getElementById(id2);
        if (el2 && el2.value.trim()) return el2.value.trim();
        return def;
    };

    const motoData = {
        marca: getVal("cfg-moto-marca", "moto-marca", "Yamaha"),
        modelo: getVal("cfg-moto-modelo", "moto-modelo", "YCZ"),
        cilindraje: getVal("cfg-moto-cilindraje", "moto-cilindraje", "110cc"),
        anio: getVal("cfg-moto-anio", "moto-anio", "2024")
    };

    guardarDatosMotoLocal(user, motoData);
    cargarDatosMoto(user);

    if (db && usuarioActualAuth) {
        db.collection("users").doc(usuarioActualAuth.uid).set({ moto: motoData }, { merge: true }).catch(() => {});
    }

    alert("¡Información de la motocicleta actualizada con éxito!\n\n" + motoData.marca + " " + motoData.modelo + " (" + motoData.cilindraje + ")");
}

// =========================================================================
// MÓDULO: HISTORIAL DE FALLAS Y ANOMALÍAS (PERSISTENTE Y ACTIVO)
// =========================================================================
const registrosInicialesFallas = [
    {
        fecha: "26/10/2026, 08:30 PM",
        modulo: "Módulo Térmico",
        descripcion: "Régimen térmico en rango óptimo: culata estable a 88.4°C en ralentí",
        severidad: "Normal",
        badgeClass: "bg-success",
        estado: "Verificado"
    },
    {
        fecha: "25/10/2026, 05:15 PM",
        modulo: "Chasis / MPU6050",
        descripcion: "Vibración armónica monocilíndrica 1.12g dentro de tolerancia",
        severidad: "Normal",
        badgeClass: "bg-success",
        estado: "Completado"
    },
    {
        fecha: "24/10/2026, 11:20 AM",
        modulo: "Mantenimiento",
        descripcion: "Inspección de bujía NGK CR6HSA y nivel de lubricante Yamalube 20W-50",
        severidad: "Preventivo",
        badgeClass: "bg-warning",
        estado: "Al día"
    }
];

function cargarHistorialFallas() {
    const tbody = document.getElementById("historial-tabla-body");
    if (!tbody) return;

    let historialGuardado = localStorage.getItem("motoDiag_historial_fallas");
    let lista = [];

    if (historialGuardado) {
        try { lista = JSON.parse(historialGuardado); } catch(e){}
    }

    if (!lista || lista.length === 0) {
        lista = registrosInicialesFallas;
        localStorage.setItem("motoDiag_historial_fallas", JSON.stringify(lista));
    }

    tbody.innerHTML = "";
    lista.forEach(reg => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong>${reg.fecha}</strong></td>
            <td>${reg.modulo}</td>
            <td>${reg.descripcion}</td>
            <td><span class="badge ${reg.badgeClass}">${reg.severidad}</span></td>
            <td><span style="color:#10B981; font-weight:600;">${reg.estado}</span></td>
        `;
        tbody.appendChild(tr);
    });

    actualizarAlertasPredictivasPanel(lista);
}

function agregarEntradaHistorial(modulo, descripcion, severidad, estado) {
    let historialGuardado = localStorage.getItem("motoDiag_historial_fallas");
    let lista = [];

    if (historialGuardado) {
        try { lista = JSON.parse(historialGuardado); } catch(e){}
    }
    if (!lista) lista = [];

    const ahora = new Date();
    const fechaStr = ahora.toLocaleDateString() + ", " + ahora.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let badgeClass = "bg-success";
    if (severidad === "Advertencia" || severidad === "Media") badgeClass = "bg-warning";
    if (severidad === "Peligro" || severidad === "Crítico") badgeClass = "bg-danger";

    lista.unshift({
        fecha: fechaStr,
        modulo: modulo,
        descripcion: descripcion,
        severidad: severidad,
        badgeClass: badgeClass,
        estado: estado || "Registrado"
    });

    // Mantener hasta 25 registros
    if (lista.length > 25) lista.pop();

    localStorage.setItem("motoDiag_historial_fallas", JSON.stringify(lista));
    cargarHistorialFallas();
}


function limpiarHistorialFallas() {
    if (confirm("¿Deseas vaciar el historial de anomalías y mediciones?")) {
        localStorage.setItem("motoDiag_historial_fallas", JSON.stringify([]));
        const tbody = document.getElementById("historial-tabla-body");
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #64748B; padding: 24px;">Historial vacío. Realiza una medición en Telemetría o pulsa "Simular Diagnóstico" para generar registros.</td></tr>';
        }
        actualizarAlertasPredictivasPanel([]);
    }
}

function simularRegistroDiagnostico() {
    const eventos = [
        { mod: "Telemetría Térmica", desc: "Monitoreo continuo de culata: 88.4°C en rango óptimo de operación", sev: "Normal" },
        { mod: "Sensor MPU6050", desc: "Vibración de chasis 1.05g estable en régimen de 3,500 RPM", sev: "Normal" },
        { mod: "Sistema de Escape", desc: "Ligera contrapresión detectada tras aceleración prolongada", sev: "Advertencia" },
        { mod: "Mantenimiento Preventivo", desc: "Revisión programada de holgura de válvulas (admisión 0.08mm / escape 0.10mm)", sev: "Preventivo" },
        { mod: "Sistema Eléctrico", desc: "Tensión de carga del alternador estable a 14.1V", sev: "Normal" }
    ];
    const rand = eventos[Math.floor(Math.random() * eventos.length)];
    agregarEntradaHistorial(rand.mod, rand.desc, rand.sev, "Verificado");
}

function actualizarAlertasPredictivasPanel(lista) {
    const tbodyAlertas = document.getElementById("alertas-predictivas-body");
    if (!tbodyAlertas) return;

    tbodyAlertas.innerHTML = "";
    const ultimos = lista.slice(0, 3);
    ultimos.forEach(item => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><span class="badge ${item.badgeClass}">${item.severidad}</span></td>
            <td>${item.descripcion}</td>
        `;
        tbodyAlertas.appendChild(tr);
    });
}

// =========================================================================
// NAVEGACIÓN ENTRE VISTAS DEL PANEL LATERAL
// =========================================================================
function switchView(viewId, menuItem) {
    const views = document.querySelectorAll('.view');
    views.forEach(view => view.classList.remove('active-view'));

    const menuItems = document.querySelectorAll('.menu-item:not(.ai-chat)');
    menuItems.forEach(item => item.classList.remove('active'));

    const target = document.getElementById(viewId);
    if (target) target.classList.add('active-view');
    if (menuItem) menuItem.classList.add('active');

    if (viewId === 'dispositivo') {
        conectarTelemetriaESP32();
    }
    if (viewId === 'configuracion') {
        cargarDatosMoto();
    }
    if (viewId === 'historial') {
        cargarHistorialFallas();
    }
}

function toggleChat() {
    const chatWidget = document.getElementById('chatWidget');
    if (chatWidget) {
        chatWidget.style.display = (chatWidget.style.display === 'flex') ? 'none' : 'flex';
    }
}

// =========================================================================
// MÓDULO DISPOSITIVO ESP32 (HARDWARE REAL - INTACTO)
// =========================================================================
let rtdbListenerActivo = false;

function conectarTelemetriaESP32() {
    if (!rtdb || rtdbListenerActivo) return;

    try {
        const liveRef = rtdb.ref("dispositivo/live");
        liveRef.on("value", snapshot => {
            if (snapshot.exists()) {
                actualizarVistaESP32(snapshot.val());
            }
        });
        rtdbListenerActivo = true;
        console.log("Conectado a Firebase Realtime Database para telemetría ESP32.");
    } catch (err) {
        console.warn("Realtime Database listener:", err.message);
    }
}

function actualizarVistaESP32(data) {
    if (!data) return;
    esp32UltimaTrama = data;

    // 1. Temperatura DS18B20
    const tempVal = typeof data.temperatura === "number" ? data.temperatura : (parseFloat(data.temperatura) || 0);
    const tempElem = document.getElementById("esp32-temp-val");
    if (tempElem) tempElem.innerText = tempVal.toFixed(1);

    const tempFill = document.getElementById("esp32-temp-fill");
    if (tempFill) {
        const pct = Math.min(100, Math.max(0, ((tempVal - 20) / (130 - 20)) * 100));
        tempFill.style.width = pct + "%";
        tempFill.style.background = tempVal > 115 ? "#EF4444" : (tempVal > 100 ? "#F59E0B" : "#10B981");
    }

    const tempStatus = document.getElementById("esp32-temp-status");
    if (tempStatus) {
        if (tempVal > 115) {
            tempStatus.innerHTML = '<span style="color:#EF4444; font-weight:700;">⚠️ ALERTA: Sobrecalentamiento en culata/cilindro</span>';
        } else if (tempVal > 100) {
            tempStatus.innerHTML = '<span style="color:#F59E0B; font-weight:600;">⚡ Temperatura elevada (Monitorear flujo de aire)</span>';
        } else if (tempVal >= 70) {
            tempStatus.innerHTML = '<span style="color:#10B981; font-weight:600;">✓ Rango óptimo de trabajo (Yamaha YCZ 110)</span>';
        } else {
            tempStatus.innerHTML = '<span style="color:#64748B;">❄️ Motor frío / Fase de calentamiento</span>';
        }
    }

    // 2. Vibraciones MPU6050
    const ax = parseFloat(data.ax || 0);
    const ay = parseFloat(data.ay || 0);
    const az = parseFloat(data.az || 0);
    const vibTotal = typeof data.vibracion_total === "number" ? data.vibracion_total : (Math.sqrt(ax*ax + ay*ay + az*az) || 1.0);

    const vibElem = document.getElementById("esp32-vib-val");
    if (vibElem) vibElem.innerText = vibTotal.toFixed(2);

    const axElem = document.getElementById("esp32-ax-val");
    const ayElem = document.getElementById("esp32-ay-val");
    const azElem = document.getElementById("esp32-az-val");
    if (axElem) axElem.innerText = ax.toFixed(2);
    if (ayElem) ayElem.innerText = ay.toFixed(2);
    if (azElem) azElem.innerText = az.toFixed(2);

    const vibStatus = document.getElementById("esp32-vib-status");
    if (vibStatus) {
        if (vibTotal > 2.8) {
            vibStatus.innerHTML = '<span style="color:#EF4444; font-weight:700;">⚠️ Vibración excesiva: Revisar soporte de motor o biela</span>';
        } else if (vibTotal > 1.8) {
            vibStatus.innerHTML = '<span style="color:#F59E0B; font-weight:600;">⚡ Vibración media (Régimen de aceleración)</span>';
        } else {
            vibStatus.innerHTML = '<span style="color:#10B981; font-weight:600;">✓ Nivel de vibración balanceado</span>';
        }
    }

    // 3. Badges
    const badgeConn = document.getElementById("esp32-connection-badge");
    if (badgeConn) {
        badgeConn.className = "badge badge-live";
        badgeConn.innerText = "ESP32 CONECTADO";
    }

    const lastSeen = document.getElementById("esp32-last-seen");
    if (lastSeen) {
        lastSeen.innerText = `Último paquete: ${new Date().toLocaleTimeString()}`;
    }

    agregarPuntoGraficoESP32(tempVal, vibTotal);
    agregarTramaTerminal(data);
}

function agregarPuntoGraficoESP32(temp, vib) {
    const hora = new Date().toLocaleTimeString();

    if (chartEsp32Temp) {
        if (chartEsp32Temp.data.labels.length > 20) {
            chartEsp32Temp.data.labels.shift();
            chartEsp32Temp.data.datasets[0].data.shift();
        }
        chartEsp32Temp.data.labels.push(hora);
        chartEsp32Temp.data.datasets[0].data.push(temp);
        chartEsp32Temp.update();
    }

    if (chartEsp32Vib) {
        if (chartEsp32Vib.data.labels.length > 20) {
            chartEsp32Vib.data.labels.shift();
            chartEsp32Vib.data.datasets[0].data.shift();
        }
        chartEsp32Vib.data.labels.push(hora);
        chartEsp32Vib.data.datasets[0].data.push(vib);
        chartEsp32Vib.update();
    }
}

function agregarTramaTerminal(data) {
    const terminal = document.getElementById("esp32-terminal-body");
    if (!terminal) return;

    const row = document.createElement("div");
    row.className = "terminal-row";
    const ts = new Date().toLocaleTimeString();
    row.innerHTML = `<span class="terminal-ts">[${ts}]</span> <span class="terminal-json">${JSON.stringify(data)}</span>`;
    terminal.prepend(row);

    while (terminal.children.length > 30) {
        terminal.removeChild(terminal.lastChild);
    }
}

function toggleSimularESP32() {
    const btn = document.getElementById("btn-simular-esp32");
    if (esp32Simulando) {
        clearInterval(esp32SimuladoInterval);
        esp32SimuladoInterval = null;
        esp32Simulando = false;
        if (btn) btn.innerText = "▶ Iniciar Simulación ESP32";
        const badgeConn = document.getElementById("esp32-connection-badge");
        if (badgeConn) {
            badgeConn.className = "badge badge-offline";
            badgeConn.innerText = "ESP32 EN ESPERA";
        }
    } else {
        esp32Simulando = true;
        if (btn) btn.innerText = "⏹ Detener Simulación";
        let tempSim = 84.0;
        esp32SimuladoInterval = setInterval(() => {
            tempSim += (Math.random() - 0.48) * 0.4;
            tempSim = Math.max(70, Math.min(108, tempSim));

            const ax = (Math.random() * 0.16 - 0.08);
            const ay = (Math.random() * 0.16 - 0.08);
            const az = (0.98 + (Math.random() * 0.25 - 0.08));
            const vibTotal = Math.sqrt(ax*ax + ay*ay + az*az);

            const trama = {
                dispositivo: "ESP32_YCZ110",
                moto: "Yamaha YCZ 110",
                temperatura: parseFloat(tempSim.toFixed(1)),
                ax: parseFloat(ax.toFixed(2)),
                ay: parseFloat(ay.toFixed(2)),
                az: parseFloat(az.toFixed(2)),
                vibracion_total: parseFloat(vibTotal.toFixed(2)),
                rssi: -58,
                uptime_s: Math.floor(Date.now() / 1000)
            };

            actualizarVistaESP32(trama);
        }, 1500);
    }
}

// =========================================================================
// TELEMETRÍA SIMULADA CON FÍSICA REALISTA (YAMAHA YCZ 110, 110cc 4T)
// Inercia térmica suave, oscilación armónica y ciclos de conducción reales
// =========================================================================
function iniciarMedicionSimulada() {
    if (intervaloSimulacion) return;

    const btnIniciar = document.getElementById("btn-iniciar");
    const btnDetener = document.getElementById("btn-detener");
    if (btnIniciar) btnIniciar.disabled = true;
    if (btnDetener) btnDetener.disabled = false;

    const estadoLbl = document.getElementById("estado-medicion-lbl");
    if (estadoLbl) {
        estadoLbl.innerHTML = '<span style="color:#10B981; font-weight:600;">🟢 Estado: Medición activa en tiempo real.</span>';
    }

    lecturasTemporalesTemp = [];
    lecturasTemporalesVib = [];

    // Iniciar física de simulación
    estadoFisicaMotor.ticksEnFase = 0;
    let tiempoTick = 0;

    intervaloSimulacion = setInterval(() => {
        tiempoTick++;
        estadoFisicaMotor.ticksEnFase++;

        // Simular fases de conducción reales:
        // Fase 0: Ralentí (1400 RPM) -> Fase 1: Aceleración progresiva -> Fase 2: Velocidad de crucero 50 km/h -> Fase 3: Detención en semáforo
        let deltaTemp = 0;
        let vibObjetivo = 0.85;

        if (estadoFisicaMotor.faseConduccion === 0) {
            // Ralentí en reposo
            deltaTemp = (Math.random() - 0.48) * 0.15; // Oscilación sutil de temperatura
            vibObjetivo = 0.82 + Math.sin(tiempoTick * 0.8) * 0.08 + (Math.random() * 0.06);

            if (estadoFisicaMotor.ticksEnFase > 8) {
                estadoFisicaMotor.faseConduccion = 1; // Pasa a acelerar
                estadoFisicaMotor.ticksEnFase = 0;
            }
        } else if (estadoFisicaMotor.faseConduccion === 1) {
            // Aceleración y subida de marchas (3000 - 4500 RPM)
            deltaTemp = 0.25 + (Math.random() * 0.2); // Sube de temperatura progresivamente
            vibObjetivo = 1.35 + (Math.random() * 0.25);

            if (estadoFisicaMotor.ticksEnFase > 12) {
                estadoFisicaMotor.faseConduccion = 2; // Pasa a crucero
                estadoFisicaMotor.ticksEnFase = 0;
            }
        } else if (estadoFisicaMotor.faseConduccion === 2) {
            // Crucero estable a 50 km/h (el flujo de aire enfría la culata)
            // Se mantiene entre 89°C y 93°C de forma muy estable
            if (estadoFisicaMotor.tempCulata > 92.5) {
                deltaTemp = -0.15 + (Math.random() * 0.1); // Enfriamiento por aire
            } else {
                deltaTemp = 0.05 + (Math.random() * 0.1);
            }
            vibObjetivo = 1.15 + (Math.random() * 0.12);

            if (estadoFisicaMotor.ticksEnFase > 15) {
                estadoFisicaMotor.faseConduccion = 3; // Pasa a semáforo
                estadoFisicaMotor.ticksEnFase = 0;
            }
        } else if (estadoFisicaMotor.faseConduccion === 3) {
            // Detención momentánea (sin viento, sube calor residual hasta 96°C)
            deltaTemp = 0.12 + (Math.random() * 0.1);
            vibObjetivo = 0.84 + Math.sin(tiempoTick * 0.8) * 0.06;

            if (estadoFisicaMotor.ticksEnFase > 8) {
                estadoFisicaMotor.faseConduccion = 0; // Vuelve a ciclo inicial
                estadoFisicaMotor.ticksEnFase = 0;
            }
        }

        // Aplicar inercia térmica suave
        estadoFisicaMotor.tempCulata += deltaTemp;
        estadoFisicaMotor.tempCulata = Math.max(76.0, Math.min(104.5, estadoFisicaMotor.tempCulata));

        // Aplicar filtrado suave a la vibración
        estadoFisicaMotor.vibracionG = (estadoFisicaMotor.vibracionG * 0.6) + (vibObjetivo * 0.4);

        const tempFinal = parseFloat(estadoFisicaMotor.tempCulata.toFixed(1));
        const vibFinal = parseFloat(estadoFisicaMotor.vibracionG.toFixed(2));
        const hora = new Date().toLocaleTimeString();

        lecturasTemporalesTemp.push(tempFinal);
        lecturasTemporalesVib.push(vibFinal);

        // Actualizar valores en vista de Telemetría en Vivo
        const tempElem = document.getElementById("live-temp");
        const vibElem = document.getElementById("live-vib");
        if (tempElem) tempElem.innerText = `${tempFinal} °C`;
        if (vibElem) vibElem.innerText = `${vibFinal} g`;

        // Actualizar en el Panel General
        const generalTemp = document.getElementById("val-temp-media");
        const generalVib = document.getElementById("val-vibracion");
        const generalEstado = document.getElementById("val-estado-global");
        if (generalTemp) generalTemp.innerText = `${tempFinal} °C`;
        if (generalVib) generalVib.innerText = `${vibFinal} g`;
        if (generalEstado) {
            if (tempFinal > 105) {
                generalEstado.innerText = "Temperatura Elevada";
                generalEstado.style.color = "#F59E0B";
            } else {
                generalEstado.innerText = "Operación Normal";
                generalEstado.style.color = "#10B981";
            }
        }

        // Actualizar gráficos en tiempo real con curvas continuas
        if (chartGeneral) {
            if (chartGeneral.data.labels.length > 15) {
                chartGeneral.data.labels.shift();
                chartGeneral.data.datasets[0].data.shift();
                chartGeneral.data.datasets[1].data.shift();
            }
            chartGeneral.data.labels.push(hora);
            chartGeneral.data.datasets[0].data.push(tempFinal);
            chartGeneral.data.datasets[1].data.push(vibFinal);
            chartGeneral.update();
        }

        if (chartTemp) {
            if (chartTemp.data.labels.length > 15) {
                chartTemp.data.labels.shift();
                chartTemp.data.datasets[0].data.shift();
            }
            chartTemp.data.labels.push(hora);
            chartTemp.data.datasets[0].data.push(tempFinal);
            chartTemp.update();
        }

        if (chartMpu) {
            if (chartMpu.data.labels.length > 15) {
                chartMpu.data.labels.shift();
                chartMpu.data.datasets[0].data.shift();
            }
            chartMpu.data.labels.push(hora);
            chartMpu.data.datasets[0].data.push(vibFinal);
            chartMpu.update();
        }
    }, 1200);
}

function detenerMedicion() {
    detenerMedicionSimulada();
}

function detenerMedicionSimulada() {
    if (!intervaloSimulacion) return;

    clearInterval(intervaloSimulacion);
    intervaloSimulacion = null;

    const btnIniciar = document.getElementById("btn-iniciar");
    const btnDetener = document.getElementById("btn-detener");
    if (btnIniciar) btnIniciar.disabled = false;
    if (btnDetener) btnDetener.disabled = true;

    const estadoLbl = document.getElementById("estado-medicion-lbl");
    if (estadoLbl) {
        estadoLbl.innerHTML = '<span style="color:#64748B;">⚪ Estado: Sensores en reposo (Inactivos).</span>';
    }

    if (lecturasTemporalesTemp.length > 0) {
        const promTemp = (lecturasTemporalesTemp.reduce((a, b) => a + b, 0) / lecturasTemporalesTemp.length).toFixed(1);
        const promVib = (lecturasTemporalesVib.reduce((a, b) => a + b, 0) / lecturasTemporalesVib.length).toFixed(2);

        // Guardar automáticamente en el Historial de Fallas
        let severidad = "Normal";
        let descripcion = `Medición completada: Temp Media ${promTemp}°C | Vibración Media ${promVib}g (Régimen estable)`;

        if (promTemp > 105) {
            severidad = "Advertencia";
            descripcion = `Alerta térmica: Temp promedio ${promTemp}°C superior a lo habitual en tráfico lento`;
        } else if (promVib > 1.8) {
            severidad = "Advertencia";
            descripcion = `Nivel de vibración ${promVib}g elevado durante aceleración brusca`;
        }

        agregarEntradaHistorial("Telemetría en Vivo", descripcion, severidad, "Completado");
    }
}

// =========================================================================
// INICIALIZACIÓN DE GRÁFICOS CHART.JS
// =========================================================================
function inicializarGraficosVisuales() {
    const ctxGen = document.getElementById("chart-general") || document.getElementById("graficoEvolucionGeneral");
    if (ctxGen && typeof Chart !== "undefined") {
        chartGeneral = new Chart(ctxGen, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Temperatura (°C)',
                        borderColor: '#2563EB',
                        backgroundColor: 'rgba(37, 99, 235, 0.1)',
                        data: [],
                        yAxisID: 'y',
                        tension: 0.35
                    },
                    {
                        label: 'Vibración (g)',
                        borderColor: '#10B981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        data: [],
                        yAxisID: 'y1',
                        tension: 0.35
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { type: 'linear', position: 'left', min: 40, max: 130, title: { display: true, text: '°C' } },
                    y1: { type: 'linear', position: 'right', min: 0, max: 3, grid: { drawOnChartArea: false }, title: { display: true, text: 'g' } }
                }
            }
        });
    }

    const ctxTemp = document.getElementById("chart-temp");
    if (ctxTemp && typeof Chart !== "undefined") {
        chartTemp = new Chart(ctxTemp, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{ label: 'Temp (°C)', borderColor: '#2563EB', data: [], tension: 0.35 }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    const ctxMpu = document.getElementById("chart-mpu");
    if (ctxMpu && typeof Chart !== "undefined") {
        chartMpu = new Chart(ctxMpu, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{ label: 'Vibración (g)', borderColor: '#10B981', data: [], tension: 0.35 }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
}

function inicializarGraficosESP32() {
    const ctxEspTemp = document.getElementById("chart-esp32-temp");
    if (ctxEspTemp && typeof Chart !== "undefined") {
        chartEsp32Temp = new Chart(ctxEspTemp, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'DS18B20 Culata (°C)',
                    borderColor: '#2563EB',
                    backgroundColor: 'rgba(37, 99, 235, 0.15)',
                    fill: true,
                    tension: 0.3,
                    data: []
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { min: 20, max: 130, title: { display: true, text: 'Temperatura (°C)' } }
                }
            }
        });
    }

    const ctxEspVib = document.getElementById("chart-esp32-vib");
    if (ctxEspVib && typeof Chart !== "undefined") {
        chartEsp32Vib = new Chart(ctxEspVib, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'MPU6050 Magnitud (g)',
                    borderColor: '#10B981',
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    fill: true,
                    tension: 0.3,
                    data: []
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { min: 0, max: 4, title: { display: true, text: 'Vibración (g)' } }
                }
            }
        });
    }
}

// =========================================================================
// ASISTENTE DE DIAGNÓSTICO IA (FORMATEO DE MARKDOWN LIMPIO SIN ASTERISCOS)
// =========================================================================
function formatearRespuestaMarkdown(texto) {
    if (!texto) return "";

    // 1. Sanitizar entidades HTML
    let html = texto
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // 2. Encabezados ### o ##
    html = html.replace(/^###\s*(.*$)/gim, '<div style="margin:10px 0 4px 0; color:#1E3A8A; font-weight:700; font-size:13.5px;">$1</div>');
    html = html.replace(/^##\s*(.*$)/gim, '<div style="margin:12px 0 6px 0; color:#0F172A; font-weight:700; font-size:14px;">$1</div>');

    // 3. Negritas: **texto** o __texto__ -> <strong>texto</strong>
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');

    // 4. Cursivas: *texto* -> <em>texto</em>
    html = html.replace(/(^|[^\*])\*(?!\*)(.*?)\*(?!\*)/g, '$1<em>$2</em>');

    // 5. Viñetas de lista: * item o - item -> viñeta limpia
    html = html.replace(/^[\*\-]\s+(.*)$/gim, '<div style="margin:3px 0 3px 8px; display:flex; gap:6px;"><span>•</span><span>$1</span></div>');

    // 6. Listas numeradas: 1. item -> item ordenado
    html = html.replace(/^(\d+)\.\s+(.*)$/gim, '<div style="margin:3px 0 3px 8px; display:flex; gap:6px;"><strong>$1.</strong><span>$2</span></div>');

    // 7. Saltos de línea y párrafos limpios
    html = html.replace(/\n\n/g, '<div style="height:8px;"></div>');
    html = html.replace(/\n/g, '<br>');

    return html;
}

function handleChatEnter(event) {
    if (event.key === "Enter") {
        enviarMensajeIA();
    }
}

async function enviarMensajeIA() {
    const input = document.getElementById("chat-input-field") || document.getElementById("chat-input");
    const container = document.getElementById("chat-messages-container") || document.getElementById("chat-messages");
    if (!input || !container) return;

    const mensaje = input.value.trim();
    if (!mensaje) return;

    let userDiv = document.createElement("div");
    userDiv.className = "message user";
    userDiv.innerText = mensaje;
    container.appendChild(userDiv);
    input.value = "";
    container.scrollTop = container.scrollHeight;

    let loadingDiv = document.createElement("div");
    loadingDiv.className = "message bot";
    loadingDiv.id = "loading-bot";
    loadingDiv.innerText = "MotoDiag IA está analizando los parámetros...";
    container.appendChild(loadingDiv);
    container.scrollTop = container.scrollHeight;

    let motoData = {
        marca: "Yamaha",
        modelo: "YCZ",
        cilindraje: "110cc",
        anio: "2024"
    };
    const savedMoto = localStorage.getItem("motoDiag_moto_data");
    if (savedMoto) {
        try { motoData = Object.assign(motoData, JSON.parse(savedMoto)); } catch(e){}
    }

    let respuestaTexto = null;
    let ultimoError = null;

    try {
        const respBackend = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: mensaje,
                motoData: motoData,
                telemetriaESP32: esp32UltimaTrama || null
            })
        });

        if (respBackend.ok) {
            const dataBackend = await respBackend.json();
            if (dataBackend.reply) {
                respuestaTexto = dataBackend.reply;
            }
        } else {
            const errData = await respBackend.json().catch(() => ({}));
            ultimoError = errData.error || `HTTP ${respBackend.status}`;
        }
    } catch (err) {
        ultimoError = err.message;
    }

    if (document.getElementById("loading-bot")) {
        document.getElementById("loading-bot").remove();
    }

    let botDiv = document.createElement("div");
    botDiv.className = "message bot";

    if (respuestaTexto) {
        botDiv.innerHTML = formatearRespuestaMarkdown(respuestaTexto);
    } else {
        botDiv.innerHTML = `<div style="color:#DC2626;">⚠️ No fue posible consultar al asistente. ${ultimoError ? '(' + ultimoError + ')' : ''}</div><div style="font-size:11px; margin-top:4px; color:#64748B;">Si estás en Vercel, asegúrate de configurar la variable de entorno GEMINI_API_KEY en Project Settings > Environment Variables.</div>`;
    }

    container.appendChild(botDiv);
    container.scrollTop = container.scrollHeight;
}
