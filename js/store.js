// --- Sample Workout Routine Data ---
// This will be used to populate a new user's routines if they don't have any.
export const sampleWorkoutRoutines = {
    "A1_sample": {
        name: "A1: Pull (Muestra)",
        exercises: [
            { name: "Dominadas", type: "strength", sets: 4, reps: "6-10", duration: "", notes: "" },
            { name: "Remo Máquina", type: "strength", sets: 3, reps: "8-12", duration: "", notes: "" }, // Actualizado desde "Remo con Barra"
            { name: "Remo Cables (Polea baja)", type: "strength", sets: 3, reps: "10-15", duration: "", notes: "" }, // Actualizado y especificado
            { name: "Face Pull", type: "strength", sets: 3, reps: "12-15", duration: "", notes: "" }, // Ajustado sets a 3 como en tus datos
            { name: "Curl con Barra (Polea)", type: "strength", sets: 3, reps: "8-12", duration: "", notes: "" }, // Actualizado desde "Barra Z"
            { name: "Curl Martillo", type: "strength", sets: 3, reps: "10-12", duration: "", notes: "" },
            { name: "Cardio Ligero", type: "cardio", sets: "", reps: "", duration: "15-25 min LISS", notes: "" }
        ]
    },
    "A2_sample": {
        name: "A2: Push (Muestra)",
        exercises: [
            { name: "Press de Banca Plano (Barra)", type: "strength", sets: 3, reps: "6-10", duration: "", notes: "" },
            { name: "Press Inclinado (Mancuernas)", type: "strength", sets: 3, reps: "8-12", duration: "", notes: "" }, // Especificado
            { name: "Fondos (Paralelas)", type: "strength", sets: 3, reps: "Fallo", duration: "", notes: "" }, // Especificado
            { name: "Elevaciones Laterales (Mancuernas)", type: "strength", sets: 3, reps: "10-15", duration: "", notes: "" }, // Ajustado sets a 3, especificado
            { name: "Press Francés (Barra Z)", type: "strength", sets: 3, reps: "10-12", duration: "", notes: "" }, // Actualizado
            { name: "Extensiones Tríceps (Polea Alta, Barra)", type: "strength", sets: 3, reps: "12-15", duration: "", notes: "" }, // Actualizado desde "Cuerda"
            { name: "HIIT Cardio", type: "cardio", sets: "", reps: "", duration: "10-15 min HIIT", notes: "" }
        ]
    },
    "A3_sample": {
        name: "A3: Piernas + Abs (Muestra)",
        exercises: [
            { name: "Sentadilla Hack", type: "strength", sets: 4, reps: "8-12", duration: "", notes: "" },
            { name: "Peso Muerto Rumano (Mancuernas)", type: "strength", sets: 4, reps: "10-12", duration: "", notes: "" }, // Actualizado
            { name: "Extensiones Cuádriceps (Máquina)", type: "strength", sets: 3, reps: "12-15", duration: "", notes: "" }, // Especificado
            { name: "Curl Femoral Sentado (Máquina)", type: "strength", sets: 3, reps: "12-15", duration: "", notes: "" }, // Actualizado y especificado
            { name: "Elevación Talones (Sentado)", type: "strength", sets: 3, reps: "15-20", duration: "", notes: "" }, // Actualizado
            { name: "Elevaciones Piernas (Abs)", type: "strength", sets: 3, reps: "Fallo", duration: "", notes: "" }, // Unificado
            { name: "Crunches", type: "strength", sets: 3, reps: "12-15", duration: "", notes: "" }, // Unificado
            { name: "Cardio Opcional", type: "cardio", sets: "", reps: "", duration: "15-20 min", notes: "" }
        ]
    },
    "A4_sample": {
        name: "A4: V-Taper Focus (Muestra)",
        exercises: [
            { name: "Jalón al Pecho (Máquina)", type: "strength", sets: 4, reps: "10-12", duration: "", notes: "" }, // Unificado
            { name: "Remo Sentado (Cable)", type: "strength", sets: 3, reps: "10-15", duration: "", notes: "" }, // Unificado
            { name: "Pull-over (Polea Alta)", type: "strength", sets: 3, reps: "12-15", duration: "", notes: "" }, // Especificado
            { name: "Elevaciones Laterales (Polea Baja, Unilateral)", type: "strength", sets: 4, reps: "12-15 / brazo", duration: "", notes: "" },
            { name: "Pájaros (Mancuernas)", type: "strength", sets: 3, reps: "12-15", duration: "", notes: "" }, // Especificado
            { name: "Encogimientos Trapecio (Mancuernas/Barra)", type: "strength", sets: 3, reps: "10-15", duration: "", notes: "" }, // Especificado
            { name: "Cardio Post-Entreno", type: "cardio", sets: "", reps: "", duration: "15-25 min LISS / 10-15 min HIIT", notes: "" }
        ]
    },
    "B1_sample": {
        name: "B1: Pull (Muestra)",
        exercises: [
            { name: "Remo T Barra", type: "strength", sets: 4, reps: "6-10", duration: "", notes: "" },
            { name: "Jalón al Pecho (Máquina)", type: "strength", sets: 3, reps: "8-12", duration: "", notes: "" }, // Unificado
            { name: "Remo Cables", type: "strength", sets: 3, reps: "8-12 / brazo", duration: "", notes: "" }, // Unificado desde "Remo Mancuerna"
            { name: "Reverse Pec Deck", type: "strength", sets: 4, reps: "12-15", duration: "", notes: "" },
            { name: "Curl Inclinado (Mancuernas)", type: "strength", sets: 3, reps: "10-12", duration: "", notes: "" }, // Especificado
            { name: "Curl Concentrado / Polea Baja", type: "strength", sets: 3, reps: "12-15", duration: "", notes: "" },
            { name: "Cardio Post-Entreno", type: "cardio", sets: "", reps: "", duration: "15-25 min LISS / 10-15 min HIIT", notes: "" }
        ]
    },
    "B2_sample": {
        name: "B2: Push (Muestra)",
        exercises: [
            { name: "Press Militar (Barra)", type: "strength", sets: 3, reps: "6-10", duration: "", notes: "" }, // Especificado
            { name: "Press Plano (Mancuernas)", type: "strength", sets: 3, reps: "8-12", duration: "", notes: "" }, // Especificado
            { name: "Aperturas Inclinadas / Cruces Polea Baja", type: "strength", sets: 3, reps: "12-15", duration: "", notes: "" },
            { name: "Elevaciones Laterales (Mancuernas)", type: "strength", sets: 3, reps: "12-15", duration: "", notes: "" }, // Ajustado sets a 3
            { name: "Press Cerrado (Banca)", type: "strength", sets: 3, reps: "8-12", duration: "", notes: "" }, // Especificado
            { name: "Extensiones Tríceps (Máquina)", type: "strength", sets: 3, reps: "12-15", duration: "", notes: "" }, // Actualizado desde "Sobre Cabeza"
            { name: "Cardio Post-Entreno", type: "cardio", sets: "", reps: "", duration: "15-25 min LISS / 10-15 min HIIT", notes: "" }
        ]
    },
    "B3_sample": {
        name: "B3: Piernas + Abdominales (Muestra)",
        exercises: [
            { name: "Sentadilla Hack", type: "strength", sets: 4, reps: "10-15", duration: "", notes: "" }, // Unificado desde "Hack Squat", original era "Prensa Piernas"
            { name: "Curl Femoral Sentado (Máquina)", type: "strength", sets: 4, reps: "12-15", duration: "", notes: "" }, // Unificado
            { name: "Extensiones Cuádriceps (Máquina)", type: "strength", sets: 3, reps: "10-12 / pierna", duration: "", notes: "" }, // Unificado, original era "Sentadilla Búlgara / Zancadas"
            { name: "Hip Thrust (Máquina)", type: "strength", sets: 3, reps: "10-12", duration: "", notes: "" }, // Especificado
            { name: "Elevación Talones (De pie)", type: "strength", sets: 4, reps: "15-25", duration: "", notes: "" }, // Unificado, original era "Sentado/Prensa"
            { name: "Crunches", type: "strength", sets: 3, reps: "Fallo", duration: "", notes: "" }, // Unificado, reps ajustado a tus datos (original era plancha)
            { name: "Levantamiento Piernas (Abs)", type: "strength", sets: 3, reps: "15-20", duration: "", notes: "" }, // Unificado, original era "Russian Twist / Leñador"
            { name: "Cardio Post-Entreno", type: "cardio", sets: "", reps: "", duration: "(Opcional) 15-25 min LISS / 10-15 min HIIT", notes: "" }
        ]
    },
    "B4_sample": {
        name: "B4: V-Taper Focus (Muestra)",
        exercises: [
            { name: "Dominadas Asistidas / Jalón Pecho", type: "strength", sets: 4, reps: "10-12", duration: "", notes: "" },
            { name: "Face Pull", type: "strength", sets: 3, reps: "12-15", duration: "", notes: "" }, // Unificado
            { name: "Elevaciones Laterales (Máquina)", type: "strength", sets: 4, reps: "12-15", duration: "", notes: "" }, // Unificado
            { name: "Reverse Pec Deck", type: "strength", sets: 3, reps: "10-12", duration: "", notes: "" }, // Unificado, original era "Elevaciones Frontales"
            { name: "Curl Bíceps (Polea Baja, Barra)", type: "strength", sets: 3, reps: "12-15", duration: "", notes: "" }, // Unificado, sets ajustado
            { name: "Extensiones Tríceps (Polea, Barra)", type: "strength", sets: 3, reps: "12-15", duration: "", notes: "" }, // Unificado, sets ajustado
            { name: "Cardio Post-Entreno", type: "cardio", sets: "", reps: "", duration: "15-25 min LISS / 10-15 min HIIT", notes: "" }
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