const { admin, db } = require("./firebase-admin");

exports.handler = async (event, context) => {
  // ১. শুধু POST মেথড এক্সেপ্ট করা হবে (ব্রাউজার থেকে যখন কল হবে)
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { ref } = JSON.parse(event.body);

    // ২. রেফারেল কোড না থাকলে এরর রিটার্ন
    if (!ref) {
      return { 
        statusCode: 400, 
        body: JSON.stringify({ error: "Referral code is required" }) 
      };
    }

    // ৩. ডাটাবেসে এই কোডটি কোন ইউজারের তা খুঁজে বের করা
    const snapshot = await db.collection("Affiliate_Data")
                             .where("affiliateCode", "==", ref)
                             .get();

    // যদি কোড ভুল হয় বা ইউজার না পাওয়া যায়
    if (snapshot.empty) {
      return { 
        statusCode: 404, 
        body: JSON.stringify({ error: "Invalid Referral Code" }) 
      };
    }

    // ৪. ইউজারের ডকুমেন্ট আইডি নেওয়া
    const userDocId = snapshot.docs[0].id;
    
    // ৫. ক্লিক সংখ্যা ১ বাড়িয়ে দেওয়া (Atomic Increment)
    // এটি আগের সংখ্যার সাথে ১ যোগ করবে (যেমন: ০ -> ১, ১ -> ২)
    await db.collection("Affiliate_Data").doc(userDocId).update({
      totalClicks: admin.firestore.FieldValue.increment(1)
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Click tracked successfully" })
    };

  } catch (error) {
    console.error("Tracking Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error" })
    };
  }
};