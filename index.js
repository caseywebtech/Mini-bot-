const express = require('express');
const app = express();
const __path = process.cwd();
const bodyParser = require("body-parser");
const PORT = process.env.PORT || 8000;

// ===== CRITICAL: Add these at the VERY TOP =====
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ [CRASH PREVENTION] Unhandled Rejection at:', promise, 'reason:', reason);
    // Log to file for debugging
    const fs = require('fs');
    fs.appendFileSync(__path + '/crashes.log', 
        `[${new Date().toISOString()}] Unhandled Rejection: ${reason}\n${reason.stack || ''}\n\n`);
});

process.on('uncaughtException', (error) => {
    console.error('⚠️ [CRASH PREVENTION] Uncaught Exception:', error);
    const fs = require('fs');
    fs.appendFileSync(__path + '/crashes.log', 
        `[${new Date().toISOString()}] Uncaught Exception: ${error.message}\n${error.stack}\n\n`);
    // Graceful shutdown after 5 seconds
    setTimeout(() => process.exit(1), 5000);
});

// Increase event listeners safely
require('events').EventEmitter.defaultMaxListeners = 100;

// ===== IMPORT WITH ERROR HANDLING =====
let code;
try {
    code = require('./pair');
} catch (error) {
    console.error('❌ Failed to load ./pair module:', error.message);
    console.log('⚠️ Continuing without /code endpoint');
}

// ===== MIDDLEWARE SETUP =====
app.use(bodyParser.json({ 
    limit: '10mb', // Prevent large payload crashes
    verify: (req, res, buf) => {
        // Safety check for JSON parsing
        try {
            JSON.parse(buf.toString());
        } catch(e) {
            console.error('Malformed JSON detected');
            res.status(400).json({ error: 'Invalid JSON' });
        }
    }
}));

app.use(bodyParser.urlencoded({ 
    extended: true, 
    limit: '10mb',
    parameterLimit: 10000 // Prevent too many parameters
}));

// ===== ROUTES WITH ERROR HANDLING =====
if (code) {
    app.use('/code', code);
}

app.use('/pair', (req, res, next) => {
    try {
        res.sendFile(__path + '/pair.html', (err) => {
            if (err) {
                console.error('Error sending pair.html:', err);
                res.status(404).send('File not found');
            }
        });
    } catch (error) {
        console.error('Route /pair error:', error);
        res.status(500).send('Server error');
    }
});

app.use('/', (req, res, next) => {
    try {
        res.sendFile(__path + '/main.html', (err) => {
            if (err) {
                console.error('Error sending main.html:', err);
                res.status(404).send('File not found');
            }
        });
    } catch (error) {
        console.error('Route / error:', error);
        res.status(500).send('Server error');
    }
});

// ===== HEALTH CHECK ENDPOINT =====
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
    });
});

// ===== 404 HANDLER =====
app.use((req, res) => {
    res.status(404).send('Not Found');
});

// ===== ERROR HANDLER MIDDLEWARE =====
app.use((error, req, res, next) => {
    console.error('Express Error Handler:', error);
    res.status(500).json({ 
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
});

// ===== GRACEFUL SHUTDOWN =====
function gracefulShutdown(signal) {
    console.log(`\n⚠️ Received ${signal}, shutting down gracefully...`);
    
    // Close server
    server.close(() => {
        console.log('✅ HTTP server closed');
        process.exit(0);
    });
    
    // Force shutdown after 10 seconds
    setTimeout(() => {
        console.error('⏰ Could not close connections in time, forcing shutdown');
        process.exit(1);
    }, 10000);
}

// ===== START SERVER =====
let server;
try {
    server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`
 ██████╗ █████╗ ███████╗███████╗██╗   ██╗██████╗ ██╗  ██╗ ██████╗ ██████╗ ███████╗███████╗
██╔════╝██╔══██╗██╔════╝██╔════╝╚██╗ ██╔╝██╔══██╗██║  ██║██╔═══██╗██╔══██╗██╔════╝██╔════╝
██║     ███████║███████╗█████╗   ╚████╔╝ ██████╔╝███████║██║   ██║██║  ██║███████╗███████╗
██║     ██╔══██║╚════██║██╔══╝    ╚██╔╝  ██╔══██╗██╔══██║██║   ██║██║  ██║╚════██║╚════██║
╚██████╗██║  ██║███████║███████╗   ██║   ██████╔╝██║  ██║╚██████╔╝██████╔╝███████║███████║
 ╚═════╝╚═╝  ╚═╝╚══════╝╚══════╝   ╚═╝   ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝╚══════╝

🌐 Server running on http://0.0.0.0:${PORT}
📊 Health check: http://0.0.0.0:${PORT}/health
⏰ Uptime: ${new Date().toLocaleString()}

Don't Forget To Give Star ‼️
Made By Caseyrhodes 
`);
    });
    
    // Handle server errors
    server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
            console.error(`❌ Port ${PORT} is already in use`);
            console.log('💡 Try:');
            console.log(`  1. Change PORT environment variable`);
            console.log(`  2. Kill process using port ${PORT}: "sudo lsof -ti:${PORT} | xargs kill -9"`);
            process.exit(1);
        } else {
            console.error('❌ Server error:', error);
        }
    });
    
    // Graceful shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
    // Memory monitoring
    setInterval(() => {
        const memory = process.memoryUsage();
        const usedMB = Math.round(memory.heapUsed / 1024 / 1024);
        const totalMB = Math.round(memory.heapTotal / 1024 / 1024);
        
        if (usedMB > 500) { // Warning at 500MB
            console.warn(`⚠️ High memory usage: ${usedMB}MB / ${totalMB}MB`);
        }
        
        if (usedMB > 800) { // Critical at 800MB
            console.error('🚨 Critical memory usage, consider restarting');
        }
    }, 60000); // Check every minute
    
} catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
}

module.exports = { app, server };
