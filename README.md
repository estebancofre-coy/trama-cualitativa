# Trama cualitativa

Aplicación web de análisis cualitativo **manual y sin API de IA**. Diseñada para uso individual, con trazabilidad entre categorías, códigos, citas y entrevistas.

## Usar ahora

La aplicación se publica con GitHub Pages: consulta la URL del despliegue en **Settings → Pages** o en el entorno **github-pages** de este repositorio.

1. Crea un proyecto o explora el ejemplo ficticio.
2. Importa DOCX / TXT UTF-8 o pega una entrevista.
3. Crea códigos con definiciones y criterios, categorías y códigos padres.
4. Selecciona texto en Documentos, asigna códigos y guarda la cita.
5. Recupera citas, consulta su contexto y exporta matrices CSV o insertos HTML.
6. Crea relaciones, agrega citas o memos de respaldo y exporta mapas SVG.
7. En **Prompts sin API**, elige una pregunta, modalidad y alcance explícito. Copia el paquete a un chat externo solo si corresponde.
8. **Descarga un respaldo JSON** al terminar cada sesión.

## Privacidad y almacenamiento

- Los proyectos se almacenan en IndexedDB, en este navegador y dirección web.
- No hay registro de usuario, servidor de entrevistas, analítica, telemetría ni llamadas a IA.
- El hosting recibe las solicitudes normales de acceso al sitio. Las dependencias se empaquetan con la aplicación, sin CDN en tiempo de ejecución.
- No se sincronizan dispositivos. El modo privado, borrar datos del sitio o perder el equipo puede eliminar los proyectos. El navegador también puede desalojar almacenamiento bajo presión.
- Los respaldos contienen texto, citas, memos, solicitudes e historial **sin cifrar**. Consérvalos de forma segura.
- Restaurar JSON crea una copia independiente; no sobrescribe proyectos existentes.
- Copiar a un chat externo es una acción manual. Sus condiciones y tratamientos de datos son independientes de esta app. Anonimiza, revisa consentimientos y considera la reidentificación contextual.

## Prompts focalizados

Cada solicitud utiliza una única pregunta y uno de estos alcances:

- Fragmento seleccionado en el lector.
- Documentos seleccionados expresamente, sin selección automática del corpus.
- Citas previamente codificadas, seleccionadas individualmente.

Las operaciones de subcodificación, categorización y comparación exigen el alcance de citas. Se incluye solo el libro de códigos elegido. La modalidad deductiva exige códigos existentes. El máximo de propuestas nuevas es un presupuesto de revisión, no una cuota que llenar ni un límite metodológico. Cada paquete se archiva íntegro para conservar el alcance exacto.

La app no recibe ni aplica respuestas de IA automáticamente: revisa las sugerencias y registra manualmente las decisiones. Para proyectos de chat nuevos, copia solo lo necesario; un chat largo puede reprocesar su historial.

## Importaciones y exportaciones

| Formato | Uso |
|---|---|
| DOCX | Extracción local de texto con Mammoth. No conserva páginas, formato, imágenes ni tablas como estructura. |
| TXT UTF-8 / pegado | Texto con párrafos y posiciones estables. |
| JSON | Respaldo completo validado y restauración en esta versión de Trama. |
| CSV con `;` y BOM UTF-8 | Libro de códigos o matriz categoría–código–cita–origen. Protección básica contra fórmulas de hoja de cálculo. |
| HTML | Insertos filtrados para abrir en Word o imprimir a PDF en el navegador. No es un archivo DOCX nativo. |
| SVG | Mapa vectorial con etiquetas y posiciones. |

El texto importado es inmutable para no desplazar referencias. Los localizadores son párrafos y posiciones en el texto extraído, **no páginas del documento original**. Las categorías de los subcódigos se asignan explícitamente. Los filtros actuales se aplican a las exportaciones de citas.

## Desarrollo local

Requiere Node.js 20.19+ o 22+.

```powershell
npm ci
npm run dev
```

```powershell
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

## Publicación

El workflow `.github/workflows/pages.yml` prueba, compila y publica únicamente `dist` al enviar cambios a `main`. Configura GitHub Pages con **GitHub Actions** como fuente. No agregues entrevistas, respaldos ni archivos `.env` al repositorio público.

## Límites

Primera versión individual: sin edición colaborativa, sincronización, cifrado local, deshacer global, audio, video, OCR, PDF ni importación de proyectos propietarios de ATLAS.ti. Los mapas permiten relaciones manuales y arrastre; no calculan causalidad ni hacen inferencias automáticas. Los nombres extensos se abrevian visualmente en los nodos, pero se conservan completos en el libro. Conviene conservar los originales fuera de la app y dividir proyectos muy grandes.

No está afiliada a ATLAS.ti.
