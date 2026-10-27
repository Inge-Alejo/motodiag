
function inicializarValoresPorDefecto() {
    const teleTemp = document.getElementById("val-temp-telemetria");
    const teleVib = document.getElementById("val-vib-telemetria");
    if (teleTemp) teleTemp.innerText = "89.2 °C";
    if (teleVib) teleVib.innerText = "0.95 g";

    const generalTemp = document.getElementById("val-temp-media");
    const generalVib = document.getElementById("val-vibracion");
    const generalEstado = document.getElementById("val-estado-global");
    if (generalTemp) generalTemp.innerText = "89.2 °C";
    if (generalVib) generalVib.innerText = "0.95 g";
    if (generalEstado) {
        generalEstado.innerText = "Operación Normal";
        generalEstado.style.color = "#10B981";
    }

    // El ESP32 es para hardware real: esperar lecturas de la sonda DS18B20 y el MPU6050
    const espTemp = document.getElementById("val-esp32-temp");
    const espVib = document.getElementById("val-esp32-vibe-mag");
    const espTempState = document.getElementById("val-esp32-temp-state");
    const espVibState = document.getElementById("val-esp32-vibe-state");
    const badgeConn = document.getElementById("esp32-status-badge");
    if (espTemp) espTemp.innerText = "-- °C";
    if (espVib) espVib.innerText = "-- G";
    if (espTempState) {
        espTempState.innerText = "Esperando hardware real (DS18B20)...";
        espTempState.style.color = "#64748B";
    }
    if (espVibState) {
        espVibState.innerText = "Esperando sensor MPU6050...";
        espVibState.style.color = "#64748B";
    }
    if (badgeConn) {
        badgeConn.className = "badge-offline";
        badgeConn.innerText = "En espera de hardware";
    }
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
    appId: "1:493156491098:web:113961dbdfab5e24f49d63"
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
        firebaseInicializado = true;
        console.log("Firebase conectado exitosamente con Cloud Firestore:", defaultFirebaseConfig.projectId);

        auth.onAuthStateChanged(user => {
            if (user) {
                usuarioActualAuth = user;
                cargarPerfilUsuario(user.displayName || user.email.split("@")[0]);
            }
        });

        // Listener en tiempo real de Cloud Firestore para sincronización instantánea
        conectarFirestoreTiempoReal();

    } catch (err) {
        console.warn("Aviso al inicializar Firebase:", err.message);
    }
}

function conectarFirestoreTiempoReal() {
    if (!db || window.firestoreListenerActivo) return;
    try {
        window.firestoreListenerActivo = true;
        db.collection("historial_fallas")
          .limit(30)
          .onSnapshot(snapshot => {
              if (snapshot && !snapshot.empty) {
                  const cloudItems = [];
                  snapshot.forEach(doc => {
                      cloudItems.push(doc.data());
                  });
                  // Ordenar por timestamp descendente
                  cloudItems.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                  if (cloudItems.length > 0) {
                      localStorage.setItem("motoDiag_historial_fallas", JSON.stringify(cloudItems));
                      renderizarFilasHistorialDOM(cloudItems);
                      actualizarAlertasPredictivasPanel(cloudItems);
                  }
              }
          }, err => {
              console.warn("Aviso permisos Firestore (usa modo de prueba en Firebase Console si deseas sincronizar directo con Firestore):", err.message);
          });
    } catch(e) {
        console.warn("Listener Firestore:", e.message);
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

    // 1. Verificación local / admin directa (evita falsas alertas de Firebase para admin/1234 y cuentas locales)
    const usuariosRegistrados = JSON.parse(localStorage.getItem("motoDiag_registered_users")) || {};
    if (usuarioOCorreo.toLowerCase() === "admin" && contrasena === "1234") {
        cargarPerfilUsuario("admin");
        return;
    }
    if (usuariosRegistrados[usuarioOCorreo] && usuariosRegistrados[usuarioOCorreo].password === contrasena) {
        cargarPerfilUsuario(usuarioOCorreo);
        return;
    }
    for (let u in usuariosRegistrados) {
        if (usuariosRegistrados[u].email && usuariosRegistrados[u].email.toLowerCase() === usuarioOCorreo.toLowerCase() && usuariosRegistrados[u].password === contrasena) {
            cargarPerfilUsuario(u);
            return;
        }
    }

    // 2. Si no es credencial local, verificar en Firebase Cloud Auth
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
        }
    }

    // Si no coincidió ni en local ni en Firebase
    alert("Credenciales incorrectas. Verifica tu usuario y contraseña.");
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
        "[Guardado] Configuración & Moto Guardada",
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


// Renderizador del Historial en el DOM
function renderizarFilasHistorialDOM(lista) {
    const tbody = document.getElementById("historial-tabla-body");
    if (!tbody) return;

    if (!Array.isArray(lista) || lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #64748B; padding: 24px;">Aún no hay registros. Realiza una medición de telemetría para generar el historial.</td></tr>';
        return;
    }

    tbody.innerHTML = "";
    lista.forEach(item => {
        const tr = document.createElement("tr");
        const fecha = item.fecha || new Date().toLocaleString();
        const modulo = item.modulo || "Sistema";
        const desc = item.descripcion || "";
        const sev = item.severidad || "Normal";
        const badgeClass = item.badgeClass || (sev === "Advertencia" || sev === "Media" || sev === "Preventivo" ? "bg-warning" : (sev === "Peligro" || sev === "Crítico" ? "bg-danger" : "bg-success"));
        const estado = item.estado || "Completado";

        tr.innerHTML = `
            <td style="font-weight: 600; color: #0F172A;">${fecha}</td>
            <td><span class="badge" style="background: #E2E8F0; color: #1E293B; font-weight: 600;">${modulo}</span></td>
            <td>${desc}</td>
            <td><span class="badge ${badgeClass}">${sev}</span></td>
            <td><span style="color: #10B981; font-weight: 600;">${estado}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

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

    // Sincronizar en segundo plano con el backend de Vercel
    if (typeof fetch !== "undefined") {
        fetch('/api/historial')
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (data && data.historial && data.historial.length > 0) {
                    localStorage.setItem("motoDiag_historial_fallas", JSON.stringify(data.historial));
                    renderizarFilasHistorialDOM(data.historial);
                    actualizarAlertasPredictivasPanel(data.historial);
                }
            })
            .catch(() => {});
    }
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
        modulo: modulo || "Configuración & Moto",
        descripcion: descripcion,
        severidad: severidad || "Normal",
        badgeClass: badgeClass,
        estado: estado || "Completado",
        timestamp: Date.now()
    };

    lista.unshift(nuevoItem);
    if (lista.length > 60) lista.pop();

    // 1. NIVEL 1: PERSISTENCIA LOCAL INMEDIATA (0 ms, OFFLINE FIRST)
    localStorage.setItem("motoDiag_historial_fallas", JSON.stringify(lista));
    renderizarFilasHistorialDOM(lista);
    actualizarAlertasPredictivasPanel(lista);

    // 2. FEEDBACK VISUAL INMEDIATO AL USUARIO
    mostrarNotificacionGuardado(
        "[Guardado] " + (modulo || "Registro") + " Guardado",
        descripcion
    );

    // 3. NIVEL 2: PERSISTENCIA EN CLOUD BACKEND DE VERCEL (/api/historial)
    if (typeof fetch !== "undefined") {
        fetch('/api/historial', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(nuevoItem)
        }).then(r => r.json())
          .then(res => console.log("Guardado en Vercel Database con éxito:", res.ok))
          .catch(e => console.warn("Vercel DB sync:", e.message));
    }

    // 4. NIVEL 3: PERSISTENCIA EN CLOUD FIRESTORE DE GOOGLE FIREBASE
    if (db) {
        db.collection("historial_fallas").add(nuevoItem)
            .then(docRef => {
                console.log("[Firestore] Guardado exitoso con ID:", docRef.id);
            })
            .catch(err => {
                console.warn("[Firestore] Error al guardar:", err.code, err.message);
                if (err.code === "permission-denied" || (err.message && err.message.includes("permissions"))) {
                    mostrarNotificacionGuardado(
                        "[Atención] Base de Datos Firebase Bloqueada",
                        "Firestore requiere activar 'allow read, write: if true;' en la pestaña Reglas de Firebase Console."
                    );
                }
            });
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

let pollingESP32Interval = null;
let ultimaMarcaTiempoESP32 = 0;

function conectarTelemetriaESP32() {
    inicializarGraficoDispositivo();

    // Polling al endpoint serverless /api/esp32 de Vercel para recibir telemetría enviada por el ESP32 real
    if (pollingESP32Interval) clearInterval(pollingESP32Interval);

    const consultarEndpointESP32 = async () => {
        try {
            const resp = await fetch('/api/esp32');
            if (resp.ok) {
                const data = await resp.json();
                if (data.hayDatosReales && data.ultimaTrama && data.timestamp !== ultimaMarcaTiempoESP32) {
                    ultimaMarcaTiempoESP32 = data.timestamp;
                    actualizarVistaESP32(data.ultimaTrama);
                } else if (!data.hayDatosReales && !esp32Simulando) {
                    const badgeConn = document.getElementById("esp32-status-badge");
                    if (badgeConn) {
                        badgeConn.className = "badge-offline";
                        badgeConn.innerText = "En espera de hardware";
                    }
                }
            }
        } catch (e) {
            // Ignorar en entorno de desarrollo local sin serverless
        }
    };

    consultarEndpointESP32();
    pollingESP32Interval = setInterval(consultarEndpointESP32, 2000);
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
                y: { type: 'linear', position: 'left', min: 75, max: 105, title: { display: true, text: '°C' } },
                y1: { type: 'linear', position: 'right', min: 0.5, max: 2.0, grid: { drawOnChartArea: false }, title: { display: true, text: 'g' } }
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
        elemTempState.innerText = tempVal > 105 ? "[Alerta] Temperatura elevada" : "[Normal] Rango óptimo culata (Yamaha YCZ 110)";
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
        elemVibState.innerText = vibTotal > 1.8 ? "[Alerta] Vibración elevada" : "[Normal] Nivel de vibración parejo y balanceado";
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
    // La simulación en Dispositivo ESP32 está completamente desactivada.
    // Este módulo opera exclusivamente con telemetría de hardware real del ESP32.
    conectarTelemetriaESP32();
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
        estadoLbl.innerHTML = '<span style="color:#10B981; font-weight:600;">[Activo] Medición en vivo activa (Dinámica entre 82°C y 98°C).</span>';
    }

    lecturasTemporalesTemp = [];
    lecturasTemporalesVib = [];
    estadoFisicaMotor.tiempoTicks = 0;

    // Inicializar punto de partida intermedio realista
    if (!estadoFisicaMotor.tempCulata || estadoFisicaMotor.tempCulata < 84 || estadoFisicaMotor.tempCulata > 96) {
        estadoFisicaMotor.tempCulata = 89.0;
    }
    if (!estadoFisicaMotor.vibracionG || estadoFisicaMotor.vibracionG < 0.85 || estadoFisicaMotor.vibracionG > 1.35) {
        estadoFisicaMotor.vibracionG = 1.05;
    }

    intervaloSimulacion = setInterval(() => {
        estadoFisicaMotor.tiempoTicks++;
        const t = estadoFisicaMotor.tiempoTicks;

        // FÍSICA DISPERSA Y DINÁMICA (REGLA SOLICITADA):
        // 1. Variación aleatoria de ~1°C a 2°C arriba y abajo en cada lectura (ondas no lineales)
        // 2. Fuerza restauradora suave hacia 89.5°C para evitar que se quede pegado arriba o abajo
        const tempActual = estadoFisicaMotor.tempCulata;
        const tendenciaMedia = (89.5 - tempActual) * 0.12;
        const ruidoAleatorio = (Math.random() * 4.0 - 2.0); // Variación entre -1.4°C y +1.4°C
        const pulsoDinamico = Math.sin(t * 0.3) * 1.5;       // Ondulaciones térmicas reales

        let deltaTemp = tendenciaMedia + ruidoAleatorio + pulsoDinamico;

        // RESTRICCIÓN ESTRICTA: No bajar más de 5°C en una sola lectura
        if (deltaTemp < -4.5) deltaTemp = -4.5;
        if (deltaTemp > 4.5) deltaTemp = 4.5;

        let tempCalculada = tempActual + deltaTemp;

        // DELIMITAR ESTRICTAMENTE ENTRE 82.0°C Y 98.0°C
        if (tempCalculada < 82.0) {
            tempCalculada = 82.0 + Math.random() * 1.5;
        } else if (tempCalculada > 98.0) {
            tempCalculada = 98.0 - Math.random() * 1.5;
        }

        estadoFisicaMotor.tempCulata = parseFloat(tempCalculada.toFixed(1));
        const tempFinal = estadoFisicaMotor.tempCulata;

        // VIBRACIÓN DISPERSA Y PROPORCIONAL (0.85g a 1.45g)
        const vibActual = estadoFisicaMotor.vibracionG;
        const tendenciaVib = (1.10 - vibActual) * 0.15;
        const ruidoVib = (Math.random() * 0.36 - 0.18);
        let vibCalculada = vibActual + tendenciaVib + ruidoVib;
        if (vibCalculada < 0.85) vibCalculada = 0.85 + Math.random() * 0.08;
        if (vibCalculada > 1.45) vibCalculada = 1.45 - Math.random() * 0.08;

        estadoFisicaMotor.vibracionG = parseFloat(vibCalculada.toFixed(2));
        const vibFinal = estadoFisicaMotor.vibracionG;

        const hora = new Date().toLocaleTimeString();

        lecturasTemporalesTemp.push(tempFinal);
        lecturasTemporalesVib.push(vibFinal);

        // Actualizar valores numéricos en Telemetría en Vivo
        const teleTemp = document.getElementById("val-temp-telemetria");
        const teleVib = document.getElementById("val-vib-telemetria");
        if (teleTemp) teleTemp.innerText = `${tempFinal} °C`;
        if (teleVib) teleVib.innerText = `${vibFinal} g`;

        // Actualizar valores numéricos en Panel General
        const generalTemp = document.getElementById("val-temp-media");
        const generalVib = document.getElementById("val-vibracion");
        const generalEstado = document.getElementById("val-estado-global");
        if (generalTemp) generalTemp.innerText = `${tempFinal} °C`;
        if (generalVib) generalVib.innerText = `${vibFinal} g`;
        if (generalEstado) {
            if (tempFinal > 95.0) {
                generalEstado.innerText = "Alerta Térmica Leve";
                generalEstado.style.color = "#F59E0B";
            } else {
                generalEstado.innerText = "Operación Normal";
                generalEstado.style.color = "#10B981";
            }
        }

        // GRÁFICO GENERAL: Ambos datasets (Temperatura y Vibración)
        if (chartGeneral) {
            if (chartGeneral.data.labels.length > 20) {
                chartGeneral.data.labels.shift();
                if (chartGeneral.data.datasets[0]) chartGeneral.data.datasets[0].data.shift();
                if (chartGeneral.data.datasets[1]) chartGeneral.data.datasets[1].data.shift();
            }
            chartGeneral.data.labels.push(hora);
            if (chartGeneral.data.datasets[0]) chartGeneral.data.datasets[0].data.push(tempFinal);
            if (chartGeneral.data.datasets[1]) chartGeneral.data.datasets[1].data.push(vibFinal);
            chartGeneral.update();
        }

        // GRÁFICO TELEMETRÍA: TEMPERATURA
        if (chartTemp) {
            if (chartTemp.data.labels.length > 20) {
                chartTemp.data.labels.shift();
                if (chartTemp.data.datasets[0]) chartTemp.data.datasets[0].data.shift();
            }
            chartTemp.data.labels.push(hora);
            if (chartTemp.data.datasets[0]) chartTemp.data.datasets[0].data.push(tempFinal);
            chartTemp.update();
        }

        // GRÁFICO TELEMETRÍA: MPU6050
        if (chartMpu) {
            if (chartMpu.data.labels.length > 20) {
                chartMpu.data.labels.shift();
                if (chartMpu.data.datasets[0]) chartMpu.data.datasets[0].data.shift();
            }
            chartMpu.data.labels.push(hora);
            if (chartMpu.data.datasets[0]) chartMpu.data.datasets[0].data.push(vibFinal);
            chartMpu.update();
        }
    }, 1100);
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

    const vistaActiva = document.querySelector('.view.active-view');
    let nombreModulo = "Configuración & Moto";
    if (vistaActiva && vistaActiva.id === "telemetria") {
        nombreModulo = "Telemetría en Vivo";
    }

    let promTemp = (89.0).toFixed(1);
    let promVib = (1.05).toFixed(2);

    if (lecturasTemporalesTemp && lecturasTemporalesTemp.length > 0) {
        promTemp = (lecturasTemporalesTemp.reduce((a, b) => a + b, 0) / lecturasTemporalesTemp.length).toFixed(1);
        promVib = (lecturasTemporalesVib.reduce((a, b) => a + b, 0) / lecturasTemporalesVib.length).toFixed(2);
    }

    const estadoLbl = document.getElementById("estado-medicion-lbl");
    if (estadoLbl) {
        estadoLbl.innerHTML = `<span style="color:#10B981; font-weight:600;">[Guardado] Medición finalizada (${nombreModulo}): Temp ${promTemp}°C | Vib ${promVib}g guardada en base de datos e historial.</span>`;
    }
    const teleLiveStatus = document.getElementById("telemetria-live-status-lbl");
    if (teleLiveStatus) {
        teleLiveStatus.innerHTML = `<span style="color:#10B981; font-weight:600;">[Guardado] Sesión guardada: ${promTemp}°C / ${promVib}g</span>`;
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

    // Guardar en el historial (Local + Base de datos Vercel + Firestore)
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
        botDiv.innerHTML = `<div style="color:#DC2626;">[Alerta] No fue posible consultar al asistente. ${ultimoError ? '(' + ultimoError + ')' : ''}</div><div style="font-size:11px; margin-top:4px; color:#64748B;">Si estás en Vercel, asegúrate de configurar la variable de entorno GEMINI_API_KEY en Project Settings > Environment Variables.</div>`;
    }

    container.appendChild(botDiv);
    container.scrollTop = container.scrollHeight;
}


function registrarFallaDesdeConfiguracion() {
    const falla = prompt("Ingresa el reporte de anomalía, mantenimiento o revisión de la moto:", "Inspección de bujía, calibración de válvulas y cambio de aceite");
    if (falla && falla.trim()) {
        agregarEntradaHistorial("Configuración & Moto", falla.trim(), "Preventivo", "Registrado");
        mostrarNotificacionGuardado("[Guardado] Registrado en Historial", falla.trim());
        alert("Reporte guardado en el Historial de Fallas con éxito.");
    }
}
