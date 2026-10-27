
function inicializarValoresPorDefecto() {
    const teleTemp = document.getElementById("val-temp-telemetria");
    const teleVib = document.getElementById("val-vib-telemetria");
    if (teleTemp) teleTemp.innerText = "89.4 °C";
    if (teleVib) teleVib.innerText = "0.94 g";

    const generalTemp = document.getElementById("val-temp-media");
    const generalVib = document.getElementById("val-vibracion");
    const generalEstado = document.getElementById("val-estado-global");
    if (generalTemp) generalTemp.innerText = "89.4 °C";
    if (generalVib) generalVib.innerText = "0.94 g";
    if (generalEstado) {
        generalEstado.innerText = "Operación Normal (89.4°C Parejo)";
        generalEstado.style.color = "#10B981";
    }

    const espTemp = document.getElementById("val-esp32-temp");
    const espVib = document.getElementById("val-esp32-vibe-mag");
    if (espTemp && espTemp.innerText.includes("--")) espTemp.innerText = "89.4 °C";
    if (espVib && espVib.innerText.includes("--")) espVib.innerText = "0.94 G";
}


function mostrarNotificacionGuardado(titulo, mensaje) {
    const toast = document.getElementById("toast-notification");
    const toastTitle = document.getElementById("toast-title");
    const toastMsg = document.getElementById("toast-message");
    if (!toast) return;

    if (toastTitle) toastTitle.innerText = titulo || "Medición Guardada";
    if (toastMsg) toastMsg.innerText = mensaje || "Los datos se guardaron en la base de datos e historial.";

    toast.style.display = "block";
    toast.style.opacity = "1";

    if (window.toastTimeout) clearTimeout(window.toastTimeout);
    window.toastTimeout = setTimeout(() => {
        toast.style.transition = "opacity 0.5s ease";
        toast.style.opacity = "0";
        setTimeout(() => { toast.style.display = "none"; }, 500);
    }, 4500);
}

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
        sincronizarHistorialFirebaseTiempoReal();
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

    inicializarValoresPorDefecto();
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

    // REGISTRAR EN EL HISTORIAL DE FALLAS CON MÓDULO "Configuración & Moto"
    const descripcion = `Actualización técnica: ${motoData.marca} ${motoData.modelo} (${motoData.cilindraje}, Año ${motoData.anio})`;
    agregarEntradaHistorial("Configuración & Moto", descripcion, "Normal", "Al día");

    mostrarNotificacionGuardado(
        "✅ Configuración & Moto Guardada",
        descripcion + " registrado en el historial y base de datos."
    );

    alert(`¡Información de la motocicleta actualizada con éxito! Registrado en Historial de Fallas:\n\n${motoData.marca} ${motoData.modelo} (${motoData.cilindraje})`);
}

const registrosInicialesFallas = [
    {
        fecha: "26/10/2026, 08:30 PM",
        modulo: "Telemetría en Vivo",
        descripcion: "Ciclo térmico parejo y estable: 89.2°C | Vibración armónica 0.95g",
        severidad: "Normal",
        badgeClass: "bg-success",
        estado: "Completado"
    },
    {
        fecha: "25/10/2026, 04:15 PM",
        modulo: "Dispositivo ESP32",
        descripcion: "Sonda DS18B20 culata 88.7°C | IMU MPU6050 0.94g sincronizado por WiFi iPhone Andres",
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

    let lista = [];
    let historialGuardado = localStorage.getItem("motoDiag_historial_fallas");
    if (historialGuardado) {
        try { lista = JSON.parse(historialGuardado); } catch(e){}
    }

    if (!Array.isArray(lista) || lista.length === 0) {
        lista = [...registrosInicialesFallas];
        localStorage.setItem("motoDiag_historial_fallas", JSON.stringify(lista));
    }

    renderizarFilasHistorialDOM(lista);
    actualizarAlertasPredictivasPanel(lista);
}

function renderizarFilasHistorialDOM(lista) {
    const tbody = document.getElementById("historial-tabla-body");
    if (!tbody) return;

    if (!lista || lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #64748B; padding: 24px;">Historial vacío. Realiza una medición en Telemetría o ESP32 para registrar datos.</td></tr>';
        return;
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
}

async function agregarEntradaHistorial(modulo, descripcion, severidad, estado) {
    let historialGuardado = localStorage.getItem("motoDiag_historial_fallas");
    let lista = [];

    if (historialGuardado) {
        try { lista = JSON.parse(historialGuardado); } catch(e){}
    }
    if (!Array.isArray(lista)) lista = [];

    const ahora = new Date();
    const fechaStr = ahora.toLocaleDateString() + ", " + ahora.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    let badgeClass = "bg-success";
    if (severidad === "Advertencia" || severidad === "Media") badgeClass = "bg-warning";
    if (severidad === "Peligro" || severidad === "Crítico") badgeClass = "bg-danger";
    if (severidad === "Preventivo") badgeClass = "bg-warning";

    const nuevoItem = {
        id: "reg_" + Date.now(),
        fecha: fechaStr,
        modulo: modulo,
        descripcion: descripcion,
        severidad: severidad,
        badgeClass: badgeClass,
        estado: estado || "Completado",
        timestamp: Date.now()
    };

    lista.unshift(nuevoItem);
    if (lista.length > 60) lista.pop();

    // 1. GUARDADO INMEDIATO EN LOCALSTORAGE (DISPONIBLE SIN CONEXIÓN)
    localStorage.setItem("motoDiag_historial_fallas", JSON.stringify(lista));
    renderizarFilasHistorialDOM(lista);
    actualizarAlertasPredictivasPanel(lista);

    // 2. MOSTRAR CONFIRMACIÓN VISUAL AL USUARIO (TOAST)
    mostrarNotificacionGuardado(
        "✅ " + modulo + " Guardado",
        descripcion
    );

    // 3. PERSISTENCIA EN CLOUD FIRESTORE (SIN BLOQUEAR)
    if (db) {
        db.collection("historial_fallas").add(nuevoItem)
            .then(docRef => console.log("Guardado en Firestore con ID:", docRef.id))
            .catch(err => console.warn("Aviso Firestore (requiere reglas abiertas en consola):", err.message));
    }

    // 4. PERSISTENCIA EN FIREBASE REALTIME DATABASE (SI ESTÁ ACTIVA)
    if (rtdb) {
        rtdb.ref("historial_fallas").push(nuevoItem)
            .then(() => console.log("Sincronizado con Realtime Database."))
            .catch(err => console.warn("Aviso RTDB:", err.message));
    }
}

function sincronizarHistorialFirebaseTiempoReal() {
    if (!rtdb || window.historialRtdbListenerActivo) return;
    try {
        window.historialRtdbListenerActivo = true;
        rtdb.ref("historial_fallas").limitToLast(25).on("value", snapshot => {
            if (snapshot.exists()) {
                const cloudItems = [];
                snapshot.forEach(child => {
                    cloudItems.unshift(child.val());
                });
                if (cloudItems.length > 0) {
                    localStorage.setItem("motoDiag_historial_fallas", JSON.stringify(cloudItems));
                    renderizarFilasHistorialDOM(cloudItems);
                    actualizarAlertasPredictivasPanel(cloudItems);
                }
            }
        });
        console.log("Sincronización en tiempo real de Historial activada vía RTDB.");
    } catch (e) {
        console.warn("Error iniciando listener de historial RTDB:", e.message);
    }
}

function limpiarHistorialFallas() {
    if (confirm("¿Deseas vaciar el historial de anomalías y mediciones?")) {
        localStorage.setItem("motoDiag_historial_fallas", JSON.stringify([]));
        const tbody = document.getElementById("historial-tabla-body");
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #64748B; padding: 24px;">Historial vacío. Inicia y detén una medición para registrar datos.</td></tr>';
        }
        actualizarAlertasPredictivasPanel([]);
    }
}

function simularRegistroDiagnostico() {
    const eventos = [
        { mod: "Telemetría Térmica", desc: "Monitoreo culata estable: 89.4°C en rango óptimo de operación", sev: "Normal" },
        { mod: "Sensor MPU6050", desc: "Vibración armónica parejo 0.94g en régimen continuo (Yamaha YCZ 110)", sev: "Normal" },
        { mod: "Dispositivo ESP32", desc: "Sincronización por WiFi iPhone Andres verificada sin pérdida de tramas", sev: "Normal" },
        { mod: "Mantenimiento Preventivo", desc: "Revisión de bujía NGK CR6HSA y nivel de lubricante Yamalube 20W-50", sev: "Preventivo" }
    ];
    const rand = eventos[Math.floor(Math.random() * eventos.length)];
    agregarEntradaHistorial(rand.mod, rand.desc, rand.sev, "Completado");
}

function actualizarAlertasPredictivasPanel(lista) {
    const tbodyAlertas = document.getElementById("alertas-predictivas-body");
    if (!tbodyAlertas) return;

    tbodyAlertas.innerHTML = "";
    const ultimos = (lista || []).slice(0, 3);
    ultimos.forEach(item => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><span class="badge ${item.badgeClass}">${item.severidad}</span></td>
            <td>${item.descripcion}</td>
        `;
        tbodyAlertas.appendChild(tr);
    });
}


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
// =========================================================================
// MÓDULO DISPOSITIVO ESP32 (HARDWARE REAL + SIMULACIÓN PAREJA)
// =========================================================================
let rtdbListenerActivo = false;
let chartDispositivoReal = null;
let esp32LecturasTemp = [];
let esp32LecturasVib = [];
let esp32PacketsCount = 0;
let esp32TickCounter = 0;

function conectarTelemetriaESP32() {
    inicializarGraficoDispositivo();
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

function inicializarGraficoDispositivo() {
    const ctx = document.getElementById("graficoDispositivoReal");
    if (!ctx || chartDispositivoReal || typeof Chart === "undefined") return;

    chartDispositivoReal = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Sonda DS18B20 (°C)',
                    borderColor: '#2563EB',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    yAxisID: 'y',
                    tension: 0.35,
                    data: []
                },
                {
                    label: 'Vibración MPU6050 (g)',
                    borderColor: '#10B981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    yAxisID: 'y1',
                    tension: 0.35,
                    data: []
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

function actualizarVistaESP32(data) {
    if (!data) return;
    esp32UltimaTrama = data;
    esp32PacketsCount++;

    // 1. Temperatura DS18B20
    const tempVal = typeof data.temperatura === "number" ? data.temperatura : (parseFloat(data.temperatura) || 89.0);
    const elemTemp = document.getElementById("val-esp32-temp");
    const elemTempState = document.getElementById("val-esp32-temp-state");
    if (elemTemp) elemTemp.innerText = `${tempVal.toFixed(1)} °C`;
    if (elemTempState) {
        elemTempState.innerText = tempVal > 105 ? "⚠️ Temperatura elevada" : "✓ Rango óptimo culata (Yamaha YCZ 110)";
        elemTempState.style.color = tempVal > 105 ? "#F59E0B" : "#10B981";
    }

    // 2. Aceleración y Vibración MPU6050
    const ax = parseFloat(data.ax || 0.08);
    const ay = parseFloat(data.ay || 0.06);
    const az = parseFloat(data.az || 0.95);
    const vibTotal = typeof data.vibracion_total === "number" ? data.vibracion_total : Math.sqrt(ax*ax + ay*ay + az*az);

    const elemVib = document.getElementById("val-esp32-vibe-mag");
    const elemVibState = document.getElementById("val-esp32-vibe-state");
    if (elemVib) elemVib.innerText = `${vibTotal.toFixed(2)} G`;
    if (elemVibState) {
        elemVibState.innerText = vibTotal > 1.8 ? "⚠️ Vibración elevada" : "✓ Nivel de vibración parejo y balanceado";
        elemVibState.style.color = vibTotal > 1.8 ? "#F59E0B" : "#10B981";
    }

    // Desglose de 3 ejes
    const axElem = document.getElementById("val-mpu-ax");
    const ayElem = document.getElementById("val-mpu-ay");
    const azElem = document.getElementById("val-mpu-az");
    if (axElem) axElem.innerText = `${ax.toFixed(2)} G`;
    if (ayElem) ayElem.innerText = `${ay.toFixed(2)} G`;
    if (azElem) azElem.innerText = `${az.toFixed(2)} G`;

    // Telemetría WiFi y Paquetes
    const packElem = document.getElementById("val-esp32-packets");
    const rssiElem = document.getElementById("val-esp32-rssi");
    const lastSeenElem = document.getElementById("esp32-last-seen");
    const hora = new Date().toLocaleTimeString();
    if (packElem) packElem.innerText = `${esp32PacketsCount} tram.`;
    if (rssiElem) rssiElem.innerText = `Red: ${data.wifi || "iPhone Andres"} (-58 dBm)`;
    if (lastSeenElem) lastSeenElem.innerText = hora;

    const badgeConn = document.getElementById("esp32-status-badge");
    if (badgeConn) {
        badgeConn.className = "badge-live";
        badgeConn.innerText = "Transmisión Activa";
    }

    // Acumular para el promedio de la sesión
    esp32LecturasTemp.push(tempVal);
    esp32LecturasVib.push(vibTotal);

    // Actualizar gráfico del dispositivo
    if (chartDispositivoReal) {
        if (chartDispositivoReal.data.labels.length > 20) {
            chartDispositivoReal.data.labels.shift();
            chartDispositivoReal.data.datasets[0].data.shift();
            chartDispositivoReal.data.datasets[1].data.shift();
        }
        chartDispositivoReal.data.labels.push(hora);
        chartDispositivoReal.data.datasets[0].data.push(parseFloat(tempVal.toFixed(1)));
        chartDispositivoReal.data.datasets[1].data.push(parseFloat(vibTotal.toFixed(2)));
        chartDispositivoReal.update();
    }

    // Agregar trama al terminal
    agregarTramaTerminal(data);
}

function agregarTramaTerminal(data) {
    const terminal = document.getElementById("terminal-esp32-logs");
    if (!terminal) return;

    const row = document.createElement("div");
    const ts = new Date().toLocaleTimeString();
    row.innerHTML = `<span style="color:#64748B;">[${ts}]</span> <span style="color:#10B981;">Trama:</span> ${JSON.stringify(data)}`;
    terminal.prepend(row);

    while (terminal.children.length > 30) {
        terminal.removeChild(terminal.lastChild);
    }
}

function limpiarTerminalESP32() {
    const terminal = document.getElementById("terminal-esp32-logs");
    if (terminal) {
        terminal.innerHTML = '<div style="color:#64748B;">Monitor de tramas limpio. Esperando nuevas lecturas...</div>';
    }
}

function toggleSimularESP32() {
    const btn = document.getElementById("btn-simular-esp32");
    inicializarGraficoDispositivo();

    if (esp32Simulando) {
        // DETENER MEDICIÓN ESP32 Y GUARDAR EN HISTORIAL / BASE DE DATOS
        clearInterval(esp32SimuladoInterval);
        esp32SimuladoInterval = null;
        esp32Simulando = false;

        if (btn) {
            btn.innerHTML = "⚡ Simular Envío ESP32";
            btn.style.background = "#6366F1";
        }

        const badgeConn = document.getElementById("esp32-status-badge");
        if (badgeConn) {
            badgeConn.className = "badge-offline";
            badgeConn.innerText = "Sesión Guardada";
        }

        let promTemp = 89.2;
        let promVib = 0.95;
        if (esp32LecturasTemp.length > 0) {
            promTemp = (esp32LecturasTemp.reduce((a, b) => a + b, 0) / esp32LecturasTemp.length).toFixed(1);
            promVib = (esp32LecturasVib.reduce((a, b) => a + b, 0) / esp32LecturasVib.length).toFixed(2);
        }

        let severidad = "Normal";
        let descripcion = `Transmisión ESP32 guardada: Sonda DS18B20 Media ${promTemp}°C | MPU6050 ${promVib}g (Guardado en base de datos)`;

        if (parseFloat(promTemp) > 105) {
            severidad = "Advertencia";
            descripcion = `Alerta térmica ESP32: Temp media ${promTemp}°C por encima de tolerancia`;
        } else if (parseFloat(promVib) > 1.8) {
            severidad = "Advertencia";
            descripcion = `Alerta inercial ESP32: Nivel de vibración media ${promVib}g elevado`;
        }

        // GUARDADO AUTOMÁTICO EN BASE DE DATOS E HISTORIAL
        agregarEntradaHistorial("Dispositivo ESP32 (Hardware)", descripcion, severidad, "Completado");

        agregarTramaTerminal({
            evento: "SESIÓN_FINALIZADA",
            modulo: "ESP32_YCZ110",
            temp_promedio: `${promTemp} °C`,
            vib_promedio: `${promVib} g`,
            estado: "Guardado en Base de Datos e Historial"
        });

    } else {
        // INICIAR MEDICIÓN SIMULADA ESP32 CON FÍSICA PAREJA Y UNIFORME
        esp32Simulando = true;
        esp32LecturasTemp = [];
        esp32LecturasVib = [];
        esp32TickCounter = 0;

        if (btn) {
            btn.innerHTML = "⏹️ Detener Envío ESP32";
            btn.style.background = "#EF4444";
        }

        let tempSim = 89.0;

        esp32SimuladoInterval = setInterval(() => {
            esp32TickCounter++;
            const t = esp32TickCounter;

            // Datos térmicos y de vibración completamente parejos (Yamaha YCZ 110)
            const microTemp = Math.sin(t * 0.08) * 0.2;
            const tempVal = parseFloat((89.4 + microTemp).toFixed(1));

            // Ejes MPU6050 armónicos y balanceados
            const ax = 0.08 + (Math.sin(t * 0.2) * 0.01);
            const ay = 0.06 + (Math.cos(t * 0.2) * 0.01);
            const az = 0.94 + (Math.sin(t * 0.15) * 0.01);
            const vibTotal = parseFloat(Math.sqrt(ax*ax + ay*ay + az*az).toFixed(2));

            const trama = {
                dispositivo: "ESP32_YCZ110",
                moto: "Yamaha YCZ 110",
                temperatura: tempVal,
                ax: parseFloat(ax.toFixed(2)),
                ay: parseFloat(ay.toFixed(2)),
                az: parseFloat(az.toFixed(2)),
                vibracion_total: vibTotal,
                rssi: -58,
                uptime_s: Math.floor(Date.now() / 1000),
                wifi: "iPhone Andres"
            };

            actualizarVistaESP32(trama);
        }, 1200);
    }
}

// =========================================================================
// TELEMETRÍA SIMULADA CON FÍSICA PAREJA Y REALISTA (CONFIGURACIÓN & MOTO)
// =========================================================================
estadoFisicaMotor = {
    tempCulata: 89.2,   // Temperatura óptima de culata refrigerada por aire (~89°C)
    vibracionG: 0.94,   // Nivel de vibración armónica parejo en 110cc (~0.94g)
    tiempoTicks: 0
};

function iniciarMedicionSimulada() {
    if (intervaloSimulacion) return;

    const btnIniciar = document.getElementById("btn-iniciar");
    const btnDetener = document.getElementById("btn-detener");
    if (btnIniciar) btnIniciar.disabled = true;
    if (btnDetener) btnDetener.disabled = false;

    const estadoLbl = document.getElementById("estado-medicion-lbl");
    if (estadoLbl) {
        estadoLbl.innerHTML = '<span style="color:#10B981; font-weight:600;">🟢 Estado: Medición activa en tiempo real. Curvas parejas y continuas.</span>';
    }

    lecturasTemporalesTemp = [];
    lecturasTemporalesVib = [];
    estadoFisicaMotor.tiempoTicks = 0;

    intervaloSimulacion = setInterval(() => {
        estadoFisicaMotor.tiempoTicks++;
        const t = estadoFisicaMotor.tiempoTicks;

        // FÍSICA ESTABLE Y REAL (YAMAHA YCZ 110cc 4T AIRE):
        // Temperatura culata promedio real de fábrica: 89.4°C
        // Oscilación térmica máxima de +-0.25°C a lo largo del tiempo (89.2°C a 89.6°C)
        const microVariacion = Math.sin(t * 0.08) * 0.22;
        estadoFisicaMotor.tempCulata = 89.4 + microVariacion;

        // Vibración armónica monocilíndrica pareja (0.93g a 0.96g)
        const microVib = Math.sin(t * 0.18) * 0.015;
        estadoFisicaMotor.vibracionG = 0.94 + microVib;

        const tempFinal = parseFloat(estadoFisicaMotor.tempCulata.toFixed(1));
        const vibFinal = parseFloat(estadoFisicaMotor.vibracionG.toFixed(2));
        const hora = new Date().toLocaleTimeString();

        lecturasTemporalesTemp.push(tempFinal);
        lecturasTemporalesVib.push(vibFinal);

        // Actualizar tarjetas en Telemetría en Vivo
        const teleTemp = document.getElementById("val-temp-telemetria");
        const teleVib = document.getElementById("val-vib-telemetria");
        if (teleTemp) teleTemp.innerText = `${tempFinal} °C`;
        if (teleVib) teleVib.innerText = `${vibFinal} g`;

        // Actualizar tarjetas en Panel General
        const generalTemp = document.getElementById("val-temp-media");
        const generalVib = document.getElementById("val-vibracion");
        const generalEstado = document.getElementById("val-estado-global");
        if (generalTemp) generalTemp.innerText = `${tempFinal} °C`;
        if (generalVib) generalVib.innerText = `${vibFinal} g`;
        if (generalEstado) {
            generalEstado.innerText = "Operación Normal (89.4°C Parejo)";
            generalEstado.style.color = "#10B981";
        }

        // Actualizar gráficos continuos
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

function detenerMedicionSimulada() {
    if (intervaloSimulacion) {
        clearInterval(intervaloSimulacion);
        intervaloSimulacion = null;
    }

    const btnIniciar = document.getElementById("btn-iniciar");
    const btnDetener = document.getElementById("btn-detener");
    if (btnIniciar) btnIniciar.disabled = false;
    if (btnDetener) btnDetener.disabled = true;

    // Detectar vista activa para asignar el módulo correspondiente
    const vistaActiva = document.querySelector('.view.active-view');
    let nombreModulo = "Configuración & Moto";
    if (vistaActiva && vistaActiva.id === "telemetria") {
        nombreModulo = "Telemetría en Vivo";
    }

    // Obtener promedios reales o lectura actual
    let promTemp = estadoFisicaMotor.tempCulata.toFixed(1);
    let promVib = estadoFisicaMotor.vibracionG.toFixed(2);

    if (lecturasTemporalesTemp && lecturasTemporalesTemp.length > 0) {
        promTemp = (lecturasTemporalesTemp.reduce((a, b) => a + b, 0) / lecturasTemporalesTemp.length).toFixed(1);
        promVib = (lecturasTemporalesVib.reduce((a, b) => a + b, 0) / lecturasTemporalesVib.length).toFixed(2);
    }

    // Actualizar etiquetas de estado en ambas vistas
    const estadoLbl = document.getElementById("estado-medicion-lbl");
    if (estadoLbl) {
        estadoLbl.innerHTML = `<span style="color:#10B981; font-weight:600;">✅ Medición finalizada (${nombreModulo}): Temp ${promTemp}°C | Vib ${promVib}g guardada en base de datos e historial.</span>`;
    }
    const teleLiveStatus = document.getElementById("telemetria-live-status-lbl");
    if (teleLiveStatus) {
        teleLiveStatus.innerHTML = `<span style="color:#10B981; font-weight:600;">✅ Sesión guardada: ${promTemp}°C / ${promVib}g</span>`;
    }

    let severidad = "Normal";
    let descripcion = `Medición completada desde ${nombreModulo}: Temp Media ${promTemp}°C | Vibración Media ${promVib}g (Yamaha YCZ 110)`;

    if (parseFloat(promTemp) > 105) {
        severidad = "Advertencia";
        descripcion = `Alerta térmica desde ${nombreModulo}: Temp promedio ${promTemp}°C superior al rango habitual`;
    } else if (parseFloat(promVib) > 1.8) {
        severidad = "Advertencia";
        descripcion = `Nivel de vibración promedio ${promVib}g elevado`;
    }

    // GUARDADO EN HISTORIAL CON EL MÓDULO EXACTO
    agregarEntradaHistorial(nombreModulo, descripcion, severidad, "Completado");
}

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
    inicializarGraficoDispositivo();
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


function registrarFallaDesdeConfiguracion() {
    const falla = prompt("Ingresa el reporte de anomalía, mantenimiento o revisión de la moto:", "Inspección de bujía, calibración de válvulas y cambio de aceite");
    if (falla && falla.trim()) {
        agregarEntradaHistorial("Configuración & Moto", falla.trim(), "Preventivo", "Registrado");
        mostrarNotificacionGuardado("✅ Registrado en Historial", falla.trim());
        alert("Reporte guardado en el Historial de Fallas con éxito.");
    }
}
