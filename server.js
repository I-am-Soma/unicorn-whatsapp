const express = require('express');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Variables de entorno
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Middleware para parsear JSON
app.use(express.json());

// Webhook para recibir mensajes de Vapi
app.post('/webhook', async (req, res) => {
  const { phone, message, agentName } = req.body;

  if (!phone || !message) {
    return res.status(400).send('Missing phone or message');
  }

  try {
    const { data, error } = await supabase
      .from('Conversations')
      .insert([
        {
          lead_phone: phone,
          last_message: message,
          agent_name: agentName || 'Vapi Default',
          status: 'New',
          created_at: new Date().toISOString()
        }
      ]);

    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).send('Error inserting data');
    }

    res.status(200).send('Data received and inserted successfully');
  } catch (err) {
    console.error('Unexpected error:', err);
    res.status(500).send('Internal server error');
  }
});

// Rutas básicas
app.get('/', (req, res) => {
  res.send('Webhook server is running and ready to receive Vapi data!');
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
