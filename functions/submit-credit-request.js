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

        // 3. Determine Duration & Promo Logic
        const duration = packageDurations[data.packageName] || 0; 
        
        // --- PROMO CODE LOGIC START ---
        let finalCredits = parseInt(data.credits);
        const promoCode = data.promoCode || "N/A";
        
        if (promoCode === "BONUS500") {
            finalCredits += 500; // Add 500 Bonus Credits
        }
        // --- PROMO CODE LOGIC END ---

        // 4. Save to Database
        const creditRequest = {
            "Customer Name": data.name,
            "Phone Number": data.phone,
            "License Key": data.licenseKey,
            "Credits Requested": finalCredits, // Saved with bonus
            "Amount Sent (BDT)": data.amount.toString(),
            "Payment Method": data.paymentMethod,
            "TrxID": data.trxId,
            "Status": "Pending",
            "Request Date": new Date(),
            "Type": "Credit Top-up",
            "Package Type": data.packageName || "Custom Credit Pack",
            "Package Duration": duration,
            "Promo Code": promoCode // Saving Promo Info
        };

        await db.collection('Credits_Purchase').add(creditRequest);

        // 5. Telegram Notification (Updated to HTML & Promo Info)
        try {
            const botToken = process.env.TELEGRAM_BOT_TOKEN;
            const chatId = process.env.TELEGRAM_CHAT_ID;

            if (botToken && chatId) {
                const messageText = `💎 <b>New Credit Top-up Request!</b>

📦 Package: ${data.packageName || "Credits"}
👤 Name: ${data.name}
📱 Phone: <code>${data.phone}</code>
💰 Amount: ${data.amount} BDT
💎 Credits: ${finalCredits}
🎫 Promo: ${promoCode}
💳 Method: ${data.paymentMethod}
📝 TrxID: <code>${data.trxId}</code>
⏳ Duration: ${duration} Days

Check Admin Panel to Approve.`;

                await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: chatId, text: messageText, parse_mode: 'HTML' })
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