const generarHistorialGPT = async (leadPhone, supabase) => {
  try {
    console.log(`🔍 Generando historial para: ${leadPhone}`);
    
    const baseNumero = leadPhone.replace(/^whatsapp:/, '').replace(/\D/g, '');
    console.log(`📱 Número base extraído: ${baseNumero}`);
    
    // Obtener cliente basado en el número
    const numeroConFormato = `+${baseNumero}`;
    const { data: clienteMatch, error: clienteError } = await supabase
      .from('clientes')
      .select('id, prompt_inicial, lista_servicios, nombre, numero_whatsapp')
      .eq('numero_whatsapp', numeroConFormato)
      .single();

    if (clienteError && clienteError.code !== 'PGRST116') {
      console.error('❌ Error consultando cliente:', clienteError.message);
    }

    const cliente_id = clienteMatch?.id || 1;
    console.log(`👤 Cliente ID detectado: ${cliente_id} (${clienteMatch?.nombre || 'Cliente por defecto'})`);

    // Obtener historial de conversaciones
    const { data: todos, error } = await supabase
      .from('conversations')
      .select('last_message, created_at, origen, cliente_id, lead_phone, agent_name')
      .order('created_at', { ascending: true })
      .limit(200);

    if (error || !todos) {
      console.error('❌ Error al consultar historial:', error?.message);
      return null;
    }

    // Filtrar mensajes que coincidan con este número de teléfono
    const mensajes = todos.filter(m =>
      m.lead_phone && m.lead_phone.replace(/\D/g, '').includes(baseNumero)
    );

    console.log(`💬 Mensajes encontrados en historial: ${mensajes.length}`);

    // Obtener configuración del cliente
    const { data: cliente, error: errorCliente } = await supabase
      .from('clientes')
      .select('prompt_inicial, lista_servicios, nombre')
      .eq('id', cliente_id)
      .single();

    if (errorCliente) {
      console.error('❌ Error consultando configuración del cliente:', errorCliente.message);
    }

    // Preparar datos del cliente
    const promptBase = cliente?.prompt_inicial?.trim();
    const servicios = cliente?.lista_servicios?.trim();
    const nombreCliente = cliente?.nombre?.trim();

    console.log(`📝 Prompt inicial encontrado: ${promptBase ? 'SÍ' : 'NO'}`);
    console.log(`🛍️ Servicios encontrados: ${servicios ? 'SÍ' : 'NO'}`);
    console.log(`🏢 Nombre cliente: ${nombreCliente || 'No definido'}`);

    // PROCESAMIENTO INTELIGENTE DE SERVICIOS
    let serviciosProcesados = [];
    if (servicios) {
      try {
        // Intentar parsear como JSON primero
        const serviciosArray = typeof servicios === 'string' ? JSON.parse(servicios) : servicios;
        serviciosProcesados = Array.isArray(serviciosArray) ? serviciosArray : [];
      } catch (e) {
        // Si no es JSON, procesar como texto línea por línea
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

    // ANALIZAR EL ÚLTIMO MENSAJE DEL USUARIO
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

    // CREAR PROMPT DE SISTEMA OPTIMIZADO PARA VENTAS
    let promptSistema = `Eres ${nombreCliente ? `el asistente comercial de ${nombreCliente}` : 'un experto asistente comercial'}. 

🎯 TU OBJETIVO: Convertir cada conversación en una VENTA. No solo informar, sino VENDER.

🔥 ESTRATEGIA DE VENTAS:
1. CALIFICAR: Identificar necesidad específica y urgencia
2. PRESENTAR: Servicio exacto + precio + beneficios concretos
3. CREAR URGENCIA: Escasez, tiempo limitado, ofertas especiales
4. MANEJAR OBJECIONES: Respuestas preparadas para "es caro", "lo pensaré", etc.
5. CERRAR: Preguntas directas que faciliten la decisión

📋 SERVICIOS DISPONIBLES:`;

    // Agregar servicios con formato de ventas
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
- SÉ directo y confiado, no tímido ni genérico

🚀 CONTEXTO DE LA CONVERSACIÓN ACTUAL:`;

    if (esPreguntaPrecio) {
      promptSistema += `\n🎯 El cliente está preguntando por PRECIOS - Esta es tu oportunidad de VENDER. Da precios específicos + beneficios + urgencia.`;
    }
    if (esObjecion) {
      promptSistema += `\n⚠️ El cliente tiene una OBJECIÓN - Manéjala con beneficios y facilidades de pago.`;
    }
    if (esInteresPorUno) {
      promptSistema += `\n✨ El cliente mostró interés en un servicio específico - ENFÓCATE en ese servicio y cierra la venta.`;
    }

    // Determinar si usar historial
    const fechaPrimerMensaje = mensajes.length > 0 ? new Date(mensajes[0].created_at) : new Date();
    const diasDesdePrimerMensaje = (Date.now() - fechaPrimerMensaje.getTime()) / (1000 * 60 * 60 * 24);
    const usarHistorial = diasDesdePrimerMensaje <= 3; // Reducido a 3 días para conversaciones más frescas
    
    console.log(`📅 Días desde primer mensaje: ${diasDesdePrimerMensaje.toFixed(1)}`);
    console.log(`🔄 Usar historial: ${usarHistorial}`);

    // Verificar mensajes del usuario
    const hayMensajesUsuario = mensajes.some(m => 
      m.origen !== 'unicorn' && 
      m.agent_name !== 'Unicorn AI' && 
      m.agent_name !== 'bot'
    );

    console.log(`👤 Hay mensajes del usuario: ${hayMensajesUsuario}`);

    // Construir mensajes para GPT
    const messages = [
      {
        role: 'system',
        content: promptSistema
      }
    ];

    // Si es primera interacción, mensaje de bienvenida orientado a ventas
    if (!hayMensajesUsuario || !usarHistorial) {
      let mensajeBienvenida = `¡Hola! 👋`;
      
      if (nombreCliente) {
        mensajeBienvenida += ` Soy tu especialista en ${nombreCliente}.`;
      }
      
      if (serviciosProcesados.length > 0) {
        const servicioDestacado = serviciosProcesados[0];
        mensajeBienvenida += ` 🔥 **OFERTA ESPECIAL ESTA SEMANA**: ${servicioDestacado.nombre}`;
        if (servicioDestacado.precio) {
          mensajeBienvenida += ` por solo $${servicioDestacado.precio}`;
        }
        mensajeBienvenida += `.\n\n✨ ¿Cuál de estos servicios te interesa más?`;
        
        // Mostrar máximo 3 servicios principales
        serviciosProcesados.slice(0, 3).forEach((servicio, index) => {
          mensajeBienvenida += `\n${index + 1}. ${servicio.nombre}`;
          if (servicio.precio) {
            mensajeBienvenida += ` - $${servicio.precio}`;
          }
        });
        
        mensajeBienvenida += `\n\n📞 ¿Cuándo te gustaría empezar? Solo tengo 3 espacios disponibles esta semana.`;
      } else {
        mensajeBienvenida += ` ¿En qué puedo ayudarte a mejorar tu situación hoy?`;
      }

      messages.push({
        role: 'assistant',
        content: mensajeBienvenida
      });
    }

    // Agregar historial reciente si aplica
    if (hayMensajesUsuario && usarHistorial) {
      const mensajesRecientes = mensajes.slice(-8); // Reducido para mantener contexto fresco
      
      mensajesRecientes.forEach(msg => {
        if (msg.last_message && msg.last_message.trim()) {
          const esBot = msg.origen === 'unicorn' || 
                       msg.agent_name === 'Unicorn AI' || 
                       msg.agent_name === 'bot';
          
          messages.push({
            role: esBot ? 'assistant' : 'user',
            content: msg.last_message.slice(0, 300) // Limitado para eficiencia
          });
        }
      });
    }

    console.log(`📤 Mensajes enviados a GPT: ${messages.length}`);
    console.log(`🎯 Tipo de respuesta esperada: ${esPreguntaPrecio ? 'PRECIOS' : esObjecion ? 'MANEJO_OBJECIÓN' : 'VENTA_GENERAL'}`);
    
    return messages;
    
  } catch (err) {
    console.error('❌ Error generando historial para GPT:', err.message);
    console.error('Stack trace:', err.stack);
    return null;
  }
};

module.exports = { generarHistorialGPT };
