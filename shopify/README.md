# Shopify — Mandarina Republic (mandarinaec.com)

Este directorio **no es parte de la app Next.js** de IND INBOX. Es el lugar donde
versionamos los archivos de tema de Shopify que se editan desde acá, para que no
se pierdan cuando el entorno remoto se recicla.

## `sections/mrh-mapa.liquid` — MR · Mapa interactivo

Mapa top-down navegable en pixel art para el home. Cada edificio es una colección:
al pisar la puerta (o tocar el edificio, o el chip de abajo) se abre un diálogo
estilo RPG con el nombre del universo, un par de productos y el botón a la colección.

- **Arte 100% original dibujado por código.** No hay imágenes que descargar ni un
  solo asset de terceros: el mundo, los edificios y los personajes se pintan en
  un `<canvas>` a partir de rectángulos y sprites en texto. Cero tiles copiados.
- **Autocontenida.** Trae sus propios tokens, tipografías y script; no depende de
  `mrh.css` ni de `mrh.js`. El mismo archivo funciona en el tema live y en
  cualquier tema viejo que se use de sandbox.
- **Accesible y rastreable.** Los nombres de los edificios y los chips son `<a>`
  reales con el link a la colección, así que sirven con teclado, con lector de
  pantalla y para Google aunque el canvas no llegue a dibujarse. Las flechas solo
  se capturan cuando el mapa tiene el foco: nunca le roban el scroll a la página.
- **Barata de correr.** El mundo se pinta una sola vez en un canvas fuera de
  pantalla; el bucle solo corre mientras la sección está visible y la pestaña
  activa. Resolución interna ~2.4 px por píxel del mundo: panorámico en
  escritorio, de cerca en el móvil.

### La mandarina salvaje (promo)
Hay una mandarina andando suelta por el mapa. Pasea sola, y si te le acercas
huye — un poco más lenta que vos, así que se deja alcanzar con algo de insistencia.
Al tocarla suelta el código de descuento en una caja con botón de copiar y un
botón que lleva al catálogo **con el código ya aplicado** (`/discount/CODIGO`).
Después se esconde y vuelve a salir en otro punto del mapa a los N segundos.

El código, los textos y el tiempo de reaparición se configuran en la sección.
Por defecto usa `MANDARINA10`, que ya existe y está activo en la tienda: la
sección **no crea descuentos**, solo usa uno que ya exista. Si se pone un código
que no existe, el botón lleva a un descuento inválido — hay que crearlo primero
en Shopify → Descuentos.

### Cómo se controla
- Escritorio: tocar el mapa para enfocarlo, flechas o WASD para caminar, `E` /
  Enter para entrar, `Escape` para cerrar.
- Móvil: D-pad y botón `E`; también se puede tocar un edificio directamente.
- Los chips de abajo son viaje rápido: llevan al personaje a la puerta y abren
  el universo.

### Editable desde el editor de temas
Cada universo es un bloque (colección, nombre en el mapa, color del techo, texto
del diálogo). El mapa se arma solo alrededor de los bloques que haya: dos filas
de edificios, avenidas, callejones y bosque de borde se generan según cuántos
sean. Máximo 12.

## Dónde se puede montar

La misma sección sirve en tres lugares, y no se estorban entre sí:

1. **En el home**, como una sección más del `index.json` (se agrega desde el
   editor de temas: *Agregar sección → MR · Mapa interactivo*).
2. **En una página propia** — es lo que conviene si la idea es que la gente
   entre a jugar. La página `Mandarina World` (`/pages/mandarina-world`) usa el
   sufijo de plantilla `mapa`, que carga `templates/page.mapa.json`. Al tener URL
   fija se puede poner en el menú, compartir en redes y linkear desde el home.
3. **Como home alternativo** para probar, con `templates/index.mapa.json` y
   `?view=mapa` — sin tocar el `index.json` que ya tenga el tema.

El cuerpo de la página trae un texto de respaldo a propósito: si se abre con un
tema que todavía no tiene `templates/page.mapa.json`, se ve una página normal con
la intro y un link al catálogo, nunca una página vacía.

## `backups/`
Copias de archivos de tema **antes** de tocarlos, por si hay que restaurar.
