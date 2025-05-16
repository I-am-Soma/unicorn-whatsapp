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

// 🚨 Nuevo: Proceso local periódico para revisar y enviar a Vapi
setInterval(async () => {
  console.log('🔁 Revisando mensajes nuevos para Vapi...');
  try {
    const { data: rows, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('procesar', true)
      .order('created_at', { ascending: true })
      .limit(10);

    if (error) {
      console.error('❌ Error al consultar Supabase:', error.message);
      return;
    }

    for (const row of rows) {
      console.log('📨 Disparo recibido desde función local');
      try {
        const response = await axios.post(
          'https://api.vapi.ai/message',
          {
            phone: row.lead_phone,
            message: row.last_message,
            agentName: row.agent_name || 'Unicorn AI',
          },
          {
            headers: { 'Content-Type': 'application/json' }
          }
        );

        console.log(`✅ Enviado a Vapi:`, response.data);

        await supabase
          .from('conversations')
          .update({ procesar: false })
          .eq('id', row.id);
      } catch (error) {
        console.error(`❌ Error enviando a Vapi (id: ${row.id}):`, error.message);
      }
    }
  } catch (e) {
    console.error('❌ Error inesperado en ciclo local:', e.message);
  }
}, 10000); // cada 10 segundos

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
          procesar: false
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
    console.error('❌ Error inesperado:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Home test
app.get('/', (req, res) => {
  res.send('🟢 Servidor activo escuchando Webhooks de Twilio y ejecutando envíos a Vapi.');
});

app.listen(port, () => {
  console.log(`🟢 Server escuchando en puerto ${port}`);
});
