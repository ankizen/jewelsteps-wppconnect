# JewelSteps WPPConnect Server

Production-ready WhatsApp integration server for JewelSteps CRM using WPPConnect.

## 📁 Project Structure

```
wppconnect-server/
├── index.js              # Main server file
├── package.json          # Node.js dependencies
├── Dockerfile            # Production Docker configuration
├── .env.example          # Environment variables template
├── .gitignore           # Git ignore rules
├── session/             # WhatsApp session storage (auto-created)
└── README.md            # This file
```

## 🚀 Quick Start

### 1. Environment Variables

Create a `.env` file (or set in Coolify) with:

```env
PORT=3000
SESSION_NAME=jewelsteps-session
SYNC_KEY=your-secret-sync-key-change-this-in-production
CRM_WEBHOOK=https://crm.jewelsteps.com/api/whatsapp/sync.php
NODE_ENV=production
CHROME_PATH=/usr/bin/google-chrome-stable
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Run Server

```bash
npm start
```

### 4. Scan QR Code

- Check server logs for QR code
- Open WhatsApp on your phone
- Go to Settings → Linked Devices
- Tap "Link a Device"
- Scan the QR code from logs

## 🐳 Docker Deployment (Coolify)

### Single Dockerfile Deployment

This project uses a **single Dockerfile** (no docker-compose required).

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-repo-url>
   git push -u origin main
   ```

2. **Deploy on Coolify**
   - Create new application
   - Connect GitHub repository
   - Select "Dockerfile" as build method
   - Set Dockerfile path: `./Dockerfile`
   - Set build context: `./`
   - Set port: `3000`

3. **Set Environment Variables in Coolify**
   - Go to application → Environment Variables
   - Add all variables from `.env.example`
   - **IMPORTANT**: Set `SYNC_KEY` to match CRM database

4. **Configure Volume for Session Persistence**
   - Go to Volumes section
   - Add volume: `./session:/app/session`
   - This ensures WhatsApp session persists across restarts

5. **Deploy**
   - Click "Deploy"
   - Wait for build to complete
   - Check logs for QR code

## 📡 API Endpoints

### POST /send-message
Send WhatsApp message from CRM.

**Request:**
```json
{
  "key": "your-sync-key",
  "phone": "919999999999",
  "message": "Hello from CRM"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Message sent successfully",
  "phone": "919999999999"
}
```

### GET /status
Get WhatsApp connection status.

**Response:**
```json
{
  "connected": true,
  "session": "jewelsteps-session",
  "reconnectAttempts": 0,
  "timestamp": "2025-01-10T12:00:00.000Z",
  "chromePath": "/usr/bin/google-chrome-stable",
  "crmWebhook": "https://crm.jewelsteps.com/api/whatsapp/sync.php"
}
```

### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "connected": true,
  "timestamp": "2025-01-10T12:00:00.000Z",
  "uptime": 3600
}
```

### GET /qr
Get QR code information.

**Response:**
```json
{
  "message": "QR code is displayed in server logs...",
  "session": "jewelsteps-session",
  "connected": false
}
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Server port | `3000` | No |
| `SESSION_NAME` | WhatsApp session name | `jewelsteps-session` | No |
| `SYNC_KEY` | Sync key (must match CRM) | - | **Yes** |
| `CRM_WEBHOOK` | CRM webhook URL | - | **Yes** |
| `NODE_ENV` | Node environment | `production` | No |
| `CHROME_PATH` | Chrome executable path | `/usr/bin/google-chrome-stable` | No |

### SYNC_KEY Setup

1. Generate a strong random string (e.g., `openssl rand -hex 32`)
2. Set in WPPConnect server environment variables
3. Set in CRM database `settings` table:
   ```sql
   UPDATE settings SET setting_value = 'your-sync-key' WHERE setting_key = 'sync_key';
   ```
4. **Both must match exactly** (case-sensitive)

## 🔄 How It Works

### Incoming Messages Flow
1. User sends WhatsApp message
2. WPPConnect receives message
3. Server extracts phone, message, timestamp
4. Server POSTs to CRM webhook (`/api/whatsapp/sync.php`)
5. CRM validates sync_key
6. CRM creates/finds contact
7. CRM saves message to database

### Outgoing Messages Flow
1. CRM calls `send_whatsapp_message()` function
2. CRM POSTs to WPPConnect `/send-message`
3. WPPConnect validates sync_key
4. WPPConnect sends via WhatsApp
5. Message appears in WhatsApp

## 🛠️ Features

- ✅ Full WPPConnect integration
- ✅ QR code authentication
- ✅ Auto-reconnect on disconnect
- ✅ Session persistence
- ✅ Incoming message forwarding
- ✅ Outgoing message sending
- ✅ Health checks
- ✅ Error handling
- ✅ Production-ready Dockerfile
- ✅ Coolify deployment ready

## 📝 Logs

The server logs important events:

- 🚀 Server startup
- 📱 QR code generation
- ✅ Connection status
- 📨 Incoming messages
- ✅ Outgoing messages
- ❌ Errors and warnings

Check Coolify logs or server console for all output.

## 🔒 Security

- Sync key validation on all requests
- Input sanitization
- Error message sanitization
- Secure session storage
- Environment variable protection

## 🐛 Troubleshooting

### QR Code Not Showing
- Check server logs in Coolify
- Verify Chrome is installed correctly
- Check `CHROME_PATH` environment variable

### Messages Not Sending
- Verify WhatsApp is connected (`GET /status`)
- Check sync_key matches CRM
- Verify phone number format (country code, no +)

### Messages Not Reaching CRM
- Check `CRM_WEBHOOK` URL is correct
- Verify CRM webhook endpoint is accessible
- Check CRM logs for errors
- Verify sync_key matches

### Connection Issues
- Check Chrome installation
- Verify session folder permissions
- Check network connectivity
- Review server logs for errors

## 📦 Dependencies

- `@wppconnect-team/wppconnect` - WhatsApp Web API
- `express` - Web server
- `axios` - HTTP client
- `dotenv` - Environment variables

## 🔄 Updates

To update dependencies:

```bash
npm update
```

Test thoroughly before deploying to production.

## 📄 License

ISC License - JewelSteps CRM Integration

---

**Ready for Production Deployment on Coolify** 🚀

