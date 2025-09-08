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
                nombre: match[1].replace(/^[•\-*]\s*/, '').trim(),
                precio: match[2],
                descripcion: linea.trim()
              };
            }
            return {
              nombre: linea.replace(/^[•\-*]\s*/, '').trim(),
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

    let promptSistema = '';
    const usarFallbackUniversal = !promptBase && !esPreguntaPrecio && !esPreguntaServicios && !esInteresPorUno;

    const promptInteligenteUniversal = [
      'Eres un asistente profesional, empático e inteligente. Tu misión es:',
      '1. Contestar la pregunta del usuario de forma clara, útil y precisa.',
      '2. Si aplica, conectar con los productos o servicios del cliente.',
      '3. Si no aplica, orientar al usuario profesionalmente sin forzar una venta.',
      '',
      '✅ SIEMPRE responde con información real y relevante.',
      '✅ NUNCA ignores la intención del usuario, aunque el prompt esté mal hecho.',
      '✅ NO repitas guiones si la situación no lo amerita.',
      '',
      'Ejemplos:',
      '- Si alguien pregunta "¿qué lentes me recomiendan si tengo cara redonda?" → primero responde con una recomendación profesional según el rostro, luego mencionas el producto adecuado (si hay).',
      '- Si el usuario solo dice "hola", puedes iniciar usando el prompt del cliente (si existe).',
      '- Si pregunta por dudas técnicas, responde como experto.',
      '',
      'Tu prioridad es que el usuario sienta que habla con un humano inteligente, no con un robot vendedor.'
    ].join('\n');

    if (usarFallbackUniversal) {
      promptSistema = promptInteligenteUniversal;
    } else {
      promptSistema = `Eres ${nombreCliente ? `el asistente comercial de ${nombreCliente}` : 'un experto asistente comercial'}.
🎯 TU OBJETIVO: Convertir cada conversación en una VENTA. No solo informar, sino VENDER.
🔥 ESTRATEGIA DE VENTAS:
1. CALIFICAR: Identificar necesidad específica y urgencia
2. PRESENTAR: Servicio exacto + precio + beneficios concretos
3. CREAR URGENCIA: Escasez, tiempo limitado, ofertas especiales
4. MANEJAR OBJECIONES: Respuestas preparadas para "es caro", "lo pensaré", etc.
5. CERRAR: Preguntas directas que faciliten la decisión
📋 SERVICIOS DISPONIBLES:`;

      if (serviciosProcesados.length > 0) {
        serviciosProcesados.forEach(servicio => {
          promptSistema += `\n• ${servicio.nombre}`;
          if (servicio.precio) {
            promptSistema += ` - $${servicio.precio}`;
          }
        });
      }

      promptSistema += `\n\n💪 REGLAS DE RESPUESTA:
- SIEMPRE menciona precios específicos cuando pregunten por costos
- USA urgencia: "Solo disponible esta semana", "Últimos 3 espacios", "Oferta por tiempo limitado"
- HAZ preguntas que lleven al cierre: "¿Cuándo te gustaría empezar?", "¿Prefieres la cita mañana o el jueves?"
- MANEJA objeciones con valor: Si dicen "es caro" → explica beneficios, ofrece facilidades de pago
- SÉ directo y confiado, no tímido ni genérico`;

      if (esPreguntaPrecio) {
        promptSistema += `\n🎯 El cliente está preguntando por PRECIOS.`;
      }
      if (esObjecion) {
        promptSistema += `\n⚠️ El cliente tiene una OBJECIÓN.`;
      }
      if (esInteresPorUno) {
        promptSistema += `\n✨ El cliente mostró interés en un servicio específico.`;
      }
    }

    return [
      {
        role: 'system',
        content: promptSistema
      }
    ];
  } catch (err) {
    console.error('❌ Error generando historial para GPT:', err.message);
    console.error('Stack trace:', err.stack);
    return null;
  }
};

module.exports = { generarHistorialGPT };
