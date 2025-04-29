const express = require('express');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8080;

// Supabase client setup
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Middleware to parse JSON and form-urlencoded
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Webhook from Twilio (SMS/WhatsApp)
app.post('/webhook', async (req, res) => {
  console.log('=== Webhook recibido de Twilio ===');
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
          created_at: new Date().toISOString()
        }
      ]);

    if (error) {
      console.error('Error guardando en Supabase:', error);
      return res.status(500).json({ error: 'Error inserting data' });
    }

    console.log('Lead guardado exitosamente:', data);
    res.status(200).json({ message: 'Lead received and stored.' });
  } catch (err) {
    console.error('Error inesperado:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Prueba simple
app.get('/', (req, res) => {
  res.send('Servidor funcionando y listo para recibir Webhooks de Twilio SMS/WhatsApp');
});

app.listen(port, () => {
  console.log(`Servidor escuchando en el puerto ${port}`);
});
