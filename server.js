const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const twilio = require('twilio');
const { generarHistorialGPT } = require('./generarHistorialGPT');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8080;

// ===============================
// CLIENTES
// ===============================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const twilioClient = twilio(
  process.env.TWILIO_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// ===============================
// MIDDLEWARE
// ===============================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===============================
// HELPERS
// ===============================
const detectarIntencionVenta = (mensaje = '') => {
  const msg = mensaje.toLowerCase();
  return {
    preguntaPrecio: /cuanto|precio|cuesta|costo/.test(msg),
    objecion: /caro|pensarlo|luego/.test(msg),
    cierre: /cuando|agendar|cita|reservar/.test(msg),
    saludo: /hola|buenas|hi/.test(msg) && msg.length < 20
  };
};

const generarRespuestaVentas = async (messages, intencion, client_id) => {
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages,
        temperature: 0.8,
        max_tokens: 400
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.choices[0].message.content.trim();
  } catch (err) {
    console.error('❌ OpenAI error:', err.message);
    return 'Hola, tenemos una promoción especial disponible hoy. ¿Te gustaría que te explique los detalles?';
  }
};

const enviarMensajeTwilio = async (numero, mensaje) => {
  try {
    await twilioClient.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: numero.startsWith('whatsapp:') ? numero : `whatsapp:${numero}`,
      body: mensaje
    });
  } catch (err) {
    console.error('❌ Error enviando WhatsApp:', err.message);
  }
};

// ===============================
// WEBHOOK TWILIO
// ===============================
app.post('/webhook', async (req, res) => {
  const message = req.body.Body;
  const phone = req.body.From;
  const name = req.body.ProfileName || 'WhatsApp User';

  if (!message || !phone) {
    return res.status(400).send('Missing data');
  }

  const numero = phone.replace(/^whatsapp:/, '').replace(/\D/g, '');

  const { data: cliente } = await supabase
    .from('clientes')
    .select('id')
    .eq('numero_whatsapp', `+${numero}`)
    .single();

  const client_id = cliente?.id;

  await supabase.from('conversations').insert([{
    lead_phone: phone,
    last_message: message,
    agent_name: name,
    origen: 'whatsapp',
    procesar: false,
    client_id,
    created_at: new Date().toISOString()
  }]);

  res.sendStatus(200);
});

// ===============================
// PROCESAR MENSAJES ENTRANTES
// ===============================
let lockEntrantes = false;

const procesarEntrantes = async () => {
  if (lockEntrantes) return;
  lockEntrantes = true;

  try {
    const { data: mensajes } = await supabase
      .from('conversations')
      .select('*')
      .eq('origen', 'whatsapp')
      .eq('procesar', false)
      .limit(10);

    if (!mensajes?.length) return;

    for (const mensaje of mensajes) {
      const { id, lead_phone, client_id, last_message } = mensaje;

      const messages = await generarHistorialGPT(
        lead_phone,
        supabase,
        client_id
      );

      if (!messages) {
        await supabase.from('conversations')
          .update({ procesar: true })
          .eq('id', id);
        continue;
      }

      const intencion = detectarIntencionVenta(last_message);
      const respuesta = await generarRespuestaVentas(messages, intencion, client_id);

      await supabase.from('conversations').insert([{
        lead_phone,
        last_message: respuesta,
        agent_name: 'Unicorn AI',
        origen: 'unicorn',
        procesar: true,
        client_id,
        created_at: new Date().toISOString()
      }]);

      await enviarMensajeTwilio(lead_phone, respuesta);

      await supabase.from('conversations')
        .update({ procesar: true })
        .eq('id', id);
    }

  } catch (err) {
    console.error('❌ Error procesando entrantes:', err.message);
  } finally {
    lockEntrantes = false;
  }
};

// ===============================
// PROCESAR MENSAJES UNICORN
// ===============================
let lockUnicorn = false;

const procesarUnicorn = async () => {
  if (lockUnicorn) return;
  lockUnicorn = true;

  try {
    const { data: pendientes } = await supabase
      .from('conversations')
      .select('*')
      .eq('origen', 'unicorn')
      .eq('procesar', false);

    if (!pendientes?.length) return;

    for (const mensaje of pendientes) {
      const { id } = mensaje;
      await supabase.from('conversations')
        .update({ procesar: true })
        .eq('id', id);
    }

  } catch (err) {
    console.error('❌ Error procesando Unicorn:', err.message);
  } finally {
    lockUnicorn = false;
  }
};

// ===============================
// POLLING
// ===============================
if (process.env.POLLING_ACTIVO === 'true') {
  console.log('🔁 Polling activo cada 30s');
  setInterval(procesarEntrantes, 30000);
  setInterval(procesarUnicorn, 30000);
} else {
  console.log('⏸️ Polling desactivado');
}

// ===============================
// HEALTHCHECK
// ===============================
app.get('/', (req, res) => {
  res.send(`🟢 Unicorn backend OK - ${new Date().toISOString()}`);
});

// ===============================
// START
// ===============================
app.listen(port, () => {
  console.log(`🟢 Servidor corriendo en puerto ${port}`);
});
