const { admin, db } = require("./firebase-admin");

exports.handler = async (event, context) => {
  // ১. হেডার থেকে টোকেন চেক করা
  const token = event.headers.authorization?.split("Bearer ")[1];
  if (!token) return { statusCode: 401, body: "Unauthorized" };

  try {
    // ২. টোকেন ভেরিফাই করা (ইনি কি আসল ইউজার?)
    const decodedToken = await admin.auth().verifyIdToken(token);
    const uid = decodedToken.uid;

    // ৩. ডেটাবেস থেকে সিকিউর ডেটা আনা
    const userDoc = await db.collection("users").doc(uid).get();
    
    if (!userDoc.exists) {
        return { statusCode: 404, body: "User data not found" };
    }

    const userData = userDoc.data();

    return {
      statusCode: 200,
      body: JSON.stringify({
        name: userData.name,
        balance: userData.balance,
        totalEarnings: userData.totalEarnings,
        affiliateCode: userData.affiliateCode
      })
    };

  } catch (error) {
    return { statusCode: 403, body: JSON.stringify({ error: "Invalid Token" }) };
  }
};