const admin = require('firebase-admin');
const Busboy = require('busboy');
const { Dropbox } = require('dropbox');
const fetch = require('isomorphic-fetch');

const DROPBOX_ACCESS_TOKEN = process.env.DROPBOX_ACCESS_TOKEN;
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
        busboy.on('finish', () => resolve({ fields, fileBuffer, fileMime, fileOriginalName }));
        busboy.end(Buffer.from(event.body, 'base64'));
    });
}

exports.handler = async (event) => {
  try {
    const { fields, fileBuffer, fileOriginalName } = await parseMultipartForm(event);
    const data = fields;
    let screenshotLink = '';

    // --- ব্যবহারকারী যাচাই করার জন্য একক এবং সংশোধিত লজিক ---
    const userSnapshot = await db.collection('licenseDatabase').where('Email', '==', data.Email).limit(1).get();
    let licenseKeyToUpdate;
    let isUpgrade = false;

    if (!userSnapshot.empty) {
      // যদি ব্যবহারকারী আগে থেকেই থাকে
      const existingUserDoc = userSnapshot.docs[0];
      const existingUserData = existingUserDoc.data();

      if (existingUserData.Package !== 'Free Trial') {
        // ব্যবহারকারী যদি আগে থেকেই প্রিমিয়াম প্যাকেজে থাকে
        return {
          statusCode: 400,
          body: JSON.stringify({ status: "error_already_premium", message: "You already have an active premium package." })
        };
      }
      
      // ব্যবহারকারী যদি Free Trial প্যাকেজে থাকে
      if (data.Package === 'Free Trial') {
        // এবং আবার Free Trial নিতে চায়
        return {
          statusCode: 400,
          body: JSON.stringify({ status: "error_already_freetrial", message: "You have already used your free trial." })
        };
      }

      // যদি উপরের কোনো শর্ত পূরণ না হয়, তার মানে এটি একটি আপগ্রেড
      licenseKeyToUpdate = existingUserDoc.id;
      isUpgrade = true;

    } else {
      // যদি ব্যবহারকারী সম্পূর্ণ নতুন হয়
      const availableLicenseSnapshot = await db.collection('licenseDatabase').where('Email', 'in', ["", null]).limit(1).get();
      if (availableLicenseSnapshot.empty) {
        throw new Error("No available licenses.");
      }
      licenseKeyToUpdate = availableLicenseSnapshot.docs[0].id;
      isUpgrade = false;
    }
    
    // --- ফাইল আপলোড লজিক সংশোধন ---
    // শুধু তখনই আপলোড হবে যদি কোনো ফাইল সিলেক্ট করা হয়
    if (fileBuffer && fileOriginalName) {
        const dbx = new Dropbox({ accessToken: DROPBOX_ACCESS_TOKEN, fetch: fetch });
        const filePath = `/${data.Email}-${Date.now()}-${fileOriginalName}`;
        const uploadedFile = await dbx.filesUpload({ path: filePath, contents: fileBuffer });
        const sharedLink = await dbx.sharingCreateSharedLinkWithSettings({ path: uploadedFile.result.path_display });
        screenshotLink = sharedLink.result.url.replace('dl=0', 'raw=1');
    }

    // --- Firebase-এ ডেটা সেভ করার বাকি অংশ ---
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
          "Upload Payment Screenshot  ": screenshotLink 
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
