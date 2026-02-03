const { admin, db } = require("./firebase-admin");

exports.handler = async (event, context) => {
  // মেথড চেক (শুধু POST রিকোয়েস্ট এক্সেপ্ট করবে)
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { email, password, name } = JSON.parse(event.body);

  try {
    // ১. অথেনটিকেশনে ইউজার তৈরি
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      displayName: name
    });

    // ২. র‍্যান্ডম অ্যাফিলিয়েট কোড তৈরি (যেমন: META9382)
    const uniqueCode = "META" + Math.floor(1000 + Math.random() * 9000);

    // ৩. ডেটাবেসে ইউজারের তথ্য সেভ (ব্যালেন্স ০ দিয়ে শুরু)
    await db.collection("users").doc(userRecord.uid).set({
      uid: userRecord.uid,
      name: name,
      email: email,
      affiliateCode: uniqueCode,
      balance: 0,
      totalEarnings: 0,
      createdAt: new Date().toISOString()
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Account created successfully" })
    };

  } catch (error) {
    return { statusCode: 400, body: JSON.stringify({ error: error.message }) };
  }
};