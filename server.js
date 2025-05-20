const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const twilio = require('twilio');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8080;

// Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Twilio
const twilioClient = twilio(
  process.env.TWILIO_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Webhook desde Twilio (SMS entrante)
app.post('/webhook', async (req, res) => {
  console.log('📡 Webhook recibido');
  console.log(JSON.stringify(req.body, null, 2));

  const message = req.body.Body;
  const phone = req.body.From;
  const name = req.body.ProfileName || 'SMS User';

  if (!message || !phone) {
    return res.status(400).json({ error: 'Missing message or phone' });
  }

  try {
    const { error } = await supabase
      .from('conversations')
      .insert([{
        lead_phone: phone,
        last_message: message,
        agent_name: name,
        status: 'New',
        created_at: new Date().toISOString(),
        origen: 'whatsapp',
        procesar: false
      }]);

    if (error) {
      console.error('❌ Error al guardar en Supabase:', error);
      return res.status(500).json({ error: 'Insert error' });
    }

    console.log('✅ Mensaje guardado exitosamente.');
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('❌ Error en webhook:', err.message);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Polling IA + envío SMS
const POLLING_INTERVAL = 10000;

const procesarMensajesDesdeUnicorn = async () => {
  try {
    const { data: pendientes, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('origen', 'unicorn')
      .eq('procesar', false);

    if (error) {
      console.error('❌ Error al consultar Supabase:', error.message);
      return;
    }

    if (!pendientes || pendientes.length === 0) {
      console.log('⏳ No hay mensajes nuevos de Unicorn...');
      return;
    }

    for (const mensaje of pendientes) {
      const { id, lead_phone, last_message } = mensaje;

      try {
        // 1. Generar respuesta con OpenAI
        const aiResponse = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: 'gpt-3.5-turbo',
            messages: [
              {
                role: 'system',
                content: 'Eres un asistente profesional que responde amablemente por SMS.'
              },
              {
                role: 'user',
                content: last_message
              }
            ]
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            }
          }
        );

        const textoAI = aiResponse.data.choices[0].message.content.trim();

        // 2. Enviar por SMS usando Twilio
        await twilioClient.messages.create({
          from: process.env.TWILIO_PHONE,
          to: lead_phone,
          body: textoAI
        });

        console.log(`📤 SMS enviado a ${lead_phone}: ${textoAI}`);

        // 3. Marcar como procesado
        await supabase
          .from('conversations')
          .update({ procesar: true })
          .eq('id', id);

        console.log(`✅ Mensaje ${id} marcado como procesado.`);
      } catch (err) {
        console.error(`❌ Error al procesar lead ${lead_phone}:`, err.message);
      }
    }
  } catch (err) {
    console.error('🔥 Error general en polling:', err.message);
  }
};

// Ruta de prueba
app.get('/', (req, res) => {
  res.send('🟢 Unicorn AI Backend activo y escuchando.');
});

// Activar polling
if (process.env.POLLING_ACTIVO === 'true') {
  console.log('🔁 Polling activado cada 10 segundos');
  setInterval(procesarMensajesDesdeUnicorn, POLLING_INTERVAL);
} else {
  console.log('⏸️ Polling desactivado por configuración (.env)');
}

// Iniciar servidor
app.listen(port, () => {
  console.log(`🟢 Servidor escuchando en el puerto ${port}`);
});

