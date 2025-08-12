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

    // --- নতুন যুক্ত করা মূল লজিক ---
    const userSnapshot = await db.collection('License Database').where('Email', '==', data.Email).limit(1).get();

    if (!userSnapshot.empty) {
      // যদি ব্যবহারকারী আগে থেকেই থাকে
      const existingUserDoc = userSnapshot.docs[0];
      const existingUserData = existingUserDoc.data();

      if (existingUserData.Package !== 'Free Trial') {
        // ব্যবহারকারী যদি আগে থেকেই প্রিমিয়াম প্যাকেজে থাকে
        return {
          statusCode: 400, // Bad Request
          body: JSON.stringify({ status: "error_already_premium", message: "You already have an active premium package. Please contact support for any issues." })
        };
      }
      
      // ব্যবহারকারী যদি Free Trial থেকে আপগ্রেড করে
      if (existingUserData.Package === 'Free Trial' && data.Package !== 'Free Trial') {
        const licenseKeyToUpdate = existingUserDoc.id;
        // ... (বাকি কোড নিচে একই থাকবে) ...
      } else {
        // ব্যবহারকারী যদি Free Trial থাকা অবস্থায় আবার Free Trial নিতে চায়
         return {
          statusCode: 400,
          body: JSON.stringify({ status: "error_already_freetrial", message: "You have already used your free trial." })
        };
      }
    }
    // --- নতুন লজিক শেষ ---
    
    if (fileBuffer) {
        const dbx = new Dropbox({ accessToken: DROPBOX_ACCESS_TOKEN, fetch: fetch });
        const filePath = `/${data.Email}-${Date.now()}-${fileOriginalName}`;
        const uploadedFile = await dbx.filesUpload({ path: filePath, contents: fileBuffer });
        const sharedLink = await dbx.sharingCreateSharedLinkWithSettings({ path: uploadedFile.result.path_display });
        screenshotLink = sharedLink.result.url.replace('dl=0', 'raw=1');
    }

    let licenseKeyToUpdate;
    let isUpgrade = false; // আপগ্রেড কিনা তা ট্র্যাক করার জন্য
    const userCheckSnapshot = await db.collection('License Database').where('Email', '==', data.Email).limit(1).get();
    
    if (!userCheckSnapshot.empty && userCheckSnapshot.docs[0].data().Package === 'Free Trial') {
        licenseKeyToUpdate = userCheckSnapshot.docs[0].id;
        isUpgrade = true; // এটি একটি আপগ্রেড
    } else {
        const availableLicenseSnapshot = await db.collection('License Database').where('Email', 'in', ["", null]).limit(1).get();
        if (availableLicenseSnapshot.empty) throw new Error("No available licenses.");
        licenseKeyToUpdate = availableLicenseSnapshot.docs[0].id;
    }

    const licenseUpdateData = {
        "Email": data.Email, "Customer Name": data.FullName, "Phone Number": data.Phone,
        "Package": data.Package, "Status": "Pending"
    };
    await db.collection('License Database').doc(licenseKeyToUpdate).update(licenseUpdateData);

    if (data.Package !== 'Free Trial') {
      const purchaseData = {
          "Your Full Name": data.FullName, "Email": data.Email, "Phone Number": data.Phone,
          "Select Your Package": data.Package, "Payment Method": data.PaymentMethod || "",
          "Amount Sent (BDT)": data.AmountSent || "", "Sender's Number or TrxID  ": data.SenderInfo || "",
          "Status": "Pending", "Timestamp": new Date(),
          "Upload Payment Screenshot  ": screenshotLink
      };
      await db.collection('Purchase Form').add(purchaseData);
      
      const salesData = {
          "Timestamp": new Date(), "License Key": licenseKeyToUpdate,
          "Package": data.Package, "Final Price": data.Price
      };
      await db.collection('Sales Logs').add(salesData);
    }
    
    // আপগ্রেড হলে একটি বিশেষ মেসেজ পাঠানো হচ্ছে
    if (isUpgrade) {
        return { statusCode: 200, body: JSON.stringify({ status: "success_upgrade" }) };
    } else {
        return { statusCode: 200, body: JSON.stringify({ status: "success_new" }) };
    }

  } catch (error) {
    console.error("Error:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message, status: "error_internal" }) };
  }
};
