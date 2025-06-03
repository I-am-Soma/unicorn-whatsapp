// generarHistorialGPT.js - Versión optimizada para respuestas más directas

const supabase = require('./supabaseClient');

async function generarHistorialGPT(leadPhone, nuevoMensaje) {
    try {
        console.log(`🔄 Generando historial GPT para: ${leadPhone}`);
        
        // 1. Obtener cliente por número de WhatsApp
        const { data: clientes, error: clienteError } = await supabase
            .from('clientes')
            .select('*')
            .eq('numero_whatsapp', leadPhone)
            .single();

        if (clienteError || !clientes) {
            console.log(`❌ Cliente no encontrado para ${leadPhone}:`, clienteError);
            return [{
                role: 'system',
                content: 'Eres un asistente de atención al cliente. Responde de forma profesional y concisa.'
            }];
        }

        console.log(`✅ Cliente encontrado: ${clientes.nombre}`);
        console.log(`📝 Prompt inicial: ${clientes.prompt_inicial?.substring(0, 100)}...`);
        console.log(`🛍️ Servicios: ${clientes.lista_servicios?.substring(0, 100)}...`);

        // 2. Obtener historial de conversación
        const { data: conversaciones, error: convError } = await supabase
            .from('conversations')
            .select('*')
            .eq('lead_phone', leadPhone)
            .order('created_at', { ascending: true })
            .limit(10); // Limitar historial para evitar tokens excesivos

        if (convError) {
            console.log(`❌ Error obteniendo conversaciones:`, convError);
        }

        // 3. PROMPT OPTIMIZADO CON ESTRUCTURA CLARA
        const systemPrompt = `${clientes.prompt_inicial}

SERVICIOS DISPONIBLES:
${clientes.lista_servicios}

INSTRUCCIONES ESPECÍFICAS:
- Responde MÁXIMO 2-3 líneas
- Menciona servicios específicos cuando sea relevante
- Sé directo y comercial
- No divagues ni des explicaciones largas
- Si preguntan por servicios, lista los disponibles
- Siempre termina con una pregunta para continuar la conversación

EJEMPLO DE RESPUESTA BUENA:
"¡Hola! Ofrecemos [servicio específico] que te puede interesar. ¿Te gustaría saber más sobre alguno en particular?"`;

        // 4. Construir mensajes del historial
        const mensajes = [{
            role: 'system',
            content: systemPrompt
        }];

        // Agregar historial previo (máximo 5 intercambios)
        if (conversaciones && conversaciones.length > 0) {
            const historialReciente = conversaciones.slice(-10); // Últimos 10 mensajes
            
            historialReciente.forEach(conv => {
                if (conv.origen === 'lead') {
                    mensajes.push({
                        role: 'user',
                        content: conv.last_message
                    });
                } else if (conv.origen === 'bot') {
                    mensajes.push({
                        role: 'assistant',
                        content: conv.last_message
                    });
                }
            });
        }

        // 5. Agregar mensaje actual
        if (nuevoMensaje) {
            mensajes.push({
                role: 'user',
                content: nuevoMensaje
            });
        }

        console.log(`📊 Historial generado con ${mensajes.length} mensajes`);
        console.log(`🎯 Sistema prompt (primeros 200 chars): ${systemPrompt.substring(0, 200)}...`);
        
        return mensajes;

    } catch (error) {
        console.error('❌ Error en generarHistorialGPT:', error);
        return [{
            role: 'system',
            content: 'Eres un asistente comercial. Responde de forma breve y profesional, máximo 2 líneas.'
        }];
    }
}

module.exports = { generarHistorialGPT };
