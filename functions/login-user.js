// functions/login-user.js

exports.handler = async (event, context) => {
  // ১. শুধু POST রিকোয়েস্ট এক্সেপ্ট করবে
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { email, password } = JSON.parse(event.body);
    
    // Netlify থেকে সিক্রেট কি (Key) নেওয়া হচ্ছে
    const apiKey = process.env.FIREBASE_WEB_API_KEY;

    // যদি API Key না থাকে
    if (!apiKey) {
      console.error("API Key Missing in Netlify Environment Variables");
      return { 
        statusCode: 500, 
        body: JSON.stringify({ error: "Server Configuration Error: API Key Missing" }) 
      };
    }

    // ২. Google Identity API কল করা (Native Fetch দিয়ে)
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

    // ৩. যদি লগইন ফেইল করে
    if (!response.ok) {
        let errorMsg = "Login failed";
        if (data.error && data.error.message) {
             // এরর মেসেজ সহজ করা
            if (data.error.message.includes("EMAIL_NOT_FOUND")) errorMsg = "User not found";
            else if (data.error.message.includes("INVALID_PASSWORD")) errorMsg = "Incorrect password";
            else if (data.error.message.includes("TOO_MANY_ATTEMPTS")) errorMsg = "Too many failed attempts";
            else errorMsg = data.error.message;
        }
        return { statusCode: 400, body: JSON.stringify({ error: errorMsg }) };
    }

    // ৪. সফল হলে টোকেন পাঠানো
    return {
      statusCode: 200,
      body: JSON.stringify({
        token: data.idToken,
        email: data.email,
        localId: data.localId
      }),
    };

  } catch (error) {
    console.error("Function Error:", error);
    return { 
        statusCode: 500, 
        body: JSON.stringify({ error: "Internal Server Error: Check Netlify Logs" }) 
    };
  }
};
