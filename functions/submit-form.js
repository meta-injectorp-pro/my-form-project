exports.handler = async (event) => {
  // আপনার Google Apps Script এর Web App URL টি এখানে পেস্ট করুন
  const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxk37CBFijTT9ATxYnaegOj2vGtECz8hfJuEbGpWiLfp8HB6SbY9RyHgAkYzL6xWc0ugg/exec';

  // লগ: ফাংশনটি চালু হয়েছে এবং ডেটা পেয়েছে
  console.log("Function invoked. Received data:", event.body);

  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: event.body, // সরাসরি প্রাপ্ত ডেটা ফরওয়ার্ড করা হচ্ছে
    });

    // গুগল থেকে কী উত্তর এলো তা টেক্সট হিসেবে পড়া হচ্ছে
    const responseText = await response.text();
    
    // লগ: গুগল থেকে প্রাপ্ত উত্তর
    console.log("Received response from Google Apps Script. Status:", response.status);
    console.log("Response body from Google:", responseText);

    if (!response.ok) {
      // যদি গুগল কোনো এরর স্ট্যাটাস পাঠায় (যেমন 404, 500)
      throw new Error(`Google Script returned an error: ${response.status}`);
    }

    // সফল হলে ব্রাউজারে সফল উত্তর পাঠানো হচ্ছে
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Success' }),
    };

  } catch (error) {
    // কোনো ভুল হলে সেটি লগ করা হচ্ছে
    console.error("Error during fetch to Google Apps Script:", error);
    
    // ব্রাউজারে এরর মেসেজ পাঠানো হচ্ছে
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
