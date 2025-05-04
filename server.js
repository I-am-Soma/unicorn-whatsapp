const express = require('express');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const axios = require('axios'); // Para enviar mensaje real

const app = express();
const port = process.env.PORT || 8080;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// === 1. Webhook entrante desde Twilio ===
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
      .insert([
        {
          lead_phone: phone,
          last_message: message,
          agent_name: name,
          status: 'New',
          created_at: new Date().toISOString()
        }
      ]);

    if (error) throw error;

    res.status(200).json({ message: 'Mensaje guardado.' });
  } catch (err) {
    console.error('❌ Error:', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// === 2. Endpoint para procesar leads y enviar mensaje real ===
app.post('/process-leads', async (req, res) => {
  try {
    const { data: leads, error } = await supabase
      .from('Leads')
      .select('*')
      .eq('ready_for_contact', true)
      .eq('initial_contact_sent', false)
      .order('created_at', { ascending: true })
      .limit(20); // controla recursos

    if (error) throw error;
    if (!leads || leads.length === 0) {
      return res.status(200).json({ message: 'No hay leads listos.' });
    }

    for (const lead of leads) {
      try {
        const telefono = lead.phone;

        // === Aquí insertas tu lógica real de contacto (Vapi, Make, etc.) ===
        await axios.post(process.env.VAPI_WEBHOOK_URL, {
          phone: telefono,
          message: `Hola ${lead.business_name || ''}, soy parte del equipo de Unicorn AI. ¿Te interesaría recibir más clientes en automático sin pagar publicidad?`
        });

        // Marca como ya contactado
        await supabase
          .from('Leads')
          .update({ initial_contact_sent: true })
          .eq('id', lead.id);

        console.log(`✅ Contacto enviado a ${telefono}`);
      } catch (err) {
        console.error(`❌ Error con ${lead.phone}:`, err.message);
      }
    }

    res.status(200).json({ message: 'Leads procesados.' });
  } catch (err) {
    console.error('❌ Error general:', err);
    res.status(500).json({ error: 'Error procesando leads' });
  }
});

app.get('/', (req, res) => {
  res.send('Servidor operativo.');
});

app.listen(port, () => {
  console.log(`🟢 Server corriendo en puerto ${port}`);
});
