const { admin, db } = require("./firebase-admin");

exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  const token = event.headers.authorization?.split("Bearer ")[1];
  if (!token) return { statusCode: 401, body: "Unauthorized" };

  const { amount, method, accountNumber } = JSON.parse(event.body);
  const withdrawAmount = parseInt(amount);

  if (!withdrawAmount || withdrawAmount <= 0) {
      return { statusCode: 400, body: JSON.stringify({ error: "Invalid amount. Please enter a valid number." }) };
  }

  if (withdrawAmount < 50) {
      return { statusCode: 400, body: JSON.stringify({ error: "Minimum withdrawal amount is 50 Tk." }) };
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    const uid = decodedToken.uid;

    const userRef = db.collection("Affiliate_Data").doc(uid);

    await db.runTransaction(async (t) => {
      const doc = await t.get(userRef);

      if (!doc.exists) {
          throw new Error("User profile not found");
      }

      const currentBalance = doc.data().balance || 0;

      if (currentBalance < withdrawAmount) {
          throw new Error("Insufficient Balance. You cannot withdraw more than you have.");
      }

      t.update(userRef, { balance: currentBalance - withdrawAmount });

      const withdrawRef = userRef.collection("Withdrawals").doc();
      t.set(withdrawRef, {
        amount: withdrawAmount,
        method: method,
        accountNumber: accountNumber,
        status: "Pending",
        requestDate: new Date().toISOString()
      });
    });

    return { statusCode: 200, body: JSON.stringify({ message: "Withdrawal Request Successful" }) };

  } catch (error) {
    console.error("Withdraw Error:", error);
    return { statusCode: 400, body: JSON.stringify({ error: error.message }) };
  }
};
