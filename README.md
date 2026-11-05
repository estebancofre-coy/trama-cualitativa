# TRAMA-QDA

Aplicación web de análisis cualitativo **manual y sin API de IA**. Diseñada para uso individual, con trazabilidad entre categorías, códigos, citas y entrevistas.

**Solo para PC:** se usa desde un navegador de escritorio, con ratón y teclado. Ancho de ventana mínimo: 1100 píxeles. No incluye interfaz ni funciones específicas para móviles.

## Usar ahora

**[Abrir TRAMA-QDA](https://estebancofre-coy.github.io/trama-cualitativa/)** · No requiere instalar nada ni contratar una API.

La URL pública utiliza almacenamiento local. Para **guardado privado en Drive, versiones y Sheets**, instala la variante Apps Script siguiendo [Instalar TRAMA-QDA en Google](docs/INSTALAR-GOOGLE.md). El acceso es exclusivo de la cuenta propietaria; no se conecta GitHub Pages a un endpoint público.

1. Crea un proyecto o explora el ejemplo ficticio.
2. Importa DOCX / TXT UTF-8 o pega una entrevista.
3. Crea códigos con definiciones y criterios, categorías y códigos padres.
4. Selecciona texto en Documentos y crea un código desde el inspector lateral para generar una cita vinculada, o asigna códigos existentes y guarda la cita.
5. Recupera citas por código, categoría o pregunta, consulta su contexto y exporta matrices CSV o insertos HTML.
6. Crea o abre mapas guardados por categoría, pregunta u objetivo en ventanas independientes. Vincula nodos, edita etiquetas, organiza cada mapa y exporta SVG o PNG.
7. En **Prompts sin API**, elige una pregunta, modalidad y alcance explícito. Exporta el prompt en JSON, TXT o Markdown. Por defecto no contiene el texto del corpus: adjunta los documentos originales directamente a la IA externa.
8. Importa su respuesta exclusivamente en JSON y revisa los códigos y citas en **Revisión externa** antes de aceptarlos. La autovalidación es opcional y está desactivada en cada importación.
9. **Descarga un respaldo JSON** al terminar cada sesión.

El último cambio del proyecto puede deshacerse durante la sesión actual. La bitácora conserva tanto la acción como su reversión; en Drive, deshacer crea una versión nueva y no elimina los originales ni las versiones previas.

## Privacidad y almacenamiento

- Los proyectos se almacenan en IndexedDB, en este navegador y dirección web.
- En la instalación privada de Apps Script, Drive es el almacenamiento principal. IndexedDB conserva intentos pendientes y una copia de la última confirmación; Sheets contiene índices regenerables a petición. Ningún fallo remoto activa silenciosamente el modo local.
- No hay registro de usuario, servidor de entrevistas, analítica, telemetría ni llamadas a IA.
- El hosting recibe las solicitudes normales de acceso al sitio. Las dependencias se empaquetan con la aplicación, sin CDN en tiempo de ejecución.
- No se sincronizan dispositivos. El modo privado, borrar datos del sitio o perder el equipo puede eliminar los proyectos. El navegador también puede desalojar almacenamiento bajo presión.
- Los respaldos contienen texto, citas, memos, solicitudes e historial **sin cifrar**. Consérvalos de forma segura.
- Restaurar JSON crea una copia independiente; no sobrescribe proyectos existentes.
- Copiar a un chat externo es una acción manual. Sus condiciones y tratamientos de datos son independientes de esta app. Anonimiza, revisa consentimientos y considera la reidentificación contextual.

## Prompts focalizados

En **Ajustes** registra el banco de preguntas y objetivos, uno por línea. Cada solicitud incluye solo los elementos que selecciones, con una consulta focalizada opcional, y uno de estos alcances:

- Fragmento seleccionado en el lector.
- Documentos seleccionados expresamente, sin selección automática del corpus.
- Citas previamente codificadas, seleccionadas individualmente.

Las operaciones de subcodificación, categorización y comparación exigen el alcance de citas. Se incluye solo el libro de códigos elegido. La modalidad deductiva exige códigos existentes. El máximo de propuestas nuevas es un presupuesto de revisión, no una cuota que llenar ni un límite metodológico. Cada paquete se archiva íntegro para conservar el alcance exacto.

Seleccionar varias preguntas pide resultados separados por ID y conserva un presupuesto global de propuestas, sin duplicar códigos por pregunta ni analizar automáticamente todo el banco. Las citas manuales también pueden vincularse a preguntas u objetivos y filtrarse por ellos; esos vínculos se exportan en CSV e insertos HTML. Quitar o reformular un elemento archiva su versión anterior para no romper referencias. Los respaldos anteriores, sin banco, siguen siendo compatibles.

Los prompts nuevos excluyen por defecto los textos de documentos, selecciones y citas. Conservan las instrucciones, preguntas elegidas, libro autorizado e IDs y límites de origen. Puedes desactivar esa opción para incluir texto explícitamente. JSON, TXT y Markdown son formatos de **exportación del prompt**, no de importación de resultados. Las solicitudes antiguas conservan su contenido original; genera una nueva para obtener el contrato verificable.

## Resultados externos JSON

En **Prompts sin API** o **Revisión externa**, usa **Importar resultados JSON** para seleccionar un archivo `.json` o pegar JSON puro. No se aceptan TXT, Markdown ni bloques de código. El prompt emitido contiene el contrato y los IDs reales de proyecto y solicitud:

```json
{
	"schemaVersion": 1,
	"projectId": "ID-del-proyecto",
	"promptId": "ID-de-la-solicitud",
	"proposals": [
		{
			"id": "propuesta-1",
			"documentId": "ID-del-documento-autorizado",
			"text": "Cita literal exacta del documento",
			"code": { "existingId": "ID-del-codigo-autorizado" },
			"researchQuestionIds": [],
			"memo": "Justificación de la propuesta"
		}
	]
}
```

Para un código nuevo, sustituye `code` por `{"name":"Nombre","description":"Definición","inclusion":"Criterios de inclusión","exclusion":"Criterios de exclusión"}`. Cada propuesta vincula un código y una cita. Los códigos nuevos requieren todos esos campos; los existentes deben estar incluidos en el libro autorizado. Los IDs de propuesta deben ser únicos y no haberse importado antes para esa solicitud. Límite: 2 MB y 500 propuestas por importación.

La verificación comprueba proyecto, solicitud, alcance, documento, coincidencia literal, códigos y preguntas autorizados. Si no hay `start` y `end`, localiza únicamente coincidencias literales únicas dentro del alcance. Las citas repetidas exigen offsets exactos en unidades UTF-16 del texto local normalizado, **no posiciones ni páginas de Word**. No se corrigen citas ni se usa coincidencia aproximada. Si el original difiere del texto extraído, revisa la fuente y corrige la respuesta externa; los resultados discrepantes quedan bloqueados.

Importar sin autovalidación no cambia el libro ni las citas. Acepta o rechaza cada propuesta y consulta el documento de origen. La decisión y los vínculos se conservan en el proyecto y la bitácora. Aceptar vuelve a verificar contra el estado actual y deduplica citas por documento y rango. Se mantiene el presupuesto global de códigos nuevos entre importaciones y la modalidad deductiva impide crearlos.

**Autovalidar y aceptar propuestas verificables** está desactivado por defecto y se activa explícitamente para cada importación. Nunca omite bloqueos y no garantiza validez metodológica: solo comprueba integridad textual y referencias. Las categorías, jerarquías y fusiones se registran como propuestas en memos y se aplican manualmente en el libro. No hay llamadas a IA ni descarga automática de sus respuestas.

Los respaldos antiguos siguen siendo compatibles. Al restaurar un proyecto como copia independiente, genera nuevas solicitudes para futuras importaciones externas: las anteriores identifican el proyecto original.

## Importaciones y exportaciones

### Mapas para exposición de resultados

En **Mapa de relaciones**, elige **Crear mapa** o **Abrir mapa** en la galería. Cada mapa tiene nombre, alcance y disposición propios: una categoría con sus códigos, o los códigos de citas vinculadas a una pregunta u objetivo con sus categorías de contexto. Una pregunta sin citas vinculadas muestra un mapa vacío que se actualiza al codificar evidencia.

Los mapas se abren en ventanas separadas; puedes trabajar con varios en paralelo. Si el navegador bloquea una ventana, permite ventanas emergentes para este sitio y usa **Abrir mapa**: el mapa creado sigue guardado. Abrir nuevamente un mapa ya abierto enfoca su ventana. Los botones compactos muestran ayuda al pasar el ratón o recibir foco con el teclado.

Las ventanas comparten los códigos, categorías, citas y relaciones del proyecto, pero no sus posiciones ni formato de organización. Los cambios se guardan automáticamente y se notifican a las demás ventanas del mismo navegador. **Guardar mapa** permite confirmar el nombre o renombrarlo. Eliminar un mapa elimina su vista guardada, no los datos de análisis. Los respaldos JSON incluyen todos los mapas.

En **Mapa de relaciones**, usa **Conectar nodos** y selecciona el origen y el destino, con clic o Enter. El formulario permite elegir una vinculación existente o **Texto personalizado**, añadir su fundamento y vincular citas de respaldo. Puedes editar una relación haciendo clic sobre su línea o etiqueta, usando Enter/Espacio sobre el vínculo o mediante **Revisar** en la lista. Los nombres admiten hasta 120 caracteres. Las conexiones estructurales del libro se editan mediante categorías y códigos padres, no renombrando su significado en el mapa.

El panel **Relación rápida** permite elegir origen, destino y vínculo mediante botones de selección, sin usar desplegables. Incluye búsqueda por nombre para códigos y categorías, un vínculo personalizado opcional y fundamento o citas de respaldo. Los nodos elegidos se destacan en el mapa. No permite relacionar un nodo consigo mismo y mantiene las mismas comprobaciones de evidencia y fundamento causal del método clásico.

Ambos métodos son abatibles. **Construcción con desplegables** conserva el botón **+ Relación** y su formulario original; ábrelo cuando prefieras ese método. La aplicación recuerda qué paneles dejaste abiertos mientras continúa la sesión, incluso después de guardar u organizar el mapa.

El selector **Organización** ofrece cinco formatos con el motor ELK, empaquetado localmente y sin envío de datos:

- **Ortogonal:** capas de izquierda a derecha con conexiones en ángulo recto.
- **Árbol de izquierda a derecha:** disposición horizontal con categorías y padres como origen visual de la jerarquía.
- **Árbol de arriba hacia abajo:** presentación vertical de la estructura.
- **Capas verticales:** disposición jerárquica vertical con rutas ortogonales.
- **Radial:** distribución alrededor de centros para explorar redes.

Pulsa **Organizar mapa** para aplicar y guardar posiciones, formato y rutas del mapa abierto. Las relaciones cíclicas y los nodos desconectados del alcance se conservan: organizar como árbol no convierte la red en un árbol ni elimina vínculos. Tampoco cambia códigos, categorías, citas ni la dirección semántica de sus relaciones. Doble clic o Enter en un nodo abre su evidencia textual sin salir de la ventana.

**Conexiones** permite cambiar entre rectas y ortogonales conservando las posiciones. Puedes arrastrar nodos después de organizar; al moverlos o cambiar la estructura se descartan las rutas automáticas anteriores y se recalculan conexiones locales. Vuelve a organizar para optimizar de nuevo las rutas y sus etiquetas.

Usa zoom para leer detalles y **Ajustar a pantalla** para encuadrar el conjunto. La exportación **Mapa SVG** incluye toda la extensión del diagrama, no solo la parte visible, con etiquetas horizontales, fondo de etiqueta, colores, rutas y posiciones. El archivo es vectorial y puede ampliarse sin perder calidad. Los respaldos JSON y las versiones de Drive conservan la organización; los proyectos anteriores siguen siendo compatibles.

**Mapa PNG** descarga una imagen del mismo diagrama completo sobre fondo blanco, independiente del zoom o desplazamiento del visor. Normalmente se genera a doble resolución. Para no agotar la memoria del navegador, los mapas grandes se reducen proporcionalmente hasta un máximo de 8192 píxeles por lado y 24 millones de píxeles; para ampliaciones sin pérdida conserva el SVG.

| Formato | Uso |
|---|---|
| DOCX | Extracción local de texto con Mammoth. No conserva páginas, formato, imágenes ni tablas como estructura. |
| TXT UTF-8 / pegado | Texto con párrafos y posiciones estables. |
| JSON | Respaldo completo validado y restauración en esta versión de TRAMA-QDA. |
| JSON de resultados | Propuestas externas vinculadas a una solicitud; verificación, aceptación o rechazo. No es un respaldo. |
| JSON / TXT / MD de prompt | Instrucciones exportables, sin texto del corpus por defecto, con contrato de respuesta JSON. |
| CSV con `;` y BOM UTF-8 | Libro de códigos o matriz categoría–código–cita–origen. Protección básica contra fórmulas de hoja de cálculo. |
| HTML | Insertos filtrados para abrir en Word o imprimir a PDF en el navegador. No es un archivo DOCX nativo. |
| SVG | Mapa vectorial con etiquetas y posiciones. |
| PNG | Imagen del mapa completo con fondo blanco, lista para presentaciones e informes. |

El texto importado es inmutable para no desplazar referencias. Los localizadores son párrafos y posiciones en el texto extraído, **no páginas del documento original**. Las categorías de los subcódigos se asignan explícitamente. Los filtros actuales se aplican a las exportaciones de citas.

## Desarrollo local

Requiere Node.js 20.19+ o 22+.

```powershell
npm ci
npm run dev:local
```

La sesión local usa `http://127.0.0.1:4174/`. El puerto es fijo: si está ocupado, no se cambia automáticamente a otra dirección. Si el servidor ya está activo, usa esa misma URL sin iniciarlo otra vez.

Para conservar el análisis, utiliza siempre el mismo navegador, perfil y dirección, sin modo incógnito. IndexedDB pertenece al origen web: cambiar puerto, dirección, perfil o equipo no traslada los proyectos. Descarga un respaldo JSON desde la aplicación antes de cambiar de entorno y restáuralo en la nueva sesión. Los checkpoints de código no incluyen IndexedDB ni sustituyen ese respaldo.

Los cambios de código sin commit permanecen en el directorio de trabajo. La carpeta ignorada `.local-checkpoints/` puede guardar checkpoints privados con una copia de los fuentes, parches separados del índice y del directorio de trabajo y un bundle del historial Git. Conserva una copia fuera del contenedor antes de eliminar o reconstruir el entorno; no subas respaldos de investigación al repositorio.

```powershell
npm test
npm run build
npm run build:google
npx playwright install chromium
npm run test:e2e
```

## Publicación

El workflow `.github/workflows/pages.yml` prueba, compila y publica únicamente `dist` al enviar cambios a `main`. Configura GitHub Pages con **GitHub Actions** como fuente. No agregues entrevistas, respaldos ni archivos `.env` al repositorio público.

## Límites

Primera versión individual: sin edición colaborativa, sincronización, cifrado local, deshacer global, audio, video, OCR, PDF ni importación de proyectos propietarios de ATLAS.ti. Los mapas permiten relaciones manuales y arrastre; no calculan causalidad ni hacen inferencias automáticas. Los nombres extensos se abrevian visualmente en los nodos, pero se conservan completos en el libro. Conviene conservar los originales fuera de la app y dividir proyectos muy grandes.

La variante Google permite abrir el proyecto desde distintos PC con la misma cuenta y detecta conflictos de revisión, pero no combina ediciones concurrentes. Cada guardado crea un JSON inmutable en Drive; un puntero en la hoja Proyectos identifica la versión vigente. Las pestañas de índices no son una base transaccional ni el lugar para editar el análisis.

No está afiliada a ATLAS.ti.

## Flujos de procesos internos

Los diagramas describen la implementación actual. Las operaciones de investigación no son pasos obligatorios en un orden único: los siete espacios del proyecto pueden recorrerse de forma iterativa. La IA externa se utiliza manualmente y no forma parte del backend de TRAMA-QDA.

### 1. Inicio y navegación general

```mermaid
flowchart TD
	A["Abrir TRAMA-QDA en PC"] --> B["start: abrir IndexedDB y consultar pendientes"]
	B --> C{"Modo de instalación"}
	C -->|Local| D["Leer proyectos desde IndexedDB"]
	C -->|Google privado| E["RPC: autorizar propietario y leer versiones de Drive"]
	D --> F["validateProject: validar y ordenar proyectos"]
	E --> F
	B -->|Fallo| G["Mostrar error sin borrar datos"]
	E -->|Fallo| G
	F -->|Validación fallida| G
	G --> H["Reintentar; recuperación local en modo Google"]
	F --> I{"¿Hay proyectos?"}
	I -->|No| J["Bienvenida: crear, demostrar o restaurar"]
	I -->|Sí| K["Abrir proyecto más reciente"]
	J --> K
	K --> L["render: proyecto y navegación lateral"]
	L --> M["Documentos e inspector de codificación"]
	L --> N["Libro de códigos y categorías"]
	L --> O["Citas, filtros y origen"]
	L --> P["Mapa de relaciones"]
	L --> Q["Prompts sin API"]
	L --> R["Revisión externa"]
	L --> S["Bitácora"]
	L --> T["Ajustes, cambio de proyecto, ayuda y respaldos"]
```

### 2. Corpus, codificación y trazabilidad

```mermaid
flowchart TD
	A{"Entrada de documento"} -->|TXT o DOCX| B["Validar formato y límite de archivo: 20 MB"]
	A -->|Texto pegado| C["Validar nombre y transcripción"]
	B --> D["TXT: leer texto; DOCX: extraer con Mammoth"]
	D --> E["Normalizar saltos de línea y eliminar caracteres nulos"]
	E --> F{"¿Texto legible?"}
	F -->|No| G["Rechazar importación; escaneos requieren OCR externo"]
	F -->|Sí| H{"¿Modo Google?"}
	H -->|Sí| I["Subir original a Drive: máximo 8 MB"]
	H -->|No| J["Conservar solo texto extraído"]
	I --> K["Crear documento con ID, texto y referencia al original"]
	J --> K
	C --> K
	K --> L["Registrar acción y guardar proyecto"]
	L --> M["paragraphs: calcular párrafos y offsets estables"]
	M --> N["Leer, buscar y seleccionar fragmento"]
	N --> O["Capturar documentId, start y end desde la selección DOM"]
	O --> P{"Acción en inspector lateral"}
	P -->|Códigos existentes| Q["Elegir códigos, preguntas y memo"]
	P -->|Código nuevo| R["Definir código, criterios, color y jerarquía"]
	R --> S["Crear código y cita en la misma mutación"]
	Q --> T["addQuote: validar rango y referencias"]
	S --> T
	T --> U{"¿Ya existe cita con ese documento y rango?"}
	U -->|Sí| V["Unir códigos y preguntas; añadir memo"]
	U -->|No| W["Crear ID de cita y copiar texto literal del documento"]
	V --> X["Registrar en bitácora, validar proyecto y guardar"]
	W --> X
	X --> Y["Trazabilidad: categoría - código - cita - documento"]
	Y --> Z["Filtrar citas, editar asignaciones o volver al contexto"]
	AA["Ajustes: editar banco de preguntas y objetivos"] --> AB["updateResearchBank: conservar IDs estables y archivar versiones retiradas"]
	AB --> X
	AC["Libro: editar códigos, categorías y padres"] --> AD["Validar nombres, referencias y ausencia de ciclos"]
	AD --> X
```

El texto fuente no se edita después de importarse. Las categorías se asignan explícitamente a cada código, incluidos los subcódigos. Los localizadores son posiciones del texto extraído, no páginas del archivo Word.

### 3. Prompts y revisión de resultados externos

```mermaid
flowchart TD
	A["Elegir preguntas, modalidad, operación y presupuesto"] --> B["Seleccionar fragmento, documentos o citas autorizados"]
	B --> C["Seleccionar libro de códigos pertinente"]
	C --> D["promptText: validar alcance y restricciones metodológicas"]
	D -->|Inválido| E["Mostrar error sin guardar solicitud"]
	D -->|Válido| F{"¿Excluir texto del corpus? Por defecto: sí"}
	F -->|Sí| G["Emitir instrucciones, IDs y límites; sin transcripciones"]
	F -->|No| H["Incluir únicamente evidencia elegida"]
	G --> I["Guardar prompt exacto y manifest del alcance con ID de solicitud"]
	H --> I
	I --> J["Exportar JSON, TXT o MD; o copiar texto"]
	J -.-> K["Persona: entregar prompt y originales a IA externa"]
	K -.-> L["Persona: obtener respuesta JSON y traerla a TRAMA-QDA"]
	L --> M["Importar archivo .json o pegar JSON puro"]
	M --> N["stageExternalResults: comprobar tamaño, esquema, proyecto, solicitud e IDs únicos"]
	N -->|Contrato inválido| O["Rechazar lote sin modificar el proyecto"]
	N -->|Contrato válido| P["verifyExternalProposal: verificar cada propuesta"]
	P --> Q["Comprobar documento, alcance, literalidad y offsets; buscar coincidencia única si faltan"]
	Q --> R["Comprobar códigos, preguntas, modalidad y presupuesto global"]
	R --> S{"¿Propuesta verificable?"}
	S -->|No| T["Guardar propuesta bloqueada con motivo; sin aplicar código ni cita"]
	S -->|Sí| U["Guardar propuesta pendiente"]
	U --> V{"¿Autovalidación activada para esta importación?"}
	V -->|No, por defecto| W["Persona: revisar propuesta y consultar documento"]
	W -->|Aceptar| X["decideExternalResult: repetir verificación contra estado actual"]
	W -->|Rechazar| Y["Registrar rechazo; no cambiar código ni cita"]
	T -->|Rechazar| Y
	V -->|Sí| X
	X -->|Falla| Z["No aplicar; informar bloqueo o error de aceptación"]
	X -->|Pasa| AA["Reutilizar código autorizado o crear código nuevo completo"]
	AA --> AB["addQuote: vincular cita literal, código, preguntas y memo"]
	AB --> AC["Registrar aceptación y IDs de código y cita"]
	AC --> AD["Validar y guardar; actualizar revisión y bitácora"]
	Y --> AD
	T --> AD
```

Las flechas discontinuas representan transferencias manuales fuera de la aplicación. La importación admite hasta 500 propuestas; los archivos JSON tienen un límite de 2 MB. La autovalidación solo comprueba integridad textual y referencias, no calidad metodológica. Las propuestas de categorías, jerarquías y fusiones se describen en memos y se aplican manualmente en el libro.

### 4. Mutación, persistencia y conflictos

```mermaid
flowchart TD
	A["Cambio de un proyecto existente"] --> B{"¿Hay otro guardado en curso?"}
	B -->|Sí| C["Bloquear acción y pedir esperar"]
	B -->|No| D["mutate: activar estado de guardado y clonar estado previo y siguiente"]
	D --> E["Aplicar cambio sobre la copia y registrar acciones"]
	E --> F["validateProject: validar esquema, IDs, citas, referencias y jerarquías"]
	E -->|Excepción| G["Informar error; conservar proyecto confirmado"]
	F -->|Inválido| G
	F -->|Válido| H["saveProject con updatedAt esperado"]
	H --> I{"Modo de almacenamiento"}
	I -->|Local| J["Transacción de lectura y escritura en IndexedDB"]
	J --> K{"¿Coincide la revisión esperada?"}
	K -->|No| L["Abortar transacción; pedir recarga por conflicto entre pestañas"]
	K -->|Sí| M["Escribir proyecto y esperar fin de transacción"]
	I -->|Google| N["Guardar intento completo en pending con ID de operación"]
	N --> O["cloudCall: RPC con límite de espera de 90 segundos"]
	O --> P["Backend: autorizar propietario, validar payload y límite de 8 MB"]
	P --> Q["Adquirir lock y consultar puntero de versión vigente"]
	Q --> R{"¿Operación ya confirmada como vigente?"}
	R -->|Sí| S["Devolver versión existente sin duplicarla"]
	R -->|No| T{"¿Coincide la revisión esperada?"}
	T -->|No| U["Rechazar conflicto; conservar intento local"]
	T -->|Sí| V["Crear JSON completo e inmutable en Drive"]
	V --> W["Actualizar puntero Proyectos en Sheets y marcar índices desactualizados"]
	W --> S
	S --> X["Cliente: validar respuesta, proyecto e ID de revisión"]
	X --> Y["Transacción local: actualizar copia confirmada y eliminar pending"]
	O -->|Fallo o timeout| U
	P -->|Fallo| U
	X -->|Respuesta inválida| U
	Y -->|Fallo local| U
	M --> Z["Actualizar estado visible y snapshot para deshacer"]
	M -->|Fallo de transacción| G
	N -->|Fallo antes de conservar intento| G
	V -->|Fallo de Drive| U
	W -->|Fallo de actualización del puntero| U
	Y --> Z
	Z --> AA["render, actualizar contador de pendientes y liberar estado de guardado"]
	G --> AA
	L --> AA
	U --> AA
```

La creación, demostración y restauración de proyectos usan `saveProject` directamente, sin snapshot de deshacer. No existe fallback silencioso de Drive a almacenamiento local. Un error anterior a la escritura en `pending` no garantiza que haya un intento recuperable. Un timeout puede ocurrir después de que Google haya recibido la operación.

### 5. Mapa e índices consultables

```mermaid
flowchart TD
	A["Galería: crear mapa o abrir uno guardado"] --> SCOPE["Elegir categoría o pregunta / objetivo"]
	SCOPE --> B["Ventana independiente: mapEditorView con nodos y relaciones del alcance"]
	B --> C["Restaurar posiciones de este mapa o calcular iniciales"]
	C --> D["setupMapEditor: dibujar conexiones y ajustar etiquetas"]
	D --> E["Arrastrar nodo, cambiar zoom o ajustar mapa"]
	D --> ELK["Elegir formato y organizar con ELK: ortogonal, árboles, capas o radial"]
	ELK --> SAVE["Guardar posiciones, formato y rutas; conservar relaciones y evidencia"]
	SAVE --> C
	D --> CONNECT["Conectar nodos: seleccionar origen y destino"]
	CONNECT --> J
	D --> EDIT["Clic o Enter en un vínculo interpretativo: editar nombre y fundamento"]
	EDIT --> J
	E -->|Arrastre terminado| F["Guardar posición y registrar reubicación"]
	D --> G["Doble clic o Enter en un nodo"]
	G -->|Código| H["Mostrar evidencia del código en este alcance"]
	G -->|Categoría| I["Mostrar evidencia de sus códigos en este alcance"]
	J["Crear o editar relación dirigida"] --> K["Validar nodos distintos, tipo y memo o citas de respaldo"]
	K --> L["Exigir fundamento en memo si el tipo es causal"]
	L --> M["Guardar relación y regenerar mapa"]
	M --> B
	D --> N["Exportar SVG o PNG completo con etiquetas y posiciones"]
	O["Persona: solicitar actualización de índices de Sheets"] --> P["rebuildCloudIndexes: autorizar, adquirir lock y leer versiones vigentes"]
	P --> Q["Proyectar documentos, preguntas, categorías, códigos, citas, relaciones y bitácora"]
	Q --> R["Proteger celdas y escribir por lotes; marcar índices actualizados al completar"]
	R --> S["Consultar índices; no editar el análisis desde Sheets"]
```

Los índices se reconstruyen a petición, no en cada guardado. No contienen transcripciones completas y no sustituyen los JSON canónicos de Drive. Cada entrada de `savedMaps` conserva su alcance, posiciones y organización dentro del proyecto; zoom y ajuste de vista no se guardan como posiciones de nodos. `BroadcastChannel` notifica cambios entre ventanas del mismo origen; el almacenamiento sigue siendo local o Drive, según la instalación. No implica colaboración ni sincronización entre dispositivos.

### 6. Exportaciones, respaldo, versiones y recuperación

```mermaid
flowchart TD
	A["Proyecto confirmado"] --> B["Exportar libro de códigos CSV"]
	A --> C["Filtrar citas por categoría, código, pregunta o búsqueda"]
	C --> D["Exportar matriz CSV o insertos HTML con origen"]
	A --> E["Descargar respaldo JSON completo, incluida bitácora y revisión externa"]
	F["Seleccionar respaldo JSON"] --> G["Parsear y validateProject"]
	G -->|Inválido| H["Rechazar sin sobrescribir proyectos"]
	G -->|Válido| I["Asignar nuevo ID y nombre de copia; registrar restauración"]
	I --> J["Guardar proyecto independiente y abrirlo"]
	A --> K["Deshacer último cambio disponible durante la sesión"]
	K --> L["Restaurar snapshot, conservar bitácora y registrar reversión"]
	L --> M["Validar y guardar; en Drive crear otra versión"]
	N["Panel Google: listar versiones del proyecto"] --> O["Comprobar pertenencia y descargar versión JSON"]
	O --> F
	P["Panel de recuperación: listar pending"] --> Q{"Decisión de la persona"}
	Q -->|Descargar| R["Exportar JSON del intento pendiente"]
	Q -->|Reintentar| S["Reenviar con el mismo ID y revisión esperada"]
	S -->|Confirmado| T["Actualizar copia local, eliminar intento y recargar proyecto"]
	S -->|Conflicto o fallo| P
	Q -->|Guardar como copia| U["Nuevo ID y nombre; guardar sin reemplazar original"]
	U -->|Confirmado| T
	Q -->|Descartar| V["Confirmar eliminación solo del intento local; no modificar Drive"]
```

Restaurar o recuperar como copia no reemplaza el proyecto original. Para futuras importaciones externas en una copia, genera nuevas solicitudes con el nuevo ID de proyecto. Deshacer solo revierte el último cambio disponible en la sesión; no es un historial multinivel.

### 7. Construcción y distribución

```mermaid
flowchart LR
	A["Código fuente, estilos y dependencias"] --> B["Vite: compilación web"]
	B --> C["dist: HTML y recursos empaquetados"]
	C --> D["GitHub Pages: variante local"]
	A --> E["build-apps-script: integrar JS y CSS en Index.html"]
	F["domain.js"] --> G["Generar Domain.gs y adaptar UUID para Apps Script"]
	E --> H["Paquete privado: Index.html, Domain.gs, Code.gs y manifiesto"]
	G --> H
	H --> I["Persona: instalar archivos en Apps Script"]
	I --> J["setupTrama: configurar propietario, carpeta privada y hoja de índices"]
	J --> K["Persona: desplegar aplicación privada para su cuenta"]
	K --> L["Interfaz con modo Google y RPC propietario"]
```

La publicación pública distribuye código, no entrevistas ni respaldos. La instalación privada requiere autorización y despliegue de la persona propietaria en Google.
