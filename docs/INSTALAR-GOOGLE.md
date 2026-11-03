# Instalar Trama privada en Google

Esta versión usa **Apps Script como interfaz y backend**, Drive como almacenamiento principal y Sheets para índices consultables. No necesita API de IA, claves en el navegador ni un servidor contratado.

**No está activada en tu cuenta hasta que autorices y despliegues el proyecto.** La dirección pública de GitHub Pages continúa siendo la versión local; no se convierte automáticamente en una app Google.

## 1. Obtener el paquete

Usa el ZIP de instalación preparado con estos archivos:

También se genera el artefacto **trama-google-instalador** en cada ejecución exitosa del workflow **Publicar Trama** de GitHub Actions. Descárgalo desde la ejecución del código que deseas instalar.

| Archivo del paquete | Archivo en el editor de Apps Script |
|---|---|
| `Code.gs` | Script `Code` |
| `Domain.gs` | Script `Domain` |
| `Index.html` | HTML `Index` |
| `appsscript.json` | Manifiesto del proyecto |

Si trabajas desde el código fuente, ejecuta:

```powershell
npm ci
npm run build:google
```

Los cuatro archivos se generan en `dist-apps-script`. `Index.html` es el archivo grande: incluye interfaz, estilos y lector DOCX; no debes sustituirlo por el `index.html` del código fuente.

## 2. Crear el proyecto privado

1. En un navegador de **PC**, entra a <https://script.google.com/home/start> con la cuenta Google que usarás para investigar.
2. Crea un **Nuevo proyecto**, llamado `Trama cualitativa privada`.
3. Reemplaza el contenido de `Code.gs` con el archivo del paquete.
4. Con **+ → Secuencia de comandos**, crea `Domain` y pega `Domain.gs`.
5. Con **+ → HTML**, crea `Index` y pega `Index.html`. No lo nombres `index` en minúsculas.
6. En **Configuración del proyecto**, activa **Mostrar el archivo de manifiesto appsscript.json en el editor**.
7. Reemplaza el manifiesto con el del paquete y guarda todo.

El proyecto debe contener solo estos cuatro archivos; no mezcles código del portal de evaluación ni de otra instalación.

## 3. Autorizar y preparar Drive y Sheets

1. Vuelve al editor, selecciona la función **`setupTrama`** y pulsa **Ejecutar**.
2. Google solicitará autorización para consultar tu identidad y trabajar con Drive y Sheets. Revisa los permisos y continúa **solo si reconoces este proyecto y el código instalado**. No envíes credenciales ni tokens a nadie.
3. Si una política de tu organización bloquea la app o los permisos, detente y consulta al administrador. No cambies la app a pública para sortear el bloqueo.
4. Cuando finalice, el registro de ejecución mostrará los enlaces de la carpeta y la hoja creadas.

Se crea una carpeta **Trama cualitativa · privado**, con la hoja **Trama cualitativa · índices**. Los identificadores y la cuenta propietaria se guardan en las propiedades privadas del script. Reejecutar `setupTrama` reutiliza esos recursos; no borres las propiedades para “reiniciar”.

Los permisos de Drive solicitados son amplios porque las operaciones usadas por Apps Script los requieren. La aplicación trabaja con la carpeta de su instalación; no lee el resto de tus documentos para el análisis. No compartas el proyecto de Apps Script, la carpeta ni la hoja.

## 4. Publicar solo para ti

1. Abre **Implementar → Nueva implementación**.
2. Tipo: **Aplicación web**.
3. **Ejecutar como:** tú, la cuenta que ejecutó `setupTrama`.
4. **Quién tiene acceso:** **Solo yo**.
5. Pulsa **Implementar** y guarda la URL terminada en **`/exec`**.
6. Ábrela con esa misma cuenta Google. Si usas varias cuentas simultáneamente, usa un perfil de navegador exclusivo para esta instalación.

**Nunca elijas “Cualquier persona”, acceso anónimo ni acceso por enlace.** El manifiesto declara `MYSELF`; comprueba también la configuración en el diálogo de implementación.

Además de la restricción del despliegue, cada operación comprueba la cuenta activa y la cuenta de ejecución. Si Google no proporciona una identidad verificable, se deniega el acceso; no hay una alternativa que omita la comprobación.

## 5. Comprobar la instalación antes de usar entrevistas reales

1. Pulsa **Explorar un ejemplo**. Son datos ficticios.
2. Comprueba que aparece **Guardado en Drive privado**.
3. Cambia el nombre del proyecto en Ajustes, espera la confirmación y recarga.
4. En **Drive, índices y versiones**, abre la carpeta y verifica que hay archivos JSON de versión.
5. Pulsa **Actualizar índices de Sheets** y revisa los códigos y referencias en la hoja.
6. Descarga un respaldo JSON, restáuralo y comprueba que aparece como copia independiente.

Solo después importa entrevistas reales. El código puede probarse con dobles de los servicios Google, pero permisos, cuotas y acceso efectivo deben verificarse en esta instalación real.

## 6. Migrar proyectos de la versión pública

1. Abre GitHub Pages **en el navegador donde ya trabajaste**.
2. En cada proyecto, pulsa **Descargar respaldo**.
3. Abre la URL privada de Apps Script.
4. Pulsa **Restaurar un respaldo** y elige el JSON.
5. Espera la confirmación, recarga y verifica documentos, códigos y citas.
6. No borres la copia local ni sus respaldos hasta comprobar la migración.

La restauración conserva texto y trazabilidad, pero los respaldos antiguos no contienen el archivo binario DOCX original. No reimportes el mismo documento para intentar adjuntarlo: sus citas apuntan al texto del documento migrado. Conserva los originales antiguos aparte.

## 7. Uso cotidiano

- **Guardado:** cada cambio confirmado crea una versión completa en Drive. No cierres la pestaña mientras indique **Guardando cambios…**.
- **Conflictos:** si otra pestaña o PC guardó antes, no se sobrescribe su versión.
- **Recuperación local:** los intentos sin confirmación se conservan antes de enviarse a Google. Puedes descargar el JSON, reintentar la misma solicitud o crear una copia independiente. Esto no es un editor sin conexión ni guarda cada tecla antes de pulsar Guardar.
- **Resultado incierto:** una conexión puede fallar después de que Google guardó. Reintentar el mismo intento evita duplicarlo si sigue siendo la revisión vigente. Si ya hay otra revisión, se exige resolver el conflicto.
- **Índices:** pulsa **Actualizar índices de Sheets** al terminar la sesión. Son proyecciones regenerables; no se actualizan en cada clic para reducir escrituras y riesgo de operaciones parciales. Incluyen el banco de Preguntas y los vínculos de cada cita. Si falla la regeneración, Drive sigue siendo la fuente válida.
- **Banco de investigación:** en Ajustes anota todas las preguntas y objetivos, uno por línea. En cada solicitud selecciona solo los pertinentes, independientemente de los documentos o citas elegidos. El banco completo no se incluye en el prompt.
- **Versiones anteriores:** descarga su JSON desde el panel y restáuralo como copia. No se reemplaza una versión vigente automáticamente.
- **Originales:** las nuevas importaciones TXT y DOCX guardan también el archivo original en la subcarpeta `Originales`. El texto pegado solo se conserva en las versiones JSON. Una importación interrumpida puede dejar un original sin proyecto; no borres archivos sin verificar sus referencias.
- **Respuestas de IA externa:** se revisan e incorporan manualmente. El respaldo JSON no es un importador de tablas, texto o respuestas de chats.

## Límites y resguardo

- Exclusivamente PC y uso personal, sin colaboración en tiempo real.
- Límite preventivo de **8 MB por proyecto JSON y por original**. Las solicitudes y versiones incluyen texto: divide estudios muy grandes.
- No sube el corpus a una IA. Sí guarda documentos, memos y prompts en tu cuenta Google.
- No guardes transcripciones completas en celdas. La hoja Citas contiene referencias y posiciones; el texto literal está en la versión JSON correspondiente.
- Algunas celdas muy largas se abrevian en los índices; consulta el JSON para el contenido completo.
- No edites la hoja **Proyectos** ni uses Sheets para cambiar la codificación.
- Las versiones consumen espacio y no se purgan automáticamente. Las cuotas y límites de tiempo de Google pueden bloquear operaciones; conserva respaldos fuera de Google.
- No se añade cifrado propio a los archivos de Drive, los JSON descargados ni los intentos locales del navegador.
- La cuenta Google y el equipo deben cumplir tus compromisos de confidencialidad, consentimiento y resguardo institucional.

## Actualizar el código

Antes de cambiar código, descarga los respaldos. Reemplaza los cuatro archivos del paquete, conserva las propiedades y ejecuta `setupTrama` solo si la actualización lo requiere. Después usa **Implementar → Gestionar implementaciones → Editar → Nueva versión**. Mantén acceso **Solo yo** y el mismo despliegue; cambiar de URL puede separar el almacenamiento de recuperación local.

## Referencias oficiales

- Aplicaciones web: <https://developers.google.com/apps-script/guides/web>
- Identidad de la sesión: <https://developers.google.com/apps-script/reference/base/session>
- Cuotas: <https://developers.google.com/apps-script/guides/services/quotas>
