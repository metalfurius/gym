// --- Sample Workout Routine Data ---
// This will be used to populate a new user's routines if they don't have any.
export const sampleWorkoutRoutines = {
    "PPL_DAY1_PUSH": {
        "name": "Día 1: Push (Pecho, Hombro, Tríceps)",
        "exercises": [
            { "name": "Press de Banca Plano (Barra)", "type": "strength", "sets": 4, "reps": "6-10", "duration": "", "notes": "Principal de pecho" },
            { "name": "Press Inclinado (Mancuernas)", "type": "strength", "sets": 3, "reps": "8-12", "duration": "", "notes": "Pecho superior" },
            { "name": "Press Militar (Barra/Mancuernas)", "type": "strength", "sets": 3, "reps": "8-12", "duration": "", "notes": "Hombro frontal/medio" },
            { "name": "Elevaciones Laterales (Mancuernas/Polea)", "type": "strength", "sets": 4, "reps": "10-15", "duration": "", "notes": "Hombro lateral" },
            { "name": "Fondos en Paralelas (o Máquina)", "type": "strength", "sets": 3, "reps": "Fallo / 8-12", "duration": "", "notes": "Pecho inferior y tríceps" },
            { "name": "Extensiones Tríceps (Polea Alta, Barra/Cuerda)", "type": "strength", "sets": 3, "reps": "10-15", "duration": "", "notes": "Tríceps" },
            { "name": "Cardio Push", "type": "cardio", "sets": "", "reps": "", "duration": "10-15 min HIIT / 20-25 min LISS", "notes": "Priorizar según recuperación" }
        ]
    },
    "PPL_DAY2_PULL": {
        "name": "Día 2: Pull (Espalda, Bíceps, Hombro Posterior)",
        "exercises": [
            { "name": "Dominadas (o Jalón al Pecho)", "type": "strength", "sets": 4, "reps": "6-10 / Fallo", "duration": "", "notes": "Principal de espalda (amplitud)" },
            { "name": "Remo con Barra (Pendlay/Yates)", "type": "strength", "sets": 3, "reps": "8-12", "duration": "", "notes": "Espalda (grosor)" },
            { "name": "Remo Sentado (Máquina/Cable, Agarre Estrecho)", "type": "strength", "sets": 3, "reps": "10-15", "duration": "", "notes": "Espalda media/baja" },
            { "name": "Face Pulls", "type": "strength", "sets": 3, "reps": "12-18", "duration": "", "notes": "Hombro posterior y manguito rotador" },
            { "name": "Curl con Barra (Recta/Z)", "type": "strength", "sets": 3, "reps": "8-12", "duration": "", "notes": "Bíceps (masa)" },
            { "name": "Curl Martillo (Mancuernas)", "type": "strength", "sets": 3, "reps": "10-12", "duration": "", "notes": "Bíceps (braquial)" },
            { "name": "Cardio Pull", "type": "cardio", "sets": "", "reps": "", "duration": "15-25 min LISS", "notes": "" }
        ]
    },
    "PPL_DAY3_LEGS": {
        "name": "Día 3: Legs (Piernas + Abdominales)",
        "exercises": [
            { "name": "Sentadilla Hack (o Libre)", "type": "strength", "sets": 4, "reps": "8-12", "duration": "", "notes": "Principal de cuádriceps y glúteo" },
            { "name": "Peso Muerto Rumano (Mancuernas/Barra)", "type": "strength", "sets": 4, "reps": "10-12", "duration": "", "notes": "Isquiotibiales y glúteo" },
            { "name": "Extensiones Cuádriceps (Máquina)", "type": "strength", "sets": 3, "reps": "12-15", "duration": "", "notes": "Aislamiento cuádriceps" },
            { "name": "Curl Femoral Sentado (Máquina)", "type": "strength", "sets": 3, "reps": "12-15", "duration": "", "notes": "Aislamiento isquiotibiales" },
            { "name": "Elevación Talones (De pie/Sentado)", "type": "strength", "sets": 4, "reps": "15-25", "duration": "", "notes": "Gemelos" },
            { "name": "Elevaciones de Piernas Colgado (o Suelo)", "type": "strength", "sets": 3, "reps": "Fallo", "duration": "", "notes": "Abdominales inferiores" },
            { "name": "Crunches en Polea Alta (o con peso)", "type": "strength", "sets": 3, "reps": "12-15", "duration": "", "notes": "Abdominales superiores" },
            { "name": "Cardio Legs", "type": "cardio", "sets": "", "reps": "", "duration": "15-20 min LISS (Opcional)", "notes": "Escuchar al cuerpo" }
        ]
    },
    "PPL_DAY4_ARM_CHEST": {
        "name": "Día 4: Brazo + Pecho (Énfasis Brazos)",
        "exercises": [
            { "name": "Aperturas Inclinadas (Mancuernas/Cruces Polea)", "type": "strength", "sets": 3, "reps": "12-15", "duration": "", "notes": "Pecho (estiramiento y bombeo)" },
            { "name": "Press Plano (Mancuernas, ligero-moderado)", "type": "strength", "sets": 3, "reps": "10-15", "duration": "", "notes": "Pecho (bombeo)" },
            { "name": "Curl Inclinado (Mancuernas)", "type": "strength", "sets": 3, "reps": "10-12", "duration": "", "notes": "Bíceps (cabeza larga)" },
            { "name": "Curl Concentrado (Mancuerna/Polea Unilateral)", "type": "strength", "sets": 3, "reps": "12-15 / brazo", "duration": "", "notes": "Bíceps (pico)" },
            { "name": "Press Francés (Barra Z/Mancuernas)", "type": "strength", "sets": 3, "reps": "10-12", "duration": "", "notes": "Tríceps (cabeza larga)" },
            { "name": "Extensiones Tríceps sobre Cabeza (Mancuerna 2 manos/Unilateral)", "type": "strength", "sets": 3, "reps": "12-15", "duration": "", "notes": "Tríceps (cabeza larga, estiramiento)" },
            { "name": "Cardio Brazo+Pecho", "type": "cardio", "sets": "", "reps": "", "duration": "10-15 min HIIT / 20-25 min LISS", "notes": "" }
        ]
    },
    "PPL_DAY5_ARM_BACK": {
        "name": "Día 5: Brazo + Espalda (Énfasis Brazos)",
        "exercises": [
            { "name": "Pull-over (Polea Alta/Mancuerna)", "type": "strength", "sets": 3, "reps": "12-15", "duration": "", "notes": "Dorsal y serrato (estiramiento)" },
            { "name": "Remo Unilateral (Mancuerna/Máquina)", "type": "strength", "sets": 3, "reps": "10-12 / brazo", "duration": "", "notes": "Espalda (detalle y conexión)" },
            { "name": "Curl Araña (Spider Curl, banco inclinado/predicador)", "type": "strength", "sets": 3, "reps": "10-15", "duration": "", "notes": "Bíceps (cabeza corta)" },
            { "name": "Curl Inverso (Barra/Mancuernas)", "type": "strength", "sets": 3, "reps": "12-15", "duration": "", "notes": "Braquial y antebrazo" },
            { "name": "Press Cerrado en Banca (Smith/Barra)", "type": "strength", "sets": 3, "reps": "8-12", "duration": "", "notes": "Tríceps (general) y pecho interno" },
            { "name": "Patada de Tríceps (Mancuerna/Polea)", "type": "strength", "sets": 3, "reps": "12-15 / brazo", "duration": "", "notes": "Tríceps (cabeza lateral, contracción)" },
            { "name": "Pájaros (Mancuernas/Reverse Pec Deck)", "type": "strength", "sets": 3, "reps": "12-15", "duration": "", "notes": "Hombro posterior (Opcional, si se requiere)" },
            { "name": "Cardio Brazo+Espalda", "type": "cardio", "sets": "", "reps": "", "duration": "15-25 min LISS", "notes": "" }
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