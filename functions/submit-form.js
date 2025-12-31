const admin = require('firebase-admin');
const Busboy = require('busboy');

// Firebase Config
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

// Form Parsing Helper
function parseMultipartForm(event) {
    return new Promise((resolve) => {
        const fields = {};
        const busboy = Busboy({ headers: event.headers });
        busboy.on('field', (fieldname, val) => fields[fieldname] = val);
        busboy.on('finish', () => resolve({ fields }));
        busboy.end(Buffer.from(event.body, 'base64'));
    });
}

exports.handler = async (event) => {
  try {
    const { fields } = await parseMultipartForm(event);
    const data = fields;

    // ১. ডাটাবেসে এই ইমেইল দিয়ে ইউজার খুঁজি
    const userSnapshot = await db.collection('licenseDatabase')
                                 .where('Email', '==', data.Email)
                                 .limit(1)
                                 .get();

    let isNewUser = true;
    let userData = null;
    let licenseKeyToUpdate;

    if (!userSnapshot.empty) {
        isNewUser = false;
        const userDoc = userSnapshot.docs[0];
        userData = userDoc.data();
        licenseKeyToUpdate = userDoc.id;
    } else {
        // নতুন ইউজার হলে একটা খালি লাইসেন্স কি খুঁজে বের করি
        const freeLicenseSnapshot = await db.collection('licenseDatabase')
                                            .where('Email', '==', null)
                                            .limit(1)
                                            .get();
        if (freeLicenseSnapshot.empty) {
            return {
                statusCode: 500,
                body: JSON.stringify({ message: "No license keys available. Contact Support." })
            };
        }
        licenseKeyToUpdate = freeLicenseSnapshot.docs[0].id;
    }

    // ২. রুলস চেকিং (Rules Checking)
    const requestedPackage = data.Package;

    if (!isNewUser) {
        // যদি ইউজার আগে থেকেই থাকে এবং সে "Free Trial" চায়
        if (requestedPackage === 'Free Trial') {
            
            // কেইস ১: সে আগে একবার ফ্রি ট্রায়াল নিয়েছে
            if (userData.Package === 'Free Trial') {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ message: "আপনি ইতিমধ্যে একবার ফ্রি ট্রায়াল ব্যবহার করেছেন। দয়া করে পেইড প্যাকেজ কিনুন।" })
                };
            }

            // কেইস ২: সে পেইড ইউজার, এখন ফ্রি ট্রায়ালে নামতে চাচ্ছে
            if (userData.Package !== 'Free Trial' && userData.Package !== null) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ message: "আপনি একজন প্রিমিয়াম ইউজার। আপনি ফ্রি ট্রায়ালে ডাউনগ্রেড করতে পারবেন না।" })
                };
            }
        }
    }

    // ৩. সব ঠিক থাকলে purchaseForm এ রিকোয়েস্ট জমা করা
    const purchaseData = {
        "Your Full Name": data.FullName,
        "Email": data.Email,
        "Phone Number": data.Phone,
        "Select Your Package": data.Package,
        "Package Duration": data.Duration || "30 Days",
        "Assigned Credits": 0, // Admin can set this later
        "Payment Method": data.PaymentMethod || "N/A",
        "Amount Sent (BDT)": data.AmountSent || "0",
        "Sender's Number or TrxID": data.SenderInfo || "N/A",
        "License Key": licenseKeyToUpdate, // কোন লাইসেন্সে আপডেট হবে তা রেফারেন্স রাখা হলো
        "Status": "Pending",
        "Timestamp": new Date(),
        "UserStatus": isNewUser ? "New User" : "Existing User"
    };

    await db.collection('purchaseForm').add(purchaseData);
    
    // ৪. লাইসেন্স ডাটাবেস আপডেট (স্ট্যাটাস পেন্ডিং রাখা হলো)
    // যাতে ইউজার অ্যাপে লগইন করতে না পারে যতক্ষণ না আপনি অ্যাপ্রুভ করছেন
    const licenseUpdateData = {
        "Email": data.Email,
        "Customer Name": data.FullName,
        "Phone Number": data.Phone,
        "Package": data.Package, 
        "Status": "Pending", // Admin approve korle Active hobe
        "RequestDate": new Date()
    };
    
    await db.collection('licenseDatabase').doc(licenseKeyToUpdate).update(licenseUpdateData);

    return { 
        statusCode: 200, 
        body: JSON.stringify({ 
            status: "success",
            message: "আপনার রিকোয়েস্ট জমা হয়েছে। অ্যাডমিন অ্যাপ্রুভাল এর জন্য অপেক্ষা করুন।"
        }) 
    };

  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Server Error: " + error.message })
    };
  }
};
