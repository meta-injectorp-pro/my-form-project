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