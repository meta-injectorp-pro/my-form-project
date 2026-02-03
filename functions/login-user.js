// functions/login-user.js (Debug Version)
const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  const { email, password } = JSON.parse(event.body);
  const apiKey = process.env.FIREBASE_WEB_API_KEY;

  try {
    // functions/login-user.js এর fetch অংশটি এভাবে আপডেট করুন:

    const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "password", // এটি নতুন
        username: email,        // এখানে email কে username বলা হয়
        password: password
      })
    });

    const data = await response.json();

    // 🔴 ডিবাগিং: আসল এরর দেখা
    if (data.error) {
      console.log("Detailed Error:", JSON.stringify(data.error));
      return { 
        statusCode: 400, 
        body: JSON.stringify({ 
          error: `GOOGLE SAYS: ${data.error.message}` 
        }) 
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        idToken: data.idToken,
        localId: data.localId,
        expiresIn: data.expiresIn
      })
    };

  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: `SYSTEM ERROR: ${error.message}` }) };
  }
};

