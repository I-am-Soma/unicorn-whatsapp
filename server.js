const express = require('express');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8080;

// Variables de entorno
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Middleware para parsear JSON y URL-encoded (¡esto es lo nuevo!)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Webhook para recibir mensajes de Vapi/Twilio
app.post('/webhook', async (req, res) => {
  console.log('=== Headers recibidos ===');
  console.log(JSON.stringify(req.headers, null, 2));

  console.log('=== Body COMPLETO recibido en /webhook ===');
  console.log(JSON.stringify(req.body, null, 2));

  res.status(200).json({ message: 'Log received' });
});

// Ruta de prueba
app.get('/', (req, res) => {
  res.send('Webhook server is running and ready to receive Vapi data!');
});

// Iniciar el servidor
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

