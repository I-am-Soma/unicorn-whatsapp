const generarHistorialGPT = async (leadPhone, supabase) => {
  try {
    console.log(`🔍 Generando historial para: ${leadPhone}`);

    const baseNumero = leadPhone.replace(/^whatsapp:/, '').replace(/\D/g, '');
    console.log(`📱 Número base extraído: ${baseNumero}`);

    const numeroConFormato = `+${baseNumero}`;
    const { data: clienteMatch, error: clienteError } = await supabase
      .from('clientes')
      .select('id, prompt_inicial, lista_servicios, nombre, numero_whatsapp')
      .eq('numero_whatsapp', numeroConFormato)
      .single();

    if (clienteError && clienteError.code !== 'PGRST116') {
      console.error('❌ Error consultando cliente:', clienteError.message);
    }

    const client_id = clienteMatch?.id || 1;
    console.log(`👤 Client ID detectado: ${client_id} (${clienteMatch?.nombre || 'Cliente por defecto'})`);

    const { data: todos, error } = await supabase
      .from('conversations')
      .select('last_message, created_at, origen, client_id, lead_phone, agent_name')
      .order('created_at', { ascending: true })
      .limit(200);

    if (error || !todos) {
      console.error('❌ Error al consultar historial:', error?.message);
      return null;
    }

    const mensajes = todos.filter(m =>
      m.lead_phone && m.lead_phone.replace(/\D/g, '').includes(baseNumero)
    );

    console.log(`💬 Mensajes encontrados en historial: ${mensajes.length}`);

    const { data: cliente, error: errorCliente } = await supabase
      .from('clientes')
      .select('prompt_inicial, lista_servicios, nombre')
      .eq('id', client_id)
      .single();

    if (errorCliente) {
      console.error('❌ Error consultando configuración del cliente:', errorCliente.message);
    }

    const promptBase = cliente?.prompt_inicial?.trim();
    const servicios = cliente?.lista_servicios?.trim();
    const nombreCliente = cliente?.nombre?.trim();

    let serviciosProcesados = [];
    if (servicios) {
      try {
        const serviciosArray = typeof servicios === 'string' ? JSON.parse(servicios) : servicios;
        serviciosProcesados = Array.isArray(serviciosArray) ? serviciosArray : [];
      } catch (e) {
        serviciosProcesados = servicios
          .split('\n')
          .filter(linea => linea.trim())
          .map(linea => {
            const match = linea.match(/(.+?)[\s-]*\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/);
            if (match) {
              return {
                nombre: match[1].replace(/^[•\-\*]\s*/, '').trim(),
                precio: match[2],
                descripcion: linea.trim()
              };
            }
            return {
              nombre: linea.replace(/^[•\-\*]\s*/, '').trim(),
              precio: null,
              descripcion: linea.trim()
            };
          });
      }
    }

    const ultimoMensajeUsuario = mensajes
      .filter(m => m.origen !== 'unicorn' && m.agent_name !== 'Unicorn AI')
      .pop()?.last_message?.toLowerCase() || '';

    const esPreguntaPrecio = /cuanto|cuesta|precio|cost|dollar|peso|barato|caro|vale/.test(ultimoMensajeUsuario);
    const esPreguntaServicios = /servicio|que hac|ofrec|tratamiento|procedimiento/.test(ultimoMensajeUsuario);
    const esObjecion = /caro|expensive|mucho|pensarlo|despues|luego|maybe/.test(ultimoMensajeUsuario);
    const esInteresPorUno = serviciosProcesados.some(s =>
      ultimoMensajeUsuario.includes(s.nombre.toLowerCase().substring(0, 5))
    );

    let promptSistema = nombreCliente
      ? `Eres el asistente comercial de ${nombreCliente}.`
      : `Eres un asistente comercial inteligente.`;

    promptSistema += `

Tu misión es brindar información útil, responder preguntas con claridad, e impulsar el interés del usuario en los productos o servicios que se ofrecen. No fuerces ventas si la intención del usuario es informativa.

Si el usuario pregunta algo general o fuera de contexto (como sobre política o salud), responde con inteligencia y respeto, sin desviar el tema a ventas si no corresponde.

Dispones de los siguientes servicios:
`;

    serviciosProcesados.forEach(servicio => {
      promptSistema += `• ${servicio.nombre}`;
      if (servicio.precio) {
        promptSistema += ` - $${servicio.precio}`;
      }
      promptSistema += `\n`;
    });

    const fechaPrimerMensaje = mensajes.length > 0 ? new Date(mensajes[0].created_at) : new Date();
    const diasDesdePrimerMensaje = (Date.now() - fechaPrimerMensaje.getTime()) / (1000 * 60 * 60 * 24);
    const usarHistorial = diasDesdePrimerMensaje <= 3;

    const hayMensajesUsuario = mensajes.some(m =>
      m.origen !== 'unicorn' &&
      m.agent_name !== 'Unicorn AI' &&
      m.agent_name !== 'bot'
    );

    const messages = [
      { role: 'system', content: promptSistema }
    ];

    const yaSaludoUnicorn = mensajes.some(m =>
      m.origen === 'unicorn' &&
      m.agent_name === 'Unicorn AI' &&
      m.last_message &&
      m.last_message.trim().length > 10
    );

    if (!yaSaludoUnicorn && promptBase) {
      messages.push({
        role: 'assistant',
        content: `¡Hola! 👋 ${promptBase}`
      });
    }

    if (hayMensajesUsuario && usarHistorial) {
      const mensajesRecientes = mensajes.slice(-8);
      mensajesRecientes.forEach(msg => {
        if (msg.last_message && msg.last_message.trim()) {
          const esBot = msg.origen === 'unicorn' ||
                        msg.agent_name === 'Unicorn AI' ||
                        msg.agent_name === 'bot';
          messages.push({
            role: esBot ? 'assistant' : 'user',
            content: msg.last_message.slice(0, 300)
          });
        }
      });
    }

    return messages;
  } catch (err) {
    console.error('❌ Error generando historial para GPT:', err.message);
    console.error('Stack trace:', err.stack);
    return null;
  }
};

module.exports = { generarHistorialGPT };
