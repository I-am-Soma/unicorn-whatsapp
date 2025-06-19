# Unicorn WhatsApp Server

Este proyecto actúa como webhook para recibir mensajes de servicios como Vapi.ai y almacenarlos en Supabase. Incluye integración con Twilio para el envío de WhatsApp, generación de respuestas con OpenAI y conversión de texto a voz con ElevenLabs.

## Requisitos
- Node.js
- Cuenta en Railway (opcional para despliegue)
- Proyecto en Supabase

## Configuración
1. Clona este repositorio.
2. Copia el archivo `.env.example` a `.env` y completa los valores de tus claves.
3. Instala las dependencias con:
   ```bash
   npm install
   ```
4. Inicia el servidor:
   ```bash
   npm start
   ```

## Variables de entorno principales
Estas son las variables mínimas que debes definir en tu archivo `.env` para un funcionamiento completo:

- `SUPABASE_URL` – URL de tu proyecto Supabase
- `SUPABASE_ANON_KEY` – clave anónima de Supabase
- `TWILIO_SID` – SID de tu cuenta Twilio
- `TWILIO_AUTH_TOKEN` – token de autenticación de Twilio
- `TWILIO_WHATSAPP_NUMBER` – número de WhatsApp configurado en Twilio
- `OPENAI_API_KEY` – clave de API de OpenAI
- `ELEVENLABS_API_KEY` – clave de API de ElevenLabs
- `ELEVENLABS_VOICE_ID` – voz a utilizar en ElevenLabs
- `ELEVENLABS_MODEL` – modelo de ElevenLabs (por ejemplo `eleven_multilingual_v2`)
- `PORT` – puerto en el que se ejecutará el servidor

Si no configuras las variables de ElevenLabs el bot funcionará únicamente con respuestas de texto.

## Endpoints
- `POST /webhook`
  - Body JSON: `{ "phone": "string", "message": "string", "agentName": "opcional" }`

Con esta configuración tendrás un servidor capaz de recibir mensajes, almacenarlos en Supabase y responder vía WhatsApp utilizando OpenAI y, opcionalmente, audio de ElevenLabs.
