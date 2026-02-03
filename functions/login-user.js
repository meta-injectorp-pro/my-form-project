const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  const { email, password } = JSON.parse(event.body);
  const apiKey = process.env.FIREBASE_WEB_API_KEY; // Netlify থেকে কি (Key) নিচ্ছে

  try {
    // Google Identity Toolkit API ব্যবহার করে লগইন চেক করা
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email,
        password: password,
        returnSecureToken: true
      })
    });

    const data = await response.json();

    if (data.error) {
      return { statusCode: 400, body: JSON.stringify({ error: "Invalid Email or Password" }) };
    }

    // সফল হলে টোকেন ফেরত পাঠানো
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