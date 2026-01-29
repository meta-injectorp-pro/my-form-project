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

        return {
            statusCode: 200,
            body: JSON.stringify({
                found: true,
                licenseKey: licenseKey,
                name: userData['Customer Name'],

                email: userData['Email'] || userData['Email Address'] || "No Email",
                phone: userData['Phone Number']
            })
        };

    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};