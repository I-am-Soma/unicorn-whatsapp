// ✅ VERSIÓN FINAL + RESPUESTA GUARDADA EN SUPABASE (ORDEN CORREGIDO)

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const twilio = require('twilio');
const { generarHistorialGPT } = require('./generarHistorialGPT');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8080;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const twilioClient = twilio(
  process.env.TWILIO_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const enviarMensajeTwilio = async (numero, mensaje) => {
  try {
    const esWhatsapp = numero.startsWith('whatsapp:');
    const telefonoNormalizado = numero.replace('whatsapp:', '');
    const to = esWhatsapp ? `whatsapp:${telefonoNormalizado}` : telefonoNormalizado;
    const from = esWhatsapp
      ? process.env.TWILIO_WHATSAPP_NUMBER
      : process.env.TWILIO_SMS_NUMBER;
    const enviado = await twilioClient.messages.create({ from, to, body: mensaje });
    console.log(`📤 Mensaje enviado a ${to} desde ${from}: ${mensaje}`);
    return enviado;
  } catch (error) {
    console.error(`❌ Error al enviar mensaje a ${numero}:`, error.message);
    throw error;
  }
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
    const { error } = await supabase.from('conversations').insert([{
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

const POLLING_INTERVAL = 10000;

const procesarMensajesDesdeUnicorn = async () => {
  try {
    const { data: pendientes, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('origen', 'unicorn')
      .eq('procesar', false);

    if (error || !pendientes || pendientes.length === 0) {
      console.log('⏳ No hay mensajes nuevos de Unicorn...');
      return;
    }

    for (const mensaje of pendientes) {
      const { id, lead_phone, cliente_id } = mensaje;
      try {
        const messages = await generarHistorialGPT(lead_phone, supabase);
        if (!messages) continue;

        const aiResponse = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: 'gpt-3.5-turbo',
            messages
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            }
          }
        );

        const textoAI = aiResponse.data.choices[0].message.content.trim();

        // Primero marcar como procesado
        await supabase.from('conversations').update({ procesar: true }).eq('id', id);

        // Insertar respuesta de IA
        await supabase.from('conversations').insert([
          {
            lead_phone,
            last_message: textoAI,
            agent_name: 'Unicorn AI',
            status: 'In Progress',
            created_at: new Date().toISOString(),
            origen: 'unicorn',
            procesar: true,
            cliente_id: cliente_id || 1
          }
        ]);

        await enviarMensajeTwilio(lead_phone, textoAI);

      } catch (err) {
        console.error(`❌ Error al procesar lead ${lead_phone}:`, err.message);
      }
    }
  } catch (err) {
    console.error('🔥 Error general en polling:', err.message);
  }
};

const responderMensajesEntrantes = async () => {
  try {
    const { data: mensajes, error } = await supabase
      .from('conversations')
      .select('*')
      .in('origen', ['whatsapp', 'sms'])
      .eq('procesar', false)
      .limit(10);

    if (error || !mensajes || mensajes.length === 0) {
      console.log('⏳ No hay mensajes nuevos de leads...');
      return;
    }

    for (const mensaje of mensajes) {
      const { id, lead_phone, cliente_id } = mensaje;
      try {
        const messages = await generarHistorialGPT(lead_phone, supabase);
        if (!messages) continue;

        const aiResponse = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: 'gpt-3.5-turbo',
            messages
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            }
          }
        );

        const textoAI = aiResponse.data.choices[0].message.content.trim();

        await supabase.from('conversations').update({ procesar: true }).eq('id', id);

        await supabase.from('conversations').insert([
          {
            lead_phone,
            last_message: textoAI,
            agent_name: 'Unicorn AI',
            status: 'In Progress',
            created_at: new Date().toISOString(),
            origen: 'unicorn',
            procesar: true,
            cliente_id: cliente_id || 1
          }
        ]);

        await enviarMensajeTwilio(lead_phone, textoAI);

      } catch (err) {
        console.error(`❌ Error procesando entrada de ${lead_phone}:`, err.message);
      }
    }
  } catch (err) {
    console.error('🔥 Error en responderMensajesEntrantes:', err.message);
  }
};

app.get('/', (req, res) => {
  res.send('🟢 Unicorn AI Backend activo y escuchando.');
});

if (process.env.POLLING_ACTIVO === 'true') {
  console.log('🔁 Polling activado cada 10 segundos');
  setInterval(procesarMensajesDesdeUnicorn, POLLING_INTERVAL);
  setInterval(responderMensajesEntrantes, POLLING_INTERVAL);
} else {
  console.log('⏸️ Polling desactivado por configuración (.env)');
}

app.listen(port, () => {
  console.log(`🟢 Servidor escuchando en el puerto ${port}`);
});
