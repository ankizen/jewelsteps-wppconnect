/**
 * JewelSteps WPPConnect Server
 * Production-ready WhatsApp integration server for CRM
 * 
 * This server handles:
 * - WhatsApp session management via WPPConnect
 * - Incoming message forwarding to CRM webhook
 * - Outgoing message sending from CRM
 * - Auto-reconnect and session persistence
 */

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const wppconnect = require('@wppconnect-team/wppconnect');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// ============================================
// ENVIRONMENT VARIABLES (from process.env)
// ============================================
const PORT = process.env.PORT || 3000;
const SESSION_NAME = process.env.SESSION_NAME || 'jewelsteps-session';
const SYNC_KEY = process.env.SYNC_KEY || '';
const CRM_WEBHOOK = process.env.CRM_WEBHOOK || 'https://crm.jewelsteps.com/api/whatsapp/sync.php';
const NODE_ENV = process.env.NODE_ENV || 'production';
const CHROME_PATH = process.env.CHROME_PATH || '/usr/bin/google-chrome-stable';

// Validate required environment variables
if (!SYNC_KEY || SYNC_KEY === 'your-secret-sync-key-change-this-in-production') {
    console.warn('⚠️  WARNING: SYNC_KEY not set or using default value. Please set a secure SYNC_KEY in environment variables.');
}

if (!CRM_WEBHOOK || CRM_WEBHOOK.includes('jewelsteps.com')) {
    console.warn('⚠️  WARNING: CRM_WEBHOOK may not be configured correctly. Please verify the webhook URL.');
}

// ============================================
// SESSION DIRECTORY SETUP
// ============================================
const SESSION_DIR = path.join(__dirname, 'session');
if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
    console.log('📁 Created session directory:', SESSION_DIR);
}

// ============================================
// GLOBAL STATE
// ============================================
let client = null;
let isConnected = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

// ============================================
// WPPCONNECT INITIALIZATION
// ============================================
async function initializeWhatsApp() {
    try {
        console.log('🚀 Initializing WhatsApp session...');
        console.log(`📋 Session Name: ${SESSION_NAME}`);
        console.log(`📁 Session Directory: ${SESSION_DIR}`);
        console.log(`🌐 Chrome Path: ${CHROME_PATH}`);
        
        // Check if Chrome exists
        if (!fs.existsSync(CHROME_PATH)) {
            console.error(`❌ Chrome not found at: ${CHROME_PATH}`);
            console.error('Please verify CHROME_PATH environment variable.');
            return;
        }
        
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
                '--disable-gpu',
                '--disable-software-rasterizer',
                '--disable-extensions',
                '--disable-background-networking',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-breakpad',
                '--disable-client-side-phishing-detection',
                '--disable-default-apps',
                '--disable-features=TranslateUI',
                '--disable-hang-monitor',
                '--disable-ipc-flooding-protection',
                '--disable-popup-blocking',
                '--disable-prompt-on-repost',
                '--disable-renderer-backgrounding',
                '--disable-sync',
                '--disable-translate',
                '--metrics-recording-only',
                '--mute-audio',
                '--no-default-browser-check',
                '--no-pings',
                '--use-fake-ui-for-media-stream',
                '--use-fake-device-for-media-stream'
            ],
            puppeteerOptions: {
                executablePath: CHROME_PATH,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage'
                ]
            },
            disableWelcome: true,
            updatesLog: true,
            autoClose: 60000,
            tokenStore: 'file',
            folderNameToken: SESSION_DIR,
        });

        console.log('✅ WhatsApp session created successfully');

        // ============================================
        // EVENT HANDLERS
        // ============================================

        // QR Code Event
        client.onQRCode((qrCode) => {
            console.log('');
            console.log('═══════════════════════════════════════════════════════');
            console.log('📱 QR CODE GENERATED - SCAN WITH WHATSAPP');
            console.log('═══════════════════════════════════════════════════════');
            console.log(qrCode);
            console.log('═══════════════════════════════════════════════════════');
            console.log('');
            reconnectAttempts = 0; // Reset on QR code generation
        });

        // State Change Event
        client.onStateChange((state) => {
            console.log(`📊 WhatsApp State Changed: ${state}`);
            
            if (state === 'CONNECTED') {
                isConnected = true;
                reconnectAttempts = 0;
                console.log('✅ WhatsApp connected successfully!');
                console.log(`📱 Session: ${SESSION_NAME}`);
            } else if (state === 'DISCONNECTED') {
                isConnected = false;
                console.log('❌ WhatsApp disconnected');
                
                // Auto-reconnect logic
                if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                    reconnectAttempts++;
                    const delay = Math.min(reconnectAttempts * 5000, 30000); // Max 30 seconds
                    console.log(`🔄 Attempting to reconnect in ${delay/1000} seconds... (Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
                    setTimeout(() => {
                        initializeWhatsApp();
                    }, delay);
                } else {
                    console.error('❌ Max reconnection attempts reached. Please restart the server.');
                }
            } else if (state === 'CONFLICT') {
                console.log('⚠️  WhatsApp session conflict detected. Please scan QR code again.');
            } else if (state === 'UNPAIRED') {
                console.log('⚠️  WhatsApp session unpaired. Please scan QR code again.');
            }
        });

        // Message Received Event
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
                } else if (message.type === 'document') {
                    messageText = message.caption || `[Document: ${message.filename || 'File'}]`;
                } else if (message.type === 'location') {
                    messageText = `[Location: ${message.lat}, ${message.lng}]`;
                } else {
                    messageText = `[${message.type || 'Unsupported'} Message]`;
                }

                // Extract timestamp
                const timestamp = message.timestamp 
                    ? new Date(message.timestamp * 1000).toISOString().slice(0, 19).replace('T', ' ')
                    : new Date().toISOString().slice(0, 19).replace('T', ' ');

                console.log(`📨 Message received from ${phone}: ${messageText.substring(0, 50)}${messageText.length > 50 ? '...' : ''}`);

                // Send to CRM webhook
                const success = await sendToCRM({
                    sync_key: SYNC_KEY,
                    phone: phone,
                    message: messageText,
                    sender: 'customer',
                    timestamp: timestamp
                });

                if (!success) {
                    console.error(`❌ Failed to forward message from ${phone} to CRM`);
                }

            } catch (error) {
                console.error('❌ Error processing incoming message:', error);
            }
        });

        // Stream Change Event
        client.onStreamChange((stream) => {
            console.log(`📡 WhatsApp stream changed: ${stream}`);
        });

        // Keep session alive - connection check
        setInterval(async () => {
            if (client && isConnected) {
                try {
                    await client.checkConnection();
                } catch (error) {
                    console.error('❌ Connection check failed:', error.message);
                    isConnected = false;
                }
            }
        }, 30000); // Check every 30 seconds

    } catch (error) {
        console.error('❌ Error initializing WhatsApp:', error);
        console.error('Error details:', error.message);
        
        // Retry after delay
        reconnectAttempts++;
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            const delay = Math.min(reconnectAttempts * 5000, 30000);
            console.log(`🔄 Retrying WhatsApp connection in ${delay/1000} seconds... (Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
            setTimeout(() => {
                initializeWhatsApp();
            }, delay);
        } else {
            console.error('❌ Max initialization attempts reached. Please check your configuration and restart the server.');
        }
    }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Send message data to CRM webhook
 * @param {Object} data - Message data to send
 * @returns {Promise<boolean>} - Success status
 */
async function sendToCRM(data) {
    try {
        const response = await axios.post(CRM_WEBHOOK, data, {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'JewelSteps-WPPConnect/1.0.0'
            },
            timeout: 10000,
            validateStatus: (status) => status < 500 // Don't throw on 4xx errors
        });

        if (response.status === 200) {
            console.log('✅ Message forwarded to CRM successfully');
            return true;
        } else {
            console.error(`❌ CRM webhook returned status ${response.status}:`, response.data);
            return false;
        }
    } catch (error) {
        if (error.response) {
            console.error(`❌ CRM webhook error (${error.response.status}):`, error.response.data);
        } else if (error.request) {
            console.error('❌ No response from CRM webhook. Check CRM_WEBHOOK URL and network connectivity.');
        } else {
            console.error('❌ Error sending to CRM webhook:', error.message);
        }
        return false;
    }
}

// ============================================
// API ROUTES
// ============================================

/**
 * POST /send-message
 * Send WhatsApp message from CRM
 * Body: { key, phone, message }
 */
app.post('/send-message', async (req, res) => {
    try {
        const { key, phone, message } = req.body;

        // Validate sync key
        if (!key || key !== SYNC_KEY) {
            console.warn('⚠️  Invalid sync key attempt');
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
                error: 'WhatsApp not connected. Please scan QR code first.',
                connected: false
            });
        }

        // Format phone number (ensure it has country code, no + or spaces)
        let formattedPhone = phone.replace(/[^0-9]/g, '');
        
        if (formattedPhone.length < 10) {
            return res.status(400).json({ 
                ok: false, 
                error: 'Invalid phone number format' 
            });
        }
        
        // Add @c.us suffix
        const chatId = `${formattedPhone}@c.us`;

        // Send message via WPPConnect
        try {
            await client.sendText(chatId, message);
            console.log(`✅ Message sent to ${formattedPhone}`);
            
            res.json({ 
                ok: true,
                message: 'Message sent successfully',
                phone: formattedPhone
            });
        } catch (sendError) {
            console.error('❌ Error sending WhatsApp message:', sendError);
            res.status(500).json({ 
                ok: false, 
                error: sendError.message || 'Failed to send message via WhatsApp' 
            });
        }

    } catch (error) {
        console.error('❌ Error in /send-message endpoint:', error);
        res.status(500).json({ 
            ok: false, 
            error: error.message || 'Internal server error' 
        });
    }
});

/**
 * GET /status
 * Get WhatsApp connection status
 */
app.get('/status', (req, res) => {
    res.json({
        connected: isConnected,
        session: SESSION_NAME,
        reconnectAttempts: reconnectAttempts,
        timestamp: new Date().toISOString(),
        chromePath: CHROME_PATH,
        crmWebhook: CRM_WEBHOOK
    });
});

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok',
        connected: isConnected,
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

/**
 * GET /qr
 * Get QR code information
 */
app.get('/qr', (req, res) => {
    res.json({
        message: 'QR code is displayed in server logs. Check your server console or Coolify logs.',
        session: SESSION_NAME,
        connected: isConnected,
        instruction: 'If not connected, check the server logs for the QR code and scan it with WhatsApp.'
    });
});

/**
 * GET /
 * Root endpoint - Server information
 */
app.get('/', (req, res) => {
    res.json({
        name: 'JewelSteps WPPConnect Server',
        version: '1.0.0',
        status: isConnected ? 'connected' : 'disconnected',
        endpoints: {
            'POST /send-message': 'Send WhatsApp message',
            'GET /status': 'Get connection status',
            'GET /health': 'Health check',
            'GET /qr': 'QR code information'
        },
        session: SESSION_NAME
    });
});

// ============================================
// SERVER STARTUP
// ============================================
app.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('🚀 JewelSteps WPPConnect Server');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`📡 Server running on port ${PORT}`);
    console.log(`📋 Session Name: ${SESSION_NAME}`);
    console.log(`🔗 CRM Webhook: ${CRM_WEBHOOK}`);
    console.log(`🌍 Environment: ${NODE_ENV}`);
    console.log(`🌐 Chrome Path: ${CHROME_PATH}`);
    console.log(`📁 Session Directory: ${SESSION_DIR}`);
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
    
    // Initialize WhatsApp connection
    initializeWhatsApp();
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================
process.on('SIGTERM', async () => {
    console.log('🛑 Received SIGTERM. Shutting down gracefully...');
    if (client) {
        try {
            await client.close();
            console.log('✅ WhatsApp client closed');
        } catch (error) {
            console.error('❌ Error closing WhatsApp client:', error);
        }
    }
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('🛑 Received SIGINT. Shutting down gracefully...');
    if (client) {
        try {
            await client.close();
            console.log('✅ WhatsApp client closed');
        } catch (error) {
            console.error('❌ Error closing WhatsApp client:', error);
        }
    }
    process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    // Don't exit - let the process continue and attempt recovery
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit - let the process continue and attempt recovery
});
