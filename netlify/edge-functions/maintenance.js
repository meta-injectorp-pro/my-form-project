export default async (request, context) => {
  const url = new URL(request.url);

  // ১. সিক্রেট লিংক সিস্টেম (পরিবর্তনযোগ্য)
  // আপনি ব্রাউজারে লিখবেন: yoursite.com/my-secret-entry
  if (url.pathname === "/140072") {
    
    // কুকি সেট করা হচ্ছে
    const response = new Response(null, {
      status: 302, // Redirect to Home
      headers: {
        Location: "/", // হোম পেজে পাঠিয়ে দেবে
      },
    });

    context.cookies.set({
      name: "bypass_maintenance",
      value: "true",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // ৩০ দিন ভ্যালিড থাকবে
    });

    return response;
  }

  // ২. যদি কুকি থাকে, তাহলে সাইট দেখাবে
  const cookie = context.cookies.get("bypass_maintenance");
  if (cookie) {
    return context.next();
  }

  // ৩. বাকি সব ইউজারদের জন্য মেইনটেনেন্স পেজ
  // CSS/Images/JS ফাইলগুলো যেন ব্লক না হয়
  if (url.pathname.match(/\.(css|js|png|jpg|jpeg|svg|ico|json|woff2)$/)) {
    return context.next();
  }

  return context.rewrite("/maintenance.html");
};