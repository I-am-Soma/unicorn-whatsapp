const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8080;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Endpoint principal
app.post('/webhook', async (req, res) => {
  console.log('📩 Webhook recibido');
  const { Body, From, ProfileName } = req.body;
  const message = Body;
  const phone = From;
  const name = ProfileName || 'SMS User';

  if (!message || !phone) {
    console.error('❌ Faltan datos para guardar:', { message, phone });
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
      console.error('❌ Error al guardar en Supabase:', error);
      return res.status(500).json({ error: 'Supabase insert error' });
    }

    console.log('✅ Guardado en Supabase:', data[0]);

    // Enviar de regreso si viene de origen "unicorn"
    const inserted = data[0];
    if (inserted.origen === 'unicorn') {
      try {
        const response = await axios.post(
          process.env.VAPI_WEBHOOK_URL, // Debe estar en tus variables de entorno
          {
            phone_number: inserted.lead_phone,
            user_message: inserted.last_message,
            agent_name: inserted.agent_name || 'Unicorn Bot'
          },
          {
            headers: { 'Content-Type': 'application/json' }
          }
        );

        console.log('📤 Enviado a Vapi:', response.status);
      } catch (err) {
        console.warn('⚠️ Fallo al enviar a Vapi:', err.message);
      }
    }

    res.status(200).json({ message: 'OK' });
  } catch (err) {
    console.error('❌ Error inesperado:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Test
app.get('/', (req, res) => {
  res.send('🟢 Unicorn Server activo.');
});

app.listen(port, () => {
  console.log(`🟢 Server escuchando en puerto ${port}`);
});
