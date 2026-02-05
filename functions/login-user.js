// functions/login-user.js
const fetch = require('node-fetch'); // নিশ্চিত করুন node-fetch ইন্সটল করা আছে, না থাকলে `npm install node-fetch` দিন

exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { email, password } = JSON.parse(event.body);
    s
    // Netlify Environment Variable থেকে গোপন কি (Key) নিচ্ছে
    const apiKey = process.env.FIREBASE_WEB_API_KEY;

    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: "Configuration Error" }) };
    }

    // 🔥 সার্ভার সাইড থেকে Google Identity API কল করা হচ্ছে
    // এটি ইউজারের ব্রাউজারে লোড হয় না, তাই কেউ হ্যাক করতে পারবে না
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: email,
            password: password,
            returnSecureToken: true
        })
    });

    const data = await response.json();

    if (!response.ok) {
        let errorMsg = "Login failed";
        // এরর মেসেজ ক্লিন করা হচ্ছে যাতে ইউজার টেকনিক্যাল এরর না দেখে
        if (data.error && data.error.message) {
            if (data.error.message.includes("EMAIL_NOT_FOUND")) errorMsg = "User not found";
            else if (data.error.message.includes("INVALID_PASSWORD")) errorMsg = "Incorrect password";
            else if (data.error.message.includes("TOO_MANY_ATTEMPTS")) errorMsg = "Too many failed attempts";
            else errorMsg = data.error.message;
        }
        return { statusCode: 400, body: JSON.stringify({ error: errorMsg }) };
    }

    // সফল হলে শুধু টোকেন ফ্রন্টএন্ডে পাঠাবে
    return {
      statusCode: 200,
      body: JSON.stringify({
        token: data.idToken,
        localId: data.localId,
        email: data.email
      }),
    };

  } catch (error) {
    console.error("Server Error:", error);
    return { statusCode: 500, body: JSON.stringify({ error: "Internal Server Error" }) };
  }
};
