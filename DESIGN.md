# Sistema visual de TRAMA-QDA

Interfaz Operate: mesa de análisis tipo ATLAS.ti, elegida para priorizar lectura, codificación manual y evidencia por encima de ornamentos.

## Lenguaje

- Identidad C, «Margen de cita»: símbolo de corchete, firma tipográfica y lectura editorial. Paleta de interfaz A: navegación tinta `#16302b`, acciones verde trama `#0f6b5c`, superficies blancas y papel `#fafaf7`.
- Texto principal `#16302b`, secundario `#5d665f`, selección `#e3efeb`. Textos claros `#f4f8f5` y `#c7e7d9` sobre superficies oscuras; rojo `#b42318` reservado para nota de marca y errores.
- Colores de códigos semánticos configurables; cada código conserva además su nombre textual.
- Libre Franklin para interfaz y títulos, Libre Baskerville para citas y transcripciones, IBM Plex Mono para posiciones. Fuentes abiertas empaquetadas localmente, sin llamadas a CDN; también integradas en el HTML privado de Google.
- Contornos de un píxel, radios de 4–6 px y jerarquía por disposición y espacios.
- Iconografía Lucide con nombres accesibles originales. El logo tiene una superficie clara propia para que el corchete también sea legible como favicon o sobre la navegación oscura.

## Composición

Rail de proyectos y navegación, encabezado de contexto, herramientas por vista y espacio de trabajo. El lector separa corpus, transcripción y codificación. Uso exclusivo en PC, con ancho mínimo de 1100 píxeles; se conserva el ajuste para ventanas de portátiles, sin diseño móvil.

## Estados e interacción

Vacíos accionables, confirmaciones para eliminar, errores persistentes, guardado transaccional local y foco visible. Citas resaltadas con etiquetas textuales. Mapas con jerarquías discontinuas y relaciones continuas, arrastre y apertura de evidencia mediante teclado.

Las etiquetas conservan el color asignado como borde y punto, pero su nombre se presenta en tinta de alto contraste. Los nodos de categoría usan texto claro sobre fondo tinta. Las propuestas pendientes tienen borde discontinuo; aceptación, bloqueo y rechazo tienen icono y texto además de color. Los memos se distinguen como notas al margen y las citas con un corchete lateral.

La prueba de branding verifica un contraste mínimo de 4,5:1 en navegación, controles, metadatos y etiquetas; comprueba el corchete del logo mediante píxeles renderizados con ratio superior a 7:1. Se revisan las siete vistas a 1440 y 1100 píxeles, sin alterar lógica de análisis, esquemas ni datos almacenados.

## Datos y fidelidad

Los ejemplos son ficticios y están identificados como tales. Ninguna interacción de preparación de prompts envía datos al exterior. La interfaz distingue almacenamiento local de respaldo y avisa sobre el riesgo de pérdida.
