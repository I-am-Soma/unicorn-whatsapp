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

    console.log(`📝 Prompt inicial encontrado: ${promptBase ? 'SÍ' : 'NO'}`);
    console.log(`🛍️ Servicios encontrados: ${servicios ? 'SÍ' : 'NO'}`);
    console.log(`🏢 Nombre cliente: ${nombreCliente || 'No definido'}`);

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

    console.log(`🎯 Análisis del mensaje: precio=${esPreguntaPrecio}, servicios=${esPreguntaServicios}, objeción=${esObjecion}, interés=${esInteresPorUno}`);

    const usarFallbackUniversal = !promptBase && !esPreguntaPrecio && !esPreguntaServicios && !esInteresPorUno;

    let promptSistema = usarFallbackUniversal
      ? \`
Eres un asistente profesional, empático e inteligente. Tu misión es:
1. Contestar la pregunta del usuario de forma clara, útil y precisa.
2. Si aplica, conectar con los productos o servicios del cliente.
3. Si no aplica, orientar al usuario profesionalmente sin forzar una venta.

✅ SIEMPRE responde con información real y relevante.
✅ NUNCA ignores la intención del usuario, aunque el prompt esté mal hecho.
✅ NO repitas guiones si la situación no lo amerita.

Ejemplos:
- Si alguien pregunta "¿qué lentes me recomiendan si tengo cara redonda?" → primero responde con una recomendación profesional según el rostro, luego mencionas el producto adecuado (si hay).
- Si el usuario solo dice "hola", puedes iniciar usando el prompt del cliente (si existe).
- Si pregunta por dudas técnicas, responde como experto.

Tu prioridad es que el usuario sienta que habla con un humano inteligente, no con un robot vendedor.
\`
      : \`Eres el asistente comercial de \${nombreCliente || 'nuestro negocio'}.

🎯 TU OBJETIVO: Convertir cada conversación en una VENTA.

🔥 ESTRATEGIA DE VENTAS:
1. CALIFICAR: Identificar necesidad específica y urgencia
2. PRESENTAR: Servicio exacto + precio + beneficios concretos
3. CREAR URGENCIA
4. MANEJAR OBJECIONES
5. CERRAR

📋 SERVICIOS DISPONIBLES:\${
  serviciosProcesados.map(s => `\n• \${s.nombre}${s.precio ? ' - $' + s.precio : ''}`).join('')
}

🚀 CONTEXTO DE LA CONVERSACIÓN ACTUAL:\${
  esPreguntaPrecio ? '\n🎯 El cliente pregunta por precios.' : ''
}\${
  esObjecion ? '\n⚠️ El cliente tiene una objeción.' : ''
}\${
  esInteresPorUno ? '\n✨ Interés en un servicio específico.' : ''
}\`;

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
      let mensajeBienvenida = \`¡Hola! 👋\${promptBase ? ' ' + promptBase : ''}\`;

      if (serviciosProcesados.length > 0) {
        const servicioDestacado = serviciosProcesados[0];
        mensajeBienvenida += \` 🔥 OFERTA ESPECIAL: \${servicioDestacado.nombre}\${servicioDestacado.precio ? ' por solo $' + servicioDestacado.precio : ''}.\`;
      }

      messages.push({ role: 'assistant', content: mensajeBienvenida });
    }

    if (hayMensajesUsuario && usarHistorial) {
      mensajes.slice(-8).forEach(msg => {
        if (msg.last_message?.trim()) {
          const esBot = msg.origen === 'unicorn' || msg.agent_name === 'Unicorn AI' || msg.agent_name === 'bot';
          messages.push({
            role: esBot ? 'assistant' : 'user',
            content: msg.last_message.slice(0, 300)
          });
        }
      });
    }

    console.log(`📤 Mensajes enviados a GPT: \${messages.length}`);
    return messages;

  } catch (err) {
    console.error('❌ Error generando historial para GPT:', err.message);
    return null;
  }
};

module.exports = { generarHistorialGPT };
