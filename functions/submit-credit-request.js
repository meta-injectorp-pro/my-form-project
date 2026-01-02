const admin = require('firebase-admin');

// Firebase Config (Updated for Netlify 4KB Limit)
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            // Private Key-এর নিউলাইন (\n) সমস্যা সমাধান করা হলো
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        })
    });
}

const db = admin.firestore();

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const data = JSON.parse(event.body);

        // ১. ডাটা ভ্যালিডেশন
        if (!data.licenseKey || !data.amount || !data.trxId) {
            return { statusCode: 400, body: JSON.stringify({ message: "Missing fields" }) };
        }

        // ২. সিকিউরিটি চেক: এই লাইসেন্সের কোনো রিকোয়েস্ট ইতিমধ্যে Pending আছে কিনা?
        const pendingCheck = await db.collection('Credits_Purchase')
            .where('License Key', '==', data.licenseKey)
            .where('Status', '==', 'Pending')
            .get();

        if (!pendingCheck.empty) {
            return { 
                statusCode: 429, // Too Many Requests
                body: JSON.stringify({ 
                    message: "You already have a Pending request! Please wait for admin approval." 
                }) 
            };
        }

        // ৩. নতুন রিকোয়েস্ট জমা দেওয়া
        const creditRequest = {
            "Customer Name": data.name,
            "Phone Number": data.phone,
            "License Key": data.licenseKey,
            "Requested Credits": data.credits,
            "Amount Sent": data.amount,
            "TrxID": data.trxId,
            "Payment Method": data.paymentMethod,
            "Status": "Pending",
            "Request Date": new Date(),
            "Type": "Credit Top-up"
        };

        await db.collection('Credits_Purchase').add(creditRequest);

// ==========================================
        // TELEGRAM NOTIFICATION (CREDIT TOP-UP)
        // ==========================================
        try {
            const botToken = "8569188310:AAG_3n41JwtI5_1OL3i4FiXUjgrJTDtwtd4"; // আপনার টোকেন দিন
            const chatId = "6276804742";     // আপনার চ্যাট আইডি দিন

            const messageText = `💎 *New Credit Top-up Request!*

👤 Name: ${data.name}
📱 Phone: \`${data.phone}\`
💰 Amount: ${data.amount} BDT
gem Credits: ${data.credits}
💳 Method: ${data.paymentMethod}
📝 TrxID: \`${data.trxId}\`

Check Admin Panel to Approve.`;

            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: messageText, parse_mode: 'Markdown' })
            });
        } catch (e) { console.error("Telegram Error:", e); }
        // ==========================================

        return {
            statusCode: 200,
            body: JSON.stringify({
                status: "success",
                message: "Credit purchase request submitted successfully!"
            })
        };

    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};