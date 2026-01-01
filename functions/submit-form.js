const admin = require('firebase-admin');
const Busboy = require('busboy');
const nodemailer = require('nodemailer');

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

// Email Configuration
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.SMTP_EMAIL, 
        pass: process.env.SMTP_PASSWORD 
    }
});

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
  if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { fields } = await parseMultipartForm(event);
    const data = fields;

    // ১. ইউজার চেক এবং লাইসেন্স পিক করা
    const userSnapshot = await db.collection('licenseDatabase')
                                 .where('Email', '==', data.Email)
                                 .limit(1)
                                 .get();

    let isNewUser = true;
    let userData = null;
    let licenseKeyToUpdate;

    if (!userSnapshot.empty) {
        // পুরাতন ইউজার
        isNewUser = false;
        const userDoc = userSnapshot.docs[0];
        userData = userDoc.data();
        licenseKeyToUpdate = userDoc.id;
    } else {
        // নতুন ইউজার: অব্যবহৃত লাইসেন্স খুঁজে বের করা
        const freeLicenseSnapshot = await db.collection('licenseDatabase')
                                            .where('Email', 'in', ["", null])
                                            .limit(1)
                                            .get();     
        if (freeLicenseSnapshot.empty) {
            return {
                statusCode: 500,
                body: JSON.stringify({ message: "Stock Out! No license keys available." })
            };
        }
        licenseKeyToUpdate = freeLicenseSnapshot.docs[0].id;
    }

    // ২. রুলস চেকিং (ফ্রি ট্রায়াল একবারই)
    if (!isNewUser) {
        if (data.Package === 'Free Trial') {
            // যদি আগে কখনো ফ্রি ট্রায়াল বা অন্য কোনো প্যাকেজ নিয়ে থাকে
            if (userData.Package) {
                return { 
                    statusCode: 400, 
                    body: JSON.stringify({ message: "You have already used the Free Trial or have an active plan." }) 
                };
            }
        }
    }

    // ==========================================
    // FREE TRIAL LOGIC (তোমার রিকোয়ারমেন্ট অনুযায়ী)
    // ==========================================
    if (data.Package === "Free Trial") {
        
        // ১. License Database সরাসরি আপডেট (Purchase Form এ যাবে না)
        const licenseUpdateData = {
            "Email": data.Email,
            "Customer Name": data.FullName,
            "Phone Number": data.Phone,
            "Package": "Free Trial",
            "Duration": "3 Days",      // Duration 3 days
            "Credits": 50,             // 50 Credits add hobe
            "Status": "Sent",          // Status 'Sent'
            "RequestDate": new Date()
        };
        
        await db.collection('licenseDatabase').doc(licenseKeyToUpdate).update(licenseUpdateData);

        // ২. ইমেইল পাঠানো (বাটন সহ)
        const softwareLink = process.env.SOFTWARE_LINK || "#";

        const mailOptions = {
            from: `"Meta Injector Team" <${process.env.SMTP_EMAIL}>`,
            to: data.Email,
            subject: '🎉 Your Free Trial License Key',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #6E25ED; text-align: center;">Welcome to Meta Injector Pro!</h2>
                    <p>Hi <strong>${data.FullName}</strong>,</p>
                    <p>Your Free Trial has been activated. Here are your details:</p>
                    
                    <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #6E25ED;">
                        <p style="margin: 5px 0;"><strong>License Key:</strong> <span style="font-family: monospace; font-size: 16px;">${licenseKeyToUpdate}</span></p>
                        <p style="margin: 5px 0;"><strong>Credits:</strong> 50</p>
                        <p style="margin: 5px 0;"><strong>Duration:</strong> 3 Days</p>
                    </div>

                    <p>Click the button below to download the software:</p>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${softwareLink}" style="background: linear-gradient(90deg, #A073EE 0%, #6E25ED 100%); color: white; padding: 14px 28px; text-decoration: none; border-radius: 50px; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 4px 15px rgba(110, 37, 237, 0.3);">
                            Download Software
                        </a>
                    </div>
                    
                    <p style="font-size: 12px; color: #888; text-align: center;">If the button doesn't work, copy this link: <br> ${softwareLink}</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                    <p style="text-align: center; color: #666;">Best Regards,<br>Meta Injector Team</p>
                </div>
            `
        };

        try {
            await transporter.sendMail(mailOptions);
        } catch (emailError) {
            console.error("Email sending failed:", emailError);
        }

        // ৩. সাকসেস মেসেজ রিটার্ন (Email check করতে বলা হচ্ছে)
        return { 
            statusCode: 200, 
            body: JSON.stringify({ 
                status: "success",
                message: "Registration Successful! Please check your email for the License Key & Download Link." 
            }) 
        };
    }

    // ==========================================
    // PAID PACKAGE LOGIC (আগের মতোই থাকবে)
    // ==========================================
    
    // Price Logic
    const priceMap = {
        "Starter": 150, "Beginner": 200, 
        "Professional": 400, "Ultimate": 700, 
        "Corporate": 1000, "Enterprise": 1700
    };
    const officialPrice = priceMap[data.Package] || 0;

    // Purchase Form এ ডাটা অ্যাড করা
    const purchaseData = {
        "Your Full Name": data.FullName,
        "Email": data.Email,
        "Phone Number": data.Phone,
        "Select Your Package": data.Package,
        "Package Duration": data.Duration || "30 Days",
        "Assigned Credits": 0,
        "Payment Method": data.PaymentMethod || "N/A",
        "Amount Sent (BDT)": officialPrice.toString(),
        "Sender's Number or TrxID": data.SenderInfo || "N/A",
        "License Key": licenseKeyToUpdate, 
        "Status": "Pending",
        "Timestamp": new Date(),
        "UserStatus": isNewUser ? "New User" : "Existing User"
    };

    await db.collection('purchaseForm').add(purchaseData);
    
    // License Database আপডেট (পেইড ইউজারদের জন্য Pending)
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
            message: "Your purchase request submitted. Please wait for admin approval."
        }) 
    };

  } catch (error) {
    console.error("Server Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Server Error: " + error.message })
    };
  }
};