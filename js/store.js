// --- Sample Workout Routine Data ---
// This will be used to populate a new user's routines if they don't have any.
export const sampleWorkoutRoutines = {
    "DAY_1_A": {
        "name": "Día 1: Espalda y Hombros (Microciclo A)",
        "exercises": [
            { "name": "Dominadas", "type": "strength", "sets": "3", "reps": "6-10", "duration": "", "notes": "Principal de fuerza. Series directas (normales)." },
            { "name": "Remo Sentado Polea", "type": "strength", "sets": "3", "reps": "8-12", "duration": "", "notes": "Enfoque en grosor. Series directas." },
            { "name": "Elevaciones Laterales Mancuernas", "type": "strength", "sets": "1+3", "reps": "15-20", "duration": "", "notes": "Prioridad hombros. 1 serie anclaje + 3 series Myo-reps igualadas." },
            { "name": "Face Pulls", "type": "strength", "sets": "2", "reps": "15-20", "duration": "", "notes": "Deltoides posterior. Series de Myo-reps (15-20 reps en la parte inicial)." },
            { "name": "Curl Barra Z", "type": "strength", "sets": "2", "reps": "10-15", "duration": "", "notes": "Bíceps. Series de Myo-reps (10-15 reps en la parte inicial)." }
        ]
    },
    "DAY_2_A": {
        "name": "Día 2: Pecho y Tríceps (Microciclo A)",
        "exercises": [
            { "name": "Press Inclinado Mancuernas", "type": "strength", "sets": "3", "reps": "8-12", "duration": "", "notes": "Principal de pecho. Series directas." },
            { "name": "Press Plano", "type": "strength", "sets": "2", "reps": "10-15", "duration": "", "notes": "Volumen seguro. Series directas." },
            { "name": "Fondos", "type": "strength", "sets": "2", "reps": "Fallo", "duration": "", "notes": "Pecho inferior y tríceps. Series de Myo-reps." },
            { "name": "Extensiones Tríceps sobre Cabeza (Cuerda)", "type": "strength", "sets": "1+2", "reps": "12-15", "duration": "", "notes": "Cabeza larga del tríceps. 1 serie anclaje + 2 series Myo-reps igualadas." }
        ]
    },
    "DAY_3_A": {
        "name": "Día 3: Piernas y Brazos (Microciclo A)",
        "exercises": [
            { "name": "Sentadilla Hack", "type": "strength", "sets": "3", "reps": "8-12", "duration": "", "notes": "Principal de cuádriceps. Series directas." },
            { "name": "Peso Muerto Rumano con Mancuernas", "type": "strength", "sets": "3", "reps": "10-15", "duration": "", "notes": "Femorales. Menos fatiga sistémica. Series directas." },
            { "name": "Extensiones de Cuádriceps", "type": "strength", "sets": "1", "reps": "20-25", "duration": "", "notes": "Serie larga de Myo-reps (20-25 reps iniciales)." },
            { "name": "Curl Femoral Sentado", "type": "strength", "sets": "1", "reps": "15-20", "duration": "", "notes": "Serie larga de Myo-reps (15-20 reps iniciales)." },
            { "name": "Curl Inclinado con Mancuernas", "type": "strength", "sets": "1+2", "reps": "10-15", "duration": "", "notes": "1 anclaje + 2 Myo-reps. Énfasis en estiramiento del bíceps." },
            { "name": "Press Francés", "type": "strength", "sets": "1+2", "reps": "10-15", "duration": "", "notes": "1 anclaje + 2 Myo-reps. Segundo estímulo de tríceps." },
            { "name": "Elevación de Talones (De Pie)", "type": "strength", "sets": "3", "reps": "15-25", "duration": "", "notes": "Series de Myo-reps." }
        ]
    },
    "DAY_4_B": {
        "name": "Día 4: Espalda y Hombros (Microciclo B)",
        "exercises": [
            { "name": "Remo con Barra Pendlay", "type": "strength", "sets": "3", "reps": "6-10", "duration": "", "notes": "Variante de fuerza. Series directas." },
            { "name": "Jalón al Pecho Supino", "type": "strength", "sets": "3", "reps": "10-15", "duration": "", "notes": "Énfasis diferente en dorsal y bíceps. Series directas." },
            { "name": "Elevaciones Laterales en Polea", "type": "strength", "sets": "1+3", "reps": "15-20", "duration": "", "notes": "Tensión constante. 1 serie anclaje + 3 series Myo-reps igualadas." },
            { "name": "Pájaros con Mancuernas (en banco inclinado)", "type": "strength", "sets": "2", "reps": "12-18", "duration": "", "notes": "Deltoides posterior. Series de Myo-reps." },
            { "name": "Curl Martillo", "type": "strength", "sets": "2", "reps": "10-15", "duration": "", "notes": "Enfoque en braquial. Series de Myo-reps." }
        ]
    },
    "DAY_5_B": {
        "name": "Día 5: Pecho y Tríceps (Microciclo B)",
        "exercises": [
            { "name": "Press Plano", "type": "strength", "sets": "3", "reps": "6-10", "duration": "", "notes": "Clásico de fuerza. Series directas." },
            { "name": "Aperturas Polea (de abajo hacia arriba)", "type": "strength", "sets": "2", "reps": "12-15", "duration": "", "notes": "Enfoque pectoral superior. Series directas." },
            { "name": "Fondos", "type": "strength", "sets": "2", "reps": "Fallo", "duration": "", "notes": "Acabado metabólico. Series de Myo-reps." },
            { "name": "Press Cerrado", "type": "strength", "sets": "1+2", "reps": "10-15", "duration": "", "notes": "Compuesto para tríceps. 1 serie anclaje + 2 series Myo-reps." }
        ]
    },
    "DAY_6_B": {
        "name": "Día 6: Piernas y Brazos (Microciclo B)",
        "exercises": [
            { "name": "Prensa de Piernas (pies bajos)", "type": "strength", "sets": "3", "reps": "10-15", "duration": "", "notes": "Énfasis en cuádriceps. Series directas." },
            { "name": "Curl Femoral Tumbado", "type": "strength", "sets": "3", "reps": "12-15", "duration": "", "notes": "Variante para isquios. Series directas." },
            { "name": "Extensiones de Cuádriceps", "type": "strength", "sets": "1", "reps": "20+", "duration": "", "notes": "Serie larga de Myo-reps (20+ pasos iniciales). Glúteos y cuádriceps." },
            { "name": "Curl Araña", "type": "strength", "sets": "1+2", "reps": "12-15", "duration": "", "notes": "1 anclaje + 2 Myo-reps. Énfasis en cabeza corta del bíceps." },
            { "name": "Extensiones Tríceps en Polea (Barra)", "type": "strength", "sets": "1+2", "reps": "12-15", "duration": "", "notes": "1 anclaje + 2 Myo-reps. Bombeo final para tríceps." },
            { "name": "Elevación de Talones (Sentado)", "type": "strength", "sets": "3", "reps": "15-25", "duration": "", "notes": "Énfasis en el sóleo. Series de Myo-reps." }
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