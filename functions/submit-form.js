const admin = require('firebase-admin');
const Busboy = require('busboy');
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

try {
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
} catch (e) { console.error('Firebase admin initialization error', e.stack); }

const db = admin.firestore();

function parseMultipartForm(event) {
    return new Promise((resolve) => {
        const fields = {};
        let fileBuffer, fileMime, fileOriginalName;
        const busboy = Busboy({ headers: event.headers });
        busboy.on('file', (fieldname, file, { filename, mimeType }) => {
            fileOriginalName = filename; fileMime = mimeType;
            const chunks = [];
            file.on('data', (chunk) => chunks.push(chunk));
            file.on('end', () => fileBuffer = Buffer.concat(chunks));
        });
        busboy.on('field', (fieldname, val) => fields[fieldname] = val);
        busboy.on('finish', () => resolve({ fields }));
        busboy.end(Buffer.from(event.body, 'base64'));
    });
}

exports.handler = async (event) => {
  try {
    const { fields } = await parseMultipartForm(event);
    const data = fields;
    const userSnapshot = await db.collection('licenseDatabase').where('Email', '==', data.Email).limit(1).get();
    let licenseKeyToUpdate;
    let isUpgrade = false;

    if (!userSnapshot.empty) {
      const existingUserDoc = userSnapshot.docs[0];
      const existingUserData = existingUserDoc.data();

      if (existingUserData.Package !== 'Free Trial') {
        return {
          statusCode: 400,
          body: JSON.stringify({ status: "error_already_premium", message: "You already have an active premium package." })
        };
      }      

      if (data.Package === 'Free Trial') {
        return {
          statusCode: 400,
          body: JSON.stringify({ status: "error_already_freetrial", message: "You have already used your free trial." })
        };
      }

      licenseKeyToUpdate = existingUserDoc.id;
      isUpgrade = true;

    } else {
      const availableLicenseSnapshot = await db.collection('licenseDatabase').where('Email', 'in', ["", null]).limit(1).get();
      if (availableLicenseSnapshot.empty) {
        throw new Error("No available licenses.");
      }
      licenseKeyToUpdate = availableLicenseSnapshot.docs[0].id;
      isUpgrade = false;
    }

    const licenseUpdateData = {
        "Email": data.Email,
        "Customer Name": data.FullName,
        "Phone Number": data.Phone,
        "Package": data.Package,
        "Duration": data.Duration || "",
        "Status": "Pending"
    };
    await db.collection('licenseDatabase').doc(licenseKeyToUpdate).update(licenseUpdateData);

    if (data.Package !== 'Free Trial') {
      const purchaseData = {
          "Your Full Name": data.FullName, "Email": data.Email, "Phone Number": data.Phone,
          "Select Your Package": data.Package, "Package Duration": data.Duration || "",
          "Payment Method": data.PaymentMethod || "", "Amount Sent (BDT)": data.AmountSent || "",
          "Sender's Number or TrxID  ": data.SenderInfo || "", "Status": "Pending", "Timestamp": new Date(),
      };
      await db.collection('purchaseForm').add(purchaseData);
      
      const salesData = {
          "Timestamp": new Date(), "License Key": licenseKeyToUpdate,
          "Package": data.Package, "Duration": data.Duration || "",
          "Final Price": data.Price
      };
      await db.collection('salesLogs').add(salesData);
    }
    
    return { 
        statusCode: 200, 
        body: JSON.stringify({ status: isUpgrade ? "success_upgrade" : "success_new" }) 
    };

  } catch (error) {
    console.error("Error:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message, status: "error_internal" }) };
  }
};
