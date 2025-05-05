// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, collection, addDoc, Timestamp, query, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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
const sesionesCollectionRef = collection(db, "sesiones_entrenamiento");

// --- Workout Routine Data ---
const workoutRoutine = {
    "A1": {
        name: "A1: Pull",
        exercises: [
            { name: "Dominadas", sets: 4, reps: "6-10" },
            { name: "Remo Barra", sets: 4, reps: "8-12" },
            { name: "Remo Gironda", sets: 3, reps: "10-15" },
            { name: "Face Pull", sets: 3, reps: "15-20" },
            { name: "Curl Barra Z", sets: 4, reps: "8-12" },
            { name: "Curl Martillo", sets: 3, reps: "10-15" }
        ]
    },
    "A2": {
        name: "A2: Push",
        exercises: [
            { name: "Press Banca Barra", sets: 4, reps: "6-10" },
            { name: "Press Inclinado Manc", sets: 4, reps: "8-12" },
            { name: "Fondos", sets: 3, reps: "Al fallo" },
            { name: "Elev. Laterales Manc", sets: 4, reps: "12-15" },
            { name: "Press Francés", sets: 3, reps: "10-15" },
            { name: "Ext. Tríceps Polea", sets: 3, reps: "12-15" }
        ]
    },
    "A3": {
        name: "A3: Piernas + Abs",
        exercises: [
            { name: "Sentadilla Hack", sets: 4, reps: "8-12" },
            { name: "Peso Muerto Rumano", sets: 4, reps: "10-12" },
            { name: "Ext. Cuádriceps", sets: 3, reps: "12-15" },
            { name: "Curl Femoral", sets: 3, reps: "12-15" },
            { name: "Elev. Talones", sets: 4, reps: "15-20" },
            { name: "Elev. Piernas", sets: 3, reps: "Al fallo" },
            { name: "Crunch Polea", sets: 3, reps: "15-20" }
        ]
    },
    "A4": {
        name: "A4: V-Taper Focus",
        exercises: [
            { name: "Jalón Pecho Ancho", sets: 4, reps: "8-12" },
            { name: "Remo Sentado Abierto", sets: 4, reps: "10-15" },
            { name: "Pull-over Polea", sets: 3, reps: "12-15" },
            { name: "Elev. Lat Polea Uni", sets: 3, reps: "12-15" },
            { name: "Pájaros Manc", sets: 3, reps: "15-20" },
            { name: "Encogimientos", sets: 4, reps: "10-15" }
        ]
    },
    "B1": {
        name: "B1: Pull",
        exercises: [
            { name: "Remo T", sets: 4, reps: "6-10" },
            { name: "Jalón Neutro/Supino", sets: 4, reps: "8-12" },
            { name: "Remo Mancuerna", sets: 3, reps: "10-12" },
            { name: "Reverse Pec Deck", sets: 3, reps: "15-20" },
            { name: "Curl Inclinado", sets: 4, reps: "10-12" },
            { name: "Curl Concentrado", sets: 3, reps: "12-15" }
        ]
    },
    "B2": {
        name: "B2: Push",
        exercises: [
            { name: "Press Militar Barra", sets: 4, reps: "6-10" },
            { name: "Press Plano Manc", sets: 4, reps: "8-12" },
            { name: "Aperturas Inclinadas", sets: 3, reps: "12-15" },
            { name: "Elev. Laterales Manc", sets: 4, reps: "12-15" },
            { name: "Press Cerrado", sets: 3, reps: "8-12" },
            { name: "Ext. Tríceps Cabeza", sets: 3, reps: "10-15" }
        ]
    },
    "B3": {
        name: "B3: Piernas + Abs",
        exercises: [
            { name: "Prensa", sets: 4, reps: "10-15" },
            { name: "Curl Femoral Sentado", sets: 4, reps: "10-15" },
            { name: "Sentadilla Búlgara/Zancadas", sets: 3, reps: "10-12" },
            { name: "Hip Thrust", sets: 4, reps: "8-12" },
            { name: "Elev. Talones Sentado", sets: 4, reps: "15-20" },
            { name: "Plancha", sets: 3, reps: "Al fallo" },
            { name: "Russian Twist", sets: 3, reps: "15-20" }
        ]
    },
    "B4": {
        name: "B4: V-Taper Focus",
        exercises: [
            { name: "Dominadas Asist/Jalón", sets: 4, reps: "8-12" },
            { name: "Remo Alto Cara", sets: 4, reps: "10-15" },
            { name: "Elev. Lat Máquina/Cable", sets: 3, reps: "12-15" },
            { name: "Elev. Frontales", sets: 3, reps: "12-15" },
            { name: "Curl Bíceps Polea Alta", sets: 3, reps: "12-15" },
            { name: "Ext. Tríceps Tras Nuca", sets: 3, reps: "10-15" }
        ]
    }
};

// --- DOM Elements ---
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

// --- State ---
let currentWorkoutDayId = null;

// --- Functions ---

function showView(viewToShow) {
    dashboardView.classList.add('hidden');
    sessionView.classList.add('hidden');
    historyView.classList.add('hidden');
    viewToShow.classList.remove('hidden');
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
        target.textContent = `Objetivo: ${exercise.sets} sets x ${exercise.reps} reps`;
        exerciseBlock.appendChild(target);

        for (let i = 0; i < exercise.sets; i++) {
            const setRow = document.createElement('div');
            setRow.className = 'set-row';
            setRow.dataset.setIndex = i;

            const setLabel = document.createElement('label');
            setLabel.textContent = `Set ${i + 1}:`;
            setLabel.htmlFor = `weight-${exerciseIndex}-${i}`; // Accessibility
            setRow.appendChild(setLabel);

            const weightInput = document.createElement('input');
            weightInput.type = 'number';
            weightInput.id = `weight-${exerciseIndex}-${i}`;
            weightInput.name = `weight-${exerciseIndex}-${i}`;
            weightInput.placeholder = 'Peso (kg)';
            weightInput.min = "0";
            weightInput.step = "0.5"; // Allow .5 increments
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

        // Optional Notes Field
        const notesLabel = document.createElement('label');
        notesLabel.textContent = "Notas (opcional):";
        notesLabel.htmlFor = `notes-${exerciseIndex}`;
        notesLabel.style.marginTop = '10px'; // Add some space
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
    event.preventDefault(); // Prevent default form submission
    if (!currentWorkoutDayId) return;

    const workout = workoutRoutine[currentWorkoutDayId];
    const sessionData = {
        fecha: Timestamp.now(),
        diaEntrenamiento: currentWorkoutDayId,
        nombreEntrenamiento: workout.name, // Store the name for easier display
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
        setRows.forEach((row, setIndex) => {
            const weightInput = row.querySelector(`input[name="weight-${exerciseIndex}-${setIndex}"]`);
            const repsInput = row.querySelector(`input[name="reps-${exerciseIndex}-${setIndex}"]`);

            // Only add set if both weight and reps have values
            const weight = parseFloat(weightInput.value);
            const reps = parseInt(repsInput.value, 10);

            if (!isNaN(weight) && !isNaN(reps) && weight >= 0 && reps >= 0) {
                 exerciseEntry.sets.push({ peso: weight, reps: reps });
            } else if (weightInput.value || repsInput.value) {
                // Optionally warn user about incomplete set data, or just skip
                console.warn(`Set ${setIndex + 1} for ${exercise.name} has incomplete data and was not saved.`);
            }
        });

        // Only add exercise if at least one set was recorded
        if (exerciseEntry.sets.length > 0) {
            sessionData.ejercicios.push(exerciseEntry);
        }
    });

    if (sessionData.ejercicios.length === 0) {
        alert("No se registraron datos para ningún ejercicio. Introduce peso y repeticiones para al menos un set.");
        return;
    }

    console.log("Saving session data:", sessionData);

    try {
        const docRef = await addDoc(sesionesCollectionRef, sessionData);
        console.log("Document written with ID: ", docRef.id);
        alert("¡Sesión guardada con éxito!");
        sessionForm.reset(); // Clear the form
        currentWorkoutDayId = null;
        showView(dashboardView); // Go back to dashboard after saving
        // Optionally, refresh history view if it was the active view before session
        // renderHistoryView();
    } catch (e) {
        console.error("Error adding document: ", e);
        alert("Error al guardar la sesión. Por favor, inténtalo de nuevo.");
    }
}

async function renderHistoryView() {
    historyList.innerHTML = '<li>Cargando historial...</li>'; // Show loading state
    showView(historyView);

    try {
        const q = query(sesionesCollectionRef, orderBy("fecha", "desc"));
        const querySnapshot = await getDocs(q);

        historyList.innerHTML = ''; // Clear loading/previous items

        if (querySnapshot.empty) {
            historyList.innerHTML = '<li>No hay sesiones guardadas todavía.</li>';
            return;
        }

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const listItem = document.createElement('li');
            // Format the timestamp
            const sessionDate = data.fecha.toDate(); // Convert Firebase Timestamp to JS Date
            listItem.textContent = `${formatDate(sessionDate)} - ${data.nombreEntrenamiento || data.diaEntrenamiento}`;
            listItem.dataset.docId = doc.id; // Store doc ID for potential detail view

            // TODO: Add event listener to show session details on click
            listItem.addEventListener('click', () => {
                alert(`Detalles para la sesión ${doc.id} (próximamente):
${JSON.stringify(data, null, 2)}`);
                // Implement detailed view rendering here
            });

            historyList.appendChild(listItem);
        });
    } catch (error) {
        console.error("Error fetching history:", error);
        historyList.innerHTML = '<li>Error al cargar el historial.</li>';
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

// --- Initialization ---
function initializeAppUI() {
    currentDateEl.textContent = formatDate(new Date());
    populateDaySelector();
    showView(dashboardView); // Start on the dashboard
}

initializeAppUI();
