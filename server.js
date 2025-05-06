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

// ✅ Webhook universal: acepta tanto Twilio como Vapi
app.post('/webhook', async (req, res) => {
  console.log('=== Webhook recibido ===');
  console.log(JSON.stringify(req.body, null, 2));

  // Detectar origen: Vapi (custom) o Twilio (SMS/WhatsApp)
  const message = req.body.user_message || req.body.Body;
  const phone = req.body.phone_number || req.body.From;
  const name = req.body.agent_name || req.body.ProfileName || 'SMS User';

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
          origen: 'whatsapp'
        }
      ])
      .select();

    if (error) {
      console.error('❌ Error al guardar en Supabase:', error);
      return res.status(500).json({ error: 'Error inserting in Supabase' });
    }

    console.log('✅ Lead guardado correctamente:', data[0]);
    return res.status(200).json({ message: 'Mensaje procesado y guardado.' });
  } catch (err) {
    console.error('❌ Error inesperado:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Ruta básica para ver si el servidor está activo
app.get('/', (req, res) => {
  res.send('🟢 Servidor Unicorn activo y escuchando en /webhook');
});

app.listen(port, () => {
  console.log(`🟢 Server escuchando en puerto ${port}`);
});
