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

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.SMTP_EMAIL, pass: process.env.SMTP_PASSWORD }
});

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

    const { email, name } = JSON.parse(event.body);

    try {
        // ১. চেক করা যে এই ইমেইল দিয়ে আগে ট্রায়াল নেওয়া হয়েছে কি না!
        const existingUser = await db.collection("licenseDatabase").where("Email", "==", email).get();
        if (!existingUser.empty) {
            return { statusCode: 400, body: JSON.stringify({ error: "Email already exists in database! Please upgrade your plan." }) };
        }

        // ২. ৬ ডিজিটের র‍্যান্ডম OTP তৈরি করা
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // ৩. ডাটাবেসে OTP সেভ করা (১০ মিনিট পর এক্সপায়ার হবে)
        await db.collection("OTP_Verifications").doc(email).set({
            otp: otp,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt: Date.now() + 10 * 60 * 1000 // 10 Minutes
        });

        // ৪. ইউজারের ইমেইলে OTP পাঠানো
        const mailOptions = {
            from: `"Meta Injector Pro" <${process.env.SMTP_EMAIL}>`,
            to: email,
            subject: 'Your Free Trial Verification Code',
            html: `
            <div style="font-family: Arial; padding: 20px; text-align: center;">
                <h2>Hello ${name},</h2>
                <p>Use the following 6-digit code to verify your email and start your Free Trial:</p>
                <div style="background: #f4f4f4; padding: 20px; border-radius: 10px; display: inline-block;">
                    <h1 style="color: #A073EE; font-size: 36px; letter-spacing: 5px; margin: 0;">${otp}</h1>
                </div>
                <p style="color: #666; margin-top: 20px;">This code will expire in 10 minutes.</p>
            </div>`
        };

        await transporter.sendMail(mailOptions);

        return { statusCode: 200, body: JSON.stringify({ message: "OTP sent successfully" }) };

    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: "Server Error. Try again later." }) };
    }
};
