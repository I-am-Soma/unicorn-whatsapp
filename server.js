const express = require('express');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8080;

// Variables de entorno (aunque no estamos usando Supabase aún)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Middleware para parsear JSON
app.use(express.json());

// Webhook para recibir mensajes de Vapi
app.post('/webhook', async (req, res) => {
  console.log('=== Headers recibidos ===');
  console.log(JSON.stringify(req.headers, null, 2)); // 👈 Imprimimos headers recibidos

  console.log('=== Body COMPLETO recibido en /webhook ===');
  console.log(JSON.stringify(req.body, null, 2)); // 👈 Imprimimos bonito el body recibido

  res.status(200).json({ message: 'Log received' });
});

// Ruta simple para confirmar que el server está corriendo
app.get('/', (req, res) => {
  res.send('Webhook server is running and ready to receive Vapi data!');
});

// Iniciar el servidor
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

