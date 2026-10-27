// =========================================================================
// MOTODIAG IA - MOTOR DE TELEMETRÍA, FIREBASE AUTH & DISPOSITIVO ESP32
// Yamaha YCZ 110 - Sistema de Diagnóstico Inteligente
// =========================================================================

// Íconos SVG para mostrar / ocultar contraseña
const ICON_EYE_OPEN = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
const ICON_EYE_CLOSED = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

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
// CONFIGURACIÓN OFICIAL DE FIREBASE (PROPORCIONADA POR EL USUARIO)
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
let db = null;     // Firestore Database (Aprobaciones de usuario)
let rtdb = null;   // Realtime Database (Telemetría ESP32)

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

        auth.onAuthStateChanged(manejarCambioAuth);
    } catch (err) {
        console.warn("Aviso al inicializar Firebase:", err.message);
    }
}

// =========================================================================
// INICIALIZACIÓN AL CARGAR EL DOM
// =========================================================================
document.addEventListener("DOMContentLoaded", () => {
    // Configurar íconos en los botones de ojo de contraseña
    document.querySelectorAll('.toggle-password').forEach(btn => {
        btn.innerHTML = ICON_EYE_OPEN;
    });

    inicializarFirebase();

    // Comprobar si hay usuario guardado previamente
    const savedUser = localStorage.getItem("motoDiagUser");
    if (savedUser) {
        cargarPerfilUsuario(savedUser);
    }

    inicializarGraficosVisuales();
    inicializarGraficosESP32();
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
// FLUJO DE AUTENTICACIÓN Y APROBACIÓN DE USUARIOS
// =========================================================================

/**
 * 1. INICIAR SESIÓN CON GOOGLE (OAuth Popup)
 */
async function iniciarSesionConGoogle() {
    if (!firebaseInicializado || !auth) {
        alert("Iniciando Firebase... Si estás en pruebas locales, verifica tu conexión a internet.");
        inicializarFirebase();
        if (!auth) return;
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
        if (error.code === "auth/unauthorized-domain") {
            alert("Dominio no autorizado en Firebase: debes agregar tu URL de Vercel en la consola de Firebase (Authentication > Settings > Authorized Domains).");
            return;
        }
        alert("Error al iniciar con Google: " + error.message);
    }
}

/**
 * 2. INICIAR SESIÓN CON USUARIO/CORREO Y CONTRASEÑA
 */
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
            await procesarUsuarioAutenticado(cred.user, "password");
            return;
        } catch (error) {
            console.warn("Fallo autenticación Firebase:", error.code);
            if (error.code === "auth/user-not-found" || error.code === "auth/wrong-password" || error.code === "auth/invalid-credential") {
                alert("Usuario o contraseña incorrectos en Firebase.");
                return;
            }
        }
    }

    // Modo local offline de respaldo
    const usuariosRegistrados = JSON.parse(localStorage.getItem("motoDiag_registered_users")) || {};
    if (usuariosRegistrados[usuarioOCorreo] && usuariosRegistrados[usuarioOCorreo].password === contrasena) {
        cargarPerfilUsuario(usuarioOCorreo);
    } else if (usuarioOCorreo === "admin" && contrasena === "1234") {
        cargarPerfilUsuario("admin");
    } else {
        alert("Credenciales incorrectas. Si tu cuenta es nueva en Firebase, asegúrate de haber sido aprobado.");
    }
}

/**
 * 3. SOLICITUD DE REGISTRO DE USUARIO (ESTADO POR DEFECTO: 'pending')
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
        alert("La contraseña debe tener un mínimo de 6 caracteres.");
        return;
    }

    if (firebaseInicializado && auth && db) {
        try {
            let emailFinal = regUser;
            if (!regUser.includes("@")) {
                emailFinal = regUser.toLowerCase() + "@motodiag.app";
            }

            const cred = await auth.createUserWithEmailAndPassword(emailFinal, regPass);
            const user = cred.user;

            await user.updateProfile({ displayName: regUser.split("@")[0] });

            // Registrar en Firestore con status: 'pending' (Sólo tú apruebas en la consola)
            await db.collection("users").doc(user.uid).set({
                uid: user.uid,
                email: user.email,
                displayName: regUser.split("@")[0],
                status: "pending",
                rol: "usuario",
                moto: { marca, modelo, cilindraje, anio },
                creadoEn: new Date().toISOString()
            });

            guardarDatosMotoLocal(regUser.split("@")[0], { marca, modelo, cilindraje, anio });
            mostrarPantallaPendiente(user);
            return;
        } catch (error) {
            console.error("Error en registro Firebase:", error);
            if (error.code === "auth/email-already-in-use") {
                alert("Este correo ya está registrado en Firebase. Por favor inicia sesión.");
                switchAuthForm("form-login");
                return;
            }
            alert("Error en el registro: " + error.message);
            return;
        }
    }

    // Registro offline fallback
    let usuariosRegistrados = JSON.parse(localStorage.getItem("motoDiag_registered_users")) || {};
    usuariosRegistrados[regUser] = {
        password: regPass,
        moto: { marca, modelo, cilindraje, anio },
        status: "approved"
    };
    localStorage.setItem("motoDiag_registered_users", JSON.stringify(usuariosRegistrados));
    guardarDatosMotoLocal(regUser, { marca, modelo, cilindraje, anio });
    alert("Usuario registrado localmente con éxito.");
    cargarPerfilUsuario(regUser);
}

/**
 * 4. PROCESAR USUARIO AUTENTICADO Y COMPROBAR STATUS ('approved' vs 'pending')
 */
async function procesarUsuarioAutenticado(user, proveedor) {
    usuarioActualAuth = user;

    if (!db) {
        cargarPerfilUsuario(user.displayName || user.email);
        return;
    }

    try {
        const userDocRef = db.collection("users").doc(user.uid);
        const docSnap = await userDocRef.get();

        if (!docSnap.exists) {
            // Usuario entra con Google por primera vez -> Asignar status: 'pending'
            const nuevoRegistro = {
                uid: user.uid,
                email: user.email,
                displayName: user.displayName || user.email.split("@")[0],
                foto: user.photoURL || "",
                status: "pending", // <--- Bloqueado hasta aprobación del Administrador
                rol: "usuario",
                proveedor: proveedor,
                moto: { marca: "Yamaha", modelo: "YCZ", cilindraje: "110cc", anio: "2024" },
                creadoEn: new Date().toISOString()
            };
            await userDocRef.set(nuevoRegistro);
            mostrarPantallaPendiente(user);
            activarEscuchaAprobacionEnTiempoReal(user.uid);
            return;
        }

        const data = docSnap.data();

        if (data.status === "approved" || data.rol === "admin") {
            // USUARIO ADMITIDO
            if (unsubscribeUserStatus) unsubscribeUserStatus();
            cargarPerfilUsuario(data.displayName || user.displayName || user.email);
            if (data.moto) guardarDatosMotoLocal(data.displayName || user.displayName, data.moto);
            conectarTelemetriaESP32();
        } else if (data.status === "rejected") {
            alert("Tu solicitud de acceso ha sido rechazada por el Administrador.");
            cerrarSesion();
        } else {
            // USUARIO PENDIENTE
            mostrarPantallaPendiente(user);
            activarEscuchaAprobacionEnTiempoReal(user.uid);
        }
    } catch (err) {
        console.error("Error al consultar status en Firestore:", err);
        mostrarPantallaPendiente(user);
    }
}

function mostrarPantallaPendiente(user) {
    const loginScreen = document.getElementById("login-screen");
    const appContainer = document.getElementById("app-container");
    const chatWidget = document.getElementById("chatWidget");

    if (appContainer) appContainer.style.display = "none";
    if (chatWidget) chatWidget.style.display = "none";
    if (loginScreen) {
        loginScreen.style.display = "flex";
        loginScreen.style.opacity = "1";
    }

    switchAuthForm("screen-pending-approval");

    const pName = document.getElementById("pending-user-name");
    const pEmail = document.getElementById("pending-user-email");
    const pUid = document.getElementById("pending-user-uid");

    if (pName) pName.innerText = user.displayName || user.email.split("@")[0];
    if (pEmail) pEmail.innerText = user.email;
    if (pUid) pUid.innerText = user.uid;
}

function activarEscuchaAprobacionEnTiempoReal(uid) {
    if (!db) return;
    if (unsubscribeUserStatus) unsubscribeUserStatus();

    unsubscribeUserStatus = db.collection("users").doc(uid).onSnapshot(snapshot => {
        if (snapshot.exists) {
            const data = snapshot.data();
            if (data.status === "approved" || data.rol === "admin") {
                if (unsubscribeUserStatus) {
                    unsubscribeUserStatus();
                    unsubscribeUserStatus = null;
                }
                alert("¡Felicidades! Tu cuenta ha sido aprobada por el Administrador.");
                cargarPerfilUsuario(data.displayName || usuarioActualAuth.displayName || usuarioActualAuth.email);
                if (data.moto) guardarDatosMotoLocal(data.displayName || usuarioActualAuth.displayName, data.moto);
                conectarTelemetriaESP32();
            }
        }
    }, err => console.warn("Listener Firestore:", err.message));
}

async function verificarEstadoAprobacion() {
    if (!usuarioActualAuth && auth) usuarioActualAuth = auth.currentUser;
    if (!usuarioActualAuth || !db) {
        alert("Comprobando... Si ya te aprobaron en la consola, recarga la página.");
        return;
    }

    try {
        const docSnap = await db.collection("users").doc(usuarioActualAuth.uid).get();
        if (docSnap.exists) {
            const data = docSnap.data();
            if (data.status === "approved" || data.rol === "admin") {
                alert("¡Excelente! Tu cuenta ya figura como APROBADA en Firebase.");
                cargarPerfilUsuario(data.displayName || usuarioActualAuth.displayName || usuarioActualAuth.email);
                if (data.moto) guardarDatosMotoLocal(data.displayName || usuarioActualAuth.displayName, data.moto);
                conectarTelemetriaESP32();
            } else {
                alert("Tu estado actual sigue siendo: '" + (data.status || "pending") + "'.\n\nEl administrador debe cambiar el campo status a 'approved' en la consola de Firebase.");
            }
        }
    } catch (e) {
        alert("Error al consultar Firestore: " + e.message);
    }
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

    alert("Ingresa un correo electrónico válido registrado en Firebase.");
}

function cerrarSesion() {
    if (unsubscribeUserStatus) {
        unsubscribeUserStatus();
        unsubscribeUserStatus = null;
    }
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

function manejarCambioAuth(user) {
    if (user) {
        procesarUsuarioAutenticado(user, "auto");
    } else {
        const savedUser = localStorage.getItem("motoDiagUser");
        if (!savedUser) {
            const loginScreen = document.getElementById("login-screen");
            const appContainer = document.getElementById("app-container");
            if (appContainer) appContainer.style.display = "none";
            if (loginScreen) {
                loginScreen.style.display = "flex";
                loginScreen.style.opacity = "1";
            }
        }
    }
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
// CONFIGURACIÓN DE LA MOTOCICLETA (YAMAHA YCZ 110)
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

    const displayMoto = document.getElementById("display-user-moto");
    if (displayMoto) {
        displayMoto.innerText = `${motoData.marca} ${motoData.modelo} (${motoData.cilindraje})`;
    }
}

function guardarDatosMoto() {
    const user = localStorage.getItem("motoDiagUser") || "default";
    const motoData = {
        marca: document.getElementById("moto-marca").value.trim() || "Yamaha",
        modelo: document.getElementById("moto-modelo").value.trim() || "YCZ",
        cilindraje: document.getElementById("moto-cilindraje").value.trim() || "110cc",
        anio: document.getElementById("moto-anio").value.trim() || "2024"
    };
    guardarDatosMotoLocal(user, motoData);
    cargarDatosMoto(user);
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
// GRÁFICOS CHART.JS
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
// MÓDULO EXISTENTE: TELEMETRÍA SIMULADA (INTACTO)
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
        try { motoData = JSON.parse(savedMoto); } catch(e){}
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
