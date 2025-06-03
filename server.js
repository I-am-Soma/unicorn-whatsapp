const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const twilio = require('twilio');
const { generarHistorialGPT } = require('./generarHistorialGPT');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8080;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

const enviarMensajeTwilio = async (numero, mensaje) => {
  try {
    const to = numero.startsWith('whatsapp:') ? numero : `whatsapp:${numero}`;
    const from = process.env.TWILIO_WHATSAPP_NUMBER;
    const enviado = await twilioClient.messages.create({ from, to, body: mensaje });
    console.log(`📤 Enviado a ${to}: ${mensaje.substring(0, 100)}...`);
    return enviado;
  } catch (error) {
    console.error(`❌ Error enviando a ${numero}:`, error.message);
  }
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🧩 Webhook de entrada de mensajes
app.post('/webhook', async (req, res) => {
  console.log('📡 Webhook recibido:', new Date().toISOString());
  console.log('Body:', JSON.stringify(req.body, null, 2));

  const message = req.body.Body;
  const phone = req.body.From;
  const name = req.body.ProfileName || 'WhatsApp User';

  if (!message || !phone) {
    console.error('❌ Faltan datos: message o phone');
    return res.status(400).json({ error: 'Missing message or phone' });
  }

  try {
    // Extraer número limpio
    const numero = phone.replace(/^whatsapp:/, '').replace(/\D/g, '');
    console.log(`📱 Número procesado: +${numero} (original: ${phone})`);

    // Buscar cliente basado en el número
    const { data: clienteData, error: clienteError } = await supabase
      .from('clientes')
      .select('id, nombre, numero_whatsapp')
      .eq('numero_whatsapp', `+${numero}`)
      .single();

    if (clienteError && clienteError.code !== 'PGRST116') {
      console.error('❌ Error consultando cliente:', clienteError.message);
    }

    const cliente_id = clienteData?.id || 1;
    console.log(`👤 Cliente detectado: ID ${cliente_id} - ${clienteData?.nombre || 'Cliente por defecto'}`);

    // Guardar mensaje en conversations
    const { error } = await supabase.from('conversations').insert([{
      lead_phone: phone,
      last_message: message,
      agent_name: name,
      status: 'New',
      created_at: new Date().toISOString(),
      origen: 'whatsapp',
      procesar: false,
      cliente_id
    }]);

    if (error) {
      console.error('❌ Error al guardar en Supabase:', error);
      return res.status(500).json({ error: 'Insert error' });
    }

    console.log('✅ Mensaje guardado exitosamente');
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('❌ Error en webhook:', err.message);
    console.error('Stack trace:', err.stack);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// 🔁 Procesa mensajes salientes desde Unicorn
const procesarMensajesDesdeUnicorn = async () => {
  const { data: pendientes, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('origen', 'unicorn')
    .eq('procesar', false);

  if (error) {
    console.error('❌ Error consultando mensajes Unicorn:', error.message);
    return;
  }

  if (!pendientes?.length) {
    console.log('⏳ No hay mensajes nuevos de Unicorn...');
    return;
  }

  console.log(`🤖 Procesando ${pendientes.length} mensajes de Unicorn`);

  for (const mensaje of pendientes) {
    const { id, lead_phone, cliente_id } = mensaje;
    console.log(`\n🔄 Procesando mensaje ID: ${id} para ${lead_phone}`);
    
    try {
      const messages = await generarHistorialGPT(lead_phone, supabase);
      if (!messages) {
        console.error('❌ No se pudo generar historial para GPT');
        continue;
      }

      console.log('🧠 Enviando a OpenAI...');
      
      const aiResponse = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        { 
          model: 'gpt-3.5-turbo', 
          messages,
          max_tokens: 500,
          temperature: 0.7
        },
        { 
          headers: { 
            'Content-Type': 'application/json', 
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` 
          } 
        }
      );

      const textoAI = aiResponse.data.choices[0].message.content.trim();
      console.log(`🎯 Respuesta de AI: ${textoAI.substring(0, 100)}...`);

      // Marcar como procesado
      await supabase.from('conversations').update({ procesar: true }).eq('id', id);
      
      // Insertar respuesta
      await supabase.from('conversations').insert([{
        lead_phone,
        last_message: textoAI,
        agent_name: 'Unicorn AI',
        status: 'In Progress',
        created_at: new Date().toISOString(),
        origen: 'unicorn',
        procesar: true,
        cliente_id: cliente_id || 1
      }]);

      // Enviar por WhatsApp
      await enviarMensajeTwilio(lead_phone, textoAI);
      
      console.log('✅ Mensaje Unicorn procesado exitosamente');
      
    } catch (err) {
      console.error(`❌ Error procesando unicorn ${lead_phone}:`, err.message);
      console.error('Stack trace:', err.stack);
    }
  }
};

// 🔁 Responde automáticamente entradas de leads
const responderMensajesEntrantes = async () => {
  const { data: mensajes, error } = await supabase
    .from('conversations')
    .select('*')
    .in('origen', ['whatsapp', 'sms'])
    .eq('procesar', false)
    .limit(10);

  if (error) {
    console.error('❌ Error consultando mensajes entrantes:', error.message);
    return;
  }

  if (!mensajes?.length) {
    console.log('⏳ No hay nuevos leads...');
    return;
  }

  console.log(`📨 Procesando ${mensajes.length} mensajes entrantes`);

  for (const mensaje of mensajes) {
    const { id, lead_phone, cliente_id } = mensaje;
    console.log(`\n📞 Procesando lead ID: ${id} de ${lead_phone}`);
    
    try {
      const messages = await generarHistorialGPT(lead_phone, supabase);
      if (!messages) {
        console.error('❌ No se pudo generar historial para GPT');
        continue;
      }

      console.log('🧠 Enviando a OpenAI...');
      
      const aiResponse = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        { 
          model: 'gpt-3.5-turbo', 
          messages,
          max_tokens: 500,
          temperature: 0.7
        },
        { 
          headers: { 
            'Content-Type': 'application/json', 
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` 
          } 
        }
      );

      const textoAI = aiResponse.data.choices[0].message.content.trim();
      console.log(`🎯 Respuesta de AI: ${textoAI.substring(0, 100)}...`);

      // Marcar como procesado
      await supabase.from('conversations').update({ procesar: true }).eq('id', id);
      
      // Insertar respuesta
      await supabase.from('conversations').insert([{
        lead_phone,
        last_message: textoAI,
        agent_name: 'Unicorn AI',
        status: 'In Progress',
        created_at: new Date().toISOString(),
        origen: 'unicorn',
        procesar: true,
        cliente_id: cliente_id || 1
      }]);

      // Enviar por WhatsApp
      await enviarMensajeTwilio(lead_phone, textoAI);
      
      console.log('✅ Mensaje entrante procesado exitosamente');
      
    } catch (err) {
      console.error(`❌ Error procesando entrada ${lead_phone}:`, err.message);
      console.error('Stack trace:', err.stack);
      
      // Si hay error con OpenAI, enviar respuesta genérica
      if (err.response?.status === 429 || err.response?.status >= 500) {
        console.log('⚠️ Enviando respuesta de fallback...');
        const fallbackMessage = "Gracias por tu mensaje. En breve un miembro de nuestro equipo se pondrá en contacto contigo.";
        await enviarMensajeTwilio(lead_phone, fallbackMessage);
        await supabase.from('conversations').update({ procesar: true }).eq('id', id);
      }
    }
  }
};

app.get('/', (req, res) => {
  res.send('🟢 Unicorn AI backend escuchando - ' + new Date().toISOString());
});

// Endpoint para testing manual
app.get('/test/:phone', async (req, res) => {
  const { phone } = req.params;
  console.log(`🧪 Test manual para: ${phone}`);
  
  try {
    const messages = await generarHistorialGPT(phone, supabase);
    res.json({
      success: true,
      messages,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 🔁 Activar polling
if (process.env.POLLING_ACTIVO === 'true') {
  console.log('🔁 Polling activo cada 10s');
  setInterval(procesarMensajesDesdeUnicorn, 10000);
  setInterval(responderMensajesEntrantes, 12000); // Ligeramente desfasado para evitar conflictos
} else {
  console.log('⏸️ Polling desactivado (.env)');
}

app.listen(port, () => {
  console.log(`🟢 Servidor corriendo en puerto ${port} - ${new Date().toISOString()}`);
});
