const admin = require('firebase-admin');
const Busboy = require('busboy');
const nodemailer = require('nodemailer');

// Firebase Config (Netlify 4KB limit fix)
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

// Email Transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.SMTP_EMAIL, 
        pass: process.env.SMTP_PASSWORD 
    }
});

// Helper Function
function parseMultipartForm(event) {
    return new Promise((resolve) => {
        const fields = {};
        const busboy = Busboy({ headers: event.headers });
        busboy.on('field', (fieldname, val) => fields[fieldname] = val);
        busboy.on('finish', () => resolve({ fields }));
        busboy.end(Buffer.from(event.body, 'base64'));
    });
}

// Package Rules (Credits, Duration & Price Map)
const packageRules = {
    "Free Trial":   { credits: 50,    duration: 3,   price: 0 },
    "Starter":      { credits: 2000,  duration: 30,  price: 150 },
    "Beginner":     { credits: 3500,  duration: 30,  price: 200 },
    "Professional": { credits: 6000,  duration: 60,  price: 400 },
    "Ultimate":     { credits: 10000, duration: 90,  price: 700 },
    "Corporate":    { credits: 20000, duration: 180, price: 1000 },
    "Enterprise":   { credits: 35000, duration: 365, price: 1700 }
};

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
        // পুরাতন ইউজার (Free Trial থেকে Paid এ আসছে বা Renew করছে)
        isNewUser = false;
        const userDoc = userSnapshot.docs[0];
        userData = userDoc.data();
        licenseKeyToUpdate = userDoc.id;
    } else {
        // একদম নতুন ইউজার
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

    // ২. প্যাকেজ ডিটেইলস বের করা
    const selectedPkg = packageRules[data.Package] || { credits: 0, duration: 0, price: 0 };
    
    // ৩. রুলস চেকিং (শুধুমাত্র Free Trial এর জন্য)
    if (!isNewUser && data.Package === 'Free Trial') {
        if (userData.Package) {
            return { 
                statusCode: 400, 
                body: JSON.stringify({ message: "You have already used the Free Trial or have an active plan." }) 
            };
        }
    }

    // ==========================================
    // FREE TRIAL LOGIC
    // ==========================================
    if (data.Package === "Free Trial") {
        
        // Update License Database
        const licenseUpdateData = {
            "Email": data.Email,
            "Customer Name": data.FullName,
            "Phone Number": data.Phone,
            "Package": "Free Trial",
            "Duration": selectedPkg.duration,
            "Credits": selectedPkg.credits,
            "Status": "Sent", // Active immediately
            "RequestDate": new Date()
        };
        
        await db.collection('licenseDatabase').doc(licenseKeyToUpdate).update(licenseUpdateData);

// ==========================================
        // TELEGRAM NOTIFICATION (FREE TRIAL)
        // ==========================================
        try {
            const botToken = "8569188310:AAG_3n41JwtI5_1OL3i4FiXUjgrJTDtwtd4"; 
            const chatId = "6276804742"; 

            const msg = `🚀 *New Free Trial Activated!*

👤 Name: ${data.FullName}
📧 Email: ${data.Email}
📱 Phone: \`${data.Phone}\`
🔑 License: \`${licenseKeyToUpdate}\`

User is now Active.`;

            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'Markdown' })
            });
        } catch (e) { console.error("Telegram Error:", e); }
        // 👆 টেলিগ্রাম কোড শেষ 👆

        // Send Email (Free Trial)
        const softwareLink = process.env.SOFTWARE_LINK || "#";
        const mailOptions = {
            from: `"Meta Injector Team" <${process.env.SMTP_EMAIL}>`,
            to: data.Email,
            subject: '🎉 Your Free Trial Activated',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #6E25ED;">Free Trial Activated!</h2>
                    <p>Hi <strong>${data.FullName}</strong>,</p>
                    <p>Your license key is ready to use.</p>
                    <div style="background: #f4f4f4; padding: 15px; border-radius: 5px; margin: 20px 0;">
                        <p><strong>License Key:</strong> <code>${licenseKeyToUpdate}</code></p>
                        <p><strong>Credits:</strong> ${selectedPkg.credits}</p>
                    </div>
                    <a href="${softwareLink}" style="background: #6E25ED; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Download Software</a>
                </div>
            `
        };
        try { await transporter.sendMail(mailOptions); } catch (e) { console.error(e); }

        return { 
            statusCode: 200, 
            body: JSON.stringify({ 
                status: "success",
                message: "Registration Successful! Check email for License Key." 
            }) 
        };
    }

    // ==========================================
    // PAID PACKAGE LOGIC (Migration/New Purchase)
    // ==========================================
    
    // ১. Purchase Form-এ ডাটা অ্যাড করা (Credits সহ)
    const purchaseData = {
        "Your Full Name": data.FullName,
        "Email": data.Email,
        "Phone Number": data.Phone,
        "Select Your Package": data.Package,
        "Package Duration": selectedPkg.duration,  // Duration (e.g., 30)
        "Assigned Credits": selectedPkg.credits,   // Credits (e.g., 2000)
        "Payment Method": data.PaymentMethod || "N/A",
        "Amount Sent (BDT)": selectedPkg.price.toString(),
        "Sender's Number or TrxID": data.SenderInfo || "N/A",
        "License Key": licenseKeyToUpdate, 
        "Status": "Pending",
        "Timestamp": new Date(),
        "UserStatus": isNewUser ? "New User" : "Existing User"
    };

    await db.collection('purchaseForm').add(purchaseData);
    
    // ২. License Database Overwrite/Update (Pending Status সহ)
    // এখানে আমরা ক্রেডিটস এবং ডিউরেশন আপডেট করে দিচ্ছি, কিন্তু স্ট্যাটাস 'Pending' রাখছি।
    // সফটওয়্যার 'Pending' স্ট্যাটাস দেখলে লগইন করতে দিবে না বা ক্রেডিট ইউজ করতে দিবে না (আপনার সফটওয়্যার লজিক অনুযায়ী)।
    const licenseUpdateData = {
        "Email": data.Email,
        "Customer Name": data.FullName,
        "Phone Number": data.Phone,
        "Package": data.Package,
        "Duration": selectedPkg.duration,
        "Credits": selectedPkg.credits, // Credits সেট হয়ে থাকল
        "Status": "Pending",            // কিন্তু স্ট্যাটাস পেন্ডিং
        "RequestDate": new Date()
    };
    
    await db.collection('licenseDatabase').doc(licenseKeyToUpdate).update(licenseUpdateData);

// 👇 এখানে টেলিগ্রাম কোড বসান 👇
    // ==========================================
    // TELEGRAM NOTIFICATION (NEW PURCHASE)
    // ==========================================
    try {
        const botToken = "8569188310:AAG_3n41JwtI5_1OL3i4FiXUjgrJTDtwtd4"; 
        const chatId = "6276804742"; 

        const msg = `💰 *New Package Purchase!*

📦 Package: *${data.Package}*
👤 Name: ${data.FullName}
📱 Phone: \`${data.Phone}\`
💵 Amount: ${selectedPkg.price} BDT
💳 Method: ${data.PaymentMethod || "N/A"}
📝 TrxID: \`${data.SenderInfo || "N/A"}\`
🔑 License: \`${licenseKeyToUpdate}\`

Check Admin Panel to Approve.`;

        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'Markdown' })
        });
    } catch (e) { console.error("Telegram Error:", e); }
    // 👆 টেলিগ্রাম কোড শেষ 👆

    // ৩. Paid User Email Notification
    const mailOptions = {
        from: `"Meta Injector Team" <${process.env.SMTP_EMAIL}>`,
        to: data.Email,
        subject: '⏳ Order Received - Pending Approval',
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #FF9900;">Order Received!</h2>
                <p>Hi <strong>${data.FullName}</strong>,</p>
                <p>We have received your payment request for the <strong>${data.Package}</strong> plan.</p>
                
                <div style="background: #fff8e1; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #FF9900;">
                    <p style="margin: 5px 0;"><strong>License Key:</strong> <code>${licenseKeyToUpdate}</code></p>
                    <p style="margin: 5px 0;"><strong>Package:</strong> ${data.Package}</p>
                    <p style="margin: 5px 0;"><strong>Credits:</strong> ${selectedPkg.credits}</p>
                    <p style="margin: 5px 0;"><strong>Status:</strong> <span style="color: #FF9900; font-weight: bold;">Pending Approval</span></p>
                </div>

                <p>Your license will be activated shortly after we verify the transaction ID: <strong>${data.SenderInfo || "N/A"}</strong>.</p>
                <p style="color: #666; font-size: 12px;">You will receive another email once activated.</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
    } catch (emailError) {
        console.error("Email sending failed:", emailError);
    }

    return { 
        statusCode: 200, 
        body: JSON.stringify({ 
            status: "success",
            message: "Purchase request submitted! Check your email for details."
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