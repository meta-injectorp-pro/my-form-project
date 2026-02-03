const { admin, db } = require("./firebase-admin");

exports.handler = async (event, context) => {
  const token = event.headers.authorization?.split("Bearer ")[1];
  if (!token) return { statusCode: 401, body: "Unauthorized" };

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    const uid = decodedToken.uid;

    // ⚠️ পরিবর্তন: সাব-কালেকশন থেকে ডাটা আনা
    const earningsSnapshot = await db.collection("Affiliate_Data")
      .doc(uid)
      .collection("Earnings")
      .orderBy("date", "desc")
      .get();

    const earnings = [];
    earningsSnapshot.forEach(doc => earnings.push({ id: doc.id, ...doc.data() }));

    return { statusCode: 200, body: JSON.stringify(earnings) };

  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};