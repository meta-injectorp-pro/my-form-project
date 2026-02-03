const { admin, db } = require("./firebase-admin");

exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  const { refCode, amount, orderId, packageType, licenseKey } = JSON.parse(event.body);

  // লাইসেন্স কি ছাড়া ডাটা সেভ হবে না
  if (!refCode || !amount || !packageType || !licenseKey) {
      return { statusCode: 400, body: "Missing Data" };
  }

  let commissionRate = 0;
  if (packageType === 'Starter') commissionRate = 0.33;
  else if (packageType === 'Beginner') commissionRate = 0.30;
  else return { statusCode: 200, body: JSON.stringify({ message: "No commission for this package" }) };

  try {
    const usersRef = db.collection("Affiliate_Data");
    const snapshot = await usersRef.where("affiliateCode", "==", refCode).limit(1).get();

    if (snapshot.empty) return { statusCode: 404, body: "Affiliate not found" };

    const affiliateDoc = snapshot.docs[0];
    // ইউজারের ID টা নেওয়া হলো যাতে তার সাব-কালেকশনে রাখা যায়
    const userRef = db.collection("Affiliate_Data").doc(affiliateDoc.id);

    const commission = Math.floor(amount * commissionRate);

    if (commission > 0) {
        // ⚠️ পরিবর্তন: এখন আর ব্যালেন্স আপডেট হচ্ছে না, শুধু রেকর্ড রাখা হচ্ছে
        const historyRef = userRef.collection("Earnings").doc();
        
        await historyRef.set({
            amount: commission,
            orderId: orderId,         // ট্রানজেকশন আইডি বা ফোন নম্বর
            licenseKey: licenseKey,   // 🔑 এই লাইসেন্স কি দিয়ে আপনি ট্র্যাক করবেন
            packageType: packageType,
            packagePrice: amount,
            commissionRate: (commissionRate * 100) + "%",
            status: "Pending",        // ⚠️ স্ট্যাটাস পেন্ডিং থাকবে
            date: new Date().toISOString()
        });
    }

    return { statusCode: 200, body: JSON.stringify({ message: "Commission Recorded as Pending" }) };

  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};