// generarHistorialGPT.js - Versión que NO crashea (usa la configuración directa)

const { createClient } = require('@supabase/supabase-js');

// Configuración directa de Supabase (NO crashea)
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

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
            // FALLBACK: Prompt genérico pero mejorado
            return [{
                role: 'system',
                content: 'Eres un asistente comercial profesional. Responde en máximo 2 líneas. Sé directo y termina con una pregunta para continuar la conversación.'
            }];
        }

        console.log(`✅ Cliente encontrado: ${clientes.nombre}`);
        console.log(`📝 Prompt inicial: ${clientes.prompt_inicial?.substring(0, 100)}...`);
        console.log(`🛍️ Servicios: ${clientes.lista_servicios?.substring(0, 100)}...`);

        // 2. Obtener historial de conversación (últimos 8 mensajes)
        const { data: conversaciones, error: convError } = await supabase
            .from('conversations')
            .select('*')
            .eq('lead_phone', leadPhone)
            .order('created_at', { ascending: true })
            .limit(8);

        if (convError) {
            console.log(`❌ Error obteniendo conversaciones:`, convError);
        }

        // 3. PROMPT OPTIMIZADO - ESTRUCTURA CLARA
        const systemPrompt = `${clientes.prompt_inicial}

SERVICIOS DISPONIBLES:
${clientes.lista_servicios}

INSTRUCCIONES CRÍTICAS:
- Máximo 2-3 líneas de respuesta
- Menciona servicios específicos cuando sea relevante
- Sé directo y comercial, no explicativo
- SIEMPRE termina con una pregunta
- NO uses frases como "Como asistente" o "Estoy aquí para"

EJEMPLO: "Ofrecemos diseño web y marketing digital. ¿Cuál de estos servicios te interesa más?"`;

        // 4. Construir array de mensajes para GPT
        const mensajes = [{
            role: 'system',
            content: systemPrompt
        }];

        // 5. Agregar historial previo (solo últimos 6 para evitar token overflow)
        if (conversaciones && conversaciones.length > 0) {
            const historialReciente = conversaciones.slice(-6);
            
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

        // 6. Agregar mensaje actual del usuario
        if (nuevoMensaje) {
            mensajes.push({
                role: 'user',
                content: nuevoMensaje
            });
        }

        console.log(`📊 Historial generado: ${mensajes.length} mensajes`);
        console.log(`🎯 Prompt personalizado aplicado para: ${clientes.nombre}`);
        
        return mensajes;

    } catch (error) {
        console.error('❌ Error en generarHistorialGPT:', error);
        // FALLBACK DE EMERGENCIA
        return [{
            role: 'system',
            content: 'Eres un asistente comercial. Responde profesionalmente en máximo 2 líneas y termina con una pregunta.'
        }, {
            role: 'user',
            content: nuevoMensaje || 'Hola'
        }];
    }
}

module.exports = { generarHistorialGPT };
