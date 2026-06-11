const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '2gb' })); // Soporta archivos masivos

const DATA_FILE = path.join(__dirname, 'metadata.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Asegurar directorios de almacenamiento físico virtual
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ elements: [], objectives: [] }));

// Servir la carpeta de archivos multimedia al mundo entero
app.use('/uploads', express.static(UPLOADS_DIR));

// Servir también el archivo index.html de manera estática si se aloja junto
app.use(express.static(path.join(__dirname, 'public')));

// Clave de administración idéntica a la interfaz
const MASTER_KEY = '2969';

// Middleware de autenticación (Bloquea intrusos en el servidor)
function requireAdminAuth(req, res, next) {
    const userKey = req.headers['x-jarvis-auth'] || req.body.authKey;
    if (userKey === MASTER_KEY) {
        next();
    } else {
        res.status(403).json({ error: "ACCESO DENEGADO. Intento de inyección no autorizado." });
    }
}

// CUALQUIERA PUEDE VER: Endpoint público para descargar el catálogo
app.get('/api/data', (req, res) => {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    res.json(data);
});

// SOLO USTED PUEDE SUBIR: Inyección protegida por contraseña
app.post('/api/upload', requireAdminAuth, (req, res) => {
    const { title, type, content, fileName, fileData, coverData, mimeType } = req.body;
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    
    const id = Date.now();
    let fileUrl = '';
    let coverUrl = coverData || '';

    if (fileData && fileName) {
        const base64Content = fileData.split(';base64,').pop();
        const safeFileName = `${id}_${fileName.replace(/\s+/g, '_')}`;
        const filePath = path.join(UPLOADS_DIR, safeFileName);
        fs.writeFileSync(filePath, base64Content, { encoding: 'base64' });
        fileUrl = `/uploads/${safeFileName}`;
    }

    const newItem = { id, title, type, content, mimeType, fileUrl, cover: coverUrl };
    data.elements.push(newItem);
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    
    res.json({ success: true, item: newItem });
});

// SOLO USTED PUEDE ELIMINAR
app.delete('/api/element/:id', requireAdminAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const item = data.elements.find(e => e.id === id);
    
    if (item && item.fileUrl) {
        const filePath = path.join(__dirname, item.fileUrl);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    
    data.elements = data.elements.filter(e => e.id !== id);
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    res.json({ success: true });
});

// GESTIÓN DE DIRECTIVAS PROTEGIDAS
app.post('/api/objectives', requireAdminAuth, (req, res) => {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    data.objectives = req.body.objectives;
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    res.json({ success: true });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`J.A.R.V.I.S. Online a nivel global en puerto ${PORT}`);
});