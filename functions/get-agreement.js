const { admin, db } = require("./firebase-admin");

exports.handler = async (event, context) => {
  const token = event.headers.authorization?.split("Bearer ")[1];
  if (!token) return { statusCode: 401, body: "Unauthorized" };

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    const uid = decodedToken.uid;

    // ডাটাবেস থেকে সরাসরি নির্দিষ্ট ইউজারের ডকুমেন্ট ফেচ করা
    const userDoc = await db.collection("Affiliate_Data").doc(uid).get();
    
    if (!userDoc.exists) {
        return { statusCode: 404, body: JSON.stringify({ error: "User not found" }) };
    }

    const userData = userDoc.data();

    return {
      statusCode: 200,
      body: JSON.stringify({
        // ইউজারের ডকুমেন্টে agreementText ফিল্ড থাকলে সেটা পাঠাবে, না থাকলে null
        agreementText: userData.agreementText || null, 
        
        // সিগনেচার করা থাকলে true, না থাকলে false
        hasSigned: !!userData.signatureData, 
        signatureImage: userData.signatureData || null,
        signedAt: userData.agreedAt || null,
        
        // 👇 নতুন ফিল্ডগুলো অ্যাড করা হলো
        signedName: userData.signedName || null,
        signedEmail: userData.signedEmail || null,
        signedPhone: userData.signedPhone || null
      })
    };

  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};