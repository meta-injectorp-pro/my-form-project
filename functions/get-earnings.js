const { admin, db } = require("./firebase-admin");

exports.handler = async (event, context) => {
  const token = event.headers.authorization?.split("Bearer ")[1];
  if (!token) return { statusCode: 401, body: "Unauthorized" };

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    const uid = decodedToken.uid;

    // আর্নিং হিস্টোরি ডেটাবেস থেকে আনা
    const earningsSnapshot = await db.collection("earnings")
      .where("affiliateId", "==", uid)
      .orderBy("date", "desc")
      .get();

    const earnings = [];
    earningsSnapshot.forEach(doc => {
      earnings.push({ id: doc.id, ...doc.data() });
    });

    return {
      statusCode: 200,
      body: JSON.stringify(earnings)
    };

  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};