// --- Sample Workout Routine Data ---
// This will be used to populate a new user's routines if they don't have any.
export const sampleWorkoutRoutines = {
    "A1_sample": { // Added _sample to differentiate from potential user IDs
        name: "A1: Pull (Muestra)",
        exercises: [
            { name: "Dominadas", type: "strength", sets: 4, reps: "6-10", duration: "" },
            { name: "Remo con Barra", type: "strength", sets: 3, reps: "8-12", duration: "" },
            { name: "Remo Gironda (Polea baja)", type: "strength", sets: 3, reps: "10-15", duration: "" },
            { name: "Face Pull", type: "strength", sets: 4, reps: "12-15", duration: "" },
            { name: "Curl con Barra Z", type: "strength", sets: 3, reps: "8-12", duration: "" },
            { name: "Curl Martillo", type: "strength", sets: 3, reps: "10-12", duration: "" },
            { name: "Cardio Ligero", type: "cardio", sets: 0, reps: "", duration: "15-25 min LISS" }
        ]
    },
    "A2_sample": {
        name: "A2: Push (Muestra)",
        exercises: [
            { name: "Press de Banca Plano (Barra)", type: "strength", sets: 3, reps: "6-10", duration: "" },
            { name: "Press Inclinado Mancuernas", type: "strength", sets: 3, reps: "8-12", duration: "" },
            { name: "Fondos Paralelas", type: "strength", sets: 3, reps: "Fallo", duration: "" },
            { name: "Elevaciones Laterales Mancuernas", type: "strength", sets: 4, reps: "10-15", duration: "" },
            { name: "Press Francés", type: "strength", sets: 3, reps: "10-12", duration: "" },
            { name: "Extensiones Tríceps Polea Alta (Cuerda)", type: "strength", sets: 3, reps: "12-15", duration: "" },
            { name: "HIIT Cardio", type: "cardio", sets: 0, reps: "", duration: "10-15 min HIIT" }
        ]
    },
    "A3_sample": {
        name: "A3: Piernas + Abs (Muestra)",
        exercises: [
            { name: "Sentadilla Hack", type: "strength", sets: 4, reps: "8-12", duration: "" },
            { name: "Peso Muerto Rumano", type: "strength", sets: 4, reps: "10-12", duration: "" },
            { name: "Extensiones Cuádriceps", type: "strength", sets: 3, reps: "12-15", duration: "" },
            { name: "Curl Femoral Tumbado", type: "strength", sets: 3, reps: "12-15", duration: "" },
            { name: "Elevación Talones (De pie/Sentado)", type: "strength", sets: 4, reps: "15-20", duration: "" },
            { name: "Elevaciones Piernas (Colgado/Tumbado)", type: "strength", sets: 3, reps: "Fallo", duration: "" },
            { name: "Crunch Polea Alta", type: "strength", sets: 3, reps: "12-15", duration: "" },
            { name: "Cardio Opcional", type: "cardio", sets: 0, reps: "", duration: "15-20 min" }
        ]
    },
    "A4_sample": {
        name: "A4: V-Taper Focus (Muestra)",
        exercises: [
            { name: "Jalón al Pecho (Agarre Ancho)", type: "strength", sets: 4, reps: "10-12", duration: "" },
            { name: "Remo Sentado Polea (Agarre Abierto)", type: "strength", sets: 3, reps: "10-15", duration: "" },
            { name: "Pull-over Polea Alta", type: "strength", sets: 3, reps: "12-15", duration: "" },
            { name: "Elevaciones Laterales Polea Baja (Unilateral)", type: "strength", sets: 4, reps: "12-15 / brazo", duration: "" },
            { name: "Pájaros con Mancuernas", type: "strength", sets: 3, reps: "12-15", duration: "" },
            { name: "Encogimientos (Mancuernas/Barra)", type: "strength", sets: 3, reps: "10-15", duration: "" },
            { name: "Cardio Post-Entreno", type: "cardio", sets: 1, reps: "15-25 min LISS / 10-15 min HIIT", duration: "15-25 min LISS / 10-15 min HIIT" }
        ]
    },
    "B1_sample": {
        name: "B1: Pull (Muestra)",
        exercises: [
            { name: "Remo T Barra", type: "strength", sets: 4, reps: "6-10", duration: "" },
            { name: "Jalón Pecho (Neutro/Supino)", type: "strength", sets: 3, reps: "8-12", duration: "" },
            { name: "Remo Mancuerna (Serrucho)", type: "strength", sets: 3, reps: "8-12 / brazo", duration: "" },
            { name: "Reverse Pec Deck", type: "strength", sets: 4, reps: "12-15", duration: "" },
            { name: "Curl Inclinado Mancuernas", type: "strength", sets: 3, reps: "10-12", duration: "" },
            { name: "Curl Concentrado / Polea Baja", type: "strength", sets: 3, reps: "12-15", duration: "" },
            { name: "Cardio Post-Entreno", type: "cardio", sets: 1, reps: "15-25 min LISS / 10-15 min HIIT", duration: "15-25 min LISS / 10-15 min HIIT" }
        ]
    },
    "B2_sample": {
        name: "B2: Push (Muestra)",
        exercises: [
            { name: "Press Militar Barra", type: "strength", sets: 3, reps: "6-10", duration: "" },
            { name: "Press Plano Mancuernas", type: "strength", sets: 3, reps: "8-12", duration: "" },
            { name: "Aperturas Inclinadas / Cruces Polea Baja", type: "strength", sets: 3, reps: "12-15", duration: "" },
            { name: "Elevaciones Laterales Mancuernas", type: "strength", sets: 4, reps: "12-15", duration: "" },
            { name: "Press Cerrado Banca", type: "strength", sets: 3, reps: "8-12", duration: "" },
            { name: "Extensiones Tríceps Sobre Cabeza", type: "strength", sets: 3, reps: "12-15", duration: "" },
            { name: "Cardio Post-Entreno", type: "cardio", sets: 1, reps: "15-25 min LISS / 10-15 min HIIT", duration: "15-25 min LISS / 10-15 min HIIT" }
        ]
    },
    "B3_sample": {
        name: "B3: Piernas + Abdominales (Muestra)",
        exercises: [
            { name: "Prensa Piernas", type: "strength", sets: 4, reps: "10-15", duration: "" },
            { name: "Curl Femoral Sentado", type: "strength", sets: 4, reps: "12-15", duration: "" },
            { name: "Sentadilla Búlgara / Zancadas", type: "strength", sets: 3, reps: "10-12 / pierna", duration: "" },
            { name: "Hip Thrust", type: "strength", sets: 3, reps: "10-12", duration: "" },
            { name: "Elevación Talones (Sentado/Prensa)", type: "strength", sets: 4, reps: "15-25", duration: "" },
            { name: "Plancha", type: "strength", sets: 3, reps: "45-60 seg", duration: "" },
            { name: "Russian Twist / Leñador Polea", type: "strength", sets: 3, reps: "15-20", duration: "" },
            { name: "Cardio Post-Entreno", type: "cardio", sets: 1, reps: "(Opcional) 15-25 min LISS / 10-15 min HIIT", duration: "(Opcional) 15-25 min LISS / 10-15 min HIIT" }
        ]
    },
    "B4_sample": {
        name: "B4: V-Taper Focus (Muestra)",
        exercises: [
            { name: "Dominadas Asistidas / Jalón Pecho", type: "strength", sets: 4, reps: "10-12", duration: "" },
            { name: "Remo Alto a la Cara (Face Pull Ancho)", type: "strength", sets: 3, reps: "12-15", duration: "" },
            { name: "Elevaciones Laterales (Máquina/Cable)", type: "strength", sets: 4, reps: "12-15", duration: "" },
            { name: "Elevaciones Frontales (Disco/Mancuerna)", type: "strength", sets: 3, reps: "10-12", duration: "" },
            { name: "Curl Bíceps Polea Alta", type: "strength", sets: "2-3", reps: "12-15", duration: "" },
            { name: "Extensión Tríceps Polea (Tras nuca)", type: "strength", sets: "2-3", reps: "12-15", duration: "" },
            { name: "Cardio Post-Entreno", type: "cardio", sets: 1, reps: "15-25 min LISS / 10-15 min HIIT", duration: "15-25 min LISS / 10-15 min HIIT" }
        ]
    }
};

const IN_PROGRESS_SESSION_KEY = 'inProgressGymSession';

// getWorkoutById is no longer needed here as routines are user-specific and fetched from Firestore.

export function saveInProgressSession(routineId, data) {
    const sessionToStore = {
        routineId: routineId, // Changed from dayId
        data: data,
        timestamp: Date.now()
    };
    localStorage.setItem(IN_PROGRESS_SESSION_KEY, JSON.stringify(sessionToStore));
}

export function loadInProgressSession() {
    const storedSession = localStorage.getItem(IN_PROGRESS_SESSION_KEY);
    if (storedSession) {
        const parsed = JSON.parse(storedSession);
        // Optional: Add logic to expire old in-progress sessions
        return parsed;
    }
    return null;
}

export function clearInProgressSession() {
    localStorage.removeItem(IN_PROGRESS_SESSION_KEY);
}