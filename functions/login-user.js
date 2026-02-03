// functions/login-user.js (আগের সঠিক ভার্সন)
const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  const { email, password } = JSON.parse(event.body);
  const apiKey = process.env.FIREBASE_WEB_API_KEY;

  try {
    // 👇 আবার আগের URL-এ ফিরে আসলাম
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    });

    const data = await response.json();

    if (data.error) {
      console.log("Login Error:", data.error.message);
      return { 
        statusCode: 400, 
        body: JSON.stringify({ error: data.error.message }) 
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
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
