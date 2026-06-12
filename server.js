const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-client');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '2gb' })); // Soporta la transmisión de archivos masivos y multimedia

// =========================================================================
// CONFIGURACIÓN DE SUPABASE: Credenciales integradas del proyecto
// =========================================================================
const SUPABASE_URL = 'https://fxqcxidwcfaczbkdvrbw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_79A740LSOyvcKxXFYNBUQQ__BcE99Lc'; 
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const MASTER_KEY = '2969';

// Middleware de seguridad y control de privilegios
function requireAdminAuth(req, res, next) {
    const userKey = req.headers['x-jarvis-auth'] || req.body.authKey;
    if (userKey === MASTER_KEY) {
        next();
    } else {
        res.status(403).json({ error: "ACCESO DENEGADO. Autenticación de núcleo inválida." });
    }
}

// TRANSMISIÓN PÚBLICA: Descarga e indexa los datos directamente desde la base de datos de Supabase
app.get('/api/data', async (req, res) => {
    try {
        const { data: elements, error: err1 } = await supabase.from('jarvis_elements').select('*');
        const { data: objectives, error: err2 } = await supabase.from('jarvis_objectives').select('*');
        
        if (err1 || err2) throw new Error("Fallo al conectar o consultar el almacén de Supabase");

        // Adaptación de mapeo nativo para el ecosistema index.html
        const formattedElements = (elements || []).map(e => ({
            id: Number(e.id), title: e.title, type: e.type, content: e.content, 
            mimeType: e.mime_type, fileUrl: e.file_url, cover: e.cover
        }));

        const formattedObjectives = (objectives || []).map(o => ({
            id: Number(o.id), text: o.text, completed: o.completed
        }));

        res.json({ elements: formattedElements, objectives: formattedObjectives });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// INYECCIÓN REMOTA: Decodifica el archivo binario, lo sube al Storage y registra la traza en la tabla
app.post('/api/upload', requireAdminAuth, async (req, res) => {
    const { title, type, content, fileName, fileData, coverData, mimeType } = req.body;
    const id = Date.now();
    let fileUrl = '';

    try {
        // Procesamiento e inyección del archivo real en el Storage público de Supabase
        if (fileData && fileName) {
            const base64Content = fileData.split(';base64,').pop();
            const buffer = Buffer.from(base64Content, 'base64');
            const safeFileName = `${id}_${fileName.replace(/\s+/g, '_')}`;

            // Transferencia de datos al cubo de almacenamiento 'jarvis-media'
            const { data: storageData, error: storageErr } = await supabase.storage
                .from('jarvis-media')
                .upload(safeFileName, buffer, { contentType: mimeType, cacheControl: '3600' });

            if (storageErr) throw storageErr;

            // Extracción de la URL pública definitiva para streaming global inmediato
            const { data: urlData } = supabase.storage.from('jarvis-media').getPublicUrl(safeFileName);
            fileUrl = urlData.publicUrl;
        }

        // Registro de los metadatos en la tabla relacional permanente
        const { error: dbErr } = await supabase.from('jarvis_elements').insert([{
            id, title, type, content, mime_type: mimeType, file_url: fileUrl, cover: coverData
        }]);

        if (dbErr) throw dbErr;

        res.json({ success: true, item: { id, title, type, content, mimeType, fileUrl, cover: coverData } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PURGA TOTAL: Elimina el archivo binario del Storage y borra su registro de la base de datos
app.delete('/api/element/:id', requireAdminAuth, async (req, res) => {
    const id = parseInt(req.params.id);

    try {
        // Localización del elemento para recuperar el nombre exacto de su archivo físico en la nube
        const { data: item, error: findErr } = await supabase.from('jarvis_elements').select('*').eq('id', id).single();
        
        if (item && item.file_url) {
            const fileName = item.file_url.split('/').pop();
            // Remoción física del archivo binario
            await supabase.storage.from('jarvis-media').remove([fileName]);
        }

        // Remoción del registro lógico en la tabla de datos
        const { error: delErr } = await supabase.from('jarvis_elements').delete().eq('id', id);
        if (delErr) throw delErr;

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GESTIÓN Y SINCRONIZACIÓN DE DIRECTIVAS CENTRALES
app.post('/api/objectives', requireAdminAuth, async (req, res) => {
    const { objectives } = req.body;

    try {
        // Limpieza del árbol antiguo e inserción de la nueva matriz actualizada
        await supabase.from('jarvis_objectives').delete().neq('id', 0);
        
        if (objectives && objectives.length > 0) {
            const rows = objectives.map(o => ({ id: o.id, text: o.text, completed: o.completed }));
            const { error } = await supabase.from('jarvis_objectives').insert(rows);
            if (error) throw error;
        }
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`J.A.R.V.I.S. Core Online - Enlace permanente establecido con Supabase en puerto ${PORT}`);
});