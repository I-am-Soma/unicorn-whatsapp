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

// Webhook desde Twilio
app.post('/webhook', async (req, res) => {
  console.log('=== Webhook recibido desde Twilio ===');
  console.log(JSON.stringify(req.body, null, 2));

  const message = req.body.Body;
  const phone = req.body.From;
  const name = req.body.ProfileName || 'SMS User';

  if (!message || !phone) {
    return res.status(400).json({ error: 'Missing message or phone' });
  }

  try {
    const { data, error } = await supabase
      .from('conversations')
      .insert([{
        lead_phone: phone,
        last_message: message,
        agent_name: name,
        status: 'New',
        created_at: new Date().toISOString(),
        origen: 'whatsapp',
        procesado: false
      }])
      .select();

    if (error) {
      console.error('Error al guardar en Supabase:', error);
      return res.status(500).json({ error: 'Supabase insert error' });
    }

    const inserted = data[0];

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

    res.status(200).json({ message: 'Mensaje guardado y procesado.' });
  } catch (err) {
    console.error('❌ Error inesperado:', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Test
app.get('/', (req, res) => {
  res.send('🟢 Unicorn AI Backend activo y escuchando.');
});

// 🔁 Polling para enviar mensajes de Unicorn a Vapi cada 10 segundos
const POLLING_INTERVAL = 10000;

const procesarMensajesDesdeUnicorn = async () => {
  try {
    const { data: pendientes, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('origen', 'unicorn')
      .eq('procesado', false);

    if (error) {
      console.error('❌ Error al consultar Supabase:', error.message);
      return;
    }

    if (!pendientes || pendientes.length === 0) {
      console.log('⏳ No hay mensajes nuevos de Unicorn...');
      return;
    }

    for (const mensaje of pendientes) {
      const { id, lead_phone, last_message, agent_name } = mensaje;

      try {
        const vapiResponse = await axios.post(
          'https://api.vapi.ai/calls',
          {
            phone_number: lead_phone,
            user_message: last_message,
            agent_name: agent_name || 'Unicorn AI'
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.VAPI_API_KEY}`
            }
          }
        );

        console.log(`📤 Enviado a Vapi (${lead_phone}) OK`);

        const { error: updateError } = await supabase
          .from('conversations')
          .update({ procesado: true })
          .eq('id', id);

        if (updateError) {
          console.error(`⚠️ Error al marcar como procesado: ${updateError.message}`);
        } else {
          console.log(`✅ Mensaje ${id} marcado como procesado.`);
        }

      } catch (err) {
        console.error(`❌ Error al enviar a Vapi (${lead_phone}): ${err.message}`);
      }
    }
  } catch (err) {
    console.error('🔥 Error general en polling:', err.message);
  }
};

setInterval(procesarMensajesDesdeUnicorn, POLLING_INTERVAL);

// Iniciar servidor
app.listen(port, () => {
  console.log(`🟢 Servidor escuchando en el puerto ${port}`);
});
