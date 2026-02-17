const generarHistorialGPT = async (leadPhone, supabase, client_id) => {
  try {
    console.log(`🔍 Generando historial para: ${leadPhone}`);
    console.log(`👤 Client ID recibido: ${client_id}`);

    if (!leadPhone || !client_id) {
      console.error('❌ Falta leadPhone o client_id');
      return null;
    }

    // Normalizar número del lead
    const baseNumero = leadPhone
      .replace(/^whatsapp:/, '')
      .replace(/\D/g, '');

    // 🔐 CLIENTE SIEMPRE POR ID
    const { data: cliente, error: clienteError } = await supabase
      .from('clientes')
      .select('id, nombre, prompt_inicial, lista_servicios')
      .eq('id', client_id)
      .single();

    if (clienteError || !cliente) {
      console.error('❌ Cliente no encontrado por client_id:', client_id);
      return null;
    }

    // 📚 Historial SOLO del cliente correcto
    const { data: conversaciones, error: convError } = await supabase
      .from('conversations')
      .select('last_message, created_at, origen, lead_phone, agent_name')
      .eq('client_id', client_id)
      .order('created_at', { ascending: true })
      .limit(200);

    if (convError || !conversaciones) {
      console.error('❌ Error consultando conversaciones');
      return null;
    }

    // Filtrar solo mensajes de este lead
    const mensajes = conversaciones.filter(c =>
      c.lead_phone &&
      c.lead_phone.replace(/\D/g, '').includes(baseNumero)
    );

    console.log(`💬 Mensajes encontrados: ${mensajes.length}`);

    // 🧠 Prompt base del cliente
    let promptSistema =
      cliente.prompt_inicial?.trim() ||
      `Eres un asistente comercial de ${cliente.nombre}.`;

    // Agregar servicios si existen
    if (cliente.lista_servicios) {
      try {
        const servicios = typeof cliente.lista_servicios === 'string'
          ? JSON.parse(cliente.lista_servicios)
          : cliente.lista_servicios;

        if (Array.isArray(servicios) && servicios.length > 0) {
          promptSistema += `\n\nServicios disponibles:\n`;
          servicios.forEach(s => {
            promptSistema += `• ${s.nombre || s.name}`;
            if (s.precio || s.price) {
              promptSistema += ` - $${s.precio || s.price}`;
            }
            promptSistema += `\n`;
          });
        }
      } catch (e) {
        console.warn('⚠️ lista_servicios no es JSON válido');
      }
    }

    const messages = [
      { role: 'system', content: promptSistema }
    ];

    // Usar últimos 6 mensajes como contexto
    mensajes.slice(-6).forEach(m => {
      if (!m.last_message) return;

      const esBot =
        m.origen === 'unicorn' ||
        m.agent_name === 'Unicorn AI';

      messages.push({
        role: esBot ? 'assistant' : 'user',
        content: m.last_message.slice(0, 500)
      });
    });

    console.log(`📤 Mensajes enviados a GPT: ${messages.length}`);
    return messages;

  } catch (err) {
    console.error('❌ Error generando historial GPT:', err.message);
    return null;
  }
};

module.exports = { generarHistorialGPT }; 
