const admin = require('firebase-admin');
const Busboy = require('busboy');
const { google } = require('googleapis');
const { Readable } = require('stream');

// --- আপনার গুগল ড্রাইভ ফোল্ডারের আইডি এখানে পেস্ট করুন ---
const DRIVE_FOLDER_ID = '1lZ0wccZ75lRdVy5Ny06f90CI-c-5UqSi'; 
// ---------------------------------------------------------

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

try {
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
} catch (e) { console.error('Firebase admin initialization error', e.stack); }

const db = admin.firestore();
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: serviceAccount.client_email,
    private_key: serviceAccount.private_key,
  },
  scopes: ['https://www.googleapis.com/auth/drive'],
});
const drive = google.drive({ version: 'v3', auth });

// Helper function to parse multipart form data
function parseMultipartForm(event) {
  return new Promise((resolve) => {
    const fields = {};
    let fileBuffer, fileMime, fileOriginalName;

    const busboy = Busboy({ headers: event.headers });

    busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
      fileOriginalName = filename;
      fileMime = mimetype;
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
    const { fields, fileBuffer, fileMime, fileOriginalName } = await parseMultipartForm(event);
    const data = fields; // All text fields
    let screenshotLink = '';

    // ধাপ ১: যদি কোনো স্ক্রিনশট ফাইল থাকে, তবে সেটি গুগল ড্রাইভে আপলোড করা
    if (fileBuffer) {
      const file = await drive.files.create({
        requestBody: {
          name: `${data.Email}-${Date.now()}-${fileOriginalName}`,
          parents: [DRIVE_FOLDER_ID],
        },
        media: {
          mimeType: fileMime,
          body: Readable.from(fileBuffer),
        },
      });

      await drive.permissions.create({
        fileId: file.data.id,
        requestBody: { role: 'reader', type: 'anyone' },
      });

      const fileData = await drive.files.get({
        fileId: file.data.id,
        fields: 'webViewLink',
      });
      screenshotLink = fileData.data.webViewLink;
    }

    // ধাপ ২: আগের মতোই Firebase-এ ডেটা আপডেট এবং যোগ করা
    // (এখানে আগের কোডটি সামান্য পরিবর্তন করে যোগ করা হয়েছে)
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
          "Upload Payment Screenshot  ": screenshotLink // নতুন যোগ করা লিঙ্ক
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
