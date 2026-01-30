const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        })
    });
}

const db = admin.firestore();

// --- Helper Functions for Masking ---

// ইমেইল মাস্কিং ফাংশন (Example: farh******59@yahoo.com)
function maskEmail(email) {
    if (!email || email === "No Email") return "No Email";
    const parts = email.split('@');
    if (parts.length < 2) return email;
    
    const local = parts[0];
    const domain = parts[1];

    if (local.length <= 4) return email; // খুব ছোট ইমেইল হলে মাস্ক হবে না

    const start = local.substring(0, 4);
    const end = local.substring(local.length - 2);
    return `${start}******${end}@${domain}`;
}

// ফোন মাস্কিং ফাংশন (Example: 01726XXXX65)
function maskPhone(phone) {
    if (!phone) return "N/A";
    const phoneStr = String(phone);
    
    if (phoneStr.length >= 11) {
        // প্রথম ৫ ডিজিট + XXXX + শেষ ২ ডিজিট
        return phoneStr.substring(0, 5) + "XXXX" + phoneStr.substring(phoneStr.length - 2);
    }
    // অন্য ফরম্যাটের নাম্বারের জন্য
    return phoneStr.substring(0, 3) + "****" + phoneStr.substring(phoneStr.length - 2);
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const body = JSON.parse(event.body);
        const phoneNumber = body.phone;

        const userSnapshot = await db.collection('licenseDatabase')
                                     .where('Phone Number', '==', phoneNumber)
                                     .limit(1)
                                     .get();

        if (userSnapshot.empty) {
            return {
                statusCode: 404,
                body: JSON.stringify({ found: false, message: "User not found" })
            };
        }

        const userData = userSnapshot.docs[0].data();
        const licenseKey = userSnapshot.docs[0].id;

        // Raw Data collection
        const rawEmail = userData['Email'] || userData['Email Address'] || "No Email";
        const rawPhone = userData['Phone Number'];

        return {
            statusCode: 200,
            body: JSON.stringify({
                found: true,
                licenseKey: licenseKey,
                name: userData['Customer Name'], // নাম ফুল শো করবে
                
                // এখানে মাস্কিং ফাংশন কল করা হচ্ছে
                email: maskEmail(rawEmail), 
                phone: maskPhone(rawPhone)  
            })
        };

    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};