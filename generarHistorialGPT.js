const generarHistorialGPT = async (leadPhone, supabase) => {
  try {
    const baseNumero = leadPhone.replace(/^whatsapp:/, '').replace(/\D/g, '');

    // Buscar historial exacto
    const { data: historial, error: errorHistorial } = await supabase
      .from('conversations')
      .select('last_message, created_at, origen, cliente_id, lead_phone')
      .order('created_at', { ascending: true });

    if (errorHistorial || !historial) {
      console.error('❌ Error al consultar historial:', errorHistorial?.message);
      return null;
    }

    const mensajes = historial.filter(m =>
      m.lead_phone && m.lead_phone.replace(/\D/g, '') === baseNumero
    );

    // Buscar cliente_id en historial o por número
    let cliente_id = null;

    const enHistorial = mensajes.find(m => m.cliente_id);
    if (enHistorial?.cliente_id) {
      cliente_id = enHistorial.cliente_id;
    } else {
      const { data: clienteMatch, error: errCliente } = await supabase
        .from('clientes')
        .select('id')
        .eq('numero_whatsapp', `+${baseNumero}`)
        .single();

      if (clienteMatch?.id) {
        cliente_id = clienteMatch.id;
        console.log(`✅ Cliente detectado por número directo: ID ${cliente_id}`);
      }
    }

    if (!cliente_id) {
      console.warn(`⚠️ No se pudo determinar cliente para el número ${baseNumero}`);
      return null;
    }

    // Cargar datos del cliente
    const { data: cliente, error: errorCliente } = await supabase
      .from('clientes')
      .select('prompt_inicial, lista_servicios, nombre')
      .eq('id', cliente_id)
      .single();

    if (!cliente) {
      console.warn(`⚠️ Cliente ID ${cliente_id} no encontrado`);
      return null;
    }

    const promptBase = cliente.prompt_inicial?.trim() || 'Eres un asistente comercial.';
    const servicios = cliente.lista_servicios
      ?.split('\n')
      .map(s => `• ${s.trim()}`)
      .join('\n') || 'Sin servicios cargados.';

    const mensajesUsuario = mensajes.length > 0;
    const fechaPrimerMensaje = mensajes[0]?.created_at ? new Date(mensajes[0].created_at) : null;
    const diasDesdePrimerMensaje = fechaPrimerMensaje
      ? (Date.now() - fechaPrimerMensaje.getTime()) / (1000 * 60 * 60 * 24)
      : 0;
    const ignorarHistorial = diasDesdePrimerMensaje > 7;

    const hayHistorialValido = mensajes.some(m => m.origen !== 'unicorn') && !ignorarHistorial;

    const messages = [
      {
        role: 'system',
        content: `${promptBase}\n\nServicios disponibles:\n${servicios}`
      },
      ...(hayHistorialValido
        ? mensajes.map(msg => ({
            role: msg.origen === 'unicorn' ? 'assistant' : 'user',
            content: msg.last_message?.slice(0, 300) || ''
          }))
        : [
            {
              role: 'user',
              content: 'Hola, ¿qué ofrecen?'
            }
          ])
    ];

    console.log('🧠 PROMPT GPT ACTIVO:', messages[0].content);
    return messages;
  } catch (err) {
    console.error('❌ Error generando historial GPT:', err.message);
    return null;
  }
};

module.exports = { generarHistorialGPT };
