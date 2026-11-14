# VacationCoordinator

Web app para coordinar en familia vacaciones, permisos, bajas y días sin cole: quién cubre cada día,
qué días quedan sin cubrir y cuántos días de cada tipo se han gastado y quedan.

Toda la información se guarda en una hoja de cálculo de Google (la app no tiene base de datos propia).

## Cómo funciona

- **Calendario**: una fila por día y una columna por persona. Se toca una celda, se elige el código y,
  si hace falta, una fecha «hasta» para rellenar un rango (salta fines de semana y festivos).
- **Días sin cubrir**: un laborable está sin cubrir si algún niño necesita a alguien (sin cole, enfermo,
  festivo) y la cobertura de adultos y abuelos no suma 1. El teletrabajo no cubre; la baja sí; dos medias
  bajas (`MB`) suman un día.
- **Año**: el año entero en una pantalla, con los días sin cubrir marcados en rojo.
- **Saldos**: por persona y tipo, disponibles (editable), gastados, planificados y restantes. Las vacaciones
  (`V`) que sobran de un año pasan solas al siguiente como `VP`, con el mes límite de cada persona.
- **Permiso**: planificador del permiso por nacimiento en bloques de semanas naturales completas, con avisos
  si el plan no encaja en las reglas (editables) y una línea de tiempo para ver solapes y huecos. Al guardar,
  las semanas se anotan como `PN` en el calendario.
- **Ajustes**: personas, patrón semanal de teletrabajo, códigos, festivos y no lectivos.

## Formato de la hoja de cálculo

La app crea y gestiona estas hojas; las hojas de años anteriores con otro formato no se tocan.

- `Config`: seis tablas en paralelo: personas (A-D), códigos (E-I), cuotas (K-N), festivos / no lectivos (P-S),
  bloques de permiso por nacimiento (U-X) y ajustes del permiso (Y-Z).
- Una hoja por año (`2027`…): `Mes | Persona | 1 … 31`, con un bloque por mes y una fila por persona.
  Cada celda contiene un código. A la derecha (columna AI) hay un resumen con fórmulas.

Una hoja de año rellenada a mano con otro formato se puede importar desde la app; la original se conserva
como `<año> original`.

Se puede editar la hoja a mano respetando ese formato. Si se cambian personas o códigos desde la app,
las hojas de año se regeneran.

## Puesta en marcha

1. **Hoja de cálculo**: debe ser una hoja de Google nativa. Si es un `.xlsx` en Drive: abrirlo y
   *Archivo → Guardar como Hojas de cálculo de Google*.
2. **Cliente OAuth de Google** (una vez):
   - En [Google Cloud Console](https://console.cloud.google.com/) crear un proyecto y activar *Google Sheets API*.
   - Configurar la pantalla de consentimiento (tipo externo, en modo de prueba) y añadir como usuarios de
     prueba las cuentas que van a usar la app.
   - Crear credenciales *ID de cliente de OAuth → Aplicación web*, con la URL de la app tanto en
     *Orígenes autorizados de JavaScript* (p. ej. `https://usuario.github.io`) como en
     *URIs de redireccionamiento autorizados* (p. ej. `https://usuario.github.io/VacationCoordinator/`).
3. **Publicar**: el workflow `.github/workflows/deploy.yml` publica en GitHub Pages al subir a `main`
   (en el repositorio: *Settings → Pages → Source: GitHub Actions*). Opcionalmente, definir la variable de
   repositorio `VITE_GOOGLE_CLIENT_ID` para no tener que pegar el ID de cliente en cada dispositivo.
4. **En cada dispositivo**: abrir la app, pegar el enlace de la hoja y el ID de cliente, e iniciar sesión.
   En iPhone: *Compartir → Añadir a pantalla de inicio*.

El ID de la hoja y el token se guardan solo en el navegador de cada dispositivo, no en el repositorio.

### Sesión

El token de Google dura una hora y una app sin servidor no puede obtener uno de larga duración. La app lo
renueva en silencio (redirección con `prompt=none`) mientras la cuenta de Google siga abierta en el navegador,
así que no hay que volver a iniciar sesión. Con la pantalla de consentimiento «En pruebas», Google caduca el
permiso a los 7 días y pedirá confirmarlo de nuevo; para evitarlo hay que pasar la app a «En producción»
(con menos de 100 usuarios no exige verificación, solo muestra un aviso la primera vez).

## Desarrollo

```bash
npm install
npm run dev     # servidor local; «Probar en modo demo» funciona sin Google
npm test        # tests de la lógica y del almacenamiento
npm run build
```

Los festivos precargados corresponden a Madrid capital 2027. Los festivos locales y los días no lectivos
están marcados como «sin confirmar» y conviene revisarlos contra el BOCM y el calendario del centro.
