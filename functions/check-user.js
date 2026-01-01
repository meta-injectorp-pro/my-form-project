const admin = require('firebase-admin');

// ফায়ারবেস ইনিশিয়ালাইজেশন (আগের মতোই)
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
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

        // ২. ডাটাবেসে ফোন নম্বর খোঁজা
        // আপনার 'licenseDatabase' কালেকশনে ফোন নম্বরটি যে ফিল্ডে সেভ আছে তার নাম দিন (যেমন: 'Phone Number')
        const userSnapshot = await db.collection('licenseDatabase')
                                     .where('Phone Number', '==', phoneNumber)
                                     .limit(1)
                                     .get();

        // ৩. ইউজার না পাওয়া গেলে
        if (userSnapshot.empty) {
            return {
                statusCode: 404,
                body: JSON.stringify({ found: false, message: "User not found" })
            };
        }

        // ৪. ইউজার পাওয়া গেলে নাম এবং লাইসেন্স কী নেওয়া
        const userData = userSnapshot.docs[0].data();
        const licenseKey = userSnapshot.docs[0].id; // লাইসেন্স কী (Document ID)

        return {
            statusCode: 200,
            body: JSON.stringify({
                found: true,
                name: userData['Customer Name'], // ইউজারের নাম
                licenseKey: licenseKey // এটি ফ্রন্টএন্ডে লুকিয়ে রাখা হবে পরবর্তী স্টেপের জন্য
            })
        };

    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};