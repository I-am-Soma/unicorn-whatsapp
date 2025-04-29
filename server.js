const express = require('express');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8080;

// Variables de entorno (no las estamos usando todavía aquí)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Middleware para parsear JSON
app.use(express.json());

// Webhook para recibir mensajes de Vapi
app.post('/webhook', async (req, res) => {
  console.log('=== Body COMPLETO recibido en /webhook ===');
  console.log(JSON.stringify(req.body, null, 2)); // 👈 Esto imprimirá bonito todo el body que llegue

  res.status(200).json({ message: 'Log received' });
});

// Ruta simple para probar que el server funciona
app.get('/', (req, res) => {
  res.send('Webhook server is running and ready to receive Vapi data!');
});

// Iniciar el servidor
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
