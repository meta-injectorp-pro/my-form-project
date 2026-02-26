const admin = require('firebase-admin');
const Busboy = require('busboy');
const nodemailer = require('nodemailer');
const fetch = require('node-fetch');

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

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.SMTP_EMAIL, pass: process.env.SMTP_PASSWORD }
});

function parseMultipartForm(event) {
    return new Promise((resolve, reject) => {
        const fields = {};
        // 👇 এখানে লিমিট বসানো হয়েছে (যাতে কেউ বড় ডাটা পাঠিয়ে সার্ভার ডাউন করতে না পারে)
        const busboy = Busboy({ 
            headers: event.headers,
            limits: { fileSize: 0, fieldSize: 5000 } // ফিল্ডের সাইজ সর্বোচ্চ 5KB
        });
        
        busboy.on('field', (fieldname, val) => fields[fieldname] = val);
        busboy.on('finish', () => resolve({ fields }));
        busboy.on('error', (err) => reject(err));
        
        busboy.end(Buffer.from(event.body, 'base64'));
    });
}

function formatCustomDate(date) {
    const d = new Date(date);
    const pad = (n) => n.toString().padStart(2, '0');
    return `${pad(d.getDate())}-${pad(d.getMonth()+1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function getBDTime() {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    return new Date(utc + (3600000 * 6));
}

// 🛡️ SECURITY FUNCTION FOR EMAIL VALIDATION
function isValidEmail(email) {
    if (!email) return { valid: false, reason: "Email is required." };
    
    const emailLower = email.toLowerCase().trim();
    const [userPart, domainPart] = emailLower.split('@');

    const allowedDomains = ['gmail.com', 'yahoo.com'];
    if (!allowedDomains.includes(domainPart)) {
        return { valid: false, reason: "Only valid email allowed." };
    }

    if (userPart.length < 4) {
        return { valid: false, reason: "Invalid email format. Username is too short." };
    }

    const blockedWords = ['test', 'fake', 'demo', 'temp', 'admin', 'info', '123', 'user', 'qwerty', 'asdf'];

    if (blockedWords.some(word => userPart.includes(word))) {
        return { valid: false, reason: "Please use your real personal email address." };
    }

    if (/^\d+$/.test(userPart)) {
        return { valid: false, reason: "Email cannot consist only of numbers." };
    }

    return { valid: true };
}

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
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  try {
    const { fields } = await parseMultipartForm(event);
    const data = fields;

	// ==========================================
    // 🛡️ Email validation run check
    // ==========================================
    const emailCheck = isValidEmail(data.Email);
    if (!emailCheck.valid) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                status: "error",
                message: emailCheck.reason
            })
        };
    }

    const userSnapshot = await db.collection('licenseDatabase')
                                 .where('Email', '==', data.Email)
                                 .limit(1).get();

    let isNewUser = true;
    let userData = null;
    let licenseKeyToUpdate;

    if (!userSnapshot.empty) {
        isNewUser = false;
        const userDoc = userSnapshot.docs[0];
        userData = userDoc.data();
        licenseKeyToUpdate = userDoc.id;

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
    } else {

        const freeLicenseSnapshot = await db.collection('licenseDatabase')
                                            .where('Email', 'in', ["", null])
                                            .limit(1).get();     
        if (freeLicenseSnapshot.empty) {
            return { statusCode: 500, body: JSON.stringify({ message: "Stock Out! No license keys available." }) };
        }
        licenseKeyToUpdate = freeLicenseSnapshot.docs[0].id;
    }

    const selectedPkg = packageRules[data.Package] || { credits: 0, duration: 0, price: 0 };

    if (!isNewUser && data.Package === 'Free Trial') {
        return { statusCode: 400, body: JSON.stringify({ message: "You have already used the Free Trial or have an active plan." }) };
    }

    // ==========================================
    // FREE TRIAL LOGIC & OTP VERIFICATION
    // ==========================================
    if (data.Package === "Free Trial") {
        
        // 👇👇 [নতুন OTP ভেরিফিকেশন কোড শুরু] 👇👇
        const userOTP = data.OTP;
        if (!userOTP) {
            return { statusCode: 400, body: JSON.stringify({ error: "Verification code is required." }) };
        }

        // ডাটাবেস থেকে আসল OTP খুঁজে বের করা
        const otpDoc = await db.collection("OTP_Verifications").doc(data.Email).get();
        
        if (!otpDoc.exists || otpDoc.data().otp !== userOTP) {
            return { statusCode: 400, body: JSON.stringify({ error: "Invalid Verification Code!" }) };
        }
        
        if (Date.now() > otpDoc.data().expiresAt) {
            return { statusCode: 400, body: JSON.stringify({ error: "Code expired. Please close popup and try again." }) };
        }

        // OTP সঠিক হলে এটি ডিলিট করে দিন (যাতে আবার ইউজ করতে না পারে)
        await db.collection("OTP_Verifications").doc(data.Email).delete();
        // 👆👆 [নতুন OTP ভেরিফিকেশন কোড শেষ] 👆👆
        
        const bdNow = getBDTime(); 
        const bdExpiry = new Date(bdNow); 
        bdExpiry.setDate(bdNow.getDate() + (selectedPkg.duration || 3));

        const licenseUpdateData = {
            "Email": data.Email,
            "Customer Name": data.FullName,
            "Phone Number": data.Phone,
            "Package": "Free Trial",
            "Duration": selectedPkg.duration,
            "Credits": selectedPkg.credits,
            "Status": "Active",
            "RequestDate": bdNow, 
            "Activation Date": formatCustomDate(bdNow),
            "Expiry Date": formatCustomDate(bdExpiry),
            "License Key": licenseKeyToUpdate
        };

		// 👇 [নতুন] অ্যাফিলিয়েট ডাটা সেভ করার কোড
        if (data.ReferredBy && data.ReferredBy !== "None") {
            licenseUpdateData["ReferredBy"] = data.ReferredBy;
        }
		
        await db.collection('licenseDatabase').doc(licenseKeyToUpdate).update(licenseUpdateData);

        // Telegram Notification (HTML Mode)
        try {
            const botToken = process.env.TELEGRAM_BOT_TOKEN;
			const chatId = process.env.TELEGRAM_CHAT_ID; 
            if(botToken && chatId) {
				let refInfo = (data.ReferredBy && data.ReferredBy !== "None") ? `🔗 Referral: <code>${data.ReferredBy}</code>\n` : "";
                const msg = `🚀 <b>New Free Trial Registered!</b>

👤 Name: ${data.FullName}
📧 Email: ${data.Email}
📱 Phone: <code>${data.Phone}</code>
🔑 License: <code>${licenseKeyToUpdate}</code>
📅 Activation: ${formatCustomDate(bdNow)}
⏳ Expiry: ${formatCustomDate(bdExpiry)}
${refInfo}

New Free User is now Registered.`;
                await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'HTML' })
                });
            }
        } catch (e) { console.error("Telegram Error:", e); }

        const softwareLink = process.env.SOFTWARE_LINK || "#";
        
        // EMAIL NOTIFICATION (FREE TRIAL)
        const mailOptions = {
            from: `"Meta Injector ᴾʳᵒ" <${process.env.SMTP_EMAIL}>`,
            to: data.Email,
            subject: '🎉 Your Meta Injector ᴾʳᵒ Free Trial is Ready',
            html: `
            <!DOCTYPE html><html><head><style>@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap');</style></head>
            <body style="margin:0; padding:0; background-color:#f3f4f6; font-family: 'Plus Jakarta Sans', Arial, sans-serif;">
                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f3f4f6; padding: 40px 0;">
                    <tr><td align="center">
                            <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color:#0F0A1E; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.15);">
                                <tr><td align="center" style="padding: 40px 40px 20px;"><h1 style="color:#ffffff; margin:0; font-size: 24px;">Welcome to Meta Injector <span style="color:#A073EE;">Pro</span></h1></td></tr>
                                <tr><td align="center" style="padding: 0 40px;"><h2 style="color:#ffffff; margin:0 0 10px; font-size: 28px;">Free Trial <span style="color:#A073EE;">Activated!</span> 🚀</h2><p style="color:#9ca3af; margin:0; font-size: 16px; line-height: 1.5;">Hello <strong>${data.FullName}</strong>, your license is ready to use.</p></td></tr>
                                <tr><td style="padding: 30px 40px;"><table width="100%" border="0" cellspacing="0" cellpadding="0" style="background: #1a1625; border: 1px dashed #A073EE; border-radius: 15px;"><tr><td align="center" style="padding: 25px;"><p style="color:#9ca3af; font-size: 12px; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 10px;">Your License Key</p><code style="display:block; background:#0F0A1E; color:#fff; padding: 15px; border-radius: 8px; font-size: 18px; letter-spacing: 1px; border: 1px solid rgba(255,255,255,0.1); font-family: monospace;">${licenseKeyToUpdate}</code></td></tr></table></td></tr>
                                
                                <tr><td style="padding: 0 40px 30px;">
                                    <table width="100%" border="0" cellspacing="0" cellpadding="0">
                                        <tr>
                                            <td width="50%" style="padding-right: 10px;">
                                                <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1);">
                                                    <p style="color:#9ca3af; font-size: 12px; margin:0;">Credits</p>
                                                    <p style="color:#ffffff; font-size: 18px; font-weight: bold; margin: 5px 0 0;">${selectedPkg.credits}</p>
                                                </div>
                                            </td>
                                            <td width="50%" style="padding-left: 10px;">
                                                <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1);">
                                                    <p style="color:#9ca3af; font-size: 12px; margin:0;">Duration</p>
                                                    <p style="color:#ffffff; font-size: 18px; font-weight: bold; margin: 5px 0 0;">${selectedPkg.duration} Days</p>
                                                </div>
                                            </td>
                                        </tr>
                                    </table>
                                </td></tr>

                                <tr><td align="center" style="padding: 0 40px 40px;"><a href="${softwareLink}" style="background: linear-gradient(90deg, #A073EE 0%, #6E25ED 100%); color: #ffffff; text-decoration: none; padding: 14px 30px; border-radius: 50px; font-weight: bold; font-size: 16px; display: inline-block;">Download Software</a></td></tr>
                            </table>
                            <p style="color:#6b7280; font-size: 12px; margin-top:20px;">&copy; 2026 Meta Injector Pro. All rights reserved.</p>
                        </td></tr>
                </table></body></html>`
        };

        try { await transporter.sendMail(mailOptions); } catch (e) { console.error(e); }

        return { 
            statusCode: 200, 
            body: JSON.stringify({ status: "success", message: "Registration Successful! Check your email." }) 
        };
    }

    // ==========================================
    // PAID PURCHASE LOGIC
    // ==========================================

    const bdNow = getBDTime(); 

    const purchaseData = {
        "Your Full Name": data.FullName,
        "Email": data.Email,
        "Phone Number": data.Phone,
        "Select Your Package": data.Package,
        "Package Duration": selectedPkg.duration,
        "Assigned Credits": selectedPkg.credits,
        "Payment Method": data.PaymentMethod || "N/A",
        "Amount Sent (BDT)": selectedPkg.price.toString(),
        "Sender's Number or TrxID": data.SenderInfo || "N/A",
        "License Key": licenseKeyToUpdate, 
        "Status": "Pending",
        "Timestamp": formatCustomDate(bdNow),
        "UserStatus": isNewUser ? "New User" : "Existing User"
    };

	// 👇 [নতুন] Purchase ফর্মে অ্যাফিলিয়েট সেভ করা
    if (data.ReferredBy && data.ReferredBy !== "None") {
        purchaseData["ReferredBy"] = data.ReferredBy;
    }  

    await db.collection('purchaseForm').add(purchaseData);
    
    const licenseUpdateData = {
        "Email": data.Email,
        "Customer Name": data.FullName,
        "Phone Number": data.Phone,
        "Package": data.Package,
        "Duration": selectedPkg.duration,
        "Credits": selectedPkg.credits,
        "Status": "Pending", 
        "RequestDate": bdNow
    };

	// 👇 [নতুন] License ডাটাবেসে অ্যাফিলিয়েট সেভ করা
    if (data.ReferredBy && data.ReferredBy !== "None") {
        licenseUpdateData["ReferredBy"] = data.ReferredBy;
    }
	  
    await db.collection('licenseDatabase').doc(licenseKeyToUpdate).update(licenseUpdateData);

    // Telegram Notification (HTML Mode)
    try {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
		const chatId = process.env.TELEGRAM_CHAT_ID;
        if(botToken && chatId) {
			let refInfoPaid = (data.ReferredBy && data.ReferredBy !== "None") ? `🔗 Referral: <code>${data.ReferredBy}</code>\n` : "";
            const msg = `💰 <b>New Package Purchase!</b>

📦 Package: <b>${data.Package}</b>
👤 Name: ${data.FullName}
📱 Phone: <code>${data.Phone}</code>
💵 Amount: ${selectedPkg.price} BDT
💳 Method: ${data.PaymentMethod || "N/A"}
📝 TrxID: <code>${data.SenderInfo || "N/A"}</code>
🔑 License: <code>${licenseKeyToUpdate}</code>
${refInfoPaid}

Check Admin Panel to Approve.`;

            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'HTML' })
            });
        }
    } catch (e) { console.error("Telegram Error:", e); }

    // ... আগের কোড ...

    // EMAIL NOTIFICATION (PAID)
    
    // ১. এই লাইনটি যোগ করুন (লিংক পাওয়ার জন্য)
    const softwareLink = process.env.SOFTWARE_LINK || "#"; 

    const mailOptions = {
        from: `"Meta Injector ᴾʳᵒ" <${process.env.SMTP_EMAIL}>`,
        to: data.Email,
        subject: 'Meta Injector ᴾʳᵒ Purchase ⏳ Order Received - Pending for Approval',
        html: `
        <!DOCTYPE html><html><head><style>@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap');</style></head>
        <body style="margin:0; padding:0; background-color:#f3f4f6; font-family: 'Plus Jakarta Sans', Arial, sans-serif;">
            <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f3f4f6; padding: 40px 0;">
                <tr><td align="center">
                    <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color:#0F0A1E; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.15);">
                        <tr><td align="center" style="padding: 40px 40px 20px;"><h1 style="color:#ffffff; margin:0; font-size: 24px;">Meta Injector <span style="color:#A073EE;">Pro</span></h1></td></tr>
                        <tr><td align="center"><span style="background: rgba(255, 153, 0, 0.1); color: #FF9900; border: 1px solid rgba(255, 153, 0, 0.3); padding: 8px 16px; border-radius: 30px; font-size: 12px; font-weight: bold; letter-spacing: 1px; text-transform: uppercase;">Payment Pending</span></td></tr>
                        <tr><td align="center" style="padding: 20px 40px 0;"><h2 style="color:#ffffff; margin:0 0 10px; font-size: 26px;">Order Received!</h2><p style="color:#9ca3af; margin:0; font-size: 15px; line-height: 1.5;">Hi <strong>${data.FullName}</strong>, we received your request for the <strong>${data.Package}</strong> plan.</p></td></tr>
                        <tr><td style="padding: 30px 40px;"><table width="100%" border="0" cellspacing="0" cellpadding="0" style="background: rgba(255,255,255,0.03); border-radius: 15px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1);">
                            
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
                                    <p style="color:#fff; font-size: 14px; font-weight:bold; margin:5px 0 0;">${selectedPkg.credits}</p>
                                </td>
                                <td style="padding: 15px 20px; border-bottom: 1px solid rgba(255,255,255,0.05);">
                                    <p style="color:#9ca3af; font-size: 12px; margin:0;">Amount Sent</p>
                                    <p style="color:#A073EE; font-size: 14px; font-weight:bold; margin:5px 0 0;">${selectedPkg.price} BDT</p>
                                </td>
                            </tr>

                            <tr>
                                <td colspan="2" style="padding: 15px 20px;">
                                    <p style="color:#9ca3af; font-size: 12px; margin:0;">TrxID / Sender</p>
                                    <p style="color:#fff; font-size: 14px; margin:5px 0 0;">${data.SenderInfo || "N/A"}</p>
                                </td>
                            </tr>

                        </table></td></tr>

                        <tr><td align="center" style="padding: 0 40px 30px;"><a href="${softwareLink}" style="background: linear-gradient(90deg, #A073EE 0%, #6E25ED 100%); color: #ffffff; text-decoration: none; padding: 14px 30px; border-radius: 50px; font-weight: bold; font-size: 16px; display: inline-block;">Download Software</a></td></tr>

                        <tr><td align="center" style="padding: 0 40px 40px;"><p style="color:#666; font-size: 13px; background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; display:inline-block;">⏱ Your license will activate automatically after admin verification.</p></td></tr>
                    </table>
                    <p style="color:#6b7280; font-size: 12px; margin-top:20px;">&copy; 2026 Meta Injector Pro. All rights reserved.</p>
                </td></tr>
            </table>
        </body></html>`
    };

    try { await transporter.sendMail(mailOptions); } catch (e) { console.error(e); }

    return { 
        statusCode: 200, 
        body: JSON.stringify({ 
            status: "success", 
            message: "Purchase request submitted! Check your email.",
            licenseKey: licenseKeyToUpdate
        }) 
    };

  } catch (error) {
    console.error("Server Error:", error);
    return { statusCode: 500, body: JSON.stringify({ message: "Server Error: " + error.message }) };
  }
};
