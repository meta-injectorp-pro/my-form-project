const admin = require('firebase-admin');

// Firebase Config (Updated for Netlify 4KB Limit)
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            // Private Key-এর নিউলাইন (\n) সমস্যা সমাধান
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        })
    });
}

const db = admin.firestore();

exports.handler = async (event) => {
    // ১. মেথড চেক (শুধু POST এলাউড)
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const body = JSON.parse(event.body);
        const phoneNumber = body.phone; // ফ্রন্টএন্ড থেকে আসা ফোন নম্বর

        // ২. ডাটাবেসে ফোন নম্বর খোঁজা (আপনার অরিজিনাল লজিক)
        const userSnapshot = await db.collection('licenseDatabase')
                                     .where('Phone Number', '==', phoneNumber)
                                     .limit(1)
                                     .get();

        // ৩. ইউজার না পাওয়া গেলে
        if (userSnapshot.empty) {
            return {
                statusCode: 404,
                body: JSON.stringify({ found: false, message: "User not found" })
            };
        }

        // ৪. ইউজার পাওয়া গেলে ডাটা নেওয়া
        const userData = userSnapshot.docs[0].data();
        const licenseKey = userSnapshot.docs[0].id;

        return {
            statusCode: 200,
            body: JSON.stringify({
                found: true,
                licenseKey: licenseKey,
                name: userData['Customer Name'], // নাম
                
                // ✅ শুধু এই দুটি লাইন যোগ করা হয়েছে:
                email: userData['Email'] || userData['Email Address'] || "No Email",
                phone: userData['Phone Number']
            })
        };

    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};