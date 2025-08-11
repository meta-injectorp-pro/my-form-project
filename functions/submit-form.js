const admin = require('firebase-admin');

// Firebase Service Account Key যা Netlify-এর Environment Variable থেকে আসবে
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

// Firebase অ্যাপটি চালু করা হচ্ছে
try {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }
} catch (e) {
  console.error('Firebase admin initialization error', e.stack);
}

const db = admin.firestore();

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const data = JSON.parse(event.body);

    // ধাপ ১: একটি খালি লাইসেন্স খুঁজে বের করা
    const snapshot = await db.collection('License Database')
                             .where('Email', '==', '')
                             .limit(1)
                             .get();

    if (snapshot.empty) {
      console.error("No available licenses found.");
      return { statusCode: 500, body: JSON.stringify({ error: "No available licenses." }) };
    }

    const licenseDoc = snapshot.docs[0];
    const licenseKeyToUpdate = licenseDoc.id;

    // ধাপ ২: লাইসেন্সটি নতুন ডেটা দিয়ে আপডেট করা
    const licenseUpdateData = {
      "Email": data.Email,
      "Customer Name": data.FullName,
      "Phone Number": data.Phone,
      "Package": data.Package,
      "Status": "Pending"
    };
    await db.collection('License Database').doc(licenseKeyToUpdate).update(licenseUpdateData);

    // ধাপ ৩: 'Purchase Form' কালেকশনে ডেটা যোগ করা
    if (data.Package !== 'Free Trial') {
      const purchaseData = {
        "Your Full Name": data.FullName,
        "Email": data.Email,
        "Phone Number": data.Phone,
        "Select Your Package": data.Package,
        "Payment Method": data.PaymentMethod || "",
        "Amount Sent (BDT)": data.AmountSent || "",
        "Sender's Number or TrxID  ": data.SenderInfo || "",
        "Status": "Pending",
        "Timestamp": new Date()
      };
      await db.collection('Purchase Form').add(purchaseData);

      // ধাপ ৪: 'Sales Logs' কালেকশনে ডেটা যোগ করা
      const salesData = {
        "Timestamp": new Date(),
        "License Key": licenseKeyToUpdate,
        "Package": data.Package,
        "Final Price": data.Price
      };
      await db.collection('Sales Logs').add(salesData);
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({ status: "success", message: "Data successfully saved to Firebase!" })
    };

  } catch (error) {
    console.error("Error processing form:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "An internal server error occurred." })
    };
  }
};
