const { admin, db } = require("./firebase-admin");

exports.handler = async (event, context) => {
  const token = event.headers.authorization?.split("Bearer ")[1];
  if (!token) return { statusCode: 401, body: "Unauthorized" };

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    const uid = decodedToken.uid;

    const snapshot = await db.collection("Affiliate_Data")
      .doc(uid)
      .collection("Withdrawals")
      .orderBy("requestDate", "desc")
      .get();

    const payments = [];
    snapshot.forEach(doc => payments.push({ id: doc.id, ...doc.data() }));

    return { statusCode: 200, body: JSON.stringify(payments) };

  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};