const generarHistorialGPT = async (conversation, supabase) => {
  try {
    const { lead_phone, client_id } = conversation;

    console.log(`🔍 Generando historial para lead: ${lead_phone}`);
    console.log(`👤 Client ID recibido: ${client_id}`);

    if (!client_id) {
      console.error('❌ Conversation sin client_id, abortando');
      return null;
    }

    /* ===============================
       1️⃣ OBTENER CLIENTE (POR ID)
    =============================== */
    const { data: cliente, error: clienteError } = await supabase
      .from('clientes')
      .select('id, nombre, prompt_inicial, lista_servicios')
      .eq('id', client_id)
      .single();

    if (clienteError || !cliente) {
      console.error('❌ Cliente no encontrado por client_id:', client_id);
      return null;
    }

    console.log(`🏢 Cliente cargado: ${cliente.nombre}`);

    /* ===============================
       2️⃣ OBTENER HISTORIAL (CLIENTE + LEAD)
    =============================== */
    const { data: mensajes, error: mensajesError } = await supabase
      .from('conversations')
      .select('last_message, origen, agent_name, created_at')
      .eq('client_id', client_id)
      .eq('lead_phone', lead_phone)
      .order('created_at', { ascending: true })
      .limit(50);

    if (mensajesError) {
      console.error('❌ Error consultando historial:', mensajesError.message);
      return null;
    }

    console.log(`💬 Mensajes encontrados: ${mensajes?.length || 0}`);

    /* ===============================
       3️⃣ PROCESAR SERVICIOS
    =============================== */
    let serviciosProcesados = [];
    const servicios = cliente.lista_servicios;

    if (servicios) {
      try {
        const parsed = typeof servicios === 'string' ? JSON.parse(servicios) : servicios;
        serviciosProcesados = Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        serviciosProcesados = servicios
          .split('\n')
          .filter(Boolean)
          .map(linea => {
            const match = linea.match(/(.+?)[\s-]*\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/);
            return {
              nombre: match ? match[1].trim() : linea.trim(),
              precio: match ? match[2] : null,
              descripcion: linea.trim()
            };
          });
      }
    }

    console.log(`💰 Servicios procesados: ${serviciosProcesados.length}`);

    /* ===============================
       4️⃣ ANALIZAR ÚLTIMO MENSAJE USUARIO
    =============================== */
    const ultimoMensajeUsuario =
      mensajes
        ?.filter(m => m.origen !== 'unicorn' && m.agent_name !== 'Unicorn AI')
        .pop()?.last_message?.toLowerCase() || '';

    const esPreguntaPrecio = /cuanto|cuesta|precio|cost|dollar|peso|barato|caro|vale/.test(ultimoMensajeUsuario);
    const esPreguntaServicios = /servicio|que hac|ofrec|tratamiento|procedimiento/.test(ultimoMensajeUsuario);
    const esObjecion = /caro|expensive|mucho|pensarlo|despues|luego|maybe/.test(ultimoMensajeUsuario);
    const esInteresPorUno = serviciosProcesados.some(s =>
      ultimoMensajeUsuario.includes(s.nombre?.toLowerCase().substring(0, 5))
    );

    console.log(`🎯 Intención: precio=${esPreguntaPrecio}, servicios=${esPreguntaServicios}, objeción=${esObjecion}`);

    /* ===============================
       5️⃣ CONSTRUIR PROMPT SYSTEM
    =============================== */
    let promptSistema =
      cliente.prompt_inicial?.trim() ||
      `Eres un asistente comercial experto de ${cliente.nombre}.`;

    if (serviciosProcesados.length > 0) {
      promptSistema += `\n\nServicios disponibles:\n`;
      serviciosProcesados.forEach(s => {
        promptSistema += `• ${s.nombre}`;
        if (s.precio) promptSistema += ` - $${s.precio}`;
        promptSistema += `\n`;
      });
    }

    /* ===============================
       6️⃣ ARMAR MENSAJES GPT
    =============================== */
    const messages = [{ role: 'system', content: promptSistema }];

    const usarHistorial = mensajes?.length > 0;
    if (usarHistorial) {
      mensajes.slice(-6).forEach(m => {
        if (!m.last_message) return;
        const esBot = m.origen === 'unicorn' || m.agent_name === 'Unicorn AI';
        messages.push({
          role: esBot ? 'assistant' : 'user',
          content: m.last_message.slice(0, 500)
        });
      });
    }

    console.log(`📤 Mensajes enviados a GPT: ${messages.length}`);

    return messages;

  } catch (err) {
    console.error('❌ Error generando historial GPT:', err.message);
    console.error(err.stack);
    return null;
  }
};

module.exports = { generarHistorialGPT };
