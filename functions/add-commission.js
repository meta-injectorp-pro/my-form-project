const { admin, db } = require("./firebase-admin");

exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  const { refCode, amount, orderId, packageType, licenseKey } = JSON.parse(event.body);

  if (!refCode || !amount || !packageType || !licenseKey) {
      return { statusCode: 400, body: "Missing Data" };
  }

  const commissionTable = {
      'Starter': 50,
      'Beginner': 60,
      'Professional': 70,
      'Ultimate': 80,
      'Corporate': 90,
      'Enterprise': 100
  };

  const commission = commissionTable[packageType] || 0;

  if (commission === 0) {
      return { statusCode: 200, body: JSON.stringify({ message: "No commission for this package" }) };
  }

  try {
    const usersRef = db.collection("Affiliate_Data");
    const snapshot = await usersRef.where("affiliateCode", "==", refCode).limit(1).get();

    if (snapshot.empty) return { statusCode: 404, body: "Affiliate not found" };

    const affiliateDoc = snapshot.docs[0];
    const userRef = db.collection("Affiliate_Data").doc(affiliateDoc.id);

    const historyRef = userRef.collection("Earnings").doc();
    
    const calculatedPercent = ((commission / amount) * 100).toFixed(2); 

    await historyRef.set({
        amount: commission,
        refCode: refCode,
        orderId: orderId,
        licenseKey: licenseKey,
        packageType: packageType,
        packagePrice: amount,
        commissionRate: `${calculatedPercent}% (৳${commission})`, 
        status: "Pending",
        date: new Date().toISOString()
    });

    return { statusCode: 200, body: JSON.stringify({ message: "Commission Recorded as Pending", commission }) };

  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

};
