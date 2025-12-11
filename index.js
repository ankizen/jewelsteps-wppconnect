/**
 * JewelSteps WPPConnect Server
 * WhatsApp integration server for CRM
 */

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const wppconnect = require('@wppconnect-team/wppconnect');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// Environment variables
const PORT = process.env.PORT || 3000;
const SESSION_NAME = process.env.SESSION_NAME || 'jewelsteps-session';
const SYNC_KEY = process.env.SYNC_KEY || 'your-secret-sync-key-change-this-in-production';
const CRM_WEBHOOK = process.env.CRM_WEBHOOK || 'https://crm.jewelsteps.com/api/whatsapp/sync.php';
const NODE_ENV = process.env.NODE_ENV || 'production';

// Session directory
const SESSION_DIR = path.join(__dirname, 'session');
if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
}

let client = null;
let isConnected = false;

// Initialize WPPConnect
async function initializeWhatsApp() {
    try {
        console.log('🚀 Initializing WhatsApp session...');
        
        client = await wppconnect.create({
            session: SESSION_NAME,
            folderNameToken: SESSION_DIR,
            headless: true,
            devtools: false,
            useChrome: true,
            debug: NODE_ENV === 'development',
            logQR: true,
            browserWS: '',
            browserArgs: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ],
            puppeteerOptions: {
                executablePath: process.env.CHROME_PATH || undefined,
            },
            disableWelcome: true,
            updatesLog: true,
            autoClose: 60000,
            tokenStore: 'file',
            folderNameToken: SESSION_DIR,
        });

        console.log('✅ WhatsApp session created');

        // Event: QR Code
        client.onQRCode((qrCode) => {
            console.log('📱 QR Code generated. Scan with WhatsApp:');
            console.log(qrCode);
        });

        // Event: Status Find
        client.onStateChange((state) => {
            console.log('📊 State changed:', state);
            if (state === 'CONNECTED') {
                isConnected = true;
                console.log('✅ WhatsApp connected successfully!');
            } else if (state === 'DISCONNECTED') {
                isConnected = false;
                console.log('❌ WhatsApp disconnected');
            }
        });

        // Event: Message Received
        client.onMessage(async (message) => {
            try {
                // Ignore group messages and status messages
                if (message.isGroupMsg || message.from === 'status@broadcast') {
                    return;
                }

                // Extract phone number (remove @c.us)
                let phone = message.from.replace('@c.us', '');
                
                // Extract message text
                let messageText = '';
                if (message.body) {
                    messageText = message.body;
                } else if (message.caption) {
                    messageText = message.caption;
                } else if (message.type === 'ptt' || message.type === 'audio') {
                    messageText = '[Audio Message]';
                } else if (message.type === 'image' || message.type === 'video') {
                    messageText = message.caption || '[Media Message]';
                } else {
                    messageText = '[Unsupported Message Type]';
                }

                // Extract timestamp
                const timestamp = message.timestamp 
                    ? new Date(message.timestamp * 1000).toISOString().slice(0, 19).replace('T', ' ')
                    : new Date().toISOString().slice(0, 19).replace('T', ' ');

                console.log(`📨 Message received from ${phone}: ${messageText.substring(0, 50)}...`);

                // Send to CRM webhook
                await sendToCRM({
                    sync_key: SYNC_KEY,
                    phone: phone,
                    message: messageText,
                    sender: 'customer',
                    timestamp: timestamp
                });

            } catch (error) {
                console.error('❌ Error processing message:', error);
            }
        });

        // Event: Connection Error
        client.onStreamChange((stream) => {
            console.log('📡 Stream changed:', stream);
        });

        // Keep session alive
        setInterval(async () => {
            if (client && isConnected) {
                try {
                    await client.checkConnection();
                } catch (error) {
                    console.error('❌ Connection check failed:', error);
                    isConnected = false;
                }
            }
        }, 30000); // Check every 30 seconds

    } catch (error) {
        console.error('❌ Error initializing WhatsApp:', error);
        
        // Retry after 10 seconds
        setTimeout(() => {
            console.log('🔄 Retrying WhatsApp connection...');
            initializeWhatsApp();
        }, 10000);
    }
}

// Function to send message to CRM webhook
async function sendToCRM(data) {
    try {
        const response = await axios.post(CRM_WEBHOOK, data, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });

        if (response.status === 200) {
            console.log('✅ Message sent to CRM successfully');
            return true;
        } else {
            console.error('❌ Failed to send message to CRM. Status:', response.status);
            return false;
        }
    } catch (error) {
        console.error('❌ Error sending message to CRM:', error.message);
        return false;
    }
}

// API Route: Send Message
app.post('/send-message', async (req, res) => {
    try {
        const { key, phone, message } = req.body;

        // Validate sync key
        if (!key || key !== SYNC_KEY) {
            return res.status(401).json({ 
                ok: false, 
                error: 'Invalid sync key' 
            });
        }

        // Validate required fields
        if (!phone || !message) {
            return res.status(400).json({ 
                ok: false, 
                error: 'Phone and message are required' 
            });
        }

        // Check if client is connected
        if (!client || !isConnected) {
            return res.status(503).json({ 
                ok: false, 
                error: 'WhatsApp not connected. Please scan QR code first.' 
            });
        }

        // Format phone number (ensure it has country code, no + or spaces)
        let formattedPhone = phone.replace(/[^0-9]/g, '');
        
        // Add @c.us suffix
        const chatId = `${formattedPhone}@c.us`;

        // Send message via WPPConnect
        await client.sendText(chatId, message);

        console.log(`✅ Message sent to ${formattedPhone}`);

        res.json({ 
            ok: true,
            message: 'Message sent successfully'
        });

    } catch (error) {
        console.error('❌ Error sending message:', error);
        res.status(500).json({ 
            ok: false, 
            error: error.message || 'Failed to send message' 
        });
    }
});

// API Route: Get Connection Status
app.get('/status', (req, res) => {
    res.json({
        connected: isConnected,
        session: SESSION_NAME,
        timestamp: new Date().toISOString()
    });
});

// API Route: Get QR Code (if available)
app.get('/qr', async (req, res) => {
    try {
        // This is a simple endpoint - QR code is logged to console
        // In production, you might want to store QR code and serve it via this endpoint
        res.json({
            message: 'QR code is displayed in server logs. Check your server console or logs.',
            session: SESSION_NAME
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        connected: isConnected,
        timestamp: new Date().toISOString()
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        name: 'JewelSteps WPPConnect Server',
        version: '1.0.0',
        status: isConnected ? 'connected' : 'disconnected',
        endpoints: {
            'POST /send-message': 'Send WhatsApp message',
            'GET /status': 'Get connection status',
            'GET /health': 'Health check'
        }
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 WPPConnect Server running on port ${PORT}`);
    console.log(`📋 Session: ${SESSION_NAME}`);
    console.log(`🔗 CRM Webhook: ${CRM_WEBHOOK}`);
    console.log(`🌍 Environment: ${NODE_ENV}`);
    console.log('');
    
    // Initialize WhatsApp connection
    initializeWhatsApp();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('🛑 Shutting down gracefully...');
    if (client) {
        try {
            await client.close();
        } catch (error) {
            console.error('Error closing client:', error);
        }
    }
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('🛑 Shutting down gracefully...');
    if (client) {
        try {
            await client.close();
        } catch (error) {
            console.error('Error closing client:', error);
        }
    }
    process.exit(0);
});

