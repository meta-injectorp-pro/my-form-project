const admin = require('firebase-admin');
const Busboy = require('busboy');
const nodemailer = require('nodemailer');

// Firebase Config (Updated for Netlify 4KB Limit)
try {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      })
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
            if (userData.Package) {
                return { 
                    statusCode: 400, 
                    body: JSON.stringify({ message: "You have already used the Free Trial or have an active plan." }) 
                };
            }
        }
    }

    // ==========================================
    // FREE TRIAL LOGIC
    // ==========================================
    if (data.Package === "Free Trial") {
        
        // ১. License Database আপডেট
        const licenseUpdateData = {
            "Email": data.Email,
            "Customer Name": data.FullName,
            "Phone Number": data.Phone,
            "Package": "Free Trial",
            "Duration": 3,             // Database-e sudhu sonkha '3' jabe
            "Credits": 50,             
            "Status": "Sent",          
            "RequestDate": new Date()
        };
        
        await db.collection('licenseDatabase').doc(licenseKeyToUpdate).update(licenseUpdateData);

        // ২. ইমেইল পাঠানো (Button Only)
        const softwareLink = process.env.SOFTWARE_LINK || "#";

        const mailOptions = {
            from: `"Meta Injector Team" <${process.env.SMTP_EMAIL}>`,
            to: data.Email,
            subject: '🎉 Your Free Trial License Key',
            html: `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #e0e0e0; border-radius: 12px; background-color: #ffffff;">
                    
                    <h2 style="color: #6E25ED; text-align: center; margin-bottom: 10px;">Welcome to Meta Injector Pro!</h2>
                    <p style="color: #555; font-size: 16px; text-align: center;">Hi <strong>${data.FullName}</strong>, your Free Trial is ready.</p>
                    
                    <div style="background-color: #f8f5ff; padding: 20px; border-radius: 8px; margin: 25px 0; border: 1px solid #eaddff; text-align: center;">
                        <p style="margin: 5px 0; color: #888; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">License Key</p>
                        <h2 style="color: #333; margin: 5px 0 15px 0; font-family: monospace; font-size: 24px; letter-spacing: 2px;">${licenseKeyToUpdate}</h2>
                        
                        <div style="display: flex; justify-content: center; gap: 20px; margin-top: 15px;">
                            <span style="background: #fff; padding: 5px 15px; border-radius: 20px; border: 1px solid #ddd; font-size: 14px;">Credits: <strong>50</strong></span>
                            <span style="background: #fff; padding: 5px 15px; border-radius: 20px; border: 1px solid #ddd; font-size: 14px;">Duration: <strong>3 Days</strong></span>
                        </div>
                    </div>

                    <p style="text-align: center; color: #555; margin-bottom: 20px;">Download the software and start automating your workflow.</p>
                    
                    <div style="text-align: center; margin-bottom: 30px;">
                        <a href="${softwareLink}" style="background: linear-gradient(90deg, #A073EE 0%, #6E25ED 100%); color: white; padding: 15px 35px; text-decoration: none; border-radius: 50px; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 4px 15px rgba(110, 37, 237, 0.3); transition: transform 0.2s;">
                            Download Software
                        </a>
                    </div>
                    
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                    <p style="text-align: center; color: #999; font-size: 12px;">&copy; Meta Injector Team</p>
                </div>
            `
        };

        try {
            await transporter.sendMail(mailOptions);
        } catch (emailError) {
            console.error("Email sending failed:", emailError);
        }

        // ৩. সাকসেস মেসেজ রিটার্ন
        return { 
            statusCode: 200, 
            body: JSON.stringify({ 
                status: "success",
                message: "Registration Successful! Please check your email for the License Key & Download Link." 
            }) 
        };
    }

    // ==========================================
    // PAID PACKAGE LOGIC
    // ==========================================
    
    const priceMap = {
        "Starter": 150, "Beginner": 200, 
        "Professional": 400, "Ultimate": 700, 
        "Corporate": 1000, "Enterprise": 1700
    };
    const officialPrice = priceMap[data.Package] || 0;

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
