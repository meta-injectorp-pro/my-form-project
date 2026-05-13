// functions/restore-user.js
const admin = require("firebase-admin");

exports.handler = async (event, context) => {
  try {
    // ১. আপনার দেওয়া নিয়মে Firebase Admin ইনিশিয়ালাইজ করা
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        })
      });
    }

    // ২. আপনার হারানো ইউজারের তথ্য এখানে দিন
    const oldUid = "k2lR7pQwiGX8LZTC6uoVSS4LvVe2"; 
    const userEmail = "gmrubel5000@gmail.com"; // ইউজারের ইমেইল
    const userPassword = "gmrubel5000@gmail.com"; // যেকোনো একটি নতুন পাসওয়ার্ড দিন

    // ৩. নির্দিষ্ট UID দিয়ে অ্যাকাউন্ট তৈরি করা হচ্ছে
    const userRecord = await admin.auth().createUser({
      uid: oldUid,
      email: userEmail,
      password: userPassword,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: "Success! User restored perfectly.", 
        uid: userRecord.uid,
        email: userRecord.email
      })
    };

  } catch (error) {
    console.error("Restore Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
