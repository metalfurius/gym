import { logger } from './utils/logger.js';

export const LANGUAGE_STORAGE_KEY = 'gym-tracker-language';
export const DEFAULT_LANGUAGE = 'es';
export const SUPPORTED_LANGUAGES = ['es', 'en'];

const LOCALES = {
    es: 'es-ES',
    en: 'en-US'
};

const dictionaries = {
    es: {
        'app.name': 'My Workout Tracker',

        'common.loading': 'Cargando...',
        'common.saving': 'Guardando...',
        'common.na': 'N/A',
        'common.days': 'dias',

        'header.language_label': 'Idioma',
        'header.language_option_es': 'ES',
        'header.language_option_en': 'EN',
        'header.theme_toggle_title': 'Cambiar tema',

        'nav.dashboard': 'Dashboard',
        'nav.manage_routines': 'Mis Rutinas',
        'nav.history': 'Historial',
        'nav.progress': 'Progreso',
        'nav.logout': 'Cerrar sesion',

        'auth.welcome': 'Bienvenido',
        'auth.access_account': 'Accede con tu cuenta',
        'auth.email': 'Correo electronico',
        'auth.password': 'Contrasena',
        'auth.login': 'Iniciar sesion',
        'auth.signup': 'Crear cuenta nueva',
        'auth.signup_success': 'Registro exitoso. Seras redirigido.',
        'auth.login_success': 'Inicio de sesion exitoso. Seras redirigido.',
        'auth.logout_error': 'Error al cerrar sesion.',
        'auth.errors.invalid_email': 'El formato del email no es valido.',
        'auth.errors.user_disabled': 'Esta cuenta de usuario esta deshabilitada.',
        'auth.errors.user_not_found': 'No se encontro ningun usuario con este email.',
        'auth.errors.wrong_password': 'La contrasena es incorrecta.',
        'auth.errors.email_already_in_use': 'Este email ya esta registrado. Intenta iniciar sesion.',
        'auth.errors.weak_password': 'La contrasena es demasiado debil (minimo 6 caracteres).',
        'auth.errors.operation_not_allowed': 'Inicio de sesion con email/contrasena no habilitado.',
        'auth.errors.missing_password': 'Por favor, introduce una contrasena.',
        'auth.errors.generic': 'Error de autenticacion. Intentalo de nuevo.',
        'auth.errors.email_password_required': 'Por favor, introduce email y contrasena.',
        'auth.errors.password_min': 'La contrasena debe tener al menos 6 caracteres.',

        'dashboard.title': 'Dashboard',
        'dashboard.user_label': 'Usuario:',
        'dashboard.date_label': 'Fecha:',
        'dashboard.start_workout': 'Empezar entrenamiento',
        'dashboard.select_routine_today': 'Elige una rutina para hoy:',
        'dashboard.loading_routines': '-- Cargando rutinas... --',
        'dashboard.start_new_session': 'Iniciar nueva sesion',
        'dashboard.day_selector_choose': '-- Elige una rutina --',
        'dashboard.day_selector_empty': 'No tienes rutinas. Crea una.',
        'dashboard.resume_button': 'Continuar sesion',
        'dashboard.manage_routines_cta': 'Gestionar mis rutinas',

        'dashboard.daily_hub_title': 'Resumen del dia',
        'dashboard.daily_hub_month_count': 'Sesiones del mes',
        'dashboard.daily_hub_last_workout': 'Ultimo entrenamiento',
        'dashboard.daily_hub_current_routine': 'Rutina actual',
        'dashboard.daily_hub_sync_status': 'Estado de sync',
        'dashboard.daily_hub_empty': 'Aun no tienes sesiones guardadas este mes.',
        'dashboard.last_workout_none': 'Sin registros',
        'dashboard.routine_none': 'Sin rutina',
        'dashboard.sync_online': 'En linea',
        'dashboard.sync_offline': 'Sin conexion',
        'dashboard.sync_online_queued': 'En linea ({count} en cola)',
        'dashboard.sync_offline_queued': 'Sin conexion ({count} en cola)',

        'dashboard.quick_log_title': 'Quick Log',
        'dashboard.quick_log_label': 'Titulo',
        'dashboard.quick_log_label_placeholder': 'Ej: Entreno express',
        'dashboard.quick_log_datetime': 'Fecha y hora',
        'dashboard.quick_log_notes': 'Notas de ejercicios (una por linea)',
        'dashboard.quick_log_notes_placeholder': 'Ej: Press banca 3x8\nPlancha 45s',
        'dashboard.quick_log_save': 'Guardar Quick Log',

        'dashboard.activity_month_title': 'Actividad del mes',
        'dashboard.prev_month': 'Mes anterior',
        'dashboard.next_month': 'Mes siguiente',
        'dashboard.calendar_legend_title': 'Tipos de entrenamiento:',
        'dashboard.legend_none': 'Sin actividad',
        'dashboard.legend_strength': 'Solo fuerza',
        'dashboard.legend_mixed': 'Mixto (fuerza + cardio)',
        'dashboard.legend_cardio': 'Solo cardio',

        'quicklog.default_label': 'Quick Log',
        'quicklog.default_note_prefix': 'Nota',
        'quicklog.must_login': 'Debes iniciar sesion para guardar un Quick Log.',
        'quicklog.busy': 'Ya se esta guardando un Quick Log. Espera un momento.',
        'quicklog.validation_notes': 'Agrega al menos una nota de ejercicio para guardar el Quick Log.',
        'quicklog.saved_when_online': 'Sin conexion. El Quick Log se guardara al recuperar Internet.',
        'quicklog.saved_success': 'Quick Log guardado con exito.',
        'quicklog.saved_queued': 'Quick Log en cola. Se guardara cuando vuelvas a estar en linea.',
        'quicklog.save_error': 'Error al guardar el Quick Log.',

        'routines.title': 'Gestionar mis rutinas',
        'routines.add': 'Crear nueva rutina',
        'routines.loading': 'Cargando rutinas...',
        'routines.action_requires_login': 'Debes iniciar sesion para realizar esta accion.',
        'routines.export_all': 'Exportar todas las rutinas',
        'routines.export_confirm': 'Deseas exportar todas tus rutinas al portapapeles? Se copiara un JSON con todas tus rutinas.',
        'routines.export_loading': 'Exportando...',
        'routines.export_empty': 'No tienes rutinas para exportar.',
        'routines.export_success': '{count} rutina(s) exportadas al portapapeles.',
        'routines.export_error_clipboard': 'Error: no se pudo acceder al portapapeles. Verifica permisos del navegador.',
        'routines.export_error': 'Error al exportar las rutinas.',
        'routines.delete_all': 'Borrar todas las rutinas',
        'routines.delete_all_empty': 'No tienes rutinas para borrar.',
        'routines.delete_all_confirm': 'ATENCION: Vas a borrar TODAS tus {count} rutina(s) de forma permanente.\n\nSeguro? Esta accion NO se puede deshacer.',
        'routines.delete_all_prompt': 'Para confirmar, escribe "BORRAR TODO" (en mayusculas):',
        'routines.delete_all_prompt_keyword': 'BORRAR TODO',
        'routines.delete_all_cancelled': 'Cancelado. No se borraron las rutinas.',
        'routines.delete_all_loading': 'Borrando...',
        'routines.delete_all_success': '{count} rutina(s) borradas con exito.',
        'routines.delete_all_error': 'Error al borrar las rutinas.',
        'routines.save_requires_login': 'Debes iniciar sesion para guardar rutinas.',
        'routines.name_required': 'El nombre de la rutina no puede estar vacio.',
        'routines.exercises_required': 'Debes anadir al menos un ejercicio a la rutina.',
        'routines.save_loading': 'Guardando rutina...',
        'routines.save_success': 'Rutina guardada con exito.',
        'routines.save_error': 'Error al guardar la rutina.',
        'routines.cancel_edit_confirm': 'Cancelar edicion? Los cambios no guardados se perderan.',
        'routines.not_found': 'Rutina no encontrada para eliminar.',
        'routines.delete_confirm': 'Estas seguro de que quieres eliminar la rutina "{name}"? Esta accion no se puede deshacer.',
        'routines.delete_loading': 'Eliminando...',
        'routines.delete_success': 'Rutina eliminada con exito.',
        'routines.delete_error': 'Error al eliminar la rutina.',
        'routines.edit_not_found': 'No se pudo encontrar la rutina para editar.',
        'routines.empty_title': 'Sin rutinas personalizadas',
        'routines.empty_description': 'Crea una rutina nueva o prueba nuestras rutinas de muestra.',
        'routines.exercise_count': '{count} ejercicio(s)',
        'routines.edit': 'Editar',
        'routines.fetch_offline': 'No se pueden cargar las rutinas sin conexion. Se reintentara cuando vuelvas a estar en linea.',

        'routines.editor_create_title': 'Crear nueva rutina',
        'routines.editor_edit_title': 'Editar rutina',
        'routines.editor_name': 'Nombre de la rutina:',
        'routines.editor_exercises': 'Ejercicios',
        'routines.editor_add_exercise': '+ Anadir ejercicio',
        'routines.editor_save': 'Guardar rutina',
        'routines.editor_cancel': 'Cancelar',
        'routines.editor_delete': 'Eliminar rutina',
        'routines.editor_remove_exercise_title': 'Eliminar ejercicio',
        'routines.editor_exercise_name': 'Nombre del ejercicio:',
        'routines.editor_exercise_name_placeholder': 'Ej: Press de banca, sentadillas...',
        'routines.editor_exercise_type': 'Tipo de ejercicio:',
        'routines.editor_type_strength': 'Fuerza (series/reps)',
        'routines.editor_type_cardio': 'Cardio (duracion)',
        'routines.editor_strength_config': 'Configuracion de fuerza',
        'routines.editor_sets': 'Series:',
        'routines.editor_reps': 'Reps/objetivo:',
        'routines.editor_execution_mode': 'Modo de ejecucion:',
        'routines.editor_load_type': 'Tipo de carga:',
        'routines.editor_cardio_config': 'Configuracion de cardio',
        'routines.editor_duration': 'Duracion/objetivo:',
        'routines.editor_notes': 'Notas adicionales (opcional):',

        'session.save': 'Guardar sesion',
        'session.cancel': 'Cancelar sesion',
        'session.no_active_routine': 'Error: no hay rutina activa o no has iniciado sesion.',
        'session.saved_busy': 'Ya se esta guardando la sesion. Espera un momento.',
        'session.save_no_data': 'No se registraron datos para ningun ejercicio. Introduce datos o notas para guardar la sesion.',
        'session.saved_when_online': 'Sin conexion. La sesion se guardara automaticamente al recuperar Internet.',
        'session.saved_success': 'Sesion guardada con exito.',
        'session.saved_queued': 'Sesion en cola. Se guardara cuando vuelvas a estar en linea.',
        'session.save_error': 'Error al guardar la sesion.',
        'session.resume_available': 'Tienes una sesion de "{name}" sin guardar.',
        'session.start_routine_not_found': 'Rutina no encontrada. Selecciona otra.',
        'session.discard_other_confirm': 'Tienes otra sesion en progreso. Descartarla y empezar esta nueva?',
        'session.cancel_confirm': 'Estas seguro de que quieres cancelar? Se perderan los datos no guardados.',
        'session.invalid_routine_data': 'Error: datos de la rutina no validos.',
        'session.user_weight': 'Tu peso hoy (kg):',
        'session.user_weight_placeholder': 'Introduce tu peso (kg)',
        'session.execution_mode': 'Modo de ejecucion:',
        'session.load_type': 'Tipo de carga:',
        'session.target': 'Objetivo: {target}',
        'session.target_time_distance': 'Tiempo/Distancia',
        'session.target_complete': 'Completar',
        'session.bodyweight_hint': 'Carga de peso corporal: usa negativo para asistido y positivo para lastre.',
        'session.first_time_exercise': 'Primera vez haciendo este ejercicio. Registra tus datos para futuras referencias.',
        'session.last_workout': 'Ultimo entrenamiento',
        'session.time_today': 'hoy',
        'session.time_yesterday': 'ayer',
        'session.time_days_ago': 'hace {days} dias',
        'session.extra_load': 'extra',
        'session.set_short': 'S',
        'session.use_last_values': 'Usar valores anteriores',
        'session.last_extra': 'Ultimo extra: {value}',
        'session.last_value': 'Ultimo: {value}',
        'session.suggested_extra': 'Extra sugerido: {value}',
        'session.suggested_value': 'Sugerido: {value}',
        'session.weight_placeholder_signed': 'Carga extra (kg, +/-)',
        'session.weight_placeholder_default': 'Peso (kg)',
        'session.set_label': 'Serie {index}:',
        'session.reps_label': 'reps',
        'session.reps_placeholder': 'Reps',
        'session.timer_start': 'Iniciar',
        'session.timer_pause': 'Pausar',
        'session.notes_label': 'Notas de la sesion:',
        'session.notes_placeholder_cardio': 'Ej: 20 min a 140 bpm, o 5 km en 25 min...',
        'session.notes_placeholder_other': 'Anade notas sobre este ejercicio...',
        'session.notes_placeholder_strength': 'Ej: usar agarre supino, subir peso la proxima vez, tempo 3-1-2...',
        'session.last_values_applied': 'Valores del ultimo entrenamiento aplicados',
        'session.cardio_info': 'Registra los detalles en las notas.',

        'execution_mode.one_hand': 'Una mano',
        'execution_mode.two_hand': 'Dos manos',
        'execution_mode.machine': 'Maquina',
        'execution_mode.pulley': 'Polea',
        'execution_mode.other': 'Otro',

        'load_type.external': 'Carga externa',
        'load_type.bodyweight': 'Peso corporal',
        'load_type.bodyweight_with_sign': 'Peso corporal (+/-)',

        'history.title': 'Historial de sesiones',
        'history.search_placeholder': 'Buscar en sesiones cargadas...',
        'history.prev': 'Anterior',
        'history.next': 'Siguiente',
        'history.loading': 'Cargando historial...',
        'history.login_required': 'Debes iniciar sesion para ver tu historial.',
        'history.cache_notice': 'Mostrando historial desde cache local.',
        'history.no_connection': 'Sin conexion. No se puede cargar el historial.',
        'history.no_connection_warning': 'Estas sin conexion. No se pudo cargar el historial.',
        'history.load_error': 'Error al cargar el historial.',
        'history.empty': 'No hay sesiones guardadas todavia. Empieza a entrenar para registrar tu progreso.',
        'history.date_unavailable': 'Fecha no disponible',
        'history.exercises_done_count': '{count} ejercicios realizados',
        'history.view_details': 'Ver detalles',
        'history.delete': 'Eliminar',
        'history.detail_title': 'Detalle de sesion',
        'history.detail_exercises_done': 'Ejercicios realizados',
        'history.execution_mode': 'Modo: {value}',
        'history.load_type': 'Carga: {value}',
        'history.series_bodyweight': 'Serie {index}: {extraLoad} kg extra',
        'history.total_weight': ' (total {total} kg)',
        'history.reps_suffix': ' x {reps} repeticiones',
        'history.series_line': 'Serie {index}: {weight} kg x {reps} repeticiones',
        'history.notes_prefix': 'Notas',
        'history.exercise_none': 'No hay ejercicios registrados en esta sesion.',
        'history.type_strength': 'Fuerza',
        'history.type_cardio': 'Cardio',
        'history.type_other': 'Otro',
        'history.details_not_found': 'No se encontraron los detalles.',
        'history.details_error': 'Error al cargar detalles.',
        'history.page': 'Pag. {page}',
        'history.page_cached': 'Pag. {page} (cache)',
        'history.this_session': 'esta sesion',
        'history.delete_confirm': 'Estas seguro de que quieres eliminar "{name}"? Esta accion no se puede deshacer.',
        'history.delete_success': 'Sesion eliminada correctamente.',
        'history.delete_error': 'Error al eliminar la sesion.',

        'progress.title': 'Progreso de ejercicios',
        'progress.select_exercise': 'Selecciona un ejercicio:',
        'progress.metric': 'Metrica:',
        'progress.metric_weight': 'Peso maximo',
        'progress.metric_volume': 'Volumen total',
        'progress.metric_reps': 'Repeticiones maximas',
        'progress.period': 'Periodo:',
        'progress.period_all': 'Todo el historial',
        'progress.period_1y': 'Ultimo ano',
        'progress.period_6m': 'Ultimos 6 meses',
        'progress.period_3m': 'Ultimos 3 meses',
        'progress.best_record': 'Mejor marca',
        'progress.total_progress': 'Progreso total',
        'progress.session_count': 'Sesiones registradas',
        'progress.trend': 'Tendencia',
        'progress.no_data_title': 'Datos insuficientes',
        'progress.no_data_message': 'Selecciona un ejercicio con al menos 3 entrenamientos registrados para ver tu progreso.',
        'progress.select_placeholder': '-- Selecciona un ejercicio --',
        'progress.loading_exercises': '-- Cargando ejercicios... --',
        'progress.no_history': 'No hay ejercicios en el historial',
        'progress.loading_error': 'Error cargando ejercicios',
        'progress.cache_loaded': 'Cargado desde cache',
        'progress.chart_error': 'Error: no se pudo cargar el sistema de graficos',
        'progress.value': 'Valor',
        'progress.chart_title': 'Progreso de {exercise} - {metric}',
        'progress.sessions_suffix': '{count} sesiones',
        'progress.unit_weight': 'kg',
        'progress.unit_reps': 'reps',
        'progress.unit_volume': 'kg',
        'progress.trend_up': 'Mejorando',
        'progress.trend_down': 'Descendiendo',
        'progress.trend_stable': 'Estable',

        'settings.title': 'Ajustes',
        'settings.cache_info_title': 'Informacion del cache',
        'settings.cache_info_loading': 'Cargando informacion del cache...',
        'settings.cache_info_error': 'Error al cargar la informacion del cache.',
        'settings.cache_manage_title': 'Gestion del cache',
        'settings.cache_warning': 'Eliminar el cache borrara los datos de sugerencias guardados localmente. Los datos de tus sesiones en la nube no se veran afectados.',
        'settings.cache_delete_btn': 'Eliminar cache local',
        'settings.clear_cache_confirm': 'Estas seguro de que quieres eliminar el cache local?\n\nEsto borrara las sugerencias de ejercicios guardadas localmente. Los datos de tus sesiones en la nube no se veran afectados.\n\nEl cache se reconstruira automaticamente la proxima vez que inicies sesion.',
        'settings.cache_cleared': 'Cache eliminado correctamente',
        'settings.cache_clear_error': 'Error al eliminar el cache',
        'settings.firebase_usage_title': 'Uso de Firebase',
        'settings.firebase_usage_warning': 'Estas metricas muestran el uso estimado de la sesion actual para identificar lecturas y escrituras costosas.',
        'settings.firebase_usage_reset_btn': 'Reiniciar metricas Firebase',
        'settings.firebase_metrics_reset': 'Metricas de Firebase reiniciadas',
        'settings.cache_stat_exercise_count': 'Ejercicios en cache:',
        'settings.cache_stat_total_entries': 'Total de registros:',
        'settings.cache_stat_size': 'Tamano del cache de ejercicios:',
        'settings.cache_stat_last_update': 'Ultima actualizacion:',
        'settings.cache_stat_history_days': 'Dias de historial:',
        'settings.cache_stat_storage_used': 'Almacenamiento usado:',
        'settings.cache_stat_storage_quota': 'Cuota disponible:',
        'settings.cache_stat_storage_usage': 'Uso:',
        'settings.cache_stat_reads': 'Lecturas Firebase (sesion):',
        'settings.cache_stat_writes': 'Escrituras Firebase (sesion):',
        'settings.cache_stat_duration': 'Duracion de sesion:',
        'settings.cache_stat_cost': 'Costo estimado:',
        'settings.cache_stat_expensive_ops': 'Operaciones mas costosas:',

        'version.force_update': 'Actualizar',
        'version.force_update_confirm': 'Estas seguro de que quieres forzar la actualizacion de la aplicacion? Esto limpiara el cache y recargara la pagina.',
        'version.updated_title': 'Aplicacion actualizada',
        'version.updated_message': 'Version {version} instalada correctamente',
        'version.force_update_loading': 'Actualizando...',
        'version.force_update_done': 'Listo',
        'version.force_update_error': 'Error',

        'notifications.close': 'Cerrar notificación',

        'offline.default_error': 'Esta operacion requiere conexion a Internet',
        'offline.limited_features': 'Sin conexion a Internet. Algunas funciones estaran limitadas.',
        'offline.connection_restored': 'Conexion restablecida',
        'offline.queued_when_online': 'La operacion se guardara para cuando haya conexion',
        'offline.connection_error_retry': 'Error de conexion. Verifica tu Internet e intenta de nuevo.',
        'offline.operations_completed': '{count} operacion(es) completada(s)',
        'offline.operations_failed': '{count} operacion(es) fallida(s)',

        'calendar.error_month_load': 'Error al cargar la actividad del mes',
        'calendar.day_mon': 'L',
        'calendar.day_tue': 'M',
        'calendar.day_wed': 'X',
        'calendar.day_thu': 'J',
        'calendar.day_fri': 'V',
        'calendar.day_sat': 'S',
        'calendar.day_sun': 'D',
        'calendar.activity_none': 'Sin actividad',
        'calendar.activity_strength': 'Entrenamiento de fuerza',
        'calendar.activity_cardio': 'Entrenamiento de cardio',
        'calendar.activity_mixed': 'Entrenamiento mixto (fuerza + cardio)',
        'calendar.activity_generic': 'Entrenamiento',
        'calendar.tooltip_single': '{date}: {activity}',
        'calendar.tooltip_multiple': '{date}: {activity} ({count} sesiones)',
        'calendar.motivation_first_workout': 'Comienza tu primer entrenamiento este mes.',

        'theme.modal_title': 'Elegir tema',
        'theme.default_name': 'Moderno',
        'theme.default_description': 'Tema azul moderno y elegante',
        'theme.dark_name': 'Oscuro',
        'theme.dark_description': 'Tema oscuro para usar de noche',
        'theme.nature_name': 'Natural',
        'theme.nature_description': 'Tema verde inspirado en la naturaleza',
        'theme.sunset_name': 'Atardecer',
        'theme.sunset_description': 'Colores calidos del atardecer',
        'theme.ocean_name': 'Oceano',
        'theme.ocean_description': 'Azules profundos del oceano',

        'footer.contact': 'Para sugerencias o errores:',
        'footer.copyright': '© 2025 My Workout Tracker. Hecho para mantenerte en forma.'
    },
    en: {
        'app.name': 'My Workout Tracker',

        'common.loading': 'Loading...',
        'common.saving': 'Saving...',
        'common.na': 'N/A',
        'common.days': 'days',

        'header.language_label': 'Language',
        'header.language_option_es': 'ES',
        'header.language_option_en': 'EN',
        'header.theme_toggle_title': 'Change theme',

        'nav.dashboard': 'Dashboard',
        'nav.manage_routines': 'My Routines',
        'nav.history': 'History',
        'nav.progress': 'Progress',
        'nav.logout': 'Log out',

        'auth.welcome': 'Welcome',
        'auth.access_account': 'Access your account',
        'auth.email': 'Email',
        'auth.password': 'Password',
        'auth.login': 'Sign in',
        'auth.signup': 'Create new account',
        'auth.signup_success': 'Sign up successful. You will be redirected.',
        'auth.login_success': 'Login successful. You will be redirected.',
        'auth.logout_error': 'Error while logging out.',
        'auth.errors.invalid_email': 'The email format is invalid.',
        'auth.errors.user_disabled': 'This user account has been disabled.',
        'auth.errors.user_not_found': 'No user found with this email.',
        'auth.errors.wrong_password': 'The password is incorrect.',
        'auth.errors.email_already_in_use': 'This email is already registered. Try signing in.',
        'auth.errors.weak_password': 'The password is too weak (minimum 6 characters).',
        'auth.errors.operation_not_allowed': 'Email/password sign-in is not enabled.',
        'auth.errors.missing_password': 'Please enter a password.',
        'auth.errors.generic': 'Authentication error. Please try again.',
        'auth.errors.email_password_required': 'Please enter email and password.',
        'auth.errors.password_min': 'Password must be at least 6 characters.',

        'dashboard.title': 'Dashboard',
        'dashboard.user_label': 'User:',
        'dashboard.date_label': 'Date:',
        'dashboard.start_workout': 'Start workout',
        'dashboard.select_routine_today': 'Choose a routine for today:',
        'dashboard.loading_routines': '-- Loading routines... --',
        'dashboard.start_new_session': 'Start new session',
        'dashboard.day_selector_choose': '-- Choose a routine --',
        'dashboard.day_selector_empty': 'You have no routines. Create one.',
        'dashboard.resume_button': 'Resume session',
        'dashboard.manage_routines_cta': 'Manage my routines',

        'dashboard.daily_hub_title': 'Daily summary',
        'dashboard.daily_hub_month_count': 'Sessions this month',
        'dashboard.daily_hub_last_workout': 'Last workout',
        'dashboard.daily_hub_current_routine': 'Current routine',
        'dashboard.daily_hub_sync_status': 'Sync status',
        'dashboard.daily_hub_empty': 'You have no saved sessions this month yet.',
        'dashboard.last_workout_none': 'No records',
        'dashboard.routine_none': 'No routine',
        'dashboard.sync_online': 'Online',
        'dashboard.sync_offline': 'Offline',
        'dashboard.sync_online_queued': 'Online ({count} queued)',
        'dashboard.sync_offline_queued': 'Offline ({count} queued)',

        'dashboard.quick_log_title': 'Quick Log',
        'dashboard.quick_log_label': 'Title',
        'dashboard.quick_log_label_placeholder': 'Example: Express workout',
        'dashboard.quick_log_datetime': 'Date and time',
        'dashboard.quick_log_notes': 'Exercise notes (one per line)',
        'dashboard.quick_log_notes_placeholder': 'Example: Bench press 3x8\nPlank 45s',
        'dashboard.quick_log_save': 'Save Quick Log',

        'dashboard.activity_month_title': 'Monthly activity',
        'dashboard.prev_month': 'Previous month',
        'dashboard.next_month': 'Next month',
        'dashboard.calendar_legend_title': 'Workout types:',
        'dashboard.legend_none': 'No activity',
        'dashboard.legend_strength': 'Strength only',
        'dashboard.legend_mixed': 'Mixed (strength + cardio)',
        'dashboard.legend_cardio': 'Cardio only',

        'quicklog.default_label': 'Quick Log',
        'quicklog.default_note_prefix': 'Note',
        'quicklog.must_login': 'You must sign in to save a Quick Log.',
        'quicklog.busy': 'A Quick Log is already being saved. Please wait.',
        'quicklog.validation_notes': 'Add at least one exercise note to save the Quick Log.',
        'quicklog.saved_when_online': 'Offline. Quick Log will be saved once Internet is back.',
        'quicklog.saved_success': 'Quick Log saved successfully.',
        'quicklog.saved_queued': 'Quick Log queued. It will be saved when you are back online.',
        'quicklog.save_error': 'Error saving Quick Log.',

        'routines.title': 'Manage my routines',
        'routines.add': 'Create new routine',
        'routines.loading': 'Loading routines...',
        'routines.action_requires_login': 'You must sign in to perform this action.',
        'routines.export_all': 'Export all routines',
        'routines.export_confirm': 'Do you want to export all your routines to the clipboard? A JSON payload will be copied.',
        'routines.export_loading': 'Exporting...',
        'routines.export_empty': 'You have no routines to export.',
        'routines.export_success': '{count} routine(s) exported to clipboard.',
        'routines.export_error_clipboard': 'Error: clipboard access denied. Check browser permissions.',
        'routines.export_error': 'Error exporting routines.',
        'routines.delete_all': 'Delete all routines',
        'routines.delete_all_empty': 'You have no routines to delete.',
        'routines.delete_all_confirm': 'WARNING: You are about to permanently delete ALL your {count} routine(s).\n\nAre you sure? This cannot be undone.',
        'routines.delete_all_prompt': 'To confirm, type "DELETE ALL" (uppercase):',
        'routines.delete_all_prompt_keyword': 'DELETE ALL',
        'routines.delete_all_cancelled': 'Cancelled. No routines were deleted.',
        'routines.delete_all_loading': 'Deleting...',
        'routines.delete_all_success': '{count} routine(s) deleted successfully.',
        'routines.delete_all_error': 'Error deleting routines.',
        'routines.save_requires_login': 'You must sign in to save routines.',
        'routines.name_required': 'Routine name cannot be empty.',
        'routines.exercises_required': 'You must add at least one exercise to the routine.',
        'routines.save_loading': 'Saving routine...',
        'routines.save_success': 'Routine saved successfully.',
        'routines.save_error': 'Error saving routine.',
        'routines.cancel_edit_confirm': 'Cancel edit? Unsaved changes will be lost.',
        'routines.not_found': 'Routine not found for deletion.',
        'routines.delete_confirm': 'Are you sure you want to delete the routine "{name}"? This cannot be undone.',
        'routines.delete_loading': 'Deleting...',
        'routines.delete_success': 'Routine deleted successfully.',
        'routines.delete_error': 'Error deleting routine.',
        'routines.edit_not_found': 'Could not find routine to edit.',
        'routines.empty_title': 'No custom routines',
        'routines.empty_description': 'Create a new routine or try sample routines.',
        'routines.exercise_count': '{count} exercise(s)',
        'routines.edit': 'Edit',
        'routines.fetch_offline': 'Routines cannot be loaded while offline. We will retry when connection is back.',

        'routines.editor_create_title': 'Create new routine',
        'routines.editor_edit_title': 'Edit routine',
        'routines.editor_name': 'Routine name:',
        'routines.editor_exercises': 'Exercises',
        'routines.editor_add_exercise': '+ Add exercise',
        'routines.editor_save': 'Save routine',
        'routines.editor_cancel': 'Cancel',
        'routines.editor_delete': 'Delete routine',
        'routines.editor_remove_exercise_title': 'Remove exercise',
        'routines.editor_exercise_name': 'Exercise name:',
        'routines.editor_exercise_name_placeholder': 'Example: Bench press, squats...',
        'routines.editor_exercise_type': 'Exercise type:',
        'routines.editor_type_strength': 'Strength (sets/reps)',
        'routines.editor_type_cardio': 'Cardio (duration)',
        'routines.editor_strength_config': 'Strength setup',
        'routines.editor_sets': 'Sets:',
        'routines.editor_reps': 'Reps/target:',
        'routines.editor_execution_mode': 'Execution mode:',
        'routines.editor_load_type': 'Load type:',
        'routines.editor_cardio_config': 'Cardio setup',
        'routines.editor_duration': 'Duration/target:',
        'routines.editor_notes': 'Additional notes (optional):',

        'session.save': 'Save session',
        'session.cancel': 'Cancel session',
        'session.no_active_routine': 'Error: no active routine or user not signed in.',
        'session.saved_busy': 'Session is already being saved. Please wait.',
        'session.save_no_data': 'No data was captured for any exercise. Enter values or notes before saving.',
        'session.saved_when_online': 'Offline. Session will be saved automatically when Internet is back.',
        'session.saved_success': 'Session saved successfully.',
        'session.saved_queued': 'Session queued. It will be saved when you are back online.',
        'session.save_error': 'Error saving session.',
        'session.resume_available': 'You have an unsaved "{name}" session.',
        'session.start_routine_not_found': 'Routine not found. Please choose another one.',
        'session.discard_other_confirm': 'You have another session in progress. Discard it and start this one?',
        'session.cancel_confirm': 'Are you sure you want to cancel? Unsaved data will be lost.',
        'session.invalid_routine_data': 'Error: invalid routine data.',
        'session.user_weight': 'Your weight today (kg):',
        'session.user_weight_placeholder': 'Enter your weight (kg)',
        'session.execution_mode': 'Execution mode:',
        'session.load_type': 'Load type:',
        'session.target': 'Target: {target}',
        'session.target_time_distance': 'Time/Distance',
        'session.target_complete': 'Complete',
        'session.bodyweight_hint': 'Bodyweight load: use negative for assisted and positive for added load.',
        'session.first_time_exercise': 'First time doing this exercise. Save your data for future references.',
        'session.last_workout': 'Last workout',
        'session.time_today': 'today',
        'session.time_yesterday': 'yesterday',
        'session.time_days_ago': '{days} days ago',
        'session.extra_load': 'extra',
        'session.set_short': 'S',
        'session.use_last_values': 'Use previous values',
        'session.last_extra': 'Last extra: {value}',
        'session.last_value': 'Last: {value}',
        'session.suggested_extra': 'Suggested extra: {value}',
        'session.suggested_value': 'Suggested: {value}',
        'session.weight_placeholder_signed': 'Extra load (kg, +/-)',
        'session.weight_placeholder_default': 'Weight (kg)',
        'session.set_label': 'Set {index}:',
        'session.reps_label': 'reps',
        'session.reps_placeholder': 'Reps',
        'session.timer_start': 'Start',
        'session.timer_pause': 'Pause',
        'session.notes_label': 'Session notes:',
        'session.notes_placeholder_cardio': 'Example: 20 min at 140 bpm, or 5 km in 25 min...',
        'session.notes_placeholder_other': 'Add notes for this exercise...',
        'session.notes_placeholder_strength': 'Example: supinated grip, increase load next time, tempo 3-1-2...',
        'session.last_values_applied': 'Previous workout values applied',
        'session.cardio_info': 'Record details in notes.',

        'execution_mode.one_hand': 'One hand',
        'execution_mode.two_hand': 'Two hands',
        'execution_mode.machine': 'Machine',
        'execution_mode.pulley': 'Pulley',
        'execution_mode.other': 'Other',

        'load_type.external': 'External load',
        'load_type.bodyweight': 'Bodyweight',
        'load_type.bodyweight_with_sign': 'Bodyweight (+/-)',

        'history.title': 'Session history',
        'history.search_placeholder': 'Search loaded sessions...',
        'history.prev': 'Previous',
        'history.next': 'Next',
        'history.loading': 'Loading history...',
        'history.login_required': 'You must sign in to view your history.',
        'history.cache_notice': 'Showing history from local cache.',
        'history.no_connection': 'Offline. History cannot be loaded.',
        'history.no_connection_warning': 'You are offline. History could not be loaded.',
        'history.load_error': 'Error loading history.',
        'history.empty': 'No saved sessions yet. Start training to track your progress.',
        'history.date_unavailable': 'Date unavailable',
        'history.exercises_done_count': '{count} exercises completed',
        'history.view_details': 'View details',
        'history.delete': 'Delete',
        'history.detail_title': 'Session detail',
        'history.detail_exercises_done': 'Completed exercises',
        'history.execution_mode': 'Mode: {value}',
        'history.load_type': 'Load: {value}',
        'history.series_bodyweight': 'Set {index}: {extraLoad} kg extra',
        'history.total_weight': ' (total {total} kg)',
        'history.reps_suffix': ' x {reps} reps',
        'history.series_line': 'Set {index}: {weight} kg x {reps} reps',
        'history.notes_prefix': 'Notes',
        'history.exercise_none': 'No exercises recorded in this session.',
        'history.type_strength': 'Strength',
        'history.type_cardio': 'Cardio',
        'history.type_other': 'Other',
        'history.details_not_found': 'Details were not found.',
        'history.details_error': 'Error loading details.',
        'history.page': 'Page {page}',
        'history.page_cached': 'Page {page} (cache)',
        'history.this_session': 'this session',
        'history.delete_confirm': 'Are you sure you want to delete "{name}"? This cannot be undone.',
        'history.delete_success': 'Session deleted successfully.',
        'history.delete_error': 'Error deleting session.',

        'progress.title': 'Exercise progress',
        'progress.select_exercise': 'Select an exercise:',
        'progress.metric': 'Metric:',
        'progress.metric_weight': 'Max weight',
        'progress.metric_volume': 'Total volume',
        'progress.metric_reps': 'Max reps',
        'progress.period': 'Period:',
        'progress.period_all': 'All history',
        'progress.period_1y': 'Last year',
        'progress.period_6m': 'Last 6 months',
        'progress.period_3m': 'Last 3 months',
        'progress.best_record': 'Best record',
        'progress.total_progress': 'Total progress',
        'progress.session_count': 'Logged sessions',
        'progress.trend': 'Trend',
        'progress.no_data_title': 'Not enough data',
        'progress.no_data_message': 'Select an exercise with at least 3 recorded workouts to see progress.',
        'progress.select_placeholder': '-- Select an exercise --',
        'progress.loading_exercises': '-- Loading exercises... --',
        'progress.no_history': 'No exercises found in history',
        'progress.loading_error': 'Error loading exercises',
        'progress.cache_loaded': 'Loaded from cache',
        'progress.chart_error': 'Error: chart system could not be loaded',
        'progress.value': 'Value',
        'progress.chart_title': 'Progress for {exercise} - {metric}',
        'progress.sessions_suffix': '{count} sessions',
        'progress.unit_weight': 'kg',
        'progress.unit_reps': 'reps',
        'progress.unit_volume': 'kg',
        'progress.trend_up': 'Improving',
        'progress.trend_down': 'Declining',
        'progress.trend_stable': 'Stable',

        'settings.title': 'Settings',
        'settings.cache_info_title': 'Cache information',
        'settings.cache_info_loading': 'Loading cache information...',
        'settings.cache_info_error': 'Error loading cache information.',
        'settings.cache_manage_title': 'Cache management',
        'settings.cache_warning': 'Clearing cache removes locally saved suggestion data. Cloud session data is not affected.',
        'settings.cache_delete_btn': 'Clear local cache',
        'settings.clear_cache_confirm': 'Are you sure you want to clear local cache?\n\nThis removes locally saved exercise suggestions. Cloud session data is not affected.\n\nCache will be rebuilt automatically the next time you sign in.',
        'settings.cache_cleared': 'Cache cleared successfully',
        'settings.cache_clear_error': 'Error clearing cache',
        'settings.firebase_usage_title': 'Firebase usage',
        'settings.firebase_usage_warning': 'These metrics show estimated usage for the current session to identify expensive reads/writes.',
        'settings.firebase_usage_reset_btn': 'Reset Firebase metrics',
        'settings.firebase_metrics_reset': 'Firebase metrics reset',
        'settings.cache_stat_exercise_count': 'Exercises in cache:',
        'settings.cache_stat_total_entries': 'Total entries:',
        'settings.cache_stat_size': 'Exercise cache size:',
        'settings.cache_stat_last_update': 'Last update:',
        'settings.cache_stat_history_days': 'History days:',
        'settings.cache_stat_storage_used': 'Storage used:',
        'settings.cache_stat_storage_quota': 'Storage quota:',
        'settings.cache_stat_storage_usage': 'Usage:',
        'settings.cache_stat_reads': 'Firebase reads (session):',
        'settings.cache_stat_writes': 'Firebase writes (session):',
        'settings.cache_stat_duration': 'Session duration:',
        'settings.cache_stat_cost': 'Estimated cost:',
        'settings.cache_stat_expensive_ops': 'Most expensive operations:',

        'version.force_update': 'Update',
        'version.force_update_confirm': 'Are you sure you want to force app update? This will clear cache and reload the page.',
        'version.updated_title': 'Application updated',
        'version.updated_message': 'Version {version} installed successfully',
        'version.force_update_loading': 'Updating...',
        'version.force_update_done': 'Done',
        'version.force_update_error': 'Error',

        'notifications.close': 'Close notification',

        'offline.default_error': 'This operation requires an Internet connection',
        'offline.limited_features': 'No Internet connection. Some features are limited.',
        'offline.connection_restored': 'Connection restored',
        'offline.queued_when_online': 'The operation was queued and will run when connection returns',
        'offline.connection_error_retry': 'Connection error. Check your Internet and try again.',
        'offline.operations_completed': '{count} operation(s) completed',
        'offline.operations_failed': '{count} operation(s) failed',

        'calendar.error_month_load': 'Error loading monthly activity',
        'calendar.day_mon': 'M',
        'calendar.day_tue': 'T',
        'calendar.day_wed': 'W',
        'calendar.day_thu': 'T',
        'calendar.day_fri': 'F',
        'calendar.day_sat': 'S',
        'calendar.day_sun': 'S',
        'calendar.activity_none': 'No activity',
        'calendar.activity_strength': 'Strength workout',
        'calendar.activity_cardio': 'Cardio workout',
        'calendar.activity_mixed': 'Mixed workout (strength + cardio)',
        'calendar.activity_generic': 'Workout',
        'calendar.tooltip_single': '{date}: {activity}',
        'calendar.tooltip_multiple': '{date}: {activity} ({count} sessions)',
        'calendar.motivation_first_workout': 'Start your first workout this month.',

        'theme.modal_title': 'Choose theme',
        'theme.default_name': 'Modern',
        'theme.default_description': 'Modern and elegant blue theme',
        'theme.dark_name': 'Dark',
        'theme.dark_description': 'Dark theme for night use',
        'theme.nature_name': 'Nature',
        'theme.nature_description': 'Green theme inspired by nature',
        'theme.sunset_name': 'Sunset',
        'theme.sunset_description': 'Warm sunset colors',
        'theme.ocean_name': 'Ocean',
        'theme.ocean_description': 'Deep ocean blues',

        'footer.contact': 'For suggestions or bugs:',
        'footer.copyright': '© 2025 My Workout Tracker. Built to keep you in shape.'
    }
};

let currentLanguage = DEFAULT_LANGUAGE;
const listeners = new Set();
const missingKeys = new Set();

function isBrowser() {
    return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function interpolate(template, params = {}) {
    return String(template).replace(/\{(\w+)\}/g, (_, key) => {
        const value = params[key];
        return value === undefined || value === null ? '' : String(value);
    });
}

function resolveLanguage(language) {
    return SUPPORTED_LANGUAGES.includes(language) ? language : DEFAULT_LANGUAGE;
}

function getDictionaryValue(language, key) {
    return dictionaries[language]?.[key];
}

function updateDocumentLanguage() {
    if (!isBrowser()) return;
    document.documentElement.lang = currentLanguage;
}

function emitLanguageChange() {
    const detail = {
        language: currentLanguage,
        locale: getLocale()
    };

    if (isBrowser()) {
        window.dispatchEvent(new CustomEvent('languageChanged', { detail }));
    }

    listeners.forEach((listener) => {
        try {
            listener(detail);
        } catch (error) {
            logger.error('i18n language listener error:', error);
        }
    });
}

function getStoredLanguage() {
    if (!isBrowser()) return null;
    try {
        return localStorage.getItem(LANGUAGE_STORAGE_KEY);
    } catch (error) {
        logger.warn('Could not read stored language:', error);
        return null;
    }
}

function persistLanguage(language) {
    if (!isBrowser()) return;
    try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch (error) {
        logger.warn('Could not persist language:', error);
    }
}

function applyTranslationToElement(element) {
    if (!element || typeof element.getAttribute !== 'function') {
        return;
    }

    const textKey = element.getAttribute('data-i18n');
    if (textKey) {
        element.textContent = t(textKey);
    }

    const htmlKey = element.getAttribute('data-i18n-html');
    if (htmlKey) {
        element.innerHTML = t(htmlKey);
    }

    const placeholderKey = element.getAttribute('data-i18n-placeholder');
    if (placeholderKey) {
        element.placeholder = t(placeholderKey);
    }

    const titleKey = element.getAttribute('data-i18n-title');
    if (titleKey) {
        element.title = t(titleKey);
    }

    const ariaLabelKey = element.getAttribute('data-i18n-aria-label');
    if (ariaLabelKey) {
        element.setAttribute('aria-label', t(ariaLabelKey));
    }

    const valueKey = element.getAttribute('data-i18n-value');
    if (valueKey && 'value' in element) {
        element.value = t(valueKey);
    }
}

export function registerTranslations(language, translations) {
    const resolvedLanguage = resolveLanguage(language);
    const nextEntries = translations && typeof translations === 'object' ? translations : {};
    dictionaries[resolvedLanguage] = {
        ...(dictionaries[resolvedLanguage] || {}),
        ...nextEntries
    };
}

export function getLanguage() {
    return currentLanguage;
}

export function getLocale() {
    return LOCALES[currentLanguage] || LOCALES[DEFAULT_LANGUAGE];
}

export function t(key, params = {}) {
    const value = getDictionaryValue(currentLanguage, key)
        ?? getDictionaryValue(DEFAULT_LANGUAGE, key);

    if (value === undefined) {
        if (params && Object.prototype.hasOwnProperty.call(params, 'default')) {
            return String(params.default);
        }

        if (!missingKeys.has(key)) {
            missingKeys.add(key);
            logger.warn(`Missing i18n key: ${key}`);
        }
        return key;
    }

    return interpolate(value, params);
}

export function applyTranslations(root = document) {
    if (!isBrowser() || !root) return;

    if (typeof root.matches === 'function') {
        applyTranslationToElement(root);
    }

    root.querySelectorAll('[data-i18n], [data-i18n-html], [data-i18n-placeholder], [data-i18n-title], [data-i18n-aria-label], [data-i18n-value]')
        .forEach((element) => {
            applyTranslationToElement(element);
        });
}

export function setLanguage(language, options = {}) {
    const nextLanguage = resolveLanguage(language);
    const shouldPersist = options.persist !== false;
    const shouldApply = options.apply !== false;
    const previousLanguage = currentLanguage;

    currentLanguage = nextLanguage;
    updateDocumentLanguage();

    if (shouldPersist) {
        persistLanguage(nextLanguage);
    }

    if (shouldApply && isBrowser()) {
        applyTranslations(document);
    }

    if (previousLanguage !== nextLanguage) {
        emitLanguageChange();
    }

    return nextLanguage;
}

export function initI18n(options = {}) {
    const initialLanguage = resolveLanguage(
        options.language
        || getStoredLanguage()
        || DEFAULT_LANGUAGE
    );

    return setLanguage(initialLanguage, {
        persist: options.persist !== false,
        apply: options.apply !== false
    });
}

export function onLanguageChange(listener) {
    if (typeof listener !== 'function') {
        throw new Error('onLanguageChange requires a listener function');
    }

    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
