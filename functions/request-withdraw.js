const { admin, db } = require("./firebase-admin");

exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  const token = event.headers.authorization?.split("Bearer ")[1];
  if (!token) return { statusCode: 401, body: "Unauthorized" };

  const { amount, method, accountNumber } = JSON.parse(event.body);
  const withdrawAmount = parseInt(amount);

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    const uid = decodedToken.uid;
    const userRef = db.collection("users").doc(uid);

    // ১. ট্রানজ্যাকশন শুরু (যাতে একই সময়ে দুইবার টাকা তুলতে না পারে)
    await db.runTransaction(async (t) => {
      const doc = await t.get(userRef);
      const currentBalance = doc.data().balance || 0;

      if (currentBalance < withdrawAmount) {
        throw new Error("Insufficient Balance");
      }

      // ব্যালেন্স কমানো
      t.update(userRef, { balance: currentBalance - withdrawAmount });

      // উইথড্র রিকোয়েস্ট তৈরি
      const withdrawRef = db.collection("withdrawals").doc();
      t.set(withdrawRef, {
        uid: uid,
        amount: withdrawAmount,
        method: method,
        accountNumber: accountNumber,
        status: "Pending",
        requestDate: new Date().toISOString()
      });
    });

    return { statusCode: 200, body: JSON.stringify({ message: "Withdrawal Successful" }) };

  } catch (error) {
    return { statusCode: 400, body: JSON.stringify({ error: error.message }) };
  }
};