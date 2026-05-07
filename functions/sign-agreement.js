const { admin, db } = require("./firebase-admin");

exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  const token = event.headers.authorization?.split("Bearer ")[1];
  if (!token) return { statusCode: 401, body: "Unauthorized" };

  try {
    // 👇 ফ্রন্টএন্ড থেকে সিগনেচারের পাশাপাশি নাম, ইমেইল ও ফোন রিসিভ করা হচ্ছে
    const { signature, signedName, signedEmail, signedPhone } = JSON.parse(event.body);
    
    if (!signature) return { statusCode: 400, body: JSON.stringify({ error: "Signature missing" }) };

    const decodedToken = await admin.auth().verifyIdToken(token);
    const uid = decodedToken.uid;

    // 👇 ইউজারের ডকুমেন্টে সিগনেচার এবং অন্যান্য ইনফো সেভ হচ্ছে
    await db.collection("Affiliate_Data").doc(uid).update({
        signatureData: signature,
        signedName: signedName || "",
        signedEmail: signedEmail || "",
        signedPhone: signedPhone || "",
        agreedAt: new Date().toISOString()
    });

    return { statusCode: 200, body: JSON.stringify({ message: "Success" }) };

  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};