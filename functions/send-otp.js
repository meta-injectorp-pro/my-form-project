const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

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

// 👇 এখানে Brevo এর SMTP ডিটেইলস বসানো হয়েছে
const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    auth: { 
        user: process.env.BREVO_LOGIN, 
        pass: process.env.BREVO_PASSWORD 
    }
});

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

    // 🛡️ [NEW] Gmail Security: Block Plus (+) alias and excessive dots
    if (domainPart === 'gmail.com') {
        if (userPart.includes('+')) {
            return { valid: false, reason: "Plus (+) aliases are not allowed." };
        }
        const dotCount = (userPart.match(/\./g) || []).length;
        if (dotCount > 2) {
            return { valid: false, reason: "Suspicious email format. Too many dots." };
        }
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

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

    const { email, name } = JSON.parse(event.body);
  
    const emailCheck = isValidEmail(email);
    if (!emailCheck.valid) {
        return { statusCode: 400, body: JSON.stringify({ error: emailCheck.reason }) };
    }

    try {
        // ১. চেক করা যে এই ইমেইল দিয়ে আগে ট্রায়াল নেওয়া হয়েছে কি না!
        const existingUser = await db.collection("licenseDatabase").where("Email", "==", email).get();
        if (!existingUser.empty) {
            return { statusCode: 400, body: JSON.stringify({ error: "Email already exists in database! Please upgrade your plan." }) };
        }

        // ২. ৬ ডিজিটের র‍্যান্ডম OTP তৈরি করা
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // ৩. ডাটাবেসে OTP সেভ করা (১০ মিনিট পর এক্সপায়ার হবে)
        await db.collection("OTP_Verifications").doc(email).set({
            otp: otp,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt: Date.now() + 10 * 60 * 1000 // 10 Minutes
        });

        // ৪. ইউজারের ইমেইলে প্রফেশনাল ডার্ক-থিম OTP পাঠানো
        const mailOptions = {
            // 👇 এখানেও from address এ Brevo এর মেইল বসানো হয়েছে
            from: `"Meta Injector ᴾʳᵒ" <${process.env.BREVO_LOGIN}>`,
            to: email,
            subject: '🔒 Your Free Trial Verification Code',
            html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap');</style>
            </head>
            <body style="margin:0; padding:0; background-color:#f3f4f6; font-family: 'Plus Jakarta Sans', Arial, sans-serif;">
                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f3f4f6; padding: 40px 0;">
                    <tr>
                        <td align="center">
                            <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color:#0F0A1E; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.15);">
                                <tr>
                                    <td align="center" style="padding: 40px 40px 20px;">
                                        <h1 style="color:#ffffff; margin:0; font-size: 24px;">Meta Injector <span style="color:#A073EE;">Pro</span></h1>
                                    </td>
                                </tr>
                                <tr>
                                    <td align="center" style="padding: 0 40px;">
                                        <h2 style="color:#ffffff; margin:0 0 10px; font-size: 24px;">Verify Your Email</h2>
                                        <p style="color:#9ca3af; margin:0; font-size: 15px; line-height: 1.6;">Hello <strong>${name}</strong>,<br>Use the 6-digit security code below to activate your Free Trial.</p>
                                    </td>
                                </tr>
                                <tr>
                                    <td align="center" style="padding: 30px 40px;">
                                        <div style="background: rgba(255,255,255,0.05); border: 1px dashed #A073EE; border-radius: 15px; padding: 25px; display: inline-block;">
                                            <p style="color:#9ca3af; font-size: 12px; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 15px;">Verification Code</p>
                                            <h1 style="color:#A073EE; font-size: 42px; letter-spacing: 8px; margin: 0; font-family: monospace;">${otp}</h1>
                                        </div>
                                    </td>
                                </tr>
                                <tr>
                                    <td align="center" style="padding: 0 40px 40px;">
                                        <p style="color:#ef4444; font-size: 13px; background: rgba(239, 68, 68, 0.1); padding: 10px 20px; border-radius: 8px; display:inline-block; margin: 0;">
                                            ⏱ This code will expire in <b>10 minutes</b>.
                                        </p>
                                    </td>
                                </tr>
                            </table>
                            <p style="color:#6b7280; font-size: 12px; margin-top:20px;">&copy; 2026 Meta Injector Pro. All rights reserved.</p>
                        </td>
                    </tr>
                </table>
            </body>
            </html>`
        };

        await transporter.sendMail(mailOptions);

        return { statusCode: 200, body: JSON.stringify({ message: "OTP sent successfully" }) };

    } catch (error) {
        console.error("Email send error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: "Server Error. Try again later." }) };
    }
};
