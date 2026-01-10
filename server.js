// ============================================================================
// KRP ACADEMY - WHATSAPP SERVER (FIXED)
// File: server.js
// ============================================================================

const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const puppeteer = require('puppeteer');
const qrcode = require('qrcode');
const cors = require('cors');
const bodyParser = require('body-parser');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// WhatsApp Client
let client;
let qrCodeData = '';
let isReady = false;

// Google Apps Script URL (Update this after deploying your script)
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw0Oh6ds0OaYon7I8G5n58Fjv-eTki2SzQKvJE6chMVGtbQtCYLhi-G5PlASfNQui0/exec';

// ============================================================================
// INITIALIZE WHATSAPP CLIENT
// ============================================================================

function initializeWhatsApp() {
  console.log('🚀 Initializing WhatsApp client...');

client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    executablePath: puppeteer.executablePath(), // use Puppeteer's own Chromium
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
      '--single-process',
      '--no-zygote',
      '--window-size=800,600'
    ]
  }
});


  // QR Code Event
  client.on('qr', async (qr) => {
    console.log('📱 QR Code received, generating image...');
    try {
      qrCodeData = await qrcode.toDataURL(qr);
      console.log('✅ QR Code generated successfully');
      console.log('📲 Scan this QR code with WhatsApp to connect');
    } catch (err) {
      console.error('❌ Error generating QR code:', err);
    }
  });

  // Ready Event
  client.on('ready', () => {
    console.log('✅ WhatsApp client is ready!');
    console.log('📱 Client connected successfully');
    isReady = true;
    qrCodeData = '';
  });

  // Authenticated Event
  client.on('authenticated', () => {
    console.log('✅ WhatsApp authenticated');
  });

  // Authentication Failure
  client.on('auth_failure', (msg) => {
    console.error('❌ Authentication failed:', msg);
    isReady = false;
  });

  // Message Event
  client.on('message', async (message) => {
    console.log('📨 Message received from:', message.from);
    console.log('💬 Message:', message.body);
    await handleIncomingMessage(message);
  });

  // Disconnected Event
  client.on('disconnected', (reason) => {
    console.log('❌ WhatsApp disconnected:', reason);
    isReady = false;
    qrCodeData = '';
  });

  // Initialize
  client.initialize();
}

// ============================================================================
// MESSAGE HANDLING
// ============================================================================

async function handleIncomingMessage(message) {
  try {
    const phoneNumber = message.from.replace('@c.us', '');
    const text = message.body.trim();

    console.log('📞 Processing message from:', phoneNumber);

    // Send to Google Apps Script for processing
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'processMessage',
        from: phoneNumber,
        message: text
      })
    });

    const result = await response.json();
    
    if (result.reply) {
      console.log('✅ Sending reply:', result.reply);
      await message.reply(result.reply);
    } else {
      console.log('ℹ️  No reply needed');
    }
  } catch (error) {
    console.error('❌ Error handling message:', error);
  }
}

// ============================================================================
// API ROUTES
// ============================================================================

// Home route
app.get('/', (req, res) => {
  res.send(`
    <h2>🎓 KRP WhatsApp Automation Server</h2>
    <p>Server is running on port ${PORT}</p>
    <ul>
      <li><a href="/health">/health</a> - Health Check</li>
      <li><a href="/status">/status</a> - WhatsApp Connection Status</li>
      <li><a href="/qr">/qr</a> - Get QR Code (JSON)</li>
      <li><a href="/connect">/connect</a> - View WhatsApp QR Code</li>
    </ul>
  `);
});

// Health Check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    whatsapp: isReady,
    timestamp: new Date().toISOString()
  });
});

// Check WhatsApp Status
app.get('/status', (req, res) => {
  res.json({ 
    connected: isReady,
    qrAvailable: !!qrCodeData,
    timestamp: new Date().toISOString()
  });
});

// **NEW** Get QR Code Data (JSON) - This is what the dashboard needs
app.get('/qr', (req, res) => {
  if (isReady) {
    res.json({
      connected: true,
      qrCode: null,
      message: 'WhatsApp is already connected'
    });
  } else if (qrCodeData) {
    res.json({
      connected: false,
      qrCode: qrCodeData,
      message: 'Scan this QR code to connect'
    });
  } else {
    res.json({
      connected: false,
      qrCode: null,
      message: 'Generating QR code... Please wait.'
    });
  }
});

// Display QR Code in browser
app.get('/connect', (req, res) => {
  if (isReady) {
    res.send(`
      <h3>✅ WhatsApp already connected!</h3>
      <p>Your WhatsApp client is active.</p>
      <a href="/">Back to home</a>
    `);
  } else if (qrCodeData) {
    res.send(`
      <h2>📲 Scan this QR Code to connect WhatsApp</h2>
      <img src="${qrCodeData}" width="300" />
      <p>Open WhatsApp → Linked Devices → Scan this QR</p>
      <script>
        // Auto refresh every 2 seconds if not connected
        setTimeout(() => location.reload(), 2000);
      </script>
    `);
  } else {
    res.send(`
      <h3>⏳ Generating QR code... Please wait and refresh.</h3>
      <script>
        setTimeout(() => location.reload(), 2000);
      </script>
    `);
  }
});

// Send Message
app.post('/send', async (req, res) => {
  const { phone, message } = req.body;

  if (!isReady) {
    return res.status(400).json({ 
      success: false,
      error: 'WhatsApp is not connected. Please scan QR code first.' 
    });
  }

  if (!phone || !message) {
    return res.status(400).json({ 
      success: false,
      error: 'Phone and message are required' 
    });
  }

  try {
    let phoneNumber = phone.replace(/[^0-9]/g, '');
    if (!phoneNumber.startsWith('91') && phoneNumber.length === 10) {
      phoneNumber = '91' + phoneNumber;
    }
    
    const chatId = phoneNumber + '@c.us';
    console.log(`📤 Sending message to: ${chatId}`);
    await client.sendMessage(chatId, message);
    
    res.json({ 
      success: true,
      message: 'Message sent successfully',
      to: chatId
    });
  } catch (error) {
    console.error('❌ Error sending message:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Send Bulk Messages
app.post('/send-bulk', async (req, res) => {
  const { recipients, message } = req.body;

  if (!isReady) {
    return res.status(400).json({ 
      success: false,
      error: 'WhatsApp is not connected' 
    });
  }

  if (!recipients || !Array.isArray(recipients) || !message) {
    return res.status(400).json({ 
      success: false,
      error: 'Recipients array and message are required' 
    });
  }

  const results = [];
  
  for (const phone of recipients) {
    try {
      let phoneNumber = phone.replace(/[^0-9]/g, '');
      if (!phoneNumber.startsWith('91') && phoneNumber.length === 10) {
        phoneNumber = '91' + phoneNumber;
      }
      
      const chatId = phoneNumber + '@c.us';
      await client.sendMessage(chatId, message);
      
      results.push({ phone, success: true });
      console.log(`✅ Sent to: ${phone}`);
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`❌ Failed to send to ${phone}:`, error.message);
      results.push({ phone, success: false, error: error.message });
    }
  }

  res.json({ 
    success: true,
    results: results,
    sent: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length
  });
});

// Logout/Disconnect
app.post('/logout', async (req, res) => {
  try {
    await client.logout();
    isReady = false;
    qrCodeData = '';
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get Client Info
app.get('/info', async (req, res) => {
  if (!isReady) {
    return res.status(400).json({ 
      success: false,
      error: 'WhatsApp is not connected' 
    });
  }

  try {
    const info = await client.info;
    res.json({ 
      success: true,
      info: {
        pushname: info.pushname,
        wid: info.wid._serialized,
        platform: info.platform
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(500).json({ 
    success: false,
    error: 'Internal server error',
    message: err.message 
  });
});

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║   🎓 KRP ACADEMY - WHATSAPP SERVER            ║');
  console.log('╚════════════════════════════════════════════════╝');
  console.log('');
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log('📱 Initializing WhatsApp...');
  console.log('');
  console.log('⚠️  IMPORTANT: Update GOOGLE_SCRIPT_URL in this file');
  console.log('    with your deployed Google Apps Script URL');
  console.log('');
  console.log('📊 Available endpoints:');
  console.log(`   GET  /              - Home`);
  console.log(`   GET  /health        - Health check`);
  console.log(`   GET  /status        - WhatsApp connection status`);
  console.log(`   GET  /qr            - Get QR code (JSON)`);
  console.log(`   GET  /connect       - View QR code in browser`);
  console.log(`   POST /send          - Send single message`);
  console.log(`   POST /send-bulk     - Send bulk messages`);
  console.log(`   GET  /info          - Get client info`);
  console.log(`   POST /logout        - Disconnect WhatsApp`);
  console.log('');
  
  initializeWhatsApp();
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  if (client) {
    await client.destroy();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  if (client) {
    await client.destroy();
  }
  process.exit(0);
});






// ============================================================================
// KRP ACADEMY - WHATSAPP SERVER
// File: server.js
// ============================================================================

// ============================================================================
// KRP ACADEMY - WHATSAPP SERVER
// File: server.js
// ============================================================================

// ============================================================================
// KRP ACADEMY - WHATSAPP SERVER
// File: server.js
// ============================================================================

// ============================================================================
// KRP ACADEMY - WHATSAPP SERVER
// File: server.js
// ============================================================================

// const express = require('express');
// const { Client, LocalAuth } = require('whatsapp-web.js');
// const puppeteer = require('puppeteer');
// const qrcode = require('qrcode');
// const cors = require('cors');
// const bodyParser = require('body-parser');
// const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// const app = express();
// const PORT = process.env.PORT || 5000;

// // Middleware
// app.use(cors());
// app.use(bodyParser.json());

// // WhatsApp Client
// let client;
// let qrCodeData = '';
// let isReady = false;

// // Google Apps Script URL (Update this after deploying your script)
// const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzEfiWEv01wfqFyuS1T7d4lhcNnbAx2UV4KE1mr48a6G4SKuiTVhG3R8aZfjKUnFm5rtQ/exec';

// // ============================================================================
// // SEND QR CODE TO GOOGLE APPS SCRIPT
// // ============================================================================

// async function sendQRToGoogleScript(qrData) {
//   try {
//     console.log('📤 Sending QR code to Google Apps Script...');
    
//     const response = await fetch(GOOGLE_SCRIPT_URL, {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//       },
//       body: JSON.stringify({
//         action: 'updateQR',
//         qrCode: qrData,
//         timestamp: new Date().toISOString()
//       })
//     });

//     const result = await response.json();
//     console.log('✅ QR code sent to Google Apps Script:', result);
//   } catch (error) {
//     console.error('❌ Error sending QR to Google Script:', error.message);
//   }
// }

// // ============================================================================
// // SEND CONNECTION STATUS TO GOOGLE APPS SCRIPT
// // ============================================================================

// async function sendStatusToGoogleScript(status, message) {
//   try {
//     console.log(`📤 Sending status to Google Apps Script: ${status}`);
    
//     const response = await fetch(GOOGLE_SCRIPT_URL, {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//       },
//       body: JSON.stringify({
//         action: 'updateStatus',
//         status: status,
//         message: message,
//         timestamp: new Date().toISOString()
//       })
//     });

//     const result = await response.json();
//     console.log('✅ Status sent to Google Apps Script');
//   } catch (error) {
//     console.error('❌ Error sending status to Google Script:', error.message);
//   }
// }

// // ============================================================================
// // INITIALIZE WHATSAPP CLIENT
// // ============================================================================

// function initializeWhatsApp() {
//   console.log('🚀 Initializing WhatsApp client...');
  
//   client = new Client({
//     authStrategy: new LocalAuth({
//       clientId: "client-one"
//     }),
//     puppeteer: {
//       headless: true,
//       args: [
//         '--no-sandbox',
//         '--disable-setuid-sandbox',
//         '--disable-dev-shm-usage',
//         '--disable-accelerated-2d-canvas',
//         '--no-first-run',
//         '--no-zygote',
//         '--single-process',
//         '--disable-gpu'
//       ]
//     },
//     webVersion: '2.2412.54',
//     webVersionCache: {
//       type: 'none'
//     }
//   });

//   // QR Code Event - NOW SENDS TO GOOGLE SCRIPT!
//   client.on('qr', async (qr) => {
//     console.log('📱 QR Code received, generating image...');
//     try {
//       qrCodeData = await qrcode.toDataURL(qr);
//       console.log('✅ QR Code generated successfully');
//       console.log('📲 Scan this QR code with WhatsApp to connect');
      
//       // ✅ SEND QR CODE TO GOOGLE APPS SCRIPT
//       await sendQRToGoogleScript(qrCodeData);
      
//     } catch (err) {
//       console.error('❌ Error generating QR code:', err);
//     }
//   });

//   // Ready Event
//   client.on('ready', async () => {
//     console.log('✅ WhatsApp client is ready!');
//     console.log('📱 Client connected successfully');
//     isReady = true;
//     qrCodeData = '';
    
//     // ✅ SEND CONNECTED STATUS TO GOOGLE APPS SCRIPT
//     await sendStatusToGoogleScript('connected', 'WhatsApp connected successfully');
//   });

//   // Authenticated Event
//   client.on('authenticated', () => {
//     console.log('✅ WhatsApp authenticated');
//   });

//   // Authentication Failure
//   client.on('auth_failure', async (msg) => {
//     console.error('❌ Authentication failed:', msg);
//     isReady = false;
    
//     // ✅ SEND ERROR STATUS TO GOOGLE APPS SCRIPT
//     await sendStatusToGoogleScript('error', 'Authentication failed: ' + msg);
//   });

//   // Message Event
//   client.on('message', async (message) => {
//     console.log('📨 Message received from:', message.from);
//     console.log('💬 Message:', message.body);
//     await handleIncomingMessage(message);
//   });

//   // Disconnected Event - WITH AUTO-RESTART
//   client.on('disconnected', async (reason) => {
//     console.log('❌ WhatsApp disconnected:', reason);
//     isReady = false;
//     qrCodeData = '';
    
//     // ✅ SEND DISCONNECTED STATUS TO GOOGLE APPS SCRIPT
//     await sendStatusToGoogleScript('disconnected', 'Disconnected: ' + reason);
    
//     // ✅ AUTO-RESTART IF LOGOUT
//     if (reason === 'LOGOUT') {
//       console.log('🔄 Clearing session and restarting...');
//       try {
//         const fs = require('fs');
//         const path = require('path');
//         const sessionPath = path.join(__dirname, '.wwebjs_auth');
        
//         if (fs.existsSync(sessionPath)) {
//           fs.rmSync(sessionPath, { recursive: true, force: true });
//           console.log('✅ Session cleared');
//         }
        
//         // Restart the client after 3 seconds
//         setTimeout(() => {
//           console.log('🔄 Reinitializing WhatsApp client...');
//           initializeWhatsApp();
//         }, 3000);
//       } catch (error) {
//         console.error('❌ Error clearing session:', error);
//       }
//     }
//   });

//   // Initialize
//   client.initialize();
// }

// // ============================================================================
// // MESSAGE HANDLING
// // ============================================================================

// async function handleIncomingMessage(message) {
//   try {
//     const phoneNumber = message.from.replace('@c.us', '');
//     const text = message.body.trim();

//     console.log('📞 Processing message from:', phoneNumber);

//     // Send to Google Apps Script for processing
//     const response = await fetch(GOOGLE_SCRIPT_URL, {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//       },
//       body: JSON.stringify({
//         action: 'processMessage',
//         from: phoneNumber,
//         message: text
//       })
//     });

//     const result = await response.json();
    
//     if (result.reply) {
//       console.log('✅ Sending reply:', result.reply);
//       await message.reply(result.reply);
//     } else {
//       console.log('ℹ️  No reply needed');
//     }
//   } catch (error) {
//     console.error('❌ Error handling message:', error);
//   }
// }

// // ============================================================================
// // API ROUTES
// // ============================================================================

// // ✅ Home route
// app.get('/', (req, res) => {
//   res.send(`
//     <h2>🎓 KRP WhatsApp Automation Server</h2>
//     <p>Server is running on port ${PORT}</p>
//     <ul>
//       <li><a href="/health">/health</a> - Health Check</li>
//       <li><a href="/status">/status</a> - WhatsApp Connection Status</li>
//       <li><a href="/connect">/connect</a> - View WhatsApp QR Code</li>
//     </ul>
//   `);
// });

// // Health Check
// app.get('/health', (req, res) => {
//   res.json({ 
//     status: 'ok', 
//     whatsapp: isReady,
//     timestamp: new Date().toISOString()
//   });
// });

// // Check WhatsApp Status
// app.get('/status', (req, res) => {
//   res.json({ 
//     connected: isReady,
//     qrAvailable: !!qrCodeData,
//     timestamp: new Date().toISOString()
//   });
// });

// // ✅ Display QR Code in browser
// app.get('/connect', (req, res) => {
//   if (isReady) {
//     res.send(`
//       <h3>✅ WhatsApp already connected!</h3>
//       <p>Your WhatsApp client is active.</p>
//       <a href="/">Back to home</a>
//     `);
//   } else if (qrCodeData) {
//     res.send(`
//       <h2>📲 Scan this QR Code to connect WhatsApp</h2>
//       <img src="${qrCodeData}" width="300" />
//       <p>Open WhatsApp → Linked Devices → Scan this QR</p>
//       <p><small>QR code also sent to Google Apps Script dashboard</small></p>
//     `);
//   } else {
//     res.send('<h3>⏳ Generating QR code... Please wait and refresh.</h3>');
//   }
// });

// // Send Message
// app.post('/send', async (req, res) => {
//   const { phone, message } = req.body;

//   if (!isReady) {
//     return res.status(400).json({ 
//       success: false,
//       error: 'WhatsApp is not connected. Please scan QR code first.' 
//     });
//   }

//   if (!phone || !message) {
//     return res.status(400).json({ 
//       success: false,
//       error: 'Phone and message are required' 
//     });
//   }

//   try {
//     let phoneNumber = phone.replace(/[^0-9]/g, '');
//     if (!phoneNumber.startsWith('91') && phoneNumber.length === 10) {
//       phoneNumber = '91' + phoneNumber;
//     }
    
//     const chatId = phoneNumber + '@c.us';
//     console.log(`📤 Sending message to: ${chatId}`);
//     await client.sendMessage(chatId, message);
    
//     res.json({ 
//       success: true,
//       message: 'Message sent successfully',
//       to: chatId
//     });
//   } catch (error) {
//     console.error('❌ Error sending message:', error);
//     res.status(500).json({ 
//       success: false,
//       error: error.message 
//     });
//   }
// });

// // Send Bulk Messages
// app.post('/send-bulk', async (req, res) => {
//   const { recipients, message } = req.body;

//   if (!isReady) {
//     return res.status(400).json({ 
//       success: false,
//       error: 'WhatsApp is not connected' 
//     });
//   }

//   if (!recipients || !Array.isArray(recipients) || !message) {
//     return res.status(400).json({ 
//       success: false,
//       error: 'Recipients array and message are required' 
//     });
//   }

//   const results = [];
  
//   for (const phone of recipients) {
//     try {
//       let phoneNumber = phone.replace(/[^0-9]/g, '');
//       if (!phoneNumber.startsWith('91') && phoneNumber.length === 10) {
//         phoneNumber = '91' + phoneNumber;
//       }
      
//       const chatId = phoneNumber + '@c.us';
//       await client.sendMessage(chatId, message);
      
//       results.push({ phone, success: true });
//       console.log(`✅ Sent to: ${phone}`);
      
//       await new Promise(resolve => setTimeout(resolve, 2000));
//     } catch (error) {
//       console.error(`❌ Failed to send to ${phone}:`, error.message);
//       results.push({ phone, success: false, error: error.message });
//     }
//   }

//   res.json({ 
//     success: true,
//     results: results,
//     sent: results.filter(r => r.success).length,
//     failed: results.filter(r => !r.success).length
//   });
// });

// // Logout/Disconnect
// app.post('/logout', async (req, res) => {
//   try {
//     await client.logout();
//     isReady = false;
//     qrCodeData = '';
//     res.json({ success: true, message: 'Logged out successfully' });
//   } catch (error) {
//     res.status(500).json({ success: false, error: error.message });
//   }
// });

// // Get Client Info
// app.get('/info', async (req, res) => {
//   if (!isReady) {
//     return res.status(400).json({ 
//       success: false,
//       error: 'WhatsApp is not connected' 
//     });
//   }

//   try {
//     const info = await client.info;
//     res.json({ 
//       success: true,
//       info: {
//         pushname: info.pushname,
//         wid: info.wid._serialized,
//         platform: info.platform
//       }
//     });
//   } catch (error) {
//     res.status(500).json({ success: false, error: error.message });
//   }
// });

// // ============================================================================
// // ERROR HANDLING
// // ============================================================================

// app.use((err, req, res, next) => {
//   console.error('❌ Server error:', err);
//   res.status(500).json({ 
//     success: false,
//     error: 'Internal server error',
//     message: err.message 
//   });
// });

// // ============================================================================
// // START SERVER
// // ============================================================================

// app.listen(PORT, () => {
//   console.log('');
//   console.log('╔════════════════════════════════════════════════╗');
//   console.log('║   🎓 KRP ACADEMY - WHATSAPP SERVER            ║');
//   console.log('╚════════════════════════════════════════════════╝');
//   console.log('');
//   console.log(`🚀 Server running on http://localhost:${PORT}`);
//   console.log('📱 Initializing WhatsApp...');
//   console.log('');
//   console.log('⚠️  IMPORTANT: Update GOOGLE_SCRIPT_URL in this file');
//   console.log('    with your deployed Google Apps Script URL');
//   console.log('');
//   console.log('📊 Available endpoints:');
//   console.log(`   GET  /              - Home`);
//   console.log(`   GET  /health        - Health check`);
//   console.log(`   GET  /status        - WhatsApp connection status`);
//   console.log(`   GET  /connect       - Get QR code`);
//   console.log(`   POST /send          - Send single message`);
//   console.log(`   POST /send-bulk     - Send bulk messages`);
//   console.log(`   GET  /info          - Get client info`);
//   console.log(`   POST /logout        - Disconnect WhatsApp`);
//   console.log('');
  
//   initializeWhatsApp();
// });

// // Graceful shutdown
// process.on('SIGINT', async () => {
//   console.log('\n🛑 Shutting down gracefully...');
//   if (client) {
//     await client.destroy();
//   }
//   process.exit(0);
// });

// process.on('SIGTERM', async () => {
//   console.log('\n🛑 Shutting down gracefully...');
//   if (client) {
//     await client.destroy();
//   }
//   process.exit(0);
// });






