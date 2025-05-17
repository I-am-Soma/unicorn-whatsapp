const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8080;

// Supabase config
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Webhook desde Twilio
app.post('/webhook', async (req, res) => {
  console.log('=== Webhook recibido desde Twilio ===');
  console.log(JSON.stringify(req.body, null, 2));

  const message = req.body.Body;
  const phone = req.body.From;
  const name = req.body.ProfileName || 'SMS User';

  if (!message || !phone) {
    console.error('Faltan datos para guardar:', { message, phone });
    return res.status(400).json({ error: 'Missing message or phone' });
  }

  try {
    const { data, error } = await supabase
      .from('conversations')
      .insert([
        {
          lead_phone: phone,
          last_message: message,
          agent_name: name,
          status: 'New',
          created_at: new Date().toISOString(),
          origen: 'whatsapp',
          procesar: true
        }
      ])
      .select();

    if (error) {
      console.error('Error al guardar en Supabase:', error);
      return res.status(500).json({ error: 'Error inserting in Supabase' });
    }

    console.log('✅ Lead guardado correctamente:', data[0]);
    res.status(200).json({ message: 'Mensaje procesado y guardado.' });
  } catch (err) {
    console.error('❌ Error inesperado:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Función de polling para enviar mensajes a Vapi
const pollSupabase = async () => {
  try {
    console.log('🔁 Revisando mensajes nuevos para Vapi...');

    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('procesar', true);

    if (error) {
      console.error('❌ Error al consultar Supabase:', error);
      return;
    }

    for (const row of data) {
      try {
        const response = await axios.post(
          'https://api.vapi.ai/message',
          {
            phone_number: row.lead_phone,
            user_message: row.last_message,
            agent_name: row.agent_name || 'Unicorn AI'
          },
          {
            headers: { 'Content-Type': 'application/json' }
          }
        );

        console.log('✅ Mensaje enviado a Vapi:', response.data);

        // Actualizar el estado del mensaje para evitar reenvíos
        await supabase
          .from('conversations')
          .update({ procesar: false })
          .eq('id', row.id);
      } catch (error) {
        console.error(`❌ Error al enviar a Vapi (id: ${row.id}):`, error.message);
      }
    }
  } catch (err) {
    console.error('❌ Error inesperado en el polling:', err);
  }
};

// Iniciar el polling cada 10 segundos
setInterval(pollSupabase, 10000);

// Endpoint de prueba
app.get('/', (req, res) => {
  res.send('🟢 Servidor activo escuchando Webhooks de Twilio y Supabase.');
});

app.listen(port, () => {
  console.log(`🟢 Server escuchando en puerto ${port}`);
});
