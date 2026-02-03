const { admin, db } = require("./firebase-admin");

exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  const { refCode, amount, orderId, packageType } = JSON.parse(event.body);

  if (!refCode || !amount || !packageType) {
    return { statusCode: 400, body: "Missing Data" };
  }

  let commissionRate = 0;
  if (packageType === 'Starter') commissionRate = 0.33;
  else if (packageType === 'Beginner') commissionRate = 0.30;
  else return { statusCode: 200, body: JSON.stringify({ message: "No commission for this package" }) };

  try {
    // ✅ Change: Searching in Affiliate_Data
    const usersRef = db.collection("Affiliate_Data");
    const snapshot = await usersRef.where("affiliateCode", "==", refCode).limit(1).get();

    if (snapshot.empty) {
      return { statusCode: 404, body: "Affiliate not found" };
    }

    const affiliateDoc = snapshot.docs[0];
    const affiliateId = affiliateDoc.id;
    const commission = Math.floor(amount * commissionRate);

    if (commission > 0) {
        await db.runTransaction(async (t) => {
          const userRef = db.collection("Affiliate_Data").doc(affiliateId);
          const doc = await t.get(userRef);
          const currentBalance = doc.data().balance || 0;
          const currentEarnings = doc.data().totalEarnings || 0;

          // ব্যালেন্স আপডেট
          t.update(userRef, { 
            balance: currentBalance + commission,
            totalEarnings: currentEarnings + commission
          });

          // ✅ Change: Saving history inside the user's sub-collection 'Earnings'
          const historyRef = userRef.collection("Earnings").doc(); 
          t.set(historyRef, {
            amount: commission,
            orderId: orderId,
            packageType: packageType,
            packagePrice: amount,
            commissionRate: (commissionRate * 100) + "%",
            date: new Date().toISOString()
          });
        });
    }

    return { statusCode: 200, body: JSON.stringify({ message: "Commission Added", commission }) };

  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};