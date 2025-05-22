// 📦 generarHistorialGPT.js
const generarHistorialGPT = async (leadPhone, supabase) => {
  try {
    const { data: mensajes, error: errorConvers } = await supabase
      .from('conversations')
      .select('last_message, created_at, origen, cliente_id')
      .eq('lead_phone', leadPhone)
      .order('created_at', { ascending: true });

    if (errorConvers || !mensajes || mensajes.length === 0) {
      console.warn('⚠️ No se encontró historial para', leadPhone);
      return null;
    }

    const cliente_id = mensajes[0].cliente_id || 1;

    const { data: cliente, error: errorCliente } = await supabase
      .from('clientes')
      .select('prompt_inicial, lista_servicios')
      .eq('id', cliente_id)
      .single();

    const promptBase = cliente?.prompt_inicial || 'Eres un asistente comercial que responde con cortesía y busca generar interés.';
    const preciosExtra = cliente?.lista_servicios
      ? ` Aquí tienes los servicios disponibles:\n${cliente.lista_servicios.map(s => `- ${s.servicio}: ${s.precio}`).join('\n')}`
      : '';

    const messages = [
      {
        role: 'system',
        content: `${promptBase}${preciosExtra}`
      },
      ...mensajes.map(msg => ({
        role: msg.origen === 'unicorn' ? 'assistant' : 'user',
        content: msg.last_message
      }))
    ];

    return messages;
  } catch (err) {
    console.error('❌ Error generando historial para GPT:', err.message);
    return null;
  }
};

module.exports = { generarHistorialGPT };
