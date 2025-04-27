# Vapi Webhook to Supabase Server

Este servidor escucha mensajes de Vapi.ai y los guarda automáticamente en Supabase.

## Requisitos:
- Node.js
- Railway account
- Supabase project

## Variables de entorno necesarias:
- SUPABASE_URL
- SUPABASE_ANON_KEY

## Comandos:
```bash
npm install
npm start
```

## Endpoints:
- POST `/webhook`
  - Body JSON: `{ "phone": "string", "message": "string", "agentName": "optional string" }`
