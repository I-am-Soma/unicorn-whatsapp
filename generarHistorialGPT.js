const generarHistorialGPT = async (leadPhone, supabase) => {
  try {
    const baseNumero = leadPhone.replace(/^whatsapp:/, '').replace(/\D/g, '');

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

    let cliente_id = null;

    if (mensajes.length > 0) {
      const mensajeConCliente = mensajes.find(m => m.cliente_id);
      if (mensajeConCliente?.cliente_id) {
        cliente_id = mensajeConCliente.cliente_id;
      }
    }

    if (!cliente_id) {
      const { data: clientePorNumero, error: errorNumero } = await supabase
        .from('clientes')
        .select('id')
        .eq('numero_whatsapp', `+${baseNumero}`)
        .single();

      if (clientePorNumero?.id) {
        cliente_id = clientePorNumero.id;
        console.log(`✅ Cliente detectado por número: ID ${cliente_id}`);
      }
    }

    if (!cliente_id) {
      console.warn(`❌ No se pudo asociar ningún cliente al número +${baseNumero}`);
      return null;
    }

    const { data: cliente, error: errorCliente } = await supabase
      .from('clientes')
      .select('prompt_inicial, lista_servicios, nombre')
      .eq('id', cliente_id)
      .single();

    if (!cliente) {
      console.warn(`❌ Cliente ID ${cliente_id} no encontrado en tabla clientes`);
      return null;
    }

    const promptBase = cliente.prompt_inicial?.trim();
    const servicios = cliente.lista_servicios
      ?.split('\n')
      .map(s => `• ${s.trim()}`)
      .join('\n');

    if (!promptBase) {
      console.warn(`❌ Cliente ${cliente_id} no tiene prompt_inicial definido`);
      return null;
    }

    const mensajesValidos = mensajes.filter(m => !!m.last_message);

    const fechaPrimerMensaje = mensajesValidos[0]?.created_at
      ? new Date(mensajesValidos[0].created_at)
      : null;

    const diasDesdePrimerMensaje = fechaPrimerMensaje
      ? (Date.now() - fechaPrimerMensaje.getTime()) / (1000 * 60 * 60 * 24)
      : 0;

    const ignorarHistorial = diasDesdePrimerMensaje > 7;
    const hayHistorialValido = mensajesValidos.some(m => m.origen !== 'unicorn') && !ignorarHistorial;

    const messages = [
      {
        role: 'system',
        content: `${promptBase}\n\nServicios disponibles:\n${servicios || 'No hay servicios definidos.'}`
      },
      ...(hayHistorialValido
        ? mensajesValidos.map(msg => ({
            role: msg.origen === 'unicorn' ? 'assistant' : 'user',
            content: msg.last_message?.slice(0, 300) || ''
          }))
        : [{
            role: 'user',
            content: 'Hola, ¿qué servicios ofrecen?'
          }]
      )
    ];

    console.log('🧠 PROMPT FINAL PARA GPT:', messages[0].content);
    return messages;
  } catch (err) {
    console.error('❌ Error generando historial GPT:', err.message);
    return null;
  }
};

module.exports = { generarHistorialGPT };

