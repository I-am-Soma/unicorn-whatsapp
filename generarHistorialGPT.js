const generarHistorialGPT = async (leadPhone, supabase) => {
  try {
    console.log(`🔍 Generando historial para: ${leadPhone}`);
    
    const baseNumero = leadPhone.replace(/^whatsapp:/, '').replace(/\D/g, '');
    console.log(`📱 Número base extraído: ${baseNumero}`);
    
    const numeroConFormato = `+${baseNumero}`;
    const { data: clienteMatch, error: clienteError } = await supabase
      .from('clientes')
      .select('id, prompt_inicial, lista_servicios, nombre, numero_whatsapp, tipo_respuesta')
      .eq('numero_whatsapp', numeroConFormato)
      .single();

    if (clienteError && clienteError.code !== 'PGRST116') {
      console.error('❌ Error consultando cliente:', clienteError.message);
    }

    const cliente_id = clienteMatch?.id || 1;
    const promptBase = clienteMatch?.prompt_inicial?.trim() || '';
    const servicios = clienteMatch?.lista_servicios?.trim() || '';
    const nombreCliente = clienteMatch?.nombre?.trim() || '';
    const tipo_respuesta = clienteMatch?.tipo_respuesta || 'texto';

    console.log(`👤 Cliente ID detectado: ${cliente_id} (${nombreCliente || 'Cliente por defecto'})`);
    console.log(`📝 Prompt inicial encontrado: ${promptBase ? 'SÍ' : 'NO'}`);
    console.log(`🛍️ Servicios encontrados: ${servicios ? 'SÍ' : 'NO'}`);
    console.log(`🎙️ Tipo de respuesta configurado: ${tipo_respuesta}`);

    const { data: todos, error } = await supabase
      .from('conversations')
      .select('last_message, created_at, origen, cliente_id, lead_phone, agent_name')
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

    let serviciosProcesados = [];
    if (servicios) {
      try {
        const serviciosArray = typeof servicios === 'string' ? JSON.parse(servicios) : servicios;
        serviciosProcesados = Array.isArray(serviciosArray) ? serviciosArray : [];
      } catch {
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

    console.log(`💰 Servicios procesados: ${serviciosProcesados.length}`);

    const ultimoMensajeUsuario = mensajes
      .filter(m => m.origen !== 'unicorn' && m.agent_name !== 'Unicorn AI')
      .pop()?.last_message?.toLowerCase() || '';

    const esPreguntaPrecio = /cuanto|cuesta|precio|cost|dollar|peso|barato|caro|vale/.test(ultimoMensajeUsuario);
    const esPreguntaServicios = /servicio|que hac|ofrec|tratamiento|procedimiento/.test(ultimoMensajeUsuario);
    const esObjecion = /caro|expensive|mucho|pensarlo|despues|luego|maybe/.test(ultimoMensajeUsuario);
    const esInteresPorUno = serviciosProcesados.some(s => 
      ultimoMensajeUsuario.includes(s.nombre.toLowerCase().substring(0, 5))
    );

    console.log(`🎯 Análisis del mensaje: precio=${esPreguntaPrecio}, servicios=${esPreguntaServicios}, objeción=${esObjecion}, interés=${esInteresPorUno}`);

    let promptSistema = `Eres ${nombreCliente ? `el asistente comercial de ${nombreCliente}` : 'un experto asistente comercial'}. 

🎯 TU OBJETIVO: Convertir cada conversación en una VENTA. No solo informar, sino VENDER.

🔥 ESTRATEGIA DE VENTAS:
1. CALIFICAR: Identificar necesidad específica y urgencia
2. PRESENTAR: Servicio exacto + precio + beneficios concretos
3. CREAR URGENCIA: Escasez, tiempo limitado, ofertas especiales
4. MANEJAR OBJECIONES: Respuestas preparadas para "es caro", "lo pensaré", etc.
5. CERRAR: Preguntas directas que faciliten la decisión

📋 SERVICIOS DISPONIBLES:`;

    serviciosProcesados.forEach(servicio => {
      promptSistema += `\n• ${servicio.nombre}`;
      if (servicio.precio) promptSistema += ` - $${servicio.precio}`;
    });

    promptSistema += `\n\n💪 REGLAS DE RESPUESTA:
- SIEMPRE menciona precios específicos cuando pregunten por costos
- USA urgencia: "Solo disponible esta semana", "Últimos 3 espacios", "Oferta por tiempo limitado"
- HAZ preguntas que lleven al cierre: "¿Cuándo te gustaría empezar?", "¿Prefieres la cita mañana o el jueves?"
- MANEJA objeciones con valor: Si dicen "es caro" → explica beneficios, ofrece facilidades de pago
- SÉ directo y confiado, no tímido ni genérico

🚀 CONTEXTO DE LA CONVERSACIÓN ACTUAL:`;

    if (esPreguntaPrecio) promptSistema += `\n🎯 El cliente está preguntando por PRECIOS - Esta es tu oportunidad de VENDER.`;
    if (esObjecion) promptSistema += `\n⚠️ El cliente tiene una OBJECIÓN - Manéjala con beneficios y facilidades.`;
    if (esInteresPorUno) promptSistema += `\n✨ El cliente mostró interés en un servicio específico.`;

    const fechaPrimerMensaje = mensajes.length > 0 ? new Date(mensajes[0].created_at) : new Date();
    const diasDesdePrimerMensaje = (Date.now() - fechaPrimerMensaje.getTime()) / (1000 * 60 * 60 * 24);
    const usarHistorial = diasDesdePrimerMensaje <= 3;
    const hayMensajesUsuario = mensajes.some(m =>
      m.origen !== 'unicorn' &&
      m.agent_name !== 'Unicorn AI' &&
      m.agent_name !== 'bot'
    );

    const messages = [{ role: 'system', content: promptSistema }];

    const yaSaludoUnicorn = mensajes.some(m =>
      m.origen === 'unicorn' &&
      m.agent_name === 'Unicorn AI' &&
      m.last_message &&
      m.last_message.trim().length > 10
    );

    if (!yaSaludoUnicorn) {
      let mensajeBienvenida = `¡Hola! 👋`;
      if (promptBase) mensajeBienvenida += ` ${promptBase}`;
      if (serviciosProcesados.length > 0) {
        const servicioDestacado = serviciosProcesados[0];
        mensajeBienvenida += ` 🔥 OFERTA ESPECIAL: ${servicioDestacado.nombre}`;
        if (servicioDestacado.precio) mensajeBienvenida += ` por solo $${servicioDestacado.precio}`;
        mensajeBienvenida += `.\n✨ ¿Cuál de estos servicios te interesa más?`;
        serviciosProcesados.slice(0, 3).forEach((s, i) => {
          mensajeBienvenida += `\n${i + 1}. ${s.nombre}`;
          if (s.precio) mensajeBienvenida += ` - $${s.precio}`;
        });
        mensajeBienvenida += `\n\n📞 ¿Cuándo te gustaría empezar? Solo tengo 3 espacios disponibles esta semana.`;
      } else {
        mensajeBienvenida += ` ¿En qué puedo ayudarte a mejorar tu situación hoy?`;
      }

      messages.push({ role: 'assistant', content: mensajeBienvenida });
    }

    if (hayMensajesUsuario && usarHistorial) {
      const recientes = mensajes.slice(-8);
      recientes.forEach(msg => {
        if (msg.last_message && msg.last_message.trim()) {
          const esBot = msg.origen === 'unicorn' || msg.agent_name === 'Unicorn AI' || msg.agent_name === 'bot';
          messages.push({
            role: esBot ? 'assistant' : 'user',
            content: msg.last_message.slice(0, 300)
          });
        }
      });
    }

    console.log(`📤 Mensajes enviados a GPT: ${messages.length}`);
    console.log('🧠 Preview del primer mensaje a enviar:', messages[1]?.content);
    return { tipo_respuesta, messages };

  } catch (err) {
    console.error('❌ Error generando historial para GPT:', err.message);
    console.error('Stack trace:', err.stack);
    return null;
  }
};

module.exports = { generarHistorialGPT };

