# Garabato Club

Juego web multijugador de dibujo y adivinanzas para salas privadas. No requiere cuentas: una persona crea una sala, comparte el enlace o código de cinco caracteres y el resto entra desde el navegador.

## Qué incluye

- Salas privadas, anfitrión transferible y reconexión mediante un identificador local.
- Configuración de rondas, duración, opciones, repeticiones y aforo (hasta 12 personas).
- Palabras predeterminadas, personalizadas o combinadas; limpieza de duplicados y validación de cantidad.
- Turnos y puntuación controlados exclusivamente por el servidor.
- Selector privado de palabra y pista por número de letras para quienes adivinan.
- Canvas responsive con lápiz, borrador, colores, grosor, deshacer y limpiar.
- Trazos y chat en tiempo real mediante Socket.IO, con límites de frecuencia.
- Respuestas tolerantes a mayúsculas, acentos y espacios; clasificación final.

## Requisitos

- Node.js 20 o posterior
- npm 10 o posterior

## Ejecutar en local

Desde la raíz del proyecto:

```bash
npm install
copy .env.example .env
npm run dev
```

En macOS/Linux, usa `cp .env.example .env`. Abre `http://localhost:5173`. Vite sirve el cliente y redirige Socket.IO/API al servidor en `http://localhost:3001`.

Para probar la experiencia multijugador, abre el enlace de sala en otro navegador, dispositivo o ventana privada. Los dispositivos deben poder acceder a la dirección del equipo; en ese caso inicia Vite con `npm run dev -w client -- --host` y configura el origen correspondiente en `.env`.

## Pruebas y compilación

```bash
npm test
npm run build
npm start
```

Tras compilar, Express sirve tanto la API/Socket.IO como los archivos estáticos de React en `http://localhost:3001`.

## Despliegue en Render

El repositorio incluye `render.yaml`:

1. Sube el proyecto a un repositorio Git.
2. En Render, elige **New > Blueprint** y conecta el repositorio.
3. Revisa el servicio gratuito que Render propone y pulsa **Deploy Blueprint**.
4. El build ejecuta `npm install && npm run build` y el servicio arranca con `npm start`.

En Railway crea un servicio desde el mismo repositorio, usa `npm run build` como comando de build y `npm start` como comando de inicio. `PORT` lo aporta automáticamente la plataforma. `CLIENT_ORIGIN` es opcional y sólo hace falta si el frontend se aloja en un dominio distinto del servidor.

## Arquitectura y seguridad

`client/` contiene React, TypeScript, Vite y el canvas. `server/` contiene Express, Socket.IO, el estado de salas y las reglas de juego. `shared/` contiene contratos compartidos.

Las palabras secretas sólo se envían al socket del dibujante. El servidor valida identidad, fase, permisos y forma de los eventos; limita mensajes y segmentos; sanitiza texto; y no registra palabras. Las salas viven en memoria y se eliminan un minuto después de quedar vacías.

## Para llevarlo a producción

Este MVP está pensado para una sola instancia. Para escalar horizontalmente harían falta un almacén compartido (por ejemplo Redis), el adaptador Redis de Socket.IO y afinidad de sesiones. También conviene añadir métricas, registros estructurados sin datos sensibles, protección distribuida contra abuso, pruebas end-to-end con varios navegadores, moderación de nombres/chat y una estrategia explícita de privacidad y retención. En hosts gratuitos, la instancia puede dormirse y perder las salas en memoria, comportamiento esperado para este alcance.
