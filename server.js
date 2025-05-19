// server.js
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8080;

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🚨 ENDPOINT: Trigger desde Supabase para enviar a Vapi
app.post('/send-to-vapi', async (req, res) => {
  console.log('📨 Disparo recibido desde Supabase trigger o polling');

  const { lead_phone, last_message, agent_name } = req.body;

  if (!lead_phone || !last_message) {
    console.error('❌ Faltan datos para enviar a Vapi');
    return res.status(400).json({ error: 'Missing phone or message' });
  }

  try {
    const response = await axios.post(
      'https://api.vapi.ai/calls',
      {
        phone_number: lead_phone,
        user_message: last_message,
        agent_name: agent_name || 'Unicorn AI'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': Bearer ${process.env.VAPI_API_KEY}
        }
      }
    );

    console.log('✅ Mensaje enviado a Vapi:', response.data);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error(❌ Error al enviar a Vapi (${lead_phone}):, error.message);
    res.status(500).json({ error: 'Failed to send message to Vapi' });
  }
});

// Webhook desde Twilio (mensaje entrante)
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
          origen: 'whatsapp'
        }
      ])
      .select();

    if (error) {
      console.error('Error al guardar en Supabase:', error);
      return res.status(500).json({ error: 'Error inserting in Supabase' });
    }

    const inserted = data[0];

    // Si se debe procesar en Unicornio (flujo inverso)
    if (inserted.procesar) {
      try {
        const unicornioResponse = await axios.post(
          process.env.UNICORNIO_URL,
          {
            phone: inserted.lead_phone,
            message: inserted.last_message,
            source: inserted.origen || 'Twilio'
          },
          {
            headers: { 'Content-Type': 'application/json' }
          }
        );

        console.log('✅ Enviado a Unicornio:', unicornioResponse.data);
      } catch (err) {
        console.warn('⚠️ No se pudo enviar a Unicornio:', err.message);
      }
    }

    console.log('✅ Lead guardado correctamente:', inserted);
    res.status(200).json({ message: 'Mensaje procesado y guardado.' });
  } catch (err) {
    console.error('❌ Error inesperado:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Test
app.get('/', (req, res) => {
  res.send('🟢 Servidor activo escuchando Webhooks de Twilio y Supabase.');
});

app.listen(port, () => {
  console.log(🟢 Server escuchando en puerto ${port});
});
