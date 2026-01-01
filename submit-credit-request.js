const admin = require('firebase-admin');

// ফায়ারবেস ইনিশিয়ালাইজেশন (যদি একই ফাইলে না থাকে)
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY))
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

        // ২. নতুন 'Credits_Purchase' কালেকশনে রিকোয়েস্ট জমা দেওয়া
        const creditRequest = {
            "Customer Name": data.name,
            "Phone Number": data.phone,
            "License Key": data.licenseKey, // আগের স্টেপ থেকে পাওয়া লাইসেন্স কী
            "Requested Credits": data.credits, // কত ক্রেডিট কিনছে
            "Amount Sent": data.amount,
            "TrxID": data.trxId,
            "Payment Method": data.paymentMethod,
            "Status": "Pending", // এডমিন অ্যাপ্রুভালের জন্য
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