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

    // 1. Find User by Email
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
        // Find an empty license key for new user
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

    // 2. Rules Checking & Credit Calculation
    const requestedPackage = data.Package;
    
    // Credit Mapping based on your pricing plan
    const creditMap = {
        "Free Trial": 50,
        "Starter": 2000,
        "Beginner": 3500,
        "Professional": 6000,
        "Ultimate": 10000,
        "Corporate": 20000,
        "Enterprise": 35000
    };

    // Assign credits based on package (Default to 0 if not found)
    const creditsToAssign = creditMap[requestedPackage] || 0;

    if (!isNewUser) {
        // Free Trial Validation for existing users
        if (requestedPackage === 'Free Trial') {
            
            // Case 1: Already used Free Trial
            if (userData.Package === 'Free Trial') {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ message: "You have already used the Free Trial once. Please purchase a paid package." })
                };
            }

            // Case 2: Downgrading from Premium
            if (userData.Package !== 'Free Trial' && userData.Package !== null && userData.Package !== "") {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ message: "You are a premium user. You cannot downgrade to Free Trial." })
                };
            }
        }
    }

    // 3. Prepare Purchase Data (Store credits here, but NOT in license DB yet)
    const purchaseData = {
        "Your Full Name": data.FullName,
        "Email": data.Email,
        "Phone Number": data.Phone,
        "Select Your Package": data.Package,
        "Package Duration": data.Duration || "30 Days",
        "Assigned Credits": creditsToAssign, // Automatically assigned based on package
        "Payment Method": data.PaymentMethod || "N/A",
        "Amount Sent (BDT)": data.AmountSent || "0",
        "Sender's Number or TrxID": data.SenderInfo || "N/A",
        "License Key": licenseKeyToUpdate, 
        "Status": "Pending",
        "Timestamp": new Date(),
        "UserStatus": isNewUser ? "New User" : "Existing User"
    };

    // Add to purchaseForm collection
    await db.collection('purchaseForm').add(purchaseData);
    
    // 4. Update License Database (ONLY Status and Info, NO Credits)
    const licenseUpdateData = {
        "Email": data.Email,
        "Customer Name": data.FullName,
        "Phone Number": data.Phone,
        "Package": data.Package, 
        "Status": "Pending", // Admin approval required to become Active
        "RequestDate": new Date()
        // Note: 'Credits' field is NOT updated here, so it remains safe until approval
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
