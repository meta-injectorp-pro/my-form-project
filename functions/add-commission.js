const { admin, db } = require("./firebase-admin");

exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  // ১. প্যাকেজ টাইপ রিসিভ করা
  const { refCode, amount, orderId, packageType } = JSON.parse(event.body);

  if (!refCode || !amount || !packageType) {
    return { statusCode: 400, body: "Missing Data" };
  }

  // ২. প্যাকেজ অনুযায়ী কমিশন রেট নির্ধারণ
  let commissionRate = 0;

  if (packageType === 'Starter') {
      commissionRate = 0.33; // Starter প্যাকেজে ৩৩%
  } else if (packageType === 'Beginner') {
      commissionRate = 0.30; // Beginner প্যাকেজে ৩০%
  } else {
      // অন্য কোনো প্যাকেজ হলে কমিশন ০ (নিরাপত্তার খাতিরে ডাবল চেক)
      return { statusCode: 200, body: JSON.stringify({ message: "No commission for this package" }) };
  }

  try {
    const usersRef = db.collection("users");
    const snapshot = await usersRef.where("affiliateCode", "==", refCode).limit(1).get();

    if (snapshot.empty) {
      return { statusCode: 404, body: "Affiliate not found" };
    }

    const affiliateDoc = snapshot.docs[0];
    const affiliateId = affiliateDoc.id;

    // ৩. টাকার অংক হিসাব করা (Amount * Rate)
    const commission = Math.floor(amount * commissionRate);

    if (commission > 0) {
        await db.runTransaction(async (t) => {
          const userRef = db.collection("users").doc(affiliateId);
          const doc = await t.get(userRef);
          const currentBalance = doc.data().balance || 0;
          const currentEarnings = doc.data().totalEarnings || 0;

          // ব্যালেন্স আপডেট
          t.update(userRef, { 
            balance: currentBalance + commission,
            totalEarnings: currentEarnings + commission
          });

          // আর্নিং হিস্টোরি সেভ (প্যাকেজ টাইপ সহ)
          const historyRef = db.collection("earnings").doc();
          t.set(historyRef, {
            affiliateId: affiliateId,
            amount: commission,
            orderId: orderId,
            packageType: packageType, // প্যাকেজের নাম সেভ থাকবে
            packagePrice: amount,
            commissionRate: (commissionRate * 100) + "%", // যেমন "33%"
            date: new Date().toISOString()
          });
        });
    }

    return { statusCode: 200, body: JSON.stringify({ message: "Commission Added", commission }) };

  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};