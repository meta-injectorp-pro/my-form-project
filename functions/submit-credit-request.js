const admin = require('firebase-admin');
const fetch = require('node-fetch'); // Ensure node-fetch is installed/available

// Firebase Config
if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            })
        });
    } catch (e) {
        console.error("Firebase Init Error:", e);
    }
}

const db = admin.firestore();

// Package Duration Map (For Credits)
const packageDurations = {
    "Starter": 30,
    "Beginner": 30,
    "Professional": 60,
    "Ultimate": 90,
    "Corporate": 180,
    "Enterprise": 365
};

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const data = JSON.parse(event.body);

        // 1. Validation
        if (!data.licenseKey || !data.amount || !data.trxId) {
            return { statusCode: 400, body: JSON.stringify({ message: "Missing required fields" }) };
        }

        // 2. Pending Check
        const pendingCheck = await db.collection('Credits_Purchase')
            .where('License Key', '==', data.licenseKey)
            .where('Status', '==', 'Pending')
            .get();

        if (!pendingCheck.empty) {
            return { 
                statusCode: 400, 
                body: JSON.stringify({ message: "A request is already pending for this license." }) 
            };
        }

        // 3. Determine Duration
        // Frontend should send 'packageName', if not, default to 0 or manual check
        const duration = packageDurations[data.packageName] || 0; 

        // 4. Save to Database (Updated Fields)
        const creditRequest = {
            "Customer Name": data.name,
            "Phone Number": data.phone,
            "License Key": data.licenseKey,
            "Credits Requested": parseInt(data.credits),
            "Amount Sent (BDT)": data.amount.toString(),
            "Payment Method": data.paymentMethod,
            "TrxID": data.trxId,
            "Status": "Pending",
            "Request Date": new Date(),
            "Type": "Credit Top-up",
            
            // NEW FIELDS ADDED
            "Package Type": data.packageName || "Custom Credit Pack",
            "Package Duration": duration
        };

        await db.collection('Credits_Purchase').add(creditRequest);

        // 5. Telegram Notification
        try {
            const botToken = process.env.TELEGRAM_BOT_TOKEN;
            const chatId = process.env.TELEGRAM_CHAT_ID;

            if (botToken && chatId) {
                const messageText = `💎 *New Credit Top-up Request!*

📦 Package: ${data.packageName || "Credits"}
👤 Name: ${data.name}
📱 Phone: \`${data.phone}\`
💰 Amount: ${data.amount} BDT
💎 Credits: ${data.credits}
💳 Method: ${data.paymentMethod}
📝 TrxID: \`${data.trxId}\`
⏳ Duration: ${duration} Days

Check Admin Panel to Approve.`;

                await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: chatId, text: messageText, parse_mode: 'Markdown' })
                });
            }
        } catch (e) { console.error("Telegram Error:", e); }

        return {
            statusCode: 200,
            body: JSON.stringify({ message: "Credit request submitted successfully!" })
        };

    } catch (error) {
        console.error("Handler Error:", error);
        return { statusCode: 500, body: JSON.stringify({ message: error.message }) };
    }
};