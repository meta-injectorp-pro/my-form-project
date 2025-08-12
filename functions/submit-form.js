const admin = require('firebase-admin');
const Busboy = require('busboy');
const { Dropbox } = require('dropbox');
const fetch = require('isomorphic-fetch');

const BUCKET_NAME = 'your-project-id.appspot.com'; // এটি এখন আর ব্যবহার হচ্ছে না, তবে রেখে দিতে পারেন

// Netlify Environment Variable থেকে টোকেন নেওয়া হচ্ছে
const DROPBOX_ACCESS_TOKEN = process.env.DROPBOX_ACCESS_TOKEN;

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

try {
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
} catch (e) { console.error('Firebase admin initialization error', e.stack); }

const db = admin.firestore();

// Helper function to parse multipart form data (অপরিবর্তিত)
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

    // ধাপ ১: যদি কোনো ফাইল থাকে, তবে সেটি Dropbox-এ আপলোড করা
    if (fileBuffer) {
        const dbx = new Dropbox({ accessToken: DROPBOX_ACCESS_TOKEN, fetch: fetch });
        const filePath = `/${data.Email}-${Date.now()}-${fileOriginalName}`;
        
        const uploadedFile = await dbx.filesUpload({ path: filePath, contents: fileBuffer });
        
        const sharedLink = await dbx.sharingCreateSharedLinkWithSettings({ path: uploadedFile.result.path_display });
        
        screenshotLink = sharedLink.result.url.replace('dl=0', 'raw=1'); // সরাসরি দেখার জন্য লিঙ্ক তৈরি
    }

    // ধাপ ২: Firebase-এ ডেটা আপডেট এবং যোগ করা (অপরিবর্তিত)
    let licenseKeyToUpdate;
    const userSnapshot = await db.collection('License Database').where('Email', '==', data.Email).limit(1).get();
    if (!userSnapshot.empty && userSnapshot.docs[0].data().Package === 'Free Trial') {
        licenseKeyToUpdate = userSnapshot.docs[0].id;
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
          "Upload Payment Screenshot  ": screenshotLink // Dropbox থেকে পাওয়া লিঙ্ক
      };
      await db.collection('Purchase Form').add(purchaseData);
      
      const salesData = {
          "Timestamp": new Date(), "License Key": licenseKeyToUpdate,
          "Package": data.Package, "Final Price": data.Price
      };
      await db.collection('Sales Logs').add(salesData);
    }
    
    return { statusCode: 200, body: JSON.stringify({ status: "success" }) };

  } catch (error) {
    console.error("Error:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
