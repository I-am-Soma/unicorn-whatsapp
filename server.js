const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8080;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Webhook que recibe mensajes desde Twilio (SMS)
app.post('/webhook', async (req, res) => {
  console.log('📡 Webhook recibido');
  console.log(JSON.stringify(req.body, null, 2));

  // Si viene desde Twilio (SMS entrante)
  if (req.body.Body && req.body.From) {
    const message = req.body.Body;
    const phone = req.body.From;
    const name = req.body.ProfileName || 'SMS User';

    try {
      const { data, error } = await supabase
        .from('conversations')
        .insert([{
          lead_phone: phone,
          last_message: message,
          agent_name: name,
          status: 'New',
          created_at: new Date().toISOString(),
          origen: 'whatsapp' // Se mantiene igual por compatibilidad
        }])
        .select();

      if (error) {
        console.error('❌ Error al guardar mensaje:', error);
        return res.status(500).json({ error: 'Error al guardar en Supabase' });
      }

      console.log('✅ SMS guardado correctamente:', data[0]);
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('❌ Error general en webhook:', err);
      return res.status(500).json({ error: 'Error inesperado' });
    }
  }

  // Si viene desde Vapi (respuesta esperada)
  res.status(200).json({
    message: 'Gracias por tu mensaje. En breve un asesor te responderá.'
  });
});

// 🔁 Polling para detectar mensajes desde Unicorn y marcarlos como listos para Vapi
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
      const { id, lead_phone } = mensaje;

      try {
        console.log(`📦 Mensaje listo para Vapi: ${lead_phone}`);

        const { error: updateError } = await supabase
          .from('conversations')
          .update({ procesar: true })
          .eq('id', id);

        if (updateError) {
          console.error(`⚠️ Error al marcar como procesado: ${updateError.message}`);
        } else {
          console.log(`✅ Mensaje ${id} marcado como procesado (procesar: true).`);
        }

      } catch (err) {
        console.error(`❌ Error general al preparar mensaje para Vapi (${lead_phone}): ${err.message}`);
      }
    }
  } catch (err) {
    console.error('🔥 Error general en polling:', err.message);
  }
};

// 🟢 Ruta de prueba
app.get('/', (req, res) => {
  res.send('🟢 Unicorn AI Backend activo y escuchando.');
});

// ⏱️ Activar polling solo si está habilitado en .env
if (process.env.POLLING_ACTIVO === 'true') {
  console.log('🔁 Polling activado cada 10 segundos');
  setInterval(procesarMensajesDesdeUnicorn, POLLING_INTERVAL);
} else {
  console.log('⏸️ Polling desactivado por configuración (.env)');
}

// 🚀 Iniciar servidor
app.listen(port, () => {
  console.log(`🟢 Servidor escuchando en el puerto ${port}`);
});
