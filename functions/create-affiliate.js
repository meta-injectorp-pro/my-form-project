const { admin, db } = require("./firebase-admin");

exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  const { firstName, lastName, email, phone, password, isMetaUser, metaUserDetail } = JSON.parse(event.body);
  const fullName = `${firstName} ${lastName}`;

  try {
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      displayName: fullName
    });

    const uniqueCode = "META" + Math.floor(1000 + Math.random() * 9000);


    await db.collection("Affiliate_Data").doc(userRecord.uid).set({
      uid: userRecord.uid,
      firstName: firstName,
      lastName: lastName,
      name: fullName,
      email: email,
      phone: phone || "N/A",
      affiliateCode: uniqueCode,
      balance: 0,
      totalEarnings: 0,
      isMetaInjectorUser: isMetaUser || false,
      metaInjectorID: metaUserDetail || "N/A",
      createdAt: new Date().toISOString()
    });

    return { statusCode: 200, body: JSON.stringify({ message: "Account created successfully" }) };

  } catch (error) {
    return { statusCode: 400, body: JSON.stringify({ error: error.message }) };
  }
};