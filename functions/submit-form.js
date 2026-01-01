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

    // ১. ডাটাবেসে ইউজার চেক করা
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
        // নতুন ইউজারের জন্য খালি লাইসেন্স খোঁজা
        const freeLicenseSnapshot = await db.collection('licenseDatabase')
                                            .where('Email', 'in', ["", null])
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

    // ২. প্রাইস সিকিউরিটি (Backend Price Validation)
    // ইউজার ফ্রন্টএন্ডে প্রাইস চেঞ্জ করলেও লাভ হবে না, এখান থেকেই প্রাইস সেট হবে।
    const priceMap = {
        "Free Trial": 0,
        "Starter": 150,      // 150 TK
        "Beginner": 200,     // 200 TK
        "Professional": 400, // 400 TK
        "Ultimate": 700,     // 700 TK
        "Corporate": 1000,   // 1000 TK
        "Enterprise": 1700   // 1700 TK
    };

    const requestedPackage = data.Package;
    
    // প্যাকেজ অনুযায়ী অটোমেটিক প্রাইস সেট করা হচ্ছে
    const officialPrice = priceMap[requestedPackage] !== undefined ? priceMap[requestedPackage] : 0;

    // ৩. রুলস চেকিং
    if (!isNewUser) {
        if (requestedPackage === 'Free Trial') {
            if (userData.Package === 'Free Trial') {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ message: "You have already used the Free Trial once. Please purchase a paid package." })
                };
            }
            if (userData.Package !== 'Free Trial' && userData.Package !== null && userData.Package !== "") {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ message: "You are a premium user. You cannot downgrade to Free Trial." })
                };
            }
        }
    }

    // ৪. ডাটাবেসে রিকোয়েস্ট জমা দেওয়া
    const purchaseData = {
        "Your Full Name": data.FullName,
        "Email": data.Email,
        "Phone Number": data.Phone,
        "Select Your Package": data.Package,
        "Package Duration": data.Duration || "30 Days",
        
        "Assigned Credits": 0, // আপনার রিকোয়ারমেন্ট অনুযায়ী ০ রাখা হলো
        
        "Payment Method": data.PaymentMethod || "N/A",
        
        // এখানে সিকিউরিটি আপডেট করা হয়েছে:
        // ফ্রন্টএন্ডের data.AmountSent বাদ দিয়ে ব্যাকএন্ডের officialPrice বসানো হলো
        "Amount Sent (BDT)": officialPrice.toString(), 
        
        "Sender's Number or TrxID": data.SenderInfo || "N/A",
        "License Key": licenseKeyToUpdate, 
        "Status": "Pending",
        "Timestamp": new Date(),
        "UserStatus": isNewUser ? "New User" : "Existing User"
    };

    await db.collection('purchaseForm').add(purchaseData);
    
    // ৫. লাইসেন্স ডাটাবেস আপডেট (স্ট্যাটাস পেন্ডিং)
    const licenseUpdateData = {
        "Email": data.Email,
        "Customer Name": data.FullName,
        "Phone Number": data.Phone,
        "Package": data.Package, 
        "Status": "Pending", 
        "RequestDate": new Date()
    };
    
    await db.collection('licenseDatabase').doc(licenseKeyToUpdate).update(licenseUpdateData);

    return { 
        statusCode: 200, 
        body: JSON.stringify({ 
            status: "success",
            message: "Your request has been submitted successfully. Please wait for admin approval."
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