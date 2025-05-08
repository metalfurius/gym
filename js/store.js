// --- Workout Routine Data ---
export const workoutRoutine = {
    "A1": {
        name: "A1: Pull",
        exercises: [
            { name: "Dominadas", sets: 4, reps: "6-10" },
            { name: "Remo con Barra", sets: 3, reps: "8-12" },
            { name: "Remo Gironda (Polea baja)", sets: 3, reps: "10-15" },
            { name: "Face Pull", sets: 4, reps: "12-15" },
            { name: "Curl con Barra Z", sets: 3, reps: "8-12" },
            { name: "Curl Martillo", sets: 3, reps: "10-12" },
            { name: "Cardio Post-Entreno", sets: 1, reps: "15-25 min LISS / 10-15 min HIIT", type: "cardio" }
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
            { name: "Cardio Post-Entreno", sets: 1, reps: "15-25 min LISS / 10-15 min HIIT", type: "cardio" }
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
            { name: "Cardio Post-Entreno", sets: 1, reps: "(Opcional) 15-25 min LISS / 10-15 min HIIT", type: "cardio" }
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
            { name: "Cardio Post-Entreno", sets: 1, reps: "15-25 min LISS / 10-15 min HIIT", type: "cardio" }
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
            { name: "Cardio Post-Entreno", sets: 1, reps: "15-25 min LISS / 10-15 min HIIT", type: "cardio" }
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
            { name: "Cardio Post-Entreno", sets: 1, reps: "15-25 min LISS / 10-15 min HIIT", type: "cardio" }
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
            { name: "Cardio Post-Entreno", sets: 1, reps: "(Opcional) 15-25 min LISS / 10-15 min HIIT", type: "cardio" }
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
            { name: "Cardio Post-Entreno", sets: 1, reps: "15-25 min LISS / 10-15 min HIIT", type: "cardio" }
        ]
    }
};

const IN_PROGRESS_SESSION_KEY = 'inProgressGymSession';

export function getWorkoutById(dayId) {
    return workoutRoutine[dayId];
}

export function saveInProgressSession(dayId, data) {
    const sessionToStore = {
        dayId: dayId,
        data: data,
        timestamp: Date.now()
    };
    localStorage.setItem(IN_PROGRESS_SESSION_KEY, JSON.stringify(sessionToStore));
}

export function loadInProgressSession() {
    const storedSession = localStorage.getItem(IN_PROGRESS_SESSION_KEY);
    if (storedSession) {
        const parsed = JSON.parse(storedSession);
        // Optional: Add logic to expire old in-progress sessions, e.g., after 24 hours
        // const oneDay = 24 * 60 * 60 * 1000;
        // if (Date.now() - parsed.timestamp > oneDay) {
        //     clearInProgressSession();
        //     return null;
        // }
        return parsed;
    }
    return null;
}

export function clearInProgressSession() {
    localStorage.removeItem(IN_PROGRESS_SESSION_KEY);
}