const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

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
    let licenseKeyToUpdate;

    // নতুন ধাপ: ব্যবহারকারী আগে থেকেই আছে কিনা এবং Free Trial ব্যবহার করছে কিনা তা পরীক্ষা করা
    const userSnapshot = await db.collection('License Database')
                                 .where('Email', '==', data.Email)
                                 .limit(1)
                                 .get();

    if (!userSnapshot.empty) {
      const existingUserDoc = userSnapshot.docs[0];
      const existingUserData = existingUserDoc.data();
      
      // যদি ব্যবহারকারী থাকে এবং তার প্যাকেজ 'Free Trial' হয়, তাহলে তার লাইসেন্সটিই আপগ্রেড হবে
      if (existingUserData.Package === 'Free Trial') {
        licenseKeyToUpdate = existingUserDoc.id;
        console.log(`Upgrading existing Free Trial user: ${data.Email}`);
      }
    }

    // যদি ব্যবহারকারী নতুন হয় অথবা তার Free Trial না থাকে, তাহলে একটি নতুন খালি লাইসেন্স খোঁজা হবে
    if (!licenseKeyToUpdate) {
      console.log(`Looking for a new license for: ${data.Email}`);
      const availableLicenseSnapshot = await db.collection('License Database')
                                               .where('Email', 'in', ["", null])
                                               .limit(1)
                                               .get();
      if (availableLicenseSnapshot.empty) {
        console.error("No available licenses found.");
        return { statusCode: 500, body: JSON.stringify({ error: "No available licenses." }) };
      }
      licenseKeyToUpdate = availableLicenseSnapshot.docs[0].id;
    }

    // লাইসেন্সটি নতুন ডেটা দিয়ে আপডেট করা
    const licenseUpdateData = {
      "Email": data.Email,
      "Customer Name": data.FullName,
      "Phone Number": data.Phone,
      "Package": data.Package,
      "Status": "Pending" // স্ট্যাটাস সবসময় Pending হবে
    };
    await db.collection('License Database').doc(licenseKeyToUpdate).update(licenseUpdateData);

    // 'Purchase Form' এবং 'Sales Logs' কালেকশনে ডেটা যোগ করা (শুধু পেইড প্যাকেজের জন্য)
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
