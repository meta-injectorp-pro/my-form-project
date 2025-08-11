exports.handler = async (event) => {
  // আপনার Google Apps Script এর Web App URL টি এখানে পেস্ট করুন
  const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxk37CBFijTT9ATxYnaegOj2vGtECz8hfJuEbGpWiLfp8HB6SbY9RyHgAkYzL6xWc0ugg/exec';

  const formData = JSON.parse(event.body);

  try {
    await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Success' }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to forward request' }),
    };
  }
};
