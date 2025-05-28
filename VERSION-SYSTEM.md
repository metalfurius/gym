# Sistema de Versioning - Gym Tracker

## Descripción

Este sistema de versioning está diseñado para solucionar el problema de caché en dispositivos móviles, asegurando que los usuarios siempre tengan la versión más actualizada de la aplicación sin perder sesiones de entrenamiento en progreso.

## Características

✅ **Detección automática de actualizaciones**  
✅ **Preservación de sesiones en progreso**  
✅ **Limpieza automática de caché**  
✅ **Notificaciones visuales de actualización**  
✅ **Botón de actualización manual**  
✅ **Script automatizado para incrementar versiones**

## Cómo Funciona

### 1. Detección de Actualizaciones
- Al cargar la app, se compara la versión almacenada en localStorage con la versión actual
- Si hay diferencia, se activa el proceso de actualización

### 2. Preservación de Datos
- Antes de limpiar caché, se respaldan las sesiones en progreso
- Después de la actualización, se restauran automáticamente

### 3. Limpieza de Caché
- Se eliminan todos los cachés antiguos del service worker
- Se fuerza la recarga de recursos desde el servidor

### 4. Notificación al Usuario
- Se muestra una notificación visual confirmando la actualización
- La notificación desaparece automáticamente después de 4 segundos

## Uso del Sistema

### Para Desarrolladores

#### Actualizar Versión Automáticamente
```bash
# Incrementar patch (1.0.1 → 1.0.2)
node update-version.js

# Incrementar minor (1.0.1 → 1.1.0)
node update-version.js minor

# Incrementar major (1.0.1 → 2.0.0)
node update-version.js major

# Establecer versión específica
node update-version.js 1.2.3
```

#### Actualización Manual
Ahora solo necesitas actualizar un archivo:
- `manifest.json` → campo `version`

**Nota:** Todos los demás archivos (service worker, version manager, footer) obtienen automáticamente la versión del manifest.json, eliminando la duplicación y errores de sincronización.

### Para Usuarios

#### Actualización Automática
- La app detecta automáticamente cuando hay una nueva versión
- Se muestra una notificación de actualización exitosa
- No se pierde ninguna sesión en progreso

#### Actualización Manual
- Ve al footer de la aplicación
- Haz clic en el botón "🔄 Actualizar"
- Confirma la actualización cuando se solicite

## Archivos del Sistema

```
js/version-manager.js     # Lógica principal del sistema
update-version.js         # Script para actualizar versiones
sw.js                     # Service Worker con control de caché
manifest.json             # Metadatos de la PWA
```

## Configuración

### Constantes Importantes

```javascript
// En js/version-manager.js
const CURRENT_VERSION = '1.0.1';           // Versión actual
const VERSION_KEY = 'gym-tracker-version'; // Clave localStorage
const BACKUP_SESSION_KEY = 'gym-tracker-backup-session'; // Backup de sesiones
```

## Consideraciones Técnicas

### Service Worker
- El service worker usa el nombre `gym-tracker-v{VERSION}` para el caché
- Los cachés antiguos se eliminan automáticamente en el evento 'activate'

### Almacenamiento
- Las versiones se almacenan en localStorage
- Las sesiones se respaldan temporalmente durante actualizaciones
- Se preservan todos los datos importantes del usuario

### Compatibilidad
- Compatible con todos los navegadores modernos
- Funciona tanto en versión web como PWA
- Optimizado para dispositivos móviles

## Flujo de Actualización

```
1. Usuario abre la app
2. Se ejecuta initVersionControl()
3. ¿Versión diferente? → SÍ:
   a. Respaldar sesión en progreso
   b. Mostrar notificación
   c. Limpiar cachés
   d. Actualizar versión almacenada
   e. Restaurar sesión respaldada
4. ¿Versión diferente? → NO:
   - Continuar normalmente
5. Verificar sesiones respaldadas
6. App lista para usar
```

## Solución de Problemas

### La app no se actualiza en móvil
1. Verifica que todas las versiones coincidan en los archivos
2. Usa el botón "🔄 Actualizar" manualmente
3. Limpia caché del navegador manualmente si persiste

### Se pierde una sesión en progreso
1. Verifica si hay un backup en localStorage (`gym-tracker-backup-session`)
2. La sesión debería restaurarse automáticamente en la próxima carga

### Errores en la consola
- Revisa que todos los archivos estén correctamente servidos
- Verifica que el service worker esté registrado correctamente

## Registro de Cambios

### v1.0.1
- ✨ Sistema de versioning implementado
- 🔧 Control automático de caché
- 💾 Preservación de sesiones en progreso
- 🎨 Notificaciones visuales de actualización
- 🛠️ Script automatizado para actualizar versiones

### v1.0.0
- 🚀 Versión inicial de la aplicación
