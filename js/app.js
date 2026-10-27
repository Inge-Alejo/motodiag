// =========================================================================
// MOTODIAG IA - MOTOR DE TELEMETRÍA, FIREBASE AUTH & DISPOSITIVO ESP32
// Yamaha YCZ 110 - Sistema de Diagnóstico Inteligente
// =========================================================================

// Íconos SVG para toggles de contraseñas
const ICON_EYE_OPEN = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
const ICON_EYE_CLOSED = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

// Variables de estado de simulación existente
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
let unsubscribeUserStatus = null;

// =========================================================================
// CONFIGURACIÓN DE FIREBASE
// Puedes ingresar tus credenciales aquí o en la interfaz
// =========================================================================
const defaultFirebaseConfig = {
    apiKey: "AIzaSy_CONFIGURA_TU_API_KEY_AQUI",
    authDomain: "motodiag-telemetria.firebaseapp.com",
    databaseURL: "https://motodiag-telemetria-default-rtdb.firebaseio.com",
    projectId: "motodiag-telemetria",
    storageBucket: "motodiag-telemetria.appspot.com",
    messagingSenderId: "1234567890",
    appId: "1:1234567890:web:abcdef123456"
};

// Cargar configuración guardada en localStorage si existe
function getFirebaseConfig() {
    const custom = localStorage.getItem("motoDiag_firebase_config");
    if (custom) {
        try { return JSON.parse(custom); } catch(e){}
    }
    return defaultFirebaseConfig;
}

let firebaseInicializado = false;
let auth = null;
let db = null;     // Firestore
let rtdb = null;   // Realtime Database

function inicializarFirebase() {
    if (typeof firebase === "undefined") {
        console.warn("SDK de Firebase no detectado en ventana.");
        return;
    }
    try {
        const cfg = getFirebaseConfig();
        if (!firebase.apps.length) {
            firebase.initializeApp(cfg);
        }
        auth = firebase.auth();
        db = firebase.firestore();
        rtdb = firebase.database();
        firebaseInicializado = true;
        console.log("Firebase inicializado correctamente.");

        // Escuchar cambios de autenticación
        auth.onAuthStateChanged(manejarCambioAuth);
    } catch (err) {
        console.warn("Firebase no configurado aún o claves pendientes:", err.message);
    }
}

// =========================================================================
// CICLO DE VIDA INICIAL
// =========================================================================
document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll('.toggle-password').forEach(btn => {
        btn.innerHTML = ICON_EYE_OPEN;
    });

    inicializarFirebase();

    // Si no está usando Firebase o está en modo offline guardado
    const savedUser = localStorage.getItem("motoDiagUser");
    if (savedUser && (!firebaseInicializado || !auth.currentUser)) {
        cargarPerfilUsuario(savedUser);
    }

    inicializarGraficosVisuales();
    inicializarGraficosESP32();
});

// =========================================================================
// CONTROL DE VISIBILIDAD DE CONTRASEÑA Y FORMULARIOS
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
// FLUJO DE AUTENTICACIÓN Y APROBACIÓN POR ADMINISTRADOR
// =========================================================================

/**
 * 1. INICIAR SESIÓN CON GOOGLE (OAuth Popup)
 */
async function iniciarSesionConGoogle() {
    if (!firebaseInicializado || !auth) {
        alert("Configuración de Firebase pendiente.\n\nPor favor ingresa las credenciales de Firebase en la sección de configuración o revisa el archivo GUIA_FIREBASE.md para activar Google Sign-In.");
        return;
    }

    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        const result = await auth.signInWithPopup(provider);
        const user = result.user;
        await procesarUsuarioAutenticado(user, "google");
    } catch (error) {
        console.error("Error en Google Sign-In:", error);
        if (error.code === "auth/popup-closed-by-user") return;
        alert("Error al iniciar sesión con Google: " + error.message);
    }
}

/**
 * 2. INICIAR SESIÓN CON CORREO Y CONTRASEÑA
 */
async function iniciarSesion() {
    const usuarioOCorreo = document.getElementById("login-user").value.trim();
    const contrasena = document.getElementById("login-pass").value.trim();

    if (!usuarioOCorreo || !contrasena) {
        alert("Por favor completa tu usuario/correo y contraseña.");
        return;
    }

    // Si Firebase está activo
    if (firebaseInicializado && auth) {
        try {
            // Si el usuario no ingresó un correo con @, sugerimos o autocompletamos
            let emailFinal = usuarioOCorreo;
            if (!usuarioOCorreo.includes("@")) {
                emailFinal = usuarioOCorreo.toLowerCase() + "@motodiag.app";
            }

            const cred = await auth.signInWithEmailAndPassword(emailFinal, contrasena);
            await procesarUsuarioAutenticado(cred.user, "password");
            return;
        } catch (error) {
            console.warn("Fallo autenticación Firebase:", error.code);
            if (error.code === "auth/user-not-found" || error.code === "auth/wrong-password" || error.code === "auth/invalid-credential") {
                alert("Credenciales incorrectas o usuario no registrado.");
                return;
            }
        }
    }

    // Modo compatibilidad local (offline sin Firebase configurado)
    const usuariosRegistrados = JSON.parse(localStorage.getItem("motoDiag_registered_users")) || {};
    if (usuariosRegistrados[usuarioOCorreo] && usuariosRegistrados[usuarioOCorreo].password === contrasena) {
        cargarPerfilUsuario(usuarioOCorreo);
    } else if (usuarioOCorreo === "admin" && contrasena === "1234") {
        cargarPerfilUsuario("admin");
    } else {
        alert("Usuario o contraseña incorrectos. Si acabas de registrarte en Firebase, verifica tus datos.");
    }
}

/**
 * 3. REGISTRO DE NUEVO USUARIO (CON ASIGNACIÓN DE ESTADO 'pending')
 */
async function registrarUsuario() {
    const regUser = document.getElementById("reg-user").value.trim();
    const regPass = document.getElementById("reg-pass").value.trim();
    const marca = document.getElementById("reg-moto-marca").value.trim() || "Yamaha";
    const modelo = document.getElementById("reg-moto-modelo").value.trim() || "YCZ";
    const cilindraje = document.getElementById("reg-moto-cilindraje").value.trim() || "110cc";
    const anio = document.getElementById("reg-moto-anio").value.trim() || "2024";

    if (!regUser || !regPass) {
        alert("Por favor ingresa un nombre de usuario/correo y una contraseña.");
        return;
    }

    if (regPass.length < 6) {
        alert("La contraseña debe tener al menos 6 caracteres.");
        return;
    }

    // Si Firebase está activo
    if (firebaseInicializado && auth && db) {
        try {
            let emailFinal = regUser;
            if (!regUser.includes("@")) {
                emailFinal = regUser.toLowerCase() + "@motodiag.app";
            }

            const cred = await auth.createUserWithEmailAndPassword(emailFinal, regPass);
            const user = cred.user;

            // Actualizar display name
            await user.updateProfile({ displayName: regUser.split("@")[0] });

            // Registrar en Firestore con status: 'pending'
            await db.collection("users").doc(user.uid).set({
                uid: user.uid,
                email: user.email,
                displayName: regUser.split("@")[0],
                status: "pending", // <--- Bloqueado hasta aprobación del admin
                rol: "usuario",
                moto: { marca, modelo, cilindraje, anio },
                fechaSolicitud: firebase.firestore.FieldValue.serverTimestamp(),
                creadoEn: new Date().toISOString()
            });

            // Guardar configuración de moto local
            guardarDatosMotoLocal({ marca, modelo, cilindraje, anio });

            mostrarPantallaPendiente(user);
            return;
        } catch (error) {
            console.error("Error al registrar en Firebase:", error);
            if (error.code === "auth/email-already-in-use") {
                alert("Este correo o usuario ya se encuentra registrado. Inicia sesión o recupera tu contraseña.");
                switchAuthForm("form-login");
                return;
            }
            alert("Error en el registro: " + error.message);
            return;
        }
    }

    // Modo local offline
    let usuariosRegistrados = JSON.parse(localStorage.getItem("motoDiag_registered_users")) || {};
    usuariosRegistrados[regUser] = {
        password: regPass,
        moto: { marca, modelo, cilindraje, anio },
        status: "approved"
    };
    localStorage.setItem("motoDiag_registered_users", JSON.stringify(usuariosRegistrados));
    guardarDatosMotoLocal({ marca, modelo, cilindraje, anio });
    alert("Usuario registrado localmente con éxito.");
    cargarPerfilUsuario(regUser);
}

/**
 * 4. PROCESAR USUARIO AUTENTICADO Y COMPROBAR SU ESTADO DE APROBACIÓN
 */
async function procesarUsuarioAutenticado(user, proveedor) {
    usuarioActualAuth = user;

    if (!db) {
        // Sin base de datos Firestore, permitir acceso directo
        cargarPerfilUsuario(user.displayName || user.email);
        return;
    }

    try {
        const userDocRef = db.collection("users").doc(user.uid);
        const docSnap = await userDocRef.get();

        if (!docSnap.exists) {
            // Usuario nuevo que entra por Google por primera vez -> Se registra como 'pending'
            const nuevoRegistro = {
                uid: user.uid,
                email: user.email,
                displayName: user.displayName || user.email.split("@")[0],
                foto: user.photoURL || "",
                status: "pending", // <--- Solo tú puedes cambiarlo a 'approved' en la consola
                rol: "usuario",
                proveedor: proveedor,
                moto: {
                    marca: "Yamaha",
                    modelo: "YCZ",
                    cilindraje: "110cc",
                    anio: "2024"
                },
                fechaSolicitud: firebase.firestore.FieldValue.serverTimestamp(),
                creadoEn: new Date().toISOString()
            };
            await userDocRef.set(nuevoRegistro);
            mostrarPantallaPendiente(user);
            activarEscuchaAprobacionEnTiempoReal(user.uid);
            return;
        }

        const data = docSnap.data();

        // VALIDACIÓN EXHAUSTIVA DE ESTADO DE APROBACIÓN:
        if (data.status === "approved" || data.rol === "admin") {
            // APROBADO: Acceso completo
            if (unsubscribeUserStatus) unsubscribeUserStatus();
            cargarPerfilUsuario(data.displayName || user.displayName || user.email);
            if (data.moto) guardarDatosMotoLocal(data.moto);
            conectarTelemetriaESP32();
        } else if (data.status === "rejected") {
            alert("Tu solicitud de acceso ha sido denegada por el Administrador.");
            cerrarSesion();
        } else {
            // ESTADO: 'pending'
            mostrarPantallaPendiente(user);
            activarEscuchaAprobacionEnTiempoReal(user.uid);
        }
    } catch (err) {
        console.error("Error al verificar estado de usuario en Firestore:", err);
        // Fallback defensivo
        mostrarPantallaPendiente(user);
    }
}

/**
 * Muestra la pantalla visual de espera de aprobación
 */
function mostrarPantallaPendiente(user) {
    document.getElementById("auth-modal").classList.remove("hidden");
    document.getElementById("app-container").classList.remove("active");

    const forms = document.querySelectorAll('.auth-form');
    forms.forEach(form => form.classList.remove('active-form'));

    const pendingScreen = document.getElementById("screen-pending-approval");
    if (pendingScreen) {
        pendingScreen.classList.add("active-form");
        document.getElementById("pending-user-name").innerText = user.displayName || user.email.split("@")[0];
        document.getElementById("pending-user-email").innerText = user.email;
        document.getElementById("pending-user-uid").innerText = user.uid;
    }
}

/**
 * Escucha en tiempo real si el Administrador cambia el campo status a 'approved' en Firebase
 */
function activarEscuchaAprobacionEnTiempoReal(uid) {
    if (!db) return;
    if (unsubscribeUserStatus) unsubscribeUserStatus();

    unsubscribeUserStatus = db.collection("users").doc(uid).onSnapshot(snapshot => {
        if (snapshot.exists) {
            const data = snapshot.data();
            if (data.status === "approved" || data.rol === "admin") {
                console.log("¡El usuario ha sido aprobado en tiempo real por el Administrador!");
                if (unsubscribeUserStatus) {
                    unsubscribeUserStatus();
                    unsubscribeUserStatus = null;
                }
                alert("¡Felicidades! Tu cuenta ha sido aprobada por el Administrador.");
                cargarPerfilUsuario(data.displayName || usuarioActualAuth.displayName || usuarioActualAuth.email);
                if (data.moto) guardarDatosMotoLocal(data.moto);
                conectarTelemetriaESP32();
            }
        }
    }, err => {
        console.warn("Aviso en listener de aprobación:", err.message);
    });
}

/**
 * Botón 'Comprobar Si Ya Fui Aprobado'
 */
async function verificarEstadoAprobacion() {
    if (!usuarioActualAuth && auth) {
        usuarioActualAuth = auth.currentUser;
    }

    if (!usuarioActualAuth || !db) {
        alert("Verificando... Si el Administrador ya cambió tu estado en la consola a 'approved', recarga la página o vuelve a ingresar.");
        return;
    }

    try {
        const docSnap = await db.collection("users").doc(usuarioActualAuth.uid).get();
        if (docSnap.exists) {
            const data = docSnap.data();
            if (data.status === "approved" || data.rol === "admin") {
                alert("¡Excelente! Tu cuenta ya figura como APROBADA en Firebase.");
                cargarPerfilUsuario(data.displayName || usuarioActualAuth.displayName || usuarioActualAuth.email);
                if (data.moto) guardarDatosMotoLocal(data.moto);
                conectarTelemetriaESP32();
            } else {
                alert("Tu estado actual sigue siendo: '" + (data.status || "pending") + "'.\n\nEl administrador debe ingresar a Firebase Console > Firestore > colección 'users' y cambiar el campo 'status' a 'approved'.");
            }
        }
    } catch (e) {
        alert("Error al consultar Firestore: " + e.message);
    }
}

function cambiarContrasena() {
    const userOrEmail = document.getElementById("rec-user").value.trim();
    if (!userOrEmail) {
        alert("Por favor ingresa tu correo para enviarte el enlace de restablecimiento.");
        return;
    }

    if (firebaseInicializado && auth && userOrEmail.includes("@")) {
        auth.sendPasswordResetEmail(userOrEmail).then(() => {
            alert("Se ha enviado un correo a " + userOrEmail + " con instrucciones para restablecer tu contraseña.");
            switchAuthForm("form-login");
        }).catch(err => {
            alert("Error al enviar correo de recuperación: " + err.message);
        });
        return;
    }

    alert("Si usas correo y contraseña en Firebase, ingresa un correo válido para enviarte el enlace.");
}

function cerrarSesion() {
    if (unsubscribeUserStatus) {
        unsubscribeUserStatus();
        unsubscribeUserStatus = null;
    }

    if (auth) {
        auth.signOut().catch(() => {});
    }

    localStorage.removeItem("motoDiagUser");
    usuarioActualAuth = null;

    document.getElementById("auth-modal").classList.remove("hidden");
    document.getElementById("app-container").classList.remove("active");
    switchAuthForm("form-login");
}

function manejarCambioAuth(user) {
    if (user) {
        procesarUsuarioAutenticado(user, "auto");
    } else {
        const savedUser = localStorage.getItem("motoDiagUser");
        if (!savedUser) {
            document.getElementById("auth-modal").classList.remove("hidden");
            document.getElementById("app-container").classList.remove("active");
        }
    }
}

function cargarPerfilUsuario(nombreUsuario) {
    localStorage.setItem("motoDiagUser", nombreUsuario);
    document.getElementById("user-display").innerText = nombreUsuario;
    document.getElementById("auth-modal").classList.add("hidden");
    document.getElementById("app-container").classList.add("active");
    cargarDatosMoto();
}

// =========================================================================
// GESTIÓN DE CONFIGURACIÓN DE LA MOTOCICLETA (YAMAHA YCZ 110)
// =========================================================================
function guardarDatosMotoLocal(moto) {
    localStorage.setItem("motoDiag_moto_data", JSON.stringify(moto));
}

function cargarDatosMoto() {
    const saved = localStorage.getItem("motoDiag_moto_data");
    let motoData = {
        marca: "Yamaha",
        modelo: "YCZ",
        cilindraje: "110cc",
        anio: "2024"
    };

    if (saved) {
        try { motoData = JSON.parse(saved); } catch(e){}
    }

    const m = document.getElementById("moto-marca");
    const mod = document.getElementById("moto-modelo");
    const c = document.getElementById("moto-cilindraje");
    const a = document.getElementById("moto-anio");

    if (m) m.value = motoData.marca || "Yamaha";
    if (mod) mod.value = motoData.modelo || "YCZ";
    if (c) c.value = motoData.cilindraje || "110cc";
    if (a) a.value = motoData.anio || "2024";

    const bannerDesc = document.getElementById("moto-desc-banner");
    if (bannerDesc) {
        bannerDesc.innerText = `${motoData.marca} ${motoData.modelo} (${motoData.cilindraje} - ${motoData.anio})`;
    }
}

function guardarDatosMoto() {
    const motoData = {
        marca: document.getElementById("moto-marca").value.trim() || "Yamaha",
        modelo: document.getElementById("moto-modelo").value.trim() || "YCZ",
        cilindraje: document.getElementById("moto-cilindraje").value.trim() || "110cc",
        anio: document.getElementById("moto-anio").value.trim() || "2024"
    };
    guardarDatosMotoLocal(motoData);
    cargarDatosMoto();
    alert("¡Datos de la motocicleta guardados correctamente!");
}

// =========================================================================
// NAVEGACIÓN ENTRE VISTAS DEL PANEL LATERAL
// =========================================================================
function switchView(viewName, element) {
    document.querySelectorAll(".view-content").forEach(view => {
        view.classList.remove("active");
    });
    document.querySelectorAll(".menu-item").forEach(item => {
        item.classList.remove("active");
    });

    const targetView = document.getElementById(viewName);
    if (targetView) targetView.classList.add("active");
    if (element) element.classList.add("active");

    if (viewName === "dispositivo") {
        conectarTelemetriaESP32();
    }
}

// =========================================================================
// MÓDULO DISPOSITIVO ESP32 - TELEMETRÍA EN TIEMPO REAL
// (DS18B20 en GPIO 4 + MPU6050 en GPIO 21/22 - Yamaha YCZ 110)
// =========================================================================
let rtdbListenerActivo = false;

function conectarTelemetriaESP32() {
    if (!rtdb) return;
    if (rtdbListenerActivo) return;

    try {
        const liveRef = rtdb.ref("dispositivo/live");
        liveRef.on("value", snapshot => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                actualizarVistaESP32(data);
            }
        });
        rtdbListenerActivo = true;
        console.log("Conectado a Firebase Realtime Database para telemetría ESP32.");
    } catch (err) {
        console.warn("No se pudo conectar a Realtime Database:", err.message);
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
        // Rango útil 20C a 130C
        const pct = Math.min(100, Math.max(0, ((tempVal - 20) / (130 - 20)) * 100));
        tempFill.style.width = pct + "%";
        if (tempVal > 115) {
            tempFill.style.background = "#EF4444";
        } else if (tempVal > 100) {
            tempFill.style.background = "#F59E0B";
        } else {
            tempFill.style.background = "#10B981";
        }
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

    // 3. Badges de Conexión y Estado
    const badgeConn = document.getElementById("esp32-connection-badge");
    if (badgeConn) {
        badgeConn.className = "badge badge-live";
        badgeConn.innerText = "ESP32 CONECTADO";
    }

    const lastSeen = document.getElementById("esp32-last-seen");
    if (lastSeen) {
        const d = new Date();
        lastSeen.innerText = `Último paquete: ${d.toLocaleTimeString()}`;
    }

    // 4. Agregar a gráficos
    agregarPuntoGraficoESP32(tempVal, vibTotal);

    // 5. Agregar al terminal de tramas
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

    // Limitar filas a 30
    while (terminal.children.length > 30) {
        terminal.removeChild(terminal.lastChild);
    }
}

/**
 * Simulador de ESP32 para pruebas sin tener la tarjeta física encendida
 */
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
        let tempSim = 78.5;
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
                rssi: -58,
                uptime_s: Math.floor(Date.now() / 1000)
            };

            actualizarVistaESP32(trama);
        }, 1500);
    }
}

// =========================================================================
// INICIALIZACIÓN DE GRÁFICOS (CHART.JS)
// =========================================================================
function inicializarGraficosVisuales() {
    const ctxGen = document.getElementById("chart-general");
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
                datasets: [{
                    label: 'Temp (°C)',
                    borderColor: '#2563EB',
                    data: []
                }]
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
                datasets: [{
                    label: 'Vibración (g)',
                    borderColor: '#10B981',
                    data: []
                }]
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
// SIMULACIÓN DE TELEMETRÍA EN VIVO (MÓDULO EXISTENTE INTACTO)
// =========================================================================
function iniciarMedicionSimulada() {
    if (intervaloSimulacion) return;

    const btnIniciar = document.getElementById("btn-iniciar");
    const btnDetener = document.getElementById("btn-detener");
    if (btnIniciar) btnIniciar.disabled = true;
    if (btnDetener) btnDetener.disabled = false;

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
    if (!intervaloSimulacion) return;

    clearInterval(intervaloSimulacion);
    intervaloSimulacion = null;

    const btnIniciar = document.getElementById("btn-iniciar");
    const btnDetener = document.getElementById("btn-detener");
    if (btnIniciar) btnIniciar.disabled = false;
    if (btnDetener) btnDetener.disabled = true;

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
// ASISTENTE DE DIAGNÓSTICO IA CON GEMINI
// =========================================================================
function handleChatEnter(event) {
    if (event.key === "Enter") {
        consultarGemini();
    }
}

async function consultarGemini() {
    const input = document.getElementById("chat-input");
    const container = document.getElementById("chat-messages");
    if (!input || !container) return;

    const mensaje = input.value.trim();
    if (!mensaje) return;

    // Mensaje del usuario
    let userDiv = document.createElement("div");
    userDiv.className = "message user";
    userDiv.innerText = mensaje;
    container.appendChild(userDiv);
    input.value = "";
    container.scrollTop = container.scrollHeight;

    // Indicador de pensando
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
        try { motoData = JSON.parse(savedMoto); } catch(e){}
    }

    let respuestaTexto = null;
    let ultimoError = null;

    // 1. Llamar al backend de Vercel /api/chat.js
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

    // 2. Fallback con API Key local si existe en localStorage
    if (!respuestaTexto) {
        const localKey = localStorage.getItem("motoDiag_gemini_key");
        if (localKey) {
            const promptSistema = `Eres un asistente mecánico experto de la plataforma "MotoDiag IA". El usuario maneja una motocicleta ${motoData.marca} ${motoData.modelo} con cilindraje ${motoData.cilindraje}. Telemetría actual de sensores: ${esp32UltimaTrama ? JSON.stringify(esp32UltimaTrama) : 'en espera'}. Responde de forma técnica pero accesible y breve a cualquier duda sobre mantenimiento, telemetría, temperatura, vibración o fallas mecánicas de su vehículo. Pregunta del usuario: "${mensaje}"`;
            const modelosDisponibles = ["gemini-flash-lite-latest", "gemini-3.8-flash", "gemini-flash-latest", "gemini-3.8-pro"];

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
        botDiv.innerText = `⚠️ No fue posible consultar al asistente. ${ultimoError ? '(' + ultimoError + ')' : ''}\n\nSi estás en Vercel, asegúrate de configurar la variable de entorno GEMINI_API_KEY en Project Settings > Environment Variables.`;
    }

    container.appendChild(botDiv);
    container.scrollTop = container.scrollHeight;
}
