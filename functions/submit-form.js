const admin = require('firebase-admin');
const Busboy = require('busboy');
const nodemailer = require('nodemailer');
const fetch = require('node-fetch');

// Firebase Config
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
} catch (e) { console.error('Firebase init error', e); }

const db = admin.firestore();

// Email Transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.SMTP_EMAIL, pass: process.env.SMTP_PASSWORD }
});

// Helper: Parse Form
function parseMultipartForm(event) {
    return new Promise((resolve) => {
        const fields = {};
        const busboy = Busboy({ headers: event.headers });
        busboy.on('field', (fieldname, val) => fields[fieldname] = val);
        busboy.on('finish', () => resolve({ fields }));
        busboy.end(Buffer.from(event.body, 'base64'));
    });
}

// Helper: Date Formatter
function formatCustomDate(date) {
    const d = new Date(date);
    const pad = (n) => n.toString().padStart(2, '0');
    return `${pad(d.getDate())}-${pad(d.getMonth()+1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// Helper: Get Bangladesh Time
function getBDTime() {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    return new Date(utc + (3600000 * 6));
}

const packageRules = {
    "Free Trial":   { credits: 100,    duration: 3,   price: 0 },
    "Starter":      { credits: 2000,  duration: 30,  price: 150 },
    "Beginner":     { credits: 3500,  duration: 30,  price: 200 },
    "Professional": { credits: 6000,  duration: 60,  price: 400 },
    "Ultimate":     { credits: 10000, duration: 90,  price: 700 },
    "Corporate":    { credits: 20000, duration: 180, price: 1000 },
    "Enterprise":   { credits: 35000, duration: 365, price: 1700 }
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  try {
    const { fields } = await parseMultipartForm(event);
    const data = fields;
    
    // Time Calculations
    const bdNow = getBDTime();
    const selectedPkg = packageRules[data.Package] || { credits: 0, duration: 0, price: 0 };
    const bdExpiry = new Date(bdNow);
    bdExpiry.setDate(bdNow.getDate() + (selectedPkg.duration || 3));

    // User Check
    const userSnapshot = await db.collection('licenseDatabase')
                                 .where('Email', '==', data.Email)
                                 .limit(1).get();

    let isNewUser = true;
    let licenseKeyToUpdate;

    if (!userSnapshot.empty) {
        isNewUser = false;
        const userDoc = userSnapshot.docs[0];
        const userData = userDoc.data();
        licenseKeyToUpdate = userDoc.id;

        // Restriction: Paid users cannot buy/verify another plan here (must use topup)
        if (userData.Package && userData.Package !== "Free Trial" && userData.Package !== "N/A") {
             return {
                 statusCode: 409, 
                 body: JSON.stringify({
                     status: "error",
                     errorType: "ACTIVE_PLAN",
                     message: "You already have an active paid plan. Please purchase credits instead."
                 })
             };
        }
        
        // Restriction: Cannot take Free Trial twice
        if (data.Package === 'Free Trial') {
            return { statusCode: 400, body: JSON.stringify({ message: "You have already used the Free Trial." }) };
        }

    } else {
        // New User: Get Free License Key
        const freeLicenseSnapshot = await db.collection('licenseDatabase')
                                            .where('Email', 'in', ["", null])
                                            .limit(1).get();     
        if (freeLicenseSnapshot.empty) {
            return { statusCode: 500, body: JSON.stringify({ message: "Stock Out! No license keys available." }) };
        }
        licenseKeyToUpdate = freeLicenseSnapshot.docs[0].id;
    }

    let licenseUpdateData = {};
    let purchaseFormData = null;
    let emailSubject = "";
    let telegramMsg = "";

    if (data.Package === "Free Trial") {
        // --- FREE TRIAL DATA ---
        licenseUpdateData = {
            "Email": data.Email,
            "Customer Name": data.FullName,
            "Phone Number": data.Phone,
            "Package": "Free Trial",
            "Duration": selectedPkg.duration,
            "Credits": selectedPkg.credits,
            "Status": "Sent",
            "RequestDate": bdNow,
            "Activation Date": formatCustomDate(bdNow),
            "Expiry Date": formatCustomDate(bdExpiry),
            "License Key": licenseKeyToUpdate
        };

        emailSubject = '🎉 Your Meta Injector ᴾʳᵒ Free Trial is Ready';
        
        telegramMsg = `🚀 <b>New Free Trial Registered!</b>

👤 Name: ${data.FullName}
📧 Email: ${data.Email}
📱 Phone: <code>${data.Phone}</code>
🔑 License: <code>${licenseKeyToUpdate}</code>
📅 Activation: ${formatCustomDate(bdNow)}
⏳ Expiry: ${formatCustomDate(bdExpiry)}

New Free User is now Registered.`;

    } else {
        // --- PAID PURCHASE DATA ---
        const finalAmount = data.AmountSent || selectedPkg.price.toString();
        const promoCode = data.CouponCode || "N/A";
        
        // Bonus Logic: Add 500 credits if code is BONUS500
        let finalCredits = selectedPkg.credits;
        if (promoCode === "BONUS500") {
            finalCredits += 500; 
        }

        purchaseFormData = {
            "Your Full Name": data.FullName,
            "Email": data.Email,
            "Phone Number": data.Phone,
            "Select Your Package": data.Package,
            "Package Duration": selectedPkg.duration,
            "Assigned Credits": finalCredits, // Credits with Bonus
            "Payment Method": data.PaymentMethod || "N/A",
            "Amount Sent (BDT)": finalAmount,
            "Promo Code": promoCode,
            "Sender's Number or TrxID": data.SenderInfo || "N/A",
            "License Key": licenseKeyToUpdate, 
            "Status": "Pending",
            "Timestamp": formatCustomDate(bdNow),
            "UserStatus": isNewUser ? "New User" : "Existing User"
        };

        licenseUpdateData = {
            "Email": data.Email,
            "Customer Name": data.FullName,
            "Phone Number": data.Phone,
            "Package": data.Package,
            "Duration": selectedPkg.duration,
            "Credits": finalCredits, // Credits with Bonus
            "Status": "Pending", 
            "RequestDate": bdNow 
        };

        emailSubject = 'Meta Injector ᴾʳᵒ Purchase ⏳ Order Received';
        
        telegramMsg = `💰 <b>New Package Purchase!</b>

📦 Package: <b>${data.Package}</b>
👤 Name: ${data.FullName}
📱 Phone: <code>${data.Phone}</code>
💵 Amount: ${finalAmount} BDT
💎 Credits: ${finalCredits}
🎫 Promo: ${promoCode}
💳 Method: ${data.PaymentMethod || "N/A"}
📝 TrxID: <code>${data.SenderInfo || "N/A"}</code>
🔑 License: <code>${licenseKeyToUpdate}</code>

Check Admin Panel to Approve.`;
    }

    // Database Updates
    const batch = db.batch();
    
    const licenseRef = db.collection('licenseDatabase').doc(licenseKeyToUpdate);
    batch.update(licenseRef, licenseUpdateData);

    if (purchaseFormData) {
        const purchaseRef = db.collection('purchaseForm').doc();
        batch.set(purchaseRef, purchaseFormData);
    }

    await batch.commit();

    // Send Telegram
    try {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;
        
        if(botToken && chatId) {
            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: telegramMsg, parse_mode: 'HTML' })
            });
        }
    } catch (e) { console.error("Telegram Error:", e.message); }

    // Send Email
    try {
        const softwareLink = process.env.SOFTWARE_LINK || "#";
        const isFree = data.Package === "Free Trial";
        
        const badgeHTML = isFree 
            ? `<h2 style="color:#ffffff; margin:0 0 10px; font-size: 28px;">Free Trial <span style="color:#A073EE;">Activated!</span> 🚀</h2>`
            : `<span style="background: rgba(255, 153, 0, 0.1); color: #FF9900; border: 1px solid rgba(255, 153, 0, 0.3); padding: 8px 16px; border-radius: 30px; font-size: 12px; font-weight: bold; letter-spacing: 1px; text-transform: uppercase;">Payment Pending</span>
               <h2 style="color:#ffffff; margin:15px 0 10px; font-size: 26px;">Order Received!</h2>`;

        // Calculate credits to show in email (Base + Bonus if applicable)
        const displayCredits = isFree ? selectedPkg.credits : (purchaseFormData["Assigned Credits"]);

        const detailsHTML = `
            <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background: rgba(255,255,255,0.03); border-radius: 15px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1);">
                <tr>
                    <td style="padding: 15px 20px; border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <p style="color:#9ca3af; font-size: 12px; margin:0;">License Key</p>
                        <p style="color:#fff; font-family: monospace; font-size: 14px; margin:5px 0 0;">${licenseKeyToUpdate}</p>
                    </td>
                    <td style="padding: 15px 20px; border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <p style="color:#9ca3af; font-size: 12px; margin:0;">Duration</p>
                        <p style="color:#fff; font-size: 14px; font-weight:bold; margin:5px 0 0;">${selectedPkg.duration} Days</p>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 15px 20px; border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <p style="color:#9ca3af; font-size: 12px; margin:0;">Credits</p>
                        <p style="color:#fff; font-size: 14px; font-weight:bold; margin:5px 0 0;">${displayCredits}</p>
                    </td>
                    <td style="padding: 15px 20px; border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <p style="color:#9ca3af; font-size: 12px; margin:0;">Amount Sent</p>
                        <p style="color:#A073EE; font-size: 14px; font-weight:bold; margin:5px 0 0;">${isFree ? 0 : purchaseFormData["Amount Sent (BDT)"]} BDT</p>
                    </td>
                </tr>
                ${!isFree ? `
                <tr>
                    <td colspan="2" style="padding: 15px 20px;">
                        <p style="color:#9ca3af; font-size: 12px; margin:0;">TrxID / Sender</p>
                        <p style="color:#fff; font-size: 14px; margin:5px 0 0;">${data.SenderInfo || "N/A"}</p>
                    </td>
                </tr>` : ''}
            </table>`;

        const finalHtml = `
        <!DOCTYPE html><html><head><style>@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap');</style></head>
        <body style="margin:0; padding:0; background-color:#f3f4f6; font-family: 'Plus Jakarta Sans', Arial, sans-serif;">
            <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f3f4f6; padding: 40px 0;">
                <tr><td align="center">
                    <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color:#0F0A1E; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.15);">
                        <tr><td align="center" style="padding: 40px 40px 20px;"><h1 style="color:#ffffff; margin:0; font-size: 24px;">Meta Injector <span style="color:#A073EE;">Pro</span></h1></td></tr>
                        <tr><td align="center" style="padding: 0 40px;">
                            ${badgeHTML}
                            <p style="color:#9ca3af; margin:0; font-size: 16px; line-height: 1.5;">Hello <strong>${data.FullName}</strong>.</p>
                        </td></tr>
                        <tr><td style="padding: 30px 40px;">${detailsHTML}</td></tr>
                        <tr><td align="center" style="padding: 0 40px 40px;">
                            ${isFree 
                                ? `<a href="${softwareLink}" style="background: linear-gradient(90deg, #A073EE 0%, #6E25ED 100%); color: #ffffff; text-decoration: none; padding: 14px 30px; border-radius: 50px; font-weight: bold; font-size: 16px; display: inline-block;">Download Software</a>` 
                                : `<p style="color:#666; font-size: 13px; background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; display:inline-block;">⏱ License activates after admin verification.</p>`
                            }
                        </td></tr>
                    </table>
                    <p style="color:#6b7280; font-size: 12px; margin-top:20px;">&copy; 2026 Meta Injector Pro. All rights reserved.</p>
                </td></tr>
            </table>
        </body></html>`;

        await transporter.sendMail({
            from: `"Meta Injector ᴾʳᵒ" <${process.env.SMTP_EMAIL}>`,
            to: data.Email,
            subject: emailSubject,
            html: finalHtml
        });

    } catch (e) { console.error("Email Error:", e.message); }

    return { 
        statusCode: 200, 
        body: JSON.stringify({ 
            status: "success", 
            message: "Request processed successfully!" 
        }) 
    };

  } catch (error) {
    console.error("Server Error:", error);
    return { statusCode: 500, body: JSON.stringify({ message: "Server Error: " + error.message }) };
  }
};