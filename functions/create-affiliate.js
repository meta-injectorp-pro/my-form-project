const { admin, db } = require("./firebase-admin");
const nodemailer = require('nodemailer');

// ১. ইমেইল সেটআপ
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { 
        user: process.env.SMTP_EMAIL, 
        pass: process.env.SMTP_PASSWORD 
    }
});

exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  const { firstName, lastName, email, phone, password, isMetaUser, metaUserDetail } = JSON.parse(event.body);
  const fullName = `${firstName} ${lastName}`;

  try {
    // ২. ফায়ারবেসে ইউজার তৈরি
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      displayName: fullName
    });

    const uniqueCode = "META" + Math.floor(1000 + Math.random() * 9000);

    // ৩. ডেটাবেসে তথ্য সেভ
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

    // ৪. ওয়েলকাম ইমেইল পাঠানো (শুধুমাত্র অ্যাকাউন্ট তৈরির কনফার্মেশন)
    const mailOptions = {
        from: `"Meta Injector Pro" <${process.env.SMTP_EMAIL}>`,
        to: email,
        subject: '🎉 Welcome to Meta Injector Affiliate Program!',
        html: `
        <div style="font-family: Arial, sans-serif; background-color: #0F0A1E; padding: 40px; color: white;">
            <div style="max-width: 600px; margin: auto; background-color: #1A1625; padding: 30px; border-radius: 15px; border: 1px solid #A073EE;">
                <h2 style="color: #ffffff; text-align: center;">Account Created Successfully! 🚀</h2>
                <p style="color: #b3b3b3; font-size: 16px;">Hello ${firstName},</p>
                <p style="color: #b3b3b3; font-size: 16px;">Congratulations! Your affiliate account has been successfully created.</p>
                
                <div style="background: rgba(160, 115, 238, 0.1); padding: 15px; border-radius: 10px; margin: 20px 0;">
                    <p style="margin: 5px 0;"><strong>Username/Email:</strong> ${email}</p>
                    <p style="margin: 5px 0;"><strong>Affiliate ID:</strong> ${uniqueCode}</p>
                </div>

                <p style="color: #b3b3b3;">You can now login to your dashboard and start earning commission.</p>
                
                <div style="text-align: center; margin-top: 30px;">
                    <a href="https://metainjector.pro/login.html" style="background: linear-gradient(90deg, #A073EE, #fd297b); color: white; padding: 12px 30px; text-decoration: none; border-radius: 50px; font-weight: bold;">Login to Dashboard</a>
                </div>
            </div>
        </div>`
    };

    try { await transporter.sendMail(mailOptions); } catch (e) { console.error("Email Error:", e); }

    return { statusCode: 200, body: JSON.stringify({ message: "Account created successfully" }) };

  } catch (error) {
    return { statusCode: 400, body: JSON.stringify({ error: error.message }) };
  }
};