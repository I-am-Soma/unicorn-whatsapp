const express = require('express');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8080;

// Supabase config
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Middleware para recibir JSON
app.use(express.json());

// Webhook desde Vapi (mensaje ya procesado)
app.post('/webhook', async (req, res) => {
  console.log('=== Webhook recibido desde Vapi ===');
  console.log(JSON.stringify(req.body, null, 2));

  const { user_message, phone_number, agent_name } = req.body;

  if (!user_message || !phone_number) {
    console.error('Faltan datos importantes:', { user_message, phone_number });
    return res.status(400).json({ error: 'Datos incompletos' });
  }

  try {
    const { data, error } = await supabase
      .from('conversations')
      .insert([
        {
          lead_phone: phone_number,
          last_message: user_message,
          agent_name: agent_name || 'Vapi Default',
          status: 'New',
          created_at: new Date().toISOString()
        }
      ]);

    if (error) {
      console.error('Error al guardar en Supabase:', error);
      return res.status(500).json({ error: 'Error al insertar' });
    }

    console.log('Lead guardado correctamente:', data);
    res.status(200).json({ message: 'Mensaje procesado y guardado.' });
  } catch (err) {
    console.error('Error inesperado:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/', (req, res) => {
  res.send('Servidor listo para recibir Webhooks desde Vapi');
});

app.listen(port, () => {
  console.log(`Servidor activo en puerto ${port}`);
});
