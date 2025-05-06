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

// Webhook directo desde Twilio
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
    // Guardar en Supabase
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

    // Si está marcado para procesar, mandar a Unicornio
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

// NUEVO ENDPOINT PARA VAPI
app.post('/vapi-send', async (req, res) => {
  console.log('📩 Petición recibida en /vapi-send:', req.body);

  const { phone, message } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ error: 'Faltan phone o message' });
  }

  try {
    const response = await axios.post(process.env.VAPI_URL, {
      phone,
      message
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    console.log('✅ Enviado a Vapi:', response.data);
    res.status(200).json({ status: 'ok', data: response.data });
  } catch (error) {
    console.error('❌ Error al enviar a Vapi:', error.message);
    res.status(500).json({ error: 'Falló el envío a Vapi' });
  }
});

// Prueba simple
app.get('/', (req, res) => {
  res.send('🟢 Servidor activo escuchando Webhooks de Twilio.');
});

app.listen(port, () => {
  console.log(`🟢 Server escuchando en puerto ${port}`);
});
