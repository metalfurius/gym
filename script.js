// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, collection, addDoc, Timestamp, query, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// Your web app's Firebase configuration
// WARNING: Exposing API keys client-side is standard for web apps,
// but ensure your Firestore Security Rules are properly configured
// to prevent unauthorized access.
const firebaseConfig = {
  apiKey: "AIzaSyDDkGr_sOFIZzW5Nh8VmvPiOyFtoghBd9A",
  authDomain: "gymm-178fb.firebaseapp.com",
  projectId: "gymm-178fb",
  storageBucket: "gymm-178fb.appspot.com",
  messagingSenderId: "749496767338",
  appId: "1:749496767338:web:4f399779bd7cb6b8968b13"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app); // Initialize Firestore
const auth = getAuth(app); // Initialize Firebase Auth
const googleProvider = new GoogleAuthProvider();
const sesionesCollectionRef = collection(db, "sesiones_entrenamiento");

// --- Workout Routine Data ---
const workoutRoutine = {
    "A1": {
        name: "A1: Pull",
        exercises: [
            { name: "Dominadas", sets: 4, reps: "6-10" },
            { name: "Remo con Barra", sets: 3, reps: "8-12" },
            { name: "Remo Gironda (Polea baja)", sets: 3, reps: "10-15" },
            { name: "Face Pull", sets: 4, reps: "12-15" },
            { name: "Curl con Barra Z", sets: 3, reps: "8-12" },
            { name: "Curl Martillo", sets: 3, reps: "10-12" },
            { name: "Cardio Post-Entreno", sets: 1, reps: "15-25 min LISS / 10-15 min HIIT" }
        ]
    },
    "A2": {
        name: "A2: Push",
        exercises: [
            { name: "Press de Banca Plano (Barra)", sets: 3, reps: "6-10" },
            { name: "Press Inclinado Mancuernas", sets: 3, reps: "8-12" },
            { name: "Fondos Paralelas", sets: 3, reps: "Fallo" },
            { name: "Elevaciones Laterales Mancuernas", sets: 4, reps: "10-15" },
            { name: "Press Francés", sets: 3, reps: "10-12" },
            { name: "Extensiones Tríceps Polea Alta (Cuerda)", sets: 3, reps: "12-15" },
            { name: "Cardio Post-Entreno", sets: 1, reps: "15-25 min LISS / 10-15 min HIIT" }
        ]
    },
    "A3": {
        name: "A3: Piernas + Abdominales",
        exercises: [
            { name: "Sentadilla Hack", sets: 4, reps: "8-12" },
            { name: "Peso Muerto Rumano", sets: 4, reps: "10-12" },
            { name: "Extensiones Cuádriceps", sets: 3, reps: "12-15" },
            { name: "Curl Femoral Tumbado", sets: 3, reps: "12-15" },
            { name: "Elevación Talones (De pie/Sentado)", sets: 4, reps: "15-20" },
            { name: "Elevaciones Piernas (Colgado/Tumbado)", sets: 3, reps: "Fallo" },
            { name: "Crunch Polea Alta", sets: 3, reps: "12-15" },
            { name: "Cardio Post-Entreno", sets: 1, reps: "(Opcional) 15-25 min LISS / 10-15 min HIIT" }
        ]
    },
    "A4": {
        name: "A4: V-Taper Focus",
        exercises: [
            { name: "Jalón al Pecho (Agarre Ancho)", sets: 4, reps: "10-12" },
            { name: "Remo Sentado Polea (Agarre Abierto)", sets: 3, reps: "10-15" },
            { name: "Pull-over Polea Alta", sets: 3, reps: "12-15" },
            { name: "Elevaciones Laterales Polea Baja (Unilateral)", sets: 4, reps: "12-15 / brazo" },
            { name: "Pájaros con Mancuernas", sets: 3, reps: "12-15" },
            { name: "Encogimientos (Mancuernas/Barra)", sets: 3, reps: "10-15" },
            { name: "Cardio Post-Entreno", sets: 1, reps: "15-25 min LISS / 10-15 min HIIT" }
        ]
    },
    "B1": {
        name: "B1: Pull",
        exercises: [
            { name: "Remo T Barra", sets: 4, reps: "6-10" },
            { name: "Jalón Pecho (Neutro/Supino)", sets: 3, reps: "8-12" },
            { name: "Remo Mancuerna (Serrucho)", sets: 3, reps: "8-12 / brazo" },
            { name: "Reverse Pec Deck", sets: 4, reps: "12-15" },
            { name: "Curl Inclinado Mancuernas", sets: 3, reps: "10-12" },
            { name: "Curl Concentrado / Polea Baja", sets: 3, reps: "12-15" },
            { name: "Cardio Post-Entreno", sets: 1, reps: "15-25 min LISS / 10-15 min HIIT" }
        ]
    },
    "B2": {
        name: "B2: Push",
        exercises: [
            { name: "Press Militar Barra", sets: 3, reps: "6-10" },
            { name: "Press Plano Mancuernas", sets: 3, reps: "8-12" },
            { name: "Aperturas Inclinadas / Cruces Polea Baja", sets: 3, reps: "12-15" },
            { name: "Elevaciones Laterales Mancuernas", sets: 4, reps: "12-15" },
            { name: "Press Cerrado Banca", sets: 3, reps: "8-12" },
            { name: "Extensiones Tríceps Sobre Cabeza", sets: 3, reps: "12-15" },
            { name: "Cardio Post-Entreno", sets: 1, reps: "15-25 min LISS / 10-15 min HIIT" }
        ]
    },
    "B3": {
        name: "B3: Piernas + Abdominales",
        exercises: [
            { name: "Prensa Piernas", sets: 4, reps: "10-15" },
            { name: "Curl Femoral Sentado", sets: 4, reps: "12-15" },
            { name: "Sentadilla Búlgara / Zancadas", sets: 3, reps: "10-12 / pierna" },
            { name: "Hip Thrust", sets: 3, reps: "10-12" },
            { name: "Elevación Talones (Sentado/Prensa)", sets: 4, reps: "15-25" },
            { name: "Plancha", sets: 3, reps: "45-60 seg" },
            { name: "Russian Twist / Leñador Polea", sets: 3, reps: "15-20" },
            { name: "Cardio Post-Entreno", sets: 1, reps: "(Opcional) 15-25 min LISS / 10-15 min HIIT" }
        ]
    },
    "B4": {
        name: "B4: V-Taper Focus",
        exercises: [
            { name: "Dominadas Asistidas / Jalón Pecho", sets: 4, reps: "10-12" },
            { name: "Remo Alto a la Cara (Face Pull Ancho)", sets: 3, reps: "12-15" },
            { name: "Elevaciones Laterales (Máquina/Cable)", sets: 4, reps: "12-15" },
            { name: "Elevaciones Frontales (Disco/Mancuerna)", sets: 3, reps: "10-12" },
            { name: "Curl Bíceps Polea Alta", sets: "2-3", reps: "12-15" },
            { name: "Extensión Tríceps Polea (Tras nuca)", sets: "2-3", reps: "12-15" },
            { name: "Cardio Post-Entreno", sets: 1, reps: "15-25 min LISS / 10-15 min HIIT" }
        ]
    }
};

// --- DOM Elements ---
const authView = document.getElementById('auth-view');
const dashboardView = document.getElementById('dashboard-view');
const sessionView = document.getElementById('session-view');
const historyView = document.getElementById('history-view');
const currentDateEl = document.getElementById('current-date');
const daySelect = document.getElementById('day-select');
const startSessionBtn = document.getElementById('start-session-btn');
const sessionTitle = document.getElementById('session-title');
const exerciseListContainer = document.getElementById('exercise-list');
const sessionForm = document.getElementById('session-form');
const cancelSessionBtn = document.getElementById('cancel-session-btn');
const historyList = document.getElementById('history-list');
const navDashboardBtn = document.getElementById('nav-dashboard');
const navHistoryBtn = document.getElementById('nav-history');
const logoutBtn = document.getElementById('logout-btn');
const userEmailEl = document.getElementById('user-email');

// Auth Elements
const emailInput = document.getElementById('auth-email');
const passwordInput = document.getElementById('auth-password');
const loginEmailBtn = document.getElementById('login-email-btn');
const signupEmailBtn = document.getElementById('signup-email-btn');
const googleSigninBtn = document.getElementById('google-signin-btn');
const authErrorEl = document.getElementById('auth-error');

// --- State ---
let currentWorkoutDayId = null;
let currentUser = null; // Store the current user object

// --- Functions ---

function showView(viewToShow) {
    authView.classList.add('hidden');
    dashboardView.classList.add('hidden');
    sessionView.classList.add('hidden');
    historyView.classList.add('hidden');
    viewToShow.classList.remove('hidden');
}

function updateNavButtonsVisibility(isLoggedIn) {
    if (isLoggedIn) {
        navDashboardBtn.classList.remove('hidden');
        navHistoryBtn.classList.remove('hidden');
        logoutBtn.classList.remove('hidden');
    } else {
        navDashboardBtn.classList.add('hidden');
        navHistoryBtn.classList.add('hidden');
        logoutBtn.classList.add('hidden');
    }
}

function clearAuthError() {
    authErrorEl.textContent = '';
}

function displayAuthError(message) {
    authErrorEl.textContent = message;
}

function formatDate(date) {
    return date.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
}

function populateDaySelector() {
    for (const dayId in workoutRoutine) {
        const option = document.createElement('option');
        option.value = dayId;
        option.textContent = workoutRoutine[dayId].name;
        daySelect.appendChild(option);
    }
}

function renderSessionView(dayId) {
    currentWorkoutDayId = dayId;
    const workout = workoutRoutine[dayId];
    if (!workout) {
        console.error("Workout day not found:", dayId);
        alert("Error: Día de entrenamiento no encontrado.");
        showView(dashboardView);
        return;
    }

    sessionTitle.textContent = workout.name;
    exerciseListContainer.innerHTML = ''; // Clear previous exercises

    workout.exercises.forEach((exercise, exerciseIndex) => {
        const exerciseBlock = document.createElement('div');
        exerciseBlock.className = 'exercise-block';
        exerciseBlock.dataset.exerciseIndex = exerciseIndex;

        const title = document.createElement('h3');
        title.textContent = exercise.name;
        exerciseBlock.appendChild(title);

        const target = document.createElement('p');
        target.className = 'target-reps';
        const setsDisplay = typeof exercise.sets === 'number' ? `${exercise.sets} sets` : exercise.sets;
        target.textContent = `Objetivo: ${setsDisplay} x ${exercise.reps} reps`;
        exerciseBlock.appendChild(target);

        const numberOfSets = parseInt(exercise.sets, 10);
        if (!isNaN(numberOfSets) && numberOfSets > 0) {
            for (let i = 0; i < numberOfSets; i++) {
                const setRow = document.createElement('div');
                setRow.className = 'set-row';
                setRow.dataset.setIndex = i;

                const setLabel = document.createElement('label');
                setLabel.textContent = `Set ${i + 1}:`;
                setLabel.htmlFor = `weight-${exerciseIndex}-${i}`;
                setRow.appendChild(setLabel);

                const weightInput = document.createElement('input');
                weightInput.type = 'number';
                weightInput.id = `weight-${exerciseIndex}-${i}`;
                weightInput.name = `weight-${exerciseIndex}-${i}`;
                weightInput.placeholder = 'Peso (kg)';
                weightInput.min = "0";
                weightInput.step = "0.5";
                setRow.appendChild(weightInput);

                const repsInput = document.createElement('input');
                repsInput.type = 'number';
                repsInput.id = `reps-${exerciseIndex}-${i}`;
                repsInput.name = `reps-${exerciseIndex}-${i}`;
                repsInput.placeholder = 'Reps';
                repsInput.min = "0";
                setRow.appendChild(repsInput);

                exerciseBlock.appendChild(setRow);
            }
        } else {
            const infoPara = document.createElement('p');
            infoPara.textContent = "(No se requiere entrada de peso/reps para este item)";
            infoPara.style.fontSize = '0.9em';
            infoPara.style.color = '#666';
            exerciseBlock.appendChild(infoPara);
        }

        const notesLabel = document.createElement('label');
        notesLabel.textContent = "Notas (opcional):";
        notesLabel.htmlFor = `notes-${exerciseIndex}`;
        notesLabel.style.marginTop = '10px';
        exerciseBlock.appendChild(notesLabel);

        const notesTextarea = document.createElement('textarea');
        notesTextarea.id = `notes-${exerciseIndex}`;
        notesTextarea.name = `notes-${exerciseIndex}`;
        notesTextarea.placeholder = 'Añade notas sobre este ejercicio...';
        notesTextarea.className = 'exercise-notes';
        exerciseBlock.appendChild(notesTextarea);

        exerciseListContainer.appendChild(exerciseBlock);
    });

    showView(sessionView);
}

async function saveSessionData(event) {
    event.preventDefault();
    if (!currentWorkoutDayId || !currentUser) {
        alert("Error: No se ha seleccionado un día o no has iniciado sesión.");
        return;
    }

    const workout = workoutRoutine[currentWorkoutDayId];
    const sessionData = {
        fecha: Timestamp.now(),
        diaEntrenamiento: currentWorkoutDayId,
        nombreEntrenamiento: workout.name,
        userId: currentUser.uid, // Associate data with the user
        ejercicios: []
    };

    const exerciseBlocks = exerciseListContainer.querySelectorAll('.exercise-block');

    exerciseBlocks.forEach((block, exerciseIndex) => {
        const exercise = workout.exercises[exerciseIndex];
        const exerciseEntry = {
            nombreEjercicio: exercise.name,
            sets: [],
            notasEjercicio: block.querySelector(`textarea[name="notes-${exerciseIndex}"]`).value || ''
        };

        const setRows = block.querySelectorAll('.set-row');
        if (setRows.length > 0) {
            setRows.forEach((row, setIndex) => {
                const weightInput = row.querySelector(`input[name="weight-${exerciseIndex}-${setIndex}"]`);
                const repsInput = row.querySelector(`input[name="reps-${exerciseIndex}-${setIndex}"]`);

                const weight = parseFloat(weightInput.value);
                const reps = parseInt(repsInput.value, 10);

                if (!isNaN(weight) && !isNaN(reps) && weight >= 0 && reps >= 0) {
                    exerciseEntry.sets.push({ peso: weight, reps: reps });
                } else if (weightInput.value || repsInput.value) {
                    console.warn(`Set ${setIndex + 1} for ${exercise.name} has incomplete data and was not saved.`);
                }
            });
        }

        sessionData.ejercicios.push(exerciseEntry);
    });

    const exercisesToSave = sessionData.ejercicios.filter(ex => ex.sets.length > 0 || ex.notasEjercicio.trim() !== '');

    if (exercisesToSave.length === 0) {
        alert("No se registraron datos (peso/reps o notas) para ningún ejercicio. Introduce datos o notas para guardar la sesión.");
        return;
    }

    sessionData.ejercicios = exercisesToSave;

    console.log("Saving session data for user:", currentUser.uid, sessionData);

    const saveButton = sessionForm.querySelector('#save-session-btn');
    saveButton.disabled = true;
    saveButton.textContent = 'Guardando...';

    try {
        const userSessionsCollectionRef = collection(db, "users", currentUser.uid, "sesiones_entrenamiento");
        const docRef = await addDoc(userSessionsCollectionRef, sessionData);
        console.log("Document written with ID: ", docRef.id);
        alert("¡Sesión guardada con éxito!");
        sessionForm.reset();
        currentWorkoutDayId = null;
        showView(dashboardView);
    } catch (e) {
        console.error("Error adding document: ", e);
        alert("Error al guardar la sesión. Por favor, inténtalo de nuevo.");
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = 'Guardar Sesión';
    }
}

async function renderHistoryView() {
    if (!currentUser) {
        historyList.innerHTML = '<li>Debes iniciar sesión para ver tu historial.</li>';
        showView(historyView);
        return;
    }

    historyList.innerHTML = '<li>Cargando historial...</li>';
    showView(historyView);

    try {
        const userSessionsCollectionRef = collection(db, "users", currentUser.uid, "sesiones_entrenamiento");
        const q = query(userSessionsCollectionRef, orderBy("fecha", "desc"));
        const querySnapshot = await getDocs(q);

        historyList.innerHTML = '';

        if (querySnapshot.empty) {
            historyList.innerHTML = '<li>No hay sesiones guardadas todavía.</li>';
            return;
        }

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const listItem = document.createElement('li');
            const sessionDate = data.fecha.toDate();
            listItem.textContent = `${formatDate(sessionDate)} - ${data.nombreEntrenamiento || data.diaEntrenamiento}`;
            listItem.dataset.docId = doc.id;

            listItem.addEventListener('click', () => {
                alert(`Detalles para la sesión ${doc.id} (próximamente):
${JSON.stringify(data, null, 2)}`);
            });

            historyList.appendChild(listItem);
        });
    } catch (error) {
        console.error("Error fetching history:", error);
        historyList.innerHTML = '<li>Error al cargar el historial.</li>';
    }
}

// --- Auth Functions ---

async function handleEmailSignup() {
    clearAuthError();
    const email = emailInput.value;
    const password = passwordInput.value;
    if (!email || !password) {
        displayAuthError("Por favor, introduce email y contraseña.");
        return;
    }
    if (password.length < 6) {
        displayAuthError("La contraseña debe tener al menos 6 caracteres.");
        return;
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        console.log("User signed up:", userCredential.user);
    } catch (error) {
        console.error("Signup error:", error);
        displayAuthError(getFriendlyAuthErrorMessage(error));
    }
}

async function handleEmailLogin() {
    clearAuthError();
    const email = emailInput.value;
    const password = passwordInput.value;
    if (!email || !password) {
        displayAuthError("Por favor, introduce email y contraseña.");
        return;
    }

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        console.log("User logged in:", userCredential.user);
    } catch (error) {
        console.error("Login error:", error);
        displayAuthError(getFriendlyAuthErrorMessage(error));
    }
}

async function handleGoogleSignIn() {
    clearAuthError();
    try {
        const result = await signInWithPopup(auth, googleProvider);
        console.log("Google sign in successful:", result.user);
    } catch (error) {
        console.error("Google sign in error:", error);
        displayAuthError(getFriendlyAuthErrorMessage(error));
    }
}

async function handleLogout() {
    try {
        await signOut(auth);
        console.log("User logged out");
    } catch (error) {
        console.error("Logout error:", error);
        alert("Error al cerrar sesión.");
    }
}

function getFriendlyAuthErrorMessage(error) {
    switch (error.code) {
        case 'auth/invalid-email':
            return "El formato del email no es válido.";
        case 'auth/user-disabled':
            return "Esta cuenta de usuario ha sido deshabilitada.";
        case 'auth/user-not-found':
            return "No se encontró ningún usuario con este email.";
        case 'auth/wrong-password':
            return "La contraseña es incorrecta.";
        case 'auth/email-already-in-use':
            return "Este email ya está registrado. Intenta iniciar sesión.";
        case 'auth/weak-password':
            return "La contraseña es demasiado débil.";
        case 'auth/operation-not-allowed':
            return "El inicio de sesión con email/contraseña no está habilitado.";
        case 'auth/popup-closed-by-user':
            return "Has cerrado la ventana de inicio de sesión antes de completar el proceso.";
        case 'auth/cancelled-popup-request':
            return "Se ha cancelado la solicitud de inicio de sesión.";
        default:
            console.error("Unhandled Auth Error:", error);
            return "Ha ocurrido un error inesperado durante la autenticación.";
    }
}

// --- Event Listeners ---
daySelect.addEventListener('change', () => {
    startSessionBtn.disabled = !daySelect.value;
});

startSessionBtn.addEventListener('click', () => {
    if (daySelect.value) {
        renderSessionView(daySelect.value);
    }
});

sessionForm.addEventListener('submit', saveSessionData);

cancelSessionBtn.addEventListener('click', () => {
    if (confirm("¿Estás seguro de que quieres cancelar? Se perderán los datos no guardados.")) {
        sessionForm.reset();
        currentWorkoutDayId = null;
        showView(dashboardView);
    }
});

navDashboardBtn.addEventListener('click', () => showView(dashboardView));
navHistoryBtn.addEventListener('click', renderHistoryView);
logoutBtn.addEventListener('click', handleLogout);

// Auth Event Listeners
loginEmailBtn.addEventListener('click', handleEmailLogin);
signupEmailBtn.addEventListener('click', handleEmailSignup);
googleSigninBtn.addEventListener('click', handleGoogleSignIn);

// --- Initialization ---
function initializeAppUI(user) {
    currentUser = user;
    if (user) {
        console.log("User is logged in:", user.uid, user.email);
        userEmailEl.textContent = user.email || 'Usuario Anónimo';
        updateNavButtonsVisibility(true);
        populateDaySelector();
        currentDateEl.textContent = formatDate(new Date());
        showView(dashboardView);
    } else {
        console.log("User is logged out");
        currentUser = null;
        userEmailEl.textContent = '';
        updateNavButtonsVisibility(false);
        showView(authView);
        sessionForm.reset();
        currentWorkoutDayId = null;
        historyList.innerHTML = '';
        daySelect.innerHTML = '<option value="">-- Elige un día --</option>';
    }
    clearAuthError();
}

onAuthStateChanged(auth, (user) => {
    initializeAppUI(user);
});
