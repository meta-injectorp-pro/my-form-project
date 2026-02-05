const { admin, db } = require("./firebase-admin");
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { 
        user: process.env.SMTP_EMAIL, 
        pass: process.env.SMTP_PASSWORD 
    }
});

// ইউনিক কোড জেনারেটর ফাংশন
async function generateUniqueAffiliateCode(firstName) {
    const namePart = firstName.substring(0, 3).toUpperCase().replace(/\s/g, 'X');
    let isUnique = false;
    let finalCode = "";

    while (!isUnique) {
        const numPart = Math.floor(100 + Math.random() * 900);
        finalCode = `${namePart}${numPart}`;
        const snapshot = await db.collection("Affiliate_Data").where("affiliateCode", "==", finalCode).get();
        if (snapshot.empty) isUnique = true;
    }
    return finalCode;
}

exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  const { firstName, lastName, email, phone, password, isMetaUser, metaUserDetail } = JSON.parse(event.body);
  const fullName = `${firstName} ${lastName}`;

  try {
    // ১. চেক করা যে এই ইমেইল দিয়ে অলরেডি কোনো অ্যাফিলিয়েট অ্যাকাউন্ট আছে কি না
    const existingUserCheck = await db.collection("Affiliate_Data").where("email", "==", email).get();
    
    if (!existingUserCheck.empty) {
      return { 
        statusCode: 400, 
        body: JSON.stringify({ error: "This email is already registered as an affiliate." }) 
      };
    }

    // ২. Firebase Auth এ ইউজার তৈরি করা
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      displayName: fullName
    });

    // ৩. ইউনিক কোড জেনারেট করা
    const uniqueCode = await generateUniqueAffiliateCode(firstName);

    // ৪. Firestore-এ ডেটা সেভ করা
    await db.collection("Affiliate_Data").doc(userRecord.uid).set({
      uid: userRecord.uid,
      firstName: firstName,
      lastName: lastName,
      name: fullName,
      email: email,
      phone: phone || "N/A",
      affiliateCode: uniqueCode,
      balance: 0,
      totalEarnings: 0,
      isMetaInjectorUser: isMetaUser || false,
      metaInjectorID: metaUserDetail || "N/A",
      createdAt: new Date().toISOString()
    });

    const mailOptions = {
        from: `"Meta Injector Pro" <${process.env.SMTP_EMAIL}>`,
        to: email,
        subject: '🎉 Welcome to Meta Injector Affiliate Program!',
        html: `
        <div style="font-family: Arial, sans-serif; background-color: #0F0A1E; padding: 40px; color: white;">
            <div style="max-width: 600px; margin: auto; background-color: #1A1625; padding: 30px; border-radius: 15px; border: 1px solid #A073EE;">
                <h2 style="color: #ffffff; text-align: center;">Account Created Successfully! 🚀</h2>
                <p style="color: #b3b3b3;">Hello ${firstName},</p>
                <p style="color: #b3b3b3;">Your affiliate account is ready.</p>
                <div style="background: rgba(160, 115, 238, 0.1); padding: 15px; border-radius: 10px; margin: 20px 0;">
                    <p style="margin: 5px 0;"><strong>Your Affiliate ID:</strong> <span style="color: #A073EE; font-size: 20px; font-weight: bold;">${uniqueCode}</span></p>
                </div>
                <div style="text-align: center; margin-top: 30px;">
                    <a href="https://metainjector.pro/login.html" style="background: linear-gradient(90deg, #A073EE, #fd297b); color: white; padding: 12px 30px; text-decoration: none; border-radius: 50px; font-weight: bold;">Login to Dashboard</a>
                </div>
            </div>
        </div>`
    };

    try { await transporter.sendMail(mailOptions); } catch (e) { console.error("Email Error:", e); }

    return { statusCode: 200, body: JSON.stringify({ message: "Account created successfully", code: uniqueCode }) };

  } catch (error) {
    // যদি Firebase Auth থেকে "email already in use" এরর আসে
    if (error.code === 'auth/email-already-exists') {
        return { statusCode: 400, body: JSON.stringify({ error: "Email already exists in our system." }) };
    }
    return { statusCode: 400, body: JSON.stringify({ error: error.message }) };
  }
};
