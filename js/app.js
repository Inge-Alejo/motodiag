// =========================================================================
// MOTODIAG IA - MOTOR DE TELEMETRÍA & GESTIÓN DE MOTOCICLETA
// Yamaha YCZ 110 - Sistema de Diagnóstico Inteligente
// =========================================================================

// Íconos SVG para mostrar / ocultar contraseña
const ICON_EYE_OPEN = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
const ICON_EYE_CLOSED = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

// Variables de estado de simulación
let intervaloSimulacion = null;
let historialSesion = [];
let lecturasTemporalesTemp = [];
let lecturasTemporalesVib = [];

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
// AUTENTICACIÓN (LOGIN & REGISTRO DIRECTOS SIN APROBACIÓN)
// =========================================================================

/**
 * Iniciar Sesión con Correo / Usuario y Contraseña
 */
async function iniciarSesion() {
    const usuarioOCorreo = document.getElementById("login-user").value.trim();
    const contrasena = document.getElementById("login-pass").value.trim();

    if (!usuarioOCorreo || !contrasena) {
        alert("Por favor completa tu usuario o correo y tu contraseña.");
        return;
    }

    // 1. Intentar con Firebase Authentication
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

    // 2. Fallback de usuarios registrados localmente
    const usuariosRegistrados = JSON.parse(localStorage.getItem("motoDiag_registered_users")) || {};
    if (usuariosRegistrados[usuarioOCorreo] && usuariosRegistrados[usuarioOCorreo].password === contrasena) {
        cargarPerfilUsuario(usuarioOCorreo);
    } else if (usuarioOCorreo === "admin" && contrasena === "1234") {
        cargarPerfilUsuario("admin");
    } else {
        alert("Credenciales incorrectas. Verifica tu usuario y contraseña.");
    }
}

/**
 * Registrar Usuario Directamente (Acceso Inmediato)
 */
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

    // Si Firebase está activo
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

    // Registro local
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
}

// =========================================================================
// MÓDULO: CONFIGURACIÓN & MOTO (100% FUNCIONAL Y CONECTADO)
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

    // Actualizar campos en el panel de Configuración & Moto
    const inputsMarca = [document.getElementById("cfg-moto-marca"), document.getElementById("moto-marca")];
    const inputsModelo = [document.getElementById("cfg-moto-modelo"), document.getElementById("moto-modelo")];
    const inputsCil = [document.getElementById("cfg-moto-cilindraje"), document.getElementById("moto-cilindraje")];
    const inputsAnio = [document.getElementById("cfg-moto-anio"), document.getElementById("moto-anio")];

    inputsMarca.forEach(el => { if (el) el.value = motoData.marca || "Yamaha"; });
    inputsModelo.forEach(el => { if (el) el.value = motoData.modelo || "YCZ"; });
    inputsCil.forEach(el => { if (el) el.value = motoData.cilindraje || "110cc"; });
    inputsAnio.forEach(el => { if (el) el.value = motoData.anio || "2024"; });

    // Actualizar badges e indicadores de la moto en el dashboard
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

    // Si Firebase está activo, sincronizar en Firestore
    if (db && usuarioActualAuth) {
        db.collection("users").doc(usuarioActualAuth.uid).set({ moto: motoData }, { merge: true }).catch(() => {});
    }

    alert("¡Información de la motocicleta actualizada con éxito!\n\n" + motoData.marca + " " + motoData.modelo + " (" + motoData.cilindraje + ")");
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
}

function toggleChat() {
    const chatWidget = document.getElementById('chatWidget');
    if (chatWidget) {
        chatWidget.style.display = (chatWidget.style.display === 'flex') ? 'none' : 'flex';
    }
}

// =========================================================================
// MÓDULO DISPOSITIVO ESP32 (DS18B20 + MPU6050 + FIREBASE RTDB)
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
        let tempSim = 82.5;
        esp32SimuladoInterval = setInterval(() => {
            tempSim += (Math.random() - 0.48) * 0.8;
            tempSim = Math.max(25, Math.min(125, tempSim));

            const ax = (Math.random() * 0.2 - 0.1);
            const ay = (Math.random() * 0.2 - 0.1);
            const az = (0.98 + (Math.random() * 0.35 - 0.1));
            const vibTotal = Math.sqrt(ax*ax + ay*ay + az*az);

            const trama = {
                dispositivo: "ESP32_YCZ110",
                moto: "Yamaha YCZ 110",
                temperatura: parseFloat(tempSim.toFixed(1)),
                ax: parseFloat(ax.toFixed(2)),
                ay: parseFloat(ay.toFixed(2)),
                az: parseFloat(az.toFixed(2)),
                vibracion_total: parseFloat(vibTotal.toFixed(2)),
                rssi: -55,
                uptime_s: Math.floor(Date.now() / 1000)
            };

            actualizarVistaESP32(trama);
        }, 1500);
    }
}

// =========================================================================
// MÓDULO EXISTENTE: TELEMETRÍA SIMULADA & CONTROL DE MEDICIÓN
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

    intervaloSimulacion = setInterval(() => {
        const temp = parseFloat((75 + Math.random() * 25).toFixed(1));
        const vib = parseFloat((0.8 + Math.random() * 1.5).toFixed(2));
        const hora = new Date().toLocaleTimeString();

        lecturasTemporalesTemp.push(temp);
        lecturasTemporalesVib.push(vib);

        const tempElem = document.getElementById("live-temp");
        const vibElem = document.getElementById("live-vib");
        if (tempElem) tempElem.innerText = `${temp} °C`;
        if (vibElem) vibElem.innerText = `${vib} g`;

        // Actualizar en panel general
        const generalTemp = document.getElementById("val-temp-media");
        const generalVib = document.getElementById("val-vibracion");
        const generalEstado = document.getElementById("val-estado-global");
        if (generalTemp) generalTemp.innerText = `${temp} °C`;
        if (generalVib) generalVib.innerText = `${vib} g`;
        if (generalEstado) {
            generalEstado.innerText = (temp > 105) ? "Temperatura Alta" : "Operación Normal";
            generalEstado.style.color = (temp > 105) ? "#F59E0B" : "#10B981";
        }

        if (chartGeneral) {
            if (chartGeneral.data.labels.length > 15) {
                chartGeneral.data.labels.shift();
                chartGeneral.data.datasets[0].data.shift();
                chartGeneral.data.datasets[1].data.shift();
            }
            chartGeneral.data.labels.push(hora);
            chartGeneral.data.datasets[0].data.push(temp);
            chartGeneral.data.datasets[1].data.push(vib);
            chartGeneral.update();
        }

        if (chartTemp) {
            if (chartTemp.data.labels.length > 15) {
                chartTemp.data.labels.shift();
                chartTemp.data.datasets[0].data.shift();
            }
            chartTemp.data.labels.push(hora);
            chartTemp.data.datasets[0].data.push(temp);
            chartTemp.update();
        }

        if (chartMpu) {
            if (chartMpu.data.labels.length > 15) {
                chartMpu.data.labels.shift();
                chartMpu.data.datasets[0].data.shift();
            }
            chartMpu.data.labels.push(hora);
            chartMpu.data.datasets[0].data.push(vib);
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
        const fecha = new Date().toLocaleString();

        historialSesion.push({ fecha, promTemp, promVib });
        actualizarTablaHistorial();
    }
}

function actualizarTablaHistorial() {
    const tbody = document.querySelector("#tabla-historial tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    historialSesion.slice().reverse().forEach(item => {
        const fila = document.createElement("tr");
        fila.innerHTML = `
            <td>${item.fecha}</td>
            <td>${item.promTemp} °C</td>
            <td>${item.promVib} g</td>
            <td><span style="color:#10B981; font-weight:600;">Completado</span></td>
        `;
        tbody.appendChild(fila);
    });
}

function limpiarHistorial() {
    historialSesion = [];
    actualizarTablaHistorial();
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
                        yAxisID: 'y'
                    },
                    {
                        label: 'Vibración (g)',
                        borderColor: '#10B981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        data: [],
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { type: 'linear', position: 'left', title: { display: true, text: '°C' } },
                    y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'g' } }
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
                datasets: [{ label: 'Temp (°C)', borderColor: '#2563EB', data: [] }]
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
                datasets: [{ label: 'Vibración (g)', borderColor: '#10B981', data: [] }]
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
// ASISTENTE DE DIAGNÓSTICO IA CON GEMINI
// =========================================================================
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
        botDiv.innerText = respuestaTexto;
    } else {
        botDiv.innerText = `⚠️ No fue posible consultar al asistente. ${ultimoError ? '(' + ultimoError + ')' : ''}\n\nSi estás en Vercel, asegúrate de configurar la variable de entorno GEMINI_API_KEY en los ajustes del proyecto.`;
    }

    container.appendChild(botDiv);
    container.scrollTop = container.scrollHeight;
}
