// generarHistorialGPT.js - Versión CORREGIDA que no crashea

// CAMBIO: Ajustar la ruta del supabaseClient según tu estructura de archivos
// Opciones comunes:
const supabase = require('./supabase'); // Si tu archivo se llama supabase.js
// const supabase = require('./config/supabase'); // Si está en carpeta config
// const supabase = require('./db/supabase'); // Si está en carpeta db

// Si no tienes el archivo, aquí está la implementación básica:
/*
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);
*/

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
                content: 'Eres un asistente de atención al cliente. Responde de forma profesional y concisa en máximo 2 líneas.'
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
            .limit(10);

        if (convError) {
            console.log(`❌ Error obteniendo conversaciones:`, convError);
        }

        // 3. PROMPT OPTIMIZADO PERO MÁS SIMPLE
        const systemPrompt = `${clientes.prompt_inicial}

SERVICIOS DISPONIBLES:
${clientes.lista_servicios}

REGLAS IMPORTANTES:
- Responde MÁXIMO 2-3 líneas
- Menciona servicios específicos si preguntan
- Sé directo y comercial
- Termina siempre con una pregunta`;

        // 4. Construir mensajes
        const mensajes = [{
            role: 'system',
            content: systemPrompt
        }];

        // Agregar historial previo (últimos 6 mensajes para no saturar)
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

        // 5. Agregar mensaje actual
        if (nuevoMensaje) {
            mensajes.push({
                role: 'user',
                content: nuevoMensaje
            });
        }

        console.log(`📊 Historial generado con ${mensajes.length} mensajes`);
        console.log(`🎯 Sistema prompt: ${systemPrompt.substring(0, 150)}...`);
        
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
