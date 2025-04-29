const express = require('express');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8080;

// Variables de entorno
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Middleware para parsear JSON
app.use(express.json());

// Webhook para recibir mensajes de Vapi
app.post('/webhook', async (req, res) => {
  console.log('=== Body COMPLETO recibido en /webhook ===');
  console.log(JSON.stringify(req.body, null, 2));

  // 🔵 Ahora extraemos correctamente:
  const user_message = req.body.input?.transcript;
  const phone_number = req.body.session?.user?.phone_num;
  const agent_name = "Unicorn Lead Bot"; // Si quieres dejarlo fijo

  if (!user_message || !phone_number) {
    console.error('Faltan datos importantes:', { user_message, phone_number });
    return res.status(400).json({ error: 'Missing user_message or phone_number' });
  }

  try {
    const { data, error } = await supabase
      .from('conversations')
      .insert([
        {
          lead_phone: phone_number,
          last_message: user_message,
          agent_name: agent_name,
          status: 'New',
          created_at: new Date().toISOString()
        }
      ]);

    if (error) {
      console.error('Error al insertar en Supabase:', error);
      return res.status(500).json({ error: 'Error inserting data' });
    }

    console.log('Mensaje guardado exitosamente en Supabase:', data);
    res.status(200).json({ message: 'Data received and inserted successfully' });
  } catch (err) {
    console.error('Unexpected server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Ruta básica para probar si el servidor corre
app.get('/', (req, res) => {
  res.send('Webhook server is running and ready to receive Vapi data!');
});

// Iniciar el servidor
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

