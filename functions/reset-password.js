// functions/reset-password.js

exports.handler = async (event, context) => {
  // শুধু POST রিকোয়েস্ট এক্সেপ্ট করবে
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { email } = JSON.parse(event.body);
    
    // Netlify Environment Variable থেকে গোপন কি (Key) নিচ্ছে
    const apiKey = process.env.FIREBASE_WEB_API_KEY;

    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: "Server Configuration Error: API Key Missing" }) };
    }

    // 🔥 Google Identity API কল (Password Reset এর জন্য)
    // এটি সম্পূর্ণ ফ্রি এবং নিরাপদ
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            requestType: "PASSWORD_RESET", // এই ফ্ল্যাগটি জরুরি
            email: email
        })
    });

    const data = await response.json();

    if (!response.ok) {
        let errorMsg = "Failed to send reset email";
        // এরর মেসেজ ক্লিন করা
        if (data.error && data.error.message) {
            if (data.error.message.includes("EMAIL_NOT_FOUND")) errorMsg = "Email address not found.";
            else errorMsg = data.error.message;
        }
        return { statusCode: 400, body: JSON.stringify({ error: errorMsg }) };
    }

    // সফল হলে
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Password reset email sent!" }),
    };

  } catch (error) {
    console.error("Reset Error:", error);
    return { statusCode: 500, body: JSON.stringify({ error: "Internal Server Error" }) };
  }
};